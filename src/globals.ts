export {};

import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

declare global {
  interface Window {
    L?: typeof import('leaflet');
  }
}

// Ensure bundled marker icons are available after build (Vite/Rollup handle assets)
L.Icon.Default.mergeOptions({
  iconRetinaUrl: (markerIcon2x as unknown) as string,
  iconUrl: (markerIcon as unknown) as string,
  shadowUrl: (markerShadow as unknown) as string
});

// Expose the imported Leaflet instance as a global `L` only if not already present.
if (typeof window !== 'undefined') {
  const w = window as unknown as { L?: typeof L };
  if (!w.L) w.L = L;
}
