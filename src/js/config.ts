export const EXPECTED_API_VERSION = "1.1.0"; // Deine gewünschte Version

import { D2, AROME } from './weatherProvider/providerIds.js';
import type * as Leaflet from 'leaflet';

export type ProviderConfig = {
  baseUrl: string;
  gridCellSize: number;
  imageBounds: Leaflet.LatLngBoundsExpression;
};

/**
 * Provider-specific default configuration accessible as `config.providers[providerId]`.
 * Consumers can read e.g. `providers[AROME].gridCellSize`.
 */
export const providers: Record<string, ProviderConfig> = {
  [D2]: {
    baseUrl: "https://winddata.pages.dev/",
    gridCellSize: 1.0,
    imageBounds: [
      [43.0440, -4.1616],
      [58.1647, 20.5444]
    ]
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

