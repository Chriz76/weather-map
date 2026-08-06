// controllers/lifecycleController.js
import { loadingSpinnerController } from './loadingSpinnerController.js';
import { toastController } from './toastController.js';
import { weatherProviderModel } from '../models/weatherProviderModel.js';
import { syncAppWithServerAction, ApiMismatchError, IndexLoadError, LocationLoadError, OverlayLoadError, updateOverlayForTimestampAction, loadWeatherDataForLocationAction } from './actions.js';
import { updateStationsOnMapAction } from './updateStationsOnMapAction.js';
import { updateSpecialDataOnMapAction } from './updateSpecialDataOnMapAction.js';
import { logger } from '../utils/logger.js';
import { storage } from '../utils/storage.js';

const POLL_INTERVAL_MS = 5 * 60 * 1000;

let isSyncing = false;
let isInitialized = false;
/** @type {number|null} */
let pollTimer = null;
/** @type {Object|null} */
let appMap = null;

function startPolling() {
    if (pollTimer !== null) clearInterval(pollTimer);
    logger.info('⏰ Polling started.');
    pollTimer = setInterval(async () => {
        logger.debug('⏰ Regular background poll triggered.');
        await safeSyncApp();
        await updateStationsOnMap(appMap);
    }, POLL_INTERVAL_MS);
}

function stopPolling() {
    if (pollTimer !== null) {
        clearInterval(pollTimer);
        pollTimer = null;
        logger.info('🛑 Polling stopped (app hidden).');
    }
}

async function safeSyncApp(isInitial = false, forceArg = false, prevActiveTimestamp = null) {
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
    } catch (error) {
        logger.error('Error during app sync:', error);
        const errMsg = error instanceof Error ? error.message : String(error);
        const isApiMismatch = error instanceof ApiMismatchError;

        if (isApiMismatch) {
            const version = error.version || '';
            weatherProviderModel.setApiMismatchError(`A new App version is available (v${version}).\n\nPlease reload the page to use the application as usual.`);
        } else if (error instanceof IndexLoadError) {
            weatherProviderModel.setIndexLoadError(error.detail ?? errMsg);
        } else if (error instanceof LocationLoadError) {
            weatherProviderModel.setPointDataLoadError(error.detail ?? errMsg);
        } else if (error instanceof OverlayLoadError) {
            weatherProviderModel.setOverlayLoadError(error.detail ?? errMsg);
        }

        if (!isApiMismatch) {
            if (isInitial) {
                weatherProviderModel.setStartupError('Error during application synchronization: ' + errMsg);
            } else {
                // Background sync failed -> non-modal toast
                toastController.showToast({
                    message: 'Background sync failed: ' + errMsg
                }, 5000);
            }
        }
    }
    // Ensure isSyncing is reset even if `finally` is not supported by target JS
    isSyncing = false;
}

// Hilfsfunktion für die Reaktivierungs-Events
async function triggerSyncAndPoll(force = false, prevActiveTimestamp = null) {
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
    } catch (e) {
        logger.error('Error refreshing station wind values during visibility resume:', e);
    }

    try {
        await updateSpecialDataOnMapAction(appMap);
    } catch (e) {
        logger.error('Error refreshing special data badge during visibility resume:', e);
    }
}

function registerLifecycleListeners() {
    document.addEventListener('visibilitychange', () => handleAppVisibilitySync());
    window.addEventListener('pageshow', () => handleAppVisibilitySync());
    
    window.addEventListener('online', () => {
        logger.info('📶 Network connection restored. Starting recovery sync...');
        triggerSyncAndPoll();
    });

    window.addEventListener('resume', () => {
        logger.info('📱 App process resumed from deep freeze.');
        triggerSyncAndPoll();
    });

    // Handle provider switch requests from UI layer
    window.addEventListener('app:provider-switch-request', async (ev) => {
        const providerId = ev && ev.detail && typeof ev.detail.providerId === 'string' ? ev.detail.providerId : null;
        if (!providerId) return;

        // No-op if already active
        if (weatherProviderModel.getActiveProviderId() === providerId) return;

        // Capture currently selected timestamp (provider-agnostic reference)
        const prevTimestamp = weatherProviderModel.activeTimestamp;

        // Update model immediately so views (logo toggle) reflect choice
        weatherProviderModel.setActiveProvider(providerId);
        // Persist user's choice (controller layer handles I/O)
        try { storage.saveActiveProvider(providerId); } catch (e) { logger.debug('Failed to persist active provider', e); }

        // Trigger sync and prefer the previously selected timestamp when computing the new active index
        await triggerSyncAndPoll(true, prevTimestamp);

        // Debug info: log prev vs new active timestamp and selected index
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
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            toastController.showToast({ message: 'Retry failed: ' + errMsg }, 5000);
        }
    });
}

export async function retryStartupSync() {
    logger.info('Startup retry requested.');
    await safeSyncApp(true);
}

export async function initLifecycleController(map) {
    logger.info('🚀 LifecycleController loaded (cold start)');
    appMap = map;
    await safeSyncApp(true);
    registerLifecycleListeners();
    startPolling();
    await updateStationsOnMap();
}


