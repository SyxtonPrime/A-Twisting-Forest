// One handle: a pentagon that rolls up into a torus with a disc taken out of
// it. The piece the chain is made of, and the first real test of the roll.
//
// A pentagon a b a^-1 b^-1 c is a torus with a disc gone: glue a to a^-1 and
// b to b^-1 and c is left over as the rim. All five corners of the pentagon
// are the same point of the surface, and c is the circle round it.
//
// The bends are the same two as for the bare rectangle, because the piece is
// the same rectangle with a hole in it. What is new is act zero, and it is
// worth being clear about why it has to be there.
//
// For act one to be a roll rather than a fold, a and a^-1 have to be opposite
// sides, which means drawing the pentagon as the rectangle it really is. But
// then the disc that was taken out is the disc round the corner point, and all
// four corners of the rectangle are that one point, so the hole has to be
// drawn either in four pieces at the four corners or in one piece in the
// middle with a hairline slit out to the edge. Neither of those has the rim as
// a whole side, and a rim that is not a whole side cannot have a cylinder
// sewn to it edge to edge, which is the one thing that makes the whole net lie
// down in one connected piece.
//
// So there are two drawings of the same piece and no bend between them: the
// pentagon, which lies down in one piece with its neighbours, and the
// developed rectangle, which bends up honestly. Act zero is the flat
// re-drawing from one to the other. It stretches, but it never leaves the
// plane, and what it looks like is the notch zipping shut and the rim sinking
// into the middle of the sheet.
//
// After that, acts one and two are exactly the bends the rectangle already
// does, applied to the developed coordinates, with the hole carried along.

import { buildHandle, boundaryLoop, rimArc } from '../handle.js';
import { rollPoint, phaseAt, THREE_ACT } from './roll.js';

const FRONT = [201, 194, 176];
const BACK = [166, 156, 136];
const GRID = [173, 165, 148];
export const PAIR_A = [42, 127, 122];        // the long edges: glued in act one
export const PAIR_B = [181, 53, 44];         // the ends: glued in act two
export const RIM = [194, 138, 27];           // c, which stays a boundary

// `face` is which way round the ring the hole should point once it is rolled
// up, in turns: 0.25 puts it on the +x side, ready for a neck to the right.
//
// `mirror` reflects the whole piece in x, both drawings and the solid, which
// is how the right-hand handle of a chain is made. Reflecting rather than
// turning it round matters: a reflected hole has the same local axes as the
// one it faces, so the two rims match up index for index, the slit's cut point
// on one lands on the cut point of the other, and the neck between them comes
// out an honest rectangle. Turn the piece round instead and the match is a
// mirror in one coordinate only, which sends the cut to the far corner and
// leaves the neck folded back on itself.
export function buildPiece(opts = {}) {
  const nu = opts.nu || 24;                  // round the tube
  const nv = opts.nv || 72;                  // round the ring
  const hu = opts.hu || 6, hv = opts.hv || 6;
  const R = opts.R === undefined ? 3 : opts.R;
  const r = opts.r === undefined ? 1 : opts.r;
  const face = opts.face === undefined ? 0.25 : opts.face;
  const mirror = !!opts.mirror;
  const mx = mirror ? -1 : 1;

  // The hole goes half way round the tube, which act two puts on the outside
  // of the ring, and `face` of the way round the ring.
  const u0 = Math.round(nu / 2 - hu / 2);
  const v0 = Math.round(nv * (0.5 + face) - hv / 2);
  const h = buildHandle({ nu, nv, hu, hv, R, r, rims: 1, u0, v0, aOff: 0, bOff: 0 });

  // ---- the developed drawing: the grid itself ---------------------------
  // u runs round the tube and becomes the way across the sheet; v runs round
  // the ring and becomes the way along it.
  const V = h.V;
  const dev = new Float32Array(V * 2);
  for (let i = 0; i < V; i++) {
    dev[i * 2] = mx * (h.uv[i][1] / nv - 0.5) * 2 * Math.PI * R;
    dev[i * 2 + 1] = (h.uv[i][0] / nu - 0.5) * 2 * Math.PI * r;
  }

  // ---- the faces --------------------------------------------------------
  // The grid is built in (u, v) and drawn in (x, y) = (f(v), g(u)), and
  // swapping the two turns the winding round, so it is turned back here. The
  // renderer tells the two sides of the sheet apart by the winding, and would
  // otherwise show every face inside out. A mirrored piece turns it round once
  // more, so for that one the two cancel and the grid order stands.
  const F = h.F;
  const faces = new Int32Array(F * 4);
  for (let f = 0; f < F; f++) {
    const q = h.faces[f];
    const o = mirror ? [0, 1, 2, 3] : [0, 3, 2, 1];
    for (let c = 0; c < 4; c++) faces[f * 4 + c] = q[o[c]];
  }
  const rgb = new Uint8Array(F * 3), backRGB = new Uint8Array(F * 3);
  for (let k = 0; k < F; k++) {
    for (let c = 0; c < 3; c++) { rgb[k * 3 + c] = FRONT[c]; backRGB[k * 3 + c] = BACK[c]; }
  }

  const rim = rimArc(h, 0);
  const { xy: pent, rad: pentRad } = pentagonLayout(h, rim, R, r, mx);

  return { h, nu, nv, hu, hv, R, r, V, F, faces, rgb, backRGB, seam: [],
           dev, pent, pentRad, rim, mirror, plan: THREE_ACT, side: -1 };
}

