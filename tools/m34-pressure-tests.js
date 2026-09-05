/* Phase 11 build-side M27 suite — trigger pressure reaches the hand, and §6.5's grip-strength
 * assist gets a row.
 *
 * TWO CLAIMS, and the first one is mostly a claim that NOTHING MOVED.
 *
 *   §4.3 / input.js:13  "analog() returns 0..1 so a half-pulled trigger is a weaker grip."
 *   The binding tables have marked gripLeft/gripRight `analog: true` since Phase 3 and
 *   Input.analog() has returned the trigger's own 0..1 ever since, and GripSystem.capPerHand
 *   never read it: a feathered LT and a full pull were the same 750 N. The per-hand cap now
 *   scales with the trigger, live, every step a hand is closed.
 *
 *   §6.5  "Grip strength scaling … may reduce motor demand. They must preserve the physical
 *   puzzle rather than turn furniture into inventory icons."  The shell key `gripAssist`
 *   multiplies forceCap for every seat, bounded by GRIP.assist.max.
 *
 * WHY THE FIRST SECTION IS THE MOST IMPORTANT ONE. capPerHand is validated to the millimetre
 * by m2, m3, m4, m6 and m10 — the couch drag, the fridge binary, the co-op lift, the tow caps.
 * Every one of those fixtures is a full pull or a keyboard press, so the ONLY licence to touch
 * that method is that it is bit-identical at pressure 1 and assist 1. T1 therefore carries a
 * verbatim copy of the PRE-M27 formula and asserts equality across the whole multiplier matrix
 * (brace x hand count x wet x §5.2 exertion x four masses) before anything else runs.
 *
 * WHERE THE PRESSURE ENTERS, AND WHY IT IS NOT WHERE THE ASSIST ENTERS.
 * The assist multiplies forceCap, INSIDE min(strength, mass x maxAccel): it is strength, and
 * strength does not make a hand faster (the same rule brace and hand count obey). The pressure
 * scales the RESULT: how far the hand is closed limits everything the hand can do. That is not
 * a stylistic choice — a 9 kg box's cap is 225 N of mass x maxAccel against 750 N of strength,
 * so scaling strength alone would be inert on a box until the trigger fell below 0.30, which is
 * under GRIP.analog.floor and therefore never. T1j/T1k pin both halves of that.
 */

import { GRIP, SIM, PLAYER, CARRY, SETTINGS } from '../src/config.js';
import { DEFAULT_SETTINGS } from '../src/core/input.js';
import { effectiveFloorFriction, HANDS } from '../src/player/grip.js';
import { EVENTS } from '../src/core/eventBus.js';
import {
  SAVE_KEY, SHELL_DEFAULTS, defaultSave, load, save, clearSave, sanitiseShell,
} from '../src/core/save.js';

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

const { game, input, physics, registry, movers, settingsPanel } = M;
const STEP = SIM.stepMs;
const FRAME = SIM.stepMs;
const CTX = M.CONTEXTS.FOOT;
const frame = (n = 1) => { for (let i = 0; i < n; i++) game.frame(FRAME); };

/* ── driving helpers — m4/m6's, verbatim where they are load-bearing ───────────────────── */

/** Step every mover in main.js's order: clear forces ONCE, then each mover's grips and body,
 *  then physics. m4-tests.js step(); getting the order wrong is the bug Phase 4 was about. */
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
  entity.body.wakeUp();
  physics.primeQueries();
}
/** Aim a mover's OWN rig at a point and grab (m4-tests.js grabWith — a shared rig aimed for
 *  mover 1 reports "no grip" on every second-mover assertion). */
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
/** Raise a hand h metres STRAIGHT UP in world space (m4-tests.js raiseHand — decomposed onto
 *  the aim basis, because holdLocal.u is tilted by the pitch and nudging it lifts less than h). */
function raiseHand(m, hand, base, h) {
  const live = m.grips.grips[hand];
  if (!live) return;
  const sp = Math.sin(m.grips.aimPitch), cp = Math.cos(m.grips.aimPitch);
  live.holdLocal.f = base.f + h * sp;
  live.holdLocal.u = base.u + h * cp;
}
/** The lowest point of a possibly-rotated box, from the ground (m4-tests.js clearanceOf) —
 *  the arbiter of whether anything ACTUALLY left the floor, as opposed to tipping. */
function clearanceOf(entity) {
  const q = entity.body.rotation(), t = entity.body.translation();
  const d = entity.def.dimensions;
  const rxy = 2 * (q.x * q.y + q.z * q.w);
  const ryy = 1 - 2 * (q.x * q.x + q.z * q.z);
  const rzy = 2 * (q.y * q.z - q.x * q.w);
  const below = (d.x / 2) * Math.abs(rxy) + (d.y / 2) * Math.abs(ryy) + (d.z / 2) * Math.abs(rzy);
  return t.y - below;
}
const byDef = (id) => { for (const e of registry.entities.values()) if (e.defId === id) return e; return null; };

/** Empty ground, well clear of the house and of every other suite's staging grid. */
const PAD = { x: -40, z: 40 };
const FAR = { x: PAD.x - 25, z: PAD.z - 25 };

/* ── THE PRE-M27 FORMULA, copied verbatim from grip.js capPerHand as it stood before this
 * milestone. `this.tuning` was GRIP and `this.player` is the mover's controller. Nothing here
 * may be "tidied": it is the reference, and its ORDER of multiplications is the reference too
 * (float multiplication is not associative, and a reordering moves the last bits). */
