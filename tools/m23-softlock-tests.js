/* Phase 11 build-side M15 — no soft locks.
 *
 * §26.6: "No common sequence produces an unrecoverable soft lock." §18.3 recovers a manifest
 * object that leaves the world (registry.step, since Phase 5; billed since M6), but until M15
 * the four TOOLS had no such pass — a dolly knocked off the plot, a ramp dropped into the void
 * or a screwdriver carried into the truck and lost stayed gone until "Run it again", and a
 * lost screwdriver is a soft lock for every disassembly and every door on the contract. Since
 * Phase 20 the door leaves (fixtures) and the loose parts and fragments (pieces) are bodies
 * too, with the same exposure.
 *
 * THE CLAIMS UNDER TEST:
 *
 *   EVERY BODY COMES BACK   a tool below RECOVERY.toolFloorY or outside RECOVERY.bounds is
 *                           back on its rack slot within RECOVERY.maxFrames, dynamic, in the
 *                           object group, with ONE RECOVERY carrying ECONOMY.recoveryFee —
 *                           through the existing detach/retrieve/drop calls, so a parent
 *                           never keeps a lost tool's effect (L1-L3).
 *   THE RIGHT PLACE         a removed door leaf comes back to its REST pose, never its home
 *                           (re-hanging is the player's Q); a piece comes back beside its
 *                           parent's CURRENT position, not the spot it was unscrewed at
 *                           (L4, L5). A hung leaf is Fixed and is never touched.
 *   NEVER THE SPRING        a held body is let go of BEFORE it is teleported (L3).
 *   THE SWEEP               DEBUG.softlockSessions seeded random sessions over the common
 *                           verb set, three teleports-to-void each, and after every session
 *                           the five invariants (a)-(e) hold; the seed is in every FAIL line
 *                           so a failure reproduces (L6). One settle() after it renders the
 *                           invoice with a recovery line that equals the count (L7).
 *   DERIVED BOUNDS          RECOVERY.bounds comes from WORLD.groundSizeM — the ground the
 *                           physics built — and encloses everything authored by ≥ 5 m (L8).
 *
 * Drivers copied from tools/m14-soak-tests.js / m11 (frames, placeMover, parkAt, lookAt,
 * standOffFrom) and m6 (grabWith); the check-every-invariant-after-every-step shape from
 * AirportBaggageCrew tools/_invariants.js (Dev INDEX: "assert the thing you randomised
 * actually differs"). mulberry32 is the project's own copy (src/core/rng.js) of the
 * Chameleon / SomethingsDifferent function — same name, same code, not a fourth copy.
 */

import { SIM, RECOVERY, ECONOMY, PARTS, DEBUG, TOOLS, WORLD, DOOR } from '../src/config.js';
import { GROUP_PRESETS } from '../src/physics/world.js';
import { EVENTS, PHASES } from '../src/core/eventBus.js';
import { PHASE6_TOOL_SPAWNS } from '../src/tools/definitions.js';
import { PHASE5_SPAWNS } from '../src/objects/definitions.js';
import { ZONES } from '../src/world/house.js';
import { DEST_ZONES } from '../src/world/destination.js';
import { cabPoint, cargoInterior, cargoAnchors, rampAnchorPoint, CARGO_BOX } from '../src/world/truck.js';
import { LINE_KINDS } from '../src/contract/invoice.js';
import { routeSteps } from '../src/drive/route.js';
import { disassemble, reassemble, breakInto, clearFragments, partStatus } from '../src/tools/tools.js';
import { safeTranslation, isOutOfBounds } from '../src/objects/registry.js';
import { mulberry32 } from '../src/core/rng.js';
import { TARGET } from '../src/player/interact.js';
import { lostRow } from '../src/dev/debugOverlay.js';

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

const { game, physics, registry, movers, tools, straps, cargo, route, damage, interact, world } = M;
const bus = game.bus;
const STEP = SIM.stepMs;
const FRAME = 16.667;
const R = physics.R;
const I = cargoInterior();
const ANCHORS = cargoAnchors();
const B = RECOVERY.bounds;
const HALF = WORLD.groundSizeM / 2;
const LIFT = RECOVERY.objectRecoveryLiftM;
const me = () => movers[M.activeMoverIndex];
let framesTotal = 0;

/* ── drivers (m14 / m11 / m6 lineage) ─────────────────────────────────────── */
function frames(n) { for (let k = 0; k < n; k++) game.frame(FRAME); framesTotal += n; }
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
/** A teleport that keeps whatever rotation and body type the body has — "knocked off the plot". */
function teleport(body, x, y, z) {
  body.setTranslation({ x, y, z }, true);
  body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  body.wakeUp();
}
const posOf = (e) => { const t = e.body.translation(); return { x: t.x, y: t.y, z: t.z }; };
const byDef = (id) => { for (const e of registry.entities.values()) if (e.defId === id) return e; return null; };
const toolByDef = (id) => { for (const t of tools.tools.values()) if (t.defId === id) return t; return null; };
const finite = (t) => !!t && Number.isFinite(t.x) && Number.isFinite(t.y) && Number.isFinite(t.z);
const inBounds = (t) => finite(t) && !isOutOfBounds(t, B, B.minY);
function lookAt(m, from, target, snap = false) {
  placeMover(m, from.x, from.z, from.y !== undefined ? from.y : 0.2);
  const rig = M.rig, camera = M.camera;
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
function grabWith(m, hand, target) {
  const rig = M.rig, camera = M.camera;
  const p = m.controller.position;
  rig.yaw = Math.atan2(-(target.x - p.x), -(target.z - p.z));
  rig.pitch = Math.atan2(target.y - (p.y + 1.4), Math.hypot(target.x - p.x, target.z - p.z));
  for (let k = 0; k < 20; k++) rig.update(p, 1 / 60);
  const c = camera.position;
  rig.yaw = Math.atan2(-(target.x - c.x), -(target.z - c.z));
  rig.pitch = Math.atan2(target.y - c.y, Math.hypot(target.x - c.x, target.z - c.z));
  return m.grips.tryGrab(hand, m.id, game.clock.simTimeMs);
}
function atCab() { const cab = cabPoint(); lookAt(me(), standOffFrom(cab, 1.4), cab, true); }
function drainNotices() { const n = M.pendingNotices.length; M.pendingNotices.splice(0, n); return n; }
/** The m6 driver: grips and controllers stepped by hand, so a test grip survives (under
 *  game.frame() the movers system releases any grip whose key is not down — 'released' on
 *  the first frame) and the spring, the tear and the recovery pass all run for real. */
function stepWithGrips(n = 1) {
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
    physics.step();
    registry.step(STEP);
    tools.step(STEP);
  }
}
/** Every body the game can lose: tools, registry entities. Any non-finite translation among them. */
function nonFiniteBodies() {
  const bad = [];
  for (const t of tools.tools.values()) if (!safeTranslation(t.body)) bad.push(t.id);
  for (const e of registry.entities.values()) if (!safeTranslation(e.body)) bad.push(e.id);
  return bad;
}
/** Non-finite numbers anywhere in a plain-data tree (JSON would silently turn them into null). */
function findNonFinite(obj, path = 'state', out = []) {
  if (typeof obj === 'number') { if (!Number.isFinite(obj)) out.push(`${path}=${obj}`); return out; }
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) findNonFinite(v, `${path}.${k}`, out);
  }
  return out;
}
/** Empty ground, well clear of the house and the truck (m6's PAD). */
const PAD = { x: -40, z: 40 };
const VOID = { x: 0, y: -50, z: 0 };
/** Every event emitted while `fn` runs, in order — a subscriber, never the 256-entry ring
 *  (bus.log), which a burst of IMPACTs can wrap between a teleport and its recovery. */
function capture(fn) {
  const got = [];
  const off = bus.onAny((e) => got.push(e));
  try { fn(); } finally { off(); }
  return got;
}
const releaseAll = () => { for (const m of movers) m.grips.releaseAll('test reset'); };

/** Everything back to a known state between sections — the m11 reset() unwind, through the
 *  real API (detach / remove / reassemble with force / clearFragments / rehang / re-rack). */
