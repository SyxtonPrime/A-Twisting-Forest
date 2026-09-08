// A cap: a piece of genus nought, which closes off a neck without adding
// anything to the world.
//
// The handle's trick was that a rim has to be a whole side of a polygon, or
// nothing can be sewn to it edge to edge. A disc has no side to spare -- its
// whole boundary is the rim -- so it gets the same treatment the handle got:
// a slit, cut from the rim to the middle. Opened out, a disc with a radial
// slit is a circular sector, and its boundary reads round as
//
//     c  s  s^-1
//
// with c, the rim, the outer arc, and the two straight radii the two lips of
// the slit, glued back to each other. So the rim is an unbroken arc of the
// boundary, which is the one thing that was needed.
//
// And then the roll comes out better than the handle's does. Rolling a sector
// up until its two radii meet gives a cone, and that is an honest bend all the
// way: a cone is developable, so no length in the paper changes and there is
// nothing to apologise for. Only the second act -- rounding the cone off into
// a dome -- has to stretch, and for the same reason as before, since a sphere
// has curvature and a cone does not.
//
// The rim arc is the same length as a handle's rim side -- but it is an arc,
// and a handle's is straight, so a neck sewn between the two would flare. So
// the cap gets an act zero as well, and for the same reason the handle's has
// one: the drawing that lies down beside its neighbours and the drawing that
// bends up honestly are two different drawings.
//
// And the drawing it lies down as is a pentagon, the same pentagon a handle
// with one neck is drawn as. Nothing about the shape of a net should say which
// of the two a piece is; the arrows on its edges say it, and nothing else. A
// pentagon reads
//
//     a b a^-1 b^-1 c        a torus with a disc gone
//     a b b^-1 a^-1 c        a sphere with a disc gone
//
// -- the same five sides, paired across in one and nested in the other, which
// is the whole difference between a handle and a cap. Crossed pairs are a
// handle; nested pairs cancel and leave a disc. The slit here is one cut from
// the rim to the middle, so cutting it in half at the halfway point gives the
// four sides, and gluing lip to lip at equal depth pairs them nested.

import { phaseAt, THREE_ACT } from './roll.js';
import { tutte, arap } from './piece.js';

const FRONT = [201, 194, 176];
const BACK = [166, 156, 136];
const GRID = [173, 165, 148];
const RIM = [194, 138, 27];
const PAIR_A = [42, 127, 122];
const PAIR_B = [181, 53, 44];

// How far round the finished ball the cap reaches, from its apex to its rim.
// Well past a hemisphere, so the end of a net reads as closed off rather than
// as a saucer laid over the hole.
const REACH = 2.5;

