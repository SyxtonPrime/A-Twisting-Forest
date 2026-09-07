// Two handles with a neck between them: the two-holed torus, as one net.
//
// Each handle is the pentagon from piece.js and the neck is a rectangle, and
// flat they sit edge to edge -- the neck's two ends are the two pentagons'
// rim sides. That is the whole reason the rim has to be a whole side: a
// rectangle can be sewn to a side, and it cannot be sewn to a circle in the
// middle of a sheet.
//
// Which is exactly what act zero takes away. As the rim sinks into the sheet
// the neck has nowhere flat left to be attached, so it lifts off the page and
// arches under. That is not a cheat being covered up; it is the reason the
// two drawings are different drawings, made visible. By the time it matters
// the handles are tubes and the neck is a tube between them, and from there
// on everything is a bend.
//
// The two rims have to be matched up, and simply walking the far one backwards
// is not enough. Reversing a closed walk is a reflection, but it is the
// reflection that fixes wherever the walk happens to start, and that is a
// corner of the hole rather than the axis the two rims actually want to agree
// about. The neck comes out sheared: every ruled line crosses the tube
// diagonally instead of running straight along it.
//
// The two holes face each other, so they agree about the way round the tube
// and disagree about the way round the ring. So the match is made on the
// hole's own coordinates -- keep the one, mirror the other -- and the neck
// runs straight.

import { buildPiece, piecePositions, pieceOverlay, RIM } from './piece.js';
import { rimArc, rimUV } from '../handle.js';
import { phaseAt, THREE_ACT } from './roll.js';

const GRID = [173, 165, 148];
const FRONT = [201, 194, 176];
const BACK = [166, 156, 136];

// How far apart the pieces sit, at each of the three things the net becomes.
// The developed rectangles are the widest the net ever is, since each one is
// 2piR long, and the finished tori are the narrowest.
const APART = { flat: 7.7, dev: 12.4, solid: 4.9 };
const SAG = 3.2;                              // how far under the neck arches
const SPAN = 8;                               // cells along the neck

export function buildChain(opts = {}) {
  const nu = opts.nu || 20, nv = opts.nv || 60;
  const hu = opts.hu || 5, hv = opts.hv || 5;
  const R = opts.R === undefined ? 3 : opts.R;
  const r = opts.r === undefined ? 1 : opts.r;
  const base = { nu, nv, hu, hv, R, r };

  // the left handle's neck leaves to the right, the right handle's to the left
  const pieces = [
    buildPiece({ ...base, face: 0.25 }),
    buildPiece({ ...base, face: -0.25, turn: true }),
  ];

  // ---- one numbering for everything -------------------------------------
  const offset = [];
  let V = 0;
  for (const p of pieces) { offset.push(V); V += p.V; }

  const faces = [];
  pieces.forEach((p, i) => {
    for (let f = 0; f < p.F; f++) {
      faces.push([p.faces[f * 4] + offset[i], p.faces[f * 4 + 1] + offset[i],
                  p.faces[f * 4 + 2] + offset[i], p.faces[f * 4 + 3] + offset[i]]);
    }
  });

  // ---- the neck ----------------------------------------------------------
  const a = rimArc(pieces[0].h, 0).map(v => v + offset[0]);
  const b = rimArc(pieces[1].h, 0).map(v => v + offset[1]);
  const m = a.length;
  const cols = [a];
  for (let s = 1; s < SPAN; s++) {
    const col = [];
    for (let k = 0; k < m; k++) col.push(V++);
    cols.push(col);
  }
  cols.push(mirrorRim(pieces, b));
  for (let s = 0; s + 1 < cols.length; s++) {
    for (let k = 0; k + 1 < m; k++) {
      faces.push([cols[s][k], cols[s][k + 1], cols[s + 1][k + 1], cols[s + 1][k]]);
    }
  }

  const F = faces.length;
  const fa = new Int32Array(F * 4);
  for (let f = 0; f < F; f++) for (let c = 0; c < 4; c++) fa[f * 4 + c] = faces[f][c];
  const rgb = new Uint8Array(F * 3), backRGB = new Uint8Array(F * 3);
  for (let k = 0; k < F; k++) {
    for (let c = 0; c < 3; c++) { rgb[k * 3 + c] = FRONT[c]; backRGB[k * 3 + c] = BACK[c]; }
  }

  return { pieces, offset, cols, m, V, F, faces: fa, rgb, backRGB, seam: [],
           plan: THREE_ACT, R, r, scratch: pieces.map(p => new Float32Array(p.V * 3)) };
}

