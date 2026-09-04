# Phase 11 build-side plan — onboarding, settings, instrumentation, fixes

Produced 2026-09-04 by a six-mapper read of the codebase against GDD §25.2 Phase 11 and §26, synthesised and ordered by one architect. Each milestone ends in a syntax-checked, smoketest-green, pushed build with the playable link. Suite numbering continues from m14.

**Order:** M1 → M2 → M3 → M4 → M5 → M6 → M7 → M8

**Rationale.** Ordered by (1) which §26 acceptance criteria close, (2) what an external group needs to complete-and-replay and be measured, (3) blast radius on the 893 green assertions. M1 (2h) and M2 (5h) go first because the Phase 11 gate is literally 'complete and replay' and today's replay is silently corrupt: state.phase never reaches transit/delivery (interact.js:564 bypasses game.setPhase; main.js:612 matches only 'settlement'), settle() runs twice per settlement, and from run 2 on item damage is written to an orphaned state object (main.js:165 → damage.js:56 vs game.js:156) while tools keep dolly friction, shrunk colliders and no-collide groups (main.js:656-669, :711). These close §26.1 and §26.6 with near-zero risk — every call already exists in tools/m11-tests.js:150-164 — and the three-run soak is the numeric proof §26.6 asks for. M3 (5h) closes §26.5 'solo pause' and §25.3 parity: a tester who alt-tabs is stuck with no on-screen exit (main.js:718/723/728) and a controller-only player cannot start or pause; the debug overlay also ships on (config.js:677). M4 (6h) closes two more §26.5/§26.6 lines by copying AirportBaggageCrew's settings panel and STES's versioned save, wiring only settings that measurably consume (INDEX.md:726). M5 (5h) is the §26.5 'both input mappings' and §26.7 comprehension work — seat-1/pad glyphs, an objective line and a room hint — that decides a tester's first minute. M6 (6h) is the 'instrumentation' in Phase 11's title: without a run recorder, export and the §27.3 questionnaire, the external playtest yields anecdotes not numbers; it sits after M4 because it persists answers through save.js and after M1 because phase durations need real phases. M7 (4h) addresses §26.2 solo drag — the playtest's harshest verdict and the thing CLAUDE.md says content cannot fix — via two config numbers and one subtraction, deliberately excluding the hand-frame damping rewrite whose blast radius covers every quoted lift/dolly number. M8 (3h) is last: it is the only content-adjacent change (a data row and a spawn move), its m6 E8 rewrite is the riskiest single test edit, and its value is only realised once M6 can record what testers do at the 0.86 door. Total ≈ 36h; each milestone ends in a syntax-checked, smoketest-green, pushed build with the playable link. Suite numbering continues at m14 (tools/m0..m13 exist).

## M1 — Phase machine reaches TRANSIT and DELIVERY; settle() runs once

*GDD:* §3.4 phase machine; §23.3 ContractPhase; §26.1 'start, complete, and replay'; §26.5 'states understandable'; §21.2 contract UX names the phase; §27.4 'phase duration'  
*Size:* ~2 h · *depends on:* nothing

**Why.** state.phase never leaves 'pickup' until settlement: interact.js:564 emits CONTRACT_PHASE{to:'transit'} on the bus without game.setPhase, the only listener (main.js:612) matches 'settlement', so the guard at main.js:458 is never true, DELIVERY is never entered, the 'arrived — unload through the back' notice (main.js:460) never fires and the HUD contract panel (hud.js:154-158) says 'pickup' for the whole drive. settle() also re-enters once per settlement (interact.js:568 → main.js:612 → main.js:607 → game.js:146 → main.js:612), running buildInvoice/reviewFor/invoiceScreen.show twice. This is the smallest fix that makes the phase word, the arrival notice and every later phase-duration/telemetry milestone possible.

**Scope.** Add a `setPhase` callback to InteractionSystem's constructor opts (interact.js:68, wired main.js:277-280) and call it in _useCab (interact.js:560-572) instead of the bare bus emits at :564 and :568, so game.setPhase (game.js:142-148) is the only CONTRACT_PHASE emitter. Guard main.js:612 with `game.state.phase !== PHASES.SETTLEMENT`. Keep _useCab's return strings (m12 G2/G3, m11 B6/E4). Add `telemetry.phaseMs` accumulation beside game.js:110-112 (plain object in createInitialState game.js:24-61). Fix the 0-stamped emits in straps.js:82,101 and interact.js:456,477,490 and tools.js:169,195,223,285 by passing the clock's simTimeMs (a getter on the constructor opts), and pass simTimeMs into damage.flush() at main.js:593. Record in CHANGELOG/KNOWN_ISSUES.

**Files:** src/player/interact.js, src/main.js, src/game.js, src/cargo/straps.js, src/tools/tools.js, src/damage/damage.js, tools/m11-tests.js, docs/CHANGELOG.md, docs/KNOWN_ISSUES.md

**Reuse.** No copy needed — game.setPhase already exists (game.js:142-148, itself copied from AirportBaggageCrew game.js per game.js:3). Telemetry-counters-on-state pattern from SmallTownEmergencyServices\src\game.js:118.

**Acceptance tests.**
- m11 E4b: after interact.act at the cab, game.state.phase === 'transit' (was 'pickup').
- m11 E6b: after route.routeSteps()+1 game.frame(16.667) calls, game.state.phase === 'delivery' and huds[0].contract.textContent matches /delivery/i; pendingNotices (exposed on api) contains a text matching /arrived/.
- m11 G2b: a bus.on(CONTRACT_PHASE) spy counts exactly 1 event with to==='settlement' per M.settle(), and a spy on invoiceScreen.show counts exactly 1 call.
- m11 G2c: bus.log entries with type CONTRACT_PHASE form the sequence pickup→transit→delivery→settlement with strictly increasing simTimeMs, all > 0 except the boot PICKUP.
- m11 T1: sum over game.state.telemetry.phaseMs === game.state.elapsedWorkMs ± 16.667 at settlement.
- m11 T2: every STRAP_CHANGED and TOOL_STATE entry recorded after simTimeMs 1000 has simTimeMs > 0; DAMAGE_APPLIED entries have simTimeMs >= their ledger line's timeMs.
- Regression: m0 E15/E16/G6, m8 C1/D4, m11 B6/E4/E6/E7/G7/G8, m12 G2/G3 unchanged; all 14 suites ALL-PASS; game.state still JSON-serializable (m11 H2).

**Risks.**
- m11 E section drives 1750 steps via {step(1); route.step} rather than game.frame() — the 'phase' system (main.js:457-462) only runs inside game.frame, so E6b must use frames or call the phase system explicitly.
- hud.js:183 route bar keys on route.status().state, not phase — check it still shows during transit after the phase word changes.
- Interact tests construct InteractionSystem directly in some suites; the new setPhase opt must default to a no-op so m11 B6's promise sweep is unaffected.

## M2 — Replay unwinds through the real API, damage rebinds, and a three-run soak proves no growth

*GDD:* §26.6 'reset removes straps, grips, damage records, fragments, route state' and 'no unbounded growth in active bodies, logs, decals, or constraints over three runs'; §26.1 replay; §26.4 invoice accuracy; §27.1 reset idempotence; §25.2 Phase 11 gate 'complete and replay'  
*Size:* ~5 h · *depends on:* M1

