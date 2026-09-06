// Stage one: walking in the dark.
//
// There is no map and no geometry here, only a graph. Places are nodes with
// a fixed number of ways out; walking down a way that leads nowhere yet either
// finds somewhere new or, if the player says a place looks familiar, ties the
// loose end to somewhere they have already been. Nothing has to be consistent,
// because nothing is being drawn. That is the point of doing it blind: the
// world can be decided later, and only has to agree with what was said.
//
// Every tie the player accepts closes a loop. A loop closed the same way round
// is a handle; one closed with the light on the wrong side is a crosscap. That
// is the whole of the topology, and it is not settled until they make camp.

import { mulberry32, hashSeed } from './rng.js';

export const PLACES = [
  { key: 'clearing', name: 'a clearing',          the: 'this clearing',      weight: 26, supplies: 0 },
  { key: 'oak',      name: 'a crooked oak',       the: 'that crooked oak',   weight: 16, supplies: 0 },
  { key: 'boulder',  name: 'a split boulder',     the: 'that split boulder', weight: 13, supplies: 0 },
  { key: 'stump',    name: 'a burnt stump',       the: 'that burnt stump',   weight: 11, supplies: 0 },
  { key: 'cairn',    name: 'a heap of stones',    the: 'that heap of stones', weight: 9, supplies: 0 },
  { key: 'skull',    name: 'a deer skull',        the: 'that deer skull',    weight: 7,  supplies: 0 },
  { key: 'bramble',  name: 'a wall of bramble',   the: 'that bramble',       weight: 7,  supplies: 0 },
  { key: 'pool',     name: 'a still pool',        the: 'that still pool',    weight: 6,  supplies: 4, take: 'you drink your fill.' },
  { key: 'creek',    name: 'a dry creek',         the: 'that dry creek',     weight: 5,  supplies: 2, take: 'there is water under the stones.' },
  { key: 'hut',      name: 'a fallen hut',        the: 'that fallen hut',    weight: 4,  supplies: 9, take: 'there is food in the hut, still good.' },
];

export const START_SUPPLIES = 40;
const CAMP_AT = 14;          // supplies left before camp is offered
const MIN_MERGES_TO_CAMP = 1;
const ASK_COOLDOWN = 9;      // steps between questions
const MIN_STEPS_TO_ASK = 10;
const TWIST_CHANCE = 0.3;

const WAY_NAMES = {
  2: ['on'],
  3: ['left', 'right'],
  4: ['left', 'straight on', 'right'],
};

export class Explore {
  constructor(seed) {
    this.seed = seed;
    this.rng = mulberry32(hashSeed('explore:' + seed));
    this.nodes = [];
    this.edges = [];
    this.supplies = START_SUPPLIES;
    this.steps = 0;
    this.sinceAsk = 0;
    this.refused = new Set();
    this.merges = [];
    this.camped = false;
    this.phase = 'walk';      // walk | ask | over
    this.pending = null;
    this.log = [];

    // The dead fire, and the way they came in, which leads back out of the
    // story and stays loose unless they find it again.
    const start = this.addNode(2, 'clearing');
    start.name = 'the dead fire';
    start.the = 'the dead fire';
    start.visited = true;
    this.at = { node: start.id, port: 0 };
    this.trail = [start.id];

    this.say('the fire is out. the forest is dark.');
    this.say(`you have food for ${START_SUPPLIES} hours of walking.`);
    this.say('there is a path. you cannot see where it goes.');
  }

  say(text) { this.log.push(text); if (this.log.length > 40) this.log.shift(); }

  node(id) { return this.nodes[id]; }
  get here() { return this.nodes[this.at.node]; }

  pickPlace() {
    const total = PLACES.reduce((s, p) => s + p.weight, 0);
    let r = this.rng() * total;
    for (const p of PLACES) { r -= p.weight; if (r < 0) return p; }
    return PLACES[0];
  }

  addNode(degree, forceKey) {
    const place = forceKey ? PLACES.find(p => p.key === forceKey) : this.pickPlace();
    const n = {
      id: this.nodes.length,
      degree,
      key: place.key,
      name: place.name,
      the: place.the,
      supplies: place.supplies,
      take: place.take,
      looted: false,
      ports: new Array(degree).fill(null),
      visited: false,
    };
    this.nodes.push(n);
    return n;
  }

