/* Phase 11 build-side M32 suite — the world's edges: where a removed leaf goes, and what the
 * bottom band does in a window narrower than the harness's.
 *
 * GDD §8.2 "remove from hinges" (where the leaf goes); §7.3 "stable resting" (no solver
 * separation); §21.1 "the working area is never covered"; §21.4 Vision "scalable UI" (a narrow
 * window IS a scaled UI); §26.6 "no soft locks"; §25.3 "known limitations closed".
 *
 * THREE RECORDED FACTS, closed:
 *
 *   1  KNOWN_ISSUES Phase 20 (M11) "the rest spot is not checked at removal" — E laid the leaf
 *      on ONE authored strip whether or not a mover or a box was standing there, and the solver
 *      separated them over the next few steps. KNOWN_ISSUES Phase 26 (M23) "a forced leaf goes
 *      to M11's rest pose" is the SAME unchecked number reached by the other door. Now one
 *      chooser (interact.js chooseLeafRest) sweeps config DOOR.restCandidates with M23's own
 *      occupancy primitive and takes the first clear strip; E and a forcing both call it.
 *   2  KNOWN_ISSUES Phase 20 (M11) "the 32-inch front aperture's leaf swings out onto the grass
 *      and lies there when removed" — 18 kg of door on the lawn, where §18.3's recovery sweep
 *      and the truck's route meet. Its whole candidate list is inside WORLD.porchBounds now.
 *   3  KNOWN_ISSUES Phase 25 (M22) "first-minute card vs the bottom-centre band in narrow
 *      viewports" — recorded and UNMEASURED, because the harness cannot resize its window.
 *
 *   E0  the strips validate: candidate 0 IS M11's pose, every candidate is outside every
 *       doorway clear box (m13 B1's predicate) and inside RECOVERY.bounds, and the option list
 *       is deterministic
 *   E1  rest strip: a box on the hinge-side strip → the latch-side strip, nothing separated;
 *       every strip taken → further along, and the notice says so; nothing taken → M11's pose
 *   E2  forcing shares the chooser: m30 D1's shove with a box on the hinge strip → the forced
 *       leaf takes the latch strip, and D1's ledger / DOOR_STATE / hungClear are unchanged
 *   E3  the front leaf stays on the porch, whichever way it comes off, and never needs recovery
 *   E4  the bottom band at three EMULATED widths: no rect intersection among the card, the
 *       caption, the route bar and the help line
 *
 * THE WIDTH EMULATION, AND WHAT IT IS WORTH. Headless Chrome under --dump-dom gives this
 * harness a fixed 1262 px viewport and no way to resize it, which is exactly why M22's entry
 * sat unmeasured for two phases. So E4 narrows the UI ROOT instead: `#ui` is
 * `position: fixed; inset: 0`, so its content box IS the viewport in a real window, and every
 * box in the band — the HUD (`.hud { inset: 0 }`), the help line, the card — is laid out
 * against it. Setting `#ui { width: 800px }` therefore gives every one of them an honest
 * 800 px band to lay out in, and the layout rule under test reads that same width
 * (walkthrough.js bandWidth). M32 changed two viewport-relative caps to percentages of the
 * containing block (styles.css `#help` max-width and `#walkthrough` width) so the emulation is
 * not half-honest; both are the same number in a real window.
 *   WHAT IT DOES NOT COVER: `window.innerWidth` / `innerHeight` and any `vw`/`vh` left in the
 * sheet do not move (the settlement sheet's `min(760px, 96vw)` is one, and it is a full-screen
 * panel that never shares this band), and the BAND'S HEIGHT is the real viewport's throughout.
 * A genuinely short window is still unmeasured here.
 *
 * Fixtures: m19's door verbs and screwdriver pickup, m30's shove and throwAt, m29's card
 * helpers. Drives game.frame() / the systems directly — never waits for requestAnimationFrame.
 */

// FIRST, before boot reaches the walkthrough (m29 W0's note on why this is safe here).
try { history.replaceState(null, '', location.pathname + '?walkthrough=1'); } catch (e) { /* the suite still runs */ }

import { SIM, DOOR, DAMAGE, WORLD, RECOVERY, WALKTHROUGH, TOOLS } from '../src/config.js';
import { APERTURES } from '../src/render/scene.js';
import {
  ZONES, INTERIOR_DOORS, doorById, leafDoors, doorRecords, hungClear, tightestOnRoute,
  leafPose, leafRestPose, leafRestPoseOn, leafRestOptions, restCandidatesFor, restCandidateProblems,
} from '../src/world/house.js';
import { chooseLeafRest, boxBlocked, DOOR_REST_MOVED_SAID, isLeaf } from '../src/player/interact.js';
import { cargoInterior, TRUCK_POSE } from '../src/world/truck.js';
import { doorFrameTag } from '../src/damage/surfaces.js';
import { EVENTS } from '../src/core/eventBus.js';
import { GROUP_PRESETS } from '../src/physics/world.js';
import { clearSave } from '../src/core/save.js';

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

const { game, physics, registry, movers, tools, straps, cargo, damage, interact, doors, huds, hud, title } = M;
const W = M.walkthrough;
const bus = game.bus;
const STEP = SIM.stepMs;
const FRAME = 16.667;
const R = physics.R;
const F = DAMAGE.property.doorFrame;
const me = () => movers[M.activeMoverIndex];

/* ── drivers (m19 / m30 lineage, verbatim in spirit) ───────────────────────────────── */
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
function frame(n = 1) { for (let k = 0; k < n; k++) game.frame(FRAME); }
function settle(n) { for (let i = 0; i < n; i++) { physics.clearForces(); physics.step(); registry.step(STEP); } }
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
function drainNotices() { const n = M.pendingNotices.length; M.pendingNotices.splice(0, n); return n; }
const prop = () => game.state.ledger.propertyDamage;
const sumCost = (ls) => Number(ls.reduce((s, l) => s + l.cost, 0).toFixed(2));
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const PAD = { x: 40, z: -40 };
function parkMoversAway() { for (const [i, m] of movers.entries()) placeMover(m, PAD.x + 10 + i * 2, PAD.z + 10); }
function rehangAll() { doors.rehangAll('test reset'); }

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
/** m19's screwdriver pickup: from open ground with an exact aim. */
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

