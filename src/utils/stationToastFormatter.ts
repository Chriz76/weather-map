import { formatMinutesAgo } from './time';
import type { Station } from '../types';

export function formatStationToast(station: Station): string {
    const stationName = station.station_name || station.name || 'Station';
    const windData = station.windData ?? null;
    const windSpeed = typeof windData?.speed === 'number' ? windData.speed.toFixed(1) : '--';
    const windGust = typeof windData?.gust === 'number' ? String(Math.round(windData.gust)) : '--';
    const temperature = typeof windData?.temperature === 'number' ? windData.temperature.toFixed(1) : '--';
    const ts = windData?.timestamp ?? null;
    const age = (typeof ts === 'string' || ts instanceof Date) ? formatMinutesAgo(ts) : '';
    const lat = typeof station.lat === 'number' ? station.lat.toFixed(4) : '--';
    const lon = typeof station.lon === 'number' ? station.lon.toFixed(4) : '--';

    return `${stationName}\n${age}\n${windSpeed} kts max ${windGust} kts\n${temperature}°C\nlat ${lat}, lon ${lon}`;
}
