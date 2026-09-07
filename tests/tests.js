import { Polygon, DIRS, I2, mul, applyM, det, key, same, surfaceName, normalForm, normalFormSides, normalFormLen, E, N, W, S } from '../src/polygon.js';
import { Explore } from '../src/explore.js';
import { World } from '../src/world.js';
import { buildMesh } from '../src/mesh.js';
import { buildHandlebody } from '../src/handlebody.js';
import { buildHandle, handleGluings, boundaryLoop } from '../src/handle.js';
import { buildChain, chainGluings } from '../src/chain.js';
import { mulberry32 } from '../src/rng.js';

const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }); }
  catch (e) { results.push({ name, ok: false, err: e.stack || String(e) }); }
}
function eq(a, b, msg = '') {
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  if (sa !== sb) throw new Error(`${msg} expected ${sb}, got ${sa}`);
}
function ok(c, msg = 'assertion failed') { if (!c) throw new Error(msg); }

// Pair edges as a list of [i, j, o] triples.
function pairAll(poly, triples) { for (const [i, j, o] of triples) poly.glue(i, j, o); return poly; }
// Neighbouring inverse pairs (a a^-1 b b^-1 ...): the sphere pattern.
function spherePairs(n, from = 0) { const t = []; for (let i = from; i < n; i += 2) t.push([i, i + 1, -1]); return t; }

test('rim has 2(W+H) unit edges in n equal polygon edges', () => {
  const p = new Polygon({ sides: 16, len: 6 });
  eq(p.W, 24); eq(p.boundary.length, 96);
  for (let i = 0; i < 96; i++) {
    const b = p.boundary[i];
    eq(p.unitIndex(b.cell, b.side), i, 'index round trip');
    ok(!p.inside([b.cell[0] + DIRS[b.side][0], b.cell[1] + DIRS[b.side][1]]), 'outward normal leaves the rectangle');
  }
  eq(p.edgeOf(95), 15);
  let ones = 0; for (let i = 0; i < 16; i++) ones += p.cornerSquares(i) === 1 ? 1 : 0;
  eq(ones, 4, 'four rectangle corners have one square');
});

test('rim walk is counterclockwise and continuous', () => {
  const p = new Polygon({ sides: 8, len: 3 });
  for (let i = 0; i < p.boundary.length; i++) {
    const [, e] = p.unitSegment(i);
    const [s] = p.unitSegment((i + 1) % p.boundary.length);
    eq(s, e, `segment ${i} joins the next`);
  }
});

test('torus gluing keeps headings: T = I and lands on the same x', () => {
  const p = new Polygon({ sides: 16, len: 6 });
  // bottom edges 0..3 pair with top edges 11..8 reversed; left 15..12 with right 4..7
  const t = [];
  for (let i = 0; i < 4; i++) t.push([i, 11 - i, -1]);
  for (let i = 0; i < 4; i++) t.push([4 + i, 15 - i, -1]);
  pairAll(p, t);
  ok(p.closed());
  for (let x = 0; x < p.W; x++) {
    const idx = p.unitIndex([x, 0], S);
    const l = p.cross(idx);
    eq(l.cell, [x, p.H - 1], 'lands at top, same column');
    eq(l.T, I2, 'no turn');
  }
  const l = p.cross(p.unitIndex([p.W - 1, 5], E));
  eq(l.cell, [0, 5]); eq(l.T, I2);
  const c = p.classify();
  eq([c.chi, c.orientable, c.closed, c.name], [0, true, true, 'a torus']);
  eq(c.cones.length, 0, 'flat torus has no cone points');
});

test('klein gluing mirrors: T is a reflection', () => {
  const p = new Polygon({ sides: 16, len: 6 });
  const t = [];
  for (let i = 0; i < 4; i++) t.push([i, 8 + i, 1]);      // bottom to top, same way round
  for (let i = 0; i < 4; i++) t.push([4 + i, 15 - i, -1]); // sides as a torus
  pairAll(p, t);
  const l = p.cross(p.unitIndex([3, 0], S));
  eq(l.cell, [p.W - 4, p.H - 1], 'lands mirrored');
  eq(det(l.T), -1, 'reflection');
  eq(applyM(l.T, [0, -1]), [0, -1], 'still heading south');
  eq(applyM(l.T, [1, 0]), [-1, 0], 'east becomes west');
  const c = p.classify();
  eq([c.chi, c.orientable, c.name], [0, false, 'a klein bottle']);
});

test('crossing and crossing back is the identity', () => {
  const p = new Polygon({ sides: 12, len: 4 });
  pairAll(p, [[0, 5, 1], [1, 9, -1], [2, 3, -1], [4, 10, 1], [6, 7, -1], [8, 11, 1]]);
  for (let idx = 0; idx < p.boundary.length; idx++) {
    const a = p.cross(idx);
    const back = p.cross(a.idx);
    eq(back.cell, p.boundary[idx].cell, `round trip cell ${idx}`);
    eq(mul(back.T, a.T), I2, `round trip heading ${idx}`);
    // walking straight through: outward normal maps to the landing cell's inward normal
    const d = DIRS[p.boundary[idx].side];
    const d2 = applyM(a.T, d);
    ok(p.inside([a.cell[0] + d2[0], a.cell[1] + d2[1]]), 'heading points inward after crossing');
  }
});

