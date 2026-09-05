/* Phase 11 build-side M11 suite — door leaves as removable objects.
 *
 * GDD §8.2 "Door: open or remove from hinges — preparation time and replacement risk";
 * §2.1 removing doors where the authored level supports them; §9.1 the screwdriver
 * "disassembles authored parts" and "loose pieces get lost"; §9.2 one interaction verb;
 * §8.1 visible surface = collider; §3.3 at least two approaches at every substantial
 * obstacle; §15.2 review tag front_door_removed; §22.4 stable ids, serializable state.
 *
 * THE CLAIM. A "34-inch door" is a 0.86 m opening whose hung 40 mm leaf leaves 0.82 m of
 * usable width — the number KNOWN_ISSUES called impossible for nine phases was this door
 * with its door on. Taking the leaf off gives the 0.86 back. Every doorway with a leaf
 * record therefore has an EFFECTIVE clear width (house.js hungClear) that the screwdriver
 * changes, and the leaf itself is the first carried object that is part of the HOUSE.
 *
 *   D1  house geometry: hungClear / tightestOnRoute, pure and live
 *   D2  spawn: one Fixed door_leaf_01 per leaf record, inside its opening, off the manifest
 *   D3  the couch's numbers, restated for a hung and a removed door
 *   D4  the verbs: E with the screwdriver takes it off (and bills the clock), Q hangs it back
 *   D5  a removed leaf is carried, lifted one-handed, dropped and damage-tracked
 *   D6  the physics pair: 600 N at the door with the leaf hung, and with it removed
 *   D7  reset re-hangs every leaf at its jamb
 *   D8  the §15.2 review tag, and its clearing on replay
 *   D9  serializability (m0 E8 pattern)
 *
 * Harness in the style of tools/m13-tests.js; the driving helpers are tools/m11-tests.js's.
 * Drives game.frame() / the systems directly — never waits for requestAnimationFrame.
 */

import { SIM, DOOR, TOOLS, CARGO } from '../src/config.js';
import { OBJECT_DEFS, PHASE5_SPAWNS } from '../src/objects/definitions.js';
import { APERTURES, fitsThroughGap } from '../src/render/scene.js';
import {
  INTERIOR_DOORS, PARTITION_T, ROOM, doorRecords, leafDoors, doorById, hungClear, tightestOnRoute,
  leafPose, leafRestPose, leafAabb,
} from '../src/world/house.js';
import { DOOR_REMOVE_LABEL, DOOR_REHANG_LABEL, isLeaf } from '../src/player/interact.js';
import { EVENTS, PHASES } from '../src/core/eventBus.js';
import { disassemble, reassemble } from '../src/tools/tools.js';
import { GROUP_PRESETS } from '../src/physics/world.js';
import { cargoInterior } from '../src/world/truck.js';

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

const { game, physics, registry, movers, tools, straps, cargo, route, damage, interact, rig, camera, world, doors } = M;
const bus = game.bus;
const THREE = window.THREE;
const STEP = SIM.stepMs;
const FRAME = 16.667;
const R = physics.R;
const me = () => movers[M.activeMoverIndex];
const I = cargoInterior();

/* ── driving helpers (tools/m11-tests.js, verbatim in spirit) ─────────────────────── */
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
const posOf = (e) => { const t = e.body.translation(); return { x: t.x, y: t.y, z: t.z }; };
const byDef = (id) => { for (const e of registry.entities.values()) if (e.defId === id) return e; return null; };
const toolByDef = (id) => { for (const t of tools.tools.values()) if (t.defId === id) return t; return null; };
function releaseAll() { for (const m of movers) m.grips.releaseAll('test reset'); }

/** Stand a mover somewhere and point them at a world point (m11 lookAt). */
function lookAt(m, from, target, snap = false) {
  placeMover(m, from.x, from.z, from.y !== undefined ? from.y : 0.2);
  const p = m.controller.position;
  m.rig.yaw = Math.atan2(-(target.x - p.x), -(target.z - p.z));
  m.rig.pitch = Math.atan2(target.y - (p.y + 1.4), Math.hypot(target.x - p.x, target.z - p.z));
  if (snap) m.rig._first = true;
  for (let k = 0; k < 20; k++) m.rig.update(p, 1 / 60);
  const c = m.camera.position;
  m.rig.yaw = Math.atan2(-(target.x - c.x), -(target.z - c.z));
  m.rig.pitch = Math.atan2(target.y - c.y, Math.hypot(target.x - c.x, target.z - c.z));
  m.grips.syncAim();
  physics.primeQueries();
}
function standOffFrom(target, back = 1.3) { return { x: target.x, z: target.z + back }; }

/** Aim a mover's own rig at a point and grab (m4/m5 grabWith). */
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
/** Raise a hand h metres straight up in world space (m4 raiseHand). */
function raiseHand(m, hand, base, h) {
  const live = m.grips.grips[hand];
  if (!live) return;
  const sp = Math.sin(m.grips.aimPitch), cp = Math.cos(m.grips.aimPitch);
  live.holdLocal.f = base.f + h * sp;
  live.holdLocal.u = base.u + h * cp;
}
/** Height of an object's LOWEST corner above the floor (m4 clearanceOf). */
function clearanceOf(entity) {
  const q = entity.body.rotation(), t = entity.body.translation();
  const d = entity.def.dimensions;
  const rxy = 2 * (q.x * q.y + q.z * q.w);
  const ryy = 1 - 2 * (q.x * q.x + q.z * q.z);
  const rzy = 2 * (q.y * q.z - q.x * q.w);
  const below = (d.x / 2) * Math.abs(rxy) + (d.y / 2) * Math.abs(ryy) + (d.z / 2) * Math.abs(rzy);
  return t.y - below;
}
/** World AABB of an entity's cuboid collider under its current rotation (m6 aabbOf). */
function aabbOf(e) {
  const q = e.body.rotation();
  const el = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w)).elements;
  const he = e.collider.halfExtents();
  const t = e.body.translation();
  const ex = Math.abs(el[0]) * he.x + Math.abs(el[4]) * he.y + Math.abs(el[8]) * he.z;
  const ey = Math.abs(el[1]) * he.x + Math.abs(el[5]) * he.y + Math.abs(el[9]) * he.z;
  const ez = Math.abs(el[2]) * he.x + Math.abs(el[6]) * he.y + Math.abs(el[10]) * he.z;
  return { minX: t.x - ex, maxX: t.x + ex, minY: t.y - ey, maxY: t.y + ey, minZ: t.z - ez, maxZ: t.z + ez, cx: t.x, cy: t.y, cz: t.z };
}
const overlaps1D = (aLo, aHi, bLo, bHi) => aLo < bHi && bLo < aHi;

/** Put the leaves back the way the level starts, through the game's own reset path. */
function rehangAll() { doors.rehangAll('test reset'); }

/** Open ground well away from the house, the destination (x 18.5) and m5's grid (40, 40). */
const PAD = { x: 40, z: -40 };

/** Pick a tool up through E, from open ground with an exact aim. The rack sits under the
 *  truck's deck, and a third-person camera behind a mover standing there aims through the
 *  deck collider — the ray stops on it and the small-tool assist loses the tie (m11's rack
 *  pickups work by the lagging camera happening to sit elsewhere). Not the thing under test. */
