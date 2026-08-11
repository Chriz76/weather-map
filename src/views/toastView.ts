import { uiStateModel } from '../models/uiStateModel';

export function registerToastView(): void {
  const toastEl = document.createElement('div');
  toastEl.className = 'toast';
  document.body.appendChild(toastEl);
  const renderToast = (payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      toastEl.classList.remove('toast--visible');
      toastEl.textContent = '';
      return;
    }

    const p = payload as { message?: string };
    if (!p.message) {
      toastEl.classList.remove('toast--visible');
      toastEl.textContent = '';
      return;
    }

    toastEl.textContent = p.message;
    toastEl.classList.add('toast--visible');
  };

  const onToastChanged = () => renderToast(uiStateModel.toast);

  uiStateModel.addEventListener('ui:toast-changed', onToastChanged as EventListener);
}
