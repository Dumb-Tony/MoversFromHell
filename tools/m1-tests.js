/* Phase 1 suite — movement.
 *
 * §25.2 gate under test: "Third-person proxy, camera, jump/mantle, recover" →
 * **responsive indoors and on ramp**.
 *
 * "Responsive" cannot be asserted directly; it is a feel judgement, and §25.3 asks for a
 * playtest note instead. What CAN be asserted are the things whose absence guarantees it
 * feels bad: the player reaches full speed in a bounded time, does not sink or float, gets
 * up a 16-degree ramp, does not launch off the crest, clears a porch step without jumping,
 * mantles a ledge inside the configured band and refuses one outside it, cannot walk
 * through a wall, and can always recover.
 *
 * Driven directly through game.frame(); headless Chrome delivers 1-3 rAF callbacks in
 * total (MEASURED — Dev\INDEX.md).
 */

import { PLAYER, SIM, RECOVERY } from '../src/config.js';
import { LOCOMOTION } from '../src/player/controller.js';
import { RAMP, PLATFORM, OBSTACLES, ROOM, APERTURES } from '../src/render/scene.js';

const lines = [];
let passes = 0, fails = 0;
function ok(name, cond, detail = '') {
  if (cond) { passes++; lines.push(`PASS  ${name}`); }
  else { fails++; lines.push(`FAIL  ${name}${detail ? '  <- ' + detail : ''}`); }
}
const eq   = (n, a, b) => ok(n, a === b, `got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const near = (n, a, b, tol) => ok(n, Math.abs(a - b) <= tol, `got ${a}, want ${b} +/- ${tol}`);

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

/* Emit BEFORE awaiting boot. Boot is async now (Rapier decodes WASM), so a boot failure
 * used to produce a completely blank page and the harness reported only "probably crashed
 * before the harness ran" — no error, no clue. A silent page is the one failure mode that
 * teaches nothing, so the suite announces itself first and reports the boot error itself. */
emit('booting...');

let M;
try {
  M = await window.__MFH_READY;
} catch (e) {
  fails++;
  lines.push(`FAIL  boot threw  <- ${e && e.message}`);
  lines.push((e && e.stack || '').split('\n').slice(0, 6).join('\n'));
  emit();
  throw e;
}

const { game, player, physics, rig, world, input } = M;
const STEP = SIM.stepMs;

/* ── driving helpers ─────────────────────────────────────────────────────── */

/** Put the player somewhere and let them settle onto the ground. */
function place(x, z, y = 0.2, settleSteps = 90) {
  player.hardSetPosition({ x, y, z });
  player._vel.x = 0; player._vel.z = 0;
  player.velocityY = 0;
  player._climb = null;
  drive(settleSteps, { move: { x: 0, y: 0 } });
  return player.position;
}

/** Run N sim steps with a fixed intent. Bypasses Input so the suite does not depend on
 *  key codes, and drives the controller exactly as the 'player' system does. */
function drive(steps, over = {}) {
  const yaw = over.yaw !== undefined ? over.yaw : 0;
  const fwd = { x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw) };
  const rgt = { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) };
  for (let i = 0; i < steps; i++) {
    const intent = {
      move: over.move || { x: 0, y: 0 },
      forward: fwd, right: rgt,
      run: !!over.run, brace: !!over.brace,
      jump: !!over.jump && i === 0,          // an edge, not a held key
      recover: !!over.recover && i === 0,
    };
    player.step(STEP, intent);
    physics.step();
  }
  return player.position;
}

/** Walk toward a world point for at most `steps`, stopping when close enough. */
function walkTo(tx, tz, steps = 600, opts = {}) {
  for (let i = 0; i < steps; i++) {
    const p = player.position;
    const dx = tx - p.x, dz = tz - p.z;
    if (Math.hypot(dx, dz) < 0.25) break;
    const yaw = Math.atan2(-dx, -dz);          // face the target (forward = -Z at yaw 0)
    drive(1, { move: { x: 0, y: 1 }, yaw, run: !!opts.run });
  }
  return player.position;
}

/* ── A. the capsule and the ground ───────────────────────────────────────── */
try {
lines.push('--- A. capsule, gravity, ground (GDD §5.1) ---');
{
  ok('A1 physics world exists with the vendored Rapier', !!physics && !!physics.R);
  near('A2 the solver steps at exactly the sim rate', physics.world.timestep, SIM.stepMs / 1000, 1e-9);
  ok('A3 static geometry was built', physics.stats.colliders > 10, `${physics.stats.colliders} colliders`);

  // Capsule total height must equal PLAYER.height, or every clearance number is wrong.
  near('A4 capsule half-height + radius matches PLAYER.height',
       2 * PLAYER.capsuleHalfHeight + 2 * PLAYER.radius, PLAYER.height, 1e-9);

  const p = place(0, 6);
  near('A5 a dropped player rests with feet on the ground', p.y, 0, 0.05);
  ok('A6 …and reports grounded', player.grounded);
  eq('A7 …in the grounded state', player.state, LOCOMOTION.GROUNDED);

  // Not sinking is as important as not floating: a capsule that settles below zero makes
  // every later height comparison (cargo threshold, zone membership) subtly wrong.
  ok('A8 the player does not sink below the floor', p.y > -0.02, `y ${p.y.toFixed(4)}`);
}
emit('running...');

/* ── B. responsiveness ───────────────────────────────────────────────────── */
lines.push('--- B. responsiveness (GDD §25.2 phase-1 gate) ---');
{
  place(0, 6);
  // §5.1: "the player should not wrestle the avatar merely to cross a room." Concretely,
  // full speed must arrive fast. accel 28 m/s^2 to 3.1 m/s is ~0.11 s = ~7 steps.
  let stepsToFull = -1;
  for (let i = 0; i < 60; i++) {
    drive(1, { move: { x: 0, y: 1 } });
    if (player.horizontalSpeed >= PLAYER.walkSpeed - 0.05) { stepsToFull = i + 1; break; }
  }
  ok('B1 reaches walk speed within 15 steps (0.25 s)', stepsToFull > 0 && stepsToFull <= 15,
     `took ${stepsToFull} steps`);

  near('B2 walk speed matches config', player.horizontalSpeed, PLAYER.walkSpeed, 0.06);

  drive(40, { move: { x: 0, y: 1 }, run: true });
  near('B3 sprint reaches run speed', player.horizontalSpeed, PLAYER.runSpeed, 0.08);
  ok('B4 sprint is meaningfully faster than walking', PLAYER.runSpeed > PLAYER.walkSpeed * 1.4);

  // Stopping must be fast too, or the player overshoots every doorway.
  let stepsToStop = -1;
  for (let i = 0; i < 60; i++) {
    drive(1, { move: { x: 0, y: 0 } });
    if (player.horizontalSpeed < 0.05) { stepsToStop = i + 1; break; }
  }
  ok('B5 stops within 15 steps of releasing the stick', stepsToStop > 0 && stepsToStop <= 15,
     `took ${stepsToStop} steps`);

  // Actually covers ground: 60 steps of walking is ~1 s, so ~3.1 m.
  const from = place(0, 6);
  drive(60, { move: { x: 0, y: 1 } });
  const travelled = Math.hypot(player.position.x - from.x, player.position.z - from.z);
  near('B6 one second of walking covers ~walkSpeed metres', travelled, PLAYER.walkSpeed, 0.5);

  // Movement is camera-relative (§4.4): the same input at a rotated yaw goes elsewhere.
  place(0, 6);
  drive(60, { move: { x: 0, y: 1 }, yaw: 0 });
  const northish = { ...player.position };
  place(0, 6);
  drive(60, { move: { x: 0, y: 1 }, yaw: Math.PI / 2 });
  const eastish = { ...player.position };
  ok('B7 movement is camera-relative, not world-fixed',
     Math.hypot(northish.x - eastish.x, northish.z - eastish.z) > 2.0);
  ok('B8 forward at yaw 0 travels toward -Z', northish.z < 5.0, `z ${northish.z.toFixed(2)}`);
  ok('B9 forward at yaw PI/2 travels toward -X', eastish.x < -1.0, `x ${eastish.x.toFixed(2)}`);

  // §5.1 braced is slower. Nothing can be gripped yet, so drive the flag directly.
  place(0, 6);
  drive(40, { move: { x: 0, y: 1 }, brace: true });
  near('B10 braced speed is the configured fraction of walking',
       player.horizontalSpeed, PLAYER.walkSpeed * PLAYER.braceSpeedMult, 0.06);
  eq('B11 …and reports the braced state', player.state, LOCOMOTION.BRACED);
}
emit('running...');

/* ── C. the ramp (the named half of the gate) ────────────────────────────── */
lines.push('--- C. ramp (GDD §25.2 "responsive ... on ramp", §9.1) ---');
{
  const rampDeg = RAMP.angleRad * 180 / Math.PI;
  ok('C1 the ramp is shallower than the climb limit', rampDeg < PLAYER.maxSlopeClimbDeg,
     `ramp ${rampDeg.toFixed(1)} deg vs limit ${PLAYER.maxSlopeClimbDeg}`);

  // Start at the low end of the ramp and walk up it toward -Z.
  place(RAMP.x, RAMP.z + RAMP.length / 2 + 0.6);
  const bottom = player.position.y;
  walkTo(PLATFORM.x, PLATFORM.z, 900);
  const top = player.position.y;
  ok('C2 walking up the ramp gains height', top - bottom > 0.8,
     `rose ${(top - bottom).toFixed(2)} m from ${bottom.toFixed(2)}`);
  ok('C3 …and arrives on the platform', Math.abs(top - PLATFORM.y) < 0.25,
     `y ${top.toFixed(3)} vs platform ${PLATFORM.y}`);
  ok('C4 …still grounded, not airborne', player.grounded, `state ${player.state}`);

  // Walking DOWN a slope must not launch the player: that is what snap-to-ground is for,
  // and without it every descent becomes a series of small involuntary jumps.
  place(PLATFORM.x, PLATFORM.z, PLATFORM.y + 0.15);
  let airborneSteps = 0, maxHopY = -Infinity;
  for (let i = 0; i < 420; i++) {
    drive(1, { move: { x: 0, y: 1 }, yaw: Math.PI });     // face +Z, back down the ramp
    if (!player.grounded) airborneSteps++;
    maxHopY = Math.max(maxHopY, player.position.y);
    if (player.position.y < 0.05) break;
  }
  ok('C5 walking down the ramp keeps the player on the ground',
     airborneSteps <= 12, `${airborneSteps} airborne steps of 420`);
  ok('C6 …and reaches the bottom', player.position.y < 0.2, `y ${player.position.y.toFixed(3)}`);
}
emit('running...');

/* ── D. steps, mantle, refusal (§5.1 climbing) ───────────────────────────── */
lines.push('--- D. autostep and mantle (GDD §5.1, §13.1) ---');
{
  const byId = (id) => OBSTACLES.find((o) => o.id === id);

  // Autostep: a porch step must be walkable without touching jump (§13.1).
  const step = byId('porchStep');
  ok('D1 the porch step is below the autostep limit', step.top < PLAYER.stepHeight,
     `${step.top} vs ${PLAYER.stepHeight}`);
  place(step.x, step.z + step.d / 2 + 1.0);
  walkTo(step.x, step.z, 400);
  ok('D2 the player walks up a porch step without jumping',
     player.position.y > step.top - 0.08, `y ${player.position.y.toFixed(3)} vs top ${step.top}`);

  // Mantle: inside the band it must work; outside it must refuse.
  for (const id of ['ledgeLow', 'ledgeHigh']) {
    const o = byId(id);
    place(o.x, o.z + o.d / 2 + 0.9);
    // Walk into the face, then press jump while still pushing forward.
    const yaw = Math.atan2(-(o.x - player.position.x), -(o.z - player.position.z));
    drive(45, { move: { x: 0, y: 1 }, yaw });
    const beforeY = player.position.y;
    drive(1, { move: { x: 0, y: 1 }, yaw, jump: true });
    const started = player.state === LOCOMOTION.CLIMBING;
    ok(`D3.${id} a ${o.top} m ledge starts a mantle`, started, `state ${player.state}`);
    if (started) {
      drive(Math.ceil(PLAYER.mantleSeconds * 60) + 30, { move: { x: 0, y: 0 }, yaw });
      ok(`D4.${id} …and finishes on top`, player.position.y > o.top - 0.12,
         `y ${player.position.y.toFixed(3)} vs top ${o.top} (was ${beforeY.toFixed(2)})`);
      ok(`D5.${id} …returning to grounded`, player.state === LOCOMOTION.GROUNDED, `state ${player.state}`);
    }
  }

  // Above the band it is a wall, and must stay one.
  const tall = byId('tooTall');
  ok('D6 the refusal obstacle really is above the mantle limit', tall.top > PLAYER.mantleMaxHeight,
     `${tall.top} vs ${PLAYER.mantleMaxHeight}`);
  place(tall.x, tall.z + tall.d / 2 + 0.9);
  const yawT = Math.atan2(-(tall.x - player.position.x), -(tall.z - player.position.z));
  drive(45, { move: { x: 0, y: 1 }, yaw: yawT });
  drive(1, { move: { x: 0, y: 1 }, yaw: yawT, jump: true });
  ok('D7 a wall above the limit refuses to mantle', player.state !== LOCOMOTION.CLIMBING,
     `state ${player.state}`);
  drive(120, { move: { x: 0, y: 1 }, yaw: yawT });
  ok('D8 …and the player does not end up on top of it', player.position.y < tall.top - 0.3,
     `y ${player.position.y.toFixed(3)}`);

  // Jumping on flat ground still works and comes back down.
  place(0, 6);
  drive(1, { move: { x: 0, y: 0 }, jump: true });
  let peak = -Infinity;
  for (let i = 0; i < 120; i++) { drive(1, {}); peak = Math.max(peak, player.position.y); }
  ok('D9 a jump leaves the ground', peak > 0.4, `peak ${peak.toFixed(3)}`);
  near('D10 …and lands back at ground level', player.position.y, 0, 0.05);
  // v^2/2g for 4.6 m/s is ~1.08 m; allow generous slack for the step cadence.
  near('D11 jump apex matches the configured jump velocity',
       peak, (PLAYER.jumpVelocity * PLAYER.jumpVelocity) / (2 * -SIM.gravity), 0.35);
}
emit('running...');

/* ── E. walls, doorways, indoors ─────────────────────────────────────────── */
lines.push('--- E. collision indoors (GDD §8.1, §25.2 "responsive indoors") ---');
{
  // A wall is solid. Walk hard into the aperture wall away from any opening.
  place(-1.6, 0.5);
  const beforeZ = player.position.z;
  drive(240, { move: { x: 0, y: 1 }, yaw: 0, run: true });   // straight at z = -2
  ok('E1 the player cannot walk through a wall', player.position.z > -2.2,
     `z ${player.position.z.toFixed(3)} (started ${beforeZ.toFixed(2)})`);

  // A doorway is passable. The 0.91 m front door is wider than the 0.64 m capsule.
  const front = APERTURES.find((a) => a.id === 'front36');
  ok('E2 the capsule is narrower than the widest door', PLAYER.radius * 2 < front.gap,
     `capsule ${(PLAYER.radius * 2).toFixed(2)} vs gap ${front.gap}`);
  place(front.x, 1.2);
  walkTo(front.x, -4.0, 700);
  ok('E3 the player can walk through the front doorway into the room',
     player.position.z < -2.4, `z ${player.position.z.toFixed(3)}`);
  ok('E4 …and is inside the room bounds',
     player.position.x > ROOM.minX && player.position.x < ROOM.maxX, `x ${player.position.x.toFixed(2)}`);

  // Indoors, the ceiling must stop a jump rather than letting the player through it.
  const insideY = player.position.y;
  drive(1, { move: { x: 0, y: 0 }, jump: true });
  drive(90, {});
  ok('E5 the room ceiling contains a jump', player.position.y < ROOM.wallH,
     `y ${player.position.y.toFixed(3)} vs ceiling ${ROOM.wallH}`);
  near('E6 …and the player lands back on the floor', player.position.y, insideY, 0.06);

  // The camera pulls in indoors rather than sitting outside the wall (§4.1).
  rig.yaw = 0; rig.pitch = -0.15; rig.setDistance(5);
  for (let i = 0; i < 30; i++) rig.update(player.position, 1 / 60);
  const camToPlayer = Math.hypot(
    M.camera.position.x - player.position.x, M.camera.position.z - player.position.z);
  ok('E7 the camera compresses indoors instead of clipping outside',
     camToPlayer < 5.0, `distance ${camToPlayer.toFixed(2)} of a requested 5.0`);
}
emit('running...');

/* ── F. recovery (§18.3) ─────────────────────────────────────────────────── */
lines.push('--- F. recovery (GDD §18.3) ---');
{
  place(0, 6);
  drive(Math.ceil(RECOVERY.stableTransformIntervalMs / STEP) + 10, { move: { x: 0, y: 0 } });
  const banked = { ...player.lastStable };
  ok('F1 a settled player banks a last-stable transform',
     Math.hypot(banked.x - 0, banked.z - 6) < 0.6, `banked ${JSON.stringify(banked)}`);

  // Fall out of the world; recovery must fire on its own after the grace period.
  const before = player.recoveries;
  player.hardSetPosition({ x: 0, y: -40, z: 6 });
  drive(Math.ceil((RECOVERY.outOfBoundsGraceSeconds + 0.5) * 60), {});
  ok('F2 falling out of the world triggers automatic recovery', player.recoveries > before,
     `${player.recoveries - before} recoveries`);
  ok('F3 …placing the player back at the banked transform',
     Math.hypot(player.position.x - banked.x, player.position.z - banked.z) < 0.6,
     `at ${JSON.stringify(player.position)}`);
  ok('F4 …and above ground', player.position.y > -1, `y ${player.position.y.toFixed(2)}`);

  // Manual recover (R) works at any time.
  place(0, 6);
  drive(Math.ceil(RECOVERY.stableTransformIntervalMs / STEP) + 10, { move: { x: 0, y: 0 } });
  walkTo(3.5, 6.5, 200);
  const movedAway = { ...player.position };
  const n = player.recoveries;
  drive(1, { recover: true });
  ok('F5 the recover action fires on demand', player.recoveries === n + 1);
  ok('F6 …and actually moves the player back',
     Math.hypot(player.position.x - movedAway.x, player.position.z - movedAway.z) > 0.5,
     `from ${JSON.stringify(movedAway)} to ${JSON.stringify(player.position)}`);

  // §18.3: recovery must not bank an unsafe spot. Falling must never update lastStable.
  const stableBefore = { ...player.lastStable };
  player.hardSetPosition({ x: 40, y: 12, z: 40 });
  drive(30, {});
  ok('F7 a mid-air position is never banked as stable',
     player.lastStable.x === stableBefore.x && player.lastStable.z === stableBefore.z,
     `banked ${JSON.stringify(player.lastStable)}`);
}
emit('running...');

/* ── G. the live loop still holds ────────────────────────────────────────── */
lines.push('--- G. integration (GDD §22.3, §26.6) ---');
{
  place(0, 6);
  const stepsBefore = game.clock.stepCount;
  const bodiesBefore = physics.stats.bodies;
  // Guard the leak check against passing vacuously: comparing 0 to 0 is not evidence that
  // nothing leaked, and that is exactly how the broken counter hid behind this assertion.
  ok('G1a the body count is real before the leak check', bodiesBefore > 0, `${bodiesBefore} bodies`);
  for (let i = 0; i < 120; i++) game.frame(16.7);
  ok('G1 the real game loop drives physics', game.clock.stepCount > stepsBefore);
  eq('G2 no bodies leak over 120 frames', physics.stats.bodies, bodiesBefore);
  near('G3 sim time still never drifts', game.clock.simTimeMs, game.clock.stepCount * STEP, 1e-9);
  ok('G4 player state is mirrored into game state',
     Number.isFinite(game.state.players.p0.position.x));
  ok('G5 …and stays JSON-serializable with physics live (§22.4)',
     (() => { try { JSON.parse(JSON.stringify(game.state)); return true; } catch (e) { return false; } })());
  ok('G6 the locomotion state is a declared one',
     Object.values(LOCOMOTION).includes(game.state.players.p0.locomotion),
     `${game.state.players.p0.locomotion}`);
  ok('G7 no error banner appeared during the suite', !document.getElementById('err-banner'));
}
} catch (e) {
  fails++;
  lines.push(`FAIL  suite threw  <- ${e && e.message}`);
  lines.push((e && e.stack || '').split('\n').slice(0, 5).join('\n'));
}
emit();
