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
  [key: string]: unknown;
}

export interface MapState { lat: number; lng: number; zoom: number }

export type ProviderId = string;

export interface IndexData {
  api_version?: string;
  available_timestamps?: string[];
  generated_at?: string | null;
  current_hour?: string | null;
  [key: string]: unknown;
}

export interface Provider {
  id: ProviderId;
  fetchIndex(config: Record<string, unknown>): Promise<IndexData>;
  fetchForecast(latlng: LatLng | null, config: Record<string, unknown> | null): Promise<ForecastItem[] | null>;
  fetchWeatherImageBlob(timestamp: string, config: Record<string, unknown>): Promise<Blob>;
}
