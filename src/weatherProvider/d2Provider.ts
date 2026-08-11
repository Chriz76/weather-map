import { calculatewindSpeeds } from '../utils/interpolation';
import { D2 } from './providerIds';
import type { LatLng, Cluster, ForecastItem } from '../types';

export const ID = D2;

const CACHE_BUSTER = `cb=${Date.now()}`;

export const d2Provider = {
  id: ID,

  async fetchIndex(config: any): Promise<any> {
    const response = await fetch(`${config.baseUrl}index.json?${CACHE_BUSTER}`, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`index.json could not be loaded (status: ${response.status})`);
    return await response.json();
  },

  async fetchForecast(latlng: LatLng | null, config: any | null): Promise<ForecastItem[] | null> {
    if (!latlng || !config) return null;

    const latMin = config.imageBounds[0][0];
    const lonMin = config.imageBounds[0][1];

    const col = Math.floor((latlng.lng - lonMin) / config.gridCellSize);
    const row = Math.floor((latlng.lat - latMin) / config.gridCellSize);
    const clusterUrl = `${config.baseUrl}grid_cluster/cluster_${col}_${row}.json?${CACHE_BUSTER}`;

    const response = await fetch(clusterUrl, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Cluster file could not be loaded (${response.status})`);

    const cluster: Cluster = await response.json();
    if (!cluster || !cluster.timeline || !cluster.lats) {
      throw new Error('Cluster data structure is invalid.');
    }

    return calculatewindSpeeds(latlng, cluster) as unknown as ForecastItem[] | null;
  },

  async fetchWeatherImageBlob(timestamp: string, config: any): Promise<Blob> {
    const imageUrl = `${config.baseUrl}${timestamp}Z.webp?${CACHE_BUSTER}`;
    const response = await fetch(imageUrl, { cache: 'no-cache' });
    if (!response.ok) throw new Error('Image could not be loaded');
    return await response.blob();
  }
};

export default d2Provider;
