/**
 * TODO: minimal smoke test for src/weatherProvider/indexData.ts, added because the module is new.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchIndexData } from '../../src/weatherProvider/indexData';

function mockFetch(body: unknown, ok = true, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue({ ok, status, json: async () => body });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('fetchIndexData', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps only the known index fields', async () => {
    const fetchMock = mockFetch({
      generated_at: '2099-07-06T12:00:00Z',
      available_timestamps: ['20990706_12', 42, '20990706_15'],
      current_hour: '12',
      api_version: '1.1.0',
      unexpected_key: 'ignored'
    });

    await expect(fetchIndexData('https://example.test/')).resolves.toEqual({
      generated_at: '2099-07-06T12:00:00Z',
      available_timestamps: ['20990706_12', '20990706_15'],
      current_hour: '12',
      api_version: '1.1.0'
    });

    // The index is rewritten per run, so it is fetched from a fresh URL.
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/example\.test\/index\.json\?cb=\d+$/),
      { cache: 'no-cache' }
    );
  });

  it('reads the run, the tile template and the pyramid metadata', async () => {
    mockFetch({
      run: '20990706_1200',
      tiles_url: 'runs/20990706_1200/tiles/{timestamp}/{z}/{x}/{y}.bin',
      bounds: { west: -134.096114, south: 21.138, east: -60.918, north: 52.615565, extra: 'dropped' },
      pyramid: { min_zoom: 0, max_zoom: 7, finest_stride: 1, resolution_deg: 0.025, tile_ext: 'bin' },
      format: { id: 'hrrr-wind-int16-delta', version: 1, encoding: 'gzip', scale: 0.05, sentinel: -20000, layout: 'dropped' }
    });

    await expect(fetchIndexData('https://example.test/')).resolves.toEqual({
      run: '20990706_1200',
      tiles_url: 'runs/20990706_1200/tiles/{timestamp}/{z}/{x}/{y}.bin',
      bounds: { west: -134.096114, south: 21.138, east: -60.918, north: 52.615565 },
      pyramid: { min_zoom: 0, max_zoom: 7, resolution_deg: 0.025, tile_ext: 'bin' },
      format: { id: 'hrrr-wind-int16-delta', version: 1, encoding: 'gzip', scale: 0.05, sentinel: -20000 }
    });
  });

  it('parses the coverage block and drops malformed entries', async () => {
    mockFetch({
      coverage: {
        '7': { '16': [[44, 46]], '17': [[43, 48], [48, 43]], '18': 'nope', x: [[1, 2]] },
        '6': { '8': [[21, 24]] },
        level: { '1': [[0, 0]] }
      }
    });

    const index = await fetchIndexData('https://example.test/');
    expect(index.coverage).toEqual({
      '7': { '16': [[44, 46]], '17': [[43, 48], [43, 48]] },
      '6': { '8': [[21, 24]] }
    });
  });

  it('drops the coverage block when no level survives validation', async () => {
    mockFetch({ coverage: { '7': { '16': 'nope' } } });
    await expect(fetchIndexData('https://example.test/')).resolves.toEqual({});
  });

  it('returns an empty index for non-object payloads', async () => {
    mockFetch('nope');
    await expect(fetchIndexData('https://example.test/')).resolves.toEqual({});
  });

  it('throws when the endpoint responds with a non-OK status', async () => {
    mockFetch({}, false, 404);
    await expect(fetchIndexData('https://example.test/')).rejects.toThrow('404');
  });
});
