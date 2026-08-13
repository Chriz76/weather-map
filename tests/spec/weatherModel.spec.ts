import { weatherProviderModel } from '../../src/models/weatherProviderModel';
import { uiStateModel } from '../../src/models/uiStateModel';
import { uiStateModel } from '../../src/models/uiStateModel';

describe('WeatherProviderModel', () => {
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
        weatherProviderModel.removePointData();
        uiStateModel.setIsActiveLoading(false);
        uiStateModel.setIsLocating(false);
        uiStateModel.setActiveOverlayUrl(null);
        weatherProviderModel.setIndexMetadata({ available_timestamps: [], generated_at: null, current_hour: null });
    }

    beforeEach(() => {
        resetModel();
    });

    afterEach(() => {
        resetModel();
    });

    it('should initialize with empty state', () => {
        expect(weatherProviderModel.availableTimestamps).toEqual([]);
        expect(weatherProviderModel.activeTimestamp).toBeNull();
        expect(weatherProviderModel.forecast).toBeNull();
        expect(weatherProviderModel.windData).toBeNull();
    });

    it('should set index metadata and choose active timestamp', () => {
        const metadata = {
            available_timestamps: ['20990706_12', '20990706_15'],
            generated_at: '2099-07-06T12:00:00Z',
            current_hour: '12'
        };

        weatherProviderModel.setIndexMetadata(metadata);

        expect(weatherProviderModel.availableTimestamps).toEqual(['20990706_12', '20990706_15']);
        expect(weatherProviderModel.activeTimestamp).toBe('20990706_12');
        expect(weatherProviderModel.modelGeneratedAt).toBe('2099-07-06T12:00:00Z');
        expect(weatherProviderModel.modelCurrentHour).toBe('12');
    });

    it('should update point data and recalculate forecast', () => {
        weatherProviderModel.setIndexMetadata({ available_timestamps: ['20260706_12', '20260706_15'], generated_at: null, current_hour: null });

        weatherProviderModel.setPointData({ lat: 50.0, lng: 8.0 }, cluster);

        expect(weatherProviderModel.lastClickedLatLng).toEqual({ lat: 50.0, lng: 8.0 });
        expect(weatherProviderModel.currentClusterData).toBe(cluster);
        expect(weatherProviderModel.windData).not.toBeNull();
        expect(weatherProviderModel.forecast).not.toBeNull();
        expect(weatherProviderModel.forecast.length).toBe(2);
    });

    it('should change active timestamp index and dispatch timestamp event', () => {
        const events = [];
        const handler = (event) => {
            events.push({ type: event.type, detail: event.detail });
        };

        weatherProviderModel.addEventListener('model:timestamp-index-updated', handler);
        weatherProviderModel.setIndexMetadata({ available_timestamps: ['20260706_12', '20260706_15'], generated_at: null, current_hour: null });
        weatherProviderModel.setPointData({ lat: 50.0, lng: 8.0 }, cluster);

        weatherProviderModel.setActiveTimestampIndex(1);

        expect(weatherProviderModel.activeTimestamp).toBe('20260706_15');
        expect(events.some((e) => e.type === 'model:timestamp-index-updated')).toBeTruthy();
        expect(weatherProviderModel.forecast[0].fullKey).toBe('20260706_12');

        weatherProviderModel.removeEventListener('model:timestamp-index-updated', handler);
    });

    it('should remove point data and clear forecast and wind data', () => {
        weatherProviderModel.setIndexMetadata({ available_timestamps: ['20260706_12'], generated_at: null, current_hour: null });
        weatherProviderModel.setPointData({ lat: 50.0, lng: 8.0 }, cluster);

        weatherProviderModel.removePointData();

        expect(weatherProviderModel.lastClickedLatLng).toBeNull();
        expect(weatherProviderModel.currentClusterData).toBeNull();
        expect(weatherProviderModel.forecast).toBeNull();
        expect(weatherProviderModel.windData).toBeNull();
    });
});
