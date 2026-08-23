import { IconLayer } from '@deck.gl/layers';
import type { Map as LeafletMap } from 'leaflet';
import * as L from 'leaflet';
import { LeafletDeckOverlay } from '../utils/LeafletDeckOverlay';
import { COORDINATE_SYSTEM } from '@deck.gl/core';
import { logger } from '../utils/logger';
import { providers } from '../config';
import { weatherProviderModel } from '../models/weatherProviderModel';
import {
  decodeWindArrowPointsFromImageData,
  type WindArrowPoint
} from '../utils/windWebpDecoder';

const WIND_ARROW_PANE_Z_INDEX = '510';
const WIND_ARROW_CLASS = 'wind-arrow-deck-overlay';

// Feste, statische WebP-Datei aus dem Root (public/)
const STATIC_WIND_WEBP_URL = '/20260814_0815Z_dir_1channel_lossless.webp';

const WIND_ARROW_ICON_URL =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <path d="M32 4 L44 24 H36 V52 H28 V24 H20 Z" fill="white"/>
    </svg>
  `);

type DeckViewState = {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
};

// Use the generic LeafletDeckOverlay wrapper to manage Deck lifecycle and view synchronization.

let overlayInstance: LeafletDeckOverlay | null = null;
let decodeToken = 0;

let currentIconLayer: IconLayer<WindArrowPoint> | null = null;
let cachedPoints: WindArrowPoint[] | null = null;

// Cache für das aktuell geladene ImageData
let cachedImageData: ImageData | null = null;
let cachedProviderId: string | null = null;
let cachedUrl: string | null = null;

async function fetchAndCacheImageData(url: string, providerId: string): Promise<ImageData | null> {
  if (cachedUrl === url && cachedProviderId === providerId && cachedImageData) {
    return cachedImageData;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Wind overlay WebP request failed (${response.status})`);
  }
  const blob = await response.blob();
  if (typeof createImageBitmap !== 'function') {
    throw new Error('createImageBitmap is not available in this browser');
  }

  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    throw new Error('Unable to acquire a 2D canvas context for the wind overlay');
  }

  context.drawImage(bitmap, 0, 0);
  const imageData = context.getImageData(0, 0, bitmap.width, bitmap.height);
  bitmap.close();

  cachedImageData = imageData;
  cachedUrl = url;
  cachedProviderId = providerId;

  return imageData;
}

function renderPointsFromCache(): void {
  if (!overlayInstance || !cachedImageData || !cachedProviderId) return;

  const map = overlayInstance.getMapInstance();
  if (!map) return;

  const providerCfg = providers[cachedProviderId];
  if (!providerCfg?.imageBounds) return;

  const mapBounds = map.getBounds();
  const zoom = map.getZoom();

  const points = decodeWindArrowPointsFromImageData(cachedImageData, {
    bounds: providerCfg.imageBounds,
    zoom: zoom,
    viewportBounds: {
      southLat: mapBounds.getSouth(),
      westLng: mapBounds.getWest(),
      northLat: mapBounds.getNorth(),
      eastLng: mapBounds.getEast()
    }
  });

  setIconLayerFromPoints(points);
}

function pointsEqual(a: WindArrowPoint[] | null, b: WindArrowPoint[]): boolean {
  if (a === b) return true;
  if (!a) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const pa = a[i]!;
    const pb = b[i]!;
    if (pa.angle !== pb.angle) return false;
    if (pa.position[0] !== pb.position[0] || pa.position[1] !== pb.position[1]) return false;
  }
  return true;
}

function setIconLayerFromPoints(points: WindArrowPoint[]): void {
  if (!overlayInstance) return;
  if (pointsEqual(cachedPoints, points)) return;

  const iconLayer = new IconLayer<WindArrowPoint>({
    id: 'wind-arrow-layer',
    data: points,
    iconAtlas: WIND_ARROW_ICON_URL,
    iconMapping: {
      arrow: { x: 0, y: 0, width: 64, height: 64, mask: true }
    },
    getIcon: () => 'arrow',
    getPosition: (d: WindArrowPoint) => d.position,
    getAngle: (d: WindArrowPoint) => d.angle,
    getSize: 18,
    sizeScale: 1,
    getColor: [255, 255, 255, 220],
    coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
    pickable: false
  });

  currentIconLayer = iconLayer;
  cachedPoints = points;
  overlayInstance.setLayers([iconLayer]);
}

async function refreshOverlay(): Promise<void> {
  if (!overlayInstance) return;

  const providerId = weatherProviderModel.getActiveProviderId();
  const currentToken = ++decodeToken;

  try {
    // Lädt immer strikt die statische Datei aus dem Root
    await fetchAndCacheImageData(STATIC_WIND_WEBP_URL, providerId);
    if (currentToken !== decodeToken) return;

    renderPointsFromCache();
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Wind overlay decoding failed: ${errMessage}`);

    if (currentToken === decodeToken) {
      cachedImageData = null;
      cachedUrl = null;
      cachedProviderId = null;
      if (overlayInstance) overlayInstance.setLayers([]);
    }
  }
}

export interface IWindArrowOverlayView {
  init: (map: LeafletMap) => void;
}

export const windArrowOverlayView: IWindArrowOverlayView = {
  init: (map: LeafletMap): void => {
    logger.info('Initializing wind arrow overlay view with static root WebP.');
    if (!overlayInstance) {
      overlayInstance = new LeafletDeckOverlay({ className: WIND_ARROW_CLASS, zIndex: WIND_ARROW_PANE_Z_INDEX });
      overlayInstance.addTo(map);
      // Trigger point recompute on completed map interactions
      map.on('zoomend moveend', () => {
        void renderPointsFromCache();
      });
    }

    // Aktualisiert das Overlay nur noch bei Wechsel des Wetteranbieters (Karten-Bounds)
    weatherProviderModel.addEventListener('model:provider-changed', () => {
      void refreshOverlay();
    });

    void refreshOverlay();
  }
};
