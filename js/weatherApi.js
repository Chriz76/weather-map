export const weatherApi = {
    /**
     * Loads the central index.json metadata file.
     * @param {string} baseUrl Base URL where weather assets are hosted.
     * @returns {Promise<Object>} Parsed index payload.
     */
    async fetchIndex(baseUrl) {
        const response = await fetch(`${baseUrl}index.json`, { cache: 'no-cache' });
        if (!response.ok) throw new Error(`index.json could not be loaded (status: ${response.status})`);
        return await response.json();
    },

    /**
     * Resolves the matching grid-cluster file for a given map click location.
     * @param {{lat:number,lng:number}|null} latlng Geographic position.
     * @param {{BASE_URL:string,lonMin:number,latMin:number,gridCellSize:number}|null} config Runtime map config.
     * @returns {Promise<Object|null>} Cluster data or null when input is incomplete.
     */
    async fetchCluster(latlng, config) {
        if (!latlng || !config) return null;

        const clickLat = latlng.lat;
        const clickLng = latlng.lng;

        const col = Math.floor((clickLng - config.lonMin) / config.gridCellSize);
        const row = Math.floor((clickLat - config.latMin) / config.gridCellSize);
        const clusterUrl = `${config.BASE_URL}grid_cluster/cluster_${col}_${row}.json`;

        const response = await fetch(clusterUrl, { cache: 'no-cache' });
        if (!response.ok) throw new Error(`Cluster file could not be loaded (${response.status})`);

        const cluster = await response.json();
        if (!cluster || !cluster.timeline || !cluster.lats) {
            throw new Error('Cluster data structure is invalid.');
        }

        return cluster;
    },

    /**
     * Loads the weather image for a timestamp as a Blob.
     * @param {string} timestamp Timestamp key in format YYYYMMDD_HH.
     * @param {string} baseUrl Base URL where weather assets are hosted.
     * @returns {Promise<Blob>} Downloaded image blob.
     */
    async fetchWeatherImageBlob(timestamp, baseUrl) {
        const imageUrl = `${baseUrl}${timestamp}Z.png`;
        const response = await fetch(imageUrl, { cache: 'no-cache' });
        if (!response.ok) throw new Error('Image could not be loaded');
        return await response.blob();
    }
};