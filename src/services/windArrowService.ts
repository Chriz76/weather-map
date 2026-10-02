import { PMTiles } from 'pmtiles';
import { logger } from '../utils/logger';
import { providers as providerConfig } from '../config';
import { weatherProviderModel } from '../models/weatherProviderModel';

const CACHE_BUSTER = `cb=${Date.now()}`;

function getGeneratedTag(): string {
  try {
    const gen = weatherProviderModel.modelGeneratedAt;
    return encodeURIComponent(gen ?? String(Date.now()));
  } catch (e) {
    return String(Date.now());
  }
}

type PmWithClose = PMTiles & { close?: () => void };
type BufferLike = { buffer: ArrayBuffer; byteOffset?: number; byteLength?: number };
const pmCache = new Map<string, PmWithClose>();
const USAGE_ORDER: string[] = [];
const CACHE_LIMIT = 20;

function urlWithCacheBuster(pmUrl: string): string {
  const g = `g=${getGeneratedTag()}`;
  const cb = `${CACHE_BUSTER}`;
  if (pmUrl.includes('?')) return `${pmUrl}&${g}&${cb}`;
  return `${pmUrl}?${g}&${cb}`;
}

function resolvePmUrl(pmUrl: string): string {
  // If already absolute, return as-is
  if (/^https?:\/\//i.test(pmUrl) || pmUrl.startsWith('//')) return pmUrl;

  const activeId = weatherProviderModel.getActiveProviderId();
  const cfg = providerConfig[activeId] as Record<string, unknown> | undefined;
  const baseUrl = cfg && typeof cfg.baseUrl === 'string' ? cfg.baseUrl : '';

  if (!baseUrl) return pmUrl;

  // Join baseUrl and pmUrl without duplicating slashes
  if (pmUrl.startsWith('/')) {
    return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) + pmUrl : baseUrl + pmUrl;
  }
  return baseUrl.endsWith('/') ? baseUrl + pmUrl : baseUrl + '/' + pmUrl;
}

function getPm(pmUrl: string) {
  const resolvedUrl = resolvePmUrl(pmUrl);
  const key = urlWithCacheBuster(resolvedUrl);
  let pm = pmCache.get(key);
  if (!pm) {
    pm = new PMTiles(key);
    pmCache.set(key, pm);
  }

  const idx = USAGE_ORDER.indexOf(key);
  if (idx >= 0) USAGE_ORDER.splice(idx, 1);
  USAGE_ORDER.push(key);

  while (USAGE_ORDER.length > CACHE_LIMIT) {
    const oldest = USAGE_ORDER.shift()!;
    const p = pmCache.get(oldest);
    if (p && typeof p.close === 'function') {
      try { p.close(); } catch (e) { /* ignore */ }
    }
    pmCache.delete(oldest);
  }

  return pm;
}

function toArrayBufferFromTileData(d: unknown): ArrayBuffer | null {
  if (d instanceof ArrayBuffer) return d;

  if (ArrayBuffer.isView(d)) {
    // `ArrayBuffer.isView` narrows `d` to `ArrayBufferView`, which already exposes
    // buffer/byteOffset/byteLength. Only the SharedArrayBuffer case needs a narrow cast.
    return new Uint8Array(d.buffer as ArrayBuffer, d.byteOffset, d.byteLength).slice().buffer;
  }

  if (d && typeof d === 'object') {
    const obj = d as Record<string, unknown>;
    if (obj.buffer instanceof ArrayBuffer) {
      const v = obj as BufferLike;
      const byteOffset = typeof v.byteOffset === 'number' ? v.byteOffset : 0;
      const byteLength = typeof v.byteLength === 'number' ? v.byteLength : v.buffer.byteLength - byteOffset;
      return new Uint8Array(v.buffer, byteOffset, byteLength).slice().buffer;
    }
  }

  return null;
}

/** One decoded wind grid of a PMTiles tile: header values plus the row-major u/v pairs. */
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

/**
 * Reads and decodes one tile of a wind archive (24 byte header plus u/v pairs).
 * This is the only tile read of the wind overlay: the field uploads the grid as a texture and
 * the arrows are derived from the very same grid (see {@link gridToPoints}).
 * @param pmUrl Archive URL as used by the views (absolute or relative to the provider base).
 * @param z Tile zoom of the archive.
 * @param x Tile column.
 * @param y Tile row.
 * @param signal Abort signal of the tile request.
 * @returns The decoded grid, or null when the tile is missing, malformed or aborted.
 */
