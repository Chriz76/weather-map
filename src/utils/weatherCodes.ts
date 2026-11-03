/**
 * WMO weather-code helpers for the Open-Meteo based providers.
 *
 * Open-Meteo reports `weather_code` as a subset of WMO 4677. This module maps those
 * codes to Weather Icons classes (erikflowers/weather-icons, SIL OFL 1.1 / MIT,
 * see README) and to short English descriptions used as tooltip/aria text.
 *
 * Import as a namespace so call sites stay explicit:
 * `import * as weatherCodes from '../utils/weatherCodes';`
 */

/**
 * Codes that share one icon. `night: null` marks a day-agnostic icon.
 *
 * Day/night is only distinguished where it carries information; the icon is picked
 * from `is_day` in the Open-Meteo payload.
 */
const ICON_GROUPS: ReadonlyArray<{ codes: readonly number[]; day: string; night: string | null }> = [
  { codes: [0], day: 'wi-day-sunny', night: 'wi-night-clear' },
  { codes: [1], day: 'wi-day-sunny-overcast', night: 'wi-night-partly-cloudy' },
  { codes: [2], day: 'wi-day-cloudy', night: 'wi-night-alt-cloudy' },
  { codes: [3], day: 'wi-cloudy', night: null },
  { codes: [45, 48], day: 'wi-day-fog', night: 'wi-night-fog' },
  { codes: [51, 53, 55], day: 'wi-day-sprinkle', night: 'wi-night-alt-sprinkle' },
  { codes: [56, 57, 66, 67], day: 'wi-day-rain-mix', night: 'wi-night-alt-rain-mix' },
  { codes: [61, 63, 65], day: 'wi-day-rain', night: 'wi-night-alt-rain' },
  { codes: [71, 73, 75, 77, 85, 86], day: 'wi-day-snow', night: 'wi-night-alt-snow' },
  { codes: [80, 81, 82], day: 'wi-day-showers', night: 'wi-night-alt-showers' },
  { codes: [95], day: 'wi-day-thunderstorm', night: 'wi-night-alt-thunderstorm' },
  { codes: [96, 99], day: 'wi-day-hail', night: 'wi-night-alt-hail' }
];

/** Flattened `code -> icon classes` lookup, built once at module load. */
const ICON_CLASSES = new Map<number, { day: string; night: string | null }>();
for (const group of ICON_GROUPS) {
  for (const code of group.codes) {
    ICON_CLASSES.set(code, { day: group.day, night: group.night });
  }
}

/** English condition text per WMO code. */
const DESCRIPTIONS: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  56: 'Light freezing drizzle',
  57: 'Dense freezing drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  66: 'Light freezing rain',
  67: 'Heavy freezing rain',
  71: 'Slight snowfall',
  73: 'Moderate snowfall',
  75: 'Heavy snowfall',
  77: 'Snow grains',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail'
};

const UNKNOWN_DESCRIPTION = 'Unknown conditions';

/**
 * Resolves the Weather Icons CSS class for a WMO weather code.
 *
 * @param code Open-Meteo `weather_code` (may be `null` outside the model horizon).
 * @param isDay Day/night flag from Open-Meteo; anything other than `false` is treated as day.
 * @returns A class such as `wi-day-rain`, or `null` when the code is unknown so callers
 * can render a placeholder.
 */
export function getWeatherIconClass(code: number | null | undefined, isDay: boolean | null | undefined): string | null {
  if (code == null || !Number.isFinite(code)) return null;

  const entry = ICON_CLASSES.get(Math.trunc(code));
  if (entry === undefined) return null;

  if (entry.night !== null && isDay === false) return entry.night;
  return entry.day;
}

/**
 * Returns the English description for a WMO weather code.
 *
 * @param code Open-Meteo `weather_code`.
 * @returns Description text, or a neutral fallback for unknown/missing codes.
 */
export function describeWeatherCode(code: number | null | undefined): string {
  if (code == null || !Number.isFinite(code)) return UNKNOWN_DESCRIPTION;
  return DESCRIPTIONS[Math.trunc(code)] ?? UNKNOWN_DESCRIPTION;
}