test('classification: sphere, projective plane, genus 4, crosscaps', () => {
  let p = pairAll(new Polygon({ sides: 16, len: 2 }), spherePairs(16));
  let c = p.classify();
  eq([c.chi, c.orientable, c.name], [2, true, 'a sphere']);

  p = pairAll(new Polygon({ sides: 16, len: 2 }), [[0, 1, 1], ...spherePairs(16, 2)]);
  c = p.classify();
  eq([c.chi, c.orientable, c.name], [1, false, 'a projective plane']);

  // four commutators a b a^-1 b^-1
  p = new Polygon({ sides: 16, len: 2 });
  for (let b = 0; b < 16; b += 4) { p.glue(b, b + 2, -1); p.glue(b + 1, b + 3, -1); }
  c = p.classify();
  eq([c.chi, c.orientable, c.V, c.name], [-6, true, 1, 'a surface of genus 4']);

  // a a b b c c ... eight crosscaps
  p = new Polygon({ sides: 16, len: 2 });
  for (let i = 0; i < 16; i += 2) p.glue(i, i + 1, 1);
  c = p.classify();
  eq([c.chi, c.orientable, c.name], [-6, false, 'a surface with 8 crosscaps']);
  eq(surfaceName(0, false), 'a klein bottle');
});

test('cone points: sphere from adjacent pairs bunches at the corners', () => {
  const p = pairAll(new Polygon({ sides: 16, len: 2 }), spherePairs(16));
  const c = p.classify();
  let total = 0;
  for (const cls of c.classes) total += cls.squares;
  eq(total, 4 * 1 + 12 * 2, 'square corners are all accounted for');
  // Gauss-Bonnet in quarter turns: sum over corners of (4 - squares) = 4 * chi
  let curvature = 0;
  for (const cls of c.classes) curvature += 4 - cls.squares;
  eq(curvature, 4 * c.chi);
});

test('partial gluing: boundary components and capped surface', () => {
  let p = new Polygon({ sides: 16, len: 2 });
  let c = p.classify();
  eq([c.pairs, c.boundaries, c.chi, c.capped, c.name, c.closed], [0, 1, 1, 2, 'a sphere', false]);
  // a torus with two edge pairs missing on one side: still a torus when capped
  p = new Polygon({ sides: 16, len: 6 });
  for (let i = 0; i < 4; i++) p.glue(i, 11 - i, -1);
  for (let i = 0; i < 2; i++) p.glue(4 + i, 15 - i, -1);
  c = p.classify();
  eq(c.closed, false);
  eq(c.boundaries, 1);
  eq(c.name, 'a torus');
  // sphere pattern minus the last pair: a disc glued into a sphere, one hole
  p = pairAll(new Polygon({ sides: 16, len: 2 }), spherePairs(14));
  c = p.classify();
  eq([c.boundaries, c.capped, c.name], [1, 2, 'a sphere']);
});

test('sewRandom closes any polygon and only touches free edges', () => {
  const rng = mulberry32(7);
  for (const sides of [4, 8, 12, 16]) {
    const p = new Polygon({ sides, len: 3 });
    p.glue(0, 1, -1);
    const before = JSON.stringify(p.pairs[0]);
    p.sewRandom(rng);
    ok(p.closed(), `sides ${sides} closed`);
    eq(JSON.stringify(p.pairs[0]), before, 'existing pair untouched');
    ok(!p.auto.has(0) && !p.auto.has(1), 'player pairs not marked auto');
    eq(p.auto.size, sides - 2, 'the rest marked auto');
    for (let i = 0; i < sides; i++) {
      const q = p.pairs[i];
      eq(p.pairs[q.j].j, i, `pairing symmetric at ${i}`);
      eq(p.pairs[q.j].o, q.o, `orientation agrees at ${i}`);
    }
    const c = p.classify();
    eq(c.closed, true); eq(c.boundaries, 0);
  }
});

test('mesh: euler characteristic matches the polygon classification', () => {
  const rng = mulberry32(11);
  const cases = [];
  // torus
  let p = new Polygon({ sides: 16, len: 6 });
  for (let i = 0; i < 4; i++) p.glue(i, 11 - i, -1);
  for (let i = 0; i < 4; i++) p.glue(4 + i, 15 - i, -1);
  cases.push(p);
  // klein
  p = new Polygon({ sides: 16, len: 6 });
  for (let i = 0; i < 4; i++) p.glue(i, 8 + i, 1);
  for (let i = 0; i < 4; i++) p.glue(4 + i, 15 - i, -1);
  cases.push(p);
  // sphere
  p = new Polygon({ sides: 16, len: 6 });
  for (let i = 0; i < 16; i += 2) p.glue(i, i + 1, -1);
  cases.push(p);
  // genus 4
  p = new Polygon({ sides: 16, len: 6 });
  for (let b = 0; b < 16; b += 4) { p.glue(b, b + 2, -1); p.glue(b + 1, b + 3, -1); }
  cases.push(p);
  // eight crosscaps
  p = new Polygon({ sides: 16, len: 6 });
  for (let i = 0; i < 16; i += 2) p.glue(i, i + 1, 1);
  cases.push(p);
  // and a dozen random ones
  for (let t = 0; t < 12; t++) {
    const q = new Polygon({ sides: 16, len: 6 });
    q.sewRandom(rng);
    cases.push(q);
  }
  for (const poly of cases) {
    const world = new World('mesh-' + poly.pairs.map(x => x.j + ':' + x.o).join(), { sides: 16, len: 6 });
    world.poly = poly;
    const m = buildMesh(poly, world, new Set());
    const info = poly.classify();
    eq(m.chi, info.chi, `chi for ${info.name}`);
    eq(m.F, poly.W * poly.H, 'one face per cell');
    // every face slot is a valid vertex, and every edge is shared by two faces
    eq(m.edgeA.length, m.F * 2, 'quad mesh has 2F edges when every edge is shared');
    for (let i = 0; i < m.faces.length; i++) ok(m.faces[i] >= 0 && m.faces[i] < m.V, 'vertex in range');
  }
});

