import { BASE_URL } from '../config.js';
import { weatherApi } from '../weatherApi.js';
import { weatherModel } from '../weatherModel.js';
import { findClosestTimestampIndex } from '../utils/time.js';
import { loadActiveWeatherOverlayData } from './helpers/loadOverlayHelper.js';
import { fetchClusterAndRefreshUI } from './helpers/fetchClusterHelper.js';

export async function refreshWeatherDataAction() {
    try {
        const indexData = await weatherApi.fetchIndex(BASE_URL);
        const prevTimestamps = weatherModel.availableTimestamps || [];
        const prevCurrentKey = prevTimestamps[weatherModel.activeTimestampIndex];
        const timestamps = (indexData.available_timestamps || []).sort();

        weatherModel.setAvailableTimestamps(timestamps);

        let newActiveIndex = weatherModel.activeTimestampIndex;
        if (prevCurrentKey && timestamps.indexOf(prevCurrentKey) !== -1) {
            newActiveIndex = timestamps.indexOf(prevCurrentKey);
        } else {
            newActiveIndex = findClosestTimestampIndex(timestamps);
        }

        weatherModel.setActiveTimestampIndex(newActiveIndex);
        weatherModel.setIndexMetadata(indexData.generated_at, indexData.current_hour);

        // Folge-Logik delegieren
        loadActiveWeatherOverlayData();

        if (weatherModel.lastClickedLatLng) {
            fetchClusterAndRefreshUI(weatherModel.lastClickedLatLng);
        }
    } catch (e) {
        console.error('❌ Error in refreshWeatherDataAction:', e.message);
    }
}