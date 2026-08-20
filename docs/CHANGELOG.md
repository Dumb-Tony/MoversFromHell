# Changelog

Required by GDD §25.1. One entry per increment, newest first. Each entry states the
behaviour hypothesis, what it touched, and what was checked.

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
