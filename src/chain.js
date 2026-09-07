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

import { buildHandle, handleGluings, boundaryLoop, rimArc } from './handle.js';

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
  const push = (sx, sy, sz) => { solid.push([sx, sy, sz]); flat.push([0, 0, 0]); return solid.length - 1; };

  units.forEach((h, i) => {
    offset.push(solid.length);
    for (let v = 0; v < h.V; v++) push(h.solid[v * 3], h.solid[v * 3 + 1], h.solid[v * 3 + 2]);
    for (const f of h.faces) faces.push(f.map(x => x + offset[i]));
  });
  const g = (i, v) => v + offset[i];

  // Slide each donut along so they stand in a row, just clear of each other.
  const step = 2 * (R + r) + gap * CELL;
  units.forEach((h, i) => {
    const dx = (i - (n - 1) / 2) * step;
    for (let v = 0; v < h.V; v++) solid[g(i, v)][0] += dx;
  });

  // ---- the cylinders between them --------------------------------------
  const bridges = [];
  for (let i = 0; i + 1 < n; i++) {
    const left = units[i], right = units[i + 1];
    // the rim on the right of this piece, and the one on the left of the next
    const a = rimArc(left, left.rims === 2 ? 1 : 0).map(v => g(i, v));
    const b = rimArc(right, 0).map(v => g(i + 1, v));
    const m = a.length;
    // a ruled tube from one rim to the other; the far rim runs the other way
    // round so the two agree about which side is out
    const cols = [a];
    for (let s = 1; s < gap; s++) {
      const t = s / gap;
      const col = [];
      for (let k = 0; k < m; k++) {
        const p = solid[a[k]], q = solid[b[m - 1 - k]];
        col.push(push(p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t));
      }
      cols.push(col);
    }
    cols.push(b.slice().reverse());
    for (let s = 0; s + 1 < cols.length; s++) {
      for (let k = 0; k + 1 < m; k++) {
        faces.push([cols[s][k], cols[s][k + 1], cols[s + 1][k + 1], cols[s + 1][k]]);
      }
    }
    bridges.push({ cols, m });
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

  return { V, F, faces: fa, positions: pos, flat: fl, rgb, seam: [], units, offset, bridges, plan };
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
