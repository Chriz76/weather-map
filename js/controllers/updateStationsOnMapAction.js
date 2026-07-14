// controllers/updateStationsOnMapAction.js
import { weatherModel } from '../models/weatherModel.js';
import { fetchWindDataForStation } from '../services/measurementsService.js';

/**
 * Aktualisiert die sichtbaren Stationsmarker basierend auf dem aktuellen Kartenausschnitt.
 * @param {L.Map} map
 * @param {Array} stationsData
 * @param {Object} windCache - ein lokaler Cache-Objekt, das mit stationId -> data befüllt wird
 */
export async function updateStationsOnMapAction(map, stationsData, windCache) {
    if (!stationsData || !stationsData.length) return;

    const bounds = map.getBounds();

    const stationsInView = stationsData.filter(station => {
        const latLng = L.latLng(station.lat, station.lon);
        return bounds.contains(latLng);
    });

    stationsInView.sort((a, b) => a.priority - b.priority);
    const top3Stations = stationsInView.slice(0, 3);

    const stationsWithInitialData = top3Stations.map(station => ({
        ...station,
        windData: windCache[station.id] || null
    }));

    weatherModel.setVisibleStations(stationsWithInitialData);

    let needsModelUpdate = false;

    const fetchPromises = top3Stations.map(async (station) => {
        if (windCache[station.id]) return;
        try {
            const data = await fetchWindDataForStation(station.id);
            if (data) {
                windCache[station.id] = data;
                needsModelUpdate = true;
            }
        } catch (e) {
            // Swallow individual station errors to avoid breaking the whole update
            console.error('Error fetching wind for station', station.id, e);
        }
    });

    await Promise.all(fetchPromises);

    if (needsModelUpdate) {
        const stationsWithFreshData = top3Stations.map(station => ({
            ...station,
            windData: windCache[station.id] || null
        }));
        weatherModel.setVisibleStations(stationsWithFreshData);
    }
}
