// views/toastView.js
import { weatherModel } from '../models/weatherModel.js';

/**
 * Registers the global Toast View for error notifications and modal actions.
 * @returns {void}
 */
export function registerToastView() {
    const toastEl = document.createElement('div');
    toastEl.className = 'toast-notification';
    document.body.appendChild(toastEl);

    const backdropEl = document.createElement('div');
    backdropEl.className = 'toast-backdrop';
    document.body.appendChild(backdropEl);

    // Speichert den Namen des Events, das bei Klick gefeuert werden soll
    /** @type {string|null} */
    let activeActionEvent = null;

    // Klick-Event via Event Delegation
    toastEl.addEventListener('click', (e) => {
        const target = /** @type {HTMLElement} */ (e.target);
        if (target.classList.contains('toast-notification__btn') && activeActionEvent) {
            // 1. Custom-Event auf dem Model abfeuern
            weatherModel.dispatchEvent(new CustomEvent(activeActionEvent));
            
            // 2. Toast automatisch schließen
            weatherModel.setShowError(null);
        }
    });

    /**
     * Blendet den Toast und ggf. das Modal ein
     * @param {string | import('../models/weatherModel.js').ErrorPayload} payload
     */
    const showToast = (payload) => {
        // Normalisieren: Falls ein einfacher String kommt, in ein passendes Objekt umwandeln
        const config = typeof payload === 'string' 
            ? { message: payload, isModal: false } 
            : payload;

        // Event-Name wegsichern, falls eine Action definiert ist
        activeActionEvent = config.action?.event || null;

        // Semantische Rollen für Screenreader anpassen
        if (config.isModal) {
            toastEl.setAttribute('role', 'dialog');
            toastEl.setAttribute('aria-modal', 'true');
        } else {
            toastEl.setAttribute('role', 'alert');
            toastEl.removeAttribute('aria-modal');
        }

        // Button HTML nur erzeugen, wenn das action-Objekt existiert
        let buttonHtml = '';
        if (config.action) {
            buttonHtml = `<button class="toast-notification__btn">${config.action.text}</button>`;
        }

        // UI befüllen
        toastEl.innerHTML = `
            <div class="toast-notification__content">
                <span class="toast-notification__icon">⚠️</span>
                <span class="toast-notification__text">${config.message}</span>
            </div>
            ${buttonHtml}
        `;

        // Modal-Zustand steuern
        if (config.isModal) {
            backdropEl.classList.add('toast-backdrop--visible');
            document.body.classList.add('body--modal-open');
            
            // Fokus-Steuerung: Fokus auf den Button zwingen, sobald er im DOM existiert
            // Das verhindert, dass Tastatur-User im Hintergrund weiterklicken können
            window.setTimeout(() => {
                const btn = toastEl.querySelector('.toast-notification__btn');
                if (btn) /** @type {HTMLElement} */ (btn).focus();
            }, 50);
        } else {
            backdropEl.classList.remove('toast-backdrop--visible');
            document.body.classList.remove('body--modal-open');
        }

        toastEl.classList.add('toast-notification--visible');
    };

    const hideToast = () => {
        toastEl.classList.remove('toast-notification--visible');
        backdropEl.classList.remove('toast-backdrop--visible');
        document.body.classList.remove('body--modal-open');
        
        // Semantische Attribute aufräumen
        toastEl.removeAttribute('role');
        toastEl.removeAttribute('aria-modal');
        activeActionEvent = null;
    };

    /**
     * @param {Event} e
     */
    const onShowErrorChanged = (e) => {
        const customEvent = /** @type {CustomEvent} */ (e);
        const payload = customEvent.detail;
        if (payload) {
            showToast(payload);
        } else {
            hideToast();
        }
    };

    weatherModel.addEventListener('model:show-error-changed', onShowErrorChanged);
}