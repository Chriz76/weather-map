import { toastController } from './toastController';
import { weatherProviderModel } from '../models/weatherProviderModel';
import { uiStateModel } from '../models/uiStateModel';
import { retryStartupSync } from './lifecycleController';
import { formatToDateTime, formatModelTimestampToDateTime } from '../utils/time';
import { logger } from '../utils/logger';

/**
 * Timeline slider moved: hand the new index to the model.
 *
 * The model emits `model:timestamp-index-updated`, which is what makes the wind overlay load the
 * new archive (see windArrowOverlayView) - there is no raster image to fetch any more, and
 * awaiting one here only delayed the switch.
 * @param e `ui:timeline-change` event with the new index.
 */
function handleTimelineChange(e: Event) {
  const customEvent = e as CustomEvent<{ index: number }>;
  const idx = customEvent && customEvent.detail && typeof customEvent.detail.index === 'number'
    ? customEvent.detail.index
    : null;
  if (idx === null) return;

  weatherProviderModel.setActiveTimestampIndex(idx);
}

function handleModelInfoClicked() {
  const runStr = weatherProviderModel.modelCurrentHour ? formatModelTimestampToDateTime(weatherProviderModel.modelCurrentHour) : '—';
  const syncStr = weatherProviderModel.lastIndexSync ? formatToDateTime(weatherProviderModel.lastIndexSync) : '—';

  const message = `Model run:\n${runStr}\n\nSync:\n${syncStr}`;

  toastController.showToast({ message }, 5000);
}

function handleAppReload() {
  logger.info('App reload requested via window event.');
  window.location.reload();
}

export function initUiController(): void {
  window.addEventListener('ui:timeline-change', handleTimelineChange as EventListener);
  window.addEventListener('ui:model-info-clicked', handleModelInfoClicked as EventListener);

  window.addEventListener('ui:wind-toggle-clicked', (e: Event) => {
    const ev = e as CustomEvent<{ show: boolean }>;
    const show = ev && ev.detail && typeof ev.detail.show === 'boolean' ? ev.detail.show : null;
    if (show === null) return;
    uiStateModel.setShowWindMeasurements(show);
  });

  window.addEventListener('ui:logo-provider-clicked', (e: Event) => {
    const ev = e as CustomEvent<{ providerId: string }>;
    const providerId = ev && ev.detail && typeof ev.detail.providerId === 'string' ? ev.detail.providerId : null;
    if (!providerId) return;
    window.dispatchEvent(new CustomEvent('app:provider-switch-request', { detail: { providerId } }));
  });

  window.addEventListener('app:startup-retry', retryStartupSync as EventListener);
  window.addEventListener('app:reload-requested', handleAppReload as EventListener);
}
