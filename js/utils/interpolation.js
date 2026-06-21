import { formatToLocalTimeString } from './time.js';

/**
 * REINE FUNKTION: Berechnet die interpolierten Windwerte für einen Klickpunkt.
 * Erwartet keine Callbacks mehr, sondern gibt das Ergebnis direkt zurück.
 */
export function calculatewindSpeeds(latlng, cluster, activeTimestamp) {
    try {
        if (!latlng || !cluster) return { forecast: null, windSpeed: null };

        const clickLat = latlng.lat;
        const clickLng = latlng.lng;

        // 🌟 SAUBER: Wenn kein aktiver Timestamp übergeben wurde, nimm den ersten verfügbaren aus dem Cluster
        const currentTimeKey = activeTimestamp || Object.keys(cluster.timeline).sort()[0];

        const totalPoints = cluster.lats.length;
        let distances = [];

        // 1. Distanzen zu allen Gitterpunkten berechnen
        for (let i = 0; i < totalPoints; i++) {
            const dLat = cluster.lats[i] - clickLat;
            const dLng = cluster.lons[i] - clickLng;
            const distSq = (dLat * dLat) + (dLng * dLng);
            distances.push({ index: i, dist: Math.sqrt(distSq) });
        }

        // Sortieren, um die 3 nächsten Nachbarn zu finden
        distances.sort((a, b) => a.dist - b.dist);
        const d1 = distances[0], d2 = distances[1], d3 = distances[2];

        // 2. Interpolation für den AKTUELLEN Zeitschritt (für den Map-Marker)
        const currentTimelineWinds = cluster.timeline[currentTimeKey] || [];
        let interpolatedWind = 0;

        if (d1.dist < 0.005) {
            interpolatedWind = currentTimelineWinds[d1.index];
        } else {
            const w1 = 1 / d1.dist, w2 = 1 / d2.dist, w3 = 1 / d3.dist;
            const sumW = w1 + w2 + w3;
            const wind1 = currentTimelineWinds[d1.index] || 0;
            const wind2 = currentTimelineWinds[d2.index] || 0;
            const wind3 = currentTimelineWinds[d3.index] || 0;
            interpolatedWind = (wind1 * w1 + wind2 * w2 + wind3 * w3) / sumW;
        }
        interpolatedWind = Math.round(interpolatedWind * 10) / 10;

        // 3. Interpolation über die GESAMTE Timeline (für die Forecast-Tabelle)
        let dynamicForecastArray = [];
        const sortedTimelineKeys = Object.keys(cluster.timeline).sort();

        sortedTimelineKeys.forEach(tKey => {
            const tWinds = cluster.timeline[tKey];
            let tWindInterpolated = 0;

            if (d1.dist < 0.005) {
                tWindInterpolated = tWinds[d1.index];
            } else {
                const w1 = 1 / d1.dist, w2 = 1 / d2.dist, w3 = 1 / d3.dist;
                tWindInterpolated = ((tWinds[d1.index] || 0) * w1 + (tWinds[d2.index] || 0) * w2 + (tWinds[d3.index] || 0) * w3) / (w1 + w2 + w3);
            }

            const localTimeStr = formatToLocalTimeString(tKey);
            const displayHour = localTimeStr.split(':')[0];

            dynamicForecastArray.push({ hour: displayHour, wind: tWindInterpolated, fullKey: tKey });
        });

        return {
            forecast: dynamicForecastArray,
            windSpeed: interpolatedWind // Nur noch die nackte Zahl! (z.B. 14.5)
        };

    } catch (mathError) {
        console.error("🚨 Mathematical interpolation error:", mathError.message);
        return { forecast: null, windSpeed: null };
    }
}