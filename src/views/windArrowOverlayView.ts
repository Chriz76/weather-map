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
  private mapInstance: LeafletMap | null = null;
  private container: HTMLDivElement | null = null;
  private deck: Deck | null = null;
  private data: WindArrowPoint[] = [];

  public override onAdd(map: LeafletMap): this {
    this.mapInstance = map;

    // Explizit typisierte Panes-Abfrage zur Vermeidung von ESLint 'unsafe' Fehlen
    const panes = map.getPanes();
    const pane: HTMLElement = panes.overlayPane;

    this.container = L.DomUtil.create('div', WIND_ARROW_CLASS) as HTMLDivElement;
    this.container.style.position = 'absolute';
    this.container.style.width = '100%';
    this.container.style.height = '100%';
    this.container.style.top = '0';
    this.container.style.left = '0';
    this.container.style.pointerEvents = 'none';
    this.container.style.zIndex = WIND_ARROW_PANE_Z_INDEX;

    pane.appendChild(this.container);

    const size = map.getSize();
    this.deck = new Deck({
      parent: this.container,
      views: new MapView({ repeat: false }),
      controller: false,
      style: { pointerEvents: 'none' },
      width: size.x,
      height: size.y,
      layers: this.buildLayers(),
      viewState: this.getViewState()
    });

    map.on('move resize zoomAnim', this.syncViewState, this);
    map.on('zoomend moveend', this.syncViewState, this);

    this.syncViewState();
    return this;
  }

  public override onRemove(map: LeafletMap): this {
    map.off('move resize zoomAnim', this.syncViewState, this);
    map.off('zoomend moveend', this.syncViewState, this);

    if (this.deck) {
      this.deck.finalize();
      this.deck = null;
    }
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.container = null;
    this.mapInstance = null;
    return this;
  }

  public setData(data: WindArrowPoint[]): void {
    this.data = data;
    this.updateDeck();
  }

  private getViewState(): DeckViewState {
    if (!this.mapInstance) {
      return { longitude: 0, latitude: 0, zoom: 0, pitch: 0, bearing: 0 };
    }

    const center = this.mapInstance.getCenter();
    return {
      longitude: center.lng,
      latitude: center.lat,
      zoom: this.mapInstance.getZoom() - 1, // Kacheloffset Leaflet (256) vs Deck.gl (512)
      pitch: 0,
      bearing: 0
    };
  }

  private syncViewState(): void {
    if (!this.deck || !this.mapInstance || !this.container) return;

    // Aufheben der Leaflet CSS-Transformation für das Canvas
    const topLeft = this.mapInstance.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(this.container, topLeft);

    const size = this.mapInstance.getSize();
    this.deck.setProps({
      width: size.x,
      height: size.y,
      viewState: this.getViewState(),
      layers: this.buildLayers()
    });
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
        getPosition: (d: WindArrowPoint) => d.position,
        getAngle: (d: WindArrowPoint) => d.angle,
        getSize: 18,
        sizeScale: 1,
        getColor: [255, 255, 255, 220],
        coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
        pickable: false
      })
    ];
  }

  private updateDeck(): void {
    if (!this.deck || !this.mapInstance) return;

    const size = this.mapInstance.getSize();
    this.deck.setProps({
      width: size.x,
      height: size.y,
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
    if (currentToken === decodeToken) {
      overlayInstance.setData([]);
    }
  }
}

export interface IWindArrowOverlayView {
  init: (map: LeafletMap) => void;
}

export const windArrowOverlayView: IWindArrowOverlayView = {
  init: (map: LeafletMap): void => {
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
};
