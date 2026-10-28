import { IconLayer } from '@deck.gl/layers';
import { TileLayer } from '@deck.gl/geo-layers';
import { Layer, project32 } from '@deck.gl/core';
import type { LayerProps } from '@deck.gl/core';
import { Geometry, Model } from '@luma.gl/engine';
import type { ModelProps } from '@luma.gl/engine';
import type { Device, Texture } from '@luma.gl/core';
import type { ShaderModule } from '@luma.gl/shadertools';
import type { Map as LeafletMap } from 'leaflet';
import { LeafletDeckOverlay } from '../utils/leafletDeckOverlay';
import { providers } from '../config';
import { getTileGrid, gridToPoints } from '../services/windArrowService';
import type { WindGridAnchor, WindNodeWindow, WindTileGrid, WindTilePoint } from '../services/windArrowService';
import { weatherProviderModel } from '../models/weatherProviderModel';
import { isDebugEnabled, logger } from '../utils/logger';
import * as tilePyramid from '../utils/tilePyramid';

let overlayInstance: LeafletDeckOverlay | null = null;

/* ---------------------------------------------------------------------------
 *  Tile settings
 *
 *  One tile layer carries both sub layers - the field texture and the arrows - from a single
 *  decoded grid. The tileset may ask for levels finer than the pyramid stores: above
 *  ARCHIVE_MAX_ZOOM the loader re-reads the finest level and each sub layer draws its part of it
 *  (see createTileLoader and resolveTileQuad). The arrow density is a plain function of the tile
 *  zoom (see arrowStride), so nothing has to be tracked outside the layers.
 * ------------------------------------------------------------------------- */
/**
 * Pixel size of a tile as deck.gl requests it.
 *
 * A tile at zoom `z` covers 360 / 2^z degrees and is drawn this many pixels wide, so this value
 * also fixes how many tiles a viewport needs. The pyramid carries four times the cells per tile
 * of the former single-container archive (twice per axis) and stops one zoom level earlier, so a
 * 1024 px tile shows exactly the detail a 512 px tile used to: same pixels per node, a quarter of
 * the requests, and no duplicate downloads on the `dz` levels above ARCHIVE_MAX_ZOOM.
 */
const TILE_SIZE = 1024;
const TILE_MIN_ZOOM = 0;
/**
 * Highest tile zoom the tileset asks for; may lie above the pyramid's finest level.
 * With TILE_SIZE at 1024 a tile zoom sits one level below the map zoom, so this is map zoom 10.
 */
const TILE_MAX_ZOOM = 9;
/** Finest level the pyramid stores (`pyramid.max_zoom` of `index.json`). */
const ARCHIVE_MAX_ZOOM = 7;
/**
 * Detail bias of the tileset, in zoom levels.
 *
 * `Tileset2D.getTileIndices` picks `round(deckZoom + log2(512 / tileSize) + zoomOffset)`, which is
 * `mapZoom - 2 + zoomOffset` here. Every step loads the pyramid one level finer at the same map
 * zoom: at 1 the finest level (0.025 deg) already appears at map zoom 8 instead of 9. The price is
 * four times as many tiles - and therefore requests - per viewport.
 */
const TILE_ZOOM_OFFSET = 1;

/**
 * Tile requests allowed in flight. Every tile is one HTTP request, so this bounds how fast a new
 * timestep fills in. The pyramid is served over HTTP/2, which would allow far more parallel
 * streams; 6 keeps a cold fill from starving the rest of the page.
 */
const TILE_MAX_REQUESTS = 6;
const TILE_DEBOUNCE_MS = 0;
const TILE_EXTENT: [number, number, number, number] = [-180, -85.051129, 180, 85.051129];

/**
 * Node step of the arrows on the levels the pyramid really stores (tile zoom <= ARCHIVE_MAX_ZOOM).
 *
 * At TILE_SIZE the finest level shows 1024 / ~114 = 8.98 px per node, exactly what the 512 / ~57
 * of the former archive showed, so the step that keeps ~36 px between arrows is unchanged.
 * A tile-zoom offset draws every tile one level smaller (1024 -> 512 px), so the base doubles per
 * offset level: the arrows then land on the very same lattice nodes at the very same spacing.
 */
const ARROW_STRIDE_BASE = 4 * Math.pow(2, TILE_ZOOM_OFFSET);

/**
 * Node step of the arrows for a tile of the given zoom.
 *
 * Below the pyramid's finest level the payload is the real (coarser) level, so the step stays
 * {@link ARROW_STRIDE_BASE}. Above it the payload stays at ARCHIVE_MAX_ZOOM and the step halves per
 * level, which keeps the spacing constant on screen: 4 (z <= 7), 2 (z 8), 1 (z >= 9).
 * Deeper zooms are clamped to TILE_MAX_ZOOM, so the arrows keep one node and spread apart.
 * @param tileZoom Zoom of the tile the arrows are derived from.
 * @returns Node step on both axes, at least one node.
 */
