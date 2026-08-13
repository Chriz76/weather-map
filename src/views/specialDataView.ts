import { commonDataModel } from '../models/commonDataModel';
import { uiStateModel } from '../models/uiStateModel';
import type { Map as LeafletMap, LayerGroup, Marker, LatLngExpression, DivIcon } from 'leaflet';
import L from '../lib/leaflet-wrapper';
const TARGET_LAT = 47.6506;
const TARGET_LNG = 11.3365;
const MIN_ZOOM = 7;
const EXTERNAL_URL = 'https://christian-fey.github.io/Koechelt_der_Kochel/';

export const specialDataView = (() => {
  let map: LeafletMap | null = null;
  let layerGroup: LayerGroup | null = null;
  let marker: Marker | null = null;

  function createIcon(summary: string | null): DivIcon {
    return L.divIcon({
      className: 'special-data-badge',
      html: `
                <div class="special-data-badge-inner">
                    <span>${summary}</span>
                </div>
            `,
      iconSize: [56, 20],
      iconAnchor: [28, 10]
    });
  }

  function shouldShowBadge(): boolean {
    if (!map || !uiStateModel.showWindMeasurements || !commonDataModel.specialDataSummary) return false;
    if (map.getZoom() < MIN_ZOOM) return false;

    const bounds = map.getBounds();
    if (!bounds || typeof bounds.contains !== 'function') return false;

    try {
      return bounds.contains(L.latLng(TARGET_LAT, TARGET_LNG));
    } catch (e) {
      return false;
    }
  }

  function renderBadge() {
    if (!shouldShowBadge()) {
      clearBadge();
      return;
    }

    if (!layerGroup && map) layerGroup = L.layerGroup().addTo(map) as LayerGroup;

    if (!marker && map) {
      const summary = typeof commonDataModel.specialDataSummary === 'string' ? commonDataModel.specialDataSummary : String(commonDataModel.specialDataSummary ?? '');
      marker = L.marker([TARGET_LAT, TARGET_LNG] as LatLngExpression, { icon: createIcon(summary) }) as Marker;
      marker.on('click', () => window.open(EXTERNAL_URL, '_blank', 'noopener,noreferrer'));
      if (layerGroup) layerGroup.addLayer(marker);
    }

    if (marker) {
      const summary = typeof commonDataModel.specialDataSummary === 'string' ? commonDataModel.specialDataSummary : String(commonDataModel.specialDataSummary ?? '');
      marker.setIcon(createIcon(summary));
      marker.setLatLng([TARGET_LAT, TARGET_LNG] as LatLngExpression);
    }
  }

  function clearBadge() {
    if (marker && layerGroup) {
      layerGroup.removeLayer(marker);
      marker = null;
    }
  }

  function init(mapInstance: LeafletMap) {
    map = mapInstance;
    layerGroup = L.layerGroup().addTo(map) as LayerGroup;
    commonDataModel.addEventListener('model:special-data-updated', renderBadge as EventListener);
    uiStateModel.addEventListener('ui:wind-measurements-visibility-changed', renderBadge as EventListener);
    map.on('move zoom moveend', renderBadge as any);
    renderBadge();
    return { refresh: renderBadge };
  }

  return { init, refresh: renderBadge };
})();