function strengthToday(gs, entity, hands, brace, fresh = false) {
  const G = GRIP;
  let strength = G.forceCap * (entity.def.grip.forceMult || 1);
  if (brace) strength *= G.braceForceMult;
  if (hands > 1) strength *= G.twoHandForceMult;
  if (entity.state.wet) strength *= G.wetGripMult;
  if (gs.player && !fresh) strength *= gs.player.strengthFraction;
  return Math.min(strength, entity.def.mass * G.maxAccel) / Math.max(1, hands);
}

/** What step() would use for one hand right now: the live cap at the live trigger pressure. */
const liveCap = (m, entity, hands = 1, brace = false, hand = 'right') =>
  m.grips.capPerHand(entity, hands, brace, false, m.grips.handPressure(hand));

/** A stubbed Standard Gamepad through the REAL _pollPads path (m15 P7h / m26 stubPad shape),
 *  with per-button analog values so a trigger can be held half way. */
function stubPad() {
  const vals = new Map();
  const stub = {
    connected: true, index: 0, id: 'm34 stub (Standard Gamepad)', mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, (_, i) => ({
      get pressed() { return (vals.get(i) || 0) >= 0.5; },
      get value() { return vals.get(i) || 0; },
      touched: false,
    })),
  };
  navigator.getGamepads = () => [stub];
  return {
    hold(i, v) { vals.set(i, v); input.poll(FRAME); },
    unplug() {
      vals.clear();
      delete navigator.getGamepads;
      input.poll(FRAME);
      input.clear();
      input.activeDevice[0] = 'kbm'; input.activeDevice[1] = 'kbm';
    },
  };
}

/** The pad button an action is on IN THE LIVE TABLE. M18 made bindings a data edit, so
 *  PAD.LT is a default, not a fact — a remapped trigger has to be found, not assumed. */
function padButton(action, seat) {
  const t = input.bindingTable();
  const def = t[seat] && t[seat][CTX] && t[seat][CTX][action];
  return def && def.pad && def.pad.length ? def.pad[0] : null;
}

/** A seat-shaped stub for scripted pressure — the duck type GripSystem.setSeatInput takes
 *  (input.seat(n) is { activeDevice, analog(action) } as far as the grip system is concerned). */
function scriptedSeat(get) {
  return { activeDevice: 'pad', analog: (action) => get(action) };
}

