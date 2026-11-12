/**
 * Tests for the tile pyramid helpers of `src/utils/tilePyramid.ts`.
 *
 * The templates below mirror what the HRRR `index.json` publishes:
 * `runs/<run>/tiles/{timestamp}/{z}/{x}/{y}.bin`.
 */
import { describe, expect, it } from 'vitest';
import * as tilePyramid from '../../src/utils/tilePyramid';
import type { TileCoverage } from '../../src/types';

describe('tileFolderTimestamp', () => {
  it('adds the Z suffix the tile folders carry', () => {
    expect(tilePyramid.tileFolderTimestamp('20261027_1500')).toBe('20261027_1500Z');
    expect(tilePyramid.tileFolderTimestamp('20261027_22')).toBe('20261027_22Z');
  });

  it('keeps an already suffixed timestamp', () => {
    expect(tilePyramid.tileFolderTimestamp('20261027_1500Z')).toBe('20261027_1500Z');
  });
});

describe('buildTileUrlTemplate', () => {
  const run = 'runs/20261027_1500/tiles/{timestamp}/{z}/{x}/{y}.bin';

  it('joins the relative index template onto the provider root', () => {
    expect(tilePyramid.buildTileUrlTemplate('https://hrrr.b-cdn.net/', run, '20261027_1500Z'))
      .toBe('https://hrrr.b-cdn.net/runs/20261027_1500/tiles/20261027_1500Z/{z}/{x}/{y}.bin');
  });

  it('tolerates a root without trailing slash and a template with leading slash', () => {
    expect(
      tilePyramid.buildTileUrlTemplate('https://example.test', '/tiles/{timestamp}/{z}/{x}/{y}.bin', '20990706_12Z')
    ).toBe('https://example.test/tiles/20990706_12Z/{z}/{x}/{y}.bin');
  });

  it('substitutes every placeholder', () => {
    expect(
      tilePyramid.buildTileUrlTemplate('https://example.test/', '{timestamp}/t/{timestamp}/{z}/{x}/{y}.bin', '20990706_12Z')
    ).toBe('https://example.test/20990706_12Z/t/20990706_12Z/{z}/{x}/{y}.bin');
  });

  it('keeps an absolute template untouched', () => {
    expect(
      tilePyramid.buildTileUrlTemplate('https://example.test/', 'https://cdn.test/{timestamp}/{z}/{x}/{y}.bin', '20990706_12Z')
    ).toBe('https://cdn.test/20990706_12Z/{z}/{x}/{y}.bin');
  });
});

describe('expandTileUrl', () => {
  it('fills the tile placeholders', () => {
    expect(tilePyramid.expandTileUrl('https://cdn.test/runs/r/tiles/20990706_12/{z}/{x}/{y}.bin', 7, 42, 55))
      .toBe('https://cdn.test/runs/r/tiles/20990706_12/7/42/55.bin');
  });

  it('falls back to the fixed layout for a plain pyramid base', () => {
    expect(tilePyramid.expandTileUrl('https://example.test/tiles/20261007_1700Z', 5, 10, 13))
      .toBe('https://example.test/tiles/20261007_1700Z/5/10/13.bin');
  });
});

describe('isTileCovered', () => {
  const coverage: TileCoverage = {
    '7': { '16': [[44, 46]], '17': [[43, 48], [40, 41]] }
  };

  it('treats a missing coverage block as covered', () => {
    expect(tilePyramid.isTileCovered(null, 7, 16, 44)).toBe(true);
  });

  it('treats an undescribed level as covered', () => {
    expect(tilePyramid.isTileCovered(coverage, 5, 4, 10)).toBe(true);
  });

  it('rejects a column the level does not list', () => {
    expect(tilePyramid.isTileCovered(coverage, 7, 18, 44)).toBe(false);
  });

  it('accepts rows inside any listed range', () => {
    expect(tilePyramid.isTileCovered(coverage, 7, 16, 44)).toBe(true);
    expect(tilePyramid.isTileCovered(coverage, 7, 17, 40)).toBe(true);
  });

  it('rejects rows outside every listed range', () => {
    expect(tilePyramid.isTileCovered(coverage, 7, 16, 47)).toBe(false);
    expect(tilePyramid.isTileCovered(coverage, 7, 17, 42)).toBe(false);
  });
});
