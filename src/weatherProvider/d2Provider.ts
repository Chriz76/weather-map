import { calculatewindSpeeds } from '../utils/interpolation';
import * as parsing from '../utils/parsing';
import { fetchIndexData } from './indexData';
import { D2 } from './providerIds';
import type { Cluster, ForecastItem, IndexData, LatLng, TimelineEntry } from '../types';

export const ID = D2;

const CACHE_BUSTER = `cb=${Date.now()}`;

export const d2Provider = {
  id: ID,

  async fetchIndex(config: Record<string, unknown>): Promise<IndexData> {
    const baseUrlRaw = config['baseUrl'];
    return fetchIndexData(parsing.isString(baseUrlRaw) ? baseUrlRaw : '');
  },

  async fetchForecast(latlng: LatLng | null, config: Record<string, unknown> | null): Promise<ForecastItem[] | null> {
    if (!latlng || !config) return null;

    const imageBounds = config['imageBounds'];
    const gridCellSize = config['gridCellSize'];

    if (!parsing.isUnknownArray(imageBounds) || !parsing.isNumber(gridCellSize)) return null;

    const firstRow = imageBounds[0];
    if (!parsing.isUnknownArray(firstRow)) return null;

    const latMin = firstRow[0];
    const lonMin = firstRow[1];
    if (!parsing.isNumber(latMin) || !parsing.isNumber(lonMin)) return null;

    const baseUrlRaw = config['baseUrl'];
    const baseUrl = parsing.isString(baseUrlRaw) ? baseUrlRaw : '';

    const col = Math.floor((latlng.lng - lonMin) / gridCellSize);
    const row = Math.floor((latlng.lat - latMin) / gridCellSize);
    const clusterUrl = `${baseUrl}grid_cluster/cluster_${col}_${row}.json?${CACHE_BUSTER}`;

    const response = await fetch(clusterUrl, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Cluster file could not be loaded (${response.status})`);

    const clusterJson: unknown = await response.json();
    if (!parsing.isObject(clusterJson)) throw new Error('Cluster data structure is invalid.');

    const latsRaw = clusterJson['lats'];
    const lonsRaw = clusterJson['lons'];
    const timelineRaw = clusterJson['timeline'];
    if (!parsing.isUnknownArray(latsRaw) || !parsing.isUnknownArray(lonsRaw) || !parsing.isObject(timelineRaw)) {
      throw new Error('Cluster data structure is invalid.');
    }

    const lats = latsRaw.filter(parsing.isNumber);
    const lons = lonsRaw.filter(parsing.isNumber);

    if (lats.length === 0 || lons.length === 0 || lats.length !== lons.length) {
      throw new Error('Cluster lat/lon arrays are invalid.');
    }

    const timeline: Record<string, TimelineEntry> = {};
    for (const [key, value] of Object.entries(timelineRaw)) {
      if (!parsing.isObject(value)) continue;
      timeline[key] = {
        speeds: parsing.toNumberOrUndefinedSeries(value['speeds']),
        dirs: parsing.toDirectionSeries(value['dirs']),
        gusts: parsing.toNumberOrUndefinedSeries(value['gusts'])
      };
    }

    const cluster: Cluster = { lats, lons, timeline };

    return calculatewindSpeeds(latlng, cluster);
  }
};

export default d2Provider;
