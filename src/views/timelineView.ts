import { weatherProviderModel } from '../models/weatherProviderModel';
import { formatModelTimestampToTimeAndDescription } from '../utils/time';
import { logger } from '../utils/logger';
import * as L from 'leaflet';
import type { Map as LeafletMap } from 'leaflet';


export function registerTimelineView(mapInstance: LeafletMap): void {
  class TimelineControl extends L.Control {
    constructor() {
      super({ position: 'bottomleft' });
    }

    onAdd(): HTMLElement {
      const container = L.DomUtil.create('div', 'timeline-view');
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.disableScrollPropagation(container);

      try {
        const totalTimestamps = weatherProviderModel.availableTimestamps.length;

        container.innerHTML = `
          <div class="timeline-view__time-display">
            <span class="timeline-view__time-main">--:--</span>
            <span class="timeline-view__time-subtext">--</span>
          </div>
          <div class="timeline-view__slider-wrapper">
            <input type="range" 
                   class="timeline-view__slider" 
                   min="0" 
                   max="${Math.max(0, totalTimestamps - 1)}" 
                   value="${weatherProviderModel.activeTimestampIndex}">
          </div>
          <div class="timeline-view__navigation">
            <button class="timeline-view__nav-btn timeline-view__nav-btn--prev">&#10094;</button>
            <button class="timeline-view__nav-btn timeline-view__nav-btn--next">&#10095;</button>
          </div>
        `;

        const slider = (container.querySelector('.timeline-view__slider') as HTMLInputElement) || document.createElement('input');
        const btnPrev = (container.querySelector('.timeline-view__nav-btn--prev') as HTMLButtonElement) || document.createElement('button');
        const btnNext = (container.querySelector('.timeline-view__nav-btn--next') as HTMLButtonElement) || document.createElement('button');
        const timeMain = container.querySelector('.timeline-view__time-main') as HTMLElement | null;
        const timeSubtext = container.querySelector('.timeline-view__time-subtext') as HTMLElement | null;

        const updateTimeDisplay = (timestamp: string | null) => {
          if (!timeMain || !timeSubtext) return;
          if (timestamp) {
            const { time, description } = formatModelTimestampToTimeAndDescription(timestamp);
            timeMain.innerText = time;
            timeSubtext.innerText = description;
          } else {
            timeMain.innerText = '--:--';
            timeSubtext.innerText = '--';
          }
        };

        updateTimeDisplay(weatherProviderModel.activeTimestamp);

        slider.addEventListener('input', (e: Event) => {
          const target = e.target as HTMLInputElement;
          const idx = parseInt(target.value, 10);
          window.dispatchEvent(new CustomEvent('ui:timeline-change', { detail: { index: idx } }));
        });

        btnPrev.addEventListener('click', () => {
          const activeIndex = weatherProviderModel.activeTimestampIndex;
          if (activeIndex > 0) {
            const newIndex = activeIndex - 1;
            slider.value = String(newIndex);
            window.dispatchEvent(new CustomEvent('ui:timeline-change', { detail: { index: newIndex } }));
          }
        });

        btnNext.addEventListener('click', () => {
          const activeIndex = weatherProviderModel.activeTimestampIndex;
          const timestamps = weatherProviderModel.availableTimestamps as string[];
          if (activeIndex < timestamps.length - 1) {
            const newIndex = activeIndex + 1;
            slider.value = String(newIndex);
            window.dispatchEvent(new CustomEvent('ui:timeline-change', { detail: { index: newIndex } }));
          }
        });

        weatherProviderModel.addEventListener('model:timestamps-updated', () => {
          slider.max = String(Math.max(0, weatherProviderModel.availableTimestamps.length - 1));
          slider.value = String(weatherProviderModel.activeTimestampIndex);
          updateTimeDisplay(weatherProviderModel.activeTimestamp);
        });

        weatherProviderModel.addEventListener('model:timestamp-index-updated', () => {
          slider.value = String(weatherProviderModel.activeTimestampIndex);
          updateTimeDisplay(weatherProviderModel.activeTimestamp);
        });

      } catch (uiError: unknown) {
        const msg = uiError instanceof Error ? uiError.message : String(uiError);
        logger.error('🚨 Error building timeline UI element:', msg);
      }

      return container;
    }
  }

  const control = new TimelineControl();
  control.addTo(mapInstance);
  (mapInstance as unknown as Record<string, unknown>)['timelineViewControl'] = control;
}
