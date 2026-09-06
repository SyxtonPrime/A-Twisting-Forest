// The world in normal form, drawn the way the classification theorem builds
// it: a central polygon standing for the sphere with one hole per loop the
// player closed, a cylinder out to each hole, and on the end of each cylinder
// the piece that loop turned out to be.
//
// A handle with one boundary circle is a pentagon, a b a^-1 b^-1 c, where c is
// the edge the cylinder attaches to. A crosscap with one boundary circle is a
// triangle, a a c. Forcing both into pentagons would need a fold b b^-1 that
// does no work, so the shapes are left to differ, and the difference is the
// legend: five sides is a handle, three is a crosscap.

const INK = '#1e1a16';
const FAINT = '#a89f92';
const PAPER = '#f4efe6';
const FILL = '#fbf8f1';
const TUBE = '#efe8da';
const HANDLE = '#2a7f7a';
const CROSS = '#b5352c';

function poly(ctx, cx, cy, r, sides, rot) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2;
    const x = cx + Math.cos(a) * r, y = cy - Math.sin(a) * r;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
}

function corners(cx, cy, r, sides, rot) {
  const out = [];
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2;
    out.push([cx + Math.cos(a) * r, cy - Math.sin(a) * r]);
  }
  return out;
}

function arrow(ctx, a, b, colour, count = 1) {
  ctx.strokeStyle = colour;
  ctx.fillStyle = colour;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  const ux = b[0] - a[0], uy = b[1] - a[1];
  const l = Math.hypot(ux, uy) || 1;
  const dx = ux / l, dy = uy / l, nx = -dy, ny = dx;
  for (let k = 0; k < count; k++) {
    const t = (k + 1) / (count + 1);
    const mx = a[0] + ux * t, my = a[1] + uy * t;
    const s = 5;
    ctx.beginPath();
    ctx.moveTo(mx + dx * s, my + dy * s);
    ctx.lineTo(mx - dx * s * 0.5 + nx * s * 0.7, my - dy * s * 0.5 + ny * s * 0.7);
    ctx.lineTo(mx - dx * s * 0.5 - nx * s * 0.7, my - dy * s * 0.5 - ny * s * 0.7);
    ctx.closePath(); ctx.fill();
  }
}

