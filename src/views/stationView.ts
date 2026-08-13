import { commonDataModel } from '../models/commonDataModel';
import { uiStateModel } from '../models/uiStateModel';
import type { Station } from '../types';
import type { Map as LeafletMap, LayerGroup, Marker, DivIcon, LatLngExpression } from 'leaflet';
import * as L from 'leaflet';

export const stationView = (() => {
  let map: LeafletMap | null = null;
  let layerGroup: LayerGroup | null = null;
  let opts: { onMarkerClick?: (station: Station) => void } = {};
  const stationMarkerMap = new Map<string, Marker>();

  function createIcon(station: Station): DivIcon {
    const wd = station.windData ?? null;
    const hasData = wd !== null && typeof wd?.speed === 'number';
    const shouldShowValues = uiStateModel.showWindMeasurements && hasData;
    const speedValue = shouldShowValues ? String(Math.round(wd!.speed as number)) : '';
    const rotation = shouldShowValues && typeof wd?.direction === 'number' ? wd!.direction as number : null;
    const iconRotation = rotation === null ? null : (((rotation % 360) + 360) % 360 + 90) % 360;
    const arrowOpacity = shouldShowValues ? 1 : 0.25;

    return L.divIcon({
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
    if (!layerGroup) layerGroup = L.layerGroup().addTo(map);

    if (!uiStateModel.showWindMeasurements) {
      stationMarkerMap.forEach((marker) => {
        if (layerGroup) layerGroup.removeLayer(marker);
      });
      stationMarkerMap.clear();
      return;
    }

    const nextStationKeys = new Set<string>();

    stations.forEach((station) => {
      const sRec = station as Record<string, unknown>;
      const idRaw = sRec['id'] ?? sRec['station_id'];
      const stationKey = typeof idRaw === 'string' ? idRaw : (typeof idRaw === 'number' ? String(idRaw) : `${station.lat}-${station.lon}`);
      nextStationKeys.add(stationKey);
      const lat = Number(station.lat ?? 0);
      const lon = Number(station.lon ?? 0);

      const existingMarker = stationMarkerMap.get(stationKey) as Marker | undefined;
      const marker = existingMarker || L.marker([lat, lon] as LatLngExpression, { icon: createIcon(station) }) as Marker;

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
    layerGroup = L.layerGroup().addTo(map) as LayerGroup;
    commonDataModel.addEventListener('model:visible-stations-updated', handleVisibleStations as EventListener);
    uiStateModel.addEventListener('ui:wind-measurements-visibility-changed', handleVisibleStations as EventListener);

    if ((commonDataModel.visibleStations as Station[]) && (commonDataModel.visibleStations as Station[]).length) {
      renderStations(commonDataModel.visibleStations as Station[]);
    }
  }

  return { init };
})();