  danglingPorts(n) {
    const out = [];
    for (let i = 0; i < n.ports.length; i++) if (n.ports[i] === null) out.push(i);
    return out;
  }

  // Ways out of here, not counting the one we came in by (unless it is the
  // only one there is).
  ways() {
    const n = this.here;
    const all = [...n.ports.keys()];
    const out = all.filter(p => p !== this.at.port);
    return out.length ? out : all;
  }

  wayName(port) {
    const n = this.here;
    const list = this.ways();
    if (list.length === 1) return 'on';
    const names = WAY_NAMES[n.degree] || [];
    const i = list.indexOf(port);
    return names[i] || `the ${i + 1}${['st', 'nd', 'rd'][i] || 'th'} way`;
  }

  // Somewhere the player has been, with a loose end, that this path could
  // plausibly come back out at.
  candidates(fromNode, fromPort) {
    const out = [];
    for (const n of this.nodes) {
      if (!n.visited) continue;
      for (const q of this.danglingPorts(n)) {
        if (n.id === fromNode && q === fromPort) continue;
        if (this.refused.has(`${fromNode}:${fromPort}>${n.id}:${q}`)) continue;
        out.push({ node: n.id, port: q });
      }
    }
    return out;
  }

  askChance() {
    // After camp the shape of the world is settled, so nothing may close
    // another loop. What is left can only grow as a tree, which is exactly
    // what can be drawn flat on the sphere.
    if (this.camped) return 0;
    if (this.sinceAsk < ASK_COOLDOWN || this.steps < MIN_STEPS_TO_ASK) return 0;
    return Math.min(0.45, 0.13 + 0.04 * (this.sinceAsk - ASK_COOLDOWN));
  }

  go(port) {
    if (this.phase !== 'walk') return;
    const from = this.at.node;
    const edgeId = this.here.ports[port];
    if (edgeId !== null) { this.traverse(edgeId, from, port); return; }

    const cands = this.candidates(from, port);
    if (cands.length && this.rng() < this.askChance()) {
      const recent = new Set(this.trail.slice(-6));
      const far = cands.filter(c => !recent.has(c.node));
      const pool = far.length ? far : cands;
      const pick = pool[Math.floor(this.rng() * pool.length)];
      this.pending = {
        from, fromPort: port, to: pick.node, toPort: pick.port,
        twist: this.rng() < TWIST_CHANCE,
      };
      this.phase = 'ask';
      this.sinceAsk = 0;
      return;
    }
    this.openNew(from, port);
  }

  openNew(from, port) {
    const r = this.rng();
    const degree = r < 0.12 ? 4 : r < 0.46 ? 3 : 2;
    const n = this.addNode(degree);
    const e = this.connect(from, port, n.id, 0, false);
    this.traverse(e, from, port);
  }

  connect(a, ap, b, bp, twist) {
    const e = { id: this.edges.length, a: { node: a, port: ap }, b: { node: b, port: bp }, twist };
    this.edges.push(e);
    this.nodes[a].ports[ap] = e.id;
    this.nodes[b].ports[bp] = e.id;
    return e.id;
  }

  promptText() {
    const n = this.node(this.pending.to);
    return this.pending.twist
      ? `${n.the}, but the light is on the wrong side of it. have you been here before?`
      : `does ${n.the} look familiar?`;
  }

  answer(yes) {
    if (this.phase !== 'ask') return;
    const p = this.pending;
    this.pending = null;
    this.phase = 'walk';
    if (!yes) {
      this.refused.add(`${p.from}:${p.fromPort}>${p.to}:${p.toPort}`);
      this.say('no. another one, much like it.');
      this.openNew(p.from, p.fromPort);
      return;
    }
    const e = this.connect(p.from, p.fromPort, p.to, p.toPort, p.twist);
    this.merges.push({ edge: e, twist: p.twist });
    this.say(p.twist
      ? 'yes. the same place, turned over. the path has come back on itself the wrong way round.'
      : 'yes. the same place. the path has come back on itself.');
    this.traverse(e, p.from, p.fromPort);
  }

