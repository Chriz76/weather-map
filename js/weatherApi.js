export const weatherApi = {
    /**
     * 1. Lädt die zentrale index.json
     */
    async fetchIndex(baseUrl) {
        const response = await fetch(`${baseUrl}index.json`, { cache: 'no-cache' });
        if (!response.ok) throw new Error(`index.json could not be loaded (status: ${response.status})`);
        return await response.json();
    },

    /**
     * 2. Berechnet anhand von Lat/Lng und den Config-Grenzen das richtige Cluster
     */
    async fetchCluster(latlng, config) {
        if (!latlng || !config) return null;

        const clickLat = latlng.lat;
        const clickLng = latlng.lng;

        // Die mathematische Logik nutzt nun die übergebenen Config-Werte
        const col = Math.floor((clickLng - config.lonMin) / 2.0);
        const row = Math.floor((clickLat - config.latMin) / 2.0);
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
     * 3. Lädt das Wetter-Bild als Blob (für den ETag-Check)
     */
    async fetchWeatherImageBlob(timestamp, baseUrl) {
        const imageUrl = `${baseUrl}${timestamp}Z.png`;
        const response = await fetch(imageUrl, { cache: 'no-cache' });
        if (!response.ok) throw new Error('Image could not be loaded');
        return await response.blob();
    }
};