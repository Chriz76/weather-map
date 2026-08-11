// controllers/actions.js
import { EXPECTED_API_VERSION } from '../config.ts';
import { weatherProviderModel } from '../models/weatherProviderModel.js';
import { uiStateModel } from '../models/uiStateModel.js';
import { providerManager } from '../weatherProvider/providerManager.js';
import { loadingSpinnerController } from './loadingSpinnerController.js';
import { logger } from '../utils/logger';

export class ApiMismatchError extends Error {
    constructor(version) {
        super(`API_VERSION_MISMATCH:${version}`);
        this.name = 'ApiMismatchError';
        this.version = version;
    }
}

export class IndexLoadError extends Error {
    constructor(message) {
        super(`INDEX_LOAD_FAILED: ${message}`);
        this.name = 'IndexLoadError';
        this.detail = message;
    }
}

export class LocationLoadError extends Error {
    constructor(message) {
        super(`LOAD_LOCATION_FAILED: ${message}`);
        this.name = 'LocationLoadError';
        this.detail = message;
    }
}

export class OverlayLoadError extends Error {
    constructor(message) {
        super(`OVERLAY_FETCH_FAILED: ${message}`);
        this.name = 'OverlayLoadError';
        this.detail = message;
    }
}

/** @type {string|null} */
let currentOverlayBlobUrl = null;

/**
 * Lädt ein Bild-Blob vom Server und konvertiert es in eine lokale Objekt-URL.
 * @param {string|null} timestamp
 * @returns {Promise<string|null>}
 */
async function fetchWeatherOverlayUrl(timestamp) {
    if (!timestamp) return null;
    const imageBlob = await providerManager.fetchWeatherImageBlob(timestamp);
    if (currentOverlayBlobUrl) {
        URL.revokeObjectURL(currentOverlayBlobUrl);
    }
    currentOverlayBlobUrl = URL.createObjectURL(imageBlob);
    return currentOverlayBlobUrl;
}

/**
 * PIPELINE STAGE A: Lädt ein bestimmtes Karten-Overlay und weist es dem Modell zu.
 * @param {string|null} timestamp
 * @returns {Promise<void>}
 */
export async function updateOverlayForTimestampAction(timestamp) {
    if (!timestamp) return;
    /** @type {string|null} */
    try {
        let overlayUrl = await fetchWeatherOverlayUrl(timestamp);
        uiStateModel.setActiveOverlayUrl(overlayUrl);
    } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        logger.error('❌ Error fetching overlay (first attempt):', errMsg);

        // Immediate, single retry
        try {
            logger.info('🔁 Retrying overlay fetch immediately for', timestamp);
            let overlayUrl = await fetchWeatherOverlayUrl(timestamp);
            uiStateModel.setActiveOverlayUrl(overlayUrl);
        } catch (retryErr) {
            const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
            logger.error('❌ Overlay retry failed:', retryMsg);
            // Both attempts failed — propagate error to caller so controllers can decide how to show/handle it
            throw new OverlayLoadError(retryMsg);
        }
    }
    
}


/**
 * PIPELINE STAGE B: Lädt die Cluster-Wetterdaten für eine Koordinate.
 * @param {{lat: number, lng: number}} latlng
 * @returns {Promise<void>}
 */
export async function loadWeatherDataForLocationAction(latlng) {
    try {
        let forecast = null;
        await loadingSpinnerController.track(async () => {
            forecast = await providerManager.fetchForecast(latlng);
        });

        weatherProviderModel.setPointData(latlng, Array.isArray(forecast) ? forecast : null);
    } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        logger.error('🚨 Error processing location data:', errMsg);
        // Propagate error to controllers so they can decide how to present it to the user
        throw new LocationLoadError(errMsg);
    }
}


/**
 * PIPELINE STAGE C: Synchronisiert den globalen Anwendungsindex.
 * @returns {Promise<void>}
 */
export async function syncAppWithServerAction(background = true, force = false, prevActiveTimestamp = null) {
    async function doSync() {
        // throw new Error("Sync is currently disabled for testing purposes.");
        let indexData;
        try {
            indexData = /** @type {{available_timestamps?: string[], generated_at?: string, current_hour?: string, api_version?: string}} */ (
                await providerManager.fetchIndex()
            );
        } catch (fetchErr) {
            const fetchErrMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
            throw new IndexLoadError(fetchErrMsg);
        }

        weatherProviderModel.setLastIndexSync(new Date());

        // API version mismatch: propagate to controller for UI decision
        if (indexData.api_version && indexData.api_version !== EXPECTED_API_VERSION) {
            throw new ApiMismatchError(indexData.api_version);
        }

       // Log 1: What exactly does the server/cache return?
       logger.info('📊 [SYNC NETWORK] Index loaded successfully:', {
           api_version: indexData?.api_version,
           generated_at: indexData?.generated_at,
           current_hour: indexData?.current_hour,
           timestamp_count: indexData?.available_timestamps?.length
        });

       // Log 2: Inspect cache state immediately before comparison.
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
    } catch (firstErr) {
        logger.error('❌ Sync error (first attempt):', firstErr);
        // einmaliger sofortiger Retry
        try {
            logger.info('🔁 Performing immediate retry for sync...');
            return await doSync();
        } catch (retryErr) {
            const errMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
            logger.error('❌ Sync error (retry failed):', errMsg);
            // Propagate retry error to caller; controllers decide how/if to retry
            throw retryErr;
        }
    }
}
