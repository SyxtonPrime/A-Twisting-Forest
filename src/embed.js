// Putting the surface in space.
//
// There is usually no isometric embedding: a flat torus does not fit in
// three dimensions without stretching, and a non-orientable world does not
// fit at all without passing through itself. So we do not look for one. We
// look for the roundest shape that keeps the grid spacing roughly right,
// by relaxing edge springs against a global repulsion. The topology is
// carried entirely by the connectivity, so whatever it settles into has the
// right genus and orientability by construction.

import { mulberry32 } from './rng.js';

// Three lowest non-constant modes of the graph Laplacian, by subspace
// iteration on the heat operator I - tL. A decent unfolded starting shape:
// on a sphere these are the coordinate functions, so it starts round.
export function spectralInit(mesh, seed = 1, iters = 900) {
  const { V, edgeA, edgeB, deg } = mesh;
  const rng = mulberry32(seed);
  let maxDeg = 0;
  for (let i = 0; i < V; i++) maxDeg = Math.max(maxDeg, deg[i]);
  const t = 1 / (2 * maxDeg);
  const K = 3;
  const X = [];
  for (let k = 0; k < K; k++) {
    const v = new Float64Array(V);
    for (let i = 0; i < V; i++) v[i] = rng() * 2 - 1;
    X.push(v);
  }
  const tmp = new Float64Array(V);

  const orthonormalise = () => {
    for (let k = 0; k < K; k++) {
      const v = X[k];
      let mean = 0;
      for (let i = 0; i < V; i++) mean += v[i];
      mean /= V;
      for (let i = 0; i < V; i++) v[i] -= mean;         // against the constant mode
      for (let j = 0; j < k; j++) {
        const u = X[j];
        let d = 0;
        for (let i = 0; i < V; i++) d += u[i] * v[i];
        for (let i = 0; i < V; i++) v[i] -= d * u[i];
      }
      let nn = 0;
      for (let i = 0; i < V; i++) nn += v[i] * v[i];
      nn = Math.sqrt(nn) || 1;
      for (let i = 0; i < V; i++) v[i] /= nn;
    }
  };

  orthonormalise();
  for (let it = 0; it < iters; it++) {
    for (let k = 0; k < K; k++) {
      const v = X[k];
      tmp.fill(0);
      for (let e = 0; e < edgeA.length; e++) {   // tmp = L v
        const a = edgeA[e], b = edgeB[e];
        const d = v[a] - v[b];
        tmp[a] += d; tmp[b] -= d;
      }
      for (let i = 0; i < V; i++) v[i] -= t * tmp[i];
    }
    orthonormalise();
  }

  const pos = new Float32Array(V * 3);
  for (let i = 0; i < V; i++)
    for (let k = 0; k < 3; k++) pos[i * 3 + k] = X[k][i];
  rescale(pos, V, 1);
  return pos;
}

// Scale so the mean edge length is about `target`, and centre on the origin.
function rescale(pos, V, target) {
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < V; i++) { cx += pos[i * 3]; cy += pos[i * 3 + 1]; cz += pos[i * 3 + 2]; }
  cx /= V; cy /= V; cz /= V;
  let r = 0;
  for (let i = 0; i < V; i++) {
    const x = pos[i * 3] - cx, y = pos[i * 3 + 1] - cy, z = pos[i * 3 + 2] - cz;
    r = Math.max(r, Math.hypot(x, y, z));
  }
  const s = (target * Math.sqrt(V)) / (r || 1);
  for (let i = 0; i < V; i++) {
    pos[i * 3] = (pos[i * 3] - cx) * s;
    pos[i * 3 + 1] = (pos[i * 3 + 1] - cy) * s;
    pos[i * 3 + 2] = (pos[i * 3 + 2] - cz) * s;
  }
}

export class Relaxer {
  constructor(mesh, pos, opts = {}) {
    this.mesh = mesh;
    this.pos = pos;
    this.vel = new Float32Array(pos.length);
    this.force = new Float32Array(pos.length);
    this.L0 = opts.L0 || 1;         // wanted edge length
    this.ks = opts.ks ?? 1.0;       // spring stiffness, wants the grid spacing back
    this.kr = opts.kr ?? 1.0;       // long-range push: opens the holes
    this.kl = opts.kl ?? 0.35;      // surface tension: takes the worst creases out
    this.kp = opts.kp ?? 0.25;      // a breath of pressure, only enough to lift
                                    // a flat sheet off the plane: a flat grid is
                                    // otherwise already at rest and never rounds
                                    // out. More than this and it blows the holes
                                    // shut, which is worse than a crease.
    this.kc = opts.kc ?? 6.0;       // self-contact: keeps the sheet off itself
    this.damp = opts.damp ?? 0.82;
    this.dt = opts.dt ?? 0.35;
    this.steps = 0;
  }

  step() {
    const { V, edgeA, edgeB } = this.mesh;
    const pos = this.pos, f = this.force;
    f.fill(0);

    // Two forces between every pair of points. A weak long-range push, which
    // spreads the world out, and a hard short-range one that stops the sheet
    // from passing through itself. The short-range radius tracks the actual
    // mesh spacing: two bits of surface may not come nearer than the grid can
    // resolve, which is what keeps a hole a hole under pressure.
    const kr = this.kr * this.L0 * this.L0;
    const rc = 0.9 * this.meanEdge();
    const rc2 = rc * rc, kc = this.kc;
    for (let i = 0; i < V; i++) {
      const ix = pos[i * 3], iy = pos[i * 3 + 1], iz = pos[i * 3 + 2];
      let fx = 0, fy = 0, fz = 0;
      for (let j = i + 1; j < V; j++) {
        const dx = ix - pos[j * 3], dy = iy - pos[j * 3 + 1], dz = iz - pos[j * 3 + 2];
        let d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 1e-6) d2 = 1e-6;
        const d = Math.sqrt(d2);
        let m = kr / (d2 * d);                       // long range, magnitude kr/d^2
        if (d2 < rc2) m += (kc * (rc / d - 1)) / d;  // short range, hard
        const gx = dx * m, gy = dy * m, gz = dz * m;
        fx += gx; fy += gy; fz += gz;
        f[j * 3] -= gx; f[j * 3 + 1] -= gy; f[j * 3 + 2] -= gz;
      }
      f[i * 3] += fx; f[i * 3 + 1] += fy; f[i * 3 + 2] += fz;
    }

