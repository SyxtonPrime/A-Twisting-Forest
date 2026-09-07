import { Polygon, DIRS, I2, mul, applyM, det, key, same, surfaceName, normalForm, normalFormSides, normalFormLen, E, N, W, S } from '../src/polygon.js';
import { Explore } from '../src/explore.js';
import { World } from '../src/world.js';
import { buildMesh } from '../src/mesh.js';
import { buildHandle, handleGluings, boundaryLoop } from '../src/handle.js';
import { buildChain, chainGluings, chainOverlay, chainPositions } from '../src/chain.js';
import { mulberry32 } from '../src/rng.js';
import { rollPoint, phaseAt, CURL_END, RING_START } from '../src/roll/roll.js';
import { buildSheet, sheetPositions } from '../src/roll/sheet.js';
import { buildPiece, piecePositions, boundaryOf } from '../src/roll/piece.js';
import { emptyNet, grow, buildNet, netPositions } from '../src/roll/net.js';
import { rimArc } from '../src/handle.js';

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

test('chain: the route runs the whole way, across the cylinders as well', () => {
  for (const twists of [[false], [false, false], [false, true, false]]) {
    const plan = twists.map(t => ({ twisted: t }));
    const chain = buildChain(plan);
    const ex = new Explore('route-' + twists.length);
    ex.supplies = 900;
    walk(ex, 220, true);
    const paths = chainOverlay(chain, ex);
    const trail = paths.filter(p => p.kind === 'trail');
    ok(trail.length > 0, `${twists.length} pieces: there is a route at all`);

    // every step of it joins two vertices that share a face, and the whole
    // thing is one piece rather than scraps
    const share = new Map();
    for (let f = 0; f < chain.F; f++) {
      for (let i = 0; i < 4; i++) {
        const a = chain.faces[f * 4 + i], b = chain.faces[f * 4 + (i + 1) % 4];
        if (a === b) continue;
        if (!share.has(a)) share.set(a, new Set());
        if (!share.has(b)) share.set(b, new Set());
        share.get(a).add(b); share.get(b).add(a);
      }
    }
    const link = new Map();
    const join = (a, b) => {
      if (!link.has(a)) link.set(a, new Set());
      if (!link.has(b)) link.set(b, new Set());
      link.get(a).add(b); link.get(b).add(a);
    };
    for (const p of trail) {
      for (let i = 0; i + 1 < p.ids.length; i++) {
        const a = p.ids[i], b = p.ids[i + 1];
        ok(a === b || (share.get(a) && share.get(a).has(b)),
          `${twists.length} pieces: the route jumps between ${a} and ${b}, which do not touch`);
        join(a, b);
      }
    }
    const all = [...link.keys()];
    const seen = new Set([all[0]]);
    const stack = [all[0]];
    while (stack.length) {
      const v = stack.pop();
      for (const w of link.get(v)) if (!seen.has(w)) { seen.add(w); stack.push(w); }
    }
    eq(seen.size, all.length, `${twists.length} pieces: the route is one connected line`);

    // and it really does use the cylinders, not just the pieces either side
    if (chain.bridges.length) {
      const inTrail = new Set(all);
      for (const br of chain.bridges) {
        const mid = br.cols[Math.floor(br.cols.length / 2)];
        ok(mid.some(v => inTrail.has(v)), 'the route crosses the cylinder');
      }
    }
  }
});



// ---- the roll: a rectangle into a torus --------------------------------

