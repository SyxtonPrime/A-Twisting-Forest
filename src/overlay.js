// The map, drawn on the solid.
//
// A faint grid over the whole surface, a waypoint at every place the player
// found, and their journey between them as a dotted line. The tree lies on the
// body, because a tree lies flat on a sphere. Each loop that was closed climbs
// to its handle: the first of a pair goes through the tube, the second goes up
// and rings it once, which is the other independent way to walk a handle and
// the reason two loops need only one tube between them.
//
// Every point is read off the mesh itself. The body is bent and then smoothed,
// so anything positioned by the arithmetic the mesh was built from would sink
// into it or float off it, worst of all near the joins.

import { mulberry32, hashSeed } from './rng.js';

const INK = [30, 26, 22];
const TRAIL = [86, 78, 66];
const GRID = [162, 155, 138];
const CAMP = [176, 122, 20];
const GRID_LIFT = 0.02;
const WALK_LIFT = 0.07;
const MARK_LIFT = 0.10;

const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

export function walkOnSolid(ex, mesh) {
  const geom = mesh && mesh.geom;
  if (!geom || !geom.grid) return [];
  const pos = mesh.positions;
  const { grid, C, cyl0, cyl1 } = geom;
  const M = grid.length - 1;
  const wrap = k => ((k % C) + C) % C;

  // Out of the body is away from the middle of the ring you are standing on.
  // Works whatever the spine is doing, which the old version did not.
  const ringMid = [];
  for (let j = 0; j <= M; j++) {
    let x = 0, y = 0, z = 0;
    for (const v of grid[j]) { x += pos[v * 3]; y += pos[v * 3 + 1]; z += pos[v * 3 + 2]; }
    ringMid.push([x / C, y / C, z / C]);
  }

  const surface = (j, k, lift) => {
    const jj = Math.max(1, Math.min(M - 2, j));
    const j0 = Math.floor(jj), fj = jj - j0;
    const k0 = Math.floor(k), fk = k - k0;
    const p = [0, 0, 0];
    for (const [v, w] of [
      [grid[j0][wrap(k0)], (1 - fj) * (1 - fk)],
      [grid[j0][wrap(k0 + 1)], (1 - fj) * fk],
      [grid[j0 + 1][wrap(k0)], fj * (1 - fk)],
      [grid[j0 + 1][wrap(k0 + 1)], fj * fk],
    ]) {
      p[0] += pos[v * 3] * w; p[1] += pos[v * 3 + 1] * w; p[2] += pos[v * 3 + 2] * w;
    }
    const c = ringMid[j0], d = ringMid[j0 + 1];
    const n = norm([p[0] - (c[0] + (d[0] - c[0]) * fj),
                    p[1] - (c[1] + (d[1] - c[1]) * fj),
                    p[2] - (c[2] + (d[2] - c[2]) * fj)]);
    return [p[0] + n[0] * lift, p[1] + n[1] * lift, p[2] + n[2] * lift];
  };

  const offRing = (v, ring, lift) => {
    let cx = 0, cy = 0, cz = 0;
    for (const w of ring) { cx += pos[w * 3]; cy += pos[w * 3 + 1]; cz += pos[w * 3 + 2]; }
    cx /= ring.length; cy /= ring.length; cz /= ring.length;
    const p = [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
    const n = norm([p[0] - cx, p[1] - cy, p[2] - cz]);
    return [p[0] + n[0] * lift, p[1] + n[1] * lift, p[2] + n[2] * lift];
  };

  const paths = [];

  // ---- the grid ------------------------------------------------------
  const STEP = 4;
  for (let k = 0; k < C; k += STEP) {
    const line = [];
    for (let j = 1; j <= M - 1; j++) line.push(surface(j, k, GRID_LIFT));
    paths.push({ pts: line, rgb: GRID });
  }
  for (let j = 2; j <= M - 2; j += STEP) {
    const line = [];
    for (let k = 0; k <= C; k += 1) line.push(surface(j, k % C === 0 && k ? 0.001 : k, GRID_LIFT));
    paths.push({ pts: line, rgb: GRID });
  }
  for (const tube of geom.tubes) {
    if (!tube.rings) continue;
    const R = tube.rings;
    for (let s = 0; s < R.length; s += 6) {
      const ring = R[s].map(v => offRing(v, R[s], GRID_LIFT));
      paths.push({ pts: [...ring, ring[0]], rgb: GRID });
    }
    for (let k = 0; k < R[0].length; k += STEP) {
      paths.push({ pts: R.map(r => offRing(r[k], r, GRID_LIFT)), rgb: GRID });
    }
  }

  // ---- where the places sit ------------------------------------------
  const nodes = ex.nodes.filter(n => n.visited);
  if (!nodes.length) return paths;
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const spots = placeNodes(ex, nodes, index, geom, C);

  const dk = (a, b) => { let d = b - a; while (d > C / 2) d -= C; while (d < -C / 2) d += C; return d; };
  const walkPath = (a, b, steps = 22) => {
    const d = dk(a[1], b[1]);
    const out = [];
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      out.push(surface(a[0] + (b[0] - a[0]) * t, a[1] + d * t, WALK_LIFT));
    }
    return out;
  };

  const loopEdges = ex.loopEdges();
  for (const e of ex.edges) {
    if (loopEdges.has(e.id)) continue;
    const a = index.get(e.a.node), b = index.get(e.b.node);
    if (a === undefined || b === undefined || a === b) continue;
    paths.push({ pts: walkPath(spots[a], spots[b]), rgb: TRAIL, dash: 3 });
  }

  // ---- the loops, over their handles ---------------------------------
  ex.tubePlan().forEach((t, i) => {
    const tube = geom.tubes[i];
    if (!tube || !tube.rings) return;
    const R = tube.rings, mid = Math.floor(R.length / 2);
    let best = 0, far = -Infinity;
    R[mid].forEach((v, k) => {
      const d = Math.hypot(pos[v * 3] - ringMid[cyl0][0], pos[v * 3 + 1] - ringMid[cyl0][1],
                           pos[v * 3 + 2] - ringMid[cyl0][2]);
      if (d > far) { far = d; best = k; }
    });
    const along = (from, to) => {
      const out = [];
      const step = from <= to ? 1 : -1;
      for (let s = from; step > 0 ? s <= to : s >= to; s += step) out.push(offRing(R[s][best], R[s], WALK_LIFT));
      return out;
    };
    const foot = h => [h.j + Math.floor(geom.P / 2), h.k + Math.floor(geom.P / 2)];
    const ends = merge => {
      const e = ex.edges[merge.edge];
      const a = index.get(e.a.node), b = index.get(e.b.node);
      return a === undefined || b === undefined ? null : [spots[a], spots[b]];
    };

    const through = ends(t.through);
    if (through) {
      paths.push({ rgb: INK, dash: 5, wide: true, pts: [
        ...walkPath(through[0], foot(tube.holeA), 12),
        ...along(0, R.length - 1),
        ...walkPath(foot(tube.holeB), through[1], 12),
      ] });
    }
    if (t.around) {
      const round = ends(t.around);
      if (round) {
        const ring = R[mid].map(v => offRing(v, R[mid], WALK_LIFT + 0.02));
        paths.push({ rgb: INK, dash: 5, wide: true, pts: [
          ...walkPath(round[0], foot(tube.holeA), 12),
          ...along(0, mid), ...ring, ring[0], ...along(mid, R.length - 1),
          ...walkPath(foot(tube.holeB), round[1], 12),
        ] });
      }
    }
  });

  // ---- waypoints ------------------------------------------------------
  // Not every clearing. A walk of eighty hours leaves seventy-odd places, and
  // marking all of them buries the trail under its own dots. Mark the ones
  // worth marking: the camp, the dead fire, anywhere the path split, and
  // anywhere there was something to be had.
  nodes.forEach((n, i) => {
    const notable = n.isCamp || n.id === 0 || n.degree > 2 || n.supplies > 0;
    if (!notable) return;
    paths.push({
      pts: [], rgb: n.isCamp ? CAMP : INK, r: n.isCamp ? 4 : 2,
      dot: surface(spots[i][0], spots[i][1], MARK_LIFT),
    });
  });
  return paths;
}