function reset() {
  straps.releaseAll();
  route.reset();
  if (game.state.phase !== PHASES.PICKUP) game.state.phase = PHASES.PICKUP;
  releaseAll();
  for (const e of [...registry.entities.values()]) {
    if (e.state.partOf || e.state.fragmentOf) continue;
    if (e.state.dollyId) tools.detachDolly(tools.get(e.state.dollyId));
    if (e.state.blanketId) tools.removeBlanket(tools.get(e.state.blanketId));
    for (const p of [...(e.state.removedParts || [])]) reassemble(registry, e, p, { force: true });
    clearFragments(registry, e);
  }
  for (const s of interact.state.values()) { s.carriedTool = null; s.pendingAnchor = null; }
  for (const t of tools.tools.values()) {
    if (t.state.deployed) tools.retrieveRamp(t);
    t.body.setBodyType(R.RigidBodyType.Dynamic, true);
    t.collider.setCollisionGroups(GROUP_PRESETS.object);
    t.state.carriedBy = null; t.state.attachedTo = null; t.state.deployed = false; t.state.geometry = null;
    parkAt(t, t.home.x, t.home.y, t.home.z);
  }
  M.doors.rehangAll('test');
  for (const [i, m] of movers.entries()) placeMover(m, world.spawn.x + i * 1.4, world.spawn.z);
  physics.primeQueries();
}

