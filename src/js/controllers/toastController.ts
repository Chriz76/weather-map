import { uiStateModel } from '../models/uiStateModel';

export type ToastPayload = { message: string };

class ToastController {
    private defaultTimeoutMs: number;
    private timeoutId: number | null = null;

    constructor(defaultTimeoutMs = 4000) {
        this.defaultTimeoutMs = defaultTimeoutMs;
    }

    private clearTimeout(): void {
        if (this.timeoutId !== null) {
            window.clearTimeout(this.timeoutId as unknown as number);
            this.timeoutId = null;
        }
    }

    clearToast(): void {
        this.clearTimeout();
        uiStateModel.setToast(null);
    }

    /**
     * Shows a toast using the model's toast payload shape.
     * @param {ToastPayload | string | null} payload
     * @param {number} [timeout] Auto-clear timeout in ms. Defaults to controller default. 0 = persistent
     */
    showToast(payload: ToastPayload | string | null, timeout?: number): void {
        this.clearTimeout();

        const toastPayload: ToastPayload | null = typeof payload === 'string'
            ? { message: payload }
            : (payload as ToastPayload | null);

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
            }, effectiveTimeout) as unknown as number;
        }
    }
}

export const toastController = new ToastController();
