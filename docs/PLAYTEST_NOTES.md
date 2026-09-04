# Playtest notes

Required by GDD §25.1 and §25.3: "a playtest note states what became more or less fun."

The §27.3 questions to ask, once there is something to play:

- What did the team try that the game allowed, or unexpectedly prevented?
- When did weight and grip become understandable?
- Did preparation feel like a choice or a chore?
- Could players predict cargo shift and damage?
- Was the invoice funny and useful, or merely punitive?
- Which moment would they tell a friend about?
- Would they replay the same contract differently?

---

## Phase 0 — 2026-08-18

**Nothing is playable yet, and no fun claim is made.** Phase 0 is a loop, an action map and
a scene; there is no character to move and nothing to pick up. The §25.2 gate for this
phase is "loads locally; stable frame/step", which is a correctness gate, not a fun gate.

The one observation worth recording is about the diagnostic scene rather than the game:
putting the couch and three real doorways on screen at true scale, against a metre grid,
made the central clearance problem obvious immediately — obvious enough that the 30 mm
shortfall at a 32" door turned up on day one instead of at Phase 5. That is the argument
for building diagnostic geometry early even when nothing can move yet.

First real entry will be Phase 1 (movement), where "responsive indoors and on ramp" is
something a person can actually judge.

---

## Phase 1 — movement — 2026-08-19

**First build a person can actually move in.** No external playtest yet; this is the
author's note, and §25.3 asks for "what became more or less fun", so:

**More fun.** The mantle is the surprise. It was written to satisfy §5.1's Climbing state
and turned out to change how the test level reads — once you can pull yourself onto a
0.6 m ledge, low geometry stops being scenery and becomes route. That is §8.1's
"architecture as puzzle" showing up two phases before the architecture does, which is
encouraging for the pillar.

**Neutral, and worth watching.** Sprint at 5.4 m/s feels slightly too fast indoors — the
room is 10 x 7 m and you cross it in under two seconds. Not changed yet, because §25.1 says
not to tune on one person's opinion, and because a mover carrying a couch will be slower by
construction from Phase 3. Flagging it so the first real playtest has something to check.

**Cannot be judged yet.** The gate word is "responsive", and responsiveness while carrying
something heavy is the version that actually matters for this game. Right now the mover is
unladen and every input is instant, which is the easy case. The honest read is that Phase 1
proves the controller is not the problem, not that the movement is good.

**Nothing to tell a friend about yet**, which is the correct state for Phase 1 — §29.1 says
make movement feel good before grabbing, and grabbing is where the stories start.

---

## Phase 2 — one box — 2026-08-19

**First build where the game is about an object rather than about walking.** Author's note
again; no external playtest yet.

**More fun, and it is the first time that sentence means anything.** Picking a box up,
turning, and putting it down somewhere else is already a small loop with a shape to it. The
best moment is unplanned: because the hold offset is stored in the VIEW frame, the box
stays where you grabbed it relative to your head — so turning your body swings the box
around you, and you can feel it lag. That is the first hint of §1.4's "physical discovery"
beat, and it arrived from a bug fix rather than from a feature.

**Actively worse, and worth watching.** A one-handed hold swings. Grab a box by a corner
and lift and it pendulums, and if you keep lifting it eventually tears out of your hand.
Correct physics; unclear whether it reads as "I grabbed it badly" (good — that is §6.2
working) or "the game took my box away" (bad). This is the single thing to put in front of
another person first.

**Cannot be judged yet.** Everything about §6.2 that needs a SECOND pair of hands — two
movers on one object, forces adding, opposing inputs twisting it. Phase 4.

**Would I tell a friend about it?** Not yet. But there is now a thing to describe, which
was not true after Phase 1: "you can pick a box up and it swings if you grab it wrong."

---

## Phase 3 — heavy object — 2026-08-19

**First build where an object argues back.** Author's note; still no external playtest.

**More fun, clearly.** The couch is a different KIND of thing from a box, and it took no
special-casing to make it so — the same grip, with mass and a reaction force, produces an
object you approach differently. Grabbing it one-handed and feeling the mover get tugged
sideways is the first moment this has felt like the game the GDD describes rather than a
physics demo.

**The best accident.** Being knocked down drops what you were carrying, because that is the
consequence rather than a state flag. Overreaching with the couch and watching it land on
the driveway while the mover picks themselves up is genuinely funny, and it is §18.1's
"escalate through wobble → warning → failure → new problem" happening without anyone
authoring a wobble.

**Actively worse.** Dragging is unsatisfying. You can get the couch moving but not keep it
moving, so it shuffles. Right now the honest way to move a couch is to lift it with two
braced hands and waddle, which is not what §6.3 describes. This is the thing to fix before
Phase 4, because co-op will be judged against it.

**Cannot be judged yet.** Everything two-person. §6.2's "mover count — forces add; opposing
inputs can twist objects or drag teammates" is the payoff the whole heavy-object model is
building toward, and it is Phase 4.

