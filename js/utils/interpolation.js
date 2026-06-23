import { formatToLocalTimeString } from './time.js';

/**
 * Calculates interpolated wind values for a clicked location.
 * @param {{lat:number,lng:number}|null} latlng Clicked map coordinates.
 * @param {{lats:number[],lons:number[],timeline:Object<string, Array<number|Array<number>>>}|null} cluster Cluster payload.
 * @param {string|null} activeTimestamp Selected timestamp key.
 * @returns {{forecast:Array<{hour:string,wind:number,direction:number|null,fullKey:string}>|null, windData:{speed:number|null,direction:number|null}|null}} Interpolation result.
 */
export function calculatewindSpeeds(latlng, cluster, activeTimestamp) {
    /**
     * Normalizes one raw wind sample from the API payload.
     * Supports legacy speed-only numbers and new [speed, direction] tuples.
     * @param {number|Array<number>|null|undefined} sample Raw timeline sample.
     * @returns {{speed:number,direction:number|null}} Parsed speed/direction pair.
     */
    function parseWindSample(sample) {
        if (Array.isArray(sample)) {
            const speed = Number(sample[0]);
            const direction = Number(sample[1]);
            return {
                speed: Number.isFinite(speed) ? speed : 0,
                direction: Number.isFinite(direction) ? ((direction % 360) + 360) % 360 : null
            };
        }

        const speed = Number(sample);
        return {
            speed: Number.isFinite(speed) ? speed : 0,
            direction: null
        };
    }

    /**
     * Interpolates a scalar value using inverse-distance weighting.
     * @param {{index:number,dist:number}} d1 Nearest point descriptor.
     * @param {{index:number,dist:number}} d2 Second nearest point descriptor.
     * @param {{index:number,dist:number}} d3 Third nearest point descriptor.
     * @param {(index:number) => number} getValue Value accessor for each point.
     * @returns {number} Interpolated scalar value.
     */
    function interpolateScalar(d1, d2, d3, getValue) {
        if (d1.dist < 0.005) {
            return getValue(d1.index);
        }

        const w1 = 1 / d1.dist;
        const w2 = 1 / d2.dist;
        const w3 = 1 / d3.dist;
        const sumW = w1 + w2 + w3;

        return ((getValue(d1.index) * w1) + (getValue(d2.index) * w2) + (getValue(d3.index) * w3)) / sumW;
    }

    /**
     * Interpolates wind direction in degrees with circular averaging.
     * @param {{index:number,dist:number}} d1 Nearest point descriptor.
     * @param {{index:number,dist:number}} d2 Second nearest point descriptor.
     * @param {{index:number,dist:number}} d3 Third nearest point descriptor.
     * @param {(index:number) => number|null} getDirection Direction accessor.
     * @returns {number|null} Interpolated direction in [0, 360) or null.
     */
    function interpolateDirection(d1, d2, d3, getDirection) {
        if (d1.dist < 0.005) {
            return getDirection(d1.index);
        }

        const neighbors = [d1, d2, d3];
        let sumSin = 0;
        let sumCos = 0;
        let weightTotal = 0;

        neighbors.forEach((neighbor) => {
            const direction = getDirection(neighbor.index);
            if (direction === null) return;

            const weight = 1 / neighbor.dist;
            const radians = direction * Math.PI / 180;
            sumSin += Math.sin(radians) * weight;
            sumCos += Math.cos(radians) * weight;
            weightTotal += weight;
        });

        if (weightTotal === 0) return null;
        if (Math.abs(sumSin) < 1e-9 && Math.abs(sumCos) < 1e-9) return null;

        const angle = Math.atan2(sumSin, sumCos) * 180 / Math.PI;
        return (angle + 360) % 360;
    }

    try {
        if (!latlng || !cluster) return { forecast: null, windData: null };

        const clickLat = latlng.lat;
        const clickLng = latlng.lng;

        const currentTimeKey = activeTimestamp || Object.keys(cluster.timeline).sort()[0];

        const totalPoints = cluster.lats.length;
        let distances = [];

        for (let i = 0; i < totalPoints; i++) {
            const dLat = cluster.lats[i] - clickLat;
            const dLng = cluster.lons[i] - clickLng;
            const distSq = (dLat * dLat) + (dLng * dLng);
            distances.push({ index: i, dist: Math.sqrt(distSq) });
        }

        distances.sort((a, b) => a.dist - b.dist);
        const d1 = distances[0], d2 = distances[1], d3 = distances[2];

        const currentTimelineWinds = cluster.timeline[currentTimeKey] || [];

        const interpolatedSpeed = interpolateScalar(d1, d2, d3, (index) => parseWindSample(currentTimelineWinds[index]).speed);
        const interpolatedDirection = interpolateDirection(d1, d2, d3, (index) => parseWindSample(currentTimelineWinds[index]).direction);

        let dynamicForecastArray = [];
        const sortedTimelineKeys = Object.keys(cluster.timeline).sort();

        sortedTimelineKeys.forEach(tKey => {
            const tWinds = cluster.timeline[tKey];
            const tWindInterpolated = interpolateScalar(d1, d2, d3, (index) => parseWindSample(tWinds[index]).speed);
            const tDirectionInterpolated = interpolateDirection(d1, d2, d3, (index) => parseWindSample(tWinds[index]).direction);

            const localTimeStr = formatToLocalTimeString(tKey);
            const displayHour = localTimeStr.split(':')[0];

            dynamicForecastArray.push({
                hour: displayHour,
                wind: Math.round(tWindInterpolated * 10) / 10,
                direction: tDirectionInterpolated === null ? null : Math.round(tDirectionInterpolated * 10) / 10,
                fullKey: tKey
            });
        });

        return {
            forecast: dynamicForecastArray,
            windData: {
                speed: Math.round(interpolatedSpeed * 10) / 10,
                direction: interpolatedDirection === null ? null : Math.round(interpolatedDirection * 10) / 10
            }
        };

    } catch (mathError) {
        console.error("🚨 Mathematical interpolation error:", mathError.message);
        return { forecast: null, windData: null };
    }
}