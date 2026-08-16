import type { LatLngBoundsExpression } from 'leaflet';

export const WIND_WEBP_SAMPLE_STEP = 20;
export const WIND_WEBP_ALPHA_THRESHOLD = 128;

export type WindArrowPoint = {
  position: [number, number]; // [lon, lat]
  angle: number;              // Winkel für Deck.gl (im Gegenuhrzeigersinn)
  speed: number;              // Einheitswert (1.0 m/s) für reine Richtungsanzeige
};

export type WindWebpDecodeOptions = {
  bounds: LatLngBoundsExpression;
  step?: number;
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
 * Dekodiert das Einheitsvektor-WebP-Windraster in Punkte für Deck.gl / Leaflet.
 */
export const decodeWindArrowPointsFromImageData = (
  imageData: ImageData,
  options: WindWebpDecodeOptions
): WindArrowPoint[] => {
  const step = options.step ?? WIND_WEBP_SAMPLE_STEP;
  const alphaThreshold = options.alphaThreshold ?? WIND_WEBP_ALPHA_THRESHOLD;
  
  const points: WindArrowPoint[] = [];
  const { width, height, data } = imageData;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const index = (y * width + x) * 4;
      const alpha = data[index + 3] ?? 0;
      
      if (alpha < alphaThreshold) continue;

      // 1. R/G Bytes [0, 255] auf normierte Einheitsvektoren [-1.0, +1.0] zurückrechnen
      const uNorm = ((data[index] ?? 128) - 128) / 127.5;
      const vNorm = ((data[index + 1] ?? 128) - 128) / 127.5;

      // 2. Schwachwind- bzw. Nullwindbereich filtern
      const vectorLength = Math.hypot(uNorm, vNorm);
      if (vectorLength < 0.05) continue;

      // 3. Kompasswinkel berechnen (0° = Nord, 90° = Ost)
      const angleRad = Math.atan2(uNorm, vNorm);
      const angleDeg = (angleRad * 180.0) / Math.PI;

      // 4. Invertierung für Deck.gl:
      // Deck.gl IconLayer dreht Sprites im Gegenuhrzeigersinn (CCW).
      // Durch die Negation wird der Winkel stufenlos und richtungsgetreu dargestellt.
      const deckGlAngle = normalizeDegrees(-angleDeg);

      // 5. Geographische Position im Pixelraster bestimmen
      const [lon, lat] = toLonLat(x, y, width, height, options.bounds);

      points.push({
        position: [lon, lat],
        angle: deckGlAngle,
        speed: 1.0
      });
    }
  }

  return points;
};
