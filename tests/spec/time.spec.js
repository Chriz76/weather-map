import { formatToLocalTimeString, determineActiveIndex } from '../../js/utils/time.js';

describe('time utilities', () => {
    it('should format timeline keys to local time string', () => {
        const result = formatToLocalTimeString('20260706_12');
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
});
