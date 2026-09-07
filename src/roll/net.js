// A net of handles: a tree.
//
// Every piece is a handle and every neck is an edge of the tree, so a piece
// with k necks on it is drawn as a (4 + k)-gon and the number of sides is the
// number of neighbours plus four. A lone square is a closed torus; give it a
// neck and it is a pentagon with a pentagon on the end of it, which is genus
// two; and the genus is just the number of pieces.
//
// The tree is two-coloured and every other piece is built as a mirror image.
// That is not decoration. Two holes that face each other agree about the way
// round the tube and disagree about the way round the ring, so a piece merely
// turned round has its rim matched to its neighbour's by a mirror in one
// coordinate, which sends the slit's cut point to the opposite corner of the
// hole and leaves the neck folded back on itself in the flat drawing.
// Reflecting alternate pieces makes every match the identity, and a tree is
// always two-colourable, so it always works.
//
// Flat, the pieces are laid out in the page. Rolled, the tori lie in the
// horizontal plane. Those are two different planes, so the whole arrangement
// tips from one to the other as the ring closes -- and each piece's own roll
// does exactly the same tipping, which is why the two stay in step. A piece's
// turn is applied about an axis that tips with them.

import { buildPiece, piecePositions, pieceOverlay, edgeFor } from './piece.js';
import { buildCap, capPositions, capOverlay } from './cap.js';
import { handleGluings } from '../handle.js';
import { makeSmoother } from './smooth.js';
import { phaseAt, THREE_ACT } from './roll.js';

const GRID = [173, 165, 148];
const FRONT = [201, 194, 176];
const BACK = [166, 156, 136];
const SAG = 3.0;                              // how far under the necks arch

// ---- the tree ---------------------------------------------------------

export function emptyNet() {
  return { nodes: [{ kind: 'handle', nbrs: [] }] };
}

// Give a piece another neck, with something new on the end of it: another
// handle, which adds one to the genus, or a cap, which closes the neck off and
// adds nothing. Nothing can be hung off a cap, since a cap has the one rim it
// arrived with and no way to grow another.
export function grow(net, at, kind = 'handle') {
  if (net.nodes[at].kind === 'cap') return -1;
  const id = net.nodes.length;
  net.nodes.push({ kind, nbrs: [at] });
  net.nodes[at].nbrs.push(id);
  return id;
}

// Take a handle off. Only a leaf can go, because removing anything else would
// cut the net in two, and never the last one.
export function canPrune(net, at) {
  return net.nodes.length > 1 && net.nodes[at].nbrs.length === 1;
}

export function prune(net, at) {
  if (!canPrune(net, at)) return false;
  const other = net.nodes[at].nbrs[0];
  net.nodes[other].nbrs = net.nodes[other].nbrs.filter(x => x !== at);
  net.nodes.splice(at, 1);
  for (const nd of net.nodes) nd.nbrs = nd.nbrs.map(x => (x > at ? x - 1 : x));
  return true;
}

// ---- the mesh ---------------------------------------------------------

