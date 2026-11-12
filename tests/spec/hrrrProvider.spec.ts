/**
 * Tests for the HRRR provider and the shared Open-Meteo payload reader.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hrrrProvider } from '../../src/weatherProvider/hrrrProvider';
import * as openMeteo from '../../src/weatherProvider/openMeteo';

const T0 = 1793207700;

/** Model key (`YYYYMMDD_HHmm`) the reader must derive from a unix timestamp. */
function modelKey(seconds: number): string {
  return new Date(seconds * 1000).toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 13);
}

function mockFetch(body: unknown, ok = true, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue({ ok, status, json: async () => body });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('openMeteo.readForecast', () => {
  it('reads the minutely_15 container into forecast items', () => {
    const forecast = openMeteo.readForecast({
      latitude: 39.75,
      longitude: -104.99,
      minutely_15: {
        time: [T0, T0 + 900],
        wind_speed_10m: [17.24, 12.06],
        wind_gusts_10m: [27.35, null],
        wind_direction_10m: [189, 192]
      }
    });

    expect(forecast!.items).toHaveLength(2);
    expect(forecast!.items[0]).toMatchObject({ fullKey: modelKey(T0), wind: 17.2, gust: 27.4, direction: 189 });
    expect(forecast!.items[1]).toMatchObject({ fullKey: modelKey(T0 + 900), wind: 12.1, gust: 0, direction: 192 });
    expect(forecast!.modelCell).toEqual({ lat: 39.75, lng: -104.99 });
  });

  it('reports no cell when the payload has no coordinates', () => {
    const forecast = openMeteo.readForecast({
      minutely_15: {
        time: [T0],
        wind_speed_10m: [10],
        wind_gusts_10m: [20],
        wind_direction_10m: [180]
      }
    });

    expect(forecast!.modelCell).toBeNull();
  });

  it('drops trailing steps without data', () => {
    const forecast = openMeteo.readForecast({
      minutely_15: {
        time: [T0, T0 + 900, T0 + 1800],
        wind_speed_10m: [10, null, null],
        wind_gusts_10m: [20, null, null],
        wind_direction_10m: [180, null, null]
      }
    });

    expect(forecast!.items).toHaveLength(1);
  });

  it('returns null for a payload without a known container', () => {
    expect(openMeteo.readForecast({ hourly_units: {} })).toBeNull();
    expect(openMeteo.readForecast('nope')).toBeNull();
  });

  it('annotates sub-hourly steps with the nearest hourly weather code', () => {
    const hourStart = 1793206800;
    const forecast = openMeteo.readForecast({
      minutely_15: {
        time: [hourStart, hourStart + 900, hourStart + 1800, hourStart + 2700],
        wind_speed_10m: [10, 11, 12, 13],
        wind_gusts_10m: [20, 21, 22, 23],
        wind_direction_10m: [180, 190, 200, 210]
      },
      hourly: {
        time: [hourStart, hourStart + 3600],
        weather_code: [3, 61],
        is_day: [1, 0]
      }
    });

    expect(forecast!.items).toHaveLength(4);
    expect(forecast!.items[0]).toMatchObject({ weatherCode: 3, isDay: true });
    expect(forecast!.items[1]).toMatchObject({ weatherCode: 3, isDay: true });
    expect(forecast!.items[2]).toMatchObject({ weatherCode: 61, isDay: false });
    expect(forecast!.items[3]).toMatchObject({ weatherCode: 61, isDay: false });
  });

  it('keeps the newest published hour for steps beyond the hourly window', () => {
    const hourStart = 1793206800;
    const forecast = openMeteo.readForecast({
      minutely_15: {
        time: [hourStart, hourStart + 7200],
        wind_speed_10m: [10, 11],
        wind_gusts_10m: [20, 21],
        wind_direction_10m: [180, 190]
      },
      hourly: {
        time: [hourStart],
        weather_code: [45],
        is_day: [0]
      }
    });

    expect(forecast!.items).toHaveLength(2);
    expect(forecast!.items[1]).toMatchObject({ weatherCode: 45, isDay: false });
  });

  it('leaves the weather fields null when the payload has no hourly container', () => {
    const forecast = openMeteo.readForecast({
      minutely_15: {
        time: [T0],
        wind_speed_10m: [10],
        wind_gusts_10m: [20],
        wind_direction_10m: [180]
      }
    });

    expect(forecast!.items[0]).toMatchObject({ weatherCode: null, isDay: null });
  });
});

describe('hrrrProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests the HRRR model with 15-minute wind series', async () => {
    const fetchMock = mockFetch({
      minutely_15: {
        time: [T0],
        wind_speed_10m: [15],
        wind_gusts_10m: [25],
        wind_direction_10m: [270]
      }
    });

    const forecast = await hrrrProvider.fetchForecast({ lat: 39, lng: -98 }, null);

    expect(forecast!.items).toHaveLength(1);
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain('models=gfs_hrrr');
    expect(url).toContain('minutely_15=');
    expect(url).toContain('hourly=weather_code,is_day');
    expect(url).toContain('latitude=39');
  });

  it('throws when Open-Meteo answers with an error status', async () => {
    mockFetch({}, false, 500);

    await expect(hrrrProvider.fetchForecast({ lat: 39, lng: -98 }, null)).rejects.toThrow('500');
  });

  it('returns null without a location', async () => {
    await expect(hrrrProvider.fetchForecast(null, null)).resolves.toBeNull();
  });

  it('reads index.json from the configured base URL', async () => {
    const fetchMock = mockFetch({
      api_version: '1.1.0',
      run: '20261028_1600',
      available_timestamps: ['20261028_1600'],
      tiles_url: 'runs/20261028_1600/tiles/{timestamp}/{z}/{x}/{y}.bin',
      format: { id: 'hrrr-wind-int16-delta', scale: 0.05 },
      pyramid: { max_zoom: 7, resolution_deg: 0.025 }
    });

    const index = await hrrrProvider.fetchIndex({ baseUrl: 'https://hrrr.b-cdn.net/' });

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('https://hrrr.b-cdn.net/index.json');
    expect(index.run).toBe('20261028_1600');
    expect(index.pyramid?.max_zoom).toBe(7);
    expect(index.format?.id).toBe('hrrr-wind-int16-delta');
  });
});
