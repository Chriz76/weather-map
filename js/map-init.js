import { imageBounds } from './config.js';

// Interne Modul-Variablen (von auﬂen nicht direkt manipulierbar)
let mapInstance = null;
let windOverlayInstance = null;

export function initMap() {
    if (mapInstance) return { map: mapInstance, windOverlay: windOverlayInstance };

    mapInstance = L.map('map', {
        closePopupOnClick: false,
        zoomControl: false
    }).setView([48.3528, 10.9043], 8);

    // Add zoom controls manually at top-right
    L.control.zoom({ position: 'topright' }).addTo(mapInstance);

    // Background base layer
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
        maxZoom: 20,
        zIndex: 1,
        tileSize: 512,
        zoomOffset: -1,
        className: 'map-redesign', // Behalten, falls im CSS gestyled!
        detectRetina: true
    }).addTo(mapInstance);

    // Weather graphic overlay in the middle
    windOverlayInstance = L.imageOverlay('', imageBounds, {
        opacity: 0.65,
        zIndex: 10
    }).addTo(mapInstance);

    // Labels layer on top of everything
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
        maxZoom: 20,
        zIndex: 20,
        tileSize: 512,
        zoomOffset: -1,
        pane: 'shadowPane',
        detectRetina: true
    }).addTo(mapInstance);

    return { map: mapInstance, windOverlay: windOverlayInstance };
}