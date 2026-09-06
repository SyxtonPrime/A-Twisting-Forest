import { Explore, START_SUPPLIES } from './explore.js';
import { drawSketch } from './sketch.js';
import { drawPieces } from './pieces.js';
import { normalForm } from './polygon.js';
import { World } from './world.js';
import { buildMesh } from './mesh.js';
import { spectralInit, Relaxer } from './embed.js';
import { Solid } from './scene3d.js';
import { randomSeedWord } from './rng.js';

const $ = id => document.getElementById(id);
const settings = { settleSteps: 3000, stepsPerFrame: 12, revealDelay: 900 };

let ex, solid, relaxer, solidRAF = 0, view = 'pieces', mapOpen = false, revealed = false;

function start(seed) {
  const h = new URLSearchParams(location.hash.slice(1));
  const s = seed || h.get('seed') || randomSeedWord();
  location.hash = `seed=${s}`;
  if (solidRAF) cancelAnimationFrame(solidRAF);
  solidRAF = 0; solid = null; relaxer = null; revealed = false; mapOpen = false; view = 'pieces';
  ex = new Explore(s);
  $('overlay').hidden = true;
  $('reveal').hidden = true;
  $('solid').hidden = true;
  $('finalmap').hidden = true;
  $('pieces').hidden = false;
  render();
}

function render() {
  const log = $('log');
  log.innerHTML = '';
  for (const line of ex.log) {
    const el = document.createElement('p');
    el.textContent = line;
    log.appendChild(el);
  }
  $('supplies').textContent = Math.max(0, ex.supplies);
  $('steps').textContent = ex.steps;
  $('loops').textContent = ex.merges.length;
  $('seed').textContent = ex.seed;
  $('map').hidden = !ex.camped;
  $('map').textContent = mapOpen ? 'put the map away' : 'the map';
  $('mapwrap').hidden = !(ex.camped && mapOpen);
  if (ex.camped && mapOpen) drawSketch($('sketch'), ex, sketchSize(), sketchSize());
  renderActions();
  if (ex.phase === 'over' && !revealed) reveal();
}

function sketchSize() {
  return window.innerWidth <= 900 ? Math.min(window.innerWidth - 32, 420) : 258;
}

function renderActions() {
  const act = $('act');
  act.innerHTML = '';
  if (ex.phase === 'over') return;
  if (ex.phase === 'ask') {
    const q = document.createElement('p');
    q.className = 'ask';
    q.textContent = ex.promptText();
    act.appendChild(q);
    act.appendChild(button('yes', 'y', () => { ex.answer(true); render(); }));
    act.appendChild(button('no', 'n', () => { ex.answer(false); render(); }));
    return;
  }
  const ways = ex.ways();
  ways.forEach((port, i) => {
    const name = ex.wayName(port);
    act.appendChild(button(name === 'on' ? 'go on' : `go ${name}`, ways.length > 1 ? String(i + 1) : '⏎', () => {
      ex.go(port); render();
    }));
  });
  if (ex.canCamp()) act.appendChild(button('make camp', 'c', () => {
    ex.makeCamp(); mapOpen = true; render();
  }));
}

function button(text, key, onClick) {
  const b = document.createElement('button');
  b.textContent = text;
  if (key) {
    const k = document.createElement('span');
    k.className = 'key'; k.textContent = key;
    b.appendChild(k);
  }
  b.onclick = onClick;
  return b;
}

// ---- the reveal -------------------------------------------------------

function reveal() {
  revealed = true;
  const s = ex.surface();
  const kinds = ex.merges.map(m => (m.twist ? 'crosscap' : 'handle'));
  $('overlay').hidden = false;
  sizeStage();
  drawPieces($('pieces'), kinds, stageSide(), stageSide());
  const poly = normalForm(s.handles, s.crosscaps);
  const info = poly.classify();
  setTimeout(() => {
    $('reveal').hidden = false;
    describe(s, info);
    setView('pieces');
    buildSolid(poly);
  }, settings.revealDelay);
}

