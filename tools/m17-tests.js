/* Phase 11 build-side M6 suite — the run recorder, the exportable run summary, and the
 * §27.3 questionnaire on the settlement sheet.
 *
 * GDD §22.3 "record a lightweight event log for scoring and debugging"; §22.5 "export event
 * log and invoice inputs for reproducible reports"; §27.3 the seven playtest questions;
 * §27.4 "phase duration, grips, drops, recovery, damage, strap use, cargo motion, trips,
 * completion, and restart … human-readable and deletable"; §26.6 bounded logs.
 *
 * THE CLAIMS UNDER TEST:
 *
 *   RECORD, NOT RING   the recorder keeps every event the bus emits (R1: events.length ===
 *                      bus.emitted) while the bus's own log stays the 256-entry tail — and
 *                      is itself capped per run with a `dropped` count (R1d, R5).
 *   ONE KEY PER SIGNAL the run summary round-trips through JSON and carries a key for each
 *                      of §27.4's ten signals (R2), with the counts agreeing with the events
 *                      they came from (R3) and with the settlement's own tally (R4).
 *   NEVER WRITES STATE the same scripted run with and without the recorder gives the same
 *                      invoice lines and the same ledger (R6) — the guard that lets an onAny
 *                      handler live inside the fixed step.
 *   THE QUESTIONS      seven [data-q] controls whose text is the GDD's, verbatim (Q1); Skip
 *                      and no-answer paths leave the replay alone (Q2, Q4); the export carries
 *                      the answers and the invoice to the cent (Q3); keys typed into the form
 *                      never reach the game (Q5); a refused store changes nothing on screen (Q6).
 *
 * localStorage 'mfh.save' is cleared at the START and the END (headless Chrome under
 * --user-data-dir has a working store; m16's rule).
 */

import { SIM, TELEMETRY, ECONOMY } from '../src/config.js';
import { EVENTS, PHASES, EventBus } from '../src/core/eventBus.js';
import { cabPoint, cargoInterior } from '../src/world/truck.js';
import { routeSteps } from '../src/drive/route.js';
import { DEST_ZONES } from '../src/world/destination.js';
import { LINE_KINDS } from '../src/contract/invoice.js';
import { load, save, sanitiseRuns, SAVE_KEY } from '../src/core/save.js';
import { RunRecorder, createTelemetryCounters, countEvent, compactRun } from '../src/telemetry/runLog.js';
import { QUESTIONS, readAnswers } from '../src/ui/questionnaire.js';

