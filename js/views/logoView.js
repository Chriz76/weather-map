/* global L */
import { weatherProviderModel } from '../models/weatherProviderModel.js';
import { D2, AROME } from '../weatherProvider/providerIds.js';

/**
 * Registers the logo/info control.
 * @param {Object} map Leaflet map instance.
 * @returns {void}
 */
export function registerLogoView(map) {
    L.Control.LogoView = L.Control.extend({
        options: { position: 'topleft' },
        onAdd: function (map) {
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

            const toggle = container.querySelector('.logo-view__toggle');

            function updateActiveState() {
                const active = weatherProviderModel.getActiveProviderId();
                toggle.querySelectorAll('.logo-view__toggle-btn').forEach(btn => {
                    const isActive = btn.getAttribute('data-provider') === active;
                    btn.classList.toggle('logo-view__toggle-btn--active', isActive);
                    btn.setAttribute('aria-pressed', String(isActive));
                });
            }

            // Click handler: emit app-level event with providerId
            L.DomEvent.on(toggle, 'click', /** @param {Event} ev */ (ev) => {
                L.DomEvent.stopPropagation(ev);
                L.DomEvent.preventDefault(ev);
                const btn = ev.target.closest('.logo-view__toggle-btn');
                if (!btn) return;
                const selected = btn.getAttribute('data-provider');
                if (!selected) return;

                // Emit event expected by UI controller
                window.dispatchEvent(new CustomEvent('ui:logo-provider-clicked', {
                    detail: { providerId: selected }
                }));
            });

            // Keep UI in sync with model
            weatherProviderModel.addEventListener('model:provider-changed', updateActiveState);

            // initialize
            updateActiveState();

            return container;
        }
    });

    L.control.logoView = function (options) { return new L.Control.LogoView(options); };
    map.logoViewControl = L.control.logoView().addTo(map);
}