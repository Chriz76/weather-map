import { uiStateModel } from '../models/uiStateModel';

const WIND_ICON_ON = `
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="12" cy="12" r="9" />
  <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
</svg>`;

const WIND_ICON_OFF = `
<svg class="wind-toggle-icon-disabled" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="12" cy="12" r="9" />
  <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
</svg>`;

function renderIcon() {
  return uiStateModel.showWindMeasurements ? WIND_ICON_ON : WIND_ICON_OFF;
}

export function registerWindToggleView(map: any): void {
  const WindToggleControl = (window as any).L.Control.extend({
    options: { position: 'topright' },
    onAdd: function () {
      const container = (window as any).L.DomUtil.create('div', 'leaflet-bar');
      const button = (window as any).L.DomUtil.create('a', 'wind-toggle-view', container);

      button.innerHTML = renderIcon();
      button.title = 'Toggle wind measurements';
      button.setAttribute('aria-label', 'Toggle wind measurements');
      button.style.cursor = 'pointer';
      button.setAttribute('aria-pressed', String(uiStateModel.showWindMeasurements));

      (window as any).L.DomEvent.on(button, 'click', (e: Event) => {
        (window as any).L.DomEvent.stopPropagation(e as any);
        (window as any).L.DomEvent.preventDefault(e as any);
        const requested = !uiStateModel.showWindMeasurements;
        window.dispatchEvent(new CustomEvent('ui:wind-toggle-clicked', { detail: { show: requested } }));
      });

      uiStateModel.addEventListener('ui:wind-measurements-visibility-changed', () => {
        const visible = uiStateModel.showWindMeasurements;
        button.innerHTML = renderIcon();
        button.setAttribute('aria-pressed', String(visible));
      });

      return container;
    }
  });

  map.addControl(new (window as any).L.Control(WindToggleControl));
}
