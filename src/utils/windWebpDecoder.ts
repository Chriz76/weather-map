export const calculateWindStep = (
  imageWidth: number,
  imageBounds: LatLngBoundsExpression,
  zoom: number,
  minSpacingPx: number = MIN_ARROW_SPACING_PX
): number => {
  const [[, westLng], [, eastLng]] = imageBounds as [[number, number], [number, number]];
  const lngSpan = Math.abs(eastLng - westLng);

  // 1. Breite des Bildes in Bildschirmpixeln bei aktuellem Zoom
  const totalImageWidthPx = (lngSpan / 360.0) * 256 * Math.pow(2, zoom);

  // 2. Ratio: Wie viele Display-Pixel entspricht 1 Rasterpunkt?
  const pxRatio = totalImageWidthPx / imageWidth;

  // 3. Wie viele Rasterpunkte für den gewünschten Abstand überspringen?
  const idealStep = minSpacingPx / pxRatio;

  // 4. FIX: Zwingend auf eine Integer-Zweierpotenz >= 1 begrenzen (1, 2, 4, 8, 16...)
  const powerOfTwoStep = Math.max(1, Math.pow(2, Math.ceil(Math.log2(idealStep))));

  return powerOfTwoStep;
};

export const decodeWindArrowPointsFromImageData = (
  imageData: ImageData,
  options: WindWebpDecodeOptions
): WindArrowPoint[] => {
  const { width, height, data } = imageData;
  const alphaThreshold = options.alphaThreshold ?? WIND_WEBP_ALPHA_THRESHOLD;

  // 1. Dynamisches Stepping (garantiert Integer >= 1)
  let step = options.step;
  if (!step) {
    const zoom = options.zoom ?? 6;
    step = calculateWindStep(width, options.bounds, zoom, MIN_ARROW_SPACING_PX);
  } else {
    step = Math.max(1, Math.floor(step));
  }

  // 2. Viewport Clipping
  let xMin = 0;
  let xMax = width;
  let yMin = 0;
  let yMax = height;

  if (options.viewportBounds) {
    const [[southLat, westLng], [northLat, eastLng]] = options.bounds as [[number, number], [number, number]];
    const { southLat: vSouth, westLng: vWest, northLat: vNorth, eastLng: vEast } = options.viewportBounds;

    const lonSpan = eastLng - westLng;
    const latSpan = northLat - southLat;

    xMin = Math.max(0, Math.floor(((vWest - westLng) / lonSpan) * width));
    xMax = Math.min(width, Math.ceil(((vEast - westLng) / lonSpan) * width));
    yMin = Math.max(0, Math.floor(((northLat - vNorth) / latSpan) * height));
    yMax = Math.min(height, Math.ceil(((northLat - vSouth) / latSpan) * height));
  }

  // 3. Ausrichtung des Steppings an das Zweierpotenz-Gitter
  const startX = Math.floor(xMin / step) * step;
  const startY = Math.floor(yMin / step) * step;

  const points: WindArrowPoint[] = [];

  // 4. FIX: Schleifenvariable MUSS zwingend als Integer iteriert werden!
  for (let y = startY; y < yMax; y += step) {
    if (y < 0 || y >= height) continue;

    for (let x = startX; x < xMax; x += step) {
      if (x < 0 || x >= width) continue;

      // Integer-Pixelindex für Canvas ImageData
      const pixelX = Math.floor(x);
      const pixelY = Math.floor(y);
      const index = (pixelY * width + pixelX) * 4;

      const alpha = data[index + 3] ?? 0;
      if (alpha < alphaThreshold) continue;

      // R/G Bytes [0, 255] -> [-1.0, +1.0]
      const uNorm = ((data[index] ?? 128) - 128) / 127.5;
      const vNorm = ((data[index + 1] ?? 128) - 128) / 127.5;

      const vectorLength = Math.hypot(uNorm, vNorm);
      if (vectorLength < 0.05) continue;

      const angleRad = Math.atan2(uNorm, vNorm);
      const angleDeg = (angleRad * 180.0) / Math.PI;
      const deckGlAngle = normalizeDegrees(-angleDeg);

      // Exakte Geoposition anhand von Integer-Pixelkoordinaten
      const [lon, lat] = toLonLatEquirectangular(pixelX, pixelY, width, height, options.bounds);

      points.push({
        position: [lon, lat],
        angle: deckGlAngle,
        speed: 1.0
      });
    }
  }

  return points;
};
