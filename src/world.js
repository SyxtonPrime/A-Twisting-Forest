// Landscape on the polygon. Terrain is fixed per cell from the seed; the
// player's choices only decide how the rim is sewn together.
import { Polygon, key } from './polygon.js';
import { hashSeed, mulberry32 } from './rng.js';

export const TERRAIN = {
  camp:   { glyph: 'A', weight: 0,  familiar: 'that dead fire',    supplies: 0,  arrive: 'the camp. the fire is out.' },
  grass:  { glyph: '.', weight: 55, familiar: 'this clearing',     supplies: 0,  arrive: null },
  forest: { glyph: 'T', weight: 22, familiar: 'that crooked tree', supplies: 0,  arrive: 'a crooked tree.' },
  rock:   { glyph: '^', weight: 12, familiar: 'that split boulder', supplies: 0, arrive: 'a boulder, split in two.' },
  pool:   { glyph: 'o', weight: 6,  familiar: 'that still pool',   supplies: 3,  arrive: 'a still pool.' },
  hut:    { glyph: 'H', weight: 5,  familiar: 'that fallen hut',   supplies: 10, arrive: 'a fallen hut.' },
};

export class World {
  constructor(seed, opts = {}) {
    this.seed = seed;
    this.poly = new Polygon(opts);
    this.tiles = new Map();
    const rng = mulberry32(hashSeed('terrain:' + seed));
    const entries = Object.entries(TERRAIN).filter(([, t]) => t.weight > 0);
    const total = entries.reduce((s, [, t]) => s + t.weight, 0);
    for (let y = 0; y < this.poly.H; y++) {
      for (let x = 0; x < this.poly.W; x++) {
        let r = rng() * total, terrain = entries[entries.length - 1][0];
        for (const [name, t] of entries) { r -= t.weight; if (r < 0) { terrain = name; break; } }
        this.tiles.set(key([x, y]), { terrain, looted: false });
      }
    }
    this.tiles.get(key(this.poly.centre())).terrain = 'camp';
  }

  get(cell) { return this.tiles.get(key(cell)) || null; }
}
