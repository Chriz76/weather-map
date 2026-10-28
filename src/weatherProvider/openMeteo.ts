import { formatModelTimestampToTime } from '../utils/time';
import * as parsing from '../utils/parsing';
import type { ForecastItem } from '../types';

/**
 * Reader for Open-Meteo wind payloads, shared by the providers that take their point forecast
 * from Open-Meteo.
 *
 * Import as a namespace so call sites stay explicit, e.g. `openMeteo.readForecast(payload)`.
 */

/** Payload containers Open-Meteo uses, best resolution first. */
const CONTAINER_KEYS = ['minutely_15', 'minutely15', 'hourly'] as const;

/** Series names of the requested wind fields. */
const SPEED_KEY = 'wind_speed_10m';
const DIRECTION_KEY = 'wind_direction_10m';
const GUST_KEY = 'wind_gusts_10m';

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

/**
 * Converts an Open-Meteo wind payload into the app's forecast series.
 *
 * Accepts the `minutely_15`, `minutely15` and `hourly` containers, because the resolution depends
 * on the requested model rather than on the endpoint. Trailing steps the model has not published
 * yet are dropped: they carry an array of nulls, and the timeline would otherwise end in "--:--".
 * @param payload Parsed JSON body of an Open-Meteo response.
 * @returns One entry per published step, or null when the payload is not a wind response.
 */
export function readForecast(payload: unknown): ForecastItem[] | null {
  if (!parsing.isObject(payload)) return null;

  let container: Record<string, unknown> | null = null;
  for (const key of CONTAINER_KEYS) {
    const candidate = payload[key];
    if (parsing.isObject(candidate)) {
      container = candidate;
      break;
    }
  }
  if (!container) return null;

  const times = container['time'];
  if (!parsing.isUnknownArray(times)) return null;

  const speeds = parsing.toNumberOrNullSeries(container[SPEED_KEY]);
  const directions = parsing.toNumberOrNullSeries(container[DIRECTION_KEY]);
  const gusts = parsing.toNumberOrNullSeries(container[GUST_KEY]);

  let lastIndex = -1;
  for (let i = times.length - 1; i >= 0; i--) {
    if (speeds[i] != null || gusts[i] != null || directions[i] != null) {
      lastIndex = i;
      break;
    }
  }
  if (lastIndex === -1) return null;

  const result: ForecastItem[] = [];
  for (let i = 0; i <= lastIndex; i++) {
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
