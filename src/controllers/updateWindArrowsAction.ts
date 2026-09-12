import { commonDataModel } from '../models/commonDataModel';
import { windArrowService } from '../services/windArrowService';
import { logger } from '../utils/logger';
import type { Map as LeafletMap } from 'leaflet';

export async function updateWindArrowsAction(map: LeafletMap | null): Promise<void> {
  if (!map) return;

  try {
    const b = map.getBounds();
    const bounds = { west: b.getWest(), east: b.getEast(), south: b.getSouth(), north: b.getNorth() };
    const zoom = map.getZoom();

    const points = await windArrowService.loadWindArrowsForBounds(bounds, zoom);
    try { commonDataModel.setWindArrows(points); } catch (e) { /* ignore */ }
  } catch (err) {
    logger.error('Error updating wind arrows:', err);
    try { commonDataModel.setWindArrows([]); } catch (e) { /* ignore */ }
  }
}

export default updateWindArrowsAction;
