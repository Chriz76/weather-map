// controllers/uiController.js
import { loadingManager } from './loadingManager.js';
import { notificationController } from './notificationController.js';
import { weatherModel } from '../models/weatherModel.js';
import { updateOverlayForTimestamp } from './syncPipeline.js';
import { formatToDateTime, formatModelTimestampToDateTime } from '../utils/time.js';

const SLIDER_DEBOUNCE_MS = 50;

let timelineDebounceTimer = null;
let lastTimelineTimestampToken = null;

function handleTimelineChange(e) {
    const idx = e && e.detail && typeof e.detail.index === 'number' ? e.detail.index : null;
    if (idx === null) return;

    try {
        notificationController.clearNotification();
    } catch (err) {
        // ignore
    }

    weatherModel.setActiveTimestampIndex(idx);

    if (timelineDebounceTimer !== null) {
        clearTimeout(timelineDebounceTimer);
    }

    timelineDebounceTimer = window.setTimeout(async () => {
        const targetTimestamp = weatherModel.activeTimestamp;
        if (!targetTimestamp) return;

        lastTimelineTimestampToken = targetTimestamp;

        await loadingManager.track(async () => {
            await updateOverlayForTimestamp(targetTimestamp);
        });
    }, SLIDER_DEBOUNCE_MS);
}

function handleModelInfoClicked() {
    const runStr = weatherModel.modelCurrentHour ? formatModelTimestampToDateTime(weatherModel.modelCurrentHour) : '—';
    const syncStr = weatherModel.lastIndexSync ? formatToDateTime(weatherModel.lastIndexSync) : '—';

    const message = `Model run:\n${runStr}\n\nSync:\n${syncStr}`;

    notificationController.showNotification({
        message,
        isModal: false
    });
}

export function initUiController() {
    window.addEventListener('timeline-change', handleTimelineChange);
    window.addEventListener('model-info:clicked', handleModelInfoClicked);

    return {
        dispose() {
            window.removeEventListener('timeline-change', handleTimelineChange);
            window.removeEventListener('model-info:clicked', handleModelInfoClicked);
            if (timelineDebounceTimer !== null) {
                clearTimeout(timelineDebounceTimer);
                timelineDebounceTimer = null;
            }
        }
    };
}