**Would I tell a friend about it?** Yes, one thing: "I tried to carry a couch on my own and
it knocked me over." That is the first sentence out of this project that sounds like the
game it is meant to be.
## Phase 4 — the cooperative seam — 2026-08-20

**The phase where the design's central bet paid off.** Author's note; still no external
playtest, and this is the phase where that limitation starts to bite hardest.

**Nothing had to be written for co-op.** That is the finding. Two movers holding one couch
required a config block, a loop, and a key to swap between them — the cooperation itself is
just two force-at-a-point springs on the same rigid body. §6.4's "forces add" is not
implemented anywhere; it is arithmetic that Rapier was already doing. Every other approach I
have seen to this problem involves a carry state, an owner, and a synchronized animation, and
the GDD explicitly forbids all three (§14.2). It was right to.

**The moment it became real.** One mover heaving at a couch that will not move, then the same
couch coming off the ground the instant the second pair of hands arrives. 458 N against
895 N, with the couch's 883 N sitting between them — the number is not a threshold anyone
authored, it is just what 90 kg weighs. That is exactly §6.3's promise: nothing refuses, the
cost changes.

**The best accident, again from consequences rather than authoring.** Knock one mover down
while both are carrying and the couch does not drop — it slews violently as it swings onto
the remaining grip. Nobody wrote a "partner staggers" behaviour; one spring stopped and the
other kept pulling from where it was.

**Actively worse — and it is my own doing.** Tab-swapping breaks the fiction badly. You are
one person driving a statue, not two people cooperating, and the moment you swap you lose
track of which body you are in even with the colour coding. The colours help less than I
expected. This does not undermine the gate — the gate is about forces, and the forces are
right — but it means I have learned almost nothing about whether co-op is FUN.

**Cannot be judged yet, and this is now the biggest gap in the project.** Everything about
this game's appeal is supposed to come from two people fumbling a couch together. I have
measured that the physics support it and observed nothing at all about whether it lands. The
next genuinely informative thing that could happen to this project is two humans and one
couch, not another phase.

**The near-miss worth recording.** I nearly shipped "two movers can lift a couch" as a pass
on a measurement that was counting the couch tipping onto its back edge as lifting. The
centre rose 0.148 m; the lowest corner never left the floor. Both numbers were real and one
of them meant nothing. Every physics claim in this suite is now made against clearance,
force, or a controlled A/B, never against a single number that "looks like" the thing.

**Would I tell a friend about it?** Yes, but the sentence has changed and got worse: "watch
this couch come off the ground when the second guy grabs it." That is a sentence about a
simulation, not about a game. Phase 3's was "I tried to carry a couch on my own and it
knocked me over" — a story. Phase 4 made the game more correct and less funny, which is
probably the right trade at this point in the build order, but it is worth noticing.

## Phase 5 — the house puzzle — 2026-08-21

**The first build that looks like a job rather than a laboratory.** Author's note; still no
external playtest, and Phase 4's warning about that has now become the project's main risk.

**Seeing the plan view changed my mind about the layout.** Three rooms, 23 objects, and the
route from the front door to the bedroom passing through two openings on perpendicular axes.
Reading it as a floor plan makes the job legible in a way the object list never did: you can
see which room is going to be the problem before you touch anything, which is exactly what
§8.1 means by "critical clearances must be visually legible".

**The fridge is the best thing in the house.** 110 kg, 1.75 m tall, narrow, and top-heavy
because its centre of mass is set ABOVE its geometric centre. It does not drag like the
couch — it wants to tip, and it takes two people leaning on it to do anything at all. It is
the first object that suggests its own solution (get a dolly) rather than just being heavy.

**Actively worse: the house is now full of things I cannot pick up conveniently.** With 23
objects and no dolly, no straps and nowhere to put anything, the honest verdict is that
Phase 5 built the PROBLEM and Phase 6 builds the answer. Walking into a full living room
with two hands and no equipment is faintly demoralising, which I suspect is the correct
feeling for about ninety seconds and the wrong one after that.

**The near-miss.** 17 of 23 objects reported as immovable, including a 9 kg box — and the
game was fine. The test was staging every object on the same square metre of ground and
leaving it there, so each new object spawned inside a growing heap of the previous ones. It
looked exactly like a physics regression. The tell was that the couch and armchair passed:
they went first, when the pad was still empty. Second phase running where the measurement
was wrong rather than the game.

**Cannot be judged yet.** Whether the doorway turn is fun. Everything about this phase
points at that one question and none of it answers it.

**Would I tell a friend about it?** Not yet, and that is a change from Phase 3. "Here is a
house with 23 things in it and a corner you have to pivot a couch around" is a description
of a task, not a story. Phase 3's sentence was better because something went wrong in it.
The house needs tools and consequences before it produces stories again — which is precisely
the order §29.1 puts them in.

## Phase 6 — tools — 2026-08-21

**The first phase where the game got easier on purpose.** Author's note; still no external
playtest.

