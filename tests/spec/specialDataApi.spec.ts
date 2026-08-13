import { selectForecastEntries, buildSpecialDataSummary } from '../../src/services/specialDataService';

const sample = {
  created_utc: '2026-08-13T19:19:54Z',
  forecast: [
    { day: '2026-08-14', foehn_probability_pct: 0.2 },
    { day: '2026-08-13', foehn_probability_pct: 0.2 },
    { day: '2026-08-12', foehn_probability_pct: 0.2 },
    { day: '2026-08-11', foehn_probability_pct: 0.3 },
    { day: '2026-08-10', foehn_probability_pct: 3.6 },
    { day: '2026-08-09', foehn_probability_pct: 0.2 },
    { day: '2026-08-08', foehn_probability_pct: 0.2 },
    { day: '2026-08-07', foehn_probability_pct: 0.1 },
    { day: '2026-08-06', foehn_probability_pct: 0.2 },
    { day: '2026-08-05', foehn_probability_pct: 0.3 }
  ]
};

describe('special data API payload', () => {
  it('parses sample payload and builds summary for 2026-08-12', () => {
    const entries = selectForecastEntries(sample.forecast as unknown as unknown[], '2026-08-12');
    expect(entries.length).toBe(3);
    // values are small decimals -> rounded to 0
    expect(buildSpecialDataSummary(entries)).toBe('0/0/0%');
  });
});