const lines = [];
let passes = 0, fails = 0;
function ok(name, cond, detail = '') {
  if (cond) { passes++; lines.push(`PASS  ${name}`); }
  else { fails++; lines.push(`FAIL  ${name}${detail ? '  <- ' + detail : ''}`); }
}
const eq = (n, a, b) => ok(n, a === b, `got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
/** Structural deep-equal, key order ignored. */
function deepEq(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
  if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return false;
  return ka.every((k) => deepEq(a[k], b[k]));
}
const deep = (n, a, b) => ok(n, deepEq(a, b), `got ${JSON.stringify(a).slice(0, 300)}, want ${JSON.stringify(b).slice(0, 300)}`);

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
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason; fails++; lines.push(`FAIL  uncaught  <- ${r && r.message || r}`);
  lines.push((r && r.stack || '').split('\n').slice(0, 5).join('\n')); emit();
});
try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* no storage — the suite still runs */ }

let M;
try { M = await window.__MFH_READY; }
catch (e) {
  fails++; lines.push(`FAIL  boot threw  <- ${e && e.message}`);
  lines.push((e && e.stack || '').split('\n').slice(0, 6).join('\n'));
  emit(); throw e;
}

const { game, physics, registry, movers, tools, straps, cargo, route, damage, interact, rig, camera, input } = M;
const bus = game.bus;
const recorder = M.recorder;
const STEP = SIM.stepMs;
const FRAME = 16.667;
const I = cargoInterior();
const me = () => movers[M.activeMoverIndex];
const counters = () => game.state.telemetry.counters;

/* ── drivers (m14 / m11 lineage) ─────────────────────────────────────────── */
function frames(n) { for (let k = 0; k < n; k++) game.frame(FRAME); }
/** A hand-driven step: grips and controllers directly, no systems — so a grip taken from
 *  outside the loop is not released by the movers system's key check on the next frame. */
function step(n = 1) {
  for (let i = 0; i < n; i++) {
    physics.clearForces();
    for (const m of movers) {
      const yaw = m.grips.aimYaw;
      m.grips.step(STEP, { brace: false, simTimeMs: game.clock.simTimeMs });
      m.controller.step(STEP, {
        move: { x: 0, y: 0 },
        forward: { x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw) },
        right: { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) },
        run: false, brace: false, jump: false, recover: false,
      });
    }
    interact.step(movers, STEP);
    straps.step(STEP, game.clock.simTimeMs);
    physics.step();
    registry.step(STEP);
    cargo.step(STEP, game.clock.simTimeMs);
    damage.step(STEP, game.clock.simTimeMs);
  }
}
function placeMover(m, x, z, y = 0.2) {
  m.controller.hardSetPosition({ x, y, z });
  m.controller._vel.x = 0; m.controller._vel.z = 0;
  m.controller.velocityY = 0; m.controller._climb = null;
  m.controller.carriedMass = 0; m.controller.resistedForce = 0;
  m.controller.pull.x = 0; m.controller.pull.z = 0;
  m.controller.imbalance = 0; m.controller.exertion = 0; m.controller._downMs = 0;
}
function parkAt(e, x, y, z, yaw = 0) {
  e.body.setTranslation({ x, y, z }, true);
  e.body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
  e.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  e.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  e.body.wakeUp();
  physics.primeQueries();
}
const posOf = (e) => { const t = e.body.translation(); return { x: t.x, y: t.y, z: t.z }; };
const byDef = (id) => { for (const e of registry.entities.values()) if (e.defId === id) return e; return null; };
function lookAt(m, from, target, snap = false) {
  placeMover(m, from.x, from.z, from.y !== undefined ? from.y : 0.2);
  const p = m.controller.position;
  rig.yaw = Math.atan2(-(target.x - p.x), -(target.z - p.z));
  rig.pitch = Math.atan2(target.y - (p.y + 1.4), Math.hypot(target.x - p.x, target.z - p.z));
  if (snap) rig._first = true;
  for (let k = 0; k < 20; k++) rig.update(p, 1 / 60);
  const c = camera.position;
  rig.yaw = Math.atan2(-(target.x - c.x), -(target.z - c.z));
  rig.pitch = Math.atan2(target.y - c.y, Math.hypot(target.x - c.x, target.z - c.z));
  m.grips.syncAim();
  physics.primeQueries();
}
const standOffFrom = (target, back = 1.3) => ({ x: target.x, z: target.z + back });
const slotIn = (zoneId, index) => {
  const z = DEST_ZONES.find((r) => r.id === zoneId);
  const cols = 4;
  const w = (z.maxX - z.minX) - 1.2, d = (z.maxZ - z.minZ) - 1.2;
  return {
    x: z.minX + 0.6 + ((index % cols) + 0.5) * (w / cols),
    z: z.minZ + 0.6 + (Math.floor(index / cols) + 0.5) * (d / 2),
  };
};
function drainNotices() { const n = M.pendingNotices.length; M.pendingNotices.splice(0, n); return n; }
/** The m10 cleanDelivery teleport: every manifest row into its room. */
function unloadEverything() {
  straps.releaseAll();
  const perRoom = {};
  for (const row of game.state.manifest) {
    const e = registry.get(row.entityId);
    if (!e) continue;
    perRoom[row.toZone] = (perRoom[row.toZone] || 0) + 1;
    const sl = slotIn(row.toZone, perRoom[row.toZone] - 1);
    parkAt(e, sl.x, e.def.dimensions.y / 2 + 0.06, sl.z);
  }
  frames(260);
}
function dropTv() {
  const tv = byDef('tv_55_01');
  parkAt(tv, -38, tv.def.dimensions.y / 2 + 1.5, 30, Math.PI / 2);
  frames(150);
}
const countType = (evs, type) => evs.filter((e) => e.type === type).length;
const sheet = () => M.invoiceScreen.el;
const invoiceNow = () => M.buildInvoice(game.state, M.manifestSummary(game.state.manifest),
  { recoveries: M.recoveryCount(), collisions: 0, moverCount: movers.length });
/** Answer a scale question / a text question the way a tester would (a change event each). */
function answer(id, value) {
  const form = sheet().querySelector('form.questionnaire');
  if (typeof value === 'number') {
    const r = form.querySelector(`input[name="${id}"][value="${value}"]`);
    r.checked = true;
    r.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    const t = form.querySelector(`input[name="${id}"]`);
    t.value = value;
    t.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

/* §27.3, GDD.md, verbatim — pinned HERE and not read back from the module, so a rewording
 * in questionnaire.js fails against the design document rather than against itself. */
const GDD_27_3 = [
  'What did the team try that the game allowed or unexpectedly prevented?',
  'When did weight and grip become understandable?',
  'Did preparation feel like choice or chore?',
  'Could players predict cargo shift and damage?',
  'Was the invoice funny and useful or merely punitive?',
  'Which moment would they tell a friend about?',
  'Would they replay the same contract differently?',
];

try {
// The shell observer ignores the pause action while the title card is up (main.js); Q5 is
// about the key reaching Input at all, so the job is started the way m13g starts it.
M.title.start();
drainNotices();

/* ── R1. the recorder is the record, not the ring (§22.3, §26.6) ───────────── */
lines.push('--- R1. the recorder keeps every event; the bus keeps its tail (GDD §22.3, §26.6) ---');
{
  ok('R0 the recorder is attached at boot and has seen every emit so far',
     recorder.attached && recorder.events.length === bus.emitted,
     `${recorder.events.length} recorded vs ${bus.emitted} emitted`);
  const e0 = recorder.events.length;
  const c0 = { ...counters() };
  dropTv();
  frames(150);
  const since = recorder.events.slice(e0);
  const impacts = countType(since, EVENTS.IMPACT);
  ok('R1 after 300 frames with impacts, recorder.events.length === bus.emitted',
     recorder.events.length === bus.emitted && impacts >= 1,
     `${recorder.events.length} recorded vs ${bus.emitted} emitted, ${impacts} IMPACT`);
  ok('R1a …while bus.log is still the bounded diagnostic tail (<= 256)',
     bus.log.length <= 256 && bus.log.length === Math.min(256, bus.emitted), `${bus.log.length}`);
  ok('R1b the recorded entries ARE the bus\'s stamped objects — a bare push, no copy',
     recorder.events[recorder.events.length - 1] === bus.log[bus.log.length - 1]);
  const c = counters();
  ok('R1c counters.impacts and .damageEvents equal the events they came from, and the ledger',
     c.impacts - c0.impacts === impacts &&
     c.damageEvents - c0.damageEvents === countType(since, EVENTS.DAMAGE_APPLIED) &&
     c.damageEvents === game.state.ledger.itemDamage.length,
     `impacts ${c.impacts - c0.impacts}/${impacts}, damage ${c.damageEvents}/${countType(since, EVENTS.DAMAGE_APPLIED)}/${game.state.ledger.itemDamage.length} ledger`);
  lines.push(`      TV drop: ${impacts} IMPACT, ${countType(since, EVENTS.DAMAGE_APPLIED)} DAMAGE_APPLIED in 300 frames; ${recorder.events.length} events recorded since boot`);

  // The cap, on a private bus: the list stops, the counting does not (§26.6).
  const b2 = new EventBus({ logSize: 4 });
  const cnt = createTelemetryCounters();
  const rr = new RunRecorder({ maxEvents: 3, counters: () => cnt }).attach(b2);
  for (let i = 0; i < 5; i++) b2.emit(EVENTS.IMPACT, { entityId: 'x' }, i);
  ok('R1d a recorder past its cap keeps `dropped` and keeps counting',
     rr.events.length === 3 && rr.dropped === 2 && cnt.impacts === 5 && b2.emitted === 5,
     `events ${rr.events.length} dropped ${rr.dropped} impacts ${cnt.impacts}`);
  rr.detach();
  b2.emit(EVENTS.IMPACT, {}, 9);
  eq('R1e …and detach() really unsubscribes', rr.events.length + rr.dropped, 5);
  ok('R1f TELEMETRY.maxEventsPerRun is the live recorder\'s cap',
     recorder.maxEvents === TELEMETRY.maxEventsPerRun && TELEMETRY.maxEventsPerRun >= 1000, `${recorder.maxEvents}`);

  // The classifier, without a bus.
  const k = createTelemetryCounters();
  countEvent(k, { type: EVENTS.GRIP_ENDED, reason: 'released' });
  countEvent(k, { type: EVENTS.GRIP_ENDED, reason: 'stretched' });
  countEvent(k, { type: EVENTS.STRAP_CHANGED, state: 'slack', anchorId: 'a1', strapId: 's1' });
  countEvent(k, { type: EVENTS.STRAP_CHANGED, state: 'slack', strapId: 's1' });
  countEvent(k, { type: EVENTS.STRAP_CHANGED, state: 'failed', strapId: 's1' });
  countEvent(k, { type: EVENTS.CARGO_STATE, loaded: true });
  countEvent(k, { type: EVENTS.CARGO_STATE, loaded: false });
  ok('R1g countEvent: a release is not a drop, an attach is a placement, a ratchet-slack is not',
     k.drops === 1 && k.straps.placed === 1 && k.straps.failed === 1 && k.cargo.loaded === 1 && k.cargo.unloaded === 1,
     JSON.stringify(k));
}

/* ── R2. one key per §27.4 signal ─────────────────────────────────────────── */
lines.push('--- R2. the run summary round-trips and names every §27.4 signal ---');
{
  const s = M.runSummary();
  let rt = null, threw = null;
  try { rt = JSON.parse(JSON.stringify(s)); } catch (e) { threw = e; }
  ok('R2 JSON.parse(JSON.stringify(M.runSummary())) round-trips', !!rt && !threw, threw && threw.message);
  const top = ['phases', 'counters', 'complete', 'restarts', 'questionnaire', 'events', 'build', 'seed', 'contractId', 'invoice'];
  const missingTop = top.filter((k) => !(k in rt));
  ok('R2 …with keys phases, counters, complete, restarts, questionnaire (and build, seed, events, invoice)',
     missingTop.length === 0, 'missing ' + missingTop.join(','));
  const ck = ['grips', 'drops', 'recoveries', 'damageEvents', 'straps', 'cargo', 'trips', 'worstCargoShift'];
  const missingC = ck.filter((k) => !(k in rt.counters));
  ok('R2 …and counters.{grips,drops,recoveries,damageEvents,straps,cargo,trips,worstCargoShift} — one per §27.4 signal',
     missingC.length === 0, 'missing ' + missingC.join(','));
  // Phase 11 build-side M14: the property ledger's count, apart from damageEvents (R1c).
  ok('R2e M14: counters.propertyEvents is a number — the second ledger counted apart from damageEvents',
     typeof rt.counters.propertyEvents === 'number' && rt.counters.propertyEvents === game.state.ledger.propertyDamage.length,
     `${rt.counters.propertyEvents} vs ${game.state.ledger.propertyDamage.length}`);
  ok('R2a phases has every §3.4 phase, as numbers',
     Object.values(PHASES).every((p) => typeof rt.phases[p] === 'number'), JSON.stringify(rt.phases));
  ok('R2b before a settlement: invoice null, questionnaire null, restarts 0, complete false, trips 1',
     rt.invoice === null && rt.questionnaire === null && rt.restarts === 0 && rt.complete === false && rt.counters.trips === 1,
     JSON.stringify({ invoice: rt.invoice, q: rt.questionnaire, restarts: rt.restarts, complete: rt.complete, trips: rt.counters.trips }));
  ok('R2c the summary is a snapshot: its events are a copy, not the recorder\'s array',
     Array.isArray(s.events) && s.events !== recorder.events && s.events.length === recorder.events.length);
  ok('R2d game.state.telemetry (counters included) is plain serializable data (§22.4)',
     (() => { try { const t = JSON.parse(JSON.stringify(game.state.telemetry)); return typeof t.counters.grips === 'number'; } catch (e) { return false; } })());
}

/* ── R3. grips and drops agree with the events ────────────────────────────── */
lines.push('--- R3. one grab, one release, one forced drop (m2 F8 pattern) ---');
{
  const box = byDef('box_small_01');
  parkAt(box, -30, box.def.dimensions.y / 2 + 0.02, 30);
  step(30);
  const c0 = { ...counters() };
  const i0 = recorder.events.length;
  const t = game.clock.simTimeMs;
  lookAt(me(), standOffFrom(posOf(box), 1.3), posOf(box));
  const g1 = me().grips.tryGrab('right', me().id, t);
  ok('R3 fixture: the box is grabbed', !!g1 && box.state.held, g1 ? 'held' : 'no grip');
  step(10);
  me().grips.release('right', 'released', t);
  step(5);
  lookAt(me(), standOffFrom(posOf(box), 1.3), posOf(box));
  const g2 = me().grips.tryGrab('right', me().id, t);
  ok('R3 fixture: …grabbed again', !!g2, g2 ? 'held' : 'no grip');
  step(10);
  me().grips.releaseAll('dropped');            // the forced drop (m2 F8)
  step(5);
  const since = recorder.events.slice(i0);
  const started = countType(since, EVENTS.GRIP_STARTED);
  const c = counters();
  ok('R3 counters.grips === count of GRIP_STARTED in recorder.events === 2',
     c.grips - c0.grips === 2 && started === 2, `counters ${c.grips - c0.grips}, events ${started}`);
  eq('R3 counters.drops === 1 (GRIP_ENDED.reason !== \'released\')', c.drops - c0.drops, 1);
  const reasons = since.filter((e) => e.type === EVENTS.GRIP_ENDED).map((e) => e.reason);
  deep('R3a …the two GRIP_ENDED reasons are released, dropped', reasons, ['released', 'dropped']);
  ok('R3b the box now records everHeld (M2 found the write missing; heaviestMoved read it)',
     box.state.everHeld === true);
  const st = M.runSummary().stats;
  ok('R3c …so contributionStats.heaviestMoved is at least the box\'s mass',
     st && st.heaviestMoved >= box.def.mass, st && `${st.heaviestMoved} kg`);
}
emit('R4...');

/* ── R4. recovery is one stream; cargo motion is measured; settlement agrees ── */
lines.push('--- R4. recoveries, cargo motion and the settlement tally (GDD §18.3, §27.4) ---');
{
  const spy = [];
  const off = bus.on(EVENTS.RECOVERY, (e) => spy.push(e));
  const wardrobe = byDef('wardrobe_01');
  const c0 = { ...counters() };
  registry.recover(wardrobe);
  eq('R4 registry.recover(entity) emits exactly one RECOVERY', spy.length, 1);
  eq('R4 …with fee === ECONOMY.recoveryFee', spy[0] && spy[0].fee, ECONOMY.recoveryFee);
  ok('R4a …naming the entity, stamped with the clock',
     spy[0] && spy[0].entityId === wardrobe.id && spy[0].simTimeMs === game.clock.simTimeMs,
     spy[0] && `${spy[0].entityId} @ ${spy[0].simTimeMs}`);
  // The case the old before/after diff missed: a mover recovery BETWEEN steps.
  me().controller.recoverNow('m17');
  frames(2);
  eq('R4b a mover recoverNow() between frames is announced on the next step', spy.length, 2);
  ok('R4b …with the same fee (was 0 until M6) and the mover\'s id',
     spy[1] && spy[1].fee === ECONOMY.recoveryFee && spy[1].entityId === me().id,
     spy[1] && `${spy[1].entityId} fee ${spy[1].fee}`);
  frames(5);
  eq('R4c …and once only: no repeat on later steps', spy.length, 2);
  eq('R4c counters.recoveries counted both', counters().recoveries - c0.recoveries, 2);
  off();

  // An unstrapped fridge in the truck, then the drive: §27.4 "cargo motion".
  const fridge = byDef('fridge_01');
  parkAt(fridge, M.truckPose.x, I.minY + 0.90, I.maxZ - 0.6);
  frames(70);
  ok('R4 fixture: the fridge is loaded, unstrapped', fridge.state.loaded && !cargo.isSecured(fridge));
  const cab = cabPoint();
  lookAt(me(), standOffFrom(cab, 1.4), cab, true);
  const d0 = recorder.events.length;
  const depart = interact.act(me());
  eq('R4 fixture: E at the cab departs', game.state.phase, PHASES.TRANSIT);
  frames(routeSteps() + 1);
  eq('R4 fixture: the route arrives into DELIVERY', game.state.phase, PHASES.DELIVERY);
  const c = counters();
  const hist = {};
  for (const e of recorder.events.slice(d0)) hist[e.type] = (hist[e.type] || 0) + 1;
  lines.push(`      events during the drive: ${JSON.stringify(hist)}`);
  ok('R4d §27.4 cargo motion: worstCargoShift is a finite metre figure over the loaded items',
     Number.isFinite(c.worstCargoShift) && c.worstCargoShift >= 0 && c.cargo.measured >= 1,
     `${c.worstCargoShift.toFixed(3)} m worst, ${c.cargo.shifted} of ${c.cargo.measured} past tolerance`);
  eq('R4e …and the three §13.3 road events were counted', c.roadEvents, 3);
  /* The route's payload carries `type: ev.type` and EventBus.emit spreads the payload over
   * the envelope, so on the bus a ROAD_FORCE is stamped 'hardBrake'/'sharpTurn'/'speedBump'.
   * Recorded here so the day route.js renames the key, this line flips and says so. */
  const asRoadForce = recorder.events.slice(d0).filter((e) => e.type === EVENTS.ROAD_FORCE).length;
  lines.push(`      NOTE: ${asRoadForce} of the 3 road events arrived stamped ROAD_FORCE (route.js used to shadow the envelope's type — fixed at integration, envelope keys win; ` +
             `the recorder recognises them by the TRUCK.roadEvents table)`);
  lines.push(`      drive "${depart}": worst shift ${c.worstCargoShift.toFixed(3)} m, ${c.cargo.shifted}/${c.cargo.measured} shifted, ` +
             `${c.roadEvents} road events, loaded ${c.cargo.loaded} unloaded ${c.cargo.unloaded}`);

  unloadEverything();
  drainNotices();
  M.settle();
  const rs = M.runSummary();
  eq('R4 counters.recoveries === recoveryCount() at settlement', rs.counters.recoveries, M.recoveryCount());
  eq('R4 …which is the two above', rs.counters.recoveries, 2);
  const recLine = rs.invoice.lines.find((l) => l.kind === LINE_KINDS.RECOVERY);
  ok('R4f …and the invoice bills exactly those (2 × ECONOMY.recoveryFee)',
     !!recLine && Math.abs(Math.abs(recLine.amount) - 2 * ECONOMY.recoveryFee) < 1e-9,
     recLine ? `${recLine.amount}` : 'no recovery line');
  const sum = M.manifestSummary(game.state.manifest);
  ok('R4g the summary\'s completion is the manifest\'s',
     rs.complete === sum.complete && rs.delivered === sum.delivered && rs.total === sum.total,
     `${rs.delivered}/${rs.total} complete=${rs.complete}`);
  ok('R4h phases.transit is the drive (within one step of routeSteps × 16.667 ms)',
     Math.abs(rs.phases.transit - routeSteps() * STEP) <= STEP + 1,
     `${rs.phases.transit} ms`);
  ok('R4i the exported invoice is money to the cent and names its lines',
     rs.invoice.profit === Math.round(invoiceNow().profit * 100) / 100 && rs.invoice.lines.length >= 3,
     `${rs.invoice.profit}`);
  lines.push(`      settlement: ${rs.delivered}/${rs.total} delivered, profit ${rs.invoice.profit}, ` +
             `${rs.events.length} events (${rs.eventsDropped} dropped), grips ${rs.counters.grips} drops ${rs.counters.drops}`);
}
emit('R5...');

