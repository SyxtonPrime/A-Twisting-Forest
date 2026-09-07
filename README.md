# A Twisting Forest

A game in the manner of *A Dark Room*, in which you walk in the dark until the
paths start repeating, and what you agree to becomes the shape of the world.

Play it at <https://syxtonprime.github.io/A-Twisting-Forest/>.

## Walking

There is no map. There is a button that says **go on**, and now and then the
path splits and there are two or three. You walk, the food runs down, and you
come to places: a crooked oak, a heap of stones, a still pool that is worth a
few more hours of walking.

Sometimes the forest asks:

> does that crooked oak look familiar?

Say **no** and it is another oak, much like the last, and the world gets
bigger. Say **yes** and the path you just walked has come back on itself, and
the world gets smaller and stranger. Occasionally the question comes with the
light on the wrong side of the thing, and saying yes to that is saying the
path came back mirrored.

When the food is nearly gone, or when every path leads somewhere you have
already been, you can **make camp**. That is when the world stops being
undecided. By the fire you draw what you remember, and from then on there is a
map.

## Why it is done blind

Stage one keeps no geometry at all, only a graph: places with a fixed number
of ways out, and paths between them. Walking down a way that leads nowhere yet
either finds somewhere new or, if you say a place looks familiar, ties the
loose end to somewhere you have been.

Nothing has to be consistent while you are doing this, because nothing is
being drawn. That is the whole reason to do it in the dark. The world does not
have to exist yet; it only has to end up agreeing with what you said. The map
you get at camp is honest about which places are the same place and which
paths come back on themselves, and free about everything else. Two places one
path apart may sit far apart on the paper.

## What the loops do

Every loop you close is a tube you walked through, and a tube glued onto a
sphere is a **handle**. Glue it with a flip and it is a **twisted handle**,
which is what turns a sphere into a Klein bottle.

But a handle carries *two* independent loops, not one: you can walk through
the tube, and you can walk around it. So closing a second loop need not add
anything to the world. It may only mean you went round a handle that was
already there. A sphere with `t` tubes carries `2t` independent loops, so `n`
loops need `t = ceil(n / 2)` of them:

| loops closed | 0 | 1 | 2 | 3 | 4 | 5 |
| --- | --- | --- | --- | --- | --- | --- |
| tubes | 0 | 1 | 1 | 2 | 2 | 3 |

A tube costs two from the Euler characteristic whichever way round it goes on,
so `χ = 2 − 2t`, and one twist anywhere is enough to make the whole world
one-sided. Nothing here can produce an odd Euler characteristic, so the
projective plane is not a world this forest can be. That is the price of every
piece being a tube you could actually walk through, and it seems a fair one.

## The two pictures at the end

**The map.** The sphere with your walk on it. Every edge you walked except the
ones that closed a loop went to a place that did not exist a moment before, so
all of that is a spanning tree, and a tree lies flat on a sphere without
crossing itself. The edges that did close a loop are exactly the ones that
cannot lie flat: each of those arches over the outside as a tube. A tube whose
loop came back mirrored is drawn with a half turn in it, so its two sides swap
over and cross once in the middle. That crossing is the whole difference
between a handle and a Klein bottle.

So it is not a diagram beside the map. It is the map.

**The net.** One connected piece, in the form the classification theorem
suggests. Each handle is a pentagon, `a b a⁻¹ b⁻¹ c`: the four paired sides
close the handle up and `c` is left over as its rim. A twisted handle is the
same pentagon with one arrow turned round, `a b a b⁻¹ c`, which is a Klein
bottle rather than a torus. A handle in the middle of the chain needs two rims,
so it is a hexagon; a world with a single handle needs none at all and is a
closed square. Between them run rectangles, each of which rolls into the
cylinder joining one handle to the next.

The rim being one whole side is the trick, and it is the whole reason this lies
flat in one piece. A rectangle can be glued to a whole side edge to edge. It
cannot be glued to a rim that is a closed circle in the middle of a sheet,
because a circle in the middle of a piece can never be a shared edge, and that
is why the other net below falls into separate pieces however it is cut.

**The roll.** Two acts, the way a square is always shown becoming a torus:
first the sheet curls round into a tube, then the tube bends round until its
two ends meet. Each act is a bend of known radius, so the sheet stays a sheet
all the way through, and the curvature runs from nothing up to `1/r` and then
from nothing up to `1/R`.

