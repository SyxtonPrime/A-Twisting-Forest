import { TERRAIN } from './world.js';
import { key, add, transpose, det, applyM } from './polygon.js';

export const INK = '#1e1a16';
export const FAINT = '#a89f92';
export const PAPER = '#f4efe6';
const PAIR_COLOURS = ['#b5352c', '#2a7f7a', '#c28a1b', '#6a4c9c', '#3b6fb6', '#8a6d3b', '#c2589a', '#4f8a3a'];
const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

function setup(canvas, w, h) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function glyphAt(ctx, glyph, x, y, cs, colour, bold = false) {
  ctx.fillStyle = colour;
  ctx.font = `${bold ? 'bold ' : ''}${Math.round(cs * 0.85)}px "DejaVu Sans Mono", Menlo, Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(glyph, x + cs / 2, y + cs / 2 + 1);
}

// The player's map: the world developed flat around them.
export function drawChart(canvas, game, cols, rows, cs) {
  const ctx = setup(canvas, cols * cs, rows * cs);
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, cols * cs, rows * cs);
  const hx = Math.floor(cols / 2), hy = Math.floor(rows / 2);
  const dev = game.develop(cols, rows);
  for (const [k, state] of dev) {
    if (!state) continue;
    const o = k.split(',').map(Number);
    const px = (o[0] + hx) * cs, py = (hy - o[1]) * cs;
    if (game.pending && o[0] === game.pending.u[0] && o[1] === game.pending.u[1]) continue;
    if (!game.explored.has(key(state.cell))) continue;
    const tile = game.world.get(state.cell);
    glyphAt(ctx, TERRAIN[tile.terrain].glyph, px, py, cs, game.walkedHere(state.cell, o) ? INK : FAINT);
  }
  if (game.pending) {
    const u = game.pending.u;
    const px = (u[0] + hx) * cs, py = (hy - u[1]) * cs;
    ctx.fillStyle = '#e8dcc0';
    ctx.fillRect(px, py, cs, cs);
    glyphAt(ctx, TERRAIN[game.world.get(game.pending.landing.cell).terrain].glyph, px, py, cs, INK, true);
  }
  glyphAt(ctx, '@', hx * cs, hy * cs, cs, INK, true);
}

// The polygon itself, edges coloured by pair with arrows, cone points marked.
export function drawPolygon(canvas, game, cs, info) {
  const poly = game.poly, world = game.world;
  const margin = Math.round(cs * 1.6);
  const w = poly.W * cs + 2 * margin, h = poly.H * cs + 2 * margin;
  const ctx = setup(canvas, w, h);
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, w, h);
  const px = ([x, y]) => [margin + x * cs, margin + (poly.H - y) * cs]; // cell corner (y up) -> pixel
  ctx.fillStyle = '#fbf8f1';
  ctx.fillRect(margin, margin, poly.W * cs, poly.H * cs);
  for (let y = 0; y < poly.H; y++) {
    for (let x = 0; x < poly.W; x++) {
      const k = key([x, y]);
      if (!game.explored.has(k)) continue;
      const [ox, oy] = px([x, y + 1]);
      glyphAt(ctx, TERRAIN[world.get([x, y]).terrain].glyph, ox, oy, cs, INK);
    }
  }
  const [ax, ay] = px([game.pos[0], game.pos[1] + 1]);
  glyphAt(ctx, '@', ax, ay, cs, INK, true);

  // edges
  const colourOf = new Map();
  let letter = 0;
  ctx.lineWidth = Math.max(2, cs / 5);
  for (let i = 0; i < poly.n; i++) {
    const p = poly.pairs[i];
    const lo = p ? Math.min(i, p.j) : null;
    if (p && !colourOf.has(lo)) colourOf.set(lo, { colour: PAIR_COLOURS[colourOf.size % PAIR_COLOURS.length], label: LETTERS[letter++ % 26] });
    const style = p ? colourOf.get(lo) : null;
    const [s0] = poly.unitSegment(i * poly.k);
    const [, e1] = poly.unitSegment((i + 1) * poly.k - 1);
    const a = px(s0), b = px(e1);
    ctx.strokeStyle = style ? style.colour : '#cdc4b5';
    ctx.setLineDash(style ? [] : [cs / 3, cs / 3]);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    ctx.setLineDash([]);
    if (!style) continue;
    // arrows: counterclockwise on the lower edge of the pair, matched on the other
    const forward = i === lo || p.o === 1;
    const dx = (b[0] - a[0]) / poly.k, dy = (b[1] - a[1]) / poly.k;
    const len = Math.hypot(dx, dy);
    const ux = (dx / len) * (forward ? 1 : -1), uy = (dy / len) * (forward ? 1 : -1);
    const nx = -uy, ny = ux; // outward-ish normal for the label
    const size = cs * 0.45;
    ctx.fillStyle = style.colour;
    for (const f of [1 / 3, 2 / 3]) {
      const mx = a[0] + (b[0] - a[0]) * f, my = a[1] + (b[1] - a[1]) * f;
      ctx.beginPath();
      ctx.moveTo(mx + ux * size, my + uy * size);
      ctx.lineTo(mx - ux * size * 0.4 + nx * size * 0.6, my - uy * size * 0.4 + ny * size * 0.6);
      ctx.lineTo(mx - ux * size * 0.4 - nx * size * 0.6, my - uy * size * 0.4 - ny * size * 0.6);
      ctx.closePath(); ctx.fill();
    }
    // label just outside the middle of the edge
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const cx = margin + poly.W * cs / 2, cy = margin + poly.H * cs / 2;
    const ox = mx - cx, oy = my - cy, ol = Math.hypot(ox, oy);
    glyphAt(ctx, style.label, mx + (ox / ol) * cs * 0.95 - cs / 2, my + (oy / ol) * cs * 0.95 - cs / 2, cs, style.colour, true);
  }

  // cone points
  if (info) {
    for (const c of info.cones) {
      for (const v of c.vertices) {
        const [s0] = poly.unitSegment(v * poly.k);
        const [x, y] = px(s0);
        ctx.fillStyle = c.squares < 4 ? '#b5352c' : '#3b6fb6';
        ctx.beginPath(); ctx.arc(x, y, cs * 0.32, 0, Math.PI * 2); ctx.fill();
        glyphAt(ctx, String(c.squares), x - cs / 2, y - cs / 2, cs * 0.75, PAPER, true);
      }
    }
  }
  return { w, h, margin };
}

// Zoom out from the player's view of the world to the polygon itself: the
// map unrotates and unmirrors as it shrinks. Returns frame(t) for t in [0,1].
export function polygonZoom(canvas, game, w, h, cellPx) {
  const poly = game.poly;
  const off = document.createElement('canvas');
  const info = poly.classify();
  const geom = drawPolygon(off, game, cellPx, info);
  const ctx = setup(canvas, w, h);
  const dpr = window.devicePixelRatio || 1;
  const player = [geom.margin + (game.pos[0] + 0.5) * cellPx, geom.margin + (poly.H - game.pos[1] - 0.5) * cellPx];
  const centre = [geom.w / 2, geom.h / 2];
  const fit = Math.min(w / geom.w, h / geom.h, 1);
  const s0 = 16 / cellPx;
  // A0 = flipY * F^-1 * flipY in screen coordinates
  const Finv = transpose(game.frame);
  const A0 = [Finv[0], -Finv[1], -Finv[2], Finv[3]];
  const reflected = det(A0) < 0;
  const R = reflected ? [-A0[0], A0[1], -A0[2], A0[3]] : A0; // A0 = R * diag(-1, 1) when reflected
  const theta = Math.atan2(R[2], R[0]);
  return function frame(t) {
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const s = s0 + (fit - s0) * e;
    const f = [player[0] + (centre[0] - player[0]) * e, player[1] + (centre[1] - player[1]) * e];
    const th = theta * (1 - e);
    const sx = reflected ? -1 + 2 * e : 1;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, w, h);
    ctx.translate(w / 2, h / 2);
    ctx.scale(s, s);
    ctx.rotate(th);
    ctx.scale(sx, 1);
    ctx.translate(-f[0], -f[1]);
    ctx.drawImage(off, 0, 0, geom.w, geom.h);
    ctx.restore();
  };
}
