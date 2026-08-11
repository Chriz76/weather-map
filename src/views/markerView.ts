import { logger } from '../utils/logger';
import type { WindData } from '../types';
import type { Map as LeafletMap, Marker, LatLngExpression } from 'leaflet';

const L = window.L as typeof import('leaflet');
import type { CircleMarker } from 'leaflet';
let activeSpotMarker: CircleMarker | Marker | null = null;

function normalizeWindData(windData: WindData | number | null | undefined) {
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
    speed: Number.isFinite((windData as WindData).speed as number) ? (windData as WindData).speed as number : null,
    direction: (windData as WindData).direction !== null && Number.isFinite((windData as WindData).direction as number) ? (((windData as WindData).direction as number % 360) + 360) % 360 : null,
    gust: (windData as WindData).gust !== null && Number.isFinite((windData as WindData).gust as number) ? (windData as WindData).gust as number : null
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

function createMarker(map: LeafletMap, lat: number, lng: number, popupContent: string) {
  activeSpotMarker = L.circleMarker([lat, lng] as LatLngExpression, {
    radius: 6,
    color: '#ffffff',
    fillColor: '#0077a4',
    fillOpacity: 1,
    weight: 2
  }).addTo(map);

  // Ensure popup is kept in view and avoid UI controls overlapping it.
  if (activeSpotMarker) {
    activeSpotMarker.bindPopup(popupContent, {
      offset: [0, -10],
      keepInView: true,
      // give extra padding so popups near the bottom/right don't overlap controls
      autoPanPadding: [50, 120]
    }).openPopup();
  }
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
  const content = popup.getContent();
  if (typeof content === 'string') {
    container.innerHTML = content;
  } else if (content instanceof HTMLElement) {
    container.appendChild(content.cloneNode(true));
  } else {
    container.innerHTML = String(content ?? '');
  }

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

export function updateMapMarkerWindspeed(map: LeafletMap, windData: WindData | number | null | undefined) {
  try {
    const normalized = normalizeWindData(windData);
    const formattedValue = (normalized.speed === null || Number.isNaN(normalized.speed as number)) ? '?' : (normalized.speed as number).toFixed(1);
    const formattedGust = (normalized.gust === null || Number.isNaN(normalized.gust as number)) ? '?' : (normalized.gust as number).toFixed(0);
    const coordsDisplay = getExistingCoordsDisplay();
    const popupContent = createPopupHtml(formattedValue, formattedGust, normalized.direction, coordsDisplay);

    if (!activeSpotMarker) {
      createMarker(map, 0, 0, popupContent);
    } else {
      activeSpotMarker.setPopupContent(popupContent);
    }
  } catch (markerError: unknown) {
    const errorMessage = markerError instanceof Error ? markerError.message : String(markerError);
    logger.error('❌ Error updating map marker windspeed:', errorMessage);
  }
}

export function updateMapMarkerLocation(map: LeafletMap, lat: number, lng: number) {
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
  } catch (markerError: unknown) {
    const errorMessage = markerError instanceof Error ? markerError.message : String(markerError);
    logger.error('❌ Error moving map marker location:', errorMessage);
  }
}

export function clearMarker(map: LeafletMap) {
  if (activeSpotMarker) {
    map.removeLayer(activeSpotMarker as unknown as import('leaflet').Layer);
    activeSpotMarker = null;
  }
}