    // Edges pull back to the grid spacing.
    for (let e = 0; e < edgeA.length; e++) {
      const a = edgeA[e], b = edgeB[e];
      const dx = pos[b * 3] - pos[a * 3];
      const dy = pos[b * 3 + 1] - pos[a * 3 + 1];
      const dz = pos[b * 3 + 2] - pos[a * 3 + 2];
      const d = Math.hypot(dx, dy, dz) || 1e-6;
      const m = (this.ks * (d - this.L0)) / d;
      const gx = dx * m, gy = dy * m, gz = dz * m;
      f[a * 3] += gx; f[a * 3 + 1] += gy; f[a * 3 + 2] += gz;
      f[b * 3] -= gx; f[b * 3 + 1] -= gy; f[b * 3 + 2] -= gz;
    }

    // Pressure, pushing out along the surface normal. This is what a balloon
    // does, and without it a flat sheet is already at rest: smoothing and
    // repulsion both leave it alone, so the world never rounds out. On a
    // non-orientable world the windings cannot all agree, so the pressure
    // fights itself along one seam and the surface passes through itself,
    // which is the only way such a world can sit in space at all.
    if (this.kp) {
      const { F, faces, orient } = this.mesh;
      const kp = this.kp;
      for (let q = 0; q < F; q++) {
        const a = faces[q * 4], b = faces[q * 4 + 1], c = faces[q * 4 + 2], d = faces[q * 4 + 3];
        const ux = pos[c * 3] - pos[a * 3], uy = pos[c * 3 + 1] - pos[a * 3 + 1], uz = pos[c * 3 + 2] - pos[a * 3 + 2];
        const vx = pos[d * 3] - pos[b * 3], vy = pos[d * 3 + 1] - pos[b * 3 + 1], vz = pos[d * 3 + 2] - pos[b * 3 + 2];
        // cross product: direction is the normal, length is twice the area.
        // Use the direction only -- scaling the push by area makes a bigger
        // surface push harder, which runs away and bursts.
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const len = Math.hypot(nx, ny, nz);
        if (len < 1e-9) continue;
        const s = ((orient[q] || 1) * kp * 0.25) / len;
        nx *= s; ny *= s; nz *= s;
        for (const v of [a, b, c, d]) {
          f[v * 3] += nx; f[v * 3 + 1] += ny; f[v * 3 + 2] += nz;
        }
      }
    }

    // Surface tension. Each vertex is drawn toward the centre of its ring,
    // which is discrete mean-curvature flow: it irons out the spikes that a
    // cone point makes without touching the topology.
    if (this.kl) {
      const { adj, start } = this.mesh;
      const kl = this.kl;
      for (let i = 0; i < V; i++) {
        const s0 = start[i], s1 = start[i + 1];
        const n = s1 - s0;
        if (!n) continue;
        let ax = 0, ay = 0, az = 0;
        for (let k = s0; k < s1; k++) {
          const j = adj[k];
          ax += pos[j * 3]; ay += pos[j * 3 + 1]; az += pos[j * 3 + 2];
        }
        f[i * 3] += kl * (ax / n - pos[i * 3]);
        f[i * 3 + 1] += kl * (ay / n - pos[i * 3 + 1]);
        f[i * 3 + 2] += kl * (az / n - pos[i * 3 + 2]);
      }
    }

    const vel = this.vel, dt = this.dt, damp = this.damp;
    let maxv = 0;
    for (let i = 0; i < pos.length; i++) {
      vel[i] = (vel[i] + f[i] * dt) * damp;
      if (Math.abs(vel[i]) > maxv) maxv = Math.abs(vel[i]);
    }
    // Never let a step move a vertex more than a fraction of an edge.
    const cap = 0.25 * this.L0;
    const scale = maxv * dt > cap ? cap / (maxv * dt) : 1;
    for (let i = 0; i < pos.length; i++) pos[i] += vel[i] * dt * scale;

    this.steps++;
    return maxv;
  }

  meanEdge() {
    const { edgeA, edgeB } = this.mesh, pos = this.pos;
    let sum = 0;
    for (let e = 0; e < edgeA.length; e++) {
      const a = edgeA[e], b = edgeB[e];
      sum += Math.hypot(pos[a * 3] - pos[b * 3], pos[a * 3 + 1] - pos[b * 3 + 1], pos[a * 3 + 2] - pos[b * 3 + 2]);
    }
    return sum / edgeA.length || this.L0;
  }

  recentre() {
    const V = this.mesh.V, pos = this.pos;
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < V; i++) { cx += pos[i * 3]; cy += pos[i * 3 + 1]; cz += pos[i * 3 + 2]; }
    cx /= V; cy /= V; cz /= V;
    for (let i = 0; i < V; i++) {
      pos[i * 3] -= cx; pos[i * 3 + 1] -= cy; pos[i * 3 + 2] -= cz;
    }
  }

  radius() {
    const V = this.mesh.V, pos = this.pos;
    let r = 0;
    for (let i = 0; i < V; i++)
      r = Math.max(r, Math.hypot(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]));
    return r;
  }
}
