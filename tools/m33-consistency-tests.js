/* Phase 11 build-side M26 suite — consistency pass two.
 *
 * Four things the codebase said and did not do, each found by a milestone that could not fix
 * it because the file was somebody else's (KNOWN_ISSUES Phases 17, 21 and 23):
 *
 *   C1  §15.3 "heaviest thing moved" counted only what was LOADED or RECOVERED, because
 *       entity.state.everHeld — read by heaviestMoved(), cleared by respawnContract — was
 *       written by nobody on the grab. A couch carried across the house and set down again
 *       did not count. It is written in grip.js now, on the grab itself.
 *   C2  §8.4's notices expired against performance.now() while §21.4's captions (M9) already
 *       ran on the sim clock: two clocks for two lines of the same HUD. Under the pause card
 *       a notice kept counting down; under headless virtual time nothing expired at all and
 *       the soak watched one 'new contract' notice per replay pile up. One clock now.
 *   C3  §26.3 asks for "observably different turn, brake AND bump results" and the bump was a
 *       null — 0.000 m for every pack. It unloads the deck now instead of pushing hard; the
 *       three packs' bump column is m25 K9's, and this section pins the composition and the
 *       two readings that say it is not a second brake.
 *   C4  §15.3 "who was holding it" was recorded on every property line since M14 and read by
 *       nothing. The sheet names the seat in co-op, and says nothing in solo (§21.1).
 *   C5  …and all of it stays plain, serializable data (§22.4, m0 E8).
 *
 * Fixtures: placeMover/lookAt/grabWith/step from tools/m30-force-tests.js, parkAt/freshRun
 * from tools/m22-property-tests.js (the names are kept so the lineage stays greppable).
 */

import { SIM, NOTICE, TRUCK, CARGO, DAMAGE, INVOICE } from '../src/config.js';
import { EVENTS } from '../src/core/eventBus.js';
import { PROTOTYPE_ROUTE } from '../src/drive/route.js';
import { holdersOf, seatWordFor, propertyHolders } from '../src/contract/invoice.js';
import { recapFrom } from '../src/ui/invoiceScreen.js';

