import { logger } from '../utils/logger.js';

const SPECIAL_DATA_URL = 'https://christian-fey.github.io/Koechelt_der_Kochel/forecast.json';
const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = { data: null, timestamp: 0 };
let inFlight = null;

function normalizeForecastEntries(payload) {
    if (!payload || !Array.isArray(payload.forecast)) {
        return [];
    }

    return payload.forecast
        .filter((item) => item && typeof item.day === 'string')
        .map((item) => ({
            day: item.day,
            foehnProbabilityPct: Number(item.foehn_probability_pct)
        }))
        .filter((item) => Number.isFinite(item.foehnProbabilityPct));
}

export function selectForecastEntries(entries, referenceDay) {
    const sortedEntries = [...entries].sort((a, b) => a.day.localeCompare(b.day));
    const referenceIndex = sortedEntries.findIndex((entry) => entry.day === referenceDay);

    if (referenceIndex === -1) {
        return sortedEntries.slice(0, 3);
    }

    return sortedEntries.slice(referenceIndex, referenceIndex + 3);
}

export function buildSpecialDataSummary(entries) {
    const summary = entries
        .slice(0, 3)
        .map((entry) => Math.round(entry.foehnProbabilityPct))
        .join('/');

    return `${summary}%`;
}

export async function fetchSpecialData() {
    const now = Date.now();

    if (cache.data && (now - cache.timestamp) < CACHE_TTL_MS) {
        return cache.data;
    }

    if (inFlight) {
        return inFlight;
    }

    inFlight = (async () => {
        try {
            const response = await fetch(`${SPECIAL_DATA_URL}?cb=${Date.now()}`, { cache: 'no-cache' });
            if (!response.ok) {
                throw new Error(`Special data request failed (${response.status})`);
            }

            const payload = await response.json();
            const normalizedEntries = normalizeForecastEntries(payload);
            cache.data = normalizedEntries;
            cache.timestamp = Date.now();
            return normalizedEntries;
        } catch (error) {
            logger.error('❌ Error loading special data:', error);
            throw error;
        } finally {
            inFlight = null;
        }
    })();

    return inFlight;
}
