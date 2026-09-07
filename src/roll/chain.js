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
// The right-hand handle is built as a mirror image rather than turned round.
// That is what makes the neck a rectangle. Two holes that face each other agree
// about the way round the tube and disagree about the way round the ring, so
// turning one piece round leaves the rims matched by a mirror in one
// coordinate only -- which sends the slit's cut point to the opposite corner of
// the hole. In space that is only a rotation of a circle and never shows, but
// flat the rim is pinned as an arc with its cut at the two ends of a side, so
// the far edge of the neck folds back on itself. Reflect the piece instead and
// the two holes have the same local axes: the rims match index for index, cut
// lands on cut, and the neck runs straight in both drawings.

import { buildPiece, piecePositions, pieceOverlay, RIM } from './piece.js';
import { rimArc, handleGluings } from '../handle.js';
import { makeSmoother } from './smooth.js';
import { phaseAt, THREE_ACT } from './roll.js';

const GRID = [173, 165, 148];
const FRONT = [201, 194, 176];
const BACK = [166, 156, 136];

// How far apart the pieces sit, at each of the three things the net becomes.
// The developed rectangles are the widest the net ever is, since each one is
// 2piR long, and the finished tori are the narrowest.
const SAG = 3.2;                               // how far under the neck arches

export function buildChain(opts = {}) {
  const nu = opts.nu || 20, nv = opts.nv || 60;
  const hu = opts.hu || 5, hv = opts.hv || 5;
  const R = opts.R === undefined ? 3 : opts.R;
  const r = opts.r === undefined ? 1 : opts.r;
  const base = { nu, nv, hu, hv, R, r };

  // the left handle's neck leaves to the right; the right handle is the same
  // piece reflected, so its neck leaves to the left
  const pieces = [
    buildPiece({ ...base, face: 0.25 }),
    buildPiece({ ...base, face: 0.25, mirror: true }),
  ];

  // How far apart the pieces sit, at each of the three things the net becomes.
  // Flat, far enough that the neck is a little longer than it is wide, which
  // reads as a rectangle rather than as a join; developed, far enough that two
  // sheets each 2piR long do not overlap, which is the widest the net ever is;
  // rolled, close enough that the neck is a neck.
  const apothem = pieces[0].apothem;
  const side = pieces[0].rimSide;                 // the rim side of the pentagon
  const gap = side * 1.6;
  const APART = { flat: (gap + 2 * apothem) / 2, dev: Math.PI * R + 3, solid: R + r + 1.7 };
  // and enough cells along the neck that its grid comes out square, since a
  // long thin cell is what makes a rectangle look like something else
  const span = Math.max(6, Math.min(24, Math.round(gap / (side / (2 * (hu + hv))))));

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
  for (let s = 1; s < span; s++) {
    const col = [];
    for (let k = 0; k < m; k++) col.push(V++);
    cols.push(col);
  }
  cols.push(b);
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

  const mesh = { pieces, offset, cols, m, V, F, faces: fa, rgb, backRGB, seam: [], APART,
                 plan: THREE_ACT, R, r, scratch: pieces.map(p => new Float32Array(p.V * 3)) };

  // Where three pieces are sewn together they meet at a hard corner, and a
  // hard corner is what makes the finished thing read as three pieces rather
  // than as one surface. The smoothing is seeded at the two joins and dies
  // away a few cells into each piece, so nothing else is touched, and it is
  // told about the gluings so it works on the closed surface rather than
  // pulling the cut mesh apart along every seam.
  const merge = [];
  pieces.forEach((p, i) => {
    for (const [x, y] of handleGluings(p.h, false)) merge.push([x + offset[i], y + offset[i]]);
  });
  mesh.smooth = makeSmoother(mesh, { merge, seeds: [...a, ...b], reach: 4 });
  return mesh;
}

export function chainPositions(chain, t, opts = {}, out) {
  const { pieces, offset, cols, m, V, scratch, APART } = chain;
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
  // and once the handles have closed up, take the crease out of the two joins
  chain.smooth(pos, ring);
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
  // as many rings drawn round the neck as the handles have lines across them,
  // so the two grids read as the same grid
  const { cols, m } = chain;
  const ring = Math.max(2, Math.round((cols.length - 1) / 6));
  for (let s = ring; s < cols.length - 1; s += ring) grid.push({ ids: cols[s], rgb: GRID, kind: 'grid' });
  for (let k = 0; k < m; k += Math.max(1, Math.round(m / 8))) {
    grid.push({ ids: cols.map(c => c[k]), rgb: GRID, kind: 'grid' });
  }
  return { grid, edges };
}