function describe(s, info) {
  $('reveal-name').textContent = `you were walking on ${info.name}.`;
  const pieces = s.loops === 0
    ? 'you never closed a loop, so it never became anything but a sphere.'
    : `${s.loops} loop${s.loops === 1 ? '' : 's'} closed: ` +
      `${s.handles} the same way round, ${s.crosscaps} with the light on the wrong side.` +
      (s.crosscaps && s.handles
        ? ' beside a crosscap a handle is worth two more of them, so it all falls together into crosscaps.'
        : '');
  $('reveal-detail').textContent = pieces + ` euler characteristic ${info.chi}, ` +
    `${info.orientable ? 'orientable' : 'not orientable'}.`;
  const st = ex.stats();
  $('reveal-stats').textContent =
    `${ex.steps} hours walked. ${st.seen} places, ${st.edges} paths, ` +
    `${st.loose} way${st.loose === 1 ? '' : 's'} you never took. ` +
    (ex.camped ? 'you made camp.' : 'you never made camp.');
}

function stageSide() {
  const o = $('overlay');
  const narrow = window.innerWidth <= 900;
  const w = narrow ? o.clientWidth - 32 : Math.max(320, o.clientWidth - 380 - 96);
  const h = narrow ? Math.max(280, o.clientHeight * 0.5) : Math.max(320, o.clientHeight - 64);
  return Math.max(260, Math.min(w, h));
}

function sizeStage() {
  const side = stageSide();
  drawPieces($('pieces'), ex.merges.map(m => (m.twist ? 'crosscap' : 'handle')), side, side);
  drawSketch($('finalmap'), ex, side, side);
  if (solid) { solid.resize(side, side); solid.draw(); }
}

function setView(v) {
  view = v;
  for (const id of ['pieces', 'solid', 'finalmap']) $(id).hidden = id !== v;
  for (const b of document.querySelectorAll('#reveal .buttons button[data-view]'))
    b.setAttribute('aria-pressed', String(b.dataset.view === v));
  $('stage-hint').textContent =
    v === 'solid' ? 'drag to turn it over'
    : v === 'pieces' ? 'a sphere with a hole per loop, and what each loop turned out to be'
    : 'the paths you walked, as you drew them';
}

function buildSolid(poly) {
  const world = new World(ex.seed, { poly });
  const all = new Set();
  for (let y = 0; y < poly.H; y++) for (let x = 0; x < poly.W; x++) all.add(`${x},${y}`);
  const mesh = buildMesh(poly, world, all);
  const pos = spectralInit(mesh, 3, 900);
  for (let i = 0; i < pos.length; i++) pos[i] += (Math.random() - 0.5) * 0.15;
  relaxer = new Relaxer(mesh, pos);
  solid = new Solid($('solid'), mesh, pos);
  solid.setPairColours(poly);
  solid.resize(stageSide(), stageSide());
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
    if (!$('solid').hidden) solid.draw();
  };
  spin();
}

// ---- wiring -----------------------------------------------------------

document.addEventListener('keydown', e => {
  if (e.altKey || e.ctrlKey || e.metaKey || !ex) return;
  const k = e.key.toLowerCase();
  if (ex.phase === 'ask') {
    if (k === 'y') { ex.answer(true); render(); }
    if (k === 'n') { ex.answer(false); render(); }
    return;
  }
  if (ex.phase !== 'walk') return;
  const ways = ex.ways();
  if ((k === 'enter' || k === ' ') && ways.length === 1) { e.preventDefault(); ex.go(ways[0]); render(); return; }
  const n = Number(k);
  if (n >= 1 && n <= ways.length) { ex.go(ways[n - 1]); render(); return; }
  if (k === 'c' && ex.canCamp()) { ex.makeCamp(); mapOpen = true; render(); return; }
  if (k === 'm' && ex.camped) { mapOpen = !mapOpen; render(); }
});
$('map').onclick = () => { mapOpen = !mapOpen; render(); };
$('lie-down').onclick = () => { ex.giveUp(); render(); };
$('new-world').onclick = () => start(randomSeedWord());
$('again').onclick = () => start(randomSeedWord());
$('same').onclick = () => start(ex.seed);
for (const b of document.querySelectorAll('#reveal .buttons button[data-view]'))
  b.onclick = () => setView(b.dataset.view);

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (revealed) sizeStage(); else render(); }, 150);
});

start();
window.dev = { ex: () => ex, render, setMapOpen: v => { mapOpen = v; }, settings, solid: () => solid, relaxer: () => relaxer, setView };
