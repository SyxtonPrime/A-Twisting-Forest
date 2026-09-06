// The map drawn at camp. It is not a survey: it is what the player could
// honestly have remembered, so the distances are chosen to be legible rather
// than measured. Two places one path apart may sit far apart on the paper.
// What it does get right is which places are the same place, and which paths
// come back on themselves.

import { mulberry32, hashSeed } from './rng.js';

export const PAPER = '#f4efe6';
const INK = '#1e1a16';
const FAINT = '#a89f92';
const RULE = '#cdc4b5';
const TWIST = '#b5352c';
const CAMP = '#c28a1b';

export function layout(ex, iterations = 600) {
  const ids = ex.nodes.filter(n => n.visited).map(n => n.id);
  const index = new Map(ids.map((id, i) => [id, i]));
  const N = ids.length;
  const rng = mulberry32(hashSeed('layout:' + ex.seed));
  const pos = new Float64Array(N * 2);
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    pos[i * 2] = Math.cos(a) * 10 + (rng() - 0.5);
    pos[i * 2 + 1] = Math.sin(a) * 10 + (rng() - 0.5);
  }
  const links = [];
  for (const e of ex.edges) {
    const a = index.get(e.a.node), b = index.get(e.b.node);
    if (a === undefined || b === undefined) continue;
    links.push([a, b, e.twist, e.id]);
  }
  const f = new Float64Array(N * 2);
  const L = 7;
  for (let it = 0; it < iterations; it++) {
    f.fill(0);
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        let dx = pos[i * 2] - pos[j * 2], dy = pos[i * 2 + 1] - pos[j * 2 + 1];
        let d2 = dx * dx + dy * dy;
        if (d2 < 1e-4) { dx = rng() - 0.5; dy = rng() - 0.5; d2 = 1e-4; }
        const m = (L * L * 2.2) / (d2 * Math.sqrt(d2));
        f[i * 2] += dx * m; f[i * 2 + 1] += dy * m;
        f[j * 2] -= dx * m; f[j * 2 + 1] -= dy * m;
      }
    }
    for (const [a, b] of links) {
      if (a === b) continue;
      const dx = pos[b * 2] - pos[a * 2], dy = pos[b * 2 + 1] - pos[a * 2 + 1];
      const d = Math.hypot(dx, dy) || 1e-4;
      const m = 0.06 * (d - L) / d;
      f[a * 2] += dx * m; f[a * 2 + 1] += dy * m;
      f[b * 2] -= dx * m; f[b * 2 + 1] -= dy * m;
    }
    const cool = 1 - it / iterations;
    for (let i = 0; i < N * 2; i++) {
      const step = Math.max(-1.2, Math.min(1.2, f[i]));
      pos[i] += step * cool;
    }
  }
  return { ids, index, pos, links, N };
}

function fit(pos, N, w, h, pad) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < N; i++) {
    x0 = Math.min(x0, pos[i * 2]); x1 = Math.max(x1, pos[i * 2]);
    y0 = Math.min(y0, pos[i * 2 + 1]); y1 = Math.max(y1, pos[i * 2 + 1]);
  }
  const sx = (w - 2 * pad) / Math.max(1e-6, x1 - x0);
  const sy = (h - 2 * pad) / Math.max(1e-6, y1 - y0);
  const s = Math.min(sx, sy);
  return p => [pad + (p[0] - x0) * s + (w - 2 * pad - (x1 - x0) * s) / 2,
               h - pad - (p[1] - y0) * s - (h - 2 * pad - (y1 - y0) * s) / 2];
}

export function drawSketch(canvas, ex, w, h) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, w, h);

  const lay = ex._layout || (ex._layout = layout(ex));
  const { ids, index, pos, links, N } = lay;
  if (!N) return;
  const rng = mulberry32(hashSeed('draw:' + ex.seed));
  const px = fit(pos, N, w, h, 34);
  const at = i => px([pos[i * 2], pos[i * 2 + 1]]);

  // paths first, so the marks sit on top of them
  ctx.lineWidth = 1.4;
  ctx.lineCap = 'round';
  for (const [a, b, twist] of links) {
    const p = at(a), q = at(b);
    ctx.strokeStyle = twist ? TWIST : INK;
    ctx.setLineDash(twist ? [6, 4] : []);
    if (a === b) {                                   // a path back to itself
      ctx.beginPath();
      ctx.ellipse(p[0], p[1] - 17, 12, 17, 0, 0, Math.PI * 2);
      ctx.stroke();
      continue;
    }
    const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
    const nx = -(q[1] - p[1]), ny = q[0] - p[0];
    const nl = Math.hypot(nx, ny) || 1;
    const bow = (rng() - 0.5) * 22;
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    ctx.quadraticCurveTo(mx + (nx / nl) * bow, my + (ny / nl) * bow, q[0], q[1]);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // ways they never took, as short stubs running off into nothing
  ctx.strokeStyle = RULE;
  ctx.setLineDash([3, 4]);
  for (let i = 0; i < N; i++) {
    const n = ex.node(ids[i]);
    const loose = ex.danglingPorts(n).length;
    const p = at(i);
    for (let k = 0; k < loose; k++) {
      const a = (k / Math.max(1, loose)) * Math.PI * 2 + i;
      ctx.beginPath();
      ctx.moveTo(p[0] + Math.cos(a) * 9, p[1] + Math.sin(a) * 9);
      ctx.lineTo(p[0] + Math.cos(a) * 24, p[1] + Math.sin(a) * 24);
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);

  // the places
  ctx.font = '11px "DejaVu Sans Mono", Menlo, Consolas, monospace';
  ctx.textAlign = 'center';
  for (let i = 0; i < N; i++) {
    const n = ex.node(ids[i]);
    const p = at(i);
    const here = ex.at.node === n.id;
    ctx.beginPath();
    ctx.arc(p[0], p[1], n.isCamp ? 6 : 4, 0, Math.PI * 2);
    ctx.fillStyle = n.isCamp ? CAMP : INK;
    ctx.fill();
    if (here) {
      ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(p[0], p[1], 10, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = n.isCamp ? CAMP : FAINT;
    ctx.textBaseline = 'top';
    ctx.fillText(n.isCamp ? 'camp' : n.key, p[0], p[1] + 9);
  }
  return lay;
}
