export type LatLng = { lat: number; lng: number };

export interface WindData {
  speed?: number | null; // knots
  gust?: number | null; // knots
  direction?: number | null; // degrees 0-360
  temperature?: number | null; // °C
  timestamp?: string | Date | null; // ISO or Date
}

export interface ForecastItem {
  hour: string;
  wind: number;
  gust: number;
  direction: number | null;
  fullKey: string;
}

export interface TimelineEntry {
  speeds?: Array<number | undefined>;
  dirs?: Array<number | null | undefined>;
  gusts?: Array<number | undefined>;
}

export interface Cluster {
  lats: number[];
  lons: number[];
  timeline: Record<string, TimelineEntry>;
}

export interface Station {
  station_name?: string;
  name?: string;
  lat?: number;
  lon?: number;
  windData?: WindData | null;
  [key: string]: any;
}

export interface MapState { lat: number; lng: number; zoom: number }

export type ProviderId = string;
