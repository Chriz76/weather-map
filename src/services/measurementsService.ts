import { logger } from '../utils/logger';
import * as parsing from '../utils/parsing';
import type { WindData } from '../types';

const CACHE_BUSTER = `cb=${Date.now()}`;
const DEFAULT_TTL = 4 * 60 * 1000; // 4 minutes

type CacheEntry = { data: WindData | null; ts: number };
const windCache: Record<string, CacheEntry> = {};
const inflight: Record<string, Promise<WindData | null> | undefined> = {};

async function fetchFromBrightSky(dwdStationId: string): Promise<WindData | null> {
  const url = `https://api.brightsky.dev/current_weather?dwd_station_id=${dwdStationId}&${CACHE_BUSTER}`;
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`API-Error: ${response.status}`);
  const data: unknown = await response.json();
  if (!parsing.isObject(data)) return null;

  const current = data.weather;
  if (!parsing.isObject(current)) return null;

  const speedKmh = parsing.toFiniteNumber(current['wind_speed_10']);
  const direction = parsing.toFiniteNumber(current['wind_direction_10']);
  const gustKmh = parsing.toFiniteNumber(current['wind_gust_speed_10']);
  const temperature = parsing.toFiniteNumber(current['temperature']);
  const timestampRaw = current['timestamp'];
  const timestamp = parsing.isString(timestampRaw) ? timestampRaw : null;

  if (speedKmh === null) {
    logger.debug(`BrightSky: missing wind_speed_10 for station ${dwdStationId}`);
    return null;
  }

  const speed = Math.round(speedKmh * 0.539957 * 10) / 10;
  const directionVal = typeof direction === 'number' ? direction : 0;
  const gust = gustKmh === null ? null : Math.round(gustKmh * 0.539957);

  const result: WindData = {
    speed,
    direction: directionVal,
    gust,
    temperature,
    timestamp,
  };

  return result;
}

export async function fetchWindDataForStation(
  dwdStationId: string,
  options?: { forceRefresh?: boolean; ttl?: number }
): Promise<WindData | null> {
  const { forceRefresh = false, ttl = DEFAULT_TTL } = options || {};
  const now = Date.now();

  const cached = windCache[dwdStationId];
  if (!forceRefresh && cached && now - cached.ts < ttl) {
    return cached.data;
  }

  if (inflight[dwdStationId]) return inflight[dwdStationId]!;

  inflight[dwdStationId] = (async () => {
    try {
      const data = await fetchFromBrightSky(dwdStationId);
      windCache[dwdStationId] = { data, ts: Date.now() };
      return data;
    } finally {
      delete inflight[dwdStationId];
    }
  })();

  return inflight[dwdStationId]!;
}

export function clearWindCache(stationId?: string): void {
  if (stationId) delete windCache[stationId];
  else {
    for (const k in windCache) delete windCache[k];
  }
}
