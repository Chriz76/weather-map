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
 * Loading, retrying and caching are shared with {@link getTilePoints}: both use the same
 * cached PMTiles instance, so requesting the same tile twice hits the PMTiles tile cache.
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
 * Decodes one tile of a wind archive into individual wind points (arrow overlay).
 * @param pmUrl Archive URL as used by the views.
 * @param z Tile zoom of the archive.
 * @param x Tile column.
 * @param y Tile row.
 * @param signal Abort signal of the tile request.
 * @returns Points, an empty array when the tile carries no data, or null when the request was
 * aborted (returning null keeps deck.gl from caching an empty tile).
 */
export async function getTilePoints(
  pmUrl: string,
  z: number,
  x: number,
  y: number,
  signal?: AbortSignal
): Promise<WindTilePoint[] | null> {
  const grid = await getTileGrid(pmUrl, z, x, y, signal);

  if (signal?.aborted) return null;
  if (!grid) return [];

  return gridToPoints(grid);
}

/** Maps a decoded grid onto geographic wind points (one point per grid node). */
function gridToPoints(grid: WindTileGrid): WindTilePoint[] {
  const { originLng, originLat, deltaLng, deltaLat, rows, cols, uv } = grid;
  const points: WindTilePoint[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = (r * cols + c) * 2;
      const u = uv[idx];
      const v = uv[idx + 1];
      if (u === undefined || v === undefined || !Number.isFinite(u) || !Number.isFinite(v)) continue;

      const lng = originLng + c * deltaLng;
      const lat = originLat - r * deltaLat;
      const angle = (Math.atan2(u, v) * 180) / Math.PI + 180;
      const speed = Math.sqrt(u * u + v * v);

      points.push({ position: [lng, lat], angle, speed });
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