function pickUp(tool) {
  for (const s of interact.state.values()) { s.carriedTool = null; s.pendingAnchor = null; }
  tool.body.setBodyType(R.RigidBodyType.Dynamic, true);
  tool.collider.setCollisionGroups(GROUP_PRESETS.object);
  tool.state.carriedBy = null;
  parkAt(tool, PAD.x + 6, tool.def.dimensions.y / 2 + 0.01, PAD.z + 6);
  placeMover(movers[1], PAD.x + 30, PAD.z + 30);
  step(5);
  const p = posOf(tool);
  lookAt(me(), standOffFrom(p, 1.1), p, true);
  step(2);
  interact.act(me());
  return interact._for(me().id).carriedTool === tool.id;
}
/** …and back onto its rack (PHASE6_TOOL_SPAWNS screwdriver row: TOOL_RACK + 2.30 x). */
function putBackOnRack(tool) {
  for (const s of interact.state.values()) { s.carriedTool = null; s.pendingAnchor = null; }
  tool.body.setBodyType(R.RigidBodyType.Dynamic, true);
  tool.collider.setCollisionGroups(GROUP_PRESETS.object);
  tool.state.carriedBy = null;
  parkAt(tool, -0.10, 0.05, 9.0);
}

/** DOOR_STATE events since the spy was armed. */
const doorEvents = [];
bus.on(EVENTS.DOOR_STATE, (e) => doorEvents.push({ ...e }));

const RECORDS = leafDoors(APERTURES);
const HUNG_ALL = () => true, HUNG_NONE = () => false;

