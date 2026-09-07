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
// one: the drawing that lies down neatly beside its neighbours and the drawing
// that bends up honestly are two different drawings. The first is a triangle,
// apex at the middle and the rim its base; the second is the sector. They have
// the same area, since a triangle on the same base with height equal to the
// sector's radius does, so act zero only bows the base out and does not have
// to stretch the paper to do it.

import { phaseAt, THREE_ACT } from './roll.js';

const FRONT = [201, 194, 176];
const BACK = [166, 156, 136];
const GRID = [173, 165, 148];
const RIM = [194, 138, 27];
const SLIT = [42, 127, 122];

// How far round the finished ball the cap reaches, from its apex to its rim.
// Well past a hemisphere, so the end of a net reads as closed off rather than
// as a saucer laid over the hole.
const REACH = 2.5;

export function buildCap(opts = {}) {
  const edge = opts.edge || 8.3;              // the rim, and a polygon's side
  const spokes = opts.spokes || 16;           // must match the handle's rim
  const rings = opts.rings || 10;
  const mirror = !!opts.mirror;
  const my = mirror ? -1 : 1;

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

  const id = (i, j) => j * (spokes + 1) + i;  // i round, j out from the apex
  const V = (spokes + 1) * (rings + 1);
  const uv = new Float32Array(V * 2);
  for (let j = 0; j <= rings; j++) {
    for (let i = 0; i <= spokes; i++) {
      uv[id(i, j) * 2] = (i / spokes - 0.5) * theta * my;   // round
      uv[id(i, j) * 2 + 1] = j / rings;                     // out
    }
  }
  const F = spokes * rings;
  const faces = new Int32Array(F * 4);
  const wind = mirror ? [0, 3, 2, 1] : [0, 1, 2, 3];
  let f = 0;
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < spokes; i++, f++) {
      const q = [id(i, j), id(i + 1, j), id(i + 1, j + 1), id(i, j + 1)];
      for (let c = 0; c < 4; c++) faces[f * 4 + c] = q[wind[c]];
    }
  }
  const rgb = new Uint8Array(F * 3), backRGB = new Uint8Array(F * 3);
  for (let i = 0; i < F; i++) {
    for (let c = 0; c < 3; c++) { rgb[i * 3 + c] = FRONT[c]; backRGB[i * 3 + c] = BACK[c]; }
  }

  const rim = [];
  for (let i = 0; i <= spokes; i++) rim.push(id(i, rings));
  // the two lips of the slit, which are glued to each other
  const glue = [];
  for (let j = 0; j <= rings; j++) glue.push([id(0, j), id(spokes, j)]);
  // and every vertex of the apex ring is the same point
  for (let i = 1; i <= spokes; i++) glue.push([id(0, 0), id(i, 0)]);

  return {
    kind: 'cap', k: 1, n: 1, V, F, faces, rgb, backRGB, seam: [], uv, id,
    spokes, rings, edge, rho, slant, theta, alpha, H, ball, psi, mirror,
    rims: [rim], rimDir: [0], rimReach: [slant], behind: [slant], glue,
    plan: THREE_ACT,
  };
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
  const { V, uv, slant, alpha, ball, psi, edge, theta } = cap;
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
      // and before any of that, the triangle it is drawn as beside its
      // neighbours, bowing out into the sector it really is
      const tx = u * slant, ty = ((phi / (theta / 2)) * edge) / 2 * u;
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
  const lip = i => { const ids = []; for (let j = 0; j <= rings; j++) ids.push(id(i, j)); return ids; };
  edges.push({ ids: lip(0), rgb: SLIT, wide: true, kind: 'edge', glue: 'curl' });
  edges.push({ ids: lip(spokes), rgb: SLIT, wide: true, kind: 'edge', glue: 'curl' });
  edges.push({ ids: cap.rims[0], rgb: RIM, wide: true, kind: 'rim', glue: 'ring' });
  return { grid, edges };
}
