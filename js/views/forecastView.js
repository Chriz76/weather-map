import { weatherModel } from '../weatherModel.js';

// 1. Export-Funktionsname angepasst auf "View"
export function registerForecastView(map) {

    // 2. Leaflet-Klassennamen konsequent auf "ForecastView" umgestellt
    L.Control.ForecastView = L.Control.extend({
        options: { position: 'bottomleft' },
        onAdd: function (map) {
            const self = this;
            const container = L.DomUtil.create('div', 'leaflet-weather-table-control');

            container.innerHTML = `
        <div class="forecast-scroll-container" id="forecast-scroll-box">
          <table class="forecast-table">
            <tr id="forecast-row-header"></tr>
            <tr id="forecast-row-values"></tr>
          </table>
        </div>
      `;

            // Reine Render-Funktion für die Tabelle
            self.renderTable = function (forecastData) {
                if (!forecastData) {
                    container.classList.remove('has-data');
                    return;
                }

                container.classList.add('has-data');
                const headerRow = document.getElementById('forecast-row-header');
                const valuesRow = document.getElementById('forecast-row-values');
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

                    headerHtml += `<th data-time="${item.fullKey}">${item.hour}h</th>`;
                    valuesHtml += `<td data-time="${item.fullKey}" class="${colorClass}">${formattedValue}</td>`;
                });

                headerRow.innerHTML = headerHtml;
                valuesRow.innerHTML = valuesHtml;

                self.highlightActiveForecastHour();
                setTimeout(() => { self.scrollActiveForecastHourToCenter(); }, 50);
            };

            self.highlightActiveForecastHour = function () {
                const currentKey = weatherModel.activeTimestamp;
                if (!currentKey) return;
                document.querySelectorAll('.forecast-table th, .forecast-table td').forEach(el => el.classList.remove('active-hour-column'));
                document.querySelectorAll(`.forecast-table [data-time="${currentKey}"]`).forEach(el => el.classList.add('active-hour-column'));
            };

            self.scrollActiveForecastHourToCenter = function () {
                const scrollBox = document.getElementById('forecast-scroll-box');
                const activeTh = document.querySelector('.forecast-table th.active-hour-column');
                if (scrollBox && activeTh) {
                    scrollBox.scrollTo({ left: activeTh.offsetLeft - (scrollBox.clientWidth / 2) + (activeTh.clientWidth / 2), behavior: 'smooth' });
                }
            };

            // Die View reagiert völlig passiv auf den berechneten State aus dem Modell
            weatherModel.addEventListener('model:interpolated-data-updated', (e) => {
                self.renderTable(e.detail.forecastData);
            });

            weatherModel.addEventListener('model:index-updated', () => {
                if (container.classList.contains('has-data')) {
                    self.highlightActiveForecastHour();
                    self.scrollActiveForecastHourToCenter();
                }
            });

            return container;
        }
    });

    // 3. Leaflet-Factory und globale Control-Instanz umbenannt
    L.control.forecastView = function (options) { return new L.Control.ForecastView(options); };
    map.forecastViewControl = L.control.forecastView().addTo(map);
}