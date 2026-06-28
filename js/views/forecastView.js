import { weatherModel } from '../weatherModel.js';

/**
 * Registers the forecast table control and binds it to model events.
 * @param {L.Map} map Leaflet map instance.
 * @returns {void}
 */
export function registerForecastView(map) {

    /**
     * Builds direction icon HTML with continuous rotation.
     * @param {number|null} direction Wind direction in degrees.
     * @returns {string} Direction icon HTML.
     */
    function renderDirectionIcon(direction) {
        if (direction === null || Number.isNaN(direction)) {
            return '<span class="forecast-view__dir-icon forecast-view__dir-icon--unknown">?</span>';
        }

        const normalizedDirection = ((direction % 360) + 360) % 360;
        const iconRotation = ((normalizedDirection + 90) % 360);
        return `<span class="forecast-view__dir-icon" style="--dir-deg:${iconRotation}deg">➤</span>`;
    }

    L.Control.ForecastView = L.Control.extend({
        options: { position: 'bottomleft' },
        onAdd: function (map) {
            const self = this;

            const container = L.DomUtil.create('div', 'forecast-view');
            // Prevents clicks on table from accidentally triggering map actions
            L.DomEvent.disableClickPropagation(container);

            container.innerHTML = `
                <div class="forecast-view__scroll-container">
                    <table class="forecast-view__table">
                        <tr class="forecast-view__row-header"></tr>
                        <tr class="forecast-view__row-values"></tr>
                        <tr class="forecast-view__row-gusts"></tr>
                        <tr class="forecast-view__row-direction"></tr>
                    </table>
                </div>
            `;

            // Pure render function for table
            self.renderTable = function (forecast) {
                if (!forecast) {
                    container.classList.remove('forecast-view--has-data');
                    return;
                }

                container.classList.add('forecast-view--has-data');

                const headerRow = container.querySelector('.forecast-view__row-header');
                const valuesRow = container.querySelector('.forecast-view__row-values');
                const gustsRow = container.querySelector('.forecast-view__row-gusts');
                const directionRow = container.querySelector('.forecast-view__row-direction');
                if (!headerRow || !valuesRow || !gustsRow || !directionRow) return;

                /**
                 * Maps wind speed to the color class used by forecast cells.
                 * @param {number} wind Wind speed in knots.
                 * @returns {string} CSS class name.
                 */
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
                let gustsHtml = '';
                let directionHtml = '';

                forecast.forEach(item => {
                    const colorClass = getColorClass(item.wind);
                    const formattedValue = item.wind >= 10 ? Math.round(item.wind) : item.wind.toFixed(1);
                    
                    // Böen analog zu Wind verarbeiten (Farbklasse & Rundung)
                    const gustColorClass = getColorClass(item.gust || 0);
                    const formattedGust = item.gust >= 10 ? Math.round(item.gust) : (item.gust ?? 0).toFixed(1);
                    
                    const directionIcon = renderDirectionIcon(item.direction);

                    headerHtml += `<th class="forecast-view__cell-header" data-time="${item.fullKey}">${item.hour}h</th>`;
                    valuesHtml += `<td class="forecast-view__cell-value ${colorClass}" data-time="${item.fullKey}">${formattedValue}</td>`;
                    // 🌟 KORREKTUR: Klassenstruktur exakt an das neue CSS angepasst für perfekte Symmetrie und Zentrierung
                    gustsHtml += `<td class="forecast-view__cell-value forecast-view__cell-gust ${gustColorClass}" data-time="${item.fullKey}">${formattedGust}</td>`;
                    directionHtml += `<td class="forecast-view__cell-direction" data-time="${item.fullKey}">${directionIcon}</td>`;
                });

                headerRow.innerHTML = headerHtml;
                valuesRow.innerHTML = valuesHtml;
                gustsRow.innerHTML = gustsHtml;
                directionRow.innerHTML = directionHtml;

                self.highlightActiveForecastHour();
                setTimeout(() => { self.scrollActiveForecastHourToCenter(); }, 50);
            };

            self.highlightActiveForecastHour = function () {
                const currentKey = weatherModel.activeTimestamp;
                if (!currentKey) return;

                container.querySelectorAll('.forecast-view__cell-header, .forecast-view__cell-value, .forecast-view__cell-gust, .forecast-view__cell-direction')
                    .forEach(el => el.classList.remove('forecast-view__cell--active'));

                container.querySelectorAll(`[data-time="${currentKey}"]`)
                    .forEach(el => el.classList.add('forecast-view__cell--active'));
            };

            self.scrollActiveForecastHourToCenter = function () {
                const scrollBox = container.querySelector('.forecast-view__scroll-container');
                const activeTh = container.querySelector('.forecast-view__cell-header.forecast-view__cell--active');

                if (scrollBox && activeTh) {
                    scrollBox.scrollTo({
                        left: activeTh.offsetLeft - (scrollBox.clientWidth / 2) + (activeTh.clientWidth / 2),
                        behavior: 'smooth'
                    });
                }
            };

            weatherModel.addEventListener('model:forecast-data-updated', (e) => {
                self.renderTable(e.detail);
            });

            weatherModel.addEventListener('model:timestamp-index-updated', () => {
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
