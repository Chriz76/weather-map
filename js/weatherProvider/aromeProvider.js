import { formatModelTimestampToTime } from '../utils/time.js';
import { AROME } from './providerIds.js';

export const ID = AROME;

const CACHE_BUSTER = `cb=${Date.now()}`;

export const aromeProvider = {
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
        if (!latlng) return null;

        const url = `https://api.open-meteo.com/v1/forecast?latitude=${latlng.lat}&longitude=${latlng.lng}&models=meteofrance_arome_france_15min,meteofrance_arome_france_hd_15min&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m&timeformat=unixtime&wind_speed_unit=kn&past_hours=1&forecast_hours=12&temporal_resolution=native&${CACHE_BUSTER}`;

        const res = await fetch(url, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`Open-Meteo request failed (${res.status})`);
        const payload = await res.json();

        if (!payload || !payload.hourly || !Array.isArray(payload.hourly.time)) {
            throw new Error('Open-Meteo payload invalid');
        }

        const h = payload.hourly;
        const times = h.time;
        const speed15 = h['wind_speed_10m_meteofrance_arome_france_15min'] || [];
        const dir15 = h['wind_direction_10m_meteofrance_arome_france_15min'] || [];
        const gust15 = h['wind_gusts_10m_meteofrance_arome_france_15min'] || [];
        const speedHd = h['wind_speed_10m_meteofrance_arome_france_hd_15min'] || [];
        const dirHd = h['wind_direction_10m_meteofrance_arome_france_hd_15min'] || [];
        const gustHd = h['wind_gusts_10m_meteofrance_arome_france_hd_15min'] || [];

        const unixToModelKey = (sec) => {
            const d = new Date(Number(sec) * 1000);
            const YYYY = String(d.getUTCFullYear()).padStart(4, '0');
            const MM = String(d.getUTCMonth() + 1).padStart(2, '0');
            const DD = String(d.getUTCDate()).padStart(2, '0');
            const hh = String(d.getUTCHours()).padStart(2, '0');
            const mm = String(d.getUTCMinutes()).padStart(2, '0');
            return `${YYYY}${MM}${DD}_${hh}${mm}`;
        };

        const result = [];
        for (let i = 0; i < times.length; i++) {
            const t = times[i];
            const s15 = speed15[i];
            const sHd = speedHd[i];
            const g15 = gust15[i];
            const gHd = gustHd[i];
            const d15 = dir15[i];
            const dHd = dirHd[i];

            const speed = (s15 != null) ? s15 : (sHd != null ? sHd : null);
            const gust = (g15 != null) ? g15 : (gHd != null ? gHd : null);
            const direction = (d15 != null) ? d15 : (dHd != null ? dHd : null);

            const fullKey = unixToModelKey(t);
            result.push({
                hour: formatModelTimestampToTime(fullKey),
                wind: speed == null ? null : Math.round(speed * 10) / 10,
                gust: gust == null ? null : Math.round(gust * 10) / 10,
                direction: direction == null ? null : Math.round(direction * 10) / 10,
                fullKey
            });
        }

        return result;
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

export default aromeProvider;
