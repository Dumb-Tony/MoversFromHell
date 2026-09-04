/* Phase 3 suite — heavy object.
 *
 * §25.2 gate under test: "Mass, leverage, drag, brace, stumble" →
 * **weight legible without hard denial**.
 *
 * Both halves of that phrase are testable, and they pull in opposite directions:
 *
 *   LEGIBLE — a 90 kg couch must behave measurably differently from a 9 kg box, through
 *     the controls rather than through a readout: slower, heavier to hold, unbalancing.
 *   WITHOUT HARD DENIAL — and yet nothing may be refused. §2.1 is explicit: "allow awkward
 *     solo dragging of objects intended for two players". Section E is entirely about
 *     proving the game never says no, only says "this will cost you".
 *
 * Lessons from the Phase 2 suite, applied from the start: set scenes up so nothing has to
 * be dragged into position, and assert closed-form properties rather than delicate steady
 * states. Where a property is genuinely about feel, it goes in PLAYTEST_NOTES, not here.
 */

import { GRIP, CARRY, PLAYER, SIM, MASS_CLASS } from '../src/config.js';
import { OBJECT_DEFS, PHASE3_SPAWNS, validateAllDefs, handlingHint } from '../src/objects/definitions.js';
import { LOCOMOTION } from '../src/player/controller.js';

