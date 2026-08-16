import type { LatLngBoundsExpression } from 'leaflet';

export const WIND_WEBP_ALPHA_THRESHOLD = 128;
export const MIN_ARROW_SPACING_PX = 20; // Mindestabstand zwischen Pfeilen in Bildschirmpixeln

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

export type WindWebpDecodeOptions = {
  bounds: LatLngBoundsExpression;
  viewportBounds?: ViewportBounds; // Aktuell sichtbarer Kartenausschnitt
  step?: number;                  // Optionales manuelle Stepping (muss Potenz von 2 sein)
  zoom?: number;                  // Karten-Zoomstufe (falls `step` nicht manuell gesetzt wird)
  alphaThreshold?: number;
};

const normalizeDegrees = (value: number): number => ((value % 360) + 360) % 360;

/**
 * Berechnet das ideale Stepping als Zweierpotenz (1, 2, 4, 8, 16, 32, ...),
 * sodass der Abstand auf dem Bildschirm immer mindestens `minSpacingPx` entspricht.
 */
export const calculateWindStep = (
  imageWidth: number,
  imageBounds: LatLngBoundsExpression,
  zoom: number,
  minSpacingPx: number = MIN_ARROW_SPACING_PX
): number => {
  const [[, westLng], [, eastLng]] = imageBounds as [[number, number], [number, number]];
  const lngSpan = Math.abs(eastLng - westLng);

  // 1. Berechne die Breite des gesamten Bildes in Bildschirmpixeln bei diesem Zoom-Level
  // Formula: 256 * 2^zoom ist die Weltbreite in Pixeln bei 360° Längengraden
  const totalImageWidthPx = (lngSpan / 360.0) * 256 * Math.pow(2, zoom);

  // 2. Wieviele Bildschirmpixel entspricht 1 Pixel im WebP-Image?
  const pxRatio = totalImageWidthPx / imageWidth;

  // 3. Wieviele WebP-Rasterpunkte müssen wir überspringen für minSpacingPx?
  const idealStep = minSpacingPx / pxRatio;

  // 4. Runden auf die nächstgelegene höhere/gleiche Zweierpotenz (1, 2, 4, 8, 16, 32, ...)
  const powerOfTwoStep = Math.pow(2, Math.ceil(Math.log2(Math.max(1, idealStep))));

  return powerOfTwoStep;
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
 * Dekodiert das Einheitsvektor-WebP-Windraster dynamisch geclipped auf den Viewport.
 */
export const decodeWindArrowPointsFromImageData = (
  imageData: ImageData,
  options: WindWebpDecodeOptions
): WindArrowPoint[] => {
  const { width, height, data } = imageData;
  const alphaThreshold = options.alphaThreshold ?? WIND_WEBP_ALPHA_THRESHOLD;

  // 1. Dynamisches Stepping bestimmen (Zweierpotenz)
  let step = options.step;
  if (!step) {
    const zoom = options.zoom ?? 6;
    step = calculateWindStep(width, options.bounds, zoom, MIN_ARROW_SPACING_PX);
  }

  // 2. Viewport-Clipping: Bestimme Pixelgrenzen (xMin, xMax, yMin, yMax) für den Ausschnitt
  let xMin = 0;
  let xMax = width;
  let yMin = 0;
  let yMax = height;

  if (options.viewportBounds) {
    const [[southLat, westLng], [northLat, eastLng]] = options.bounds as [[number, number], [number, number]];
    const { southLat: vSouth, westLng: vWest, northLat: vNorth, eastLng: vEast } = options.viewportBounds;

    const lonSpan = eastLng - westLng;
    const latSpan = northLat - southLat;

    // Koordinaten in Bild-Pixel umrechnen
    const pxWest = Math.floor(((vWest - westLng) / lonSpan) * width);
    const pxEast = Math.ceil(((vEast - westLng) / lonSpan) * width);
    const pxNorth = Math.floor(((northLat - vNorth) / latSpan) * height);
    const pxSouth = Math.ceil(((northLat - vSouth) / latSpan) * height);

    // Auf Raster-Ebene und Bildgrenzen begrenzen
    xMin = Math.max(0, Math.min(width, pxWest));
    xMax = Math.max(0, Math.min(width, pxEast));
    yMin = Math.max(0, Math.min(height, pxNorth));
    yMax = Math.max(0, Math.min(height, pxSouth));
  }

  // 3. Ausrichtung des Steppings an das globale Zweierpotenz-Grid
  // (Verhindert Grid-Verschiebungen beim Pannen der Karte)
  const startX = Math.floor(xMin / step) * step;
  const startY = Math.floor(yMin / step) * step;

  const points: WindArrowPoint[] = [];

  // 4. Nur über die sichtbare Sub-Matrix iterieren
  for (let y = startY; y < yMax; y += step) {
    if (y < 0 || y >= height) continue;

    for (let x = startX; x < xMax; x += step) {
      if (x < 0 || x >= width) continue;

      const index = (y * width + x) * 4;
      const alpha = data[index + 3] ?? 0;

      if (alpha < alphaThreshold) continue;

      // R/G Bytes [0, 255] -> [-1.0, +1.0]
      const uNorm = ((data[index] ?? 128) - 128) / 127.5;
      const vNorm = ((data[index + 1] ?? 128) - 128) / 127.5;

      // Schwachwind filtern
      const vectorLength = Math.hypot(uNorm, vNorm);
      if (vectorLength < 0.05) continue;

      // Kompasswinkel & Deck.gl Invertierung (CCW)
      const angleRad = Math.atan2(uNorm, vNorm);
      const angleDeg = (angleRad * 180.0) / Math.PI;
      const deckGlAngle = normalizeDegrees(-angleDeg);

      // Geographische Position
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
