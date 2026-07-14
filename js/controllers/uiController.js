// controllers/uiController.js
import { loadingSpinnerController } from './loadingSpinnerController.js';
import { notificationController } from './notificationController.js';
import { weatherModel } from '../models/weatherModel.js';
import { updateOverlayForTimestampAction } from './actions.js';
import { formatToDateTime, formatModelTimestampToDateTime } from '../utils/time.js';

const SLIDER_DEBOUNCE_MS = 50;

let timelineDebounceTimer = null;
let lastTimelineTimestampToken = null;

async function handleNotificationRetryOverlay() {
    try {
        notificationController.clearNotification();
            await loadingSpinnerController.track(async () => {
            await updateOverlayForTimestampAction(weatherModel.activeTimestamp);
        });
    } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error('❌ Overlay retry from notification failed:', errMsg);
        notificationController.showNotification({
            message: "Retry failed: " + errMsg,
            isModal: false,
            action: { text: 'Retry', event: 'notification-retry-overlay' }
        }, 0);
    }
}

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

            await loadingSpinnerController.track(async () => {
            await updateOverlayForTimestampAction(targetTimestamp);
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
    window.addEventListener('notification-retry-overlay', handleNotificationRetryOverlay);

    // Note: cleanup removed as requested — listeners remain registered for app lifetime
}
