import { BASE_URL, lonMin, latMin, GRID_CELL_SIZE } from './config.js';
import { weatherModel } from './weatherModel.js';
import { initMap } from './map-init.js';
import { weatherApi } from './weatherApi.js';
import { storage } from './utils/storage.js'; // Fallback für normalen Zustand
import { loadingManager } from './utils/loadingManager.js';
import { errorController } from './utils/errorController.js';

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

/** @type {string|null} */
let lastTimelineTimestampToken = null;
/** @type {number|null} */
let timelineDebounceTimer = null;
const SLIDER_DEBOUNCE_MS = 50; 


// --- 2. LOGIC PIPELINE ---

/**
 * @param {string|null} timestamp
 * @returns {Promise<string|null>}
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


// --- 3. CENTRAL COORDINATION & URL HANDLING ---

/**
 * NEU: Prüft die URL auf lat/lon Parameter (?lat=54.4150&lon=11.1022)
 * Falls vorhanden, wird die Karte zentriert und der Klick-Handler simuliert.
 */
async function checkAndHandleUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const latParam = urlParams.get('lat');
    const lonParam = urlParams.get('lon');

    if (latParam && lonParam) {
        const lat = parseFloat(latParam);
        const lng = parseFloat(lonParam); // Leaflet nutzt 'lng'

        if (!isNaN(lat) && !isNaN(lng)) {
            const targetLatLng = { lat, lng };
            
            // 1. Karte sofort dorthin bewegen (z.B. Zoom 12 für Spots)
            map.setView(targetLatLng, 12);
            
            // 2. Wetterdaten für diesen Spot direkt laden
            await handleMapClick({ latlng: targetLatLng });
        }
    }
}

/**
 * Synchronizes model state with current backend data.
 * @returns {Promise<void>}
 */
async function syncAppWithServer() {
    try {
        const indexData = /** @type {{available_timestamps?: string[], generated_at?: string, current_hour?: string}} */ (await weatherApi.fetchIndex(BASE_URL));

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
        let overlayUrl = `${BASE_URL}${weatherModel.activeTimestamp}Z.webp`; 

        try {
            overlayUrl = await fetchWeatherOverlayUrl(weatherModel.activeTimestamp);
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            console.error('❌ Error fetching weather overlay image:', errorMessage);
            errorController.showError("Error fetching weather overlay image: " + errorMessage);
        }
        
        weatherModel.setActiveOverlayUrl(overlayUrl);

    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        errorController.showError("Error during application synchronization: " + errorMessage);
        console.error('❌ Error during application synchronization:', errorMessage);
    }
}


// --- 4. APP LIFECYCLE & EVENT LISTENERS ---

/**
 * Starts the application bootstrap, processes URL parameters and polling lifecycle.
 * @returns {Promise<void>}
 */
async function startAppAndSetupPolling() {
    await loadingManager.track(async () => {
        // Erst Basisdaten vom Server holen
        await syncAppWithServer();
        // NEU: Direkt danach prüfen, ob wir zu einem iFrame-Spot springen müssen
        await checkAndHandleUrlParams();
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

window.addEventListener('timeline-change', (e) => {
    const timelineEvent = /** @type {CustomEvent<{index:number}>} */ (e);
    const idx = timelineEvent.detail && typeof timelineEvent.detail.index === 'number' ? timelineEvent.detail.index : null;
    if (idx === null) return;

    weatherModel.setActiveTimestampIndex(idx);

    if (timelineDebounceTimer) {
        clearTimeout(timelineDebounceTimer);
    }

    timelineDebounceTimer = window.setTimeout(async () => {
        const targetTimestamp = weatherModel.activeTimestamp;
        if (!targetTimestamp) return;

        lastTimelineTimestampToken = targetTimestamp;
        /** @type {string|null} */
        let overlayUrl = `${BASE_URL}${targetTimestamp}Z.webp`; 

        await loadingManager.track(async () => {
            try {
                overlayUrl = await fetchWeatherOverlayUrl(targetTimestamp);
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : String(err);
                console.error('❌ Error fetching weather overlay image:', errorMessage);
                errorController.showError("Error fetching weather overlay image: " + errorMessage);
            }
        });

        if (lastTimelineTimestampToken !== targetTimestamp) {
            return;
        }

        weatherModel.setActiveOverlayUrl(overlayUrl); 
        
    }, SLIDER_DEBOUNCE_MS);
});

// MAP EXTENSION: Kartenzustand sichern (nur wenn keine URL-Parameter aktiv sind)
map.on('moveend', () => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('lat') && urlParams.has('lon')) return; // Verhindert Überschreiben im iFrame

    const center = map.getCenter();
    storage.saveMapState({
        lat: center.lat,
        lng: center.lng,
        zoom: map.getZoom()
    });
});

/**
 * Handles Leaflet map click events
 * @param {{latlng:{lat:number,lng:number}}} e Leaflet event object.
 * @returns {Promise<void>}
 */
async function handleMapClick(e) {
    const currentClickToken = Date.now();
    lastClusterClickToken = currentClickToken;

    try {
        let cluster = null;
        await loadingManager.track(async () => {
            cluster = await weatherApi.fetchCluster(e.latlng, { BASE_URL, lonMin, latMin, gridCellSize: GRID_CELL_SIZE });
        });

        if (lastClusterClickToken !== currentClickToken) return;
        weatherModel.setPointData(e.latlng, cluster);
    } catch (error) {
        if (lastClusterClickToken === currentClickToken) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('🚨 Error processing map click:', errorMessage);
            errorController.showError("Error loading location data: " + errorMessage);
        }
    }
}

map.on('click', handleMapClick);

map.on('popupclose', function () {
    lastClusterClickToken = null;
    weatherModel.removePointData();
});

/**
 * @param {{latlng:{lat:number,lng:number}}} e
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
            errorController.showError("Error processing GPS location: " + errorMessage);
        }
    } finally {
        weatherModel.setIsLocating(false);
    }
}

map.on('locationfound', handleLocationFound);

/**
 * @param {{message:string}} e
 */
function handleLocationError(e) {
    errorController.showError("Error processing GPS location: " + e.message);
    weatherModel.setIsLocating(false);
}

map.on('locationerror', handleLocationError);