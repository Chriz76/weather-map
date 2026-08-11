import { weatherProviderModel } from '../models/weatherProviderModel';
import { uiStateModel } from '../models/uiStateModel';
import { providers } from '../config';
import { updateMapMarkerWindspeed, updateMapMarkerLocation, clearMarker } from './markerView';
import type { Map as LeafletMap, LatLngBoundsExpression } from 'leaflet';
import type { WindData } from '../types';

type WindOverlayLike = {
  setUrl?: (url: string) => void;
  setBounds?: (...args: unknown[]) => void;
};

export function registerMapOverlayView(map: LeafletMap, windOverlay: unknown | null): void {
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
    if (windOverlay && url && typeof (windOverlay as any).setUrl === 'function') {
      (windOverlay as any).setUrl(url);
    }
  });

  weatherProviderModel.addEventListener('model:provider-changed', () => {
    const providerCfg = providers[weatherProviderModel.getActiveProviderId()];
    const newBounds = providerCfg ? providerCfg.imageBounds : null;
    if (windOverlay && newBounds && typeof (windOverlay as any).setBounds === 'function') {
      try {
        (windOverlay as any).setBounds(newBounds as LatLngBoundsExpression);
      } catch (e) {
        // ignore
      }
    }
  });
}
