import { uiStateModel } from '../models/uiStateModel';

export function registerToastView(): void {
  const toastEl = document.createElement('div');
  toastEl.className = 'toast';
  document.body.appendChild(toastEl);

  const renderToast = (payload: any) => {
    if (!payload || !payload.message) {
      toastEl.classList.remove('toast--visible');
      toastEl.textContent = '';
      return;
    }

    toastEl.textContent = payload.message;
    toastEl.classList.add('toast--visible');
  };

  const onToastChanged = () => renderToast(uiStateModel.toast as any);

  uiStateModel.addEventListener('ui:toast-changed', onToastChanged as EventListener);
}
