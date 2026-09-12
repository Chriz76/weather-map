import { PMTiles } from 'pmtiles';
import { decodeWindArrowPointsFromImageData, getDensityConfigFromZoom, getVisibleTileIndicesFromBounds, type ArrowsConfig } from '../utils/tile';
import type { WindArrowPoint } from '../utils/tile';
import { weatherProviderModel } from '../models/weatherProviderModel';
import { providers } from '../config';

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

  async loadWindArrowsForBounds(bounds: { west: number; east: number; south: number; north: number }, zoom: number): Promise<WindArrowPoint[]> {
    const providerCfg = providers[weatherProviderModel.getActiveProviderId()] as any;
    const arrows = providerCfg?.arrows ?? null;
    if (!arrows) return [];

    const cfg: ArrowsConfig = {
      lonMin: typeof arrows.lonMin === 'number' ? arrows.lonMin : (typeof arrows.LON_MIN === 'number' ? arrows.LON_MIN : -12.0),
      latMax: typeof arrows.latMax === 'number' ? arrows.latMax : (typeof arrows.LAT_MAX === 'number' ? arrows.LAT_MAX : 55.4),
      totalLonSpan: typeof arrows.totalLonSpan === 'number' ? arrows.totalLonSpan : (typeof arrows.TOTAL_LON_SPAN === 'number' ? arrows.TOTAL_LON_SPAN : 1136 * 0.025),
      totalLatSpan: typeof arrows.totalLatSpan === 'number' ? arrows.totalLatSpan : (typeof arrows.TOTAL_LAT_SPAN === 'number' ? arrows.TOTAL_LAT_SPAN : 720 * 0.025),
      baseLeafletZoom: typeof arrows.baseLeafletZoom === 'number' ? arrows.baseLeafletZoom : (typeof arrows.BASE_LEAFLET_ZOOM === 'number' ? arrows.BASE_LEAFLET_ZOOM : 8),
      maxPmtilesZ: typeof arrows.maxPmtilesZ === 'number' ? arrows.maxPmtilesZ : (typeof arrows.MAX_PMTILES_Z === 'number' ? arrows.MAX_PMTILES_Z : 4)
    };

    const { pmZ, step } = getDensityConfigFromZoom(Math.floor(zoom), cfg);
    if (step === 0) return [];

    const visibleIndices = getVisibleTileIndicesFromBounds(bounds, pmZ, cfg);
    if (visibleIndices.length === 0) return [];

    return await this.decodeTilesToPoints(visibleIndices, step, cfg);
  },

  isReady(): boolean {
    return pmtilesInstance !== null;
  },

  getCurrentPmtilesUrl(): string | null {
    return currentPmtilesUrl;
  }
};

export default windArrowService;
