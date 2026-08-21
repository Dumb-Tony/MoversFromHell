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
