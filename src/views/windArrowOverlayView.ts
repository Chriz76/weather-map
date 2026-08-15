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
const WIND_ARROW_CLASS = 'wind-arrow-deck-overlay';
const WIND_ARROW_ICON_URL =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
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
    const pane = this.ensurePane(map);
    this.container = L.DomUtil.create('div', WIND_ARROW_CLASS) as HTMLDivElement;
    this.container.style.position = 'absolute';
    this.container.style.inset = '0';
    this.container.style.pointerEvents = 'none';
    this.container.style.zIndex = '1';
    pane.appendChild(this.container);

    this.deck = new Deck({
      parent: this.container,
      views: new MapView({ repeat: false }),
      controller: false,
      width: map.getSize().x,
      height: map.getSize().y,
      layers: this.buildLayers(),
      viewState: this.getViewState()
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
    if (existingPane) return existingPane;

    const pane = map.createPane(WIND_ARROW_PANE);
    pane.style.zIndex = '11';
    pane.style.pointerEvents = 'none';
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
    this.updateDeck();
  }

  private buildLayers(): IconLayer<WindArrowPoint>[] {
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
    if (!this.deck) return;
    const size = this.map?.getSize();
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
  if (!providerCfg?.imageBounds) return [];

  const response = await fetch(url);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d');
  if (!context) return [];

  context.drawImage(bitmap, 0, 0);
  const imageData = context.getImageData(0, 0, bitmap.width, bitmap.height);
  bitmap.close();

  return decodeWindArrowPointsFromImageData(imageData, {
    bounds: providerCfg.imageBounds,
    step: WIND_WEBP_SAMPLE_STEP,
    componentMax: WIND_WEBP_COMPONENT_MAX,
    minSpeed: WIND_WEBP_MIN_SPEED,
    alphaThreshold: WIND_WEBP_ALPHA_THRESHOLD
  });
}

async function refreshOverlay(): Promise<void> {
  if (!overlayInstance) return;

  const currentUrl = uiStateModel.activeOverlayUrl;
  const providerId = weatherProviderModel.getActiveProviderId();
  const currentToken = ++decodeToken;

  if (!currentUrl) {
    overlayInstance.setData([]);
    return;
  }

  try {
    const points = await decodeWindOverlay(currentUrl, providerId);
    if (currentToken !== decodeToken) return;
    overlayInstance.setData(points);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('Wind arrow overlay decode failed:', message);
    if (currentToken === decodeToken) overlayInstance.setData([]);
  }
}

/**
 * Leaflet view responsible for the Deck.gl wind arrow overlay.
 */
function initWindArrowOverlayView(map: LeafletMap): void {
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
