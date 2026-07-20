// services/measurementsService.js

import { logger } from '../utils/logger.js';

// In-memory cache and in-flight deduplication for station wind data
const windCache = {}; // { [stationId]: { data, ts } }
const inflight = {};  // { [stationId]: Promise }
const DEFAULT_TTL = 4 * 60 * 1000; // 4 minutes

async function fetchFromBrightSky(dwdStationId) {
    const url = `https://api.brightsky.dev/current_weather?dwd_station_id=${dwdStationId}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`API-Fehler: ${response.status}`);
    const data = await response.json();
    const current = data.weather;
    if (!current) return null;

    const speedKmh = typeof current.wind_speed_10 === 'number' ? current.wind_speed_10 : null;
    const direction = typeof current.wind_direction_10 === 'number' ? current.wind_direction_10 : null;
    const gustKmh = typeof current.wind_gust_speed_10 === 'number' ? current.wind_gust_speed_10 : null;
    const temperature = typeof current.temperature === 'number' ? current.temperature : null;
    const timestamp = typeof current.timestamp === 'string' ? current.timestamp : null;

    if (speedKmh === null) {
        logger.debug(`BrightSky: missing wind_speed_10 for station ${dwdStationId}`);
        return null;
    }

    return {
        windSpeed: Math.round(speedKmh * 0.539957 * 10) / 10,
        windDirection: typeof direction === 'number' ? direction : 0,
        windGustSpeed: gustKmh === null ? null : Math.round(gustKmh * 0.539957),
        temperature,
        timestamp
    };
}

/**
 * Fetch wind data for a station with service-side caching.
 * @param {string} dwdStationId
 * @param {{forceRefresh?: boolean, ttl?: number}=} options
 * @returns {Promise<{windSpeed:number,windDirection:number} | null>}
 */
export async function fetchWindDataForStation(dwdStationId, options = {}) {
    const { forceRefresh = false, ttl = DEFAULT_TTL } = options;
    const now = Date.now();

    const cached = windCache[dwdStationId];
    if (!forceRefresh && cached && (now - cached.ts) < ttl) {
        return cached.data;
    }

    if (inflight[dwdStationId]) return inflight[dwdStationId];

    inflight[dwdStationId] = (async () => {
        try {
            const data = await fetchFromBrightSky(dwdStationId);
            // Cache result (even `null` to avoid hammering failing endpoints)
            windCache[dwdStationId] = { data, ts: Date.now() };
            return data;
        } finally {
            delete inflight[dwdStationId];
        }
    })();

    return inflight[dwdStationId];
}

export function clearWindCache(stationId) {
    if (stationId) delete windCache[stationId];
    else {
        for (const k in windCache) delete windCache[k];
    }
}