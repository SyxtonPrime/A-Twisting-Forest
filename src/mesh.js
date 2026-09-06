// The quotient mesh: the polygon's cells with their rim corners identified
// according to the gluing. This is the true surface as a cell complex, and
// the thing we embed in space. Nothing here knows or cares which surface it
// turned out to be.
import { key } from './polygon.js';
import { TERRAIN } from './world.js';

// Corner identification across a seam. Both unit edges are walked
// counterclockwise, so an edge pair that runs the same way round (o = +1)
// matches start to start, and one that runs opposite (o = -1) matches start
// to end.
function seamPairs(poly) {
  const W = poly.W;
  const vid = ([x, y]) => y * (W + 1) + x;
  const out = [];
  for (let idx = 0; idx < poly.boundary.length; idx++) {
    const p = poly.pairs[poly.edgeOf(idx)];
    if (!p) continue;
    const idx2 = poly.cross(idx).idx;
    const [A, B] = poly.unitSegment(idx);
    const [A2, B2] = poly.unitSegment(idx2);
    if (p.o === -1) out.push([vid(A), vid(B2)], [vid(B), vid(A2)]);
    else out.push([vid(A), vid(A2)], [vid(B), vid(B2)]);
  }
  return out;
}

export function buildMesh(poly, world, explored) {
  const W = poly.W, H = poly.H;
  const n = (W + 1) * (H + 1);
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = a => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  for (const [a, b] of seamPairs(poly)) {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }

  // Compress class roots to 0..V-1.
  const label = new Int32Array(n).fill(-1);
  let V = 0;
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (label[r] < 0) label[r] = V++;
    label[i] = label[r];
  }
  const vert = (x, y) => label[y * (W + 1) + x];

  // One quad per cell, wound counterclockwise in the flat chart. On a
  // non-orientable world these windings cannot agree globally, which is why
  // the renderer shades both sides.
  const faces = new Int32Array(W * H * 4);
  const terrain = new Uint8Array(W * H);
  const seen = new Uint8Array(W * H);
  const names = Object.keys(TERRAIN);
  for (let y = 0, f = 0; y < H; y++) {
    for (let x = 0; x < W; x++, f++) {
      faces[f * 4] = vert(x, y);
      faces[f * 4 + 1] = vert(x + 1, y);
      faces[f * 4 + 2] = vert(x + 1, y + 1);
      faces[f * 4 + 3] = vert(x, y + 1);
      terrain[f] = names.indexOf(world.get([x, y]).terrain);
      seen[f] = explored.has(key([x, y])) ? 1 : 0;
    }
  }

  // Undirected edge list and adjacency, deduped.
  const set = new Set();
  const ea = [], eb = [];
  const push = (a, b) => {
    if (a === b) return;
    const k = a < b ? a * n + b : b * n + a;
    if (set.has(k)) return;
    set.add(k); ea.push(a); eb.push(b);
  };
  for (let f = 0; f < W * H; f++) {
    for (let i = 0; i < 4; i++) push(faces[f * 4 + i], faces[f * 4 + (i + 1) % 4]);
  }
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

  // Rim corner classes, so the renderer can trace the seams on the solid.
  const seam = [];
  for (let idx = 0; idx < poly.boundary.length; idx++) {
    if (!poly.pairs[poly.edgeOf(idx)]) continue;
    const [A, B] = poly.unitSegment(idx);
    seam.push([vert(A[0], A[1]), vert(B[0], B[1]), poly.edgeOf(idx)]);
  }

  const F = W * H;
  const { orient, orientable, faceAdj } = orientFaces(faces, F, n);

  return {
    V, F, faces, terrain, seen, edgeA, edgeB, adj, start, deg, seam,
    orient, orientable, faceAdj,
    chi: V - edgeA.length + F,
  };
}

// Try to wind every quad the same way round. Two quads sharing an edge agree
// when they traverse it in opposite directions. Breadth-first from one face
// fixes the rest; if the walk ever comes back disagreeing with itself, the
// world is non-orientable and no consistent choice exists.
export function orientFaces(faces, F, n) {
  const dirKey = new Map();               // undirected edge -> [[face, forward], ...]
  for (let f = 0; f < F; f++) {
    for (let i = 0; i < 4; i++) {
      const a = faces[f * 4 + i], b = faces[f * 4 + (i + 1) % 4];
      if (a === b) continue;
      const lo = Math.min(a, b), hi = Math.max(a, b);
      const k = lo * n + hi;
      if (!dirKey.has(k)) dirKey.set(k, []);
      dirKey.get(k).push([f, a === lo ? 1 : -1, i]);
    }
  }
  const faceAdj = new Int32Array(F * 4).fill(-1);
  const faceRel = new Int8Array(F * 4);   // +1 if the neighbour must be flipped
  for (const list of dirKey.values()) {
    if (list.length !== 2) continue;
    const [[f, df, i], [g, dg, j]] = list;
    faceAdj[f * 4 + i] = g; faceRel[f * 4 + i] = df === dg ? 1 : 0;
    faceAdj[g * 4 + j] = f; faceRel[g * 4 + j] = df === dg ? 1 : 0;
  }
  const orient = new Int8Array(F);
  const done = new Uint8Array(F);
  let orientable = true;
  for (let s = 0; s < F; s++) {
    if (done[s]) continue;
    orient[s] = 1; done[s] = 1;
    const stack = [s];
    while (stack.length) {
      const f = stack.pop();
      for (let i = 0; i < 4; i++) {
        const g = faceAdj[f * 4 + i];
        if (g < 0) continue;
        const want = faceRel[f * 4 + i] ? -orient[f] : orient[f];
        if (!done[g]) { orient[g] = want; done[g] = 1; stack.push(g); }
        else if (orient[g] !== want) orientable = false;
      }
    }
  }
  return { orient, orientable, faceAdj };
}
