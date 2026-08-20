# Changelog

Required by GDD §25.1. One entry per increment, newest first. Each entry states the
behaviour hypothesis, what it touched, and what was checked.

## Phase 4 — the cooperative seam — 2026-08-20

**Gate (§25.2):** "Second actor/test harness or command model" → **multiple grips combine
predictably**. **PASSED** — 59 assertions (365 across five suites).

**Hypothesis:** cooperation should not be a feature. If §6.4 is implemented honestly —
forces add on a shared body, nobody owns anything — then two movers helping each other
falls out of the physics that Phases 2 and 3 already built, and there should be no
co-op-specific code path anywhere. The gate is therefore not "co-op works" but "nothing
about the grip model breaks when a second pair of hands arrives".

**Added**
- `MOVERS` config: count, spawn offsets, per-mover colour, and whether an inactive mover
  keeps its grips (it does).
- Every mover gets its own `PlayerController`, its own `GripSystem` and its own coloured
  blockout body. `makeBlockout` now takes a cloth colour so which one you are driving is
  readable at a glance rather than from the HUD.
- **Tab** swaps which mover you drive. The camera keeps its yaw and re-targets, so swapping
  does not spin the view.
- An unattended mover keeps holding and braces automatically. §6.4 forbids "a canned
  synchronized carry animation taking ownership", so an idle mover is one whose INPUT is
  zero, not one that is switched off — its grips keep pulling, which is the entire point.
- `moversOn()` / `gripsOn()` helpers, and `tools/m4-tests.js` — 59 assertions.

**THE BUG OF THE PHASE: one camera rig, and every mover's hands were reading it.**

