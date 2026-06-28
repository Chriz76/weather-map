let activeSpotMarker = null;

/**
 * Normalizes different wind payload shapes into one object including gusts.
 * @param {number|{speed:number|null,direction:number|null,gust:number|null}|null} windData Wind payload from model.
 * @returns {{speed:number|null,direction:number|null,gust:number|null}} Normalized wind payload.
 */
function normalizeWindData(windData) {
        if (typeof windData === 'number') {
                return {
                        speed: Number.isFinite(windData) ? windData : null,
                        direction: null,
                        gust: null
                };
        }

        if (!windData || typeof windData !== 'object') {
                return { speed: null, direction: null, gust: null };
        }

        return {
                speed: Number.isFinite(windData.speed) ? windData.speed : null,
                direction: Number.isFinite(windData.direction) ? ((windData.direction % 360) + 360) % 360 : null,
                gust: Number.isFinite(windData.gust) ? windData.gust : null
        };
}

/**
 * Builds popup HTML for a direction icon with continuous rotation.
 * @param {number|null} direction Wind direction in degrees.
 * @returns {string} Direction icon HTML.
 */
function renderDirectionIcon(direction) {
    if (direction === null) {
        return '<strong class="marker-popup__direction marker-popup__direction--unknown">?</strong>';
    }

    const normalizedDirection = ((direction % 360) + 360) % 360;
    const iconRotation = ((normalizedDirection + 90) % 360);
    return `<strong class="marker-popup__direction" style="--dir-deg:${iconRotation}deg">➤</strong>`;
}

/**
 * Creates popup HTML content for the marker.
 * @param {string} formattedValue Preformatted wind speed value.
 * @param {string} formattedGust Preformatted gust value.
 * @param {number|null} direction Wind direction in degrees.
 * @param {string} coordsDisplay Preformatted coordinate text.
 * @returns {string} Popup HTML string.
 */
function createPopupHtml(formattedValue, formattedGust, direction, coordsDisplay) {
        const directionDataAttr = direction === null ? '' : String(direction);
        const directionIcon = renderDirectionIcon(direction);

    return `
        <div class="marker-popup" data-direction="${directionDataAttr}" data-gust="${formattedGust}">
                        <div class="marker-popup__wind-line">
                                ${directionIcon}
                                <div class="marker-popup__value-box">
                                        <div>
                                                <strong class="marker-popup__value">${formattedValue}</strong>
                                                <span class="marker-popup__unit">kts</span>
                                        </div>
                                        <div class="marker-popup__gusts-row" style="font-size: 0.85em; opacity: 0.8; margin-top: 1px;">
                                                max <strong class="marker-popup__gust-value">${formattedGust}</strong>
                                        </div>
                                </div>
                        </div>
      <div class="marker-popup__coords">${coordsDisplay}</div>
    </div>
  `;
}

/**
 * Creates the Leaflet marker instance and opens its popup.
 * @param {L.Map} map Leaflet map instance.
 * @param {number} lat Latitude.
 * @param {number} lng Longitude.
 * @param {string} popupContent Popup HTML content.
 * @returns {void}
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
 * Reads coordinates from the existing marker and formats them.
 * @returns {string} Formatted coordinates.
 */
function getExistingCoordsDisplay() {
    if (!activeSpotMarker) return '0.0000, 0.0000';
    const latlng = activeSpotMarker.getLatLng();
    return `${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`;
}

/**
 * Reads current wind values from the existing popup content.
 * @returns {{speedDisplay:string,gustDisplay:string,direction:number|null}} Current speed text, gust text and direction.
 */
function getExistingWindDisplay() {
    if (!activeSpotMarker) return { speedDisplay: '?', gustDisplay: '?', direction: null };

    const popup = activeSpotMarker.getPopup();
    if (!popup) return { speedDisplay: '?', gustDisplay: '?', direction: null };
    
    const container = document.createElement('div');
    container.innerHTML = popup.getContent();

    const valueEl = container.querySelector('.marker-popup__value');
    const popupEl = container.querySelector('.marker-popup');
    
    let gustDisplay = '?';
    if (popupEl && popupEl.hasAttribute('data-gust')) {
        gustDisplay = popupEl.getAttribute('data-gust');
    } else {
        const gustEl = container.querySelector('.marker-popup__gust-value');
        if (gustEl) gustDisplay = gustEl.textContent;
    }

    const directionRaw = popupEl ? Number(popupEl.getAttribute('data-direction')) : NaN;
    const direction = Number.isFinite(directionRaw) ? directionRaw : null;

    return {
        speedDisplay: valueEl ? valueEl.textContent : '?',
        gustDisplay,
        direction
    };
}


// --- EXPORTIERTE HAUPTFUNKTIONEN ---

/**
 * Updates the marker popup wind speed while preserving current coordinates.
 * @param {L.Map} map Leaflet map instance.
 * @param {number|{speed:number|null,direction:number|null,gust:number|null}|null} windData Interpolated wind payload.
 * @returns {void}
 */
export function updateMapMarkerWindspeed(map, windData) {
    try {
        const normalized = normalizeWindData(windData);
        const formattedValue = (normalized.speed === null || isNaN(normalized.speed)) ? '?' : normalized.speed.toFixed(1);
        const formattedGust = (normalized.gust === null || isNaN(normalized.gust)) ? '?' : normalized.gust.toFixed(0);
        const coordsDisplay = getExistingCoordsDisplay();
        const popupContent = createPopupHtml(formattedValue, formattedGust, normalized.direction, coordsDisplay);

        if (!activeSpotMarker) {
            createMarker(map, 0, 0, popupContent);
        } else {
            activeSpotMarker.setPopupContent(popupContent);
        }
    } catch (markerError) {
        console.error("❌ Error updating map marker windspeed:", markerError.message);
    }
}

/**
 * Updates marker location while preserving current wind speed text.
 * @param {L.Map} map Leaflet map instance.
 * @param {number} lat Latitude.
 * @param {number} lng Longitude.
 * @returns {void}
 */
export function updateMapMarkerLocation(map, lat, lng) {
    try {
        const coordsDisplay = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        const existingWind = getExistingWindDisplay();
        const popupContent = createPopupHtml(existingWind.speedDisplay, existingWind.gustDisplay, existingWind.direction, coordsDisplay);

        if (!activeSpotMarker) {
            createMarker(map, lat, lng, popupContent);
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

/**
 * Removes the active spot marker from the map.
 * @param {L.Map} map Leaflet map instance.
 * @returns {void}
 */
export function clearMarker(map) {
    if (activeSpotMarker) {
        map.removeLayer(activeSpotMarker);
        activeSpotMarker = null;
    }
}
