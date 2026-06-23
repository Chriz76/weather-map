let activeSpotMarker = null;

/**
 * REINER HTML-GENERATOR: Erstellt den Popup-Inhalt (im BEM-Design)
 */
function createPopupHtml(formattedValue, coordsDisplay) {
    return `
    <div class="marker-popup">
      <div class="marker-popup__value-box">
        <strong class="marker-popup__value">${formattedValue}</strong>
        <span class="marker-popup__unit">kts</span>
      </div>
      <div class="marker-popup__coords">${coordsDisplay}</div>
    </div>
  `;
}

/**
 * NEUE EXTRAHIERTE HILFSFUNKTION: Erstellt die Leaflet-Instanz atomar an einem Ort
 */
function createMarker(map, lat, lng, popupContent) {
    activeSpotMarker = L.circleMarker([lat, lng], {
        radius: 6,
        color: '#ffffff',
        fillColor: '#0077a4',
        fillOpacity: 1,
        weight: 2
    }).addTo(map);

    activeSpotMarker.bindPopup(popupContent, { offset: [0, -10] }).openPopup();
}

/**
 * Hilfsfunktion: Holt die aktuellen Koordinaten formatiert als Text aus dem Marker
 */
function getExistingCoordsDisplay() {
    if (!activeSpotMarker) return '0.0000, 0.0000';
    const latlng = activeSpotMarker.getLatLng();
    return `${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`;
}

/**
 * Hilfsfunktion: Holt den aktuellen reinen Zahlenwert aus dem bestehenden HTML-Inhalt des Popups
 */
function getExistingValueDisplay() {
    if (!activeSpotMarker) return '?';
    const popup = activeSpotMarker.getPopup();
    if (!popup) return '?';
    
    const container = document.createElement('div');
    container.innerHTML = popup.getContent();
    const valueEl = container.querySelector('.marker-popup__value');
    return valueEl ? valueEl.textContent : '?';
}


// --- EXPORTIERTE HAUPTFUNKTIONEN (Jetzt wunderbar schlank!) ---

export function updateMapMarkerWindspeed(map, value) {
    try {
        const formattedValue = (value === null || isNaN(value)) ? '?' : value.toFixed(1);
        const coordsDisplay = getExistingCoordsDisplay();
        const popupContent = createPopupHtml(formattedValue, coordsDisplay);

        if (!activeSpotMarker) {
            createMarker(map, 0, 0, popupContent); // Nutzt die extrahierte Funktion
        } else {
            activeSpotMarker.setPopupContent(popupContent);
        }
    } catch (markerError) {
        console.error("❌ Error updating map marker windspeed:", markerError.message);
    }
}

export function updateMapMarkerLocation(map, lat, lng) {
    try {
        const coordsDisplay = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        const formattedValue = getExistingValueDisplay();
        const popupContent = createPopupHtml(formattedValue, coordsDisplay);

        if (!activeSpotMarker) {
            createMarker(map, lat, lng, popupContent); // Nutzt die extrahierte Funktion
        } else {
            activeSpotMarker.setLatLng([lat, lng]);
            activeSpotMarker.setPopupContent(popupContent);

            const popup = activeSpotMarker.getPopup();
            if (popup && popup.isOpen()) {
                popup.setLatLng([lat, lng]);
            }
        }
    } catch (markerError) {
        console.error("❌ Error moving map marker location:", markerError.message);
    }
}

export function clearMarker(map) {
    if (activeSpotMarker) {
        map.removeLayer(activeSpotMarker);
        activeSpotMarker = null;
    }
}