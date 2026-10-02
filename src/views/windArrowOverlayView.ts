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
import { getTileGrid, getTilePoints } from '../services/windArrowService';
import type { WindTileGrid } from '../services/windArrowService';
import { weatherProviderModel } from '../models/weatherProviderModel';
import { logger } from '../utils/logger';

let overlayInstance: LeafletDeckOverlay | null = null;

/* ---------------------------------------------------------------------------
 *  Tile settings shared by both layers
 *
 *  The field and the arrows read the same archive, so they must ask for exactly
 *  the same tiles: tile zoom = round(deckZoom + log2(512 / tileSize) + zoomOffset).
 * ------------------------------------------------------------------------- */
const TILE_SIZE = 256;
const TILE_ZOOM_OFFSET = -4;
const TILE_MIN_ZOOM = 0;
const TILE_MAX_ZOOM = 8;
const TILE_MAX_REQUESTS = 6;
const TILE_DEBOUNCE_MS = 80;
const TILE_EXTENT: [number, number, number, number] = [-180, -85.051129, 180, 85.051129];

/**
 * The arrows use TILE_ZOOM_OFFSET (four levels coarser than the map) on purpose: they only
 * need one arrow per grid node. The field must not do that - at a coarse data level a single
 * tile stretches a handful of nodes over the whole viewport, which looks patchy. It therefore
 * tracks the map resolution instead: tile zoom = round(leaflet zoom).
 */
const FIELD_TILE_ZOOM_OFFSET = 0;

/**
 * Removes all currently rendered arrow layers so no stale arrows remain visible.
 * Emptying the layer set makes deck.gl finalize the previous tile layer, so the next
 * `setPmtilesUrl` call builds a fresh layer with a clean tile cache.
 * @param reason Short description used for diagnostic logging.
 */
