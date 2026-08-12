import { commonDataModel } from '../models/commonDataModel';
import { uiStateModel } from '../models/uiStateModel';
import { getStationKey } from '../utils/stationKey';
import type { Station } from '../types';
import type { Map as LeafletMap, LayerGroup, Marker, DivIcon, LatLngExpression } from 'leaflet';

export const stationView = (() => {
  let map: LeafletMap | null = null;
  let layerGroup: LayerGroup | null = null;
  let opts: { onMarkerClick?: (station: Station) => void } = {};
  const stationMarkerMap = new Map<string, Marker>();

  function createIcon(station: Station): DivIcon {
    const hasData = station.windData && typeof (station.windData as any).windSpeed === 'number';
    const shouldShowValues = uiStateModel.showWindMeasurements && hasData;
    const speedValue = shouldShowValues ? String(Math.round((station.windData as any).windSpeed)) : '';
    const rotation = shouldShowValues ? (station.windData as any).windDirection : null;
    const iconRotation = rotation === null ? null : (((rotation % 360) + 360) % 360 + 90) % 360;
    const arrowOpacity = shouldShowValues ? 1 : 0.25;

    return (window as any).L.divIcon({
      className: 'station-badge',
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

  function renderStations(stations: Station[] = []) {
    if (!map) return;
    if (!layerGroup) layerGroup = (window as any).L.layerGroup().addTo(map);

    if (!uiStateModel.showWindMeasurements) {
      stationMarkerMap.forEach((marker) => {
        if (layerGroup) layerGroup.removeLayer(marker);
      });
      stationMarkerMap.clear();
      return;
    }

    const nextStationKeys = new Set<string>();

    stations.forEach((station) => {
      const stationKey = getStationKey(station);
      nextStationKeys.add(stationKey);
      const lat = Number(station.lat ?? 0);
      const lon = Number(station.lon ?? 0);

      const existingMarker = stationMarkerMap.get(stationKey) as Marker | undefined;
      const marker = existingMarker || (window as any).L.marker([lat, lon] as LatLngExpression, { icon: createIcon(station) }) as Marker;

      marker.setIcon(createIcon(station));
      marker.setLatLng([lat, lon] as LatLngExpression);
      marker.off('click');
      marker.on('click', () => {
        if (typeof opts.onMarkerClick === 'function') {
          opts.onMarkerClick(station);
        }
      });

      if (!existingMarker) {
        stationMarkerMap.set(stationKey, marker);
        if (layerGroup) layerGroup.addLayer(marker);
      }
    });

    stationMarkerMap.forEach((marker, stationKey) => {
      if (!nextStationKeys.has(stationKey)) {
        if (layerGroup) layerGroup.removeLayer(marker);
        stationMarkerMap.delete(stationKey);
      }
    });
  }

  function handleVisibleStations() {
    renderStations(commonDataModel.visibleStations as Station[]);
  }

  function init(mapInstance: LeafletMap, options: { onMarkerClick?: (station: Station) => void } = {}) {
    map = mapInstance;
    opts = options || {};
    layerGroup = (window as any).L.layerGroup().addTo(map) as LayerGroup;
    commonDataModel.addEventListener('model:visible-stations-updated', handleVisibleStations as EventListener);
    uiStateModel.addEventListener('ui:wind-measurements-visibility-changed', handleVisibleStations as EventListener);

    if ((commonDataModel.visibleStations as Station[]) && (commonDataModel.visibleStations as Station[]).length) {
      renderStations(commonDataModel.visibleStations as Station[]);
    }
  }

  return { init };
})();
