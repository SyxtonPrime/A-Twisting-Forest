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

Each loop you close is one independent cycle, and the shape of the world is
read straight off them:

- a loop closed the same way round is a **handle**
- a loop closed mirrored is a **crosscap**

So the world is a sphere with one handle or crosscap per loop. Beside a
crosscap a handle is worth two more crosscaps, which is Dyck's theorem, so a
world with any twist in it collapses to crosscaps alone: close three loops
with one of them mirrored and you were walking on a surface with five
crosscaps, not on a two-holed torus with a twist.

Close no loops and it is a sphere. You walked in the dark for a day and the
forest was just a forest.

## The three pictures at the end

**The pieces.** The world in normal form, drawn the way the classification
theorem builds it: a central polygon standing for a sphere with one hole per
loop, a cylinder out to each hole, and on the end of each cylinder the piece
that loop turned out to be. A handle with one boundary circle is a pentagon,
`a b a⁻¹ b⁻¹ c`, where `c` is the edge the cylinder attaches to. A crosscap is
a triangle, `a a c`. Forcing both into pentagons would need a fold `b b⁻¹`
that does no work and makes a spike in the mesh, so the shapes are left to
differ, and the difference is the legend.

**The world.** The same surface as a solid you can drag. It is built as a real
quad mesh from the normal-form polygon and relaxed into three dimensions.

It is a picture of the topology, not of the metric, and it cannot be
otherwise. These surfaces are flat everywhere except at the polygon's corners,
so a faithful embedding would look like crumpled paper, and for most of them
none exists: a flat torus does not fit in three dimensions, and nothing
non-orientable fits without passing through itself. So the mesh is relaxed
rather than solved, with edge springs, a long-range repulsion that opens the
holes, a hard short-range one so the sheet cannot pass through itself where it
needn't, surface tension, and a breath of pressure.

That last one earns its place: a flat grid is already at rest under everything
else, so with no pressure a sphere stays a folded envelope forever, and with
too much of it the holes blow shut and a torus becomes a ball.

Non-orientable worlds cannot be wound consistently, so the pressure fights
itself along one seam and the surface passes through itself. That is not a
bug; it is the only way such a world can sit in space. The renderer is a small
z-buffered rasteriser written for exactly that reason, since painter's
algorithm tears along those self-intersection curves.

**Your map.** The sketch from camp again, with everywhere you got to.

## Layout

- `src/explore.js` — stage one. The graph, the places, the question, the food,
  and making camp. Knows nothing about surfaces except how to count loops.
- `src/sketch.js` — the map drawn at camp: force-directed layout, paths that
  came back mirrored drawn in red, ways you never took as stubs.
- `src/pieces.js` — the normal-form diagram.
- `src/polygon.js` — a polygon with its edges paired, its normal forms, and
  the classification: Euler characteristic, orientability, cone points.
- `src/mesh.js` — the quotient mesh, and a face-winding pass that decides
  orientability by a route independent of the polygon's own answer.
- `src/embed.js` — spectral starting layout and the relaxation above.
- `src/scene3d.js` — the rasteriser and orbit controls.
- `src/world.js`, `src/rng.js` — terrain for the solid, and seeded randomness.
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

`lab.html` renders the piece diagram across a range of surfaces. Nothing links
to it; it is a workbench.
