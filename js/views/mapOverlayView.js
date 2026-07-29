/* global L */
import modelManager from '../weatherModels/modelManager.js';
import eventProxy from '../weatherModels/eventProxy.js';
const getModel = () => modelManager.getActiveModel().domainModel;
import { uiModel } from '../models/uiModel.js';
import { updateMapMarkerWindspeed, updateMapMarkerLocation, clearMarker } from './markerView.js';

/**
 * Connects model events to overlay and marker rendering on the map.
 * @param {any} map Leaflet map instance.
 * @param {any} windOverlay Leaflet image overlay instance.
 * @returns {void}
 */
export function registerMapOverlayView(map, windOverlay) {

    eventProxy.addEventListener('model:windspeed-updated', () => {
        if (getModel().windData) {
            updateMapMarkerWindspeed(map, getModel().windData);
        } else {
            clearMarker(map);
        }
    });

    eventProxy.addEventListener('model:location-updated', () => {
        const latLng = getModel().lastClickedLatLng;
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

