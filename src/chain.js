// The chain, assembled: handles in a row with a cylinder between each pair,
// as one mesh that is both the net and the solid.
//
// Each handle is a cut torus from handle.js, and each cylinder is a strip
// whose two ends are the rims of the handles either side of it. Because a rim
// is an unbroken arc of the cut piece's boundary rather than a circle in the
// middle of it, the strip can sit against it edge to edge, flat, and the whole
// chain lies down in one piece.
//
// Flat, each handle is laid out by pinning its boundary to a convex polygon
// and letting every inside vertex settle at the average of its neighbours.
// That is Tutte's embedding, and its virtue is that it cannot fold over: given
// a convex boundary it always comes out a proper drawing, with no overlaps to
// check for afterwards.

import { buildHandle, handleGluings, boundaryLoop, rimArc, rimUV } from './handle.js';

const CELL = 0.22;

export function buildChain(plan, opts = {}) {
  const n = plan.length;
  if (n < 1) return null;
  const nu = opts.nu || 24, nv = opts.nv || 20;
  const hu = opts.hu || 4, hv = opts.hv || 4;
  const R = 1.75, r = 0.6;
  const rimLen = 2 * (hu + hv);                 // edges round a rim
  const gap = opts.gap || 6;                    // cells along a cylinder

  // ---- the pieces -----------------------------------------------------
  const units = plan.map((p, i) => {
    const rims = n === 1 ? 0 : (i === 0 || i === n - 1) ? 1 : 2;
    // an end of the chain faces its one neighbour; a middle faces both ways
    const bOff = (rims === 1 && i === n - 1) ? -(1 + hv / 2) + nv / 2 : undefined;
    const h = buildHandle({ nu, nv, hu, hv, R, r, rims, bOff });
    h.twisted = !!p.twisted;
    h.index = i;
    return h;
  });

  // ---- one numbering for everything -----------------------------------
  const solid = [], flat = [], faces = [], offset = [];
  // For every vertex of a handle, the two angles it sits at. The roll is
  // worked out from these rather than by dragging each point in a straight
  // line to where it ends up, which is what made it impossible to follow.
  const ab = [];                                // [unit, alpha, beta] or null
  const push = (sx, sy, sz, meta) => {
    solid.push([sx, sy, sz]); flat.push([0, 0, 0]); ab.push(meta || null);
    return solid.length - 1;
  };

  const TAU = Math.PI * 2;
  const step = 2 * (R + r) + gap * CELL;
  units.forEach((h, i) => {
    offset.push(solid.length);
    const dx = (i - (n - 1) / 2) * step;
    for (let v = 0; v < h.V; v++) {
      const alpha = (((h.uv[v][0] + h.aOff) % h.nu) + h.nu) % h.nu * TAU / h.nu;
      const beta = (((h.uv[v][1] + h.bOff) % h.nv) + h.nv) % h.nv * TAU / h.nv;
      push(h.solid[v * 3] + dx, h.solid[v * 3 + 1], h.solid[v * 3 + 2], [i, alpha, beta]);
    }
    for (const f of h.faces) faces.push(f.map(x => x + offset[i]));
  });
  const g = (i, v) => v + offset[i];

  // ---- the cylinders between them --------------------------------------
  const bridges = [];
  for (let i = 0; i + 1 < n; i++) {
    const left = units[i], right = units[i + 1];
    // the rim on the right of this piece, and the one on the left of the next
    const leftHole = left.rims === 2 ? 1 : 0, rightHole = 0;
    const a = rimArc(left, leftHole).map(v => g(i, v));
    const b = rimArc(right, rightHole).map(v => g(i + 1, v));
    const m = a.length;
    // a ruled tube from one rim to the other; the far rim runs the other way
    // round so the two agree about which side is out
    const cols = [a];
    for (let s = 1; s < gap; s++) {
      const t = s / gap;
      const col = [];
      for (let k = 0; k < m; k++) {
        const p = solid[a[k]], q = solid[b[m - 1 - k]];
        col.push(push(p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t, null));
      }
      cols.push(col);
    }
    cols.push(b.slice().reverse());
    for (let s = 0; s + 1 < cols.length; s++) {
      for (let k = 0; k + 1 < m; k++) {
        faces.push([cols[s][k], cols[s][k + 1], cols[s + 1][k + 1], cols[s + 1][k]]);
      }
    }
    bridges.push({ cols, m, left: i, right: i + 1, leftHole, rightHole });
  }

  // ---- flat: each handle pinned to a polygon, each cylinder a rectangle --
  const unitW = 2.2, unitH = 2.2;
  units.forEach((h, i) => {
    const cx = (i - (n - 1) / 2) * (unitW + gap * CELL);
    const pin = pinFor(h, cx, unitW, unitH, rimLen, i, n);
    const xy = tutte(h, pin);
    for (let v = 0; v < h.V; v++) {
      flat[g(i, v)] = [xy[v * 2], xy[v * 2 + 1], 0];
    }
  });
  bridges.forEach((br, i) => {
    const { cols, m } = br;
    for (let s = 0; s < cols.length; s++) {
      const t = s / (cols.length - 1);
      for (let k = 0; k < m; k++) {
        const p = flat[cols[0][k]], q = flat[cols[cols.length - 1][k]];
        if (s === 0 || s === cols.length - 1) continue;
        flat[cols[s][k]] = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, 0];
      }
    }
  });

  const V = solid.length, F = faces.length;
  const pos = new Float32Array(V * 3), fl = new Float32Array(V * 3);
  for (let i = 0; i < V; i++) for (let c = 0; c < 3; c++) {
    pos[i * 3 + c] = solid[i][c]; fl[i * 3 + c] = flat[i][c];
  }
  const fa = new Int32Array(F * 4);
  for (let f = 0; f < F; f++) for (let c = 0; c < 4; c++) fa[f * 4 + c] = faces[f][c];
  const rgb = new Uint8Array(F * 3);
  for (let f = 0; f < F; f++) { rgb[f * 3] = 198; rgb[f * 3 + 1] = 191; rgb[f * 3 + 2] = 173; }

  return { V, F, faces: fa, positions: pos, flat: fl, rgb, seam: [], units, offset, bridges, plan,
           ab, R, r, step, n };
}

