// controllers/lifecycleController.js
import { loadingSpinnerController } from './loadingSpinnerController.js';
import { notificationController } from './notificationController.js';
import { syncAppWithServerAction, ApiMismatchError } from './actions.js';

const POLL_INTERVAL_MS = 5 * 60 * 1000;

let isSyncing = false;
let isInitialized = false;
let pollTimer = null;

function startPolling() {
    if (pollTimer !== null) clearInterval(pollTimer);
    console.log('⏰ Polling gestartet.');
    pollTimer = setInterval(async () => {
        console.log('⏰ Regulärer Hintergrund-Poll getriggert.');
        await safeSyncApp();
    }, POLL_INTERVAL_MS);
}

function stopPolling() {
    if (pollTimer !== null) {
        clearInterval(pollTimer);
        pollTimer = null;
        console.log('🛑 Polling gestoppt (App im Hintergrund).');
    }
}

async function safeSyncApp(isInitial = false) {
    if (isSyncing) {
        console.log('Sync blockiert: Ein anderer Sync-Prozess läuft bereits.');
        return;
    }

    isSyncing = true;
    console.log('🔄 App-Sync gestartet...');

    try {
        await loadingSpinnerController.track(
            () => syncAppWithServerAction(!isInitial), 
            isInitial ? { modal: true } : undefined
        );
        isInitialized = true;
    } catch (error) {
        console.error('Fehler während des App-Syncs:', error);
        const errMsg = error instanceof Error ? error.message : String(error);

        // API version mismatch -> offer reload
        if (error instanceof ApiMismatchError) {
            const version = error.version || '';
            notificationController.showNotification({
                message: `A new App version is available (v${version}).\n\nPlease reload the page to use the application as usual.`,
                isModal: true,
                action: { text: 'Reload App', event: 'controller:app-reload' }
            }, 0);
        } else if (isInitial) {
            // Initial sync failed -> modal retry
            notificationController.showNotification({
                message: 'Error during application synchronization: ' + errMsg,
                isModal: true,
                action: { text: 'Retry', event: 'controller:startup-retry' }
            }, 0);
        } else {
            // Background sync failed -> non-modal toast
            notificationController.showNotification({
                message: 'Background sync failed: ' + errMsg,
                isModal: false
            }, 5000);
        }
    }
    // Ensure isSyncing is reset even if `finally` is not supported by target JS
    isSyncing = false;
}

// Hilfsfunktion für die Reaktivierungs-Events
async function triggerSyncAndPoll() {
    startPolling();
    await safeSyncApp();
}

async function handleAppVisibilitySync() {
    console.log(`📄 VisibilityState geändert: ${document.visibilityState}`);
    if (document.visibilityState === 'visible') {
        if (!isInitialized && isSyncing) {
            console.log('Event ignoriert: Ein Initialisierungs-Sync läuft bereits.');
            return;
        }
        await triggerSyncAndPoll();
    } else {
        stopPolling();
    }
}

export function initLifecycleController() {
    console.log('🚀 LifecycleController geladen (Kaltstart)');

    // 1. Initialer Sync beim Starten, danach Polling starten
    // Use `.then` instead of `.finally` for older JS targets
    safeSyncApp(true).then(startPolling, startPolling);

    // 2. Standard Event-Listener ohne Registrierungs-Zirkus
    document.addEventListener('visibilitychange', handleAppVisibilitySync);
    window.addEventListener('pageshow', handleAppVisibilitySync);
    
    window.addEventListener('online', () => {
        console.log('📶 Netzverbindung wiederhergestellt. Starte Recovery-Sync...');
        triggerSyncAndPoll();
    });

    window.addEventListener('resume', () => {
        console.log('📱 App-Prozess aus dem Deep-Freeze reaktiviert.');
        triggerSyncAndPoll();
    });

    window.addEventListener('controller:app-reload', () => {
        console.log('App reload requested via window event.');
        notificationController.clearNotification();
        window.location.reload();
    });

    window.addEventListener('controller:startup-retry', async () => {
        if (isSyncing) {
            console.log('Startup retry requested but sync already in progress.');
            notificationController.clearNotification();
            return;
        }
        notificationController.clearNotification();
        await safeSyncApp(true);
    });
}