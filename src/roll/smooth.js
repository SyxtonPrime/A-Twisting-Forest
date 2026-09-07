// A smoothing pass, for taking the crease out of a join.
//
// Three pieces sewn together meet at hard corners, and a hard corner is what
// makes an assembled surface read as an assembly. A few rounds of Taubin
// smoothing near the joins rounds them off. Taubin rather than plain Laplacian
// because plain Laplacian shrinks whatever it touches, and a neck that pinches
// where it meets a handle looks worse than one that meets it squarely.
//
// Two things have to be got right or it does damage.
//
// The mesh is cut. Vertices on either side of a gluing are different vertices
// that happen to sit at the same point once the roll is finished, and moving
// them independently would open the surface along every seam. So the smoothing
// runs on the quotient: glued vertices are one vertex, share one set of
// neighbours, and are written back together.
//
// And it is local. Every vertex carries a weight, worked out once as a falloff
// from the join, and away from the join the weight is nothing and the surface
// is left exactly as the roll put it. That keeps the grid crisp everywhere it
// matters, and it means the seams that are not yet closed -- which are all of
// them until the last moment of the roll -- are never averaged across.

export function makeSmoother(mesh, opts = {}) {
  const { faces, F, V } = mesh;
  const reach = opts.reach || 4;

  // ---- the quotient ------------------------------------------------------
  const rep = new Int32Array(V);
  for (let i = 0; i < V; i++) rep[i] = i;
  const find = i => { while (rep[i] !== i) { rep[i] = rep[rep[i]]; i = rep[i]; } return i; };
  for (const [a, b] of opts.merge || []) {
    const x = find(a), y = find(b);
    if (x !== y) rep[x] = y;
  }
  for (let i = 0; i < V; i++) rep[i] = find(i);

  // ---- neighbours, once, as flat arrays -----------------------------------
  const set = new Map();
  const link = (a, b) => {
    if (a === b) return;
    let s = set.get(a);
    if (!s) set.set(a, s = new Set());
    s.add(b);
  };
  for (let f = 0; f < F; f++) {
    for (let k = 0; k < 4; k++) {
      const a = rep[faces[f * 4 + k]], b = rep[faces[f * 4 + (k + 1) % 4]];
      link(a, b); link(b, a);
    }
  }
  const start = new Int32Array(V + 1);
  let total = 0;
  for (let i = 0; i < V; i++) { start[i] = total; total += set.has(i) ? set.get(i).size : 0; }
  start[V] = total;
  const adj = new Int32Array(total);
  for (let i = 0; i < V; i++) {
    let at = start[i];
    for (const j of set.get(i) || []) adj[at++] = j;
  }

  // ---- how much each vertex may move --------------------------------------
  // breadth first from the join, so the weight dies away with the number of
  // cells rather than with distance, which keeps it the same whatever the
  // piece is doing at the time
  const dist = new Int32Array(V).fill(-1);
  const queue = [];
  for (const v of opts.seeds || []) { const r = rep[v]; if (dist[r] < 0) { dist[r] = 0; queue.push(r); } }
  for (let i = 0; i < queue.length; i++) {
    const v = queue[i];
    if (dist[v] >= reach) continue;
    for (let k = start[v]; k < start[v + 1]; k++) {
      const w = adj[k];
      if (dist[w] < 0) { dist[w] = dist[v] + 1; queue.push(w); }
    }
  }
  const weight = new Float32Array(V);
  for (const v of queue) {
    const x = dist[v] / reach;
    weight[v] = 1 - x * x * (3 - 2 * x);
  }

  // a boundary vertex of the quotient has nothing on one side to be averaged
  // with, so leaving it alone is the only way not to pull the edge inwards
  const seen = new Map();
  const key = (a, b) => (a < b ? a * V + b : b * V + a);
  for (let f = 0; f < F; f++) {
    for (let k = 0; k < 4; k++) {
      const kk = key(rep[faces[f * 4 + k]], rep[faces[f * 4 + (k + 1) % 4]]);
      seen.set(kk, (seen.get(kk) || 0) + 1);
    }
  }
  for (const [kk, n] of seen) {
    if (n !== 1) continue;
    const b = kk % V, a = (kk - b) / V;
    weight[a] = 0; weight[b] = 0;
  }

  // only the vertices that can actually move, and only the classes that have
  // more than one member, are worth walking every frame
  const movers = [];
  for (let i = 0; i < V; i++) if (rep[i] === i && weight[i] > 0.001) movers.push(i);
  const copies = new Map();
  for (let i = 0; i < V; i++) if (rep[i] !== i) {
    const r = rep[i];
    if (!copies.has(r)) copies.set(r, []);
    copies.get(r).push(i);
  }

  const buf = new Float32Array(V * 3);
  // Taubin: a shrinking pass and then an expanding one, twice
  const STEPS = [0.52, -0.55, 0.52, -0.55];

  return function smooth(pos, alpha) {
    if (!(alpha > 0.001) || !movers.length) return pos;
    for (const lam of STEPS) {
      for (const v of movers) {
        let x = 0, y = 0, z = 0, n = 0;
        for (let k = start[v]; k < start[v + 1]; k++) {
          const w = adj[k] * 3;
          x += pos[w]; y += pos[w + 1]; z += pos[w + 2]; n++;
        }
        const o = v * 3, f = alpha * weight[v] * lam / (n || 1);
        buf[o] = pos[o] + (x - n * pos[o]) * f;
        buf[o + 1] = pos[o + 1] + (y - n * pos[o + 1]) * f;
        buf[o + 2] = pos[o + 2] + (z - n * pos[o + 2]) * f;
      }
      for (const v of movers) {
        const o = v * 3;
        pos[o] = buf[o]; pos[o + 1] = buf[o + 1]; pos[o + 2] = buf[o + 2];
        for (const c of copies.get(v) || []) {
          pos[c * 3] = buf[o]; pos[c * 3 + 1] = buf[o + 1]; pos[c * 3 + 2] = buf[o + 2];
        }
      }
    }
    return pos;
  };
}
