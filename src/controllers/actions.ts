import { EXPECTED_API_VERSION } from '../config';
import { weatherProviderModel } from '../models/weatherProviderModel';
import { uiStateModel } from '../models/uiStateModel';
import { providerManager } from '../weatherProvider/providerManager';
import { loadingSpinnerController } from './loadingSpinnerController';
import { logger } from '../utils/logger';
import type { IndexData, LatLng, ForecastItem } from '../types';

export class ApiMismatchError extends Error {
  version: string | undefined;
  constructor(version?: string) {
    super(`API_VERSION_MISMATCH:${version}`);
    this.name = 'ApiMismatchError';
    this.version = version;
  }
}

export class IndexLoadError extends Error {
  detail: string | undefined;
  constructor(message?: string) {
    super(`INDEX_LOAD_FAILED: ${message}`);
    this.name = 'IndexLoadError';
    this.detail = message;
  }
}

export class LocationLoadError extends Error {
  detail: string | undefined;
  constructor(message?: string) {
    super(`LOAD_LOCATION_FAILED: ${message}`);
    this.name = 'LocationLoadError';
    this.detail = message;
  }
}

export class OverlayLoadError extends Error {
  detail: string | undefined;
  constructor(message?: string) {
    super(`OVERLAY_FETCH_FAILED: ${message}`);
    this.name = 'OverlayLoadError';
    this.detail = message;
  }
}

let currentOverlayBlobUrl: string | null = null;

async function fetchWeatherOverlayUrl(timestamp: string | null): Promise<string | null> {
  if (!timestamp) return null;
  const imageBlob = await providerManager.fetchWeatherImageBlob(timestamp);
  if (currentOverlayBlobUrl) {
    URL.revokeObjectURL(currentOverlayBlobUrl);
  }
  currentOverlayBlobUrl = URL.createObjectURL(imageBlob);
  return currentOverlayBlobUrl;
}

export async function updateOverlayForTimestampAction(timestamp: string | null): Promise<void> {
  if (!timestamp) return;

  try {
    const overlayUrl = await fetchWeatherOverlayUrl(timestamp);
    uiStateModel.setActiveOverlayUrl(overlayUrl);
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
    logger.error('❌ Error fetching overlay (first attempt):', errMsg);

    try {
      logger.info('🔁 Retrying overlay fetch immediately for', timestamp);
      const overlayUrl = await fetchWeatherOverlayUrl(timestamp);
      uiStateModel.setActiveOverlayUrl(overlayUrl);
    } catch (retryErr: unknown) {
      const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
      logger.error('❌ Overlay retry failed:', retryMsg);
      throw new OverlayLoadError(retryMsg);
    }
  }
}

export async function loadWeatherDataForLocationAction(latlng: LatLng): Promise<void> {
  try {
    let forecast: ForecastItem[] | null = null;
    await loadingSpinnerController.track(async () => {
      forecast = await providerManager.fetchForecast(latlng);
    });

    weatherProviderModel.setPointData(latlng, Array.isArray(forecast) ? forecast : null);
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e);
    logger.error('🚨 Error processing location data:', errMsg);
    throw new LocationLoadError(errMsg);
  }
}

export async function syncAppWithServerAction(background = true, force = false, prevActiveTimestamp: string | null = null): Promise<void> {
  async function doSync() {
    let indexData: IndexData;
    try {
      indexData = await providerManager.fetchIndex();
    } catch (fetchErr: unknown) {
      const fetchErrMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      throw new IndexLoadError(fetchErrMsg);
    }

    weatherProviderModel.setLastIndexSync(new Date());

    if (indexData.api_version && indexData.api_version !== EXPECTED_API_VERSION) {
      throw new ApiMismatchError(indexData.api_version);
    }

    logger.info('📊 [SYNC NETWORK] Index loaded successfully:', {
      api_version: indexData?.api_version,
      generated_at: indexData?.generated_at,
      current_hour: indexData?.current_hour,
      timestamp_count: indexData?.available_timestamps?.length
    });

    logger.debug('🧠 [SYNC CHECK] Checking for new data:', {
      modelTimestamp: weatherProviderModel.modelGeneratedAt,
      serverTimestamp: indexData?.generated_at,
      willAbort: (weatherProviderModel.modelGeneratedAt === indexData?.generated_at && !!weatherProviderModel.modelGeneratedAt)
    });

    if (!force && weatherProviderModel.modelGeneratedAt === indexData.generated_at && weatherProviderModel.modelGeneratedAt) {
      logger.info('🛑 [SYNC ABORT] Sync silently canceled because generated times match.');
      return;
    }

    logger.info('🚀 [SYNC CONTINUE] Data is new! Continuing...');

    if (weatherProviderModel.lastClickedLatLng) {
      weatherProviderModel.setIndexMetadata(indexData, prevActiveTimestamp);
      await loadWeatherDataForLocationAction(weatherProviderModel.lastClickedLatLng);
    } else {
      weatherProviderModel.setIndexMetadata(indexData, prevActiveTimestamp);
    }

    await updateOverlayForTimestampAction(weatherProviderModel.activeTimestamp);
  }

  try {
    return await doSync();
  } catch (firstErr: unknown) {
    logger.error('❌ Sync error (first attempt):', firstErr);
    try {
      logger.info('🔁 Performing immediate retry for sync...');
      return await doSync();
    } catch (retryErr: unknown) {
      const errMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
      logger.error('❌ Sync error (retry failed):', errMsg);
      throw retryErr;
    }
  }
}
