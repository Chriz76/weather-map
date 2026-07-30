import { logger } from '../utils/logger.js';
import { WeatherProviderModel } from '../models/weatherProviderModel.js';
import { AROME } from './providerIds.js';
export const ID = AROME;
export const aromeProvider = {
    id: ID,
    // Eager singleton WeatherProviderModel instance for this adapter
    domainModel: new WeatherProviderModel(),
    async init(config) {
        this.config = config;
        logger.info('aromeProvider initialized');
    },
    async fetchIndex() {
        // Arome may not provide the same index format; implement when endpoint is available.
        throw new Error('fetchIndex not implemented for aromeProvider');
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
        throw new Error('fetchPointForecast not implemented for aromeProvider');
    }
};
export default aromeProvider;
