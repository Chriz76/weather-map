import { weatherModel } from '../../js/models/weatherModel.js';

describe('WeatherModel', () => {
    const cluster = {
        lats: [50.0, 50.1, 49.9],
        lons: [8.0, 8.0, 8.0],
        timeline: {
            '20260706_12': {
                speeds: [10, 12, 11],
                dirs: [180, 190, 170],
                gusts: [15, 16, 14]
            },
            '20260706_15': {
                speeds: [11, 13, 12],
                dirs: [185, 195, 175],
                gusts: [16, 17, 15]
            }
        }
    };

    function resetModel() {
        weatherModel.removePointData();
        weatherModel.setNotification(null);
        weatherModel.setIsActiveLoading(false);
        weatherModel.setIsLocating(false);
        weatherModel.setActiveOverlayUrl(null);
        weatherModel.setIndexMetadata({ available_timestamps: [], generated_at: null, current_hour: null });
    }

    beforeEach(() => {
        resetModel();
    });

    afterEach(() => {
        resetModel();
    });

    it('should initialize with empty state', () => {
        expect(weatherModel.availableTimestamps).toEqual([]);
        expect(weatherModel.activeTimestamp).toBeNull();
        expect(weatherModel.forecast).toBeNull();
        expect(weatherModel.windData).toBeNull();
    });

    it('should set index metadata and choose active timestamp', () => {
        const metadata = {
            available_timestamps: ['20990706_12', '20990706_15'],
            generated_at: '2099-07-06T12:00:00Z',
            current_hour: '12'
        };

        weatherModel.setIndexMetadata(metadata);

        expect(weatherModel.availableTimestamps).toEqual(['20990706_12', '20990706_15']);
        expect(weatherModel.activeTimestamp).toBe('20990706_12');
        expect(weatherModel.modelGeneratedAt).toBe('2099-07-06T12:00:00Z');
        expect(weatherModel.modelCurrentHour).toBe('12');
    });

    it('should update point data and recalculate forecast', () => {
        weatherModel.setIndexMetadata({ available_timestamps: ['20260706_12', '20260706_15'], generated_at: null, current_hour: null });

        weatherModel.setPointData({ lat: 50.0, lng: 8.0 }, cluster);

        expect(weatherModel.lastClickedLatLng).toEqual({ lat: 50.0, lng: 8.0 });
        expect(weatherModel.currentClusterData).toBe(cluster);
        expect(weatherModel.windData).not.toBeNull();
        expect(weatherModel.forecast).not.toBeNull();
        expect(weatherModel.forecast.length).toBe(2);
    });

    it('should change active timestamp index and dispatch timestamp event', () => {
        const events = [];
        const handler = (event) => {
            events.push({ type: event.type, detail: event.detail });
        };

        weatherModel.addEventListener('model:timestamp-index-updated', handler);
        weatherModel.setIndexMetadata({ available_timestamps: ['20260706_12', '20260706_15'], generated_at: null, current_hour: null });
        weatherModel.setPointData({ lat: 50.0, lng: 8.0 }, cluster);

        weatherModel.setActiveTimestampIndex(1);

        expect(weatherModel.activeTimestamp).toBe('20260706_15');
        expect(events.some((e) => e.type === 'model:timestamp-index-updated')).toBeTrue();
        expect(weatherModel.forecast[0].fullKey).toBe('20260706_12');

        weatherModel.removeEventListener('model:timestamp-index-updated', handler);
    });

    it('should remove point data and clear forecast and wind data', () => {
        weatherModel.setIndexMetadata({ available_timestamps: ['20260706_12'], generated_at: null, current_hour: null });
        weatherModel.setPointData({ lat: 50.0, lng: 8.0 }, cluster);

        weatherModel.removePointData();

        expect(weatherModel.lastClickedLatLng).toBeNull();
        expect(weatherModel.currentClusterData).toBeNull();
        expect(weatherModel.forecast).toBeNull();
        expect(weatherModel.windData).toBeNull();
    });
});
