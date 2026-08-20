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
