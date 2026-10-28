import { logger } from '../utils/logger';
import * as tilePyramid from '../utils/tilePyramid';

/**
 * Decoder for the wind tile pyramid published under `index.json`'s `tiles_url`.
 *
 * Import as a namespace so call sites stay explicit, e.g. `windTileService.getTileGrid(...)`.
 * This module is provider-agnostic: URL, zoom and payload scale all come from the caller, which
 * reads them from the index.
 */

/** One decoded wind grid of a tile: geo header plus the row-major u/v pairs. */
export type WindTileGrid = {
  /** Longitude of the payload's western edge node. */
  originLng: number;
  /** Latitude of the payload's northern edge node. */
  originLat: number;
  deltaLng: number;
  /** Negative: rows run north to south. */
  deltaLat: number;
  rows: number;
  cols: number;
  /** u/v in m/s, row-major, first row is the northern edge, `NaN` marks a masked node. */
  uv: Float32Array;
};

/**
 * Payload encoding of the pyramid, mirroring the index's `format` block.
 *
 * The producer differences every row and stores int16 steps scaled by {@link scale}; a node that
 * carries no data is written as {@link sentinel}. Both are part of the pipeline contract, so a
 * client that guesses them decodes garbage instead of failing.
 */
export type WindTileFormat = {
  /** Metres per second per int16 step. */
  scale: number;
  /** Raw accumulator value that marks an invalid node. */
  sentinel: number;
};

/**
 * Default encoding of the HRRR pipeline (`format` of `index.json`).
 *
 * Used when a caller has no index metadata at hand; the provider should pass the values it read
 * from `index.json` instead.
 */
const DEFAULT_TILE_FORMAT: WindTileFormat = { scale: 0.05, sentinel: -20000 };

/** Bytes of the geo header (6 x float32: origin lng/lat, delta lng/lat, rows, cols). */
const GEO_HEADER_BYTES = 24;
/** Bytes of the two field lengths (`uLength`, `vLength` as uint32) that follow the header. */
const FIELD_LENGTH_BYTES = 8;
/** Bytes before the first int16 stream. */
const PAYLOAD_BYTES = GEO_HEADER_BYTES + FIELD_LENGTH_BYTES;

/** Sanity cap for a corrupted header; the byte length is validated separately. */
const MAX_TILE_NODES = 4_000_000;

/**
 * Decodes one row-wise int16 delta stream into the interleaved u/v grid.
 *
 * The encoder differences every row horizontally and keeps the first column of each row absolute,
 * so the accumulator restarts with that anchor value on every row. A masked node is stored as
 * `format.sentinel` and survives the accumulation unchanged, because every delta is relative to
 * the stored value of its left neighbour - hence the sentinel has to be compared after
 * accumulating, not per raw delta.
 * @param stream Raw int16 deltas of one field, row-major, northern row first.
 * @param rows Number of rows.
 * @param cols Number of columns.
 * @param out Interleaved u/v output of the whole tile.
 * @param offset Component to write: 0 = u, 1 = v.
 * @param format Payload encoding of the pyramid.
 */
function decodeDeltaField(
  stream: Int16Array,
  rows: number,
  cols: number,
  out: Float32Array,
  offset: number,
  format: WindTileFormat
): void {
  let dst = offset;
  for (let row = 0; row < rows; row++) {
    const rowStart = row * cols;
    let acc = 0;
    for (let col = 0; col < cols; col++) {
      const delta = stream[rowStart + col]!;
      acc = col === 0 ? delta : acc + delta;
      out[dst] = acc === format.sentinel ? NaN : acc * format.scale;
      dst += 2;
    }
  }
}