/* ── R5. three settle→replay cycles ───────────────────────────────────────── */
lines.push('--- R5. three settle -> replay cycles: bounded, closed, kept (GDD §26.6, §27.4) ---');
{
  const perRun = [];
  // Run 1 is settled (R4). Answer it, replay, play a short run, settle; three times over.
  for (let r = 1; r <= 3; r++) {
    answer('q3', r);                       // run r says "q3 = r", so the closed record is traceable
    const settledEvents = recorder.events.length;
    M.invoiceScreen.onReplay();
    const closed = recorder.lastRun;
    perRun.push({
      r, settledEvents, dropped: recorder.dropped,
      closedRestarts: closed && closed.restarts, closedQ3: closed && closed.questionnaire && closed.questionnaire.q3,
      closedEvents: closed && closed.events.length,
      restartsLive: recorder.restarts, eventsAfterReplay: recorder.events.length,
      kept: M.keptRuns.length, stored: load().runs.length,
    });
    frames(30);
    dropTv();
    drainNotices();
    M.settle();
    perRun[perRun.length - 1].nextSettledEvents = recorder.events.length;
  }
  for (const p of perRun) {
    lines.push(`      replay ${p.r}: ${p.settledEvents} events at settle, closed record restarts=${p.closedRestarts} q3=${p.closedQ3} events=${p.closedEvents}; ` +
               `after replay ${p.eventsAfterReplay} events, kept ${p.kept}, stored ${p.stored}; next run settled at ${p.nextSettledEvents}`);
  }
  ok('R5 recorder.events.length <= TELEMETRY.maxEventsPerRun at every settlement, nothing dropped',
     perRun.every((p) => p.settledEvents <= TELEMETRY.maxEventsPerRun && p.nextSettledEvents <= TELEMETRY.maxEventsPerRun && p.dropped === 0),
     perRun.map((p) => p.settledEvents).join(','));
  ok('R5 …and each replay starts the next run\'s list from the reset itself (SIM_RESET first)',
     perRun.every((p) => p.eventsAfterReplay >= 1 && p.eventsAfterReplay < p.settledEvents) &&
     recorder.lastRun && recorder.events.length > 0,
     perRun.map((p) => p.eventsAfterReplay).join(','));
  // We are now in run 4; the third replay closed run 3. The brief's "run 3" reading: after
  // the second replay, lastRun.restarts === 2 — perRun[1] is exactly that moment.
  eq('R5 recorder.lastRun.restarts === 2 on run 3 (the record closed by the second replay)', perRun[1].closedRestarts, 2);
  deep('R5a …and the closed records count 1, 2, 3 restarts in order', perRun.map((p) => p.closedRestarts), [1, 2, 3]);
  deep('R5b each closed record carries THAT run\'s answers (q3 = its run number)', perRun.map((p) => p.closedQ3), [1, 2, 3]);
  ok('R5c a closed record keeps its event list from the moment it was settled',
     perRun.every((p) => p.closedEvents >= 1 && p.closedEvents <= p.settledEvents), perRun.map((p) => p.closedEvents).join(','));
  eq('R5d M.runSummary().restarts on run 4 is 3', M.runSummary().restarts, 3);
  ok('R5e stored runs <= TELEMETRY.keepRuns, in memory and in the save, and equal',
     perRun.every((p) => p.kept <= TELEMETRY.keepRuns && p.stored <= TELEMETRY.keepRuns && p.kept === p.stored) &&
     M.keptRuns.length === load().runs.length,
     perRun.map((p) => `${p.kept}/${p.stored}`).join(','));
  const stored = load().runs;
  ok('R5f …the store holds the answers, compact (no event lists), with the invoice totals',
     stored.length >= 3 && stored.slice(-4, -1).every((x, i) => x.questionnaire && x.questionnaire.q3 === i + 1) &&
     stored.every((x) => !('events' in x) && typeof x.eventsRecorded === 'number'),
     JSON.stringify(stored.map((x) => [x.questionnaire && x.questionnaire.q3, x.eventsRecorded, x.invoice && x.invoice.profit])));
  // The cap bites: twenty records in, keepRuns out.
  const twenty = Array.from({ length: 20 }, (_, i) => compactRun({ ...M.runSummary(), restarts: i, events: [] }));
  eq('R5g sanitiseRuns keeps the newest TELEMETRY.keepRuns of twenty', sanitiseRuns(twenty).length, TELEMETRY.keepRuns);
  eq('R5g …the newest ones', sanitiseRuns(twenty)[TELEMETRY.keepRuns - 1].restarts, 19);
  const before = load();
  save({ ...before, runs: twenty });
  eq('R5h save() of twenty → load() gives TELEMETRY.keepRuns', load().runs.length, TELEMETRY.keepRuns);
  save({ ...before, runs: M.keptRuns });
  eq('R5h …store restored to the live kept runs', load().runs.length, M.keptRuns.length);
  // 'clear responses' — §27.4 "deletable".
  sheet().querySelector('[data-act=clear-runs]').click();
  ok('R5i the clear-responses button empties the kept runs in memory and in the store',
     M.keptRuns.length === 0 && load().runs.length === 0 && /no past runs/.test(sheet().querySelector('.kept').textContent),
     `${M.keptRuns.length}/${load().runs.length}`);
}
emit('R6...');

