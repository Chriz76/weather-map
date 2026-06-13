let activeSpotMarker = null;

export function updateMapMarker(map, lat, lng, value) {
  try {
    const formattedValue = isNaN(value) ? '?' : value.toFixed(1);
    const coordsDisplay = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

    if (!activeSpotMarker) {
      activeSpotMarker = L.circleMarker([lat, lng], {
        radius: 6, color: '#ffffff', fillColor: '#0077a4', fillOpacity: 1, weight: 2
      }).addTo(map);

      const initialPopupContent = `
        <div style="text-align: center; font-family: sans-serif; min-width: 120px;">
          <strong style="font-size: 16px; color: #333;"><span id="popup-wind-value">${formattedValue}</span> kts</strong><br>
          <span style="font-size: 10px; color: #777; white-space: nowrap;" id="popup-coords-value">${coordsDisplay}</span>
        </div>
      `;

      activeSpotMarker.bindPopup(initialPopupContent, { offset: [0, -10] }).openPopup();

    } else {
      activeSpotMarker.setLatLng([lat, lng]);

      const popup = activeSpotMarker.getPopup();
      if (popup && popup.isOpen()) {
        popup.setLatLng([lat, lng]);
      }

      const valueSpan = document.getElementById('popup-wind-value');
      if (valueSpan) valueSpan.innerText = formattedValue;

      const coordsSpan = document.getElementById('popup-coords-value');
      if (coordsSpan) coordsSpan.innerText = coordsDisplay;
    }
  } catch (markerError) {
    console.error("?? Error moving map marker/popup:", markerError.message);
  }
}

export function clearMarker(map) {
  if (activeSpotMarker) {
    map.removeLayer(activeSpotMarker);
    activeSpotMarker = null;
  }
}
