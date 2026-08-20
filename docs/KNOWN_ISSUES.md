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

---

## Phase 2 open items

**A one-handed hold swings, and eventually slips.** Grab a box by one face, lift it, and it
pendulums about the grip point, overshoots the hand and can overload until the grip lets
go. MEASURED: the light box rose 0.25 → 1.16 m and the heavy one 0.21 → 1.11 m, then both
slipped near the top of the swing. This is a bounded force acting on a body free to rotate
about a single point, so it is physically reasonable — and §6.2 explicitly wants grip
position to matter — but whether it is *fun* is a playtest question, not a test question.
Two hands are noticeably steadier already (m2 F4). Candidate levers if it reads badly:
`GRIP.heldAngularDamping`, `GRIP.maxStretch`, `GRIP.slipMs`.

**Mass legibility is not verified by test.** §6.2 wants "object mass requires more force" to
be visible, and the design makes the sag equal m·g/k — 0.098 m for the 9 kg box, 0.185 m
for the 17 kg one. What IS asserted is that the heavier box is pulled with more force
(m2 D5). What is NOT asserted is the settled sag, because the swing above means the hold
does not reach a steady state within the test window. Needs an eye, not an assertion.

**You cannot yank an object.** Moving the hand target faster than the bounded grip force
can follow stretches the grip until it breaks. That is the intended §6.4 behaviour and the
reason a box cannot be dragged through a wall, but it also means sweeping the camera while
carrying something will drop it. Whether the threshold is set kindly enough is a playtest
question.

**Held objects do not collide with their carrier.** Necessary — see the changelog — but it
means a player can walk through a box they are holding. It becomes solid again the moment
it is clear of them. Watch for this reading as "the box is a ghost" in playtests; if it
does, the fix is to stop the player instead, which is a bigger change.

**The couch and dresser are still static.** They stay that way until Phase 3, on §29.1's
build order. Do not read their immovability as a bug.

---

## Phase 3 open items

**Sustained one-handed dragging of the couch does not work.** This is the clearest gap
against §6.3's "one drags or pivots", and it is not hidden behind a lenient assertion.
MEASURED: pulling a 90 kg couch one-handed and unbraced develops up to 467 N (floor friction
needs 309 N) and the couch reaches 0.91 m/s — but nets only 8 mm of travel. It lurches
forward, the spring pulls it back, and the mover shuffles it rather than dragging it. What
IS true, and what m3 E3 asserts, is that a lone mover can put 90 kg into motion at all,
which is the no-hard-denial claim the gate actually makes. Candidate levers, none yet tried
in anger: `GRIP.maxStretch` against `GRIP.spring` (the force available at full stretch is
spring × maxStretch = 630 N and that is the real ceiling), `CARRY.dragForceRef`, or giving
dragged objects a lower kinetic than static friction.

**The ragdoll is a timed knockdown, not a simulated body.** §5.1 asks for "physical body;
limited crawl/grab" during ragdoll. What exists is: the mover is dropped, immobilised for
§5.1's 1–3 seconds, and gets up. The timing and the consequence (you drop what you were
carrying) are real; the jointed physical body is not. A proper ragdoll is Unity-side work
(§24.2) and would be wasted effort in the prototype.

**`pinned` is still declared and unentered.** §5.1's table has it; nothing can trap the
mover under an object until the Phase 5 house exists.

**Tuning above this line is one person's guesses.** `CARRY`'s numbers were arrived at by
measurement against the gate, not by play. Whether a 90 kg couch SHOULD knock a mover down
after ~2 seconds, or whether bracing should feel like more than a 50% reduction, are
playtest questions. The one that most needs an outside opinion is whether losing your
balance reads as "I overreached" or as "the game took it away from me".
