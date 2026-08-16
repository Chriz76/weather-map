import type { LatLngBoundsExpression, LatLngBounds } from 'leaflet';

export const WIND_WEBP_ALPHA_THRESHOLD = 128;
export const MIN_ARROW_SPACING_PX = 80;

export type WindArrowPoint = {
  position: [number, number]; // [lon, lat]
  angle: number;              // Winkel für Deck.gl (im Gegenuhrzeigersinn)
  speed: number;              // Einheitswert (1.0 m/s) für reine Richtungsanzeige
};

export type ViewportBounds = {
  southLat: number;
  westLng: number;
  northLat: number;
  eastLng: number;
};

// Rein internes, striktes Tuple für sichere Berechnungen
type NormalizedBounds = [[number, number], [number, number]];

export type WindWebpDecodeOptions = {
  bounds: LatLngBoundsExpression; // Akzeptiert wieder das reguläre Leaflet-Format
  viewportBounds?: ViewportBounds;
  step?: number;
  zoom?: number;
  alphaThreshold?: number;
  debug?: boolean; // Schaltet erweiterte Debug-Logs ein/aus
};

const normalizeDegrees = (value: number): number => ((value % 360) + 360) % 360;

/**
 * Hilfsfunktion: Berechnet die Distanz zwischen zwei Lat/Lon Punkten in Kilometern (Haversine-Formel)
 */
const calculateDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Erdradius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Wandelt jegliche Leaflet LatLngBoundsExpression sicher in [[south, west], [north, east]] um.
 */
const normalizeBounds = (bounds: LatLngBoundsExpression): NormalizedBounds => {
  if (bounds && typeof bounds === 'object' && 'getSouthWest' in bounds && typeof bounds.getSouthWest === 'function') {
    const b = bounds as LatLngBounds;
    const sw = b.getSouthWest();
    const ne = b.getNorthEast();
    return [[sw.lat, sw.lng], [ne.lat, ne.lng]];
  }

  if (Array.isArray(bounds)) {
    const [sw, ne] = bounds as unknown[];

    if (Array.isArray(sw) && Array.isArray(ne)) {
      return [
        [Number(sw[0]), Number(sw[1])],
        [Number(ne[0]), Number(ne[1])]
      ];
    }

    if (sw && typeof sw === 'object' && 'lat' in sw && 'lng' in sw &&
        ne && typeof ne === 'object' && 'lat' in ne && 'lng' in ne) {
      const swObj = sw as { lat: number; lng: number };
      const neObj = ne as { lat: number; lng: number };
      return [[swObj.lat, swObj.lng], [neObj.lat, neObj.lng]];
    }
  }

  return [[0, 0], [0, 0]];
};

/**
 * Wandelt Pixelkoordinaten (x, y) aus dem unprojizierten AROME Grad-Gitter (EPSG:4326)
 * direkt in echte [lon, lat] WGS84-Koordinaten um.
 */
const toLonLatEquirectangular = (
  x: number,
  y: number,
  width: number,
  height: number,
  bounds: NormalizedBounds
): [number, number] => {
  const [[southLat, westLng], [northLat, eastLng]] = bounds;

  const lon = westLng + (x / (width - 1)) * (eastLng - westLng);
  const lat = northLat - (y / (height - 1)) * (northLat - southLat);

  return [lon, lat];
};

/**
 * Berechnet das ideale Stepping als Zweierpotenz (1, 2, 4, 8, 16, 32, ...).
 */
export const calculateWindStep = (
  imageWidth: number,
  imageBounds: LatLngBoundsExpression,
  zoom: number,
  minSpacingPx: number = MIN_ARROW_SPACING_PX
): number => {
  const [[, westLng], [, eastLng]] = normalizeBounds(imageBounds);
  const lngSpan = Math.abs(eastLng - westLng);

  const totalImageWidthPx = (lngSpan / 360.0) * 256 * Math.pow(2, zoom);
  const pxRatio = totalImageWidthPx / imageWidth;
  const idealStep = minSpacingPx / pxRatio;

  return Math.max(1, Math.pow(2, Math.ceil(Math.log2(idealStep))));
};

/**
 * Dekodiert das Einheitsvektor-WebP-Windraster dynamisch geclipped auf den Viewport.
 */
