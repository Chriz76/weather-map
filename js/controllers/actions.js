// controllers/actions.js
import { BASE_URL, lonMin, latMin, GRID_CELL_SIZE, EXPECTED_API_VERSION } from '../config.js';
import { weatherModel } from '../models/weatherModel.js';
import { weatherApi } from '../weatherApi.js';
import { loadingSpinnerController } from './loadingSpinnerController.js';

export class ApiMismatchError extends Error {
    constructor(version) {
        super(`API_VERSION_MISMATCH:${version}`);
        this.name = 'ApiMismatchError';
        this.version = version;
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
    const imageBlob = await weatherApi.fetchWeatherImageBlob(timestamp, BASE_URL);
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
    let overlayUrl = `${BASE_URL}${timestamp}Z.webp`;
    try {
        overlayUrl = await fetchWeatherOverlayUrl(timestamp);
    } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        console.error('❌ Error fetching overlay (first attempt):', errMsg);

        // Immediate, single retry
        try {
            console.log('🔁 Retrying overlay fetch immediately for', timestamp);
            overlayUrl = await fetchWeatherOverlayUrl(timestamp);
        } catch (retryErr) {
            const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
            console.error('❌ Overlay retry failed:', retryMsg);
            // Both attempts failed — propagate error to caller so controllers can decide how to show/handle it
            throw new Error('OVERLAY_FETCH_FAILED: ' + retryMsg);
        }
    }
    weatherModel.setActiveOverlayUrl(overlayUrl);
}


/**
 * PIPELINE STAGE B: Lädt die Cluster-Wetterdaten für eine Koordinate.
 * @param {{lat: number, lng: number}} latlng
 * @returns {Promise<void>}
 */
export async function loadWeatherDataForLocationAction(latlng) {
    try {
        let cluster = null;
        await loadingSpinnerController.track(async () => {
            cluster = await weatherApi.fetchCluster(latlng, { BASE_URL, lonMin, latMin, gridCellSize: GRID_CELL_SIZE });
        });
        weatherModel.setPointData(latlng, cluster);
    } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        console.error('🚨 Error processing location data:', errMsg);
        // Propagate error to controllers so they can decide how to present it to the user
        throw new Error('LOAD_LOCATION_FAILED: ' + errMsg);
    }
}


/**
 * PIPELINE STAGE C: Synchronisiert den globalen Anwendungsindex.
 * @returns {Promise<void>}
 */
export async function syncAppWithServerAction(background = true) {
    async function doSync() {
        // throw new Error("Sync is currently disabled for testing purposes.");
        const indexData = /** @type {{available_timestamps?: string[], generated_at?: string, current_hour?: string, api_version?: string}} */ (
            await weatherApi.fetchIndex(BASE_URL)
        );

        weatherModel.setLastIndexSync(new Date());

        // API version mismatch: propagate to controller for UI decision
        if (indexData.api_version && indexData.api_version !== EXPECTED_API_VERSION) {
            throw new ApiMismatchError(indexData.api_version);
        }

        if (weatherModel.modelGeneratedAt === indexData.generated_at && weatherModel.modelGeneratedAt) {
            return;
        }

        if (weatherModel.lastClickedLatLng) {
            let clusterData = await weatherApi.fetchCluster(weatherModel.lastClickedLatLng, { BASE_URL, lonMin, latMin, gridCellSize: GRID_CELL_SIZE });
            weatherModel.setIndexMetadata(indexData);
            weatherModel.setPointData(weatherModel.lastClickedLatLng, clusterData);
        } else {
            weatherModel.setIndexMetadata(indexData);
        }

        await updateOverlayForTimestampAction(weatherModel.activeTimestamp);
    }

    try {
        return await doSync();
    } catch (firstErr) {
        console.error('❌ Sync error (first attempt):', firstErr);
        // einmaliger sofortiger Retry
        try {
            console.log('🔁 Performing immediate retry for sync...');
            return await doSync();
        } catch (retryErr) {
            const errMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
            console.error('❌ Sync error (retry failed):', errMsg);
            // Propagate retry error to caller; controllers decide how/if to retry
            throw retryErr;
        }
    }
}
