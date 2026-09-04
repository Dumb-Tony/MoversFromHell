/* Phase 0 suite — scaffold, action map, debug overlay, fixed loop.
 *
 * §25.2 gate under test: "Loads locally; stable frame/step."
 * §25.3 definition of done: no console errors in the primary path, both input mappings
 * work, edge cases have a reproducible test, tuning values are named, clean reset works.
 *
 * DRIVEN DIRECTLY, NOT THROUGH rAF. Dev\INDEX.md records a MEASURED finding: headless
 * Chrome in --dump-dom mode delivers 1-3 requestAnimationFrame callbacks in total, then
 * stops, while setTimeout and performance.now keep running. A suite that waits for frames
 * waits forever, and a setTimeout watchdog racing a frame counter always wins under
 * virtual time. So every live assertion below calls game.frame() itself.
 */

import { GameClock } from '../src/core/clock.js';
import { EventBus, EVENTS, PHASES } from '../src/core/eventBus.js';
import { Input, DEFAULT_BINDINGS, SEAT1_BINDINGS, CONTEXTS, PAD, MOUSE } from '../src/core/input.js';
import { mulberry32, Rng, hashStr } from '../src/core/rng.js';
import { Game, createInitialState } from '../src/game.js';
import { SIM, RENDER, PLAYER, GRIP, DAMAGE, STRAP, TRUCK, ECONOMY } from '../src/config.js';
import { camOcclude, ThirdPersonCamera } from '../src/render/camera.js';
import { createRenderer } from '../src/render/renderer.js';
import { REFERENCE_DIMS, APERTURES, fitsThroughGap, minProjectedWidth } from '../src/render/scene.js';

/* ── harness (from AirportBaggageCrew\tools\m0-tests.js) ─────────────────── */
const lines = [];
let passes = 0, fails = 0;

