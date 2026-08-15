type DeckViewState = {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
  maxZoom?: number;
  minZoom?: number;
};

class WindArrowDeckOverlay extends L.Layer {
  private map: LeafletMap | null = null;
  private container: HTMLDivElement | null = null;
  private deck: Deck | null = null;
  private data: WindArrowPoint[] = [];

  onAdd(map: LeafletMap): this {
    this.map = map;
    
    // 1. Wir nutzen ein festes Container-Div im overlayPane oder mapContainer
    const pane = map.getPanes().overlayPane;
    this.container = L.DomUtil.create('div', WIND_ARROW_CLASS) as HTMLDivElement;
    this.container.style.position = 'absolute';
    this.container.style.width = '100%';
    this.container.style.height = '100%';
    this.container.style.top = '0';
    this.container.style.left = '0';
    this.container.style.pointerEvents = 'none';
    this.container.style.zIndex = WIND_ARROW_PANE_Z_INDEX;
    
    pane.appendChild(this.container);

    // 2. Deck.gl Instanz initialisieren
    this.deck = new Deck({
      parent: this.container,
      views: new MapView({ repeat: false }),
      controller: false,
      style: { pointerEvents: 'none' },
      width: map.getSize().x,
      height: map.getSize().y,
      layers: this.buildLayers(),
      viewState: this.getViewState()
    });

    // 3. Events an Leaflet binden (move für kontinuierliches Panning)
    map.on('move resize zoomAnim', this.syncViewState, this);
    map.on('zoomend moveend', this.syncViewState, this);

    this.syncViewState();
    return this;
  }

  onRemove(map: LeafletMap): this {
    map.off('move resize zoomAnim', this.syncViewState, this);
    map.off('zoomend moveend', this.syncViewState, this);

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

  private getViewState(): DeckViewState {
    if (!this.map) {
      return { longitude: 0, latitude: 0, zoom: 0, pitch: 0, bearing: 0 };
    }

    const center = this.map.getCenter();
    
    // WICHTIG:
    // 1. deck.gl Zoom ist Leaflet Zoom - 1 wegen 512px vs 256px Tile Size.
    // 2. center.lng & center.lat synchronisieren
    return {
      longitude: center.lng,
      latitude: center.lat,
      zoom: this.map.getZoom() - 1,
      pitch: 0,
      bearing: 0
    };
  }

  private syncViewState(): void {
    if (!this.deck || !this.map || !this.container) return;

    // KORREKTUR DER LEAFLET CSS-TRANSLATION:
    // Leaflet verschiebt das overlayPane mit CSS Transforms.
    // Wir heben den Offset auf, damit das deck.gl Canvas IMMER exakt 
    // deckungsgleich über dem Screen-Viewport bleibt.
    const topLeft = this.map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(this.container, topLeft);

    const size = this.map.getSize();

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
        getPosition: (d) => d.position,
        getAngle: (d) => d.angle,
        getSize: 18,
        sizeScale: 1,
        getColor: [255, 255, 255, 220],
        
        // WICHTIG: Standard Mercator LNGLAT verwenden
        coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
        pickable: false
      })
    ];
  }

  private updateDeck(): void {
    if (!this.deck || !this.map) return;
    
    const size = this.map.getSize();
    this.deck.setProps({
      width: size.x,
      height: size.y,
      viewState: this.getViewState(),
      layers: this.buildLayers()
    });
  }
}
