import type { LatLngBoundsExpression } from 'leaflet';

export const WIND_WEBP_SAMPLE_STEP = 20;
export const WIND_WEBP_COMPONENT_MAX = 50;
export const WIND_WEBP_MIN_SPEED = 0.1;
export const WIND_WEBP_ALPHA_THRESHOLD = 128;

// AROME France Lambert Conformal Projection Center (Center Meridian & Standard Parallel)
const AROME_LON_0 = 2.3371412;
const AROME_LAT_0 = 46.7;

export type WindArrowPoint = {
  position: [number, number];
  angle: number;
  speed: number;
};

export type WindWebpDecodeOptions = {
  bounds: LatLngBoundsExpression;
  step?: number;
  componentMax?: number;
  minSpeed?: number;
  alphaThreshold?: number;
};

const normalizeDegrees = (value: number): number => ((value % 360) + 360) % 360;

/**
 * Wandelt den Uint8-Byte-Wert [0, 255] in das skalierte Intervall [-1.0, +1.0] um.
 */
const byteToNormalized = (channelValue: number): number => {
  return (channelValue / 255.0) * 2.0 - 1.0;
};

/**
 * Rekonstruiert die physikalische Windgeschwindigkeit (m/s oder Knots je nach Max-Wert)
 * durch Aufheben der Wurzel-Skalierung: S_phys = (S_norm)² * S_max
 */
const decodePhysicalSpeed = (uNorm: number, vNorm: number, maxSpeed: number): number => {
  const sNorm = Math.hypot(uNorm, vNorm);
  return sNorm * sNorm * maxSpeed;
};

/**
 * Rechnet die AROME Lambert-Gitter-Komponenten (uGrid, vGrid)
 * in erdbezogene Komponenten (uEarth, vEarth) um (Meridiankonvergenz-Korrektur).
 */
const rotateGridToEarth = (
  uGrid: number,
  vGrid: number,
  lon: number,
  lat: number
): { uEarth: number; vEarth: number } => {
  const latRad = (AROME_LAT_0 * Math.PI) / 180;
  const dLonRad = ((lon - AROME_LON_0) * Math.PI) / 180;

  // Meridiankonvergenz gamma = (lon - lon_0) * sin(lat_0)
  const gamma = dLonRad * Math.sin(latRad);

  const cosG = Math.cos(gamma);
  const sinG = Math.sin(gamma);

  return {
    uEarth: uGrid * cosG + vGrid * sinG,
    vEarth: -uGrid * sinG + vGrid * cosG
  };
};

/**
 * Berechnet den Kompass-Winkel in Grad (0° = Nord, 90° = Ost) für Deck.gl IconLayer.
 */
const calculateCompassHeading = (uEarth: number, vEarth: number): number => {
  const angleRad = Math.atan2(uEarth, vEarth);
  return normalizeDegrees((angleRad * 180.0) / Math.PI);
};

const toLonLat = (
  x: number,
  y: number,
  width: number,
  height: number,
  bounds: LatLngBoundsExpression
): [number, number] => {
  const [[southLat, westLng], [northLat, eastLng]] = bounds as [[number, number], [number, number]];
  const lon = westLng + (x / (width - 1)) * (eastLng - westLng);
  const lat = northLat - (y / (height - 1)) * (northLat - southLat);
  return [lon, lat];
};

/**
 * Decodes a WebP wind raster into subsampled wind arrow points.
 *
 * @param imageData - The decoded image pixels.
 * @param options - Bounds and decoding parameters for the wind field.
 * @returns The geographic arrow points ready for a Deck.gl layer.
 */
export const decodeWindArrowPointsFromImageData = (
  imageData: ImageData,
  options: WindWebpDecodeOptions
): WindArrowPoint[] => {
  const step = options.step ?? WIND_WEBP_SAMPLE_STEP;
  const componentMax = options.componentMax ?? WIND_WEBP_COMPONENT_MAX;
  const minSpeed = options.minSpeed ?? WIND_WEBP_MIN_SPEED;
  const alphaThreshold = options.alphaThreshold ?? WIND_WEBP_ALPHA_THRESHOLD;
  const points: WindArrowPoint[] = [];
  const { width, height, data } = imageData;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const index = (y * width + x) * 4;
      const alpha = data[index + 3] ?? 0;
      if (alpha < alphaThreshold) continue;

      // 1. Gitter-Komponenten im Bereich [-1.0, +1.0] aus R/G Kanälen extrahieren
      const uGridNorm = byteToNormalized(data[index] ?? 128);
      const vGridNorm = byteToNormalized(data[index + 1] ?? 128);

      // 2. Physikalische Geschwindigkeit rekonstruieren
      const speed = decodePhysicalSpeed(uGridNorm, vGridNorm, componentMax);
      if (speed < minSpeed) continue;

      // 3. Geographische Position berechnen
      const [lon, lat] = toLonLat(x, y, width, height, options.bounds);

      // 4. AROME Lambert-Gittervektoren auf echtes Geographisch-Nord drehen
      const { uEarth, vEarth } = rotateGridToEarth(uGridNorm, vGridNorm, lon, lat);

      // 5. Winkeltreuen Kompasswinkel berechnen
      const angle = calculateCompassHeading(uEarth, vEarth);

      points.push({
        position: [lon, lat],
        angle,
        speed
      });
    }
  }

  return points;
};