  traverse(edgeId, fromNode, fromPort) {
    const e = this.edges[edgeId];
    const far = (e.a.node === fromNode && e.a.port === fromPort) ? e.b : e.a;
    this.at = { node: far.node, port: far.port };
    this.steps++;
    this.sinceAsk++;
    this.supplies--;
    this.trail.push(far.node);
    const n = this.here;
    const fresh = !n.visited;
    n.visited = true;
    n.visits = (n.visits || 0) + 1;
    if (fresh) this.say(`you come to ${n.name}.`);
    else {
      const again = ['again.', 'once more.', 'for the third time, or the fourth.',
                     'you have been here.', 'the same as before.'];
      this.say(`${n.name}, ${again[Math.min(n.visits - 2, again.length - 1)]}`);
    }
    if (n.supplies && !n.looted) {
      n.looted = true;
      this.supplies += n.supplies;
      // Say what was gained, never a bare "food for N hours": that reads as
      // the total and makes it look as though the supply just collapsed.
      this.say(`${n.take} ${n.supplies} hours further than you could go before.`);
    }
    if (fresh && this.here.degree > 2 && this.ways().length > 1) this.say('the path splits.');
    if (this.looseEnds() === 0 && !this.toldClosed) {
      this.toldClosed = true;
      this.say('every path from here goes somewhere you have been. the forest has run out of forest.');
    }
    if (this.supplies <= 0) this.end('you cannot go on. you lie down where you are.');
  }

  looseEnds() {
    return this.nodes.reduce((s, n) => s + this.danglingPorts(n).length, 0);
  }

  // Either the food is nearly gone, or there is nowhere left to go: every
  // path now leads somewhere already walked, and the world will not get any
  // bigger by walking it.
  canCamp() {
    return !this.camped && this.phase === 'walk' &&
      this.merges.length >= MIN_MERGES_TO_CAMP &&
      (this.supplies <= CAMP_AT || this.looseEnds() === 0);
  }

  // Making camp is what settles the world. Until now the shape of it was
  // undecided; from here the loops the player closed are what it is.
  makeCamp() {
    if (!this.canCamp()) return null;
    this.camped = true;
    this.here.isCamp = true;
    this.say('you make camp. you sit until the shaking stops.');
    this.say('by the fire you draw what you remember. it does not look like you expected.');
    return this.surface();
  }

  // A handle carries two independent loops, not one: you can walk through the
  // tube, and you can walk around it. So closing a second loop need not add
  // anything to the world. It may only mean you went round a handle that was
  // already there.
  //
  // A sphere with t tubes carries 2t independent loops, so n loops need
  // t = ceil(n / 2) of them. A tube costs two from the euler characteristic
  // whichever way round it goes on, and one twist anywhere makes the whole
  // world one-sided, in which case a sphere with t tubes is 2t crosscaps.
  surface() {
    const loops = this.merges.length;
    const twisted = this.merges.filter(m => m.twist).length;
    const tubes = Math.ceil(loops / 2);
    const orientable = twisted === 0;
    return {
      loops, twisted, tubes, orientable,
      genus: orientable ? tubes : 0,
      caps: orientable ? 0 : 2 * tubes,
      chi: 2 - 2 * tubes,
    };
  }

  // Which loop went through which tube, and which went round one. Loops pair
  // up in the order they were closed; an odd one out gets a tube to itself.
  tubePlan() {
    const plan = [];
    for (let i = 0; i < this.merges.length; i += 2) {
      const through = this.merges[i];
      const around = this.merges[i + 1] || null;
      plan.push({
        through, around,
        throughIndex: i,
        aroundIndex: around ? i + 1 : -1,
        twisted: !!(through.twist || (around && around.twist)),
      });
    }
    return plan;
  }

  giveUp() { this.end('you lie down.'); }

  end(text) {
    if (this.phase === 'over') return;
    this.phase = 'over';
    this.pending = null;
    this.say(text);
  }

  // Edge ids that closed a loop. Every other edge led to a place that did not
  // exist a moment before, so the rest of the graph is a spanning tree.
  loopEdges() { return new Set(this.merges.map(m => m.edge)); }

  stats() {
    const seen = this.nodes.filter(n => n.visited).length;
    const loose = this.nodes.reduce((s, n) => s + this.danglingPorts(n).length, 0);
    return { seen, total: this.nodes.length, loose, edges: this.edges.length };
  }
}