const restore = [];
try {
/* ══ T1. THE STRENGTH METHOD — unchanged at a full pull, scaled below it ═══════════════════ */
lines.push('--- T1. the strength method (GDD §4.3, §6.2, §6.4; m2/m3/m4/m6/m10 pin every number) ---');
{
  const couch = byDef('couch_3seat_01');
  const dresser = byDef('dresser_01');
  const box = byDef('box_small_01');
  const fridge = byDef('fridge_01');
  ok('T1 the four reference objects exist', !!couch && !!dresser && !!box && !!fridge);

  const me = movers[0];
  releaseAll();
  placeMover(me, FAR.x, FAR.z);
  me.grips.setSeatInput(null);
  me.grips.setAssist(1);

  if (couch && dresser && box && fridge) {
    /* T1a — THE WHOLE MULTIPLIER MATRIX, with no seat and no assist. 4 masses x {1,2} hands x
     * {braced, not} x {tired, fresh} x {wet, dry} = 64 caps, each against the pre-M27 formula.
     * Asserted as an EXACT bit equality and reported against the brief's 1e-9. */
    let worst = 0, worstAt = '';
    let combos = 0;
    for (const e of [couch, dresser, box, fridge]) {
      const wasWet = !!e.state.wet;
      for (const wet of [false, true]) {
        e.state.wet = wet;
        for (const hands of [1, 2]) {
          for (const brace of [false, true]) {
            /* NOTE: placeMover zeroes controller.exertion, so strengthFraction is 1 and this
             * axis runs BOTH branches of the `!fresh` multiply over the same number — 32 distinct
             * caps compared twice, not 64. Bit-identity is what it measures, and that holds. */
            for (const fresh of [false, true]) {
              const now = me.grips.capPerHand(e, hands, brace, fresh);
              const then = strengthToday(me.grips, e, hands, brace, fresh);
              const d = Math.abs(now - then);
              combos++;
              if (d > worst) { worst = d; worstAt = `${e.defId} h${hands} brace=${brace} fresh=${fresh} wet=${wet}`; }
            }
          }
        }
      }
      e.state.wet = wasWet;
    }
    ok(`T1a the strength method is UNCHANGED at pressure 1 / assist 1 — ${combos} caps, exact`,
       worst === 0 && worst <= 1e-9, `worst |diff| ${worst} at ${worstAt}`);
    lines.push(`      couch 1 hand ${me.grips.capPerHand(couch, 1, false).toFixed(3)} N · ` +
               `2 hands ${me.grips.capPerHand(couch, 2, false).toFixed(3)} N each · ` +
               `braced ${me.grips.capPerHand(couch, 1, true).toFixed(3)} N · ` +
               `9 kg box ${me.grips.capPerHand(box, 1, false).toFixed(3)} N (mass x maxAccel)`);

    /* T1b-e — the same method through the REAL pad path: a stubbed Standard Gamepad, the live
     * binding table's trigger button, Input.analog()'s own dead-zone (triggerThreshold), and
     * the seat view main.js hands the grip system. */
    const pad = stubPad();
    const ltLeft = padButton('gripLeft', 0);
    const rtRight = padButton('gripRight', 0);
    ok('T1b the live table still puts both grips on a pad trigger (read from the table, not PAD.LT)',
       Number.isInteger(ltLeft) && Number.isInteger(rtRight) && ltLeft !== rtRight,
       `gripLeft=${ltLeft} gripRight=${rtRight}`);

    me.grips.setSeatInput(M.seatInput(0));
    const today1 = strengthToday(me.grips, couch, 1, false);

    pad.hold(rtRight, 1.0);
    eq('T1c a full pull is the pad seat\'s active device', input.activeDevice[0], 'pad');
    const full = liveCap(me, couch, 1, false, 'right');
    ok('T1d LT/RT at 1.0 → the hand\'s strength is TODAY\'S number, to 1e-9 (exactly equal)',
       full === today1 && Math.abs(full - today1) <= 1e-9, `${full} vs ${today1}`);

    pad.hold(rtRight, 0.5);
    const half = liveCap(me, couch, 1, false, 'right');
    near('T1e …at 0.5 → today x 0.5', half, today1 * 0.5, 1e-9);
    near('T1e2 …and handPressure reports the trigger itself', me.grips.handPressure('right'), 0.5, 1e-12);

    pad.hold(rtRight, 0.1);
    const feathered = liveCap(me, couch, 1, false, 'right');
    near('T1f …at 0.1 → today x GRIP.analog.floor (the floor wins)', feathered, today1 * GRIP.analog.floor, 1e-9);
    lines.push(`      couch, one hand: full ${full.toFixed(2)} N · half ${half.toFixed(2)} N · ` +
               `0.1 pull ${feathered.toFixed(2)} N (floor ${GRIP.analog.floor})`);
    eq('T1f2 the floor is the trigger threshold the hand closed at — below it the grip is already released',
       GRIP.analog.floor, DEFAULT_SETTINGS.triggerThreshold);

    // A KEYBOARD/MOUSE SEAT IS ALWAYS A FULL PULL — §4.4 parity is "the same actions", not
    // "the same nuance". The pad is still reporting 0.1 here; the device is what decides.
    input.activeDevice[0] = 'kbm';
    const kbm = liveCap(me, couch, 1, false, 'right');
    ok('T1g a keyboard/mouse seat is TODAY\'S number regardless of any analog reading (§4.4)',
       kbm === today1, `${kbm} vs ${today1} (pad still at 0.1)`);
    input.activeDevice[0] = 'pad';

    /* T1i — A LATCHED GRIP IS A FULL PULL. gripMode 'toggle' (§21.4's accessibility option,
     * M4): the trigger is RELEASED and the hand is still closed, so reading the trigger as
     * zero pressure would drop the box the instant the player let go of the toggle. */
    const modeWas = input.settings.gripMode;
    input.applySettings({ gripMode: 'toggle' });
    pad.hold(ltLeft, 1.0);          // press: latches gripLeft
    pad.hold(ltLeft, 0.0);          // release: the latch holds the hand closed
    const latched = liveCap(me, couch, 1, false, 'left');
    const todayLeft = strengthToday(me.grips, couch, 1, false);
    ok('T1i a latched (toggle-mode) grip is a full pull after the trigger is released',
       latched === todayLeft && input.isDown('gripLeft', 0),
       `${latched} vs ${todayLeft}, isDown=${input.isDown('gripLeft', 0)}, analog=${input.analog('gripLeft', 0)}`);
    pad.hold(ltLeft, 1.0); pad.hold(ltLeft, 0.0);   // un-latch
    input.applySettings({ gripMode: modeWas });
    input.clear();

    /* T1j — WHERE EACH FACTOR ENTERS. The assist is strength (inside the min), so it is inert
     * on an acceleration-limited box; the pressure scales the result, so it is not. This is
     * the measurement that decided the design, not a restatement of it. */
    me.grips.setSeatInput(null);
    const boxAt1 = me.grips.capPerHand(box, 1, false);
    me.grips.setAssist(GRIP.assist.max);
    const boxAtMax = me.grips.capPerHand(box, 1, false);
    me.grips.setAssist(1);
    const boxHalf = me.grips.capPerHand(box, 1, false, false, 0.5);
    ok('T1j the assist cannot make a hand FASTER: a 9 kg box is acceleration-limited and does not move',
       boxAtMax === boxAt1 && Math.abs(boxAt1 - box.def.mass * GRIP.maxAccel) < 1e-9,
       `${boxAt1} N at 1.0, ${boxAtMax} N at ${GRIP.assist.max} (mass x maxAccel = ${box.def.mass * GRIP.maxAccel})`);
    near('T1k …while pressure DOES scale it (this is why pressure multiplies the cap, not strength)',
         boxHalf, boxAt1 * 0.5, 1e-9);

    // A couch, where strength wins the min, moves with the assist by exactly the assist.
    const couchAt1 = me.grips.capPerHand(couch, 1, false);
    me.grips.setAssist(GRIP.assist.max);
    const couchAtMax = me.grips.capPerHand(couch, 1, false);
    me.grips.setAssist(1);
    near('T1l …and a strength-limited couch moves by exactly the assist', couchAtMax, couchAt1 * GRIP.assist.max, 1e-9);

    pad.unplug();
    me.grips.setSeatInput(null);
  }
}
emit('running...');

/* ══ T2. LIVE — easing off the trigger lowers the cap, the box sags, the hand slips ════════ */
lines.push('--- T2. live: a hand that opens loses what it is holding (GDD §6.2 grip loss, §2.1) ---');
{
  const box = byDef('box_small_01');
  const me = movers[0];
  releaseAll();
  me.grips.setAssist(1);
  me.grips.setSeatInput(null);

  if (box) {
    const d = box.def.dimensions;
    parkAt(box, PAD.x, d.y / 2 + 0.02, PAD.z);
    placeMover(me, PAD.x, PAD.z + d.z / 2 + 0.95);
    for (let i = 1; i < movers.length; i++) placeMover(movers[i], FAR.x + 6 * i, FAR.z + 6 * i);
    step(25);
    const g = grabWith(me, 'right', { x: PAD.x, y: d.y / 2 + 0.02, z: PAD.z + d.z / 2 });
    ok('T2a a hand is on the 9 kg box', !!g);

    if (g) {
      // GRIP_ENDED is the event the release path emits; the reasons are release()'s own
      // strings, so a NEW failure mode would show up here as a new word.
      const ended = [];
      const onEnd = (e) => ended.push(e.payload ? e.payload.reason : e.reason);
      game.bus.on(EVENTS.GRIP_ENDED, onEnd);

      let pressure = 1;
      me.grips.setSeatInput(scriptedSeat(() => pressure));
      const base = { f: g.holdLocal.f, u: g.holdLocal.u };

      // Lift it clear of the floor at a full pull, then let it settle: the hang is the
      // reference the sag is measured against, and a hand still rising is not a hang.
      for (let k = 0; k < 90; k++) { raiseHand(me, 'right', base, Math.min(1, k / 30) * 0.45); step(1); }
      const heldY = posOf(box).y;
      const heldStretch = me.grips.grips.right ? me.grips.grips.right.lastStretch : 0;
      const capFull = liveCap(me, box, 1, false, 'right');
      lines.push(`      hanging at a full pull: box y ${heldY.toFixed(3)} m (rest ${(d.y / 2).toFixed(3)}), ` +
                 `stretch ${heldStretch.toFixed(4)} m vs m.g/spring ${(box.def.mass * 9.81 / GRIP.spring).toFixed(4)}, ` +
                 `cap ${capFull.toFixed(1)} N, force ${(me.grips.grips.right ? me.grips.grips.right.lastApplied : 0).toFixed(1)} N`);
      ok('T2b …and holds it clear of the floor at a full pull',
         !!me.grips.grips.right && posOf(box).y > d.y / 2 + 0.10,
         `y ${heldY.toFixed(3)}, stretch ${heldStretch.toFixed(3)}, cap ${capFull.toFixed(1)} N`);

      // EASE OFF over 20 frames, then hold at 0.30 — under the floor, so the floor wins.
      const caps = [], stretches = [];
      let minY = posOf(box).y, slipStep = -1;
      for (let k = 0; k < 20; k++) {
        pressure = 1 - (1 - 0.30) * ((k + 1) / 20);
        caps.push(liveCap(me, box, 1, false, 'right'));
        step(1);
        const gr = me.grips.grips.right;
        if (gr) stretches.push(gr.lastStretch); else if (slipStep < 0) slipStep = k;
        minY = Math.min(minY, posOf(box).y);
      }
      for (let k = 0; k < 60; k++) {
        step(1);
        const gr = me.grips.grips.right;
        if (gr) stretches.push(gr.lastStretch); else if (slipStep < 0) slipStep = 20 + k;
        minY = Math.min(minY, posOf(box).y);
      }

      /* The cap falls on EVERY frame of the ease while the trigger is above the floor, and then
       * stops falling: below GRIP.analog.floor the hand is not weaker, it is opening, and the
       * input layer has already released it (T2f). */
      let falling = 0, flat = 0, bad = 0;
      for (let i = 1; i < caps.length; i++) {
        if (caps[i] < caps[i - 1] - 1e-12) falling++;
        else if (Math.abs(caps[i] - caps[i - 1]) <= 1e-12) flat++;
        else bad++;
      }
      const floorCap = box.def.mass * GRIP.maxAccel * GRIP.analog.floor;
      ok('T2c the cap drops on every frame of the ease and never rises',
         bad === 0 && falling >= 15, `${falling} falling, ${flat} flat (at the floor), ${bad} rising`);
      near('T2d …and lands on mass x maxAccel x GRIP.analog.floor', caps[caps.length - 1], floorCap, 1e-9);
      lines.push(`      9 kg box cap over the ease: ${caps.map((c) => c.toFixed(0)).join(' → ')} N ` +
                 `(weight ${(box.def.mass * 9.81).toFixed(1)} N)`);

      const peakStretch = stretches.length ? Math.max.apply(null, stretches) : 0;
      ok('T2e the box SAGS: the hand-to-object distance grows past the full-pull hold',
         peakStretch > heldStretch + 0.005,
         `${heldStretch.toFixed(4)} m held → ${peakStretch.toFixed(4)} m sagging`);

      const reason = me.grips.lastRelease ? me.grips.lastRelease.reason : null;
      ok('T2f the overloaded hand SLIPS through the existing path — no new event, no new reason',
         !me.grips.grips.right && reason === 'slipped' && ended.length >= 1 &&
         ended.every((r) => r === 'slipped'),
         `reason ${JSON.stringify(reason)}, GRIP_ENDED reasons ${JSON.stringify(ended)}, step ${slipStep}`);
      ok('T2g …and nothing fell through the floor',
         minY > d.y / 2 - 0.02 && Number.isFinite(minY),
         `lowest y ${minY.toFixed(4)} m (resting centre ${(d.y / 2).toFixed(3)} m)`);
      lines.push(`      sag: ${heldStretch.toFixed(4)} m held → ${peakStretch.toFixed(4)} m peak; ` +
                 `slip at step ${slipStep}; lowest y ${minY.toFixed(4)} m`);

      game.bus.off(EVENTS.GRIP_ENDED, onEnd);
      me.grips.setSeatInput(null);
      releaseAll();
      step(30);

      /* T2h — AND THE INPUT LAYER GETS THERE FIRST IN THE REAL GAME. A trigger under
       * SETTINGS' triggerThreshold is not a weak hold at all: _pollPads releases the token,
       * main.js sees !isDown and lets go. The floor above is for the band BETWEEN the
       * threshold and a full pull; it can never be reached by easing all the way off. */
      const pad = stubPad();
      const rt = padButton('gripRight', 0);
      pad.hold(rt, 1.0);
      const downAtFull = input.isDown('gripRight', 0);
      pad.hold(rt, 0.30);
      const downAtEased = input.isDown('gripRight', 0);
      ok('T2h a trigger eased under triggerThreshold is RELEASED by the input layer, not held weakly',
         downAtFull === true && downAtEased === false,
         `down at 1.0 = ${downAtFull}, down at 0.30 = ${downAtEased} (threshold ${input.settings.triggerThreshold})`);
      pad.unplug();
    }
  }
}
emit('running...');

/* ══ T3. §6.5's ASSIST — what it buys, and the two bounds that keep the puzzle ═════════════ */
lines.push('--- T3. the grip-strength assist (GDD §6.5, §6.2, §9.1) ---');
{
  const couch = byDef('couch_3seat_01');
  const fridge = byDef('fridge_01');
  const me = movers[0];
  releaseAll();
  me.grips.setSeatInput(null);
  me.grips.setAssist(1);
  for (const m of movers) { m.grips.setSeatInput(null); m.grips.setAssist(1); }

  /* EVERYTHING THIS SUITE HAS STAGED GOES CLEAR OF THE PAD FIRST — m6's own habit, and the
   * reason for it: T2 left a 9 kg box exactly where the couch is about to be parked, and the
   * grab ray found the box instead. The first run of this section measured a couch that
   * travelled 0.000 m at a tow limit of 4.78 m/s, which is a 9 kg box's tow limit, not a
   * couch's. Park by hand rather than trusting a spawn point. */
  for (const [id, dx, dz] of [['box_small_01', 12, 12], ['fridge_01', 0, 0], ['dresser_01', 18, 6]]) {
    const e = byDef(id);
    if (e) parkAt(e, FAR.x + dx, e.def.dimensions.y / 2 + 0.02, FAR.z + dz);
  }
  step(20);

  ok('T3a the assist exists in config with a default of off', GRIP.assist.default === 1 && GRIP.assist.max > 1,
     JSON.stringify(GRIP.assist));

  if (couch && fridge) {
    /* GUARD 1 — A PARTNER IS STILL WORTH MORE THAN THE SLIDER. Computed from config through
     * the strength method itself, not from a hand-typed number. */
    me.grips.setAssist(GRIP.assist.max);
    const soloAtMax = me.grips.capPerHand(couch, 1, false);
    me.grips.setAssist(1);
    const twoHandTotalAt1 = me.grips.capPerHand(couch, 2, false) * 2;
    ok('T3b GUARD: one hand at MAX assist stays below one mover\'s two-hand total at 1.0 (§6.5 "preserve the puzzle")',
       soloAtMax < twoHandTotalAt1 &&
       GRIP.forceCap * GRIP.assist.max < GRIP.forceCap * GRIP.twoHandForceMult,
       `${soloAtMax.toFixed(2)} N at max vs ${twoHandTotalAt1.toFixed(2)} N two-handed ` +
       `(assist.max ${GRIP.assist.max} < twoHandForceMult ${GRIP.twoHandForceMult})`);

    /* GUARD 2 — AND THE ASSIST NEVER TOUCHES THE STRETCH BAND, which is what actually keeps
     * the fridge a dolly job: a hand's force is also spring x stretch, so it can never exceed
     * spring x maxStretch however high the cap goes. m6 B5/B6/B10b own the binary; this states
     * it as the assist's bound so a later raise of assist.max has to face it. */
    const band = GRIP.spring * GRIP.maxStretch;
    const bandBraced = GRIP.spring * GRIP.maxStretch * GRIP.braceStretchMult;
    const fridgeN = effectiveFloorFriction(fridge, physics.R);
    ok('T3c GUARD: the fridge stays beyond one mover at ANY assist — the BAND, not the cap, is the wall',
       band < fridgeN && bandBraced < fridgeN,
       `band ${band.toFixed(0)} N (braced ${bandBraced.toFixed(0)}) vs fridge friction ${fridgeN.toFixed(0)} N; ` +
       `cap at max assist would be ${(GRIP.forceCap * GRIP.assist.max).toFixed(0)} N`);
  }

  /* T3e-T3g — THE LIFT THE ASSIST BUYS. m4 C2's fixture, one mover, both hands, on the couch made
   * WET (§6.2 wetGripMult 0.6 — the one §6.2 factor that pushes a two-hand couch hold out of
   * reach). At 1.0 the total cap is under the couch's weight and it never leaves the floor; at
   * max assist it does. The couch is grabbed on its TOP face over the centre of mass, because
   * m4 recorded what a front-face lift measures instead (a 0.148 m "lift" that was a tip).
   *
   * The fixture holds the mover RESTED and BALANCED (exertion and imbalance zeroed each step).
   * §5.2's exertion and §5.1's imbalance are time-based and would decide this by endurance
   * rather than by strength — which is m3's and m5's subject, not this one. What is measured
   * here is the cap. */
  const couchL = byDef('couch_3seat_01');
  if (couchL) {
    const liftWet = (assist) => {
      releaseAll();
      const d = couchL.def.dimensions;
      const cx = PAD.x, cz = PAD.z;
      parkAt(couchL, cx, 0.44, cz);
      placeMover(movers[0], cx, cz + d.z / 2 + 0.95);
      for (let i = 1; i < movers.length; i++) placeMover(movers[i], FAR.x + 6 * i, FAR.z + 6 * i);
      movers[0].grips.setAssist(assist);
      couchL.state.wet = true;
      step(25);
      const top = { x: cx, y: 0.44 + d.y / 2, z: cz + (couchL.def.centerOfMassOffset || { z: 0 }).z };
      const held = [];
      for (const hand of HANDS) {
        const gg = grabWith(movers[0], hand, top);
        if (gg) held.push({ hand, base: { f: gg.holdLocal.f, u: gg.holdLocal.u } });
      }
      let clear = 0, peakTotal = 0, heldSteps = 0;
      for (let k = 0; k < 200; k++) {
        const h = Math.min(1, k / 120) * 0.60;
        for (const x of held) raiseHand(movers[0], x.hand, x.base, h);
        movers[0].controller.exertion = 0;
        movers[0].controller.imbalance = 0;
        step(1);
        let total = 0, live = 0;
        for (const hand of HANDS) {
          const gr = movers[0].grips.grips[hand];
          if (gr && gr.entityId === couchL.id) { total += gr.lastApplied || 0; live++; }
        }
        if (live === held.length && live > 0) heldSteps++;
        peakTotal = Math.max(peakTotal, total);
        clear = Math.max(clear, clearanceOf(couchL));
      }
      releaseAll();
      couchL.state.wet = false;
      movers[0].grips.setAssist(1);
      return { hands: held.length, clear, peakTotal, heldSteps };
    };

    const off = liftWet(1);
    const on = liftWet(GRIP.assist.max);
    lines.push(`      wet couch (883 N), one mover, two hands: assist 1.00 → ${off.peakTotal.toFixed(0)} N peak, ` +
               `clear ${off.clear.toFixed(3)} m; assist ${GRIP.assist.max.toFixed(2)} → ${on.peakTotal.toFixed(0)} N peak, ` +
               `clear ${on.clear.toFixed(3)} m`);
    ok('T3e both lift attempts got two hands on it', off.hands === 2 && on.hands === 2,
       `${off.hands} / ${on.hands}`);
    ok('T3f at assist 1.0 the wet couch never leaves the floor (the cap is under its weight)',
       off.clear < 0.02 && off.peakTotal < couchL.def.mass * 9.81,
       `clear ${off.clear.toFixed(4)} m, peak ${off.peakTotal.toFixed(0)} N vs weight ${(couchL.def.mass * 9.81).toFixed(0)} N`);
    ok(`T3g …and at assist ${GRIP.assist.max} the same lift succeeds (§6.5 "may reduce motor demand")`,
       on.clear > 0.05 && on.peakTotal > couchL.def.mass * 9.81,
       `clear ${on.clear.toFixed(4)} m, peak ${on.peakTotal.toFixed(0)} N`);
  }

  /* T3h — AND THE DRAG. The assist's real home is where the CAP binds rather than the band:
   * towing. m6's haulDistance, one mover, one hand, 3 s, at 1.0 and at max — and m6's
   * haulTogether, two movers at 1.0, as the number the assist must stay well under. */
  const couchH = byDef('couch_3seat_01');
  if (couchH) {
    const haulSolo = (assist) => {
      releaseAll();
      const d = couchH.def.dimensions;
      parkAt(couchH, PAD.x, d.y / 2 + 0.02, PAD.z);
      placeMover(movers[0], PAD.x, PAD.z + d.z / 2 + 0.95);
      for (let i = 1; i < movers.length; i++) placeMover(movers[i], FAR.x + 6 * i, FAR.z + 6 * i);
      movers[0].grips.setAssist(assist);
      step(25);
      const g = grabWith(movers[0], 'right', { x: PAD.x, y: Math.min(d.y / 2, 1.2), z: PAD.z + d.z / 2 });
      const from = posOf(couchH);
      let heldSteps = 0, tow = 0;
      for (let k = 0; k < 180; k++) {
        step(1, { [movers[0].id]: { move: { x: 0, y: -1 }, yaw: 0 } });
        if (movers[0].grips.grips.right) heldSteps++;
        tow = movers[0].controller.towSpeedLimit;
      }
      const to = posOf(couchH);
      releaseAll();
      movers[0].grips.setAssist(1);
      return { moved: Math.hypot(to.x - from.x, to.z - from.z), heldSteps, tow, gripped: !!g };
    };
    const haulPair = () => {
      releaseAll();
      const d = couchH.def.dimensions;
      parkAt(couchH, PAD.x, d.y / 2 + 0.02, PAD.z);
      const zStand = PAD.z + d.z / 2 + 0.95, SIDE = 0.6;
      placeMover(movers[0], PAD.x - SIDE, zStand);
      placeMover(movers[1], PAD.x + SIDE, zStand);
      step(25);
      const gy = Math.min(d.y / 2, 1.2);
      const g0 = grabWith(movers[0], 'right', { x: PAD.x - SIDE, y: gy, z: PAD.z + d.z / 2 });
      const g1 = grabWith(movers[1], 'right', { x: PAD.x + SIDE, y: gy, z: PAD.z + d.z / 2 });
      const from = posOf(couchH);
      const it = { move: { x: 0, y: -1 }, yaw: 0 };
      let heldSteps = 0;
      for (let k = 0; k < 180; k++) {
        step(1, { [movers[0].id]: it, [movers[1].id]: it });
        if (movers[0].grips.grips.right && movers[1].grips.grips.right) heldSteps++;
      }
      const to = posOf(couchH);
      releaseAll();
      return { moved: Math.hypot(to.x - from.x, to.z - from.z), heldSteps, gripped: !!g0 && !!g1 };
    };

    const soloOff = haulSolo(1);
    const soloMax = haulSolo(GRIP.assist.max);
    const pair = haulPair();
    lines.push(`      solo couch haul, 3 s: assist 1.00 → ${soloOff.moved.toFixed(3)} m ` +
               `(tow ${Number.isFinite(soloOff.tow) ? soloOff.tow.toFixed(2) : 'inf'} m/s, held ${soloOff.heldSteps}/180); ` +
               `assist ${GRIP.assist.max.toFixed(2)} → ${soloMax.moved.toFixed(3)} m ` +
               `(tow ${Number.isFinite(soloMax.tow) ? soloMax.tow.toFixed(2) : 'inf'} m/s, held ${soloMax.heldSteps}/180); ` +
               `two movers at 1.00 → ${pair.moved.toFixed(3)} m`);
    ok('T3h all three hauls got a grip and kept it', soloOff.gripped && soloMax.gripped && pair.gripped &&
       soloOff.heldSteps >= 150 && soloMax.heldSteps >= 150 && pair.heldSteps >= 150,
       `${soloOff.heldSteps} / ${soloMax.heldSteps} / ${pair.heldSteps} of 180`);
    ok('T3i the assist DOES help where the cap binds: a solo couch drag travels further',
       soloMax.moved > soloOff.moved,
       `${soloOff.moved.toFixed(3)} m → ${soloMax.moved.toFixed(3)} m`);
    ok('T3j GUARD: …and still travels less than 70% of what two movers do (a partner stays the answer)',
       soloMax.moved < pair.moved * 0.70,
       `solo at max ${soloMax.moved.toFixed(3)} m vs two movers ${pair.moved.toFixed(3)} m ` +
       `(${(100 * soloMax.moved / Math.max(1e-9, pair.moved)).toFixed(1)}% — the bound is 70%)`);
  }

  for (const m of movers) m.grips.setAssist(1);
  releaseAll();
}
emit('running...');

/* ══ T4. PERSISTENCE AND THE ROW ═══════════════════════════════════════════════════════════ */
lines.push('--- T4. the settings row and the save (GDD §21.4, §26.6, §6.5) ---');
{
  const before = (() => { try { return localStorage.getItem(SAVE_KEY); } catch (e) { return null; } })();
  restore.push(() => {
    try { if (before === null) localStorage.removeItem(SAVE_KEY); else localStorage.setItem(SAVE_KEY, before); }
    catch (e) { /* no storage; nothing to put back */ }
  });

  eq('T4a the shell default is off', SHELL_DEFAULTS.gripAssist, GRIP.assist.default);
  eq('T4b …and a fresh save carries it', defaultSave().shell.gripAssist, GRIP.assist.default);

  // ROUND TRIP through the real save, on each allowed step.
  const trips = [];
  for (const v of GRIP.assist.steps) {
    save({ settings: {}, shell: { ...SHELL_DEFAULTS, gripAssist: v }, bestInvoice: null, runs: [], bindings: {} });
    trips.push(load().shell.gripAssist);
  }
  eq('T4c every allowed step round-trips through save/load', trips.join(','), GRIP.assist.steps.join(','));

  // SANITISATION. A save is a file a player can edit; a value that is not one of the row's own
  // steps is refused outright rather than clamped, so a damaged save is never quietly stronger.
  const junk = [9, 100, 0.5, -1, 1.4, 1.51, 'strong', null, NaN, Infinity];
  const sanitised = junk.map((v) => sanitiseShell({ gripAssist: v }).gripAssist);
  ok('T4d an out-of-range, off-step or non-numeric assist falls back to 1.0',
     sanitised.every((v) => v === GRIP.assist.default),
     `${JSON.stringify(junk)} → ${JSON.stringify(sanitised)}`);
  eq('T4e …while the top step survives', sanitiseShell({ gripAssist: GRIP.assist.max }).gripAssist, GRIP.assist.max);
  eq('T4f …and GripSystem.setAssist clamps anything that gets past it',
     `${movers[0].grips.setAssist(99)}/${movers[0].grips.setAssist(-3)}/${movers[0].grips.setAssist('x')}`,
     `${GRIP.assist.max}/1/1`);
  movers[0].grips.setAssist(1);

  // SEVEN SECTIONS, still. gripAssist lives under `shell` — no new top-level key (m16 V4c).
  save({ settings: {}, shell: { ...SHELL_DEFAULTS, gripAssist: GRIP.assist.max }, bestInvoice: null, runs: [], bindings: {} });
  const blob = JSON.parse(localStorage.getItem(SAVE_KEY));
  eq('T4g the blob still has exactly the seven documented sections (the key is under shell)',
     Object.keys(blob).sort().join(','), 'bestInvoice,bindings,build,runs,schema,settings,shell');
  eq('T4h …and the value is in the shell section', blob.shell.gripAssist, GRIP.assist.max);

  // THE ROW. A data row m16 U2's walk finds, whose consumer is every mover's GripSystem.
  const keys = settingsPanel.keys();
  ok('T4i the card carries a data row for it', keys.includes('gripAssist'), keys.join(','));
  const control = document.querySelector('#settings-screen [data-setting="gripAssist"]');
  ok('T4j …as a range over the config bounds', !!control && control.type === 'range' &&
     Number(control.min) === SETTINGS.ranges.gripAssist.min && Number(control.max) === SETTINGS.ranges.gripAssist.max,
     control ? `${control.type} ${control.min}..${control.max} step ${control.step}` : 'no control');
  if (control) {
    const setControl = (v) => {
      control.value = String(v);
      control.dispatchEvent(new Event('input', { bubbles: true }));
    };
    setControl(GRIP.assist.max);
    const moved = movers.map((m) => m.grips.assist);
    ok('T4k the row moves EVERY mover\'s grip system (its consumer), not just the driven one',
       moved.every((v) => v === GRIP.assist.max), JSON.stringify(moved));
    eq('T4l …and persists', load().shell.gripAssist, GRIP.assist.max);
    setControl(1);
    eq('T4m …and back to off', movers[0].grips.assist, 1);
    settingsPanel.el.querySelector('[data-act="defaults"]').click();
    eq('T4n Defaults leaves it off', movers[0].grips.assist, GRIP.assist.default);
  }
  clearSave();
  for (const m of movers) m.grips.setAssist(1);
}
emit('running...');

/* ══ T5. CO-OP — one seat's trigger is one seat's hands ════════════════════════════════════ */
lines.push('--- T5. co-op: pressure is per seat (GDD §6.4, §4.4, §22.4) ---');
{
  const couch = byDef('couch_3seat_01');
  releaseAll();
  for (const m of movers) { m.grips.setSeatInput(null); m.grips.setAssist(1); }
  const seatsWere = M.seatCount;
  M.setSeats(2);
  const pad = stubPad();
  // In co-op the FIRST pad goes to the JOINER (input.js seatForPadSlot), i.e. seat 1.
  const rt1 = padButton('gripRight', 1);
  const lt1 = padButton('gripLeft', 1);
  pad.hold(rt1, 0.5);
  pad.hold(lt1, 0.5);
  frame(2);   // main.js's movers system wires each mover to the seat driving it

  eq('T5a two seats, and the pad went to the joiner', `${M.seatCount}/${input.activeDevice[1]}/${input.activeDevice[0]}`,
     '2/pad/kbm');
  ok('T5b main.js wires each mover to its OWN seat',
     movers[0].grips.seatInput === M.seatInput(0) && movers[1].grips.seatInput === M.seatInput(1),
     `${!!movers[0].grips.seatInput} / ${!!movers[1].grips.seatInput}`);
  near('T5c seat 1\'s half-pulled trigger reaches seat 1\'s hands', movers[1].grips.handPressure('right'), 0.5, 1e-12);
  eq('T5d …and seat 0, on the keyboard, is a full pull', movers[0].grips.handPressure('right'), 1);
  if (couch) {
    const today = strengthToday(movers[0].grips, couch, 1, false);
    eq('T5e so seat 0\'s cap is today\'s number and seat 1\'s is half of it',
       `${liveCap(movers[0], couch, 1, false)}/${liveCap(movers[1], couch, 1, false)}`,
       `${today}/${today * 0.5}`);
  }
  lines.push(`      seat 0 (kbm) pressure ${movers[0].grips.handPressure('right')} · ` +
             `seat 1 (pad at 0.5) pressure ${movers[1].grips.handPressure('right')}`);

  pad.unplug();
  M.setSeats(seatsWere);
  frame(1);
  for (const m of movers) { m.grips.setAssist(1); }
  eq('T5f solo again', M.seatCount, seatsWere);
}

/* ── tidy up: nothing this suite did may reach another one ─────────────────────────────── */
releaseAll();
for (const m of movers) { m.grips.setAssist(1); m.grips.setSeatInput(null); }
for (const e of registry.entities.values()) e.state.wet = false;
for (const f of restore) { try { f(); } catch (e) { /* best effort */ } }

} catch (e) {
  fails++;
  lines.push(`FAIL  suite threw  <- ${e && e.message}`);
  lines.push((e && e.stack || '').split('\n').slice(0, 8).join('\n'));
  try { for (const f of restore) f(); } catch (e2) { /* best effort */ }
  try { delete navigator.getGamepads; } catch (e2) { /* best effort */ }
}

lines.push('');
lines.push(`      GRIP.analog.floor ${GRIP.analog.floor} · GRIP.assist ${JSON.stringify(GRIP.assist)} · ` +
           `forceCap ${GRIP.forceCap} N · band ${(GRIP.spring * GRIP.maxStretch).toFixed(0)} N · ` +
           `PLAYER.acceleration ${PLAYER.acceleration} · CARRY.tractionN ${CARRY.tractionN}`);
emit();
