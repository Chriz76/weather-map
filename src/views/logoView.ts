import { weatherProviderModel } from '../models/weatherProviderModel';
import { D2, AROME } from '../weatherProvider/providerIds';
import * as L from 'leaflet';
import type { Map as LeafletMap } from 'leaflet';

export function registerLogoView(map: LeafletMap): void {
  (L.Control as unknown as { LogoView?: unknown }).LogoView = (L.Control as unknown as { extend: Function }).extend({
    options: { position: 'topleft' },
    onAdd: function () {
      const container = L.DomUtil.create('div', 'logo-view');
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.disableScrollPropagation(container);

      container.innerHTML = `
        <div class="logo-view__container">
          <a href="./info.html" class="logo-view__link" title="Show documentation and project information">
            <img class="logo-view__icon" src="/favicon.svg" alt="ICON-D2 RUC Wetterkarte Logo" />
          </a>

          <div class="logo-view__text-box">
            <div class="logo-view__toggle" role="tablist" aria-label="Model toggle">
              <button type="button" class="logo-view__toggle-btn" data-provider="${D2}" aria-pressed="false">D2 RUC</button>
              <button type="button" class="logo-view__toggle-btn" data-provider="${AROME}" aria-pressed="false">Arome PI</button>
            </div>
            <h2 class="logo-view__subtitle">Rapid Update Forecast Models</h2>
          </div>
        </div>
      `;

      const toggle = container.querySelector('.logo-view__toggle') as HTMLElement | null;

      function updateActiveState() {
        const active = weatherProviderModel.getActiveProviderId();
        toggle?.querySelectorAll('.logo-view__toggle-btn').forEach((btn) => {
          const isActive = btn.getAttribute('data-provider') === active;
          btn.classList.toggle('logo-view__toggle-btn--active', isActive);
          btn.setAttribute('aria-pressed', String(isActive));
        });
      }

      if (toggle) {
        L.DomEvent.on(toggle, 'click', (ev: Event) => {
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
  });

  const createLogoControl = (options?: unknown) => new ((L.Control as unknown as { LogoView: new (o?: unknown) => unknown }).LogoView)(options);
  (map as unknown as Record<string, unknown>)['logoViewControl'] = (createLogoControl() as unknown as { addTo: (m: LeafletMap) => unknown }).addTo(map);
}
