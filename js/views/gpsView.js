import { weatherModel } from '../weatherModel.js';

/**
 * Registers a GPS control button and binds locating state updates.
 * @param {L.Map} map Leaflet map instance.
 * @param {Function} onGpsClick Callback triggered on control click.
 * @returns {void}
 */
export function registerGpsView(map, onGpsClick) {
    const GpsControl = L.Control.extend({
        options: {
            position: 'topright'
        },

        onAdd: function() {
            const container = L.DomUtil.create('div', 'leaflet-bar');
            const button = L.DomUtil.create('a', 'gps-view', container); 
            
            button.innerHTML = `
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <circle cx="12" cy="12" r="6" />
                <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
                <line x1="12" y1="2" x2="12" y2="5" />
                <line x1="12" y1="19" x2="12" y2="22" />
                <line x1="2" y1="12" x2="5" y2="12" />
                <line x1="19" y1="12" x2="22" y2="12" />
            </svg>`;
            button.title = 'Find my location';
            button.style.cursor = 'pointer';

            // Pass click to controller (main.js)
            L.DomEvent.on(button, 'click', (e) => {
                L.DomEvent.stopPropagation(e);
                L.DomEvent.preventDefault(e);
                
                if (onGpsClick) onGpsClick();
            });

            // React to state changes in model
            weatherModel.addEventListener('model:locating-changed', (e) => {
                const isLoading = e.detail;
                if (isLoading) {
                    button.classList.add('gps-view--active');
                } else {
                    button.classList.remove('gps-view--active');
                }
            });

            return container;
        }
    });

    map.addControl(new GpsControl());
}