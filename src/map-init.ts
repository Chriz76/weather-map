/* global L */
// --- src/map-init.js ---
import { providers } from './config.ts';
import { weatherProviderModel } from './models/weatherProviderModel';
import { storage } from './utils/storage';
import { D2 } from './weatherProvider/providerIds';
import type * as Leaflet from 'leaflet';
import * as L from 'leaflet';

// Internal module variables (typed)
let mapInstance: Leaflet.Map | null = null;
let windOverlayInstance: Leaflet.ImageOverlay | null = null;

/**
 * Initializes the Leaflet map once and returns singleton instances.
 * @returns {{map: import('leaflet').Map | null, windOverlay: import('leaflet').ImageOverlay | null}} Map and weather overlay references.
 */
export function initMap(): { map: Leaflet.Map | null; windOverlay: Leaflet.ImageOverlay | null } {
    if (mapInstance) return { map: mapInstance, windOverlay: windOverlayInstance };

    // 1. Get last state from storage.
    // If empty/missing, falls back directly to the provided default object (Augsburg).
    const savedState = storage.getMapState({ 
        lat: 48.3528, 
        lng: 10.9043, 
        zoom: 8 
    });

    // 2. Ensure the map container exists and has height. If height is 0 (CSS not yet applied), apply a temporary fallback.
    const mapContainer = document.getElementById('map');
    if (!mapContainer) {
        throw new Error('Map container element with id "map" not found.');
    }
    // If the container currently has no height, apply a temporary inline height so Leaflet can initialize.
    if (mapContainer.offsetHeight === 0) {
        // Temporary fallback to make the map visible during dev until CSS/layout is settled.
        mapContainer.style.height = '500px';
    }

    const worldBounds: Leaflet.LatLngBoundsExpression = [
        [-85.05112878, -180],
        [85.05112878, 180],
    ];

    mapInstance = L.map('map', {
        closePopupOnClick: false,
        zoomControl: false,
        maxBounds: worldBounds,
        maxBoundsViscosity: 1.0,
    }).setView([savedState.lat, savedState.lng], savedState.zoom);

    mapInstance.attributionControl.setPrefix(false);

    // Add zoom controls manually at top-right
    L.control.zoom({ position: 'topright' }).addTo(mapInstance);

    const CARTO_API_KEY = 'cb1_28i5_1_ccfb2588484de9213cc3f36f';
    
    // Background base layer
    L.tileLayer(`https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png?key=${CARTO_API_KEY}`, {
        maxZoom: 20,
        zIndex: 1,
        tileSize: 512,
        zoomOffset: -1,
        className: 'map-redesign',
        detectRetina: true,
        noWrap: true,
        attribution: '&copy;<a href="https://www.openstreetmap.org/copyright">osm</a>|&copy;<a href="https://carto.com/attributions">carto</a>'
    }).addTo(mapInstance);

    const providerId = weatherProviderModel.getActiveProviderId();
    const imageBounds = providers[providerId]!.imageBounds;

    // Weather graphic overlay in the middle
    windOverlayInstance = L.imageOverlay('', imageBounds, {
        opacity: 0.65,
        zIndex: 10
    }).addTo(mapInstance);

    // Labels layer on top of everything
    L.tileLayer(`https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png?key=${CARTO_API_KEY}`, {
        maxZoom: 20,
        zIndex: 20,
        tileSize: 512,
        zoomOffset: -1,
        pane: 'shadowPane',
        detectRetina: true,
        noWrap: true,
    }).addTo(mapInstance);

    return { map: mapInstance, windOverlay: windOverlayInstance };
}
