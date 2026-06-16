import { BASE_URL, lonMin, latMin } from './config.js';
import { weatherModel } from './weatherModel.js';
import { initMap } from './map-init.js';
import { calculateInterpolationFromLoadedCluster } from './utils/interpolation.js';
import { weatherApi } from './weatherApi.js';
import { findClosestTimestampIndex } from './utils/time.js';

// Views
import { registerTimelineView } from './views/timelineView.js';
import { registerForecastView } from './views/forecastView.js';
import { registerLegendView } from './views/legendView.js';
import { registerLogoView } from './views/logoView.js';
import { registerModelInfoView } from './views/modelInfoView.js';
import { registerMapOverlayView } from './views/mapOverlayView.js';

// --- 1. INITIALISIERUNG ---
const { map, windOverlay } = initMap();
registerTimelineView(map);
registerForecastView(map);
registerLegendView(map);
registerLogoView(map);
registerModelInfoView(map);
registerMapOverlayView(map, windOverlay);

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 Minutes
let pollTimer = null;
let lastClusterClickToken = null;
let currentOverlayBlobUrl = null;


// --- 2. LOGIK-PIPELINE (Kein Spaghetti, klare Datenflüsse) ---

/**
 * REINE FUNKTION: Berechnet die Interpolation isoliert.
 * Kapselt das alte Callback-Verhalten und liefert ein sauberes Datenobjekt zurück.
 */
function calculateInterpolation(latlng, cluster, timestamps, activeTimestampIndex) {
    if (!latlng || !cluster) {
        return { forecastData: null, interpolatedValue: null };
    }

    let tableResult = null;
    let singleValueResult = null;

    calculateInterpolationFromLoadedCluster(
        latlng,
        cluster,
        timestamps,
        activeTimestampIndex,
        (tableData) => { tableResult = tableData; },
        (lat, lng, value) => { singleValueResult = { lat, lng, value }; }
    );

    return {
        forecastData: tableResult,
        interpolatedValue: singleValueResult
    };
}

/**
 * ZENTRALE UPDATE-METHODE: Berechnet Daten und füttert den Store in einem Rutsch.
 */
function updateModelInterpolation() {
    const latlng = weatherModel.lastClickedLatLng;
    const cluster = weatherModel.currentClusterData;

    // 1. Berechnung anstoßen
    const result = calculateInterpolation(
        latlng,
        cluster,
        weatherModel.availableTimestamps,
        weatherModel.activeTimestampIndex
    );

    // 2. Zustand atomar in das Modell fließen lassen (Modell triggert daraufhin die Events)
    weatherModel.setForecastData(result.forecastData);
    weatherModel.setInterpolatedValue(result.interpolatedValue);
}

/**
 * Lädt das Wetter-Bild und verwaltet die Speicherbereinigung.
 */
async function loadActiveWeatherOverlayData() {
    try {
        if (!weatherModel.availableTimestamps?.length) return;

        const currentKey = weatherModel.activeTimestamp;
        if (!currentKey) return;

        const imageBlob = await weatherApi.fetchWeatherImageBlob(currentKey, BASE_URL);

        if (currentOverlayBlobUrl) {
            URL.revokeObjectURL(currentOverlayBlobUrl);
        }

        currentOverlayBlobUrl = URL.createObjectURL(imageBlob);
        weatherModel.setActiveOverlayUrl(currentOverlayBlobUrl);

    } catch (error) {
        console.error('🚨 Error loading map overlay data:', error.message);
        const currentKey = weatherModel.activeTimestamp;
        if (currentKey) {
            weatherModel.setActiveOverlayUrl(`${BASE_URL}${currentKey}Z.png`);
        }
    }
}

/**
 * Holt die Gitter-Daten für einen Koordinatenpunkt vom Server.
 */
async function fetchClusterAndRefreshUI(latlng) {
    if (!latlng) return;

    const currentClickToken = Date.now();
    lastClusterClickToken = currentClickToken;

    try {
        const cluster = await weatherApi.fetchCluster(latlng, { BASE_URL, lonMin, latMin });

        if (lastClusterClickToken !== currentClickToken) return;

        weatherModel.setCurrentClusterData(cluster);
        updateModelInterpolation();
    } catch (e) {
        if (lastClusterClickToken === currentClickToken) {
            console.error('🚨 Error fetching cluster data:', e.message);
        }
    }
}

/**
 * Verarbeitet die Metadaten der index.json.
 */
async function processIndexData(indexData) {
    try {
        const prevTimestamps = weatherModel.availableTimestamps || [];
        const prevCurrentKey = prevTimestamps[weatherModel.activeTimestampIndex];

        const timestamps = (indexData.available_timestamps || []).sort();
        weatherModel.setAvailableTimestamps(timestamps);

        let newActiveIndex = weatherModel.activeTimestampIndex;
        if (prevCurrentKey && timestamps.indexOf(prevCurrentKey) !== -1) {
            newActiveIndex = timestamps.indexOf(prevCurrentKey);
        } else {
            newActiveIndex = findClosestTimestampIndex(timestamps);
        }

        weatherModel.setActiveTimestampIndex(newActiveIndex);
        weatherModel.setIndexMetadata(indexData.generated_at, indexData.current_hour);

        await loadActiveWeatherOverlayData();

        if (weatherModel.lastClickedLatLng) {
            await fetchClusterAndRefreshUI(weatherModel.lastClickedLatLng);
        }

    } catch (innerError) {
        console.error('🚨 Error processing index data:', innerError.message);
    }
}

async function fetchIndexAndProcess() {
    try {
        const indexData = await weatherApi.fetchIndex(BASE_URL);
        await processIndexData(indexData);
    } catch (e) {
        console.error('❌ Error fetching index.json:', e.message);
    }
}


// --- 3. ASYNCHRONER APP LIFECYCLE & EVENT LISTENERS ---

async function startAppAndSetupPolling() {
    await fetchIndexAndProcess();

    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
        await fetchIndexAndProcess();
    }, POLL_INTERVAL_MS);
}

startAppAndSetupPolling();

document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
        await fetchIndexAndProcess();
    }
});

window.addEventListener('timeline-change', async (e) => {
    const idx = e.detail && typeof e.detail.index === 'number' ? e.detail.index : null;
    if (idx !== null) {
        weatherModel.setActiveTimestampIndex(idx);
        await loadActiveWeatherOverlayData();
        updateModelInterpolation();
    }
});

map.on('click', async function (e) {
    try {
        weatherModel.setLastClickedLatLng(e.latlng);
        await fetchClusterAndRefreshUI(e.latlng);
    } catch (error) {
        console.error('🚨 General error in map click event:', error.message);
    }
});

map.on('popupclose', function () {
    lastClusterClickToken = null;

    weatherModel.setLastClickedLatLng(null);
    weatherModel.setCurrentClusterData(null);
    updateModelInterpolation();
});