test('mesh: the surface is connected and every vertex has a full ring', () => {
  const p = new Polygon({ sides: 16, len: 6 });
  for (let i = 0; i < 4; i++) p.glue(i, 11 - i, -1);
  for (let i = 0; i < 4; i++) p.glue(4 + i, 15 - i, -1);
  const world = new World('conn', { sides: 16, len: 6 });
  world.poly = p;
  const m = buildMesh(p, world, new Set());
  eq(m.V, 24 * 24, 'flat torus has one vertex per cell');
  const seenV = new Uint8Array(m.V);
  const stack = [0]; seenV[0] = 1; let count = 1;
  while (stack.length) {
    const v = stack.pop();
    for (let i = m.start[v]; i < m.start[v + 1]; i++) {
      const w = m.adj[i];
      if (!seenV[w]) { seenV[w] = 1; count++; stack.push(w); }
    }
  }
  eq(count, m.V, 'connected');
  for (let v = 0; v < m.V; v++) eq(m.deg[v], 4, `degree at ${v}`);
});

test('mesh: face winding agrees with the polygon orientability test', () => {
  const rng = mulberry32(23);
  const build = poly => {
    const world = new World('or', { sides: 16, len: 6 });
    world.poly = poly;
    return buildMesh(poly, world, new Set());
  };
  // torus: orientable
  let p = new Polygon({ sides: 16, len: 6 });
  for (let i = 0; i < 4; i++) p.glue(i, 11 - i, -1);
  for (let i = 0; i < 4; i++) p.glue(4 + i, 15 - i, -1);
  eq(build(p).orientable, true, 'torus');
  // klein: not
  p = new Polygon({ sides: 16, len: 6 });
  for (let i = 0; i < 4; i++) p.glue(i, 8 + i, 1);
  for (let i = 0; i < 4; i++) p.glue(4 + i, 15 - i, -1);
  eq(build(p).orientable, false, 'klein');
  // and agreement on random worlds, where the two are computed by quite
  // different routes: vertex classes on the polygon, face winding on the mesh
  for (let t = 0; t < 20; t++) {
    const q = new Polygon({ sides: 16, len: 6 });
    q.sewRandom(rng);
    const m = build(q);
    eq(m.orientable, q.classify().orientable, `random world ${t}`);
    if (m.orientable) {
      // every shared edge is traversed once each way
      const seen = new Map();
      for (let f = 0; f < m.F; f++) {
        for (let i = 0; i < 4; i++) {
          let a = m.faces[f * 4 + i], b = m.faces[f * 4 + (i + 1) % 4];
          if (m.orient[f] < 0) [a, b] = [b, a];
          const k = a + ':' + b;
          seen.set(k, (seen.get(k) || 0) + 1);
        }
      }
      for (const [k, v] of seen) eq(v, 1, `directed edge ${k} used once`);
    }
  }
});

test('normal form realises every closed surface, and the mesh agrees', () => {
  const check = (h, r, wantChi, wantOr, wantName) => {
    const poly = normalForm(h, r, 4);
    const info = poly.classify();
    eq([info.chi, info.orientable, info.name, info.closed], [wantChi, wantOr, wantName, true], `h=${h} r=${r}`);
    const world = new World(`nf-${h}-${r}`, { poly });
    const m = buildMesh(poly, world, new Set());
    eq(m.chi, wantChi, `mesh chi h=${h} r=${r}`);
    eq(m.orientable, wantOr, `mesh orientability h=${h} r=${r}`);
    eq(m.edgeA.length, m.F * 2, `no folded cells h=${h} r=${r}`);
    for (let f = 0; f < m.F; f++) {
      const q = [m.faces[f*4], m.faces[f*4+1], m.faces[f*4+2], m.faces[f*4+3]];
      eq(new Set(q).size, 4, `cell ${f} has four distinct corners h=${h} r=${r}`);
    }
  };
  check(0, 0, 2, true, 'a sphere');
  check(0, 1, 1, false, 'a projective plane');
  check(1, 0, 0, true, 'a torus');
  check(2, 0, -2, true, 'a double torus');
  check(3, 0, -4, true, 'a surface of genus 3');
  check(0, 1, 1, false, 'a projective plane');
  check(0, 2, 0, false, 'a klein bottle');
  check(0, 5, -3, false, 'a surface with 5 crosscaps');
  // Dyck: a handle beside a crosscap is worth three crosscaps
  check(1, 1, -1, false, 'a surface with 3 crosscaps');
  check(2, 1, -3, false, 'a surface with 5 crosscaps');
});

