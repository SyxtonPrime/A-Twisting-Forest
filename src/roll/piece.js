// One handle: a polygon that rolls up into a torus with discs taken out of it.
//
// A pentagon a b a^-1 b^-1 c is a torus with one disc gone: glue a to a^-1 and
// b to b^-1 and c is left over as the rim. All five corners of the pentagon
// are the same point of the surface, and c is the circle round it. Every rim
// after the first is another side and another disc, so a handle with k necks
// on it is a (4 + k)-gon: a square is a closed torus with nothing hanging off
// it, a pentagon has one neck, a hexagon two, and so on. The number of sides
// is the number of neighbours plus four, which is the whole of the bookkeeping.
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
  const k = opts.rims === undefined ? 1 : opts.rims;
  const mirror = !!opts.mirror;
  const mx = mirror ? -1 : 1;
  const n = 4 + k;                           // sides of the polygon it is drawn as
  const aspect = opts.aspect === undefined ? 1 : opts.aspect;

  // Which corner of the sheet each slit is sent to, and so which side of the
  // polygon each rim takes.
  //
  // The boundary walk meets the mouths in slot order and crosses one whole
  // edge of the sheet for every slot it skips between two of them, so the side
  // a rim lands on is not an even share of the polygon: it is one further round
  // than the last, plus one for each empty corner in between. With four rims
  // that is every other side; with two, opposite sides; with one, one side.
  //
  // Slots run the other way from rim indices because the walk meets the rims in
  // descending order -- see `polygonLayout`, which pins them that way round.
  const slot = [];
  for (let j = 0; j < k; j++) slot.push(Math.round(((k - 1 - j) * 4) / k) % 4);
  const sides = new Array(k).fill(0);
  for (let j = k - 2; j >= 0; j--) {
    const gap = (((slot[j] - slot[j + 1]) % 4) + 4) % 4;
    sides[j] = (((sides[j + 1] - 1 - gap) % n) + n) % n;
  }
  // Every polygon is drawn with the same side length, whatever its number of
  // sides. It has to be: a rim side stands for the circle round a hole, every
  // hole is the same size, and two rim sides sewn to the same neck have to be
  // the same length or the neck comes out a trapezium. The length is the one
  // that makes a pentagon about as much paper as the sheet it stands for.
  const rad = edgeFor(R, r) / (2 * Math.sin(Math.PI / n));

  // Where each hole goes round the ring. The flat drawing and the finished
  // torus have to agree about which way a rim faces, and they do exactly when
  // phi = alpha + pi/2: the two are the same direction, one seen in the page
  // and one seen in the plane the tori end up lying in. Reflecting the piece
  // turns the ring the other way, which is what the mx does.
  //
  // The whole polygon is then turned so that the seam of the sheet -- the edge
  // the two ends of the ring meet along -- lands in the gap between the last
  // rim and the first. A hole sitting on the seam would be cut in half by it,
  // and the wrap in the rows has to fall there and nowhere else.
  // ...and the extra half turn is because the developed sheet runs from -piR to
  // +piR, so the row a hole sits on is half a ring away from the angle it
  // stands at. Leave it out and every neighbour is placed on the wrong side of
  // its parent, which is invisible flat and folds the whole thing into itself
  // the moment the rings close.
  const HALF = Math.PI;
  const base = sides.map(sd => ((sd + 0.5) * 2 * Math.PI) / n - Math.PI / n);
  const turn = k ? Math.PI / 2 - seam(base) : 0;
  const first = -Math.PI / n + turn;
  const P = [];
  for (let i = 0; i < n; i++) {
    const a = first + (i / n) * 2 * Math.PI;
    P.push([mx * Math.cos(a) * rad * aspect, (Math.sin(a) * rad) / aspect]);
  }
  const mid = sides.map(sd => {
    const a = P[sd], b = P[(sd + 1) % n];
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  });
  const rimDir = mid.map(m => Math.atan2(m[1], m[0]));
  const rimReach = mid.map(m => Math.hypot(m[0], m[1]));
  // `edge` and not `side`: the piece already calls the direction act two bends
  // in its `side`, and one of them silently won.
  const edge2 = Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1]);

  // and so, the row of the grid each hole sits on. The seam was picked to put
  // the wrap in the gap between the last rim and the first, so these come out
  // up the sheet in rim order -- which is what the slots need, since a slit
  // running down to v = 0 has to sit below the one sharing its lane.
  const u0 = Math.round(nu / 2 - hu / 2);
  const rows = rimDir.map(a => {
    const phi = wrap(mx * (a + Math.PI / 2) + HALF);
    return Math.round((nv * phi) / (2 * Math.PI) - hv / 2);
  });
  const h = buildHandle({ nu, nv, hu, hv, R, r, rims: k, u0, rows, slots: slot,
                          aOff: 0, bOff: 0 });

  // ---- the developed drawing: the grid itself ---------------------------
  // u runs round the tube and becomes the way across the sheet; v runs round
  // the ring and becomes the way along it.
  const V = h.V;
  const dev = new Float32Array(V * 2);
  for (let i = 0; i < V; i++) {
    dev[i * 2] = (h.uv[i][1] / nv - 0.5) * 2 * Math.PI * R;
    dev[i * 2 + 1] = (h.uv[i][0] / nu - 0.5) * 2 * Math.PI * r;
  }
  // The holes are cut out of a grid, so they start life rectangles of cells. A
  // disc is what is meant to have been taken out, so each rim is moved onto a
  // circle and the grid around it eased to suit. Done before the reflection,
  // so two handles sewn together agree about it exactly.
  for (const hole of h.holes) {
    roundTheHole(dev, V, {
      cx: ((hole.v0 + hv / 2) / nv - 0.5) * 2 * Math.PI * R,
      cy: ((u0 + hu / 2) / nu - 0.5) * 2 * Math.PI * r,
      a: (hv / nv) * Math.PI * R, b: (hu / nu) * Math.PI * r,
      halfX: Math.PI * R, halfY: Math.PI * r,
    });
  }
  if (mirror) for (let i = 0; i < V; i++) dev[i * 2] = -dev[i * 2];

  // ---- the faces --------------------------------------------------------
  // The grid is built in (u, v) and drawn in (x, y) = (f(v), g(u)), and
  // swapping the two turns the winding round, so it is turned back here. The
  // renderer tells the two sides of the sheet apart by the winding, and would
  // otherwise show every face inside out. A mirrored piece turns it round once
  // more, so for that one the two cancel and the grid order stands.
  const F = h.F;
  const faces = new Int32Array(F * 4);
  const wind = mirror ? [0, 1, 2, 3] : [0, 3, 2, 1];
  for (let f = 0; f < F; f++) {
    const q = h.faces[f];
    for (let c = 0; c < 4; c++) faces[f * 4 + c] = q[wind[c]];
  }
  const rgb = new Uint8Array(F * 3), backRGB = new Uint8Array(F * 3);
  for (let i = 0; i < F; i++) {
    for (let c = 0; c < 3; c++) { rgb[i * 3 + c] = FRONT[c]; backRGB[i * 3 + c] = BACK[c]; }
  }

  const rims = h.holes.map((_, i) => rimArc(h, i));
  const flat = polygonLayout(h, rims, sides, P, n, dev);

  // How far the developed sheet reaches out behind each rim. That is what says
  // how far apart two pieces have to be when they are drawn out flat, which is
  // the widest the net ever is, since a sheet is 2piR long and its rim is
  // somewhere in the middle of it.
  // and it is measured as a plain distance rather than along the way the
  // neighbour lies, because the sheet is three times longer than it is deep and
  // whichever way it is turned it sticks out sideways by most of that
  const behind = rims.map(arc => {
    let cx = 0, cy = 0;
    for (const v of arc) { cx += dev[v * 2]; cy += dev[v * 2 + 1]; }
    cx /= arc.length; cy /= arc.length;
    let far = 0;
    for (let i = 0; i < V; i++) {
      far = Math.max(far, Math.hypot(dev[i * 2] - cx, dev[i * 2 + 1] - cy));
    }
    return far;
  });

  return { kind: 'handle', h, nu, nv, hu, hv, R, r, k, n, V, F, faces, rgb, backRGB, seam: [],
           dev, pent: flat, corners: P, rims, rimDir, rimReach, behind, edge: edge2, sides, mirror,
           plan: THREE_ACT, side: -1 };
}

