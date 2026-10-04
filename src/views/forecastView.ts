import * as L from 'leaflet';
import { weatherProviderModel } from '../models/weatherProviderModel';
import * as timeUtils from '../utils/time';
import type { Map as LeafletMap } from 'leaflet';
import type { ForecastItem } from '../types';

function renderDirectionIcon(direction: number | null): string {
  if (direction === null || Number.isNaN(direction)) return '<span class="forecast-view__dir-icon forecast-view__dir-icon--unknown">?</span>';
  const normalizedDirection = ((direction % 360) + 360) % 360;
  const iconRotation = ((normalizedDirection + 90) % 360);
  return `<span class="forecast-view__dir-icon" style="--dir-deg:${iconRotation}deg">➤</span>`;
}

/**
 * Bottom-left forecast table control.
 *
 * Extending `L.Control` (instead of `L.Control.extend`) keeps `this` and the control's
 * own methods fully typed, so no casts or non-null assertions are needed.
 */
class ForecastControl extends L.Control {
  private container: HTMLElement | null = null;
  private renderedForecast: ForecastItem[] | null = null;

  constructor(options?: L.ControlOptions) {
    super({ position: options?.position ?? 'bottomleft' });
  }

  onAdd(): HTMLElement {
    const container = L.DomUtil.create('div', 'forecast-view');
    L.DomEvent.disableClickPropagation(container);
    this.container = container;

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
      L.DomEvent.stop(ev);
      const target = ev.target as HTMLElement;
      const cell = target.closest('[data-time]') as HTMLElement | null;
      if (!cell) return;
      const timeKey = cell.getAttribute('data-time');
      if (!timeKey) return;
      const matchedIdx = timeUtils.findMatchingTimestampIndexBy(weatherProviderModel.availableTimestamps, timeKey, (item) => item);
      if (matchedIdx >= 0) window.dispatchEvent(new CustomEvent('ui:timeline-change', { detail: { index: matchedIdx } }));
    });

    weatherProviderModel.addEventListener('model:forecast-data-updated', this.handleForecastDataUpdated);
    weatherProviderModel.addEventListener('model:timestamp-index-updated', this.handleTimestampIndexUpdated);

    return container;
  }

  onRemove(): void {
    weatherProviderModel.removeEventListener('model:forecast-data-updated', this.handleForecastDataUpdated);
    weatherProviderModel.removeEventListener('model:timestamp-index-updated', this.handleTimestampIndexUpdated);
    this.container = null;
    this.renderedForecast = null;
  }

  private handleForecastDataUpdated = (): void => {
    this.renderTable(weatherProviderModel.forecast);
  };

  private handleTimestampIndexUpdated = (): void => {
    if (this.container?.classList.contains('forecast-view--has-data')) {
      this.highlightActiveForecastHour();
      this.scrollActiveForecastHourToCenter();
    }
  };

  /** Renders (or clears) the forecast table. */
  renderTable(forecast: ForecastItem[] | null): void {
    const container = this.container;
    if (!container) return;

    this.renderedForecast = forecast;
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

    function getColorClass(wind: number): string {
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

    this.highlightActiveForecastHour();
    window.setTimeout(() => { this.scrollActiveForecastHourToCenter(); }, 50);
  }

  /** Marks the column matching the active timestamp. */
  highlightActiveForecastHour(): void {
    const container = this.container;
    if (!container) return;

    const currentKey = weatherProviderModel.activeTimestamp;
    if (!currentKey) return;

    const renderedForecast = this.renderedForecast;
    if (!renderedForecast || renderedForecast.length === 0) return;

    const activeElements = container.querySelectorAll('.forecast-view__cell-header, .forecast-view__cell-value, .forecast-view__cell-gust, .forecast-view__cell-direction');
    activeElements.forEach((el) => el.classList.remove('forecast-view__cell--active'));

    const matchedIndex = timeUtils.findMatchingTimestampIndexBy(renderedForecast, currentKey, (item) => item.fullKey);
    const matchedKey = matchedIndex >= 0 ? renderedForecast[matchedIndex]?.fullKey ?? null : null;
    if (!matchedKey) return;

    const highlightedElements = container.querySelectorAll(`[data-time="${matchedKey}"]`);
    highlightedElements.forEach((el) => el.classList.add('forecast-view__cell--active'));
  }

  /** Scrolls the active column into the horizontal centre of the table viewport. */
  scrollActiveForecastHourToCenter(): void {
    const container = this.container;
    if (!container) return;

    const scrollBox = container.querySelector('.forecast-view__scroll-container') as HTMLElement | null;
    const activeTh = container.querySelector('.forecast-view__cell-header.forecast-view__cell--active') as HTMLElement | null;
    if (scrollBox && activeTh) {
      scrollBox.scrollTo({ left: activeTh.offsetLeft - (scrollBox.clientWidth / 2) + (activeTh.clientWidth / 2), behavior: 'smooth' });
    }
  }
}

/**
 * Creates the forecast control, registers the `L.control.forecastView` factory and adds it to the map.
 * @param map Leaflet map instance to attach the control to.
 */
export function registerForecastView(map: LeafletMap): void {
  L.control.forecastView = (options?: L.ControlOptions) => new ForecastControl(options);
  map.forecastViewControl = L.control.forecastView().addTo(map);
}
