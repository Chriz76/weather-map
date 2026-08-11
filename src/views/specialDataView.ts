import { commonDataModel } from '../models/commonDataModel';
import { uiStateModel } from '../models/uiStateModel';

const L = (window as any).L;
const TARGET_LAT = 47.6506;
const TARGET_LNG = 11.3365;
const MIN_ZOOM = 7;
const EXTERNAL_URL = 'https://christian-fey.github.io/Koechelt_der_Kochel/';

export const specialDataView = (() => {
  let map: any = null;
  let layerGroup: any = null;
  let marker: any = null;

  function createIcon(summary: string | null) {
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
      return bounds.contains((window as any).L.latLng(TARGET_LAT, TARGET_LNG));
    } catch (e) {
      return false;
    }
  }

  function renderBadge() {
    if (!shouldShowBadge()) {
      clearBadge();
      return;
    }

    if (!layerGroup) layerGroup = (window as any).L.layerGroup().addTo(map);

    if (!marker) {
      marker = (window as any).L.marker([TARGET_LAT, TARGET_LNG], { icon: createIcon(commonDataModel.specialDataSummary as any) });
      marker.on('click', () => window.open(EXTERNAL_URL, '_blank', 'noopener,noreferrer'));
      layerGroup.addLayer(marker);
    }

    marker.setIcon(createIcon(commonDataModel.specialDataSummary as any));
    marker.setLatLng([TARGET_LAT, TARGET_LNG]);
  }

  function clearBadge() {
    if (marker) {
      if (layerGroup) layerGroup.removeLayer(marker);
      marker = null;
    }
  }

  function init(mapInstance: any) {
    map = mapInstance;
    layerGroup = (window as any).L.layerGroup().addTo(map);
    commonDataModel.addEventListener('model:special-data-updated', renderBadge as EventListener);
    uiStateModel.addEventListener('ui:wind-measurements-visibility-changed', renderBadge as EventListener);
    map.on('move zoom moveend', renderBadge as any);
    renderBadge();
    return { refresh: renderBadge };
  }

  return { init, refresh: renderBadge };
})();