export function buildCap(opts = {}) {
  const edge = opts.edge || 8.3;              // the rim, and a polygon's side
  const spokes = opts.spokes || 16;           // must match the handle's rim
  const rings = opts.rings || 10;
  const mirror = !!opts.mirror;
  // `mirror` means what it means for a handle -- which of the net's two
  // colours this piece is -- and `my` is which way round the cap is actually
  // drawn, which is the other one. A handle's boundary comes out of its mesh
  // one way round and a cap's pentagon is laid out by hand the other, so a cap
  // that is to answer a handle of a given handedness has to be its reflection,
  // or the two rims run opposite ways along their sides and the neck between
  // them comes out a bowtie.
  const my = mirror ? 1 : -1;

  const rho = edge / (2 * Math.PI);           // the rim, once it is a circle
  // the sector: its arc is the rim, so its radius is fixed by how far round
  // the ball the cap is to reach
  const A = rho / Math.sin(REACH);
  const slant = A * REACH;
  const theta = edge / slant;                 // the angle of the sector
  const alpha = Math.asin(Math.min(1, theta / (2 * Math.PI)));   // the cone's half angle
  const H = slant * Math.cos(alpha);          // apex to rim, along the axis
  const ball = (rho * rho + H * H) / (2 * H); // the sphere the dome sits on
  const psi = Math.acos(Math.max(-1, Math.min(1, (ball - H) / ball)));

  // The apex is one vertex and not a ring of them. It is a point of the piece,
  // and a ring of coincident vertices there would be a stretch of boundary
  // that has to be pinned somewhere in the flat drawing, when what belongs
  // there is the single corner where the two lips of the slit meet.
  const id = (i, j) => (j === 0 ? 0 : 1 + (j - 1) * (spokes + 1) + i);
  const V = 1 + rings * (spokes + 1);
  const uv = new Float32Array(V * 2);
  for (let j = 0; j <= rings; j++) {
    for (let i = 0; i <= spokes; i++) {
      uv[id(i, j) * 2] = j === 0 ? 0 : (i / spokes - 0.5) * theta * my;
      uv[id(i, j) * 2 + 1] = j / rings;
    }
  }
  const F = spokes * rings;
  const faces = new Int32Array(F * 4);
  const quads = [];
  const wind = my > 0 ? [0, 3, 2, 1] : [0, 1, 2, 3];
  let f = 0;
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < spokes; i++, f++) {
      const q = [id(i, j), id(i + 1, j), id(i + 1, j + 1), id(i, j + 1)];
      const w = wind.map(c => q[c]);
      quads.push(w);
      for (let c = 0; c < 4; c++) faces[f * 4 + c] = w[c];
    }
  }
  const rgb = new Uint8Array(F * 3), backRGB = new Uint8Array(F * 3);
  for (let i = 0; i < F; i++) {
    for (let c = 0; c < 3; c++) { rgb[i * 3 + c] = FRONT[c]; backRGB[i * 3 + c] = BACK[c]; }
  }

  const rim = [];
  for (let i = 0; i <= spokes; i++) rim.push(id(i, rings));
  // the two lips of the slit, glued to each other at equal depth
  const glue = [];
  for (let j = 1; j < rings; j++) glue.push([id(0, j), id(spokes, j)]);
  glue.push([id(0, rings), id(spokes, rings)]);

  const flat = sector(uv, V, slant);
  const cap = {
    kind: 'cap', k: 1, n: 5, V, F, faces, quads, rgb, backRGB, seam: [], uv, id,
    spokes, rings, edge, rho, slant, theta, alpha, H, ball, psi, mirror, my,
    rims: [rim], rimDir: [0], rimReach: [0], behind: [slant], glue,
    plan: THREE_ACT,
  };
  const P = pentagon(edge, my);
  cap.corners = P;
  cap.rimReach = [Math.hypot((P[0][0] + P[1][0]) / 2, (P[0][1] + P[1][1]) / 2)];
  cap.pent = layout(cap, P, flat);
  return cap;
}

// The sector, which is what the piece really is, and what the flat drawing is
// relaxed against.
function sector(uv, V, slant) {
  const out = new Float32Array(V * 2);
  for (let i = 0; i < V; i++) {
    const s = uv[i * 2 + 1] * slant, phi = uv[i * 2];
    out[i * 2] = s * Math.cos(phi);
    out[i * 2 + 1] = s * Math.sin(phi);
  }
  return out;
}

// The pentagon it is drawn as, with side 0 facing the neck, the same way a
// handle's does.
function pentagon(edge, my) {
  const rad = edge / (2 * Math.sin(Math.PI / 5));
  const P = [];
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 5 + (i / 5) * 2 * Math.PI;
    P.push([Math.cos(a) * rad, my * Math.sin(a) * rad]);
  }
  return P;
}

