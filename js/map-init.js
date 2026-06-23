// --- src/map-init.js ---
import { imageBounds } from './config.js';
import { storage } from './utils/storage.js';

// Internal module variables (not directly manipulable from outside)
let mapInstance = null;
let windOverlayInstance = null;

/**
 * Initializes the Leaflet map once and returns singleton instances.
 * @returns {{map: L.Map, windOverlay: L.ImageOverlay}} Map and weather overlay references.
 */
export function initMap() {
    if (mapInstance) return { map: mapInstance, windOverlay: windOverlayInstance };

    // 1. Get last state from storage.
    // If empty/missing, falls back directly to the provided default object (Augsburg).
    const savedState = storage.getMapState({ 
        lat: 48.3528, 
        lng: 10.9043, 
        zoom: 8 
    });

    // 2. Initialize map with determined values
    mapInstance = L.map('map', {
        closePopupOnClick: false,
        zoomControl: false
    }).setView([savedState.lat, savedState.lng], savedState.zoom);

    // Add zoom controls manually at top-right
    L.control.zoom({ position: 'topright' }).addTo(mapInstance);

    // Background base layer
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
        maxZoom: 20,
        zIndex: 1,
        tileSize: 512,
        zoomOffset: -1,
        className: 'map-redesign',
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