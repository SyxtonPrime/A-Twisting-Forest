// The true world: a rectangle of cells whose rim is divided into n polygon
// edges of k unit edges each. The player's answers pair the polygon edges up.
// Any pairing of the edges of a polygon gives a closed surface, so once all
// n edges are paired the world is some closed surface, orientable or not,
// of whatever genus the pairing implies. Curvature collects at the polygon's
// corners: where the squares around a corner class don't add up to four, the
// player's dead reckoning comes back rotated.

export const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // E N W S
export const E = 0, N = 1, W = 2, S = 3;
export function key(v) { return v[0] + ',' + v[1]; }
export function add(a, b) { return [a[0] + b[0], a[1] + b[1]]; }
export function same(a, b) { return a[0] === b[0] && a[1] === b[1]; }
export function rot90(v) { return [-v[1], v[0]]; } // counterclockwise
export function dirIndex(v) { return DIRS.findIndex(d => d[0] === v[0] && d[1] === v[1]); }

// 2x2 integer matrices [a, b, c, d] = [[a, b], [c, d]] acting on column vectors.
export const I2 = [1, 0, 0, 1];
export function mul(A, B) {
  return [A[0] * B[0] + A[1] * B[2], A[0] * B[1] + A[1] * B[3],
          A[2] * B[0] + A[3] * B[2], A[2] * B[1] + A[3] * B[3]];
}
export function applyM(A, v) { return [A[0] * v[0] + A[1] * v[1], A[2] * v[0] + A[3] * v[1]]; }
export function transpose(A) { return [A[0], A[2], A[1], A[3]]; }
export function det(A) { return A[0] * A[3] - A[1] * A[2]; }

export class Polygon {
  constructor({ sides = 16, len = 6 } = {}) {
    if (sides % 4 !== 0 || sides < 4) throw new Error('sides must be a positive multiple of 4');
    this.n = sides;
    this.k = len;
    this.W = this.H = (sides / 4) * len;
    // Unit edges of the rim, counterclockwise from the bottom-left corner.
    this.boundary = [];
    for (let x = 0; x < this.W; x++) this.boundary.push({ cell: [x, 0], side: S });
    for (let y = 0; y < this.H; y++) this.boundary.push({ cell: [this.W - 1, y], side: E });
    for (let x = this.W - 1; x >= 0; x--) this.boundary.push({ cell: [x, this.H - 1], side: N });
    for (let y = this.H - 1; y >= 0; y--) this.boundary.push({ cell: [0, y], side: W });
    this.index = new Map(this.boundary.map((b, i) => [key(b.cell) + ':' + b.side, i]));
    this.pairs = new Array(this.n).fill(null); // { j, o } with o = +1 same way round, -1 opposite
  }

  inside([x, y]) { return x >= 0 && y >= 0 && x < this.W && y < this.H; }
  centre() { return [Math.floor(this.W / 2), Math.floor(this.H / 2)]; }
  edgeOf(idx) { return Math.floor(idx / this.k); }
  unitIndex(cell, side) { const i = this.index.get(key(cell) + ':' + side); return i === undefined ? -1 : i; }
  isFree(i) { return this.pairs[i] === null; }
  pairCount() { return this.pairs.filter(Boolean).length / 2; }
  closed() { return this.pairCount() * 2 === this.n; }
  freeEdges() { return [...this.pairs.keys()].filter(i => this.pairs[i] === null); }

  glue(i, j, o) {
    if (i === j || !this.isFree(i) || !this.isFree(j)) throw new Error('bad gluing');
    this.pairs[i] = { j, o };
    this.pairs[j] = { j: i, o };
  }

