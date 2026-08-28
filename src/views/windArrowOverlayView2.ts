import type { Map as LeafletMap } from 'leaflet';
import { TileLayer, _Tileset2D as Tileset2D } from '@deck.gl/geo-layers';
import { BitmapLayer } from '@deck.gl/layers';
import { PMTiles } from 'pmtiles';
import { LeafletDeckOverlay } from '../utils/leafletDeckOverlay';
import { logger } from '../utils/logger';

const PMTILES_WIND_URL = '/20260823_1200Z_arome.pmtiles';
const LON_MIN = -12.0;
const LAT_MIN = 37.425;
const LON_MAX = 16.175;
const LAT_MAX = 55.4;

let overlayInstance: LeafletDeckOverlay | null = null;

// Hilfsfunktion: Berechnet die exakten WGS84 (EPSG:4326) Bounds einer Kachel
function getTileBounds(x: number, y: number, z: number) {
  const tiles = 1 << z;
  const tileWidthLon = (LON_MAX - LON_MIN) / tiles;
  const tileHeightLat = (LAT_MAX - LAT_MIN) / tiles;

  const west = LON_MIN + x * tileWidthLon;
  const east = LON_MIN + (x + 1) * tileWidthLon;
  const north = LAT_MAX - y * tileHeightLat;
  const south = LAT_MAX - (y + 1) * tileHeightLat;

  return [west, south, east, north]; // [minX, minY, maxX, maxY]
}

class CustomPMTileset2D extends Tileset2D {
  // WICHTIG: Teilt deck.gl die exakte Geometrie der Kachel für das Rendering/Matrix-Transformatoren mit!
  getTileMetadata(index: { x: number; y: number; z: number }) {
    const [west, south, east, north] = getTileBounds(index.x, index.y, index.z);
    return {
      bbox: { west, south, east, north }
    };
  }

  getTileIndices({ viewport }: any) {
    const deckZ = Math.round(viewport?.zoom ?? 0);
    
    let pmZ = 0;
    if (deckZ >= 4.5) pmZ = 3;
    else if (deckZ >= 2.5) pmZ = 2;

    const tiles = 1 << pmZ;
    const indices: { x: number; y: number; z: number }[] = [];
    
    let west = -180, south = -90, east = 180, north = 90;
    if (viewport?.getBounds) {
      [west, south, east, north] = viewport.getBounds();
    }

    for (let y = 0; y < tiles; y++) {
      for (let x = 0; x < tiles; x++) {
        const [tWest, tSouth, tEast, tNorth] = getTileBounds(x, y, pmZ);

        const isVisible = !(
          tEast < west ||
          tWest > east ||
          tSouth > north ||
          tNorth < south
        );

        if (isVisible) {
          indices.push({ x, y, z: pmZ });
        }
      }
    }
    return indices;
  }

  getTileId(index: { x: number; y: number; z: number }) {
    return `${index.z}-${index.x}-${index.y}`;
  }

  getTileZoom(index: { z: number }) {
    return index.z;
  }
}

export const windArrowOverlayView2 = {
  init: (map: LeafletMap): void => {
    logger.info('Initializing windArrowOverlayView2');

    if (overlayInstance) return;

    overlayInstance = new LeafletDeckOverlay({ className: 'wind-arrow-overlay-2', zIndex: 520 });
    overlayInstance.addTo(map);

    const pmtiles = new PMTiles(PMTILES_WIND_URL);

    const tileLayer = new TileLayer({
      id: 'wind-pmtiles-tilelayer-2',
      minZoom: 0,
      maxZoom: 20, 
      TilesetClass: CustomPMTileset2D,

      getTileData: async ({ index, signal }: any) => {
        const { x, y, z } = index;
        if (signal?.aborted) return null;

        try {
          const resp = await pmtiles.getZxy(z, x, y);
          if (!resp || !resp.data) return null;

          const bounds = getTileBounds(x, y, z);
          const blob = new Blob([resp.data], { type: 'image/webp' });
          const bitmap = await createImageBitmap(blob);

          return { bitmap, bounds };
        } catch (err) {
          logger.error('windArrowOverlayView2: getTileData error', err);
          return null;
        }
      },

      renderSubLayers: (props: any) => {
        const data = props.data;
        if (!data || !data.bitmap) return null;

        return new BitmapLayer(props, {
          id: `${props.id}-bitmap`,
          image: data.bitmap,
          bounds: data.bounds,
          pickable: false
        });
      }
    } as any);

    overlayInstance.setLayers([tileLayer]);
  },

  destroy: (): void => {
    if (overlayInstance) {
      overlayInstance.setLayers([]);
      overlayInstance = null;
    }
  }
};

export default windArrowOverlayView2;