Dragging every point in a straight line from where it starts to where it ends
up gets there as well, and that is what it used to do. It goes through shapes
that are not surfaces on the way, and there is nothing to follow.

**The grid and the walk.** A grid over the net, the places worth marking, and
the route between them. All of it is given as vertex indices rather than as
points, so it rides the surface as it rolls up without being worked out again.

The route runs the whole way, across the cylinders as well as the pieces. Each
piece is crossed along a corridor, a row of the grid that misses every hole;
the route comes in at the rim it entered by, runs along the corridor past the
waypoints, and leaves by the rim on the far side. The cylinder is crossed
straight across, at index `k` of the near rim and `m − 1 − k` of the far one,
since the far rim runs the other way round so the two agree about which side is
out. Read the wrong one and the route steps off into space exactly where the
pieces meet.

Getting from one place to the next is a breadth-first search across the grid,
not a ruled line. A ruled line crosses whatever holes are in the way, and
dropping the vertices that were not there leaves the route jumping the gap,
which is not a route. A search cannot do that, because it only ever steps to a
square that exists. There is a test that every step of the route joins two
vertices that share a face, that the whole thing is one connected line, and
that it really does cross each cylinder.

## The workshop

There is a second page, `lab.html`, which is a bench rather than a game. It has
one thing on it: a rectangle rolling up into a torus, with a scrubber, so the
roll can be got right on the simplest case there is before it is asked to do
anything harder. The plan is to build the pieces up from here — pentagon into
a torus with a disc gone, hexagon into one with two, rectangles into the
cylinders between — and only move the result back into `chain.js` once each
piece is worth watching.

The net is a rectangle `2piR` by `2pir`, with both pairs of opposite edges to
be glued, and it goes in two acts with a beat between them. Act one curls the
sheet until its two long edges meet; act two bends the tube until its two ends
meet.

Act one is a real bend. Rolling a sheet round a cylinder changes no length in
it, so the paper never has to give, and every distance on the net is still the
distance on the tube.

Act two cannot be, and it is worth saying so rather than hoping nobody notices.
A flat torus has Gaussian curvature zero everywhere; a torus of revolution has
`K = cos a / (r (R + r cos a))`, positive round the outside and negative round
the hole. So the outside of the tube has to stretch and the inside has to
squash, and no amount of care avoids it. The picture at the end is a lie about
distances and the truth about which points are which, which is the only part
the game needs.

The rectangle also has to be a rectangle and not a square. A square forces
`2piR = 2pir`, which is `R = r`: the horn torus, whose hole has closed to a
point and which touches itself all the way round. The `R : r` slider goes down
to 1 so you can watch that happen.

`#what=pentagon&t=0.72&R=2` in the hash opens the page at that piece, moment
and shape.

### Why a pentagon needs an act zero

A pentagon `a b a⁻¹ b⁻¹ c` is a torus with a disc gone: glue `a` to `a⁻¹` and
`b` to `b⁻¹`, and `c` is left over as the rim. All five corners of the pentagon
turn out to be the same point of the surface, and `c` is the circle round it.

The bends want to work. Glue `a` to `a⁻¹` and the pentagon becomes a tube whose
two ends are `b`, of length B, and `b⁻¹` together with `c`, of length B + C — a
funnel. Bend that round, glue `b` onto the `b⁻¹` part of the far end, and `c` is
what is left. Two acts, and the rim closes into a circle because `c`'s two
endpoints are identified.

What stops it being two acts of pure bending is subtler than a stretch. For act
one to be a **roll** rather than a fold across `b`, `a` and `a⁻¹` have to be
*opposite* sides, which means drawing the pentagon as the rectangle it really
is: the torus square with a bite taken out of one corner. But the disc that was
removed is the disc round the corner point, and all four corners of that square
are that one point. So the hole is drawn either in four pieces at the four
corners, or in one piece in the middle with a hairline slit out to the edge.
Neither of those has the rim as a whole side — and a rim that is not a whole
side cannot have a rectangle sewn to it edge to edge, which is the one thing
that makes the whole net lie down in one connected piece.

So there are two drawings of the same piece and no bend between them:

