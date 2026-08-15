import { Deck, MapView, COORDINATE_SYSTEM } from '@deck.gl/core';
import { IconLayer } from '@deck.gl/layers';
import type { Map as LeafletMap } from 'leaflet';
import * as L from 'leaflet';
import { logger } from '../utils/logger';
import { providers } from '../config';
import { weatherProviderModel } from '../models/weatherProviderModel';
import { uiStateModel } from '../models/uiStateModel';
import {
  decodeWindArrowPointsFromImageData,
  WIND_WEBP_ALPHA_THRESHOLD,
  WIND_WEBP_COMPONENT_MAX,
  WIND_WEBP_MIN_SPEED,
  WIND_WEBP_SAMPLE_STEP,
  type WindArrowPoint
} from '../utils/windWebpDecoder';

const WIND_ARROW_PANE = 'wind-arrow-overlay-pane';
const WIND_ARROW_PANE_Z_INDEX = '510';
const WIND_ARROW_CLASS = 'wind-arrow-deck-overlay';
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

class WindArrowDeckOverlay extends L.Layer {
  private map: LeafletMap | null = null;
  private container: HTMLDivElement | null = null;
  private deck: { finalize: () => void; setProps: (props: Record<string, unknown>) => void } | null = null;
  private data: WindArrowPoint[] = [];

  onAdd(map: LeafletMap): this {
    this.map = map;
    logger.info('Wind arrow overlay added to map.', {
      size: map.getSize(),
      zoom: map.getZoom()
    });
    const pane = this.ensurePane(map);
    this.container = L.DomUtil.create('div', WIND_ARROW_CLASS) as HTMLDivElement;
    this.container.style.position = 'absolute';
    this.container.style.inset = '0';
    this.container.style.pointerEvents = 'none';
    this.container.style.zIndex = '1';
    pane.appendChild(this.container);
    logger.info('Wind arrow overlay container attached.', {
      pane: WIND_ARROW_PANE,
      paneZIndex: pane.style.zIndex
    });

    this.deck = new Deck({
      parent: this.container,
      views: new MapView({ repeat: false }),
      controller: false,
      width: map.getSize().x,
      height: map.getSize().y,
      layers: this.buildLayers(),
      viewState: this.getViewState()
    });
    logger.info('Wind arrow Deck.gl instance created.', {
      layerCount: this.data.length,
      width: map.getSize().x,
      height: map.getSize().y
    });

    map.on('move zoom resize', this.syncViewState, this);
    this.syncViewState();
    return this;
  }

