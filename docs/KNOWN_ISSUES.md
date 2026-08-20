# Known issues and open design questions

Required by GDD §25.1. "Known limitations are explicit and do not undermine the phase's
learning goal" (§25.3).

---

## OPEN DESIGN QUESTION — the couch does not fit through a 32" door

**Status: needs a product decision. Not a bug.**

The GDD specifies `couch_3seat_01` as 2.10 x 0.90 x 0.85 m (§7.1, given as the worked
example of an object definition). A rigid convex box passes a slot of clear width *g* if
and only if `min(w, h) <= g` — the projected width `w|cos t| + h|sin t|` is minimised at
one of the endpoints, never in between. So the couch's narrowest presentation is
**0.850 m in every possible orientation**.

| Doorway | Clear width | Couch |
|---|---|---|
| 32" interior (0.82 m) | 0.82 | **cannot pass, ever** — short by 30 mm |
| 34" (0.86 m) | 0.86 | passes on its side, 10 mm clearance |
| 36" front door (0.91 m) | 0.91 | passes on its side (60 mm), or face-on (10 mm) |

Asserted in `tools/m0-tests.js` C5–C11.

This interacts with three parts of the GDD at once:

- §3.3 requires every substantial obstacle to support **at least two approaches**, a
  prepared one and a brute-force one. At 0.82 m the brute-force branch is not merely hard,
  it is geometrically impossible — which is a different kind of obstacle from the one §3.3
  describes.
- §8.2 lists exactly the outs: remove the door from its hinges, or unscrew the furniture
  legs. That suggests the impossibility is intended and is what makes preparation matter.
- §2.1 says the game "should rarely say no", and should "show why an attempt struggles".
  A couch that cannot pass must communicate *why* through leverage and contact feedback,
  not through an invisible refusal.

**Three options:**

1. **Keep 0.82 m and lean in.** The interior door is a hard preparation gate; the front
   door is 0.91 m so the couch can still leave the house. Maximum design payoff, and makes
   §8.2's door removal load-bearing rather than optional. Requires door removal to exist by
   Phase 5, earlier than §25.2's Phase 6 tool slot.
2. **Widen the prototype's interior doors to 0.86 m.** The couch passes on its side with
   10 mm to spare — genuinely tense, still teaches rotation, no dependency on Phase 6.
3. **Shrink the couch.** Rejected unless the §7.1 example is meant as illustrative rather
   than normative — its dimensions are realistic and the whole point is realistic logistics.

All three widths are currently built into the Phase 0 scene so the decision can be made by
looking at it rather than by arithmetic. Coral jambs = impossible, lime = passable.

---

## Technical limitations

**Must be served over http.** ES modules are blocked on `file://` by CORS. `play.bat`
handles it. Not fixable without abandoning modules.

**Headless Chrome delivers only 1–3 `requestAnimationFrame` callbacks** in `--dump-dom`
mode, then stops, while `setTimeout` and `performance.now` keep running. Measured, and
recorded in `Dev\INDEX.md`. Consequence: test suites must drive `game.frame()` directly. A
suite that waits for N frames waits forever. Re-check after a Chrome update.

**`config.js` below `SIM` and `RENDER` is unvalidated.** Every block is a named placeholder
with the phase that will validate it. They exist so values have one home, not because they
are tuned. Do not cite them as balance decisions.

**Phase 0 scene props use axis-aligned AABBs.** Honest now, because the props are static.
Phase 2 replaces them with real rigid bodies; the AABB path must not survive that.

**Rapier raycasts are one step stale.** `world.castRay` reads a query pipeline that only
`world.step()` populates, so a body created this step is invisible to rays until the next
one, and a cast before the first step of the session returns nothing at all. `primeQueries()`
covers session start; anything that spawns geometry and immediately raycasts against it
(Phase 5 props, Phase 6 tools) must wait a step. Measured — see `src/physics/world.js`.

**The mantle does not collision-check mid-climb.** The destination is validated before the
climb starts (wall, ledge top, headroom), then the lerp runs uninterrupted. If geometry
moves into the path during those 0.42 s the player passes through it. Nothing moves yet;
revisit when dynamic objects exist in Phase 2.

**Sprint may be too fast indoors.** 5.4 m/s crosses the 10 x 7 m test room in under two
seconds. Not tuned yet — see PLAYTEST_NOTES.
