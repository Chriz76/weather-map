import { weatherProviderModel } from '../models/weatherProviderModel';
import { D2, AROME } from '../weatherProvider/providerIds';

const L = (window as any).L;

export function registerLogoView(map: any): void {
  L.Control.LogoView = L.Control.extend({
    options: { position: 'topleft' },
    onAdd: function () {
      const container = L.DomUtil.create('div', 'logo-view');
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.disableScrollPropagation(container);

      container.innerHTML = `
        <div class="logo-view__container">
          <a href="./info.html" class="logo-view__link" title="Dokumentation und Projekt-Informationen anzeigen">
            <img class="logo-view__icon" src="favicon.svg" alt="ICON-D2 RUC Wetterkarte Logo" />
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

      L.DomEvent.on(toggle, 'click', (ev: Event) => {
        L.DomEvent.stopPropagation(ev as any);
        L.DomEvent.preventDefault(ev as any);
        const target = ev.target as HTMLElement;
        const btn = target.closest('.logo-view__toggle-btn') as HTMLElement | null;
        if (!btn) return;
        const selected = btn.getAttribute('data-provider');
        if (!selected) return;

        window.dispatchEvent(new CustomEvent('ui:logo-provider-clicked', { detail: { providerId: selected } }));
      });

      weatherProviderModel.addEventListener('model:provider-changed', updateActiveState as EventListener);

      updateActiveState();

      return container;
    }
  });

  L.control.logoView = function (options: any) { return new L.Control.LogoView(options); };
  (map as any).logoViewControl = L.control.logoView().addTo(map);
}