test('roll: act one is a bend, and it ends on the cylinder', () => {
  const R = 3, r = 1, P = Math.PI;
  // flat to begin with
  for (const y of [-P * r, 0, 0.4, P * r]) {
    const p = rollPoint(2, y, R, r, 0, 0);
    eq([p[0], p[1], p[2]], [2, y, 0], 'nothing has moved yet');
  }
  // the limit as the bend radius runs off to infinity is the flat sheet
  const tiny = rollPoint(2, 1.3, R, r, 1e-7, 0);
  ok(Math.abs(tiny[0] - 2) < 1e-9 && Math.abs(tiny[1] - 1.3) < 1e-6 && Math.abs(tiny[2]) < 1e-6,
     'a very gentle bend is very nearly flat, and not a NaN');
  // curled up, every point sits at distance r from the tube's axis
  for (let k = 0; k <= 24; k++) {
    const y = (-P + (2 * P * k) / 24) * r;
    const p = rollPoint(0.7, y, R, r, 1, 0);
    ok(Math.abs(Math.hypot(p[1], p[2] - r) - r) < 1e-9, 'on the cylinder');
    ok(Math.abs(p[0] - 0.7) < 1e-12, 'nothing moves along the tube in act one');
  }
  // and no length across the sheet has changed: arc length is the coordinate
  let arc = 0, prev = rollPoint(0, -P * r, R, r, 1, 0);
  for (let k = 1; k <= 2000; k++) {
    const p = rollPoint(0, -P * r + (2 * P * r * k) / 2000, R, r, 1, 0);
    arc += Math.hypot(p[1] - prev[1], p[2] - prev[2]);
    prev = p;
  }
  ok(Math.abs(arc - 2 * P * r) < 1e-4, `act one keeps the width: ${arc}`);
});

test('roll: it finishes on a torus, with both pairs of edges together', () => {
  const R = 3, r = 1, P = Math.PI;
  let worst = 0;
  for (let a = 0; a <= 20; a++) {
    for (let b = 0; b <= 20; b++) {
      const x = (-P + (2 * P * a) / 20) * R, y = (-P + (2 * P * b) / 20) * r;
      const p = rollPoint(x, y, R, r, 1, 1);
      // the finished ring is centred on the y axis at z = r - R
      const d = Math.hypot(p[0], p[2] - (r - R)) - R;
      worst = Math.max(worst, Math.abs(Math.hypot(d, p[1]) - r));
    }
  }
  ok(worst < 1e-9, `every point lands on the torus: worst ${worst}`);

  // the long edges are one edge now, and so are the ends
  for (const x of [-P * R, -1, 0, 2, P * R]) {
    const lo = rollPoint(x, -P * r, R, r, 1, 1), hi = rollPoint(x, P * r, R, r, 1, 1);
    ok(Math.hypot(lo[0] - hi[0], lo[1] - hi[1], lo[2] - hi[2]) < 1e-9, 'act one pair glued');
  }
  for (const y of [-P * r, -0.5, 0, 1.1, P * r]) {
    const lo = rollPoint(-P * R, y, R, r, 1, 1), hi = rollPoint(P * R, y, R, r, 1, 1);
    ok(Math.hypot(lo[0] - hi[0], lo[1] - hi[1], lo[2] - hi[2]) < 1e-9, 'act two pair glued');
  }
});

test('roll: nothing tears, and the two acts do not overlap', () => {
  const R = 3, r = 1;
  const at0 = phaseAt(0), atEnd = phaseAt(1);
  eq([at0.curl, at0.ring], [0, 0]);
  eq([atEnd.curl, atEnd.ring], [1, 1]);
  ok(phaseAt(CURL_END).curl === 1, 'act one is done when act one is done');
  ok(phaseAt(RING_START).ring === 0, 'act two has not started before it starts');
  ok(phaseAt((CURL_END + RING_START) / 2).curl === 1, 'the beat between is a cylinder');

  // walk the timeline and check no point ever jumps
  const P = Math.PI;
  let worst = 0;
  for (const [x, y] of [[0, 0], [P * R, P * r], [-2, 1.4], [5, -2.7]]) {
    let prev = null;
    for (let k = 0; k <= 400; k++) {
      const { curl, ring } = phaseAt(k / 400);
      const p = rollPoint(x, y, R, r, curl, ring);
      ok(isFinite(p[0]) && isFinite(p[1]) && isFinite(p[2]), 'finite everywhere');
      if (prev) worst = Math.max(worst, Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]));
      prev = p;
    }
  }
  ok(worst < 0.4, `the roll is continuous: biggest step ${worst}`);
});

