import { PMTiles } from 'pmtiles';
import { logger } from '../utils/logger';

const CACHE_BUSTER = `cb=${Date.now()}`;

const pmCache = new Map<string, PMTiles>();
const USAGE_ORDER: string[] = [];
const CACHE_LIMIT = 20;

function urlWithCacheBuster(pmUrl: string) {
  return pmUrl.includes('?') ? `${pmUrl}&${CACHE_BUSTER}` : `${pmUrl}?${CACHE_BUSTER}`;
}

function getPm(pmUrl: string) {
  const key = urlWithCacheBuster(pmUrl);
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
    if (p && typeof (p as any).close === 'function') {
      try { (p as any).close(); } catch (e) { /* ignore */ }
    }
    pmCache.delete(oldest);
  }

  return pm;
}

export async function getTilePoints(pmUrl: string, z: number, x: number, y: number) {
  try {
    const pm = getPm(pmUrl);
    const tileRes = await pm.getZxy(z, x, y);
    if (!tileRes || !tileRes.data) return [];

    let buffer: ArrayBuffer;
    const d = tileRes.data as any;
    if (d instanceof ArrayBuffer) buffer = d;
    else if (ArrayBuffer.isView(d)) buffer = new Uint8Array(d.buffer, d.byteOffset, d.byteLength).slice().buffer;
    else buffer = d as ArrayBuffer;

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
  } catch (err) {
    logger.error('[windArrowService] getTilePoints error', err as any);
    return [];
  }
}

export function disposePmtiles(pmUrl: string) {
  const key = urlWithCacheBuster(pmUrl);
  const pm = pmCache.get(key);
  if (pm) {
    if (typeof (pm as any).close === 'function') {
      try { (pm as any).close(); } catch (e) { /* ignore */ }
    }
    pmCache.delete(key);
    const i = USAGE_ORDER.indexOf(key);
    if (i >= 0) USAGE_ORDER.splice(i, 1);
  }
}

export function clearPmCache() {
  pmCache.forEach((p) => {
    if (typeof (p as any).close === 'function') {
      try { (p as any).close(); } catch (e) { /* ignore */ }
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
