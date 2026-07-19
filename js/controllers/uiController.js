// controllers/uiController.js
import { loadingSpinnerController } from './loadingSpinnerController.js';
import { toastController } from './toastController.js';
import { weatherModel } from '../models/weatherModel.js';
import { retryStartupSync } from './lifecycleController.js';
import { updateOverlayForTimestampAction } from './actions.js';
import { formatToDateTime, formatModelTimestampToDateTime } from '../utils/time.js';

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

    weatherModel.setActiveTimestampIndex(idx);

    if (timelineDebounceTimer !== null) {
        clearTimeout(timelineDebounceTimer);
    }

    timelineDebounceTimer = window.setTimeout(async () => {
        const targetTimestamp = weatherModel.activeTimestamp;
        if (!targetTimestamp) return;

        lastTimelineTimestampToken = targetTimestamp;

        try {
            await loadingSpinnerController.track(async () => {
                await updateOverlayForTimestampAction(targetTimestamp);
            });
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            console.error('❌ Overlay fetch failed during timeline change:', errMsg);
            weatherModel.setOverlayLoadError(errMsg);
        }
    }, SLIDER_DEBOUNCE_MS);
}

function handleModelInfoClicked() {
    const runStr = weatherModel.modelCurrentHour ? formatModelTimestampToDateTime(weatherModel.modelCurrentHour) : '—';
    const syncStr = weatherModel.lastIndexSync ? formatToDateTime(weatherModel.lastIndexSync) : '—';

    const message = `Model run:\n${runStr}\n\nSync:\n${syncStr}`;

    toastController.showToast({ message }, 5000);
}

function handleAppReload() {
    console.log('App reload requested via window event.');
    window.location.reload();
}

export function initUiController() {
    window.addEventListener('timeline-change', handleTimelineChange);
    window.addEventListener('model-info:clicked', handleModelInfoClicked);
    window.addEventListener('controller:startup-retry', retryStartupSync);
    window.addEventListener('controller:app-reload', handleAppReload);

    // Note: cleanup removed as requested — listeners remain registered for app lifetime
}
