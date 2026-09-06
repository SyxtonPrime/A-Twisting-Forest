// The world at the end, with the walk drawn on it.
//
// Every edge the player walked except the ones that closed a loop went to a
// place that did not exist a moment before, so all of that is a spanning tree,
// and a tree lies flat on a sphere without crossing itself. The edges that did
// close a loop are exactly the ones that cannot lie flat: each of those arches
// over as a tube, and a tube glued to a sphere is a handle.
//
// So the picture is not a diagram beside the map. It is the map: the sphere
// with the tree on it, and one tube per loop. A tube whose loop came back
// mirrored is drawn with a half turn in it, which is what makes it a klein
// bottle rather than a torus.

import { layout } from './sketch.js';
import { mulberry32, hashSeed } from './rng.js';

const PAPER = '#f4efe6';
const INK = '#1e1a16';
const FAINT = '#a89f92';
const RULE = '#cdc4b5';
const SPHERE = '#fbf8f1';
const HANDLE = '#2a7f7a';
const TWISTED = '#b5352c';
const CAMP = '#c28a1b';

// A tube leaves one mouth heading straight out of the sphere, goes round the
// outside, and comes back down into the other. Routing one through the middle
// would draw it across the paths lying flat there, which is the one thing it
// must not look like it is doing.
function arch(p, q, cx, cy, ro, steps = 72) {
  const ap = Math.atan2(p[1] - cy, p[0] - cx);
  const rp = Math.hypot(p[0] - cx, p[1] - cy);
  const aq = Math.atan2(q[1] - cy, q[0] - cx);
  const rq = Math.hypot(q[0] - cx, q[1] - cy);
  let d = aq - ap;                                  // the short way round
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const w = Math.sin(Math.PI * t);                // 0 at the mouths, 1 over the top
    const r = (1 - w) * (rp + (rq - rp) * t) + w * ro;
    const a = ap + d * t;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

// The two sides of a tube. Untwisted they run parallel; twisted, the offset
// turns through half a circle, so the sides swap over and cross once in the
// middle. That crossing is the half turn, and it is the whole difference
// between a handle and a klein bottle.
function band(pts, hw, twisted) {
  const a = [], b = [], n = pts.length - 1;
  for (let i = 0; i <= n; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[Math.min(n, i + 1)];
    let dx = p1[0] - p0[0], dy = p1[1] - p0[1];
    const l = Math.hypot(dx, dy) || 1;
    dx /= l; dy /= l;
    const off = hw * (twisted ? Math.cos(Math.PI * (i / n)) : 1);
    a.push([pts[i][0] - dy * off, pts[i][1] + dx * off]);
    b.push([pts[i][0] + dy * off, pts[i][1] - dx * off]);
  }
  return [a, b];
}

function poly(ctx, pts) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
}

