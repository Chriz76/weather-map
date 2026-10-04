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
});