test('roll: the sheet is a proper grid, and every quad keeps its four corners', () => {
  const sh = buildSheet(12, 6);
  eq(sh.V, 13 * 7); eq(sh.F, 72);
  for (let f = 0; f < sh.F; f++) {
    const q = [0, 1, 2, 3].map(k => sh.faces[f * 4 + k]);
    eq(new Set(q).size, 4, 'four distinct corners');
  }
  // every vertex of the flat net is where the rectangle says it should be
  const P = Math.PI, R = 3, r = 1;
  const flat = sheetPositions(sh, 0, { R, r });
  let w = 0, h = 0;
  for (let i = 0; i < sh.V; i++) {
    ok(Math.abs(flat[i * 3 + 2]) < 1e-6, 'the net lies in a plane');
    w = Math.max(w, Math.abs(flat[i * 3])); h = Math.max(h, Math.abs(flat[i * 3 + 1]));
  }
  ok(Math.abs(2 * w - 2 * P * R) < 1e-4, 'the net is 2piR long');
  ok(Math.abs(2 * h - 2 * P * r) < 1e-4, 'the net is 2pir across');
});


// ---- the handle piece: a pentagon into a torus with a disc gone ---------

const PIECE = buildPiece({ nu: 12, nv: 24, hu: 4, hv: 4, R: 3, r: 1, face: 0.25 });

test('piece: the drawing is a drawing -- every boundary vertex is pinned', () => {
  const loop = boundaryOf(PIECE);
  // the boundary walk really is the whole boundary
  const count = new Map();
  const key = (a, b) => (a < b ? a + ':' + b : b + ':' + a);
  for (const f of PIECE.h.faces) for (let i = 0; i < 4; i++) {
    const k = key(f[i], f[(i + 1) % 4]);
    count.set(k, (count.get(k) || 0) + 1);
  }
  const onBoundary = new Set();
  for (const [k, n] of count) if (n === 1) for (const v of k.split(':')) onBoundary.add(Number(v));
  eq(loop.length, onBoundary.size, 'the walk visits every boundary vertex once');

  // and none of them was left to be dragged into the middle by Tutte: every one
  // sits on a side of the pentagon it was pinned to
  const flat = piecePositions(PIECE, 0);
  const P = PIECE.corners;
  for (const v of loop) {
    const x = flat[v * 3], y = flat[v * 3 + 1];
    let near = Infinity;
    for (let i = 0; i < P.length; i++) near = Math.min(near, toSegment(x, y, P[i], P[(i + 1) % P.length]));
    ok(near < 1e-3, `boundary vertex ${v} is on a side of the pentagon, not inside it: ${near}`);
  }
});

function toSegment(x, y, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / len)) : 0;
  return Math.hypot(x - (a[0] + dx * t), y - (a[1] + dy * t));
}

test('piece: what gets cut out of the torus is a disc, not a square', () => {
  const flat = piecePositions(PIECE, 0.36);          // developed
  // the walk's last vertex is its first one again -- the two lips of the slit --
  // so it is left out of the average, or the centre comes out pulled towards it
  const rim = rimArc(PIECE.h, 0);
  const once = rim.slice(0, -1);
  let cx = 0, cy = 0;
  for (const v of once) { cx += flat[v * 3]; cy += flat[v * 3 + 1]; }
  cx /= once.length; cy /= once.length;
  let lo = Infinity, hi = 0, gap = 0, prev = null;
  for (const v of rim) {
    const d = Math.hypot(flat[v * 3] - cx, flat[v * 3 + 1] - cy);
    lo = Math.min(lo, d); hi = Math.max(hi, d);
    if (prev !== null) gap = Math.max(gap, Math.hypot(flat[v * 3] - prev[0], flat[v * 3 + 1] - prev[1]));
    prev = [flat[v * 3], flat[v * 3 + 1]];
  }
  ok(hi / lo < 1.03, `the rim is a circle: radius ${lo.toFixed(3)} to ${hi.toFixed(3)}`);
  // and its vertices are spread evenly round it, not bunched at the old corners
  ok(gap < (2 * Math.PI * hi) / (rim.length - 1) * 1.25, `evenly spread: biggest step ${gap.toFixed(3)}`);
});

