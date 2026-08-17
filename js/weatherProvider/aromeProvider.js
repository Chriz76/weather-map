import { formatModelTimestampToTime } from '../utils/time.js';
import { AROME } from './providerIds.js';

export const ID = AROME;

const CACHE_BUSTER = `cb=${Date.now()}`;

export const aromeProvider = {
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

        // Abruf ohne explizites Modell -> Nutzt Open-Meteo Seamless Blending im 15-Minuten-Raster
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${latlng.lat}&longitude=${latlng.lng}&minutely_15=wind_speed_10m,wind_direction_10m,wind_gusts_10m&timeformat=unixtime&wind_speed_unit=kn&past_minutely_15=8&forecast_minutely_15=32&${CACHE_BUSTER}`;

        const res = await fetch(url, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`Open-Meteo request failed (${res.status})`);
        const payload = await res.json();

        if (!payload || !payload.minutely_15 || !Array.isArray(payload.minutely_15.time)) {
            throw new Error('Open-Meteo payload invalid');
        }

        const m15 = payload.minutely_15;
        const times = m15.time;
        const speeds = m15.wind_speed_10m || [];
        const directions = m15.wind_direction_10m || [];
        const gusts = m15.wind_gusts_10m || [];

        const unixToModelKey = (sec) => {
            const d = new Date(Number(sec) * 1000);
            const YYYY = String(d.getUTCFullYear()).padStart(4, '0');
            const MM = String(d.getUTCMonth() + 1).padStart(2, '0');
            const DD = String(d.getUTCDate()).padStart(2, '0');
            const hh = String(d.getUTCHours()).padStart(2, '0');
            const mm = String(d.getUTCMinutes()).padStart(2, '0');
            return `${YYYY}${MM}${DD}_${hh}${mm}`;
        };

        // Prüfen, bis zu welchem Index tatsächlich valide Daten vorliegen
        let lastIdx = -1;
        for (let i = times.length - 1; i >= 0; i--) {
            const anyValue = (speeds[i] != null) || (gusts[i] != null) || (directions[i] != null);
            if (anyValue) { 
                lastIdx = i; 
                break; 
            }
        }

        if (lastIdx === -1) return null;

        const result = [];
        for (let i = 0; i <= lastIdx; i++) {
            const t = times[i];
            const speed = speeds[i];
            const gust = gusts[i];
            const direction = directions[i];

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
