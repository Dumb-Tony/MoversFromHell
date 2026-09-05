# Changelog

Required by GDD §25.1. One entry per increment, newest first. Each entry states the
behaviour hypothesis, what it touched, and what was checked.

## Phase 31 — Phase 11 build side, batch 16: the manifest, and the impulse the solver hides — 2026-09-05

Phase 11's build side (GDD §25.2: onboarding, settings, instrumentation, fixes), from the ordered plan in docs/PHASE11_PLAN.md. Each milestone was built by a file-owned implementer and adversarially reviewed against its brief; the numbers below are the ones the reviews reproduced.

**4529 assertions across 42 suites, all passing.**

### M33

### M33 — The manifest itself: a card that filters by room and kind and says where every item is and what shape it is in (§21.2, §21.1, §15.2, §8.3, §26.5)

**Hypothesis.** M24 closed four of §21.2's five sentences. The fifth is the manifest view, and the build had never had one. The HUD shows 'manifest 4 / 23' by design — §21.1 forbids a checklist on screen, and hud.js's five-row summary is that rule made concrete. The title's brief profiles the job before it starts and the settlement sheet reports it after it ends. During the contract nothing answered *what is left, where does it go, what did I break*: a player carrying the twenty-second box had no way to find the last one, and room accuracy (§15.2, worth ECONOMY.roomAccuracyBonus on the invoice) was invisible until it was too late to fix. This is that list, kept off the HUD and behind a key so §21.1 still holds.

**What it is.** `src/ui/manifestScreen.js` — a card opened by a new on-foot action `manifest` (M on the keyboard, the pad's D-pad up, a rebindable Controls row on both seats) or from the pause card's 'The manifest' button. It lists every required row: the def's words, its destination room, its state, its condition band and percentage, and the tokens — two-person, parts off (N), wrong room, damaged. A footer counts delivered / total, the rooms right so far, and the parts still missing, and adds a segment when a house door is off its hinges (M11). Three filter axes as chips, not a search box: room (every destination room a row is bound for), kind (§8.3's def categories) and state. **Every state, band and warning is a WORD** (§26.5); the tint on the tokens is the redundant half.

**It pauses nothing** (§2.2). The clock runs, the labour bills and the cargo keeps settling behind it — measured: 60 frames with the card open advance the sim clock by more than 900 ms, run more than 50 steps and bill more than 900 ms of labour, with `state.paused` false throughout. What it does do is release the pointer lock so the cursor can reach the chips; `input.onPointerLockLost` is told to read that one release as what it is rather than as the Escape Chrome swallows.

**Rebuilt on change, never per frame.** It subscribes while open and unsubscribes on close — CARGO_STATE, GRIP_STARTED / GRIP_ENDED, PART_CHANGED, DAMAGE_APPLIED, DOOR_STATE, CONTRACT_PHASE, SIM_RESET — and compares a short fingerprint of the four facts written silently inside the step, because §23.3's ZONE_CHANGED is emitted by nothing, condition changes at impact but is posted when the aggregation window closes, and PART_CHANGED belongs to the interaction that called `disassemble` rather than to `disassemble`. Measured: **120 quiet frames with the card open rebuild the list 0 times**, and 90 more after a run of real changes rebuild it 0 times; one grip is exactly one rebuild, one disassemble is exactly one rebuild.

**Shell state throughout** (§22.4; m0 E8). Three open/close cycles change the document element count by 0, the scene child count by 0 and the body count by 0; a closed card holds no rows. The three filters live on the card, survive closing and reopening within a session, and are deliberately not in the save — a filter is where you were looking a minute ago, not a preference. The save still has exactly its seven sections.

**A sixth state, deliberately.** §21.2's set — at pickup / carried / on the truck / delivered / left at the old house — has a hole the build actually has: an item carried off the truck and set down in the new house's hallway is none of the five until `MANIFEST.dwellMs` of settled dwell makes it delivered. `rowWhere()` already names that place and the invoice already bills it, so it gets its own word, **'at the new house'**.

**Numbers.** 23 rows on the shipped contract, split 8 living / 8 kitchen / 7 bedroom and 9 box / 5 small / 3 medium / 3 large / 2 fragile / 1 showcase; three rows want two people (couch, mattress, wardrobe). The footer at boot reads `0 / 23 delivered · rooms right 0 / 0 · no parts missing`. The couch's legs are four pieces: `parts off (4)` on the row, `4 parts missing` in the footer. A lamp dropped 2.4 m onto open ground goes from `perfect 100%` to `broken 0%` in 34 frames. At --ts 1.6 the list scrolls inside a 287 px box over 957 px of rows and the whole card is 574 px in a 624 px window, with nothing clipped horizontally.

**Touched:** src/ui/manifestScreen.js (new), src/main.js, src/config.js (MANIFEST_VIEW), src/core/input.js (the `manifest` binding, both seats, both contexts), src/ui/pauseScreen.js, src/ui/settings.js, styles.css, tools/m0-tests.js, tools/m15-tests.js, tools/m16-tests.js, tools/m26-rebind-tests.js. **New:** tools/m40-manifest-tests.js.

**Checked.** m40 ALL-PASS 141; m0 142, m11 192, m12 127, m15 141, m16 152, m17 123, m26 192, m29 180 — all ALL-PASS.

Measured:
- The shipped contract's manifest is 23 required rows; the card lists 23 and the footer reads '0 / 23 delivered · rooms right 0 / 0 · no parts missing' at boot.
- Three rows want two people — couch_3seat_01, mattress_double_01, wardrobe_01 — from handling 'two-person' or the def tag 'twoPersonPreferred'.
- Room split on the shipped contract: 8 rows to dest_living, 8 to dest_kitchen, 7 to dest_bedroom. Category split: 9 box, 5 small, 3 medium, 3 large, 2 fragile, 1 showcase. Kitchen ∩ box = 5 rows; category 'fragile' = 2 rows (tv_55_01, mirror_framed_01).
- Rebuild count: 120 frames with the card open and nothing happening rebuild the list 0 times, and 90 more after a run of real changes rebuild it 0 times. A grip is exactly 1 rebuild; a disassemble is exactly 1 rebuild.
- The couch's legs are 4 pieces: the row reads 'parts off (4)' and the footer reads '4 parts missing'.
- A lamp_floor_01 dropped 2.4 m onto open ground: 'perfect 100%' -> 'broken 0%' in 34 frames (peak speed 5.40 m/s). MEASURED AND WORTH RECORDING: the same drop from 3.2 m inside the living room does nothing at all — the lamp lands on the house's roof at y 3.68 and reads condition 100 after 200 frames. The house has a lid; a suite that drops something indoors from above ~2.4 m is dropping it onto the roof.
- At --ts 1.6 (the top of SETTINGS.ranges.uiScale) the list scrolls inside a 287 px box over 957 px of rows; the whole card is 574 px in a 624 px window and its footer stays on screen. scrollWidth <= clientWidth on both the list and the card, so nothing is clipped horizontally.
- DOM cost: three open/close cycles change the document element count by 0, the scene child count by 0 and the body count by 0. A closed card holds no rows; its own subtree is a constant size for the whole suite.
- Binding data: seat 0 FOOT now has 17 actions and seat 1 FOOT 19, so Settings → Controls has 33 rebindable rows (up from 31). bindingConflicts() on the shipped tables is 0 with KeyM/Period/D-pad-up in.
- §2.2 under the card: 60 frames with it open advance the sim clock by >900 ms, run >50 steps and bill >900 ms of labour, with game.state.paused false throughout.

Deviations from the brief:
- A SIXTH STATE. The brief and the plan spell the state set as 'at pickup / carried / on the truck / delivered / left at the old house'. That set has a hole the build actually has: an item carried off the truck and set down in the new house's hallway is none of the five until MANIFEST.dwellMs of settled dwell turns it into 'delivered'. rowWhere() already names that place ('site' — src/contract/manifest.js:281-300) and the invoice already bills it (undeliveredRows, manifest.js:317, is M20's one definition of 'left behind' and includes it). Printing 'left at the old house' over an item standing three metres away would be a lie, so it gets its own word, 'at the new house'. MANIFEST_STATES (src/ui/manifestScreen.js) carries the six with the reason written above them. No named assertion is affected: N1 still reads 'at pickup' for all 23, N2 still reads carried/on the truck/delivered, N3's 'left at the old house' filter still shows exactly the row left behind.
- BOUND IN THE DRIVE CONTEXT TOO, not only on foot. The brief says 'a new on-foot action manifest'. A leg of the route is TRANSIT and the seat's context is DRIVE while it runs, so a FOOT-only binding would make the card unopenable for a third of the contract — §21.2 wants it readable DURING one. `manifest` is therefore in both contexts of both seats (src/core/input.js), the same way `interact` is. The Controls card lists LISTED_CONTEXT = foot only (src/ui/settings.js:64), so a rebind moves the on-foot key and the drive key keeps its default — the shipped behaviour for every action bound in both contexts, and m0 B25d/B25e pin it.
- THE ROOM FILTER'S OPTIONS ARE DERIVED FROM THE ROWS, not from DEST_ZONES wholesale. The brief says 'every destination room plus any'. DEST_ZONES has four entries and one of them is 'Kerbside (destination)' — the kerbside apron, which is not a room and which no manifest row is bound for, so offering it would ship a filter that can only ever be empty. manifestView() lists the destination zones IN DEST_ZONES ORDER that at least one row is going to (living room, kitchen, bedroom). Same rule for the category chips, derived from the defs this contract actually spawns.
- THE PAUSE CARD'S BUTTON RESUMES BEFORE IT OPENS. The brief asks for both 'hides under the pause card the way the walkthrough does' (N4) and 'opened from the pause card'. Those two are in direct tension: a button that opened a card its own screen suppresses would show the player nothing. So pauseScreen.onManifest (src/main.js) calls game.setPaused(false) and then manifestScreen.show(). The card pauses nothing anyway (§2.2), so resuming to read it is the honest gesture; the button's title attribute says so and m15 M33-7c/M33-7d assert it.
- THE FINGERPRINT BESIDE THE SUBSCRIPTIONS. The brief names 'CARGO_STATE / MANIFEST / PART_CHANGED / DAMAGE_APPLIED' as the rebuild triggers. There is no MANIFEST event: grep EVENTS.MANIFEST across src returns nothing, and ZONE_CHANGED — the one §23.3 declares for this — is emitted by nothing (audio.js:364 records that as a known fact). Two more of the four are late rather than absent: damage.js changes condition AT IMPACT (damage.js:215-218) and only emits DAMAGE_APPLIED when the aggregation window closes, and PART_CHANGED is emitted by the INTERACTION that calls disassemble (interact.js:669,811), not by disassemble itself. So the card subscribes to CARGO_STATE, GRIP_STARTED, GRIP_ENDED, PART_CHANGED, DAMAGE_APPLIED, DOOR_STATE, CONTRACT_PHASE and SIM_RESET — every change of PLACE, which is the expensive half — and frame() additionally compares a short fingerprint of the four facts written silently inside the step (delivered, roomCorrect, condition rounded to the printed precision, parts-off count): one Map lookup per row while the card is open, no DOM. The claim the brief wanted is intact and asserted: 120 quiet frames rebuild zero times (m40 N2), one event is one rebuild (N2c, N2q).
- THE HELP LINE DOES NOT NAME THE KEY. #help is derived from the live binding table and its height is a measured budget (SETTINGS.textSize.helpMaxLines, main.js syncHelpMetrics, m36 S1); adding ' M manifest' to the solo line would spend that budget for a reason unrelated to this milestone and risk the §21.1 harm the whole measurement exists to prevent. Discovery is the pause card's 'The manifest' button and the Settings → Controls row instead. Recorded under KNOWN_ISSUES below as an open item.
- m16's REBIND POOL AND m26's SPARE CODE HAD TO MOVE. Both are listed in filesTouched and both changes are forced by the data, not by taste: m16's M18-U2 pool contained 'KeyM' (now a shipped binding, so a capture onto it is a legitimate refusal that would read as an inert row) and was one short of the 33 rows the new action makes; m26 B7 rebound seat 0's jump onto 'KeyM' and would have been asserting that a REFUSED rebind stuck. Pool: KeyM out, F13/F14/F15 in (34 codes for 33 rows). m26: KeyM -> KeyO in two places.

### M34

### M34 — a 598 N·s hit stops reading as a 40.00 knock, and the resting phantom still reads nothing (§8.3, §8.4, §10.4, §3.3, §27.5)

**The recorded hole.** KNOWN_ISSUES Phase 26 measured it and left it: a 110 kg fridge thrown at 6 m/s from 0.16 m at the hung 34" leaf stops dead, and the frame reads 14 N·s, so the door is NOT forced — while the same fridge from 0.05 m at 4 m/s tears it off at 427.9 N·s. The player watches the harder throw do less. §10.4 says damage must have a physical cause; a 598 N·s cause producing a 40.00 knock is the same sentence read the other way.

**The recorded explanation was wrong, and the real one is worse.** The entry blamed a deep first-step penetration resolved by position correction the manifold never reports. Re-measured this milestone (tools/m41-impulse-tests.js prints it every run): queried between the solver and the damage system, that step's leaf manifold reads **627.90 N·s** — larger than the object's own 598.0 N·s of m·Δv. It reads nothing like that only when queried AFTER `damage.step()`'s entity loop, because 5.58 m/s **breaks** a fridge, `breakInto` spawns its fragments (M12), and adding colliders re-runs the narrow phase, so every impulse read after that loop describes where the pieces are now. **The door-frame pass runs after that loop.** I1 prints the pair for the door throw — 627.90 N·s before, **0.00** after — and I2g prints it for the wall throw, where the two readings are still recognisable as the same step: before `wall 625.79, ground 6.71`; after `ground 20.34, wall 9.55`. The 4 m/s throw survived only because 3.78 m/s leaves the fridge 'cracked' rather than broken: nothing fragments, the manifold is intact, 427.81 N·s, door off.

**And the second reading that should have covered it was unreachable.** M23 asked M14's ranking about `other` — the object's OWN collider, taken from `contactPairsWith(leaf.collider, …)`, which can never appear in its own contact list — so `_bestContactIs` returned false for every hit that has ever happened and the frame's strain was always whatever the corrupted manifold said. It now asks about `self`, the leaf, and it asks the ranking `_attributeProperty` already made in the entity loop, **before** any fragmentation — the only moment in the step when the cause is still visible. That one argument is what makes the door go.

**Three readings, and the largest wins — never their sum.** A frame under strain now has the leaf's manifold, the hands' force for a held object pressed against it (M23), and the object's own momentum change ranked while the manifolds were intact, and takes the biggest. Note which invariant that does and does not carry: a **wall, header or truck** line can never exceed the momentum the object actually lost (asserted, m41 I1d/I2f), but a **door frame** deliberately can — the reading that forces a leaf under a sustained press is the hands', and a couch pressed into a door changes speed by nothing at all (measured: m·Δv 0.00 N·s across the whole press, against 186 N·s of manifold).

**The ranking follows the cause instead of a proxy.** A manifold impulse is a proxy for what stopped an object, and this build has now caught that proxy lying once. So attribution ranks by where the object was **going**: per contact, `approach = −(v_before · n)` (how fast it was closing on that surface, from the velocity cached before the solver touched it) and `align = (Δv · n)/|Δv|` (how much of the velocity change points back out of it). A contact with `approach > DAMAGE.property.approachMps` and `align > 0` is a hit, and the hit with the largest `align` takes the step's m·Δv — so a floor cannot win a horizontal stop, because a fridge thrown sideways was never travelling down into it. With nothing approached — a lean, a rest, a slide along a face, a settle — the ranking is M14's largest manifold, unchanged to the character, which is what keeps every resting and sliding number where it was. **It moved nothing:** on every fixture in every suite the two rules agree, m22's recorded table reproduces to the cent (its single hits, its merged pair and its §8.3 cap are all pinned inside the new suite as well), and m25's four packs bill identically. The guard's value is not a number today; it is that the number cannot be handed to a floor tomorrow.

**The number that separates a hit from a lean.** `DAMAGE.property.approachMps` **0.75** m/s, measured against both sides: a box left 20 mm inside a hung leaf reads **0.000** while the solver holds **108 N** against it (the phantom §10.4 forbids billing); a box slid into a wall at 0.30 m/s reads **0.300**; a two-hand couch shove reads **0.379** on the step it arrives — a press, whose cause is the hands and whose reading M23 already had right. The throws read **3.78, 5.57 and 5.58** — approaches on the step of first contact, not the 4 and 6 m/s they are launched at, so the headroom above the gate is 5x.

**What a player sees.** Throw a fridge at a closed door hard enough and the door comes off, for 140.00, as it always should have. Throw one at a wall and the wall is billed 400.00 — not the floor it was standing on, which is billed nothing, ever. Lean something on a door and nothing happens, for as long as you like.

**Files.** src/damage/damage.js, src/config.js · **new:** tools/m41-impulse-tests.js.

**Checks.** tools/m41-impulse-tests.js ALL-PASS **76**; m8 51, m14 43 (soak — replay determinism), m17 123, m20 95, m21 157, m22 98, m23 131 (40 sessions, 0 failing), m25 100, m30 114, m37 68 — all ALL-PASS; ./tools/syntax-check.sh clean over 136 files. 76 assertions are new.

Measured:
- The recorded case, fixed: the fridge arrives on step 2 at 5.58 m/s and leaves at 0.14, so 598.0 N·s of its own momentum went into the leaf. The frame's window takes **598.031 N·s** and the hinges go on that step — one line, `door_frame_living_kitchen`, band 'forced', **140.00**, at (2.17, 1.00, −5.00), normal (1,0,0), heldBy []. DOOR_STATE 'forced' once, `by` null. Before M34 the identical throw posted 76.173 N·s of strain, band 'bent', **40.00**, and left the door hanging.
- The two readings of one step: the leaf's manifold **627.90 N·s** before `damage.step()` and **0.00** after it (m41 I1); the wall throw's pair, wall 625.79 → 9.55, ground 6.71 → 20.34 (I2g). The object fragmented in between (bodies 75 → 77).
- The 4 m/s / 0.05 m case is unchanged to the cent: forced at step 1, one line, 140.00, impulse 427.808 against m30 D7a's recorded 427.865.
- The floor never wins a horizontal stop: the same fridge at 6 m/s into the front wall writes `wall` / 'front wall', impulse **595.608 N·s**, band 'holed', **400.00** (capped), at (1.60, 0.88, −1.92), normal (0,0,1). Contacts that step: wall 625.79 N·s at 5.57 m/s of approach, ground 6.71 N·s at ~0. The ground is credited nowhere.
- M14's |Δspeed| against the vector reading on that hit: 595.6 N·s vs 625.7 N·s — 5.1 % apart, and the gap is rebound. The build keeps |Δspeed|, which is what every recorded price is calibrated against (KNOWN_ISSUES Phase 21).
- Nothing grew. m22's table, re-measured through the new ranking and re-run in m22 itself: PD2 wall 31.266 N·s / 30.82 'scuffed'; PD4 doorHeader_living_kitchen 33.617 / 34.59 'scuffed'; PD5 truckHeadboard 40.771 / 46.03 'dented'; PD3c's merged pair 65.105 / 84.97 with peak step 33.84 — now reproduced inside m41 to three decimals and to the cent; PD6's cap reached at exactly 400.00 on throws of 50.378 / 50.076 / 50.228 / 50.378 / 50.018 N·s costing 61.40 / 60.92 / 61.16 / 61.40 — the same impulses and the same untrimmed costs m22 records, with only the final trimmed remainder differing (39.33 here, 9.32 there) because each suite reaches the cap from its own ledger history; PD13 40 throws → 40 lines {wall 14, partition_wall_living_back 13, roomWallW 13}, Σ 450.94, 24 scuffs; PD15 settlement property 446.03 over 8 lines, items 2082.70.
- m30's traces, byte-identical before and after. D1's calibration line: touch 0.55 s, forced 1.02 s, 8 steps at ≥ 250 N, leaf Σ 188.1 N·s, m·Δv Σ after the first touch 5.83 N·s. D2: a 9.0 kg box at 2 m/s from 0.16 m — leaf took 10.76 N·s peak (m·Δv 10.37), one line, chargeBent 40.00, band 'bent', at (2.21, 0.25, −5.40); the second identical knock posts nothing; a box left resting against the leaf for 1.5 s strains nothing. D7a: 427.865, forced, by null.
- m25's packs, identical: LOW none; TALL truck headboard scuffed (fridge_01) 6.05, tv_55_01 100→92; SLIDE truck headboard holed (fridge_01) 400.00, fridge_01 100→77; SLIDE_STRAPPED none.
- The phantom, unchanged: a 9 kg box left 20 mm inside a leaf for 90 steps — 108 N of solver phantom, 0.00 N·s of strain, 0 lines, 0 property events, leaf still hung, frame still unbent. A box against a wall for 300 steps: nothing. A box slid at 0.30 m/s from 2 mm: approach 0.300, m·Δv 2.34 N·s, 0 lines.
- The press, unchanged in kind: m41 I4's shove first touches at step 42 (0.70 s) and forces at step 72 (1.20 s) — 30 steps of pressing against m30 D1's 27 — with the couch's own m·Δv after the first touch summing to 0.00 N·s and the strain rising on every pressing step (43.3 → 194.5 → 339.1 N·s at steps 42/54/66). The 9-step difference from D1 is the walk-up from a fresh contract, not the press; D1 itself is unmoved and is the suite that pins the 1.0 s wall clock.
- ./tools/syntax-check.sh: 136 files, 0 with syntax errors.

Measured:
- THE RECORDED CASE, FIXED (unchanged by this pass). A 110 kg fridge thrown at 6 m/s from 0.16 m at the hung living_kitchen (34") leaf arrives on step 2 at 5.58 m/s and leaves at 0.14, so 598.0 N·s of its own momentum went into the leaf. The frame's window takes 598.031 N·s and the hinges go on that step — one line, door_frame_living_kitchen, band 'forced', cost 140.00, at (2.17, 1.00, -5.00), normal (1,0,0), heldBy []. BEFORE M34 the identical throw posted 76.173 N·s of strain, band 'bent', cost 40.00, and left the door hanging.
- THE TWO READINGS OF THAT ONE STEP, as the suite prints them on the final tree. I1: the object's own m.dv 598.0 N·s; the leaf's manifold read BEFORE damage.step() 627.90 N·s; the same manifold read AFTER it — where the frame pass reads, once the entity loop has fragmented the fridge — 0.00 N·s. The implementer's report and docsNotes carried 14.46 for that second reading; 14.46 came from a discarded first probe that read after the WHOLE step (post-unhang) and does not reproduce. The number is 0.00, and I2g's wall pair (625.79 before, 9.55 after) is the other reproducible form of the same measurement. Corrected in docsNotes.knownIssues.
- THE FRAME IS NOT BOUNDED BY THE OBJECT'S MOMENTUM, and the code now says so. m41 I4's own trace, this run: step 42 couch m.dv 32.39 N·s, strain 43.3; step 54 m.dv 0.00, strain 194.5; step 66 m.dv 0.00, strain 339.1; step 72 FORCED with m.dv summing to 0.00 N·s after the first touch against a leaf manifold Σ of 186.0. m30 D1 the same shape (Σ 188.1 N·s of manifold against 5.83 of m.dv). The header on _strainFrames claimed max(manifold, hands, m.dv) implied the leaf 'can never be credited more than the object's own momentum change' — false, and false by design: the momentum ceiling is _attributeProperty's, over billable surfaces (m41 I1d, I2f). Rewritten to 'the LARGEST of the three and NEVER their sum', with the counter-measurement and a note that deleting the hands branch to restore the ceiling deletes M23's shove.
- THE ACTUAL MECHANISM (unchanged). 5.58 m/s BREAKS a fridge (normal fragility), so damage.step()'s entity loop calls breakInto and spawns its fragments (bodies 75 -> 77), and adding colliders re-runs the narrow phase — every impulse read after that loop describes where the pieces are now. _strainFrames runs AFTER that loop. The 4 m/s / 0.05 m throw forced the door only because 3.78 m/s leaves the fridge 'cracked' rather than broken: nothing fragments, the manifold survives intact at 427.81 N·s.
- AND THE SECOND READING WAS UNREACHABLE (unchanged). damage.js pre-M34 read `if (hit && this._bestContactIs(e, other))`, where `other` comes from `world.contactPairsWith(leaf.collider, ...)` and is therefore the OBJECT'S OWN collider — which can never appear in its own contact list. Fixed to `_hitContactIs(e, self)`. That one argument is the behavioural change.
- THE NEW GATE, and the numbers on both sides of it re-measured on the final tree: DAMAGE.property.approachMps = 0.75 m/s of approach along a contact's own normal, read from the velocity cached before the solver touched the object. A box left 20 mm inside a hung leaf reads 0.000 while the solver holds 108 N against it (m41 I3 prints 108 N; M23's inherited 129-184 N figure is now attributed to M23 in the comment instead of being presented as this milestone's measurement). A box slid into a wall at 0.30 m/s reads 0.300. A two-hand couch shove reads 0.379 on the step it arrives. The throws read 3.78 (I1g), 5.57 (I2) and 5.58 (I1) — APPROACHES on the step of first contact, not the 4.0 and 6.0 m/s launches the config comment previously quoted, so the real headroom above the gate is 5x rather than the 8x that comment implied. Both corrections are in config.js and in m41 I0a.
- THE FLOOR NEVER WINS A HORIZONTAL STOP (unchanged). The same fridge thrown at 6 m/s into the front wall while standing on the ground writes one line: wall / 'front wall', impulse 595.608 N·s, band 'holed', cost 400.00 (capped), at (1.60, 0.88, -1.92), normal (0,0,1). Contacts that step: wall 625.79 N·s approach 5.57 m/s, ground 6.71 N·s approach ~0. The ground is credited nowhere.
- M14's |dspeed| vs the vector reading on that hit: mass x |dspeed| = 595.6 N·s, mass x |dv along the wall normal| = 625.7 N·s — 5.1 % apart, the gap being rebound. The implementation keeps |dspeed|; the swap is now flagged in the suite as a DECLARED DEVIATION from the brief's I2 wording rather than left to the report alone.
- NOTHING GREW, and m22's table is now pinned WIDER inside m41. Re-measured on the final tree: PD2 wall 31.266 N·s / 30.82 'scuffed'; PD4 doorHeader_living_kitchen 33.617 / 34.59 'scuffed'; PD5 truckHeadboard 40.771 / 46.03 'dented'; NEW — PD3c, m22's aggregation fixture run verbatim, merges to ONE wall line of 65.105 N·s / 84.97 'dented' with peakStepImpulse 33.84 (m22's recorded 65.105 / 84.97, to three decimals and to the cent); NEW — PD6, m22's cap fixture, drives the wall to exactly 400.00 in 5 throws of 50.378 / 50.076 / 50.228 / 50.378 / 50.018 N·s costing 61.40 / 60.92 / 61.16 / 61.40 and a trimmed 39.33. m22's own run reaches the cap in 6 throws with a 9.32 remainder because it arrives with a different wall total; the per-throw impulses and the untrimmed costs are identical, which is the part the ranking could have moved. m22 itself re-run ALL-PASS 98 (PD13's 40 lines / Σ 450.94 and PD15's 446.03 remain pinned there).
- m30's traces on the final tree, byte-identical to the pre-change baseline. D1's own calibration line: touch 0.55 s, forced 1.02 s, 8 steps at >= 250 N, leaf Σ 188.1 N·s, m.dv after touch 5.83 N·s, CARRY.tractionN 350. (The implementer's report quoted 'forced step 60 (1.00 s)'; m30 prints 1.02 s for the same step under its (n+1)*stepMs convention, and the suite comments in m41 now quote m30's printed line verbatim rather than a step number inferred from it.) D7a: the fridge at 4 m/s from 0.05 m forces the door, impulse 427.865, by null.
- m25's four packs, re-measured and identical: LOW property none / items none; TALL truck headboard scuffed (fridge_01) 6.05, items tv_55_01 100->92; SLIDE truck headboard holed (fridge_01) 400.00, items fridge_01 100->77; SLIDE_STRAPPED property none / items none.
- m41 I4, the sustained press on the final tree: first touch step 42 (0.70 s, approach 0.379 m/s), forced step 72 (1.20 s) — 30 steps of pressing against m30 D1's 27; leaf manifold Σ 186.0 N·s over 10 steps at >= 250 N; the couch's own m.dv after the first touch 0.00 N·s; the ledger grows by exactly 140.00 in one line, band 'forced', heldBy seat 0. The wall clock is now asserted at 42 +/- 2 and 72 +/- 2 steps instead of a 2000 ms ceiling.
- m41 I3, the phantom: 90 steps with a 9 kg box 20 mm inside the leaf — peak solver phantom 108 N, peak frame strain 0.00 N·s, peak approach 0.000 m/s, 0 lines, 0 property events, 0 capped events, leaf still hung, frame still unbent. A box resting against the front wall for 300 steps: 0 lines, 0 events, final speed 0.0000 m/s. A box slid into the wall at 0.30 m/s from 2 mm: peak approach 0.300 m/s, peak m.dv 2.34 N·s, 0 lines.
- THE SUITE'S OWN TRUNCATION WAS A REAL BUG, NOT THE DOCUMENTED PORT ARTEFACT. m41 died at 'I5...' on ports 8712, 8716, 8735 and 8743 (and, in the same place, on the implementer's 8490 and the reviewer's 8611) and ran clean on 8718 and 8721 — roughly half the runs, always at the same point. Cause: I5's PD5 block used `await import('../src/world/truck.js')`, and under --virtual-time-budget headless Chrome treats that mid-suite yield as licence to advance virtual time, dumping the DOM at that exact point while the rest of the suite is still running. Made static (the top-level import every other suite uses) the whole run after boot is synchronous: 3 consecutive runs at 7.5-7.6 s each, ALL-PASS 76, plus 8755 on the final tree. The suite is now deterministic, which it was not when it was reported at 67.
- Determinism: tools/m14-soak-tests.js ALL-PASS 43 — replay equality unaffected by the two new caches (plain Maps of plain data, cleared by damage.reset(), m41 Z5).
- ./tools/syntax-check.sh: 136 files, 0 with syntax errors (run after every edit batch and last of all).

Deviations from the brief:
- THE BRIEF'S DIAGNOSIS WAS WRONG AND THE IMPLEMENTER FIXED WHAT IS ACTUALLY BROKEN — kept. The brief (and KNOWN_ISSUES Phase 26) says the manifold under-reports a deep first-step penetration and that the floor's 18 N·s then wins M14's ranking. Measured where attribution actually reads them, neither half holds: the leaf's manifold on that step is 627.90 N·s and the ground reads 11.28. The 14 N·s of the record is what the same narrow phase says one call later, after the entity loop fragmented the fridge.
- SO THE PRIMARY FIX IS A BUG THE BRIEF DID NOT KNOW ABOUT — kept: `_strainFrames` asked M14's ranking about the object's OWN collider, so the m.dv branch had never fired for any hit on any door frame. It now passes `self`, the leaf. One argument; it is what makes I1 pass.
- THE max() IS IN _strainFrames ONLY, NOT IN _attributeProperty — kept and now correctly described in the code. The brief asks for 'max(manifold impulse, the object's own m.dv)' in the credit to a surface. In _attributeProperty the credited amount has been the object's own m.dv since M14 (the manifold is a ranking/split WEIGHT there), so a max() would raise wall lines above the momentum the object carried — measured, 625.7 vs 595.6 N·s on I2's hit — and break the brief's own I5. The place where the credited number IS the manifold, and really can under-read, is _strainFrames, and that is where the max lives.
- AND THE CONSEQUENCE OF THAT, NOW STATED WHERE IT MATTERS (review violation 1, major): a door-frame line is deliberately NOT bounded by the object's momentum change, because the reading that forces a leaf under a press is the HANDS' force and the couch's own m.dv is 0.00 N·s. The old header claimed the opposite as an invariant; a later reader could have 'restored' it by deleting the hands branch and silently deleted M23's shove. The header now says LARGEST-of-three-never-a-sum, names the counter-measurement (m41 I4a step 66: m.dv 0.00, strain 339.1; m30 D1: 188.1 vs 5.83), and points the momentum ceiling at _attributeProperty where it is actually asserted.
- THE RANKING CHANGE IS A GUARD, NOT A BEHAVIOUR CHANGE — kept. On every fixture in every suite the approach ranking and M14's largest-manifold ranking pick the same surface; m22's table reproduces to the cent (now including PD3c and PD6 inside m41), m25's packs bill identically, m37's split shares are untouched, m30 is byte-identical. Documented as neutral-and-a-guard in config.js, damage.js and m41 I2a.
- THE APPROACH RANKING HAS A FALLBACK the brief did not specify: a contact is eligible only if approach > approachMps AND the velocity change points back out of it; if nothing qualifies (a lean, a rest, a slide along a face, a settle) the winner is M14's largest manifold, unchanged. Without it a box decelerating by friction against a truck wall would start billing the wall for friction (~3.6 N·s a step, ~151 N·s over one 700 ms window).
- approachMps IS 0.75, clear of both sides: the pinned slide is 0.300 and the shove 0.379 below it, the throws 3.78 / 5.57 / 5.58 above it. No measured fixture is within 50 % of the threshold.
- I2's PREDICATE (review violation 8): the brief says 'the amount equals mass x |dv along the wall normal|'; the suite asserts mass x |dspeed| (595.608 N·s) and, separately, that the vector reading (625.7 N·s) is the larger by under 10 %. The vector form would raise EVERY existing wall line by ~5 % and break the brief's own I5. This pass added a flagged '⚠ DECLARED DEVIATION FROM THE BRIEF (M34 I2)' header at that assertion so the substitution is visible in the file, not only in this report — the orchestrator's sign-off is on the record, not on trust.
- I4's WALL CLOCK (review violation 7): the brief says 'forced at 1.00 s +/- 2 steps'. 1.00 s is m30 D1's clock and D1 still reads it ('touch 0.55 s, forced 1.02 s', byte-identical). THIS fixture starts from a fresh resetContract, so the mover reaches the couch 9 steps later and its own clock is 1.20 s. Rather than leave a 2000 ms ceiling standing in for a number, I4 now pins first touch 42 +/- 2 steps and FORCED 72 +/- 2 steps — the brief's tolerance on the value this fixture measures — alongside the press assertion (30 +/- 4 steps against M23's 27). The wall-clock claim of the brief is carried by m30 D1, which is named in the assertion text.
- I5's BREADTH (review violation 9): the brief says 'every scripted hit in m22's existing table'; the suite pinned three. It now also runs m22's PD3c (aggregation) and PD6 (the §8.3 cap) verbatim, which are the two mechanisms the rest of the table is built from — measured PD3c 65.105 N·s / 84.97 to the cent, PD6 Σ wall exactly 400.00 with m22's recorded per-throw impulses. PD6's assertions are deliberately history-independent (per-throw impulse, per-line rate, Σ = the cap): m41 arrives at the cap with a different wall total than m22 does, so it needs 5 throws and trims its last line to 39.33 where m22 needs 6 and trims to 9.32 — pinning the remainder would pin the ledger's history, not the mechanism. PD13 (40 throws over three surfaces) and PD15 (the settlement) are aggregates OF those mechanisms and stay pinned in m22 itself, re-run ALL-PASS 98.
- tools/m22-property-tests.js, tools/m30-force-tests.js and tools/m25-packs-tests.js are in the brief's filesTouched but were NOT edited by either pass: they were named so their numbers could be re-measured, and not one moved (98 / 114 / 100, and their printed traces quoted above). Editing three suites another milestone may also be running, in order to change nothing, was the worse option.
- m41 I3c slides the box from 2 mm, not from a wide gap: a 9 kg box pushed at 0.30 m/s on this floor is stopped by friction inside ~8 mm, so from any real gap it never reaches the wall. Its comment said '5 mm' and '~0.28 m/s' against code that parks at 2 mm and output that reads 0.300 (review violation 6); the comment now matches the code and the print.
- m41's probe opens up its own step() to read the narrow phase BETWEEN the solver and damage.step(). This is not a convenience: a forcing unhangs the leaf inside damage.step() and registry.unhang teleports it to its rest pose, so after an atomic step the contact that tore the hinges off no longer exists and every trace of it reads 0.00 — which is exactly where the discarded 14.46 came from.
- NEW THIS PASS, and not a deviation from the brief but from the previous report's account of the harness: m41's repeated truncation at 'I5...' was NOT the documented per-port scratch-page artefact. It was `await import()` inside I5 yielding to the event loop under --virtual-time-budget. The import is now static. Three consecutive clean runs plus the final-tree run; no truncation since.

## Phase 30 — Phase 11 build side, batch 15: contract-UX follow-through, and the world's edges — 2026-09-05

Phase 11's build side (GDD §25.2: onboarding, settings, instrumentation, fixes), from the ordered plan in docs/PHASE11_PLAN.md. Each milestone was built by a file-owned implementer and adversarially reviewed against its brief; the numbers below are the ones the reviews reproduced.

**4274 assertions across 40 suites, all passing.**

### M31

### M31 — the recap names who did it, the brief refreshes, the reveal gets its switch, and both restarts read one box (§21.2, §15.3, §21.4 Motion, §13.4, §26.1)

**Hypothesis.** M24 closed §21.2 and its own review wrote five gaps into KNOWN_ISSUES as facts. Four of them are one-file consumers of seams that already existed, and until they were wired the section was finished in outline only.

**The seat column (gap 2).** `recapFrom()` has read `e.by` since M24 and only the door events ever carried one, so 'legs off', every item-damage row and every property row printed a blank seat whoever did them — which is exactly the attribution §15.3 asks for "for humour and learning". Both of interact.js's PART_CHANGED emits now name the mover (the removal and the reattachment; every refusal returns before the emit, so a `by` on the bus is always a part that moved), and so does the damage system's own PART_CHANGED 'broken' — read from the same still-open window as the DAMAGE_APPLIED for that impact, so the two events about one breakage can never name different people. damage.js records `heldBy` on the ITEM window the way `_feedPropWindow` has recorded it on the property window since M14, and every DAMAGE_APPLIED — item and property — carries `by`: the first entry of heldBy, through the new exported `holderOf()`, or null. The key is on the EVENT and not on the ledger line, because the line is what buildInvoice reconciles and the recap reads the log. Measured, in one scripted run (m38 F1) — the sheet's ten rows, in order: `legs off — couch 3seat` **P1**; `box small dropped (slipped)` **P1**; `box small scratched — 3.20` (blank); `box small broken — 40.00` **P1**; `front wall marked by box small — 46.05` **P1**; `box small dropped (slipped)` **P1**; `box small broken — 26.00` **P1**; `front wall marked by box small — 45.82` **P1**; `Traffic light — cargo rode it out` (blank); `Left onto Mill Road — cargo rode it out` (blank). The two hits the mover carried into the wall name P1 on BOTH ledgers; the box that was thrown names nobody, the road names nobody, and both of those blanks are asserted so they stay facts rather than gaps.

**The brief refreshes (gap 5).** `briefFacts()` is pure and was called once, at boot, so a settlement that set a new best moved the title's goal line only at the next boot — and the title never re-shows in a session. It is re-fed at the end of every settlement (after the best is decided) and at the end of every resetContract, and nowhere else: it walks the manifest, the registry and the door table, so it does not belong on a frame. Measured (m38 F2): run 1 settled at −233.44 and the goal row went from 'no best yet — the first settlement sets it' to 'beat your best: −233.44'; the replay left every other brief fact deep-equal to the boot facts (same seed, 23 rows); run 2, made worse by one dropped television, settled at −1962.65 and the goal row still read −233.44 (§13.4 — a lower settlement never replaces the best).

**The reveal's switch (gap 6).** §21.4 Motion wants a switch for anything that animates, and the count-up was the one animation in the build without a row: `?reveal=off` and the OS were the only ways to stop it. 'Invoice reveal' now sits under **Reading the screen**, on the shell key `invoiceReveal`, whose default follows prefers-reduced-motion exactly as cameraShake's and rumble's do — so `&& !reducedMotion` left main.js and became the key's default, which is what lets a saved choice beat the OS. The effective switch is the row AND the page rule, composed by the new pure `revealEnabledWith()`; `?reveal=on|off` still wins over both, because a screenshot script cannot tick a box. Nothing is hidden either way: the reveal is a curtain over lines invoice.js already wrote, and the row's note says so.

**One keep-loadout box, two restarts (gap 4).** 'Keep the tools on the truck' has been on the settlement sheet since M24; the pause card's Restart always restored the stock loadout and said nothing about it. Both boxes are views of one saved shell key now (`keepLoadout`), so ticking either shows in the other on its next redraw, a restart from either place honours it, and Defaults clears it — the label says 'remembered' because it outlives the session otherwise. The card's row is laid out to match the sheet's twin (flex, centred, 7 px gap, `calc(11px * var(--ts))`), and hides itself outright when nothing wires it — never a box that does nothing (§2.1). Measured (m38 F4): with the box ticked the screwdriver left in the cargo box is still inside it after the pause card's Restart, dynamic and in the object collision group; unticked, all four tools are within 0.15 m of their spawn rows and none is in the truck.

**Not done, deliberately.** Gap 1 (at UI scale ≥ 1.3 the job sheet scrolls inside 94vh) was out of scope. Gap 3 is not a defect and is reworded rather than fixed: a capture-phase listener on `window` does not run before another window listener when the event's TARGET is window itself, so only a synthetic keydown dispatched on window — a harness shape — reaches Input first; every real key event targets the focused element and the sheet's skip key wins, as intended.

**Files.** src/player/interact.js, src/damage/damage.js, src/main.js, src/ui/invoiceScreen.js, src/ui/pauseScreen.js, src/ui/settings.js, src/core/save.js, src/config.js, tools/m16-tests.js, tools/m17-tests.js · **new:** tools/m38-followthrough-tests.js.

**Checks.** tools/m38-followthrough-tests.js ALL-PASS 96; m0 132, m11 192, m12 127, m15 115, m16 152, m17 123, m20 95, m21 157, m22 98, m30 114, m31 141 — all ALL-PASS, with m27-access 128 and m36-scale 179 run alongside them because the pause card gained a row; ./tools/syntax-check.sh clean over 133 files. 111 assertions are new.

Measured:
- The recap the sheet drew in m38 F1's scripted run, re-measured this pass and byte-identical to the implementer's: [part P1] legs off — couch 3seat | [drop P1] box small dropped (slipped) | [damage —] box small scratched — 3.20 | [damage P1] box small broken — 40.00 | [property P1] front wall marked by box small — 46.05 | [drop P1] box small dropped (slipped) | [damage P1] box small broken — 26.00 | [property P1] front wall marked by box small — 45.82 | [road —] Traffic light — cargo rode it out | [road —] Left onto Mill Road — cargo rode it out. Ten rows, six of them naming P1, four blank on purpose.
- The PART_CHANGED shapes in that same run's record: 'removed=p0 broken=p0'. The damage system's 'broken' event now names the same holder as the item DAMAGE_APPLIED for the same window — the run really contains one, so the new assertion is not vacuous.
- The held box put 2 item-damage events and 2 property events on the bus, all four with by === 'p0'; the thrown box put 1 item-damage event with by === null. Before M31 all five read a blank seat.
- Road events at simTimeMs 4516.7 and 12500.0 (the prototype route's 4.0 s Traffic light and 12.0 s Left onto Mill Road); both rows blank, by design.
- m38 F2, re-measured this pass: run 1 settled at −233.44 and the title's goal row went from 'no best yet' to 'beat your best: −233.44'; the replay left every other brief fact deep-equal to the boot facts (same seed, 23 manifest rows); run 2, made worse by one dropped television, settled at −1962.65 and the goal row still read −233.44.
- m38 F4 layout (new): the pause card's keep row computes to display flex, align-items center, column-gap 7 px and font-size 11 px at --ts = 1 — the same numbers as `#settlement label.keep` — and an unwired card computes display 'none' with hidden === true.
- m38 F3e: with the injected clock at t0 + INVOICE.reveal.stepMs + countMs (700 + 560 = 1260 ms) exactly one major line is visible and it is already on its final amount; at t0 + revealDurationMs every line is landed and the breakdown is open.
- m38 F4: with the box ticked the screwdriver parked at (truck x − 0.3, interior minY + 0.25, interior maxZ − 0.9) is still inside the cargo box after the pause card's Restart, dynamic and in GROUP_PRESETS.object; with it unticked every one of the four tools is within 0.15 m of its PHASE6_TOOL_SPAWNS row and none is in the truck.
- Suite totals after the fix pass: m38 96 (new), m0 132, m11 192, m12 127, m15 115, m16 152, m17 123, m20 95, m21 157, m22 98, m30 114, m31 141 — plus the two extras m27-access 128 and m36-scale 179. 111 assertions are new (96 in m38, 9 in m16, 6 in m17).
- tools/m22-property-tests.js is a 98-assertion suite and always was: 98 on port 8901 and 98 on port 8905 this pass, each ~8 s of page time, running past PD14 through Z and the M23 section to the ALL-PASS tail. Its mtime is 2026-09-05 14:36:52, i.e. before M31 started.
- ./tools/syntax-check.sh: 133 files, 0 with syntax errors (run after every edit batch and last of all).

Deviations from the brief:
- REVIEW VIOLATION 1 (major) — the fabricated m22 number. The implementer's suites[] entry and the changelog's **Checks** line both said 'm22 ALL-PASS 150'. That figure is not reachable: the suite has 98 assertion sites and ran ALL-PASS 98 twice for me (ports 8901, 8905) and twice for the reviewer. Every occurrence of 150 is corrected to 98 in suites[], measured[] and docsNotes.changelog. Nothing in the code changed for this.
- REVIEW VIOLATION 2 (minor) — the false blocker. orchestratorNotes[0] told the orchestrator that m22 'needs a recheck after M32 lands' because it truncated at PD14 from ~16:47. Not reproducible on the current tree (M32's src/main.js, src/ui/walkthrough.js and styles.css all in place): the suite runs to completion, twice. It was the per-port scratch-page artefact CLAUDE.md documents, which should have been cleared by a solo rerun rather than escalated. The note is removed and replaced with the artefact's own tell (I hit the same thing on m20 this pass: a batched run printed NOTHING, a solo rerun gave the full 95).
- REVIEW VIOLATION 3 (minor) — m16 M31-5. Resolved in substance, but NOT by the reviewer's suggested edit, which would have broken the assertion it was trying to protect. The review's premise is wrong: `load()` never reads matchMedia. save.js's load → migrate → sanitiseShell all take `reducedMotion` as an option defaulting to FALSE, so a bare `load()` is the no-preference branch on every machine — which is exactly what M16-4 (cameraShake, line 657) has relied on since M16. `${!M.reducedMotion}/false` reads main.js's LIVE OS reading, so on a reduced-motion machine it would expect false while load() returns true: the change would have introduced the environment dependence it was meant to remove. What I did instead is strictly stronger: M31-5 now passes `{ reducedMotion: false }` explicitly (the fact is stated, not traced), M31-5a pins the reduce branch through the same path, and M31-5b asserts a bare load() equals the explicit false branch — so if load() ever DID start reading the OS, M31-5b fails on a reduced-motion machine and says so.
- REVIEW VIOLATION 4 (minor) — the unstyled pause row. Fixed rather than noted. styles.css is out of M31's ownership (it is M32's this batch), so pauseScreen.js — which IS mine — sets the row's layout inline, mirroring `#settlement label.keep` value for value, plus `justify-content: center` for this card's centred layout. Two deliberate omissions keep the inline styles from becoming a new defect: no `opacity` (an inline one would beat M19's `.hc` 'nothing dimmed' rule; the row simply is not dimmed) and no `display` in the constructor — refresh() writes `display` beside `hidden`, because an inline display beats the UA's `[hidden] { display: none }`, the same trap styles.css:694 documents for the card itself. Three m38 assertions now pin all of it (computed layout, unwired → none, rewired → flex), and m27-access (128) and m36-scale (179) — the contrast and UI-scale audits that walk this card — are green. Folding the declarations into styles.css is a one-line follow-up for whoever owns the file next; it is in orchestratorNotes.
- REVIEW contractGap 2 — PART_CHANGED 'broken' carried no `by`. Closed in code rather than written into KNOWN_ISSUES: the damage system's fragmenting emit now carries `by: holderOf(this._open.get(e.id))`, read from the SAME window still open in `_open` (the band was crossed in the block just above), so the two events about one breakage cannot disagree. The recap builds no row for it (classify() takes 'removed' only), but the run record no longer has one attributed shape and one bare one. Measured: 'removed=p0 broken=p0'.
- The brief said DAMAGE_APPLIED should carry `by` 'from the line's heldBy'. Only the PROPERTY line has heldBy (damage.js _feedPropWindow, M14); the ITEM ledger line has never had one. So the item WINDOW records heldBy at its first contact — the property window's own rule, same expression — and `by` is derived from it by the exported holderOf().
- `by` is put on the EVENT only, never on either ledger line. The ledger lines are what buildInvoice reconciles (m8, m11 G13, m14 soak) and what m33 C4g compares against the export; the recap reads the log. Adding a key to a line would have changed a reconciled object for no consumer.
- PROPERTY_CAPPED (M30) also gained `by`, so a capped hit reads like a billed one to the caption, audio and haptics layers that already branch on the same payload.
- The reveal switch is a NEW pure function `revealEnabledWith(...)` rather than a change to revealEnabledFrom, whose table m31 V3 pins and which is still exported and still the page rule alone. `?reveal=on|off` wins over both halves. main.js's `&& !reducedMotion` was REMOVED from the boot line because the reduced-motion reading is now the shell key's default (save.js) — M16's 'unless explicit' rule, and what lets a saved choice beat the OS as cameraShake's does.
- m16 U2's consumer for the new row is `() => load().shell.invoiceReveal` — the SAVE, with the same justification the `tier` row carries: on the harness's scratch page the EFFECTIVE switch is pinned false by the page rule, so a consumer reading invoiceScreen.revealEnabled would be inert there. The real consumption is m38 F3d/F3e, which drive invoiceScreen.show() on both branches.
- m16 V4's round-trip fixture gained `invoiceReveal: false, keepLoadout: true` — both off their defaults, so the round trip is real.
- KNOWN_ISSUES Phase 26 gap 3 (the reveal's skip key at the window CAPTURE phase) was assessed rather than changed: it is not a defect. A capture-phase listener on window does not run before another window listener when the event's TARGET is window itself — at the target, listeners fire in registration order — so only a synthetic keydown dispatched ON window (m15's shape) reaches Input first. The suggested rewording is in docsNotes.knownIssues.
- m38 F1's fixture reaches the cab with the screwdriver PARKED, not carried: a carried tool sits between the camera and the world and interact.probe()'s small-tool aim assist then wins every probe, so E at the cab did nothing (measured: phase stayed 'pickup'). The suite's putDown() helper is m31's, copied with that reason written above it.

### M32

## Phase 29 (build-side M32) — world edges: the rest strip is checked before a door lies down, the front leaf stays on the porch, and the bottom band fits a narrow window

Three recorded facts closed, all of them placement rules with a measurable predicate; no price and no number a suite pins was moved.

**One chooser for where a removed leaf goes.** M11 laid every leaf on ONE authored strip whether or not a mover or a box was standing there, and the solver separated them over the next few steps; M23's forcing inherited the same unchecked number by a second call site. Both call `interact.chooseLeafRest(physics, leaf)` now — one path, not two. It walks `DOOR.restCandidates[doorId]` in config order (beside the hinge jamb, beside the latch jamb, flat against the wall further along), sweeps each strip's box with M23's own occupancy primitive (`interact.boxBlocked`, shrunk by `DOOR.occupancyMargin` 0.01 m so the floor beneath it does not count), and takes the first that is clear. With every authored strip taken it searches further along the wall — 10 rungs of `DOOR.restSearchStepM` 0.20 m out to `DOOR.restSearchM` 2.00 m, nearest rung first — and the notice grows one clause: `door off its hinges — 45 s of prep · laid it down further along`. With nothing in the way the answer is candidate 0, which is `house.leafRestPose` and is M11's pose to 1e-6 for the three interior leaves, so m19 D4c and m30 D1 read exactly the numbers they always did. The choice is deterministic (config order, and a sweep that is a function of the world's state alone): m14's soak equality is green at 43 assertions.

*Measured (m39 E1/E2).* A box parked on the living-kitchen door's hinge strip and E at the leaf: the leaf goes to the latch strip at (4.050, 0.020, −6.080), clear of the box by ≥ 0.01 m, and the box moves 0.000 mm over the next 60 steps — previously it was shoved out by the solver. All three strips occupied: the leaf takes the latch strip 0.40 m further along (x 4.05..4.85) and the notice says so. m30 D1's shove with the same box on the strip forces the door at step 60 (1.00 s of the 4000 ms budget) and the *forced* leaf takes the latch strip too, not M11's pose 2.90 m away; the couch moves < 5 cm over the 30 idle steps after the forcing, `ledger.propertyDamage` grows by exactly 140.00 in one line, `DOOR_STATE 'forced'` fires once, `hungClear(living_kitchen)` is 0.86 and the body count is the boot count.

**The 32-inch front leaf stays on the porch.** It swings out onto the lawn, and M11 laid it there too: x −2.770..−1.970, 170 mm past the porch's west edge at x −2.60, in the strip where §18.3's recovery sweep and the truck's route meet. Its whole candidate list is inside the new `WORLD.porchBounds` (x −2.60..5.00, z −2.00..2.90) now, and candidate 0 is 0.50 m along the wall at x −2.270..−1.470 — 330 mm inside the edge, and 1.178 m from its jamb against `DOOR.rehangRange` 1.25, so Q from where you are standing is still the undo. porchBounds is inside the porch zone, clears the driveway zone by exactly 1.30 m and the truck's rear lip (z 8.30) by exactly 5.40 m. E and a thrown 110 kg fridge both put the leaf on the same strip; over 40 removals the worst excursion past porchBounds is 0.00 mm and the recovery sweep raises zero events for it (m39 E3). The front door's damage, its price and its `front_door_removed` tag are untouched.

**The bottom band fits a narrow window, and it is measured.** M22 recorded the collision and could not measure it: the card is bottom-LEFT while the caption and the route bar are CENTRED, so the bar's left edge (w/2 − 160) walks toward the card as the window narrows, and the harness's viewport is fixed. So the rule is keyed on the BAND's own width — `#ui`'s clientWidth, which is the viewport's in a real window and is what a suite can narrow — and not on a `@media` query, which reads a viewport this harness cannot move. Under `WALKTHROUGH.narrowPx` (960) the card takes the badge form (one row: step count, device chip, ✕ and title; the body line dropped) and publishes `--band-lift`, its measured top above the window's bottom plus `WALKTHROUGH.bandGapPx` (6); the route bar and the caption take `max()` of that and their own offset, so the band stacks instead of colliding and **0 is bit-for-bit the layout Phase 15 measured**.

*Measured (m39 E4), harness viewport 1262 × 624.* At 1262 px: card 10..322, caption 563..699, route bar 471..791, help 195..1067, `--band-lift` 0.00 px, card width 312 px — M22's and m29 W1's rects, unmoved. At 960 px: badge form, `--band-lift` 83.50 px, card 10..440 and the bar 320..640 — overlapping in x, separated by the stack with 6.0 px of clearance. At 800 px: `--band-lift` 100.50 px, card 10..440, bar 240..560, help two rows, again 6.0 px. Zero rect intersections at all three widths (6 pairs each), and the card still clears the help line by `WALKTHROUGH.clearancePx` at every one.

Two viewport-relative caps became percentages of the containing block so the emulation is honest rather than half-honest — `#help { max-width: calc(100vw − 20px) }` → `calc(100% − 20px)` and `#walkthrough { width: min(calc(312px × --ts), calc(33vw − 12px)) }` → `calc(33% − 12px)`. Both are the same number in a real window (`#ui` is `position: fixed; inset: 0`).

New suite `tools/m39-edges-tests.js` — ALL-PASS 117. Regressions: m11 192, m12 127, m13 76, m19 127, m20 95, m23 131 (40 sessions, 0 failing), m29 180, m30 114; and because M32 touched what they pin, m5 91, m14 43, m16 150, m36 179, m0 132.

Measured:
- Rest strips, derived and printed by m39 E0 (metres): living_kitchen hinge_wall x 0.150..2.150 z -5.880..-5.080 (M11's), latch_room x 3.650..4.450 z -7.080..-5.080, hinge_wall_living x 0.150..2.150 z -4.920..-4.120. kitchen_bedroom hinge_room x -2.080..-0.080 z -6.925..-6.125 (M11's), latch_room x -2.080..-0.080 z -8.675..-7.875, hinge_room_kitchen x 0.080..2.080 z -5.925..-5.125. door34 hinge_room x -1.250..-0.450 z -4.110..-2.110 (M11's), latch_wall_porch x 0.450..2.450 z -1.890..-1.090, hinge_wall_porch x -2.450..-0.450 z -1.890..-1.090. interior32 porch_room x -2.270..-1.470 z -1.890..0.110, porch_room_far x -1.570..-0.770, porch_wall x -2.470..-0.470 z -1.890..-1.090.
- interior32's leaf lay at x -2.770..-1.970 under M11 — 170 mm past the porch's west edge at x -2.60, on the grass. It now lies at x -2.270..-1.470: 330 mm inside the edge, and 1.178 m from its jamb against DOOR.rehangRange 1.25, so Q is still the one-key undo.
- Candidate-0 distance from each jamb (DOOR.rehangRange 1.25 m): living_kitchen 1.043, kitchen_bedroom 0.810, door34 0.835, interior32 1.178. Every FALLBACK strip is further than 1.25 m — 1.345 to 2.071 m — so a leaf laid on one must be carried back before Q offers the rehang.
- The chooser's ladder: 3 authored strips + 10 rungs of DOOR.restSearchStepM 0.20 m = 33 options per door, nearest rung first, none further than DOOR.restSearchM 2.00 m past its strip's own shift.
- m39 E1b: with a box standing on the hinge strip, E laid the leaf at (4.050, 0.020, -6.080) — latch_room, index 1, searched false — clear of the box by >= 0.01 m, and the box moved 0.000 mm over the next 60 steps.
- m39 E1c: with all three strips occupied the chooser took latch_room at shift 1.00 (0.40 m of ladder past its own 0.60), x 4.05..4.85, and the notice read 'door off its hinges — 45 s of prep · laid it down further along'.
- m39 E2: m30 D1's shove forced the door at step 60 (1.00 s of 4000 ms budget) and the forced leaf took latch_room, not M11's pose 2.90 m away. The couch moved < 5 cm over the 30 idle steps after the forcing. ledger.propertyDamage grew by exactly 140.00 in one line; DOOR_STATE 'forced' fired once; hungClear(living_kitchen) 0.86; physics.stats.bodies unchanged from boot.
- m39 E3: WORLD.porchBounds (x -2.60..5.00, z -2.00..2.90) is inside the porch zone, clears the driveway zone by exactly 1.30 m and the truck's rear lip (z 8.30) by exactly 5.40 m. E and a thrown 110 kg fridge both put the front leaf on porch_room. Over 40 removals the worst excursion past porchBounds was 0.00 mm and the recovery sweep raised 0 events for it.
- m39 E4, harness viewport 1262 x 624 px. At 1262 px (no emulation): card 10..322, caption 563..699, route bar 471..791, help 195..1067; --band-lift 0.00 px, card width 312 px — M22's and m29 W1's numbers, unmoved. At 960 px: badge form, --band-lift 83.50 px, card 10..440 (y 547..577), caption 412..548 (483..511), route bar 320..640 (535..541), help 44..916 (585..616) — the bar's left edge is 320 and the card's right edge 440, so they overlap in x and are separated by the stack, clearing the badge's top by 6.0 px. At 800 px: --band-lift 100.50 px, card 10..440 (530..560), caption 332..468 (466..494), route bar 240..560 (518..524), help 10..790 (568..616, two rows), again 6.0 px of clearance. Zero rect intersections at all three widths, 6 pairs each.
- Measuring the badge's HEIGHT and adding it to the route bar's own offset (the first implementation) left only 1.0 px of clearance at 800 px, because the card's bottom is measured from the help line's live top while the route bar's is a scaled 42 px — two different bases. --band-lift is now the card's measured TOP above the window's bottom plus WALKTHROUGH.bandGapPx, and the boxes take max() of it and their own offset, which is why 0 is bit-for-bit the shipping layout.

Deviations from the brief:
- main.js is NOT in this brief's filesTouched, so the risk note's 'assert at boot' could not be hooked into boot. Instead house.js exports the pure validator `restCandidateProblems(apertures, doors, bounds)` (§24.4's shape) and m39 E0 asserts it is empty over all four doors, plus the doorway-clear-box and RECOVERY.bounds predicates independently. One line in main.js beside the leaf spawn loop (src/main.js:262-268) would make it a boot warning — orchestrator's call.
- house.js cannot import scene.js APERTURES (scene.js imports house.js — house.js:246-250 says so), and a leaf's serializable state carries only doorId + poses, so interact.js/damage.js had no way to get a front aperture's door record without importing the renderer. Added `KNOWN_DOORS`, a module-level Map that doorRecords() fills with every record it produces, and `doorRecordById(id)` that reads it (falling back to INTERIOR_DOORS, then to the leaf's own authored `rest`). Pure data keyed by a stable string id, never game state; main.js populates it at boot via leafDoors(world.apertures).
- leafRestPose(door) is now `leafRestPoseOn(door, restCandidatesFor(door)[0])` rather than its own formula. For living_kitchen, kitchen_bedroom and door34 it returns M11's pose to 1e-6 (m39 E0d asserts it against M11's arithmetic restated in the suite). interior32's candidate 0 is deliberately different — that IS acceptance test E3 — and it is the only leafRestPose that moved. m5 DL1-DL8a re-run green (ALL-PASS 91).
- The brief's E1 says 'both strips occupied'; every door has three authored strips, so E1c occupies all three before asserting the search.
- E1's 'the box moves < 1 mm over 60 frames' is implemented as 60 SIM STEPS (CLAUDE.md: suites drive the systems directly and never wait for rAF). One game.frame(16.667) is one step, so the number is the same.
- E3's 'zero recoveries of the front leaf across 40 sessions' is implemented as 40 remove/settle/rehang cycles inside one session, asserting 0 RECOVERY events for the leaf and 0 landings outside porchBounds. The run-level proof is m23's own sweep, which is green at 40 sessions / 0 failing with these strips in.
- The brief's E4 wording was 'the caption shifts right of it'. Measured, shifting a centred caption horizontally is fragile at every width (it has to know the badge's width, which depends on the text). The band STACKS instead: the badge takes the row directly above the help line and the caption and route bar rise over it by --band-lift. Same predicate (no rect intersection among card, caption, route bar and help line), measured at all three widths, and 0 movement above WALKTHROUGH.narrowPx.
- The narrow rule is keyed on #ui's clientWidth via JS, NOT a `@media (max-width: 960px)` query. A media query reads the viewport, which this harness cannot move, so the rule would have shipped unmeasured for a third phase. Two viewport-relative caps became percentages of the containing block so the emulation is honest: styles.css `#help { max-width: calc(100vw - 20px) }` -> `calc(100% - 20px)` and `#walkthrough { width: min(calc(312px*var(--ts)), calc(33vw - 12px)) }` -> `calc(33% - 12px)`. Both are the same number in a real window (#ui is position:fixed inset:0); m36 S2/S3 and m16 U1j re-run green.
- tools/m19-tests.js, tools/m29-walkthrough-tests.js and tools/m30-force-tests.js are in filesTouched but were NOT edited. Every acceptance assertion carries an m39 id and lives in tools/m39-edges-tests.js so the reviewer finds them in one place; all three suites pass unchanged, which is the stronger claim (m19 127, m29 180, m30 114).
- `WORLD.porchBounds` was added to config.js's existing WORLD export (the brief named it), tightened to z <= 2.90 rather than copying the porch zone's 4.20 so it is clear of the driveway zone and the porch step; m39 E3 asserts it is inside the zone rather than a second idea of the porch.

## Phase 29 — Phase 11 build side, batch 14: settings that keep their word, and property damage that tells the whole story — 2026-09-05

Phase 11's build side (GDD §25.2: onboarding, settings, instrumentation, fixes), from the ordered plan in docs/PHASE11_PLAN.md. Each milestone was built by a file-owned implementer and adversarially reviewed against its brief; the numbers below are the ones the reviews reproduced.

**4045 assertions across 38 suites, all passing.**

### M29

### M29 — the text size scales the boxes, and the quality tier switches in the scene that is already running (§21.4, §21.1, §15.4, §26.5, §25.3)

**Hypothesis.** The two entries KNOWN_ISSUES had carried since Phase 17, both of them M4's honest deferrals, and both now the last settings rows that did not do what they said when they said it.

**Text size scaled the type and left the boxes in px.** Measured before the change, in the harness's 1262x624 window: at 1.6x the `#help` line wanted 1377.9 px and was laid out at left -57.9 — cut off at both ends with no scrollbar to say so — and the title card's livery name wanted 735 px of a 647 px plate. Every `width` / `min-width` / `max-width` under `#ui`, a `.card` or `#help` is now either `calc(Npx * var(--ts))` or viewport-relative, and the exceptions are DATA: `SETTINGS.textSize.pxAllowed` names nine of them with their reasons, and `SETTINGS.textSize.scaleCapAllowed` names the one font declaration allowed to CAP `--ts` instead of multiplying by it (the title plate, at 1.35x — three inline words with no break opportunity). Two CSSOM walks fail on anything else: m16 U1j for the boxes, U1l for the caps — and U1l matches the cap against the number it reads out of the `min()`'s own arguments, not against a substring of the declaration, so an allow-list entry cannot be satisfied by a line-height that happens to share digits with it. `#help` itself stopped being `nowrap`: it is `width: max-content` capped at the window, so it wraps rather than clips — one line up to 1.3x, two at 1.6x — and `SETTINGS.textSize.helpMaxLines` is now a budget something SPENDS: when the line still wants a third row (a narrower window, a longer binding line), `syncHelpMetrics` steps down `SETTINGS.textSize.helpSqueeze` and shrinks the help type until it fits, because a third row would lift the route bar and the caption into the working area (§21.1). Measured: forced to 3.2x the line lands on 2 rows at squeeze 0.80. **And the ladder's last factor is a floor, not a promise** — forced to 12x it runs out at 0.72 with the line still on 7 rows, so `helpMetrics.overBudget` goes true and one console line says by how much (870.9 px of lift) rather than letting the panels rise in silence. In the shipping range neither branch engages: m11 M29-5 pins `--help-squeeze` at 1, M29-6 the line's font at 12px and M29-7 `overBudget` at false. The boxes over the help line rise by **one measured number**, `--help-lift`, which is 0 whenever the line fits on one row. That is why nothing at 1.0x moved: after 1.0 -> 1.3 -> 1.6 -> co-op -> 1.0 every recorded panel rect returns within 0.5 px and both variables are back at their identity values. Measured after: help 872.5x30.8 / 1125.2x35.8 / 1242.0x67.8 at 1.0 / 1.3 / 1.6, never clipped, always inside the window; the contract panel 178.0 -> 231.4 -> 284.8 px wide; every card fits without a horizontal scrollbar at every size (title 743/743 at 1.6x, settings 879/879, pause 670/670, settlement 847/847). Vertically the title card now reads 786/585 at 1.6x where it read 758/570 — the 15 px is the horizontal scrollbar it no longer has, the 28 px is `#title-screen .cols` scaling its column minimum so the control list is one readable column instead of two cramped ones; it scrolls inside 94vh and nothing is cut off (m31 B2's note re-pinned, and pinned again as m36 S1c1). The centre third is clear at all three sizes, in solo and in **both halves** of a co-op split.

**The quality tier promised the next session.** It decides how many shadow maps are BUILT before the scene exists — a property of the LIGHTS and of nothing else in the frame. `lighting.js` grew a tier TABLE (`LIGHTING.tiers`), a `disposeLighting` that does both halves r128 needs (`shadow.map.dispose()` for the GPU memory, `scene.remove` for the lights hash the materials compile against), and `setQualityTier(tier, {renderer, THREE})`, which rebuilds the rig against the same scene and the same room list and hands the renderer the tier's shadow filter. `settingsStore.apply({tier})` routes to it live and still saves the choice. Measured in the harness (software boot): switching up gives 6 room lights, 4 shadow maps, a 2048 sun map, VSMShadowMap and +12 scene children; switching back gives 330 scene children, 1 map at 1024 and 0 room lights — the boot values exactly. `game.state` is byte-identical across each switch and the physics body count stays 75. The no-leak proof is in GPU memory, measured around real frames because a shadow map does not exist until something renders: **0 textures at rest -> 45 after a software frame -> 44 on the switch up -> 52 after a gpu frame (+8 = four VSM maps, each a map and a mapPass) -> 45 back on software.** Geometry is the one count that does NOT return, and the suite says so rather than claiming otherwise: 0 -> 356 -> **381** -> 381, against the **421 distinct geometries the scene owned before the switch** — a ceiling read before the switch, and asserted not to have moved under it (421 after), so 'the tier uploads none of its own' is proven rather than merely consistent. Its four shadow cameras simply draw 25 objects the single sun map and the main camera had both culled, and nothing frees them afterwards because nothing is orphaned. A frame presents on both tiers with zero console warnings and 16 programs (Phase 15's bound is 40). The card's 'Applies on reload' sentence is gone; what replaces it says what a live switch still cannot do.

**Touched.** `styles.css` (every box that holds type, the help line's wrap and squeeze, the four bottom-edge offsets), `src/render/lighting.js` (the tier table, `disposeLighting`, `setQualityTier`, `shadowMapCount`, `currentLighting`), `src/main.js` (`applyQualityTier`, `syncHelpMetrics` with its squeeze ladder and its floor report, the blob gate), `src/config.js` (`SETTINGS.textSize`, the `tiers` comment), `src/ui/settings.js` (the Quality row's note).

**Checked.** New `tools/m36-scale-tests.js` — **ALL-PASS 179**. Regressions: m0 132, m11 192 (+3), m12 127, m15 115, m16 143 (+3), m29 180, and beyond the brief m13 76 and m27 128. `./tools/syntax-check.sh` clean, 131 files. m31 needed its B2 NOTE re-pinned from 758/570 to 786/585 for the reason above.

Measured:
- Harness window 1262x624. BEFORE M29 at 1.6x: the help line wanted 1377.9 px and was laid out at left -57.9 (clipped at both ends, no scrollbar); the title card's scrollWidth was 783 against a clientWidth of 743.
- AFTER (re-measured this pass, unchanged by the fixer's edits): help line 1.0x -> 872.5x30.8 at (194.8, 585.2), 1 row, lift 0.00 px; 1.3x -> 1125.2x35.8 at (68.4, 580.2), 1 row, lift 0.00 px; 1.6x -> 1242.0x67.8 at (10.0, 548.3), 2 rows, lift 26.88 px. Never clipped, always inside the window.
- Contract panel 178.0 -> 231.4 -> 284.8 px wide at 1.0/1.3/1.6; cargo panel 232.0 -> 290.8 -> 349.6.
- Cards, scrollWidth/clientWidth (horizontal), re-measured this pass: title 758/758, 743/743, 743/743; settings 543/543, 711/711, 879/879; pause 418/418, 544/544, 670/670; settlement 523/523, 685/685, 847/847. No horizontal scrollbar at any size.
- Cards, VERTICAL: the title card is 786/585 at 1.6x (scrollHeight/clientHeight) where it read 758/570 before M29 — 15 px of clientHeight is the horizontal scrollbar this milestone removed, 28 px of scrollHeight is '#title-screen .cols' scaling its column minimum so the control list is one readable column at 1.6x instead of two cramped ones. The settings card reads v2361/572 at 1.0x and v3052/572 at 1.6x — pre-existing, a long list in a scrolling card; S1c asserts the overflow is reachable at every size. Nothing is cut off.
- The shell chrome, all three sizes: stamp vs help-line overlap 167.9 x 25.4 px at 1.0x (stamp 899.4,590.6 352.6x25.4 vs help 194.8,585.2 872.5x30.8), 394.0 x 30.0 px at 1.3x, 552.2 x 34.6 px at 1.6x (the stamp lies entirely inside the wrapped line). The 1.0x figure is a pinned assertion.
- The help-line budget, ENGAGED: at --ts 3.2 the line lands on 2 rows at squeeze 0.80, font 30.72 px, box 1242.0x100.0 at (10.0, 516.0), not clipped. Back at 1.0x: squeeze 1, font 12px, --help-squeeze '1', overBudget false.
- NEW THIS PASS — the help-line budget, EXHAUSTED: at --ts 12 the ladder is spent to its floor factor 0.72 and the line still needs 7 ROWS against a budget of 2. --help-lift becomes 870.9 px, helpMetrics.overBudget is true, and exactly one console line is raised naming the row count, the floor squeeze, helpMaxLines and the 870.9 px lift. Back at 1.0x: 1 row, lift 0, squeeze 1, overBudget false. Derived from the suite's own 872.5 px one-row line at 12px, the floor factor at 1.6x still wants ~1005 px of control line, so a window under roughly 560 px wide at 160% text is past the ladder — which is now the flag's and the log's job to say, not silence's.
- The title-card exemption, measured: at 1.6x with the card as shipped m31 B2's predicate holds; given `width: calc(760px * var(--ts))` the card would be 1216 px wide and the predicate breaks. The card returns to its shipped width within 0.5 px afterwards.
- Co-op at 1.6x: halves 630x624 at x=0 and x=632; contract 240.0x151.9 per half; notices 257.6x35.5. All predicates hold in both halves at 1.0, 1.3 and 1.6.
- Rect invariance: after 1.0 -> 1.3 -> 1.6 -> co-op -> 1.0 every recorded panel rect returns within 0.5 px, --help-lift returns to 0.00px and --help-squeeze to 1.
- Stylesheet: 28 box declarations (width/min-width/max-width with a non-zero px), 10 deliberately px on SETTINGS.textSize.pxAllowed; 1 capped font declaration, and it is now read as a NUMBER rather than a substring — '#title-screen .name' caps at min 1.35 and the allow-list says 1.35, matched exactly. The font-declaration walk (U1e/U1g) is unchanged at 87 declarations, 87 scaled.
- Quality tier, live, in the harness (software boot): boot 330 scene children, 75 bodies, 1 shadow map at 1024. To gpu -> 6 room lights, 4 shadow maps, sun map 2048, 342 scene children (+12), VSMShadowMap. Back -> 330 children, 1 map at 1024, 0 room lights. game.state JSON byte-identical across each switch; physics bodies 75 throughout.
- No-leak proof, GPU textures around real frames: 0 at rest -> 45 after a software present -> 44 on the switch up -> 52 after a gpu present (+8 = 4 VSM maps x map+mapPass) -> 45 back on software.
- GPU geometries, with the ceiling now captured BEFORE the switch: 0 at boot -> 356 after a software present -> 381 after a gpu present -> 381 back on software, against 421 distinct geometries the scene owned BEFORE the switch and 421 after it (Q2f2a: the switch added none). The implementer's original 'renderer.info.memory.geometries never moves' rested on a 0 === 0 comparison and is FALSE around real frames: the gpu tier's four shadow cameras draw 25 objects the single sun map and the main camera had both culled, so 25 more of the SAME scene becomes resident and stays resident. Not a leak; not a return to the pre-switch value either.
- present() on both tiers: 259 draw calls / 59 260 triangles each, programs 0 -> 16 (Phase 15's bound is 40), zero console warnings or errors. The identical draw-call counts are r128: WebGLRenderer.render() runs shadowMap.render() before info.reset(), so shadow-pass buffers are counted and then zeroed; the +8 textures and the +25 geometries are where the four maps actually show up.
- The full notice stack at 1.6x reaches (994.4, 388.7) 257.6x154.0 — above the centre band's lower edge (416 px) in y but far outside it in x, so it stays clear.

Deviations from the brief:
- The review's ONE major violation is STILL not resolved and still cannot be within my file ownership: tools/m31-contract-ux-tests.js:360-361 needs a one-line re-pin and is in neither M29's nor M30's filesTouched. I reproduced the failure a fifth time this pass (FAILURES 1 of 141, 786/585 against a pin of 758/570), re-verified both replacement anchors are byte-for-byte present at lines 360 and 361, and the number is independently pinned inside M29's own suite (m36 S1c1). The exact patch is in blockers. Neither half of the move is revertible without undoing the fix: clientHeight 570 -> 585 IS the horizontal scrollbar going away, and reverting '#title-screen .cols' would restore scrollHeight to ~758 while leaving clientHeight at 585, so the assertion would still fail and the 1.6x control list would go back to two cramped columns.
- The ladder's floor is a FLOOR, not a guarantee, and that is now stated three ways instead of zero: helpMetrics.overBudget, one console line, and an open KNOWN_ISSUES item. When SETTINGS.textSize.helpSqueeze runs out with the line still over helpMaxLines the panels above it DO rise into the working area — measured at --ts 12: 7 rows, 870.9 px of lift. No ladder can be made deep enough for every window, so the design decision is to report the lapse rather than hide it or pretend a deeper list closes it; the honest fix is a shorter control line, which is a content change, not a layout one.
- CORRECTION carried forward from the previous pass: 'renderer.info.memory.geometries never moves' is false. Around real frames it moves 356 -> 381 -> 381. The suite says what is true instead, and as of this pass the ceiling that proves it is captured before the switch and asserted not to have moved (Q2f2a) — so the claim 'the tier uploads none of its OWN' is now proven rather than merely consistent with the measurement.
- SETTINGS.textSize.helpMaxLines is enforced rather than documented, and the enforcement has a cost worth naming: when the line cannot fit the budget the help TEXT shrinks (SETTINGS.textSize.helpSqueeze, a factor on #help's font-size). That is a text-size setting declining to give a player the full size they asked for, in the one panel where the alternative is a third row lifting the route bar and the caption into the working area (§21.1). It never engages in the shipping range in a 1262 px window (m11 M29-5 pins --help-squeeze at 1, M29-7 pins overBudget false); it engages at 3.2x (2 rows at 0.80) and lapses at 12x (7 rows at 0.72). Both branches are in KNOWN_ISSUES as one open item.
- '#title-screen .name' still caps at min(var(--ts), 1.35) rather than scaling — the measured reason is unchanged (three inline words with no break opportunity, 735 px of name in a 647 px plate at 1.6x) — and the cap is now matched on the number the walk READ out of the min(), so the allow-list can no longer be satisfied by a different number that merely appears in the same declaration.
- '#title-screen .card' still keeps `width: min(760px, 96vw)` on the pxAllowed list — the brief asked for the cards' max-widths and this is the one card that did not get it — but the exemption is falsifiable: m36 S1e evaluates m31 B2's own predicate with and without the scaled width and fails if a scaled card would NOT have broken it.
- The brief writes the live-tier calls as settingsStore.apply({ quality: 'low' | 'high' }). There is no `quality` key: the shell key is `tier` with values 'auto' | 'gpu' | 'software'. Implemented and asserted with the real key; the card's LABEL is 'Quality'.
- src/ui/hud.js was listed in filesTouched and needed no change: every box the HUD owns is a CSS rule, and the one px in the file is Hud.setRect's per-seat viewport rectangle, which is a viewport in device pixels and must not scale.
- 'The post settings that the tier decides follow the same call' goes as far as it honestly can: applyQualityTier calls post.setEnabled(tier === 'gpu') and stops feeding the contact blobs, but a live switch cannot BUILD a post chain that boot did not build. The settings note says exactly this and it is in Known Issues.
- m36 S1's overlap matrix still covers the nine §21.1 boxes and excludes the two shell boxes, because #build-stamp and #help already overlapped by 167.9 x 25.4 px at 1.0x before this milestone and #debug-overlay sits on the contract panel by design. S1d pays for the exclusion: everything about the stamp that is assertable at all three sizes, with the 1.0x overlap pinned.
- m11 O5's centre-third predicate measures against window.innerWidth/innerHeight; in co-op that is the wrong box, so m36 re-implements the same predicate against the HOST rect. m11's own copy is untouched.
- #walkthrough gained the §21.1 guard '.objective' already uses (min(calc(312px * var(--ts)), calc(33vw - 12px))); 312 px is unchanged at 1.0x, so m29's rects do not move.
- No real-GPU eyeball was possible (headless Chrome is SwiftShader, no GPU browser here), so brief item (3) is a recipe in PLAYTEST_NOTES, not a result. Everything about the gpu tier is asserted by counts: lights, shadow maps, map sizes, scene children, and the GPU textures and geometries the maps make resident and free.

### M30

### M30 — property damage tells the whole story: a corner hit splits, a capped wall keeps talking, and the caption names what was hit (§15.1, §15.3, §8.3, §8.4, §12.2, §26.1, §26.5)

**Hypothesis.** M14 built the property ledger and wrote three of its edges into KNOWN_ISSUES as facts rather than as fixes, and M23's door frame made all three more visible — a couch forced through a doorway hits the frame and the wall in the same step. (1) *A corner hit bills one surface*: attribution took the surface whose manifold impulse was largest and gave it the whole m·Δv, so a wall and a header struck together charged one of them everything. (2) *A capped surface posts no further lines* — and with them no notices and no marks, so §8.3's cap on the MONEY had silently become a cap on §8.4's "material sound, visual mark, optional haptic pulse, and one small cost notice" at every impact. (3) *Property captions are generic*: m18 A1b pinned cue captions as literal strings, so the subtitle said 'wall scuffed' when a door frame was scuffed, while the HUD notice had named the surface since M14's first line. All three are attribution and feedback corrections inside M14's own module. **The prices do not change.**

**What it does.** The m·Δv is now shared across every billable surface a step touched, in proportion to each SURFACE's summed manifold impulse — per surface, not per manifold and not per collider, because Rapier reports several manifolds per pair and scene.js builds one collider per solid run of a partition. The winner still decides whether anything is billed at all: a TV landing on the floor beside a wall it grazes is still a floor landing and still free (§10.4). Each surface gets its own line, notice, scuff and caption, and each window remembers its share so §15.1's threshold is split with it — the threshold is a property of the HIT, not of the wall. A share under DAMAGE.property.splitMinFraction (0.12) is folded into the largest rather than posted as a fraction of a cent, and the record still lists it at share 0: what was touched is a fact even when it was not billed. A surface at DAMAGE.property.maxChargePerSurface now raises EVENTS.PROPERTY_CAPPED — cost 0, the surface named, at most one per DAMAGE.property.cappedRepeatMs (1500 ms) — which drives the notice, the mark, the caption and the pad exactly as a line does while the ledger and its counters stay untouched. That event is read from the ROOM LEFT on the surface and never from the rounded charge: a hit that rounds away on a wall with 400.00 of room is the ordinary under-threshold case and stays silent, as it always did (§10.4), while only a charge the cap actually denied says so. And a cue caption may now be a pure FUNCTION of the payload as well as a string, so the five property bands and the capped cue name the surface from the same table the ledger line's `location` comes from.

**Modules.** `src/damage/damage.js` (_attributeProperty splits, _feedPropWindow carries the share, _postPropLine flags the capped line and gates the capped cue on the room left, new _postCapped and _shareOf, propertyCost gains a share argument), `src/damage/surfaces.js` (surfaceKind / surfaceRoom / surfaceCaption — new, pure, total), `src/audio/audio.js` (captionText, resolveCue evaluates templates, five caption templates and the PROPERTY_CAPPED row), `src/core/eventBus.js` (EVENTS.PROPERTY_CAPPED), `src/config.js` (DAMAGE.property.splitMinFraction / cappedRepeatMs; HAPTICS.PROPERTY_CAPPED), `src/main.js` (the capped notice and mark), `src/contract/invoice.js` (' (N at the cap)' on the property line), `src/ui/invoiceScreen.js` ('(capped)' on the recap row).

**Checked — every figure measured, none preferred.** A 9.00 kg, 0.5 m box thrown at 3.0 m/s into the living-kitchen doorway's west jamb from (2.05, 2.32, −4.55): the step's manifolds read doorHeader_living_kitchen 19.164 N·s and partition_wall_living_back 9.590 N·s, so the shares are 0.6665 / 0.3335 and the windows take 16.194 and 8.104 N·s of the 24.298 N·s m·Δv. The two lines post 13.11 + 6.56 = **19.67** against the **19.68** M14's own formula — copied verbatim into the suite — would have posted as one line; unrounded the two agree to better than 1e-9, the one cent being two lines rounding where one used to (the bound is three half-cents, 0.015, and that is the tolerance the suite asserts). Two events, two scuff quads, two notices and two captions: 'living-kitchen door frame scuffed' and 'living room back wall scuffed'. The same throw 0.15 m further in leaves the partition 1.757 N·s of 28.846 = 6.09 %, under the 12 % floor: one line of 19.70, one notice, one mark, and a record of [{header, 1}, {partition, 0}]. Seven 6 m/s throws take the front wall 61.40 → 122.80 → 184.20 → 245.61 → 307.01 → 368.41 → **400.00** (m22 PD6 unchanged), with exactly one line flagged capped — the seventh, trimmed from 61.40 to 31.59. The eighth throw posts **no line and no property DAMAGE_APPLIED** and leaves Σ at 400.00 to the cent, and fires one PROPERTY_CAPPED, one notice ('front wall dented — already at its maximum'), one scuff quad and one caption ('front wall — already at its maximum'); three further hits, the last ending **1383 ms** after that event's own stamp and so inside cappedRepeatMs (1500 ms), raise **none**. The capped cue's gate was measured in both directions on a surface driven by hand: a charge of 0.0025 on an empty surface says nothing at all, a 416.00 charge fills it to 400.00 and still says nothing (the money landed), a second 0.0025 charge on the now-full surface still says nothing — it was never billable — and a 44.80 charge on it fires exactly one PROPERTY_CAPPED with the ledger unmoved. An unsplit hit is still M14's object key for key — roomWallW at 23.89 N·s → 19.02, no `surfaces`, no `capped` — and over a run carrying all of it the invoice reads '11 impacts on 4 surfaces (1 at the cap)' at −458.39, reconcile() agrees, and evidenceFrom's aggregate propertyTotal is the same −458.39 with propertyEvents equal to the 11 ledger lines.

**Suites.** New `tools/m37-attribution-tests.js` (ALL-PASS 68). m18 A1b restated and extended (A1b1–A1b4), m22 PD6d restated (PD6d1–PD6d3), m30 D1e restated. Green: m0 132, m11 189, m14 soak 43, m17 117, m18 168, m21 157, m22 98, m23 131, m28 151, m30 114, m37 68 — and m35 111, run because the capped cue's haptic row is new.

Measured:
- THE FALSE 'ALREADY AT ITS MAXIMUM', AND ITS FIX (m37 P6, the review's major finding). _postPropLine used `raw > 0` as its proxy for 'the surface is full' and never read `room`, so any window whose charge rounded to 0.00 on a surface with all 400.00 of its room left raised a PROPERTY_CAPPED — a false notice, a false mark, a false pad pulse and a false run-record event on a wall that had cost the player nothing. Reachable arithmetic: propertyCost(f·I, f) = f × (I − 12) × 1.6, so at share 1 any hit with I in (12, 12.003125) trips it and at the 12 % minimum share any corner hit with I in (12, 12.026) does — the split made the window ~8× wider. The guard is now `Number(raw.toFixed(2)) > 0 && room < raw`.
- P6, MEASURED. A charge of 0.0025 (impulse 12.0015625 N·s — real, and 0.00 once the ledger rounds it) on an empty roomCeiling: 0 lines, 0 DAMAGE_APPLIED, 0 PROPERTY_CAPPED, 0 quads, 0 notices, and damage._cappedAt still empty. Filling the same surface with 272 N·s → raw 416.00 → one line trimmed to 400.00 and flagged capped, still 0 PROPERTY_CAPPED (the money landed). Then the same 0.0025 charge on the FULL surface: still 0 PROPERTY_CAPPED — it was never billable, so the cap denied it nothing. Then a real 40 N·s charge (44.80) on the full surface: exactly 1 PROPERTY_CAPPED naming 'roomCeiling' at cost 0, ledger unmoved at one line.
- THE RATE DISCIPLINE, RE-MEASURED FROM THE RIGHT STAMP (m37 P3j0/P3j). The old trace printed '3 more hits over 2233 ms' from a clock read BEFORE the capped hit's park/throw/65-step block — a label that made the evidence claim the hits had straddled the 1500 ms gate. The span is now taken from damage._cappedAt.get('wall'), the stamp the gate actually reads: 3 more hits, the last ending 1383 ms after the PROPERTY_CAPPED stamp at 11033.33 ms, cappedRepeatMs 1500, aggregation window 700 ms → 0 further PROPERTY_CAPPED. P3j0 asserts the span is inside the gate so the fixture cannot pass vacuously; P3j is now `=== 0`, matching the docs claim exactly.
- THE CORNER (m37 P1), unchanged by the fix and re-measured twice. A 9.00 kg, 0.5 m box parked at (2.05, 2.32, −4.55) — bottom at 2.07, clear of the hung leaf whose top is 2.03 — thrown at 3.0 m/s into the living-kitchen doorway's west jamb. Manifold Σ|contactImpulse| that step: doorHeader_living_kitchen 19.164 N·s, partition_wall_living_back 9.590 N·s (total 28.754).
- THE SHARES. 0.6665 / 0.3335 — the manifold proportions to four decimals. Window impulses 16.194 and 8.104 N·s, summing to 24.298 N·s, which is the whole m·Δv the single M14 line would have carried.
- NOTHING GOT DEARER. The split posts 13.11 + 6.56 = 19.67. M14's formula on the same 24.298 N·s — max(0, (I − 12) × 1.6), copied verbatim into the suite as m14Cost — posts 19.68. The one-cent gap is two lines rounding to the cent where one used to; unrounded, Σ propertyCost(Iᵢ, fᵢ) === propertyCost(24.298) to better than 1e-9 (m37 P1e). P1d's tolerance is now 0.015, the arithmetic bound, not the 0.02 the review flagged.
- THE OTHER THREE CHANNELS, ONE PER SURFACE (m37 P1h–P1k). 2 property DAMAGE_APPLIED events, 2 scuff quads (M.scuffs.count +2), 2 notices ('living_kitchen door frame — scuffed · 13.11' and 'living room back wall — scuffed · 6.56'), 2 captions: 'living-kitchen door frame scuffed' and 'living room back wall scuffed'.
- THE FOLD (m37 P2). The same throw 0.15 m further into the opening, from (2.20, 2.32, −4.55): the partition reads 1.757 N·s of 28.846 = 6.09 %, under DAMAGE.property.splitMinFraction (12 %). One line only — doorHeader_living_kitchen, 24.313 N·s, 19.70, priced as an unsplit hit — with one notice, one event and one quad. Its record still lists both surfaces: [{doorHeader_living_kitchen, 1}, {partition_wall_living_back, 0}].
- THE CAP (m37 P3, m22 PD6). Seven 6 m/s throws take the front wall to its maximum: Σ 61.40 → 122.80 → 184.20 → 245.61 → 307.01 → 368.41 → 400.00. Exactly one line is flagged capped — the seventh, trimmed from 61.40 to 31.59. No PROPERTY_CAPPED fires at any point while there is still room (P3a), which the fix strengthens rather than weakens.
- THE HIT THAT USED TO VANISH (m37 P3c–P3i). The eighth throw posts 0 ledger lines and 0 property DAMAGE_APPLIED and leaves Σ 'wall' at 400.00 to the cent — and fires 1 PROPERTY_CAPPED (surfaceId 'wall', cost 0, band 'dented', at/normal carried), 1 notice matching /already at its maximum/, 1 scuff quad, and 1 caption 'front wall — already at its maximum'. counters.propertyEvents still equals ledger.propertyDamage.length.
- THE UNSPLIT CONTROL (m37 P5, P5a). A single-surface throw into roomWallW: 23.89 N·s → 19.02, which is M14's closed form on its own impulse to the cent, with no `surfaces` key and no `capped` key on the line. Every m22 number is unchanged: ALL-PASS 98 including PD2d ('cost === (impulse − 12) × 1.6'), PD5, PD6, PD6a–c and PD13's 40-throw ring.
- THE SHEET (m37 P5b–P5i). Over one run carrying two split lines, a folded line, an unsplit line and a capped surface: invoice property line '11 impacts on 4 surfaces (1 at the cap)' at −458.39, reconcile().ok true, 11 citations for 11 ledger entries, the recap row 'front wall marked by box_small_01#6 — 31.59 (capped)' appearing exactly once, and evidenceFrom([this run]).aggregates.damage.propertyTotal −458.39 with propertyEvents === 11.
- THE CAPTION TABLE (m37 P4, m18 A1b). 6 caption templates now exist (DAMAGE_APPLIED's scuffed/dented/holed/bent/forced plus PROPERTY_CAPPED); the 3 item bands (scratched/cracked/broken) and every other row are still literal strings. All five property templates resolve under 64 characters against TELEMETRY.textMax of 280, are pure (same payload twice, same words) and total (a bare {} still captions 'a wall scuffed').
- THE HUD (m37 P4f, P4g). After one bus.emit + M.audioFrame() + M.feedHuds(), the caption line reads '↑ living-kitchen door frame scuffed' and, for a capped hit, '↑ front wall — already at its maximum' (the ↑ is §21.4's direction glyph, which the layer has always prefixed).
- THE PAD (m35, run by the fixer). ALL-PASS 111 — HAPTICS.PROPERTY_CAPPED is a real row the haptics layer attaches by name, not a declaration nobody exercises. This was an open contract gap in the review, which could not run the suite.

Deviations from the brief:
- src/core/eventBus.js is NOT in the brief's filesTouched, and M30 cannot be built without it. The brief asks the capped hit to post 'a property_capped event to the run record'; the run record is bus events (RunRecorder subscribes with bus.onAny, src/telemetry/runLog.js:120), so the event needs a name. It could not be a zero-cost DAMAGE_APPLIED: src/telemetry/runLog.js:86 counts EVERY property DAMAGE_APPLIED as a ledger line, and tools/m17-tests.js R2e and tools/m22-property-tests.js PD10 both pin counters.propertyEvents === ledger.propertyDamage.length. Added one frozen key, EVENTS.PROPERTY_CAPPED, immediately before ZONE_CHANGED, with the reasoning in the comment. The reviewer confirmed no collision: M29 touched only settings.js / styles.css / lighting.js / m11 / m16 / m36. This is the rule-1 departure the review recorded as minor, and it stands.
- src/main.js was edited (a SHARED file, surgically, one hunk) because src/render/scuffs.js — which is not in filesTouched — subscribes only to EVENTS.DAMAGE_APPLIED (scuffs.js:91) and the brief requires a scuff on a capped hit. Rather than touch scuffs.js, main.js's PROPERTY_CAPPED observer calls scuffs.mark(e) directly; the payload carries category 'property', `at` and `normal`, which is everything Scuffs.mark reads. The same observer raises the notice, which has to live in main.js anyway.
- The capped-notice rate limit is DAMAGE.property.cappedRepeatMs, not NOTICE.cappedRepeatMs as the brief's risk note suggested. NOTICE holds only ttlMs and maxStack, both HUD-side, and the gate here governs the EVENT — and with it the mark, the caption, the pulse and the run record, not only the notice. It belongs beside maxChargePerSurface, in the block damage.js already imports.
- tools/m30-force-tests.js is not in filesTouched, and its D1e was a SECOND, undocumented instance of the same string-caption pin m18 A1b carries: it asserted resolveCue('DAMAGE_APPLIED', propertyLine).caption === 'door forced'. That is precisely the generic caption M30 exists to remove, so the suite could not go green with it in place. Restated to 'door forced/living-kitchen door frame forced' with a comment: the DOOR_STATE cue still names the door, the property cue now names the frame. One assertion, one comment; nothing else in that file was touched. Rule-1 departure, recorded as minor by the review, and it stands.
- tools/m22-property-tests.js PD6d (in filesTouched) was restated rather than left alone: it asserted 'no line, no event, no notice', and the middle two are the KNOWN_ISSUES item M30 closes. The LEDGER half is kept and made stricter (Σ wall cost unchanged to the cent as well as no line and no property DAMAGE_APPLIED); PD6d1/PD6d2/PD6d3 assert the feedback that now fires.
- src/contract/invoice.js gained ' (N at the cap)' on the property line's detail. The brief only asked for '(capped)' on the sheet's line for that surface, which is invoiceScreen.js's recap row — but the recap is limited to INVOICE.recapPerKind (3) rows per kind and property rows are not rank-sorted, so the capped row can be elided from the real sheet. The invoice line always shows. The two use different wording so '(capped)' still appears exactly once (m37 P5f); the existing regex test PD8c (/2 impacts on 2 surfaces/) is unaffected because the suffix is only added when a capped line exists.
- m37 P5's unsplit control throws at roomWallW rather than at m22 PD2's front wall. P1, P2, P3 and P5 deliberately share ONE run so the invoice carries split lines, a folded line, an unsplit line and a capped surface together — and by P5 the front wall is at its cap, which is the one thing that is not an ordinary line. The claim under test (one surface in contact, so the split has nothing to split) is unchanged.
- The split's threshold-sharing rule needed a definition the brief did not give, because a window aggregates several steps. Each window accumulates fracSum = Σ (fraction × impulse) and its share is fracSum / impulse — the impulse-weighted mean fraction. By Cauchy–Schwarz (Σf²I / ΣfI ≥ ΣfI / ΣI) the shares of the windows in one group sum to at least 1 whatever order the steps arrive in, so a split can never cost MORE than not splitting; for a one-step corner hit the sum is exactly 1 and the equality is exact. The reasoning is in the _feedPropWindow header.
- DEVIATION 9 (the review's minor 2, now recorded rather than only explained). Brief m37 P1 asks the split sum to equal the pre-change formula's amount 'to 0.005'. That is unattainable once the money is rounded: two lines each round to the cent where one used to, so the arithmetic bound is half a cent per extra line. P1d is now at 0.015 — that bound and nothing looser, down from the 0.02 the review flagged — and the measured gap is 0.01. The brief's exact claim is kept as P1e, on the UNROUNDED amounts, at 1e-9, which is the stronger statement. The comment in the suite says all of this at the assertion.
- DEVIATION 10 (fixer). tools/m37-attribution-tests.js gained a P6 block, an id the brief does not name, and it is the suite's only WHITE-BOX fixture: it builds the object _feedPropWindow builds and hands it to damage._postPropLine directly. That is deliberate — the case is a charge a hair over DAMAGE.property.impulseThreshold, which no throw can be aimed at, and the review's major finding was invisible to every fixture precisely because they all drive a surface to a genuine 400.00 first. Everything else in the suite is thrown. The block ends with freshRun() so Z1's 'the reset cleared everything' still measures a clean world.

## Phase 28 — Phase 11 build side, batch 13: trigger pressure at the hand, and the haptic pulse — 2026-09-05

Phase 11's build side (GDD §25.2: onboarding, settings, instrumentation, fixes), from the ordered plan in docs/PHASE11_PLAN.md. Each milestone was built by a file-owned implementer and adversarially reviewed against its brief; the numbers below are the ones the reviews reproduced.

**3779 assertions across 36 suites, all passing.**

### M27

### M27 — a half-pulled trigger is a weaker grip, and §6.5's first assist gets a row (§4.3, §4.4, §6.2, §6.5, §21.4, §26.5)

**Hypothesis.** Two sentences the codebase had been carrying without keeping. `src/core/input.js`'s own header has said since Phase 3 that "analog() returns 0..1 so a half-pulled trigger is a weaker grip", the binding tables have marked `gripLeft`/`gripRight` `analog: true` for just as long, and `Input.analog()` has returned the trigger's own 0..1 the whole time — and `GripSystem.capPerHand` never read it. A feathered LT and a full pull were the same 750 N. And §6.5's "Grip strength scaling … may reduce motor demand. They must preserve the physical puzzle rather than turn furniture into inventory icons" had no control anywhere. The plan deferred both as "a controller-only nuance touching validated grip tuning"; that tuning is pinned to the millimetre by m2, m3, m4, m6 and m10, which is exactly what makes the change safe — at a full pull, nothing may move.

**Nothing moved.** `tools/m34-pressure-tests.js` carries a verbatim copy of the pre-M27 `capPerHand` body and compares it against the live method across **64 combinations** — couch 90 kg, dresser 55, box_small 9, fridge 110, × {1, 2} hands × {braced, unbraced} × {fresh branch, tired branch — an identity while the fixture rests the mover} × {wet, dry}. Worst |difference| **0**: bit-identical, not merely inside the 1e-9 the brief asked for. The identities are exact in IEEE-754 (`forceCap * 1.0 * mult === forceCap * mult`; `x * 1 === x`), which is why the assist and the pressure could be introduced as multiplications by one rather than as a branch. The reference caps the suite prints: couch one hand **750.000 N**, two hands **618.750 N** each, braced **1350.000 N**, a 9 kg box **225.000 N** (mass × maxAccel winning the min). m6's own figures this run: solo couch haul **0.34 m** in 3 s at 618 N and 0.61 of the 0.70 band, braced 0.02 m, two movers 5.07 m — all unchanged.

**The trigger now reaches the hand.** The per-hand cap is multiplied by `Input.analog()`'s 0..1, read inside the per-hand loop of `step()` so it follows the finger rather than being sampled at the grab. Through the real pad path — a stubbed Standard Gamepad, `Input.poll`, the live binding table's trigger button, the seat view `main.js` hands the grip system — a couch in one hand reads **750.00 N at a full pull, 375.00 N at 0.5, and 262.50 N at 0.1**, the last being `GRIP.analog.floor` (0.35) winning. **`GRIP.analog.floor` is asserted equal to `DEFAULT_SETTINGS.triggerThreshold`**: the pressure a hand reports when it closes is the pressure it took to close it, and a reading under the threshold is not a weak hold at all — the input layer has already released the grip (measured: `isDown` true at 1.0, false at 0.30).

**Where the pressure enters is not where the assist enters, and that was decided by measurement.** The assist multiplies `forceCap` INSIDE `min(strength, mass × maxAccel)`, because it is strength and strength must not make a hand faster — the same rule brace and hand count already obey. The pressure scales the RESULT, because how far a hand is closed limits everything the hand can do. Scaling strength alone would have been **inert on a 9 kg box until the trigger fell below 0.30** — under the floor, i.e. unreachable — since that box's cap is 225 N of acceleration against 750 N of strength. m34 T1j/T1k pin both halves: the assist leaves the box at 225.000 N at 1.0 and at 1.5; pressure takes it to 112.5 N at 0.5.

**Easing off is a consequence you can see, and it reaches an old failure mode, not a new one.** A 9 kg box hanging at a full pull sits at y 0.377 m with 0.1001 m of stretch (the predicted m·g/spring is 0.0981) under 87.1 N of a 225 N cap. Easing the trigger 1.00 → 0.30 over 20 frames walks the cap **217 → 209 → … → 91 → 83 → 79 N**, past the box's own 88.3 N of weight: 18 frames falling, one flat at the floor, none rising. The hand-to-object distance grows **0.1001 → 0.1881 m** — the box visibly sags — and at step 42 the hand **slips**, through the `slipThreshold`/`slipMs` path that has been there since Phase 2: `GRIP_ENDED` with reason `'slipped'`, the only reason emitted. The lowest the box reaches is **y 0.2499 m against a 0.250 m resting centre**: it lands on the floor, it does not pass through it.

**§6.5's assist, and the two bounds that keep the puzzle.** A `Grip strength` row on the settings card (1.00 / 1.25 / 1.50) sets the shell key `gripAssist`, which `main.js` routes to every mover's `GripSystem.setAssist` — the M16 pattern, the one the camera-shake switch already uses. `GRIP.assist.max` is 1.5, and it is bounded by two measurements the suite makes from config rather than from a hand-typed number. **(1) A partner is still worth more than the slider**: one hand at maximum assist is `forceCap × 1.5` = **1125 N**, below one mover's two-hand total `forceCap × twoHandForceMult` = **1237.5 N**. **(2) The assist never touches the stretch band**: a hand's force is also `spring × stretch`, so it can never exceed `spring × maxStretch` = **630 N** (693 braced) whatever the cap says, and the fridge's effective floor friction is **745 N** — so the fridge stays a dolly job at every setting even though its cap at maximum assist would be 1125 N. What the assist actually buys is where the CAP binds rather than the band: a solo couch drag goes **0.344 m → 0.627 m** in 3 s (tow limit 1.10 → 1.59 m/s, held 180/180 both times), which is **12.1 %** of the 5.162 m two movers cover — and a WET couch (§6.2's `wetGripMult`), which one mover cannot lift two-handed at 1.0 (742 N of cap against 883 N of weight, clear 0.000 m), lifts clear by **0.107 m** at 1.5 (926 N peak). The assist offsets a §6.2 penalty; it does not create a capability the dry object did not already have.

**And it found a §4.4 parity hole on the way.** `Input._sourceIndex` indexed key and mouse tokens only, and `_press()` resolves a token to its actions to decide what to latch — so a pad trigger press resolved to nothing and **§21.4's toggle grip never latched on a controller at all**: pressing LT in toggle mode did literally nothing. Seat-qualified pad tokens (`P<seat>B<i>`) are now indexed; they are unambiguous by construction, which is what the old comment was warning about for the *unqualified* form. m34 T1i asserts a latched grip reports full pressure after the trigger is released — because a latch that read a released trigger as zero would drop the box the instant the player let go of the toggle.

**Checked.** m34 **51 (new)**, plus m2 75 · m3 65 · m4 62 · m6 119 · m10 51 · m12 127 · m16 138 — every grip number unchanged, every fixture a full pull or a keyboard press — and m0 132 · m15 115 · m26 192 over the input.js change. All ALL-PASS.

Measured:
- THE UNCHANGED-AT-FULL-PULL PROOF (m34 T1a). capPerHand was compared against a verbatim copy of its pre-M27 body across 64 combinations — couch 90 kg / dresser 55 / box_small 9 / fridge 110, x {1,2} hands, x {braced, unbraced}, x {tired, fresh}, x {wet, dry}. Worst |difference| 0 (bit-identical, not merely within 1e-9). The identities are exact in IEEE-754: `forceCap * 1.0 * mult === forceCap * mult` and `x * 1 === x`.
- THE REFERENCE CAPS, printed by the suite: couch one hand 750.000 N; couch two hands 618.750 N each; couch braced one hand 1350.000 N; 9 kg box 225.000 N (mass x maxAccel, the acceleration half winning).
- TRIGGER PRESSURE, couch, one hand, through the real pad path (stubbed Standard Gamepad -> Input.poll -> Input.analog -> the seat view main.js hands the grip system): full pull 750.00 N; 0.5 -> 375.00 N; 0.1 -> 262.50 N (GRIP.analog.floor 0.35 wins). A keyboard/mouse seat reads 750.00 N with the pad still reporting 0.1.
- GRIP.analog.floor 0.35 === DEFAULT_SETTINGS.triggerThreshold 0.35, asserted (m34 T1f2): the pressure a hand reports at the moment it closes is the pressure it took to close it, and below the threshold the input layer has already released the grip rather than holding weakly.
- THE LIVE EASE (m34 T2). A 9 kg box hanging at a full pull: y 0.377 m (resting centre 0.250), stretch 0.1001 m against the predicted m.g/spring 0.0981, 87.1 N applied under a 225.0 N cap. Easing the trigger 1.00 -> 0.30 over 20 frames walks the cap 217 -> 209 -> 201 -> 194 -> 186 -> 178 -> 170 -> 162 -> 154 -> 146 -> 138 -> 131 -> 123 -> 115 -> 107 -> 99 -> 91 -> 83 -> 79 -> 79 N, past the box's own 88.3 N of weight: 18 frames falling, 1 flat (the floor), 0 rising. The hand-to-object distance grows 0.1001 -> 0.1881 m (the box sags), the hand SLIPS at step 42 with GRIP_ENDED reason 'slipped' — the pre-existing slipThreshold/slipMs path, the only reason emitted — and the lowest the box ever reaches is y 0.2499 m against a 0.250 m resting centre: it lands on the floor, it does not pass through it.
- AND THE INPUT LAYER GETS THERE FIRST IN THE REAL GAME (m34 T2h): a trigger held at 1.0 reads isDown true, eased to 0.30 it reads false, because _pollPads gates the trigger at SETTINGS' triggerThreshold (0.35) and main.js then lets go. The 0.35 floor governs the band BETWEEN the threshold and a full pull; easing all the way off is a release, not a weak hold.
- PUZZLE GUARD 1 (m34 T3b), computed from config through the strength method itself: one hand at maximum assist is forceCap x assist.max = 1125 N, BELOW one mover's two-hand total forceCap x twoHandForceMult = 1237.5 N. A partner is still worth more than the slider.
- PUZZLE GUARD 2 (m34 T3c): the assist never touches the STRETCH BAND. A hand's force is also spring x stretch, so it can never exceed spring x maxStretch = 630 N (693 N braced) whatever the cap says, and the fridge's effective floor friction is 745 N. The fridge stays a dolly job at every assist setting even though its cap at maximum assist would be 1125 N.
- WHAT THE ASSIST BUYS, MEASURED (m34 T3f/T3g). m4's own lift fixture, one mover, both hands, unbraced, on the couch made WET (§6.2 wetGripMult): at assist 1.00 the total force peaks at 742 N against 883 N of weight and the lowest corner never leaves the floor (clear 0.000 m); at assist 1.50 it peaks at 926 N and lifts it clear by 0.107 m.
- AND THE DRAG, which is where the cap really binds (m34 T3h/T3i/T3j). A solo one-hand couch haul over 3 s: 0.344 m at assist 1.00 (tow limit 1.10 m/s) -> 0.627 m at 1.50 (tow 1.59 m/s), held 180/180 both times. Two movers over the same 3 s: 5.162 m. The assisted solo drag is 12.1% of the two-mover distance, against a 70% bound.
- NOTHING IN THE VALIDATED GRIP TUNING MOVED. m6's own printout this run: couch bare solo unbraced 0.34 m in 3 s, 618 N peak, stretch 0.61 of the 0.70 band, held 180/180, object peak 0.26 m/s against the mover's 0.46; braced 0.02 m; two movers 5.07 m. m2 75, m3 65, m4 62, m6 119, m10 51, m12 127, m16 138 assertions, all ALL-PASS.
- CO-OP (m34 T5): with two seats, the first pad goes to the joiner (activeDevice seat 1 'pad', seat 0 'kbm'). Seat 1's trigger at 0.5 gives mover 1's hands pressure 0.5 and half the cap; seat 0 on the keyboard reads pressure 1 and today's number exactly. main.js wires movers[0].grips.seatInput === seatInput(0) and movers[1].grips.seatInput === seatInput(1).
- PERSISTENCE (m34 T4): all three steps (1, 1.25, 1.5) round-trip through save/load. Ten hostile values — 9, 100, 0.5, -1, 1.4, 1.51, 'strong', null, NaN, Infinity — all fall back to 1.0 rather than clamping. GripSystem.setAssist(99) -> 1.5, (-3) -> 1, ('x') -> 1. The save blob still has exactly seven sections: bestInvoice, bindings, build, runs, schema, settings, shell.
- THE TOGGLE-GRIP HOLE THIS FOUND (m34 T1i). Before this milestone Input._sourceIndex indexed key and mouse tokens only, and _press() resolves a token to its actions to decide what to latch — so a pad trigger press found no action and gripMode 'toggle' latched nothing at all on a controller. Pressing LT in toggle mode did literally nothing. Seat-qualified pad tokens ('P<seat>B<i>') are now indexed; m34 T1i asserts a latched grip reports full pressure after the trigger is released, and m0 132 / m12 127 / m15 115 / m16 138 / m26 192 were re-run green over the change.

Deviations from the brief:
- input.analog's signature is (action, seat), not (seat, action) as the brief writes — src/core/input.js:1075 `analog(action, seat = 0)`, and the per-seat view (input.js:592) exposes `analog: (a) => self.analog(a, n)`. It is therefore ALREADY the public per-seat pressure accessor, so no `pressure(seat, action)` method was added: a second door onto one number is the drift the file's own header warns about. GripSystem takes the seat VIEW (setSeatInput) rather than an (input, seat) pair, which is the same duck type main.js already builds and the same seam a network client arrives through (§22.4).
- The dead zone that applies to a TRIGGER is SETTINGS' triggerThreshold, not stickDeadzone. input.js analog() ends `if (def.analog) return v >= this.settings.triggerThreshold ? v : 0;` — stickDeadzone is the stick's, applied in _pollPads to the axes. The brief's 'the pad's dead-zone setting (M4) applies before the floor' is satisfied by triggerThreshold, and m34 T1f2 pins GRIP.analog.floor equal to its shipped default so the two cannot drift.
- PRESSURE SCALES THE RESULT OF capPerHand, NOT THE STRENGTH TERM, and this was decided by measurement rather than by reading. A 9 kg box's cap is min(750 N of strength, 9 x 25 = 225 N of mass x maxAccel) = 225 N, so multiplying strength alone would be inert on a box until the trigger fell below 0.30 — below GRIP.analog.floor 0.35, i.e. never reachable — and the brief's own T2 ('holding a 9 kg box ... the box sags') would have been impossible to satisfy. The ASSIST does multiply forceCap, inside the min(), because it is strength and strength must not make a hand faster (the rule brace and hand count already obey). m34 T1j/T1k assert both halves: the assist is inert on the box (225.000 N at 1.0 and at 1.5), pressure is not (112.5 N at 0.5).
- The exertion reference — capPerHand(entity, hands, brace, true) on the §5.2 line in step() — deliberately does NOT take the pressure, and is therefore byte-identical to the pre-M27 call. §5.2 measures work against what RESTED MUSCLES could do; a player who feathers the trigger is applying less force, not straining harder, and passing the pressure in would have made a deliberately gentle hold read as a 100%-of-cap effort and tire the mover for holding something carefully — the opposite of what §6.5's assist row exists for. A feathered hand still SLIPS (the overload test is against its own live cap, m34 T2f); it just does not also get tired.
- towFor() also takes the pressure, via a new GripSystem.gripPressureOn(entityId) (the weakest pressure among this mover's own hands on that object). The brief did not ask for it; without it the legs would chase a tow speed derived from a strength the hand is not applying. It is 1 in every existing path — no seat input on a fixture, 'kbm' on a keyboard seat, an unattended mover — so every m6/m2/m3/m4/m10 number is unchanged, which the runs confirm.
- THE BRIEF'S T3 LIFT IS NOT ACHIEVABLE ON ANY DRY OBJECT IN THE DEF TABLE, and the reason is the stretch band. A hand's applied force is also spring x stretch, bounded by spring x maxStretch = 630 N, and for EVERY one-hand lift in the table that band binds below the cap (the lightest cap that could bind is a 9 kg box's 225 N, which is the acceleration half the assist cannot raise). The assist would therefore have been inert on a dry lift at any setting. The measured lift is m4's own liftTogether fixture, one mover, BOTH hands, unbraced, on the couch made WET — §6.2's wetGripMult 0.6 is the one declared strength factor that pushes a two-hand couch hold out of reach (742 N of cap against 883 N of weight) and back into it at maximum assist (1113.75 N of cap, 926 N measured). This is the honest shape of the claim: the assist offsets a §6.2 penalty, it does not create a capability that did not exist dry.
- That lift fixture zeroes the mover's exertion and imbalance every step, and says so in the suite. §5.2's exertion drains at 0.30/s and would drop the assisted cap under the load at t ~= 1.7 s, and §5.1's imbalance reaches knockdown against ~740 N of supported weight in about 1.8 s — both would decide a STRENGTH question by endurance, which is m3's and m5's subject. m4's own liftTogether braces for the same reason; bracing was not available here because braceForceMult 1.8 lifts the wet couch at assist 1.0 too.
- The brief cites 'the two-mover distance m6 B10f records'. B10f is m6's player-collision-restore assertion; the two-mover haul distance is B10c's `pair.moved` (5.07 m this run). m34 measures BOTH hauls itself — solo at 1.0, solo at max, and two movers — rather than quoting a number from another suite, so the 70% guard is self-contained.
- SCOPE EXPANSION IN input.js, one hunk, and it fixes a §4.4 parity hole found while implementing T1i. Input._sourceIndex indexed keys and mouse buttons only; _press() resolves a token to its actions to decide what to latch, so a pad trigger press resolved to nothing and §21.4's toggle grip NEVER LATCHED ON A CONTROLLER — pressing LT in toggle mode did nothing at all. Seat-qualified pad tokens are now indexed (they are unambiguous by construction; the old comment was warning about UNqualified ones). Audited every other _actionsFor caller: _markDevice is only ever called with a key code, _tokenIsBound only with key and mouse tokens, and _clearSeat now drops a seat's held pad buttons on a context switch the same way it drops its keys — which _pollPads re-adds on the next poll if the button is still physically held, before any step reads it. m0, m12, m15, m16 and m26 were re-run green over the change.
- gripAssist is a RANGE row (min 1, max GRIP.assist.max, step 0.25), not a select. A select of numbers breaks m16 U2's walk, which compares the control's string value against a numeric consumer; a range over min..max with step 0.25 offers exactly the three settings §6.5 wants (1.00 / 1.25 / 1.50) and U2 reads it correctly.
- save.js REFUSES an off-step or out-of-range gripAssist and falls back to 1.0, rather than clamping the way uiScale does. A hand-edited 1.42 is a strength no player could have chosen and a 9 is an edit that would delete the puzzle §6.5 says the assist must preserve, so a damaged save is never quietly stronger than a slider could make it (m34 T4d). GripSystem.setAssist clamps again on the way in, so there is one door on each side.
- A new plain-number field, `grip.lastPressure`, is written on the grip record each step (initialised to 1 at the grab, the M26 everHeld lesson applied to a scalar). Grip records are the GripSystem's, not game.state's, so §22.4 and m0 E8 are unaffected; the HUD is untouched (§21.1 stays compact), and the strap-style stretch cue already shows the consequence.

### M28

### M28 — The optional haptic pulse: §8.4's fourth channel, from the same table the sound and the captions read (§8.4, §11.3, §10.3, §21.4 Motion, §4.4)

**Hypothesis.** §8.4 promises four things at an impact — "material sound, visual mark, optional haptic pulse, and one small cost notice". Three of them shipped: M9's sound, M14's mark, Phase 8's notice. The fourth had a comment in three files and no code. M9 had already built the thing that makes it cheap: a CUES table every EVENTS name must appear in (m18 A1), driving sound and captions from one place, with M16 nudging the camera off the same bus. A pad's two motors are one more consumer of that stream — so the work is a routing rule, a switch, and a table of magnitudes, not a system.

**What changed.**

1. **`src/audio/haptics.js` (new), beside audio.js because it consumes the same cue stream.** `createHaptics({input, seatCount, seatOfPlayer, holdersOf, drivingSeat, enabled, now})` subscribes by name for every row in `config.HAPTICS` and calls `pad.vibrationActuator.playEffect('dual-rumble', {duration, strongMagnitude, weakMagnitude})` on the seat the event belongs to. It is an OBSERVER, not a system: it never writes game.state, adds no body and adds no scene child. The promise `playEffect` returns is never awaited in the frame path and always has a `catch` — Chrome rejects it with 'preempted' the moment the next effect cancels it, which is normal mid-drive.
2. **One cue-type list for all three channels.** `HAPTICS` is keyed by exactly the keys `CUES` is keyed by, and **m18 A1's walk was extended to assert the two key sets are EQUAL** (A1g). An event that arrives with a sound and no pulse now fails a test by name instead of being quietly numb — the same direction-that-rots lesson A1 was written for. 12 rows against 12 cue rows. The audio layer's own silence threshold is reused rather than re-derived: `cueVolume(type, payload) <= 0` is silent, on **every** channel including the §10.3 sustain, so a box SET DOWN is not a thud for the hand either (§8.4).
3. **The route is data, not a switch.** Each row carries `to`: `'holder'` (the payload's `heldBy`, else the entity's own grips — a thud lands in the hands that were on it, and M14's property line names its holder), `'player'` (the mover the payload names), `'driver'`, `'all'`. A row that names nobody falls back to `'all'`; in solo that is the one hand there is.
4. **The driving seat is inferred ONCE.** M16's shake observer already worked out who is driving. That expression is now `roadShakeSeat()` in main.js and BOTH channels call it, so a road event's shake and its rumble can never disagree.
5. **§10.3's overstressed strap is a repeat, not a knock.** "Creak, vibration" is a state, so the layer holds a weak pulse every `HAPTICS.strap.periodMs` on the carrier's seat for as long as the state lasts, ticked by a shell observer on `game.frame()` — which means it freezes under the pause card and stops within one period of the state clearing.
6. **The switch (§21.4 Motion).** Shell key `rumble`, a 'Controller rumble' row on the settings card beside Camera shake, whose **default follows prefers-reduced-motion exactly as cameraShake's does** and whose saved choice always wins. The layer reads the key LIVE, so unticking the box stops a creak already in flight.
7. **`input.padForSeat(seat)`** publishes the Gamepad object each seat was polled from this frame. It is re-read every poll rather than cached, because `navigator.getGamepads()` hands back fresh objects — and it is the seam the suite installs a fake actuator through.
8. **No `maxConcurrent` knob.** One effect at a time is the actuator's own behaviour — issuing a second CANCELS the first — so it is a fact about the hardware, not tuning. The rule it would have described lives in `pulse()` and is asserted (m35 H3c/H3d): a weaker cue inside a stronger one's window stands down; a stronger one replaces it.
9. **§4.4 parity is preserved as a nuance.** Nothing is withheld from the keyboard: every cue that rumbles already has a sound (M9) and a caption (§21.4) that reach every seat. The settings row says so.

**Measured.**

- **The table:** 12 haptic rows, 12 cue rows, key sets equal. Per-seat, per-type gap **120 ms** (against the audio layer's 90 ms for IMPACT — a hand is slower than an ear). Durations in **[40, 260] ms**; 260 is deliberate, because §11.3's road events are one hit each and never a bed, so the worst drive cannot leave a pad buzzing for the 28 s of the route. The strap creak is **0.32 weak / 180 ms every 320 ms**, never the strong motor.
- **The real drop.** The 9 kg `box_small_01#6`, set down on a mover spawn point and then dropped **0.65 m** with a grip record naming seat 0's mover: exactly one cue in the window (`IMPACT@3.44 m/s`), condition **100.0 → 62.4**, one `playEffect` on the HOLDER's pad carrying **0.45 strong / 90 ms**, and **nothing at all** on the other seat.
- **Three counterfactuals the test had to walk past, all measured.** From **1.95 m** the same box breaks at **5.68 m/s** and spawns **2 fragment bodies** — and a falling fragment belongs to nobody, so it broadcasts and the other seat feels it. Lifting #6 out of the living room drops `box_small_01#7`, stacked on it, at **2.95 m/s** into the window. And an impact landing on an OPEN cost window closes it first (`damage.js _closeWindow`), so the previous drop's DAMAGE_APPLIED arrives just BEFORE this drop's IMPACT and, being the stronger row (0.85 against 0.45), takes the seat: measured, one call carrying **0.85/0.55/180** where the thud should have been. That third one is the concurrency cap working, and it is why the cap has its own assertions.
- **The creak, in the carrier's hand.** With two seats and the load gripped by seat 1's mover, one second of overstress produced **exactly 4 pulses at 333.3, 333.3, 333.3 ms** against the 320 ms period — 13.3 ms of quantisation, under one 16.667 ms frame, because a repeat fires on the first frame at or past its due time — and **seat 0 recorded none**. Two whole periods (640 ms) after the state cleared: **zero** further creaks.
- **The gap and the cap.** Two thuds **40 ms** apart are ONE call. A strong cue **20 ms** into a weak one is TWO calls — 0/0.22 then 0.85/0.55, the second replacing the first, because the actuator serialises. The reverse order is ONE call, and the weak cue plays again once the strong row's 180 ms have run.
- **Not a system.** A burst of **160 cues moved 4 state paths, all under `telemetry.counters`, and moved exactly the same 4 with the layer detached** — so the state change is M6's run recorder doing its job and the layer contributes nothing. No body, no scene child, and the gap map is bounded by seats × cue types.
- **Robustness.** A pad with no `vibrationActuator`: no throw, zero calls, counted separately from a gapped one. An actuator whose `playEffect` rejects: the call happened, the layer's own `catch` ran and counted it — which is precisely what stops the rejection escaping — nothing reached `window.unhandledrejection`, and the next cue was served normally.

**A harness bug this milestone paid for, and the rule that comes out of it.** The first version of the suite awaited a `setTimeout(…, 0)` in the middle of the run. Under `--headless=new --dump-dom --virtual-time-budget=240000` the budget is spent during boot, so that timer **never fires** — the same reason CLAUDE.md says a suite must never wait for rAF. The page sat there for ever and the harness dumped **72 green PASS lines, no FAIL, and no result line at all**, exit 1: 35 assertions (all of H5, H6 and H7) and the teardown silently never ran while the output looked like success. The suite now drains microtasks instead, which is all a `.catch` needs. **The general rule: a suite whose output carries no ALL-PASS/FAILURES line did not finish, whatever it printed before that** — CLAUDE.md's existing '0 assertions and no FAIL line' rule does not catch this, because this printed 72.

**Checked.** m35 **110 (new)** · m0 132 · m12 127 · m16 138 · m18 164 · m24 112 — all ALL-PASS.

Measured:
- THE SUITE NOW FINISHES: ALL-PASS 110 assertions, exit 0, reproduced on two separate runs (port 8681 twice). The implementer's claimed 107 was never obtainable — the review measured 72 PASS, no result line, exit 1, three times. 110 = the 107 sites minus none, plus the three new H6 routing assertions (H6a0, H6a3, H6b2); H1f and H5b1 were rewritten in place, not added.
- THE CAUSE, and the lesson worth keeping. The only mid-run `await` in any suite in tools/ was `new Promise((r) => setTimeout(r, 0))`. Under this harness — `--headless=new --dump-dom --virtual-time-budget=240000` — the virtual-time budget is spent during boot, so a timer scheduled mid-run NEVER fires. It is exactly the failure CLAUDE.md already documents for rAF ('1-3 callbacks in total, then stops'), one API over. The page sat on that timer for ever; the DOM was dumped at budget expiry with 72 green PASS lines and no ALL-PASS/FAILURES tail, so it read as a wall of success. Fixed by draining MICROTASKS instead (`for (let i=0;i<4;i++) await Promise.resolve()`), which is all the `.catch` on playEffect needs and is drained at the end of the current task unconditionally, budget or no.
- THE TABLE: 12 haptic rows against 12 cue rows — key sets equal (m18 A1g / m35 H1). Printed by the run: '12 rows; gap 120 ms; ms in [40,260]; strap every 320 ms'. Per-seat, per-type gap 120 ms (against the audio layer's 90 ms for IMPACT: a hand is slower than an ear). Rows: IMPACT 0.45/0.30/90 holder; DAMAGE_APPLIED 0.85/0.55/180 holder; GRIP_STARTED 0/0.22/45 player; GRIP_ENDED 0.10/0.26/50 player; STRAP_CHANGED 0.35/0.40/110 holder; TOOL_STATE 0.15/0.30/60 player; PART_CHANGED 0.08/0.24/45 player; DOOR_STATE 0.30/0.35/90 player; CARGO_STATE 0.20/0.30/70 all; ROAD_FORCE 0.70/0.45/220 driver; RECOVERY 0.25/0.35/90 player; CONTRACT_PHASE 0.18/0.28/120 all. Plus the §10.3 sustain: strap 0/0.32/180 every 320 ms, holder. No `maxConcurrent` — see deviations.
- THE REAL DROP (m35 H2k, physics not a synthetic event) — reproduced verbatim after every fix. Printed by the run: 'the real drop: cues [IMPACT:box_small_01#6@3.44], condition 100.0 → 62.4, seat 0 0.45/90, seat 1 none'. The 9 kg box_small_01#6, set down on a mover spawn point and then dropped 0.65 m with a grip record naming seat 0's mover: exactly one cue in the 45-frame window, no fragment bodies, one playEffect of 0.45 strong / 90 ms on the HOLDER's pad, nothing at all on the other seat.
- THE COUNTERFACTUALS THE TEST HAD TO WALK PAST, all measured by the implementer and all still pinned by the fixture. (a) From 1.95 m the same box BREAKS at 5.68 m/s and spawns 2 fragment bodies; a fragment's impact belongs to nobody, so it broadcasts and seat 1 feels it — hence 0.65 m, and H2k1 pins '0 new bodies'. (b) Lifting #6 out of the living room drops box_small_01#7, stacked on it, at 2.95 m/s into the window; the box is therefore SET DOWN first from 5 cm, under `normal` fragility's 2.0 m/s threshold. (c) An impact landing on an OPEN cost window closes it first (damage.js _closeWindow), so the previous drop's DAMAGE_APPLIED arrives just BEFORE this drop's IMPACT and, being the stronger row (0.85 vs 0.45), takes the seat: measured, one call carrying 0.85/0.55/180 instead of 0.45/0.30/90. damage.flush() before the measured window fixes it, and the observation is the concurrency cap working.
- THE §10.3 CREAK (m35 H6) — measured for the first time, because H6 had never run. One second of overstress produced EXACTLY 4 pulses at intervals of 333.3, 333.3, 333.3 ms against the 320 ms period: 13.3 ms of quantisation, under one 16.667 ms frame, because a repeat fires on the first frame at or past its due time. The count is now asserted exactly (1 + floor(1000.02 / 320) = 4) rather than as a 3..5 range. It stops on the state changing: two whole periods (640 ms) after a 'tensioned' event, zero further creaks. Unticking the switch mid-creak is silence within the same two periods and drops the sustain rather than muting it.
- THE CREAK IS IN THE CARRIER'S HAND, not everybody's (m35 H6a0/H6a3/H6b2) — the claim the brief made and the old fixture did not test. With two seats and the load's grip record naming seat 1's mover, seatsFor(strap row) is exactly [1]; every one of the 4 creaks landed on seat 1's pad and seat 0 recorded zero. The old version emitted the state for an entityId that was not in the registry while seatCount was 1, so holdersOf returned [] and the broadcast fallback gave the right answer for the wrong reason.
- THE GAP AND THE CAP (m35 H3). Two thuds 40 ms apart are ONE playEffect (the second counted in stats.droppedGap); one exactly 120 ms after the first firing plays. A DAMAGE_APPLIED arriving 20 ms into a GRIP_STARTED pulse produces TWO calls — 0/0.22 then 0.85/0.55 — because the actuator serialises and re-issuing cancels; the reverse order produces ONE call (the strong one) with the weak cue counted in stats.droppedWeaker, and the weak cue plays again once the strong row's 180 ms have run.
- IT IS NOT A SYSTEM (m35 H7) — also measured for the first time. Printed by the run: 'the burst moved 4 state path(s), all under telemetry.counters'. 160 cues moved exactly the same 4 paths with the layer detached as with it attached, so the state change is M6's run recorder counting the events and the haptic layer contributes nothing. No body added, no scene child added; the per-type gap map is bounded by seats × cue types and empties on reset().
- ROBUSTNESS (m35 H5) — also measured for the first time. A pad object with no vibrationActuator: no throw, zero calls, counted in stats.noPad. An actuator whose playEffect REJECTS ('preempted' is the normal Chrome case when a second effect cancels the first): the call still happened, the layer's own `.catch` RAN (stats.rejected moved after a microtask flush — that handler running is precisely what stops the rejection escaping), nothing was reported to window.unhandledrejection, and the layer served the next cue normally. The suite's top-level unhandledrejection listener remains the end-to-end net: the DOM is not dumped until the virtual-time budget expires, long after the run's last task, so a rejection that did escape would still append a FAIL line and turn the tail into FAILURES.
- NOTHING TO REUSE — this is new to C:\Dev. Grep for `vibrationActuator` across every .js and .html under C:\Dev returns only the three files this milestone wrote. AirportBaggageCrew has ONE case-insensitive hit for 'vibrat' and it is prose: tools/_invariants.js:239, 'a player who vibrates on the spot'. What WAS reused is inside this repo: audio.js's CUES-table discipline (own-property lookup, the `last <= simTimeMs` guard on the gap stamp), audio.js's cueVolume as the silence threshold, M16's driving-seat choice (now a named function both channels call), M16's reducedMotion-unless-explicit rule from save.js, main.js's own seatOfPlayer helper, and m26's Standard Gamepad stub as the fixture.

Deviations from the brief:
- THE ROUTE IS PART OF THE ROW. The brief specified `HAPTICS[cueType] = { strong, weak, ms }` and described the four routings in prose. Prose cannot be walked, so each row carries a fourth field `to` ('holder' | 'player' | 'driver' | 'all') and m35 H1b / m18 A1h assert it is one of those four on every row. Without it the routing would be a switch statement in the layer, which is the shape the CUES table exists to avoid.
- THERE IS NO `maxConcurrent` KNOB (fixer, review violation 5). The brief's scope names 'a per-seat cap on concurrent pulses'; the implementer put `maxConcurrent: 1` in config.js and then hard-coded one slot per seat, so the key was read by nothing and the module comment describing it was false. The cap is real and asserted (m35 H3c/H3d), but it is not tunable and cannot be: the Gamepad API's actuator plays ONE effect and issuing a second cancels the first, so 'how many at once' is a fact about the hardware, not a number. The key was deleted rather than wired up to a value nobody could raise; config.js carries a comment saying so and pointing at pulse(), and m35 H1f now asserts the table carries no inert tuning key.
- AN UNATTRIBUTED CUE BROADCASTS, and that is a deliberate choice the brief did not settle. A 'holder' or 'player' row whose payload names nobody (the commonest case in the game: you drop a box, so nobody is holding it when it lands) falls back to 'all'. In solo — the validated build — 'all' is the one seat, which is the single most important pulse in the game; in co-op it means a knock nobody was holding buzzes both pads. The alternative was to reuse the camera shake's RENDER.camera.shake.impactRange proximity rule, which would have added a second routing rule and a second set of injected positions for one case. One rule, documented in config beside the table, and named in KNOWN_ISSUES.
- MAGNITUDES DO NOT SCALE WITH SEVERITY. The audio layer's cueVolume climbs with relVelocity and with road severity; the pulse does not — the row's numbers are used verbatim, and cueVolume is consulted only as a BOOLEAN (≤ 0 means stay silent, which keeps the §8.4 'a box set down is not a thud' threshold identical for the ear and the hand). This is what makes H2's 'exactly the thud row's numbers' assertable at all. Recorded in KNOWN_ISSUES as the obvious next pass.
- THE SILENCE THRESHOLD IS CHECKED ON EVERY CHANNEL, INCLUDING THE SUSTAIN (fixer, review violation 6). The module header claimed cueVolume was reused verbatim; the overstressed-strap branch returned before the gate, so the §10.3 creak started and repeated without ever consulting it. The gate moved above the STRAP_CHANGED branch. cueVolume returns 1 for STRAP_CHANGED today, so this is the same behaviour and a true statement instead of the same behaviour and a false one — and if a future STRAP_CHANGED ever becomes silent for the ear, it is silent for the hand without anyone having to remember.
- THE TABLE IS DEEP-FROZEN, not shallow. The brief said 'the table is frozen' and the CUES precedent is a single shallow Object.freeze; a shallow freeze leaves every row writable, which is a bare literal one indirection out. Every row and the strap row are frozen individually and m35 H1d1/H1d2 assert that neither replacing a row nor writing one of its numbers lands.
- H2's 'exactly one playEffect with the thud row's numbers' is asserted TWICE, not once: H2c drives it through the bus (m24's own fixture pattern, deterministic) and H2k drives it through physics — a real 0.65 m fall of the real 9 kg box, the damage system's own IMPACT, the real holdersOf lookup on entity.state.grips.
- THE SUITE'S SYNTHETIC CUES ARE STAMPED AHEAD OF THE SIM CLOCK. The house is still settling for the first seconds of a run and emits real IMPACTs of its own; one of those inside the last 120 ms gaps a synthetic thud and the case fails for the world's reasons. `at()` hands out a stamp at least 5 s past both the sim clock and the last stamp. The two cases that must run on the real clock (the physical drop, the strap sustain) call the layer's own reset() first and, for the sustain, filter the call log to pulses carrying the strap row's magnitudes.
- H5's 'no unhandled rejection' is asserted through the MECHANISM, not through a macrotask (fixer, review violation 1). The strongest observable claim inside a single task is that the layer's own `.catch` ran — its counter moves after a microtask flush — and that is exactly what stops a rejection escaping. The listener installed at the top of the file remains the end-to-end net for anything that does escape, because the DOM is dumped long after the run's last task. Waiting on a real macrotask is not available under this harness and cost the previous version 35 of its assertions.
- H7 asserts the §22.4 claim in its STRONG form rather than 'game.state is unchanged'. It cannot be unchanged: M6's run recorder counts every event into state.telemetry.counters, which is its job. The assertion is m18 A12's shape instead — the same burst moves the same state paths with the layer attached and with it detached — plus 'every path either of them moved is under telemetry.counters'.

## Phase 27 — Phase 11 build side, batch 12: the strap that launched a light box, and a second consistency pass — 2026-09-05

Phase 11's build side (GDD §25.2: onboarding, settings, instrumentation, fixes), from the ordered plan in docs/PHASE11_PLAN.md. Each milestone was built by a file-owned implementer and adversarially reviewed against its brief; the numbers below are the ones the reviews reproduced.

**3612 assertions across 34 suites, all passing.**

### M25

### M25 — a strap that holds a light thing (§10.3, §26.3, §7.3, §12.2)

**The strap's damping is now integrated semi-implicitly, and the launch is gone.** §26.3 promises that "a tensioned strap reduces relative motion and damage". M17 measured that promise kept for the 110 kg fridge and broken for a 9 kg box: strapped taut and given a hard brake, the box was thrown 1.45 m backward and 0.81 m down — *toward its anchor*, which was the tell. The cause was numerical, not tuning. A damper sampled at the start of the step is stable only while c·dt/m < 2; above 2 the correction overshoots and reverses the velocity with interest, and a one-sided rope (a rope does not push) never pays the overshoot back.

**The mass in that bound is not the body's mass, and that is why the earlier estimate was wrong.** A strap pulls at a hook, so what it accelerates along its own line is the effective mass at that point, 1/m_eff = 1/m + (r × dir)ᵀ I⁻¹ (r × dir), which is always ≤ m. Measured (m32 S4, one strap under a 400 N pre-load): a 9 kg box hooked 0.33 m off centre is **2.54 kg** effective and its ratio was **9.19**, not the 2.6 the body mass suggested. The 22 kg television was **2.46** and the 55 kg dresser **2.20** — three of four masses over the bound, not one. Only the 110 kg fridge (m_eff 29.01 kg, ratio **0.80**) was ever safe, which is exactly why §26.3's promise held for the heavy case and lied about the light one.

**`src/cargo/straps.js` now solves the closing velocity after the damping impulse instead of predicting it:** v′ = v/(1 + β) with β = c·dt/m_eff, so c_eff = c/(1 + β) and the amplification factor |g| = 1/(1 + β) ≤ 1 for **every** mass, damping and step. The damper can at most bring the closing velocity to rest and can never reverse it, and its work, −c_eff·v²·dt·(1 − γ/2) with γ = β/(1+β) < 1, is negative for every input. The implicit form was chosen over a per-body clamp by measurement: it keeps the fridge inside 5 % (0.49 mm on a 9.0 mm brake shift, **0.36 %** of M17's published 0.135 m), it is one expression rather than a different damper at every mass, and it has no discontinuity where a clamp would bind. **`STRAP.damping` 1400, `STRAP.stiffness` 40 000, the 1200 N rating, the 1900 N tear and §10.3's four states are untouched** — no tuning was moved to get here. One caveat now recorded in config: 1400 is the coefficient the solve *starts from*, and the applied one is c/(1 + β) — 776 N·s/m on the fridge, 137 N·s/m on a 9 kg box — so the impulse over a step, not the coefficient, is the quantity to reason about if it is ever retuned.

**Two derived numbers joined config.** `STRAP.stabilityFraction` 0.5 states the rule as "a strap may spend at most half of explicit Euler's budget of 2"; the solved form satisfies it by construction (γ < 1), so the `Math.min` that enforces it has never bound and is there to stop a future change re-admitting the overshoot silently. `CARGO.launchSpeedM` 3.0 m/s is bracketed below by the 2.6 m/s a brake reaches in the half second a strap has to react and by `box_small_01`'s 2.00 m/s §8.3 tolerance, and above by the 5.72 m/s of the full 1.1 s event. It is a **linear** speed — a body's spin is rad/s and is never compared with it — and an asserted **test bound**, never a clamp: §10.4 forbids the cargo system from moving anything without a physical cause, and that includes braking it.

**`tools/m32-strap-stability-tests.js` (new, ALL-PASS 45) proves the fix rather than the absence of the bug.** Every scenario runs twice: as shipped, and with `STRAP_DEBUG.explicitDamping` restoring the pre-M25 force. S1 drives a 9 kg box with one taut strap through the whole §13.3 route — M25 holds it to **0.025 m**, peaking at **0.518 m/s** (and 1.42 rad/s of spin), with the strap never tearing and the box still in the box at the arrival, while the pre-M25 form doubles its speed, moves it 8× as far, pulls 2.8× the tension and injects **+34.3 J in a single step**. On M17's own pose — a perch free to creep — the pre-M25 form **launches it 1.077 m at 4.27 m/s, past `CARGO.launchSpeedM`, spinning 4.8 rad/s and ending 180° over**, where M25 holds the same box on the same perch to 0.140 m at 0.527 m/s, less than the 0.237 m the dresser under it crept. S2 measures the damping impulse's work per step on 9, 22 and 110 kg: non-positive every step (worst −2.71e-17, −5.10e-16, −5.56e-14 J) and strictly dissipative summed (−6.76, −3.65e-3, −0.187 J), where the pre-M25 form injects +34.3 J worst / +48.1 J summed into the 9 kg box and +1.23e-3 J into the television but *removes* energy from the fridge. The sign of that number flips at exactly γ = 2, so the test *is* the stability bound. S3 shows the heavy case is not softened; S4 prints the table for 9, 22, 55 and 110 kg and asserts |g| ≤ 1 for each.

**Every number a strap touches was re-measured, and two of them moved.** m25's LOW pack no longer wedges its light items behind 20 mm of slack — that slack was a workaround written around this bug, and it made §26.3's promise untestable on exactly the items where it was false. All twelve straps are now **taut at 0 slack** and the pack still holds: **0.029 m** over the route (0.030 m with the slack in), quality 1.000, no damage, and the fastest any strapped item moves over the whole leg is **0.217 m/s** against the 3.0 m/s bound, with 0.564 rad/s of spin as its own separate number (m25 K10). m7 and m8's figures did *not* move: unstrapped **1.645 m** / strapped **0.1409 m**, and GOOD **0.470 m** — both fixtures hook near each item's centre of mass, so their straps were never in the unstable band, and both are now pinned (m7 D10/D11, m8 C9) so the next change to the strap force cannot move them silently either.

Measured:
- THE TABLE (m32 S4, 10 mm pre-load = 400 N on each strap). mass / m_eff at the hook / c_eff / gamma = c_eff.dt/m_eff / |g| = 1/(1+beta) / gamma if the damping were explicit:  9 kg / 2.54 / 137 / 0.9019 / 0.0981 / 9.19  |  22 kg / 9.49 / 405 / 0.7108 / 0.2892 / 2.46  |  55 kg / 10.61 / 438 / 0.6874 / 0.3126 / 2.20  |  110 kg / 29.01 / 776 / 0.4458 / 0.5542 / 0.80. Three of the four masses were past the explicit bound of 2, not one. THESE ARE THE ONLY m_eff/gamma FIGURES ANY FILE NOW QUOTES for a mass — config.js, straps.js, m25 and m32 previously carried three different values (1.9 / 2.00 / 2.54 kg and 4.8x / 11.7 / 9.19) for the same claimed measurement; they all read S4's table now, and each file says that m_eff moves with the hook.
- The effective mass, not the body mass, is what the bound is taken against: 2.54 kg of a 9 kg box (hooked 0.33 m off centre), 9.49 of 22, 10.61 of 55, 29.01 of 110. Body mass understates the box's ratio by 3.5x, and a fix derived from it would still have launched the box.
- Effective step dt the strap sees: SIM.stepMs/1000 = 0.016667 s. physics/world.js sets `this.world.timestep = SIM.stepMs / 1000` from the same constant and main.js hands straps.step() the clock's fixed step, so this is the game step, not a Rapier substep (m32 C1 asserts dt == 1/60 within 1e-6).
- m32 S1, jammed perch (9 kg box, one taut strap, full 28 s route, 1681 frames). M25: peak 0.518 m/s LINEAR and 1.42 rad/s of spin, displacement 0.025 m, peak tension 360 N, damper work -2.71e-17 J worst step and -6.76 J summed over 1306 loaded steps, states {slack,tensioned}, inside the box at the arrival, tilt 4.7 deg. Pre-M25 explicit: 1.170 m/s and 3.05 rad/s, displacement 0.192 m, tension 1003 N, +34.3 J in the worst single step and +48.1 J summed over 311 loaded steps, tilt 27.0 deg. On THIS perch the pre-M25 form does not reach CARGO.launchSpeedM — the box is jammed and the injected energy comes out as thrashing.
- m32 S1, M17's free perch (the same box and strap, full route). Pre-M25 explicit LAUNCHES it: 1.077 m at 4.269 m/s linear (>= CARGO.launchSpeedM 3.0) and 4.84 rad/s, ending 180 deg over, peak tension 816 N, +12.4 J worst step and +34.9 J summed. M25 holds it to 0.140 m at 0.527 m/s — less than the 0.237 m the unjammed dresser under it crept — and its damper removes 8.75 J.
- m32 S2 damping-impulse work per physics step, worst over the drive: 9 kg box -2.71e-17 J (sum -6.76 J / 1306 steps), 22 kg television -5.10e-16 J (sum -3.65e-3 J / 168), 110 kg fridge -5.56e-14 J (sum -0.187 J / 199). Counterfactual: +34.3 J worst / +48.1 J summed on the box (gamma 8.70), +1.23e-3 / +1.78e-3 J on the television (gamma 2.46), and -7.52e-14 / -0.185 J on the fridge (gamma 0.82). The sign flips at exactly gamma = 2, the explicit-Euler bound.
- m32 S3 fridge parity (SLIDE pose + m25 K7's two crossed straps, one 13.3 hard brake): M25 0.0090 m / tilt 0.08 deg / peak 0.062 m/s linear; pre-M25 explicit 0.0086 m / 0.04 deg / 0.058 m/s. 0.49 mm apart = 0.36 % of M17's published 0.135 m (5.76 % of this run's own 9 mm). THE COEFFICIENT IS NOT UNCHANGED and the behaviour is: c_eff/c = 0.548, i.e. 768 N.s/m of the declared 1400 at m_eff 28.3 kg.
- m7 D (one hard brake, six items): unstrapped worst shift 1.645 m (1 item moved), strapped 0.1409 m (0 moved). BOTH unchanged by M25 — this fixture's hooks sit near each centre of mass and its straps were never in the unstable band.
- m8 C (the whole route): GOOD pack 0.4695 m this run (0.4700 in the implementer's — a 0.5 mm run-to-run spread, which is why C9's pin is +/-5 mm), 0 damage lines, $0.00, condition 100 — unchanged. BAD pack 2.6400 m, 0 damage lines, $0.00, condition 100 — was 2.611 m; the 0.029 m is M26's speed bump, not M25 (BAD carries no straps).
- m25 (the whole route, four packs): LOW 0.029 m with all twelve straps TAUT (was 0.030 m with 20 mm of slack on the four light items), quality 1.000, fridge tilt 0.1 deg max, 0/6 past tolerance, no property line and no item damage. TALL 0.577 m. SLIDE 1.527 m. SLIDE + two straps: the STRAPPED fridge moves 0.0090 m at tilt 0.8 deg, quality 0.664; the pack's worst 0.374 m is a LOOSE box under M26's bump.
- m25 K10 launch bound over the whole route, LINEAR and ANGULAR reported separately for the first time: LOW's worst strapped-item linear peak is 0.217 m/s (tv_55_01#2) and its worst spin 0.564 rad/s (box_small_01#11) — the '0.564 m/s' in the implementer's report and docs was that SPIN, mislabelled. SLIDE+2 straps: 0.167 m/s linear and 0.157 rad/s (both the fridge). CARGO.launchSpeedM is 3.0 m/s.
- Poses that do NOT reproduce the launch, kept in m32's SCENE_BOX comment with each pose's own gamma: a 9 kg box strapped to the anchor beside it moves 0.002 m with the pre-M25 damping even at that pose's gamma 9.19 and +9.8e-2 J per step, because deck friction holds it against the 0.53 g brake; a 9 kg box on a jammed dresser top strapped to the anchor below it moves 0.058 m at gamma 11.71 with +0.713 J worst step and +44.1 J summed, because every anchor sits at deck height so that strap pulls 63 % DOWNWARD and the perch's contact eats the overshoot in the same solver step.
- m32 frame budget: 8277 game.frame() calls (four full 1681-frame legs plus four brake windows plus fixtures), under the suite's own 8600 cap.

Deviations from the brief:
- S2's literal formulation ('KE(after strap forces) <= KE(before) + |road work| + 1e-3 J') is not assertable and was replaced, and the fix pass DELETED the abandoned kineticEnergy() helper that measured it (with a comment in its place recording why). Two reasons, both measured. (a) It cannot hold in principle: the STIFFNESS term is a stretched rope pulling a load back, which legitimately does positive work. (b) The per-step residual is solver noise: KE - KE_before - roadWork - gravityWork - springWork peaks at 1.36e-3 J on the 9 kg box, 2.65e-3 J on the television and 8.92e-2 J on the fridge, and is IDENTICAL to three significant figures with the damping fixed and with the pre-M25 form restored — it is Rapier's contact correction. m32 S2 asserts the quantity that does discriminate: the damping impulse's OWN work, dKE_damp = J_d.v + J_d^2/(2.m_eff) = -c_eff.v^2.dt.(1 - gamma/2), whose sign flips at exactly gamma = 2. NOTE FOR THE REVIEWER'S CONTRACT GAP: the three 'fixed' rows of S2 are true by construction (gamma < 1 by algebra), so the informative half of S2 is the counterfactual — +34.3 J in one step on the box, +1.23e-3 J on the television, and NEGATIVE on the fridge. No KE-of-the-body assertion exists anywhere in the repo.
- S1's 'the same scenario reproduces the launch (> 1.0 m)' is met on M17's own pose, not on the primary jammed-perch scene, and the fix pass made the suite say so instead of blurring it. On the jammed perch the pre-M25 form measurably misbehaves (2.3x the linear speed, 2.1x the spin, 8x the displacement, +34.3 J injected in one step) but does not reach CARGO.launchSpeedM; the > 1.0 m / >= 3 m/s launch is asserted on the free perch (1.077 m at 4.269 m/s). Claiming the bound was breached on the jammed perch, as the implementer's assertion text did, meant comparing 3.05 rad/s with a 3 m/s bound.
- S3's '< 5 %' is asserted as 5 % OF M17's published 0.135 m route figure (6.8 mm), not 5 % of this run's own 9 mm brake-window number, whose 5 % band (0.45 mm) is below step-to-step solver noise. Measured 0.49 mm apart, 0.36 % of 0.135 m. Parity is taken in-suite against the pre-M25 form via STRAP_DEBUG rather than against a number recorded elsewhere. The fix pass also stopped S3 claiming the coefficient was untouched: c_eff/c is 0.548 (768 N.s/m of the declared 1400) and it is the BEHAVIOUR that is unchanged.
- m7's strapped figure did NOT fall, contrary to the brief's 'expected lower'. Re-measured 0.1409 m against the recorded pre-M25 0.141 m, and unstrapped 1.645 m unchanged. m7's buildPack/strapPack hook each item at 0.35 of its height and 0.3 of its smaller footprint — close enough to each centre of mass that m_eff at the hook stays high — and its lightest item is a 9 kg box packed flat against nothing it can slide into. D11 pins it at 0.141 +/- 0.005 rather than lowering it. (The fix pass removed the comment's contradictory clause 'and it did, downward'.)
- m8's GOOD did not fall either (0.470 m, pinned by C9) and m8's BAD moved 2.611 -> 2.640 m, which is M26's, not M25's: M26 landed TRUCK.roadEvents.speedBump.accel { y: 0.55 -> 2.20, z: 0 -> 0.50 } while this milestone was running, and BAD carries no straps at all. The same applies in m25: SLIDE 1.520 -> 1.527 m, and SLIDE+two straps' PACK worst 0.135 -> 0.374 m because the three loose boxes now move under the bump. m25 K10 therefore asserts the STRAPPED fridge's own 0.0090 m (twice: under M17's 0.135 m pack figure, and pinned < 0.030 m) instead of the pack worst.
- `export const STRAP_DEBUG = { explicitDamping: false }` in src/cargo/straps.js is the DEBUG flag the brief permits for S1's counterfactual. Nothing in src/ reads or writes it; m32 asserts it boots false and is left false, and the suite's catch block resets it. It is the single line by which a future edit could re-admit the launch bug in the real game (the reviewer's riskiestLine) — and it is also the reason every claim in m32 has a counterfactual instead of being an absence-of-bug assertion. Kept deliberately.
- src/cargo/straps.js worldToLocal was refactored to call a new conjRotate() helper; the maths is byte-for-byte the expansion it already contained, and effectiveMassAt needs the same conjugate rotation without the translation. straps.js also records four serializable diagnostics per strap (effMass, dampingN, closing, dampingRatio) so m32 can measure the damping work per body; snapshot() is deliberately UNCHANGED, so nothing that serialises strap state (m7 F2, the save, the soak) sees a new field.

### M26

### M26 — Consistency pass two: the carry counts, the notices run on one clock, the bump is an exam, and the property line says who — 2026-09-05

GDD §15.3 (attribution — 'who was holding it'; the 'heaviest thing moved' stat), §8.4 (one small cost notice), §26.3 ('three different pack arrangements yield observably different turn, brake, and bump results'), §11.3 (the three road events), §21.1 (the sheet stays compact), §22.4 (plain serializable state), §27.4 (human-readable local logs), §25.3 (known limitations closed before external testers read numbers off the screen).

**Hypothesis.** Four things the codebase said and did not do, each found by a milestone that could not fix it because the file belonged to someone else. The settlement's 'heaviest thing moved' counted only what was LOADED or RECOVERED, so a couch carried across the house and set down again did not count. §8.4's notices expired against `performance.now()` while §21.4's captions already ran on the sim clock — two clocks for two lines of the same HUD. The speed bump moved nothing at all, so §26.3's third result was a null. And `heldBy` had been written on every property line since M14 and read by nobody.

**What changed.**

1. **everHeld is written on the GRAB** (`grip.js`), not on the frames that follow. M6 had already set it in `registry.step` for anything still held when a step ran; what that could not see was a grab and a release inside one frame. `heaviestMoved()` now counts a carry. It is initialised to `false` at spawn, so the flag is a boolean from boot rather than a key that appears the first time somebody picks something up (§22.4).
2. **Notices run on the sim clock**, the one M9's captions already used. `NOTICE.ttlMs` (3200) and `NOTICE.maxStack` (4) moved out of `hud.js`, where the TTL was a literal, into config; the HUD is handed `() => game.clock.simTimeMs` at construction the way every other system is. Two consequences, both deliberate: a notice **freezes under the pause card** with the rest of the simulation, and a headless suite — where the wall clock does not advance — sees notices expire on schedule instead of piling up for the whole run. A contract reset now clears the stack and the queue, because `game.reset()` restarts the sim clock at zero and a notice stamped late in the last run could never age out against the new one.
3. **The speed bump unloads the deck.** It was `{ y 0.55, z 0 }` — 2.29 m/s² of lift against 9.81 of gravity, which leaves 77% of the load pressing the deck and slides nothing: `shiftByEvent.speedBump` read 0.000 m for every pack. KNOWN_ISSUES called that 'one number away'. It is not: the response is a STEP, not a ramp, and nothing moves until the longitudinal fraction beats static friction. Measured on the SLIDE pack with the lift left alone and only the nudge swept — z 0.30 → 0.000 m, 0.50 → 0.000, 0.70 → 0.000, 0.90 → 0.008, 0.95 → 0.011, 1.00 → 0.038, 1.05 → 0.066, 1.10 → 0.097, 1.35 → 0.280 — so half a brake does nothing and the 0.25 m of `CARGO.shiftToleranceM` costs 1.35, which is harder than the brake. The number that was wrong was the LIFT. It is `{ y 2.20, z 0.50 }` now: 9.15 m/s² up leaves 0.66 m/s² net down, so for half a second the load presses at 6.7% of its weight, a 9 kg box's friction falls from 5.10 to 0.34 m/s², and exactly half the brake's longitudinal fraction walks it. Below 2.358 nothing leaves the deck; 2.20 keeps a 6.7% margin and every measured window has Δy = 0.00. Severity is untouched, so **the audio is unchanged**.
   **And the driver's camera is unchanged too — but that took a second number.** The seat shake normalises whatever direction it is handed, so the cargo's new forward fraction would have re-aimed the bump's seat nudge 12.8° forward (y 48.00 → 46.81 mm, z 0 → 10.64 mm) and broken the assertion that has said 'a bump lifts the seat' since M16. The seat is not the cargo: `accel` is what the LOAD feels in the truck's frame, and `TRUCK.roadEvents.speedBump.seatAccel` is where the CAB goes, which over a bump is straight up. The brake and the turn carry no `seatAccel` and still take the cargo's direction, exactly as every event did before.
4. **The property line names the holder.** `heldBy` is M14's shape and M23 kept it — one entry per HAND, so a two-hand carry reads `['p0','p0']` — and the sheet dedupes it to a seat word. In co-op the line reads *'1 impact on 1 surface — P1 carrying the box small'*; solo prints nothing extra (§21.1), because with one seat 'P1' carries no information. The clause aggregates like the row it sits on, so it names at most `INVOICE.holderMax` (2) distinct holder-and-object pairs and then says 'and N more' — config, for the same reason `recapPerKind` is. The settlement's 'What happened' recap fills its seat column for a held impact too, which M24 had recorded as blank. The amounts are byte-identical either way: the holder is a label, never a factor (M14/M23 pricing untouched).

**Measured.**

- **The bump column**, worst shift inside the bump window over m25's four drives: LOW **0.006 m** · TALL **0.243 m** · SLIDE **0.282 m** · SLIDE+2 straps **0.282 m**. Every one of them was 0.000 before. The strapped pack is 47× stiller than the loose ones; the loose ones pass `CARGO.shiftToleranceM`; SLIDE's displacement is (−0.001, 0.000, 0.282), pure forward; TALL's fridge gains **0.0°** of tilt on the bump (it is already at 26.6° from the turn). The whole-route worsts are the ones the packs already had: LOW 0.029 m, TALL 0.577 m, SLIDE 1.527 m.
- **Not a second brake**, by both readings that decide it. Peak longitudinal 0.50 × 0.8 = 0.40 of the brake's, exactly half its `accel.z`. Longitudinal impulse 0.8 × 0.50 × 0.5 s = **0.20** against the brake's 1.0 × 1.0 × 1.1 s = 1.10 — **18%**. And the outcomes are two different events: SLIDE's brake throws the fridge 1.5 m into the headboard and holes it (400.00); SLIDE's bump walks a box 282 mm.
- **What the bump now costs a bad pack**, pinned rather than left to be discovered: TALL posts one property line it did not before — *truck headboard scuffed (fridge_01) 6.05* — and one item line, tv_55_01 100 → 92. LOW and SLIDE+2 straps still post nothing at all.
- **A carry counts.** The dresser (55 kg) grabbed, walked 2.00 m in two hands and set down again: `heaviestMoved()` 55 with nothing loaded and nothing recovered, and the sheet's stat row reads 'heaviest thing moved 55 kg'. A grab that finds nothing leaves it false; a replay returns all 27 entities to false and the stat to 0.
- **The holder, on the heaviest thing a mover can carry.** 55 kg in both hands, walked into a wall at 0.97 m/s — which is what a mover can actually walk at with a dresser (§6.3 'one player awkward') — posts *front wall dented 66.19* with `heldBy ['p0','p0']`, and the sheet says *P1 carrying the dresser*.
- **One clock.** A notice raised at t is still up after 191 frames (3183 ms of sim) and gone after 200 (3333 ms), while the wall clock moved 0 ms under `--virtual-time-budget`. Paused, 24 frames (400 ms) and then 300 more (5 s) advance the sim clock by exactly zero and the notice stays; unpaused, it expires on schedule.
- **The soak's ramp is gone.** `hud._notices` at boot / mid-run / after-run across three runs: **0 ; 0,1,1 ; 1,1,1** — it was 0 ; 0,1,2 ; 1,2,3 — and the count now reaches **zero**: 194 aged frames (3.23 s of sim against a 3200 ms TTL) after the last replay and the stack is empty. Every other soak counter is unchanged run to run.

**Checked.** m0 132 · m8 51 · m11 185 · m12 127 · m14 43 · m17 117 · m21 157 · m22 95 · m25 100 · **m33 80 (new)** — all ALL-PASS, plus m24 112 (the camera shake, which the bump reaches through), m31 141, m27 128, m29 180 and m7 56.

Measured:
- THE m24 REGRESSION, reproduced and closed. Before the fix: `FAIL K2g speedBump - a vertical component only, upward <- {"x":0,"y":0.04680637707799029,"z":0.010637812972269955}`, FAILURES 1 of 112 — the shake normalises whatever vector it is handed, so the cargo's new forward fraction tilted the driver's seat nudge 12.8° forward (y 48.00 -> 46.81 mm, z 0 -> 10.64 mm). After: ALL-PASS 112, with K2g's |x| and |z| back under 1e-9 and K2h's magnitude EXACT rather than within 5% (the seat direction is a unit vector, so offB.y === severity x shake.road identically).
- THE LIFT, ratified and pinned: 2.20 x 0.8 x 5.2 = 9.15 m/s² = 93.3% of g, 1.76x the brake's 5.20 m/s² peak, lift-off at accel.y 2.358, margin 6.7%. Printed by m33 C3 and asserted by C3k/C3l/C3m.
- THE BUMP COLUMN, unchanged by the fixes and re-measured on the final build: LOW 0.006 m (tv_55_01) · TALL 0.243 m (dresser_01) · SLIDE 0.282 m (box_small_01) · SLIDE+2 straps 0.282 m. SLIDE's displacement (−0.001, 0.000, 0.282) — pure +z. TALL's fridge is at 26.6° from the TURN and the bump adds 0.0°. Whole-route worsts unchanged: LOW 0.029, TALL 0.577, SLIDE 1.527.
- TALL's NEW DRIVE-TIME BILL, previously unverified in docs and now printed and pinned by m25 K9j: 1 property line, 'truck headboard scuffed (fridge_01) 6.05', and one item line, tv_55_01 100 -> 92. Against SLIDE's 400.00 from the brake. LOW still posts nothing (K2).
- THE BRIEF'S C4 FIXTURE, made to work: a 55 kg dresser in both hands WALKED into the front wall posts 'front wall dented 66.19' with heldBy ['p0','p0'] and a sheet clause of 'P1 carrying the dresser'. Carried 0.20 m at up to 0.97 m/s — that is what a mover can actually walk at with 55 kg in two hands (§6.3 'one player awkward'), not the brief's 2 m/s.
- AND WHY THE THROWN VERSION IS IMPOSSIBLE, measured before the walked one replaced it: setting 2 m/s on a 55 kg dresser with two hands on it posts NO property line at all (0 lines, both hands still attached). The grip springs turn a 55 kg body around inside about 0.35 m (v/sqrt(k/m)) and it never reaches the wall. The 9 kg box at 4 m/s works because it is light and fast enough to arrive first.
- NOTICES REACH ZERO, and the reason the first attempt did not: ageing happens in the render loop's drain (main.js:2013 `huds[s].tickNotices()`), which never runs headless. Frames alone left the count at 1 -> 1; frames PLUS the suite's own drainNotices() (m14's stand-in for the render loop, the same thing m33 C2 does) empties it in 194 frames / 3.23 s of sim against NOTICE.ttlMs 3200. Soak counts unchanged: boot 0; mid-run 0,1,1; after-run 1,1,1 (was 0; 0,1,2; 1,2,3).
- THE HOLDER CLAUSE's cap is now config: INVOICE.holderMax 2, and three distinct pairs render 'P1 carrying the dresser, P2 carrying the couch 3seat and 1 more'. The shipped one-holder text is byte-identical to before: co-op 'property damage 1 impact on 1 surface — P1 carrying the box small −6.90', solo '1 impact on 1 surface', same amount both ways.
- everHeld unchanged and re-measured: the dresser grabbed, carried 2.00 m in two hands and set down -> heaviestMoved() 55 with nothing loaded or recovered; the sheet prints 'heaviest thing moved 55 kg'; a failed grab writes nothing; a replay returns all 27 entities (the four door leaves included) to false and the stat to 0.

Deviations from the brief:
- THE LIFT IS RATIFIED, NOT REVERTED (review major #3). The reviewer offered two exits — ratify y 2.20 and fix m24, or revert to 0.55 and leave KNOWN_ISSUES Phase 23 open. I took the first, because the measured sweep in config.js makes the second a dead end: every accel.z that moves anything on its own is >= 0.94, i.e. harder than the brake and 2.7x the bump's own lift, which the brief's own risk note forbids ('must not turn the bump into a second brake — cap the measured z at half the brake's'). Unloading the deck IS what a speed bump does, and it is the only mechanism inside the cap. What the review was right about is that nothing pinned it: m33 C3k now pins accel.y at exactly 2.20, C3l pins the 6.7% margin below lift-off (bounded 5-15%), and C3m records that this is the largest single acceleration any road event applies (1.76x the brake's peak, bounded under 2x). If the product wants the lift gentler, C3k is the one line that has to be argued with, and the bump goes back to being a null.
- NEW CONFIG SURFACE THE BRIEF DID NOT LIST: `TRUCK.roadEvents.<event>.seatAccel`, optional and carried only by speedBump. This is the fix for review majors #1 and #2. The camera shake takes the DIRECTION it is handed and normalises it (main.js ROAD_FORCE), so the cargo's new forward fraction silently re-aimed the driver's seat nudge 12.8° forward and broke m24 K2g — a suite outside my filesTouched, so it could not be restated, and an assertion that has pinned 'a bump lifts the seat' since M16. The seat is not the cargo: `accel` is what the LOAD feels in the truck's frame, `seatAccel` is where the CAB goes, and a cab going over a bump goes up. hardBrake and sharpTurn carry no seatAccel and fall through to the cargo's direction exactly as before, so the only behaviour that changed is the one that was about to change by accident.
- THE CHANGELOG SENTENCE THE REVIEW CALLED FALSE IS NOW TRUE, and rewritten anyway. 'Severity is untouched, so the camera shake and the audio are unchanged' was false when only the magnitude was unchanged; with seatAccel the shake is unchanged in magnitude AND direction (m24 K2g/K2h), but docsNotes now says so explicitly and names the seam rather than leaving it as an implication.
- m33 C4l IS THE BRIEF'S FIXTURE, ARRIVED AT DIFFERENTLY. The brief asked for 'seat 0 carries the dresser into the living-kitchen jamb at 2 m/s'. Two parts of that cannot be had: (a) a jamb is not a property surface — surfaces.js tags the DOOR FRAME class and damage.js only marks it when a leaf is FORCED (M23), so no carried object can post a jamb line, and the front wall is the nearest true surface; (b) 2 m/s is not a carry speed for 55 kg — a mover walks it in at 0.97 m/s, measured. What IS the brief's is now exercised: the dresser, 55 kg, both hands, walked (not thrown) into a surface, posting 'front wall dented 66.19' with heldBy ['p0','p0']. The 9 kg box at 4 m/s case is kept beside it because it is the cheap regression.
- m14's ZERO IS ASSERTED AT AN AGEING POINT, not at the sample points (review minor #6). The brief asked the soak to read === 0 at its samples; it cannot, and claiming it would be false — the last thing a replay does is raise 'new contract' and F.after is taken nought sim-milliseconds later. The constancy assertions stay (mid 0,1,1; after 1,1,1; max <= 1), and the literal zero is asserted immediately after them, where zero is the truth: give the sim clock the TTL with no replay in between and the stack empties itself. Nothing after that line samples live notice state.
- m25 K9f STILL READS THE TILT AS A GAIN (review minor #7). The brief's literal 'TALL's fridge tilt on the bump < 5°' has never been true: the absolute is 26.6°, ALL of it left over from the sharp turn nine seconds earlier, and pre-M26 K4 already reads it the same relative way. Asserting the absolute would fail on a number M26 did not cause. The assertion text now names both numbers so the reading cannot be mistaken for the other one.
- everHeld's DEFAULT IS STILL WRITTEN AT THE TWO SPAWN SITES in main.js (232, 264) rather than in registry.spawn's state literal, because registry.js is outside filesTouched. Unchanged from the implementer's report; still needs the follow-up.
- tools/m22-property-tests.js REMAINS UNCHANGED though it is in filesTouched — PD2j already pins the heldBy [] shape and the held-holder assertions live in m33. Run as a regression twice (ALL-PASS 95).

## Phase 26 — Phase 11 build side, batch 11: the door's brute-force branch, and §21.2's brief and reveal — 2026-09-05

Phase 11's build side (GDD §25.2: onboarding, settings, instrumentation, fixes), from the ordered plan in docs/PHASE11_PLAN.md. Each milestone was built by a file-owned implementer and adversarially reviewed against its brief; the numbers below are the ones the reviews reproduced.

**3451 assertions across 32 suites, all passing.**

### M23

### M23 — Forcing a hung door — the §3.3 brute-force branch, priced on the frame as property damage — 2026-09-05

GDD §3.3 ('a lower-risk prepared method and a faster or funnier brute-force method … brute force must remain possible enough to tempt players'), §8.2 (remove from hinges — the prepared method, M11; replacement risk), §8.3 (static surfaces define material, durability, impact threshold, repair category and maximum charge), §8.4 (one visual mark, one small cost notice), §15.1/§15.3 (property damage attributed to a surface; who held it, recorded never scored), §23.3 (DOOR_STATE), §10.4 (no damage without a physical cause).

**Hypothesis.** M11 built the prepared method (E, 45 s, the 0.86 m opening back) and M14 the ledger line that prices walls; between them the branch the GDD names first was missing — shove the couch through the hung door anyway. A hung leaf is a Fixed body, so the thing that shoves it loses no speed while it presses and M14's m·Δv reads nothing: the FRAME has to be priced from the leaf's side. Enough shoving tears the hinges out — the doorway opens in seconds, through the removed door's own path — and the frame posts a fixed §15.1 charge worth more than the screwdriver's minute.

**What changed.** `surfaces.js` gains the `door_frame` surface kind (`door_frame_<doorId>`, billable, labelled 'kitchen door' / 'bedroom door' / 'front door' / 'side door'), and `surfaceRow()` — M14's §8.3 seam — returns for it the one row with FIXED charges `{ bent, forced }` from `DAMAGE.property.doorFrame`. `damage.js` reads each hung leaf's side of the narrow phase every step (`_strainFrames`): the strain a frame takes is the leaf's Σ|contactImpulse| as the floor, the HANDS' force × dt for a held object pressed against it (`damage.gripForceOf`, main.js, because the floor's static friction takes a solver-ordered share of a blocked push), and M14's own m·Δv for a hit the leaf took hardest — counted only on steps at or above `forceN` (250 N) by an object that is held or hitting (a lean, or the solver's resting phantom, reads nothing). The strain lives in M14's aggregation window keyed `entity|door_frame_<id>` and posts through the same `_postPropLine` every wall uses: at `DOOR.bentImpulseNs` (8 N·s) the window's close bills `chargeBent` (40.00) once per hung spell (`state.frameBent`) with a scuff on the leaf; at `DOOR.forceImpulseNs` (400 N·s) the hinges go — `registry.unhang` to the rest pose (M11's path, so hungClear, recovery and reset see a removed leaf), `chargeForced` (140.00) with the mark on the hinge jamb (`house.js leafHingeMark`), `DOOR_STATE { state: 'forced', doorId, entityId, by, objectId, impulse }`, the notice 'kitchen door forced off its hinges — 140.00' and the caption 'door forced'. `door_leaf_01` moves to the `sturdy` band (3.6 m/s, 12/m·s⁻¹; `floorAfter15m` 70): a 1.5 m drop marks a door, it does not total it, and leaf damage stays on the furniture line. Q at a leaf refuses 'doorway blocked — clear it to hang the door' when a body or a mover overlaps the hung pose (`interact._doorwayBlocked`, a shape query shrunk by `DOOR.occupancyMargin`), and does nothing. Every hung leaf announces `DOOR_STATE 'hung'` (reason 'boot', silent) on the first step of every run so the record starts explicit; the audio layer drops silent events. Audio: `bent` / `forced` variants on DAMAGE_APPLIED, `forced` / `hung` on DOOR_STATE. Config: `DOOR.forceImpulseNs 400, bentImpulseNs 8, forceWithinMs 4000, occupancyMargin 0.01`; `DAMAGE.property.doorFrame { forceN 250, chargeForced 140, chargeBent 40, pressSpeedMax 0.05 }`; decal sizes for both states.

**Measured (m30, the trace is printed by the suite).** Couch, legs on, seat 0 both hands unbraced from 0.15 m: first touch at 0.55 s (42.3 N·s, 2539 N), then 712 N of hands on the pressed couch = 11.9 N·s a step, strain 400.4 at 1.00 s — forced after 0.45 s of pressing, a quarter of the 4 s budget. The couch's m·Δv after the first touch: 5.83 N·s in total (0.00 on every pressing step); the leaf's own manifold: 188 N·s at 170-243 N against 712 N applied. A 9 kg box at 2 m/s from 0.16 m: 10.76 N·s in one step (646 N) — bent, 40.00, one scuff; a second identical knock nothing; 90 steps of the same box resting against the leaf, nothing. The trade: prepared 45 s = 21.00 of two movers' labour, forced 140.00 (6.7×); two same-seed runs of 160 steps — E then the shove 1414.44 in costs, the shove alone 1533.44, +119.00, both reconciling. The leaf dropped 1.5 m: 5.26 m/s, 100 → 80.1, 14.40 billed (was 100 → 14 and 180); every other band's 1.5 m drop unchanged (box 17.0, TV 0.0, fragile box 0.0, chair 16.3). Seat 1's shove: heldBy [p1, p1], by p1; a 110 kg fridge at 4 m/s from 0.05 m: 427.9 N·s in one step, forced, by null. 4 'hung' announcements on frame 1 and 4 again after a replay; bodies 75 at boot, after a forcing and after every reset.

**Checked.** New tools/m30-force-tests.js **114 ALL-PASS** (D1–D7, Z); m20 95 (+M23-P1..P3), m22 95 (+M23-PD1..PD5); m6 119, m11 184, m12 127, m14 39, m17 117, m21 157, m23 131 (40 sessions, 0 failing), m18 159, m19 127, m15 115, m13 76, m10 51, m0 132 — all ALL-PASS. ./tools/syntax-check.sh: 124 files, 0 errors.

Deviations from the brief: the strain is read from the leaf's side (hands / manifold / m·Δv-when-best), not as the shover's m·Δv — measured 0.00 while pressing, see above; 'bent' posts at the window's close like a wall's line; heldBy keeps M14's one-entry-per-hand shape; definitions.js:503 edited for the leaf's band; the 'sturdy' row re-tuned (no def used it; 3.2/14 left the leaf at 71); the prepared cost is DOOR.removeSeconds 45 s × labourPerMinutePerMover 14 × 2 = 21.00 (no ECONOMY.timeRate exists); the forced mark sits on the hinge jamb; 'hung' carries silent: true; D7's thrown case is the fridge at 4 m/s from 0.05 m (6 m/s from 0.16 m is a CCD under-read, in KNOWN_ISSUES).

Measured:
- CALIBRATION (m30 D1, printed): couch legs on, seat 0 both hands unbraced from 0.15 m: first touch at step 33 (0.55 s) — m·Δv 41.1 N·s, leaf manifold 42.3 N·s (2539 N); then the hands hold 356 N each (712 N, controller.resistedForce 710) on the pressed couch = 11.9 N·s a step; strain 221.0 at 0.75 s, 364.7 at 0.95 s, 400.4 at step 60 (1.00 s) → FORCED, 0.45 s of pressing; peakStepImpulse 45.3
- WHY NOT m·Δv: after the first touch the couch's m·Δv summed 5.83 N·s over the whole shove (0.00 on every pressing step) against 188.1 N·s the leaf's manifold reported and 400.4 of strain; the leaf's manifold read 170–243 N while the hands applied 712 N (the probe read 305–392 N for the same push in another run) — the floor's static friction takes a solver-ordered share of a blocked push
- PHANTOMS excluded by the held-or-hit gate: a 9 kg box left 20 mm into the leaf after a 3 m/s throw reads a persistent 184 N (contactDist −0.020, sleeping); placed 10 mm in, 129 N; the couch released against the leaf, 120 N; a box parked 5 mm off it, 0 N — D2h: 90 steps of a resting box, no line
- BENT (D2): box_small_01 (9.000 kg) thrown at 2.0 m/s from 0.16 m into the leaf's east face: 10.76 N·s in one step (646 N), m·Δv 10.37; line cost 40.00, at (2.21, 0.25, −5.40), normal (1, 0, 0); second identical knock posts nothing (lines 1, scuffs 1); at 1.0/1.5 m/s from 0.16 m the box never reaches the leaf (floor friction)
- THE TRADE (D3): prepared cash 45 s × 1.0 / 60 × 14 × 2 = 21.00; chargeForced 140 = 6.7×; run A costs 1414.44 (labour 21.00, property 0) vs run B 1533.44 (labour 0, property 140.00 in one door_frame line), B − A = 119.00; both invoices reconcile
- STURDY (D4): removed leaf dropped 1.5 m flat: 1 impact, peak 5.26 m/s lost, condition 100 → 80.1 ('scratched'), billed 14.40 of 180 (m19 D5 now prints 100 → 80.0, scratched 14.4; M11 had 100 → 14, 180); closed form (5.42 − 3.6) × 12 = 21.9; non-door 1.5 m drops unchanged: box_small_01 17.0, tv_55_01 0.0, box_fragile_01 0.0, chair_dining_01 16.3
- OCCUPANCY (D5): a box with its west face 5 mm past the hinge jamb, or a mover capsule at the hung pose, reads blocked; nothing within 3 m of the doorway moved > 1 mm over 30 frames after the refused Q; cleared, the rehang lands < 1 mm from home
- CO-OP (D7): seat 1 forces at step 61 (1.02 s), line heldBy ["p1","p1"], DOOR_STATE.by 'p1'; fridge_01 (110 kg) at 4 m/s from 0.05 m: 427.865 N·s in one step, forced, heldBy [], by null. At 6 m/s from 0.16 m the same fridge stops dead (m·Δv 632 N·s) with a first-step manifold of 14.45 N·s — a CCD/deep-penetration under-read; the floor's 18 N·s resting impulse then wins M14's ranking and the door is NOT forced (recorded)
- ONE HAND: the grip tears after ~0.4 s of pressing (620–660 N applied, then 'pulled out of reach'); 50–200 N·s of strain — bent, not forced, unless re-grabbed inside the 700 ms window
- BOOT (D6): 4 DOOR_STATE 'hung' events on frame 1 and 4 again on the first frame after resetContract; recorder.events.length === bus.emitted; no caption (audio.js drops silent: true); bodies 75 / registry 27 at boot and after every reset
- SUITES: m30 114 new; m20 95 (+6), m22 95 (+7); m6 119, m11 184, m12 127, m14 39, m17 117, m21 157, m23 131, m18 159, m19 127, m15 115, m13 76, m10 51, m0 132 — all ALL-PASS; ./tools/syntax-check.sh: checked 124 file(s); 0 with syntax errors
- HARNESS NOTE: one m30 run on port 8761 printed no result block at all (the per-port scratch page artefact CLAUDE.md records); rerun alone on 8771: ALL-PASS 114

Deviations from the brief:
- THE STRAIN IS NOT M14's m·Δv (brief risk note 1 / scope 2 'a contact impulse above DOOR.forceImpulseNs from a body whose mass × |Δv| M14 already measures'). MEASURED (m30 D1 trace; the calibration probe before it): a hung leaf is Fixed, so the shoving couch loses NO speed while it presses — m·Δv 0.00 on every step after the first touch (5.83 N·s over the whole shove), because the solver zeroes the approach velocity (damage.js:135-139's own resting-contact reasoning). In those units the brute-force branch can only be an impact of ~40 N·s, indistinguishable from a 9 kg box thrown at 4-6 m/s (31-50 N·s), and '≤ 4 s of pushing' is meaningless. The frame's strain (damage.js _strainFrames) is read from the LEAF's side instead: Σ|contactImpulse| as the floor; for a held object at rest against it the hands' force × dt (damage.gripForceOf, wired in main.js) because the leaf's manifold under-reads a blocked push by a solver-ordered friction share (712 N applied, 170-243 N read here, 305-392 N in the probe); for a hit where the leaf is the object's best contact, M14's own m·Δv (the 110 kg fridge stopped dead with a 14 N·s first-step manifold). Gated on DAMAGE.property.doorFrame.forceN (250 N) AND held-or-hit, which excludes the resting phantoms (120-184 N). The PRICING path is one: _feedPropWindow (the M14 window) → _postPropLine (the M14 line writer), the frame differing only by surfaces.js surfaceRow's fixed charges.
- DAMAGE.property.doorFrame carries one key beyond the brief's { forceN, chargeForced, chargeBent }: pressSpeedMax 0.05 m/s (a held object under it is pressed, not sliding); DOOR carries occupancyMargin 0.01 m for the rehang sweep. Both in config with their measurements; no bare literal in a system.
- 'bent' posts when the frame's window CLOSES (DAMAGE.aggregationWindowMs, exactly as a wall's line does), not at the hit: a shove that goes on to force the door inside the window never bills bent, so D1's 'ledger grew by exactly chargeForced' holds (one line, 140.00) and D2's 'chargeBent ONCE' is the closed window of a knock that did not force it. 'forced' is immediate.
- heldBy on the line is M14's shape — one entry per HAND (m22 PD2j pins the array), so a two-hand shove reads ["p0","p0"]; D1b/D7 assert every entry is the shover's id, and DOOR_STATE 'forced' carries `by` = the first grip's playerId or null (thrown), plus objectId and impulse.
- src/objects/definitions.js:503 edited (not in filesTouched): door_leaf_01.fragility 'normal' → 'sturdy'. Scope (3) moves the leaf onto the band; the band a def uses lives only on the def (definitions.js), the DAMAGE.fragility row alone changes nothing. One line plus a comment; definitions.js is not shared with M24.
- The 'sturdy' row itself was re-tuned (3.2/14 → 3.6/12, floorAfter15m 70): no shipped def used it, and at 3.2/14 the leaf's 5.26 m/s fall gave 100 − 29 = 71, one bounce from the 70 floor. Now 80.1.
- The prepared cost is DOOR.removeSeconds (45 s, M11) not the brief's 60 s, and ECONOMY has no timeRate — it is labourPerMinutePerMover 14 × buildInvoice's default moverCount 2: 21.00. chargeForced 140 is 6.7× (D3 asserts ≥ 2× from config).
- A forced door's mark goes on the HINGE JAMB (house.js leafHingeMark, stored on the leaf's state as `hinge` by main.js), not at the contact point: the leaf has left for its rest pose by the time the line posts and a quad floating 0.74 m into the kitchen is wrong. The bent mark stays at the contact patch on the leaf.
- The forced leaf goes to M11's REST pose through registry.unhang (the brief's risk note asked for exactly this); like E's removal (KNOWN_ISSUES M11 'the rest spot is not checked at removal') an occupied rest strip is separated by the solver. The couch at the door centre (x 2.60) clears the living_kitchen strip (x ≤ 2.15) by 25 mm.
- DOOR_STATE 'hung' is emitted on the FIRST STEP of every run (boot and after each resetContract) by a 'doorsAnnounce' system, with reason 'boot' and silent: true; audio.js _onEvent drops silent events so the caption layer never says 'door on its hinges' four times after START (the reason M11 never emitted it). eventBus.js's comment still says 'hung' is never emitted — outside my files, see orchestratorNotes.
- D7's thrown case uses the fridge at 4 m/s from 0.05 m (427.9 N·s in one step) rather than 6 m/s from 0.16 m: at that speed the first-step manifold reads 14 N·s for a 632 N·s stop (Rapier CCD/deep-penetration accounting) and the floor's 18 N·s resting impulse wins M14's ranking, so the hit is not credited. Recorded for KNOWN_ISSUES.
- D4b's 'recorded table' was measured on this build (the normal/fragile/extreme rows are pinned to their pre-M23 values in D4a, so the closed form cannot have moved); the numbers are box_small_01 17.0, tv_55_01 0.0, box_fragile_01 0.0, chair_dining_01 16.3.
- D5's occupant box sits with its west face 5 mm past the hinge jamb (x 2.16..2.66): a box centred on the hung pose lands on the leaf lying beside the doorway and teeters on its edge; the 'nothing moved' claim is scoped to bodies within 3 m of the doorway with the kitchen's settling boxes parked away.
- D2 (bent) runs before D1 (force) in the suite so the same hung leaf serves both; D1-0 asserts it enters bent and D1f that the forcing clears the flag.
- tools/m17-tests.js untouched (D6 asserts the R2 / M22-R2g key lists inside m30 and m17 was re-run: 117 ALL-PASS).

### M24

### M24 — §21.2 contract UX: the brief before START, the invoice that reveals its big lines, a recap from the log, and a retry that keeps the tools — 2026-09-05

GDD §21.2 'Brief shows payout, estimate, distance, manifest profile, access notes, hazards, and optional goals. … Invoice animates major lines, then exposes a complete static breakdown. Event recap uses actual logged events. A retry keeps settings and optionally preserves loadout.'; §26.1 'invoice reports accurately'; §26.7 Comprehension; §13.4 the saved best; §21.1.

**Hypothesis.** The contract is built before the title card shows, so the card can READ it instead of boot moving; the settlement's numbers are final before the sheet opens, so the reveal can be wall-time presentation over invoice.js's lines with a skip and a harness override; M6's run record already holds every event the recap needs. §21.2 closes without touching boot order (PICKUP is set where it always was — m31 BOOT-1/2 pin it at frame 0, stamped 0 ms).

**What changed.** `src/ui/titleScreen.js`: a job sheet (`#title-screen .brief`, `briefHtml()` pure, `setBrief(facts)`) pinned BESIDE the card — absolutely positioned, a sibling of `.card`, because the card is centred vertically and anything inside it moves the START button by half its height; under 1180 px it drops under the card. `src/main.js briefFacts()` gathers every number from state and config: payout ECONOMY.basePayout, the estimate invoice.js reads (state.estimateMs), distance legsDriven(state) × ECONOMY.routeDistanceKm, the manifest's category and handling counts and heaviest row from the registry's defs, one line per hung door with house.js hungClear (doors on) and the leaf's thickness, an access note for every def whose disassembly shrinks it and which does not fit its route's tightest door intact (scene.js fitsThroughGap over the two smallest dimensions — on the shipped contract only the couch: legs off fits living_kitchen 0.82 m by 0.05 m), the route's three events with their seconds, the tightest hung door, the local best to beat or 'no best yet', and ECONOMY's one-trip and room-accuracy bonuses. `src/ui/invoiceScreen.js`: the sheet is built complete then shown in two parts — `.majors` (INVOICE.reveal.majors: revenue, labour, furniture damage, property damage, fuel/road, left behind, recovery fees, each the SUM of the sheet's own line kinds, then PROFIT/LOSS) land one per INVOICE.reveal.stepMs of wall time with an eased, monotone count-up over countMs, then `.breakdown` (every line, the total, the best line, the grade, the review, the recap, the stats, the questionnaire, the export row with M21's evidence link, the replay button) expands. The clock is injectable (`invoiceScreen.clock`, `revealTick()`), because the harness freezes performance.now(); `revealEnabledFrom(search, pathname)` turns it OFF on the harness's scratch pages unless `?reveal=on` or DEBUG.invoiceRevealInHarness, `?reveal=off` turns it off anywhere, and prefers-reduced-motion turns it off too. Space / Enter (window capture phase, so Input never sees it), a click, or ANY pad button on any seat (the shell observer, which also spends the pause edge a Menu press raised) lands every line at once. `recapFrom(events)`: 'What happened' from runSummary().events — door removed/forced, part off, forced drops, damage lines (costliest first when the cap bites), property lines, road events, recovery callouts — each with its m:ss sim stamp, the seat where the event carries an actor, and `ref`, its index in the run record; capped at INVOICE.recapMax (12) and recapPerKind (3); an empty run says 'nothing notable'. A 'keep the tools on the truck for the next run' checkbox above Run it again hands { keepLoadout } to onReplay → resetContract(opts): a tool INSIDE the cargo box is kept in place (dynamic, ordinary groups, velocity zeroed), everything else goes home as before; straps are released regardless. New `INVOICE` block and `DEBUG.invoiceRevealInHarness` in `src/config.js`; styles for the sheet, the majors, the recap, the checkbox and their high-contrast forms in `styles.css` (89 font declarations, all --ts scaled).

**Measured.** Title card at the harness viewport 1262×624: START x 533.63 y 311.42 w 194.75 h 39.00 and the controls list x 282.00 y 398.42 w 698.00 h 96.56 — identical before and after (m11 M24-T1/T2, m31 B2). The sheet: 229×505 px at (1025, 60), 14 px right of the card, no scroll (503/503); at --ts 1.6 it scrolls inside 94vh (1042/585) as the card already did before M24 (758/570). Reveal: stepMs 700, countMs 560; a bare settle in real Chrome (5 majors) landed in 4060 ms, at 1 s only 'revenue' was counting, at 5 s the breakdown's LOSS −256.73 equalled the major. Recap on m31 R1's scripted run: door P1 @0:00, legs off @0:00, two drops P1 @333/417 ms, tv 55 broken 900.00 and 828.00, box small cracked 10.80, front wall marked 30.82, Traffic light @7.2 s, wardrobe callout @7.7 s — 10 entries, every id resolving to its event.

**Checked.** New `tools/m31-contract-ux-tests.js` **141 assertions ALL-PASS** (BOOT 6, B1 24, B2 13, V0 6, V1 17, V2 13, V3 10, R1 16, R2 13, Z 5; run twice, identical). m11 +4 (M24-T0..T3): 184. m17 +6 (M24-R1..R6): 117. Regressions m0 132, m15 115, m16 138, m21-trips 157, m14 39, m27 128, m28 151 — all ALL-PASS. `./tools/syntax-check.sh`: 124 files, 0 errors.

Deviations from the brief: the brief sits beside the card, not inside it above the controls (a centred card cannot grow without moving START — both rects are pinned to the pixel instead); B2's 1.6× clause is asserted as no horizontal clipping / no character-wrap / reachable overflow, because the card itself overflowed 94vh at 1.6× before M24; the keep-loadout hook did not exist and was added in resetContract rather than disabling the box; V2's Space is dispatched from document.body (a real keyboard's path) since an event dispatched ON window reaches Input first; drops in R1 are stamped through releaseAll(reason, simTimeMs).

Measured:
- Title card at the harness viewport 1262x624, --ts 1, BEFORE M24 (probe 2026-09-05): card x 251 y 66 w 760 h 491.98; START x 533.63 y 311.42 w 194.75 h 39.00; controls x 282.00 y 398.42 w 698.00 h 96.56; card scroll 490/490. AFTER M24: identical to the pixel (m11 M24-T1/T2, m31 B2).
- The brief panel at --ts 1: 229 x 505 px at (1025, 60) — 14 px right of the card's edge (1011), 8 px inside the viewport's right edge; scrollHeight 503 = clientHeight 503 (no scroll); the card's scroll state untouched (490/490). At --ts 1.3: brief 835/585, card 594/585. At --ts 1.6: brief 1042/585 (scrolls inside 94vh), card 758/570 — the card overflowed at 1.3 and 1.6 before M24 too (probe before any change: 594/585 and 758/570). A first draft of the brief was 853 px tall at --ts 1; the compact rows (one line per door, hazards as text rows, only non-fitting items as access notes) brought it to 503.
- The brief's facts on the shipped contract: payout 900.00; estimate 18 min; distance 4.2 km · 1 leg; 23 items · 9 box, 5 small, 3 large, 3 medium, 2 fragile, 1 showcase; 5 fragile · 3 two-person · 1 showcase; heaviest fridge 110 kg; doors on: 32" interior 0.78 m, 34" door 0.82 m, living_kitchen 0.82 m, kitchen_bedroom 0.87 m; a door off its hinges frees 0.04 m; couch 3seat vs living_kitchen 0.82 m: legs off fits by 0.05 m (intact clearance -0.03 m; the other five shrinksTo defs — tv stand, side table legs, bookshelf shelves, wardrobe doors, dresser drawers — fit their routes intact and are not listed); hazards Traffic light (hard brake, 4 s), Left onto Mill Road (sharp turn, 12 s), Speed bump (21 s); tight door 32" interior 0.78 m; optional: no best yet / one trip +180 · every room right +90.
- Reveal config: stepMs 700, countMs 560, tickMs 33. Real Chrome (pane, 290 px wide, fallback layout) on a bare settle: 5 majors (revenue 1160.00, labour -23.29, fuel / road -13.44, left behind -1380.00, LOSS -256.73) = 5 x 700 + 560 = 4060 ms; at 1 s only 'revenue' was up and mid count-up; at 5 s every line landed, the breakdown open, its .total -256.73 equal to the LOSS major. In the harness (m31 V1, TV drop + one recovery): 7 steps = 5460 ms of injected wall time; furniture major = -1728.00 on that run's ledger (two TV lines 900.00 + 828.00), fees -45.00.
- Recap on the m31 R1 scripted run (10 entries, cap 12, 3 per kind): door@0:00 P1 living_kitchen; legs off — couch 3seat @0:00; box small dropped (dropped) @333 ms P1; (slipped) @417 ms P1; tv 55 broken 900.00 @1783 ms; tv 55 broken 828.00 @2967 ms; box small cracked 10.80 @3083 ms; front wall marked by box small 30.82 @3083 ms; Traffic light @7183 ms; recovery callout — wardrobe (out of bounds) @7667 ms. A run with nothing: 'nothing notable — a quiet job', 0 items.
- Keep loadout: screwdriver and dolly parked inside the cargo box (insideCargo true after 40 frames) survive a ticked restart in place, dynamic with object groups; unticked, every tool is back within 0.15 m of its PHASE6_TOOL_SPAWNS row; straps are released regardless.
- Assertion counts: m31 141 (BOOT 6, B1 24, B2 13, V0 6, V1 17, V2 13, V3 10, R1 16, R2 13, Z 5 — run twice, identical); m11 180 -> 184; m17 111 -> 117; m0 132, m15 115, m16 138, m21-trips 157, m14 39, m27 128, m28 151 all unchanged and green. Syntax gate: 124 files, 0 errors. Ports used: 8461-8465, 8470-8489, 8500-8519, 8531, 8541; 8499 served the visual check and was stopped. No _smoketest-*.html and no tools/_probe-*.js left in the repo.

Deviations from the brief:
- The brief is NOT a block inside the card above the controls list; it is a job sheet pinned BESIDE the card (#title-screen > aside.brief, absolutely positioned at calc(50% + 394px), a sibling of .card). Reason, measured: the card is centred vertically (#title-screen align-items:center), so any content added inside it moves the START button and the controls list by half its height — B2's 'START and controls rects unchanged' and 'above the controls list' cannot both hold with an in-flow block. The side sheet leaves both rects identical to the pixel (m11 M24-T1/T2, m31 B2); under 1180 px wide it drops under the card (styles.css media query, seen in the 290-px pane).
- B2's 'at --ts 1.6 it wraps, never clips (scrollHeight <= clientHeight of the card)' is not satisfiable as written: the card itself already overflowed 94vh at the harness's 624-px viewport before M24 (594/585 at 1.3, 758/570 at 1.6, measured by the probe before any change). Asserted instead at 1.6: no row wider than its box (scrollWidth <= clientWidth), no row over four lines (a word-wrap, never a character-wrap — the first draft's overflow-wrap:anywhere wrapped a flex row to 318 px of one character per line), the sheet inside the viewport beside the card, and its overflow reachable (overflow:auto); the card's pre-existing 758/570 is pinned as a NOTE assertion. At --ts 1 the sheet does not scroll (503/503).
- 'keep loadout' hook: the brief said it 'exists in respawnContract; if it does not, the checkbox is disabled'. It did not exist (grep loadout in src -> 0). Rather than a disabled box I added the hook in resetContract's tool loop (main.js, one small hunk: a tool INSIDE the cargo box skips only the teleport home when opts.keepLoadout) and the sheet enables the box through invoiceScreen.loadoutHook = true, which main.js sets; the disabled-with-title path is still in invoiceScreen.js for a build without the hook. Straps are NOT carried over (they bound cargo that the reset respawns to the house); the checkbox says 'keep the tools on the truck'.
- V2's Space keydown is dispatched from document.body (the path a real keyboard event takes), not ON window: dispatched on window it is at-target for both the sheet's capture listener and Input's bubble listener and Chrome fires them in registration order — Input first (measured in m31 run 1: jump=true). From body, the window capture phase runs the sheet's listener first and stopImmediatePropagation keeps it from Input (V2: jump not down, defaultPrevented true). m15's window-dispatch shape would reach Input first, harmlessly (paused, no step).
- R1's forced drops are stamped with releaseAll(reason, game.clock.simTimeMs): the bare releaseAll(reason) defaults simTimeMs to 0 (grip.js:306) and sorted the two drops before the door in run 1. In the game every forced release comes from grips.step with the clock, so the recap's stamps are real there.
- 'worst drop' in the recap is read as: drops are GRIP_ENDED entries in time order (first perKind), and the DAMAGE_APPLIED entries are chosen costliest-first when the per-kind cap bites (R1u), then everything is merged by sim stamp. The seat column is blank for part/damage/property/road entries because PART_CHANGED and DAMAGE_APPLIED carry no actor (interact.js emits PART_CHANGED without `by`; interact.js is not in M24's ownership).
- The reveal is also OFF under prefers-reduced-motion (main.js: revealEnabledFrom(...) && !reducedMotion) — an addition for §21.4 Motion; the numbers are identical either way. ?reveal=off / ?reveal=on override the page rule; DEBUG.invoiceRevealInHarness (false) rules the scratch pages.
- M23's DOOR_STATE 'forced' does not exist in the tree at the time of building (grep forced in src/player/interact.js, src/world/house.js -> none); recapFrom already classifies state 'forced' as a door entry reading 'door forced — <label>' with the actor's seat, unit-tested in m31 R1u with a synthetic event.
- The optional-goals row lists ECONOMY's one-trip (+180) and room-accuracy (+90) bonuses beside the best-to-beat — §12.1's optional goals, from config; the brief named only the best.
- AirportBaggageCrew has no brief/shift card to copy: grep -i brief in C:/Dev/AirportBaggageCrew/src/ui -> no matches. The sheet uses this project's own card recipe (styles.css title tokens).
- m17's 'run unmodified first' was satisfied by the fact that the Q-series lines are byte-identical and the new M24 section sits after Q6; the recorded run is with the additions (117 = 111 + 6).

## Phase 25 — Phase 11 build side, batch 10: the evidence page, and the first minute — 2026-09-05

Phase 11's build side (GDD §25.2: onboarding, settings, instrumentation, fixes), from the ordered plan in docs/PHASE11_PLAN.md. Each milestone was built by a file-owned implementer and adversarially reviewed against its brief; the numbers below are the ones the reviews reproduced.

**3173 assertions across 30 suites, all passing.**

### M21

### M21 — The evidence page — paste testers' run reports, read the §26.7 gate as a table — 2026-09-05

GDD §25.2 Phase 12 'Decision — evidence report and Unity go/revise/stop; fun proven, not feature count'; §26.7 Fun Validation Gate (six signals with minimum evidence); §27.3 the seven playtest questions; §27.4 'local event logs … human-readable'; §22.5 'export event log and invoice inputs for reproducible reports'; zero external requests (project rule).

**Hypothesis.** M6's Copy button produces the run report, and Phase 12's decision is made from a set of them read against §26.7's six signals — until now by hand, from pasted JSON blobs. A static page that takes any number of pasted reports and renders the §26.7 table — each rule quoted from the GDD as data, the number that measures it, a verdict at thresholds the reader can see, and the runs behind it — plus the §27.3 histograms and the aggregate invoice/phase/drop/recovery numbers, turns a playtest session into the report the decision needs, computed in the tester's browser and nowhere else.

**What changed.** New `src/telemetry/evidence.js` (pure; imports only config, eventBus's EVENTS and questionnaire's QUESTIONS): `parseReports(text)` splits a paste into JSON documents — one object, an array, or any number concatenated or whitespace-separated, braces inside strings respected; what does not parse is rejected with the parser's reason and a 60-char sample. `rejectReason(r)` refuses anything without numeric counters.grips/drops/recoveries; `normaliseRun` reads a report with defaults, cuts strings at TELEMETRY/EVIDENCE limits and takes the first GRIP_STARTED and first CARGO_STATE loaded stamps from the events, or from M22's walkthrough stamps (step1Ms/step2Ms) when the report has no event list but the cards were shown; `sessionsOf` groups date-ordered runs into testers (a new session when the build changes or `restarts` stops climbing — no identity by design, §27.4); `evidenceFrom(runs, cfg = EVIDENCE)` → `{ runs, rejected, sessions, signals[6]{id, label, rule, k, n, value, verdict, runIds, text, note, parts}, aggregates, histograms }`; `evidenceMarkdown(ev)` the table, the aggregates, the seven question lines and the notes as Markdown with pipes and newlines escaped. The six signals: Comprehension = first grip ≤ EVIDENCE.comprehension.firstGripMs (30 000 ms = CONTRACT.stallHintMs — the stall hint is a notice, not an event, so its deadline stands in for 'without coaching') AND first load ≤ firstLoadMs (120 000) of sim time; a run with neither events nor walkthrough stamps is EXCLUDED and named, never scored 0; the text prints the with/without-cards split. Emergent story = a non-empty q1 or q6. Learning = per session with ≥ 2 runs, the second differs from the first in trips (≥ 1), straps placed (≥ 1), tool changes (≥ 1) or worst cargo shift (> 0.10 m); PASS at ≥ half the pairs. Replay intent = q7 ≥ 4 or restarts ≥ 1; PASS at ≥ half, inclusive. Core preference = every mean of q3/q4/q5 ≥ 3.5. Friction = recoveries/run ≤ 1.0, drops/grip ≤ 0.5, and q1 mentioning stuck/control/bug/glitch/confus/broken/lost in ≤ half the runs. 'Most' is strictly more than EVIDENCE.most (0.5). New frozen `EVIDENCE` block in `src/config.js`: the six §26.7 minimum-evidence cells VERBATIM as `rules` (m28 E3 pins them from GDD.md, not from config), every threshold above, `lineKinds` (a copy of invoice.js LINE_KINDS so the static page imports nothing but config; E3a asserts they agree), `shiftBinsM` [0.05, 0.25, 0.50], `textLimits.label` 40. New `docs/evidence.html`: a static ES-module consumer of `../src/config.js` and `../src/telemetry/evidence.js` (the same relative shape as index.html → src/main.js, so GitHub Pages' repo-root serve and tools/serve.ps1 both resolve it), inline CSS with styles.css's palette by value, `<link rel="icon" href="data:,">` so not even a favicon is requested. A paste box, Add, Clear and Copy evidence report (Markdown) (the invoiceScreen.js copy pattern: the textarea is filled first and unhidden, selected, when the clipboard refuses); the run list (id, session, build, seed, date, trips, profit, complete or delivered/total, answered/7, timings from events / walkthrough / none); the six-row table (`tr.signal-row.v-pass|v-notyet|v-nodata`, the rule cell verbatim, the measured text with its note, the badge, the run ids); the aggregates grid (runs, completion, mean profit with min/max, trips histogram, replays, phase means, furniture/property/left-behind/parts lines, recoveries by kind, drops by reason, worst-shift bins, straps, runs without events, walkthrough key count); the seven §27.3 blocks with five bars between the sheet's end-words and the text answers listed by run id; a 'how the table is read' card that prints every signal's note and the EVIDENCE block; `window.__EVIDENCE` for the suite. `src/ui/invoiceScreen.js`: the export row gains 'open the evidence page ↗' (`a.evidence`, href docs/evidence.html, target _blank, rel noopener). New `tools/_fixtures/runs-sample.json`: six reports built by m28 F from scripted harness runs — two testers × three runs, A answers all seven, B skips; one run restarted; one with 2 trips and a left-behind line; one with 3 recoveries — a snapshot, not a playtest. New `tools/m28-evidence-tests.js`.

**Measured.** The fixture: #1 r0 t1 g1 d0 rec0 complete 12 events profit 1369.56 | #2 r1 t2 g1 d1 incomplete 7 ev −263.68 (left behind) | #3 r2 t1 g1 d0 rec3 complete 17 ev 1162.52 | #4 r0 t1 g0 d0 incomplete 3 ev −233.83 (left behind) | #5 r1 t1 g1 d0 complete 12 ev 1369.56 | #6 r2 t1 g1 d0 complete 12 ev 1369.56; every report carries M22's `walkthrough: { shown: false }`. Its table: Comprehension 4/6 = 0.67 PASS (#1 #3 #5 #6; with the first-minute cards 0/0, without 4/6) · Emergent story 3/6 = 0.50 NOT YET · Learning 1/2 PASS (tester A trips 1→2; B unchanged) · Replay intent 4/6 PASS (q7 ≥ 4: 1; restarts ≥ 1: 4) · Core preference q3 4.33, q4 2.67, q5 4.67 NOT YET (q4 < 3.5) · Friction recoveries/run 0.50, drops/grip 0.20 (1/5), q1 mentions 1/6 = 0.17 PASS. Aggregates: 4/6 complete (67%), mean profit 795.61 (−263.68 … 1369.56), trips 1 × 5 / 2 × 1, replays 4, pickup mean 4.1 s, furniture damage −241.60 (10 events), property −10.72 (4), left behind −2760.00 in 2 runs, recoveries 3 (object 3), drops 1 of 5 grips (dropped 1), worst shift ≤ 0.05 m × 6. The compact save form (no events) scores every signal but Comprehension, which reads 'no data' with all six named excluded; three walkthrough-stamped compact runs (one with step2Ms null) score 2/3 with the cards. The page's only network entries are four same-origin module loads under /src/, unchanged by Add/Copy/Clear, with stubbed fetch/XHR called 0 times. Harness: boot alone spends 130 591 ms of the 240 000 ms virtual budget; an `await fetch()` after title.start() and six settlements left the DOM dumped mid-request, so the fixture is a JSON module import before boot and the page's iframe loads right after boot (ready at the first 50 ms tick; fetch after boot 10 ms). Found on the way: Number(null) is 0 — a null walkthrough stamp scored as an instant load (3/3 where 2/3 was hand-computed) until stamp() returned null. Real Chrome 152 over serve.ps1: Add → '6 runs · 2 sessions · phase-24', lime PASS / amber NOT YET badges, bars, notes; the Markdown copies.

**Checked.** New `tools/m28-evidence-tests.js` **151 assertions ALL-PASS** (E1 total function and the paste shapes; E2 the numbers; E2c/E2w compact and walkthrough-stamped runs; E2z the fixture; E3 the GDD's words; E4 the Markdown re-parses; E5 the page as a second document; E6 the sheet's link and M6's Copy). Regressions: m17 111, m21-trips 157, m0 132 (E8) — all ALL-PASS. `./tools/syntax-check.sh`: 121 files, 0 errors.

Deviations from the brief:
- 'First load before the stall hint' is read as first load ≤ 120 s of sim time and first grip ≤ 30 s (= CONTRACT.stallHintMs): the stall hint is a notice, not an event, and never fires after a grip, so the literal reading is vacuous. Stated on the page and in the Markdown notes.
- Learning pairs by session (consecutive reports of one build whose `restarts` climbs, in date order), not 'consecutive dates' alone — the brief's own risk.
- src/main.js needed no hunk: every hook the suite drives was already on window.__MFH. The README link is in this entry's README note, not applied (orchestrator-reserved).
- The fixture's dates are stamped by the suite six minutes apart: the harness's virtual clock gives six settles one instant, and the page orders by date.

Measured:
- Fixture (tools/_fixtures/runs-sample.json, phase-24, seed 4072177255, dates 2026-09-05T10:00..10:30 six minutes apart): #1 r0 t1 g1 d0 rec0 complete 12 events profit 1369.56 | #2 r1 t2 g1 d1 rec0 incomplete 7 ev −263.68 (items left behind line) | #3 r2 t1 g1 d0 rec3 complete 17 ev 1162.52 | #4 r0 t1 g0 d0 rec0 incomplete 3 ev −233.83 (left behind) | #5 r1 t1 g1 d0 rec0 complete 12 ev 1369.56 | #6 r2 t1 g1 d0 rec0 complete 12 ev 1369.56. Every report carries M22's walkthrough { shown: false }.
- §26.7 table over the fixture: Comprehension 4/6 = 0.67 PASS (#1 #3 #5 #6; with the first-minute cards 0/0, without 4/6) · Emergent story 3/6 = 0.50 NOT YET (#1 #2 #3) · Learning 1/2 = 0.50 PASS (tester A yes: trips 1→2; tester B no; runIds #2) · Replay intent 4/6 = 0.67 PASS (q7 ≥ 4: 1; restarts ≥ 1: 4) · Core preference q3 4.33, q4 2.67, q5 4.67 (n=3 each) NOT YET (q4 < 3.5) · Friction recoveries/run 0.50 (cap 1), drops/grip 0.20 (1/5, cap 0.5), q1 mentions 1/6 = 0.17 (cap 0.5) PASS (#2 #3).
- Aggregates over the fixture: 6 runs, 4 complete (67%), mean profit 795.61 (min −263.68, max 1369.56); trips 1 × 5, 2 × 1; replays in the set 4; phase means pickup 4.1 s (others 0.0 — no drive in the scripted runs); furniture damage lines −241.60 (10 events), property −10.72 (4 events); left behind −2760.00 in 2 runs; recoveries 3 (object 3); drops 1 of 5 grips (dropped 1); worst cargo shift ≤ 0.05 m × 6, max 0.000 m; straps all 0; runs without an event list 0; walkthrough key reported 6. §27.3 histograms: q2 [0,0,1,1,1] mean 4.00; q3 [0,0,0,2,1] 4.33; q4 [0,1,2,0,0] 2.67; q5 [0,0,0,1,2] 4.67; q7 [0,1,1,0,1] 3.33; q1/q6 three answers each.
- Page network: exactly 4 resource entries after load, all same-origin under /src/ (config.js, telemetry/evidence.js, core/eventBus.js, ui/questionnaire.js); unchanged after Add, Copy, Clear; stubbed fetch/XHR called 0 times; no stylesheet link; favicon suppressed with href="data:,".
- Harness virtual time (--virtual-time-budget 240000): boot alone consumed 130 591 ms of it (Date.now() across await __MFH_READY); an await fetch() placed after title.start() and six scripted settlements left the DOM dumped at status 'E2z...' with the response pending (run 1: 92 PASS, no result line); the same fetch right after boot resolved in 10 ms virtual, a dynamic JSON module import in 10 ms, sync XHR status 200 / 36 090 bytes, and the /docs/evidence.html iframe was ready at the first 50 ms tick.
- Bug found by E2w before the fix: Number(null) = 0 made a null walkthrough step2Ms read as 'loaded at 0 ms' → 3/3 comprehending where 2/3 was hand-computed; after the stamp() fix 2/3.
- Real Chrome 152.0.7977.76 over tools/serve.ps1 on port 8419: the page rendered, Add → '6 runs · 2 sessions · phase-24', row classes v-pass, v-notyet, v-pass, v-pass, v-notyet, v-pass, lime/amber badges, run list with sessions, aggregates grid, seven question blocks with five bars each, notes card; __EVIDENCE.markdown() returned the table with the numbers above.
- Suites: m28 151 ALL-PASS, m17 111, m21-trips 157, m0 132. ./tools/syntax-check.sh: checked 121 file(s); 0 with syntax errors. Sizes: evidence.js 555 lines, evidence.html 319, m28 suite 655, fixture 1543 lines / 36 090 bytes.

Deviations from the brief:
- E2z does not fetch the fixture from the harness server as the brief's phrasing implied; it imports it as a JSON module BEFORE boot and E5's iframe is loaded right after boot, with no await after title.start(). Evidence: run 1 stalled at 'E2z...' (scratchpad m28-run1.txt: 92 PASS, no ALL-PASS/FAILURES line) while the probe after boot resolved fetch in 10 ms — headless dump-dom fires at the first idle point once the game's timers have burnt the remaining virtual budget (boot uses ~130 s of 240 s). The pasted text in E2z/E5 is the fixture's pretty-printed array, which is what a tester pastes.
- E2's assertion 'the walkthrough split is reported as absent (M22 key not in these reports)' was wrong against the tree: M22's runLog.js hunk (src/telemetry/runLog.js:266 `walkthrough: walkthroughReport(opts.walkthrough)`) puts { shown: false } in every harness report. Rewritten to assert the key present → 'with the first-minute cards 0/0, without 4/6', and the stripped-key case → 'walkthrough not reported' with the same 4/6. E2w likewise reads stripped 0 / live 6 / stamped 6.
- Comprehension reads the brief's 'first CARGO_STATE loaded came before the stall hint' as first load ≤ EVIDENCE.comprehension.firstLoadMs (120 s) and first grip ≤ firstGripMs (30 s = CONTRACT.stallHintMs): the stall hint is a notice (main.js stallHint system), not a bus event, so the report cannot say when it fired, and it can never fire after a grip — 'load before the stall hint' would be vacuous. Stated in the signal's note on the page, in the Markdown notes and in KNOWN_ISSUES.
- Learning pairs runs by session — consecutive reports of one build, in date order, whose `restarts` climbs — rather than 'same build, consecutive dates' alone: two testers who each play once on one date would otherwise pair. The brief's own risk asks for this; the page's note and the Markdown say so.
- src/main.js is in filesTouched but needed no M21 hunk: every hook m28 drives is already on window.__MFH (M2/M6). The main.js hunks in the diff are M22's.
- README link (brief scope item 5) is orchestrator-reserved — the paragraph is in docsNotes.readme, not applied.
- src/telemetry/evidence.js: fixed a real bug in the previous implementer's normaliseRun/firstStamp — Number(null) is 0, so a null walkthrough stamp scored as an instant load; new stamp() helper returns null for null/undefined/''. E2w now passes with the hand-computed 2/3.
- The fixture's dates are stamped by the suite (10:00, 10:06, … 10:30) rather than by buildRunSummary: under the harness's virtual clock six settles share one instant, and the page orders runs by date. Everything else in the fixture is buildRunSummary's output verbatim.

### M22

### M22 — The first minute: a three-card walkthrough that gets a stranger from START to a box on the truck without coaching — 2026-09-05

**Why.** M5 gave the HUD an objective line, room hints and one stall hint; M3 gave the title card a controls list. Nothing in the first minute TAUGHT the one thing §26.7 measures — pick up a box, carry it to the truck, put it down inside — and M21's Comprehension signal scores exactly the first grip and first load. §25.2 Phase 11 'onboarding', §21.3, §4.4, §21.1, §26.5.

**What.** `src/ui/walkthrough.js`: three cards bottom-left above the help line, each dismissed by DOING the thing, never by a button. Step 1 'Look at a box and hold [LMB]' retires on the first GRIP_STARTED by seat 0's mover; step 2 'Carry it out to the truck' on the first CARGO_STATE loaded; step 3 'Now the rest — the panel says what is next' after WALKTHROUGH.step3Ms = 20 000 ms of sim time or the first delivered item. The steps are STATE, not a route (the AirportBaggageCrew onboarding rule, INDEX rows 603-604: a load at step 1 collapses the chain forward; no training pauses — advisory text over a live sim, as the stall hint is). Key chips derive from input.glyphsFor for seat 0's debounced shown device (LMB/RMB, LT/RT on a pad, with a 'pad' chip). It is the FIRST child of #ui, so every HUD, notice and card paints over it; pointer-inert except its ✕.
- **Position by measurement, not by a layout per frame.** The card's `bottom` is the help line's live top + WALKTHROUGH.clearancePx (8), so text size and high contrast cannot push the two together — measured ONCE, then again only after a resize, the help line's rewrite, a --ts or .hc change or the fonts settling (`walkthrough.relayout()`): 120 frames at step 1 call getBoundingClientRect 0 times, a resize exactly once, and the cached bottom equals the live value to the pixel (m29 W1z4-W1z9).
- **One voice at a time.** main.js's 'stallHint' system returns while `walkthrough.coaching` (steps 1-2), AFTER the grip check and the M19 hints guard — suppressed at the source: 1830 idle frames = 30 500 ms queue nothing and the timer reads 0; after the ✕ the hint fires exactly once.
- **Yields, retires, or never arms.** Hidden (not retired) under the title, the pause card, the settlement sheet (m29 W7y: still active at step 1 underneath, and the replay arms a fresh one), the settings card and with hints off (M19); a reduced HUD keeps it; high contrast applies (`.hc`: opaque, 2 px, the rect unchanged to 0 px). Co-op RETIRES it for the run (setSeats; §21.1's split has no room) and it does not come back when the seat empties. Never built on the harness's scratch page unless `?walkthrough=1` or DEBUG.walkthroughInHarness (walkthroughEnabledFrom, pure).
- **Once per browser.** Shell key `walkthroughSeen` (config SETTINGS.shellDefaults, save.js sanitiseShell boolean-only), set when the third card retires or the ✕ / Escape-into-the-card skips. The 'Reading the screen' row **'Show the first-minute cards again'** is the key's negation — settings.js gained a generic `invert` row option (data-invert="1"; the box shows !value and writes !checked; the store never knows) — ticked means the cards show at the next START THE JOB or restart; the cards untick it themselves. Shell state only (§22.4): never in game.state, no bodies, no scene children.
- **Telemetry, all the way to the save.** buildRunSummary gains `walkthrough`: `{ shown: false }` or `{ shown: true, step1Ms, step2Ms, step3Ms }` in whole sim ms (runLog walkthroughReport, pure); compactRun keeps it and save.js sanitiseRun now carries it through save() AND load() (new `sanitiseWalkthrough`; a record from a pre-M22 build reads `null` = not reported), so the settled record, the session's kept run and the PERSISTED kept run all agree — M21's evidence page reads the stamps from the save after a reload, not only from a Copy export (m29 W7i, W7y4).

**Tests.** NEW tools/m29-walkthrough-tests.js: ALL-PASS 180 (W0 15, W1 44, W2 21, W7 17, W3 18, W4 14, W5 10, W6 12, W2x 6, W8 11, W7y 8, Z 4), run twice with identical numbers. m17 +5 (M22-R2g..k): 111. m16 138 (V4 fixture and U2 consumer extended; U2 reads an inverted row in the box's sense). Regressions m0 132, m11 180, m12 127, m15 115 ALL-PASS, untouched. Syntax gate: 121 files, 0 errors.

Measured:
- Card at 1262×624: [10,484→322,577] = 312×93 px; help line top 585, card bottom 577 (8 px clearance); m11 O5's centre third (x 421-841, y 208-416) untouched; no overlap with the help line, the objective line, a notice or the caption line.
- Real events (suite timeline): tryGrab → GRIP_STARTED at 3300 ms → step 2 the same tick; the box loaded after 53 frames → CARGO_STATE at 4200 ms → step 3; retired at 24 200 ms = load + 20 000 (still up at 19 950 ms since the load, gone at 20 050). Delivery exit: delivered after 78 frames → retired 1300 ms after the load. The persisted run stores 3300 / 4200 / 24200.
- Layout: 0 help-line measurements over 120 frames; 1 per resize, .hc toggle or --ts apply.
- Seen at boot: 300 frames with a real grip and load → visible 0 frames. Stall hint: 30 500 ms idle at step 1 → 0 notices, ms 0; skipped → 1 notice, still 1 after 120 more frames.
- Three skip/show cycles: bodies 75, scene children 330, document elements 676, #ui children 11 unchanged.

Deviations from the brief: the summary key is `walkthrough: {shown, step1Ms, step2Ms, step3Ms}` (M21's contract), not a `walkthroughShown` flag; W3's 'next title.start()' is asserted through resetContract() because start() runs once per boot (titleScreen.js:98).

Measured:
- Save path (the major): before the fix a node-style read of sanitiseRun(compactRun(summary)) had no `walkthrough` key; after it, m29 W7i reads load().runs[last].walkthrough === { shown:true, step1Ms:3300, step2Ms:4200, step3Ms:24200 } (deep-equal to the settled record), and W7y4 reads { shown:true, null, null, null } from the persisted run of a run settled at step 1.
- Card at the harness viewport 1262×624: rect [10,484→322,577] = 312×93 px; help line [195,585→1067,616]; card bottom 577 ≤ help top 585 (WALKTHROUGH.clearancePx 8); centre third x 421-841 / y 208-416 untouched; left edge 10 px — identical to the implementer's and the reviewer's runs.
- Forced layouts (the review's minor 4): #help.getBoundingClientRect is called 0 times over 120 frames with the card at step 1 (was 2 per frame = 240), 1 after a resize, 1 per high-contrast toggle, 1 per uiScale apply; the cached bottom equals the live value to the pixel (W1z9).
- Real events in the suite's timeline (W1z4's 154 feed frames now precede the grip, so the absolute stamps moved; every delta is unchanged): tryGrab → GRIP_STARTED at sim 3300 ms → step 2 the same tick; the box loaded after 53 frames → CARGO_STATE at 4200 ms → step 3; retired at 24200 ms = load + 20000 (still up at 19950 ms since the load, gone at 20050). The record stores 3300 / 4200 / 24200 (whole ms). Delivery exit: retired 1300 ms after the load (78 frames).
- Seen at boot: 300 frames with a real grip and a real load → the card visible on 0 frames, step 0, { shown:false }. Stall hint: 1830 idle frames = 30500 ms at step 1 → 0 notices, timer 0; after the ✕ → exactly 1 notice, still 1 after 120 more frames.
- High contrast: background alpha 1, border 2 px, rect moved 0 px. Three skip/show cycles: bodies 75, scene children 330, document elements 676, #ui children 11, card inner 8 — unchanged.
- styles.css: 75 font declarations, 75 scaled by --ts (m16 U1). Syntax gate: ./tools/syntax-check.sh → checked 121 file(s); 0 with syntax errors (run after the last edit, before every browser run).
- Suites: m29 180 (twice, ports 8741 and 8748, byte-identical numbers), m16 138, m17 111, m0 132, m11 180, m12 127, m15 115 — all ALL-PASS. Ports used: 8741-8748. No _smoketest-*.html left in the repo root.

Deviations from the brief:
- RESOLVED (was declared): the settings row is now the brief's 'Show the first-minute cards again' in the brief's sense — ticked = show at the next START / restart. The shell key stays `walkthroughSeen` (the brief's); settings.js gained a small generic `invert` row option (data-invert="1" on the control; the handler writes !checked, the sync shows !value). m16 U2 reads the box and its consumer in the box's sense and negates the default for an inverted boolean row; m29 W3h1/W3h2 pin the label and the declaration.
- The run-summary key is `walkthrough: { shown, step1Ms, step2Ms, step3Ms } | { shown: false }` (M21's contract — evidence.js reads r.walkthrough.step1Ms/step2Ms), not the brief's `walkthroughShown` flag. On the save path a record WITHOUT the key reads `walkthrough: null` ('not reported' — evidence.js's own `r.walkthrough !== null` test), never a guessed { shown: false }.
- m29 W3 says 'the card appears at the next title.start()'; title.start() runs once per boot (src/ui/titleScreen.js:98-100 `if (this._done) return;`), so W3m asserts through resetContract() — the Restart / replay path, which arms via the same walkthrough.arm() call as title.onStart. The cold-boot-with-seen path is covered by sanitiseShell (W3a/W3b) + arm()'s seen check (W3c/W3d).
- m29 W8's 'DOM count constant across three show/skip cycles' is measured with the card showing step 1 at the baseline and after each cycle: the two key chips are the step's content (8 inner elements at step 1, 6 at step 3), not growth.
- Stamps in the record are whole milliseconds (runLog.js mm / save.js sanitiseWalkthrough Math.round); the live card keeps the fractional sim stamps, so W7b compares against Math.round and W7e pins integers.
- The layout cache is invalidated by an explicit list (resize, the help line's rewrite, a --ts apply, applyAccessibility for .hc, document.fonts.ready) rather than by observing #help; a uiScale apply of the SAME value still remeasures once (W1z8 asserts the apply, not a change). The stall-hint suppression predicate is `active && step <= 2` (coaching), so a step-1/2 card merely hidden under the settings card still silences the hint — harmless because the settings card pauses the sim, and unchanged from the implementer's build (the review noted it as a gap, not a violation).

## Phase 24 — Phase 11 build side, batch 9: the last §21.4 rows, and a consistency pass — 2026-09-05

Phase 11's build side (GDD §25.2: onboarding, settings, instrumentation, fixes), from the ordered plan in docs/PHASE11_PLAN.md. Each milestone was built by a file-owned implementer and adversarially reviewed against its brief; the numbers below are the ones the reviews reproduced.

**2837 assertions across 28 suites, all passing.**

### M19

### M19 — §21.4's Cognition and Vision rows: reduced HUD, objective history, a hints switch, high contrast

**Why.** M4 built the settings card and M9/M16 filled its Hearing and Motion rows; four §21.4 baseline rows still had no surface. A player who wanted less on screen could not reduce the HUD, a notice that scrolled off after 3.2 s was gone (the bus ring is a diagnostic tail, not a history), M5's stall hint and the room suffix could not be turned off, and the panels were 72-93 % alpha over a bright scene with no high-contrast mode. Colour-independent cues existed only where M5 and M9 put them.

**What.** A new 'Reading the screen' group on the settings card (src/ui/settings.js ROWS.access) with three shell keys — `reducedHud` false, `highContrast` false, `hints` true (config.js SETTINGS.shellDefaults; save.js sanitiseShell keeps booleans only; the blob still has its seven sections, m16 V4c). main.js applyAccessibility() pushes each to its consumer at boot and on every change.
- **Reduced HUD** (hud.js setReduced → `.hud.reduced`): the cargo panel, the route bar's label and the contract panel's truck/clock rows go; the phase word, the manifest count, the objective line, the prompt, the reticle, notices and the caption stay (§21.1), and an OVERTIME row stays (§2.2). Both seats in co-op. m11 O5's centre-clear predicate holds in every state.
- **High contrast** (hud.js setHighContrast + `.hc` on <body>, every HUD root and the title/pause/settlement/settings cards): panel alpha .78 → 1.0, `--paper`/`--line` to #ffffff, borders 1 → 2 px with 1 px less padding so every panel's rect is unchanged to 0.5 px, every dimmed opacity to 1, the route fill hatched (repeating-linear-gradient). Contract-panel text contrast, computed from the computed colours: 18.0:1. `?hc=1` forces it on at boot (save.js highContrastForced, a pure function of the search string).
- **Objective history**: the pause card's 'What happened' block (pauseScreen.js) lists the last DEBUG.historyLen = 8 notices from a shell ring (main.js noticeHistory — §22.4, never game.state), fed by the new drainNotices() the render loop calls: one entry per queued notice, a broadcast once, a seat notice tagged P2, stamped with sim time m:ss; resetContract empties it; the block is hidden when the ring is. Escape typed over it still resumes.
- **Hints**: shell.hints disarms M5's stall-hint system at the source (it neither counts nor fires while off: 1830 idle frames = 30 500 ms queue nothing) and interact.js _roomHint returns '' (interact.hints), so the prompt names the object alone. On again, the room suffix returns and the hint fires once per run.
- **Colour-independent tokens, always on** (§26.5): every notice now begins with its kind's glyph (info → good ✓ damage ✗ warn !; hud.js NOTICE_GLYPHS, shared with the pause card), the cargo band reads 'secure [ok]' / 'mostly secure [!]' / 'LOOSE [!!]', the route bar label reads 'driving' between events (was 'on the road'), the phase word is text.

**Tests.** NEW tools/m27-access-tests.js: ALL-PASS 128 (A1 reduced HUD 17, A2 high contrast 22, A3 tokens 15, A4 history 29, A5 hints 16, A6 persistence 14, A7 ?hc=1 10, Z 5). m16 +5 (M19-1..5; U2's consumer map and V4's fixture extended): ALL-PASS 138. m15 +7 (M19-1..4a): ALL-PASS 115. Regressions m0 132, m11 177, m12 127 ALL-PASS, untouched. Syntax gate: 118 files, 0 errors.

Measured:
- High contrast: contract panel background rgba(23,21,34,.78) → alpha 1.0; border 1 px → 2 px; text rgb(255,255,255) on rgb(23,21,34) = 18.0:1 (WCAG, computed from getComputedStyle); label spans opacity .65 → 1; the objective, cargo and notice panels also alpha 1 / ≥ 2 px / ≥ 7:1.
- Layout invariance under .hc: the contract, objective, cargo and notice rects are unchanged within 0.5 px (2 px border paired with 1 px less padding); m11 O5's centre-clear predicate holds in normal, reduced and high-contrast states.
- styles.css after the change: 69 font declarations, 69 scaled by --ts (m16 U1e/U1g still exact).
- Objective history: DEBUG.historyLen = 8; 7 notices across 301 frames → 7 rows with stamps equal to the sim clock at each drain; 200 raised → exactly 8 kept (n192..n199).
- Hints off: 1830 frames × 16.667 ms = 30500 ms of idle sim time (≥ CONTRACT.stallHintMs 30000) → 0 stall notices queued, stallHint.ms 0; on again with ms set 5 steps short → exactly 1 notice after 8 frames, still 1 after 120 more.
- Suites: m27 128, m16 138 (was 133), m15 115 (was 108), m0 132, m11 177, m12 127 — all ALL-PASS on the first run; ./tools/syntax-check.sh: 118 files, 0 errors.
- ?hc=1 screenshot (tools/shot.ps1 -Setup tools/_shot-hud.js -Query hc=1, deleted afterwards) eyeballed: opaque panels, white 2 px borders, white text on contract/objective/caption/help/stamp.

Deviations from the brief:
- Reduced HUD keeps an OVERTIME row (styles.css `.hud.reduced .contract .row:not(.manifest):not(.over)`). The brief says 'its other rows hidden'; hiding a cost that is being billed right now contradicts §2.2 ('overtime costs money and work continues') and §21.2. m27 A1j asserts it stays, A1k that the truck row does not. The brief's A1 fixture (elapsed 1 / estimate 18 min) is unaffected.
- The hints switch has TWO consumers, not three: there is no 'helper text' on the settlement questionnaire to silence. src/ui/questionnaire.js:22-31 carries only the §27.3 sentences verbatim with their scale anchors (which are §26.5 colour-independent tokens and must stay), and src/ui/invoiceScreen.js:134-140's copy-note describes what the Copy button does. Nothing was invented; the card's hints row names exactly what it does silence (stall hint + room suffix), and m27 A6d2 asserts that wording.
- Route bar label between events changed from 'on the road' to 'driving' (hud.js setRoute) so the route STATE's word is in the DOM as m27 A3f requires; no existing suite asserted the old label (grepped tools/), the objective line still says 'on the road — 42% there'.
- tools/m11-tests.js was listed under filesTouched but needed no edit: sections F and O pass unchanged against the new hud.js (F5/F6 regexes match 'secure [ok]' / 'LOOSE [!!]', F7/F8 match glyph-prefixed notices). Left untouched rather than adding a section the brief did not ask for.
- The settings rows sit in a NEW 'Reading the screen' group (ROWS.access) rather than inside Display — same row shape, m16 U2's walk finds them (U2 'exactly one control per consumer' passes with the three added to its map).
- ?hc=1 overrides the LOADED shell value (shell.highContrast = true at boot) rather than living beside it, so the card's checkbox shows the truth and a player can turn it off; the cost is that any persist() in that session writes highContrast:true. Recorded in the KNOWN_ISSUES note.

### M20

### M20 — Consistency pass: the aim ray ignores the shake, reattaching costs what removing cost, and the cab prompt's count is the invoice's — 2026-09-05

**Hypothesis.** Three reviews this session recorded small inconsistencies as open items because each sat one file outside the milestone that found it: (1) M16 — GripSystem.aim() read the shaken camera's position for the ray origin, so for up to settleMs (600 ms) after a jolt a grab could start up to maxOffset (0.12 m) from where the player aimed; (2) M8 — taking the couch's legs off billed 60 s and Q put them back for nothing ('Reattaching is free'); (3) M13 — the cab's Q prompt priced the rows that were AWAY while the invoice billed every undelivered row, so a box still on the truck made the settlement one item (60.00) larger than the prompt promised. None is big; together they are the 'explicit, not undermining' class §25.3 wants closed before external testers read prices off the screen (§4.4, §8.2, §15.1, §26.1, §26.5).

**What changed.**
- `src/render/camera.js`: `unshakenEye()` — the boom solve (follow lerp, occlusion probe, floor clamp) remembered in `_baseEye` before the M16 offset lands; when the last update applied no offset it is camera.position itself. `src/player/grip.js`: `aimOrigin()` reads it (camera.position fallback for a rig without the method) and `aim()`'s camOrigin is that — the shake moves what you SEE, never where the ray STARTS; the direction was never touched (m24 K6/K6b). interact.js's probe already took its origin from grips.aim(), so the interaction ray follows without a code change.
- `src/tools/tools.js`: `reassemble()` returns `{ restored, piecesRemoved, seconds, reversible }` — the entry's seconds × TOOLS.screwdriver.timeScale, the number disassemble() charged; 0 when forced (a reset bills nothing) or when the entry is authored `reversible: false`. It does NOT refuse a non-reversible entry: the refusal is the player's, at the prompt, because reassemble() is also the reset's way back (main.js forces it in the boot-time unwind and calls it plain in the replay reset, then clears removedParts). `partStatus()` carries `reversible` and `seconds` off the same entry so the prompt, the refusal and the notice read one record.
- `src/player/interact.js`: Q's reassembly bills `r.seconds × 1000` through the same `chargeWorkMs` hook M8 wired for disassembly (labour clock + the phase's §27.4 line; never in BRIEFING/SETTLEMENT); the Q line reads 'put the legs back on — 60 s' and the notice 'legs back on — 60 s'; a non-reversible entry reads 'the legs cannot be put back', Q says the same and does nothing (the M12 refusal's shape); PART_CHANGED restored carries `seconds`. New `settlement()` prices what settling now will bill from `tripStatus()`'s `notDelivered`/`notDeliveredIds`, and new `_settle()` is the ONE call both keys make — Q with rows away, E with nothing away — so the SETTLEMENT phase event carries `{ leftBehind, away, inTruck, atSite }` and the notice names the count from either key: 'settling up — 22 not delivered (1 still on the truck)', or the bare 'settling up' when nothing is undelivered. The Q line: 'settle up — 22 not delivered (1320.00), 1 still on the truck' (', N here but not yet in a room' for at-site rows); the E line with nothing away: 'finish the job and settle up' bare, or '… — 1 not delivered (60.00), 1 still on the truck'.
- `src/contract/manifest.js`: `undeliveredRows(rows)` — THE definition of 'left behind' (required rows not delivered, whatever their whereabouts; DELIVERED itself — MANIFEST.dwellMs of settled dwell — untouched); `tripStatus()` iterates it and adds `notDelivered` + `notDeliveredIds`, so away + inTruck + atSite === notDelivered by construction. `src/contract/invoice.js`: `itemsLeftBehind(state)` is now that function over state.manifest — the LEFT_BEHIND line, reconcile() and the prompt cannot disagree.
- Tests: m24 K6c/K6d (the former state-purity K6c-e are K6e-g); m11 P2d rewritten deliberately from 'reassembly charged nothing' to 'bills the same 60 s', and a new section 'M20' for the non-reversible half (label, Q, 0 ms, and the plain reassemble() the replay reset relies on); m21 T3b/T3c (the prompt and the invoice-on-this-state), T3d (the on-truck Q PRESSED for real on a fifth leg after T8's replay), T3e (E with nothing away, at the tripStatus/setPhase seams), T8's bare line pinned, T9 five legs; m6 E15k.

**Numbers.** 50 mm nudge: camera.position 50.00 mm off the shake-free twin, grips.aimOrigin() 0.000 µm off it; a mid-nudge probe and grab land 0.014 mm from the rest grab. At rest aimOrigin() === camera.position (distance 0). Legs off +60000 ms, legs on +60000 ms; over off/six frames/on both elapsedWorkMs and phaseMs.pickup read 2 × 60000 + 100.000 ms — never twice; a non-reversible entry bills 0 and a plain reassemble() still restores 0.85 m. Cab, box 2 on the truck at the destination, Q pressed for real: away 21 / inTruck 1 / notDelivered 22 → the sheet's LEFT_BEHIND is −1320.00 citing 22 rows including the on-truck row, deep-equal to the ids the line priced before the key; the SETTLEMENT event carries 22/21/1/0; reconcile() ok; T6's 21 / −1260.00 unchanged. m21 drives 9350 game.frame() calls (5 × 1681 + 945 fixture) in 32 s of sim.

**Suites.** m2 75, m3 65, m4 62, m6 119, m11 180, m12 127, m21 157, m24 112, m23 131 (sweep 40 sessions, 0 failing) — ALL-PASS, re-run against the final build. m20 89: one FAIL, P2i's exact pin of 'put the legs back on' (now '… — 60 s'); one-line test update at integration.

**Found on the way.** A one-pass 'aim from the camera' fixture misses a 0.5 m box from 5.5 m: dipping the pitch raises the eye (−0.30 → −0.44 rad lifts it 0.52 m) and the ray passes 0.99 m up at the box's near face; m24's fixture iterates ten passes to the fixed point. And a refusal inside reassemble() would have stranded main.js's replay reset (it calls reassemble() plain, then clears removedParts) — the reviewer caught it; the refusal lives at the prompt.

Measured:
- This pass (2026-09-05 01:13-01:25): every M20 file's mtime predates the pass (interact.js 01:01:35, tools.js 01:01:12, m11-tests.js 01:03:05, m21-trips-tests.js 01:04:06; the rest 00:24-00:36) and the shared main.js (00:27) / config.js (00:24) were not touched by anyone since — the re-run is against exactly the build the reviewer read. Syntax gate over the 10 M20 files: checked 10 file(s); 0 with syntax errors. Nine suites re-run on ports 8661-8683: m2 75, m3 65, m4 62, m6 119, m11 180, m12 127, m21 157, m24 112 ALL-PASS; m20 88 of 89 (P2i only). No _smoketest-*.html left in the repo root or tools/ after the runs.
- The label literal: interact.js:388 prints `put the ${part} back on — ${st.seconds.toFixed(0)} s` with an em dash (bytes E2 80 94 = U+2014, checked with od); TOOLS.screwdriver.timeScale is 1 so the string P2i receives is exactly 'put the legs back on — 60 s'. The harness console renders the dash as '-' in its FAIL line; the file has U+2014.
- Real on-truck settlement (m21 T3d): box 2 loaded at the destination after 54 frames; away 21 / inTruck 1 / atSite 0 / notDelivered 22; LEFT_BEHIND −1320.00 citing 22 row ids including box 2's, deep-equal to the 22 ids settlement() priced before the key; reconcile() ok; SETTLEMENT event leftBehind 22, away 21, inTruck 1, atSite 0; notice 'settling up — 22 not delivered (1 still on the truck)'. Fifth leg 1681 frames; the suite drives 9350 game.frame() calls (5 × 1681 + 945 fixture) and 32117 ms of sim since the T3d replay, inside the 240 s budget.
- E-side settlement (m21 T3e): 'finish the job and settle up — 1 not delivered (60.00), 1 still on the truck' → 'settling up — 1 not delivered (1 still on the truck)' 1/0/1/0; 2 at the site → '… — 2 not delivered (120.00), 2 here but not yet in a room' → 'settling up — 2 not delivered' 2/0/0/2; 3/1/2 → Q 'settle up — 6 not delivered (360.00), 1 still on the truck, 2 here but not yet in a room' → 'settling up — 6 not delivered (1 still on the truck)' 6/3/1/2; nothing undelivered → the bare strings, leftBehind 0. T8's real E with everything delivered prints the bare 'finish the job and settle up'.
- Non-reversible entry (m11 section M20): label 'the legs cannot be put back', Q bills 0 ms and leaves the collider at 0.77 m; a plain reassemble() then restores 0.85 m with reversible false and seconds 0 — the replay-reset path main.js:1503 takes.
- Reattach billing (m11 P2d): legs off +60000 ms, six frames +100.000 ms, legs on +60000 ms; elapsedWorkMs and phaseMs.pickup both 2 × 60000 + 100.000.
- Aim origin under shake (m24 K6c/K6d): camera moved 50.00 mm, aim origin 0.000 µm off the un-nudged solve, mid-nudge hit point 0.014 mm and grip point 0.014 mm from the rest grab; at rest aimOrigin() === camera.position (distance 0).
- Suite deltas against docs/CHANGELOG.md's last 'Checked' line (m6 116, m11 168, m21 104, m24 101): m6 +3, m21 +53, m24 +11; m11 reads 180 but is shared with M19, so its delta is not M20's alone — recompute README :258's '2459 assertions across twenty-seven suites' from the files, not from these numbers.

Deviations from the brief:
- The review's single remaining violation (major, tools/m20-tests.js:242 P2i) is NOT resolved by an edit, deliberately: the file is outside M20's filesTouched (rule 1: never touch another test file, even to help), the fixer instruction is 'within the same file ownership', and the review routes it as 'ORCHESTRATOR one-liner … Do not re-spawn the M20 fixer for this'. The only in-ownership change that would turn P2i green is dropping the price from the label, which reverts the brief's scope (2) ('the undo label carries the cost'). The priced label stays; the exact one-line test change is in blockers. This pass therefore made zero code edits — its work was re-verifying the build the reviewer read (syntax gate + 9 suites) and correcting docsNotes.readme, which the reviewer found inaccurate (README carries only one of the three limitation lines it asked to remove).
- Carried from the first fixer pass, unchanged: (violation 2) _useCab's E press with nothing away goes through the same _settle() as Q; (violation 3) tools.js reassemble() no longer refuses a non-reversible entry — the refusal lives at the prompt only, because main.js:1503's replay reset calls it plain and then clears removedParts; (violation 4) m21 T3d presses the on-truck Q for real on a fifth leg and T9 is restated to five legs; (violation 5) the non-reversible block is its own m11 section 'M20' with the P2d ids kept per rule 6. The brief's 'T6 (22 away, 1320.00)' was wrong as the reviewer noted — T6 is 21 / −1260.00 and untouched.
- Carried from the implementer: interact.js's probe needed no code change (it reads camOrigin from grips.aim()); K6c/K6d took the brief's names and the former state-purity K6c-e are K6e-g; the SETTLEMENT payload shape changed (nothing else in src/ reads validation.leftBehind); the E label 'finish the job and settle up' carries the price words only when something is undelivered.
- m23-softlock-tests.js was not re-run this pass (not in the rerun list I was given); its result is the first fixer pass's and the reviewer's own re-run (ALL-PASS 131, 0 of 40 sessions failing) against this same build — no M20 file changed since.

## Phase 23 — Phase 11 build side, batch 8: three packs, three drives, and rebind any action — 2026-09-05

Phase 11's build side (GDD §25.2: onboarding, settings, instrumentation, fixes), from the ordered plan in docs/PHASE11_PLAN.md. Each milestone was built by a file-owned implementer and adversarially reviewed against its brief; the numbers below are the ones the reviews reproduced.

**2459 assertions across 27 suites, all passing.**

### M17

### M17 — Three packs, three drives — §26.3 proven with numbers, and the pack-quality curve tuned so they differ on screen — 2026-09-05

GDD §26.3 ('Three different pack arrangements yield observably different turn, brake, and bump results'; 'A tensioned strap reduces relative motion and damage'; 'Unsecured tall/heavy cargo can tip or slide for visible reasons'), §11.3 road events, §10.2 pack quality, §12.2 bad packing has understandable consequences, §27.5 tuning.

**Hypothesis.** m8 measured two arrangements over one route; nothing asserted that a heavy item high or loose behaves differently from the same item low and strapped, that a turn does anything a brake does not, or that the §10.2 number predicts the shift. Drive THREE arrangements of the same six items (fridge 110 kg, dresser 55, television 22, three 9 kg boxes) through the whole route with game.frame(), sample the load at every ROAD_FORCE and at the arrival, and make the numbers differ.

**Touched.** config.js TRUCK.roadEvents (each event gains its composition `accel`; the turn's lateral fraction 0.8 → 1.0, severities untouched) and CARGO.quality (three weights); truck.js roadEventForce reads the composition from config (the 0.8/0.55 literals are gone); cargo.js packQuality() returns heightFraction, runUpFraction and ONE number `quality`; runLog.js counters.shiftByEvent {hardBrake, sharpTurn, speedBump} on the run summary; main.js a ROAD_FORCE observer that opens a positions window per event and closes it on the next event or the arrival; m17 R2/R2f; m8 A-M17 (A10-A12); NEW tools/m25-packs-tests.js (80 assertions, 7034 frames).

**Measured, the same six items, the full 28 s route each:**

| pack | §10.2 quality | HUD band | brake | turn | bump | route worst | fridge tilt | property | items |
|---|---|---|---|---|---|---|---|---|---|
| LOW — heavy in the headboard corner, light on top and behind, everything strapped | 1.000 | secure | 0.009 m | 0.030 m | 0.000 m | **0.030 m** | 0.0° | none | none |
| TALL — fridge upright against the headboard with open deck beside it, three boxes stacked in the far corner, TV on the dresser, unstrapped | 0.298 | LOOSE | 0.045 m | **0.577 m** (x) | 0.000 m | 0.577 m | 30.8° max, 26.6° at rest, leaning across the box | none | TV 100→92 |
| SLIDE — nothing stacked, nothing strapped, dresser and TV forward, fridge upright with 1.8 m of open deck ahead | 0.199 | LOOSE | **1.512 m** (z) | 0.158 m | 0.000 m | 1.520 m | 90.0° | **truck headboard holed, 400.00** | fridge 100→77 |
| SLIDE + two straps crossed over the fridge | 0.664 | LOOSE (49%) | 0.075 m | 0.113 m | 0.000 m | 0.135 m | 0.7° | none | none |

The §10.2 number orders the packs the way the route punished them (LOW > TALL > SLIDE, Spearman 1). The M6 counters carry the same metres per event to the millimetre (K8). The turn's composition went 0.8 → 1.0 × brakeForce because at 0.42 g it moved nothing upright — deck 0.32 averaged with a fridge's 0.48 is 0.40 g, a box's 0.52 g — so an unstrapped fridge against the headboard rocked 1.0° and slid 0.000 m; at 0.53 g it slides 0.577 m and leans. m8's two-arrangement numbers under it: GOOD 0.470 m (unchanged), BAD 2.611 m (was 2.615). m7's one-brake figures unchanged (unstrapped 1.645 m, strapped 0.141 m). m21's 28000 ms legs untouched.

**Checked.** m25 80, m8 43, m9 41, m10 51, m11 168, m14 39, m17 106, m21 104 — plus m0 132, m7 53, m12 127, m22 88, m24 101. All passing.

**Not as briefed.** K4's tilt is asserted > 25°, not > 45°: a 1.75 m fridge tipping sideways in a 2.10 m box meets the far wall at asin((2.10 − 0.70 − slide)/1.75) — 53° with no slide, 28° after the 0.57 m it slides; a fall past 45° is only possible along the box, which is SLIDE's brake. TALL's fridge stands against the headboard, not at the tail: unbraced at the tail it falls on the brake (measured 90.0°, 1.746 m) before any turn.

Measured:
- Three packs, full route each (1681 frames): LOW worst 0.030 m (brake 0.009, turn 0.030, bump 0.000), fridge tilt 0.0°, no damage; TALL worst 0.577 m on the turn along x (brake 0.045, bump 0.000), fridge tilt max 30.8° / 26.6° at rest, TV 100→92, no property line; SLIDE worst 1.520 m on the brake along z (brake 1.512 with Δ=(−0.00, −0.53, 1.42), turn 0.158, bump 0.000), fridge tilt 90.0°, 'truck headboard holed' 400.00 by the fridge, fridge 100→77.
- SLIDE with two crossed straps over the fridge: worst 0.135 m (a box, brake 0.075 / turn 0.113), fridge moved 0.008 m at 0.7° tilt, no property line, no item damage.
- packQuality().quality before departure: LOW 1.000 (0% unsecured), TALL 0.298 (100% unsecured, height 0.37, run-up 0.18), SLIDE 0.199 (100%, height 0.30, run-up 0.42), SLIDE+2 straps 0.664 (49%, 0.07, 0.14). HUD bands: secure / LOOSE / LOOSE / LOOSE.
- Turn composition 0.8 → 1.0 × brakeForce: at 0.8 (0.42 g) an unstrapped upright fridge against the headboard rocked 1.0° and slid 0.000 m on the turn, the boxes/dresser/TV 0.00 m — the turn moved nothing upright (deck 0.32 averaged with the fridge's 0.48 = 0.40 g; box 0.52 g; dresser 0.50 g; TV 0.435 g). At 1.0 (0.53 g) the fridge slides 0.577 m and leans 30.8°.
- m8 under the new composition: GOOD 0.470 m (unchanged), BAD 2.611 m (was 2.615), 2 damage lines $6.40, worst condition 85. m7's one-brake figures unchanged: unstrapped 1.645 m, strapped 0.141 m (the brake's composition is identical: accel z 1.0 × severity 1.0).
- Sideways-fall geometry: a 1.75 m fridge's top meets the far wall of the 2.10 m box at asin((2.10 − 0.70 − slide)/1.75): 53.0° with no slide, 28.2° after the 0.57 m it slides at 0.53 g; measured peak 30.8° mid-slide. The same fridge unbraced at the tail on the brake: 90.0° and 1.746 m forward (probe variant TALL_TAIL).
- Strap on a 9 kg box is explicitly damped past stability: STRAP.damping 1400 × dt (1/60) / 9 kg = 2.6 > 2. Probe: a taut-strapped box on the dresser top was thrown 1.45 m backward (−z) and 0.81 m down during the brake; the fridge (110 kg, ratio 0.21) and dresser (55 kg, 0.42) are fine; the TV (22 kg, 1.06) marginal.
- Budget: m25 drives 7034 game.frame() calls (4 legs + 310 fixture frames) — inside the harness budget; wall time ≈ 2 min per run.

Deviations from the brief:
- K4 asserts a sharpTurn tilt > 25° (measured 30.8° peak, 26.6° at rest), not the brief's > 45°: a sideways fall of the 0.70 × 1.75 m fridge (src/objects/definitions.js:467) inside the 2.10 m-wide box (src/world/truck.js CARGO_BOX width 2.10) meets the far wall at asin((2.10 − 0.70 − slide)/1.75) — 53° with no slide, 28° after the 0.57 m it slides at 0.53 g on the 0.40 deck. Measured at accel 1.0 and 0.9 alike (30.9°/31.4°). A fall past 45° is only possible along the box's length, i.e. forward on the brake — which SLIDE's fridge does (90.0°, holes the headboard). The suite prints the bound beside the measurement.
- TALL's fridge stands against the HEADBOARD, not 'at the tail': an unbraced upright fridge at the tail falls forward on the FIRST event, the brake (probe TALL_TAIL: 90.0° tilt, 1.746 m forward, within the brake window), so it cannot 'tip on the turn or the bump' as K4 asks; against the headboard it survives the brake (0.2° tilt) and tips on the turn. Same reason SLIDE's fridge is the one with open deck ahead of it — 'heavy at the headboard end' is the dresser (and the TV against its back); the fridge needs the 1.8 m lane to be the > 1.0 m story.
- The road events' composition lives in src/world/truck.js:172-182 roadEventForce (the 0.8 and 0.55 were literals there), not in src/drive/route.js as the brief's scope (3) names. truck.js is not in filesTouched; it received ONE surgical hunk (roadEventForce reads TRUCK.roadEvents[type].accel) so there is a single source of truth for cargo.js, main.js's M16 shake observer and the suites. Nothing else in truck.js changed.
- K5's second clause ('no two packs share the same worst event AND the same axis') is asserted on the story form: a pack whose route-worst is below CARGO.shiftToleranceM (0.25 m, the game's own 'moved' threshold) reads 'held'. LOW's raw worst is sharpTurn/x at 0.030 m — noise that would collide with TALL's sharpTurn/x; the raw value is printed and the two packs that moved are asserted to differ in event AND axis.
- Scope (5) 'the invoice stats … carry worstCargoShift per event': contributionStats lives in src/contract/invoice.js and the sheet's rows in src/ui/invoiceScreen.js, neither in filesTouched. The run summary (runLog.js buildRunSummary counters.shiftByEvent) carries it; the invoice stats do not — see orchestratorNotes.
- K7's 'm11 D pattern': straps are placed through straps.attach (the m8 buildPack fixture), not the keyboard path, and CROSSED over the top (anchor_L0 → the fridge's +x rear top corner, anchor_R0 → its −x one). Straight straps from an anchor to the near corner have no lateral component: the probe's first K7 attempt let the fridge slide 0.487 m sideways on the turn — 13 mm inside the 0.5 m limit, not a pass worth keeping.
- LOW's four light items are strapped with 20 mm of slack (inside CARGO.securedSlackM 0.05, so they count as restrained and the pack reads 0% / 'secure') and wedged so the straps never load: a taut strap on a 9 kg box is explicitly damped past stability (c·dt/m = 2.6 > 2) and the probe measured such a box thrown 1.45 m off the dresser during the brake. The fridge and dresser are strapped taut.
- packQuality()'s HUD consumer (src/ui/hud.js setCargo) is outside filesTouched, so the HUD still shows '% unstrapped' + band; the scalar `quality` is on the heuristic object the HUD, canDepart() and audioWorld already receive. K6's band clause passes on the existing words (secure vs LOOSE).

### M18

### M18 — Rebind any action: §21.4's 'full remapping' on the settings card, validated by the conflict checker, per seat, persisted as diffs — 2026-09-04

GDD §21.4 Accessibility baseline, Input row ('Full remapping, hold/toggle grip, sensitivity/deadzone, invert axes' — the first item was the last one missing); §21.2 'a retry keeps settings'; §4.4 controller parity; §26.5 'both input mappings'; §26.6 'save/settings reject incompatible versions safely'.

**Hypothesis.** Bindings were already data (SEAT_BINDINGS), bindingConflicts() already validated a table, glyphFor (M5) already derived every prompt and the help line from the live table, and the settings card (M4) already persisted a schema-gated blob — so a remapper is UI over seams that exist, and a remap must redraw the prompts, the help line and the save with no second table to drift.

**What changed.** `config.js`: new `INPUT.remap` (captureTimeoutMs 8000; reservedKeys Escape, F3, COOP.joinKey; lockedActions pause, debug; token caps). `input.js`: bindingConflicts() now also reports two ACTIONS of one seat on one key/mouse/pad token; a pure remap layer — parseToken, reservedReason, tokenLabel, cloneBindings, bindingDiff (per source class, explicit [] when a class is cleared), bindingDiffCount, applyBindingDiff (drops unknown seat/context/action, malformed or reserved tokens, locked actions and any entry that would conflict, with reasons), rebindTable (a key or mouse token replaces the keyboard-and-mouse class, a pad token the pad class, so parity survives a remap); Input.rebind/resetBindings/applyBindings/bindingTable/bindingDiff (a diff-less table installs the frozen SEAT_BINDINGS itself; resetBindings(seat) re-applies the other seats' diffs and drops what no longer fits), Input.beginCapture/endCapture (the next press of any device goes to the capture instead of the game; the captured keydown AND its keyup are swallowed before the title, the shell's F3/F2 and the pause path see them; the timeout counts down in poll() on the frame clock, so it runs under the pause card), glyphOf(def, device). `save.js`: seventh section `bindings` — the DIFFERENCES from this build's defaults, sanitised through applyBindingDiff with one console.info per load naming what was dropped and why. `settings.js`: a Controls group — 34 rows (16 seat 0 + 18 seat 1 on-foot actions, pause/debug fixed), two chips per row from the live table, Rebind (capture: 'press a key…', Esc cancels, refusals shown on the row naming the other action or the reserved keys), Reset per seat, Defaults resets bindings too. `main.js`: applies the saved diff at boot, persists the diff on every save, and the store's rebind/resetBindings redraw the help line. `styles.css`: the Controls rules, all font sizes on --ts.

**Checked.** New tools/m26-rebind-tests.js **192 ALL-PASS**: rebind interact→F → KeyF isDown, KeyE not, glyphFor 'F', the reticle chip 'F' after one feedHuds, the help line 'F use'; W refused naming moveForward with the table deep-equal before/after; seat 1 taking E refused as 'seat 0 interact and seat 1 interact', seat 1 Mouse0 refused ('only one mouse'); Escape/F3/F2/View 'reserved', pause/debug 'locked'; P0B4 refused because LB is brace's, then (brace on L3) accepted — a stubbed Standard Gamepad holding button 4 grips, LT no longer does, glyph 'LB'; after exactly two rebinds the blob holds exactly two per-class diffs ({interact:{keys:['KeyF']}, gripLeft:{pad:[10]}}), a fresh Input loads them and still has X and LMB from the defaults; a hand-edited blob with 6 bad entries loads without a throw, keeps the clean one, logs once; schema 0 → {}; resetBindings(0) deep-equals DEFAULT_BINDINGS and the seat's diff is empty; the reset hole (seat 0 off E, seat 1 takes E, seat 0 resets) drops seat 1's E back to Quote and reports it; the card: click Rebind → 'press a key…', KeyG on window → G in the row and the table, the game never sees KeyG (not down, not pressed, no release edge, no shell edge), Esc cancels without closing the card or pausing, the timeout closes it between 479 and 482 frames (7983-8033 ms), W refused on the row naming 'Move forward', F3 refused as reserved AND the overlay untouched, MMB captured from a window mousedown, L3 captured through the real gamepad poll, a seat-1 row captured from the seat-0 pad lands on seat 1; Done + Escape still pauses and pad Menu still pauses (m15 P5). m16 **133** (+13: every one of the 31 rebindable rows moves the live table with zero inert; Defaults returns the frozen table), m0 **132** (+6: the shipped tables are frozen, a fresh Input reads them by identity, rebind installs a clone), m11 168, m12 127, m15 108 — all ALL-PASS. ./tools/syntax-check.sh: 115 files, 0 errors.

Measured:
- Capture timeout INPUT.remap.captureTimeoutMs 8000 ms on the frame clock: open after 479 × 16.667 = 7983 ms, closed after 482 = 8033 ms
- Controls card 34 rows, 3 fixed, 31 rebindable; m16's walk rebinds all 31 from a 32-code pool, save holds 31 diffs, 0 after Defaults
- Blob after two rebinds: {"0":{"foot":{"interact":{"keys":["KeyF"]},"gripLeft":{"pad":[10]}}}} (2 entries); the untouched pad X / mouse LMB come from the build's defaults on load
- At-target listener order, HeadlessChrome 152: an event dispatched ON window runs window listeners in registration order; one bubbling up from an element runs the capture listener first — both paths swallow the captured key
- Suite totals: m26 192 new; m0 126 → 132; m16 → 133; m11 168, m12 127, m15 108 unchanged

Deviations from the brief:
- P0B4 (LB) is brace's in the shipped table, so B5 first asserts the refusal naming brace, moves brace to L3, then lands gripLeft on LB; B6 restarts from the defaults so 'exactly two diffs' is a measured 2
- B3's KeyE probe restores seat 0's interact to E first (B1 had moved it to F)
- The timeout runs on the frame clock (the sim clock is frozen under the pause card the card opens from)
- Diffs are per source class with explicit []; the card's chips use glyphOf (no cross-device fallback); rows carry data-bind, not data-setting (m16 U2 unchanged; the rows' walk is M18-U2h..U2t); COOP.joinKey is reserved beside Escape/F3; pause and debug are locked; only the on-foot context is listed (DRIVE is never entered); resetBindings(seat) goes through applyBindingDiff

Measured:
- m26: 192 assertions ALL-PASS; the whole run (boot + suite, incl. 482 capture-timeout frames) well inside the 240 s virtual budget
- Capture timeout INPUT.remap.captureTimeoutMs = 8000 ms on the frame clock (Input.poll's ms, capped at SIM.maxFrameMs): still capturing after 479 frames × 16.667 = 7983 ms, closed after 482 frames = 8033 ms (m26 B8l/B8m)
- Controls card: 34 rows = 16 seat-0 + 18 seat-1 on-foot actions; 3 fixed (P1 pause, P1 debug, P2 pause); 31 rebindable — m16 M18-U2l rebinds all 31 from a pool of 32 unbound codes with zero inert rows; the save then holds exactly 31 diffs and 0 after Defaults
- Save blob after two rebinds: {"0":{"foot":{"interact":{"keys":["KeyF"]},"gripLeft":{"pad":[10]}}}} — 2 entries, per source class; the untouched pad X and mouse LMB are NOT stored and come from the build's defaults on load (m26 B6b, B6f1, B6f2)
- Hand-edited blob with 7 entries → 1 kept, 6 dropped (unknown action, self-conflict, reserved, locked, cross-seat conflict ×2), exactly one console.info (m26 B6g-B6i); applyBindingDiff on a 7-entry crafted diff drops 7 with reasons 'bad token,conflict,conflict,locked,reserved,unknown action,unknown seat' (A7a)
- At-target listener order, HeadlessChrome 152 (probe, then removed): an event dispatched ON window fires window listeners in REGISTRATION order (bubble-first-registered → capture-second-registered); one dispatched from body fires the window capture listener first. Both paths are handled (Input's first-registered keydown/keyup + the card's capture-phase listeners); m16's U0g comment already recorded the on-window case
- Shipped tables carry no intra-seat duplicate tokens: bindingConflicts() with the extended checker is still [] (m26 A6, m12 A1)
- Suite totals: m26 192 new; m0 126 → 132 (+6); m16 133 (+13); m11 168, m12 127, m15 108 unchanged; ./tools/syntax-check.sh: 115 files, 0 errors
- Reset-hole reproduction (m26 B7g-B7m): before the applyBindingDiff-based reset, seat 0 interact→F, seat 1 interact→E, resetBindings(0) left BOTH seats on KeyE and the next rebind(0,'foot','jump','KeyM') was refused (observed as B7d 'Space' in the first run); after the fix seat 1 drops to Quote, dropped=[{seat:1, reason:'conflict'}], KeyM accepted

Deviations from the brief:
- m26 B5: the brief's `rebind(0,'foot','gripLeft','P0B4') → ok … glyph 'LB'` is not possible against the shipped table — P0B4 is PAD.LB and DEFAULT_BINDINGS.foot.brace.pad = [PAD.LB] (src/core/input.js:59; m0 B16 requires brace on a pad). Implemented as: B5-0 asserts that exact call is REFUSED naming brace (the pad-token conflict rule is real), B5-1 moves brace to L3 (P0B10), then B5 lands on LB with the stubbed pad, isDown and glyph 'LB' as briefed.
- m26 B6 'after two rebinds … exactly two diffs': because B5 needed three (interact, brace, gripLeft), B6 resets to the defaults and makes exactly two rebinds (interact→KeyF, gripLeft→P0B10 L3, a free button) so the count is a measured 2, not 3.
- m26 B3: the brief's `rebind(1,'foot','interact','KeyE')` is only a conflict while seat 0 still has KeyE; B1 had just moved it to KeyF, so B3-0 restores seat 0 to KeyE first, probes, then B3d returns it to F. (First run: B3 succeeded and left a cross-seat clash that the reset hole then exposed.)
- Capture timeout runs on the FRAME clock (the ms Input.poll receives from game.frame, capped at SIM.maxFrameMs), not sim time: the card opens from the pause card, and the sim clock refuses to step while paused (src/core/clock.js:48; game.js frame() polls input unconditionally before clock.advance). m26 B8l/B8m drive it through game.frame(16.667) — 479 frames still open, 482 closed — and B8p records the game running. Recorded in config.js INPUT.remap comment.
- The capture swallow lives in BOTH Input (keydown/keyup on window, registered first at boot main.js:139) AND the card's capture-phase window listeners, because an event dispatched ON window has no capture phase and runs window listeners in registration order (measured; m16-tests.js:348-353 comment already says so), while a real keyboard event bubbles up from the focused element where the capture listener runs first. Whichever runs first handles the key and stops propagation; the other never sees it. The brief's 'swallow from the pause/title listeners' holds on both paths (m26 B8t F3 never toggled the overlay; B9c-B9e Escape never paused).
- resetBindings(seat) is NOT a splice: it re-applies the other seats' diffs through applyBindingDiff and drops what the reset makes a conflict (returns {dropped}). A spliced reset left a conflicting live table (found by a node probe while chasing B7d) and every later rebind was refused for a phantom conflict. m26 B7g-B7m pin it.
- Diffs are per source CLASS (keys / mouse / pad) with an explicit [] for a cleared class, not whole-action sources: 'only the differences' literally, so a later default change to the pad half of an action whose key the player moved still wins (m26 B6b, B6f1/f2, B8y1-y3).
- The card's chips derive from the new glyphOf(def, device) (the per-device half of glyphFor, no fallback) rather than glyphFor itself: glyphFor falls back to the other device so a prompt is never blank, which on a remap card would print 'B' under the keyboard heading for the pad-only 'drop'. glyphFor is unchanged in behaviour (m12 K1-K4 green) and is refactored over glyphOf, so it is the same derivation (m26 B1c/B1c1/B5c assert glyphFor over the live table).
- Controls rows carry data-bind, not data-setting: m16 U2 asserts one data-setting control per consumer and per DEFAULT_SETTINGS key, so bind rows there would have broken U2/U2a. The consumption walk for the rows is the new m16 M18-U2h..U2t section (31 rows, zero inert), and M18-U2i asserts keys() is unchanged.
- Reserved tokens: COOP.joinKey (F2) is reserved beside Escape and F3 (the brief named Escape, F3 and the join button; the keyboard join is the same shell read at main.js:1478). Two shell ACTIONS are locked rather than rebindable — pause (Escape + Menu on every seat; the card closes on Escape) and debug (F3) — listed on the card as 'fixed' (config.js INPUT.remap.lockedActions; m26 B4e/B4f, D0b).
- Only the on-foot context is listed on the card: game.setInputContext has no caller outside game.js (the DRIVE table is never entered; the route is scripted). rebind/diff/save handle any context by name (m26 A7 'unknown context' path).
- bindingConflicts() was extended to report two ACTIONS of one seat on one key, mouse button or (seat-qualified) pad token, not only two seats — a remap needs that rule; the shipped tables have no such duplicate so m12 A1 stays [].
- Reuse: AirportBaggageCrew has no rebind/capture flow (grep 'rebind|remap|capture' in C:/Dev/AirportBaggageCrew/src → two comments only, input.js:4 and settings.js:9), so the capture flow is new to this project; the card rows/store shape are the existing M4 copy of ABC's settings panel.
- The HUD-chip half of m26 B1d aims mover 0 at the dolly (lookAt copied from m11) so describe() offers a primary and the prompt has a .key chip; feedHuds alone at boot has nothing under the reticle.

## Phase 22 — Phase 11 build side, batch 7: nothing you lose stays lost, and the camera shakes — 2026-09-04

Phase 11's build side (GDD §25.2: onboarding, settings, instrumentation, fixes), from the ordered plan in docs/PHASE11_PLAN.md. Each milestone was built by a file-owned implementer and adversarially reviewed against its brief; the numbers below are the ones the reviews reproduced.

**2333 assertions across 25 suites, all passing.**

### M15

### M15 — No soft locks — tools, leaves and pieces recover out of bounds mid-run, and a seeded sweep of the common verbs proves every session stays playable — 2026-09-04

GDD §26.6 ('No common sequence produces an unrecoverable soft lock'), §18.3 (out-of-bounds recovery, objects), §26.4 ('Stuck recovery preserves progress and consequences'), §2.2 (failure is a state, not a reset), §27.1 (automated tests), §27.2 (physics test scenes), §15.1 (the recovery fee), §22.5 (instrumentation).

**Hypothesis.** ObjectRegistry.step recovered a manifest object that left the world since Phase 5 and billed it since M6, but the four tools had no pass at all (KNOWN_ISSUES, Phase 17): a dolly knocked off the plot, a ramp dropped into the void or a screwdriver lost in the truck stayed gone until 'Run it again' — and a lost screwdriver is a soft lock for every disassembly and every door on the contract. Since Phase 20 the door leaves and the loose parts share the exposure, and nothing swept the common sequences for other locks. Give the tools the registry's pass through the existing detach calls, send a leaf and a piece back to the RIGHT place, let go before teleporting anything a hand is on, and prove it with a seeded sweep whose failures reproduce from their seed.

**What changed.** `config.js`: new `WORLD.groundSizeM` (200 — the square the physics ground is, now passed to addGround from main.js) and `RECOVERY.bounds` DERIVED from it (x/z ±100, floor objectFloorY −8, ceiling 100), `RECOVERY.toolFloorY` (−8), `RECOVERY.maxFrames` (240 grace steps + 10 = 250), and the sweep's `DEBUG.softlock*` (40 sessions from seed 20260904, 3 teleports each, 6–12 actions, the route driven in 3 sessions). `registry.js`: exported `safeTranslation` (a translation() that throws or is non-finite reads as null) and `isOutOfBounds`; `step` skips Fixed bodies (a hung leaf), recovers a non-finite body with no grace, and uses the bounds instead of the bare ±120; `recover` first calls `releaseHolds` (main.js → every mover's new `grips.releaseEntity(id, 'lost')`) when the body is held, then goes to `recoveryPose()` — a removed leaf to its authored REST pose (never its home: re-hanging is the player's Q), a piece to the slot a fresh disassembly would give it beside its parent's CURRENT AABB (`pieceSlots`), anything else to lastStable + lift; RECOVERY payloads carry `kind`. `tools.js`: every tool remembers its rack slot (`home`) and counts `recoveries`; new `ToolSystem.step(stepMs)` (registered as the 'tools' system after 'objects') applies the same floor/AABB/non-finite test and grace, and `recover(tool)` goes THROUGH detachDolly / removeBlanket / retrieveRamp / the new `dropCarried(tool, 'lost')` (TOOL_STATE 'dropped' with the reason; main.js forgets the carry on the mover) before re-racking the body Dynamic in the object group with one RECOVERY {toolId, entityId, reason, fee: 45, kind:'tool'}; `recoveryCount()` sums into main.js's tally, so the invoice, reconcile() and the recorder's counter all see a lost tool as a callout, and resetContract zeroes it per run. Debug overlay: a 'lost' row (recoveries this run by kind — movers/objects/fixtures/pieces/tools — from main.js `recoveriesByKind()`).

**Checked.** New tools/m23-softlock-tests.js **131 ALL-PASS** (L0–L8): each tool teleported to (0, −50, 0) is not rescued at half the grace (y −68.7) and is back on its slot within 250 frames — dolly (−2.400, 0.070, 8.999), blanket (−1.109, 0.050, 9.100), ramp (−2.301, 0.077, 10.701), screwdriver (−0.115, −0.000, 8.995) — |v| 0.0000, one RECOVERY each at 45.00; a dolly under the couch lost → the couch's friction and Average rule back BEFORE the dolly lands (detached precedes RECOVERY on the bus); a deployed ramp lost → retrieved, nothing at the lip, collider count unchanged; a held box → the grip tears first when stepped ('pulled out of reach') and is released with 'lost' through the pass, the mover never moves, no NaN anywhere; a carried screwdriver cannot be lost under game.frame() (the carry re-places it) and is dropped 'lost' by the pass alone; a removed leaf 20 m off the plot → its rest pose, hung false, Q still hangs it; a hung leaf teleported to the void is untouched; four legs lost after the couch moved 7.2 m → 0.62–0.80 m from the couch, 7.2–8.0 m from where they came off, a fragment likewise; the sweep: 40 sessions, 298 actions, 120 teleports (all out of bounds), 128 recoveries, 3 route legs (out, back — trip 2 — out), worst session 12 actions, **0 failing**, invariants (a) tools in bounds and true to state, (b) every row and every piece present and in bounds, (c) every leaf hung or in bounds, (d) the cab prompt reachable, (e) game.state round-trips with no non-finite number; settle() after it renders a recovery line equal to recoveryCount() × 45 with reconcile() ok; bounds enclose every spawn, rack slot, zone, the cargo box, the cab and the mover spawn by ≥ 5 m. 22972 game.frame() calls in 9.5 s wall. m6 **116** (+M15-1..4, G5), m11 **168** (+M15-1..4), m14 **39** (bodies 75 / colliders 75 / scene 330 / geometries 412 / textures 60 equal after runs 1 and 3), m0 126, m9 41, m10 51 — all ALL-PASS. ./tools/syntax-check.sh: 113 files, 0 errors.

Measured:
- Tool recovery from (0, −50, 0), 250 frames: dolly (−2.400, 0.108, 9.000) at maxFrames → rest (−2.400, 0.070, 8.999); blanket (−1.108, 0.045, 9.100) → (−1.109, 0.050, 9.100); ramp (−2.300, 0.088, 10.700) → (−2.301, 0.077, 10.701); screwdriver (−0.115, 0.002, 8.995) → (−0.115, −0.000, 8.995); midway y −68.7; |v| 0.0000; fee 45.00 each
- RECOVERY.maxFrames 250 (= ceil(4000 / 16.667) + 10); bounds ±100 m from WORLD.groundSizeM 200, floor −8, ceiling 100 (40 m/s straight up reaches 81.5 m)
- Pieces: legs recovered 0.80/0.62/0.62/0.80 m from the couch's current centre, 7.15/7.42/7.70/7.98 m from the disassembly spot; partStatus 0 missing afterwards
- Sweep: seeds 20260904..20260943; sessions 0/1/2 drive (2013/2086/2197 frames), the rest 272–429 frames; 22972 frames in the suite, 9.5 s wall for the whole run
- m14 unchanged: 75 / 75 / 330 / 412 / 60, 7074 frames

Deviations from the brief:
- mulberry32 is imported from src/core/rng.js — the project already carried the Chameleon/SomethingsDifferent copy under that name (INDEX: 'do not write a third').
- Tools are carried by the interaction system (kinematic carry), not a grip: a carried tool cannot be lost under game.frame() (asserted), the 'lost' release for a tool is TOOL_STATE 'dropped' reason 'lost' through the pass alone, and GRIP_ENDED 'lost' is the grip-held ENTITY path; with grips stepped the anti-ghosting tear fires first. game.frame() releases any test grip as 'released' (no key down), so grip paths use the m6 driver.
- RECOVERY.bounds derives from the physics ground (WORLD.groundSizeM), not a scene.js plot constant (none exists); the margin is ~95 m because m6/m11/m14 park fixtures 40–50 m off the houses — the y floor does the work.
- L1 asserts the rest height against the ground under the slot: the screwdriver rests at −0.000 because its authored slot lies inside the truck deck block (see KNOWN_ISSUES).
- Sweep invariant (a) checks the body type true to its state (kinematic when carried, Fixed when deployed); the cab verbs are placed at the start of the first three sessions rather than drawn, so M13's drive-back is exercised deterministically.

Measured:
- Tool recovery (m23 L1, teleport to (0,-50,0), 250 frames): dolly at maxFrames (-2.400, 0.108, 9.000) -> rest (-2.400, 0.070, 8.999); blanket (-1.108, 0.045, 9.100) -> (-1.109, 0.050, 9.100); ramp (-2.300, 0.088, 10.700) -> (-2.301, 0.077, 10.701); screwdriver (-0.115, 0.002, 8.995) -> (-0.115, -0.000, 8.995); midway y -68.7 for all four; |v| 0.0000 at rest; one RECOVERY each, fee 45.00
- RECOVERY.maxFrames = ceil(4000 / 16.667) + 10 = 250; RECOVERY.bounds = x,z ±100 m (WORLD.groundSizeM 200 / 2), minY -8, maxY 100; SIM.maxLinearVelocity straight up reaches 81.5 m
- m23 L5: legs recovered at (-34.53..-33.48, 0.04, 44.60): 0.80/0.62/0.62/0.80 m from the couch's current centre, 7.15/7.42/7.70/7.98 m from where they were unscrewed (couch moved (+6, +4) = 7.2 m)
- Sweep (m23 L6): 40 sessions, seeds 20260904..20260943, 298 of 386 attempted actions applied, 120 teleports all out of bounds, 128 recoveries triggered, 3 route legs (sessions 0/1/2: 2013/2086/2197 frames; other sessions 272-429 frames), worst session 24 with 12 applied, 0 failing
- Budget: m23 drives 22972 game.frame() calls; the whole smoketest run (boot + suite) is 9.5 s wall — far inside the 240 s virtual budget
- m14 equality unchanged with the tool pass live: bodies 75, colliders 75, scene 330, geometries 412, textures 60 after runs 1 and 3; 7074 frames
- The screwdriver's rack slot (TOOL_RACK.x + 2.30 = -0.10, z 9.00) lies inside the truck deck block (truck.js cargoColliders: x -0.55..1.75, z 8.20..12.60, y 0..1.20); it rests sandwiched at y -0.000 — the KNOWN_ISSUES Phase 17 observation explained
- Suite totals: m23 131 new; m6 109 -> 116; m11 164 -> 168; m0 126, m9 41, m10 51, m14 39 unchanged; syntax gate 113 files / 0 errors

Deviations from the brief:
- mulberry32 is IMPORTED from src/core/rng.js (the project's existing copy of the Chameleon/SomethingsDifferent function, same name, rng.js:13) rather than copied a fourth time — Dev INDEX.md:96 says 'already duplicated, do not write a third'.
- m23 L3 (tools are not grip-held): a tool is carried by InteractionSystem (interact.js _pickUp/step: kinematic, re-placed at the mover's chest every step), not by a grip spring. Under game.frame() a carried tool therefore CANNOT be lost — interact.step puts it back before the tools pass runs — asserted as L3c (still carried, 0 callouts). The 'lost' release for a tool is tools.dropCarried -> TOOL_STATE {state:'dropped', reason:'lost', by} (asserted L3d through the pass alone); GRIP_ENDED reason 'lost' is the grip-held ENTITY path (registry.recover -> releaseHolds -> grip.releaseEntity), asserted L3b through the registry pass alone. With grips stepped (m6's driver), the grip's own anti-ghosting tears first ('pulled out of reach', grip.js:534) because any out-of-bounds point exceeds GRIP.maxStretch — asserted L3a. game.frame() itself releases any test grip as 'released' on its first step (main.js movers system: the grip key is not down), so the grip paths cannot be driven by game.frame().
- m23 L1 rest height: asserted 'on the ground under the slot' (y in [-0.02, slot + lift]) rather than slot y ± 0.05 — the screwdriver rests at -0.000 (KNOWN_ISSUES Phase 17 recorded it); root cause found and reported below (slot inside the deck block). x/z are ± 0.05 as briefed; the at-maxFrames assertion keeps y between the slot and slot + lift.
- RECOVERY.bounds is derived from a NEW config block WORLD.groundSizeM (200), not from scene.js: scene.js has no plot constant (its 400 m grass plane is dressing with no collider); the plot the physics knows is world.js addGround's square (default 200, now passed explicitly from main.js). The margin is therefore ~95 m rather than ~5 m — deliberate: m6 (PAD -40,40), m11 (-50,42), m14 (-30,30 … -38,30) park fixtures far off the houses and a plot-tight box would recover them mid-run and change their numbers; the y floor (-8) does the real work either way. L8 asserts derivation (bounds === ground half-extents) and the >= 5 m enclosure.
- L8 'the route's teleport target': since M13 the route teleports nothing (a PHASE event; the truck never moves), so L8 asserts the cab, both zone sets, the cargo box, every spawn, the rack and the mover spawn instead.
- registry.js imports pieceSlots from tools.js for a lost piece's slot; tools.js keeps three-line local copies of safeTranslation/isOutOfBounds (importing them back from registry.js would be a cycle). Pieces are recovered to the slot a fresh disassembly would give them beside the parent's CURRENT AABB; if the parent is itself lost or gone they fall back to their own lastStable.
- The tool pass is its own game system 'tools' registered right after 'objects' (main.js), not folded into registry.step.
- Sweep invariant (a) asserts the body type TRUE TO STATE (kinematic iff carried, Fixed iff deployed, else dynamic in the object group) rather than 'dynamic' unconditionally — a session may legitimately end with the ramp deployed or a tool in hand. Invariant (d) is read after Q-putting-down any carried tool (interact.secondary looking at open ground), since describe() promises the tool verb while a tool is in hand.
- The cab verbs are PLACED, not drawn: sessions 0..DEBUG.softlockDriveSessions-1 open with 'drive' (parked) or 'drive back' (arrived, M13's real seam) and exclude 'replay', so the phase carries over and session 1 provably opens with 'drive back' (tripCount 2); every other session draws from the remaining twelve verbs. Three legs total (5.2k of the 23k frames).
- The sweep drives dolly/blanket/ramp/screwdriver/door/strap through the systems' own APIs (the same calls interact makes) and the cab, tool pickups and put-downs through interact — random positions would otherwise fail on aim rather than on state. A thirteenth verb 'pick up tool' (interact E at a tool) was added so carried tools are part of the random sequences.
- Tool RECOVERY payloads carry toolId AND entityId (= the tool id) plus kind:'tool' so audio's positional lookup and the recorder's single §27.4 stream keep working; registry payloads gained kind:'object'|'fixture'|'piece'. registry.step's bare ±120 xz literal is replaced by RECOVERY.bounds; registry.recover on a Fixed body is a no-op; a non-finite body is recovered with no grace (reason 'non-finite').

### M16

### M16 — Camera shake that means something — road events and near impacts nudge the camera, with the §26.5 switch that turns it off — 2026-09-04

GDD §26.5 ('Grip toggle, sensitivity, camera shake, UI scale, subtitles, and color-independent cues exist'), §21.4 Motion (camera shake as an accessibility baseline, prefers-reduced-motion), §11.3 (road events are felt), §8.4 (feedback without a second HUD element), §22.4 (the renderer reads state and never writes it).

**Hypothesis.** M4 shipped every §26.5 switch except camera shake because nothing produced any: a hard brake reached the cargo as a force and the HUD as a label while the camera sat perfectly still, and a fridge landing beside a mover was silent to the eyes. A small, physically-motivated nudge — a damped spring on the eye, capped, never on the look axes, off by one checkbox and off by default when the OS asks for reduced motion — closes the criterion and gives the drive its one missing feel cue.

**What changed.** `ThirdPersonCamera` (camera.js) gains a damped-spring offset in the rig's flat frame (x right, y up, z forward) plus a small pitch/roll: `nudge({x,y,z} m, rot mrad)`, `nudgeWorld(vec)`, `setShakeEnabled`, `clearShake`, `setClock`, `shakeOffset/shakeMagnitude/shakeRot`. `update()` applies the offset AFTER the boom solve and probes the shaken eye against the walls with the same `camOcclude` before it lands (`shakeClamped`), keeps `lookAt` on the unshifted target (so a translated eye tracking a fixed subject swings the frame by offset/boom radians without touching yaw or pitch) and integrates on SIM time with the exact damped-oscillator solution (frame-rate independent; a frame-time fallback after 50 ms of a stalled clock so a paused jolt does not freeze mid-air). At rest the offset is exactly zero and the branch is skipped — a still camera solves byte-identically to a build without shake. Config `RENDER.camera.shake`: stiffness 900 (ω 30 rad/s, 4.8 Hz), damping 18 (ζ 0.30), maxOffset 0.12 m and maxRot 0.035 rad as caps on the running value (not the sum), settleMs 600, road 0.06 m and 14 mrad per unit severity, impact 0.05 m at AUDIO.impact.fullVelocity within impactRange 6 m, knockdown 0.08 m. Sources are read-only bus OBSERVERS in main.js — never a system, never game.state: ROAD_FORCE nudges the DRIVING seat (the seated mover nearest the cab when the phase turned to TRANSIT) along the same truck-frame direction the cargo's pseudo-force takes (brake +z and pitch down, turn sideways and roll, bump up); IMPACT nudges every seat within impactRange ∝ relVelocity above AUDIO.impact.minVelocity × (1 − d/range)², mostly up with half of it away from the hit; a mover's own knockdown nudges its seat once (read on the render frame — there is no knockdown event). Settings: 'Camera shake' checkbox on the M4 card (shell key `cameraShake`, every rig's `shakeEnabled`, off clears a shake in flight); its DEFAULT is `!prefers-reduced-motion` read once at boot (`save.js reducedMotionPreferred`, `load({reducedMotion})`), a saved choice wins, Defaults restores the reading, `M.reducedMotion` records it. The debug overlay shows the offset per seat in mm with '(off)' and 'clamped'. AirportBaggageCrew has no shake to copy (fx.js:11) — this is the first in Dev.

**Checked.** New tools/m24-shake-tests.js **101 ALL-PASS** (Z1–Z6 config pins and the settle derivation, K0–K9, J1–J5); m12 **127** (+S1–S6: a ROAD_FORCE nudges only the driving seat's camera, the other seat unchanged to 1e-9), m16 **120** (+U2 walks the new control, V4 round-trips it, M16-1..4), m0 126, m11 168, m15 108 — all ALL-PASS. ./tools/syntax-check.sh: 113 files, 0 errors.

Measured:
- Spring: ω 30.0 rad/s (4.77 Hz), ζ 0.30; a 50 mm nudge is inside 1 mm at 440 ms analytically, measured 0.214 mm at 36 sim frames (600 ms), far-side wobble −18.24 mm, exactly 0 after 180 more frames; rig vs a shake-free twin at rest: 0 (===)
- hardBrake: 60.00 mm forward (+z) on the first update = 1.0 × 0.06, pitch −12.44 mrad after one integration; sharpTurn: x 60.00 mm, roll; speedBump: y 48.00 mm (0.8 × 0.06)
- IMPACT 4 m/s at 1 m from the mover: 30.19 mm camera displacement (0.05 × 0.778 × (5/6)² × √1.25); at impactRange + 1 m, below minVelocity and exactly at it: 0
- 50 stacked 50 mm nudges + 50 × 30 mrad: |offset| ≤ 0.12, |pitch|,|roll| ≤ 0.035; a diagonal keeps its direction
- Front wall with the boom at distanceMin (compressed to 0.619 m): a 120 mm nudge into the wall moved 51.7 mm, shakeClamped true, eye inside no collider; at the 4 m boom camOcclude's 6 % back-off is 24 cm, so one nudge never reaches a wall
- 300 running frames of nudges change exactly the state paths 300 idle frames change (elapsedWorkMs, telemetry.phaseMs.pickup); on a paused sim game.state JSON is identical; rig.yaw/pitch and grips.aimYaw identical across a nudge
- Headless boot reading false → the switch defaults on; load({reducedMotion:true}) → off; a saved choice wins either way

Deviations from the brief:
- `rot` is a number (roll) or {pitch, roll} in mrad, not a scalar — a scalar cannot express 'brake pitches, turn rolls'.
- The driver is the seated mover nearest the cab at →TRANSIT: the CONTRACT_PHASE event carries no mover id (game.js setPhase, interact.js _useCab); in solo the one seat always feels road events.
- Exact damped-oscillator integration, apply-then-integrate, with a frame-time fallback after 50 ms of a stalled sim clock (paused game; suites stepping physics without the clock).
- The suites measure against a shake-free twin rig fed identical inputs (a freshly placed capsule drifts up to 4e-5 m/frame anywhere but its spawn point); K4 uses the distanceMin boom; K6's 'identical' is asserted on a paused sim plus a changed-path comparison; K7 stubs the pure reading rather than re-booting.
- The grip aim ray's ORIGIN follows the shaken camera (grip.js aim() reads camera.position) by ≤ 0.12 m for ≤ 0.6 s; its direction is untouched. Recorded in KNOWN_ISSUES.

Measured:
- Spring: ω = √900 = 30.0 rad/s (4.77 Hz), ζ = 18/(2·30) = 0.30; envelope x0·e^(−9t)/√(1−ζ²) puts a 50 mm nudge inside 1 mm at 440 ms; settleMs 600 (margin 160 ms)
- K1: 50 mm nudge → 0.214 mm at 36 sim frames (600 ms), far-side wobble −18.24 mm, exactly 0 after 180 more frames; rig vs shake-free twin at rest: 0 (===)
- K2 hardBrake: peak 60.00 mm (severity 1.0 × road 0.06) on the first update, pitch −12.44 mrad read after one integration (14 × 0.8889); sharpTurn x 60.00 mm; speedBump y 48.00 mm (0.8 × 0.06)
- K3: IMPACT 4 m/s at 1 m → 30.19 mm camera displacement (spring reads 26.84 mm after the same frame's integration — one exact step is 0.8889×)
- K4 wall: boom compressed to 0.619 m of 1.6; 120 mm nudge into the front wall → moved 51.7 mm, shakeClamped true; at the 4 m boom camOcclude's 6 % back-off is 24 cm, more than the cap, so a 4 m boom never reaches a wall with one nudge
- K6 idle-frame state paths over 300 frames: elapsedWorkMs, telemetry.phaseMs.pickup — identical set with 300 nudged frames
- Headless boot reading: prefers-reduced-motion false → cameraShake defaults true; load({reducedMotion:true}) → false
- Suites: m24 101, m12 127, m16 120, m0 126, m11 168, m15 108 — all ALL-PASS; ./tools/syntax-check.sh: 113 files, 0 errors
- A capsule placed anywhere but its own spawn point on the driveway drifts 6e-7 to 4e-5 m per frame for hundreds of frames (leaning on a tool); at the spawn offsets (−0.9, 0) and (0.9, 0.6) it is still to 1e-9 — the reason the suites measure against spawn points and twin rigs

Deviations from the brief:
- nudge()'s rotation argument is `rot` = a number (roll, mrad) OR {pitch, roll} in mrad, not the brief's scalar `rotMrad?` — a scalar cannot express 'brake pitches forward, turn rolls sideways' (camera.js nudge JSDoc).
- Driver attribution: the CONTRACT_PHASE event carries no mover id (game.js:166 emits {from,to,validation}; interact.js:736 _useCab has no mover), so the driving seat is recorded at →TRANSIT as the seated mover nearest cabPoint() (a press needs the mover within TOOLS.interactRange + 0.6 m of it). In solo the one seat always feels road events — seatOfMover(driver) is −1 after a Tab swap and the one player is the crew. Recorded in the main.js comment; two movers crowding the cab picks the nearer.
- Integration is the exact damped-oscillator solution on sim time, not Euler: semi-implicit Euler at 60 Hz drops 17 % on the first step, which makes the brief's ±5 % peak claim depend on frame rate. The offset is applied THEN integrated in update(), so a nudge shows in full on the first update after it (K2 peak = 60.00 mm exactly).
- Sim time with a frame-time fallback: after RENDER.camera.shake.simStallS (0.05 s) of a stalled sim clock the shake integrates on the frame dt — a paused game would otherwise freeze a jolt mid-air, and suites that step physics without the clock (m11 step()) would carry a stale offset into their lookAt aims. On a 120/144 Hz display the fallback never triggers.
- K1/K2/K3/K4/K5's 'un-nudged solve' is a shake-free TWIN ThirdPersonCamera fed identical focus/yaw/pitch/boom each tick (tools/m24-shake-tests.js twinOf), because a freshly placed mover drifts 1e-9..4e-5 m/frame while settling, so an absolute rest position is not a constant to 1e-9. K1e then proves byte-identity (offset === 0).
- K4's wall fixture shortens the boom to RENDER.camera.distanceMin: camOcclude backs the eye off by 6 % of the WHOLE ray (24 cm at 4 m, more than the 12 cm cap), so at the default boom no nudge can reach a wall; at 1.6 m the gap is 9.5 cm and the probe's clamp is exercised (moved 51.7 of 120 mm).
- K6 'game.state JSON identical before and after 300 frames of nudges' is asserted two ways because 300 running frames advance elapsedWorkMs/phaseMs regardless: (a) identical on a paused sim, (b) the set of changed state paths under nudges equals the idle set.
- K7 'stubbed at boot': boot cannot be re-run in the harness, so the reading is the pure save.js reducedMotionPreferred(win) (stubbed with a fake matchMedia) and load({reducedMotion}) decides the default; the card is shown with that default and Defaults restores !reducedMotion; M.reducedMotion records the boot reading.
- K3's magnitude is the camera displacement (30.19 mm), not rig.shakeMagnitude() after the update (26.84 mm, post-integration).
- m16 V4's fixture shell was extended in place with cameraShake:false (the M9 precedent on the same line) in addition to the new M16 section; m16 U2's consumer map gained the cameraShake line (required for U2's 'exactly one control per consumer').
- m12 S leaves and re-enters TRANSIT (section G's _useCab() had left the contract in TRANSIT with the driver already recorded) and restores the phase it found.
- AirportBaggageCrew has no camera nudge to copy: src/render/fx.js:11 records 'No screen shake' and it was never added — this is the first in Dev; the camera.js header says so.
- Two assertions beyond the brief's list: K8 (the mover's own knockdown → one nudge, via M.shakeFrame — there is no knockdown bus event, so the render frame polls controller.knockdowns) and K9 (the overlay row).
- The grip aim ray's ORIGIN follows the shaken camera (grip.js:123 camOrigin = camera.position) by ≤ maxOffset for ≤ settleMs; its direction (aimYaw/aimPitch) is untouched (K6b). Recorded as a known issue rather than changed — grip.js is outside this milestone's ownership and the boom's occlusion compression already moves that origin.

## Phase 21 — Phase 11 build side, batch 6: the second trip, and walls are billed — 2026-09-04

Phase 11's build side (GDD §25.2: onboarding, settings, instrumentation, fixes), from the ordered plan in docs/PHASE11_PLAN.md. Each milestone was built by a file-owned implementer and adversarially reviewed against its brief; the numbers below are the ones the reviews reproduced.

**2068 assertions across 23 suites, all passing.**

### M13

### M13 — The second trip — drive back for the rest, tripCount real, per-leg fuel, and a priced settlement with items left behind — 2026-09-04

GDD §3.4 (Pickup exit 'required cargo loaded OR crew elects another trip'; 'a phase may return to an earlier phase for an extra trip. The state machine must not lose damage, time, fees, or manifest status'), §2.2 ('an extra trip costs fuel and time; work continues'), §10.2 ('the system tracks which trip moved each item'), §12.1 ('one trip' as an OPTIONAL goal), §12.2 ('partial completion, extra cost, negative profit' are sanctioned outcomes), §15.1 (one-trip bonus 'awarded if all required cargo moved once'; vehicle/fuel), §15.2 (review tag extra_trip), §23.2 (tripCount), §26.1 ('invoice reports … trips … accurately'), §27.4 (trips signal).

**Hypothesis.** The contract had exactly one trip in it: state.tripCount was never written, the cab at the destination offered only 'finish the job and settle up' whatever was still in the house, the one-trip bonus was free rather than earned, fuel was a 4.2 km constant, and a crew that settled with twenty items left took the full base 900. Make the return a PHASE event on the route that already exists — the truck never moves and both sites share one world — and price the alternative in the prompt before either key is pressed.

**What changed.** `RouteDriver.depart({ heading })` ('out' | 'back', in status(), reset restores 'out'); no second route — the return leg is the same three hazards. `createInitialState` starts at `tripCount: 1` so §10.2's stamps and §23.2's count agree from boot; `CargoSystem.tripCount` is synced from the state (the 'phase' system on a return arrival, resetContract after game.reset). `manifest.js` gains `rowWhere()` — an undelivered row is 'truck' (loaded), 'site' (any destination zone, kerbside apron included) or 'away' (anything else — the old house, its lawn, the road — OR any detached-part piece that is neither loaded nor at the destination; fragments never count) — and `tripStatus()` { away, inTruck, atSite }; `deliveryStatus()` carries `where` / `piecesAway` per outstanding row and the three counts. At the cab in DELIVERY with rows away, E is 'drive back for N more' (route.depart({heading:'back'}), setPhase(TRANSIT, {returning, remaining})) and Q is 'settle up — leave N behind (N × 60.00)'; with nothing away the cab is what it was. The 'phase' system forks on route.heading at arrival: 'back' → tripCount + 1, cargo synced, route.reset() (after the 'arrived' read), setPhase(PICKUP) and the notice 'back at the house — trip 2: 22 to go'; 'out' → DELIVERY as before. contractFacts() gains `trip` and `away`; the objective reads 'trip 2 — load 21 more, or drive from the cab', 'heading back — 46% there', and 'drive back for 22 more, or settle up at the cab' when the truck is empty and everything left is away (M12's loose-parts suffix stays on it); the HUD phase line reads 'pickup · trip 2'. Invoice: FUEL bills 2 × tripCount − 1 legs ('3 legs x 4.2 km @ 3.2/km' = −40.32; `legsDriven()` says when it must become a recorded count); new LINE_KINDS.LEFT_BEHIND 'items left behind' = −(undelivered required rows × ECONOMY.leftBehindFee 60) citing every undelivered row id; `reconcile()` re-derives both from state.tripCount and the manifest rows and names either on a mismatch. `ECONOMY.leftBehindFee: 60` carries its arithmetic (a bare return is 26.88 fuel + 26.13 labour ≈ 53.01 before loading). The run recorder's counters.trips is the real count; the audio CONTRACT_PHASE cue plays 'back at the house' for a PICKUP entered from TRANSIT instead of 'the job starts'.

**Checked.** New tools/m21-trips-tests.js **104 ALL-PASS** (T1–T9): four route legs through game.frame() (1681 frames each), a first box delivered on trip 1, the return leg to PICKUP with tripCount 2 and the delivered row, ledger and clock kept (elapsedWorkMs +28016.7 ms per leg, phaseMs.transit 56000.0 over two legs, event log pickup -> transit -> delivery -> transit -> pickup), a second box stamped loadedOnTrip 2, Q at the cab settling with 21 left: base 900.00 + efficiency 260.00 + room accuracy 90.00 − labour 41.74 − fuel 40.32 − furniture damage 3.20 − items left behind 1260.00 = **−95.26, grade F**, review 'I am not sure they made anything on this. That is not my problem.' (cost_them_money, items_left_behind, extra_trip), reconcile ok and refusing a halved left-behind line and one-leg fuel by name, trips 2 on the sheet and the run summary, 'Run it again' back to trip 1 with recorder.lastRun keeping 2, and the single-trip invoice untouched (ONE_TRIP 180.00, FUEL −13.44 '1 leg'). m11 **163** (E7 and O3 rewritten on purpose, O3b added), m10 **47** (A3 pins one leg), m14 37, m17 103, m8 38, m9 41, m18 159 (51 recipes), m12 121, m15 108, m20 89, m19 127, m0 126, m16 116 — all ALL-PASS. ./tools/syntax-check.sh: 108 files, 0 errors.

Measured:
- Trip-2 settlement with 21 left (m21 T6): base 900.00; efficiency 260.00 (16.5 min under 18); room accuracy 90.00 (2/2); labour −41.74 (1.5 min × 2 movers @ 14); vehicle/fuel −40.32 (3 legs × 4.2 km @ 3.2); furniture damage −3.20 (1 event — the box aboard over three legs of road forces); items left behind −1260.00 (21 of 23 @ 60); PROFIT −95.26, grade F; review 'I am not sure they made anything on this. That is not my problem.' tags cost_them_money, items_left_behind, extra_trip
- Cab prompt at the destination with 22 away: primary 'drive back for 22 more', secondary 'settle up — leave 22 behind (1320.00)'; return-arrival notice 'back at the house — trip 2: 22 to go'; HUD phase line 'pickup · trip 2'
- telemetry.phaseMs.transit after two legs = 56000.0 ms exactly (each leg 28000.0: the route arrives on step 1681 of the 1681-frame leg and that step is billed to the new phase); elapsedWorkMs +28016.7 ms per leg (1681 × 16.667); ledger byte-equal across the return leg
- A parked box counts as loaded 54 frames after parkAt (CARGO.loadedDwellMs 800 ms = 48 steps + settling)
- Single-trip invoice untouched (m21 T8, m10 A3): ONE_TRIP 180.00, FUEL −13.44 with detail '1 leg x 4.2 km @ 3.2/km', no LEFT_BEHIND line, reconcile ok
- reconcile refusals: halved line → 'items left behind 630 does not match the manifest's 1260'; one-leg fuel on trip 2 → 'vehicle/fuel 13.44 does not match 3 legs (40.32)'
- Suite budget: 7368 game.frame() calls (4 legs × 1681 = 6724 + 644 fixture frames), sim clock 33350 ms after the T7 replay reset; the run finishes in roughly a minute of wall time, well inside smoketest.ps1's 240 s virtual budget — no split needed
- m18 A1: 51 cue recipes across 12 rows (was 50) with the 'return' variant 'back at the house'; ./tools/syntax-check.sh: 108 files, 0 errors
- ECONOMY.leftBehindFee arithmetic: bare return = fuel 2 × 4.2 × 3.2 = 26.88 + labour 2 × 28 s = 0.933 min × 14 × 2 = 26.13 → 53.01 before any loading; 1 item left = 60, 3 = 180, 23 = 1380 > base 900

Deviations from the brief:
- m11 E7 rewritten (the brief listed it as a regression to keep and assumed 'away === 0 → finish the job and settle up (m11 E7)'): in m11's E section nothing is delivered before arrival — reset() + 60 frames + the drive, tools/m11-tests.js E block — so 22 rows are away and one is aboard; the honest prompt is 'drive back for 22 more' with settling on Q. E7 now asserts exactly that, with a comment saying it was rewritten on purpose, the way the brief asked for O3.
- secondary()'s TARGET.CAB branch sits AFTER the two carried-tool put-down branches, not 'before the tool put-down fall-through' as the brief's seam list says: describe() (interact.js, branch 2 'if (carried)') promises `put down the <tool>` whenever a tool is in hand whatever is under the reticle, and m11 B6 pins promised == delivered. Q at the cab settles only when empty-handed, which is when describe() offers it.
- DELIVERY objective keeps M12's ' — N loose parts still to bring in' suffix on the new drive-back line: tools/m20-tests.js:297 (P3c, not in my file ownership) asserts /4 loose parts/ in DELIVERY with the couch at the site and its legs at the pickup — a row that is 'away' by its pieces, so the drive-back line is the one shown there.
- The 'away' count includes rows held open by missing pieces (the brief asked to count them or say why not): rowWhere() in manifest.js marks a row 'away' when any detached-part piece is neither loaded nor in a destination zone, whatever the hulk is doing; fragments are excluded because they never gate delivery. LEFT_BEHIND is then charged on such a row on top of PARTS_LEFT — the config comment records why (property vs completion).
- T4's transit tolerance is asserted as ± one step PER LEG (2 × STEP over two legs) rather than the brief's ± one step total, because each leg's arrival step is billed to the phase it arrives in; the measured value is 56000.0 ms, 0 off.
- src/audio/audio.js edited (not in the brief's filesTouched; the orchestrator message allowed a one-line variant): the variant fn keys a PICKUP entered from TRANSIT to a 'return' recipe so a returning arrival no longer plays 'the job starts'. No EVENTS name added; m18 A1 159 ALL-PASS.
- src/main.js hunk count is 6 (the brief's scope implied ~5): the objectiveFor DELIVERY line needed the parts-suffix follow-up above.
- invoice.js reconcile() takes an optional opts.distanceKm (default ECONOMY.routeDistanceKm) so a caller who passed a non-default distance to buildInvoice can reconcile it; all existing callers pass none.

### M14

### M14 — Property damage is priced — a carried or thrown object that hits a wall, a door frame or the truck hard enough writes ONE ledger.propertyDamage entry, the §15.1 line, one notice and one bounded scuff — 2026-09-04

GDD §15.1 (property damage as its own line, immediate ticker and itemization), §8.3 (static surfaces: impact threshold, maximum charge, decals, cooldown and aggregation), §8.4 (object/location, category, cost; visual mark and one small cost notice), §26.4 (impacts above thresholds create ONE ledger entry), §26.6 (no unbounded growth in decals; reset removes damage records), §15.2 (review tags from actual events), §12.2 (no damage total ends a contract), §10.4 (no phantom damage from settling).

**Hypothesis.** `DAMAGE.property` had been tuned since Phase 8 and never read; `ledger.propertyDamage` had three readers and no writer, so a scraped wall was free and §8.2's preparation-versus-brute-force trade was priced on one side only. The pieces existed and were disconnected: the damage system measured an object's own lost speed and never asked what it hit; `addStaticFromColliders` returned every static's tag to a caller that threw it away. Keep the tag map, read the narrow phase for the ONE step an object loses speed, and the wall gets its line.

**What changed.** `PhysicsWorld` keeps `staticTags` (handle → tag) and `statics`; `addGround`/`addRamp` tag 'ground'/'ramp'; `tagOf(colliderOrHandle)` mirrors `registry.fromCollider`. scene.js tags the three front headers `doorHeader_<aperture id>`. New `src/damage/surfaces.js`: `billable(tag)` is an explicit prefix allow-list (walls, headers, partitions, ceilings, the truck's body; floors, ground, deck, ramp, porch step and ledges are free by construction) and `labelFor(tag)` names the location ('front wall', 'living_kitchen door frame', 'living room back wall', 'truck headboard'). `DamageSystem` gains a second aggregation map keyed `entity|surface`: after `lost` is known and independent of `conditionLossFor`, `m·Δv ≥ DAMAGE.property.minStepImpulse` (1.5 N·s) reads `contactPairsWith`/`contactPair`, ranks EVERY contact by Σ|contactImpulse| and bills only a billable winner (the surface that stopped the object — a floor landing beside a wall stays a floor landing); windows merge inside `aggregationWindowMs`/`aggregationRadius`; `_closePropWindow` posts ONE line — {category 'property', surfaceId, location, entityId, defId, impulse, peakStepImpulse, band, cost, at (contact-patch centre), normal (toward the object), timeMs, heldBy} — with cost = min((impulse − 12) × 1.6, 400 − Σ existing lines on that surface), re-derived from the ledger; nothing is written when it rounds to 0. The SAME `DAMAGE_APPLIED` event carries it (with `position`); the HUD notice reads 'front wall — scuffed · 30.82'; the audio has scuffed/dented/holed variants; the recorder counts `propertyEvents` apart from `damageEvents`. Config: `minStepImpulse`, `bands` (scuffed 12 / dented 40 / holed 100 by window impulse), `decals`. invoice.js: the §15.1 line's detail is `N impacts on K surfaces` with one citation per entry; `reconcile()` gains the property block (to the cent, one citation per entry, refuses a line over an empty ledger); `reviewFor` adds `marked_the_walls` (salience 50) with a curated template; `contributionStats.propertyEvents`; the sheet's stats gain 'surfaces marked'. New `src/render/scuffs.js`: a ring of 24 quads allocated once at boot (one black Basic material under NormalBlending, one geometry, userData.layer 'scuff', userData.movable), placed by DAMAGE_APPLIED at `at + normal × 0.003` and sized by band, emptied by SIM_RESET — event-driven, zero per-frame work, built on both tiers so the harness can assert the bound. Seams left: `surfaceRow(tag)` (§8.3 material per surface), `damage.protectedSurfaces` (§8.2 runners), `damage.mitigation` (§8.4 repair tools), 'doorLeaf_' in the allow-list (M11 hinge brute force).

**Measured.** A 9.000 kg box resting 0.16 m off the front wall thrown at 4.0 m/s: one line, 31.266 N·s (4.7 of rebound), scuffed, 30.82, contact centre (1.60, 0.25, −1.92) on the outer face, normal (0, 0, 1), one event, one notice. The same box into the living_kitchen header: 33.617 N·s, 34.59, 'living_kitchen door frame'. Invoice: property damage −65.41 '2 impacts on 2 surfaces' citing 2, furniture damage −80.00 separate, reconcile ok; a deleted entry, an amount off by 1.00, a line over an empty ledger and a line citing no event are all refused by name. Two throws 333 ms apart merge into one line of 65.105 N·s / 84.97. A 17 kg box slid at 3 m/s from 0.29 m into the headboard: 40.771 N·s, dented, 46.03; dropped 0.5 m onto the deck: nothing. The front wall caps at 400.00 to the cent (61.40, 60.92, 61.16, 61.40, 60.83, then 9.32 after the 84.97 merge) and a further hit posts no line, event or notice. A capped wall plus a broken TV settles as a LOSS (property 446.03 over 8 lines, items 2082.70) with completion untouched. 40 hits over three surfaces → 40 lines, 24 marks (the ring), scene children 330 = boot; replay → 0 lines, 0 windows, 0 marks, 75 bodies. Same script with the audio detached: ledger deep-equal. m14's soak: 1 line and 1 mark at every settlement, 0 after every replay, run-1 === run-3 on every counter.

**Checked.** New tools/m22-property-tests.js **88 ALL-PASS** (PD0–PD15, Z); m10 51 (+B13–B15), m11 164 (+G11b), m14 39 (+S3c M14, S1 M14), m17 105 (+R2e, R6c); m0 126, m8 38, m13 76, m18 159 — all ALL-PASS. ./tools/syntax-check.sh: 109 files, 0 errors.

Measured:
- 9 kg box at 4.0 m/s → 31.266 N·s scuffed 30.82 (front wall); into the 2.03 m header → 33.617 N·s 34.59; merged pair 65.105 N·s 84.97; 17 kg at ~2.4 m/s (3 m/s from 0.29 m) → 40.771 N·s dented 46.03; six 6 m/s throws 50.0–50.4 N·s each, dented.
- From the brief's 1.0 m the 0.78-friction box on the 0.32 deck (Average 0.55, 5.4 m/s²) stops at z 12.289 at 0.000 m/s with headboard impulse 0.00 — no hit to bill; the fixture starts at 0.29 m.
- Bands by window impulse: 9 kg at 4 m/s ≈ 31–36 scuffed; the TV at 2 m/s 44 dented; the couch at 1.1 m/s 99 dented; the fridge at 1 m/s 110 holed.
- Cap: Σ 'wall' 400.00 ± 0.00; last line 9.32 = 400 − 390.68; a seventh hit 0 lines / 0 events / 0 notices.
- Decals: 40 lines Σ 450.94 over three surfaces, scuffs.count 24, pool 24, one material + one geometry, scene children 330 at boot, after 40 hits and after replay.
- m14: property 1 / scuffs 1 at every 'strap live' sample, 0 / 0 after every replay; bodies 75, colliders 75, scene 330, geometries 412, textures 60 after runs 1 and 3; 7074 frames.

Deviations from the brief:
- Attribution ranks EVERY contact (floors, movers, entities included) and bills only a billable winner, rather than ranking among billable surfaces only: the brief's rule bills a wall for the floor landing of anything that grazes it in the same step (§10.4). All fixture numbers unaffected (the wall wins its step by ~10×).
- PD5 starts 0.29 m from the headboard (measured slide-to-a-stop from 1.0 m); PD3c parks the box back before the second throw (a velocity set on a touching body is killed in the same step and the speed delta never sees it — fixture artefact); PD11 is asserted with the run's louder tags quieted (box2 broke falling 2.4 m from the header); PD13 spreads 40 hits over three surfaces because one surface caps and stops posting.
- `at` is the centre of the contact patch (average of the solver contacts), not solverContactPoint(0) — the corner.
- Audio captions are static 'wall scuffed' / 'wall dented' / 'wall holed' (m18 A1b requires string captions); the notice names the surface.
- m14's ids are S3c M14 / S1 M14 (S3b was taken).

Measured:
- Boot: 75 bodies, 330 scene children (one 'scuffs' Group of 24 hidden quads included), 27 registry rows; 120 game.frame() → 0 property lines, 0 open windows.
- Tag map: physics.statics.length === world.colliders.length; tagOf(ground) 'ground', tagOf(ramp) 'ramp', tagOf(entity collider) null; headers now doorHeader_interior32 / doorHeader_door34 / doorHeader_front36 (+ living_kitchen, kitchen_bedroom).
- 9.000 kg box_small_01 resting 0.16 m off the front wall, 4.0 m/s: ONE line — impulse 31.266 N·s (4.734 N·s of rebound), band scuffed, cost 30.82, at (1.60, 0.25, −1.92) = the centre of the contact patch on the outer face (−1.91), normal (0, 0, 1), timeMs 1566.7; one DAMAGE_APPLIED (category 'property'), one notice 'front wall — scuffed · 30.82'.
- Same box into the living_kitchen header from (2.60, 2.40, −4.55): impulse 33.617, scuffed, 34.59, at (2.60, 2.39, −4.94), 'living_kitchen door frame'.
- Invoice after those two: property damage −65.41 '2 impacts on 2 surfaces' citing 2; furniture damage −80.00 over 4 events (the first box cracked 14.00 = 0.35×40; the second cracked then broken from its 2.4 m fall); reconcile ok; counters propertyEvents 2 / damageEvents 4 = the two ledgers.
- Two throws 333 ms apart merge: 1 line, impulse 65.105, cost 84.97.
- 17 kg box_heavy_01 (mu 0.78) from 0.29 m at 3 m/s into the headboard: 40.771 N·s, dented, 46.03, at (0.60, 1.41, 12.50), normal (0, 0, −1). From the brief's 1.0 m the same throw stops at z 12.289 at 0.000 m/s with headboard impulse 0.00 (deck 0.32, Average 0.55, 5.4 m/s²). Dropped 0.5 m onto the deck: 0 property lines (2 item lines).
- Cap: after the 84.97 merge line, six throws at 6 m/s (50.0–50.4 N·s each, dented): 61.40, 60.92, 61.16, 61.40, 60.83, then 9.32 = 400.00 exactly; a seventh hit: no line, no event, no notice.
- Settlement with the capped wall, the headboard and a broken TV: property 446.03 over 8 lines, items 2082.70, LOSS, complete === summary.complete, no error banner.
- Reset: 0 lines, 0 windows, 0 marks; bodies 75 and scene children 330 (fragments gone).
- 40 throws at 2.5 m/s over three surfaces (14 front wall / 13 living-room back wall / 13 west wall) → 40 lines Σ 450.94, scuffs.count 24 (the ring), scene children 330 unchanged, 24 quads visible, the last mark at the front wall's at + 0.003 along +z; after replay 0.
- Audio detached / attached / re-attached: 1 line 30.82 each, deep-equal.
- m14 three runs: property 1 line and 1 mark at every 'strap live' sample, 0 after every replay; run-1 === run-3 (bodies 75, colliders 75, scene 330, geometries 412, textures 60); 7074 frames.
- m10 B13: 'front wall scuffed 30.82 (31.266 N·s)'; m17 R6: A/B/C runs 4 item lines each, −2026.40 profit, property ledgers deep-equal with a line on them.
- Worked bands from the config: 9 kg at 4 m/s ≈ 31–36 → scuffed; the TV at 2 m/s 44 → dented; couch at 1.1 m/s 99 → dented; fridge at 1 m/s 110 → holed.

Deviations from the brief:
- ATTRIBUTION RANKS EVERY CONTACT AND BILLS ONLY A BILLABLE WINNER (damage.js _attributeProperty), not 'skip non-billable then rank'. The brief's rule would bill a wall for a floor landing whenever an object grazes the wall in the same step (a 22 kg TV landing beside a wall = 110 N·s 'holed' on the wall) — §10.4's phantom. Floors, the ground, the deck, movers and entities compete in the ranking (largest Σ|manifold.contactImpulse|) and are never charged; every acceptance number is unaffected (the wall/header/headboard win their steps by 10×). A corner hit still bills the one that took more.
- PD5 fixture: the heavy box starts 0.29 m from the headboard (I.maxZ − 0.5), not 1.0 m. MEASURED with a probe (deleted): at 3 m/s from 0.79 m the 0.78-friction box on the 0.32 deck decelerates at 5.4 m/s² and stops at z 12.289 as it touches the headboard — v 0.000, headboard impulse 0.00 — a slide to a stop, nothing to bill.
- PD3c merge fixture: the second throw parks the box back 0.16 m off the wall before setLinvel. A velocity SET on a body already touching the wall is killed inside the same step and the per-step speed delta never sees it (prev 0 → speed 0) — a fixture artefact; a real object accelerates over steps. Recorded in the suite comment.
- PD11 is asserted on the real property ledger with the run's three louder tags quieted (complete summary, positive profit, item ledger emptied): the live run's top three are broke_something_expensive / cost_them_money / items_left_behind because the header box fell 2.4 m and broke; the live tags are printed. PD11b (salience) is on a constructed state as the brief allowed.
- Audio captions are static strings 'wall scuffed' / 'wall dented' / 'wall holed' (three variant rows keyed by the property bands), not 'door frame chipped': m18 A1b requires typeof caption === 'string', so the caption says what kind of mark and the HUD notice names the surface.
- m14's assertion id S3b was already taken (the recovery assertion) → the new ones are named 'S3c M14' and 'S1 M14'. The per-run throw drains its two damage notices (S7 samples a drained queue).
- PD13 throws 40 times at 2.5 m/s over THREE surfaces in rotation rather than 40 at one wall: a single surface caps at 400 after 6–11 hits and posts no further lines (and therefore no marks), so the 24-decal bound needs the lines spread.
- The ledger's `at` is the average of the manifold's solver contacts, not solverContactPoint(0): index 0 is a corner (PD2 first read (1.35, 0, −1.92)); the centre of the patch (1.60, 0.25, −1.92) is where the mark belongs.
- PD9a / m10 B13a accept /property[ -]damage/: deleting the ONLY entry empties the ledger and the refusal that fires is 'a property-damage line exists with nothing in the ledger' (mirrors the item message).
- addRamp() now also returns `tag: 'ramp'` beside {body, collider, angleRad}; addGround returns the registered {body, collider, tag} record.
- surfaces.js carries the §8.3 seam `surfaceRow(tag)` (one default row) and 'doorLeaf_' in the allow-list for the M11 hinge branch, as the brief's seams asked; damage.js carries `protectedSurfaces` (Set) and `mitigation` (fn|null) hooks, both inert.
- damage.totals() keeps lines/cost/worst item-only (m8 C prints them) and adds `property: {lines, cost}`.

## Phase 20 — Phase 11 build side, batch 5: doors come off their hinges, and loose parts are real — 2026-09-04

Phase 11's build side (GDD §25.2: onboarding, settings, instrumentation, fixes), from the ordered plan in docs/PHASE11_PLAN.md. Each milestone was built by a file-owned implementer and adversarially reviewed against its brief; the numbers below are the ones the reviews reproduced.

**1862 assertions across 21 suites, all passing.**

### M11

### M11 — Door leaves as removable objects — a hung door costs its thickness of clearance, the screwdriver takes it off, and you carry it — 2026-09-04

GDD §8.2 (Door: open or remove from hinges — preparation time and replacement risk), §2.1 (removing doors where the authored level supports them), §9.1 (the screwdriver disassembles authored parts; loose pieces get lost), §9.2 (one interaction verb), §8.1 (visible surface = collider), §3.3 (at least two approaches at every substantial obstacle), §15.2 (review tag front_door_removed), §22.4 (stable ids, serializable state).

**Hypothesis.** A "34-inch door" is a 0.86 m opening whose hung 40 mm leaf leaves 0.82 m of usable width — the number KNOWN_ISSUES spent nine phases calling impossible was this door with its door on. Make the leaf a real object: hung, it subtracts its thickness from the opening; the screwdriver takes it off and gives the gap back; off its hinges it is the first carried object that is part of the house.

**What changed.** Door records carry `leaf: { t, hinge, swing, lay }` (house.js INTERIOR_DOORS, scene.js APERTURES interior32/door34; front36 stays leafless). house.js gains `doorRecords`/`doorById`/`leafDoors`, `hungClear(doorId, apertures, doors, hung)` = gap − t while the leaf is on its hinges (rounded to the micrometre), `tightestOnRoute` now reads the EFFECTIVE width, and the pure poses `leafPose` (hung: swung open against the hinge jamb, thickness inside the opening, 0.80 m into the swing room) and `leafRestPose` (removed: laid flat beside the doorway, out of the opening, 0.02 m off the wall). New `OBJECT_DEFS.door_leaf_01` (category 'fixture', 18 kg, 0.04 × 2.00 × 0.80, fragility normal, replacementValue from `DOOR`) with a `door_leaf` prefab inside its collider. main.js spawns one per leaf record through `registry.spawn(..., { manifest: false, state: { doorId, hung, home, rest } })` and pins it with the new `registry.hang()` (Fixed, the ramp's pattern); `registry.unhang()` frees it. InteractionSystem: E with the screwdriver at a hung leaf reads 'take the door off its hinges' — unhang to the rest pose, `DOOR.removeSeconds` (45 s) billed through M8's chargeWorkMs hook, `EVENTS.DOOR_STATE` 'removed'; Q at a removed leaf within `DOOR.rehangRange` (1.25 m) of its jamb reads 'hang the door back on its hinges' — Fixed again, 'rehung', free. A removed leaf is an ordinary grabbable, damageable, recoverable object. resetContract re-hangs every leaf (`doors.rehangAll`). invoice.js reviewFor adds `front_door_removed` from `game.state.doors.frontRemoved`, written from DOOR_STATE events (door34's record is `front`). audio.js gains a DOOR_STATE cue row (removed / rehung, captioned). Config: the frozen `DOOR` block. The contract panel and objective count manifest cargo only; a leaf in the truck still takes cargo space.

**Measured.** Effective clear at boot: interior32 0.78, door34 0.82, living_kitchen 0.82, kitchen_bedroom 0.87, front36 0.91; tightestOnRoute(bedroom) 0.82 hung → 0.86 with living_kitchen's leaf off. Couch at the 34" door: intact/hung −30 mm, intact/removed +10 mm, legs off/hung +50 mm, legs off/removed +90 mm. E charges 45 000 ms; the leaf lies 1.04 m from its jamb; Q from there puts it back to < 1 mm. One hand lifts the 18 kg leaf 0.252 m clear (178 N vs 177 N), carries it 3.20 m; dropped 1.5 m it is 'broken' (100 → 14, 180 billed). 600 N at living_kitchen: intact couch vs the hung leaf never crosses the wall plane (0.0 mm into the leaf); leaf removed, legs off: centre 1.81 m past the far face (m6 E16d's number, 1.48 m/s at the end); legs off past the HUNG leaf, aimed at the open 0.82: the same — the leaf is never touched. A mover walks both route doors with the leaves hung (38 / 29 steps) and removed (38 / 32). Reset: two leaves off, one 55 m away → all four Fixed at home ± 1 mm; the m14 soak holds (bodies 75, registry 27 at every sample). front_door_removed appears in reviewFor's tags and the M6 run summary after door34 comes off, and is cleared on replay.

**Checked.** New tools/m19-tests.js **127 assertions ALL-PASS** (D1–D9, Z); m5 91 (+B6b, H6b, H7c, DL1–DL8a), m13 76 (+B1c ×5, and the sweeps now sync meshes first — headless they had been measuring entity meshes at the origin), m11 160 (+DL0–DL5); m0 126, m9 41, m10 45, m14 37, m6 109, m18 159, m17 103, m2 75, m3 65, m4 62, m7 53, m8 38, m12 121, m15 108, m16 116, m1 61 — all ALL-PASS. ./tools/syntax-check.sh: 105 files, 0 errors.

Deviations from the brief: a removed leaf is laid flat at an authored rest pose (a 40 mm panel left standing topples onto whoever unscrewed it); DOOR_STATE 'hung' is not emitted at boot (it would caption 'door on its hinges' after START) — the boot state is data; cargo.loadedEntities is not filtered (cargo.js outside M11; a leaf takes space), the contract panel and objective are; D6's through-pushes use m6 E16d's 4 s window (at 3 s the legs-off couch is still creeping, 0.55 m short); leaf records carry `swing`/`lay`/`front` beyond `{ t, hinge }`; interior32 swings out onto the grass.

Measured:
- Effective clear widths at boot (hungClear): interior32 0.78 (0.82 gap), door34 0.82 (0.86), living_kitchen 0.82 (0.86), kitchen_bedroom 0.87 (0.91), front36 0.91 (no leaf). tightestOnRoute(bedroom) 0.82 with every leaf hung, 0.86 with living_kitchen's off; kitchen route 0.82 hung / 0.86 off.
- Hung leaves (world AABBs, y 0..2.00, 30 mm under the 2.03 header): interior32 x −2.83..−2.79 z −2.00..−1.20 (swings out); door34 x −0.43..−0.39 z −2.80..−2.00; living_kitchen x 2.17..2.21 z −5.80..−5.00; kitchen_bedroom x −0.80..0.00 z −6.985..−6.945. registry.count 27 = 23 manifest + 4 leaves; physics.stats.bodies 75 at boot (m14).
- Rest poses (laid flat, 0.04 tall): interior32 x −2.77..−1.97 z −1.89..0.11; door34 x −1.25..−0.45 z −4.11..−2.11; living_kitchen x 0.15..2.15 z −5.88..−5.08; kitchen_bedroom x −2.08..−0.08 z −6.93..−6.13 — none overlaps a spawn footprint, a wall run, its own opening or another leaf's poses (m5 DL2–DL5). Horizontal distance rest→jamb: living_kitchen 1.04 m, door34 0.84, kitchen_bedroom 0.79, interior32 0.84 (DOOR.rehangRange 1.25).
- Couch (0.90 × 0.85) at the 34" door: intact/hung −30 mm, intact/removed +10 mm, legs off/hung +50 mm, legs off/removed +90 mm.
- E with the screwdriver at a hung leaf: 45 000 ms charged to elapsedWorkMs and to the phase's telemetry line (DOOR.removeSeconds 45 × timeScale 1.0), notice 'door off its hinges — 45 s of prep'; the leaf lies within 0.05 m of house.js's rest pose after 60 steps (y 0.02, nothing ejected it). Q from there: Fixed at home to < 1e-3 m, one 'rehung', 0 ms charged.
- One-hand carry of the 18 kg leaf: hand applied 178 N against 177 N of weight; lowest corner 0.252 m clear after 120 frames; carried 3.20 m (clearance en route 0.209 m). Dropped 1.5 m flat: 2 IMPACTs, peak 5.27 m/s lost, condition 100 → 14 ('broken'), ledger 180 = the whole replacementValue.
- 600 N pushes at living_kitchen: hung + intact couch, 3 s: centre from −3.5 to −3.895 (leading face at the living-room wall face −4.94), never past the wall plane, 0.0 mm into the leaf, 0.00 m/s at the end. Removed + intact, 3 s: the same jam, 8.3 mm wall penetration (m6 E16e's 10 mm). Removed + legs off, 4 s: centre −6.867, 1.48 m/s at the end (m6 E16d's exact number). Hung + legs off aimed at the open 0.82's centre (x 2.62, 25 mm a side), 4 s: −6.867, 0.0 mm into the leaf — the leaf is never touched. At 3 s the legs-off couch was at −5.515 still doing 1.4 m/s: 0.55 m short of the criterion, not caught.
- Route walk with a 0.32 m capsule: living_kitchen 38 steps removed / 38 hung (0.82 open); kitchen_bedroom 32 / 29 (0.87 open); the Fixed leaf moved 0.0000 m.
- Reset (m19 D7 / m14): two leaves off, one 55 m away → all four Fixed at home ± 1e-3 m with their home yaw, exactly two 'rehung' events, run-scoped state zeroed; m14's three-run soak: bodies 75 / colliders 75 / registry 27 identical at every sample.
- Review: removing door34 sets state.doors.frontRemoved and reviewFor adds front_door_removed (salience 50); the M6 run summary carries the tag in review.tags and the DOOR_STATE 'removed' event in events; onReplay clears it. Removing an interior door records doors.removed[id] = 1 and sets no tag.
- Prefab: door_leaf builds inside 0.04 × 2.00 × 0.80 and centred (m13 A1/A2 over all 17 defs); scene meshes 523; m13 co-op frame 1107 calls.
- ./tools/syntax-check.sh: checked 105 file(s); 0 with syntax errors. Suite totals: m19 127 new; m5 +11, m13 +5, m11 +8 (M12's sweep count is theirs); every other suite unchanged in count.

Deviations from the brief:
- Removed leaf is LAID FLAT at an authored rest pose (house.js leafRestPose, per-door `lay: 'wall'|'room'`) rather than merely flipped Dynamic where it stands: a 40 mm panel balanced on its edge topples onto whoever unscrewed it, billing damage for correct preparation. Rest spots are beside the doorway, out of the opening, 0.02 m off the wall face, and asserted clear of every spawn/wall (m5 DL2–DL5); DOOR.rehangRange 1.25 m (horizontal) covers all four (0.79–1.04 m) so Q from where it lies is the undo.
- Leaf records carry `swing` (which side of the wall the leaf opens into) and `lay` beyond the brief's `{ t, hinge }` — a jamb alone does not fix where a leaf stands (house.js:112-131 INTERIOR_DOORS, scene.js:83 APERTURES); door34's record carries `front: true` so invoice.js never learns a level id; APERTURES records gained `height`. interior32 swings OUT onto the grass: an inward leaf's rest strip is where door34's leaf is laid down (m5 DL5 would fail), and interior32 opens onto no room.
- DOOR_STATE 'hung' is NOT emitted at boot: M9's captions run on sim time and four 'door on its hinges' captions queued at boot would greet the player after START. The boot state is data (entity.state.hung === true); the CUES row has removed/rehung/_ only, and the 'rehung' reset event carries `reason`. Payloads carry entityId (positional cue) and `by`.
- cargo.loadedEntities() is NOT filtered (the brief's risk note asked for it): src/cargo/cargo.js is outside M11's files and a leaf in the truck does take space (§9.2, cargo.js:53-79). The contract panel's 'in the truck' and the objective line count manifest cargo only (main.js contractFacts filters e.manifest !== false) — asserted m19 D2e.
- DOOR.removeSeconds is scaled by TOOLS.screwdriver.timeScale (1.0) like every screwdriver job (tools.js disassemble:424) — D4's 45 000 ms is unchanged at timeScale 1.
- m19 D6's through-cases push for 4 s, the window m6 E16d uses (tools/m6-tests.js:1043), not the brief's 3 s: the legs-off couch creeps at ~0.45 m/s² against 552 N of floor friction and the far-face criterion needs 2.56 m; at 3 s it is 0.55 m short while still moving 1.4 m/s. The stopped cases keep 3 s. Also: pieces are parked on the pad after the disassembly and the couch parked BEFORE disassembling — M12's disassemble now spawns four legs beside the parent where it stands.
- m13 B1/B1b now call registry.syncMeshes() and scene.updateMatrixWorld(true) before sweeping: headless, every entity mesh sat at the origin (meshes sync only on the render frame; Box3.setFromObject(child) reads the parent Group's stale matrixWorld), so the sweeps were vacuous for entities — B1c caught it (it found zero leaves). The sweep box is unchanged.
- m11 B7c is untouched (M12 adds situation 9 there); the door verbs are asserted in a separate section DL with their own 2-made/2-honoured count. m19's screwdriver is picked up from open ground with an exact aim: the rack sits under the truck deck and the third-person camera behind a mover standing there aims through the deck collider (interact.js smallToolAssist loses the tie); m11's rack pickups work by the lagging camera happening to sit elsewhere.
- A HELD leaf cannot be hung back (interact._atJamb returns false while entity.state.held): put it down, then Q. Otherwise a grip spring would pull on a Fixed body with the leaf left in the held collision group.
- hungClear rounds to the micrometre so 0.86 − 0.04 === 0.82 (D1 compares with ===). tightestOnRoute's default (no predicate) now treats every authored leaf as hung — m5 B6/B7/H6a/H7 were restated for doors-off with B6b/H6b/H7c added for hung, as the map's proposal foresaw.
- m19 D2's 'AABB inside its opening's x/z span' is asserted as: along-wall span inside the gap and flush at the hinge jamb (0.04 thick); across the wall, hinge end on the wall's centre plane and free end 0.80 m into the swing room; y [0, 2.00] ± 1e-3 (the physical floor is the ground collider at y = 0, world.js:193-199; the plank mesh at 0.015 has no collider).
- D5's one-hand lift is measured with the grip over the centre of mass after the handle grab is asserted separately: a door held by its handle alone dangles from one point (§6.2), which is not what 'lifted clear of the floor' means for a flat panel.

### M12

### M12 — Loose parts are real bodies — detached parts and broken cargo become trackable pieces — 2026-09-04

GDD §9.1 (the screwdriver "changes an object's dimensions and creates loose parts … loose pieces get lost"); §26.4 ("broken required cargo stays deliverable or becomes trackable pieces"); §26.6 ("reset removes … fragments"); §2.2 (a piece somewhere inconvenient is a state, not a refusal); §12.3 (settled validation per piece); §15.1 (the invoice names what was lost); §22.4 (plain serializable state).

**Hypothesis.** TOOLS.screwdriver.partMassFraction (0.14) had no consumer anywhere in src/ or tools/ and a detached part was a string in `state.removedParts`, so §9.1's second clause, §26.4's "trackable pieces" and §26.6's "fragments" had been vacuous for three phases (KNOWN_ISSUES). Taking the couch's legs off should leave 12.6 kg of legs on the floor that ALSO have to reach the truck, or the invoice says what was left — preparation creates new logistics, not a free shrink.

**What changed.** New config block `PARTS` (partMassFraction moves here from TOOLS.screwdriver, which keeps the key as a one-phase alias; reattachRange 1.5 m, pieceSpacing 0.35, pieceGap 0.05, stackGap 0.004, pieceClearance 0.12, spawnLift 0.01, brokenFragmentCount by fragility {2,2,3,3}, fragmentScale 0.30, fragmentMinDim 0.06, leftBehindCostFraction 1.0). Every authored disassembly row now carries `piece: { name, count, dims, prefab }` — couch legs 4 x 60x80x60 mm, chair and side-table legs lying flat, TV stand, 4 shelf boards, wardrobe doors 2 x 0.58x0.04x1.90, fridge doors 2 x 0.62x0.05x0.80 — and validateDef refuses a part without one. `definitions.pieceDefFor` / `fragmentDefFor` derive a memoised ObjectDef per parent/part (mass and replacementValue = parent x 0.14 / count, the parent's fragility, category 'part', a label 'couch 3seat leg'); `registry.spawn` accepts such a def object. `disassemble()` spawns the pieces through the registry beside the parent — `pieceSlots` tries the four faces of the parent's world AABB and two turns, stacks flat pieces, rows the rest, raycasts the floor under each slot and rejects slots that intersect any other collider — records `state.parts[part] = [ids]` and returns `pieces`; `reassemble()` REFUSES while any piece is outside PARTS.reattachRange (horizontal) and otherwise removes the piece bodies; `{ force: true }` is the contract reset's gather. The prompt reads 'find the legs (1 of 4 missing)' where it used to promise 'put the legs back on', and Q says the same and changes nothing (interact.js `_partLabel`, `partStatus`). The manifest gates a row on its pieces: `stepManifest` writes piecesTotal / piecesMissing / partsLeft / fragmentsLeft per row, `delivered` requires piecesMissing 0, `deliveryStatus` says 'parts missing (4 of 4 legs)', the objective line appends '— 4 loose parts still to bring in', `manifestSummary` carries piecesMissing and piecesLeft. The invoice gains LINE_KINDS.PARTS_LEFT 'parts left behind' (2 legs = 2 x 31.50 x 1.0 = 63.00, detail 'parts left at pickup — couch 3seat: 2 of 4 legs', evidence = the row ids), `reconcile()` re-derives it from the rows and refuses a mismatch, and the review has an actual-event tag `parts_left_behind` ('The couch arrived. Its legs are in the old house.'). Broken cargo: when damage.js drives an item INTO the 'broken' band it stays the deliverable hulk (row, mass, collider untouched) and `breakInto` leaves PARTS.brokenFragmentCount[fragility] fragments beside it — real, grabbable, damage-tracked bodies priced at 0 (the band already charged the item) that never gate delivery; PART_CHANGED 'broken' carries `pieces`. The M6 recorder counts `piecesCreated` (from PART_CHANGED 'removed'/'broken') and `piecesLeftBehind` (written at settlement from the manifest). `resetContract`'s unwind force-reassembles every part, clears every fragment and sweeps any piece left, before the counters are read and game.reset() replaces the state. Five piece prefabs (leg, panel, board, stand, fragment), each inside its dimensions and centred. registry.count now means BODIES; `registry.pieces()` / `pieceCount` are the pieces.

**Checked.** New tools/m20-tests.js **89 ALL-PASS**: P1 four legs, isDynamic, 3.15 kg by def and by body, category 'part', resting at y 0.040 after 60 frames 0.62-0.80 m from the couch and outside its AABB, registry.count +4, zero IMPACT/DAMAGE_APPLIED from the disassembly; P2 reassemble removes 4 and restores 0.85 (E15 numbers), refuses with one leg 3 m away, prompt 'find the legs (1 of 4 missing)', Q changes nothing; P3 couch settled in dest_living with legs at pickup NOT delivered (piecesMissing 4), delivered on the next stepManifest once the legs are in, manifest total 23; P4 one 'parts left behind' line of exactly 63.00 citing the row, reconcile ok, tampered line refused, absent with everything delivered; P5 TV dropped 1.5 m -> condition 0.0 broken -> 3 fragments (grabbable, IMPACT on a drop, ledger lines cost 0), hulk delivers with 3 fragments left, item-damage line unchanged to the cent; P6 reset -> 0 pieces, registry.count 27 (23 + M11's 4 door leaves), bodies 75 as at boot; P7 counters piecesCreated 3 / piecesLeftBehind 5, JSON round-trips; P8 4 legs loaded, volumeUsed 0.001152 m3, 12.6 kg; P9 all 24 derived prefabs inside their dims and centred; P10 the validator. Regressions: m6 **109** (E16 with M11's living_kitchen leaf taken off for the 0.86 pushes: -6.867 / -3.895 with 8.3 mm / -7.563 — M8's numbers), m11 **150** (9 promises made, 9 honoured: the reassemble refusal is situation 9), m9 41, m10 45, m13 71, m14 37 (registry 27 and bodies 75 constant over three runs), m0 126; also m8 38 and m17 103. `./tools/syntax-check.sh`: 105 files, 0 errors.

**Deliberately.** Fragments are trackable, never priced and never a gate (§26.4 'stays deliverable OR becomes trackable pieces'; the broken band already billed the item). Reach is horizontal — a wardrobe's doors at its foot are 'here'. Flat pieces stack; a 4-board row was 3.2 m long. The brief's upright 1.9 m door dims would topple onto the wardrobe and bill damage on its own pieces, so pieces are authored resting.

Measured:
- Couch legs: 4 bodies of 90 x 0.14 / 4 = 3.15 kg (12.6 kg together), 60 x 80 x 60 mm, replacementValue share 31.50 each; wardrobe door 5.25 kg; chair leg 0.245 kg (under MASS_CLASS.light's 1 kg floor — parts are exempt)
- Piece placement at the m11 pad: the +z face row at 0.35 m spacing, legs resting at y 0.040 after 60 frames, 0.62-0.80 m from the couch centre; 0 IMPACT / 0 DAMAGE_APPLIED / 0 ledger lines from a disassembly (spawnLift 0.01 m = 0.44 m/s drop, under the 0.7 m/s 'extreme' threshold)
- Invoice: 2 legs left behind = -63.00 ('parts left at pickup — couch 3seat: 2 of 4 legs'); reconcile() re-derives it from the manifest rows; the wardrobe's two doors left at m14's pad would bill 2 x 36.40 = 72.80
- Broken cargo: the TV dropped 1.5 m reaches condition 0.0 ('broken') and leaves 3 fragments of 22 x 0.14 / 3 = 1.027 kg (0.372 x 0.09 x 0.216 m); fragment ledger lines cost 0; the item-damage line is unchanged in amount; the hulk's row completes with 3 fragments left
- Reset: 4 legs + 3 fragments loose -> 0 pieces, registry.count 27 (23 manifest bodies + M11's 4 door leaves), physics.stats.bodies 75 — the same as boot; m14: registry 27 and bodies 75 at every sample over three runs
- Cargo: 4 legs loaded, volumeUsed 0.001152 m3 (± 1e-4), packQuality.totalMass 12.6 kg
- Reattach reach measured horizontally: a wardrobe's doors at its foot read 1.72 m in 3D (centre 1.02 m up) and refused; in xz they are 1.37-1.41 m, within 1.5
- m6 E16 with M11's living_kitchen leaf HUNG: intact couch at 700 N jams at centre -3.941 (0.86 - 0.04 = 0.82 < 0.85); with the leaf off the M8 numbers return exactly: legs off 600 N -6.867, intact 600 N -3.895 with 8.3 mm, intact 700 N -7.563
- m6 E16 without `force`: the 'legs on' push was silently legs-off (2087 mm 'penetration' at the 32" jamb) because reassemble() now refuses with the legs left at the start line
- Run summary after the m20 settlement: piecesCreated 3 (the fragments went through the bus; the suite's direct disassemble() calls do not emit), piecesLeftBehind 5 (2 legs + 3 fragments)

Deviations from the brief:
- Broken-cargo trigger is ENTERING the 'broken' band (condition < 35, DAMAGE.bands), not condition === 0: the brief says 'condition to 0 (the broken band)' as one thing; the band is the state the invoice prices at 100%, so it is the boundary that means 'broken' (src/damage/damage.js step: bandBefore !== 'broken' && bandFor(after) === 'broken'). The m8 drop pattern reaches 0.0 anyway (m20 P5).
- Fragments do NOT gate delivery and are NOT priced (only detached authored parts do both). §26.4 says 'stays deliverable OR becomes trackable pieces' and the brief's own P5 says 'row completes when the hulk reaches its zone'; the broken band already charged the whole replacementValue, so a fragment line would bill one mistake twice. Rows carry fragmentsLeft for the run summary (piecesLeftBehind counts them).
- Reattach reach is HORIZONTAL (xz) distance from the parent's centre (src/tools/tools.js partStatus): 3D distance refused a wardrobe's doors lying at its foot (m6 E5/E6/E11 and m11 C10 failed on the first run: 1.72 m in 3D for pieces touching it).
- Piece dims are authored in their RESTING orientation (chair/side-table legs lying flat, doors lying flat 0.58x0.04x1.90) rather than the brief's upright 0.02x1.9x0.55: an upright 1.9 m leaf topples onto its parent and bills damage on its own pieces, which P1h forbids. Flat pieces (doors, boards) STACK on one footprint instead of forming a row (4 shelf boards in a row were 3.2 m long); a piece is turned so its long axis lies along the parent's face first, then out from it.
- registry.count pins: NONE needed changing. m14 S7 samples 'strap live' BEFORE the doors come off and 'after run' after the reset (registry 27 at every sample); m13 C3 measures colliders at boot; m11 G9 and m15 pin game.state.manifest.length (rows, 23). registry.count therefore means BODIES (P1: +4); registry.pieces() / pieceCount carry the other meaning.
- m11 promise sweep: situation 9 is a Q promise (describe().secondary -> secondary()), because the refusal has no E verb (nothing left to take off); the sweep takes an optional key per situation. 9 made, 9 honoured. B7c reworded 'M8+M12'; B7d added.
- The fragmentation event reuses EVENTS.PART_CHANGED with action 'broken' (eventBus.js is not in my file list and M11 owns it this batch); the recorder classifies 'broken' as piecesCreated, not partChanges.
- m13's A-series is not extended (m13-tests.js not in my file list): the piece prefabs' bounds are asserted in m20 P9 over definitions.derivedDefs() (24 derived defs: 7 piece kinds, 17 fragment kinds incl. M11's door leaf).
- src/cargo/cargo.js, tools/m9-tests.js, tools/m10-tests.js: listed in filesTouched but UNTOUCHED — loadedEntities/volumeUsed/packQuality already iterate every registry entity (m20 P8 asserts), and the m9/m10 fixtures needed no change (41 and 45 ALL-PASS).
- m6 E16d-f: the living_kitchen door leaf (M11, landed during this batch) is unhung into the field for the three 0.86 pushes and hung back after — an M11-caused regression (intact 700 N jams at -3.941) patched in m6 because m6 is in my file list and M11's regression list omits m6.
- registry.spawn accepts a definition object (piece defs are derived, not OBJECT_DEFS keys); M11's third `opts` parameter coexists.
- The M6 recorder counts piecesCreated from bus events only; the suite's direct disassemble() calls are silent by design (interact.js emits), so the settled summary shows 3 (fragments), which P7 asserts as such.

## Phase 19 — Phase 11 build side, batch 4: sound with captions, and the solo drag travels — 2026-09-04

Phase 11's build side (GDD §25.2: onboarding, settings, instrumentation, fixes), from the ordered plan in docs/PHASE11_PLAN.md. Each milestone was built by a file-owned implementer and adversarially reviewed against its brief; the numbers below are the ones the reviews reproduced.

**1615 assertions across 19 suites, all passing.**

### M9

### M9 — Synthesised audio layer with captions — WebAudio, zero files — 2026-09-04

GDD §20.4 (material impacts, constraints, character strain, vehicle, invoice stinger — five of the six layers; music deliberately absent), §8.4 "material sound" at impact, §5.2 "strain audio", §10.3 "snap sound and released cargo", §21.4 Hearing (subtitles with direction, volume categories), §26.5 "subtitles … exist", §26.6 no unbounded growth, §22.4 audio reads state and never writes it.

**Hypothesis.** The build was completely silent (grep AudioContext|oscillator in src: 0 executable hits) and §26.5's "subtitles exist" had nothing to caption. Dev\INDEX.md records the synth written four times; this is the fifth adaptation, copied from SmallTownEmergencyServices\src\audio\audio.js with its names — `tone`, `makeNoise`, `atten`, the pure `mixFor` seam, the `CUES` data table, `cueFor`/`cueVolume`, `SILENT_EVENTS`, `arm()`/resume-on-gesture — plus Chameleon's `toneP` pan folded into `tone` and AirportBaggageCrew's `variant`/`variants`/`_` rows.

**What changed.** New `src/audio/audio.js`: `mixFor(state, listeners, world)` is pure over plain data — engine {gain, pitch} only in TRANSIT from the route's progress (idle 0.35 at the kerb, 1.0 mid-route), a dolly roll above AUDIO.roll.minSpeed attenuated to the NEAREST seat by the squared law, strain from the carried mass (saturating, mass/(mass+45)) with pitch climbing with imbalance and §5.2 exertion as a floor, a rattle in transit ∝ (1 − pack quality) below 0.9, wind outdoors. `CUES` has 11 rows / 44 recipes keyed by EVENTS name — IMPACT by surface tag (wood/metal/glass/cardboard/fabric) with loudness ∝ relVelocity above 0.5 m/s, DAMAGE_APPLIED by band, GRIP_STARTED/ENDED (the 'pulled out of reach' tear is a snap), STRAP_CHANGED per state ('failed' is the twang), TOOL_STATE per state, PART_CHANGED ratchet, CARGO_STATE chime/low note, ROAD_FORCE whoomp ∝ severity, RECOVERY pop, CONTRACT_PHASE stings (settlement = the invoice) — every row and variant with `minGapMs` and a `caption`; `SILENT_EVENTS` names the other five on purpose, and m18 A1 fails on a sixth. `GameAudio(bus)` subscribes by cue name with a bounded O(1) push inside the fixed step; `update(state, world, listeners, dt)` drains it on the RENDER frame after the HUD feed (main.js), captions with or without a context, schedules ≤ AUDIO.maxVoices (24) partials, and ramps five continuous loops; `arm()` builds the graph in a gesture (START, canvas click, any key, the pause card's Resume) and returns false on a refused or missing AudioContext, which leaves the game identical. `?audio=off` builds it disabled. The HUD gains a `.caption` line bottom-centre above the route bar and help line, showing the last cue's caption for AUDIO.captionMs (2600 ms of sim time) with a ← → ↑ ↓ chip from the seat's own facing when the cue happened somewhere. The M4 card gains a Sound group — Master / Interface / World volume and a Captions switch — as shell keys (audioMaster, audioUi, audioWorld, captions) routed to `audio.setMaster`/`setBus` and every HUD, persisted and clamped by save.js. Config: the frozen `AUDIO` block; no bare literal in audio.js.

**Measured.** Boot on the driveway: every bed 0 except wind. Strain at 30 kg: gain 0.40 / 0.50 / 0.60 and pitch 1.00 / 1.40 / 1.80 at imbalance 0 / 0.5 / 1.0; at 90 kg gain 0.667 / 0.833 / 1.0. A dolly at 1.2 m/s: 0.636 at 1 m, 0.582 at 2 m, 0.308 at 8 m, 0.019 at 20 m — 2 m from one seat vs 20 m from both is 30.3× louder. Engine parked 0.35 / pitch 0.6, mid-route 1.0 / 2.5, a real drive 12 % in 0.995 / 2.48. Impact volume 0 / 0.261 / 0.483 / 0.928 / 1.400 at 0.4 / 1 / 2 / 4 / 8 m/s. A thousand impacts in one frame: queue 24, 976 dropped at the queue, 1 played (minGap 90 ms), 3 voices. Same seed, same script (TV + box dropped, 320 frames), layer detached / attached-and-armed / detached: game.state JSON deep-equal all three, 4 ledger lines each, 3 cues played in the attached run. In a real Chrome: START → context 'running'; an impact 3 m to the right → 1 cue, caption '→ wooden thud'.

**Checked.** New `tools/m18-tests.js` **159 assertions ALL-PASS** (A1–A13, Z); m16 116 (the U2 consumption walk now covers the four Sound rows), m15 108, m0 126, m11 149 — all ALL-PASS; `tools/_probe-audio.js` prints the mix table. `./tools/syntax-check.sh`: 100 files, 0 errors.

Measured:
- Vocabulary: 11 cued EVENTS (IMPACT, DAMAGE_APPLIED, GRIP_STARTED, GRIP_ENDED, STRAP_CHANGED, TOOL_STATE, PART_CHANGED, CARGO_STATE, ROAD_FORCE, RECOVERY, CONTRACT_PHASE), 5 silent (SIM_RESET, SIM_PAUSED, SIM_RESUMED, INPUT_CONTEXT, ZONE_CHANGED), 16 events; 44 recipes across the 11 rows, every one captioned.
- Boot mix on the driveway: engine 0, roll 0, strain 0, rattle 0, wind 1 (outdoors); listener seat 0 at (-0.9, 5).
- Strain (mixFor): 30 kg at imbalance 0 / 0.5 / 1.0 → gain 0.400 / 0.500 / 0.600, pitch 1.00 / 1.40 / 1.80; 90 kg → gain 0.667 / 0.833 / 1.000. A4's line at imbalance 0.3: 0 / 30 / 90 kg → 0.000 / 0.460 / 0.767.
- Dolly roll at 1.2 m/s: 1 / 2 / 8 / 20 m → 0.636 / 0.582 / 0.308 / 0.019 (atten 0.918 / 0.840 / 0.444 / 0.028, RANGE.roll 24 m). A6: 2 m from seat 1 vs 20 m from both = 0.5817 vs 0.0192, ratio 30.3× (≥ 4 required).
- Engine: parked in TRANSIT gain 0.35 pitch 0.6 (idle); progress 0.06 → 0.675 / 1.55; 0.50 → 1.0 / 2.5; 0.97 → 0.513 / 1.075; a real route.depart() 200 frames in (12 %) → 0.995 / 2.48.
- Rattle in transit with 5 items: unsecured 0 / 0.2 / 0.6 / 1.0 → 0 / 0.200 / 0.600 / 1.000 (qualityBelow 0.9).
- IMPACT cueVolume at 0.4 / 1 / 2 / 4 / 8 m/s: 0.000 / 0.261 / 0.483 / 0.928 / 1.400 (minVelocity 0.5, cap 1.4).
- Bounded: 1000 IMPACT events in one frame → queue 24 (AUDIO.maxVoices), 976 dropped at the queue, 1 cue played (minGapMs 90 collapses the rest), 3 live voices, stamp map 1 entry; every cued type fired once a second apart → 12 played, peak voices ≤ 24, all 11 captions correct.
- Captions: AUDIO.captionMs 2600 → A8's caption is gone after 163 driven frames (2700 ms sim); a cue 6 m ahead reads '↑ wooden thud', 6 m to the left '← wooden thud'; caption box top at 1280×720 sits in the bottom third.
- Determinism (A12, m17 R6 script: TV from 1.5 m + box from 1.0 m, 320 frames): 4 ledger lines each run; run B (attached, armed on the stand-in, 3 cues played, audioFrame + feedHuds every frame) → game.state JSON deep-equals run A (detached) and the control run C.
- Real browser (Chrome via the pane, ?tier=gpu): clicking START → AudioContext state 'running', armed; an IMPACT 3 m to the right → played 1, voices back to 0, HUD caption '→ wooden thud' bottom-centre above the help line, no error banner.
- Suites: m18 159 ALL-PASS (twice), m16 116, m15 108, m0 126, m11 149, probe 2 — suite total rises by m18's 159 only.
- ./tools/syntax-check.sh: checked 100 file(s); 0 with syntax errors (run after the concurrent config.js edit from the other milestone landed).

Deviations from the brief:
- mixFor signature is mixFor(state, listeners, world) — a third plain-data argument. The brief's mixFor(state, listeners) cannot be pure AND read the route, the pack quality, the carried mass or a dolly's speed: none of those are in game.state (§22.4; route.js status(), cargo.js packQuality(), controller.js carriedMass/imbalance, tools.js attachedTo + body.linvel()). main.js audioWorld() builds the view each render frame; the update(state, world, listeners, dt) signature is as briefed.
- GRIP_ENDED has no 'overstretched' reason: grip.js:380 releases with 'pulled out of reach' (the spring band exceeded — the tear), :456 'slipped', :362 'object gone', main.js 'released' / 'contract reset', controller knockDown reasons via onForcedRelease. The snap variant is keyed 'pulled out of reach'; 'slipped' is a slip; everything else falls to the '_' 'dropped' variant.
- DAMAGE_APPLIED bands are scratched / cracked / broken (config.js DAMAGE.bands) — the brief's 'chipped' does not exist; the variants follow the real table with a '_' fallback.
- Caption timing runs on SIM time (world.nowMs = game.clock.simTimeMs), not performance.now(): the harness's --virtual-time-budget freezes performance.now() (m17 measured 0.000 ms) and A8 asks for 'driven sim frames'. A paused game holds the caption; the pause card covers it.
- The HUD feed reads audio.lastCaption BEFORE audio.update drains the queue (the brief: 'update in the render loop after the HUD feed'), so a caption appears one render frame after its cue; suites call M.audioFrame() then M.feedHuds().
- The foley bus is a child of the world bus (foley → world → master), so the card's three sliders cover all four buses (setBus('foley') still works independently). Asserted m18 A11d5.
- A3 drives the phase with game.setPhase (allowed by the brief) and adds a real route.depart() + 200 frames check rather than the cab seam, to keep the section independent of m11's lookAt fixture.
- Cues arriving while the context is not 'running' (suspended by autoplay policy, or interrupted) are captioned but NOT scheduled: a suspended clock never ends a voice, so scheduling into it would pin info().voices at the cap and then drop everything after a resume. Asserted m18 A9h.
- The bus handler is not gated on `armed` (INDEX rule 'armed guard at the subscription') because captions must work with no context at all (§26.5 subtitles for a player with sound off); the handler is a bounded O(1) push and the table lookup happens on the render frame.
- `?audio=off` disables captions as well (the brief: 'update() a no-op'); the captions switch on the card is the accessibility control.
- tools/m16-tests.js V4 fixture `x.shell` gained the four shell keys (load() now returns them and V4 deep-equals load() to x) — the same edit M6 made for `runs`; V4c's six-key list is untouched because the audio keys live under shell.
- TOOL_STATE has six states (attached/detached/covered/deployed from tools.js, carried/dropped from interact.js:512/530), PART_CHANGED's key is `action` ('removed'/'restored'), CARGO_STATE's is `loaded` — the variants follow the emit sites, not the brief's shorthand.
- directionGlyph also returns ↓ for a cue behind the listener (the brief listed ← → ↑); within AUDIO.captionNearM (0.75 m) no glyph.
- SIM_RESET is in SILENT_EVENTS (the brief listed it); the layer's own SIM_RESET subscription flushes the queue, the gap stamps and the caption instead.
- Headless Chrome constructs a real AudioContext when a suite calls title.start() (m16 U0) or the pause card's Resume (m15 P4) — measured harmless: both suites unchanged and ALL-PASS; the live layer in m18 is asserted unarmed (A8a) because nothing there presses START.

### M10

## Phase 11 — M10: hand-frame grip damping — the solo couch drag actually travels — 2026-09-04

GDD §26.2 'a couch-equivalent can be dragged solo and handled materially better with another grip'; §2.1 'allow awkward solo dragging'; §6.3 heavy tier 'one drags or pivots'; §3.3 at least two approaches; §25.2 Phase 3 gate 'weight legible without hard denial'.

**Hypothesis.** M7 measured the cause to the number: the grip damped against the object's ABSOLUTE velocity (grip.js `c·vp`, c = 2√(900×90) = 569 N·s/m), so a towed couch could follow a hand no faster than (k·band − 552)/569 = 0.137 m/s unbraced / 0.248 m/s braced, and a traction budget alone could only tear the hold or topple the fridge. Damping the RELATIVE velocity, c·(vp − vHand), removes the brake against the world while keeping the spring critically damped; a tow cap that knows about floor friction and the pull's haul-back, and a tow ACCELERATION cap from the band's spare stretch, then let a lone mover walk at a speed the couch can follow — and the traction seam can come off zero.

**Touched.** `src/player/grip.js` (per-grip `lastTarget`/`handSteps`/`lastHandSpeed`; finite-difference hand velocity with GRIP.handJumpReset, GRIP.maxHandSpeed and a GRIP.handVelWarmupSteps window after a grab or a jump; damping term `cPerHand·(vp − w·vHand)`; `capPerHand(entity, hands, brace, fresh)` shared by step, the cap and the §5.2 exertion reference; `towLimits()`/`towFor()` — friction-aware via `effectiveFloorFriction(entity, R)` which reads the collider's CURRENT coefficient and combine rule (Average 552 N bare, Min 35 N on the dolly); `tuning` instance override), `src/player/controller.js` (`towAccelLimit`, applied only while speeding up; `_updateBalance` charges only the pull's component across the intended movement, all of it under CARRY.imbalanceStandingIntent), `src/config.js` (GRIP.handFrameDamping 1.0, maxHandSpeed 6.0, handJumpReset 0.25, handVelWarmupSteps 2, towFloorFriction 0.9, towSpeedSafety 0.55→0.65 re-derived, towAccelSafety 0.85, towSpeedFloor 0.15; CARRY.tractionN 0→350, braceTractionN 0→380, imbalanceStandingIntent 0.1), `tools/m2-tests.js` (harness clears forces; new H1–H4), `tools/m3-tests.js` (harness clears forces; E3 reports), `tools/m4-tests.js` (E4/E4a/E5 two-mover drag), `tools/m6-tests.js` (haulDistance reports the SIGNED along-haul displacement and the legs' own speed; B4, B6, B8, B9, B10a, B10b, B10c rewritten to the measured truth; B9a; B11–B11e closed forms), `tools/_probe-drag.js` (the sweep; its default run prints the shipped table, the safety sweep and the topple boundary).

**Result.** One mover, one hand, 180 steps (m6 haulDistance), everything else parked clear:

| haul | before (M7) | after (M10) |
|---|---|---|
| bare couch, unbraced | 0.000 m, held, F 422 N, stretch 0.47 | **0.34 m**, held 180/180, F 618 N, stretch 0.61, couch peak 0.26 m/s (2.45 m in 10 s, no stumble) |
| bare couch, braced | 0.00 m, held | +0.02 m along the haul (0.45 m in 10 s), held — an anchor, see below |
| couch on dolly | 2.12 m | **6.52 m**, 2.6 m/s |
| fridge bare, unbraced / braced | 0.00 / 0.00 m | 0.00 / 0.00 m, tilt 0.0° (F 383 / 408 N; 412 / 457 N after 10 s) |
| fridge on dolly | 1.49 m | 5.37 m |
| two movers one hand each, unbraced / braced | 1.34 / 0.05 m | **5.09** / 2.34 m, held 180/180 |
| m4 lift binary | one hand 458 N / 0.000 m clear; two 895 N / 0.011 m | one hand 478 N / 0.000 m; two 906 N / **0.037 m** clear |
| m3 solo drag (240 steps, exits at 0.8 m) | 8 mm net (Phase 3) | 0.80 m net, peak 0.91 m/s, mover 1.43 m, never lost |

Tow caps now (one hand): couch 1.23 m/s = hand 0.42 + haul-back 0.81, legs may accelerate at 0.74 m/s²; couch on dolly 2.49; two movers 2.37 each (walk binds at 2.1); fridge untowable → 0.15 m/s crawl; 9 kg box 4.78 (a loaded run is 4.5: never binds), accel 53.

**Why braced is an anchor, not the faster technique.** A braced mover's legs walk at 0.45× (§5.1) — measured 0.76 m/s peak under the couch's load — against a haul-back of (552 − 380)/249.6 = 0.69 m/s, so the hand nets ~0.03 m/s. A braced budget high enough to change that (≥ 430–450 N) topples the fridge: measured over 10 s at the 0.15 m/s crawl (tools/_probe-drag.js, default run), braceTractionN 380 → 445–457 N and tilt 0.0°, 420 → toppled at 6.8 s, 440 → 6.3 s; 380 at a 0.25 m/s crawl → 6.5 s. m6 B9 asserts the anchor as a signed number (couch displacement along the haul ≥ −0.05 m, measured +0.020; held, mover < 1 m, stretch under the braced band) and B9a pins braced < unbraced as the product decision; B10b keeps the binary.

**Three things the tow exposed, all fixed and pinned.** (1) Without an acceleration cap the legs reach walking pace in one step, the hand-frame term feeds the whole velocity gap forward, the force pins at 750 N, the pull overshoots and the couch inches along at 0.25–0.5 m per 3 s (first probe run). (2) §5.2 exertion referenced the TIRED cap — positive feedback, 3.3 s from rested to the 60% floor, and for the couch a cap under floor friction: 0.27 m in 3 s, 0.36 m in 10 s. Now referenced to the fresh cap, computed by `capPerHand(…, fresh)` rather than divided back out (the division over-stated the reference on acceleration-bound light loads while tired). (3) The sustained haul-back, charged in full as 'sideways pull', stumbled the mover at 2.5 s and knocked them down at 7.3 s ('overloaded'); only the component across the intended movement counts now. And a harness defect: m2 and m3 never cleared Rapier's persisting forces, which world-frame damping happened to self-cancel; hand-frame damping made a dropped box gain 1.0 m/s per step with no contact (m2 F8a) until the harnesses matched main.js.

**Checked.** m2 75, m3 65, m4 62, m6 109 (all ALL-PASS); m11 149, m13 71 regressions. m2 H1 600 steps at rest: hand-object variance ~1e-8 m² (< 1e-4); H2 a hand driven at 6 m/s into the wall never pushes the box through; H3 a 0.30 m target jump feeds nothing forward; H4 the warm-up. m6 B11 pins GRIP.towFloorFriction to the ground collider's real friction.

Measured:
- FIX-PASS RE-MEASUREMENT (every number reproduced after the fixes; nothing that moves a number changed — the capPerHand fresh-cap fix is identical at strengthFraction 1 and the standing-intent constant equals the old literal). One mover, one hand, 180 steps, shipped config. Bare couch unbraced: 0.344 m along +0.344, held 180/180, F 618 N, stretch 0.61, pull 0.84, tow cap 1.09, couch peak 0.26 m/s, mover net peak 0.46, legs peak 1.18 m/s, tilt 0.0°. 10 s: 2.450 m, held.
- Bare couch braced: 0.021 m along +0.020, held 180/180, mover 0.63 m, F 566-574 N, stretch 0.61 of 0.77, pull 0.67, tow cap 2.00 (not binding), couch peak 0.04 m/s, mover net peak 0.60, LEGS peak 0.76 m/s against a haul-back of (552 - 380)/249.6 = 0.69 m/s (m3 D5c prints 0.69). 10 s: 0.448 m. So braced legs ~0.72-0.76, haul-back 0.69, net ~0.03 m/s — the review's 0.69 stands and the implementer's '0.63 vs 0.67' was wrong (0.63 was the mover's NET displacement over 3 s, 0.67 the peak pull).
- Couch on dolly: 6.524 m, tow cap 2.49, F 750 N, stretch 0.25, objPeak 2.63 m/s, held 180/180. Two movers one hand each unbraced: 5.09 m in the m6 harness (5.241 in the probe), held 180/180, F 557-576 N, objPeak 2.08-2.09; braced pair 2.34-2.38 m.
- Fridge bare unbraced 0.000 m, F 383 N, tilt 0.0°; braced 0.000 m, F 408 N, 0.0°; braced 10 s 0.000 m, F 457 N, 0.0°. Fridge on dolly 5.370 m. Fridge grabbed at 1.2 m unbraced: 0.092 m and 5.9° at 3 s; over 10 s TORN (slipped) at 6.88 s, tilt 90° — the in-game topple, unchanged.
- TOPPLE BOUNDARY, now in the probe's default run (braced, 600 steps, grab 0.875 m, instance overrides): crawl 0.15, T 350/380 -> 0.000 m, held, F 445 N, tilt 0.0° (the shipped-set row of the same haul reads 457 N); T 350/420 -> toppled, torn 'pulled out of reach' at 6.80 s, tilt 90°; T 350/440 -> 6.33 s; crawl 0.25, T 350/380 -> 6.48 s. These are the rows the implementer quoted as 6.7 / 6.3 / 6.3 s from the non-selectable 'floor' mode; re-measured and reproducible by `-Tests tools/_probe-drag.js` with no edit.
- SAFETY SWEEP (towAccelSafety x towSpeedSafety, from the same run): 0.6/0.55 couch 0.188 m per 3 s, 2.475 per 10 s; 0.6/0.75 0.243 / 2.037; 0.85/0.55 0.304 / 2.641; 0.85/0.75 0.376 / 2.986; 1.0/0.55 0.316 / 2.683; 1.0/0.75 0.425 / 2.687. Shipped 0.85/0.65: 0.339-0.344 / 2.450. Peak stretch 0.61-0.63 throughout.
- m4 lift binary: one mover 478 N / 0.000 m clear; two 906 N / 0.037 m clear, held 220/220. m3 E: net 0.801 m at the 0.8 m exit, peak 0.91 m/s, mover 1.43 m, F 528 N, stretch 0.513.
- Tow caps (grips.towFor, one hand unbraced): couch 1.23 m/s (hand 0.42 + haul-back 0.81), accel 0.74 m/s^2; couch on dolly 2.49, accel 5.6; fridge -> crawl 0.15; box 4.78, accel 53; two movers on the couch 2.37 each.
- Suite sizes after the fix pass: m2 75, m3 65, m4 62, m6 109 (was 108: +B9a), m11 149, m13 71.

Deviations from the brief:
- m6 B9 still does NOT assert the brief's 'braced >= 0.60 m and > 1.3x unbraced' — measured 0.021 m in 3 s / 0.448 m in 10 s vs unbraced 0.344 / 2.450, and the cause is structural (§5.1 braceSpeedMult 0.45: legs 0.76 m/s peak against a 0.69 m/s haul-back). The brief's predicate needs braceTractionN >= ~430-450 N and the probe's topple boundary (now reproducible in its default run) shows 420 N puts the fridge on its side at 6.8 s. The review's fix is applied: B9 asserts the SIGNED along-haul displacement (haulDistance.movedAlong >= -0.05 m; measured +0.020) instead of the vacuous unsigned `moved >= 0`, the assertion name says 'signed along-haul', and B9a pins braced < unbraced as the product decision. This remains the orchestrator's call (contract gap 1 in the review); the assertions now say exactly what ships.
- The brief's lag formula lag = F_f/k + 2ζv/ω is the world-frame steady lag; in the hand frame the velocity term vanishes (2.0 m/s tow at 0.35 m stretch, 2.6 at 0.25), so grip.js towLimits() returns a speed cap (velocity-step bound + haul-back) and an ACCELERATION cap (margin x k/m x towAccelSafety) that PlayerController honours only while speeding up — unchanged from the implementer's report.
- src/player/controller.js changed beyond 'tow cap plumbing': `towAccelLimit` and `_updateBalance` charging only the pull component across the intended movement (all of it when standing, now gated by CARRY.imbalanceStandingIntent instead of a bare 0.1). Both are measured necessities (750 N limit cycle; knockdown at 7.28 s). The tractionN() docstring now reads 'Shipped at 0 by M7; Phase 11 M10 set them to 350 / 380 N'.
- grip.js §5.2 exertion is referenced to the FRESH cap — now computed by `capPerHand(entity, hands, brace, fresh = true)` (the same min(strength, mass x maxAccel)/hands with the strengthFraction factor skipped), not by dividing the tired cap by strengthFraction. The division was only equal to the fresh cap when the strength term won the min; on acceleration-bound light loads (9 kg box: 225 N vs 750 N) it inflated the reference by 1/strengthFraction while tired. Identical at strengthFraction 1 (every suite number unchanged); correct while tired now.
- tools/m2-tests.js and tools/m3-tests.js step() call physics.clearForces() first (harness defect: Rapier forces compounded and world-frame damping self-cancelled the accumulator) — unchanged from the implementer's report.
- CARRY.tractionN / braceTractionN 350 / 380; GRIP.towSpeedSafety 0.55 -> 0.65 (B8 margin 4 cm over the brief's 0.30 m: 0.304 m at 0.55 vs 0.339-0.344 at 0.65, reproduced in the safety sweep); GRIP.towSpeedFloor 0.15 crawl for an untowable object — unchanged.
- Beyond the brief: m6 B11-B11e closed-form pins (implementer), m6 B9a (fixer), and the probe's default run now includes the four topple-boundary rows so the numbers bounding braceTractionN are reproducible without editing the file's mode (the review could not reproduce the 'floor' mode read-only).
- tools/m6-tests.js haulDistance gained two fields (movedAlong, peakLegSpeed) used by B9 and the show() line; haulTogether was not changed.

## Phase 18 — Phase 11 build side, batch 3: the run recorder and the seven questions, and the couch's legs come off — 2026-09-04

Phase 11's build side (GDD §25.2: onboarding, settings, instrumentation, fixes), from the ordered plan in docs/PHASE11_PLAN.md. Each milestone was built by a file-owned implementer and adversarially reviewed against its brief; the numbers below are the ones the reviews reproduced.

**1437 assertions across 18 suites, all passing.**

### M6

### M6 — run recorder, exportable run summary, and the §27.3 questionnaire on the settlement sheet — 2026-09-04

GDD §22.3 'record a lightweight event log for scoring and debugging'; §22.5 'export event log and invoice inputs for reproducible reports'; §27.3 the seven playtest questions; §27.4 'phase duration, grips, drops, recovery, damage, strap use, cargo motion, trips, completion, and restart … human-readable and deletable'; §25.2 Phase 11 'instrumentation'; §26.6 bounded logs.

**Hypothesis.** The bus log was a 256-entry ring cleared on every reset and nothing was ever exported (grep JSON.stringify|clipboard|Blob in src: 0). Of §27.4's ten signals only damage and completion had a source: trips was constant, mover recoveries emitted `fee: 0` while the invoice billed 45, object recoveries emitted nothing, `cargo.shiftSince` had no caller, and `entity.state.everHeld` was never written so `heaviestMoved` was dead. §27.3 had only ever been answered by the developer. An external playtest would have produced anecdotes; the Phase 11 gate needs numbers.

**What changed.** New `src/telemetry/runLog.js`: `RunRecorder.attach(bus)` subscribes with `bus.onAny` and keeps every event of the run — the bus's own stamped objects, a bare push, capped at `TELEMETRY.maxEventsPerRun` (5000) with a `dropped` counter; the §27.4 counters (grips, drops = GRIP_ENDED reason ≠ 'released', recoveries, damageEvents, impacts, straps by state, cargo loaded/unloaded/shifted/measured, roadEvents, worstCargoShift) live on `game.state.telemetry.counters` (plain data, zeroed by reset), `restarts` on the recorder so a reset cannot erase it. `buildRunSummary(state, invoice, review, summary, stats, recorder)` is pure: build, seed, phases, counters, invoice to the cent, review, stats, completion, restarts, questionnaire, events. `ObjectRegistry` takes an optional bus and clock and `recover()` emits one RECOVERY with `fee: ECONOMY.recoveryFee`; the mover RECOVERY carries the same fee and is announced per increment against the last announced count, so a recovery between steps is no longer missed; `registry.step` writes `everHeld`. The 'phase' system snapshots loaded positions on departure and writes `cargo.shiftSince` on arrival. `settle()` builds the summary, keeps a compact copy in the save's new sixth key `runs` (last `TELEMETRY.keepRuns` = 6, no event lists) and hands it to `invoiceScreen.show(…, { runSummary })`. New `src/ui/questionnaire.js`: the seven §27.3 sentences verbatim under the stats — Q2/Q3/Q4/Q5/Q7 as 1–5 radios with word anchors at both ends, Q1/Q6 short text, Skip — every key event stopped at the block so Escape never reaches the pause. A 'Copy run report (JSON)' button puts pretty-printed JSON on the clipboard with a select()-ed textarea fallback (the SmallTownEmergencyServices hud.js pattern); 'clear responses' empties the kept runs (§27.4 'deletable'). `resetContract` closes the record before the unwind's own events and before `game.reset()`. `window.__MFH` gains `recorder, runSummary, buildRunSummary, questionnaire, keptRuns, clearRuns`. Zero external requests: §27.4's 'opt-in upload' is the Copy button and nothing else.

**Measured.** A boot-to-settlement run (2 grips, 1 drop, 2 recoveries, a TV drop, the 28 s drive with an unstrapped fridge, the unload) is 23 events, 0 dropped; a TV drop from 1.5 m is 2 IMPACT and 2 DAMAGE_APPLIED in 300 frames and `counters.damageEvents === ledger.itemDamage.length`. The unstrapped fridge alone shifted 0.388 m over the route (1 of 1 past the 0.25 m tolerance); 3 road events. One object + one mover recovery: `counters.recoveries` 2 === `recoveryCount()` 2, invoice line 90.00. Same seed, same script, recorder off/on/off: invoice lines and ledger deep-equal (4 lines, profit −600.66 all three). Three settle→replay cycles: closed records carry restarts 1, 2, 3 and their own answers; kept runs in memory equal the store at every sample; twenty records in → 6 out. Frame cost in a real Chrome (GPU tier, 71 bodies, 600 frames per pass): systemMs mean 0.202/0.123 ms with the recorder off vs 0.181/0.154 ms on — 0.031 ms apart at worst; under the headless harness performance.now() is virtual and reads 0 either way.

**Checked.** New `tools/m17-tests.js` **103 assertions ALL-PASS**; m16 116 (V4c now pins six keys), m11 149, m14 37 (every run-1 vs run-3 equality still equal), m0 126, m8 38, m10 45 — all ALL-PASS. `./tools/syntax-check.sh`: 96 files, 0 errors. Found on the way: a ROAD_FORCE never arrives on `onAny` as ROAD_FORCE — route.js's payload `type: ev.type` is spread over the envelope by `EventBus.emit` (see KNOWN_ISSUES).

Measured:
- Recorder cap TELEMETRY.maxEventsPerRun = 5000; a boot-to-settlement m17 run (2 grips, 1 drop, 2 recoveries, TV drop, 28 s drive with an unstrapped fridge, teleport unload) is 23 events at the settlement phase change, 0 dropped; the short R5 runs settle at 7-8 events; a replay's new list starts at 2 (SIM_RESET, CONTRACT_PHASE pickup).
- TV drop from 1.5 m: 2 IMPACT and 2 DAMAGE_APPLIED in 300 frames; counters.damageEvents === ledger.itemDamage.length.
- §27.4 cargo motion, unstrapped fridge alone in the truck over the 28 s route: worst shift 0.388 m, 1 of 1 items past CARGO.shiftToleranceM (0.25 m); 3 road events (hardBrake, sharpTurn, speedBump).
- Recoveries: 1 object (registry.recover) + 1 mover (recoverNow between frames) -> counters.recoveries 2 === recoveryCount() 2, invoice recovery line 90.00 (2 x ECONOMY.recoveryFee 45); RECOVERY payload fee was 0 for movers before M6.
- Run 1 settlement: 23/23 delivered, profit -461.07; R6 script (TV + small box dropped, 260 frames): 4 ledger lines, profit -600.66 identical with recorder off / on / off — invoice lines and ledger deep-equal.
- Kept runs: memory === store at every sample (1, 2, 3); twenty records in -> 6 out (TELEMETRY.keepRuns); 'clear responses' -> 0 in memory and in the store.
- systemMs: in the headless harness performance.now() is virtual and reads 0.000 ms both ways (P1 passes vacuously; the suite prints a NOTE saying so). Measured in a real Chrome (GPU tier, 71 bodies, 600 frames per pass with a TV drop each): recorder off median 0.2 / 0.1 ms (means 0.202 / 0.123), recorder on median 0.2 / 0.1 ms (means 0.181 / 0.154); largest difference 0.031 ms on the mean, 0 on the median (performance.now() granularity 0.1 ms).
- Real-browser export: a boot-to-settle report is 3,825 characters of pretty JSON (6 events); clipboard refused in the pane -> textarea fallback unhidden and selected; parses with questionnaire {q3: 4, q6: '...'} and invoice.profit -3057.57.
- ./tools/syntax-check.sh: checked 96 file(s); 0 with syntax errors.

Deviations from the brief:
- ROAD_FORCE never reaches onAny as ROAD_FORCE: src/drive/route.js:108-111 puts `type: ev.type` in the payload and src/core/eventBus.js:78 spreads the payload AFTER the envelope's `type`, so the stamped event reads 'hardBrake' / 'sharpTurn' / 'speedBump' (measured: m17 R4 NOTE line '0 of the 3 road events arrived stamped ROAD_FORCE'; by-name subscribers in main.js still fire because the handler map is keyed by the emit argument). Neither file is in M6's set, so countEvent's default branch recognises road events by the TRUCK.roadEvents table and the exported events keep the clobbered stamp. Root-cause fix belongs in route.js (rename the key, e.g. roadType) or eventBus.emit (spread payload first).
- Mover RECOVERY emission (src/main.js 'movers' system) changed from a within-step before/after diff to 'count last announced' per mover (recoveriesSeen): a recoverNow() called between steps (a suite, the pause card) was invisible to the diff and the recorder's tally disagreed with recoveryCount(). Fee 0 -> ECONOMY.recoveryFee (the brief listed main.js:398 fee:0 as a defect).
- src/cargo/cargo.js was listed in filesTouched but needed no change: snapshotPositions/shiftSince already existed (cargo.js:189-210); the measurement lives in main.js's 'phase' system. tripCount left at 1 and recorded honestly (PHASE11_PLAN 'Deliberately not now').
- README.md, docs/PLAYTEST_NOTES.md and C:/Dev/INDEX.md are in the brief's filesTouched but orchestrator-reserved per the file-ownership rules — not edited; the text is in docsNotes.
- tools/m16-tests.js: besides V4c, the V4 fixture `x` needed `runs: []` because load() now always returns the sixth key and V4 deep-equals load() to x (tools/m16-tests.js:135-139).
- The systemMs regression bound cannot be measured in tools/smoketest.ps1: --virtual-time-budget freezes performance.now() (0.000 ms in both passes, so game.stats.systemMs is 0 — see m14's own 'wall time is unmeasurable under virtual time'); a scratchpad copy of the harness without the budget dumps the DOM at 'booting...' because --dump-dom does not wait for the async boot. The honest number was taken in a real Chrome via the browser pane (0.031 ms worst difference) and is recorded in `measured`; m17 P1 keeps the assertion and prints a NOTE line when both readings are 0.
- The questionnaire form sits between .stats and the 'Run it again' button (the brief said 'under .stats'); answering before replay is the intended flow and the sheet already scrolls (max-height 92vh).
- `restarts` semantics: recorder.restarts counts session restarts; closeRun() stamps the closed record with the count INCLUDING the restart that closed it (so lastRun.restarts === 2 after the second replay, as R5 asks), while the live summary reports the restarts before the current run.
- The keydown/keyup/keypress guard is on the whole `.telemetry` block as well as on the form: Q5b found the export textarea outside the form and an Escape typed into it unpaused the game under the sheet.
- Runs abandoned from the pause card (resetContract without a settlement) are also kept in the save (invoice null, complete false) — §27.4 'restart' — capped by keepRuns like the rest.

### M8

### M8 — Couch legs come off, preparation costs time, and the couch starts behind the 34-inch door — 2026-09-04

**Hypothesis.** couch_3seat_01 had `disassembly: []` although §7.1's own worked example of the schema is this couch with "four legs / screwdriver", and m6 E8 asserted — deliberately, since Phase 6 (CHANGELOG 'm6 E8 asserts the negative so a later phase cannot quietly …') — that no disassembly was ever a clearance win. It was true because the only object that needed one had no parts. The couch's route also never met a tight opening: it spawned in the living room, ROUTES.living_room is ['front36'] = 0.91 m, and every destination opening is 0.91, so the 0.86 door and the doorway turn house.js was built around were demonstration geometry. And disassemble() has returned the authored seconds since Phase 6 while _applyTool threw them away, so §8.2's 'preparation time' cost nothing and §3.3's prepared branch had no price to weigh against the brute one. One data row, one clock charge and one spawn move make the 34" door a real two-branch obstacle on the shipped contract.

**What changed.**
- `src/objects/definitions.js`: couch_3seat_01.disassembly = [{ part 'legs', tool 'screwdriver', seconds 60, reversible, shrinksTo 2.10 x 0.77 x 0.90 }] — 80 mm legs, so the narrowest presentation goes 0.850 -> 0.770 m: +50 mm at 0.82, +90 mm at 0.86 (intact: -30 mm and +10 mm); packed volume 1.6065 -> 1.4553 m3 (-9.4 %). PHASE5_SPAWNS row 0 (still row 0 — m5/m9/m15 read rows[0]) moves from the living room (-2.60, -3.20) to the kitchen (2.50, 0.45, -8.40), 100 mm clear of the fridge and 60 mm off the back wall's inner face, still to dest_living. Its route out is now living_kitchen (0.86) then front36 (0.91).
- `src/player/interact.js`: new constructor opt `chargeWorkMs` (no-op default, like setPhase/now); _applyTool's 'dimensions' case bills r.seconds x 1000 ms through it and the notice names the price: `legs off — 9% smaller · 60 s of prep`. r.seconds already carries TOOLS.screwdriver.timeScale (tools.js) — scaled once, never twice.
- `src/main.js`: the hook adds the ms to `game.state.elapsedWorkMs` (except in BRIEFING/SETTLEMENT, Game.step's own rule) AND to `telemetry.phaseMs[phase]`, so m11 T1's 'phase durations add up to elapsedWorkMs' survives a disassembly. `fromZone` is finally filled on every manifest row at boot and on every resetContract (kitchen 9, living_room 7, bedroom 7) — KNOWN_ISSUES had it null on all 23.
- `src/tools/tools.js`: disassemble()'s docstring no longer claims 'not a clearance win'; it names the couch as the one that is.
- **m6 E8 rewritten on purpose.** The Phase 6 assertion ('no disassemblable object was ever blocked by a doorway — the win is volume, not clearance', min(x,z) > 0.86) was authored to block exactly this claim, and its comment said so; it would now fail for the right reason. The new E8 says the true thing: over defs with parts, exactly one has a cross-section min(y, z) wider than the narrowest opening in the game (0.82), it is the couch, and (E8a) its legs-off cross-section 0.77 fits. The old formula measured the footprint min(x, z); a doorway tests the cross-section.

**Checked.** m6 **102 ALL-PASS** (+27): E13 data, E14 geometry, E15 collider (halfExtents 0.77 / 0.85 to 1e-6), E16 physics — the couch on its side pushed at 600 N at its COM: at the 0.82 front opening, legs off goes clean through (centre z -0.60 -> -3.89, resting against the back partition; 1.80 m past the inner face) and intact stops at the outer face (centre -0.86, 0.0 mm penetration); at the shipped 0.86 door, legs off goes through at 600 N (centre -3.5 -> -6.87, 0.00 deg yaw), intact JAMS under the same blind push (centre -3.895, 8.3 mm penetration, 0.44 deg) and passes at 700 N (centre -7.56). m5 **76 ALL-PASS** (+15, section H: AABB inside the kitchen, no partition/shell/doorway/spawn overlap, fridge 100 mm, tightestOnRoute('kitchen') 0.86, 10 mm intact / 90 mm legs off, toZone dest_living, fromZone kitchen on the couch and correct on all rows). m11 **149 ALL-PASS** (+20: B7c 8 promises made, 8 honoured; section P: 'take the legs off couch 3seat', E charges exactly 60000 ms with no frame run and 60000 + 100.0 ms after six real frames, phaseMs.pickup takes the same, SETTLEMENT bills 0, Q bills 0, cargo.volumeUsed 1.6065 -> 1.4553). Regressions m9 41, m10 45, m13 71 (A1/A2/A4 intact 2.10 m to 1 mm unchanged), m0 126, m12 121, m14 37 ALL-PASS. `./tools/syntax-check.sh`: 96 files, 0 errors.

Measured:
- Legs off: narrowest 0.770 m (0.850 intact); +50 mm at 0.82, +90 mm at 0.86, +140 mm at 0.91. Volume 1.6065 -> 1.4553 m3 (-9.4 %); the same through cargo.volumeUsed() with the couch alone in the box.
- 0.82 opening, 600 N x 4 s: legs off centre z -0.600 -> -3.890 (0.772 m wide, 0.06 deg yaw); intact centre -0.860, leading face -1.910 = the outer face, 0.0 mm penetration. (600 N x 3 s: -2.615, trailing end still outside — hence 4 s.)
- 0.86 door, start 0.39 m before the wall: legs off 600 N x 4 s centre -6.867, 0 mm drift; intact 600 N x 4 s jams at -3.895, penetration 8.3 mm, yaw 0.44 deg; intact 700 N x 3 s centre -7.563, yaw 1.19 deg, drift 28 mm.
- Clock: E on the couch +60000 ms elapsedWorkMs and +60000 ms phaseMs.pickup; +100.0 ms more after six 16.667 ms frames; SETTLEMENT 0 ms billed, phaseMs.settlement +60000; Q 0 ms.
- Placement: couch AABB x 1.45..3.55, z -8.85..-7.95; fridge 100 mm; back wall 60 mm; kitchen zone; route 0.86 (was 0.91).
- fromZone: kitchen 9 · living_room 7 · bedroom 7. Promise sweep 8/8 (was 7/7).
- Suites: m5 76, m6 102, m11 149, m9 41, m10 45, m13 71, m0 126, m12 121, m14 37.

Deviations from the brief:
- 'm11 C11' already names the ramp pickup; the clock assertions are section P (P2-P2f), situation 8 is P1-P1d, the 8/8 count is B7c.
- E16 as briefed ('legs on does not pass living_kitchen') contradicts house.js:112-121 and m5 B6/B7 (the intact couch fits 0.86 by 10 mm by design). Asserted at both openings instead: 0.82 (geometry) and 0.86 (physics: jams at 600 N, passes at 700 N), 4 s of push rather than 3.
- describe() says 'take the legs off couch 3seat' — label() derives words from the defId for every prompt (interact.js:635); not changed.
- r.seconds already includes timeScale (tools.js); charged once.
- The charge lands on phaseMs too, or m11 T1 breaks; BRIEFING/SETTLEMENT bill none.
- Couch stays manifest row 0; fromZone filled in main.js (manifest.js not in scope); reassembly is free; docs left to the orchestrator.

Measured:
- Geometry: legs off the couch's narrowest presentation is 0.770 m (was 0.850): +50 mm at 0.82, +90 mm at 0.86, +140 mm at 0.91; intact still -30 mm at 0.82 and +10 mm at 0.86. Packed volume 2.10 x 0.85 x 0.90 = 1.6065 m3 -> 2.10 x 0.77 x 0.90 = 1.4553 m3 (-9.4%), the same two numbers through cargo.volumeUsed().
- Physics at the 0.82 front opening (m6 E16, 600 N at the COM, couch on its side): legs off travels from centre z -0.600 to -3.890 in 4 s (0.772 m wide, 0.06 deg yaw) and comes to rest against the living-room back partition (leading face -4.941 vs partition face -4.94) — 1.80 m of centre travel past the wall's inner face; intact (0.852 m wide) travels 0.26 m to the outer face and stops at centre -0.860 with 0.0 mm penetration and 0.06 deg yaw. In the probe, 3 s at 600 N left the legs-off centre at -2.615 (trailing end still outside), which is why the assertion pushes for 4 s; 700 N reaches -3.889 in 2.5 s.
- Physics at the shipped 0.86 door (m6 E16d-f, start centre -3.5 = leading face 0.39 m before the wall): legs off 600 N x 4 s -> centre -6.867, 0.00 deg yaw, 0 mm lateral drift; intact 600 N x 4 s -> jams at centre -3.895 with 8.3 mm penetration, 0.44 deg yaw, 9 mm drift (10 mm is not a margin for a blind push); intact 700 N x 3 s -> centre -7.563 (through, 1.19 deg yaw, 28 mm drift). A start with the leading end already inside the opening (probe, centre -3.94) passes intact at 600 N too.
- Clock: E on the couch bills exactly 60000 ms (60 s x timeScale 1.0) to elapsedWorkMs and to telemetry.phaseMs.pickup; six real frames after it the labour clock reads 60000 + 100.0 ms; in SETTLEMENT the same E bills 0 ms and phaseMs.settlement +60000; Q bills 0. m11 T1 (phase durations sum to elapsedWorkMs ± one step) still passes after the run.
- Placement: couch spawn (2.50, 0.45, -8.40) yaw 0 spans x 1.45..3.55, z -8.85..-7.95; 100 mm from the fridge (minX 3.65), 60 mm from the back wall's inner face (-8.91), 270 mm from the heavy box's unrotated AABB (maxX 1.18), 700 mm from the boxes at z >= -7.25; zone kitchen; tightestOnRoute('kitchen') 0.86 (living_room was 0.91).
- fromZone now filled on all 23 manifest rows at boot and after every resetContract: kitchen 9, living_room 7, bedroom 7.
- Promise sweep: 8 promises made, 8 honoured (was 7/7).
- Suite totals: m5 76, m6 102, m11 149, m9 41, m10 45, m13 71, m0 126, m12 121, m14 37 — all ALL-PASS; ./tools/syntax-check.sh: checked 96 file(s); 0 with syntax errors.

Deviations from the brief:
- Brief 'm11 C11': tools/m11-tests.js already has C11 ('the ramp can be picked up', section C). The clock assertions are P2/P2a-P2f and the situation-8 text/act/Q assertions are P1/P1a-P1d in a NEW section P (header names Phase 11 build-side M8); the sweep count is pinned by B7c in section B. Ids kept greppable via the section header and the 'brief C11' note in the comment.
- Brief E16 said 'centre 1.0 m outside living_kitchen ... legs on (0.85 across): stopped at the jamb'. The intact couch fits the 0.86 door by 10 mm by design (src/world/house.js:112-121; m5 B6/B7 assert it), so 'legs on does not pass' is only a geometric fact at 0.82. E16-E16c therefore run at APERTURES interior32 (0.82; front wall) where the flip is geometry, and E16d-E16f run at living_kitchen (0.86; the shipped door) where physics says what the 10 mm means: legs off through at 600 N, intact jams at 600 N with 8.3 mm penetration, intact passes at 700 N. Both directions carry the centre-of-mass metres. Also 4 s of push, not 3: measured 600 N x 3 s left the legs-off centre at -2.615 with the trailing end still outside the wall.
- Brief: describe().primary === 'take the legs off the couch'. label() in src/player/interact.js:635-641 derives the words from the defId ('couch_3seat_01' -> 'couch 3seat'), the same way the wardrobe reads 'take the doors off wardrobe'; no prompt in the game says 'the couch'. P1 asserts the real string 'take the legs off couch 3seat'. label() was not changed — every prompt and several m11 assertions share it.
- Brief: 'advances the contract clock by r.seconds x TOOLS.screwdriver.timeScale'. disassemble() (src/tools/tools.js) already returns seconds: entry.seconds * TOOLS.screwdriver.timeScale, so _applyTool charges r.seconds * 1000 ms once; the brief's formula would have applied the scale twice (invisible at 1.0, wrong at any other value). E13c/P2 assert 60000 x timeScale as briefed.
- The charge also lands on game.state.telemetry.phaseMs[phase] (main.js chargeWorkMs hook), not only on elapsedWorkMs: m11 T1 asserts sum(phaseMs) == elapsedWorkMs ± one step and would fail for any run that disassembled anything if only the labour clock moved. Same rule as Game.step: BRIEFING and SETTLEMENT bill no labour (P2e/P2f).
- The couch row stays PHASE5_SPAWNS index 0 with new coordinates rather than moving into the kitchen block: tools/m5-tests.js:395,464-469, tools/m9-tests.js:173,314 and tools/m15-tests.js:195 read rows[0]/manifest[0] and m5 E4's overhang numbers are the couch's.
- fromZone is filled in src/main.js (fillFromZones after both buildManifest calls) rather than in src/contract/manifest.js buildManifest, because manifest.js is not in filesTouched; buildManifest still writes fromZone: null and main.js fills it a line later.
- docs/KNOWN_ISSUES.md and docs/CHANGELOG.md are in the brief's filesTouched but orchestrator-reserved by the task rules — not edited; the text is in docsNotes.
- Reassembly (Q, 'legs back on') bills nothing — the brief charged only the E path; asserted as P2d and recorded as a seam for KNOWN_ISSUES.
- m11 situation 8 parks the couch at x -22, not the -30 the dolly situation uses: the dropped screwdriver lands on the mover's standoff line, and section C's first aim runs along that line at (-30, 30) — on the first run E picked the tool up instead of putting the dolly under the couch (C2-C4 failed). Section P uses the same spot.
- tools/_shot-couch-legs.js (created 14:46 today by someone else, references the new couch spawn) was left untouched; my probe tools/_probe-m8.js was deleted after use.

## Phase 17 — Phase 11 build side, batch 2: replay unwinds and a three-run soak, the settings card, prompts that speak your device — 2026-09-04

Phase 11's build side (GDD §25.2: onboarding, settings, instrumentation, fixes), from the ordered plan in docs/PHASE11_PLAN.md. Each milestone was built by a file-owned implementer and adversarially reviewed against its brief; the numbers below are the ones the reviews reproduced.

**1272 assertions across 17 suites, all passing.**

### M2

### M2 — replay unwinds through the real API, damage rebinds, and a three-run soak proves no growth — 2026-09-04

**Hypothesis.** From the first "Run it again" on, item damage was never billed: `DamageSystem` captured the boot-time `game.state` (main.js, damage.js), `game.reset()` replaced it wholesale, and nothing re-pointed the system — so every `_closeWindow` wrote to the previous run's orphaned ledger while `buildInvoice` read the new, empty one, and `reconcile()` agreed because both read the same empty ledger. `resetContract` also nulled tool FLAGS instead of undoing tool EFFECTS: a couch with the dolly under it at settlement kept friction 0.04 and the Min combine rule for every later run, a wardrobe with its doors off kept the shrunken collider (and `reassemble`'s guard then refused to ever restore it), a tool in the mover's hands kept the no-collide `toolCarried` group and fell through the world, and `controller.recoveries` was never zeroed so run 2 billed run 1's callout. `StrapLines` never evicted: +2 meshes, +2 geometries, +2 materials per strap ever placed. The Phase 11 gate is literally "complete and replay"; the replay was silently corrupt and m11 G11 passed vacuously.

**What changed.** `DamageSystem` resolves its state through a getter (`() => game.state`; a plain object still works and `damage.state = …` still assigns). `resetContract` now unwinds in the order tools/m11-tests.js's fixture already used (its comment is copied in verbatim): straps, route, grips, then `tools.detachDolly` / `tools.removeBlanket` per entity, `retrieveRamp` for a deployed ramp, then `game.reset()`, then `damage.reset()` (after, so it clears the NEW ledger). `respawnContract` calls `reassemble()` for every removed part BEFORE clearing `removedParts`, and clears `loadedOnTrip`, `dimensions`, `dollyId`, `blanketId`, `frictionBefore`, `combineRuleBefore`, `everHeld`, `outOfBoundsMs`, `settled`, and resets `lastStable` to the spawn. Every tool goes back to `GROUP_PRESETS.object` as well as Dynamic (the sibling of M1's Q put-down bug), with `geometry` nulled. New `PlayerController.resetForContract(spawn)` zeroes recoveries, knockdowns, the knockdown timer, the out-of-bounds grace and the last-stable point before teleporting. `StrapLines` keeps one record per strap (two segment meshes) and disposes it — scene removal, geometry and material `dispose()` — the frame the strap is gone. `window.__MFH` gains `resetContract` and `recoveryCount`.

**Checked.** New `tools/m14-soak-tests.js` plays the contract three times end to end (strap on the fridge, dolly under the couch, wardrobe doors off, TV dropped from 1.5 m, E at the cab, `routeSteps()+60` frames, the m10 delivery teleport, `M.settle()`, `onReplay()`), with the ramp carried into run 2's settlement and deployed at the truck for run 3's drive, sampling every §26.6 counter after each replay. **37 assertions ALL-PASS in 8 s wall clock (6804 `game.frame()` calls).** After run 3 versus after run 1, exactly: bodies 71 = 71, colliders 71 = 71, joints 0 = 0, scene children 325 = 325, renderer geometries 408 = 408, textures 60 = 60, strap pool 0 = 0, tools 4, registry 23, heap ~27 MB = ~27 MB (0.0 % growth). The strap pool equals `straps.count` at all seven samples and the strap's two geometries are measurably uploaded and freed (410 → 408 on runs 2 and 3). The ledger holds 3 item-damage lines at the settlement of runs 1, 2 AND 3 (runs 2 and 3 read 0 before this); run 1 bills its one recovery, runs 2 and 3 bill none. m11 gains G13–G17 (**+18 (G13-G17)**): couch friction back to 0.35 (from 0.04) with the Average rule, wardrobe collider back to 0.60 (from 0.52) with `disassemble()` working again, the carried ramp dynamic and colliding at y = 0.08 m after 120 frames, a post-replay TV drop billed and reconciled. Regressions m10 45, m0 126, m1 61, m13 71, m8 38, m12 89 ALL-PASS; `syntax-check.sh` 88 files clean.

Measured:
- Soak (m14): 3 full runs = 6804 game.frame() calls; whole smoketest 8 s wall clock (14:22:15 -> 14:22:23), so no virtual-time budget change was needed.
- Counters after run 1 vs after run 3 (post-replay, after a real present() render): bodies 71 = 71, colliders 71 = 71, joints 0 = 0, scene children 325 = 325, renderer geometries 408 = 408, textures 60 = 60, programs 11 = 11, strapLines.pool 0 = 0, tools 4 = 4, registry 23 = 23, bus.log 2 = 2, pendingNotices 0 = 0.
- Strap render pool: pool.size === straps.count at all 7 samples (0 at boot, 1 while the strap is live, 0 after each replay). Geometry delta strap-live minus after-replay on runs 2 and 3: 410 - 408 = 2 exactly (the two segment BoxGeometries, uploaded then freed). Before M2 the pool grew by 2 entries (6 Three objects) per strap ever placed.
- Item damage on replay: ledger at settlement = 3 lines on run 1, 3 on run 2, 3 on run 3 (TV dropped from 1.5 m each run); before M2 runs 2 and 3 read 0 because DamageSystem wrote to the orphaned boot-time state. damage.state === game.state after replay (m11 G13, m14 S3).
- Recovery fee: run 1 recoveryCount 1 and the invoice shows 'recovery/service fees'; runs 2 and 3 recoveryCount 0 and no such line (m11 G17, m14 S3b). Before M2 controller.recoveries was never zeroed.
- Couch after replay with the dolly under it at settlement: collider.friction() 0.35 (def 0.35, ± 1e-6; was 0.04 for every later run), frictionCombineRule() Average (0); dollyId and attachedTo both null (m11 G14, m14 S5).
- Wardrobe after replay with doors off at settlement: halfExtents().z*2 = 0.60 (def; was 0.52), mesh.scale 1, removedParts [], disassemble() succeeds again (m11 G15).
- Ramp carried into the settlement (run 2) and deployed at the truck (run 3): after replay isDynamic, collisionGroups === GROUP_PRESETS.object, resting at y = 0.08 m on the rack after 120 frames (dolly 0.07, blanket 0.00, screwdriver -0.00 — all above the -8 m recovery floor; a no-collide tool would be at about -20 m after 2 s).
- Heap: performance.memory.usedJSHeapSize read ~27 MB at boot, after run 1 and after run 3 (0.0 % growth; Chrome quantises this value), within the 10 % tolerance.
- telemetry.phaseMs per run: transit 28000 ms, delivery 5333 ms on all three runs; notices drained per run: 7, 7, 7.
- m11: +18 assertions (G13-G17); m14 new 37; regressions m10 45, m0 126, m1 61, m13 71, m8 38, m12 89 all ALL-PASS.

Deviations from the brief:
- Brief: 'Expose resetContract and pendingNotices length on window.__MFH'. pendingNotices (the array) was already on the api from M1 (main.js api: `pendingNotices, contractFacts`), so only resetContract was added — plus recoveryCount, which G17/S3b need to assert what settle() will bill.
- Brief: 'zero m.controller.recoveries and _downMs per mover' in main.js. Implemented as PlayerController.resetForContract(spawn) in src/player/controller.js (in filesTouched) so main.js does not poke private fields; it also zeroes knockdowns, _outOfBoundsMs, _sinceStableMs, the carry/imbalance/exertion fields, sets state GROUNDED and resets lastStable to the spawn (controller.js: lastStable was only ever set at construction and by the stable-tracker, so a run-2 recovery would have teleported the mover to run 1's destination).
- Brief S2: 'strapLines.pool.size === straps.count at every sample'. The pool held TWO entries per strap (id and id+':b', strapLines.js:85-91), so this could only hold with one record per strap; the pool is now keyed by strap id with {mesh, material, mesh2, material2}. No suite read pool entries by id (grep tools/ for strapLines/.pool: only _shot-*.js call update()), so the brief's render-contract risk did not materialise.
- Brief soak: 'ramp carried at settlement' with 'E at cab'. Pressing E at the cab while carrying the ramp DEPLOYS it (interact._applyTool's clearance path runs before the cab target), so run 2 never drove on the first attempt (measured: depart returned 'ramp down — 26°', route.state stayed parked). Run 2 now picks the ramp up after arrival and carries it into M.settle(); run 3 deploys it at the truck before driving, so tools.retrieveRamp's unwind is covered as well.
- Brief S2/S1 first draft asserted geometries after replay === boot; Three.js uploads a geometry the first time it is drawn, so the count climbs through run 1 as the camera sees new things (352 boot -> 365 -> 408). Replaced with the exact per-run delta on runs 2 and 3 (strap live minus after replay === 2) plus S1's run 3 === run 1.
- Brief listed docs/KNOWN_ISSUES.md and docs/CHANGELOG.md under filesTouched; the task rules make docs/* orchestrator-reserved, so they were not edited — the text is in docsNotes.
- tools/smoketest.ps1 was listed for a possible budget override; not touched — the soak completes in ~8 s wall clock (virtual time does not advance during synchronous JS), well inside the 240 s budget.
- Brief: clear entity.state.everHeld. It is cleared, but note that `everHeld` is never WRITTEN anywhere in src/ (grep: only read at main.js heaviestMoved), so that branch of heaviestMoved is dead — recorded for KNOWN_ISSUES rather than fixed here (not in scope).

### M4

### M4

## Phase 11 build-side M4 — the settings card and the versioned save (2026-09-04)

GDD §21.4 Input / Motor / Vision rows; §26.5 'Grip toggle, sensitivity, … UI scale … exist'; §26.6 'Save/settings reject incompatible versions safely'; §21.2 'A retry keeps settings'; §13.4 saved best invoice; §27.1 save-version migration.

**Hypothesis.** `DEFAULT_SETTINGS` (mouse sensitivity, stick sensitivity, key look rate, invert Y, deadzone, trigger threshold, hold/toggle grip) was read live at twelve sites and written by nothing — no UI, no persistence, no setter — and every font-size in styles.css was a raw px. One card that wires ONLY settings something measurably consumes, and one device-local save with a schema gate, close two §26 lines without a system learning anything new.

- **`src/ui/settings.js`** — copied from AirportBaggageCrew's SettingsPanel (class, `_build`/`show`/`hide`, the `.set-row` markup). Reachable from the title card (new Settings button beside 'Enter · Space · A') and the pause card's M3 slot (`pauseScreen.onSettings`, live from boot). Eleven controls: grab hold/toggle, mouse look, stick look, P2 key look, invert left/right (NEW `invertLookX`), invert up/down, stick deadzone, trigger pull, text size, camera distance, quality tier ('applies on reload'). **Every one moves its consumer** — m16 U2 walks the card by `data-setting` and fails on the first inert control; there are none. No camera-shake, reduced-motion or subtitle switch: nothing exists for them to consume yet.
- **Settings never enter `game.state`.** The card is a view over a store in main.js that routes each key to the thing that reads it — `Input.applySettings` (validates against DEFAULT_SETTINGS, clamps to `SETTINGS.ranges`, clears the toggle latches on a grip-mode change), the `--ts` CSS variable, every mover's camera rig, the save file (V6d/U4a).
- **`src/core/save.js`** — SmallTownEmergencyServices' persistence shape: `storage()` probe, one key `mfh.save`, payload `{schema: 1, build, settings, shell, bestInvoice}`. `load()` never throws and never writes: a missing key, 'not json', an array, a string, schema 0 and schema 2 all return defaults and leave the blob **byte-equal** (V2a). A hand-edited 400× mouse loads as 4.0 through the same `sanitiseSettings` the live Input uses. With `setItem` throwing, `save()` returns false and **the invoice still shows** (V5). §13.4's best invoice (profit, grade, build, date) is kept and the settlement sheet quotes it — 'best so far 412.30 (B) · phase-16' or 'new best so far — was …'.
- **Scalable UI (§21.4 Vision).** `--ts` on `:root`; all **51 of 51** font declarations in styles.css are `calc(Npx * var(--ts))` (the two `clamp()` sizes included). At 1.5×: prompt 12 → 18 px, contract panel 11 → 16.5 px, the centre third still clear (U1d).
- **Look is a rate, not a refresh.** `Input.poll(frameMs)` (fed by `game.frame`) scales stick and key look by `frameMs / SETTINGS.lookRefFrameMs`, capped at `SIM.maxFrameMs`: two 16.667 ms polls equal one 33.334 ms poll to 1e-6 (I6, and I6f through a stubbed Standard Gamepad). 60 Hz feel unchanged (key 1.98 rad/s, stick 3.43 rad/s); a 120 Hz display used to turn twice as fast.

**Checked.** New `tools/m16-tests.js` **116 assertions ALL-PASS**; m0 126, m11 129, m12 121 ALL-PASS; m15 107/108 — I1a pins the pre-M4 'Settings slot hidden' state and flips with M4 (one-line test change). `./tools/syntax-check.sh`: 89 files, 0 errors.

Measured:
- --ts 1.5: .prompt 12 → 18 px, .contract 11 → 16.5 px, title .pitch 13 → 19.5 px, pause .tag 12 → 18 px; calc() inside the `font:` shorthand verified in headless Chrome (18 px, line-height 27 px; clamp(26,4.6vw,40) × 1.5 → 60 px).
- styles.css: 52 font declarations, 52 with var(--ts), 0 raw px; CSSOM: 50 sized rules, 50 scaled.
- Look: key 15 units/frame → 1.98 rad/s; stick 26 units/frame → 3.43 rad/s at every frame length (was 3.96 / 6.86 rad/s at 120 Hz); 1000 ms frame capped at 250 ms → 225 units.
- Save: 5 payload keys; 6 rejected shapes return defaults with the blob untouched; clamps 400 → 4.0, 99 → 1.6, -3 → 1.6, 'quantum' → 'auto'; refused setItem → save() false, invoice shown, no banner.
- Card: 11 controls, 0 inert; Defaults restores 11/11; camera 7.0 m on both rigs, 3.2 m in co-op, 7.0 m back solo.
- Suites: m16 116, m0 126, m11 129, m12 121 ALL-PASS; m15 107/108 (I1a).

Deviations from the brief:
- RENDER.camera.max does not exist → distanceMax (config.js:57-58).
- The payload carries a fifth key `shell` (uiScale, cameraDistance, tier): DEFAULT_SETTINGS is the input schema and applySettings rejects unknown keys, so the shell's settings live beside it; V1 asserts settings/bestInvoice exactly as briefed.
- I6 uses 2 × 16.667 = 33.334 ms, not 33.333.
- m11 F2 already used class selectors; the 1.5× centre-third measurement is m16 U1c/U1d.
- Best invoice is written at every settlement (replaced only on improvement) so a refused write heals.
- invoiceScreen.show gained a 5th `extras` argument.

Measured:
- UI scale: --ts 1.5 → .prompt 12px → 18px, .contract 11px → 16.5px, #title-screen .pitch 13px → 19.5px, #pause-screen .tag 12px → 18px (getComputedStyle, headless Chrome 1280×720). calc() inside the `font:` shorthand verified in headless Chrome before the rewrite: `font: 700 calc(12px * var(--ts))/1.5` → 18px at --ts 1.5, line-height 27px; `calc(clamp(26px,4.6vw,40px) * var(--ts))` → 60px.
- styles.css: 52 font/font-size declarations, 52 carry var(--ts), 0 raw px (grep); CSSOM view: 50 rules with a sized font declaration, 50 scaled (two grep lines share a rule block).
- Look rates (unchanged at 60 Hz, now refresh-independent): seat-1 key look 15 units/frame × 0.0022 rad × 60 = 1.98 rad/s; right stick 2.6 × 10 = 26 units/frame → 3.43 rad/s. Before this change a 120 Hz display gave 3.96 and 6.86 rad/s (per-poll accumulation); after, the same 1.98 / 3.43 rad/s at any frame length (I6/I6f: two 16.667 ms polls === one 33.334 ms poll to 1e-6). A 1000 ms frame is capped at SIM.maxFrameMs 250 ms → 225 units (I6d).
- Save: payload has exactly 5 keys (schema 1, build 'phase-16', settings, shell, bestInvoice). load() returns defaults for a missing key, 'not json', a JSON array, a JSON string, schema 0 and schema 2, and leaves the stored blob byte-equal (V2a). Hand-edited values clamp: mouseSensitivity 400 → 4.0, uiScale 99 → 1.6, cameraDistance -3 → 1.6, tier 'quantum' → 'auto'.
- Refused store: with Storage.prototype.setItem throwing, save() returns false, M.settle() still renders the invoice sheet and no #err-banner appears (V5); the next settlement with the store back writes the best invoice (V6a).
- Settings card: 11 controls (8 input keys + uiScale, cameraDistance, tier), every one moves its consumer in U2 with zero inert; Defaults returns all 11. Camera distance 7.0 m applies to both movers' rigs; a co-op join switches to COOP.cameraDistance 3.2 and leaving restores 7.0.
- Escape with the card open (dispatched on the focused Done button, the path a keyboard takes) closes the card and the game stays paused; measured in a probe that an event dispatched ON window runs the two window listeners in registration order (bubble-first), while an event on an element reaches the window capture listener first and is stopped there.
- Regression totals: m0 126, m11 129, m12 121, m16 116 ALL-PASS; m15 107/108 (I1a only). ./tools/syntax-check.sh over the whole tree: checked 89 file(s); 0 with syntax errors.
- Visual check (tools/shot.ps1, 1600×900, ?tier=gpu): settings card renders over the pause card with labels/sliders/readouts/selects/notes/Defaults/Done; title card at --ts 1.3 with the Settings button in the 'Enter · Space · A' line. Scratch shot scripts deleted.

Deviations from the brief:
- Brief U3 says 'RENDER.camera.max'; no such key exists — the bounds are RENDER.camera.distanceMin / distanceMax (src/config.js:57-58) and ThirdPersonCamera.setDistance clamps to them (src/render/camera.js:51-53). U3 uses distanceMax (7.0 m) and SETTINGS.ranges.cameraDistance references those two keys.
- The save payload carries a FIFTH key `shell` {uiScale, cameraDistance, tier} beside the brief's {schema, build, settings, bestInvoice}. DEFAULT_SETTINGS (src/core/input.js:150) is the input layer's schema and Input.applySettings rejects unknown keys (I5b/I5c as briefed), so UI scale / camera distance / tier — which the brief also wants persisted (§21.2) — need a home outside `settings`. V1 asserts {settings, bestInvoice} deep-equal exactly as briefed and V1a covers `shell`.
- I6: the brief's 'one poll(33.333)' is not two of 16.667 (2 × 16.667 = 33.334); the claim under test is 'two frames of F equal one of 2F', so the long poll is 2 × FRAME. SETTINGS.lookRefFrameMs is 16.667 (one 60 Hz frame as the brief writes it) so poll() === poll(16.667) exactly (I6b).
- tools/m11-tests.js NOT edited: the F2 'repair to class selectors' the brief asks for is already in place (tools/m11-tests.js:607 uses '.contract', '.cargo-status', '.notices', '.route-bar'), so there was nothing to repair; the 1.5× centre-third measurement lives in m16 U1c/U1d with a non-vacuous guard that the contract panel has a layout box. No M4 section was added to m11 — fewer hunks in a file three milestones share.
- settle() persists at EVERY settlement, not only when the best improves (brief: 'writes bestInvoice when profit improves'). The record is still only REPLACED on an improvement; writing each time is one setItem and means a store that refused once (quota, private mode) heals on the next run — V5/V6a measure exactly that sequence.
- invertLookX (new) applies to the mouse, the right stick AND seat 1's H/K look keys — the same treatment invertLookY already gave U/J (input.js _pollLookKeys), so 'invert' means one thing per axis on every device.
- invoiceScreen.show() gained a 5th argument `extras = { best, isBest }` (the saved best invoice before this run). docs/PHASE11_PLAN.md M6 plans a 5th arg `runSummary` — M6 should pass it as extras.runSummary or a 6th arg.
- m16 U0h dispatches Escape on the focused Done button rather than on window: measured in headless Chrome that an event dispatched ON window runs target listeners in registration order (Input's bubble listener, registered at boot, before the card's capture listener), a path no keyboard produces; on an element the window capture listener goes first and stopImmediatePropagation holds (U0i).
- m16 U1e-U1g read the CSSOM (document.styleSheets → getPropertyValue('font') || 'font-size') instead of fetch('styles.css') + regex: a fetch started after load never resolved under smoketest.ps1's --virtual-time-budget (measured: the suite stalled at 'running...' with no banner), and the CSSOM view is stronger — a `font:` shorthand with var() is a pending-substitution value whose font-size longhand reads '' (measured), so the shorthand text is what must be checked.
- m15 I1a fails after M4 by construction (see blockers); every other m15 assertion passes. m16 U0f asserts the opposite, intended, state.

### M5

### M5 — device-aware prompt glyphs per seat, the objective line, the destination-room hint, and one stall hint — 2026-09-04

**Hypothesis.** §26.5 asks for "visible prompts and BOTH input mappings" and §26.7 for a player who can "identify the next objective without coaching". For fifteen phases the HUD printed a literal 'E', 'Q' and 'hold LMB / RMB' for every seat (hud.js:144-145, :123; interact.js:302), so seat 1 — Quote/Semicolon/[ ] on the keyboard, X/RB/LT/RT on a pad — was told to press keys it does not have; `input.activeDevice[seat]` was computed and read only by the debug overlay. Nothing on screen named the truck, the room an item was for (the contract panel's 'right room' line appears only after the first delivery), or the grab buttons to a player who had not found them.

**What changed.**
- **Glyphs are derived, never typed.** `glyphFor(action, seat, device)` in input.js is PURE: it reads the live binding table (first key code via a code→label map, first mouse button, first pad index via a table built from `PAD`) and falls back across devices so a pad-only action (seat 1's pause) still has a label on the keyboard. `Input.glyphsFor(seat, device)` uses the instance's bindings and the seat's context, so a remap or a context switch redraws. Hud.setPrompt(d, glyphs) / Hud.update(status, glyphs) take the set; with no argument they derive seat 0's keyboard set from the same function, so m11 F3's 'E' is still derived, not typed. The VERB never changes — only the key chip — which is why m11 B6/D4/E3 and F3/F9 pass unchanged. interact.js's hint is device-neutral (`… — hold {gripL}/{gripR} to carry`) and the HUD resolves the tokens (m11 O4a-c).
- **Debounced on sim time.** `activeDevice` flips on ANY pad activity (a stick a hair past its deadzone flips it every poll), so shown raw the prompt flickered E/X at frame rate. The shown device follows it only after `PROMPTS.deviceDebounceMs` = 250 ms of CONTINUOUS sim time. Measured (m12 K3): 233 ms of pad is not a switch, 267 ms is; a 100 ms flicker never reaches the screen; 60 paused frames never switch. The seat tag ('P2 · p1 · keys' / '· pad') and the #help line name the device in words and are rebuilt from glyphFor on every confirmed switch.
- **The objective line.** One row under the contract panel (`.objective`, in a `.corner-tl` column with `.contract`), fed every frame from the phase machine and the truck (`objectiveFor`): pickup/0 loaded 'carry a box to the truck out front'; pickup/N 'load 22 more, or drive from the cab'; transit 'on the road — 41% there' (or the road event); delivery 'unload — 23 left, each to its room'. Asserted outside the centre third and ONE row tall (offsetHeight ≤ 2 × line-height) — §21.1's 'not a checklist' (m11 O1-O5c).
- **The room, before the pickup.** `describe()` appends ' → living room' (DEST_ZONES label minus '(destination)') to a manifest item's hint until it is delivered to the right room. By ENTITY id, not defId: box_small_01 spawns five times across three rooms (m11 O4d/O4e).
- **One stall hint.** Dev\INDEX.md's AirportBaggageCrew pattern — advisory text over a live sim, a stall timer rather than a route check. If nobody has gripped anything `CONTRACT.stallHintMs` = 30 000 ms into the pickup, one 'good' notice per seat says 'hold LMB / RMB on a box to grab it — two hands for the heavy ones' in that seat's glyphs. Sim time (60 paused frames advance it 0 ms; 60 running frames exactly 1000 ms), armed when the job starts (title.onStart, so reading the title is not a stall), once per run (a replay re-arms it), retired by the first grip (m11 O6-O6f).
- **cargoGlance moved off PAD.VIEW → PAD.LB** on both seats (View is `COOP.joinPad`; Phase 16's 'Pad View is two things in the van'). m12 K4 asserts no bound action on any seat or context shares the join button.
- **Test seam.** `M.feedHuds()` is the per-seat HUD feed the render loop calls (moved out of loop(), same order: cameras, then HUD, then divider); `M.shownDevice(s)`, `M.objectiveFor`, `M.stallHint`, `M.resetStallHint` beside it.

**Checked.** m11 ALL-PASS 129 (25 new, section O), m12 ALL-PASS 121 (32 new, section K), m0 126, m8 38; m15 108 with one failure (I1a) that belongs to M4's Settings wiring, not M5. ./tools/syntax-check.sh: 89 files, 0 errors.

Measured:
- Device debounce (m12 K3a/K3b): 14 frames = 233 ms of continuous 'pad' leaves the shown device 'kbm'; 16 frames = 267 ms switches it; a 6-frame (100 ms) flicker to 'pad' followed by 'kbm' never switches; 60 paused frames with activeDevice 'pad' never switch (sim-time clock).
- Stall hint (m11 O6a/O6b): 60 running frames advanced the timer by exactly simTimeMs delta (1000.0 ms, |diff| < 1e-6); 60 paused frames advanced it by 0 ms; CONTRACT.stallHintMs = 30000 ms fires exactly one notice (count 1 across pendingNotices + hud._notices), still 1 after 120 further frames.
- Objective line (m11 O2/O3): with 1 of 23 loaded the line reads 'load 22 more, or drive from the cab'; in DELIVERY with 0 delivered 'unload — 23 left, each to its room'; in TRANSIT 'on the road…'; at pickup/0 'carry a box to the truck out front'.
- Room hint (m11 O4d): box_small_01 has 5 manifest rows across 3 destination rooms — a defId->row map (as the brief prescribed) would name one room for all five; the lookup is by entityId.
- Suite totals after M5: m11 129 (was 104), m12 121 (was 89), m0 126, m8 38, m15 108 with the one M4-attributable failure (I1a).
- Syntax gate: ./tools/syntax-check.sh over src/ and tools/: checked 89 file(s); 0 with syntax errors.

Deviations from the brief:
- Brief K3 said "input.activeDevice[0] = 'pad' + 1 frame → huds[0].prompt matches /X/" AND "a single flicker to 'pad' for < 250 ms sim time does not change the glyph". Those two cannot both hold: a switch on the first frame is by definition not debounced against a flicker. Implemented a stability debounce — the shown device follows activeDevice only after PROMPTS.deviceDebounceMs (250 ms) of CONTINUOUS sim time — and K3 asserts the two edges numerically (233 ms no, 267 ms yes) plus the 100 ms flicker and 60 paused frames. main.js settleDevices().
- Brief scope said the room hint comes 'from a defId→row map over manifestSummary rows'. A defId map is wrong for this manifest: src/objects/definitions.js:578-598 spawns box_small_01 five times across dest_living/dest_kitchen/dest_bedroom (and box_heavy_01/box_fragile_01/chair_dining_01 repeat too). The lookup is by ENTITY id (interact ctor opt `manifestRow(entityId)` → game.state.manifest.find by row.entityId, main.js). m11 O4d pins the reason, O4e proves a kitchen box says kitchen.
- Brief O5 called for 'repaired F2'. m11 F2 was already repaired to class selectors by M3 (tools/m11-tests.js:606-616 queries .contract/.cargo-status/.notices/.route-bar). It was not edited (shared file, not my hunk); O5 re-runs the same predicate with `.objective` added, plus O5b (one row) and O5c (under the panel).
- Brief named `CONTRACT.stallHintMs` but no CONTRACT block existed in config.js (grep: only ECONOMY/MANIFEST/COOP). Added `export const CONTRACT = { stallHintMs: 30000 }` and, for the debounce, `export const PROMPTS = { deviceDebounceMs: 250 }` — no bare literal in a system. 30 s was my choice (AirportBaggageCrew's per-step STALL_MS is 11 s; this is a whole-first-minute hint).
- The stall timer is ARMED by title.onStart (and stays armed across resetContract), not by page load: the sim runs under the title card, and a tester reading the controls for 40 s would otherwise be 'stalled' before pressing anything. m11 O6 therefore calls M.title.start() (or sets armed when the title is already gone). Not in the brief; recorded here.
- Added `M.feedHuds()` to the test seam (the per-seat HUD feed moved out of loop() into a function loop() calls). Not in the brief, but O1-O5 and K3 assert what the HUD SHOWS, and headless Chrome never runs the render loop (1-3 rAF callbacks total), so the brief's 'set activeDevice + 1 frame → prompt matches' is unreachable without it. The loop's behaviour is unchanged: cameras update first, then feedHuds(rects), then divider.update(rects).
- Brief said 'Hud.update(status, glyphs) take {primary, secondary, gripL, gripR}'; hud.js defaults a missing glyph set to glyphsFor(this.seat, 'kbm') from input.js rather than a literal table, so even the no-argument path (m11 F3's 'E') is derived from the live binding table — no second table to drift.
- Deleted my scratch probe tools/_m12-probe.js after use (tools/_*.js is NOT gitignored — only _smoketest*/_shot*/_probe*.html are).

## Phase 16 — Phase 11 build side, batch 1: the phase machine, the pause card, and the traction sweep — 2026-09-04

Phase 11's build side (GDD §25.2: onboarding, settings, instrumentation, fixes), from the ordered plan in docs/PHASE11_PLAN.md. Each milestone was built by a file-owned implementer and adversarially reviewed against its brief; the numbers below are the ones the reviews reproduced.

**1045 assertions across 15 suites, all passing.**

### M1

### M1 — the §3.4 phase machine reaches TRANSIT and DELIVERY; settle() runs once — 2026-09-04

**Hypothesis.** The contract phase word, the arrival notice and every later phase-duration/telemetry milestone were blocked by one wiring gap: `interact._useCab` emitted `CONTRACT_PHASE{to:'transit'}` straight onto the bus (interact.js:564) and nothing called `game.setPhase(TRANSIT)`, so `state.phase` stayed `'pickup'` for the whole drive, the `'phase'` system's TRANSIT→DELIVERY guard (main.js:458) was never true, and the "arrived — unload through the back" notice never fired. Settlement also re-entered: `settle()` → `game.setPhase(SETTLEMENT)` → the same `CONTRACT_PHASE` listener → `settle()` again — measured with spies at **2 settlement events and 2 `invoiceScreen.show` calls per settlement**; now **1 and 1** (m11 G2b).

**What changed.** `InteractionSystem` takes a `setPhase` callback (wired to `game.setPhase`) and calls it for TRANSIT (carrying `canDepart()`'s advice as the §3.4 validation) and SETTLEMENT; `game.setPhase` is now the only `CONTRACT_PHASE` emitter, so every entry carries `from`, `to` and a real `simTimeMs` (m11 G2c: pickup → transit → delivery → settlement, stamps strictly increasing, 0 only for the boot PICKUP). `settle()` is latched against re-entry — the phase itself cannot be the guard because `game.js` sets `state.phase` before it emits. `game.state.telemetry.phaseMs` (§27.4 "phase duration") accrues sim ms per phase on the same line as `elapsedWorkMs`: measured **transit 28000 ms** for the 1680-step route, sum of phases within one 16.667 ms step of `elapsedWorkMs` (m11 T1), zeroed by replay (T1c). Eleven zero-stamped emit sites now carry the clock: strap attach/release, the four tool transitions, tool carried/dropped, part restored, damage windows closed by decay and by `settle()`'s flush — measured `carried@29017 ms` where the log used to read 0.0 s (m11 T2/T2b/G2d).

**Found on the way.** A tool put down with **Q fell through the floor for ever**: `_putDown` never restored the collision group, so the tool kept `toolCarried` (collides with nothing) — measured **y = −1.32 m one second after the drop**; now y = 0.07 m (m11 T3). The ramp/dolly/blanket drop paths were already correct; only the universal-undo path was not.

**Checked.** m11 ALL-PASS 87 (E4b, E6b, G2b, G2c, G2d, T0–T3 new; the drive now runs through `game.frame()` so the real `'phase'` system is under test); regressions m0 126, m8 38, m12 89 ALL-PASS; `syntax-check.sh` clean. The HUD contract panel reads the phase verbatim, so the drive now says **transit** and the unload says **delivery** on screen (§21.2, §26.5).

Measured:
- Before M1 (static + G2b spy): one settlement emitted 2 CONTRACT_PHASE{to:'settlement'} and called invoiceScreen.show 2 times; after: 1 and 1.
- Drive through game.frame(16.667): routeSteps() = 1680; the route reports 'arrived' within 1681 frames; phaseMs.transit = 28000 ms; clock at arrival 29017 ms (60 warm-up frames + 1681).
- phaseMs sum vs elapsedWorkMs: equal within 16.667 ms at settlement (T1 PASS); DELIVERY accrues from the arrival step (T1a PASS); briefing and settlement stay 0 in the suite's run.
- Zero-stamped emit sites fixed: straps.js x2 (attach, release), tools.js x4 (attached, detached, covered, deployed), interact.js x3 (restored, carried, dropped), damage.js decay path x1, main.js flush x1 = 11 sites. Post-fix stamps measured: TOOL_STATE carried@29017 ms, dropped@29017 ms; DAMAGE_APPLIED simTimeMs >= timeMs on both the decay path (T2b) and the flush path (G2d, === clock).
- Q put-down bug: dolly at y = -1.32 m one second after Q (falling through the ground, toolCarried = interactionGroups(OBJECT, 0)); after the fix y = 0.07 m and groups === GROUP_PRESETS.object.
- Camera lag in the m11 fixture: followLerp 12/s -> 0.8 residual per rig.update, 0.8^20 = 1.15 % of a 40 m teleport = 0.46 m of aim-line offset, above the 0.28 m anchorAimRadius -> anchor probe 'none'. Opt-in snap fixes it; a global snap breaks C8/C9 (sections B-D were tuned against the lag).
- Suite sizes: m11 86 -> 87 assertions net (+15 new ids incl. sub-assertions, E section's drive now 1681 frames instead of 1750 helper steps); m0 126, m8 38, m12 89 unchanged.

Deviations from the brief:
- Brief said 'Guard main.js:612 with `game.state.phase !== PHASES.SETTLEMENT`'. That guard would refuse the one call that matters: game.js:145-146 sets state.phase = to BEFORE emitting CONTRACT_PHASE, so when the listener runs on the cab's setPhase(SETTLEMENT) the phase is already 'settlement' and settle() would never run from the in-game path. Implemented a re-entrancy latch (`settling`) inside settle() instead; the listener now compares e.to against PHASES.SETTLEMENT. Both paths (cab E and a direct M.settle()) measured at exactly 1 event and 1 invoiceScreen.show (m11 G2b).
- Extra fix outside the brief's scope but inside an owned file: interact.js _putDown never restored the tool's collision group (the three _applyTool drop paths at interact.js:503/517/525 do; the Q path did not), so any tool put down with Q fell through the world for ever (measured y = -1.32 m after 1 s; tools have no §18.3 recovery, registry.step only walks registry.entities). One line added + m11 T3. The m11 T fixture is what exposed it. M2's brief covers the sibling defect in resetContract (main.js:656-669) — not touched here.
- E6b's HUD assertion needed a data path the render loop owns: extracted the contract-panel object into `contractFacts(summary)` in main.js and exposed it (with pendingNotices) on window.__MFH, rather than duplicating the object shape in the suite. Behaviour of the loop is unchanged (one call replaces the inline literal).
- telemetry.phaseMs accrues in EVERY phase (including briefing and settlement), not only where elapsedWorkMs does — §27.4 'phase duration' is time-in-phase, and a later briefing card that keeps BRIEFING while unpaused should record it. In today's flow both stay 0 (boot jumps to PICKUP synchronously; settlement pauses), so T1's sum === elapsedWorkMs holds and is asserted as briefed.
- The m11 fixture's reset() now silently sets state.phase back to PICKUP (no event), mirroring route.reset(): section B's 'cab' situation really enters TRANSIT now, and without this E4b would be vacuous and G2c's sequence polluted. lookAt() gained an opt-in `snap` flag used only in section T (see measured).

### M3

## Phase 11 build-side M3 — pause card and controller parity for the shell (2026-09-04)

GDD §21.4 Cognition 'Solo pause'; §26.5 'Solo pause freezes relevant simulation safely'; §21.2 'A retry keeps settings'; §4.4 / §25.3 controller parity; §6.4 co-op grips.

- **The pause is on screen.** New `src/ui/pauseScreen.js` (`#pause-screen`, z-index 30, pointer-events auto): PAUSED, 'the clock is stopped — nothing moves and no labour is billed', **Resume**, **Restart the contract**, and a hidden **Settings** slot for M4 (`pauseScreen.onSettings`). It OBSERVES SIM_PAUSED / SIM_RESUMED / SIM_RESET and never owns the flag; it is suppressed under the title card and over the settlement sheet. A window blur adds the line 'paused — window lost focus'. A click on the card's backdrop resumes (the one gesture that can also re-take the pointer). Measured: 60 `game.frame()` calls under the card advance `simTimeMs` by 0 ms, `elapsedWorkMs` by 0 ms and run 0 steps (m15 P3) — m0 A9/E3's invariant holds through the card.
- **Pause is an action, not a keycode.** `main.js` no longer reads `e.code === 'Escape'`; the bound `pause` action (Escape + PAD.MENU, both seats, both contexts) is consumed once per frame by a shell observer registered with `game.subscribe()` — the one observer that writes, through `togglePause`/`setSeats` only. New `Input.consumeShellEdge(action, seat)` and `consumeShellButton(seat, i)` read a per-FRAME edge buffer rotated in `poll()`. Pad Menu + 1 frame pauses; 10 more frames held stay paused; release + press resumes; Escape identical (m15 P5-P5h); seat 1's pad Menu pauses too (P5n).
- **The first Esc.** While the pointer is locked Chrome consumes the Escape that releases it and delivers no keydown; `Input.onPointerLockLost` (fires only on a true locked→unlocked transition) is read as the pause request — never under the title, never while already paused, never in SETTLEMENT (m15 P8b/P8d/P8e). One Esc, one card.
- **Controller parity for the shell (§25.3).** Pad **A** starts the job from the title (m15 P6); `COOP.joinPad = 8` (View) joins and leaves beside F2 through one `toggleSeats()` (P7: 2 HUDs after one frame; P7c: back to 1); **D-pad down** is `recover` on both seats (m0 B23/B23a, m15 P7d-P7f). A controller-only player can now start, pause, join and recover; before this, 0 of those 4.
- **Pad edges are keyed by physical slot** (`input.js` `_padSlotPrev`, 'S<slot>B<i>'), not by seat token. The review caught the join OSCILLATING with a real pad: a join moves the first pad from seat 0 to seat 1, so a View button still held the next frame was a new press for the new seat — leave, join, leave — measured seatCount [2,1,2,1,2,1,2,1] over an 8-frame hold, ending solo. Now a stubbed Standard Gamepad holding View for 8 frames reads 2,2,2,2,2,2,2,2 and stays 2 after release (m15 P7h); a held Menu pauses once (P7i).
- **Losing the pointer lock clears seat 0 only** (`_clearSeat(0)`, was `clear()`): seat 1's BracketLeft grip survives seat 0's Esc (m12 C10-C12a, m15 P8/P8a).
- **Title card: Escape removed** from the start keys. Enter / Space / click / pad A start (m15 P5j/P5k). Text: 'Enter · Space · A on a controller' under the button, 'F2 or View on a pad', 'Esc / Menu pause'.
- **`DEBUG.overlayEnabledByDefault` is false.** The F3 overlay had shipped ON since Phase 0 (m15 P9-P9e: hidden at boot, F3 shows it with the metre grid, F3 hides both).
- Suites: new `tools/m15-tests.js` **108 assertions**; m0 119 → **126** (+B23, B23a, B24-B24e), m12 85 → **89** (+C10, C11, C12, C12a), m11 **87** unchanged — all ALL-PASS. Total across the four: 410.

Measured:
- m15: 108 assertions ALL-PASS on two consecutive runs (ports 8435, 8439); was 97 (+11).
- m0: 126 ALL-PASS (unchanged from the implementer's run). m12: 89 ALL-PASS (unchanged). m11: 87 ALL-PASS (unchanged; the C8/C9 transient did not recur). Total across the four suites: 410 (was 399).
- P7h (the major fix): stubbed Standard Gamepad holding button 8 (View) across 8 driven game.frame() calls → seatCount 2 on every frame, and 2 on the 3 frames after release; review's pre-fix measurement of the identical scenario was [2,1,2,1,2,1,2,1] ending solo.
- P7i: the same stubbed pad holding button 9 (Menu) for 8 frames → paused on all 8 (trace '11111111'); release + fresh press → resumed in 1 frame.
- P3 (unchanged): 60 game.frame(16.667) calls under the card → simTimeMs +0 ms, elapsedWorkMs +0 ms, stepCount +0.
- P5 (unchanged): _debugPad MENU + 1 frame → paused; 10 held frames still paused; release + press → resumed. Escape keydown identical.
- P8 (unchanged): locked→unlocked pointerlockchange with BracketLeft + Mouse0 held in co-op → seat 1 gripLeft true, seat 0 gripLeft false, paused within the same event (0 frames).
- P4h (unchanged): Restart from the card → clock.simTimeMs 0, 23 manifest rows, 0 straps, phase 'pickup'.
- F2r4 (unchanged): paused Resume button width > 60 px, centre within 40 px of 640 at 1280×720; unpaused: no layout box, width 0.
- P9 (unchanged): #debug-overlay hidden at boot; one F3 → overlay shown and world.grid.visible true; second F3 → both false.
- Syntax gate: `./tools/syntax-check.sh src/core/input.js src/main.js tools/m15-tests.js` → checked 3 file(s); 0 with syntax errors, before the browser runs; full `./tools/syntax-check.sh` → checked 85 file(s); 0 with syntax errors (85, not the implementer's 86 — another agent's tree, not mine).
- Corrected sizes: tools/m15-tests.js 443 lines (was 390 before the fix; the implementer's report said 330), src/ui/pauseScreen.js 109 lines, src/core/input.js 708 lines (+12 over the implementer's 696).
- Fix footprint: src/core/input.js 6 hunks (+12 net: _padSlotPrev field + comment, both gamepad connect/disconnect handlers clear it, _pollPads keys edges by slotToken and stores the slot map at the end, new slotToken helper; _padPrev removed — it had no other reader in src/ or tools/); src/main.js 1 comment-only hunk; tools/m15-tests.js +53 lines.

Deviations from the brief:
- MAJOR fix, in M3's own file: `_pollPads` (input.js) now detects press/release edges by PHYSICAL SLOT ('S<slot>B<i>', `_padSlotPrev`) instead of copying the seat-keyed `_padValue` into `_padPrev`. Seat tokens ('P<seat>B<i>') are still what `_press/_release/_down/_padValue` carry, so `analog()`, `wasPressed()`, `_debugPad` and every binding lookup are untouched; only the 'was it down last poll' lookup changed key. After a join the held View button is `_down.add('P1B8')` (held), not `_press` — no second edge, no oscillation. `_padPrev` is deleted (no other reader in src/ or tools/). The connect/disconnect handlers clear `_padSlotPrev` alongside `_padValue`, keeping the existing semantics that a connect/disconnect re-edges held buttons once (slots shift).
- The acceptance test for the fix (P7h-P7j1) stubs `navigator.getGamepads` on the navigator INSTANCE (an own property shadowing Navigator.prototype's) with a Standard-Gamepad-shaped object whose buttons read a `held` Set, drives game.frame() 8 held + 3 released frames, and deletes the stub afterwards (P7j confirms the prototype method is back and sees no pad). `_debugPad` is kept for P5/P6/P7/P7c-P7e because it is what the brief prescribes there; the review's structural point — _debugPad bypasses _pollPads — is why the real-pad block exists.
- P9c/P9e guards dropped; a new G1 asserts `M.world.grid` exists so the grid assertions cannot go vacuous (scene.js:427 GridHelper, exported at scene.js:1343).
- The observer-mutates finding (minor) is resolved within my ownership by an explicit comment on the observer in main.js (it is the shell, writes only through game.togglePause/setSeats, never game.state directly) plus the game.js:92 comment amendment proposed in orchestratorNotes — game.js is not in M3's files.
- The unreported canvas-click comment hunk is now in `hunks` (the two comment lines only; the guard code below them pre-dates M3).
- All implementer deviations stand: observer not loop(); two-set shell buffer; consumeShellButton for the raw join button; pad-A start via the 'jump' binding; onPointerLockLost gated on a true locked→unlocked transition; Escape/Menu a no-op under the title; m11 F2 not repaired in place (file not owned); README/KNOWN_ISSUES/INDEX routed through docsNotes.

### M7

## Phase 11 — M7: the traction seam, the braced stretch band, and a measured negative result — 2026-09-04

**Hypothesis.** Solo couch drag stalls in a limit cycle: 100 % of the grip's horizontal reaction integrates into `pull`, whose steady value is F/(PLAYER.mass × CARRY.pullDamping) = F/249.6 m/s — it reaches the couch's 1.22 m/s tow cap at 305 N, while the couch needs 552 N to break floor friction under the Average combine rule. So the mover is hauled back before the couch moves, the stretch collapses, the pull decays, repeat. A budget the legs anchor first (`CARRY.tractionN`, `CARRY.braceTractionN`, 0 while airborne or knocked down) with only the EXCESS becoming pull, plus a wider braced stretch band (`GRIP.braceStretchMult` 1.10: tear at 0.77 m / 693 N, under the fridge's 745 N), should let a lone mover tow the couch.

**Touched.** `src/config.js` (CARRY.tractionN, CARRY.braceTractionN, GRIP.braceStretchMult — each with its derivation), `src/player/controller.js` (`applyCarry` integrates max(0, |reaction| − traction) along the reaction; `resistedForce` still bills the full magnitude so `loadSpeedMult` is unchanged; new `tractionN(brace)`), `src/player/grip.js` (brace passed through; `towSpeedLimit(brace)` and the tear check use the braced band), `tools/m3-tests.js` D5–D5c, `tools/m6-tests.js` B8–B10f (old B8–B11 are now B12–B15).

**Result: negative, and shipped at 0 N.** One mover, one hand, the m6 haul (180 steps), traction overridden per run, everything else parked clear — measured twice, by two implementers, agreeing to 3 cm:

| traction | couch bare | couch on dolly | fridge bare |
|---|---|---|---|
| unbraced 0 N (shipped) | 0.000 m, held 180/180 | 2.08 m, held | 0.000 m, held |
| unbraced 200 N | 0.053 m, held | 1.27 m, torn at 0.97 s, mover strolls 7.3 m | 1.27 m, TOPPLED (90°) |
| unbraced 330 N | 0.002 m, torn at 0.65 s, mover 7.6 m | — | — |
| unbraced 350 N (the brief) | 0.001 m, torn at 0.63 s, mover 7.8 m | 1.30 m, torn at 0.98 s | 0.001 m, torn at 0.72 s |
| braced 350 N | 0.040 m, held | — | 1.25 m, TOPPLED |
| braced 400 N | 0.246 m, held | — | 1.24 m, TOPPLED |
| braced 560 N (350 × 1.6) | 0.015 m, torn at 0.93 s | 1.92 m, torn at 1.47 s | 0.002 m, torn at 1.00 s |

**Why.** The grip damps against the object's ABSOLUTE velocity (grip.js: c·vp, c = 2√(900 × 90) = 569 N·s/m for the couch), so a towed couch drags a viscous brake on top of 552 N of friction and can follow a hand no faster than (900 × band − 552)/569 = **0.137 m/s unbraced, 0.248 m/s braced** (0.41 / 0.74 m in 3 s). The mover walks at 1.22 m/s (tow cap) or 0.73 m/s braced. The pull was the only thing that ever slowed the mover to what the couch could follow, and its steady value (552 − T)/249.6 m/s is speed-blind: T ≤ 250 N leaves the stall, T ≥ 250 N lets the mover out-walk the band — a tear, then a mover strolling seven metres from a stationary couch. Every T ≥ 100 N also tears the DOLLY haul, whose 1.05 m/s ceiling the pull had been enforcing by accident, and every braced budget that moves the couch topples the fridge (tipping a 0.70 m deep, 110 kg fridge grabbed at 0.875 m needs 432 N, far under its 745 N sliding limit), which flips m6 B5/B6's 'beyond one hand unaided'. The traction idea needs the damping computed in the hand's frame and a tow cap that knows about friction before it can do anything but harm; that is the next increment, and the seam and its tests are already waiting for it.

**What did land.** The seam (two config numbers, one subtraction, brace passed through), the braced band (tow cap 1.34 m/s braced, hold never tears), and the measurement of the gain that exists: **two movers, one hand each, tow the couch 1.34 m in 3 s where one tows 0.00 m** (held 180/180 both). Bracing while towing two-up: 0.05 m — the same limit cycle.

**Checked.** m2 66, m3 65 (D5: with a 300 N override a 250 N reaction leaves pull at exactly 0; 400 N integrates exactly the 100 N excess; D5b 0 N airborne/knocked down; D5c 0 ≤ tractionN < 400 keeps D1/D2's fixture live; the brief's closed form is printed, 2.21 vs 1.22 m/s, not asserted), m4 59 (lift binary unchanged: 458 N / 0.000 m one hand, 895 N / 0.011 m two), m6 75 (B8 solo unbraced 0.00 m held 180/180 mover 0.33 m; B9 braced 0.00 m held 180/180; B10 693 N < 745 N and 0.77 m < 1.50 m; B10a ceiling < 0.30 m/s pinned as a limitation; B10b braced fridge 0.00 m; B10c two movers 1.34 m; B10d/B10e wall ghosting braced; B10f harness clearance). Harness trap found on the way: a released object keeps its no-player-collision group until `restoreClearedObjects` runs, which the m6 harness never did — the brace-wall test's box then no longer slowed D11's mover on the deck (y 0.02 at x −53.27 instead of 1.22). The game's own clearance pass now runs once after the B hauls; B10f asserts it.

Measured:
- Solo one-hand couch, 180 steps (m6 haulDistance), shipped config: BEFORE (Phase 6 README) 0.00 m bare / 2.12 m on dolly; AFTER 0.00 m bare (mover 0.33 m, held 180/180, tow 1.22 m/s, F 422 N, stretch 0.47, pull 1.43) / 2.12 m on dolly (mover 2.79 m, F 147 N, objPeak 0.96 m/s) — identical, as config ships at 0/0.
- Fridge one hand: BEFORE 0.00 m bare -> 1.49 m dolly; AFTER 0.00 -> 1.49 m — identical. Braced fridge (new): 0.000 m, held 180/180, F 330 N, stretch 0.37 (B10b).
- Braced solo couch (new): 0.00 m, mover 0.29 m, held 180/180, tow cap 1.34 m/s (1.22 x 1.10), F 327 N, stretch 0.36, pull 1.09 (B9).
- World-frame damping ceiling (closed form, m6 output): (900 x band - 552)/569 = 0.137 m/s unbraced, 0.248 m/s braced = 0.41 / 0.74 m in 3 s.
- Two movers, one hand each, side by side (new haulTogether): unbraced 1.34 m (mover 1.73 m, held 180/180, tow 1.72, F 362 N, stretch 0.61, objPeak 0.65 m/s); BRACED 0.05 m (mover 0.34 m, held 180/180, F 305 N) — bracing two-up sits in the same pull limit cycle.
- TRACTION SWEEP, re-measured by me with the shipped code (tools/_m7-probe.js, instance override, every other object parked clear; agrees with the config.js table to within 3 cm): unbraced 0 N: couch 0.000 m held / dolly 2.078 m held / fridge 0.000 m held. unbraced 200 N: couch 0.053 m held, F 589 N / dolly 1.266 m TORN @ 0.97 s, mover 7.30 m / fridge 1.271 m TOPPLED (tilt 90 deg), torn @ 2.25 s. unbraced 330 N: couch 0.002 m TORN @ 0.65 s, mover 7.61 m. unbraced 350 N (the brief): couch 0.001 m TORN @ 0.63 s, mover 7.83 m / dolly 1.299 m TORN @ 0.98 s, mover 7.27 m / fridge 0.001 m TORN @ 0.72 s. braced 350 N: couch 0.040 m held / fridge 1.254 m TOPPLED @ 2.58 s. braced 400 N: couch 0.246 m held (F 594 N, stretch 0.710) / fridge 1.238 m TOPPLED @ 1.57 s. braced 560 N (the brief's 350 x 1.6): couch 0.015 m TORN @ 0.93 s, mover 3.64 m / dolly 1.920 m TORN @ 1.47 s / fridge 0.002 m TORN @ 1.00 s.
- Against the brief's own acceptance numbers the brief's config (350 N / x1.6) scores: B8 0.001 m (wanted >= 0.30), held 38/180 (wanted >= 120), mover 7.83 m (wanted < 2.0); B9 0.015 m (wanted >= 0.60), torn at 0.93 s (wanted 180/180); B4 dolly haul torn at 0.98 s with the mover strolling 7.27 m.
- m4 lift binary (liftTogether) unchanged: one mover 458 N peak, rose 0.058 m, lowest corner 0.000 m clear; two movers 895 N, rose 0.131 m, 0.011 m clear, held 220/220.
- m6 D11 ramp: run 1 with the new wall test's leftover state 0.02 m at x -53.27 (FAIL); after B10f 1.22 m at x -56.73 (PASS) — same as Phase 6's recorded 1.22 m.
- Suite sizes: m2 66, m3 65, m4 59, m6 75 (was 74 before B10f; 63 before M7).

Deviations from the brief:
- CARRY.tractionN ships at 0, not the brief's 350 (src/config.js:239). Evidence: the sweep above — 350 N unbraced tears the couch hold at 0.63 s with 0.001 m of travel and the mover strolling 7.83 m; the mechanism is in and pinned (controller.js:114-149, m3 D5-D5c), the number is not usable until damping is computed in the hand's frame. Both m3 D5c and the m6 B block say so in their output.
- CARRY.braceTractionMult (brief: 1.6) is implemented as the ABSOLUTE CARRY.braceTractionN (src/config.js:246, controller.js:148). A multiplier on a 0 N budget can never express 'unbraced 0, braced 400' — the only configuration in the sweep that moved a solo couch at all (0.246 m) — so the seam is an absolute number; it also ships at 0 because braced 350-400 N topples the fridge (1.24 m, tilt 90 deg), flipping m6 B5/B6.
- m3 D5's closed form (552 - tractionN < 1.22 x 78 x 3.2) is REPORTED in the m3 output, not asserted: at the shipped 0 N it reads 2.21 vs 1.22 m/s and is false by design (tools/m3-tests.js:276-282). D5/D5a/D5b/D5c assert the subtraction itself with a 300 N instance override so the seam stays pinned while the config is 0.
- m6 B8/B9 assert what is true instead of the brief's >= 0.30 m / >= 0.60 m: hold 180/180, mover < 2.0 m, travel <= the world-frame damping ceiling (0.41 / 0.74 m) and braced >= unbraced (tools/m6-tests.js:374-380); B10a pins the ceiling < 0.30 m/s as a deliberate limitation pin in the m6 E8 tradition, to be rewritten on purpose by the hand-frame-damping increment.
- The 'm4 E two-mover drag >= 1.5x solo' comparison lives in m6 as B10c (haulTogether, tools/m6-tests.js:402-409), not in tools/m4-tests.js: m4-tests.js is outside M7's file list, and m4's E section is a LIFT scenario (m4-tests.js:443-497) whose two-mover drag was only ever a comment. Measured 1.34 m vs 0.00 m solo, held 180/180.
- The 'm2 E2 braced retreat' run lives in m6 as B10d/B10e on a purpose-built wall at the m6 pad (tools/m6-tests.js:411-457): m2-tests.js is outside M7's file list and its aperture wall sits inside the Phase 5 house where the manifest box cannot be grabbed.
- Existing m6 B8-B11 (detach friction, slope runaway) were renumbered B12-B15 to free the ids the brief demanded (tools/m6-tests.js:467-502). No doc references the old ids (grepped docs/, README.md, C:/Dev/INDEX.md).
- Added m6 B10f (not in the brief): the new wall test held box_small_01, which then kept the objectHeld collision group because the m6 harness never runs restoreClearedObjects; D8c parks that same box on D11's test deck, and without player collision it no longer slowed the mover, who walked off the far edge (D11 FAIL, y 0.02 at x -53.27). B10f runs the game's own clearance pass once and asserts couch/fridge/box are back on GROUP_PRESETS.object (tools/m6-tests.js:459-475).

## Phase 15 — the Overcooked overhaul — 2026-09-04

Not a §25.2 roadmap gate; the user's brief before the next milestones: *"the art style of
Overcooked, but with the body proportions we have now — a post-processing run, shading,
lighting and shadows, and everything should have different textures rather than reading as
different colours of the same texture."* No external assets. Three.js stays r128 core.

The whole thing was built by a design panel (four proposals, three judges) and four
file-owned implementers each adversarially reviewed against a written contract, with the
orchestrator integrating afterwards. What follows is what shipped, and the numbers.

### What changed

**A material library instead of tinted Lambert.** `src/render/materials.js` (new) defines
forty `KINDS` — plaster, walnut, boards, card, fabric, steel, paint, glass, grass, asphalt,
denim, hi-vis and the rest — each a row of specular colour, shininess, relief (bump or
normal from a paired height canvas), environment reflection and a fresnel rim. Every material
in the scene is built through `surface(kind, colour, opts)` and carries `userData.kind`.
The texture layer (`textures.js`) mints an albedo AND a paired height canvas AND, where the
row asks, a specular mask in one `texSet()` call; `heightFor()`/`specFor()` look them up by
image so tiled clones still find their relief. A shared `onBeforeCompile` patch adds the
rim to the Phong shader once (one program per feature set — 32 on the GPU tier, 9 in software).

**Post-processing over the backbuffer.** `post.js` (new): after the seats are rendered,
`copyFramebufferToTexture` lifts the finished, MSAA-resolved frame into a texture and four
passes run — bright + 4× downsample, blur H, blur V, composite (bloom, warm grade with lift
and gain, seat-local vignette, ordered dither, divider gap in the configured colour). No
scene render target, so the antialiasing is kept. Bulbs are the bloom sources; the sky is
tone-mapped so it never blooms (bright-pass fraction measured at 0.00 % outdoors).
`present.js` (new) is the ONE render entry point: shadow maps once per frame, every seat,
then post. All 17 tools that called `renderer.render()` directly now go through it.

**Shadows.** Variance shadow maps on the GPU tier (soft, no acne); PCFSoft in software.
`shadowMap.autoUpdate` is off and `present()` raises `needsUpdate` once per frame, so co-op
renders every map once instead of once per seat — proven structurally (G9c: a co-op frame
costs less than a solo frame plus one seat).

**Contact occlusion without SSAO.** Baked vertex AO on every rounded prefab (a `color`
attribute; m13 G3 pins the black-attribute trap), AO skirts along wall feet, and
`contactBlobs.js` (new): a soft dark quad under every mover and object, placed by a Rapier
ray each frame, fading with lift so a carried box has no shadow on the floor.

**Geometry.** Rounded boxes measured and rescaled to exactly their collider size (m13 A1-A7
still hold, to the millimetre), 'face' UVs for stencils and 'tile' UVs in metres for grain,
tape as real strips inside the box, 36 skirting boards, plank floors as merged geometry with
per-plank colour, pendants in every room. Tools are prefabs now too (`buildToolVisual`).

**Characters.** `BODY_RATIOS` pinned and tested (G7) — the toy proportions stay; Overcooked's
stubby figures were explicitly refused. Hi-vis with a paired specular mask, denim, skin and
cloth kinds.

### Numbers (software tier, the gate)
| | software tier (the gate, SwiftShader) | GPU tier (`probe.ps1`, `?tier=gpu`) |
|---|---|---|
| suites | 14 suites, **893 assertions**, all passing (m13 now 71, section G is 33 of them) | `m13g-gpu.js`: 31 assertions, all passing |
| scene meshes | 495 | 495 |
| one seat's draw calls | 242 | 316 |
| whole solo frame (every shadow map + seat + post) | 728 | 1608 |
| whole co-op frame | 931 — less than 728 + 242, so the maps render once | 1855 — less than 1608 + 316 |
| shader programs | 9 | 33 |
| shadow type | PCFSoft, sun only, 1024 map | VSM, sun + rooms, 2048 map |
| outdoor frame, post on vs off | — | p95 luminance 0.81 vs 0.86; pixels over the bloom threshold 0.13 % vs 4.26 %; sky-band pixels over it 0.00 % vs 14.05 % — the grade keeps the clouds under the threshold, the bright pass lets through 0.000 % of texels outdoors and lights only the pendants |
| post chain | not constructed | 4 passes, quarter-res bloom targets, 0 textures allocated per warm frame |
| contact blobs | not constructed | 25 visible, all 4–60 mm above their floor |

### The reviews earned their keep
- G4 as first written compared material *parameters*; it would have failed on card, boards,
  plaster and walnut, which the library separates by texture. It now asserts the direct claim:
  no two kinds share an albedo image.
- G6a demanded a tile u-range exact to 1e-3; the bevel projection is short by up to 0.586 r
  per edge (measured 4.1876 vs 4.2000). One-sided band now.
- Draw-call assertions with `info.autoReset` on read only the LAST render — the composite quad.
- The blob probe read `hit.toi`; Rapier 0.20 says `timeOfImpact`. Every blob was NaN-hidden.
- The post chain reports 0x0 until its first capture; the suite read `info()` too early.

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
