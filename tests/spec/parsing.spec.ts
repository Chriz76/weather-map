/**
 * TODO: minimal smoke test for src/utils/parsing.ts, added because the module is new.
 * Extend when more coercion helpers are added.
 */
import { describe, expect, it } from 'vitest';
import * as parsing from '../../src/utils/parsing';

describe('parsing utilities', () => {
  it('narrows objects, strings, numbers and arrays', () => {
    expect(parsing.isObject({})).toBe(true);
    expect(parsing.isObject([])).toBe(true);
    expect(parsing.isObject(null)).toBe(false);
    expect(parsing.isObject('a')).toBe(false);

    expect(parsing.isString('a')).toBe(true);
    expect(parsing.isString(1)).toBe(false);

    expect(parsing.isNumber(1)).toBe(true);
    expect(parsing.isNumber('1')).toBe(false);

    expect(parsing.isUnknownArray([])).toBe(true);
    expect(parsing.isUnknownArray('a')).toBe(false);
  });

  it('coerces values to finite numbers', () => {
    expect(parsing.toFiniteNumber(5)).toBe(5);
    expect(parsing.toFiniteNumber('5')).toBe(5);
    expect(parsing.toFiniteNumber('abc')).toBeNull();
    expect(parsing.toFiniteNumber(null)).toBeNull();
    expect(parsing.toFiniteNumber(NaN)).toBeNull();
  });

  it('maps raw series without leaking invalid entries', () => {
    expect(parsing.toNumberOrNullSeries([1, 'x', null])).toEqual([1, null, null]);
    expect(parsing.toNumberOrNullSeries('nope')).toEqual([]);
    expect(parsing.toNumberOrUndefinedSeries([1, 'x', null])).toEqual([1, undefined, undefined]);
    expect(parsing.toDirectionSeries([10, 'x', null])).toEqual([10, undefined, null]);
  });
});
