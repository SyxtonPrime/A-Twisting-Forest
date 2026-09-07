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

// Act one runs to CURL_END, then the tube sits still for a beat, then act two
// runs from RING_START. The beat is worth the tenth of a second it costs: it
// is the moment the thing is a cylinder and nothing else, and without it the
// two bends read as one muddled motion.
export const CURL_END = 0.45;
export const RING_START = 0.55;

const ease = x =>
  x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;

// How far through each act a given point on the timeline is.
export function phaseAt(t) {
  const u = Math.max(0, Math.min(1, t));
  return {
    t: u,
    curl: ease(u / CURL_END),
    ring: ease((u - RING_START) / (1 - RING_START)),
  };
}

// What to call where we are, for the caption under the canvas.
export function actName(t) {
  if (t <= 0.001) return 'the net: a rectangle, opposite edges to be glued';
  if (t < CURL_END) return 'act one: the sheet curls, and the long edges come together';
  if (t < RING_START) return 'a cylinder. the first pair of edges is glued';
  if (t < 0.999) return 'act two: the tube bends, and its two ends come together';
  return 'a torus. both pairs glued, and no edge left over';
}

// A point of the sheet, part way through the roll.
//
// `curl` is 0 for flat and 1 for a closed tube; `ring` is 0 for a straight
// tube and 1 for a closed ring. Each act is a bend of a known radius -- r/curl
// and R/ring -- which is why the sheet stays a sheet all the way through
// rather than passing through anything that is not a surface.
export function rollPoint(x, y, R, r, curl, ring, out = [0, 0, 0]) {
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
  const rad = rho2 + (z1 - r);               // how far out from the bend centre
  out[0] = rad * Math.sin(ph);
  out[1] = y1;
  out[2] = r - 2 * rho2 * half2 * half2 + (z1 - r) * Math.cos(ph);
  return out;
}
