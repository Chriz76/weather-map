import * as parsing from '../utils/parsing';
import { fetchIndexData } from './indexData';
import { readForecast } from './openMeteo';
import { HRRR } from './providerIds';
import type { IndexData, LatLng, PointForecast } from '../types';

export const ID = HRRR;

/** Evaluated once per page load: a per-call timestamp would defeat the HTTP cache. */
const CACHE_BUSTER = `cb=${Date.now()}`;

export const hrrrProvider = {
  id: ID,

  async fetchIndex(config: Record<string, unknown>): Promise<IndexData> {
    const baseUrlRaw = config['baseUrl'];
    return fetchIndexData(parsing.isString(baseUrlRaw) ? baseUrlRaw : '');
  },

  async fetchForecast(latlng: LatLng | null, _config: Record<string, unknown> | null): Promise<PointForecast | null> {
    if (!latlng) return null;

    // NOAA HRRR: 15-minute wind series, CONUS only - outside it wind speed and direction come back
    // empty (gusts still do not, see `readForecast`). weather_code/is_day are only published
    // hourly, so they are requested for the same window.
    // The six hours back are what the table needs to start at the run's first frame: the tiles of a
    // run are published ~3 h after it started, so the buffer has roughly double the headroom.
    // `WeatherProviderModel` trims the series to the window the index publishes, so a wide request
    // costs payload but never adds columns; a run older than the buffer only shortens the head.
    // The 20 h horizon covers the pipeline's 18 h run window with margin and uses the same margin
    // for the hourly weather container.
    const url = `https://api.open-meteo.com/v1/gfs?latitude=${latlng.lat}&longitude=${latlng.lng}&minutely_15=wind_speed_10m,wind_gusts_10m,wind_direction_10m&hourly=weather_code,is_day&models=ncep_rrfs_seamless&forecast_minutely_15=80&past_minutely_15=24&past_hours=6&forecast_hours=20&timeformat=unixtime&wind_speed_unit=kn&cell_selection=nearest&${CACHE_BUSTER}`;

    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Open-Meteo request failed (${res.status})`);

    const payload: unknown = await res.json();
    const forecast = readForecast(payload);
    if (!forecast) throw new Error('Open-Meteo payload invalid');
    return forecast;
  }
};

export default hrrrProvider;
