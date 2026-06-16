import { weatherModel } from '../weatherModel.js';
import { triggerCentralInterpolation } from './helpers/interpolationHelper.js';

export function clearSelectedLocationAction() {
    weatherModel.setLastClickedLatLng(null);
    weatherModel.setCurrentClusterData(null);
    triggerCentralInterpolation();
}