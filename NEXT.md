# Done: the slits go to the corners

Kept here only for what it cost. The routing is in `src/handle.js` (`cutPath`,
`leftFaces`) and the bookkeeping in `src/roll/piece.js`; the README has the
account of it.

Two things in the old note turned out to be wrong, and both were about the
reflection:

- **Rows do not flip with the mirror.** The note guessed that the
  rim-index-to-hole map absorbed the reflection, and that corner routing would
  destroy that. It does not absorb anything: the `mx` in the polygon's angles
  and the `mx` in the map from a rim's heading to its row cancel exactly, so a
  piece and its reflection have *the same mesh* -- the same holes on the same
  rows, cut the same way. Only the drawing they are pinned to is reflected. So
  `dir` can be the same for both because there is nothing pulling the other way.
- **What did need settling was the walk's own direction**, which is an accident
  of where `boundaryLoop` happens to start. It is now read off the sign of the
  area the walk encloses in grid coordinates, and that fixed both constraints at
  once. A cap's pentagon is laid out by hand and runs the other way round, so
  `buildCap` now draws a cap as the reflection of the handle it answers.

And one thing the note did not see: a slit bound for a far corner cannot leave
by its hole's far side. The rim is walked from wherever its slit meets it, so
two rims sewn into a neck have to start at the same corner of their holes, or
the neck comes out with a quarter turn in it once the pieces roll up -- which
is invisible in the flat drawing and so invisible to every test there was. Far
slits duck one row under the hole instead and cross beneath it.

# Next: let a cap grow a neck too

Tapping a cap does nothing at the moment — `grow` in `src/roll/net.js` refuses
when the node is a cap, and `buildCap` only ever makes a piece with one rim. It
should behave exactly like tapping a handle: the cap gains a side, a neck, and
something new on the end of it.

A cap with `k` necks is a sphere with `k` discs gone: one is the cap we have,
two is a tube, three is a pair of pants, and so on. None of them adds anything
to the genus, which is the point of having them — they let a net branch without
paying a handle for every branch point. `genus` in `buildNet` already counts
handles only and needs no change.

## It stays a (4 + k)-gon, and the pairs stay nested

The nice part is that the rule holds all the way up. A piece of either kind
with `k` necks is a `(4 + k)`-gon with `k` rim sides and four paired ones; what
tells them apart is only whether those four are **crossed** or **nested**:

| k | genus 1 | genus 0 |
| --- | --- | --- |
| 1 | `a b a⁻¹ b⁻¹ c` | `c a b b⁻¹ a⁻¹` |
| 2 | `c₁ a b c₂ a⁻¹ b⁻¹` | `c₁ a₁ a₂ c₂ a₂⁻¹ a₁⁻¹` |
| 3 | seven sides, three rims | `c₁ s₁ c₂ s₁⁻¹ s₂ c₃ s₂⁻¹` |

For the sphere the four paired sides are the **slits**, cut in half. One rim
needs one slit and halving it gives four sides; two rims need one slit between
them, halved, and again four; three rims need two slits and they are already
four sides between them. So the count comes out at four every time and the
shape never gives the piece away — which is the property that was just built
for `k = 1` and should be kept.

Worth checking rather than trusting: `src/polygon.js` has `classify()`, which
gives the Euler characteristic, orientability and the number of boundary
circles for a glued polygon. Feed it each word above and confirm
`χ = 2 − k`, orientable, `k` boundary circles, before building any mesh for it.

## The roll is honest for two of them and not the third

- `k = 1` — the sector into a cone. Already built, and a real bend.
- `k = 2` — a rectangle into a tube. Also a real bend, and it is exactly what
  the `rectangle` specimen's act one already does; the mesh is a plain grid
  rather than a polar one.
- `k ≥ 3` — a pair of pants is not developable, so there is no honest first
  act. Act two does the work, as it does for the handles.

So `buildCap` probably wants splitting: a polar grid for one rim, a plain grid
for two, and something else again for three. Do not try to make one mesh serve
all of them.

## While you are in there

`grow(net, at, kind)` should stop refusing caps. The eight-piece limit in the
tap handler in `src/roll/lab.js` is already gone: `grow` refuses a fifth neck on
any piece, which is `NECKS` in `src/roll/net.js`, and nothing counts pieces any
more.
