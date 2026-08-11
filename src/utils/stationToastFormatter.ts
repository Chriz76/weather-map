import { formatMinutesAgo } from './time';
import type { Station } from '../types';

export function formatStationToast(station: Station): string {
    const stationName = station.station_name || station.name || 'Station';
    const windData = station.windData ?? {};
    const windSpeed = typeof (windData as any).windSpeed === 'number' ? (windData as any).windSpeed.toFixed(1) : '--';
    const windGust = typeof (windData as any).windGustSpeed === 'number' ? Math.round((windData as any).windGustSpeed) : '--';
    const temperature = typeof (windData as any).temperature === 'number' ? (windData as any).temperature.toFixed(1) : '--';
    const age = formatMinutesAgo((windData as any).timestamp);
    const lat = typeof station.lat === 'number' ? station.lat.toFixed(4) : '--';
    const lon = typeof station.lon === 'number' ? station.lon.toFixed(4) : '--';

    return `${stationName}\n${age}\n${windSpeed} kts max ${windGust} kts\n${temperature}°C\nlat ${lat}, lon ${lon}`;
}
