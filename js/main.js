import { BASE_URL, lonMin, latMin } from './config.js';
import { formatToLocalDateTimeString, formatToLocalTimeString, formatIsoOrDateToLocalDisplay } from './utils/time.js';
import { state, setAvailableTimestamps, setActiveTimestampIndex, setLastClickedLatLng, setCurrentClusterData } from './weatherModel.js';
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
window._availableTimestamps = state.availableTimestamps;
window._activeTimestampIndex = state.activeTimestampIndex;

// Fetch + processing helpers
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let pollTimer = null;

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

    // State aktualisieren
    setCurrentClusterData(cluster);

    // UI / Tabelle berechnen & updaten mit frischen Daten
    calculateInterpolationFromLoadedCluster(
        latlng,
        cluster,
        state.availableTimestamps,
        state.activeTimestampIndex,
        window.updateForecastTableUI,
        (lat, lng, value) => updateMapMarker(map, lat, lng, value)
    );
}

function processIndexData(indexData, opts = {}) {
    try {
        const prevTimestamps = state.availableTimestamps || [];
        const prevCurrentKey = prevTimestamps[state.activeTimestampIndex];

        const timestamps = (indexData.available_timestamps || []).sort();
        setAvailableTimestamps(timestamps);
        window._availableTimestamps = timestamps;

        // Versuche, denselben absoluten Zeitpunkt beizubehalten
        let newActiveIndex = state.activeTimestampIndex;
        if (prevCurrentKey) {
            const idxOfPrev = timestamps.indexOf(prevCurrentKey);
            if (idxOfPrev !== -1) {
                newActiveIndex = idxOfPrev;
            } else {
                // Der alte Timestamp ist aus der Timeline geflogen (Zeit vergangen).
                // Springe automatisch zum Eintrag, der am nächsten an "Jetzt" liegt.
                newActiveIndex = findClosestTimestampIndex(timestamps);
            }
        } else {
            // Kein vorheriger Key vorhanden (erster Start)
            newActiveIndex = findClosestTimestampIndex(timestamps);
        }

        setActiveTimestampIndex(newActiveIndex);
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
        // fetchClusterAndRefreshUI berechnet die Tabelle neu, sobald die Daten da sind.
        if (state.lastClickedLatLng) {
            fetchClusterAndRefreshUI(state.lastClickedLatLng);
        }

    } catch (innerError) {
        console.error('🚨 Error processing index data:', innerError.message);
    }
}

// Initial fetch
fetchIndexAndProcess().then(() => {
    // start polling
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
window.addEventListener('timeline-change', (e) => {
    const idx = e.detail && typeof e.detail.index === 'number' ? e.detail.index : null;
    if (idx !== null) {
        setActiveTimestampIndex(idx);
        window._activeTimestampIndex = idx;

        // 1. Karte und Slider visuell updaten
        updateActiveWeatherView();

        // 2. Tabelle für den neuen Zeitpunkt sofort neu berechnen (da die Cluster-Daten unverändert sind)
        if (state.lastClickedLatLng && state.currentClusterData) {
            calculateInterpolationFromLoadedCluster(
                state.lastClickedLatLng,
                state.currentClusterData,
                state.availableTimestamps,
                state.activeTimestampIndex,
                window.updateForecastTableUI,
                (lat, lng, value) => updateMapMarker(map, lat, lng, value)
            );
        }

        if (window.highlightActiveForecastHour) window.highlightActiveForecastHour();
        if (window.scrollActiveForecastHourToCenter) window.scrollActiveForecastHourToCenter();
    }
});

// Aktualisiert ausschließlich das visuelle Wetterbild und die Slider-Position
function updateActiveWeatherView() {
    try {
        if (!state.availableTimestamps || state.availableTimestamps.length === 0) return;

        const currentKey = state.availableTimestamps[state.activeTimestampIndex];
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
                // Fallback: Die rohe URL direkt setzen, falls der Blob-Fetch fehlschlägt
                if (windOverlay) windOverlay.setUrl(`${BASE_URL}${currentKey}Z.png`);
            });

        const localTimeDisplayStr = formatToLocalTimeString(currentKey);
        const el = document.getElementById('timeline-time-display');
        if (el) el.innerText = localTimeDisplayStr;

        const slider = document.getElementById('time-slider');
        if (slider) slider.value = state.activeTimestampIndex;

    } catch (error) {
        console.error('🚨 Error updating map view (slider change):', error.message);
    }
}

// Map click: load cluster and interpolate
map.on('click', function (e) {
    try {
        setLastClickedLatLng(e.latlng);
        fetchClusterAndRefreshUI(e.latlng);
    } catch (error) {
        console.error('🚨 General error in map click event:', error.message);
    }
});

// Popup close handler
map.on('popupclose', function () {
    console.log('ℹ️ Popup closed. Remove marker & hide forecast.');
    clearMarker(map);
    setLastClickedLatLng(null);
    setCurrentClusterData(null);
    if (window.hideForecastTableUI) window.hideForecastTableUI();
});

// When active index changes elsewhere, update UI
window.addEventListener('state:activeIndexUpdated', (e) => {
    const idx = e.detail && typeof e.detail.index === 'number' ? e.detail.index : null;
    if (idx !== null) {
        window._activeTimestampIndex = idx;
        const timeEl = document.getElementById('timeline-time-display');
        if (timeEl && state.availableTimestamps && state.availableTimestamps[idx]) {
            timeEl.innerText = formatToLocalTimeString(state.availableTimestamps[idx]);
        }
        if (window.highlightActiveForecastHour) window.highlightActiveForecastHour();
        if (window.scrollActiveForecastHourToCenter) window.scrollActiveForecastHourToCenter();
    }
});