test('normal form picks a subdivision that keeps the mesh usable', () => {
  for (const [h, r] of [[0,0],[1,0],[2,0],[4,0],[0,1],[0,2],[0,5],[1,1],[3,2],[0,9]]) {
    const poly = normalForm(h, r);
    eq(poly.n, normalFormSides(h, r), `sides for h=${h} r=${r}`);
    eq(poly.k, normalFormLen(h, r), `len for h=${h} r=${r}`);
    const cells = poly.W * poly.H;
    ok(cells >= 250 && cells <= 1400, `h=${h} r=${r} has ${cells} cells`);
    const world = new World('res', { poly });
    const m = buildMesh(poly, world, new Set());
    eq(m.chi, poly.classify().chi, `chi h=${h} r=${r}`);
    eq(m.edgeA.length, m.F * 2, `no folded cells h=${h} r=${r}`);
    // and the rectangle is not a sliver
    ok(Math.min(poly.W, poly.H) / Math.max(poly.W, poly.H) > 0.25, `shape h=${h} r=${r}`);
  }
});

test('a rectangle of the right perimeter exists for any polygon', () => {
  for (const sides of [3, 4, 5, 6, 7, 10, 16, 22]) {
    for (const len of [2, 4, 6]) {
      const p = new Polygon({ sides, len });
      eq(2 * (p.W + p.H), sides * len, `perimeter for ${sides}-gon len ${len}`);
      eq(p.boundary.length, sides * len, 'one unit edge per rim step');
      ok(p.W >= 1 && p.H >= 1, 'rectangle is not degenerate');
      for (let i = 0; i < p.boundary.length; i++) {
        const [, e] = p.unitSegment(i);
        const [s] = p.unitSegment((i + 1) % p.boundary.length);
        eq(s, e, `rim joins up at ${i}`);
      }
    }
  }
});

// Walk the graph without a person: always take the first way out.
function walk(ex, steps, answerYes = true) {
  const target = ex.steps + steps;
  for (let guard = 0; ex.steps < target && ex.phase !== 'over' && guard < steps * 4; guard++) {
    if (ex.phase === 'ask') { ex.answer(answerYes); continue; }
    ex.go(ex.ways()[0]);
  }
  return ex;
}

function checkGraph(ex) {
  for (const e of ex.edges) {
    eq(ex.node(e.a.node).ports[e.a.port], e.id, `edge ${e.id} hooked at a`);
    eq(ex.node(e.b.node).ports[e.b.port], e.id, `edge ${e.id} hooked at b`);
  }
  for (const n of ex.nodes) {
    eq(n.ports.length, n.degree, `node ${n.id} port count`);
    for (let p = 0; p < n.degree; p++) {
      const id = n.ports[p];
      if (id === null) continue;
      const e = ex.edges[id];
      ok((e.a.node === n.id && e.a.port === p) || (e.b.node === n.id && e.b.port === p),
        `node ${n.id} port ${p} agrees with edge ${id}`);
    }
  }
}

test('explore: what a place gives is said as a gain, not as a total', () => {
  const ex = new Explore('food-words');
  ex.supplies = 900;
  const said = [];
  const say = ex.say.bind(ex);
  ex.say = t => { said.push(t); say(t); };          // the log itself is trimmed
  ok(ex.log.some(l => l === 'you have food for 40 hours of walking.'), 'the opening states the total');
  walk(ex, 400, true);
  ok(ex.nodes.some(n => n.looted), 'something was found');
  for (const line of said) {
    ok(!/^food for \d+ more hours\.$/.test(line),
      `"${line}" reads as a new total rather than a gain`);
  }
  ok(said.some(l => l.includes('further than you could go before')), 'gains are phrased as gains');
});

test('explore: walking builds a graph and spends supplies', () => {
  const ex = new Explore('walk-test');
  ex.supplies = 500;
  eq(ex.nodes.length, 1, 'starts at the dead fire alone');
  eq(ex.ways().length, 1, 'one way out to begin with');
  walk(ex, 40);
  ok(ex.steps >= 40, 'the steps were taken');
  eq(ex.supplies, 500 - ex.steps + ex.nodes.filter(n => n.looted).reduce((s, n) => s + n.supplies, 0),
    'food spent one an hour, less what was found');
  ok(ex.nodes.length > 1, 'places were found');
  checkGraph(ex);
});

test('explore: saying yes closes a loop, saying no does not', () => {
  const yes = new Explore('loop-test'); yes.supplies = 500;
  walk(yes, 120, true);
  ok(yes.merges.length > 0, 'some loops were closed');
  checkGraph(yes);
  // every merge is an edge whose two ends were both already known
  for (const m of yes.merges) ok(yes.edges[m.edge], 'merge names a real edge');

  const no = new Explore('loop-test'); no.supplies = 500;
  walk(no, 120, false);
  eq(no.merges.length, 0, 'refusing never closes a loop');
  ok(no.refused.size > 0, 'refusals were recorded');
  checkGraph(no);
  ok(no.nodes.length > yes.nodes.length, 'refusing keeps making new places instead');
});

test('explore: a refusal is never offered again', () => {
  const ex = new Explore('refuse-test');
  ex.supplies = 500;
  for (let i = 0; i < 400 && ex.phase !== 'over'; i++) {
    if (ex.phase === 'ask') {
      const p = ex.pending;
      const k = `${p.from}:${p.fromPort}>${p.to}:${p.toPort}`;
      ok(!ex.refused.has(k), 'never asks about a tie already refused');
      ex.answer(false);
      ok(ex.refused.has(k), 'and remembers it');
      continue;
    }
    ex.go(ex.ways()[0]);
  }
});

