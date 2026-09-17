import { describe, it, expect } from 'vitest';
import { parseUrlParams } from '../../src/utils/url';

describe('parseUrlParams (smoke)', () => {
  it('parses provider and location from window.location.search', () => {
    // Arrange: set a minimal window.location for the parser
    (globalThis as any).window = { location: { search: '?lat=54.4150&lon=11.1022&model=icon-d2', pathname: '/', hash: '' } };

    // Act
    const res = parseUrlParams();

    // Assert
    expect(res.providerId).toBe('icon-d2');
    expect(res.location).toEqual({ lat: 54.415, lng: 11.1022 });
    expect(res.hadParams).toBe(true);
  });

  it('returns nulls when no params present', () => {
    (globalThis as any).window = { location: { search: '', pathname: '/', hash: '' } };
    const res = parseUrlParams();
    expect(res.providerId).toBeNull();
    expect(res.location).toBeNull();
    expect(res.hadParams).toBe(false);
  });
});
