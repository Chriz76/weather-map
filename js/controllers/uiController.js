// controllers/uiController.js
import { loadingSpinnerController } from './loadingSpinnerController.js';
import { toastController } from './toastController.js';
import { weatherProviderModel } from '../models/weatherProviderModel.js';
import { retryStartupSync } from './lifecycleController.js';
import { updateOverlayForTimestampAction } from './actions.js';
import { formatToDateTime, formatModelTimestampToDateTime } from '../utils/time.js';
import { logger } from '../utils/logger.js';

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
    window.addEventListener('app:startup-retry', retryStartupSync);
    window.addEventListener('app:reload-requested', handleAppReload);

    // Note: cleanup removed as requested — listeners remain registered for app lifetime
}
