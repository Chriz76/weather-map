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
  id?: string | number;
  station_id?: string | number;
  station_name?: string;
  name?: string;
  lat?: number;
  lon?: number;
  latitude?: number;
  longitude?: number;
  priority?: number;
  windData?: WindData | null;
  [key: string]: unknown;
}

export interface MapState { lat: number; lng: number; zoom: number }

export type ProviderId = string;

/** Inclusive tile-row range `[yMin, yMax]` of one covered tile column. */
export type TileRowRange = [number, number];

/** Covered tiles of one pyramid level: tile column (as string) -> row ranges. */
export type TileCoverageLevel = Record<string, TileRowRange[]>;

/** Covered tiles of a pyramid: zoom (as string) -> columns, as published in `index.json`. */
export type TileCoverage = Record<string, TileCoverageLevel>;

/** Geographic extent of the wind archive in degrees. */
export interface TileBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** Shape of the stored pyramid (`pyramid` of `index.json`). */
export interface TilePyramidInfo {
  min_zoom?: number;
  max_zoom?: number;
  resolution_deg?: number;
  tile_ext?: string;
}

/** Binary layout of one tile (`format` of `index.json`). */
export interface TileFormatInfo {
  id?: string;
  version?: number;
  encoding?: string;
  scale?: number;
  sentinel?: number;
}

export interface IndexData {
  api_version?: string;
  available_timestamps?: string[];
  generated_at?: string | null;
  current_hour?: string | null;
  /** Model run the published tiles belong to, e.g. `20261027_1500`. */
  run?: string;
  /**
   * Tile pyramid of the run, relative to the provider root, e.g.
   * `runs/20261027_1500/tiles/{timestamp}/{z}/{x}/{y}.bin`.
   *
   * The run is part of the path, so every run publishes under fresh URLs - tiles need no cache
   * buster, and a stale index can only ever point at a complete run.
   */
  tiles_url?: string;
  /**
   * Tiles the run really stores. An entry that is missing does not mean "no data"; only an
   * existing level that does not list the column may be treated as empty.
   */
  coverage?: TileCoverage;
  bounds?: TileBounds;
  pyramid?: TilePyramidInfo;
  format?: TileFormatInfo;
  [key: string]: unknown;
}

export interface Provider {
  id: ProviderId;
  fetchIndex(config: Record<string, unknown>): Promise<IndexData>;
  fetchForecast(latlng: LatLng | null, config: Record<string, unknown> | null): Promise<ForecastItem[] | null>;
}