Hand targets are stored view-relative and rebuilt each step against the current aim frame
(Phase 2's fix for the camera-to-shoulder offset). `aim()` read `rig.yaw/pitch` directly,
which is correct with one mover and silently wrong with two: an inactive mover's hands were
rebuilt in the ACTIVE player's view frame, so they swung around the world whenever the
player turned the camera. MEASURED: with both movers holding one couch, mover 0 applied
**0.0 N** while mover 1 applied 63.1 N, because mover 0's hand target had been rebuilt
almost exactly on top of its own grip point, leaving no stretch to generate force.

In play this would not have looked like a bug. It would have looked like a partner who does
not pull their weight. Each `GripSystem` now keeps its own `aimYaw`/`aimPitch` and only
takes them from the rig while it is the mover being driven.

**Second bug: damping was solving the wrong spring.**
`handsOn()` counts the hands of ONE grip system. In Phase 3 that is also the number of hands
on the object, so the conflation was invisible. With two movers each holding one end, both
derived their damping for a single-hand spring while the body actually had two attached —
leaving the pair overdamped by a factor of √2. Split into `hands` (mine, which scales my
strength and divides my own force budget) and `allHands` (every hand on the object, which is
the spring system the damping has to be derived against). Nobody gets stronger because
somebody else grabbed the other end; the damping does have to know they are there.

**Measured — the gate itself**

| | peak force | rose | lowest corner clear |
|---|---|---|---|
| one mover, one hand | 458 N | 0.058 m | **0.000 m** |
| two movers, one hand each | 895 N | 0.131 m | **0.011 m** |

The couch weighs 883 N and it sits between those two numbers. Forces add almost exactly
linearly, and the result is binary in the way §6.3's "one drags or pivots; two or a tool
preferred" describes: one hand cannot separate a couch from the floor by a micron, two can.

`clearForces()` running once per step rather than once per mover is asserted directly
(H2–H4): with both holding, both must register applied force in the SAME step. H5 corroborates
it from the world rather than the counters — the couch cannot be airborne unless both forces
landed.

**Four wrong measurements, none of which were bugs in the game.** Recorded because the
pattern is the same each time: the test asked for something the physics does not do.
1. Asked for a lift that needs 0.49 m of stretch while ramping the hands only 0.45 m.
2. Ramped along the aim frame's `up` axis, which is tilted by the pitch, so the hands rose
   12% less than the arithmetic assumed. Third time an aim-frame tilt has cost a wrong number.
3. Measured rotation about Y while the couch was visibly turning — hands gripping 0.19 m
   above the centre of mass tip it about its LONG axis, and that is identical wherever along
   that axis you pull, so both arrangements measured the same.
4. Counted the rise of the couch's CENTRE as a lift. Tipping a 0.90 × 0.85 box 23° onto its
   back edge raises its centre 0.142 m for free — within a centimetre of the 0.148 m that was
   being read as "two movers got it airborne". Its lowest corner never left the ground.
   `clearanceOf()` now arbitrates, and both movers take the two ENDS, which is the only
   arrangement that lifts rather than tips.

**Checked:** m0 118, m1 61, m2 66, m3 61, m4 59 — 365 assertions, all passing.

## Phase 3 — heavy object — 2026-08-19

**Gate (§25.2):** "Mass, leverage, drag, brace, stumble" → **weight legible without hard
denial**. **PASSED** — 61 assertions (306 across four suites).

**Hypothesis:** weight becomes legible when the object pushes back through the CONTROLS —
slower movement, a body being tugged, balance you can lose — rather than through a number
on screen. And §2.1's "the game should rarely say no" means every one of those must be a
cost, never a refusal.

**Added**
- `couch_3seat_01` (90 kg) and `dresser_01` (55 kg) as dynamic entities. The couch is §7.1's
  own worked example, at its own dimensions. Both stood in the scene as static meshes for
  three phases; §29.1's build order said the couch could not be grabbed until the
  heavy-handling model existed, or it would have felt like a very large box.
- `CARRY` config block, and on the mover: supported load, the reaction pull, imbalance,
  knockdown and exertion.
- §5.1's STUMBLING and RAGDOLL states are now entered. `pinned` still is not — it needs an
  object to trap the mover under, which arrives with the Phase 5 house.
- `tools/m3-tests.js` — 61 assertions.

**THE BUG OF THE PHASE: Rapier forces persist and compound.**
`addForce` / `addForceAtPoint` do not apply for one step. They add to an accumulator that is
re-applied on EVERY subsequent step until reset, and calling them again ADDS to it. Measured
on a 10 kg body with a nominal 100 N:

| pattern | result |
|---|---|
| addForce once, 60 steps, no reset | 10.0 m/s (a steady 1 s push) |
| addForce EVERY step, 60 steps, no reset | **312.6 m/s** — compounding, ~60x |
| resetForces before each addForce | 16.2 m/s — correct |
| resetForces AFTER world.step() | 10.1 m/s — does **not** clear it |

Every grip since Phase 2 had been applying a force that grew without bound. §6.4's cap was
being enforced on a number that was then added to an unbounded running total — the clamp was
real, the total was not. This is behind a great deal of Phase 2's flying-object behaviour,
and it means several Phase 2 assertions were passing for the wrong reason. Fixed with
`PhysicsWorld.clearForces()`, called at the top of the grip step; the measurements are in
the source so nobody re-derives them.

**Three design errors it exposed, all found by tests**
1. **Dragging billed the mover for the object's full mass.** The floor holds a dragged couch
   up; the hands only supply horizontal force. Charging 90 kg made imbalance reach the
   knockdown threshold in 1.5 s, so every drag ended with the mover flat on their back — the
   forbidden hard denial, arriving by the back door. Load is now the mover's actual
   SUPPORTING force, which makes §6.3's "one drags or pivots" true for free.
2. **Dragging then cost nothing at all**, so the mover strolled off at 3 m/s and outran what
   they were pulling (grip gone in 18 steps, mover 11.9 m away). Resisted force now slows
   the mover too — `CARRY.dragForceRef`.
3. **…and at first it slowed them to a standstill** (0.26 m in four seconds), because the
   `pull` velocity already opposes motion and the speed penalty double-counted it. Calibrated
   to 600 N.

**Also fixed**
- The couch's friction went 0.62 → 0.35. 0.62 was survivable only while forces were ~60x too
  strong; with real forces the couch became immovable. 0.35 is also the honest figure for a
  fabric-and-wood base on a hard floor, and §9.1's sliders exist to reduce it further.

**Assertions rewritten, not deleted**
- m2's "nothing heavy before Phase 3" was correct for Phase 2 and correctly obsolete the
  moment Phase 3 added the couch. A test that pins a phase's SCOPE has a shelf life; it now
  asserts the invariant underneath — every definition declares a class the config knows.
- m2's "pulling away from a stuck box breaks the grip" tested one MECHANISM. Since the mover
  is now slowed by resistance they often strain instead of tearing free, which is a fine
  outcome. It now asserts the GUARANTEE: the box never crosses geometry.

**Known shortfall, not papered over.** Sustained one-handed dragging of the couch does not
work: it reaches 0.91 m/s but nets 8 mm, lurching and springing back. §6.3's "one drags or
pivots" is half true. What IS asserted is that a lone mover can put 90 kg into motion at all
— which is the no-hard-denial claim the gate makes. Written up in KNOWN_ISSUES with the
numbers rather than hidden behind a threshold low enough to pass.

## Phase 2 — one box — 2026-08-19

**Gate (§25.2):** "Freeform two-hand grip, collision, carry/drop" → **controllable; no
wall ghosting**. **PASSED** — 66 assertions (245 across all three suites).

**Hypothesis:** §6.1's "spring-like constraint from the hand target to a local point on the
object's collider", applied as a bounded FORCE AT A POINT rather than as a joint, gives
controllable carrying and makes §6.2's leverage and mass factors emerge from rigid-body
dynamics instead of needing special cases — while keeping the object a fully dynamic body,
which is the only way to satisfy "no wall ghosting".

**Added**
- `src/objects/definitions.js` — §7.1/§23.1 object definitions as data, plus a §24.4
  validator run at spawn. Two boxes only; §29.1's build order keeps furniture out until
  Phase 3.
- `src/objects/registry.js` — dynamic bodies, meshes and §7.2 runtime state created and
  disposed as one record; collider-handle → entity lookup for raycasts; settle detection.
- `src/player/grip.js` — acquisition, the damped-spring force at a point, per-hand targets,
  slip, and the anti-ghosting release.
- `src/ui/hud.js` — §21.1's centre reticle with per-hand grip state, readable without
  colour (§26.5): each state changes shape as well as colour and carries a text label.
- `tools/m2-tests.js` — 66 assertions.

**Six bugs found and fixed, all by the tests**
1. **Nothing was grabbable at all.** §6.1 says the ray comes from the camera, and I also
   measured REACH from the camera — but the third-person camera sits ~4 m behind the
   character, so a 2.1 m reach did not arrive at its own back. Aim comes from the camera;
   reach is now measured from the shoulder.
2. **The held object was crushed through walls.** The player capsule is kinematic and
   unstoppable, so walking into a wall while carrying pinned the box between an immovable
   body and a static one; the solver ejected it — MEASURED at z = -8.66 through a wall at
   -2.09. CCD does not help, that is depenetration not tunnelling. A held object now leaves
   the player's collision group. This is the gate, and it would have shipped broken.
3. **The character controller ignored those groups.** It has its own filter, so
   `setApplyImpulsesToDynamicBodies` kept shoving held objects anyway — a box put down
   beside the player left at 7 m/s. Fixed by passing the player's interaction group to
   `computeColliderMovement`.
4. **A dropped box was launched at 40 m/s.** Restoring player collision the instant a grip
   ended handed the solver a deep overlap to resolve in one step. Collision is now restored
   only once the object is geometrically clear — and the clearance test needs the box's
   half-DIAGONAL, not its half-width, or it declares "clear" at the exact distance a corner
   still touches (that produced a 7.3 m/s shove).
5. **The hold was underdamped.** A flat damping coefficient gives ζ = 0.33 for a 9 kg box
   and 0.11 for a 90 kg couch — worse the heavier the object, so invisible on a box and
   unbearable on a piano. Damping is now a RATIO; the coefficient is derived per grip as
   2ζ√(k·m).
6. **Light objects were flung.** 750 N on a 9 kg box is 8.5 g; running while carrying let
   the box lag, saturate the spring, and leave at 17 m/s when the grip broke. The cap is
   now min(strength, mass × maxAccel) — light things are acceleration-limited, heavy things
   force-limited.

**Also fixed**
- `lastForce` recorded the force DEMANDED before clamping, and was then used to assert
  §6.4's bound — meaningless, since demand is unbounded by construction (4001 N was
  observed against a 750 N cap while the clamp worked perfectly). Split into `lastDemand`
  and `lastApplied`.
