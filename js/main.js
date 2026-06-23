import { BASE_URL, lonMin, latMin, GRID_CELL_SIZE } from './config.js';
import { weatherModel } from './weatherModel.js';
import { initMap } from './map-init.js';
import { weatherApi } from './weatherApi.js';
import { storage } from './utils/storage.js'; // Keep for map state

// Views
import { registerTimelineView } from './views/timelineView.js';
import { registerForecastView } from './views/forecastView.js';
import { registerLegendView } from './views/legendView.js';
import { registerLogoView } from './views/logoView.js';
import { registerModelInfoView } from './views/modelInfoView.js';
import { registerMapOverlayView } from './views/mapOverlayView.js';
import { registerGpsView } from './views/gpsView.js';

// --- 1. INITIALISIERUNG ---
const { map, windOverlay } = initMap();
registerTimelineView(map);
registerForecastView(map);
registerLogoView(map);
registerLegendView(map);
registerModelInfoView(map);
registerMapOverlayView(map, windOverlay);
registerGpsView(map, () => {
    weatherModel.setIsLocating(true);     
    map.locate({ 
        setView: false, 
        enableHighAccuracy: true 
    });
});

const POLL_INTERVAL_MS = 5 * 60 * 1000;
let pollTimer = null;
let lastClusterClickToken = null;
let currentOverlayBlobUrl = null;


// --- 2. LOGIC PIPELINE (Pure data fetching) ---

/**
 * Fetches a weather image and returns a Blob object URL.
 * @param {string|null} timestamp Timestamp key in format YYYYMMDD_HH.
 * @returns {Promise<string|null>} Overlay URL for Leaflet image layer or null.
 */
async function fetchWeatherOverlayUrl(timestamp) {
    if (!timestamp) return null;
    try {
        const imageBlob = await weatherApi.fetchWeatherImageBlob(timestamp, BASE_URL);

        if (currentOverlayBlobUrl) {
            URL.revokeObjectURL(currentOverlayBlobUrl);
        }

        currentOverlayBlobUrl = URL.createObjectURL(imageBlob);
        return currentOverlayBlobUrl;
    } catch (error) {
        console.error('🚨 Error loading map overlay data:', error.message);
        return `${BASE_URL}${timestamp}Z.png`; // Fallback path
    }
}


// --- 3. CENTRAL COORDINATION ---

/**
 * Synchronizes model state with current backend data.
 * @returns {Promise<void>}
 */
async function syncAppWithServer() {
    try {
        const indexData = await weatherApi.fetchIndex(BASE_URL);

        // 1. LIGHTNING-FAST CHECK: If creation date hasn't changed → abort
        if (weatherModel.generatedAt === indexData.generated_at && weatherModel.generatedAt) {
            return;
        }

        if (weatherModel.lastClickedLatLng) {
            let clusterData = await weatherApi.fetchCluster(weatherModel.lastClickedLatLng, { BASE_URL, lonMin, latMin, gridCellSize: GRID_CELL_SIZE });
            weatherModel.setIndexMetadata(indexData);
            weatherModel.setPointData(weatherModel.lastClickedLatLng, clusterData);
        } else {
            weatherModel.setIndexMetadata(indexData);
        }

        // 2. Load data (image & interpolation)
        const overlayUrl = await fetchWeatherOverlayUrl(weatherModel.activeTimestamp);

        // 3. Update store state transparently
        weatherModel.setActiveOverlayUrl(overlayUrl);

    } catch (e) {
        console.error('❌ Error during application synchronization:', e.message);
    }
}


// --- 4. APP LIFECYCLE & EVENT LISTENERS (The Controllers) ---

/**
 * Starts the application bootstrap and polling lifecycle.
 * @returns {Promise<void>}
 */
async function startAppAndSetupPolling() {
    await syncAppWithServer();

    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
        await syncAppWithServer();
    }, POLL_INTERVAL_MS);
}

startAppAndSetupPolling();

document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
        await syncAppWithServer();
    }
});

window.addEventListener('timeline-change', async (e) => {
    const idx = e.detail && typeof e.detail.index === 'number' ? e.detail.index : null;
    if (idx === null) return;

    // 1. Set explicit time index in store
    weatherModel.setActiveTimestampIndex(idx);

    // 2. Load data (image & interpolation)
    const overlayUrl = await fetchWeatherOverlayUrl(weatherModel.activeTimestamp);

    // 3. Update store state transparently
    weatherModel.setActiveOverlayUrl(overlayUrl);
});

// MAP EXTENSION: Kartenzustand debounct sichern bei Bewegung
map.on('moveend', () => {
    const center = map.getCenter();
    storage.saveMapState({
        lat: center.lat,
        lng: center.lng,
        zoom: map.getZoom()
    });
});

map.on('click', async function (e) {
    const currentClickToken = Date.now();
    lastClusterClickToken = currentClickToken;

    try {
        // 1. Request cluster asynchronously
        const cluster = await weatherApi.fetchCluster(e.latlng, { BASE_URL, lonMin, latMin, gridCellSize: GRID_CELL_SIZE });
        if (lastClusterClickToken !== currentClickToken) return;

        // 2. Once everything is ready: set state in one go
        weatherModel.setPointData(e.latlng, cluster);
    } catch (error) {
        if (lastClusterClickToken === currentClickToken) {
            console.error('🚨 Error processing map click:', error.message);
        }
    }
});

map.on('popupclose', function () {
    lastClusterClickToken = null;

    // Direct, unambiguous cleanup of state
    weatherModel.removePointData();
});

map.on('locationfound', async function (e) {
    const currentClickToken = Date.now();
    lastClusterClickToken = currentClickToken;

    try {
        const cluster = await weatherApi.fetchCluster(e.latlng, { BASE_URL, lonMin, latMin, gridCellSize: GRID_CELL_SIZE });
        if (lastClusterClickToken !== currentClickToken) return;

        map.setView(e.latlng, 14, { animate: true });
        weatherModel.setPointData(e.latlng, cluster);
    } catch (error) {
        if (lastClusterClickToken === currentClickToken) {
            console.error('🚨 Error processing GPS location:', error.message);
        }
    } {
        // Turns off loading state in model → View reacts automatically!
        weatherModel.setIsLocating(false);
    }
});

map.on('locationerror', function (e) {
    alert(`Location error: ${e.message}`);
    weatherModel.setIsLocating(false); // Turn off on error
});