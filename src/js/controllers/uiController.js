// controllers/uiController.js
import { loadingSpinnerController } from './loadingSpinnerController.js';
import { toastController } from './toastController.js';
import { weatherProviderModel } from '../models/weatherProviderModel';
import { uiStateModel } from '../models/uiStateModel';
import { retryStartupSync } from './lifecycleController.js';
import { updateOverlayForTimestampAction } from './actions.js';
import { formatToDateTime, formatModelTimestampToDateTime } from '../utils/time';
import { logger } from '../utils/logger';

const SLIDER_DEBOUNCE_MS = 50;

/** @type {number|null} */
let timelineDebounceTimer = null;
let lastTimelineTimestampToken = null;

/**
 * @param {Event} e
 */
function handleTimelineChange(e) {
    const customEvent = /** @type {CustomEvent<{index:number}>} */ (e);
    const idx = customEvent && customEvent.detail && typeof customEvent.detail.index === 'number'
        ? customEvent.detail.index
        : null;
    if (idx === null) return;

    weatherProviderModel.setActiveTimestampIndex(idx);

    if (timelineDebounceTimer !== null) {
        clearTimeout(timelineDebounceTimer);
    }

    timelineDebounceTimer = window.setTimeout(async () => {
        const targetTimestamp = weatherProviderModel.activeTimestamp;
        if (!targetTimestamp) return;

        lastTimelineTimestampToken = targetTimestamp;

        try {
            await loadingSpinnerController.track(async () => {
                await updateOverlayForTimestampAction(targetTimestamp);
            });
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            logger.error('❌ Overlay fetch failed during timeline change:', errMsg);
            weatherProviderModel.setOverlayLoadError(errMsg);
        }
    }, SLIDER_DEBOUNCE_MS);
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

export function initUiController() {
    window.addEventListener('ui:timeline-change', handleTimelineChange);
    window.addEventListener('ui:model-info-clicked', handleModelInfoClicked);
    // Wind toggle events from the view are handled here (MVC): controller updates model
    window.addEventListener('ui:wind-toggle-clicked', /** @param {CustomEvent<{show:boolean}>} e */ (e) => {
        const show = e && e.detail && typeof e.detail.show === 'boolean' ? e.detail.show : null;
        if (show === null) return;
        uiStateModel.setShowWindMeasurements(show);
    });
    // Provider change requests from logo view: forward to lifecycle controller
    window.addEventListener('ui:logo-provider-clicked', /** @param {CustomEvent<{providerId:string}>} e */ (e) => {
        const providerId = e && e.detail && typeof e.detail.providerId === 'string' ? e.detail.providerId : null;
        if (!providerId) return;
        // Let lifecycleController orchestrate sync/refresh for the new provider
        window.dispatchEvent(new CustomEvent('app:provider-switch-request', { detail: { providerId } }));
    });
    window.addEventListener('app:startup-retry', retryStartupSync);
    window.addEventListener('app:reload-requested', handleAppReload);

    // Note: cleanup removed as requested — listeners remain registered for app lifetime
}