// Where the seam of the sheet goes: in the gap between the last rim and the
// first, so that the wrap in the row numbers falls there and nowhere else, and
// the rows come out in rim order all the way up. Anywhere else and a cyclic
// order that looks right comes out linearly wrong, which the slots would then
// route across each other. One rim, and it goes opposite that one.
//
// The angle returned is where the seam sits among the polygon's own side
// directions; the caller turns the polygon by minus that, and takes off the
// further quarter turn between a rim's heading in the page and its heading
// round the ring.
function seam(base) {
  const last = base[base.length - 1];
  const gap = base.length > 1 ? wrap(base[0] - last) : 2 * Math.PI;
  return last + gap / 2;
}

const wrap = a => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

// The side every polygon is drawn with, whatever its number of sides, and the
// length of every rim: it is the one that makes a pentagon about as much paper
// as the sheet it stands for. A cap has to know it too, since its rim is sewn
// to the same necks.
export function edgeFor(R, r) {
  return Math.sqrt((4 * Math.PI * Math.PI * R * r) / 1.7205);
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

// Move the hole's rim onto a circle, and ease the grid out to a few hole
// widths away so nothing kinks. A point is placed by how far it is round the
// rectangle's perimeter rather than by which way it lies from the centre: the
// rim walks the perimeter in equal steps, so going by perimeter puts its
// vertices evenly round the circle, and going by direction would bunch them at
// the corners.
function roundTheHole(dev, V, { cx, cy, a, b, halfX, halfY }) {
  const rho = Math.sqrt(a * b) * 1.04;
  // The easing must not reach the edges of the sheet. Those edges are glued to
  // each other, and a vertex on one side moved by an amount the vertex on the
  // other side is not opens the surface along the seam when it closes up.
  const room = Math.min((halfY - Math.abs(cy)) / b, (halfX - Math.abs(cx)) / a) * 0.95;
  const OUT = Math.min(3.2, room);
  if (OUT < 1.3) return;                     // no room to ease it: leave it square
  const P = 4 * (a + b);
  const phase = Math.atan2(-b, a);           // so the walk starts where it starts
  for (let i = 0; i < V; i++) {
    const dx = dev[i * 2] - cx, dy = dev[i * 2 + 1] - cy;
    const t = Math.max(Math.abs(dx) / a, Math.abs(dy) / b);
    if (t < 1e-9 || t >= OUT) continue;
    const qx = dx / t, qy = dy / t;          // where the ray leaves the rectangle
    let d;
    if (qx >= a - 1e-9) d = qy + b;                            // right, upwards
    else if (qy >= b - 1e-9) d = 2 * b + (a - qx);             // top, leftwards
    else if (qx <= -a + 1e-9) d = 2 * b + 2 * a + (b - qy);    // left, downwards
    else d = 4 * b + 2 * a + (qx + a);                         // bottom, rightwards
    const ang = phase + (2 * Math.PI * d) / P;
    const e = t <= 1 ? 1 : 1 - smoothstep((t - 1) / (OUT - 1));
    dev[i * 2] += (rho * Math.cos(ang) - qx) * e;
    dev[i * 2 + 1] += (rho * Math.sin(ang) - qy) * e;
  }
}

const smoothstep = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

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
  // A line that crosses a slit meets two vertices where it does, not one: the
  // two lips, which are the same point of the surface but are yards apart in
  // the flat drawing. Taking either one and carrying straight on draws a line
  // clean across the piece, from one end of a rim to the other, that is not an
  // edge of anything. So the line stops at one lip and starts again at the
  // other. A column meets a slit's legs along the rows and a row meets the lane
  // it runs out along, and `h.cross` says which lip is on which side.
  const stop = (cross, u, v) => {
    const k = u + ',' + v, s = cross.get(k);
    if (s === undefined) return [h.at(u, v)];
    const lip = h.lower.get(k), from = h.at(u, v);
    return s > 0 ? [from, -1, lip] : [lip, -1, from];
  };
  const col = u => {
    const ids = [];
    for (let v = 0; v <= nv; v++) ids.push(...stop(h.cross.col, u, v));
    return ids;
  };
  const row = v => {
    const ids = [];
    for (let u = 0; u <= nu; u++) ids.push(...stop(h.cross.row, u, v));
    return ids;
  };
  for (let u = 0; u <= nu; u += si) add(grid, col(u), GRID, { kind: 'grid' });
  for (let v = 0; v <= nv; v += sj) add(grid, row(v), GRID, { kind: 'grid' });
  // `glue` is the act that closes each pair up, so the colour can be let go of
  // once the edge it marked has stopped being an edge
  add(edges, col(0), PAIR_A, { wide: true, kind: 'edge', glue: 'curl' });
  add(edges, col(nu), PAIR_A, { wide: true, kind: 'edge', glue: 'curl' });
  add(edges, row(0), PAIR_B, { wide: true, kind: 'edge', glue: 'ring' });
  add(edges, row(nv), PAIR_B, { wide: true, kind: 'edge', glue: 'ring' });
  for (const arc of piece.rims) {
    edges.push({ ids: arc, rgb: RIM, wide: true, kind: 'rim', glue: 'ring' });
  }
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
// The other drawing. Each rim is pinned to a whole side of a convex polygon and
// everything else is spread round the sides in between, and then the inside is
// relaxed to fit. Positions on the polygon are given as a distance round its
// perimeter, measured in sides, so side s runs from s to s + 1 and a free
// stretch between two rims is just the interval between them.
//
// The walk round the boundary of the cut piece is turned the right way round
// first, since which way it comes out of the mesh is an accident. Then it is
// pinned going one way and one way only. Pin it the other way and the boundary
// crosses itself, Tutte's guarantee -- the one thing that makes this a drawing
// at all -- is gone, and every rim is laid along its side backwards, which
// leaves the necks folded into bowties.
//
// It has to be the same way round for a piece and its reflection, or a neck
// between the two is sheared. It is: the mesh of a piece does not depend on
// its handedness at all -- the same holes on the same rows, cut the same way --
// so the walk comes out the same, and only the drawing it is pinned to is
// reflected.
function polygonLayout(h, rims, sides, P, n, dev) {
  const loop = orient(boundaryLoop(h), h);
  const N = loop.length;
  const k = rims.length;
  const which = new Map();
  rims.forEach((arc, j) => { for (const v of arc) which.set(v, j); });

  const pinned = new Map();
  const at = t => {
    const u = ((t % n) + n) % n;
    const i = Math.floor(u), f = u - i;
    const a = P[i % n], b = P[(i + 1) % n];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  };
  // What share of the polygon each stretch of the boundary is due.
  //
  // Not one share per vertex, and not one per unit of length either: by which
  // edge of the sheet it is on. A whole edge is due a whole side, a scrap left
  // at the end of one is due a cell's worth, and the two lips of a slit are due
  // nothing at all, because they are the same points of the sheet and the
  // drawing has them lying on top of each other. Share it out by count and the
  // lips -- which can be half the length of the walk -- swallow the edges;
  // share it by length and the four edges come out uneven, since the sheet is
  // three times longer than it is deep, while the polygon's sides are equal.
  //
  // The lips are then given a sliver of what is left over rather than exactly
  // nothing, since a run of vertices pinned at one point is a fan of degenerate
  // cells, and Tutte would have nothing to hold them apart with.
  const LIP = 0.1;
  const due = v => {
    const [u, w] = h.uv[v];
    return (u === 0 || u === h.nu ? 1 / h.nv : 0) + (w === 0 || w === h.nv ? 1 / h.nu : 0);
  };
  const spread = (list, t0, t1) => {
    if (!list.length) return;
    const w = list.map(due);
    const paid = w.reduce((a, b) => a + b, 0);
    const lips = w.filter(x => !x).length;
    const sliver = lips ? (paid ? (paid * LIP) / lips : 1 / lips) : 0;
    let total = 0;
    for (let i = 0; i < w.length; i++) { w[i] = w[i] || sliver; total += w[i]; }
    let acc = 0;
    for (let i = 0; i < list.length; i++) {
      acc += w[i] / 2;
      pinned.set(list[i], at(t0 + (t1 - t0) * (acc / total)));
      acc += w[i] / 2;
    }
  };

  if (!k) {                                  // a closed torus: nothing to pin to
    spread(loop, 0, n);
    return finish(h, pinned, dev);
  }

  // start the walk at the first vertex of some rim
  let from = 0;
  for (let i = 0; i < N; i++) {
    const j = which.get(loop[i]);
    if (j !== undefined && which.get(loop[(i - 1 + N) % N]) !== j) { from = i; break; }
  }
  const walk = loop.slice(from).concat(loop.slice(0, from));
  const runs = [];
  let cur = { rim: which.get(walk[0]), list: [] };
  for (const v of walk) {
    const j = which.get(v);
    if (j !== cur.rim) { runs.push(cur); cur = { rim: j, list: [] }; }
    cur.list.push(v);
  }
  runs.push(cur);

  // Which way round the polygon the walk is going: down, since `orient` has
  // settled which way the walk itself runs and the slots were handed out to
  // suit. So this only checks the answer rather than working it out. With one
  // rim or two there is nothing to check, since a step of one is a step of one
  // whichever way round two things are.
  const seen = runs.filter(x => x.rim !== undefined).map(x => x.rim);
  const dir = -1;
  if (seen.length > 2 && (seen[1] - seen[0] + k) % k === 1) {
    throw new Error('the boundary walk meets the rims the other way round');
  }
  // the rim is pinned to its side, walked in whichever direction the walk is
  // going, and everything between two rims fills the gap between their sides
  const startOf = j => (dir > 0 ? sides[j] : sides[j] + 1);
  const endOf = j => (dir > 0 ? sides[j] + 1 : sides[j]);
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    if (run.rim !== undefined) {
      const a = startOf(run.rim), b = endOf(run.rim);
      alongRange([at(a), at(b)], run.list.length, 0, 1)
        .forEach((pt, m) => pinned.set(run.list[m], pt));
      continue;
    }
    const prev = runs[(i - 1 + runs.length) % runs.length].rim;
    const next = runs[(i + 1) % runs.length].rim;
    if (prev === undefined || next === undefined) {   // one rim: all the way round
      spread(run.list, endOf(seen[0]), endOf(seen[0]) + dir * n);
      continue;
    }
    let a = endOf(prev), b = startOf(next);
    while (dir > 0 ? b <= a : b >= a) b += dir * n;
    spread(run.list, a, b);
  }
  return finish(h, pinned, dev);
}

