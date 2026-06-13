import { BASE_URL, lonMin, latMin } from './config.js';
import { formatToLocalDateTimeString, formatToLocalTimeString, formatIsoOrDateToLocalDisplay } from './utils/time.js';
import { weatherModel } from './weatherModel.js'; // 👈 Nur noch das saubere Objekt importieren!
import { initMap, windOverlay } from './map-init.js';
import { updateMapMarker, clearMarker } from './views/marker.js';
import { calculateInterpolationFromLoadedCluster } from './utils/interpolation.js';
import { registerTimelineControl } from './views/timeline.js';
import { registerForecastTable } from './views/forecastTable.js';
import { registerLegend } from './views/legend.js';
import { registerLogoControl } from './views/logoWidget.js';
import { weatherApi } from './weatherApi.js';

// Initialize map and views
const { map } = initMap();
registerTimelineControl(map);
registerForecastTable(map);
registerLegend(map);
registerLogoControl(map);

// Keep lightweight globals for compatibility
window._availableTimestamps = weatherModel.availableTimestamps;
window._activeTimestampIndex = weatherModel.activeTimestampIndex;

// Fetch + processing helpers
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let pollTimer = null;

// Berechnet die Interpolation zentral und verteilt sie an Modell und Marker
function triggerCentralInterpolation() {
    const latlng = weatherModel.lastClickedLatLng;
    const cluster = weatherModel.currentClusterData;

    // Wenn der State geleert wurde (Popup zu), löschen wir auch die Tabellendaten im Modell
    if (!latlng || !cluster) {
        weatherModel.dispatchEvent(new CustomEvent('model:interpolated-data-updated', { detail: { forecastData: null } }));
        return;
    }

    calculateInterpolationFromLoadedCluster(
        latlng,
        cluster,
        weatherModel.availableTimestamps,
        weatherModel.activeTimestampIndex,
        (interpolatedTableData) => {
            // 1. Wir feuern die fertigen Daten direkt über das Modell an die Tabelle
            weatherModel.dispatchEvent(new CustomEvent('model:interpolated-data-updated', {
                detail: { forecastData: interpolatedTableData }
            }));
        },
        (lat, lng, value) => {
            // 2. Wir aktualisieren den Marker direkt von der main.js aus!
            updateMapMarker(map, lat, lng, value);
        }
    );
}

// Hilfsfunktion: Ermittelt den Index, der dem aktuellen Zeitpunkt am nächsten liegt
function findClosestTimestampIndex(timestamps) {
    if (!timestamps || timestamps.length === 0) return 0;

    const now = new Date();
    let closestIndex = 0;
    let minDiff = Infinity;

    timestamps.forEach((tKey, idx) => {
        const year = parseInt(tKey.substring(0, 4), 10);
        const month = parseInt(tKey.substring(4, 6), 10) - 1;
        const day = parseInt(tKey.substring(6, 8), 10);
        const hour = parseInt(tKey.substring(9, 11), 10);
        const tDate = new Date(Date.UTC(year, month, day, hour, 0, 0));
        const diff = Math.abs(now - tDate);
        if (diff < minDiff) {
            minDiff = diff;
            closestIndex = idx;
        }
    });
    return closestIndex;
}

async function fetchIndexAndProcess() {
    try {
        const indexData = await weatherApi.fetchIndex(BASE_URL);
        processIndexData(indexData, { fromPoll: true });
    } catch (e) {
        console.error('❌ Error fetching index.json:', e.message);
    }
}

// Zentrale Funktion: Holt Cluster-Daten frisch vom Server und rendert die UI neu
async function fetchClusterAndRefreshUI(latlng) {
    if (!latlng) return;
    const cluster = await weatherApi.fetchCluster(latlng, { BASE_URL, lonMin, latMin });

    weatherModel.setCurrentClusterData(cluster);
    triggerCentralInterpolation(); // 👈 Berechnen starten!
}

