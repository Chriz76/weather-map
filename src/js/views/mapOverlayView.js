/* global L */
import { weatherProviderModel } from '../models/weatherProviderModel.js';
import { uiStateModel } from '../models/uiStateModel.js';
import { providers } from '../config.js';
import { updateMapMarkerWindspeed, updateMapMarkerLocation, clearMarker } from './markerView.js';

/**
 * Connects model events to overlay and marker rendering on the map.
 * @param {any} map Leaflet map instance.
 * @param {any} windOverlay Leaflet image overlay instance.
 * @returns {void}
 */
export function registerMapOverlayView(map, windOverlay) {

    weatherProviderModel.addEventListener('model:windspeed-updated', () => {
        if (weatherProviderModel.lastClickedLatLng) {
            updateMapMarkerWindspeed(map, weatherProviderModel.windData);
        } else {
            clearMarker(map);
        }
    });

    weatherProviderModel.addEventListener('model:location-updated', () => {
        const latLng = weatherProviderModel.lastClickedLatLng;
        if (latLng) {
            updateMapMarkerLocation(map, latLng.lat, latLng.lng);
        } else {
            clearMarker(map);
        }
    });

    uiStateModel.addEventListener('ui:overlay-url-updated', () => {
        const url = uiStateModel.activeOverlayUrl;
        if (windOverlay && url) {
            windOverlay.setUrl(url);
        }
    });

    // Update image bounds when the active provider changes so overlays match provider extents
    weatherProviderModel.addEventListener('model:provider-changed', () => {
        const newBounds = providers[weatherProviderModel.getActiveProviderId()]?.imageBounds ?? null;
        if (windOverlay && newBounds) {
            try {
                windOverlay.setBounds(newBounds);
            } catch (e) {
                // ignore failures — prefer setBounds; recreate overlay if you observe rendering issues
            }
        }
    });
}

