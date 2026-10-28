import { uiStateModel } from '../models/uiStateModel';
import { weatherProviderModel } from '../models/weatherProviderModel';
import { providers } from '../config';

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

/** Measurements come from DWD stations via Bright Sky, which only covers Europe. */
const LABEL_AVAILABLE = 'Toggle wind measurements (EU only)';
const LABEL_UNAVAILABLE = 'Wind measurements are only available for the European models';

/** True when the active provider's area has a station source. */
function hasMeasurements(): boolean {
  return providers[weatherProviderModel.getActiveProviderId()]?.hasWindMeasurements === true;
}

/**
 * Keeps label, cursor and disabled styling of the toggle in sync with the active provider.
 *
 * The stored `showWindMeasurements` flag is left alone: switching back to a European model
 * restores the user's choice instead of silently resetting it.
 * @param button The toggle element.
 */
function applyAvailability(button: HTMLElement): void {
  const available = hasMeasurements();
  const label = available ? LABEL_AVAILABLE : LABEL_UNAVAILABLE;

  button.title = label;
  button.setAttribute('aria-label', label);
  button.setAttribute('aria-disabled', String(!available));
  button.classList.toggle('wind-toggle-view--disabled', !available);
  button.style.cursor = available ? 'pointer' : 'default';
}

import type { Map as LeafletMap } from 'leaflet';
import * as L from 'leaflet';

export function registerWindToggleView(map: LeafletMap): void {
  class WindToggleControl extends L.Control {
    constructor() {
      super({ position: 'topright' });
    }

    onAdd(): HTMLElement {
      const container = L.DomUtil.create('div', 'leaflet-bar') as HTMLElement;
      const button = L.DomUtil.create('a', 'wind-toggle-view', container) as HTMLElement;

      button.innerHTML = renderIcon();
      applyAvailability(button);
      button.setAttribute('aria-pressed', String(uiStateModel.showWindMeasurements));

      L.DomEvent.on(button, 'click', (e: Event) => {
        L.DomEvent.stopPropagation(e as Event);
        L.DomEvent.preventDefault(e as Event);
        // Nothing to toggle for a model area without a station source.
        if (!hasMeasurements()) return;
        const requested = !uiStateModel.showWindMeasurements;
        window.dispatchEvent(new CustomEvent('ui:wind-toggle-clicked', { detail: { show: requested } }));
      });

      weatherProviderModel.addEventListener('model:provider-changed', () => applyAvailability(button));

      uiStateModel.addEventListener('ui:wind-measurements-visibility-changed', () => {
        const visible = uiStateModel.showWindMeasurements;
        button.innerHTML = renderIcon();
        button.setAttribute('aria-pressed', String(visible));
      });

      return container;
    }
  }

  map.addControl(new WindToggleControl());
}
