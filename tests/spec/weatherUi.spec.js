import { UiModel } from '../../js/models/uiModel.js';

describe('UiModel', () => {
    it('should update loading, locating and overlay URL state', () => {
        let events = [];
        const ui = new UiModel((eventName, detail) => events.push({ eventName, detail }));

        ui.setIsActiveLoading(true);
        ui.setIsLocating(true);
        ui.setActiveOverlayUrl('https://example.com/overlay.png');

        expect(ui.isActiveLoading).toBeTrue();
        expect(ui.isLocating).toBeTrue();
        expect(ui.activeOverlayUrl).toBe('https://example.com/overlay.png');
        expect(events.some(e => e.eventName === 'ui:loading-changed')).toBeTrue();
        expect(events.some(e => e.eventName === 'ui:locating-changed')).toBeTrue();
        expect(events.some(e => e.eventName === 'ui:overlay-url-updated')).toBeTrue();
    });

    it('should update toast and dispatch toast event', () => {
        let lastEvent = null;
        const ui = new UiModel((eventName, detail) => {
            lastEvent = { eventName, detail };
        });

        ui.setToast('Test toast');
        expect(ui.toast).toBe('Test toast');
        expect(lastEvent).toEqual({ eventName: 'ui:toast-changed', detail: 'Test toast' });
    });
});