// Where every vertex is at time t: the flat drawing interpolated by act zero,
// then bent by acts one and two. Because acts one and two are the identity
// while act zero is running, and act zero is finished before they start, the
// two can simply be composed and there is no case to split on.
export function piecePositions(piece, t, opts = {}, out) {
  const R = opts.R === undefined ? piece.R : opts.R;
  const r = opts.r === undefined ? piece.r : opts.r;
  const { open, curl, ring } = phaseAt(t, piece.plan);
  const { V, dev, pent, side } = piece;
  const pos = out && out.length === V * 3 ? out : new Float32Array(V * 3);
  const p = [0, 0, 0];
  const sx = R / piece.R, sy = r / piece.r;
  for (let i = 0; i < V; i++) {
    const px = pent[i * 2], py = pent[i * 2 + 1];
    const x = (px + (dev[i * 2] - px) * open) * sx;
    const y = (py + (dev[i * 2 + 1] - py) * open) * sy;
    rollPoint(x, y, R, r, curl, ring, p, side);
    pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2];
  }
  return pos;
}

// The grid ruled on the piece, the two pairs of edges that get glued, and the
// rim, which does not. A line is cut into runs wherever the hole took a vertex
// out, so nothing is ever drawn straight across the hole.
export function pieceOverlay(piece, opts = {}) {
  const { h, nu, nv } = piece;
  const si = divisor(nu, opts.across || 6), sj = divisor(nv, opts.along || 16);
  const grid = [], edges = [];
  const add = (into, ids, rgb, extra) => {
    for (const run of runs(ids)) if (run.length > 1) into.push({ ids: run, rgb, ...extra });
  };
  for (let u = 0; u <= nu; u += si) {
    const ids = []; for (let v = 0; v <= nv; v++) ids.push(h.at(u, v));
    add(grid, ids, GRID, { kind: 'grid' });
  }
  for (let v = 0; v <= nv; v += sj) {
    const ids = []; for (let u = 0; u <= nu; u++) ids.push(h.at(u, v));
    add(grid, ids, GRID, { kind: 'grid' });
  }
  const col = u => { const ids = []; for (let v = 0; v <= nv; v++) ids.push(h.at(u, v)); return ids; };
  const row = v => { const ids = []; for (let u = 0; u <= nu; u++) ids.push(h.at(u, v)); return ids; };
  add(edges, col(0), PAIR_A, { wide: true, kind: 'edge' });
  add(edges, col(nu), PAIR_A, { wide: true, kind: 'edge' });
  add(edges, row(0), PAIR_B, { wide: true, kind: 'edge' });
  add(edges, row(nv), PAIR_B, { wide: true, kind: 'edge' });
  edges.push({ ids: piece.rim, rgb: RIM, wide: true, kind: 'rim' });
  return { grid, edges };
}

function runs(ids) {
  const out = [];
  let cur = [];
  for (const v of ids) {
    if (v < 0) { if (cur.length) out.push(cur); cur = []; }
    else cur.push(v);
  }
  if (cur.length) out.push(cur);
  return out;
}

