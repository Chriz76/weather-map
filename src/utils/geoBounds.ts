import * as L from 'leaflet';
import type { LatLngBoundsExpression } from 'leaflet';

/**
 * Model area helpers shared by the map bootstrap and the provider switch.
 *
 * Import as a namespace so call sites stay explicit, e.g. `geoBounds.isWithinBounds(...)`.
 */

/**
 * Tells whether a point lies inside a provider's model area.
 *
 * The areas do not overlap (Europe vs. CONUS), so a view left in the previous provider's area
 * would show an empty map after a switch.
 * @param bounds `imageBounds` of the provider.
 * @param point Map centre or any other position.
 */
export function isWithinBounds(bounds: LatLngBoundsExpression, point: { lat: number; lng: number }): boolean {
  const box = Array.isArray(bounds) ? L.latLngBounds(bounds) : bounds;
  return box.contains(point);
}
