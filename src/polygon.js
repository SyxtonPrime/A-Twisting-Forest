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
  // `off` slides the polygon's corners around the rim. It exists because a
  // polygon corner sitting exactly on a corner of the rectangle, with its two
  // edges glued to each other, makes that one cell fold onto itself: opposite
  // corners of the quad become the same point and it stops being a quad. Slide
  // the corners off the rectangle's own and the fold happens between two
  // cells instead of inside one.
  constructor({ sides = 16, len = 6, off = 0, width = null } = {}) {
    if (sides < 3 || sides % 1) throw new Error('sides must be a whole number, at least 3');
    if (len < 1 || len % 1) throw new Error('len must be a whole number, at least 1');
    const perimeter = sides * len;
    if (perimeter % 2) throw new Error('sides * len must be even to close a rectangle');
    this.n = sides;
    this.k = len;
    // Any rectangle whose perimeter is the polygon's will do. Keeping it as
    // square as possible keeps the cells near the middle of the world.
    this.off = ((off % perimeter) + perimeter) % perimeter;
    this.W = width === null ? Math.max(1, Math.round(perimeter / 4)) : width;
    this.H = perimeter / 2 - this.W;
    if (this.H < 1 || this.W < 1) throw new Error('rectangle would be degenerate');
    // Unit edges of the rim, counterclockwise from the bottom-left corner.
    this.boundary = [];
    for (let x = 0; x < this.W; x++) this.boundary.push({ cell: [x, 0], side: S });
    for (let y = 0; y < this.H; y++) this.boundary.push({ cell: [this.W - 1, y], side: E });
    for (let x = this.W - 1; x >= 0; x--) this.boundary.push({ cell: [x, this.H - 1], side: N });
    for (let y = this.H - 1; y >= 0; y--) this.boundary.push({ cell: [0, y], side: W });
    this.index = new Map(this.boundary.map((b, i) => [key(b.cell) + ':' + b.side, i]));
    this.pairs = new Array(this.n).fill(null); // { j, o } with o = +1 same way round, -1 opposite
    this.auto = new Set();                    // edges the world sewed for itself
  }

  inside([x, y]) { return x >= 0 && y >= 0 && x < this.W && y < this.H; }
  centre() { return [Math.floor(this.W / 2), Math.floor(this.H / 2)]; }
  get P() { return this.n * this.k; }
  rel(idx) { return (idx - this.off + this.P) % this.P; }
  edgeOf(idx) { return Math.floor(this.rel(idx) / this.k); }
  unitAt(edge, s) { return (this.off + edge * this.k + s) % this.P; }
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

  // Sew whatever is still loose, at random. Any pairing of a polygon's edges
  // gives a closed surface, so this always terminates in one.
  sewRandom(rng) {
    const free = this.freeEdges();
    for (let i = free.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [free[i], free[j]] = [free[j], free[i]];
    }
    const sewn = [];
    while (free.length >= 2) {
      const a = free.pop(), b = free.pop();
      const o = rng() < 0.5 ? 1 : -1;
      this.glue(a, b, o);
      this.auto.add(a); this.auto.add(b);
      sewn.push([a, b, o]);
    }
    return sewn;
  }

  // Land across unit edge idx if its polygon edge were paired with j (way o).
  // Returns the landing cell and the matrix T carrying old headings to new.
  landing(idx, j, o) {
    const r = this.rel(idx), i = Math.floor(r / this.k), s = r - i * this.k;
    const s2 = o === 1 ? s : this.k - 1 - s;
    const idx2 = this.unitAt(j, s2);
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
    const at = this.unitAt(i, 0);
    const a = this.boundary[at], b = this.boundary[(at + this.P - 1) % this.P];
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

// The classification theorem's normal form, as a polygon with its edges
// paired. h handles and r crosscaps; when there is any crosscap at all a
// handle is worth two more of them, which is Dyck's theorem, so the whole
// thing collapses to 2h + r crosscaps.
function blank(sides, len) {
  // Corners of the rectangle land on multiples of len; corners of the polygon
  // land one step off them. So the two never coincide and no cell can fold.
  const perimeter = sides * len;
  const half = perimeter / 2;
  let W = len * Math.max(1, Math.round(perimeter / (4 * len)));
  W = Math.min(W, half - len);
  if (W < 1 || half - W < 1) W = Math.floor(half / 2);
  return new Polygon({ sides, len, off: 1, width: W });
}

// How many sides the normal form of this surface needs.
export function normalFormSides(h, r) {
  if (r > 0) { const k = 2 * h + r; return k === 1 ? 4 : 2 * k; }
  return h === 0 ? 4 : 4 * h;
}

// Subdivide so the mesh has roughly the same number of cells whatever the
// surface: a four-sided normal form needs far longer edges than a twenty-
// sided one to end up with a solid that is not all corners.
export function normalFormLen(h, r, cells = 620) {
  const sides = normalFormSides(h, r);
  const halfPerimeter = Math.max(2, Math.round(2 * Math.sqrt(cells)));
  let len = Math.max(3, Math.round((2 * halfPerimeter) / sides));
  if ((sides * len) % 2) len += 1;
  return len;
}

export function normalForm(h, r, len = null) {
  if (len === null) len = normalFormLen(h, r);
  if (len < 2) throw new Error('normal form needs len at least 2');
  if (r > 0) {
    const k = 2 * h + r;
    if (k === 1) {                                   // a b a b, the same as aa
      const p = blank(4, len);
      p.glue(0, 2, 1); p.glue(1, 3, 1);
      return p;
    }
    const p = blank(2 * k, len);
    for (let i = 0; i < k; i++) p.glue(2 * i, 2 * i + 1, 1);   // a a
    return p;
  }
  if (h === 0) {
    const p = blank(4, len);                         // a a^-1 b b^-1
    p.glue(0, 1, -1); p.glue(2, 3, -1);
    return p;
  }
  const p = blank(4 * h, len);                       // a b a^-1 b^-1
  for (let i = 0; i < h; i++) {
    p.glue(4 * i, 4 * i + 2, -1);
    p.glue(4 * i + 1, 4 * i + 3, -1);
  }
  return p;
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