- `GRIP.maxStretch` (1.15 m) sat above the spring's saturation point (forceCap/spring =
  0.833 m), leaving a 0.32 m band in which every grip was doomed and merely took a second
  to admit it. Now 0.70 m, with the invariant asserted.
- The harness virtual-time budget went from 90 s to 240 s: boot is async since Rapier
  arrived, and an occasional run spent the budget before the WASM promise resolved, which
  looks exactly like a hang.

**Corrected in the tests, not the code**
- The definition validator rejected `box_heavy_01` at boot for having mass 17 in the
  `light` band. It was right — 17 kg is `medium` by §6.3's own table. The data was fixed
  and the over-strict assertion ("everything must be light") replaced with what §29.1
  actually forbids before Phase 3: nothing heavy.
- Several attempts to measure steady-state sag failed because the rig, not the game, was
  wrong: comparing two boxes in different support conditions, then a hand target on a
  different line from the probe ray, then lifting faster than a bounded force can follow.

**Not verified, deliberately** — see KNOWN_ISSUES. Mass legibility (does a heavier box
*look* heavier?) and the swing-then-slip behaviour of a one-handed hold are recorded for a
human playtest rather than asserted on the strength of a rig that would not hold still.

## Phase 1 — movement — 2026-08-19

**Gate (§25.2):** "Third-person proxy, camera, jump/mantle, recover" → responsive indoors
and on ramp. **PASSED** — 61 assertions (179 across both suites).

