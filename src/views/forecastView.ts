const L = (window as unknown as { L: any }).L; // access global Leaflet via window, typed minimally
import { weatherProviderModel } from '../models/weatherProviderModel';
import type { Map as LeafletMap } from 'leaflet';
import type { ForecastItem } from '../types';

function renderDirectionIcon(direction: number | null) {
  if (direction === null || Number.isNaN(direction)) return '<span class="forecast-view__dir-icon forecast-view__dir-icon--unknown">?</span>';
  const normalizedDirection = ((direction % 360) + 360) % 360;
  const iconRotation = ((normalizedDirection + 90) % 360);
  return `<span class="forecast-view__dir-icon" style="--dir-deg:${iconRotation}deg">➤</span>`;
}

export function registerForecastView(map: LeafletMap): void {
  L.Control.ForecastView = L.Control.extend({
    options: { position: 'bottomleft' },
    onAdd: function () {
      type ForecastControl = {
        renderTable?: (forecast: ForecastItem[] | null) => void;
        highlightActiveForecastHour?: () => void;
        scrollActiveForecastHourToCenter?: () => void;
      };
      const self = this as unknown as ForecastControl; // narrow 'this' to ForecastControl for internal methods
      const container = L.DomUtil.create('div', 'forecast-view');
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

      container.addEventListener('click', (ev: Event) => {
        L.DomEvent.stop(ev as any);
        const target = ev.target as HTMLElement;
        const cell = target.closest('[data-time]') as HTMLElement | null;
        if (!cell) return;
        const timeKey = cell.getAttribute('data-time');
        if (!timeKey) return;
        const idx = (weatherProviderModel.availableTimestamps as string[]).indexOf(timeKey);
        if (idx >= 0) window.dispatchEvent(new CustomEvent('ui:timeline-change', { detail: { index: idx } }));
      });

      self.renderTable = function (forecast: ForecastItem[] | null) {
        if (!forecast) {
          container.classList.remove('forecast-view--has-data');
          return;
        }

        container.classList.add('forecast-view--has-data');

        const headerRow = container.querySelector('.forecast-view__row-header') as HTMLElement | null;
        const valuesRow = container.querySelector('.forecast-view__row-values') as HTMLElement | null;
        const gustsRow = container.querySelector('.forecast-view__row-gusts') as HTMLElement | null;
        const directionRow = container.querySelector('.forecast-view__row-direction') as HTMLElement | null;
        if (!headerRow || !valuesRow || !gustsRow || !directionRow) return;

        function getColorClass(wind: number) {
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

        forecast.forEach((item: ForecastItem) => {
          const colorClass = getColorClass(item.wind ?? 0);
          const formattedValue = (item.wind == null) ? '--' : (item.wind >= 10 ? Math.round(item.wind) : item.wind.toFixed(1));
          const gustColorClass = getColorClass(item.gust ?? 0);
          const formattedGust = (item.gust == null) ? '--' : (item.gust >= 10 ? Math.round(item.gust) : item.gust.toFixed(1));
          const directionIcon = renderDirectionIcon(item.direction);
          const displayHour = (typeof item.hour === 'string' && item.hour.indexOf(':') !== -1) ? item.hour : `${item.hour}h`;
          headerHtml += `<th class="forecast-view__cell-header" data-time="${item.fullKey}">${displayHour}</th>`;
          valuesHtml += `<td class="forecast-view__cell-value ${colorClass}" data-time="${item.fullKey}">${formattedValue}</td>`;
          gustsHtml += `<td class="forecast-view__cell-value forecast-view__cell-gust ${gustColorClass}" data-time="${item.fullKey}">${formattedGust}</td>`;
          directionHtml += `<td class="forecast-view__cell-direction" data-time="${item.fullKey}">${directionIcon}</td>`;
        });

        headerRow.innerHTML = headerHtml;
        valuesRow.innerHTML = valuesHtml;
        gustsRow.innerHTML = gustsHtml;
        directionRow.innerHTML = directionHtml;

        self.highlightActiveForecastHour!();
        setTimeout(() => { self.scrollActiveForecastHourToCenter!(); }, 50);
      };

      self.highlightActiveForecastHour = function () {
        const currentKey = weatherProviderModel.activeTimestamp;
        if (!currentKey) return;

        const activeElements = container.querySelectorAll('.forecast-view__cell-header, .forecast-view__cell-value, .forecast-view__cell-gust, .forecast-view__cell-direction') as NodeListOf<Element>;
        activeElements.forEach((el) => el.classList.remove('forecast-view__cell--active'));

        const highlightedElements = container.querySelectorAll(`[data-time="${currentKey}"]`) as NodeListOf<Element>;
        highlightedElements.forEach((el) => el.classList.add('forecast-view__cell--active'));
      };

      self.scrollActiveForecastHourToCenter = function () {
        const scrollBox = container.querySelector('.forecast-view__scroll-container') as HTMLElement | null;
        const activeTh = container.querySelector('.forecast-view__cell-header.forecast-view__cell--active') as HTMLElement | null;
        if (scrollBox && activeTh) {
          scrollBox.scrollTo({ left: activeTh.offsetLeft - (scrollBox.clientWidth / 2) + (activeTh.clientWidth / 2), behavior: 'smooth' });
        }
      };

      weatherProviderModel.addEventListener('model:forecast-data-updated', () => { self.renderTable?.(weatherProviderModel.forecast as ForecastItem[] | null); });
      weatherProviderModel.addEventListener('model:timestamp-index-updated', () => {
        if (container.classList.contains('forecast-view--has-data')) {
          self.highlightActiveForecastHour?.();
          self.scrollActiveForecastHourToCenter?.();
        }
      });

      return container;
    }
  });

  L.control.forecastView = function (options?: unknown) { return new (L.Control as any).ForecastView(options); };
  (map as any).forecastViewControl = L.control.forecastView().addTo(map);
}
