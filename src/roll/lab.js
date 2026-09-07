// The workshop: a bench for getting the roll right before it goes anywhere
// near the game. One specimen at a time, one timeline, and a camera you can
// shove about.

import { Solid } from '../scene3d.js';
import { buildSheet, sheetPositions, sheetOverlay } from './sheet.js';
import { buildPiece, piecePositions, pieceOverlay } from './piece.js';
import { emptyNet, grow, prune, canPrune, buildNet, netPositions, netOverlay, pieceAt } from './net.js';
import { phaseAt, actName, TWO_ACT, THREE_ACT } from './roll.js';

const $ = id => document.getElementById(id);
const DURATION = 5200;                       // ms for the whole roll

// ---- the specimens ---------------------------------------------------

// The camera swings round as it goes, and only in the one direction. It starts
// square to the net, because a flat drawing seen obliquely is not obviously a
// drawing, and comes round by the end of act one to look along the tube,
// because the circle at the end of it is the point of that act. Where it
// finishes hardly matters: a torus is the same from every angle round.
const OVER = ({ curl, ring }) => ({
  az: -0.12 - 0.75 * curl - 0.35 * ring,
  el: 0.22 + 0.16 * curl + 0.30 * ring,
});
// A piece with a hole in it wants a different arc. Act two throws the middle
// of the sheet round the outside of the ring, which means the hole spends the
// whole of act one underneath, so the camera dips below to look at it and
// comes back over the top as the ring closes.
const UNDER = ({ curl, ring }) => ({
  az: -0.12 - 0.75 * curl - 0.35 * ring,
  el: 0.22 - 0.62 * curl + 0.95 * ring,
});
// A chain lies along one axis, and swinging the camera far round it stacks one
// piece behind the other. So it swings less, and does its looking underneath
// with the elevation instead.
const ALONG = ({ curl, ring }) => ({
  az: -0.15 - 0.45 * curl - 0.10 * ring,
  el: 0.22 - 0.55 * curl + 0.88 * ring,
});

const SPECIMENS = {
  rectangle: {
    label: 'a rectangle → a torus',
    title: 'a rectangle, rolled up',
    marks: ['flat', 'a tube', 'a torus'],
    cam: OVER,
    note: `<p>The net is a rectangle 2&pi;R by 2&pi;r, with both pairs of opposite
      edges to be glued. <b class="pa">The long edges</b> meet in act one and
      <b class="pb">the ends</b> meet in act two.</p>
    <p>Act one is a real bend: rolling a sheet round a cylinder changes no
      length in it. Act two cannot be. A flat torus has curvature zero
      everywhere and a torus of revolution does not, so the outside of the tube
      stretches and the inside squashes. That is not a bug in the picture; it
      is the reason the flat torus does not sit in space.</p>`,
    build() {
      const sheet = buildSheet(72, 36);
      return {
        mesh: sheet, plan: TWO_ACT, actZero: false,
        over: sheetOverlay(sheet, { along: 12, across: 6 }),
        at: (t, s, out) => sheetPositions(sheet, t, s, out),
      };
    },
  },
  pentagon: {
    label: 'a pentagon → a torus with a disc gone',
    title: 'a pentagon, rolled up',
    marks: ['the net', 'developed', 'a tube', 'a holed torus'],
    cam: UNDER,
    note: `<p>A pentagon <i>a b a</i>&#8315;&#185; <i>b</i>&#8315;&#185; <i>c</i>
      is a torus with a disc gone: glue <i>a</i> to <i>a</i>&#8315;&#185; and
      <i>b</i> to <i>b</i>&#8315;&#185;, and <b class="pc">c</b> is left over as
      the rim. All five corners are the same point of the surface, and the rim
      is the circle round it.</p>
    <p>For act one to be a roll and not a fold, <i>a</i> and <i>a</i>&#8315;&#185;
      have to be opposite sides, which means drawing the pentagon as the
      rectangle it really is. But then the disc that was taken out is the disc
      round the corner, and all four corners of a rectangle are that one point,
      so the hole has to be drawn either in four pieces at the corners or in one
      piece in the middle with a hairline slit out to the edge. Neither has the
      rim as a whole side.</p>
    <p>So there are two drawings and no bend between them. <b>Act zero</b> is
      the flat re-drawing: the notch zips shut and the rim sinks into the sheet.
      It stretches, but it never leaves the plane. Turn it off and the piece
      starts already developed, and every frame after that is an honest bend.</p>`,
    build() {
      const piece = buildPiece({ nu: 24, nv: 72, hu: 6, hv: 6, R: 3, r: 1, face: 0.25 });
      return {
        mesh: piece, plan: piece.plan, actZero: true,
        over: pieceOverlay(piece, { along: 16, across: 6 }),
        at: (t, s, out) => piecePositions(piece, t, s, out),
      };
    },
  },
  net: {
    label: 'a net you build',
    title: 'a net you build',
    marks: ['the net', 'developed', 'tubes', 'the surface'],
    cam: ALONG,
    note: `<p><b>Tap a piece</b> and it grows a side, a neck, and something new
      on the end of it. A <b>handle</b> is a
      (4&nbsp;+&nbsp;<i>k</i>)-gon when it has <i>k</i> necks on it, so the
      number of sides is the number of neighbours plus four: a lone square is a
      closed torus, a pentagon has one neck, a hexagon two. Every handle is one
      more of genus, so &chi; = 2 &minus; 2g and the net you draw is the whole
      of the arithmetic.</p>
    <p>A <b>cap</b> closes a neck off and adds nothing. A disc has no side to
      spare &mdash; its whole boundary is the rim &mdash; so it gets the same
      slit a handle gets, cut from the rim to the middle, and opened out it is
      a circular sector. Act one rolls the sector into a cone, and <em>that one
      is honest all the way</em>: a cone is developable, so no length in the
      paper changes. Only rounding the cone off into a ball has to stretch.</p>
    <p>Flat, the pieces lie in the page. Rolled, the tori lie in the plane you
      are looking down on. Those are two different planes, so the whole
      arrangement tips from one to the other as the rings close &mdash; which
      is the same tipping each piece's own roll does, which is why they stay in
      step.</p>`,
    build() {
      const mesh = buildNet(model, { cache: pieceCache });
      return {
        mesh, plan: mesh.plan, actZero: true, net: mesh,
        over: netOverlay(mesh),
        at: (t, s2, out) => netPositions(mesh, t, s2, out),
      };
    },
  },
};

