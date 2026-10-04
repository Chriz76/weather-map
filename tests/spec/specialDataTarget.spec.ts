/**
 * TODO: minimal smoke test for src/utils/specialDataTarget.ts, added because the module is new.
 */
import { describe, expect, it } from 'vitest';
import type { Map as LeafletMap } from 'leaflet';
import { SPECIAL_DATA_MIN_ZOOM, SPECIAL_DATA_TARGET, isSpecialDataTargetVisible } from '../../src/utils/specialDataTarget';

function createMap(zoom: number, contains: boolean): LeafletMap {
  return {
    getZoom: () => zoom,
    getBounds: () => ({ contains: () => contains })
  } as unknown as LeafletMap;
}

describe('specialDataTarget', () => {
  it('exposes the documented target coordinates', () => {
    expect(SPECIAL_DATA_TARGET).toEqual({ lat: 47.6506, lng: 11.3365 });
  });

  it('hides the target below the minimum zoom', () => {
    expect(isSpecialDataTargetVisible(createMap(SPECIAL_DATA_MIN_ZOOM - 1, true))).toBe(false);
  });

  it('shows the target at the minimum zoom when it is in the viewport', () => {
    expect(isSpecialDataTargetVisible(createMap(SPECIAL_DATA_MIN_ZOOM, true))).toBe(true);
  });

  it('hides the target when it is outside the viewport', () => {
    expect(isSpecialDataTargetVisible(createMap(SPECIAL_DATA_MIN_ZOOM + 5, false))).toBe(false);
  });
});
