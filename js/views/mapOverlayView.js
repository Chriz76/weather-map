import { weatherModel } from '../weatherModel.js';
import { updateMapMarkerWindspeed, updateMapMarkerLocation, clearMarker } from './markerView.js';

/**
 * Connects model events to overlay and marker rendering on the map.
 * @param {L.Map} map Leaflet map instance.
 * @param {L.ImageOverlay} windOverlay Leaflet image overlay instance.
 * @returns {void}
 */
export function registerMapOverlayView(map, windOverlay) {

    // 1. Listens for new interpolation values → set marker
    weatherModel.addEventListener('model:windspeed-updated', (e) => {
        const data = e.detail;
        if (data && data !== null) {
            updateMapMarkerWindspeed(map, data);
        } else {
            clearMarker(map);
        }
    });

    // Listens for new location values → set marker
    weatherModel.addEventListener('model:location-updated', (e) => {
        const data = e.detail;
        if (data && data !== null) {
            updateMapMarkerLocation(map, data.lat, data.lng);
        } else {
            clearMarker(map);
        }
    });


    // 2. Listens for finished image URLs from model → throw directly on map!
    weatherModel.addEventListener('model:overlay-url-updated', (e) => {
        const url = e.detail;
        if (windOverlay && url) {
            windOverlay.setUrl(url);
        }
    });
}