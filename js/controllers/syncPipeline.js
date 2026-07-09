// controllers/syncPipeline.js
import { BASE_URL, lonMin, latMin, GRID_CELL_SIZE, EXPECTED_API_VERSION } from '../config.js';
import { weatherModel } from '../models/weatherModel.js';
import { weatherApi } from '../weatherApi.js';
import { notificationController } from './notificationController.js';
import { loadingManager } from './loadingManager.js';

/** @type {string|null} */
let currentOverlayBlobUrl = null;

/**
 * Lädt ein Bild-Blob vom Server und konvertiert es in eine lokale Objekt-URL.
 * @param {string|null} timestamp
 * @returns {Promise<string|null>}
 */
export async function fetchWeatherOverlayUrl(timestamp) {
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
export async function updateOverlayForTimestamp(timestamp) {
    if (!timestamp) return;
    /** @type {string|null} */
    let overlayUrl = `${BASE_URL}${timestamp}Z.webp`;
    try {
        overlayUrl = await fetchWeatherOverlayUrl(timestamp);
        } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        console.error('❌ Error fetching overlay:', errMsg);
        notificationController.showNotification({ message: "Error fetching weather overlay image: " + errMsg });
    }
    weatherModel.setActiveOverlayUrl(overlayUrl);
}

/**
 * PIPELINE STAGE B: Lädt die Cluster-Wetterdaten für eine Koordinate.
 * @param {{lat: number, lng: number}} latlng
 * @returns {Promise<void>}
 */
export async function loadWeatherDataForLocation(latlng) {
    try {
        let cluster = null;
        await loadingManager.track(async () => {
            cluster = await weatherApi.fetchCluster(latlng, { BASE_URL, lonMin, latMin, gridCellSize: GRID_CELL_SIZE });
        });
        weatherModel.setPointData(latlng, cluster);
    } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        console.error('🚨 Error processing location data:', errMsg);
        notificationController.showNotification({ message: "Error loading location data: " + errMsg });
    }
}

/**
 * PIPELINE STAGE C: Synchronisiert den globalen Anwendungsindex.
 * @returns {Promise<void>}
 */
export async function syncAppWithServer() {
    try {
        const indexData = /** @type {{available_timestamps?: string[], generated_at?: string, current_hour?: string, api_version?: string}} */ (
            await weatherApi.fetchIndex(BASE_URL)
        );

        weatherModel.setLastIndexSync(new Date());

        // API-Versionsprüfung
        if (indexData.api_version && indexData.api_version !== EXPECTED_API_VERSION) {
            notificationController.showNotification({
                message: `A new App version is available (v${indexData.api_version}).\n\nPlease reload the page to use the application as usual.`,
                isModal: true,
                action: {
                    text: "Reload App",
                    event: "controller:app-reload"
                }
            }, 0);
            return;
        }

        if (weatherModel.modelGeneratedAt === indexData.generated_at && weatherModel.modelGeneratedAt) {
            return;
        }

        if (weatherModel.lastClickedLatLng) {
            let clusterData = await weatherApi.fetchCluster(weatherModel.lastClickedLatLng, { BASE_URL, lonMin, latMin, gridCellSize: GRID_CELL_SIZE });
            weatherModel.setIndexMetadata(indexData);
            weatherModel.setPointData(weatherModel.lastClickedLatLng, clusterData);
        } else {
            weatherModel.setIndexMetadata(indexData);        }

        await updateOverlayForTimestamp(weatherModel.activeTimestamp);

    } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        console.error('❌ Sync error:', errMsg);
        notificationController.showNotification({ message: "Error during application synchronization: " + errMsg });
    }
}