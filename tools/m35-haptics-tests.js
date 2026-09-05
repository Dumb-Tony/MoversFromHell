/* Phase 11 build-side M28 suite — the optional haptic pulse (src/audio/haptics.js).
 *
 * GDD §8.4 "At impact: material sound, visual mark, optional haptic pulse, and one small cost
 * notice" — three of those four shipped in M9, M14 and Phase 8, and this is the fourth;
 * §11.3 road events felt in the seat (M16 shakes the camera, this shakes the hand); §10.3 the
 * overstressed strap's "creak, vibration"; §21.4 Motion (a switch, off under reduced motion);
 * §4.4 controller parity (a nuance for the pad, nothing withheld from the keyboard); §22.4 an
 * observer never writes state.
 *
 * THE CLAIMS UNDER TEST, in the order the file makes them:
 *   H1  ONE TABLE. Every cue type the audio layer emits has a haptic row, magnitudes are in
 *       [0,1], durations inside [minMs, maxMs], and the table is frozen.
 *   H2  ROUTING. The pulse lands on the seat the event BELONGS to and on no other — the
 *       holder's, the property line's heldBy, the driving seat M16 already picked (asserted
 *       EQUAL to that choice, not merely equal to 0), and everybody for a broadcast.
 *   H3  GAP AND CANCEL. Two thuds inside minGapMs are one pulse; a stronger cue inside a
 *       weaker one's window replaces it; a weaker one inside a stronger's stands down.
 *   H4  SWITCHES. rumble off is zero calls; reduced motion with no saved choice is off; an
 *       explicit yes under reduced motion is on; the row is on the card; the save keeps its
 *       seven sections.
 *   H5  ROBUSTNESS. A pad with no vibrationActuator is silence, not a throw; a playEffect
 *       that REJECTS ('preempted' is normal) leaves no unhandled rejection and the layer
 *       keeps working for the next cue.
 *   H6  THE STRAP. §10.3's overstressed state is a REPEAT at strap.periodMs on the carrier's
 *       seat, and it stops inside one period of the state clearing.
 *   H7  IT IS NOT A SYSTEM. A burst of cues changes nothing in game.state, adds no body and
 *       adds no scene child (§22.4, m0 E8).
 *
 * THE PAD IS A STUB, installed on navigator.getGamepads and read back THROUGH input.poll() —
 * m26's Standard Gamepad stub with a vibrationActuator added. Chrome only exposes real pads
 * after a gesture, and the layer must read the pad through input every time anyway (the API
 * hands back fresh objects), so the stub is the honest fixture rather than a shortcut.
 *
 * localStorage 'mfh.save' is cleared at the START and the END (m16's rule): H4 saves a choice.
 */

import { HAPTICS, AUDIO, TRUCK, MOVERS } from '../src/config.js';
import { EVENTS, PHASES } from '../src/core/eventBus.js';
import { HAPTIC_TYPES, hapticFor, rowStrength, createHaptics, Haptics } from '../src/audio/haptics.js';
import { CUES } from '../src/audio/audio.js';
import { STRAP_STATE } from '../src/cargo/straps.js';
import { load, sanitiseShell, SHELL_DEFAULTS, SAVE_KEY, SAVE_SCHEMA } from '../src/core/save.js';
import { cabPoint } from '../src/world/truck.js';

