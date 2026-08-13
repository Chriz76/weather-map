import { calculatewindSpeeds } from '../utils/interpolation';
import { D2 } from './providerIds';
import type { LatLng, Cluster, ForecastItem } from '../types';

export const ID = D2;

const CACHE_BUSTER = `cb=${Date.now()}`;

export const d2Provider = {
  id: ID,

  async fetchIndex(config: Record<string, unknown>): Promise<import('../types').IndexData> {
    const baseUrl = typeof config?.baseUrl === 'string' ? config.baseUrl : '';
    const response = await fetch(`${baseUrl}index.json?${CACHE_BUSTER}`, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`index.json could not be loaded (status: ${response.status})`);
    const json = await response.json();
    return (json && typeof json === 'object') ? (json as import('../types').IndexData) : ({} as import('../types').IndexData);
  },

  async fetchForecast(latlng: LatLng | null, config: Record<string, unknown> | null): Promise<ForecastItem[] | null> {
    if (!latlng || !config) return null;

    const imageBounds = config.imageBounds;
    const gridCellSize = config.gridCellSize;
    const baseUrl = typeof config.baseUrl === 'string' ? config.baseUrl : '';

    if (!Array.isArray(imageBounds) || typeof gridCellSize !== 'number') return null;

    const latMin = (imageBounds[0] as unknown[])[0] as number;
    const lonMin = (imageBounds[0] as unknown[])[1] as number;

    const col = Math.floor((latlng.lng - lonMin) / (gridCellSize as number));
    const row = Math.floor((latlng.lat - latMin) / (gridCellSize as number));
    const clusterUrl = `${baseUrl}grid_cluster/cluster_${col}_${row}.json?${CACHE_BUSTER}`;

    const response = await fetch(clusterUrl, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Cluster file could not be loaded (${response.status})`);

    const cluster: Cluster = await response.json();
    if (!cluster || !cluster.timeline || !cluster.lats) {
      throw new Error('Cluster data structure is invalid.');
    }

    return calculatewindSpeeds(latlng, cluster) as unknown as ForecastItem[] | null;
  },

  async fetchWeatherImageBlob(timestamp: string, config: Record<string, any>): Promise<Blob> {
    const imageUrl = `${config.baseUrl}${timestamp}Z.webp?${CACHE_BUSTER}`;
    const response = await fetch(imageUrl, { cache: 'no-cache' });
    if (!response.ok) throw new Error('Image could not be loaded');
    return await response.blob();
  }
};

export default d2Provider;
