import { commonDataModel } from '../models/commonDataModel';
import { uiStateModel } from '../models/uiStateModel';
import { fetchWindDataForStation } from '../services/measurementsService';
import { logger } from '../utils/logger';
import { getStationKey } from '../utils/stationKey';
import type { Station } from '../types';
import type { LatLngBounds } from 'leaflet';

export async function updateStationsOnMapAction(bounds: LatLngBounds | null = null): Promise<void> {
  if (!uiStateModel.showWindMeasurements) {
    logger.debug('Station data not loaded: wind measurements are currently hidden.');
    return;
  }

  let allStations: Station[] = Array.isArray(commonDataModel.allStations) ? commonDataModel.allStations : [];

  if ((!allStations || allStations.length === 0) && bounds) {
    try {
      const resp = await fetch('assets/stations.json');
      allStations = await resp.json();
      commonDataModel.setAllStations(allStations);
      logger.info('📍 Station data loaded (fallback):', allStations.length);
    } catch (e: unknown) {
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
        return bounds.contains(window.L!.latLng(lat, lon));
      } catch (error) {
        logger.warn('Skipping station with invalid map bounds payload:', (station as unknown as Record<string, unknown>)['id'], error);
        return false;
      }
    });

    const center = bounds.getCenter();
    if (center && typeof center.distanceTo === 'function') {
      stationsInView.sort((a, b) => {
        const apr = Number((a as Record<string, unknown>)['priority'] ?? 0);
        const bpr = Number((b as Record<string, unknown>)['priority'] ?? 0);
        const pr = apr - bpr;
        if (pr !== 0) return pr;

        const da = center.distanceTo(window.L!.latLng(Number(a.lat), Number(a.lon)));
        const db = center.distanceTo(window.L!.latLng(Number(b.lat), Number(b.lon)));
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

    const fetched: Record<string, import('../types').WindData | null> = {};
    const fetchPromises = topStations.map(async (station) => {
      try {
        const stationIdRaw = (station as unknown as Record<string, unknown>)['id'] ?? (station as unknown as Record<string, unknown>)['station_id'];
        const stationId = stationIdRaw ? String(stationIdRaw) : undefined;
        const stationKey = getStationKey(station);
        if (stationId) {
          const data = await fetchWindDataForStation(stationId);
          if (data) fetched[stationKey] = data;
        }
      } catch (err: unknown) {
        logger.error('Error fetching wind for station', (station as unknown as Record<string, unknown>)['id'], err);
      }
    });

  await Promise.all(fetchPromises);

  const stationsWithFinalData = topStations.map((station) => {
    const stationKey = getStationKey(station);
    return {
      ...station,
      windData: fetched[stationKey] || null
    };
  });

  commonDataModel.setVisibleStations(stationsWithFinalData);
}
