import * as L from 'leaflet';
import type { Map as LeafletMap } from 'leaflet';

const SHARE_ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
  <polyline points="16 6 12 2 8 6"></polyline>
  <line x1="12" y1="2" x2="12" y2="15"></line>
</svg>`;

/**
 * Registers the Leaflet share control.
 */
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

export { SHARE_ICON_SVG };