const state = { t: 0, playing: false, dir: 1, R: 3, r: 1, grid: true, edges: true,
                kind: 'rectangle', zero: true, adds: 'handle' };
// The net being drawn, and the handles already worked out. Every piece with
// the same number of necks and the same handedness is the same piece, so one
// of each is built and the rest are placings of it.
const model = emptyNet();
const pieceCache = new Map();
let spec = SPECIMENS.rectangle.build();
let solid = new Solid($('rollcanvas'), spec.mesh, spec.at(0, state));
solid.showSeams = false;                     // no mesh here carries a seam list
solid.backRGB = spec.mesh.backRGB;
let smoothR = null, last = 0;

// Which timeline this specimen is running: with act zero switched off, a piece
// that has one simply starts already developed, which is the honest two-bend
// version of it.
function plan() {
  return spec.actZero && state.zero ? THREE_ACT : TWO_ACT;
}

// What the piece is at each rest between the acts. With act zero switched off
// there is one fewer of them, and it is the first that goes: the piece starts
// already developed.
function rests() {
  const m = SPECIMENS[state.kind].marks;
  return plan() === TWO_ACT && m.length > 3 ? m.slice(1) : m;
}

function setSpecimen(kind) {
  state.kind = kind;
  spec = SPECIMENS[kind].build();
  solid.mesh = spec.mesh;
  solid.faceRGB = spec.mesh.rgb;
  solid.backRGB = spec.mesh.backRGB;
  solid.pos = spec.at(state.t, state);
  smoothR = null;
  solid.autoSpin = true;
  $('lab-title').textContent = SPECIMENS[kind].title;
  $('notes-body').innerHTML = SPECIMENS[kind].note;
  fit();
  ticks();
}

