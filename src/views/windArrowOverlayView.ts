import { IconLayer } from '@deck.gl/layers';
import type { Map as LeafletMap } from 'leaflet';
import { LeafletDeckOverlay } from '../utils/leafletDeckOverlay';
import { COORDINATE_SYSTEM } from '@deck.gl/core';
import { logger } from '../utils/logger';
import { PMTiles } from 'pmtiles';

const WIND_ARROW_PANE_Z_INDEX = '510';
const WIND_ARROW_CLASS = 'wind-arrow-deck-overlay';

const PMTILES_WIND_URL = '/meteofrance_arome_france0025_15min_202609050800Z_202609051400Z_dir.pmtiles';

// Exakte AROME Bounding Box (EPSG:4326) – gepaddet auf Block-Vielfache
const LON_MIN = -12.0;
const LAT_MAX = 55.4;

const TOTAL_LON_SPAN = 1136 * 0.025; // 28.4°
const TOTAL_LAT_SPAN = 720 * 0.025;  // 18.0°

const BASE_LEAFLET_ZOOM = 8;
const MAX_PMTILES_Z = 4;

export interface WindArrowPoint {
  position: [number, number]; // [lon, lat]
  angle: number;              // Grad (0..360°)
}

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
  const zoom = Math.floor(map.getZoom());

  // PMTiles LOD-Level ermitteln (begrenzt auf 0 bis MAX_PMTILES_Z)
  const rawLOD = zoom - BASE_LEAFLET_ZOOM;
  const pmZ = Math.min(MAX_PMTILES_Z, Math.max(0, rawLOD));

  // Stride-Zuordnung je nach Zoomstufe
  let step: number;

  if (zoom <= 3) {
    step = 0; // Keine Pfeile bei sehr niedrigem Zoom
  } else if (zoom === 4) {
    step = 16;
  } else if (zoom === 5) {
    step = 8;
  } else if (zoom === 6) {
    step = 4;
  } else if (zoom === 7) {
    step = 2;
  } else {
    step = 1;
  }

  if (step > 1) { step = step / 2; } // Halbiere den Schritt für feinere Dichte

  console.log(
    `[WindOverlay Config] Zoom: ${map.getZoom()} (floor: ${zoom}) -> PMTiles Z: ${pmZ}, Stride: ${step}`
  );

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
  if (step <= 0) return [];

  const { width, height, data } = imageData;

  // Globale Pixelkoordinaten der oberen linken Ecke dieser Kachel
  const globalPxX = tileIndex.x * width;
  const globalPxY = tileIndex.y * height;

  // Kachelübergreifender Stride-Startpunkt (Phasen-Ausrichtung am globalen Raster)
  const startPx = (step - (globalPxX % step)) % step;
  const startPy = (step - (globalPxY % step)) % step;

  const points: WindArrowPoint[] = [];

  const numTiles = 1 << tileIndex.z;
  const deltaLon = TOTAL_LON_SPAN / (numTiles * width);
  const deltaLat = TOTAL_LAT_SPAN / (numTiles * height);

  let scannedPixels = 0;

  for (let py = startPy; py < height; py += step) {
    for (let px = startPx; px < width; px += step) {
      scannedPixels++;

      const idx = (py * width + px) * 4;
      const r = data[idx]!;      // High Byte
      const g = data[idx + 1]!;  // Low Byte
      const b = data[idx + 2]!;  // Valid Mask (255 = Gültig, 0 = NaN/Padding)

      // Überspringe ungültige Pixel (NaN/Padding)
      if (b !== 255) {
        continue;
      }

      // Reorganisation des 16-Bit Wertes (0..360°)
      const deg16Bit = r * 256 + g;
      const degrees = (deg16Bit / 65535.0) * 360.0;

      const absPxX = globalPxX + px;
      const absPxY = globalPxY + py;

      // Pixel-is-Point Alignment
      const lon = LON_MIN + absPxX * deltaLon;
      const lat = LAT_MAX - absPxY * deltaLat;

      points.push({
        position: [lon, lat],
        angle: - (degrees + 180) % 360 // Pfeilrichtung um 180° drehen, da Windrichtung = Gegenrichtung der Pfeilspitze
      });
    }
  }

  console.log(
    `[WindOverlay Tile ${tileIndex.z}/${tileIndex.x}/${tileIndex.y}] ` +
    `Scanned iterations: ${scannedPixels} | Points Extracted: ${points.length}`
  );

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
  if (step === 0) {
    setIconLayerFromPoints([]);
    return;
  }

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

    console.log(`[WindOverlay Summary] Total Viewport Points: ${allPoints.length} across ${visibleIndices.length} tiles.`);

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