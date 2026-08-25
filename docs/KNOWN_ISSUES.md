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

**§8.2's two other answers to the turn do not exist yet.** The GDD offers three ways past a
tight corner: pivot it, take the door off its hinges, or unscrew the legs. Only the first is
buildable in Phase 5, so right now the turn has exactly one solution — which is thinner than
§3.3 asks for ("at least two approaches"). Phase 6's tools close this, and the layout was
built now specifically so Phase 6 has a real problem to solve rather than an invented one.
Until then the route puzzle is honest but narrow.

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

**The 32" opening is still impossible for the couch, on purpose.** Unchanged from Phase 0
and asserted again by m5 B8. It is on the front wall, not on the couch's route, so it denies
nothing — it is there as a legible example of a clearance that cannot be brute-forced, and
becomes a real decision once Phase 6 can remove a door.

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

**Solo couch dragging got harder, not easier.** With the tow speed limit in place, a lone
mover hauling the couch one-handed for three seconds now moves it 0.00 m, where Phase 3
measured a shuffle of 8 mm. m3 E3 still passes — a lone mover can put 90 kg into motion at
all, which is the no-hard-denial claim — but the margin is thinner than it was. §2.1 asks to
"allow awkward solo dragging of objects intended for two players", and the honest position is
that solo dragging is now *technically* possible and *practically* not. The dolly is the
intended answer (0.00 m → 2.12 m), which is a defensible design, but it means a player
without a dolly has fewer options than §3.3's "at least two approaches" wants.

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

**`fromZone` is still null on every manifest row.** It is filled at spawn in principle; in
practice nothing sets it, so the invoice cannot yet say an item came out of the bedroom and
went into the kitchen — which is the most legible form of §15.1's room-accuracy line.

## Phase 10 open items

**~~There is no invoice screen.~~ CLOSED in Phase 11.** §21.2's contract UX now exists in
`src/ui/invoiceScreen.js`, and `docs/phase11-playable.png` is the shipping build's own HUD
rather than a panel drawn by the screenshot script. Kept here because the arrangement it
describes — screenshot-rendered content standing in for a missing UI — was also used for the
Phase 7 strap lines, and the Phase 7 note is still open.

**Property damage is priced and unbuilt.** `DAMAGE.property` exists, keyed on impulse
because what a wall suffers really does scale with the mass that hit it, and §15.1 lists it
as its own line. Nothing writes to `ledger.propertyDamage`, because Phase 8's damage system
measures an object's own lost speed and cannot say WHAT it hit. So a scraped wall is free,
which is the single largest hole in the economy: §8.2's whole "preparation versus brute
force" trade assumes wrecking the hallway has a price.

**Tips, and the customer archetype behind them, do not exist.** §12.1 lists "customer
archetype" and §15.2 says reviews assemble from "event tags, outcome, and CUSTOMER
PERSONALITY". The invoice accepts a `tips` argument and nothing ever passes one, and every
customer is the same customer.

**Reputation is not modelled.** §15.1: "Reputation is separate and uses timeliness,
completion, damage ratio, special constraints, and customer tolerance." The grade computes
three of those five and is not persisted anywhere. §16.1's progression loop needs it.

**The prototype route is 4.2 km of constant.** Fuel is `distance × rate` where the distance
is a config value, not a measured drive — which follows from the truck not moving (Phase 7).
It is honest as a fixed cost and it is not yet a "route mistake" the way §15.1's
traffic/vehicle line intends.

**One-trip is assumed, not enforced.** `tripCount` is on the state and nothing increments it,
because nothing yet models going back for a second load. The bonus is therefore always
available, which makes it free rather than earned.

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

**No rebinding, and the keys are hard-coded.** E, Q, Tab, R and F3 are literals in
`main.js`'s key handler rather than a binding table. Fine for a prototype with one tester,
wrong the moment anyone else plays it, and an accessibility problem regardless (§26.5 cares
about readability but the GDD has no input-remapping requirement — it should).

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

**Nothing is animated except the walk cycle.** No doors swing, no wheels turn while the route
runs, the trees do not move, and the mover's arms do not reach for what they are holding —
§5.1 asks for "procedural hand IK" and the hands are still two lime cubes at the hips.
Carrying looks like standing next to something.

**The title card does not pause anything.** Deliberate — the suites drive `game.frame()`
directly and a gated clock would hang all fourteen — but it means the contract clock is
running while a player reads the controls. At 18 minutes of estimate that is negligible, and
it will not be once there is a leaderboard.

**No settings, so no accessibility surface.** `DEFAULT_SETTINGS` has mouse sensitivity, invert
Y, deadzone and §21.4's toggle-grip mode, and none of them are reachable without editing a
file. AirportBaggageCrew's settings panel is in Dev\INDEX.md and is the thing to copy.
