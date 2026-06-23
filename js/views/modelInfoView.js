import { formatIsoOrDateToLocalDisplay, formatToLocalTimeString } from '../utils/time.js';
import { weatherModel } from '../weatherModel.js'; // 👈 Wichtig: Modell importieren!

export function registerModelInfoView(map) {
    const infoEl = document.querySelector('.model-info');
    if (!infoEl) return;

    // Standard-Text setzen, falls die API noch lädt
    if (infoEl.innerText === '--' || !infoEl.innerText) {
        infoEl.innerText = 'Model run: Loading...';
    }

    // 👈 GEÄNDERT: Wir lauschen direkt am weatherModel auf das neue Event
    weatherModel.addEventListener('model:model-metadata-updated', () => {
        try {
            let displayStr = '';

            // Werte direkt über die Getter aus dem Store lesen
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