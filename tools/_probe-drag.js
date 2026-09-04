/* M10 PROBE — solo/dolly/pair/fridge hauls under swept tuning. Not a suite: every line is a
 * measurement, and the single "assertion" at the end only exists so smoketest.ps1 prints the
 * block. Run:
 *
 *   powershell -NoProfile -ExecutionPolicy Bypass -File tools/smoketest.ps1 -Tests tools/_probe-drag.js -Port 8431
 *
 * Same harness shape as tools/m6-tests.js haulDistance/haulTogether (one mover, one hand,
 * 180 steps walking backward; two movers side by side), plus the object's peak TILT and the
 * mover's peak net speed. Tuning is swept with INSTANCE overrides (m3 D5's rule): each
 * mover gets `grips.tuning = { ...GRIP, ... }` and `controller.tractionN = () => T`; the
 * frozen config is never touched. Every other object is parked far from the pad.
 *
 * Three modes. `mode` is read from a ?mode= query string, which smoketest.ps1 never serves,
 * so under the harness the DEFAULT below is what runs — edit `|| 'shipped'` to select
 * another:
 *   'shipped' — the config as it ships, 3 s and 10 s hauls, the safety sweep, and the
 *               TOPPLE BOUNDARY (braceTractionN 380/420/440 and crawl 0.25, 10 s braced
 *               fridge pulls) — every number that bounds the shipped traction, in one run;
 *   'sweep'   — the full M10 table: world-frame "before", then towSpeedSafety x traction;
 *   'floor'   — GRIP.towSpeedFloor x braced traction, 10 s fridge topple checks.
 */

import { SIM, GRIP, CARRY, PLAYER } from '../src/config.js';
import { restoreClearedObjects, effectiveFloorFriction } from '../src/player/grip.js';

const lines = [];
let _pre = null;
function emit(status) {
  if (!_pre) {
    _pre = document.createElement('pre');
    _pre.id = 'test-out';
    _pre.style.cssText = 'position:fixed;inset:0;z-index:99999;overflow:auto;background:#06080c;' +
      'color:#cfe;font:11px ui-monospace,Consolas,monospace;padding:12px;white-space:pre';
    document.body.appendChild(_pre);
  }
  _pre.textContent = '==MFHTEST-BEGIN==\n' + lines.join('\n') + '\n\n' + (status || 'ALL-PASS  1 assertions') + '\n==MFHTEST-END==';
}
emit('booting...');
let M;
try { M = await window.__MFH_READY; }
catch (e) { lines.push(`FAIL boot threw <- ${e && e.message}`); emit('FAILURES 1 of 1'); throw e; }

const { game, physics, rig, registry, movers, camera, tools } = M;
const STEP = SIM.stepMs;

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
        run: !!it.run, brace: !!it.brace, jump: false, recover: false,
      });
    }
    physics.step();
    registry.step(STEP);
  }
}
function releaseAll() { for (const m of movers) m.grips.releaseAll('probe reset'); }
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
function tiltOf(e) {
  const q = e.body.rotation();
  const ryy = 1 - 2 * (q.x * q.x + q.z * q.z);
  return Math.acos(Math.max(-1, Math.min(1, ryy))) * 57.2958;
}
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
const byDef = (id) => { for (const e of registry.entities.values()) if (e.defId === id) return e; return null; };
const toolByDef = (id) => { for (const t of tools.tools.values()) if (t.defId === id) return t; return null; };

const PAD = { x: -40, z: 40 };
const FAR = { x: PAD.x - 25, z: PAD.z - 25 };

