import { formatModelTimestampToTime } from '../utils/time';
import { AROME } from './providerIds';
import type { LatLng, ForecastItem } from '../types';

export const ID = AROME;

const CACHE_BUSTER = `cb=${Date.now()}`;

export const aromeProvider = {
  id: ID,

  async fetchIndex(config: Record<string, unknown>): Promise<import('../types').IndexData> {
    const baseUrl = typeof config?.baseUrl === 'string' ? config.baseUrl : '';
    const response = await fetch(`${baseUrl}index.json?${CACHE_BUSTER}`, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`index.json could not be loaded (status: ${response.status})`);
    const json: unknown = await response.json();
    return (json && typeof json === 'object') ? (json as import('../types').IndexData) : ({} as import('../types').IndexData);
  },

  async fetchForecast(latlng: LatLng | null, config: Record<string, unknown> | null): Promise<ForecastItem[] | null> {
    if (!latlng) return null;

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latlng.lat}&longitude=${latlng.lng}&models=meteofrance_arome_france_15min,meteofrance_arome_france_hd_15min&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m&timeformat=unixtime&wind_speed_unit=kn&past_hours=1&forecast_hours=12&temporal_resolution=native&${CACHE_BUSTER}`;

    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Open-Meteo request failed (${res.status})`);
    const payload: unknown = await res.json();

    const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object';
    const toFiniteNumber = (v: unknown): number | null => {
      if (v === null || v === undefined) return null;
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const asNumberArray = (v: unknown): Array<number | null> => Array.isArray(v) ? v.map(item => toFiniteNumber(item)) : [];

    if (!isObject(payload) || !isObject(payload.hourly) || !Array.isArray((payload.hourly as Record<string, unknown>).time)) {
      throw new Error('Open-Meteo payload invalid');
    }

    const h = payload.hourly as Record<string, unknown>;
    const times = Array.isArray(h.time) ? h.time : [];
    const speed15 = asNumberArray(h['wind_speed_10m_meteofrance_arome_france_15min']);
    const dir15 = asNumberArray(h['wind_direction_10m_meteofrance_arome_france_15min']);
    const gust15 = asNumberArray(h['wind_gusts_10m_meteofrance_arome_france_15min']);
    const speedHd = asNumberArray(h['wind_speed_10m_meteofrance_arome_france_hd_15min']);
    const dirHd = asNumberArray(h['wind_direction_10m_meteofrance_arome_france_hd_15min']);
    const gustHd = asNumberArray(h['wind_gusts_10m_meteofrance_arome_france_hd_15min']);

    const unixToModelKey = (sec: number) => {
      const d = new Date(Number(sec) * 1000);
      const YYYY = String(d.getUTCFullYear()).padStart(4, '0');
      const MM = String(d.getUTCMonth() + 1).padStart(2, '0');
      const DD = String(d.getUTCDate()).padStart(2, '0');
      const hh = String(d.getUTCHours()).padStart(2, '0');
      const mm = String(d.getUTCMinutes()).padStart(2, '0');
      return `${YYYY}${MM}${DD}_${hh}${mm}`;
    };

    let lastIdx = -1;
    for (let i = times.length - 1; i >= 0; i--) {
      const anyValue =
        (speed15[i] != null) ||
        (speedHd[i] != null) ||
        (gust15[i] != null) ||
        (gustHd[i] != null) ||
        (dir15[i] != null) ||
        (dirHd[i] != null);
      if (anyValue) { lastIdx = i; break; }
    }

    if (lastIdx === -1) return null;

    const sliceTo = <T,>(arr: T[]): T[] => Array.isArray(arr) ? arr.slice(0, lastIdx + 1) : [];
    const timesTrim = sliceTo(times as unknown[]);
    const speed15Trim = sliceTo(speed15);
    const dir15Trim = sliceTo(dir15);
    const gust15Trim = sliceTo(gust15);
    const speedHdTrim = sliceTo(speedHd);
    const dirHdTrim = sliceTo(dirHd);
    const gustHdTrim = sliceTo(gustHd);

    const result: ForecastItem[] = [];
    for (let i = 0; i < timesTrim.length; i++) {
      const t = toFiniteNumber(timesTrim[i]) ?? 0;
      const s15 = toFiniteNumber(speed15Trim[i]);
      const sHd = toFiniteNumber(speedHdTrim[i]);
      const g15 = toFiniteNumber(gust15Trim[i]);
      const gHd = toFiniteNumber(gustHdTrim[i]);
      const d15 = toFiniteNumber(dir15Trim[i]);
      const dHd = toFiniteNumber(dirHdTrim[i]);

      const speed = s15 != null ? s15 : (sHd != null ? sHd : 0);
      const gust = g15 != null ? g15 : (gHd != null ? gHd : 0);
      const direction = d15 != null ? d15 : (dHd != null ? dHd : null);

      const fullKey = unixToModelKey(t);
      result.push({
        hour: formatModelTimestampToTime(fullKey),
        wind: Math.round((speed ?? 0) * 10) / 10,
        gust: Math.round((gust ?? 0) * 10) / 10,
        direction: direction == null ? null : Math.round(direction * 10) / 10,
        fullKey
      });
    }

    return result;
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

export default aromeProvider;
