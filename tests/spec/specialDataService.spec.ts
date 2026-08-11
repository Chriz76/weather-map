import { buildSpecialDataSummary, selectForecastEntries } from '../../src/services/specialDataService';

describe('special data service', () => {
    it('should build a summary from today, tomorrow and the day after', () => {
        const entries = [
            { day: '2026-07-26', foehn_probability_pct: 4.5 },
            { day: '2026-07-27', foehn_probability_pct: 9.6 },
            { day: '2026-07-28', foehn_probability_pct: 12.3 },
            { day: '2026-07-29', foehn_probability_pct: 0.2 }
        ];

        const selection = selectForecastEntries(entries, '2026-07-26');
        expect(selection.length).toBe(3);
        expect(buildSpecialDataSummary(selection)).toBe('4/10/12%');
    });
});
