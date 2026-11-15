/**
 * Tests for the dotted numeric version helpers of `src/utils/version.ts`.
 *
 * These back the `api_version` gate in `src/controllers/actions.ts`, which must only block the app
 * when the server is ahead of the build.
 */
import { describe, expect, it } from 'vitest';
import * as version from '../../src/utils/version';

describe('parse', () => {
  it('splits dotted numeric versions into segments', () => {
    expect(version.parse('1.1.0')).toEqual([1, 1, 0]);
    expect(version.parse('2.0')).toEqual([2, 0]);
    expect(version.parse('10.20.30')).toEqual([10, 20, 30]);
  });

  it('tolerates surrounding whitespace and a v prefix', () => {
    expect(version.parse('  v1.2.3 ')).toEqual([1, 2, 3]);
    expect(version.parse('V1.2.3')).toEqual([1, 2, 3]);
  });

  it('rejects values that are not dotted numeric versions', () => {
    expect(version.parse('')).toBeNull();
    expect(version.parse('abc')).toBeNull();
    expect(version.parse('1.2.3-beta')).toBeNull();
    expect(version.parse('1..2')).toBeNull();
    expect(version.parse('1.2.x')).toBeNull();
  });
});

describe('compare', () => {
  it('ranks segments numerically, not lexically', () => {
    expect(version.compare('1.10.0', '1.9.0')).toBe(1);
    expect(version.compare('1.9.0', '1.10.0')).toBe(-1);
  });

  it('compares major, minor and patch by default', () => {
    expect(version.compare('1.2.0', '1.1.0')).toBe(1);
    expect(version.compare('1.1.1', '1.1.0')).toBe(1);
    expect(version.compare('1.1.0', '1.1.1')).toBe(-1);
    expect(version.compare('1.1.0', '1.1.0')).toBe(0);
    expect(version.compare('2.0.0', '1.99.99')).toBe(1);
  });

  it('treats missing trailing segments as zero', () => {
    expect(version.compare('1.1', '1.1.0')).toBe(0);
    expect(version.compare('1.1.0.1', '1.1.0')).toBe(0);
  });

  it('ignores the patch level at major/minor precision', () => {
    const precision = version.PRECISION_MAJOR_MINOR;
    expect(version.compare('1.1.9', '1.1.0', precision)).toBe(0);
    expect(version.compare('1.1.0', '1.2.0', precision)).toBe(-1);
    expect(version.compare('1.2.0', '1.1.0', precision)).toBe(1);
    expect(version.compare('2.0.0', '1.9.9', precision)).toBe(1);
  });

  it('allows the gate to be forward compatible by signalling unparsable input', () => {
    expect(version.compare('abc', '1.1.0', version.PRECISION_MAJOR_MINOR)).toBeNull();
    expect(version.compare('1.1.0', 'abc', version.PRECISION_MAJOR_MINOR)).toBeNull();
    expect(version.compare('', '', version.PRECISION_MAJOR_MINOR)).toBeNull();
  });
});

describe('precision constants', () => {
  it('keeps the full precision larger than the major/minor one', () => {
    expect(version.PRECISION_FULL).toBeGreaterThan(version.PRECISION_MAJOR_MINOR);
  });
});
