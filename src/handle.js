// One handle of the chain, in both of its forms at once.
//
// The correspondence we need is between the pentagon a b a^-1 b^-1 c and a
// torus with a disc taken out of it. Going pentagon-first does not work: the
// pentagon is a cut of the surface along two loops based on the rim, and
// writing that cut down on a grid is awkward. Going torus-first does work, and
// gives the pentagon for free.
//
// Take the torus as a grid in u and v, both wrapped. Cut it along u = 0 and
// along v = 0 and it opens into a square, which is the closed torus, a b a^-1
// b^-1. Take a disc out of the middle and it is no longer a disc itself, so
// cut a slit from the hole out to the edge. Now it is simply connected, and
// its boundary reads round as
//
//     a  b  a^-1  (part of b^-1)  s  c  s^-1  (rest of b^-1)
//
// The thing worth noticing is that c, the rim, is one unbroken arc, with the
// two sides of the slit either side of it. That is the whole point. A rim that
// is a closed circle in the middle of a sheet can never be glued to anything
// edge to edge; a rim that is an arc of the boundary can. The slit is what
// turns one into the other, and it costs nothing, because its two sides are
// glued straight back to each other.
//
// It also does not break the gluing counts. The slit meets the u = 0 edge and
// splits it in two, so b^-1 arrives in two pieces, but the two pieces still
// have between them exactly as many cells as b, so every cell still has its
// partner.
//
// The map to three dimensions is then the identity on (u, v): a grid point
// goes to the point of a torus of revolution at those two angles. Duplicated
// vertices -- the far edges, and the two lips of the slit -- land on the same
// point, which is exactly what it means for them to be glued.

const TAU = Math.PI * 2;

export function buildHandle(opts = {}) {
  const nu = opts.nu || 24;                 // round the tube
  const nv = opts.nv || 16;                 // round the ring
  const R = opts.R || 1.7;                  // ring radius
  const r = opts.r || 0.62;                 // tube radius
  const hu = opts.hu || 5, hv = opts.hv || 5;   // the hole, in cells
  const u0 = opts.u0 !== undefined ? opts.u0 : Math.round(nu / 2) - Math.floor(hu / 2);
  const v0 = opts.v0 !== undefined ? opts.v0 : Math.round(nv / 2) - Math.floor(hv / 2);

  // Vertices of the cut square: u and v both run one past the end, so the far
  // edge is a separate copy of the near one and can be glued to it.
  const id = new Int32Array((nu + 1) * (nv + 1)).fill(-1);
  const uv = [];
  const at = (u, v) => id[v * (nu + 1) + u];
  const inHole = (u, v) => u > u0 && u < u0 + hu && v > v0 && v < v0 + hv;
  for (let v = 0; v <= nv; v++) {
    for (let u = 0; u <= nu; u++) {
      if (inHole(u, v)) continue;           // the hole's inside is not there
      id[v * (nu + 1) + u] = uv.length;
      uv.push([u, v, 0]);                   // 0: an original, not a slit copy
    }
  }

  // The slit: along v = v0, from the hole's left edge out to u = 0. The
  // vertices on it get a second copy, and the faces below the slit use it, so
  // the two lips can come apart.
  const vs = v0;
  const lower = new Map();
  for (let u = 0; u <= u0; u++) {
    lower.set(u, uv.length);
    uv.push([u, vs, 1]);                    // 1: the lower lip
  }
  const onSlit = (u, v) => v === vs && u <= u0;

  const faces = [];
  for (let v = 0; v < nv; v++) {
    for (let u = 0; u < nu; u++) {
      const cell = [[u, v], [u + 1, v], [u + 1, v + 1], [u, v + 1]];
      if (cell.every(([cu, cv]) => inHole(cu, cv) ||
          (cu > u0 && cu < u0 + hu && cv > v0 && cv < v0 + hv))) continue;
      // a cell inside the hole has all four corners missing
      if (cell.some(([cu, cv]) => at(cu, cv) < 0)) continue;
      const below = v < vs;                 // faces under the slit use the copy
      const q = cell.map(([cu, cv]) =>
        (below && onSlit(cu, cv)) ? lower.get(cu) : at(cu, cv));
      faces.push(q);
    }
  }

  // Where each vertex sits on the torus. The u angle goes round the tube, the
  // v angle round the ring, and a duplicate lands on its original.
  const solid = new Float32Array(uv.length * 3);
  for (let i = 0; i < uv.length; i++) {
    const a = (uv[i][0] % nu) * TAU / nu;
    const b = (uv[i][1] % nv) * TAU / nv;
    const rad = R + r * Math.cos(a);
    solid[i * 3] = rad * Math.cos(b);
    solid[i * 3 + 1] = r * Math.sin(a);
    solid[i * 3 + 2] = rad * Math.sin(b);
  }

  return { nu, nv, hu, hv, u0, v0, vs, uv, faces, solid, at, lower, V: uv.length, F: faces.length };
}

// Which vertices are glued to which, once it is rolled up: the far edges back
// to the near ones, and the two lips of the slit back together.
export function handleGluings(h, twisted) {
  const out = [];
  const { nu, nv, at, lower, u0, vs } = h;
  for (let v = 0; v <= nv; v++) {
    const a = at(0, v), b = at(nu, v);
    if (a >= 0 && b >= 0) out.push([a, b]);
  }
  for (let u = 0; u <= nu; u++) {
    // twisted: the ring closes with a flip, which is what makes it a klein
    // bottle rather than a torus
    const a = at(u, 0), b = at(twisted ? (nu - u) : u, nv);
    if (a >= 0 && b >= 0) out.push([a, b]);
  }
  for (let u = 0; u <= u0; u++) {
    const a = at(u, vs), b = lower.get(u);
    if (a >= 0 && b !== undefined) out.push([a, b]);
  }
  return out;
}

// The boundary of the cut piece, walked once. Each undirected edge used by
// exactly one face is on it.
export function boundaryLoop(h) {
  const count = new Map();
  const key = (a, b) => (a < b ? a + ':' + b : b + ':' + a);
  for (const f of h.faces) {
    for (let i = 0; i < 4; i++) {
      const k = key(f[i], f[(i + 1) % 4]);
      count.set(k, (count.get(k) || 0) + 1);
    }
  }
  const adj = new Map();
  for (const f of h.faces) {
    for (let i = 0; i < 4; i++) {
      const a = f[i], b = f[(i + 1) % 4];
      if (count.get(key(a, b)) !== 1) continue;
      if (!adj.has(a)) adj.set(a, []);
      if (!adj.has(b)) adj.set(b, []);
      adj.get(a).push(b); adj.get(b).push(a);
    }
  }
  if (!adj.size) return [];
  const start = adj.keys().next().value;
  const loop = [start];
  const seen = new Set([start]);
  let cur = start;
  for (;;) {
    const next = (adj.get(cur) || []).find(w => !seen.has(w));
    if (next === undefined) break;
    loop.push(next); seen.add(next); cur = next;
  }
  return loop;
}
