// controllers/eventController.js
import { weatherModel } from '../models/weatherModel.js';
import { storage } from '../utils/storage.js';
import { loadingManager } from './loadingManager.js';
import { notificationController } from './notificationController.js';
import { syncAppWithServer, loadWeatherDataForLocation, updateOverlayForTimestamp } from './syncPipeline.js';

/**
 * Aktiviert das Event-Handling für Map, UI und Lifecycle.
 * @param {any} map Leaflet Map Instanz
 */
export function initEventController(map) {
    const POLL_INTERVAL_MS = 5 * 60 * 1000;
    const SLIDER_DEBOUNCE_MS = 50;

    /** @type {number | null} */
    let lastClusterClickToken = null;
    /** @type {number | null} */
    let timelineDebounceTimer = null;
    /** @type {number | null} */
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
        notificationController.showNotification("Error processing GPS location: " + e.message);
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

    /** @param {Event} e */
    function handleTimelineChange(e) {
        const timelineEvent = /** @type {{detail:{index:number}}} */ (e);
        const idx = timelineEvent.detail && typeof timelineEvent.detail.index === 'number' ? timelineEvent.detail.index : null;
        if (idx === null) return;

        weatherModel.setActiveTimestampIndex(idx);

        if (timelineDebounceTimer !== null) {
            clearTimeout(timelineDebounceTimer);
        }

        timelineDebounceTimer = /** @type {number} */ (window.setTimeout(async () => {
            const targetTimestamp = weatherModel.activeTimestamp;
            if (!targetTimestamp) return;

            lastTimelineTimestampToken = targetTimestamp;

            await loadingManager.track(async () => {
                await updateOverlayForTimestamp(targetTimestamp);
            });
        }, SLIDER_DEBOUNCE_MS));
    }

    window.addEventListener('timeline-change', handleTimelineChange);

    // --- C. APP LIFECYCLE & POLLING ---

    const pollTimer = setInterval(async () => {
        await syncAppWithServer();
    }, POLL_INTERVAL_MS);

    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible') {
            await loadingManager.track(async () => {
                await syncAppWithServer();
            });
        }
    });

    weatherModel.addEventListener('controller:app-reload', () => {
        window.location.reload();
    });
}