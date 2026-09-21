import { PMTiles } from 'pmtiles';
import { logger } from '../utils/logger';
import { providers as providerConfig } from '../config';
import { weatherProviderModel } from '../models/weatherProviderModel';

const CACHE_BUSTER = `cb=${Date.now()}`;

type PmWithClose = PMTiles & { close?: () => void };
type BufferLike = { buffer: ArrayBuffer; byteOffset?: number; byteLength?: number };
const pmCache = new Map<string, PmWithClose>();
const USAGE_ORDER: string[] = [];
const CACHE_LIMIT = 20;

function urlWithCacheBuster(pmUrl: string): string {
  return pmUrl.includes('?') ? `${pmUrl}&${CACHE_BUSTER}` : `${pmUrl}?${CACHE_BUSTER}`;
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
    const view = d as unknown as BufferLike;
    const byteOffset = typeof view.byteOffset === 'number' ? view.byteOffset : 0;
    const byteLength = typeof view.byteLength === 'number' ? view.byteLength : view.buffer.byteLength - byteOffset;
    return new Uint8Array(view.buffer, byteOffset, byteLength).slice().buffer;
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

export async function getTilePoints(
  pmUrl: string,
  z: number,
  x: number,
  y: number,
  signal?: AbortSignal
): Promise<Array<{ position: [number, number]; angle: number; speed: number }> | null> {
  const resolved = resolvePmUrl(pmUrl);
  const key = urlWithCacheBuster(resolved);

  const maxAttempts = 2; // initial try + 1 retry
  const backoffMs = 300;

  const isNetworkError = (e: unknown) => {
    if (!e) return false;
    const anyE = e as any;
    if (anyE instanceof TypeError) return true;
    const msg = typeof anyE.message === 'string' ? anyE.message : '';
    return /failed to fetch|networkerror|network error|timeout/i.test(msg);
  };

  const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) return null;
    let pm: PmWithClose | undefined;
    try {
      pm = getPm(pmUrl);
      const tileRes = await pm.getZxy(z, x, y);
      if (signal?.aborted) return null;
      if (!tileRes || tileRes.data == null) return [];

      const buffer = toArrayBufferFromTileData(tileRes.data);
      if (!buffer) return [];

      if (buffer.byteLength < 24) return [];

      const header = new Float32Array(buffer, 0, 6);
      const originLng = header[0]!;
      const originLat = header[1]!;
      const deltaLng = header[2]!;
      const deltaLat = header[3]!;
      const rows = Math.round(header[4]!);
      const cols = Math.round(header[5]!);

      const uv = new Float32Array(buffer, 24);
      const points: { position: [number, number]; angle: number; speed: number }[] = [];

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const idx = (r * cols + c) * 2;
          const u = uv[idx]!;
          const v = uv[idx + 1]!;
          if (!Number.isFinite(u) || !Number.isFinite(v)) continue;

          const lng = originLng + c * deltaLng;
          const lat = originLat - r * deltaLat;
          const angle = (Math.atan2(u, v) * 180) / Math.PI + 180;
          const speed = Math.sqrt(u * u + v * v);

          points.push({ position: [lng, lat], angle, speed });
        }
      }

      return points;
    } catch (err: unknown) {
      logger.error('[windArrowService] getTilePoints error', { err, attempt, z, x, y, url: resolved });

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

      // For non-network errors or exhausted retries, return empty array so layer can continue
      return [];
    }
  }

  return [];
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