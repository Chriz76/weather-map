import type { LatLngBoundsExpression } from 'leaflet';

export const WIND_WEBP_SAMPLE_STEP = 20;
export const WIND_WEBP_COMPONENT_MAX = 50.0; // Entspricht MAX_RAW_SPEED
export const WIND_WEBP_MIN_SPEED = 0.1;
export const WIND_WEBP_ALPHA_THRESHOLD = 128;

export type WindArrowPoint = {
  position: [number, number]; // [lon, lat]
  angle: number;              // 0° = Nord, 90° = Ost
  speed: number;              // m/s
};

export type WindWebpDecodeOptions = {
  bounds: LatLngBoundsExpression;
  step?: number;
  componentMax?: number;
  minSpeed?: number;
  alphaThreshold?: number;
};

const normalizeDegrees = (value: number): number => ((value % 360) + 360) % 360;

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
 * Dekodiert das nicht-linear skalierte WebP-Windraster in Punkte für Deck.gl / Leaflet.
 */
export const decodeWindArrowPointsFromImageData = (
  imageData: ImageData,
  options: WindWebpDecodeOptions
): WindArrowPoint[] => {
  const step = options.step ?? WIND_WEBP_SAMPLE_STEP;
  const maxSpeed = options.componentMax ?? WIND_WEBP_COMPONENT_MAX;
  const minSpeed = options.minSpeed ?? WIND_WEBP_MIN_SPEED;
  const alphaThreshold = options.alphaThreshold ?? WIND_WEBP_ALPHA_THRESHOLD;
  
  const points: WindArrowPoint[] = [];
  const { width, height, data } = imageData;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const index = (y * width + x) * 4;
      const alpha = data[index + 3] ?? 0;
      
      if (alpha < alphaThreshold) continue;

      // 1. Byte [0, 255] zentriert auf [-1.0, +1.0] zurückrechnen (128 ist Nullwind)
      const uScaled = ((data[index] ?? 128) / 255.0) * 2.0 - 1.0;
      const vScaled = ((data[index + 1] ?? 128) / 255.0) * 2.0 - 1.0;

      // 2. Skalierten Betrag f(S) berechnen
      // f(S) = sqrt(S) / sqrt(S_max)
      const fS = Math.hypot(uScaled, vScaled);
      
      if (fS === 0) continue;

      // 3. Physikalische Windgeschwindigkeit S rekonstruieren: S = (f(S))^2 * S_max
      const speed = fS * fS * maxSpeed;
      
      if (speed < minSpeed) continue;

      // 4. Kompasswinkel direkt aus den Erdnord-Komponenten berechnen
      // Python hat (u_earth, v_earth) encodiert -> atan2(u, v) liefert mathematischen
      // Winkel relativ zu Nord.
      const angleRad = Math.atan2(uScaled, vScaled);
      const angle = normalizeDegrees((angleRad * 180.0) / Math.PI);

      // 5. Geographische Position im Pixelraster bestimmen
      const [lon, lat] = toLonLat(x, y, width, height, options.bounds);

      points.push({
        position: [lon, lat],
        angle,
        speed
      });
    }
  }

  return points;
};
