import { state, setAvailableTimestamps, setActiveTimestampIndex, setLastClickedLatLng, setCurrentClusterData } from './state.js';
import { BASE_URL, lonMin, latMin } from './config.js';
import { formatToLocalDateTimeString, formatToLocalTimeString } from './utils/time.js';
import { initMap, windOverlay } from './map-init.js';
import { updateMapMarker, clearMarker } from './marker.js';
import { calculateInterpolationFromLoadedCluster } from './interpolation.js';
import { registerTimelineControl } from './controls/timeline.js';
import { registerForecastTable } from './controls/forecastTable.js';

// Initialize map and controls
const { map } = initMap();
registerTimelineControl(map);
registerForecastTable(map);

// Keep lightweight globals for compatibility
window._availableTimestamps = state.availableTimestamps;
window._activeTimestampIndex = state.activeTimestampIndex;

// Fetch index.json and initialize timestamps
fetch(`${BASE_URL}index.json`, { cache: 'no-cache' })
  .then(r => {
    if (!r.ok) throw new Error(`index.json could not be loaded (status: ${r.status})`);
    return r.json();
  })
  .then(indexData => {
    try {
      const timestamps = (indexData.available_timestamps || []).sort();
      setAvailableTimestamps(timestamps);
      window._availableTimestamps = timestamps;

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
        if (diff < minDiff) { minDiff = diff; closestIndex = idx; }
      });

      setActiveTimestampIndex(closestIndex);
      window._activeTimestampIndex = closestIndex;

      // --- ANPASSUNG: Update model-run info inkl. Generierungszeitpunkt ---
      const infoEl = document.getElementById('model-run-info');
      if (infoEl) {
        let displayStr = "";

        // 1. Erstelle den "Updated"-Teil falls generated_at existiert
        if (indexData.generated_at) {
          const updateDate = new Date(indexData.generated_at);
          
          // Formatiere lokal (z.B. "31.12. 16:45") mit führenden Nullen
          const day = String(updateDate.getDate()).padStart(2, '0');
          const month = String(updateDate.getMonth() + 1).padStart(2, '0');
          const hours = String(updateDate.getHours()).padStart(2, '0');
          const minutes = String(updateDate.getMinutes()).padStart(2, '0');
          
          displayStr += `Updated ${day}.${month}. ${hours}:${minutes} `;
        }

        // 2. Erstelle den "Modelbasis"-Teil
        if (indexData.current_hour) {
          // Extrahiere nur die Uhrzeit im lokalen Format (z.B. "16:00") aus deiner Funktion
          // Alternativ falls formatToLocalDateTimeString das ganze Datum ausgibt, hier angepasst:
          const modelTimeStr = formatToLocalDateTimeString(indexData.current_hour);
          displayStr += `(Modelbasis ${modelTimeStr})`;
        }

        // Setze den Text ins UI
        if (displayStr) {
          infoEl.innerText = displayStr.trim();
        }
      }

      // Initial view
      updateActiveWeatherView();

    } catch (innerError) {
      console.error('🚨 Error processing index data:', innerError.message);
    }
  })
  .catch(e => console.error('❌ Critical error during app start:', e.message));

// Listen to timeline changes
window.addEventListener('timeline-change', (e) => {
  const idx = e.detail && typeof e.detail.index === 'number' ? e.detail.index : null;
  if (idx !== null) {
    setActiveTimestampIndex(idx);
    window._activeTimestampIndex = idx;
    updateActiveWeatherView();
    if (window.highlightActiveForecastHour) window.highlightActiveForecastHour();
    if (window.scrollActiveForecastHourToCenter) window.scrollActiveForecastHourToCenter();
  }
});

function updateActiveWeatherView() {
  try {
    if (!state.availableTimestamps || state.availableTimestamps.length === 0) return;

    const currentKey = state.availableTimestamps[state.activeTimestampIndex];
    if (!currentKey) return;

    const imageUrl = `${BASE_URL}${currentKey}Z.png`;

    // Fetch image (with ETag check if available)
    fetch(imageUrl, { cache: 'no-cache' })
      .then(response => {
        if (!response.ok) throw new Error('Image could not be loaded');
        return response.blob();
      })
      .then(imageBlob => {
        const reader = new FileReader();
        reader.onloadend = function() {
          const base64data = reader.result;
          if (windOverlay) windOverlay.setUrl(base64data);
        }
        reader.readAsDataURL(imageBlob);
      })
      .catch(err => {
        console.error('🚨 Error during ETag check for weather image:', err.message);
        if (windOverlay) windOverlay.setUrl(imageUrl);
      });

    const localTimeDisplayStr = formatToLocalTimeString(currentKey);
    const el = document.getElementById('timeline-time-display');
    if (el) el.innerText = localTimeDisplayStr;

    const slider = document.getElementById('time-slider');
    if (slider) slider.value = state.activeTimestampIndex;

    if (state.lastClickedLatLng && state.currentClusterData) {
      calculateInterpolationFromLoadedCluster(state.lastClickedLatLng, state.currentClusterData, state.availableTimestamps, state.activeTimestampIndex, window.updateForecastTableUI, (lat, lng, value) => updateMapMarker(map, lat, lng, value));
    }

  } catch (error) {
    console.error('🚨 Error updating map view (slider change):', error.message);
  }
}

// Map click: load cluster and interpolate
map.on('click', function(e) {
  try {
    setLastClickedLatLng(e.latlng);
    const clickLat = e.latlng.lat;
    const clickLng = e.latlng.lng;
    const col = Math.floor((clickLng - lonMin) / 2.0);
    const row = Math.floor((clickLat - latMin) / 2.0);
    const clusterUrl = `${BASE_URL}grid_cluster/cluster_${col}_${row}.json`;

    fetch(clusterUrl, { cache: 'no-cache' })
      .then(response => {
        if (!response.ok) throw new Error(`Cluster file does not exist for this location (${response.status})`);
        return response.json();
      })
      .then(cluster => {
        try {
          if (!cluster || !cluster.timeline || !cluster.lats) throw new Error('Cluster data structure is invalid.');
          setCurrentClusterData(cluster);
          calculateInterpolationFromLoadedCluster(e.latlng, cluster, state.availableTimestamps, state.activeTimestampIndex, window.updateForecastTableUI, (lat, lng, value) => updateMapMarker(map, lat, lng, value));
        } catch (procError) {
          console.error('🚨 Error parsing cluster contents:', procError.message);
        }
      })
      .catch(err => console.warn('📍 Click outside valid weather area:', err.message));

  } catch (error) {
    console.error('🚨 General error in map click event:', error.message);
  }
});

// Popup close handler
map.on('popupclose', function() {
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