function clearArrows(reason: string): void {
  if (!overlayInstance) return;
  logger.debug('[windArrowOverlayView] clearing arrow layers', { reason });
  try {
    overlayInstance.setLayers([]);
  } catch {
    // deck.gl rejects layer updates while it is tearing down; the next setLayers call re-applies.
  }
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
      texture: createTileTexture(this.context.device, this.props.data)
    });
  }

  override updateState(params: Parameters<Layer<WindTileLayerProps>['updateState']>[0]): void {
    const { props, oldProps } = params;

    // New data for a layer that deck.gl matched by id (e.g. after a timeline change).
    if (props.data !== oldProps.data) {
      const previous = this.state.texture as Texture | undefined;
      previous?.destroy();
      this.setState({ texture: createTileTexture(this.context.device, props.data) });
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
 * Builds the tile layer of the wind field (the coloured bands below the arrows).
 * @param pmUrl Archive URL of the active timestamp.
 */
function createFieldTileLayer(pmUrl: string) {
  return new TileLayer<WindTileGrid | null>({
    id: 'wind-field-tile-layer',

    // Rebuilds the tile cache when a new archive (timestamp) is selected.
    updateTriggers: {
      getTileData: [pmUrl]
    },

    minZoom: TILE_MIN_ZOOM,
    maxZoom: TILE_MAX_ZOOM,
    tileSize: TILE_SIZE,
    zoomOffset: FIELD_TILE_ZOOM_OFFSET,
    extent: TILE_EXTENT,
    maxRequests: TILE_MAX_REQUESTS,
    debounceTime: TILE_DEBOUNCE_MS,
    refinementStrategy: 'best-available',

    getTileData: async ({ index: { x, y, z }, signal }): Promise<WindTileGrid | null> => {
      try {
        return await getTileGrid(pmUrl, z, x, y, signal);
      } catch (err) {
        logger.error('[windArrowOverlayView] field getTileData error', err);
        return null;
      }
    },

    renderSubLayers: (props) => {
      const grid = props.data;
      if (!grid) return null;                       // tile does not exist in the archive

      const index = props.tile.index;

      // The requested tile defines the quad; the payload origin/delta define which part of
      // the grid it covers. Both are clamped to what the payload really contains, so padded
      // archives draw up to the tile edge and unpadded ones keep one cell of allowance.
      const deckBBox = props.tile.bbox;
      const bb: GeoBox = deckBBox && 'west' in deckBBox
        ? { west: deckBBox.west, south: deckBBox.south, east: deckBBox.east, north: deckBBox.north }
        : tileBBoxFromIndex(index);

      const i0 = clamp((bb.west - grid.originLng) / grid.deltaLng, 0, grid.cols - 1);
      const i1 = clamp((bb.east - grid.originLng) / grid.deltaLng, 0, grid.cols - 1);
      const j0 = clamp((grid.originLat - bb.north) / grid.deltaLat, 0, grid.rows - 1);
      const j1 = clamp((grid.originLat - bb.south) / grid.deltaLat, 0, grid.rows - 1);
      if (i1 <= i0 || j1 <= j0) return null;        // no data here

      const bounds: [number, number, number, number] = [
        grid.originLng + i0 * grid.deltaLng,
        grid.originLat - j1 * grid.deltaLat,
        grid.originLng + i1 * grid.deltaLng,
        grid.originLat - j0 * grid.deltaLat
      ];

      return new WindTileLayer({
        id: props.id,
        data: grid,
        bounds,
        ciMin: [i0, j0],
        ciMax: [i1, j1],
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
  });
}

function createTileLayer(pmUrl: string) {
  return new TileLayer({
    // Feste ID beibehalten, damit deck.gl den Layer wiederverwendet
    // und sanfte Übergänge ermöglicht
    id: 'wind-arrow-tile-layer',

    // WICHTIG: Signalisiert deck.gl, dass getTileData bei einer neuen pmUrl
    // erneut ausgeführt und der Kachel-Cache invalidiert werden muss
    updateTriggers: {
      getTileData: [pmUrl]
    },

    minZoom: TILE_MIN_ZOOM,
    maxZoom: TILE_MAX_ZOOM,
    tileSize: TILE_SIZE,
    zoomOffset: TILE_ZOOM_OFFSET,
    extent: TILE_EXTENT,
    // Reduce burst of parallel requests during fast interactions
    maxRequests: TILE_MAX_REQUESTS,
    debounceTime: TILE_DEBOUNCE_MS,
    refinementStrategy: 'best-available',

    getTileData: async ({ index: { x, y, z }, signal }: { index: { x: number; y: number; z: number }; signal?: AbortSignal }) => {
      try {
        logger.debug('[windArrowOverlayView] getTileData (delegated)', { pmUrl, z, x, y });
        return await getTilePoints(pmUrl, z, x, y, signal);
      } catch (err) {
        logger.error('[windArrowOverlayView] getTileData error', err);
        return [];
      }
    },

    renderSubLayers: (props: unknown) => {
      const maybe = props as { data?: unknown };
      const rawData = maybe.data;

      type WindPoint = { position: [number, number]; angle: number; speed: number };
      const isWindPoint = (v: unknown): v is WindPoint => {
        if (typeof v !== 'object' || v === null) return false;
        const obj = v as Record<string, unknown>;
        const pos = obj.position;
        return Array.isArray(pos) && pos.length === 2 && typeof pos[0] === 'number' && typeof pos[1] === 'number' && typeof obj.angle === 'number' && typeof obj.speed === 'number';
      };

      const data: WindPoint[] = Array.isArray(rawData) ? rawData.filter(isWindPoint) : [];

      const arrowSvg = `
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
      `;
      const iconUrl = `data:image/svg+xml;utf8,${encodeURIComponent(arrowSvg)}`;

      const iconLayerProps = props as ConstructorParameters<typeof IconLayer>[0];

      return new IconLayer(iconLayerProps, {
        data,
        iconAtlas: iconUrl,
        iconMapping: { arrow: { x: 0, y: 0, width: 40, height: 80, mask: false } },
        getIcon: () => 'arrow',
        getPosition: (obj: unknown) => (obj as WindPoint).position,
        getAngle: (obj: unknown) => 180 - (obj as WindPoint).angle,
        getSize: (obj: unknown) => {
          const p = obj as WindPoint;
          return Math.min(Math.max(8, 8 + Math.sqrt(Math.max(0, p.speed * 1.94384 - 3)) * 4.8), 30);
        },

        // Update-Triggers für den Sublayer, wenn sich die Daten verändern
        updateTriggers: {
          getPosition: [pmUrl],
          getAngle: [pmUrl],
          getSize: [pmUrl]
        },

        // Optionale softe Animation der Pfeile bei Änderungen (in ms)
        transitions: {
          getAngle: 300,
          getSize: 300
        },

        sizeScale: 1,
        sizeUnits: 'pixels',
        billboard: false,
        pickable: false
      });
    }
  });
}

export interface IWindArrowOverlayView {
  init: (map: LeafletMap) => void;
  setPmtilesUrl?: (pmUrl: string) => void;
}

export const windArrowOverlayView: IWindArrowOverlayView = {
  init(map: LeafletMap) {
    if (!overlayInstance) {
      overlayInstance = new LeafletDeckOverlay({ className: 'wind-arrow-deck-overlay', zIndex: '510' });
      overlayInstance.addTo(map);

      weatherProviderModel.addEventListener('model:timestamp-index-updated', () => {
        // if the active provider does not support PMTiles, clear any existing arrows
        if (!weatherProviderModel.supportsArrowOverlay) {
          clearArrows('provider does not support arrow overlay');
          return;
        }

        const ts = weatherProviderModel.activeTimestamp;
        if (!ts) return;
        const pmUrl = `/${ts}Z_dir.pmtiles`;
        logger.debug('[windArrowOverlayView] model:timestamp-index-updated', { timestamp: ts, url: pmUrl });
        windArrowOverlayView.setPmtilesUrl?.(pmUrl);
      });

      // On provider switch, drop the arrows of the previous provider. They stay hidden until
      // the new provider's tiles are loaded and `model:timestamp-index-updated` fires again.
      weatherProviderModel.addEventListener('model:provider-changed', () => {
        clearArrows('provider changed');
      });

    }
  },

  setPmtilesUrl(pmUrl: string) {
    if (!pmUrl || !overlayInstance) return;

    logger.debug('[windArrowOverlayView] setPmtilesUrl', pmUrl);

    // Field first so the arrows end up on top of it (deck.gl draws in array order).
    const fieldLayer = createFieldTileLayer(pmUrl);
    const arrowLayer = createTileLayer(pmUrl);
    overlayInstance.setLayers([fieldLayer, arrowLayer]);
  }
};