/* global L */
import { weatherModel } from '../models/weatherModel.js';
import { updateMapMarkerWindspeed, updateMapMarkerLocation, clearMarker } from './markerView.js';

/**
 * Connects model events to overlay and marker rendering on the map.
 * @param {any} map Leaflet map instance.
 * @param {any} windOverlay Leaflet image overlay instance.
 * @returns {void}
 */
export function registerMapOverlayView(map, windOverlay) {

    // 1. Listens for new interpolation values → set marker
    weatherModel.addEventListener('model:windspeed-updated', /** @param {Event} e */ (e) => {
        const customEvent = /** @type {CustomEvent<any>} */ (e);
        const data = customEvent.detail;
        if (data && data !== null) {
            updateMapMarkerWindspeed(map, data);
        } else {
            clearMarker(map);
        }
    });

    // Listens for new location values → set marker
    weatherModel.addEventListener('model:location-updated', /** @param {Event} e */ (e) => {
        const customEvent = /** @type {CustomEvent<{lat:number,lng:number}>} */ (e);
        const data = customEvent.detail;
        if (data && data !== null) {
            updateMapMarkerLocation(map, data.lat, data.lng);
        } else {
            clearMarker(map);
        }
    });


    // 2. Listens for finished image URLs from model → throw directly on map!
    weatherModel.addEventListener('model:overlay-url-updated', /** @param {Event} e */ (e) => {
        const customEvent = /** @type {CustomEvent<string|null>} */ (e);
        const url = customEvent.detail;
        if (windOverlay && url) {
            windOverlay.setUrl(url);
        }
    });
}