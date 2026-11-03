import aromeProvider from '../../src/weatherProvider/aromeProvider';

describe('aromeProvider fetchForecast', () => {
  it('parses open-meteo payload (sample)', async () => {
    const sample = {
      hourly: {
        time: [1786651200, 1786652100, 1786653000],
        wind_speed_10m_meteofrance_arome_france_15min: [4.3, 4.9, 5.2],
        wind_direction_10m_meteofrance_arome_france_15min: [47, 61, 70],
        wind_gusts_10m_meteofrance_arome_france_15min: [4.5, 6.4, 6.8],
        weather_code: [0, 2, 95],
        is_day: [0, 1, 1]
      }
    };

    // @ts-ignore
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(sample) }));

    const res = await aromeProvider.fetchForecast({ lat: 48.3, lng: 11.15 }, null);
    expect(res).not.toBeNull();
    if (res) {
      expect(res.length).toBe(3);
      expect(res[0].wind).toBe(4.3);
      expect(res[0].gust).toBe(4.5);
      expect(res[0].direction).toBe(47);
      expect(res[2].wind).toBe(5.2);
      expect(res[0].weatherCode).toBe(0);
      expect(res[0].isDay).toBe(false);
      expect(res[2].weatherCode).toBe(95);
      expect(res[2].isDay).toBe(true);
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
    expect(res?.[0].weatherCode).toBeNull();
    expect(res?.[0].isDay).toBeNull();
  });
});