function haul(entity, { useDolly = false, dolly = null, brace = false, steps = 180, run = false, grabY = null, movers: n = 1 } = {}) {
  releaseAll();
  const d = entity.def.dimensions;
  parkAt(entity, PAD.x, d.y / 2 + 0.02, PAD.z);
  if (useDolly) tools.attachDolly(dolly, entity);
  const zStand = PAD.z + d.z / 2 + 0.95;
  const gy = grabY !== null ? grabY : Math.min(d.y / 2, 1.2);
  const grips = [];
  if (n === 1) {
    placeMover(movers[0], PAD.x, zStand);
    placeMover(movers[1], PAD.x + 20, PAD.z + 20);
    step(25);
    grips.push(grabWithOwnRig(movers[0], 'right', { x: PAD.x, y: gy, z: PAD.z + d.z / 2 }));
  } else {
    const SIDE = 0.6;
    placeMover(movers[0], PAD.x - SIDE, zStand);
    placeMover(movers[1], PAD.x + SIDE, zStand);
    step(25);
    grips.push(grabWithOwnRig(movers[0], 'right', { x: PAD.x - SIDE, y: gy, z: PAD.z + d.z / 2 }));
    grips.push(grabWithOwnRig(movers[1], 'right', { x: PAD.x + SIDE, y: gy, z: PAD.z + d.z / 2 }));
  }
  const from = posOf(entity);
  const mFrom = { ...movers[0].controller.position };
  let heldSteps = 0, tow = 0, peakF = 0, peakStretch = 0, peakPull = 0, peakObj = 0, peakTilt = 0, peakMover = 0, tornAt = -1, why = '';
  const it = { move: { x: 0, y: -1 }, yaw: 0, brace, run };
  const intents = n === 1 ? { [movers[0].id]: it } : { [movers[0].id]: it, [movers[1].id]: it };
  for (let k = 0; k < steps; k++) {
    step(1, intents);
    const live = (n === 1 ? [movers[0]] : movers).map((m) => m.grips.grips.right);
    if (live.every(Boolean)) {
      heldSteps++;
      for (const gr of live) { peakF = Math.max(peakF, gr.lastApplied || 0); peakStretch = Math.max(peakStretch, gr.lastStretch || 0); }
    } else if (tornAt < 0) { tornAt = k; why = movers[0].grips.lastRelease ? movers[0].grips.lastRelease.reason : (movers[1].grips.lastRelease ? movers[1].grips.lastRelease.reason : '?'); }
    tow = movers[0].controller.towSpeedLimit;
    const c = movers[0].controller;
    peakPull = Math.max(peakPull, Math.hypot(c.pull.x, c.pull.z));
    peakMover = Math.max(peakMover, Math.hypot(c._vel.x + c.pull.x, c._vel.z + c.pull.z));
    const ev = entity.body.linvel();
    peakObj = Math.max(peakObj, Math.hypot(ev.x, ev.z));
    peakTilt = Math.max(peakTilt, tiltOf(entity));
  }
  const to = posOf(entity);
  const mTo = { ...movers[0].controller.position };
  const endTilt = tiltOf(entity);
  releaseAll();
  if (useDolly) tools.detachDolly(dolly);
  return {
    moved: Math.hypot(to.x - from.x, to.z - from.z), moverMoved: Math.hypot(mTo.x - mFrom.x, mTo.z - mFrom.z),
    heldSteps, steps, tow, peakF, peakStretch, peakPull, peakObj, peakMover, peakTilt, endTilt, tornAt, why,
    gripped: grips.every(Boolean),
  };
}
const fmt = (tag, r) => `${tag.padEnd(26)} ${r.moved.toFixed(3).padStart(6)} m  mover ${r.moverMoved.toFixed(2).padStart(5)}  ` +
  `${r.heldSteps === r.steps ? 'held' : 'TORN@' + (r.tornAt * STEP / 1000).toFixed(2) + 's(' + r.why + ')'}`.padEnd(30) +
  `tow ${Number.isFinite(r.tow) ? r.tow.toFixed(2) : 'inf'}  F ${r.peakF.toFixed(0).padStart(4)}  s ${r.peakStretch.toFixed(2)}  ` +
  `pull ${r.peakPull.toFixed(2)}  obj ${r.peakObj.toFixed(2)}  mvr ${r.peakMover.toFixed(2)}  tilt ${r.peakTilt.toFixed(1)}°/${r.endTilt.toFixed(1)}°` +
  (r.gripped ? '' : '  NO GRIP');