**The fridge on the dolly is the best thing in the build.** 110 kg, immovable by one person —
measured at literally 0.00 m in three seconds of hauling — and then it glides. The number
that changes is friction, 0.48 to 0.04, and nothing else about the object changes at all: it
still weighs 110 kg, still has to be steered, still tips if you look at it wrong. That is
exactly what §9.1 means by "new physical solutions" rather than permissions, and it is the
first time a tool in this project has felt like a tool rather than an unlock.

**And the dolly is genuinely dangerous, for free.** Nobody wrote a runaway. Taking the
friction away is what a dolly IS, and 0.04 cannot hold 883 N of couch on a 16° slope: peak
speed on the ramp goes from 0.50 m/s bare to 2.97 m/s on wheels. The best failure modes in
this project keep turning out to be the same line of code as the feature.

**Actively worse: none of it is reachable.** Every tool works and no player can touch one.
There is no interaction verb wired up, so the entire phase is API-only. In a real playtest
this phase would score zero, and that is not a physics problem — it is forty lines of input
plumbing I chose to defer past the gate. It is at the top of KNOWN_ISSUES for a reason.

**The near-miss, and it was a big one.** The dolly appeared to do nothing for an hour. Couch
0.20 m bare, 0.36 m on wheels — a real improvement, easily rationalised as "well, it is still
90 kg". It would have shipped as a tuning problem. The actual cause was that Rapier averages
friction coefficients with the floor, so an 8.75× reduction was arriving as 1.3×, and every
friction figure quoted in this repo since Phase 3 was wrong by about 1.8×. Found by a
twenty-line probe that applied 400 N to a parked couch and watched it move 14 mm. Third phase
running where the honest move was to stop reasoning and measure one thing directly.

**What I decided not to do, and it was uncomfortable.** The principled fix — Min everywhere —
broke two suites that had been green for four phases. Phases 2 through 5 were tuned by
measurement against the wrong model, which means they were tuned correctly against the real
one. Narrowing the fix to the dolly and writing the finding down properly is the right call,
but it does leave a known-wrong comment set behind, corrected in place rather than by
re-tuning. If this were the production codebase I would re-tune. It is not; it is the
laboratory, and §24 says the tuning ranges transfer, not the code.

**Cannot be judged yet.** Whether four tools is the right number, whether the dolly trivialises
the heavy tier, and whether the blanket is interesting or just admin. All three need a player.

**Would I tell a friend about it?** "I put the fridge on a dolly and then it got away from me
down the ramp." That is a story again, and it is the first one since Phase 3.

## Phase 7 — cargo — 2026-08-21

**A truck you load by carrying things into it.** Author's note; still no external playtest.

**The gate measurement is the most satisfying number in the project so far.** Same six items,
same places, same hard brake: 1.645 m of shift unstrapped, 0.141 m strapped. Nothing in that
comparison is scored or judged — the straps are ropes, the brake is a force, and the
difference is what the solver did. §10.4 insists that outcomes "derive from physical contacts"
and forbids secretly damaging items, and building it that way turns out to be *easier* than
the alternative, not harder.

**Three separate numbers each made a documented state unreachable.** A strap that needed
1.31 m of stretch to feel stressed, a ratchet whose first click exceeded the strap's breaking
force, and a truck deck with the friction of a lounge carpet. None of them would have thrown
an error; all three would have shipped as "straps feel weak". The lesson from Phase 6 keeps
repeating: the failures worth finding are the ones where the code runs perfectly and the
number is wrong.

**Actively worse: this phase is the least playable one yet.** You cannot attach a strap, you
cannot see a strap, and the truck does not go anywhere. Everything asserted is real and none
of it is reachable by a person holding a keyboard. Phases 6 and 7 have both banked physics
and deferred interaction, and that debt is now large enough that I would not put this build in
front of a playtester without spending a day on input and HUD first.

**The best accident I have not seen yet.** An unstrapped fridge travelling 1.6 m up the deck
during a brake is, in principle, extremely funny — it is the whole promise of the game. I have
only seen it as a number in a test log. That is the gap between this project being correct and
being fun, and it is not going to close by adding Phase 8.

**Cannot be judged yet.** Whether packing is the "cooperative 3D Tetris" §10.1 promises.
Loading is currently a solitary API call, which answers nothing.

**Would I tell a friend about it?** Not from this build. "The truck is a real box and the
straps really hold" is an engineering claim, not a story.


## Phase 8 — the drive — 2026-08-21

**The first time the game punished a mistake without being told to.** Author's note; still no
external playtest.

**The three-row table is the whole project in miniature.** A good pack arrives with nothing
broken. A bad pack arrives with the television face-down by the door and a charge on the
invoice. The same bad pack, parked for the same 28 seconds, arrives perfect. Nothing anywhere
reads a score and decides an outcome — §10.4 forbids it, and building it that way is what
makes the third row possible at all. It is the strongest evidence so far that the design's
central bet is sound.

