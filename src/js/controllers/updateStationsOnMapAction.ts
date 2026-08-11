import { commonDataModel } from '../models/commonDataModel';
import { uiStateModel } from '../models/uiStateModel';
import { fetchWindDataForStation } from '../services/measurementsService';
import { logger } from '../utils/logger';
import type { Station } from '../../types';

export async function updateStationsOnMapAction(bounds: any = null): Promise<void> {
  if (!uiStateModel.showWindMeasurements) {
    logger.debug('Station data not loaded: wind measurements are currently hidden.');
    return;
  }

  let allStations: Station[] = Array.isArray(commonDataModel.allStations) ? commonDataModel.allStations : [];

  if ((!allStations || allStations.length === 0) && bounds) {
    try {
      const resp = await fetch('/assets/stations.json');
      allStations = await resp.json();
      commonDataModel.setAllStations(allStations);
      logger.info('📍 Station data loaded (fallback):', allStations.length);
    } catch (e: any) {
      logger.error('Error loading stations.json (fallback):', e);
    }
  }

  let topStations: Station[] = [];

  if (bounds && typeof bounds.contains === 'function' && typeof bounds.getCenter === 'function') {
    const stationsInView = allStations.filter((station) => {
      const lat = Number(station?.lat);
      const lon = Number(station?.lon);

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return false;
      }

      try {
        // Use Leaflet global L in runtime
        return (bounds as any).contains((window as any).L.latLng(lat, lon));
      } catch (error) {
        logger.warn('Skipping station with invalid map bounds payload:', station?.id, error);
        return false;
      }
    });

    const center = bounds.getCenter();
    if (center && typeof center.distanceTo === 'function') {
      stationsInView.sort((a, b) => {
        const pr = (a.priority || 0) - (b.priority || 0);
        if (pr !== 0) return pr;

        const da = center.distanceTo((window as any).L.latLng(Number(a.lat), Number(a.lon)));
        const db = center.distanceTo((window as any).L.latLng(Number(b.lat), Number(b.lon)));
        return da - db;
      });
    }

    topStations = stationsInView.slice(0, 8);
  } else {
    const visible = Array.isArray(commonDataModel.visibleStations) ? commonDataModel.visibleStations : [];
    if (visible && visible.length) {
      topStations = visible.slice();
    } else {
      topStations = [];
    }
  }

  const fetched: Record<string, any> = {};
  const fetchPromises = topStations.map(async (station) => {
    try {
      const data = await fetchWindDataForStation((station as any).id);
      if (data) fetched[(station as any).id] = data;
    } catch (err) {
      logger.error('Error fetching wind for station', (station as any).id, err);
    }
  });

  await Promise.all(fetchPromises);

  const stationsWithFinalData = topStations.map((station) => ({
    ...station,
    windData: fetched[(station as any).id] || null
  }));

  commonDataModel.setVisibleStations(stationsWithFinalData);
}