  onRemove(map: LeafletMap): this {
    map.off('move zoom resize', this.syncViewState, this);
    if (this.deck) {
      this.deck.finalize();
      this.deck = null;
    }
    if (this.container?.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.container = null;
    this.map = null;
    return this;
  }

  setData(data: WindArrowPoint[]): void {
    this.data = data;
    this.updateDeck();
  }

  private ensurePane(map: LeafletMap): HTMLElement {
    const existingPane = map.getPane(WIND_ARROW_PANE);
    if (existingPane) {
      logger.debug('Reusing existing wind arrow pane.', {
        pane: WIND_ARROW_PANE,
        zIndex: existingPane.style.zIndex
      });
      return existingPane;
    }

    const pane = map.createPane(WIND_ARROW_PANE);
    pane.style.zIndex = WIND_ARROW_PANE_Z_INDEX;
    pane.style.pointerEvents = 'none';
    logger.info('Created wind arrow pane.', {
      pane: WIND_ARROW_PANE,
      zIndex: pane.style.zIndex
    });
    return pane;
  }

  private getViewState(): DeckViewState {
    if (!this.map) {
      return { longitude: 0, latitude: 0, zoom: 0, pitch: 0, bearing: 0 };
    }

    const center = this.map.getCenter();
    return {
      longitude: center.lng,
      latitude: center.lat,
      zoom: this.map.getZoom(),
      pitch: 0,
      bearing: 0
    };
  }

  private syncViewState(): void {
    if (!this.deck || !this.map) return;
    logger.debug('Syncing wind arrow Deck.gl view state.', {
      zoom: this.map.getZoom(),
      size: this.map.getSize()
    });
    this.updateDeck();
  }

  private buildLayers(): IconLayer<WindArrowPoint>[] {
    logger.debug('Building wind arrow Deck.gl layers.', {
      pointCount: this.data.length
    });
    return [
      new IconLayer<WindArrowPoint>({
        id: 'wind-arrow-layer',
        data: this.data,
        iconAtlas: WIND_ARROW_ICON_URL,
        iconMapping: {
          arrow: {
            x: 0,
            y: 0,
            width: 64,
            height: 64,
            mask: true
          }
        },
        getIcon: () => 'arrow',
        getPosition: (d) => d.position,
        getAngle: (d) => d.angle,
        getSize: 18,
        sizeScale: 1,
        getColor: [255, 255, 255, 220],
        coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
        pickable: false
      })
    ];
  }

  private updateDeck(): void {
    if (!this.deck) {
      logger.debug('Skipping wind arrow Deck.gl update because the deck instance is missing.');
      return;
    }
    const size = this.map?.getSize();
    logger.debug('Applying wind arrow Deck.gl props.', {
      width: size?.x ?? 0,
      height: size?.y ?? 0,
      pointCount: this.data.length,
      hasMap: !!this.map
    });
    this.deck.setProps({
      width: size?.x ?? 0,
      height: size?.y ?? 0,
      viewState: this.getViewState(),
      layers: this.buildLayers()
    });
  }
}

let overlayInstance: WindArrowDeckOverlay | null = null;
let decodeToken = 0;

async function decodeWindOverlay(url: string, providerId: string): Promise<WindArrowPoint[]> {
  const providerCfg = providers[providerId];
  logger.info('Decoding wind overlay WebP.', {
    providerId,
    url
  });
  if (!providerCfg?.imageBounds) {
    logger.info('Skipping wind overlay decode because provider bounds are missing.', {
    providerId
    });
    return [];
  }

  const response = await fetch(url);
  logger.info('Wind overlay WebP fetch completed.', {
    providerId,
    url,
    status: response.status,
    ok: response.ok,
    contentType: response.headers.get('content-type')
  });
  if (!response.ok) {
    throw new Error(`Wind overlay WebP request failed (${response.status})`);
  }
  const blob = await response.blob();
  logger.info('Wind overlay blob received.', {
    providerId,
    url,
    size: blob.size,
    type: blob.type
  });
  if (typeof createImageBitmap !== 'function') {
    throw new Error('createImageBitmap is not available in this browser');
  }

  const bitmap = await createImageBitmap(blob);
  logger.info('Wind overlay bitmap created.', {
    providerId,
    width: bitmap.width,
    height: bitmap.height
  });
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

  const points = decodeWindArrowPointsFromImageData(imageData, {
    bounds: providerCfg.imageBounds,
    step: WIND_WEBP_SAMPLE_STEP,
    componentMax: WIND_WEBP_COMPONENT_MAX,
    minSpeed: WIND_WEBP_MIN_SPEED,
    alphaThreshold: WIND_WEBP_ALPHA_THRESHOLD
  });
  logger.info('Wind overlay WebP decoded into arrow points.', {
    providerId,
    url,
    pointCount: points.length
  });
  return points;
}

async function refreshOverlay(): Promise<void> {
  if (!overlayInstance) return;

  const currentUrl = uiStateModel.activeOverlayUrl;
  const providerId = weatherProviderModel.getActiveProviderId();
  const currentToken = ++decodeToken;
  logger.info('Refreshing wind arrow overlay.', {
    providerId,
    hasUrl: !!currentUrl,
    token: currentToken
  });

  if (!currentUrl) {
    logger.info('Clearing wind arrow overlay because no active overlay URL is available.');
    overlayInstance.setData([]);
    return;
  }

  try {
    const points = await decodeWindOverlay(currentUrl, providerId);
    if (currentToken !== decodeToken) {
    logger.debug('Discarding outdated wind arrow decode result.', {
      providerId,
      token: currentToken,
      latestToken: decodeToken,
      pointCount: points.length
    });
    return;
    }
    logger.info('Updating wind arrow overlay with decoded points.', {
    providerId,
    pointCount: points.length
    });
    overlayInstance.setData(points);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('Wind arrow overlay decode failed.', {
    providerId,
    url: currentUrl,
    token: currentToken,
    message
    });
    if (currentToken === decodeToken) {
    logger.info('Clearing wind arrow overlay after decode failure.', {
      providerId,
      token: currentToken
    });
    overlayInstance.setData([]);
    }
  }
}

/**
 * Leaflet view responsible for the Deck.gl wind arrow overlay.
 */
function initWindArrowOverlayView(map: LeafletMap): void {
  logger.info('Initializing wind arrow overlay view.');
  if (!overlayInstance) {
    overlayInstance = new WindArrowDeckOverlay();
    overlayInstance.addTo(map);
  }

  uiStateModel.addEventListener('ui:overlay-url-updated', () => {
    void refreshOverlay();
  });

  weatherProviderModel.addEventListener('model:provider-changed', () => {
    void refreshOverlay();
  });

  void refreshOverlay();
}

/**
 * Public API for the wind arrow overlay view.
 */
export const windArrowOverlayView = {
  init: initWindArrowOverlayView
};