/** The world AABB of a leaf's collider under its current rotation (m19 aabbOf). */
const THREE = window.THREE;
function aabbOf(e) {
  const q = e.body.rotation();
  const el = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w)).elements;
  const he = e.collider.halfExtents();
  const t = e.body.translation();
  const ex = Math.abs(el[0]) * he.x + Math.abs(el[4]) * he.y + Math.abs(el[8]) * he.z;
  const ey = Math.abs(el[1]) * he.x + Math.abs(el[5]) * he.y + Math.abs(el[9]) * he.z;
  const ez = Math.abs(el[2]) * he.x + Math.abs(el[6]) * he.y + Math.abs(el[10]) * he.z;
  return { minX: t.x - ex, maxX: t.x + ex, minY: t.y - ey, maxY: t.y + ey, minZ: t.z - ez, maxZ: t.z + ez };
}
/** Horizontal separation between two AABBs: negative when they overlap. */
function gapBetween(a, b) {
  const gx = Math.max(a.minX - b.maxX, b.minX - a.maxX);
  const gz = Math.max(a.minZ - b.maxZ, b.minZ - a.maxZ);
  return Math.max(gx, gz);
}
const boxOfOption = (o) => ({ minX: o.pose.x - o.half.x, maxX: o.pose.x + o.half.x,
                              minZ: o.pose.z - o.half.z, maxZ: o.pose.z + o.half.z });
const inside2D = (a, b) => a.minX >= b.minX && a.maxX <= b.maxX && a.minZ >= b.minZ && a.maxZ <= b.maxZ;
const hits2D = (a, b) => a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ;

/** Spare registry bodies to stand on a strip with. */
function spareBoxes(n) {
  const out = [];
  for (const e of registry.entities.values()) {
    if (isLeaf(e) || e.def.category === 'part') continue;
    if (!/^box_/.test(e.defId)) continue;
    out.push(e);
    if (out.length === n) break;
  }
  return out;
}
/** Stand `e` on the middle of a strip (or at `frac` along it), on the floor. */
function standOn(e, option, frac = 0.5) {
  const b = boxOfOption(option);
  const x = b.minX + (b.maxX - b.minX) * frac;
  const z = b.minZ + (b.maxZ - b.minZ) * frac;
  parkAt(e, x, e.def.dimensions.y / 2 + 0.01, z);
  settle(6);
  return posOf(e);
}

/* Bus spies. */
const doorEvents = [];
bus.on(EVENTS.DOOR_STATE, (e) => doorEvents.push({ ...e }));
const recoveries = [];
bus.on(EVENTS.RECOVERY, (e) => recoveries.push({ ...e }));

const RECORDS = leafDoors(APERTURES);
const LK = doorById('living_kitchen', APERTURES);
const I32 = doorById('interior32', APERTURES);

if (game.state.paused) game.setPaused(false);
const bodiesAtBoot = physics.stats.bodies;
lines.push(`      boot: bodies ${bodiesAtBoot}, registry ${registry.count}, DOOR.restSearchM ${DOOR.restSearchM}, ` +
           `restSearchStepM ${DOOR.restSearchStepM}, occupancyMargin ${DOOR.occupancyMargin}, ` +
           `WALKTHROUGH.narrowPx ${WALKTHROUGH.narrowPx}, bandGapPx ${WALKTHROUGH.bandGapPx}`);

