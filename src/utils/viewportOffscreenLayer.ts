import { CompositeLayer, COORDINATE_SYSTEM } from '@deck.gl/core';
import { TileLayer } from '@deck.gl/geo-layers';
import { BitmapLayer } from '@deck.gl/layers';
import { PMTiles } from 'pmtiles';
import { logger } from './logger';

// Raster-Abmessungen aus der PMTiles-Erzeugung (Python-Script)
const TILE_WIDTH = 141;
const TILE_HEIGHT = 90;

const Z0_WIDTH = 282;
const Z0_HEIGHT = 180;

export class ViewportOffscreenLayer extends CompositeLayer<any> {
  static layerName = 'ViewportOffscreenLayer';

  initializeState() {
    const pmtilesUrl = (this.props as any)?.pmtilesUrl as string;
    const pmtiles = pmtilesUrl ? new PMTiles(pmtilesUrl) : null;

    this.setState({
      framebuffer: null,
      pmtiles,
      currentZ: -1,
      gridWidth: 0,
      gridHeight: 0
    });
  }

  updateState({ context }: any) {
    const { device } = context || {};
    if (!device) return;

    // Zoom-Level basierend auf der Kartenansicht bestimmen (0, 2 oder 3)
    const viewport = context.viewport;
    const z = Math.min(Math.max(Math.floor(viewport?.zoom ?? 0), 0), 3);
    const effectiveZ = z < 2 ? 0 : z === 2 ? 2 : 3;

    // Zielauflösung der Textur im Speicher
    let targetWidth = 1128;
    let targetHeight = 720;

    if (effectiveZ === 0) {
      targetWidth = Z0_WIDTH;
      targetHeight = Z0_HEIGHT;
    } else if (effectiveZ === 2) {
      targetWidth = 4 * TILE_WIDTH;   // 564 px
      targetHeight = 4 * TILE_HEIGHT; // 360 px
    } else if (effectiveZ === 3) {
      targetWidth = 8 * TILE_WIDTH;   // 1128 px
      targetHeight = 8 * TILE_HEIGHT; // 720 px
    }

    let fb = this.state.framebuffer;

    // Framebuffer nur bei Änderung der Raster-Auflösung neu erzeugen
    if (!fb || this.state.gridWidth !== targetWidth || this.state.gridHeight !== targetHeight) {
      try {
        if (fb) fb.destroy?.();

        const colorTexture = device.createTexture({
          id: `arome-offscreen-texture-z${effectiveZ}`,
          width: targetWidth,
          height: targetHeight,
          format: 'rgba8unorm',
          // Striktes Nearest-Filtering: Verhindert Interpolation/Verwaschung von Windwerten
          sampler: {
            minFilter: 'nearest',
            magFilter: 'nearest'
          }
        });

        fb = device.createFramebuffer({
          id: `arome-offscreen-fb-z${effectiveZ}`,
          width: targetWidth,
          height: targetHeight,
          colorAttachments: [colorTexture]
        });

        this.setState({
          framebuffer: fb,
          currentZ: effectiveZ,
          gridWidth: targetWidth,
          gridHeight: targetHeight
        });

        logger.info(`ViewportOffscreenLayer: GPU-Offscreen-Buffer für Z=${effectiveZ} erzeugt (${targetWidth}x${targetHeight} px)`);
      } catch (err) {
        logger.error('ViewportOffscreenLayer: Framebuffer-Erstellung fehlgeschlagen', err);
      }
    }
  }

  renderLayers(): any[] {
    const { pmtiles, framebuffer, gridWidth, gridHeight, currentZ } = (this.state as any) || {};
    if (!pmtiles || !framebuffer) return [];

    const numTilesX = currentZ === 0 ? 1 : currentZ === 2 ? 4 : 8;
    const numTilesY = currentZ === 0 ? 1 : currentZ === 2 ? 4 : 8;

    const sourceTileLayer = new TileLayer({
      id: `${this.id}-source-z${currentZ}`,
      minZoom: 0,
      maxZoom: 3,

      getTileIndices: () => {
        const indices: { x: number; y: number; z: number }[] = [];
        for (let xi = 0; xi < numTilesX; xi++) {
          for (let yi = 0; yi < numTilesY; yi++) {
            indices.push({ x: xi, y: yi, z: currentZ });
          }
        }
        return indices;
      },

      getTileData: async (tile: any) => {
        const { x, y, z } = tile.index;
        if (tile.signal?.aborted) return null;

        try {
          const resp = await pmtiles.getZxy(z, x, y);
          if (!resp || !resp.data) return null;

          const blob = new Blob([resp.data], { type: 'image/webp' });
          const bitmap = await createImageBitmap(blob);
          return { bitmap, x, y };
        } catch {
          return null;
        }
      },

      renderSubLayers: (_props: any) => {
        const data = _props.data;
        if (!data) return null;
        const { bitmap, x, y } = data;

        const tileW = currentZ === 0 ? Z0_WIDTH : TILE_WIDTH;
        const tileH = currentZ === 0 ? Z0_HEIGHT : TILE_HEIGHT;

        // Positioniere Kachel direkt in Pixelkoordinaten [left, bottom, right, top]
        // Da Y in der PMTiles-Matrix von oben nach unten verläuft (North-Up),
        // kehren wir den Y-Offset um, damit Y=0 oben im Framebuffer landet.
        const left = x * tileW;
        const right = (x + 1) * tileW;
        const top = gridHeight - (y * tileH);
        const bottom = gridHeight - ((y + 1) * tileH);

        return new BitmapLayer({
          id: `tile-raw-${_props.tile.id}`,
          image: bitmap,
          bounds: [left, bottom, right, top],
          coordinateSystem: COORDINATE_SYSTEM.CARTESIAN, // Rein kartesisches Pixel-Raster!
          pickable: false
        });
      },

      // Schreibt ausschließlich in den Offscreen Framebuffer (nicht auf das Display)
      parameters: {
        framebuffer: framebuffer,
        viewport: [0, 0, gridWidth, gridHeight]
      }
    });

    // Keine Bildschirm-Ausgabe
    return [sourceTileLayer];
  }

  /**
   * Gibt das fertig befüllte luma.gl Texture-Objekt aus dem GPU-Speicher zurück.
   */
  getTexture() {
    return this.state.framebuffer?.colorAttachments?.[0] ?? null;
  }

  /**
   * Gibt den GPU-Framebuffer zurück.
   */
  getFramebuffer() {
    return this.state.framebuffer ?? null;
  }

  finalizeState() {
    const fb = (this.state as any)?.framebuffer;
    fb?.destroy?.();
  }
}

export default ViewportOffscreenLayer;