function applyTuning(over, T, Tb) {
  for (const m of movers) {
    m.grips.tuning = { ...GRIP, ...over };
    const c = m.controller;
    c.tractionN = (brace) => ((!c.grounded || c._downMs > 0) ? 0 : (brace ? Tb : T));
  }
}
function clearTuning() {
  for (const m of movers) { m.grips.tuning = GRIP; delete m.controller.tractionN; }
}

const dolly = toolByDef('dolly_flat_01');
const couch = byDef('couch_3seat_01');
const fridge = byDef('fridge_01');
const box = byDef('box_small_01');
const others = [...registry.entities.values()].filter((e) => e !== couch && e !== fridge && e !== box);
lines.push(`M10 drag probe. GRIP: spring ${GRIP.spring} band ${GRIP.maxStretch}/${(GRIP.maxStretch * GRIP.braceStretchMult).toFixed(2)} ` +
  `safety ${GRIP.towSpeedSafety} floor ${GRIP.towSpeedFloor} handFrame ${GRIP.handFrameDamping}; CARRY traction ${CARRY.tractionN}/${CARRY.braceTractionN}`);
lines.push(`effective floor friction: couch ${effectiveFloorFriction(couch, physics.R).toFixed(0)} N, fridge ${effectiveFloorFriction(fridge, physics.R).toFixed(0)} N, box ${effectiveFloorFriction(box, physics.R).toFixed(0)} N`);
emit('running...');

const park = () => {
  parkAt(fridge, FAR.x, fridge.def.dimensions.y / 2 + 0.02, FAR.z);
  parkAt(couch, FAR.x - 4, couch.def.dimensions.y / 2 + 0.02, FAR.z);
  parkAt(box, FAR.x - 8, 0.3, FAR.z);
};

const url = new URL(location.href);
const mode = url.searchParams.get('mode') || 'shipped';

function fullSet(label) {
  lines.push(`--- ${label} ---`);
  park();
  lines.push(fmt('couch solo U', haul(couch)));
  lines.push(fmt('couch solo B', haul(couch, { brace: true })));
  lines.push(fmt('couch dolly U', haul(couch, { useDolly: true, dolly })));
  lines.push(fmt('couch pair U', haul(couch, { movers: 2 })));
  lines.push(fmt('couch pair B', haul(couch, { movers: 2, brace: true })));
  parkAt(couch, FAR.x - 4, couch.def.dimensions.y / 2 + 0.02, FAR.z);
  lines.push(fmt('fridge solo U', haul(fridge)));
  lines.push(fmt('fridge solo B', haul(fridge, { brace: true })));
  lines.push(fmt('fridge solo B 600', haul(fridge, { brace: true, steps: 600 })));
  lines.push(fmt('fridge solo U grab1.2', haul(fridge, { grabY: 1.2 })));
  lines.push(fmt('fridge dolly U', haul(fridge, { useDolly: true, dolly })));
  parkAt(fridge, FAR.x, fridge.def.dimensions.y / 2 + 0.02, FAR.z);
  lines.push(fmt('box solo run', haul(box, { run: true })));
  parkAt(box, FAR.x - 8, 0.3, FAR.z);
  emit('running...');
}

