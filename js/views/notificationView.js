// views/notificationView.js
import { weatherModel } from '../models/weatherModel.js';

/**
 * Registers the global Notification View for error notifications and modal actions.
 * @returns {void}
 */
export function registerNotificationView() {
    const notificationEl = document.createElement('div');
    notificationEl.className = 'notification';
    document.body.appendChild(notificationEl);

    const backdropEl = document.createElement('div');
    backdropEl.className = 'notification-backdrop';
    document.body.appendChild(backdropEl);

    // Speichert den Namen des Events, das bei Klick gefeuert werden soll
    /** @type {string|null} */
    let activeActionEvent = null;

    // Klick-Event via Event Delegation
    notificationEl.addEventListener('click', (e) => {
        const target = /** @type {HTMLElement} */ (e.target);
        if (target.classList.contains('notification__btn') && activeActionEvent) {
            // 1. Fire a DOM-level custom event on window so controllers can respond
            window.dispatchEvent(new CustomEvent(activeActionEvent));
            // Note: Do NOT mutate model from the view. The controller will close the notification.
        }
    });

    /**
     * Blendet die Notification und ggf. das Modal ein
     * @param {string | import('../models/weatherModel.js').NotificationPayload} payload
     */
    const showNotification = (payload) => {
        // Normalisieren: Falls ein einfacher String kommt, in ein passendes Objekt umwandeln
        const config = typeof payload === 'string' 
            ? { message: payload, isModal: false } 
            : payload;

        // Event-Name wegsichern, falls eine Action definiert ist
        activeActionEvent = config.action?.event || null;

        // Semantische Rollen für Screenreader anpassen
        if (config.isModal) {
            notificationEl.setAttribute('role', 'dialog');
            notificationEl.setAttribute('aria-modal', 'true');
        } else {
            notificationEl.setAttribute('role', 'alert');
            notificationEl.removeAttribute('aria-modal');
        }

        // Button HTML nur erzeugen, wenn das action-Objekt existiert
        let buttonHtml = '';
        if (config.action) {
            buttonHtml = `<button class="notification__btn">${config.action.text}</button>`;
        }

        // UI befüllen. Message als reiner Text setzen (verhindert HTML-Injection)
        notificationEl.innerHTML = `
            <div class="notification__content">
                <span class="notification__icon">⚠️</span>
                <span class="notification__text"></span>
            </div>
            ${buttonHtml}
        `;

        const textEl = notificationEl.querySelector('.notification__text');
        if (textEl) {
            textEl.textContent = config.message ?? '';
        }

        // Modal-Zustand steuern
        if (config.isModal) {
            backdropEl.classList.add('notification-backdrop--visible');
            document.body.classList.add('body--modal-open');
            
            // Fokus-Steuerung: Fokus auf den Button zwingen, sobald er im DOM existiert
            // Das verhindert, dass Tastatur-User im Hintergrund weiterklicken können
            window.setTimeout(() => {
                const btn = notificationEl.querySelector('.notification__btn');
                if (btn) /** @type {HTMLElement} */ (btn).focus();
            }, 50);
        } else {
            backdropEl.classList.remove('notification-backdrop--visible');
            document.body.classList.remove('body--modal-open');
        }

        notificationEl.classList.add('notification--visible');
    };

    const hideNotification = () => {
        notificationEl.classList.remove('notification--visible');
        backdropEl.classList.remove('notification-backdrop--visible');
        document.body.classList.remove('body--modal-open');
        
        // Semantische Attribute aufräumen
        notificationEl.removeAttribute('role');
        notificationEl.removeAttribute('aria-modal');
        activeActionEvent = null;
    };

    /**
     * @param {Event} e
     */
    const onnotificationChanged = (e) => {
        const customEvent = /** @type {CustomEvent} */ (e);
        const payload = customEvent.detail;
        if (payload) {
            showNotification(payload);
        } else {
            hideNotification();
        }
    };

    weatherModel.addEventListener('model:show-notification-changed', onnotificationChanged);
}