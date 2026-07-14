// controllers/mapController.js
import { weatherModel } from '../models/weatherModel.js';
import { storage } from '../utils/storage.js';
import { notificationController } from './notificationController.js';
import { loadWeatherDataForLocation } from './syncPipeline.js';

export function initMapController(map) {
    /** @type {number | null} */
    let lastClusterClickToken = null;

    async function handleMapClick(e) {
        const currentClickToken = Date.now();
        lastClusterClickToken = currentClickToken;

        await loadWeatherDataForLocation(e.latlng);
        if (lastClusterClickToken !== currentClickToken) return;
    }

    async function handleLocationFound(e) {
        const currentClickToken = Date.now();
        lastClusterClickToken = currentClickToken;

        map.setView(e.latlng, 14, { animate: true });
        await loadWeatherDataForLocation(e.latlng);

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

    return {
        dispose() {
            map.off('click', handleMapClick);
            map.off('locationfound', handleLocationFound);
            map.off('locationerror', handleLocationError);
            map.off('popupclose', handlePopupClose);
            map.off('moveend', handleMoveEnd);
        }
    };
}