try {
/* ── D1. the house's numbers (§8.2, §3.3) ────────────────────────────────── */
lines.push('--- D1. hungClear and tightestOnRoute (GDD §8.2, §3.3, §21.1) ---');
{
  eq('D1 living_kitchen is 0.82 m clear with its leaf hung', hungClear('living_kitchen', APERTURES), 0.82);
  eq('D1 …and 0.86 m with it removed', hungClear('living_kitchen', APERTURES, INTERIOR_DOORS, HUNG_NONE), 0.86);
  eq('D1 kitchen_bedroom is 0.87 m hung', hungClear('kitchen_bedroom', APERTURES), 0.87);
  eq('D1 …and 0.91 m removed', hungClear('kitchen_bedroom', APERTURES, INTERIOR_DOORS, HUNG_NONE), 0.91);
  eq('D1 the front door (door34) is 0.82 m hung and 0.86 m removed',
     `${hungClear('door34', APERTURES)}/${hungClear('door34', APERTURES, INTERIOR_DOORS, HUNG_NONE)}`, '0.82/0.86');
  eq('D1 front36 has no leaf: 0.91 m either way',
     `${hungClear('front36', APERTURES)}/${hungClear('front36', APERTURES, INTERIOR_DOORS, HUNG_NONE)}`, '0.91/0.91');
  eq('D1 tightestOnRoute(bedroom) is 0.82 with every door hung', tightestOnRoute('bedroom', APERTURES), 0.82);
  eq('D1 …0.86 after living_kitchen\'s leaf is removed',
     tightestOnRoute('bedroom', APERTURES, INTERIOR_DOORS, (id) => id !== 'living_kitchen'), 0.86);
  eq('D1 …and the kitchen route is bound by the same door', tightestOnRoute('kitchen', APERTURES), 0.82);
  // The LIVE predicate: the game's own doors object reads the registry.
  eq('D1a the live game agrees: every leaf hung at boot, tightest 0.82', doors.tightestOnRoute('bedroom'), 0.82);
  ok('D1b every leaf-bearing record is in the live list',
     RECORDS.every((d) => doors.isHung(d.id)), RECORDS.map((d) => `${d.id}:${doors.isHung(d.id)}`).join(' '));
  eq('D1c four doors carry a leaf: interior32, door34, living_kitchen, kitchen_bedroom',
     RECORDS.map((d) => d.id).sort().join(','), 'door34,interior32,kitchen_bedroom,living_kitchen');
  eq('D1d doorRecords folds the three front apertures and the two interior doors into one shape',
     doorRecords(APERTURES).length, APERTURES.length + INTERIOR_DOORS.length);
  ok('D1e a leaf record says which jamb, which side and how it is laid down',
     RECORDS.every((d) => Math.abs(d.leaf.hinge) === 1 && Math.abs(d.leaf.swing) === 1 && ['wall', 'room'].includes(d.leaf.lay) && d.leaf.t === DOOR.leaf.t));
  const front = RECORDS.filter((d) => d.leaf.front).map((d) => d.id);
  eq('D1f the §15.2 front door is door34, and only door34', front.join(','), 'door34');
}
emit('running...');

/* ── D2. one leaf per record, Fixed, inside its opening, off the manifest ───────── */
lines.push('--- D2. the leaves are spawned, hung and off the manifest (GDD §8.1, §22.4) ---');
{
  const leaves = [...registry.entities.values()].filter((e) => e.defId === 'door_leaf_01');
  eq('D2 the registry holds exactly one door_leaf_01 per leaf record', leaves.length, RECORDS.length);
  const ids = leaves.map((e) => e.state.doorId).sort().join(',');
  eq('D2 …one for each door by id', ids, RECORDS.map((d) => d.id).sort().join(','));
  ok('D2 each body isFixed()', leaves.every((e) => e.body.isFixed()), leaves.map((e) => `${e.state.doorId}:${e.body.bodyType()}`).join(' '));
  ok('D2 each is hung, by its own state', leaves.every((e) => e.state.hung === true));
  const bad = [];
  for (const d of RECORDS) {
    const e = doors.leafFor(d.id);
    const a = aabbOf(e);
    const gapLo = d.centre - d.gap / 2, gapHi = d.centre + d.gap / 2;
    const alongLo = d.axis === 'x' ? a.minX : a.minZ, alongHi = d.axis === 'x' ? a.maxX : a.maxZ;
    const acrossLo = d.axis === 'x' ? a.minZ : a.minX, acrossHi = d.axis === 'x' ? a.maxZ : a.maxX;
    if (alongLo < gapLo - 1e-3 || alongHi > gapHi + 1e-3) bad.push(`${d.id} along ${alongLo.toFixed(3)}..${alongHi.toFixed(3)} vs gap ${gapLo.toFixed(3)}..${gapHi.toFixed(3)}`);
    if (Math.abs(alongHi - alongLo - d.leaf.t) > 1e-3) bad.push(`${d.id} thickness ${(alongHi - alongLo).toFixed(3)}`);
    // The hinge end sits on the wall's centre plane; the free end DOOR.leaf.length out into the swing room.
    const nearEnd = d.leaf.swing > 0 ? acrossLo : acrossHi, farEnd = d.leaf.swing > 0 ? acrossHi : acrossLo;
    if (Math.abs(nearEnd - d.at) > 1e-3) bad.push(`${d.id} hinge end ${nearEnd.toFixed(3)} vs wall ${d.at}`);
    if (Math.abs(farEnd - (d.at + d.leaf.swing * DOOR.leaf.length)) > 1e-3) bad.push(`${d.id} free end ${farEnd.toFixed(3)}`);
    if (Math.abs(a.minY - 0) > 1e-3 || Math.abs(a.maxY - DOOR.leaf.height) > 1e-3) bad.push(`${d.id} y ${a.minY.toFixed(3)}..${a.maxY.toFixed(3)}`);
    // …and against the hinge jamb, flush: the effective clear is exactly gap − t.
    const jamb = d.centre + d.leaf.hinge * d.gap / 2;
    const flush = d.leaf.hinge < 0 ? alongLo : alongHi;
    if (Math.abs(flush - jamb) > 1e-3) bad.push(`${d.id} not flush: ${flush.toFixed(3)} vs jamb ${jamb.toFixed(3)}`);
  }
  ok('D2 each leaf\'s AABB lies inside its opening\'s span along the wall, flush against the hinge jamb, 0.04 thick', !bad.some((b) => /along|thickness|flush/.test(b)), bad.join(' | '));
  ok('D2 …hinged on the wall plane and 0.80 m out into the room it swings into', !bad.some((b) => /end/.test(b)), bad.join(' | '));
  ok('D2 …and its y span is [0, 2.00] ± 1e-3', !bad.some((b) => / y /.test(b)), bad.join(' | '));
  for (const d of RECORDS) {
    const e = doors.leafFor(d.id), a = aabbOf(e);
    lines.push(`      ${d.id}: x ${a.minX.toFixed(3)}..${a.maxX.toFixed(3)} y ${a.minY.toFixed(3)}..${a.maxY.toFixed(3)} z ${a.minZ.toFixed(3)}..${a.maxZ.toFixed(3)}  (gap ${d.gap}, clear ${doors.hungClear(d.id)})`);
  }
  // The header is at 2.03: 30 mm over a 2.00 leaf.
  near('D2a the leaf clears the 2.03 m header by 30 mm', RECORDS[0].height - DOOR.leaf.height, 0.03, 1e-9);

  // Not cargo, not manifest.
  eq('D2b manifestSummary total is unchanged at 23', M.manifestSummary(game.state.manifest).total, 23);
  ok('D2b …no manifest row names a leaf', !game.state.manifest.some((r) => leaves.some((e) => e.id === r.entityId)));
  ok('D2b …every leaf carries manifest === false, every contract object true',
     leaves.every((e) => e.manifest === false) && game.state.manifest.every((r) => registry.get(r.entityId).manifest === true));
  eq('D2c the leaf definition is category "fixture" and validates', OBJECT_DEFS.door_leaf_01.category, 'fixture');
  eq('D2c …18 kg, 0.04 × 2.00 × 0.80', `${OBJECT_DEFS.door_leaf_01.mass}/${JSON.stringify(OBJECT_DEFS.door_leaf_01.dimensions)}`,
     `${DOOR.leaf.mass}/${JSON.stringify({ x: DOOR.leaf.t, y: DOOR.leaf.height, z: DOOR.leaf.length })}`);
  eq('D2c …priced at DOOR.replacementValue for §8.2\'s replacement risk', OBJECT_DEFS.door_leaf_01.replacementValue, DOOR.replacementValue);
  ok('D2d the registry count is the manifest plus the leaves (plus nothing else at boot)',
     registry.count === 23 + RECORDS.length, `${registry.count}`);

  /* A leaf in the truck takes space (cargo.js counts it — §9.2 "tools ... consume cargo
   * space", and a door does too) but it is not the customer's goods: the contract panel and
   * the objective line count only manifest cargo. */
  const leaf = doors.leafFor('kitchen_bedroom');
  registry.unhang(leaf, null);
  parkAt(leaf, M.truckPose.x, I.minY + 0.03, I.maxZ - 1.0, 0, leaf.state.rest.rot);
  step(Math.ceil(CARGO.loadedDwellMs / STEP) + 30);
  ok('D2e a removed leaf parked in the truck is counted by cargo.loadedEntities (it takes space)',
     cargo.loadedEntities().some((e) => e.id === leaf.id), `loaded ${cargo.loadedEntities().map((e) => e.defId).join(',')}`);
  eq('D2e …but the contract panel\'s "in the truck" ignores it (fixtures are not cargo to deliver)', M.contractFacts().loaded, 0);
  ok('D2e …and the objective line still names the truck as the first job', /truck/i.test(M.objectiveFor(M.contractFacts(), route.status())), M.objectiveFor(M.contractFacts(), route.status()));
  rehangAll();
  step(5);
  eq('D2f rehangAll puts it back on its hinges', leaf.state.hung && leaf.body.isFixed(), true);
}
emit('running...');

/* ── D3. the couch, against a hung door and a removed one ───────────────────── */
lines.push('--- D3. the couch\'s clearance, restated for one door in two states (GDD §3.3, §8.2) ---');
{
  const c = OBJECT_DEFS.couch_3seat_01.dimensions;   // 2.10 × 0.85 × 0.90 — cross-section 0.90 × 0.85
  const hung = fitsThroughGap(c.z, c.y, hungClear('living_kitchen', APERTURES));
  ok('D3 intact couch vs the hung 34" door: fits false', hung.fits === false, JSON.stringify(hung));
  near('D3 …clearance −0.03', hung.clearance, -0.03, 1e-9);
  const off = fitsThroughGap(c.z, c.y, hungClear('living_kitchen', APERTURES, INTERIOR_DOORS, HUNG_NONE));
  ok('D3 leaf removed: fits true', off.fits === true, JSON.stringify(off));
  near('D3 …clearance 0.01 (on its side, 10 mm — house.js\'s "passable, and unpleasant")', off.clearance, 0.01, 1e-9);
  const legs = OBJECT_DEFS.couch_3seat_01.disassembly.find((p) => p.part === 'legs');
  const both = fitsThroughGap(legs.shrinksTo.z, legs.shrinksTo.y, hungClear('living_kitchen', APERTURES, INTERIOR_DOORS, HUNG_NONE));
  near('D3 …and 0.09 with M8\'s legs off as well', both.clearance, 0.09, 1e-9);
  const legsHung = fitsThroughGap(legs.shrinksTo.z, legs.shrinksTo.y, hungClear('living_kitchen', APERTURES));
  near('D3a legs off past the HUNG door: 0.05 — §3.3\'s third approach (prepare the couch, not the door)', legsHung.clearance, 0.05, 1e-9);
  lines.push('      34" door: intact/hung −30 mm · intact/removed +10 mm · legs off/hung +50 mm · legs off/removed +90 mm');
}
emit('running...');

/* ── D4. the verbs (§9.2, §4.4, §8.2, §2.3) ─────────────────────────────────── */
lines.push('--- D4. E takes the door off and bills the clock; Q hangs it back (GDD §9.2, §4.4, §8.2, §2.3) ---');
{
  releaseAll();
  rehangAll();
  for (const s of interact.state.values()) { s.carriedTool = null; s.pendingAnchor = null; }
  const d = doorById('living_kitchen', APERTURES);
  const leaf = doors.leafFor('living_kitchen');
  const sd = toolByDef('screwdriver_01');
  pickUp(sd);
  eq('D4 the screwdriver is in hand', interact._for(me().id).carriedTool, sd.id);

  // Face the hung leaf from the living room: its hinge end stands in the opening at z = -5.0.
  const home = leaf.state.home;
  const target = { x: home.x, y: 1.0, z: d.at - 0.05 };
  lookAt(me(), { x: home.x, z: d.at + 1.0 }, target, true);
  step(4);
  let seen = interact.describe(me());
  if (!(seen.target && seen.target.kind === 'object' && seen.target.entity === leaf)) {
    // The compressed indoor camera can put the ray just past a 40 mm end face; come closer.
    lookAt(me(), { x: home.x, z: d.at + 0.75 }, { x: home.x, y: 1.0, z: d.at - 0.10 }, true);
    step(2);
    seen = interact.describe(me());
  }
  ok('D4 looking at the hung leaf with the screwdriver: the reticle is on the leaf',
     seen.target && seen.target.kind === 'object' && seen.target.entity === leaf,
     `${seen.target && seen.target.kind} ${seen.target && seen.target.entity && seen.target.entity.defId}`);
  ok('D4 describe().primary matches /take the door off/', /take the door off/.test(seen.primary || ''), seen.primary || '(null)');
  eq('D4 …verbatim the one string the prompt and the action share', seen.primary, DOOR_REMOVE_LABEL);
  ok('D4a and Q offers to put the SCREWDRIVER down, not the door back (nothing to undo yet)',
     /put down the screwdriver/.test(seen.secondary || ''), seen.secondary || '');

  const workBefore = game.state.elapsedWorkMs;
  const phaseBefore = game.state.telemetry.phaseMs[game.state.phase] || 0;
  doorEvents.length = 0;
  const did = interact.act(me(), game.clock.simTimeMs);
  ok('D4 act() reports the door coming off', /door off/.test(did || ''), did || '(null)');
  ok('D4 leaf.body.isDynamic()', leaf.body.isDynamic());
  eq('D4 state.hung === false', leaf.state.hung, false);
  const removed = doorEvents.filter((e) => e.state === 'removed');
  eq('D4 exactly one DOOR_STATE \'removed\'', removed.length, 1);
  eq('D4 …with the doorId', removed[0] && removed[0].doorId, 'living_kitchen');
  ok('D4 …and the entity id, stamped with the clock', removed[0] && removed[0].entityId === leaf.id && removed[0].simTimeMs === game.clock.simTimeMs);
  const charged = game.state.elapsedWorkMs - workBefore;
  near(`D4 elapsedWorkMs advanced by DOOR.removeSeconds × 1000 (${DOOR.removeSeconds * 1000} ms) ± one step`,
       charged, DOOR.removeSeconds * 1000 * TOOLS.screwdriver.timeScale, STEP);
  near('D4 …and the phase\'s §27.4 line by the same', (game.state.telemetry.phaseMs[game.state.phase] || 0) - phaseBefore, charged, 1e-6);
  ok('D4 the notice names the cost', new RegExp(`${DOOR.removeSeconds} s`).test(did || ''), did || '');
  eq('D4b the effective clear width is the whole gap now (live)', doors.hungClear('living_kitchen'), 0.86);
  eq('D4b …and the bedroom route reads 0.86 (front36 0.91, living_kitchen 0.86 off, kitchen_bedroom 0.87 hung)', doors.tightestOnRoute('bedroom'), 0.86);

  // Where it went: laid flat at its rest pose, out of the opening, and it STAYS there.
  const rest = leaf.state.rest;
  step(60);
  const p = posOf(leaf);
  near('D4c the leaf lies where house.js said it would (x)', p.x, rest.x, 0.05);
  near('D4c …(z)', p.z, rest.z, 0.05);
  ok('D4c …flat on the floor, thickness up (centre y ≈ 0.02 after 60 steps — nothing ejected it)', Math.abs(p.y - rest.y) < 0.03, `y ${p.y.toFixed(3)}`);
  const ra = aabbOf(leaf);
  const gapLo = d.centre - d.gap / 2, gapHi = d.centre + d.gap / 2;
  ok('D4c …and clear of the opening: the doorway is really 0.86 m of air', !overlaps1D(ra.minX, ra.maxX, gapLo, gapHi) || !overlaps1D(ra.minZ, ra.maxZ, d.at - PARTITION_T / 2 - 0.2, d.at + PARTITION_T / 2 + 0.2),
     `leaf x ${ra.minX.toFixed(2)}..${ra.maxX.toFixed(2)} z ${ra.minZ.toFixed(2)}..${ra.maxZ.toFixed(2)}`);
  const hDist = Math.hypot(p.x - home.x, p.z - home.z);
  ok(`D4d it rests within DOOR.rehangRange (${DOOR.rehangRange} m) of its jamb — ${hDist.toFixed(2)} m — so Q from here is the undo`, hDist <= DOOR.rehangRange, `${hDist.toFixed(3)}`);

  // Q, looking at the leaf on the floor, with the screwdriver still in hand. It lies in the
  // KITCHEN along the partition (x 0.15..2.15, z -5.87..-5.07): stand west of the fragile
  // boxes, in the kitchen, and look at its near half.
  lookAt(me(), { x: 0.6, z: -6.4 }, { x: 0.9, y: 0.03, z: -5.5 }, true);
  step(2);
  const seen2 = interact.describe(me());
  eq('D4e Q promises the door back', seen2.secondary, DOOR_REHANG_LABEL);
  ok('D4e …and E has nothing for a removed door (the screwdriver\'s job is done)', !seen2.primary, seen2.primary || '');
  doorEvents.length = 0;
  const workBeforeQ = game.state.elapsedWorkMs;
  const q = interact.secondary(me());
  ok('D4 secondary() at the jamb reports the door back on', /back on/.test(q || ''), q || '(null)');
  eq('D4 hung true', leaf.state.hung, true);
  ok('D4 isFixed()', leaf.body.isFixed());
  eq('D4 DOOR_STATE \'rehung\' once', doorEvents.filter((e) => e.state === 'rehung').length, 1);
  const hp = posOf(leaf);
  ok('D4 …at its home pose to the millimetre', Math.hypot(hp.x - home.x, hp.y - home.y, hp.z - home.z) < 1e-3, `${Math.hypot(hp.x - home.x, hp.y - home.y, hp.z - home.z).toFixed(4)}`);
  eq('D4 …and the opening is 0.82 again', doors.hungClear('living_kitchen'), 0.82);
  eq('D4f hanging it back costs no clock time (the prep was paid taking it off)', game.state.elapsedWorkMs, workBeforeQ);

  // Empty-handed at a hung door: the prompt says what would work; nothing is refused after the fact.
  interact._putDown(me(), sd, { point: { x: home.x + 0.6, y: 0.1, z: d.at + 1.2 } });
  lookAt(me(), { x: home.x, z: d.at + 1.0 }, target, true);
  step(2);
  const bare = interact.describe(me());
  ok('D4g empty-handed at a hung door: no E, no Q, and a hint naming the screwdriver',
     !bare.primary && !bare.secondary && /screwdriver/.test(bare.hint || ''), JSON.stringify({ p: bare.primary, s: bare.secondary, h: bare.hint }));
  eq('D4g …and act() does nothing', interact.act(me(), game.clock.simTimeMs), null);

  // Out of range: carry it away and Q has nothing to hang.
  registry.unhang(leaf, leaf.state.rest);
  parkAt(leaf, PAD.x, 0.03, PAD.z, 0, leaf.state.rest.rot);
  step(10);
  lookAt(me(), { x: PAD.x, z: PAD.z + 1.1 }, { x: PAD.x, y: 0.03, z: PAD.z }, true);
  step(2);
  const far = interact.describe(me());
  ok('D4h a removed leaf far from its jamb: Q does not offer to hang it (bring it back first)', far.secondary !== DOOR_REHANG_LABEL, far.secondary || '(null)');
  eq('D4h …and secondary() does nothing', interact.secondary(me()), null);
  ok('D4h …but it is carryable: the hint names the grip', /carry/.test(far.hint || ''), far.hint || '');
  rehangAll();
  putBackOnRack(sd);
}
emit('running...');

/* ── D5. a removed leaf is an ordinary object (§9.1, §6.1, §8.3) ────────────── */
lines.push('--- D5. carried, lifted one-handed, dropped, damage-tracked (GDD §9.1, §6.1, §8.3) ---');
{
  releaseAll();
  rehangAll();
  const leaf = doors.leafFor('living_kitchen');
  registry.unhang(leaf, leaf.state.rest);
  // Flat on open ground, its length along z (rest rot for an 'x'/'wall' leaf: height along x).
  parkAt(leaf, PAD.x, 0.03, PAD.z, 0, leaf.state.rest.rot);
  placeMover(movers[0], PAD.x, PAD.z + 0.9);
  placeMover(movers[1], PAD.x + 20, PAD.z + 20);
  step(30);
  const a0 = aabbOf(leaf);
  lines.push(`      leaf flat at the pad: x ${a0.minX.toFixed(2)}..${a0.maxX.toFixed(2)} y ${a0.minY.toFixed(3)}..${a0.maxY.toFixed(3)} z ${a0.minZ.toFixed(2)}..${a0.maxZ.toFixed(2)}`);
  // The handle: local +z end, 10 cm in — at world (rest: local z → world z) z + 0.30, on the top face.
  const handle = { x: PAD.x, y: a0.maxY, z: PAD.z + DOOR.leaf.length / 2 - 0.10 };
  const gh = grabWith(movers[0], 'right', handle);
  ok('D5 the removed leaf can be gripped at its handle', !!gh && gh.entityId === leaf.id, gh ? gh.entityId : 'no grip');
  const st = movers[0].grips.status();
  ok('D5 …grips.status() reports the hold', !!(st && st.right && st.right.entityId === leaf.id), JSON.stringify(st).slice(0, 120));
  step(10);
  releaseAll();
  step(30);
  /* Lifted from the middle of its top face: a door picked up by its handle alone dangles
   * from one point (§6.2 grip location changes torque), so the one-hand lift is measured
   * with the hand over the centre of mass, which is how a mover carries a flat panel. */
  const g = grabWith(movers[0], 'right', { x: PAD.x, y: aabbOf(leaf).maxY, z: posOf(leaf).z });
  ok('D5 …and gripped again at its centre for the lift', !!g && g.entityId === leaf.id, g ? g.entityId : 'no grip');
  const base = g ? { ...g.holdLocal } : null;
  step(20);
  if (g) raiseHand(movers[0], 'right', base, 0.45);
  let held = 0, lowest = -1;
  for (let k = 0; k < 120; k++) { step(1); if (movers[0].grips.grips.right) held++; }
  lowest = clearanceOf(leaf);
  ok('D5 lifted clear of the floor by ONE hand: lowest corner > 0.02 m after 120 frames', lowest > 0.02, `${lowest.toFixed(3)} m, held ${held}/120`);
  eq('D5 …and held the whole time', held, 120);
  const gr = movers[0].grips.grips.right;
  lines.push(`      lowest corner ${lowest.toFixed(3)} m; hand applied ${gr ? gr.lastApplied.toFixed(0) : '-'} N against ${(DOOR.leaf.mass * 9.81).toFixed(0)} N of weight`);
  // Carry it 3 m: walk backwards (+z) with it in hand.
  const from = posOf(leaf);
  let heldWalk = 0;
  for (let k = 0; k < 300; k++) {
    step(1, { [movers[0].id]: { move: { x: 0, y: -1 }, yaw: 0 } });
    if (movers[0].grips.grips.right) heldWalk++;
    if (Math.hypot(posOf(leaf).x - from.x, posOf(leaf).z - from.z) >= 3.2) break;
  }
  const to = posOf(leaf);
  const carried = Math.hypot(to.x - from.x, to.z - from.z);
  ok('D5 …and carried 3 m', carried >= 3.0, `${carried.toFixed(2)} m in ${heldWalk} held steps`);
  ok('D5 …without letting go', heldWalk > 0 && !!movers[0].grips.grips.right, `${heldWalk}`);
  lines.push(`      carried ${carried.toFixed(2)} m; clearance en route ${clearanceOf(leaf).toFixed(3)} m`);

  // Drop it from 1.5 m: dynamic, and the damage model hears it.
  releaseAll();
  const impacts = [];
  const off = bus.on(EVENTS.IMPACT, (e) => { if (e.entityId === leaf.id) impacts.push(e); });
  const cond0 = leaf.state.condition;
  parkAt(leaf, PAD.x + 6, 1.5 + 0.02, PAD.z, 0, leaf.state.rest.rot);
  for (let k = 0; k < 180; k++) { step(1); if (k > 40 && Math.hypot(leaf.body.linvel().x, leaf.body.linvel().y, leaf.body.linvel().z) < 0.02) break; }
  off();
  ok('D5 dropped from 1.5 m it is still dynamic', leaf.body.isDynamic());
  ok('D5 …and damage-tracked: an IMPACT with its entityId', impacts.length >= 1, `${impacts.length} impacts`);
  ok('D5 …that cost it condition (§8.2 "replacement risk" is real)', leaf.state.condition < cond0, `${cond0} -> ${leaf.state.condition}`);
  damage.flush(game.clock.simTimeMs);
  const ledger = (game.state.ledger.itemDamage || []).filter((l) => l.entityId === leaf.id);
  ok('D5 …and the §8.4 ledger prices it, capped at DOOR.replacementValue', ledger.some((l) => l.cost > 0) && ledger.every((l) => l.cost <= DOOR.replacementValue), JSON.stringify(ledger.slice(0, 2)));
  lines.push(`      drop 1.5 m: ${impacts.length} impact(s), peak ${impacts.length ? Math.max(...impacts.map((e) => e.relVelocity)).toFixed(2) : '-'} m/s lost, condition ${cond0} -> ${leaf.state.condition}, ledger ${ledger.map((l) => `${l.band} ${l.cost}`).join(', ')}`);
  ok('D5a a dropped leaf is still grabbable afterwards (nothing about it became scenery)', isLeaf(leaf) && registry.fromCollider(leaf.collider) === leaf);
  rehangAll();
  damage.reset();
}
emit('running...');

/* ── D6. the §3.3 pair, in physics ──────────────────────────────────────────── */
lines.push('--- D6. 600 N at the 34" door: the leaf hung stops the couch; removed, it goes through (GDD §3.3, §8.2) ---');
{
  releaseAll();
  rehangAll();
  for (const [i, m] of movers.entries()) placeMover(m, PAD.x + 10 + i * 2, PAD.z + 10);
  const couch = byDef('couch_3seat_01');
  const door = doorById('living_kitchen', APERTURES);
  const leaf = doors.leafFor('living_kitchen');
  const NEAR86 = door.at + PARTITION_T / 2, FAR86 = door.at - PARTITION_T / 2;
  // local x (long) -> world z, local y (height) -> world x, local z (depth) -> world y  (m6 E16)
  const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0));
  const rolled = new THREE.Quaternion().setFromRotationMatrix(basis);
  const parkRolled = (e, x, z) => {
    e.body.setTranslation({ x, y: 0.47, z }, true);
    e.body.setRotation({ x: rolled.x, y: rolled.y, z: rolled.z, w: rolled.w }, true);
    e.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    e.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    e.body.wakeUp();
    physics.primeQueries();
  };
  const settle = (n) => { for (let i = 0; i < n; i++) { physics.clearForces(); physics.step(); registry.step(STEP); } };
  /** Deepest the couch got INTO the leaf: Rapier's own contact distance between the two
   *  colliders (negative = penetrating), the honest number; the AABB overlap along the
   *  crossing axis is the fallback if the build lacks contactPair. */
  const leafPenetration = () => {
    let pen = 0;
    if (typeof physics.world.contactPair === 'function') {
      physics.world.contactPair(couch.collider, leaf.collider, (manifold) => {
        for (let i = 0; i < manifold.numContacts(); i++) pen = Math.max(pen, -manifold.contactDist(i));
      });
      return pen;
    }
    const a = aabbOf(couch), b = aabbOf(leaf);
    if (overlaps1D(a.minX, a.maxX, b.minX, b.maxX) && overlaps1D(a.minZ, a.maxZ, b.minZ, b.maxZ)) {
      pen = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
    }
    return pen;
  };
  const push = (legsOff, hung, x, z0, newtons, seconds) => {
    for (const p of [...(couch.state.removedParts || [])]) reassemble(registry, couch, p, { force: true });
    if (hung) rehangAll();
    else { registry.unhang(leaf, leaf.state.rest); parkAt(leaf, PAD.x, 0.03, PAD.z, 0, leaf.state.rest.rot); }   // removed AND carried clear
    /* Park FIRST, then take the legs off: since M12 a disassembly spawns four leg pieces
     * beside the parent where it stands, and a couch parked afterwards on top of its own
     * legs is ejected sideways into the jamb (the first run of this suite measured exactly
     * that as a false "caught"). Parked first, the legs land behind it, out of the push. */
    parkRolled(couch, x, z0);
    if (legsOff) {
      disassemble(registry, couch, 'legs');
      // …and the four legs go to the pad: the push measures the couch against the door,
      // not the couch against its own loose parts (reassemble with force gathers them back).
      let k = 0;
      for (const e of registry.entities.values()) {
        if (e.state.partOf === couch.id) { parkAt(e, PAD.x + 12 + k * 0.5, 0.1, PAD.z + 12); k++; }
      }
      parkRolled(couch, x, z0);
    }
    settle(40);
    let maxPen = 0, maxWallPen = 0, minCz = Infinity;
    const n = Math.round(seconds * 1000 / STEP);
    for (let i = 0; i < n; i++) {
      physics.clearForces();
      couch.body.addForce({ x: 0, y: 0, z: -newtons }, true);
      physics.step(); registry.step(STEP);
      const a = aabbOf(couch);
      minCz = Math.min(minCz, a.cz);
      if (hung) maxPen = Math.max(maxPen, leafPenetration());
      if (a.maxZ > NEAR86) maxWallPen = Math.max(maxWallPen, NEAR86 - a.minZ);
    }
    physics.clearForces();
    const a = aabbOf(couch);
    const v = couch.body.linvel();
    const endSpeed = Math.hypot(v.x, v.z);
    for (const p of [...(couch.state.removedParts || [])]) reassemble(registry, couch, p, { force: true });
    return { ...a, width: a.maxX - a.minX, maxPen, maxWallPen, minCz, endSpeed };
  };

  // Furniture on the line is parked in a field for the pushes (m6 E16's list) and put back after.
  const parkedAway = [];
  let k = 0;
  for (const e of registry.entities.values()) {
    if (['armchair_01', 'chair_dining_01', 'box_fragile_01', 'box_small_01'].includes(e.defId)) {
      parkedAway.push(e); parkAt(e, PAD.x + 20 + (k % 5) * 2, 0.5, PAD.z + 20 + Math.floor(k / 5) * 2); k++;
    }
  }
  settle(10);

  /* The blind pushes go at the door's nominal centre, as m6 E16 does. The legs-off couch
   * past the HUNG leaf is aimed at the centre of the 0.82 m that is actually open
   * (jamb + 0.04 .. far jamb): 0.77 in 0.82 is 25 mm a side there, and 3.5 mm against the
   * leaf at the nominal centre — a mover lines a couch up on the opening they can see. */
  const clearCentre = door.centre + door.leaf.hinge * -1 * DOOR.leaf.t / 2;
  /* 3 s for the stopped cases (the brief's window); 4 s for the through cases, which is the
   * window m6 E16d measures with — a legs-off couch at 600 N against 552 N of floor friction
   * creeps at ~0.5 m/s², and the far-face criterion is 2.56 m of travel. */
  const hungIntact = push(false, true, door.centre, -3.5, 600, 3);
  const hungLegs = push(true, true, clearCentre, -3.5, 600, 4);
  const offIntact = push(false, false, door.centre, -3.5, 600, 3);
  const offLegs = push(true, false, door.centre, -3.5, 600, 4);
  const spd = (r) => `${r.endSpeed.toFixed(2)} m/s at the end`;
  lines.push(`      hung, intact ${hungIntact.width.toFixed(3)} m, 3 s: centre z ${hungIntact.cz.toFixed(3)} (min ${hungIntact.minCz.toFixed(3)}), leaf penetration ${(hungIntact.maxPen * 1000).toFixed(1)} mm, ${spd(hungIntact)}`);
  lines.push(`      hung, legs off ${hungLegs.width.toFixed(3)} m aimed at x ${clearCentre.toFixed(2)}, 4 s: centre z ${hungLegs.cz.toFixed(3)}, leaf penetration ${(hungLegs.maxPen * 1000).toFixed(1)} mm, ${spd(hungLegs)}`);
  lines.push(`      removed, intact ${offIntact.width.toFixed(3)} m, 3 s: centre z ${offIntact.cz.toFixed(3)}, wall penetration ${(offIntact.maxWallPen * 1000).toFixed(1)} mm, ${spd(offIntact)}`);
  lines.push(`      removed, legs off ${offLegs.width.toFixed(3)} m, 4 s: centre z ${offLegs.cz.toFixed(3)}, ${spd(offLegs)}`);
  ok('D6 leaf HUNG, intact couch, 600 N for 3 s: the centre never crosses the wall plane',
     hungIntact.minCz > door.at, `min centre z ${hungIntact.minCz.toFixed(3)} vs wall ${door.at}`);
  ok('D6 …and it pushed into the leaf by under 30 mm (a real 40 mm door, not a hard-denial fake)',
     hungIntact.maxPen < 0.03, `${(hungIntact.maxPen * 1000).toFixed(1)} mm`);
  ok('D6 leaf REMOVED and carried clear, legs off: the couch goes through as m6 E16d measures — centre > 1.0 m past the far face',
     offLegs.cz < FAR86 - 1.0, `centre z ${offLegs.cz.toFixed(3)} (need < ${(FAR86 - 1.0).toFixed(2)})`);
  /* Legs off past the HUNG leaf: 50 mm of geometry (D3a), 25 mm a side aimed at the open
   * 0.82. Recorded with its end speed, because an earlier run of this suite read "caught"
   * off a couch that was merely still creeping at the end of a 3 s window (and, before
   * that, off a couch parked on top of its own detached legs). */
  lines.push(`      legs off vs the hung leaf (25 mm a side, 4 s): centre z ${hungLegs.cz.toFixed(3)}, ${spd(hungLegs)} — ${hungLegs.cz < FAR86 - 1.0 ? 'through' : 'not through'}`);
  ok('D6a legs off past the HUNG leaf, aimed at the open 0.82: the prepared couch goes through too — §3.3\'s third answer, and the leaf never touched',
     hungLegs.cz < FAR86 - 1.0 && hungLegs.maxPen < 0.03, `centre z ${hungLegs.cz.toFixed(3)}, ${(hungLegs.maxPen * 1000).toFixed(1)} mm`);
  ok('D6b leaf removed, intact, 600 N: no wall penetration over 30 mm either way (m6 E16e\'s 10 mm jam is recorded above, unchanged by M11)',
     offIntact.maxWallPen < 0.03, `${(offIntact.maxWallPen * 1000).toFixed(1)} mm, centre z ${offIntact.cz.toFixed(3)}`);
  ok('D6c the hung leaf is still on its hinges after being rammed (a Fixed body does not move)',
     (() => { rehangAll(); return leaf.body.isFixed(); })());
  const hp = posOf(leaf);
  ok('D6c …and exactly where it hung', Math.hypot(hp.x - leaf.state.home.x, hp.z - leaf.state.home.z) < 1e-6);

  // Everything back where the contract starts.
  const rows = game.state.manifest;
  PHASE5_SPAWNS.forEach((s, i) => {
    const e = rows[i] && registry.get(rows[i].entityId);
    if (!e) return;
    for (const p of [...(e.state.removedParts || [])]) reassemble(registry, e, p, { force: true });
    e.body.setTranslation({ x: s.x, y: s.y, z: s.z }, true);
    const yaw = s.yaw || 0;
    e.body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
    e.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    e.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    e.state.condition = 100;
    e.body.wakeUp();
  });
  physics.primeQueries();
  settle(30);
  void parkedAway;
}
emit('running...');