const lines = [];
let passes = 0, fails = 0;
function ok(name, cond, detail = '') {
  if (cond) { passes++; lines.push(`PASS  ${name}`); }
  else { fails++; lines.push(`FAIL  ${name}${detail ? '  <- ' + detail : ''}`); }
}
const eq = (n, a, b) => ok(n, a === b, `got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const near = (n, a, b, tol) => ok(n, Math.abs(a - b) <= tol, `${a} vs ${b} (tol ${tol})`);

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
let M;
try { M = await window.__MFH_READY; }
catch (e) {
  fails++; lines.push(`FAIL  boot threw  <- ${e && e.message}`);
  lines.push((e && e.stack || '').split('\n').slice(0, 6).join('\n'));
  emit(); throw e;
}

const { game, physics, registry, damage, movers, huds, hud, invoiceScreen, interact, straps, cargo } = M;
const bus = game.bus;
const STEP = SIM.stepMs;
const FRAME = 16.667;

const byDef = (id) => { for (const e of registry.entities.values()) if (e.defId === id) return e; return null; };
const posOf = (e) => { const t = e.body.translation(); return { x: t.x, y: t.y, z: t.z }; };
const prop = () => game.state.ledger.propertyDamage;
function frames(n) { for (let k = 0; k < n; k++) game.frame(FRAME); }
/**
 * m30's system-level step, and the reason this suite needs one: main.js's `movers` system
 * reads the INPUT's grip intent every frame and releases any hand the input is not asking
 * for, so a suite that calls grips.tryGrab() by hand and then game.frame() loses the grip on
 * the very next frame (measured — the dresser travelled 0.000 m and the property line read
 * heldBy []). game.frame() is still what drives the sim CLOCK for section C2; anything with a
 * hand on it is driven here. Same order as main.js's systems.
 */
function step(n = 1, intents = {}) {
  for (let i = 0; i < n; i++) {
    physics.clearForces();
    for (const m of movers) {
      const it = intents[m.id] || {};
      const yaw = it.yaw !== undefined ? it.yaw : m.grips.aimYaw;
      m.grips.step(STEP, { brace: !!it.brace, simTimeMs: game.clock.simTimeMs });
      m.controller.step(STEP, {
        move: it.move || { x: 0, y: 0 },
        forward: { x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw) },
        right: { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) },
        run: false, brace: !!it.brace, jump: false, recover: false,
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
function parkAt(e, x, y, z, yaw = 0) {
  e.body.setTranslation({ x, y, z }, true);
  e.body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
  e.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  e.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  e.body.wakeUp();
  physics.primeQueries();
}
/** m30's placeMover: a hard teleport that also clears the controller's carried-load state. */
function placeMover(m, x, z, y = 0.2) {
  m.controller.hardSetPosition({ x, y, z });
  m.controller._vel.x = 0; m.controller._vel.z = 0;
  m.controller.velocityY = 0; m.controller._climb = null;
  m.controller.carriedMass = 0; m.controller.resistedForce = 0;
  m.controller.pull.x = 0; m.controller.pull.z = 0;
  m.controller.imbalance = 0; m.controller.exertion = 0; m.controller._downMs = 0;
}
/** m30's lookAt/grabWith: stand there, point the rig's own camera at the point, grab. */
function lookAt(m, from, target) {
  placeMover(m, from.x, from.z, from.y !== undefined ? from.y : 0.2);
  const p = m.controller.position;
  m.rig.yaw = Math.atan2(-(target.x - p.x), -(target.z - p.z));
  m.rig.pitch = Math.atan2(target.y - (p.y + 1.4), Math.hypot(target.x - p.x, target.z - p.z));
  m.rig._first = true;
  for (let k = 0; k < 20; k++) m.rig.update(p, 1 / 60);
  const c = m.camera.position;
  m.rig.yaw = Math.atan2(-(target.x - c.x), -(target.z - c.z));
  m.rig.pitch = Math.atan2(target.y - c.y, Math.hypot(target.x - c.x, target.z - c.z));
  m.grips.syncAim();
  physics.primeQueries();
}
function grabWith(m, hand, target) {
  m.grips.syncAim();
  return m.grips.tryGrab(hand, m.id, game.clock.simTimeMs);
}
/** Stand somewhere the ray can actually see the thing and take hold of it. The probe starts
 *  at the CAMERA (grip.js), 3-4 m behind the mover, so one stand-off can be blocked by the
 *  architecture behind the player's back; four are not. Returns the grip or null. */
function reachFor(m, e, hand = 'right', r = 1.35, offsets = null) {
  const t = posOf(e);
  const tries = offsets || [{ x: 0, z: r }, { x: r, z: 0 }, { x: 0, z: -r }, { x: -r, z: 0 }];
  for (const off of tries) {
    lookAt(m, { x: t.x + off.x, z: t.z + off.z, y: 0.2 }, t);
    step(3);
    const g = grabWith(m, hand, t);
    if (g && g.entityId === e.id) return g;
    m.grips.release(hand, 'released', game.clock.simTimeMs);
  }
  return null;
}
const releaseAll = () => { for (const m of movers) m.grips.releaseAll('released', game.clock.simTimeMs); };
function parkMoversAway() { movers.forEach((m, i) => placeMover(m, -26 - i * 2, 26)); }
function drainPending() { const n = M.pendingNotices.length; M.pendingNotices.splice(0, n); return n; }
function clearNotices() { drainPending(); for (const h of huds) { h._notices.length = 0; h._renderNotices(); } }
function freshRun() {
  if (invoiceScreen.visible) invoiceScreen.onReplay(); else { M.resetContract(); game.setPaused(false); }
  clearNotices();
}
const liveHeaviest = () => M.runSummary().stats.heaviestMoved;
/** main.js's seatOfPlayer, as the sheet passes it to recapFrom: a MOVER ID -> seat index. */
const seatOfId = (id) => { const i = movers.findIndex((m) => m.id === id); return i >= 0 ? M.seatOfMover(i) : -1; };

try {
/* ── C1. everHeld is written on the grab (§15.3, KNOWN_ISSUES Phase 17) ────── */
lines.push('--- C1. "heaviest thing moved" counts what was CARRIED (GDD §15.3; the flag nobody wrote) ---');
{
  freshRun();
  frames(20);
  const dresser = byDef('dresser_01');
  const fridge = byDef('fridge_01');
  eq('m33 C1-0 the dresser is 55 kg and the fridge 110 kg (the two that decide the stat)', `${dresser.def.mass}/${fridge.def.mass}`, '55/110');
  ok('m33 C1-0 …and nothing has been carried, loaded or recovered yet, so heaviestMoved() is 0',
     liveHeaviest() === 0 && [...registry.entities.values()].every((e) => !e.state.everHeld && !e.state.loaded),
     `${liveHeaviest()} kg`);

  /* Park it on open ground in front of the house — the driveway, clear of the tool rack at
   * (−2.40, 9.00) and of the truck — so the grab is about the grab and not about what the
   * camera behind the player's back happened to be inside. */
  parkAt(dresser, -2.0, 0.45, 6.5);
  frames(40);
  const d0 = posOf(dresser);
  const g = reachFor(movers[0], dresser, 'right');
  ok('m33 C1a a grab that finds the dresser succeeds', !!g && g.entityId === dresser.id, g ? g.entityId : 'no grip');
  eq('m33 C1a …and sets everHeld ON THE GRAB, before a single step runs', dresser.state.everHeld, true);
  eq('m33 C1b …so heaviestMoved() is the dresser\'s 55 kg with nothing loaded and nothing recovered', liveHeaviest(), 55);

  /* Carry it across the room and set it down. Two hands: 55 kg needs 540 N against the
   * one-hand budget of ~358 N (§6.4), and this is a carry, not a drag. The mover walks in
   * 0.2 m steps so no single frame outruns GRIP.maxStretch. */
  movers[0].grips.tryGrab('left', movers[0].id, game.clock.simTimeMs);
  const before = posOf(dresser);
  const moved = () => Math.hypot(posOf(dresser).x - before.x, posOf(dresser).z - before.z);
  const backAway = { [movers[0].id]: { move: { x: 0, y: -1 }, yaw: movers[0].grips.aimYaw } };
  for (let k = 0; k < 40 && moved() < 2.0; k++) step(10, backAway);
  const carried = moved();
  const stillHeld = dresser.state.held;
  releaseAll();
  step(60);
  lines.push(`      the dresser travelled ${carried.toFixed(2)} m in seat 0's hands (still held at the end of the walk: ${stillHeld}) and was set down again`);
  ok(`m33 C1c carried and set down again — the dresser moved ${carried.toFixed(2)} m (the brief's 2 m, less a 5 % walk tolerance) and is in no hand`,
     carried >= 1.9 && !dresser.state.held, `${carried.toFixed(3)} m, held ${dresser.state.held}`);
  eq('m33 C1c …everHeld survives the release (it is a record, not a live flag)', dresser.state.everHeld, true);
  eq('m33 C1c …and heaviestMoved() is still 55 — the stat counts what was CARRIED, not only what was loaded', liveHeaviest(), 55);
  eq('m33 C1d a heavier object nobody touched does not count', fridge.state.everHeld, false);

  // A grab that fails writes nothing.
  parkMoversAway();
  frames(2);
  const far = byDef('tv_55_01');
  const before2 = far.state.everHeld;
  const gFail = grabWith(movers[0], 'left', posOf(far));
  ok('m33 C1e a grab that finds nothing (out of reach) returns null…', gFail === null, JSON.stringify(gFail));
  ok('m33 C1e …and sets everHeld on nothing', far.state.everHeld === before2 && far.state.everHeld === false, `${far.state.everHeld}`);

  // The run summary and the settlement read the SAME number.
  const live = liveHeaviest();
  M.settle();
  const report = invoiceScreen.report();
  eq('m33 C1f the run summary\'s heaviestMoved is the settlement\'s stat', report.stats.heaviestMoved, live);
  const statText = [...invoiceScreen.el.querySelectorAll('.stat')].map((n) => n.textContent).join(' | ');
  ok(`m33 C1f …and the sheet prints it: "heaviest thing moved ${Math.round(live)} kg"`,
     new RegExp(`heaviest thing moved\\s*${Math.round(live)} kg`).test(statText), statText);

  // The replay clears it.
  freshRun();
  frames(5);
  eq('m33 C1g respawnContract clears everHeld…', byDef('dresser_01').state.everHeld, false);
  eq('m33 C1g …and heaviestMoved() is 0 again', liveHeaviest(), 0);
  ok('m33 C1g …on every contract entity, not just the one that was carried',
     [...registry.entities.values()].every((e) => e.state.everHeld === false),
     [...registry.entities.values()].filter((e) => e.state.everHeld !== false).map((e) => `${e.defId}=${e.state.everHeld}`).join(', '));
}
emit('C2...');

