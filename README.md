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

When your supplies run out (or you lie down), the view zooms out from your
map to the polygon itself: every seam drawn as a coloured, arrowed pair of
edges in the style of a fundamental polygon, unsewn edges dashed, and corners
where the squares don't add up to four marked as cone points. Then it names
the surface you were walking on.

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
