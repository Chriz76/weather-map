import { weatherModel } from '../models/weatherModel.js';

/**
 * @typedef {import('../models/weatherModel.js').ErrorPayload} ErrorPayload
 */

/**
 * Manages transient error notification state and auto-clear behavior.
 */
class ErrorController {
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

    clearError() {
        this.clearTimeout();
        weatherModel.setShowError(null);
    }

    /**
     * Shows an error message. Normal strings auto-clear, modal/action payloads persist.
     * @param {string | ErrorPayload | null} payload
     * @returns {void}
     */
    showError(payload) {
        this.clearTimeout();
        weatherModel.setShowError(payload);

        if (!payload) return;

        // Unterscheiden: Ist es ein einfacher String oder eine komplexe Struktur?
        const isSimpleString = typeof payload === 'string';
        const isInteractive = typeof payload === 'object' && (payload.isModal || payload.action);

        // Auto-Clear-Timer NUR starten, wenn es ein unaufdringlicher Text-Fehler ohne Interaktion ist
        if (isSimpleString && !isInteractive) {
            this.timeoutId = window.setTimeout(() => {
                this.timeoutId = null;
                weatherModel.setShowError(null);
            }, this.timeoutMs);
        }
    }
}

export const errorController = new ErrorController();