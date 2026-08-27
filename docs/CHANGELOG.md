# Changelog

Required by GDD §25.1. One entry per increment, newest first. Each entry states the
behaviour hypothesis, what it touched, and what was checked.

## Phase 14 — the toy pass — 2026-08-25

**Gate:** not a §25.2 roadmap phase. "Make it look much better" forked three ways —
toy / cel / film — and the fork was a product decision, so it shipped as three photographed
options over one posed scene (`?style=`, previous commit) and the user chose **TOY**: lean
into the primitives rather than apologise for them.
**PASSED** — 857 assertions across fourteen suites (m13 grew to 35).

**What the direction means, built rather than filtered:**

- **Rounded geometry is the build now.** Every prefab part extrudes a rounded profile
  instead of instancing a BoxGeometry. ⚠ Bounds are MEASURED, not trusted: r128's extrude
  bevel expands the outline loosely, so `roundedBox` builds a candidate, measures its
  bounding box, and rescales to exactly w×h×d — §13.4's collision-faithful rule survives by
  construction, m13 A1 re-measures all 16 prefabs downstream, and A7 pins the direction
  itself (a "performance fix" swapping boxes back would revert the look with every other
  assertion green).
- **The palette saturates at the source** — inside `matte()`, the one place every flat
  colour passes through. Textured surfaces are untouched (their material colour is white;
  saturating white does nothing, which is a measurement from the first mock, not a guess).
- **The approved mock's light, baked:** sun 1.59 warm, hemi 0.22, exposure 1.16.
- **Toy movers:** shorter legs, wider torso, an oversized head — the silhouette is the
  style. Still normalised to exactly PLAYER.height; the capsule contract holds.
