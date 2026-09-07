// The net as one connected piece.
//
// A handle is a pentagon: a b a^-1 b^-1 c. The four paired sides close the
// handle up and c is left over as its rim. A twisted handle is the same
// pentagon with one arrow turned round, a b a b^-1 c, which is a klein bottle
// rather than a torus.
//
// The rim being one whole side is the whole trick. That is what a connecting
// rectangle can be glued to edge to edge, and it is why this lies flat in one
// piece where a rim that is a closed circle in the middle of a sheet cannot:
// a circle in the middle of a piece can never be a shared edge.
//
// So the chain runs pentagon, rectangle, hexagon, rectangle, ... pentagon. The
// ends carry one rim each, the middles carry two, and each rectangle rolls
// into the cylinder joining one handle to the next.

const INK = '#1e1a16';
const FAINT = '#a89f92';
const PAPER = '#f4efe6';
const FILL = '#fbf8f1';
const TUBE = '#efe8da';
const PAIRS = ['#b5352c', '#2a7f7a', '#c28a1b', '#6a4c9c', '#3b6fb6', '#8a6d3b', '#c2589a', '#4f8a3a'];
const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

function reg(cx, cy, r, n, rot) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cy - Math.sin(a) * r]);
  }
  return pts;
}

function path(ctx, pts, close) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  if (close) ctx.closePath();
}

// An edge with its arrow and its letter, drawn from a to b.
function edge(ctx, a, b, colour, letter, ticks, outward) {
  ctx.strokeStyle = colour; ctx.fillStyle = colour; ctx.lineWidth = 2.2;
  path(ctx, [a, b]); ctx.stroke();
  const ux = b[0] - a[0], uy = b[1] - a[1];
  const l = Math.hypot(ux, uy) || 1;
  const dx = ux / l, dy = uy / l, nx = -dy, ny = dx;
  const s = Math.min(8, l * 0.16);
  for (let k = 0; k < ticks; k++) {
    const t = (k + 1) / (ticks + 1);
    const mx = a[0] + ux * t, my = a[1] + uy * t;
    ctx.beginPath();
    ctx.moveTo(mx + dx * s, my + dy * s);
    ctx.lineTo(mx - dx * s * 0.45 + nx * s * 0.72, my - dy * s * 0.45 + ny * s * 0.72);
    ctx.lineTo(mx - dx * s * 0.45 - nx * s * 0.72, my - dy * s * 0.45 - ny * s * 0.72);
    ctx.closePath(); ctx.fill();
  }
  if (!letter) return;
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  ctx.font = 'bold 12px "DejaVu Sans Mono", Menlo, Consolas, monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(letter, mx + outward[0] * 13, my + outward[1] * 13);
}

