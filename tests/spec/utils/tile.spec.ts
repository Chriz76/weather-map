import { describe, it, expect } from 'vitest';
import { getTileBounds, getDensityConfig, getVisibleTileIndices } from '../../../src/utils/tile';

describe('tile utils', () => {
  it('getTileBounds with z=0 returns full configured extent', () => {
    const b = getTileBounds(0, 0, 0);
    expect(b.west).toBeCloseTo(-12.0);
    expect(b.east).toBeCloseTo(16.4);
    expect(b.north).toBeCloseTo(55.4);
    expect(b.south).toBeCloseTo(37.4);
  });

  it('getDensityConfig returns pmZ 0 and step 1 at zoom 8 (default config)', () => {
    const mockMap: any = { getZoom: () => 8 };
    const cfg = getDensityConfig(mockMap);
    expect(cfg.pmZ).toBe(0);
    expect(cfg.step).toBe(1);
  });

  it('getVisibleTileIndices returns tile for viewport overlapping default tile', () => {
    const mockMap: any = {
      getBounds: () => ({
        getWest: () => -13.0,
        getEast: () => 17.0,
        getSouth: () => 36.0,
        getNorth: () => 56.0
      }),
      getZoom: () => 8
    };

    const indices = getVisibleTileIndices(mockMap, 0);
    expect(indices.length).toBeGreaterThan(0);
    expect(indices[0]).toHaveProperty('x');
    expect(indices[0]).toHaveProperty('y');
    expect(indices[0]).toHaveProperty('z');
  });

  it('getVisibleTileIndices returns empty array for non-overlapping bounds', () => {
    const mockMap: any = {
      getBounds: () => ({
        getWest: () => 1000,
        getEast: () => 1001,
        getSouth: () => 1000,
        getNorth: () => 1001
      }),
      getZoom: () => 8
    };

    const indices = getVisibleTileIndices(mockMap, 0);
    expect(indices.length).toBe(0);
  });
});
