import type { Map as LeafletMap } from 'leaflet';

export type ArrowsConfig = {
  lonMin: number;
  latMax: number;
  totalLonSpan: number;
  totalLatSpan: number;
  baseLeafletZoom: number;
  maxPmtilesZ: number;
};

const DEFAULT_ARROWS_CONFIG: ArrowsConfig = {
  lonMin: -12.0,
  latMax: 55.4,
  totalLonSpan: 1136 * 0.025,
  totalLatSpan: 720 * 0.025,
  baseLeafletZoom: 8,
  maxPmtilesZ: 4
};

export function getTileBounds(x: number, y: number, z: number, cfg: ArrowsConfig = DEFAULT_ARROWS_CONFIG) {
  const numTiles = 1 << z;
  const tileWidthLon = cfg.totalLonSpan / numTiles;
  const tileHeightLat = cfg.totalLatSpan / numTiles;

  const west = cfg.lonMin + x * tileWidthLon;
  const east = cfg.lonMin + (x + 1) * tileWidthLon;
  const north = cfg.latMax - y * tileHeightLat;
  const south = cfg.latMax - (y + 1) * tileHeightLat;

  return { west, south, east, north };
}

export function getDensityConfig(map: LeafletMap, cfg: ArrowsConfig = DEFAULT_ARROWS_CONFIG) {
  const zoom = Math.floor(map.getZoom());

  const rawLOD = zoom - cfg.baseLeafletZoom;
  const pmZ = Math.min(cfg.maxPmtilesZ, Math.max(0, rawLOD));

  let step: number;
  if (zoom <= 3) {
    step = 0;
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

  if (step > 1) step = step / 2;

  return { pmZ, step };
}

export function getVisibleTileIndices(map: LeafletMap, pmZ: number, cfg: ArrowsConfig = DEFAULT_ARROWS_CONFIG) {
  const numTiles = 1 << pmZ;
  const bounds = map.getBounds();
  const west = bounds.getWest();
  const east = bounds.getEast();
  const south = bounds.getSouth();
  const north = bounds.getNorth();

  const visibleIndices: { x: number; y: number; z: number }[] = [];

  for (let y = 0; y < numTiles; y++) {
    for (let x = 0; x < numTiles; x++) {
      const t = getTileBounds(x, y, pmZ, cfg);

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

export interface WindArrowPoint {
  position: [number, number]; // [lon, lat]
  angle: number;
}

export function decodeWindArrowPointsFromImageData(
  imageData: ImageData,
  tileIndex: { x: number; y: number; z: number },
  step: number,
  cfg: ArrowsConfig = DEFAULT_ARROWS_CONFIG
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
  const deltaLon = cfg.totalLonSpan / (numTiles * width);
  const deltaLat = cfg.totalLatSpan / (numTiles * height);

  let scannedPixels = 0;

  for (let py = startPy; py < height; py += step) {
    for (let px = startPx; px < width; px += step) {
      scannedPixels++;

      const idx = (py * width + px) * 4;
      const r = data[idx]!;      // High Byte
      const g = data[idx + 1]!;  // Low Byte
      const b = data[idx + 2]!;  // Valid Mask (255 = Gültig, 0 = NaN/Padding)

      if (b !== 255) continue;

      const deg16Bit = r * 256 + g;
      const degrees = (deg16Bit / 65535.0) * 360.0;

      const absPxX = globalPxX + px;
      const absPxY = globalPxY + py;

      const lon = cfg.lonMin + absPxX * deltaLon;
      const lat = cfg.latMax - absPxY * deltaLat;

      points.push({ position: [lon, lat], angle: - (degrees + 180) % 360 });
    }
  }

  return points;
}