try {
/* ── E0. the strips validate (§24.4 content validators, m13 B1, M15 bounds) ────────── */
lines.push('--- E0. every authored rest strip is legal: candidate 0 is M11\'s pose, all are outside every doorway clear box and inside RECOVERY.bounds (GDD §8.2, §26.6) ---');
{
  const problems = restCandidateProblems(APERTURES);
  ok('E0 restCandidateProblems(APERTURES) is empty — the boot check §24.4 asks for', problems.length === 0, problems.join(' | '));
  eq('E0a four doors carry a leaf, and every one has a candidate list', RECORDS.length, 4);
  const noList = RECORDS.filter((d) => !DOOR.restCandidates[d.id]);
  ok('E0a …named in config DOOR.restCandidates, not defaulted', noList.length === 0, noList.map((d) => d.id).join(','));
  const short = RECORDS.filter((d) => restCandidatesFor(d).length < 3);
  ok('E0b …each with at least three strips (hinge jamb, latch jamb, further along)', short.length === 0,
     short.map((d) => `${d.id}:${restCandidatesFor(d).length}`).join(','));

  /* CANDIDATE 0 IS M11'S POSE for the three leaves M11 authored a good spot for — the whole
   * reason m5 DL and m19 D4c read the same numbers as before. interior32's is deliberately
   * NOT: M11 laid it on the lawn (E3). */
  for (const d of RECORDS) {
    const c0 = leafRestPoseOn(d, restCandidatesFor(d)[0]);
    const live = leafRestPose(d);
    ok(`E0c ${d.id}: leafRestPose IS candidate 0 (to 1e-9)`,
       Math.abs(c0.x - live.x) < 1e-9 && Math.abs(c0.z - live.z) < 1e-9 && Math.abs(c0.y - live.y) < 1e-9,
       `${JSON.stringify(c0)} vs ${JSON.stringify(live)}`);
  }
  const m11Pose = (d) => {
    // M11's formula, restated here so the suite is not asserting house.js against itself.
    const L = d.leaf, len = DOOR.leaf.length, H = DOOR.leaf.height, pad = DOOR.restPad;
    const alongLen = L.lay === 'wall' ? H : len, acrossLen = L.lay === 'wall' ? len : H;
    const jamb = d.centre + L.hinge * d.gap / 2;
    const along = jamb + L.hinge * (pad + alongLen / 2);
    const across = d.at + L.swing * (d.wallT / 2 + pad + acrossLen / 2);
    return { x: d.axis === 'x' ? along : across, z: d.axis === 'x' ? across : along };
  };
  for (const d of RECORDS.filter((r) => r.id !== 'interior32')) {
    const a = m11Pose(d), b = leafRestPose(d);
    ok(`E0d ${d.id}: …and that pose is M11's, unmoved (1e-6)`, Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.z - b.z) < 1e-6,
       `${a.x.toFixed(6)},${a.z.toFixed(6)} vs ${b.x.toFixed(6)},${b.z.toFixed(6)}`);
  }
  const i32m11 = m11Pose(I32), i32now = leafRestPose(I32);
  ok('E0e interior32 is the ONE that moved (M11 laid it 170 mm past the porch\'s west edge)',
     Math.abs(i32m11.x - i32now.x) > 0.4, `M11 x ${i32m11.x.toFixed(3)} → now ${i32now.x.toFixed(3)}`);

  // Every candidate of every door, printed, with its bounds and doorway-box verdict.
  const doorBoxes = doorRecords(APERTURES).map((d) => {
    const w = (d.gap - 0.04) / 2;
    return d.axis === 'x'
      ? { id: d.id, minX: d.centre - w, maxX: d.centre + w, minZ: d.at - 0.20, maxZ: d.at + 0.20 }
      : { id: d.id, minX: d.at - 0.20, maxX: d.at + 0.20, minZ: d.centre - w, maxZ: d.centre + w };
  });
  const inDoor = [], outOfBounds = [];
  for (const d of RECORDS) {
    for (const o of leafRestOptions(d).filter((x) => !x.searched)) {
      const a = boxOfOption(o);
      for (const b of doorBoxes) if (hits2D(a, b)) inDoor.push(`${d.id}/${o.id} in ${b.id}`);
      if (!inside2D(a, RECOVERY.bounds)) outOfBounds.push(`${d.id}/${o.id}`);
      lines.push(`      ${d.id}/${o.id} (shift ${o.shift.toFixed(2)}) x ${a.minX.toFixed(3)}..${a.maxX.toFixed(3)} z ${a.minZ.toFixed(3)}..${a.maxZ.toFixed(3)}`);
    }
  }
  ok('E0f no authored strip reaches into ANY doorway\'s clear box (m13 B1\'s predicate)', inDoor.length === 0, inDoor.join(' | '));
  ok('E0g …and every one is inside RECOVERY.bounds (M15: a strip off the plot is a soft lock)', outOfBounds.length === 0, outOfBounds.join(' | '));

  /* DETERMINISM (m14's soak equality): the option list is a pure function of the door. */
  const a1 = JSON.stringify(leafRestOptions(LK)), a2 = JSON.stringify(leafRestOptions(LK));
  eq('E0h leafRestOptions is deterministic — same door, same list', a1, a2);
  const opts = leafRestOptions(LK);
  eq('E0i …authored first, in config order', opts.slice(0, 3).map((o) => o.id).join(','),
     restCandidatesFor(LK).map((c) => c.id).join(','));
  const rungs = Math.floor(DOOR.restSearchM / DOOR.restSearchStepM);
  eq(`E0j …then the search ladder: ${rungs} rungs x ${restCandidatesFor(LK).length} strips`,
     opts.length, restCandidatesFor(LK).length * (rungs + 1));
  // "Nearest rung first" is about the EXTRA shift the ladder adds, not the strip's own base.
  const extraOf = (o) => Number((o.shift - (restCandidatesFor(LK)[o.index].shift || 0)).toFixed(6));
  ok('E0k …the ladder is NEAREST RUNG FIRST', opts.filter((o) => o.searched).every((o, i, all) => i === 0 || extraOf(all[i - 1]) <= extraOf(o) + 1e-9),
     opts.filter((o) => o.searched).slice(0, 8).map((o) => `${o.id}+${extraOf(o)}`).join(' '));
  const worst = opts.reduce((s, o) => Math.max(s, extraOf(o)), 0);
  near('E0l …and never further along than DOOR.restSearchM', worst, DOOR.restSearchM, 1e-6);
}
emit('E1...');