// plan: the tube plan, one entry per handle, each with `twisted`.
export function drawChainNet(canvas, plan, w, h) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, w, h);
  ctx.lineJoin = 'round';

  const n = plan.length;
  if (n === 0) {
    const r = Math.min(w, h) * 0.26;
    ctx.beginPath(); ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
    ctx.fillStyle = FILL; ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 2.2; ctx.stroke();
    ctx.fillStyle = FAINT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '12px "DejaVu Sans Mono", Menlo, Consolas, monospace';
    ctx.fillText('a sphere', w / 2, h / 2);
    ctx.fillText('one disc, nothing to glue', w / 2, h / 2 + r + 22);
    return;
  }

  // Which sides of a piece are rims: the one facing the next piece along, and
  // the one facing the previous. A lone handle has neither and is a closed
  // square; the ends of a chain have one; the middles have two.
  const rimDirs = i => (n === 1 ? [] : i === 0 ? [1] : i === n - 1 ? [-1] : [-1, 1]);
  const sides = i => 4 + rimDirs(i).length;
  const bridge = 0.62;                          // rectangle length, as a share of r
  // width in units of r: each polygon spans about 2r, each rectangle bridge*2r
  const spanR = n * 2 + (n - 1) * bridge * 2;
  const r = Math.min((w - 60) / spanR, (h - 90) / 2.4);
  const totalW = spanR * r;
  let x = (w - totalW) / 2;
  const cy = h / 2 - 6;

  const polys = [];
  for (let i = 0; i < n; i++) {
    const s = sides(i);
    // turn each polygon so its rims face flat onto the pieces they join
    const rot = s === 4 ? Math.PI / 4
      : s === 6 ? -Math.PI / 6
      : i === 0 ? -Math.PI / 5 : (4 * Math.PI) / 5;
    const cx = x + r;
    polys.push({ pts: reg(cx, cy, r, s, rot), s, cx, twisted: plan[i].twisted, i });
    x += 2 * r + bridge * 2 * r;
  }

  // the connecting rectangles, drawn between one polygon's right side and the
  // next polygon's left side
  const rects = [];
  for (let i = 0; i + 1 < n; i++) {
    const a = rightSide(polys[i]), b = leftSide(polys[i + 1]);
    rects.push([a[0], a[1], b[0], b[1]]);
  }

  // fill everything first so the piece reads as one sheet
  for (const rc of rects) {
    path(ctx, [rc[0], rc[1], rc[2], rc[3]], true);
    ctx.fillStyle = TUBE; ctx.fill();
  }
  for (const p of polys) { path(ctx, p.pts, true); ctx.fillStyle = FILL; ctx.fill(); }

  let colour = 0, letter = 0;
  for (const p of polys) {
    const s = p.s, pts = p.pts;
    // which sides are rims: the one facing right, and for a middle piece the
    // one facing left as well
    const rims = new Set(rimDirs(p.i).map(d => sideIndex(p, d)));
    const paired = [];
    for (let k = 0; k < s; k++) if (!rims.has(k)) paired.push(k);
    // paired sides go a b a^-1 b^-1 round the polygon; twisted turns the
    // first pair the same way instead
    const [e1, e2, e3, e4] = paired;
    const cA = PAIRS[colour++ % PAIRS.length], cB = PAIRS[colour++ % PAIRS.length];
    const lA = LETTERS[letter++ % 26], lB = LETTERS[letter++ % 26];
    const out = k => {
      const a = pts[k], b = pts[(k + 1) % s];
      const mx = (a[0] + b[0]) / 2 - p.cx, my = (a[1] + b[1]) / 2 - cy;
      const l = Math.hypot(mx, my) || 1;
      return [mx / l, my / l];
    };
    const side = (k, flip) => {
      const a = pts[k], b = pts[(k + 1) % s];
      return flip ? [b, a] : [a, b];
    };
    const draw = (k, colr, lab, ticks, flip) => {
      const [a, b] = side(k, flip);
      edge(ctx, a, b, colr, lab, ticks, out(k));
    };
    draw(e1, cA, lA, 1, false);
    draw(e2, cB, lB, 2, false);
    draw(e3, cA, lA, 1, p.twisted ? false : true);
    draw(e4, cB, lB, 2, true);
    for (const k of rims) {
      const [a, b] = side(k, false);
      ctx.strokeStyle = INK; ctx.lineWidth = 2.2;
      ctx.setLineDash([]);
      path(ctx, [a, b]); ctx.stroke();
    }
    ctx.fillStyle = p.twisted ? PAIRS[0] : FAINT;
    ctx.font = '11px "DejaVu Sans Mono", Menlo, Consolas, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(p.twisted ? 'klein' : 'torus', p.cx, cy);
  }

  // each rectangle's long edges glue to each other, making it a cylinder
  rects.forEach((rc, i) => {
    const c = PAIRS[colour++ % PAIRS.length], lab = LETTERS[letter++ % 26];
    ctx.strokeStyle = FAINT; ctx.lineWidth = 1;
    edge(ctx, rc[0], rc[3], c, lab, 3, [0, -1]);
    edge(ctx, rc[1], rc[2], c, lab, 3, [0, 1]);
  });

  ctx.fillStyle = FAINT;
  ctx.font = '11px "DejaVu Sans Mono", Menlo, Consolas, monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText('one piece. sides with the same letter glue together, arrows matching.',
    w / 2, h - 10);
}

function sideIndex(p, dir) {
  // the side whose middle is furthest in the given direction
  let best = 0, far = -Infinity;
  for (let k = 0; k < p.s; k++) {
    const a = p.pts[k], b = p.pts[(k + 1) % p.s];
    const mx = ((a[0] + b[0]) / 2 - p.cx) * dir;
    if (mx > far) { far = mx; best = k; }
  }
  return best;
}
function rightSide(p) { const k = sideIndex(p, 1); return [p.pts[k], p.pts[(k + 1) % p.s]]; }
function leftSide(p) { const k = sideIndex(p, -1); return [p.pts[k], p.pts[(k + 1) % p.s]]; }