/* ── C2. notices run on the sim clock (§8.4, §21.4; KNOWN_ISSUES Phase 17) ─── */
lines.push('--- C2. §8.4 notices expire on SIM time, the clock M9\'s captions already used ---');
{
  freshRun();
  clearNotices();
  const t0 = game.clock.simTimeMs;
  const wall0 = performance.now();
  hud.notice('television — broken · 900.00', 'damage');
  eq('m33 C2a a notice is stamped against the SIM clock, not performance.now()', hud._notices[0].until, t0 + NOTICE.ttlMs);
  ok('m33 C2a …and NOTICE.ttlMs is config, not a literal in hud.js', NOTICE.ttlMs === 3200 && Object.isFrozen(NOTICE), `${NOTICE.ttlMs}`);

  // 200 frames of sim = 3333 ms > NOTICE.ttlMs. Sample either side of the TTL.
  const preFrames = Math.floor(NOTICE.ttlMs / FRAME);          // 191 -> 3183 ms, just inside
  for (let k = 0; k < preFrames; k++) { frames(1); M.drainNotices(); }
  const elapsed = game.clock.simTimeMs - t0;
  ok(`m33 C2b after ${preFrames} frames (${elapsed.toFixed(0)} ms of SIM time, still under ${NOTICE.ttlMs}) the notice is still up`,
     hud._notices.length === 1 && /900/.test(hud.notices.textContent), `${hud._notices.length} notices, ${elapsed.toFixed(0)} ms`);
  for (let k = 0; k < 200 - preFrames; k++) { frames(1); M.drainNotices(); }
  const elapsed2 = game.clock.simTimeMs - t0;
  ok(`m33 C2c …and after 200 frames (${elapsed2.toFixed(0)} ms, past the TTL) it is gone`,
     hud._notices.length === 0 && hud.notices.textContent === '', `${hud._notices.length} notices`);
  const wallMoved = performance.now() - wall0;
  lines.push(`      the wall clock moved ${wallMoved.toFixed(0)} ms while the sim moved ${elapsed2.toFixed(0)} ms — the expiry followed the sim (under --virtual-time-budget the two are unrelated)`);

  // Under the pause card the sim stops, so the notice stops with it.
  clearNotices();
  const tp = game.clock.simTimeMs;
  hud.notice('a strap gave way', 'damage');
  game.setPaused(true);
  for (let k = 0; k < 24; k++) { frames(1); M.drainNotices(); }         // 400 wall ms of frames
  eq('m33 C2d 400 ms of frames under the pause card advance the sim clock not at all', game.clock.simTimeMs, tp);
  eq('m33 C2d …so the notice is still there (it freezes with the rest of the simulation, like M9\'s captions)', hud._notices.length, 1);
  for (let k = 0; k < 300; k++) { frames(1); M.drainNotices(); }        // 5 s of frames, still paused
  eq('m33 C2e …and still there after 5 s of paused frames — a paused notice never ages out unread', hud._notices.length, 1);
  game.setPaused(false);
  for (let k = 0; k < 200; k++) { frames(1); M.drainNotices(); }
  eq('m33 C2f unpaused, it expires on schedule', hud._notices.length, 0);

  // The stack is bounded by config, and the drain feeds the M19 history and the M22 card.
  clearNotices();
  const t2 = game.clock.simTimeMs;
  for (let k = 0; k < NOTICE.maxStack + 3; k++) hud.notice(`notice ${k}`, 'info', t2);
  eq(`m33 C2g the stack is bounded by NOTICE.maxStack (${NOTICE.maxStack})`, hud._notices.length, NOTICE.maxStack);
  ok('m33 C2g …and it kept the NEWEST, not the oldest', /notice 6/.test(hud.notices.textContent) && !/notice 0/.test(hud.notices.textContent), hud.notices.textContent.replace(/\s+/g, ' ').trim());
  const h0 = M.noticeHistory.length;
  M.pendingNotices.push({ text: 'M19 still drains', kind: 'good' });
  M.drainNotices();
  ok('m33 C2h M19\'s drainNotices still shows a queued notice and still writes one history entry',
     M.noticeHistory.length === h0 + 1 && M.noticeHistory[M.noticeHistory.length - 1].text === 'M19 still drains' &&
     hud._notices.some((n) => n.text === 'M19 still drains'),
     `${M.noticeHistory.length - h0} history entries`);
  ok('m33 C2h …and stamps it with the sim time it went up', M.noticeHistory[M.noticeHistory.length - 1].tMs === game.clock.simTimeMs);
  clearNotices();
}
emit('C3...');

