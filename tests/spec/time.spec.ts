import { formatModelTimestampToTime, determineActiveIndex, findMatchingTimestampIndex } from '../../src/utils/time';

describe('time utilities', () => {
    it('should format timeline keys to local time string', () => {
        const result = formatModelTimestampToTime('20260706_12');
        expect(result).toMatch(/\d{1,2}:\d{2}/);
    });

    it('should choose the current or next timestamp index', () => {
        const now = new Date();
        const firstFuture = new Date(now.getTime() + 60 * 60 * 1000);
        const secondFuture = new Date(now.getTime() + 2 * 60 * 60 * 1000);

        const formatKey = (date) => {
            const year = date.getUTCFullYear();
            const month = String(date.getUTCMonth() + 1).padStart(2, '0');
            const day = String(date.getUTCDate()).padStart(2, '0');
            const hour = String(date.getUTCHours()).padStart(2, '0');
            return `${year}${month}${day}_${hour}`;
        };

        const currentKey = formatKey(firstFuture);
        const futureKey = formatKey(secondFuture);

        const index = determineActiveIndex([currentKey, futureKey], null);
        expect(index).toBe(0);
    });

    it('should match mixed hour-only and minute timestamps', () => {
        const timestamps = ['20260820_1715', '20260820_1730', '20260820_18'];

        // 17:15 is closer to the hour bucket start than 17:30, so it should win here.
        expect(findMatchingTimestampIndex(timestamps, '20260820_17')).toBe(0);
        expect(findMatchingTimestampIndex(timestamps, '20260820_1730')).toBe(1);
        // Minute-precision 18:00 should still resolve to the bare hour key.
        expect(findMatchingTimestampIndex(timestamps, '20260820_1800')).toBe(2);
    });
});
