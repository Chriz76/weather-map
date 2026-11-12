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
    mockFetch({
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
  });

  it('returns an empty index for non-object payloads', async () => {
    mockFetch('nope');
    await expect(fetchIndexData('https://example.test/')).resolves.toEqual({});
  });

  it('throws when the endpoint responds with a non-OK status', async () => {
    mockFetch({}, false, 404);
    await expect(fetchIndexData('https://example.test/')).rejects.toThrow('404');
  });

  it('keeps the tile metadata blocks', async () => {
    mockFetch({
      api_version: '1.1.0',
      run: '20261027_1500',
      tiles_url: 'runs/20261027_1500/tiles/{timestamp}/{z}/{x}/{y}.bin',
      bounds: { west: -134.096, south: 21.138, east: -60.918, north: 50.1 },
      pyramid: { min_zoom: 0, max_zoom: 7, resolution_deg: 0.025, tile_ext: 'bin', unknown: 1 },
      format: { id: 'hrrr-wind-int16-delta', encoding: 'gzip', scale: 0.05, sentinel: -20000 },
      coverage: { '7': { '16': [[44, 46], [48, 43]], x: [[1, 2]] }, '5': { x: [[1, 2]] } }
    });

    await expect(fetchIndexData('https://example.test/')).resolves.toEqual({
      api_version: '1.1.0',
      run: '20261027_1500',
      tiles_url: 'runs/20261027_1500/tiles/{timestamp}/{z}/{x}/{y}.bin',
      bounds: { west: -134.096, south: 21.138, east: -60.918, north: 50.1 },
      pyramid: { min_zoom: 0, max_zoom: 7, resolution_deg: 0.025, tile_ext: 'bin' },
      format: { id: 'hrrr-wind-int16-delta', encoding: 'gzip', scale: 0.05, sentinel: -20000 },
      // Ranges are normalised and non-numeric tile indices dropped.
      coverage: { '7': { '16': [[44, 46], [43, 48]] } }
    });
  });

  it('drops malformed tile blocks instead of failing the index', async () => {
    mockFetch({
      api_version: '1.1.0',
      bounds: { west: -134.096 },
      pyramid: { max_zoom: 'seven' },
      format: [],
      coverage: { '7': { '16': 'nope' }, five: { '16': [[1, 2]] } }
    });

    await expect(fetchIndexData('https://example.test/')).resolves.toEqual({
      api_version: '1.1.0'
    });
  });
});
