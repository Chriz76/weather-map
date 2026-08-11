import { loadingSpinnerController } from './loadingSpinnerController';
import { toastController } from './toastController';
import { weatherProviderModel } from '../models/weatherProviderModel';
import { uiStateModel } from '../models/uiStateModel';
import { retryStartupSync } from './lifecycleController';
import { updateOverlayForTimestampAction } from './actions';
import { formatToDateTime, formatModelTimestampToDateTime } from '../utils/time';
import { logger } from '../utils/logger';

const SLIDER_DEBOUNCE_MS = 50;

let timelineDebounceTimer: number | null = null;
let lastTimelineTimestampToken: string | null = null;

function handleTimelineChange(e: Event) {
  const customEvent = e as CustomEvent<{ index: number }>;
  const idx = customEvent && customEvent.detail && typeof customEvent.detail.index === 'number'
    ? customEvent.detail.index
    : null;
  if (idx === null) return;

  weatherProviderModel.setActiveTimestampIndex(idx);

  if (timelineDebounceTimer !== null) {
    clearTimeout(timelineDebounceTimer as any);
  }

  timelineDebounceTimer = window.setTimeout(async () => {
    const targetTimestamp = weatherProviderModel.activeTimestamp;
    if (!targetTimestamp) return;

    lastTimelineTimestampToken = targetTimestamp;

    try {
      await loadingSpinnerController.track(async () => {
        await updateOverlayForTimestampAction(targetTimestamp);
      });
    } catch (err: any) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error('❌ Overlay fetch failed during timeline change:', errMsg);
      weatherProviderModel.setOverlayLoadError(errMsg);
    }
  }, SLIDER_DEBOUNCE_MS) as unknown as number;
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

  window.addEventListener('ui:wind-toggle-clicked', (e: any) => {
    const show = e && e.detail && typeof e.detail.show === 'boolean' ? e.detail.show : null;
    if (show === null) return;
    uiStateModel.setShowWindMeasurements(show);
  });

  window.addEventListener('ui:logo-provider-clicked', (e: any) => {
    const providerId = e && e.detail && typeof e.detail.providerId === 'string' ? e.detail.providerId : null;
    if (!providerId) return;
    window.dispatchEvent(new CustomEvent('app:provider-switch-request', { detail: { providerId } }));
  });

  window.addEventListener('app:startup-retry', retryStartupSync as EventListener);
  window.addEventListener('app:reload-requested', handleAppReload as EventListener);
}
