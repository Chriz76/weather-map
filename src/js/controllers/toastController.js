import { uiStateModel } from '../models/uiStateModel';

/**
 * @typedef {{ message: string }} ToastPayload
 */

class ToastController {
    constructor(defaultTimeoutMs = 4000) {
        this.defaultTimeoutMs = defaultTimeoutMs;
        /** @type {number|null} */
        this.timeoutId = null;
    }

    clearTimeout() {
        if (this.timeoutId !== null) {
            window.clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }
    }

    clearToast() {
        this.clearTimeout();
        uiStateModel.setToast(null);
    }

    /**
     * Shows a toast using the model's toast payload shape.
     * @param {ToastPayload | string | null} payload
     * @param {number} [timeout] Auto-clear timeout in ms. Defaults to controller default. 0 = persistent
     * @returns {void}
     */
    showToast(payload, timeout) {
        this.clearTimeout();

        const toastPayload = typeof payload === 'string'
            ? { message: payload }
            : payload;

        if (!toastPayload || !toastPayload.message) {
            uiStateModel.setToast(null);
            return;
        }

        uiStateModel.setToast(toastPayload);

        const effectiveTimeout = typeof timeout === 'number' ? timeout : this.defaultTimeoutMs;
        if (effectiveTimeout > 0) {
            this.timeoutId = window.setTimeout(() => {
                this.timeoutId = null;
                uiStateModel.setToast(null);
            }, effectiveTimeout);
        }
    }
}

export const toastController = new ToastController();
