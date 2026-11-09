import { weatherProviderModel } from '../../src/models/weatherProviderModel';
import { uiStateModel } from '../../src/models/uiStateModel';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PointForecast } from '../../src/types';

describe('WeatherProviderModel', () => {
    /** Two-step point forecast; the grid cell is shared by both steps. */
    const pointForecast: PointForecast = {
        items: [
            { hour: '12:00', wind: 10, gust: 15, direction: 180, fullKey: '20260706_12' },
            { hour: '15:00', wind: 11, gust: 16, direction: 185, fullKey: '20260706_15' }
        ],
        modelCell: { lat: 50.02, lng: 8.01 }
    };

    function resetModel() {
        weatherProviderModel.removePointData();
        uiStateModel.setIsActiveLoading(false);
        uiStateModel.setIsLocating(false);
        uiStateModel.setActiveOverlayUrl(null);
        weatherProviderModel.setIndexMetadata({ available_timestamps: [], generated_at: null, current_hour: null });
    }

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-20T16:00:00Z'));
        resetModel();
    });

    afterEach(() => {
        resetModel();
        vi.useRealTimers();
    });

    it('should initialize with empty state', () => {
        expect(weatherProviderModel.availableTimestamps).toEqual([]);
        expect(weatherProviderModel.activeTimestamp).toBeNull();
        expect(weatherProviderModel.forecast).toBeNull();
        expect(weatherProviderModel.pointModelCell).toBeNull();
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

    it('should store point data and expose the forecast of the active timestamp', () => {
        weatherProviderModel.setIndexMetadata({ available_timestamps: ['20260706_12', '20260706_15'], generated_at: null, current_hour: null });

        weatherProviderModel.setPointData({ lat: 50.0, lng: 8.0 }, pointForecast);

        expect(weatherProviderModel.lastClickedLatLng).toEqual({ lat: 50.0, lng: 8.0 });
        expect(weatherProviderModel.pointModelCell).toEqual({ lat: 50.02, lng: 8.01 });
        expect(weatherProviderModel.windData).not.toBeNull();
        expect(weatherProviderModel.forecast).toBe(pointForecast.items);
        expect(weatherProviderModel.forecast!.length).toBe(2);
    });

    it('should tolerate mixed timestamp formats when matching forecast data', () => {
        weatherProviderModel.setIndexMetadata({ available_timestamps: ['20260820_17', '20260820_18'], generated_at: null, current_hour: null });

        weatherProviderModel.setPointData({ lat: 50.0, lng: 8.0 }, {
            items: [
                { hour: '17:15', wind: 11, gust: 15, direction: 180, fullKey: '20260820_1715' },
                { hour: '17:30', wind: 12, gust: 16, direction: 190, fullKey: '20260820_1730' }
            ],
            modelCell: null
        });

        expect(weatherProviderModel.activeTimestamp).toBe('20260820_17');
        expect(weatherProviderModel.windData).toEqual({ speed: 11, gust: 15, direction: 180 });
    });

    it('should change active timestamp index and dispatch timestamp event', () => {
        const events = [];
        const handler = (event) => {
            events.push({ type: event.type, detail: event.detail });
        };

        weatherProviderModel.addEventListener('model:timestamp-index-updated', handler);
        weatherProviderModel.setIndexMetadata({ available_timestamps: ['20260706_12', '20260706_15'], generated_at: null, current_hour: null });
        weatherProviderModel.setPointData({ lat: 50.0, lng: 8.0 }, pointForecast);

        weatherProviderModel.setActiveTimestampIndex(1);

        expect(weatherProviderModel.activeTimestamp).toBe('20260706_15');
        expect(events.some((e) => e.type === 'model:timestamp-index-updated')).toBeTruthy();
        expect(weatherProviderModel.forecast![0].fullKey).toBe('20260706_12');

        weatherProviderModel.removeEventListener('model:timestamp-index-updated', handler);
    });

    it('should remove point data and clear forecast, cell and wind data', () => {
        weatherProviderModel.setIndexMetadata({ available_timestamps: ['20260706_12'], generated_at: null, current_hour: null });
        weatherProviderModel.setPointData({ lat: 50.0, lng: 8.0 }, pointForecast);

        weatherProviderModel.removePointData();

        expect(weatherProviderModel.lastClickedLatLng).toBeNull();
        expect(weatherProviderModel.pointModelCell).toBeNull();
        expect(weatherProviderModel.forecast).toBeNull();
        expect(weatherProviderModel.windData).toBeNull();
    });
});