/**
 * Reads and decodes one tile of a wind tile pyramid.
 *
 * A tile is a plain GET of the URL the template resolves to - no container, no range request. The
 * payload is `[24 B geo header][uLength u32][vLength u32][u int16 deltas][v int16 deltas]`, all
 * little-endian, and is served uncompressed (the transport may gzip it, in which case `fetch`
 * already decoded it). Integers are read through typed arrays, which is valid on every platform
 * the app runs on.
 *
 * A missing tile is not an error: outside the model area the pyramid has no data there. Resolving
 * to `null` - instead of throwing - is what lets deck.gl cache such a tile as empty instead of
 * retrying it on every render.
 * @param tileUrlTemplate Tile URL template with `{z}`/`{x}`/`{y}` placeholders, absolute.
 * @param z Tile zoom of the pyramid.
 * @param x Tile column.
 * @param y Tile row, 0 = north (XYZ scheme, no TMS flip).
 * @param signal Abort signal of the tile request.
 * @param format Payload encoding; defaults to the HRRR pipeline's.
 * @returns The decoded grid, or null when the tile is missing, malformed or aborted.
 */
export async function getTileGrid(
  tileUrlTemplate: string,
  z: number,
  x: number,
  y: number,
  signal?: AbortSignal,
  format: WindTileFormat = DEFAULT_TILE_FORMAT
): Promise<WindTileGrid | null> {
  const url = tilePyramid.expandTileUrl(tileUrlTemplate, z, x, y);

  let buffer: ArrayBuffer;
  try {
    // No cache option and no cache buster on purpose: every run publishes under its own URL
    // (`runs/<run>/tiles/<timestamp>Z/...`), so a tile is immutable and the browser cache may
    // answer it without a revalidation.
    const response = await fetch(url, { signal: signal ?? null });
    if (signal?.aborted) return null;

    if (!response.ok) {
      // 404 is the normal answer outside the model area; any other status is worth a log line.
      if (response.status !== 404) {
        logger.warn('[windTileService] tile request returned a non-OK status', { status: response.status, url });
      }
      return null;
    }

    buffer = await response.arrayBuffer();
  } catch (err: unknown) {
    if (signal?.aborted) return null;
    logger.error('[windTileService] tile request failed', { err, z, x, y, url });
    return null;
  }

  if (signal?.aborted) return null;

  if (buffer.byteLength < PAYLOAD_BYTES) {
    logger.warn('[windTileService] tile payload too short', { z, x, y, url, bytes: buffer.byteLength, need: PAYLOAD_BYTES });
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

    if (!(rows >= 1 && cols >= 1) || rows * cols > MAX_TILE_NODES) {
      logger.warn('[windTileService] implausible tile header', {
        z, x, y, url, originLng, originLat, deltaLng, deltaLat, rows, cols, bytes: buffer.byteLength
      });
      return null;
    }
    if (!Number.isFinite(deltaLng) || !Number.isFinite(deltaLat) || deltaLng === 0 || deltaLat === 0) return null;

    const nodeCount = rows * cols;
    const fieldBytes = nodeCount * 2;
    const lengths = new Uint32Array(buffer, GEO_HEADER_BYTES, 2);
    const uLength = lengths[0]!;
    const vLength = lengths[1]!;
    const needed = PAYLOAD_BYTES + uLength + vLength;

    // Both streams must cover exactly this grid; anything else is a different payload layout.
    if (uLength !== fieldBytes || vLength !== fieldBytes || buffer.byteLength < needed) {
      logger.error('[windTileService] unexpected tile payload', {
        z, x, y, url, uLength, vLength, fieldBytes, bytes: buffer.byteLength, needed, rows, cols
      });
      return null;
    }

    const uv = new Float32Array(nodeCount * 2);
    decodeDeltaField(new Int16Array(buffer, PAYLOAD_BYTES, nodeCount), rows, cols, uv, 0, format);
    decodeDeltaField(new Int16Array(buffer, PAYLOAD_BYTES + uLength, nodeCount), rows, cols, uv, 1, format);

    return { originLng, originLat, deltaLng, deltaLat, rows, cols, uv };
  } catch (err: unknown) {
    logger.error('[windTileService] tile decode failed', { err, z, x, y, url });
    return null;
  }
}
