// The walk, drawn on the solid.
//
// The tree lies on the capsule, because a tree lies flat on a sphere. Each
// loop that was closed climbs to its handle: the first loop of a pair goes
// through the tube, and the second goes up and rings it once, since that is
// the other independent way to walk a handle and the reason two loops need
// only one tube between them.
//
// Every point here is a vertex of the actual mesh, nudged out along its own
// surface, rather than a point worked out from the shape the mesh started as.
// The mesh is smoothed after it is built, so anything placed by the original
// arithmetic would sink into it or float off it near the joins, which is
// exactly where the interesting parts of the walk are.

import { layout } from './sketch.js';

const INK = [30, 26, 22];
const CAMP = [176, 122, 20];
const LIFT = 0.055;

const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

export function walkOnSolid(ex, mesh) {
  const geom = mesh && mesh.geom;
  if (!geom || !geom.grid) return [];
  const pos = mesh.positions;
  const { grid, prof, cyl0, cyl1, C } = geom;
  const M = grid.length - 1;
  const at = v => [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];

  // out of the capsule is away from its axis; out of a tube is away from the
  // middle of the ring the vertex sits on
  const offAxis = (v, lift = LIFT) => {
    const p = at(v);
    const n = norm([0, p[1], p[2]]);
    return [p[0] + n[0] * lift, p[1] + n[1] * lift, p[2] + n[2] * lift];
  };
  const offRing = (v, ring, lift = LIFT) => {
    const p = at(v);
    let cx = 0, cy = 0, cz = 0;
    for (const w of ring) { const q = at(w); cx += q[0]; cy += q[1]; cz += q[2]; }
    cx /= ring.length; cy /= ring.length; cz /= ring.length;
    const n = norm([p[0] - cx, p[1] - cy, p[2] - cz]);
    return [p[0] + n[0] * lift, p[1] + n[1] * lift, p[2] + n[2] * lift];
  };

  const vert = (j, k) => grid[Math.max(1, Math.min(M - 1, Math.round(j)))][((Math.round(k) % C) + C) % C];
  const wrap = k => ((k % C) + C) % C;

  // Between grid vertices rather than snapped to them: snapping drew the walk
  // as a staircase, since a path across the capsule almost never runs along
  // the grid.
  const surface = (j, k, lift = LIFT) => {
    const jj = Math.max(1, Math.min(M - 2, j));
    const j0 = Math.floor(jj), fj = jj - j0;
    const k0 = Math.floor(k), fk = k - k0;
    const p = [0, 0, 0];
    const corners = [
      [grid[j0][wrap(k0)], (1 - fj) * (1 - fk)],
      [grid[j0][wrap(k0 + 1)], (1 - fj) * fk],
      [grid[j0 + 1][wrap(k0)], fj * (1 - fk)],
      [grid[j0 + 1][wrap(k0 + 1)], fj * fk],
    ];
    for (const [v, w] of corners) {
      p[0] += pos[v * 3] * w; p[1] += pos[v * 3 + 1] * w; p[2] += pos[v * 3 + 2] * w;
    }
    const n = norm([0, p[1], p[2]]);
    return [p[0] + n[0] * lift, p[1] + n[1] * lift, p[2] + n[2] * lift];
  };

  const dk = (a, b) => { let d = b - a; while (d > C / 2) d -= C; while (d < -C / 2) d += C; return d; };
  const gridPath = (a, b, steps = 20) => {
    const d = dk(a[1], b[1]);
    const out = [];
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      out.push(surface(a[0] + (b[0] - a[0]) * t, a[1] + d * t));
    }
    return out;
  };

  const loops = ex.loopEdges();
  const lay = ex._solidLayout || (ex._solidLayout = layout(ex, 700, { skip: loops }));
  const { ids, index, pos: flat, N } = lay;
  if (!N) return [];

  // spread the tree over the body, off the very top where the tubes come out
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < N; i++) {
    x0 = Math.min(x0, flat[i * 2]); x1 = Math.max(x1, flat[i * 2]);
    y0 = Math.min(y0, flat[i * 2 + 1]); y1 = Math.max(y1, flat[i * 2 + 1]);
  }
  const sx = (x1 - x0) || 1, sy = (y1 - y0) || 1;
  const place = i => {
    const u = (flat[i * 2] - x0) / sx, v = (flat[i * 2 + 1] - y0) / sy;
    return [cyl0 + (0.06 + 0.88 * u) * (cyl1 - cyl0), C / 2 + (v - 0.5) * C * 0.78];
  };

  const paths = [];
  for (const [a, b] of lay.links) {
    if (a === b) continue;
    paths.push({ pts: gridPath(place(a), place(b)), rgb: INK, wide: true });
  }

  const plan = ex.tubePlan();
  plan.forEach((t, i) => {
    const tube = geom.tubes[i];
    if (!tube || !tube.rings) return;
    const rings = tube.rings;
    const mid = Math.floor(rings.length / 2);
    // follow the outside of the tube: whichever way round is furthest from
    // the capsule's axis when it is over the top
    let best = 0, far = -Infinity;
    rings[mid].forEach((v, k) => {
      const p = at(v);
      const d = Math.hypot(p[1], p[2]);
      if (d > far) { far = d; best = k; }
    });
    const along = (from, to) => {
      const out = [];
      const step = from <= to ? 1 : -1;
      for (let s = from; step > 0 ? s <= to : s >= to; s += step) {
        out.push(offRing(rings[s][best], rings[s]));
      }
      return out;
    };
    const footOf = ringIndex => {
      // where the tube meets the capsule, in grid terms
      const p = at(rings[ringIndex][best]);
      let j = cyl0, gap = Infinity;
      for (let q = cyl0; q <= cyl1; q++) {
        if (Math.abs(prof[q].x - p[0]) < gap) { gap = Math.abs(prof[q].x - p[0]); j = q; }
      }
      return [j, (Math.atan2(p[2], p[1]) / (2 * Math.PI)) * C];
    };
    const ends = merge => {
      const e = ex.edges[merge.edge];
      const a = index.get(e.a.node), b = index.get(e.b.node);
      return a === undefined || b === undefined ? null : [place(a), place(b)];
    };

    const through = ends(t.through);
    if (through) {
      paths.push({ rgb: INK, wide: true, pts: [
        ...gridPath(through[0], footOf(0), 10),
        ...along(0, rings.length - 1),
        ...gridPath(footOf(rings.length - 1), through[1], 10),
      ] });
    }

    if (t.around) {
      const round = ends(t.around);
      if (round) {
        const ring = rings[mid].map(v => offRing(v, rings[mid], LIFT + 0.02));
        paths.push({ rgb: INK, wide: true, pts: [
          ...gridPath(round[0], footOf(0), 10),
          ...along(0, mid),
          ...ring, ring[0],
          ...along(mid, rings.length - 1),
          ...gridPath(footOf(rings.length - 1), round[1], 10),
        ] });
      }
    }
  });

  for (let i = 0; i < N; i++) {
    const n = ex.node(ids[i]);
    if (!n.isCamp) continue;
    const g = place(i);
    paths.push({ pts: [], rgb: CAMP, dot: surface(g[0], g[1], LIFT + 0.03) });
  }
  return paths;
}
