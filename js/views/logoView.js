export function registerLogoView(map) {
    // 1. Einheitlicher Leaflet-Klassenname: LogoView
    L.Control.LogoView = L.Control.extend({
        options: { position: 'topleft' },
        onAdd: function (map) {
            // 2. Hauptklasse auf BEM umgestellt (.logo-view)
            const container = L.DomUtil.create('div', 'logo-view');
            L.DomEvent.disableClickPropagation(container);
            L.DomEvent.disableScrollPropagation(container);

            // 3. Alle inneren Klassen auf das BEM-Muster ("logo-view__...") angepasst
            container.innerHTML = `
        <a href="./info.html" class="logo-view__link" title="Dokumentation und Projekt-Informationen anzeigen">
          <div class="logo-view__container">
            <img class="logo-view__icon" src="favicon.svg" alt="ICON-D2 RUC Wetterkarte Logo" />
            <div class="logo-view__text-box">
              <h1 class="logo-view__title">ICON-D2 RUC</h1>
              <h2 class="logo-view__subtitle">The Only Hourly Updated Forecast</h2>
            </div>
          </div>
        </a>
      `;

            return container;
        }
    });

    // 4. Factory-Methode und Registrierung angepasst
    L.control.logoView = function (options) { return new L.Control.LogoView(options); };
    map.logoViewControl = L.control.logoView().addTo(map);
}