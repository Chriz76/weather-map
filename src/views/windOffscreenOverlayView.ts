import type { Map as LeafletMap } from 'leaflet';
import { LeafletDeckOverlay } from '../utils/leafletDeckOverlay';
import ViewportOffscreenLayer from '../utils/viewportOffscreenLayer';
import { logger } from '../utils/logger';

const WIND_OFFSCREEN_PANE_Z_INDEX = '510';
const WIND_OFFSCREEN_CLASS = 'wind-offscreen-deck-overlay';

// Statische PMTiles-Datei
const PMTILES_WIND_URL = '/20260823_1200Z_arome.pmtiles';

let overlayInstance: LeafletDeckOverlay | null = null;

export interface IWindOffscreenOverlayView {
  init: (map: LeafletMap) => void;
  destroy: () => void;
}

export const windOffscreenOverlayView: IWindOffscreenOverlayView = {
  init: (map: LeafletMap): void => {
    logger.info('Initializing PARALLEL wind offscreen overlay view (Step 1).');

    if (!overlayInstance) {
      overlayInstance = new LeafletDeckOverlay({
        className: WIND_OFFSCREEN_CLASS,
        zIndex: WIND_OFFSCREEN_PANE_Z_INDEX
      });
      overlayInstance.addTo(map);

      const offscreenWindLayer = new ViewportOffscreenLayer({
        id: 'viewport-offscreen-wind',
        pmtilesUrl: PMTILES_WIND_URL,
        tileSize: 256,
        minZoom: 0,
        maxZoom: 12
      } as any);

      overlayInstance.setLayers([offscreenWindLayer]);

      // Listen to map move/zoom to trigger a Deck redraw if needed
      map.on('moveend zoomend resize', () => {
        const mapInstance = overlayInstance?.getMapInstance();
        if (mapInstance) {
          logger.info('windOffscreenOverlayView: map moved - requesting redraw');
          (overlayInstance as any).redraw?.();
        }
      });
    }
  },

  destroy: (): void => {
    if (overlayInstance) {
      overlayInstance.setLayers([]);
      overlayInstance = null;
    }
  }
};
