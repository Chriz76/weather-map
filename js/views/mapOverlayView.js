/* global L */
import { weatherModel } from '../models/weatherDomainModel.js';
import { uiModel } from '../models/uiModel.js';
import { updateMapMarkerWindspeed, updateMapMarkerLocation, clearMarker } from './markerView.js';

/**
 * Connects model events to overlay and marker rendering on the map.
 * @param {any} map Leaflet map instance.
 * @param {any} windOverlay Leaflet image overlay instance.
 * @returns {void}
 */
export function registerMapOverlayView(map, windOverlay) {

    weatherModel.addEventListener('model:windspeed-updated', () => {
        if (weatherModel.windData) {
            updateMapMarkerWindspeed(map, weatherModel.windData);
        } else {
            clearMarker(map);
        }
    });

    weatherModel.addEventListener('model:location-updated', () => {
        const latLng = weatherModel.lastClickedLatLng;
        if (latLng) {
            updateMapMarkerLocation(map, latLng.lat, latLng.lng);
        } else {
            clearMarker(map);
        }
    });

    uiModel.addEventListener('ui:overlay-url-updated', () => {
        const url = uiModel.activeOverlayUrl;
        if (windOverlay && url) {
            windOverlay.setUrl(url);
        }
    });
}