// Every vertex of the boundary, for the tests: the drawing is only a drawing
// if all of them are pinned, and a stray one gets dragged into the middle.
export function boundaryOf(piece) {
  return boundaryLoop(piece.h);
}

// Which way round the boundary walk goes is an accident of the mesh -- it
// starts wherever the first vertex happened to land -- and the layout has to
// know, since it pins the walk to the polygon in one particular direction.
// So it is settled here, by the sign of the area the walk encloses in the
// grid's own coordinates. The slits enclose nothing, being walked up one lip
// and back down the other, so what is left is the sheet, and its sign says
// which way round the whole thing went.
function orient(loop, h) {
  let area = 0;
  for (let i = 0; i < loop.length; i++) {
    const a = h.uv[loop[i]], b = h.uv[loop[(i + 1) % loop.length]];
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area > 0 ? loop.slice().reverse() : loop;
}

function finish(h, pinned, dev) {
  // Tutte first, because it cannot fold and so is a safe place to start from,
  // and then relaxed towards the shape of the sheet it stands for.
  return arap(h, pinned, dev, tutte(h, pinned, 900));
}

// `count` points spread evenly along the stretch of a polyline between two
// fractions of its length.
function alongRange(pts, count, t0, t1) {
  const seg = [];
  let total = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const d = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    seg.push(d); total += d;
  }
  const out = [];
  for (let n = 0; n < count; n++) {
    const f = t0 + (t1 - t0) * (count === 1 ? 0.5 : n / (count - 1));
    let want = f * total, i = 0;
    while (i < seg.length - 1 && want > seg[i]) { want -= seg[i]; i++; }
    const g = seg[i] ? want / seg[i] : 0;
    out.push([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * g,
              pts[i][1] + (pts[i + 1][1] - pts[i][1]) * g]);
  }
  return out;
}

