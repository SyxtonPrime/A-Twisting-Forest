// Small seeded PRNG so a world can be replayed from its seed.
export function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeedWord(rng = Math.random) {
  const cons = 'bdfghklmnprstvz', vow = 'aeiou';
  let s = '';
  for (let i = 0; i < 3; i++) s += cons[Math.floor(rng() * cons.length)] + vow[Math.floor(rng() * vow.length)];
  return s;
}
