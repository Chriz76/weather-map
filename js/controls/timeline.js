import { state, setActiveTimestampIndex } from '../state.js';

export function registerTimelineControl(map) {
  L.Control.WeatherTimeline = L.Control.extend({
    options: { position: 'bottomleft' },
    onAdd: function (map) {
      const container = L.DomUtil.create('div', 'leaflet-weather-timeline');
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.disableScrollPropagation(container);

      try {
        container.innerHTML = `
          <div class="timeline-time-display" id="timeline-time-display">--:--</div>
          <div class="timeline-slider-wrapper">
            <input type="range" class="timeline-slider" id="time-slider" min="0" max="${Math.max(0, state.availableTimestamps.length - 1)}" value="${state.activeTimestampIndex}">
          </div>
          <div class="timeline-navigation">
            <button class="timeline-nav-btn" id="btn-prev">&#10094;</button>
            <button class="timeline-nav-btn" id="btn-next">&#10095;</button>
          </div>
        `;

        const slider = container.querySelector('#time-slider');
        const btnPrev = container.querySelector('#btn-prev');
        const btnNext = container.querySelector('#btn-next');

        slider.addEventListener('input', (e) => {
          const idx = parseInt(e.target.value, 10);
          setActiveTimestampIndex(idx);
          window.dispatchEvent(new CustomEvent('timeline-change', { detail: { index: idx } }));
        });

        btnPrev.addEventListener('click', () => {
          if (state.activeTimestampIndex > 0) {
            const newIndex = state.activeTimestampIndex - 1;
            setActiveTimestampIndex(newIndex);
            slider.value = newIndex;
            window.dispatchEvent(new CustomEvent('timeline-change', { detail: { index: newIndex } }));
          }
        });

        btnNext.addEventListener('click', () => {
          if (state.activeTimestampIndex < state.availableTimestamps.length - 1) {
            const newIndex = state.activeTimestampIndex + 1;
            setActiveTimestampIndex(newIndex);
            slider.value = newIndex;
            window.dispatchEvent(new CustomEvent('timeline-change', { detail: { index: newIndex } }));
          }
        });

        // Update slider when timestamps change
        window.addEventListener('state:timestampsUpdated', () => {
          slider.max = Math.max(0, state.availableTimestamps.length - 1);
          slider.value = state.activeTimestampIndex;
        });

        // Update slider when active index updated elsewhere
        window.addEventListener('state:activeIndexUpdated', (e) => {
          const idx = e.detail && typeof e.detail.index === 'number' ? e.detail.index : state.activeTimestampIndex;
          slider.value = idx;
        });

      } catch (uiError) {
        console.error("\uD83D\uDEA8 Error building timeline UI element:", uiError.message);
      }

      return container;
    }
  });

  L.control.weatherTimeline = function (options) { return new L.Control.WeatherTimeline(options); };
  L.control.weatherTimeline().addTo(map);
}
