import * as L from 'leaflet';
import type { Map as LeafletMap } from 'leaflet';

const SHARE_ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="18" cy="5" r="3" />
  <circle cx="6" cy="12" r="3" />
  <circle cx="18" cy="19" r="3" />
  <path d="M8.59 13.51 15.42 17.49" />
  <path d="M15.41 6.51 8.59 10.49" />
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
