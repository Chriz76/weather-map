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

    // Abruf ohne explizites Modell -> Nutzt Open-Meteo Seamless Blending im 15-Minuten-Raster
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latlng.lat}&longitude=${latlng.lng}&hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m&models=meteofrance_arome_seamless&forecast_days=4&timeformat=unixtime&wind_speed_unit=kn&forecast_hours=8&past_hours=2&temporal_resolution=native&${CACHE_BUSTER}`;
  
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

    // Greift flexibel auf hourly, minutely15 ODER minutely_15 zu
    const m15 = isObject(payload)
      ? (isObject(payload.hourly) ? payload.hourly : isObject(payload.minutely15) ? payload.minutely15 : isObject(payload.minutely_15) ? payload.minutely_15 : null)
      : null;

    if (!m15 || !Array.isArray(m15.time)) {
      throw new Error('Open-Meteo payload invalid');
    }

    const times = Array.isArray(m15.time) ? m15.time : [];
    const speeds = asNumberArray(m15.wind_speed_10m);
    const directions = asNumberArray(m15.wind_direction_10m);
    const gusts = asNumberArray(m15.wind_gusts_10m);

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
      const anyValue = (speeds[i] != null) || (gusts[i] != null) || (directions[i] != null);
      if (anyValue) { 
        lastIdx = i; 
        break; 
      }
    }

    if (lastIdx === -1) return null;

    const result: ForecastItem[] = [];
    for (let i = 0; i <= lastIdx; i++) {
      const t = toFiniteNumber(times[i]) ?? 0;
      const speed = speeds[i];
      const gust = gusts[i];
      const direction = directions[i];

      const fullKey = unixToModelKey(t);
      result.push({
        hour: formatModelTimestampToTime(fullKey),
        wind: speed == null ? 0 : Math.round(speed * 10) / 10,
        gust: gust == null ? 0 : Math.round(gust * 10) / 10,
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
