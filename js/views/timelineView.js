import { weatherModel } from '../weatherModel.js';
import { formatToLocalTimeAndDescription } from '../utils/time.js';

/**
 * Registers the timeline control and binds model synchronization events.
 * @param {L.Map} map Leaflet map instance.
 * @returns {void}
 */
export function registerTimelineView(map) {
    // 1. Einheitlicher Leaflet-Klassenname: TimelineView
    L.Control.TimelineView = L.Control.extend({
        options: { position: 'bottomleft' },
        onAdd: function (map) {
            // 2. Main class switched to BEM pattern
            const container = L.DomUtil.create('div', 'timeline-view');
            L.DomEvent.disableClickPropagation(container);
            L.DomEvent.disableScrollPropagation(container);

            try {
                const totalTimestamps = weatherModel.availableTimestamps.length;

                // 3. HTML structure with main time and subtext elements
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
                   value="${weatherModel.activeTimestampIndex}">
          </div>
          <div class="timeline-view__navigation">
            <button class="timeline-view__nav-btn timeline-view__nav-btn--prev">&#10094;</button>
            <button class="timeline-view__nav-btn timeline-view__nav-btn--next">&#10095;</button>
          </div>
        `;

                // Elemente sicher und lokal innerhalb des Containers greifen
                const slider = container.querySelector('.timeline-view__slider');
                const btnPrev = container.querySelector('.timeline-view__nav-btn--prev');
                const btnNext = container.querySelector('.timeline-view__nav-btn--next');
                const timeMain = container.querySelector('.timeline-view__time-main');
                const timeSubtext = container.querySelector('.timeline-view__time-subtext');

                // 4. Central, internal update function for time display
                /**
                 * Renders the currently active timestamp in local time.
                 * @returns {void}
                 */
                const updateTimeDisplay = () => {
                    if (!timeMain || !timeSubtext) return;
                    const currentKey = weatherModel.activeTimestamp; // Uses convenient model getter
                    
                    if (currentKey) {
                        // Nutzt die neue zentrale Formatierungs-Methode aus time.js
                        const { time, description } = formatToLocalTimeAndDescription(currentKey);
                        
                        timeMain.innerText = time;
                        timeSubtext.innerText = description;
                    } else {
                        timeMain.innerText = '--:--';
                        timeSubtext.innerText = '--';
                    }
                };

                // Set initial display on load directly
                updateTimeDisplay();

                // --- Event listeners for user actions ---

                slider.addEventListener('input', (e) => {
                    const idx = parseInt(e.target.value, 10);
                    weatherModel.setActiveTimestampIndex(idx);
                    updateTimeDisplay();
                    window.dispatchEvent(new CustomEvent('timeline-change', { detail: { index: idx } }));
                });

                btnPrev.addEventListener('click', () => {
                    const activeIndex = weatherModel.activeTimestampIndex;
                    if (activeIndex > 0) {
                        const newIndex = activeIndex - 1;
                        weatherModel.setActiveTimestampIndex(newIndex);
                        slider.value = newIndex;
                        updateTimeDisplay();
                        window.dispatchEvent(new CustomEvent('timeline-change', { detail: { index: newIndex } }));
                    }
                });

                btnNext.addEventListener('click', () => {
                    const activeIndex = weatherModel.activeTimestampIndex;
                    const timestamps = weatherModel.availableTimestamps;
                    if (activeIndex < timestamps.length - 1) {
                        const newIndex = activeIndex + 1;
                        weatherModel.setActiveTimestampIndex(newIndex);
                        slider.value = newIndex;
                        updateTimeDisplay();
                        window.dispatchEvent(new CustomEvent('timeline-change', { detail: { index: newIndex } }));
                    }
                });

                // --- Event listeners for state changes directly from model ---

                weatherModel.addEventListener('model:timestamps-updated', () => {
                    if (!slider) return;
                    slider.max = Math.max(0, weatherModel.availableTimestamps.length - 1);
                    slider.value = weatherModel.activeTimestampIndex;
                    updateTimeDisplay();
                });

                weatherModel.addEventListener('model:timestamp-index-updated', (e) => {
                    if (!slider) return;
                    const idx = e.detail && typeof e.detail === 'number' ? e.detail : weatherModel.activeTimestampIndex;
                    slider.value = idx;
                    updateTimeDisplay();
                });

            } catch (uiError) {
                console.error("🚨 Error building timeline UI element:", uiError.message);
            }

            return container;
        }
    });

    // 5. Factory method and registration adapted
    L.control.timelineView = function (options) { return new L.Control.TimelineView(options); };
    map.timelineViewControl = L.control.timelineView().addTo(map);
}
