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

