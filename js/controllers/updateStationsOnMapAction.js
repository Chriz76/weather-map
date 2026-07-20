// controllers/updateStationsOnMapAction.js
import { weatherModel } from '../models/weatherDomainModel.js';
import { fetchWindDataForStation } from '../services/measurementsService.js';
import { logger } from '../utils/logger.js';

/**
 * Aktualisiert die sichtbaren Stationsmarker.
 * Wenn `bounds` übergeben wird, filtert die Stationen danach und zeigt die Top-3 an.
 * Wenn `bounds` fehlt, wird ein Refresh für die zuletzt angezeigten Stationen ausgeführt.
 * Die Action verwaltet intern das Laden von `assets/stations.json` und einen lokalen Wind-Cache.
 * @param {L.LatLngBounds|null} bounds
 */
export async function updateStationsOnMapAction(bounds = null) {
    // Acquire station list from model if available
    let allStations = Array.isArray(weatherModel.allStations) ? weatherModel.allStations : [];

    // Fallback: try to load from assets if model has none (no caching of stations here)
    if ((!allStations || allStations.length === 0) && bounds) {
        try {
            const resp = await fetch('/assets/stations.json');
            allStations = await resp.json();
            // Cache loaded stations on the model to avoid repeated fallback fetches
            weatherModel.setAllStations(allStations);
            logger.info('📍 Stationsdaten geladen (fallback):', allStations.length);
        } catch (e) {
            logger.error('Fehler beim Laden der stations.json (fallback):', e);
        }
    }

    let topStations = [];

    if (bounds) {
        const stationsInView = allStations.filter(station => {
            const latLng = L.latLng(station.lat, station.lon);
            return bounds.contains(latLng);
        });

        // Sortiere nach Priorität; bei gleicher Priorität zuerst Stationen
        // die näher am Kartenmittelpunkt liegen.
        const center = bounds.getCenter();
        stationsInView.sort((a, b) => {
            const pr = (a.priority || 0) - (b.priority || 0);
            if (pr !== 0) return pr;
            const da = center.distanceTo(L.latLng(a.lat, a.lon));
            const db = center.distanceTo(L.latLng(b.lat, b.lon));
            return da - db;
        });
        topStations = stationsInView.slice(0, 3);
    } else {
        // No bounds -> refresh previously visible stations if model has them
        const visible = Array.isArray(weatherModel.visibleStations) ? weatherModel.visibleStations : [];
        if (visible && visible.length) {
            topStations = visible.slice();
        } else {
            topStations = [];
        }
    }

    // Initially show stations without wind data; the service provides caching
    const stationsWithInitialData = topStations.map(station => ({
        ...station,
        windData: null
    }));

    weatherModel.setVisibleStations(stationsWithInitialData);

    let needsModelUpdate = false;

    const fetched = {};
    const fetchPromises = topStations.map(async (station) => {
        try {
            const data = await fetchWindDataForStation(station.id);
            if (data) {
                fetched[station.id] = data;
                needsModelUpdate = true;
            }
        } catch (err) {
            logger.error('Error fetching wind for station', station.id, err);
        }
    });

    await Promise.all(fetchPromises);

    if (needsModelUpdate) {
        const stationsWithFreshData = topStations.map(station => ({
            ...station,
            windData: fetched[station.id] || null
        }));
        weatherModel.setVisibleStations(stationsWithFreshData);
    }
}