test('piece: it lies flat, then rolls up into a torus with one disc gone', () => {
  const flat = piecePositions(PIECE, 0);
  for (let i = 0; i < PIECE.V; i++) ok(Math.abs(flat[i * 3 + 2]) < 1e-6, 'the net lies in a plane');

  const R = PIECE.R, r = PIECE.r;
  const up = piecePositions(PIECE, 1);
  // every point is on the torus. the ring closes about the y axis, and act two
  // was told to bend the other way, so the middle of the sheet -- and the hole
  // in it -- comes out round the outside
  let worst = 0, cz = 0;
  for (let i = 0; i < PIECE.V; i++) cz = Math.max(cz, up[i * 3 + 2]);
  for (let i = 0; i < PIECE.V; i++) {
    const d = Math.hypot(up[i * 3], up[i * 3 + 2] - (r + R)) - R;
    worst = Math.max(worst, Math.abs(Math.hypot(d, up[i * 3 + 1]) - r));
  }
  ok(worst < 1e-4, `every point lands on the torus: worst ${worst}`);

  // and everything that should be glued has come together
  for (const [a, b] of handleGluings(PIECE.h, false)) {
    const d = Math.hypot(up[a * 3] - up[b * 3], up[a * 3 + 1] - up[b * 3 + 1], up[a * 3 + 2] - up[b * 3 + 2]);
    ok(d < 1e-4, `glued pair ${a},${b} meets: ${d}`);
  }
});

test('piece: the rim stays a boundary, and comes out round the outside', () => {
  const up = piecePositions(PIECE, 1);
  const R = PIECE.R, r = PIECE.r;
  const rim = rimArc(PIECE.h, 0);
  ok(rim.length > 4, 'there is a rim');
  // the rim is a closed circle once it is rolled up: its two ends are the two
  // lips of the slit, which are the same point on the surface
  const a = rim[0], b = rim[rim.length - 1];
  ok(Math.hypot(up[a * 3] - up[b * 3], up[a * 3 + 1] - up[b * 3 + 1], up[a * 3 + 2] - up[b * 3 + 2]) < 1e-4,
     'the rim closes');
  // and it sits on the outside of the ring, where a neck can reach it
  for (const v of rim) {
    const rad = Math.hypot(up[v * 3], up[v * 3 + 2] - (r + R));
    ok(rad > R, `rim vertex ${v} is outside the ring's centre line: ${rad}`);
  }
});

test('piece: act zero is flat, and does not start until the piece is drawn', () => {
  const { open, curl, ring } = phaseAt(0.0, PIECE.plan);
  eq([open, curl, ring], [0, 0, 0]);
  // while act zero runs, nothing has left the plane
  for (const t of [0.05, 0.12, 0.2, 0.26, 0.3]) {
    const p = piecePositions(PIECE, t);
    for (let i = 0; i < PIECE.V; i++) ok(Math.abs(p[i * 3 + 2]) < 1e-6, `flat at t=${t}`);
  }
  // by the time act one starts, the piece is the developed rectangle
  const dev = piecePositions(PIECE, 0.36);
  let w = 0, h = 0;
  for (let i = 0; i < PIECE.V; i++) {
    w = Math.max(w, Math.abs(dev[i * 3])); h = Math.max(h, Math.abs(dev[i * 3 + 1]));
  }
  ok(Math.abs(2 * w - 2 * Math.PI * PIECE.R) < 1e-3, 'developed to 2piR long');
  ok(Math.abs(2 * h - 2 * Math.PI * PIECE.r) < 1e-3, 'developed to 2pir across');
});

// ---- a net of handles ---------------------------------------------------

const SMALL = { nu: 12, nv: 36, hu: 3, hv: 3, R: 3, r: 1 };
function netOf(...growAt) {
  const n = emptyNet();
  for (const at of growAt) grow(n, at);
  return buildNet(n, { ...SMALL, cache: new Map() });
}

test('net: a piece has four sides more than it has neighbours', () => {
  eq(netOf().nodes[0].piece.n, 4, 'on its own it is a closed torus');
  const pair = netOf(0);
  eq(pair.nodes.map(x => x.piece.n), [5, 5], 'two handles are two pentagons');
  const three = netOf(0, 0);
  eq(three.nodes.map(x => x.piece.n), [6, 5, 5], 'a middle handle is a hexagon');
  const four = netOf(0, 0, 0);
  eq(four.nodes[0].piece.n, 7, 'three necks on one handle is a heptagon');
  eq(four.genus, 4, 'the genus is the number of pieces');
});

