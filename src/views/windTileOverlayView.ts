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
import type { ProviderConfig } from '../config';
import { providers } from '../config';
import { weatherProviderModel } from '../models/weatherProviderModel';
import * as windTileService from '../services/windTileService';
import * as windTileGeometry from '../utils/windTileGeometry';
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
 * Pixel width deck.gl draws a tile at.
 *
 * The pyramid is self-similar (nodes double per level), so at 1024 px one node is ~9 px on every
 * level the archive stores. {@link TILE_ZOOM_OFFSET} then makes the tileset pick the finest level
 * one map zoom earlier.
 */
const TILE_SIZE = 1024;
const TILE_MIN_ZOOM = 0;
/** Detail bias of the tileset, in zoom levels (see `Tileset2D.getTileIndices`). */
const TILE_ZOOM_OFFSET = 1;
/** Tile requests in flight; bounds how fast a new timestamp fills in. */
const TILE_MAX_REQUESTS = 6;
const TILE_EXTENT: [number, number, number, number] = [-180, -85.051129, 180, 85.051129];

/**
 * Node step between arrows on the finest level of the archive.
 *
 * The tileset moves one level per zoom step (up to two levels above the archive), and the tiles of
 * those levels cover a smaller area each, so the step doubles with the offset to keep the on-screen
 * spacing constant.
 */
const ARROW_STRIDE_BASE = 4 * Math.pow(2, TILE_ZOOM_OFFSET);
/** Uniform scale applied to the arrow icon. */
const ARROW_SIZE_SCALE = 0.7;
/** Opacity of the wind field, the value the former image overlay used. */
const FIELD_OPACITY = 0.65;
/** 1 m/s in knots. */
const MS_TO_KNOTS = 1.9438445;

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

/* -------------------------------------------------------------------------
 *  Wind field
 *
 *  Each tile payload is uploaded as a premultiplied RGBA16F texture (rg = u/v * coverage,
 *  b = coverage) with LINEAR filtering, so the GPU does the bilinear interpolation and the
 *  fragment shader needs one texture tap per fragment.
 * ------------------------------------------------------------------------- */

/** Band colours of css/forecast-view.css (`.w-under-3` ... `.w-over-25`), lowest band first. */
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

let paletteTexture: Texture | null = null;
let paletteDevice: Device | null = null;

/**
 * Shared palette texture (one row of {@link BAND_COUNT} colours) for all tiles.
 *
 * Recreated when the deck.gl device changes, e.g. after the overlay was re-added.
 * @param device Device that will sample the palette.
 */
