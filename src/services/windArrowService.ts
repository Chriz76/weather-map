import { logger } from '../utils/logger';
import { providers as providerConfig } from '../config';
import { weatherProviderModel } from '../models/weatherProviderModel';

/**
 * Resolves a wind tile base URL to an absolute URL without a trailing slash.
 *
 * The views pass the provider's `baseUrl`, which is already absolute, so this only matters for
 * the relative form: the caller then does not have to know how the provider base URL is laid out.
 * @param base Base URL as handed in by the caller.
 * @returns Absolute base URL without a trailing slash.
 */
function resolveBase(base: string): string {
  const trimmed = base.replace(/\/+$/, '');
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('//')) return trimmed;

  const activeId = weatherProviderModel.getActiveProviderId();
  const cfg = providerConfig[activeId] as Record<string, unknown> | undefined;
  const baseUrl = cfg && typeof cfg.baseUrl === 'string' ? cfg.baseUrl : '';

  if (!baseUrl) return trimmed;

  const joined = trimmed.startsWith('/')
    ? baseUrl.replace(/\/+$/, '') + trimmed
    : `${baseUrl.replace(/\/+$/, '')}/${trimmed}`;
  return joined.replace(/\/+$/, '');
}

/** One decoded wind grid of a wind tile: header values plus the row-major u/v pairs. */
export type WindTileGrid = {
  originLng: number;
  /** Latitude of the northern edge. */
  originLat: number;
  deltaLng: number;
  deltaLat: number;
  rows: number;
  cols: number;
  /** u/v in m/s, row-major, first row is the northern edge. */
  uv: Float32Array;
};

/** One wind grid point resolved to geographic coordinates. */
export type WindTilePoint = { position: [number, number]; angle: number; speed: number };

/** Sanity cap for corrupted headers (the byte length is validated as well). */
const MAX_GRID_POINTS = 4e6;

/** Bytes of a tile's geo header (6 x float32). */
const HEADER_BYTES = 24;
/** Bytes before the first int16 stream: geo header plus the two uint32 field lengths. */
const PAYLOAD_BYTES = HEADER_BYTES + 8;
/**
 * Scale of the int16 predictor stream: metres per second per step.
 * Must match `PRED_SCALE` of the `HrrrWindProcessor` producer that writes the archives,
 * otherwise every decoded value is off by the ratio of the two scales.
 */
const PRED_SCALE = 0.05;
/** Sentinel of the predictor stream that marks an invalid (nan) node. */
const PRED_SENTINEL = -20000;

/**
 * Decodes one row-wise int16 delta stream into the interleaved u/v grid.
 *
 * The encoder differences every row horizontally and keeps the first column of each row
 * absolute, so the accumulator restarts with that anchor value on every row. An invalid node is
 * stored as {@link PRED_SENTINEL} and survives the accumulation unchanged, because every delta
 * is relative to the stored value of its left neighbour.
 * @param stream Raw int16 deltas of one field, row-major, northern row first.
 * @param rows Number of rows.
 * @param cols Number of columns.
 * @param out Interleaved u/v output of the whole tile.
 * @param offset Component to write: 0 = u, 1 = v.
 */
function decodeDeltaField(stream: Int16Array, rows: number, cols: number, out: Float32Array, offset: number): void {
  let dst = offset;
  for (let row = 0; row < rows; row++) {
    const rowStart = row * cols;
    let acc = 0;
    for (let col = 0; col < cols; col++) {
      const delta = stream[rowStart + col]!;
      acc = col === 0 ? delta : acc + delta;
      out[dst] = acc === PRED_SENTINEL ? NaN : acc * PRED_SCALE;
      dst += 2;
    }
  }
}

/** First two bytes of a gzip stream; the pipeline stores every tile compressed. */
const GZIP_MAGIC_0 = 0x1f;
const GZIP_MAGIC_1 = 0x8b;

/**
 * Returns a tile payload as raw bytes, unpacking it when the transport did not.
 *
 * The pipeline writes each tile gzip-compressed. A server that sends `Content-Encoding: gzip`
 * makes `fetch` decode it, so the bytes arrive plain; one that does not (Cloudflare Pages serves
 * `.bin` as `application/octet-stream`) hands the gzip stream itself over. The magic bytes tell
 * the two cases apart, so a payload is never decoded twice nor left compressed to the parser.
 * @param buffer Body of the tile response as `fetch` delivered it.
 * @returns Uncompressed tile payload.
 */