**The screenshot took no arranging.** I placed six objects badly, applied one brake, one turn
and one bump, and photographed where they ended up. The television sliding flat to the open
rear door is not a scripted moment; it is 22 kg with nothing holding it on a 0.32-friction
deck.

**Actively worse — and this is now a pattern worth naming.** Phase 6 deferred the interaction
verb, Phase 7 deferred strap UI, and Phase 8 has deferred all of §11.2's driving. Three phases
of physics with no way to reach any of it. Each deferral was individually defensible against
its own gate; together they mean the build has advanced four phases without becoming more
playable. If I were advising someone else on this project I would tell them to stop and spend
a day on input and HUD before going further.

**The near-miss.** An unstrapped load driven through the entire route shifted one millimetre,
and the route, the events, the forces and the targets were all correct. The system was
registered one slot too late in the frame. Second time in this project that a force system
was defeated by ordering rather than by arithmetic, and the tell was the same both times: a
number so small it could not be a tuning problem.

**Cannot be judged yet.** Whether the drive is TENSE. A 28-second timeline with three events
you cannot influence is not a test of nerve, and §11.1's "final exam for packing" implies the
player should be sweating through it. Right now they would be watching.

**Would I tell a friend about it?** Yes: "I stacked the fridge on the dresser, and by the time
we arrived the telly was face-down in the doorway." That is the sentence this game is for, and
it is the first one since Phase 3 that came out of consequences rather than out of a tool.

## Phase 9 — the destination — 2026-08-21

**The first build with two ends to it.** Author's note; still no external playtest.

**Seeing all 23 objects standing in the right three rooms is oddly satisfying**, and I think
that is a real signal rather than author's pride. The floor-plan shot of the destination is
the first image in this project that looks like a JOB FINISHED rather than a system working.
Whatever else is wrong with the build, the shape of the loop — empty that house, fill this
one — reads at a glance.

**The decision I am least sure about.** Delivery completes at the building, and the right
room is scored rather than required. §3.4 can be read the other way, and a stricter reading
would make the manifest more like a checklist and probably more tense. I went with the
reading that never says no, because two of the three relevant sections and §2.1 all point
that way — but this is the one Phase 9 decision I would put in front of a playtester as an
explicit A/B rather than defending.

**Actively worse: nothing was carried.** The manifest completes because the test puts objects
where they belong. That is the correct way to test *validation*, and it is not a test of
unloading, and I should not pretend otherwise. Four phases have now proven physics that no
player can reach. The gap between "this project is correct" and "this project is playable" is
the biggest thing in it.

**Three fixtures in a row measured the wrong thing** — piling the manifest into one room, then
rotating rooms, then swapping target rooms — and each failure looked like a delivery bug when
it was a fact about whether 23 objects fit in a 4.5 × 3.0 m room. The fix was to change the
one variable I actually meant to change: swap two IDENTICAL objects between rooms, so nothing
about the geometry moves. Fourth phase running where the tell was a number that was too
plausible to be a bug.

**Cannot be judged yet.** Whether being told "the dresser goes in the bedroom" and then having
to get it there is interesting or just admin. It depends entirely on the carry, which is the
part not built.

**Would I tell a friend about it?** Not about this phase on its own. "The game correctly
notices when the sofa is in the right room" is not a story. But the two houses together are
the first time the build has a beginning and an end, and that is worth something.

## Phase 10 — the economy — 2026-08-21

**The first time the game told me a story I had not written.** Author's note; still no
external playtest.

**The invoice is the best thing in the project.** Twenty-one items delivered, all in the
right rooms, ninety seconds over the estimate, one television destroyed on the way in, one
recovery callout — and a loss of 630.64 at grade D, with every line saying exactly which of
those facts it came from. I did not author any of that. I dropped a television and the
invoice explained the afternoon.

**"I heard the television before I saw it."** The review picking that line out of what
happened, over "everything delivered", is the moment §15.2's design clicked for me. A review
that leads with the good news is a press release. The salience ordering that makes it lead
with the bad news is ten lines of code and it changes the whole tone of the screen.

**Actively worse — and it is the same sentence I have written five times now.** There is no
invoice screen. Every number is real and none of them is on screen in the shipping build.
Phases 6 through 10 have each banked a system and deferred its interface, and the compound
effect is a game that is correct in eleven test suites and unplayable in a browser. That is
the single most important fact about this build and no further phase will change it.

**What genuinely surprised me.** That a competent job loses money if you break one expensive
thing. The television is 900, the base contract is 900, and the labour on an 18-minute job
with two movers is 504 — so one broken TV is roughly the entire margin. That is not a number
I tuned toward; it fell out of §7.1's replacement values meeting §15.1's labour rate. It also
happens to be exactly the tension the game wants: hurry and you break things, take care and
the clock eats you.

**The one I am least sure about.** Property damage is priced in config and charged nowhere,
because Phase 8's damage model measures what an object lost rather than what it hit. So you
can destroy a hallway for free. §8.2's whole preparation-versus-brute-force trade assumes
otherwise, and I suspect that hole is why the doorway turn has never felt like a real
decision — there is currently no cost to just shoving.

