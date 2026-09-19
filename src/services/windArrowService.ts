import { PMTiles } from 'pmtiles';
import { logger } from '../utils/logger';
import { providers as providerConfig } from '../config';
import { weatherProviderModel } from '../models/weatherProviderModel';

const CACHE_BUSTER = `cb=${Date.now()}`;

type PmWithClose = PMTiles & { close?: () => void };
const pmCache = new Map<string, PmWithClose>();
const USAGE_ORDER: string[] = [];
const CACHE_LIMIT = 20;

function urlWithCacheBuster(pmUrl: string) {
  return pmUrl.includes('?') ? `${pmUrl}&${CACHE_BUSTER}` : `${pmUrl}?${CACHE_BUSTER}`;
}

function resolvePmUrl(pmUrl: string) {
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
    const view = d as ArrayBufferView;
    return new Uint8Array(view.buffer, (view as any).byteOffset ?? 0, (view as any).byteLength ?? view.buffer.byteLength).slice().buffer;
  }
  if (d && typeof d === 'object' && 'buffer' in d && d && (d as any).buffer instanceof ArrayBuffer) {
    const v = d as { buffer: ArrayBuffer; byteOffset?: number; byteLength?: number };
    const byteOffset = typeof v.byteOffset === 'number' ? v.byteOffset : 0;
    const byteLength = typeof v.byteLength === 'number' ? v.byteLength : v.buffer.byteLength - byteOffset;
    return new Uint8Array(v.buffer, byteOffset, byteLength).slice().buffer;
  }
  return null;
}

export async function getTilePoints(pmUrl: string, z: number, x: number, y: number) {
  try {
    const pm = getPm(pmUrl);
    const tileRes = await pm.getZxy(z, x, y);
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
    logger.error('[windArrowService] getTilePoints error', err);
    return [];
  }
}

export function disposePmtiles(pmUrl: string) {
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

export function clearPmCache() {
  pmCache.forEach((p) => {
    if (p && typeof p.close === 'function') {
      try { p.close(); } catch (e) { /* ignore */ }
    }
  });
  pmCache.clear();
  USAGE_ORDER.length = 0;
}

// Compatibility wrapper for existing callers that import `windArrowService`.
// Provides a minimal `loadWindArrowsForBounds` implementation that currently
// returns an empty array. Implement a real tile-scanning approach here if
// needed later.
export const windArrowService = {
  async loadWindArrowsForBounds(_bounds: { west: number; east: number; south: number; north: number }, _zoom: number) {
    logger.info('[windArrowService] loadWindArrowsForBounds called (fallback)');
    return [] as Array<{ position: [number, number]; angle: number; speed: number }>;
  }
};
