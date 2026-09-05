/* Phase 11 build-side M23 suite — forcing a hung door: §3.3's brute-force branch, priced on
 * the FRAME as property damage.
 *
 * GDD §3.3: "Every substantial obstacle should support … a lower-risk prepared method and a
 * faster or funnier brute-force method … Brute force must remain possible enough to tempt
 * players." M11 built the prepared method (E takes the leaf off, 45 s); M14 built the ledger
 * line that prices walls. This suite is the branch between them: shove the couch through the
 * hung door anyway, and the FRAME posts the bill.
 *
 * THE CLAIMS UNDER TEST:
 *
 *   D6  the run record starts explicit: DOOR_STATE 'hung' for every leaf on frame 1, and
 *       again after a replay; silent to the caption layer; m17's summary keys untouched
 *   D2  a knock marks the frame: a 9 kg box at 2 m/s bends it once (chargeBent, one scuff),
 *       a second identical knock posts nothing more, the leaf stays hung, no DOOR_STATE
 *   D1  seat 0's two-hand shove at CARRY.tractionN tears the leaf off within
 *       DOOR.forceWithinMs: the M11 unhang path, the 0.86 opening, DOOR_STATE 'forced' once,
 *       exactly chargeForced on the property ledger citing 'door_frame' and the door id, the
 *       notice and the caption, the mover not launched, the body count unchanged — and the
 *       IMPULSE TRACE printed, both the leaf's manifold and M14's m·Δv, so the calibration in
 *       config.js is reproducible from this file
 *   D3  the trade is priced both ways: chargeForced ≥ 2x the prepared cost's cash, and two
 *       scripted runs (same seed) — E + carry-through vs the shove — settle in that order
 *   D4  'sturdy': a removed leaf dropped 1.5 m is marked, not totalled; every other band's
 *       drop numbers are unchanged against a recorded table
 *   D5  rehang occupancy: Q refuses 'doorway blocked' with a box, then a mover, in the hung
 *       pose's box; nothing moves; cleared, Q rehangs as M11 pins
 *   D7  co-op: seat 1's shove names seat 1 on the line and the event; a thrown fridge names
 *       nobody
 *
 * Fixtures: m19's door helpers, m6's two-hand haul, m22's throwAt/flush. Every number below is
 * measured, not preferred; the calibration (DOOR.forceImpulseNs 400, bentImpulseNs 8,
 * DAMAGE.property.doorFrame.forceN 250) was pinned FROM the trace D1 prints.
 */

import { SIM, DOOR, DAMAGE, TOOLS, ECONOMY, CARRY } from '../src/config.js';
import { OBJECT_DEFS } from '../src/objects/definitions.js';
import { APERTURES } from '../src/render/scene.js';
import { doorById, leafDoors, leafHingeMark, PARTITION_T } from '../src/world/house.js';
import { DOOR_REHANG_LABEL, DOOR_BLOCKED_LABEL, DOOR_BLOCKED_SAID, isLeaf } from '../src/player/interact.js';
import { EVENTS } from '../src/core/eventBus.js';
import { billable, labelFor, doorFrameTag, doorIdOf, isDoorFrameTag, surfaceRow, DOOR_FRAME_KIND } from '../src/damage/surfaces.js';
import { bandFor, repairCost } from '../src/damage/damage.js';
import { manifestSummary } from '../src/contract/manifest.js';
import { buildInvoice, reconcile, LINE_KINDS } from '../src/contract/invoice.js';
import { resolveCue } from '../src/audio/audio.js';
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

const { game, physics, registry, movers, tools, straps, cargo, damage, interact, doors, recorder, audio } = M;
const bus = game.bus;
const STEP = SIM.stepMs;
const FRAME = 16.667;
const R = physics.R;
const F = DAMAGE.property.doorFrame;
const me = () => movers[M.activeMoverIndex];
const rows = () => game.state.manifest;

