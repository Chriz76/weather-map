export function registerLegendView(map) {
    // 1. Einheitlicher Leaflet-Klassenname: LegendView
    L.Control.LegendView = L.Control.extend({
        options: { position: 'topright' },
        onAdd: function (map) {
            // 2. Hauptklasse auf BEM umgestellt
            const container = L.DomUtil.create('div', 'legend-view');
            L.DomEvent.disableClickPropagation(container);

            // 3. Alle inneren Klassen auf das BEM-Muster ("legend-view__...") angepasst
            container.innerHTML = `
                <div class="legend-view__title">knots</div>
                <div class="legend-view__body">
                    <div class="legend-view__color-bar">
                        <div class="legend-view__swatch w-over-25"></div>
                        <div class="legend-view__swatch w-under-25"></div>
                        <div class="legend-view__swatch w-under-20"></div>
                        <div class="legend-view__swatch w-under-15"></div>
                        <div class="legend-view__swatch w-under-12"></div>
                        <div class="legend-view__swatch w-under-10"></div>
                        <div class="legend-view__swatch w-under-9"></div>
                        <div class="legend-view__swatch w-under-8"></div>
                        <div class="legend-view__swatch w-under-7"></div>
                        <div class="legend-view__swatch w-under-6"></div>
                        <div class="legend-view__swatch w-under-5"></div>
                        <div class="legend-view__swatch w-under-3"></div>
                    </div>

                    <div class="legend-view__labels-column">
                        <div class="legend-view__label-item">+</div>
                        <div class="legend-view__label-item">25</div>
                        <div class="legend-view__label-item">20</div>
                        <div class="legend-view__label-item">15</div>
                        <div class="legend-view__label-item">12</div>
                        <div class="legend-view__label-item">10</div>
                        <div class="legend-view__label-item">9</div>
                        <div class="legend-view__label-item">8</div>
                        <div class="legend-view__label-item">7</div>
                        <div class="legend-view__label-item">6</div>
                        <div class="legend-view__label-item">5</div>
                        <div class="legend-view__label-item">3</div>
                        <div class="legend-view__label-item">0</div>
                    </div>
                </div>
            `;

            return container;
        }
    });

    // 4. Factory-Methode und Registrierung angepasst
    L.control.legendView = function (options) { return new L.Control.LegendView(options); };
    map.legendViewControl = L.control.legendView().addTo(map);
}