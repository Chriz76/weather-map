import { calculatewindSpeeds } from '../utils/interpolation';
import { D2 } from './providerIds';
import type { LatLng, Cluster, ForecastItem } from '../types';

export const ID = D2;

const CACHE_BUSTER = `cb=${Date.now()}`;

export const d2Provider = {
  id: ID,

  async fetchIndex(config: Record<string, unknown>): Promise<import('../types').IndexData> {
    const baseUrl = typeof config?.baseUrl === 'string' ? config.baseUrl : '';
    const response = await fetch(`${baseUrl}index.json?${CACHE_BUSTER}`, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`index.json could not be loaded (status: ${response.status})`);
    const json: unknown = await response.json();

    const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object';
    const out: import('../types').IndexData = {};
    if (!isObject(json)) return out;
    if (typeof json.generated_at === 'string') out.generated_at = json.generated_at;
    if (Array.isArray(json.available_timestamps)) {
      out.available_timestamps = json.available_timestamps.filter((x: unknown) => typeof x === 'string') as string[];
    }
    if (typeof json.current_hour === 'string') out.current_hour = json.current_hour;
    if (typeof json.api_version === 'string') out.api_version = json.api_version;

    return out;
  },

  async fetchForecast(latlng: LatLng | null, config: Record<string, unknown> | null): Promise<ForecastItem[] | null> {
    if (!latlng || !config) return null;

    const cfg = config as Record<string, unknown>;
    const imageBounds = Array.isArray(cfg?.imageBounds) ? cfg.imageBounds : null;
    const gridCellSize = typeof cfg?.gridCellSize === 'number' ? (cfg.gridCellSize as number) : null;
    const baseUrl = typeof cfg?.baseUrl === 'string' ? (cfg.baseUrl as string) : '';

    if (!Array.isArray(imageBounds) || typeof gridCellSize !== 'number') return null;

    const firstRow = Array.isArray(imageBounds[0]) ? (imageBounds[0] as unknown[]) : null;
    if (!firstRow || typeof firstRow[0] !== 'number' || typeof firstRow[1] !== 'number') return null;
    const latMin = firstRow[0] as number;
    const lonMin = firstRow[1] as number;

    const col = Math.floor((latlng.lng - lonMin) / (gridCellSize as number));
    const row = Math.floor((latlng.lat - latMin) / (gridCellSize as number));
    const clusterUrl = `${baseUrl}grid_cluster/cluster_${col}_${row}.json?${CACHE_BUSTER}`;

    const response = await fetch(clusterUrl, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Cluster file could not be loaded (${response.status})`);

    const clusterJson: unknown = await response.json();
    const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object';
    if (!isObject(clusterJson)) throw new Error('Cluster data structure is invalid.');

    // Validate lats and lons
    const latsRaw: unknown[] | null = Array.isArray((clusterJson as Record<string, unknown>).lats)
      ? ((clusterJson as Record<string, unknown>).lats as unknown[])
      : null;
    const lonsRaw: unknown[] | null = Array.isArray((clusterJson as Record<string, unknown>).lons)
      ? ((clusterJson as Record<string, unknown>).lons as unknown[])
      : null;
    const timelineRaw: Record<string, unknown> | null = isObject((clusterJson as Record<string, unknown>).timeline)
      ? ((clusterJson as Record<string, unknown>).timeline as Record<string, unknown>)
      : null;

    if (!latsRaw || !lonsRaw || !timelineRaw) {
      throw new Error('Cluster data structure is invalid.');
    }

    const lats: number[] = latsRaw.filter((x: unknown) => typeof x === 'number') as number[];
    const lons: number[] = lonsRaw.filter((x: unknown) => typeof x === 'number') as number[];

    if (lats.length === 0 || lons.length === 0 || lats.length !== lons.length) {
      throw new Error('Cluster lat/lon arrays are invalid.');
    }

    const timeline: Record<string, import('../types').TimelineEntry> = {};
    for (const [k, v] of Object.entries(timelineRaw)) {
      if (!isObject(v)) continue;
      const speeds = Array.isArray(v.speeds) ? (v.speeds as unknown[]).map((n) => typeof n === 'number' ? n : undefined) as Array<number | undefined> : [];
      const dirs = Array.isArray(v.dirs) ? (v.dirs as unknown[]).map((n) => typeof n === 'number' ? n : (n === null ? null : undefined)) as Array<number | null | undefined> : [];
      const gusts = Array.isArray(v.gusts) ? (v.gusts as unknown[]).map((n) => typeof n === 'number' ? n : undefined) as Array<number | undefined> : [];
      timeline[k] = { speeds, dirs, gusts };
    }

    const cluster: Cluster = { lats, lons, timeline };

    return calculatewindSpeeds(latlng, cluster) as ForecastItem[] | null;
  },

  async fetchWeatherImageBlob(timestamp: string, config: Record<string, unknown>): Promise<Blob> {
    const cfg = config as Record<string, unknown> | undefined;
    const baseUrl = cfg && typeof cfg.baseUrl === 'string' ? cfg.baseUrl : '';
    const imageUrl = `${baseUrl}${timestamp}Z.webp?${CACHE_BUSTER}`;
    const response = await fetch(imageUrl, { cache: 'no-cache' });
    if (!response.ok) throw new Error('Image could not be loaded');
    return await response.blob();
  }
};

export default d2Provider;
