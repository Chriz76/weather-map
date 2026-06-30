// views/toastView.js
import { weatherModel } from '../weatherModel.js';

/**
 * Registers the global Toast View for non-blocking error notifications.
 * @returns {void}
 */
export function registerToastView() {
    const toastEl = document.createElement('div');
    toastEl.className = 'toast-notification';
    document.body.appendChild(toastEl);

    /**
     * Blendet den Toast ein
     */
    const showToast = (message) => {
        toastEl.innerHTML = `<span class="toast-notification__icon">⚠️</span> ${message}`;
        toastEl.classList.add('toast-notification--visible');
    };

    /**
     * Blendet den Toast aus
     */
    const hideToast = () => {
        toastEl.classList.remove('toast-notification--visible');
    };

    // Event-Listener reagiert stur auf den Zustand im Model
    weatherModel.addEventListener('model:show-error-changed', (e) => {
        const errorMsg = e.detail;
        if (errorMsg) {
            showToast(errorMsg);
        } else {
            hideToast();
        }
    });
}