function apply() {
  const p = plan();
  spec.plan = p;
  if (spec.mesh.plan) spec.mesh.plan = p;
  solid.pos = recentre(spec.at(state.t, state, solid.pos), spec.mesh.V);
  if (solid.autoSpin) {                      // until the user takes the camera
    const c = SPECIMENS[state.kind].cam(phaseAt(state.t, p));
    solid.az = c.az; solid.el = c.el;
  }
  const rad = frameRadius(solid.pos, spec.mesh.V, solid);
  // ease the framing rather than letting it snap: the net is nineteen units
  // long and the torus it becomes is eight across, and the camera has to
  // travel most of that distance in the last act
  smoothR = smoothR === null ? rad : smoothR + (rad - smoothR) * 0.14;
  solid.radiusOverride = smoothR;
  solid.overlay = overlay(p);
  $('t').value = String(state.t);
  $('roll-act').textContent = actName(state.t, p, rests());
  $('t-out').textContent = state.t.toFixed(2);
  $('play').textContent = state.playing ? 'pause' : state.t >= 1 ? 'lay it flat' : 'roll it up';
  const editing = state.kind === 'net';
  $('edit').hidden = !editing;
  if (editing) {
    const g = spec.mesh.genus, c = spec.mesh.caps;
    $('shape').textContent = `${g} handle${g === 1 ? '' : 's'}` +
      (c ? `, ${c} cap${c === 1 ? '' : 's'}` : '') + ` — genus ${g}, χ = ${2 - 2 * g}`;
    $('prune').disabled = g < 2;
  }
}

// An edge is coloured because it is going to be glued to another one, so once
// it has been there is nothing left to say and the colour goes. Each pair
// fades out over the end of the act that closes it, leaving the plain grid
// line that was under it, so the finished surface has no seams drawn on it.
const GRID_RGB = [173, 165, 148];
function overlay(p) {
  const out = state.grid ? spec.over.grid.slice() : [];
  if (!state.edges) return out;
  const ph = phaseAt(state.t, p);
  for (const path of spec.over.edges) {
    const done = path.glue ? ph[path.glue] : 0;
    const a = 1 - smoothstep((done - 0.8) / 0.2);
    if (a < 0.02) continue;
    out.push(a > 0.995 ? path : {
      ...path,
      wide: a > 0.4,
      rgb: path.rgb.map((c, i) => Math.round(GRID_RGB[i] + (c - GRID_RGB[i]) * a)),
    });
  }
  return out;
}

const smoothstep = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

