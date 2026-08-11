import { weatherProviderModel } from '../models/weatherProviderModel';
import { uiStateModel } from '../models/uiStateModel';
import { storage } from '../utils/storage';
import { formatMinutesAgo } from '../utils/time';
import { formatStationToast } from '../utils/stationToastFormatter';
import { toastController } from './toastController';
import { loadWeatherDataForLocationAction } from './actions';
import { stationView } from '../views/stationView';
import { updateStationsOnMapAction } from './updateStationsOnMapAction';
import { updateSpecialDataOnMapAction } from './updateSpecialDataOnMapAction';
import { logger } from '../utils/logger';

let stationViewHandle: any = null;

export async function initMapController(map: any): Promise<void> {
  let lastClusterClickToken: number | null = null;

  uiStateModel.setShowWindMeasurements(storage.getWindMeasurements(uiStateModel.showWindMeasurements));

  try {
    await updateStationsOnMapAction(map.getBounds());
  } catch (e: any) {
    logger.error('Error during initial stations update:', e);
  }

  try {
    await updateSpecialDataOnMapAction(map);
  } catch (e: any) {
    logger.error('Error during initial special data update:', e);
  }

  async function triggerLoadAtLatLng(latlng: any) {
    const currentClickToken = Date.now();
    lastClusterClickToken = currentClickToken;

    try {
      await loadWeatherDataForLocationAction(latlng);
    } catch (error: any) {
      const errMsg = error instanceof Error ? error.message : String(error);
      toastController.showToast({ message: 'Error loading location data: ' + errMsg }, 5000);
    }

    if (lastClusterClickToken !== currentClickToken) return;
  }

  async function handleMapClick(e: any) {
    await triggerLoadAtLatLng(e.latlng);
  }

  async function handleLocationFound(e: any) {
    const currentClickToken = Date.now();
    lastClusterClickToken = currentClickToken;

    map.setView(e.latlng, 10, { animate: true });

    try {
      await triggerLoadAtLatLng(e.latlng);
    } finally {
      uiStateModel.setIsLocating(false);
    }
  }

  function handleLocationError(e: any) {
    toastController.showToast({ message: 'Error processing GPS location: ' + e.message }, 5000);
    uiStateModel.setIsLocating(false);
  }

  function handlePopupClose() {
    lastClusterClickToken = null;
    weatherProviderModel.removePointData();
  }

  async function handleMoveEnd() {
    try {
      await updateStationsOnMapAction(map.getBounds());
    } catch (e: any) {
      logger.error('Error updating stations on moveend:', e);
    }

    try {
      await updateSpecialDataOnMapAction(map);
    } catch (e: any) {
      logger.error('Error updating special data on moveend:', e);
    }

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('lat') && urlParams.has('lon')) return;

    const center = map.getCenter();
    storage.saveMapState({
      lat: center.lat,
      lng: center.lng,
      zoom: map.getZoom(),
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
      } catch (e: any) {
        logger.error('Error updating stations after visibility change:', e);
      }

      try {
        await updateSpecialDataOnMapAction(map);
      } catch (e: any) {
        logger.error('Error updating special data after visibility change:', e);
      }
    }
  });

  stationViewHandle = stationView.init(map, {
    onMarkerClick: async (station: any) => {
      toastController.showToast({ message: formatStationToast(station) }, 5000);
    },
  });
}
