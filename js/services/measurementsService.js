// services/windService.js

/**
 * Holt die aktuellen Wetterdaten für eine bestimmte DWD-Stations-ID von Bright Sky.
 * @param {string} dwdStationId 
 * @returns {Promise<{windSpeed: number, windDirection: number} | null>} Windgeschwindigkeit in Knoten und Richtung in Grad
 */
export async function fetchWindDataForStation(dwdStationId) {
    // Bright Sky Endpunkt für aktuelle Stationsdaten
    const url = `https://api.brightsky.dev/current_weather?dwd_station_id=${dwdStationId}`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`API-Fehler: ${response.status}`);
        
        const data = await response.json();
        const current = data.weather;

        if (!current) return null;

        // Use ONLY the 10-minute values as requested
        const speedKmh = typeof current.wind_speed_10 === 'number' ? current.wind_speed_10 : null;
        const direction = typeof current.wind_direction_10 === 'number' ? current.wind_direction_10 : null;

        if (speedKmh === null) {
            console.debug(`BrightSky: missing wind_speed_10 for station ${dwdStationId}`);
            return null;
        }

        // Convert km/h to knots (1 km/h = 0.539957 kt)
        const windSpeedKnots = Math.round(speedKmh * 0.539957);
        console.debug(`BrightSky: station ${dwdStationId} -> speed_10 ${speedKmh} km/h (${windSpeedKnots} kt), dir_10 ${direction}`);

        return {
            windSpeed: windSpeedKnots,
            windDirection: typeof direction === 'number' ? direction : 0
        };
    } catch (error) {
        console.error(`Fehler beim Laden der Winddaten für Station ${dwdStationId}:`, error);
        return null;
    }
}