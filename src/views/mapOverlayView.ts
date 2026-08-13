import { weatherProviderModel } from '../models/weatherProviderModel';
import { uiStateModel } from '../models/uiStateModel';
import { providers } from '../config';
import { updateMapMarkerWindspeed, updateMapMarkerLocation, clearMarker } from './markerView';
import type { Map as LeafletMap, LatLngBoundsExpression, ImageOverlay } from 'leaflet';
import type { WindData } from '../types';

type WindOverlayLike = ImageOverlay | {
  setUrl?: (url: string) => unknown;
  setBounds?: (bounds: LatLngBoundsExpression) => unknown;
};

export function registerMapOverlayView(map: LeafletMap, windOverlay: WindOverlayLike | null): void {
  weatherProviderModel.addEventListener('model:windspeed-updated', () => {
    if (weatherProviderModel.lastClickedLatLng) {
      updateMapMarkerWindspeed(map, weatherProviderModel.windData as WindData | null);
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
    if (windOverlay && url && typeof windOverlay.setUrl === 'function') {
      windOverlay.setUrl(url);
    }
  });

  weatherProviderModel.addEventListener('model:provider-changed', () => {
    const providerCfg = providers[weatherProviderModel.getActiveProviderId()];
    const newBounds = providerCfg ? providerCfg.imageBounds : null;
    if (windOverlay && newBounds && typeof windOverlay.setBounds === 'function') {
      try {
        // Normalize bounds to Leaflet LatLngBounds before calling setBounds to satisfy ImageOverlay signature
        (windOverlay as any).setBounds((window as any).L.latLngBounds(newBounds as any));
      } catch (e) {
        // ignore
      }
    }
  });
}
