import { appModel } from '../models/appModel.js';
import { fetchSpecialData, selectForecastEntries, buildSpecialDataSummary } from '../services/specialDataService.js';
import { logger } from '../utils/logger.js';

const SPECIAL_DATA_TARGET_LAT = 47.6506;
const SPECIAL_DATA_TARGET_LNG = 11.3365;
const SPECIAL_DATA_MIN_ZOOM = 7;

function getReferenceDay() {
    const today = new Date();
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const yyyy = day.getFullYear();
    const mm = String(day.getMonth() + 1).padStart(2, '0');
    const dd = String(day.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function shouldShowSpecialData(map) {
    if (!map || typeof map.getZoom !== 'function' || typeof map.getBounds !== 'function') {
        return false;
    }

    if (map.getZoom() < SPECIAL_DATA_MIN_ZOOM) {
        return false;
    }

    const bounds = map.getBounds();
    if (!bounds || typeof bounds.contains !== 'function') {
        return false;
    }

    return bounds.contains(L.latLng(SPECIAL_DATA_TARGET_LAT, SPECIAL_DATA_TARGET_LNG));
}

export async function updateSpecialDataOnMapAction(map = null) {
    if (!shouldShowSpecialData(map)) {
        return;
    }

    try {
        const entries = await fetchSpecialData();
        const selection = selectForecastEntries(entries, getReferenceDay());
        const summary = buildSpecialDataSummary(selection);
        appModel.setSpecialDataSummary(summary);
    } catch (error) {
        logger.error('Error refreshing special data badge:', error);
        appModel.setSpecialDataSummary(null);
    }
}
