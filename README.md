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

**The pieces.** The same world cut the other way, and a button that rolls it
up.

The body is a tube with rounded ends, so cutting it once along its underside
opens it into a single piece, widest in the middle and drawing to a point at
each end, with a hole where every tube met it. Each tube is a tube as well, so
each is cut free at both ends and cut once along its length, and lies flat as a
strip.

What is left is the gluing, and the gluing is the whole of the world's shape:
the two long edges of the body join back to each other, the two long edges of
each strip join to each other, and each end of a strip goes into one of the
holes. A strip entering its second hole the same way round makes a handle;
entering it reversed makes a Klein bottle.

Nothing with a handle in it can be laid flat in one piece, which is why the
strips come away rather than staying attached. That is not a shortcut; it is
the reason nets have glue tabs. Where the walk crosses a cut it is broken, on
the body's seam and where it leaves for a strip, because that is where the
world was opened.

The net and the solid are the same mesh. Every vertex knows where it sits in
each, so running one into the other rolls it up.

**The solid.** The same surface as something you can drag, and it is built
rather than found. A capsule stands for the sphere, one pair of holes is cut
per tube, and a tube is stitched between each pair. Stitch the far end the same
way round and it is an ordinary handle; stitch it reversed and it is a twisted
handle. That reversal is the whole of the topology and none of it is
approximated: the tests check the built mesh's Euler characteristic and
orientability against what the normal-form polygon says, by a separate route,
and check it is a closed manifold with every edge bordering exactly two faces.

The body follows a shallow arc rather than a straight line. A straight capsule
reads as a rail with things bolted to it; bending it puts the tubes on the
outside of a curve, where they splay apart the way they do in a drawn pretzel.

Each arch is a plain semicircle from one foot to the other. Waypoints joined
by a spline gave a pointed arch, which reads as a hoop stood on a rail; a
circle leaves both feet straight up and comes over evenly, so the hole under it
is round. Neighbouring tubes then stand as close as their holes allow, and the
whole thing is smoothed afterwards, which turns the joins into fillets. What
was a tube bolted onto a bar becomes one piece of material with holes through
it.

The smoothing is Taubin's: one pass in, one pass out. A plain average would
shrink the whole thing away; alternating with an outward pass leaves the size
alone and only takes the corners off. It moves vertices and nothing else, so
the quad grid and the topology survive it exactly.

A twisted tube cannot close up in space without passing through something, so
it is routed the way the classic picture routes it: over the top, round, and
back up into its hole from inside the capsule. You can watch it go through the
wall. It is all one material, because colouring the tubes differently only
made it look like a diagram.

**And the map on the solid.** A button draws it: a faint grid over the whole
surface, a waypoint at the places worth marking, and your journey between them
as a dotted line. The tree lies on the body, because a tree lies flat on a
sphere. Each loop you closed climbs to its handle: the first of a pair goes
through the tube, and the second goes up and rings it once, which is the other
independent way to walk a handle and the reason two loops need only one tube
between them.

Every point of it is read off the mesh, interpolated between real vertices and
nudged out along the surface. The body is bent and then smoothed, so anything
placed by the arithmetic the mesh was built from sinks into it or floats off it
near the joins, which is exactly where the interesting parts of the walk are.

Two things had to give for it to be legible. The places are laid out in the
body's own coordinates rather than on a flat sheet that is then wrapped round
it, since wrapping squashes one direction against the other; and distances
round the body are scaled by how wide it is, so the tapering ends do not get
crowded. And not every clearing gets a waypoint. Eighty hours of walking leaves
seventy-odd places, and marking all of them buries the trail under its own
dots, so only the camp, the dead fire, the junctions and anywhere with
something to be had are marked.

Even so, a walk of that length has a tree with a diameter of forty-odd hops,
and there is no laying that flat on a small world without it coiling. The
coiling is honest. It is what a long walk on a small world looks like.

An earlier version meshed the normal-form polygon and let a physical
relaxation find a shape, with springs, repulsion, surface tension and pressure.
It was honest and it looked like crumpled paper, because these surfaces are
flat everywhere except at their cone points and nothing in that energy says
"look like a pretzel". Building the classic picture directly is both prettier
and more exact, so the relaxation is gone.

## One more sharp edge

Anything drawn on the surface comes in two kinds. A path given as vertex
indices follows the surface for free however it moves. A path given as explicit
points has to be rebuilt whenever the surface does, and quietly draws itself in
the wrong place if it is not: while the net was rolling up, the grid and the
seams moved with it and the walk stayed behind in the shape of the finished
solid, arcing through empty air where the tubes were going to be.

## What is not joined up yet

There are two nets, and only one of them rolls up. The chain of pentagons is
the honest single piece, and it is a drawing. The cut-into-pieces net is the
one that animates, because the net and the solid have to be the same mesh for
that, and the solid is built as a capsule with tubes.

Marrying them means building the solid from the chain instead: a row of tori
joined by cylinders. The obstacle is not the topology, it is finding where each
point of a pentagon lands on a torus. A square maps onto a torus of revolution
in one line, but the pentagon is a different cut, and the map is the thing that
would need working out.

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
- `src/chainnet.js` — the net as one connected piece: pentagons, hexagons and
  the rectangles between them, with the gluing lettered and arrowed.
- `src/net.js` — the same world cut into separate flat pieces instead, each
  vertex holding both where it lies flat and where it lies on the solid, which
  is what lets one run into the other.
- `src/overlay.js` — the map drawn on the surface, depth tested against it.
- `src/mesh.js` — the quotient mesh of a polygon, and the face-winding pass
  that decides orientability. The winding pass is what `handlebody.js` uses to
  check itself; the quotient mesh is now only used by the tests, where it is a
  second opinion on what `normalForm` builds.
- `src/scene3d.js` — the rasteriser and orbit controls.
- `src/polygon.js`, `src/world.js`, `src/rng.js` — the polygon that names the
  surface, terrain used only by the tests, and seeded randomness.
- `src/main.js` — DOM wiring. The seed lives in the URL hash: `#seed=word`.

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
