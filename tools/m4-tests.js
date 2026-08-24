/* Phase 4 suite — the cooperative seam.
 *
 * §25.2 gate under test: "Second actor/test harness or command model" →
 * **multiple grips combine predictably**.
 *
 * "Predictably" is the operative word, and it is testable in a way "fun" is not. Four
 * things must hold, and each is a §6.4 sentence:
 *
 *   COMBINE      — two movers on one object apply MORE force than one, and it moves more.
 *   INDEPENDENT  — neither owns it (§14.2). One letting go updates the forces immediately
 *                  and leaves the other still holding; being knocked down drops only that
 *                  mover's grips.
 *   STABILISE    — "opposite-end grips naturally stabilise long objects."
 *   BOUNDED      — "player force should be bounded so two clients cannot create an
 *                  explosive feedback loop." This is the one that matters for §14's online
 *                  co-op, and it is asserted against absurd inputs, not gentle ones.
 *
 * Lessons carried forward from m2 and m3: park things where they need to be rather than
 * dragging them into place, and prefer a closed-form or summed quantity over a delicate
 * steady state.
 */

import { GRIP, SIM, MOVERS } from '../src/config.js';
import { OBJECT_DEFS } from '../src/objects/definitions.js';
import { moversOn, gripsOn } from '../src/player/grip.js';
import { LOCOMOTION } from '../src/player/controller.js';

