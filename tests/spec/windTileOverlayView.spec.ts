/**
 * Tests for the wind tile overlay: the pure tile geometry it is built on, plus a smoke test that
 * the view module loads (the deck.gl layers themselves need a GPU and are verified in the browser).
 */
import { describe, expect, it } from 'vitest';
import * as windTileGeometry from '../../src/utils/windTileGeometry';
import { windTileOverlayView } from '../../src/views/windTileOverlayView';
import type { WindTileGrid } from '../../src/services/windTileService';

/** 3x3 grid anchored at (0, 10) with 1 deg nodes; `deltaLat` is the positive step the pipeline writes. */
function makeGrid(override: Partial<WindTileGrid> = {}): WindTileGrid {
  return {
    originLng: 0,
    originLat: 10,
    deltaLng: 1,
    deltaLat: 1,
    rows: 3,
    cols: 3,
    uv: new Float32Array(3 * 3 * 2),
    ...override
  };
}

describe('windTileGeometry.arrowStride', () => {
  it('keeps the base step up to the finest archive level', () => {
    expect(windTileGeometry.arrowStride(5, 7, 8)).toBe(8);
    expect(windTileGeometry.arrowStride(7, 7, 8)).toBe(8);
  });

  it('halves the step per level above the archive', () => {
    expect(windTileGeometry.arrowStride(8, 7, 8)).toBe(4);
    expect(windTileGeometry.arrowStride(9, 7, 8)).toBe(2);
  });

  it('never drops below one node', () => {
    expect(windTileGeometry.arrowStride(20, 7, 8)).toBe(1);
  });
});

describe('windTileGeometry.tileBBoxFromIndex', () => {
  it('maps XYZ indices onto Web-Mercator bounds', () => {
    const northWest = windTileGeometry.tileBBoxFromIndex({ x: 0, y: 0, z: 1 });
    expect(northWest.west).toBe(-180);
    expect(northWest.east).toBe(0);
    expect(northWest.north).toBeCloseTo(85.0511, 3);
    expect(northWest.south).toBeCloseTo(0, 6);
  });
});

describe('windTileGeometry.resolveTileQuad', () => {
  it('returns the payload window and extent the tile covers', () => {
    const quad = windTileGeometry.resolveTileQuad(makeGrid(), {
      index: { x: 0, y: 0, z: 7 },
      bbox: { west: 0.5, south: 8.5, east: 1.5, north: 9.5 }
    });

    expect(quad).not.toBeNull();
    expect(quad!.i0).toBeCloseTo(0.5, 6);
    expect(quad!.i1).toBeCloseTo(1.5, 6);
    expect(quad!.j0).toBeCloseTo(0.5, 6);
    expect(quad!.j1).toBeCloseTo(1.5, 6);
    expect(quad!.bounds).toEqual([0.5, 8.5, 1.5, 9.5]);
  });

  it('returns null for a tile the archive does not have', () => {
    expect(windTileGeometry.resolveTileQuad(null, { index: { x: 0, y: 0, z: 7 } })).toBeNull();
  });

  it('returns null when the tile lies outside the payload', () => {
    const quad = windTileGeometry.resolveTileQuad(makeGrid(), {
      index: { x: 0, y: 0, z: 7 },
      bbox: { west: 20, south: 30, east: 21, north: 31 }
    });

    expect(quad).toBeNull();
  });
});

describe('windTileOverlayView', () => {
  it('exposes init', () => {
    expect(typeof windTileOverlayView.init).toBe('function');
  });
});