/* ── R6. the recorder never writes state ──────────────────────────────────── */
lines.push('--- R6. same seed, same script, with and without the recorder (GDD §22.3) ---');
{
  function scriptedRun() {
    if (M.invoiceScreen.visible) M.invoiceScreen.onReplay(); else { M.resetContract(); game.setPaused(false); }
    drainNotices();
    frames(20);
    const tv = byDef('tv_55_01');
    parkAt(tv, -38, tv.def.dimensions.y / 2 + 1.5, 30, Math.PI / 2);
    const box = byDef('box_small_01');
    parkAt(box, -35, box.def.dimensions.y / 2 + 1.0, 30);
    // M14: a second box into the front wall, so the property ledger is exercised too.
    const wallBox = [...registry.entities.values()].filter((e) => e.defId === 'box_small_01')[1];
    parkAt(wallBox, 1.60, 0.27, -1.50);
    wallBox.body.setLinvel({ x: 0, y: 0, z: -4.0 }, true);
    wallBox.body.wakeUp();
    frames(240);
    damage.flush(game.clock.simTimeMs);
    const inv = invoiceNow();
    return {
      lines: JSON.parse(JSON.stringify(inv.lines)),
      ledger: JSON.parse(JSON.stringify(game.state.ledger.itemDamage)),
      property: JSON.parse(JSON.stringify(game.state.ledger.propertyDamage)),   // M14
      profit: inv.profit,
      damageEvents: counters().damageEvents,
      recorded: recorder.attached ? recorder.events.length : null,
    };
  }
  recorder.detach();
  const A = scriptedRun();
  recorder.attach(bus);
  const B = scriptedRun();
  recorder.detach();
  const C = scriptedRun();
  recorder.attach(bus);
  lines.push(`      A (off): ${A.ledger.length} ledger lines, profit ${A.profit.toFixed(2)}; B (on): ${B.ledger.length}, ${B.profit.toFixed(2)}, ` +
             `${B.recorded} events; C (off): ${C.ledger.length}, ${C.profit.toFixed(2)}`);
  ok('R6 fixture: the script damages something', A.ledger.length >= 1 && B.ledger.length >= 1, `${A.ledger.length}/${B.ledger.length}`);
  deep('R6 with and without the recorder: buildInvoice().lines deep-equal', B.lines, A.lines);
  deep('R6 …and ledger.itemDamage deep-equal', B.ledger, A.ledger);
  // M14: the property ledger too, and it is not vacuous — the wall throw wrote a line.
  ok('R6c M14: …and ledger.propertyDamage deep-equal, with at least one line on it',
     deepEq(B.property, A.property) && A.property.length >= 1 && deepEq(A.property, C.property),
     `A ${JSON.stringify(A.property)} vs B ${JSON.stringify(B.property)}`);
  ok('R6a control: two unattached runs agree too (the reset replays deterministically)',
     deepEq(A.lines, C.lines) && deepEq(A.ledger, C.ledger));
  ok('R6b the detached run counted nothing and the attached run counted every ledger line',
     A.damageEvents === 0 && B.damageEvents === B.ledger.length && B.recorded >= 1,
     `off ${A.damageEvents}, on ${B.damageEvents}/${B.ledger.length}`);
}
emit('Q...');