export function buildNet(net, opts = {}) {
  const nu = opts.nu || 16, nv = opts.nv || 48;
  const hu = opts.hu || 4, hv = opts.hv || 4;
  const R = opts.R === undefined ? 3 : opts.R;
  const r = opts.r === undefined ? 1 : opts.r;
  const cache = opts.cache || new Map();

  // two-colour the tree, and note who hangs off whom
  const N = net.nodes.length;
  const depth = new Array(N).fill(-1);
  const parent = new Array(N).fill(-1);
  const order = [0];
  depth[0] = 0;
  for (let i = 0; i < order.length; i++) {
    const v = order[i];
    for (const w of net.nodes[v].nbrs) {
      if (depth[w] >= 0) continue;
      depth[w] = depth[v] + 1; parent[w] = v; order.push(w);
    }
  }

  const pieces = order.map(() => null);
  const nodes = [];
  let V = 0;
  for (const v of order) {
    const k = net.nodes[v].nbrs.length;
    const cap = net.nodes[v].kind === 'cap';
    const flip = depth[v] % 2 === 1;
    const key = `${cap ? 'cap' : k}:${flip}`;
    if (!cache.has(key)) {
      const piece = cap
        ? buildCap({ edge: edgeFor(R, r), spokes: 2 * (hu + hv), mirror: flip })
        : buildPiece({ nu, nv, hu, hv, R, r, rims: k, mirror: flip });
      cache.set(key, { piece, over: cap ? capOverlay(piece) : pieceOverlay(piece, { along: 12, across: 4 }) });
    }
    const { piece, over } = cache.get(key);
    nodes[v] = { id: v, piece, over, offset: V, psi: 0, x: 0, y: 0,
                 scratch: new Float32Array(piece.V * 3) };
    V += piece.V;
  }

  // ---- where each piece sits, and which way round it is ------------------
  // A piece's rim j faces rimDir[j] in its own frame, so a child hanging off
  // rim j sits that way, turned so that the rim it answers with faces back.
  const gap = nodes[0].piece.edge * 0.75;
  const links = [];
  for (const v of order) {
    const me = nodes[v];
    net.nodes[v].nbrs.forEach((w, j) => {
      if (w === parent[v]) return;
      const you = nodes[w];
      const jj = net.nodes[w].nbrs.indexOf(v);
      const dir = me.psi + me.piece.rimDir[j];
      you.psi = dir + Math.PI - you.piece.rimDir[jj];
      links.push({ a: v, b: w, ja: j, jb: jj, dir });
    });
  }

  // ---- one numbering, and the necks --------------------------------------
  const faces = [];
  for (const v of order) {
    const nd = nodes[v], f = nd.piece.faces;
    for (let i = 0; i < nd.piece.F; i++) {
      faces.push([f[i * 4] + nd.offset, f[i * 4 + 1] + nd.offset,
                  f[i * 4 + 2] + nd.offset, f[i * 4 + 3] + nd.offset]);
    }
  }
  const rimLen = nodes[0].piece.rims.length ? nodes[0].piece.rims[0].length : 0;
  const round = 2 * Math.PI * Math.sqrt((hv / nv) * Math.PI * R * (hu / nu) * Math.PI * r);
  const span = Math.max(6, Math.min(20, Math.round(gap / (round / Math.max(1, rimLen - 1)))));
  for (const link of links) {
    const A = nodes[link.a], B = nodes[link.b];
    const a = A.piece.rims[link.ja].map(x => x + A.offset);
    const b = B.piece.rims[link.jb].map(x => x + B.offset);
    const m = a.length;
    const cols = [a];
    for (let s = 1; s < span; s++) {
      const col = [];
      for (let k = 0; k < m; k++) col.push(V++);
      cols.push(col);
    }
    cols.push(b);
    for (let s = 0; s + 1 < cols.length; s++) {
      for (let k = 0; k + 1 < m; k++) {
        faces.push([cols[s][k], cols[s][k + 1], cols[s + 1][k + 1], cols[s + 1][k]]);
      }
    }
    link.cols = cols; link.m = m;
  }

  const F = faces.length;
  const fa = new Int32Array(F * 4);
  for (let f = 0; f < F; f++) for (let c = 0; c < 4; c++) fa[f * 4 + c] = faces[f][c];
  const rgb = new Uint8Array(F * 3), backRGB = new Uint8Array(F * 3);
  for (let i = 0; i < F; i++) {
    for (let c = 0; c < 3; c++) { rgb[i * 3 + c] = FRONT[c]; backRGB[i * 3 + c] = BACK[c]; }
  }

  // the genus is the number of handles: a cap closes a neck off and adds
  // nothing, which is the whole point of having one
  const handles = net.nodes.filter(nd => nd.kind !== 'cap').length;
  const mesh = { net, nodes, order, links, V, F, faces: fa, rgb, backRGB, seam: [],
                 plan: THREE_ACT, R, r, gap, cache, genus: handles, caps: N - handles };

  // Where pieces are sewn together they meet at hard corners, and a hard
  // corner is what makes an assembled thing read as an assembly.
  const merge = [], seeds = [];
  for (const v of order) {
    const nd = nodes[v];
    const glued = nd.piece.kind === 'cap' ? nd.piece.glue : handleGluings(nd.piece.h, false);
    for (const [x, y] of glued) merge.push([x + nd.offset, y + nd.offset]);
    for (const arc of nd.piece.rims) for (const x of arc) seeds.push(x + nd.offset);
  }
  mesh.smooth = seeds.length ? makeSmoother(mesh, { merge, seeds, reach: 4 }) : (p => p);
  return mesh;
}

// ---- where everything is ----------------------------------------------

