// A small z-buffered rasteriser. Written rather than pulled in because the
// worlds that self-intersect (every non-orientable one) need a real depth
// buffer, painter's algorithm tears along the intersection curves, and
// because flat-shading a few hundred quads is not much code.

import { TERRAIN } from './world.js';

const NAMES = Object.keys(TERRAIN);
const COLOUR = {
  camp:   [181, 53, 44],
  grass:  [201, 195, 175],
  forest: [120, 140, 100],
  rock:   [164, 156, 144],
  pool:   [108, 140, 158],
  hut:    [176, 134, 92],
};
const SEAM = ['#b5352c', '#2a7f7a', '#c28a1b', '#6a4c9c', '#3b6fb6', '#8a6d3b', '#c2589a', '#4f8a3a'];
const PAPER_RGB = [244, 239, 230];

function hexRGB(h) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

export class Solid {
  constructor(canvas, mesh, pos) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.mesh = mesh;
    this.pos = pos;
    this.az = 0.6; this.el = 0.45; this.zoom = 1;
    this.autoSpin = true;
    this.showSeams = true;
    this.w = this.h = 0;
    this.bindPointer();

    // A mesh may bring its own colours; otherwise colour by terrain, paled
    // where the player never went.
    if (mesh.rgb) {
      this.faceRGB = mesh.rgb;
    } else {
      this.faceRGB = new Uint8Array(mesh.F * 3);
      for (let f = 0; f < mesh.F; f++) {
        const base = COLOUR[NAMES[mesh.terrain[f]]] || COLOUR.grass;
        const t = mesh.seen[f] ? 0 : 0.72;
        for (let c = 0; c < 3; c++)
          this.faceRGB[f * 3 + c] = Math.round(base[c] * (1 - t) + PAPER_RGB[c] * t);
      }
    }
    this.seamRGB = SEAM.map(hexRGB);
    this.pairColour = new Map();
  }

  // Give the seam curves the same colours the flat polygon used.
  setPairColours(poly) {
    this.pairColour = new Map();
    let next = 0;
    for (let i = 0; i < poly.n; i++) {
      const p = poly.pairs[i];
      if (!p) continue;
      const lo = Math.min(i, p.j);
      if (!this.pairColour.has(lo)) this.pairColour.set(lo, next++);
      this.pairColour.set(i, this.pairColour.get(lo));
    }
  }

  resize(w, h, dpr = window.devicePixelRatio || 1) {
    const s = Math.min(dpr, 2);
    const cw = Math.max(1, Math.round(w * s)), ch = Math.max(1, Math.round(h * s));
    this.canvas.width = cw; this.canvas.height = ch;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.w = cw; this.h = ch;
    this.img = this.ctx.createImageData(cw, ch);
    this.px = new Uint32Array(this.img.data.buffer);
    this.depth = new Float32Array(cw * ch);
    this.sx = new Float32Array(this.mesh.V);
    this.sy = new Float32Array(this.mesh.V);
    this.sz = new Float32Array(this.mesh.V);   // 1 / distance, bigger is nearer
    this.vz = new Float32Array(this.mesh.V);
  }

  bindPointer() {
    const c = this.canvas;
    let last = null;
    c.style.touchAction = 'none';
    c.addEventListener('pointerdown', e => {
      last = [e.clientX, e.clientY];
      this.autoSpin = false;
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointermove', e => {
      if (!last) return;
      this.az += (e.clientX - last[0]) * 0.01;
      this.el = Math.max(-1.5, Math.min(1.5, this.el + (e.clientY - last[1]) * 0.01));
      last = [e.clientX, e.clientY];
    });
    const stop = () => { last = null; };
    c.addEventListener('pointerup', stop);
    c.addEventListener('pointercancel', stop);
    c.addEventListener('wheel', e => {
      e.preventDefault();
      this.zoom = Math.max(0.45, Math.min(3, this.zoom * Math.exp(-e.deltaY * 0.0015)));
    }, { passive: false });
  }

  radius() {
    const { V } = this.mesh, pos = this.pos;
    let r = 0;
    for (let i = 0; i < V; i++) r = Math.max(r, Math.hypot(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]));
    return r || 1;
  }

  project() {
    const { V } = this.mesh, pos = this.pos;
    const ca = Math.cos(this.az), sa = Math.sin(this.az);
    const ce = Math.cos(this.el), se = Math.sin(this.el);
    const r = this.radius();
    const dist = (r * 3.1) / this.zoom;
    const f = 1.9 * Math.min(this.w, this.h) * 0.5;
    const cx = this.w / 2, cy = this.h / 2;
    for (let i = 0; i < V; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      const x1 = ca * x + sa * z;
      const z1 = -sa * x + ca * z;
      const y2 = ce * y - se * z1;
      const z2 = se * y + ce * z1;
      const d = dist - z2;                    // distance in front of the camera
      const inv = 1 / (d > 0.05 ? d : 0.05);
      this.sx[i] = cx + f * x1 * inv;
      this.sy[i] = cy - f * y2 * inv;
      this.sz[i] = inv;
      this.vz[i] = d;
    }
  }

  draw() {
    const { F, faces, V } = this.mesh;
    if (!this.w) return;
    this.project();
    const bg = 0xff000000 | (PAPER_RGB[2] << 16) | (PAPER_RGB[1] << 8) | PAPER_RGB[0];
    this.px.fill(bg);
    this.depth.fill(0);

    const pos = this.pos;
    // light from over the viewer's left shoulder, in world space
    const lx = -0.4, ly = 0.65, lz = 0.65;
    const ll = Math.hypot(lx, ly, lz);

    for (let f = 0; f < F; f++) {
      const a = faces[f * 4], b = faces[f * 4 + 1], c = faces[f * 4 + 2], d = faces[f * 4 + 3];
      if (this.vz[a] <= 0.06 || this.vz[b] <= 0.06 || this.vz[c] <= 0.06 || this.vz[d] <= 0.06) continue;
      // normal from the quad diagonals, in world space
      const ux = pos[c * 3] - pos[a * 3], uy = pos[c * 3 + 1] - pos[a * 3 + 1], uz = pos[c * 3 + 2] - pos[a * 3 + 2];
      const vx = pos[d * 3] - pos[b * 3], vy = pos[d * 3 + 1] - pos[b * 3 + 1], vz2 = pos[d * 3 + 2] - pos[b * 3 + 2];
      let nx = uy * vz2 - uz * vy, ny = uz * vx - ux * vz2, nz = ux * vy - uy * vx;
      const nl = Math.hypot(nx, ny, nz) || 1;
      // two-sided: a non-orientable world has no consistent outward side
      const lam = Math.abs((nx * lx + ny * ly + nz * lz) / (nl * ll));
      const shade = 0.34 + 0.66 * lam;
      const r = Math.min(255, this.faceRGB[f * 3] * shade) | 0;
      const g = Math.min(255, this.faceRGB[f * 3 + 1] * shade) | 0;
      const bl = Math.min(255, this.faceRGB[f * 3 + 2] * shade) | 0;
      const col = 0xff000000 | (bl << 16) | (g << 8) | r;
      this.tri(a, b, c, col);
      this.tri(a, c, d, col);
    }

    if (this.showSeams) this.seams();
    this.ctx.putImageData(this.img, 0, 0);
  }

  tri(i0, i1, i2, col) {
    const X = this.sx, Y = this.sy, Z = this.sz;
    const x0 = X[i0], y0 = Y[i0], x1 = X[i1], y1 = Y[i1], x2 = X[i2], y2 = Y[i2];
    let minx = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
    let maxx = Math.min(this.w - 1, Math.ceil(Math.max(x0, x1, x2)));
    let miny = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
    let maxy = Math.min(this.h - 1, Math.ceil(Math.max(y0, y1, y2)));
    if (minx > maxx || miny > maxy) return;
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (area === 0) return;
    const inv = 1 / area;
    const z0 = Z[i0], z1 = Z[i1], z2 = Z[i2];
    const px = this.px, depth = this.depth, w = this.w;
    for (let y = miny; y <= maxy; y++) {
      const fy = y + 0.5;
      let row = y * w;
      for (let x = minx; x <= maxx; x++) {
        const fx = x + 0.5;
        let w0 = ((x1 - x0) * (fy - y0) - (fx - x0) * (y1 - y0)) * inv;
        let w1 = ((fx - x0) * (y2 - y0) - (x2 - x0) * (fy - y0)) * inv;
        if (w0 < 0 || w1 < 0 || w0 + w1 > 1) continue;
        const w2 = 1 - w0 - w1;
        // w1 weights vertex 1, w0 weights vertex 2, w2 weights vertex 0
        const z = w2 * z0 + w1 * z1 + w0 * z2;
        const o = row + x;
        if (z > depth[o]) { depth[o] = z; px[o] = col; }
      }
    }
  }

  // The rim of the polygon, traced on the solid, coloured by which edge it
  // was sewn to: the seams of the flat diagram, now in space.
  seams() {
    for (const [a, b, edge] of this.mesh.seam) {
      const ci = this.pairColour.get(edge);
      const rgb = this.seamRGB[(ci === undefined ? 0 : ci) % this.seamRGB.length];
      const col = 0xff000000 | (rgb[2] << 16) | (rgb[1] << 8) | rgb[0];
      this.line(a, b, col);
    }
  }

  line(i0, i1, col) {
    if (this.vz[i0] <= 0.06 || this.vz[i1] <= 0.06) return;
    const x0 = this.sx[i0], y0 = this.sy[i0], z0 = this.sz[i0];
    const x1 = this.sx[i1], y1 = this.sy[i1], z1 = this.sz[i1];
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    const px = this.px, depth = this.depth, w = this.w, h = this.h;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = Math.round(x0 + (x1 - x0) * t), y = Math.round(y0 + (y1 - y0) * t);
      const z = (z0 + (z1 - z0) * t) * 1.004;   // bias so the line wins its own surface
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const o = y * w + x;
      if (z > depth[o]) { depth[o] = z; px[o] = col; }
    }
  }
}
