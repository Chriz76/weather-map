import { D2, AROME } from './weatherProvider/providerIds.ts';
import type * as Leaflet from 'leaflet';

/** API version the client understands; a different one means the app needs an update. */
export const EXPECTED_API_VERSION = "1.1.0";

/**
 * Binary layout the tile decoder implements (`format.id` of `index.json`).
 *
 * The API version did not move when the index switched to the templated `tiles_url`, so the tile
 * payload is guarded separately: any other id would be decoded as garbage.
 */
export const EXPECTED_WIND_FORMAT_ID = "hrrr-wind-int16-delta";

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
   * One host serves both APIs: `<baseUrl>index.json` and the wind tile pyramid its `tiles_url`
   * points at (a path below this root). Keeping them on the same origin means the timestamps in
   * the index are exactly the ones the pyramid really serves.
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
    // Stable CDN host of the HRRR pipeline: `index.json` and the run-scoped tile pyramid its
    // `tiles_url` points at (`runs/<run>/tiles/<timestamp>/<z>/<x>/<y>.bin`).
    baseUrl: "https://hrrr.b-cdn.net/",
    gridCellSize: 1.0,
    imageBounds: [
      [43.0440, -4.1616],
      [58.1647, 20.5444]
    ],
    // South-west corner of the HRRR window the wind tile pyramid covers of that area
    // (HrrrWindProcessor._hrrr_geographic_bounds(); matches `bounds.west/south` of `index.json`).
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
