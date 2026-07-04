import { weatherModel } from '../weatherModel.js';

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

    /**
     * Shows an error message and clears it again after the configured timeout.
     * @param {string|null} message
     * @returns {void}
     */
    showError(message) {
        this.clearTimeout();
        weatherModel.setShowError(message);

        if (message) {
            this.timeoutId = window.setTimeout(() => {
                this.timeoutId = null;
                weatherModel.setShowError(null);
            }, this.timeoutMs);
        }
    }
}

export const errorController = new ErrorController();
