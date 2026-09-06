import { Game } from './game.js';
import { drawChart, polygonZoom } from './render.js';
import { randomSeedWord } from './rng.js';
import { buildMesh } from './mesh.js';
import { spectralInit, Relaxer } from './embed.js';
import { Solid } from './scene3d.js';

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
let solid = null, relaxer = null, solidRAF = 0, showingSolid = false;
const settings = { zoomMs: 2600, settleSteps: 3000, stepsPerFrame: 12 };

function start(seed) {
  p = params();
  if (seed) p.seed = seed;
  location.hash = `seed=${p.seed}&sides=${p.sides}&len=${p.len}`;
  game = new Game(p.seed, { sides: p.sides, len: p.len });
  if (solidRAF) cancelAnimationFrame(solidRAF);
  solidRAF = 0; solid = null; relaxer = null; showingSolid = false;
  $('overlay').hidden = true;
  $('reveal').hidden = true;
  $('solid').hidden = true;
  $('stage-hint').hidden = true;
  $('zoom').style.opacity = 1;
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
  setTimeout(() => buildSolid(), 700);
  const half = game.poly.n / 2;
  const yours = half - game.autoSewn;
  $('reveal-name').textContent = `you were walking on ${info.name}.`;
  $('reveal-detail').textContent =
    `${yours} of ${half} seams were yours; the forest closed the rest. ` +
    `euler characteristic ${info.chi}, ${info.orientable ? 'orientable' : 'not orientable'}, ` +
    `${info.V} corner${info.V === 1 ? '' : 's'}. ` +
    (info.cones.length
      ? `${info.bunched} where the world bunches up, ${info.flared} where it flares out.`
      : 'flat everywhere: your map never lied.');
  $('reveal-stats').textContent =
    `${game.steps} steps. ${game.explored.size} of ${game.poly.W * game.poly.H} places seen. ` +
    `you recognised ${game.agreed} place${game.agreed === 1 ? '' : 's'} and refused ${game.refused}.`;
}

// Build the surface as a solid and let it settle where the player can watch.
function buildSolid() {
  const mesh = buildMesh(game.poly, game.world, game.explored);
  const pos = spectralInit(mesh, 3, 900);
  for (let i = 0; i < pos.length; i++) pos[i] += (Math.random() - 0.5) * 0.15;  // break the symmetry
  relaxer = new Relaxer(mesh, pos);
  solid = new Solid($('solid'), mesh, relaxer.pos);
  solid.setPairColours(game.poly);
  sizeSolid();
  $('solid').hidden = false;
  requestAnimationFrame(() => {
    $('zoom').style.opacity = 0;
    $('stage-hint').hidden = false;
  });
  showingSolid = true;
  $('flip').textContent = 'show the flat map';
  // Settle it in front of the player rather than making them wait. The step
  // budget adapts, so a slow phone takes longer to come to rest instead of
  // dropping frames.
  let budget = settings.stepsPerFrame;
  const spin = () => {
    solidRAF = requestAnimationFrame(spin);
    if (relaxer.steps < settings.settleSteps) {
      const t0 = performance.now();
      for (let i = 0; i < budget; i++) relaxer.step();
      relaxer.recentre();
      const per = (performance.now() - t0) / budget;
      budget = Math.max(1, Math.min(40, Math.round(9 / Math.max(per, 0.05))));
    }
    if (solid.autoSpin) solid.az += 0.004;
    solid.draw();
  };
  spin();
}

function sizeSolid() {
  if (!solid) return;
  const overlay = $('overlay');
  const narrow = window.innerWidth <= 900;
  const w = narrow ? overlay.clientWidth - 32 : Math.max(320, overlay.clientWidth - 360 - 72);
  const h = narrow ? Math.max(260, overlay.clientHeight * 0.55) : Math.max(320, overlay.clientHeight - 48);
  const side = Math.max(240, Math.min(w, h));
  solid.resize(side, side);
  solid.draw();
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
$('flip').onclick = () => {
  if (!solid) return;
  showingSolid = !showingSolid;
  $('zoom').style.opacity = showingSolid ? 0 : 1;
  $('solid').style.opacity = showingSolid ? 1 : 0;
  $('stage-hint').hidden = !showingSolid;
  $('flip').textContent = showingSolid ? 'show the flat map' : 'show the world';
};
$('again').onclick = () => start(randomSeedWord());
$('same').onclick = () => start(game.seed);

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (game && game.phase !== 'over') render();
    else sizeSolid();
  }, 150);
});

start();
window.dev = { game: () => game, render, settings, solid: () => solid, relaxer: () => relaxer };
