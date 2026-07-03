import { formatToLocalTimeString } from './time.js';

/**
 * Extracts the hour string from a timeline key and converts it to local time.
 * @param {string} tKey Timeline key in the form "YYYYMMDD_HH".
 * @returns {string} Localized hour portion of the timeline key.
 */
function getDisplayHour(tKey) {
    return formatToLocalTimeString(tKey).split(':')[0];
}

/**
 * Interpolates wind speed, direction, and gusts for a clicked location and builds
 * a forecast array for every timestamp in the cluster payload.
 * @param {{lat:number,lng:number}} latlng Clicked map coordinates.
 * @param {{lats:number[],lons:number[],timeline:Object<string,{speeds:Array<number|undefined>,dirs:Array<number|null|undefined>,gusts:Array<number|undefined>}>}} cluster Cluster payload with grid point coordinates and timeline arrays.
 * @param {string|null} activeTimestamp Selected timestamp key or null to use the first available timestamp.
 * @returns {{forecast:Array<{hour:string,wind:number,gust:number,direction:number|null,fullKey:string}>|null,windData:{speed:number|null,gust:number|null,direction:number|null}|null}} Interpolation result.
 */
export function calculatewindSpeeds(latlng, cluster, activeTimestamp) {
    try {
        if (!latlng || !cluster || !cluster.timeline) {
            return { forecast: null, windData: null };
        }

        const clickLat = latlng.lat;
        const clickLng = latlng.lng;

        const timelineKeys = Object.keys(cluster.timeline).sort();
        const currentTimeKey = activeTimestamp || timelineKeys[0];

        const totalPoints = cluster.lats.length;
        if (totalPoints < 3) return { forecast: null, windData: null };

        // 1. Die 3 kleinsten quadrierten Distanzen in EINEM Durchlauf finden (Kein Array, kein Sortieren!)
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

        // Jetzt die echte Distanz berechnen (Nur noch 3x statt 1650x Math.sqrt!)
        const dist1 = Math.sqrt(dSq1);
        const dist2 = Math.sqrt(dSq2);
        const dist3 = Math.sqrt(dSq3);

        // Gewichte vorbereiten
        const w1 = 1 / Math.max(dist1, 0.00001);
        const w2 = 1 / Math.max(dist2, 0.00001);
        const w3 = 1 / Math.max(dist3, 0.00001);
        const sumW = w1 + w2 + w3;

        const exactMatch = dist1 < 0.005;

        // ---------------------------------------------------------------------
        // REINE MATHEMATIK ALS INLINE-SCHLEIFEN-HELPER
        // ---------------------------------------------------------------------
        const calcScalar = (values) => {
            if (exactMatch) return values[idx1] || 0;
            return ((values[idx1] || 0) * w1 + (values[idx2] || 0) * w2 + (values[idx3] || 0) * w3) / sumW;
        };

        const calcDirection = (dirs) => {
            if (exactMatch) return dirs[idx1];

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

        // 2. Interpolation für den AKTUELLEN Zeitschritt (Map-Marker)
        const currentTimeline = cluster.timeline[currentTimeKey] || { speeds: [], dirs: [], gusts: [] };
        const interpolatedSpeed = calcScalar(currentTimeline.speeds);
        const interpolatedGust = calcScalar(currentTimeline.gusts || []);
        const interpolatedDirection = calcDirection(currentTimeline.dirs);

        // 3. Interpolation über die GESAMTE Timeline (Forecast-Tabelle)
        const len = timelineKeys.length;
        let dynamicForecastArray = new Array(len); // Array-Größe im Vorfeld fixieren

        for (let k = 0; k < len; k++) {
            const tKey = timelineKeys[k];
            const tData = cluster.timeline[tKey] || { speeds: [], dirs: [], gusts: [] };
            
            const tWindInterpolated = calcScalar(tData.speeds);
            const tGustInterpolated = calcScalar(tData.gusts || []);
            const tDirectionInterpolated = calcDirection(tData.dirs);

            dynamicForecastArray[k] = {
                hour: getDisplayHour(tKey),
                wind: Math.round(tWindInterpolated * 10) / 10,
                gust: Math.round(tGustInterpolated * 10) / 10,
                direction: tDirectionInterpolated === null ? null : Math.round(tDirectionInterpolated * 10) / 10,
                fullKey: tKey
            };
        }

        return {
            forecast: dynamicForecastArray,
            windData: {
                speed: Math.round(interpolatedSpeed * 10) / 10,
                gust: Math.round(interpolatedGust * 10) / 10,
                direction: interpolatedDirection === null ? null : Math.round(interpolatedDirection * 10) / 10
            }
        };

    } catch (mathError) {
        console.error("🚨 Mathematical interpolation error:", mathError.message);
        return { forecast: null, windData: null };
    }
}
