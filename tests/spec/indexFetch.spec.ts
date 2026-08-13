import aromeProvider from '../../src/weatherProvider/aromeProvider';
import d2Provider from '../../src/weatherProvider/d2Provider';

describe('index fetch parsing', () => {
  it('parses weather-data index.json', async () => {
    const sample = {
      generated_at: '2026-08-13T19:36:49.370401Z',
      available_timestamps: ['20260813_1900','20260813_1915','20260813_1930'],
      current_hour: '20260813_1900',
      step_type: '15min',
      api_version: '1.1.0'
    };

    // @ts-ignore
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(sample) }));

    const idx = await aromeProvider.fetchIndex({ baseUrl: 'https://chriz76.github.io/weather-data/' });
    expect(idx.available_timestamps).toBeDefined();
    expect(idx.available_timestamps && idx.available_timestamps.length).toBeGreaterThan(0);
    expect(idx.current_hour).toBe('20260813_1900');
  });

  it('parses winddata index.json', async () => {
    const sample = {
      generated_at: '2026-08-13T19:44:05.925195Z',
      available_timestamps: ['20260813_15','20260813_16','20260813_17'],
      current_hour: '20260813_19',
      api_version: '1.1.0'
    };

    // @ts-ignore
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(sample) }));

    const idx = await d2Provider.fetchIndex({ baseUrl: 'https://winddata.pages.dev/' });
    expect(idx.available_timestamps).toBeDefined();
    expect(idx.available_timestamps && idx.available_timestamps[0]).toBe('20260813_15');
    expect(idx.current_hour).toBe('20260813_19');
  });
});