function getPaletteTexture(device: Device): Texture {
  if (paletteTexture && paletteDevice === device) return paletteTexture;

  const data = new Uint8Array(BAND_COUNT * 4);
  KNOTS_COLORS.forEach((color, index) => {
    data[index * 4] = color[0];
    data[index * 4 + 1] = color[1];
    data[index * 4 + 2] = color[2];
    data[index * 4 + 3] = 255;
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

const FLOAT_ONE = new Float32Array(1);
const FLOAT_ONE_BITS = new Int32Array(FLOAT_ONE.buffer);
/** 1.0 as IEEE binary16 bit pattern. */
const HALF_ONE = 0x3c00;

/**
 * Converts a float32 value into its IEEE binary16 bit pattern (round to nearest).
 *
 * RGBA16F is the only float format WebGL2 filters natively, which is what allows the hardware
 * interpolation of the wind field.
 * @param value Value to convert.
 */
function toHalf(value: number): number {
  FLOAT_ONE[0] = value;
  const bits32 = FLOAT_ONE_BITS[0]!;
  let bits = (bits32 >> 16) & 0x8000;
  let mantissa = (bits32 >> 12) & 0x07ff;
  const exponent = (bits32 >> 23) & 0xff;

  if (exponent < 103) return bits; // too small for a half float -> zero
  if (exponent > 142) { // inf / NaN
    return bits | 0x7c00 | ((exponent === 255 && (bits32 & 0x007fffff) !== 0) ? 1 : 0);
  }
  if (exponent < 113) { // subnormal
    mantissa |= 0x0800;
    return bits | ((mantissa >> (114 - exponent)) + ((mantissa >> (113 - exponent)) & 1));
  }

  bits |= ((exponent - 112) << 10) | (mantissa >> 1);
  return bits + (mantissa & 1);
}

/**
 * Uploads one decoded tile grid as a premultiplied RGBA16F texture.
 *
 * Masked nodes get coverage 0 and therefore contribute nothing to the filtered value.
 * @param device Device that will sample the texture.
 * @param grid Decoded tile grid.
 */
function createTileTexture(device: Device, grid: windTileService.WindTileGrid): Texture {
  const { cols, rows, uv } = grid;
  const half = new Uint16Array(cols * rows * 4);

  for (let row = 0; row < rows; row++) {
    const rowOffset = row * cols * 4;
    for (let col = 0; col < cols; col++) {
      const source = (row * cols + col) * 2;
      const u = uv[source];
      const v = uv[source + 1];
      const valid = u !== undefined && v !== undefined && Number.isFinite(u) && Number.isFinite(v);
      const target = rowOffset + col * 4;
      half[target] = valid ? toHalf(u) : 0;      // .r = u * coverage
      half[target + 1] = valid ? toHalf(v) : 0;  // .g = v * coverage
      half[target + 2] = valid ? HALF_ONE : 0;   // .b = coverage
      half[target + 3] = 0;
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

const WIND_FIELD_UNIFORM_BLOCK = `\
layout(std140) uniform windFieldUniforms {
  vec2 uTexSize;
  vec2 uCiMin;
  vec2 uCiMax;
  float uOpacity;
  float uMsToKn;
  float uBands;
  float uQuantKn;
} windField;
`;

/**
 * Uniform block of the field shader. The samplers stay in the layer's fragment shader, because
 * luma.gl resolves plain (non block) uniforms and bindings by name.
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
    uBands: 'f32',
    uQuantKn: 'f32'
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
  // belongs to it (integer values are data nodes, so the taps below blend the neighbours).
  vec2 ci = mix(windField.uCiMin, windField.uCiMax, vTexCoord);

  // Manual bilinear reconstruction. The payload is uploaded as RGBA16F and the hardware
  // filtering of that format is not reliable here: the sample comes back nearest, which
  // turns the field into flat cell blocks and makes the band contour follow the payload
  // grid (the visible stair steps). Four explicit taps on the surrounding texel centres,
  // weighted by the fractional position, reconstruct the interpolation.
  vec2 base = floor(ci);
  vec2 frac = ci - base;
  vec2 uvA = (base + 0.5) / windField.uTexSize;
  vec2 uvB = (base + 1.5) / windField.uTexSize;
  vec4 sample00 = texture(uTexture, vec2(uvA.x, uvA.y));
  vec4 sample10 = texture(uTexture, vec2(uvB.x, uvA.y));
  vec4 sample01 = texture(uTexture, vec2(uvA.x, uvB.y));
  vec4 sample11 = texture(uTexture, vec2(uvB.x, uvB.y));
  vec4 fieldSample = mix(
      mix(sample00, sample10, frac.x),
      mix(sample01, sample11, frac.x),
      frac.y
  );

  float coverage = clamp(fieldSample.b, 0.0, 1.0);
  vec2 uvWind = fieldSample.rg / max(coverage, 1e-5);
  float kn = length(uvWind) * windField.uMsToKn;

  // Guard against NaN/garbage without leaving the uniform control flow that fwidth()
  // below needs: an overflowed half float would turn the band maths into NaN, which
  // drivers paint as flat grey patches.
  bool usable = (kn >= 0.0) && (kn <= 1000.0) && (coverage > 1e-4);
  kn = usable ? kn : 0.0;

  float lo, hi, band;
  bandRange(kn, lo, hi, band);

  // Continuous band coordinate: it hits the next integer exactly at every boundary, so
  // fwidth() stays correct even in a pixel quad spanning the boundary.
  float bandC = band + (kn - lo) / (hi - lo);

  // Hard band edges with a one-pixel transition, matching the legend swatches. The width
  // is never allowed to fall below half a payload quantization step: the stored values
  // are rounded to uQuantKn, so a narrower edge locks the contour onto that lattice.
  float delta = max(fwidth(bandC) * 0.75, 0.5 * windField.uQuantKn / (hi - lo));
  float position = fract(bandC);
  float edge = smoothstep(1.0 - delta, 1.0 + delta, position);
  vec3 finalColor = mix(bandColor(band), bandColor(min(band + 1.0, 11.0)), edge);

  fragColor = vec4(finalColor, windField.uOpacity * coverage);
}
`;

interface WindTileLayerProps extends LayerProps {
  /** Decoded grid of this tile. */
  data: windTileService.WindTileGrid;
  /** Quad extent as [west, south, east, north]. */
  bounds: [number, number, number, number];
  /** Grid window of the payload covered by the quad (payload indices). */
  ciMin: [number, number];
  ciMax: [number, number];
  /** Opacity of the rendered wind field. */
  fieldOpacity: number;
  /** Quantization step of the payload in knots (`format.scale` converted). */
  quantKn: number;
}

/** GPU resources of one field tile. */
type WindTileLayerState = {
  model?: Model;
  texture?: Texture;
  /** Grid the current texture was built from; guards against a duplicate upload. */
  textureData?: windTileService.WindTileGrid;
};

/** One tile of the wind field: a single textured quad over the tile's data extent. */
class WindTileLayer extends Layer<WindTileLayerProps> {
  static layerName = 'WindTileLayer';

  /** deck.gl types `Layer.state` as `{}`; this narrows it to what `initializeState` sets. */
  declare state: WindTileLayerState;

  /**
   * Adds the deck.gl default shader modules (projection, picking).
   *
   * `Layer.getShaders` is typed `any`, so the result is asserted once here instead of letting
   * `any` leak into the model construction.
   */
  override getShaders(): ModelProps {
    return super.getShaders({
      vs: WIND_FIELD_VS,
      fs: WIND_FIELD_FS,
      modules: [project32, windFieldUniforms]
    }) as ModelProps;
  }

  override initializeState(): void {
    this.setState({
      model: this.createModel(),
      texture: createTileTexture(this.context.device, this.props.data),
      textureData: this.props.data
    });
  }

  override updateState(params: Parameters<Layer<WindTileLayerProps>['updateState']>[0]): void {
    const { props } = params;

    // New data for a layer deck.gl matched by id (e.g. after a timestamp change). Comparing
    // against `oldProps.data` alone is not enough: deck.gl runs the first `updateState` right
    // after `initializeState` with the default props as `oldProps`, so that call looks like a
    // data change and every tile would upload the very same texture twice.
    if (props.data !== this.state.textureData) {
      this.state.texture?.destroy();
      this.setState({
        texture: createTileTexture(this.context.device, props.data),
        textureData: props.data
      });
    }
  }

  override draw(): void {
    const { model, texture } = this.state;
    if (!model || !texture) return;

    const { data, ciMin, ciMax, fieldOpacity, quantKn } = this.props;
    model.shaderInputs.setProps({
      windField: {
        uTexSize: [data.cols, data.rows],
        uCiMin: ciMin,
        uCiMax: ciMax,
        uOpacity: fieldOpacity,
        uMsToKn: MS_TO_KNOTS,
        uBands: 1,
        uQuantKn: quantKn,
        // luma.gl routes non-numeric values to the texture bindings by name.
        uTexture: texture,
        uPalette: getPaletteTexture(this.context.device)
      }
    });
    model.draw(this.context.renderPass);
  }

  override finalizeState(): void {
    this.state.texture?.destroy();
    // Disposes the model and the attribute manager.
    super.finalizeState(this.context);
  }

  private createModel(): Model {
    const bounds = this.props.bounds;
    // Explicit triangle list: a triangle strip of four vertices only rendered one of its two
    // triangles here, which left half of every tile transparent.
    const positions = new Float32Array([
      bounds[0], bounds[1], 0,
      bounds[2], bounds[1], 0,
      bounds[2], bounds[3], 0,
      bounds[0], bounds[1], 0,
      bounds[2], bounds[3], 0,
      bounds[0], bounds[3], 0
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
 * Sub layer of the wind field: one textured quad over the part of the payload the tile covers.
 * @param quad Window, extent and grid resolved from the tile payload.
 * @param id Layer id.
 * @param quantKn Payload quantization step in knots, used as the minimum band-edge width.
 */
function createFieldLayer(quad: windTileGeometry.TileQuad, id: string, quantKn: number): WindTileLayer {
  return new WindTileLayer({
    id,
    data: quad.grid,
    bounds: quad.bounds,
    ciMin: [quad.i0, quad.j0],
    ciMax: [quad.i1, quad.j1],
    fieldOpacity: FIELD_OPACITY,
    quantKn,
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
    pickable: false
    // No transitions: deck.gl's transition readback (`getBufferSubData`) was the single largest
    // cost in the frame profile of the prototype, and the arrows only change on a new timestamp.
  });
}

/**
 * Builds the tile layer of one timestamp.
 *
 * The tileset subdivides up to two levels above the archive, so the requested tile is mapped onto
 * the finest stored level: the level difference shifts the index down with it, otherwise the wrong
 * tile would be read. Each sub layer then draws only the part of that payload its tile covers (see
 * {@link resolveTileQuad}).
 *
 * `getTileData` is the only update trigger: a new timestamp reloads the tiles, and nothing else
 * ever invalidates one that is already cached. A zoom therefore builds the next level's tiles
 * while the cached ones keep their sub layers - no rebuild, no module state.
 * @param urlTemplate Absolute tile URL template of the active timestamp.
 * @param archiveMaxZoom Finest level the pyramid stores.
 * @param coverage Tiles the run really stores, or null when the index has no coverage block.
 * @param format Payload encoding of the pyramid.
 * @param anchor Lattice anchor of the archive.
 */
function createWindTileLayer(
  urlTemplate: string,
  archiveMaxZoom: number,
  coverage: TileCoverage | null,
  format: windTileService.WindTileFormat,
  anchor: windTileService.WindGridAnchor
): TileLayer<windTileService.WindTileGrid | null> {
  return new TileLayer<windTileService.WindTileGrid | null>({
    id: 'wind-tile-layer',
    minZoom: TILE_MIN_ZOOM,
    // Two levels above the archive, until the arrows would be one node apart.
    maxZoom: archiveMaxZoom + 2,
    zoomOffset: TILE_ZOOM_OFFSET,
    tileSize: TILE_SIZE,
    extent: TILE_EXTENT,
    maxRequests: TILE_MAX_REQUESTS,
    refinementStrategy: 'best-available',
    // A new run means a new URL, and only a new URL means new tiles.
    updateTriggers: { getTileData: [urlTemplate] },
    getTileData: async ({ index, signal }) => {
      const dz = Math.max(0, index.z - archiveMaxZoom);
      const archiveZ = index.z - dz;
      const archiveX = index.x >> dz;
      const archiveY = index.y >> dz;

      if (!tilePyramid.isTileCovered(coverage, archiveZ, archiveX, archiveY)) return null;
      return await windTileService.getTileGrid(urlTemplate, archiveZ, archiveX, archiveY, signal, format);
    },
    renderSubLayers: (props) => {
      const quad = windTileGeometry.resolveTileQuad(props.data, props.tile);
      if (!quad) return null;

      const stride = windTileGeometry.arrowStride(props.tile.index.z, archiveMaxZoom, ARROW_STRIDE_BASE);
      const points = windTileService.gridToPoints(quad.grid, stride, anchor, {
        colMin: quad.i0,
        colMax: quad.i1,
        rowMin: quad.j0,
        rowMax: quad.j1
      });

      // Stable ids: both sub layers are only ever built from this tile's payload, so deck.gl
      // updates their attributes instead of building new layers.
      return [
        createFieldLayer(quad, `${props.id}-field`, format.scale * MS_TO_KNOTS),
        createArrowLayer(points, `${props.id}-arrows`)
      ];
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
  const archiveMaxZoom = weatherProviderModel.windPyramid?.max_zoom ?? 7;
  const tilesetKey = `${urlTemplate}|${archiveMaxZoom}`;
  if (tilesetKey === appliedTilesetKey) return;

  const tileFormat: windTileService.WindTileFormat = {
    scale: format?.scale ?? 0.05,
    sentinel: format?.sentinel ?? -20000
  };

  logger.debug('[windTileOverlayView] applying wind tiles', { urlTemplate, archiveMaxZoom });
  overlayInstance.setLayers([
    createWindTileLayer(
      urlTemplate,
      archiveMaxZoom,
      weatherProviderModel.windTileCoverage,
      tileFormat,
      getGridAnchor(cfg)
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
