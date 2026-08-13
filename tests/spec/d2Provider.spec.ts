import { d2Provider } from '../../src/weatherProvider/d2Provider';

describe('d2Provider fetchForecast', () => {
  it('parses a small cluster and returns forecast items', async () => {
    // construct a tiny cluster with 3 points and two timestamps
    const cluster = {
      lats: [10.0, 10.1, 10.2],
      lons: [20.0, 20.1, 20.2],
      timeline: {
        '20260813_12': { speeds: [5, 6, 7], dirs: [90, 100, 110], gusts: [8, 9, 10] },
        '20260813_13': { speeds: [6, 7, 8], dirs: [95, 105, 115], gusts: [9, 10, 11] }
      }
    };

    // mock fetch to return the cluster JSON when called
    // @ts-ignore
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(cluster) }));

    const latlng = { lat: 10.05, lng: 20.05 };
    const config = { baseUrl: '/', imageBounds: [[10.0, 20.0]], gridCellSize: 1 };

    const result = await d2Provider.fetchForecast(latlng as any, config as any);

    expect(Array.isArray(result)).toBe(true);
    if (result) {
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('hour');
      expect(result[0]).toHaveProperty('wind');
      expect(result[0]).toHaveProperty('gust');
      expect(result[0]).toHaveProperty('direction');
      expect(result[0]).toHaveProperty('fullKey');
    }
  });
});
