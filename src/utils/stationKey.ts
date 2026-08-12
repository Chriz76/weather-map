import type { Station } from '../types';

export function getStationKey(station: Station): string {
  const id = String(station.id ?? station.station_id ?? '');
  const name = String(station.name ?? station.station_name ?? '');
  const lat = Number(station.lat);
  const lon = Number(station.lon);
  const latPart = Number.isFinite(lat) ? lat.toFixed(4) : '';
  const lonPart = Number.isFinite(lon) ? lon.toFixed(4) : '';

  return [id, name, latPart, lonPart].join('|');
}