/* ── C3. the bump is an exam (§26.3, §11.3; KNOWN_ISSUES Phase 23) ─────────── */
lines.push('--- C3. the speed bump unloads the deck instead of pushing hard (the m25 K9 column\'s composition) ---');
{
  const B = TRUCK.roadEvents.speedBump, BR = TRUCK.roadEvents.hardBrake;
  const bumpDur = PROTOTYPE_ROUTE.find((e) => e.type === 'speedBump').durationS;
  const brakeDur = PROTOTYPE_ROUTE.find((e) => e.type === 'hardBrake').durationS;
  const g = -SIM.gravity;
  const lift = B.accel.y * B.severity * TRUCK.brakeForce;
  const push = B.accel.z * B.severity * TRUCK.brakeForce;
  const brakePush = BR.accel.z * BR.severity * TRUCK.brakeForce;
  lines.push(`      bump: lift ${lift.toFixed(2)} m/s² (${(100 * lift / g).toFixed(1)}% of g) · push ${push.toFixed(2)} m/s² over ${bumpDur} s; ` +
             `brake: push ${brakePush.toFixed(2)} m/s² over ${brakeDur} s; net weight on the deck during the bump ${(100 * (1 - lift / g)).toFixed(1)}%`);
  ok(`m33 C3a the bump has a longitudinal fraction at all now (accel.z ${B.accel.z}, was 0 — shiftByEvent.speedBump read 0.000 for every pack)`,
     B.accel.z > 0, JSON.stringify(B.accel));
  eq('m33 C3b …and it is EXACTLY half the brake\'s longitudinal fraction', B.accel.z, BR.accel.z / 2);
  ok('m33 C3c the bump is still MOSTLY VERTICAL — the lift fraction leads the nudge, and there is no lateral component',
     B.accel.y > B.accel.z && B.accel.x === 0, JSON.stringify(B.accel));
  ok(`m33 C3d the lift takes weight off without throwing the load: ${lift.toFixed(2)} < ${g.toFixed(2)} m/s², so ${(100 * (1 - lift / g)).toFixed(1)}% of the weight still presses the deck`,
     lift > 0.5 * g && lift < g, `${lift.toFixed(3)} vs ${g.toFixed(3)}`);
  ok(`m33 C3e …which is what makes half a brake enough: a 9 kg box's friction falls from ${(0.52 * g).toFixed(2)} to ${(0.52 * (g - lift)).toFixed(2)} m/s², under the ${push.toFixed(2)} the nudge applies`,
     0.52 * (g - lift) < push && 0.52 * g > push,
     `friction ${(0.52 * (g - lift)).toFixed(3)} vs push ${push.toFixed(3)}`);
  ok(`m33 C3f NOT a second brake, by impulse: ${(B.severity * B.accel.z * bumpDur).toFixed(2)} against the brake's ${(BR.severity * BR.accel.z * brakeDur).toFixed(2)} — ` +
     `${(100 * B.severity * B.accel.z * bumpDur / (BR.severity * BR.accel.z * brakeDur)).toFixed(0)}%, under half`,
     B.severity * B.accel.z * bumpDur <= 0.5 * BR.severity * BR.accel.z * brakeDur);
  eq('m33 C3g the bump\'s severity is untouched (the camera shake and the audio scale on it)', B.severity, 0.8);
  ok('m33 C3h the two events that already worked are untouched: brake +z 1.0, turn ±x 1.0, both at severity 1.0',
     BR.accel.z === 1.0 && BR.accel.y === 0 && BR.accel.x === 0 && BR.severity === 1.0 &&
     TRUCK.roadEvents.sharpTurn.accel.x === 1.0 && TRUCK.roadEvents.sharpTurn.accel.z === 0 && TRUCK.roadEvents.sharpTurn.severity === 1.0);
  ok(`m33 C3i CARGO.shiftToleranceM (${CARGO.shiftToleranceM}) is the bar m25 K9a holds the loose packs to on the bump window`,
     CARGO.shiftToleranceM === 0.25);
  ok('m33 C3j the composition is config, never a literal in truck.js (M17\'s seam, still shut): TRUCK is frozen and every fraction is a finite number',
     Object.isFrozen(TRUCK) && ['x', 'y', 'z'].every((k) => Number.isFinite(B.accel[k]) && Number.isFinite(BR.accel[k])),
     JSON.stringify({ frozen: Object.isFrozen(TRUCK), accel: B.accel }));

  /* THE LIFT IS THE NUMBER THIS MILESTONE CHANGED, so it is pinned here rather than left to
   * be re-derived. The brief asked for accel.z alone and for y to stay at 0.55; measured,
   * those two cannot both hold (every z that moves anything on its own is ≥ 0.94, harder than
   * the brake — the sweep is in config.js above roadEvents). The reviewed decision is: hold z
   * AT the brief's cap and raise the lift, because unloading the deck is what a bump does.
   * These three assertions are the ratification — they fail the moment the lift drifts. */
  const liftOff = g / (B.severity * TRUCK.brakeForce);        // the accel.y at which the load flies
  const margin = 100 * (1 - B.accel.y / liftOff);
  lines.push(`      the ratified lift: accel.y ${B.accel.y} (was 0.55) — ${(100 * lift / g).toFixed(1)}% of g, ` +
             `${(lift / brakePush).toFixed(2)}× the brake's peak, lift-off at y ${liftOff.toFixed(3)}, margin ${margin.toFixed(1)}%`);
  eq('m33 C3k the lift is RATIFIED at exactly 2.20 — the one number M26 changed beyond the brief, pinned so it cannot drift unnoticed', B.accel.y, 2.20);
  ok(`m33 C3l …and it keeps a real margin below lift-off (y ${B.accel.y} against ${liftOff.toFixed(3)}, ${margin.toFixed(1)}% — a load gone light, never a load thrown)`,
     B.accel.y < liftOff && margin >= 5 && margin <= 15, `${margin.toFixed(2)}%`);
  ok(`m33 C3m …so it is the largest single acceleration any road event applies (${lift.toFixed(2)} m/s², ${(lift / brakePush).toFixed(2)}× the brake's) — recorded, not hidden`,
     lift > brakePush && lift / brakePush < 2, `${lift.toFixed(2)} vs ${brakePush.toFixed(2)}`);
  /* THE SEAT IS NOT THE CARGO. The shake normalises the direction it is handed (main.js
   * ROAD_FORCE), so the cargo's new forward fraction would have tilted the driver's bump
   * nudge 12.8° forward and broken m24 K2g ('a vertical component only, upward'), which has
   * been the shipped behaviour since M16. speedBump names its own seat direction instead. */
  const SA = B.seatAccel;
  ok('m33 C3n the bump names the SEAT\'s own direction, so the cab still only rises (m24 K2g is the behavioural pin)',
     !!SA && SA.y > 0 && SA.x === 0 && SA.z === 0, JSON.stringify(SA));
  ok('m33 C3n …and the two events whose cargo direction still is the seat\'s do not carry one',
     BR.seatAccel === undefined && TRUCK.roadEvents.sharpTurn.seatAccel === undefined,
     `${JSON.stringify(BR.seatAccel)} / ${JSON.stringify(TRUCK.roadEvents.sharpTurn.seatAccel)}`);
}
emit('C4...');

