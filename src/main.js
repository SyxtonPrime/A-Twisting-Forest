import { Game } from './game.js';
import { drawChart, polygonZoom } from './render.js';
import { randomSeedWord } from './rng.js';

const $ = id => document.getElementById(id);
const oddDown = x => (x % 2 ? x : x - 1);

function params() {
  const h = new URLSearchParams(location.hash.slice(1));
  return {
    seed: h.get('seed') || randomSeedWord(),
    sides: Number(h.get('sides')) || 16,
    len: Number(h.get('len')) || 6,
  };
}

// How much map fits, given the viewport. Odd counts so the player sits dead centre.
function layout() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const narrow = vw <= 900;
  const cs = narrow ? (vw < 380 ? 12 : 14) : 16;
  const w = narrow ? vw - 26 : Math.min(760, vw - 280 - 200 - 96);
  const h = narrow ? vh * 0.52 : vh - 50;
  return {
    cols: Math.max(13, oddDown(Math.floor(w / cs))),
    rows: Math.max(11, oddDown(Math.floor(h / cs))),
    cs,
  };
}

let game, p, view, zooming = false;
const settings = { zoomMs: 2600 };

function start(seed) {
  p = params();
  if (seed) p.seed = seed;
  location.hash = `seed=${p.seed}&sides=${p.sides}&len=${p.len}`;
  game = new Game(p.seed, { sides: p.sides, len: p.len });
  $('overlay').hidden = true;
  $('reveal').hidden = true;
  zooming = false;
  render();
}

function render() {
  view = layout();
  drawChart($('map'), game, view.cols, view.rows, view.cs);
  const log = $('log');
  log.innerHTML = '';
  for (const entry of game.log.slice().reverse()) {
    const el = document.createElement('p');
    el.textContent = entry.text;
    log.appendChild(el);
  }
  $('supplies').textContent = game.supplies;
  $('steps').textContent = game.steps;
  $('sewn').textContent = `${game.poly.pairCount()} / ${game.poly.n / 2}`;
  $('seed').textContent = game.seed;
  $('prompt').hidden = game.phase !== 'prompt';
  if (game.phase === 'prompt') $('prompt-text').textContent = game.promptText();
  if (game.phase === 'over' && !zooming) reveal();
}

function walk(u) {
  if (game.phase !== 'explore') return;
  game.move(u);
  render();
}

function reveal() {
  zooming = true;
  const overlay = $('overlay');
  overlay.hidden = false;
  const narrow = window.innerWidth <= 900;
  const w = narrow ? overlay.clientWidth - 32 : Math.max(320, overlay.clientWidth - 360 - 72);
  const h = narrow ? Math.max(260, overlay.clientHeight * 0.55) : Math.max(320, overlay.clientHeight - 48);
  const cellPx = Math.max(6, Math.min(20, Math.floor(Math.min(w / (game.poly.W + 4), h / (game.poly.H + 4)))));
  const frame = polygonZoom($('zoom'), game, w, h, cellPx);
  const info = game.poly.classify();
  const t0 = performance.now(), dur = settings.zoomMs;
  function tick(now) {
    const t = Math.min(1, (now - t0) / dur);
    frame(t);
    if (t < 1) requestAnimationFrame(tick);
    else showReveal(info);
  }
  requestAnimationFrame(tick);
}

function showReveal(info) {
  $('reveal').hidden = false;
  const half = game.poly.n / 2;
  if (info.closed) {
    $('reveal-name').textContent = `you were walking on ${info.name}.`;
    $('reveal-detail').textContent =
      `${half} pairs of edges, ${info.V} corner${info.V === 1 ? '' : 's'}. euler characteristic ${info.chi}, ` +
      `${info.orientable ? 'orientable' : 'not orientable'}. ` +
      (info.cones.length
        ? `${info.bunched} corner${info.bunched === 1 ? '' : 's'} where the world bunches up, ${info.flared} where it flares out.`
        : 'flat everywhere: your map never lied.');
  } else {
    $('reveal-name').textContent = `you never closed the world.`;
    $('reveal-detail').textContent =
      `${info.pairs} of ${half} pairs sewn, ${info.boundaries} ragged edge${info.boundaries === 1 ? '' : 's'} left. ` +
      `sewn shut as it stands it would be ${info.name}.`;
  }
  $('reveal-stats').textContent =
    `${game.steps} steps. ${game.explored.size} of ${game.poly.W * game.poly.H} places seen. ` +
    `you recognised ${game.agreed} place${game.agreed === 1 ? '' : 's'} and refused ${game.refused}.`;
}

const KEYS = {
  ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  w: [0, 1], s: [0, -1], a: [-1, 0], d: [1, 0],
  k: [0, 1], j: [0, -1], h: [-1, 0], l: [1, 0],
};

document.addEventListener('keydown', e => {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  if (game.phase === 'prompt') {
    if (e.key === 'y' || e.key === 'Y') { game.answer(true); render(); }
    if (e.key === 'n' || e.key === 'N') { game.answer(false); render(); }
    return;
  }
  const u = KEYS[e.key];
  if (u && game.phase === 'explore') { e.preventDefault(); walk(u); }
});

// Tap the map: one step toward wherever you tapped.
$('map').addEventListener('click', e => {
  if (game.phase !== 'explore') return;
  const r = $('map').getBoundingClientRect();
  const dx = Math.floor((e.clientX - r.left) / view.cs) - Math.floor(view.cols / 2);
  const dy = Math.floor((e.clientY - r.top) / view.cs) - Math.floor(view.rows / 2);
  if (!dx && !dy) return;
  walk(Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx), 0] : [0, -Math.sign(dy)]);
});

for (const b of $('pad').children) {
  b.addEventListener('click', () => walk(b.dataset.dir.split(',').map(Number)));
}
$('yes').onclick = () => { game.answer(true); render(); };
$('no').onclick = () => { game.answer(false); render(); };
$('lie-down').onclick = () => { game.giveUp(); render(); };
$('new-world').onclick = () => start(randomSeedWord());
$('again').onclick = () => start(randomSeedWord());
$('same').onclick = () => start(game.seed);

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (game && game.phase !== 'over') render(); }, 150);
});

start();
window.dev = { game: () => game, render, settings };