/* ── E1. the rest strip is checked at removal (§8.2, §7.3, §2.1) ───────────────────── */
lines.push('--- E1. E at the leaf picks a CLEAR strip: hinge occupied → latch; all occupied → further along; nothing occupied → M11\'s pose (GDD §8.2, §7.3) ---');
{
  const sd = toolByDef('screwdriver_01');
  const opts = leafRestOptions(LK).filter((o) => !o.searched);
  const [C0, C1] = opts;
  const leafOf = () => doors.leafFor('living_kitchen');

  /** Stand at the door in the living room with the screwdriver and press E. */
  function removeWithE() {
    const leaf = leafOf();
    const home = leaf.state.home;
    lookAt(me(), { x: home.x, z: LK.at + 1.0 }, { x: home.x, y: 1.0, z: LK.at - 0.05 });
    step(4);
    let seen = interact.describe(me());
    if (!(seen.target && seen.target.kind === 'object' && seen.target.entity === leaf)) {
      lookAt(me(), { x: home.x, z: LK.at + 0.75 }, { x: home.x, y: 1.0, z: LK.at - 0.10 });
      step(2);
      seen = interact.describe(me());
    }
    const said = interact.act(me(), game.clock.simTimeMs);
    return { leaf, said, aimed: !!(seen.target && seen.target.entity === leaf) };
  }

  /* --- E1a: nothing on any strip → M11's pose, to 1e-6 (the baseline m19 D4c pins). --- */
  releaseAll(); rehangAll(); parkMoversAway(); drainNotices();
  for (const e of spareBoxes(4)) parkAt(e, PAD.x + 14 + (spareBoxes(4).indexOf(e) * 1.2), 0.30, PAD.z + 14);
  settle(10);
  ok('E1 fixture: the screwdriver is in hand', pickUp(sd));
  const clean = removeWithE();
  ok('E1 fixture: the reticle was on the hung leaf', clean.aimed, clean.said || '(null)');
  ok('E1a nothing occupied → the leaf goes to M11\'s authored strip', clean.leaf.state.restChoice && clean.leaf.state.restChoice.index === 0,
     JSON.stringify(clean.leaf.state.restChoice));
  near('E1a …at candidate 0\'s x to 1e-6', clean.leaf.state.restAt.x, C0.pose.x, 1e-6);
  near('E1a …and its z to 1e-6', clean.leaf.state.restAt.z, C0.pose.z, 1e-6);
  eq('E1a …the notice is M11\'s, with no clause added', clean.said, `door off its hinges — ${DOOR.removeSeconds.toFixed(0)} s of prep`);
  step(60);
  near('E1a …and it lies there (x, ± 0.05 after 60 steps)', posOf(clean.leaf).x, C0.pose.x, 0.05);
  near('E1a …(z)', posOf(clean.leaf).z, C0.pose.z, 0.05);
  eq('E1a m19\'s door numbers are unchanged: hungClear 0.86 with it off', doors.hungClear('living_kitchen'), 0.86);
  eq('E1a …and the bedroom route reads 0.86', doors.tightestOnRoute('bedroom'), 0.86);

  /* --- E1b: a box parked on the hinge-side strip → the LATCH-side strip. --- */
  releaseAll(); rehangAll(); parkMoversAway(); drainNotices();
  const box = spareBoxes(1)[0];
  const boxAt = standOn(box, C0);
  ok('E1b fixture: a box stands on the hinge-side strip', boxBlocked(physics, C0.pose, C0.half, null),
     `box at ${JSON.stringify(boxAt)}`);
  ok('E1b fixture: …and the latch-side strip is clear', !boxBlocked(physics, C1.pose, C1.half, null));
  ok('E1b fixture: the screwdriver is in hand', pickUp(sd));
  const blocked = removeWithE();
  ok('E1b fixture: the reticle was on the hung leaf', blocked.aimed, blocked.said || '(null)');
  const leaf = blocked.leaf;
  lines.push(`      chose ${JSON.stringify(leaf.state.restChoice)} at ${JSON.stringify(leaf.state.restAt)}`);
  eq('E1b the leaf takes the LATCH-side strip', leaf.state.restChoice.id, C1.id);
  eq('E1b …by index 1, not searched', `${leaf.state.restChoice.index}/${leaf.state.restChoice.searched}`, '1/false');
  eq('E1b …and the notice is still M11\'s (a candidate strip is not "further along")',
     blocked.said, `door off its hinges — ${DOOR.removeSeconds.toFixed(0)} s of prep`);
  step(30);
  const la = aabbOf(leaf), ba = aabbOf(box);
  const gap = gapBetween(la, ba);
  ok(`E1b the leaf's AABB does not intersect the box's — clear by >= DOOR.occupancyMargin (${DOOR.occupancyMargin} m)`,
     gap >= DOOR.occupancyMargin, `gap ${gap.toFixed(4)} m; leaf x ${la.minX.toFixed(2)}..${la.maxX.toFixed(2)} z ${la.minZ.toFixed(2)}..${la.maxZ.toFixed(2)}; box x ${ba.minX.toFixed(2)}..${ba.maxX.toFixed(2)} z ${ba.minZ.toFixed(2)}..${ba.maxZ.toFixed(2)}`);
  const before = posOf(box);
  step(60);
  const moved = Math.hypot(posOf(box).x - before.x, posOf(box).y - before.y, posOf(box).z - before.z);
  ok('E1b …and the box is not separated by the solver: < 1 mm over 60 steps (§7.3 stable resting)',
     moved < 0.001, `${(moved * 1000).toFixed(3)} mm`);

  /* --- E1c: every authored strip occupied → further along, and the notice says so. --- */
  releaseAll(); rehangAll(); parkMoversAway(); drainNotices();
  const three = spareBoxes(3);
  eq('E1c fixture: three spare bodies to stand on the three strips', three.length, 3);
  // Placed at the END of each strip the search shifts AWAY from, so a rung of the ladder can
  // actually clear them — the point is "further along", not "nowhere".
  standOn(three[0], opts[0], 0.92);
  standOn(three[1], opts[1], 0.08);
  standOn(three[2], opts[2], 0.50);
  const occupied = opts.filter((o) => boxBlocked(physics, o.pose, o.half, null));
  eq('E1c fixture: all three authored strips read as occupied', occupied.length, 3);
  ok('E1c fixture: the screwdriver is in hand', pickUp(sd));
  const far = removeWithE();
  ok('E1c fixture: the reticle was on the hung leaf', far.aimed, far.said || '(null)');
  const leaf2 = far.leaf, choice = leaf2.state.restChoice;
  lines.push(`      chose ${JSON.stringify(choice)} at ${JSON.stringify(leaf2.state.restAt)}`);
  ok('E1c the leaf goes to a SEARCHED strip, not an authored one', !!choice && choice.searched === true, JSON.stringify(choice));
  const ownShift = restCandidatesFor(LK)[choice.index].shift || 0;
  ok(`E1c …within DOOR.restSearchM (${DOOR.restSearchM} m) further along the wall`,
     Math.abs(choice.shift - ownShift) <= DOOR.restSearchM + 1e-9, `${(choice.shift - ownShift).toFixed(2)} m`);
  ok('E1c …and the notice says so (/further along/)', /further along/.test(far.said || ''), far.said || '(null)');
  eq('E1c …verbatim the one string interact.js exports', far.said,
     `door off its hinges — ${DOOR.removeSeconds.toFixed(0)} s of prep · ${DOOR_REST_MOVED_SAID}`);
  step(30);
  const l2a = aabbOf(leaf2);
  const worstGap = Math.min(...three.map((e) => gapBetween(l2a, aabbOf(e))));
  ok('E1c the leaf clears every one of the three bodies', worstGap >= DOOR.occupancyMargin, `nearest ${worstGap.toFixed(4)} m`);
  const beforeAll = three.map(posOf);
  step(60);
  const worstMove = Math.max(...three.map((e, i) => Math.hypot(posOf(e).x - beforeAll[i].x, posOf(e).y - beforeAll[i].y, posOf(e).z - beforeAll[i].z)));
  ok('E1c …and none of them is separated by the solver: < 1 mm over 60 steps', worstMove < 0.001, `${(worstMove * 1000).toFixed(3)} mm`);

  M.resetContract(); game.setPaused(false); drainNotices();
}
emit('E2...');

