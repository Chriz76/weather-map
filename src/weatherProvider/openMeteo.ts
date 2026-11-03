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

/**
 * Weather series. Open-Meteo publishes `weather_code` and `is_day` at hourly resolution only,
 * so 15-minute wind steps are annotated with the nearest published hour.
 */
const HOURLY_CONTAINER_KEYS = ['hourly'] as const;
const WEATHER_CODE_KEY = 'weather_code';
const IS_DAY_KEY = 'is_day';

/** Half an hour in seconds; later sub-hourly steps round up to the next hourly value. */
const HALF_HOUR_SECONDS = 1800;

/** Weather fields attached to one forecast step. */
type StepWeather = { weatherCode: number | null; isDay: boolean | null };

const NO_WEATHER: StepWeather = { weatherCode: null, isDay: null };

/** Returns the first container (in key order) that holds an object. */
function findContainer(payload: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> | null {
  for (const key of keys) {
    const candidate = payload[key];
    if (parsing.isObject(candidate)) return candidate;
  }
  return null;
}

/** Collects the hourly weather codes, keyed by the hour start in unix seconds. */
function readHourlyWeather(payload: Record<string, unknown>): Map<number, StepWeather> {
  const weather = new Map<number, StepWeather>();
  const hourly = findContainer(payload, HOURLY_CONTAINER_KEYS);
  if (!hourly) return weather;

  const times = hourly['time'];
  if (!parsing.isUnknownArray(times)) return weather;

  const codes = parsing.toNumberOrNullSeries(hourly[WEATHER_CODE_KEY]);
  const dayFlags = parsing.toNumberOrNullSeries(hourly[IS_DAY_KEY]);

  for (let i = 0; i < times.length; i++) {
    const timestamp = parsing.toFiniteNumber(times[i]);
    if (timestamp == null) continue;

    const code = codes[i] ?? null;
    const dayFlag = dayFlags[i] ?? null;
    weather.set(timestamp, {
      weatherCode: code == null ? null : Math.round(code),
      isDay: dayFlag == null ? null : dayFlag >= 1
    });
  }

  return weather;
}

/**
 * Picks the hourly weather entry closest to a (possibly sub-hourly) step timestamp.
 *
 * The hourly window can end before the 15-minute window, so a missing hour falls back to the
 * newest published hour before the step instead of leaving the tail of the table empty.
 */
function pickWeather(weather: Map<number, StepWeather>, timestamp: number): StepWeather {
  const hourStart = Math.floor(timestamp / 3600) * 3600;
  const nearestHour = timestamp - hourStart >= HALF_HOUR_SECONDS ? hourStart + 3600 : hourStart;
  const direct = weather.get(nearestHour) ?? weather.get(hourStart) ?? weather.get(hourStart + 3600);
  if (direct !== undefined) return direct;

  let newestKey = Number.NEGATIVE_INFINITY;
  let newest: StepWeather | undefined;
  for (const [key, value] of weather) {
    if (key <= timestamp && key > newestKey) {
      newestKey = key;
      newest = value;
    }
  }

  return newest ?? NO_WEATHER;
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

/**
 * Converts an Open-Meteo wind payload into the app's forecast series.
 *
 * Accepts the `minutely_15`, `minutely15` and `hourly` containers, because the resolution depends
 * on the requested model rather than on the endpoint. Trailing steps the model has not published
 * yet are dropped: they carry an array of nulls, and the timeline would otherwise end in "--:--".
 * Sub-hourly steps inherit `weather_code`/`is_day` from the neighbouring hourly container.
 * @param payload Parsed JSON body of an Open-Meteo response.
 * @returns One entry per published step, or null when the payload is not a wind response.
 */
export function readForecast(payload: unknown): ForecastItem[] | null {
  if (!parsing.isObject(payload)) return null;

  const container = findContainer(payload, CONTAINER_KEYS);
  if (!container) return null;

  const times = container['time'];
  if (!parsing.isUnknownArray(times)) return null;

  const speeds = parsing.toNumberOrNullSeries(container[SPEED_KEY]);
  const directions = parsing.toNumberOrNullSeries(container[DIRECTION_KEY]);
  const gusts = parsing.toNumberOrNullSeries(container[GUST_KEY]);
  const weather = readHourlyWeather(payload);

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
    const stepWeather = pickWeather(weather, timestamp);
    const fullKey = unixToModelKey(timestamp);

    result.push({
      hour: formatModelTimestampToTime(fullKey),
      wind: speed == null ? 0 : Math.round(speed * 10) / 10,
      gust: gust == null ? 0 : Math.round(gust * 10) / 10,
      direction: direction == null ? null : Math.round(direction * 10) / 10,
      weatherCode: stepWeather.weatherCode,
      isDay: stepWeather.isDay,
      fullKey
    });
  }

  return result;
}
