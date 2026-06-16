import { formatIsoOrDateToLocalDisplay, formatToLocalTimeString } from '../utils/time.js';

export function registerModelInfoView(map) {
    const infoEl = document.querySelector('.model-info');
    if (!infoEl) return;

    window.addEventListener('state:timestampsUpdated', (e) => {
        // Sicherstellen, dass detail und indexData existieren
        const indexData = e && e.detail && e.detail.indexData;
        if (!indexData) return;

        let displayStr = '';
        if (indexData.generated_at) {
            displayStr += `Updated ${formatIsoOrDateToLocalDisplay(indexData.generated_at)} `;
        }
        if (indexData.current_hour) {
            const modelTimeStr = formatToLocalTimeString(indexData.current_hour);
            displayStr += `(Model run ${modelTimeStr})`;
        }

        if (displayStr) {
            infoEl.innerText = displayStr.trim();
        }
    });
}