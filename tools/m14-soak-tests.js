/* Phase 11 plan M2 — the three-run soak.
 *
 * §26.6 says two things a single-run suite cannot check: "reset removes transient straps,
 * grips, damage records, fragments, and route state" and "no unbounded growth in active
 * bodies, logs, decals, or constraints over three runs". Every body-count pin in m1..m13 is
 * one run, 60-120 frames, and the registry never removes anything in gameplay — so they can
 * see a leak inside a run and never one BETWEEN runs. This suite plays the same contract
 * three times through the real API and asserts EQUALITY, not "roughly", of the counters after
 * run 3 against after run 1.
 *
 * THE CLAIMS UNDER TEST:
 *
 *   NO GROWTH     bodies, colliders, scene children, GPU geometries and textures, the strap
 *                 render pool, the event ring, the notice queue: identical after runs 1 and 3.
 *   REALLY RESET  every entity and tool at the start of runs 2 and 3 is in its definition
 *                 state — friction, combine rule, collider size, mesh scale, condition,
 *                 flags — after a run that put the dolly under the couch, took the wardrobe
 *                 doors off, strapped the fridge, dropped the TV and carried the ramp into
 *                 the settlement.
 *   STILL BILLED  a TV dropped on run 2 and run 3 reaches THAT run's ledger and invoice.
 *
 * Per run: strap on the fridge (m11 D), dolly under the couch and wardrobe doors off (m11 C),
 * one TV drop, E at the cab, routeSteps() + 60 frames, the m10 cleanDelivery teleport,
 * M.settle(), onReplay(). The notice queue is drained each run the way the render loop would
 * (headless Chrome never runs it), and its length is recorded so its growth is measured too.
 *
 * Copied drivers: step()/placeMover()/lookAt()/parkAt() from tools/m11-tests.js, slotIn()
 * from tools/m10-tests.js; the sample-every-checkpoint shape from AirportBaggageCrew
 * tools/_invariants.js (INDEX.md: check every invariant after every step, and assert that
 * the thing you set up actually happened).
 */

import { SIM, RECOVERY } from '../src/config.js';
import { cabPoint, cargoAnchors, cargoInterior } from '../src/world/truck.js';
import { GROUP_PRESETS } from '../src/physics/world.js';
import { PHASES } from '../src/core/eventBus.js';
import { routeSteps } from '../src/drive/route.js';
import { DEST_ZONES } from '../src/world/destination.js';
import { LINE_KINDS } from '../src/contract/invoice.js';

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

const {
  game, physics, registry, movers, tools, straps, route, damage, interact, hud, strapLines,
  renderer, world, rig, camera,
} = M;
const STEP = SIM.stepMs;
const FRAME = 16.667;
const I = cargoInterior();
const ANCHORS = cargoAnchors();
const me = () => movers[M.activeMoverIndex];
const R = physics.R;

