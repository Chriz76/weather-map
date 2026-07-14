// controllers/mapController.js
import { weatherModel } from '../models/weatherModel.js';
import { storage } from '../utils/storage.js';
import { notificationController } from './notificationController.js';
import { loadWeatherDataForLocationAction } from './actions.js';
import { stationView } from '../views/stationView.js';
import { updateStationsOnMapAction } from './updateStationsOnMapAction.js';

let stationsData = [];
let stationViewHandle = null;

// --- NEU: Ein lokaler Cache, um die API bei kleinen Kartenbewegungen zu schonen ---
const windCache = {};

export function initMapController(map) {
    /** @type {number | null} */
    let lastClusterClickToken = null;

    // --- NEU: Laden der JSON-Testdaten aus Schritt 1 ---
    async function loadStations() {
        try {
            const response = await fetch('/assets/stations.json'); // Pfad zu deinem Asset-Ordner anpassen
            stationsData = await response.json();
            console.log("📍 Stationsdaten erfolgreich geladen:", stationsData.length);
            // Direkt einmal triggern, damit beim Start schon die Marker da sind
            updateStationsOnMapAction(map, stationsData, windCache);
        } catch (error) {
            console.error("Fehler beim Laden der stations.json:", error);
        }
    }

    // Move update logic to action: see controllers/updateStationsOnMapAction.js

    async function triggerLoadAtLatLng(latlng) {
        const currentClickToken = Date.now();
        lastClusterClickToken = currentClickToken;

        await loadWeatherDataForLocationAction(latlng);
        if (lastClusterClickToken !== currentClickToken) return;
    }

    async function handleMapClick(e) {
        await triggerLoadAtLatLng(e.latlng);
    }

    async function handleLocationFound(e) {
        const currentClickToken = Date.now();
        lastClusterClickToken = currentClickToken;

        map.setView(e.latlng, 14, { animate: true });
        await triggerLoadAtLatLng(e.latlng);

        if (lastClusterClickToken === currentClickToken) {
            weatherModel.setIsLocating(false);
        }
    }

    function handleLocationError(e) {
        notificationController.showNotification({ message: 'Error processing GPS location: ' + e.message });
        weatherModel.setIsLocating(false);
    }

    function handlePopupClose() {
        lastClusterClickToken = null;
        weatherModel.removePointData();
    }

    function handleMoveEnd() {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('lat') && urlParams.has('lon')) return;

        const center = map.getCenter();
        storage.saveMapState({
            lat: center.lat,
            lng: center.lng,
            zoom: map.getZoom()
        });

        // --- NEU: Bei jeder Kartenbewegung (Verschieben/Zoomen) den Filter ausführen ---
        updateStationsOnMapAction(map, stationsData, windCache);
    }

    map.on('click', handleMapClick);
    map.on('locationfound', handleLocationFound);
    map.on('locationerror', handleLocationError);
    map.on('popupclose', handlePopupClose);
    map.on('moveend', handleMoveEnd);
    // Sicherstellen, dass auch nach reinem Zoom aktualisiert wird
    map.on('zoomend', () => updateStationsOnMapAction(map, stationsData, windCache));

    // Init station view (it listens to model events)
    stationViewHandle = stationView.init(map, {
        onMarkerClick: async (latlng) => {
            await triggerLoadAtLatLng(latlng);
        }
    });

    // Initialisierung starten: Liste laden
    loadStations();
}