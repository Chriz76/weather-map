import { weatherModel } from '../weatherModel.js';

export function registerForecastView(map) {

    L.Control.ForecastView = L.Control.extend({
        options: { position: 'bottomleft' },
        onAdd: function (map) {
            const self = this;

            const container = L.DomUtil.create('div', 'forecast-view');
            // Verhindert, dass Klicks auf die Tabelle ungewollt Aktionen auf der Karte auslösen
            L.DomEvent.disableClickPropagation(container);

            // 🌟 CLEANUP: Alle unnötigen IDs gelöscht – wir selektieren jetzt nur noch über BEM-Klassen
            container.innerHTML = `
                <div class="forecast-view__scroll-container">
                    <table class="forecast-view__table">
                        <tr class="forecast-view__row-header"></tr>
                        <tr class="forecast-view__row-values"></tr>
                    </table>
                </div>
            `;

            // Reine Render-Funktion für die Tabelle
            self.renderTable = function (forecastData) {
                if (!forecastData) {
                    container.classList.remove('forecast-view--has-data');
                    return;
                }

                container.classList.add('forecast-view--has-data');

                // 🚀 SAUBER: Suche jetzt lokal IM container, statt auf dem gesamten document
                const headerRow = container.querySelector('.forecast-view__row-header');
                const valuesRow = container.querySelector('.forecast-view__row-values');
                if (!headerRow || !valuesRow) return;

                function getColorClass(wind) {
                    if (wind < 3.0) return 'w-under-3';
                    if (wind < 5.0) return 'w-under-5';
                    if (wind < 6.0) return 'w-under-6';
                    if (wind < 7.0) return 'w-under-7';
                    if (wind < 8.0) return 'w-under-8';
                    if (wind < 9.0) return 'w-under-9';
                    if (wind < 10.0) return 'w-under-10';
                    if (wind < 12) return 'w-under-12';
                    if (wind < 15) return 'w-under-15';
                    if (wind < 20) return 'w-under-20';
                    if (wind < 25) return 'w-under-25';
                    return 'w-over-25';
                }

                let headerHtml = '';
                let valuesHtml = '';

                forecastData.forEach(item => {
                    const colorClass = getColorClass(item.wind);
                    const formattedValue = item.wind >= 10 ? Math.round(item.wind) : item.wind.toFixed(1);

                    headerHtml += `<th class="forecast-view__cell-header" data-time="${item.fullKey}">${item.hour}h</th>`;
                    valuesHtml += `<td class="forecast-view__cell-value ${colorClass}" data-time="${item.fullKey}">${formattedValue}</td>`;
                });

                headerRow.innerHTML = headerHtml;
                valuesRow.innerHTML = valuesHtml;

                self.highlightActiveForecastHour();
                setTimeout(() => { self.scrollActiveForecastHourToCenter(); }, 50);
            };

            self.highlightActiveForecastHour = function () {
                const currentKey = weatherModel.activeTimestamp;
                if (!currentKey) return;

                // 🚀 SAUBER: Nur Elemente innerhalb dieser Tabellen-Komponente manipulieren
                container.querySelectorAll('.forecast-view__cell-header, .forecast-view__cell-value')
                    .forEach(el => el.classList.remove('forecast-view__cell--active'));

                container.querySelectorAll(`[data-time="${currentKey}"]`)
                    .forEach(el => el.classList.add('forecast-view__cell--active'));
            };

            self.scrollActiveForecastHourToCenter = function () {
                // 🚀 SAUBER: Lokale Selektion schützt vor Konflikten mit anderen Leaflet-Controls
                const scrollBox = container.querySelector('.forecast-view__scroll-container');
                const activeTh = container.querySelector('.forecast-view__cell-header.forecast-view__cell--active');

                if (scrollBox && activeTh) {
                    scrollBox.scrollTo({
                        left: activeTh.offsetLeft - (scrollBox.clientWidth / 2) + (activeTh.clientWidth / 2),
                        behavior: 'smooth'
                    });
                }
            };

            // --- FIX HIER: e.detail ist direkt das übergebene Array aus dem Model ---
            weatherModel.addEventListener('model:forecast-data-updated', (e) => {
                self.renderTable(e.detail);
            });

            weatherModel.addEventListener('model:index-updated', () => {
                if (container.classList.contains('forecast-view--has-data')) {
                    self.highlightActiveForecastHour();
                    self.scrollActiveForecastHourToCenter();
                }
            });

            return container;
        }
    });

    L.control.forecastView = function (options) { return new L.Control.ForecastView(options); };
    map.forecastViewControl = L.control.forecastView().addTo(map);
}