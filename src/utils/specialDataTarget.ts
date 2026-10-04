import * as L from 'leaflet';
import type { Map as LeafletMap } from 'leaflet';

/** Köchelt der Kochel — position the special-data badge points at. */
export const SPECIAL_DATA_TARGET = { lat: 47.6506, lng: 11.3365 } as const;

/** Zoom level from which the badge target is considered relevant. */
export const SPECIAL_DATA_MIN_ZOOM = 7;

/**
 * True when the map is zoomed in far enough and the badge target lies inside the viewport.
 * Single source of truth for the visibility rule shared by the view and the controller.
 * @param map Leaflet map instance.
 */
export function isSpecialDataTargetVisible(map: LeafletMap): boolean {
  if (map.getZoom() < SPECIAL_DATA_MIN_ZOOM) return false;
  return map.getBounds().contains(L.latLng(SPECIAL_DATA_TARGET.lat, SPECIAL_DATA_TARGET.lng));
}
