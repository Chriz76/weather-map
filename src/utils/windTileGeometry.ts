import type { WindTileGrid } from '../services/windTileService';

/**
 * Tile geometry of the wind tile overlay.
 *
 * Import as a namespace so call sites stay explicit, e.g. `windTileGeometry.resolveTileQuad(...)`.
 * Kept free of deck.gl so the maths can be tested without a GPU.
 */

/** XYZ index of a tileset tile. */
export type TileIndex = { x: number; y: number; z: number };

/** Geographic box of a tile in degrees. */
export type GeoBox = { west: number; south: number; east: number; north: number };

/** Decoded payload of a tile and the window of it the tile's quad covers. */
export type TileQuad = {
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
 * Node step of the arrows for one tile zoom.
 *
 * Up to the archive's finest level the payload is the real level and the pixel spacing is
 * constant, so `strideBase` applies unchanged. The tileset keeps subdividing above it while the
 * loader reads the finest level; halving the step per level compensates that.
 * @param tileZoom Zoom of the tileset tile.
 * @param archiveMaxZoom Finest level the pyramid stores.
 * @param strideBase Node step on the finest level.
 */
export function arrowStride(tileZoom: number, archiveMaxZoom: number, strideBase: number): number {
  const finer = Math.max(0, tileZoom - archiveMaxZoom);
  return Math.max(1, strideBase / Math.pow(2, finer));
}

/**
 * Web-Mercator bounds of an XYZ tile index (the scheme deck.gl's Tileset2D uses).
 * @param index Tile index.
 */
export function tileBBoxFromIndex({ x, y, z }: TileIndex): GeoBox {
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

/**
 * Narrows `props.tile.bbox` to the WGS84 form.
 *
 * deck.gl hands either that one or a `left/top/right/bottom` box, depending on the indexing scheme
 * of the tileset, so the bbox has to be told apart instead of assumed.
 * @param bbox Value of `props.tile.bbox`.
 */
function isGeoBox(bbox: unknown): bbox is GeoBox {
  return typeof bbox === 'object' && bbox !== null && 'west' in bbox;
}

/**
 * Resolves the part of a tile's payload that its quad covers.
 *
 * The requested tile defines the quad; the payload origin/delta define which part of the grid it
 * covers. Both are clamped to what the payload really contains, so the padded border node is drawn
 * by exactly one tile and the arrows are not doubled at the seams.
 * @param grid Decoded grid of the tile, or null when the archive has no data there.
 * @param tile Tile the sub layers are being built for.
 * @returns Window, extent and grid, or null when there is nothing to draw for this tile.
 */
export function resolveTileQuad(
  grid: WindTileGrid | null,
  tile: { index: TileIndex; bbox?: unknown }
): TileQuad | null {
  if (!grid) return null; // tile does not exist in the archive

  const box: GeoBox = isGeoBox(tile.bbox) ? tile.bbox : tileBBoxFromIndex(tile.index);

  const i0 = clamp((box.west - grid.originLng) / grid.deltaLng, 0, grid.cols - 1);
  const i1 = clamp((box.east - grid.originLng) / grid.deltaLng, 0, grid.cols - 1);
  const j0 = clamp((grid.originLat - box.north) / grid.deltaLat, 0, grid.rows - 1);
  const j1 = clamp((grid.originLat - box.south) / grid.deltaLat, 0, grid.rows - 1);
  if (i1 <= i0 || j1 <= j0) return null; // no data here

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