**Cannot be judged yet.** Everything. Eleven gates have passed and the north-star question —
is this fun with friends — is exactly as unanswered as it was at Phase 0. The build now has
every system §25.2 asks for before the playtest phase, and §13.5 is blunt about what comes
next: "a feature-complete prototype that is not fun is a failed prototype, and should be
revised, not expanded."

**Would I tell a friend about it?** Yes, and for the first time I would show them the invoice
rather than the game: "we moved a whole house, and lost six hundred quid because I dropped
the telly." That is the sentence this project has been trying to produce since Phase 0.

---

## Phase 11 — the playable layer — 2026-08-23

**What became more fun:** all of phases 6–10 at once, because none of it could be reached
before. That is a real observation and not a joke about the previous eleven entries — the
build has had a working strap system since Phase 7 and this is the first session in which
anyone could put a strap on anything. The thing that actually changed is the distance
between deciding to do something and doing it, and it went from "edit a test file" to
"press E".

**§27.3 — what did the game allow that was unexpected?** Straps go on things that are not in
the truck. Nothing checks that the cargo end of a strap is inside the cargo box, so you can
anchor a strap to the truck and walk it out onto the driveway and attach it to a couch.
Physically this is nonsense — the strap then drags the couch toward the truck at up to
1200 N — and it is also the funniest thing in the build, and §3's "consequential chaos"
pillar argues for keeping it. Filed as a decision to make, not a bug to fix: it is either a
winch, or it is a validation check. It should not stay ambiguous.

**§27.3 — did preparation feel like a choice or a chore?** Closer to a choice than it was,
for a reason that has nothing to do with the tools themselves: the prompt names the cost
before you commit. "put couch 3seat on the dolly" tells you the dolly is the answer to this
couch, so the decision is whether to walk back for it, not whether the tool exists. Before
this phase the tools were invisible in the strict sense — you had to know they were there.

**§27.3 — could you predict cargo shift and damage?** Only for straps, and only because they
are now drawn. Watching a strap sag and then snap taut over a bump is the first time the
packing state has been legible in motion rather than as a number in a panel. The
`unsecuredFraction` readout in the cargo panel was in the build for four phases and never
once changed a decision; the sagging line changed one within a minute. §26.5's "readable
without a UI layer" is doing real work here and should be applied to more than straps.

**What became less fun, or at least less clear:** the reticle is crowded. With a tool in
hand and something grabbable ahead, the grip hint and the interaction prompt overlap
(KNOWN_ISSUES). Two systems each politely telling you what a different button does, in the
same 200 px. §21.1 protects the screen edges and leaves the middle unowned.

**Which moment would you tell a friend about?** Pressing Q while holding a screwdriver in
front of a couch with a leg off, and having it put the leg back on. It is the smallest
possible feature and it is the one that makes the verb feel like it understands the
situation rather than the keypress. Worth noting that this is exactly the case that was
BROKEN until the suite caught it — Q dropped the screwdriver instead, which made reassembly
unreachable. The difference between the best moment in the phase and a dead end was the
ordering of two conditions.

**Still unanswered:** every §27.3 question about the TEAM. There is one keyboard and Tab
swaps between movers, so nothing here has been tested with two people, and the questions
that matter most to the north star — what did the team try, when did they coordinate,
would they tell a friend — cannot be asked yet. The build is now playable enough that this
is the only thing standing between it and a real playtest.

---

## Phase 12 — local co-op — 2026-08-23

**What became more fun: §27.3's questions can finally be ASKED.** Every playtest note since
Phase 4 has ended with some version of "this needs two people and there is only one". The
build has had a working cooperative seam for eight phases — two grips combining on one
couch, opposite-end grips stabilising it, both measured — and the only way to experience it
was to hold one end, press Tab, and walk the other end over. That is a demonstration of a
mechanic, not an experience of it.

**§27.3 — when did weight and grip become understandable?** Immediately, and for a reason
that has nothing to do with the physics, which did not change at all: you can now get it
WRONG in a way that is somebody else's fault. Solo, a couch that pivots badly is a thing the
game did. With two people it is a thing one of you did, and the difference is that you both
say something about it. The measured force is identical. The legibility is not.

**§27.3 — what did the team try that the game allowed?** Lifting from the same end. Nothing
forbids it — §2.1 does not do refusals — and the couch behaves exactly as it should, which
is to say it slews, and the person at the empty end is dragged sideways by their own grip.
It is the first genuinely funny thing in the build that nobody designed. §3's consequential
chaos pillar is doing real work here and it is worth protecting from a future "helpful"
grip-placement assist.

