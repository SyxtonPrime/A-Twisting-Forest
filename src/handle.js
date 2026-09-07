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

// `rims` is how many discs to take out: none for a lone handle, one for an end
// of the chain, two for a middle. Each gets its own slit, run out to the left
// edge along its own row, so every rim ends up as one unbroken arc of the
// boundary.
export function buildHandle(opts = {}) {
  const nu = opts.nu || 24;                 // round the tube
  const nv = opts.nv || 20;                 // round the ring
  const R = opts.R || 1.75;                 // ring radius
  const r = opts.r || 0.6;                  // tube radius
  const hu = opts.hu || 4, hv = opts.hv || 4;   // each hole, in cells
  const rims = opts.rims === undefined ? 1 : opts.rims;
  const u0 = opts.u0 !== undefined ? opts.u0 : Math.round(nu / 2);

  // Where round the ring the first hole sits. One row up from the bottom by
  // default, so the slit comes out one cell short of the corner and the piece
  // reads as a pentagon with a tab rather than as something with a long side
  // torn in half. A chain wants it somewhere in particular instead -- on the
  // side of the torus that faces the neighbour it is joined to -- so it can be
  // said.
  const v0 = opts.v0 === undefined ? 1 : opts.v0;
  // `rows` says where every hole goes and there may be any number of them,
  // which is what a piece in the middle of a tree needs. Without it the old
  // one or two, evenly placed.
  const rows = opts.rows || (rims >= 2 ? [v0, v0 + Math.round(nv / 2)]
                           : rims >= 1 ? [v0] : []);
  const holes = rows.map(r => ({ u0, v0: r }));

  const slitRow = new Map(holes.map(h => [h.v0, h]));
  const inHole = (u, v) => holes.some(h => u > h.u0 && u < h.u0 + hu && v > h.v0 && v < h.v0 + hv);

  const id = new Int32Array((nu + 1) * (nv + 1)).fill(-1);
  const uv = [];
  const at = (u, v) => (u < 0 || v < 0 || u > nu || v > nv) ? -1 : id[v * (nu + 1) + u];
  for (let v = 0; v <= nv; v++) {
    for (let u = 0; u <= nu; u++) {
      if (inHole(u, v)) continue;
      id[v * (nu + 1) + u] = uv.length;
      uv.push([u, v, -1]);                  // -1: an original, not a slit copy
    }
  }
  // the lower lip of each slit
  const lower = new Map();                  // "u,v" -> vertex
  holes.forEach((h, hi) => {
    for (let u = 0; u <= h.u0; u++) {
      lower.set(u + ',' + h.v0, uv.length);
      uv.push([u, h.v0, hi]);
    }
  });

  const faces = [];
  for (let v = 0; v < nv; v++) {
    for (let u = 0; u < nu; u++) {
      const cell = [[u, v], [u + 1, v], [u + 1, v + 1], [u, v + 1]];
      if (cell.some(([cu, cv]) => at(cu, cv) < 0)) continue;
      const q = cell.map(([cu, cv]) => {
        // a face is below a slit exactly when the slit is its upper row
        const h = slitRow.get(cv);
        const use = h && cv === v + 1 && cu <= h.u0 ? lower.get(cu + ',' + cv) : undefined;
        return use === undefined ? at(cu, cv) : use;
      });
      faces.push(q);
    }
  }

  // Turn the grid before wrapping it so a hole lands where it is wanted on the
  // torus: on the outer equator, facing the piece it will be joined to.
  const aOff = opts.aOff === undefined ? -(u0 + hu / 2) : opts.aOff;
  const bOff = opts.bOff === undefined ? -(holes.length ? holes[0].v0 + hv / 2 : 0) : opts.bOff;
  const solid = new Float32Array(uv.length * 3);
  for (let i = 0; i < uv.length; i++) {
    const a = (((uv[i][0] + aOff) % nu) + nu) % nu * TAU / nu;
    const b = (((uv[i][1] + bOff) % nv) + nv) % nv * TAU / nv;
    const rad = R + r * Math.cos(a);
    solid[i * 3] = rad * Math.cos(b);
    solid[i * 3 + 1] = r * Math.sin(a);
    solid[i * 3 + 2] = rad * Math.sin(b);
  }

  return { nu, nv, hu, hv, R, r, rims: holes.length, holes, uv, faces, solid, at, lower,
           aOff, bOff, V: uv.length, F: faces.length };
}

// Which vertices are glued to which once it is rolled up: the far edges back
// to the near ones, and each slit's two lips back together.
export function handleGluings(h, twisted) {
  const out = [];
  const { nu, nv, at, lower, holes } = h;
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
  for (const hole of holes) {
    for (let u = 0; u <= hole.u0; u++) {
      const a = at(u, hole.v0), b = lower.get(u + ',' + hole.v0);
      if (a >= 0 && b !== undefined) out.push([a, b]);
    }
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

// The rim of one hole, walked once, as it appears in the cut piece: an arc
// that starts on the lower lip of the slit and ends on the upper one. Those
// two ends become the same point when it is rolled up, which is when the arc
// closes into a circle.
// The same walk as rimArc, but as grid coordinates, so a route can be laid
// out to meet the rim at a chosen point.
export function rimUV(h, which = 0) {
  const hole = h.holes[which];
  if (!hole) return [];
  const { u0, v0 } = hole, { hu, hv } = h;
  const arc = [[u0, v0]];
  for (let u = u0 + 1; u <= u0 + hu; u++) arc.push([u, v0]);
  for (let v = v0 + 1; v <= v0 + hv; v++) arc.push([u0 + hu, v]);
  for (let u = u0 + hu - 1; u >= u0; u--) arc.push([u, v0 + hv]);
  for (let v = v0 + hv - 1; v >= v0; v--) arc.push([u0, v]);
  return arc;
}

export function rimArc(h, which = 0) {
  const hole = h.holes[which];
  if (!hole) return [];
  const { u0, v0 } = hole, { hu, hv, at, lower } = h;
  const arc = [lower.get(u0 + ',' + v0)];
  for (let u = u0 + 1; u <= u0 + hu; u++) arc.push(at(u, v0));
  for (let v = v0 + 1; v <= v0 + hv; v++) arc.push(at(u0 + hu, v));
  for (let u = u0 + hu - 1; u >= u0; u--) arc.push(at(u, v0 + hv));
  for (let v = v0 + hv - 1; v >= v0; v--) arc.push(at(u0, v));
  return arc;
}