const lines = [];
let passes = 0, fails = 0;
function ok(name, cond, detail = '') {
  if (cond) { passes++; lines.push(`PASS  ${name}`); }
  else { fails++; lines.push(`FAIL  ${name}${detail ? '  <- ' + detail : ''}`); }
}
const eq = (n, a, b) => ok(n, a === b, `got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

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

const { game, physics, rig, registry, movers, camera } = M;
const STEP = SIM.stepMs;

/* ── driving helpers ─────────────────────────────────────────────────────── */

/** Step every mover, in the same order main.js does: clear forces ONCE, then each mover's
 *  grips and body, then physics. Getting this order wrong is the bug the phase is about. */
function step(n = 1, intents = {}) {
  for (let i = 0; i < n; i++) {
    physics.clearForces();
    for (const m of movers) {
      const it = intents[m.id] || {};
      const yaw = it.yaw !== undefined ? it.yaw : 0;
      m.grips.step(STEP, { brace: !!it.brace, simTimeMs: i * STEP });
      m.controller.step(STEP, {
        move: it.move || { x: 0, y: 0 },
        forward: { x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw) },
        right: { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) },
        run: false, brace: !!it.brace, jump: false, recover: false,
      });
    }
    physics.step();
    registry.step(STEP);
  }
}

function releaseAll() { for (const m of movers) m.grips.releaseAll('test reset'); }

function placeMover(m, x, z, y = 0.2) {
  m.controller.hardSetPosition({ x, y, z });
  m.controller._vel.x = 0; m.controller._vel.z = 0;
  m.controller.velocityY = 0; m.controller._climb = null;
  m.controller.carriedMass = 0; m.controller.resistedForce = 0;
  m.controller.pull.x = 0; m.controller.pull.z = 0;
  m.controller.imbalance = 0; m.controller.exertion = 0; m.controller._downMs = 0;
}

function posOf(e) { const t = e.body.translation(); return { x: t.x, y: t.y, z: t.z }; }

function parkAt(entity, x, y, z) {
  entity.body.setTranslation({ x, y, z }, true);
  entity.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  entity.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  entity.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  physics.primeQueries();
}

/** Aim a specific mover's OWN rig at a point and grab.
 *
 * Until Phase 12 every mover shared one rig, so this aimed the global `rig` and worked by
 * accident for whichever mover it was called with. Co-op gave each mover its own rig —
 * `GripSystem.aim()` reads `rig.yaw`/`rig.pitch`, so two people sharing one would reach for
 * the same thing — and this fixture kept aiming mover 0's while grabbing with mover 1, which
 * reported as "no grip" on every second-mover assertion in sections B through F.
 *
 * That is the whole §6.4 gate failing on a fixture. Aim the rig belonging to the hands that
 * are about to close, which is also what a second player with a second mouse does. */
function grabWith(m, hand, target) {
  const p = m.controller.position;
  m.rig.yaw = Math.atan2(-(target.x - p.x), -(target.z - p.z));
  m.rig.pitch = Math.atan2(target.y - (p.y + 1.4), Math.hypot(target.x - p.x, target.z - p.z));
  for (let k = 0; k < 20; k++) m.rig.update(p, 1 / 60);
  const c = m.camera.position;
  m.rig.yaw = Math.atan2(-(target.x - c.x), -(target.z - c.z));
  m.rig.pitch = Math.atan2(target.y - c.y, Math.hypot(target.x - c.x, target.z - c.z));
  return m.grips.tryGrab(hand, m.id, game.clock.simTimeMs);
}

/* Raise a mover's hand h metres STRAIGHT UP, in world space.
 *
 * Not the same as adding h to holdLocal.u, which is what this suite did first. holdLocal is
 * expressed in the aim frame, and a mover looking DOWN at a couch on the floor has an `up`
 * axis tilted by the pitch: up.y is cos(pitch), about 0.88 at these angles. Nudging u by
 * 0.62 therefore lifted the hand 0.55 m and shoved it 0.29 m forward, and the shortfall
 * showed up as a couch that lifted less than the arithmetic said it should.
 *
 * Decomposing (0, h, 0) onto the orthonormal basis instead — dir.y is sin(pitch), right.y is
 * 0, up.y is cos(pitch) — makes the stretch exactly h, which is what GRIP.maxStretch is
 * measured against. Third time an aim-frame tilt has cost this project a wrong number. */
function raiseHand(m, hand, base, h) {
  const live = m.grips.grips[hand];
  if (!live) return;
  const sp = Math.sin(m.grips.aimPitch), cp = Math.cos(m.grips.aimPitch);
  live.holdLocal.f = base.f + h * sp;
  live.holdLocal.u = base.u + h * cp;
}

/* How far the couch's LONG axis has tilted out of level, in radians — "is one end higher
 * than the other".
 *
 * This is the component that end placement controls, and separating it out is what finally
 * made §6.4 measurable. A lift force F applied at offset r produces torque r x F; with F
 * straight up, the part that comes from the SIDEWAYS offset rx rotates the couch about Z and
 * raises one end, while the part from the offset rz — the same for every grip, because both
 * movers stand on the same side of the couch — tips it about its own long axis.
 *
 * Total angular deviation adds those together, and the second one is the bigger of the two:
 * measured 23.1 degrees same-end against 20.8 opposite-end, a difference the shared tipping
 * had nearly buried. Asking specifically how far out of level the couch's length is ignores
 * tipping about that length entirely, because rotating a vector about itself changes nothing.
 *
 * v'.y of local +X rotated by q is 2*(qx*qy + qz*qw) — the middle entry of the rotation
 * matrix's first column. asin of it is the angle above horizontal. */
function longAxisTilt(q) {
  return Math.asin(Math.max(-1, Math.min(1, 2 * (q.x * q.y + q.z * q.w))));
}

/* Height of an object's LOWEST corner above the floor. Zero means it is still touching.
 *
 * A rise in the body's centre is not a lift, and conflating the two nearly let a false claim
 * through. Tipping this couch 23 degrees onto its back bottom edge raises its centre by
 * 0.45*sin23 + 0.425*cos23 - 0.425 = 0.142 m all by itself — within a centimetre of the
 * 0.148 m "lift" that was being read as two movers getting it airborne. It was pivoting on an
 * edge the whole time.
 *
 * For a box, the lowest corner sits hx*|Rxy| + hy*|Ryy| + hz*|Rzy| below the centre, where
 * the R terms are the y-components of the rotated local axes — the second row of the rotation
 * matrix. Exact, and it does not care which way the thing is facing. */
function clearanceOf(entity) {
  const q = entity.body.rotation(), t = entity.body.translation();
  const d = entity.def.dimensions;
  const rxy = 2 * (q.x * q.y + q.z * q.w);
  const ryy = 1 - 2 * (q.x * q.x + q.z * q.z);
  const rzy = 2 * (q.y * q.z - q.x * q.w);
  const below = (d.x / 2) * Math.abs(rxy) + (d.y / 2) * Math.abs(ryy) + (d.z / 2) * Math.abs(rzy);
  return t.y - below;
}

function findByDef(defId) {
  for (const e of registry.entities.values()) if (e.defId === defId) return e;
  return null;
}

/** Total force every mover is applying to one entity this step. §6.4's "forces add",
 *  measured as a sum rather than inferred from motion. */
function totalAppliedTo(entityId) {
  let sum = 0;
  for (const m of movers) {
    for (const hand of ['left', 'right']) {
      const g = m.grips.grips[hand];
      if (g && g.entityId === entityId) sum += g.lastApplied || 0;
    }
  }
  return sum;
}

const spawned = [];
function spawnAt(defId, x, y, z) {
  const e = registry.spawn(defId, { x, y, z, yaw: 0 });
  spawned.push(e.id);
  physics.primeQueries();
  step(20);
  return e;
}

try {
/* ── A. two movers exist and are independent (§22.4) ─────────────────────── */
lines.push('--- A. two independent movers (GDD §22.4, §14.2) ---');
{
  eq('A1 the configured number of movers exists', movers.length, MOVERS.count);
  ok('A2 …at least two, or the phase has nothing to test', movers.length >= 2);
  ok('A3 each has a stable string id (§22.4)', movers.every((m) => typeof m.id === 'string' && m.id));
  ok('A4 …and the ids are distinct', new Set(movers.map((m) => m.id)).size === movers.length);
  ok('A5 each has its OWN body', new Set(movers.map((m) => m.controller)).size === movers.length);
  ok('A6 …its own grip system', new Set(movers.map((m) => m.grips)).size === movers.length);
  ok('A7 …and its own collider', new Set(movers.map((m) => m.controller.collider.handle)).size === movers.length);
  ok('A8 game state carries a record for each', movers.every((m) => !!game.state.players[m.id]));

  // §22.4 again, now with two: the serializable half must still be serializable.
  ok('A9 state with two movers is still JSON-serializable',
     (() => { try { JSON.parse(JSON.stringify(game.state)); return true; } catch (e) { return false; } })());

  // Bodies must not be spawned inside each other, or the first step is a shoving match.
  placeMover(movers[0], 30, 30);
  placeMover(movers[1], 31.4, 30);
  step(40);
  const sep = Math.hypot(movers[0].controller.position.x - movers[1].controller.position.x,
                         movers[0].controller.position.z - movers[1].controller.position.z);
  ok('A10 two movers stand apart rather than intersecting', sep > 0.5, `${sep.toFixed(2)} m apart`);
}
emit('running...');

/* ── B. both can hold the same object (§6.4, §14.2) ──────────────────────── */
lines.push('--- B. shared grips (GDD §6.4, §14.2) ---');
{
  releaseAll();
  const couch = findByDef('couch_3seat_01');
  ok('B1 there is a couch to share', !!couch);

  if (couch) {
    // Park them at OPPOSITE ENDS, which is §6.4's own example.
    parkAt(couch, 40, 0.44, 40);
    placeMover(movers[0], 40 - 0.9, 41.2);
    placeMover(movers[1], 40 + 0.9, 41.2);
    step(30);

    const gA = grabWith(movers[0], 'right', { x: 40 - 0.8, y: 0.62, z: 40 + 0.35 });
    const gB = grabWith(movers[1], 'right', { x: 40 + 0.8, y: 0.62, z: 40 + 0.35 });
    ok('B2 mover 0 gets a grip', !!gA);
    ok('B3 mover 1 gets a grip on the SAME object', !!gB && gB.entityId === (gA && gA.entityId));

    if (gA && gB) {
      eq('B4 the object records two grips', gripsOn(couch).length, 2);
      eq('B5 …from two distinct movers (§6.4 mover count)', moversOn(couch), 2);
      ok('B6 …and knows which movers they are',
         new Set(gripsOn(couch).map((g) => g.playerId)).size === 2,
         gripsOn(couch).map((g) => g.playerId).join(','));

      // §14.2: "no single client permanently owns a jointly held object". Nothing in the
      // entity should name an owner at all.
      ok('B7 the object names no owner (§14.2)',
         !('owner' in couch.state) && !('ownerId' in couch.state));
    }
    releaseAll();
  }
}
emit('running...');

/* Stage a couch lift and measure it. `plan` is one entry per participating mover:
 * {mover:{x,z}, grip:{x,y,z}}. Every hand then rises together, 0.62 m over 150 steps.
 *
 * WHERE THE MOVERS STAND IS THE EXPERIMENT, and the first version of this got it wrong in a
 * way worth recording. It lined both movers up along the couch's FRONT and had them haul
 * upward from there. The couch dutifully rose 0.148 m and every lift assertion passed — but
 * its lowest corner never left the floor by a single millimetre. Hands on the near side pull
 * 0.35 m in front of the centre of mass, so they tipped the couch back onto its rear bottom
 * edge and pivoted it there, and tipping a 0.90 x 0.85 box by 23 degrees raises its centre
 * 0.142 m for free. The rise was real and the lift was fiction.
 *
 * Real movers take the two ENDS, which is also the only arrangement that works: gripping the
 * end faces puts the force in line with the centre of mass in z, so there is no tipping
 * moment, and the two ends' moments cancel each other. clearanceOf() is now the arbiter of
 * whether anything actually left the ground. */
function liftTogether(couch, cx, cz, plan, steps = 220) {
  releaseAll();
  parkAt(couch, cx, 0.44, cz);
  // Park anyone not taking part well clear, so a stray body cannot prop the couch up.
  for (let i = plan.length; i < movers.length; i++) placeMover(movers[i], cx + 12 + i, cz + 12);
  plan.forEach((p, i) => placeMover(movers[i], p.mover.x, p.mover.z));
  step(30);

  const held = [];
  for (let i = 0; i < plan.length; i++) {
    const g = grabWith(movers[i], 'right', plan[i].grip);
    if (!g) { releaseAll(); return null; }
    held.push({ m: movers[i], base: { f: g.holdLocal.f, u: g.holdLocal.u } });
  }

  const intents = {};
  for (const m of movers) intents[m.id] = { brace: true };
  const y0 = posOf(couch).y;
  let lifted = 0, clear = 0, peakForce = 0, peakTilt = 0, peakTurn = 0, peakSpin = 0, heldSteps = 0;
  // The step where the WEAKEST hand was strongest. A mover being silently zeroed by another
  // can never raise that floor, however large anyone else's force grows.
  let bestJoint = held.map(() => 0), bestFloor = -1;

  for (let k = 0; k < steps; k++) {
    const t = Math.min(1, k / 150) * 0.62;
    held.forEach((h) => raiseHand(h.m, 'right', h.base, t));
    step(1, intents);

    const q = couch.body.rotation(), w = couch.body.angvel();
    lifted = Math.max(lifted, posOf(couch).y - y0);
    clear = Math.max(clear, clearanceOf(couch));
    peakForce = Math.max(peakForce, totalAppliedTo(couch.id));
    peakTilt = Math.max(peakTilt, Math.abs(longAxisTilt(q)));
    peakTurn = Math.max(peakTurn, 2 * Math.acos(Math.min(1, Math.abs(q.w))));
    peakSpin = Math.max(peakSpin, Math.hypot(w.x, w.y, w.z));

    const live = held.map((h) => h.m.grips.grips.right);
    if (live.every(Boolean)) {
      heldSteps++;
      const forces = live.map((g) => g.lastApplied || 0);
      const floor = Math.min.apply(null, forces);
      if (floor > bestFloor) { bestFloor = floor; bestJoint = forces; }
    }
  }
  releaseAll();
  return { lifted, clear, peakForce, peakTilt, peakTurn, peakSpin, heldSteps, steps, forces: bestJoint };
}

/* ── C. FORCES COMBINE — the gate (§6.4) ─────────────────────────────────── */
lines.push('--- C. forces combine (GDD §25.2 gate, §6.4) ---');
{
  const couch = findByDef('couch_3seat_01');
  if (couch) {
    /* THE CLEANEST STATEMENT OF THE GATE: a second pair of hands changes what is POSSIBLE,
     * not merely what is faster.
     *
     * One hand caps at GRIP.forceCap = 750 N. A 90 kg couch weighs 883 N. So one hand cannot
     * lift it — m3 B1 asserts exactly that — and one hand from each of two movers can. That
     * is §6.3's "two or a tool preferred" as a binary outcome, which is far more robust than
     * comparing how far a dragged couch travelled.
     *
     * Two earlier versions of this failed for reasons that were not bugs. The first compared
     * DRAG distance: two movers anchoring the same couch each develop little stretch, so the
     * summed force rose only 25% and the couch moved LESS. The second compared the rise of
     * the couch's CENTRE, which counted tipping as lifting — see liftTogether. Clearance of
     * the lowest corner is the honest measure, and it is what these assert. */
    const END = 1.00;          // grip this far along X from the centre; the couch is 2.10 long
    const STAND = 1.95;        // and the mover stands this far out, facing the end face
    const at = (cx, cz, side) => ({
      mover: { x: cx + side * STAND, z: cz },
      grip: { x: cx + side * END, y: 0.44, z: cz },
    });

    const one = liftTogether(couch, 44, 44, [at(44, 44, -1)]);
    const two = liftTogether(couch, 44, 44, [at(44, 44, -1), at(44, 44, +1)]);
    ok('C1 both measurements ran', !!one && !!two,
       `one=${one ? 'ok' : 'no grip'} two=${two ? 'ok' : 'no grip'}`);

    if (one && two) {
      const detail = (r) => `${r.peakForce.toFixed(0)} N peak, rose ${r.lifted.toFixed(3)} m, ` +
                            `lowest corner ${r.clear.toFixed(3)} m clear, held ${r.heldSteps}/${r.steps}`;
      // Logged unconditionally, not only on failure. These two lines are the phase's central
      // measurement, and a threshold that passes tells you nothing about how close it was.
      lines.push(`      one mover:  ${detail(one)}`);
      lines.push(`      two movers: ${detail(two)}`);

      ok('C2 two movers apply MORE total force than one (§6.4 "forces add")',
         two.peakForce > one.peakForce * 1.25,
         `one ${one.peakForce.toFixed(0)} N vs two ${two.peakForce.toFixed(0)} N`);
      ok('C3 one hand alone cannot get a 90 kg couch off the floor',
         one.clear < 0.02, detail(one));
      /* The threshold is "breaks contact at all", not a height, and that is deliberate.
       *
       * Measured: one mover peaks at 458 N and never separates from the floor by a micron;
       * two peak at 895 N and lift clear by 11 mm. The couch weighs 883 N, and it sits
       * between those two numbers — which is the whole design, and is why the binary is the
       * right claim to assert. Demanding 50 mm here was an invented number, and it failed
       * against physics that were working correctly.
       *
       * 11 mm is genuinely marginal, and the reason is structural rather than accidental: a
       * hand is a 900 N/m spring, so two of them need 883/1800 = 0.49 m of stretch merely to
       * break even, out of the 0.70 m GRIP.maxStretch allows before the hold tears. The whole
       * usable lift band for a couch is therefore about 0.21 m. Recorded in KNOWN_ISSUES for
       * the tuning pass; it is a GRIP.spring question, not a cooperation one. */
      ok('C4 …and a second pair of hands can — §6.3 "two … preferred", as a payoff',
         two.clear > 0.005 && two.clear > one.clear + 0.005,
         `one ${one.clear.toFixed(3)} m clear vs two ${two.clear.toFixed(3)} m`);
      ok('C5 …with both movers still holding at the end of it',
         two.heldSteps > two.steps * 0.9, detail(two));
    }
  }
}
emit('running...');

/* ── D. releasing updates immediately (§6.4) ─────────────────────────────── */
lines.push('--- D. release updates immediately (GDD §6.4) ---');
{
  const couch = findByDef('couch_3seat_01');
  if (couch) {
    releaseAll();
    parkAt(couch, 50, 0.44, 50);
    placeMover(movers[0], 50 - 0.9, 51.2);
    placeMover(movers[1], 50 + 0.9, 51.2);
    step(30);
    const gA = grabWith(movers[0], 'right', { x: 50 - 0.8, y: 0.62, z: 50 + 0.35 });
    const gB = grabWith(movers[1], 'right', { x: 50 + 0.8, y: 0.62, z: 50 + 0.35 });
    ok('D1 both movers holding', !!gA && !!gB);

    if (gA && gB) {
      const it = { move: { x: 0, y: -1 }, yaw: 0 };
      step(30, { [movers[0].id]: it, [movers[1].id]: it });
      const bothForce = totalAppliedTo(couch.id);
      ok('D2 both are contributing force', bothForce > 0, `${bothForce.toFixed(0)} N`);

      // §6.4: "When one player releases, forces update immediately; no canned synchronized
      // carry animation takes ownership." One step is what "immediately" has to mean.
      movers[1].grips.releaseAll('let go');
      step(1, { [movers[0].id]: it });
      const soloForce = totalAppliedTo(couch.id);
      ok('D3 releasing one hand updates the forces within a single step (§6.4)',
         soloForce < bothForce, `${bothForce.toFixed(0)} N -> ${soloForce.toFixed(0)} N`);
      ok('D4 …and the other mover is still holding', !!movers[0].grips.grips.right);
      eq('D5 …with the object recording exactly one grip', gripsOn(couch).length, 1);
      eq('D6 …from one mover', moversOn(couch), 1);
      ok('D7 …and still no canned ownership anywhere', !couch.state.owner);
      releaseAll();
      eq('D8 releasing everything leaves the object unheld', couch.state.held, false);
    }
  }
}
emit('running...');

/* ── E. opposite ends stabilise a long object (§6.4) ─────────────────────── */
lines.push('--- E. opposite-end grips stabilise (GDD §6.4) ---');
{
  const couch = findByDef('couch_3seat_01');
  if (couch) {
    /* §6.4: "Opposite-end grips naturally stabilise long objects." Both runs lift the same
     * couch with the same two movers and the same hand ramp; only WHERE they grip changes.
     * Measured as how far the couch's length ends up out of level (longAxisTilt).
     *
     * It took several attempts to find a scenario that can show this, and the failures were
     * all the measurement being wrong rather than the game:
     *
     *   1. One mover lifting one end. 0.000 rad/s — one hand caps at 750 N against 883 N of
     *      couch (m3 B1), so nothing moved and there was nothing to measure.
     *   2. One mover DRAGGING. 0.000 again, and 0.041 m of travel: a lone mover cannot shift
     *      a couch either. That is the Phase 3 weakness already in KNOWN_ISSUES.
     *   3. Two movers dragging. The couch moved 0.73 m, but rotation about Y still read
     *      0.000 while it was plainly turning — the wrong AXIS. Hands 0.19 m above the centre
     *      of mass tipped it 44 degrees about its LONG axis, and tipping about that axis is
     *      identical wherever along it you pull, so both arrangements measured the same.
     *   4. Two movers dragging, gripping at centre-of-mass height. Tipping fell to 0.1
     *      degrees, but slew was 0.2 and the grip tore after 45 of 160 steps: floor friction
     *      and the tear swamped the effect.
     *
     * Lifting from the ends is both the honest scenario — §6.4's sentence is about CARRYING a
     * long object — and the only one where the difference is not buried under something else.
     * It needs no tuning to be true; it is what applying force at a point buys, and if it
     * were false the whole grip design would be wrong. */
    const END = 1.00, STAND = 1.95;
    const cx = 56, cz = 56;

    // Both movers crowding the SAME end: their two forces sit on the same side of the centre
    // of mass, so the moments add and that end comes up.
    const sameEnd = liftTogether(couch, cx, cz, [
      { mover: { x: cx - STAND, z: cz - 0.55 }, grip: { x: cx - END, y: 0.44, z: cz - 0.28 } },
      { mover: { x: cx - STAND, z: cz + 0.55 }, grip: { x: cx - END, y: 0.44, z: cz + 0.28 } },
    ]);
    // One at each end: equal and opposite moments, which cancel.
    const bothEnds = liftTogether(couch, cx, cz, [
      { mover: { x: cx - STAND, z: cz }, grip: { x: cx - END, y: 0.44, z: cz } },
      { mover: { x: cx + STAND, z: cz }, grip: { x: cx + END, y: 0.44, z: cz } },
    ]);

    ok('E1 both lift measurements ran', !!sameEnd && !!bothEnds,
       `same=${sameEnd ? 'ok' : 'no grip'} opposite=${bothEnds ? 'ok' : 'no grip'}`);
    if (sameEnd && bothEnds) {
      const DEG = 57.2958;
      const detail = (r) => `off level by ${(r.peakTilt * DEG).toFixed(1)}° ` +
                            `(turned ${(r.peakTurn * DEG).toFixed(1)}° in all), ` +
                            `rose ${r.lifted.toFixed(3)} m, clear ${r.clear.toFixed(3)} m`;
      ok('E2 lifting from ONE end puts the couch out of level (§6.2 leverage about the COM)',
         sameEnd.peakTilt > 0.05, detail(sameEnd));
      ok('E3 …and taking opposite ends stabilises it (§6.4)',
         bothEnds.peakTilt < sameEnd.peakTilt * 0.7,
         `same end [${detail(sameEnd)}] vs opposite ends [${detail(bothEnds)}]`);
    }
  }
}
emit('running...');

/* ── F. BOUNDED — two movers cannot explode (§6.4) ───────────────────────── */
lines.push('--- F. bounded force (GDD §6.4 "no explosive feedback loop") ---');
{
  const box = spawnAt('box_small_01', 62, 0.30, 62);
  releaseAll();
  placeMover(movers[0], 62, 62.9);
  placeMover(movers[1], 62, 61.1);
  step(25);
  const gA = grabWith(movers[0], 'right', posOf(box));
  const gB = grabWith(movers[1], 'right', posOf(box));
  ok('F1 both movers have hold of one small box', !!gA && !!gB);

  if (gA && gB) {
    /* THE ADVERSARIAL CASE. Two movers pulling in OPPOSITE directions on one light box is
     * the exact shape of §6.4's "explosive feedback loop" — each side's force feeds the
     * other's error term. Drive it hard and for a long time; nothing may run away. */
    let peakSpeed = 0, peakForce = 0, peakSpin = 0;
    for (let k = 0; k < 400; k++) {
      step(1, {
        [movers[0].id]: { move: { x: 0, y: -1 }, yaw: 0, brace: true },
        [movers[1].id]: { move: { x: 0, y: -1 }, yaw: Math.PI, brace: true },
      });
      const v = box.body.linvel(), w = box.body.angvel();
      peakSpeed = Math.max(peakSpeed, Math.hypot(v.x, v.y, v.z));
      peakSpin = Math.max(peakSpin, Math.hypot(w.x, w.y, w.z));
      peakForce = Math.max(peakForce, totalAppliedTo(box.id));
    }
    const def = OBJECT_DEFS.box_small_01;
    // Each mover is bounded by min(strength, mass*maxAccel); two movers is at most twice
    // that. Anything beyond is a feedback loop, which is precisely what §6.4 forbids.
    const perMoverCap = Math.min(GRIP.forceCap * GRIP.braceForceMult, def.mass * GRIP.maxAccel);
    ok('F2 total force stays within the sum of the per-mover bounds (§6.4)',
       peakForce <= perMoverCap * movers.length + 1,
       `peak ${peakForce.toFixed(0)} N vs bound ${(perMoverCap * movers.length).toFixed(0)} N`);
    ok('F3 the object never reaches an absurd speed',
       peakSpeed < SIM.maxLinearVelocity * 0.5, `${peakSpeed.toFixed(2)} m/s`);
    ok('F4 …nor an absurd spin', peakSpin < SIM.maxAngularVelocity * 0.9, `${peakSpin.toFixed(2)} rad/s`);
    ok('F5 …and it is still in the world afterwards',
       Math.abs(posOf(box).x) < 120 && Math.abs(posOf(box).z) < 120 && posOf(box).y > -8,
       JSON.stringify(posOf(box)));
    releaseAll();
  }
}
emit('running...');

/* ── G. the seam holds under stress (§22.4, §5.1) ────────────────────────── */
lines.push('--- G. the seam (GDD §22.4, §5.1) ---');
{
  const couch = findByDef('couch_3seat_01');
  if (couch) {
    releaseAll();
    parkAt(couch, 70, 0.44, 70);
    placeMover(movers[0], 70 - 0.9, 71.2);
    placeMover(movers[1], 70 + 0.9, 71.2);
    step(30);
    const gA = grabWith(movers[0], 'right', { x: 70 - 0.8, y: 0.62, z: 70 + 0.35 });
    const gB = grabWith(movers[1], 'right', { x: 70 + 0.8, y: 0.62, z: 70 + 0.35 });
    ok('G1 both holding before the knockdown', !!gA && !!gB);

    if (gA && gB) {
      // §5.1: being knocked down drops what YOU were holding. It must not drop the other
      // mover's grip — that would be one client's state reaching into another's.
      movers[0].controller.imbalance = 99;
      step(2);
      ok('G2 the knocked-down mover drops its grip', !movers[0].grips.grips.right);
      ok('G3 …and the OTHER mover keeps holding (§22.4 no shared ownership)',
         !!movers[1].grips.grips.right);
      eq('G4 …so the object now records one grip', gripsOn(couch).length, 1);
      eq('G5 …belonging to the mover still standing', gripsOn(couch)[0].playerId, movers[1].id);
      eq('G6 the knocked-down mover is in the ragdoll state', movers[0].controller.state, LOCOMOTION.RAGDOLL);
      releaseAll();
    }
  }

  // Swapping which mover you drive must not disturb what either is holding.
  const box2 = spawnAt('box_small_01', 76, 0.30, 76);
  releaseAll();
  placeMover(movers[0], 76, 77.1);
  step(25);
  const g = grabWith(movers[0], 'right', posOf(box2));
  ok('G7 mover 0 is holding a box', !!g);
  const beforeIdx = M.activeMoverIndex;
  M.swapMover();
  ok('G8 swapping changes which mover is driven', M.activeMoverIndex !== beforeIdx);
  ok('G9 …and the other mover keeps its grip (§6.4 no canned ownership)',
     !!movers[0].grips.grips.right && box2.state.held);
  step(30);
  ok('G10 …still holding after 30 steps of not being driven',
     !!movers[0].grips.grips.right, 'the unattended mover let go');
  M.swapMover();
  eq('G11 swapping back restores the original mover', M.activeMoverIndex, beforeIdx);
  releaseAll();
}
emit('running...');

/* ── H. the ordering regression this phase was really about ──────────────── */
lines.push('--- H. force-clear ordering (the two-mover trap) ---');
{
  /* If clearForces() ran per-mover instead of once, the second mover's clear would wipe the
   * first's force every step and only the LAST mover to run would ever be felt. It would look
   * like "my partner is not helping" rather than like a bug, so it is asserted explicitly:
   * with both holding, BOTH must register applied force in the same step.
   *
   * Deliberately staged on the COUCH rather than a box. A light box is the weaker test: one
   * hand can hold 9 kg unaided, so a mover being silently zeroed would leave no trace in the
   * world. 90 kg needs 883 N and one hand caps at 750 N, so the couch leaving the floor is
   * itself proof that both forces landed — an observable that does not depend on trusting the
   * same counters under test.
   *
   * An earlier version had them pull in OPPOSING directions and read 0.0 N from mover 0. That
   * was a torn grip, not a zeroed force: hauling a 90 kg couch two ways exceeds maxStretch and
   * the grip correctly lets go, and reading force off a released grip yields 0. Lifting
   * together keeps both grips intact for the whole run. */
  const couch2 = findByDef('couch_3seat_01');
  releaseAll();
  if (couch2) {
    const r = liftTogether(couch2, 82, 82, [
      { mover: { x: 82 - 1.95, z: 82 }, grip: { x: 82 - 1.00, y: 0.44, z: 82 } },
      { mover: { x: 82 + 1.95, z: 82 }, grip: { x: 82 + 1.00, y: 0.44, z: 82 } },
    ]);
    ok('H1 both movers holding the same couch', !!r, r ? '' : 'a grab failed');

    if (r) {
      const fA = r.forces[0], fB = r.forces[1];
      ok('H2 mover 0 is applying force in the same step as mover 1', fA > 0, `${fA.toFixed(1)} N`);
      ok('H3 …and mover 1 in the same step as mover 0', fB > 0, `${fB.toFixed(1)} N`);
      ok('H4 neither is being silently zeroed by the other (the clearForces trap)',
         fA > 0 && fB > 0, `A ${fA.toFixed(1)} N, B ${fB.toFixed(1)} N`);
      /* The world corroborating the counters. One hand cannot break this couch's contact
       * with the floor (C3 measures 0.000 m from 458 N), so the couch being off the ground at
       * all cannot happen unless BOTH forces landed in the same steps. If either mover were
       * being silently zeroed, this reads 0.000 no matter what fA and fB claim. */
      ok('H5 …corroborated by the world: the couch only leaves the floor if both forces land',
         r.clear > 0.005,
         `rose ${r.lifted.toFixed(3)} m, lowest corner ${r.clear.toFixed(3)} m clear`);
    }
  }
}
emit('running...');

/* ── I. integration (§26.6) ──────────────────────────────────────────────── */
lines.push('--- I. integration (GDD §26.6) ---');
{
  releaseAll();
  for (const m of movers) placeMover(m, 0, 5 + movers.indexOf(m) * 1.4);
  const bodiesBefore = physics.stats.bodies;
  ok('I1 the body count is real before the leak check', bodiesBefore > 0, `${bodiesBefore}`);
  for (let i = 0; i < 120; i++) game.frame(16.7);
  eq('I2 no bodies leak over 120 real frames', physics.stats.bodies, bodiesBefore);
  ok('I3 state stays JSON-serializable with two movers live',
     (() => { try { JSON.parse(JSON.stringify(game.state)); return true; } catch (e) { return false; } })());
  ok('I4 every mover reports a declared locomotion state',
     movers.every((m) => Object.values(LOCOMOTION).includes(game.state.players[m.id].locomotion)),
     movers.map((m) => `${m.id}:${game.state.players[m.id].locomotion}`).join(', '));
  ok('I5 no error banner appeared during the suite', !document.getElementById('err-banner'));
}
} catch (e) {
  fails++;
  lines.push(`FAIL  suite threw  <- ${e && e.message}`);
  lines.push((e && e.stack || '').split('\n').slice(0, 6).join('\n'));
}

try { releaseAll(); for (const id of spawned) registry.remove(id); } catch (e) { void e; }
emit();