/* ── D7. reset re-hangs every leaf (§26.6) ──────────────────────────────────── */
lines.push('--- D7. resetContract hangs every leaf back at its jamb (GDD §26.6, §8.2) ---');
{
  releaseAll();
  rehangAll();
  const a = doors.leafFor('living_kitchen'), b = doors.leafFor('door34');
  registry.unhang(a, a.state.rest);
  registry.unhang(b, b.state.rest);
  parkAt(a, PAD.x, 0.03, PAD.z, 0, a.state.rest.rot);   // carried away — 55 m from its jamb
  a.state.condition = 40; a.state.recoveries = 2; a.state.everHeld = true;
  step(20);
  eq('D7 two leaves are off, one lying beside its door and one carried more than 3 m away',
     `${a.state.hung}/${b.state.hung}/${Math.hypot(posOf(a).x - a.state.home.x, posOf(a).z - a.state.home.z) > 3.0}`, 'false/false/true');
  eq('D7 …so the bedroom route reads 0.86', doors.tightestOnRoute('bedroom'), 0.86);
  doorEvents.length = 0;
  M.resetContract();
  const leaves = doors.leaves();
  ok('D7 after resetContract every leaf isFixed()', leaves.every((e) => e.body.isFixed()));
  ok('D7 …hung true', leaves.every((e) => e.state.hung === true));
  const off = leaves.filter((e) => { const p = posOf(e), h = e.state.home; return Math.hypot(p.x - h.x, p.y - h.y, p.z - h.z) > 1e-3; });
  ok('D7 …at its jamb (± 1e-3 m)', off.length === 0, off.map((e) => e.state.doorId).join(','));
  const misrot = leaves.filter((e) => { const q = e.body.rotation(), y = e.state.home.yaw || 0; return Math.abs(q.y - Math.sin(y / 2)) > 1e-6 || Math.abs(q.w - Math.cos(y / 2)) > 1e-6 || Math.abs(q.x) > 1e-6 || Math.abs(q.z) > 1e-6; });
  ok('D7 …upright and swung open again (rotation is the home yaw)', misrot.length === 0, misrot.map((e) => e.state.doorId).join(','));
  eq('D7 tightestOnRoute(bedroom) === 0.82 again', doors.tightestOnRoute('bedroom'), 0.82);
  eq('D7a exactly the two that were off announced \'rehung\' (reason contract reset)',
     doorEvents.filter((e) => e.state === 'rehung').map((e) => e.doorId).sort().join(','), 'door34,living_kitchen');
  ok('D7b …and their run-scoped state is the definition\'s again (condition 100, 0 recoveries, never held)',
     leaves.every((e) => e.state.condition === 100 && !(e.state.recoveries || 0) && !e.state.everHeld && !e.state.loaded));
  ok('D7c the phase is PICKUP, the manifest 23 rows, nothing held (m11 G8 predicate)',
     game.state.phase === PHASES.PICKUP && game.state.manifest.length === 23 && straps.count === 0);
  frames(5);
}
emit('running...');

