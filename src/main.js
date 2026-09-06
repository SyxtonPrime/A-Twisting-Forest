import { Explore, START_SUPPLIES } from './explore.js';
import { drawSketch } from './sketch.js';
import { drawWorldMap } from './worldmap.js';
import { normalForm } from './polygon.js';
import { buildHandlebody } from './handlebody.js';
import { Solid } from './scene3d.js';
import { randomSeedWord } from './rng.js';

const $ = id => document.getElementById(id);
const settings = { revealDelay: 900 };

let ex, solid, solidRAF = 0, view = 'map', mapOpen = false, revealed = false;

function start(seed) {
  const h = new URLSearchParams(location.hash.slice(1));
  const s = seed || h.get('seed') || randomSeedWord();
  location.hash = `seed=${s}`;
  if (solidRAF) cancelAnimationFrame(solidRAF);
  solidRAF = 0; solid = null; revealed = false; mapOpen = false; view = 'map';
  ex = new Explore(s);
  $('overlay').hidden = true;
  $('reveal').hidden = true;
  $('solid').hidden = true;
  $('worldmap').hidden = false;
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
  $('overlay').hidden = false;
  sizeStage();
  const poly = normalForm(s.genus, s.caps);
  const info = poly.classify();
  setTimeout(() => {
    $('reveal').hidden = false;
    describe(s, info);
    setView('map');
    buildSolid();
  }, settings.revealDelay);
}

function describe(s, info) {
  $('reveal-name').textContent = `you were walking on ${info.name}.`;
  const plain = s.tubes - s.twisted;
  const body = s.tubes === 0
    ? 'you never closed a loop, so the world stayed a sphere.'
    : `a sphere with ${s.tubes} tube${s.tubes === 1 ? '' : 's'} through it: ` +
      `${plain} glued straight on, ${s.twisted} with a half turn in ${s.twisted === 1 ? 'it' : 'them'}.` +
      (s.twisted ? ' one half turn is enough to make the whole world one-sided.' : '');
  $('reveal-detail').textContent = body + ` euler characteristic ${info.chi}, ` +
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
  drawWorldMap($('worldmap'), ex, side, side);
  if (solid) { solid.resize(side, side); solid.draw(); }
}

function setView(v) {
  view = v;
  $('worldmap').hidden = v !== 'map';
  $('solid').hidden = v !== 'solid';
  for (const b of document.querySelectorAll('#reveal .buttons button[data-view]'))
    b.setAttribute('aria-pressed', String(b.dataset.view === v));
  $('stage-hint').textContent = v === 'solid'
    ? 'drag to turn it over'
    : 'everywhere you walked lies flat on the sphere, except the loops you closed';
  if (v === 'solid' && solid) solid.draw();
}

// The solid is built, not settled, so there is nothing to wait for: the
// shape is right the moment it exists.
function buildSolid() {
  const mesh = buildHandlebody(ex.merges.map(m => !!m.twist));
  solid = new Solid($('solid'), mesh, mesh.positions);
  solid.el = 0.5;
  solid.resize(stageSide(), stageSide());
  const spin = () => {
    solidRAF = requestAnimationFrame(spin);
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
window.dev = { ex: () => ex, render, setMapOpen: v => { mapOpen = v; }, settings, solid: () => solid, setView };
