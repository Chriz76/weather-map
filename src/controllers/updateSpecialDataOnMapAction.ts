import { commonDataModel } from '../models/commonDataModel';
import { fetchSpecialData, selectForecastEntries, buildSpecialDataSummary } from '../services/specialDataService';
import { logger } from '../utils/logger';

const SPECIAL_DATA_TARGET_LAT = 47.6506;
const SPECIAL_DATA_TARGET_LNG = 11.3365;
const SPECIAL_DATA_MIN_ZOOM = 7;

function getReferenceDay(): string {
  const today = new Date();
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const yyyy = day.getFullYear();
  const mm = String(day.getMonth() + 1).padStart(2, '0');
  const dd = String(day.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function shouldShowSpecialData(map: any): boolean {
  if (!map || typeof map.getZoom !== 'function' || typeof map.getBounds !== 'function') return false;
  if (map.getZoom() < SPECIAL_DATA_MIN_ZOOM) return false;
  const bounds = map.getBounds();
  if (!bounds || typeof bounds.contains !== 'function') return false;
  try {
    return bounds.contains((window as any).L.latLng(SPECIAL_DATA_TARGET_LAT, SPECIAL_DATA_TARGET_LNG));
  } catch (e) {
    return false;
  }
}

export async function updateSpecialDataOnMapAction(map: any = null): Promise<void> {
  if (!shouldShowSpecialData(map)) return;

  try {
    const entries = await fetchSpecialData();
    const selection = selectForecastEntries(entries, getReferenceDay());
    const summary = buildSpecialDataSummary(selection);
    commonDataModel.setSpecialDataSummary(summary);
  } catch (error: any) {
    logger.error('Error refreshing special data badge:', error);
    commonDataModel.setSpecialDataSummary(null);
  }
}