// Where each boundary vertex of a handle goes on the flat drawing. The rims
// are pinned to whole sides of a convex polygon -- a square for a lone handle,
// a pentagon for an end of the chain, a hexagon for a middle -- and everything
// else is spread round the sides that are left. Convex is the one thing Tutte
// asks for, and it is what makes the result a drawing rather than a knot.
function corners(k, cx, w, hh, turn) {
  // side 0 faces right, or left when turned: an odd polygon has no side
  // opposite another, so the end of a chain is turned round rather than
  // having its rim pinned to a slanted side
  const first = (k === 4 ? Math.PI / 4 : -Math.PI / k) + (turn ? Math.PI : 0);
  const out = [];
  for (let i = 0; i < k; i++) {
    const a = first + (i / k) * Math.PI * 2;
    out.push([cx + Math.cos(a) * w * 0.62, Math.sin(a) * hh * 0.62]);
  }
  return out;
}

function alongPolyline(pts, count) {
  const segs = [];
  let total = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const d = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    segs.push(d); total += d;
  }
  const out = [];
  for (let n = 0; n < count; n++) {
    let want = (count === 1 ? 0.5 : n / (count - 1)) * total;
    let i = 0;
    while (i < segs.length - 1 && want > segs[i]) { want -= segs[i]; i++; }
    const t = segs[i] ? want / segs[i] : 0;
    out.push([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t,
              pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t]);
  }
  return out;
}