test('explore: two loops to a handle, and what surface that makes', () => {
  const ex = new Explore('surface-test');
  const s = (plain, twist) => {
    ex.merges = [];
    for (let i = 0; i < plain; i++) ex.merges.push({ twist: false, edge: i });
    for (let i = 0; i < twist; i++) ex.merges.push({ twist: true, edge: plain + i });
    return ex.surface();
  };
  // a handle carries two loops, so a second loop can be free
  eq(s(0, 0).tubes, 0);
  eq(s(1, 0).tubes, 1);
  eq(s(2, 0).tubes, 1, 'the second loop went round the handle, not through a new one');
  eq(s(3, 0).tubes, 2);
  eq(s(4, 0).tubes, 2);
  eq(s(7, 0).tubes, 4);
  // chi follows the tubes, not the loops
  for (let n = 0; n <= 8; n++) {
    const r = s(n, 0);
    eq(r.chi, 2 - 2 * Math.ceil(n / 2), `chi for ${n} loops`);
    ok(2 - r.chi >= n, `${n} loops must fit in the surface`);
    ok(2 - (2 - 2 * Math.max(0, r.tubes - 1)) < n || r.tubes === 0,
      `${n} loops would not fit in one tube fewer`);
  }
  // one twist anywhere is enough
  eq(s(4, 0).orientable, true);
  eq(s(3, 1).orientable, false);
  eq(s(0, 1), { loops: 1, twisted: 1, tubes: 1, orientable: false, genus: 0, caps: 2, chi: 0 });
  // and the polygon agrees about which surface that is
  for (const [plain, twist, name] of [[0,0,'a sphere'], [1,0,'a torus'], [2,0,'a torus'],
                                      [3,0,'a double torus'], [0,1,'a klein bottle'],
                                      [3,1,'a surface with 4 crosscaps']]) {
    const r = s(plain, twist);
    const info = normalForm(r.genus, r.caps, 4).classify();
    eq(info.name, name, `${plain} plain, ${twist} twisted`);
    eq(info.chi, r.chi, `chi agrees for ${plain} plain, ${twist} twisted`);
    eq(info.orientable, r.orientable, `orientability agrees for ${plain} plain, ${twist} twisted`);
  }
});

test('explore: the tube plan accounts for every loop exactly once', () => {
  const ex = new Explore('plan-test');
  for (let n = 0; n <= 9; n++) {
    ex.merges = [];
    for (let i = 0; i < n; i++) ex.merges.push({ twist: i % 3 === 0, edge: i });
    const plan = ex.tubePlan();
    eq(plan.length, ex.surface().tubes, `${n} loops make ${plan.length} tubes`);
    const seen = [];
    for (const t of plan) {
      seen.push(t.throughIndex);
      if (t.around) seen.push(t.aroundIndex);
      eq(t.twisted, !!(t.through.twist || (t.around && t.around.twist)),
        'a tube is twisted if either of its loops was');
    }
    eq(seen.sort((a, b) => a - b), [...Array(n).keys()], `${n} loops all placed once`);
  }
});

test('explore: the walk minus its closed loops is a spanning tree', () => {
  for (const seed of ['tree-a', 'tree-b', 'tree-c']) {
    const ex = new Explore(seed);
    ex.supplies = 900;
    walk(ex, 300, true);
    const loops = ex.loopEdges();
    const tree = ex.edges.filter(e => !loops.has(e.id));
    eq(tree.length, ex.nodes.length - 1, `${seed}: a tree has one edge fewer than nodes`);
    eq(loops.size, ex.merges.length, `${seed}: one loop edge per merge`);
    eq(ex.edges.length, tree.length + loops.size, `${seed}: every edge is one or the other`);
    // no cycle among the tree edges, and they reach every place
    const parent = [...ex.nodes.keys()];
    const find = a => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
    for (const e of tree) {
      const x = find(e.a.node), y = find(e.b.node);
      ok(x !== y, `${seed}: tree edge ${e.id} would close a cycle`);
      parent[x] = y;
    }
    eq(new Set(ex.nodes.map(n => find(n.id))).size, 1, `${seed}: all one piece`);
  }
});

test('explore: no loop can be closed after camp', () => {
  const ex = new Explore('after-camp');
  ex.supplies = 900;
  walk(ex, 120, true);
  ex.supplies = 10;
  ok(ex.canCamp(), 'camp is offered');
  ex.makeCamp();
  const before = ex.surface();
  eq(ex.askChance(), 0, 'the forest stops asking');
  ex.supplies = 900;
  walk(ex, 300, true);
  eq(ex.surface(), before, 'so the shape cannot change');
  eq(ex.loopEdges().size, before.loops, 'and no new loop edges appeared');
});

test('explore: a world with no loose ends offers camp whatever the food says', () => {
  const ex = new Explore('closed-test');
  ex.supplies = 5000;
  walk(ex, 2000, true);
  if (ex.looseEnds() === 0) {
    ok(ex.canCamp(), 'camp offered once there is nowhere new');
    ok(ex.log.some(l => l.includes('run out of forest')), 'and the player is told');
  }
  // whatever happened, the graph is still sound
  checkGraph(ex);
});