  // Land across unit edge idx if its polygon edge were paired with j (way o).
  // Returns the landing cell and the matrix T carrying old headings to new.
  landing(idx, j, o) {
    const i = this.edgeOf(idx), s = idx - i * this.k;
    const s2 = o === 1 ? s : this.k - 1 - s;
    const idx2 = j * this.k + s2;
    const a = this.boundary[idx], b = this.boundary[idx2];
    const d = DIRS[a.side], d2 = DIRS[b.side];       // outward normals
    const tau = rot90(d), tau2 = rot90(d2);          // counterclockwise tangents
    // T sends d to -d2 (walk straight through) and tau to o*tau2.
    const B = [d[0], tau[0], d[1], tau[1]];
    const C = [-d2[0], o * tau2[0], -d2[1], o * tau2[1]];
    return { cell: b.cell, T: mul(C, transpose(B)), idx: idx2 };
  }

  cross(idx) {
    const p = this.pairs[this.edgeOf(idx)];
    if (!p) throw new Error('edge not paired');
    return this.landing(idx, p.j, p.o);
  }

  // Polygon vertex i sits at the start of edge i. Squares in its corner:
  // one at the rectangle's corners, two along a straight run.
  cornerSquares(i) {
    const a = this.boundary[i * this.k], b = this.boundary[(i * this.k + this.n * this.k - 1) % (this.n * this.k)];
    return a.side === b.side ? 2 : 1;
  }

  // Pixel-free geometry of a unit edge: its start and end corners (cell
  // coordinates, y up) walking counterclockwise.
  unitSegment(idx) {
    const { cell: [x, y], side } = this.boundary[idx];
    if (side === S) return [[x, y], [x + 1, y]];
    if (side === E) return [[x + 1, y], [x + 1, y + 1]];
    if (side === N) return [[x + 1, y + 1], [x, y + 1]];
    return [[x, y + 1], [x, y]];
  }

  classify() {
    const n = this.n;
    const parent = [...Array(n).keys()];
    const find = a => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
    const union = (a, b) => { parent[find(a)] = find(b); };
    let orientable = true, pairs = 0;
    for (let i = 0; i < n; i++) {
      const p = this.pairs[i];
      if (!p || p.j < i) continue;
      pairs++;
      if (p.o === 1) { orientable = false; union(i, p.j); union((i + 1) % n, (p.j + 1) % n); }
      else { union(i, (p.j + 1) % n); union((i + 1) % n, p.j); }
    }
    const classes = new Map();
    for (let i = 0; i < n; i++) {
      const r = find(i);
      if (!classes.has(r)) classes.set(r, { vertices: [], squares: 0, open: 0 });
      const c = classes.get(r);
      c.vertices.push(i);
      c.squares += this.cornerSquares(i);
    }
    // Boundary: unpaired edges chain through vertex classes into cycles.
    const bparent = new Map();
    const bfind = a => { while (bparent.get(a) !== a) { a = bparent.get(a); } return a; };
    let unpaired = 0;
    for (let i = 0; i < n; i++) {
      if (this.pairs[i]) continue;
      unpaired++;
      const a = find(i), b = find((i + 1) % n);
      classes.get(a).open++; classes.get(b).open++;
      if (!bparent.has(a)) bparent.set(a, a);
      if (!bparent.has(b)) bparent.set(b, b);
      bparent.set(bfind(a), bfind(b));
    }
    const boundaries = new Set([...bparent.keys()].map(bfind)).size;
    const V = classes.size;
    const chi = V - (n - pairs) + 1;
    const capped = chi + boundaries;
    const cones = [...classes.values()].filter(c => c.open === 0 && c.squares !== 4);
    return {
      pairs, unpaired, V, chi, boundaries, orientable, capped,
      closed: unpaired === 0,
      name: surfaceName(capped, orientable),
      cones,
      bunched: cones.filter(c => c.squares < 4).length,
      flared: cones.filter(c => c.squares > 4).length,
      classes: [...classes.values()],
    };
  }
}

export function surfaceName(chi, orientable) {
  if (orientable) {
    const g = (2 - chi) / 2;
    if (g === 0) return 'a sphere';
    if (g === 1) return 'a torus';
    if (g === 2) return 'a double torus';
    return `a surface of genus ${g}`;
  }
  const c = 2 - chi;
  if (c === 1) return 'a projective plane';
  if (c === 2) return 'a klein bottle';
  return `a surface with ${c} crosscaps`;
}
