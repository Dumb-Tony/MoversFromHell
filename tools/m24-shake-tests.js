/* Phase 11 build-side M16 suite — camera shake that means something.
 *
 * GDD §26.5 "Grip toggle, sensitivity, camera shake, UI scale, subtitles, and
 * color-independent cues exist"; §21.4 Motion (camera shake as an accessibility baseline);
 * §11.3 road events are felt; §8.4 feedback without a second HUD element; §22.4 the renderer
 * reads state and never writes it.
 *
 * THE CLAIMS UNDER TEST:
 *
 *   DAMPED        a nudge is a spring offset that peaks at once, wobbles and is gone — a
 *                 50 mm nudge is inside 1 mm within RENDER.camera.shake.settleMs of sim
 *                 frames and exactly zero soon after (K1). Integrated on SIM time: every
 *                 assertion drives game.frame() and reads the rig after one update, the way
 *                 the shot scripts do (performance.now() is frozen under the harness).
 *   MEANINGFUL    a hard brake lurches the driving seat forward by severity × shake.road, a
 *                 sharp turn sideways, a speed bump up — sign and axis (K2); an impact within
 *                 shake.impactRange of a mover is felt ∝ relVelocity above the audio's silence
 *                 threshold and not beyond the range (K3); a knockdown is one nudge (K8).
 *   BOUNDED       fifty stacked nudges cap at maxOffset / maxRot — a cap, not a sum — and a
 *                 nudge into a wall is clamped by the rig's own probe (K4).
 *   SWITCHED      the §26.5 checkbox (shell key cameraShake) makes nudge() a no-op on every
 *                 rig, persists, and defaults from prefers-reduced-motion (K5, K7).
 *   PURE          yaw and pitch are the player's: identical before and after a nudge, and
 *                 300 frames of nudges change nothing in game.state that 300 idle frames do
 *                 not (K6). M20: nor the AIM — the grab ray starts from the un-nudged solve
 *                 (grips.aimOrigin = the twin's eye to 1e-6 mid-nudge) and a grab attempted
 *                 mid-nudge lands where the rest grab did, within 5 mm (K6c/K6d).
 *
 * localStorage 'mfh.save' is cleared at the start and the end (K5 persists a choice).
 */

import { RENDER, TRUCK, AUDIO, SIM, SETTINGS, MOVERS } from '../src/config.js';
import { EVENTS, PHASES } from '../src/core/eventBus.js';
import { cabPoint } from '../src/world/truck.js';
import { load, reducedMotionPreferred, sanitiseShell, SHELL_DEFAULTS, SAVE_KEY, SAVE_SCHEMA } from '../src/core/save.js';
import { ThirdPersonCamera } from '../src/render/camera.js';

