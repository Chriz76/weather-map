import { PMTiles } from 'pmtiles';
import { decodeWindArrowPointsFromImageData } from '../utils/tile';
import type { ArrowsConfig, WindArrowPoint } from '../utils/tile';

const tileCache = new Map<string, ImageData>();
let pmtilesInstance: PMTiles | null = null;
let currentPmtilesUrl: string | null = null;
let sharedCanvas: HTMLCanvasElement | null = null;
let sharedCtx: CanvasRenderingContext2D | null = null;
let loadToken = 0;

async function _loadTileImageData(x: number, y: number, z: number): Promise<ImageData | null> {
  const cacheKey = `${z}/${x}/${y}`;
  if (tileCache.has(cacheKey)) return tileCache.get(cacheKey)!;

  const pm = pmtilesInstance;
  if (!pm) return null;

  try {
    const resp = await pm.getZxy(z, x, y);
    if (!resp || !resp.data) return null;

    const blob = new Blob([resp.data], { type: 'image/webp' });
    const bitmap = await createImageBitmap(blob);

    if (!sharedCanvas) {
      sharedCanvas = document.createElement('canvas');
      sharedCtx = sharedCanvas.getContext('2d', { willReadFrequently: true });
    }

    sharedCanvas.width = bitmap.width;
    sharedCanvas.height = bitmap.height;

    if (!sharedCtx) {
      bitmap.close();
      return null;
    }

    sharedCtx.drawImage(bitmap, 0, 0);
    const imageData = sharedCtx.getImageData(0, 0, bitmap.width, bitmap.height);
    bitmap.close();

    tileCache.set(cacheKey, imageData);
    return imageData;
  } catch (e) {
    console.error('[windArrowService] Fehler beim Laden der Kachel:', e);
    return null;
  }
}
// decoder is imported from utils/tile

export const windArrowService = {
  setPmtilesUrl(url?: string): void {
    if (!url) return;
    if (url === currentPmtilesUrl) return;

    try {
      if (pmtilesInstance && (pmtilesInstance as any).close) {
        try { (pmtilesInstance as any).close(); } catch {}
      }
    } catch {}

    tileCache.clear();
    pmtilesInstance = new PMTiles(url);
    currentPmtilesUrl = url;
    loadToken++; // invalidate in-flight ops
  },

  clear(): void {
    try {
      if (pmtilesInstance && (pmtilesInstance as any).close) {
        try { (pmtilesInstance as any).close(); } catch {}
      }
    } catch {}
    pmtilesInstance = null;
    currentPmtilesUrl = null;
    tileCache.clear();
    loadToken++;
  },

  destroy(): void {
    this.clear();
    sharedCanvas = null;
    sharedCtx = null;
  },

  async loadTileImageData(x: number, y: number, z: number): Promise<ImageData | null> {
    return await _loadTileImageData(x, y, z);
  },

  async decodeTilesToPoints(
    indices: { x: number; y: number; z: number }[],
    step: number,
    cfg: ArrowsConfig
  ): Promise<WindArrowPoint[]> {
    if (!pmtilesInstance) return [];
    const myToken = ++loadToken;

    const promises = indices.map(async (idx) => {
      const imageData = await _loadTileImageData(idx.x, idx.y, idx.z);
      if (!imageData) return [];
      return decodeWindArrowPointsFromImageData(imageData, idx, step, cfg);
    });

    const results = await Promise.all(promises);

    if (myToken !== loadToken) return [];

    return results.flat();
  },

  isReady(): boolean {
    return pmtilesInstance !== null;
  },

  getCurrentPmtilesUrl(): string | null {
    return currentPmtilesUrl;
  }
};

export default windArrowService;
