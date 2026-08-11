import { uiStateModel } from '../models/uiStateModel';

export function registerLoadingView(): void {
  const overlay = document.createElement('div');
  overlay.className = 'loading-overlay';
  overlay.innerHTML = `
        <div class="loading-overlay__spinner"></div>
    `;
  document.body.appendChild(overlay);

  let backdropEl = document.querySelector('.loading-backdrop') as HTMLElement | null;
  if (!backdropEl) {
    backdropEl = document.createElement('div');
    backdropEl.className = 'loading-backdrop';
    document.body.appendChild(backdropEl);
  }

  overlay.tabIndex = -1;

  const toggleSpinner = (isLoading: boolean) => {
    if (isLoading) overlay.classList.add('loading-overlay--visible');
    else overlay.classList.remove('loading-overlay--visible');
  };

  toggleSpinner(uiStateModel.isActiveLoading);

  uiStateModel.addEventListener('ui:loading-changed', () => {
    const isLoading = uiStateModel.isActiveLoading;
    const isModal = uiStateModel.isLoadingModal;

    toggleSpinner(isLoading);

    if (isModal) {
      backdropEl!.classList.add('loading-backdrop--visible');
      document.body.classList.add('body--modal-open');

      overlay.classList.add('loading-overlay--modal');
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-live', 'assertive');
    } else {
      backdropEl!.classList.remove('loading-backdrop--visible');
      document.body.classList.remove('body--modal-open');

      overlay.classList.remove('loading-overlay--modal');
      overlay.removeAttribute('role');
      overlay.removeAttribute('aria-modal');
    }
  });
}
