// controllers/updateStationsOnMapAction.js
import { appModel } from '../models/appModel.js';
import { uiModel } from '../models/uiModel.js';
import { fetchWindDataForStation } from '../services/measurementsService.js';
import { logger } from '../utils/logger.js';

/**
 * Aktualisiert die sichtbaren Stationsmarker.
 * Wenn `bounds` übergeben wird, filtert die Stationen danach und zeigt die Top-8 an.
 * Wenn `bounds` fehlt, wird ein Refresh für die zuletzt angezeigten Stationen ausgeführt.
 * Die Action verwaltet intern das Laden von `assets/stations.json` und einen lokalen Wind-Cache.
 * @param {L.LatLngBounds|null} bounds
 */
export async function updateStationsOnMapAction(bounds = null) {
    if (!uiModel.showWindMeasurements) {
        logger.debug('Station data not loaded: wind measurements are currently hidden.');
        return;
    }
    // Acquire station list from appModel if available
    let allStations = Array.isArray(appModel.allStations) ? appModel.allStations : [];

    // Fallback: try to load from assets if model has none (no caching of stations here)
    if ((!allStations || allStations.length === 0) && bounds) {
        try {
            const resp = await fetch('/assets/stations.json');
            allStations = await resp.json();
            // Cache loaded stations on the appModel to avoid repeated fallback fetches
            appModel.setAllStations(allStations);
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
            const visible = Array.isArray(appModel.visibleStations) ? appModel.visibleStations : [];
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

        appModel.setVisibleStations(stationsWithFinalData);
}
