// controllers/mapController.js
import { weatherModel } from '../models/weatherModel.js';
import { storage } from '../utils/storage.js';
import { notificationController } from './notificationController.js';
import { loadWeatherDataForLocationAction } from './actions.js';
import { stationView } from '../views/stationView.js';
import { updateStationsOnMapAction } from './updateStationsOnMapAction.js';

let stationViewHandle = null;
// stationView handles rendering; update action manages station data & cache

export function initMapController(map) {
    /** @type {number | null} */
    let lastClusterClickToken = null;

    // Initial trigger: action lädt Stationsdaten intern
    updateStationsOnMapAction(map.getBounds());

    // Move update logic to action: see controllers/updateStationsOnMapAction.js

    async function triggerLoadAtLatLng(latlng) {
        const currentClickToken = Date.now();
        lastClusterClickToken = currentClickToken;

        await loadWeatherDataForLocationAction(latlng);
        if (lastClusterClickToken !== currentClickToken) return;
    }

    async function handleMapClick(e) {
        await triggerLoadAtLatLng(e.latlng);
    }

    async function handleLocationFound(e) {
        const currentClickToken = Date.now();
        lastClusterClickToken = currentClickToken;

        map.setView(e.latlng, 14, { animate: true });
        await triggerLoadAtLatLng(e.latlng);

        if (lastClusterClickToken === currentClickToken) {
            weatherModel.setIsLocating(false);
        }
    }

    function handleLocationError(e) {
        notificationController.showNotification({ message: 'Error processing GPS location: ' + e.message });
        weatherModel.setIsLocating(false);
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
        onMarkerClick: async (latlng) => {
            await triggerLoadAtLatLng(latlng);
        }
    });

    // Initialisierung starten: Action lädt intern
}