**Hypothesis:** §5.1's hybrid character model — a kinematic capsule for normal navigation,
with a physical reaction layer bolted on later — gives responsive movement without the
player "wrestling the avatar merely to cross a room", and a real solver makes the ramp,
the porch step and the mantle fall out of one controller rather than three special cases.

**Added**
- `assets/lib/rapier3d-0.20.0/` — Rapier3D compat 0.20.0, vendored offline. Single ESM
  file with the WASM inlined as base64; no second request, no CDN, no `import.meta.url`.
  Provenance, licence and the one modification are in `assets/lib/NOTICE.md`.
- `src/physics/world.js` — the ONLY file that imports Rapier, so §24's Unity port has one
  seam to replace. Fixed timestep bound to the clock, §7.3 velocity caps, static colliders
  built from the scene's shared AABB records, rotated ramp collider.
- `src/player/controller.js` — `KinematicCharacterController` with autostep, snap-to-ground
  and slope limits; §5.1 state machine; mantle by three raycasts (wall, ledge top,
  headroom); §18.3 recovery with a last-stable transform banked only while settled.
- `src/render/playerBody.js` — blockout mannequin adapted from Something's Different.
- Room, ramp, platform, porch step and mantle ledges in `src/render/scene.js`, as specs
  shared by the mesh and the collider.
- `tools/m1-tests.js` (61 assertions), `tools/_rapier-probe.js` (kept as a diagnostic).

**Measured, and written into the code**
- `world.castRay` reads a query pipeline populated ONLY by `world.step()`. A cast before
  the first step returns null however much geometry exists, and a collider created this
  step is invisible to rays until the next one. The first mantle probe of the session
  found nothing until `primeQueries()` was added.
- The hit distance is `hit.timeOfImpact`. `hit.toi` is `undefined` in 0.20 even though
  most Rapier examples still use that name.
- `world.bodies.len()` / `colliders.len()` / `impulseJoints.len()` are the counters;
  `numRigidBodies()` and `numColliders()` do not exist.

**Fixed during the phase**
- **Mantle could never trigger from standing.** The jump branch cleared `grounded` before
  the mantle test ran, so the ledge check always saw an airborne player. Jump and mantle
  share one button (§4.2/§4.3), so the mantle now gets first refusal and consumes the press.
- **Physics stat counters read zero.** `primeQueries()` called `world.step()` directly and
  bypassed the bookkeeping, so the overlay showed 0 bodies until the first simulation step.
  Worse, it made m1's "no bodies leak" assertion pass by comparing zero to zero — a guard
  (G1a) now proves the count is real before the leak check uses it.
- **A boot failure produced a completely blank page.** Boot is async now, and m1's
  `await __MFH_READY` sat outside its try block, so a boot throw gave the harness nothing
  to grep and no error. The suite now emits before awaiting and reports the boot error.

**Changed deliberately**
- `player.yaw` no longer mirrors the camera. §5.1 wants the body to face its direction of
  TRAVEL, so a stationary player holds its facing while the camera orbits. m0's G11 used to
  assert the old behaviour; it now asserts the new one, because locking in the old contract
  would mean a character that pirouettes on the spot with the mouse.