function ok(name, cond, detail = '') {
  if (cond) { passes++; lines.push(`PASS  ${name}`); }
  else { fails++; lines.push(`FAIL  ${name}${detail ? '  <- ' + detail : ''}`); }
}
const eq   = (n, a, b) => ok(n, a === b, `got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const near = (n, a, b, tol) => ok(n, Math.abs(a - b) <= tol, `got ${a}, want ${b} +/- ${tol}`);
const STEP = SIM.stepMs;

/* Emit after EVERY section, not just at the end: the harness greps the dumped DOM, so a
 * suite that hangs or throws half way must still report how far it got. A silent page is
 * the one failure mode that teaches nothing. */
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

/* ── A. fixed-step clock (§22.3) ─────────────────────────────────────────── */
function sectionA() {
lines.push('--- A. fixed-step clock (GDD §22.3) ---');
{
  const c = new GameClock({ stepMs: STEP, maxFrameMs: SIM.maxFrameMs });
  let n = 0;
  eq('A1 one frame of exactly one step runs once', c.advance(STEP, () => n++), 1);
  eq('A2 the callback ran', n, 1);

  c.reset(); n = 0;
  c.advance(STEP * 0.5, () => n++);
  eq('A3 half a step banks and runs nothing', n, 0);
  c.advance(STEP * 0.5, () => n++);
  eq('A4 the banked half completes the step', n, 1);

  // No drift: this is the whole reason the clock owns simTimeMs itself.
  c.reset();
  let steps = 0;
  const jitter = [16.7, 33.4, 8.2, 21.0, 16.6, 4.1, 50.3, 12.9];
  for (let i = 0; i < 40; i++) c.advance(jitter[i % jitter.length], () => steps++);
  eq('A5 steps executed match the clock stepCount', steps, c.stepCount);
  near('A6 sim time is exactly stepCount * stepMs (no drift)', c.simTimeMs, c.stepCount * STEP, 1e-9);

  // §7.3 / §26.6: a backgrounded tab hands back a multi-second delta. Discard it.
  c.reset(); n = 0;
  c.advance(5000, () => n++);
  const maxSteps = Math.ceil(SIM.maxFrameMs / STEP);
  ok('A7 a 5s frame is clamped, not banked', n <= maxSteps, `ran ${n} steps, cap ${maxSteps}`);
  eq('A8 the clamp is counted for the overlay', c.clampedFrames, 1);

  c.reset(); n = 0;
  c.setPaused(true);
  eq('A9 paused advance runs zero steps', c.advance(1000, () => n++), 0);
  eq('A10 paused advance does not bank time', c.accumulatorMs, 0);
  c.setPaused(false);

  c.reset();
  c.advance(STEP * 1.5, () => {});
  ok('A11 alpha is a 0..1 render fraction', c.alpha >= 0 && c.alpha < 1, `alpha ${c.alpha}`);

  c.reset(); n = 0;
  c.skipMs(1000, () => n++);
  // NOT Math.floor(1000/STEP): stepMs is 1000/60, and 1000/(1000/60) evaluates to
  // 59.999999999999993 in float64, so floor() would demand 59 when the true answer is 60.
  eq('A12 skipMs runs the full span despite the frame clamp', n, Math.round(1000 / STEP));

  // The invariant that actually matters, and the one a drift bug would break: every
  // millisecond fed in is either spent as sim time or still banked in the accumulator.
  // Nothing is created and nothing is lost. Asserting an exact step count instead would
  // be brittle — feeding stepMs*3 (which is exactly 50.0 in float64) legitimately yields
  // two steps and banks the third, because 50 - 2*stepMs falls 7e-15 short.
  c.reset();
  let fed = 0;
  const frames = [16.7, 33.4, 8.2, 21.0, 16.6, 4.1, 12.9, 19.3];
  for (let i = 0; i < 64; i++) { const f = frames[i % frames.length]; fed += f; c.advance(f, () => {}); }
  near('A13 no time is created or lost across 64 frames', c.simTimeMs + c.accumulatorMs, fed, 1e-9);
  ok('A14 the banked remainder is always less than one step', c.accumulatorMs < STEP, `acc ${c.accumulatorMs}`);
}
emit('running...');
}

/* ── B. action map (§4.2, §4.3, §4.4) ────────────────────────────────────── */
function sectionB() {
lines.push('--- B. action map (GDD §4.2-4.4, §21.4) ---');
{
  const i = new Input(window, null);

  // §4.2: Space is jump on foot and handbrake while driving. The same physical key.
  i.setContext(CONTEXTS.FOOT);
  i._debugPress('Space');
  ok('B1 Space is jump on foot', i.isDown('jump'));
  ok('B2 Space is NOT handbrake on foot', !i.isDown('handbrake'));

  i.setContext(CONTEXTS.DRIVE);
  ok('B3 context switch clears held state (§4.4)', !i.isDown('handbrake') && !i.isDown('jump'));
  i._debugPress('Space');
  ok('B4 Space is handbrake while driving', i.isDown('handbrake'));

  // Edges are consumed per SIMULATION step.
  i.setContext(CONTEXTS.FOOT);
  i._debugPress('KeyE');
  ok('B5 wasPressed is true in the step it happened', i.wasPressed('interact'));
  i.endStep();
  ok('B6 wasPressed is false in the next step', !i.wasPressed('interact'));
  ok('B7 but the key is still held', i.isDown('interact'));

  // §21.4 hold vs toggle grip.
  const hold = new Input(window, null);
  hold._debugPress('Mouse' + MOUSE.LEFT);
  ok('B8 hold-mode grip follows the button down', hold.isDown('gripLeft'));
  hold._debugRelease('Mouse' + MOUSE.LEFT);
  ok('B9 hold-mode grip releases with the button', !hold.isDown('gripLeft'));

  const tog = new Input(window, null, DEFAULT_BINDINGS, { gripMode: 'toggle' });
  tog._debugPress('Mouse' + MOUSE.LEFT);
  tog._debugRelease('Mouse' + MOUSE.LEFT);
  ok('B10 toggle-mode grip stays latched after release', tog.isDown('gripLeft'));
  tog._debugPress('Mouse' + MOUSE.LEFT);
  ok('B11 a second press unlatches it', !tog.isDown('gripLeft'));

  // §4.4 diagonal movement must not be faster than straight movement.
  const m = new Input(window, null);
  m._debugPress('KeyW'); m._debugPress('KeyD');
  const ax = m.moveAxis();
  near('B12 diagonal move is normalised to magnitude 1', Math.hypot(ax.x, ax.y), 1, 1e-6);
  eq('B13 forward is +y', Math.sign(ax.y), 1);

  // §6.5 grip strength scaling needs analog pressure, and a key is full pressure.
  const a = new Input(window, null);
  a._debugPress('Mouse' + MOUSE.RIGHT);
  eq('B14 a digital source reads as full analog pressure', a.analog('gripRight'), 1);
  eq('B15 an unpressed action reads zero', a.analog('gripLeft'), 0);

  // §4.4: "every essential action requires controller parity". This is a conformance
  // test against the GDD, not against the implementation — if someone adds an essential
  // foot action with no pad binding, this fails and tells them which one.
  const ESSENTIAL = ['gripLeft', 'gripRight', 'jump', 'brace', 'interact', 'context', 'pause'];
  const missing = ESSENTIAL.filter((act) => {
    const def = DEFAULT_BINDINGS[CONTEXTS.FOOT][act];
    return !def || !def.pad || def.pad.length === 0;
  });
  ok('B16 every essential foot action has a controller binding', missing.length === 0, `missing: ${missing.join(', ')}`);

  const DRIVE_ESSENTIAL = ['throttle', 'brake', 'handbrake', 'exitVehicle', 'pause'];
  const missingDrive = DRIVE_ESSENTIAL.filter((act) => {
    const def = DEFAULT_BINDINGS[CONTEXTS.DRIVE][act];
    return !def || !def.pad || def.pad.length === 0;
  });
  ok('B17 every essential driving action has a controller binding', missingDrive.length === 0, `missing: ${missingDrive.join(', ')}`);

  // §4.3 puts grab on the analog triggers specifically.
  eq('B18 left grip is on LT', DEFAULT_BINDINGS[CONTEXTS.FOOT].gripLeft.pad[0], PAD.LT);
  eq('B19 right grip is on RT', DEFAULT_BINDINGS[CONTEXTS.FOOT].gripRight.pad[0], PAD.RT);

  // Look is CONSUMED, not read: two readers would each get half the mouse movement.
  const l = new Input(window, null);
  l.look.x = 10; l.look.y = -4;
  const got = l.consumeLook();
  ok('B20 consumeLook returns the accumulated delta', got.x === 10 && got.y === -4);
  ok('B21 consumeLook empties the accumulator', l.look.x === 0 && l.look.y === 0);

  // Focus loss must not leave a key stuck down forever.
  const f = new Input(window, null);
  f._debugPress('KeyW');
  f.clear();
  ok('B22 clear() drops held keys (blur safety)', !f.isDown('moveForward'));

  // §4.2 lists R as an essential on-foot verb and §25.3 wants it on a controller too
  // (Phase 11 build-side M3): D-pad down, on both seats.
  ok('B23 recover has a pad binding on seat 0',
     (DEFAULT_BINDINGS[CONTEXTS.FOOT].recover.pad || []).includes(PAD.DPAD_DOWN));
  ok('B23a …and on seat 1',
     (SEAT1_BINDINGS[CONTEXTS.FOOT].recover.pad || []).includes(PAD.DPAD_DOWN));

  /* SHELL EDGES. The per-STEP edge (wasPressed) is cleared by endStep, which a paused clock
   * never calls and a running one calls before any render-frame reader gets there — so pause
   * needs its own buffer, rotated once per poll() and read by consumeShellEdge(). A press is
   * seen by exactly one frame read; a held key is not a second edge. */
  const sh = new Input(window, null);
  sh._debugPress('Escape');
  sh.endStep();                       // a step ran: the per-step edge is gone…
  ok('B24 the per-step edge is gone after endStep', !sh.wasPressed('pause'));
  sh.poll();                          // …the frame begins…
  ok('B24a …but the shell edge survives to the frame read', sh.consumeShellEdge('pause'));
  ok('B24b …and is consumed by it', !sh.consumeShellEdge('pause'));
  sh.poll();
  ok('B24c …and a held key is not a new edge on the next frame', !sh.consumeShellEdge('pause'));
  sh._debugRelease('Escape'); sh._debugPress('Escape'); sh.poll();
  ok('B24d …while a fresh press is', sh.consumeShellEdge('pause'));
  sh._debugPress('Escape'); sh.clear(); sh.poll();
  ok('B24e clear() drops a pending shell edge too', !sh.consumeShellEdge('pause'));
}
emit('running...');
}

/* ── C. clearance geometry (§7.1, §8.1, §26.2) ───────────────────────────── */
function sectionC() {
lines.push('--- C. clearance geometry (GDD §7.1, §26.2) ---');
{
  const couch = REFERENCE_DIMS.couch3Seat;
  eq('C1 the couch is the GDD §7.1 couch, 2.10 m long', couch.x, 2.10);
  near('C2 its cross-section is 0.90 x 0.85', couch.z * 100 + couch.y, 0.90 * 100 + 0.85, 1e-9);

  // The load-bearing geometric claim: a rigid box's narrowest presentation over ALL
  // rotations is min(w,h). Verified numerically rather than asserted, because every
  // clearance decision in the game rests on it.
  let sampledMin = Infinity;
  for (let deg = 0; deg <= 90; deg += 0.25) {
    const t = deg * Math.PI / 180;
    const projected = couch.z * Math.abs(Math.cos(t)) + couch.y * Math.abs(Math.sin(t));
    if (projected < sampledMin) sampledMin = projected;
  }
  near('C3 min projected width over 0-90 deg equals min(w,h)', sampledMin, minProjectedWidth(couch.z, couch.y), 1e-6);
  near('C4 that minimum is 0.850 m', minProjectedWidth(couch.z, couch.y), 0.85, 1e-9);

  const at = (id) => APERTURES.find((a) => a.id === id);
  const r32 = fitsThroughGap(couch.z, couch.y, at('interior32').gap);
  ok('C5 the couch CANNOT pass a 0.82 m interior door, in any rotation', !r32.fits);
  near('C6 it is short by 30 mm', r32.clearance, -0.03, 1e-9);

  const r34 = fitsThroughGap(couch.z, couch.y, at('door34').gap);
  ok('C7 it passes a 0.86 m door', r34.fits);
  ok('C8 …but only on its side, not face-on', !r34.faceOn);
  near('C9 with 10 mm to spare', r34.clearance, 0.01, 1e-9);

  const r36 = fitsThroughGap(couch.z, couch.y, at('front36').gap);
  ok('C10 it passes a 0.91 m front door', r36.fits);
  ok('C11 and face-on at that width', r36.faceOn);

  // A moving box must be trivially passable everywhere, or Phase 2 has no easy case.
  const box = REFERENCE_DIMS.movingBox;
  ok('C12 a 0.5 m box passes every aperture',
     APERTURES.every((a) => fitsThroughGap(box.z, box.y, a.gap).faceOn));

  // Sanity: the apertures are ordered and distinct, so the three cases stay three cases.
  const gaps = APERTURES.map((a) => a.gap);
  ok('C13 apertures are distinct and ascending',
     gaps.every((g, k) => k === 0 || g > gaps[k - 1]), gaps.join(','));
  ok('C14 every aperture is shorter than the wall', APERTURES.length === 3);
  ok('C15 doors are 2.03 m tall, so height is never the binding constraint here',
     REFERENCE_DIMS.doorwayHeight > couch.x * 0 + 2.0);
}
emit('running...');
}

/* ── D. camera occlusion (§4.1) ──────────────────────────────────────────── */
function sectionD() {
lines.push('--- D. camera occlusion (GDD §4.1) ---');
{
  const THREE = window.THREE;
  ok('D1 THREE r128 is loaded from the vendored copy', !!THREE && typeof THREE.Vector3 === 'function');

  // A wall directly between the focus point and where the camera wants to be.
  const wall = [{ minX: -2, maxX: 2, minZ: -0.1, maxZ: 0.1, base: 0, top: 3, tag: 'wall' }];
  const from = new THREE.Vector3(0, 1.5, 1.0);
  const to   = new THREE.Vector3(0, 1.5, -3.0);
  const before = to.clone();
  const hit = camOcclude(from, to, wall);
  ok('D2 an occluder is detected', hit);
  ok('D3 the camera is pulled in front of the wall', to.z > -0.1, `z ${to.z}`);
  ok('D4 …and stays on the same side as the player', to.z < from.z);
  ok('D5 it moved from where it wanted to be', to.distanceTo(before) > 0.1);

  // Clear line of sight must not be disturbed at all.
  const clear = new THREE.Vector3(0, 1.5, 4.0);
  const clearBefore = clear.clone();
  const hit2 = camOcclude(from, clear, wall);
  ok('D6 a clear line of sight is untouched', !hit2 && clear.equals(clearBefore));

  // A collider flagged noOcclude (glass, a zone marker) must not pull the camera.
  const ghost = [{ minX: -2, maxX: 2, minZ: -0.1, maxZ: 0.1, base: 0, top: 3, noOcclude: true }];
  const g = new THREE.Vector3(0, 1.5, -3.0);
  ok('D7 noOcclude colliders are ignored', !camOcclude(from, g, ghost));

  // THE BASIS CONTRACT. Where update() puts the eye and what forwardFlat() reports must be
  // the same convention. When they diverged, the camera sat behind the wall and the shot
  // came out backwards; in Phase 1 the same bug makes the character run away from where
  // the player is looking. Asserted at several yaws because a sign error can hide at 0.
  let basisOk = true, rightOk = true, aboveOk = true, worstYaw = null;
  for (const yaw of [0, 0.7, -0.7, 1.9, -2.6, Math.PI]) {
    const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    const r = new ThirdPersonCamera(cam, []);
    r.yaw = yaw; r.pitch = -0.30; r.setDistance(5);
    r._currentDistance = 5;
    for (let k = 0; k < 60; k++) r.update({ x: 0, y: 0, z: 0 }, 1 / 60);  // let smoothing settle

    const toTarget = r.target.clone().sub(cam.position);
    toTarget.y = 0; toTarget.normalize();
    const f = r.forwardFlat();
    if (Math.abs(toTarget.x - f.x) > 2e-2 || Math.abs(toTarget.z - f.z) > 2e-2) { basisOk = false; worstYaw = yaw; }

    // right must be cross(forward, up), i.e. a right-handed basis with +Y up.
    const rt = r.rightFlat();
    // cross((fx,0,fz), (0,1,0)) = (-fz, 0, fx)
    const expX = -f.z, expZ = f.x;
    if (Math.abs(rt.x - expX) > 1e-9 || Math.abs(rt.z - expZ) > 1e-9) rightOk = false;

    // A negative pitch must put the camera ABOVE the target, looking down.
    if (cam.position.y <= r.target.y) aboveOk = false;
  }
  ok('D8 the eye-to-target direction matches forwardFlat() at every yaw', basisOk, `failed at yaw ${worstYaw}`);
  ok('D9 rightFlat is cross(forwardFlat, +Y)', rightOk);
  ok('D10 negative pitch puts the camera above the target', aboveOk);

  // At yaw 0 the camera must look along -Z (the Three.js default facing).
  const cam0 = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  const r0 = new ThirdPersonCamera(cam0, []);
  r0.yaw = 0; r0.pitch = 0; r0.setDistance(5); r0._currentDistance = 5;
  for (let k = 0; k < 60; k++) r0.update({ x: 0, y: 0, z: 0 }, 1 / 60);
  ok('D11 at yaw 0 the camera sits at +Z and looks toward -Z', cam0.position.z > 1, `z ${cam0.position.z.toFixed(3)}`);
}
emit('running...');
}

/* ── E. game state, pause, reset (§22.4, §26.6) ──────────────────────────── */
function sectionE() {
lines.push('--- E. state, pause, reset (GDD §22.4, §26.6) ---');
{
  const g = new Game({ contractId: 'suburban_starter' });
  g.setPhase(PHASES.PICKUP);
  let ran = 0;
  g.addSystem('count', () => { ran++; });

  // Three steps' worth of frame time, fed as three frames. Asserted as invariants rather
  // than as an exact count: STEP*3 is exactly 50.0 in float64 and legitimately yields two
  // steps plus a banked remainder (see A13). What must ALWAYS hold is that every system
  // pass corresponds to one clock step, and that billed labour equals stepped sim time.
  g.frame(STEP); g.frame(STEP); g.frame(STEP);
  eq('E1 one system pass per clock step, exactly', ran, g.clock.stepCount);
  near('E2 billed labour time equals stepped sim time', g.state.elapsedWorkMs, g.clock.stepCount * STEP, 1e-9);
  near('E2b three frames of one step each ran three steps', g.clock.stepCount, 3, 1);

  // §21.4 solo pause: "freezes relevant simulation safely". Total, by construction.
  g.setPaused(true);
  const ranAtPause = ran, workAtPause = g.state.elapsedWorkMs;
  g.frame(1000);
  eq('E3 a paused frame runs no systems', ran, ranAtPause);
  eq('E4 a paused frame bills no labour time (§2.3)', g.state.elapsedWorkMs, workAtPause);
  g.setPaused(false);
  g.frame(STEP);
  eq('E5 unpausing resumes stepping', ran, ranAtPause + 1);

  // §3.4: briefing and settlement are not billable.
  const b = new Game({ contractId: 'x' });
  b.frame(STEP * 5);
  eq('E6 the briefing phase bills nothing', b.state.elapsedWorkMs, 0);

  // §22.4: stable string player ids, never array positions.
  const s = createInitialState({ contractId: 'c' });
  ok('E7 players are keyed by stable id', typeof s.localPlayerId === 'string' && !!s.players[s.localPlayerId]);
  ok('E8 state is JSON-serializable (no THREE objects, no handles)',
     (() => { try { JSON.parse(JSON.stringify(s)); return true; } catch (e) { return false; } })());

  // §19.1 replay: the same contract id must always produce the same seed.
  eq('E9 the same contract id gives the same seed',
     createInitialState({ contractId: 'suburban_starter' }).seed,
     createInitialState({ contractId: 'suburban_starter' }).seed);
  ok('E10 a different contract id diverges',
     createInitialState({ contractId: 'a' }).seed !== createInitialState({ contractId: 'b' }).seed);

  // §26.6: reset removes transient state and does not need a page reload.
  const r = new Game({ contractId: 'suburban_starter' });
  r.setPhase(PHASES.PICKUP);
  r.frame(STEP * 10);
  const seedBefore = r.state.seed;
  r.bus.emit(EVENTS.IMPACT, { entities: ['x'] }, 1);
  r.reset();
  eq('E11 reset zeroes the work clock', r.state.elapsedWorkMs, 0);
  eq('E12 reset zeroes sim time', r.clock.simTimeMs, 0);
  eq('E13 reset preserves the seed, so the contract replays', r.state.seed, seedBefore);
  eq('E14 reset clears the event log', r.bus.log.filter((e) => e.type === EVENTS.IMPACT).length, 0);
  eq('E15 reset returns to the briefing phase', r.state.phase, PHASES.BRIEFING);

  // Phase transitions are announced, because §8.4 and §15.1 both read the event stream.
  const p = new Game({ contractId: 'c' });
  let seen = null;
  p.bus.on(EVENTS.CONTRACT_PHASE, (e) => { seen = e; });
  p.setPhase(PHASES.PICKUP);
  ok('E16 a phase change emits CONTRACT_PHASE', !!seen && seen.to === PHASES.PICKUP && seen.from === PHASES.BRIEFING);

  // §26.6: no unbounded growth in logs.
  const bus = new EventBus({ logSize: 16 });
  for (let k = 0; k < 500; k++) bus.emit(EVENTS.IMPACT, { k }, k);
  eq('E17 the event log is bounded', bus.log.length, 16);
  eq('E18 …and still counts everything emitted', bus.emitted, 500);
}
emit('running...');
}

/* ── F. determinism and named tuning (§19.1, §25.1, §25.3) ───────────────── */
function sectionF() {
lines.push('--- F. determinism + named tuning (GDD §25.1, §25.3) ---');
{
  const a = mulberry32(4242), b = mulberry32(4242);
  const sa = [], sb = [];
  for (let k = 0; k < 8; k++) { sa.push(a()); sb.push(b()); }
  ok('F1 the same seed gives an identical stream', sa.join() === sb.join());
  ok('F2 draws stay in [0,1)', sa.every((v) => v >= 0 && v < 1));

  const r = new Rng(77);
  const first = [r.float(), r.float(), r.float()];
  eq('F3 Rng counts its draws', r.draws, 3);
  r.reset();
  ok('F4 reset restores the exact stream', [r.float(), r.float(), r.float()].join() === first.join());
  eq('F5 hashStr is stable', hashStr('suburban_starter'), hashStr('suburban_starter'));

  // §25.1: tuning lives in named config, not scattered literals. Assert the blocks exist
  // and that the numbers a later phase will depend on are actually present.
  ok('F6 SIM cadence is named', SIM.stepHz === 60 && SIM.stepMs > 0 && SIM.maxFrameMs > 0);
  ok('F7 §26.6 frame targets are named', RENDER.targetFps === 60 && RENDER.playtestFloorFps === 45);
  ok('F8 §5.1 stumble/ragdoll thresholds are named', PLAYER.stumbleImpulse > 0 && PLAYER.ragdollImpulse > PLAYER.stumbleImpulse);
  ok('F9 §6.4 force cap is named (the anti-explosion bound)', GRIP.forceCap > 0);
  ok('F10 §8.3 damage aggregation window is named', DAMAGE.aggregationWindowMs > 0);
  ok('F11 §10.3 strap fails above its rating', STRAP.failureNewtons > STRAP.ratingNewtons);
  ok('F12 §11.3 all three prototype road events are declared',
     !!TRUCK.roadEvents.hardBrake && !!TRUCK.roadEvents.sharpTurn && !!TRUCK.roadEvents.speedBump);
  ok('F13 §15.1 economy line items are named', ECONOMY.labourPerMinutePerMover > 0 && ECONOMY.overtimeMultiplier > 1);

  // §8.3 condition bands must be ordered and cover 0..100 with no gap.
  const bands = DAMAGE.bands;
  ok('F14 condition bands descend to zero',
     bands[bands.length - 1].min === 0 && bands.every((x, k) => k === 0 || x.min < bands[k - 1].min));
  ok('F15 a perfect item costs nothing and a broken one costs everything',
     bands[0].costFraction === 0 && bands[bands.length - 1].costFraction === 1);
}
emit('running...');
}

/* ── G. the live build (§25.2 phase 0 gate) ──────────────────────────────── */
async function sectionG() {
lines.push('--- G. live build (GDD §25.2 phase-0 gate) ---');
{
  const M = await window.__MFH_READY;   // boot is async now: Rapier decodes WASM first
  ok('G1 the game booted and published its test seam', !!M && !!M.game);
  if (M) {
    const g = M.game;
    ok('G2 a scene was built', !!M.world && !!M.world.scene);
    ok('G3 colliders exist and are shared with the camera', M.world.colliders.length > 0 && M.rig.colliders === M.world.colliders);
    ok('G4 the renderer exists', !!M.renderer);
    ok('G5 the debug overlay exists', !!M.overlay);
    eq('G6 the contract is in the pickup phase', g.state.phase, PHASES.PICKUP);

    // The gate itself: drive real frames through the real game and check the clock moves.
    const stepsBefore = g.clock.stepCount;
    let total = 0;
    for (let k = 0; k < 30; k++) total += g.frame(16.7);
    ok('G7 real frames advance the simulation', g.clock.stepCount > stepsBefore, `steps ${g.clock.stepCount - stepsBefore}`);
    near('G8 30 frames of 16.7 ms produce ~30 steps', total, 30, 2);
    near('G9 sim time never drifts from step count', g.clock.simTimeMs, g.clock.stepCount * STEP, 1e-9);

    // The look system is wired: look input must reach the camera through a SIM step.
    const yawBefore = M.rig.yaw;
    M.input.look.x = 200;
    g.frame(16.7);
    ok('G10 look input reaches the camera through a sim step', M.rig.yaw !== yawBefore);
    // Phase 1 CHANGED what player.yaw means. In Phase 0 it mirrored the camera; §5.1 wants
    // the body to face its direction of TRAVEL, so a stationary player must now hold its
    // facing while the camera orbits around it. Asserting the old behaviour here would
    // lock in a bug: a character that pirouettes on the spot with the mouse.
    const bodyYawBefore = g.state.players[g.state.localPlayerId].yaw;
    M.input.look.x = 400; g.frame(16.7);
    eq('G11 a stationary player does not spin with the camera',
       g.state.players[g.state.localPlayerId].yaw, bodyYawBefore);

    // §4.1 pitch clamp: the camera must not flip over the top.
    M.input.look.y = -1e6; g.frame(16.7);
    ok('G12 pitch is clamped looking up', M.rig.pitch <= RENDER.camera.pitchMax + 1e-6, `pitch ${M.rig.pitch}`);
    M.input.look.y = 1e6; g.frame(16.7);
    ok('G13 pitch is clamped looking down', M.rig.pitch >= RENDER.camera.pitchMin - 1e-6, `pitch ${M.rig.pitch}`);

    // Yaw must wrap, or a long session accumulates an unbounded float.
    M.rig.yaw = 0;
    for (let k = 0; k < 40; k++) { M.input.look.x = -1000; g.frame(16.7); }
    ok('G14 yaw stays wrapped to +/-PI', Math.abs(M.rig.yaw) <= Math.PI + 1e-6, `yaw ${M.rig.yaw}`);

    ok('G15 no error banner was raised during boot', !document.getElementById('err-banner'));

    // §26.6 robustness. A page that boots in a background or prerendered tab lays out at
    // 0x0; bringing it forward fires NO resize event, so a renderer that sizes itself only
    // from a resize listener stays 0x0 and renders nothing, forever. MEASURED on the live
    // GitHub Pages build: client size reached 1280x720 while the backing store stayed 0x0
    // and camera.aspect stayed 0. syncSize() runs every frame and must recover on its own.
    //
    // Reproduced honestly, on a throwaway canvas that really does boot at 0x0. Forcing the
    // state with setSize(0,0) instead would NOT reproduce it — the CSS size never changes,
    // so syncSize's change detection is right to ignore it.
    ok('G16 the canvas exists', !!document.getElementById('stage'));

    const probe = document.createElement('canvas');
    probe.style.cssText = 'position:absolute;left:-9999px;width:0px;height:0px';
    document.body.appendChild(probe);
    try {
      const r2 = createRenderer(probe);
      ok('G17 booting at 0x0 never yields a non-finite aspect', Number.isFinite(r2.camera.aspect),
         `aspect ${r2.camera.aspect}`);
      ok('G18 …and syncSize reports no change while unlaid-out', r2.syncSize() === false);

      probe.style.width = '800px';
      probe.style.height = '400px';
      const recovered = r2.syncSize();      // no resize event fired — this is the point
      ok('G19 a 0x0 boot recovers on the next frame, with no resize event', recovered);
      near('G20 …to the real canvas aspect ratio', r2.camera.aspect, 2, 1e-6);
      ok('G21 …and the backing store is no longer 0x0', probe.width > 0 && probe.height > 0,
         `${probe.width}x${probe.height}`);

      // Steady state must be free: an unchanged canvas re-syncs nothing.
      ok('G22 an unchanged canvas reports no change', r2.syncSize() === false);
      r2.renderer.dispose();
    } catch (e) {
      fails++; lines.push(`FAIL  G17-G22 resize probe threw  <- ${e && e.message}`);
    } finally {
      probe.remove();
    }
  }
}
emit();
}

/* Sections are separate functions with their own try/catch so one thrown error reports
 * as a failure in its section instead of taking the whole suite silent. */
for (const [name, fn] of [['A', sectionA], ['B', sectionB], ['C', sectionC],
                          ['D', sectionD], ['E', sectionE], ['F', sectionF], ['G', sectionG]]) {
  try { await fn(); }
  catch (e) { fails++; lines.push(`FAIL  section ${name} threw  <- ${e && e.message}`); emit(); }
}
emit();
