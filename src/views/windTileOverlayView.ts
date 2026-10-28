import { IconLayer } from '@deck.gl/layers';
import { TileLayer } from '@deck.gl/geo-layers';
import type { Map as LeafletMap } from 'leaflet';
import { LeafletDeckOverlay } from '../utils/leafletDeckOverlay';
import type { ProviderConfig } from '../config';
import { providers } from '../config';
import { weatherProviderModel } from '../models/weatherProviderModel';
import * as windTileService from '../services/windTileService';
import * as tilePyramid from '../utils/tilePyramid';
import * as webgl from '../utils/webgl';
import { logger } from '../utils/logger';
import type { TileCoverage } from '../types';

/**
 * Wind overlay for providers whose field is published as a static tile pyramid.
 *
 * The archive-based overlay (`windArrowOverlayView`) stays untouched and keeps serving D2 and
 * Arome; this view only mounts layers while a provider with `windOverlay: 'tiles'` is active.
 */

let overlayInstance: LeafletDeckOverlay | null = null;

/**
 * Identity of the tileset currently applied (URL template plus archive zoom). The model emits
 * several metadata events per index sync, and every one of them would otherwise rebuild the
 * layer and drop its tile cache.
 */
let appliedTilesetKey: string | null = null;

/**
 * Pixel width deck.gl draws a tile at. With the HRRR pyramid (0.025 deg nodes, `max_zoom` 7) this
 * works out to ~4.5 px per node, so {@link ARROW_STRIDE} arrows sit ~18 px apart on screen.
 */
const TILE_SIZE = 512;
/** Tile requests in flight; bounds how fast a new timestamp fills in. */
const TILE_MAX_REQUESTS = 6;
/**
 * Node step between arrows on the finest level. One node is ~4.5 px at {@link TILE_SIZE}, so this
 * keeps the arrows about 27 px apart, matching the archive-based overlay.
 */
const ARROW_STRIDE = 6;
/** Uniform scale applied to the arrow icon. */
const ARROW_SIZE_SCALE = 0.7;
const MS_TO_KNOTS = 1.94384;
const TILE_EXTENT: [number, number, number, number] = [-180, -85.051129, 180, 85.051129];

/** Map instance the overlay is attached to; needed to derive the arrow spacing from the zoom. */
let mapInstance: LeafletMap | null = null;

/**
 * Node step of the arrows for the current map zoom.
 *
 * Below the pyramid's finest level the payload is the real (coarser) level and the node spacing
 * in pixels is constant, so {@link ARROW_STRIDE} applies unchanged. Above it deck.gl keeps drawing
 * the finest tiles (the archive holds nothing finer), which spreads the nodes across the screen -
 * halving the step per level keeps the spacing even: 4 (map zoom <= 8), 2 (9), 1 (10+).
 * @param zoom Map zoom of the Leaflet map.
 * @param maxZoom Finest level the pyramid stores.
 */
function arrowStrideFor(zoom: number, maxZoom: number): number {
  // The tileset runs one zoom level below the map zoom (TILE_SIZE 512), so the finest level is
  // reached at map zoom maxZoom + 1.
  const overzoom = Math.max(0, zoom - (maxZoom + 1));
  return Math.max(1, ARROW_STRIDE / Math.pow(2, overzoom));
}

