import { BASE_URL, lonMin, latMin, GRID_CELL_SIZE } from './config.js';
import { weatherModel } from './weatherModel.js';
import { initMap } from './map-init.js';
import { weatherApi } from './weatherApi.js';
import { storage } from './utils/storage.js'; // Keep for map state
import { loadingManager } from './utils/loadingManager.js';

// Views
import { registerTimelineView } from './views/timelineView.js';
import { registerForecastView } from './views/forecastView.js';
import { registerLegendView } from './views/legendView.js';
import { registerLogoView } from './views/logoView.js';
import { registerModelInfoView } from './views/modelInfoView.js';
import { registerMapOverlayView } from './views/mapOverlayView.js';
import { registerGpsView } from './views/gpsView.js';
import { registerLoadingView } from './views/loadingSpinnerView.js';
import { registerToastView } from './views/toastView.js';

// --- 1. INITIALISIERUNG ---
const initResult = /** @type {{map:any, windOverlay:any}} */ (initMap());
const map = initResult.map;
const windOverlay = initResult.windOverlay;
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
registerLoadingView();
registerToastView();

const POLL_INTERVAL_MS = 5 * 60 * 1000;
/** @type {number|null} */
let pollTimer = null;
let lastClusterClickToken = null;
/** @type {string|null} */
let currentOverlayBlobUrl = null;


// --- 2. LOGIC PIPELINE (Pure data fetching) ---

/**
 * Fetches a weather image and returns a Blob object URL.
 * @param {string|null} timestamp Timestamp key in format YYYYMMDD_HH.
 * @returns {Promise<string|null>} Overlay URL for Leaflet image layer or null.
 */
async function fetchWeatherOverlayUrl(timestamp) {
    if (!timestamp) return null;

    const imageBlob = await weatherApi.fetchWeatherImageBlob(timestamp, BASE_URL);

    if (currentOverlayBlobUrl) {
        URL.revokeObjectURL(currentOverlayBlobUrl);
    }

    currentOverlayBlobUrl = URL.createObjectURL(imageBlob);
    return currentOverlayBlobUrl;
}


// --- 3. CENTRAL COORDINATION ---

/**
 * Synchronizes model state with current backend data.
 * @returns {Promise<void>}
 */
async function syncAppWithServer() {
    try {
        const indexData = /** @type {{available_timestamps?: string[], generated_at?: string, current_hour?: string}} */ (await weatherApi.fetchIndex(BASE_URL));

        // 1. LIGHTNING-FAST CHECK: If creation date hasn't changed → abort
        if (weatherModel.modelGeneratedAt === indexData.generated_at && weatherModel.modelGeneratedAt) {
            return;
        }

        if (weatherModel.lastClickedLatLng) {
            let clusterData = await weatherApi.fetchCluster(weatherModel.lastClickedLatLng, { BASE_URL, lonMin, latMin, gridCellSize: GRID_CELL_SIZE });
            weatherModel.setIndexMetadata(indexData);
            weatherModel.setPointData(weatherModel.lastClickedLatLng, clusterData);
        } else {
            weatherModel.setIndexMetadata(indexData);
        }

        /** @type {string|null} */
        let overlayUrl = `${BASE_URL}${weatherModel.activeTimestamp}Z.png`; // Fallback path

        // 2. Load data (image & interpolation)
        try {
            overlayUrl = await fetchWeatherOverlayUrl(weatherModel.activeTimestamp);
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            console.error('❌ Error fetching weather overlay image:', errorMessage);
            weatherModel.setShowError("Error fetching weather overlay image: " + errorMessage);
        }
        
        // 3. Update store state transparently
        weatherModel.setActiveOverlayUrl(overlayUrl);

    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        weatherModel.setShowError("Error during application synchronization: " + errorMessage);
        console.error('❌ Error during application synchronization:', errorMessage);
    }
}


// --- 4. APP LIFECYCLE & EVENT LISTENERS (The Controllers) ---

/**
 * Starts the application bootstrap and polling lifecycle.
 * @returns {Promise<void>}
 */