/* ── C4. the property line names who was holding it (§15.3, §8.4) ──────────── */
lines.push('--- C4. §15.3 "who was holding it": recorded since M14, printed since M26 ---');
{
  // The pure half first — the shape M14 wrote and M23 kept is ONE ENTRY PER HAND.
  eq('m33 C4-0 seatWordFor maps a mover id to the seat word the HUD and the recap already use', seatWordFor('p0'), 'P1');
  eq('m33 C4-0 …and seat 1 too', seatWordFor('p1'), 'P2');
  eq('m33 C4-0 …a two-hand hold is ONE person: heldBy ["p0","p0"] dedupes to P1 (M14\'s per-hand shape)', holdersOf(['p0', 'p0'], 2), 'P1');
  eq('m33 C4-0 …two people read as two', holdersOf(['p0', 'p1'], 2), 'P1 and P2');
  eq('m33 C4-0 …a thrown object names nobody', holdersOf([], 2), '');
  eq('m33 C4-0 …and solo names nobody however full heldBy is (§21.1 compact)', holdersOf(['p0', 'p0'], 1), '');

  // The physical half: seat 0 carries a box into the front wall.
  freshRun();
  M.setSeats(1);
  frames(10);
  parkMoversAway();
  const box = byDef('box_small_01');
  /* The 0.50 m box parked one short hop off the front wall: at 4 m/s it reaches the wall in a
   * couple of steps, so the hands are still on it at the moment the damage window opens (C4l
   * below measures the same stand-off from the other side — 0.20 m of walking). The mover
   * stands on the +z side ONLY — the −z stand-off would put it through the wall it is about
   * to break. */
  parkAt(box, 1.60, 0.27, -1.50);
  step(30);
  const gR = reachFor(movers[0], box, 'right', 1.1, [{ x: 0, z: 1.1 }, { x: 1.1, z: 0.6 }]);
  const gL = movers[0].grips.tryGrab('left', movers[0].id, game.clock.simTimeMs);
  ok('m33 C4a seat 0 has the box in BOTH hands', !!gR && !!gL && box.state.grips.length === 2,
     `${box.state.grips.map((x) => x.playerId + ':' + x.hand).join(',')}`);
  const p0 = prop().length;
  parkAt(box, 1.60, 0.27, -1.50);
  box.body.setLinvel({ x: 0, y: 0, z: -4.0 }, true);
  box.body.wakeUp();
  step(60);
  damage.flush(game.clock.simTimeMs);
  const line = prop().slice(p0)[0] || null;
  ok('m33 C4b the wall it hit posts ONE property line', !!line && prop().length - p0 === 1,
     line ? `${line.location} ${line.band} ${line.cost}` : `${prop().length - p0} lines`);
  ok('m33 C4b …carrying heldBy, one entry per HAND, both seat 0\'s mover id',
     !!line && Array.isArray(line.heldBy) && line.heldBy.length >= 1 && line.heldBy.every((id) => id === movers[0].id),
     line ? JSON.stringify(line.heldBy) : 'no line');
  releaseAll();
  step(20);

  const summary = M.manifestSummary(game.state.manifest);
  const solo = M.buildInvoice(game.state, summary, { seatCount: 1 });
  const coop = M.buildInvoice(game.state, summary, { seatCount: 2 });
  const soloLine = solo.lines.find((l) => l.kind === 'property damage');
  const coopLine = coop.lines.find((l) => l.kind === 'property damage');
  ok('m33 C4c the invoice has a property-damage line', !!soloLine && !!coopLine, JSON.stringify(solo.lines.map((l) => l.kind)));
  ok(`m33 C4d in co-op it names the holder: "${coopLine && coopLine.detail}"`,
     !!coopLine && /P1/.test(coopLine.detail) && /carrying the box small/.test(coopLine.detail), coopLine && coopLine.detail);
  ok(`m33 C4e in solo it carries NO seat token: "${soloLine && soloLine.detail}"`,
     !!soloLine && !/\bP\d\b/.test(soloLine.detail) && !/carrying/.test(soloLine.detail), soloLine && soloLine.detail);
  ok(`m33 C4e …and is otherwise the line it always was ("${soloLine && soloLine.detail}")`,
     !!soloLine && /^\d+ impacts? on \d+ surfaces?$/.test(soloLine.detail), soloLine && soloLine.detail);
  ok('m33 C4e …the co-op line is that same text plus the holder clause',
     !!coopLine && coopLine.detail.startsWith(soloLine.detail + ' — '), coopLine && coopLine.detail);
  eq('m33 C4e …the amounts are identical — the holder is a LABEL, never a factor (M14/M23 pricing untouched)',
     soloLine && soloLine.amount, coopLine && coopLine.amount);

  // The sheet, in co-op, prints what buildInvoice built.
  eq('m33 C4f F2 seats a second player', M.setSeats(2), 2);
  M.settle();
  const rows = [...invoiceScreen.el.querySelectorAll('.line')].map((n) => n.textContent.replace(/\s+/g, ' ').trim());
  const sheetRow = rows.find((t) => /property damage/.test(t)) || '';
  ok(`m33 C4f the sheet's property row names the seat in co-op: "${sheetRow}"`, /P1/.test(sheetRow) && /carrying the box small/.test(sheetRow), sheetRow);
  const report = invoiceScreen.report();
  const exported = (report.invoice.lines || []).find((l) => l.kind === 'property damage');
  ok('m33 C4g the JSON export\'s property line is the sheet\'s, word for word', !!exported && sheetRow.includes(exported.detail),
     exported ? exported.detail : 'no exported line');
  const ev = (report.events || []).filter((e) => e.type === EVENTS.DAMAGE_APPLIED && e.category === 'property');
  ok('m33 C4g …and the export\'s own heldBy is the ledger\'s, so the sheet and the JSON agree about who',
     ev.length >= 1 && !!line && JSON.stringify(ev[ev.length - 1].heldBy) === JSON.stringify(line.heldBy),
     `${ev.length} events, ${ev.length ? JSON.stringify(ev[ev.length - 1].heldBy) : '-'} vs ${line ? JSON.stringify(line.heldBy) : 'no line'}`);
  ok('m33 C4h the recap\'s seat column is filled for a held impact (M24 recorded it blank)',
     recapFrom(report.events || [], { seatOf: seatOfId }).filter((r) => r.kind === 'property').every((r) => r.seat === 0),
     JSON.stringify(recapFrom(report.events || [], { seatOf: seatOfId }).filter((r) => r.kind === 'property').map((r) => r.seat)));

  // A THROWN object names nobody, on the same wall, in the same co-op run.
  freshRun();
  M.setSeats(2);
  parkMoversAway();
  frames(10);
  const box2 = byDef('box_small_01');
  parkAt(box2, 1.60, 0.27, -1.50);
  step(30);
  const q0 = prop().length;
  box2.body.setLinvel({ x: 0, y: 0, z: -4.0 }, true);
  box2.body.wakeUp();
  step(60);
  damage.flush(game.clock.simTimeMs);
  const thrown = prop().slice(q0)[0] || null;
  ok('m33 C4i a thrown box posts a line with heldBy []', !!thrown && Array.isArray(thrown.heldBy) && thrown.heldBy.length === 0,
     thrown ? JSON.stringify(thrown.heldBy) : 'no line');
  const thrownInvoice = M.buildInvoice(game.state, M.manifestSummary(game.state.manifest), { seatCount: 2 })
    .lines.find((l) => l.kind === 'property damage');
  ok(`m33 C4i …and its line prints the surface only, even in co-op: "${thrownInvoice && thrownInvoice.detail}"`,
     !!thrownInvoice && !/\bP\d\b/.test(thrownInvoice.detail) && !/carrying/.test(thrownInvoice.detail), thrownInvoice && thrownInvoice.detail);
  eq('m33 C4j propertyHolders over a mixed ledger lists each holder-and-object pair once',
     propertyHolders([{ heldBy: ['p0', 'p0'], defId: 'dresser_01' }, { heldBy: [], defId: 'box_small_01' },
                      { heldBy: ['p0'], defId: 'dresser_01' }, { heldBy: ['p1'], defId: 'couch_3seat_01' }], 2),
     'P1 carrying the dresser, P2 carrying the couch 3seat');
  /* The line AGGREGATES every impact into one row, so the clause needs a cap. It is config
   * (§21.1 compact, the same reason INVOICE.recapPerKind exists), never a literal in the
   * builder — the per-impact breakdown is the recap's job, and the recap has one. */
  eq('m33 C4k the "and N more" cap is INVOICE.holderMax, not a literal in invoice.js', INVOICE.holderMax, 2);
  eq(`m33 C4k …and the clause honours it: three distinct pairs print ${INVOICE.holderMax} and then "and 1 more"`,
     propertyHolders([{ heldBy: ['p0'], defId: 'dresser_01' }, { heldBy: ['p1'], defId: 'couch_3seat_01' },
                      { heldBy: ['p0'], defId: 'box_small_01' }], 2),
     'P1 carrying the dresser, P2 carrying the couch 3seat and 1 more');

  /* THE BRIEF'S OWN FIXTURE, and the reason it needs a different recipe. The case above is a
   * 9 kg box THROWN at 4 m/s, which is m22/m14's proven trick; the brief asked for the
   * dresser — 55 kg, two hands, ~2 m/s — and a thrown dresser cannot be made to work in a
   * harness: MEASURED, setting 2 m/s on 55 kg with two hands on it posts NO line at all,
   * because the grip springs turn a 55 kg body around inside ~0.35 m (√(m/k) × v) and it
   * never reaches the wall. So this case does what a player does — it WALKS the dresser into
   * the wall — and the hands travel with it, so nothing stretches and nothing tears. That
   * also settles the speed honestly: a mover carrying 55 kg in both hands walks it in at
   * 0.97 m/s (measured, printed below), not at the brief's 2 — §6.3's "one player awkward" is
   * the reason, and 66.19 of dented wall is plenty of consequence. The surface is the front
   * wall rather than the living-kitchen jamb because a jamb is not a property surface at all:
   * surfaces.js tags the DOOR FRAME class and damage.js marks it only from the strain a HUNG
   * leaf takes (M23: bent above DOOR.bentImpulseNs, forced above DOOR.forceImpulseNs), so a
   * carried object walked at an open jamb — no leaf in the way — posts no line there. */
  freshRun();
  M.setSeats(2);
  frames(10);
  parkMoversAway();
  const dr = byDef('dresser_01');
  parkAt(dr, 1.60, 0.43, -1.20);          // measured: 0.20 m of walking before its face meets the wall
  step(30);
  const dR = reachFor(movers[0], dr, 'right', 1.1, [{ x: 0, z: 1.1 }, { x: 1.1, z: 0.6 }]);
  const dL = movers[0].grips.tryGrab('left', movers[0].id, game.clock.simTimeMs);
  const r0 = prop().length;
  const zStart = posOf(dr).z;
  /* Forward, into what the hands are pointing at — C1's carry loop with the sign flipped. */
  const walkIn = { [movers[0].id]: { move: { x: 0, y: 1 }, yaw: movers[0].grips.aimYaw } };
  let approach = 0;
  for (let k = 0; k < 24; k++) {
    const z1 = posOf(dr).z;
    step(5, walkIn);
    approach = Math.max(approach, (z1 - posOf(dr).z) / (5 * STEP / 1000));
  }
  const dHands = dr.state.grips.length;
  releaseAll();
  step(30);
  damage.flush(game.clock.simTimeMs);
  const dLine = prop().slice(r0)[0] || null;
  lines.push(`      the dresser (55 kg) WALKED into the wall: ${dHands} hand(s) on it at contact, carried ` +
             `${(zStart - posOf(dr).z).toFixed(2)} m at up to ${approach.toFixed(2)} m/s, ${prop().length - r0} property line(s)` +
             (dLine ? ` — ${dLine.location} ${dLine.band} ${dLine.cost.toFixed(2)} heldBy ${JSON.stringify(dLine.heldBy)}` : ''));
  ok(`m33 C4l the brief's own fixture: 55 kg in BOTH hands, walked into the wall at ${approach.toFixed(2)} m/s, posts a property line…`,
     !!dR && !!dL && !!dLine, `grips ${JSON.stringify([!!dR, !!dL])}, ${prop().length - r0} lines`);
  ok('m33 C4l …and it names the hands that were on it — the mechanism does not care about the mass',
     !!dLine && Array.isArray(dLine.heldBy) && dLine.heldBy.length >= 1 && dLine.heldBy.every((id) => id === movers[0].id),
     dLine ? JSON.stringify(dLine.heldBy) : 'no line');
  ok(`m33 C4l …so the sheet says who for the heavy carry too: "${dLine ? propertyHolders([dLine], 2) : ''}"`,
     !!dLine && propertyHolders([dLine], 2) === 'P1 carrying the dresser',
     dLine ? propertyHolders([dLine], 2) : 'no line');
  M.setSeats(1);
  freshRun();
}
emit('C5...');

