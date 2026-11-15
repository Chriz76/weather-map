/**
 * Dotted numeric version helpers for the `api_version` handshake in `index.json`.
 *
 * Import as a namespace so call sites stay explicit, e.g. `versionUtils.compare(a, b, 2)`.
 */

/** Matches an optional `v` prefix plus dot-separated digits (no pre-release or build metadata). */
const VERSION_PATTERN = /^v?(\d+(?:\.\d+)*)$/i;

/** Compares major, minor and patch. */
export const PRECISION_FULL = 3;

/** Compares major and minor only, treating a patch difference as compatible. */
export const PRECISION_MAJOR_MINOR = 2;

/**
 * Splits a dotted numeric version into its segments.
 * @param value Raw version, e.g. `"1.1.0"` or `"v2.0"`.
 * @returns Numeric segments, or `null` when the value is not a dotted numeric version.
 */
export const parse = (value: string): number[] | null => {
  const match = VERSION_PATTERN.exec(value.trim());
  const digits = match?.[1];
  if (!digits) return null;
  return digits.split('.').map((segment) => Number.parseInt(segment, 10));
};

/**
 * Compares two versions segment by segment, numerically.
 *
 * Compares numbers rather than strings, so `1.10.0` ranks above `1.9.0`. Missing segments count as
 * zero, so `1.1` equals `1.1.0`.
 * @param candidate Version to test, usually the server value.
 * @param reference Version to test against, usually the build's expectation.
 * @param precision Number of leading segments to compare (`PRECISION_MAJOR_MINOR`, `PRECISION_FULL`).
 * @returns `1` when `candidate` is newer, `-1` when it is older, `0` when equal within
 * `precision`, or `null` when either side cannot be parsed.
 */
export const compare = (
  candidate: string,
  reference: string,
  precision: number = PRECISION_FULL
): -1 | 0 | 1 | null => {
  const candidateSegments = parse(candidate);
  const referenceSegments = parse(reference);
  if (!candidateSegments || !referenceSegments) return null;

  const segments = Math.max(1, Math.trunc(precision));
  for (let i = 0; i < segments; i += 1) {
    const diff = (candidateSegments[i] ?? 0) - (referenceSegments[i] ?? 0);
    if (diff > 0) return 1;
    if (diff < 0) return -1;
  }
  return 0;
};
