import { formatModelTimestampToTime } from './time';
import { logger } from './logger';

type LatLng = { lat: number; lng: number };
type TimelineEntry = { speeds?: Array<number | undefined>; dirs?: Array<number | null | undefined>; gusts?: Array<number | undefined> };
type Cluster = { lats: number[]; lons: number[]; timeline: Record<string, TimelineEntry> };

function getDisplayHour(tKey: string) {
    return formatModelTimestampToTime(tKey).split(':')[0];
}

export function calculatewindSpeeds(latlng: LatLng, cluster: Cluster) {
    try {
        if (!latlng || !cluster || !cluster.timeline) {
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
            const dLat = lats[i] - clickLat;
            const dLng = lons[i] - clickLng;
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
        const dynamicForecastArray: Array<{hour:string,wind:number,gust:number,direction:number|null,fullKey:string}> = new Array(len);

        for (let k = 0; k < len; k++) {
            const tKey = timelineKeys[k];
            const tData = cluster.timeline[tKey] || { speeds: [], dirs: [], gusts: [] };
            
            const tWindInterpolated = calcScalar(tData.speeds || []);
            const tGustInterpolated = calcScalar(tData.gusts || []);
            const tDirectionInterpolated = calcDirection(tData.dirs || []);

            dynamicForecastArray[k] = {
                hour: getDisplayHour(tKey),
                wind: Math.round(tWindInterpolated * 10) / 10,
                gust: Math.round(tGustInterpolated * 10) / 10,
                direction: tDirectionInterpolated === null ? null : Math.round(tDirectionInterpolated * 10) / 10,
                fullKey: tKey
            };
        }

        return dynamicForecastArray;

    } catch (mathError: unknown) {
        const msg = mathError instanceof Error ? mathError.message : String(mathError);
        logger.error('🚨 Mathematical interpolation error:', msg);
        return null;
    }
}
