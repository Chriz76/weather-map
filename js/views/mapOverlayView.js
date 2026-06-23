import { weatherModel } from '../weatherModel.js';
import { updateMapMarkerWindspeed, updateMapMarkerLocation, clearMarker } from './markerView.js';

export function registerMapOverlayView(map, windOverlay) {

    // 1. Lauscht auf neue Interpolationswerte -> Marker setzen
    weatherModel.addEventListener('model:windspeed-updated', (e) => {
        const data = e.detail;
        if (data && data !== null) {
            updateMapMarkerWindspeed(map, data);
        } else {
            clearMarker(map);
        }
    });

    // Lauscht auf neue neue location werte -> Marker setzen
    weatherModel.addEventListener('model:location-updated', (e) => {
        const data = e.detail;
        if (data && data !== null) {
            updateMapMarkerLocation(map, data.lat, data.lng);
        } else {
            clearMarker(map);
        }
    });


    // 2. Lauscht auf fertige Bild-URLs aus dem Modell -> Direkt auf die Karte werfen!
    weatherModel.addEventListener('model:overlay-url-updated', (e) => {
        const url = e.detail;
        if (windOverlay && url) {
            windOverlay.setUrl(url);
        }
    });
}