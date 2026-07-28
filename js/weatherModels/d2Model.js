import { weatherService } from '../services/weatherService.js';
import { calculatewindSpeeds } from '../utils/interpolation.js';
import { logger } from '../utils/logger.js';
import { WeatherModel } from '../models/weatherDomainModel.js';

export const d2Model = {
    // Eager singleton WeatherModel instance for this adapter
    domainModel: new WeatherModel(),
    async init(config) {
        this.config = config;
        logger.info('d2Model initialized');
    },
    async fetchIndex(baseUrl) {
        return weatherService.fetchIndex(baseUrl || this.config?.BASE_URL);
    },
    async fetchOverlay(timestamp, baseUrl) {
        return weatherService.fetchWeatherImageBlob(timestamp, baseUrl || this.config?.BASE_URL);
    },
    async fetchCluster(latlng, config) {
        return weatherService.fetchCluster(latlng, config || this.config);
    },
    async fetchPointForecast(latlng, config) {
        // For d2 we derive point forecast by loading cluster and interpolating.
        const cluster = await this.fetchCluster(latlng, config || this.config);
        // Return cluster raw; manager or caller can call interpolation.
        return { cluster };
    }
};

export default d2Model;
