import { IconLayer } from '@deck.gl/layers';
import type { Map as LeafletMap } from 'leaflet';
import { LeafletDeckOverlay } from '../utils/leafletDeckOverlay';
import { COORDINATE_SYSTEM } from '@deck.gl/core';
import { logger } from '../utils/logger';
import { PMTiles } from 'pmtiles';

const WIND_ARROW_PANE_Z_INDEX = '510';
const WIND_ARROW_CLASS = 'wind-arrow-deck-overlay';

const PMTILES_WIND_URL = '/20260828_1200Z_arome_dir.pmtiles';

// Exakte AROME Bounding Box (EPSG:4326) – gepaddet auf Block-Vielfache
// Korrigierte Bounds basierend auf 1136 x 720 Pixeln à 0.025 Grad
const LON_MIN = -12.0;
const LAT_MAX = 55.4;

// 1136 Pixel * 0.025° = 28.4° Spanne (statt 28.175°)
const TOTAL_LON_SPAN = 1136 * 0.025; // 28.4

// 720 Pixel * 0.025° = 18.0° Spanne
const TOTAL_LAT_SPAN = 720 * 0.025; // 18.0


// Parametrierung des AROME-Rasters
const LOD0_DEGREES = 0.4;        // Nativer Punktabstand auf pmZ = 0 (1 Pixel = 0.4°)
const BASE_LEAFLET_ZOOM = 8;     // Ab diesem Leaflet-Zoom ist pmZ = 0 bei step = 1 ideal
const MAX_PMTILES_Z = 4;         // Höchstes verfügbares LOD im PMTiles-Archiv

export interface WindArrowPoint {
  position: [number, number]; // [lon, lat]
  angle: number;              // Grad (0..360°)
}

