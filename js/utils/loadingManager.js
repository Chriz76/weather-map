// utils/loadingManager.js
import { weatherModel } from '../weatherModel.js';

class LoadingManager {
    constructor(delayMs = 500) {
        this.delayMs = delayMs;
        this.timeout = null;
        this.activeTracks = 0; // Zähler, falls mal zwei User-Aktionen parallel laufen
    }

    /**
     * Startet den Verzögerungs-Timer für den Spinner
     */
    start() {
        this.activeTracks++;
        if (this.activeTracks === 1) {
            clearTimeout(this.timeout);
            this.timeout = setTimeout(() => {
                // Nutzt deine Methode aus dem gezeigten Code
                weatherModel.setIsActiveLoading(true);
            }, this.delayMs);
        }
    }

    /**
     * Stoppt den Spinner sofort
     */
    stop() {
        this.activeTracks = Math.max(0, this.activeTracks - 1);
        if (this.activeTracks === 0) {
            clearTimeout(this.timeout);
            weatherModel.setIsActiveLoading(false);
        }
    }

    /**
     * Ein "Decorator" für asynchrone Funktionen. 
     * Hüllt jede Funktion automatisch in das Start/Stop-Szenario
     * und meldet Fehler zentral an das weatherModel.
     */
    async track(asyncFn) {
        this.start();
        try {
            return await asyncFn();
         } finally {
            this.stop();
        }
    }
}

export const loadingManager = new LoadingManager(500);