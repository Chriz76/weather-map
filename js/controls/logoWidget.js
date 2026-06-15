export function registerLogoControl(map) {
  L.Control.AppLogo = L.Control.extend({
    options: { position: 'topleft' },
    onAdd: function (map) {
      const container = L.DomUtil.create('div', 'leaflet-app-logo');
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.disableScrollPropagation(container);

      container.innerHTML = `
        <a href="./info.html" class="logo-link" title="Dokumentation und Projekt-Informationen anzeigen">
          <div class="logo-container">
            <img class="logo-icon" src="favicon.svg" alt="ICON-D2 RUC Wetterkarte Logo" />
            <div class="logo-text">
              <h1>ICON-D2 RUC</h1>
              <h2>The Only Hourly Updated Forecast</h2>
            </div>
          </div>
        </a>
      `;

      return container;
    }
  });

  L.control.appLogo = function (options) { return new L.Control.AppLogo(options); };
  L.control.appLogo().addTo(map);
}