// The far rim, put in the order that makes the neck run straight: for each
// vertex of the near rim, the vertex of the far one at the same place round
// the tube and the mirrored place round the ring.
function mirrorRim(pieces, far) {
  const A = pieces[0].h, B = pieces[1].h;
  const uvA = rimUV(A, 0), uvB = rimUV(B, 0);
  const at = new Map();
  uvB.forEach(([u, v], i) => at.set(u + ',' + v, i));
  const vA = A.holes[0].v0, vB = B.holes[0].v0, hv = A.hv;
  return uvA.map(([u, v]) => {
    const j = at.get(u + ',' + (vB + hv - (v - vA)));
    return far[j === undefined ? 0 : j];
  });
}

export function chainPositions(chain, t, opts = {}, out) {
  const { pieces, offset, cols, m, V, scratch } = chain;
  const { open, curl, ring } = phaseAt(t, chain.plan);
  const pos = out && out.length === V * 3 ? out : new Float32Array(V * 3);

  // The two pieces move apart as they are drawn out flat and back together as
  // they roll up, so that neither the sheets nor the tori ever run into each
  // other. Act zero is finished before act two starts, so the two terms never
  // fight over the same stretch of the timeline.
  const apart = APART.flat + (APART.dev - APART.flat) * open + (APART.solid - APART.dev) * ring;
  pieces.forEach((p, i) => {
    p.plan = chain.plan;                      // the pieces run the chain's timeline
    const q = piecePositions(p, t, opts, scratch[i]);
    const dx = (i === 0 ? -1 : 1) * apart;
    for (let v = 0; v < p.V; v++) {
      const o = (offset[i] + v) * 3;
      pos[o] = q[v * 3] + dx; pos[o + 1] = q[v * 3 + 1]; pos[o + 2] = q[v * 3 + 2];
    }
  });

  // The neck, ruled between the two rims wherever those have got to, arching
  // under while there is a flat sheet in the way and straightening out as the
  // handles close up into tori.
  const sag = SAG * open * (1 - ring);
  const last = cols.length - 1;
  for (let s = 1; s < last; s++) {
    const f = s / last;
    const dip = -sag * 4 * f * (1 - f);       // a parabola: nothing at either end
    for (let k = 0; k < m; k++) {
      const A = cols[0][k] * 3, B = cols[last][k] * 3, C = cols[s][k] * 3;
      pos[C] = pos[A] + (pos[B] - pos[A]) * f;
      pos[C + 1] = pos[A + 1] + (pos[B + 1] - pos[A + 1]) * f;
      pos[C + 2] = pos[A + 2] + (pos[B + 2] - pos[A + 2]) * f + dip;
    }
  }
  return pos;
}

export function chainOverlay(chain, opts = {}) {
  const grid = [], edges = [];
  chain.pieces.forEach((p, i) => {
    const o = chain.offset[i];
    const over = pieceOverlay(p, opts);
    for (const path of over.grid) grid.push({ ...path, ids: path.ids.map(v => v + o) });
    for (const path of over.edges) edges.push({ ...path, ids: path.ids.map(v => v + o) });
  });
  // the neck, ruled the long way and the short way
  const { cols, m } = chain;
  for (let s = 1; s < cols.length - 1; s += 2) grid.push({ ids: cols[s], rgb: GRID, kind: 'grid' });
  for (let k = 0; k < m; k += Math.max(1, Math.round(m / 8))) {
    grid.push({ ids: cols.map(c => c[k]), rgb: GRID, kind: 'grid' });
  }
  return { grid, edges };
}
