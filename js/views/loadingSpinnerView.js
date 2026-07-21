// views/loadingSpinnerView.js
import { weatherUi } from '../models/weatherUiModel.js';

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

    // Create a dedicated backdrop for the spinner so it doesn't rely on notifications
    let backdropEl = document.querySelector('.loading-backdrop');
    if (!backdropEl) {
        backdropEl = document.createElement('div');
        backdropEl.className = 'loading-backdrop';
        document.body.appendChild(backdropEl);
    }

    // Make overlay focusable for modal focus management
    overlay.tabIndex = -1;
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
    toggleSpinner(weatherUi.isActiveLoading);

    weatherUi.addEventListener('ui:loading-changed', () => {
        const isLoading = weatherUi.isActiveLoading;
        const isModal = weatherUi.isLoadingModal;

        toggleSpinner(isLoading);

        if (isModal) {
            backdropEl.classList.add('loading-backdrop--visible');
            document.body.classList.add('body--modal-open');

            overlay.classList.add('loading-overlay--modal');
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-modal', 'true');
            overlay.setAttribute('aria-live', 'assertive');
        } else {
            backdropEl.classList.remove('loading-backdrop--visible');
            document.body.classList.remove('body--modal-open');

            overlay.classList.remove('loading-overlay--modal');
            overlay.removeAttribute('role');
            overlay.removeAttribute('aria-modal');
        }
    });
}