import * as Leaflet from 'leaflet';

// Provide a single, typed entry-point for Leaflet usage across the app.
// This will prefer any Leaflet instance already attached to window (e.g., bundled by script)
// but fall back to the imported module for build-time usage.

export type LeafletType = typeof Leaflet;

const L: LeafletType = (typeof window !== 'undefined' && (window as any).L)
  ? ((window as any).L as LeafletType)
  : Leaflet;

export default L;

export function getL(): LeafletType {
  return L;
}

export const latLng = (...args: any[]) => (L.latLng as unknown as (...a: any[]) => any)(...args);
export const control = (L.control as unknown) as any;