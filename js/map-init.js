import { imageBounds } from './config.js';

export let map = null;
export let windOverlay = null;

export function initMap() {
  if (map) return { map, windOverlay };

  map = L.map('map', {
    closePopupOnClick: false,
    zoomControl: false
  }).setView([48.3528, 10.9043], 8);

  // Add zoom controls manually at top-right
  L.control.zoom({ position: 'topright' }).addTo(map);

  // Background & label layers (stack)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
    maxZoom: 20, zIndex: 1, tileSize: 512, zoomOffset: -1, className: 'v', detectRetina: true
  }).addTo(map);

  windOverlay = L.imageOverlay('', imageBounds, { opacity: 0.65, zIndex: 10 }).addTo(map);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
    maxZoom: 20, zIndex: 20, tileSize: 512, zoomOffset: -1, pane: 'shadowPane', detectRetina: true
  }).addTo(map);

  return { map, windOverlay };
}