test('explore: camp fixes the shape of the world', () => {
  const ex = new Explore('camp-test');
  ex.supplies = 500;
  walk(ex, 90, true);
  ok(ex.merges.length >= 1, 'a loop was closed before camp');
  ex.supplies = 10;
  ok(ex.canCamp(), 'camp is offered once food runs low');
  const before = ex.surface();
  ex.makeCamp();
  ok(ex.camped, 'camp made');
  eq(ex.canCamp(), false, 'and cannot be made twice');
  ex.supplies = 500;
  walk(ex, 120, true);
  eq(ex.surface(), before, 'later agreements change the map but not the shape');
  checkGraph(ex);
});

test('explore: running out of food ends it', () => {
  const ex = new Explore('end-test');
  ex.supplies = 6;
  walk(ex, 200, true);
  eq(ex.phase, 'over');
  ok(ex.supplies <= 0, 'food gone');
  const n = ex.steps;
  walk(ex, 10, true);
  eq(ex.steps, n, 'and nothing moves after that');
});

test('handlebody: the built solid has the topology the loops asked for', () => {
  const cases = [[], [false], [true], [false, false], [true, false], [true, true],
                 [false, false, false], [true, false, true], [false, false, false, false]];
  for (const twists of cases) {
    const n = twists.length, tw = twists.filter(Boolean).length;
    const m = buildHandlebody(twists);
    const label = JSON.stringify(twists);
    eq(m.chi, 2 - 2 * n, `${label}: a tube costs two from chi whichever way it goes on`);
    eq(m.orientable, tw === 0, `${label}: one twist is enough to make it one-sided`);
    // and it agrees with the polygon, which knows nothing about this construction
    const caps = tw === 0 ? 0 : 2 * n;
    const info = normalForm(tw === 0 ? n : 0, caps, 4).classify();
    eq(m.chi, info.chi, `${label}: chi agrees with the normal form`);
    eq(m.orientable, info.orientable, `${label}: orientability agrees with the normal form`);
  }
});

test('handlebody: it stays a regular quad grid, which later phases need', () => {
  for (const twists of [[], [false], [false, true]]) {
    const m = buildHandlebody(twists);
    const label = JSON.stringify(twists);
    let tris = 0;
    for (let f = 0; f < m.F; f++) {
      const q = [m.faces[f*4], m.faces[f*4+1], m.faces[f*4+2], m.faces[f*4+3]];
      if (new Set(q).size === 3) tris++;
    }
    // only the two ends of the capsule are fans; everything else is quads
    eq(tris, 2 * m.geom.C, `${label}: only the two poles are triangles`);
    ok(tris / m.F < 0.06, `${label}: the mesh is overwhelmingly quads`);
    // smoothing moves vertices and must not have changed the topology
    eq(m.chi, 2 - 2 * twists.length, `${label}: smoothing left chi alone`);
    eq(m.orientable, twists.every(t => !t), `${label}: smoothing left orientability alone`);
    // and must not have collapsed anything: no zero-length edge
    for (let e = 0; e < m.edgeA.length; e++) {
      const a = m.edgeA[e], b = m.edgeB[e];
      const d = Math.hypot(m.positions[a*3] - m.positions[b*3],
                           m.positions[a*3+1] - m.positions[b*3+1],
                           m.positions[a*3+2] - m.positions[b*3+2]);
      ok(d > 1e-4, `${label}: edge ${e} collapsed to nothing`);
    }
  }
});

test('handlebody: the mesh is a closed surface with nothing stranded', () => {
  for (const twists of [[], [true], [false, true, false]]) {
    const m = buildHandlebody(twists);
    const label = JSON.stringify(twists);
    // every vertex is used by some face
    const used = new Uint8Array(m.V);
    for (let i = 0; i < m.faces.length; i++) used[m.faces[i]] = 1;
    eq(used.indexOf(0), -1, `${label}: no vertex left stranded`);
    // every face is a triangle or a quad, never a sliver
    for (let f = 0; f < m.F; f++) {
      const q = [m.faces[f*4], m.faces[f*4+1], m.faces[f*4+2], m.faces[f*4+3]];
      ok(new Set(q).size >= 3, `${label}: face ${f} has fewer than three corners`);
    }
    // closed and manifold: every edge is shared by exactly two faces
    const count = new Map();
    for (let f = 0; f < m.F; f++) {
      for (let i = 0; i < 4; i++) {
        const a = m.faces[f*4+i], b = m.faces[f*4+(i+1)%4];
        if (a === b) continue;
        const k = Math.min(a,b) + ':' + Math.max(a,b);
        count.set(k, (count.get(k) || 0) + 1);
      }
    }
    for (const [k, c] of count) eq(c, 2, `${label}: edge ${k} borders ${c} faces, not two`);
    eq(count.size, m.edgeA.length, `${label}: edge list matches`);
    // connected
    const seen = new Uint8Array(m.V);
    const stack = [0]; seen[0] = 1; let reached = 1;
    while (stack.length) {
      const v = stack.pop();
      for (let i = m.start[v]; i < m.start[v+1]; i++) {
        const w = m.adj[i];
        if (!seen[w]) { seen[w] = 1; reached++; stack.push(w); }
      }
    }
    eq(reached, m.V, `${label}: all one piece`);
  }
});