export function netPositions(mesh, t, opts = {}, out) {
  const { nodes, order, links, V, R, r, gap } = mesh;
  const { open, curl, ring } = phaseAt(t, mesh.plan);
  const pos = out && out.length === V * 3 ? out : new Float32Array(V * 3);

  // The page tips into the plane the tori lie in as the rings close, and a
  // piece's own turn tips with it: about the up axis while the net is flat,
  // about the axis of the finished tori once it is not.
  const c = Math.cos((ring * Math.PI) / 2), s = Math.sin((ring * Math.PI) / 2);
  const turn = (nd, x, y, z, o) => {
    const w = y * c + z * s, n = -y * s + z * c;
    const X = x * nd.ca - w * nd.sa, W = x * nd.sa + w * nd.ca;
    return [X + o[0], W * c - n * s + o[1], W * s + n * c + o[2]];
  };

  for (const v of order) {
    const nd = nodes[v];
    nd.local = nd.piece.kind === 'cap'
      ? capPositions(nd.piece, t, opts, nd.scratch)
      : piecePositions(nd.piece, t, opts, nd.scratch);
    nd.ca = Math.cos(nd.psi); nd.sa = Math.sin(nd.psi);
    // where the middle of each of its rims has got to, in its own frame
    nd.mid = nd.piece.rims.map(arc => {
      let x = 0, y = 0, z = 0;
      for (const i of arc) { x += nd.local[i * 3]; y += nd.local[i * 3 + 1]; z += nd.local[i * 3 + 2]; }
      return [x / arc.length, y / arc.length, z / arc.length];
    });
  }

  // Pieces are placed by their rims and not by their middles. A piece rolls up
  // about the middle of its own sheet, and the torus it ends as does not sit at
  // that point, so there is no one place in a piece that means the same thing
  // all the way through the roll -- but the middle of a rim always means the
  // mouth of the neck that hangs off it, which is exactly what has to line up.
  nodes[0].at = [0, 0, 0];
  for (const link of links) {
    const A = nodes[link.a], B = nodes[link.b];
    const flat = gap;
    const spread = A.piece.behind[link.ja] + gap + B.piece.behind[link.jb];
    const solid = gap * 0.95;
    const d = flat + (spread - flat) * open + (solid - spread) * ring;
    const from = turn(A, A.mid[link.ja][0], A.mid[link.ja][1], A.mid[link.ja][2], A.at);
    const to = turn(B, B.mid[link.jb][0], B.mid[link.jb][1], B.mid[link.jb][2], [0, 0, 0]);
    const dx = Math.cos(link.dir) * d, dy = Math.sin(link.dir) * d;
    B.at = [from[0] + dx - to[0], from[1] + dy * c - to[1], from[2] + dy * s - to[2]];
  }

  for (const v of order) {
    const nd = nodes[v];
    for (let i = 0; i < nd.piece.V; i++) {
      const q = turn(nd, nd.local[i * 3], nd.local[i * 3 + 1], nd.local[i * 3 + 2], nd.at);
      const o = (nd.offset + i) * 3;
      pos[o] = q[0]; pos[o + 1] = q[1]; pos[o + 2] = q[2];
    }
  }

  // The necks, ruled between the rims wherever those have got to, arching
  // under while there is a flat sheet in the way and straightening out as the
  // pieces close up into tori.
  const sag = SAG * open * (1 - ring);
  for (const link of links) {
    const cols = link.cols, last = cols.length - 1;
    for (let sIdx = 1; sIdx < last; sIdx++) {
      const f = sIdx / last;
      const dip = -sag * 4 * f * (1 - f);     // a parabola: nothing at either end
      for (let k = 0; k < link.m; k++) {
        const A = cols[0][k] * 3, B = cols[last][k] * 3, C = cols[sIdx][k] * 3;
        pos[C] = pos[A] + (pos[B] - pos[A]) * f;
        pos[C + 1] = pos[A + 1] + (pos[B + 1] - pos[A + 1]) * f;
        pos[C + 2] = pos[A + 2] + (pos[B + 2] - pos[A + 2]) * f + dip;
      }
    }
  }
  mesh.smooth(pos, ring);
  return pos;
}

export function netOverlay(mesh) {
  const grid = [], edges = [];
  for (const v of mesh.order) {
    const nd = mesh.nodes[v], o = nd.offset;
    for (const path of nd.over.grid) grid.push({ ...path, ids: path.ids.map(x => x + o) });
    for (const path of nd.over.edges) edges.push({ ...path, ids: path.ids.map(x => x + o) });
  }
  for (const link of mesh.links) {
    const { cols, m } = link;
    const step = Math.max(2, Math.round((cols.length - 1) / 5));
    for (let s = step; s < cols.length - 1; s += step) grid.push({ ids: cols[s], rgb: GRID, kind: 'grid' });
    for (let k = 0; k < m; k += Math.max(1, Math.round(m / 8))) {
      grid.push({ ids: cols.map(col => col[k]), rgb: GRID, kind: 'grid' });
    }
  }
  return { grid, edges };
}

// Which piece a point on the screen is nearest to, for picking one to edit.
export function pieceAt(mesh, pos, sx, sy, project) {
  let best = -1, near = Infinity;
  for (const v of mesh.order) {
    const nd = mesh.nodes[v];
    let x = 0, y = 0, z = 0;
    for (let i = 0; i < nd.piece.V; i++) {
      const o = (nd.offset + i) * 3;
      x += pos[o]; y += pos[o + 1]; z += pos[o + 2];
    }
    const n = nd.piece.V;
    const p = project(x / n, y / n, z / n);
    const d = Math.hypot(p[0] - sx, p[1] - sy);
    if (d < near) { near = d; best = v; }
  }
  return best;
}