function arrowStride(tileZoom: number): number {
  const finer = Math.max(0, tileZoom - ARCHIVE_MAX_ZOOM);
  return Math.max(1, ARROW_STRIDE_BASE / Math.pow(2, finer));
}

/**
 * Tile URL template of the active timestamp (`{z}/{x}/{y}` placeholders); kept so a new timestamp
 * can replace the layers.
 */
let currentTileUrlTemplate: string | null = null;

/**
 * Lattice anchor of the active archive: every node of a wind archive sits at
 * `anchor + k * deltaLat/Lng`, and every archive level uses a subset of that lattice (the nodes
 * double per level). Anchoring the stride there makes the arrows land exactly on stored nodes
 * and keeps them evenly spaced over tile borders.
 *
 * The anchor is the south-west corner of the model area. `windAnchor` wins over `imageBounds`
 * so an archive that covers a different area than the provider's point-forecast grid (e.g. the
 * HRRR window) can still be sampled on its own lattice.
 * @returns Anchor in degrees, or 0/0 when the provider has neither configured.
 */
function getGridAnchor(): WindGridAnchor {
  const cfg = providers[weatherProviderModel.getActiveProviderId()];
  if (cfg?.windAnchor) return { lng: cfg.windAnchor.lng, lat: cfg.windAnchor.lat };

  const bounds = cfg?.imageBounds;
  if (!Array.isArray(bounds) || bounds.length === 0) return { lng: 0, lat: 0 };

  const southWest = bounds[0];
  if (!Array.isArray(southWest) || southWest.length < 2) return { lng: 0, lat: 0 };

  const [lat, lng] = southWest;
  return typeof lat === 'number' && typeof lng === 'number' ? { lng, lat } : { lng: 0, lat: 0 };
}

/**
 * Removes the current wind layers so no stale field or arrows remain visible.
 * Emptying the layer set makes deck.gl finalize the previous tile layers, so the next
 * `setWindTileTemplate` call builds fresh layers with a clean tile cache.
 * @param reason Short description used for diagnostic logging.
 */
function clearWindLayers(reason: string): void {
  currentTileUrlTemplate = null;
  if (!overlayInstance) return;
  logger.debug('[windArrowOverlayView] clearing wind layers', { reason });
  try {
    overlayInstance.setLayers([]);
  } catch {
    // deck.gl rejects layer updates while it is tearing down; the next setLayers call re-applies.
  }
}

/**
 * Builds the wind tile layer for the current archive and applies it.
 *
 * The layer id stays the same, so deck.gl matches the new instance with the previous one and keeps
 * the decoded tiles; the field is drawn first, the arrows on top of it.
 * @returns True when deck.gl accepted the layer update.
 */
function applyWindLayers(): boolean {
  if (!overlayInstance || !currentTileUrlTemplate) return false;
  logger.debug('[windArrowOverlayView] applying wind tile layer', currentTileUrlTemplate);
  return overlayInstance.setLayers([createWindTileLayer(currentTileUrlTemplate)]);
}

/* -------------------------------------------------------------------------
 *  Wind field tiles
 *
 *  Ported from the webgl.html prototype: the payload of each tile is uploaded
 *  as a premultiplied RGBA16F texture (rg = u/v * coverage, b = coverage) with
 *  LINEAR filtering. The GPU therefore performs the bilinear interpolation and
 *  the fragment shader needs a single texture tap per fragment.
 *  This layer replaces the raster image overlay (...Z.webp).
 * ------------------------------------------------------------------------- */

/** Band colours of css/forecast-view.css (.w-under-3 ... .w-over-25), lowest band first. */
const KNOTS_COLORS: ReadonlyArray<readonly [number, number, number]> = [
  [230, 255, 255], // <= 3 kn
  [0, 191, 255],   // <= 5 kn
  [0, 255, 204],   // <= 6 kn
  [0, 204, 0],     // <= 7 kn
  [153, 255, 0],   // <= 8 kn
  [255, 255, 0],   // <= 9 kn
  [209, 158, 0],   // <= 10 kn
  [255, 85, 0],    // <= 12 kn
  [255, 0, 0],     // <= 15 kn
  [255, 51, 153],  // <= 20 kn
  [153, 0, 204],   // <= 25 kn
  [0, 0, 255]      // > 25 kn
];

const BAND_COUNT = KNOTS_COLORS.length;

/** 1 m/s in knots. */
const MS_TO_KN = 1.9438445;

/** Opacity of the wind field (same value the former image overlay used). */
const FIELD_OPACITY = 0.65;
/** Set to false to render a continuous gradient instead of the hard band edges. */
const FIELD_SHOW_BANDS = true;

let paletteTexture: Texture | null = null;
let paletteDevice: Device | null = null;

