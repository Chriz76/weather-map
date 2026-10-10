import { d2Provider } from '../weatherProvider/d2Provider';
import { aromeProvider } from '../weatherProvider/aromeProvider';
import { D2, AROME } from '../weatherProvider/providerIds';
import { weatherProviderModel } from '../models/weatherProviderModel';
import { providers as providerConfig } from '../config';
import type { Provider, LatLng, ForecastItem, IndexData } from '../types';

const providers: Record<string, Provider> = { [D2]: d2Provider, [AROME]: aromeProvider };

/**
 * Evaluated once per page load on purpose, exactly like the PMTiles cache in
 * `windArrowService`. A per-call `Date.now()` would bypass the HTTP cache on
 * every request; a constant keeps repeated requests cacheable.
 */
const CACHE_BUSTER = `cb=${Date.now()}`;

/**
 * Model generation tag, mirroring `windArrowService`. Keeps the image URL
 * stable while the model run is unchanged, so the image is only refetched when
 * a new model run (or a new timestamp) actually exists.
 */
function getGeneratedTag(): string {
  try {
    const gen = weatherProviderModel.modelGeneratedAt;
    return encodeURIComponent(gen ?? String(Date.now()));
  } catch (e) {
    return String(Date.now());
  }
}

export const weatherService = {
  async fetchIndex(): Promise<IndexData> {
    const activeId = weatherProviderModel.getActiveProviderId();
    const fetcher = providers[activeId]!;
    return await fetcher.fetchIndex(providerConfig[activeId]!);
  },

  async fetchForecast(latlng: LatLng | null): Promise<ForecastItem[] | null> {
    const activeId = weatherProviderModel.getActiveProviderId();
    const fetcher = providers[activeId]!;
    return await fetcher.fetchForecast(latlng, providerConfig[activeId]!);
  },

  async fetchWeatherImageBlob(timestamp: string): Promise<Blob> {
    const activeId = weatherProviderModel.getActiveProviderId();
    const cfg = providerConfig[activeId] as Record<string, unknown> | undefined;
    const baseUrl = cfg && typeof cfg.baseUrl === 'string' ? cfg.baseUrl : '';
    const imageUrl = `${baseUrl}${timestamp}Z.webp?g=${getGeneratedTag()}&${CACHE_BUSTER}`;

    const response = await fetch(imageUrl, { cache: 'no-cache' });
    if (!response.ok) throw new Error('Image could not be loaded');
    return await response.blob();
  }
};

export default weatherService;
