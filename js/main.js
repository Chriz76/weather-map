import { BASE_URL, lonMin, latMin } from './config.js';
import { formatToLocalTimeString } from './utils/time.js';
import { weatherModel } from './weatherModel.js';
import { initMap, windOverlay } from './map-init.js';
import { updateMapMarker, clearMarker } from './views/markerView.js';
import { calculateInterpolationFromLoadedCluster } from './utils/interpolation.js';
import { registerTimelineView } from './views/timelineView.js';
import { registerForecastView } from './views/forecastView.js';
import { registerLegendView } from './views/legendView.js';
import { registerLogoView } from './views/logoView.js';
import { registerModelInfoView } from './views/modelInfoView.js';
import { weatherApi } from './weatherApi.js';

// Initialize map and views
const { map } = initMap();
registerTimelineView(map);
registerForecastView(map);
registerLegendView(map);
registerLogoView(map);
registerModelInfoView(map);

// Fetch + processing helpers
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let pollTimer = null;

// Berechnet die Interpolation zentral und verteilt sie an Modell und Marker
function triggerCentralInterpolation() {
    const latlng = weatherModel.lastClickedLatLng;
    const cluster = weatherModel.currentClusterData;

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
            weatherModel.dispatchEvent(new CustomEvent('model:interpolated-data-updated', {
                detail: { forecastData: interpolatedTableData }
            }));
        },
        (lat, lng, value) => {
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

async function fetchClusterAndRefreshUI(latlng) {
    if (!latlng) return;
    const cluster = await weatherApi.fetchCluster(latlng, { BASE_URL, lonMin, latMin });

    weatherModel.setCurrentClusterData(cluster);
    triggerCentralInterpolation();
}

function processIndexData(indexData, opts = {}) {
    try {
        const prevTimestamps = weatherModel.availableTimestamps || [];
        const prevCurrentKey = prevTimestamps[weatherModel.activeTimestampIndex];

        const timestamps = (indexData.available_timestamps || []).sort();

        weatherModel.setAvailableTimestamps(timestamps);

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

        weatherModel.setActiveTimestampIndex(newActiveIndex);

        // Event mit geladenen indexData an die Views rausfeuern
        window.dispatchEvent(new CustomEvent('state:timestampsUpdated', {
            detail: { indexData: indexData }
        }));

        updateActiveWeatherOverlay();

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
        updateActiveWeatherOverlay();

        const latlng = weatherModel.lastClickedLatLng;
        const cluster = weatherModel.currentClusterData;

        if (latlng && cluster) {
            calculateInterpolationFromLoadedCluster(
                latlng,
                cluster,
                weatherModel.availableTimestamps,
                weatherModel.activeTimestampIndex,
                () => { },
                (lat, lng, value) => {
                    updateMapMarker(map, lat, lng, value);
                }
            );
        }
    }
});

function updateActiveWeatherOverlay() {
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

    } catch (error) {
        console.error('🚨 Error updating map overlay:', error.message);
    }
}

map.on('click', function (e) {
    try {
        weatherModel.setLastClickedLatLng(e.latlng);
        fetchClusterAndRefreshUI(e.latlng);
    } catch (error) {
        console.error('🚨 General error in map click event:', error.message);
    }
});

map.on('popupclose', function () {
    clearMarker(map);
    weatherModel.setLastClickedLatLng(null);
    weatherModel.setCurrentClusterData(null);
    triggerCentralInterpolation();
});