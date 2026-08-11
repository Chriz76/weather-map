import { calculatewindSpeeds } from '../../src/utils/interpolation';

describe('interpolation utilities', () => {
    it('should return null forecast for invalid cluster payload', () => {
        const result = calculatewindSpeeds(null, null, null);
        expect(result.forecast).toBeNull();
        expect(result.windData).toBeNull();
    });

    it('should interpolate wind data for a valid cluster payload', () => {
        const latlng = { lat: 50.0, lng: 8.0 };
        const cluster = {
            lats: [50.0, 50.1, 49.9],
            lons: [8.0, 8.0, 8.0],
            timeline: {
                '20260706_12': {
                    speeds: [10, 12, 11],
                    dirs: [180, 190, 170],
                    gusts: [15, 16, 14]
                }
            }
        };

        const result = calculatewindSpeeds(latlng, cluster, '20260706_12');
        expect(result.windData).not.toBeNull();
        expect(result.windData.speed).toBeGreaterThan(0);
        expect(result.forecast).not.toBeNull();
        expect(result.forecast.length).toBe(1);
        expect(result.forecast[0].fullKey).toBe('20260706_12');
    });
});