async function startAppAndSetupPolling() {
    // Erstmaliger Aufruf soll animieren -> in .track() einhüllen
    await loadingManager.track(async () => {
        await syncAppWithServer();
    });

    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
        await syncAppWithServer();
    }, POLL_INTERVAL_MS);
}

startAppAndSetupPolling();

document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
        await loadingManager.track(async () => {
            await syncAppWithServer();
        });
    }
});

window.addEventListener('timeline-change', async (e) => {
    const timelineEvent = /** @type {CustomEvent<{index:number}>} */ (e);
    const idx = timelineEvent.detail && typeof timelineEvent.detail.index === 'number' ? timelineEvent.detail.index : null;
    if (idx === null) return;

    // 1. Set explicit time index in store
    weatherModel.setActiveTimestampIndex(idx);

    /** @type {string|null} */
    let overlayUrl = `${BASE_URL}${weatherModel.activeTimestamp}Z.png`; // Fallback path
    // 2. Load data (image & interpolation)
    await loadingManager.track(async () => {
        try {
            overlayUrl = await fetchWeatherOverlayUrl(weatherModel.activeTimestamp);
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            console.error('❌ Error fetching weather overlay image:', errorMessage);
            weatherModel.setShowError("Error fetching weather overlay image: " + errorMessage);
        }
    });

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

/**
 * Handles Leaflet map click events by loading the corresponding grid cluster
 * and updating the weather model for the clicked location.
 * @param {{latlng:{lat:number,lng:number}}} e Leaflet event object.
 * @returns {Promise<void>}
 */
async function handleMapClick(e) {
    const currentClickToken = Date.now();
    lastClusterClickToken = currentClickToken;

    try {
        let cluster = null;
        // 1. Request cluster asynchronously
        await loadingManager.track(async () => {
            cluster = await weatherApi.fetchCluster(e.latlng, { BASE_URL, lonMin, latMin, gridCellSize: GRID_CELL_SIZE });
        });

        if (lastClusterClickToken !== currentClickToken) return;

        // 2. Once everything is ready: set state in one go
        weatherModel.setPointData(e.latlng, cluster);
    } catch (error) {
        if (lastClusterClickToken === currentClickToken) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('🚨 Error processing map click:', errorMessage);
            weatherModel.setShowError("Error loading location data: " + errorMessage);
        }
    }
}

map.on('click', handleMapClick);

map.on('popupclose', function () {
    lastClusterClickToken = null;

    // Direct, unambiguous cleanup of state
    weatherModel.removePointData();
});

/**
 * Handles successful browser geolocation events by loading the
 * matching cluster and updating the map view.
 * @param {Object} e Leaflet locationfound event object.
 * @param {{lat:number,lng:number}} e.latlng Found geographic coordinates.
 * @returns {Promise<void>}
 */
/**
 * Handles successful browser geolocation events by loading the
 * matching cluster and updating the map view.
 * @param {{latlng:{lat:number,lng:number}}} e Leaflet locationfound event object.
 * @returns {Promise<void>}
 */
async function handleLocationFound(e) {
    const currentClickToken = Date.now();
    lastClusterClickToken = currentClickToken;

    try {
        const cluster = await weatherApi.fetchCluster(e.latlng, { BASE_URL, lonMin, latMin, gridCellSize: GRID_CELL_SIZE });
        if (lastClusterClickToken !== currentClickToken) return;

        map.setView(e.latlng, 14, { animate: true });
        weatherModel.setPointData(e.latlng, cluster);
    } catch (error) {
        if (lastClusterClickToken === currentClickToken) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('🚨 Error processing GPS location:', errorMessage);
            weatherModel.setShowError("Error processing GPS location: " + errorMessage);
        }
    } finally {
        // Turns off loading state in model → View reacts automatically!
        weatherModel.setIsLocating(false);
    }
}

map.on('locationfound', handleLocationFound);

/**
 * @param {{message:string}} e
 */
function handleLocationError(e) {
    weatherModel.setShowError("Error processing GPS location: " + e.message);
    weatherModel.setIsLocating(false); // Turn off on error
}

map.on('locationerror', handleLocationError);

