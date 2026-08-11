import { weatherProviderModel } from '../models/weatherProviderModel';

export function registerNotificationView(): void {
  const notificationEl = document.createElement('div');
  notificationEl.className = 'notification';
  document.body.appendChild(notificationEl);

  const backdropEl = document.createElement('div');
  backdropEl.className = 'notification-backdrop';
  document.body.appendChild(backdropEl);

  let activeActionEvent: string | null = null;

  notificationEl.addEventListener('click', (e: Event) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('notification__btn') && activeActionEvent) {
      window.dispatchEvent(new CustomEvent(activeActionEvent));
    }
  });

  const showNotification = (config: { message?: string; isModal: boolean; action?: { event: string; text: string } }) => {
    activeActionEvent = config.action?.event || null;

    if (config.isModal) {
      notificationEl.setAttribute('role', 'dialog');
      notificationEl.setAttribute('aria-modal', 'true');
    } else {
      notificationEl.setAttribute('role', 'alert');
      notificationEl.removeAttribute('aria-modal');
    }

    let buttonHtml = '';
    if (config.action) {
      buttonHtml = `<button class="notification__btn">${config.action.text}</button>`;
    }

    notificationEl.innerHTML = `
            <div class="notification__content">
                <span class="notification__icon">⚠️</span>
                <span class="notification__text"></span>
            </div>
            ${buttonHtml}
        `;

    const textEl = notificationEl.querySelector('.notification__text');
    if (textEl) textEl.textContent = config.message ?? '';

    if (config.isModal) {
      backdropEl.classList.add('notification-backdrop--visible');
      document.body.classList.add('body--modal-open');
      window.setTimeout(() => {
        const btn = notificationEl.querySelector('.notification__btn') as HTMLElement | null;
        if (btn) btn.focus();
      }, 50);
    } else {
      backdropEl.classList.remove('notification-backdrop--visible');
      document.body.classList.remove('body--modal-open');
    }

    notificationEl.classList.add('notification--visible');
  };

  const showErrorNotification = () => {
    if (weatherProviderModel.apiMismatchError) {
      showNotification({
        message: weatherProviderModel.apiMismatchError,
        isModal: true,
        action: { event: 'app:reload-requested', text: 'Reload App' }
      });
      return;
    }

    if (weatherProviderModel.startupError) {
      showNotification({
        message: weatherProviderModel.startupError,
        isModal: true,
        action: { event: 'app:startup-retry', text: 'Retry' }
      });
      return;
    }

    const hasLoadErrors = !!(
      weatherProviderModel.indexLoadError ||
      weatherProviderModel.pointDataLoadError ||
      weatherProviderModel.overlayLoadError
    );

    if (!hasLoadErrors) {
      hideNotification();
      return;
    }

    showNotification({ message: 'Error loading data.', isModal: false, action: { event: 'ui:notification-retry', text: 'Retry' } });
  };

  const hideNotification = () => {
    notificationEl.classList.remove('notification--visible');
    backdropEl.classList.remove('notification-backdrop--visible');
    document.body.classList.remove('body--modal-open');
    notificationEl.removeAttribute('role');
    notificationEl.removeAttribute('aria-modal');
    activeActionEvent = null;
  };

  const render = () => {
    if (weatherProviderModel.hasLoadError) {
      showErrorNotification();
      return;
    }
    hideNotification();
  };

  const onLoadErrorChanged = () => render();

  weatherProviderModel.addEventListener('model:load-error-changed', onLoadErrorChanged as EventListener);
}
