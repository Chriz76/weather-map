import { Deck, MapView } from '@deck.gl/core';
import type { DeckProps } from '@deck.gl/core';
import type { Map as LeafletMap } from 'leaflet';
import * as L from 'leaflet';

export interface ILeafletDeckOverlayOptions {
  className?: string;
  zIndex?: string | number;
}

/**
 * deck.gl keeps an internal `_animate` prop that is deliberately absent from the public
 * `DeckProps`. All knowledge about that prop lives in the two helpers below, so the
 * unavoidable assertion stays in one documented place instead of being repeated per call site.
 */
type DeckInternalProps = { props?: { _animate?: boolean } };

/** Reads deck.gl's internal `_animate` prop. */
function readDeckAnimate(deck: Deck<MapView>): boolean {
  return (deck as unknown as DeckInternalProps).props?._animate === true;
}

/** Writes deck.gl's internal `_animate` prop. */
function setDeckAnimate(deck: Deck<MapView>, animate: boolean): void {
  deck.setProps({ _animate: animate } as unknown as Partial<DeckProps<MapView>>);
}

/**
 * Layer set accepted by {@link LeafletDeckOverlay.setLayers}. `undefined` is removed so the
 * value can be handed to `Deck.setProps` under `exactOptionalPropertyTypes`.
 */
export type DeckLayers = NonNullable<DeckProps<MapView>['layers']>;

export class LeafletDeckOverlay extends L.Layer {
  private mapInstance: LeafletMap | null = null;
  private container: HTMLDivElement | null = null;
  private deck: Deck<MapView> | null = null;
  private pendingLayers: DeckLayers | null = null;
  private className: string;
  private zIndex: string | number | undefined;
  private animateBackup: boolean | undefined;

  constructor(options?: ILeafletDeckOverlayOptions) {
    super();
    this.className = options?.className ?? 'deck-overlay';
    this.zIndex = options?.zIndex;
  }

  public override onAdd(map: LeafletMap): this {
    this.mapInstance = map;

    // Use the map container directly so Leaflet's own transform does not shift the canvas twice.
    const container = map.getContainer();

    this.container = L.DomUtil.create('div', this.className, container) as HTMLDivElement;
    this.container.style.position = 'absolute';
    this.container.style.top = '0px';
    this.container.style.left = '0px';
    this.container.style.width = '100%';
    this.container.style.height = '100%';
    this.container.style.pointerEvents = 'none';
    if (this.zIndex !== undefined) {
      this.container.style.zIndex = String(this.zIndex);
    }

    const size = map.getSize();

    this.deck = new Deck<MapView>({
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

    // Subscribe to all Leaflet events that can change the projected view.
    map.on('move viewreset resize', this.syncViewState, this);
    map.on('movestart', this.onMoveStart, this);
    map.on('moveend', this.onMoveEnd, this);
    map.on('zoomstart', this.onZoomStart, this);
    map.on('zoomanim', this.onZoomAnim, this);
    map.on('zoom', this.onZoom, this);
    map.on('zoomend', this.onZoomEnd, this);

    this.syncViewState();

    return this;
  }

  public override onRemove(map: LeafletMap): this {
    map.off('move viewreset resize', this.syncViewState, this);
    map.off('movestart', this.onMoveStart, this);
    map.off('moveend', this.onMoveEnd, this);
    map.off('zoomstart', this.onZoomStart, this);
    map.off('zoomanim', this.onZoomAnim, this);
    map.off('zoom', this.onZoom, this);
    map.off('zoomend', this.onZoomEnd, this);

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

  /**
   * Applies the deck.gl layers. Before the overlay is added to a map the layers are buffered
   * and flushed by {@link onAdd}.
   * @param layers Layers to render.
   */
  public setLayers(layers: DeckLayers): void {
    if (!this.deck) {
      this.pendingLayers = layers;
      return;
    }

    try {
      this.deck.setProps({ layers });
    } catch {
      // deck.gl rejects layer updates while it is tearing down. Ignoring is safe because the
      // next setLayers call re-applies the current layers.
    }
  }

  private getViewState() {
    if (!this.mapInstance) return { longitude: 0, latitude: 0, zoom: 0, pitch: 0, bearing: 0 };
    
    const center = this.mapInstance.getCenter();
    const zoom = this.mapInstance.getZoom();

    return {
      longitude: center.lng,
      latitude: center.lat,
      // Keep the -1 offset: it compensates the deck.gl/Leaflet zoom reference difference
      // (tile vs. scale) and prevents position drift while panning.
      zoom: zoom - 1,
      pitch: 0,
      bearing: 0
    };
  }

  private syncViewState(): void {
    if (!this.deck || !this.mapInstance || !this.container) return;

    // While Leaflet runs an animated zoom the container is scaled via CSS transform
    // (see onZoomAnim/updateTransform), so deck's view props must be left untouched.
    if (LeafletDeckOverlay.isMapAnimatingZoom(this.mapInstance)) return;

    const size = this.mapInstance.getSize();

    this.deck.setProps({
      width: size.x,
      height: size.y,
      viewState: this.getViewState()
    });
  }

  private pauseAnimation(): void {
    if (!this.deck) return;

    if (readDeckAnimate(this.deck)) {
      this.animateBackup = true;
      setDeckAnimate(this.deck, false);
    }
  }

  private unpauseAnimation(): void {
    if (!this.deck || !this.animateBackup) return;

    setDeckAnimate(this.deck, this.animateBackup);
    this.animateBackup = undefined;
  }

  private onMoveStart = (): void => {
    this.pauseAnimation();
  };

  private onMoveEnd = (): void => {
    this.syncViewState();
    this.unpauseAnimation();
  };

  private onZoomStart = (): void => {
    this.pauseAnimation();
  };

  private onZoom = (): void => {
    if (!this.deck || !this.mapInstance) return;
    const center = this.mapInstance.getCenter();
    const zoom = this.mapInstance.getZoom();
    const size = this.mapInstance.getSize();
    this.deck.setProps({
      width: size.x,
      height: size.y,
      viewState: {
        longitude: center.lng,
        latitude: center.lat,
        zoom: zoom - 1,
        pitch: 0,
        bearing: 0
      }
    });
  };

  private onZoomEnd = (): void => {
    this.unpauseAnimation();
  };

  private onZoomAnim = (event: L.ZoomAnimEvent): void => {
    if (!this.deck || !this.mapInstance || !event) return;
    const center = event.center;
    const zoom = event.zoom;
    const size = this.mapInstance.getSize();
    this.deck.setProps({
      width: size.x,
      height: size.y,
      viewState: {
        longitude: center.lng,
        latitude: center.lat,
        zoom: zoom - 1,
        pitch: 0,
        bearing: 0
      }
    });
  };

  /**
   * Leaflet keeps `_animatingZoom` private, yet its value decides whether deck.gl may receive
   * new view props. This is the only place that reads that private field.
   */
  private static isMapAnimatingZoom(map: LeafletMap | null): boolean {
    if (!map) return false;
    return Boolean((map as unknown as { _animatingZoom?: boolean })._animatingZoom);
  }

  public getMapInstance(): LeafletMap | null {
    return this.mapInstance;
  }
}
