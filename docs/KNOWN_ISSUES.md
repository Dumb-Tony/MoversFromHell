# Known issues and open design questions

Required by GDD §25.1. "Known limitations are explicit and do not undermine the phase's
learning goal" (§25.3).

---

## RESOLVED (Phase 11 M8) — the couch and the tight doors

**Status: decided and built. Option 1 with the GDD's other key.** The couch is still 2.10 × 0.90 ×
0.85 m and its narrowest intact presentation is still 0.850 m in every orientation (m0 C3-C11).
What changed is that §7.1's own example finally exists: `couch_3seat_01` has `disassembly: [legs]`,
80 mm of leg, and with the legs off its narrowest presentation is 0.770 m.

| Doorway | Clear width | Couch intact | Couch, legs off |
|---|---|---|---|
| 32" interior (0.82 m) | 0.82 | cannot pass — short by 30 mm | passes on its side, 50 mm |
| 34" (0.86 m) | 0.86 | passes on its side, 10 mm | passes on its side, 90 mm |
| 36" front door (0.91 m) | 0.91 | side 60 mm, face-on 10 mm | side 140 mm |

Asserted in `tools/m6-tests.js` E14 (geometry), E15 (collider) and E16 (physics: at 0.82 a 600 N
push takes the legless couch clean through and stops the intact one at the outer face with 0.0 mm
penetration). Taking the legs off costs 60 s on the labour clock (§8.2 "preparation time", §2.3),
so §3.3's two approaches are both priced: prepare (a minute) or brute it on its side with 10 mm.

The couch now STARTS in the kitchen (`PHASE5_SPAWNS` row 0, 2.50 / −8.40), so its route to the
truck is the 34" door then the 36" front door — the doorway turn house.js was built for is on the
shipped contract at last, not demonstration geometry. The 32" opening remains on the front wall,
off every route, as the legible example of a clearance the legs unlock.


**Addendum (Phase 20, M11).** The 0.82 m figure this question was about IS the 0.86 m door with its 40 mm leaf hung: four doorways now have their doors on (interior32 0.78 hung / 0.82 off, door34 0.82 / 0.86, living_kitchen 0.82 / 0.86, kitchen_bedroom 0.87 / 0.91), the screwdriver takes a leaf off its hinges for 45 s of labour, and the couch's three approaches at the turn are all real: legs off (90 mm), door off (10 mm intact on its side), or both (140 mm at the front door).

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
which is the no-hard-denial claim the gate actually makes. Candidate levers: `GRIP.maxStretch` against `GRIP.spring` — a braced band of 0.77 m was tried
in Phase 11 M7 and bought nothing (0.00 m); a traction budget before the pull was tried in the
same milestone and bought nothing usable (see the Phase 16 open items); `CARRY.dragForceRef`
and a kinetic < static friction remain untried. The world-frame damping term was the
binding limit; M10 damps in the hand's frame and the solo drag travels (0.34 m in 3 s).
`CARRY.dragForceRef` remains the only untried lever.

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
## Phase 4 open items

**A two-mover couch lift clears the floor by 11 mm, and the ceiling is structural.** The
gate's claim — one hand cannot lift a couch, two can — is true and measured (458 N vs 895 N
against 883 N of couch). But the margin is thin, and the reason is not accidental. A hand is
a `GRIP.spring` = 900 N/m spring, so two of them need 883/1800 = **0.49 m of stretch merely
to break even**, out of the **0.70 m** `GRIP.maxStretch` allows before the hold tears. The
entire usable lift band for a couch is therefore about **0.21 m**, and rotation eats into it.
Two movers can get a couch off the ground and over a doorstep; they cannot lift it onto a
table. This is a `GRIP.spring` / `GRIP.maxStretch` question for a tuning pass, not a
cooperation one — the forces combine exactly as they should. Nothing above Phase 5 depends
on it, but §7.2's truck deck will.