/* ── Q1-Q4. the §27.3 questionnaire on the sheet ──────────────────────────── */
lines.push('--- Q1-Q4. the seven §27.3 questions, verbatim, under the invoice ---');
{
  drainNotices();
  M.settle();
  const qs = [...sheet().querySelectorAll('[data-q]')];
  eq('Q1 after M.settle(), #settlement contains 7 [data-q] controls', qs.length, 7);
  deep('Q1 …ids q1..q7 in order', qs.map((q) => q.dataset.q), ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7']);
  deep('Q1 …whose label text equals the §27.3 sentences, verbatim and in the GDD\'s order',
       qs.map((q) => q.querySelector('.qtext').textContent), GDD_27_3);
  deep('Q1a …and QUESTIONS (the module) says the same', QUESTIONS.map((q) => q.text), GDD_27_3);
  const kinds = qs.map((q) => q.dataset.kind);
  deep('Q1b Q2, Q3, Q4, Q5, Q7 are scales; Q1 and Q6 are short text',
       kinds, ['text', 'scale', 'scale', 'scale', 'scale', 'text', 'scale']);
  ok('Q1c every scale has 5 radios (1..5) and two text anchors — colour-independent (§26.5)',
     qs.filter((q) => q.dataset.kind === 'scale').every((q) =>
       q.querySelectorAll('input[type=radio]').length === 5 &&
       [...q.querySelectorAll('input[type=radio]')].map((r) => r.value).join('') === '12345' &&
       q.querySelectorAll('.anchor').length === 2 && [...q.querySelectorAll('.anchor')].every((a) => a.textContent.trim().length > 0)));
  ok('Q1d the text questions are bounded inputs (maxlength = TELEMETRY.textMax)',
     qs.filter((q) => q.dataset.kind === 'text').every((q) => {
       const i = q.querySelector('input[type=text]'); return !!i && Number(i.maxLength) === TELEMETRY.textMax;
     }));
  const stats = sheet().querySelector('.stats'), form = sheet().querySelector('form.questionnaire'), replay = sheet().querySelector('[data-act=replay]');
  ok('Q1e the form sits under .stats and above the replay button, inside the sheet',
     !!stats && !!form && !!replay &&
     !!(stats.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING) &&
     !!(form.compareDocumentPosition(replay) & Node.DOCUMENT_POSITION_FOLLOWING) &&
     !!form.closest('.sheet'));
  ok('Q1f Skip, Copy and clear-responses buttons exist, and the export textarea starts hidden',
     !!sheet().querySelector('[data-act=skip]') && !!sheet().querySelector('[data-act=copy]') &&
     !!sheet().querySelector('[data-act=clear-runs]') && sheet().querySelector('textarea.export').hidden === true);
  eq('Q1g nothing answered → readAnswers(form) is null', readAnswers(form), null);

  M.invoiceScreen.onReplay();
  eq('Q2 onReplay() with no answers → phase pickup (m11 G8 unchanged)', game.state.phase, 'pickup');
  ok('Q2 …unpaused, and the closed record\'s questionnaire is null',
     !game.state.paused && recorder.lastRun && recorder.lastRun.questionnaire === null);

  frames(30);
  drainNotices();
  M.settle();
  answer('q3', 4);
  answer('q6', 'the couch');
  const storedAfterAnswer = load().runs;
  ok('Q3 …an answer is persisted as it is given (the kept run for THIS settlement carries it)',
     storedAfterAnswer.length >= 1 && storedAfterAnswer[storedAfterAnswer.length - 1].questionnaire &&
     storedAfterAnswer[storedAfterAnswer.length - 1].questionnaire.q3 === 4 &&
     storedAfterAnswer[storedAfterAnswer.length - 1].questionnaire.q6 === 'the couch',
     JSON.stringify(storedAfterAnswer[storedAfterAnswer.length - 1] && storedAfterAnswer[storedAfterAnswer.length - 1].questionnaire));
  sheet().querySelector('[data-act=copy]').click();
  const ta = sheet().querySelector('textarea.export');
  let parsed = null, perr = null;
  try { parsed = JSON.parse(ta.value); } catch (e) { perr = e; }
  ok('Q3 click [data-act=copy] → the textarea holds JSON that parses', !!parsed, perr && perr.message);
  ok('Q3 …with questionnaire.q3 === 4 and questionnaire.q6 === \'the couch\'',
     parsed && parsed.questionnaire && parsed.questionnaire.q3 === 4 && parsed.questionnaire.q6 === 'the couch',
     parsed && JSON.stringify(parsed.questionnaire));
  const inv = invoiceNow();
  ok('Q3 …and invoice.profit to 2 decimals',
     parsed && parsed.invoice && parsed.invoice.profit === Math.round(inv.profit * 100) / 100,
     parsed && parsed.invoice && `${parsed.invoice.profit} vs ${inv.profit}`);
  ok('Q3a …pretty-printed (§27.4 "human-readable"): it contains "phases" on its own line',
     /\n\s+"phases": \{/.test(ta.value), ta.value.slice(0, 80));
  ok('Q3b …with the event list, the phases and the counters', parsed && Array.isArray(parsed.events) && parsed.events.length >= 1 &&
     parsed.phases && parsed.counters && typeof parsed.counters.grips === 'number');
  deep('Q3c M.runSummary().questionnaire is the same answers', M.runSummary().questionnaire, { q3: 4, q6: 'the couch' });
  ok('Q3d the report\'s events are the events the sheet was shown with (the settle-time snapshot)',
     parsed && parsed.events.length === M.invoiceScreen.report().events.length);

  M.invoiceScreen.onReplay();
  ok('Q4 replay closes the record WITH the answers', recorder.lastRun && recorder.lastRun.questionnaire &&
     recorder.lastRun.questionnaire.q3 === 4 && recorder.lastRun.questionnaire.q6 === 'the couch',
     JSON.stringify(recorder.lastRun && recorder.lastRun.questionnaire));
  eq('Q4 …and runSummary().questionnaire is null again mid-run', M.runSummary().questionnaire, null);
  frames(30);
  drainNotices();
  M.settle();
  const form2 = sheet().querySelector('form.questionnaire');
  ok('Q4 after replay and a second settle the form is empty',
     form2.querySelectorAll('input:checked').length === 0 &&
     [...form2.querySelectorAll('input[type=text]')].every((i) => i.value === ''));
  eq('Q4 …and runSummary().questionnaire === null', M.runSummary().questionnaire, null);
  // Skip: an unanswered form, however it got that way, is null.
  answer('q2', 5);
  sheet().querySelector('[data-act=skip]').click();
  ok('Q4a Skip collapses the questions and drops what was ticked (null, never a row of 3s)',
     M.runSummary().questionnaire === null && form2.classList.contains('skipped'));
}
emit('Q5...');

/* ── Q5. keys typed into the form never reach the game ────────────────────── */
lines.push('--- Q5. the form swallows its keys (Input, the title and the settings card all listen on window) ---');
{
  ok('Q5 fixture: settlement is paused and the title is gone', game.state.paused === true && !M.title.visible);
  const box = sheet().querySelector('input[name="q6"]');
  box.focus();
  const key = (code, target) => target.dispatchEvent(new KeyboardEvent('keydown', { code, key: code === 'Escape' ? 'Escape' : code.slice(-1), bubbles: true, cancelable: true }));
  key('Escape', box);
  const sawPause = input.isDown('pause', 0);
  game.frame(FRAME);
  ok('Q5 dispatching KeyboardEvent Escape with the text field focused leaves game.state.paused unchanged',
     game.state.paused === true && !sawPause, `paused=${game.state.paused} input saw pause=${sawPause}`);
  key('KeyW', box);
  ok('Q5a …and a W typed there is not a moveForward for the mover', input.isDown('moveForward', 0) === false);
  box.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w', bubbles: true }));
  const ta = sheet().querySelector('textarea.export');
  ta.hidden = false; ta.focus();
  key('Escape', ta);
  game.frame(FRAME);
  ok('Q5b …the same for the export textarea', game.state.paused === true && !input.isDown('pause', 0));
  // Control: the same event on window IS the pause key — the guard is the form, not a dead key.
  key('Escape', window);
  const control = input.isDown('pause', 0);
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Escape', key: 'Escape', bubbles: true }));
  game.frame(FRAME);                          // consumes the shell edge, whatever it does
  ok('Q5c control: Escape dispatched on window does reach Input', control === true);
  game.setPaused(true);                       // back to the settled state for Q6
  ok('Q5d nothing threw and no error banner appeared', !document.getElementById('err-banner'));
}

/* ── Q6. a refused store ───────────────────────────────────────────────────── */
lines.push('--- Q6. localStorage accessor throwing → the sheet, the questions and the copy all work ---');
{
  const desc = Object.getOwnPropertyDescriptor(window, 'localStorage');
  const original = window.localStorage;
  Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('storage denied'); } });
  let threw = null;
  try {
    let probe = false;
    try { void window.localStorage; } catch (e) { probe = true; }
    ok('Q6 fixture: the accessor throws', probe);
    try {
      M.invoiceScreen.onReplay();
      frames(30);
      drainNotices();
      M.settle();
    } catch (e) { threw = e; }
    ok('Q6 settle() with a throwing store does not throw', !threw, threw && threw.message);
    eq('Q6 …the questionnaire renders (7 controls)', sheet().querySelectorAll('[data-q]').length, 7);
    answer('q7', 2);
    sheet().querySelector('[data-act=copy]').click();
    let parsed = null;
    try { parsed = JSON.parse(sheet().querySelector('textarea.export').value); } catch (e) { parsed = null; }
    ok('Q6 …and copy works: the textarea parses and carries the answer',
       parsed && parsed.questionnaire && parsed.questionnaire.q7 === 2, parsed && JSON.stringify(parsed.questionnaire));
    ok('Q6a …the kept-runs line still renders and clear does not throw',
       (() => { try { sheet().querySelector('[data-act=clear-runs]').click(); return true; } catch (e) { return false; } })());
    eq('Q6b load() with a throwing accessor is the defaults (runs [])', load().runs.length, 0);
    ok('Q6c no error banner', !document.getElementById('err-banner'));
  } finally {
    if (desc) Object.defineProperty(window, 'localStorage', desc);
    else Object.defineProperty(window, 'localStorage', { configurable: true, get() { return original; } });
  }
  let back = false;
  try { back = !!window.localStorage; } catch (e) { back = false; }
  ok('Q6d the store is back', back);
}
emit('perf...');