try {
/* ── L0. the pass exists and the numbers it uses are the config's ───────── */
lines.push('--- L0. the tool pass and its constants (GDD §18.3, §25.1) ---');
{
  eq('L0 ToolSystem.step is the §18.3 pass', typeof tools.step, 'function');
  eq('L0 …and recover / dropCarried / recoveryCount exist', [typeof tools.recover, typeof tools.dropCarried, typeof tools.recoveryCount].join(','), 'function,function,function');
  const graceSteps = Math.ceil(RECOVERY.outOfBoundsGraceSeconds * 1000 / STEP);
  ok(`L0 RECOVERY.maxFrames (${RECOVERY.maxFrames}) covers the grace (${graceSteps} steps) with a margin`,
     RECOVERY.maxFrames > graceSteps && RECOVERY.maxFrames <= graceSteps + 30, `${RECOVERY.maxFrames} vs ${graceSteps}`);
  eq('L0 RECOVERY.toolFloorY === objectFloorY today (one floor, two keys)', RECOVERY.toolFloorY, RECOVERY.objectFloorY);
  const homes = [...tools.tools.values()].map((t, i) => {
    const s = PHASE6_TOOL_SPAWNS[i];
    return Math.abs(t.home.x - s.x) < 1e-9 && Math.abs(t.home.y - s.y) < 1e-9 && Math.abs(t.home.z - s.z) < 1e-9;
  });
  ok('L0 every tool\'s home is its PHASE6_TOOL_SPAWNS rack slot', homes.length === 4 && homes.every(Boolean), homes.join(','));
  ok('L0 every tool starts with recoveries 0 and outOfBoundsMs 0',
     [...tools.tools.values()].every((t) => t.state.recoveries === 0 && t.state.outOfBoundsMs === 0));
  // The guarded read (the plan's risk note): a NaN body and a throwing translation() both read as "not there".
  eq('L0 safeTranslation(NaN body) is null', safeTranslation({ translation: () => ({ x: NaN, y: 0, z: 0 }) }), null);
  eq('L0 safeTranslation(throwing body) is null', safeTranslation({ translation: () => { throw new Error('wasm'); } }), null);
  ok('L0 isOutOfBounds: below the floor, past the edge, above the ceiling — and not at the rack',
     isOutOfBounds({ x: 0, y: RECOVERY.objectFloorY - 0.01, z: 0 }) && isOutOfBounds({ x: HALF + 0.01, y: 1, z: 0 }) &&
     isOutOfBounds({ x: 0, y: B.maxY + 0.01, z: 0 }) && !isOutOfBounds({ x: PHASE6_TOOL_SPAWNS[0].x, y: 0.1, z: PHASE6_TOOL_SPAWNS[0].z }));
}
emit('running...');

/* ── L1. each tool teleported to the void comes back to its rack slot ─────── */
lines.push('--- L1. the four tools come back from (0, -50, 0) (GDD §18.3, §26.6, §15.1) ---');
{
  reset();
  frames(30);
  const results = [];
  for (const t of tools.tools.values()) {
    const before = M.recoveryCount();
    let midway = null, at = null, rest = null;
    const got = capture(() => {
      teleport(t.body, VOID.x, VOID.y, VOID.z);
      frames(Math.floor(RECOVERY.maxFrames / 2));
      midway = posOf(t);
      frames(RECOVERY.maxFrames - Math.floor(RECOVERY.maxFrames / 2));
      at = posOf(t);
      frames(120);   // let the LIFT drop settle (the 2.7 m ramp rocks for ~1 s) so the rest height and the velocity are real
      rest = posOf(t);
    });
    const v = t.body.linvel();
    const recEvents = got.filter((e) => e.type === EVENTS.RECOVERY);
    const r = {
      id: t.defId, midwayY: midway.y, at, rest, speed: Math.hypot(v.x, v.y, v.z),
      dynamic: t.body.isDynamic(), groups: t.collider.collisionGroups(),
      recs: recEvents.filter((e) => e.toolId === t.id), recoveries: t.state.recoveries,
      countDelta: M.recoveryCount() - before, kind: recEvents[0] && recEvents[0].kind,
    };
    results.push(r);
    lines.push(`      ${r.id}: midway y ${r.midwayY.toFixed(1)} -> at maxFrames (${r.at.x.toFixed(3)}, ${r.at.y.toFixed(3)}, ${r.at.z.toFixed(3)}) ` +
               `rest (${r.rest.x.toFixed(3)}, ${r.rest.y.toFixed(3)}, ${r.rest.z.toFixed(3)}) home (${t.home.x}, ${t.home.y}, ${t.home.z}) ` +
               `|v| ${r.speed.toFixed(4)} recoveries ${r.recoveries} events ${r.recs.length}`);
  }
  for (const r of results) {
    const t = toolByDef(r.id);
    ok(`L1 ${r.id} is NOT rescued before the grace (midway y < 0)`, r.midwayY < 0, `y ${r.midwayY.toFixed(2)}`);
    ok(`L1 ${r.id} is back on its rack slot within RECOVERY.maxFrames (x/z ± 0.05 m, y between the slot and the slot + lift)`,
       Math.abs(r.at.x - t.home.x) <= 0.05 && Math.abs(r.at.z - t.home.z) <= 0.05 &&
       r.at.y >= t.home.y - 0.05 && r.at.y <= t.home.y + LIFT + 0.05,
       `(${r.at.x.toFixed(3)}, ${r.at.y.toFixed(3)}, ${r.at.z.toFixed(3)}) vs home (${t.home.x}, ${t.home.y}, ${t.home.z})`);
    /* The rest HEIGHT is the ground's, not the spawn row's: the blanket and the screwdriver
     * rest a few millimetres into the ground (KNOWN_ISSUES, Phase 17: −0.00 m for the
     * screwdriver, spawn row 0.05), so y is asserted between the ground and the slot + lift. */
    ok(`L1 ${r.id} rests on the slot 120 frames later (x/z ± 0.05 m, y on the ground under the slot) with linvel < 0.01 m/s`,
       Math.abs(r.rest.x - t.home.x) <= 0.05 && Math.abs(r.rest.z - t.home.z) <= 0.05 && r.rest.y >= -0.02 && r.rest.y <= t.home.y + LIFT && r.speed < 0.01,
       `(${r.rest.x.toFixed(3)}, ${r.rest.y.toFixed(3)}, ${r.rest.z.toFixed(3)}) |v| ${r.speed.toFixed(4)}`);
    ok(`L1 ${r.id} isDynamic() in GROUP_PRESETS.object`, r.dynamic && r.groups === GROUP_PRESETS.object, `dynamic ${r.dynamic} groups ${r.groups}`);
    ok(`L1 ${r.id}: exactly one RECOVERY {toolId, reason 'out of bounds', fee ECONOMY.recoveryFee, kind 'tool'}`,
       r.recs.length === 1 && r.recs[0].fee === ECONOMY.recoveryFee && r.recs[0].reason === 'out of bounds' && r.recs[0].kind === 'tool' && r.recs[0].entityId === t.id,
       JSON.stringify(r.recs.map((e) => [e.toolId, e.reason, e.fee, e.kind])));
    ok(`L1 ${r.id}: tool.state.recoveries === 1 and recoveryCount() rose by exactly 1`, r.recoveries === 1 && r.countDelta === 1, `${r.recoveries} / +${r.countDelta}`);
  }
  eq('L1 tools.recoveryCount() === 4 after the four', tools.recoveryCount(), 4);
  const k = M.recoveriesByKind();
  ok('L1 the overlay\'s lost row says so: tools 4, total === recoveryCount()', k.tools === 4 && k.total === M.recoveryCount() && /tools 4/.test(lostRow(k)), lostRow(k));

  // The OTHER half of the AABB: past the ground's edge at y = 1 (not below the floor).
  const blanket = toolByDef('blanket_01');
  const recs = capture(() => {
    teleport(blanket.body, HALF + 30, 1.0, 12);
    frames(RECOVERY.maxFrames + 30);
  }).filter((e) => e.type === EVENTS.RECOVERY);
  const p = posOf(blanket);
  ok('L1b a tool past RECOVERY.bounds.maxX (y = 1, not below the floor) is recovered by the AABB half of the test',
     recs.filter((e) => e.toolId === blanket.id).length === 1 && Math.abs(p.x - blanket.home.x) <= 0.05 && Math.abs(p.z - blanket.home.z) <= 0.05,
     `${recs.length} events, at (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`);
  // A notice per callout, as for objects and movers (main.js RECOVERY subscriber).
  const notices = drainNotices();
  ok('L1c each callout queued the recovery notice', notices >= 5, `${notices} notices`);
}
emit('running...');

/* ── L2. an ATTACHED dolly and a DEPLOYED ramp recover through the real calls ─ */
lines.push('--- L2. lost while attached / deployed: the parent gets its physics back (GDD §9.1, §18.3) ---');
{
  reset();
  const dolly = toolByDef('dolly_flat_01');
  const couch = byDef('couch_3seat_01');
  const toolCallouts0 = tools.recoveryCount();
  parkAt(couch, PAD.x, 0.45, PAD.z);
  frames(20);
  const mu0 = couch.def.physics.friction;
  ok('L2 fixture: the dolly goes under the couch', tools.attachDolly(dolly, couch) && couch.state.dollyId === dolly.id && couch.collider.friction() < 0.1,
     `dollyId ${couch.state.dollyId} mu ${couch.collider.friction()}`);
  const got = capture(() => {
    teleport(dolly.body, VOID.x, VOID.y, VOID.z);
    frames(RECOVERY.maxFrames);
  });
  const rec = got.findIndex((e) => e.type === EVENTS.RECOVERY && e.toolId === dolly.id);
  const det = got.findIndex((e) => e.type === EVENTS.TOOL_STATE && e.toolId === dolly.id && e.state === 'detached');
  const detached = det;
  near('L2 the couch\'s friction is def.physics.friction again', couch.collider.friction(), mu0, 1e-6);
  ok('L2 …dollyId null, combine rule Average again (the Phase 17 M2 bug class cannot recur)',
     couch.state.dollyId === null && (!couch.collider.frictionCombineRule || couch.collider.frictionCombineRule() === R.CoefficientCombineRule.Average),
     `dollyId ${couch.state.dollyId}`);
  ok('L2 …the detach (TOOL_STATE detached) is on the bus BEFORE the RECOVERY — the parent was restored before the dolly landed on the rack',
     detached >= 0 && det >= 0 && rec >= 0 && det < rec, `detached at ${det}, recovery at ${rec}`);
  const dp = posOf(dolly);
  ok('L2 …and the dolly is on its rack slot, dynamic, attachedTo null',
     Math.abs(dp.x - dolly.home.x) <= 0.05 && Math.abs(dp.z - dolly.home.z) <= 0.05 && dolly.body.isDynamic() && dolly.state.attachedTo === null,
     `(${dp.x.toFixed(2)}, ${dp.z.toFixed(2)}) attachedTo ${dolly.state.attachedTo}`);

  // The ramp, deployed at the deck lip the way interact._applyTool does it, then lost.
  const ramp = toolByDef('ramp_01');
  const head = rampAnchorPoint();
  const foot = Math.sqrt(Math.max(0.01, TOOLS.ramp.length ** 2 - CARGO_BOX.deckY ** 2));
  const geo = tools.deployRamp(ramp, head, { x: 0, z: -1 }, foot);
  frames(5);
  const lip = posOf(ramp);
  ok('L2 fixture: the ramp is deployed (Fixed) at the deck lip', !!geo && ramp.state.deployed && ramp.body.isFixed(), `deployed ${ramp.state.deployed} fixed ${ramp.body.isFixed()}`);
  const collidersBefore = physics.stats.colliders;
  teleport(ramp.body, VOID.x + 5, VOID.y, VOID.z);
  frames(RECOVERY.maxFrames + 30);
  const rp = posOf(ramp);
  ok('L2 a deployed ramp lost is RETRIEVED (deployed false, geometry null, Dynamic) and back on the rack',
     ramp.state.deployed === false && ramp.state.geometry === null && ramp.body.isDynamic() &&
     Math.abs(rp.x - ramp.home.x) <= 0.05 && Math.abs(rp.z - ramp.home.z) <= 0.05,
     `deployed ${ramp.state.deployed} dynamic ${ramp.body.isDynamic()} at (${rp.x.toFixed(2)}, ${rp.y.toFixed(2)}, ${rp.z.toFixed(2)})`);
  physics.primeQueries();
  let rampAtLip = false;
  physics.world.intersectionsWithShape({ x: lip.x, y: lip.y, z: lip.z }, { x: 0, y: 0, z: 0, w: 1 }, new R.Cuboid(0.2, 0.2, 0.2),
    (c) => { if (c.handle === ramp.collider.handle) rampAtLip = true; return true; });
  ok('L2 …no ramp collider is left at the lip, and the collider count is unchanged (recovery moves, never creates)',
     !rampAtLip && physics.stats.colliders === collidersBefore, `atLip ${rampAtLip}, colliders ${collidersBefore} -> ${physics.stats.colliders}`);
  eq('L2 two more callouts on the tools\' tally', tools.recoveryCount() - toolCallouts0, 2);
  // The couch goes back to its spawn: section L3's pad must be empty ground.
  parkAt(couch, PHASE5_SPAWNS[0].x, PHASE5_SPAWNS[0].y, PHASE5_SPAWNS[0].z, PHASE5_SPAWNS[0].yaw);
}
emit('running...');

/* ── L3. lost while HELD: let go first, then recover; the mover stays put ── */
lines.push('--- L3. a held body is released before it is teleported (GDD §18.3, §6.1, §26.6) ---');
{
  reset();
  const box = byDef('box_small_01');
  parkAt(box, PAD.x, 0.27, PAD.z);
  placeMover(movers[0], PAD.x, PAD.z + 1.05);
  placeMover(movers[1], PAD.x + 20, PAD.z + 20);
  frames(25);
  const g = grabWith(movers[0], 'right', { x: PAD.x, y: 0.3, z: PAD.z + 0.25 });
  ok('L3 fixture: mover 0 holds a box', !!g && box.state.held, `${!!g} held ${box.state.held}`);
  const mp0 = { ...movers[0].controller.position };

  /* Path A — the grip system stepped (stepWithGrips: the m6 driver; game.frame() would drop
   * any test grip as 'released' on its first step because no grip key is down). Any
   * out-of-bounds point is further than GRIP.maxStretch, so the grip's own anti-ghosting lets
   * go ('pulled out of reach') on the very next step and the spring never fires; the box is
   * then recovered as an ordinary lost object after the grace. */
  const graceSteps = Math.ceil(RECOVERY.outOfBoundsGraceSeconds * 1000 / STEP) + 2;
  const gotA = capture(() => {
    teleport(box.body, VOID.x, VOID.y, VOID.z);
    stepWithGrips(graceSteps);
  });
  let ended = gotA.filter((e) => e.type === EVENTS.GRIP_ENDED);
  const recA = gotA.filter((e) => e.type === EVENTS.RECOVERY && e.entityId === box.id);
  const mp1 = movers[0].controller.position;
  ok('L3a with the grip stepped: the grip tears itself first (\'pulled out of reach\'), no spring pull, then the box is recovered',
     ended.length === 1 && ended[0].reason === 'pulled out of reach' && ended[0].entityId === box.id && recA.length === 1 && posOf(box).y > 0 && !box.state.held,
     `${JSON.stringify(ended.map((e) => e.reason))} recoveries ${recA.length} y ${posOf(box).y.toFixed(2)}`);
  ok('L3a …the mover is not moved', Math.hypot(mp1.x - mp0.x, mp1.z - mp0.z) < 0.01, `${Math.hypot(mp1.x - mp0.x, mp1.z - mp0.z).toFixed(3)} m`);

  /* Path B — the recovery pass alone (no grip step between the teleport and the rescue),
   * which is what a recover() invoked while the hand is still on sees: the registry lets
   * the grip go with reason 'lost' BEFORE it teleports the body. */
  releaseAll();
  parkAt(box, PAD.x, 0.27, PAD.z);
  placeMover(movers[0], PAD.x, PAD.z + 1.05);
  frames(25);
  const g2 = grabWith(movers[0], 'right', { x: PAD.x, y: 0.3, z: PAD.z + 0.25 });
  ok('L3b fixture: held again', !!g2 && box.state.held);
  const mp2 = { ...movers[0].controller.position };
  const gotB = capture(() => {
    teleport(box.body, VOID.x, VOID.y, VOID.z);
    for (let k = 0; k < graceSteps; k++) { physics.clearForces(); physics.step(); registry.step(STEP); }
  });
  ended = gotB.filter((e) => e.type === EVENTS.GRIP_ENDED);
  const seqB = gotB.filter((e) => (e.type === EVENTS.GRIP_ENDED || e.type === EVENTS.RECOVERY) && e.entityId === box.id);
  ok('L3b the registry\'s recovery releases the grip with reason \'lost\' (GRIP_ENDED) BEFORE the RECOVERY, and the box is back',
     ended.length === 1 && ended[0].reason === 'lost' && seqB.length === 2 && seqB[0].type === EVENTS.GRIP_ENDED && seqB[1].type === EVENTS.RECOVERY &&
     !box.state.held && !movers[0].grips.grips.right && posOf(box).y > 0,
     `${JSON.stringify(seqB.map((e) => [e.type, e.reason]))} held ${box.state.held}`);
  const mp3 = movers[0].controller.position;
  ok('L3b …the mover is not moved', Math.hypot(mp3.x - mp2.x, mp3.z - mp2.z) < 0.01, `${Math.hypot(mp3.x - mp2.x, mp3.z - mp2.z).toFixed(3)} m`);
  eq('L3 no NaN in any body after either path', nonFiniteBodies().length, 0);

  /* The TOOL in the hand. Tools are carried by the interaction system (kinematic, re-placed
   * at the mover's chest every step — interact.step), not by a grip spring, so under
   * game.frame() a teleport of the body alone is undone by the carry before the pass runs:
   * a carried tool cannot be lost while its carrier is in the world. The pass alone (the
   * seam a NaN carry point or a lost carrier would hit) drops it with reason 'lost'. */
  releaseAll();
  const sd = toolByDef('screwdriver_01');
  let p = posOf(sd);
  lookAt(movers[0], standOffFrom(p, 1.1), p);
  const picked = interact.act(movers[0]);
  ok('L3c fixture: mover 0 carries the screwdriver', /carrying/.test(picked || '') && sd.state.carriedBy === movers[0].id, picked || 'no pickup');
  const mp4 = { ...movers[0].controller.position };
  const recC = capture(() => {
    teleport(sd.body, VOID.x, VOID.y, VOID.z);
    frames(RECOVERY.maxFrames);
  }).filter((e) => e.type === EVENTS.RECOVERY && e.toolId === sd.id);
  ok('L3c under game.frame() a CARRIED tool is never lost: the carry re-places it each step, still carried, in bounds, 0 callouts',
     sd.state.carriedBy === movers[0].id && interact._for(movers[0].id).carriedTool === sd.id && inBounds(posOf(sd)) && recC.length === 0,
     `carriedBy ${sd.state.carriedBy} at (${posOf(sd).x.toFixed(2)}, ${posOf(sd).y.toFixed(2)}, ${posOf(sd).z.toFixed(2)}) callouts ${recC.length}`);
  const seqD = capture(() => {
    teleport(sd.body, VOID.x, VOID.y, VOID.z);
    for (let k = 0; k < graceSteps; k++) { physics.clearForces(); physics.step(); registry.step(STEP); tools.step(STEP); }
  }).filter((e) => (e.type === EVENTS.TOOL_STATE || e.type === EVENTS.RECOVERY) && e.toolId === sd.id);
  const sp = posOf(sd);
  ok('L3d the pass alone drops a carried tool with reason \'lost\' (TOOL_STATE dropped) BEFORE the RECOVERY, forgets it on the mover, and racks it',
     seqD.length === 2 && seqD[0].type === EVENTS.TOOL_STATE && seqD[0].state === 'dropped' && seqD[0].reason === 'lost' && seqD[0].by === movers[0].id &&
     seqD[1].type === EVENTS.RECOVERY && sd.state.carriedBy === null && interact._for(movers[0].id).carriedTool === null &&
     sd.body.isDynamic() && sd.collider.collisionGroups() === GROUP_PRESETS.object &&
     Math.abs(sp.x - sd.home.x) <= 0.05 && Math.abs(sp.z - sd.home.z) <= 0.05,
     `${JSON.stringify(seqD.map((e) => [e.type, e.state || e.reason]))} carriedBy ${sd.state.carriedBy} at (${sp.x.toFixed(2)}, ${sp.z.toFixed(2)})`);
  const mp5 = movers[0].controller.position;
  ok('L3d …the mover is not moved', Math.hypot(mp5.x - mp4.x, mp5.z - mp4.z) < 0.01, `${Math.hypot(mp5.x - mp4.x, mp5.z - mp4.z).toFixed(3)} m`);
  eq('L3 no NaN in any body after the tool paths either', nonFiniteBodies().length, 0);
  frames(60);   // the recovered screwdriver settles onto the rack before anyone aims at it
  /* Walked up to from open ground, as m11 C and m14 reach it: the screwdriver's authored slot
   * (TOOL_RACK.x + 2.30 = −0.10, z 9.0) lies inside the truck deck's collider footprint
   * (x −0.55..1.75, z 8.2..12.6, y 0..1.2 — truck.js cargoColliders), so a camera placed
   * straight behind a mover standing beside it sits inside the block and the probe's ray
   * hits the deck at reach; approached from afar the camera stays outside, the deck hit is
   * beyond TOOLS.interactRange and the small-tool assist wins (interact.js probe). A content
   * note for the orchestrator, not an M15 change (tools/definitions.js is not M15's). */
  lookAt(movers[0], { x: -20, z: 60 }, { x: -20, y: 0.2, z: 90 });
  p = posOf(sd);
  lookAt(movers[0], standOffFrom(p, 1.1), p);
  const dE = interact.describe(movers[0]);
  ok('L3e the prompt at the rack offers the screwdriver again — the verb is reachable after a loss (§26.6)',
     /pick up the screwdriver/.test(dE.primary || ''), `${dE.primary || 'nothing'} (target ${dE.target.kind}${dE.hint ? ', hint ' + dE.hint : ''})`);
}
emit('running...');

/* ── L4. a door leaf: to its REST pose, never its home; a hung leaf is untouched ─ */
lines.push('--- L4. door leaves: rest pose, not home; Fixed leaves skip the pass (GDD §8.2, §18.3, §26.4) ---');
{
  reset();
  const leaf = M.doors.leafFor('living_kitchen');
  const hungOne = M.doors.leafFor('door34');
  ok('L4 fixture: two leaves, both hung', !!leaf && !!hungOne && leaf.state.hung && hungOne.state.hung);
  registry.unhang(leaf, leaf.state.rest);
  bus.emit(EVENTS.DOOR_STATE, { doorId: leaf.state.doorId, entityId: leaf.id, state: 'removed', by: 'm23' }, game.clock.simTimeMs);
  frames(30);
  const rest = leaf.state.rest, home = leaf.state.home;
  // Carried 20 m past the plot's edge — beyond RECOVERY.bounds, well above the floor.
  const recs = capture(() => {
    teleport(leaf.body, HALF + 20, 1.0, rest.z);
    frames(RECOVERY.maxFrames + 30);
  }).filter((e) => e.type === EVENTS.RECOVERY && e.entityId === leaf.id);
  const lp = posOf(leaf);
  ok('L4 a removed leaf lost off the plot is recovered to its REST pose (± 0.05 m), hung false, isDynamic()',
     recs.length === 1 && recs[0].kind === 'fixture' && Math.abs(lp.x - rest.x) <= 0.05 && Math.abs(lp.z - rest.z) <= 0.05 && Math.abs(lp.y - rest.y) <= 0.05 &&
     leaf.state.hung === false && leaf.body.isDynamic(),
     `${recs.length} events kind ${recs[0] && recs[0].kind}; at (${lp.x.toFixed(2)}, ${lp.y.toFixed(2)}, ${lp.z.toFixed(2)}) rest (${rest.x.toFixed(2)}, ${rest.y.toFixed(2)}, ${rest.z.toFixed(2)}) hung ${leaf.state.hung}`);
  ok('L4 …and NOT to its home (re-hanging is the player\'s Q, §26.4 preserves the paid preparation)',
     Math.hypot(lp.x - home.x, lp.z - home.z) > 0.5 && !M.doors.isHung('living_kitchen'),
     `${Math.hypot(lp.x - home.x, lp.z - home.z).toFixed(2)} m from home`);
  ok('L4 …Q from the rest pose still hangs it back (the undo survived the loss)',
     (() => { const d = interact._atJamb(leaf); return d === true; })(), 'not within DOOR.rehangRange of its jamb');
  eq('L4 …and the lost row counts it as a fixture', M.recoveriesByKind().fixtures, 1);

  // A hung leaf is Fixed: teleport it, run the pass, nothing happens.
  const hp0 = posOf(hungOne);
  const recsH = capture(() => {
    teleport(hungOne.body, VOID.x, VOID.y, VOID.z);
    frames(RECOVERY.maxFrames + 5);
  }).filter((e) => e.type === EVENTS.RECOVERY && e.entityId === hungOne.id);
  const hp1 = posOf(hungOne);
  ok('L4 a HUNG leaf is never recovered: Fixed bodies skip the pass (0 events, still Fixed, still hung, left where it was put)',
     recsH.length === 0 && hungOne.body.isFixed() && hungOne.state.hung === true && Math.abs(hp1.y - VOID.y) < 1e-6 && (hungOne.state.recoveries || 0) === 0,
     `${recsH.length} events, fixed ${hungOne.body.isFixed()}, y ${hp1.y.toFixed(1)}`);
  eq('L4 …and recover() on it is a no-op', registry.recover(hungOne, 'test') === hungOne && posOf(hungOne).y, hp1.y);
  registry.hang(hungOne, hungOne.state.home);
  const back = posOf(hungOne);
  ok('L4 fixture restored: the hung leaf is home again', Math.hypot(back.x - hp0.x, back.z - hp0.z) < 1e-3);
  void DOOR;
}
emit('running...');

/* ── L5. pieces: back beside the parent's CURRENT position ────────────────── */
lines.push('--- L5. loose parts and fragments come back beside their parent, wherever it is now (GDD §9.1, §26.4) ---');
{
  reset();
  const couch = byDef('couch_3seat_01');
  parkAt(couch, PAD.x, 0.45, PAD.z);
  frames(20);
  const r = disassemble(registry, couch, 'legs');
  frames(30);
  const legs = (r ? r.pieces : []).map((id) => registry.get(id));
  ok('L5 fixture: four legs beside the couch at the pad', legs.length === 4 && legs.every((l) => l && inBounds(posOf(l))), `${legs.length}`);
  const spawnSpot = { x: PAD.x, z: PAD.z };
  // The couch moves on — 7 m away — before the legs are lost.
  const now = { x: PAD.x + 6, z: PAD.z + 4 };
  parkAt(couch, now.x, 0.45, now.z);
  frames(20);
  const recs = capture(() => {
    legs.forEach((l, i) => teleport(l.body, VOID.x + i * 0.5, VOID.y, VOID.z - i * 0.5));
    frames(RECOVERY.maxFrames + 30);
  }).filter((e) => e.type === EVENTS.RECOVERY && legs.some((l) => l.id === e.entityId));
  const dists = legs.map((l) => { const p = posOf(l); return Math.hypot(p.x - now.x, p.z - now.z); });
  const fromSpawn = legs.map((l) => { const p = posOf(l); return Math.hypot(p.x - spawnSpot.x, p.z - spawnSpot.z); });
  lines.push(`      legs after recovery: ${legs.map((l) => { const p = posOf(l); return `(${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`; }).join(' ')} ` +
             `— ${dists.map((d) => d.toFixed(2)).join('/')} m from the couch, ${fromSpawn.map((d) => d.toFixed(2)).join('/')} m from where they came off`);
  ok(`L5 all four legs recovered beside the couch's CURRENT position (each within PARTS.pieceSpacing x 4 = ${(PARTS.pieceSpacing * 4).toFixed(2)} m)`,
     recs.length === 4 && dists.every((d) => d <= PARTS.pieceSpacing * 4) && legs.every((l) => inBounds(posOf(l)) && l.body.isDynamic()),
     `${recs.length} events; ${dists.map((d) => d.toFixed(2)).join('/')} m`);
  ok('L5 …and NOT where they came off (> 5 m from the disassembly spot); RECOVERY kind \'piece\'',
     fromSpawn.every((d) => d > 5) && recs.every((e) => e.kind === 'piece'), `${fromSpawn.map((d) => d.toFixed(2)).join('/')} m; kinds ${recs.map((e) => e.kind).join(',')}`);
  const st = partStatus(registry, couch, 'legs');
  ok('L5 …so Q can put the legs back on (partStatus: 0 missing)', st.missing === 0 && st.present === 4, `${st.present} present, ${st.missing} missing`);

  // A fragment likewise, beside its hulk.
  const tv = byDef('tv_55_01');
  parkAt(tv, PAD.x - 6, 0.40, PAD.z, Math.PI / 2);
  frames(20);
  const fragIds = breakInto(registry, tv);
  frames(30);
  const frags = fragIds.map((id) => registry.get(id));
  const tvNow = { x: PAD.x - 6, z: PAD.z - 8 };
  parkAt(tv, tvNow.x, 0.40, tvNow.z, Math.PI / 2);
  frames(20);
  const recF = capture(() => {
    teleport(frags[0].body, VOID.x, VOID.y, VOID.z);
    frames(RECOVERY.maxFrames + 30);
  }).filter((e) => e.type === EVENTS.RECOVERY && e.entityId === frags[0].id);
  const fp = posOf(frags[0]);
  ok('L5 a fragment lost comes back beside its hulk\'s CURRENT position (within pieceSpacing x 4), kind \'piece\'',
     recF.length === 1 && recF[0].kind === 'piece' && Math.hypot(fp.x - tvNow.x, fp.z - tvNow.z) <= PARTS.pieceSpacing * 4 && inBounds(fp),
     `${recF.length} events; ${Math.hypot(fp.x - tvNow.x, fp.z - tvNow.z).toFixed(2)} m from the hulk at (${fp.x.toFixed(2)}, ${fp.y.toFixed(2)}, ${fp.z.toFixed(2)})`);
  const k = M.recoveriesByKind();
  // (fixtures is 0 again here: reset()'s rehangAll zeroes a leaf's run-scoped counters, as the contract reset does)
  ok('L5 the lost row counts them as pieces, and the kinds sum to recoveryCount()',
     k.pieces === 5 && k.objects >= 2 && k.total === M.recoveryCount() && /pieces 5/.test(lostRow(k)), lostRow(k));
  reassemble(registry, couch, 'legs', { force: true });
  clearFragments(registry, tv);
}
emit('running...');

/* ── L6. the randomised sweep ─────────────────────────────────────────────── */
lines.push(`--- L6. ${DEBUG.softlockSessions} seeded sessions of the common verbs, ${DEBUG.softlockTeleports} teleports-to-void each (GDD §26.6, §27.1, §27.2) ---`);
const sweep = { sessions: [], recoveries: 0, teleportsMoved: 0, teleports: 0, worst: null, drives: 0 };
{
  reset();
  drainNotices();
  const offRec = bus.on(EVENTS.RECOVERY, () => { sweep.recoveries++; });
  const manifestEntities = () => game.state.manifest.map((r) => registry.get(r.entityId)).filter(Boolean);
  const leaves = () => M.doors.leaves();
  const cab = cabPoint();
  const putDownIfCarrying = (m) => {
    const s = interact._for(m.id);
    if (!s.carriedTool) return false;
    lookAt(m, { x: -20, z: 60 }, { x: -20, y: 0.2, z: 90 });
    interact.secondary(m);
    return true;
  };
  const truckSlot = (rng) => ({
    x: I.minX + 0.6 + rng() * (I.maxX - I.minX - 1.2),
    z: I.minZ + 0.8 + rng() * (I.maxZ - I.minZ - 1.6),
  });

  /** The verb set. Each returns true when it applied, false when its preconditions were not
   *  met (a dolly already under something, nothing loaded to strap, no part left to take
   *  off …) — the sweep counts applied actions and never throws on a refusal (§2.1). */
  const VERBS = {
    'grab/drop': (rng, m) => {
      const cands = manifestEntities().filter((e) => e.body.isDynamic() && !e.state.held && inBounds(posOf(e)));
      if (!cands.length) return false;
      const e = cands[Math.floor(rng() * cands.length)];
      const p = posOf(e);
      lookAt(m, standOffFrom(p, 1.2), { x: p.x, y: p.y, z: p.z });
      const g = grabWith(m, rng() < 0.5 ? 'left' : 'right', { x: p.x, y: p.y, z: p.z + e.def.dimensions.z / 2 });
      frames(12 + Math.floor(rng() * 20));
      m.grips.releaseAll('released', game.clock.simTimeMs);
      frames(6);
      return !!g;
    },
    'carry to truck': (rng) => {
      const cands = manifestEntities().filter((e) => e.body.isDynamic() && !e.state.held && !e.state.loaded);
      if (!cands.length) return false;
      const e = cands[Math.floor(rng() * cands.length)];
      const s = truckSlot(rng);
      if (e.state.dollyId) tools.detachDolly(tools.get(e.state.dollyId));
      parkAt(e, s.x, I.minY + e.def.dimensions.y / 2 + 0.05, s.z);
      frames(40);
      return true;
    },
    'strap': (rng) => {
      const loaded = cargo.loadedEntities().filter((e) => straps.onEntity(e.id).length === 0);
      if (!loaded.length) return false;
      const e = loaded[Math.floor(rng() * loaded.length)];
      const p = posOf(e);
      const anchor = ANCHORS[Math.floor(rng() * ANCHORS.length)];
      const st = straps.attach(anchor, e, { x: p.x, y: p.y, z: p.z }, 0);
      if (st && rng() < 0.5) straps.tension(st.id);
      frames(10);
      return !!st;
    },
    'dolly under/off': (rng) => {
      const dolly = toolByDef('dolly_flat_01');
      if (dolly.state.carriedBy) return false;
      if (dolly.state.attachedTo) { tools.detachDolly(dolly); frames(4); return true; }
      const cands = manifestEntities().filter((e) => !e.state.dollyId && e.body.isDynamic());
      if (!cands.length) return false;
      const e = cands[Math.floor(rng() * cands.length)];
      const okd = tools.attachDolly(dolly, e);
      frames(4);
      return okd;
    },
    'blanket on/off': (rng) => {
      const blanket = toolByDef('blanket_01');
      if (blanket.state.carriedBy) return false;
      if (blanket.state.attachedTo) { tools.removeBlanket(blanket); return true; }
      const cands = manifestEntities().filter((e) => !e.state.blanketId);
      if (!cands.length) return false;
      return tools.applyBlanket(blanket, cands[Math.floor(rng() * cands.length)]);
    },
    'ramp deploy/retrieve': () => {
      const ramp = toolByDef('ramp_01');
      if (ramp.state.carriedBy) return false;
      if (ramp.state.deployed) { tools.retrieveRamp(ramp); frames(4); return true; }
      const foot = Math.sqrt(Math.max(0.01, TOOLS.ramp.length ** 2 - CARGO_BOX.deckY ** 2));
      const geo = tools.deployRamp(ramp, rampAnchorPoint(), { x: 0, z: -1 }, foot);
      frames(4);
      return !!geo;
    },
    'screwdriver': (rng) => {
      const cands = manifestEntities().filter((e) => (e.def.disassembly || []).length);
      if (!cands.length) return false;
      const e = cands[Math.floor(rng() * cands.length)];
      const done = e.state.removedParts || [];
      const next = (e.def.disassembly || []).find((p) => !done.includes(p.part));
      if (next && rng() < 0.7) { const r = disassemble(registry, e, next.part); frames(20); return !!r; }
      if (done.length) { const r = reassemble(registry, e, done[0]); frames(4); return !!r; }
      return false;
    },
    'door off/on': (rng) => {
      const ls = leaves();
      const leaf = ls[Math.floor(rng() * ls.length)];
      if (leaf.state.hung) {
        registry.unhang(leaf, leaf.state.rest);
        bus.emit(EVENTS.DOOR_STATE, { doorId: leaf.state.doorId, entityId: leaf.id, state: 'removed', by: 'sweep' }, game.clock.simTimeMs);
        frames(10);
        return true;
      }
      if (!leaf.state.held && interact._atJamb(leaf)) {
        registry.hang(leaf, leaf.state.home);
        bus.emit(EVENTS.DOOR_STATE, { doorId: leaf.state.doorId, entityId: leaf.id, state: 'rehung', by: 'sweep' }, game.clock.simTimeMs);
        return true;
      }
      return false;
    },
    'drive': (rng, m, ctx) => {
      if (!ctx.mayDrive || route.state !== 'parked' || game.state.phase !== PHASES.PICKUP) return false;
      putDownIfCarrying(m);
      atCab();
      const d = interact.describe(m);
      if (d.target.kind !== TARGET.CAB || !/drive/.test(d.primary || '')) return false;
      interact.act(m);
      if (route.state !== 'driving') return false;
      frames(routeSteps() + 60);
      sweep.drives++;
      return route.state === 'arrived' && game.state.phase === PHASES.DELIVERY;
    },
    'drive back': (rng, m, ctx) => {
      if (!ctx.mayDrive || route.state !== 'arrived' || game.state.phase !== PHASES.DELIVERY) return false;
      putDownIfCarrying(m);
      atCab();
      const d = interact.describe(m);
      if (d.target.kind !== TARGET.CAB || !/drive back/.test(d.primary || '')) return false;
      interact.act(m);
      if (route.state !== 'driving') return false;
      frames(routeSteps() + 60);
      sweep.drives++;
      return route.state === 'parked' && game.state.phase === PHASES.PICKUP;
    },
    'recover': (rng, m) => { m.controller.recoverNow('player request'); frames(3); return true; },
    'replay': () => { M.invoiceScreen.onReplay(); frames(5); return game.state.phase === PHASES.PICKUP; },
    'pick up tool': (rng, m) => {
      if (interact._for(m.id).carriedTool) return putDownIfCarrying(m);
      const free = [...tools.tools.values()].filter((t) => !t.state.carriedBy && !t.state.deployed && !t.state.attachedTo && inBounds(posOf(t)));
      if (!free.length) return false;
      const t = free[Math.floor(rng() * free.length)];
      const p = posOf(t);
      lookAt(m, standOffFrom(p, 1.1), p);
      const said = interact.act(m);
      frames(4);
      return /carrying/.test(said || '');
    },
  };
  const VERB_NAMES = Object.keys(VERBS);
  /* The two cab verbs are PLACED, not drawn: a route leg is 1681 frames, so the first
   * DEBUG.softlockDriveSessions sessions open with whichever cab verb applies (out from the
   * house, back from the destination — M13's second trip) and never replay, so the phase
   * they leave carries into the next; every other session draws from the rest. */
  const RANDOM_VERBS = VERB_NAMES.filter((v) => v !== 'drive' && v !== 'drive back');
  const RANDOM_VERBS_DRIVING = RANDOM_VERBS.filter((v) => v !== 'replay');

  /** One teleport-to-void of a random losable body. Returns what was moved and whether it
   *  really is out of bounds afterwards (the thing randomised must actually differ). */
  function teleportToVoid(rng) {
    const pool = [];
    for (const t of tools.tools.values()) if (!t.state.carriedBy) pool.push({ kind: 'tool', body: t.body, id: t.id });
    for (const e of registry.entities.values()) {
      if (e.body.isFixed()) continue;   // a hung leaf cannot be knocked off the plot
      pool.push({ kind: e.state.partOf || e.state.fragmentOf ? 'piece' : e.manifest === false ? 'leaf' : 'object', body: e.body, id: e.id });
    }
    if (!pool.length) return null;
    const pick = pool[Math.floor(rng() * pool.length)];
    const mode = rng() < 0.6 ? 'void' : 'edge';
    const target = mode === 'void'
      ? { x: (rng() - 0.5) * 40, y: VOID.y - rng() * 20, z: (rng() - 0.5) * 40 }
      : { x: (rng() < 0.5 ? -1 : 1) * (HALF + 10 + rng() * 30), y: 1 + rng() * 3, z: (rng() - 0.5) * 60 };
    teleport(pick.body, target.x, target.y, target.z);
    const t = safeTranslation(pick.body);
    return { ...pick, mode, moved: !!t && isOutOfBounds(t, B, B.minY) };
  }

  /** The five invariants, as a list of violations (empty = all hold). */
  function invariants(m) {
    const bad = [];
    // (a) every tool: finite, inside the play AABB (its rack is inside it), body type and group true to its state
    for (const t of tools.tools.values()) {
      const p = safeTranslation(t.body);
      if (!p) { bad.push(`(a) ${t.defId} non-finite`); continue; }
      if (isOutOfBounds(p, B, B.minY)) bad.push(`(a) ${t.defId} out of bounds at (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`);
      if (t.state.carriedBy) {
        if (!t.body.isKinematic()) bad.push(`(a) ${t.defId} carried but not kinematic`);
      } else if (t.state.deployed) {
        if (!t.body.isFixed()) bad.push(`(a) ${t.defId} deployed but not Fixed`);
      } else if (!t.body.isDynamic() || t.collider.collisionGroups() !== GROUP_PRESETS.object) {
        bad.push(`(a) ${t.defId} loose but dynamic ${t.body.isDynamic()} groups ${t.collider.collisionGroups()}`);
      }
      if (t.state.attachedTo && !registry.get(t.state.attachedTo)) bad.push(`(a) ${t.defId} attached to a missing entity`);
    }
    // (b) every manifest row can still be completed: entity and every piece exist, finite, in bounds
    for (const row of game.state.manifest) {
      const e = registry.get(row.entityId);
      if (!e) { bad.push(`(b) row ${row.id || row.defId} has no entity`); continue; }
      const p = safeTranslation(e.body);
      if (!p || isOutOfBounds(p, B, B.minY)) bad.push(`(b) ${e.id} ${p ? 'out of bounds' : 'non-finite'}`);
      const pieceIds = [...Object.values(e.state.parts || {}).flat(), ...(e.state.fragments || [])];
      for (const id of pieceIds) {
        const pc = registry.get(id);
        const pp = pc ? safeTranslation(pc.body) : null;
        if (!pc) bad.push(`(b) piece ${id} of ${e.id} is gone`);
        else if (!pp || isOutOfBounds(pp, B, B.minY)) bad.push(`(b) piece ${id} ${pp ? 'out of bounds' : 'non-finite'}`);
      }
    }
    // (c) every door leaf exists and is hung (Fixed at home) or inside bounds
    for (const leaf of M.doors.leaves()) {
      const p = safeTranslation(leaf.body);
      if (!p) { bad.push(`(c) leaf ${leaf.state.doorId} non-finite`); continue; }
      if (leaf.state.hung) {
        if (!leaf.body.isFixed() || Math.hypot(p.x - leaf.state.home.x, p.z - leaf.state.home.z) > 1e-3) bad.push(`(c) leaf ${leaf.state.doorId} hung but not Fixed at home`);
      } else if (isOutOfBounds(p, B, B.minY)) bad.push(`(c) leaf ${leaf.state.doorId} out of bounds`);
    }
    // (d) the cab prompt is reachable: describe() at the cab returns a primary
    putDownIfCarrying(m);
    atCab();
    const d = interact.describe(m);
    if (d.target.kind !== TARGET.CAB || typeof d.primary !== 'string' || !d.primary) {
      bad.push(`(d) cab prompt: kind ${d.target.kind} primary ${JSON.stringify(d.primary)} (phase ${game.state.phase}, route ${route.state})`);
    }
    // (e) game.state JSON round-trips, with no non-finite number hiding in it
    try {
      const s1 = JSON.stringify(game.state);
      const s2 = JSON.stringify(JSON.parse(s1));
      if (s1 !== s2) bad.push('(e) game.state does not round-trip through JSON');
      const nf = findNonFinite(game.state);
      if (nf.length) bad.push(`(e) non-finite in state: ${nf.slice(0, 3).join(', ')}`);
    } catch (err) { bad.push(`(e) JSON threw: ${err.message}`); }
    return bad;
  }

  const N = DEBUG.softlockSessions;
  for (let s = 0; s < N; s++) {
    const seed = DEBUG.softlockSeed + s;
    const rng = mulberry32(seed);
    const m = me();
    const nActions = DEBUG.softlockActionsMin + Math.floor(rng() * (DEBUG.softlockActionsMax - DEBUG.softlockActionsMin + 1));
    const teleportAt = new Set();
    while (teleportAt.size < Math.min(DEBUG.softlockTeleports, nActions)) teleportAt.add(Math.floor(rng() * nActions));
    const ctx = { mayDrive: s < DEBUG.softlockDriveSessions };
    const pool = ctx.mayDrive ? RANDOM_VERBS_DRIVING : RANDOM_VERBS;
    const script = [];
    let applied = 0;
    const sessionRecs = sweep.recoveries;
    const frames0 = framesTotal;
    emit(`sweep session ${s + 1}/${N} (seed ${seed})...`);
    const run = (verb) => {
      let did = false;
      try { did = !!VERBS[verb](rng, m, ctx); }
      catch (err) { script.push(`${verb}!THREW(${err.message})`); return; }
      script.push(did ? verb : `(${verb})`);
      if (did) applied++;
    };
    if (ctx.mayDrive) run(route.state === 'arrived' ? 'drive back' : 'drive');
    for (let a = 0; a < nActions; a++) {
      run(pool[Math.floor(rng() * pool.length)]);
      if (teleportAt.has(a)) {
        const tp = teleportToVoid(rng);
        if (tp) {
          sweep.teleports++;
          if (tp.moved) sweep.teleportsMoved++;
          script.push(`TELEPORT:${tp.kind}:${tp.mode}${tp.moved ? '' : '(not out)'}`);
        }
      }
    }
    // Let the last teleport's grace elapse before the invariants are read.
    frames(RECOVERY.maxFrames);
    const bad = invariants(m);
    const attempted = nActions + (ctx.mayDrive ? 1 : 0);
    const rec = { s, seed, nActions, applied, script, bad, recoveries: sweep.recoveries - sessionRecs, frames: framesTotal - frames0 };
    sweep.sessions.push(rec);
    if (!sweep.worst || rec.applied > sweep.worst.applied) sweep.worst = rec;
    lines.push(`      session ${s} seed ${seed}: ${applied}/${attempted} applied, ${rec.recoveries} callouts, ${rec.frames} frames — ${script.join(' ')}`);
    ok(`L6 session ${s} (seed ${seed}): invariants (a)-(e) hold after ${applied} actions`, bad.length === 0,
       `seed ${seed}: ${bad.slice(0, 4).join(' | ')} — script: ${script.join(' ')}`);
  }
  offRec();
  const failed = sweep.sessions.filter((r) => r.bad.length);
  lines.push(`      sweep: ${N} sessions, ${sweep.sessions.reduce((n, r) => n + r.applied, 0)} actions applied, ${sweep.teleports} teleports ` +
             `(${sweep.teleportsMoved} really out of bounds), ${sweep.recoveries} recoveries triggered, ${sweep.drives} route legs driven, ` +
             `worst session ${sweep.worst.s} with ${sweep.worst.applied} actions, ${failed.length} failing (seeds ${failed.map((r) => r.seed).join(',') || 'none'})`);
  eq(`L6 zero of ${N} sessions failed`, failed.length, 0);
  ok('L6 recoveries triggered ≥ 1 (or the teleports did nothing)', sweep.recoveries >= 1, `${sweep.recoveries}`);
  ok('L6 every teleport really put its body out of bounds (the thing randomised actually differs)', sweep.teleports >= N * DEBUG.softlockTeleports - 2 && sweep.teleportsMoved === sweep.teleports,
     `${sweep.teleportsMoved} of ${sweep.teleports}`);
  ok(`L6 the route was driven in exactly the first DEBUG.softlockDriveSessions (${DEBUG.softlockDriveSessions}) sessions — out, back (M13's second trip), out — one leg each`,
     sweep.drives === DEBUG.softlockDriveSessions &&
     sweep.sessions.filter((r) => r.script.some((v) => v === 'drive' || v === 'drive back')).length === DEBUG.softlockDriveSessions &&
     sweep.sessions[1].script[0] === 'drive back',
     `${sweep.drives} legs; sessions ${sweep.sessions.filter((r) => r.script.some((v) => v === 'drive' || v === 'drive back')).map((r) => r.s).join(',')}; session 1 opens with ${sweep.sessions[1].script[0]}`);
  ok('L6 every verb applied at least once across the sweep',
     VERB_NAMES.every((v) => sweep.sessions.some((r) => r.script.includes(v))),
     VERB_NAMES.filter((v) => !sweep.sessions.some((r) => r.script.includes(v))).join(', ') || 'all');
}
emit('running...');

/* ── L7. one settle() after the sweep renders the invoice ─────────────────── */
lines.push('--- L7. settle after the sweep: the invoice renders and bills every callout (GDD §15.1, §26.1) ---');
{
  const putDownIfCarryingAll = () => {
    for (const m of movers) {
      const s = interact._for(m.id);
      if (s.carriedTool) { lookAt(m, { x: -20, z: 60 }, { x: -20, y: 0.2, z: 90 }); interact.secondary(m); }
    }
  };
  // One tool callout on the record for certain, whatever the last session's replay left.
  const sd = toolByDef('screwdriver_01');
  if (sd.state.carriedBy) putDownIfCarryingAll();
  teleport(sd.body, VOID.x, VOID.y, VOID.z);
  frames(RECOVERY.maxFrames + 10);
  const n = M.recoveryCount();
  const k = M.recoveriesByKind();
  ok('L7 fixture: at least one callout on the tally, and the kinds sum to it', n >= 1 && k.total === n && k.tools >= 1, `${n}; ${lostRow(k)}`);
  M.settle();
  ok('L7 settle() renders the invoice', game.state.phase === PHASES.SETTLEMENT && M.invoiceScreen.visible, `phase ${game.state.phase}`);
  const report = M.invoiceScreen.report();
  const inv = report && report.invoice;
  const line = inv && inv.lines.find((l) => l.kind === LINE_KINDS.RECOVERY);
  ok('L7 the rendered invoice\'s recovery line equals recoveryCount() x ECONOMY.recoveryFee',
     !!line && Math.abs(-line.amount - n * ECONOMY.recoveryFee) < 0.005 && M.invoiceScreen.el.textContent.includes(LINE_KINDS.RECOVERY),
     `line ${line ? line.amount : 'none'} vs ${n} x ${ECONOMY.recoveryFee} = ${(n * ECONOMY.recoveryFee).toFixed(2)}`);
  const summary = M.manifestSummary(game.state.manifest);
  const inv2 = M.buildInvoice(game.state, summary, { recoveries: M.recoveryCount(), collisions: 0, moverCount: movers.length });
  const rec = M.reconcile(inv2, game.state, { recoveries: M.recoveryCount(), collisions: 0 });
  ok('L7 reconcile() ok', rec.ok, rec.problems.join(' | '));
  ok('L7 the run summary\'s counters.recoveries === recoveryCount() (one §27.4 stream, tools included)',
     !!report && report.counters && report.counters.recoveries === n, report ? `${report.counters && report.counters.recoveries} vs ${n}` : 'no report');
  ok('L7 no error banner appeared during the suite', !document.getElementById('err-banner'));
  M.invoiceScreen.onReplay();
  eq('L7 replay zeroes the tools\' recoveries with everything else', tools.recoveryCount() + M.recoveryCount(), 0);
  ok('L7 …and re-racks the tools (every tool loose, dynamic, at home)',
     [...tools.tools.values()].every((t) => { const p = posOf(t); return t.body.isDynamic() && Math.abs(p.x - t.home.x) < 0.05 && Math.abs(p.z - t.home.z) < 0.05; }));
}
emit('running...');

/* ── L8. the bounds are derived, and enclose everything authored ──────────── */
lines.push('--- L8. RECOVERY.bounds is derived from the ground, not typed (GDD §25.1, §18.3) ---');
{
  eq('L8 bounds.maxX === WORLD.groundSizeM / 2', B.maxX, WORLD.groundSizeM / 2);
  ok('L8 …and the AABB is the ground\'s square, floor objectFloorY, ceiling the same half-size',
     B.minX === -HALF && B.minZ === -HALF && B.maxZ === HALF && B.minY === RECOVERY.objectFloorY && B.maxY === HALF, JSON.stringify(B));
  const ground = physics.statics.find((s) => s.tag === 'ground');
  const he = ground && ground.collider.halfExtents();
  ok('L8 the physics ground really is that size (addGround(WORLD.groundSizeM))', !!he && Math.abs(he.x - HALF) < 1e-9 && Math.abs(he.z - HALF) < 1e-9, he ? `${he.x} x ${he.z}` : 'no ground');
  const MARGIN = 5;
  const inside = (x, z, label) => (x >= B.minX + MARGIN && x <= B.maxX - MARGIN && z >= B.minZ + MARGIN && z <= B.maxZ - MARGIN) ? null : `${label} (${x}, ${z})`;
  const outside = [];
  PHASE5_SPAWNS.forEach((s, i) => { const r = inside(s.x, s.z, `spawn ${i} ${s.def}`); if (r) outside.push(r); });
  PHASE6_TOOL_SPAWNS.forEach((s) => { const r = inside(s.x, s.z, `rack ${s.def}`); if (r) outside.push(r); });
  for (const z of [...ZONES, ...DEST_ZONES]) {
    for (const [x, zz] of [[z.minX, z.minZ], [z.maxX, z.maxZ]]) { const r = inside(x, zz, `zone ${z.id}`); if (r) outside.push(r); }
  }
  for (const [x, z] of [[I.minX, I.minZ], [I.maxX, I.maxZ]]) { const r = inside(x, z, 'truck cargo box'); if (r) outside.push(r); }
  const cab = cabPoint();
  { const r = inside(cab.x, cab.z, 'cab'); if (r) outside.push(r); }
  { const r = inside(world.spawn.x, world.spawn.z, 'mover spawn'); if (r) outside.push(r); }
  /* "The route's teleport target": since M13 the route is a PHASE event and teleports nothing
   * (the truck never moves; both sites share one world) — the only teleport a delivery makes
   * is the suites' parkAt into DEST_ZONES, which the zone corners above cover. */
  ok(`L8 every spawn, the tool rack, both houses' zones, the truck's cargo box, the cab and the mover spawn sit ≥ ${MARGIN} m inside the bounds`,
     outside.length === 0, outside.join(' | '));
  ok('L8 the ceiling is above anything SIM.maxLinearVelocity can reach straight up (v²/2g)',
     B.maxY > (SIM.maxLinearVelocity ** 2) / (2 * Math.abs(SIM.gravity)), `${B.maxY} vs ${((SIM.maxLinearVelocity ** 2) / (2 * Math.abs(SIM.gravity))).toFixed(1)}`);
  lines.push(`      budget: ${framesTotal} game.frame() calls in the suite, clock ${(game.clock.simTimeMs / 1000).toFixed(1)} s since the last reset`);
}

} catch (e) {
  fails++;
  lines.push(`FAIL  suite threw  <- ${e && e.message}`);
  lines.push((e && e.stack || '').split('\n').slice(0, 6).join('\n'));
}

emit();
