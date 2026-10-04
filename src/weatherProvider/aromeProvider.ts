import { formatModelTimestampToTime } from '../utils/time';
import * as parsing from '../utils/parsing';
import { fetchIndexData } from './indexData';
import { AROME } from './providerIds';
import type { ForecastItem, IndexData, LatLng } from '../types';

export const ID = AROME;

const CACHE_BUSTER = `cb=${Date.now()}`;

/** Open-Meteo series keys to try, in order; the first one present in the payload wins. */
const SPEED_KEYS = ['wind_speed_10m', 'wind_speed_10m_meteofrance_arome_france_15min', 'wind_speed_10m_meteofrance_arome_seamless'];
const DIRECTION_KEYS = ['wind_direction_10m', 'wind_direction_10m_meteofrance_arome_france_15min', 'wind_direction_10m_meteofrance_arome_seamless'];
const GUST_KEYS = ['wind_gusts_10m', 'wind_gusts_10m_meteofrance_arome_france_15min', 'wind_gusts_10m_meteofrance_arome_seamless'];

/** Returns the first key that holds an array in `source`. */
function pickSeries(source: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = source[key];
    if (parsing.isUnknownArray(value)) return value;
  }
  return null;
}

/** Reads the payload container from any of the Open-Meteo resolution variants. */
function pickPayloadContainer(payload: unknown): Record<string, unknown> | null {
  if (!parsing.isObject(payload)) return null;
  for (const key of ['hourly', 'minutely15', 'minutely_15']) {
    const candidate = payload[key];
    if (parsing.isObject(candidate)) return candidate;
  }
  return null;
}

/** Formats a unix timestamp (seconds) as the model key `YYYYMMDD_HHmm`. */
function unixToModelKey(seconds: number): string {
  const date = new Date(seconds * 1000);
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${year}${month}${day}_${hours}${minutes}`;
}

export const aromeProvider = {
  id: ID,

  async fetchIndex(config: Record<string, unknown>): Promise<IndexData> {
    const baseUrlRaw = config['baseUrl'];
    return fetchIndexData(parsing.isString(baseUrlRaw) ? baseUrlRaw : '');
  },

  async fetchForecast(latlng: LatLng | null, config: Record<string, unknown> | null): Promise<ForecastItem[] | null> {
    if (!latlng) return null;

    // Requesting without an explicit model makes Open-Meteo use seamless blending on a 15-minute grid.
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latlng.lat}&longitude=${latlng.lng}&hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m&models=meteofrance_arome_seamless&forecast_days=4&timeformat=unixtime&wind_speed_unit=kn&forecast_hours=31&past_hours=2&temporal_resolution=native&${CACHE_BUSTER}`;

    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Open-Meteo request failed (${res.status})`);
    const payload: unknown = await res.json();

    // Flexibly reads hourly, minutely15, or minutely_15 payloads.
    const container = pickPayloadContainer(payload);
    const times = container ? container['time'] : null;

    if (!container || !parsing.isUnknownArray(times)) {
      throw new Error('Open-Meteo payload invalid');
    }

    const speeds = parsing.toNumberOrNullSeries(pickSeries(container, SPEED_KEYS));
    const directions = parsing.toNumberOrNullSeries(pickSeries(container, DIRECTION_KEYS));
    const gusts = parsing.toNumberOrNullSeries(pickSeries(container, GUST_KEYS));

    let lastIdx = -1;
    for (let i = times.length - 1; i >= 0; i--) {
      if (speeds[i] != null || gusts[i] != null || directions[i] != null) {
        lastIdx = i;
        break;
      }
    }

    if (lastIdx === -1) return null;

    const result: ForecastItem[] = [];
    for (let i = 0; i <= lastIdx; i++) {
      const timestamp = parsing.toFiniteNumber(times[i]) ?? 0;
      const speed = speeds[i] ?? null;
      const gust = gusts[i] ?? null;
      const direction = directions[i] ?? null;

      const fullKey = unixToModelKey(timestamp);
      result.push({
        hour: formatModelTimestampToTime(fullKey),
        wind: speed == null ? 0 : Math.round(speed * 10) / 10,
        gust: gust == null ? 0 : Math.round(gust * 10) / 10,
        direction: direction == null ? null : Math.round(direction * 10) / 10,
        fullKey
      });
    }

    return result;
  }
};

export default aromeProvider;
