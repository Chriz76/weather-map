import { formatModelTimestampToTime } from './time';
import { logger } from './logger';
import type { Cluster, ForecastItem, LatLng } from '../types';

/** Interpolated wind values for a single timestamp. */
export type InterpolatedWindData = { speed: number | null; gust: number | null; direction: number | null };

/** Result returned when a concrete `timestamp` is requested. */
export type InterpolatedForecastResult = {
    forecast: ForecastItem[] | null;
    windData: InterpolatedWindData | null;
};

function getDisplayHour(tKey: string): string {
    const parts = formatModelTimestampToTime(tKey).split(':');
    return parts[0] ?? '';
}

/**
 * Interpolates wind speeds from the three nearest cluster points.
 * @param latlng Clicked position.
 * @param cluster Cluster payload.
 * @returns The forecast array, or `null` when the payload is unusable.
 */
export function calculatewindSpeeds(latlng: LatLng | null, cluster: Cluster | null): ForecastItem[] | null;
/**
 * Interpolates wind speeds and resolves the entry matching `timestamp`.
 * @param latlng Clicked position.
 * @param cluster Cluster payload.
 * @param timestamp Timestamp key to resolve the wind data for.
 * @returns The forecast array plus the matching wind data, or `null` when the payload is unusable.
 */
export function calculatewindSpeeds(latlng: LatLng | null, cluster: Cluster | null, timestamp: string | null): InterpolatedForecastResult | null;
export function calculatewindSpeeds(
    latlng: LatLng | null,
    cluster: Cluster | null,
    timestamp?: string | null
): ForecastItem[] | InterpolatedForecastResult | null {
    try {
        if (!latlng || !cluster || !cluster.timeline) {
            if (timestamp !== undefined) return { forecast: null, windData: null };
            return null;
        }

        const clickLat = latlng.lat;
        const clickLng = latlng.lng;

        const timelineKeys = Object.keys(cluster.timeline).sort();

        const totalPoints = cluster.lats.length;
        if (totalPoints < 3) return null;

        let idx1 = -1, idx2 = -1, idx3 = -1;
        let dSq1 = Infinity, dSq2 = Infinity, dSq3 = Infinity;

        const lats = cluster.lats;
        const lons = cluster.lons;

        for (let i = 0; i < totalPoints; i++) {
            const dLat = (lats[i] ?? clickLat) - clickLat;
            const dLng = (lons[i] ?? clickLng) - clickLng;
            const distSq = (dLat * dLat) + (dLng * dLng);

            if (distSq < dSq1) {
                dSq3 = dSq2; idx3 = idx2;
                dSq2 = dSq1; idx2 = idx1;
                dSq1 = distSq; idx1 = i;
            } else if (distSq < dSq2) {
                dSq3 = dSq2; idx3 = idx2;
                dSq2 = distSq; idx2 = i;
            } else if (distSq < dSq3) {
                dSq3 = distSq; idx3 = i;
            }
        }

        if (idx1 < 0) return null;

        const dist1 = Math.sqrt(dSq1);
        const dist2 = Math.sqrt(dSq2);
        const dist3 = Math.sqrt(dSq3);

        const w1 = 1 / Math.max(dist1, 0.00001);
        const w2 = 1 / Math.max(dist2, 0.00001);
        const w3 = 1 / Math.max(dist3, 0.00001);
        const sumW = w1 + w2 + w3;

        const exactMatch = dist1 < 0.005;

        const calcScalar = (values: Array<number | undefined>) => {
            if (exactMatch) return values[idx1] || 0;
            return ((values[idx1] || 0) * w1 + (values[idx2] || 0) * w2 + (values[idx3] || 0) * w3) / sumW;
        };

        const calcDirection = (dirs: Array<number | null | undefined>) => {
            if (exactMatch) return dirs[idx1] ?? null;

            const r1 = dirs[idx1] ?? null;
            const r2 = dirs[idx2] ?? null;
            const r3 = dirs[idx3] ?? null;

            let sumSin = 0, sumCos = 0, weightTotal = 0;

            if (r1 !== null) { const rad = r1 * 0.017453292519943295; sumSin += Math.sin(rad) * w1; sumCos += Math.cos(rad) * w1; weightTotal += w1; }
            if (r2 !== null) { const rad = r2 * 0.017453292519943295; sumSin += Math.sin(rad) * w2; sumCos += Math.cos(rad) * w2; weightTotal += w2; }
            if (r3 !== null) { const rad = r3 * 0.017453292519943295; sumSin += Math.sin(rad) * w3; sumCos += Math.cos(rad) * w3; weightTotal += w3; }

            if (weightTotal === 0 || (Math.abs(sumSin) < 1e-9 && Math.abs(sumCos) < 1e-9)) return null;

            let angle = Math.atan2(sumSin, sumCos) * 57.29577951308232;
            return (angle + 360) % 360;
        };

        const len = timelineKeys.length;
        const dynamicForecastArray = new Array<ForecastItem>(len);

        for (let k = 0; k < len; k++) {
            const tKey = timelineKeys[k]!;
            const tData = cluster.timeline[tKey] || { speeds: [], dirs: [], gusts: [] };
            
            const tWindInterpolated = calcScalar(tData.speeds || []);
            const tGustInterpolated = calcScalar(tData.gusts || []);
            const tDirectionInterpolated = calcDirection(tData.dirs || []);

            dynamicForecastArray[k] = {
                hour: getDisplayHour(tKey!),
                wind: Math.round(tWindInterpolated * 10) / 10,
                gust: Math.round(tGustInterpolated * 10) / 10,
                direction: tDirectionInterpolated === null ? null : Math.round(tDirectionInterpolated * 10) / 10,
                fullKey: tKey
            };
        }

        if (timestamp !== undefined) {
            // if a concrete timestamp string was provided, try to find matching entry
            let windData: InterpolatedWindData | null = null;
            if (typeof timestamp === 'string') {
                const entry = dynamicForecastArray.find(e => e.fullKey === timestamp) || dynamicForecastArray[0] || null;
                windData = entry ? { speed: entry.wind, gust: entry.gust, direction: entry.direction ?? null } : null;
            }
            return { forecast: dynamicForecastArray, windData };
        }

        return dynamicForecastArray;

    } catch (mathError: unknown) {
        const msg = mathError instanceof Error ? mathError.message : String(mathError);
        logger.error('🚨 Mathematical interpolation error:', msg);
        return null;
    }
}
