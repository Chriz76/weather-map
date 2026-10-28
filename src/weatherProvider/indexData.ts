import * as parsing from '../utils/parsing';
import type {
  IndexData,
  TileBounds,
  TileCoverage,
  TileCoverageLevel,
  TileFormatInfo,
  TilePyramidInfo,
  TileRowRange
} from '../types';

/** Tile index keys of the pyramid are decimal strings; anything else is dropped. */
const TILE_INDEX_KEY = /^\d+$/;

/** Reads the `bounds` block, dropping the key when any edge is missing. */
function readBounds(value: unknown): TileBounds | null {
  if (!parsing.isObject(value)) return null;

  const west = parsing.toFiniteNumber(value['west']);
  const south = parsing.toFiniteNumber(value['south']);
  const east = parsing.toFiniteNumber(value['east']);
  const north = parsing.toFiniteNumber(value['north']);
  if (west === null || south === null || east === null || north === null) return null;

  return { west, south, east, north };
}

/** Reads the `pyramid` block; unknown keys are dropped. */
function readPyramid(value: unknown): TilePyramidInfo | null {
  if (!parsing.isObject(value)) return null;

  const out: TilePyramidInfo = {};
  const minZoom = parsing.toFiniteNumber(value['min_zoom']);
  const maxZoom = parsing.toFiniteNumber(value['max_zoom']);
  const resolution = parsing.toFiniteNumber(value['resolution_deg']);
  const tileExt = value['tile_ext'];

  if (minZoom !== null) out.min_zoom = minZoom;
  if (maxZoom !== null) out.max_zoom = maxZoom;
  if (resolution !== null) out.resolution_deg = resolution;
  if (parsing.isString(tileExt)) out.tile_ext = tileExt;

  return Object.keys(out).length > 0 ? out : null;
}

/** Reads the `format` block; unknown keys are dropped. */
function readFormat(value: unknown): TileFormatInfo | null {
  if (!parsing.isObject(value)) return null;

  const out: TileFormatInfo = {};
  const id = value['id'];
  const version = parsing.toFiniteNumber(value['version']);
  const encoding = value['encoding'];
  const scale = parsing.toFiniteNumber(value['scale']);
  const sentinel = parsing.toFiniteNumber(value['sentinel']);

  if (parsing.isString(id)) out.id = id;
  if (version !== null) out.version = version;
  if (parsing.isString(encoding)) out.encoding = encoding;
  if (scale !== null) out.scale = scale;
  if (sentinel !== null) out.sentinel = sentinel;

  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Reads the `coverage` block: `{ "<z>": { "<x>": [[yMin, yMax], ...] } }`.
 *
 * Malformed levels, columns and ranges are dropped instead of rejecting the whole block, so a
 * partially broken index still spares most of the requests. Ranges are normalised to
 * `[min, max]`, because the consumer only tests membership.
 */
function readCoverage(value: unknown): TileCoverage | null {
  if (!parsing.isObject(value)) return null;

  const out: TileCoverage = {};
  for (const [zoomKey, levelRaw] of Object.entries(value)) {
    if (!TILE_INDEX_KEY.test(zoomKey) || !parsing.isObject(levelRaw)) continue;

    const level: TileCoverageLevel = {};
    for (const [columnKey, rangesRaw] of Object.entries(levelRaw)) {
      if (!TILE_INDEX_KEY.test(columnKey) || !parsing.isUnknownArray(rangesRaw)) continue;

      const ranges: TileRowRange[] = [];
      for (const rangeRaw of rangesRaw) {
        if (!parsing.isUnknownArray(rangeRaw) || rangeRaw.length < 2) continue;

        const first = parsing.toFiniteNumber(rangeRaw[0]);
        const second = parsing.toFiniteNumber(rangeRaw[1]);
        if (first === null || second === null) continue;

        ranges.push([Math.min(first, second), Math.max(first, second)]);
      }

      if (ranges.length > 0) level[columnKey] = ranges;
    }

    if (Object.keys(level).length > 0) out[zoomKey] = level;
  }

  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Fetches and validates the `<baseUrl>index.json` payload shared by all providers.
 *
 * Only the known index fields are copied over, so unexpected or malformed keys are dropped.
 *
 * The index is the one mutable document of the pipeline - it is rewritten with every model run
 * and polled every 5 minutes - so it is fetched from a fresh URL. That keeps a new run from
 * hiding behind a CDN TTL, which `no-cache` alone cannot guarantee. The tiles are the opposite
 * case: the run is part of their path, so they are immutable and stay cacheable (see
 * `getTileGrid`).
 * @param baseUrl Provider base URL (must end with `/`).
 * @throws When the endpoint responds with a non-OK status.
 */
export async function fetchIndexData(baseUrl: string): Promise<IndexData> {
  const response = await fetch(`${baseUrl}index.json?cb=${Date.now()}`, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`index.json could not be loaded (status: ${response.status})`);

  const json: unknown = await response.json();
  const out: IndexData = {};
  if (!parsing.isObject(json)) return out;

  const generatedAt = json['generated_at'];
  const timestamps = json['available_timestamps'];
  const currentHour = json['current_hour'];
  const apiVersion = json['api_version'];
  const run = json['run'];
  const tilesUrl = json['tiles_url'];
  const bounds = readBounds(json['bounds']);
  const pyramid = readPyramid(json['pyramid']);
  const format = readFormat(json['format']);
  const coverage = readCoverage(json['coverage']);

  if (parsing.isString(generatedAt)) out.generated_at = generatedAt;
  if (parsing.isUnknownArray(timestamps)) out.available_timestamps = timestamps.filter(parsing.isString);
  if (parsing.isString(currentHour)) out.current_hour = currentHour;
  if (parsing.isString(apiVersion)) out.api_version = apiVersion;
  if (parsing.isString(run)) out.run = run;
  if (parsing.isString(tilesUrl)) out.tiles_url = tilesUrl;
  if (bounds) out.bounds = bounds;
  if (pyramid) out.pyramid = pyramid;
  if (format) out.format = format;
  if (coverage) out.coverage = coverage;

  return out;
}
