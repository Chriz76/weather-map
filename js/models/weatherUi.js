/**
 * @typedef {{ text: string, event: string }} NotificationAction
 * @typedef {{ message: string, isModal?: boolean, action?: NotificationAction }} NotificationPayload
 * @typedef {{ activeTimestampIndex: number, activeOverlayUrl: string|null, isLocating: boolean, isActiveLoading: boolean, notification: string | NotificationPayload | null }} UIState
 */

export class WeatherUi {
    /**
     * @param {(eventName: string, detail: any) => void} dispatchEvent
     */
    constructor(dispatchEvent) {
        /** @type {UIState} */
        this._ui = {
            activeTimestampIndex: 0,
            activeOverlayUrl: null,
            isLocating: false,
            isActiveLoading: false,
            notification: null
        };

        this._dispatchEvent = dispatchEvent;
    }

    get activeTimestampIndex() {
        return this._ui.activeTimestampIndex;
    }

    set activeTimestampIndex(value) {
        this._ui.activeTimestampIndex = value;
    }

    get activeOverlayUrl() {
        return this._ui.activeOverlayUrl;
    }

    get isLocating() {
        return this._ui.isLocating;
    }

    get isActiveLoading() {
        return this._ui.isActiveLoading;
    }

    get notification() {
        return this._ui.notification;
    }

    /**
     * @param {string | NotificationPayload | null} payload
     */
    setNotification(payload) {
        this._ui.notification = payload;
        this._dispatchEvent('model:show-notification-changed', payload);
    }

    /**
     * @param {boolean} value
     */
    setIsActiveLoading(value) {
        this._ui.isActiveLoading = value;
        this._dispatchEvent('model:active-loading-changed', value);
    }

    /**
     * @param {boolean} value
     */
    setIsLocating(value) {
        this._ui.isLocating = value;
        this._dispatchEvent('model:locating-changed', value);
    }

    /**
     * @param {string|null} url
     */
    setActiveOverlayUrl(url) {
        this._ui.activeOverlayUrl = url;
        this._dispatchEvent('model:overlay-url-updated', url);
    }
}
