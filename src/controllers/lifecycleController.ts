import { loadingSpinnerController } from './loadingSpinnerController';
import { toastController } from './toastController';
import { weatherProviderModel } from '../models/weatherProviderModel';
import { syncAppWithServerAction, ApiMismatchError, IndexLoadError, LocationLoadError, OverlayLoadError, updateOverlayForTimestampAction, loadWeatherDataForLocationAction } from './actions';
import { updateStationsOnMapAction } from './updateStationsOnMapAction';
import { updateSpecialDataOnMapAction } from './updateSpecialDataOnMapAction';
import { logger } from '../utils/logger';
import { storage } from '../utils/storage';
import type { Map as LeafletMap } from 'leaflet';

const POLL_INTERVAL_MS = 5 * 60 * 1000;

let isSyncing = false;
let isInitialized = false;
let pollTimer: number | null = null;
let appMap: LeafletMap | null = null;

function startPolling() {
  if (pollTimer !== null) clearInterval(pollTimer);
  logger.info('⏰ Polling started.');
  pollTimer = window.setInterval(async () => {
    logger.debug('⏰ Regular background poll triggered.');
    await safeSyncApp();
    await updateStationsOnMap();
  }, POLL_INTERVAL_MS);
}

function stopPolling() {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
    logger.info('🛑 Polling stopped (app hidden).');
  }
}

async function safeSyncApp(isInitial = false, forceArg = false, prevActiveTimestamp: string | null = null) {
  logger.debug(`diagnostic: safeSyncApp called (isInitial=${isInitial}) - isSyncing=${isSyncing}, isInitialized=${isInitialized}`);
  if (isSyncing) {
    logger.debug('Sync blocked: another sync process is already running.');
    return;
  }

  isSyncing = true;
  logger.info('🔄 App sync started...');

  const computedForce = !!(
    weatherProviderModel.indexLoadError ||
    weatherProviderModel.pointDataLoadError ||
    weatherProviderModel.overlayLoadError
  );
  const force = forceArg || computedForce;

  weatherProviderModel.setStartupError(null);
  weatherProviderModel.setIndexLoadError(null);
  weatherProviderModel.setPointDataLoadError(null);
  weatherProviderModel.setOverlayLoadError(null);

  try {
    await loadingSpinnerController.track(
      () => syncAppWithServerAction(!isInitial, force, prevActiveTimestamp),
      isInitial ? { modal: true } : undefined
    );
    isInitialized = true;
  } catch (error: unknown) {
    logger.error('Error during app sync:', error);
    const errMsg = error instanceof Error ? error.message : String(error);
    const isApiMismatch = error instanceof ApiMismatchError;

    if (isApiMismatch) {
      const version = (error as ApiMismatchError).version || '';
      weatherProviderModel.setApiMismatchError(`A new App version is available (v${version}).\n\nPlease reload the page to use the application as usual.`);
    } else if (error instanceof IndexLoadError) {
      weatherProviderModel.setIndexLoadError((error as IndexLoadError).detail ?? errMsg);
    } else if (error instanceof LocationLoadError) {
      weatherProviderModel.setPointDataLoadError((error as LocationLoadError).detail ?? errMsg);
    } else if (error instanceof OverlayLoadError) {
      weatherProviderModel.setOverlayLoadError((error as OverlayLoadError).detail ?? errMsg);
    }

    if (!isApiMismatch) {
      if (isInitial) {
        weatherProviderModel.setStartupError('Error during application synchronization: ' + errMsg);
      } else {
        toastController.showToast({
          message: 'Background sync failed: ' + errMsg
        }, 5000);
      }
    }
  }

  isSyncing = false;
}

async function triggerSyncAndPoll(force = false, prevActiveTimestamp: string | null = null) {
  startPolling();
  await safeSyncApp(false, force, prevActiveTimestamp);
  await updateStationsOnMap();
}

async function handleAppVisibilitySync() {
  logger.debug(`📄 VisibilityState changed: ${document.visibilityState}`);
  if (document.visibilityState === 'visible') {
    if (!isInitialized && isSyncing) {
      logger.debug('Event ignored: an initial sync is already running.');
      return;
    }
    await triggerSyncAndPoll();
  } else {
    stopPolling();
  }
}

async function updateStationsOnMap() {
  try {
    await updateStationsOnMapAction();
  } catch (e: unknown) {
    logger.error('Error refreshing station wind values during visibility resume:', e);
  }

  try {
    await updateSpecialDataOnMapAction(appMap);
  } catch (e: unknown) {
    logger.error('Error refreshing special data badge during visibility resume:', e);
  }
}

function registerLifecycleListeners() {
  document.addEventListener('visibilitychange', () => handleAppVisibilitySync());
  window.addEventListener('pageshow', () => handleAppVisibilitySync());
  window.addEventListener('focus', () => handleAppVisibilitySync());

  window.addEventListener('online', () => {
    logger.info('📶 Network connection restored. Starting recovery sync...');
    triggerSyncAndPoll();
  });

  window.addEventListener('resume', () => {
    logger.info('📱 App process resumed from deep freeze.');
    triggerSyncAndPoll();
  });

  window.addEventListener('app:provider-switch-request', async (ev: Event) => {
    const custom = ev as CustomEvent<{ providerId?: string }>;
    const providerId = custom && custom.detail && typeof custom.detail.providerId === 'string' ? custom.detail.providerId : null;
    if (!providerId) return;

    if (weatherProviderModel.getActiveProviderId() === providerId) return;

    const prevTimestamp = weatherProviderModel.activeTimestamp;

    weatherProviderModel.setActiveProvider(providerId);
    try { storage.saveActiveProvider(providerId); } catch (e) { logger.debug('Failed to persist active provider', e); }

    await triggerSyncAndPoll(true, prevTimestamp);

    try {
      logger.debug('Provider switch debug:', {
        prevTimestamp,
        newActiveTimestamp: weatherProviderModel.activeTimestamp,
        activeIndex: weatherProviderModel.activeTimestampIndex,
        availableCount: weatherProviderModel.availableTimestamps.length
      });
    } catch (e) {
      /* ignore */
    }
  });

  window.addEventListener('ui:notification-retry', async () => {
    logger.debug('Retry requested.');
    try {
      await safeSyncApp();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      toastController.showToast({ message: 'Retry failed: ' + errMsg }, 5000);
    }
  });
}

export async function retryStartupSync(): Promise<void> {
  logger.info('Startup retry requested.');
  await safeSyncApp(true);
}

export async function initLifecycleController(map: LeafletMap): Promise<void> {
  logger.info('🚀 LifecycleController loaded (cold start)');
  appMap = map;
  await safeSyncApp(true);
  registerLifecycleListeners();
  startPolling();
  await updateStationsOnMap();
}
