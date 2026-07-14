// controllers/eventController.js
import { weatherModel } from '../models/weatherModel.js';
import { storage } from '../utils/storage.js';
import { loadingManager } from './loadingManager.js';
import { notificationController } from './notificationController.js';
import { syncAppWithServer, loadWeatherDataForLocation, updateOverlayForTimestamp } from './syncPipeline.js';
import { formatToDateTime, formatModelTimestampToTime, addMinutesToIso, formatModelTimestampToDateTime } from '../utils/time.js';

/**
 * Aktiviert das Event-Handling für Map, UI und Lifecycle.
 * @param {any} map Leaflet Map Instanz
 */
export function initEventController(map) {
    const POLL_INTERVAL_MS = 5 * 60 * 1000;
    const SLIDER_DEBOUNCE_MS = 50;

    /** @type {number | null} */
    let lastClusterClickToken = null;
    /** @type {ReturnType<typeof setTimeout> | null} */
    let timelineDebounceTimer = null;
    /** @type {string | null} */
    let lastTimelineTimestampToken = null;

    // --- A. MAP EVENTS (KLICKS & GPS) ---

    /** @param {{latlng:{lat:number,lng:number}}} e */
    async function handleMapClick(e) {
        const currentClickToken = Date.now();
        lastClusterClickToken = currentClickToken;

        await loadWeatherDataForLocation(e.latlng);
        if (lastClusterClickToken !== currentClickToken) return;
    }

    /** @param {{latlng:{lat:number,lng:number}}} e */
    async function handleLocationFound(e) {
        const currentClickToken = Date.now();
        lastClusterClickToken = currentClickToken;

        map.setView(e.latlng, 14, { animate: true });
        await loadWeatherDataForLocation(e.latlng);

        if (lastClusterClickToken === currentClickToken) {
            weatherModel.setIsLocating(false);
        }
    }

    /** @param {{message:string}} e */
    function handleLocationError(e) {
        notificationController.showNotification({ message: "Error processing GPS location: " + e.message });
        weatherModel.setIsLocating(false);
    }

    map.on('click', handleMapClick);
    map.on('locationfound', handleLocationFound);
    map.on('locationerror', handleLocationError);

    map.on('popupclose', () => {
        lastClusterClickToken = null;
        weatherModel.removePointData();
    });

    map.on('moveend', () => {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('lat') && urlParams.has('lon')) return;

        const center = map.getCenter();
        storage.saveMapState({
            lat: center.lat,
            lng: center.lng,
            zoom: map.getZoom()
        });
    });

    // --- B. UI TIMELINE EVENT (SLIDER) ---

    /** @param {Event & {detail?:{index:number}}} e */
    function handleTimelineChange(e) {
        const idx = e && e.detail && typeof e.detail.index === 'number' ? e.detail.index : null;
        if (idx === null) return;
        // Dismiss any persistent notifications when user interacts with the timeline
        try {
            notificationController.clearNotification();
        } catch (err) {
            // ignore
        }

        weatherModel.setActiveTimestampIndex(idx);

        if (timelineDebounceTimer !== null) {
            clearTimeout(timelineDebounceTimer);
        }

        timelineDebounceTimer = window.setTimeout(async () => {
            const targetTimestamp = weatherModel.activeTimestamp;
            if (!targetTimestamp) return;

            lastTimelineTimestampToken = targetTimestamp;

            await loadingManager.track(async () => {
                await updateOverlayForTimestamp(targetTimestamp);
            });
        }, SLIDER_DEBOUNCE_MS);
    }

    window.addEventListener('timeline-change', handleTimelineChange);

    // --- C. APP LIFECYCLE & POLLING ---

    let isSyncing = false;
    let isInitialized = false;
    /** @type {ReturnType<typeof setInterval> | null} */
    let pollTimer = null; // Hier speichern wir die Timer-Referenz

    /**
     * Startet den Intervall-Timer für den Hintergrund-Poll frisch.
     */
    function startPolling() {
        // Falls bereits ein Timer existiert, erst löschen (Sicherheitsnetz)
        if (pollTimer !== null) {
            clearInterval(pollTimer);
        }
        
        console.log("⏰ Polling gestartet.");

        pollTimer = setInterval(async () => {
            console.log("⏰ Regulärer Hintergrund-Poll getriggert.");
            await safeSyncApp();
        }, POLL_INTERVAL_MS);
    }

    /**
     * Stoppt den Intervall-Timer komplett.
     */
    function stopPolling() {
        if (pollTimer !== null) {
            clearInterval(pollTimer);
            pollTimer = null;
            console.log("🛑 Polling gestoppt (App im Hintergrund).");
        }
    }

    /**
     * Führt den App-Sync geschützt durch Flags aus.
     */
    async function safeSyncApp() {
        if (isSyncing) {
            console.log("Sync blockiert: Ein anderer Sync-Prozess läuft bereits.");
            return;
        }

        isSyncing = true;
        console.log("🔄 App-Sync gestartet...");

        try {
            await loadingManager.track(async () => {
                await syncAppWithServer();
            });
            isInitialized = true;
        } catch (error) {
            console.error("Fehler während des App-Syncs:", error);
        } finally {
            isSyncing = false;
        }
    }

    /**
     * Handler für die Sichtbarkeits- und Pageshow-Events
     * @param {boolean} visibilityEvent
     */
    async function handleAppVisibilitySync(visibilityEvent) {
        console.log(`📄 Event: ${visibilityEvent ? 'visibilitychange' : 'pageshow'}, visibilityState: ${document.visibilityState}`);
        if (document.visibilityState === 'visible') {
            // 1. Wenn wir zurückkehren, starten wir das Polling SOFORT frisch
            startPolling();

            // Kaltstart-Schutz (wird vom harten Aufruf unten abgefangen)
            if (!isInitialized) {
                console.log("Event ignoriert: App befindet sich noch im Kaltstart-Initiallauf.");
                return;
            }
            
            // 2. Sofort Daten abgleichen bei Rückkehr
            await safeSyncApp();
        } else if (document.visibilityState === 'hidden') {
            // 3. Wenn die App in den Hintergrund geht, killen wir den Timer aktiv
            stopPolling();
        }
    }

    console.log("🚀 Skript geladen (Kaltstart)");

    // 1. ABSOLUTE GARANTIE: Startet sofort hart beim Laden des Skripts (Kaltstart)
    (async () => {
        try {
            // During initial startup we treat sync as foreground so errors show retry notification
            await loadingManager.track(async () => {
                await syncAppWithServer(false);
            }, { modal: true });
            isInitialized = true;
        } catch (e) {
            console.error('Initial sync failed:', e);
            // `syncAppWithServer` shows retry notification only for foreground syncs
        } finally {
            // Starte Polling unabhängig vom Ergebnis
            startPolling();
        }
    })();

    // 2. EVENT-LISTENER (Steuern nun auch das Aufziehen/Abbauen des Timers)
    document.addEventListener('visibilitychange', () => handleAppVisibilitySync(true));
    window.addEventListener('pageshow', () =>  handleAppVisibilitySync(false));


    // Listen for controller actions emitted from views (dispatched on window)
    window.addEventListener('controller:app-reload', () => {
        console.log("App reload requested via window event.");
        notificationController.clearNotification();
        window.location.reload();
    });

    // Manual startup retry triggered from notification action
    window.addEventListener('controller:startup-retry', async () => {
        if (isSyncing) {
            console.log('Startup retry requested but sync already in progress.');
            notificationController.clearNotification();
            return;
        }

        try {
            // Manual retry from the UI is a foreground attempt — pass false so retry modal appears on failure
            await loadingManager.track(async () => {
                notificationController.clearNotification();
                await syncAppWithServer(false);
            }, { modal: true });
            isInitialized = true;
        } catch (e) {
            console.error('Startup manual retry failed:', e);
            // `syncAppWithServer` will show retry notification only for foreground syncs
        }
    });

    // --- D. MODEL INFO CLICK / SYNC FLOW ---
    
    function handleModelInfoClicked() {
        const runStr = weatherModel.modelCurrentHour ? formatModelTimestampToDateTime(weatherModel.modelCurrentHour) : '—';
        const syncStr = weatherModel.lastIndexSync ? formatToDateTime(weatherModel.lastIndexSync) : '—';

        const message = `Model run:\n${runStr}\n\nSync:\n${syncStr}`;

        notificationController.showNotification({
            message,
            isModal: false
        });
    }

    window.addEventListener('model-info:clicked', handleModelInfoClicked);
}