**What became less fun: half a screen is not half as good, it is narrower.** A 16:9 view
split side-by-side gives each player 8:9, and the game is about judging whether a wide thing
clears a gap. Doorways are fine — they are tall and narrow and so is the viewport. The
problem is the truck: backing a couch into a 2.10 m cargo box while seeing 8:9 of the world
means the walls leave frame before the couch does. Stacked would be worse (16:4.5 cannot see
a wardrobe), so this is the better of two compromises rather than a good answer. The real
answer is a shared camera, which the aim model currently forbids — see the changelog.

**The camera boom needed shortening and that was not obvious.** 4 m behind the mover frames
a room at full width and frames a corridor at half width. `COOP.cameraDistance` is 3.2, and
the number came from trying it, not from arithmetic — which makes it exactly the kind of
value §25.3 wants named and documented rather than sprinkled.

**Still unanswered, and now askable:** whether two players naturally split up or stay
together. The suspicion from the physics is that the game rewards staying together far more
than a moving job actually should — one person can carry a box, but two people can carry
almost anything, so the optimal play may be to never separate. If that is true, the house
layout (§13.1) is doing less work than it should, and the fix is a manifest with more small
objects than two people can carry between them rather than fewer large ones. That is a real
design question and it needed two people to even pose it.

**Which moment would you tell a friend about?** Both players pressing grab on the same couch
at the same moment and feeling it come off the ground — the exact thing §6.4 describes and
the thing this project has been building toward since Phase 4. It took eight phases to
become reachable and it works on the first try, because the physics under it was right all
along and only the seat was missing.

---

## Phase 13 — the art pass — 2026-08-23

**What became more fun: judging a gap.** This is the one that surprised me, because an art
pass is not supposed to change how anything plays. A flat-shaded box against a flat-shaded
wall gives the eye almost nothing to measure with — you know the couch is 2.1 m because the
metre grid says so, not because it looks it. Textured surfaces have SCALE in them: floorboards
are a known width, brick courses are a known height, and the cardboard flutes on a box read as
corrugation rather than as stripes. Standing a couch next to a door frame is legible now in a
way it was not, and nothing about the geometry changed.

**§27.3 — could players predict damage?** Better, for one specific reason: the FRAGILE
stencil. §7.2's fragility band has been a number in a definition for eight phases and the
only way to know a box was fragile was to break it. Now the box says so, in the place you are
already looking — which is §26.5's "readable without a UI layer" applied to the one property
that costs the most money.

**What became less fun, and then did not: the interior.** The first version of this note said
the inside of the house was a lit box with furniture in it, and blamed the lighting model.
The real cause was that Lambert shades per vertex, so a wall was lit at four corners and
interpolated — the rooms could not have been fixed by adding lamps to them.

With that changed, the thing that made the biggest difference indoors was not a light at all:
it was the **skirting board**. A baked shadow line where the wall meets the floor gives the
eye an edge to sit on, and a room stops being a set of separate planes. The shadows under the
furniture are what stop objects hovering; the skirting is what makes the room a room.

**§27.3 — did the interior get easier to judge?** Yes, and specifically for HEIGHT. A shadow
on the floor tells you where an object is; a shadow on the WALL behind it tells you how far
from the wall it is. Backing a wardrobe into a corner used to be guesswork and now is not,
which matters because §13.1's doorway turn is the hardest spatial problem in the build.

**The metre grid coming off was the single biggest change**, and it cost nothing. Twelve
phases of screenshots had a dev grid painted across the lawn. Moving it onto F3 took one line
and it is the difference between "here is a physics test" and "here is a game", before a
single texture is considered.

**Which moment would you tell a friend about?** Reversing round the back of the truck and
seeing MOVERS FROM HELL / WE MOVE IT · YOU WATCH · SOMETHING BREAKS on the side of it. The
game has had that name since day one and this is the first time it is IN the game. It also
does something no README can: it tells a player what tone to expect before they touch
anything.

**Still unanswered:** whether any of this survives contact with a player. Everything in this
phase was judged by me, in screenshots, against my own taste — which is exactly the kind of
evidence §25.3 warns about ("assert measured values, not vibes"). The measured claims here
are all about faithfulness (nothing overhangs, nothing blocks a door, nothing added a
collider); whether it LOOKS good is a claim I cannot test and have not.

---

## Phase 14 — the toy pass — 2026-08-25

**What became more fun: telling the movers apart from the furniture.** Chunky proportions
and an oversized head make the crew read as CHARACTERS at a glance, where before they were
two more boxes among twenty-three. In split-screen this matters twice — you find your own
body in your half by silhouette now, not by hunting for the hue.

**The reach changed what carrying FEELS like without changing one number in the physics.**
The grip forces are identical to Phase 4's. But an arm stretched toward the couch with the
hand ON it says "I have hold of this" in a way a cube at the hip never did — and when the
grip stretches near breaking, the hand visibly leaves the arm's comfortable range, which is
§6.2's grip-stretch made legible for free.

**Which moment would you tell a friend about?** Two movers carrying the couch with all four
arms reaching to it. It is the game's whole thesis in one image, and it has been true in the
solver since Phase 4 — this is the first time the bodies agree.

