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
// of the chain, two for a middle. Each gets its own slit, run out to the edge
// of the sheet, so every rim ends up as one unbroken arc of the boundary.
//
// Where the slit comes out matters more than it looks. Run them all straight
// out along their own row to the u = 0 edge -- which is what happens without
// `slots`, and what the chain wants -- and every mouth lands in the middle of
// that one edge and breaks it into k + 1 arcs. The piece then reads as three
// whole sides and a fourth shredded, instead of as the (4 + k)-gon it is.
//
// `slots` sends each slit to a corner of the sheet instead, one per slit, so
// no edge is broken anywhere but a cell or two from its end. Then the boundary
// reads a c1 b c2 a^-1 c3 b^-1 c4, edges and rims alternating, which is the
// classification theorem's own picture of the thing. Four corners, so four
// necks is the most a piece can have.
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
  // which corner of the sheet each slit is sent to, if any
  const slots = opts.slots || null;
  const holes = rows.map((r, i) => ({ u0, v0: r, slot: slots ? slots[i] : undefined }));

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
  // Each slit is a path of grid vertices from the rim out to an edge, and it
  // is cut by giving every vertex on it a second copy -- the far lip -- which
  // the faces on one side of the path use in place of the original.
  const paths = holes.map(h => cutPath(h, nu, nv));
  const onPath = paths.map(p => new Set(p.map(([u, v]) => u + ',' + v)));
  const lower = new Map();                  // "u,v" -> the far lip's vertex
  paths.forEach((p, hi) => {
    for (const [u, v] of p) {
      lower.set(u + ',' + v, uv.length);
      uv.push([u, v, hi]);
    }
  });
  const whole = (u, v) => u >= 0 && v >= 0 && u < nu && v < nv &&
    at(u, v) >= 0 && at(u + 1, v) >= 0 && at(u + 1, v + 1) >= 0 && at(u, v + 1) >= 0;
  const far = new Map();                    // "fu,fv" -> which slit that face is behind
  paths.forEach((p, hi) => { for (const k of leftFaces(p, whole)) far.set(k, hi); });

  const faces = [];
  for (let v = 0; v < nv; v++) {
    for (let u = 0; u < nu; u++) {
      const cell = [[u, v], [u + 1, v], [u + 1, v + 1], [u, v + 1]];
      if (cell.some(([cu, cv]) => at(cu, cv) < 0)) continue;
      const hi = far.get(u + ',' + v);
      const q = cell.map(([cu, cv]) => {
        const k = cu + ',' + cv;
        return hi !== undefined && onPath[hi].has(k) ? lower.get(k) : at(cu, cv);
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
           cross: crossings(paths), aOff, bOff, V: uv.length, F: faces.length };
}

// The path one slit takes, from the corner of its hole out to an edge of the
// sheet. Without a slot, the old route: straight out along its own row to
// u = 0. With one, an L that ends a cell or two short of a corner, so that no
// edge of the sheet is broken anywhere but at its very end.
//
//   slot | lane      | ends on
//   0    | u = 1     | v = nv
//   1    | u = nu-1  | v = nv
//   2    | u = nu-2  | v = 0
//   3    | u = 2     | v = 0
//
// Slots 0 and 3 share the near side of the sheet and 1 and 2 the far side, so
// each pair takes its own lane and the rows have to fall the right way round:
// the one going down must sit below the one going up, or their paths cross.
//
// Every slit leaves its hole at the same corner, (u0, v0), whichever way it is
// headed. That is not tidiness: the rim is walked from wherever its slit meets
// it, and two rims sewn into a neck have to be walked from the same corner or
// the neck comes out with a quarter turn in it once the piece is rolled up. So
// a slit bound for the far side ducks one row under the hole first and crosses
// beneath it, rather than leaving by the far side and starting its rim a
// quarter of the way round.
function cutPath({ u0, v0, slot }, nu, nv) {
  if (slot === undefined) {                 // out along the row, as it always was
    const p = [];
    for (let u = u0; u >= 0; u--) p.push([u, v0]);
    return p;
  }
  const near = slot === 0 || slot === 3;
  const lane = slot === 0 ? 1 : slot === 3 ? 2 : slot === 1 ? nu - 1 : nu - 2;
  const dv = slot <= 1 ? 1 : -1;
  const du = near ? -1 : 1;
  const p = [[u0, v0]];
  let row = v0;
  if (!near) p.push([u0, --row]);           // duck under the hole
  for (let u = u0 + du; du > 0 ? u <= lane : u >= lane; u += du) p.push([u, row]);
  for (let v = row + dv; dv > 0 ? v <= nv : v >= 0; v += dv) p.push([lane, v]);
  return p;
}

// Which faces take the far lip of a slit: the ones to its left, walking it
// from the rim outwards.
//
// Each leg hands its own strip of faces over. At a corner where the path turns
// right the left side wraps round the outside of the turn, and the face
// diagonally across from the corner is on it as well, touching the path at
// that one vertex; where it turns left there is nothing extra to add. And at
// the rim end the left side runs on round the vertex until it reaches the hole
// itself, which is why the face beyond the mouth of a slit belongs to it too.
function leftFaces(path, whole) {
  const out = new Set();
  if (path.length < 2) return out;
  const add = (u, v) => { if (whole(u, v)) out.add(u + ',' + v); };
  const [au, av] = path[0], [bu, bv] = path[1];
  // round the mouth: from the left of the first step, on round until the hole
  let d = [bu - au, bv - av];
  for (let i = 0; i < 3; i++) {
    const q = [d[0] - d[1], d[1] + d[0]];   // the quadrant left of d, as a corner
    const fu = q[0] > 0 ? au : au - 1, fv = q[1] > 0 ? av : av - 1;
    if (!whole(fu, fv)) break;
    out.add(fu + ',' + fv);
    d = [-d[1], d[0]];                      // and round to the next one
  }
  for (let i = 0; i + 1 < path.length; i++) {
    const [pu, pv] = path[i], [qu, qv] = path[i + 1];
    const du = qu - pu, dv = qv - pv;
    if (du) add(Math.min(pu, qu), du > 0 ? pv : pv - 1);
    else add(dv > 0 ? pu - 1 : pu, Math.min(pv, qv));
    if (i + 2 >= path.length) continue;
    const [ru, rv] = path[i + 2];
    const eu = ru - qu, ev = rv - qv;
    if (du * ev - dv * eu >= 0) continue;   // a left turn keeps to the two legs
    add(du - eu > 0 ? qu : qu - 1, dv - ev > 0 ? qv : qv - 1);
  }
  return out;
}

// Where a slit is crossed, for anything ruling lines on the sheet: a column
// meets a slit's horizontal legs and a row meets its vertical ones, and at
// each of those the line has to stop at one lip and start again at the other.
// The value says which side of the crossing the far lip is on.
function crossings(paths) {
  const col = new Map(), row = new Map();
  for (const p of paths) {
    for (let i = 0; i + 1 < p.length; i++) {
      const [pu, pv] = p[i], [qu, qv] = p[i + 1];
      const du = qu - pu, dv = qv - pv;
      for (const [u, v] of [p[i], p[i + 1]]) {
        if (du) col.set(u + ',' + v, du > 0 ? 1 : -1);
        else row.set(u + ',' + v, dv > 0 ? -1 : 1);
      }
    }
  }
  return { col, row };
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
  for (const [k, b] of lower) {
    const [u, v] = k.split(',');
    const a = at(+u, +v);
    if (a >= 0) out.push([a, b]);
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
