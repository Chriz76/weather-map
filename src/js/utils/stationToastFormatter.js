import { formatMinutesAgo } from './time.js';

export function formatStationToast(station) {
    const stationName = station.station_name || station.name || 'Station';
    const windData = station.windData || {};
    const windSpeed = typeof windData.windSpeed === 'number' ? windData.windSpeed.toFixed(1) : '--';
    const windGust = typeof windData.windGustSpeed === 'number' ? Math.round(windData.windGustSpeed) : '--';
    const temperature = typeof windData.temperature === 'number' ? windData.temperature.toFixed(1) : '--';
    const age = formatMinutesAgo(windData.timestamp);
    const lat = typeof station.lat === 'number' ? station.lat.toFixed(4) : '--';
    const lon = typeof station.lon === 'number' ? station.lon.toFixed(4) : '--';

    return `${stationName}\n${age}\n${windSpeed} kts max ${windGust} kts\n${temperature}°C\nlat ${lat}, lon ${lon}`;
}