// Erweitertes SVG mit feinem Drop-Shadow-Filter für hohe Kontraste auf hellem/dunklem Grund
const WIND_ARROW_ICON_URL =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72">
      <defs>
        <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="1" stdDeviation="2.5" flood-color="#000000" flood-opacity="0.65"/>
        </filter>
      </defs>
      <path d="M36 8 L48 28 H40 V56 H32 V28 H24 Z" fill="white" filter="url(#shadow)"/>
    </svg>
  `);

let overlayInstance: LeafletDeckOverlay | null = null;
let pmtilesInstance: PMTiles | null = null;
let loadToken = 0;
let cachedPoints: WindArrowPoint[] | null = null;

const tileCache = new Map<string, ImageData>();
let updateTimeoutId: ReturnType<setTimeout> | null = null;

// Wiederverwendbare Canvas-Instanz für speichereffizientes Dekodieren
let sharedCanvas: HTMLCanvasElement | null = null;
let sharedCtx: CanvasRenderingContext2D | null = null;

function getTileBounds(x: number, y: number, z: number) {
  const numTiles = 1 << z;
  const tileWidthLon = TOTAL_LON_SPAN / numTiles;
  const tileHeightLat = TOTAL_LAT_SPAN / numTiles;

  const west = LON_MIN + x * tileWidthLon;
  const east = LON_MIN + (x + 1) * tileWidthLon;
  const north = LAT_MAX - y * tileHeightLat;
  const south = LAT_MAX - (y + 1) * tileHeightLat;

  return { west, south, east, north };
}

function getDensityConfig(map: LeafletMap) {
  const z = Math.floor(map.getZoom());

  const rawLOD = z - BASE_LEAFLET_ZOOM;
  const pmZ = Math.min(MAX_PMTILES_Z, Math.max(0, rawLOD));
  const step = z < BASE_LEAFLET_ZOOM ? Math.pow(2, BASE_LEAFLET_ZOOM - z) : 1;

  return { pmZ, step };
}

function getVisibleTileIndices(map: LeafletMap, pmZ: number) {
  const numTiles = 1 << pmZ;
  const bounds = map.getBounds();
  const west = bounds.getWest();
  const east = bounds.getEast();
  const south = bounds.getSouth();
  const north = bounds.getNorth();

  const visibleIndices: { x: number; y: number; z: number }[] = [];

  for (let y = 0; y < numTiles; y++) {
    for (let x = 0; x < numTiles; x++) {
      const t = getTileBounds(x, y, pmZ);

      const isVisible = !(
        t.east < west ||
        t.west > east ||
        t.south > north ||
        t.north < south
      );

      if (isVisible) {
        visibleIndices.push({ x, y, z: pmZ });
      }
    }
  }

  return visibleIndices;
}

function decodeWindArrowPointsFromImageData(
  imageData: ImageData,
  tileIndex: { x: number; y: number; z: number },
  step: number
): WindArrowPoint[] {
  const { width, height, data } = imageData;

  const globalPxX = tileIndex.x * width;
  const globalPxY = tileIndex.y * height;

  const startPx = (step - (globalPxX % step)) % step;
  const startPy = (step - (globalPxY % step)) % step;

  const points: WindArrowPoint[] = [];

  const numTiles = 1 << tileIndex.z;
  const deltaLon = TOTAL_LON_SPAN / (numTiles * width);
  const deltaLat = TOTAL_LAT_SPAN / (numTiles * height);

  for (let py = startPy; py < height; py += step) {
    for (let px = startPx; px < width; px += step) {
      const idx = (py * width + px) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const a = data[idx + 3];

      if (a === 0 || (r === 255 && g === 255)) {
        continue;
      }

      const deg16Bit = r * 256 + g;
      const degrees = (deg16Bit / 65535.0) * 360.0;

      const absPxX = globalPxX + px;
      const absPxY = globalPxY + py;

      const lon = LON_MIN + absPxX * deltaLon;
      const lat = LAT_MAX - absPxY * deltaLat;

      points.push({
        position: [lon, lat],
        angle: degrees
      });
    }
  }

  return points;
}

async function loadTileImageData(pmtiles: PMTiles, x: number, y: number, z: number): Promise<ImageData | null> {
  const cacheKey = `${z}/${x}/${y}`;
  if (tileCache.has(cacheKey)) {
    return tileCache.get(cacheKey)!;
  }

  try {
    const resp = await pmtiles.getZxy(z, x, y);
    if (!resp || !resp.data) {
      return null;
    }

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
    console.error(`[WindOverlay] Fehler beim Laden der Kachel z=${z}, x=${x}, y=${y}:`, e);
    return null;
  }
}

async function updateViewportWindPoints(): Promise<void> {
  if (!overlayInstance || !pmtilesInstance) return;

  const map = overlayInstance.getMapInstance();
  if (!map) return;

  const { pmZ, step } = getDensityConfig(map);
  const currentToken = ++loadToken;
  const visibleIndices = getVisibleTileIndices(map, pmZ);

  if (visibleIndices.length === 0) return;

  try {
    const tilePromises = visibleIndices.map(async (index) => {
      const imageData = await loadTileImageData(pmtilesInstance!, index.x, index.y, index.z);
      if (!imageData) return [];

      return decodeWindArrowPointsFromImageData(imageData, index, step);
    });

    const results = await Promise.all(tilePromises);
    if (currentToken !== loadToken) return;

    const allPoints = results.flat();
    
    // --- Konsolen-Ausgabe der Viewport-Pfeile ---
    console.log(`[WindOverlay] Rendered Viewport Points (${allPoints.length}):`, allPoints);

    logger.debug(`[WindOverlay] LOD z=${pmZ}, Step=${step} -> ${allPoints.length} Punkte auf dem Screen.`);
    setIconLayerFromPoints(allPoints);
  } catch (err) {
    console.error('[WindOverlay] Fehler in updateViewportWindPoints:', err);
  }
}

function scheduleUpdateViewportWindPoints(): void {
  if (updateTimeoutId !== null) {
    clearTimeout(updateTimeoutId);
  }
  updateTimeoutId = setTimeout(() => {
    updateTimeoutId = null;
    void updateViewportWindPoints();
  }, 50);
}

function pointsEqual(a: WindArrowPoint[] | null, b: WindArrowPoint[]): boolean {
  if (a === b) return true;
  if (!a) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const pa = a[i]!;
    const pb = b[i]!;
    if (pa.angle !== pb.angle) return false;
    if (pa.position[0] !== pb.position[0] || pa.position[1] !== pb.position[1]) return false;
  }
  return true;
}

function setIconLayerFromPoints(points: WindArrowPoint[]): void {
  if (!overlayInstance) return;
  if (pointsEqual(cachedPoints, points)) return;

  const iconLayer = new IconLayer<WindArrowPoint>({
    id: 'wind-arrow-layer',
    data: points,
    iconAtlas: WIND_ARROW_ICON_URL,
    iconMapping: {
      arrow: {
        x: 0,
        y: 0,
        width: 72,
        height: 72,
        anchorX: 36,
        anchorY: 36,
        mask: false
      }
    },
    getIcon: () => 'arrow',
    getPosition: (d: WindArrowPoint) => d.position,
    getAngle: (d: WindArrowPoint) => d.angle,
    getSize: 26,
    sizeScale: 1,
    coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
    pickable: false
  });

  cachedPoints = points;
  overlayInstance.setLayers([iconLayer]);
}

export interface IWindArrowOverlayView {
  init: (map: LeafletMap, pmtilesUrl?: string) => void;
}

export const windArrowOverlayView: IWindArrowOverlayView = {
  init: (map: LeafletMap, pmtilesUrl: string = PMTILES_WIND_URL): void => {
    if (!overlayInstance) {
      overlayInstance = new LeafletDeckOverlay({ className: WIND_ARROW_CLASS, zIndex: WIND_ARROW_PANE_Z_INDEX });
      overlayInstance.addTo(map);

      pmtilesInstance = new PMTiles(pmtilesUrl);

      map.on('moveend zoomend resize', () => {
        scheduleUpdateViewportWindPoints();
      });
    }

    scheduleUpdateViewportWindPoints();
  }
};