**Why.** From the first 'Run it again' on, item damage is never billed: DamageSystem stores the boot-time game.state (main.js:165, damage.js:56), game.reset() replaces it (game.js:156), nothing re-points it, so _closeWindow (damage.js:144) writes to an orphaned ledger while buildInvoice reads the new, empty one. resetContract also nulls tool flags directly (main.js:656-669) instead of detachDolly/removeBlanket/retrieveRamp, so a couch keeps friction 0.04 + Min rule (tools.js:143,164) forever; respawnContract sets removedParts=[] (main.js:711) without reassemble, freezing a shrunk collider; a carried tool keeps toolCarried groups (world.js:59) and falls out of the world; controller.recoveries (controller.js:79) is never zeroed so run 2 bills run 1's recovery fee. StrapLines never evicts (strapLines.js:104) — +6 Three objects per strap per session. m11 G11 passes vacuously. The Phase 11 gate is literally 'replay'; today's replay is silently corrupt.

**Scope.** main.js:626-672 and :697-715: after game.reset() set `damage.state = game.state` (or make DamageSystem take a getter); replace the tool block with tools.detachDolly/removeBlanket/retrieveRamp by def.effect, then collider.setCollisionGroups(GROUP_PRESETS.object) and state.geometry=null; in respawnContract call reassemble() for every entry in removedParts before clearing, and clear loadedOnTrip/everHeld/outOfBoundsMs/frictionBefore/combineRuleBefore/dimensions; zero m.controller.recoveries and _downMs per mover. Copy the ordering and the comment from tools/m11-tests.js:139-164 verbatim. strapLines.js:103-105: delete + dispose the record on release instead of hiding it. Expose resetContract and pendingNotices length on window.__MFH (main.js:870). New tools/m14-soak-tests.js: three full runs (strap on fridge via m11 D pattern, dolly under couch + wardrobe door off via m11 C, one TV drop, E at cab, routeSteps()+60 frames, m10 cleanDelivery teleport, M.settle(), onReplay()) sampling counters after run 1 and run 3, draining pendingNotices each run.

**Files:** src/main.js, src/damage/damage.js, src/render/strapLines.js, src/player/controller.js, tools/m11-tests.js, tools/smoketest.ps1, docs/KNOWN_ISSUES.md, docs/CHANGELOG.md · **new:** tools/m14-soak-tests.js

**Reuse.** The unwind ordering is already written in this project at tools/m11-tests.js:150-164 — copy it into resetContract. Soak structure: AirportBaggageCrew\tools\_soak.js + _invariants.js (INDEX.md:619 — check every invariant after every step; assert the thing you randomised actually differs).

**Acceptance tests.**
- m11 G13: after onReplay(), drop the TV from 1.5 m, damage.flush(simTimeMs) → game.state.ledger.itemDamage.length >= 1 and buildInvoice().lines has an item-damage line whose from[] cites every ledger entry (reconcile() ok).
- m11 G14: dolly under couch at settlement → after onReplay couch.collider.friction() === couch.def.physics.friction (0.35 ± 1e-6), frictionCombineRule() === Average, couch.state.dollyId == null, dolly.state.attachedTo == null.
- m11 G15: wardrobe doors off at settlement → after onReplay collider.halfExtents().z*2 === def.dimensions.z (0.60 ± 1e-6), mesh.scale.z === 1, removedParts.length === 0, and disassemble() succeeds again.
- m11 G16: ramp carried at settlement → after onReplay ramp.collider.collisionGroups() === GROUP_PRESETS.object, body.isDynamic(), and after 120 frames translation().y > RECOVERY.objectFloorY.
- m11 G17: one mover recovery in run 1, none in run 2 → run 2 invoice has no recovery-fee line and recoveryCount() === 0 at run-2 settlement.
- m14 S1: physics.stats.bodies, .colliders, world.scene.children.length, renderer.info.memory.geometries and .textures after run 3 equal run 1 exactly.
- m14 S2: strapLines.pool.size after run 3 === after run 1, and === straps.count at every sample.
- m14 S3: game.state.ledger.itemDamage.length >= 1 at settlement of runs 2 and 3 (TV dropped each run).
- m14 S4-S6: every registry entity has condition 100, friction === def.physics.friction, Average rule, halfExtents === def.dimensions/2, mesh.scale 1, removedParts [], dollyId/blanketId null at the start of runs 2 and 3; every tool isDynamic() with object groups and y > objectFloorY.
- m14 S7: bus.log.length <= 256, hud._notices.length <= 4, tools.tools.size === 4, registry.count constant at every sample; game.state.telemetry and ledger JSON round-trip.
- m14 S8: performance.memory.usedJSHeapSize(run3) <= 1.10 × run1 when present, else a NOTE line (not a FAIL).
- Regression: m11 G7-G12, m10 F1-F3, m0 E12-E15, all body-count pins (m1 G1a … m13 E2) unchanged; syntax-check.sh clean.

**Risks.**
- Three runs ≈ 3×(1680+300) steps must fit smoketest.ps1's 240 s virtual-time budget (:77); bump the budget for m14 only if needed.
- StrapLines eviction changes the render pool contract; m9/m11 strap-render assertions that read pool entries by id after release must be checked.
- Re-pointing damage.state has one write site (damage.js:144) and one read (:159) — low, but DamageSystem.reset() must also clear the NEW state's ledger, so call order in resetContract matters (reset after game.reset, or re-point first).

## M3 — Pause card and controller parity for the shell (pause, start, join, recover)

*GDD:* §21.4 Cognition 'Solo pause'; §26.5 'Solo pause freezes relevant simulation safely'; §21.2 'A retry keeps settings'; §4.4 'every essential action requires controller parity'; §25.3 'work on keyboard/mouse and a standard controller'; §6.4 co-op grips  
*Size:* ~5 h · *depends on:* nothing

**Why.** The sim pauses (game.js:122-130) but there is no pause surface — 'PAUSED' is rendered only in the debug overlay (debugOverlay.js:63). After a window blur (main.js:718) the game is paused with the pointer unlocked and a canvas click is ignored (main.js:723); the only exit is Esc, which nothing on screen says. Esc is read as a raw keycode (main.js:728) so the bound PAD.MENU 'pause' action (input.js:68,82,115,128) is dead; the title card listens only to keydown/click (titleScreen.js:70-78) so a controller-only player cannot even start; the title's Escape listener and the shell's both fire on one keystroke. Pointer-lock loss calls clear() for all seats (input.js:377), dropping P2's grip. The debug overlay ships ON (config.js:677). An external tester who alt-tabs once is stuck; that is a playtest-ending defect.

