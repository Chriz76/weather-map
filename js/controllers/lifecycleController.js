// controllers/lifecycleController.js
import { loadingManager } from './loadingManager.js';
import { notificationController } from './notificationController.js';
import { syncAppWithServer } from './syncPipeline.js';

const POLL_INTERVAL_MS = 5 * 60 * 1000;

let isSyncing = false;
let isInitialized = false;
let pollTimer = null;

function startPolling() {
    if (pollTimer !== null) {
        clearInterval(pollTimer);
    }

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

async function safeSyncApp() {
    if (isSyncing) {
        console.log('Sync blockiert: Ein anderer Sync-Prozess läuft bereits.');
        return;
    }

    isSyncing = true;
    console.log('🔄 App-Sync gestartet...');

    try {
        await loadingManager.track(async () => {
            await syncAppWithServer();
        });
        isInitialized = true;
    } catch (error) {
        console.error('Fehler während des App-Syncs:', error);
    } finally {
        isSyncing = false;
    }
}

async function handleAppVisibilitySync(visibilityEvent) {
    console.log(`📄 Event: ${visibilityEvent ? 'visibilitychange' : 'pageshow'}, visibilityState: ${document.visibilityState}`);
    if (document.visibilityState === 'visible') {
        startPolling();

        if (!isInitialized && isSyncing) {
            console.log('Event ignoriert: Ein Initialisierungs-Sync läuft bereits.');
            return;
        }

        await safeSyncApp();
    } else if (document.visibilityState === 'hidden') {
        stopPolling();
    }
}

export function initLifecycleController() {
    console.log('🚀 LifecycleController geladen (Kaltstart)');

    (async () => {
        try {
            await loadingManager.track(async () => {
                await syncAppWithServer(false);
            }, { modal: true });
            isInitialized = true;
        } catch (e) {
            console.error('Initial sync failed:', e);
        } finally {
            startPolling();
        }
    })();

    document.addEventListener('visibilitychange', () => handleAppVisibilitySync(true));
    window.addEventListener('pageshow', () => handleAppVisibilitySync(false));

    window.addEventListener('online', async () => {
        console.log('📶 Netzverbindung wiederhergestellt. Starte Recovery-Sync...');
        startPolling();
        await safeSyncApp();
    });

    window.addEventListener('resume', async () => {
        console.log('📱 App-Prozess aus dem Deep-Freeze reaktiviert.');
        startPolling();
        await safeSyncApp();
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

        try {
            await loadingManager.track(async () => {
                notificationController.clearNotification();
                await syncAppWithServer(false);
            }, { modal: true });
            isInitialized = true;
        } catch (e) {
            console.error('Startup manual retry failed:', e);
        }
    });

    return {
        dispose() {
            stopPolling();
        }
    };
}
