// views/stationView.js
import { weatherModel } from '../models/weatherModel.js';

export const stationView = (() => {
    let map = null;
    let layerGroup = null;
    let opts = {};

    function createIcon(station) {
        const hasData = station.windData && typeof station.windData.windSpeed === 'number';
        const speedValue = hasData ? String(station.windData.windSpeed) : '--';
        const rotation = hasData ? station.windData.windDirection : null;
        const iconRotation = rotation === null ? null : (((rotation % 360) + 360) % 360 + 90) % 360;
        const arrowOpacity = hasData ? 1 : 0.25;

        return L.divIcon({
            className: 'station-badge',
            // keep original iconSize but reduce inner content width and prevent hand cursor on hover
            html: `
                <div class="station-badge-inner" style="width:36px; cursor:default;">
                    <span class="station-wind-small">
                        <span class="station-dir" style="--dir-deg:${iconRotation ?? 0}deg; opacity:${arrowOpacity}; display:inline-block; pointer-events:none;">➤</span>
                        <span class="station-speed" style="pointer-events:none;">${speedValue}</span>
                    </span>
                </div>
            `,
            iconSize: [60, 28],
            iconAnchor: [30, 14]
        });
    }

    function renderStations(stations = []) {
        if (!map) return;
        if (!layerGroup) layerGroup = L.layerGroup().addTo(map);
        layerGroup.clearLayers();

        stations.forEach(station => {
            const marker = L.marker([station.lat, station.lon], { icon: createIcon(station) });
            marker.on('click', () => {
                if (typeof opts.onMarkerClick === 'function') {
                    opts.onMarkerClick(marker.getLatLng(), station);
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

        // If there are already visible stations in the model, render them immediately
        if (weatherModel.visibleStations && weatherModel.visibleStations.length) {
            renderStations(weatherModel.visibleStations);
        }

        return {
            destroy() {
                weatherModel.removeEventListener('model:visible-stations-updated', handleVisibleStations);
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