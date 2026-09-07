// The roll, as two bends.
//
// A rectangle with its opposite edges glued is a torus, and the way that is
// always shown is in two acts: the sheet curls round until its two long edges
// meet and it is a tube, and then the tube bends round until its two ends meet
// and it is a ring. Nothing here drags a point in a straight line from where
// it starts to where it ends up. That gets there as well, but it passes
// through shapes that are not surfaces on the way and there is nothing to
// follow.
//
// Act one is honest. Bending a sheet round a cylinder does not change any
// length in it, so the sheet stays a sheet: the curvature runs from nothing up
// to 1/r and no part of the paper has to give.
//
// Act two cannot be. A flat torus is flat -- Gaussian curvature zero
// everywhere -- and a torus of revolution is not: K = cos a / (r (R + r cos a)),
// positive round the outside, negative round the hole. So the outside of the
// tube has to stretch and the inside has to squash, and there is no way to
// bend a cylinder into a ring without it. Every animation of this does the
// same thing and says nothing about it. It is worth knowing that the picture
// at the end is a lie about distances and the truth about which points are
// which.
//
// Coordinates. The sheet is the rectangle
//
//     x in [-piR, piR]   along it, which becomes the way round the ring
//     y in [-pir, pir]   across it, which becomes the way round the tube
//
// so that the two circumferences come out right and act one is a pure bend.

// A timeline is a list of acts, each with the stretch of it that it owns. The
// gaps between them are beats, and they are worth the tenth of a second they
// cost: a beat is the moment the thing is a cylinder and nothing else, and
// without one the bends either side read as a single muddled motion.
//
// `open` is act zero, and only some pieces have one: it is the flat re-drawing
// that takes a net which lies down in one connected piece to the net that
// bends up honestly. A piece with no act zero starts already developed, which
// is why `open` reads 1 when nothing sets it.
export const TWO_ACT = [
  { key: 'curl', from: 0.00, to: 0.45, name: 'act one: the sheet curls, and the long edges come together' },
  { key: 'ring', from: 0.55, to: 1.00, name: 'act two: the tube bends, and its two ends come together' },
];
export const THREE_ACT = [
  { key: 'open', from: 0.00, to: 0.26, name: 'act zero: the notch zips shut and the rim sinks into the sheet' },
  { key: 'curl', from: 0.36, to: 0.64, name: 'act one: the sheet curls, and the long edges come together' },
  { key: 'ring', from: 0.74, to: 1.00, name: 'act two: the tube bends, and its two ends come together' },
];

export const CURL_END = TWO_ACT[0].to;
export const RING_START = TWO_ACT[1].from;

const ease = x =>
  x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;

// How far through each act a given point on the timeline is.
export function phaseAt(t, plan = TWO_ACT) {
  const u = Math.max(0, Math.min(1, t));
  const out = { t: u, open: 1, curl: 0, ring: 0 };
  for (const a of plan) out[a.key] = ease((u - a.from) / (a.to - a.from));
  return out;
}

// What to call where we are, for the caption under the canvas. Inside an act
// it is the act's own name; in a beat it is what the thing is right now.
export function actName(t, plan = TWO_ACT, rest = REST) {
  const u = Math.max(0, Math.min(1, t));
  for (const a of plan) if (u > a.from && u < a.to) return a.name;
  let k = 0;
  for (const a of plan) if (u >= a.to) k++;
  return rest[Math.min(k, rest.length - 1)];
}

const REST = ['the net, lying flat', 'a cylinder. the first pair of edges is glued',
              'a torus. both pairs glued, and no edge left over'];

// A point of the sheet, part way through the roll.
//
// `curl` is 0 for flat and 1 for a closed tube; `ring` is 0 for a straight
// tube and 1 for a closed ring. Each act is a bend of a known radius -- r/curl
// and R/ring -- which is why the sheet stays a sheet all the way through
// rather than passing through anything that is not a surface.
// `side` says which way act two bends. With +1 the middle of the sheet ends up
// round the inside of the ring and with -1 round the outside, and that decides
// where a hole cut in the middle of the net comes out on the finished torus.
// A neck to the next handle has to leave from the outside, so a piece with a
// hole in it wants -1; the bare rectangle has no hole and keeps +1.
export function rollPoint(x, y, R, r, curl, ring, out = [0, 0, 0], side = 1) {
  // Act one. The cross-section lives in y and z, and the sheet rolls towards
  // +z about a line parallel to x, so the middle of the sheet never moves and
  // the two long edges swing round to meet above it.
  let y1 = y, z1 = 0;
  if (curl > 1e-9) {
    const rho = r / curl;                    // the bend radius, shrinking to r
    const th = (y * curl) / r;               // arc length y, so no length changes
    const half = Math.sin(th / 2);
    y1 = rho * Math.sin(th);
    z1 = 2 * rho * half * half;              // rho (1 - cos th), written so it
  }                                          // survives rho being enormous

  // Act two. The tube runs along x; bend x round in the xz plane and the ring
  // closes about the y axis, which is where a torus of revolution wants to be.
  // z was the radial direction of the cross-section and stays radial, y stays
  // the direction along the axis.
  if (ring <= 1e-9) {
    out[0] = x; out[1] = y1; out[2] = z1;
    return out;
  }
  const rho2 = R / ring;
  const ph = (x * ring) / R;
  const half2 = Math.sin(ph / 2);
  const rad = rho2 + side * (z1 - r);        // how far out from the bend centre
  out[0] = rad * Math.sin(ph);
  out[1] = y1;
  out[2] = r - 2 * side * rho2 * half2 * half2 + (z1 - r) * Math.cos(ph);
  return out;
}