function pinFor(h, cx, w, hh, rimLen, i, n) {
  const loop = boundaryLoop(h);
  const pinned = new Map();
  if (!loop.length) return pinned;
  const rims = [0, 1].slice(0, h.rims).map(k => new Set(rimArc(h, k)));
  const onRim = v => rims.findIndex(s => s.has(v));

  // cut the boundary walk into runs that lie on a rim and runs that do not
  let runs = [];
  let cur = { rim: onRim(loop[0]), list: [] };
  for (const v of loop) {
    const k = onRim(v);
    if (k !== cur.rim) { runs.push(cur); cur = { rim: k, list: [] }; }
    cur.list.push(v);
  }
  runs.push(cur);
  if (runs.length > 1 && runs[0].rim === runs[runs.length - 1].rim) {
    runs[0].list = runs.pop().list.concat(runs[0].list);   // the walk is a loop
  }

  const k = 4 + h.rims;                       // square, pentagon or hexagon
  const last = h.rims === 1 && i !== 0;       // the far end of the chain
  const P = corners(k, cx, w, hh, last);
  // side s runs from P[s] to P[s+1]; side 0 faces the neighbour, and for a
  // hexagon side 3 faces the other way
  const rimSideOf = new Map();
  if (h.rims === 1) rimSideOf.set(0, 0);
  if (h.rims === 2) { rimSideOf.set(0, Math.floor(k / 2)); rimSideOf.set(1, 0); }

  // rotate the runs so the first is a rim, when there is one
  if (h.rims > 0) {
    const at = runs.findIndex(r => r.rim >= 0);
    runs = runs.slice(at).concat(runs.slice(0, at));
  }

  const side = s => [P[s % k], P[(s + 1) % k]];
  for (let ri = 0; ri < runs.length; ri++) {
    const run = runs[ri];
    if (run.rim >= 0) {
      const [p, q] = side(rimSideOf.get(run.rim));
      alongPolyline([p, q], run.list.length).forEach((pt, j) => pinned.set(run.list[j], pt));
      continue;
    }
    // a free stretch fills the sides between the rim before it and the one
    // after; with no rims at all it goes the whole way round
    let from, to;
    if (h.rims === 0) { from = 0; to = k; }
    else {
      const prev = runs[(ri - 1 + runs.length) % runs.length];
      const next = runs[(ri + 1) % runs.length];
      from = rimSideOf.get(prev.rim) + 1;
      to = rimSideOf.get(next.rim);
      while (to <= from) to += k;
    }
    const pts = [];
    for (let sIdx = from; sIdx <= to; sIdx++) pts.push(P[sIdx % k]);
    alongPolyline(pts, run.list.length).forEach((pt, j) => pinned.set(run.list[j], pt));
  }
  return pinned;
}