/**
 * Shared palette texture (one row of BAND_COUNT RGBA colours) for all tiles.
 * Recreated when the deck.gl device changes, e.g. after the overlay was re-added.
 * @param device Device that will sample the palette.
 */
function getPaletteTexture(device: Device): Texture {
  if (paletteTexture && paletteDevice === device) return paletteTexture;

  const data = new Uint8Array(BAND_COUNT * 4);
  KNOTS_COLORS.forEach((color, i) => {
    data[i * 4] = color[0];
    data[i * 4 + 1] = color[1];
    data[i * 4 + 2] = color[2];
    data[i * 4 + 3] = 255;
  });

  paletteTexture = device.createTexture({
    width: BAND_COUNT,
    height: 1,
    format: 'rgba8unorm',
    data,
    sampler: {
      minFilter: 'linear',
      magFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge'
    }
  });
  paletteDevice = device;
  return paletteTexture;
}

const _f32 = new Float32Array(1);
const _i32 = new Int32Array(_f32.buffer);
/** 1.0 as IEEE binary16 bit pattern. */
const HALF_ONE = 0x3c00;

/**
 * Converts a float32 value into its IEEE binary16 bit pattern (round to nearest).
 * RGBA16F is the only float format WebGL2 filters natively, which is what allows the
 * hardware interpolation.
 * @param val Value to convert.
 */
function toHalf(val: number): number {
  _f32[0] = val;
  const x = _i32[0]!;
  let bits = (x >> 16) & 0x8000;
  let m = (x >> 12) & 0x07ff;
  const e = (x >> 23) & 0xff;
  if (e < 103) return bits;                 // too small for a half float -> zero
  if (e > 142) {                            // inf / NaN
    return bits | 0x7c00 | ((e === 255 && (x & 0x007fffff) !== 0) ? 1 : 0);
  }
  if (e < 113) {                            // subnormal
    m |= 0x0800;
    return bits | ((m >> (114 - e)) + ((m >> (113 - e)) & 1));
  }
  bits |= ((e - 112) << 10) | (m >> 1);
  return bits + (m & 1);
}

/**
 * Uploads one decoded tile grid as a premultiplied RGBA16F texture.
 * Masked nodes get coverage 0 and therefore contribute nothing to the filtered value.
 * @param device Device that will sample the texture.
 * @param grid Decoded tile grid.
 */
function createTileTexture(device: Device, grid: WindTileGrid): Texture {
  const { cols, rows, uv } = grid;
  const half = new Uint16Array(cols * rows * 4);

  for (let row = 0; row < rows; row++) {
    const rowOffset = row * cols * 4;
    for (let col = 0; col < cols; col++) {
      const src = (row * cols + col) * 2;
      const u = uv[src];
      const v = uv[src + 1];
      const valid = u !== undefined && v !== undefined && Number.isFinite(u) && Number.isFinite(v);
      const dst = rowOffset + col * 4;
      half[dst] = valid ? toHalf(u) : 0;      // .r = u * coverage
      half[dst + 1] = valid ? toHalf(v) : 0;  // .g = v * coverage
      half[dst + 2] = valid ? HALF_ONE : 0;   // .b = coverage
      half[dst + 3] = 0;
    }
  }

  return device.createTexture({
    width: cols,
    height: rows,
    format: 'rgba16float',
    data: half,
    sampler: {
      minFilter: 'linear',
      magFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge'
    }
  });
}

type GeoBox = { west: number; south: number; east: number; north: number };

/**
 * Web-Mercator bounds of an XYZ tile index (the scheme deck.gl's Tileset2D uses).
 * @param index Tile index.
 */