function label(ctx, p, text, colour, size = 11) {
  ctx.fillStyle = colour;
  ctx.font = `${size}px "DejaVu Sans Mono", Menlo, Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, p[0], p[1]);
}

// pieces: array of 'handle' | 'crosscap', one per loop the player closed.
export function drawPieces(canvas, pieces, w, h) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, w, h);

  const n = pieces.length;
  const cx = w / 2, cy = h / 2;
  const R = Math.min(w, h) / 2 - 24;

  if (n === 0) {
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.55, 0, Math.PI * 2);
    ctx.fillStyle = FILL; ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
    label(ctx, [cx, cy - 7], 'a sphere', FAINT);
    label(ctx, [cx, cy + 9], 'no loop closed, no hole', FAINT, 10);
    return;
  }

  // Sizes: the pieces sit on a ring, big enough to read but small enough that
  // n of them fit round it without touching.
  const pieceR = Math.max(16, Math.min(R * 0.26, (2 * Math.PI * R * 0.72) / (2.7 * n)));
  const ringR = R - pieceR;
  const tube = Math.max(16, pieceR * 0.85);
  const coreR = Math.max(32, ringR - pieceR - tube);
  const coreSides = n >= 3 ? n : 0;             // 0 means draw it round
  // a hole per piece, so put the middle of each side under each tube
  const coreRot = Math.PI / 2 - Math.PI / Math.max(n, 3);
  const coreApothem = coreSides ? coreR * Math.cos(Math.PI / coreSides) : coreR;

  if (coreSides) {
    poly(ctx, cx, cy, coreR, coreSides, coreRot);
  } else {
    ctx.beginPath(); ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
  }
  ctx.fillStyle = FILL; ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
  label(ctx, [cx, cy - 7], 'sphere', FAINT, 10);
  label(ctx, [cx, cy + 7], `${n} hole${n === 1 ? '' : 's'}`, FAINT, 10);

  for (let i = 0; i < n; i++) {
    const kind = pieces[i];
    const colour = kind === 'handle' ? HANDLE : CROSS;
    const sides = kind === 'handle' ? 5 : 3;
    const a = Math.PI / 2 + (i / n) * Math.PI * 2;
    const dirx = Math.cos(a), diry = -Math.sin(a);
    const pc = [cx + dirx * ringR, cy + diry * ringR];
    // turn the piece so one of its sides faces the middle: that side is the
    // boundary circle the cylinder is glued to
    const prot = a + Math.PI + Math.PI / sides;
    const apothem = pieceR * Math.cos(Math.PI / sides);

    // the cylinder, drawn flat
    const nx = -diry, ny = dirx;
    const halfw = Math.max(6, pieceR * 0.34);
    const p0 = [cx + dirx * (coreApothem - 1), cy + diry * (coreApothem - 1)];
    const p1 = [cx + dirx * (ringR - apothem + 1), cy + diry * (ringR - apothem + 1)];
    ctx.beginPath();
    ctx.moveTo(p0[0] + nx * halfw, p0[1] + ny * halfw);
    ctx.lineTo(p1[0] + nx * halfw, p1[1] + ny * halfw);
    ctx.lineTo(p1[0] - nx * halfw, p1[1] - ny * halfw);
    ctx.lineTo(p0[0] - nx * halfw, p0[1] - ny * halfw);
    ctx.closePath();
    ctx.fillStyle = TUBE; ctx.fill();
    ctx.strokeStyle = FAINT; ctx.lineWidth = 1.2; ctx.stroke();

    poly(ctx, pc[0], pc[1], pieceR, sides, prot);
    ctx.fillStyle = FILL; ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.4; ctx.stroke();

    const cs = corners(pc[0], pc[1], pieceR, sides, prot);
    let near = 0, best = Infinity;
    for (let k = 0; k < sides; k++) {
      const m = [(cs[k][0] + cs[(k + 1) % sides][0]) / 2, (cs[k][1] + cs[(k + 1) % sides][1]) / 2];
      const d = Math.hypot(m[0] - cx, m[1] - cy);
      if (d < best) { best = d; near = k; }
    }
    // the seam onto the cylinder, drawn open rather than as an identified edge
    ctx.strokeStyle = TUBE; ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(cs[near][0], cs[near][1]);
    ctx.lineTo(cs[(near + 1) % sides][0], cs[(near + 1) % sides][1]);
    ctx.stroke();

    if (kind === 'handle') {           // a b a^-1 b^-1 round from the seam
      const o = [1, 2, 3, 4].map(k => (near + k) % sides);
      arrow(ctx, cs[o[0]], cs[(o[0] + 1) % sides], colour, 1);
      arrow(ctx, cs[o[1]], cs[(o[1] + 1) % sides], colour, 2);
      arrow(ctx, cs[(o[2] + 1) % sides], cs[o[2]], colour, 1);
      arrow(ctx, cs[(o[3] + 1) % sides], cs[o[3]], colour, 2);
    } else {                            // a a, both the same way round
      const o = [1, 2].map(k => (near + k) % sides);
      arrow(ctx, cs[o[0]], cs[(o[0] + 1) % sides], colour, 1);
      arrow(ctx, cs[o[1]], cs[(o[1] + 1) % sides], colour, 1);
    }
  }
  legend(ctx, w, h, pieces);
}

// Shape is the legend: five sides is a handle, three is a crosscap. Saying so
// once at the bottom beats a label on every piece, which runs off the edge.
function legend(ctx, w, h, pieces) {
  const handles = pieces.filter(p => p === 'handle').length;
  const caps = pieces.length - handles;
  const y = h - 13;
  let x = 16;
  const item = (sides, colour, text) => {
    poly(ctx, x + 7, y, 7, sides, sides === 5 ? Math.PI / 2 : Math.PI / 2);
    ctx.fillStyle = FILL; ctx.fill();
    ctx.strokeStyle = colour; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.fillStyle = colour;
    ctx.font = '10px "DejaVu Sans Mono", Menlo, Consolas, monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x + 19, y);
    x += 19 + ctx.measureText(text).width + 18;
  };
  if (handles) item(5, HANDLE, `${handles} handle${handles === 1 ? '' : 's'}`);
  if (caps) item(3, CROSS, `${caps} crosscap${caps === 1 ? '' : 's'}`);
}
