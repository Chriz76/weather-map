import { UiStateModel } from '../../src/models/uiStateModel';

describe('UiStateModel', () => {
    it('should update loading, locating and overlay URL state', () => {
        let events = [];
        const ui = new UiStateModel((eventName, detail) => events.push({ eventName, detail }));

        ui.setIsActiveLoading(true);
        ui.setIsLocating(true);
        ui.setActiveOverlayUrl('https://example.com/overlay.png');

        expect(ui.isActiveLoading).toBeTruthy();
        expect(ui.isLocating).toBeTruthy();
        expect(ui.activeOverlayUrl).toBe('https://example.com/overlay.png');
        expect(events.some(e => e.eventName === 'ui:loading-changed')).toBeTruthy();
        expect(events.some(e => e.eventName === 'ui:locating-changed')).toBeTruthy();
        expect(events.some(e => e.eventName === 'ui:overlay-url-updated')).toBeTruthy();
    });

    it('should update toast and dispatch toast event', () => {
        let lastEvent = null;
        const ui = new UiStateModel((eventName, detail) => {
            lastEvent = { eventName, detail };
        });

        ui.setToast('Test toast');
        expect(ui.toast).toBe('Test toast');
        expect(lastEvent).toEqual({ eventName: 'ui:toast-changed', detail: 'Test toast' });
    });
});