/* ── P. the recorder inside the fixed step ────────────────────────────────── */
lines.push('--- P. systemMs with and without the recorder (GDD §26.6 frame budget) ---');
{
  M.invoiceScreen.onReplay();
  drainNotices();
  const median = (xs) => { const s = xs.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  function sample(n) {
    const xs = [];
    for (let k = 0; k < n; k++) { game.frame(FRAME); xs.push(game.stats.systemMs); }
    return xs;
  }
  frames(30);                                     // warm
  recorder.detach();
  const off = sample(600);
  recorder.attach(bus);
  const on = sample(600);
  const dMed = Math.abs(median(on) - median(off)), dMean = Math.abs(mean(on) - mean(off));
  lines.push(`      systemMs over 600 frames: recorder off median ${median(off).toFixed(3)} ms (mean ${mean(off).toFixed(3)}), ` +
             `on median ${median(on).toFixed(3)} ms (mean ${mean(on).toFixed(3)}); ${on.length + off.length} frames, ` +
             `${recorder.events.length} events recorded this run` +
             (mean(off) === 0 && mean(on) === 0 ? ' — NOTE: performance.now() reads 0 under virtual time; the bound is vacuous here' : ''));
  ok('P1 systemMs over 600 frames within 0.2 ms of the unattached run (median)', dMed <= 0.2, `Δ median ${dMed.toFixed(3)} ms`);
  ok('P1a …and within 0.2 ms on the mean', dMean <= 0.2, `Δ mean ${dMean.toFixed(3)} ms`);
  ok('P2 the recorder is attached again and the run is being recorded', recorder.attached && recorder.events.length >= 1);
}

/* ── Z. teardown ───────────────────────────────────────────────────────────── */
ok('Z1 no error banner during the suite', !document.getElementById('err-banner'));

} catch (e) {
  fails++;
  lines.push(`FAIL  suite threw  <- ${e && e.message}`);
  lines.push((e && e.stack || '').split('\n').slice(0, 6).join('\n'));
}

try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* nothing to clear */ }
emit();
