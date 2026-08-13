import { fetchWindDataForStation } from '../../src/services/measurementsService';

describe('measurementsService BrightSky parsing', () => {
  it('parses sample brightsky payload', async () => {
    const sample = {
      weather: {
        source_id: 333218,
        timestamp: '2026-08-13T20:00:00+00:00',
        cloud_cover: 0,
        condition: 'dry',
        dew_point: 6.9,
        wind_direction_10: 90,
        wind_speed_10: 7.2,
        wind_gust_speed_10: null,
        pressure_msl: 1021.5,
        temperature: 20.4,
        icon: 'clear-night'
      }
    };

    // @ts-ignore
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(sample) }));

    const data = await fetchWindDataForStation('02905', { forceRefresh: true });
    expect(data).not.toBeNull();
    if (data) {
      // 7.2 km/h -> knots ~= 3.9 (rounded to 1 decimal)
      expect(data.speed).toBe( Math.round(7.2 * 0.539957 * 10) / 10 );
      expect(data.direction).toBe(90);
      expect(data.gust).toBeNull();
      expect(data.temperature).toBe(20.4);
      expect(data.timestamp).toBe('2026-08-13T20:00:00+00:00');
    }
  });
});