async function unpackPayload(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  if (buffer.byteLength < 2) return buffer;

  const head = new Uint8Array(buffer, 0, 2);
  if (head[0] !== GZIP_MAGIC_0 || head[1] !== GZIP_MAGIC_1) return buffer;

  logger.info("[windArrowService] tile is gzip, unpacking");

  if (typeof DecompressionStream === 'undefined') {
    logger.error('[windArrowService] tile is gzip but DecompressionStream is unavailable');
    return buffer;
  }

  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).arrayBuffer();
}

/**
 * Reads and decodes one tile of a wind tile pyramid.
 *
 * One tile is one plain GET of `<tileBaseUrl>/<z>/<x>/<y>.bin` - there is no container to seek in
 * and no range request. The server compresses the response (`Content-Encoding: gzip`) and `fetch`
 * decodes it, so the bytes seen here are already the raw layout below:
 * `[24 B geo header][u_len u32][v_len u32][u int16 deltas][v int16 deltas]`.
 * The field uploads the grid as a texture and the arrows are derived from the very same grid
 * (see {@link gridToPoints}).
 *
 * A missing tile is not an error: the pyramid simply has no data there (outside the model area,
 * or on a border tile of the model grid). Resolving to null - instead of throwing - is what makes
 * deck.gl cache such a tile as empty instead of retrying it on every render.
 * @param tileBaseUrl Base URL of the pyramid of the active timestamp, without a trailing slash.
 * @param z Tile zoom of the pyramid.
 * @param x Tile column.
 * @param y Tile row, 0 = north (XYZ scheme, no TMS flip).
 * @param signal Abort signal of the tile request.
 * @returns The decoded grid, or null when the tile is missing, malformed or aborted.
 */
export async function getTileGrid(
  tileBaseUrl: string,
  z: number,
  x: number,
  y: number,
  signal?: AbortSignal
): Promise<WindTileGrid | null> {
  const url = `${resolveBase(tileBaseUrl)}/${z}/${x}/${y}.bin`;

  let buffer: ArrayBuffer;
  try {
    const response = await fetch(url, { signal: signal ?? null });
    if (signal?.aborted) return null;

    if (!response.ok) {
      // 404 is the normal answer outside the model area; any other status is worth a log line.
      if (response.status !== 404) {
        logger.warn('[windArrowService] tile request returned', { status: response.status, url });
      }
      return null;
    }

    buffer = await response.arrayBuffer();
  } catch (err: unknown) {
    if (signal?.aborted) return null;
    logger.error('[windArrowService] tile request failed', { err, z, x, y, url });
    return null;
  }

  if (signal?.aborted) return null;

  try {
    buffer = await unpackPayload(buffer);
  } catch (err: unknown) {
    logger.error('[windArrowService] tile unpack failed', { err, z, x, y, url, bytes: buffer.byteLength });
    return null;
  }

  if (buffer.byteLength < PAYLOAD_BYTES) {
    logger.warn('[windArrowService] tile too short', { z, x, y, url, bytes: buffer.byteLength });
    return null;
  }

  try {
    const header = new Float32Array(buffer, 0, 6);
    const originLng = header[0]!;
    const originLat = header[1]!;
    const deltaLng = header[2]!;
    const deltaLat = header[3]!;
    const rows = Math.round(header[4]!);
    const cols = Math.round(header[5]!);

    if (!(rows >= 1 && cols >= 1) || rows * cols > MAX_GRID_POINTS) {
      logger.warn('[windArrowService] implausible tile header', {
        z, x, y, url, originLng, originLat, deltaLng, deltaLat, rows, cols, bytes: buffer.byteLength
      });
      return null;
    }
    if (!Number.isFinite(deltaLng) || !Number.isFinite(deltaLat) || deltaLng === 0 || deltaLat === 0) return null;

    // Payload: two int16 delta streams, each preceded by its byte length.
    const nodeCount = rows * cols;
    const fieldBytes = nodeCount * 2;
    const lengths = new Uint32Array(buffer, HEADER_BYTES, 2);
    const uLength = lengths[0]!;
    const vLength = lengths[1]!;
    const need = PAYLOAD_BYTES + uLength + vLength;

    if (uLength !== fieldBytes || vLength !== fieldBytes || buffer.byteLength < need) {
      logger.error('[windArrowService] unexpected tile payload', {
        z, x, y, url, uLength, vLength, fieldBytes, have: buffer.byteLength, need, rows, cols
      });
      return null;
    }

    const uv = new Float32Array(nodeCount * 2);
    decodeDeltaField(new Int16Array(buffer, PAYLOAD_BYTES, nodeCount), rows, cols, uv, 0);
    decodeDeltaField(new Int16Array(buffer, PAYLOAD_BYTES + uLength, nodeCount), rows, cols, uv, 1);

    return { originLng, originLat, deltaLng, deltaLat, rows, cols, uv };
  } catch (err: unknown) {
    logger.error('[windArrowService] tile decode failed', { err, z, x, y, url });
    return null;
  }
}