export function drawWorldMap(canvas, ex, w, h) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, w, h);

  const loops = ex.loopEdges();
  const lay = ex._worldLayout || (ex._worldLayout = layout(ex, 700, { skip: loops }));
  const { ids, index, pos, links, N } = lay;
  if (!N) return;

  const cx = w / 2, cy = h / 2;
  const side = Math.min(w, h);
  const R = side * 0.25;                    // the sphere
  const rng = mulberry32(hashSeed('world:' + ex.seed));

  // fit the tree inside the sphere
  let mx = 0, my = 0;
  for (let i = 0; i < N; i++) { mx += pos[i * 2]; my += pos[i * 2 + 1]; }
  mx /= N; my /= N;
  let rad = 0;
  for (let i = 0; i < N; i++) rad = Math.max(rad, Math.hypot(pos[i * 2] - mx, pos[i * 2 + 1] - my));
  const s = (R * 0.86) / (rad || 1);
  const at = i => [cx + (pos[i * 2] - mx) * s, cy - (pos[i * 2 + 1] - my) * s];

  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = SPHERE; ctx.fill();
  ctx.strokeStyle = RULE; ctx.lineWidth = 1.5; ctx.stroke();

  // the ways never taken
  ctx.strokeStyle = RULE; ctx.setLineDash([3, 4]); ctx.lineWidth = 1;
  for (let i = 0; i < N; i++) {
    const n = ex.node(ids[i]);
    const loose = ex.danglingPorts(n).length;
    const p = at(i);
    for (let k = 0; k < loose; k++) {
      const a = (k / Math.max(1, loose)) * Math.PI * 2 + i;
      ctx.beginPath();
      ctx.moveTo(p[0] + Math.cos(a) * 7, p[1] + Math.sin(a) * 7);
      ctx.lineTo(p[0] + Math.cos(a) * 18, p[1] + Math.sin(a) * 18);
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);

  // the paths that lie flat
  ctx.strokeStyle = INK; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
  for (const [a, b] of links) {
    if (a === b) continue;
    const p = at(a), q = at(b);
    const mxp = (p[0] + q[0]) / 2, myp = (p[1] + q[1]) / 2;
    const nx = -(q[1] - p[1]), ny = q[0] - p[0];
    const nl = Math.hypot(nx, ny) || 1;
    const bow = (rng() - 0.5) * 14;
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    ctx.quadraticCurveTo(mxp + (nx / nl) * bow, myp + (ny / nl) * bow, q[0], q[1]);
    ctx.stroke();
  }

  // the places
  ctx.font = '10px "DejaVu Sans Mono", Menlo, Consolas, monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let i = 0; i < N; i++) {
    const n = ex.node(ids[i]);
    const p = at(i);
    ctx.beginPath(); ctx.arc(p[0], p[1], n.isCamp ? 5 : 3, 0, Math.PI * 2);
    ctx.fillStyle = n.isCamp ? CAMP : INK; ctx.fill();
    if (n.isCamp) { ctx.fillStyle = CAMP; ctx.fillText('camp', p[0], p[1] + 9); }
  }

  // and the loops, arching over as tubes
  const tubes = ex.merges.map((m, i) => ({ ...m, i, edge: ex.edges[m.edge] }))
    .filter(t => t.edge && index.has(t.edge.a.node) && index.has(t.edge.b.node));
  // The tubes nest outside the sphere, and the outermost has to fit on the
  // paper however many of them there are.
  const maxRo = side / 2 - 12;
  const gap = tubes.length > 1
    ? Math.min(14, (maxRo - R - 14) / (tubes.length - 1))
    : 0;
  tubes.forEach((t, k) => {
    const p = at(index.get(t.edge.a.node));
    const q = at(index.get(t.edge.b.node));
    const colour = t.twist ? TWISTED : HANDLE;
    const ro = R + 14 + k * gap;
    const line = arch(p, q, cx, cy, ro);
    const hw = Math.max(4, Math.min(8, gap ? gap * 0.5 : 8));
    const [sa, sb] = band(line, hw, t.twist);

    // filled, so it reads as passing over the sphere rather than drawn on it
    poly(ctx, sa.concat(sb.slice().reverse()));
    ctx.closePath();
    ctx.fillStyle = PAPER; ctx.fill();
    ctx.strokeStyle = colour; ctx.lineWidth = 1.6;
    poly(ctx, sa); ctx.stroke();
    poly(ctx, sb); ctx.stroke();

    // the holes it is glued into, drawn square to the way the tube leaves
    for (const [end, near] of [[p, line[2]], [q, line[line.length - 3]]]) {
      const a = Math.atan2(near[1] - end[1], near[0] - end[0]);
      ctx.save();
      ctx.translate(end[0], end[1]);
      ctx.rotate(a);
      ctx.beginPath(); ctx.ellipse(0, 0, 3.4, hw, 0, 0, Math.PI * 2);
      ctx.fillStyle = SPHERE; ctx.fill();
      ctx.strokeStyle = colour; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.restore();
    }
  });

  legend(ctx, w, h, ex.merges);
}

function legend(ctx, w, h, merges) {
  const twisted = merges.filter(m => m.twist).length;
  const plain = merges.length - twisted;
  const y = h - 14;
  let x = 16;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.font = '10px "DejaVu Sans Mono", Menlo, Consolas, monospace';
  const item = (colour, twist, text) => {
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      pts.push([x + t * 26, y + 6 - Math.sin(Math.PI * t) * 15]);
    }
    const [sa, sb] = band(pts, 4, twist);
    ctx.strokeStyle = colour; ctx.lineWidth = 1.4;
    poly(ctx, sa); ctx.stroke();
    poly(ctx, sb); ctx.stroke();
    ctx.fillStyle = colour;
    ctx.fillText(text, x + 32, y);
    x += 32 + ctx.measureText(text).width + 20;
  };
  if (plain) item(HANDLE, false, `${plain} handle${plain === 1 ? '' : 's'}`);
  if (twisted) item(TWISTED, true, `${twisted} twisted (klein)`);
  if (!merges.length) { ctx.fillStyle = FAINT; ctx.fillText('no loop closed: a sphere', x, y); }
}
