import { D2, AROME, HRRR } from './weatherProvider/providerIds.ts';
import type * as Leaflet from 'leaflet';

export const EXPECTED_API_VERSION = "1.1.0"; // Deine gewünschte Version

export const CARTO_API_KEY = 'cb1_28i5_1_ccfb2588484de9213cc3f36f';

export const DEFAULT_MAP_VIEW = {
  lat: 48.3528,
  lng: 10.9043,
  zoom: 8,
} as const;

export type ProviderConfig = {
  baseUrl: string;
  /**
   * Cell size of the provider's `grid_cluster/*.json` files in degrees, used to pick the cluster a
   * click falls into. Only providers that publish cluster files (D2) set it.
   */
  gridCellSize?: number;
  imageBounds: Leaflet.LatLngBoundsExpression;
  /**
   * Map view used on the first visit, before any map state is stored.
   *
   * Per provider, because the model areas do not overlap: the default view of the app (Germany)
   * holds no data for a CONUS-only model.
   */
  defaultView: { lat: number; lng: number; zoom: number };
  /**
   * Which wind overlay stack the provider uses. Single capability, read by every overlay decision
   * (raster image, archive arrows, tile pyramid) so no provider can end up in two stacks.
   *
   * `raster`: one `<timestamp>Z.webp` image per step (`updateOverlayForTimestampAction`) plus the
   * `<timestamp>Z_dir.pmtiles` arrows of `windArrowOverlayView`.
   * `tiles`: a `{z}/{x}/{y}.bin` pyramid that `windTileOverlayView` decodes and draws itself, so
   * neither an image nor a PMTiles archive is fetched.
   */
  windOverlay: 'raster' | 'tiles';
};

/**
 * Provider-specific default configuration accessible as `config.providers[providerId]`.
 * Consumers can read e.g. `providers[AROME].gridCellSize`.
 */
export const providers: Record<string, ProviderConfig> = {
  [D2]: {
    baseUrl: "https://chriz76.github.io/icond2ruc-data/",
    gridCellSize: 1.0,
    imageBounds: [
      [43.0440, -4.1616],
      [58.1647, 20.5444]
    ],
    defaultView: DEFAULT_MAP_VIEW,
    windOverlay: "raster"
  },
  [AROME]: {
    baseUrl: "https://chriz76.github.io/weather-data/",
    gridCellSize: 1.0,
    imageBounds: [
      [37.5, -12.0],
      [55.4, 16.0]
    ],
    defaultView: DEFAULT_MAP_VIEW,
    windOverlay: "raster"
  },
  [HRRR]: {
    // NOAA HRRR (CONUS only). Origin of both the `index.json` and the tile pyramid its `tiles_url`
    // points at, so the timestamps of the index are exactly the ones the pyramid serves.
    baseUrl: "https://hrrr.b-cdn.net/",
    // Same window as `bounds` of the index: point forecast and tiles cover the same area.
    imageBounds: [
      [21.138, -134.096114],
      [52.615565, -60.918]
    ],
    // Centre of the model area, so a first visit with HRRR is not an empty map over Europe.
    defaultView: { lat: 38.5, lng: -97.5, zoom: 4 },
    windOverlay: "tiles"
  }
};
