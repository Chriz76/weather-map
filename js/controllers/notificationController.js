import { weatherModel } from '../models/weatherModel.js';

/**
 * @typedef {import('../models/weatherModel.js').ErrorPayload} ErrorPayload
 */

/**
 * Manages transient notification state and auto-clear behavior.
 */
class NotificationController {
    constructor(timeoutMs = 4000) {
        this.timeoutMs = timeoutMs;
        /** @type {number|null} */
        this.timeoutId = null;
    }

    clearTimeout() {
        if (this.timeoutId !== null) {
            window.clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }
    }

    clearNotification() {
        this.clearTimeout();
        weatherModel.setShowError(null);
    }

    /**
     * Shows a notification payload. Simple strings auto-clear, modal/action payloads persist.
     * @param {string | ErrorPayload | null} payload
     * @returns {void}
     */
    showNotification(payload) {
        this.clearTimeout();
        weatherModel.setShowError(payload);

        if (!payload) return;

        const isSimpleString = typeof payload === 'string';
        const isInteractive = typeof payload === 'object' && (payload.isModal || payload.action);

        if (isSimpleString && !isInteractive) {
            this.timeoutId = window.setTimeout(() => {
                this.timeoutId = null;
                weatherModel.setShowError(null);
            }, this.timeoutMs);
        }
    }
}

export const notificationController = new NotificationController();
