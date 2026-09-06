// The solid, built rather than relaxed.
//
// The old version took the normal-form polygon, meshed it, and let a physical
// relaxation find a shape. That is honest but it settles into a crumpled blob,
// because these surfaces are flat everywhere except at their cone points and
// there is nothing in the energy that says "look like a pretzel".
//
// So this builds the classic picture directly. A capsule stands for the
// sphere, one pair of holes is cut for each loop the player closed, and a tube
// is stitched between each pair. Stitch the far end the same way round and it
// is an ordinary handle; stitch it reversed and it is a twisted handle, which
// is what makes a sphere into a klein bottle. A twisted tube cannot close up
// in space without passing through something, so it is routed the way the
// classic picture routes it: over the top, round, and back up into its hole
// from inside the capsule.
//
// Nothing here is approximate. The genus and the orientability are decided by
// the stitching, and the tests check them against what the polygon says.

import { orientFaces } from './mesh.js';

const C = 36;          // divisions round the capsule
const SEG = 40;        // rings along a tube
const RBAR = 1;
const TUBE = 0.82;     // tube radius, near enough the body's that the two read
                       // as one piece of material rather than pipe on a bar
const GAP = 1.85;      // half the distance between a tube's two feet
const SMOOTH = 38;     // rounds the joins into fillets

// One material throughout: the shape is the whole of what there is to see,
// and colouring the tubes differently only made it look like a diagram.
const STONE = [198, 191, 173];

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

