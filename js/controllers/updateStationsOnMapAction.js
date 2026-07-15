// controllers/updateStationsOnMapAction.js
import { weatherModel } from '../models/weatherModel.js';
import { fetchWindDataForStation } from '../services/measurementsService.js';

const windCache = {};
let lastTopStations = [];

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
            console.log('📍 Stationsdaten geladen (fallback):', allStations.length);
        } catch (e) {
            console.error('Fehler beim Laden der stations.json (fallback):', e);
        }
    }

    let topStations = [];

    if (bounds) {
        const stationsInView = allStations.filter(station => {
            const latLng = L.latLng(station.lat, station.lon);
            return bounds.contains(latLng);
        });

        stationsInView.sort((a, b) => a.priority - b.priority);
        topStations = stationsInView.slice(0, 3);
        lastTopStations = topStations;
    } else {
        // No bounds -> refresh previously visible stations if model has them
        const visible = Array.isArray(weatherModel.visibleStations) ? weatherModel.visibleStations : [];
        if (visible && visible.length) {
            topStations = visible.slice();
        } else {
            topStations = lastTopStations.slice();
        }
    }

    const stationsWithInitialData = topStations.map(station => ({
        ...station,
        windData: windCache[station.id] || null
    }));

    weatherModel.setVisibleStations(stationsWithInitialData);

    let needsModelUpdate = false;

    const fetchPromises = topStations.map(async (station) => {
        if (windCache[station.id]) return;
        try {
            const data = await fetchWindDataForStation(station.id);
            if (data) {
                windCache[station.id] = data;
                needsModelUpdate = true;
            }
        } catch (err) {
            console.error('Error fetching wind for station', station.id, err);
        }
    });

    await Promise.all(fetchPromises);

    if (needsModelUpdate) {
        const stationsWithFreshData = topStations.map(station => ({
            ...station,
            windData: windCache[station.id] || null
        }));
        weatherModel.setVisibleStations(stationsWithFreshData);
    }
}