/* ── E2. forcing shares the chooser (§3.3, §8.2, §15.1) ────────────────────────────── */
lines.push('--- E2. m30 D1\'s shove with a box on the hinge strip: the FORCED leaf takes the latch strip, and D1\'s ledger / DOOR_STATE / hungClear are unchanged (GDD §3.3, §8.2) ---');
{
  const DOOR_ID = 'living_kitchen';
  const TAG = doorFrameTag(DOOR_ID);
  const leafOf = () => doors.leafFor(DOOR_ID);
  const opts = leafRestOptions(LK).filter((o) => !o.searched);
  const [C0, C1] = opts;
  const ROLLED = { x: -0.5, y: -0.5, z: -0.5, w: 0.5 };

  releaseAll(); rehangAll(); parkMoversAway(); drainNotices();
  const leaf = leafOf();
  const couch = byDef('couch_3seat_01');
  // m30's clearKitchen: the kitchen's other furniture out of the shove's run-up.
  for (const e of registry.entities.values()) {
    if (e === couch || isLeaf(e)) continue;
    const p = posOf(e);
    if (p.z < -5 && p.z > -9 && p.x > 0) parkAt(e, PAD.x + 20 + (p.x % 3) * 2, p.y, PAD.z + 20 + (Math.abs(p.z) % 4) * 2);
  }
  settle(10);
  // …and THEN the box on the hinge strip, so clearKitchen does not sweep it away again.
  const box = spareBoxes(1)[0];
  standOn(box, C0);
  ok('E2 fixture: a box stands on the hinge-side strip', boxBlocked(physics, C0.pose, C0.half, null));

  const p0 = prop().length, cost0 = sumCost(prop()), ev0 = doorEvents.length;
  // m30 D1's shove, verbatim in shape: the couch on its side, both hands, walking into the door.
  const X = LK.centre;
  const leafEnd = leaf.state.home.z - DOOR.leaf.length / 2;
  const cz = leafEnd - couch.def.dimensions.x / 2 - 0.15;
  parkAt(couch, X, 0.47, cz, 0, ROLLED); settle(40);
  const back = posOf(couch).z - couch.def.dimensions.x / 2;
  const target = { x: X, y: 0.45, z: back };
  const m = movers[0];
  lookAt(m, { x: X, z: back - 0.45 }, target);
  step(20);
  const g1 = grabWith(m, 'right', target);
  const g2 = m.grips.tryGrab('left', m.id, game.clock.simTimeMs);
  ok('E2 fixture: both hands on the couch', !!g1 && !!g2);
  const facing = m.rig.yaw;
  let forcedAt = -1;
  for (let i = 0; i < 240 && forcedAt < 0; i++) {
    step(1, { [m.id]: { move: { x: 0, y: 1 }, yaw: facing } });
    if (!leaf.state.hung) forcedAt = i;
  }
  ok(`E2 the shove forces the door within DOOR.forceWithinMs (${DOOR.forceWithinMs} ms)`,
     forcedAt >= 0 && (forcedAt + 1) * STEP <= DOOR.forceWithinMs, `${forcedAt >= 0 ? ((forcedAt + 1) * STEP).toFixed(0) : 'never'} ms`);
  lines.push(`      forced at step ${forcedAt} (${(forcedAt * STEP / 1000).toFixed(2)} s); chose ${JSON.stringify(leaf.state.restChoice)}`);
  eq('E2 the FORCED leaf takes the latch-side strip — the same chooser E uses', leaf.state.restChoice.id, C1.id);
  eq('E2 …index 1, not searched, not the authored fallback', `${leaf.state.restChoice.index}/${leaf.state.restChoice.searched}/${leaf.state.restChoice.clear}`, '1/false/true');
  near('E2 …at candidate 1\'s x to 1e-6', leaf.state.restAt.x, C1.pose.x, 1e-6);
  ok('E2 …and NOT at M11\'s pose (which is where M23 put it)', Math.abs(leaf.state.restAt.x - C0.pose.x) > 1.0,
     `${leaf.state.restAt.x.toFixed(3)} vs ${C0.pose.x.toFixed(3)}`);

  // The couch does not get a door laid under its leading corner.
  releaseAll();
  m.controller._vel.x = 0; m.controller._vel.z = 0; m.controller.pull.x = 0; m.controller.pull.z = 0;
  const couchAt = posOf(couch);
  step(30);
  const shifted = Math.hypot(posOf(couch).x - couchAt.x, posOf(couch).y - couchAt.y, posOf(couch).z - couchAt.z);
  ok('E2 the couch\'s displacement over the 30 idle steps after the forcing is < 5 cm (no leaf under its corner)',
     shifted < 0.05, `${(shifted * 1000).toFixed(1)} mm`);
  const ca = aabbOf(couch), la = aabbOf(leaf);
  ok('E2 …and the leaf is nowhere under it', gapBetween(la, ca) > 0, `gap ${gapBetween(la, ca).toFixed(3)} m`);

  // D1's other numbers, unchanged.
  const forced = doorEvents.slice(ev0).filter((e) => e.state === 'forced');
  eq('E2 D1 unchanged: DOOR_STATE { state: \'forced\' } exactly once', forced.length, 1);
  ok('E2 …doorId living_kitchen, the leaf, seat 0\'s mover, the couch, strain >= forceImpulseNs',
     !!forced[0] && forced[0].doorId === DOOR_ID && forced[0].entityId === leaf.id && forced[0].by === m.id &&
     forced[0].objectId === couch.id && forced[0].impulse >= DOOR.forceImpulseNs, JSON.stringify(forced[0]));
  const L = prop().slice(p0);
  const l = L.find((x) => x.surfaceId === TAG) || null;
  eq(`E2 …ledger.propertyDamage grew by exactly chargeForced (${F.chargeForced})`, Number((sumCost(prop()) - cost0).toFixed(2)), F.chargeForced);
  eq('E2 …in one line', L.length, 1);
  ok('E2 …citing door_frame, the door id and band \'forced\'', !!l && l.doorId === DOOR_ID && l.band === 'forced' && l.category === 'property',
     l ? `${l.doorId} ${l.band} ${l.category}` : 'no line');
  eq('E2 …hungClear(living_kitchen) is M11\'s unhung 0.86', doors.hungClear(DOOR_ID), 0.86);
  eq('E2 …and physics.stats.bodies is the boot count (a forcing changes a TYPE, not a count)', physics.stats.bodies, bodiesAtBoot);

  M.resetContract(); game.setPaused(false); drainNotices();
}
emit('E3...');