export function tutte(h, pinned, iters) {
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


// As rigid as possible.
//
// Tutte's embedding is a harmonic map, and what it minimises is the Dirichlet
// energy, which is not the same thing as looking right. A harmonic map from a
// sheet three times longer than it is deep onto a pentagon has to wring the
// grid round in a spiral to make up the difference, and the spiral is the
// waviness. What is actually wanted is the drawing in which each cell is as
// close as it can be to the cell of the developed sheet it came from: turned
// and moved, but not sheared and not stretched.
//
// So: guess a rotation for each cell, solve for the vertices that best fit
// those rotations, and repeat. The rotation for a cell is the one that lines
// its rest shape up with where it has ended up, which in two dimensions is one
// arctangent rather than a decomposition. Neither step can make the energy
// worse, so it settles.
//
// The distortion does not go away -- the boundary is pinned to a pentagon and
// the sheet is a rectangle, so something has to give -- but it is spread out
// as an even shear instead of being piled into a few swirls, and a grid that
// leans is far easier to read than a grid that curls.
export function arap(h, pinned, rest, init, outer = 26, inner = 8) {
  const V = h.V, F = h.faces.length;
  // every cell contributes its four sides and both diagonals: without the
  // diagonals a quad can shear freely and the rotations have nothing to hold
  const PAIRS = [[0, 1], [1, 2], [2, 3], [3, 0], [0, 2], [1, 3]];
  const ex = new Float32Array(F * 6), ey = new Float32Array(F * 6);
  const deg = new Int32Array(V);
  for (let f = 0; f < F; f++) {
    const q = h.faces[f];
    for (let k = 0; k < 6; k++) {
      const i = q[PAIRS[k][0]], j = q[PAIRS[k][1]];
      ex[f * 6 + k] = rest[i * 2] - rest[j * 2];
      ey[f * 6 + k] = rest[i * 2 + 1] - rest[j * 2 + 1];
      deg[i]++; deg[j]++;
    }
  }
  const p = Float32Array.from(init);
  const cs = new Float32Array(F), sn = new Float32Array(F);
  const accx = new Float32Array(V), accy = new Float32Array(V);

  for (let it = 0; it < outer; it++) {
    // what turn best carries each rest cell onto where that cell now is
    for (let f = 0; f < F; f++) {
      const q = h.faces[f];
      let a = 0, b = 0;                      // a = S00 + S11, b = S10 - S01
      for (let k = 0; k < 6; k++) {
        const i = q[PAIRS[k][0]], j = q[PAIRS[k][1]];
        const px = p[i * 2] - p[j * 2], py = p[i * 2 + 1] - p[j * 2 + 1];
        const rx = ex[f * 6 + k], ry = ey[f * 6 + k];
        a += px * rx + py * ry;
        b += py * rx - px * ry;
      }
      const n = Math.hypot(a, b) || 1;
      cs[f] = a / n; sn[f] = b / n;
    }
    // and then the vertices that best agree with all of those turns at once
    for (let sweep = 0; sweep < inner; sweep++) {
      accx.fill(0); accy.fill(0);
      for (let f = 0; f < F; f++) {
        const q = h.faces[f], c = cs[f], s2 = sn[f];
        for (let k = 0; k < 6; k++) {
          const i = q[PAIRS[k][0]], j = q[PAIRS[k][1]];
          const rx = ex[f * 6 + k], ry = ey[f * 6 + k];
          const tx = c * rx - s2 * ry, ty = s2 * rx + c * ry;   // the turned side
          accx[i] += p[j * 2] + tx; accy[i] += p[j * 2 + 1] + ty;
          accx[j] += p[i * 2] - tx; accy[j] += p[i * 2 + 1] - ty;
        }
      }
      for (let v = 0; v < V; v++) {
        if (pinned.has(v) || !deg[v]) continue;
        p[v * 2] = accx[v] / deg[v]; p[v * 2 + 1] = accy[v] / deg[v];
      }
    }
  }
  // A fold would be worse than the waviness, so keep the safe answer if the
  // relaxation has turned any cell inside out. Which way round the cells are is
  // read off the drawing that was started from, since a reflected piece has all
  // of them the other way and neither is wrong.
  const want = Math.sign(area(init, h.faces[0][0], h.faces[0][1], h.faces[0][2])) || 1;
  for (let f = 0; f < F; f++) {
    const q = h.faces[f];
    if (Math.sign(area(p, q[0], q[1], q[2])) !== want) return init;
    if (Math.sign(area(p, q[0], q[2], q[3])) !== want) return init;
  }
  return p;
}

function area(p, a, b, c) {
  return (p[b * 2] - p[a * 2]) * (p[c * 2 + 1] - p[a * 2 + 1])
       - (p[c * 2] - p[a * 2]) * (p[b * 2 + 1] - p[a * 2 + 1]);
}