test('net: every piece rolls up onto its own torus, wherever it is put', () => {
  const mesh = netOf(0, 0);
  const up = netPositions(mesh, 1);
  const R = mesh.R, r = mesh.r;
  for (const v of mesh.order) {
    const nd = mesh.nodes[v];
    // the tori all lie in one plane, so a piece's own centre is found from the
    // vertices that are furthest apart on it
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < nd.piece.V; i++) {
      for (let c = 0; c < 3; c++) {
        const x = up[(nd.offset + i) * 3 + c];
        lo[c] = Math.min(lo[c], x); hi[c] = Math.max(hi[c], x);
      }
    }
    const w = hi[0] - lo[0], h = hi[2] - lo[2], tall = hi[1] - lo[1];
    ok(Math.abs(w - 2 * (R + r)) < 0.6 && Math.abs(h - 2 * (R + r)) < 0.6,
       `piece ${v} is a torus ${2 * (R + r)} across: got ${w.toFixed(2)} by ${h.toFixed(2)}`);
    ok(Math.abs(tall - 2 * r) < 0.5, `piece ${v} is ${2 * r} tall: got ${tall.toFixed(2)}`);
  }
});

test('net: flat it is one connected piece, and every neck is a rectangle', () => {
  const mesh = netOf(0, 0, 1);
  const flat = netPositions(mesh, 0);
  for (let i = 0; i < mesh.V; i++) ok(Math.abs(flat[i * 3 + 2]) < 1e-5, 'the whole net lies in a plane');
  for (const link of mesh.links) {
    const near = link.cols[0], far = link.cols[link.cols.length - 1];
    // a neck is a rectangle: every ruled line across it is the same length,
    // and the two rims it joins run the same way
    let lo = Infinity, hi = 0;
    for (let k = 0; k < link.m; k++) {
      const a = near[k] * 3, b = far[k] * 3;
      lo = Math.min(lo, Math.hypot(flat[a] - flat[b], flat[a + 1] - flat[b + 1]));
      hi = Math.max(hi, Math.hypot(flat[a] - flat[b], flat[a + 1] - flat[b + 1]));
    }
    ok(hi / lo < 1.15, `neck ${link.a}-${link.b} is a rectangle: ${lo.toFixed(2)} to ${hi.toFixed(2)}`);
  }
});

test('net: no piece sits on top of another, flat or rolled', () => {
  for (const mesh of [netOf(0, 0, 0), netOf(0, 1, 2)]) {
    for (const t of [0, 0.3, 1]) {
      const pos = netPositions(mesh, t);
      const mid = mesh.order.map(v => {
        const nd = mesh.nodes[v];
        let x = 0, y = 0, z = 0;
        for (let i = 0; i < nd.piece.V; i++) {
          const o = (nd.offset + i) * 3;
          x += pos[o]; y += pos[o + 1]; z += pos[o + 2];
        }
        return [x / nd.piece.V, y / nd.piece.V, z / nd.piece.V];
      });
      for (let i = 0; i < mid.length; i++) {
        for (let j = i + 1; j < mid.length; j++) {
          const d = Math.hypot(mid[i][0] - mid[j][0], mid[i][1] - mid[j][1], mid[i][2] - mid[j][2]);
          ok(d > 2 * mesh.r, `t=${t}: pieces ${i} and ${j} are ${d.toFixed(2)} apart`);
        }
      }
    }
  }
});

test('net: smoothing the joins does not pull the surface apart at a seam', () => {
  const mesh = netOf(0, 0);
  const up = netPositions(mesh, 1);
  for (const v of mesh.order) {
    const nd = mesh.nodes[v];
    for (const [x, y] of handleGluings(nd.piece.h, false)) {
      const a = (x + nd.offset) * 3, b = (y + nd.offset) * 3;
      const d = Math.hypot(up[a] - up[b], up[a + 1] - up[b + 1], up[a + 2] - up[b + 2]);
      ok(d < 1e-3, `piece ${v}: glued pair ${x},${y} is still one point: ${d}`);
    }
  }
});

// ---- the report ------------------------------------------------------

const el = document.getElementById('out');
const failed = results.filter(r => !r.ok);
el.textContent = results.map(r => (r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.ok ? '' : '\n  ' + r.err)).join('\n') +
  `\n\n${results.length - failed.length}/${results.length} passed`;
document.title = failed.length ? 'FAIL' : 'PASS';
