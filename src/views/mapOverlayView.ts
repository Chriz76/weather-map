import { weatherProviderModel } from '../models/weatherProviderModel';
import { uiStateModel } from '../models/uiStateModel';
import { providers } from '../config';
import { updateMapMarkerWindspeed, updateMapMarkerLocation, clearMarker } from './markerView';
import type { Map as LeafletMap, LatLngBounds, LatLngBoundsExpression, LatLngExpression, ImageOverlay } from 'leaflet';
import * as L from 'leaflet';
import type { WindData } from '../types';

type WindOverlayLike = ImageOverlay | {
  setUrl?: (url: string) => unknown;
  setBounds?: (bounds: LatLngBoundsExpression) => unknown;
  getBounds?: () => LatLngBounds;
};

function syncOverlayBounds(providerBounds: LatLngBoundsExpression): void {
  if (!windOverlayInstance || typeof windOverlayInstance.setBounds !== 'function') return;

  const nextBounds = L.latLngBounds(providerBounds as [LatLngExpression, LatLngExpression]);

  try {
    if (typeof windOverlayInstance.getBounds === 'function') {
      const currentBounds = windOverlayInstance.getBounds();
      if (currentBounds.equals(nextBounds)) return;
    }
  } catch {
    // getBounds threw; proceed to update bounds unconditionally.
  }

  windOverlayInstance.setBounds(nextBounds);
}

let windOverlayInstance: WindOverlayLike | null = null;

export function registerMapOverlayView(map: LeafletMap, overlay: WindOverlayLike | null): void {
  windOverlayInstance = overlay;

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
    const providerCfg = providers[weatherProviderModel.getActiveProviderId()];
    if (providerCfg?.imageBounds) {
      syncOverlayBounds(providerCfg.imageBounds);
    }

    if (windOverlayInstance && url && typeof windOverlayInstance.setUrl === 'function') {
      windOverlayInstance.setUrl(url);
    }
  });
}
