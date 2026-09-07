// The net for the simplest case there is: one rectangle, with both pairs of
// opposite edges to be glued. A grid of quads, and where every one of its
// points has got to at a given moment of the roll.
//
// The mesh is the cut piece and stays cut the whole way through. The two
// columns of vertices at the ends are separate vertices that happen to land on
// the same points once the roll is finished, which is exactly what it means
// for those edges to be glued, and it is why the edges can be drawn as edges
// right up until they meet.

import { rollPoint, phaseAt } from './roll.js';

const FRONT = [201, 194, 176];
const BACK = [166, 156, 136];

export function buildSheet(nx = 56, ny = 28) {
  const id = (i, j) => j * (nx + 1) + i;
  const V = (nx + 1) * (ny + 1);
  const uv = new Float32Array(V * 2);
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      uv[id(i, j) * 2] = i / nx;             // along, the way round the ring
      uv[id(i, j) * 2 + 1] = j / ny;         // across, the way round the tube
    }
  }
  const F = nx * ny;
  const faces = new Int32Array(F * 4);
  let f = 0;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++, f++) {
      // counterclockwise seen from +z, so the renderer can tell the two sides
      // of the sheet apart by which way round the quad comes out on screen
      faces[f * 4] = id(i, j);
      faces[f * 4 + 1] = id(i + 1, j);
      faces[f * 4 + 2] = id(i + 1, j + 1);
      faces[f * 4 + 3] = id(i, j + 1);
    }
  }
  const rgb = new Uint8Array(F * 3), backRGB = new Uint8Array(F * 3);
  for (let k = 0; k < F; k++) {
    for (let c = 0; c < 3; c++) { rgb[k * 3 + c] = FRONT[c]; backRGB[k * 3 + c] = BACK[c]; }
  }
  return { nx, ny, V, F, faces, uv, rgb, backRGB, seam: [], id };
}

// Where every vertex is at time t.
export function sheetPositions(sheet, t, opts = {}, out) {
  const R = opts.R === undefined ? 3 : opts.R;
  const r = opts.r === undefined ? 1 : opts.r;
  const { curl, ring } = phaseAt(t);
  const V = sheet.V;
  const pos = out && out.length === V * 3 ? out : new Float32Array(V * 3);
  const p = [0, 0, 0];
  const halfX = Math.PI * R, halfY = Math.PI * r;
  for (let i = 0; i < V; i++) {
    const x = (sheet.uv[i * 2] * 2 - 1) * halfX;
    const y = (sheet.uv[i * 2 + 1] * 2 - 1) * halfY;
    rollPoint(x, y, R, r, curl, ring, p);
    pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2];
  }
  return pos;
}

// A grid ruled on the sheet, and its four edges coloured by which pair they
// belong to. Everything is given as vertex indices, so it rides the surface as
// it rolls up without being worked out again.
//
// The two edges that meet in act one get one colour and the two that meet in
// act two get another, so the moment each pair closes is something you can
// see rather than something you have to be told.
export const PAIR_A = [42, 127, 122];       // the long edges: glued in act one
export const PAIR_B = [181, 53, 44];        // the ends: glued in act two
const GRID = [173, 165, 148];

export function sheetOverlay(sheet, opts = {}) {
  const { nx, ny, id } = sheet;
  // Step by something that divides the grid, so the last line of the grid is
  // the first one again rather than a stray line a fraction of a cell away.
  const si = divisor(nx, opts.along || 12);
  const sj = divisor(ny, opts.across || 6);
  const grid = [], edges = [];

  for (let i = 0; i <= nx; i += si) {
    const ids = []; for (let j = 0; j <= ny; j++) ids.push(id(i, j));
    grid.push({ ids, rgb: GRID, kind: 'grid' });
  }
  for (let j = 0; j <= ny; j += sj) {
    const ids = []; for (let i = 0; i <= nx; i++) ids.push(id(i, j));
    grid.push({ ids, rgb: GRID, kind: 'grid' });
  }

  const row = j => { const ids = []; for (let i = 0; i <= nx; i++) ids.push(id(i, j)); return ids; };
  const col = i => { const ids = []; for (let j = 0; j <= ny; j++) ids.push(id(i, j)); return ids; };
  edges.push({ ids: row(0), rgb: PAIR_A, wide: true, kind: 'edge' });
  edges.push({ ids: row(ny), rgb: PAIR_A, wide: true, kind: 'edge' });
  edges.push({ ids: col(0), rgb: PAIR_B, wide: true, kind: 'edge' });
  edges.push({ ids: col(nx), rgb: PAIR_B, wide: true, kind: 'edge' });

  return { grid, edges };
}

// The divisor of n that gives closest to `want` steps.
function divisor(n, want) {
  let best = 1;
  for (let d = 1; d <= n; d++) {
    if (n % d === 0 && Math.abs(n / d - want) < Math.abs(n / best - want)) best = d;
  }
  return best;
}
