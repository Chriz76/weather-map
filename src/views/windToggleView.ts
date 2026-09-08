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

export const SHARE_ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="18" cy="5" r="3" />
  <circle cx="6" cy="12" r="3" />
  <circle cx="18" cy="19" r="3" />
  <path d="M8.59 13.51 15.42 17.49" />
  <path d="M15.41 6.51 8.59 10.49" />
</svg>`;

function renderIcon() {
  return uiStateModel.showWindMeasurements ? WIND_ICON_ON : WIND_ICON_OFF;
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
      button.title = 'Toggle wind measurements';
      button.setAttribute('aria-label', 'Toggle wind measurements');
      button.style.cursor = 'pointer';
      button.setAttribute('aria-pressed', String(uiStateModel.showWindMeasurements));

      L.DomEvent.on(button, 'click', (e: Event) => {
        L.DomEvent.stopPropagation(e as Event);
        L.DomEvent.preventDefault(e as Event);
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
  }

  map.addControl(new WindToggleControl());
}

export function registerShareView(map: LeafletMap): void {
  class ShareControl extends L.Control {
    constructor() {
      super({ position: 'topright' });
    }

    onAdd(): HTMLElement {
      const container = L.DomUtil.create('div', 'leaflet-bar') as HTMLElement;
      const button = L.DomUtil.create('a', 'share-view', container) as HTMLElement;

      button.innerHTML = SHARE_ICON_SVG;
      button.title = 'Share current location';
      button.setAttribute('aria-label', 'Share current location');
      button.style.cursor = 'pointer';

      L.DomEvent.on(button, 'click', (e: Event) => {
        L.DomEvent.stopPropagation(e as Event);
        L.DomEvent.preventDefault(e as Event);
        window.dispatchEvent(new CustomEvent('ui:share-request'));
      });

      return container;
    }
  }

  map.addControl(new ShareControl());
}
