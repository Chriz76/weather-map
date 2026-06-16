import { state, setActiveTimestampIndex } from '../weatherModel.js';
import { formatToLocalTimeString } from '../utils/time.js'; // 👈 Deine bewährte Formatierung direkt importiert!

export function registerTimelineView(map) {
    // 1. Einheitlicher Leaflet-Klassenname: TimelineView
    L.Control.TimelineView = L.Control.extend({
        options: { position: 'bottomleft' },
        onAdd: function (map) {
            // 2. Hauptklasse auf das neue BEM-Muster umgestellt
            const container = L.DomUtil.create('div', 'timeline-view');
            L.DomEvent.disableClickPropagation(container);
            L.DomEvent.disableScrollPropagation(container);

            try {
                // 3. HTML-Struktur auf BEM-Klassen umgestellt (IDs entfernt)
                container.innerHTML = `
          <div class="timeline-view__time-display">--:--</div>
          <div class="timeline-view__slider-wrapper">
            <input type="range" 
                   class="timeline-view__slider" 
                   min="0" 
                   max="${Math.max(0, state.availableTimestamps.length - 1)}" 
                   value="${state.activeTimestampIndex}">
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
                const timeDisplay = container.querySelector('.timeline-view__time-display');

                // 4. Zentrale, interne Update-Funktion für die Zeitanzeige
                const updateTimeDisplay = () => {
                    if (!timeDisplay) return;
                    const currentKey = state.availableTimestamps[state.activeTimestampIndex];
                    if (currentKey) {
                        // Nutzt deine originale Logik aus den Utilities
                        timeDisplay.innerText = formatToLocalTimeString(currentKey);
                    } else {
                        timeDisplay.innerText = '--:--';
                    }
                };

                // Initiale Anzeige beim Laden direkt setzen
                updateTimeDisplay();

                // --- Event-Listener für Benutzer-Aktionen ---

                slider.addEventListener('input', (e) => {
                    const idx = parseInt(e.target.value, 10);
                    setActiveTimestampIndex(idx);
                    updateTimeDisplay(); // 👈 Aktualisiert sich sofort selbst!
                    window.dispatchEvent(new CustomEvent('timeline-change', { detail: { index: idx } }));
                });

                btnPrev.addEventListener('click', () => {
                    if (state.activeTimestampIndex > 0) {
                        const newIndex = state.activeTimestampIndex - 1;
                        setActiveTimestampIndex(newIndex);
                        slider.value = newIndex;
                        updateTimeDisplay(); // 👈 Aktualisiert sich sofort selbst!
                        window.dispatchEvent(new CustomEvent('timeline-change', { detail: { index: newIndex } }));
                    }
                });

                btnNext.addEventListener('click', () => {
                    if (state.activeTimestampIndex < state.availableTimestamps.length - 1) {
                        const newIndex = state.activeTimestampIndex + 1;
                        setActiveTimestampIndex(newIndex);
                        slider.value = newIndex;
                        updateTimeDisplay(); // 👈 Aktualisiert sich sofort selbst!
                        window.dispatchEvent(new CustomEvent('timeline-change', { detail: { index: newIndex } }));
                    }
                });

                // --- Event-Listener für Zustandsänderungen aus dem Modell ---

                window.addEventListener('state:timestampsUpdated', () => {
                    if (!slider) return;
                    slider.max = Math.max(0, state.availableTimestamps.length - 1);
                    slider.value = state.activeTimestampIndex;
                    updateTimeDisplay();
                });

                window.addEventListener('state:activeIndexUpdated', (e) => {
                    if (!slider) return;
                    const idx = e.detail && typeof e.detail.index === 'number' ? e.detail.index : state.activeTimestampIndex;
                    slider.value = idx;
                    updateTimeDisplay();
                });

            } catch (uiError) {
                console.error("🚨 Error building timeline UI element:", uiError.message);
            }

            return container;
        }
    });

    // 5. Factory-Methode und Registrierung angepasst
    L.control.timelineView = function (options) { return new L.Control.TimelineView(options); };
    map.timelineViewControl = L.control.timelineView().addTo(map);
}