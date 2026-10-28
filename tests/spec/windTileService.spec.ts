/**
 * Tests for the wind tile decoder of `src/services/windTileService.ts`.
 *
 * The payloads are built here instead of being checked in as binaries: the layout is a contract
 * with the pipeline, so the test documents it explicitly.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as windTileService from '../../src/services/windTileService';

const SENTINEL = -20000;

type TileOptions = {
  rows: number;
  cols: number;
  /** Row-major int16 deltas of the u field (first column of each row absolute). */
  u: number[];
  /** Row-major int16 deltas of the v field. */
  v: number[];
  /** Overrides the `uLength` header field; defaults to the real byte length. */
  uLength?: number;
};

/** Builds a tile payload in the pipeline layout, little-endian. */
function buildTile({ rows, cols, u, v, uLength }: TileOptions): ArrayBuffer {
  const buffer = new ArrayBuffer(32 + u.length * 2 + v.length * 2);
  const view = new DataView(buffer);

  view.setFloat32(0, -134.096114, true); // originLng
  view.setFloat32(4, 21.138, true); // originLat
  view.setFloat32(8, 0.025001, true); // deltaLng
  view.setFloat32(12, 0.025001, true); // deltaLat: positive step, rows run north -> south
  view.setFloat32(16, rows, true);
  view.setFloat32(20, cols, true);

  view.setUint32(24, uLength ?? u.length * 2, true);
  view.setUint32(28, v.length * 2, true);

  u.forEach((delta, index) => view.setInt16(32 + index * 2, delta, true));
  v.forEach((delta, index) => view.setInt16(32 + u.length * 2 + index * 2, delta, true));

  return buffer;
}

/** Stubs `fetch` with one response carrying `buffer`. */
function mockTileResponse(buffer: ArrayBuffer, ok = true, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue({ ok, status, arrayBuffer: async () => buffer });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const TEMPLATE = 'https://cdn.test/runs/r/tiles/20990706_12Z/{z}/{x}/{y}.bin';

describe('windTileService.getTileGrid', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('expands the tile placeholders of the template', async () => {
    const fetchMock = mockTileResponse(buildTile({ rows: 1, cols: 1, u: [1], v: [1] }));

    await windTileService.getTileGrid(TEMPLATE, 7, 42, 55);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://cdn.test/runs/r/tiles/20990706_12Z/7/42/55.bin',
      expect.anything()
    );
  });

  it('reads the geo header', async () => {
    mockTileResponse(buildTile({ rows: 2, cols: 3, u: new Array(6).fill(0), v: new Array(6).fill(0) }));

    const grid = await windTileService.getTileGrid(TEMPLATE, 7, 1, 2);

    expect(grid).not.toBeNull();
    expect(grid!.originLng).toBeCloseTo(-134.096114, 5);
    expect(grid!.originLat).toBeCloseTo(21.138, 5);
    expect(grid!.deltaLng).toBeCloseTo(0.025001, 6);
    expect(grid!.rows).toBe(2);
    expect(grid!.cols).toBe(3);
  });

  it('restarts the accumulator at the first column of every row', async () => {
    mockTileResponse(buildTile({
      rows: 2,
      cols: 3,
      // Row 0: 2, 3, 4 | row 1: 4, 6, 8 (raw steps, scale 0.05 -> 0.1 ... 0.4 m/s)
      u: [2, 1, 1, 4, 2, 2],
      // Row 0: 0, 0, 0 | row 1: 2, 2, 2
      v: [0, 0, 0, 2, 0, 0]
    }));

    const grid = await windTileService.getTileGrid(TEMPLATE, 7, 1, 2);
    const uv = grid!.uv;

    expect(uv).toHaveLength(12);
    expect(uv[0]).toBeCloseTo(0.1, 6); // u row 0
    expect(uv[2]).toBeCloseTo(0.15, 6);
    expect(uv[4]).toBeCloseTo(0.2, 6);
    expect(uv[6]).toBeCloseTo(0.2, 6); // u row 1 restarts at 4
    expect(uv[8]).toBeCloseTo(0.3, 6);
    expect(uv[10]).toBeCloseTo(0.4, 6);
    expect(uv[1]).toBeCloseTo(0, 6); // v row 0
    expect(uv[7]).toBeCloseTo(0.1, 6); // v row 1
    expect(uv[9]).toBeCloseTo(0.1, 6);
  });

  it('turns a masked node into NaN without shifting its neighbours', async () => {
    mockTileResponse(buildTile({
      rows: 1,
      cols: 3,
      // Stored values 3, sentinel, 5 -> deltas 3, -20003, 20005
      u: [3, SENTINEL - 3, 5 - SENTINEL],
      v: [0, 0, 0]
    }));

    const grid = await windTileService.getTileGrid(TEMPLATE, 7, 1, 2);
    const uv = grid!.uv;

    expect(uv[0]).toBeCloseTo(0.15, 6);
    expect(Number.isNaN(uv[2])).toBe(true);
    expect(uv[4]).toBeCloseTo(0.25, 6);
  });

  it('applies a format override instead of the pipeline default', async () => {
    mockTileResponse(buildTile({ rows: 1, cols: 1, u: [10], v: [0] }));

    const grid = await windTileService.getTileGrid(
      TEMPLATE, 7, 1, 2, undefined, { scale: 0.1, sentinel: SENTINEL }
    );

    expect(grid!.uv[0]).toBeCloseTo(1, 6);
  });

  it('rejects a payload whose field length does not match the grid', async () => {
    const buffer = buildTile({ rows: 1, cols: 3, u: [1, 1, 1], v: [1, 1, 1], uLength: 8 });
    mockTileResponse(buffer);

    await expect(windTileService.getTileGrid(TEMPLATE, 7, 1, 2)).resolves.toBeNull();
  });

  it('rejects a truncated payload', async () => {
    const buffer = buildTile({ rows: 1, cols: 3, u: [1, 1, 1], v: [1, 1, 1] });
    mockTileResponse(buffer.slice(0, 32 + 6));

    await expect(windTileService.getTileGrid(TEMPLATE, 7, 1, 2)).resolves.toBeNull();
  });

  it('treats a missing tile as empty instead of an error', async () => {
    mockTileResponse(new ArrayBuffer(0), false, 404);

    await expect(windTileService.getTileGrid(TEMPLATE, 7, 1, 2)).resolves.toBeNull();
  });

  it('returns null when the request was aborted', async () => {
    mockTileResponse(buildTile({ rows: 1, cols: 1, u: [1], v: [1] }));
    const controller = new AbortController();
    controller.abort();

    await expect(windTileService.getTileGrid(TEMPLATE, 7, 1, 2, controller.signal)).resolves.toBeNull();
  });
});

