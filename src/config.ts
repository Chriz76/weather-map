import { D2, AROME } from './weatherProvider/providerIds.ts';
import type * as Leaflet from 'leaflet';

export const EXPECTED_API_VERSION = "1.1.0"; // Deine gewünschte Version

export const CARTO_API_KEY = 'cb1_28i5_1_ccfb2588484de9213cc3f36f';

export const DEFAULT_MAP_VIEW = {
  lat: 48.3528,
  lng: 10.9043,
  zoom: 8,
} as const;

export type ProviderConfig = {
  /**
   * Origin of the provider's data, with a trailing slash.
   *
   * One host serves both APIs: `<baseUrl>index.json` and the wind tile pyramid
   * (`<baseUrl>tiles/<timestamp>Z/<z>/<x>/<y>.bin`). Keeping them on the same origin means the
   * timestamps in the index are exactly the ones the pyramid really serves.
   */
  baseUrl: string;
  gridCellSize: number;
  imageBounds: Leaflet.LatLngBoundsExpression;
  /**
   * South-west corner of the wind archive lattice in degrees.
   *
   * Every node of a wind archive sits at `anchor + k * deltaLat/Lng`; the arrows are sampled on
   * that lattice so their phase stays uniform across tile borders. Set this when the archive
   * covers a different area than `imageBounds` (e.g. the HRRR window served through the d2
   * provider). Defaults to `imageBounds[0]`.
   */
  windAnchor?: { lat: number; lng: number };
};

/**
 * Provider-specific default configuration accessible as `config.providers[providerId]`.
 * Consumers can read e.g. `providers[AROME].gridCellSize`.
 */
export const providers: Record<string, ProviderConfig> = {
  [D2]: {
    // TODO: `6db286e6` is a per-deploy preview hash, so this URL stops working after the next
    // deploy. Replace it with the stable production alias (or a hostname of your own) as soon as
    // the pipeline publishes there - the pipeline redeploys hourly.
    baseUrl: "https://cba6da39.winddata.pages.dev/",
    gridCellSize: 1.0,
    imageBounds: [
      [43.0440, -4.1616],
      [58.1647, 20.5444]
    ],
    // South-west corner of the HRRR window the wind tile pyramid covers of that area
    // (HrrrWindProcessor._hrrr_geographic_bounds(); matches `bounds.west/south` of
    // `meta/<timestamp>Z.json`).
    windAnchor: { lat: 21.138, lng: -134.096114 }
  },
  [AROME]: {
    baseUrl: "https://chriz76.github.io/weather-data/",
    gridCellSize: 1.0,
    imageBounds: [
      [37.5, -12.0],
      [55.4, 16.0]
    ]
  }
};
