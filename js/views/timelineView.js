import { weatherModel } from '../models/weatherDomainModel.js';
import { formatModelTimestampToTimeAndDescription } from '../utils/time.js';

// 1. Wir umgehen den UMD-Global-Fehler, indem wir L über window holen.
// 2. Wir casten es als 'any', damit wir '.TimelineView' dynamisch hinzufügen dürfen.
/** @type {any} */
const L = window.L;

/**
 * Registers the timeline control and binds model synchronization events.
 * @param {any} mapInstance - Die Leaflet-Map-Instanz
 * @returns {void}
 */
export function registerTimelineView(mapInstance) {
    // 1. Einheitlicher Leaflet-Klassenname: TimelineView
    L.Control.TimelineView = L.Control.extend({
        options: { position: 'bottomleft' },
        onAdd: function () { // <- Parameter einfach löschen!
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
                // Wir fügen ein '|| document.createElement('div')' als Fallback hinzu,
                // damit checkJs weiß, dass die Variablen danach garantiert existieren (nicht null sind).
                const slider = container.querySelector('.timeline-view__slider') || document.createElement('input');
                const btnPrev = container.querySelector('.timeline-view__nav-btn--prev') || document.createElement('button');
                const btnNext = container.querySelector('.timeline-view__nav-btn--next') || document.createElement('button');
                const timeMain = container.querySelector('.timeline-view__time-main');
                const timeSubtext = container.querySelector('.timeline-view__time-subtext');

                // 4. Central, internal update function for time display
                /**
                 * Renders the currently active timestamp in local time.
                 * @param {any} timestamp
                 * @returns {void}
                 */
                const updateTimeDisplay = (timestamp) => {
                    if (!timeMain || !timeSubtext) return;
                    
                    if (timestamp) {
                        // Nutzt die neue zentrale Formatierungs-Methode aus time.js
                        const { time, description } = formatModelTimestampToTimeAndDescription(timestamp);
                        
                        timeMain.innerText = time;
                        timeSubtext.innerText = description;
                    } else {
                        timeMain.innerText = '--:--';
                        timeSubtext.innerText = '--';
                    }
                };

                // Set initial display on load directly
                updateTimeDisplay(weatherModel.activeTimestamp);

                // --- Event listeners for user actions ---

                slider.addEventListener('input', (/** @type {any} */ e) => {
                    // Wir sagen dem Linter, dass e.target ein HTMLInputElement ist, damit 'value' erlaubt ist
                    const target = /** @type {HTMLInputElement} */ (e.target);
                    const idx = parseInt(target.value, 10);
                    window.dispatchEvent(new CustomEvent('ui:timeline-change', { detail: { index: idx } }));                
                });

                btnPrev.addEventListener('click', () => {
                    const activeIndex = weatherModel.activeTimestampIndex;
                    if (activeIndex > 0) {
                        const newIndex = activeIndex - 1;
                        // @ts-ignore
                        slider.value = newIndex;
                        window.dispatchEvent(new CustomEvent('ui:timeline-change', { detail: { index: newIndex } }));
                    }
                });

                btnNext.addEventListener('click', () => {
                    const activeIndex = weatherModel.activeTimestampIndex;

                    /** @type {any[]} */                    
                    const timestamps = weatherModel.availableTimestamps;
                    if (activeIndex < timestamps.length - 1) {
                        const newIndex = activeIndex + 1;
                        // @ts-ignore
                        slider.value = newIndex;
                        window.dispatchEvent(new CustomEvent('ui:timeline-change', { detail: { index: newIndex } }));
                    }
                });

                // --- Event listeners for state changes directly from model ---

                weatherModel.addEventListener('model:timestamps-updated', () => {
                    if (!slider) return;
                    // @ts-ignore
                    slider.max = Math.max(0, weatherModel.availableTimestamps.length - 1);
                    // @ts-ignore
                    slider.value = weatherModel.activeTimestampIndex;
                    updateTimeDisplay(weatherModel.activeTimestamp);
                });

                weatherModel.addEventListener('model:timestamp-index-updated', () => {
                    if (!slider) return;
                    // @ts-ignore
                    slider.value = weatherModel.activeTimestampIndex;
                    updateTimeDisplay(weatherModel.activeTimestamp);
                });

            } catch (uiError) {
                // @ts-ignore
                logger.error("🚨 Error building timeline UI element:", uiError.message);
            }

            return container;
        }
    });

    // 5. Factory method and registration adapted
    /**
     * @param {any} [options] - Optionale Einstellungen für das Control
     */    
    L.control.timelineView = function (options) { return new L.Control.TimelineView(options); };
    mapInstance.timelineViewControl = L.control.timelineView().addTo(mapInstance);
}