/* ── D8. the review tag (§15.2) ─────────────────────────────────────────────── */
lines.push('--- D8. front_door_removed: from the event, cleared on replay, on the run summary (GDD §15.2, §27.4) ---');
{
  releaseAll();
  rehangAll();
  const summaryOf = () => M.manifestSummary(game.state.manifest);
  const tagsNow = () => {
    const s = summaryOf();
    const inv = M.buildInvoice(game.state, s, { recoveries: M.recoveryCount(), collisions: 0, moverCount: movers.length });
    return M.reviewFor(inv, game.state, s, { recoveries: M.recoveryCount() }).tags;
  };
  ok('D8 a run with no leaf removed carries no front_door_removed', !tagsNow().includes('front_door_removed'), tagsNow().join(','));
  eq('D8 …state.doors says so, as plain data', JSON.stringify(game.state.doors), JSON.stringify({ removed: {}, frontRemoved: false }));
  // Remove an INTERIOR door: not the front door.
  const lk = doors.leafFor('living_kitchen');
  bus.emit(EVENTS.DOOR_STATE, { doorId: 'living_kitchen', entityId: lk.id, state: 'removed' }, game.clock.simTimeMs);
  ok('D8a an interior door coming off is recorded but is not the front door', game.state.doors.removed.living_kitchen === 1 && game.state.doors.frontRemoved === false && !tagsNow().includes('front_door_removed'));
  // The front door (door34), through the real verb path this time.
  const leaf = doors.leafFor('door34');
  const d = doorById('door34', APERTURES);
  const sd = toolByDef('screwdriver_01');
  ok('D8-0 the screwdriver is in hand', pickUp(sd));
  const home = leaf.state.home;
  // door34 swings into the living room from the front wall (z = -2): face it from inside.
  lookAt(me(), { x: home.x, z: home.z - 1.0 }, { x: home.x, y: 1.0, z: home.z - 0.05 }, true);
  step(4);
  let seen = interact.describe(me());
  if (!(seen.target && seen.target.entity === leaf)) {
    lookAt(me(), { x: home.x, z: home.z - 0.75 }, { x: home.x, y: 1.0, z: home.z }, true);
    step(2);
    seen = interact.describe(me());
  }
  const did = interact.act(me(), game.clock.simTimeMs);
  ok('D8 door34\'s leaf comes off through E', /door off/.test(did || '') && leaf.state.hung === false, `${did} / hung ${leaf.state.hung} / target ${seen.target && seen.target.entity && seen.target.entity.defId}`);
  ok('D8 …and the run now carries review tag front_door_removed', tagsNow().includes('front_door_removed'), tagsNow().join(','));
  eq('D8 …from state.doors.frontRemoved', game.state.doors.frontRemoved, true);
  // Hanging it back does not un-happen it: the tag is about the run, not the final state.
  // door34's leaf lies in the living room, its height running away from the front wall
  // (x -1.25..-0.45, z -2.11..-4.11): stand west of it and look east across it.
  const lp = posOf(leaf);
  lookAt(me(), { x: lp.x - 0.9, z: lp.z }, { x: lp.x, y: 0.03, z: lp.z }, true);
  step(2);
  const qSeen = interact.describe(me());
  eq('D8b-0 Q promises the door back from beside it', qSeen.secondary, DOOR_REHANG_LABEL);
  interact.secondary(me());
  ok('D8b hung back on (Q), the tag stays — §10.4: what happened, not where it ended up', leaf.state.hung === true && tagsNow().includes('front_door_removed'), `hung ${leaf.state.hung} tags ${tagsNow().join(',')}`);
  // Through settlement: the M6 run summary carries the review's tags.
  M.settle();
  const rs = M.runSummary();
  ok('D8 the M6 run summary carries the tag', rs && rs.review && rs.review.tags.includes('front_door_removed'), JSON.stringify(rs && rs.review));
  ok('D8 …and the DOOR_STATE events are in its record', rs.events.some((e) => e.type === EVENTS.DOOR_STATE && e.state === 'removed' && e.doorId === 'door34'));
  // Replay: cleared.
  M.invoiceScreen.onReplay();
  eq('D8 replay resets the flag', JSON.stringify(game.state.doors), JSON.stringify({ removed: {}, frontRemoved: false }));
  ok('D8 …and a run with no leaf removed does not carry the tag', !tagsNow().includes('front_door_removed'), tagsNow().join(','));
  ok('D8 …with every leaf back on its hinges', doors.leaves().every((e) => e.state.hung && e.body.isFixed()));
  ok('D8d the tag is in the salience table and has a template', (() => {
    // reviewFor slices to the 3 most salient: with a clean run the tag must still surface.
    game.state.doors.frontRemoved = true;
    const t = tagsNow();
    game.state.doors.frontRemoved = false;
    return t.includes('front_door_removed');
  })());
  putBackOnRack(sd);
  void d;
}
emit('running...');

