import { formatIsoOrDateToLocalDisplay, formatToLocalTimeString } from '../utils/time.js';
import { weatherModel } from '../weatherModel.js'; // 👈 Wichtig: Modell importieren!

/**
 * Registers the model metadata info renderer.
 * @param {L.Map} map Leaflet map instance.
 * @returns {void}
 */
export function registerModelInfoView(map) {
    const infoEl = document.querySelector('.model-info');
    if (!infoEl) return;

    // Set default text if API still loading
    if (infoEl.innerText === '--' || !infoEl.innerText) {
        infoEl.innerText = 'Model run: Loading...';
    }

    // 👈 CHANGED: We listen directly on weatherModel for the new event
    weatherModel.addEventListener('model:model-metadata-updated', () => {
        try {
            let displayStr = '';

            // Read values directly via getters from store
            if (weatherModel.modelGeneratedAt) {
                displayStr += `Updated ${formatIsoOrDateToLocalDisplay(weatherModel.modelGeneratedAt)} `;
            }
            if (weatherModel.modelCurrentHour) {
                const modelTimeStr = formatToLocalTimeString(weatherModel.modelCurrentHour);
                displayStr += `(Model run ${modelTimeStr})`;
            }

            if (displayStr) {
                infoEl.innerText = displayStr.trim();
            } else {
                infoEl.innerText = 'Model data active';
            }
        } catch (err) {
            console.error('🚨 Error formatting model info:', err.message);
            infoEl.innerText = 'Error loading model info';
        }
    });
}