// Spread the places over the body, in the body's own coordinates rather than
// on a flat sheet that is then wrapped round it. Laying them out flat and
// wrapping squashed one direction against the other and crossed the paths up.
function placeNodes(ex, nodes, index, geom, C) {
  const N = nodes.length;
  const rng = mulberry32(hashSeed('solid:' + ex.seed));
  const prof = geom.prof, M = geom.grid.length - 1;
  // The whole body, ends included, not just the straight middle: a long walk
  // needs every square of room it can get. Distances round the body are scaled
  // by how wide it is there, so the tapering ends do not get crowded.
  const j0 = 1.5, j1 = M - 1.5;
  const span = j1 - j0;
  const rAt = j => Math.max(0.15, prof[Math.max(0, Math.min(M, Math.round(j)))].r / geom.RBAR);
  const P = new Float64Array(N * 2);
  for (let i = 0; i < N; i++) {
    P[i * 2] = j0 + rng() * span;
    P[i * 2 + 1] = rng() * C;
  }
  const loopEdges = ex.loopEdges();
  const links = [];
  for (const e of ex.edges) {
    if (loopEdges.has(e.id)) continue;
    const a = index.get(e.a.node), b = index.get(e.b.node);
    if (a !== undefined && b !== undefined && a !== b) links.push([a, b]);
  }
  const holes = [];
  for (const t of geom.tubes) for (const h of [t.holeA, t.holeB]) if (h) holes.push([h.j, h.k]);

  const dk = (a, b) => { let d = b - a; while (d > C / 2) d -= C; while (d < -C / 2) d += C; return d; };

  // Fruchterman and Reingold: repulsion k^2/d, attraction d^2/k, with a
  // temperature that cools. Balancing a plain inverse-square push against a
  // linear spring by hand kept collapsing the tree into a band down one side,
  // because the springs win at exactly the scale the layout is trying to set.
  const k = Math.sqrt((span * C) / Math.max(1, N));
  const disp = new Float64Array(N * 2);
  const ITER = 600;
  for (let it = 0; it < ITER; it++) {
    disp.fill(0);
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const dj = P[i * 2] - P[j * 2];
        const d2 = dk(P[j * 2 + 1], P[i * 2 + 1]) * (rAt(P[i * 2]) + rAt(P[j * 2])) / 2;
        const d = Math.max(0.05, Math.hypot(dj, d2));
        const f = (k * k) / d / d;
        disp[i * 2] += dj * f; disp[i * 2 + 1] += d2 * f;
        disp[j * 2] -= dj * f; disp[j * 2 + 1] -= d2 * f;
      }
      const reach = geom.P * 1.4;
      for (const [hj, hk] of holes) {
        const dj = P[i * 2] - hj, d2 = dk(hk, P[i * 2 + 1]);
        const d = Math.hypot(dj, d2);
        if (d >= reach) continue;
        const f = (reach - d) / Math.max(d, 0.2);
        disp[i * 2] += dj * f * 1.5; disp[i * 2 + 1] += d2 * f * 1.5;
      }
    }
    for (const [a, b] of links) {
      const dj = P[a * 2] - P[b * 2];
      const d2 = dk(P[b * 2 + 1], P[a * 2 + 1]) * (rAt(P[a * 2]) + rAt(P[b * 2])) / 2;
      const d = Math.max(0.05, Math.hypot(dj, d2));
      const f = d / k;
      disp[a * 2] -= dj * f; disp[a * 2 + 1] -= d2 * f;
      disp[b * 2] += dj * f; disp[b * 2 + 1] += d2 * f;
    }
    const temp = (k * 0.7) * (1 - it / ITER) + 0.05;
    for (let i = 0; i < N; i++) {
      const d = Math.hypot(disp[i * 2], disp[i * 2 + 1]) || 1;
      const move = Math.min(d, temp) / d;
      P[i * 2] = Math.max(j0, Math.min(j1, P[i * 2] + disp[i * 2] * move));
      P[i * 2 + 1] = ((P[i * 2 + 1] + disp[i * 2 + 1] * move) % C + C) % C;
    }
  }
  return Array.from({ length: N }, (_, i) => [P[i * 2], P[i * 2 + 1]]);
}
