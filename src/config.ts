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
  baseUrl: string;
  gridCellSize: number;
  imageBounds: Leaflet.LatLngBoundsExpression;
  arrows?: {
    lonMin: number;
    latMax: number;
    totalLonSpan: number;
    totalLatSpan: number;
    baseLeafletZoom: number;
    maxPmtilesZ: number;
  };
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
    baseUrl: "/output/",
    gridCellSize: 1.0,
    imageBounds: [
      [37.5, -12.0],
      [55.4, 16.0]
    ]
    ,
    arrows: {
      lonMin: -12.0,
      latMax: 55.4,
      totalLonSpan: 1136 * 0.025,
      totalLatSpan: 720 * 0.025,
      baseLeafletZoom: 8,
      maxPmtilesZ: 4
    }
  }
};