const lines = [];
let passes = 0, fails = 0;
function ok(name, cond, detail = '') {
  if (cond) { passes++; lines.push(`PASS  ${name}`); }
  else { fails++; lines.push(`FAIL  ${name}${detail ? '  <- ' + detail : ''}`); }
}
const eq   = (n, a, b) => ok(n, a === b, `got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

let _pre = null;
function emit(status) {
  if (!_pre) {
    _pre = document.createElement('pre');
    _pre.id = 'test-out';
    _pre.style.cssText = 'position:fixed;inset:0;z-index:99999;overflow:auto;background:#06080c;' +
      'color:#cfe;font:11px ui-monospace,Consolas,monospace;padding:12px;white-space:pre';
    document.body.appendChild(_pre);
  }
  const tail = status || (fails === 0 ? `ALL-PASS  ${passes} assertions` : `FAILURES  ${fails} of ${passes + fails}`);
  _pre.textContent = '==MFHTEST-BEGIN==\n' + lines.join('\n') + '\n\n' + tail + '\n==MFHTEST-END==';
}

emit('booting...');
let M;
try { M = await window.__MFH_READY; }
catch (e) {
  fails++; lines.push(`FAIL  boot threw  <- ${e && e.message}`);
  lines.push((e && e.stack || '').split('\n').slice(0, 6).join('\n'));
  emit(); throw e;
}

const { game, player, physics, rig, registry, grips, camera } = M;
const STEP = SIM.stepMs;
const G = 9.81;

/* ── helpers ─────────────────────────────────────────────────────────────── */

function step(n = 1, opts = {}) {
  for (let i = 0; i < n; i++) {
    // Phase 11 M10: clearForces FIRST, as main.js does. Rapier forces persist and compound
    // until reset, and this harness never reset them — see tools/m2-tests.js step() for the
    // measurement (a dropped box gaining 1.0 m/s per step from a stale accumulator).
    physics.clearForces();
    const yaw = opts.yaw !== undefined ? opts.yaw : rig.yaw;
    rig.yaw = yaw;
    if (opts.pitch !== undefined) rig.pitch = opts.pitch;
    grips.step(STEP, { brace: !!opts.brace, simTimeMs: i * STEP });
    // grips.step() SETS carriedMass every step (to 0 when nothing is held), so a test that
    // assigns the field beforehand has it wiped before player.step() ever reads it. Drive
    // a simulated load through the same entry point the grip system uses.
    if (opts.carry) player.applyCarry(opts.carry, opts.carryPullX || 0, opts.carryPullZ || 0, STEP);
    player.step(STEP, {
      move: opts.move || { x: 0, y: 0 },
      forward: { x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw) },
      right: { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) },
      run: !!opts.run, brace: !!opts.brace, jump: false, recover: false,
    });
    physics.step();
    registry.step(STEP);
    rig.update(player.position, STEP / 1000);
  }
}

function placePlayer(x, z, y = 0.2, settle = 50) {
  grips.releaseAll('test reset');
  player.hardSetPosition({ x, y, z });
  player._vel.x = 0; player._vel.z = 0; player.velocityY = 0; player._climb = null;
  player.carriedMass = 0; player.pull.x = 0; player.pull.z = 0;
  player.imbalance = 0; player.exertion = 0; player._downMs = 0;
  step(settle);
  return player.position;
}

function posOf(e) { const t = e.body.translation(); return { x: t.x, y: t.y, z: t.z }; }

function parkAt(entity, x, y, z) {
  entity.body.setTranslation({ x, y, z }, true);
  entity.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  entity.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  entity.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  physics.primeQueries();
}

function aimAtAndGrab(hand, target) {
  const p = player.position;
  rig.yaw = Math.atan2(-(target.x - p.x), -(target.z - p.z));
  rig.pitch = Math.atan2(target.y - (p.y + 1.4), Math.hypot(target.x - p.x, target.z - p.z));
  for (let i = 0; i < 20; i++) rig.update(player.position, 1 / 60);
  const c = camera.position;
  rig.yaw = Math.atan2(-(target.x - c.x), -(target.z - c.z));
  rig.pitch = Math.atan2(target.y - c.y, Math.hypot(target.x - c.x, target.z - c.z));
  return grips.tryGrab(hand, 'p0', game.clock.simTimeMs);
}

/** Find a spawned entity by definition id. */
function findByDef(defId) {
  for (const e of registry.entities.values()) if (e.defId === defId) return e;
  return null;
}

const spawned = [];
function spawnAt(defId, x, y, z) {
  const e = registry.spawn(defId, { x, y, z, yaw: 0 });
  spawned.push(e.id);
  physics.primeQueries();
  step(25);
  return e;
}

try {
/* ── A. the heavy definitions (§7.1, §6.3) ───────────────────────────────── */
lines.push('--- A. heavy object definitions (GDD §7.1, §6.3) ---');
{
  const bad = validateAllDefs();
  ok('A1 every definition still validates', Object.keys(bad).length === 0, JSON.stringify(bad));

  const couch = OBJECT_DEFS.couch_3seat_01;
  ok('A2 the couch exists and is the §7.1 worked example', !!couch && couch.id === 'couch_3seat_01');
  eq('A3 …at the §7.1 dimensions', `${couch.dimensions.x}x${couch.dimensions.y}x${couch.dimensions.z}`, '2.1x0.85x0.9');
  eq('A4 …in §6.3\'s heavy tier', couch.massClass, 'heavy');
  ok('A5 …with a mass inside that tier\'s band', couch.mass >= MASS_CLASS.heavy.massRange[0] &&
     couch.mass <= MASS_CLASS.heavy.massRange[1], `${couch.mass} kg`);
  ok('A6 the handling hint is advisory text, not a rule',
     handlingHint(couch).includes('drags') || handlingHint(couch).includes('two'),
     handlingHint(couch));

  ok('A7 both phase-3 objects spawned', PHASE3_SPAWNS.every((s) => !!findByDef(s.def)),
     PHASE3_SPAWNS.map((s) => s.def).join(', '));

  // §29.1's build order has arrived at furniture, so heavy definitions are now expected —
  // the Phase 2 assertion that forbade them is deliberately superseded here.
  ok('A8 the manifest now spans light through heavy',
     new Set(Object.values(OBJECT_DEFS).map((d) => d.massClass)).size >= 3,
     [...new Set(Object.values(OBJECT_DEFS).map((d) => d.massClass))].join(', '));
}
emit('running...');

/* ── B. the force budget, in closed form (§6.2, §6.3) ────────────────────── */
lines.push('--- B. force budget (GDD §6.2, §6.3) ---');
{
  // These are the numbers the whole phase rests on, so they are asserted arithmetically
  // rather than by observation: what the design CLAIMS must be what the config computes.
  const capFor = (mass, hands, brace) => {
    let strength = GRIP.forceCap;
    if (brace) strength *= GRIP.braceForceMult;
    if (hands > 1) strength *= GRIP.twoHandForceMult;
    return Math.min(strength, mass * GRIP.maxAccel);
  };
  const couch = OBJECT_DEFS.couch_3seat_01;
  const box = OBJECT_DEFS.box_small_01;

  const couchLift = couch.mass * G;
  ok('B1 one hand CANNOT lift the couch', capFor(couch.mass, 1, false) < couchLift,
     `cap ${capFor(couch.mass, 1, false).toFixed(0)} N vs weight ${couchLift.toFixed(0)} N`);
  ok('B2 two hands CAN — §6.3\'s "two ... preferred", solo and awkward', capFor(couch.mass, 2, false) > couchLift,
     `cap ${capFor(couch.mass, 2, false).toFixed(0)} N`);
  ok('B3 braced is comfortable (§5.1 "higher grip and impulse resistance")',
     capFor(couch.mass, 2, true) > couchLift * 2, `cap ${capFor(couch.mass, 2, true).toFixed(0)} N`);

  // §6.3: "one drags or pivots". Dragging must beat friction with ONE hand, or the couch is
  // simply immovable to a lone mover — which would be the hard denial the gate forbids.
  const friction = couch.physics.friction * couch.mass * G;
  ok('B4 one hand CAN overcome the couch\'s floor friction, so it can be dragged',
     capFor(couch.mass, 1, false) > friction,
     `cap ${capFor(couch.mass, 1, false).toFixed(0)} N vs friction ${friction.toFixed(0)} N`);

  ok('B5 a box remains trivially liftable one-handed', capFor(box.mass, 1, false) > box.mass * G);
  ok('B6 the dresser sits between them', (() => {
    const d = OBJECT_DEFS.dresser_01;
    return capFor(d.mass, 1, false) > d.mass * G && d.mass > box.mass && d.mass < couch.mass;
  })());
}
emit('running...');

/* ── C. weight is LEGIBLE through the controls (§6.2, gate) ──────────────── */
lines.push('--- C. weight is legible (GDD §25.2 gate, §6.2) ---');
{
  // Speed penalty is a pure function of carried mass; assert the curve, not a drive test.
  player.carriedMass = 0;
  const free = player.loadSpeedMult;
  player.carriedMass = OBJECT_DEFS.box_small_01.mass;
  const withBox = player.loadSpeedMult;
  player.carriedMass = OBJECT_DEFS.dresser_01.mass;
  const withDresser = player.loadSpeedMult;
  player.carriedMass = OBJECT_DEFS.couch_3seat_01.mass;
  const withCouch = player.loadSpeedMult;
  player.carriedMass = 0;

  eq('C1 carrying nothing costs nothing', free, 1);
  ok('C2 a box costs a little', withBox < free && withBox > 0.7, withBox.toFixed(3));
  ok('C3 a dresser costs more', withDresser < withBox, `${withBox.toFixed(3)} -> ${withDresser.toFixed(3)}`);
  ok('C4 a couch costs most', withCouch < withDresser, `${withDresser.toFixed(3)} -> ${withCouch.toFixed(3)}`);
  ok('C5 …and the difference is big enough to feel', withCouch < withBox * 0.55,
     `box x${withBox.toFixed(2)} vs couch x${withCouch.toFixed(2)}`);

  // THE GATE'S SECOND HALF, at its sharpest: even the heaviest object leaves the mover able
  // to move. A speed multiplier of zero would be a hard denial wearing a costume.
  ok('C6 even the couch never reduces speed to zero (§2.1)', withCouch >= CARRY.minSpeedMult && withCouch > 0,
     `x${withCouch.toFixed(3)}, floor x${CARRY.minSpeedMult}`);
  player.carriedMass = 1e6;
  ok('C7 …and an absurd load still cannot', player.loadSpeedMult >= CARRY.minSpeedMult);
  player.carriedMass = 0;
}
emit('running...');

/* ── D. the object pulls back (§6.2) ─────────────────────────────────────── */
lines.push('--- D. the object pulls back (GDD §6.2) ---');
{
  placePlayer(60, 60);
  player.applyCarry(90, 400, 0, STEP);
  ok('D1 a reaction force starts moving the body', Math.abs(player.pull.x) > 0,
     `pull ${player.pull.x.toFixed(4)} m/s`);
  const after1 = player.pull.x;
  player.applyCarry(90, 400, 0, STEP);
  ok('D2 …and accumulates while it persists', player.pull.x > after1);

  // Bounded: §6.4's spirit applied to the reaction, so a heavy object cannot fling a mover.
  for (let i = 0; i < 600; i++) player.applyCarry(500, 100000, 0, STEP);
  ok('D3 the pull is bounded however hard the object pulls',
     Math.hypot(player.pull.x, player.pull.z) <= CARRY.maxPullSpeed + 1e-6,
     `${Math.hypot(player.pull.x, player.pull.z).toFixed(3)} m/s, cap ${CARRY.maxPullSpeed}`);

  // …and decays once the object stops pulling, so it is a tug and not a permanent shove.
  for (let i = 0; i < 240; i++) player.applyCarry(0, 0, 0, STEP);
  ok('D4 …and decays away when the force stops', Math.hypot(player.pull.x, player.pull.z) < 0.05,
     `${Math.hypot(player.pull.x, player.pull.z).toFixed(4)} m/s`);
  player.pull.x = 0; player.pull.z = 0;

  /* THE TRACTION SEAM (Phase 11, M7): a grounded mover's legs anchor CARRY.tractionN of
   * horizontal reaction before any of it becomes pull. The MECHANISM is pinned here with an
   * instance override, so the assertions do not move with the shipped budget: M7 shipped it
   * at 0 N (the sweep in config.js found no value that made a solo couch travel while the
   * damping was world-frame), M10 set it to 350 N / 380 N braced with hand-frame damping.
   * D1-D4 above still hold because 400 N > CARRY.tractionN (D5c keeps it so), and these say
   * what the subtraction does. */
  const dt = STEP / 1000;
  const savedTraction = player.tractionN;
  player.tractionN = () => 300;
  player.applyCarry(90, 250, 0, STEP);
  ok('D5 a reaction inside the traction budget moves the body not at all',
     player.pull.x === 0 && player.pull.z === 0 && player.resistedForce === 250,
     `pull ${player.pull.x.toFixed(4)} m/s, resisted ${player.resistedForce} N`);
  player.applyCarry(90, 400, 0, STEP);
  const excessOnly = (100 / PLAYER.mass) * dt * Math.max(0, 1 - CARRY.pullDamping * dt);
  ok('D5a …and above it only the EXCESS integrates, along the reaction (400 - 300 = 100 N)',
     Math.abs(player.pull.x - excessOnly) < 1e-9 && player.resistedForce === 400,
     `pull ${player.pull.x.toFixed(6)} vs ${excessOnly.toFixed(6)} m/s; resisted ${player.resistedForce} N still bills the full 400`);
  player.tractionN = savedTraction;
  player.pull.x = 0; player.pull.z = 0;
  ok('D5b the budget is zero with the feet off the floor (airborne, knocked down)', (() => {
    const g = player.grounded, d = player._downMs;
    player.grounded = false; const air = player.tractionN(true);
    player.grounded = true; player._downMs = 500; const down = player.tractionN(true);
    player.grounded = g; player._downMs = d;
    return air === 0 && down === 0;
  })());
  ok('D5c the shipped budget keeps D1/D2\'s 400 N fixture live and never exceeds the braced one',
     CARRY.tractionN >= 0 && CARRY.tractionN < 400 && CARRY.braceTractionN >= CARRY.tractionN,
     `tractionN ${CARRY.tractionN}, braceTractionN ${CARRY.braceTractionN}`);
  // The steady haul-back at the couch's 552 N, REPORTED: M7's closed form compared it with a
  // fixed 1.22 m/s tow cap (2.21 vs 1.22 at 0 N: the stall). Since M10 the tow cap ADDS this
  // haul-back to the walk it allows (grip.js towLimits), so the comparison is moot by
  // construction and the number is what the couch is felt to pull at.
  const pullSteady = (b) => (552 - b) / (PLAYER.mass * CARRY.pullDamping);
  lines.push(`      steady haul-back at 552 N: unbraced (552 - ${CARRY.tractionN}) / ${(PLAYER.mass * CARRY.pullDamping).toFixed(1)} = ` +
             `${pullSteady(CARRY.tractionN).toFixed(2)} m/s, braced ${pullSteady(CARRY.braceTractionN).toFixed(2)} m/s (was 2.21 at M7's 0 N)`);
}
emit('running...');

/* ── E. NO HARD DENIAL — the half the gate is named for (§2.1) ───────────── */
lines.push('--- E. no hard denial (GDD §2.1, §6.3, gate) ---');
{
  const couch = findByDef('couch_3seat_01');
  ok('E1 the couch is in the world as a dynamic body', !!couch && couch.body.isDynamic());

  if (couch) {
    /* First, isolate the body from the grip: push the couch with a known horizontal force
     * and nothing else. If it will not move under a force comfortably above its own
     * friction, the problem is the rigid body, not the grip — and there is no point
     * diagnosing the grip until that is settled. */
    parkAt(couch, 66, 0.44, 66);
    const pushFrom = posOf(couch);
    const frictionN = couch.def.physics.friction * couch.def.mass * G;
    for (let i = 0; i < 90; i++) {
      physics.clearForces();
      couch.body.addForce({ x: 0, y: 0, z: 600 }, true);
      physics.step();
    }
    const pushed = Math.hypot(posOf(couch).x - pushFrom.x, posOf(couch).z - pushFrom.z);
    ok('E2a a plain 600 N push moves the couch (body sanity, no grip involved)',
       pushed > 0.2, `moved ${pushed.toFixed(3)} m; friction needs ${frictionN.toFixed(0)} N`);
    parkAt(couch, 66, 0.44, 66);

    // §6.3: "one drags or pivots". One hand, no brace, on a 90 kg couch — the hardest
    // legitimate case for the gate. It must MOVE.
    parkAt(couch, 70, 0.44, 70);
    placePlayer(70, 71.6);
    const before = posOf(couch);
    const g = aimAtAndGrab('right', { x: before.x, y: before.y + 0.2, z: before.z });
    ok('E2 a lone mover can get hold of the couch at all', !!g);

    if (g) {
      /* Drag it by walking BACKWARDS while still facing it — which is how a person drags
       * a couch, and also the only thing that works here. Turning around instead snaps the
       * view-relative hand target through 180 degrees in a single step, the stretch
       * instantly exceeds GRIP.maxStretch, and the grip correctly lets go: measured, the
       * grip died at step 0 while the mover strolled 12.2 m away from a stationary couch.
       * Whether a fast turn SHOULD drop what you are holding is a feel question, and it is
       * recorded in KNOWN_ISSUES rather than decided here. */
      const facing = rig.yaw;
      let dragged = 0, lostAt = -1, peakCouchSpeed = 0, playerMoved = 0, peakF = 0, peakS = 0;
      const pStart = { ...player.position };
      for (let i = 0; i < 240; i++) {
        step(1, { move: { x: 0, y: -1 }, yaw: facing });   // backwards, still facing the couch
        dragged = Math.hypot(posOf(couch).x - before.x, posOf(couch).z - before.z);
        const cv = couch.body.linvel();
        peakCouchSpeed = Math.max(peakCouchSpeed, Math.hypot(cv.x, cv.z));
        playerMoved = Math.hypot(player.position.x - pStart.x, player.position.z - pStart.z);
        const h = grips.grips.right;
        if (h) { peakF = Math.max(peakF, h.lastApplied); peakS = Math.max(peakS, h.lastStretch); }
        if (lostAt < 0 && !grips.grips.right) lostAt = i;
        if (dragged > 0.8) break;
      }
      /* WHAT IS ASSERTED, AND WHAT IS NOT.
       *
       * The gate forbids HARD DENIAL, and the thing that would constitute one is a couch
       * that a lone mover simply cannot budge. So what is asserted is that they can put
       * 90 kg into motion at all, one-handed and unbraced.
       *
       * What is NOT asserted is that sustained one-handed dragging carries it across a
       * room. MEASURED: the couch reaches 0.91 m/s but nets only 8 mm — it lurches and the
       * spring pulls it back, so the mover shuffles it rather than dragging it. §6.3's
       * "one drags or pivots" is therefore only half true today. That is a real shortfall,
       * it is written up in docs/KNOWN_ISSUES.md with these numbers, and it is deliberately
       * not papered over with a threshold low enough to pass. */
      // M10: reported unconditionally — these are the numbers the before/after table quotes.
      lines.push(`      solo drag (240 steps, exits at 0.8 m): couch net ${dragged.toFixed(3)} m, peak ${peakCouchSpeed.toFixed(2)} m/s, ` +
                 `mover ${playerMoved.toFixed(2)} m, grip lost at step ${lostAt}, peak F ${peakF.toFixed(0)} N, peak stretch ${peakS.toFixed(3)}`);
      ok('E3 a lone mover can put 90 kg into motion at all — no hard denial (§2.1)',
         peakCouchSpeed > 0.3,
         `couch peak ${peakCouchSpeed.toFixed(2)} m/s, net ${dragged.toFixed(3)} m; ` +
         `mover moved ${playerMoved.toFixed(2)} m; grip lost at step ${lostAt}; ` +
         `peak force ${peakF.toFixed(0)} N (friction needs ${(couch.def.physics.friction * couch.def.mass * 9.81).toFixed(0)} N), ` +
         `peak stretch ${peakS.toFixed(3)}`);
      ok('E3a …and the attempt is not silently free — it costs the mover speed (§6.2)',
         playerMoved < 3.0, `mover covered ${playerMoved.toFixed(2)} m in 4 s while pulling`);
      ok('E4 …which is slow, not instant — weight is legible in the cost', dragged < 6.0,
         `moved ${dragged.toFixed(3)} m`);
      grips.releaseAll('test');
    }

    /* Nothing anywhere refuses a grab because of mass class. §6.3: guidance, not gates.
     *
     * The step(12) is not padding. Both bodies have just been teleported, and a raycast reads
     * a query pipeline that only world.step() refreshes — the same hazard that cost an
     * afternoon in Phase 1 and is written up in Dev\INDEX.md. It went unnoticed here until
     * Phase 6 fixed the friction combine rule: the drag loop above exits early now that the
     * couch really moves, so the two teleports landed on a different frame and the ray
     * started missing. The test was always fragile; it just never had reason to show it. */
    parkAt(couch, 74, 0.44, 74);
    placePlayer(74, 75.6);
    step(12);
    const g2 = aimAtAndGrab('right', { x: 74, y: 0.6, z: 74 });
    ok('E5 a heavy object is never refused on the grounds of being heavy', !!g2);
    grips.releaseAll('test');

    // And the mover is never immobilised by what they hold.
    player.carriedMass = couch.def.mass;
    ok('E6 holding the heaviest object still leaves the mover mobile',
       player.loadSpeedMult * PLAYER.walkSpeed > 0.5,
       `${(player.loadSpeedMult * PLAYER.walkSpeed).toFixed(2)} m/s`);
    player.carriedMass = 0;
  }
}
emit('running...');

/* ── F. stumble and knockdown (§5.1) ─────────────────────────────────────── */
lines.push('--- F. stumble and knockdown (GDD §5.1) ---');
{
  placePlayer(80, 80);
  eq('F1 a mover carrying nothing is grounded', player.state, LOCOMOTION.GROUNDED);
  ok('F2 …and balanced', player.imbalance === 0);

  // A comfortable load must never destabilise: imbalance only builds above the threshold.
  step(120, { carry: CARRY.comfortableMass - 5 });
  ok('F3 a comfortable load never unbalances the mover', player.imbalance === 0,
     `imbalance ${player.imbalance.toFixed(3)}`);

  // An overload builds imbalance and crosses into stumbling.
  let becameStumbling = false;
  for (let i = 0; i < 240 && !player.knockedDown; i++) {
    step(1, { carry: OBJECT_DEFS.couch_3seat_01.mass });
    if (player.stumbling) { becameStumbling = true; break; }
  }
  ok('F4 carrying a couch eventually makes the mover stumble (§5.1)', becameStumbling,
     `imbalance ${player.imbalance.toFixed(3)}, threshold ${CARRY.stumbleAt}`);
  eq('F5 …and the state machine reports it', player.state, LOCOMOTION.STUMBLING);
  ok('F6 stumbling is REDUCED control, not lost control',
     CARRY.stumbleSpeedMult > 0 && CARRY.stumbleAccelMult > 0);

  // Put it down and balance returns quickly — §5.1 "recovery is fast".
  player.carriedMass = 0;
  let recoveredIn = -1;
  for (let i = 0; i < 240; i++) { step(1); if (!player.stumbling) { recoveredIn = i; break; } }
  ok('F7 putting it down restores balance quickly', recoveredIn >= 0 && recoveredIn < 120,
     `${recoveredIn} steps`);

  // Push past the knockdown threshold: the mover goes down and DROPS what they held.
  placePlayer(84, 84);
  const box = spawnAt('box_small_01', 84, 0.30, 82.9);
  const g = aimAtAndGrab('right', posOf(box));
  ok('F8 grabbed something to be dropped', !!g);
  const downsBefore = player.knockdowns;
  player.imbalance = CARRY.knockdownAt + 0.05;
  step(2);
  ok('F9 crossing the knockdown threshold puts the mover down (§5.1)',
     player.knockdowns > downsBefore, `imbalance ${player.imbalance.toFixed(2)}`);
  eq('F10 …in the ragdoll state', player.state, LOCOMOTION.RAGDOLL);
  ok('F11 …dropping what they were carrying, which IS the consequence',
     !grips.grips.right && !grips.grips.left);

  // §5.1: "auto or player recovery in 1-3 seconds".
  let upAfter = -1;
  for (let i = 0; i < 400; i++) { step(1); if (!player.knockedDown) { upAfter = i; break; } }
  const secs = upAfter * STEP / 1000;
  ok('F12 the mover gets up on their own', upAfter >= 0, `still down after ${400 * STEP / 1000}s`);
  ok('F13 …within §5.1\'s 1-3 seconds', secs >= PLAYER.ragdollMinSeconds - 0.2 && secs <= PLAYER.ragdollMaxSeconds + 0.3,
     `${secs.toFixed(2)} s`);
  eq('F14 …and is controllable again', player.state, LOCOMOTION.GROUNDED);

  // §2.1 once more: being knocked down is a setback, never a run-ending state.
  step(60, { move: { x: 0, y: 1 } });
  ok('F15 …and can move immediately afterwards', player.horizontalSpeed > 0.5,
     `${player.horizontalSpeed.toFixed(2)} m/s`);
}
emit('running...');

/* ── G. brace and exertion (§5.1, §5.2) ──────────────────────────────────── */
lines.push('--- G. brace and exertion (GDD §5.1, §5.2) ---');
{
  placePlayer(90, 90);

  // §5.1: bracing is the answer to being unbalanced, so it must halve what builds up.
  const heavy = OBJECT_DEFS.couch_3seat_01.mass;
  player.imbalance = 0;
  step(60, { carry: heavy });
  const unbraced = player.imbalance;
  player.imbalance = 0;
  step(60, { carry: heavy, brace: true });
  const braced = player.imbalance;
  ok('G1 bracing slows the loss of balance (§5.1)', braced < unbraced * 0.75,
     `unbraced ${unbraced.toFixed(3)} vs braced ${braced.toFixed(3)}`);
  player.imbalance = 0;

  // §5.2: exertion reduces available force, and recovers fast. It must NEVER reach zero —
  // that would be a stamina bar forbidding an action, which §5.2 explicitly rejects.
  eq('G2 a rested mover has full strength', player.strengthFraction, 1);
  for (let i = 0; i < 400; i++) player.noteExertion(STEP);
  ok('G3 sustained work reduces available force (§5.2)', player.strengthFraction < 1,
     `x${player.strengthFraction.toFixed(3)}`);
  ok('G4 …but never to zero: exertion is not a stamina bar',
     player.strengthFraction >= 1 - CARRY.exertForcePenalty - 1e-9 && player.strengthFraction > 0.4,
     `x${player.strengthFraction.toFixed(3)}, floor x${(1 - CARRY.exertForcePenalty).toFixed(2)}`);

  let recovered = -1;
  for (let i = 0; i < 400; i++) { step(1); if (player.exertion <= 0) { recovered = i; break; } }
  ok('G5 …and recovery is rapid (§5.2 "recovery is rapid")', recovered >= 0 && recovered * STEP / 1000 < 4,
     `${(recovered * STEP / 1000).toFixed(2)} s`);
  ok('G6 exertion never blocks an action, it only makes holding harder',
     CARRY.exertForcePenalty < 1);
}
emit('running...');

/* ── H. integration (§22.4, §26.6) ───────────────────────────────────────── */
lines.push('--- H. integration (GDD §22.4, §26.6) ---');
{
  grips.releaseAll('test');
  placePlayer(0, 5);
  const bodiesBefore = physics.stats.bodies;
  ok('H1 the body count is real before the leak check', bodiesBefore > 0, `${bodiesBefore}`);
  for (let i = 0; i < 120; i++) game.frame(16.7);
  eq('H2 no bodies leak over 120 real frames', physics.stats.bodies, bodiesBefore);
  ok('H3 game state stays JSON-serializable with heavy objects live',
     (() => { try { JSON.parse(JSON.stringify(game.state)); return true; } catch (e) { return false; } })());
  ok('H4 the locomotion state is always a declared one',
     Object.values(LOCOMOTION).includes(game.state.players.p0.locomotion),
     `${game.state.players.p0.locomotion}`);
  ok('H5 no error banner appeared during the suite', !document.getElementById('err-banner'));

  // §26.6 again: settled heavy cargo must not jitter forever, or Phase 7's truck is doomed.
  const couch = findByDef('couch_3seat_01');
  if (couch) {
    parkAt(couch, 95, 0.44, 95);   // the ground spans +/-100; 100 is the edge, and a couch
                                   // parked exactly there falls off (measured 24 m/s down)
    step(240);
    const v = couch.body.linvel();
    const cp = posOf(couch);
    ok('H6 a settled couch comes to rest and stays there',
       Math.hypot(v.x, v.y, v.z) < 0.12,
       `${Math.hypot(v.x, v.y, v.z).toFixed(4)} m/s ` +
       `v=(${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)}) ` +
       `at (${cp.x.toFixed(2)},${cp.y.toFixed(2)},${cp.z.toFixed(2)})`);
    ok('H7 …and reports settled (§12.3)', couch.state.settled, `settled=${couch.state.settled}`);
  }
}
} catch (e) {
  fails++;
  lines.push(`FAIL  suite threw  <- ${e && e.message}`);
  lines.push((e && e.stack || '').split('\n').slice(0, 6).join('\n'));
}

try { grips.releaseAll('teardown'); for (const id of spawned) registry.remove(id); } catch (e) { void e; }
emit();
