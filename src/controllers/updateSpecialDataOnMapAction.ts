import { commonDataModel } from '../models/commonDataModel';
import { fetchSpecialData, selectForecastEntries, buildSpecialDataSummary } from '../services/specialDataService';
import { logger } from '../utils/logger';
import { isSpecialDataTargetVisible } from '../utils/specialDataTarget';
import type { Map as LeafletMap } from 'leaflet';

function getReferenceDay(): string {
  const today = new Date();
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const yyyy = day.getFullYear();
  const mm = String(day.getMonth() + 1).padStart(2, '0');
  const dd = String(day.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export async function updateSpecialDataOnMapAction(map: LeafletMap | null = null): Promise<void> {
  // The badge is only relevant when the target village (Köchelt) is inside the current viewport.
  if (!map || !isSpecialDataTargetVisible(map)) return;

  try {
    const entries = await fetchSpecialData();
    const selection = selectForecastEntries(entries, getReferenceDay());
    const summary = buildSpecialDataSummary(selection);
    commonDataModel.setSpecialDataSummary(summary);
  } catch (error: unknown) {
    logger.error('Error refreshing special data badge:', error);
    commonDataModel.setSpecialDataSummary(null);
  }
}
