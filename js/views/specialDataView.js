/* global L */
/** @type {any} */
const L = window.L;

import { appModel } from '../models/appModel.js';
import { uiModel } from '../models/uiModel.js';

const TARGET_LAT = 47.6506;
const TARGET_LNG = 11.3365;
const MIN_ZOOM = 7;
const EXTERNAL_URL = 'https://christian-fey.github.io/Koechelt_der_Kochel/';

export const specialDataView = (() => {
    let map = null;
    let layerGroup = null;
    let marker = null;

    function createIcon(summary) {
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

    function shouldShowBadge() {
        if (!map || !uiModel.showWindMeasurements || !appModel.specialDataSummary) return false;
        if (map.getZoom() < MIN_ZOOM) return false;

        const bounds = map.getBounds();
        if (!bounds || typeof bounds.contains !== 'function') {
            return false;
        }

        return bounds.contains(L.latLng(TARGET_LAT, TARGET_LNG));
    }

    function renderBadge() {
        if (!shouldShowBadge()) {
            clearBadge();
            return;
        }

        if (!layerGroup) {
            layerGroup = L.layerGroup().addTo(map);
        }

        if (!marker) {
            marker = L.marker([TARGET_LAT, TARGET_LNG], { icon: createIcon(appModel.specialDataSummary) });
            marker.on('click', () => {
                window.open(EXTERNAL_URL, '_blank', 'noopener,noreferrer');
            });
            layerGroup.addLayer(marker);
        }

        marker.setIcon(createIcon(appModel.specialDataSummary));
        marker.setLatLng([TARGET_LAT, TARGET_LNG]);
    }

    function clearBadge() {
        if (marker) {
            if (layerGroup) layerGroup.removeLayer(marker);
            marker = null;
        }
    }

    function init(mapInstance) {
        map = mapInstance;
        layerGroup = L.layerGroup().addTo(map);
        appModel.addEventListener('model:special-data-updated', renderBadge);
        uiModel.addEventListener('ui:wind-measurements-visibility-changed', renderBadge);
        map.on('move zoom moveend', renderBadge);
        renderBadge();
        return { refresh: renderBadge };
    }

    return { init, refresh: renderBadge };
})();
