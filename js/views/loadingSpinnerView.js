// views/loadingSpinnerView.js
import { weatherModel } from '../models/weatherModel.js';

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
    toggleSpinner(weatherModel.isActiveLoading);

    // 2. Event-Listener: Lausche auf das Modell; payload kann boolean oder { isLoading, modal }
    weatherModel.addEventListener('model:active-loading-changed', /** @param {Event} e */ (e) => {
        const customEvent = /** @type {CustomEvent<boolean|{isLoading:boolean, modal?:boolean}>} */ (e);
        const detail = customEvent.detail;
        let isLoading = false;
        let isModal = false;
        if (typeof detail === 'object' && detail !== null) {
            isLoading = !!detail.isLoading;
            isModal = !!detail.modal;
        } else {
            isLoading = !!detail;
        }

        toggleSpinner(isLoading);

        if (isModal) {
            backdropEl.classList.add('loading-backdrop--visible');
            document.body.classList.add('body--modal-open');

            overlay.classList.add('loading-overlay--modal');
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-modal', 'true');

            // Don't programmatically move keyboard focus here — focusing the overlay
            // caused a visible browser focus ring (the square outline).
            // Screenreaders still get semantics via role/aria-modal.
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