/* ── drivers (m19 / m6 lineage) ───────────────────────────────────────────── */
/** One fixed step with per-mover intents ({move:{x,y}, yaw, brace}), the systems in
 *  main.js's order. The audio layer is drained each step so its bounded queue never drops
 *  the event whose caption D1 reads. */
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
    M.audioFrame();
  }
}
function frames(n) { for (let k = 0; k < n; k++) game.frame(FRAME); }
function placeMover(m, x, z, y = 0.2) {
  m.controller.hardSetPosition({ x, y, z });
  m.controller._vel.x = 0; m.controller._vel.z = 0;
  m.controller.velocityY = 0; m.controller._climb = null;
  m.controller.carriedMass = 0; m.controller.resistedForce = 0;
  m.controller.pull.x = 0; m.controller.pull.z = 0;
  m.controller.imbalance = 0; m.controller.exertion = 0; m.controller._downMs = 0;
}
function parkAt(e, x, y, z, yaw = 0, rot = null) {
  e.body.setTranslation({ x, y, z }, true);
  e.body.setRotation(rot || { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
  e.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  e.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  e.body.wakeUp();
  physics.primeQueries();
}
function throwAt(e, vx, vy, vz) { e.body.setLinvel({ x: vx, y: vy, z: vz }, true); e.body.wakeUp(); }
const posOf = (e) => { const t = e.body.translation(); return { x: t.x, y: t.y, z: t.z }; };
const byDef = (id) => { for (const e of registry.entities.values()) if (e.defId === id) return e; return null; };
const toolByDef = (id) => { for (const t of tools.tools.values()) if (t.defId === id) return t; return null; };
function releaseAll() { for (const m of movers) m.grips.releaseAll('test reset'); }
const prop = () => game.state.ledger.propertyDamage;
const items = () => game.state.ledger.itemDamage;
const sumCost = (ls) => Number(ls.reduce((s, l) => s + l.cost, 0).toFixed(2));
function drainNotices() { const n = M.pendingNotices.length; M.pendingNotices.splice(0, n); return n; }
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** Stand a mover somewhere and point them at a world point (m19 lookAt, snapped). */
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
/** Aim a mover's own rig at a point and grab (m4/m5 grabWith). */
function grabWith(m, hand, target) {
  const p = m.controller.position;
  m.rig.yaw = Math.atan2(-(target.x - p.x), -(target.z - p.z));
  m.rig.pitch = Math.atan2(target.y - (p.y + 1.4), Math.hypot(target.x - p.x, target.z - p.z));
  for (let k = 0; k < 20; k++) m.rig.update(p, 1 / 60);
  const c = m.camera.position;
  m.rig.yaw = Math.atan2(-(target.x - c.x), -(target.z - c.z));
  m.rig.pitch = Math.atan2(target.y - c.y, Math.hypot(target.x - c.x, target.z - c.z));
  m.grips.syncAim();
  return m.grips.tryGrab(hand, m.id, game.clock.simTimeMs);
}
/** Open ground well away from the house, the destination (x 18.5) and m5's grid (40, 40). */
const PAD = { x: 40, z: -40 };
function parkMoversAway() { for (const [i, m] of movers.entries()) placeMover(m, PAD.x + 10 + i * 2, PAD.z + 10); }
/** m19's screwdriver pickup: from open ground with an exact aim (the rack sits under the deck). */
function pickUp(tool) {
  for (const s of interact.state.values()) { s.carriedTool = null; s.pendingAnchor = null; }
  tool.body.setBodyType(R.RigidBodyType.Dynamic, true);
  tool.collider.setCollisionGroups(GROUP_PRESETS.object);
  tool.state.carriedBy = null;
  parkAt(tool, PAD.x + 6, tool.def.dimensions.y / 2 + 0.01, PAD.z + 6);
  placeMover(movers[1], PAD.x + 30, PAD.z + 30);
  step(5);
  const p = posOf(tool);
  lookAt(me(), { x: p.x, z: p.z + 1.1 }, p);
  step(2);
  interact.act(me());
  return interact._for(me().id).carriedTool === tool.id;
}
function putBackOnRack(tool) {
  for (const s of interact.state.values()) { s.carriedTool = null; s.pendingAnchor = null; }
  tool.body.setBodyType(R.RigidBodyType.Dynamic, true);
  tool.collider.setCollisionGroups(GROUP_PRESETS.object);
  tool.state.carriedBy = null;
  parkAt(tool, -0.10, 0.05, 9.0);
}
function rehangAll() { doors.rehangAll('test reset'); }

/* The couch on its side (m19 D6 / m6 E16's basis): local x (its 2.10 m) along world z, local y
 * (0.85) across x, local z (0.90) up — a quarter turn about (1,1,1), x->z->y->x. */
const ROLLED = { x: -0.5, y: -0.5, z: -0.5, w: 0.5 };
function parkRolled(e, x, z) { parkAt(e, x, 0.47, z, 0, ROLLED); }
function settle(n) { for (let i = 0; i < n; i++) { physics.clearForces(); physics.step(); registry.step(STEP); } }
/** Σ|contactImpulse| between two colliders this step (the leaf's side of the narrow phase). */
function manifoldImpulse(a, b) {
  let sum = 0;
  physics.world.contactPair(a, b, (mf) => { const nc = mf.numContacts(); for (let i = 0; i < nc; i++) sum += Math.abs(mf.contactImpulse(i)); });
  return sum;
}
/** The kitchen's other furniture out of the shove's run-up (the fragile boxes at z -6.2 sit
 *  in it). Every fixture that needs the house whole calls resetContract afterwards. */
function clearKitchen(couch) {
  for (const e of registry.entities.values()) {
    if (e === couch || isLeaf(e)) continue;
    const p = posOf(e);
    if (p.z < -5 && p.z > -9 && p.x > 0) parkAt(e, PAD.x + 20 + (p.x % 3) * 2, p.y, PAD.z + 20 + (Math.abs(p.z) % 4) * 2);
  }
  settle(10);
}

/** Bus spies. */
const doorEvents = [];
bus.on(EVENTS.DOOR_STATE, (e) => doorEvents.push({ ...e }));
const propEvents = [];
bus.on(EVENTS.DAMAGE_APPLIED, (e) => { if (e.category === 'property') propEvents.push({ ...e }); });

const DOOR_ID = 'living_kitchen';
const door = doorById(DOOR_ID, APERTURES);
const TAG = doorFrameTag(DOOR_ID);
const leafOf = () => doors.leafFor(DOOR_ID);
/** The swung-open leaf's free end (kitchen side) and its east face, from the hung pose. */
const leafEnd = () => leafOf().state.home.z - DOOR.leaf.length / 2;
const leafFace = () => leafOf().state.home.x + DOOR.leaf.t / 2;

/**
 * THE SHOVE (m6's two-hand haul, walking forward). The couch on its side in the kitchen,
 * its west 35 mm over the leaf's free end (x 2.60: the couch spans 2.175..3.025, the leaf
 * 2.17..2.21), the mover behind it with both hands on its back face — the kitchen is 4 m
 * deep, so the stand-off is 0.45 m — walking into the door. Records the trace: per step the
 * couch's speed and m·Δv (M14's measure), the leaf's manifold impulse and force, the grip.
 */
function shove(m, { hands = 2, brace = false, maxSteps = 240, stopWhenForced = true, dist = 0.15 } = {}) {
  const couch = byDef('couch_3seat_01');
  const leaf = leafOf();
  releaseAll();
  clearKitchen(couch);
  const X = door.centre;
  const cz = leafEnd() - couch.def.dimensions.x / 2 - dist;
  parkRolled(couch, X, cz); settle(40);
  const back = posOf(couch).z - couch.def.dimensions.x / 2;
  const target = { x: X, y: 0.45, z: back };
  lookAt(m, { x: X, z: back - 0.45 }, target);
  step(20);
  const g = grabWith(m, 'right', target);
  const g2 = hands === 2 ? m.grips.tryGrab('left', m.id, game.clock.simTimeMs) : null;
  const facing = m.rig.yaw;
  const out = { gripped: !!g && (hands === 1 || !!g2), forcedAt: -1, firstContact: -1, steps: 0,
                mdvSum: 0, mdvAfterTouch: 0, manifoldSum: 0, peakForceN: 0, forceSteps: 0, strainSteps: 0, trace: [] };
  let prev = 0, lastStrain = 0;
  for (let i = 0; i < maxSteps; i++) {
    step(1, { [m.id]: { move: { x: 0, y: 1 }, yaw: facing, brace } });
    out.steps = i + 1;
    const v = couch.body.linvel();
    const sp = Math.hypot(v.x, v.y, v.z);
    const lost = prev - sp; prev = sp;
    const mdv = lost > 0 ? couch.body.mass() * lost : 0;
    const hung = leaf.state.hung;
    const mi = hung ? manifoldImpulse(couch.collider, leaf.collider) : 0;
    const forceN = mi / (STEP / 1000);
    if (mi > 0 && out.firstContact < 0) out.firstContact = i;
    if (mi > 0) { out.manifoldSum += mi; out.peakForceN = Math.max(out.peakForceN, forceN); if (forceN >= F.forceN) out.forceSteps++; }
    if (mi > 0 && mdv >= DAMAGE.property.minStepImpulse) out.mdvSum += mdv;
    if (out.firstContact >= 0 && i > out.firstContact && mdv >= DAMAGE.property.minStepImpulse) out.mdvAfterTouch += mdv;
    const w = damage._openProp.get(`${couch.id}|${TAG}`);
    if (w && w.impulse > lastStrain + 1e-9) { out.strainSteps++; lastStrain = w.impulse; }
    const h = m.grips.grips.right;
    if (mi > 0 && (i === out.firstContact || (i - out.firstContact) % 12 === 0 || !hung)) {
      out.trace.push(`      step ${i} t=${(i * STEP / 1000).toFixed(2)} s: couch ${sp.toFixed(3)} m/s, m·Δv ${mdv.toFixed(2)} N·s; leaf took ${mi.toFixed(2)} N·s (${forceN.toFixed(0)} N); ` +
                     `strain ${w ? w.impulse.toFixed(1) : '-'} N·s; grip ${h ? h.lastApplied.toFixed(0) + ' N' : 'LOST'}; hung ${hung}`);
    }
    if (!hung && out.forcedAt < 0) {
      out.forcedAt = i;
      out.trace.push(`      step ${i} t=${(i * STEP / 1000).toFixed(2)} s: FORCED — leaf hung ${hung}, m·Δv Σ after the first touch ${out.mdvAfterTouch.toFixed(2)} N·s, leaf manifold Σ ${out.manifoldSum.toFixed(1)} N·s over ${out.forceSteps} steps at >= ${F.forceN} N`);
      if (stopWhenForced) break;
    }
  }
  out.couch = couch; out.leaf = leaf; out.mover = m;
  return out;
}

/** A body's world-space translation snapshot for "nothing moved" claims. */
function snapshotBodies() {
  const snap = new Map();
  for (const e of registry.entities.values()) snap.set(e.id, posOf(e));
  for (const t of tools.tools.values()) snap.set(t.id, posOf(t));
  return snap;
}
function maxMoved(before, near = null, within = Infinity) {
  let worst = 0, who = null;
  const now = snapshotBodies();
  for (const [id, p0] of before) {
    const p1 = now.get(id);
    if (!p1) continue;
    if (near && Math.hypot(p0.x - near.x, p0.z - near.z) > within) continue;
    const d = Math.hypot(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z);
    if (d > worst) { worst = d; who = id; }
  }
  return { worst, who };
}

if (game.state.paused) game.setPaused(false);
const bodiesAtBoot = physics.stats.bodies;
lines.push(`      boot: bodies ${bodiesAtBoot}, registry ${registry.count}, DOOR.forceImpulseNs ${DOOR.forceImpulseNs}, bentImpulseNs ${DOOR.bentImpulseNs}, forceN ${F.forceN}, chargeForced ${F.chargeForced}, chargeBent ${F.chargeBent}`);

try {
/* ── D6. the record starts explicit (§23.3 DOOR_STATE, §27.4) ───────────────── */
lines.push('--- D6. DOOR_STATE \'hung\' for every leaf on frame 1, silent, and again after a replay (GDD §23.3, §27.4) ---');
{
  const before = recorder.events.filter((e) => e.type === EVENTS.DOOR_STATE).length;
  eq('D6-0 before the first frame no DOOR_STATE has been recorded (the announcement is a step, not the boot)', before, 0);
  frames(1);
  const hung = recorder.events.filter((e) => e.type === EVENTS.DOOR_STATE && e.state === 'hung');
  const ids = hung.map((e) => e.doorId).sort();
  const want = leafDoors(APERTURES).map((d) => d.id).sort();
  eq('D6 after frame 1 the run record holds DOOR_STATE \'hung\' once per leaf — the 4 doors', ids.join(','), want.join(','));
  eq('D6 …4 of them exactly, no door twice', hung.length, 4);
  ok('D6a …each names its leaf entity, reason \'boot\', silent true, stamped on the clock',
     hung.every((e) => isLeaf(registry.get(e.entityId)) && e.reason === 'boot' && e.silent === true && e.simTimeMs >= 0),
     JSON.stringify(hung[0]));
  frames(2);
  eq('D6b …and later frames add none (once per run)', recorder.events.filter((e) => e.type === EVENTS.DOOR_STATE && e.state === 'hung').length, 4);
  ok('D6c recorder.events.length === bus.emitted still (m17 R0/R1: the announcement is on the bus like any event)',
     recorder.events.length === bus.emitted, `${recorder.events.length} vs ${bus.emitted}`);
  // Silent to the caption layer: the audio queue never saw them.
  M.audioFrame();
  const cap = audio.lastCaption(game.clock.simTimeMs);
  ok('D6d the boot announcement captioned nothing (audio.js _onEvent drops `silent: true`)', !cap || cap.type !== EVENTS.DOOR_STATE, JSON.stringify(cap));
  eq('D6d1 …though the cue table has a \'hung\' row for a real one (m18 A1: DOOR_STATE stays cued)', resolveCue('DOOR_STATE', { state: 'hung' }).caption, 'door on its hinges');
  // m17's summary shape is untouched.
  const rt = JSON.parse(JSON.stringify(M.runSummary()));
  const top = ['phases', 'counters', 'complete', 'restarts', 'questionnaire', 'events', 'build', 'seed', 'contractId', 'invoice', 'walkthrough'];
  const ck = ['grips', 'drops', 'recoveries', 'damageEvents', 'propertyEvents', 'straps', 'cargo', 'trips', 'worstCargoShift', 'shiftByEvent'];
  ok('D6e m17 R2 / M22-R2g key list unchanged on the summary and its counters', top.every((k) => k in rt) && ck.every((k) => k in rt.counters),
     `missing ${[...top.filter((k) => !(k in rt)), ...ck.filter((k) => !(k in rt.counters))].join(',')}`);
  ok('D6f …and the summary\'s events carry the four announcements', rt.events.filter((e) => e.type === EVENTS.DOOR_STATE && e.state === 'hung').length === 4);
  // A replay starts explicit too.
  M.resetContract();
  const afterReset = recorder.events.filter((e) => e.type === EVENTS.DOOR_STATE && e.state === 'hung').length;
  frames(1);
  const again = recorder.events.filter((e) => e.type === EVENTS.DOOR_STATE && e.state === 'hung');
  eq('D6g after resetContract the new run\'s record starts empty of them and frame 1 announces all 4 again', `${afterReset}/${again.length}`, '0/4');
  ok('D6h …every leaf hung and Fixed after the reset (M11 rehangAll)', doors.leaves().every((e) => e.state.hung && e.body.isFixed()));
}
emit('D2...');

/* ── D2. a knock bends the frame — once (§8.3 aggregation, §8.4 one small cost notice) ── */
lines.push('--- D2. a box at 2 m/s bends the frame once: chargeBent, one scuff, the leaf stays hung, no DOOR_STATE (GDD §8.3, §8.4, §3.3) ---');
{
  releaseAll(); rehangAll(); parkMoversAway(); drainNotices();
  const couch = byDef('couch_3seat_01');
  clearKitchen(couch);
  parkRolled(couch, PAD.x, PAD.z); settle(10);
  const leaf = leafOf();
  const box = byDef('box_small_01');
  const zLeaf = leaf.state.home.z;
  const knock = () => {
    parkAt(box, leafFace() + box.def.dimensions.x / 2 + 0.16, box.def.dimensions.y / 2 + 0.02, zLeaf);
    settle(20);
    throwAt(box, -2.0, 0, 0);
    let peakMi = 0, peakMdv = 0, prev = 0;
    for (let i = 0; i < 60; i++) {
      step(1);
      const v = box.body.linvel(); const sp = Math.hypot(v.x, v.y, v.z);
      const lost = prev - sp; prev = sp;
      peakMi = Math.max(peakMi, manifoldImpulse(box.collider, leaf.collider));
      if (lost > 0) peakMdv = Math.max(peakMdv, box.body.mass() * lost);
    }
    damage.flush(game.clock.simTimeMs);
    return { peakMi, peakMdv };
  };
  const p0 = prop().length, s0 = M.scuffs.count, ev0 = doorEvents.length, pe0 = propEvents.length;
  const k1 = knock();
  const L = prop().slice(p0);
  const l = L[0] || null;
  lines.push(`      box_small_01 (${box.body.mass().toFixed(1)} kg) at 2 m/s from 0.16 m into the leaf's face: leaf took ${k1.peakMi.toFixed(2)} N·s peak (m·Δv ${k1.peakMdv.toFixed(2)}); ${L.length} line(s) ${JSON.stringify(l)}`);
  ok(`D2 the knock's impulse sits between DOOR.bentImpulseNs (${DOOR.bentImpulseNs}) and DOOR.forceImpulseNs (${DOOR.forceImpulseNs})`,
     k1.peakMi >= DOOR.bentImpulseNs && k1.peakMi < DOOR.forceImpulseNs, `${k1.peakMi.toFixed(2)}`);
  eq('D2 the leaf stays hung', leaf.state.hung, true);
  ok('D2 …and Fixed', leaf.body.isFixed());
  eq('D2 the frame posts exactly ONE property line', L.length, 1);
  ok(`D2 …of exactly chargeBent (${F.chargeBent}), band 'bent', kind 'door_frame', doorId living_kitchen, surface door_frame_living_kitchen`,
     !!l && l.cost === F.chargeBent && l.band === 'bent' && l.kind === DOOR_FRAME_KIND && l.doorId === DOOR_ID && l.surfaceId === TAG && l.category === 'property',
     l ? `${l.cost} ${l.band} ${l.kind} ${l.doorId} ${l.surfaceId}` : 'no line');
  ok('D2a …citing the box, held by nobody, with the strain in [bent, force) and the contact on the leaf\'s face',
     !!l && l.entityId === box.id && Array.isArray(l.heldBy) && l.heldBy.length === 0 && l.impulse >= DOOR.bentImpulseNs && l.impulse < DOOR.forceImpulseNs &&
     Math.abs(l.at.x - leafFace()) < 0.05 && l.normal.x > 0.9,
     l ? `${l.entityId} heldBy ${JSON.stringify(l.heldBy)} impulse ${l.impulse} at ${JSON.stringify(l.at)} n ${JSON.stringify(l.normal)}` : 'no line');
  eq('D2b a scuff quad appeared on the frame (M14\'s ring)', M.scuffs.count, s0 + 1);
  eq('D2c no DOOR_STATE was emitted', doorEvents.length, ev0);
  eq('D2d one DAMAGE_APPLIED (category property) for it', propEvents.length - pe0, 1);
  ok('D2e the notice reads \'kitchen door frame bent — 40.00\'', M.pendingNotices.some((n) => n.kind === 'damage' && n.text === `kitchen door frame bent — ${F.chargeBent.toFixed(2)}`),
     M.pendingNotices.map((n) => n.text).join(' | '));
  eq('D2f the leaf\'s state records the bent frame as plain data', leaf.state.frameBent, true);
  // A second identical knock: nothing more, until the door is forced.
  drainNotices();
  const k2 = knock();
  lines.push(`      second knock: leaf took ${k2.peakMi.toFixed(2)} N·s peak; lines now ${prop().length}, scuffs ${M.scuffs.count}`);
  eq('D2g a second identical knock posts NOTHING more (one chargeBent per hung spell)', prop().length, p0 + 1);
  eq('D2g …no second scuff', M.scuffs.count, s0 + 1);
  eq('D2g …no notice', M.pendingNotices.filter((n) => n.kind === 'damage' && /door/.test(n.text)).length, 0);
  ok('D2g …still hung, still Fixed, no DOOR_STATE', leaf.state.hung && leaf.body.isFixed() && doorEvents.length === ev0);
  // The gate: a box resting against the leaf (the solver phantom) strains nothing.
  const p1 = prop().length;
  leaf.state.frameBent = false;   // so a phantom line COULD post if the gate were missing
  step(90);
  damage.flush(game.clock.simTimeMs);
  eq('D2h a box left resting against the leaf for 1.5 s (no hand, no hit) strains nothing — no line (§10.4)', prop().length, p1);
  leaf.state.frameBent = true;
  parkAt(box, PAD.x + 8, 0.27, PAD.z + 8);
  drainNotices();
}
emit('D1...');

/* ── D1. THE SHOVE (§3.3 brute force, §8.2 replacement risk, §15.1) ─────────── */
lines.push('--- D1. seat 0 shoves the couch through the hung 34" door: forced within DOOR.forceWithinMs, priced on the frame (GDD §3.3, §8.2, §15.1, §23.3) ---');
let D1;
{
  releaseAll(); rehangAll(); parkMoversAway(); drainNotices();
  const leaf = leafOf();
  const bodies0 = physics.stats.bodies;
  const p0 = prop().length, cost0 = sumCost(prop()), ev0 = doorEvents.length, pe0 = propEvents.length, s0 = M.scuffs.count;
  const rec0 = recorder.events.length;
  eq('D1-0 the leaf is hung and bent from D2 (a forcing clears the flag)', `${leaf.state.hung}/${leaf.state.frameBent}`, 'true/true');
  eq('D1-0 the tag is billable and labelled', `${billable(TAG)}/${labelFor(TAG)}/${doorIdOf(TAG)}/${isDoorFrameTag(TAG)}`, `true/kitchen door/${DOOR_ID}/true`);
  const r = shove(movers[0], { hands: 2 });
  D1 = r;
  eq('D1 fixture: both hands on the couch', r.gripped, true);
  lines.push(`      shove: first touch at step ${r.firstContact} (${(r.firstContact * STEP / 1000).toFixed(2)} s); forced at step ${r.forcedAt} (${r.forcedAt >= 0 ? (r.forcedAt * STEP / 1000).toFixed(2) : '-'} s); ` +
             `leaf manifold Σ ${r.manifoldSum.toFixed(1)} N·s, ${r.forceSteps} steps at >= ${F.forceN} N, peak ${r.peakForceN.toFixed(0)} N; M14's m·Δv Σ while touching ${r.mdvSum.toFixed(2)} N·s, of which after the first touch ${r.mdvAfterTouch.toFixed(2)}`);
  for (const t of r.trace) lines.push(t);
  ok(`D1 forced within DOOR.forceWithinMs (${DOOR.forceWithinMs} ms) of sim time`, r.forcedAt >= 0 && (r.forcedAt + 1) * STEP <= DOOR.forceWithinMs, `${r.forcedAt >= 0 ? ((r.forcedAt + 1) * STEP).toFixed(0) : 'never'} ms`);
  ok('D1 …in under half of it (tempting, §3.3)', r.forcedAt >= 0 && (r.forcedAt + 1) * STEP <= DOOR.forceWithinMs / 2, `${((r.forcedAt + 1) * STEP).toFixed(0)} ms`);
  ok('D1a WHY the frame reads the leaf and not m·Δv: after the first touch the couch\'s own m·Δv summed under 10 % of what the leaf took',
     r.mdvAfterTouch < 0.10 * r.manifoldSum, `m·Δv after touch ${r.mdvAfterTouch.toFixed(2)} vs leaf ${r.manifoldSum.toFixed(1)}`);
  ok(`D1a …the strain rose on at least 80 % of the pressing steps (the hands held above forceN ${F.forceN} N; the leaf's own manifold read over 250 N on only ${r.forceSteps})`,
     r.strainSteps >= 0.8 * (r.forcedAt - r.firstContact + 1), `${r.strainSteps} of ${r.forcedAt - r.firstContact + 1}`);
  ok('D1a …the forcing took the strain past DOOR.forceImpulseNs at the hands\' rate: under 1 s of pressing after the first touch', (r.forcedAt - r.firstContact) * STEP <= 1000, `${((r.forcedAt - r.firstContact) * STEP).toFixed(0)} ms`);
  eq('D1 state.hung flips false', leaf.state.hung, false);
  eq('D1 hungClear(living_kitchen) is M11\'s unhung 0.86 (live)', doors.hungClear(DOOR_ID), 0.86);
  eq('D1 …and the bedroom route reads 0.86', doors.tightestOnRoute('bedroom'), 0.86);
  ok('D1 the leaf is a loose Dynamic body', leaf.body.isDynamic() && !leaf.body.isFixed());
  const capAtForce = audio.lastCaption(game.clock.simTimeMs);
  /* The launch check (brief risk note): a mover at rest beside the doorway when the leaf's
   * body type flips. Walk intent off, grips off, the fixture's own haul-back zeroed — then
   * anything that moves the mover in the next 30 steps is the physics, not the fixture. */
  releaseAll();
  r.mover.controller._vel.x = 0; r.mover.controller._vel.z = 0; r.mover.controller.pull.x = 0; r.mover.controller.pull.z = 0;
  const moverAt = { ...r.mover.controller.position };
  step(30);
  const lp = posOf(leaf), rest = leaf.state.rest;
  ok('D1 …on the floor at M11\'s rest pose (the removed door\'s own spot, ± 0.05 m; y ≈ 0.02)', Math.abs(lp.x - rest.x) < 0.05 && Math.abs(lp.z - rest.z) < 0.05 && Math.abs(lp.y - rest.y) < 0.03,
     `${JSON.stringify(lp)} vs ${JSON.stringify({ x: rest.x, y: rest.y, z: rest.z })}`);
  const moved = dist2(r.mover.controller.position, moverAt);
  ok('D1 the mover was not launched: displacement < 5 cm over 30 idle steps after the door went (and still on the floor)', moved < 0.05 && r.mover.controller.position.y < 0.1, `${moved.toFixed(3)} m, y ${r.mover.controller.position.y.toFixed(3)}`);
  eq('D1 physics.stats.bodies unchanged — forcing changes a body\'s TYPE, not the count', physics.stats.bodies, bodies0);
  eq('D1 …and equals the boot count', physics.stats.bodies, bodiesAtBoot);
  const forced = doorEvents.slice(ev0).filter((e) => e.state === 'forced');
  eq('D1 DOOR_STATE { state: \'forced\', doorId } was emitted once', forced.length, 1);
  ok('D1 …doorId living_kitchen, entityId the leaf, by seat 0\'s mover, objectId the couch, the strain on it',
     !!forced[0] && forced[0].doorId === DOOR_ID && forced[0].entityId === leaf.id && forced[0].by === movers[0].id && forced[0].objectId === r.couch.id && forced[0].impulse >= DOOR.forceImpulseNs,
     JSON.stringify(forced[0]));
  eq('D1 …no other DOOR_STATE came with it', doorEvents.slice(ev0).length, 1);
  ok('D1 the run record carries it (recorder.events)', recorder.events.slice(rec0).some((e) => e.type === EVENTS.DOOR_STATE && e.state === 'forced' && e.doorId === DOOR_ID));
  const L = prop().slice(p0);
  const l = L.find((x) => x.surfaceId === TAG) || null;
  lines.push(`      ledger: +${L.length} line(s) ${JSON.stringify(l)}`);
  eq(`D1 ledger.propertyDamage grew by exactly DAMAGE.property.doorFrame.chargeForced (${F.chargeForced})`, Number((sumCost(prop()) - cost0).toFixed(2)), F.chargeForced);
  eq('D1 …in one line', L.length, 1);
  ok('D1 …citing surface \'door_frame\' (kind) and the door id',
     !!l && l.kind === DOOR_FRAME_KIND && l.doorId === DOOR_ID && l.surfaceId === TAG && l.band === 'forced' && l.location === 'kitchen door' && l.category === 'property',
     l ? `${l.kind} ${l.doorId} ${l.surfaceId} ${l.band} ${l.location}` : 'no line');
  ok('D1b …the couch on it, held by seat 0 (heldBy, M14\'s shape), impulse >= forceImpulseNs, timeMs stamped',
     !!l && l.entityId === r.couch.id && l.defId === 'couch_3seat_01' && l.heldBy.length >= 1 && l.heldBy.every((id) => id === movers[0].id) && l.impulse >= DOOR.forceImpulseNs && l.timeMs >= 0,
     l ? JSON.stringify({ e: l.entityId, heldBy: l.heldBy, impulse: l.impulse }) : 'no line');
  const hm = leafHingeMark(door);
  ok('D1c …the mark is on the hinge jamb, normal across the opening (house.js leafHingeMark), not where the leaf was',
     !!l && Math.abs(l.at.x - hm.at.x) < 0.02 && Math.abs(l.at.z - hm.at.z) < 0.02 && Math.abs(l.at.y - hm.at.y) < 0.02 && Math.abs(l.normal.x - hm.normal.x) < 1e-3,
     l ? `${JSON.stringify(l.at)} n ${JSON.stringify(l.normal)} vs ${JSON.stringify(hm)}` : 'no line');
  eq('D1c …and one scuff went there', M.scuffs.count, s0 + 1);
  eq('D1d exactly one DAMAGE_APPLIED (category property) for it', propEvents.length - pe0, 1);
  const notice = M.pendingNotices.find((n) => n.kind === 'damage' && /forced off its hinges/.test(n.text));
  ok('D1 a notice matched /forced off its hinges/ — \'kitchen door forced off its hinges — 140.00\'', !!notice && notice.text === `kitchen door forced off its hinges — ${F.chargeForced.toFixed(2)}`,
     M.pendingNotices.map((n) => n.text).join(' | '));
  const cap = capAtForce;
  ok('D1 a caption \'door forced\' was queued (the DOOR_STATE cue, after the line\'s)', !!cap && cap.text === 'door forced' && cap.type === EVENTS.DOOR_STATE, JSON.stringify(cap));
  eq('D1e …resolveCue agrees for both rows', `${resolveCue('DOOR_STATE', forced[0] || {}).caption}/${resolveCue('DAMAGE_APPLIED', l || {}).caption}`, 'door forced/door forced');
  eq('D1f the bent flag is cleared by the forcing (the frame can be bent again once re-hung)', leaf.state.frameBent, false);
  eq('D1g state.doors counts a forced door as removed (§15.2\'s tag path)', game.state.doors.removed[DOOR_ID], 1);
  ok('D1h the ledger round-trips as plain data (§22.4)', (() => { try { const j = JSON.parse(JSON.stringify(game.state.ledger)); return j.propertyDamage.length === prop().length; } catch (e) { return false; } })());
  // The removed door's own paths: recovery to the REST pose (M15), the M11 Q to rehang.
  ok('D1i interact._atJamb(leaf): a forced leaf is a removed leaf to Q', interact._atJamb(leaf) === true);
  drainNotices();
}
emit('D3...');

/* ── D3. the trade is priced both ways (§3.3, §8.2, §15.1) ───────────────────── */
lines.push('--- D3. forcing bills MORE than removing: chargeForced >= 2x the prepared cash, and two scripted runs settle in that order (GDD §3.3, §8.2, §15.1) ---');
{
  const preparedSeconds = DOOR.removeSeconds * TOOLS.screwdriver.timeScale;
  const moverCount = 2;   // buildInvoice's default (invoice.js)
  const preparedCash = Number((preparedSeconds / 60 * ECONOMY.labourPerMinutePerMover * moverCount).toFixed(2));
  lines.push(`      prepared: DOOR.removeSeconds ${DOOR.removeSeconds} x timeScale ${TOOLS.screwdriver.timeScale} = ${preparedSeconds} s -> ${preparedCash} of labour (${moverCount} movers @ ${ECONOMY.labourPerMinutePerMover}/min); forced: ${F.chargeForced} = ${(F.chargeForced / preparedCash).toFixed(1)}x`);
  ok(`D3 chargeForced (${F.chargeForced}) >= 2 x the prepared cost's cash (${preparedCash}) — from config, never a literal`, F.chargeForced >= 2 * preparedCash);
  const seed0 = game.state.seed;
  const N = 160;
  const invoiceNow = () => {
    const inv = buildInvoice(game.state, manifestSummary(rows()), { recoveries: 0, collisions: 0 });
    const rc = reconcile(inv, game.state, { recoveries: 0, collisions: 0 });
    const labour = inv.lines.filter((x) => x.kind === LINE_KINDS.LABOUR).reduce((s, x) => s - x.amount, 0);
    const property = inv.lines.filter((x) => x.kind === LINE_KINDS.PROPERTY_DAMAGE).reduce((s, x) => s - x.amount, 0);
    return { inv, rc, labour: Number(labour.toFixed(2)), property: Number(property.toFixed(2)), costs: Number(inv.costs.toFixed(2)) };
  };
  // Run A — prepared: E with the screwdriver, then the same shove through the open doorway.
  M.resetContract(); game.setPaused(false); drainNotices();
  eq('D3 run A starts from the same seed', game.state.seed, seed0);
  const leaf = leafOf();
  const sd = toolByDef('screwdriver_01');
  ok('D3 run A: the screwdriver is picked up (m19\'s fixture)', pickUp(sd));
  const home = leaf.state.home;
  lookAt(me(), { x: home.x, z: door.at + 1.0 }, { x: home.x, y: 1.0, z: door.at - 0.05 });
  step(4);
  let seen = interact.describe(me());
  for (let k = 0; k < 6 && !(seen.target && seen.target.entity === leaf); k++) {
    lookAt(me(), { x: home.x + 0.1 * (k + 1), z: door.at + 1.0 }, { x: home.x, y: 0.8 + 0.2 * k, z: door.at - 0.05 });
    step(2);
    seen = interact.describe(me());
  }
  const workBefore = game.state.elapsedWorkMs;
  const did = interact.act(me(), game.clock.simTimeMs);
  ok('D3 run A: E takes the door off (M11) and bills DOOR.removeSeconds', /door off/.test(did || '') && leaf.state.hung === false && Math.abs(game.state.elapsedWorkMs - workBefore - preparedSeconds * 1000) < 1,
     `${did} / hung ${leaf.state.hung} / +${(game.state.elapsedWorkMs - workBefore).toFixed(1)} ms`);
  putBackOnRack(sd);
  for (const s of interact.state.values()) { s.carriedTool = null; }
  const a = shove(me(), { hands: 2, maxSteps: N, stopWhenForced: false });
  releaseAll();
  const A = invoiceNow();
  lines.push(`      run A (prepared): E then ${a.steps} steps of shoving through the open doorway — labour ${A.labour}, property ${A.property} (${prop().length} line(s): ${prop().map((x) => `${x.surfaceId} ${x.cost}`).join(', ')}), costs ${A.costs}, reconcile ${A.rc.ok}`);
  // Run B — forced: the same shove, the door on.
  M.resetContract(); game.setPaused(false); drainNotices();
  eq('D3 run B starts from the same seed, the leaf re-hung', `${game.state.seed === seed0}/${leafOf().state.hung}`, 'true/true');
  const b = shove(me(), { hands: 2, maxSteps: N, stopWhenForced: false });
  releaseAll();
  const B = invoiceNow();
  lines.push(`      run B (forced): ${b.steps} steps of shoving, forced at step ${b.forcedAt} — labour ${B.labour}, property ${B.property} (${prop().length} line(s): ${prop().map((x) => `${x.surfaceId} ${x.cost}`).join(', ')}), costs ${B.costs}, reconcile ${B.rc.ok}`);
  ok('D3 run B forced the door inside the same shove budget', b.forcedAt >= 0 && b.forcedAt < N, `${b.forcedAt}`);
  ok('D3 run A never touched a frame (no door_frame line) and run B\'s frame line is the forcing', !prop().some((x) => x.surfaceId === TAG && x.band !== 'forced') && A.property === 0 && prop().some((x) => x.surfaceId === TAG && x.band === 'forced'),
     `A property ${A.property}; B lines ${prop().map((x) => x.surfaceId + ':' + x.band).join(',')}`);
  ok('D3 both invoices reconcile (the frame\'s line is a §15.1 property line like any wall\'s)', A.rc.ok && B.rc.ok, `${JSON.stringify(A.rc.problems || A.rc)} / ${JSON.stringify(B.rc.problems || B.rc)}`);
  const diff = Number((B.costs - A.costs).toFixed(2));
  const margin = Number((F.chargeForced - 2 * preparedCash).toFixed(2));
  ok(`D3 the forced run's costs exceed the prepared run's by at least the 2x margin (${margin}) — measured ${diff}`, diff >= margin, `${B.costs} - ${A.costs} = ${diff}`);
  ok(`D3 …and by more than a whole prepared cost (${preparedCash})`, diff >= preparedCash, `${diff}`);
  ok('D3a the prepared run paid its 45 s in labour: labour A - labour B >= the prepared cash less one frame budget', A.labour - B.labour >= preparedCash - 1.0, `${A.labour} - ${B.labour}`);
  M.resetContract(); game.setPaused(false); drainNotices();
}
emit('D4...');

/* ── D4. 'sturdy' (§8.3 fragility bands, §8.2 replacement risk) ─────────────── */
lines.push('--- D4. a removed leaf dropped 1.5 m is marked, not totalled; every other band\'s numbers are the recorded ones (GDD §8.3, §8.2) ---');
{
  releaseAll(); rehangAll(); parkMoversAway(); drainNotices();
  const S = DAMAGE.fragility.sturdy;
  eq('D4-0 door_leaf_01 is on the \'sturdy\' band', OBJECT_DEFS.door_leaf_01.fragility, 'sturdy');
  ok('D4-0 …a row of DAMAGE.fragility with a documented floorAfter15m >= 70', S && S.floorAfter15m >= 70 && S.impactSpeed > DAMAGE.fragility.normal.impactSpeed, JSON.stringify(S));
  const leaf = leafOf();
  registry.unhang(leaf, leaf.state.rest);
  leaf.state.condition = 100;
  const i0 = items().length;
  parkAt(leaf, PAD.x + 6, 1.5 + DOOR.leaf.t / 2, PAD.z, 0, leaf.state.rest.rot);
  let peak = 0;
  const offI = bus.on(EVENTS.IMPACT, (e) => { if (e.entityId === leaf.id) peak = Math.max(peak, e.relVelocity); });
  step(150);
  damage.flush(game.clock.simTimeMs);
  offI();
  const mine = items().slice(i0).filter((x) => x.entityId === leaf.id);
  const billed = sumCost(mine);
  const closed = Number((repairCost(leaf.def, leaf.state.condition) - repairCost(leaf.def, 100)).toFixed(2));
  lines.push(`      leaf dropped 1.5 m flat: peak ${peak.toFixed(2)} m/s lost, condition 100 -> ${leaf.state.condition.toFixed(1)} (${bandFor(leaf.state.condition).name}), billed ${billed} of ${DOOR.replacementValue} (closed form (${peak.toFixed(2)} - ${S.impactSpeed}) x ${S.conditionPerMps} = ${((peak - S.impactSpeed) * S.conditionPerMps).toFixed(1)})`);
  ok(`D4 condition stays >= DAMAGE.fragility.sturdy.floorAfter15m (${S.floorAfter15m})`, leaf.state.condition >= S.floorAfter15m, `${leaf.state.condition}`);
  ok('D4 …and it IS marked (a 5 m/s fall is not free)', leaf.state.condition < 100 && mine.length >= 1, `${leaf.state.condition} / ${mine.length} line(s)`);
  ok(`D4 the furniture line bills the band's fraction, not the whole ${DOOR.replacementValue}`, billed > 0 && billed < DOOR.replacementValue && billed === closed, `${billed} vs closed ${closed}`);
  eq('D4 …on the ITEM ledger (leaf damage stays furniture damage), no property line', prop().length, 0);
  eq('D4 …the band is \'scratched\'', bandFor(leaf.state.condition).name, 'scratched');
  // The other bands: the rows are the values every earlier suite measured against, and the
  // same 1.5 m drop reads the recorded conditions.
  const ROWS = { normal: { impactSpeed: 2.0, conditionPerMps: 26 }, fragile: { impactSpeed: 1.1, conditionPerMps: 55 }, extreme: { impactSpeed: 0.7, conditionPerMps: 90 } };
  ok('D4a the normal / fragile / extreme rows are unchanged (2.0/26, 1.1/55, 0.7/90)',
     Object.entries(ROWS).every(([k, r]) => DAMAGE.fragility[k].impactSpeed === r.impactSpeed && DAMAGE.fragility[k].conditionPerMps === r.conditionPerMps),
     JSON.stringify(DAMAGE.fragility));
  /* RECORDED TABLE: condition after a 1.5 m drop onto open ground, upright, 150 steps, on the
   * build before M23 changed the leaf's band (measured 2026-09-05; the rows above are pinned
   * so the closed form cannot have moved either). */
  const RECORDED = { box_small_01: 17.0, tv_55_01: 0.0, box_fragile_01: 0.0, chair_dining_01: 16.3 };
  const measured = {};
  let k = 0;
  for (const defId of Object.keys(RECORDED)) {
    const e = byDef(defId);
    if (!e) { measured[defId] = null; continue; }
    e.state.condition = 100;
    parkAt(e, PAD.x + 10 + k * 3, e.def.dimensions.y / 2 + 1.5, PAD.z + 6);
    step(150);
    damage.flush(game.clock.simTimeMs);
    measured[defId] = Number(e.state.condition.toFixed(1));
    k++;
  }
  lines.push(`      1.5 m drops, non-door: ${JSON.stringify(measured)} (recorded ${JSON.stringify(RECORDED)})`);
  ok('D4b every non-door entity\'s 1.5 m drop reads the recorded condition (± 0.1)',
     Object.entries(RECORDED).every(([id, c]) => measured[id] != null && Math.abs(measured[id] - c) <= 0.1), JSON.stringify(measured));
  M.resetContract(); game.setPaused(false); drainNotices();
}
emit('D5...');

/* ── D5. rehang occupancy (§8.2 reattach, §2.1 told in advance) ──────────────── */
lines.push('--- D5. Q refuses \'doorway blocked\' with a box, then a mover, in the hung pose; nothing moves; cleared, Q rehangs (GDD §8.2, §2.1, §4.4) ---');
{
  releaseAll(); rehangAll(); parkMoversAway(); drainNotices();
  for (const s of interact.state.values()) { s.carriedTool = null; s.pendingAnchor = null; }
  clearKitchen(byDef('couch_3seat_01'));   // the claim is about the occupant, the leaf and the movers, not the kitchen's settling boxes
  const leaf = leafOf();
  registry.unhang(leaf, leaf.state.rest);
  step(10);
  const home = leaf.state.home, rest = leaf.state.rest;
  const box = byDef('box_small_01');
  // The box inside the hung pose's box: its west face 5 mm past the hinge jamb, so it overlaps
  // the 40 mm the leaf would occupy without resting on the leaf lying beside the doorway.
  parkAt(box, home.x - DOOR.leaf.t / 2 + 0.005 + box.def.dimensions.x / 2, box.def.dimensions.y / 2 + 0.01, home.z);
  step(90);
  const bp = posOf(box);
  ok('D5 fixture: the leaf is off at its rest pose and the box sits inside where it would hang',
     !leaf.state.hung && bp.x - box.def.dimensions.x / 2 < home.x + DOOR.leaf.t / 2 && Math.abs(bp.z - home.z) < 0.05 && bp.y < 0.5, JSON.stringify(bp));
  // The acting mover looks at the leaf lying beside the doorway, from the kitchen side.
  const at = { x: rest.x, y: rest.y + 0.02, z: rest.z };
  lookAt(me(), { x: rest.x, z: rest.z - 1.0 }, at);
  step(4);
  let seen = interact.describe(me());
  for (let k = 0; k < 6 && !(seen.target && seen.target.entity === leaf); k++) {
    lookAt(me(), { x: rest.x + 0.15 * k, z: rest.z - 1.0 - 0.1 * k }, { x: rest.x, y: 0.02, z: rest.z });
    step(2);
    seen = interact.describe(me());
  }
  ok('D5 fixture: the reticle is on the leaf', !!seen.target && seen.target.entity === leaf, seen.target ? `${seen.target.kind} ${seen.target.entity && seen.target.entity.defId}` : 'nothing');
  eq('D5 within rehang range, Q\'s line says \'doorway blocked\' (not the M11 rehang promise)', seen.secondary, DOOR_BLOCKED_LABEL);
  eq('D5 …interact._doorwayBlocked(leaf) is what decided it', interact._doorwayBlocked(leaf), true);
  const snap = snapshotBodies();
  const said = interact.secondary(me());
  eq('D5 secondary() says the same and does nothing', said, DOOR_BLOCKED_SAID);
  eq('D5 …state.hung stays false', leaf.state.hung, false);
  ok('D5 …the leaf is still Dynamic at its rest pose', leaf.body.isDynamic() && Math.abs(posOf(leaf).x - rest.x) < 0.05);
  step(30);
  const mv = maxMoved(snap, { x: home.x, z: home.z }, 3.0);
  ok('D5 no body within 3 m of the doorway moved by > 1 mm over 30 frames (the solver shoved nobody)', mv.worst <= 0.001, `${mv.who} moved ${(mv.worst * 1000).toFixed(2)} mm`);
  eq('D5 …no DOOR_STATE', doorEvents.filter((e) => e.state === 'rehung' && e.doorId === DOOR_ID && e.reason == null).length, 0);
  // Remove the box; a MOVER standing in the doorway blocks it too.
  parkAt(box, PAD.x + 8, 0.27, PAD.z + 8);
  placeMover(movers[1], home.x, home.z);
  step(10);
  eq('D5a a mover standing where the leaf would hang blocks it too (the capsules are colliders)', interact._doorwayBlocked(leaf), true);
  eq('D5a …the line still says so', interact.describe(me()).secondary, DOOR_BLOCKED_LABEL);
  placeMover(movers[1], PAD.x + 12, PAD.z + 10);
  step(10);
  eq('D5b cleared: Q promises the M11 rehang', interact.describe(me()).secondary, DOOR_REHANG_LABEL);
  eq('D5b …_doorwayBlocked false', interact._doorwayBlocked(leaf), false);
  const ev0 = doorEvents.length;
  const q = interact.secondary(me());
  ok('D5b secondary() rehangs as M11 pins: \'back on\', hung true, Fixed, at home to the millimetre, one \'rehung\'',
     /back on/.test(q || '') && leaf.state.hung === true && leaf.body.isFixed() &&
     Math.hypot(posOf(leaf).x - home.x, posOf(leaf).y - home.y, posOf(leaf).z - home.z) < 1e-3 &&
     doorEvents.slice(ev0).filter((e) => e.state === 'rehung').length === 1,
     `${q} / hung ${leaf.state.hung} / fixed ${leaf.body.isFixed()}`);
  eq('D5b …and the opening is 0.82 again', doors.hungClear(DOOR_ID), 0.82);
  ok('D5c a hung leaf never reads as blocked by its own jamb, floor or header (DOOR.occupancyMargin)', interact._doorwayBlocked(leaf) === false);
  M.resetContract(); game.setPaused(false); drainNotices();
}
emit('D7...');

/* ── D7. co-op attribution (§15.3 recorded, never scored) ────────────────────── */
lines.push('--- D7. seat 1\'s shove names seat 1; a thrown fridge names nobody (GDD §15.3, §8.4) ---');
{
  eq('D7-0 F2 seats a second player', M.setSeats(2), 2);
  const seat1 = M.moverOfSeat(1);
  eq('D7-0 …seat 1 is mover 1', seat1.id, movers[1].id);
  releaseAll(); rehangAll(); parkMoversAway(); drainNotices();
  const leaf = leafOf();
  const p0 = prop().length, ev0 = doorEvents.length;
  const r = shove(seat1, { hands: 2 });
  for (const t of r.trace.slice(-2)) lines.push(t);
  ok('D7 seat 1 forces the door within the budget', r.gripped && r.forcedAt >= 0 && (r.forcedAt + 1) * STEP <= DOOR.forceWithinMs, `${r.forcedAt}`);
  const l = prop().slice(p0).find((x) => x.surfaceId === TAG && x.band === 'forced') || null;
  const ev = doorEvents.slice(ev0).find((e) => e.state === 'forced') || null;
  ok('D7 the line\'s heldBy is seat 1\'s mover id (a carried object; one entry per hand, M14\'s shape)', !!l && l.heldBy.length >= 1 && l.heldBy.every((id) => id === seat1.id), l ? JSON.stringify(l.heldBy) : 'no line');
  ok('D7 …and DOOR_STATE.by is seat 1\'s mover id', !!ev && ev.by === seat1.id, ev ? `${ev.by}` : 'no event');
  ok('D7 …never seat 0\'s', !!l && !l.heldBy.includes(movers[0].id));
  releaseAll();
  // Thrown: the fridge (110 kg) at 6 m/s into the leaf's face, held by nobody.
  M.resetContract(); game.setPaused(false); drainNotices(); parkMoversAway();
  const leaf2 = leafOf();
  const couch = byDef('couch_3seat_01');
  clearKitchen(couch);
  parkRolled(couch, PAD.x, PAD.z); settle(10);
  const fridge = byDef('fridge_01');
  const p1 = prop().length, ev1 = doorEvents.length;
  parkAt(fridge, leafFace() + fridge.def.dimensions.x / 2 + 0.05, fridge.def.dimensions.y / 2 + 0.02, leaf2.state.home.z);
  settle(20);
  throwAt(fridge, -4.0, 0, 0);
  let peakMi = 0;
  for (let i = 0; i < 30; i++) { step(1); if (leaf2.state.hung) peakMi = Math.max(peakMi, manifoldImpulse(fridge.collider, leaf2.collider)); }
  const l2 = prop().slice(p1).find((x) => x.surfaceId === TAG && x.band === 'forced') || null;
  const ev2 = doorEvents.slice(ev1).find((e) => e.state === 'forced') || null;
  lines.push(`      fridge_01 (${fridge.body.mass().toFixed(0)} kg) thrown at 4 m/s from 0.05 m: leaf manifold peak ${peakMi.toFixed(1)} N·s; ${l2 ? 'forced' : 'not forced'} ${JSON.stringify(ev2)}; line impulse ${l2 ? l2.impulse : '-'}`);
  ok(`D7a a thrown fridge forces the door in one step (>= forceImpulseNs ${DOOR.forceImpulseNs})`, !!l2 && !leaf2.state.hung && !!ev2 && l2.impulse >= DOOR.forceImpulseNs, `${peakMi.toFixed(1)} / ${l2 ? l2.impulse : '-'}`);
  ok('D7a …with heldBy [] on the line and by null on the event (thrown, nobody\'s hands)', !!l2 && l2.heldBy.length === 0 && !!ev2 && ev2.by === null, `${l2 ? JSON.stringify(l2.heldBy) : '-'} / ${ev2 ? ev2.by : '-'}`);
  eq('D7b one seat again', M.setSeats(1), 1);
  M.resetContract(); game.setPaused(false); drainNotices();
}
emit('Z...');

/* ── Z. the surface kind, as data (§8.3) ─────────────────────────────────────── */
lines.push('--- Z. the door_frame surface kind (GDD §8.3) ---');
{
  eq('Z1 doorFrameTag/doorIdOf round-trip', doorIdOf(doorFrameTag('kitchen_bedroom')), 'kitchen_bedroom');
  ok('Z2 billable for every leaf door, labelled by room', leafDoors(APERTURES).every((d) => billable(doorFrameTag(d.id)) && labelFor(doorFrameTag(d.id)).endsWith('door')),
     leafDoors(APERTURES).map((d) => labelFor(doorFrameTag(d.id))).join(', '));
  const row = surfaceRow(TAG);
  ok('Z3 surfaceRow: the frame is the one row with fixed charges {bent, forced} from DAMAGE.property.doorFrame', row.kind === DOOR_FRAME_KIND && row.charges && row.charges.bent === F.chargeBent && row.charges.forced === F.chargeForced, JSON.stringify(row));
  ok('Z3a …and a wall has the default row, no charges', surfaceRow('wall').charges === null && surfaceRow('wall').kind === null);
  ok('Z4 the thresholds are ordered: bentImpulseNs < forceImpulseNs, forceN > 0, forceWithinMs > 0', DOOR.bentImpulseNs < DOOR.forceImpulseNs && F.forceN > 0 && DOOR.forceWithinMs > 0);
  ok('Z5 the decal ring sizes both frame states', DAMAGE.property.decals.size.bent > 0 && DAMAGE.property.decals.size.forced > 0);
  ok('Z6 every leaf is hung again, bodies at the boot count, no property line, no scuff (the reset unwinds all of it)',
     doors.leaves().every((e) => e.state.hung && e.body.isFixed()) && physics.stats.bodies === bodiesAtBoot && prop().length === 0 && M.scuffs.count === 0,
     `${physics.stats.bodies} bodies, ${prop().length} lines, ${M.scuffs.count} scuffs`);
  lines.push(`      D1 calibration line: touch ${D1 ? (D1.firstContact * STEP / 1000).toFixed(2) : '-'} s, forced ${D1 ? ((D1.forcedAt + 1) * STEP / 1000).toFixed(2) : '-'} s, ${D1 ? D1.forceSteps : '-'} steps >= ${F.forceN} N, leaf Σ ${D1 ? D1.manifoldSum.toFixed(1) : '-'} N·s, m·Δv after touch ${D1 ? D1.mdvAfterTouch.toFixed(2) : '-'} N·s; CARRY.tractionN ${CARRY.tractionN}`);
  void PARTITION_T;
}
} catch (e) {
  fails++;
  lines.push(`FAIL  suite threw  <- ${e && e.message}`);
  lines.push((e && e.stack || '').split('\n').slice(0, 8).join('\n'));
}
emit();
