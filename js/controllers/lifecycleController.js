// controllers/lifecycleController.js
import { loadingSpinnerController } from './loadingSpinnerController.js';
import { toastController } from './toastController.js';
import { weatherModel } from '../models/weatherDomainModel.js';
import { syncAppWithServerAction, ApiMismatchError, IndexLoadError, LocationLoadError, OverlayLoadError } from './actions.js';
import { updateStationsOnMapAction } from './updateStationsOnMapAction.js';
import { logger } from '../utils/logger.js';

const POLL_INTERVAL_MS = 5 * 60 * 1000;

let isSyncing = false;
let isInitialized = false;
/** @type {number|null} */
let pollTimer = null;

function startPolling() {
    if (pollTimer !== null) clearInterval(pollTimer);
    logger.info('⏰ Polling started.');
    pollTimer = setInterval(async () => {
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

async function safeSyncApp(isInitial = false) {
    logger.debug(`diagnostic: safeSyncApp called (isInitial=${isInitial}) - isSyncing=${isSyncing}, isInitialized=${isInitialized}`);
    if (isSyncing) {
        logger.debug('Sync blocked: another sync process is already running.');
        return;
    }

    isSyncing = true;
    logger.info('🔄 App sync started...');
 
    const force = !!(
        weatherModel.indexLoadError ||
        weatherModel.pointDataLoadError ||
        weatherModel.overlayLoadError
    );

    weatherModel.setStartupError(null);
    weatherModel.setIndexLoadError(null);
    weatherModel.setPointDataLoadError(null);
    weatherModel.setOverlayLoadError(null);

    try {
        await loadingSpinnerController.track(
            () => syncAppWithServerAction(!isInitial, force), 
            isInitial ? { modal: true } : undefined
        );
        isInitialized = true;
    } catch (error) {
        logger.error('Error during app sync:', error);
        const errMsg = error instanceof Error ? error.message : String(error);
        const isApiMismatch = error instanceof ApiMismatchError;

        if (isApiMismatch) {
            const version = error.version || '';
            weatherModel.setApiMismatchError(`A new App version is available (v${version}).\n\nPlease reload the page to use the application as usual.`);
        } else if (error instanceof IndexLoadError) {
            weatherModel.setIndexLoadError(error.detail ?? errMsg);
        } else if (error instanceof LocationLoadError) {
            weatherModel.setPointDataLoadError(error.detail ?? errMsg);
        } else if (error instanceof OverlayLoadError) {
            weatherModel.setOverlayLoadError(error.detail ?? errMsg);
        }

        if (!isApiMismatch) {
            if (isInitial) {
                weatherModel.setStartupError('Error during application synchronization: ' + errMsg);
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
async function triggerSyncAndPoll() {
    startPolling();
    await safeSyncApp();
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
}

function registerLifecycleListeners() {
    document.addEventListener('visibilitychange', handleAppVisibilitySync);
    window.addEventListener('pageshow', handleAppVisibilitySync);
    
    window.addEventListener('online', () => {
        logger.info('📶 Network connection restored. Starting recovery sync...');
        triggerSyncAndPoll();
    });

    window.addEventListener('resume', () => {
        logger.info('📱 App process resumed from deep freeze.');
        triggerSyncAndPoll();
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

export async function initLifecycleController() {
    logger.info('🚀 LifecycleController loaded (cold start)');

    await safeSyncApp(true);
    registerLifecycleListeners();
    startPolling();
    await updateStationsOnMap();
}


