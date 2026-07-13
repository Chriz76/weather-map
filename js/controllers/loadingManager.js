// utils/loadingManager.js
import { weatherModel } from '../models/weatherModel.js';

class LoadingManager {
    constructor(delayMs = 500) {
        this.delayMs = delayMs;
        this.timeout = null;
        this.activeTracks = 0; // Zähler, falls mal zwei User-Aktionen parallel laufen
        this._modalActive = false;
    }

    /**
     * Startet den Verzögerungs-Timer für den Spinner
     */
    /**
     * Startet den Verzögerungs-Timer für den Spinner
     * @param {{ modal?: boolean }} [options]
     */
    start(options = {}) {
        const modal = !!options.modal;
        this.activeTracks++;
        if (modal) {
            this._modalActive = true;
        }
        if (this.activeTracks === 1) {
            if (this.timeout !== null) {
                clearTimeout(this.timeout);
            }
            this.timeout = setTimeout(() => {
                weatherModel.setIsActiveLoading(true, this._modalActive);
            }, this.delayMs);
        }
    }

    /**
     * Stoppt den Spinner sofort
     */
    stop() {
        this.activeTracks = Math.max(0, this.activeTracks - 1);
        if (this.activeTracks === 0) {
            if (this.timeout !== null) {
                clearTimeout(this.timeout);
            }
            weatherModel.setIsActiveLoading(false, false);
            this._modalActive = false;
        }
    }

    /**
     * Ein "Decorator" für asynchrone Funktionen. 
     * Hüllt jede Funktion automatisch in das Start/Stop-Szenario
     * und meldet Fehler zentral an das weatherModel.
     */
    /**
     * @param {() => Promise<any>} asyncFn
     */
    async track(asyncFn, options = {}) {
        this.start(options);
        try {
            return await asyncFn();
         } finally {
            this.stop();
        }
    }
}

export const loadingManager = new LoadingManager(1000);