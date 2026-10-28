import type { TileCoverage } from '../types';

/**
 * Helpers for the wind tile pyramid an `index.json` describes.
 *
 * Import as a namespace so call sites stay explicit, e.g. `tilePyramid.expandTileUrl(...)`.
 */

/** Absolute-URL test for templates that do not need the provider root. */
const ABSOLUTE_URL = /^(?:https?:)?\/\//i;

/**
 * Folder key of one timestamp inside the pyramid.
 *
 * The pipeline writes the tile folders with a `Z` suffix (`…/tiles/20261027_1500Z/7/16/44.bin`) while
 * `index.json` lists the timestamps without it (`20261027_1500`), so the suffix is added here. An
 * already suffixed value is passed through unchanged.
 * @param timestamp Model timestamp as listed in `available_timestamps`.
 * @returns Timestamp in the spelling of the tile folders.
 */
export function tileFolderTimestamp(timestamp: string): string {
  return timestamp.endsWith('Z') ? timestamp : `${timestamp}Z`;
}

/**
 * Builds the tile URL template of one timestamp from the pyramid metadata.
 *
 * `index.json` publishes `tiles_url` as a path relative to the provider root, e.g.
 * `runs/20261027_1500/tiles/{timestamp}/{z}/{x}/{y}.bin`. Substituting the folder key here leaves
 * a URL template whose remaining placeholders {@link expandTileUrl} fills in per tile. An already
 * absolute template is used unchanged.
 * @param root Provider root URL; trailing slashes are ignored.
 * @param template `tiles_url` of the index.
 * @param tileFolder Folder key of the wanted step, see {@link tileFolderTimestamp}.
 * @returns Absolute URL template that still contains `{z}`, `{x}` and `{y}`.
 */
export function buildTileUrlTemplate(root: string, template: string, tileFolder: string): string {
  const resolved = template.replace(/\{timestamp\}/g, tileFolder);
  if (ABSOLUTE_URL.test(resolved)) return resolved;

  const base = root.replace(/\/+$/, '');
  const path = resolved.replace(/^\/+/, '');
  return path ? `${base}/${path}` : base;
}

/**
 * Fills the tile placeholders of a URL template.
 *
 * Falls back to the fixed pyramid layout `<base>/<z>/<x>/<y>.bin` when the template carries no
 * placeholders, so a caller may pass either the index template or a plain pyramid base URL.
 * @param template Tile URL template or pyramid base URL.
 * @param z Tile zoom of the pyramid.
 * @param x Tile column.
 * @param y Tile row, 0 = north (XYZ scheme, no TMS flip).
 * @returns Absolute tile URL.
 */
export function expandTileUrl(template: string, z: number, x: number, y: number): string {
  if (!template.includes('{z}') && !template.includes('{x}') && !template.includes('{y}')) {
    return `${template}/${z}/${x}/${y}.bin`;
  }

  return template
    .replace(/\{z\}/g, String(z))
    .replace(/\{x\}/g, String(x))
    .replace(/\{y\}/g, String(y));
}

/**
 * Advisory coverage test of one pyramid tile.
 *
 * `index.json` lists the tiles the current run really stores (`coverage[z][x] = [[yMin, yMax], …]`),
 * which spares the request for a tile the pyramid would answer with 404. The answer is deliberately
 * pessimistic in only one direction: everything the metadata does not describe counts as covered,
 * so a missing or partial block can never hide data - it costs at most one request.
 * @param coverage Coverage block of the index, or null when the index has none.
 * @param z Pyramid zoom of the tile.
 * @param x Tile column.
 * @param y Tile row, 0 = north.
 * @returns `false` only when the metadata explicitly excludes this tile.
 */
export function isTileCovered(coverage: TileCoverage | null, z: number, x: number, y: number): boolean {
  if (!coverage) return true;

  const level = coverage[String(z)];
  if (!level) return true;

  const ranges = level[String(x)];
  if (!ranges || ranges.length === 0) return false;

  return ranges.some((range) => y >= range[0] && y <= range[1]);
}
