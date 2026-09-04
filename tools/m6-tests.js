/* Phase 6 suite — tools.
 *
 * §25.2 gate under test: "Dolly, protection, ramp, disassembly" →
 * **each solves a physical problem**.
 *
 * "Solves a physical problem" only means something against a baseline where the problem is
 * UNSOLVED, so every tool gets a paired measurement: the same scenario, the same objects,
 * tool absent versus tool present, with a threshold that separates them. A tool that merely
 * makes something nicer is an upgrade; a tool that changes what is possible is §9.1.
 *
 * And every tool gets a third measurement, because §9.1 does not stop at the first sentence:
 * "Better tools should introduce both new mastery and new accidents." A tool with no failure
 * mode is a permission. Each of the four has its accident asserted here, and in every case
 * the accident is the SAME physical change seen from the other side — nothing is authored
 * twice.
 *
 *   dolly       friction    rolls on the flat; runs away on a slope
 *   blanket     protection  survives more; harder to hold
 *   ramp        clearance   bridges the deck; leaves a lip if laid badly
 *   screwdriver dimensions  packs smaller; makes parts to lose
 */

import { SIM, TOOLS, DAMAGE, PLAYER, GRIP, CARRY } from '../src/config.js';
import { OBJECT_DEFS } from '../src/objects/definitions.js';
import { TOOL_DEFS, PHASE6_TOOL_SPAWNS, validateAllToolDefs } from '../src/tools/definitions.js';
import {
  impactToleranceOf, conditionLossFor, gripMultiplierFor, blanketShedsAt,
  rampGeometry, packedVolume, disassemble, reassemble, currentDimensions,
} from '../src/tools/tools.js';
import { INTERIOR_DOORS, zoneAt } from '../src/world/house.js';
import { minProjectedWidth } from '../src/render/scene.js';
import { EVENTS } from '../src/core/eventBus.js';
import { restoreClearedObjects } from '../src/player/grip.js';
import { GROUP_PRESETS } from '../src/physics/world.js';

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
let M;
try { M = await window.__MFH_READY; }
catch (e) {
  fails++; lines.push(`FAIL  boot threw  <- ${e && e.message}`);
  lines.push((e && e.stack || '').split('\n').slice(0, 6).join('\n'));
  emit(); throw e;
}

const { game, physics, rig, registry, movers, camera, tools } = M;
const STEP = SIM.stepMs;

/* ── driving helpers ─────────────────────────────────────────────────────── */
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
function grabWith(m, hand, target) {
  const p = m.controller.position;
  rig.yaw = Math.atan2(-(target.x - p.x), -(target.z - p.z));
  rig.pitch = Math.atan2(target.y - (p.y + 1.4), Math.hypot(target.x - p.x, target.z - p.z));
  for (let k = 0; k < 20; k++) rig.update(p, 1 / 60);
  const c = camera.position;
  rig.yaw = Math.atan2(-(target.x - c.x), -(target.z - c.z));
  rig.pitch = Math.atan2(target.y - c.y, Math.hypot(target.x - c.x, target.z - c.z));
  return m.grips.tryGrab(hand, m.id, game.clock.simTimeMs);
}
const byDef = (id) => { for (const e of registry.entities.values()) if (e.defId === id) return e; return null; };
const toolByDef = (id) => { for (const t of tools.tools.values()) if (t.defId === id) return t; return null; };

/** Empty ground, well clear of the house and of m5's staging grid. */
const PAD = { x: -40, z: 40 };

/**
 * ONE MOVER HAULS AN OBJECT FOR A FIXED TIME. The paired measurement for the dolly.
 *
 * Deliberately ONE mover and one hand: the dolly's claim is that it changes what a single
 * person can do, and measuring it with two would hide exactly the transition that matters.
 */
function haulDistance(entity, useDolly, dolly, { brace = false } = {}) {
  releaseAll();
  const d = entity.def.dimensions;
  parkAt(entity, PAD.x, d.y / 2 + 0.02, PAD.z);
  if (useDolly) tools.attachDolly(dolly, entity);

  placeMover(movers[0], PAD.x, PAD.z + d.z / 2 + 0.95);
  placeMover(movers[1], PAD.x + 20, PAD.z + 20);          // parked well out of the way
  step(25);
  const g = grabWith(movers[0], 'right', { x: PAD.x, y: Math.min(d.y / 2, 1.2), z: PAD.z + d.z / 2 });

  const from = posOf(entity);
  const mFrom = { ...movers[0].controller.position };
  let heldSteps = 0, tow = 0, peakF = 0, peakStretch = 0, peakPull = 0, load = 0;
  const muDuring = entity.collider.friction();
  let sleptSteps = 0, peakObjSpeed = 0;
  for (let k = 0; k < 180; k++) {
    step(1, { [movers[0].id]: { move: { x: 0, y: -1 }, yaw: 0, brace } });
    const gr = movers[0].grips.grips.right;
    if (gr) {
      heldSteps++;
      peakF = Math.max(peakF, gr.lastApplied || 0);
      peakStretch = Math.max(peakStretch, gr.lastStretch || 0);
    }
    tow = movers[0].controller.towSpeedLimit;
    peakPull = Math.max(peakPull, Math.hypot(movers[0].controller.pull.x, movers[0].controller.pull.z));
    load = Math.max(load, movers[0].controller.carriedMass);
    if (entity.body.isSleeping()) sleptSteps++;
    const ev = entity.body.linvel();
    peakObjSpeed = Math.max(peakObjSpeed, Math.hypot(ev.x, ev.z));
  }
  const to = posOf(entity);
  const mTo = { ...movers[0].controller.position };

  releaseAll();
  if (useDolly) tools.detachDolly(dolly);
  return {
    moved: Math.hypot(to.x - from.x, to.z - from.z),
    moverMoved: Math.hypot(mTo.x - mFrom.x, mTo.z - mFrom.z),
    heldSteps, tow, peakF, peakStretch, peakPull, load,
    friction: muDuring, sleptSteps, peakObjSpeed,
    gripped: !!g,
  };
}

/** Aim a mover's OWN rig at a point and grab — tools/m4-tests.js grabWith. m6's grabWith
 *  above aims the shared rig, which is mover 0's; aiming it for mover 1 reports "no grip"
 *  on every second-mover assertion (Phase 12 lesson, m4-tests.js). */