// The roll is anchored at the middle of the sheet, and the finished torus ends
// up sitting a good way off the origin; without this it wanders out of frame
// in the last act.
function recentre(pos, V) {
  let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
  for (let i = 0; i < V; i++) {
    const x = pos[i * 3], z = pos[i * 3 + 2];
    if (x < minx) minx = x; if (x > maxx) maxx = x;
    if (z < minz) minz = z; if (z > maxz) maxz = z;
  }
  const cx = (minx + maxx) / 2, cz = (minz + maxz) / 2;
  for (let i = 0; i < V; i++) { pos[i * 3] -= cx; pos[i * 3 + 2] -= cz; }
  return pos;
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

// Where each act begins and ends, ticked on the scrubber, and what the thing
// is at each rest between them.
function ticks() {
  const p = plan(), box = $('marks');
  for (const el of box.querySelectorAll('.tick, .rest')) el.remove();
  for (const a of p) {
    for (const at of [a.from, a.to]) {
      if (at <= 0 || at >= 1) continue;
      const i = document.createElement('i');
      i.className = 'tick';
      i.style.left = `${at * 100}%`;
      box.appendChild(i);
    }
  }
  $('legend').innerHTML = '';
  for (const m of rests()) {
    const s = document.createElement('span');
    s.textContent = m;
    $('legend').appendChild(s);
  }
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
$('zero').onchange = e => { state.zero = e.target.checked; ticks(); };
$('recentre').onclick = () => { solid.autoSpin = true; solid.zoom = 1; };
for (const b of document.querySelectorAll('#adds button')) {
  b.onclick = () => {
    state.adds = b.dataset.adds;
    for (const o of document.querySelectorAll('#adds button')) {
      o.setAttribute('aria-pressed', String(o.dataset.adds === state.adds));
    }
  };
  b.setAttribute('aria-pressed', String(b.dataset.adds === 'handle'));
}
$('prune').onclick = () => {
  for (let i = model.nodes.length - 1; i >= 0; i--) {
    if (canPrune(model, i)) { prune(model, i); rebuild(); return; }
  }
};
$('clear').onclick = () => {
  model.nodes = [{ nbrs: [] }];
  rebuild();
};

// Rebuild the net, but keep where we are on the timeline and where the camera
// is: editing while it is half rolled up should not throw you back to the
// start of the roll.
function rebuild() {
  const keep = { t: state.t, az: solid.az, el: solid.el, spin: solid.autoSpin, zoom: solid.zoom };
  setSpecimen('net');
  state.t = keep.t;
  solid.autoSpin = keep.spin; solid.az = keep.az; solid.el = keep.el; solid.zoom = keep.zoom;
}

// A tap on a piece grows it. A drag is the camera, so a pointer that moved is
// not a tap, and on a phone there is nothing else to go on.
{
  const c = $('rollcanvas');
  let from = null;
  c.addEventListener('pointerdown', e => { from = [e.clientX, e.clientY, performance.now()]; });
  c.addEventListener('pointerup', e => {
    if (!from || state.kind !== 'net' || !solid.cam) { from = null; return; }
    const moved = Math.hypot(e.clientX - from[0], e.clientY - from[1]);
    const held = performance.now() - from[2];
    from = null;
    if (moved > 8 || held > 700 || model.nodes.length >= 8) return;
    const box = c.getBoundingClientRect();
    const sx = (e.clientX - box.left) * (solid.w / box.width);
    const sy = (e.clientY - box.top) * (solid.h / box.height);
    const at = pieceAt(spec.mesh, solid.pos, sx, sy, (x, y, z) => solid.point(solid.cam, x, y, z));
    if (at >= 0 && grow(model, at, state.adds) >= 0) rebuild();
  });
}
$('specimen').onchange = e => { state.t = 0; state.dir = 1; state.playing = false; setSpecimen(e.target.value); };

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' && e.key !== ' ') return;
  if (e.target.tagName === 'SELECT') return;
  if (e.key === ' ') { e.preventDefault(); $('play').click(); }
  else if (e.key === 'ArrowRight') { state.playing = false; state.t = Math.min(1, state.t + 0.02); }
  else if (e.key === 'ArrowLeft') { state.playing = false; state.t = Math.max(0, state.t - 0.02); }
  else return;
});

let timer;
window.addEventListener('resize', () => { clearTimeout(timer); timer = setTimeout(fit, 120); });

// The specimen, the moment and the shape can be named in the hash --
// #what=pentagon&t=0.72&R=2 -- so a particular frame can be pointed at, and
// looked at again later.
const hash = new URLSearchParams(location.hash.slice(1));
if (hash.has('R')) state.R = Math.max(1, Math.min(5, Number(hash.get('R')) || 3));
if (hash.get('zero') === '0') state.zero = false;
$('zero').checked = state.zero;
$('aspect').value = String(state.R);
$('aspect-out').textContent = `${state.R.toFixed(2)} : 1`;
$('aspect-note').hidden = state.R > 1.06;
for (const [k, v] of Object.entries(SPECIMENS)) {
  const o = document.createElement('option');
  o.value = k; o.textContent = v.label;
  $('specimen').appendChild(o);
}
// a net can be named in the hash as the pieces that were tapped, in order --
// #what=net&net=0,0,1 -- so a particular one can be pointed at
// a net can be named in the hash as the pieces that were tapped, in order,
// with a c for the taps that added a cap -- #what=net&net=0,0c,1
for (const at of (hash.get('net') || '').split(',')) {
  const i = Number(at.replace(/c$/, ''));
  if (Number.isInteger(i) && i >= 0 && i < model.nodes.length) {
    grow(model, i, at.endsWith('c') ? 'cap' : 'handle');
  }
}

const want = hash.get('what');
$('specimen').value = SPECIMENS[want] ? want : 'rectangle';
setSpecimen($('specimen').value);
if (hash.has('t')) state.t = Math.max(0, Math.min(1, Number(hash.get('t')) || 0));
if (hash.has('az')) solid.az = Number(hash.get('az'));
if (hash.has('el')) solid.el = Number(hash.get('el'));
if (hash.has('az') || hash.has('el')) solid.autoSpin = false;

apply();
requestAnimationFrame(frame);

window.lab = { state, spec: () => spec, solid: () => solid, apply, phaseAt, setSpecimen };
