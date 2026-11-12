import { weatherProviderModel } from '../models/weatherProviderModel';
import { D2, AROME, HRRR } from '../weatherProvider/providerIds';
import * as L from 'leaflet';
import type { Map as LeafletMap } from 'leaflet';

/**
 * Registers the logo control (top left): logo link plus the provider toggle.
 *
 * The toggle is split into two region groups, each with its own caption, because the providers
 * cover disjoint model areas: ICON-D2 and AROME share Europe (same location can be compared),
 * HRRR covers the CONUS. Every button stays in one flat selector scope, so the active state is
 * still exclusive across both groups.
 *
 * @param map Leaflet map the control is added to.
 */
export function registerLogoView(map: LeafletMap): void {
  class LogoControl extends L.Control {
    constructor() {
      super({ position: 'topleft' });
    }

    onAdd(): HTMLElement {
      const container = L.DomUtil.create('div', 'logo-view');
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.disableScrollPropagation(container);

      container.innerHTML = `
        <div class="logo-view__container">
          <a href="./info.html" class="logo-view__link" title="Show documentation and project information">
            <img class="logo-view__icon" src="/favicon.svg" alt="Wind map logo" />
          </a>

          <div class="logo-view__text-box">
            <div class="logo-view__groups">
              <div class="logo-view__group" role="group" aria-label="Europe models">
                <div class="logo-view__toggle">
                  <button type="button" class="logo-view__toggle-btn" data-provider="${D2}" aria-pressed="false">D2 RUC</button>
                  <button type="button" class="logo-view__toggle-btn" data-provider="${AROME}" aria-pressed="false">Arome PI</button>
                </div>
                <span class="logo-view__group-label">Europe</span>
              </div>

              <div class="logo-view__group" role="group" aria-label="United States models">
                <div class="logo-view__toggle">
                  <button type="button" class="logo-view__toggle-btn" data-provider="${HRRR}" aria-pressed="false">HRRR</button>
                </div>
                <span class="logo-view__group-label">USA</span>
              </div>
            </div>
          </div>
        </div>
      `;

      const groups = container.querySelector('.logo-view__groups') as HTMLElement | null;

      function updateActiveState() {
        const active = weatherProviderModel.getActiveProviderId();
        groups?.querySelectorAll('.logo-view__toggle-btn').forEach((btn) => {
          const isActive = btn.getAttribute('data-provider') === active;
          btn.classList.toggle('logo-view__toggle-btn--active', isActive);
          btn.setAttribute('aria-pressed', String(isActive));
        });
      }

      if (groups) {
        L.DomEvent.on(groups, 'click', (ev: Event) => {
          L.DomEvent.stopPropagation(ev);
          L.DomEvent.preventDefault(ev);
          const target = ev.target as HTMLElement;
          const btn = target.closest('.logo-view__toggle-btn') as HTMLElement | null;
          if (!btn) return;
          const selected = btn.getAttribute('data-provider');
          if (!selected) return;

          window.dispatchEvent(new CustomEvent('ui:logo-provider-clicked', { detail: { providerId: selected } }));
        });
      }

      weatherProviderModel.addEventListener('model:provider-changed', updateActiveState as EventListener);

      updateActiveState();

      return container;
    }
  }

  const control = new LogoControl();
  control.addTo(map);
  map.logoViewControl = control;
}