/**
 * Lattice anchor of a pyramid: every grid node sits at `anchor + k * delta` (in degrees).
 *
 * The anchor is the south-west corner of the model area, so one anchor serves every level: the
 * nodes double per level, which makes each level's nodes a subset of the finest level's lattice.
 */
export type WindGridAnchor = { lng: number; lat: number };

/**
 * Payload index range a tile's data quad covers, in payload nodes (fractional, inclusive).
 * It is the tile bbox clamped to what the padded payload really contains.
 */
export type WindNodeWindow = { colMin: number; colMax: number; rowMin: number; rowMax: number };

/**
 * Tolerance when clipping samples to a tile window. It sits far below one node, so it can only
 * ever repeat the node exactly on a tile seam, never pick an off-lattice one - and a repeated
 * node renders identically to its neighbour's arrow.
 */
const WINDOW_EPSILON = 1e-3;

/**
 * Maps a decoded grid onto geographic wind points for the arrow overlay.
 *
 * The archives double the nodes per row with every level and pad each tile payload by one node,
 * so the payload origin is a lattice node of the model grid and `stride` whole nodes is a step
 * the archive really stores: 16 (up to map zoom 8), then 8/4/2/1 up to zoom 12. Nothing is
 * interpolated - the arrows always show a measured value.
 *
 * Samples are placed on the model lattice (not on the payload origin), which keeps the arrow
 * spacing even across tile borders, and they are clipped to the tile window so the padded border
 * node stays with the neighbour that owns it. Sample positions use the payload's own origin and
 * `delta`, so the arrows sit exactly on the nodes the field texture draws.
 * @param grid Decoded tile grid.
 * @param stride Node step on both axes as a whole number of nodes; values below 1 are clamped.
 * @param anchor Lattice anchor of the archive (south-west corner of the model area).
 * @param window Payload window of the tile's data quad.
 */
export function gridToPoints(
  grid: WindTileGrid,
  stride: number,
  anchor: WindGridAnchor,
  window: WindNodeWindow
): WindTilePoint[] {
  const { originLng, originLat, deltaLng, deltaLat, rows, cols, uv } = grid;
  const points: WindTilePoint[] = [];
  const step = Math.max(1, Math.round(stride));
  if (!Number.isFinite(step)) return points;

  // The padding makes the payload origin a lattice node: rounding its node index removes the
  // drift of the float32 header `delta` (which reaches ~1e-5 of a node at high indices), so the
  // samples land exactly on nodes instead of beside them.
  const colOrigin = Math.round((originLng - anchor.lng) / deltaLng);
  const rowOrigin = Math.round((originLat - anchor.lat) / deltaLat);

  // Sample k sits `k * step` nodes from the anchor, i.e. at payload index
  // `(k * step - colOrigin)` / `(rowOrigin - k * step)` (rows run to the south).
  const firstCol = Math.ceil((colOrigin + window.colMin - WINDOW_EPSILON) / step);
  const lastCol = Math.floor((colOrigin + window.colMax + WINDOW_EPSILON) / step);
  const firstRow = Math.ceil((rowOrigin - window.rowMax - WINDOW_EPSILON) / step);
  const lastRow = Math.floor((rowOrigin - window.rowMin + WINDOW_EPSILON) / step);

  for (let rowSample = firstRow; rowSample <= lastRow; rowSample++) {
    const gridRow = rowOrigin - rowSample * step;
    if (gridRow < 0 || gridRow > rows - 1) continue;
    const nodeRow = gridRow * cols;
    const lat = originLat - gridRow * deltaLat;

    for (let colSample = firstCol; colSample <= lastCol; colSample++) {
      const gridCol = colSample * step - colOrigin;
      if (gridCol < 0 || gridCol > cols - 1) continue;

      const idx = (nodeRow + gridCol) * 2;
      const u = uv[idx];
      const v = uv[idx + 1];
      // Masked nodes carry no wind and are left out.
      if (u === undefined || v === undefined || !Number.isFinite(u) || !Number.isFinite(v)) continue;

      const lng = originLng + gridCol * deltaLng;
      const angle = (Math.atan2(u, v) * 180) / Math.PI + 180;
      points.push({ position: [lng, lat], angle, speed: Math.sqrt(u * u + v * v) });
    }
  }

  return points;
}
