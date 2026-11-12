import { logger } from '../utils/logger';
import { SHARE_ICON_SVG } from './shareView';
import type { ModelCell, WindData } from '../types';
import * as L from 'leaflet';
import type { Map as LeafletMap, Marker, LatLngExpression } from 'leaflet';
import type { CircleMarker } from 'leaflet';
let activeSpotMarker: CircleMarker | Marker | null = null;

/** Centre of the model grid cell that produced the current values. */
let activeModelCell: ModelCell | null = null;

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

/**
 * Writes the clicked coordinate and the resolved model grid cell to the console.
 *
 * The popup no longer shows coordinates, so this is the only place they stay readable. It is
 * called once per click (not once per timeline step), and `debug` level keeps a normal console
 * clean - the values appear with `?debug=true`.
 * @param lat Latitude of the clicked point.
 * @param lng Longitude of the clicked point.
 * @param cell Grid cell centre, or null when the provider reports none.
 */
function logPointCoordinates(lat: number, lng: number, cell: ModelCell | null): void {
  const clicked = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  // Two decimals: a model cell is about 2 km wide, more digits would fake a precision.
  const gridCell = cell ? `${cell.lat.toFixed(2)}, ${cell.lng.toFixed(2)}` : 'unknown';
  logger.debug('Point coordinates:', clicked, '| model cell:', gridCell);
}

function renderDirectionIcon(direction: number | null) {
  if (direction === null) return '<strong class="marker-popup__direction marker-popup__direction--unknown">?</strong>';
  const normalizedDirection = ((direction % 360) + 360) % 360;
  const iconRotation = ((normalizedDirection + 90) % 360);
  return `<strong class="marker-popup__direction" style="--dir-deg:${iconRotation}deg">➤</strong>`;
}

function createPopupHtml(formattedValue: string, formattedGust: string, direction: number | null) {
  const directionDataAttr = direction === null ? '' : String(direction);
  const directionIcon = renderDirectionIcon(direction);
  // Wind direction in degrees with a trailing degree symbol, e.g. "184°"
  const directionDegrees = direction === null ? '?' : `${Math.round(((direction % 360) + 360) % 360)}°`;

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
                                                ${directionDegrees} max <strong class="marker-popup__gust-value">${formattedGust}</strong>
                                        </div>
                                </div>
                        </div>
            <button type="button" class="marker-popup__share-button" aria-label="Share current location">
                ${SHARE_ICON_SVG}
                <span>Share location</span>
            </button>
        </div>
    `;
}

function createMarker(map: LeafletMap, lat: number, lng: number, popupContent: string) {
  activeSpotMarker = L.circleMarker([lat, lng] as LatLngExpression, {
    className: 'weather-map-marker',
    radius: 6,
    color: '#ffffff',
    fillColor: '#0077a4',
    fillOpacity: 1,
    weight: 2,
    pane: 'topPopupPane'
  }).addTo(map);

  // Ensure popup is kept in view and avoid UI controls overlapping it.
  if (activeSpotMarker) {
    activeSpotMarker.bindPopup(popupContent, {
      pane: 'topPopupPane',
      offset: [0, -10],
      keepInView: true,
      // give extra padding so popups near the bottom/right don't overlap controls
      autoPanPadding: [50, 120]
    }).openPopup();
  }
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

export function updateMapMarkerWindspeed(map: LeafletMap, windData: WindData | number | null | undefined, cell?: ModelCell | null): void {
  try {
    if (cell !== undefined) activeModelCell = cell;
    const normalized = normalizeWindData(windData);
    const formattedValue = (normalized.speed === null || Number.isNaN(normalized.speed as number)) ? '?' : (normalized.speed as number).toFixed(1);
    const formattedGust = (normalized.gust === null || Number.isNaN(normalized.gust as number)) ? '?' : (normalized.gust as number).toFixed(0);
    const popupContent = createPopupHtml(formattedValue, formattedGust, normalized.direction);

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

export function updateMapMarkerLocation(map: LeafletMap, lat: number, lng: number, cell?: ModelCell | null): void {
  try {
    if (cell !== undefined) activeModelCell = cell;
    logPointCoordinates(lat, lng, activeModelCell);
    const existingWind = getExistingWindDisplay();
    const popupContent = createPopupHtml(existingWind.speedDisplay, existingWind.gustDisplay, existingWind.direction);

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

export function clearMarker(map: LeafletMap): void {
  if (activeSpotMarker) {
    // `Marker` and `CircleMarker` both extend `Layer`, so no cast is required.
    map.removeLayer(activeSpotMarker);
    activeSpotMarker = null;
    activeModelCell = null;
  }
}
