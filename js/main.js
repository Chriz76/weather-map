import { BASE_URL, lonMin, latMin } from './config.js';
import { weatherModel } from './weatherModel.js';
import { initMap } from './map-init.js';
import { calculateInterpolationFromLoadedCluster } from './utils/interpolation.js';
import { weatherApi } from './weatherApi.js';
import { determineActiveIndex } from './utils/time.js'; // 🌟 Saubere, neue Methode importiert

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

const POLL_INTERVAL_MS = 5 * 60 * 1000;
let pollTimer = null;
let lastClusterClickToken = null;
let currentOverlayBlobUrl = null;


// --- 2. LOGIK-PIPELINE (Reine Datenbeschaffung) ---

/**
 * Holt ein Wetter-Bild und liefert die Object-URL zurück (ohne das Modell zu kennen).
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
        return `${BASE_URL}${timestamp}Z.png`; // Fallback-Pfad
    }
}


// --- 3. ZENTRALE KOORDINATION ---

/**
 * Lädt die API-Struktur (index.json), verarbeitet Bilder sowie Cluster und setzt den State atomar.
 */
async function syncAppWithServer() {
    try {
        const indexData = await weatherApi.fetchIndex(BASE_URL);

        // 1. 🌟 SORTIERUNG DER LISTE: Direkt an der Quelle nach dem Fetch
        const timestamps = (indexData.available_timestamps || []).sort();

        // 2. Index-Bestimmung schlank über die ausgelagerte Methode
        const activeIndex = determineActiveIndex(timestamps, weatherModel.activeTimestamp);

        // 3. Bildpfad basierend auf dem errechneten Key ermitteln
        const activeTimestamp = timestamps[activeIndex];
        const overlayUrl = await fetchWeatherOverlayUrl(activeTimestamp);

        // 4. Bestehenden Gitterpunkt-Cluster aktualisieren (falls ein Ort aktiv ist)
        let clusterData = weatherModel.currentClusterData;
        if (weatherModel.lastClickedLatLng) {
            clusterData = await weatherApi.fetchCluster(weatherModel.lastClickedLatLng, { BASE_URL, lonMin, latMin });
        }

        // 5. Interpolation für UI-Komponenten ausführen
        const interpolation = calculateInterpolationFromLoadedCluster(
            weatherModel.lastClickedLatLng,
            clusterData,
            activeTimestamp
        );

        // 6. ATOMARER STATE-UPDATE: Komplett transparent aus den lokalen Variablen & indexData befüllt
        weatherModel.setAvailableTimestamps(timestamps);
        weatherModel.setActiveTimestampIndex(activeIndex);
        weatherModel.setIndexMetadata(indexData.generated_at, indexData.current_hour);
        weatherModel.setActiveOverlayUrl(overlayUrl);
        weatherModel.setCurrentClusterData(clusterData);
        weatherModel.setForecastData(interpolation.forecastData);
        weatherModel.setInterpolatedValue(interpolation.interpolatedValue);

    } catch (e) {
        console.error('❌ Error during application synchronization:', e.message);
    }
}


// --- 4. APP LIFECYCLE & EVENT LISTENERS (Die Controller) ---

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

    // 1. Expliziten Zeitindex im Store setzen
    weatherModel.setActiveTimestampIndex(idx);

    // 2. Daten laden (Bild & Interpolation)
    const overlayUrl = await fetchWeatherOverlayUrl(weatherModel.activeTimestamp);
    const interpolation = calculateInterpolationFromLoadedCluster(
        weatherModel.lastClickedLatLng,
        weatherModel.currentClusterData,
        weatherModel.activeTimestamp
    );

    // 3. Store-Zustand transparent aktualisieren
    weatherModel.setActiveOverlayUrl(overlayUrl);
    weatherModel.setForecastData(interpolation.forecastData);
    weatherModel.setInterpolatedValue(interpolation.interpolatedValue);
});

map.on('click', async function (e) {
    const currentClickToken = Date.now();
    lastClusterClickToken = currentClickToken;

    try {
        // 1. Cluster asynchron anfordern
        const cluster = await weatherApi.fetchCluster(e.latlng, { BASE_URL, lonMin, latMin });
        if (lastClusterClickToken !== currentClickToken) return;

        // 2. Werte für Interpolation berechnen
        const interpolation = calculateInterpolationFromLoadedCluster(e.latlng, cluster, weatherModel.activeTimestamp);

        // 3. Erst wenn alles bereitsteht: State in einem Rutsch setzen
        weatherModel.setLastClickedLatLng(e.latlng);
        weatherModel.setCurrentClusterData(cluster);
        weatherModel.setForecastData(interpolation.forecastData);
        weatherModel.setInterpolatedValue(interpolation.interpolatedValue);

    } catch (error) {
        if (lastClusterClickToken === currentClickToken) {
            console.error('🚨 Error processing map click:', error.message);
        }
    }
});

map.on('popupclose', function () {
    lastClusterClickToken = null;

    // Direktes, unverschachteltes Ausmisten des Zustands
    weatherModel.setLastClickedLatLng(null);
    weatherModel.setCurrentClusterData(null);
    weatherModel.setForecastData(null);
    weatherModel.setInterpolatedValue(null);
});