function grabWithOwnRig(m, hand, target) {
  const p = m.controller.position;
  m.rig.yaw = Math.atan2(-(target.x - p.x), -(target.z - p.z));
  m.rig.pitch = Math.atan2(target.y - (p.y + 1.4), Math.hypot(target.x - p.x, target.z - p.z));
  for (let k = 0; k < 20; k++) m.rig.update(p, 1 / 60);
  const c = m.camera.position;
  m.rig.yaw = Math.atan2(-(target.x - c.x), -(target.z - c.z));
  m.rig.pitch = Math.atan2(target.y - c.y, Math.hypot(target.x - c.x, target.z - c.z));
  return m.grips.tryGrab(hand, m.id, game.clock.simTimeMs);
}

/**
 * TWO MOVERS haul the same object, one hand each, side by side on its front face, for the
 * same 180 steps as haulDistance — §26.2's "handled materially better with another
 * grip/player", measured in the same units as the solo haul. Same return shape.
 */
function haulTogether(entity, { brace = false } = {}) {
  releaseAll();
  const d = entity.def.dimensions;
  parkAt(entity, PAD.x, d.y / 2 + 0.02, PAD.z);
  const zStand = PAD.z + d.z / 2 + 0.95;
  const SIDE = 0.6;
  placeMover(movers[0], PAD.x - SIDE, zStand);
  placeMover(movers[1], PAD.x + SIDE, zStand);
  step(25);
  const gy = Math.min(d.y / 2, 1.2);
  const g0 = grabWithOwnRig(movers[0], 'right', { x: PAD.x - SIDE, y: gy, z: PAD.z + d.z / 2 });
  const g1 = grabWithOwnRig(movers[1], 'right', { x: PAD.x + SIDE, y: gy, z: PAD.z + d.z / 2 });

  const from = posOf(entity);
  const mFrom = { ...movers[0].controller.position };
  let heldSteps = 0, tow = 0, peakF = 0, peakStretch = 0, peakPull = 0, load = 0;
  const muDuring = entity.collider.friction();
  let sleptSteps = 0, peakObjSpeed = 0;
  const it = { move: { x: 0, y: -1 }, yaw: 0, brace };
  for (let k = 0; k < 180; k++) {
    step(1, { [movers[0].id]: it, [movers[1].id]: it });
    const live = [movers[0].grips.grips.right, movers[1].grips.grips.right];
    if (live.every(Boolean)) {
      heldSteps++;
      for (const gr of live) {
        peakF = Math.max(peakF, gr.lastApplied || 0);
        peakStretch = Math.max(peakStretch, gr.lastStretch || 0);
      }
    }
    tow = movers[0].controller.towSpeedLimit;
    peakPull = Math.max(peakPull, Math.hypot(movers[0].controller.pull.x, movers[0].controller.pull.z));
    load = Math.max(load, movers[0].controller.carriedMass);
    if (entity.body.isSleeping()) sleptSteps++;
    const ev = entity.body.linvel();
    peakObjSpeed = Math.max(peakObjSpeed, Math.hypot(ev.x, ev.z));
  }
  const to = posOf(entity);
  const mTo = { ...movers[0].controller.position };

  releaseAll();
  return {
    moved: Math.hypot(to.x - from.x, to.z - from.z),
    moverMoved: Math.hypot(mTo.x - mFrom.x, mTo.z - mFrom.z),
    heldSteps, tow, peakF, peakStretch, peakPull, load,
    friction: muDuring, sleptSteps, peakObjSpeed,
    gripped: !!g0 && !!g1,
  };
}