- **THE ARMS REACH.** With a grip held, the arm pitches and leans toward the grip point and
  the lime hand-cube sits ON it (clamped to arm's length). "Carrying looks like standing
  next to something" had been in KNOWN_ISSUES since the first art pass; the hand markers
  have existed since Phase 2, and this is the first time they mark the grip.
- **Interior density:** a pendant with a glowing bulb under each room light (light from
  nowhere reads as an artefact), a rug, pictures. The truck cab is rounded (visual inside
  the collider AABB — §8.1 forbids the other direction).

**Three bugs:**

- **A picture frame shipped hanging inside the living→kitchen doorway.** m13's doorway
  sweep only guarded the three FRONT apertures; the frame at x=2.2 sat squarely in the
  interior opening (2.17..3.03) and passed every test. Caught by a screenshot; B1b now
  sweeps interior doors too.
- **`requestPointerLock` rejected over a healthy game** the moment the title screen's
  start() could run without a user gesture — the EXACT trap already in Dev\INDEX.md from
  ContainmentDetail, hit anyway because the wrapper was never applied here. Wrapped and
  swallowed in Input.requestPointerLock.
- **The arm side-lean sign was backwards** — rotating the arm's down-vector about +z moves
  its tip toward +x, so the lean shares the sideways sign; negating it pointed the far
  mover's arm directly away from the couch they were holding. Rendered wrong, read wrong,
  fixed by deriving the rotation instead of guessing it.

**Cel and film remain reachable** (?style=cel / ?style=film) so the decision stays
photographable. The toy losers' one-line obituaries: cel hid the lighting work the previous
phase paid for; film needed density the world does not yet have.

**Limitation:** the reach is presentation-only inverse pointing, not IK — elbows do not
bend, and a grip behind the mover clamps rather than turning the torso. §24.2's "procedural
hand IK" stays Unity-side work.

## Phase 13 — the art pass, and the interior lighting — 2026-08-23

**Gate:** not a §25.2 roadmap phase. §20.4 told the prototype to look diagnostic — "simple
meshes, colour separation, contact shadows, faithful collision" — and for twelve phases it
did exactly that, which is why a build with 822 passing assertions still photographed like a
CAD viewport. Nothing here changes what the game DOES.
**PASSED** — 24 assertions (846 across fourteen suites).

**An art pass is the most dangerous change this project can make**, because its mistakes are
invisible to every test that came before it. Nothing in m0–m12 looks at a mesh. A couch whose
arms overhang its collider still weighs 90 kg, still drags at the right force, and still
passes every assertion — while visibly sliding through a door frame it should have caught
on, which is the one thing the whole game is about (§26.2). So m13 tests the boundary between
what you SEE and what the physics DOES, and the two assertions that matter are:

- **A1** — every prefab fits inside its own declared dimensions, to the millimetre, for all
  16 object definitions. §13.4: "stylized primitive meshes are acceptable; COLLISION-FAITHFUL
  PROPORTIONS ARE MANDATORY."
- **B1** — nothing decorative has crept into a doorway. The three apertures are still
  0.82 / 0.86 / 0.91 m of actual air, measured by sweeping every mesh in the scene against
  the clear opening rather than by trusting that nobody hung a door in the door.

Plus **C1**: the roof, siding, trees, hedge, kerb and street add **not one collider**. §8.1
forbids decorative collision contradicting the visible surface, and a bush a mover cannot
walk through is precisely that.

**Copied rather than invented** (Dev\INDEX.md → "Procedural geometry & texture"):
`canvasTex`, `hslCss`, `tiled`, `texGrass`, `texAsphalt`, `texSiding`, `texShingle`,
`texConcrete`, `texBoards` and `texPaint` come from `SomethingsDifferent`, which runs the same
vendored Three r128 build — they dropped in unported, which is the entire reason that rule
exists. What is new is what a moving game needs and that one did not: cardboard with tape
seams and a FRAGILE stencil, upholstery weave, wood with end grain, appliance steel, hi-vis,
and the truck's livery.

**Four bugs, and the first two were invisible in every previous screenshot:**

- **⚠ `node --check foo.js` EXITS 0 ON BROKEN ES-MODULE SYNTAX.** It parses `.js` with the
  CommonJS goal. An automated edit spliced one `import` into the middle of another in
  `scene.js`; the gate this session has been leaning on passed it. Measured with Node
  v24.18.1: the same file fails as `.mjs` with "Unexpected reserved word". Every file in
  `src/` is a module, so the cheap gate was blind to exactly the code it guarded.
  `tools/syntax-check.sh` now copies to `.mjs` first; `--input-type=module` does not help
  (rejected for file input).
- **Every flat colour in the build was washed out**, and it took a textured surface beside an
  untextured one to see it. Three r128 has no colour management: `outputEncoding =
  sRGBEncoding` converts LINEAR to sRGB on the way out, so a hex literal — authored in sRGB —
  has to be converted first. A mid-brown tree trunk arrived as pale tan. Centralised in
  `lambert()`/`basic()` rather than fixed at each of the thirteen material sites, because
  "convert every colour except the ones somebody forgot" is worse than not converting.
- **The sky dome was clipped by the far plane.** Radius 400 against `RENDER.far` 300, which
  paints a hard diagonal edge of clear colour across the top of the frame and reads as a
  rendering glitch rather than a missing sky.
- **Removing an object threw**, because `registry.remove` disposed `mesh.geometry` and the
  visual is a Group now. Caught by m2, and the fix walks the group — while deliberately NOT
  disposing materials, which are shared across every object of the same prefab.

**The metre grid is off by default.** It has been in the scene since Phase 0 and it earned
its place — several tuning decisions were made by counting squares — but nothing that ships
has a metre grid painted on the lawn. It now rides with the stats on F3, where it is a
measuring instrument rather than scenery. Same treatment for the Phase 1 mantle blocks: the
bodies are brickwork and the lime/coral legend survives as a painted coping, so the diagnostic
is intact and a raised bed is a thing a garden has.

**Also here:** a pitched roof, siding, brick skirt, windows and a front door on both houses;
a street with a centre line and kerbs; trees, a hedge, a mailbox and a wheelie bin; the truck
with wheels, a windscreen, a bumper and its own livery on both flanks; movers in hi-vis with
caps, boots and gloves; and §13.4's "compact job-start screen rather than a full
headquarters" — one card, one button, and the only honest place to tell anyone that F2 exists.

**Measured:**

| claim | evidence |
|---|---|
| every prefab is collision-faithful | 16/16 within declared dimensions, 1 mm tolerance |
| the couch is still the couch | 2.1000 m across; 0.850 m narrowest presentation |
| doorways are still air | 0 meshes intersect any of the three clear openings |
| scenery is scenery | 0 colliders added by the dressing |
| it is affordable | 380 meshes in the dressed scene, against a 2600 budget (§26.6) |

**Touched:** `src/render/textures.js` (new), `src/render/prefabs.js` (new),
`src/ui/titleScreen.js` (new), `src/render/scene.js`, `src/render/renderer.js`,
`src/render/playerBody.js`, `src/render/strapLines.js`, `src/objects/registry.js`,
`src/tools/tools.js`, `src/main.js`, `styles.css`, `tools/m13-tests.js` (new),
`tools/syntax-check.sh` (new).

**Checked:** 24 new assertions; 846 across fourteen suites, 0 failing. No collider moved.

### The interior lighting, fixed the same day

The limitation above said "interiors are flatter than exteriors" and guessed the cause was
the light count. It was not.

**`MeshLambertMaterial` SHADES PER VERTEX.** The vendored r128 build settles it: the shader
assembles `lights_lambert_vertex` for Lambert and `lights_phong_fragment` for Phong. A wall
is two triangles, so a Lambert wall's lighting is computed at four corners and interpolated
across ten metres. Every interior surface was one flat value with adjacent faces at 90°
separated by a hairline — and **hanging lamps in those rooms would have changed almost
nothing**, because a point light 2 m from a 10 m wall moves four corner values and the middle
is a blend of them. `matte()` now builds a MeshPhongMaterial with the specular killed, which
is per-fragment Lambert in all but name; m13 F1–F3 pin it, including "no per-vertex material
survives anywhere in the scene", because if one comes back nothing else in the project would
notice.

**The second half was that nothing indoors cast a shadow at all.** The room shells have
ceilings, so the sun is blocked by construction, and a HemisphereLight does not occlude — it
lights every surface equally whatever is above it, which indoors is a constant. Each room now
has its own warm spot from the ceiling with a real shadow map, so objects sit on the floor
instead of hovering. Plus baked contact darkening and a skirting board in the plaster
texture, which is the cheapest honest stand-in for the ambient occlusion a real-time rig with
no AO pass does not have.

**⚠ A ZONE FILTER OF `maxY > 1` PUT A SPOTLIGHT IN THE FRONT GARDEN.** The kerbside aprons
are zones too. The scene reached 13 lights and 10 shadow maps before anyone looked at a
number. Indoor rooms are those whose ceiling is the shell's wall height; m13 F5 asserts no
room light is hung outdoors.

**⚠ AND THEN THE TEST HARNESS TOOK TEN MINUTES A SUITE.** Measured, headless Chrome
(SwiftShader), bisected rather than guessed:

| configuration | m7 | m0 |
|---|---|---|
| no room lights | 4 s | 22 s |
| 6 room spots, no shadows | 6 s | 149 s |
| 6 room spots, 3 casting | >600 s | — |

Two different costs, and which dominates depends on how many FRAMES a suite renders. m7
renders few, so shadow maps are everything and six extra lights cost two seconds. m0 renders
many, so the per-fragment light loop is everything and the same six lights cost 127 seconds.

The wrong response is to cut the shipping build's quality so a headless test runs fast — on
any real GPU this is nothing. The right one is a **quality tier**, which is a feature rather
than a workaround: §26.6 promises a 45 FPS floor to the PLAYER, and someone whose machine has
fallen back to software rendering should get a playable game instead of a slideshow.
`detectRenderTier()` reads `WEBGL_debug_renderer_info` — headless Chrome reports "Microsoft
Basic Render Driver" — and the software tier drops the room lights and halves the sun's map.
The harness got its speed back as a side effect of doing the honest thing. `?tier=gpu`
forces it, which is how the screenshots show what a player with a graphics card sees, and is
the seam a §21.4 settings panel would use.

**Measured after:** 340 draw calls and 7 488 triangles, unchanged from before the whole art
pass. 10 lights and 4 shadow maps on a GPU; 4 lights and 1 on software.

**Limitation:** no normal maps, no ambient occlusion pass, and one shadow cascade. The baked
skirting and contact gradient are standing in for AO and only work because every wall in the
house is the same height — the moment a room has a different ceiling, the gradient lands in
the wrong place.

## Phase 12 — local co-op — 2026-08-23

**Gate:** not a §25.2 roadmap phase, and **a deliberate departure from §13.4**, which lists
split-screen among the prototype's exclusions. §14.1 files local split-screen as an
"expansion hook until proven feasible", and CLAUDE.md reads an expansion hook as *leave a
seam, do not build it*. Built anyway, as a recorded product decision.
**PASSED** — 85 assertions (822 across thirteen suites).

**Why the departure was worth making.** §6.4's two-mover cooperation is a LOCKED pillar and
the single largest gap between what this build simulates and what the GDD describes. The
physics has been right since Phase 4 — two grips combine on one couch, opposite-end grips
stabilise it, and the suites measure all of it — but there was never a second person, only
one player Tab-swapping between two bodies. §27.3's questions are mostly about the TEAM:
what did they try, when did they coordinate, which moment would they tell a friend about.
None of them can be asked without a team. Phase 11's playtest note said this was the only
thing standing between the build and a real playtest; this is that thing.

**Split-screen was forced, not chosen.** `GripSystem.aim()` derives its ray from the camera
rig, because §4.1 defines aim assistance in camera space. Two movers sharing one camera
therefore aim in the same direction and reach for the same object. A single shared
auto-framed camera — the Moving Out shape, and the one §13.4 would have preferred — means
rebuilding aim as body-relative and re-validating every Phase 2, 6 and 11 assertion that
depends on the ray. One rig per mover changes nothing that was already measured. That
tradeoff is recorded in `COOP` in config.js, because "why not one camera?" is the obvious
question and the answer is not obvious.

**Copied rather than invented** (Dev\INDEX.md → "Local co-op on one keyboard", and the
lesson from Phase 11's lineage miss):

- **One binding map per SEAT, sharing no key**, from `TowBros\src\core\input.js`
  `CREW_BINDINGS` — including its warning, which turned out to be exactly the bug here:
  *seat 0 has to LOSE the arrow keys it used to also own*. `moveForward` had been
  `['KeyW', 'ArrowUp']` for five phases, because one seat may own as many alternates as it
  likes. `bindingConflicts()` makes that a check rather than a hope, and §21.4 makes
  remapping a data edit, so the check ships in the build rather than only in the suite.
- **The single-player alias kept honest**, from `SmallTownEmergencyServices\src\game.js`:
  every query takes a trailing `seat` defaulting to 0, and `input.look` **is**
  `input.looks[0]` — the same object, not a copy, so a hundred call sites cannot drift.
- **Contention as a property, not a rule**, from the same file and from `TowBros`'
  `authority.js`: nothing asks "can two people pick this up?" because `carriedBy` is a
  single mover id and a second claim has nowhere to be written.
- **The scissored second viewport** and both of its GL traps, from
  `ContainmentDetailWeb\src\render\renderer.js`.

**Three bugs, each of a different kind:**

- **Pad tokens were not seat-qualified.** Two controllers both report button 6, so an
  unqualified `Pad6` was seat 1's trigger arriving as seat 0's grip as well. Tokens are now
  `P<seat>B<index>`.
- **A context switch cleared ALL held input.** Right with one seat; a §6.4 bug with two — it
  dropped the other player's held grip the instant their partner climbed into the cab, and
  would have read as "the game dropped my couch". Now `_clearSeat`.
- **Moving the HUD from ids to classes broke the grip label, and only CSS reported it.**
  `update()` wrote `label.className = cls`, which was safe for five phases because an id
  survives a className write. As a class it did not: the label lost `grip-label`, fell out of
  `position: absolute`, and rendered as a static block across the top of the viewport through
  the contract panel. Found in a screenshot, not in a test; now asserted (m12 H4a–H4c).

**Two test-fixture errors, both the same shape as every previous one** — a number too
plausible to be tuning. m4 and m5 aimed the global rig and grabbed with mover 1, which had
worked by accident while the rig was shared. The symptom was `couch_3seat_01 0.000m` against
the §25.2 Phase 5 gate: it read as "two people cannot move a 110 kg object", which is the
whole game failing, and was a fixture pointing one camera while closing a different pair of
hands.

**Measured:**

| claim | evidence |
|---|---|
| a seat's keys move only its own mover | seat 1 walks 0.3 m+, seat 0 moves < 0.05 m, and the mirror |
| both walk at once | both > 0.3 m in the same 40 frames |
| aim is independent | turning seat 0's camera moves seat 1's hands by 0 rad |
| the split tiles the canvas exactly | 799 + 799 + 2 = 1600 CSS px, no overlap |
| §6.4 still holds | m4/m5 unchanged and green — two grips still combine on one couch |

**Touched:** `src/core/input.js` (seats, per-seat look/context/pads, `bindingConflicts`),
`src/render/coopView.js` (new), `src/ui/hud.js` (per seat, classes not ids, `setRect`),
`src/main.js` (seats, per-mover rigs, per-seat render pass), `src/render/strapLines.js`
(guides keyed by seat), `src/dev/debugOverlay.js`, `src/config.js` (`COOP`), `styles.css`,
`tools/m12-tests.js` (new), `tools/m4-tests.js` + `tools/m5-tests.js` (fixtures).

**Checked:** 85 new assertions; 822 across thirteen suites, 0 failing. Solo is unchanged and
still asserted: one seat, full screen, Tab still swaps, and the view still does not spin when
it does — that last one needed new code, because a swap used to hold still by construction
when there was one rig.

**Limitation:** two people, not four. §14.1's production target is 1–4 and `COOP.maxSeats`
is the only thing standing in the way at this end — but `MOVERS.count` is 2, the split
layout halves rather than quarters, and nothing has been measured with three. See
KNOWN_ISSUES.

## Phase 11 — the playable layer — 2026-08-23

**Gate:** not a §25.2 roadmap phase. This closes the interface gap that phases 6–10 each
deferred: everything they built was real, measured and asserted, and none of it had an
input binding, so a player could not touch any of it.
**PASSED** — 68 assertions (737 across twelve suites).

**Hypothesis:** the gap was never missing features, it was that §9.2's "one common
interaction verb" had never been written. Phases 6–10 each ended with a working system and
a note that its interface was deferred; six deferrals compounded into a build that was much
more correct than it was playable. If the verb is right, nothing else needs adding — the
tools, straps, ramp, cab and invoice are already there and only need a way in.

**§9.2, implemented as written: E does the obvious thing, Q undoes it.** What "obvious"
means is decided by what you are looking at and what you are holding, and there is exactly
one binding for each:

| looking at | holding | E | Q |
|---|---|---|---|
| a tool | nothing | pick it up | — |
| an anchor | nothing | start a strap | — |
| an object | a dolly | put it on the dolly | put the dolly down |
| strapped cargo | nothing | tighten the straps | release them |
| an object with a part off | a screwdriver | — | put the part back on |
| the cab | nothing | drive | — |
| mid-strap | anything | finish the strap on this cargo | cancel the strap |

**§4.4's "one input should not change meaning invisibly" is the reason `describe()` exists.**
It returns the same decision `act()` will take, so the HUD renders the promise *before* the
key is pressed. The invariant the suite is built around: **7 promises made, 7 honoured** —
for every situation the prompt offers something, pressing the key does that exact thing.
`tools/m11-tests.js` drives `interact` the way a player would (stand somewhere, look at
something, press a key); it never calls `ToolSystem` or `StrapSystem` directly, because a
test that reaches past the binding cannot detect a missing one.

**Three bugs the suite caught, all of them in the verb rather than the systems underneath:**

- **What you carry blocks what you point at.** The interaction probe is a ray from the eye,
  and a carried blanket is a large collider directly in front of it — so picking up a
  blanket silently disabled E. The dolly hid this: it is thin enough to miss the ray. Fixed
  by excluding the mover's own collider and filtering carried tools out of the cast
  (`GROUP_PRESETS.player`, and a `toolCarried` group with filter 0). Note for the Unity
  port: `castRayAndGetNormal`'s 8th-argument predicate is **not honoured** — the 6-argument
  form is the one that works, which is why `grip.js` uses it too.
- **Q put the tool down before undoing.** Reassembly was unreachable: to put a leg back on
  you must be holding the screwdriver, but Q saw a held tool and dropped it. Undo now beats
  put-down whenever the thing in front of you has something to undo.
- **A 26 mm screwdriver is not pointable.** The screwdriver is 50 × 50 × 260 mm and a ray
  through its centre misses at any realistic standing distance. `_toolNearRay` adds a
  size-scaled tolerance, so small tools get aim assist and large ones do not need it.

**§10.3's strap rendering, which the phase also required:** a strap you cannot see is a
strap you cannot judge. `strapLines.js` renders the line, its anchor, its tension and its
overload risk. Slack renders as visible **sag in the geometry**, not as a colour change —
§26.5 asks for readability without a UI layer, and a colour-only cue fails for a player who
cannot distinguish it. Overstressed straps pulse orange to red at a rate set by how close
to failing they are.

**§15.2's two rules for the settlement screen**, both asserted: the grade never hides the
invoice (both are on screen together), and negative profit still *completes* the job — a
loss renders identically, in red, with the same replay button. There is no failure screen.

**Touched:** `src/player/interact.js` (new), `src/render/strapLines.js` (new),
`src/ui/invoiceScreen.js` (new), `src/ui/hud.js` (rewritten — prompt, contract, cargo,
route and notices, all at screen EDGES per §21.1, so no panel covers the object-doorway
relationship), `src/main.js`, `src/world/truck.js` (cab volume), `src/physics/world.js`
(`toolCarried` group), `tools/m11-tests.js` (new).

**Checked:** 68 new assertions; 737 across all twelve suites, 0 failing. The screenshot in
`docs/phase11-playable.png` is the shipping build's own HUD — unlike the Phase 10 shot,
where the invoice had to be drawn by the screenshot script because no UI existed.

**Limitation:** `game.state` is replaced wholesale by `game.reset()`, so the contract's
entity list is held outside it and the manifest and player record are re-attached
explicitly. That is a seam worth closing before Unity, not a bug — see KNOWN_ISSUES.

## Phase 10 — the economy — 2026-08-21

**Gate (§25.2):** "Time, damage, bonuses, invoice, review" → **ledger matches events**.
**PASSED** — 45 assertions (669 across eleven suites).

**Hypothesis:** "ledger matches events" is a stronger claim than "the arithmetic is right",
and the difference is the whole phase. An invoice whose numbers add up but were computed at
settlement from the final state of the world does not MATCH events — it agrees with them,
which is a different thing and stops being true the moment the two diverge. So every line
carries the events it came from, item damage is the §8.4 ledger the damage system wrote *as
impacts happened*, and `reconcile()` re-derives the whole invoice from the event records.

**§15.1's formula, implemented as written:** "Profit = base contract + bonuses + tips −
labor time − overtime − vehicle/fuel − property damage − item damage − violations −
recovery/service fees."

**Measured — a real contract, 19.5 minutes against an 18-minute estimate, one television
dropped on the way in**

| line | amount |
|---|---|
| base contract | 900.00 |
| room accuracy — 21/21 in the right room | 90.00 |
| labor time — 18.0 min × 2 movers @ 14/min | −504.00 |
| overtime — 1.5 min over, ×1.6 | −67.20 |
| vehicle/fuel — 4.2 km @ 3.2/km | −13.44 |
| furniture damage — 2 damage events | −991.00 |
| recovery/service fees — 1 recovery callout | −45.00 |
| **profit** | **−630.64** — grade D |

> *"I heard the television before I saw it."*
> broke_something_expensive · cost_them_money · items_left_behind

**`reconcile()` IS the gate, and it is tested from both sides.** It starts from the event
records — ledger lines, recovery counts, the work clock — and asks whether each invoice line
is accounted for. m10 B10-B12 then hand it two deliberately corrupt invoices: one with a
£250 property-damage charge nothing caused, and one that quietly drops a ledger entry. Both
are refused, by name. A reconcile that always returns true would make the gate worthless.

**Three §15.1 phrases that changed the implementation**

- *"Graduated; no hard cutoff"* (efficiency bonus). §2.3 wants a player to be able to "spend
  several hilarious minutes trying a terrible idea", and a bonus that cliffs at the estimate
  would make the funny option the economically wrong one. Asserted as SMOOTHNESS: the worst
  half-minute anywhere on the curve costs **28.89** of a 260 bonus, and three wasted minutes
  costs 218 against a 900 base.
- *"Negative profit still completes the job"* (§15.2). A 90-minute disaster with eight
  recoveries and four collisions returns −3173.04, a grade, a full invoice and
  `complete: true`. §12.2's four hard-fail conditions do not include an expensive afternoon.
- *"Use profit margin, delivered completeness, damage ratio and constraints rather than
  SPEED ALONE"* (§15.2). Two jobs at identical speed grade differently when one breaks six
  items or leaves half the load behind — both asserted.

**THE BUG OF THE PHASE: the review could not tell a disaster from a triumph.**
§15.2 says to "select only the two or three MOST SALIENT events", and I was taking the first
three tags in insertion order. A catastrophic job and a flawless one produced the identical
review — *everything delivered, every room right, nothing broken* — because the tags that
distinguished them (`needed_a_callout`, `cost_them_money`) were appended later and sliced
off. Tags are now weighted by salience and the top three selected, on the principle that
things going wrong are more remarkable than things going right. Nobody tells a story about
the day the movers did not break anything.

**Checked:** m0 118, m1 61, m2 66, m3 61, m4 59, m5 61, m6 66, m7 53, m8 38, m9 41, m10 45 —
669 assertions, all passing.

## Phase 9 — the destination — 2026-08-21

**Gate (§25.2):** "Unload, room zones, settled validation" → **manifest completes
reliably**. **PASSED** — 41 assertions (624 across ten suites).

**Hypothesis:** "reliably" is the word doing the work, and it means three separable things,
each asserted on its own: the whole manifest CAN complete, a completed delivery STAYS
completed, and nothing counts that should not.

**Measured**

| | delivered | in the right room |
|---|---|---|
| every object carried into its own target room | **23 / 23** | 23 (100%) |
| …then six identical objects swapped between rooms | **23 / 23** | 17 (74%) |
| one item taken back to the pickup site | 22 / 23 | contract not complete |

**THE DESIGN DECISION THIS PHASE HAD TO MAKE, because the GDD pulls three ways.**

- §3.4's Delivery phase exits when "required items settled in **valid** destination zones" —
  which reads as a **gate**: wrong room, no completion.
- §15.1 lists **room accuracy** as a scored line item with a "small perfect bonus" — which
  reads as a **price**.
- §12.2 restricts hard failure to four named conditions, and a lamp in the wrong bedroom is
  not among them.

Two of the three make it a price, and §2.1's "the game should rarely say no" breaks the tie.
**An object is delivered when it is settled anywhere inside the destination building; being
in the RIGHT room is a separate, scored fact.** A contract can complete with half the load in
the wrong rooms — it simply pays less. The alternative leaves a player who cannot find the
right bedroom holding a finished job the game refuses to accept, which is exactly the shape
§2.1 forbids. m9's D-series asserts it from both sides so the decision cannot be reversed by
accident.

**Room accuracy is a fraction of what was DELIVERED, not of the manifest.** An item still on
the truck is an undelivered item, not a room-accuracy failure. Counting it as both would
charge a player twice for one mistake.

**Added**
- `src/world/destination.js` — §13.1's "smaller site with 3-4 labeled room zones". 54 m²
  against the pickup house's 70 m², with its own front aperture and two interior doorways.
- Delivery, room accuracy and `deliveryStatus()` in `src/contract/manifest.js`, which reports
  what is outstanding and why, and never refuses anything.
- §24.4 validation that a manifest may not name a room that does not exist. Until this phase
  the `toZone` values were seams with nothing to resolve against.

**THREE FIXTURES THAT MEASURED THE WRONG THING**, all for the same reason — each changed
*where* objects were put, so each also changed *whether they fitted*:

1. Piling all 23 items into one room to test wrong-room delivery reported **12 of 23
   delivered**. That is a fact about the size of a 4.5 × 3.0 m room, not about room accuracy.
2. Rotating every item one room along reported **22 of 23** — the room populations stop
   matching what fits.
3. Swapping the target rooms pairwise still reported **22 of 23**, because it changes which
   object lands in which slot.

The fixture now swaps two objects **of the same definition** that were bound for different
rooms. Two identical objects are interchangeable, so the slots, the populations and every
other object are untouched; the only thing that changes is whether each is where the manifest
asked for it. Six swaps, 23/23 delivered, 74% accuracy.

**One regression, and it was correct behaviour arriving.** m5's §12.3 dwell test used a
*pickup* room as the delivery target, because when it was written the destination did not
exist. Now that `delivered` means "settled inside the destination building", the stand-in
stopped standing in and the assertion failed with `settled=true dwell 0`. The dwell mechanism
it tests is unchanged; only the address is.

**Checked:** m0 118, m1 61, m2 66, m3 61, m4 59, m5 61, m6 66, m7 53, m8 38, m9 41 — 624
assertions, all passing.

## Phase 8 — the drive — 2026-08-21

**Gate (§25.2):** "Route, turn/brake/bump, cargo coupling" → **poor pack shifts or damages
visibly**. **PASSED** — 38 assertions (583 across nine suites).

**Hypothesis:** §11.1 says "driving is the FINAL EXAM FOR PACKING, not a racing minigame",
which means the interesting output of a drive is what happened to the cargo. And §10.4 says
outcomes must "derive from physical contacts, velocity, damage, and constraints during
transport", and that a heuristic "must not secretly damage items without a physical cause" —
so the gate cannot be satisfied by reading a pack-quality score and subtracting condition.
The same route has to be driven twice and produce a worse result for the worse pack, through
nothing but forces on bodies.

**Measured — the same route, the same objects, two arrangements**

| | worst shift | items moved | damage | worst condition |
|---|---|---|---|---|
| good pack (heavy low, forward, strapped) | 0.470 m | 2 | **0.00** | 100 |
| poor pack (stacked high, loose, no straps) | **2.615 m** | 3 | **6.40** | 87 |
| **the poor pack, parked for the same 28 s** | — | — | **0.00** | **100** |

That third row is the assertion that matters most. The pack is identically bad and the
heuristic knows it — but nothing happens, because §10.4's physical cause is missing. The
damage in row two came from the road.

**Added**
- **§13.3's route** (`src/drive/route.js`): one hard brake, one meaningful turn, one bump,
  over 28 s. §11.3's three prototype-required hazards and no others.
- **The damage model reaching real contacts** (`src/damage/damage.js`), with §8.3's
  aggregation so a scrape is billed once rather than once per step, and §8.4's ledger lines
  naming the object, the condition change, the cost and where it happened.
- **`canDepart()` that advises and never refuses.** §3.4's Secure exit is "warnings
  ACKNOWLEDGED", not resolved, and §2.1 forbids the denial. A badly packed truck must be
  drivable or this phase has nothing to measure.

**THE BUG OF THE PHASE: the road forces were applied after the solver had already run.**
`drive` was registered after `physics`, so every §11.3 road force landed on bodies that had
been integrated already, and was then wiped by the next step's `clearForces` before it could
do anything. Measured: a completely unstrapped pack driven through the entire route shifted
**0.001 m**. The route ran, the events fired at the right times, the forces were computed
correctly and applied to the right bodies — and nothing in the world ever felt one of them.

Same shape as the Phase 3 force-persistence bug: the physics was right and the ORDER made it
invisible. Anything that applies force goes before the step; anything that measures the
result goes after.

**A measurement that could not discriminate.** §8.3's "a fragile television and a cheap box
should not share a generic hit-point curve" was first tested by dropping both from 2.4 m.
That is 6.9 m/s, which destroys both — the television takes 558 condition points and the box
127, both clamp at 100, and the result read "100.0 vs 100.0". The drop is now 0.18 m, or
1.88 m/s, which sits deliberately between the two bands: above the television's 0.70 m/s
tolerance and below the box's 2.00. The same knock now **ruins the television and does not
mark the box**, which is a far stronger statement of §8.3 than any ratio.

**Checked:** m0 118, m1 61, m2 66, m3 61, m4 59, m5 61, m6 66, m7 53, m8 38 — 583 assertions.

## Phase 7 — cargo — 2026-08-21

**Gate (§25.2):** "Interior, loading, stacks, anchors, straps" → **secured pack remains
stable**. **PASSED** — 53 assertions (545 across eight suites).

**Hypothesis:** §10.1 is the differentiator and it forbids every shortcut — "the cargo box is
a real collision-enabled space with floor, walls, roof, ramp, door, and anchor points.
NOTHING TELEPORTS INTO STORAGE." So there is no inventory in this phase, no slot list and no
load button. An object is in the truck when it is physically inside the truck.

**Measured — the gate, one §11.3 hard brake over the same six-item pack**

| | worst shift | items past tolerance | §10.4 heuristic |
|---|---|---|---|
| unstrapped | **1.645 m** | 1 | 100% unsecured, warns |
| strapped | **0.141 m** | 0 | 0% unsecured, quiet |

**Added**
- **A real cargo box** (`src/world/truck.js`): deck, two sides, headboard and roof as
  colliders, and a genuinely open rear — asserted as a point test in the doorway, because
  the first version pattern-matched collider bounds and the *roof* matched.
- **Six anchors**, three a side, spread along the length so strap ANGLE is a choice a player
  can get wrong (§10.3's "poor angle or tension permits shift").
- **Straps as one-sided ropes** (`src/cargo/straps.js`) with §10.3's four states, all four
  reachable and asserted.
- **Loading by physics** (`src/cargo/cargo.js`): §10.2's "crossing the cargo threshold AND
  settling inside the closed volume" — three conditions, each tested separately, plus the
  trip that moved each item.
- **§10.4's advisory pack quality**, and nothing consumes it but a warning.

**THREE BUGS, and every one was a number that made a state unreachable.**

1. **The strap was a bungee cord.** `stiffness: 2600` against `ratingNewtons: 3400` means a
   strap must stretch **1.31 m** to reach "overstressed" and **2.00 m** to fail — across a
   cargo box 4.20 m long. Two of §10.3's four states were unreachable. Stiffness is now
   derived from how far webbing actually gives at its rating (30 mm), and the rating from
   what the load demands under the worst §11.3 event, giving 40 000 N/m and a rating of
   1200 N. All four states now sit within 48 mm of each other.
2. **The first ratchet click snapped every strap.** The default increment was 60 mm, which
   against 40 000 N/m is 2400 N — above `failureNewtons`. `STRAP.ratchetStepM` is now 8 mm,
   about 320 N per click.
3. **The truck deck had a carpet's friction.** `addStaticFromColliders` hard-coded 0.8 for
   every surface, so an unstrapped pack survived a hard brake with a **2 mm** shift and
   straps had nothing to improve on. Surfaces now carry their own friction, and a deck is
   0.32 — which is the actual reason real loads get strapped.

**And one wrong definition.** "Secured" was measured as instantaneous strap tension, so a
perfectly strapped pack sitting still read as **100% unsecured** and §10.4's warning fired on
a good pack. A rope over a stationary load carries almost no force. It is now measured as
SLACK, which is the property §10.3's own state name refers to.

**§10.5's force proxies, used deliberately.** The truck does not move. §10.5 permits exactly
this — "browser driving may use truck-local simulation or FORCE PROXIES if full moving-world
physics is unstable" — and moving a kinematic box of sleeping rigid bodies at 13.5 m/s is
that instability. Road events apply the pseudo-force cargo feels in the truck's frame, which
is the same physics seen from the seat. §11.3's severity values are already written as
impulse multipliers, so the GDD had made this call already.

**Checked:** m0 118, m1 61, m2 66, m3 61, m4 59, m5 61, m6 66, m7 53 — 545 assertions.

## Phase 6 — tools — 2026-08-21

**Gate (§25.2):** "Dolly, protection, ramp, disassembly" → **each solves a physical
problem**. **PASSED** — 66 assertions (492 across seven suites).

**Hypothesis:** §9.1 says tools "create new physical solutions; they do not erase physics",
and that "better tools should introduce both new mastery and new accidents". The way to
honour both sentences at once is to make each tool change exactly ONE physical quantity and
then get out of the way — so that its benefit and its failure mode are the same change seen
from two sides, rather than a permission with a penalty stapled to it.

| Tool | Changes | Benefit | Failure mode, and it is the same change |
|---|---|---|---|
| Flat dolly | friction | rolls on the flat | rolls downhill just as well |
| Moving blanket | impact tolerance | survives more | softer to hold, and sheds |
| Loading ramp | clearance | bridges the deck | laid short, it leaves a lip |
| Screwdriver | dimensions | packs smaller | loose parts to lose |

**Measured — every tool against a baseline where the problem is unsolved**

| Claim | without | with |
|---|---|---|
| couch hauled 3 s, one mover, one hand | **0.00 m** | **2.12 m** |
| fridge (110 kg) hauled the same way | **0.00 m** | **1.49 m** |
| dollied load on the 16° ramp, peak speed | 0.50 m/s | **2.97 m/s** |
| TV condition lost by a 1.5 m/s knock | **72.0 pts → cracked** | **0.0 pts → perfect** |
| mover height reached at a 1.20 m deck face | **0.01 m** | **1.22 m** |
| bookshelf packed volume | — | **−80%** |

**The honest negative, asserted rather than glossed.** Disassembly does not make anything
fit through a door it did not fit through before. All six disassemblable objects already
clear the tightest opening on their route (0.86 m) by at least 160 mm, and the one genuinely
tight object — the couch at 0.850 m against 0.860 — has no authored disassembly path at all.
The wardrobe's real constraint is its 2.00 m height against a 2.03 m opening, which taking
the doors off does not touch. So the measured payoff is **packed volume**, which feeds
Phase 7's one-trip question, and m6 E8 asserts the negative so a later phase cannot quietly
claim the clearance win instead.

**THE BUG OF THE PHASE: an object's declared friction is not what it experiences.**
Rapier COMBINES the two colliders' coefficients and the default rule is AVERAGE. The ground
is 0.9, so `couch_3seat_01`'s declared 0.35 is really an effective 0.625, and the "309 N of
resistance" this project has quoted since Phase 3 is actually 552 N.

It surfaced because it made the dolly useless. Dropping an object from 0.35 to 0.04 should be
an 8.75× cut; averaged against a 0.9 floor it is (0.04+0.9)/2 = 0.47, a cut of 1.3×. Measured
before the fix: a couch hauled for three seconds moved 0.20 m bare and 0.36 m on the dolly,
and the fridge did not move at all either way. The tool was correct and invisible. A probe
found it in one run — 400 N applied to the parked couch moved it **14 mm in two seconds**,
where 400 N against 309 N should accelerate at 1 m/s².

**The fix is deliberately narrow, and that is a judgement call worth recording.** Switching
every object to `Min` is the more principled rule and was tried first. It also re-tuned four
phases of validated behaviour at once: m2 lost a released box at 40 m/s and m3 lost a grab,
both green since Phase 2. Phases 2–5 tuned friction, drag force, grip stretch and knockdown
thresholds *by measurement* against the averaged value, so the game is correctly tuned and
only the arithmetic in the comments was wrong. The rule therefore stays at Average, and
`attachDolly` switches that one object to `Min` for as long as the dolly is under it — which
is exactly what a dolly claims: this contact is now governed by the wheels, not the floor.
The Unity rebuild (§24) should start with `Min` and re-tune against it.

**Second fix: you cannot walk faster than what you are towing can follow.** A hand is a
spring, so a towed object trails it by about v/ω where ω = √(k/m). At the full 3.1 m/s
against the couch's ω of 3.16 that is ~0.98 m of lag against a 0.70 m tear threshold, so
dragging tore the grip within a metre — and the dolly could not fix it, because a dolly
removes resistance but not inertia. `GripSystem.towSpeedLimit()` now derives the limit from
what is actually held: 3.85 m/s for a 9 kg box (never binds), 1.22 for the couch, 1.10 for
the fridge. That is §6.3's carry tiers expressed through the legs instead of a number on
screen, and it is why dragging works at all now.

**Item damage rewritten from impulse to impact SPEED.** The old bands were
`impulseThreshold` / `conditionPerImpulse`, and impulse is m·Δv — so an object was more
fragile for being heavy. Setting the 90 kg couch down at a gentle 0.5 m/s cost 55 condition
points and cracked it, while a 9 kg box at twice the speed stayed perfect. §8.3 exists to say
the opposite. Mass moved to where it belongs: `DAMAGE.property` is keyed on impulse, because
what a *wall* suffers really does scale with the mass that hit it, and §15.1 prices the two
as separate line items anyway.

**Checked:** m0 118, m1 61, m2 66, m3 61, m4 59, m5 61, m6 66 — 492 assertions, all passing.

## Phase 5 — the house puzzle — 2026-08-21

**Gate (§25.2):** "Pickup, 15-25 objects, manifest and zones" → **all objects recoverable
and movable**. **PASSED** — 59 assertions (424 across six suites).

**Hypothesis:** the contract becomes a place rather than a test range when the objects live
in rooms that constrain how they can leave. The gate is deliberately about the OBJECTS, not
about the architecture: a house full of furniture is worth nothing if one item is welded
into a wall or can be lost for good, so both claims are asserted for every one of the 23
objects rather than for a sample.

**Added**
- **The house.** `src/world/house.js` subdivides the Phase 1 shell into living room,
  kitchen and bedroom, with two interior openings **on perpendicular axes** — §13.1's
  "doorway turn". Openings are cut out of the partitions by `wallSegments()`, so the visible
  gap and the collider are generated from one record and cannot disagree (§8.1).
- **§13.2's manifest, in full.** 23 objects: 9 cardboard boxes, 5 small furniture, 3 medium,
  3 large, 2 fragile/high-value, and the fridge as the showcase item. Every count lands
  inside §13.2's own table, asserted by A11-A16. Twelve new object definitions, from a 5 kg
  floor lamp to a 110 kg fridge, with replacement values spanning 40 to 1250 — the spread
  §8.3 needs when it says "a fragile television and a cheap box should not share a generic
  hit-point curve".
- **Zones and the manifest** (`src/contract/manifest.js`), implementing §12.3's delivery
  test: substantially inside the right zone, settled, for a dwell. All three parts matter
  and each is asserted separately.
- **Object recovery** (§18.3). An object that leaves the world comes back on the transform
  it was last genuinely settled on. §2.2 makes this a requirement rather than a nicety: a
  dropped object must be "somewhere inconvenient", not gone.
- **Content validators that run in the shipping build**, not only in the suite (§24.4:
  "incorrect colliders, zones, anchors and manifests will dominate production bugs").

**§12.3 "substantially inside" is a FRACTION, and that is a design decision.**
Requiring full containment would make a couch undeliverable to a small room, because it will
legitimately overhang the doorway it came in through. That is an accidental hard denial of
exactly the kind §2.1 forbids, arriving through a geometry check nobody thinks of as a rule.
`MANIFEST.containedFraction` is 0.6, and E4/E5 assert the rule from both sides.

**Measured — the gate**

| | result |
|---|---|
| objects that two movers could not shift | **0 of 23** |
| hardest to shift | couch_3seat_01, 0.374 m (threshold 0.15 m) |
| objects that could not be recovered | **0 of 23** |
| couch clearance on the route to the bedroom | **10 mm** |

**THE BUG OF THE PHASE was in the test, and it was a good one.**
The first run reported 17 of 23 objects immovable — including boxes weighing 9 kg. The
objects were fine. Every object was being staged for its movability test at the same
coordinate and left there, so by the fourth test the pad held a heap of furniture and each
new arrival spawned inside it. The couch and armchair "passed" only because they went first.
Each object now gets its own slot on an 8 m grid and everything is restored to its spawn
afterwards, so the later sections do not silently test a house whose contents are all in a
field 40 m away.

Two smaller ones, both worth the same lesson — assert the design, not a proxy for it:
- §13.2 category counts were being INFERRED from mass class, which put the framed mirror in
  "small furniture" (it is light and small) and pushed that category one over its ceiling of
  5. The mirror is §13.2's fragile/high-value row. The design table and the §6.3 mass bands
  are different axes; definitions now declare `category` and the suite asserts against that.
- m2's "grab a box" test took `entities[0]`, which was a box only for as long as the Phase 2
  spawn list was the only one. It is now the couch, in the living room, behind a wall. The
  grab correctly found nothing. A test that depends on spawn order is asserting something it
  does not mean to.

**A second content bug, caught by reading rather than by running.** Two of the twelve new
definitions declared `fragility: 'very_fragile'` — a band that does not exist. `DAMAGE`
defines `sturdy | normal | fragile | extreme`, and `validateDef` did not check the field at
all. The two definitions were `tv_55_01` and `mirror_framed_01`: the $900 television and the
$480 mirror, the two most valuable breakable objects in the contract. Nothing would have
thrown. Phase 8's damage lookup would have found `undefined` and either skipped them or
crashed on first contact, so the two items whose damage matters most would have been the two
the damage model did not cover — surfacing only when a $900 television turned out to be
indestructible. Both now declare `extreme`, and `validateDef` checks the fragility band and
the §13.2 category, with m5 F5/F6 asserting it. Third time §24.4's "build content validators
early" has paid for itself in this file.

**Checked:** m0 118, m1 61, m2 66, m3 61, m4 59, m5 61 — 426 assertions, all passing.

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