/* ── drivers (m11 / m10 lineage) ───────────────────────────────────────────── */
function frames(n) { for (let k = 0; k < n; k++) game.frame(FRAME); }
function step(n = 1) {
  for (let i = 0; i < n; i++) {
    physics.clearForces();
    for (const m of movers) {
      const yaw = m.grips.aimYaw;
      m.grips.step(STEP, { brace: false, simTimeMs: i * STEP });
      m.controller.step(STEP, {
        move: { x: 0, y: 0 },
        forward: { x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw) },
        right: { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) },
        run: false, brace: false, jump: false, recover: false,
      });
    }
    interact.step(movers, STEP);
    straps.step(STEP, i * STEP);
    physics.step();
    registry.step(STEP);
    damage.step(STEP, i * STEP);
  }
}
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
const posOf = (e) => { const t = e.body.translation(); return { x: t.x, y: t.y, z: t.z }; };
const byDef = (id) => { for (const e of registry.entities.values()) if (e.defId === id) return e; return null; };
const toolByDef = (id) => { for (const t of tools.tools.values()) if (t.defId === id) return t; return null; };
function lookAt(m, from, target, snap = false) {
  placeMover(m, from.x, from.z, from.y !== undefined ? from.y : 0.2);
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
const slotIn = (zoneId, index) => {
  const z = DEST_ZONES.find((r) => r.id === zoneId);
  const cols = 4;
  const w = (z.maxX - z.minX) - 1.2, d = (z.maxZ - z.minZ) - 1.2;
  return {
    x: z.minX + 0.6 + ((index % cols) + 0.5) * (w / cols),
    z: z.minZ + 0.6 + (Math.floor(index / cols) + 0.5) * (d / 2),
  };
};
/** The render loop's drain, done by hand; returns how many were queued since the last drain. */
function drainNotices() {
  const n = M.pendingNotices.length;
  M.pendingNotices.splice(0, n);
  return n;
}

/* ── the counters §26.6 names, read at every checkpoint ──────────────────── */
let renderNote = null;
function sample(label) {
  registry.syncMeshes(); tools.syncMeshes();
  strapLines.update(0.016);
  let rendered = false;
  try { M.present(); rendered = true; } catch (e) { renderNote = renderNote || String(e && e.message); }
  physics.primeQueries();
  const s = {
    label,
    bodies: physics.stats.bodies, colliders: physics.stats.colliders,
    constraints: physics.stats.constraints,
    sceneChildren: world.scene.children.length,
    geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
    programs: renderer.info.programs ? renderer.info.programs.length : -1,
    straps: straps.count, pool: strapLines.pool.size,
    busLog: game.bus.log.length, notices: hud._notices.length, pending: M.pendingNotices.length,
    tools: tools.tools.size, registry: registry.count,
    itemDamage: game.state.ledger.itemDamage.length,
    heap: (performance.memory && performance.memory.usedJSHeapSize) || null,
    rendered,
  };
  lines.push(`      [${label}] bodies ${s.bodies} colliders ${s.colliders} joints ${s.constraints} ` +
             `scene ${s.sceneChildren} geom ${s.geometries} tex ${s.textures} programs ${s.programs} ` +
             `straps ${s.straps} pool ${s.pool} log ${s.busLog} notices ${s.notices} pending ${s.pending} ` +
             `tools ${s.tools} registry ${s.registry} ledger ${s.itemDamage} ` +
             `heap ${s.heap ? (s.heap / 1048576).toFixed(1) + ' MB' : 'n/a'}${rendered ? '' : ' (no render)'}`);
  return s;
}

/* ── the §26.6 invariants: definition state, checked at the start of every run ─ */
function sweepEntities() {
  const bad = [];
  for (const e of registry.entities.values()) {
    const s = e.state, d = e.def.dimensions, he = e.collider.halfExtents();
    if (s.condition !== 100) bad.push(`${e.defId} condition ${s.condition}`);
    if (Math.abs(e.collider.friction() - e.def.physics.friction) > 1e-6) {
      bad.push(`${e.defId} mu ${e.collider.friction().toFixed(3)} want ${e.def.physics.friction}`);
    }
    if (e.collider.frictionCombineRule && e.collider.frictionCombineRule() !== R.CoefficientCombineRule.Average) {
      bad.push(`${e.defId} rule ${e.collider.frictionCombineRule()}`);
    }
    if (Math.abs(he.x * 2 - d.x) > 1e-6 || Math.abs(he.y * 2 - d.y) > 1e-6 || Math.abs(he.z * 2 - d.z) > 1e-6) {
      bad.push(`${e.defId} extents ${(he.x * 2).toFixed(3)}x${(he.y * 2).toFixed(3)}x${(he.z * 2).toFixed(3)}`);
    }
    if (e.mesh.scale.x !== 1 || e.mesh.scale.y !== 1 || e.mesh.scale.z !== 1) bad.push(`${e.defId} scale ${e.mesh.scale.z}`);
    if ((s.removedParts || []).length) bad.push(`${e.defId} parts ${JSON.stringify(s.removedParts)}`);
    if (s.dollyId != null || s.blanketId != null) bad.push(`${e.defId} dolly=${s.dollyId} blanket=${s.blanketId}`);
    if (s.loaded || (s.recoveries || 0) > 0) bad.push(`${e.defId} loaded=${s.loaded} recoveries=${s.recoveries}`);
  }
  return bad;
}
function sweepTools() {
  const bad = [];
  for (const t of tools.tools.values()) {
    const y = t.body.translation().y;
    if (!t.body.isDynamic()) bad.push(`${t.defId} not dynamic`);
    if (t.collider.collisionGroups() !== GROUP_PRESETS.object) bad.push(`${t.defId} groups ${t.collider.collisionGroups()}`);
    if (!(y > RECOVERY.objectFloorY)) bad.push(`${t.defId} y ${y.toFixed(2)}`);
    if (t.state.carriedBy || t.state.attachedTo || t.state.deployed || t.state.geometry) {
      bad.push(`${t.defId} carriedBy=${t.state.carriedBy} attachedTo=${t.state.attachedTo} deployed=${t.state.deployed}`);
    }
  }
  return bad;
}

/* ── one run of the contract, end to end ─────────────────────────────────── */
function playRun(r) {
  const F = { r };
  const fridge = byDef('fridge_01');
  const couch = byDef('couch_3seat_01');
  const wardrobe = byDef('wardrobe_01');
  const tv = byDef('tv_55_01');
  const dolly = toolByDef('dolly_flat_01');
  const sd = toolByDef('screwdriver_01');
  const ramp = toolByDef('ramp_01');

  F.phaseAtStart = game.state.phase;
  F.pausedAtStart = game.state.paused;
  frames(60);
  F.toolsAfterWarmup = sweepTools();

  // Strap on the fridge (m11 D, with T's camera snap after the teleport into the truck).
  parkAt(fridge, M.truckPose.x, I.minY + 0.90, I.maxZ - 0.6);
  frames(50);
  const ft = posOf(fridge);
  const anchor = [...ANCHORS].sort((a, b) =>
    Math.hypot(b.x - ft.x, b.z - ft.z) - Math.hypot(a.x - ft.x, a.z - ft.z))[0];
  lookAt(me(), { x: anchor.x + (anchor.side === 'L' ? 0.85 : -0.85), z: anchor.z, y: I.minY + 0.1 }, anchor, true);
  F.strapA = interact.act(me());
  lookAt(me(), { x: ft.x, z: ft.z - 1.3, y: I.minY + 0.1 }, { x: ft.x, y: ft.y, z: ft.z }, true);
  F.strapB = interact.act(me());
  F.strapOn = straps.onEntity(fridge.id).length === 1;
  frames(8);
  F.mid = sample(`run ${r} strap live`);

  // Dolly under the couch (m11 C).
  parkAt(couch, -30, 0.45, 30);
  let p = posOf(dolly);
  lookAt(me(), standOffFrom(p, 1.2), p);
  interact.act(me());
  step(10);
  lookAt(me(), standOffFrom({ x: -30, y: 0.45, z: 30 }, 1.5), { x: -30, y: 0.45, z: 30 });
  interact.act(me());
  F.dollyOn = couch.state.dollyId === dolly.id && couch.collider.friction() < 0.1;

  // Wardrobe doors off (m11 C), then the screwdriver goes down away from the wardrobe.
  parkAt(wardrobe, -34, 1.02, 30);
  p = posOf(sd);
  lookAt(me(), standOffFrom(p, 1.1), p);
  interact.act(me());
  step(6);
  lookAt(me(), standOffFrom({ x: -34, y: 1.0, z: 30 }, 1.5), { x: -34, y: 1.0, z: 30 });
  interact.act(me());
  F.doorsOff = (wardrobe.state.removedParts || []).includes('doors') &&
    wardrobe.collider.halfExtents().z * 2 < wardrobe.def.dimensions.z - 1e-6;
  lookAt(me(), { x: -20, z: 60 }, { x: -20, y: 0.2, z: 90 });
  interact.secondary(me());

  // Run 1 has one mover recovery (billed on run 1's invoice and no other).
  if (r === 1) me().controller.recoverNow('soak');
  F.recoveriesBeforeSettle = M.recoveryCount();

  // One TV drop from 1.5 m, then long enough for the aggregation window to close.
  const ledgerBefore = game.state.ledger.itemDamage.length;
  parkAt(tv, -38, tv.def.dimensions.y / 2 + 1.5, 30, Math.PI / 2);
  frames(150);
  F.tvDamaged = game.state.ledger.itemDamage.length > ledgerBefore || damage._open.size > 0;

  // Run 3 drives with the ramp DEPLOYED at the truck (E at the cab while carrying it deploys
  // it — which is also why run 2 cannot carry it to the cab; see below).
  const cab = cabPoint();
  if (r === 3) {
    p = posOf(ramp);
    lookAt(me(), standOffFrom(p, 1.2), p);
    interact.act(me());
    lookAt(me(), standOffFrom(cab, 1.4), cab, true);
    F.rampDeploy = interact.act(me());
    F.rampDeployed = ramp.state.deployed === true && !ramp.body.isDynamic();
  }

  // E at the cab, drive the route out through the real systems.
  lookAt(me(), standOffFrom(cab, 1.4), cab, true);
  F.cabPrompt = (interact.describe(me()).primary || '');
  F.depart = interact.act(me());
  F.driving = route.state === 'driving' && game.state.phase === PHASES.TRANSIT;
  frames(routeSteps() + 60);
  F.arrived = route.state === 'arrived' && game.state.phase === PHASES.DELIVERY;

  // Run 2 carries the ramp INTO the settlement (picked up after arrival, so the cab press
  // above was a drive and not a deploy).
  if (r === 2) {
    p = posOf(ramp);
    lookAt(me(), standOffFrom(p, 1.2), p);
    interact.act(me());
    F.rampCarried = interact._for(me().id).carriedTool === ramp.id &&
      ramp.collider.collisionGroups() === GROUP_PRESETS.toolCarried;
  }

  // Unload: the m10 cleanDelivery teleport (straps off first, as a player would).
  straps.releaseAll();
  const perRoom = {};
  for (const row of game.state.manifest) {
    const e = registry.get(row.entityId);
    if (!e) continue;
    perRoom[row.toZone] = (perRoom[row.toZone] || 0) + 1;
    const sl = slotIn(row.toZone, perRoom[row.toZone] - 1);
    parkAt(e, sl.x, e.def.dimensions.y / 2 + 0.06, sl.z);
  }
  frames(260);
  const summary = M.manifestSummary(game.state.manifest);
  F.delivered = `${summary.delivered}/${summary.total}`;
  F.complete = summary.complete;

  M.settle();
  F.settled = game.state.phase === PHASES.SETTLEMENT && game.state.paused && M.invoiceScreen.visible;
  F.ledgerAtSettlement = game.state.ledger.itemDamage.length;
  F.damageStateIsGameState = damage.state === game.state;
  const text = M.invoiceScreen.el.textContent;
  F.invoiceHasItemDamage = text.includes(LINE_KINDS.ITEM_DAMAGE);
  F.invoiceHasRecovery = text.includes(LINE_KINDS.RECOVERY);
  F.recoveriesAtSettlement = M.recoveryCount();
  F.phaseMs = { ...game.state.telemetry.phaseMs };
  F.stateRoundTrips = (() => {
    try {
      const t = JSON.parse(JSON.stringify(game.state.telemetry));
      const l = JSON.parse(JSON.stringify(game.state.ledger));
      return typeof t.phaseMs === 'object' && Array.isArray(l.itemDamage);
    } catch (e) { return false; }
  })();

  M.invoiceScreen.onReplay();
  F.replayed = game.state.phase === PHASES.PICKUP && !game.state.paused;
  F.noticesDrained = drainNotices();
  F.after = sample(`after run ${r}`);
  return F;
}

try {
lines.push('--- S0. three runs of the same contract (GDD §26.1, §26.6) ---');
const frames0 = game.stats.frames;
drainNotices();
const baseline = sample('boot');
const runs = [];
/** Definition-state sweeps taken right after each replay — the start of runs 2 and 3, and
 *  the state run 3's replay leaves behind. */
const afterSweeps = {};
for (let r = 1; r <= 3; r++) {
  emit(`run ${r}...`);
  const F = playRun(r);
  runs.push(F);
  afterSweeps[r] = { entities: sweepEntities(), tools: sweepTools() };
  lines.push(`      run ${r}: strap ${F.strapOn} dolly ${F.dollyOn} doors ${F.doorsOff}` +
             `${F.rampCarried !== undefined ? ' ramp-carried ' + F.rampCarried : ''}` +
             `${F.rampDeployed !== undefined ? ' ramp-deployed ' + F.rampDeployed + ' ("' + F.rampDeploy + '")' : ''} tv ${F.tvDamaged} ` +
             `depart "${F.depart}" driving ${F.driving} arrived ${F.arrived} delivered ${F.delivered} ` +
             `settled ${F.settled} ledger@settle ${F.ledgerAtSettlement} recoveries@settle ${F.recoveriesAtSettlement} ` +
             `replayed ${F.replayed} notices drained ${F.noticesDrained} ` +
             `transit ${Math.round(F.phaseMs.transit)} ms delivery ${Math.round(F.phaseMs.delivery)} ms`);
}
lines.push(`      three runs: ${game.stats.frames - frames0} game.frame() calls, clock ${(game.clock.simTimeMs / 1000).toFixed(1)} s into run 4 ` +
           `(wall time is unmeasurable under virtual time — see KNOWN_ISSUES; smoketest.ps1 times the whole suite)`);
if (renderNote) lines.push(`      NOTE: present() threw: ${renderNote}`);

for (const F of runs) {
  ok(`S0 run ${F.r} fixture really happened: strap, dolly, doors, TV damage, drive, arrival, settlement, replay`,
     F.strapOn && F.dollyOn && F.doorsOff && F.tvDamaged && F.driving && F.arrived && F.settled && F.replayed,
     `strap=${F.strapOn} (A "${F.strapA}" B "${F.strapB}") dolly=${F.dollyOn} doors=${F.doorsOff} tv=${F.tvDamaged} ` +
     `driving=${F.driving} arrived=${F.arrived} settled=${F.settled} replayed=${F.replayed} cab="${F.cabPrompt}"`);
}
ok('S0 run 2 carried the ramp into its settlement (kinematic, no-collide group)', runs[1].rampCarried === true, String(runs[1].rampCarried));
ok('S0 run 3 drove with the ramp deployed at the truck (fixed body)', runs[2].rampDeployed === true,
   `${runs[2].rampDeployed} ("${runs[2].rampDeploy}")`);

/* ── S1. no growth: exact equality, run 3 against run 1 ───────────────────── */
lines.push('--- S1-S2. no unbounded growth over three runs (GDD §26.6) ---');
const a1 = runs[0].after, a3 = runs[2].after;
const same = (k) => a1[k] === a3[k];
ok('S1 bodies after run 3 === after run 1', same('bodies'), `${a1.bodies} vs ${a3.bodies}`);
ok('S1 colliders after run 3 === after run 1', same('colliders'), `${a1.colliders} vs ${a3.colliders}`);
ok('S1 scene children after run 3 === after run 1', same('sceneChildren'), `${a1.sceneChildren} vs ${a3.sceneChildren}`);
ok('S1 renderer geometries after run 3 === after run 1', same('geometries'), `${a1.geometries} vs ${a3.geometries}`);
ok('S1 renderer textures after run 3 === after run 1', same('textures'), `${a1.textures} vs ${a3.textures}`);
ok('S1 …and joints stay at 0 (the codebase creates none — recorded, not claimed)',
   a1.constraints === 0 && a3.constraints === 0, `${a1.constraints} vs ${a3.constraints}`);
ok('S1 …and the renders that measured them were real', a1.rendered && a3.rendered && baseline.rendered, renderNote || '');

/* ── S2. the strap render pool evicts ─────────────────────────────────────── */
ok('S2 strapLines.pool.size after run 3 === after run 1', same('pool'), `${a1.pool} vs ${a3.pool}`);
const samples = [baseline, ...runs.flatMap((F) => [F.mid, F.after])];
const poolMismatch = samples.filter((s) => s.pool !== s.straps).map((s) => `${s.label}: pool ${s.pool} straps ${s.straps}`);
ok('S2 …and pool.size === straps.count at every sample (1 while the strap is on, 0 after replay)',
   poolMismatch.length === 0 && runs.every((F) => F.mid.straps === 1 && F.after.straps === 0),
   poolMismatch.join(' | ') || runs.map((F) => `${F.mid.straps}/${F.after.straps}`).join(','));
/* Three.js uploads a geometry the first time it is DRAWN, so the count climbs through run 1
 * as the camera sees new things (boot -> mid -> after: first-time uploads, not leaks). From
 * run 2 on everything has been seen, and the only difference between "strap live" and "after
 * replay" is the strap's own two segment boxes — uploaded, then freed by the eviction. */
ok('S2b runs 2 and 3: geometries(strap live) - geometries(after replay) === 2 — the strap\'s two boxes are uploaded and freed',
   runs.slice(1).every((F) => F.mid.geometries - F.after.geometries === 2),
   runs.map((F) => `run ${F.r}: mid ${F.mid.geometries} after ${F.after.geometries}`).join(' | ') + ` (boot ${baseline.geometries})`);

/* ── S3. damage is billed on every run ────────────────────────────────────── */
lines.push('--- S3. replay damage reaches the ledger and the invoice (GDD §26.4) ---');
ok('S3 game.state.ledger.itemDamage.length >= 1 at the settlement of run 2',
   runs[1].ledgerAtSettlement >= 1 && runs[1].damageStateIsGameState, `${runs[1].ledgerAtSettlement} lines`);
ok('S3 …and of run 3', runs[2].ledgerAtSettlement >= 1 && runs[2].damageStateIsGameState, `${runs[2].ledgerAtSettlement} lines`);
ok('S3 …and each of those invoices shows the item-damage line',
   runs.slice(1).every((F) => F.invoiceHasItemDamage), runs.map((F) => F.invoiceHasItemDamage).join(','));
ok('S3b run 1 billed its recovery; runs 2 and 3 had none and bill none',
   runs[0].invoiceHasRecovery && runs[0].recoveriesAtSettlement === 1 &&
   !runs[1].invoiceHasRecovery && runs[1].recoveriesAtSettlement === 0 &&
   !runs[2].invoiceHasRecovery && runs[2].recoveriesAtSettlement === 0,
   runs.map((F) => `run ${F.r}: ${F.recoveriesAtSettlement} recoveries, line ${F.invoiceHasRecovery}`).join(' | '));

/* ── S4-S6. definition state at the start of runs 2 and 3 ─────────────────── */
lines.push('--- S4-S6. every entity and tool is reset to its definition (GDD §26.6, §27.1) ---');
for (const r of [1, 2, 3]) {
  const sw = afterSweeps[r];
  const ents = sw.entities;
  const when = r < 3 ? `start of run ${r + 1}` : 'after run 3\'s replay';
  const left = r === 1 ? 'dolly + doors off + strap + 1 recovery' : r === 2 ? 'ramp carried' : 'ramp deployed';
  ok(`S4 ${when} (after ${left}): every registry entity has condition 100, no parts off, no dolly/blanket, not loaded, 0 recoveries`,
     !ents.some((b) => /condition|parts|dolly|loaded/.test(b)),
     ents.filter((b) => /condition|parts|dolly|loaded/.test(b)).slice(0, 4).join(' | '));
  ok(`S5 ${when}: every entity's friction === def, combine rule Average, halfExtents === def/2, mesh.scale 1`,
     !ents.some((b) => /mu|rule|extents|scale/.test(b)),
     ents.filter((b) => /mu|rule|extents|scale/.test(b)).slice(0, 4).join(' | '));
  ok(`S6 ${when}: every tool isDynamic() in the object collision group, above the recovery floor, no flags`,
     sw.tools.length === 0, sw.tools.join(' | '));
  if (r < 3) {
    const warm = runs[r].toolsAfterWarmup;
    ok(`S6 …and still there 60 frames into run ${r + 1} (a no-collide tool would have fallen through by now)`,
       warm.length === 0, warm.join(' | '));
  }
}
{
  // The run-3 replay unwound a DEPLOYED ramp; give it 120 frames and it must still be a tool.
  frames(120);
  const late = sweepTools();
  ok('S6 …and 120 frames after the last replay every tool is still dynamic, colliding, and above the floor',
     late.length === 0, late.join(' | '));
}
{
  const ys = [...tools.tools.values()].map((t) => `${t.defId.replace(/_\d+$/, '')} y=${t.body.translation().y.toFixed(2)}`);
  lines.push(`      tools now: ${ys.join(', ')}`);
}

/* ── S7. the bounded things stay bounded ──────────────────────────────────── */
lines.push('--- S7-S8. logs, notices, registries, heap (GDD §26.6) ---');
const over = samples.filter((s) => s.busLog > 256 || s.notices > 4 || s.tools !== 4 || s.registry !== baseline.registry || s.pending !== 0);
ok('S7 bus.log.length <= 256, hud._notices.length <= 4, tools.tools.size === 4, registry.count constant, notice queue drained at every sample',
   over.length === 0,
   over.map((s) => `${s.label}: log ${s.busLog} notices ${s.notices} tools ${s.tools} registry ${s.registry} pending ${s.pending}`).join(' | '));
ok('S7 …and the notice queue was really being fed (it is only drained by the render loop, which never runs headless)',
   runs.every((F) => F.noticesDrained >= 1), runs.map((F) => F.noticesDrained).join(','));
ok('S7 game.state.telemetry and ledger JSON round-trip at every settlement',
   runs.every((F) => F.stateRoundTrips));
ok('S7 …and telemetry.phaseMs recorded the drive on every run (transit within one step of 28000 ms)',
   runs.every((F) => Math.abs(F.phaseMs.transit - routeSteps() * STEP) <= STEP + 1e-6 && F.phaseMs.delivery > 0),
   runs.map((F) => Math.round(F.phaseMs.transit)).join(','));

/* ── S8. heap ─────────────────────────────────────────────────────────────── */
if (a1.heap && a3.heap) {
  ok('S8 usedJSHeapSize after run 3 <= 1.10 x after run 1',
     a3.heap <= 1.10 * a1.heap, `${(a1.heap / 1048576).toFixed(1)} MB -> ${(a3.heap / 1048576).toFixed(1)} MB`);
  lines.push(`      heap: boot ${(baseline.heap / 1048576).toFixed(1)} MB, after run 1 ${(a1.heap / 1048576).toFixed(1)} MB, ` +
             `after run 3 ${(a3.heap / 1048576).toFixed(1)} MB (${((a3.heap / a1.heap - 1) * 100).toFixed(1)} %)`);
} else {
  lines.push('      NOTE: performance.memory is not available here — S8 heap check skipped');
}
ok('S9 no error banner appeared during the soak', !document.getElementById('err-banner'));

} catch (e) {
  fails++;
  lines.push(`FAIL  suite threw  <- ${e && e.message}`);
  lines.push((e && e.stack || '').split('\n').slice(0, 6).join('\n'));
}

emit();