**Two movers, one keyboard.** §14.2 wants real multiplayer; what exists is Tab to swap which
mover you drive, with the others holding position and keeping their grips. That is enough to
test §6.4's force combination, which is what §25.2's Phase 4 gate asks for ("second actor
**or test harness or command model**"), and the seams §22.4 demands are all in place —
stable string ids, serializable state, no ownership field on any object. It is not enough to
judge whether co-op is FUN, which needs two humans and is a later question.

**An unattended mover is a statue that happens to be strong.** It braces and holds, and does
nothing else. It will not step back to take weight, will not follow, and will not let go when
it should. That is deliberate for this phase — a partner with any autonomy would make it
impossible to tell whether the force model or the AI produced a result — but it means the
"two movers carrying a couch through a door" scenario cannot be exercised yet. Phase 5's
house is where that starts to matter.

**Solo dragging is still weak (carried over from Phase 3).** Phase 4 did not fix it, and the
Phase 3 note stands. Two movers now make a couch tractable, which is the §6.3 outcome, so the
pressure to fix solo dragging has dropped — but it has not gone away, because §6.3 explicitly
allows "one drags or pivots" as a valid option and right now that option shuffles.

**The lift ramp in the tests is not a control scheme.** m4 raises hands by writing
`holdLocal` directly. A player has no way to do that — there is no "lift" input, only aim and
grab. Raising the hands is currently a side effect of looking up, which is why the tests
manipulate the hold offset instead of the camera. Whether lifting deserves its own input is a
§4.2 control-map question that Phase 6's tools will force an answer to.

## Phase 5 open items

**The doorway turn has never been driven by a human.** The layout forces a 90-degree change
of heading between two openings 3.2 m apart, with a 2.10 m couch — on paper that is §3.3's
"preparation versus brute force" with both branches open, and m5 proves the couch can
geometrically reach the bedroom with 10 mm to spare. Whether pivoting it round that corner
is *satisfying* or merely *fiddly* is the single most important open question in the
project, and it cannot be answered by a test. It is the first thing to put in front of a
playtester.

~~§8.2's second answer to the turn exists; the third does not.~~ **Closed in Phase 20 (M11): the third answer exists — door leaves come off their hinges.** Pivot it (Phase 5), or unscrew
the couch's legs (Phase 11 M8: 90 mm at the 34" door for 60 s of labour). Taking a door off its
hinges is still unbuilt — no door leaf exists as an object anywhere (docs/PHASE11_PLAN.md,
"Deliberately not now"). §3.3's "at least two approaches" now holds at the turn with two, not three.

**Destination zones are named and unbuilt.** Every manifest row carries a `toZone`
(`dest_living`, `dest_kitchen`, `dest_bedroom`) because §12.1 defines a manifest as
"required objects, destination zones, special handling" and leaving a third of that out
would mean changing the shape later. Nothing reads it — the destination site is Phase 9.
`stepManifest` deliberately does nothing for a row whose zone does not resolve, so no object
can be accidentally marked delivered before there is anywhere to deliver it to.

**Objects are still boxes.** Every definition renders as a coloured cuboid matching its
collider exactly. That is §20.4's diagnostic-visuals rule working as intended, and it is
also why the floor lamp reads as a tall thin box rather than as a lamp. Faithful collision
is the mandate (§13.4: "collision-faithful proportions are mandatory"); silhouettes come
with the art pass, which is Unity-side.

**Recovery is free.** §18.3 restores an object to its last settled transform at no cost. It
should be a §15.1 line item — a callout fee — and `state.recoveries` is counted per object
so Phase 10 can charge for it. Until then, dropping something off the world is a fast
teleport rather than a mistake, which is the wrong incentive and is fixed by the invoice.

**The 32" opening is still impossible for the INTACT couch, on purpose — and possible with the
legs off.** m5 B8 and m6 E14c keep the intact fact; m6 E14/E16 add the legs-off one (50 mm; through
at 600 N). It is on the front wall, not on the route, so it still denies nothing; it is now the
example of a gate with a key rather than a hole.

## Phase 6 open items

**The friction combine rule is Average everywhere except under a dolly.** Rapier averages the
two colliders' coefficients, so every object's declared friction is roughly (its own + 0.9)/2
against the floor — the couch's 0.35 is really 0.625, and 309 N of resistance is really
552 N. `Min` is the better rule and was tried; it re-tuned four phases of measured behaviour
in one edit (m2 lost a released box at 40 m/s, m3 lost a grab). The game is tuned correctly
because it was tuned by measurement; only the arithmetic in the comments was wrong, and those
are now corrected in place. **The Unity rebuild should set `Min` from the start and re-tune
against it.** Until then, treat every friction number in `definitions.js` as a coefficient to
be averaged, not as a force.

**Solo couch drag travels, slowly and by design (Phase 11 M10, measured).** One hand, unbraced, 3 s:
0.34 m, held throughout (2.45 m in 10 s, force ~620–680 N against 552 N of floor friction, no
stumble); on the dolly 6.52 m; two movers one hand each 5.09 m. The grip now damps in the hand's
frame (`c · (v_object − v_hand)`), the tow cap knows the object's effective floor friction and adds
the pull's haul-back (`CARRY.tractionN` 350 / `braceTractionN` 380), and the band caps the legs'
ACCELERATION at 0.74 m/s² for the couch — most of the first three seconds is the ramp. Two things a
tester will notice: (1) **bracing while towing is an anchor, not a faster drag** — +0.02 m along the
haul in 3 s, 0.45 m in 10 s, never torn: a braced mover's legs walk at 0.76 m/s against a 0.69 m/s
haul-back, netting ~0.03 m/s. Making braced the faster technique needs ≥ 430–450 N of braced
traction and that topples the fridge (420 N: on its side at 6.8 s; the rows are in
`tools/_probe-drag.js`'s default run). (2) **The fridge can be toppled by one mover who grabs it
high.** At the harness's 0.875 m grab it never tips in 10 s (445–457 N stall, tilt 0.0°); grabbed
at 1.2 m — where a player looking at it aims — the tipping force is 315 N, and a lone unbraced pull
tilts it 5.9° in 3 s and topples it at 6.9 s. It still cannot be dragged (745 N of friction, on its
side too), so "beyond one hand unaided" survives as a §2.2 consequence rather than a denial; not
prevented, on purpose.

**Tools have no interaction verb yet.** §9.2 requires deploy/attach/tension/fold/retrieve
"through the common interaction system", and the `interact` binding (E / pad X) already
exists in `src/core/input.js`. What does not exist is the code that reads it, finds what is
under the reticle, and calls the right ToolSystem method. Every tool in m6 is driven by
calling the API directly. The physics is real and asserted; the *player* cannot use any of it
yet. This is the single biggest gap in Phase 6 and it is the first thing Phase 7 needs, since
straps are useless without a way to attach them.

**§9.2's placement preview does not exist.** "Placement provides a readable preview and
valid/invalid affordance." The ramp computes its lip and alignment (`rampGeometry`) but
nothing draws it, so a player would find out the ramp was badly laid by walking into the step.

**Damage is modelled but not applied.** `conditionLossFor()` is exact and asserted, and the
blanket measurably changes it, but nothing yet reads contact events and calls it. That wiring
is Phase 8's gate ("poor pack shifts or damages visibly"), and doing it here would have been
building ahead of the build order.

**Detached parts are recorded, not spawned.** §9.1's failure mode for the screwdriver is
"loose pieces get lost", and `state.removedParts` records what came off so it CAN be lost —
but the doors do not become real bodies you have to carry. That is honest for the gate as
written (the payoff asserted is packed volume) and it is a smaller version of §7.4's
"every broken state must remain movable and completable" than that section deserves.

## Phase 7 open items

**Straps are invisible.** §10.3 asks the game to "render the line, anchor validity, tension,
and overload risk", with a colour per state — sagging grey, straight teal, orange pulse. None
of that exists. The four states are real, asserted and event-emitting, and a player would see
absolutely nothing. The Phase 7 screenshot draws the strap lines in its own setup script,
which is honest for a documentation frame and is called out here so nobody mistakes it for a
feature.

**Nor is there a way to attach one.** Same gap as Phase 6's tools: `interact` is bound and
unread, so every strap in m7 is created by calling the API. §10.3's whole interaction — select
endpoint A, aim at B, confirm, tension — is unbuilt. Phases 6 and 7 have now both deferred
this, and it is the single largest block of missing work in the project.

**The truck does not move, and will not in Phase 8 either.** This is a deliberate reading of
§10.5's "browser driving may use truck-local simulation or force proxies if full moving-world
physics is unstable", and it is recorded here rather than buried because it is a real
divergence from the naive reading of §11. Road events apply the pseudo-force cargo feels in
the truck's frame. What this DOES cost: the world does not go past the windows, the drive has
no route to steer along, and §11.2's "readable body roll" has nothing to roll.

**A closed door is not modelled.** §10.2: "A closed door contains objects but does not
prevent movement or damage." The rear is permanently open. Nothing currently stops a hard
brake in reverse throwing the load out of the back, because there is no back.

**Pack quality ignores stacking and fragility.** §10.4's heuristic reports unsecured mass and
centre-of-mass offset, which is enough for a warning. It does not know that the TV is under
the dresser, and §7.1's `cargoHints` (`heavy-low`, `no-stack-on`, `upright-only`) are authored
on every object and read by nothing.

**Anchors are geometry, not validated endpoints.** §10.3 wants "anchor validity" — a strap
should refuse an endpoint that is out of reach or the wrong side of the load. Any anchor can
currently be paired with any point on any entity, including through a wall.


## Phase 8 open items

**The drive has no driving in it.** §11.2 asks for "arcade-accessible steering with readable
body roll, braking distance, and wide turns" and none of that exists. The route is a timeline
of three force events; the player does not steer, brake or choose a speed, and §11.2's
`imbalanceSteerPenaltyMax` — "poor balance modestly affects steering and braking" — is
declared and unused because there is no steering to affect. This follows from the §10.5
force-proxy decision recorded in Phase 7, and it is the largest single thing §11 asks for
that this build does not do.

**Damage is measured as speed lost per step, not from contact manifolds.** It is unambiguous,
cannot fire on a resting contact, and is exactly what §8.3's "contact energy" means for an
item — but it cannot tell you WHAT was hit. §8.4 wants "object/location, category", and the
location recorded is the damaged object's own position rather than the surface it struck.
Property damage (§15.1's separate line item, keyed on impulse) is therefore configured and
unbuilt: there is no way yet to charge for a scraped wall.
Since Phase 21 (M14) the ITEM ledger still works this way, and the PROPERTY ledger reads the narrow
phase for the one step an object loses speed: the surface whose manifold pushed hardest that step
takes the object's whole m·Δv (`damage.js _attributeProperty`, `physics.tagOf`). A scraped wall
costs (impulse − 12) × 1.6, up to 400 per surface.

**One drive, one direction, no reverse.** §11.3's hard brake always throws cargo forward, so
the headboard takes everything and the open rear door never matters. A pack that would spill
out of the back on a reversing manoeuvre is currently safe by omission.

**The good pack still shifted 0.470 m.** That is above `CARGO.shiftToleranceM`, which means a
well-packed, strapped load still moves further than it should. The gate is comfortably passed
because the poor pack shifts 5.6x further, but "secured" is not yet "solid". Likely causes:
two straps per item is thin for a 110 kg fridge, and the hook points are chosen by the test
rather than by a player who can see what they are doing.

**Nothing renders any of it.** No route progress, no §11.2 "coarse cargo-status indicator",
no §8.4 "small cost notice" at impact, no condition icons. The drive currently happens
entirely in the log.

## Phase 9 open items

**Nobody carried anything.** The manifest completes because the suite teleports 23 objects
into the destination and lets them settle — which is the right way to test the VALIDATION,
and is not a test of unloading. §25.2's build outcome says "unload", and unloading is
carrying, which needs the interaction work Phases 6 to 8 have all deferred. What is proven is
that delivery detection is correct, stable and honest; what is not proven is that a person
can do it.

**No unload order, and no access-order consequence.** §10.2 says "heavy-low, fragile-protected,
stable-base, and UNLOAD-ORDER strategies emerge from consequences", and there is no
consequence for packing the first item you need at the front of the truck. The cargo box has
one door and everything in it is equally reachable, because nothing has to be reached.

**The destination has no truck.** The truck is parked permanently at the pickup driveway.
There is no second parking position at the destination, so §8.1's "park position should
affect ramp angle and carry distance" has no second instance to be true of, and the carry
from the truck to the destination door does not exist.

**Room labels are lime pads on the floor.** §13.1 asks for "labeled" zones and §21.2 wants
contract UX that can name a room. What exists is a marker in the middle of each room and a
`label` string nothing renders. A player has no way to learn which room is the bedroom.

**Delivery is site-level by decision, and the decision is reversible.** If playtesting says
wrong-room delivery should block completion, the change is one predicate in `stepManifest`
and the inversion of m9's D1. It is recorded here because the next person will have an
opinion and should know it was a choice rather than an oversight.

## Phase 10 open items

**~~There is no invoice screen.~~ CLOSED in Phase 11.** §21.2's contract UX now exists in
`src/ui/invoiceScreen.js`, and `docs/phase11-playable.png` is the shipping build's own HUD
rather than a panel drawn by the screenshot script. Kept here because the arrangement it
describes — screenshot-rendered content standing in for a missing UI — was also used for the
Phase 7 strap lines, and the Phase 7 note is still open.

**~~Property damage is priced and unbuilt.~~ CLOSED in Phase 21 (M14).** `DAMAGE.property` exists, keyed on impulse
because what a wall suffers really does scale with the mass that hit it, and §15.1 lists it
as its own line. Nothing writes to `ledger.propertyDamage`, because Phase 8's damage system
measures an object's own lost speed and cannot say WHAT it hit. So a scraped wall is free,
which is the single largest hole in the economy: §8.2's whole "preparation versus brute
force" trade assumes wrecking the hallway has a price.
`ledger.propertyDamage` is written by `damage.js` (one line per entity-and-surface window, capped per
surface), billed by `invoice.js` ("N impacts on K surfaces", one citation per entry, `reconcile()`
refuses a mismatch), reviewed (`marked_the_walls`), counted (`propertyEvents`), noticed ("front wall
— scuffed · 30.82") and marked (a 24-quad scuff ring). A 9 kg box at 4 m/s into the front wall costs
30.82; a wall stops at 400.00 (m22 PD2, PD6).

**Tips, and the customer archetype behind them, do not exist.** §12.1 lists "customer
archetype" and §15.2 says reviews assemble from "event tags, outcome, and CUSTOMER
PERSONALITY". The invoice accepts a `tips` argument and nothing ever passes one, and every
customer is the same customer.

**Reputation is not modelled.** §15.1: "Reputation is separate and uses timeliness,
completion, damage ratio, special constraints, and customer tolerance." The grade computes
three of those five and is not persisted anywhere. §16.1's progression loop needs it.

**~~The prototype route is 4.2 km of constant.~~ Fuel is per leg, and legs are derived (Phase 21, M13).**
`vehicle/fuel` bills 2 × tripCount − 1 legs of `ECONOMY.routeDistanceKm`: 1 leg −13.44, 3 legs −40.32.
The leg count is DERIVED from the trip count because settlement can only happen at the
destination; if the crew is ever allowed to settle at the pickup house (§3.4 "crew elects"),
`legsDriven()` in invoice.js must become a recorded count incremented per arrival — the comment
beside it says so. The distance is still a config value, not a measured drive.

**~~One-trip is assumed, not enforced.~~ One trip is a choice now, and the second trip is priced
(Phase 21, M13).** The cab at the destination offers "drive back for N more" (E) beside "settle up
— leave N behind (N × 60.00)" (Q) whenever manifest rows are away — not on the truck, not in any
destination zone, or with a loose piece that is neither. A return is a phase event on the same
route (three hazards again, 28 s, on the labour clock); the one-trip bonus is earned only when
tripCount is 1 at a complete settlement (m21 T6/T8). Left open: an item dropped on the road
between the truck and the destination house counts as "away"; the kerbside apron is "site".
`ECONOMY.leftBehindFee` is a product number (60 — see config.js and PLAYTEST_NOTES).

**Nothing is saved.** §23.4 asks for save data and §13.4 permits "a saved best invoice, cash,
and reputation stub". The invoice is computed and discarded, so replaying a contract cannot
yet be compared to the last attempt — which is most of what makes §19.1's replay sources
work.

---

## Phase 11 open items

**One mover plays; the other is driven by Tab.** §6.4's two-mover cooperation is real in the
physics — two grips combine on one couch, and the suites assert it — but there is one
keyboard, so cooperation means swapping between them rather than acting at once. Everything
under it is multiplayer-shaped already (§22.4: stable string ids, serializable state,
systems observe rather than own), so this is an input limitation, not a model one. It is the
single biggest gap between what the build simulates and what the GDD describes.

**The grip hint and the interaction prompt can overlap.** Both render near the reticle: the
grip hint from §5.1's carry state, the prompt from §9.2's verb. When you are carrying a tool
*and* looking at something grabbable, the two lines collide — visible in
`docs/phase11-playable.png`, where "hold LMB / RMB to grab" sits over the carry line. §21.1
only constrains persistent panels to screen edges and says nothing about the centre. Needs a
layout rule, not a code fix.

**`game.reset()` replaces `game.state` wholesale.** So the contract's entity list lives
outside it, and the manifest and the local player record are re-attached explicitly after
every reset. This works and is asserted (m11 G-section), but it means there are two places
that must agree about what a contract *is*. Worth collapsing into one before the Unity port,
while the seam is still small.

**The interaction probe is a single ray.** §4.1 asks for "generous aim assistance for hand
targeting". Small tools get a size-scaled tolerance (`_toolNearRay`) because a 50 mm
screwdriver is genuinely unpointable, but everything else is hit-or-miss on one ray. A cone
or a small sphere cast would be truer to the GDD; the tolerance hack was the cheap version
and should be replaced rather than extended.

**~~No rebinding, and the keys are hard-coded.~~ Closed in Phase 23 (M18): Settings → Controls rebinds every on-foot action per player, validated by the conflict checker and saved as diffs — see the Phase 23 entry.** ~~E, Q, Tab, R and F3 are literals in
`main.js`'s key handler rather than a binding table. Fine for a prototype with one tester,
wrong the moment anyone else plays it, and an accessibility problem regardless (§26.5 cares
about readability but the GDD has no input-remapping requirement — it should).~~

**The settlement screen is the only place the invoice appears.** There is no way to look at
the ledger mid-contract, so the §8.4 cost notices are the only in-flight feedback about what
damage is costing. That is probably correct for tension and definitely untested.

---

## Phase 12 open items

**Two players, not four.** §14.1's production target is 1–4. `COOP.maxSeats` is 2 and it is
not the only thing in the way: `MOVERS.count` is 2, the split layout halves rather than
quarters, and nothing has been measured with three. Raising the cap without doing the other
two would produce a third seat with no body to drive.

**~~One keyboard, so cooperation means Tab-swapping.~~ CLOSED by this phase** — kept because
Phase 11's entry pointed at it as the biggest gap between what the build simulates and what
the GDD describes, and because the replacement limitation is narrower but real: co-op is
LOCAL only. §14.1's actual production target is online 1–4 with Steam lobbies, and nothing
here is networked. The seams §22.4 asks for are all still open (stable string ids,
serializable state, systems that observe rather than own), and `Input.seat(n)` is
deliberately duck-typed so a command stream can arrive the same way a keyboard does — which
is the shape `TowBros\src\net\commands.js` already sends over a wire.

**Seat 1's keyboard fallback is cramped, and honestly so.** A 3D game with two grips, four
look directions and eleven verbs wants a controller. Seat 1 has one — §4.3's full pad map,
asserted for parity in m12 A5/A6 — and the keyboard block (arrows, UHJK, `[`/`]`, `'`, `;`)
exists so co-op is playable and testable with no hardware at all. It is not pleasant. The
right fix is not more keys; it is a shared-camera mode that needs no per-player look at all,
which is a design change rather than a binding change.

**The split is fixed at side-by-side.** `COOP.layout` accepts `'stacked'` and the layout
maths and tests cover both, but nothing exposes it to the player and the choice has not been
playtested. On an ultrawide, stacked is probably right and there is no way to ask for it.

**Nobody owns the cab.** Two players can both press E at the truck; the route's state machine
makes the second press a no-op, so it is safe (m12 G2/G3), but there is no `driverId` and
therefore no answer to "who drove". §15.2's contribution stats already split credit for
straps, recoveries and heaviest-moved; the drive is the one contribution that is nobody's.

**A seat's notices are addressed, but its DAMAGE is not.** §8.4's cost notices are raised by
the damage system, which knows which object was hurt and not which player was carrying it.
Both halves therefore show every cost. That is arguably right — the bill is shared — but it
is a default rather than a decision, and it means neither player learns which of them keeps
dropping the television.

**The help line crosses the divider.** It is shell chrome rather than either player's HUD, so
it is centred on the window and sits across the split. Same class of problem as the Phase 11
reticle crowding: §21.1 constrains persistent panels to screen edges and says nothing about
what happens when there are two screens' worth of edges.

---

## Phase 13 open items

**~~Lambert everywhere.~~ CLOSED the same day** — and the diagnosis in this entry was wrong,
which is why it is kept. It blamed the light count; the cause was that `MeshLambertMaterial`
shades PER VERTEX, so a two-triangle wall's lighting was computed at four corners and
interpolated. Adding the lamps this note implied would have changed almost nothing. See the
changelog.

**Still no ambient occlusion, and the stand-in is fragile.** The contact darkening at the
floor and ceiling is BAKED INTO THE PLASTER TEXTURE, which only works because every wall in
the house is exactly `ROOM.wallH` tall and the material maps the gradient once over that
height. A room with a different ceiling height puts the dark band across the middle of the
wall. It is a correct-looking cheat with a tripwire in it; a real AO pass removes both.

**One shadow cascade for the sun, 2048 over a 40 m box** — about 20 mm per texel, tightened
from 25 mm in this pass. Contact shadows under a box are still soft. A second tight cascade
around the player is the fix, and it costs a shadow pass, which the measurements in the
changelog say is the expensive kind of thing.

**The quality tier is a cliff, not a slope.** `detectRenderTier()` returns 'gpu' or
'software' and nothing between, so a weak-but-real GPU gets the full four shadow maps and
ten lights. §26.6's 45 FPS floor is not actually measured anywhere — the headless harness
runs under `--virtual-time-budget`, where `performance.now()` does not advance during
synchronous work, so FRAME TIME IS UNMEASURABLE THERE even with `gl.finish()`. Every
performance claim in this project is a structural proxy (draw calls, triangles, light and
shadow counts) or a wall-clock suite runtime. A real frame-rate number needs a real browser.

**The interior is unfurnished beyond the manifest.** The rooms have plaster, floorboards and
the 23 objects that are being moved, and nothing else — no light fittings, no skirting, no
switches, no curtains. It reads as a house being emptied, which is lucky rather than
designed, and it will read as a bare box the moment anything is delivered INTO it (§13.1's
destination especially).

**The truck is one livery.** §16.1's progression loop implies a fleet, and the texture is
keyed by a single cache entry with the company name baked in. Fine now; a second vehicle
means parameterising `texTruckSide`.

**~~The mover's arms do not reach for what they are holding.~~ CLOSED in Phase 14** — arms
pitch and lean toward the grip and the lime hand-cubes sit on the grip points. What remains
open from the same entry: no doors swing, no wheels turn while the route runs, the trees do
not move. And the reach is inverse POINTING, not IK — elbows do not bend, and a grip behind
the mover clamps rather than turning the torso (§24.2's "procedural hand IK" is Unity-side).

**The toy direction commits the game.** Chosen 2026-08-25 from three photographed options
(?style=cel and ?style=film remain live for comparison). Everything new from here should be
authored toy-first — a realistic prop dropped into this build will now look wrong, which is
the point of having a direction and also a constraint worth writing down.

**The title card does not pause anything.** Deliberate — the suites drive `game.frame()`
directly and a gated clock would hang all fourteen — but it means the contract clock is
running while a player reads the controls. At 18 minutes of estimate that is negligible, and
it will not be once there is a leaderboard.

**~~No settings, so no accessibility surface.~~ Closed in Phase 17 (M4) — see the Phase 17 open items.** `DEFAULT_SETTINGS` has mouse sensitivity, invert
Y, deadzone and §21.4's toggle-grip mode, and none of them are reachable without editing a
file. AirportBaggageCrew's settings panel is in Dev\INDEX.md and is the thing to copy.

## Phase 15 open items

- **Post verified on one driver.** `copyFramebufferToTexture` from the antialiased default
  framebuffer (implicit MSAA resolve, RGB capture into an RGB8 texture) is verified on
  SwiftShader/WebGL2 only. A first-frame `gl.getError()` self-disables the chain with a
  console warning (same as `?post=off`). Firefox and Safari unverified.
- **Safari has no `ctx.filter`** on 2D canvas; the texture layer's blur steps fall back to
  crisp edges there. Textures read sharper, nothing breaks.
- **Bloom is a room effect.** The sky is tone-mapped under the threshold on purpose, so the
  outdoor frame has a bright-pass fraction of 0.00 %; bloom shows on the pendants indoors.
- **Program count on the GPU tier is 33** (feature sets × vertexColors × side); the suite
  allows 40. Adding kinds with new feature combinations moves it.
- **Skirting stops 0.03 m short of the jamb markers** by design (the B1 clear-box margin).
- **Concrete path** runs 1 mm under the plank under-plane at the 34" threshold; a depth
  watch item on software rasterisers only.
- **Tile UVs stop short of an edge by the bevel arc** (`userData.uvEdgeShortfall`, up to
  0.586 r); a grain tile can end a few millimetres before the corner. Not visible at 0.5 m
  texel; recorded so nobody tightens G6a to 1e-3 again.
- **No blobs, bump, env, rim or VSM in software** (the tier) — the gate proves the good path
  only by its absence; `tools\probe.ps1 -Setup tools\m13g-gpu.js` proves it by presence.
- **Style mocks (`?style=cel|film`) bypass post** — they own the frame; kept photographable.
- **Phase 1-11 shot scripts** go through `present()` now but frame old phases; they are
  archival, not re-shot.

## Phase 16 open items

### M1

### Phase 11 plan — M1 (2026-09-04)

**Closed.** `state.phase` never left `'pickup'` until settlement (the cab bypassed `game.setPhase`); `settle()` ran twice per settlement; 11 bus emits were stamped `0` (straps.js:82/101, tools.js:169/195/223/285, interact.js:456/477/490, damage.js:123 decay path, main.js:593 flush). A tool put down with Q sank through the ground (`_putDown` did not restore `GROUP_PRESETS.object`; measured y = −1.32 m after 1 s).

**Still open, recorded here.**
- `telemetry.phaseMs` counts time in every phase, but `briefing` is always 0 because boot promotes to PICKUP synchronously (main.js) and `settlement` is always 0 because settlement pauses the clock. A briefing card that keeps BRIEFING while unpaused will start recording it without code changes.
- SECURE (§3.4) is still never entered: the machine goes PICKUP → TRANSIT. The cab's departure carries `canDepart()`'s warning on the `CONTRACT_PHASE` validation (`{ok, warn, reason}`) — that is the "warnings acknowledged" exit, as a field rather than a phase.
- Replay while carrying a tool still loses the tool: `resetContract` (main.js ~656-669) sets the body Dynamic but does not restore collision groups — the sibling of the Q-put-down bug, in M2's scope.
- The m11 fixture's `lookAt()` lerps the camera: after a 40 m teleport twenty `rig.update()` calls leave the follow target 0.46 m behind (followLerp 12/s → 0.8 per update, 0.8^20 = 1.15 %), enough to miss an anchor (0.28 m aim radius). `lookAt(..., snap = true)` snaps it; sections B–D deliberately keep the lag they were tuned against (C8 stops finding the wardrobe with an exact camera).
- `M.pendingNotices` is drained only by the rAF loop, which headless Chrome barely runs; a suite that drives many frames should drain or measure it (unchanged behaviour, now reachable from the api).

### M3

## Phase 11 build-side M3 — pause and the shell

**An Esc-resume cannot re-take the pointer.** Chrome does not count Escape as user activation, so after resuming with Esc (or a pad Menu press) the player must click the game once to look around again; the card's foot line says so. Clicking Resume or the card's backdrop re-locks in the same gesture (`pauseScreen.onResume`, only when `input.activeDevice[0] === 'kbm'`). Not fixable from the page.

**Pause is global in local co-op.** §21.4 names a SOLO pause; with two seats either player's Esc/Menu, seat 0's lost pointer lock, or a window blur pauses both. Both players are in the room, so this is recorded rather than fixed.

**Pad View is two things in the van.** `COOP.joinPad` (View, raw shell button) and the `cargoGlance` binding (input.js:128, DRIVE context) share PAD.VIEW, so a View press while driving glances at the cargo AND seats/unseats the second player. Pre-existing binding; the brief prescribed View for join. Move the glance to another button in the M5 prompt pass.

**A window blur under the title card pauses the world silently.** The card appears the moment the job starts, reading 'paused — window lost focus'. Deliberate: the title never shows a second card (m15 P2a).

**Pressing A on the title makes the mover hop once.** A is the 'jump' binding and the same edge reaches the movers system in the frame that starts the job. Cosmetic.

**A gamepad connecting or disconnecting re-edges every held button once** (input.js clears `_padSlotPrev` on both events because the slots shift). Pre-existing behaviour, now explicit; a player holding a grip while a second pad is plugged in feels one extra press.

**m11 F2 is still vacuous** in `tools/m11-tests.js` — it queries `#contract/#cargo-status/#notices/#route-bar`, ids the HUD dropped in Phase 12, so every branch returns true. The repaired measurement lives in m15 F2r-F2r4 (class selectors, live rects at 1280×720). Replace m11's selector list with `['.contract', '.cargo-status', '.notices', '.route-bar']` when that file is next open.

**Pad join in co-op reads the pad in slot 0 as seat 1's** (input.js `seatForPadSlot`), so the JOINER's View button leaves; seat 0's second pad also works. One pad + keyboard: the keyboard player presses F2 to leave.

### M7


**Solo couch drag travels, slowly and by design (Phase 11 M10, measured).** One hand, unbraced, 3 s:
0.34 m, held throughout (2.45 m in 10 s, force ~620–680 N against 552 N of floor friction, no
stumble); on the dolly 6.52 m; two movers one hand each 5.09 m. The grip now damps in the hand's
frame (`c · (v_object − v_hand)`), the tow cap knows the object's effective floor friction and adds
the pull's haul-back (`CARRY.tractionN` 350 / `braceTractionN` 380), and the band caps the legs'
ACCELERATION at 0.74 m/s² for the couch — most of the first three seconds is the ramp. Two things a
tester will notice: (1) **bracing while towing is an anchor, not a faster drag** — +0.02 m along the
haul in 3 s, 0.45 m in 10 s, never torn: a braced mover's legs walk at 0.76 m/s against a 0.69 m/s
haul-back, netting ~0.03 m/s. Making braced the faster technique needs ≥ 430–450 N of braced
traction and that topples the fridge (420 N: on its side at 6.8 s; the rows are in
`tools/_probe-drag.js`'s default run). (2) **The fridge can be toppled by one mover who grabs it
high.** At the harness's 0.875 m grab it never tips in 10 s (445–457 N stall, tilt 0.0°); grabbed
at 1.2 m — where a player looking at it aims — the tipping force is 315 N, and a lone unbraced pull
tilts it 5.9° in 3 s and topples it at 6.9 s. It still cannot be dragged (745 N of friction, on its
side too), so "beyond one hand unaided" survives as a §2.2 consequence rather than a denial; not
prevented, on purpose.

AMEND the Phase 3 paragraph (~124-131) 'Candidate levers, none yet tried in anger:' to: 'Candidate levers: `GRIP.maxStretch` against `GRIP.spring` — a braced band of 0.77 m was tried in Phase 11 M7 and bought nothing (0.00 m); a traction budget before the pull was tried in the same milestone and bought nothing usable (see Phase 11 open items); `CARRY.dragForceRef` and a kinetic < static friction remain untried. The binding limit is the world-frame damping term, not the spring.'


## Phase 17 open items

### M2

**Replay (§26.6 / §26.1) — fixed in M2, with the seams that remain.** `game.reset()` still replaces `game.state` wholesale; there are now THREE re-attach points that must agree about what a contract is: the manifest (rebuilt against `contractEntityIds`), the player rows, and the damage system — which no longer captures the state at all but reads `game.state` through a getter (`damage.js` `get state()`), so it cannot go stale again. `resetContract` unwinds tool effects through `detachDolly` / `removeBlanket` / `retrieveRamp` / `reassemble` before clearing any flag (the order trap tools/m11-tests.js documents). Measured over three full runs (tools/m14-soak-tests.js): bodies 71, colliders 71, scene children 325, renderer geometries 408, textures 60, strap pool 0 — identical after run 1 and run 3; ledger 3/3/3 lines at the three settlements.

**Still open after M2.**
- **~~Tools have no §18.3 out-of-bounds recovery~~ RESOLVED in Phase 22 (M15): ToolSystem.step mirrors registry.step through the detach calls, one RECOVERY the invoice bills, m23 L1-L3 pin it.** `registry.step` walks `registry.entities` only; a tool that leaves the world mid-run stays gone until "Run it again" puts it back on the rack (which now works: y = 0.08 m for the ramp, 0.07 m dolly, 0.00 m blanket, −0.00 m screwdriver after 120 frames — the last two rest a few millimetres into the ground, inside Rapier's contact tolerance).
- **§26.6 'fragments' is still vacuous.** Detached parts are recorded in `state.removedParts`, never spawned; there is nothing to remove, and the clause cannot be claimed either way.
- ~~**`entity.state.everHeld` is never written.** It is read by `heaviestMoved()` (main.js) and cleared by `respawnContract`, but no system sets it, so the "heaviest moved" stat only ever counts loaded or recovered objects.~~ **Closed in Phase 27 (M26), and the diagnosis was already stale:** M6 wrote it in registry.step, which could not see a grab and a release inside one frame; M26 writes it on the grab itself (grip.js) and initialises it false at spawn, so 'heaviest thing moved' counts a carry.
- ~~**`hud._notices` accumulates under headless drive.** Notices expire by `performance.now()`, which does not advance under virtual time, so a suite that replays sees one 'new contract' notice per replay (1, 2, 3 across the soak) until the cap of 4. Harness artefact, not a game defect; m14 S7 pins the cap.~~ **Closed in Phase 27 (M26).** Notices expire against the SIM clock M9's captions already used, and a contract reset clears the stack and the queue; the soak reads a constant 0 / 0,1,1 / 1,1,1 instead of the 1, 2, 3 ramp, and m14's S7 bound came down from 4 to 1.
- **`performance.memory.usedJSHeapSize` is quantised by Chrome.** The soak read ~27 MB at every sample (0.0 % growth); S8's 10 % tolerance is against a number with limited resolution, so the object counts in S1/S2 are the real growth evidence.

### M4

**~~No settings, so no accessibility surface.~~ CLOSED in Phase 11 M4** — the settings card (title and pause) exposes grip hold/toggle, mouse/stick/P2-key sensitivity, invert X/Y, deadzone, trigger threshold, text size, camera distance and quality tier, saved under one localStorage key with a schema gate. What remains open from the same entry:

- **~~No key remapping UI.~~ Closed in Phase 23 (M18).** ~~`setBindings`/`bindingConflicts` exist (input.js) and nothing calls them after boot; §21.4 scopes full remapping to the full product.~~
- **No camera-shake, reduced-motion or subtitle control** — deliberately: there is no shake, no particle system and no audio for one to act on. Adding the switch before the thing it switches is a lie the card would tell (§2.1).
- ~~**Quality tier applies on reload**, and the card says so. The tier decides how many shadow maps are BUILT before the scene exists (lighting.js), so a live switch would mean rebuilding the scene. `?tier=` on the URL still overrides the saved tier, so shot scripts and the harness are unaffected by a player's choice.~~ **Closed in Phase 29 (M29).** The lighting rig is disposed and rebuilt in the running scene, so room lights, shadow maps, the shadow filter and the post chain change as you pick. Surface detail is minted before the scene is built and still follows the next reload; the card says so.
- ~~**Text size scales type, not boxes.** `--ts` multiplies every font-size; panel `min-width`s and the 1280-wide `#help` line are still px, so at 1.6× the help line can wrap in co-op and the contract panel grows only as tall as its text. Measured clear of the centre third at 1.5× (m16 U1d); 1.6× not measured.~~ **Closed in Phase 29 (M29).** Every width, min-width and max-width under the HUD, a card or the help line now scales with the text or is viewport-relative; the nine deliberate exceptions are data in config with their reasons, walked by the suite. The help line wraps instead of clipping and the panels above it rise by a measured lift. At 1.0× every rect is back within half a pixel of what Phase 15 measured.
- **Camera distance is the solo boom only.** A split screen keeps COOP.cameraDistance (3.2 m) — §4.1's shortened boom is a property of the half-width viewport, not of taste. The card says so.
- **The best invoice is device-local and profit-only** (§13.4 stub): one number, one grade, the build that wrote it. No history, no export — M6's run recorder is where that goes.
- **A fetch() started after load never resolves under `--virtual-time-budget`** (measured, m16 stalled on `fetch('styles.css')`). Suites must not fetch; read the CSSOM or import.

### M5

**Resolved (Phase 16 open items → 'Pad View is two things in the van').** `cargoGlance` is now PAD.LB on both seats (input.js DRIVE tables); `COOP.joinPad` keeps View. m12 K4 asserts no bound action on any seat or context lists the join button.

**The title card's control list is still typed, not derived.** src/ui/titleScreen.js:42-53 prints 'E', 'Q', 'LMB/RMB', 'F2' for every player; every HUD prompt and the #help line now come from `glyphFor` (input.js). A pad-only player reads the right glyphs everywhere except the card they start from. One-hunk follow-up: build the two columns from glyphFor(action, seat, 'kbm') and add a pad column.

**Device debounce is by sample.** The shown device confirms a switch when a HUD feed sees the new device ≥ 250 ms of sim time after the feed that first saw it. In the real game the feed is every render frame, so the lag is 250 ms + one frame; a suite that changes `activeDevice` and never calls `M.feedHuds()` (or runs frames) sees no switch — by design, not a bug.

**The stall hint is coaching state outside game.state.** `stallHint {ms, fired, done, armed}` lives in main.js (it is not contract data and must not be serialised); a save/restore (M4/M6) that replays a run mid-pickup starts the timer fresh. Acceptable: the hint is advisory and once per run.

**m15 I1a fails after M4.** main.js now registers `pauseScreen.onSettings` at boot, so M3's 'Settings slot hidden while nothing has registered a handler' assertion is stale. Not an M5 change; M4 to retarget it.


## Phase 18 open items

### M6

- **The ROAD_FORCE bus trap M6 measured is fixed at integration**: `src/drive/route.js` now emits `roadType`, and `EventBus.emit` spreads the payload FIRST so the envelope's `type` / `simTimeMs` can never be shadowed again (m17 R4e reports 3 of 3 road events stamped ROAD_FORCE).
- **The run report is local only.** §27.4's 'explicit opt-in upload' is not implemented and will not be: the project rule is zero external requests. A tester copies the JSON (button, or the selected textarea when the clipboard is refused — it is refused on plain http and in embedded panes) and sends it by hand. Kept runs (last 6, no event lists) and questionnaire answers live in this browser's localStorage under `mfh.save` and are gone with 'clear responses' or a cleared site.
- **Frame cost of the recorder cannot be measured by the smoketest harness.** Under `--virtual-time-budget` `performance.now()` is frozen, so `game.stats.systemMs` reads 0.000 ms with the recorder on or off and m17 P1 passes vacuously there (it prints a NOTE line when both readings are 0). The honest number was taken in a real Chrome: 0.031 ms difference at worst over 600-frame passes (means 0.20/0.12 ms off, 0.18/0.15 ms on, 0.1 ms timer granularity).
- **~~`counters.trips` is always 1.~~ `counters.trips` is real (Phase 21, M13).** `state.tripCount` is
  written by the phase system when a return leg arrives back at the house; the run summary carries
  it (m21 T6: 2). `worstCargoShift` is a MAX over every leg driven while `cargo.shifted` /
  `cargo.measured` are the LAST leg's — an empty return leg measures whatever was still aboard.

### M8

**The intact couch jams at the 34" door under a blind push.** m6 E16e: on its side, pushed straight at living_kitchen with 600 N (a hair over its 552 N of floor friction), the intact couch stops at the jamb with 8.3 mm of penetration and 0.44 deg of yaw; 700 N or a straighter line gets it through (E16f). Geometrically 10 mm; physically a shove that has to be earned. That is the intent — house.js calls it 'passable, and unpleasant' — and no human has tried it. It is the first thing the questionnaire should ask about.

~~**Reattaching is free.** E bills 60 s to take the legs off; Q puts them back for nothing (m11 P2d). A player can therefore shrink the couch through the door and restore it at no cost, which is fine for §8.2's 'reattach' but means the round trip is priced once. Charging the reverse is one more call through the same `chargeWorkMs` hook.~~ **Closed in Phase 24 (M20).** Q bills the entry's seconds × TOOLS.screwdriver.timeScale (60 s for the legs) through the same chargeWorkMs hook; the Q line reads 'put the legs back on — 60 s' and the notice 'legs back on — 60 s' (m11 P2d, rewritten deliberately). A non-reversible entry — none is authored — reads 'the legs cannot be put back' and bills nothing (m11 section M20).

**The legless couch is a shorter couch.** disassemble() rescales the whole prefab in y (tools.js), so the mesh reads as a squashed couch rather than one without legs. Collider-faithful per §13.4 and asserted (m6 E15f, m13 A-series unchanged); a leg-hiding prefab variant is art, not scope.

~~Loose parts are still a string.~~ **Closed in Phase 20 (M12): a part is piece.count registry bodies.** `state.removedParts` records 'legs'; no 12.6 kg of leg bodies appear (`TOOLS.screwdriver.partMassFraction` still has no consumer). Unchanged from Phase 6.

**The archival screenshot scripts reference the old couch position.** tools/_shot-phase5.js and later still stage the couch in the living room; they are documented as not re-shot. tools/_shot-couch-legs.js is the M8 shot.


## Phase 19 open items

### M9

- **No music layer.** §20.4's sixth layer ("light adaptive work rhythm") is deliberately absent; the five others are in. Not planned before the external playtest.
- **No haptics.** §8.4's "optional haptic pulse" has no consumer; the Gamepad vibration API is a seam for later.
- **A pad-only start arms a suspended context.** A gamepad press is not a user activation under Chrome's autoplay policy, so title.start() from pad A creates the AudioContext suspended; the next mouse click or key press resumes it (every arm() call resumes). Until then the game is captioned but silent.
- **The caption lands one render frame after its cue** — feedHuds reads the last caption before audio.update drains the queue on the same frame (16 ms; invisible, but a suite must call audioFrame() before feedHuds()).
- **Captions run on sim time.** They freeze while paused (the pause card covers them) and expire 2.6 s of sim time after the cue, not 2.6 s of wall time. The boot's 'the job starts' caption is drained under the title card and can still be on screen for up to 2.6 s of sim time after START if the world ran less than that under the card.
- **`?audio=off` silences the captions too** (the layer's update is a no-op); the accessibility control is the Captions switch on the settings card, which keeps the captions with the volume at 0.
- **Road events are not positional and co-op pan follows seat 0's facing** (one pair of speakers per screen); each seat's caption arrow is its own.
- **'Outdoors' means 'no roof zone'.** The wind bed judges outdoors by the house/destination room zones (maxY = wall height), so the porch and the truck bed count as outdoors.
- **A cue while the context is suspended or interrupted is dropped, not queued** — by design (a suspended clock never ends a voice), so the first ~50 ms after arming can lose a cue.
- **minGapMs is per cue TYPE, on sim time**: two different objects landing within 90 ms are one thud (the caption names the first).

### M10

- **m2 and m3 measured with a compounding accumulator until M10** — their harnesses never called `physics.clearForces()` (main.js, m4 and m6 do), so every Phase 2/3 grip number they recorded (sag, lift forces, the 8 mm / 0.91 m/s drag) included Rapier's persisting force sum; world-frame damping self-cancelled it, which is why nothing failed. Both suites pass unchanged assertions with the fix in; the recorded numbers are historical.
- **m6 B8's margin is 4 cm** — the brief's 0.30 m line is met at 0.34 m only because GRIP.towSpeedSafety moved 0.55 → 0.65 (0.304 m at 0.55). A later change to the couch's friction, mass or CARRY.pullDamping will move B8 first; the safety sweep in `tools/_probe-drag.js` is the place to re-tune.


## Phase 20 open items

### M11

- **~~A hung leaf can be 'grabbed'.~~ Fixed at integration (Phase 20): `GripSystem.probe()` skips an entity whose `state.hung` is true.** Recorded as found: grip.js acquires any registry entity, so a hand on a door still on its hinges holds a Fixed body: the spring pulls nothing, the grip tears at maxStretch ('pulled out of reach'), and until it does the leaf's collider is in the held group, so the holder can walk through the doorway edge. grip.js is outside M11's files; a `state.hung` check in GripSystem.probe() is the fix (one line).
- ~~**Rehanging into an occupied doorway** (Q with a box or a mover standing where the leaf hangs) pins the leaf through it and the solver shoves the occupant out; no occupancy check.~~ **Closed in Phase 26 (M23).** `interact._doorwayBlocked` sweeps the hung pose's box (shrunk by DOOR.occupancyMargin 0.01 m); Q reads 'doorway blocked — clear it to hang the door' and does nothing — a box or a mover in the doorway both block (m30 D5).
- ~~**The rest spot is not checked at removal**: a mover or object standing on the strip beside the doorway when E is pressed is separated by the solver over a few steps.~~ **Closed in Phase 30 (M32).** The chooser walks the door's candidate strips in config order, sweeps each with M23's occupancy primitive and takes the first clear one; with a box on the living-kitchen door's hinge strip the leaf goes to the latch strip, clear by at least 10 mm, and the box moves 0.000 mm over 60 steps. With every strip taken it goes up to 2 m further along and the notice says 'laid it down further along'.
- ~~**A 1.5 m drop breaks a door** (condition 100 → 14, the whole 180 billed): the normal-fragility curve treats a stock door like a nightstand. Realistic doors are sturdier; a 'sturdy' band or a leaf-specific tolerance is a data change.~~ **Closed in Phase 26 (M23).** door_leaf_01 is on the 'sturdy' band (3.6 m/s, 12 points per m/s, floor 70 after 1.5 m): a 5.26 m/s fall reads 100 → 80.1, scratched, 14.40 billed (was 100 → 14 and the whole 180).
- ~~**Door damage lands on the furniture-damage line**, not property damage — ledger.propertyDamage is still never written (Phase 10 open item).~~ **Closed in part in Phase 26 (M23).** The FRAME is property damage (surface door_frame_<id>, fixed charges bent 40 / forced 140); the leaf's own dents stay furniture damage by design — a removed leaf dropped on the lawn is an item you dented.
- ~~**DOOR_STATE 'hung' is never emitted**: the boot state is `entity.state.hung`; the run record starts with the leaves on their hinges implicitly.~~ **Closed in Phase 26 (M23).** Every hung leaf announces 'hung' (reason 'boot', silent: true) on the first step of every run, boot and replay; the audio layer drops silent events, the recorder keeps them.
- **Jamb markers overlap the hung leaf visually** by 20 mm (they are 0.04 m meshes centred ON the gap edge; the leaf sits flush inside it). Colour-only; no collider.
- **Legs-off past a hung door needs aim**: 50 mm of geometry is 25 mm a side aimed at the open 0.82 (goes through at 600 N) and 3.5 mm at the door's nominal centre. The intact couch cannot pass a hung 34" door at any aim (−30 mm).
- ~~**The 32" front aperture's leaf swings out onto the grass** and lies there when removed; it is on no route, demo geometry as before.~~ **Closed in Phase 30 (M32)** for the half that mattered: it still swings out (that doorway opens onto the lawn — architecture), but every rest strip now lies inside the porch bounds, where the old candidate reached 170 mm past the porch's west edge. E and a forcing both land it there; over 40 removals the worst excursion is zero and the recovery sweep never has to move it.
- **Doors are a third body type in the world**: 4 Fixed bodies (75 total at boot). m14's soak equality and every leak check pass; any future 'bodies === N' pin must count them.

Resolved by M11: KNOWN_ISSUES's 'single most important open question' (the 0.82 vs 0.86 door) — 0.82 IS the 0.86 door with its leaf hung; §8.2's 'remove from hinges' now exists; §15.2's front_door_removed exists.

### M12

- Fragments are trackable only: they never hold a row open and are priced at 0 (the broken band already charged the item). A shard left at the pickup is counted (piecesLeftBehind) but costs nothing — deliberate, recorded so nobody 'fixes' it into a double charge.
- The break trigger is entering the 'broken' band (condition < 35), not exactly 0. One fragmentation per object; a piece never fragments. A door leaf (M11 fixture) that reaches the band fragments too (2 pieces); reset removes them.
- Piece placement falls back to the first candidate (+z face, long axis along it) when every face x turn is occupied — a parent hemmed in on all sides (a wardrobe in a corner with a mattress beside it) can spawn a door overlapping a wall or an object, and the solver ejects it. No damage measured at the shipped spawn positions (m20 P1h asserts zero at the pad; m6 E2/E7 and m14 take the wardrobe and bookshelf apart in place) but it is not asserted for every room.
- Reassembly reach is the parent's centre ± 1.5 m horizontally; a leg at the far end of a 2.10 m couch is 1.3 m out. Fine for the shipped table, tight for anything longer than 3 m.
- ~~Reassembly still costs no labour (the M8 seam)~~ (closed in Phase 24, M20) — the pieces still teleport away on reattach: no animation, no pickup.
- The 'parts left at pickup' line prices any piece not INSIDE the destination shell, wherever it is (on the road, at the kerb, lost off the world and recovered to its spawn slot) — the wording says pickup because that is where they get left, but the test is the shell.
- m14's soak now completes 22/23 each run: its fixture takes the wardrobe's doors off and never brings the two door pieces (2 x 5.25 kg) to the destination, so that row stays open and the invoice carries a 72.80 parts-left line. S0-S8 assert none of that; the equality counters hold (registry 27, bodies 75).
- m13 A1/A2 do not cover the derived piece prefabs (they iterate OBJECT_DEFS); m20 P9 does, over definitions.derivedDefs().
- A piece's lastStable is its spawn slot until it settles; a piece knocked off the world in its first frames is recovered to beside where the parent WAS.


## Phase 21 open items

### M13

- **Away is "not on the truck and not in a destination zone"** — an item dropped on the road between the truck and the destination house counts as away; the kerbside apron is site. `legsDriven()` is DERIVED (2 × trips − 1) because settlement only happens at the destination; a settle-at-pickup path must record legs instead. `ECONOMY.leftBehindFee` (60) is a product number: 23 items left = 1380 > the 900 base, by design (§15.2).
- ~~**The Q prompt prices rows that are away while the invoice bills every undelivered row** — press Q with a box still on the truck and the settlement line is one item larger than the prompt said (review gap, M13).~~ **Closed in Phase 24 (M20).** One definition — manifest.js `undeliveredRows()`; the invoice's `itemsLeftBehind(state)` and the cab's `settlement()` both read it — and the prompt says where they are: 'settle up — 22 not delivered (1320.00), 1 still on the truck'. m21 T3d presses that Q for real: the sheet bills −1320.00 citing the 22 ids the line priced (T3b/T3c deep-equal the two sets with and without a box on the truck).

### M14

- ~~**A capped surface posts no further lines** (a window that rounds to 0.00 writes nothing): once a wall reaches DAMAGE.property.maxChargePerSurface (400) it also stops producing notices and scuffs — the seventh 6 m/s hit on the capped front wall left no line, no event and no mark (m22 PD6d). If the product wants the mark without the charge, emit the event with cost 0 and skip the ledger push.~~ **Closed in Phase 29 (M30)**, with one correction to the suggested route: the capped hit gets a NAME of its own rather than a zero-cost damage event, because the run recorder counts every property damage event as a ledger line. A further hit on a full wall posts no line and leaves the total to the cent, and still raises one notice, one mark and one caption.
- ~~**A corner hit bills one surface.** Attribution takes the surface whose manifold impulse was largest in the step and gives it the whole m·Δv; a wall and a header struck in the same step charge only the one that took more, and a step where a floor took more than a wall charges nothing (deliberate: §10.4 — a TV landing beside a wall it grazes is a floor landing).~~ **Closed in Phase 29 (M30).** The momentum change is shared across every billable surface the step touched, in proportion to what each took; the winner still decides whether anything is billed at all, so a step the floor won still charges nothing. Measured: 19.164 and 9.590 N·s give lines of 13.11 and 6.56 against the single line's 19.68 — splitting never costs more.
- **The impulse is the object's OWN |Δspeed| × mass, not the manifold impulse**: a 9 kg box at 4.0 m/s registers 31.3 N·s because 4.7 N·s of it came back as rebound. Consistent, documented, and what every fixture number is measured against.
- **The truck deck absorbs slow slides** (a fact, not a bug): a 0.78-friction box on the 0.32 deck (Average 0.55, 5.4 m/s²) thrown at 3 m/s from 0.79 m stops at z 12.289 as it touches the headboard with 0.00 N·s of headboard impulse — a §11.3 hard brake bills the headboard only when the pack actually reaches it moving.
- ~~**Property captions are generic** ('wall scuffed' / 'wall dented' / 'wall holed'): m18 A1b pins string captions, so the audio cannot name the surface; the HUD notice does ('living_kitchen door frame — scuffed · 34.59').~~ **Closed in Phase 29 (M30).** A cue's caption may be a string or a pure function of the payload, so the subtitle now says which surface: 'living-kitchen door frame scuffed'.
- **The scuff ring is scene geometry on both tiers** (one Group, 24 hidden quads, one material, one geometry, +1 scene child at boot: 330). m13 B1's movable exemption covers the quads; B1b (interior doorways) has no movable check and would flag a mark drawn inside a doorway's 0.06–2.01 m clear box — nothing in m13 marks one.
- ~~**heldBy is recorded, never scored** (§15.3): who held the object at the window's first contact is on the line and in the run record; nothing reads it.~~ **Read in Phase 27 (M26), still never scored.** The property line names the seat in co-op ('P1 carrying the box small') and says nothing in solo (§21.1), and the recap's seat column is filled for a held impact. The amounts are identical with and without the clause — the holder is a label, never a factor.
- ~~**Door leaves are still item damage** (M11's note stands): a hung leaf is an entity, so a couch forced into it marks the leaf, not the frame; the M11 hinge brute-force branch through `doorLeaf_` is the seam.~~ **Closed in Phase 26 (M23).** The frame is the surface, read from the leaf's side of the narrow phase; the 'doorLeaf_' placeholder prefix is gone from the allow-list and 'door_frame_' bills.


## Phase 22 open items

### M15

- **Recovery still lifts objects RECOVERY.objectRecoveryLiftM (0.12 m) and lets them drop** — a 1.5 m/s landing that the 'fragile'/'extreme' bands can bill. Pre-existing (Phase 5); a lost leaf goes to its rest pose with no lift and a piece to its spawn-lift slot (0.01 m), so neither bills on recovery.
- **The sweep is one seed neighbourhood** (DEBUG.softlockSeed 20260904 + session index, 40 sessions). Change the seed in config to sweep another; a failure prints its seed and script.
- **Fixed at integration (Phase 22):** the screwdriver's rack slot moved out of the truck deck's collider (tools/definitions.js), and the player controller's out-of-bounds test now reads RECOVERY.bounds like every other body.

### M16

- ~~**The aim ray's origin follows the shaken camera.** `GripSystem.aim()` reads `camera.position` for `camOrigin` (grip.js), so for up to settleMs (600 ms) after a nudge the interaction/grab ray starts up to maxOffset (0.12 m) from where it would otherwise start; the ray's DIRECTION (aimYaw/aimPitch, the pointer-lock axes) is untouched (m24 K6/K6b). Same class as the boom's occlusion compression, which already moves that origin. Only matters for a grab attempted inside the half-second after a nearby impact or a road event; deliberately not changed here because grip.js is outside M16 and 'what you see is what you aim' is defensible. A future milestone could hand aim() an unshaken eye.~~ **Closed in Phase 24 (M20).** grip.js `aimOrigin()` reads camera.js `unshakenEye()` — the boom solve before the offset — so the ray starts where the un-nudged camera is while the picture wobbles (m24 K6c/K6d: during a 50 mm nudge the camera moved 50.00 mm and the aim origin 0.000 µm; a mid-nudge grab lands 0.014 mm from the rest grab). At rest the two are the same numbers. The boom's occlusion compression still moves the origin, as before, and that is the camera's job.
- **The driving seat is inferred, not declared.** CONTRACT_PHASE carries no mover id, so the road-shake observer records the seated mover nearest the cab point when the phase turns to TRANSIT. Two movers crowding the cab picks the nearer one, whoever pressed E. Solo always feels road events on its one seat.
- **Road directions assume TRUCK_POSE.yaw = 0.** The observer uses roadEventForce's truck-local vector as a world vector, which is exact while the truck is unrotated (it is, and never moves — M13). Rotating the truck would need the pose yaw applied in the ROAD_FORCE observer (main.js).
- **A paused jolt decays on frame time.** The shake integrates on the sim clock; after 50 ms (RENDER.camera.shake.simStallS) of a stalled clock it falls back to frame time so a nudge is never frozen mid-air behind the pause card. On a display drawing more than one frame per sim step the fallback never triggers.
- **The rotational part is pitch and roll only; no yaw, by design** (§21.4: the look axes are the player's).
- **Impacts nudge on relVelocity alone**, not mass: a 9 kg box and a 90 kg couch landing at the same speed feel the same. AUDIO.impact has the same simplification; a mass term is a one-line change in the IMPACT observer if the audio gets one.
- **No screen-shake control beyond on/off** (intensity slider deferred — §26.5 asks only that the switch exist).


## Phase 23 open items

### M17

**A sideways fall cannot pass 45° in the truck (M17).** The cargo box is 2.10 m wide and the fridge 1.75 m tall: tipping sideways, its top meets the far wall at asin((2.10 − 0.70 − slide)/1.75) — 53° if the base did not move, 28° after the 0.57 m it slides at 0.53 g on the 0.40 deck (measured peak 30.8°, 26.6° at rest, TALL). m25 K4 asserts > 25° and prints the bound; the brief's 45° is only reachable along the box's length, on the brake (SLIDE: 90.0°). A wider box or a lower fridge would change the number; neither is a tuning knob.

~~**A taut strap on a light item is numerically unstable (M17, straps.js).** STRAP.damping 1400 applied explicitly at 1/60 s exceeds the stability bound c·dt/m = 2 for any body under 11.7 kg: a 9 kg box (2.6) that loads its strap is launched — the M17 probe measured a strapped box on the dresser top thrown 1.45 m backward and 0.81 m down during a brake. The fridge (0.21) and dresser (0.42) are fine, the television (1.06) marginal. This is why m8's GOOD pack shows 0.470 m of shift and why m25 LOW straps its light items with 20 mm of slack, wedged so the straps never load. Fix: clamp the strap's damping per body (c ≤ 2m/dt) or integrate it semi-implicitly.~~ **Closed in Phase 27 (M25).** straps.js solves the damping impulse instead of sampling it — c_eff = c/(1 + β), β = c·dt/m_eff — so the amplification factor |g| = 1/(1 + β) ≤ 1 at every mass and the damper's work is negative for every input; no tuning moved. Two corrections to the diagnosis, both measured (m32 S4): the ratio is taken against the EFFECTIVE mass at the hook, not the body mass (a 9 kg box hooked off centre is 2.54 kg effective, ratio 9.19 rather than 2.6), so the television (2.46) and the dresser (2.20) were over the bound too; and m8's GOOD pack was never the symptom — its 0.470 m is unchanged, because its hooks sit near each item's centre of mass. A strapped 9 kg box went from 1.077 m at 4.27 m/s to 0.025 m at 0.518 m/s over a whole route; the 110 kg fridge moved by 0.49 mm.

~~**The bump moves nothing (M17).** speedBump is purely vertical at 0.55 × 0.8 × 5.2 = 2.3 m/s² (0.23 g): nothing lifts, nothing slides, and shiftByEvent.speedBump reads 0.000 for every pack. §26.3's 'bump results' differ only as a null. A longitudinal fraction on TRUCK.roadEvents.speedBump.accel is one number away if the bump should ever be an exam.~~ **Closed in Phase 27 (M26) — and it was not 'one number away'.** The response is a step, not a ramp: a 9 kg box under 7.52 m/s² of normal load needs 3.91 m/s² of push before it moves at all, harder than the brake. The wrong number was the LIFT. At y 2.20 (9.15 m/s², 93 % of gravity, 6.7 % of margin before the load leaves the deck) with z 0.50, the bump column reads LOW 0.006 m, TALL 0.243 m, SLIDE 0.282 m, SLIDE with two straps 0.282 m — all were 0.000.

**~~The HUD does not show the pack-quality number (M17).~~ Fixed at integration (Phase 23): the cargo row reads '30% pack · 100% unstrapped'.** cargo.packQuality().quality (LOW 1.000 / TALL 0.298 / SLIDE 0.199) is on the heuristic the HUD receives, but hud.js still prints '% unstrapped' and the band, so TALL and SLIDE both read 'LOOSE 100% unstrapped' while the drive punishes them 0.577 m vs 1.520 m. One line in setCargo. Likewise the invoice's stat rows do not carry shiftByEvent; the run summary (Copy run report) does.

**The turn is as hard as the brake (M17).** TRUCK.roadEvents.sharpTurn.accel.x is 1.0 × brakeForce (0.53 g sideways) — a real box truck rolls before that. §7.1's exaggeration licence applies: at the previous 0.8 (0.42 g) the turn moved nothing upright on the deck and only the brake told one pack from another.

### M18

**Remapping (Phase 11 build-side M18).** Every on-foot action can be rebound from Settings → Controls, per player, keyboard/mouse and pad separately; conflicts are refused by name; the save keeps only the differences from the defaults. Limits, recorded not fixed: (1) one binding per device class per action — rebinding an action that shipped with two alternates (crouch: Ctrl or C) leaves it with the one you pressed; (2) chords are not bindings — the first keydown wins, so pressing Shift+F binds Shift; (3) only the on-foot table is listed, because the driving table is never entered (the route is scripted); (4) Escape, F3, F2 and the pad's View button are reserved for the shell and pause/debug are fixed; (5) a capture in solo takes the press from the only pad whichever player's row you clicked — the row decides the seat, which is the intended reading but can surprise a tester with two pads; (6) a capture nobody answers closes after 8 s of frame time (INPUT.remap.captureTimeoutMs); (7) a saved binding that a later build's default makes a conflict is dropped with a console.info, not merged — the default wins and the player rebinds. The reticle prompt, the grip label and the help line all follow the live table (glyphFor), so a remap is visible everywhere at once; the title card's control columns are authored text and still name the defaults.

Fixed at integration (Phase 23): a click on the card during a capture cancels it instead of binding the mouse button, a captured mouse button's mouseup is swallowed like a keyup, and a reset that drops the other player's binding says so on that row.


## Phase 24 open items

### M19

- **Reduced HUD keeps the OVERTIME row** (deliberate: §2.2 'overtime costs money and work continues' — a cost being billed is never hidden). Everything else the brief lists as secondary is hidden.
- **The hints switch has two consumers, not three.** There is no helper text on the settlement questionnaire to silence — questionnaire.js carries only the §27.3 sentences and their scale anchors (§26.5 tokens that must stay), invoiceScreen.js's copy-note describes the Copy button. The card's row names exactly what it silences.
- **'What happened' records notices routed through pendingNotices.** The three direct hud.notice() calls in main.js ('new contract', 'one player' / 'two players') are not recorded: the first is raised right after the reset that empties the ring, the others are seat-count facts, not events.
- **High contrast turns `--line` white everywhere**, including the 1 px group separators on the cards. Loud by design; no player has seen it yet.
- **Fixed at integration (Phase 24):** `?hc=1` no longer persists as the player's choice — the save keeps the loaded value until the High contrast row is touched; and the stall hint's grip check now runs BEFORE the hints guard, so a grip retires the hint whether or not hints are on (the review's riskiest line).

### M20

- **The prompt prices the items-left-behind line only.** `settlement()` is undelivered rows × ECONOMY.leftBehindFee; the PARTS_LEFT line (M12, a couch leg's replacement share), damage and overtime are not in the cab line. Explicit by design (§25.3): the line names what it prices.
- **reassemble() puts back a non-reversible part when asked.** The 'cannot be put back' refusal is the prompt's (interact.js reads `reversible` off partStatus); the API restores for whoever calls it because the replay reset (main.js) calls it plain and then clears removedParts. A future caller that wants the player's rule must read `reversible` off partStatus() or the return (m23's random part off/on verb calls it plain today, correctly). No shipped entry is non-reversible.
- **The at-site clause and the priced E line are asserted at the seam.** 'finish the job and settle up — 2 not delivered (120.00), 2 here but not yet in a room' and its E press are pinned by m21 T3e through swapped tripStatus/setPhase fields; no suite constructs an undelivered-at-site row through the world while others are away.
- **The un-nudged eye is 'un-nudged' only across an update.** `unshakenEye()` returns the last update's solve while a shake is applied and camera.position otherwise; a fixture that moves camera.position by hand between updates gets what it set. Suites do not.
- **E's settle line is priced only when something is undelivered** ('finish the job and settle up — 1 not delivered (60.00), 1 still on the truck'); with everything delivered it is the bare string it always was (m21 T8 pins it byte for byte).
- **Fixed at integration (Phase 24):** m20 P2i's pin is now the priced label 'put the legs back on — 60 s'. The four closures above (Phase 18 M8, Phase 20 M12, Phase 21 M13, Phase 22 M16) are struck through in place.


## Phase 25 open items

### M21

- Evidence page (M21), Comprehension: 'identify the next objective without coaching' has no signal in the run report (the objective line is HUD state, and the stall hint is a notice, not a bus event), so the page reads the cell as first grip ≤ CONTRACT.stallHintMs (30 s) AND first load ≤ EVIDENCE.comprehension.firstLoadMs (120 s) of sim time, from the events or from M22's walkthrough stamps. The save's kept runs are compact (no event list) and, unless the cards were shown, are EXCLUDED from Comprehension and named on the page and in the Markdown — never scored 0 — so a set pasted from the save alone reads 'no data' for that row while the other five score.
- Evidence page, Learning: there is no tester identity by design (§27.4). A session is consecutive reports, in date order, of one build whose `restarts` climbs. Two testers who each play once in one browser sitting look like one tester's replay; a tester who reloads the page between runs (restarts back to 0) looks like two testers. Pairing is stated on the page; a reader who knows the room can correct it by hand in the Markdown.
- Evidence page, Emergent story: any non-empty q1 or q6 text counts as a recounted event — 'nothing' is a story to the page. Friction's q1 word list (EVIDENCE.friction.words) is a substring match; 'lost' matches 'almost'.
- tools/_fixtures/runs-sample.json is a snapshot of scripted harness runs, not a playtest, and m28 E2z deep-equals its six signals to the live set: any change to the invoice, the §27.4 counters or the verbs m28 F scripts moves the fixture's numbers and E2z fails. Regenerate: DUMP_FIXTURE = true in tools/m28-evidence-tests.js, decode the FIXTURE-B64 line from the DOM dump into the file, set it back to false.
- Harness (measured 2026-09-05): under --virtual-time-budget boot spends ~130 s of the 240 s, and an `await fetch()` after title.start() left the DOM dumped mid-request (m28 run 1 stalled at E2z). Suites must not await the network after the game has started — import JSON fixtures as modules before boot, load a second document right after boot.
- **Fixed at integration (Phase 25):** the settlement link's tooltip no longer carries a milestone id; the page's and module's remaining literals are named in config or commented as DOM facts.
- **m28 prints no result block when another headless Chrome is running beside it** (measured three times on 2026-09-05: twice by the reviewer, once at integration, each time the DOM was dumped at 'booting…' — the second document it loads shares the virtual-time budget with whatever else is starting). Also seen once ALONE on a non-default port (8523) at integration, then 151 ALL-PASS alone on the default port and in the sequential gate — the trigger is not pinned down. Run tools/m28-evidence-tests.js alone on the default port; a no-block run is the harness artefact CLAUDE.md names, never a failure.

### M22

- ~~**First-minute card vs the bottom-centre band in narrow viewports (M22).** The card is `min(312px, 42vw)` wide at left 10 px; the caption (bottom 72 px) and the route bar (320 px, bottom 42 px) are centred. At the harness's 1262 px the card ends at x 322 and the route bar begins at 471 — no overlap (m29 W1m1 asserts the caption) — but below ~960 px wide the route bar's left edge (w/2 − 160) reaches the card during step 3 (a player who drives off within 20 s of the first load). Not measured in the suite because the harness viewport is fixed; a `@media (max-width: 960px)` rule narrowing the card is the fix if a tester's window hits it.~~ **Closed in Phase 30 (M32), and measured.** Below the narrow threshold the card takes a one-row badge form and publishes a band lift the route bar and the caption both respect, so the band stacks. Measured at three band widths — 1262 px (M22's rects unmoved), 960 px and 800 px — with zero rect intersections among card, caption, route bar and help line at any of them. The media-query fix the entry proposed was NOT taken: a media query reads the viewport, which the harness cannot move, so the rule keys on the interface root's own width.
- **The seen flag is per browser, not per tester (M22).** `walkthroughSeen` lives in localStorage with the rest of the shell; a second tester on the same machine gets no cards unless 'Show the first-minute cards again' is ticked in Settings → Reading the screen. Deliberate — §27.4 has no identity — but the evidence page should expect `{ shown: false }` from every run after a machine's first.
- **Escape-into-the-card is only reachable when the ✕ has focus (M22).** The card is pointer-inert except its ✕, and nothing focuses the ✕ automatically (focusing it would steal the keyboard from the game). Escape while playing still pauses (m29 W4l); Tab-to-the-✕ then Escape skips.
- **The card's position cache trusts its invalidation list (M22).** The help line is measured once and again only on resize, its own rewrite, a --ts or .hc apply, or document.fonts.ready. A change to #help's box that arrives by another route (a stylesheet edit in devtools, a future rule keyed on something else) leaves the card at its last measured bottom until the next of those. Every route this build has is on the list (m29 W1z4-W1z9); a new one must call `walkthrough.relayout()`.
- **A pre-M22 save's kept runs report `walkthrough: null` (M22).** sanitiseRun reads 'not reported' for a record without the key rather than guessing `{ shown: false }`; the evidence page counts those as key-absent, which is what they are.


## Phase 26 open items

### M23

- **The frame's strain is not m·Δv, and it is three readings.** A hung leaf is Fixed, so the object shoving it loses no speed (m·Δv 0.00 on every pressing step, measured); the frame reads the leaf's own manifold impulse, the hands' force for a held object at rest against it (the leaf's manifold under-reads a blocked push by a solver-ordered friction share: 712 N applied, 170-243 N read in one run, 305-392 N in another — DAMAGE.property.doorFrame.pressSpeedMax), and M14's m·Δv for a hit the leaf took hardest. Consistent and documented in config.js; the wall pricing is untouched.
- **A fast, heavy hit can under-read.** A 110 kg fridge at 6 m/s from 0.16 m stops dead (632 N·s of m·Δv) with a first-step manifold of 14 N·s — Rapier resolves the deep first-step penetration by position correction the manifold never reports — and the floor's 18 N·s resting impulse then wins M14's ranking, so the door is NOT forced. From 0.05 m at 4 m/s the same fridge forces it in one step (427.9 N·s). A corner case of thrown appliances; recorded, not fixed.
- **An UNHELD lean never strains a frame, by rule; a held object pressed against it does.** Only a held object or a hitting one counts (the held-or-hit gate): a box left 20 mm into the leaf after a throw reads a persistent 129-184 N of solver phantom for ever and would otherwise tear the door off by sitting there. Consequence: an object pushed into the door by ANOTHER object (a wardrobe shoved into a couch into the leaf) strains nothing; movers are kinematic and never in a Fixed body's manifolds, so a shoulder on the door does nothing either — the screwdriver or a held/thrown heavy object are the two ways.
- **One hand does not force it** — the grip tears after ~0.4 s of pressing (620-660 N applied, ~50-200 N·s of strain: bent, not forced) unless re-grabbed inside the 700 ms window, where the strain carries on. Two hands: 1.00 s.
- ~~**A forced leaf goes to M11's rest pose**, like a removed one; the rest strip is not checked (M11's own open item stands) — a couch shoved from west of x 2.15 at the kitchen door would find its leaf laid under its leading corner and the solver separates them. At the door's centre the strip is 25 mm clear.~~ **Closed in Phase 30 (M32).** The forcing path calls the same chooser the screwdriver's removal does — one path, not two. The shove with a box on the hinge strip forces the door and the leaf takes the latch strip rather than a pose 2.9 m away; the couch moves under 5 cm afterwards and the ledger, the door event and the clear width are unchanged.
- **The forced mark is on the hinge jamb, inside the doorway's clear box.** m13 B1b (interior doorways) has no movable check and would flag it — nothing in m13 forces a door, so the sweep is honest today; a future suite that forces one before sweeping must exempt userData.layer 'scuff' there.
- **'bent' posts when the window closes** (700 ms after the knock, like a wall's line), so the mark and the notice lag the knock by up to that; a shove that goes on to force inside the window never bills bent at all.
- **The frame's cap is M14's 400 per surface**: bent 40 + forced 140 per cycle, so a third forcing of the same door posts 40 and a fourth posts nothing — the door still comes off (DOOR_STATE 'forced' fires without a line).
- **heldBy is one entry per HAND** (M14's shape): a two-hand shove reads [p0, p0]; DOOR_STATE 'forced'.by is the first grip's playerId, null when thrown.
- **The 'hung' announcement is 4 events per run on the recorder** (bus.emitted counts them too; m17 R0/R1 equality holds). (eventBus.js's comment was corrected at integration.)
- **unhang inside damage.step primes the query pipeline** (registry.unhang → physics.primeQueries → one extra world.step), exactly as E's removal does from a key press; accepted, the M2 soak's counters are equal (m14 39).
- **Fixed at integration (Phase 26):** the five M11/M14 entries M23 closes are struck through in place; eventBus.js's DOOR_STATE comment names hung|removed|rehung|forced.

### M24

**§21.2 contract UX (M24).** (1) At UI scale ≥ 1.3 at a 720-px-tall window the title card AND the job sheet scroll inside 94vh (card 594/585 at 1.3, 758/570 at 1.6 — the card did so before M24; the sheet 835/585 and 1042/585). Nothing is cut off (overflow:auto), but a tester at 1.6× scrolls the brief. ~~(2) The recap's seat column is blank for part/damage/property/road entries.~~ **Closed in Phase 30 (M31):** both part events name the mover, the damage system names the holder on a breakage, and every damage and capped event carries the holder or null. A box carried into the front wall reads P1 on its item row and its property row; the same box thrown reads blank; road rows stay blank by design. (3) The reveal's skip key is intercepted at the window CAPTURE phase; a synthetic keydown dispatched ON window (m15's shape) reaches Input first — harmless while the sheet is up (the game is paused), a harness shape only. (4) 'Keep the tools on the truck' keeps exactly the tools whose body is inside the cargo box at the moment of the restart; a tool carried in hand or standing on the ramp goes home; straps never carry over (their cargo is respawned). The pause card's Restart has no such box and always restores the stock loadout. (5) The brief is read once at boot; a settlement that sets a new best updates the title's goal line only on the next boot (the title never re-shows in a session). (6) `?reveal=off` / prefers-reduced-motion render the sheet at once; there is no settings-card switch for the reveal yet.


## Phase 27 open items

### M25

- **Nothing enforces `CARGO.launchSpeedM` at runtime, and nothing should.** 3.0 m/s is a bound the suites assert (m32 S1, m25 K10 — measured worst 0.518 m/s over a whole route on a single strapped box, 0.217 m/s in a full pack), not a clamp in `straps.js`. §10.4 forbids the cargo system from moving anything without a physical cause and that includes braking it, so a strap that ever did exceed the bound would be a bug to fix in the force, not a velocity to clip. It is a **linear** speed: a spin in rad/s is a different quantity and the suites keep them apart deliberately.
- **The strap's STIFFNESS term is still explicit, and on a light body it is close to its own bound.** k·dt²/m_eff is 4.4 for a 9 kg box at the hook, against the symplectic-Euler limit of 4. It does not misbehave in practice because the rope is one-sided and the (now stable) damper kills the closing velocity before the stretch can grow — measured, a strapped 9 kg box peaks at 0.518 m/s over the whole route and 0.025 m of displacement. If the stiffness is ever raised or the step lengthened, this is the next thing to solve, the same way the damping was.
- **`STRAP.damping` 1400 is no longer the coefficient that gets applied.** The solve delivers c/(1 + β): 776 N·s/m on the 110 kg fridge, 137 N·s/m on a 9 kg box. The declared value is an upper bound the applied one approaches as the effective mass grows, so retuning it moves the light end far less than it looks.
- **The effective mass is computed from Rapier's `principalInertia()` / `principalInertiaLocalFrame()`.** `effectiveMassAt` falls back to the translational term alone if those are absent, which would make the bound too loose; m32 S4 asserts they are present so the fallback can never be taken silently. Note also that no definition's declared `centerOfMassOffset` is applied to its body, so Rapier's centre of mass is the body's translation — if one is ever applied, `worldCom()` is the value `r` must come from, here and in `velocityAtPoint`.
- **`STRAP_DEBUG.explicitDamping` is exported from shipping source.** It restores the pre-M25 force and is what makes every m32 claim a counterfactual rather than an absence-of-bug assertion. Nothing in `src/` reads or writes it, m32 asserts it boots false and is left false — but it is the one line by which a future edit could re-admit the launch in the real game.
- **Fixed at integration (Phase 27):** a failed or slack strap now zeroes every diagnostic it publishes (clearDiagnostics), and both moment arms read the centre of mass through worldCom() the way grip.js always has, so an applied centerOfMassOffset cannot silently invalidate them.

### M26

- **The bump's peak is 40% of the brake's but its LIFT is 93% of gravity.** §7.1's exaggeration licence, and the same call M17 made for the turn. A truck taking a bump hard enough to leave 6.7% of the load on the deck is a truck taking it too fast; that is the reading a playtest should argue with, not the forward nudge. `TRUCK.roadEvents.speedBump.accel.y` is the one number, m33 C3k pins it at exactly 2.20 and C3l pins the margin, and anything at or above 2.358 makes the load airborne — a different event, and not what this ships.
- **The seat and the cargo now disagree on purpose.** `speedBump` carries a `seatAccel` (straight up) beside its `accel`, because the camera shake normalises the direction it is handed and the cargo's forward fraction would otherwise have re-aimed the driver's bump nudge 12.8° forward. It is the only event that needs one; the brake and the turn still take the cargo's direction. Any future event whose cargo force is not the direction the CAB moves needs the same seam, and m24 K2a/K2d/K2g are what notice.
- **TALL now bills a little on the drive.** The bump moves the dresser 0.243 m, and the run posts one property line — *truck headboard scuffed (fridge_01) 6.05* — and one item line, tv_55_01 100 → 92, that a badly packed TALL did not post before. Deliberate (§26.3 'poor packing has understandable consequences') and pinned by m25 K9j so it cannot grow quietly into the brake's 400.00.
- **A notice freezes under the pause card**, consistent with M9's captions. A damage notice raised the instant before a pause is still readable on return — and a player who pauses with four notices up resumes with four notices up.
- **A contract reset drops the notices on screen.** They belong to the run that raised them, like `noticeHistory` (M19) — but the last thing that happened before 'Run it again' is not on screen after it.
- **Notices only age in the render loop's drain** (`main.js`, the `pendingNotices` drain that ends in `tickNotices`), which never runs headless. A suite that advances `game.frame()` without calling the drain will watch a notice stay up forever and read it as the Phase 17 bug; m33 C2 and m14's `drainNotices()` are the two worked examples.
- **Item damage still carries no holder.** `damage.js` `_closeWindow` writes no `heldBy` on an item line (only the property window records one), so the recap's seat column stays blank for a dropped television. One line in `damage.js`, in the milestone that owns it.
- **The invoice's property line aggregates.** One row for every impact, so the holder clause names at most `INVOICE.holderMax` (2) distinct holder-and-object pairs and then says 'and N more'. A per-impact breakdown belongs in the recap, which has one.
- **everHeld is defaulted in main.js, not in the registry.** `registry.spawn`'s state literal is the natural home; M26 did not own that file, so the two `everHeld: false` lines sit at the spawn sites in `main.js`. A milestone that owns `registry.js` should move it and delete them.
- **A carried heavy object cannot be THROWN at a wall in a test harness.** Measured while building m33 C4l: setting 2 m/s on a 55 kg dresser with two hands on it posts no line at all, because the grip springs turn it around inside about 0.35 m. Drive a heavy fixture by WALKING the mover into the surface (the hands travel with it) — m33 C4l is the recipe.


## Phase 28 open items

### M27

**A keyboard or mouse seat has no pressure nuance, and that is the design (M27).** §4.4 requires that "every essential action requires controller parity and remapping" — the same ACTIONS on both devices, not the same analog resolution, which a mouse button does not have to give. A pad seat's grip strength follows the trigger 0..1; a keyboard or mouse seat is always a full pull, and `GripSystem.handPressure` returns 1 whenever the seat's active device is `kbm` (m34 T1g asserts it with the pad still reporting 0.1). Nothing is withheld from a keyboard player: the pad gets a finer control over a cap it shares, not a stronger one. An unattended mover — a solo player who swapped away mid-carry — is also a full pull, for the same reason it braces automatically: the trigger under your finger belongs to the mover you are steering.

**The grip-strength assist is inert on light objects and on any one-hand lift, on purpose (M27).** `gripAssist` multiplies `forceCap` inside `min(strength, mass × maxAccel)`, so it cannot make a hand faster: a 9 kg box's cap is 225.000 N at 1.00 and 225.000 N at 1.50. And a hand's force is also `spring × stretch`, bounded at `spring × maxStretch` = 630 N, which binds below the cap for every one-hand lift in the object table — so raising the slider changes no one-hand lift at all. Where it does help is where the cap genuinely binds: towing (a solo couch drag, 0.344 m → 0.627 m in 3 s), a wet or low-grip surface (§6.2 `wetGripMult` — a wet couch that will not come off the floor two-handed at 1.0 lifts 0.107 m clear at 1.5), and a tired mover (§5.2 `strengthFraction`). Turning it up will feel like nothing on a box; that is the bound working, not a broken control.

**There is no on-screen readout of how hard you are pulling (M27).** §21.1 keeps the sheet compact and the grip label gained nothing. The feedback is the existing strap-style stretch cue and the sag itself — a feathered hand visibly hangs further below the target before it slips. If playtesting says pressure is illegible without a number, the place to add it is the debug overlay first (`grip.lastPressure` is already recorded per hand), not the HUD.

**Fixed at integration (Phase 28):** a programmatic settings apply now SNAPS the assist to its step as well as clamping it, so a value the save would reject can no longer run live and revert on the next boot; three suite comments that named assertion ids which were not there are corrected, and the bit-identity matrix says plainly that it compares 32 distinct caps twice rather than 64 distinct ones.

### M28

**§8.4's haptic pulse has never touched a real controller (M28).** There is no gamepad on this machine, so every one of m35's 110 assertions runs against a stubbed `vibrationActuator` installed on a stubbed Standard Gamepad through the real `_pollPads` path. What is proven is the routing, the gap, the cap, the switch and the failure modes; what is NOT proven is that the magnitudes feel right, or that a given pad honours a 45 ms effect at all. `dual-rumble` is also effectively a Chromium contract — a browser or a pad that exposes no `vibrationActuator` gets silence by design (m35 H5), which is the right failure but means the feature may simply be absent for some testers. First job with a pad in hand: the numbers in `config.HAPTICS`.

**A cue nobody was holding rumbles EVERY seat (M28).** A `'holder'` or `'player'` row whose payload names nobody falls back to broadcast — and that is the commonest impact in the game, because you drop a box and then it lands. In solo this is right (there is one hand). In co-op it means a knock across the house buzzes both pads, and the crew member who did nothing feels it. The alternative considered and not taken was to reuse the camera shake's `RENDER.camera.shake.impactRange` proximity rule, which would have given the layer a second routing rule and a second set of injected positions for one case. If co-op play says the broadcast is noise, that proximity rule is the fix and the seam is `Haptics.seatsFor`.

**The pulse does not get harder when the hit is harder (M28).** The audio layer's loudness climbs with `relVelocity` and with road severity; the pulse uses its row's numbers verbatim, and `cueVolume` is consulted only as a yes/no. A 0.6 m/s nudge and a 14 m/s catastrophe are the same pulse. This was deliberate — it is what makes 'exactly the thud row's numbers' assertable — but it wastes the one axis a rumble motor actually has.

**A strap that stays overstressed creaks for ever (M28).** By design (§10.3 says the vibration is the warning), but there is no fatigue, no decay and no cap on how long it runs; only a state change, a reset, or unticking the switch stops it. A pack that sits just over `STRAP.ratingNewtons` for the whole 28 s route will buzz for the whole 28 s route.

**No trigger haptics.** `dual-rumble` only — the two body motors. Xbox impulse-trigger effects ('trigger-rumble') are not used, so §6.1's grip has no per-hand channel even on a pad that has one.

**A suite cannot wait for anything but a microtask (M28, harness).** `setTimeout` and `requestAnimationFrame` both stop working mid-run under the smoketest harness, because `--virtual-time-budget` is spent during boot. A suite that awaits one hangs for ever and the harness dumps whatever had been printed with **no result line** — which can be a screen of green PASS lines. Only microtasks (`await Promise.resolve()`) are safe, and any real macrotask wait is simply not available.

**Fixed at integration (Phase 28):** an equal-strength cue that has already cleared the per-type gap now plays instead of being counted as weaker (a second damage line or road event no longer goes unfelt); ending a strap's creak happens whatever the volume says, while starting one stays gated, so a cue that falls silent for the ear cannot leave a strap buzzing for ever; and two assertions that could not fail for the reason they named — the seat that felt nothing, and the default that was true by two routes — now pin their fixtures first.


## Phase 29 open items

### M29

- **A live tier switch changes the lights, not the surfaces.** The texture and material set is minted from the tier BEFORE the scene is built (`setRenderTier`), and re-minting it means rebuilding every material — so a live switch moves the lights, the shadow maps, the shadow filter and the post chain, and bump/gloss/reflections follow the next reload. The same boundary makes the post chain one-way in practice: a GPU boot switched down turns post off, but a SOFTWARE boot switched up has no post chain to enable, because `createPost` was never called. The card's note says exactly this. Closing it means making the material library rebuildable, which is a phase, not a milestone.
- **A switch up leaves 25 geometries resident that a software boot never uploads.** Measured around real frames: 356 after a software present, 381 after a gpu one, 381 again after switching back, against the 421 distinct geometries the scene owned before the switch (and still owns after it — the tier adds none). It is not a leak — every one is a geometry the scene already owns, and none is freed because none is orphaned — but the count does not come back down, and a memory budget written against a software boot will be 25 geometries short after a player has visited the full tier once. The textures DO come back (52 -> 45, all eight shadow textures freed).
- **At a very large text size in a narrow window the help line shrinks its own type — and past that, the budget lapses and says so.** `SETTINGS.textSize.helpMaxLines` allows two rows because two rows keep the route bar and the caption above the working area (§21.1); a third would not. So when the line still wants a third row, `syncHelpMetrics` steps down `SETTINGS.textSize.helpSqueeze` — measured, forced to 3.2x: two rows at 0.80 of the requested size, 30.72 px instead of 38.4. That is a text-size setting declining to give the size a player asked for, in one panel, to protect the doorway view. **And the ladder's last factor (0.72) is a floor, not a guarantee.** No ladder fits every window: at 1.6x the floor factor still wants ~1005 px of control line, so a window under roughly 560 px is past it. Measured at a forced 12x: the ladder runs out with the line on 7 rows, `--help-lift` becomes 870.9 px, and the panels above it DO rise into the working area. That case is now reported rather than silent — `helpMetrics.overBudget` goes true and one console line names the row count, the floor factor and the lift (m36 S1g) — but it is not prevented. Neither branch engages in the shipping range in a 1262 px window (`--help-squeeze` is 1 and `overBudget` false; m11 M29-5, M29-7). Closing it properly means a shorter control line, not a smaller one; lengthening the ladder only buys narrower windows at the cost of readable help text.
- **The build stamp is under the help line at a large text size — and was overlapping it before.** Measured: 167.9 x 25.4 px of overlap at 1.0x, 394.0 x 30.0 at 1.3x, and at 1.6x the stamp (699.8, 549.7, 552.2x34.6) lies entirely inside the wrapped line (10.0, 548.3, 1242.0x67.8), which paints over it. This is not new — the help line is 872.5 px of derived control text and the stamp 352.6 px of build id in a 1262 px window — but M29 is where it went from partly covered to fully. The 1.0x overlap is now a PINNED assertion (m36 S1d) so it cannot grow unnoticed, and the stamp is asserted at all three sizes for the things it can pass: it never clips its own text, never leaves the window, never reaches the centre third. Closing it needs one of: a shorter stamp, a stamp above the help line's measured band (which then meets the notices column, 0.6 px above it today), or the stamp inside the help line's own box.
- **A 1.6x first-minute card only clears the working area horizontally.** `#walkthrough` now carries `.objective`'s §21.1 guard (`calc(33vw - 12px)`), so it always ends before the centre third begins in x. Vertically it does not: at 1.6x with a two-line help line under it there are 124 px between the band's lower edge and the card's bottom, and the card is 134 px tall.
- **The gpu tier's live rebuild has never been seen on a GPU.** Everything asserted about it (m36 Q1-Q3) is counts on SwiftShader. What is NOT proven is that the room spots look right after a rebuild — that the maps are aimed and biased as they were at boot. The recipe for the first session on a machine with a graphics card is in PLAYTEST_NOTES.
- **Fixed at integration (Phase 29):** the settlement card's 1.6× overflow pin moved to the measured 786/585 (M29 gave back the 15 px of horizontal scrollbar), the mid-ladder bail's comment claims only what the bail restores, and the geometry-ceiling assertion is labelled as the count bound it is.

### M30

- **A window reports the split of its HARDEST step, not a running average.** `line.surfaces` is the group the peak-impulse step saw; a window fed by two steps with different splits reports the bigger one's. The AMOUNTS are exact regardless — each window's price uses its impulse-weighted mean share (fracSum / impulse), which by Cauchy–Schwarz makes the shares of a group sum to at least 1, so a split can never cost more than not splitting whatever order the steps arrive in. For a one-step corner hit, which is what every fixture measures, the two agree exactly.
- **splitMinFraction is a fraction, not an amount.** At 12 % of a 19.68 hit the smallest line is 2.36; at 12 % of the 400.00 cap it would be 48. If a future tuning wants "no line under 50 cents" the floor has to move to the cost side.
- **The recap can elide the '(capped)' row.** invoiceScreen.js flags the trimmed line, but the sheet shows at most INVOICE.recapPerKind (3) property rows and does not rank them by cost, so the capped line — usually the last of many on that surface — may not appear. The invoice line's ' (1 at the cap)' always does, and is what m37 P5d asserts; P5f reads the recap with the limits lifted.
- **The capped repeat gate is per SURFACE, not per surface-and-object.** Two movers grinding the same capped wall from opposite ends share one notice per 1500 ms. Right for §8.4's "one small notice"; worth revisiting if co-op splits notices by seat.
- **A capped hit still costs a haptic pulse and a voice.** HAPTICS.PROPERTY_CAPPED is the quietest damage row (0.22/0.30, 70 ms) and the cue is the quietest recipe, but a player who parks a couch against a paid-for wall gets a small pulse every 1500 ms for as long as they keep hitting it.
- **`billable` is still the only allow-list, and nothing asserts it.** The split shares among billable surfaces only; a hit that is 90 % floor and 10 % wall gives the wall the whole m·Δv when the wall won the ranking. That is M14's §10.4 rule preserved on purpose (nothing got dearer, and nothing got cheaper either) — but no suite would notice if the gate later changed, so a one-line assertion is owed here.
- **Fixed at integration (Phase 29):** a line is flagged as at-the-cap when the surface is EXACTLY full as well as when the charge was trimmed, so the sheet's count of capped surfaces cannot disagree with the surface that is actually full.


## Phase 30 open items

### M31

- **The seat column names ONE person.** `by` is heldBy's FIRST entry (M14's shape is one entry per HAND, so a two-hand carry reads ['p0','p0']). A two-PLAYER carry therefore names the seat whose grip was taken first, and the recap does not say 'P1 and P2'. The invoice's own property line already names up to INVOICE.holderMax holders and then says 'and N more'; the recap is the compact view.
- **`by` is recorded at the window's FIRST CONTACT, not continuously.** An object grabbed after the scrape started, or dropped halfway through it, keeps whoever had hands on it when the window opened — the property window's rule since M14, now the item window's too. §8.4 asks for attribution "when reliable", and first contact is the reliable moment. Nothing pins the mid-window case, because there is nothing to pin: it is the rule, not an edge.
- **`by` is on the EVENT, not on the ledger line.** A run report's `ledger.itemDamage` still cannot say who dented the television; its DAMAGE_APPLIED can, and the property line still carries the full `heldBy`. Deliberate: the lines are what buildInvoice reconciles (m8, m11 G13), and nothing but the recap wanted the key.
- **The reduced-motion guarantee for the reveal now rides entirely on `sanitiseShell()`.** main.js:983 composes the switch from `shell.invoiceReveal` alone (the `&& !reducedMotion` guard moved into the key's DEFAULT, which is what lets a saved choice beat the OS). Every path that produces a `shell` object goes through sanitiseShell today; any future code that assigns one wholesale — a settings import, say — would silently turn the count-up back on for a reduced-motion machine, and nothing at that line would notice. m38 F3a pins the composition, but only for a value save.js already sanitised.
- **On the harness's scratch page the reveal is off however the box is ticked** (`revealEnabledFrom` returns false there unless DEBUG.invoiceRevealInHarness or `?reveal=on`), so m16 U2's consumer for the row is the SAVE — the choice — and m38 F3d/F3e drive `invoiceScreen.show()` for real on both branches instead.
- **`keepLoadout` outlives the session.** It is in the save, so a tester who ticks it once starts every later job with whatever was in the cargo box. Both labels say 'remembered'; 'Defaults' on the settings card clears it.
- **The pause card's keep row is styled INLINE, not in styles.css** (the stylesheet belonged to another milestone in the same batch). It mirrors `#settlement label.keep` value for value and carries no inline `opacity`, so M19's high-contrast rule is not beaten; `display` is written beside `hidden` in refresh(), because an inline display beats the UA's `[hidden] { display: none }`. Folding it into a real rule is a cosmetic follow-up — add `#pause-screen label.keep[hidden] { display: none; }` with it, and keep m38 F4's computed-style assertions.
- **Fixed at integration (Phase 30):** the 'broken' part event's holder is not inert — it routes that pulse to the holder's pad instead of broadcasting it — and now says so where it is written. The claim that the property suite never truncates is withdrawn: it does, under concurrent browsers, exactly as the harness artefact this file already documents. Run it alone.

### M32

- **A leaf laid on a FALLBACK strip is out of Q's reach.** `_atJamb` measures from `state.home` against `DOOR.rehangRange` (1.25 m). Candidate 0 of every door is inside it (living_kitchen 1.043 m, kitchen_bedroom 0.810, door34 0.835, interior32 1.178), but every fallback strip is 1.345 to 2.071 m away, so a leaf the chooser moved must be carried back before Q offers the rehang. Deliberate — the alternative is a rehang range that reaches across a room — but it is a second key press the common case does not need.
- **~~A recovered leaf goes to candidate 0, not to where it was laid.~~ Fixed at integration (Phase 30):** the recovery pose reads `state.restAt || state.rest`, so a leaf laid on a fallback strip and then lost comes back to the strip it was on rather than to the authored one, which may still be occupied. (The function is `recoveryPose`, not `recoverySlot` as the milestone's note said.)
- **kitchen_bedroom's latch strip is under the nightstand at boot.** x −2.080..−0.080, z −8.675..−7.875 is where `nightstand_01` spawns, so the sweep passes over it and takes the third strip unless the nightstand has already been moved. That is the list working as intended, not a placement bug, but it means that door effectively has two strips at the start of a contract.
- **The strips are validated in the suite, not at boot.** `house.restCandidateProblems(apertures)` is the §24.4 validator — every authored strip outside every doorway's clear box (m13 B1's predicate) and inside `RECOVERY.bounds` — and m39 E0 asserts it is empty. Nothing calls it at boot; main.js was outside M32's files.
- **What the width emulation does not cover (M32).** m39 E4 narrows `#ui`, not the window: `window.innerWidth` / `innerHeight` do not move, any `vw`/`vh` left in the sheet does not follow (`#title-screen .card`'s `min(760px, 96vw)` and `body.coop #help`'s `96vw` are the two, both outside this band), and the band's HEIGHT is the real 624 px viewport's throughout. A genuinely short window is still unmeasured, and so is the co-op help line at a narrow width.
- **The badge wraps below about 700 px.** `#walkthrough.narrow` is capped at `min(430px × --ts, 60% − 20px)`, which fits step 3's title on one row at 800 px and 960 px (measured). Narrower than that the title wraps to two rows — `--band-lift` follows it, so nothing collides, but 'one-line badge' stops being literally true.
- **Also fixed at integration (Phase 30):** the clear-box geometry the boot validator checks candidates against is config rather than two literals in a system, the excursion measure that could only ever report zero now reports the real margin and asserts it, and the doc comment no longer promises a depth that a shallow freeze does not give.