// Glue a cut piece up and report what surface it turned out to be.
function glueUp(h, twisted) {
  const parent = [...Array(h.V).keys()];
  const find = a => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  for (const [a, b] of handleGluings(h, twisted)) {
    const x = find(a), y = find(b);
    if (x !== y) parent[x] = y;
  }
  const key = (a, b) => (a < b ? a + ':' + b : b + ':' + a);
  const use = new Map(), dir = new Map();
  for (let fi = 0; fi < h.faces.length; fi++) {
    const f = h.faces[fi];
    for (let i = 0; i < 4; i++) {
      const a = find(f[i]), b = find(f[(i + 1) % 4]);
      if (a === b) continue;
      const k = key(a, b);
      use.set(k, (use.get(k) || 0) + 1);
      if (!dir.has(k)) dir.set(k, []);
      dir.get(k).push([fi, a < b ? 1 : -1]);
    }
  }
  const V = new Set([...Array(h.V).keys()].map(find)).size;
  const chi = V - use.size + h.F;
  const free = [...use].filter(([, n]) => n === 1).map(([k]) => k.split(':').map(Number));
  const adj = new Map();
  for (const [a, b] of free) {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push(b); adj.get(b).push(a);
  }
  let cycles = 0; const seen = new Set();
  for (const s0 of adj.keys()) {
    if (seen.has(s0)) continue;
    cycles++; const st = [s0]; seen.add(s0);
    while (st.length) { const v = st.pop(); for (const w of adj.get(v)) if (!seen.has(w)) { seen.add(w); st.push(w); } }
  }
  const nbr = new Map();
  for (const [, l] of dir) if (l.length === 2) {
    const [[f, df], [g, dg]] = l;
    if (!nbr.has(f)) nbr.set(f, []);
    if (!nbr.has(g)) nbr.set(g, []);
    nbr.get(f).push([g, df === dg]); nbr.get(g).push([f, df === dg]);
  }
  const sign = new Int8Array(h.faces.length), done = new Uint8Array(h.faces.length);
  let orientable = true;
  for (let s0 = 0; s0 < h.faces.length; s0++) {
    if (done[s0]) continue;
    sign[s0] = 1; done[s0] = 1; const st = [s0];
    while (st.length) {
      const f = st.pop();
      for (const [g, flip] of (nbr.get(f) || [])) {
        const want = flip ? -sign[f] : sign[f];
        if (!done[g]) { sign[g] = want; done[g] = 1; st.push(g); }
        else if (sign[g] !== want) orientable = false;
      }
    }
  }
  const maxShare = Math.max(...use.values());
  const rimDegrees = [...new Set([...adj.values()].map(l => l.length))];
  return { chi, cycles, orientable, maxShare, rim: free.length, rimDegrees, V };
}

test('handle: the cut piece glues up into a torus with one disc gone', () => {
  const h = buildHandle({});
  const r = glueUp(h, false);
  eq(r.chi, -1, 'a torus with a disc out has euler characteristic -1');
  eq(r.orientable, true, 'and it is two-sided');
  eq(r.cycles, 1, 'the rim is a single circle');
  eq(r.rimDegrees, [2], 'and every point of it has exactly two neighbours');
  eq(r.rim, 2 * (h.hu + h.hv), 'the rim is as long as the hole it came from');
  eq(r.maxShare, 2, 'no edge borders more than two faces');
});

test('handle: closing the ring with a flip makes it a klein bottle instead', () => {
  const h = buildHandle({});
  const r = glueUp(h, true);
  eq(r.chi, -1, 'a klein bottle with a disc out has the same euler characteristic');
  eq(r.orientable, false, 'but it is one-sided');
  eq(r.cycles, 1, 'the rim is still a single circle');
  eq(r.maxShare, 2, 'and it is still a surface');
});

test('handle: the rim is one unbroken arc of the cut piece, which is the point', () => {
  const h = buildHandle({});
  const loop = boundaryLoop(h);
  ok(loop.length > 0, 'the cut piece has a boundary');
  // the rim's vertices are the ones ringing the hole, and they must sit
  // together along the walk rather than being scattered through it
  const hole = h.holes[0];
  const isRim = v => {
    const [u, w] = h.uv[v];
    return u >= hole.u0 && u <= hole.u0 + h.hu && w >= hole.v0 && w <= hole.v0 + h.hv;
  };
  const flags = loop.map(isRim);
  let runs = 0;
  for (let i = 0; i < flags.length; i++) {
    const prev = flags[(i - 1 + flags.length) % flags.length];
    if (flags[i] && !prev) runs++;
  }
  eq(runs, 1, 'the rim appears as one unbroken run of the boundary walk');
  // In the cut piece the rim is still an arc, not yet a circle: its two ends
  // are the two lips of the slit, which only become one point once it is
  // rolled up. So it has one more vertex than it has edges.
  eq(flags.filter(Boolean).length, 2 * (h.hu + h.hv) + 1, 'and it is the whole rim');
});

test('handle: rolling it up puts every glued pair at the same point', () => {
  const h = buildHandle({});
  for (const twisted of [false, true]) {
    for (const [a, b] of handleGluings(h, twisted)) {
      const d = Math.hypot(h.solid[a * 3] - h.solid[b * 3],
                           h.solid[a * 3 + 1] - h.solid[b * 3 + 1],
                           h.solid[a * 3 + 2] - h.solid[b * 3 + 2]);
      if (!twisted) ok(d < 1e-4, `glued pair ${a},${b} lands apart by ${d.toFixed(4)}`);
    }
  }
  // and the piece really is a torus of revolution: every point the right
  // distance from the ring's core circle
  const R = h.R, r = h.r;
  for (let i = 0; i < h.V; i++) {
    const x = h.solid[i * 3], y = h.solid[i * 3 + 1], z = h.solid[i * 3 + 2];
    const d = Math.hypot(Math.hypot(x, z) - R, y);
    ok(Math.abs(d - r) < 1e-4, `vertex ${i} is ${d.toFixed(4)} from the core, not ${r}`);
  }
});

