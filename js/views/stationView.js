// views/stationView.js
import { weatherModel } from '../models/weatherDomainModel.js';
import { weatherUi } from '../models/weatherUiModel.js';

export const stationView = (() => {
    let map = null;
    let layerGroup = null;
    let opts = {};

    function createIcon(station) {
        const hasData = station.windData && typeof station.windData.windSpeed === 'number';
        const shouldShowValues = weatherUi.showWindMeasurements && hasData;
        const speedValue = shouldShowValues ? String(Math.round(station.windData.windSpeed)) : '';
        const rotation = shouldShowValues ? station.windData.windDirection : null;
        const iconRotation = rotation === null ? null : (((rotation % 360) + 360) % 360 + 90) % 360;
        const arrowOpacity = shouldShowValues ? 1 : 0.25;

        return L.divIcon({
            className: 'station-badge',
            // keep original iconSize but reduce inner content width and prevent hand cursor on hover
            html: `
                <div class="station-badge-inner" style="cursor:default;">
                    <span class="station-wind-small">
                        <span class="station-dir" style="--dir-deg:${iconRotation ?? 0}deg; opacity:${arrowOpacity}; display:inline-block; pointer-events:none;">➤</span>
                        ${shouldShowValues ? `<span class="station-speed" style="pointer-events:none;">${speedValue}</span>` : ''}
                    </span>
                </div>
            `,
            iconSize: [50, 20],
            iconAnchor: [25, 10]
        });
    }

    function renderStations(stations = []) {
        if (!map) return;
        if (!layerGroup) layerGroup = L.layerGroup().addTo(map);
        layerGroup.clearLayers();

        if (!weatherUi.showWindMeasurements) {
            return;
        }

        stations.forEach(station => {
            const marker = L.marker([station.lat, station.lon], { icon: createIcon(station) });
            marker.on('click', () => {
                if (typeof opts.onMarkerClick === 'function') {
                    opts.onMarkerClick(station);
                }
            });
            layerGroup.addLayer(marker);
        });
    }

    function handleVisibleStations() {
        renderStations(weatherModel.visibleStations);
    }

    function init(mapInstance, options = {}) {
        map = mapInstance;
        opts = options || {};
        layerGroup = L.layerGroup().addTo(map);
        weatherModel.addEventListener('model:visible-stations-updated', handleVisibleStations);
        weatherUi.addEventListener('ui:wind-measurements-visibility-changed', handleVisibleStations);

        // If there are already visible stations in the model, render them immediately
        if (weatherModel.visibleStations && weatherModel.visibleStations.length) {
            renderStations(weatherModel.visibleStations);
        }

        return {
            destroy() {
                weatherModel.removeEventListener('model:visible-stations-updated', handleVisibleStations);
                weatherUi.removeEventListener('ui:wind-measurements-visibility-changed', handleVisibleStations);
                if (layerGroup) {
                    layerGroup.clearLayers();
                    map.removeLayer(layerGroup);
                    layerGroup = null;
                }
            }
        };
    }

    return { init };
})();