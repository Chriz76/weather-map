import type { LatLngBoundsExpression } from 'leaflet';

export const WIND_WEBP_SAMPLE_STEP = 20;
export const WIND_WEBP_COMPONENT_MAX = 50;
export const WIND_WEBP_MIN_SPEED = 0.1;
export const WIND_WEBP_ALPHA_THRESHOLD = 128;

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

const decodeRootScaledComponent = (channelValue: number, componentMax: number): number => {
  const normalized = (channelValue / 255) * 2 - 1;
  const magnitude = normalized * normalized * componentMax;
  return normalized < 0 ? -magnitude : magnitude;
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

const mercatorHeadingFromVector = (u: number, v: number, lat: number): number => {
  const latRad = (lat * Math.PI) / 180;
  const projectedEast = u * Math.cos(latRad);
  const projectedNorth = v;
  return normalizeDegrees((Math.atan2(projectedEast, projectedNorth) * 180) / Math.PI);
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

      const u = decodeRootScaledComponent(data[index] ?? 0, componentMax);
      const v = decodeRootScaledComponent(data[index + 1] ?? 0, componentMax);
      const speed = Math.hypot(u, v);
      if (speed < minSpeed) continue;

      const [lon, lat] = toLonLat(x, y, width, height, options.bounds);

      points.push({
        position: [lon, lat],
        angle: mercatorHeadingFromVector(u, v, lat),
        speed
      });
    }
  }

  return points;
};
