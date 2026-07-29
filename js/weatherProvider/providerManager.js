import { d2Provider } from './d2Provider.js';
import { aromeProvider } from './aromeProvider.js';
import { logger } from '../utils/logger.js';
import { weatherProviderModel } from '../models/weatherProviderModel.js';

const providers = { 'icon-d2': d2Provider, 'arome': aromeProvider };

export const providerManager = {
    async fetchIndex(baseUrl) {
        const activeId = weatherProviderModel.getActiveProviderId();
        const fetcher = providers[activeId];
        return await fetcher.fetchIndex(baseUrl);
    },

    /**
     * Resolves the matching grid-cluster file for a given map click location.
     * @param {{lat:number,lng:number}|null} latlng Geographic position.
     * @param {{BASE_URL:string,lonMin:number,latMin:number,gridCellSize:number}|null} config Runtime map config.
     * @returns {Promise<Object|null>} Cluster data or null when input is incomplete.
     */
    async fetchCluster(latlng, config) {
        const activeId = weatherProviderModel.getActiveProviderId();
        const fetcher = providers[activeId];
        return await fetcher.fetchCluster(latlng, config);
    },

    /**
     * Loads the weather image for a timestamp as a Blob.
     * @param {string} timestamp Timestamp key in format YYYYMMDD_HH.
     * @param {string} baseUrl Base URL where weather assets are hosted.
     * @returns {Promise<Blob>} Downloaded image blob.
     */
    async fetchWeatherImageBlob(timestamp, baseUrl) {
        const activeId = weatherProviderModel.getActiveProviderId();
        const fetcher = providers[activeId];
        return await fetcher.fetchWeatherImageBlob(timestamp, baseUrl);
    }
};

export default providerManager;
