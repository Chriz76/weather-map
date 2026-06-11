export function registerLegend(map) {
    L.Control.WeatherLegend = L.Control.extend({
        options: { position: 'topright' },
        onAdd: function (map) {
            const container = L.DomUtil.create('div', 'leaflet-legend');
            L.DomEvent.disableClickPropagation(container);

            const html = `
        <div class="legend-title">knots</div>
        <div class="legend-body">
          <div class="color-bar">
            <div class="swatch w-over-25"></div>
            <div class="swatch w-under-25"></div>
            <div class="swatch w-under-20"></div>
            <div class="swatch w-under-15"></div>
            <div class="swatch w-under-12"></div>
            <div class="swatch w-under-10"></div>
            <div class="swatch w-under-9"></div>
            <div class="swatch w-under-8"></div>
            <div class="swatch w-under-7"></div>
            <div class="swatch w-under-6"></div>
            <div class="swatch w-under-5"></div>
            <div class="swatch w-under-3"></div>
          </div>

          <div class="labels-column">
            <div class="label-item">+</div>
            <div class="label-item">25</div>
            <div class="label-item">20</div>
            <div class="label-item">15</div>
            <div class="label-item">12</div>
            <div class="label-item">10</div>
            <div class="label-item">9</div>
            <div class="label-item">8</div>
            <div class="label-item">7</div>
            <div class="label-item">6</div>
            <div class="label-item">5</div>
            <div class="label-item">3</div>
            <div class="label-item">0</div>
          </div>
        </div>
      `;
            container.innerHTML = html;
            return container;
        }
    });

    L.control.weatherLegend = function (options) { return new L.Control.WeatherLegend(options); };
    L.control.weatherLegend().addTo(map);
}