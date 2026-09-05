# Changelog

Required by GDD §25.1. One entry per increment, newest first. Each entry states the
behaviour hypothesis, what it touched, and what was checked.

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