try {
/* ── A. the four tools exist as world objects (§9.1, §9.2) ───────────────── */
lines.push('--- A. tools as world objects (GDD §9.1, §9.2) ---');
{
  eq('A1 §9.1\'s four prototype-required tools are defined', Object.keys(TOOL_DEFS).length, 4);
  ok('A2 …and all four are in the world', tools.count === 4, `${tools.count}`);

  /* §9.1's table has TWO columns for every tool, and the second one is the interesting one.
   * A tool with a primary function and no failure mode is an upgrade, and §9.1 says better
   * tools must bring "both new mastery and new accidents". Asserted as data so a new tool
   * cannot be added without answering the question. */
  const noFailure = Object.values(TOOL_DEFS).filter((d) => !d.failure);
  ok('A3 every tool declares a failure/comedy mode (§9.1)', noFailure.length === 0,
     noFailure.map((d) => d.id).join(', '));
  const noPrimary = Object.values(TOOL_DEFS).filter((d) => !d.primary);
  ok('A4 …and a primary function', noPrimary.length === 0, noPrimary.map((d) => d.id).join(', '));

  const problems = validateAllToolDefs();
  ok('A5 the tool definitions pass validation (§24.4)',
     Object.keys(problems).length === 0, JSON.stringify(problems).slice(0, 150));

  ok('A6 every tool is a body with real mass (§9.2 "tools are world objects")',
     [...tools.tools.values()].every((t) => t.def.mass > 0 && !!t.body));
  ok('A7 …with stable distinct string ids (§9.2, §22.4)',
     new Set([...tools.tools.keys()]).size === tools.count &&
     [...tools.tools.keys()].every((k) => typeof k === 'string'));
  ok('A8 …and serializable state only',
     (() => { try { JSON.stringify([...tools.tools.values()].map((t) => t.state)); return true; }
              catch (e) { return false; } })());

  /* §9.2: "Deploy, attach, tension, fold, and retrieve through the COMMON interaction
   * system." Four verbs for one gesture is how a player presses the wrong key at the top of
   * a ramp, so every tool's mode has to come from one small closed set. */
  const MODES = ['attach', 'cover', 'deploy', 'apply'];
  ok('A9 every tool uses one common interaction verb (§9.2)',
     Object.values(TOOL_DEFS).every((d) => MODES.includes(d.mode)));

  // §9.3's tool rack: on the driveway, outside the house, so fetching one is a real trip.
  const outside = PHASE6_TOOL_SPAWNS.filter((s) => {
    const z = zoneAt({ x: s.x, y: 0.5, z: s.z });
    return !z || z.site !== 'pickup';
  });
  ok('A10 the tool rack sits in a named site zone (§9.3)', outside.length === 0,
     outside.map((s) => s.def).join(', '));
}
emit('running...');

/* ── B. THE DOLLY — friction (§9.1) ──────────────────────────────────────── */
lines.push('--- B. dolly: friction (GDD §9.1 "roll heavy items on level ground") ---');
{
  const dolly = toolByDef('dolly_flat_01');
  const couch = byDef('couch_3seat_01');
  const fridge = byDef('fridge_01');
  ok('B1 there is a dolly, a couch and a fridge', !!dolly && !!couch && !!fridge);

  if (dolly && couch && fridge) {
    /* THE ARITHMETIC FIRST, so the physics has something to be checked against.
     * Bare: friction 0.35 x 90 x 9.81 = 309 N. On the dolly: 0.04 x 883 = 35 N. */
    const bareCouchN = couch.def.physics.friction * couch.def.mass * 9.81;
    const dollyCouchN = TOOLS.dolly.rollingResistance * couch.def.mass * 9.81;
    lines.push(`      couch resistance: ${bareCouchN.toFixed(0)} N bare -> ${dollyCouchN.toFixed(0)} N on wheels`);
    ok('B2 the dolly cuts resistance by at least 7x, on paper',
       bareCouchN / dollyCouchN >= 7, `${(bareCouchN / dollyCouchN).toFixed(1)}x`);

    // …and now the same claim in the simulation, one mover, one hand, same drive both times.
    const bare = haulDistance(couch, false, dolly);
    const wheeled = haulDistance(couch, true, dolly);
    const show = (tag, r) => lines.push(
      `      ${tag}: object ${r.moved.toFixed(2)} m, mover ${r.moverMoved.toFixed(2)} m, ` +
      `held ${r.heldSteps}/180, tow ${Number.isFinite(r.tow) ? r.tow.toFixed(2) : 'inf'}, ` +
      `mu ${r.friction.toFixed(2)}, F ${r.peakF.toFixed(0)} N, stretch ${r.peakStretch.toFixed(2)}, ` +
      `pull ${r.peakPull.toFixed(2)}, slept ${r.sleptSteps}/180, objPeak ${r.peakObjSpeed.toFixed(2)} m/s`);
    show('couch bare', bare);
    show('couch on dolly', wheeled);
    ok('B3 both hauls got a grip', bare.gripped && wheeled.gripped);
    ok('B4 a couch on a dolly goes markedly further for the same effort — the gate',
       wheeled.moved > bare.moved * 2.5 && wheeled.moved > 1.0,
       `${bare.moved.toFixed(2)} m -> ${wheeled.moved.toFixed(2)} m`);

    /* THE BINARY, and the best statement of the tool's purpose. The fridge is 110 kg with
     * friction 0.48: 518 N to shift, against a one-hand budget measured at ~358 N. It is
     * the one object in the contract a single mover genuinely cannot budge. On a dolly it
     * needs 43 N. */
    const fridgeBareN = fridge.def.physics.friction * fridge.def.mass * 9.81;
    ok('B5 the fridge is beyond one hand unaided (518 N vs a ~358 N budget)',
       fridgeBareN > 450, `${fridgeBareN.toFixed(0)} N`);
    const fBare = haulDistance(fridge, false, dolly);
    const fWheel = haulDistance(fridge, true, dolly);
    lines.push(`      fridge hauled 3s by one hand: ${fBare.moved.toFixed(2)} m bare, ${fWheel.moved.toFixed(2)} m on the dolly`);
    ok('B6 one mover cannot shift the fridge unaided', fBare.moved < 0.35,
       `${fBare.moved.toFixed(2)} m`);
    ok('B7 …and can once it is on the dolly — §9.1\'s "new physical solution"',
       fWheel.moved > 1.0, `${fWheel.moved.toFixed(2)} m`);

    /* ── Phase 11 (M7): SOLO DRAG, MEASURED HONESTLY ───────────────────────────────
     *
     * The milestone brief was "two config numbers and one subtraction make the solo couch
     * drag travel": a traction budget the legs anchor before the reaction becomes pull
     * (CARRY.tractionN / braceTractionN) and a wider braced stretch band
     * (GRIP.braceStretchMult). The mechanism is in. The sweep that tuned it is the result,
     * and it is a negative one — the table and the derivation are at CARRY.tractionN.
     *
     * In one line: the grip damps against the object's ABSOLUTE velocity, so a towed couch
     * can follow a hand no faster than (spring x band - friction)/c = 0.137 m/s unbraced,
     * 0.248 m/s braced, and the only thing that ever slowed the mover to that was the pull
     * the traction budget removes. Budget 0 stalls (0.00 m, held); any budget tears (a mover
     * strolling 7 m from a stationary couch) and tears the DOLLY haul too. Braced 400 N buys
     * a quarter-metre and lets a lone braced mover topple the fridge — a product decision,
     * recorded in KNOWN_ISSUES, and not taken here.
     *
     * So what is pinned is the MECHANISM (m3 D5) and the CEILINGS, so the next increment —
     * hand-frame damping, which lifts the ceiling — is measured against a record rather
     * than a hope; plus the gain that does exist: two movers tow what one cannot. */
    {
      const GROUND_MU = 0.9;                          // physics/world.js ground collider
      const effectiveFriction = (e) => ((e.def.physics.friction + GROUND_MU) / 2) * e.def.mass * 9.81;
      const frictionN = effectiveFriction(couch);      // 552 N under the Average rule
      const cCouch = 2 * GRIP.dampingRatio * Math.sqrt(GRIP.spring * couch.def.mass);   // 569 N.s/m
      const ceiling = (band) => Math.max(0, (GRIP.spring * band - frictionN) / cCouch);
      const vBare = ceiling(GRIP.maxStretch);
      const vBraced = ceiling(GRIP.maxStretch * GRIP.braceStretchMult);
      lines.push(`      world-frame damping ceiling: ${vBare.toFixed(3)} m/s unbraced, ${vBraced.toFixed(3)} m/s braced ` +
                 `(x 3 s = ${(vBare * 3).toFixed(2)} / ${(vBraced * 3).toFixed(2)} m); traction ${CARRY.tractionN} / ${CARRY.braceTractionN} N`);

      // Everything the hauls above left on the pad goes well clear, or the next haul
      // measures a collision — the fridge on the dolly was measured 1.49 m with the couch
      // standing in the mover's path and 1.72 m with it parked away.
      const FAR = { x: PAD.x - 25, z: PAD.z - 25 };
      parkAt(fridge, FAR.x, fridge.def.dimensions.y / 2 + 0.02, FAR.z);

      const solo = haulDistance(couch, false, dolly);
      const soloBraced = haulDistance(couch, false, dolly, { brace: true });
      show('couch bare, solo, unbraced', solo);
      show('couch bare, solo, braced', soloBraced);
      ok('B8 solo unbraced: the hold never tears, so the mover never strolls — and travel stays under the ceiling',
         solo.gripped && solo.heldSteps === 180 && solo.moverMoved < 2.0 && solo.moved <= vBare * 3 + 0.05,
         `moved ${solo.moved.toFixed(3)} m (ceiling ${(vBare * 3).toFixed(2)} m), held ${solo.heldSteps}/180, mover ${solo.moverMoved.toFixed(2)} m`);
      ok('B9 solo braced: bracing never makes the hold LESS stable than unbraced (§6.2 "raises stability")',
         soloBraced.gripped && soloBraced.heldSteps === 180 && soloBraced.moverMoved < 2.0 &&
         soloBraced.moved <= vBraced * 3 + 0.05 && soloBraced.moved >= solo.moved - 0.01,
         `moved ${soloBraced.moved.toFixed(3)} m (ceiling ${(vBraced * 3).toFixed(2)} m), held ${soloBraced.heldSteps}/180, mover ${soloBraced.moverMoved.toFixed(2)} m`);
      ok('B10 the braced band stays under the fridge\'s sliding limit and under the braced saturation point',
         GRIP.maxStretch * GRIP.braceStretchMult * GRIP.spring < effectiveFriction(fridge) &&
         GRIP.maxStretch * GRIP.braceStretchMult < (GRIP.forceCap * GRIP.braceForceMult) / GRIP.spring &&
         GRIP.maxStretch < GRIP.forceCap / GRIP.spring,
         `${(GRIP.maxStretch * GRIP.braceStretchMult * GRIP.spring).toFixed(0)} N vs fridge ${effectiveFriction(fridge).toFixed(0)} N; ` +
         `${(GRIP.maxStretch * GRIP.braceStretchMult).toFixed(3)} m vs ${((GRIP.forceCap * GRIP.braceForceMult) / GRIP.spring).toFixed(3)} m`);
      /* A deliberate limitation pin, in the m6 E8 tradition: the ceiling, not the traction
       * budget, is what bounds solo drag today. Rewrite this on purpose when the damping
       * becomes hand-relative; do not let a retune claim the win by accident. */
      ok('B10a …and that ceiling, under 0.30 m/s either way, bounds any solo tow (the stall at 0 N itself is the pull limit cycle, m3 D5 line)',
         vBare < 0.30 && vBraced < 0.30 && vBraced > vBare,
         `${vBare.toFixed(3)} / ${vBraced.toFixed(3)} m/s`);

      // B5/B6's binary must survive bracing. The couch goes clear first.
      parkAt(couch, FAR.x - 4, couch.def.dimensions.y / 2 + 0.02, FAR.z);
      const fBraced = haulDistance(fridge, false, dolly, { brace: true });
      show('fridge bare, solo, braced', fBraced);
      ok('B10b a braced lone mover still cannot shift — or topple — the fridge unaided',
         fBraced.moved < 0.35, `${fBraced.moved.toFixed(3)} m, held ${fBraced.heldSteps}/180, F ${fBraced.peakF.toFixed(0)} N`);
      parkAt(fridge, FAR.x, fridge.def.dimensions.y / 2 + 0.02, FAR.z);

      // §26.2 "handled materially better with another grip/player" — the gain that exists.
      const pair = haulTogether(couch);
      const pairBraced = haulTogether(couch, { brace: true });
      show('couch bare, two movers, unbraced', pair);
      show('couch bare, two movers, braced', pairBraced);
      ok('B10c two movers tow what one cannot: >= 1.0 m further than solo and >= 1.5x, holding throughout (§26.2)',
         pair.gripped && pair.heldSteps === 180 && pair.moved >= solo.moved + 1.0 && pair.moved >= solo.moved * 1.5,
         `two ${pair.moved.toFixed(2)} m vs solo ${solo.moved.toFixed(2)} m, held ${pair.heldSteps}/180`);

      /* m2 E2 and E4, run BRACED: the wider band is a longer leash, and §25.2's "no wall
       * ghosting" has to hold on it. On a purpose-built wall on empty ground (m2's aperture
       * wall sits inside the Phase 5 house now and the manifest box cannot be grabbed there),
       * a braced mover first walks INTO the wall holding a box, then retreats away from it
       * towing the box. The box may never end up past the wall, and towed it must stay
       * within reach plus the braced band — or the grip must have said why it let go. */
      const WALL = { minX: PAD.x - 6, maxX: PAD.x + 6, minZ: PAD.z - 32.0, maxZ: PAD.z - 31.7, top: 2.5 };
      const wallFace = WALL.maxZ;                                   // the side the mover is on
      physics.addStaticFromColliders([{ ...WALL, base: 0, tag: 'm6BraceWall' }]);
      physics.primeQueries();
      const box = byDef('box_small_01');
      const braceWall = (drive, steps) => {
        releaseAll();
        parkAt(box, PAD.x, 0.3, wallFace + 1.0);
        placeMover(movers[0], PAD.x, wallFace + 2.3);
        placeMover(movers[1], PAD.x + 20, PAD.z + 20);
        step(20);
        const gb = grabWith(movers[0], 'right', posOf(box));
        if (!gb) return null;
        step(30);
        let releasedBecause = null, minZ = Infinity;
        const offEnd = game.bus.on(EVENTS.GRIP_ENDED, (ev) => { releasedBecause = ev.reason; });
        for (let i = 0; i < steps; i++) {
          step(1, { [movers[0].id]: { ...drive, brace: true } });
          minZ = Math.min(minZ, posOf(box).z);
        }
        offEnd();
        const bp = posOf(box);
        const mp = movers[0].controller.position;
        const r = {
          z: bp.z, minZ, moverZ: mp.z, gap: Math.hypot(bp.x - mp.x, bp.z - mp.z),
          held: !!movers[0].grips.grips.right, reason: releasedBecause,
        };
        releaseAll();
        return r;
      };
      // Into the wall (yaw 0 faces -z; the wall is at lower z).
      const shove = braceWall({ move: { x: 0, y: 1 }, yaw: 0, run: true }, 300);
      ok('B10d braced into a wall: the held box never passes through it (m2 E2, braced)',
         !!shove && shove.minZ > wallFace - 0.25 && shove.moverZ > wallFace - 0.1,
         shove ? `box deepest z ${shove.minZ.toFixed(2)}, mover z ${shove.moverZ.toFixed(2)} (wall face ${wallFace.toFixed(2)})` : 'no grip');
      // Away from it, towing.
      const retreat = braceWall({ move: { x: 0, y: -1 }, yaw: 0 }, 240);
      ok('B10e braced retreat: a towed box stays within the braced leash and never crosses the wall (m2 E4, braced)',
         !!retreat && retreat.minZ > wallFace - 0.25 && retreat.gap < GRIP.reach + GRIP.maxStretch * GRIP.braceStretchMult &&
         (retreat.held || retreat.reason === 'pulled out of reach' || retreat.reason === 'slipped'),
         retreat ? `box z ${retreat.z.toFixed(2)}, gap ${retreat.gap.toFixed(2)} m, ${retreat.held ? 'still held' : 'released: ' + retreat.reason}` : 'no grip');

      /* NO LEFTOVER STATE. A released object keeps the objectHeld collision group — no player
       * collision — until restoreClearedObjects sees every mover clear of it. main.js does
       * that every step; this harness's step() does not. Left as it was, the same box_small_01
       * that D8c parks on its test deck no longer blocked the mover on the deck: they crossed
       * it and walked off the far side, and D11 read y 0.02 at x -53.27 where it had read
       * 1.22. MEASURED, one run. So the game's own clearance pass runs here, once, with every
       * mover parked clear of everything the B hauls touched. */
      parkAt(couch, FAR.x - 4, couch.def.dimensions.y / 2 + 0.02, FAR.z);   // also clears the pad for F4
      placeMover(movers[0], PAD.x + 20, PAD.z + 24);
      placeMover(movers[1], PAD.x + 20, PAD.z + 20);
      restoreClearedObjects(registry, movers.map((m) => m.controller));
      const stillCleared = [couch, fridge, box].filter((e) => e.state.awaitingPlayerClearance ||
                                                              e.collider.collisionGroups() !== GROUP_PRESETS.object);
      ok('B10f …and every object the B hauls held has its player collision back (no leftover state for D8c/D11)',
         stillCleared.length === 0, stillCleared.map((e) => e.defId).join(', '));
    }

    // Detach must put back exactly what was there, not a remembered constant.
    tools.attachDolly(dolly, couch);
    const onWheels = couch.collider.friction();
    tools.detachDolly(dolly);
    near('B12 detaching restores the object\'s own friction exactly',
         couch.collider.friction(), couch.def.physics.friction, 1e-6);
    near('B13 …and it really was changed while attached', onWheels, TOOLS.dolly.rollingResistance, 1e-6);

    /* §9.1's FAILURE MODE: "runs on slopes; load slips".
     *
     * Nothing implements a runaway. Friction 0.04 simply cannot hold 883 N of couch on a
     * 16-degree ramp, which is what taking the friction away MEANT. The bare couch on the
     * same slope holds, because 0.35 can. Same object, same slope, one attachment. */
    const RAMPSPEC = M.world.ramp;
    const slopeTest = (useDolly) => {
      releaseAll();
      if (useDolly) tools.attachDolly(dolly, couch);
      // Just above the ramp surface, at its midpoint.
      parkAt(couch, RAMPSPEC.x, RAMPSPEC.y + 0.75, RAMPSPEC.z);
      // PEAK speed, not final. An object that slides down the ramp and comes to rest on the
      // flat reads 0.00 m/s at the end, which is the opposite of what happened.
      let peak = 0;
      const from = posOf(couch);
      for (let k = 0; k < 130; k++) {
        step(1);
        const v = couch.body.linvel();
        peak = Math.max(peak, Math.hypot(v.x, v.z));
      }
      const p = posOf(couch);
      if (useDolly) tools.detachDolly(dolly);
      return { speed: peak, slid: Math.hypot(p.x - from.x, p.z - from.z) };
    };
    const held = slopeTest(false);
    const ran = slopeTest(true);
    lines.push(`      on the 16° ramp: bare ${held.speed.toFixed(2)} m/s, on the dolly ${ran.speed.toFixed(2)} m/s`);
    ok('B14 §9.1\'s failure mode: a dollied load runs on a slope where a bare one does not',
       ran.speed > held.speed * 2 && ran.speed > 0.8,
       `bare ${held.speed.toFixed(2)} m/s vs dollied ${ran.speed.toFixed(2)} m/s`);
    ok('B15 …and the same tool is what caused it — no separate hazard rule',
       TOOLS.dolly.rollingResistance < couch.def.physics.friction);
  }
}
emit('running...');

/* ── C. THE BLANKET — protection (§9.1, §8.3) ────────────────────────────── */
lines.push('--- C. blanket: protection (GDD §9.1 "reduce scratches/impact") ---');
{
  const blanket = toolByDef('blanket_01');
  const tv = byDef('tv_55_01');
  ok('C1 there is a blanket and a television', !!blanket && !!tv);

  if (blanket && tv) {
    tv.state.blanketId = null;
    const bareTol = impactToleranceOf(tv);
    const bareLoss = conditionLossFor(tv, 1.5);
    const bareGrip = gripMultiplierFor(tv);

    tools.applyBlanket(blanket, tv);
    const wrapTol = impactToleranceOf(tv);
    const wrapLoss = conditionLossFor(tv, 1.5);
    const wrapGrip = gripMultiplierFor(tv);

    lines.push(`      TV at 1.5 m/s: ${bareLoss.toFixed(1)} condition bare, ${wrapLoss.toFixed(1)} wrapped ` +
               `(tolerance ${bareTol.toFixed(2)} -> ${wrapTol.toFixed(2)} m/s)`);

    ok('C2 a blanket raises the impact speed an object tolerates by >=2x',
       wrapTol >= bareTol * 2, `${bareTol.toFixed(2)} -> ${wrapTol.toFixed(2)} m/s`);
    ok('C3 …and cuts the damage from an identical impact by >=50%',
       wrapLoss <= bareLoss * 0.5, `${bareLoss.toFixed(1)} -> ${wrapLoss.toFixed(1)}`);

    /* THE BINARY. §8.3's bands are authored states, so the claim worth making is about
     * which BAND the television lands in, not about a percentage. Bare, a 1.5 m/s knock
     * cracks it — 0.35 of $900. Wrapped, the same knock does not mark it. */
    const bandOf = (cond) => DAMAGE.bands.find((b) => cond >= b.min) || DAMAGE.bands[DAMAGE.bands.length - 1];
    const bareBand = bandOf(100 - bareLoss).name;
    const wrapBand = bandOf(100 - wrapLoss).name;
    lines.push(`      …which is the difference between "${bareBand}" and "${wrapBand}"`);
    ok('C4 a knock that cracks a bare TV leaves a wrapped one perfect (§8.3 bands)',
       bareBand !== 'perfect' && wrapBand === 'perfect', `${bareBand} vs ${wrapBand}`);

    /* §9.1's FAILURE MODE: "bad wrap obscures grip or falls off". Both halves. */
    ok('C5 §9.1\'s failure mode: a wrapped object is harder to hold',
       wrapGrip < bareGrip, `${bareGrip.toFixed(2)} -> ${wrapGrip.toFixed(2)}`);
    ok('C6 …and above a hard enough impact the wrap comes off',
       blanketShedsAt(TOOLS.blanket.shedSpeed + 0.1) && !blanketShedsAt(TOOLS.blanket.shedSpeed - 0.1));

    tools.removeBlanket(blanket);
    near('C7 removing it restores the object exactly', impactToleranceOf(tv), bareTol, 1e-9);

    /* §9.1 again: tools do not ERASE physics. A wrapped television is still breakable —
     * it survives more, not everything. A protection tool that made something invulnerable
     * would delete §8.3's stakes and with them the reason to pack carefully. */
    tools.applyBlanket(blanket, tv);
    ok('C8 a wrapped object is still breakable — tools do not erase physics (§9.1)',
       conditionLossFor(tv, 6.0) > 0, `${conditionLossFor(tv, 6.0).toFixed(1)} at 6 m/s`);
    tools.removeBlanket(blanket);
  }

  /* The damage model itself, rewritten this phase. The old one keyed item damage on
   * IMPULSE, which made an object more fragile for being heavy: setting the 90 kg couch
   * down at 0.5 m/s cost 55 condition points and cracked it, while a 9 kg box at twice the
   * speed stayed perfect. §8.3 exists to say the opposite. */
  const couch = byDef('couch_3seat_01');
  const box = byDef('box_small_01');
  if (couch && box) {
    ok('C9 setting a 90 kg couch down gently does NOT damage it (§8.3)',
       conditionLossFor(couch, 0.5) === 0, `${conditionLossFor(couch, 0.5).toFixed(1)} points`);
    ok('C10 …and a glass television is more fragile than a cardboard box, at the same speed',
       conditionLossFor(byDef('tv_55_01'), 2.5) > conditionLossFor(box, 2.5),
       `TV ${conditionLossFor(byDef('tv_55_01'), 2.5).toFixed(1)} vs box ${conditionLossFor(box, 2.5).toFixed(1)}`);
    ok('C11 …regardless of which is heavier (the TV is 22 kg, the couch 90)',
       conditionLossFor(byDef('tv_55_01'), 2.5) > conditionLossFor(couch, 2.5));
  }
}
emit('running...');

/* ── D. THE RAMP — clearance (§9.1, §8.1) ────────────────────────────────── */
lines.push('--- D. ramp: clearance (GDD §9.1 "bridge truck floor height") ---');
{
  const ramp = toolByDef('ramp_01');
  ok('D1 there is a ramp', !!ramp);

  if (ramp) {
    /* THE PROBLEM THE RAMP SOLVES, stated in numbers Phase 4 already measured.
     *
     * A deck is 1.20 m up. m4 measured the absolute ceiling on lifting: a hand is a 900 N/m
     * spring, so holding a 90 kg couch costs 0.49 m of stretch out of the 0.70 m
     * GRIP.maxStretch allows before the hold tears — about 0.21 m of usable lift, and
     * measured, two movers got the couch 11 mm off the floor.
     *
     * 1.20 m is not 0.011 m. There is no amount of trying that lifts a couch onto a truck,
     * which is exactly the "physical problem" §9.1 wants a tool to solve. */
    const liftCeiling = GRIP.maxStretch - (90 * 9.81) / (2 * GRIP.spring);
    lines.push(`      deck ${TOOLS.ramp.deckHeight} m vs a two-hand lift ceiling of ${liftCeiling.toFixed(3)} m`);
    ok('D2 the deck is far above anything a couch can be lifted to',
       TOOLS.ramp.deckHeight > liftCeiling * 4,
       `${TOOLS.ramp.deckHeight} m vs ${liftCeiling.toFixed(3)} m`);

    // Laid properly, the ramp is a walkable slope rather than a wall.
    const run = Math.sqrt(TOOLS.ramp.length ** 2 - TOOLS.ramp.deckHeight ** 2);
    const good = rampGeometry(run);
    lines.push(`      laid at ${run.toFixed(2)} m: ${good.angleDeg.toFixed(1)}°, lip ${good.lip.toFixed(3)} m`);
    ok('D3 a well-laid ramp is walkable (§9.1 "bridge truck floor height")',
       good.angleDeg < PLAYER.maxSlopeClimbDeg,
       `${good.angleDeg.toFixed(1)}° vs limit ${PLAYER.maxSlopeClimbDeg}°`);
    ok('D4 …and meets the deck with no step', good.aligned && good.lip < 0.02,
       `lip ${good.lip.toFixed(3)} m`);

    /* §8.1: "Park position should affect ramp angle and carry distance WITHOUT causing
     * unwinnable setup." Both halves matter — a badly parked ramp must be worse, and must
     * still be recoverable by moving it, never a dead end. */
    const steep = rampGeometry(run * 0.55);
    ok('D5 laying it closer makes it steeper (§8.1 park position affects angle)',
       steep.angleDeg > good.angleDeg, `${good.angleDeg.toFixed(1)}° -> ${steep.angleDeg.toFixed(1)}°`);

    /* §9.1's FAILURE MODE: "misalignment or steep approach". Laid too far out, the plank is
     * not long enough to reach the deck and leaves a lip at the top. */
    const short = rampGeometry(TOOLS.ramp.length * 0.99);
    lines.push(`      laid 0.99 of its length out: lip ${short.lip.toFixed(3)} m, aligned=${short.aligned}`);
    ok('D6 §9.1\'s failure mode: laid too far out it leaves a lip',
       short.lip > TOOLS.ramp.alignToleranceM && !short.aligned,
       `lip ${short.lip.toFixed(3)} m`);
    ok('D7 …a lip big enough that you cannot simply walk up it',
       short.lip > PLAYER.stepHeight,
       `${short.lip.toFixed(3)} m vs stepHeight ${PLAYER.stepHeight}`);
    ok('D8 …but never unwinnable — moving it fixes it (§8.1)', rampGeometry(run).aligned);

    /* THE DEPLOYED RAMP MUST BE REAL GEOMETRY, not a number, so a mover is walked up it.
     *
     * On a PURPOSE-BUILT DECK rather than the Phase 1 platform. Two attempts at reusing the
     * scene failed for reasons that had nothing to do with ramps: the platform's centre line
     * runs 0.4 m from the aperture wall, so a 0.32 m capsule walking along it clipped the
     * wall and jammed at x=3.49 — which read exactly like the ramp blocking it — and the
     * platform is a floating slab from y 0.96 to 1.20 with open air underneath, so moving
     * clear of the wall just let the mover stroll beneath it.
     *
     * A solid 1.20 m block on empty ground tests the one thing this assertion is about. */
    const DECK = { x: -60, z: 60, w: 4.0, d: 5.0, top: TOOLS.ramp.deckHeight };
    const collidersBefore = physics.stats.colliders;
    physics.addStaticFromColliders([{
      minX: DECK.x, maxX: DECK.x + DECK.w,
      minZ: DECK.z - DECK.d / 2, maxZ: DECK.z + DECK.d / 2,
      base: 0, top: DECK.top, tag: 'm6TestDeck',
    }]);
    physics.primeQueries();
    ok('D8b the test deck really was added to the world',
       physics.stats.colliders > collidersBefore,
       `${collidersBefore} -> ${physics.stats.colliders} colliders`);

    /* Prove the deck is real by dropping something on it, rather than by trusting a counter.
     * A box parked above the deck must come to rest ON it, not on the ground 1.2 m below. */
    const probe = byDef('box_small_01');
    parkAt(probe, DECK.x + DECK.w / 2, DECK.top + 0.6, DECK.z);
    step(60);
    const restY = posOf(probe).y;
    ok('D8c …and it is solid: a box dropped on it rests at deck height',
       restY > DECK.top, `box rested at y ${restY.toFixed(2)}, deck top ${DECK.top}`);

    const deckEdge = { x: DECK.x, y: DECK.top, z: DECK.z };
    const startX = deckEdge.x - run - 0.8;

    /* THE BASELINE FIRST: without a ramp, a 1.20 m face is a wall. It is above
     * PLAYER.stepHeight (0.35) by more than three times, and it is not a mantle either —
     * mantleMaxHeight is 1.35 but a mover carrying anything cannot mantle, and the deck is
     * what a truck is. */
    releaseAll();
    placeMover(movers[0], startX, deckEdge.z);
    placeMover(movers[1], startX, deckEdge.z + 8);
    step(30);
    const noRampStart = movers[0].controller.position.y;
    step(200, { [movers[0].id]: { move: { x: 0, y: 1 }, yaw: -Math.PI / 2 } });
    const noRampEnd = movers[0].controller.position.y;
    ok('D9 without a ramp, a 1.20 m deck face cannot be walked up',
       noRampEnd < noRampStart + 0.4,
       `y ${noRampStart.toFixed(2)} -> ${noRampEnd.toFixed(2)}`);

    // …and now with it.
    const geo = tools.deployRamp(ramp, deckEdge, { x: -1, z: 0 }, run);
    ok('D10 the ramp deploys against the deck', !!geo && ramp.state.deployed);

    releaseAll();
    placeMover(movers[0], startX, deckEdge.z);
    placeMover(movers[1], startX, deckEdge.z + 8);
    step(30);
    const startY = movers[0].controller.position.y;
    step(220, { [movers[0].id]: { move: { x: 0, y: 1 }, yaw: -Math.PI / 2 } });
    const endY = movers[0].controller.position.y;
    const mp = movers[0].controller.position;
    lines.push(`      deck ${DECK.top} m: without a ramp y ${noRampEnd.toFixed(2)}, ` +
               `with one y ${endY.toFixed(2)} at x ${mp.x.toFixed(2)} (${geo.angleDeg.toFixed(1)}°)`);
    ok('D11 …and with it a mover reaches deck height — §9.1\'s "bridge truck floor height"',
       endY > startY + 0.9 && endY > noRampEnd + 0.8,
       `${startY.toFixed(2)} -> ${endY.toFixed(2)} vs ${noRampEnd.toFixed(2)} without`);

    ok('D12 …and it can be retrieved again (§9.2 "fold and retrieve")',
       tools.retrieveRamp(ramp) && !ramp.state.deployed);
  }
}
emit('running...');

/* ── E. THE SCREWDRIVER — dimensions (§8.2, §23.1, §7.4) ─────────────────── */
lines.push('--- E. screwdriver: dimensions (GDD §9.1 "disassemble authored parts") ---');
{
  const wardrobe = byDef('wardrobe_01');
  const shelf = byDef('bookshelf_01');
  ok('E1 there is a wardrobe and a bookshelf', !!wardrobe && !!shelf);

  if (wardrobe && shelf) {
    const w = disassemble(registry, wardrobe, 'doors');
    ok('E2 the wardrobe\'s doors come off (§8.2 "unscrew and reattach")', !!w);
    if (w) {
      lines.push(`      wardrobe ${w.before.z} -> ${w.after.z} m deep; volume ` +
                 `${w.volumeBefore.toFixed(2)} -> ${w.volumeAfter.toFixed(2)} m³`);
      ok('E3 …and it is measurably smaller', w.volumeAfter < w.volumeBefore,
         `${w.volumeBefore.toFixed(3)} -> ${w.volumeAfter.toFixed(3)}`);
      // The COLLIDER must change too, or the silhouette and the collision disagree (§8.1).
      const he = wardrobe.collider.halfExtents();
      near('E4 the collider shrank with it, not just the data', he.z * 2, w.after.z, 1e-6);
      ok('E5 …and the change is reversible (§8.2)', !!reassemble(registry, wardrobe, 'doors'));
      near('E6 …restoring the original collider exactly',
           wardrobe.collider.halfExtents().z * 2, wardrobe.def.dimensions.z, 1e-6);
    }

    const s = disassemble(registry, shelf, 'shelves');
    if (s) {
      const cut = 1 - s.volumeAfter / s.volumeBefore;
      lines.push(`      bookshelf loses ${(cut * 100).toFixed(0)}% of its packed volume`);
      ok('E7 a bookshelf packs down by more than half (§10.5 cargo optimisation)',
         cut > 0.5, `${(cut * 100).toFixed(0)}%`);
      reassemble(registry, shelf, 'shelves');
    }

    /* THE HONEST NEGATIVE, and it is the most important assertion in this section.
     *
     * The obvious expectation is that disassembly is how you get furniture through tight
     * doors. It is not, and the data says so plainly: every object with an authored
     * disassembly path ALREADY passes the tightest opening on its route (0.86 m) by at
     * least 160 mm, so nothing that can be taken apart needed to be. The one genuinely
     * tight object — the couch at 0.850 m against 0.860 — has no disassembly path at all,
     * and the wardrobe's real constraint is its 2.00 m height against a 2.03 m opening,
     * which taking the doors off does not touch.
     *
     * So the payoff asserted above is PACKED VOLUME, which feeds Phase 7's one-trip
     * question, and that is the payoff that actually exists. This assertion exists to stop
     * a later phase quietly claiming the clearance win instead. */
    const tightest = Math.min(...INTERIOR_DOORS.map((d) => d.gap));
    const withParts = Object.values(OBJECT_DEFS).filter((d) => (d.disassembly || []).length > 0);
    const neededIt = withParts.filter((d) => minProjectedWidth(d.dimensions.x, d.dimensions.z) > tightest);
    lines.push(`      ${withParts.length} objects can be taken apart; ${neededIt.length} of them needed to be`);
    ok('E8 no disassemblable object was ever blocked by a doorway — the win is volume, not clearance',
       neededIt.length === 0, neededIt.map((d) => d.id).join(', '));

    /* §9.1's FAILURE MODE: "loose pieces get lost". The state has to record what came off,
     * or a wardrobe arrives at the destination and nobody can say its doors are missing. */
    disassemble(registry, wardrobe, 'doors');
    ok('E9 §9.1\'s failure mode: the missing part is recorded, so it can be lost',
       (wardrobe.state.removedParts || []).includes('doors'),
       JSON.stringify(wardrobe.state.removedParts));
    ok('E10 …and the object reports its CURRENT dimensions, not its original ones',
       currentDimensions(wardrobe).z < wardrobe.def.dimensions.z);
    reassemble(registry, wardrobe, 'doors');
    ok('E11 reassembly clears the record too',
       (wardrobe.state.removedParts || []).length === 0);

    // §23.1's schema: every authored part must say whether it goes back on.
    const irreversible = Object.values(OBJECT_DEFS)
      .flatMap((d) => d.disassembly || [])
      .filter((p) => p.reversible !== true);
    ok('E12 every authored part is reversible (§8.2 "unscrew and reattach")',
       irreversible.length === 0, `${irreversible.length} one-way parts`);
  }
}
emit('running...');

/* ── F. §9.1's rule — tools do not erase physics ─────────────────────────── */
lines.push('--- F. tools do not erase physics (GDD §9.1, §2.1) ---');
{
  const dolly = toolByDef('dolly_flat_01');
  const couch = byDef('couch_3seat_01');
  if (dolly && couch) {
    tools.attachDolly(dolly, couch);
    ok('F1 a couch on a dolly still weighs 90 kg', couch.def.mass === 90);
    ok('F2 …and still needs force: rolling resistance is lower, not zero',
       TOOLS.dolly.rollingResistance > 0, `${TOOLS.dolly.rollingResistance}`);
    ok('F3 …and is still a fully dynamic body that collides',
       couch.body.isDynamic());
    tools.detachDolly(dolly);
  }

  /* §2.1: "the game should rarely say no." No tool may become a PREREQUISITE — the fridge
   * has to stay grabbable, draggable and awkward without one, or the dolly has stopped
   * being a solution and become a key. */
  const fridge = byDef('fridge_01');
  if (fridge) {
    releaseAll();
    parkAt(fridge, PAD.x, fridge.def.dimensions.y / 2 + 0.02, PAD.z);
    placeMover(movers[0], PAD.x, PAD.z + 1.05);
    placeMover(movers[1], PAD.x + 20, PAD.z + 20);
    step(25);
    const g = grabWith(movers[0], 'right', { x: PAD.x, y: 1.2, z: PAD.z + 0.3 });
    ok('F4 the fridge is still grabbable with no tool at all (§2.1 nothing refuses)', !!g);
    releaseAll();
  }
}
emit('running...');

/* ── G. integration (§26.6) ──────────────────────────────────────────────── */
lines.push('--- G. integration (GDD §26.6) ---');
{
  releaseAll();
  for (const [i, m] of movers.entries()) placeMover(m, 0, 5 + i * 1.4);
  const bodiesBefore = physics.stats.bodies;
  for (let f = 0; f < 90; f++) M.game.frame(16.7);
  ok('G1 no bodies leak over 90 real frames with tools live',
     physics.stats.bodies === bodiesBefore, `${bodiesBefore} -> ${physics.stats.bodies}`);
  ok('G2 the world holds the manifest AND the tools',
     registry.count >= 15 && tools.count === 4, `${registry.count} objects, ${tools.count} tools`);
  ok('G3 state stays JSON-serializable',
     (() => { try { JSON.parse(JSON.stringify(game.state)); return true; } catch (e) { return false; } })());
  ok('G4 no error banner appeared during the suite', !document.getElementById('error-banner'));
}

} catch (e) {
  fails++;
  lines.push(`FAIL  suite threw  <- ${e && e.message}`);
  lines.push((e && e.stack || '').split('\n').slice(0, 6).join('\n'));
}

emit();