- **the pentagon**, which lies down in one piece with its neighbours, and
- **the developed rectangle**, which bends up honestly.

The move between them is the classification theorem's own cut-and-paste. Act
zero does it as a flat re-drawing instead: the notch zips shut and the rim
sinks into the middle of the sheet. It stretches, but it never leaves the
plane, so nothing passes through a shape that is not a surface. Switch act zero
off and the piece starts already developed, and every frame after that is a
genuine bend.

### Two pentagons and a neck

Genus two, as one net: two pentagons sewn to a rectangle along their rim sides.

Act zero is where the price gets paid in public. As each rim sinks into its
sheet, the neck has nowhere flat left to be attached, so it lifts off the page
and arches under. That is not a cheat being covered up — it is the difference
between the two drawings, made visible.

### Making it look like one thing

Four things, none of which change what the surface is.

**The hole is a disc.** It is cut out of a grid, so it starts life a rectangle
of cells. Its rim is moved onto a circle and the grid eased out to a few hole
widths around it, placing each rim vertex by how far it is round the
rectangle's perimeter rather than by which way it lies from the centre — going
by direction bunches them at the corners. The easing is clamped so it never
reaches the edges of the sheet, since those are glued to each other and moving
one side by an amount the other is not opens the surface along the seam.

**The coloured edges go.** An edge is coloured because it is going to be glued
to another one, so once it has been there is nothing left to say. Each pair
fades over the end of the act that closes it, leaving the plain grid line that
was under it, and the finished surface has no seams drawn on it at all.

**The joins are smoothed.** Three pieces sewn together meet at hard corners,
and a hard corner is what makes an assembled thing read as an assembly. A few
rounds of Taubin smoothing — Taubin rather than plain Laplacian, which shrinks
whatever it touches — are seeded at the two joins and die away four cells into
each piece. It runs on the quotient, so glued vertices are one vertex and the
cut mesh is not pulled apart along its seams, and it is weighted to nothing
everywhere else, so the grid stays crisp and the seams that have not closed yet
are never averaged across.

**The grid looks like a grid.** Four things were wringing it round. The layout
was Tutte's embedding, which is a harmonic map, and what a harmonic map
minimises is the Dirichlet energy — not the same thing as looking right. Going
from a sheet three times longer than it is deep onto a pentagon, it wrings the
grid round in a spiral to make up the difference, and the spiral is the
waviness. What is wanted is the drawing in which each cell is as close as it
can be to the cell of the developed sheet it came from — turned and moved, but
not sheared and not stretched — so the layout is now relaxed **as rigid as
possible** against the developed rectangle, starting from Tutte because Tutte
cannot fold and so is a safe place to begin. Guess a turn for each cell, solve
for the vertices that best fit those turns, repeat; in two dimensions the turn
is one arctangent rather than a decomposition. The distortion does not go away,
since the boundary is pinned to a pentagon and the sheet is a rectangle, but it
comes out as an even lean instead of a few swirls, and a grid that leans is far
easier to read than a grid that curls. The pentagon was also regular, as tall
as it is wide; it is now stretched a little towards the sheet's own
proportions, area kept. The two lips of the slit were being given a fair share
of the pentagon's perimeter by arc length, but in the developed sheet the slit
has no width at all, so a sliver of nothing had to fill a large piece of the
drawing; they are pinned close to the ends of the rim instead. And a grid line
crossing the slit's mouth meets two vertices there, not one — the two lips,
which are the same point of the surface but are yards apart in the flat drawing
— so drawing straight through put a line clean across the piece that was not an
edge of anything.

The right-hand handle is built as a **mirror image** of the left, not as a copy
turned round, and that is what makes the neck a rectangle.

Two holes that face each other agree about the way round the tube and disagree
about the way round the ring. So if the second handle is merely turned round,
the two rims are matched by a mirror in one coordinate only — and that sends
the slit's cut point to the opposite corner of the hole. In space the rim is a
closed circle, so a rotation of it never shows and the tube looks fine. Flat, a
rim is pinned as an arc with its cut at the two ends of a pentagon side, so the
far edge of the neck folds back on itself and the neck stops being a rectangle
at all.

Reflect the piece instead and the two holes have the same local axes. The rims
match index for index, cut lands on cut, and the neck runs straight in both
drawings. There are tests that every ruled line of the neck is about the same
length in space, that flat every one of them is level and the two rims run the
same way, and that the neck's cells come out roughly square.

