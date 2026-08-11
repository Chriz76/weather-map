import { formatModelTimestampToTime } from '../utils/time';
import { AROME } from './providerIds';
import type { LatLng, ForecastItem } from '../../types';

export const ID = AROME;

const CACHE_BUSTER = `cb=${Date.now()}`;

export const aromeProvider = {
  id: ID,

  async fetchIndex(config: any): Promise<any> {
    const response = await fetch(`${config.baseUrl}index.json?${CACHE_BUSTER}`, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`index.json could not be loaded (status: ${response.status})`);
    return await response.json();
  },

  async fetchForecast(latlng: LatLng | null, config: any | null): Promise<ForecastItem[] | null> {
    if (!latlng) return null;

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latlng.lat}&longitude=${latlng.lng}&models=meteofrance_arome_france_15min,meteofrance_arome_france_hd_15min&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m&timeformat=unixtime&wind_speed_unit=kn&past_hours=1&forecast_hours=12&temporal_resolution=native&${CACHE_BUSTER}`;

    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Open-Meteo request failed (${res.status})`);
    const payload = await res.json();

    if (!payload || !payload.hourly || !Array.isArray(payload.hourly.time)) {
      throw new Error('Open-Meteo payload invalid');
    }

    const h = payload.hourly;
    const times = h.time;
    const speed15 = h['wind_speed_10m_meteofrance_arome_france_15min'] || [];
    const dir15 = h['wind_direction_10m_meteofrance_arome_france_15min'] || [];
    const gust15 = h['wind_gusts_10m_meteofrance_arome_france_15min'] || [];
    const speedHd = h['wind_speed_10m_meteofrance_arome_france_hd_15min'] || [];
    const dirHd = h['wind_direction_10m_meteofrance_arome_france_hd_15min'] || [];
    const gustHd = h['wind_gusts_10m_meteofrance_arome_france_hd_15min'] || [];

    const unixToModelKey = (sec: number) => {
      const d = new Date(Number(sec) * 1000);
      const YYYY = String(d.getUTCFullYear()).padStart(4, '0');
      const MM = String(d.getUTCMonth() + 1).padStart(2, '0');
      const DD = String(d.getUTCDate()).padStart(2, '0');
      const hh = String(d.getUTCHours()).padStart(2, '0');
      const mm = String(d.getUTCMinutes()).padStart(2, '0');
      return `${YYYY}${MM}${DD}_${hh}${mm}`;
    };

    let lastIdx = -1;
    for (let i = times.length - 1; i >= 0; i--) {
      const anyValue =
        (speed15[i] != null) ||
        (speedHd[i] != null) ||
        (gust15[i] != null) ||
        (gustHd[i] != null) ||
        (dir15[i] != null) ||
        (dirHd[i] != null);
      if (anyValue) { lastIdx = i; break; }
    }

    if (lastIdx === -1) return null;

    const sliceTo = (arr: any) => (Array.isArray(arr) ? arr.slice(0, lastIdx + 1) : []);
    const timesTrim = sliceTo(times);
    const speed15Trim = sliceTo(speed15);
    const dir15Trim = sliceTo(dir15);
    const gust15Trim = sliceTo(gust15);
    const speedHdTrim = sliceTo(speedHd);
    const dirHdTrim = sliceTo(dirHd);
    const gustHdTrim = sliceTo(gustHd);

    const result: ForecastItem[] = [];
    for (let i = 0; i < timesTrim.length; i++) {
      const t = timesTrim[i];
      const s15 = speed15Trim[i];
      const sHd = speedHdTrim[i];
      const g15 = gust15Trim[i];
      const gHd = gustHdTrim[i];
      const d15 = dir15Trim[i];
      const dHd = dirHdTrim[i];

      const speed = (s15 != null) ? s15 : (sHd != null ? sHd : null);
      const gust = (g15 != null) ? g15 : (gHd != null ? gHd : null);
      const direction = (d15 != null) ? d15 : (dHd != null ? dHd : null);

      const fullKey = unixToModelKey(t);
      result.push({
        hour: formatModelTimestampToTime(fullKey),
        wind: speed == null ? null as any : Math.round(speed * 10) / 10,
        gust: gust == null ? null as any : Math.round(gust * 10) / 10,
        direction: direction == null ? null : Math.round(direction * 10) / 10,
        fullKey
      } as unknown as ForecastItem);
    }

    return result;
  },

  async fetchWeatherImageBlob(timestamp: string, config: any): Promise<Blob> {
    const imageUrl = `${config.baseUrl}${timestamp}Z.webp?${CACHE_BUSTER}`;
    const response = await fetch(imageUrl, { cache: 'no-cache' });
    if (!response.ok) throw new Error('Image could not be loaded');
    return await response.blob();
  }
};

export default aromeProvider;