/* ── E3. the front leaf stays on the porch (§21.1, §18.3, §11.1) ───────────────────── */
lines.push('--- E3. the 32" front leaf is laid on the porch, never the lawn — off with E, off by force, and never recovered (GDD §8.2, §18.3, §26.6) ---');
{
  const P = WORLD.porchBounds;
  const porchZone = ZONES.find((z) => z.id === 'porch');
  const driveway = ZONES.find((z) => z.id === 'driveway');
  const cargo3 = cargoInterior();
  // The apron a truck actually needs: its own footprint plus a ramp's length off the back.
  const apron = { minX: cargo3.minX - 1.0, maxX: cargo3.maxX + 1.0,
                  minZ: cargo3.minZ - TOOLS.ramp.length, maxZ: cargo3.maxZ + 1.0 };
  const zoneBox = { minX: porchZone.minX, maxX: porchZone.maxX, minZ: porchZone.minZ, maxZ: porchZone.maxZ };
  const driveBox = { minX: driveway.minX, maxX: driveway.maxX, minZ: driveway.minZ, maxZ: driveway.maxZ };

  ok('E3 WORLD.porchBounds is inside the porch ZONE (house.js ZONES), not a second idea of the porch',
     inside2D(P, zoneBox), `${JSON.stringify(P)} vs ${JSON.stringify(zoneBox)}`);
  ok('E3 …outside the driveway zone (§18.3\'s route site)', !hits2D(P, driveBox), JSON.stringify(driveBox));
  ok('E3 …and outside the truck\'s apron (its box plus a ramp\'s length off the back)', !hits2D(P, apron), JSON.stringify(apron));
  near('E3 …clearing the driveway by 1.30 m', driveBox.minZ - P.maxZ, 1.30, 1e-9);
  near(`E3 …and the truck's rear lip (z ${cargo3.minZ.toFixed(2)}) by 5.40 m`, cargo3.minZ - P.maxZ, 5.40, 1e-9);

  const all32 = leafRestOptions(I32).filter((o) => !o.searched);
  const outside = all32.filter((o) => !inside2D(boxOfOption(o), P));
  ok('E3a every AUTHORED strip of interior32 is inside WORLD.porchBounds', outside.length === 0,
     outside.map((o) => `${o.id} ${JSON.stringify(boxOfOption(o))}`).join(' | '));
  for (const o of all32) {
    const a = boxOfOption(o);
    lines.push(`      interior32/${o.id} x ${a.minX.toFixed(3)}..${a.maxX.toFixed(3)} z ${a.minZ.toFixed(3)}..${a.maxZ.toFixed(3)}`);
  }
  const home32 = leafPose(I32), rest32 = leafRestPose(I32);
  near(`E3a …and candidate 0 is within DOOR.rehangRange (${DOOR.rehangRange} m) of its jamb, so Q is still the undo`,
       Math.min(Math.hypot(rest32.x - home32.x, rest32.z - home32.z), DOOR.rehangRange),
       Math.hypot(rest32.x - home32.x, rest32.z - home32.z), 1e-9);

  /* --- E off the front leaf. --- */
  releaseAll(); rehangAll(); parkMoversAway(); drainNotices();
  const sd = toolByDef('screwdriver_01');
  ok('E3b fixture: the screwdriver is in hand', pickUp(sd));
  const leaf = doors.leafFor('interior32');
  const home = leaf.state.home;
  // The leaf swings OUT, so the mover stands on the porch side (+z of the front wall).
  lookAt(me(), { x: home.x, z: I32.at + 1.1 }, { x: home.x, y: 1.0, z: I32.at + 0.05 });
  step(4);
  let seen = interact.describe(me());
  if (!(seen.target && seen.target.entity === leaf)) {
    lookAt(me(), { x: home.x - 0.15, z: I32.at + 0.8 }, { x: home.x, y: 1.0, z: I32.at + 0.10 });
    step(2);
    seen = interact.describe(me());
  }
  ok('E3b the reticle is on the hung front leaf', !!(seen.target && seen.target.entity === leaf),
     `${seen.target && seen.target.kind} ${seen.target && seen.target.entity && seen.target.entity.defId}`);
  const said = interact.act(me(), game.clock.simTimeMs);
  ok('E3b act() takes it off', /door off/.test(said || ''), said || '(null)');
  step(60);
  const restedE = aabbOf(leaf);
  lines.push(`      E: chose ${JSON.stringify(leaf.state.restChoice)}; leaf x ${restedE.minX.toFixed(3)}..${restedE.maxX.toFixed(3)} z ${restedE.minZ.toFixed(3)}..${restedE.maxZ.toFixed(3)}`);
  ok('E3b the removed front leaf lies INSIDE WORLD.porchBounds — not on the grass',
     inside2D(restedE, P), `${JSON.stringify(restedE)} vs ${JSON.stringify(P)}`);
  ok('E3b …outside the driveway zone', !hits2D(restedE, driveBox));
  ok('E3b …and outside the truck\'s apron', !hits2D(restedE, apron));
  const choiceE = { ...leaf.state.restChoice };

  /* --- and the same strip when the hinges are torn out instead. --- */
  releaseAll(); rehangAll(); parkMoversAway(); drainNotices();
  const leaf2 = doors.leafFor('interior32');
  const fridge = byDef('fridge_01');
  const ev0 = doorEvents.length;
  // A 110 kg fridge into the leaf's outboard face: config DOOR's own calibration for a
  // forcing with nobody's hands on it (m30 D7a). interior32's leaf hangs OUTSIDE, so the
  // approach is from the lawn (−x), aimed at the half of the leaf clear of the wall.
  const face = leaf2.state.home.x - DOOR.leaf.t / 2;
  parkAt(fridge, face - fridge.def.dimensions.x / 2 - 0.05, fridge.def.dimensions.y / 2 + 0.02, leaf2.state.home.z + 0.30);
  settle(20);
  throwAt(fridge, 4.0, 0, 0);
  for (let i = 0; i < 30 && leaf2.state.hung; i++) step(1);
  const forced = doorEvents.slice(ev0).filter((e) => e.state === 'forced');
  ok('E3c a thrown fridge tears the front leaf off (the M23 path, nobody\'s hands)',
     forced.length === 1 && !leaf2.state.hung, `${forced.length} forced event(s), hung ${leaf2.state.hung}`);
  step(60);
  const restedF = aabbOf(leaf2);
  lines.push(`      forced: chose ${JSON.stringify(leaf2.state.restChoice)}; leaf x ${restedF.minX.toFixed(3)}..${restedF.maxX.toFixed(3)} z ${restedF.minZ.toFixed(3)}..${restedF.maxZ.toFixed(3)}`);
  eq('E3c …onto the SAME strip E chose (one chooser, not two rest-pose paths)', leaf2.state.restChoice.id, choiceE.id);
  ok('E3c …and inside WORLD.porchBounds', inside2D(restedF, P), JSON.stringify(restedF));

  /* --- 40 removals, and the recovery sweep never has to move it. --- */
  M.resetContract(); game.setPaused(false); drainNotices();
  recoveries.length = 0;
  const leaf3 = doors.leafFor('interior32');
  // -Infinity, not 0: seeded at 0 the max could never go negative, so the margin the printed
  // line claims to show was unreachable and the assertion below could not have failed.
  let worstOut = -Infinity, offPorch = 0;
  for (let i = 0; i < 40; i++) {
    rehangAll();
    const spot = chooseLeafRest(physics, leaf3);
    registry.unhang(leaf3, spot.pose);
    step(8);
    const a = aabbOf(leaf3);
    if (!inside2D(a, P)) offPorch++;
    worstOut = Math.max(worstOut, Math.max(P.minX - a.minX, a.maxX - P.maxX, P.minZ - a.minZ, a.maxZ - P.maxZ));
  }
  eq('E3d 40 removals of the front leaf, and every one lands inside WORLD.porchBounds', offPorch, 0);
  ok('E3d1 …with real margin to spare on every side (the worst excursion is negative)',
     worstOut < 0, `${(worstOut * 1000).toFixed(2)} mm`);
  lines.push(`      worst excursion past porchBounds over 40 removals: ${(worstOut * 1000).toFixed(2)} mm (negative = margin)`);
  const mine = recoveries.filter((e) => e.entityId === leaf3.id || e.id === leaf3.id);
  eq('E3d …and §18.3\'s recovery sweep never had to move it: zero RECOVERY events for the leaf', mine.length, 0);
  ok('E3d …it never left RECOVERY.bounds either', inside2D(aabbOf(leaf3), RECOVERY.bounds));

  M.resetContract(); game.setPaused(false); drainNotices();
}
emit('E4...');

