import { Deck, MapView } from '@deck.gl/core';
import type { Map as LeafletMap } from 'leaflet';
import * as L from 'leaflet';

export interface ILeafletDeckOverlayOptions {
  className?: string;
  zIndex?: string | number;
}

export class LeafletDeckOverlay extends L.Layer {
  private mapInstance: LeafletMap | null = null;
  private container: HTMLDivElement | null = null;
  private deck: Deck<MapView> | null = null;
  private pendingLayers: any[] | null = null;
  private className: string;
  private zIndex: string | number | undefined;

  constructor(options?: ILeafletDeckOverlayOptions) {
    super();
    this.className = options?.className ?? 'deck-overlay';
    this.zIndex = options?.zIndex;
  }

  public override onAdd(map: LeafletMap): this {
    this.mapInstance = map;

    const panes = map.getPanes();
    const pane: HTMLElement = panes.overlayPane;

    this.container = L.DomUtil.create('div', this.className) as HTMLDivElement;
    this.container.style.position = 'absolute';
    this.container.style.width = '100%';
    this.container.style.height = '100%';
    this.container.style.top = '0';
    this.container.style.left = '0';
    this.container.style.pointerEvents = 'none';
    if (this.zIndex !== undefined) this.container.style.zIndex = String(this.zIndex);

    pane.appendChild(this.container);

    const size = map.getSize();

    this.deck = new Deck({
      parent: this.container,
      views: new MapView({ repeat: false }),
      controller: false,
      style: { pointerEvents: 'none' },
      width: size.x,
      height: size.y,
      viewState: this.getViewState()
    });

    if (this.pendingLayers) {
      this.setLayers(this.pendingLayers);
      this.pendingLayers = null;
    }

    map.on('move resize zoomAnim', this.syncViewState, this);

    // perform initial sync
    this.syncViewState();

    return this;
  }

  public override onRemove(map: LeafletMap): this {
    map.off('move resize zoomAnim', this.syncViewState, this);

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

  public setLayers(layers: any[]): void {
    if (!this.deck) {
      // deck not yet initialised; store for later
      this.pendingLayers = layers;
      return;
    }

    try {
      this.deck.setProps({ layers });
    } catch (e) {
      // swallow errors here; callers can log if needed
    }
  }

  private getViewState() {
    if (!this.mapInstance) return { longitude: 0, latitude: 0, zoom: 0, pitch: 0, bearing: 0 };
    const center = this.mapInstance.getCenter();
    return {
      longitude: center.lng,
      latitude: center.lat,
      zoom: this.mapInstance.getZoom() - 1,
      pitch: 0,
      bearing: 0
    };
  }

  private syncViewState(): void {
    if (!this.deck || !this.mapInstance || !this.container) return;

    const topLeft = this.mapInstance.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(this.container, topLeft);

    const size = this.mapInstance.getSize();
    this.deck.setProps({
      width: size.x,
      height: size.y,
      viewState: this.getViewState()
    });
  }

  public getMapInstance(): LeafletMap | null {
    return this.mapInstance;
  }
}