test('handle: one rim, two rims, or none at all', () => {
  for (const rims of [0, 1, 2]) {
    for (const twisted of [false, true]) {
      const h = buildHandle({ rims });
      const r = glueUp(h, twisted);
      eq(r.chi, -rims, `${rims} rims, ${twisted ? 'twisted' : 'plain'}: chi`);
      eq(r.cycles, rims, `${rims} rims: that many boundary circles`);
      eq(r.orientable, !twisted, `${rims} rims: orientability follows the twist`);
      eq(r.maxShare, 2, `${rims} rims: still a surface`);
    }
  }
});

test('chain: handles in a row glue up into the surface the loops asked for', () => {
  const cases = [[false], [true], [false, false], [false, true], [true, true],
                 [false, false, false], [false, true, false]];
  for (const twists of cases) {
    const plan = twists.map(t => ({ twisted: t }));
    const c = buildChain(plan);
    const label = twists.map(t => (t ? 'T' : 'h')).join('');
    const n = twists.length, tw = twists.filter(Boolean).length;

    const parent = [...Array(c.V).keys()];
    const find = a => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
    for (const [a, b] of chainGluings(c)) { const x = find(a), y = find(b); if (x !== y) parent[x] = y; }
    const key = (a, b) => (a < b ? a + ':' + b : b + ':' + a);
    const use = new Map(), dir = new Map();
    for (let f = 0; f < c.F; f++) {
      for (let i = 0; i < 4; i++) {
        const a = find(c.faces[f * 4 + i]), b = find(c.faces[f * 4 + (i + 1) % 4]);
        if (a === b) continue;
        const k = key(a, b);
        use.set(k, (use.get(k) || 0) + 1);
        if (!dir.has(k)) dir.set(k, []);
        dir.get(k).push([f, a < b ? 1 : -1]);
      }
    }
    const V = new Set([...Array(c.V).keys()].map(find)).size;
    eq(V - use.size + c.F, 2 - 2 * n, `${label}: chi`);
    eq([...use.values()].filter(x => x === 1).length, 0, `${label}: closed, no free edges`);
    eq(Math.max(...use.values()), 2, `${label}: every edge borders exactly two faces`);

    const nbr = new Map();
    for (const [, l] of dir) if (l.length === 2) {
      const [[f, df], [g, dg]] = l;
      if (!nbr.has(f)) nbr.set(f, []);
      if (!nbr.has(g)) nbr.set(g, []);
      nbr.get(f).push([g, df === dg]); nbr.get(g).push([f, df === dg]);
    }
    const sign = new Int8Array(c.F), done = new Uint8Array(c.F);
    let orientable = true;
    for (let s0 = 0; s0 < c.F; s0++) {
      if (done[s0]) continue;
      sign[s0] = 1; done[s0] = 1; const st = [s0];
      while (st.length) {
        const f = st.pop();
        for (const [g, flip] of (nbr.get(f) || [])) {
          const want = flip ? -sign[f] : sign[f];
          if (!done[g]) { sign[g] = want; done[g] = 1; st.push(g); }
          else if (sign[g] !== want) orientable = false;
        }
      }
    }
    eq(orientable, tw === 0, `${label}: one twist makes it one-sided`);
  }
});

test('chain: the net lies flat, and rolling it up moves every point somewhere', () => {
  const c = buildChain([{ twisted: false }, { twisted: false }]);
  for (let i = 0; i < c.V; i++) {
    eq(c.flat[i * 3 + 2], 0, `vertex ${i} of the net is off the page`);
    ok(Number.isFinite(c.flat[i * 3]) && Number.isFinite(c.flat[i * 3 + 1]),
      `vertex ${i} of the net has no place`);
  }
  // the net is wider than it is tall, being a row of pieces
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < c.V; i++) {
    x0 = Math.min(x0, c.flat[i * 3]); x1 = Math.max(x1, c.flat[i * 3]);
    y0 = Math.min(y0, c.flat[i * 3 + 1]); y1 = Math.max(y1, c.flat[i * 3 + 1]);
  }
  ok(x1 - x0 > y1 - y0, 'a chain of two lies wider than it is tall');
  // and every glued pair meets once it is rolled up
  for (const [a, b] of chainGluings(c)) {
    const d = Math.hypot(c.positions[a * 3] - c.positions[b * 3],
                         c.positions[a * 3 + 1] - c.positions[b * 3 + 1],
                         c.positions[a * 3 + 2] - c.positions[b * 3 + 2]);
    ok(d < 1e-3, `glued pair ${a},${b} is ${d.toFixed(4)} apart when rolled up`);
  }
});

const el = document.getElementById('out');
const failed = results.filter(r => !r.ok);
el.textContent = results.map(r => (r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.ok ? '' : '\n  ' + r.err)).join('\n') +
  `\n\n${results.length - failed.length}/${results.length} passed`;
document.title = failed.length ? 'FAIL' : 'PASS';
