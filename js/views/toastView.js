import { uiModel } from '../models/uiModel.js';

export function registerToastView() {
    const toastEl = document.createElement('div');
    toastEl.className = 'toast';
    document.body.appendChild(toastEl);

    const renderToast = (payload) => {
        if (!payload || !payload.message) {
            toastEl.classList.remove('toast--visible');
            toastEl.textContent = '';
            return;
        }

        toastEl.textContent = payload.message;
        toastEl.classList.add('toast--visible');
    };

    const onToastChanged = () => {
        renderToast(uiModel.toast);
    };

    uiModel.addEventListener('ui:toast-changed', onToastChanged);
}
