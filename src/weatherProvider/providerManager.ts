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
    const fetcher = providers[activeId];
    return await fetcher.fetchIndex(providerConfig[activeId]);
  },

  async fetchForecast(latlng: LatLng | null): Promise<ForecastItem[] | null> {
    const activeId = weatherProviderModel.getActiveProviderId();
    const fetcher = providers[activeId];
    return await fetcher.fetchForecast(latlng, providerConfig[activeId]);
  },

  async fetchWeatherImageBlob(timestamp: string): Promise<Blob> {
    const activeId = weatherProviderModel.getActiveProviderId();
    const fetcher = providers[activeId];
    return await fetcher.fetchWeatherImageBlob(timestamp, providerConfig[activeId]);
  }
};

export default providerManager;
