import { d2Provider } from './d2Provider.js';
import { aromeProvider } from './aromeProvider.js';
import { D2, AROME } from './providerIds.js';
import { logger } from '../utils/logger.js';
import { weatherProviderModel } from '../models/weatherProviderModel.js';
import { providers as providerConfig } from '../config.js';

const providers = { [D2]: d2Provider, [AROME]: aromeProvider };

export const providerManager = {
    async fetchIndex() {
        const activeId = weatherProviderModel.getActiveProviderId();
        const fetcher = providers[activeId];
        return await fetcher.fetchIndex(providerConfig[activeId]);
    },

    /**
     * Fetch a fully computed forecast for a point (provider-specific implementation).
     * @param {{lat:number,lng:number}|null} latlng
     * @param {{BASE_URL:string,lonMin:number,latMin:number,gridCellSize:number,activeTimestamp?:string}|null} config
     * @returns {Promise<Array|null>} Forecast array or null
     */
    async fetchForecast(latlng) {
        const activeId = weatherProviderModel.getActiveProviderId();
        const fetcher = providers[activeId];
        return await fetcher.fetchForecast(latlng, providerConfig[activeId]);
    },

    /**
     * Loads the weather image for a timestamp as a Blob.
     * @param {string} timestamp Timestamp key in format YYYYMMDD_HH.
     * @param {string} baseUrl Base URL where weather assets are hosted.
     * @returns {Promise<Blob>} Downloaded image blob.
     */
    async fetchWeatherImageBlob(timestamp) {
        const activeId = weatherProviderModel.getActiveProviderId();
        const fetcher = providers[activeId];
        return await fetcher.fetchWeatherImageBlob(timestamp, providerConfig[activeId]);
    }
};

export default providerManager;