- `buildPhase0Scene` → `buildScene`. It is not Phase-0-only any more.

**Not done, deliberately**
- `stumbling`, `ragdoll` and `pinned` are declared but never entered. Nothing can apply the
  impulses that would justify them until there are objects to collide with (Phase 3), and a
  state that can be entered but not left is worse than one that never starts.

## Phase 0 — scaffold, action map, debug overlay, fixed loop — 2026-08-18

**Gate (§25.2):** loads locally; stable frame/step. **PASSED** — 111 assertions.

**Hypothesis:** a fixed-step loop, an action map with controller parity, and a diagnostic
scene at true dimensions are enough to make every later phase measurable rather than
guessed at.

**Added**
- `src/core/clock.js` — `GameClock`, copied from Airport Baggage Crew. Accumulator, 250 ms
  long-frame clamp, pause, `alpha`, `skipMs`.
- `src/core/rng.js` — `mulberry32` + `Rng` + `hashStr`, copied from ABC (lineage:
  Something's Different → Chameleon).
- `src/core/eventBus.js` — copied from ABC, vocabulary replaced with the GDD §23.3 table
  and the §3.4 phase names.
- `src/core/input.js` — NEW. ABC's edge-per-simulation-step contract kept; per-context
  bindings, gamepad polling, analog triggers and hold/toggle grip are new because §4.2/4.3
  give every physical input two meanings and a flat map cannot express that.
- `src/game.js` — state, fixed-step loop, phase machine, reset. Total pause by
  construction (copied property from ABC).
- `src/render/{renderer,camera,scene}.js` — DPR-capped renderer; third-person rig with
  `camOcclude` from Chameleon; Phase 0 diagnostic scene.
- `src/dev/debugOverlay.js`, `src/config.js`, `index.html`, `styles.css`.
- `tools/{serve,smoketest,shot}.ps1` — copied from ABC, ports moved to 8381–8390.
- `tools/m0-tests.js` — 111 assertions across 7 sections.

**Fixed during the phase**
- **Camera basis inversion.** `update()` placed the eye at `target − forward·d` while
  `forwardFlat()` reported the opposite direction, and `rightFlat()` returned left. Caught
  by the first screenshot (camera rendered from behind the wall). In Phase 1 this would
  have made the character run away from where the player was looking. Fixed, and locked
  down by D8–D11, which assert the eye→target direction equals `forwardFlat()` at six
  different yaws.

**Fixed after deploying to GitHub Pages**
- **Renderer never recovered from a 0x0 boot.** `createRenderer` sized itself once and
  otherwise relied on the `resize` event. A page that boots in a background or prerendered
  tab lays out at 0x0, and bringing it forward fires no resize event — so the backing store
  stayed 0x0 and `camera.aspect` stayed 0 permanently, rendering nothing. Measured on the
  live Pages build: client size reached 1280x720 while the backing store stayed 0x0.
  Replaced with `syncSize()`, called every frame, which re-sizes only on an actual change
  (two integer compares in the steady state). Locked by G17-G22, which reproduce the boot
  honestly on a throwaway 0x0 canvas rather than by forcing `setSize(0,0)` — the latter does
  not reproduce it, because the CSS size never changes and the change detection is right to
  ignore it.

**Corrected in the tests, not the code**
- A12/E1/E2 initially failed on float precision, not behaviour: `stepMs * 3` is exactly
  `50.0` in float64, and `50 − 2×16.666666666666668` falls 7e-15 short of a third step, so
  the accumulator legitimately runs two steps and banks the remainder. `Math.floor(1000 /
  stepMs)` likewise yields 59 when the true answer is 60. Replaced the brittle exact-count
  assertions with the invariant that actually matters — every millisecond fed in is either
  spent as sim time or still banked (A13), and the banked remainder is always under one
  step (A14).

**Not done, deliberately**
- No physics engine. Rapier3D is chosen and vendored-offline is the plan, but Phase 0 has
  no bodies to simulate. Phase 2 introduces it.
- No player character, no grips, no truck. Those are Phases 1–8.

**Deployed**
- GitHub Pages enabled from `main` root, plus `.nojekyll`. The repo *is* the site: no build
  step, every push redeploys. https://dumb-tony.github.io/MoversFromHell/
