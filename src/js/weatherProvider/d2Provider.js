import { calculatewindSpeeds } from '../utils/interpolation';
import { D2 } from './providerIds.js';

export const ID = D2;

const CACHE_BUSTER = `cb=${Date.now()}`;

export const d2Provider = {
    id: ID,
    /**
     * Loads the central index.json metadata file.
     * @param {string} baseUrl Base URL where weather assets are hosted.
     * @returns {Promise<Object>} Parsed index payload.
     */
    async fetchIndex(config) {
        const response = await fetch(`${config.baseUrl}index.json?${CACHE_BUSTER}`, { cache: 'no-cache' });
        if (!response.ok) throw new Error(`index.json could not be loaded (status: ${response.status})`);
        return await response.json();
    },

    /**
     * Fetches the cluster and returns a computed forecast array for the given point.
     * @param {{lat:number,lng:number}|null} latlng
     * @param {{baseUrl:string,lonMin:number,latMin:number,gridCellSize:number,activeTimestamp?:string}|null} config
     * @returns {Promise<Array|null>} Forecast array or null
     */
    async fetchForecast(latlng, config) {
        if (!latlng || !config) return null;

        // The south-west point in imageBounds is [lat, lon]
        const latMin = config.imageBounds[0][0];
        const lonMin = config.imageBounds[0][1];

        const col = Math.floor((latlng.lng - lonMin) / config.gridCellSize);
        const row = Math.floor((latlng.lat - latMin) / config.gridCellSize);
        const clusterUrl = `${config.baseUrl}grid_cluster/cluster_${col}_${row}.json?${CACHE_BUSTER}`;

        const response = await fetch(clusterUrl, { cache: 'no-cache' });
        if (!response.ok) throw new Error(`Cluster file could not be loaded (${response.status})`);

        const cluster = await response.json();
        if (!cluster || !cluster.timeline || !cluster.lats) {
            throw new Error('Cluster data structure is invalid.');
        }

        // Use interpolation helper to compute the forecast array
        return calculatewindSpeeds(latlng, cluster);
    },

    /**
     * Loads the weather image for a timestamp as a Blob.
     * @param {string} timestamp Timestamp key in format YYYYMMDD_HH.
     * @param {{baseUrl:string}} config
     * @returns {Promise<Blob>} Downloaded image blob.
     */
    async fetchWeatherImageBlob(timestamp, config) {
        const imageUrl = `${config.baseUrl}${timestamp}Z.webp?${CACHE_BUSTER}`; // Use .webp for better compression
        const response = await fetch(imageUrl, { cache: 'no-cache' });
        if (!response.ok) throw new Error('Image could not be loaded');
        return await response.blob();
    }
};

export default d2Provider;
