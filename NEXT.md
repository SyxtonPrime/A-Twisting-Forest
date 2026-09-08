# Next: send the slits to the corners

A handoff note. Everything below is about `src/handle.js` and
`src/roll/piece.js`; nothing else needs touching.

## What is wrong

A handle with `k` necks should read as

    a b a⁻¹ b⁻¹ c₁ … c_k

— the four edges of the developed sheet whole, and `k` rims — and it does not.
Every slit runs from its hole straight out along its own row to the `u = 0`
edge, so all `k` mouths land in the middle of that one edge and break it into
`k + 1` arcs, which the drawing then spreads all round the polygon. A piece
with four necks comes out with three whole sides and a fourth shredded into
four. It is visible on the octagon and it is there on the pentagon too.

## What to do instead

Send each slit to a different **corner** of the sheet, so no edge is broken
anywhere except a single cell from its end. Then the walk reads

    a c₁ b c₂ a⁻¹ c₃ b⁻¹ c₄

— edges and rims alternating, which is the classification theorem's picture,
and the necks stay spread the whole way round. Four corners, so `k ≤ 4`; cap
the editor at four necks per piece.

Four slots, listed in the order the boundary walk meets their mouths. A slit
aiming at a far corner leaves the hole by its **far** side (`u₀ + hu`) so it
never has to cross the hole to get there:

| slot | leaves by | lane | ends on |
| --- | --- | --- | --- |
| 0 | near side, `u₀` | `u = 1` | `v = nv` |
| 1 | far side, `u₀ + hu` | `u = nu − 1` | `v = nv` |
| 2 | far side | `u = nu − 2` | `v = 0` |
| 3 | near side | `u = 2` | `v = 0` |

Each path is an L: along the row `v = v₀` to its lane, then along the lane to
the edge. A cell takes the far lip of slit `i` when it is in the quadrant the
two legs cut off — right of the lane and above/below the row, according to the
slot. That rule generalises the one already in `buildHandle`, which is the
special case `lane = 0`.

Three consequences, all of which have to be done together:

1. **`rimArc` / `rimUV` must start at the corner the slit came in at**, since a
   far-side slit attaches at `(u₀ + hu, v₀)` and not `(u₀, v₀)`. Build the rim
   as a cycle, rotate it to the attachment corner, then repeat that corner at
   the end so the arc still runs lip to lip.

2. **The rim's polygon sides come from the corner gaps, not from an even
   spread.** `sides[j] = round(j·n/k)` in `piece.js` is wrong once the slits go
   to corners: between two rims the walk crosses one whole edge for every slot
   it skips, so `gap = (slot[j] − slot[j−1]) mod 4` and the next rim side is
   `1 + gap` further round. For `k = 4` that gives the alternating `[0,2,4,6]`
   again; for `k = 2` it gives opposite sides; for `k = 1`, one side.

3. **Boundary is shared out by the sheet's edges, not by vertex count or by
   length.** A whole edge takes a whole side, a one-cell scrap takes a cell's
   worth, and the two lips of a slit take none, because they are the same
   points on the sheet. Weight each boundary vertex by `1/nv` if it is on the
   `u = 0` or `u = nu` edge, `1/nu` if on `v = 0` or `v = nv`, and nothing
   otherwise, then place it by cumulative weight. Sharing by *length* is no
   better than by count: the sheet is three times longer than it is deep, so
   its four edges are not the same length, while the polygon's sides are.

## The thing that beat me

There are two constraints on `dir`, the direction a rim is walked along its
polygon side (`polygonLayout`, currently hard-coded to `-1`), and with corner
routing they pull against each other:

- **A neck is only a rectangle** if both of its rims are laid along their sides
  the same way round. The two ends of a neck are always a piece and its
  reflection, so `dir` must be *the same* for mirrored and unmirrored pieces.
- **Tutte only gives a drawing** if the boundary walk is pinned in the
  polygon's own rotational order. Reflecting a piece reverses that, so `dir`
  must *flip* with the reflection.

Today these are reconciled by accident: the rim-index-to-hole map (`order` /
`slot` in `buildPiece`, which sorts the holes by row) itself flips with the
reflection, and absorbs it. Corner routing destroys that, because which hole
the walk meets first stops being a question about rows and becomes a question
about which corner its slit was sent to.

**The thing to try first**: put the absorption back by hand. For a mirrored
piece, assign the slits to the corners in the reversed order —
`slot[j] = round((k − 1 − j)·4 / k)` rather than `round(j·4 / k)`. Then the
walk meets rim *indices* in the same direction whichever handedness the piece
is, `dir` can stay `-1` for both, and the neck matching stays the identity. I
believe this is right and did not get to test it.

Two things to check once it is in:

- **The lane-sharing constraint.** Slots 0 and 3 share the near side of the
  sheet and slots 1 and 2 the far side, and each pair's paths cross unless the
  holes are the right way round the ring: the rows must fall away in slot
  order without wrapping in the middle. That is a matter of where the seam of
  the sheet goes, so pick the turn that puts the seam in the gap between the
  last slot and the first, rather than in the widest gap as `seamGap` does now.
- **The wrap.** Row values are taken mod `nv`, so a cyclic order that looks
  right can come out linearly wrong. The constraint above is about actual
  values, not cyclic order.

## How to know it works

The existing suite must stay green — in particular the two that catch this
exact failure, since a wrong `dir` shows up as a sheared neck:

    net: flat it is one connected piece, and every neck is a rectangle
    cap: its rim matches a handle, so the neck is still a rectangle

and add one for the property being fixed: for `k = 1…4` and both handednesses,
lay the piece out flat and check that each of the four sheet edges has most of
its vertices nearest to a **single** polygon side, and that the four edges take
four **different** sides, none of them a rim side. That test fails today and is
the point of the exercise.

`./run-tests.sh` runs the lot. For anything finer, a scratch page under
`probe/` that imports the modules and prints to a `<pre>`, driven by
`google-chrome --headless=new --dump-dom`, is the quickest way to see the
boundary walk and the run structure — but keep the meshes small, since Tutte
and ARAP on full-size pieces will run past the virtual time budget.

## Watch out

The old routing must keep working, because `src/chain.js` — the game's own net,
which is separate from the workshop's — calls `buildHandle` and has tests of
its own. Make the corner routing opt-in and have `src/roll/piece.js` ask for
it; leave the default alone.
