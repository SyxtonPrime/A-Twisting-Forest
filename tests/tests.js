import { Polygon, DIRS, I2, mul, applyM, det, key, same, surfaceName, E, N, W, S } from '../src/polygon.js';
import { Game } from '../src/game.js';

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

test('game: walking off an unsewn edge sews it and continues inside', () => {
  const g = new Game('test', { sides: 16, len: 6 });
  g.supplies = 1000;
  const c0 = g.poly.centre();
  for (let i = 0; i <= c0[1]; i++) g.move([0, -1]);
  if (g.phase === 'prompt') g.answer(true);
  ok(g.poly.pairCount() >= 1, 'an edge was sewn');
  ok(g.poly.inside(g.pos), 'player is inside the polygon');
  eq(g.chart, [0, -(c0[1] + 1)], 'dead reckoning ignores the seam');
  eq(Math.abs(det(g.frame)), 1);
});

test('game: development is consistent around a flat torus', () => {
  const g = new Game('test', { sides: 16, len: 6 });
  for (let i = 0; i < 4; i++) g.poly.glue(i, 11 - i, -1);
  for (let i = 0; i < 4; i++) g.poly.glue(4 + i, 15 - i, -1);
  const dev = g.develop(61, 61);
  for (const [k, st] of dev) {
    ok(st, 'every offset reachable on a closed world');
    const [ox, oy] = k.split(',').map(Number);
    const expect = [((g.pos[0] + ox) % 24 + 24) % 24, ((g.pos[1] + oy) % 24 + 24) % 24];
    eq(st.cell, expect, `offset ${k}`);
    eq(st.F, I2);
  }
});

test('game: refusing forbids that seam and finds another', () => {
  const g = new Game('test2', { sides: 16, len: 6 });
  g.supplies = 1000;
  const c0 = g.poly.centre();
  // explore the whole rectangle first so every landing is recognisable
  for (let y = 0; y < g.poly.H; y++) for (let x = 0; x < g.poly.W; x++) g.explored.add(key([x, y]));
  for (let i = 0; i <= c0[1]; i++) g.move([0, -1]);
  eq(g.phase, 'prompt', 'a recognisable landing is offered');
  const before = g.forbidden.size;
  g.answer(false);
  ok(g.forbidden.size === before + 1, 'refusal recorded');
  ok(g.phase === 'prompt' || g.poly.pairCount() === 1, 'either asked again or sewn elsewhere');
});

const el = document.getElementById('out');
const failed = results.filter(r => !r.ok);
el.textContent = results.map(r => (r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.ok ? '' : '\n  ' + r.err)).join('\n') +
  `\n\n${results.length - failed.length}/${results.length} passed`;
document.title = failed.length ? 'FAIL' : 'PASS';