function processIndexData(indexData, opts = {}) {
    try {
        const prevTimestamps = weatherModel.availableTimestamps || [];
        const prevCurrentKey = prevTimestamps[weatherModel.activeTimestampIndex];

        const timestamps = (indexData.available_timestamps || []).sort();

        // 👈 Über das Objekt schreiben!
        weatherModel.setAvailableTimestamps(timestamps);
        window._availableTimestamps = timestamps;

        // Versuche, denselben absoluten Zeitpunkt beizubehalten
        let newActiveIndex = weatherModel.activeTimestampIndex;
        if (prevCurrentKey) {
            const idxOfPrev = timestamps.indexOf(prevCurrentKey);
            if (idxOfPrev !== -1) {
                newActiveIndex = idxOfPrev;
            } else {
                newActiveIndex = findClosestTimestampIndex(timestamps);
            }
        } else {
            newActiveIndex = findClosestTimestampIndex(timestamps);
        }

        // 👈 Über das Objekt schreiben!
        weatherModel.setActiveTimestampIndex(newActiveIndex);
        window._activeTimestampIndex = newActiveIndex;

        // Update model-run info
        const infoEl = document.getElementById('model-run-info');
        if (infoEl) {
            let displayStr = '';
            if (indexData.generated_at) {
                displayStr += `Updated ${formatIsoOrDateToLocalDisplay(indexData.generated_at)} `;
            }
            if (indexData.current_hour) {
                const modelTimeStr = formatToLocalTimeString(indexData.current_hour);
                displayStr += `(Model run ${modelTimeStr})`;
            }
            if (displayStr) infoEl.innerText = displayStr.trim();
        }

        // 1. Karte und Slider visuell anpassen
        updateActiveWeatherView();

        // 2. Wenn ein Punkt aktiv ist, laden wir das dazu passende Cluster frisch nach.
        if (weatherModel.lastClickedLatLng) {
            fetchClusterAndRefreshUI(weatherModel.lastClickedLatLng);
        }

    } catch (innerError) {
        console.error('🚨 Error processing index data:', innerError.message);
    }
}

// Initial fetch
fetchIndexAndProcess().then(() => {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(fetchIndexAndProcess, POLL_INTERVAL_MS);
});

// If tab becomes visible again, fetch immediately to catch up missed updates
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        fetchIndexAndProcess();
    }
});

// Listen to timeline changes (Händisches Schieben des Sliders)
// Im timeline-change Listener in main.js:
window.addEventListener('timeline-change', (e) => {
    const idx = e.detail && typeof e.detail.index === 'number' ? e.detail.index : null;
    if (idx !== null) {
        weatherModel.setActiveTimestampIndex(idx);
        window._activeTimestampIndex = idx;
        updateActiveWeatherView();

        // 🚀 PERFORMANCE-FIX: Nicht die ganze Tabelle neu berechnen!
        // Wir aktualisieren nur den Punkt auf der Karte blitzschnell neu:
        const latlng = weatherModel.lastClickedLatLng;
        const cluster = weatherModel.currentClusterData;

        if (latlng && cluster) {
            calculateInterpolationFromLoadedCluster(
                latlng,
                cluster,
                weatherModel.availableTimestamps,
                weatherModel.activeTimestampIndex,
                () => { }, // 💡 Leere Funktion: Die Tabelle wird IGNORIERT und nicht neu gebaut!
                (lat, lng, value) => {
                    updateMapMarker(map, lat, lng, value); // Nur der Marker zieht mit
                }
            );
        }
    }
});

// Aktualisiert ausschließlich das visuelle Wetterbild und die Slider-Position
function updateActiveWeatherView() {
    try {
        if (!weatherModel.availableTimestamps || weatherModel.availableTimestamps.length === 0) return;

        const currentKey = weatherModel.availableTimestamps[weatherModel.activeTimestampIndex];
        if (!currentKey) return;

        weatherApi.fetchWeatherImageBlob(currentKey, BASE_URL)
            .then(imageBlob => {
                const reader = new FileReader();
                reader.onloadend = function () {
                    const base64data = reader.result;
                    if (windOverlay) windOverlay.setUrl(base64data);
                }
                reader.readAsDataURL(imageBlob);
            })
            .catch(err => {
                console.error('🚨 Error during ETag check for weather image:', err.message);
                if (windOverlay) windOverlay.setUrl(`${BASE_URL}${currentKey}Z.png`);
            });

        const localTimeDisplayStr = formatToLocalTimeString(currentKey);
        const el = document.getElementById('timeline-time-display');
        if (el) el.innerText = localTimeDisplayStr;

        const slider = document.getElementById('time-slider');
        if (slider) slider.value = weatherModel.activeTimestampIndex;

    } catch (error) {
        console.error('🚨 Error updating map view (slider change):', error.message);
    }
}

// Map click: load cluster and interpolate
map.on('click', function (e) {
    try {
        // 👈 Über das Objekt schreiben!
        weatherModel.setLastClickedLatLng(e.latlng);
        fetchClusterAndRefreshUI(e.latlng);
    } catch (error) {
        console.error('🚨 General error in map click event:', error.message);
    }
});

// Popup close handler
map.on('popupclose', function () {
    clearMarker(map);
    weatherModel.setLastClickedLatLng(null);
    weatherModel.setCurrentClusterData(null);

    triggerCentralInterpolation(); // 👈 Sorgt dafür, dass sich die Tabelle schließt!
});