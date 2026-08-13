import aromeProvider from '../../src/weatherProvider/aromeProvider';

describe('aromeProvider fetchForecast', () => {
  it('parses open-meteo payload (sample)', async () => {
    const sample = {
      hourly: {
        time: [1786651200, 1786652100, 1786653000],
        wind_speed_10m_meteofrance_arome_france_15min: [4.3, 4.9, 5.2],
        wind_direction_10m_meteofrance_arome_france_15min: [47, 61, 70],
        wind_gusts_10m_meteofrance_arome_france_15min: [4.5, 6.4, 6.8]
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
    }
  });
});
