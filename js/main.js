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

// Initialize map, layer and views
const { map, windOverlay } = initMap();
registerTimelineView(map);
registerForecastView(map);
registerLegendView(map);
registerLogoView(map);
registerModelInfoView(map);
registerMapOverlayView(map, windOverlay);

// Fetch + processing helpers
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let pollTimer = null;

// Berechnet die Interpolation zentral und verteilt sie an das Modell
function triggerCentralInterpolation() {
    const latlng = weatherModel.lastClickedLatLng;
    const cluster = weatherModel.currentClusterData;

    if (!latlng || !cluster) {
        weatherModel.setForecastData(null);
        weatherModel.setInterpolatedValue(null);
        return;
    }

    calculateInterpolationFromLoadedCluster(
        latlng,
        cluster,
        weatherModel.availableTimestamps,
        weatherModel.activeTimestampIndex,
        (interpolatedTableData) => {
            weatherModel.setForecastData(interpolatedTableData);
        },
        (lat, lng, value) => {
            weatherModel.setInterpolatedValue({ lat, lng, value });
        }
    );
}

// Trackt die aktive Blob-URL für den Speicher-Cleanup
let currentOverlayBlobUrl = null;

async function loadActiveWeatherOverlayData() {
    try {
        if (!weatherModel.availableTimestamps || weatherModel.availableTimestamps.length === 0) return;

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

async function fetchIndexAndProcess() {
    try {
        const indexData = await weatherApi.fetchIndex(BASE_URL);
        await processIndexData(indexData);
    } catch (e) {
        console.error('❌ Error fetching index.json:', e.message);
    }
}

// --- FIX: Race Conditions absichern & async/await aktivieren ---
let lastClusterClickToken = null;

async function fetchClusterAndRefreshUI(latlng) {
    if (!latlng) return;

    // Erzeuge einen eindeutigen Zeitstempel für diesen spezifischen Klick
    const currentClickToken = Date.now();
    lastClusterClickToken = currentClickToken;

    try {
        const cluster = await weatherApi.fetchCluster(latlng, { BASE_URL, lonMin, latMin });

        // Wenn in der Zwischenzeit ein neuerer Klick passiert ist, brechen wir hier ab!
        if (lastClusterClickToken !== currentClickToken) return;

        weatherModel.setCurrentClusterData(cluster);
        triggerCentralInterpolation();
    } catch (e) {
        // Auch im Fehlerfall prüfen, ob die Anfrage noch aktuell ist
        if (lastClusterClickToken === currentClickToken) {
            console.error('🚨 Error fetching cluster data:', e.message);
        }
    }
}

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
        triggerCentralInterpolation();
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
    // Falls noch ein Klick-Request fliegt, entwerten wir ihn hier
    lastClusterClickToken = null;

    weatherModel.setLastClickedLatLng(null);
    weatherModel.setCurrentClusterData(null);
    triggerCentralInterpolation();
});