import { BASE_URL, lonMin, latMin } from './config.js';
import { weatherModel } from './weatherModel.js';
import { initMap } from './map-init.js';
import { weatherApi } from './weatherApi.js';
import { storage } from './utils/storage.js'; // Behalten für Map-State

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
registerLegendView(map);
registerLogoView(map);
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

        // 1. BLITZSCHNELLER CHECK: Wenn sich das Erstellungsdatum nicht geändert hat -> Abbruch
        if (weatherModel.generatedAt === indexData.generated_at && weatherModel.generatedAt) {
            return;
        }

        if (weatherModel.lastClickedLatLng) {
            let clusterData = await weatherApi.fetchCluster(weatherModel.lastClickedLatLng, { BASE_URL, lonMin, latMin });
            weatherModel.setIndexMetadata(indexData);
            weatherModel.setPointData(weatherModel.lastClickedLatLng, clusterData);
        } else {
            weatherModel.setIndexMetadata(indexData);
        }

        // 2. Daten laden (Bild & Interpolation)
        const overlayUrl = await fetchWeatherOverlayUrl(weatherModel.activeTimestamp);

        // 3. Store-Zustand transparent aktualisieren
        weatherModel.setActiveOverlayUrl(overlayUrl);

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

    // 3. Store-Zustand transparent aktualisieren
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
        // 1. Cluster asynchron anfordern
        const cluster = await weatherApi.fetchCluster(e.latlng, { BASE_URL, lonMin, latMin });
        if (lastClusterClickToken !== currentClickToken) return;

        // 2. Erst wenn alles bereitsteht: State in einem Rutsch setzen
        weatherModel.setPointData(e.latlng, cluster);
    } catch (error) {
        if (lastClusterClickToken === currentClickToken) {
            console.error('🚨 Error processing map click:', error.message);
        }
    }
});

map.on('popupclose', function () {
    lastClusterClickToken = null;

    // Direktes, unverschachteltes Ausmisten des Zustands
    weatherModel.removePointData();
});

map.on('locationfound', async function (e) {
    const currentClickToken = Date.now();
    lastClusterClickToken = currentClickToken;

    try {
        const cluster = await weatherApi.fetchCluster(e.latlng, { BASE_URL, lonMin, latMin });
        if (lastClusterClickToken !== currentClickToken) return;

        map.setView(e.latlng, 14, { animate: true });
        weatherModel.setPointData(e.latlng, cluster);
    } catch (error) {
        if (lastClusterClickToken === currentClickToken) {
            console.error('🚨 Error processing GPS location:', error.message);
        }
    } {
        // Schaltet den Ladezustand im Modell aus -> View reagiert automatisch!
        weatherModel.setIsLocating(false);
    }
});

map.on('locationerror', function (e) {
    alert(`Standort-Fehler: ${e.message}`);
    weatherModel.setIsLocating(false); // Ausschalten bei Fehler
});