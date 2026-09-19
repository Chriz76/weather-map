import { IconLayer } from '@deck.gl/layers';
import { TileLayer } from '@deck.gl/geo-layers';
import type { Map as LeafletMap } from 'leaflet';
import { LeafletDeckOverlay } from '../utils/leafletDeckOverlay';
import { PMTiles } from 'pmtiles';
import { getTilePoints } from '../services/windArrowService';
import { weatherProviderModel } from '../models/weatherProviderModel';
import { logger } from '../utils/logger';

let overlayInstance: LeafletDeckOverlay | null = null;

function createTileLayer(pmUrl: string) {
  const pm = new PMTiles(pmUrl);

  return new TileLayer({
    // Feste ID beibehalten, damit deck.gl den Layer wiederverwendet
    // und sanfte Übergänge ermöglicht
    id: 'wind-arrow-tile-layer',

    // WICHTIG: Signalisiert deck.gl, dass getTileData bei einer neuen pmUrl
    // erneut ausgeführt und der Kachel-Cache invalidiert werden muss
    updateTriggers: {
      getTileData: [pmUrl]
    },

    minZoom: 0,
    maxZoom: 8,
    tileSize: 256,
    zoomOffset: -4,
    extent: [-180, -85.051129, 180, 85.051129],

    getTileData: async ({ index: { x, y, z } }: any) => {
      try {
        logger.debug('[windArrowOverlayView] getTileData (delegated)', { pmUrl, z, x, y });
        return await getTilePoints(pmUrl, z, x, y);
      } catch (err) {
        logger.error('[windArrowOverlayView] getTileData error', err);
        return [];
      }
    },

    renderSubLayers: (props: any) => {
      const { data } = props;

      const arrowSvg = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 80" width="40" height="80">
          <defs>
            <filter id="glow" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="blur" />
              <feComponentTransfer in="blur" result="boost">
                <feFuncA type="linear" slope="3"/>
              </feComponentTransfer>
              <feMerge>
                <feMergeNode in="boost" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <g filter="url(#glow)">
            <path d="M 7 22 L 20 8 L 33 22 M 20 8 L 20 72" fill="none" stroke="#ffffff" stroke-width="13" stroke-linecap="round" stroke-linejoin="round" />
          </g>
          <path d="M 7 22 L 20 8 L 33 22 M 20 8 L 20 72" fill="none" stroke="#1c1e22" stroke-width="8.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      `;
      const iconUrl = `data:image/svg+xml;utf8,${encodeURIComponent(arrowSvg)}`;

      return new IconLayer(props, {
        data,
        iconAtlas: iconUrl,
        iconMapping: { arrow: { x: 0, y: 0, width: 40, height: 80, mask: false } },
        getIcon: () => 'arrow',
        getPosition: (d: any) => d.position,
        getAngle: (d: any) => 180 - d.angle,
        getSize: (d: any) => Math.min(Math.max(8, 8 + Math.sqrt(Math.max(0, d.speed * 1.94384 - 3)) * 4.8), 30),

        // Update-Triggers für den Sublayer, wenn sich die Daten verändern
        updateTriggers: {
          getPosition: [pmUrl],
          getAngle: [pmUrl],
          getSize: [pmUrl]
        },

        // Optionale softe Animation der Pfeile bei Änderungen (in ms)
        transitions: {
          getAngle: 300,
          getSize: 300
        },

        sizeScale: 1,
        sizeUnits: 'pixels',
        billboard: false,
        pickable: false
      });
    }
  });
}

export interface IWindArrowOverlayView {
  init: (map: LeafletMap) => void;
  setPmtilesUrl?: (pmUrl: string) => void;
}

export const windArrowOverlayView: IWindArrowOverlayView = {
  init(map: LeafletMap) {
    if (!overlayInstance) {
      overlayInstance = new LeafletDeckOverlay({ className: 'wind-arrow-deck-overlay', zIndex: '510' });
      overlayInstance.addTo(map);

      weatherProviderModel.addEventListener('model:timestamp-index-updated', () => {
        // if the active provider does not support PMTiles, clear any existing arrows
        if (!weatherProviderModel.supportsArrowOverlay && overlayInstance) {
          logger.debug('[windArrowOverlayView] active provider does not support PMTiles; clearing layers');
          try { overlayInstance.setLayers([]); } catch (e) { /* ignore */ }
          return;
        }

        const ts = weatherProviderModel.activeTimestamp;
        if (!ts) return;
        const pmUrl = `/${ts}Z_dir.pmtiles`;
        logger.debug('[windArrowOverlayView] model:timestamp-index-updated', { timestamp: ts, url: pmUrl });
        windArrowOverlayView.setPmtilesUrl?.(pmUrl);
      });

    }
  },

  setPmtilesUrl(pmUrl: string) {
    if (!pmUrl || !overlayInstance) return;

    logger.debug('[windArrowOverlayView] setPmtilesUrl', pmUrl);

    const tileLayer = createTileLayer(pmUrl);
    overlayInstance.setLayers([tileLayer]);
  }
};