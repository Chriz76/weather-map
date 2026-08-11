// views/stationView.js
import { commonDataModel } from '../models/commonDataModel';
import { uiStateModel } from '../models/uiStateModel';

export const stationView = (() => {
    let map = null;
    let layerGroup = null;
    let opts = {};
    const stationMarkerMap = new Map();

    function createIcon(station) {
        const hasData = station.windData && typeof station.windData.windSpeed === 'number';
        const shouldShowValues = uiStateModel.showWindMeasurements && hasData;
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

        if (!uiStateModel.showWindMeasurements) {
            stationMarkerMap.forEach((marker) => {
                layerGroup.removeLayer(marker);
            });
            stationMarkerMap.clear();
            return;
        }

        const nextStationKeys = new Set();

        stations.forEach(station => {
            const stationKey = station.id ?? station.station_id ?? `${station.lat}-${station.lon}`;
            nextStationKeys.add(stationKey);

            const existingMarker = stationMarkerMap.get(stationKey);
            const marker = existingMarker || L.marker([station.lat, station.lon], { icon: createIcon(station) });

            marker.setIcon(createIcon(station));
            marker.setLatLng([station.lat, station.lon]);
            marker.off('click');
            marker.on('click', () => {
                if (typeof opts.onMarkerClick === 'function') {
                    opts.onMarkerClick(station);
                }
            });

            if (!existingMarker) {
                stationMarkerMap.set(stationKey, marker);
                layerGroup.addLayer(marker);
            }
        });

        stationMarkerMap.forEach((marker, stationKey) => {
            if (!nextStationKeys.has(stationKey)) {
                layerGroup.removeLayer(marker);
                stationMarkerMap.delete(stationKey);
            }
        });
    }

    function handleVisibleStations() {
        renderStations(commonDataModel.visibleStations);
    }

    function init(mapInstance, options = {}) {
        map = mapInstance;
        opts = options || {};
        layerGroup = L.layerGroup().addTo(map);
        commonDataModel.addEventListener('model:visible-stations-updated', handleVisibleStations);
        uiStateModel.addEventListener('ui:wind-measurements-visibility-changed', handleVisibleStations);

        // If there are already visible stations in the model, render them immediately
        if (commonDataModel.visibleStations && commonDataModel.visibleStations.length) {
            renderStations(commonDataModel.visibleStations);
        }
    }

    return { init };
})();