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
        // Backwards-compatible: if provider implements fetchForecast only, try fetchCluster first
        if (typeof fetcher.fetchCluster === 'function') {
            return await fetcher.fetchCluster(latlng, config);
        }
        return null;
    },

    /**
     * Fetch a fully computed forecast for a point (provider-specific implementation).
     * @param {{lat:number,lng:number}|null} latlng
     * @param {{BASE_URL:string,lonMin:number,latMin:number,gridCellSize:number,activeTimestamp?:string}|null} config
     * @returns {Promise<Array|null>} Forecast array or null
     */
    async fetchForecast(latlng, config) {
        const activeId = weatherProviderModel.getActiveProviderId();
        const fetcher = providers[activeId];
        if (typeof fetcher.fetchForecast === 'function') {
            return await fetcher.fetchForecast(latlng, config);
        }
        // Fallback: if provider only exposes fetchCluster, fetch cluster and return null (caller can compute)
        if (typeof fetcher.fetchCluster === 'function') {
            const cluster = await fetcher.fetchCluster(latlng, config);
            return cluster;
        }
        return null;
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
