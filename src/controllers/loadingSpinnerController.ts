// controllers/loadingSpinnerController.ts
import { uiStateModel } from '../models/uiStateModel';

class LoadingSpinnerController {
    private delayMs: number;
    // `window.setTimeout` returns a numeric handle in the browser. The global `setTimeout`
    // resolves to `NodeJS.Timeout` here because @types/node is present.
    private timeout: number | null = null;
    private activeTracks: number = 0; // Zähler, falls mal zwei User-Aktionen parallel laufen
    private _modalActive: boolean = false;

    constructor(delayMs = 500) {
        this.delayMs = delayMs;
    }

    /**
     * Startet den Verzögerungs-Timer für den Spinner
     * @param {{ modal?: boolean }} [options]
     */
    start(options: { modal?: boolean } = {}): void {
        const modal = !!options.modal;
        this.activeTracks++;
        if (modal) {
            this._modalActive = true;
        }
        if (this.activeTracks === 1) {
            if (this.timeout !== null) {
                window.clearTimeout(this.timeout);
            }
            this.timeout = window.setTimeout(() => {
                uiStateModel.setIsActiveLoading(true, this._modalActive);
            }, this.delayMs);
        }
    }

    /**
     * Stoppt den Spinner sofort
     */
    stop(): void {
        this.activeTracks = Math.max(0, this.activeTracks - 1);
        if (this.activeTracks === 0) {
            if (this.timeout !== null) {
                window.clearTimeout(this.timeout);
            }
            uiStateModel.setIsActiveLoading(false, false);
            this._modalActive = false;
        }
    }

    /**
     * Ein "Decorator" für asynchrone Funktionen.
     * Hüllt jede Funktion automatisch in das Start/Stop-Szenario
     * und meldet Fehler zentral an das weatherProviderModel.
     */
    async track<T>(asyncFn: () => Promise<T>, options: { modal?: boolean } = {}): Promise<T> {
        this.start(options);
        try {
            const result = await asyncFn();
            this.stop();
            return result;
        } catch (err) {
            this.stop();
            throw err;
        }
    }
}

export const loadingSpinnerController = new LoadingSpinnerController(1000);