**Still unanswered:** whether the toy read survives the DRIVE, where the camera sits far
back and the rounded edges subtend a pixel. The direction was chosen on carrying scenes;
the route needs its own look at.

## Phase 15 — the Overcooked overhaul — 2026-09-04

**What to look at.** Stand on the driveway and look at the house: siding, shingles, plaster
and glass should read as four different *materials*, not four colours. Walk inside: the
plank floor has grain and per-plank tone, the skirting is a real board, the pendants glow
(the only thing that blooms — the sky never does), and every box and couch has a soft dark
patch under it that fades as you lift it. Carry a box to a window and turn: the cardboard's
face stencil stays centred and the tape catches the light differently from the card.

**The crew.** Same proportions as Phase 14 — pinned in a test now — with hi-vis that
glints, denim that doesn't, and hands that still land on the grip points.

**A/B switches worth trying** (all URL queries):
- `?post=off` — the raw frame. Bloom, warm grade, lift and vignette gone; this is what the
  toy pass looked like with the new materials.
- `?shadows=pcf` — hard-edged PCF instead of variance shadows.
- `?tier=software` — what the test harness sees: no bump, no env, no rim, no blobs, no post.

**Watch for (first playtest of this look):**
- Any surface that still reads as flat colour — paint on the truck is *meant* to (gloss + env
  is its texture); anything else is a missing kind.
- Blob placement on the porch steps and the ramp (a ray straight down; sloped floors are
  the edge case).
- Rim light on the far side of a mover in co-op — the rim tracks each seat's camera; if one
  half looks rimless, the per-seat hook is not firing.
- Frame time on a real GPU: the frame is ~1600 draw calls solo with every shadow map, blob and post pass; the
  harness cannot measure time, only the player can.

**Not tested yet:** Firefox and Safari (post chain self-disables on a GL error; Safari
textures are crisper for lack of `ctx.filter`).

## Phase 16 — Phase 11 build side, batch 1: the phase machine, the pause card, and the traction sweep — 2026-09-04

### M1

M1 (2026-09-04): no human session. Developer observation from the m11 drive: the contract panel now changes word at the cab (pickup → transit) and again at arrival (→ delivery) with the "arrived — unload through the back" notice; before this the panel said pickup through the entire 28 s drive and the notice had never once fired in any build. Phase durations for the scripted run: pickup ≈ 1.0 s (warm-up), transit 28000 ms, delivery ≈ 6 s, settlement 0 (paused). A tester who pressed Q to put a tool down would previously have watched it vanish through the ground — fixed; worth asking §27.3 Q1 ("what did the game unexpectedly prevent?") about tools specifically once M6's questionnaire exists.

### M3

**Pause (M3, 2026-09-04).** Esc or the pad's Menu button opens the card; the first Esc while the mouse is captured is eaten by Chrome releasing the pointer, so the lost lock is treated as the press — one Esc, one card, every time (m15 P8b). Alt-tab pauses with 'paused — window lost focus' on the card, which was the playtest-ending defect: before this a blurred player came back to a frozen world, a released pointer and a canvas click that did nothing, with 'PAUSED' visible only in the F3 overlay. Resume by clicking the card or its backdrop (re-captures the mouse), by Esc/Menu (then click once to look), or restart the contract from the card without going through settlement — the same unwind as 'Run it again' (m15 P4b-P4h: pickup, 23 rows, 0 straps, clock at 0). A controller alone can now start (A), pause (Menu), join/leave (View) and recover (D-pad down); before M3 a controller-only player could do none of the four. The review's live probe found the View join flickering with a real pad (a 3-9 frame human press ended solo half the time); pad edges are now keyed by physical slot and an 8-frame hold on a stubbed pad joins once and stays (m15 P7h). The F3 overlay is off unless asked for. Screenshot: `tools\shot.ps1 -Setup tools\_shot-pause.js -Out docs\phase16-pause.png` (1600×900).

### M7

**Phase 11 M7 — dragging: unchanged in the hand, and now we know exactly why.** Nothing a solo player feels has changed: a couch grabbed one-handed still shuffles (0.00 m in 3 s, held), braced or not. What changed is that the shuffle is now a measured ceiling rather than a mystery — the hand's damping brakes the couch against the WORLD, so it cannot follow a hand faster than 0.14 m/s (0.25 m/s braced), and the pull that hauls the mover back is the only thing keeping the hold from tearing. A traction budget was swept 0–560 N with a probe: every value that let the couch move either tore the hold and sent the mover strolling seven metres, or (braced 400 N: a quarter-metre) let a lone braced mover topple the fridge, which would erase the one 'you need a second person or the dolly' fact the contract has. Shipped at 0, on purpose, with the numbers next to the code. For the external playtest: the dolly (2.12 m) and a second pair of hands (1.34 m one hand each) remain the honest answers, and bracing while towing two-up is worse (0.05 m) — expect testers to discover that and call it a bug; it is the same limit cycle and is in KNOWN_ISSUES. Hand-frame damping is the fix, next increment.


