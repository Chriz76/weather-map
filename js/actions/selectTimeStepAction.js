import { weatherModel } from '../weatherModel.js';
import { loadActiveWeatherOverlayData } from './helpers/loadOverlayHelper.js';
import { triggerCentralInterpolation } from './helpers/interpolationHelper.js';

export function selectTimeStepAction(index) {
    weatherModel.setActiveTimestampIndex(index);
    loadActiveWeatherOverlayData();
    triggerCentralInterpolation();
}