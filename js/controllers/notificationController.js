import { weatherModel } from '../models/weatherModel.js';

/**
 * @typedef {import('../models/weatherModel.js').NotificationPayload} NotificationPayload
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
        weatherModel.setNotification(null);
    }

    /**
     * Shows a notification using the model's `NotificationPayload` shape. `timeout` controls auto-clear.
     * @param {NotificationPayload} payload
     * @param {number} [timeout] Auto-clear timeout in ms. Defaults to controller default. 0 = persistent
     * @returns {void}
     */
    showNotification(payload, timeout) {
        this.clearTimeout();

        if (!payload || !payload.message) {
            weatherModel.setNotification(null);
            return;
        }

        // Payload is already in model shape: { message, isModal?, action? }
        weatherModel.setNotification(payload);

        const effectiveTimeout = typeof timeout === 'number' ? timeout : this.timeoutMs;

        if (effectiveTimeout > 0) {
            this.timeoutId = window.setTimeout(() => {
                this.timeoutId = null;
                weatherModel.setNotification(null);
            }, effectiveTimeout);
        }
    }
}

export const notificationController = new NotificationController();
