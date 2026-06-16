let activeSpotMarker = null;

/**
 * Reiner HTML-Generator für den Popup-Inhalt (im BEM-Design)
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

export function updateMapMarker(map, lat, lng, value) {
    try {
        const formattedValue = isNaN(value) ? '?' : value.toFixed(1);
        const coordsDisplay = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        const popupContent = createPopupHtml(formattedValue, coordsDisplay);

        // FALL 1: Marker existiert noch nicht -> Neu erstellen
        if (!activeSpotMarker) {
            activeSpotMarker = L.circleMarker([lat, lng], {
                radius: 6,
                color: '#ffffff',
                fillColor: '#0077a4',
                fillOpacity: 1,
                weight: 2
            }).addTo(map);

            activeSpotMarker.bindPopup(popupContent, { offset: [0, -10] }).openPopup();

            // FALL 2: Marker existiert bereits -> Rein passiv updaten (Ohne document.getElementById!)
        } else {
            // 1. Marker an neue Position bewegen
            activeSpotMarker.setLatLng([lat, lng]);

            // 2. Neuen HTML-Inhalt direkt in das Leaflet-Popup jagen
            activeSpotMarker.setPopupContent(popupContent);

            // 3. Falls das Popup offen ist, an die neue Position heften
            const popup = activeSpotMarker.getPopup();
            if (popup && popup.isOpen()) {
                popup.setLatLng([lat, lng]);
            }
        }
    } catch (markerError) {
        console.error("❌ Error moving map marker/popup:", markerError.message);
    }
}

export function clearMarker(map) {
    if (activeSpotMarker) {
        map.removeLayer(activeSpotMarker);
        activeSpotMarker = null;
    }
}