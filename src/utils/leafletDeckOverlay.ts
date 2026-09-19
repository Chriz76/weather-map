import { Deck, MapView } from '@deck.gl/core';
import type { DeckProps } from '@deck.gl/core';
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
  private pendingLayers: DeckProps['layers'] | null = null;
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

    // Verwende den mapPane oder den Map Container direkt, damit Leaflet-Transformationen 
    // das Canvas nicht doppelt verschieben.
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

    // Höre auf alle relevanten Events von Leaflet
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

  public setLayers(layers: DeckProps['layers']): void {
    if (!this.deck) {
      this.pendingLayers = layers;
      return;
    }

    try {
      this.deck.setProps({ layers } as unknown as Partial<DeckProps>);
    } catch (e) {
      // Fehlerbehandlung
    }
  }

  private getViewState() {
    if (!this.mapInstance) return { longitude: 0, latitude: 0, zoom: 0, pitch: 0, bearing: 0 };
    
    const center = this.mapInstance.getCenter();
    const zoom = this.mapInstance.getZoom();

    return {
      longitude: center.lng,
      latitude: center.lat,
      // Beibehalten des -1 Offsets: dies kompensiert die Deck.gl/Leaflet
      // Zoom-Referenzdifferenz (Tile/scale difference) und verhindert
      // Positionsverschiebungen beim Panning.
      zoom: zoom - 1,
      pitch: 0,
      bearing: 0
    };
  }

  private syncViewState(): void {
    if (!this.deck || !this.mapInstance || !this.container) return;
    // Wenn Leaflet gerade einen animierten Zoom ausführt, überspringe das Setzen
    // der Deck-ViewProps: während der Zoomanimation wird der Container per CSS
    // transform skaliert (siehe onZoomAnim/updateTransform).
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

    // _animate ist ein internes prop; wir greifen nur lesend zu und setzen
    // beim Setzen einen schmalen Partial-Cast, um die Typen sauber zu halten.
    const props = (this.deck as unknown as { props?: { _animate?: boolean } }).props;
    if (props && typeof props._animate === 'boolean' && props._animate) {
      this.animateBackup = props._animate;
      this.deck.setProps({ _animate: false } as unknown as Partial<DeckProps>);
    }
  }

  private unpauseAnimation(): void {
    if (!this.deck) return;
    if (this.animateBackup) {
      this.deck.setProps({ _animate: this.animateBackup } as unknown as Partial<DeckProps>);
      this.animateBackup = undefined;
    }
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

  private static isMapAnimatingZoom(map: LeafletMap | null): boolean {
    if (!map) return false;
    const maybe = map as unknown as { _animatingZoom?: boolean };
    return Boolean(maybe._animatingZoom);
  }

  public getMapInstance(): LeafletMap | null {
    return this.mapInstance;
  }
}