function catmull(pts, t) {
  const n = pts.length - 1;
  const s = Math.min(Math.max(t, 0), 1) * n;
  const i = Math.min(Math.floor(s), n - 1);
  const u = s - i;
  const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n, i + 2)];
  const out = [];
  for (let c = 0; c < 3; c++) {
    out.push(0.5 * ((2 * p1[c]) + (-p0[c] + p2[c]) * u +
      (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * u * u +
      (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * u * u * u));
  }
  return out;
}

export function buildHandlebody(tubeTwists) {
  const n = tubeTwists.length;
  // Match the hole's perimeter to the tube's circumference so the two stitch
  // together without either being stretched round the other.
  const P = Math.max(3, Math.min(9, Math.round((TUBE * C) / 4)));
  const RING = 4 * P;
  const geom = { RBAR, tubes: [], C, P };
  const pos = [];                       // [x, y, z] per vertex
  const faces = [];                     // [a, b, c, d], d repeated for a triangle
  const rgb = [];                       // one colour per face
  const vid = i => i;

  // ---- the capsule ----------------------------------------------------
  // Neighbouring tubes stand as close as their holes allow, so the strut
  // between two holes is thin and the thing reads as one body with holes in
  // it rather than as separate hoops on a rail.
  const cellX = (2 * Math.PI * RBAR) / C;
  const patchWidth = P * cellX;
  const spacing = 2 * GAP + patchWidth * 1.3;
  const extent = n > 1 ? spacing * (n - 1) : 0;
  const L = Math.max(2.4, extent + 2 * GAP + patchWidth * 0.5 + 0.7);
  const Ml = Math.max(8, Math.round(L / cellX));
  const Mc = Math.max(4, Math.round((Math.PI / 2) * RBAR / cellX));
  const prof = [];
  for (let i = 0; i <= Mc; i++) {
    const a = (i / Mc) * (Math.PI / 2);
    prof.push({ x: -L / 2 - RBAR * Math.cos(a), r: RBAR * Math.sin(a), cyl: false });
  }
  const cyl0 = prof.length - 1;
  geom.cyl0 = cyl0;
  for (let i = 1; i <= Ml; i++) prof.push({ x: -L / 2 + (i / Ml) * L, r: RBAR, cyl: true });
  const cyl1 = prof.length - 1;
  geom.cyl1 = cyl1;
  for (let i = 1; i <= Mc; i++) {
    const a = (i / Mc) * (Math.PI / 2);
    prof.push({ x: L / 2 + RBAR * Math.sin(a), r: RBAR * Math.cos(a), cyl: false });
  }
  const M = prof.length - 1;
  geom.L = L;
  geom.prof = prof;

  // The body follows a shallow arc rather than a straight line. A straight
  // capsule reads as a rail with things bolted to it; bending it puts the
  // tubes on the outside of a curve, where they splay apart the way they do
  // in a drawn pretzel.
  const sweep = Math.max(0.3, Math.min(1.15, L * 0.09));
  const bendR = L / sweep;
  const spine = x => {
    const a = x / bendR;
    return { p: [bendR * Math.sin(a), -bendR * (1 - Math.cos(a)), 0],
             N: [Math.sin(a), Math.cos(a), 0],       // out on the convex side
             B: [0, 0, 1] };
  };
  geom.spine = { bendR, sweep };

  const grid = [];                       // grid[j][k], poles at j = 0 and M
  for (let j = 0; j <= M; j++) {
    const f = spine(prof[j].x);
    if (j === 0 || j === M) {
      grid.push(new Array(C).fill(pos.length));
      pos.push(f.p);
      continue;
    }
    const row = [];
    for (let k = 0; k < C; k++) {
      const th = (k / C) * Math.PI * 2;
      const c = Math.cos(th) * prof[j].r, d = Math.sin(th) * prof[j].r;
      row.push(pos.length);
      pos.push([f.p[0] + f.N[0] * c + f.B[0] * d,
                f.p[1] + f.N[1] * c + f.B[1] * d,
                f.p[2] + f.N[2] * c + f.B[2] * d]);
    }
    grid.push(row);
  }
  geom.grid = grid;

  // ---- where the tubes meet it ---------------------------------------
  // Two holes per loop, side by side along the top of the capsule.
  const holes = [];
  for (let i = 0; i < n; i++) {
    const xc = -extent / 2 + i * spacing;
    for (const dx of [-GAP, GAP]) {
      const x = xc + dx;
      let j = cyl0;
      let best = Infinity;
      for (let jj = cyl0; jj + P <= cyl1; jj++) {
        const mid = (prof[jj].x + prof[jj + P].x) / 2;
        if (Math.abs(mid - x) < best) { best = Math.abs(mid - x); j = jj; }
      }
      holes.push({ j, k: ((C - P) % C + C) % C === 0 ? 0 : C - Math.floor(P / 2) });
    }
  }
  // top of the capsule is theta = 0, so centre the patch on it
  for (const h of holes) h.k = (C - Math.floor(P / 2)) % C;

  const removed = new Set();
  for (const h of holes)
    for (let a = 0; a < P; a++)
      for (let b = 0; b < P; b++) removed.add(`${h.j + a},${(h.k + b) % C}`);

  const faceRGB = c => { rgb.push(c[0], c[1], c[2]); };
  for (let j = 0; j < M; j++) {
    for (let k = 0; k < C; k++) {
      if (removed.has(`${j},${k}`)) continue;
      const k2 = (k + 1) % C;
      faces.push([grid[j][k], grid[j][k2], grid[j + 1][k2], grid[j + 1][k]]);
      faceRGB(STONE);
    }
  }

  // the ring of vertices around a removed patch, walked once
  const loopOf = h => {
    const out = [];
    for (let b = 0; b < P; b++) out.push(grid[h.j][(h.k + b) % C]);
    for (let a = 0; a < P; a++) out.push(grid[h.j + a][(h.k + P) % C]);
    for (let b = P; b > 0; b--) out.push(grid[h.j + P][(h.k + b) % C]);
    for (let a = P; a > 0; a--) out.push(grid[h.j + a][h.k % C]);
    return out;
  };

  // ---- the tubes ------------------------------------------------------
  for (let i = 0; i < n; i++) {
    const twisted = tubeTwists[i];
    const hA = holes[i * 2], hB = holes[i * 2 + 1];
    const loopA = loopOf(hA), loopB = loopOf(hB);
    const cA = centre(pos, loopA), cB = centre(pos, loopB);
    const half = Math.floor(P / 2);
    const nA = spine(prof[hA.j + half].x).N, nB = spine(prof[hB.j + half].x).N;
    const along = norm(sub(cB, cA));

    // A plain semicircle from one foot to the other. Waypoints joined by a
    // spline gave a pointed arch, which reads as a hoop stood on a bar; a
    // circle leaves both feet straight up and comes over evenly, so the hole
    // under it is round and the whole thing reads as one piece with a hole in
    // it. Both feet sit on top of the capsule, so the circle's centre is the
    // point between them and its radius is half their distance.
    // The semicircle lives in the plane through both feet and their outward
    // normals, so it still stands up straight once the body is bent.
    const O = mul(add(cA, cB), 0.5);
    const arcR = len(sub(cB, cA)) / 2;
    const u = norm(sub(cA, O));                       // O towards the near foot
    const navg = norm(add(nA, nB));
    const w = norm(sub(navg, mul(u, dot(navg, u))));  // out, square to the chord
    const arc = (phi, scale = 1) =>
      add(O, mul(add(mul(u, Math.cos(phi)), mul(w, Math.sin(phi))), arcR * scale));

    const centres = [], frames = [];
    if (twisted) {
      // over the top, out past the far foot, then down and back in through
      // the wall, which is the only way a twisted tube closes up in space
      const way = [cA,
        arc(Math.PI * 0.14), arc(Math.PI * 0.5), arc(Math.PI * 0.84, 1.04),
        arc(Math.PI * 1.12, 1.12), arc(Math.PI * 1.34, 1.06),
        add(cB, mul(nB, -RBAR * 1.5)),
        cB];
      for (let s = 0; s <= SEG; s++) centres.push(catmull(way, s / SEG));
    } else {
      for (let s = 0; s <= SEG; s++) centres.push(arc(Math.PI * (s / SEG)));
    }
    let U = perp(norm(sub(centres[1], centres[0])), sub(pos[loopA[0]], cA));
    for (let s = 0; s <= SEG; s++) {
      const a = centres[Math.max(0, s - 1)], b = centres[Math.min(SEG, s + 1)];
      const T = norm(sub(b, a));
      U = norm(sub(U, mul(T, dot(U, T))));
      const V = cross(T, U);
      frames.push({ T, U, V });
    }

    // how the far ring lines up with the hole it lands in: the direction is
    // forced (reversed is exactly what makes a twisted handle), the offset is
    // whichever costs the least wringing
    const dir = twisted ? 1 : -1;
    const rad = TUBE;
    const ringAt = (s, o) => {
      const f = frames[s], c = centres[s];
      const out = [];
      for (let k = 0; k < RING; k++) {
        const th = ((k + o) / RING) * Math.PI * 2;
        out.push(add(c, add(mul(f.U, Math.cos(th) * rad), mul(f.V, Math.sin(th) * rad))));
      }
      return out;
    };
    let bestOff = 0, bestCost = Infinity;
    for (let o = 0; o < RING; o++) {
      const ring = ringAt(SEG, 0);
      let cost = 0;
      for (let k = 0; k < RING; k++) {
        const target = pos[loopB[(((o + dir * k) % RING) + RING) % RING]];
        cost += len(sub(ring[k], target)) ** 2;
      }
      if (cost < bestCost) { bestCost = cost; bestOff = o; }
    }
    const mapB = k => loopB[(((bestOff + dir * k) % RING) + RING) % RING];

    // rings: the two ends are the holes themselves, the middle is a tube,
    // and the blend keeps the join seamless
    const rings = [];
    for (let s = 0; s <= SEG; s++) {
      if (s === 0) { rings.push(loopA.slice()); continue; }
      if (s === SEG) { rings.push(Array.from({ length: RING }, (_, k) => mapB(k))); continue; }
      const t = s / SEG;
      const wA = Math.max(0, 1 - t / 0.22), wB = Math.max(0, (t - 0.78) / 0.22);
      const base = ringAt(s, 0);
      const row = [];
      for (let k = 0; k < RING; k++) {
        let p = base[k];
        if (wA > 0) p = lerp(p, add(pos[loopA[k]], mul(frames[s].T, 0)), wA * 0.85);
        if (wB > 0) p = lerp(p, pos[mapB(k)], wB * 0.85);
        row.push(pos.length);
        pos.push(p);
      }
      rings.push(row);
    }

    for (let s = 0; s < SEG; s++) {
      for (let k = 0; k < RING; k++) {
        const k2 = (k + 1) % RING;
        faces.push([rings[s][k], rings[s][k2], rings[s + 1][k2], rings[s + 1][k]]);
        faceRGB(STONE);
      }
    }
    geom.tubes.push({ twisted, rad, cA, cB, nA, nB, centres, frames, rings, holeA: hA, holeB: hB });
  }

  const packed = pack(pos, faces, rgb);
  packed.geom = geom;
  return packed;
}

function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function centre(pos, ids) {
  const c = [0, 0, 0];
  for (const i of ids) { c[0] += pos[i][0]; c[1] += pos[i][1]; c[2] += pos[i][2]; }
  return mul(c, 1 / ids.length);
}
function perp(T, hint) {
  let U = sub(hint, mul(T, dot(hint, T)));
  if (len(U) < 1e-6) {
    U = Math.abs(T[0]) < 0.9 ? cross(T, [1, 0, 0]) : cross(T, [0, 1, 0]);
  }
  return norm(U);
}

// Into the same shape the renderer already understands, with the adjacency
// and the winding pass that decides orientability.
function pack(pos, faces, rgb) {
  // Cutting a hole strands the vertices inside the patch: nothing references
  // them any more, but they still count towards V and would each add one to
  // the euler characteristic. Drop anything no face uses.
  const used = new Map();
  const keep = [];
  for (const f of faces) {
    for (const v of f) {
      if (!used.has(v)) { used.set(v, keep.length); keep.push(pos[v]); }
    }
  }
  faces = faces.map(f => f.map(v => used.get(v)));
  pos = keep;

  const V = pos.length, F = faces.length;
  const positions = new Float32Array(V * 3);
  for (let i = 0; i < V; i++) {
    positions[i * 3] = pos[i][0]; positions[i * 3 + 1] = pos[i][1]; positions[i * 3 + 2] = pos[i][2];
  }
  const fa = new Int32Array(F * 4);
  for (let f = 0; f < F; f++) for (let k = 0; k < 4; k++) fa[f * 4 + k] = faces[f][k];

  const set = new Set(), ea = [], eb = [];
  const push = (a, b) => {
    if (a === b) return;
    const k = a < b ? a * V + b : b * V + a;
    if (set.has(k)) return;
    set.add(k); ea.push(a); eb.push(b);
  };
  for (const f of faces) for (let i = 0; i < 4; i++) push(f[i], f[(i + 1) % 4]);
  const edgeA = Int32Array.from(ea), edgeB = Int32Array.from(eb);

  const deg = new Int32Array(V);
  for (let i = 0; i < edgeA.length; i++) { deg[edgeA[i]]++; deg[edgeB[i]]++; }
  const start = new Int32Array(V + 1);
  for (let i = 0; i < V; i++) start[i + 1] = start[i] + deg[i];
  const adj = new Int32Array(start[V]);
  const fill = start.slice(0, V);
  for (let i = 0; i < edgeA.length; i++) {
    adj[fill[edgeA[i]]++] = edgeB[i];
    adj[fill[edgeB[i]]++] = edgeA[i];
  }

  // Taubin smoothing: one pass in, one pass out. A plain average would shrink
  // the whole thing away; alternating with an outward pass leaves the size
  // alone and only takes the corners off, which is what turns a tube bolted
  // onto a bar into one piece of material with a hole through it. It moves
  // vertices and nothing else, so the quad grid and the topology survive it
  // exactly, which matters if anything is ever going to be laid out on them.
  taubin(positions, adj, start, V, SMOOTH);

  const { orient, orientable } = orientFaces(fa, F, V);
  return {
    V, F, faces: fa, positions, edgeA, edgeB, adj, start, deg, orient, orientable,
    rgb: Uint8Array.from(rgb), seam: [],
    chi: V - edgeA.length + F,
  };
}

function taubin(pos, adj, start, V, iters, lambda = 0.55, mu = -0.58) {
  const tmp = new Float32Array(pos.length);
  const pass = w => {
    for (let i = 0; i < V; i++) {
      const s0 = start[i], s1 = start[i + 1], deg = s1 - s0;
      if (!deg) { for (let c = 0; c < 3; c++) tmp[i * 3 + c] = pos[i * 3 + c]; continue; }
      let ax = 0, ay = 0, az = 0;
      for (let k = s0; k < s1; k++) {
        const j = adj[k];
        ax += pos[j * 3]; ay += pos[j * 3 + 1]; az += pos[j * 3 + 2];
      }
      tmp[i * 3] = pos[i * 3] + w * (ax / deg - pos[i * 3]);
      tmp[i * 3 + 1] = pos[i * 3 + 1] + w * (ay / deg - pos[i * 3 + 1]);
      tmp[i * 3 + 2] = pos[i * 3 + 2] + w * (az / deg - pos[i * 3 + 2]);
    }
    pos.set(tmp);
  };
  for (let it = 0; it < iters; it++) { pass(lambda); pass(mu); }
}
