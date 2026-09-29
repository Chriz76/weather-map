/**
 * Type guards and coercion helpers for untrusted values (network JSON, storage, DOM payloads).
 *
 * Import as a namespace so call sites stay explicit, e.g. `parsing.isObject(value)`.
 */

/** Narrows to a non-null object. */
export const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object';

/** Narrows to a string. */
export const isString = (v: unknown): v is string => typeof v === 'string';

/** Narrows to a number primitive (includes `NaN`, matching `typeof`). */
export const isNumber = (v: unknown): v is number => typeof v === 'number';

/** Narrows to an array without letting `any` leak out of the guard. */
export const isUnknownArray = (v: unknown): v is unknown[] => Array.isArray(v);

/** Converts a value to a finite number, or `null` when it is not numeric. */
export const toFiniteNumber = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Maps a raw series to finite numbers, replacing non-numeric entries with `null`. */
export const toNumberOrNullSeries = (v: unknown): Array<number | null> =>
  isUnknownArray(v) ? v.map((item) => toFiniteNumber(item)) : [];

/** Maps a raw series to numbers, replacing non-numeric entries with `undefined`. */
export const toNumberOrUndefinedSeries = (v: unknown): Array<number | undefined> =>
  isUnknownArray(v) ? v.map((item) => (isNumber(item) ? item : undefined)) : [];

/** Maps a raw direction series, preserving `null` (no data) and `undefined` (invalid). */
export const toDirectionSeries = (v: unknown): Array<number | null | undefined> =>
  isUnknownArray(v) ? v.map((item) => (isNumber(item) ? item : (item === null ? null : undefined))) : [];
