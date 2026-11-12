/**
 * Tests for the AROME provider, which reads its point forecast through the shared Open-Meteo
 * reader.
 *
 * The sample mirrors a live `models=meteofrance_arome_seamless` response: plain series names in
 * the `hourly` container, carrying 15-minute steps inside the model area.
 */
import aromeProvider from '../../src/weatherProvider/aromeProvider';

describe('aromeProvider fetchForecast', () => {
  it('parses open-meteo payload (sample)', async () => {
    const sample = {
      latitude: 48.35,
      longitude: 10.9,
      hourly: {
        time: [1786651200, 1786652100, 1786653000],
        wind_speed_10m: [4.3, 4.9, 5.2],
        wind_direction_10m: [47, 61, 70],
        wind_gusts_10m: [4.5, 6.4, 6.8],
        weather_code: [0, 2, 95],
        is_day: [0, 1, 1]
      }
    };

    // @ts-ignore
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(sample) }));

    const res = await aromeProvider.fetchForecast({ lat: 48.3, lng: 11.15 }, null);
    expect(res).not.toBeNull();
    if (res) {
      expect(res.items.length).toBe(3);
      expect(res.items[0].wind).toBe(4.3);
      expect(res.items[0].gust).toBe(4.5);
      expect(res.items[0].direction).toBe(47);
      expect(res.items[2].wind).toBe(5.2);
      expect(res.items[0].weatherCode).toBe(0);
      expect(res.items[0].isDay).toBe(false);
      expect(res.items[2].weatherCode).toBe(95);
      expect(res.items[2].isDay).toBe(true);
      // The grid cell belongs to the request, not to a single step.
      expect(res.modelCell).toEqual({ lat: 48.35, lng: 10.9 });
    }
  });

  it('leaves weather fields null when the payload has no weather_code/is_day', async () => {
    const sample = {
      hourly: {
        time: [1786651200],
        wind_speed_10m: [7.1],
        wind_direction_10m: [210],
        wind_gusts_10m: [9.4]
      }
    };

    // @ts-ignore
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(sample) }));

    const res = await aromeProvider.fetchForecast({ lat: 48.3, lng: 11.15 }, null);
    expect(res).not.toBeNull();
    expect(res?.items[0].weatherCode).toBeNull();
    expect(res?.items[0].isDay).toBeNull();
  });

  it('throws when the payload carries no wind series', async () => {
    // @ts-ignore
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ hourly_units: {} }) }));

    await expect(aromeProvider.fetchForecast({ lat: 48.3, lng: 11.15 }, null)).rejects.toThrow('Open-Meteo payload invalid');
  });
});