const lines = [];
let passes = 0, fails = 0;
function ok(name, cond, detail = '') {
  if (cond) { passes++; lines.push(`PASS  ${name}`); }
  else { fails++; lines.push(`FAIL  ${name}${detail ? '  <- ' + detail : ''}`); }
}
const eq = (n, a, b) => ok(n, a === b, `got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const near = (n, a, b, tol) => ok(n, Math.abs(a - b) <= tol, `got ${a}, want ${b} ±${tol}`);

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
window.addEventListener('error', (e) => { fails++; lines.push(`FAIL  uncaught  <- ${e.message}`); emit(); });
/** H5's instrument, and the suite's own safety net: a promise nobody caught fails the run. */
let unhandled = 0;
window.addEventListener('unhandledrejection', (e) => {
  unhandled++;
  const r = e.reason; fails++; lines.push(`FAIL  unhandled rejection  <- ${r && r.message || r}`);
  emit();
});
let M;
try { M = await window.__MFH_READY; }
catch (e) {
  fails++; lines.push(`FAIL  boot threw  <- ${e && e.message}`);
  lines.push((e && e.stack || '').split('\n').slice(0, 6).join('\n'));
  emit(); throw e;
}

const { game, movers, physics, registry, input } = M;
const bus = game.bus;
const FRAME = 16.667;
const now = () => game.clock.simTimeMs;
const frame = (n = 1) => { for (let i = 0; i < n; i++) game.frame(FRAME); };
const panel = () => document.getElementById('settings-screen');
const control = (key) => panel().querySelector(`[data-setting="${key}"]`);
const byDef = (id) => { for (const e of registry.entities.values()) if (e.defId === id) return e; return null; };

/* ── the fake pads ────────────────────────────────────────────────────────────────
 * m26's stubPad shape (tools/m26-rebind-tests.js:118) with the OUTPUT side added. `calls`
 * records every playEffect and reset in order, which is what H3's "assert the call sequence"
 * needs. */
const recorders = new Map();       // pad object -> its call log
function fakePad(index, { reject = false, noActuator = false } = {}) {
  const calls = [];
  const pad = {
    connected: true, index, id: `m35 stub ${index} (Standard Gamepad)`, mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
  };
  if (!noActuator) {
    pad.vibrationActuator = {
      type: 'dual-rumble',
      playEffect(type, params) {
        calls.push({ call: 'playEffect', type, ...params });
        return reject ? Promise.reject(new Error('preempted (m35 stub)')) : Promise.resolve('complete');
      },
      reset() { calls.push({ call: 'reset' }); return Promise.resolve('complete'); },
    };
  }
  recorders.set(pad, calls);
  return { pad, calls };
}
/** Install n stubbed pads and make input read them. Slot→seat is input's own rule
 *  (seatForPadSlot): solo hands slot 0 to seat 0; co-op hands slot 0 to the JOINER (seat 1). */
function installPads(opts = [{}]) {
  const made = opts.map((o, i) => fakePad(i, o));
  navigator.getGamepads = () => made.map((m) => m.pad);
  input.poll(FRAME);
  return made;
}
function unplugPads() {
  delete navigator.getGamepads;
  input.poll(FRAME);
  input.clear();
  recorders.clear();
}
/** The call log of whatever pad input polled for this seat, or null. */
function logOf(seat) {
  const p = input.padForSeat(seat);
  return p ? (recorders.get(p) || null) : null;
}
const countOf = (seat) => { const l = logOf(seat); return l ? l.length : -1; };
function clearLogs() { for (const l of recorders.values()) l.length = 0; }
/** A clean slate for the NEXT case: no pulse in the air, no gap stamp owed. This is the
 *  layer's own SIM_RESET path, so it is the game's answer to "a new contract", not a poke at
 *  private state — without it each case inherits the previous one's 120 ms gap and its
 *  in-flight pulse, and would pass or fail for the case before's reasons. */
function freshCase() { M.haptics.reset(); clearLogs(); }
/** The layer's own counters, for a case that needs to say WHY nothing fired. */
const statsOf = () => ({ ...M.haptics.stats });
function statsDelta(a) {
  const b = statsOf(), out = [];
  for (const k of Object.keys(b)) if (b[k] !== a[k]) out.push(`${k} +${b[k] - a[k]}`);
  return out.join(' ') || 'nothing';
}

/* ── event fixtures. m24's pattern (tools/m24-shake-tests.js:170): the bus is the seam every
 * cue arrives through in the real game, so a suite drives it directly and the whole layer —
 * subscription, silence threshold, routing, gap, cap, actuator — runs for real.
 *
 * THE STAMP IS AHEAD OF THE SIM CLOCK, ON PURPOSE. The house is still settling for the first
 * seconds of a run and emits real IMPACTs of its own; one of those inside the last 120 ms
 * would gap a synthetic thud and the case would fail for the world's reasons rather than the
 * layer's. `at()` hands out a stamp at least 5 s past both the sim clock and the last stamp,
 * which is longer than minGapMs and longer than any row's ms, so every one-shot case starts
 * from a clean gap and a clean cap whatever the world is doing. */
let _T = 0;
const at = (gap = 5000) => (_T = Math.max(_T, now()) + gap);
const impactAt = (relVelocity, pos, t = at(), extra = {}) =>
  bus.emit(EVENTS.IMPACT, { entityId: 'm35', relVelocity, position: pos, materials: ['cardboard'], ...extra }, t);
const roadEvent = (type, t = at()) =>
  bus.emit(EVENTS.ROAD_FORCE, { roadType: type, label: type, severity: TRUCK.roadEvents[type].severity }, t);

/** Stand a mover still somewhere (tools/m24-shake-tests.js placeMover). */
function placeMover(m, x, z, y = 0.2) {
  m.controller.hardSetPosition({ x, y, z });
  m.controller._vel.x = 0; m.controller._vel.z = 0;
  m.controller.velocityY = 0; m.controller._climb = null;
  m.controller.carriedMass = 0; m.controller.resistedForce = 0;
  m.controller.pull.x = 0; m.controller.pull.z = 0;
  m.controller.imbalance = 0; m.controller.exertion = 0; m.controller._downMs = 0;
}
/** Park a registry entity somewhere, at rest (tools/m24-shake-tests.js parkAt). */
function parkAt(e, x, y, z) {
  e.body.setTranslation({ x, y, z }, true);
  e.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  e.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  e.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  e.body.wakeUp();
  physics.primeQueries();
}
/** Drain the MICROTASK queue, which is all the `.catch` haptics.js attaches to playEffect
 *  needs to have run (an already-rejected promise queues its handler immediately).
 *
 *  ⚠ NEVER A TIMER HERE. Under this harness — `--headless=new --dump-dom
 *  --virtual-time-budget=240000` — the budget is spent during boot, so a mid-run
 *  `setTimeout(…, 0)` NEVER fires: the same reason CLAUDE.md forbids waiting for rAF.
 *  Measured 2026-09-05: an earlier draft of this suite awaited a setTimeout here and the page
 *  sat on it for ever — 72 of 107 assertions ran, all of H5/H6/H7 and the teardown never did,
 *  and the harness exited 1 with no ALL-PASS line at all while every printed line said PASS.
 *  Microtasks are drained at the end of the current task unconditionally, budget or no. */
const settleMicrotasks = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); };
/** Every leaf path whose value differs between two plain objects (m24's diffPaths). */
function diffPaths(a, b, path = '', out = []) {
  if (a === b) return out;
  const ao = a && typeof a === 'object', bo = b && typeof b === 'object';
  if (!ao || !bo) { out.push(path || '(root)'); return out; }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) diffPaths(a[k], b[k], path ? `${path}.${k}` : k, out);
  return out;
}
const snapshot = () => JSON.parse(JSON.stringify(game.state));

// SETUP: nothing from a previous run may survive into this one.
try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* no storage — the suite still runs */ }
const rumble0 = M.haptics.enabled();

try {

/* ── H1. one table, and it covers the whole vocabulary ───────────────────────── */
lines.push('--- H1. the haptic table covers every cue type, in range, frozen (§8.4) ---');
{
  eq('H1 every cue type the audio layer emits has a HAPTICS row (key sets equal)',
     HAPTIC_TYPES.slice().sort().join(','), Object.keys(CUES).sort().join(','));
  const missing = Object.keys(CUES).filter((k) => !hapticFor(k));
  ok('H1a …named, if any are missing', missing.length === 0, missing.join(','));
  const extra = HAPTIC_TYPES.filter((k) => !Object.prototype.hasOwnProperty.call(CUES, k));
  ok('H1a1 …and no haptic row without a cue', extra.length === 0, extra.join(','));
  const bad = [];
  for (const t of HAPTIC_TYPES) {
    const r = hapticFor(t);
    if (!(Number.isFinite(r.strong) && r.strong >= 0 && r.strong <= 1)) bad.push(`${t}.strong=${r.strong}`);
    if (!(Number.isFinite(r.weak) && r.weak >= 0 && r.weak <= 1)) bad.push(`${t}.weak=${r.weak}`);
    if (!(Number.isFinite(r.ms) && r.ms >= HAPTICS.minMs && r.ms <= HAPTICS.maxMs)) bad.push(`${t}.ms=${r.ms}`);
    if (!['holder', 'player', 'driver', 'all'].includes(r.to)) bad.push(`${t}.to=${r.to}`);
    if (rowStrength(r) <= 0) bad.push(`${t}: no motor at all`);
  }
  ok(`H1b magnitudes in [0,1], ms in [${HAPTICS.minMs},${HAPTICS.maxMs}], a known route, at least one motor`,
     bad.length === 0, bad.join(' | '));
  const strapBad = [];
  for (const k of ['strong', 'weak']) if (!(HAPTICS.strap[k] >= 0 && HAPTICS.strap[k] <= 1)) strapBad.push(`strap.${k}`);
  if (!(HAPTICS.strap.ms >= HAPTICS.minMs && HAPTICS.strap.ms <= HAPTICS.maxMs)) strapBad.push('strap.ms');
  ok('H1b1 …and the §10.3 strap row too', strapBad.length === 0, strapBad.join(','));
  ok('H1c the strap repeat is slower than the per-type gap (a repeat is never swallowed)',
     HAPTICS.strap.periodMs > HAPTICS.minGapMs, `${HAPTICS.strap.periodMs} vs ${HAPTICS.minGapMs}`);
  ok('H1d the table is frozen', Object.isFrozen(HAPTICS));
  ok('H1d1 …and every row with it (Object.freeze is shallow — a writable row is a bare literal)',
     HAPTIC_TYPES.every((t) => Object.isFrozen(HAPTICS[t])) && Object.isFrozen(HAPTICS.strap),
     HAPTIC_TYPES.filter((t) => !Object.isFrozen(HAPTICS[t])).join(','));
  const wasMs = HAPTICS.IMPACT.ms;
  try { HAPTICS.IMPACT = { strong: 1, weak: 1, ms: 999 }; } catch (e) { /* strict mode throws */ }
  try { HAPTICS.IMPACT.ms = 999; } catch (e) { /* strict mode throws */ }
  eq('H1d2 …so neither replacing a row nor writing one of its numbers lands', HAPTICS.IMPACT.ms, wasMs);
  eq('H1e hapticFor of an unknown type is null', hapticFor('NOT_AN_EVENT'), null);
  eq('H1e1 …and of an inherited property (own properties only)', hapticFor('constructor'), null);
  /* No `maxConcurrent` key: one effect at a time is the actuator's own behaviour, not a knob,
   * and a number in config.js that nothing reads is worse than no number (H3 asserts the rule
   * it would have described). This pins that the table carries no tuning nothing consumes. */
  ok('H1f the table has no inert tuning key (every scalar has a consumer)',
     !Object.prototype.hasOwnProperty.call(HAPTICS, 'maxConcurrent'));
  eq('H1g the effect name is the Gamepad API\'s two-motor type', HAPTICS.effect, 'dual-rumble');
  lines.push(`      ${HAPTIC_TYPES.length} rows; gap ${HAPTICS.minGapMs} ms; ms in [${HAPTICS.minMs},${HAPTICS.maxMs}]; strap every ${HAPTICS.strap.periodMs} ms`);
}
emit('running...');

/* ── H2. routing — the seat the event belongs to, and no other ───────────────── */
lines.push('--- H2. the pulse lands on the seat the event belongs to (§4.4, §11.3, §15.3) ---');
{
  frame(60);                         // let the house finish settling: a stray IMPACT from an
                                     // object still coming to rest is a broadcast, and would
                                     // land on both pads for reasons that are not this test's.
  M.setSeats(2);
  const pads = installPads([{}, {}]);
  const seat0Pad = input.padForSeat(0), seat1Pad = input.padForSeat(1);
  ok('H2 fixture: both seats have a stubbed pad with an actuator',
     !!(seat0Pad && seat0Pad.vibrationActuator && seat1Pad && seat1Pad.vibrationActuator));
  ok('H2a1 …and they are DIFFERENT pads (input\'s own slot→seat rule: the joiner gets slot 0)',
     seat0Pad !== seat1Pad && seat0Pad === pads[1].pad && seat1Pad === pads[0].pad);
  M.settingsStore.apply({ rumble: true });

  // (a) a held box thuds in the hands that were on it. The grip record is the plain
  // {playerId, hand} object grip.js pushes onto entity.state.grips (grip.js:252), which is
  // exactly what holdersOf reads.
  const box = byDef('box_small_01');
  eq('H2b fixture: a 9 kg box exists', box ? box.def.mass : null, 9);
  box.state.grips.length = 0;
  box.state.grips.push({ playerId: movers[0].id, hand: 'left' });
  freshCase();
  impactAt(3.0, { x: 0, y: 0.3, z: 0 }, now(), { entityId: box.id, materials: box.def.surfaceTags });
  const row = hapticFor('IMPACT');
  eq('H2c a 9 kg box thudding in seat 0\'s hands → exactly one pulse on seat 0\'s pad', countOf(0), 1);
  eq('H2c1 …and none at all on seat 1\'s', countOf(1), 0);
  const c = logOf(0)[0];
  eq('H2c2 …with the thud row\'s own numbers (type, duration, strong, weak)',
     `${c.type}/${c.duration}/${c.strongMagnitude}/${c.weakMagnitude}`,
     `${HAPTICS.effect}/${row.ms}/${row.strong}/${row.weak}`);

  // (b) a §15.3 property line names its holder on the line itself (damage.js heldBy).
  freshCase();
  bus.emit(EVENTS.DAMAGE_APPLIED, {
    entityId: 'wall_front', category: 'property', band: 'scuffed', cost: 38.4,
    location: 'front wall', heldBy: [movers[1].id], position: { x: 0, y: 1, z: 0 },
  }, at());
  eq('H2e a property line whose heldBy is seat 1 → seat 1\'s pad only', countOf(1), 1);
  eq('H2e1 …and seat 0 feels nothing', countOf(0), 0);
  const dmg = hapticFor('DAMAGE_APPLIED');
  eq('H2e2 …with the damage row\'s numbers', `${logOf(1)[0].strongMagnitude}/${logOf(1)[0].duration}`,
     `${dmg.strong}/${dmg.ms}`);

  // (d) a road event reaches the DRIVING seat — the seat M16's shake observer picked.
  const cab = cabPoint();
  game.setPhase(PHASES.PICKUP);
  placeMover(movers[0], cab.x, cab.z + 1.4);
  placeMover(movers[1], M.world.spawn.x + 6, M.world.spawn.z + 6);
  game.setPhase(PHASES.TRANSIT);
  eq('H2f fixture: the mover at the cab is the recorded driver (m24 K2\'s own fixture)', M.shakeDriver(), 0);
  eq('H2f1 …and the shake observer\'s seat choice is seat 0', M.roadShakeSeat(), 0);
  freshCase();
  roadEvent('hardBrake');
  const roadRow = hapticFor('ROAD_FORCE');
  eq('H2g a hard brake pulses the driving seat', countOf(0), 1);
  eq('H2g1 …and only that seat', countOf(1), 0);
  eq('H2g2 …the SAME seat the camera shake picked (one inference, not two)',
     countOf(M.roadShakeSeat()), 1);
  eq('H2g3 …with the road row\'s numbers', `${logOf(0)[0].strongMagnitude}/${logOf(0)[0].duration}`,
     `${roadRow.strong}/${roadRow.ms}`);

  // …and with the OTHER mover at the cab, the other pad buzzes. The routing follows the
  // driver, not the seat index (M18's lesson: the row decides the seat).
  game.setPhase(PHASES.PICKUP);
  placeMover(movers[1], cab.x, cab.z + 1.4);
  placeMover(movers[0], M.world.spawn.x + 6, M.world.spawn.z + 6);
  game.setPhase(PHASES.TRANSIT);
  eq('H2h fixture: now seat 1 is driving', M.roadShakeSeat(), 1);
  freshCase();
  const s0 = statsOf();
  roadEvent('hardBrake');
  eq('H2h1 the brake follows the driver to seat 1', countOf(1), 1, `layer did: ${statsDelta(s0)}`);
  eq('H2h2 …and seat 0, who is not driving, feels nothing', countOf(0), 0);

  // (e) a broadcast reaches everybody.
  freshCase();
  bus.emit(EVENTS.CONTRACT_PHASE, { from: PHASES.BRIEFING, to: PHASES.PICKUP }, at());
  eq('H2i "the job starts" is a broadcast: seat 0 felt it', countOf(0), 1);
  eq('H2i1 …and so did seat 1', countOf(1), 1);
  const ph = hapticFor('CONTRACT_PHASE');
  eq('H2i2 …with the phase row\'s numbers on both',
     `${logOf(0)[0].duration}/${logOf(1)[0].duration}`, `${ph.ms}/${ph.ms}`);

  // (f) the §8.4 silence threshold the audio layer already owns is the hand's too.
  freshCase();
  impactAt(AUDIO.impact.minVelocity - 0.01, { x: 0, y: 0.3, z: 0 });
  eq('H2j a box SET DOWN (below AUDIO.impact.minVelocity) is not a thud for the hand either',
     countOf(0) + countOf(1), 0);
  ok('H2j1 …and the layer counted it as a deliberate silence, not a miss', M.haptics.stats.droppedSilent > 0,
     JSON.stringify(M.haptics.stats));

  /* (g) THE SAME CLAIM, DRIVEN BY PHYSICS. Everything above hands the bus an event; this
   * drops the 9 kg box for real onto a spawn point (the only ground validated clear at boot —
   * m24's SPOT) with both movers parked well away, and lets the damage system emit the IMPACT
   * itself. 0.65 m so the box is damaged and NOT broken: breaking spawns fragments, and a
   * falling fragment is an impact nobody is holding, which broadcasts to both pads and would
   * make this measure something else (measured: from 1.95 m the box broke at 5.68 m/s, two
   * fragments fell, and seat 1 felt them). */
  placeMover(movers[0], M.world.spawn.x + 7, M.world.spawn.z + 7);
  placeMover(movers[1], M.world.spawn.x + 9, M.world.spawn.z + 9);
  frame(30);
  freshCase();
  const drop = { x: M.world.spawn.x + MOVERS.spawnOffsets[0].x, z: M.world.spawn.z + MOVERS.spawnOffsets[0].z };
  /* MOVE IT FIRST, AND SET IT DOWN — no fall. Taking this box out of the living room lifts it
   * from under whatever was stacked on it, and that neighbour has its own fall to take:
   * measured, box_small_01#7 hit at 2.95 m/s inside the window, and being held by nobody it
   * broadcast to both pads. Setting the box down from 5 cm is under `normal` fragility's
   * 2.0 m/s threshold, so it costs the box nothing and the measured drop below starts from a
   * quiet world and an undamaged box. */
  parkAt(box, drop.x, 0.30, drop.z);
  frame(45);
  // …and close any cost window that opened, so a stale DAMAGE_APPLIED cannot arrive just
  // BEFORE this drop's IMPACT and take the seat off the thud (damage.js _closeWindow does
  // exactly that when a new impact lands on an open window).
  M.damage.flush(now());
  frame(2);
  freshCase();
  parkAt(box, drop.x, 0.9, drop.z);
  box.state.grips.length = 0;
  box.state.grips.push({ playerId: movers[0].id, hand: 'left' });
  const impactsBefore = M.damage.impactCount;
  const condBefore = box.state.condition;
  const bodiesBeforeDrop = registry.entities.size;
  const seen = [];
  const offAny = bus.onAny((e) => {
    if (!hapticFor(e.type)) return;
    seen.push(`${e.type}:${e.entityId || e.strapId || ''}${e.heldBy ? '[' + e.heldBy.join('+') + ']' : ''}` +
              (e.relVelocity != null ? '@' + Number(e.relVelocity).toFixed(2) : ''));
  });
  frame(45);
  offAny();
  const real = logOf(0).slice();
  const strays = seen.filter((s) => s.startsWith('IMPACT:') && !s.startsWith('IMPACT:' + box.id));
  ok('H2k a REAL 0.65 m drop: the damage system emitted an impact of its own',
     M.damage.impactCount > impactsBefore, `${M.damage.impactCount - impactsBefore} impacts`);
  ok('H2k1 …the box was damaged but not broken (no fragment bodies to broadcast)',
     box.state.condition < condBefore && box.state.condition > 0 && registry.entities.size === bodiesBeforeDrop,
     `${condBefore.toFixed(1)} → ${box.state.condition.toFixed(1)}, ${registry.entities.size - bodiesBeforeDrop} new bodies`);
  ok('H2k2 fixture: the only thing that hit anything in the window was the box',
     strays.length === 0, strays.join(' '));
  ok('H2k3 …and the holder\'s pad felt it', real.length >= 1, `${real.length} pulses`);
  eq('H2k4 …with the thud row\'s numbers',
     real.length ? `${real[0].duration}/${real[0].strongMagnitude}/${real[0].weakMagnitude}` : 'none',
     `${row.ms}/${row.strong}/${row.weak}`);
  eq('H2k5 …and seat 1, who was not holding it, felt nothing at all', countOf(1), 0);
  lines.push(`      the real drop: cues [${seen.join(' ')}], condition ${condBefore.toFixed(1)} → ${box.state.condition.toFixed(1)}, ` +
             `seat 0 ${real.map((c) => c.strongMagnitude + '/' + c.duration).join(' ') || 'none'}, ` +
             `seat 1 ${(logOf(1) || []).map((c) => c.strongMagnitude + '/' + c.duration).join(' ') || 'none'}`);
  box.state.grips.length = 0;

  game.setPhase(PHASES.PICKUP);
  unplugPads();
  M.setSeats(1);
  input.poll(FRAME);
}
emit('running...');

/* ── H3. the gap, and the cap ─────────────────────────────────────────────────── */
lines.push('--- H3. minGapMs collapses a burst; the stronger pulse wins the seat (§26.6) ---');
{
  const pads = installPads([{}]);
  M.settingsStore.apply({ rumble: true });
  const t0 = at();

  freshCase();
  impactAt(3.0, { x: 0, y: 0.3, z: 0 }, t0);
  impactAt(3.0, { x: 0, y: 0.3, z: 0 }, t0 + 40);
  eq(`H3 two thuds ${40} ms apart (< minGapMs ${HAPTICS.minGapMs}) are ONE pulse`, pads[0].calls.length, 1);
  ok('H3a …and the second was counted as gapped, not lost', M.haptics.stats.droppedGap > 0,
     JSON.stringify(M.haptics.stats));
  clearLogs();
  impactAt(3.0, { x: 0, y: 0.3, z: 0 }, t0 + 40 + HAPTICS.minGapMs);
  eq('H3a1 …and one exactly minGapMs after the first firing does play', pads[0].calls.length, 1);

  // The cap. A weak cue inside a strong one's window would cancel it — the actuator plays one
  // effect — so it stands down; a strong one inside a weak one's replaces it.
  const grip = hapticFor('GRIP_STARTED');       // weak 0.22, 45 ms
  const dmg = hapticFor('DAMAGE_APPLIED');      // strong 0.85, 180 ms
  ok('H3b fixture: the damage row really is the stronger of the two',
     rowStrength(dmg) > rowStrength(grip), `${rowStrength(dmg)} vs ${rowStrength(grip)}`);
  const t1 = at();
  clearLogs();
  bus.emit(EVENTS.GRIP_STARTED, { playerId: movers[0].id, hand: 'left', entityId: 'm35' }, t1);
  bus.emit(EVENTS.DAMAGE_APPLIED, { entityId: 'm35', band: 'broken', cost: 12, position: { x: 0, y: 1, z: 0 } }, t1 + 20);
  eq('H3c a STRONG pulse 20 ms into a weak one: playEffect called twice', pads[0].calls.length, 2);
  eq('H3c1 …the first with the weak row\'s magnitudes',
     `${pads[0].calls[0].strongMagnitude}/${pads[0].calls[0].weakMagnitude}`, `${grip.strong}/${grip.weak}`);
  eq('H3c2 …and the second REPLACING it with the stronger ones',
     `${pads[0].calls[1].strongMagnitude}/${pads[0].calls[1].weakMagnitude}`, `${dmg.strong}/${dmg.weak}`);

  const t2 = at();
  clearLogs();
  bus.emit(EVENTS.DAMAGE_APPLIED, { entityId: 'm35', band: 'broken', cost: 12, position: { x: 0, y: 1, z: 0 } }, t2);
  bus.emit(EVENTS.GRIP_STARTED, { playerId: movers[0].id, hand: 'left', entityId: 'm35' }, t2 + 20);
  eq('H3d the other way round — a weak pulse inside a strong one is dropped, not played',
     pads[0].calls.length, 1);
  eq('H3d1 …and the one call is the strong one', pads[0].calls[0].strongMagnitude, dmg.strong);
  const dw = M.haptics.stats.droppedWeaker;
  ok('H3d2 …counted as a weaker cue standing down', dw > 0, `droppedWeaker ${dw}`);
  clearLogs();
  bus.emit(EVENTS.GRIP_STARTED, { playerId: movers[0].id, hand: 'left', entityId: 'm35' }, t2 + dmg.ms + 1);
  eq('H3d3 …and once the strong pulse has run its course the weak one plays again',
     pads[0].calls.length, 1);

  unplugPads();
}
emit('running...');

/* ── H4. the switch (§21.4 Motion) ───────────────────────────────────────────── */
lines.push('--- H4. rumble is a switch, and reduced motion turns it off unless asked (§21.4) ---');
{
  const pads = installPads([{}]);

  M.settingsStore.apply({ rumble: false });
  clearLogs();
  impactAt(3.0, { x: 0, y: 0.3, z: 0 });
  roadEvent('hardBrake');
  bus.emit(EVENTS.DAMAGE_APPLIED, { entityId: 'm35', band: 'broken', cost: 9, position: { x: 0, y: 1, z: 0 } }, at());
  eq('H4 rumble off → zero calls across a drop, a road event and a damage line', pads[0].calls.length, 0);
  eq('H4a …and the layer says so', M.haptics.enabled(), false);

  M.settingsStore.apply({ rumble: true });
  clearLogs();
  frame(20);
  clearLogs();
  impactAt(3.0, { x: 0, y: 0.3, z: 0 });
  eq('H4b rumble back on → the very next cue is felt', pads[0].calls.length, 1);

  // The M16 stub: the OS reading, through the save's own validator — no reboot needed.
  localStorage.removeItem(SAVE_KEY);
  eq('H4c reduced motion preferred, nothing saved → the switch defaults OFF',
     load({ reducedMotion: true }).shell.rumble, false);
  eq('H4c1 …no preference → ON', load({ reducedMotion: false }).shell.rumble, true);
  // H4c2 used to compare two values that are both true by independent routes, so it could not
  // fail; it now pins the one value the default cannot produce — an explicit no, round-tripped.
  localStorage.setItem(SAVE_KEY, JSON.stringify({ schema: SAVE_SCHEMA, shell: { rumble: false } }));
  eq('H4c2 …an explicit no survives a load that sees no OS preference', load({ reducedMotion: false }).shell.rumble, false);
  localStorage.removeItem(SAVE_KEY);
  localStorage.setItem(SAVE_KEY, JSON.stringify({ schema: SAVE_SCHEMA, shell: { rumble: true } }));
  eq('H4d an explicit yes wins over the OS reading (record it, do not fight it)',
     load({ reducedMotion: true }).shell.rumble, true);
  localStorage.setItem(SAVE_KEY, JSON.stringify({ schema: SAVE_SCHEMA, shell: { rumble: false } }));
  eq('H4d1 …and an explicit no wins the other way', load({ reducedMotion: false }).shell.rumble, false);
  eq('H4d2 a non-boolean in the blob is the OS default, not a truthy string',
     sanitiseShell({ rumble: 'yes' }, { reducedMotion: true }).rumble, false);
  localStorage.removeItem(SAVE_KEY);

  // …and the live layer, driven through the same value the stub produces.
  M.settingsStore.apply({ rumble: load({ reducedMotion: true }).shell.rumble });
  clearLogs();
  impactAt(3.0, { x: 0, y: 0.3, z: 0 });
  roadEvent('hardBrake');
  eq('H4e the reduced-motion default, applied live → zero calls', pads[0].calls.length, 0);
  M.settingsStore.apply({ rumble: true });
  clearLogs();
  frame(20);
  clearLogs();
  impactAt(3.0, { x: 0, y: 0.3, z: 0 });
  eq('H4e1 …and an explicit yes under reduced motion resumes them', pads[0].calls.length, 1);

  // The card: a data row m16 U2's walk finds, with a consumer that moves.
  ok('H4f the card lists a rumble row', M.settingsPanel.keys().includes('rumble'));
  ok('H4f1 …as a real [data-setting] control', !!control('rumble'));
  eq('H4f2 …a checkbox', control('rumble').type, 'checkbox');
  const c = control('rumble');
  c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true }));
  eq('H4f3 unticking the box moves the consumer', M.haptics.enabled(), false);
  c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true }));
  eq('H4f4 …and ticking it back moves it back', M.haptics.enabled(), true);
  eq('H4g the choice persisted', load().shell.rumble, true);
  const blob = JSON.parse(localStorage.getItem(SAVE_KEY));
  eq('H4h …and the save still has exactly the seven documented sections',
     Object.keys(blob).sort().join(','), 'bestInvoice,bindings,build,runs,schema,settings,shell');

  panel().querySelector('[data-act="defaults"]').click();
  eq('H4i Defaults restores the boot reading (!reducedMotion), not a bare true',
     control('rumble').checked, !M.reducedMotion);

  unplugPads();
  localStorage.removeItem(SAVE_KEY);
}
emit('running...');

/* ── H5. a pad that cannot rumble, and one whose promise rejects ─────────────── */
lines.push('--- H5. no actuator is silence, not a throw; a rejected effect is caught (§26.6) ---');
{
  M.settingsStore.apply({ rumble: true });
  // (a) a pad object with no vibrationActuator at all — an older controller, or Firefox.
  const bare = installPads([{ noActuator: true }]);
  ok('H5 fixture: the polled pad really has no actuator', !input.padForSeat(0).vibrationActuator);
  const noPad0 = M.haptics.stats.noPad;
  let threw = null;
  try {
    impactAt(3.0, { x: 0, y: 0.3, z: 0 });
    roadEvent('hardBrake');
    frame(2);
  } catch (e) { threw = e; }
  ok('H5a a pad with no actuator: no throw', !threw, threw && threw.message);
  eq('H5a1 …and no calls (there was nothing to call)', bare[0].calls.length, 0);
  ok('H5a2 …counted, so "no pad" and "gapped" stay different states',
     M.haptics.stats.noPad > noPad0, `${noPad0} → ${M.haptics.stats.noPad}`);
  unplugPads();

  // (b) an actuator whose playEffect REJECTS. Chrome rejects with 'preempted' the moment a
  // second effect cancels the first, which is normal mid-drive — an unhandled rejection would
  // be a console full of red for a feature that worked.
  const rejecting = installPads([{ reject: true }]);
  const before = unhandled;
  const rej0 = M.haptics.stats.rejected;
  clearLogs();
  frame(20);
  clearLogs();
  impactAt(3.0, { x: 0, y: 0.3, z: 0 });
  await settleMicrotasks();
  eq('H5b a rejecting actuator was still called', rejecting[0].calls.length, 1);
  /* WHAT STOPS AN UNHANDLED REJECTION is the `.catch` haptics.js attaches in the same
   * statement that calls playEffect — and the proof that it RAN is the layer's own counter
   * moving, which is a microtask away and needs no timer. The listener installed at the top of
   * this file is the end-to-end net: "notify about rejected promises" runs at the end of a
   * task, so it cannot be observed from inside this one, but the DOM is not dumped until the
   * virtual-time budget expires long afterwards — so a rejection that escaped WOULD append a
   * FAIL line and turn the run's tail into FAILURES before the harness ever reads it. */
  ok('H5b1 …and the layer HANDLED the rejection (its catch ran: the whole reason none escapes)',
     M.haptics.stats.rejected > rej0, `rejected ${rej0} → ${M.haptics.stats.rejected}`);
  eq('H5b2 …with nothing reported to window.unhandledrejection', unhandled, before);
  // …and it keeps working for the NEXT cue.
  clearLogs();
  frame(20);
  clearLogs();
  bus.emit(EVENTS.DAMAGE_APPLIED, { entityId: 'm35', band: 'broken', cost: 9, position: { x: 0, y: 1, z: 0 } }, at());
  await settleMicrotasks();
  eq('H5c the layer keeps working for the next cue after a rejection', rejecting[0].calls.length, 1);
  eq('H5c1 …and still no unhandled rejection', unhandled, before);
  unplugPads();

  // (c) no pad at all: the common case, and it must be free of noise.
  M.settingsStore.apply({ rumble: true });
  let threw2 = null;
  try { impactAt(3.0, { x: 0, y: 0.3, z: 0 }); roadEvent('hardBrake'); frame(2); } catch (e) { threw2 = e; }
  ok('H5d with no gamepad connected at all the layer is inert and silent', !threw2, threw2 && threw2.message);
  eq('H5d1 …and input.padForSeat says so', input.padForSeat(0), null);
  eq('H5d2 …a seat that does not exist is null too, never a throw', input.padForSeat(9), null);
}
emit('running...');

/* ── H6. §10.3's overstressed strap: a repeat, not a knock ───────────────────── */
lines.push('--- H6. an overstressed strap creaks in the CARRIER\'s hand for as long as it lasts (§10.3) ---');
{
  eq('H6 fixture: §10.3\'s overstressed state exists in straps.js', STRAP_STATE.OVERSTRESSED, 'overstressed');
  /* TWO SEATS, AND A CARRIER. The brief's claim is "on the carrier's seat", so a single seat
   * cannot test it: with one seat the row's 'holder' route and its broadcast fallback give the
   * same answer, and the case would measure the PERIOD while quietly measuring no routing at
   * all. Both halves of that route are exercised here — the entity's own grips (a pure
   * seatsFor call, no frames, so a synthetic grip record never sits on a real box while the
   * physics runs) and the payload's heldBy, which is what the timing loop below carries. */
  M.setSeats(2);
  const pads = installPads([{}, {}]);
  M.settingsStore.apply({ rumble: true });
  const carrier = movers[1].id;
  const load = byDef('box_small_01');
  load.state.grips.length = 0;
  load.state.grips.push({ playerId: carrier, hand: 'left' });
  eq('H6a0 the strap row routes to the seat whose hands are on the load, and no other',
     M.haptics.seatsFor(HAPTICS.strap, { strapId: 'm35_strap', entityId: load.id }).join(','), '1');
  load.state.grips.length = 0;
  frame(30);
  /* This case runs on the SIM clock (the sustain is ticked by game.frame), so it cannot use
   * the ahead-of-clock stamp the one-shot cases do. freshCase() clears the future gap stamps
   * and the in-flight pulse those left behind, and `creaksOf` filters a seat's log to pulses
   * that carry the strap row's own magnitudes — so a stray settling IMPACT sharing the seat is
   * visible in the count but never mistaken for a creak. */
  freshCase();

  const t0 = now();
  const isCreak = (c) => c.strongMagnitude === HAPTICS.strap.strong &&
                         c.weakMagnitude === HAPTICS.strap.weak &&
                         c.duration === HAPTICS.strap.ms;
  const creaksOf = (seat) => (logOf(seat) || []).filter(isCreak);
  const creaks = () => creaksOf(1);
  const strap = (state, t, tension = 1300) => bus.emit(EVENTS.STRAP_CHANGED,
    { strapId: 'm35_strap', entityId: load.id, heldBy: [carrier], state, tension }, t);
  const stamps = [];
  const watch = () => { while (stamps.length < creaks().length) stamps.push(now()); };
  strap('overstressed', t0);
  watch();
  eq('H6a the state itself creaks at once, in the carrier\'s hand', creaks().length, 1);
  eq('H6a1 …with the strap row\'s weak-motor-only numbers',
     `${creaks()[0].strongMagnitude}/${creaks()[0].weakMagnitude}/${creaks()[0].duration}`,
     `${HAPTICS.strap.strong}/${HAPTICS.strap.weak}/${HAPTICS.strap.ms}`);
  eq('H6a2 …and the layer is now sustaining exactly one strap', M.haptics.sustaining, 1);
  // The fixture first, or 'felt no creak' would also pass with no pad, no actuator and no log.
  ok('H6a2b fixture: seat 0 has its own stubbed pad with an actuator, and it is not seat 1\'s',
     !!(input.padForSeat(0) && input.padForSeat(0).vibrationActuator) &&
     input.padForSeat(0) !== input.padForSeat(1));
  eq('H6a3 …while the seat that is NOT carrying it feels no creak', creaksOf(0).length, 0);

  // 1 s of sim, one frame at a time, recording when each repeat landed.
  const s6 = statsOf();
  for (let i = 0; i < 60; i++) { frame(1); watch(); }
  const n = creaks().length;
  const want = 1 + Math.floor((60 * FRAME) / HAPTICS.strap.periodMs);
  eq(`H6b 1 s of overstress → ${want} pulses at ${HAPTICS.strap.periodMs} ms`, n, want,
     `layer did: ${statsDelta(s6)}`);
  const gaps = [];
  for (let i = 1; i < stamps.length; i++) gaps.push(stamps[i] - stamps[i - 1]);
  const worst = gaps.length ? Math.max(...gaps.map((g) => Math.abs(g - HAPTICS.strap.periodMs))) : Infinity;
  near(`H6b1 …every interval within one frame of ${HAPTICS.strap.periodMs} ms`, worst, 0, FRAME + 1e-6);
  eq('H6b2 …and still not one creak in the other seat', creaksOf(0).length, 0);
  lines.push(`      creak intervals (ms): ${gaps.map((g) => g.toFixed(1)).join(', ')}`);

  // It stops when the state clears — one final one-shot for the new state, then nothing.
  clearLogs();
  const strapRow = hapticFor('STRAP_CHANGED');
  strap('tensioned', now(), 900);
  eq('H6c the state clearing is its own one-shot, on the STRAP_CHANGED row',
     (logOf(1) || []).filter((c) => c.strongMagnitude === strapRow.strong && c.duration === strapRow.ms).length, 1);
  eq('H6c1 …and the sustain is gone', M.haptics.sustaining, 0);
  clearLogs();
  frame(Math.ceil((2 * HAPTICS.strap.periodMs) / FRAME));
  eq(`H6c2 …so two whole periods (${2 * HAPTICS.strap.periodMs} ms) later, no creak`, creaks().length, 0);

  // Unticking the switch mid-creak stops it too.
  strap('overstressed', now());
  eq('H6d fixture: creaking again', M.haptics.sustaining, 1);
  M.settingsStore.apply({ rumble: false });
  clearLogs();
  frame(Math.ceil((2 * HAPTICS.strap.periodMs) / FRAME));
  eq('H6d1 rumble off mid-creak → silence', (logOf(1) || []).length, 0);
  eq('H6d1a …no creak, specifically', creaks().length, 0);
  eq('H6d2 …and the sustain was dropped, not merely muted', M.haptics.sustaining, 0);
  M.settingsStore.apply({ rumble: true });

  // A contract reset clears the layer's whole memory (SIM_RESET; audio.js's rule).
  strap('overstressed', now());
  eq('H6e fixture: creaking once more', M.haptics.sustaining, 1);
  M.haptics.reset();
  eq('H6e1 reset() ends every creak', M.haptics.sustaining, 0);
  unplugPads();
  M.setSeats(1);
  input.poll(FRAME);
}
emit('running...');

/* ── H7. an observer, not a system (§22.4, m0 E8) ────────────────────────────── */
lines.push('--- H7. the layer writes nothing: no state, no body, no scene child (§22.4) ---');
{
  const pads = installPads([{}]);
  M.settingsStore.apply({ rumble: true });
  frame(30);
  const bodiesBefore = registry.entities.size;
  const childrenBefore = M.world.scene.children.length;
  /* THE STRONG FORM (m18 A12's shape). game.state is not expected to be UNCHANGED by a burst
   * of events — M6's run recorder counts them, and that is its job — so the claim is that the
   * haptic layer contributes nothing: the same burst moves exactly the same state, with the
   * layer attached and with it detached. */
  const burst = (t0) => {
    for (let i = 0; i < 40; i++) {
      const t = t0 + i * 7;
      impactAt(3.0, { x: 0, y: 0.3, z: 0 }, t);
      bus.emit(EVENTS.GRIP_STARTED, { playerId: movers[0].id, hand: 'left', entityId: 'm35' }, t);
      bus.emit(EVENTS.STRAP_CHANGED, { strapId: 'm35_s' + i, entityId: 'm35', state: 'overstressed' }, t);
      roadEvent('hardBrake', t);
    }
  };
  const t = now();
  const before = snapshot();
  M.haptics.detach();
  burst(t);
  const midway = snapshot();
  M.haptics.attach(bus).reset();
  burst(t + 1000);
  const after = snapshot();
  const withoutLayer = diffPaths(before, midway).sort();
  const withLayer = diffPaths(midway, after).sort();
  eq('H7 160 cues move exactly the same state paths with the layer attached as without it',
     withLayer.join(','), withoutLayer.join(','));
  ok('H7a …and every path either of them moved belongs to the run recorder, never the layer',
     withLayer.every((p) => p.startsWith('telemetry.counters')),
     withLayer.filter((p) => !p.startsWith('telemetry.counters')).join(','));
  lines.push(`      the burst moved ${withLayer.length} state path(s), all under telemetry.counters`);
  eq('H7a1 …no body was added', registry.entities.size, bodiesBefore);
  eq('H7b …and no scene child', M.world.scene.children.length, childrenBefore);
  ok('H7c the per-type gap map stayed bounded by seats × cue types (§26.6)',
     M.haptics._lastAt.size <= (HAPTIC_TYPES.length + 1) * Math.max(1, M.seatCount),
     `${M.haptics._lastAt.size} entries`);
  M.haptics.reset();
  eq('H7c1 …and reset() empties it', M.haptics._lastAt.size, 0);

  // The layer built standalone: no bus, no input, no pad — the constructor must be inert.
  const solo = createHaptics({});
  ok('H7d a layer built with no options at all is inert and throws nothing',
     solo instanceof Haptics && !solo.attached && solo.pulse(0, 'IMPACT', hapticFor('IMPACT'), 0) === false);
  eq('H7d1 …and its frame() is a no-op', solo.frame(1000), 0);
  unplugPads();
}

} catch (e) {
  fails++;
  lines.push(`FAIL  suite threw  <- ${e && e.message}`);
  lines.push((e && e.stack || '').split('\n').slice(0, 8).join('\n'));
}

// TEARDOWN: the pads, the seats and the save go back the way they were found.
try { delete navigator.getGamepads; input.poll(FRAME); input.clear(); } catch (e) { /* ignore */ }
try { M.setSeats(1); } catch (e) { /* ignore */ }
try { M.settingsStore.apply({ rumble: rumble0 }); } catch (e) { /* ignore */ }
try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
emit();
