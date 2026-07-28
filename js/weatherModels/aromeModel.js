import { logger } from '../utils/logger.js';
import { WeatherModel } from '../models/weatherDomainModel.js';

export const aromeModel = {
    // Eager singleton WeatherModel instance for this adapter
    domainModel: new WeatherModel(),
    async init(config) {
        this.config = config;
        logger.info('aromeModel initialized');
    },
    async fetchIndex() {
        // Arome may not provide the same index format; implement when endpoint is available.
        throw new Error('fetchIndex not implemented for aromeModel');
    },
    async fetchOverlay() {
        // Arome likely does not provide comparable overlay images.
        return null;
    },
    async fetchCluster() {
        // No cluster support for Arome
        return null;
    },
    async fetchPointForecast(latlng) {
        // Implement Arome point forecast fetching here using provider API
        throw new Error('fetchPointForecast not implemented for aromeModel');
    }
};

export default aromeModel;
