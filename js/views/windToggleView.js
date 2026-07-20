/* global L */
import { weatherUi } from '../models/weatherUiModel.js';

const WIND_ICON_ON = `
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="12" cy="12" r="9" />
  <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
</svg>`;

const WIND_ICON_OFF = `
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="12" cy="12" r="9" />
  <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
  <line x1="2" y1="2" x2="22" y2="22" />
</svg>`;

function renderIcon() {
    return weatherUi.showWindMeasurements ? WIND_ICON_ON : WIND_ICON_OFF;
}

export function registerWindToggleView(map) {
    const WindToggleControl = L.Control.extend({
        options: {
            position: 'topright'
        },

        onAdd: function() {
            const container = L.DomUtil.create('div', 'leaflet-bar');
            const button = L.DomUtil.create('a', 'wind-toggle-view', container);

            button.innerHTML = renderIcon();
            button.title = 'Toggle wind measurements';
            button.setAttribute('aria-label', 'Toggle wind measurements');
            button.style.cursor = 'pointer';
            button.setAttribute('aria-pressed', String(weatherUi.showWindMeasurements));

            L.DomEvent.on(button, 'click', /** @param {Event} e */ (e) => {
                L.DomEvent.stopPropagation(e);
                L.DomEvent.preventDefault(e);
                weatherUi.setShowWindMeasurements(!weatherUi.showWindMeasurements);
            });

            weatherUi.addEventListener('model:wind-measurements-visibility-changed', () => {
                const visible = weatherUi.showWindMeasurements;
                button.innerHTML = renderIcon();
                button.setAttribute('aria-pressed', String(visible));
            });

            return container;
        }
    });

    map.addControl(new WindToggleControl());
}
