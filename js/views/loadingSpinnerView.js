// views/loadingSpinnerView.js
import { weatherModel } from '../weatherModel.js';

/**
 * Initializes the global loading spinner view and binds it to model updates.
 * @returns {void}
 */
export function registerLoadingView() {
    // 1. Erstelle das Overlay-Element (BEM-Pattern)
    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    
    // Kleines feines CSS-Spinner-Element im Inneren
    overlay.innerHTML = `
        <div class="loading-overlay__spinner"></div>
    `;
    
    // In den Body einfügen, damit es über der Karte und allen Controls liegt
    document.body.appendChild(overlay);

    /**
     * Schaltet die Sichtbarkeit des Overlays basierend auf dem Modellzustand
     * @param {boolean} isLoading 
     */
    const toggleSpinner = (isLoading) => {
        if (isLoading) {
            overlay.classList.add('loading-overlay--visible');
        } else {
            overlay.classList.remove('loading-overlay--visible');
        }
    };

    // Initialen Zustand setzen (falls beim Laden direkt aktiv)
    toggleSpinner(weatherModel.isActiveLoading);

    // 2. Event-Listener: Lausche direkt auf das Modell
    weatherModel.addEventListener('model:active-loading-changed', (e) => {
        const isLoading = e.detail;
        toggleSpinner(isLoading);
    });
}