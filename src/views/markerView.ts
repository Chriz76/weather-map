import { logger } from '../utils/logger';
import { SHARE_ICON_SVG } from './shareView';
import type { WindData } from '../types';
import * as L from 'leaflet';
import type { Map as LeafletMap, Marker, LatLngExpression } from 'leaflet';
import type { CircleMarker } from 'leaflet';
let activeSpotMarker: CircleMarker | Marker | null = null;

/** Centre of the model grid cell that produced the current values. */
type ModelCell = { lat: number; lng: number };
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

/** Kilometres per degree of latitude; precise enough at the ~2 km scale used here. */
const KM_PER_DEGREE = 111.32;

/** Offsets below this distance are hidden: the cell is effectively the clicked spot. */
const OFFSET_MIN_KM = 0.2;

/**
 * Distance between a clicked point and the grid cell that produced its values.
 *
 * Uses a flat-earth approximation, which is accurate to a few metres over the ~2 km a model cell
 * can be away, instead of a full haversine for what is only a visibility threshold.
 * @param lat Latitude of the clicked point.
 * @param lng Longitude of the clicked point.
 * @param cell Grid cell centre, or null when unknown.
 * @returns Distance in kilometres, or null without a cell.
 */
function cellDistanceKm(lat: number, lng: number, cell: ModelCell | null): number | null {
  if (!cell) return null;
  const northKm = (cell.lat - lat) * KM_PER_DEGREE;
  const eastKm = (cell.lng - lng) * KM_PER_DEGREE * Math.cos((lat * Math.PI) / 180);
  return Math.hypot(northKm, eastKm);
}

/**
 * Formats the model grid cell as its own popup line.
 *
 * Two decimals are deliberate: a model cell is about 2 km wide, so more digits would fake a
 * precision the data does not have. Below {@link OFFSET_MIN_KM} the line is dropped entirely.
 * @param lat Latitude of the clicked point.
 * @param lng Longitude of the clicked point.
 * @returns `Cell 51.13, 10.55`, or an empty string when there is nothing worth showing.
 */
function formatCellLine(lat: number, lng: number): string {
  if (!activeModelCell) return '';
  const distanceKm = cellDistanceKm(lat, lng, activeModelCell);
  if (distanceKm === null || distanceKm < OFFSET_MIN_KM) return '';
  return `Cell ${activeModelCell.lat.toFixed(2)}, ${activeModelCell.lng.toFixed(2)}`;
}

function renderDirectionIcon(direction: number | null) {
  if (direction === null) return '<strong class="marker-popup__direction marker-popup__direction--unknown">?</strong>';
  const normalizedDirection = ((direction % 360) + 360) % 360;
  const iconRotation = ((normalizedDirection + 90) % 360);
  return `<strong class="marker-popup__direction" style="--dir-deg:${iconRotation}deg">➤</strong>`;
}

function createPopupHtml(formattedValue: string, formattedGust: string, direction: number | null, coordsDisplay: string, cellDisplay: string) {
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
            <div class="marker-popup__coords">${coordsDisplay}</div>
            ${cellDisplay ? `<div class="marker-popup__coords">${cellDisplay}</div>` : ''}
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

function getExistingCoordsDisplay() {
  if (!activeSpotMarker) return '0.0000, 0.0000';
  const latlng = activeSpotMarker.getLatLng();
  return `${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`;
}

function getExistingCellDisplay() {
  if (!activeSpotMarker) return '';
  const latlng = activeSpotMarker.getLatLng();
  return formatCellLine(latlng.lat, latlng.lng);
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
    const coordsDisplay = getExistingCoordsDisplay();
    const cellDisplay = getExistingCellDisplay();
    const popupContent = createPopupHtml(formattedValue, formattedGust, normalized.direction, coordsDisplay, cellDisplay);

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
    const coordsDisplay = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    const cellDisplay = formatCellLine(lat, lng);
    const existingWind = getExistingWindDisplay();
    const popupContent = createPopupHtml(existingWind.speedDisplay, existingWind.gustDisplay, existingWind.direction, coordsDisplay, cellDisplay);

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
