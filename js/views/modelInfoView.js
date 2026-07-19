import { formatToDateTime, formatModelTimestampToTime, addMinutesToIso, formatToTime } from '../utils/time.js';
import { weatherModel } from '../models/weatherDomainModel.js'; // 👈 Wichtig: Modell importieren!

/**
 * Registers the model metadata info renderer.
 * @param {Object} map Leaflet map instance.
 * @returns {void}
 */
export function registerModelInfoView(map) {
    const infoEl = /** @type {HTMLElement|null} */ (document.querySelector('.model-info'));
    if (!infoEl) return;

    // Keep the element's appearance as plain text, but make it interactive
    if (infoEl.innerText === '--' || !infoEl.innerText) {
        infoEl.innerText = 'Model run: Loading...';
    }

    // Ensure the info element can receive keyboard focus (but keep default styling)
    if (!infoEl.hasAttribute('tabindex')) infoEl.setAttribute('tabindex', '0');

    // Prevent clicks from falling through to the map and dispatch an app event
    function dispatchModelInfoClicked() {
        window.dispatchEvent(new CustomEvent('model-info:clicked'));
    }

    infoEl.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        dispatchModelInfoClicked();
    });

    infoEl.addEventListener('keydown', (ev) => {
        // Activate on Enter or Space
        if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            ev.stopPropagation();
            dispatchModelInfoClicked();
        }
    });

    // Update the text content when model metadata changes — keep the original look
    weatherModel.addEventListener('model:model-metadata-updated', () => {
        try {
            let displayStr = '';

            if (weatherModel.modelGeneratedAt) {
                displayStr += `Updated ${formatToDateTime(weatherModel.modelGeneratedAt)} `;
            }

            // Also append Next = generatedAt + 65 minutes, separated by space
            if (weatherModel.modelGeneratedAt) {
                const nextDate = addMinutesToIso(weatherModel.modelGeneratedAt, 65);
                if (nextDate) {
                    displayStr += ` | Next ~${formatToTime(nextDate)}`;
                }
            }

            if (displayStr) {
                infoEl.innerText = displayStr.trim();
            } else {
                infoEl.innerText = 'Model data active';
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.error('🚨 Error formatting model info:', errorMessage);
            infoEl.innerText = 'Error loading model info';
        }
    });
}