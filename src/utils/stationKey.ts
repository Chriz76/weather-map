import type { Station } from '../types';

/**
 * Builds a stable marker key so stations with duplicate ids can still render separately.
 *
 * @param station Station record from the map data.
 * @returns Unique-ish key based on id, name, and coordinates.
 */
export function getStationKey(station: Station): string {
  const id = String(station.id ?? station.station_id ?? '');
  const name = String(station.name ?? station.station_name ?? '');
  const lat = Number(station.lat);
  const lon = Number(station.lon);
  const latPart = Number.isFinite(lat) ? lat.toFixed(4) : '';
  const lonPart = Number.isFinite(lon) ? lon.toFixed(4) : '';

  return JSON.stringify([id, name, latPart, lonPart]);
}
