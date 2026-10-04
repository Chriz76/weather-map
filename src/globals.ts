import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Ensure bundled marker icons are available after build (Vite/Rollup handle assets).
// The `*.png` imports are already typed as `string` via src/types/images.d.ts.
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow
});

// Expose the imported Leaflet instance as a global `L` only if not already present.
// `window.L` is typed by the global augmentation in src/types/leaflet-extensions.d.ts.
if (typeof window !== 'undefined' && !window.L) {
  window.L = L;
}
