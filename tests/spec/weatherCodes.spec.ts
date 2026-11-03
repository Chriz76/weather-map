import * as weatherCodes from '../../src/utils/weatherCodes';

describe('weather code mapping', () => {
  it('maps clear-sky codes to day and night icons', () => {
    expect(weatherCodes.getWeatherIconClass(0, true)).toBe('wi-day-sunny');
    expect(weatherCodes.getWeatherIconClass(0, false)).toBe('wi-night-clear');
  });

  it('treats a missing day/night flag as daytime', () => {
    expect(weatherCodes.getWeatherIconClass(2, null)).toBe('wi-day-cloudy');
    expect(weatherCodes.getWeatherIconClass(2, undefined)).toBe('wi-day-cloudy');
  });

  it('uses the same icon for day and night when the code has no variants', () => {
    expect(weatherCodes.getWeatherIconClass(3, true)).toBe('wi-cloudy');
    expect(weatherCodes.getWeatherIconClass(3, false)).toBe('wi-cloudy');
  });

  it('maps precipitation groups to their weather-icons classes', () => {
    expect(weatherCodes.getWeatherIconClass(55, false)).toBe('wi-night-alt-sprinkle');
    expect(weatherCodes.getWeatherIconClass(65, true)).toBe('wi-day-rain');
    expect(weatherCodes.getWeatherIconClass(86, false)).toBe('wi-night-alt-snow');
    expect(weatherCodes.getWeatherIconClass(99, true)).toBe('wi-day-hail');
  });

  it('returns null for unknown or missing codes', () => {
    expect(weatherCodes.getWeatherIconClass(null, true)).toBeNull();
    expect(weatherCodes.getWeatherIconClass(undefined, true)).toBeNull();
    expect(weatherCodes.getWeatherIconClass(42, true)).toBeNull();
  });

  it('describes known codes in English and falls back for unknown ones', () => {
    expect(weatherCodes.describeWeatherCode(0)).toBe('Clear sky');
    expect(weatherCodes.describeWeatherCode(65)).toBe('Heavy rain');
    expect(weatherCodes.describeWeatherCode(99)).toBe('Thunderstorm with heavy hail');
    expect(weatherCodes.describeWeatherCode(null)).toBe('Unknown conditions');
    expect(weatherCodes.describeWeatherCode(7)).toBe('Unknown conditions');
  });
});
