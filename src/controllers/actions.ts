import { EXPECTED_API_VERSION } from '../config';
import { weatherProviderModel } from '../models/weatherProviderModel';
import { uiStateModel } from '../models/uiStateModel';
import { weatherService } from '../services/weatherService';
import { loadingSpinnerController } from './loadingSpinnerController';
import { toastController } from './toastController';
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
  const imageBlob = await weatherService.fetchWeatherImageBlob(timestamp);
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
      forecast = await weatherService.fetchForecast(latlng);
    });

    weatherProviderModel.setPointData(latlng, Array.isArray(forecast) ? forecast : null);
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e);
    logger.error('🚨 Error processing location data:', errMsg);
    throw new LocationLoadError(errMsg);
  }
}

/**
 * Retries an async operation up to `attempts` times.
 * Used per network step so that a retry does not re-execute unrelated work.
 * @param label Human-readable step name for logging.
 * @param fn Operation to execute.
 * @param attempts Maximum number of attempts (default: 2).
 */
async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      if (attempt < attempts) {
        logger.warn(`🔁 ${label} failed (attempt ${attempt}/${attempts}), retrying...`);
      }
    }
  }
  throw lastError;
}

export async function syncAppWithServerAction(background = true, force = false, prevActiveTimestamp: string | null = null): Promise<void> {
  // Only the index fetch is retried as a step, so a retry does not re-run the
  // point load or the overlay fetch, nor emit the model metadata events twice.
  let indexData: IndexData;
  try {
    indexData = await withRetry('index fetch', () => weatherService.fetchIndex());
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

  const latLng = weatherProviderModel.lastClickedLatLng;
  weatherProviderModel.setIndexMetadata(indexData, prevActiveTimestamp);

  // A failed point load is not fatal: after the retries are exhausted the
  // selection is dropped and the sync continues so the overlay of the active
  // provider is still refreshed. Otherwise a stale overlay of the previous
  // provider would remain visible after a provider switch.
  if (latLng) {
    try {
      await withRetry('point load', () => loadWeatherDataForLocationAction(latLng));
    } catch (locErr: unknown) {
      // Only drop the selection when the user did not click another point meanwhile.
      if (weatherProviderModel.lastClickedLatLng === latLng) {
        logger.warn('Selected point could not be loaded; dropping the selection.', locErr);
        weatherProviderModel.removePointData();
        toastController.showToast({ message: 'Selected location could not be loaded or is outside the model area.' }, 5000);
      }
    }
  }

  await updateOverlayForTimestampAction(weatherProviderModel.activeTimestamp);
}
