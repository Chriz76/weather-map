/**
 * Tests for the ICON-D2 provider, which reads its point forecast from Open-Meteo.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { d2Provider } from '../../src/weatherProvider/d2Provider';

const T0 = 1794150900;

/** Model key (`YYYYMMDD_HHmm`) the reader must derive from a unix timestamp. */
function modelKey(seconds: number): string {
  return new Date(seconds * 1000).toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 13);
}

function mockFetch(body: unknown, ok = true, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue({ ok, status, json: async () => body });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('d2Provider fetchForecast', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests the explicit ICON-D2 RUC model with hourly wind and weather series', async () => {
    const fetchMock = mockFetch({
      latitude: 50.61,
      longitude: 8.2,
      hourly: {
        time: [T0],
        wind_speed_10m: [5.1],
        wind_gusts_10m: [8.2],
        wind_direction_10m: [90],
        weather_code: [3],
        is_day: [1]
      }
    });

    const forecast = await d2Provider.fetchForecast({ lat: 50.6, lng: 8.19 }, null);

    expect(forecast!.items).toHaveLength(1);
    expect(forecast!.items[0]).toMatchObject({
      fullKey: modelKey(T0),
      wind: 5.1,
      gust: 8.2,
      direction: 90,
      weatherCode: 3,
      isDay: true
    });
    // The cell is reported once per request, not on every step.
    expect(forecast!.modelCell).toEqual({ lat: 50.61, lng: 8.2 });
    expect(forecast!.items[0]).not.toHaveProperty('modelLat');

    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain('models=dwd_icon_d2_ruc_native');
    expect(url).toContain('hourly=');
    expect(url).not.toContain('minutely_15');
    expect(url).toContain('weather_code');
    expect(url).toContain('latitude=50.6');
    expect(url).toContain('cell_selection=nearest');
  });

  it('keeps the weather codes of the hourly wind container', async () => {
    mockFetch({
      hourly: {
        time: [T0, T0 + 3600, T0 + 7200, T0 + 10800],
        wind_speed_10m: [5, 6, 7, 8],
        wind_gusts_10m: [8, 9, 10, 11],
        wind_direction_10m: [90, 95, 100, 105],
        weather_code: [3, 3, 61, 61],
        is_day: [1, 1, 0, 0]
      }
    });

    const forecast = await d2Provider.fetchForecast({ lat: 50.6, lng: 8.19 }, null);

    // Model keys are UTC, so this also pins the hourly spacing independent of the test timezone.
    expect(forecast!.items.map((item) => item.fullKey)).toEqual(
      [T0, T0 + 3600, T0 + 7200, T0 + 10800].map(modelKey)
    );
    expect(forecast!.items.map((item) => item.weatherCode)).toEqual([3, 3, 61, 61]);
    expect(forecast!.items.map((item) => item.isDay)).toEqual([true, true, false, false]);
  });

  it('throws when Open-Meteo answers with an error status', async () => {
    mockFetch({}, false, 500);

    await expect(d2Provider.fetchForecast({ lat: 50.6, lng: 8.19 }, null)).rejects.toThrow('500');
  });

  it('returns null without a location', async () => {
    await expect(d2Provider.fetchForecast(null, null)).resolves.toBeNull();
  });

  it('reads index.json from the configured base URL', async () => {
    const fetchMock = mockFetch({
      api_version: '1.1.0',
      available_timestamps: ['20261108_15']
    });

    const index = await d2Provider.fetchIndex({ baseUrl: 'https://chriz76.github.io/icond2ruc-data/' });

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('https://chriz76.github.io/icond2ruc-data/index.json');
    expect(index.available_timestamps).toEqual(['20261108_15']);
  });
});
