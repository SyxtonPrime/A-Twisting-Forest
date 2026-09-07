// The workshop: a bench for getting the roll right before it goes anywhere
// near the game. One rectangle, one timeline, and a camera you can shove
// about.

import { Solid } from '../scene3d.js';
import { buildSheet, sheetPositions, sheetOverlay } from './sheet.js';
import { phaseAt, actName, CURL_END, RING_START } from './roll.js';

const $ = id => document.getElementById(id);
const DURATION = 4600;                       // ms for the whole roll

const sheet = buildSheet(72, 36);
const over = sheetOverlay(sheet, { along: 12, across: 6 });
const solid = new Solid($('rollcanvas'), sheet, sheetPositions(sheet, 0, { R: 3, r: 1 }));
solid.showSeams = false;                     // the mesh carries no seam list
solid.backRGB = sheet.backRGB;

const state = { t: 0, playing: false, dir: 1, R: 3, r: 1, grid: true, edges: true };
let smoothR = null, last = 0;

function apply() {
  solid.pos = sheetPositions(sheet, state.t, state, solid.pos);
  if (solid.autoSpin) {                      // until the user takes the camera
    // The camera swings round as it goes, and only in the one direction. It
    // starts square to the net, because a rectangle seen obliquely is not
    // obviously a rectangle, and comes round by the end of act one to look
    // along the tube, because the circle at the end of it is the whole point
    // of the act. Where it finishes hardly matters: a torus is the same from
    // every angle round.
    const { curl, ring } = phaseAt(state.t);
    solid.az = -0.12 - 0.75 * curl - 0.35 * ring;
    solid.el = 0.22 + 0.16 * curl + 0.30 * ring;
  }
  const rad = frameRadius(solid.pos, sheet.V, solid);
  // ease the framing rather than letting it snap: the net is nineteen units
  // long and the torus it becomes is eight across, and the camera has to
  // travel most of that distance in the last act
  smoothR = smoothR === null ? rad : smoothR + (rad - smoothR) * 0.14;
  solid.radiusOverride = smoothR;
  solid.overlay = [].concat(state.grid ? over.grid : [], state.edges ? over.edges : []);
  $('t').value = String(state.t);
  $('roll-act').textContent = actName(state.t);
  $('t-out').textContent = state.t.toFixed(2);
  $('play').textContent = state.playing ? 'pause' : state.t >= 1 ? 'lay it flat' : 'roll it up';
}

// Pull the camera back just far enough that all of it fits the frame. Fitting
// a sphere round the piece instead -- which is what the renderer does when it
// is left to itself -- flatters neither end of this: the net is long and thin
// and the torus is not, and a single radius has to suit the worse of the two.
//
// For a point at (x1, y2, z2) in the camera's own frame, the picture of it
// lands inside the frame exactly when dist >= z2 + f |x1| / halfWidth, and the
// same for y. The largest of those over every point is the answer, in closed
// form, with no searching.
function frameRadius(pos, V, s, margin = 0.86) {
  if (!s.w) return 1;
  const ca = Math.cos(s.az), sa = Math.sin(s.az);
  const ce = Math.cos(s.el), se = Math.sin(s.el);
  const f = 2.05 * Math.min(s.w, s.h) * 0.5;
  const kx = f / (margin * s.w * 0.5), ky = f / (margin * s.h * 0.5);
  let need = 0, maxz = -Infinity, far = 0;
  for (let i = 0; i < V; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    const x1 = ca * x + sa * z;
    const z1 = -sa * x + ca * z;
    const y2 = ce * y - se * z1;
    const z2 = se * y + ce * z1;
    const d = z2 + Math.max(Math.abs(x1) * kx, Math.abs(y2) * ky);
    if (d > need) need = d;
    if (z2 > maxz) maxz = z2;
    const rr = x * x + y * y + z * z;
    if (rr > far) far = rr;
  }
  // and never so close that the nearest point is behind the eye
  return Math.max(need, maxz + 0.4 * Math.sqrt(far)) / 2.35;
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = last ? Math.min(64, now - last) : 0;
  last = now;
  if (state.playing) {
    state.t += (state.dir * dt) / DURATION;
    if (state.t >= 1) { state.t = 1; state.playing = false; state.dir = -1; }
    if (state.t <= 0) { state.t = 0; state.playing = false; state.dir = 1; }
  }
  apply();
  solid.draw();
}

function fit() {
  const stage = $('lab-stage');
  const w = Math.max(240, stage.clientWidth);
  const h = Math.max(240, stage.clientHeight);
  // The rasteriser is software and clears a depth buffer every frame, so it is
  // paid for by the pixel. On a dense screen a stage this size would ask for
  // three million of them and the roll would stop being smooth, which is the
  // one thing it has to be.
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  const want = w * h * dpr * dpr, cap = 2.0e6;
  if (want > cap) dpr *= Math.sqrt(cap / want);
  solid.resize(w, h, dpr);
}

// ---- wiring ----------------------------------------------------------

$('play').onclick = () => {
  if (state.playing) { state.playing = false; return; }
  state.dir = state.t >= 1 ? -1 : state.t <= 0 ? 1 : state.dir;
  state.playing = true;
};
$('t').oninput = e => { state.playing = false; state.t = Number(e.target.value); };
$('aspect').oninput = e => {
  state.R = Number(e.target.value);
  $('aspect-out').textContent = `${state.R.toFixed(2)} : 1`;
  $('aspect-note').hidden = state.R > 1.06;
};
$('grid').onchange = e => { state.grid = e.target.checked; };
$('edges').onchange = e => { state.edges = e.target.checked; };
$('recentre').onclick = () => { solid.autoSpin = true; solid.zoom = 1; };

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' && e.key !== ' ') return;
  if (e.key === ' ') { e.preventDefault(); $('play').click(); }
  else if (e.key === 'ArrowRight') { state.playing = false; state.t = Math.min(1, state.t + 0.02); }
  else if (e.key === 'ArrowLeft') { state.playing = false; state.t = Math.max(0, state.t - 0.02); }
  else return;
});

let timer;
window.addEventListener('resize', () => { clearTimeout(timer); timer = setTimeout(fit, 120); });

// The moment and the shape can be named in the hash -- #t=0.72&R=2 -- so a
// particular frame can be pointed at, and looked at again later.
const hash = new URLSearchParams(location.hash.slice(1));
if (hash.has('t')) state.t = Math.max(0, Math.min(1, Number(hash.get('t')) || 0));
if (hash.has('R')) state.R = Math.max(1, Math.min(5, Number(hash.get('R')) || 3));
if (hash.has('az')) solid.az = Number(hash.get('az'));
if (hash.has('el')) solid.el = Number(hash.get('el'));
if (hash.has('az') || hash.has('el')) solid.autoSpin = false;

$('aspect').value = String(state.R);
$('aspect-out').textContent = `${state.R.toFixed(2)} : 1`;
$('aspect-note').hidden = state.R > 1.06;
$('marks').style.setProperty('--curl-end', `${CURL_END * 100}%`);
$('marks').style.setProperty('--ring-start', `${RING_START * 100}%`);
fit();
apply();
requestAnimationFrame(frame);

window.lab = { state, sheet, solid, apply, phaseAt };
