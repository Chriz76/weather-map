import { WeatherUi } from '../../js/models/weatherUi.js';

describe('WeatherUi', () => {
    it('should update loading, locating and overlay URL state', () => {
        let events = [];
        const ui = new WeatherUi((eventName, detail) => events.push({ eventName, detail }));

        ui.setIsActiveLoading(true);
        ui.setIsLocating(true);
        ui.setActiveOverlayUrl('https://example.com/overlay.png');

        expect(ui.isActiveLoading).toBeTrue();
        expect(ui.isLocating).toBeTrue();
        expect(ui.activeOverlayUrl).toBe('https://example.com/overlay.png');
        expect(events.some(e => e.eventName === 'model:active-loading-changed')).toBeTrue();
        expect(events.some(e => e.eventName === 'model:locating-changed')).toBeTrue();
        expect(events.some(e => e.eventName === 'model:overlay-url-updated')).toBeTrue();
    });

    it('should update toast and dispatch toast event', () => {
        let lastEvent = null;
        const ui = new WeatherUi((eventName, detail) => {
            lastEvent = { eventName, detail };
        });

        ui.setToast('Test toast');
        expect(ui.toast).toBe('Test toast');
        expect(lastEvent).toEqual({ eventName: 'model:show-toast-changed', detail: 'Test toast' });
    });
});