## Where this is going

This is phase one of three: **exploration**, then a **camp manager**, then a
**Civ-like battler**. The net is the beginning of the answer to where that gets
played: it is already a flat grid of quads with the gluing written down. The whole of it is meant to be played on a flat net, and
only at the end do you zoom out and see what the world was.

That is why the solid is a stitched quad grid rather than an isosurface. An
implicit surface blended from a skeleton would give a smoother blob with less
work, but it comes out as an unstructured triangle soup, and it cannot
represent a twisted handle at all, since an implicit surface is always
orientable. A regular quad grid can carry a square or hexagonal playing grid
later, and the smoothing pass is chosen to preserve it.

## Layout

- `src/explore.js` — stage one. The graph, the places, the question, the food,
  and making camp. Knows nothing about surfaces except how to count loops.
- `src/sketch.js` — the map drawn at camp: force-directed layout, paths that
  came back mirrored drawn in red, ways you never took as stubs.
- `src/worldmap.js` — the map at the end: the same walk laid out as a tree on
  the sphere, with the closed loops arching over as tubes.
- `src/polygon.js` — a polygon with its edges paired, its normal forms, and
  the classification: Euler characteristic, orientability, cone points.
- `src/handlebody.js` — the solid: a capsule, a pair of holes per tube, and a
  stitched tube between each pair.
- `src/handle.js` — one handle of the chain in both its forms at once: the cut
  piece, its gluings, and where each of its points sits on the torus.
- `src/scene3d.js` — the rasteriser and orbit controls.
- `src/chain.js` — the handles in a row with the cylinders between them, laid
  out flat by Tutte's embedding and rolled up by interpolation.
- `src/mesh.js` — the quotient mesh of a polygon, and the face-winding pass
  that decides orientability. The winding pass is what `handlebody.js` uses to
  check itself; the quotient mesh is now only used by the tests, where it is a
  second opinion on what `normalForm` builds.
- `src/polygon.js`, `src/world.js`, `src/rng.js` — the polygon that names the
  surface, terrain used only by the tests, and seeded randomness.
- `src/main.js` — DOM wiring. The seed lives in the URL hash: `#seed=word`.
- `src/roll/roll.js` — the roll itself: two bends, and where a point of the
  sheet has got to at a given moment. No DOM and no mesh, so the tests can have
  it on its own.
- `src/roll/sheet.js` — the rectangle as a grid of quads, and the grid and
  coloured edges drawn on it.
- `src/roll/piece.js` — one handle: the pentagon and the developed rectangle as
  two drawings of the same grid, the flat morph between them, and Tutte's
  embedding for the pentagon.
- `src/roll/chain.js` — two handles and the neck between them, as one mesh.
- `src/roll/smooth.js` — the smoothing pass: Taubin, on the quotient, weighted
  to nothing away from the joins.
- `tools/bundle-lab.py` — folds the workshop into one self-contained file, for
  publishing it somewhere a phone can reach. The site itself still has no build
  step; this is only for that.
- `src/roll/lab.js` — the workshop page: the specimens, timeline, camera, and
  the framing that keeps a long thin net and a fat torus both filling the frame.

### One sharp edge

A polygon corner sitting exactly on a corner of the rectangle, with its two
edges glued to each other, makes that cell fold onto itself: opposite corners
of the quad become the same point and it stops being a quad. Normal forms hit
this constantly, since `a a` glues adjacent edges. The fix is `off`, which
slides the polygon's corners one step around the rim so they never land on the
rectangle's own, and the fold happens between two cells instead of inside one.
There is a test that every cell has four distinct corners.

## Running

No build step. Serve the directory statically, since ES modules will not load
from `file://`:

```
python3 -m http.server 8000
```

## Tests

The tests run in a browser page. `run-tests.sh` serves the directory and
drives headless Chrome:

```
./run-tests.sh
```

There is a test that the walk minus its closed loops really is a spanning tree,
since the end map is drawn on the assumption and would be nonsense otherwise.

Once camp is made the forest stops asking whether places look familiar, so no
further loop can be closed. That is what "the map is fixed" means, and it is
also what keeps the rest of the walk drawable: a tree can always be added to a
tree.
