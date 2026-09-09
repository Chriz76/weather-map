/* global L */
// --- src/map-init.js ---
import { CARTO_API_KEY, DEFAULT_MAP_VIEW, providers } from './config.ts';
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
    const savedState = storage.getMapState(DEFAULT_MAP_VIEW);

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

    // Use the Web Mercator latitude limit so Leaflet cannot pan into wrapped world copies.
    const worldBounds: L.LatLngBoundsExpression = [
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

        // Erstelle ein eigenes Pane FÜR Popups außerhalb des mapPane, aber im
        // mapContainer. Dadurch kann es einen höheren z-Index gegenüber Deck.gl
        // besitzen und wir synchronisieren seine Pixel-Position bei jedem Move.
        const mapContainerEl = mapInstance!.getContainer();
        const topPopupPane = mapInstance!.createPane('topPopupPane', mapContainerEl);
        topPopupPane.style.zIndex = '800';

        // Ensure the default popup pane is above overlays/arrows as well
        const defaultPopupPane = mapInstance!.getPanes().popupPane;
        if (defaultPopupPane) {
            defaultPopupPane.style.zIndex = '810';
        }

        // Erstelle ein eigenes Pane für Badges zwischen Labels und Popups
        const topBadgesPane = mapInstance!.getPane('topBadgesPane') || mapInstance!.createPane('topBadgesPane', mapContainerEl);
        topBadgesPane.style.zIndex = '795';
        // Badges müssen pointer events erhalten, damit Marker-Klicks funktionieren
        topBadgesPane.style.pointerEvents = 'auto';

        // Erstelle ein eigenes Pane für die Labels und setze es zwischen Overlay und Popups
        // Ensure label pane exists and is properly configured
        const topLabelPane = mapInstance!.getPane('topLabelPane') || mapInstance!.createPane('topLabelPane', mapContainerEl);
        // Put labels above overlays but below popups
        // Use 790 so it's just below `topPopupPane` (800) but above typical overlays
        topLabelPane.style.zIndex = '790';
        // Labels should not capture pointer events so map interactions still work
        topLabelPane.style.pointerEvents = 'none';

        // Synchronisiere die pixel-Position des topPopupPane, topBadgesPane und topLabelPane mit der mapPane
        // so dass Popups, Badges und Labels optisch an der gleichen Stelle bleiben während Panning/Drag.
        const syncTopPopupPane = () => {
            const mapPanePos = L.DomUtil.getPosition(mapInstance!.getPanes().mapPane);
            const pos = mapPanePos || L.point(0, 0);
            L.DomUtil.setPosition(topPopupPane, pos);
            L.DomUtil.setPosition(topBadgesPane, pos);
            L.DomUtil.setPosition(topLabelPane, pos);
        };

        // Initiales Ausrichten
        syncTopPopupPane();

        // Aktualisieren bei Bewegung und View-Resets
        mapInstance!.on('move viewreset zoomAnim', syncTopPopupPane);


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

    // Labels layer on top of everything (use synced label pane so labels stay aligned with map)
    L.tileLayer(`https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png?key=${CARTO_API_KEY}`, {
        maxZoom: 20,
        zIndex: 790,
        tileSize: 512,
        zoomOffset: -1,
        pane: 'topLabelPane',
        detectRetina: true,
        noWrap: true,
    }).addTo(mapInstance);

    return { map: mapInstance, windOverlay: windOverlayInstance };
}