/* ── C5. shape (§22.4, m0 E8) ─────────────────────────────────────────────── */
lines.push('--- C5. everything added stays plain, serializable data (GDD §22.4) ---');
{
  frames(10);
  ok('m33 C5a game.state round-trips through JSON with no THREE object, Rapier handle or closure',
     (() => { try { JSON.parse(JSON.stringify(game.state)); return true; } catch (e) { return false; } })());
  const entities = [...registry.entities.values()];
  ok(`m33 C5b everHeld is a BOOLEAN on every one of the ${entities.length} entities after boot — never an absent key`,
     entities.every((e) => typeof e.state.everHeld === 'boolean'),
     entities.filter((e) => typeof e.state.everHeld !== 'boolean').map((e) => `${e.defId}=${typeof e.state.everHeld}`).join(', ') || 'all boolean');
  ok('m33 C5b …and door leaves are included (they are registry entities too, M11)',
     entities.filter((e) => e.defId === 'door_leaf_01').length >= 1 &&
     entities.filter((e) => e.defId === 'door_leaf_01').every((e) => e.state.everHeld === false));
  ok('m33 C5c NOTICE is frozen config with the two numbers hud.js used to carry as literals',
     Object.isFrozen(NOTICE) && NOTICE.ttlMs === 3200 && NOTICE.maxStack === 4, JSON.stringify(NOTICE));
  ok('m33 C5c …and the HUD reads its clock through the function main.js handed it, not a global',
     typeof hud.simNow === 'function' && Math.abs(hud.simNow() - game.clock.simTimeMs) < 1e-9,
     `${hud.simNow()} vs ${game.clock.simTimeMs}`);
  ok('m33 C5d the notice stack itself is presentation state — it is NOT in game.state (m0 E8)',
     !JSON.stringify(game.state).includes('_notices'));
  ok('m33 C5e a property line\'s heldBy is an array of plain strings, JSON-safe',
     (game.state.ledger.propertyDamage || []).every((l) => Array.isArray(l.heldBy) && l.heldBy.every((id) => typeof id === 'string')));
  near('m33 C5f DAMAGE.property is untouched by M26 — the holder is a label, never a factor', DAMAGE.property.maxChargePerSurface, 400, 1e-9);
  ok('m33 C5g no error banner appeared during the suite', !document.getElementById('error-banner') && !document.getElementById('err-banner'));
  lines.push(`      budget: sim clock ${(game.clock.simTimeMs / 1000).toFixed(1)} s, ${game.stats.frames} game.frame() calls`);
}
} catch (e) {
  fails++;
  lines.push(`FAIL  uncaught  <- ${e && e.message}`);
  lines.push((e && e.stack || '').split('\n').slice(0, 6).join('\n'));
}

emit();
void STEP; void bus; void eq;