/* ── E4. the bottom band in a narrow window (§21.4 Vision, §21.1) ──────────────────── */
lines.push('--- E4. the card, the caption, the route bar and the help line share the band at 1262 / 960 / 800 px: no rect intersects another (GDD §21.4, §21.1) ---');
{
  const ui = document.getElementById('ui');
  const help = () => document.getElementById('help');
  const card = () => document.getElementById('walkthrough');
  const caption = () => huds[0].el.querySelector('.caption');
  const routeBar = () => huds[0].el.querySelector('.route-bar');
  const rect = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; };
  const fmt = (r) => `${r.l.toFixed(0)}..${r.r.toFixed(0)} x ${r.t.toFixed(0)}..${r.b.toFixed(0)}`;
  const overlaps = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
  const shown = (el) => !!el && !el.hidden && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;

  ok('E4-0 the card is built on this page (?walkthrough=1)', !!W && W.enabled === true && !!card());
  title.start();
  frame();
  // Step 3 is the one KNOWN_ISSUES named: a player who drove off within 20 s of the first load.
  W.step = 3;
  frame();
  eq('E4-0 …at step 3', W.step, 3);
  eq('E4-0 …and visible', card().hidden, false);

  const nativeW = ui.clientWidth;
  lines.push(`      harness viewport: window.innerWidth ${window.innerWidth}, #ui clientWidth ${nativeW}, innerHeight ${window.innerHeight}`);
  eq('E4-0 the harness band is the viewport before any emulation (#ui is fixed inset:0)', nativeW, window.innerWidth);

  /** Narrow the UI ROOT and let every listener that watches the window see it. */
  function band(px) {
    ui.style.width = px === null ? '' : `${px}px`;
    window.dispatchEvent(new Event('resize'));
    if (M.syncHelpMetrics) M.syncHelpMetrics();
    W.relayout();
    frame(2);
    // Re-feed the two boxes the render loop owns; feedHuds is not called by frame().
    huds[0].setCaption('a strap gave way', '←');
    huds[0].setRoute({ state: 'driving', progress: 0.42 });
    return ui.clientWidth;
  }

  const results = [];
  for (const px of [nativeW, 960, 800]) {
    const w = band(px);
    eq(`E4 the band emulates ${px} px (#ui clientWidth)`, w, px);
    const boxes = [];
    if (shown(card())) boxes.push({ name: 'card', rect: rect(card()) });
    if (shown(caption())) boxes.push({ name: 'caption', rect: rect(caption()) });
    if (shown(routeBar())) boxes.push({ name: 'route bar', rect: rect(routeBar()) });
    if (shown(help())) boxes.push({ name: 'help', rect: rect(help()) });
    eq(`E4 ${px} px: all four boxes are on screen and measurable`, boxes.length, 4);
    const hits = [];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        if (overlaps(boxes[i].rect, boxes[j].rect)) hits.push(`${boxes[i].name}x${boxes[j].name}`);
      }
    }
    ok(`E4 ${px} px: no rect intersects another (${boxes.length * (boxes.length - 1) / 2} pairs)`, hits.length === 0,
       hits.join(', ') + ' — ' + boxes.map((b) => `${b.name} ${fmt(b.rect)}`).join(' | '));
    const cardR = rect(card()), helpR = rect(help());
    near(`E4 ${px} px: …and the card still clears the help line by WALKTHROUGH.clearancePx`,
         helpR.t - cardR.b, WALKTHROUGH.clearancePx, 1.0);
    ok(`E4 ${px} px: every box is inside the band`, boxes.every((b) => b.rect.l >= -0.5 && b.rect.r <= px + 0.5),
       boxes.map((b) => `${b.name} ${fmt(b.rect)}`).join(' | '));
    const bm = W.bandMetrics();
    if (bm.narrow) {
      // The stack, not a near miss: the route bar sits a full WALKTHROUGH.bandGapPx above the
      // badge's top. (Measuring the badge's HEIGHT instead read 1.0 px here — see walkthrough.js.)
      const clear = cardR.t - rect(routeBar()).b;
      ok(`E4 ${px} px: the route bar clears the badge's top by >= WALKTHROUGH.bandGapPx (${WALKTHROUGH.bandGapPx} px)`,
         clear >= WALKTHROUGH.bandGapPx - 0.5, `${clear.toFixed(2)} px`);
    }
    results.push({ px, narrow: bm.narrow, lift: bm.lift, cls: card().classList.contains('narrow'),
                   cardW: cardR.w, card: fmt(cardR), help: fmt(helpR),
                   route: fmt(rect(routeBar())), caption: fmt(rect(caption())) });
    lines.push(`      ${px} px: narrow ${bm.narrow}, --band-lift ${bm.lift.toFixed(2)} px; ` +
               `card ${fmt(cardR)} | caption ${fmt(rect(caption()))} | route ${fmt(rect(routeBar()))} | help ${fmt(helpR)}`);
  }

  const wide = results[0], mid = results[1], narrow = results[2];
  eq(`E4a at ${wide.px} px the card is the WIDE form (above WALKTHROUGH.narrowPx)`, wide.narrow, false);
  eq('E4a …so --band-lift is 0 and nothing in the shipping layout moved', wide.lift, 0);
  eq('E4a …and the card carried no "narrow" class at that width', wide.cls, false);
  near('E4a …its width is M22\'s 312 px, unchanged', wide.cardW, 312, 0.5);
  eq('E4b at 960 px (WALKTHROUGH.narrowPx exactly) the card IS the badge form', mid.narrow, true);
  eq('E4b …the class asserted on the element', mid.cls, true);
  eq('E4c at 800 px the card is the badge form', narrow.narrow, true);
  eq('E4c …the class asserted on the element', narrow.cls, true);
  ok('E4c …and --band-lift is a real measurement, not a guess', narrow.lift > WALKTHROUGH.bandGapPx,
     `${narrow.lift.toFixed(2)} px vs the ${WALKTHROUGH.bandGapPx} px gap alone`);

  // Back to the shipping width, and the class with it.
  band(null);
  eq('E4d released: #ui is the viewport again', ui.clientWidth, window.innerWidth);
  eq('E4d …the badge class is gone', card().classList.contains('narrow'), false);
  eq('E4d …and --band-lift is back to 0', W.bandMetrics().lift, 0);
  eq('E4d …the root variable with it', document.documentElement.style.getPropertyValue('--band-lift').trim(), '0.00px');
  huds[0].setRoute({ state: 'parked' });
  huds[0].setCaption('');
}

} catch (e) {
  fails++;
  lines.push(`FAIL  suite threw  <- ${e && e.message}`);
  lines.push((e && e.stack || '').split('\n').slice(0, 8).join('\n'));
}

// m16's rule: this boot writes a save (the card's own shell key), so it clears it on the way out.
try { clearSave(); } catch (e) { /* no storage: nothing to clear */ }
emit();