/** Arrow icon, matching the archive-based overlay so both providers look the same. */
const ARROW_ICON_URL = `data:image/svg+xml;utf8,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 80" width="40" height="80">
    <defs>
      <filter id="windTileGlow" x="-100%" y="-100%" width="300%" height="300%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
        <feComponentTransfer in="blur" result="boost">
          <feFuncA type="linear" slope="3"/>
        </feComponentTransfer>
        <feMerge>
          <feMergeNode in="boost" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    <g filter="url(#windTileGlow)">
      <path d="M 7 22 L 20 8 L 33 22 M 20 8 L 20 72" fill="none" stroke="#ffffff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" />
    </g>
    <path d="M 7 22 L 20 8 L 33 22 M 20 8 L 20 72" fill="none" stroke="#1c1e22" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
`)}`;

const ARROW_ICON_MAPPING = { arrow: { x: 0, y: 0, width: 40, height: 80, mask: false } };

/**
 * South-west corner of the provider's model area, i.e. the lattice anchor of its pyramid.
 *
 * Every archive node sits at `anchor + k * delta`, so the arrow phase has to be derived from it;
 * a per-tile phase would jump at tile borders.
 * @param cfg Active provider config.
 * @returns Anchor in degrees, or 0/0 when the config has no usable bounds.
 */
function getGridAnchor(cfg: ProviderConfig): windTileService.WindGridAnchor {
  const bounds = cfg.imageBounds;
  const southWest = Array.isArray(bounds) ? bounds[0] : null;
  if (Array.isArray(southWest) && typeof southWest[0] === 'number' && typeof southWest[1] === 'number') {
    return { lat: southWest[1], lng: southWest[0] };
  }
  return { lat: 0, lng: 0 };
}

/** Removes the current tiles so nothing of the previous provider or timestamp stays visible. */
function clearLayers(reason: string): void {
  if (!overlayInstance) return;
  logger.debug('[windTileOverlayView] clearing wind tiles', { reason });
  try {
    overlayInstance.setLayers([]);
  } catch {
    // deck.gl rejects layer updates while it is tearing down; the next apply re-creates them.
  }
}

/**
 * Builds the arrow sub layer of one tile.
 * @param points Wind nodes of the decoded tile.
 * @param id Layer id of the parent tile.
 */
function createArrowLayer(points: windTileService.WindTilePoint[], id: string): IconLayer<windTileService.WindTilePoint> {
  return new IconLayer<windTileService.WindTilePoint>({
    id: `${id}-arrows`,
    data: points,
    iconAtlas: ARROW_ICON_URL,
    iconMapping: ARROW_ICON_MAPPING,
    getIcon: () => 'arrow',
    getPosition: (point) => point.position,
    getAngle: (point) => 180 - point.angle,
    // Icons grow with the wind speed, starting at a legible minimum.
    getSize: (point) => Math.min(Math.max(8, 8 + Math.sqrt(Math.max(0, point.speed * MS_TO_KNOTS - 3)) * 4.8), 30),
    sizeScale: ARROW_SIZE_SCALE,
    sizeUnits: 'pixels',
    billboard: false,
    pickable: false,
    transitions: { getAngle: 300, getSize: 300 }
  });
}

/**
 * Builds the tile layer of one timestamp.
 *
 * `maxZoom` is the pyramid's finest level: above it deck.gl reuses those tiles at the same
 * geographic position, which is what we want - the archive holds no finer data.
 * @param urlTemplate Absolute tile URL template of the active timestamp.
 * @param maxZoom Finest level the pyramid stores.
 * @param coverage Tiles the run really stores, or null when the index has no coverage block.
 * @param format Payload encoding of the pyramid.
 * @param anchor Lattice anchor of the archive.
 * @param stride Node step of the arrows.
 */
function createWindTileLayer(
  urlTemplate: string,
  maxZoom: number,
  coverage: TileCoverage | null,
  format: windTileService.WindTileFormat,
  anchor: windTileService.WindGridAnchor,
  stride: number
): TileLayer<windTileService.WindTileGrid | null> {
  return new TileLayer<windTileService.WindTileGrid | null>({
    id: 'wind-tile-layer',
    minZoom: 0,
    maxZoom,
    tileSize: TILE_SIZE,
    extent: TILE_EXTENT,
    maxRequests: TILE_MAX_REQUESTS,
    refinementStrategy: 'best-available',
    // A new run means a new URL, and only a new URL means new tiles.
    updateTriggers: { getTileData: [urlTemplate] },
    getTileData: async ({ index, signal }) => {
      if (index.z > maxZoom) return null;
      if (!tilePyramid.isTileCovered(coverage, index.z, index.x, index.y)) return null;
      return await windTileService.getTileGrid(urlTemplate, index.z, index.x, index.y, signal, format);
    },
    renderSubLayers: (props) => {
      const grid = props.data;
      if (!grid) return null;

      const points = windTileService.gridToPoints(grid, stride, anchor);
      return points.length > 0 ? createArrowLayer(points, props.id) : null;
    }
  });
}

/**
 * Applies the tileset of the active provider and timestamp.
 *
 * No-op for providers without a tile pyramid, when the index carries no pyramid metadata, or
 * when the pyramid uses a payload layout this client cannot decode.
 */
function applyActiveTiles(): void {
  if (!overlayInstance) return;

  const cfg = providers[weatherProviderModel.getActiveProviderId()];
  if (cfg?.windOverlay !== 'tiles') {
    appliedTilesetKey = null;
    clearLayers('provider has no tile pyramid');
    return;
  }

  const template = weatherProviderModel.windTilesUrlTemplate;
  const timestamp = weatherProviderModel.activeTimestamp;
  if (!template || !timestamp) {
    appliedTilesetKey = null;
    clearLayers('no tile metadata for the active provider');
    return;
  }

  const format = weatherProviderModel.windTileFormat;
  if (!windTileService.isSupportedFormat(format?.id)) {
    logger.warn('[windTileOverlayView] unsupported tile payload format - wind tiles disabled', { formatId: format?.id });
    appliedTilesetKey = null;
    clearLayers('unsupported tile payload format');
    return;
  }

  const urlTemplate = tilePyramid.buildTileUrlTemplate(
    cfg.baseUrl,
    template,
    tilePyramid.tileFolderTimestamp(timestamp)
  );
  const maxZoom = weatherProviderModel.windPyramid?.max_zoom ?? 7;
  const stride = arrowStrideFor(mapInstance?.getZoom() ?? 0, maxZoom);
  const tilesetKey = `${urlTemplate}|${maxZoom}|${stride}`;
  if (tilesetKey === appliedTilesetKey) return;

  const tileFormat: windTileService.WindTileFormat = {
    scale: format?.scale ?? 0.05,
    sentinel: format?.sentinel ?? -20000
  };

  logger.debug('[windTileOverlayView] applying wind tiles', { urlTemplate, maxZoom, stride });
  overlayInstance.setLayers([
    createWindTileLayer(
      urlTemplate,
      maxZoom,
      weatherProviderModel.windTileCoverage,
      tileFormat,
      getGridAnchor(cfg),
      stride
    )
  ]);
  appliedTilesetKey = tilesetKey;
}

export interface IWindTileOverlayView {
  init: (map: LeafletMap) => void;
}

export const windTileOverlayView: IWindTileOverlayView = {
  init(map: LeafletMap) {
    if (overlayInstance) return;

    if (!webgl.isWebGL2Supported()) {
      logger.warn('[windTileOverlayView] WebGL2 not supported - wind tile overlay disabled');
      return;
    }

    try {
      overlayInstance = new LeafletDeckOverlay({ className: 'wind-tile-deck-overlay', zIndex: '510' });
      overlayInstance.addTo(map);
      mapInstance = map;

      // The arrow step shrinks with the zoom above the archive's finest level; the apply call
      // only rebuilds the layer when the step really changed.
      map.on('zoomend', () => {
        applyActiveTiles();
      });

      // A switch drops the previous provider's tiles; the new metadata follows with the sync.
      weatherProviderModel.addEventListener('model:provider-changed', () => {
        appliedTilesetKey = null;
        clearLayers('provider changed');
        applyActiveTiles();
      });

      // The timestamp is part of the tile URL, the coverage and format are not: both events only
      // rebuild when the resulting tileset really differs (see `appliedTilesetKey`).
      weatherProviderModel.addEventListener('model:timestamp-index-updated', () => {
        applyActiveTiles();
      });
      weatherProviderModel.addEventListener('model:model-metadata-updated', () => {
        applyActiveTiles();
      });

      applyActiveTiles();
    } catch (err: unknown) {
      // Graceful degradation: a missing GPU device must not break the rest of the app.
      logger.warn('[windTileOverlayView] deck overlay initialization failed - wind tiles disabled', err);
      overlayInstance = null;
    }
  }
};