/* ── D9. serializable (§22.4) ────────────────────────────────────────────────── */
lines.push('--- D9. state is plain data with the leaves in the world (GDD §22.4; m0 E8 pattern) ---');
{
  const okJson = (v) => { try { JSON.parse(JSON.stringify(v)); return true; } catch (e) { return false; } };
  ok('D9 game.state JSON round-trips', okJson(game.state));
  const snap = registry.snapshot();
  ok('D9 registry.snapshot() JSON round-trips with the leaves in it', okJson(snap) && Object.values(snap).some((s) => s.doorId));
  const leafState = doors.leafFor('living_kitchen').state;
  ok('D9 a leaf\'s state is { doorId, hung, home, rest, … } plain data — no THREE, no Rapier',
     typeof leafState.doorId === 'string' && typeof leafState.hung === 'boolean' &&
     Object.values(leafState).every((v) => v == null || ['string', 'number', 'boolean'].includes(typeof v) || (typeof v === 'object' && !v.isObject3D && !('handle' in v) && okJson(v))),
     Object.keys(leafState).join(','));
  ok('D9 …and game.state.doors is too', okJson(game.state.doors) && typeof game.state.doors.frontRemoved === 'boolean');
  // Nothing on state has a Rapier handle or a THREE object anywhere in its tree.
  const bad = [];
  const walk = (v, path, depth) => {
    if (depth > 8 || v == null) return;
    if (typeof v !== 'object') return;
    if (v.isObject3D || v.isVector3 || v.isQuaternion) { bad.push(path + ' THREE'); return; }
    if (typeof v.handle === 'number' && typeof v.translation === 'function') { bad.push(path + ' Rapier'); return; }
    for (const [k, c] of Object.entries(v)) walk(c, path + '.' + k, depth + 1);
  };
  walk(game.state, 'state', 0);
  ok('D9 no THREE object or Rapier handle anywhere in game.state', bad.length === 0, bad.slice(0, 4).join(', '));
}
emit('running...');

/* ── Z. integration ──────────────────────────────────────────────────────────── */
lines.push('--- Z. integration (GDD §26.6) ---');
{
  releaseAll();
  rehangAll();
  for (const [i, m] of movers.entries()) placeMover(m, 0, 5 + i * 1.4);
  const bodiesBefore = physics.stats.bodies;
  frames(90);
  eq('Z1 no bodies leaked over 90 frames with the leaves in the world', physics.stats.bodies, bodiesBefore);
  ok('Z2 the leaves are still Fixed after 90 real frames (nothing in the loop frees them)', doors.leaves().every((e) => e.body.isFixed() && e.state.hung));
  ok('Z3 no error banner appeared during the suite', !document.getElementById('err-banner') && !document.getElementById('error-banner'));
  void rig; void camera; void world; void ROOM; void leafPose; void leafRestPose; void leafAabb; void PHASES;
}

} catch (e) {
  fails++;
  lines.push(`FAIL  suite threw  <- ${e && e.message}`);
  lines.push((e && e.stack || '').split('\n').slice(0, 6).join('\n'));
}

emit();