// The rim takes side 0. The slit, cut in half at its halfway point, takes the
// other four: the outer half of one lip and the outer half of the other end up
// on sides 1 and 4, the inner halves on 2 and 3, and the apex on the corner
// between them. So the pairs are nested, which is what makes it a sphere.
function layout(cap, P, rest) {
  const { spokes, rings, id } = cap;
  const pinned = new Map();
  const along = (list, a, b) => {
    list.forEach((v, i) => {
      const f = (i + 0.5) / list.length;
      pinned.set(v, [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
    });
  };
  const rim = [];
  for (let i = 0; i <= spokes; i++) rim.push(id(i, rings));
  rim.forEach((v, i) => {
    const f = i / (rim.length - 1);
    pinned.set(v, [P[0][0] + (P[1][0] - P[0][0]) * f, P[0][1] + (P[1][1] - P[0][1]) * f]);
  });
  const half = Math.floor((rings - 1) / 2);
  const hi = [], lo = [];
  for (let j = rings - 1; j >= 1; j--) hi.push(id(spokes, j));
  for (let j = 1; j <= rings - 1; j++) lo.push(id(0, j));
  along(hi.slice(0, hi.length - half), P[1], P[2]);
  along(hi.slice(hi.length - half), P[2], P[3]);
  pinned.set(id(0, 0), P[3]);
  along(lo.slice(0, half), P[3], P[4]);
  along(lo.slice(half), P[4], P[0]);
  const mesh = { faces: cap.quads, V: cap.V };
  return arap(mesh, pinned, rest, tutte(mesh, pinned, 700));
}

// Where every vertex is at time t.
//
// Act one takes the cone's half angle from a right angle -- which is the flat
// sector -- down to the one that closes it up. A point sits at arc length s
// from the apex whatever the angle is, and goes round by s*phi of arc, so the
// angle it turns through is phi over sine alpha. No length changes anywhere,
// which is what makes it a bend and not a warp.
//
// The frame turns with it: flat, the sector lies in the page, and a cone
// flattens into the plane across its own axis, so the axis has to come round
// by a right angle over the act for the rim to end up facing the way it faced
// to begin with.
export function capPositions(cap, t, opts = {}, out) {
  const { V, uv, slant, alpha, ball, psi } = cap;
  const { open, curl, ring } = phaseAt(t, cap.plan);
  const pos = out && out.length === V * 3 ? out : new Float32Array(V * 3);
  const a = Math.PI / 2 + (alpha - Math.PI / 2) * curl;
  const sa = Math.max(1e-6, Math.sin(a)), ca = Math.cos(a);
  const cq = Math.cos((curl * Math.PI) / 2), sq = Math.sin((curl * Math.PI) / 2);

  for (let i = 0; i < V; i++) {
    const phi = uv[i * 2], u = uv[i * 2 + 1];
    const s = u * slant;
    // the cone, about the z axis, apex at the origin
    let axial = s * ca, radius = s * sa;
    if (ring > 0) {
      // and rounded off: the same rim, the same apex, a sphere in between
      const th = u * psi;
      axial = axial + (ball * (1 - Math.cos(th)) - axial) * ring;
      radius = radius + (ball * Math.sin(th) - radius) * ring;
    }
    const w = phi / sa;
    const x = radius * Math.cos(w), y = radius * Math.sin(w), z = axial;
    // bring the axis round from z to x as it closes, so the rim keeps facing
    // the way the sector's arc faced
    let px = x * cq + z * sq, py = y, pz = -x * sq + z * cq;
    if (open < 1) {
      // and before any of that, the pentagon it is drawn as beside its
      // neighbours, opening out into the sector it really is
      const tx = cap.pent[i * 2], ty = cap.pent[i * 2 + 1];
      px = tx + (px - tx) * open;
      py = ty + (py - ty) * open;
      pz *= open;
    }
    pos[i * 3] = px; pos[i * 3 + 1] = py; pos[i * 3 + 2] = pz;
  }
  return pos;
}

export function capOverlay(cap) {
  const { spokes, rings, id } = cap;
  const grid = [], edges = [];
  const step = Math.max(1, Math.round(spokes / 8));
  for (let i = 0; i <= spokes; i += step) {
    const ids = []; for (let j = 0; j <= rings; j++) ids.push(id(i, j));
    grid.push({ ids, rgb: GRID, kind: 'grid' });
  }
  for (let j = Math.max(1, Math.round(rings / 4)); j < rings; j += Math.max(1, Math.round(rings / 4))) {
    const ids = []; for (let i = 0; i <= spokes; i++) ids.push(id(i, j));
    grid.push({ ids, rgb: GRID, kind: 'grid' });
  }
  // the two halves of each lip, coloured by which pair they belong to: outer
  // half with outer half, inner with inner, which is the nesting
  const half = Math.ceil(rings / 2);
  const lip = (i, from, to) => {
    const ids = []; for (let j = from; j <= to; j++) ids.push(id(i, j)); return ids;
  };
  for (const i of [0, spokes]) {
    edges.push({ ids: lip(i, half, rings), rgb: PAIR_A, wide: true, kind: 'edge', glue: 'curl' });
    edges.push({ ids: lip(i, 0, half), rgb: PAIR_B, wide: true, kind: 'edge', glue: 'curl' });
  }
  edges.push({ ids: cap.rims[0], rgb: RIM, wide: true, kind: 'rim', glue: 'ring' });
  return { grid, edges };
}