export const decodeWindArrowPointsFromImageData = (
  imageData: ImageData,
  options: WindWebpDecodeOptions
): WindArrowPoint[] => {
  const { width, height, data } = imageData;
  const enableDebug = options.debug ?? true; // Standardmäßig true für direkte Diagnose
  
  const bounds = normalizeBounds(options.bounds);
  const alphaThreshold = options.alphaThreshold ?? WIND_WEBP_ALPHA_THRESHOLD;

  // 1. Dynamisches Stepping bestimmen
  let step = options.step;
  if (!step) {
    const zoom = options.zoom ?? 6;
    step = calculateWindStep(width, options.bounds, zoom, MIN_ARROW_SPACING_PX);
  } else {
    step = Math.max(1, Math.floor(step));
  }

  // 2. Viewport-Clipping
  let xMin = 0;
  let xMax = width;
  let yMin = 0;
  let yMax = height;

  if (options.viewportBounds) {
    const [[southLat, westLng], [northLat, eastLng]] = bounds;
    const { southLat: vSouth, westLng: vWest, northLat: vNorth, eastLng: vEast } = options.viewportBounds;

    const lonSpan = eastLng - westLng;
    const latSpan = northLat - southLat;

    xMin = Math.max(0, Math.floor(((vWest - westLng) / lonSpan) * width));
    xMax = Math.min(width, Math.ceil(((vEast - westLng) / lonSpan) * width));
    yMin = Math.max(0, Math.floor(((northLat - vNorth) / latSpan) * height));
    yMax = Math.min(height, Math.ceil(((northLat - vSouth) / latSpan) * height));
  }

  // 3. Ausrichtung des Steppings
  const startX = Math.floor(xMin / step) * step;
  const startY = Math.floor(yMin / step) * step;

  const points: WindArrowPoint[] = [];

  // 4. Raster-Schleife über Integer-Koordinaten
  for (let y = startY; y < yMax; y += step) {
    if (y < 0 || y >= height) continue;

    for (let x = startX; x < xMax; x += step) {
      if (x < 0 || x >= width) continue;

      const pixelX = Math.floor(x);
      const pixelY = Math.floor(y);
      const index = (pixelY * width + pixelX) * 4;

      const alpha = data[index + 3] ?? 0;
      if (alpha < alphaThreshold) continue;

      const uNorm = ((data[index] ?? 128) - 128) / 127.5;
      const vNorm = ((data[index + 1] ?? 128) - 128) / 127.5;

      const vectorLength = Math.hypot(uNorm, vNorm);
      if (vectorLength < 0.05) continue;

      const angleRad = Math.atan2(uNorm, vNorm);
      const angleDeg = (angleRad * 180.0) / Math.PI;
      const deckGlAngle = normalizeDegrees(-angleDeg);

      const [lon, lat] = toLonLatEquirectangular(pixelX, pixelY, width, height, bounds);

      points.push({
        position: [lon, lat],
        angle: deckGlAngle,
        speed: 1.0
      });
    }
  }

  // =========================================================================
  // DEBUG LOGS
  // =========================================================================
  if (enableDebug) {
    const [[sLat, wLng], [nLat, eLng]] = bounds;
    
    // Berechne Distanz zwischen 2 benachbarten Pixeln (Step = 1)
    const [p0Lon, p0Lat] = toLonLatEquirectangular(0, 0, width, height, bounds);
    const [p1Lon, p1Lat_Y] = toLonLatEquirectangular(0, 1, width, height, bounds);
    const [p1Lon_X, p0Lat_X] = toLonLatEquirectangular(1, 0, width, height, bounds);

    const distLatKm = calculateDistanceKm(p0Lat, p0Lon, p1Lat_Y, p0Lon);
    const distLngKm = calculateDistanceKm(p0Lat, p0Lon, p0Lat_X, p1Lon_X);

    console.groupCollapsed(`🔍 [WindDecoder Debug] Decodiert: ${points.length} Punkte (Step: ${step})`);
    console.log(`📐 Image Dimensions:`, `${width}x${height} px`);
    console.log(`🗺️ Normalized Bounds:`, {
      SouthWest: [sLat, wLng],
      NorthEast: [nLat, eLng],
      LatSpan: (nLat - sLat).toFixed(4) + '°',
      LngSpan: (eLng - wLng).toFixed(4) + '°',
    });
    console.log(`📏 Native Grid Pixel-Abstand (Step = 1):`, {
      NordSüd_Distanz: `${distLatKm.toFixed(3)} km (${Math.abs(p0Lat - p1Lat_Y).toFixed(5)}°)`,
      OstWest_Distanz: `${distLngKm.toFixed(3)} km (${Math.abs(p0Lon - p1Lon_X).toFixed(5)}°)`,
    });
    console.log(`🎯 Aktuelle Render-Schrittweite (Step = ${step}):`, {
      Effektiver_NordSüd_Abstand: `${(distLatKm * step).toFixed(3)} km`,
      Effektiver_OstWest_Abstand: `${(distLngKm * step).toFixed(3)} km`,
    });
    if (points.length > 1) {
      console.log(`📍 Erste 2 Punkte im Output:`, [points[0], points[1]]);
    }
    console.groupEnd();
  }

  return points;
};
