// controllers/updateStationsOnMapAction.js
import { weatherModel } from '../models/weatherDomainModel.js';
import { weatherUi } from '../models/weatherUiModel.js';
import { fetchWindDataForStation } from '../services/measurementsService.js';
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
        weatherModel.setSpecialDataSummary(summary);
    } catch (error) {
        logger.error('Error refreshing special data badge:', error);
        weatherModel.setSpecialDataSummary(null);
    }
}

/**
 * Aktualisiert die sichtbaren Stationsmarker.
 * Wenn `bounds` übergeben wird, filtert die Stationen danach und zeigt die Top-8 an.
 * Wenn `bounds` fehlt, wird ein Refresh für die zuletzt angezeigten Stationen ausgeführt.
 * Die Action verwaltet intern das Laden von `assets/stations.json` und einen lokalen Wind-Cache.
 * @param {L.LatLngBounds|null} bounds
 */
export async function updateStationsOnMapAction(bounds = null) {
    if (!weatherUi.showWindMeasurements) {
        logger.debug('Station data not loaded: wind measurements are currently hidden.');
        return;
    }
    // Acquire station list from model if available
    let allStations = Array.isArray(weatherModel.allStations) ? weatherModel.allStations : [];

    // Fallback: try to load from assets if model has none (no caching of stations here)
    if ((!allStations || allStations.length === 0) && bounds) {
        try {
            const resp = await fetch('/assets/stations.json');
            allStations = await resp.json();
            // Cache loaded stations on the model to avoid repeated fallback fetches
            weatherModel.setAllStations(allStations);
            logger.info('📍 Station data loaded (fallback):', allStations.length);
        } catch (e) {
            logger.error('Error loading stations.json (fallback):', e);
        }
    }

    let topStations = [];

    if (bounds && typeof bounds.contains === 'function' && typeof bounds.getCenter === 'function') {
        const stationsInView = allStations.filter(station => {
            const lat = Number(station?.lat);
            const lon = Number(station?.lon);

            if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
                return false;
            }

            try {
                return bounds.contains(L.latLng(lat, lon));
            } catch (error) {
                logger.warn('Skipping station with invalid map bounds payload:', station?.id, error);
                return false;
            }
        });

        // Sortiere nach Priorität; bei gleicher Priorität zuerst Stationen
        // die näher am Kartenmittelpunkt liegen.
        const center = bounds.getCenter();
        if (center && typeof center.distanceTo === 'function') {
            stationsInView.sort((a, b) => {
                const pr = (a.priority || 0) - (b.priority || 0);
                if (pr !== 0) return pr;

                const da = center.distanceTo(L.latLng(Number(a.lat), Number(a.lon)));
                const db = center.distanceTo(L.latLng(Number(b.lat), Number(b.lon)));
                return da - db;
            });
        }
        topStations = stationsInView.slice(0, 8);
    } else {
        // No bounds -> refresh previously visible stations if model has them
        const visible = Array.isArray(weatherModel.visibleStations) ? weatherModel.visibleStations : [];
        if (visible && visible.length) {
            topStations = visible.slice();
        } else {
            topStations = [];
        }
    }

    const fetched = {};
    const fetchPromises = topStations.map(async (station) => {
        try {
            const data = await fetchWindDataForStation(station.id);
            if (data) {
                fetched[station.id] = data;
            }
        } catch (err) {
            logger.error('Error fetching wind for station', station.id, err);
        }
    });

    await Promise.all(fetchPromises);

    const stationsWithFinalData = topStations.map(station => ({
        ...station,
        windData: fetched[station.id] || null
    }));

    weatherModel.setVisibleStations(stationsWithFinalData);
}