export async function getTileGrid(
  pmUrl: string,
  z: number,
  x: number,
  y: number,
  signal?: AbortSignal
): Promise<WindTileGrid | null> {
  const resolved = resolvePmUrl(pmUrl);
  const key = urlWithCacheBuster(resolved);

  const maxAttempts = 2; // initial try + 1 retry
  const backoffMs = 300;

  const isNetworkError = (e: unknown): boolean => {
    if (!e) return false;
    if (e instanceof TypeError) return true;
    if (e instanceof Error && typeof e.message === 'string') {
      return /failed to fetch|networkerror|network error|timeout/i.test(e.message);
    }
    return false;
  };

  const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) return null;
    let pm: PmWithClose | undefined;
    try {
      pm = getPm(pmUrl);
      const tileRes = await pm.getZxy(z, x, y);
      if (signal?.aborted) return null;
      if (!tileRes || tileRes.data == null) return null;

      const buffer = toArrayBufferFromTileData(tileRes.data);
      if (!buffer || buffer.byteLength < 24) return null;

      const header = new Float32Array(buffer, 0, 6);
      const originLng = header[0]!;
      const originLat = header[1]!;
      const deltaLng = header[2]!;
      const deltaLat = header[3]!;
      const rows = Math.round(header[4]!);
      const cols = Math.round(header[5]!);

      if (!(rows >= 1 && cols >= 1) || rows * cols > MAX_GRID_POINTS) return null;
      if (!Number.isFinite(deltaLng) || !Number.isFinite(deltaLat) || deltaLng === 0 || deltaLat === 0) return null;

      // Exact length check: also catches payloads the PMTiles library did not unpack.
      const need = 24 + rows * cols * 8;
      if (buffer.byteLength < need) {
        logger.error('[windArrowService] tile payload too short', {
          z, x, y, url: resolved, have: buffer.byteLength, need, rows, cols
        });
        return null;
      }

      return {
        originLng,
        originLat,
        deltaLng,
        deltaLat,
        rows,
        cols,
        uv: new Float32Array(buffer, 24, rows * cols * 2)
      };
    } catch (err: unknown) {
      logger.error('[windArrowService] getTileGrid error', { err, attempt, z, x, y, url: resolved });

      // If aborted, stop and return null so TileLayer won't cache
      if (signal?.aborted) return null;

      // On network-like errors, attempt retry after closing and removing cached pm
      if (isNetworkError(err)) {
        try {
          if (pm && typeof pm.close === 'function') pm.close();
        } catch (e) { /* ignore close errors */ }
        pmCache.delete(key);
        const idx = USAGE_ORDER.indexOf(key);
        if (idx >= 0) USAGE_ORDER.splice(idx, 1);

        if (attempt < maxAttempts) {
          // small backoff before retry
          await sleep(backoffMs);
          continue;
        }
      }

      // For non-network errors or exhausted retries, return null so the layer can continue
      return null;
    }
  }

  return null;
}

/**
 * Lattice anchor of an archive: every grid node sits at `anchor + k * delta` (in degrees).
 * Both archives anchor on the south-west corner of the model area (`imageBounds[0]`), so one
 * anchor serves every level: level `z` stores the nodes at `delta * 2^(8 - z)` and its nodes are
 * therefore a subset of the finest level's lattice.
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

export function disposePmtiles(pmUrl: string): void {
  const key = urlWithCacheBuster(pmUrl);
  const pm = pmCache.get(key);
  if (pm) {
    if (typeof pm.close === 'function') {
      try { pm.close(); } catch (e) { /* ignore */ }
    }
    pmCache.delete(key);
    const i = USAGE_ORDER.indexOf(key);
    if (i >= 0) USAGE_ORDER.splice(i, 1);
  }
}

export function clearPmCache(): void {
  pmCache.forEach((p) => {
    if (p && typeof p.close === 'function') {
      try { p.close(); } catch (e) { /* ignore */ }
    }
  });
  pmCache.clear();
  USAGE_ORDER.length = 0;
}