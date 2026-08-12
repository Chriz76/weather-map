// controllers/mapController.js
import { weatherProviderModel } from '../models/weatherProviderModel.js';
import { uiStateModel } from '../models/uiStateModel.js';
import { storage } from '../utils/storage.js';
import { formatMinutesAgo } from '../utils/time.js';
import { formatStationToast } from '../utils/stationToastFormatter.js';
import { toastController } from './toastController.js';
import { loadWeatherDataForLocationAction } from './actions.js';
import { stationView } from '../views/stationView.js';
import { updateStationsOnMapAction } from './updateStationsOnMapAction.js';
import { updateSpecialDataOnMapAction } from './updateSpecialDataOnMapAction.js';
import { logger } from '../utils/logger.js';

let stationViewHandle = null;
// stationView handles rendering; update action manages station data & cache

// `formatStationToast` moved to `js/utils/stationToastFormatter.js`

export async function initMapController(map) {
    /** @type {number | null} */
    let lastClusterClickToken = null;

    uiStateModel.setShowWindMeasurements(storage.getWindMeasurements(uiStateModel.showWindMeasurements));

    // Initial trigger: action lädt Stationsdaten intern
    try {
        await updateStationsOnMapAction(map.getBounds());
    } catch (e) {
        logger.error('Error during initial stations update:', e);
    }

    try {
        await updateSpecialDataOnMapAction(map);
    } catch (e) {
        logger.error('Error during initial special data update:', e);
    }

    // Move update logic to action: see controllers/updateStationsOnMapAction.js

    async function triggerLoadAtLatLng(latlng) {
        const currentClickToken = Date.now();
        lastClusterClickToken = currentClickToken;

        try {
            await loadWeatherDataForLocationAction(latlng);
        } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            toastController.showToast({ message: 'Error loading location data: ' + errMsg }, 5000);
        }

        if (lastClusterClickToken !== currentClickToken) return;
    }

    async function handleMapClick(e) {
        await triggerLoadAtLatLng(e.latlng);
    }

    async function handleLocationFound(e) {
        const currentClickToken = Date.now();
        lastClusterClickToken = currentClickToken;

        map.setView(e.latlng, 10, { animate: true });

        try {
            await triggerLoadAtLatLng(e.latlng);
        } finally {
            uiStateModel.setIsLocating(false);
        }
    }

    function handleLocationError(e) {
        toastController.showToast({ message: 'Error processing GPS location: ' + e.message }, 5000);
        uiStateModel.setIsLocating(false);
    }

    function handlePopupClose() {
        lastClusterClickToken = null;
        weatherProviderModel.removePointData();
    }

    async function handleMoveEnd() {
        // --- NEU: Bei jeder Kartenbewegung (Verschieben/Zoomen) den Filter ausführen ---
        try {
            await updateStationsOnMapAction(map.getBounds());
        } catch (e) {
            logger.error('Error updating stations on moveend:', e);
        }

        try {
            await updateSpecialDataOnMapAction(map);
        } catch (e) {
            logger.error('Error updating special data on moveend:', e);
        }

        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('lat') && urlParams.has('lon')) return;

        const center = map.getCenter();
        storage.saveMapState({
            lat: center.lat,
            lng: center.lng,
            zoom: map.getZoom()
        });
    }

    map.on('click', handleMapClick);
    map.on('locationfound', handleLocationFound);
    map.on('locationerror', handleLocationError);
    map.on('popupclose', handlePopupClose);
    map.on('moveend', handleMoveEnd);

    uiStateModel.addEventListener('ui:wind-measurements-visibility-changed', async () => {
        storage.saveWindMeasurements(uiStateModel.showWindMeasurements);

        if (uiStateModel.showWindMeasurements) {
            try {
                await updateStationsOnMapAction(map.getBounds());
            } catch (e) {
                logger.error('Error updating stations after visibility change:', e);
            }

            try {
                await updateSpecialDataOnMapAction(map);
            } catch (e) {
                logger.error('Error updating special data after visibility change:', e);
            }            
        }
    });

    // Init station view (it listens to model events)
    stationViewHandle = stationView.init(map, {
        onMarkerClick: async (station) => {
            toastController.showToast({ message: formatStationToast(station) }, 5000);
        }
    });

    // Initialisierung starten: Action lädt intern
}
