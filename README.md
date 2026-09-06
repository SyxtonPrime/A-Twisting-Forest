# A Twisting Forest

A text exploration game in the manner of *A Dark Room*, except that the map is
a surface the player sews together as they walk.

## How it plays

You start at a dead campfire in the middle of a forest and walk. Every step
costs supplies; huts and pools give some back. The map you see is your own
dead reckoning: it fills in around you, the places you walked in dark ink and
the places your reckoning implies you have already been in faint ink.

The world underneath is a 24x24 rectangle whose rim is cut into 16 edges of 6
cells each. Nothing tells you where the rim is. The first time you walk across
an unsewn edge, the game sews it to another free edge and you walk on into
fresh forest. When the far side is somewhere you have already been, it asks
instead:

> does that crooked tree look familiar?

Say yes and the two edges are sewn, with whatever twist that landing implied.
Say no and that seam is ruled out and the game finds another.

When your supplies run out (or you lie down), any rim you never walked off is
sewn at random, so the world you leave behind is always closed. Then the view
zooms out from your map to the polygon itself: every seam drawn as a coloured,
arrowed pair of edges in the style of a fundamental polygon, the ones the
forest sewed for itself dashed, and corners where the squares don't add up to
four marked as cone points.

Then the polygon folds up. The surface is built as an actual mesh, with the
rim corners identified according to your gluing, and settles into three
dimensions in front of you. Drag to turn it over. A button flips back to the
flat map.

## The solid

There is no cheating here: the shape is your world's own mesh, carrying your
terrain, and its holes are real holes. But it is a picture of the topology,
not of the metric, and the difference is the interesting part.

These worlds are flat everywhere except at the polygon's corners, so a
faithful embedding would look like crumpled paper, and for most of them no
faithful embedding exists at all. A flat torus does not fit in three
dimensions; nothing non-orientable fits without passing through itself. So the
mesh is relaxed rather than solved: edge springs holding the grid spacing,
a long-range repulsion that opens the holes, hard short-range repulsion so the
sheet cannot pass through itself where it doesn't have to, a little surface
tension, and just enough pressure to lift a flat sheet off the plane. That
last one matters more than it sounds: a flat grid is already at rest under
everything else, so without a breath of pressure a sphere stays a folded
envelope forever. Too much and it blows the holes shut, which is worse.

A world whose curvature is spread out comes out round. One that piles all of
it into a few corners comes out spiky, because that is honestly what it is.

Non-orientable worlds cannot be wound consistently, so the pressure fights
itself along one seam and the surface passes through itself. That is not a
bug; it is the only way such a world can sit in space at all. The renderer is
a small z-buffered rasteriser written for this reason, since painter's
algorithm tears along exactly those self-intersection curves.

## Why a polygon

Identifying the edges of a polygon in pairs is the classification-theorem
construction: every closed surface arises from some pairing of a 2n-gon.
With 16 edges the player can build anything from a sphere to a genus-four
surface or one with eight crosscaps, orientable or not.

The polygon's corners are where the curvature lives. Corner classes whose
squares sum to fewer than four are positively curved (a walk round them comes
back rotated); more than four, negatively curved. Away from those, dead
reckoning is consistent, so the flat map is honest; near them the map shows a
seam where two routes disagree. That is Gauss's theorem showing through: a
curved surface cannot be drawn flat without gaps or overlaps.

Gauss-Bonnet holds on the nose in quarter turns: the sum over corner classes
of (4 - squares) is four times the Euler characteristic. There is a test for
it.

## Layout

- `src/polygon.js` — the rectangle, its rim, edge pairings, crossing
  transforms (a 2x2 integer matrix carrying headings across a seam), and the
  classification: Euler characteristic, orientability, boundary components,
  cone points, and the surface's name.
- `src/world.js` — terrain per cell from the seed.
- `src/game.js` — player state (true cell, heading frame, dead reckoning),
  the offer/refuse logic at unsewn edges, supplies, and `develop()`, which lays
  the world out flat around the player for drawing.
- `src/mesh.js` — the quotient mesh: rim corners identified, faces, adjacency,
  and a breadth-first winding pass that decides orientability independently of
  the polygon's own answer. The tests check the two agree.
- `src/embed.js` — spectral starting layout and the relaxation described above.
- `src/scene3d.js` — the z-buffered rasteriser, flat shading, seam curves
  traced on the solid, and orbit controls.
- `src/render.js` — the map, the polygon diagram, and the zoom-out.
- `src/main.js` — DOM wiring. Options via the URL hash:
  `#seed=word&sides=16&len=6` (sides must be a multiple of four).

## Playing on a phone

Tap the map to take one step in that direction, or use the on-screen pad.
The page is installable: "Add to Home Screen" gives it its own icon and
runs it without browser chrome.

## Running

No build step. Serve the directory statically (ES modules will not load from
`file://`):

```
python3 -m http.server 8000
```

then open <http://localhost:8000/>.

## Tests

The tests run in a browser page. `run-tests.sh` serves the directory and
drives headless Chrome:

```
./run-tests.sh
```

or open `tests/index.html` from the served directory.

`lab.html` renders a grid of known surfaces (torus, sphere, Klein bottle,
genus 4, projective plane) from several angles, for tuning the relaxation.
Its constants are URL parameters: `?steps=3000&ks=1&kr=1&kl=0.35&kp=0.25&kc=6`.
Nothing links to it; it is a workbench.