**Scope.** New src/ui/pauseScreen.js modelled on titleScreen.js (same .card tokens, z-index 30 between #settlement and #title-screen, pointer-events auto like invoiceScreen.js:32): subscribes to EVENTS.SIM_PAUSED/SIM_RESUMED; hidden while title.visible or invoiceScreen.visible; buttons Resume (setPaused(false) + requestPointerLock when activeDevice[0]==='kbm'), Restart contract (resetContract via api), and an empty 'Settings' slot for M4; a 'paused — window lost focus' line on blur. Route pause through the action: add Input.consumeShellEdge(action, seat) (edges only clear in endStep, game.js:114, which never runs while paused) and read it per seat in loop() (main.js:~751) replacing main.js:728; title.start() on P0 pad A while title.visible; COOP.joinPad = PAD.VIEW in config.js:262-274 read beside F2 (main.js:740); add PAD.DPAD_DOWN to 'recover' for both seats (input.js:62,114). Remove the title's Escape from titleScreen.js:73 (Enter/Space/click/pad A start). input.js:377 → _clearSeat(0). Flip DEBUG.overlayEnabledByDefault to false (config.js:677). Treat pointerlockchange→unlocked while unpaused and not in settlement as a pause request (Chrome swallows the first Esc).

**Files:** src/main.js, src/core/input.js, src/ui/titleScreen.js, src/config.js, styles.css, tools/m0-tests.js, tools/m12-tests.js, README.md, docs/KNOWN_ISSUES.md · **new:** src/ui/pauseScreen.js, tools/m15-tests.js

**Reuse.** Pause/menu open-close pair and card markup: copy from Dev\INDEX.md 'Onboarding, settings, accessibility' (AirportBaggageCrew title/pause screens, INDEX.md:588-597) and this project's own titleScreen.js:20-92. Shell-edge consume helper is new — add an INDEX.md row.

**Acceptance tests.**
- m15 P1: game.setPaused(true) → document.querySelector('#pause-screen').hidden === false and textContent matches /PAUSED/; setPaused(false) → hidden === true.
- m15 P2: with title.visible, setPaused(true) leaves #pause-screen hidden; after M.settle() (paused) it stays hidden; after onReplay() it stays hidden.
- m15 P3: 60 game.frame() calls while the card is shown advance clock.simTimeMs by 0 and elapsedWorkMs by 0 (m0 A9/E3 invariant through the card).
- m15 P4: clicking [data-act=resume] → !game.state.paused; clicking [data-act=restart] → m11 G8-G12 predicate (phase 'pickup', 23 rows, straps.count 0, !paused).
- m15 P5: input._debugPad(0, PAD.MENU, 1) + one frame → paused flips true; 10 more frames held → still true (edge consumed once); release + press → false. dispatch KeyboardEvent 'Escape' on window → toggles the same way.
- m15 P6: title.visible === true; _debugPad(0, PAD.A, 1) + frame → title.visible === false, game.state.paused === false, no #err-banner.
- m15 P7: solo, _debugPad(0, PAD.VIEW, 1) + frame → huds.filter(h => !h.el.hidden).length === 2 (join); _debugPad(0, PAD.DPAD_DOWN, 1) → input.wasPressed('recover', 0) === true.
- m15 P8: setSeats(2); _debugPress('BracketLeft'); _debugPress('Mouse0'); simulate pointerlockchange with pointerLockElement null → isDown('gripLeft', 1) === true and isDown('gripLeft', 0) === false.
- m15 P9: at boot document.querySelector('#debug-overlay').hidden === true; dispatch F3 → false.
- Regression: m0 B16/B17 (pause keeps PAD.MENU), m0 B22, m12 C5-C8, m12 E1/E2, m11 G1-G12 unchanged; all suites still boot without clicking (title never gates game.frame).

**Risks.**
- Esc semantics vs Chrome pointer lock: the first Esc while locked only fires pointerlockchange (input.js:374) — the pointerlockchange-as-pause path must not fire during settlement (lock released at main.js:610) or on title start.
- m12 E1/E2 and H1 pin HUD visibility on setSeats; a pad join path must call the same setSeats(2).
- Any new panel must keep #ui pointer-events:none except itself, and m11 F2's centre-clear test is vacuous today (queries ids that no longer exist, m11-tests.js:488) — repair it to class selectors in this milestone so the card's Resume button is asserted outside the centre third while unpaused.

## M4 — Settings panel with versioned localStorage persistence (grip toggle, sensitivity, invert, deadzone, UI scale, camera distance)

*GDD:* §21.4 Input/Motor/Vision/Motion rows; §26.5 'Grip toggle, sensitivity, camera shake, UI scale … exist'; §26.6 'Save/settings reject incompatible versions safely'; §21.2 'A retry keeps settings'; §13.4 saved best invoice stub; §27.1 save-version migration  
*Size:* ~6 h · *depends on:* M3

**Why.** DEFAULT_SETTINGS (input.js:140-148: mouseSensitivity, padLookSensitivity, keyLookRate, invertLookY, stickDeadzone, triggerThreshold, gripMode) is read live at 12 sites but has zero writers, zero UI and zero persistence (grep localStorage in src → 0; KNOWN_ISSUES.md:544-546). Grip toggle is implemented (input.js:502-514) and unreachable. Every font-size in styles.css is a raw px (10-17px) with no scale variable. §26.6's version gate has nothing to gate. Two §26 criteria close with one panel that only wires controls that measurably do something (INDEX.md:726: assert consumption, not presence).

**Scope.** Copy AirportBaggageCrew\src\ui\settings.js → src/ui/settings.js and SmallTownEmergencyServices\src\core\persistence.js storage() probe → src/core/save.js (one key 'mfh.save', payload {schema:1, build:BUILD.label, settings, bestInvoice}); load() returns defaults on missing key/parse error/schema !== 1/non-object and never throws; save() try/catch. Add Input.applySettings(patch) (validate keys against DEFAULT_SETTINGS, clamp, clear _latched on gripMode change) + getSettings(); pass load().settings as the 4th arg at main.js:112. Add `invertLookX` beside invertLookY. `--ts` on :root and `calc(Npx * var(--ts))` on every font-size in styles.css (INDEX.md:595). Camera distance via m.rig.setDistance (main.js:247) with RENDER.camera bounds in config.js:54-60; quality tier via the ?tier seam (main.js:80-87) labelled 'applies on reload'. Panel reachable from the title .card (titleScreen.js:36) and the pause card slot (M3). settle() writes bestInvoice when profit improves; invoice sheet shows 'best so far'. Pass frameMs into input.poll() and scale pad/key look by frameMs/16.667 (input.js:473-475, 482-490) so 'sensitivity' is not FPS-relative. Do NOT add camera-shake, reduced-motion or subtitle controls — there is nothing for them to consume yet (no shake, no audio).

**Files:** src/core/input.js, src/main.js, src/game.js, src/ui/titleScreen.js, src/ui/pauseScreen.js, src/ui/invoiceScreen.js, src/config.js, styles.css, tools/m11-tests.js, docs/KNOWN_ISSUES.md, C:/Dev/INDEX.md · **new:** src/ui/settings.js, src/core/save.js, tools/m16-tests.js

**Reuse.** AirportBaggageCrew\src\ui\settings.js (INDEX.md:597, panel reachable from title and pause); AirportBaggageCrew\styles.css `--ts` pattern (INDEX.md:595); SmallTownEmergencyServices\src\core\persistence.js versioned save with storage() probe (INDEX.md:508/525); ContainmentDetailWeb\tools\m0-tests.js sections S/T 'assert consumption' shape (INDEX.md:726).

**Acceptance tests.**
- m16 V1: localStorage cleared → load() deep-equals {settings: DEFAULT_SETTINGS, bestInvoice: null}.
- m16 V2: localStorage 'mfh.save' = JSON {schema:0} → load() returns defaults and the stored blob is unchanged (read back byte-equal); V3: 'not json' → defaults, no throw; V4: save(x) then load() deep-equals x.
- m16 V5: setItem monkeypatched to throw → M.settle() still shows the invoice (m11 G2/G3 predicate) and no #err-banner.
- m16 I1: applySettings({mouseSensitivity: 2}); input.pointerLocked = true; dispatch mousemove movementX 10 → input.looks[0].x === 20 (was 10). I2: applySettings({invertLookY: true}); movementY 5 → looks[0].y === -5. I3: applySettings({invertLookX: true}); movementX 10 → looks[0].x === -20.
- m16 I4: applySettings({gripMode:'toggle'}) → _latched.size === 0; _debugPress('Mouse0'); _debugRelease('Mouse0') → isDown('gripLeft') === true (latched); second press+release → false; applySettings({gripMode:'hold'}) → _latched.size === 0.
- m16 I5: applySettings({stickDeadzone: 0.5}) → deadzone(0.4) === 0 and deadzone(0.6) > 0; applySettings({bogus: 1}) leaves getSettings() key set identical to DEFAULT_SETTINGS + invertLookX.
- m16 I6: two poll(16.667) with lookRight held (seat 1) accumulate looks[1].x equal ±1e-6 to one poll(33.333); poll() with no arg equals poll(16.667).
- m16 U1: document.documentElement.style.setProperty('--ts', 1.5) via the panel → getComputedStyle(huds[0].prompt).fontSize === 18px (was 12px) and .contract 16.5px; repaired m11 F2 (class selectors) still reports the centre third clear.
- m16 U2: every control in the panel, iterated by data-setting, changes its bound getter after set (loop; zero inert controls).
- m16 U3: setting cameraDistance to RENDER.camera.max → M.rig.distance === that value ±1e-6 after one frame.
- Regression: m0 B8-B11 (defaults still 'hold'; ctor arg still works), m0 G10-G14, m11 F1-F9, m12 H1-I3, m0 E8 / m12 J3 (settings never enter game.state).

**Risks.**
- Any px font-size left un-multiplied silently opts out (INDEX.md:595) — grep styles.css for 'font-size:' and assert count(calc) === count(font-size) in U1.
- Retuning pad/key look to per-frame-ms changes feel; record before/after (2.6*10 per frame ≈ 3.4 rad/s at 60 FPS) in PLAYTEST_NOTES.
- Headless Chrome under --user-data-dir has working localStorage, so m16 must clear the key in setup and teardown or runs contaminate each other.

## M5 — Device-aware prompt glyphs per seat, objective line, and destination-room hint

*GDD:* §26.5 'Essential actions have visible prompts and both input mappings' and 'Objective, cargo, destination … understandable without color'; §26.7 Comprehension 'identify the next objective without coaching'; §21.1 'compact objective count … destination feedback'; §4.4 controller parity; §21.3 first steps  
*Size:* ~5 h · *depends on:* M1

**Why.** Prompts hard-code seat-0 keyboard glyphs: 'E'/'Q' (hud.js:144-145), 'hold LMB / RMB to grab' (hud.js:123), 'hold LMB/RMB to carry' (interact.js:302). Seat 1 (Quote/Semicolon/[ ] or pad X/RB/LT/RT, input.js:96-130) is told to press E; input.activeDevice[seat] is computed (input.js:353,361,469) and read only by the debug overlay. Nothing on screen says which room an item is for — manifest rows carry toZone (manifest.js:118-121) but describe() never surfaces it; the contract panel shows 'right room r/d' only after the first delivery (hud.js:161). §26.7 rests on 'PICKUP · manifest 0/23' plus the cab prompt. An external tester's first minute is decided here.

**Scope.** input.js: pure glyphFor(action, seat, device) deriving a label from the live binding (_tokens input.js:525-533; KeyCode→label map, PAD→'A'/'X'/'LT'…). Hud.setPrompt(d, glyphs) and Hud.update(status, glyphs) take {primary, secondary, gripL, gripR}; main.js:801-805 passes glyphsFor(seat, input.activeDevice[seat]) with a 250 ms debounce on device switch (sim time). interact.js:302 returns a device-neutral hint the HUD resolves. Add `.objective` under the contract panel (hud.js template :33-45, cache :48-59, write via _set) fed from main.js:782-790: pickup+0 loaded → names the truck; pickup+N loaded → 'load M more or drive'; transit → route label; delivery → 'unload — N left'. describe() for a manifest object adds ' → <room label>' from a defId→row map over manifestSummary rows. One stall hint (INDEX.md:593 advisory pattern) as a 'good' notice if no grip within CONTRACT.stallHintMs of sim time, once per run. Refresh #help (main.js:555-563) and seat tag (main.js:801) to name the device. No new centre panels.

**Files:** src/core/input.js, src/ui/hud.js, src/player/interact.js, src/main.js, src/config.js, styles.css, tools/m11-tests.js, tools/m12-tests.js

**Reuse.** Stall-hint pattern: INDEX.md:593 (advisory, no training pause). Glyph table: none in INDEX — add an INDEX.md row for glyphFor after building. Hud._set diff gate (hud.js:102-106) is this project's own.

**Acceptance tests.**
- m12 K1: glyphFor('interact', 0, 'kbm') === 'E'; glyphFor('interact', 1, 'kbm') === "'"; glyphFor('interact', 0, 'pad') === 'X'; glyphFor('gripLeft', 1, 'pad') === 'LT' (pure, no DOM).
- m12 K2: setSeats(2); input.activeDevice[1] = 'kbm'; huds[1].setPrompt(d, glyphsFor(1,'kbm')) → huds[1].prompt.textContent contains "'" and not /\bE\b/; grip label matches /\[ \/ \]/ and not /LMB/.
- m12 K3: input.activeDevice[0] = 'pad' + 1 frame → huds[0].prompt matches /X/ and grip label /LT \/ RT/; back to 'kbm' → /E/ and /LMB/; a single flicker to 'pad' for < 250 ms sim time does not change the glyph.
- m11 F3 unchanged: setPrompt with no glyph arg renders 'E'; m11 F9 unchanged (identical input → identical innerHTML); m12 H3 no element carries id 'prompt'; m12 H4a-H4c class preservation.
- m11 O1: at boot (pickup, 0 loaded) huds[0].el.querySelector('.objective').textContent matches /truck/i; O2: after cargo.step reports 1 loaded, text matches /drive/i; O3: in DELIVERY (M1) text contains manifestSummary().total - delivered as a number.
- m11 O4: interact.describe(mover) with the couch under the reticle → hint contains the DEST_ZONES label for row.toZone (e.g. /living/i).
- m11 O5: repaired F2 — every .contract/.cargo-status/.notices/.route-bar/.objective bounding rect lies outside the centre third of the viewport (x in [w/3, 2w/3] ∧ y in [h/3, 2h/3] intersects none).
- m11 O6: with no grip for CONTRACT.stallHintMs of sim time, exactly one notice matching /grab|hold/ is pushed; 60 paused frames do not advance the timer; it fires at most once per run (reset on onReplay).
- Regression: m11 B6 promise sweep and D4/E3 prompt regexes still match on action words; all 14 suites ALL-PASS.

**Risks.**
- m11 F3/B6/D4/E3 assert on action words by regex — the glyph token must never replace the verb.
- activeDevice flips on any pad stick noise (input.js:454,469); without the debounce the prompt flickers between E and X.
- The objective line must stay one row (§21.1 'not a checklist', hud.js:151-153 rationale) — assert its offsetHeight <= 2 × line height.

## M6 — Run recorder, exportable run summary, and the §27.3 questionnaire on the settlement sheet

*GDD:* §22.3 'lightweight event log for scoring and debugging'; §22.5 'Export event log and invoice inputs for reproducible reports'; §27.3 seven playtest questions; §27.4 'phase duration, grips, drops, recovery, damage, strap use, cargo motion, trips, completion, restart … human-readable and deletable'; §25.2 Phase 11 'instrumentation'; §26.7 signals; §26.6 bounded logs  
*Size:* ~6 h · *depends on:* M1, M4

**Why.** The bus log is a 256-entry ring cleared on reset (eventBus.js:53, game.js:157); nothing is exported (grep JSON.stringify|clipboard|Blob in src → 0). Of §27.4's ten signals only damage and completion have a source; trips is constant 1 (cargo.js:45, state.tripCount never written), recoveries emit fee:0 (main.js:398) and object recoveries emit nothing (registry.js:237), cargo motion is measurable (cargo.js:189-210) but never measured. §27.3 is answered only by the developer (PLAYTEST_NOTES.md:411-530). The Phase 11 gate needs external groups' data; without this milestone a playtest produces anecdotes.

**Scope.** New src/telemetry/runLog.js: RunRecorder.attach(bus) via bus.onAny (eventBus.js:70), O(1) push into events[] capped at TELEMETRY.maxEventsPerRun with a dropped counter; counters on game.state.telemetry (M1 created it): grips, drops (GRIP_ENDED.reason !== 'released'), recoveries (mover + object — emit EVENTS.RECOVERY from registry.recover with fee: ECONOMY.recoveryFee, give registry a bus), damageEvents, impacts, straps by state, roadEvents, cargoLoaded/unloaded, worstCargoShift (call cargo.snapshotPositions at depart and shiftSince at arrival), restarts (kept on the recorder, survives reset). buildRunSummary(state, invoice, review, summary, stats, recorder) pure → {build, seed, phases, counters, invoice, review, stats, questionnaire, events}. settle() (main.js:592-611) builds it and passes it to invoiceScreen.show as a 5th arg; resetContract closes recorder.lastRun before game.reset(). New src/ui/questionnaire.js renders the seven §27.3 questions verbatim (GDD.md:1421-1427) under .stats (invoiceScreen.js:92): Q2,Q3,Q4,Q5,Q7 as 1-5 radios with text anchors, Q1/Q6 short text, Skip; stopPropagation on keydown inside the form. [data-act=copy] button with a hidden textarea fallback producing pretty JSON; past responses under try/catch localStorage via M4's save.js with a 'clear responses' button. Expose recorder/runSummary on window.__MFH. Zero external requests — say so in README limitations.

**Files:** src/main.js, src/game.js, src/config.js, src/ui/invoiceScreen.js, src/objects/registry.js, src/cargo/cargo.js, styles.css, README.md, docs/PLAYTEST_NOTES.md, C:/Dev/INDEX.md · **new:** src/telemetry/runLog.js, src/ui/questionnaire.js, tools/m17-tests.js

**Reuse.** SmallTownEmergencyServices\src\game.js:118 state.telemetry counters and src\ui\shiftReport.js buildShiftReport (pure state→report, spreads telemetry); clipboard copy with select() fallback from SmallTownEmergencyServices\src\ui\hud.js:140-148 / ContainmentDetailWeb\src\core\crash.js:504-510; persistence via M4's save.js. No INDEX row exists for an event-log exporter or in-game questionnaire — add both after building.

**Acceptance tests.**
- m17 R1: after 300 frames with impacts, recorder.events.length === bus.emitted (bus.log.length still <= 256).
- m17 R2: JSON.parse(JSON.stringify(M.runSummary())) round-trips and has keys phases, counters.{grips,drops,recoveries,damageEvents,straps,cargo,trips,worstCargoShift}, complete, restarts, questionnaire — one per §27.4 signal.
- m17 R3: after one grab, one release, one forced drop (m2 pattern): counters.grips === count of GRIP_STARTED in recorder.events === 2, counters.drops === 1.
- m17 R4: registry.recover(entity) emits exactly one RECOVERY with fee === ECONOMY.recoveryFee; counters.recoveries === recoveryCount() at settlement.
- m17 R5: three settle→replay cycles: recorder.events.length <= TELEMETRY.maxEventsPerRun each run, recorder.lastRun.restarts === 2 on run 3, stored runs <= TELEMETRY.keepRuns.
- m17 R6: same seed, identical scripted inputs, with and without the recorder attached → buildInvoice().lines and ledger.itemDamage deep-equal (recorder never writes state).
- m17 Q1: after M.settle(), #settlement contains 7 [data-q] controls q1..q7 whose label text equals the §27.3 sentences; Q2: onReplay() with no answers → phase 'pickup' (m11 G8 unchanged); Q3: set q3=4, q6='the couch', click [data-act=copy] → textarea value parses with questionnaire.q3 === 4, questionnaire.q6 === 'the couch' and invoice.profit to 2 decimals.
- m17 Q4: after replay and a second settle the form is empty and runSummary().questionnaire === null; Q5: dispatching KeyboardEvent 'Escape' with the textarea focused leaves game.state.paused unchanged; Q6: localStorage accessor throwing → questionnaire renders and copy works.
- Regression: m0 E14/E17/E18, m11 G1-G12, m11 F9, m8 E2, m10 B1-B12 unchanged; systemMs over 600 frames within 0.2 ms of the unattached run (overlay stats).

**Risks.**
- onAny handlers run synchronously inside the fixed step (eventBus.js:86-87) — the recorder must be a bare push; R6 and the systemMs bound guard it.
- Text inputs inside #ui receive keys that main.js:727 and titleScreen also listen for on window — stopPropagation is mandatory (Q5).
- Giving ObjectRegistry a bus changes its constructor (main.js:132) and m2/m3/m4/m13 construct registries in teardown — default the bus to null.

## M7 — Solo couch drag travels: traction budget and braced stretch band

*GDD:* §26.2 'A couch-equivalent can be dragged solo and handled materially better with another grip/player'; §6.2 'Brace state raises force cap and stability'; §6.3 heavy tier 'one drags or pivots'; §2.1 'allow awkward solo dragging'; §25.2 Phase 3 gate 'weight legible without hard denial'  
*Size:* ~4 h · *depends on:* nothing

**Why.** Bare solo couch drag covers 0.00 m in 3 s (README.md:290; KNOWN_ISSUES.md:237-239); the playtest verdict is 'unsatisfying … it shuffles' (PLAYTEST_NOTES.md:102-104). CLAUDE.md says more content cannot fix unsatisfying carrying. Derived from the code's own constants: steady pull = F/(PLAYER.mass 78 × CARRY.pullDamping 3.2) = F/249.6 m/s (controller.js:122-126) hits the 1.22 m/s tow cap at 305 N, but the couch needs 552 N (Average combine rule, registry.js:68-77) — the mover is hauled back, stretch collapses, pull decays, repeat. And brace multiplies a cap (grip.js:412) the one-hand couch never reaches because the tear at spring×maxStretch = 630 N binds first (definitions.js:84-86). Two config numbers and one subtraction fix the limit cycle without touching the spring.

**Scope.** config.js CARRY: tractionN = 350, braceTractionMult = 1.6 (0 when airborne/knocked down); PlayerController.applyCarry (controller.js:114-132) integrates only max(0, |reaction| - traction) along the reaction direction, keeping resistedForce as the full magnitude so loadSpeedMult (controller.js:136-143) still bills effort; pass brace from grips.step (grip.js:319,467). config.js GRIP.braceStretchMult = 1.10 (braced tear 0.77 m → 693 N, still < the fridge's 745 N so m6 B6's binary holds) applied at the tear check (grip.js:371) and in towSpeedLimit (grip.js:306). Re-measure with tools/m6-tests.js haulDistance (m6-tests.js:126-169) and rewrite README.md:290-291, KNOWN_ISSUES.md:124-131/237-243 and PLAYTEST_NOTES with the new numbers. Hand-frame damping (the larger change) is deliberately NOT in this milestone.

**Files:** src/config.js, src/player/controller.js, src/player/grip.js, tools/m3-tests.js, tools/m6-tests.js, README.md, docs/KNOWN_ISSUES.md, docs/PLAYTEST_NOTES.md, docs/CHANGELOG.md

**Reuse.** None in INDEX.md — this project's grip spring is the reference implementation. Reuse the project's own haulDistance (tools/m6-tests.js:126-169) and liftTogether (tools/m4-tests.js:291-337) harnesses as-is.

**Acceptance tests.**
- m3 D5 (closed form on config): 552 - CARRY.tractionN < 1.22 × PLAYER.mass × CARRY.pullDamping (i.e. 202 < 304.5) and CARRY.tractionN < 400 so D1/D2 keep passing with their 400 N fixture.
- m6 B8: solo, one hand, unbraced, flat floor, bare couch, haulDistance 180 steps → moved >= 0.30 m (was 0.00), heldSteps >= 120/180, moverMoved < 2.0 m.
- m6 B9: same scenario braced → moved >= 0.60 m, heldSteps === 180 (no tear), and braced.moved > unbraced.moved × 1.3.
- m6 B10 (closed form): GRIP.maxStretch × GRIP.braceStretchMult × GRIP.spring < 745 (fridge effective friction) and < GRIP.forceCap × GRIP.braceForceMult; m2 D4c (0.70 < 0.833) unchanged.
- m6 B6 unchanged: bare fridge (braced and unbraced) < 0.35 m in 3 s; m6 B4 dolly couch still > 1.0 m and >= 2.5× bare — if the 1.22 m/s tow cap clamps both, relax to wheeled >= bare + 1.0 m and record the number.
- m4 C2-C5 lift binary unchanged (one hand clear < 0.02 m; two hands > 0.005 m); m4 E two-mover drag >= 1.5× the new solo distance in 180 steps.
- m3 E3/E3a/E4 (peak > 0.3 m/s, mover < 3.0 m, couch < 6.0 m), m3 F4 stumble, m2 D6/E4/E5 unchanged; m2 E2 wall-ghosting retreat test also run braced.
- Suites m2, m3, m4, m6 ALL-PASS; README/KNOWN_ISSUES quote the new measured metres.

**Risks.**
- Co-op sideways yank (PLAYTEST_NOTES.md:470) and imbalanceFromPull (controller.js:365) both shrink by the traction budget — keep tractionN <= 350 so 552 N still pulls visibly.
- Braced band vs fridge margin is 52 N at 1.10; any later friction retune must re-check B10.
- Every measured number in README/KNOWN_ISSUES/CHANGELOG for drag shifts — re-measure, do not hand-edit.

## M8 — Couch legs come off and the couch starts behind the 34-inch door

*GDD:* §8.2 'Furniture legs: unscrew and reattach' and 'preparation time'; §7.1 (the couch 'four legs / screwdriver' is the GDD's own schema example); §3.3 'at least two approaches'; §2.1 'no accidental hard denial'; §13.1 doorway turn; §2.3 prep time costs  
*Size:* ~3 h · *depends on:* M2, M6

**Why.** couch_3seat_01 has disassembly: [] (definitions.js:129) and m6 E8 (m6-tests.js:551-555) asserts that no disassembly is ever a clearance win — the exact opposite of §7.1's example. Its route touches nothing narrower than 0.91 (spawn living room definitions.js:572, ROUTES.living_room = ['front36'] house.js:204, destination openings all 0.91, destination.js:39/81/86), so KNOWN_ISSUES' 'single most important open question' (:187-193) is demo geometry, not play. disassemble() returns seconds (tools.js:412) that _applyTool never charges (interact.js:533-540). One data row, one clock charge and one spawn move turn the 0.86 door into a real two-branch obstacle (legs off: 90 mm; intact on its side: 10 mm) on the shipped contract — the thing the external playtest should judge.

**Scope.** definitions.js:129 → [{part:'legs', tool:'screwdriver', seconds:60, reversible:true, shrinksTo:{x:2.10,y:0.77,z:0.90}}]. _applyTool case 'dimensions' (interact.js:530-541) advances the contract clock by r.seconds × TOOLS.screwdriver.timeScale (config.js:510-519) via a game hook and pushes a notice naming the cost. Move PHASE5_SPAWNS couch row (definitions.js:572) into the kitchen (x 2.50, y 0.45, z -8.40, yaw 0 — 100 mm clear of the fridge at x 3.65) keeping to:'dest_living'; fill fromZone. Rewrite m6 E8 to 'exactly one disassemblable def has min(dimensions.y, dimensions.z) > 0.82 and it is the couch, whose shrinksTo narrowest <= 0.82'. Update tools.js:377-382 docstring, KNOWN_ISSUES.md:8-50 and :220-223. Reset reassembly is already covered by M2.

**Files:** src/objects/definitions.js, src/player/interact.js, src/tools/tools.js, src/main.js, tools/m5-tests.js, tools/m6-tests.js, tools/m11-tests.js, docs/KNOWN_ISSUES.md, docs/CHANGELOG.md

**Reuse.** The disassembly schema and disassemble/reassemble (tools.js:391-434) are this project's own; the six existing entries (definitions.js:224,271,318,340,412,460) are the template. No INDEX row needed.

**Acceptance tests.**
- m6 E13: validateDef(couch_3seat_01) has no problems; disassembly.length === 1, part 'legs', reversible true, seconds × TOOLS.screwdriver.timeScale === 60.
- m6 E14: fitsThroughGap(0.90, 0.77, 0.82) → fits true, faceOn false, clearance 0.05 ± 1e-9; (0.90, 0.77, 0.86).clearance === 0.09; intact (0.90, 0.85, 0.82).fits === false, clearance -0.03 (m0 C5/C6 untouched).
- m6 E15: disassemble(registry, couch, 'legs') → before.y 0.85, after.y 0.77, volumeBefore 1.6065, volumeAfter 1.4553 ± 1e-4; collider.halfExtents().y × 2 === 0.77 ± 1e-6; reassemble → 0.85 and removedParts [].
- m6 E8 rewritten: over defs with disassembly exactly one has min(y, z) > 0.82 and it is couch_3seat_01 with shrinksTo narrowest 0.77 <= 0.82.
- m6 E16 (physics): couch rolled 90° (0.77 across x, long axis along z), centre 1.0 m outside living_kitchen, 600 N along the doorway axis for 3 s — legs off: centre passes the wall's inner face by > 1.0 m; legs on (0.85 across): stopped at the jamb with AABB penetration < 30 mm.
- m11 situation 8 'screwdriver+couch': describe().primary === 'take the legs off the couch'; act() → removedParts includes 'legs'; secondary() → []; promise count 8 made, 8 honoured; m11 C11: elapsedWorkMs advances by 60000 × timeScale more than frame time alone after E, and a notice names the cost.
- m5 placement: couch spawn AABB inside zone 'kitchen', overlapping no partition segment, no doorway clear box and no other spawn AABB; tightestOnRoute('kitchen') === 0.86; intact narrowest 0.850 <= 0.86 (10 mm, no hard denial); fromZone === 'kitchen'.
- m9/m10/m11 end-to-end: manifest still completes with the couch teleported to dest_living; cargo.volumeUsed() with the legless couch loaded === 1.4553 ± 1e-3 vs 1.6065 intact.
- m13 A1/A2/A4 (intact def.dimensions to 1 mm) unchanged; all 14 suites ALL-PASS.

**Risks.**
- m6 E8 was authored to block exactly this claim (m6-tests.js:538-555; CHANGELOG.md:726-733) — rewrite it and its comment deliberately so the record stays honest.
- Relocating the couch raises the shipped contract's difficulty (a 10 mm doorway on its side intact) — this is the design intent (house.js:6-18) but is untested by any human; the questionnaire from M6 is how the answer arrives.
- disassemble() squashes the whole prefab in y (tools.js:403) — reads as a shorter couch, not a legless one; collider-faithful per §13.4, polish later.

## Deliberately not now

- The external playtest itself and the §25.2 Phase 11 gate verdict ('External groups complete and replay') — needs humans; M6 gives them the questionnaire and export so their answers arrive as data.
- The Unity rebuild decision (§29.1 'only then rebuild in Unity') — a product decision after the gate, not a build task.
- Synthesised audio layer (§20.4) with captions as subtitles (§21.4 Hearing, §26.5 'subtitles exist') — 9h, the fifth adaptation of the Chameleon tone synth (copy AirportBaggageCrew\src\systems\audio.js Sfx per INDEX.md:434-441, 'copy, do not rewrite'); §26.5's subtitle clause cannot be honestly closed without it, but it is polish relative to replay/pause/instrumentation and should be the first milestone of the next batch, with the fakeAudioContext determinism tests from ABC m5 E/H.
- Hand-frame grip damping (grip.js:379,406-408 uses absolute object velocity, capping bare tow at ~0.14 m/s) — highest-leverage feel change but shifts every measured lift/dolly/drag number (m4 C2-C5's 11 mm margin, m6 B4/B6); do it as its own increment after M7's numbers are recorded, not inside it.
- Door leaves as removable objects (§8.2 'remove from hinges', 8h) and the hinged-door brute-force branch priced as property damage (12h, needs the unwritten ledger.propertyDamage line, KNOWN_ISSUES.md:375-380) — real §3.3 branches, but new obstacle geometry beside four doorways with m5 B6/m13 B1 rewrites; decide after the first external group has judged the 0.86 door with M8 in place.
- Detached parts as real bodies (TOOLS.screwdriver.partMassFraction, config.js:518, has no consumer; KNOWN_ISSUES.md:263-267) — §26.6 'fragments' stays vacuous until parts exist; expansion hook, leave the seam.
- Trigger-pressure grip strength (§6.5 via input.analog, input.js:557-574 has no gameplay consumer) — touches validated grip tuning (grip.js:410-418) for a controller-only nuance; after the playtest.
- Full key remapping UI (§21.4) — setBindings/bindingConflicts exist (input.js:157-189, 285-309); a remap panel is polish over M4's settings and unpinned by any §26 line.
- Briefing card + animated invoice reveal (§21.2) — moving PICKUP into title.onStart changes boot behaviour every suite depends on (titleScreen.js:9-14; KNOWN_ISSUES.md:539-542) and the reveal is polish; after instrumentation shows whether the invoice reads.
- Multi-trip contracts (state.tripCount never written, cargo.js:45 tripCount fixed at 1) — content while the replay gate is untested; M6 records trips as 1 honestly.
- Opt-in telemetry upload (§27.4) — ruled out by the project's 'Zero external requests' rule (CLAUDE.md:51); local copy/export in M6 is the whole of it.

## Batch 4 addendum — after the eight (added 2026-09-04)

Two items the architect listed under "deliberately not now" moved up once batches 1-3 landed: the audio layer (§26.5 "subtitles exist" has nothing to caption without cues, and the settings card already reserves the volume slots) and hand-frame grip damping (M7 measured the world-frame damping term as the whole reason solo drag does not travel; the seam and harnesses it needs are in).

### M9 — Synthesised audio layer with captions — WebAudio, zero files

*GDD:* §22.2 (UI/Audio presentation); §2.2 / §12 consequential chaos needs to be HEARD; §26.5 'subtitles … exist' and colour-independent cues; §21.4 Hearing (subtitles with direction, visual alerts, volume categories); §26.6 no unbounded growth; §22.4 audio reads state and never writes it  
*Size:* ~9 h · *depends on:* M4, M5

**Why.** There is no sound at all (grep AudioContext/Audio/oscillator in src → 0). Impacts, drops, strap failures, road bumps and the invoice sting are silent, and §26.5's 'subtitles exist' cannot be true without cues to caption. Dev/INDEX.md → Audio records the synth written four times already: COPY tone/makeNoise/atten, the pure mixFor(state) seam, the CUES data table and cueFor/cueVolume from C:/Dev/SmallTownEmergencyServices/src/audio/audio.js (540 lines). The M4 settings card already has master/UI/world volume slots reserved (shell settings) — wire them.

**Scope.** NEW src/audio/audio.js: exports mixFor(state, listeners) (PURE — no WebAudio import; continuous layers engine{gain,pitch} in transit from route speed, roll for an attached dolly moving > AUDIO.roll.minSpeed, strain from carriedMass/imbalance with pitch rising on imbalance, rattle in transit ∝ (1 − packQuality) below AUDIO.rattle.qualityBelow, wind outdoors; nearest-listener attenuation with atten(d, range) squared), RANGE, CUES keyed by EVENTS names (IMPACT thud by materials[] tag with volume ∝ relVelocity above AUDIO.impact.minVelocity; DAMAGE_APPLIED crack; GRIP_STARTED/ENDED soft grab/release, reason 'overstretched' = snap; STRAP_CHANGED ratchet click per state, 'failed' twang; TOOL_STATE clack/rustle/clunk; PART_CHANGED ratchet; CARGO_STATE chime/low note; ROAD_FORCE whoomp ∝ severity; RECOVERY pop; CONTRACT_PHASE sting; SILENT_EVENTS for SIM_PAUSED/RESUMED/RESET, INPUT_CONTEXT, ZONE_CHANGED), every cue row with minGapMs and a `caption` string; class GameAudio { constructor(bus); arm() (lazy AudioContext on first user gesture, returns false when refused — silent non-fatal layer); setMaster/setBus(name, v); update(state, world, listeners, dt) on the RENDER frame; lastCaption(nowMs) for the HUD; info() {voices, queued}; dispose() }; tone, makeNoise. Voice cap AUDIO.maxVoices. src/config.js: frozen AUDIO block (master, buses ui/world/foley, ranges, impact.minVelocity, roll.minSpeed/fullSpeed, rattle.qualityBelow, maxVoices, captionMs) — never a bare literal in audio.js. src/main.js (surgical hunks): construct after boot, arm on the first pointer-lock click / keydown / pad press, update in the render loop after the HUD feed, expose api.audio; `?audio=off` → audio.enabled false and update() a no-op. src/ui/hud.js: a caption line (`.caption`, bottom-centre above the help line) showing the last cue's caption for AUDIO.captionMs with a direction glyph ← → ↑ from listener bearing when the cue has a position; hidden when settings.captions is false. Settings: master/UI/world volume sliders and captions on/off on the M4 card (settingsStore routes them to audio.setMaster/setBus and the HUD; persisted in the shell key). NEW tools/_probe-audio.js printing mixFor for the boot pose, a carry, a dolly roll and transit.

**Files:** src/main.js, src/config.js, src/ui/hud.js, src/ui/settings.js, src/core/save.js, styles.css, tools/m16-tests.js · **new:** src/audio/audio.js, tools/m18-tests.js, tools/_probe-audio.js

**Reuse.** C:/Dev/SmallTownEmergencyServices/src/audio/audio.js — copy tone, makeNoise, atten, the mixFor(state) seam, CUES/cueFor/cueVolume/SILENT_EVENTS, the arm()/resume-on-gesture pattern and the caption idea; keep the function names (Dev/INDEX.md → Audio: 'now written three times — copy, do not rewrite'). Positional pan by camera bearing from Chameleon toneP (INDEX row 486).

**Acceptance tests.**
- m18 A1: every key of CUES is a name in EVENTS, and every EVENTS name is a CUES key OR listed in SILENT_EVENTS (nothing the game emits is unaccounted for).
- m18 A2: mixFor is pure — called twice on the same state it deep-equals; on a bare {} state it returns all-zero gains and throws nothing.
- m18 A3: engine gain is 0 in PICKUP and DELIVERY and > 0 in TRANSIT (drive the phase through interact's cab seam as m11 E4b does, or api.game.setPhase).
- m18 A4: strain gain rises monotonically across three carriedMass samples at fixed imbalance (0 → 30 → 90 kg), and pitch rises with imbalance at fixed mass (0 → 0.5 → 1.0).
- m18 A5: cueVolume('IMPACT', {relVelocity: 4}) > cueVolume('IMPACT', {relVelocity: 1}) and cueVolume('IMPACT', {relVelocity: AUDIO.impact.minVelocity − 0.01}) === 0.
- m18 A6: nearest-listener attenuation — a rolling dolly 2 m from seat 1 and 20 m from seat 0 mixes louder than the same dolly 20 m from both, by ≥ 4× (atten is squared).
- m18 A7: with no AudioContext available (stub window.AudioContext = undefined) new GameAudio(bus) + arm() returns false, update() 300 times never throws, info().voices === 0.
- m18 A8: after bus.emit(IMPACT, {relVelocity: 3, materials: ['wood']}) the HUD caption text equals that cue's caption; after AUDIO.captionMs + 100 of driven sim frames it is empty; with settings captions off it never appears.
- m18 A9: bounded — 1000 IMPACT events in one frame leave info().voices ≤ AUDIO.maxVoices and info().queued ≤ AUDIO.maxVoices; the internal cue timestamp map has ≤ Object.keys(CUES).length entries.
- m18 A10: with ?audio=off (location stub or api flag) api.audio.enabled === false and update() returns without touching info().
- m18 A11: the settings card's master/UI/world sliders and captions checkbox each move their consumer (audio.setMaster / setBus spy, HUD caption visibility) — zero inert controls (extend m16 U2's walk; m16 V4c's key set grows by the audio keys under shell).
- m18 A12: audio never writes state — game.state JSON before and after 300 frames with the layer attached deep-equals the run without it (same seed, same scripted inputs), as m17 R6 does for the recorder.
- Regression: m0 E8 (state serializable), m11 F-section (HUD), m16 all, m15 all; every other suite unchanged. Suite total rises by m18's count only.

**Risks.**
- Autoplay policy: the context must be created inside a user gesture handler; the pointer-lock click in main.js is the natural one. A refused context must leave the game identical (A7).
- The render loop is where update() belongs (not the fixed step): cues from the bus arrive synchronously inside the step — queue them (bounded) and drain on the render frame.
- IMPACT payload has relVelocity and materials[] (surfaceTags), not speed/mass — read damage.js:111. GRIP_ENDED.reason values come from grip.js release(); check the actual strings.
- Settings card: M4 owns src/ui/settings.js and the shell payload; add controls as data rows so m16 U2's walk finds them, and extend m16 V4c's key list rather than breaking it.
- Headless Chrome has no audio device but DOES construct an AudioContext; A7 must stub it away explicitly.

### M10 — Hand-frame grip damping — the solo couch drag actually travels

*GDD:* §26.2 'A couch-equivalent can be dragged solo and handled materially better with another grip'; §2.1 'allow awkward solo dragging'; §6.3 heavy tier 'one drags or pivots'; §3.3 at least two approaches; §25.2 Phase 3 gate 'weight legible without hard denial'  
*Size:* ~8 h · *depends on:* M7

**Why.** M7 (Phase 16) measured the cause to the number: the grip damps against the object's ABSOLUTE velocity (grip.js c·vp, c = 2√(k·m) = 569 N·s/m for the couch), so a towed couch can follow a hand no faster than (k·band − F_friction)/c = 0.137 m/s unbraced / 0.248 m/s braced, and the traction budget could only tear the hold or topple the fridge. Damping in the HAND's frame (vp − vHand) removes the viscous brake against the world while keeping the spring stable; a friction-aware tow cap and a corrected towSpeedLimit derivation (lag = F_f/k + 2ζv/ω) then let the mover walk at a speed the couch can follow. This is the increment M7 and PHASE11_PLAN's 'Deliberately not now' both name, with the largest blast radius on measured numbers — which is why it gets its own milestone and full re-measurement.

**Scope.** src/player/grip.js: cache each grip's hand target position per step (already computed for the spring); damping term becomes cPerHand·(vp − vHand) where vHand is the hand target's velocity (finite difference over the step, clamped to GRIP.maxHandSpeed); towSpeedLimit(brace) re-derived from the corrected lag formula and made friction-aware (reads the held object's effective floor friction from registry/def, as m6's effectiveFriction does) — every constant in config.js GRIP (zeta, maxHandSpeed, towFrictionRef …), never a bare literal. src/player/controller.js only if the tow cap plumbing needs it. Keep CARRY.tractionN at 0 (M7's seam stays inert) unless the sweep with hand-frame damping shows a non-zero value that helps WITHOUT toppling the fridge — if so, set it and show the table. Re-measure every quoted number with the project's own harnesses (m6 haulDistance/haulTogether, m4 liftTogether, m2 D/E, m3 E) and update the assertions to the new measured values with the same ids; docsNotes must carry the before/after table.

**Files:** src/player/grip.js, src/player/controller.js, src/config.js, tools/m2-tests.js, tools/m3-tests.js, tools/m4-tests.js, tools/m6-tests.js · **new:** tools/_probe-drag.js

**Reuse.** This project's own grip spring is the reference implementation; the harnesses haulDistance/haulTogether (tools/m6-tests.js), liftTogether (tools/m4-tests.js) and the instance-override pattern (m3 D5) are all in place from M7. The traction sweep probe pattern (tools/_m7-probe.js, deleted) is described in C:/Dev/INDEX.md → 'A traction budget cannot fix a world-frame-damped tow'.

**Acceptance tests.**
- m6 B8: solo, one hand, unbraced, flat floor, bare couch, haulDistance 180 steps → moved ≥ 0.30 m (M7 measured 0.000 with world-frame damping), held ≥ 150/180, mover < 2.5 m — the §26.2 claim as a number.
- m6 B9: same braced → moved ≥ 0.60 m, held 180/180, braced.moved > unbraced.moved × 1.3.
- m6 B10c: two movers one hand each ≥ solo + 0.5 m and ≥ 1.5× solo (still 'materially better with another grip').
- m6 B10b / B6: a lone braced mover still cannot shift the fridge ≥ 0.35 m in 3 s and never topples it (tilt < 20°) — the 'beyond one hand unaided' binary survives.
- m6 B4: dolly couch still ≥ 1.0 m and ≥ bare + 0.5 m (the dolly remains the better answer).
- m6 B10a rewritten: the hand-frame ceiling is reported, not pinned under 0.30 m/s any more; assert instead that the towed couch's peak speed ≤ the mover's walk speed (no object outrunning its hand).
- m4 C2-C5 lift binary unchanged within tolerance (one hand clear < 0.02 m; two hands > 0.005 m) — re-measure and quote; m4 E two-mover drag ≥ 1.5× solo.
- m2 D4c, D6, E2 (no wall ghosting, braced and unbraced), E4/E5 (retreat) unchanged; m3 E3/E3a/E4 (peak > 0.3 m/s, mover < 3.0 m, couch < 6.0 m) and F4 stumble unchanged; m3 D5-D5c (traction subtraction) unchanged.
- Stability: 600 steps holding a 9 kg box at rest → hand-object distance variance < 1e-4 m² (no new oscillation from the hand-frame term); a hand moving at GRIP.maxHandSpeed toward a wall never pushes the box through it (m2 E2 pattern at speed).
- Suites m2, m3, m4, m6 ALL-PASS; every changed number quoted in docsNotes with before → after.

**Risks.**
- Every measured lift/dolly/drag number in README, KNOWN_ISSUES and the m2/m3/m4/m6 suites moves — re-measure, never hand-edit; the reviewer must reproduce the table.
- A hand velocity estimated by finite difference is noisy at the first step of a grab and after a teleport in fixtures (M1 recorded a 0.46 m camera lag after a 40 m teleport): clamp and warm up over GRIP.handVelWarmupSteps.
- Removing the world-frame brake can let a light box overshoot its hand — the stability assertion above exists for that; tune zeta before touching the spring.
- Co-op sideways yank (PLAYTEST_NOTES Phase 12) may change feel; measure two-mover haul both braced and unbraced and record it.