## Phase 17 — Phase 11 build side, batch 2: replay unwinds and a three-run soak, the settings card, prompts that speak your device — 2026-09-04

### M2

**M2 (developer notes, 2026-09-04).** "Run it again" is now an honest replay. Before this batch, pressing it after a run that used the dolly left the couch on invisible wheels for the rest of the session (friction 0.04, Min rule), a wardrobe with its doors off stayed small for ever, a tool in your hands when the invoice came up dropped through the floor and was gone, run 1's recovery callout appeared on run 2's invoice, and — worst — nothing you broke on run 2 was ever billed, so the second run always graded better than it deserved. §27.3's seventh question ("Would they replay the same contract differently?") can now be asked of an external group without the second run lying to them. The three-run soak (tools/m14-soak-tests.js, 8 s) is the check to rerun after any change to `resetContract`, `respawnContract`, `DamageSystem` or `StrapLines`; it fails loudly with the numbers if any counter drifts between run 1 and run 3.

### M4

**Settings (M4, 2026-09-04).** No human session yet. Developer observations from the m16 run and the two headless shots:

- **Before/after look rates.** Pad right stick and seat 1's UHJK keys accumulated per POLL, so the turn rate followed the monitor: 2.6 × 10 = 26 units per frame → 3.43 rad/s at 60 Hz, **6.86 rad/s at 120 Hz**; keys 15 units → 1.98 rad/s at 60, 3.96 at 120. Now `poll(frameMs)` scales by the frame length: **3.43 / 1.98 rad/s at any refresh rate**, and a backgrounded tab's 1000 ms frame is capped at 250 ms (15 frames of look, not 60). Nothing changes on a 60 Hz display; a 120/144 Hz player who found the stick twitchy will find it half as fast. Mouse look is per pixel and was never affected. The 'sensitivity' sliders therefore mean something: 2× is twice the rad/s.
- **Toggle grip** is reachable for the first time (§21.4 accessibility). Press LMB once to hold, once to let go; the latch clears when the mode is switched so nothing is left 'held' by a button nobody is pressing. Untested by a human — the interesting question is whether a toggled two-hand carry reads as intended or as 'the game won't let go'.
- **Text size** 80-160 %. At 150 % the prompt is 18 px and the contract panel 16.5 px and the centre third is still clear; the title and pause cards scale with it. Panels keep their px min-widths — watch the co-op help line at 160 %.
- **Camera distance** 1.6-7.0 m (solo). At 7 m the whole porch is in frame and the reticle prompt is small; at 1.6 m the mover fills the view — the default 4.0 m is the Phase 1 feel number and nothing here retunes it.
- **The card is reachable from the title** (a small Settings button under START THE JOB) and from Esc/Menu. Escape closes it without resuming; the pointer is not re-captured on Done — click the game.
- **Watch for:** a saved 'gpu' tier on a machine that has fallen back to software rendering (a slideshow the player chose; 'auto-detect' fixes it); whether anyone finds the trigger-pull slider before finding that LT/RT grab at all.

### M5

**Prompt glyphs per seat (M5).** Before: both halves said 'E use · Q undo' and 'hold LMB / RMB to grab'; P2 on arrows/[ ] or a pad had to be told the real keys out loud. After: P2 reads "' use · ; undo" and 'hold [ / ] to grab' on the keyboard, 'X use · RB undo' and 'hold LT / RT to grab' on a pad, and the seat tag says 'P2 · p1 · keys' or '· pad'. The switch lands 250 ms (15 steps) after the first pad input and never on a one-poll stick blip (m12 K3: 233 ms no, 267 ms yes, 100 ms flicker ignored). Watch for: a pad with real drift above the 0.18 deadzone will flip a keyboard player's glyphs to pad every 250 ms while they type — if a tester reports 'the prompt keeps changing to X', it is drift, and the fix is the deadzone setting (M4), not the debounce.

**Objective line.** Top-left, one row under the contract panel: 'carry a box to the truck out front' → 'load 22 more, or drive from the cab' → 'on the road — 41% there' → 'unload — 23 left, each to its room'. It names the place, never the key; the key is on the prompt when you get there. Ask testers whether the first line got them to the truck without the help bar.

**Room hint.** Looking at any manifest item now reads 'couch 3seat → living room — hold LMB/RMB to carry' before it is picked up. The room disappears once it is delivered to the right room and stays while it is in the wrong one. First-delivery 'right room 0/1' surprises should drop; note whether testers still carry to the wrong room with the line on screen.

**Stall hint.** 30 s after START THE JOB with no grip by anyone, one green notice per seat: 'hold LMB / RMB on a box to grab it — two hands for the heavy ones' (LT / RT on a pad). Once per run; a replay re-arms it. It fires on the sim clock, so a paused tester is not nagged. Note the time-to-first-grip for testers who saw it versus those who did not — if most see it, 30 s is too long for the first minute and should come down.

