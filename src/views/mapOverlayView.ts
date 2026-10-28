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
  addTo?: (map: LeafletMap) => unknown;
  remove?: () => unknown;
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
let overlayMap: LeafletMap | null = null;

/**
 * Detaches the raster overlay from the map.
 *
 * A provider switch can leave a stale image behind, for example when switching to a provider
 * whose field is drawn from a tile pyramid. The layer is detached instead of kept with its last
 * URL, so a later provider gets a fresh image rather than the previous one.
 */
function hideOverlay(): void {
  if (!windOverlayInstance || typeof windOverlayInstance.remove !== 'function') return;
  windOverlayInstance.remove();
}

/** Re-attaches the overlay; Leaflet ignores the call when the layer is already on the map. */
function showOverlay(): void {
  if (!windOverlayInstance || !overlayMap || typeof windOverlayInstance.addTo !== 'function') return;
  windOverlayInstance.addTo(overlayMap);
}

/**
 * Creates the raster overlay when the map was initialised for a provider without one.
 *
 * `initMap` only creates the layer for a raster provider, so starting on a tile provider (HRRR)
 * leaves it undefined; switching to D2 or Arome then needs it to appear again.
 */
function ensureOverlay(): void {
  if (windOverlayInstance || !overlayMap) return;

  const cfg = providers[weatherProviderModel.getActiveProviderId()];
  if (cfg?.windOverlay !== 'raster') return;

  windOverlayInstance = L.imageOverlay('', cfg.imageBounds, { opacity: 0.65, zIndex: 10 });
}

export function registerMapOverlayView(map: LeafletMap, overlay: WindOverlayLike | null): void {
  windOverlayInstance = overlay;
  overlayMap = map;

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

    if (!url) {
      hideOverlay();
      return;
    }

    ensureOverlay();

    const providerCfg = providers[weatherProviderModel.getActiveProviderId()];
    if (providerCfg?.imageBounds) {
      syncOverlayBounds(providerCfg.imageBounds);
    }

    if (windOverlayInstance && typeof windOverlayInstance.setUrl === 'function') {
      // Set the URL before attaching: `addTo` builds the image element from the current URL.
      windOverlayInstance.setUrl(url);
    }
    showOverlay();
  });
}