try {
  if (mode === 'sweep') {
    // The BEFORE column: world-frame damping, no traction (M7's shipped state).
    applyTuning({ handFrameDamping: 0 }, 0, 0);
    fullSet('BEFORE: handFrame 0, traction 0/0, new tow cap');
    for (const safety of [0.55, 0.7, 0.85, 1.0]) {
      for (const [T, Tb] of [[350, 380], [380, 400], [350, 420], [300, 350]]) {
        applyTuning({ towSpeedSafety: safety }, T, Tb);
        fullSet(`safety ${safety}, traction ${T}/${Tb}, floor ${GRIP.towSpeedFloor}`);
      }
    }
  } else if (mode === 'floor') {
    for (const floor of [0.10, 0.15, 0.25]) {
      for (const [T, Tb] of [[350, 380], [350, 420], [380, 440]]) {
        applyTuning({ towSpeedFloor: floor }, T, Tb);
        lines.push(`--- floor ${floor}, traction ${T}/${Tb} ---`);
        park();
        lines.push(fmt('fridge solo U', haul(fridge)));
        lines.push(fmt('fridge solo B', haul(fridge, { brace: true })));
        lines.push(fmt('fridge solo B 600', haul(fridge, { brace: true, steps: 600 })));
        lines.push(fmt('fridge solo U 600', haul(fridge, { steps: 600 })));
        emit('running...');
      }
    }
  } else {
    clearTuning();
    fullSet('SHIPPED config');
    park();
    lines.push(fmt('couch solo U 600', haul(couch, { steps: 600 })));
    lines.push(fmt('couch solo B 600', haul(couch, { brace: true, steps: 600 })));
    parkAt(couch, FAR.x - 4, couch.def.dimensions.y / 2 + 0.02, FAR.z);
    lines.push(fmt('fridge U grab1.2 600', haul(fridge, { grabY: 1.2, steps: 600 })));
    parkAt(fridge, FAR.x, fridge.def.dimensions.y / 2 + 0.02, FAR.z);
    emit('running...');
    for (const accelSafety of [0.6, 0.85, 1.0]) {
      for (const speedSafety of [0.55, 0.75]) {
        applyTuning({ towAccelSafety: accelSafety, towSpeedSafety: speedSafety }, CARRY.tractionN, CARRY.braceTractionN);
        lines.push('--- accelSafety ' + accelSafety + ', speedSafety ' + speedSafety + ' ---');
        park();
        lines.push(fmt('couch solo U', haul(couch)));
        lines.push(fmt('couch solo B', haul(couch, { brace: true })));
        lines.push(fmt('couch solo U 600', haul(couch, { steps: 600 })));
        lines.push(fmt('couch dolly U', haul(couch, { useDolly: true, dolly })));
        lines.push(fmt('couch pair U', haul(couch, { movers: 2 })));
        emit('running...');
      }
    }
    // TOPPLE BOUNDARY — the rows that bound CARRY.braceTractionN = 380 (config.js): a lone
    // braced mover pulling the bare fridge at the crawl for 10 s, at the shipped budget and
    // the next two sweep steps, then the shipped budget at a faster crawl. Instance
    // overrides only; the frozen config is untouched.
    lines.push('--- TOPPLE BOUNDARY: fridge, braced, 600 steps (10 s), grab 0.875 m ---');
    for (const [floor, T, Tb] of [[GRIP.towSpeedFloor, CARRY.tractionN, CARRY.braceTractionN],
                                  [GRIP.towSpeedFloor, CARRY.tractionN, 420],
                                  [GRIP.towSpeedFloor, CARRY.tractionN, 440],
                                  [0.25, CARRY.tractionN, CARRY.braceTractionN]]) {
      applyTuning({ towSpeedFloor: floor }, T, Tb);
      park();
      lines.push(fmt(`floor ${floor.toFixed(2)} T ${T}/${Tb}`, haul(fridge, { brace: true, steps: 600 })));
      emit('running...');
    }
  }
} catch (e) {
  lines.push(`FAIL probe threw <- ${e && e.message}`);
  lines.push((e && e.stack || '').split('\n').slice(0, 6).join('\n'));
  emit('FAILURES 1 of 1');
  throw e;
}
clearTuning();
park();
placeMover(movers[0], PAD.x + 20, PAD.z + 24);
placeMover(movers[1], PAD.x + 20, PAD.z + 20);
restoreClearedObjects(registry, movers.map((m) => m.controller));
lines.push('PASS  probe ran');
emit();
