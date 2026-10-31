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
   * Map view used as a fallback for a provider: the centre of its model area.
   *
   * Per provider, because the model areas do not overlap: the centre of one model area holds no
   * data for another. `map-init` additionally fits the whole area on a first visit, so the zoom
   * here is only a fallback for provider switches and invalid stored views.
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
  /**
   * Whether station measurements exist for the provider's area.
   *
   * The only source is Bright Sky (DWD stations, Europe), so a CONUS-only model has none and the
   * "wind measurements" toggle stays disabled while it is active.
   */
  hasWindMeasurements: boolean;
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
    // Centre of the model area, so a switch from another model does not land on an empty map.
    defaultView: { lat: 50.6044, lng: 8.1914, zoom: 4 },
    windOverlay: "raster",
    hasWindMeasurements: true
  },
  [AROME]: {
    baseUrl: "https://chriz76.github.io/weather-data/",
    gridCellSize: 1.0,
    imageBounds: [
      [37.5, -12.0],
      [55.4, 16.0]
    ],
    // Centre of the model area (Western Europe), see `providers[D2].defaultView`.
    defaultView: { lat: 46.45, lng: 2.0, zoom: 4 },
    windOverlay: "raster",
    hasWindMeasurements: true
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
    defaultView: { lat: 36.877, lng: -97.507, zoom: 4 },
    windOverlay: "tiles",
    // Bright Sky only covers DWD stations in Europe.
    hasWindMeasurements: false
  }
};
