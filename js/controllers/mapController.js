// controllers/mapController.js
import { weatherModel } from '../models/weatherDomainModel.js';
import { weatherUi } from '../models/weatherUiModel.js';
import { storage } from '../utils/storage.js';
import { formatMinutesAgo } from '../utils/time.js';
import { toastController } from './toastController.js';
import { loadWeatherDataForLocationAction } from './actions.js';
import { stationView } from '../views/stationView.js';
import { updateStationsOnMapAction } from './updateStationsOnMapAction.js';

let stationViewHandle = null;
// stationView handles rendering; update action manages station data & cache

function formatStationToast(station) {
    const stationName = station.station_name || station.name || 'Station';
    const windData = station.windData || {};
    const windSpeed = typeof windData.windSpeed === 'number' ? windData.windSpeed.toFixed(1) : '--';
    const windGust = typeof windData.windGustSpeed === 'number' ? Math.round(windData.windGustSpeed) : '--';
    const temperature = typeof windData.temperature === 'number' ? windData.temperature.toFixed(1) : '--';
    const age = formatMinutesAgo(windData.timestamp);
    const lat = typeof station.lat === 'number' ? station.lat.toFixed(4) : '--';
    const lon = typeof station.lon === 'number' ? station.lon.toFixed(4) : '--';

    return `${stationName}
${age}
${windSpeed} kts max ${windGust} kts
${temperature}°C
lat ${lat}, lon ${lon}`;
}

export function initMapController(map) {
    /** @type {number | null} */
    let lastClusterClickToken = null;

    // Initial trigger: action lädt Stationsdaten intern
    updateStationsOnMapAction(map.getBounds());

    // Move update logic to action: see controllers/updateStationsOnMapAction.js

    async function triggerLoadAtLatLng(latlng) {
        const currentClickToken = Date.now();
        lastClusterClickToken = currentClickToken;

        try {
            await loadWeatherDataForLocationAction(latlng);
        } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            // Direct user action: toast is sufficient, don't persist pointDataLoadError.
            toastController.showToast({ message: 'Error loading location data: ' + errMsg }, 5000);
        }

        if (lastClusterClickToken !== currentClickToken) return;
    }

    async function handleMapClick(e) {
        await triggerLoadAtLatLng(e.latlng);
    }

    async function handleLocationFound(e) {
        const currentClickToken = Date.now();
        lastClusterClickToken = currentClickToken;

        map.setView(e.latlng, 10, { animate: true });

        try {
            await triggerLoadAtLatLng(e.latlng);
        } finally {
            weatherUi.setIsLocating(false);
        }
    }

    function handleLocationError(e) {
        toastController.showToast({ message: 'Error processing GPS location: ' + e.message }, 5000);
        weatherUi.setIsLocating(false);
    }

    function handlePopupClose() {
        lastClusterClickToken = null;
        weatherModel.removePointData();
    }

    function handleMoveEnd() {
        // --- NEU: Bei jeder Kartenbewegung (Verschieben/Zoomen) den Filter ausführen ---
        updateStationsOnMapAction(map.getBounds());

        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('lat') && urlParams.has('lon')) return;

        const center = map.getCenter();
        storage.saveMapState({
            lat: center.lat,
            lng: center.lng,
            zoom: map.getZoom()
        });
    }

    map.on('click', handleMapClick);
    map.on('locationfound', handleLocationFound);
    map.on('locationerror', handleLocationError);
    map.on('popupclose', handlePopupClose);
    map.on('moveend', handleMoveEnd);
    // Sicherstellen, dass auch nach reinem Zoom aktualisiert wird
    map.on('zoomend', () => updateStationsOnMapAction(map.getBounds()));

    // Init station view (it listens to model events)
    stationViewHandle = stationView.init(map, {
        onMarkerClick: async (station) => {
            toastController.showToast({ message: formatStationToast(station) }, 5000);
        }
    });

    // Initialisierung starten: Action lädt intern
}