const lines = [];
let passes = 0, fails = 0;
function ok(name, cond, detail = '') {
  if (cond) { passes++; lines.push(`PASS  ${name}`); }
  else { fails++; lines.push(`FAIL  ${name}${detail ? '  <- ' + detail : ''}`); }
}
const eq = (n, a, b) => ok(n, a === b, `got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const near = (n, a, b, tol, d = '') =>
  ok(n, Math.abs(a - b) <= tol, `${d}got ${Number(a).toPrecision(6)}, want ${b} ±${tol}`);

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

const { game, movers, physics } = M;
const bus = game.bus;
const FRAME = 16.667;
const S = RENDER.camera.shake;
const rigOf = (i) => movers[i].rig;
const camOf = (i) => movers[i].camera;
const posOf = (i) => game.state.players[movers[i].id].position;
const now = () => game.clock.simTimeMs;
const banner = () => { const b = document.getElementById('err-banner'); return b ? b.textContent : ''; };
const panel = () => document.getElementById('settings-screen');
const control = (key) => panel().querySelector(`[data-setting="${key}"]`);
const V3 = (v) => ({ x: v.x, y: v.y, z: v.z });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

/** A shake-free TWIN of each rig, fed exactly the inputs the real rig gets each tick — the
 *  "un-nudged solve" the assertions measure against, immune to a mover that is still settling
 *  on the ground. Identical arithmetic on both, so at rest the two are byte-equal (K1e). */
const twins = new Map();
function twinOf(i) {
  if (!twins.has(i)) {
    const t = new ThirdPersonCamera(new M.THREE.PerspectiveCamera(RENDER.fov, 1, RENDER.near, RENDER.far), M.world.colliders);
    t.setShakeEnabled(false);
    twins.set(i, t);
  }
  return twins.get(i);
}
function syncTwin(i) {
  const r = rigOf(i), t = twinOf(i);
  t.yaw = r.yaw; t.pitch = r.pitch; t.distance = r.distance;
  t._smoothed.copy(r._smoothed); t._currentDistance = r._currentDistance; t._first = r._first;
}
/** The camera's displacement from its un-nudged solve, world metres. */
function offsetOf(i) { return sub(V3(camOf(i).position), V3(twinOf(i).camera.position)); }
const offMag = (i) => { const o = offsetOf(i); return Math.hypot(o.x, o.y, o.z); };
/** One render frame the way loop() does it: the sim steps, then every seated rig solves —
 *  and its twin, from the same focus, look and boom. */
function tick(n = 1) {
  for (let k = 0; k < n; k++) {
    game.frame(FRAME);
    M.shakeFrame();
    for (let s = 0; s < M.seatCount; s++) {
      const m = M.moverOfSeat(s);
      const i = movers.indexOf(m);
      const focus = game.state.players[m.id].position;
      const t = twinOf(i);
      t.yaw = m.rig.yaw; t.pitch = m.rig.pitch; t.distance = m.rig.distance;
      t.update(focus, FRAME / 1000);
      m.rig.update(focus, FRAME / 1000);
    }
  }
}
/** Stand a mover still somewhere (tools/m11-tests.js placeMover). */
function placeMover(m, x, z, y = 0.2) {
  m.controller.hardSetPosition({ x, y, z });
  m.controller._vel.x = 0; m.controller._vel.z = 0;
  m.controller.velocityY = 0; m.controller._climb = null;
  m.controller.carriedMass = 0; m.controller.resistedForce = 0;
  m.controller.pull.x = 0; m.controller.pull.z = 0;
  m.controller.imbalance = 0; m.controller.exertion = 0; m.controller._downMs = 0;
}
/** Park a registry entity somewhere, at rest, and make it visible to the next raycast
 *  (tools/m11-tests.js parkAt). M20, for K6c/K6d's box. */
function parkAt(e, x, y, z, yaw = 0) {
  e.body.setTranslation({ x, y, z }, true);
  e.body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
  e.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  e.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  e.body.wakeUp();
  physics.primeQueries();
}
/** Snap a rig's follow and boom onto its mover (and its twin's), then let both converge. */
function settleRig(i, frames = 120) {
  const r = rigOf(i);
  r.clearShake();
  r._first = true;
  r._currentDistance = r.distance;
  syncTwin(i);
  tick(frames);
}
function clearAll() { for (const m of movers) m.rig.clearShake(); }
/** Two spots clear by construction — the movers' own spawn points (validated against every
 *  spawn at boot). Anywhere else on the driveway a capsule can be leaning on a tool. */
const SPOT = MOVERS.spawnOffsets.map((o) => ({ x: M.world.spawn.x + o.x, z: M.world.spawn.z + o.z }));
const HOME = SPOT[0], AWAY = SPOT[1];
/** Every leaf path whose value differs between two plain objects. */
function diffPaths(a, b, path = '', out = []) {
  if (a === b) return out;
  const ao = a && typeof a === 'object', bo = b && typeof b === 'object';
  if (!ao || !bo) { out.push(path || '(root)'); return out; }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) diffPaths(a[k], b[k], path ? `${path}.${k}` : k, out);
  return out;
}
const snapshot = () => JSON.parse(JSON.stringify(game.state));
const roadEvent = (type) => bus.emit(EVENTS.ROAD_FORCE,
  { roadType: type, label: type, severity: TRUCK.roadEvents[type].severity }, now());
const impact = (relVelocity, at) => bus.emit(EVENTS.IMPACT,
  { entityId: 'm24', relVelocity, position: at, materials: ['cardboard'] }, now());

// SETUP: nothing from a previous run may survive into this one.
try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* no storage — the suite still runs */ }

try {

/* ── Z. the numbers (config pins and the derivation K1 relies on) ─────────────── */
lines.push('--- Z. RENDER.camera.shake: the numbers and what they promise ---');
{
  const wn = Math.sqrt(S.stiffness), zeta = S.damping / (2 * wn);
  ok('Z1 the spring is underdamped (ζ < 1) — a wobble, not a crawl', zeta > 0 && zeta < 1, `ζ = ${zeta.toFixed(3)}`);
  // |x(t)| ≤ x0·e^(−ζωt)/√(1−ζ²): a 50 mm nudge is inside 1 mm once e^(−ζωt) ≤ 0.02·√(1−ζ²).
  const settleS = -Math.log(0.02 * Math.sqrt(1 - zeta * zeta)) / (zeta * wn);
  ok('Z2 settleMs covers the analytic settle of a 50 mm nudge to 1 mm', settleS * 1000 < S.settleMs,
     `analytic ${(settleS * 1000).toFixed(0)} ms, settleMs ${S.settleMs}`);
  lines.push(`      ω ${wn.toFixed(1)} rad/s (${(wn / (2 * Math.PI)).toFixed(2)} Hz), ζ ${zeta.toFixed(2)}, 50 mm → 1 mm in ${(settleS * 1000).toFixed(0)} ms`);
  ok('Z3 every source amplitude is a positive number of metres inside the cap',
     [S.road, S.impact, S.knockdown].every((v) => v > 0 && v <= S.maxOffset), JSON.stringify([S.road, S.impact, S.knockdown]));
  ok('Z4 the rotational amplitudes are milliradians inside maxRot', S.roadRotMrad * 1e-3 <= S.maxRot && S.knockdownRotMrad * 1e-3 <= S.maxRot);
  eq('Z5 the shell default of the switch is on (§26.5 "exist[s]")', SHELL_DEFAULTS.cameraShake, true);
  ok('Z6 the impact source uses the audio\'s own silence threshold', AUDIO.impact.minVelocity > 0 && AUDIO.impact.fullVelocity > AUDIO.impact.minVelocity);
}
emit('running...');

/* ── K0. the fixture ──────────────────────────────────────────────────────────── */
lines.push('--- K0. at rest the shake is exactly nothing ---');
{
  ok('K0 every rig starts with a zero offset', movers.every((m) => m.rig.shakeMagnitude() === 0));
  ok('K0a …and its switch on, from the shell', movers.every((m) => m.rig.shakeEnabled === M.shellSettings.cameraShake));
  eq('K0b the boot recorded the OS reading', typeof M.reducedMotion, 'boolean');
  eq('K0c …and in this harness it is "no preference"', M.reducedMotion, false);
  // A bare rig with no clock integrates on the frame time it is handed.
  const bare = new ThirdPersonCamera(new M.THREE.PerspectiveCamera(60, 1, 0.1, 100), []);
  bare.update({ x: 0, y: 0, z: 0 }, 1 / 60);
  bare.nudge({ x: 0, y: 0.05, z: 0 });
  bare.update({ x: 0, y: 0, z: 0 }, 1 / 60);
  const m1 = bare.shakeMagnitude();
  for (let k = 0; k < 60; k++) bare.update({ x: 0, y: 0, z: 0 }, 1 / 60);
  ok('K0d a rig without a clock decays on frame time', m1 > 0 && m1 < 0.05 && bare.shakeMagnitude() < 1e-3, `${m1} → ${bare.shakeMagnitude()}`);
}

/* ── K1. damped, no residual ──────────────────────────────────────────────────── */
lines.push('--- K1. a nudge decays and leaves nothing behind (§21.4 Motion) ---');
{
  M.setSeats(1);
  placeMover(movers[0], HOME.x, HOME.z);          // the spawn, open driveway
  rigOf(0).yaw = Math.PI; rigOf(0).pitch = -0.12;   // looking toward the truck; the eye 4 m in front of the house
  settleRig(0, 120);
  tick(2);
  eq('K1 fixture: before any nudge the rig and its shake-free twin solve to the same bytes', offMag(0), 0);
  rigOf(0).nudge({ x: 0, y: 0.05, z: 0 });
  tick(1);
  const d1 = offMag(0);
  ok('K1 nudge({y:0.05}) → the camera differs from the un-nudged solve by ≤ maxOffset on the next update',
     d1 > 0 && d1 <= S.maxOffset, `${d1}`);
  near('K1a …by the whole 50 mm, straight up (applied in full on the first update)', offsetOf(0).y, 0.05, 1e-9);
  const frames = Math.ceil(S.settleMs / FRAME);
  let minY = Infinity;
  for (let k = 1; k < frames; k++) { tick(1); minY = Math.min(minY, offsetOf(0).y); }
  const dSettle = offMag(0);
  ok(`K1b …and is back within 1 mm inside settleMs (${frames} sim frames)`, dSettle <= 1e-3, `${(dSettle * 1000).toFixed(3)} mm`);
  ok('K1c …having wobbled through the far side on the way (underdamped, not a crawl)', minY < -0.005, `min ${(minY * 1000).toFixed(2)} mm`);
  tick(180);
  eq('K1d …and declared at rest soon after: the offset is exactly zero', rigOf(0).shakeMagnitude(), 0);
  eq('K1e …so the solve is byte-identical to a build without shake (the m13/m15 shots)', offMag(0), 0);
  eq('K1f …and nothing was clamped on open ground', rigOf(0).shakeClamped, false);
  lines.push(`      50 mm nudge: ${(dSettle * 1000).toFixed(3)} mm at ${frames} frames, far side ${(minY * 1000).toFixed(2)} mm`);
}

/* ── K2. road events reach the driving seat ───────────────────────────────────── */
lines.push('--- K2. §11.3 road events are felt by the driving seat, on the right axis ---');
{
  const cab = cabPoint();
  placeMover(movers[0], cab.x, cab.z + 1.4);        // where a cab press happens (m11 E1)
  game.setPhase(PHASES.TRANSIT);
  eq('K2 fixture: entering TRANSIT records the seated mover nearest the cab as the driver', M.shakeDriver(), 0);
  placeMover(movers[0], HOME.x, HOME.z);            // the driver, on its own spawn for the measurement
  rigOf(0).yaw = 0; rigOf(0).pitch = -0.12;         // looking at the house (−z); the truck behind the eye
  settleRig(0, 120);
  const sev = TRUCK.roadEvents.hardBrake.severity;
  roadEvent('hardBrake');
  let peak = 0, peakOff = null, rotAtPeak = null;
  for (let k = 0; k < 3; k++) {
    tick(1);
    const off = offsetOf(0);
    const mag = Math.hypot(off.x, off.y, off.z);
    if (mag > peak) { peak = mag; peakOff = off; rotAtPeak = rigOf(0).shakeRot(); }
  }
  near('K2 hardBrake → seat 0\'s offset peaks at severity × shake.road (± 5 %) within 3 frames', peak, sev * S.road, 0.05 * sev * S.road);
  ok('K2a …forward: along the truck\'s +z, the way the cargo is thrown (truck.js)', peakOff.z > 0.9 * sev * S.road && Math.abs(peakOff.x) < 1e-9 && Math.abs(peakOff.y) < 1e-9, JSON.stringify(peakOff));
  ok('K2b …and pitches the view down', rotAtPeak.pitch < 0 && rotAtPeak.roll === 0, JSON.stringify(rotAtPeak));
  lines.push(`      hardBrake peak ${(peak * 1000).toFixed(2)} mm (want ${(sev * S.road * 1000).toFixed(1)}), pitch ${(rotAtPeak.pitch * 1000).toFixed(2)} mrad`);
  tick(180);
  eq('K2c …and it is gone before the next hazard', rigOf(0).shakeMagnitude(), 0);

  const sevT = TRUCK.roadEvents.sharpTurn.severity;
  roadEvent('sharpTurn');
  tick(1);
  const offT = offsetOf(0);
  ok('K2d sharpTurn → a sideways component only (the cargo\'s +x)', offT.x > 0.9 * sevT * S.road && Math.abs(offT.y) < 1e-9 && Math.abs(offT.z) < 1e-9, JSON.stringify(offT));
  near('K2e …of severity × shake.road', Math.hypot(offT.x, offT.y, offT.z), sevT * S.road, 0.05 * sevT * S.road);
  ok('K2f …and it rolls, not pitches', rigOf(0).shakeRot().roll !== 0 && rigOf(0).shakeRot().pitch === 0, JSON.stringify(rigOf(0).shakeRot()));
  tick(180);

  const sevB = TRUCK.roadEvents.speedBump.severity;
  roadEvent('speedBump');
  tick(1);
  const offB = offsetOf(0);
  ok('K2g speedBump → a vertical component only, upward', offB.y > 0.9 * sevB * S.road && Math.abs(offB.x) < 1e-9 && Math.abs(offB.z) < 1e-9, JSON.stringify(offB));
  near('K2h …of severity × shake.road (0.8 × road)', offB.y, sevB * S.road, 0.05 * sevB * S.road);
  tick(180);
  lines.push(`      sharpTurn x ${(offT.x * 1000).toFixed(2)} mm, speedBump y ${(offB.y * 1000).toFixed(2)} mm`);

  /* Co-op: only the driving seat. Seat 1's mover stands far from the truck. */
  M.setSeats(2);
  placeMover(movers[1], AWAY.x, AWAY.z);
  rigOf(1).yaw = 0.7; rigOf(1).pitch = -0.12;
  settleRig(0, 60); settleRig(1, 240);
  const s1 = V3(camOf(1).position);
  tick(2);
  ok('K2i co-op fixture: both rigs match their twins, and the idle seat\'s mover is still',
     offMag(0) === 0 && offMag(1) === 0 && dist(V3(camOf(1).position), s1) <= 1e-9, `${offMag(0)} / ${offMag(1)} / drift ${dist(V3(camOf(1).position), s1)}`);
  eq('K2j …and the driver is still mover 0', M.shakeDriver(), 0);
  const c1 = V3(camOf(1).position);
  roadEvent('hardBrake');
  tick(1);
  ok('K2k hardBrake in co-op → the driving seat moves', offMag(0) > 0.9 * sev * S.road, `${offMag(0)}`);
  ok('K2l …and no offset on the seat that is not driving (its camera unchanged to 1e-9)',
     offMag(1) <= 1e-9 && dist(V3(camOf(1).position), c1) <= 1e-9 && rigOf(1).shakeMagnitude() === 0,
     `${offMag(1)} / ${dist(V3(camOf(1).position), c1)}`);
  tick(180);
  // Swap roles: mover 1 at the cab when the phase turns, mover 0 away.
  game.setPhase(PHASES.PICKUP);
  placeMover(movers[1], cab.x, cab.z + 1.4);
  placeMover(movers[0], AWAY.x, AWAY.z);
  game.setPhase(PHASES.TRANSIT);
  eq('K2m the seat whose mover is at the cab when TRANSIT begins is the driver', M.shakeDriver(), 1);
  placeMover(movers[1], HOME.x, HOME.z); rigOf(1).yaw = 0;
  settleRig(0, 240); settleRig(1, 120);
  const c0 = V3(camOf(0).position);
  roadEvent('hardBrake');
  tick(1);
  ok('K2n …so seat 1 feels the brake and seat 0 does not', offMag(1) > 0.9 * sev * S.road && offMag(0) <= 1e-9 && dist(V3(camOf(0).position), c0) <= 1e-9,
     `${offMag(1)} / ${offMag(0)} / ${dist(V3(camOf(0).position), c0)}`);
  tick(180);
  game.setPhase(PHASES.PICKUP);
  M.setSeats(1);
  placeMover(movers[1], AWAY.x, AWAY.z);   // out of mover 0's way for the solo sections
  clearAll();
}

/* ── K3. impacts near a mover ─────────────────────────────────────────────────── */
lines.push('--- K3. a nearby impact is felt, a far one is not, a settle-down is silent (§8.4) ---');
{
  placeMover(movers[0], HOME.x, HOME.z);
  rigOf(0).yaw = Math.PI; rigOf(0).pitch = -0.12;
  settleRig(0, 120);
  const p = V3(posOf(0));
  impact(4, { x: p.x + 1, y: p.y, z: p.z });
  tick(1);
  const mag1 = offMag(0);
  ok('K3 IMPACT relVelocity 4 at 1 m from mover 0 → an offset', mag1 > 0 && rigOf(0).shakeMagnitude() > 0, `${mag1}`);
  // The formula the observer applies: strength × (1 − d/range)² × impact, up plus impactAway of it away.
  const strength = Math.min(1, (4 - AUDIO.impact.minVelocity) / (AUDIO.impact.fullVelocity - AUDIO.impact.minVelocity));
  const att = 1 - 1 / S.impactRange;
  const want = S.impact * strength * att * att * Math.sqrt(1 + S.impactAway * S.impactAway);
  near('K3a …of the documented size (∝ relVelocity above minVelocity, attenuated by distance)', mag1, want, 1e-9);
  lines.push(`      4 m/s at 1 m → ${(mag1 * 1000).toFixed(2)} mm`);
  clearAll(); tick(1);
  impact(4, { x: p.x + S.impactRange + 1, y: p.y, z: p.z });
  tick(1);
  eq('K3b the same at shake.impactRange + 1 m → zero', rigOf(0).shakeMagnitude(), 0);
  impact(AUDIO.impact.minVelocity - 0.1, { x: p.x + 1, y: p.y, z: p.z });
  tick(1);
  eq('K3c relVelocity below AUDIO.impact.minVelocity → zero', rigOf(0).shakeMagnitude(), 0);
  impact(AUDIO.impact.minVelocity, { x: p.x + 1, y: p.y, z: p.z });
  tick(1);
  eq('K3d …and exactly at it → zero (the audio\'s own silence)', rigOf(0).shakeMagnitude(), 0);
  impact(2, { x: p.x + 1, y: p.y, z: p.z });
  tick(1);
  const mag2 = offMag(0);
  ok('K3e a softer impact shakes less (2 m/s < 4 m/s at 1 m)', mag2 > 0 && mag2 < mag1 * 0.5, `${mag2} vs ${mag1}`);
  clearAll(); tick(1);
  impact(4, { x: p.x + 3, y: p.y, z: p.z });
  tick(1);
  const mag3 = offMag(0);
  ok('K3f …and a farther one shakes less (3 m < 1 m)', mag3 > 0 && mag3 < mag1, `${mag3} vs ${mag1}`);
  ok('K3g …mostly up, with a push away from the hit', (() => { const o = rigOf(0).shakeOffset(); return o.y > 0 && Math.abs(o.y) >= Math.hypot(o.x, o.z); })(), JSON.stringify(rigOf(0).shakeOffset()));
  clearAll(); tick(1);
}

/* ── K4. caps, and the probe ──────────────────────────────────────────────────── */
lines.push('--- K4. a cap, not a sum — and never through a wall ---');
{
  for (let k = 0; k < 50; k++) rigOf(0).nudge({ x: 0, y: 0.05, z: 0 }, { pitch: 30, roll: 30 });
  ok('K4 fifty stacked nudges in one frame never exceed maxOffset', rigOf(0).shakeMagnitude() <= S.maxOffset + 1e-12, `${rigOf(0).shakeMagnitude()}`);
  const rot = rigOf(0).shakeRot();
  ok('K4a …nor maxRot on either axis', Math.abs(rot.pitch) <= S.maxRot + 1e-12 && Math.abs(rot.roll) <= S.maxRot + 1e-12, JSON.stringify(rot));
  tick(1);
  ok('K4b …and the frame after integrating is still inside both caps', rigOf(0).shakeMagnitude() <= S.maxOffset + 1e-12 && Math.abs(rigOf(0).shakeRot().pitch) <= S.maxRot + 1e-12);
  clearAll();
  rigOf(0).nudge({ x: 1, y: 1, z: 0 });
  const o = rigOf(0).shakeOffset();
  ok('K4c the cap keeps the direction (a length clamp, not a per-axis clip)', Math.abs(o.x - o.y) < 1e-12 && Math.abs(rigOf(0).shakeMagnitude() - S.maxOffset) < 1e-12, JSON.stringify(o));
  clearAll(); tick(1);

  /* Against the front wall (z = ROOM.maxZ, outer face −1.91): the mover 0.7 m outside it,
   * looking away (+z), so the boom wants 4 m INTO the house and the occlusion probe holds the
   * eye at the wall. A nudge of the full cap into the wall must be clamped the same way. */
  /* camOcclude backs the eye off by 6 % of the WHOLE boom ray — 24 cm at 4 m, which is more
   * than the 12 cm cap, so the boom is shortened to distanceMin (a 9.5 cm gap) to put the
   * wall inside a nudge's reach. */
  const boomBefore = rigOf(0).distance;
  rigOf(0).setDistance(RENDER.camera.distanceMin);
  placeMover(movers[0], 1.6, -1.2);
  rigOf(0).yaw = Math.PI; rigOf(0).pitch = -0.12;
  settleRig(0, 120);
  ok('K4d fixture: the wall compresses the boom (currentDistance well under the boom)', rigOf(0)._currentDistance < 0.6 * rigOf(0).distance, `${rigOf(0)._currentDistance.toFixed(3)} of ${rigOf(0).distance} m`);
  const rest = V3(camOf(0).position);
  const inside = (p) => M.world.colliders.filter((c) => !c.noOcclude &&
    p.x > c.minX && p.x < c.maxX && p.y > (c.base || 0) && p.y < c.top && p.z > c.minZ && p.z < c.maxZ);
  eq('K4e …and the un-nudged eye is outside every collider', inside(rest).length, 0);
  rigOf(0).nudgeWorld({ x: 0, y: 0, z: -S.maxOffset });   // into the wall
  tick(1);
  const shaken = V3(camOf(0).position);
  eq('K4f a nudge toward the wall is clamped by the rig\'s own probe (shakeClamped)', rigOf(0).shakeClamped, true);
  eq('K4g …and the eye is not inside any collider', inside(shaken).length, 0, JSON.stringify(shaken));
  ok('K4h …having moved less than the nudge asked for', offMag(0) < S.maxOffset - 1e-4, `${offMag(0)} vs ${S.maxOffset}`);
  ok('K4i …and the boom solve itself was untouched (the probe runs after it)', Math.abs(rigOf(0)._currentDistance - twinOf(0)._currentDistance) < 1e-12);
  lines.push(`      wall: boom ${rigOf(0)._currentDistance.toFixed(3)} m, nudge ${(S.maxOffset * 1000).toFixed(0)} mm in → moved ${(offMag(0) * 1000).toFixed(1)} mm`);
  tick(180); clearAll();
  rigOf(0).setDistance(boomBefore);
}

/* ── K5. the §26.5 switch ─────────────────────────────────────────────────────── */
lines.push('--- K5. cameraShake off: a no-op on every rig; on: K2 again; and it persists ---');
{
  placeMover(movers[0], HOME.x, HOME.z);
  rigOf(0).yaw = Math.PI; rigOf(0).pitch = -0.12;
  settleRig(0, 120);
  M.settingsStore.apply({ cameraShake: false });
  ok('K5 settingsStore.apply({cameraShake:false}) → every rig\'s shakeEnabled is false', movers.every((m) => m.rig.shakeEnabled === false));
  eq('K5a …nudge() returns false', rigOf(0).nudge({ x: 0, y: 0.05, z: 0 }), false);
  eq('K5b …and leaves the offset at zero', rigOf(0).shakeMagnitude(), 0);
  tick(1);
  eq('K5c …so the camera does not move from its un-nudged solve', offMag(0), 0);
  roadEvent('hardBrake'); impact(4, { x: posOf(0).x + 1, y: posOf(0).y, z: posOf(0).z });
  tick(1);
  eq('K5d …whatever the bus says', rigOf(0).shakeMagnitude(), 0);
  eq('K5e the choice persisted (save round-trip)', load().shell.cameraShake, false);
  eq('K5f …as a boolean beside the other shell keys', typeof load().shell.cameraShake, 'boolean');
  // Off mid-shake clears what was in flight.
  M.settingsStore.apply({ cameraShake: true });
  rigOf(0).nudge({ x: 0, y: 0.05, z: 0 });
  M.settingsStore.apply({ cameraShake: false });
  eq('K5g switching off mid-shake clears the offset at once', rigOf(0).shakeMagnitude(), 0);
  M.settingsStore.apply({ cameraShake: true });
  ok('K5h on again → every rig\'s switch is on', movers.every((m) => m.rig.shakeEnabled === true));
  const sev = TRUCK.roadEvents.hardBrake.severity;
  roadEvent('hardBrake');
  let peak = 0;
  for (let k = 0; k < 3; k++) { tick(1); peak = Math.max(peak, offMag(0)); }
  near('K5i …and K2 passes again: hardBrake peaks at severity × shake.road (± 5 %)', peak, sev * S.road, 0.05 * sev * S.road);
  eq('K5j …and that persisted too', load().shell.cameraShake, true);
  tick(180);
  // The card: the box is the store's value, and the box moves the rig (the m16 U2 walk).
  M.settingsPanel.show();
  ok('K5k the settings card has the Camera shake checkbox', !!control('cameraShake') && control('cameraShake').type === 'checkbox');
  eq('K5l …ticked while the switch is on', control('cameraShake').checked, true);
  control('cameraShake').checked = false;
  control('cameraShake').dispatchEvent(new Event('change', { bubbles: true }));
  eq('K5m unticking it moves every rig\'s shakeEnabled', rigOf(0).shakeEnabled, false);
  control('cameraShake').checked = true;
  control('cameraShake').dispatchEvent(new Event('change', { bubbles: true }));
  eq('K5n …and ticking it back', rigOf(0).shakeEnabled, true);
  ok('K5o the row says what it is, in words', /camera shake/i.test(control('cameraShake').parentElement.textContent));
  M.settingsPanel.hide();
}

/* ── K6. never the look axes, never the state ─────────────────────────────────── */
lines.push('--- K6. the shake never touches yaw/pitch or game.state (§22.4) ---');
{
  placeMover(movers[0], HOME.x, HOME.z);
  rigOf(0).yaw = 1.234; rigOf(0).pitch = -0.31;
  settleRig(0, 120);
  const yaw = rigOf(0).yaw, pitch = rigOf(0).pitch;
  rigOf(0).nudge({ x: 0.05, y: 0.05, z: 0.05 }, { pitch: 20, roll: 20 });
  tick(1);
  ok('K6 rig.yaw is identical before and after a nudge', rigOf(0).yaw === yaw, `${rigOf(0).yaw} vs ${yaw}`);
  ok('K6a …and rig.pitch', rigOf(0).pitch === pitch, `${rigOf(0).pitch} vs ${pitch}`);
  ok('K6b …so the aim ray\'s direction is untouched (grips.aimYaw after syncAim)', (movers[0].grips.syncAim(), movers[0].grips.aimYaw === yaw));
  tick(180); clearAll();

  /* K6c/K6d — NOR THE AIM RAY'S ORIGIN (Phase 11 build-side M20; §4.4 "what you see is what
   * you aim"). M16 recorded that GripSystem.aim() read camera.position, so for up to settleMs
   * after a jolt a grab could start up to maxOffset from where the player aimed. Now the ray
   * starts from the boom solve BEFORE the offset (camera.js unshakenEye → grip.js aimOrigin):
   * the shake moves what you see, never where the ray starts. Fixture: mover 0 on the lawn at
   * (-22, 30) — the m11 B/P spot, clear by construction — looking −z at a small box 1.5 m
   * ahead. The section's former K6c-K6e (state purity) are K6e-K6g below, unchanged. */
  {
    const box = [...M.registry.entities.values()].find((e) => e.defId === 'box_small_01');
    ok('K6 fixture: a small box to aim at', !!box);
    if (box) {
      const boxHome = V3(box.body.translation());
      const boxRot = (() => { const q = box.body.rotation(); return { x: q.x, y: q.y, z: q.z, w: q.w }; })();
      const AT = { x: -22, z: 30 };
      const BOX = { x: AT.x, y: box.def.dimensions.y / 2 + 0.01, z: AT.z - 1.5 };
      placeMover(movers[0], AT.x, AT.z);
      parkAt(box, BOX.x, BOX.y, BOX.z);
      rigOf(0).yaw = 0; rigOf(0).pitch = -0.3;
      settleRig(0, 120);
      /* Aim from where the camera actually is (m11 lookAt's second stage) — ITERATED, because
       * the eye rises as the pitch dips (eye.y = target.y − sin(pitch) × boom): one pass from
       * a −0.30 rad camera lands at −0.44, whose eye is 0.5 m higher and looks over a 0.5 m
       * box (measured, tools/_m20-probe). Ten passes converge the fixed point to < 1 mrad. */
      for (let it = 0; it < 10; it++) {
        const c = V3(camOf(0).position);
        rigOf(0).yaw = Math.atan2(-(BOX.x - c.x), -(BOX.z - c.z));
        rigOf(0).pitch = Math.atan2(BOX.y - c.y, Math.hypot(BOX.x - c.x, BOX.z - c.z));
        tick(12);
      }
      tick(60);
      physics.primeQueries();
      const g = movers[0].grips;
      g.syncAim();
      eq('K6 fixture: at rest grips.aimOrigin() IS camera.position, byte for byte (the m2/m3/m4 grab fixtures see what they always did)',
         dist(g.aimOrigin(), V3(camOf(0).position)), 0);
      eq('K6 fixture: …and the rig and its twin agree at rest', offMag(0), 0);
      const restHit = g.probe();
      ok('K6 fixture: the box is under the reticle at rest, within reach', !!restHit && restHit.entity === box,
         restHit ? `${restHit.entity.id} at ${restHit.armLength.toFixed(2)} m` : 'no hit');
      const gripRest = g.tryGrab('right', movers[0].id, now());
      ok('K6 fixture: …and a grab at rest takes it', !!gripRest && gripRest.entityId === box.id, gripRest ? gripRest.entityId : 'null');
      g.release('right', 'released', now());

      // A 50 mm sideways nudge, applied in full on the next update (K2).
      rigOf(0).nudge({ x: 0.05, y: 0, z: 0 });
      tick(1);
      const twinEye = V3(twinOf(0).camera.position);
      const origin = g.aimOrigin();
      const dCam = dist(V3(camOf(0).position), twinEye);
      ok('K6c during a 50 mm nudge camera.position differs from the shake-free twin\'s eye by > 0.01 m', dCam > 0.01, `${(dCam * 1000).toFixed(2)} mm`);
      ok('K6c …while grips.aimOrigin() equals the twin\'s eye to 1e-6 on every axis — the ray starts from the un-nudged solve',
         Math.abs(origin.x - twinEye.x) <= 1e-6 && Math.abs(origin.y - twinEye.y) <= 1e-6 && Math.abs(origin.z - twinEye.z) <= 1e-6,
         `origin ${JSON.stringify(origin)} twin ${JSON.stringify(twinEye)}`);
      ok('K6c …so the origin is NOT the shaken camera (differs from camera.position by > 0.01 m)', dist(origin, V3(camOf(0).position)) > 0.01,
         `${(dist(origin, V3(camOf(0).position)) * 1000).toFixed(2)} mm`);
      const hit = g.probe();
      ok('K6d a probe mid-nudge hits the same entity as at rest', !!hit && !!restHit && hit.entity === restHit.entity,
         hit ? hit.entity.id : 'no hit');
      const dHit = hit && restHit ? dist(hit.point, restHit.point) : NaN;
      ok('K6d …at a point within 5 mm of the rest hit', dHit <= 0.005, `${(dHit * 1000).toFixed(2)} mm`);
      const gripNudged = g.tryGrab('right', movers[0].id, now());
      const dLocal = gripNudged && gripRest ? dist(gripNudged.localPoint, gripRest.localPoint) : NaN;
      ok('K6d …and a grab attempted mid-nudge succeeds exactly as at rest: same entity, grip point within 5 mm',
         !!gripNudged && !!gripRest && gripNudged.entityId === gripRest.entityId && dLocal <= 0.005,
         `${gripNudged ? gripNudged.entityId : 'null'} vs ${gripRest ? gripRest.entityId : 'null'}, ${(dLocal * 1000).toFixed(2)} mm`);
      g.release('right', 'released', now());
      lines.push(`      50 mm nudge: camera moved ${(dCam * 1000).toFixed(2)} mm, aim origin ${(dist(origin, twinEye) * 1e6).toFixed(3)} µm off the un-nudged solve, ` +
                 `hit point moved ${(dHit * 1000).toFixed(3)} mm, grip point ${(dLocal * 1000).toFixed(3)} mm`);
      tick(180); clearAll();
      // The fixture, undone: the box back where it lives, the mover back on the driveway.
      box.body.setTranslation(boxHome, true);
      box.body.setRotation(boxRot, true);
      box.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      box.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      box.body.wakeUp();
      physics.primeQueries();
      placeMover(movers[0], HOME.x, HOME.z);
      rigOf(0).yaw = 1.234; rigOf(0).pitch = -0.31;
      settleRig(0, 60);
    }
  }

  // Paused: 300 frames of nudges and updates change NOTHING in the state.
  game.setPaused(true);
  const before = JSON.stringify(game.state);
  for (let k = 0; k < 300; k++) { rigOf(0).nudge({ x: 0.02, y: 0.02, z: 0.02 }, { pitch: 5 }); tick(1); }
  eq('K6e 300 frames of nudges on a paused sim leave game.state JSON identical (was K6c before M20)', JSON.stringify(game.state), before);
  game.setPaused(false);
  clearAll(); tick(120);   // steady state before the control run

  // Running: the paths 300 nudged frames change are exactly the paths 300 idle frames change.
  const a0 = snapshot(); tick(300); const a1 = snapshot();
  const idle = diffPaths(a0, a1).sort();
  const b0 = snapshot();
  for (let k = 0; k < 300; k++) { rigOf(0).nudge({ x: 0.02, y: 0.02, z: 0.02 }, { pitch: 5 }); tick(1); }
  const b1 = snapshot();
  const nudged = diffPaths(b0, b1).sort();
  eq('K6f 300 running frames of nudges change exactly the state paths 300 idle frames change (the clock\'s; was K6d)',
     nudged.join(','), idle.join(','));
  ok('K6g …and no state path mentions the shake (was K6e)', !/shake/i.test(JSON.stringify(b1)));
  lines.push(`      idle-frame paths: ${idle.join(', ') || '(none)'}`);
  clearAll();
}

/* ── K7. prefers-reduced-motion ───────────────────────────────────────────────── */
lines.push('--- K7. the OS\'s reduced-motion preference sets the default, and is not fought ---');
{
  eq('K7 matchMedia matches → reduced motion preferred', reducedMotionPreferred({ matchMedia: () => ({ matches: true }) }), true);
  eq('K7a matchMedia does not match → not preferred', reducedMotionPreferred({ matchMedia: () => ({ matches: false }) }), false);
  eq('K7b no matchMedia at all → not preferred (never throws)', reducedMotionPreferred({}), false);
  eq('K7c a matchMedia that throws → not preferred', reducedMotionPreferred({ matchMedia: () => { throw new Error('nope'); } }), false);
  eq('K7d …and it asks for the reduce query', (() => { let q = null; reducedMotionPreferred({ matchMedia: (s) => { q = s; return { matches: false }; } }); return q; })(),
     '(prefers-reduced-motion: reduce)');
  localStorage.removeItem(SAVE_KEY);
  eq('K7e stubbed true at boot (load with reducedMotion) → the setting defaults off', load({ reducedMotion: true }).shell.cameraShake, false);
  eq('K7f stubbed false → on', load({ reducedMotion: false }).shell.cameraShake, true);
  eq('K7g …and load() with no reading is the shell default', load().shell.cameraShake, SHELL_DEFAULTS.cameraShake);
  localStorage.setItem(SAVE_KEY, JSON.stringify({ schema: SAVE_SCHEMA, shell: { cameraShake: true } }));
  eq('K7h a saved choice wins over the OS reading (record it, do not fight it)', load({ reducedMotion: true }).shell.cameraShake, true);
  localStorage.setItem(SAVE_KEY, JSON.stringify({ schema: SAVE_SCHEMA, shell: { cameraShake: false } }));
  eq('K7i …either way', load({ reducedMotion: false }).shell.cameraShake, false);
  eq('K7j a non-boolean in the save is the OS default, not a truthy string', sanitiseShell({ cameraShake: 'yes' }, { reducedMotion: true }).cameraShake, false);
  localStorage.removeItem(SAVE_KEY);
  // The card shows the boot default it would have shown.
  M.settingsStore.apply({ cameraShake: load({ reducedMotion: true }).shell.cameraShake });
  M.settingsPanel.show();
  eq('K7k …and the card shows it off', control('cameraShake').checked, false);
  eq('K7l …with every rig\'s switch off', rigOf(0).shakeEnabled, false);
  panel().querySelector('[data-act="defaults"]').click();
  eq('K7m Defaults restores the boot reading (!reducedMotion), not a bare true', control('cameraShake').checked, !M.reducedMotion);
  M.settingsPanel.hide();
  eq('K7n the boot reading is what the shell computes', M.reducedMotion, reducedMotionPreferred());
  M.settingsStore.apply({ cameraShake: true });
}

/* ── K8. the mover's own knockdown ────────────────────────────────────────────── */
lines.push('--- K8. a knockdown is one nudge, on its own seat (§5.1) ---');
{
  placeMover(movers[0], HOME.x, HOME.z);
  settleRig(0, 60);
  clearAll();
  M.shakeFrame();
  eq('K8 fixture: no knockdown, no nudge', rigOf(0).shakeMagnitude(), 0);
  const okDown = movers[0].controller.knockDown('m24');
  eq('K8a the controller went down', okDown, true);
  M.shakeFrame();
  const mag = rigOf(0).shakeMagnitude();
  near('K8b …and the render frame nudged its seat by shake.knockdown', mag, S.knockdown, 1e-9);
  ok('K8c …downward, with a roll', rigOf(0).shakeOffset().y < 0 && rigOf(0).shakeRot().roll !== 0, JSON.stringify(rigOf(0).shakeOffset()));
  M.shakeFrame();
  eq('K8d a second frame does not nudge again (one per knockdown)', rigOf(0).shakeMagnitude(), mag);
  movers[0].controller._downMs = 0;
  tick(200); clearAll();
  placeMover(movers[0], HOME.x, HOME.z);
}

/* ── K9. the overlay ──────────────────────────────────────────────────────────── */
lines.push('--- K9. the debug overlay shows the offset (§22.5) ---');
{
  const wasHidden = M.overlay.el.hidden;
  M.overlay.el.hidden = false;
  M.overlay.update(16.7, { shake: '12.3 mm clamped' });
  const text = M.overlay.el.textContent;
  ok('K9 the overlay renders a shake row with the magnitude it is handed', /shake/.test(text) && /12\.3 mm/.test(text), text.slice(0, 200));
  M.overlay.el.hidden = wasHidden;
}

/* ── J. it still runs ─────────────────────────────────────────────────────────── */
lines.push('--- J. the build survives all of the above ---');
{
  const bodies = physics.stats.bodies;
  tick(60);
  eq('J1 no bodies leaked', physics.stats.bodies, bodies);
  eq('J2 the phase is back where the suite found it', game.state.phase, PHASES.PICKUP);
  eq('J3 one seat', M.seatCount, 1);
  ok('J4 state is still plain serializable data (§22.4)',
     (() => { try { JSON.stringify(game.state); return true; } catch (e) { return false; } })());
  ok('J5 no error banner appeared during the suite', !banner().trim(), banner().slice(0, 120));
  void SIM; void SETTINGS;
}

} catch (e) {
  fails++;
  lines.push(`FAIL  suite threw  <- ${e && e.message}`);
  lines.push((e && e.stack || '').split('\n').slice(0, 6).join('\n'));
}

// TEARDOWN: the switch back on, no save left behind for the next run.
try { M.settingsStore.apply({ cameraShake: true }); for (const m of movers) m.rig.clearShake(); } catch (e) { /* the shell may not exist */ }
try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* nothing to clear */ }
emit();
