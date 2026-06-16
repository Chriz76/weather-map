import { weatherModel } from '../weatherModel.js';
import { updateMapMarker, clearMarker } from './markerView.js';

export function registerMapOverlayView(map, windOverlay) {

    // 1. Lauscht auf neue Interpolationswerte -> Marker setzen
    weatherModel.addEventListener('model:interpolated-value-updated', (e) => {
        const data = e.detail;
        if (data && data.value !== null) {
            updateMapMarker(map, data.lat, data.lng, data.value);
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