/** 3x3 grid anchored at (0, 10) with 1 deg nodes, wind blowing towards +u. */
function makeGrid(override: Partial<windTileService.WindTileGrid> = {}): windTileService.WindTileGrid {
  const uv = new Float32Array(3 * 3 * 2);
  for (let node = 0; node < 9; node++) {
    uv[node * 2] = 1;
    uv[node * 2 + 1] = 0;
  }

  // `deltaLat` is the positive step the pipeline writes; latitude decreases with the row index.
  return { originLng: 0, originLat: 10, deltaLng: 1, deltaLat: 1, rows: 3, cols: 3, uv, ...override };
}

describe('windTileService.gridToPoints', () => {
  const anchor = { lng: 0, lat: 10 };

  it('emits one point per node on the lattice', () => {
    const points = windTileService.gridToPoints(makeGrid(), 1, anchor);

    expect(points).toHaveLength(9);
    // Rows are walked from the southern end upwards, columns west to east.
    expect(points[0]).toEqual({ position: [0, 8], angle: 270, speed: 1 });
    expect(points[8]?.position).toEqual([2, 10]);
  });

  it('emits only every stride-th node', () => {
    const points = windTileService.gridToPoints(makeGrid(), 2, anchor);

    expect(points).toHaveLength(4);
    expect(points.map((point) => point.position)).toEqual([[0, 8], [2, 8], [0, 10], [2, 10]]);
  });

  it('keeps the phase of the lattice anchor', () => {
    // Anchored one node further east, so the samples move to column 1 - not to columns 0 and 2.
    const points = windTileService.gridToPoints(makeGrid(), 2, { lng: 1, lat: 10 });

    expect(points.map((point) => point.position)).toEqual([[1, 8], [1, 10]]);
  });

  it('skips masked nodes', () => {
    const grid = makeGrid();
    // Node 0 is the north-west corner of the payload.
    grid.uv[0] = Number.NaN;

    const points = windTileService.gridToPoints(grid, 1, anchor);

    expect(points).toHaveLength(8);
    expect(points.some((point) => point.position[0] === 0 && point.position[1] === 10)).toBe(false);
  });

  it('clamps a stride below one', () => {
    expect(windTileService.gridToPoints(makeGrid(), 0, anchor)).toHaveLength(9);
  });
});
