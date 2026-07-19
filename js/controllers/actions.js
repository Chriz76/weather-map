// controllers/actions.js
import { BASE_URL, lonMin, latMin, GRID_CELL_SIZE, EXPECTED_API_VERSION } from '../config.js';
import { weatherModel } from '../models/weatherDomainModel.js';
import { weatherUi } from '../models/weatherUiModel.js';
import { weatherService } from '../services/weatherService.js';
import { loadingSpinnerController } from './loadingSpinnerController.js';

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
    const imageBlob = await weatherService.fetchWeatherImageBlob(timestamp, BASE_URL);
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
            throw new OverlayLoadError(retryMsg);
        }
    }
    weatherUi.setActiveOverlayUrl(overlayUrl);
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
            cluster = await weatherService.fetchCluster(latlng, { BASE_URL, lonMin, latMin, gridCellSize: GRID_CELL_SIZE });
        });
        weatherModel.setPointData(latlng, cluster);
    } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        console.error('🚨 Error processing location data:', errMsg);
        // Propagate error to controllers so they can decide how to present it to the user
        throw new LocationLoadError(errMsg);
    }
}


/**
 * PIPELINE STAGE C: Synchronisiert den globalen Anwendungsindex.
 * @returns {Promise<void>}
 */
export async function syncAppWithServerAction(background = true, force = false) {
    async function doSync() {
        // throw new Error("Sync is currently disabled for testing purposes.");
        let indexData;
        try {
            indexData = /** @type {{available_timestamps?: string[], generated_at?: string, current_hour?: string, api_version?: string}} */ (
                await weatherService.fetchIndex(BASE_URL)
            );
        } catch (fetchErr) {
            const fetchErrMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
            throw new IndexLoadError(fetchErrMsg);
        }

        weatherModel.setLastIndexSync(new Date());

        // API version mismatch: propagate to controller for UI decision
        if (indexData.api_version && indexData.api_version !== EXPECTED_API_VERSION) {
            throw new ApiMismatchError(indexData.api_version);
        }

       // Log 1: Was liefert der Server / Cache exakt zurück?
       console.log('📊 [SYNC NETZWERK] Index erfolgreich geladen:', {
           api_version: indexData?.api_version,
           generated_at: indexData?.generated_at,
           current_hour: indexData?.current_hour,
           timestamp_count: indexData?.available_timestamps?.length
        });

       // Log 2: Wie sieht der Zustand im Speicher direkt vor dem Vergleich aus?
       console.log('🧠 [SYNC VERGLEICH] Prüfe auf neue Daten:', {
           modellZeitstempel: weatherModel.modelGeneratedAt,
           serverZeitstempel: indexData?.generated_at,
           wirdAbgebrochen: (weatherModel.modelGeneratedAt === indexData?.generated_at && !!weatherModel.modelGeneratedAt)
        });

        if (!force && weatherModel.modelGeneratedAt === indexData.generated_at && weatherModel.modelGeneratedAt) {
           console.log('🛑 [SYNC ABBRUCH] Sync lautlos beendet, da generierte Zeiten identisch.');
           return;
        }

        console.log('🚀 [SYNC WEITER] Daten sind neu! Fahre fort...');

        if (weatherModel.lastClickedLatLng) {
            weatherModel.setIndexMetadata(indexData);
            await loadWeatherDataForLocationAction(weatherModel.lastClickedLatLng);
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
