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
    this.solidPos = pos;
    this.flatPos = mesh.flat || null;
    this.morph = 1;                    // 1 rolled up, 0 laid flat
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
    // A caller that is animating the shape can say how big it is itself, and
    // smooth the number, so the camera eases in rather than snapping about as
    // the piece changes size.
    if (this.radiusOverride) return this.radiusOverride;
    const { V } = this.mesh, pos = this.pos;
    let r = 0;
    for (let i = 0; i < V; i++) r = Math.max(r, Math.hypot(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]));
    return r || 1;
  }

  camera() {
    const r = this.radius();
    return {
      ca: Math.cos(this.az), sa: Math.sin(this.az),
      ce: Math.cos(this.el), se: Math.sin(this.el),
      dist: (r * 2.35) / this.zoom,           // close enough to fill the frame
      f: 2.05 * Math.min(this.w, this.h) * 0.5,
      cx: this.w / 2, cy: this.h / 2,
    };
  }

  // [screen x, screen y, one over distance, distance]
  point(c, x, y, z) {
    const x1 = c.ca * x + c.sa * z;
    const z1 = -c.sa * x + c.ca * z;
    const y2 = c.ce * y - c.se * z1;
    const z2 = c.se * y + c.ce * z1;
    const d = c.dist - z2;
    const inv = 1 / (d > 0.05 ? d : 0.05);
    return [c.cx + c.f * x1 * inv, c.cy - c.f * y2 * inv, inv, d];
  }

  // Between the net and the solid. Straight interpolation of every vertex,
  // which is why the mesh has to be the cut one: the strips have to be able
  // to come away from the body.
  setMorph(t) {
    this.morph = Math.max(0, Math.min(1, t));
    if (!this.flatPos) return;
    if (!this.blend) this.blend = new Float32Array(this.solidPos.length);
    const e = this.morph;
    for (let i = 0; i < this.solidPos.length; i++) {
      this.blend[i] = this.flatPos[i] + (this.solidPos[i] - this.flatPos[i]) * e;
    }
    this.pos = this.blend;
  }

  project() {
    const { V } = this.mesh, pos = this.pos;
    const c = this.camera();
    for (let i = 0; i < V; i++) {
      const p = this.point(c, pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      this.sx[i] = p[0]; this.sy[i] = p[1]; this.sz[i] = p[2]; this.vz[i] = p[3];
    }
    this.cam = c;
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
      // A sheet has two sides, and which one you are looking at is most of
      // what tells you it has rolled over. Screen-space winding says which:
      // the projection flips y, so a face wound counterclockwise in the world
      // comes out clockwise, and a positive area means the back.
      let src = this.faceRGB;
      if (this.backRGB) {
        const w = (this.sx[c] - this.sx[a]) * (this.sy[d] - this.sy[b])
                - (this.sy[c] - this.sy[a]) * (this.sx[d] - this.sx[b]);
        if (w > 0) src = this.backRGB;
      }
      const r = Math.min(255, src[f * 3] * shade) | 0;
      const g = Math.min(255, src[f * 3 + 1] * shade) | 0;
      const bl = Math.min(255, src[f * 3 + 2] * shade) | 0;
      const col = 0xff000000 | (bl << 16) | (g << 8) | r;
      this.tri(a, b, c, col);
      this.tri(a, c, d, col);
    }

    if (this.showSeams) this.seams();
    if (this.overlay) this.drawOverlay();
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

  // Polylines given in world coordinates, depth tested against the solid so
  // they disappear round the back of it.
  drawOverlay() {
    const c = this.cam;
    for (const path of this.overlay) {
      const rgb = path.rgb;
      const col = 0xff000000 | (rgb[2] << 16) | (rgb[1] << 8) | rgb[0];
      // A path is either explicit points, or vertex indices, which follow the
      // surface for free as it rolls up.
      const ids = path.ids;
      const pts = ids ? null : path.pts;
      const n = ids ? ids.length : pts.length;
      let prev = null, phase = 0;
      for (let i = 0; i < n; i++) {
        const q = ids ? [this.pos[ids[i] * 3], this.pos[ids[i] * 3 + 1], this.pos[ids[i] * 3 + 2]] : pts[i];
        if (!q) { prev = null; continue; }         // a break: the grid is cut here
        const p = this.point(c, q[0], q[1], q[2]);
        if (prev && prev[3] > 0.06 && p[3] > 0.06) {
          phase = this.segment(prev, p, col, path.wide, path.dash, phase);
        }
        prev = p;
      }
      const d = path.dotId !== undefined
        ? [this.pos[path.dotId * 3], this.pos[path.dotId * 3 + 1], this.pos[path.dotId * 3 + 2]]
        : path.dot;
      if (d) this.blob(this.point(c, d[0], d[1], d[2]), col, path.r || 2);
    }
  }

  // `dash` is the on/off run in pixels; `phase` carries across the segments of
  // a polyline so the dashes do not restart at every corner.
  segment(a, b, col, wide, dash, phase = 0) {
    const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])));
    const px = this.px, depth = this.depth, w = this.w, h = this.h;
    const step = Math.hypot(b[0] - a[0], b[1] - a[1]) / steps;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      if (dash) {
        phase += step;
        if (Math.floor(phase / dash) % 2 === 1) continue;
      }
      const x = Math.round(a[0] + (b[0] - a[0]) * t);
      const y = Math.round(a[1] + (b[1] - a[1]) * t);
      const z = (a[2] + (b[2] - a[2]) * t) * 1.008;   // bias, so it wins its own surface
      for (let dy = wide ? -1 : 0; dy <= (wide ? 1 : 0); dy++) {
        for (let dx = wide ? -1 : 0; dx <= (wide ? 1 : 0); dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const o = yy * w + xx;
          if (z > depth[o]) { depth[o] = z; px[o] = col; }
        }
      }
    }
    return phase;
  }

  blob(p, col, r = 2) {
    if (p[3] <= 0.06) return;
    const px = this.px, depth = this.depth, w = this.w, h = this.h;
    const z = p[2] * 1.012;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r + 1) continue;
        const xx = Math.round(p[0]) + dx, yy = Math.round(p[1]) + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const o = yy * w + xx;
        if (z > depth[o]) { depth[o] = z; px[o] = col; }
      }
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
