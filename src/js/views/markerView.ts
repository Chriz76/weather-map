import { logger } from '../utils/logger';

const L = (window as any).L;
let activeSpotMarker: any = null;

function normalizeWindData(windData: any) {
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
    direction: windData.direction !== null && Number.isFinite(windData.direction) ? ((windData.direction % 360) + 360) % 360 : null,
    gust: windData.gust !== null && Number.isFinite(windData.gust) ? windData.gust : null
  };
}

function renderDirectionIcon(direction: number | null) {
  if (direction === null) return '<strong class="marker-popup__direction marker-popup__direction--unknown">?</strong>';
  const normalizedDirection = ((direction % 360) + 360) % 360;
  const iconRotation = ((normalizedDirection + 90) % 360);
  return `<strong class="marker-popup__direction" style="--dir-deg:${iconRotation}deg">➤</strong>`;
}

function createPopupHtml(formattedValue: string, formattedGust: string, direction: number | null, coordsDisplay: string) {
  const directionDataAttr = direction === null ? '' : String(direction);
  const directionIcon = renderDirectionIcon(direction);

  return `
        <div class="marker-popup" data-direction="${directionDataAttr}" data-gust="${formattedGust}">
                        <div class="marker-popup__wind-line" style="display: flex; align-items: center; gap: 8px;">
                                ${directionIcon}
                                <div class="marker-popup__value-container" style="display: flex; flex-direction: column; align-items: flex-start; line-height: 1.2;">
                                        <div class="marker-popup__value-box">
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

function createMarker(map: any, lat: number, lng: number, popupContent: string) {
  activeSpotMarker = L.circleMarker([lat, lng], {
    radius: 6,
    color: '#ffffff',
    fillColor: '#0077a4',
    fillOpacity: 1,
    weight: 2
  }).addTo(map);

  activeSpotMarker.bindPopup(popupContent, { offset: [0, -10] }).openPopup();
}

function getExistingCoordsDisplay() {
  if (!activeSpotMarker) return '0.0000, 0.0000';
  const latlng = activeSpotMarker.getLatLng();
  return `${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`;
}

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
    gustDisplay = popupEl.getAttribute('data-gust') || '?';
  } else {
    const gustEl = container.querySelector('.marker-popup__gust-value');
    if (gustEl) gustDisplay = gustEl.textContent || '?';
  }

  const directionRaw = popupEl ? Number(popupEl.getAttribute('data-direction')) : NaN;
  const direction = Number.isFinite(directionRaw) ? directionRaw : null;

  return {
    speedDisplay: valueEl ? (valueEl.textContent || '?') : '?',
    gustDisplay,
    direction
  };
}

export function updateMapMarkerWindspeed(map: any, windData: any) {
  try {
    const normalized = normalizeWindData(windData);
    const formattedValue = (normalized.speed === null || isNaN(normalized.speed as any)) ? '?' : (normalized.speed as number).toFixed(1);
    const formattedGust = (normalized.gust === null || isNaN(normalized.gust as any)) ? '?' : (normalized.gust as number).toFixed(0);
    const coordsDisplay = getExistingCoordsDisplay();
    const popupContent = createPopupHtml(formattedValue, formattedGust, normalized.direction, coordsDisplay);

    if (!activeSpotMarker) {
      createMarker(map, 0, 0, popupContent);
    } else {
      activeSpotMarker.setPopupContent(popupContent);
    }
  } catch (markerError: any) {
    const errorMessage = markerError instanceof Error ? markerError.message : String(markerError);
    logger.error('❌ Error updating map marker windspeed:', errorMessage);
  }
}

export function updateMapMarkerLocation(map: any, lat: number, lng: number) {
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
  } catch (markerError: any) {
    const errorMessage = markerError instanceof Error ? markerError.message : String(markerError);
    logger.error('❌ Error moving map marker location:', errorMessage);
  }
}

export function clearMarker(map: any) {
  if (activeSpotMarker) {
    map.removeLayer(activeSpotMarker);
    activeSpotMarker = null;
  }
}
