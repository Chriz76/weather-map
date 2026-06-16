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
import { registerMapOverlayView } from './views/mapOverlayView.js'; // 👈 Neu importiert

// Initialize map, layer and views
const { map, windOverlay } = initMap();
registerTimelineView(map);
registerForecastView(map);
registerLegendView(map);
registerLogoView(map);
registerModelInfoView(map);
registerMapOverlayView(map, windOverlay); // 👈 Verwaltet jetzt autonom Marker und Bild-Updates!

// Fetch + processing helpers
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let pollTimer = null;

// Berechnet die Interpolation zentral und verteilt sie an das Modell
function triggerCentralInterpolation() {
    const latlng = weatherModel.lastClickedLatLng;
    const cluster = weatherModel.currentClusterData;

    if (!latlng || !cluster) {
        // --- GEÄNDERT: Übergabe an den neuen Store-Setter bei Leerung ---
        weatherModel.setForecastData(null);
        weatherModel.setInterpolatedValue(null); // 👈 Setzt auch den Marker-Zustand zurück
        return;
    }

    calculateInterpolationFromLoadedCluster(
        latlng,
        cluster,
        weatherModel.availableTimestamps,
        weatherModel.activeTimestampIndex,
        (interpolatedTableData) => {
            // --- GEÄNDERT: Kein manuelles dispatchEvent mehr, sondern Aufruf des Setters im Modell ---
            weatherModel.setForecastData(interpolatedTableData);
        },
        (lat, lng, value) => {
            // 👈 Ändert nur noch den Zustand im Store!
            weatherModel.setInterpolatedValue({ lat, lng, value });
        }
    );
}

// Lädt das aktuelle Wetter-Overlay-Bild und schiebt das Ergebnis in das Modell
function loadActiveWeatherOverlayData() {
    try {
        if (!weatherModel.availableTimestamps || weatherModel.availableTimestamps.length === 0) return;

        const currentKey = weatherModel.activeTimestamp;
        if (!currentKey) return;

        weatherApi.fetchWeatherImageBlob(currentKey, BASE_URL)
            .then(imageBlob => {
                const reader = new FileReader();
                reader.onloadend = function () {
                    // 👈 Daten fertig verarbeitet? Ab in den Store!
                    weatherModel.setActiveOverlayUrl(reader.result);
                };
                reader.readAsDataURL(imageBlob);
            })
            .catch(err => {
                console.error('🚨 Error during weather image fetch:', err.message);
                // Fallback-Pfad direkt in den Store jagen
                weatherModel.setActiveOverlayUrl(`${BASE_URL}${currentKey}Z.png`);
            });

    } catch (error) {
        console.error('🚨 Error loading map overlay data:', error.message);
    }
}

async function fetchIndexAndProcess() {
    try {
        const indexData = await weatherApi.fetchIndex(BASE_URL);
        processIndexData(indexData);
    } catch (e) {
        console.error('❌ Error fetching index.json:', e.message);
    }
}

async function fetchClusterAndRefreshUI(latlng) {
    if (!latlng) return;
    const cluster = await weatherApi.fetchCluster(latlng, { BASE_URL, lonMin, latMin });

    weatherModel.setCurrentClusterData(cluster);
    triggerCentralInterpolation();
}

function processIndexData(indexData) {
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

        loadActiveWeatherOverlayData(); // 👈 Bilddaten initial anfordern

        if (weatherModel.lastClickedLatLng) {
            fetchClusterAndRefreshUI(weatherModel.lastClickedLatLng);
        }

    } catch (innerError) {
        console.error('🚨 Error processing index data:', innerError.message);
    }
}

// Initial fetch & Polling
fetchIndexAndProcess().then(() => {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(fetchIndexAndProcess, POLL_INTERVAL_MS);
});

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        fetchIndexAndProcess();
    }
});

// Listen to timeline changes
window.addEventListener('timeline-change', (e) => {
    const idx = e.detail && typeof e.detail.index === 'number' ? e.detail.index : null;
    if (idx !== null) {
        weatherModel.setActiveTimestampIndex(idx);
        loadActiveWeatherOverlayData(); // 👈 Aktualisiert das Bild über den Store
        triggerCentralInterpolation();
    }
});

// Map User-Interactions
map.on('click', function (e) {
    try {
        weatherModel.setLastClickedLatLng(e.latlng);
        fetchClusterAndRefreshUI(e.latlng);
    } catch (error) {
        console.error('🚨 General error in map click event:', error.message);
    }
});

map.on('popupclose', function () {
    // 👈 Alle Zustandsänderungen laufen sauber über das Modell
    weatherModel.setLastClickedLatLng(null);
    weatherModel.setCurrentClusterData(null);
    triggerCentralInterpolation();
});