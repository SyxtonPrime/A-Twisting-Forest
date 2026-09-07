// The net: the world cut open and laid flat.
//
// The body is a tube with rounded ends. Cut it once along its underside and it
// opens into a single piece, widest in the middle and drawing to a point at
// each end, with a hole where every tube met it. Each tube is a tube as well,
// so each is cut free at both ends and cut once along its length, and lies
// flat as a rectangle.
//
// What is left to do by hand is the gluing, and the gluing is the whole of the
// world's shape: the two long edges of the body join back to each other, the
// two long edges of each strip join to each other, and each end of a strip
// goes into one of the holes. A strip entering its second hole the same way
// round makes a handle; entering it reversed makes a klein bottle.
//
// Nothing with a handle in it can be laid flat in one piece, which is why the
// strips come away rather than staying attached. That is not a shortcut; it is
// the reason nets have glue tabs.

const GAP = 1.8;

const SEAM = [58, 110, 106];      // the body's own long edges
const MOUTH = ['#b5352c', '#2a7f7a', '#c28a1b', '#6a4c9c', '#3b6fb6', '#8a6d3b'];

function hex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }

// Rebuild the surface as separate flat pieces. Every vertex carries where it
// sits in the net and where it sits on the solid, so one can be run into the
// other. Rebuilding rather than cutting the finished mesh, because the seams
// need vertices on both sides and the closed mesh has only one.
export function buildNet(mesh) {
  const geom = mesh.geom;
  const { grid, prof, C, cell, RBAR, removed } = geom;
  const M = grid.length - 1;
  const src = mesh.positions;

  const solid = [], flat = [], faces = [];
  const add = (v, fx, fy) => {
    solid.push([src[v * 3], src[v * 3 + 1], src[v * 3 + 2]]);
    flat.push([fx, fy, 0]);
    return solid.length - 1;
  };
  const cut = C / 2;                       // open it along the underside
  const kAt = kp => (cut + kp) % C;

  // ---- the body ------------------------------------------------------
  const body = [];
  for (let j = 0; j <= M; j++) {
    const taper = prof[j].r / RBAR;
    const row = [];
    if (j === 0 || j === M) {              // an end draws to a single point
      const v = add(grid[j][0], (j - M / 2) * cell, 0);
      for (let kp = 0; kp <= C; kp++) row.push(v);
    } else {
      for (let kp = 0; kp <= C; kp++) {
        const v = grid[j][kAt(kp)];
        row.push(v < 0 ? -1 : add(v, (j - M / 2) * cell, (kp - C / 2) * cell * taper));
      }
    }
    body.push(row);
  }
  for (let j = 0; j < M; j++) {
    for (let kp = 0; kp < C; kp++) {
      if (removed.has(`${j},${kAt(kp)}`)) continue;
      const q = [body[j][kp], body[j][kp + 1], body[j + 1][kp + 1], body[j + 1][kp]];
      if (q.some(v => v < 0)) continue;
      faces.push(q);
    }
  }
  const bodyH = C * cell, bodyW = (M + 1) * cell;

  // ---- one strip per tube --------------------------------------------
  let x = 0;
  const spans = geom.tubes.map(t => {
    const w = t.seg * cell;
    const at = x; x += w + GAP;
    return { w, at, h: t.ring * cell };
  });
  const total = Math.max(0, x - GAP);
  const strips = [];
  geom.tubes.forEach((t, i) => {
    const sp = spans[i];
    const ox = -total / 2 + sp.at;
    const oy = -bodyH / 2 - GAP - sp.h / 2;
    const cols = [];
    for (let s = 0; s <= t.seg; s++) {
      const row = [];
      for (let kp = 0; kp <= t.ring; kp++) {
        const v = t.rings[s][kp % t.ring];
        row.push(v < 0 ? -1 : add(v, ox + s * cell, oy + (kp - t.ring / 2) * cell));
      }
      cols.push(row);
    }
    for (let s = 0; s < t.seg; s++) {
      for (let kp = 0; kp < t.ring; kp++) {
        const q = [cols[s][kp], cols[s][kp + 1], cols[s + 1][kp + 1], cols[s + 1][kp]];
        if (q.some(v => v < 0)) continue;
        faces.push(q);
      }
    }
    strips.push({ cols, box: { x: ox, y: oy, w: sp.w, h: sp.h }, twisted: t.twisted });
  });

  const V = solid.length, F = faces.length;
  const positions = new Float32Array(V * 3);
  const flatArr = new Float32Array(V * 3);
  for (let i = 0; i < V; i++) {
    for (let c = 0; c < 3; c++) {
      positions[i * 3 + c] = solid[i][c];
      flatArr[i * 3 + c] = flat[i][c];
    }
  }
  const fa = new Int32Array(F * 4);
  for (let f = 0; f < F; f++) for (let c = 0; c < 4; c++) fa[f * 4 + c] = faces[f][c];
  const rgb = new Uint8Array(F * 3);
  for (let f = 0; f < F; f++) { rgb[f * 3] = 198; rgb[f * 3 + 1] = 191; rgb[f * 3 + 2] = 173; }

  return { V, F, faces: fa, positions, flat: flatArr, rgb, seam: [], geom, body, strips, bodyW, bodyH };
}

// Which edge joins which. These are drawn on the surface, so they read whether
// it is lying flat or rolled up.
export function netSeams(net) {
  const { geom, body, strips } = net;
  const M = body.length - 1, C = geom.C;
  const out = [];
  const line = (ids, rgb, dash) => {
    const pts = ids.filter(v => v >= 0);
    if (pts.length > 1) out.push({ ids: pts, rgb, dash });
  };
  // the body's two long edges, which glue back to each other
  line(body.map(r => r[0]), SEAM, 0);
  line(body.map(r => r[C]), SEAM, 0);
  // each strip: its long edges, and its two ends, matched to its holes
  strips.forEach((st, i) => {
    const colour = hex(MOUTH[i % MOUTH.length]);
    const cols = st.cols;
    line(cols.map(c => c[0]), colour, 6);
    line(cols.map(c => c[c.length - 1]), colour, 6);
    line([...cols[0], cols[0][0]], colour, 0);
    line([...cols[cols.length - 1], cols[cols.length - 1][0]], colour, 0);
  });
  return out;
}
