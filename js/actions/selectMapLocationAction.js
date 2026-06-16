import { weatherModel } from '../weatherModel.js';
import { fetchClusterAndRefreshUI } from './helpers/fetchClusterHelper.js';

export function selectMapLocationAction(latlng) {
    weatherModel.setLastClickedLatLng(latlng);
    fetchClusterAndRefreshUI(latlng);
}