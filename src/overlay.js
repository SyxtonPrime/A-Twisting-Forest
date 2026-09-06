// The walk, drawn on the solid.
//
// The tree lies on the capsule, because a tree lies flat on a sphere. Each
// loop that was closed climbs to its handle: the first loop of a pair goes
// through the tube, and the second goes up and round it once, since that is
// the other independent way to walk a handle and the reason two loops need
// only one tube between them.

import { layout } from './sketch.js';

const INK = [30, 26, 22];
const CAMP = [176, 122, 20];
const LIFT = 1.035;                 // just off the surface, so it is not eaten by it

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// shortest way round the cylinder
function dth(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

export function walkOnSolid(ex, geom) {
  if (!geom) return [];
  const R = geom.RBAR, L = geom.L;
  const onCap = (x, th, lift = LIFT) =>
    [Math.max(-L / 2, Math.min(L / 2, x)), R * lift * Math.cos(th), R * lift * Math.sin(th)];
  const capOf = p => [p[0], Math.atan2(p[2], p[1])];

  const loops = ex.loopEdges();
  const lay = ex._solidLayout || (ex._solidLayout = layout(ex, 700, { skip: loops }));
  const { ids, index, pos, links, N } = lay;
  if (!N) return [];

  // the tree, spread over the body of the capsule but off the very top,
  // which is where the tubes come out
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < N; i++) {
    x0 = Math.min(x0, pos[i * 2]); x1 = Math.max(x1, pos[i * 2]);
    y0 = Math.min(y0, pos[i * 2 + 1]); y1 = Math.max(y1, pos[i * 2 + 1]);
  }
  const spanX = (x1 - x0) || 1, spanY = (y1 - y0) || 1;
  const place = i => {
    const u = (pos[i * 2] - x0) / spanX, v = (pos[i * 2 + 1] - y0) / spanY;
    return [-L / 2 + (0.09 + 0.82 * u) * L, Math.PI + (v - 0.5) * 1.62 * Math.PI];
  };
  const nodeAt = new Map();
  for (let i = 0; i < N; i++) nodeAt.set(ids[i], place(i));

  const paths = [];
  const surfacePath = (a, b, steps = 14, lift = LIFT) => {
    const d = dth(a[1], b[1]);
    const pts = [];
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      pts.push(onCap(a[0] + (b[0] - a[0]) * t, a[1] + d * t, lift));
    }
    return pts;
  };

  for (const [a, b] of links) {
    if (a === b) continue;
    paths.push({ pts: surfacePath(place(a), place(b)), rgb: INK, wide: true });
  }

  // the tubes, and the loops that use them
  const plan = ex.tubePlan();
  plan.forEach((t, i) => {
    const tube = geom.tubes[i];
    if (!tube) return;
    const alongTube = (from, to, lift = 1.09) => {
      const pts = [];
      const n = tube.centres.length - 1;
      const a = Math.round(from * n), b = Math.round(to * n);
      const step = a <= b ? 1 : -1;
      for (let s = a; step > 0 ? s <= b : s >= b; s += step) {
        const f = tube.frames[s];
        pts.push(add(tube.centres[s], mul(norm(f.U), tube.rad * lift)));
      }
      return pts;
    };
    const endsOf = merge => {
      const e = ex.edges[merge.edge];
      const A = nodeAt.get(e.a.node), B = nodeAt.get(e.b.node);
      return [A, B];
    };
    const capA = capOf(tube.cA), capB = capOf(tube.cB);

    // through the tube
    const [uA, uB] = endsOf(t.through);
    if (uA && uB) {
      paths.push({ rgb: INK, wide: true, pts: [
        ...surfacePath(uA, capA, 10),
        ...alongTube(0, 1),
        ...surfacePath(capB, uB, 10),
      ] });
    }

    // and round it, if a second loop went that way
    if (t.around) {
      const [vA, vB] = endsOf(t.around);
      if (vA && vB) {
        const mid = Math.floor((tube.centres.length - 1) / 2);
        const f = tube.frames[mid], c = tube.centres[mid];
        const ring = [];
        for (let k = 0; k <= 40; k++) {
          const a = (k / 40) * Math.PI * 2;
          ring.push(add(c, add(mul(f.U, Math.cos(a) * tube.rad * 1.13),
                               mul(f.V, Math.sin(a) * tube.rad * 1.13))));
        }
        paths.push({ rgb: INK, wide: true, pts: [
          ...surfacePath(vA, capA, 10),
          ...alongTube(0, mid / (tube.centres.length - 1), 1.13),
          ...ring,
          ...alongTube(mid / (tube.centres.length - 1), 1, 1.13),
          ...surfacePath(capB, vB, 10),
        ] });
      }
    }
  });

  // where they stopped, and the camp
  for (let i = 0; i < N; i++) {
    const n = ex.node(ids[i]);
    if (!n.isCamp) continue;
    const p = place(i);
    paths.push({ pts: [], rgb: CAMP, dot: onCap(p[0], p[1], LIFT + 0.02) });
  }
  return paths;
}
