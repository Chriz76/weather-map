import { d2Provider } from './d2Provider';
import { aromeProvider } from './aromeProvider';
import { D2, AROME } from './providerIds';
import { logger } from '../utils/logger';
import { weatherProviderModel } from '../models/weatherProviderModel';
import { providers as providerConfig } from '../config';
import type { Provider, LatLng, ForecastItem, IndexData } from '../types';

const providers: Record<string, Provider> = { [D2]: d2Provider, [AROME]: aromeProvider };

export const providerManager = {
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
    const cb = `cb=${Date.now()}`;
    const imageUrl = `${baseUrl}${timestamp}Z.webp?${cb}`;

    const response = await fetch(imageUrl, { cache: 'no-cache' });
    if (!response.ok) throw new Error('Image could not be loaded');
    return await response.blob();
  }
};

export default providerManager;
