import { weatherProviderModel } from '../models/weatherProviderModel';
import { uiStateModel } from '../models/uiStateModel';
import { providers } from '../config';
import { updateMapMarkerWindspeed, updateMapMarkerLocation, clearMarker } from './markerView';

export function registerMapOverlayView(map: any, windOverlay: any): void {
  weatherProviderModel.addEventListener('model:windspeed-updated', () => {
    if (weatherProviderModel.lastClickedLatLng) {
      updateMapMarkerWindspeed(map, weatherProviderModel.windData as any);
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

  weatherProviderModel.addEventListener('model:provider-changed', () => {
    const newBounds = (providers as any)[weatherProviderModel.getActiveProviderId()]?.imageBounds ?? null;
    if (windOverlay && newBounds) {
      try {
        windOverlay.setBounds(newBounds);
      } catch (e) {
        // ignore
      }
    }
  });
}
