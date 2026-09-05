import { World, TERRAIN } from './world.js';
import { DIRS, I2, key, add, same, mul, applyM, dirIndex } from './polygon.js';
import { hashSeed, mulberry32 } from './rng.js';

export const START_SUPPLIES = 45;
const PREFER_KNOWN = 0.75; // chance of offering a recognisable landing over a fresh one

export class Game {
  constructor(seed, opts = {}) {
    this.seed = seed;
    this.rng = mulberry32(hashSeed('game:' + seed));
    this.world = new World(seed, opts);
    this.poly = this.world.poly;
    this.pos = this.poly.centre();   // true cell
    this.frame = I2;                 // screen direction -> true direction
    this.chart = [0, 0];             // dead reckoning
    this.explored = new Set([key(this.pos)]);
    this.lastChart = new Map([[key(this.pos), [0, 0]]]);
    this.forbidden = new Set();
    this.supplies = START_SUPPLIES;
    this.steps = 0;
    this.agreed = 0;
    this.refused = 0;
    this.phase = 'explore'; // explore | prompt | over
    this.pending = null;
    this.log = [];
    this.say('the fire is out. the forest is dark.');
    this.say(`you have supplies for ${START_SUPPLIES} steps.`);
  }

  say(text) { this.log.push({ text, step: this.steps }); if (this.log.length > 80) this.log.shift(); }

  // u is a screen direction: [1,0] east, [0,1] north.
  move(u) {
    if (this.phase !== 'explore') return;
    const d = applyM(this.frame, u);
    const c = add(this.pos, d);
    if (this.poly.inside(c)) { this.step(u, c, this.frame); return; }
    const idx = this.poly.unitIndex(this.pos, dirIndex(d));
    const i = this.poly.edgeOf(idx);
    if (!this.poly.isFree(i)) {
      const x = this.poly.cross(idx);
      this.step(u, x.cell, mul(x.T, this.frame));
      return;
    }
    this.resolve(u, idx, i, false);
  }

  candidates(idx, i) {
    const out = [];
    for (const j of this.poly.freeEdges()) {
      if (j === i) continue;
      for (const o of [1, -1]) {
        if (this.forbidden.has(`${i},${j},${o}`)) continue;
        out.push({ j, o, landing: this.poly.landing(idx, j, o) });
      }
    }
    return out;
  }

  pick(list) { return list[Math.floor(this.rng() * list.length)]; }

  // The player is stepping off an unpaired edge. Decide where the world
  // continues: offer a recognisable place if there is one (the player can
  // refuse), otherwise sew the edge to fresh forest silently.
  resolve(u, idx, i, afterRefusal) {
    const cands = this.candidates(idx, i);
    const known = cands.filter(c => this.explored.has(key(c.landing.cell)));
    const fresh = cands.filter(c => !this.explored.has(key(c.landing.cell)));
    const offer = known.length && (!fresh.length || (!afterRefusal && this.rng() < PREFER_KNOWN));
    if (offer) {
      this.pending = { ...this.pick(known), u, idx, i };
      this.phase = 'prompt';
      return;
    }
    if (fresh.length) {
      const c = this.pick(fresh);
      this.poly.glue(i, c.j, c.o);
      this.step(u, c.landing.cell, mul(c.landing.T, this.frame));
      this.checkClosed();
      return;
    }
    this.say('the forest is impassable here.');
  }

  promptText() {
    const t = TERRAIN[this.world.get(this.pending.landing.cell).terrain];
    return `does ${t.familiar} look familiar?`;
  }

  answer(yes) {
    if (this.phase !== 'prompt') return;
    const p = this.pending;
    this.pending = null;
    this.phase = 'explore';
    if (yes) {
      this.poly.glue(p.i, p.j, p.o);
      this.agreed++;
      this.say(p.o === -1
        ? 'yes. the same one. the path has bent back on itself.'
        : 'yes. the same one. but the light falls on it from the wrong side.');
      this.step(p.u, p.landing.cell, mul(p.landing.T, this.frame));
      this.checkClosed();
    } else {
      this.forbidden.add(`${p.i},${p.j},${p.o}`);
      this.refused++;
      this.say('no. another one, much like the last.');
      this.resolve(p.u, p.idx, p.i, true);
    }
  }

  checkClosed() {
    if (this.poly.closed()) this.say('the world is closed. every path is a circle now.');
  }

  step(u, c, F) {
    this.chart = add(this.chart, u);
    this.pos = c;
    this.frame = F;
    this.steps++;
    this.supplies--;
    const k = key(c);
    const fresh = !this.explored.has(k);
    this.explored.add(k);
    this.lastChart.set(k, this.chart);
    const tile = this.world.get(c);
    const t = TERRAIN[tile.terrain];
    if (t.arrive && fresh) this.say(t.arrive);
    if (t.supplies && !tile.looted) {
      tile.looted = true;
      this.supplies += t.supplies;
      this.say(`supplies for ${t.supplies} more steps.`);
    }
    if (this.supplies <= 0) this.end('you cannot go on. you lie down.');
  }

  giveUp() {
    if (this.phase === 'over') return;
    this.pending = null;
    this.end('you lie down.');
  }

  end(text) { this.phase = 'over'; this.say(text); }

  // Lay the world out flat around the player, as their dead reckoning would
  // have it: breadth-first through the sewn edges, first arrival wins. Away
  // from cone points every route agrees; near one, the map shows a seam.
  develop(cols, rows) {
    const hx = Math.floor(cols / 2), hy = Math.floor(rows / 2);
    const out = new Map();
    const queue = [{ cell: this.pos, F: this.frame, o: [0, 0] }];
    out.set('0,0', queue[0]);
    for (let q = 0; q < queue.length; q++) {
      const { cell, F, o } = queue[q];
      for (const u of DIRS) {
        const o2 = add(o, u);
        if (o2[0] < -hx || o2[0] > cols - 1 - hx || o2[1] < -hy || o2[1] > rows - 1 - hy) continue;
        const k = key(o2);
        if (out.has(k)) continue;
        const d = applyM(F, u);
        const c = add(cell, d);
        let next = null;
        if (this.poly.inside(c)) next = { cell: c, F, o: o2 };
        else {
          const idx = this.poly.unitIndex(cell, dirIndex(d));
          if (!this.poly.isFree(this.poly.edgeOf(idx))) {
            const x = this.poly.cross(idx);
            next = { cell: x.cell, F: mul(x.T, F), o: o2 };
          }
        }
        out.set(k, next); // null marks an unsewn rim: nothing there yet
        if (next) queue.push(next);
      }
    }
    return out;
  }

  // Is this development copy the one the player actually walked?
  walkedHere(cell, offset) {
    const c = this.lastChart.get(key(cell));
    return c && same(c, add(this.chart, offset));
  }
}
