import { d2Provider } from './d2Provider';
import { aromeProvider } from './aromeProvider';
import { D2, AROME } from './providerIds';
import { logger } from '../utils/logger';
import { weatherProviderModel } from '../models/weatherProviderModel';
import { providers as providerConfig } from '../config';

const providers: Record<string, any> = { [D2]: d2Provider, [AROME]: aromeProvider };

export const providerManager = {
  async fetchIndex() {
    const activeId = weatherProviderModel.getActiveProviderId();
    const fetcher = providers[activeId];
    return await fetcher.fetchIndex(providerConfig[activeId]);
  },

  async fetchForecast(latlng: any) {
    const activeId = weatherProviderModel.getActiveProviderId();
    const fetcher = providers[activeId];
    return await fetcher.fetchForecast(latlng, providerConfig[activeId]);
  },

  async fetchWeatherImageBlob(timestamp: string) {
    const activeId = weatherProviderModel.getActiveProviderId();
    const fetcher = providers[activeId];
    return await fetcher.fetchWeatherImageBlob(timestamp, providerConfig[activeId]);
  }
};

export default providerManager;