// Tutte: pin the boundary, then let every other vertex sit at the average of
// its neighbours until it stops moving.
function tutte(h, pinned, iters = 900) {
  const nbr = new Map();
  const add = (a, b) => {
    if (!nbr.has(a)) nbr.set(a, new Set());
    nbr.get(a).add(b);
  };
  for (const f of h.faces) for (let i = 0; i < 4; i++) {
    add(f[i], f[(i + 1) % 4]); add(f[(i + 1) % 4], f[i]);
  }
  const xy = new Float64Array(h.V * 2);
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

// Everything that is still to be glued once it is laid flat.
export function chainGluings(chain) {
  const out = [];
  chain.units.forEach((h, i) => {
    for (const [a, b] of handleGluings(h, h.twisted)) out.push([a + chain.offset[i], b + chain.offset[i]]);
  });
  for (const br of chain.bridges) {
    for (const col of br.cols) out.push([col[0], col[col.length - 1]]);
  }
  return out;
}

// The roll, in two acts, the way a square is always shown becoming a torus:
// first the sheet curls round into a tube, then the tube bends round until its
// two ends meet. Dragging every point in a straight line from where it starts
// to where it ends up gets there as well, but it goes through shapes that are
// not surfaces on the way and there is nothing to follow.
//
// Each act is a bend of known radius, so the sheet stays a sheet throughout:
// curvature runs from nothing up to 1/r for the tube, then from nothing up to
// 1/R for the ring.
export function chainPositions(chain, t) {
  const { V, ab, flat, positions, R, r, bridges } = chain;
  const out = chain._scratch || (chain._scratch = new Float32Array(V * 3));
  const ease = x => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
  const CURL = 0.52;                             // where the first act ends
  const curl = ease(Math.min(1, t / CURL));
  const ring = ease(Math.max(0, (t - CURL) / (1 - CURL)));

  for (let i = 0; i < V; i++) {
    const m = ab[i];
    if (!m) continue;                            // a cylinder: ruled, below
    const [, alpha, beta] = m;
    const dx = positions[i * 3] - torus(alpha, beta, R, r)[0];   // its place in the row
    const p = bend(alpha, beta, R, r, curl, ring);
    // the flat piece is the pentagon, not the bare rectangle, so the first act
    // carries it from one to the other as it curls
    const fx = flat[i * 3], fy = flat[i * 3 + 1];
    out[i * 3] = fx + (p[0] + dx - fx) * curl;
    out[i * 3 + 1] = fy + (p[1] - fy) * curl;
    out[i * 3 + 2] = 0 + (p[2] - 0) * curl;
  }
  // cylinders stay ruled between the rims they join, wherever those have got to
  for (const br of bridges) {
    const cols = br.cols, last = cols.length - 1;
    for (let s = 1; s < last; s++) {
      const f = s / last;
      for (let k = 0; k < br.m; k++) {
        const a = cols[0][k], b = cols[last][k], c = cols[s][k];
        for (let d = 0; d < 3; d++) {
          out[c * 3 + d] = out[a * 3 + d] + (out[b * 3 + d] - out[a * 3 + d]) * f;
        }
      }
    }
  }
  return out;
}

function torus(alpha, beta, R, r) {
  const w = R + r * Math.cos(alpha);
  return [w * Math.cos(beta), r * Math.sin(alpha), w * Math.sin(beta)];
}

// curl: 0 flat, 1 rolled into a tube. ring: 0 straight tube, 1 closed ring.
function bend(alpha, beta, R, r, curl, ring) {
  // act one: the sheet rolls up. y and z are the cross-section.
  let y, z;
  if (curl < 1e-4) { y = r * alpha; z = r; }
  else {
    const rho = r / curl;
    const th = (r * alpha) / rho;
    y = rho * Math.sin(th);
    z = rho * Math.cos(th) + (r - rho);
  }
  // act two: the tube bends round. z runs along the tube, and the ring closes
  // in the xz plane, which is where the finished torus lives.
  const X = R * beta;
  if (ring < 1e-4) return [z, y, X];
  const rho = R / ring;
  const ph = X / rho;
  const rad = rho + z;
  // the ring's centre slides in as it closes, so the flat limit stays put and
  // the closed limit lands exactly on the torus
  return [rad * Math.cos(ph) - rho + R * ring, y, rad * Math.sin(ph)];
}

// A grid over the net, and the walk marked on it. Everything is given as
// vertex indices rather than points, so it follows the surface as it rolls up
// without being worked out again.
export function chainOverlay(chain, ex, opts = {}) {
  const GRID = [174, 167, 150], TRAIL = [58, 51, 42], MARK = [30, 26, 22], CAMP = [176, 122, 20];
  // Tutte crowds vertices towards the boundary, so a fine grid bunches up
  // along the edges and reads as speckle rather than as a grid.
  const stepU = opts.stepU || 6, stepV = opts.stepV || 5;
  const paths = [];
  const { units, offset } = chain;

  units.forEach((h, i) => {
    const g = v => (v < 0 ? -1 : v + offset[i]);
    for (let u = 0; u <= h.nu; u += stepU) {
      const line = [];
      for (let v = 0; v <= h.nv; v++) line.push(g(h.at(u, v)));
      paths.push({ ids: line.filter(v => v >= 0), rgb: GRID, kind: 'grid' });
    }
    for (let v = 0; v <= h.nv; v += stepV) {
      const line = [];
      for (let u = 0; u <= h.nu; u++) line.push(g(h.at(u, v)));
      paths.push({ ids: line.filter(v => v >= 0), rgb: GRID, kind: 'grid' });
    }
  });
  for (const br of chain.bridges) {
    for (let s = 0; s < br.cols.length; s += 3) paths.push({ ids: br.cols[s], rgb: GRID, kind: 'grid' });
    for (let k = 0; k < br.m; k += stepU) paths.push({ ids: br.cols.map(c => c[k]), rgb: GRID, kind: 'grid' });
  }
  if (!ex) return paths;

  // The route. It has to run the whole way: across a piece, through the
  // cylinder, and on across the next one. Drawn piece by piece it came out in
  // disconnected scraps with nothing joining them, which is not a route.
  //
  // Each piece is crossed along a corridor: a row of the grid that misses
  // every hole. The route comes in at the rim it entered by, climbs to the
  // corridor, runs along it past the waypoints, and drops to the rim it leaves
  // by. The cylinder is crossed straight across at a fixed place round it.
  const CROSS = k => k;                       // which way round the cylinder
  const notable = pickWaypoints(ex, units.length);
  const per = Math.ceil(notable.length / units.length);
  const routes = [];

  units.forEach((h, i) => {
    const inBridge = chain.bridges.find(b => b.right === i);
    const outBridge = chain.bridges.find(b => b.left === i);
    const gid = (u, v) => { const x = h.at(u, v); return x < 0 ? -1 : x + offset[i]; };

    // a row that no hole reaches into
    let corridor = -1;
    for (let v = h.nv - 1; v >= 1; v--) {
      let ok = true;
      for (let u = 0; u <= h.nu && ok; u++) if (h.at(u, v) < 0) ok = false;
      if (ok) { corridor = v; break; }
    }
    if (corridor < 0) corridor = h.nv - 1;

    const kIn = inBridge ? crossIndex(h, inBridge.rightHole, inBridge.m, true) : null;
    const kOut = outBridge ? crossIndex(h, outBridge.leftHole, outBridge.m, false) : null;
    const start = kIn ? kIn.uv : [1, corridor];
    const finish = kOut ? kOut.uv : [h.nu - 1, corridor];

    const mine = notable.slice(i * per, (i + 1) * per);
    const line = [];
    // Shortest way from one place to the next across the grid, going round the
    // holes rather than through them. Ruling a line out and then dropping the
    // vertices that were not there left the route jumping the gap, which is
    // not a route; a search cannot do that, because it only ever steps to a
    // square that exists.
    const step = (a, b) => {
      const path = walkGrid(h, a, b);
      for (let k = 0; k + 1 < path.length; k++) line.push(gid(path[k][0], path[k][1]));
    };
    // in from the rim, along the corridor past the waypoints, out to the rim
    const stops = [start, [start[0], corridor]];
    const spots = [];
    mine.forEach((node, k) => {
      const t = mine.length === 1 ? 0.5 : k / (mine.length - 1);
      const u = Math.round(start[0] + (finish[0] - start[0]) * t);
      const uu = Math.max(1, Math.min(h.nu - 1, u));
      if (gid(uu, corridor) >= 0) spots.push({ node, u: uu, v: corridor });
    });
    for (const sp of spots) stops.push([sp.u, corridor]);
    stops.push([finish[0], corridor], finish);
    for (let k = 0; k + 1 < stops.length; k++) step(stops[k], stops[k + 1]);
    line.push(gid(finish[0], finish[1]));
    routes.push(line.filter(v => v >= 0));

    for (const sp of spots) {
      const v = gid(sp.u, sp.v);
      if (v >= 0) paths.push({ ids: [], dotId: v, rgb: sp.node.isCamp ? CAMP : MARK, r: sp.node.isCamp ? 4 : 2, kind: 'mark' });
    }
    if (kIn) routes.push([gid(kIn.uv[0], kIn.uv[1])].filter(v => v >= 0));
  });

  // and across each cylinder, joining the piece before to the piece after
  chain.bridges.forEach(br => {
    const k = crossIndex(units[br.left], br.leftHole, br.m, false).index;
    routes.push(br.cols.map(c => c[k]));
  });

  for (const line of routes) {
    if (line.length > 1) paths.push({ ids: line, rgb: TRAIL, dash: 3, wide: true, kind: 'trail' });
  }
  return paths;
}

// Breadth-first across a handle's grid, avoiding whatever the holes took out.
function walkGrid(h, from, to) {
  const w = h.nu + 1;
  const key = (u, v) => v * w + u;
  const prev = new Map([[key(from[0], from[1]), null]]);
  const q = [from];
  for (let i = 0; i < q.length; i++) {
    const [u, v] = q[i];
    if (u === to[0] && v === to[1]) break;
    for (const [du, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nu2 = u + du, nv2 = v + dv;
      if (nu2 < 0 || nv2 < 0 || nu2 > h.nu || nv2 > h.nv) continue;
      if (h.at(nu2, nv2) < 0) continue;
      const k = key(nu2, nv2);
      if (prev.has(k)) continue;
      prev.set(k, [u, v]);
      q.push([nu2, nv2]);
    }
  }
  const out = [];
  let cur = to;
  if (!prev.has(key(to[0], to[1]))) return [from];
  while (cur) { out.push(cur); cur = prev.get(key(cur[0], cur[1])); }
  return out.reverse();
}

// Where a route meets a rim, and how far round the cylinder that is. The
// cylinder joins index k of one rim to index m-1-k of the other, so the two
// sides have to agree or the route steps off into space at the join.
function crossIndex(h, hole, m, isRight) {
  const uv = rimUV(h, hole);
  const idx = h.hu + Math.floor(h.hv / 2);
  // The cylinder joins index k of the near rim to index m-1-k of the far one,
  // since the far rim runs the other way round so the two agree about which
  // side is out. Read the wrong one and the route steps off into space where
  // the pieces meet.
  return isRight ? { index: idx, uv: uv[m - 1 - idx] } : { index: idx, uv: uv[idx] };
}

// A handful of places worth marking, spread through the walk in the order they
// were reached.
function pickWaypoints(ex, pieces) {
  const all = ex.nodes.filter(n => n.visited &&
    (n.isCamp || n.id === 0 || n.degree > 2 || n.supplies > 0));
  if (!all.length) return [];
  const want = Math.min(all.length, Math.max(4, pieces * 4));
  const keep = new Set([0, all.length - 1]);
  for (let k = 0; k < want; k++) keep.add(Math.round((k * (all.length - 1)) / Math.max(1, want - 1)));
  all.forEach((n, i) => { if (n.isCamp) keep.add(i); });
  return all.filter((_, i) => keep.has(i));
}
