import * as parsing from '../utils/parsing';
import { fetchIndexData } from './indexData';
import { readForecast } from './openMeteo';
import { D2 } from './providerIds';
import type { ForecastItem, IndexData, LatLng } from '../types';

export const ID = D2;

/** Evaluated once per page load: a per-call timestamp would defeat the HTTP cache. */
const CACHE_BUSTER = `cb=${Date.now()}`;

export const d2Provider = {
  id: ID,

  async fetchIndex(config: Record<string, unknown>): Promise<IndexData> {
    const baseUrlRaw = config['baseUrl'];
    return fetchIndexData(parsing.isString(baseUrlRaw) ? baseUrlRaw : '');
  },

  async fetchForecast(latlng: LatLng | null, _config: Record<string, unknown> | null): Promise<ForecastItem[] | null> {
    if (!latlng) return null;

    // DWD ICON-D2 RUC (`dwd_icon_d2_ruc_native`): hourly wind *and* weather (WW) series from the
    // rapid update cycle, Central Europe only. Requested hourly because DWD publishes neither
    // 10 m wind nor weather codes below one hour for the RUC - `minutely_15` would only
    // interpolate these hourly fields, so it carries no extra information.
    const url = `https://api.open-meteo.com/v1/dwd-icon?latitude=${latlng.lat}&longitude=${latlng.lng}&hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m,weather_code,is_day&models=dwd_icon_d2_ruc_native&forecast_hours=25&past_hours=6&timeformat=unixtime&wind_speed_unit=kn&${CACHE_BUSTER}`;

    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Open-Meteo request failed (${res.status})`);

    const payload: unknown = await res.json();
    const forecast = readForecast(payload);
    if (!forecast) throw new Error('Open-Meteo payload invalid');
    return forecast;
  }
};

export default d2Provider;