function tileBBoxFromIndex({ x, y, z }: { x: number; y: number; z: number }): GeoBox {
  const n = Math.pow(2, z);
  const latitude = (row: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * row) / n))) * 180) / Math.PI;
  return {
    west: (x / n) * 360 - 180,
    east: ((x + 1) / n) * 360 - 180,
    north: latitude(y),
    south: latitude(y + 1)
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

const WIND_FIELD_UNIFORM_BLOCK = `\
layout(std140) uniform windFieldUniforms {
  vec2 uTexSize;
  vec2 uCiMin;
  vec2 uCiMax;
  float uOpacity;
  float uMsToKn;
  float uBands;
} windField;
`;

/**
 * Uniform block of the field shader. The samplers stay in the layer's fragment shader,
 * because luma.gl resolves plain (non block) uniforms and bindings by name.
 */
const windFieldUniforms: ShaderModule = {
  name: 'windField',
  vs: WIND_FIELD_UNIFORM_BLOCK,
  fs: WIND_FIELD_UNIFORM_BLOCK,
  uniformTypes: {
    uTexSize: 'vec2<f32>',
    uCiMin: 'vec2<f32>',
    uCiMax: 'vec2<f32>',
    uOpacity: 'f32',
    uMsToKn: 'f32',
    uBands: 'f32'
  }
};

const WIND_FIELD_VS = `#version 300 es
#define SHADER_NAME wind-field-vertex-shader

in vec3 positions;
in vec2 texCoords;

out vec2 vTexCoord;

void main(void) {
  geometry.worldPosition = positions;
  vec4 commonPosition;
  gl_Position = project_position_to_clipspace(positions, vec3(0.0), vec3(0.0), commonPosition);
  vTexCoord = texCoords;
}
`;

const WIND_FIELD_FS = `#version 300 es
#define SHADER_NAME wind-field-fragment-shader

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D uTexture;
uniform sampler2D uPalette;

in vec2 vTexCoord;
out vec4 fragColor;

// Band boundaries in knots - keep in sync with KNOTS_COLORS above.
void bandRange(float kn, out float lo, out float hi, out float band) {
  lo =  0.0; hi =  3.0; band =  0.0;
  if (kn >=  3.0) { lo =  3.0; hi =  5.0; band =  1.0; }
  if (kn >=  5.0) { lo =  5.0; hi =  6.0; band =  2.0; }
  if (kn >=  6.0) { lo =  6.0; hi =  7.0; band =  3.0; }
  if (kn >=  7.0) { lo =  7.0; hi =  8.0; band =  4.0; }
  if (kn >=  8.0) { lo =  8.0; hi =  9.0; band =  5.0; }
  if (kn >=  9.0) { lo =  9.0; hi = 10.0; band =  6.0; }
  if (kn >= 10.0) { lo = 10.0; hi = 12.0; band =  7.0; }
  if (kn >= 12.0) { lo = 12.0; hi = 15.0; band =  8.0; }
  if (kn >= 15.0) { lo = 15.0; hi = 20.0; band =  9.0; }
  if (kn >= 20.0) { lo = 20.0; hi = 25.0; band = 10.0; }
  if (kn >= 25.0) { lo = 25.0; hi = 200.0; band = 11.0; }
}

vec3 bandColor(float band) {
  return texture(uPalette, vec2((band + 0.5) / 12.0, 0.5)).rgb;
}

void main(void) {
  // vTexCoord runs 0..1 over the tile, the grid window says which part of the payload
  // belongs to it (integer values are data nodes, so the hardware blends the neighbours).
  vec2 ci = mix(windField.uCiMin, windField.uCiMax, vTexCoord);
  vec4 s = texture(uTexture, (ci + 0.5) / windField.uTexSize);

  float coverage = clamp(s.b, 0.0, 1.0);
  if (coverage <= 0.0) {
    fragColor = vec4(0.0);
    return;
  }

  vec2 uvWind = s.rg / max(coverage, 1e-5);
  float kn = length(uvWind) * windField.uMsToKn;

  // Guard against NaN/garbage: an overflowed half float (or a bad node) would turn the
  // band maths into NaN, which drivers paint as flat grey patches.
  if (!(kn >= 0.0) || kn > 1000.0) {
    fragColor = vec4(0.0);
    return;
  }

  float lo, hi, band;
  bandRange(kn, lo, hi, band);

  // Continuous band coordinate: it hits the next integer exactly at every boundary, so
  // fwidth() stays correct even in a pixel quad spanning the boundary.
  float bandC = band + (kn - lo) / (hi - lo);
  vec3 finalColor;

  if (windField.uBands > 0.5) {
    float delta = fwidth(bandC) * 0.75;
    float pos = fract(bandC);
    float edge = smoothstep(1.0 - delta, 1.0 + delta, pos);
    vec3 colA = bandColor(band);
    vec3 colB = bandColor(min(band + 1.0, 11.0));
    finalColor = mix(colA, colB, edge);
  } else {
    finalColor = texture(uPalette, vec2((bandC + 0.5) / 12.0, 0.5)).rgb;
  }

  fragColor = vec4(finalColor, windField.uOpacity * coverage);
}
`;

interface WindTileLayerProps extends LayerProps {
  /** Decoded grid of this tile. */
  data: WindTileGrid;
  /** Quad extent as [west, south, east, north]. */
  bounds: [number, number, number, number];
  /** Grid window of the payload covered by the quad (payload indices). */
  ciMin: [number, number];
  ciMax: [number, number];
  /** Opacity of the rendered wind field. */
  fieldOpacity: number;
}

/** One tile of the wind field: a single textured quad over the tile's data extent. */
class WindTileLayer extends Layer<WindTileLayerProps> {
  static layerName = 'WindTileLayer';

  // The model and the texture live in `state`, so deck.gl transfers them when a layer is
  // matched by id and disposes the model through getModels().
  getShaders(): ModelProps {
    return super.getShaders({
      vs: WIND_FIELD_VS,
      fs: WIND_FIELD_FS,
      modules: [project32, windFieldUniforms]
    }) as ModelProps;
  }

  override initializeState(): void {
    this.setState({
      model: this._createModel(),
      texture: createTileTexture(this.context.device, this.props.data),
      // Remember what the texture was built from (see updateState).
      textureData: this.props.data
    });
  }

  override updateState(params: Parameters<Layer<WindTileLayerProps>['updateState']>[0]): void {
    const { props, oldProps } = params;

    // New data for a layer that deck.gl matched by id (e.g. after a timeline change).
    //
    // Comparing against `oldProps.data` alone is not enough: deck.gl runs the first `updateState`
    // right after `initializeState` with the default props as `oldProps`, so that call looks like
    // a data change and every tile built the very same texture a second time.
    if (props.data !== oldProps.data && props.data !== this.state.textureData) {
      const previous = this.state.texture as Texture | undefined;
      previous?.destroy();
      this.setState({
        texture: createTileTexture(this.context.device, props.data),
        textureData: props.data
      });
    }
  }

  override draw(): void {
    const model = this.state.model as Model | undefined;
    const texture = this.state.texture as Texture | undefined;
    if (!model || !texture) return;

    const { data, ciMin, ciMax, fieldOpacity } = this.props;
    model.shaderInputs.setProps({
      windField: {
        uTexSize: [data.cols, data.rows],
        uCiMin: ciMin,
        uCiMax: ciMax,
        uOpacity: fieldOpacity,
        uMsToKn: MS_TO_KN,
        uBands: FIELD_SHOW_BANDS ? 1 : 0,
        // luma.gl routes non numeric values to the texture bindings by name.
        uTexture: texture,
        uPalette: getPaletteTexture(this.context.device)
      }
    });
    model.draw(this.context.renderPass);
  }

  override finalizeState(): void {
    const texture = this.state.texture as Texture | undefined;
    texture?.destroy();
    // Disposes the model and the attribute manager.
    super.finalizeState(this.context);
  }

  private _createModel(): Model {
    const b = this.props.bounds;
    // Explicit triangle list: a triangle strip of four vertices only rendered one of its two
    // triangles here, which left half of every tile transparent.
    const positions = new Float32Array([
      b[0], b[1], 0,
      b[2], b[1], 0,
      b[2], b[3], 0,
      b[0], b[1], 0,
      b[2], b[3], 0,
      b[0], b[3], 0
    ]);
    // v = 0 is the northern edge, because the first payload row is the northern one.
    const texCoords = new Float32Array([0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0]);

    return new Model(this.context.device, {
      ...this.getShaders(),
      id: this.props.id,
      isInstanced: false,
      geometry: new Geometry({
        topology: 'triangle-list',
        attributes: {
          positions: { size: 3, value: positions },
          texCoords: { size: 2, value: texCoords }
        }
      })
    });
  }
}

/**
 * Loop statistics of the arrow generation, active with `?debug=true` only.
 *
 * The frame probe can name `gridToPoints` as the hot function but not why it is hot: it shows
 * neither the number of tiles that were rendered nor the window the loop was asked for. These
 * counters answer both, so a slow frame can be told apart from a slow loop.
 */
type LoopStats = {
  /** `renderSubLayers` invocations, including the ones that bail out before the loop. */
  tiles: number;
  /** Calls that reached `gridToPoints`. */
  calls: number;
  /** Wind points the loop produced in total. */
  points: number;
  /** Time spent inside `gridToPoints` in total. */
  loopMs: number;
  /** Longest single call of the interval. */
  maxMs: number;
  /** Tile, payload and window of that longest call. */
  maxCall: string;
  /** `performance.now()` of the last report. */
  reportedAt: number;
};

/** Interval the loop statistics are written with, in ms. */
const LOOP_REPORT_INTERVAL_MS = 1000;

const loopStats: LoopStats = {
  tiles: 0,
  calls: 0,
  points: 0,
  loopMs: 0,
  maxMs: 0,
  maxCall: '',
  reportedAt: 0
};

/**
 * One-line description of a `gridToPoints` call.
 *
 * It carries the payload size and the window, because a window that does not fit the payload is
 * the one way the loop can get large without large data - the very thing the point count alone
 * cannot distinguish.
 * @param z Tile zoom the arrows were derived from.
 * @param grid Decoded grid of the tile.
 * @param stride Node step the loop was called with.
 * @param nodeWindow Payload window the loop was called with.
 */
function describeCall(z: number, grid: WindTileGrid, stride: number, nodeWindow: WindNodeWindow): string {
  return `z${z} ${grid.cols}x${grid.rows} ` +
    `i${nodeWindow.colMin.toFixed(1)}..${nodeWindow.colMax.toFixed(1)} ` +
    `j${nodeWindow.rowMin.toFixed(1)}..${nodeWindow.rowMax.toFixed(1)} ` +
    `stride ${stride}`;
}

/**
 * Records one `gridToPoints` call and writes the summary once per interval.
 * @param z Tile zoom the arrows were derived from.
 * @param grid Decoded grid of the tile.
 * @param stride Node step the loop was called with.
 * @param nodeWindow Payload window the loop was called with.
 * @param points Points the loop produced.
 * @param ms Time the loop took.
 */
function reportLoopCall(
  z: number,
  grid: WindTileGrid,
  stride: number,
  nodeWindow: WindNodeWindow,
  points: number,
  ms: number
): void {
  const stats = loopStats;
  stats.calls += 1;
  stats.points += points;
  stats.loopMs += ms;

  if (ms > stats.maxMs) {
    stats.maxMs = ms;
    stats.maxCall = describeCall(z, grid, stride, nodeWindow);
  }

  const now = window.performance.now();
  if (now - stats.reportedAt < LOOP_REPORT_INTERVAL_MS) return;

  logger.debug(
    '[windArrowOverlayView] gridToPoints:',
    `tiles ${stats.tiles}, calls ${stats.calls}, points ${stats.points}, ` +
    `loop ${stats.loopMs.toFixed(1)}ms ` +
    `(${(stats.loopMs / Math.max(1, stats.calls)).toFixed(2)}ms/call), ` +
    `slowest ${stats.maxMs.toFixed(2)}ms ${stats.maxCall}`
  );

  stats.tiles = 0;
  stats.calls = 0;
  stats.points = 0;
  stats.loopMs = 0;
  stats.maxMs = 0;
  stats.maxCall = '';
  stats.reportedAt = now;
}

/**
 * Generates the wind points of one tile and records the loop statistics.
 * @param grid Decoded grid of the tile.
 * @param z Tile zoom the arrows are derived from.
 * @param stride Node step on both axes; see {@link arrowStride}.
 * @param nodeWindow Payload window of the tile's data quad.
 * @returns Wind points of the tile.
 */
function generateArrowPoints(
  grid: WindTileGrid,
  z: number,
  stride: number,
  nodeWindow: WindNodeWindow
): WindTilePoint[] {
  if (!isDebugEnabled) return gridToPoints(grid, stride, getGridAnchor(), nodeWindow);

  const started = window.performance.now();
  const points = gridToPoints(grid, stride, getGridAnchor(), nodeWindow);
  reportLoopCall(z, grid, stride, nodeWindow, points.length, window.performance.now() - started);
  return points;
}

/** XYZ index of a tileset tile. */
type TileIndex = { x: number; y: number; z: number };

/** Decoded payload of a tile and the window of it the tile's quad covers. */
type TileQuad = {
  grid: WindTileGrid;
  /** Payload window of the quad (payload indices). */
  i0: number;
  i1: number;
  j0: number;
  j1: number;
  /** Quad extent as [west, south, east, north]. */
  bounds: [number, number, number, number];
};

/**
 * Narrows `props.tile.bbox` to the WGS84 form.
 *
 * deck.gl hands either that one or a `left/top/right/bottom` box, depending on the indexing scheme
 * of the tileset, so the bbox has to be told apart instead of assumed.
 * @param bbox Value of `props.tile.bbox`.
 * @returns True when the box uses west/south/east/north.
 */
function isGeoBox(bbox: unknown): bbox is GeoBox {
  return typeof bbox === 'object' && bbox !== null && 'west' in bbox;
}

/**
 * Resolves the part of a tile's payload that its quad covers.
 *
 * The requested tile defines the quad; the payload origin/delta define which part of the grid it
 * covers. Both are clamped to what the payload really contains, so padded archives draw up to the
 * tile edge and unpadded ones keep one cell of allowance.
 * @param grid Decoded grid of the tile, or null when the archive has no data there.
 * @param tile Tile the sub layers are being built for.
 * @returns Window, extent and grid, or null when there is nothing to draw for this tile.
 */
function resolveTileQuad(
  grid: WindTileGrid | null,
  tile: { index: TileIndex; bbox?: unknown }
): TileQuad | null {
  if (!grid) return null;                           // tile does not exist in the archive

  const bb: GeoBox = isGeoBox(tile.bbox) ? tile.bbox : tileBBoxFromIndex(tile.index);

  const i0 = clamp((bb.west - grid.originLng) / grid.deltaLng, 0, grid.cols - 1);
  const i1 = clamp((bb.east - grid.originLng) / grid.deltaLng, 0, grid.cols - 1);
  const j0 = clamp((grid.originLat - bb.north) / grid.deltaLat, 0, grid.rows - 1);
  const j1 = clamp((grid.originLat - bb.south) / grid.deltaLat, 0, grid.rows - 1);
  if (i1 <= i0 || j1 <= j0) return null;            // no data here

  return {
    grid,
    i0,
    i1,
    j0,
    j1,
    bounds: [
      grid.originLng + i0 * grid.deltaLng,
      grid.originLat - j1 * grid.deltaLat,
      grid.originLng + i1 * grid.deltaLng,
      grid.originLat - j0 * grid.deltaLat
    ]
  };
}

/**
 * Tile loader of a wind tile pyramid.
 *
 * Above the pyramid's finest level the tileset still subdivides (up to TILE_MAX_ZOOM), so the
 * requested tile is mapped onto the finest stored level: the level difference shifts the index
 * down with it, otherwise the wrong tile would be read. The sub layers then draw only the part of
 * that payload their tile covers (see resolveTileQuad).
 *
 * The coverage block of the index describes exactly those shifted indices, so a tile the run does
 * not store is skipped before its request is made. `null` is the same "no data" answer the loader
 * gives for a 404, which deck.gl caches as an empty tile.
 * @param tileUrlTemplate Tile URL template of the pyramid of the active timestamp.
 */
function createTileLoader(tileUrlTemplate: string) {
  return async (tile: { index: TileIndex; signal?: AbortSignal }): Promise<WindTileGrid | null> => {
    const { z, x, y } = tile.index;
    const dz = Math.max(0, z - ARCHIVE_MAX_ZOOM);
    const archiveZ = z - dz;
    const archiveX = x >> dz;
    const archiveY = y >> dz;

    if (!tilePyramid.isTileCovered(weatherProviderModel.windTileCoverage, archiveZ, archiveX, archiveY)) {
      return null;
    }

    return getTileGrid(tileUrlTemplate, archiveZ, archiveX, archiveY, tile.signal);
  };
}

/**
 * Props of the wind tile layer.
 *
 * `getTileData` is the ONLY update trigger: a new timestamp reloads the tiles, and
 * nothing else ever invalidates one that is already in the cache. That is what keeps a zoom free
 * of rebuilds - the tileset selects the new level and builds those tiles, while the cached ones
 * keep their sub layers.
 * @param tileUrlTemplate Tile URL template of the pyramid of the active timestamp.
 */
function baseTileLayerProps(tileUrlTemplate: string) {
  return {
    updateTriggers: { getTileData: [tileUrlTemplate] },
    minZoom: TILE_MIN_ZOOM,
    maxZoom: TILE_MAX_ZOOM,
    zoomOffset: TILE_ZOOM_OFFSET,
    tileSize: TILE_SIZE,
    extent: TILE_EXTENT,
    maxRequests: TILE_MAX_REQUESTS,
    debounceTime: TILE_DEBOUNCE_MS,
    refinementStrategy: 'best-available' as const,
    getTileData: createTileLoader(tileUrlTemplate)
  };
}

/**
 * Sub layer of the wind field: one textured quad over the part of the payload the tile covers.
 * @param quad Window, extent and grid resolved from the tile payload.
 * @param id Layer id.
 */
function createFieldLayer(quad: TileQuad, id: string): WindTileLayer {
  return new WindTileLayer({
    id,
    data: quad.grid,
    bounds: quad.bounds,
    ciMin: [quad.i0, quad.j0],
    ciMax: [quad.i1, quad.j1],
    fieldOpacity: FIELD_OPACITY,
    // Straight alpha blending; the field is drawn below the arrows and has no depth.
    parameters: {
      blend: true,
      blendColorOperation: 'add',
      blendColorSrcFactor: 'src-alpha',
      blendColorDstFactor: 'one-minus-src-alpha',
      blendAlphaOperation: 'add',
      blendAlphaSrcFactor: 'one',
      blendAlphaDstFactor: 'one-minus-src-alpha',
      depthWriteEnabled: false,
      depthCompare: 'always',
      cullMode: 'none'
    }
  });
}

/**
 * Tile layer that carries the wind field with the arrows on top of it.
 *
 * Both come from a single decode of the same tile: the field uploads the grid as a texture, the
 * arrows take every `arrowStride`-th node of that grid. The tileset moves up to TILE_MAX_ZOOM, so a
 * zoom change builds the next level's tiles and with them the next arrow density - no update
 * trigger, no rebuild of the cached tiles, no module state.
 * @param tileUrlTemplate Tile URL template of the pyramid of the active timestamp.
 */
function createWindTileLayer(tileUrlTemplate: string) {
  return new TileLayer<WindTileGrid | null>({
    ...baseTileLayerProps(tileUrlTemplate),
    id: 'wind-tile-layer',

    renderSubLayers: (props) => {
      if (isDebugEnabled) loopStats.tiles += 1;

      const quad = resolveTileQuad(props.data, props.tile);
      if (!quad) return null;

      const tileZoom = props.tile.index.z;
      const points = generateArrowPoints(quad.grid, tileZoom, arrowStride(tileZoom), {
        colMin: quad.i0,
        colMax: quad.i1,
        rowMin: quad.j0,
        rowMax: quad.j1
      });

      // A stable id: the arrows of a tile are only ever built from its decoded payload, so deck.gl
      // matches the layer and updates its attributes instead of building a new one.
      return [
        createFieldLayer(quad, `${props.id}-field`),
        createArrowLayer(points, `${props.id}-arrows`, tileUrlTemplate)
      ];
    }
  });
}

/** Arrow icon; built once and shared by every tile sublayer. */
const ARROW_ICON_URL = `data:image/svg+xml;utf8,${encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 80" width="40" height="80">
          <defs>
            <filter id="glow" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="blur" />
              <feComponentTransfer in="blur" result="boost">
                <feFuncA type="linear" slope="3"/>
              </feComponentTransfer>
              <feMerge>
                <feMergeNode in="boost" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <g filter="url(#glow)">
            <path d="M 7 22 L 20 8 L 33 22 M 20 8 L 20 72" fill="none" stroke="#ffffff" stroke-width="13" stroke-linecap="round" stroke-linejoin="round" />
          </g>
          <path d="M 7 22 L 20 8 L 33 22 M 20 8 L 20 72" fill="none" stroke="#1c1e22" stroke-width="8.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      `)}`;

/**
 * Icon layer with the wind arrows of one tile.
 * @param points Wind points derived from the tile grid.
 * @param id Layer id.
 * @param tileUrlTemplate Tile URL template, used as update trigger.
 */
function createArrowLayer(points: WindTilePoint[], id: string, tileUrlTemplate: string): IconLayer<WindTilePoint> {
  return new IconLayer<WindTilePoint>({
    id,
    data: points,
    iconAtlas: ARROW_ICON_URL,
    iconMapping: { arrow: { x: 0, y: 0, width: 40, height: 80, mask: false } },
    getIcon: () => 'arrow',
    getPosition: (point: WindTilePoint) => point.position,
    getAngle: (point: WindTilePoint) => 180 - point.angle,
    getSize: (point: WindTilePoint) =>
      Math.min(Math.max(8, 8 + Math.sqrt(Math.max(0, point.speed * 1.94384 - 3)) * 4.8), 30),

    // Triggers keep the arrows in sync when a new timestamp is selected.
    updateTriggers: {
      getPosition: [tileUrlTemplate],
      getAngle: [tileUrlTemplate],
      getSize: [tileUrlTemplate]
    },

    // Soft animation of the arrows on data changes (in ms).
    //transitions: {
    //  getAngle: 300,
    //  getSize: 300
    //},

    sizeScale: 1,
    sizeUnits: 'pixels',
    billboard: false,
    pickable: false
  });
}

export interface IWindArrowOverlayView {
  init: (map: LeafletMap) => void;
  setWindTileTemplate?: (tileUrlTemplate: string) => void;
}

export const windArrowOverlayView: IWindArrowOverlayView = {
  init(map: LeafletMap) {
    if (!overlayInstance) {
      overlayInstance = new LeafletDeckOverlay({ className: 'wind-arrow-deck-overlay', zIndex: '510' });
      overlayInstance.addTo(map);

      weatherProviderModel.addEventListener('model:timestamp-index-updated', () => {
        // if the active provider does not support the wind overlay, clear any existing layers
        if (!weatherProviderModel.supportsArrowOverlay) {
          clearWindLayers('provider does not support wind overlay');
          return;
        }

        const ts = weatherProviderModel.activeTimestamp;
        if (!ts) return;

        // The index owns the pyramid layout: `tiles_url` is a path relative to the provider root
        // with a `{timestamp}` placeholder, and the run it starts with changes per model run.
        const template = weatherProviderModel.windTilesUrlTemplate;
        const baseUrl = providers[weatherProviderModel.getActiveProviderId()]?.baseUrl;
        if (!template || !baseUrl) {
          clearWindLayers('index has no tiles_url');
          return;
        }

        const tileUrlTemplate = tilePyramid.buildTileUrlTemplate(
          baseUrl,
          template,
          tilePyramid.tileFolderTimestamp(ts)
        );
        logger.debug('[windArrowOverlayView] model:timestamp-index-updated', { timestamp: ts, url: tileUrlTemplate });
        windArrowOverlayView.setWindTileTemplate?.(tileUrlTemplate);
      });

      // On provider switch, drop the wind layers of the previous provider. They stay hidden
      // until the new provider's tiles are loaded and `model:timestamp-index-updated` fires again.
      weatherProviderModel.addEventListener('model:provider-changed', () => {
        clearWindLayers('provider changed');
      });

      // No zoom listener: the tile layer follows a zoom through its tileset alone (see
      // TILE_MAX_ZOOM, ARCHIVE_MAX_ZOOM and arrowStride).
    }
  },

  setWindTileTemplate(tileUrlTemplate: string) {
    if (!tileUrlTemplate || !overlayInstance) return;

    logger.debug('[windArrowOverlayView] setWindTileTemplate', tileUrlTemplate);
    currentTileUrlTemplate = tileUrlTemplate;

    // Field and arrows: two layers over the same pyramid.
    applyWindLayers();
  }
};