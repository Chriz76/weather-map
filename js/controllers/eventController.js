// controllers/eventController.js
import { weatherModel } from '../models/weatherModel.js';
import { storage } from '../utils/storage.js';
import { loadingManager } from './loadingManager.js';
import { syncAppWithServer, loadWeatherDataForLocation, updateOverlayForTimestamp } from './syncPipeline.js';

/**
 * Aktiviert das Event-Handling für Map, UI und Lifecycle.
 * @param {any} map Leaflet Map Instanz
 */
export function initEventController(map) {
    const POLL_INTERVAL_MS = 5 * 60 * 1000;
    const SLIDER_DEBOUNCE_MS = 50;

    let lastClusterClickToken = null;
    let timelineDebounceTimer = null;
    let lastTimelineTimestampToken = null;

    // --- A. MAP EVENTS (KLICKS & GPS) ---

    map.on('click', async (e) => {
        const currentClickToken = Date.now();
        lastClusterClickToken = currentClickToken;

        await loadWeatherDataForLocation(e.latlng);
        if (lastClusterClickToken !== currentClickToken) return;
    });

    map.on('locationfound', async (e) => {
        const currentClickToken = Date.now();
        lastClusterClickToken = currentClickToken;

        map.setView(e.latlng, 14, { animate: true });
        await loadWeatherDataForLocation(e.latlng);

        if (lastClusterClickToken === currentClickToken) {
            weatherModel.setIsLocating(false);
        }
    });

    map.on('locationerror', (e) => {
        import('./errorController.js').then(({ errorController }) => {
            errorController.showError("Error processing GPS location: " + e.message);
        });
        weatherModel.setIsLocating(false);
    });

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

    window.addEventListener('timeline-change', (e) => {
        const timelineEvent = /** @type {CustomEvent<{index:number}>} */ (e);
        const idx = timelineEvent.detail && typeof timelineEvent.detail.index === 'number' ? timelineEvent.detail.index : null;
        if (idx === null) return;

        weatherModel.setActiveTimestampIndex(idx);

        if (timelineDebounceTimer) clearTimeout(timelineDebounceTimer);

        timelineDebounceTimer = window.setTimeout(async () => {
            const targetTimestamp = weatherModel.activeTimestamp;
            if (!targetTimestamp) return;

            lastTimelineTimestampToken = targetTimestamp;

            await loadingManager.track(async () => {
                await updateOverlayForTimestamp(targetTimestamp);
            });
        }, SLIDER_DEBOUNCE_MS);
    });

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