function divisor(n, want) {
  let best = 1;
  for (let d = 1; d <= n; d++) {
    if (n % d === 0 && Math.abs(n / d - want) < Math.abs(n / best - want)) best = d;
  }
  return best;
}

// ---- the pentagon --------------------------------------------------------

// The other drawing. The rim is pinned to one whole side of a convex pentagon
// and the rest of the boundary is spread round the other four, and then every
// inside vertex settles at the average of its neighbours. That is Tutte's
// embedding, and its virtue is that a convex boundary always gives a proper
// drawing, with nothing folded over to find afterwards.
//
// The pentagon is sized to have about the area of the sheet it will become,
// so act zero is a change of shape rather than a change of scale.
function pentagonLayout(h, rim, R, r, mx) {
  const area = 4 * Math.PI * Math.PI * R * r;
  const rad = Math.sqrt(area / (2.5 * Math.sin(2 * Math.PI / 5)));
  const P = [];
  for (let i = 0; i < 5; i++) {
    // side 0 is the rim, and it faces +x -- or -x once the whole drawing is
    // reflected, which is what a piece whose neighbour is on its left gets.
    const a = -Math.PI / 5 + (i / 5) * 2 * Math.PI;
    P.push([mx * Math.cos(a) * rad, Math.sin(a) * rad]);
  }

  const loop = boundaryLoop(h);
  const onRim = new Set(rim);
  const pinned = new Map();
  // Cut the boundary walk into the stretch that is the rim and the stretch
  // that is not. The walk is a cycle and may well start in the middle of the
  // rim, so the start of the rim has to be found as the first rim vertex whose
  // predecessor is not one -- taking the first rim vertex in the list instead
  // leaves the beginning of the rim stranded at the far end of the walk, to be
  // pinned to a side it does not belong on.
  const N = loop.length;
  let at = 0;
  for (let i = 0; i < N; i++) {
    if (onRim.has(loop[i]) && !onRim.has(loop[(i - 1 + N) % N])) { at = i; break; }
  }
  const walk = loop.slice(at).concat(loop.slice(0, at));
  const head = [], tail = [];
  let inRim = true;
  for (const v of walk) {
    if (inRim && onRim.has(v)) head.push(v);
    else { inRim = false; tail.push(v); }
  }
  along([P[0], P[1]], head.length).forEach((pt, i) => pinned.set(head[i], pt));
  along([P[1], P[2], P[3], P[4], P[0]], tail.length + 2)
    .slice(1, -1).forEach((pt, i) => pinned.set(tail[i], pt));

  return { xy: tutte(h, pinned, 2600), rad };
}

// Every vertex of the boundary, for the tests: the drawing is only a drawing
// if all of them are pinned, and a stray one gets dragged into the middle.
export function boundaryOf(piece) {
  return boundaryLoop(piece.h);
}

// `count` points spread evenly along a polyline by arc length.
function along(pts, count) {
  const seg = [];
  let total = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const d = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    seg.push(d); total += d;
  }
  const out = [];
  for (let n = 0; n < count; n++) {
    let want = (count === 1 ? 0.5 : n / (count - 1)) * total, i = 0;
    while (i < seg.length - 1 && want > seg[i]) { want -= seg[i]; i++; }
    const f = seg[i] ? want / seg[i] : 0;
    out.push([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f,
              pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f]);
  }
  return out;
}

function tutte(h, pinned, iters) {
  const nbr = new Map();
  for (const f of h.faces) {
    for (let i = 0; i < 4; i++) {
      const a = f[i], b = f[(i + 1) % 4];
      if (!nbr.has(a)) nbr.set(a, new Set());
      if (!nbr.has(b)) nbr.set(b, new Set());
      nbr.get(a).add(b); nbr.get(b).add(a);
    }
  }
  const xy = new Float32Array(h.V * 2);
  for (const [v, p] of pinned) { xy[v * 2] = p[0]; xy[v * 2 + 1] = p[1]; }
  for (let it = 0; it < iters; it++) {
    for (let v = 0; v < h.V; v++) {
      if (pinned.has(v)) continue;
      const ns = nbr.get(v);
      if (!ns || !ns.size) continue;
      let x = 0, y = 0;
      for (const w of ns) { x += xy[w * 2]; y += xy[w * 2 + 1]; }
      xy[v * 2] = x / ns.size; xy[v * 2 + 1] = y / ns.size;
    }
  }
  return xy;
}
