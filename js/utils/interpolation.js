import { formatToLocalTimeString } from './time.js';

/**
 * Calculates interpolated wind values for a clicked location.
 * Optimized for flat parallel array structures: timeline[tKey].speeds and timeline[tKey].dirs
 * * @param {{lat:number,lng:number}|null} latlng Clicked map coordinates.
 * @param {{lats:number[],lons:number[],timeline:Object<string, {speeds: number[], dirs: number[]}>}|null} cluster Cluster payload.
 * @param {string|null} activeTimestamp Selected timestamp key.
 * @returns {{forecast:Array<{hour:string,wind:number,direction:number|null,fullKey:string}>|null, windData:{speed:number|null,direction:number|null}|null}} Interpolation result.
 */
export function calculatewindSpeeds(latlng, cluster, activeTimestamp) {
    const t0 = performance.now();

    try {
        if (!latlng || !cluster || !cluster.timeline) {
            return { forecast: null, windData: null };
        }

        const clickLat = latlng.lat;
        const clickLng = latlng.lng;

        // Zeitstempel bestimmen
        const timelineKeys = Object.keys(cluster.timeline).sort();
        const currentTimeKey = activeTimestamp || timelineKeys[0];

        const totalPoints = cluster.lats.length;
        let distances = [];

        // 1. Distanzen zu allen Gitterpunkten berechnen
        for (let i = 0; i < totalPoints; i++) {
            const dLat = cluster.lats[i] - clickLat;
            const dLng = cluster.lons[i] - clickLng;
            const distSq = (dLat * dLat) + (dLng * dLng);
            distances.push({ index: i, dist: Math.sqrt(distSq) });
        }

        // Die 3 nächsten Nachbarn ermitteln
        distances.sort((a, b) => a.dist - b.dist);
        const d1 = distances[0], d2 = distances[1], d3 = distances[2];

        // Gewichte vorbereiten (Vermeidet Division durch 0 bei exaktem Match)
        const w1 = 1 / Math.max(d1.dist, 0.00001);
        const w2 = 1 / Math.max(d2.dist, 0.00001);
        const w3 = 1 / Math.max(d3.dist, 0.00001);
        const sumW = w1 + w2 + w3;

        // ---------------------------------------------------------------------
        // REINE OPTIMIERTE MATHEMATIK (Direkter Array-Zugriff statt Parser-Aufrufe)
        // ---------------------------------------------------------------------
        function interpolateScalar(d1, speeds) {
            if (d1.dist < 0.005) return speeds[d1.index] || 0;
            return ((speeds[d1.index] || 0) * w1 + (speeds[d2.index] || 0) * w2 + (speeds[d3.index] || 0) * w3) / sumW;
        }

        function interpolateDirection(d1, dirs) {
            if (d1.dist < 0.005) return dirs[d1.index];

            // Direktes Auslesen der Richtungen im Radian-Format für die Vektormittelung
            const r1 = (dirs[d1.index] ?? null);
            const r2 = (dirs[d2.index] ?? null);
            const r3 = (dirs[d3.index] ?? null);

            let sumSin = 0, sumCos = 0, weightTotal = 0;

            if (r1 !== null) { const rad = r1 * Math.PI / 180; sumSin += Math.sin(rad) * w1; sumCos += Math.cos(rad) * w1; weightTotal += w1; }
            if (r2 !== null) { const rad = r2 * Math.PI / 180; sumSin += Math.sin(rad) * w2; sumCos += Math.cos(rad) * w2; weightTotal += w2; }
            if (r3 !== null) { const rad = r3 * Math.PI / 180; sumSin += Math.sin(rad) * w3; sumCos += Math.cos(rad) * w3; weightTotal += w3; }

            if (weightTotal === 0 || (Math.abs(sumSin) < 1e-9 && Math.abs(sumCos) < 1e-9)) return null;

            let angle = Math.atan2(sumSin, sumCos) * 180 / Math.PI;
            return (angle + 360) % 360;
        }

        // ---------------------------------------------------------------------
        // 2. Interpolation für den AKTUELLEN Zeitschritt (Map-Marker)
        // ---------------------------------------------------------------------
        const currentTimeline = cluster.timeline[currentTimeKey] || { speeds: [], dirs: [] };
        const interpolatedSpeed = interpolateScalar(d1, currentTimeline.speeds);
        const interpolatedDirection = interpolateDirection(d1, currentTimeline.dirs);

        // ---------------------------------------------------------------------
        // 3. Interpolation über die GESAMTE Timeline (Forecast-Tabelle)
        // ---------------------------------------------------------------------
        let dynamicForecastArray = [];

        timelineKeys.forEach(tKey => {
            const tData = cluster.timeline[tKey] || { speeds: [], dirs: [] };
            
            const tWindInterpolated = interpolateScalar(d1, tData.speeds);
            const tDirectionInterpolated = interpolateDirection(d1, tData.dirs);

            const localTimeStr = formatToLocalTimeString(tKey);
            const displayHour = localTimeStr.split(':')[0];

            dynamicForecastArray.push({
                hour: displayHour,
                wind: Math.round(tWindInterpolated * 10) / 10,
                direction: tDirectionInterpolated === null ? null : Math.round(tDirectionInterpolated * 10) / 10,
                fullKey: tKey
            });
        });

        const result = {
            forecast: dynamicForecastArray,
            windData: {
                speed: Math.round(interpolatedSpeed * 10) / 10,
                direction: interpolatedDirection === null ? null : Math.round(interpolatedDirection * 10) / 10
            }
        };

        return result;

    } catch (mathError) {
        console.error("🚨 Mathematical interpolation error:", mathError.message);
        return { forecast: null, windData: null };
    }
}