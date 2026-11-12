import * as parsing from '../utils/parsing';
import { fetchIndexData } from './indexData';
import { readForecast } from './openMeteo';
import { AROME } from './providerIds';
import type { IndexData, LatLng, PointForecast } from '../types';

export const ID = AROME;

const CACHE_BUSTER = `cb=${Date.now()}`;

export const aromeProvider = {
  id: ID,

  async fetchIndex(config: Record<string, unknown>): Promise<IndexData> {
    const baseUrlRaw = config['baseUrl'];
    return fetchIndexData(parsing.isString(baseUrlRaw) ? baseUrlRaw : '');
  },

  async fetchForecast(latlng: LatLng | null, _config: Record<string, unknown> | null): Promise<PointForecast | null> {
    if (!latlng) return null;

    // `meteofrance_arome_seamless` with `temporal_resolution=native` answers with plain series
    // names in the `hourly` container (15-minute steps in the model area), so the shared reader
    // applies unchanged - verified against the live payload.
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latlng.lat}&longitude=${latlng.lng}&hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m,weather_code,is_day&models=meteofrance_arome_seamless&forecast_days=4&timeformat=unixtime&wind_speed_unit=kn&forecast_hours=31&past_hours=2&temporal_resolution=native&cell_selection=nearest&${CACHE_BUSTER}`;

    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Open-Meteo request failed (${res.status})`);

    const forecast = readForecast(await res.json());
    if (!forecast) throw new Error('Open-Meteo payload invalid');
    return forecast;
  }
};

export default aromeProvider;
