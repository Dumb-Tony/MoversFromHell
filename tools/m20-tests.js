/* Phase 11 build-side M12 suite — loose parts are real bodies.
 *
 * GDD §9.1: the screwdriver "changes an object's dimensions and CREATES LOOSE PARTS … loose
 * pieces get lost". §26.4: "broken required cargo stays deliverable or becomes trackable
 * pieces". §26.6: "reset removes … fragments". §2.2: a piece somewhere inconvenient is a
 * state, not a refusal. §12.3: settled validation per piece. §15.1: the invoice names what
 * was lost.
 *
 * For five phases TOOLS.screwdriver.partMassFraction (0.14) had no consumer and a detached
 * part was a string in state.removedParts. The claims under test are that a part is now
 * SEVERAL BODIES the rest of the game sees — the registry (P1), the reassemble guard (P2),
 * the manifest (P3), the invoice (P4), the damage system's broken band (P5), the contract
 * reset (P6), serializability and the run summary (P7), the cargo box (P8) — and that the
 * piece prefabs obey m13 A1/A2's collision-faithful rule (P9).
 *
 * Style: tools/m13-tests.js. Drives the systems directly — never waits for rAF.
 */

import { SIM, MANIFEST, PARTS, TOOLS, DAMAGE } from '../src/config.js';
import { OBJECT_DEFS, validateDef, derivedDefs, pieceDefFor } from '../src/objects/definitions.js';
import { buildPrefab, prefabBounds } from '../src/render/prefabs.js';
import {
  disassemble, reassemble, currentDimensions, partStatus, worldAabbOf, pieceSlots, piecesOf,
} from '../src/tools/tools.js';
import { stepManifest, manifestSummary, deliveryStatus } from '../src/contract/manifest.js';
import { buildInvoice, reconcile, LINE_KINDS, partsLeftBehind, reviewFor } from '../src/contract/invoice.js';
import { bandFor } from '../src/damage/damage.js';
import { createTelemetryCounters, countEvent, buildRunSummary } from '../src/telemetry/runLog.js';
import { DEST_ZONES, insideDestination } from '../src/world/destination.js';
import { cargoInterior } from '../src/world/truck.js';
import { GROUP_PRESETS } from '../src/physics/world.js';
import { EVENTS, PHASES } from '../src/core/eventBus.js';

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

const { game, physics, registry, movers, tools, straps, cargo, route, damage, interact, rig, camera } = M;
const bus = game.bus;
const STEP = SIM.stepMs;
const I = cargoInterior();
const me = () => movers[M.activeMoverIndex];
const rows = () => game.state.manifest;

/* ── helpers (tools/m11-tests.js, verbatim where it matters) ──────────────── */
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
    cargo.step(STEP, i * STEP);
    damage.step(STEP, i * STEP);
    stepManifest(rows(), registry, STEP);
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
const rowOf = (e) => rows().find((r) => r.entityId === e.id);
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
/** A free spot on the floor of a destination room (tools/m9-tests.js slotIn). */
function slotIn(zoneId, index) {
  const z = DEST_ZONES.find((r) => r.id === zoneId);
  const cols = 4;
  const w = (z.maxX - z.minX) - 1.2, d = (z.maxZ - z.minZ) - 1.2;
  return {
    x: z.minX + 0.6 + ((index % cols) + 0.5) * (w / cols),
    z: z.minZ + 0.6 + (Math.floor(index / cols) + 0.5) * (d / Math.max(1, Math.ceil(8 / cols))),
  };
}
const aabbOverlap = (a, b) =>
  a.min.x < b.max.x && b.min.x < a.max.x && a.min.y < b.max.y && b.min.y < a.max.y && a.min.z < b.max.z && b.min.z < a.max.z;
const PAD = { x: -22, z: 30 };   // m11's clear ground, far from the house and the truck

step(30);
const baselineCount = registry.count;          // 23 manifest bodies (+ M11's door leaves)
const baselineBodies = physics.stats.bodies;
const baselinePieces = registry.pieceCount;
lines.push(`      boot: registry.count ${baselineCount}, manifest rows ${rows().length}, bodies ${baselineBodies}, pieces ${baselinePieces}`);

try {
/* ── P1. disassemble spawns real bodies (§9.1) ───────────────────────────── */
lines.push('--- P1. a detached part is four bodies beside the couch (GDD §9.1, §7.1) ---');
const couch = byDef('couch_3seat_01');
ok('P0 there is a couch, and the M12 config block exists', !!couch && PARTS.partMassFraction === 0.14 && PARTS.reattachRange > 0);
ok('P0a TOOLS.screwdriver.partMassFraction is an alias of PARTS.partMassFraction for one phase',
   TOOLS.screwdriver.partMassFraction === PARTS.partMassFraction);
eq('P0b baseline: no piece bodies before anything is taken apart', baselinePieces, 0);
{
  parkAt(couch, PAD.x, 0.45, PAD.z);
  step(30);
  const before = registry.count;
  const ledgerBefore = game.state.ledger.itemDamage.length;
  let applied = 0, impacts = 0;
  const off1 = bus.on(EVENTS.DAMAGE_APPLIED, () => applied++);
  const off2 = bus.on(EVENTS.IMPACT, () => impacts++);
  const r = disassemble(registry, couch, 'legs');
  ok('P1 disassemble(registry, couch, \'legs\') spawns exactly 4 piece entities and registry.count rises by 4',
     !!r && r.pieces.length === 4 && registry.count === before + 4,
     `pieces ${r && r.pieces.length}, count ${before} -> ${registry.count}`);
  const legs = (r ? r.pieces : []).map((id) => registry.get(id)).filter(Boolean);
  ok('P1a each piece isDynamic(), category \'part\', and is a registry entity a raycast maps back to (grabbable)',
     legs.length === 4 && legs.every((l) => l.body.isDynamic() && l.def.category === 'part' &&
       registry.fromCollider(l.collider) === l && l.collider.collisionGroups() === GROUP_PRESETS.object),
     legs.map((l) => `${l.def.category}/${l.body.isDynamic()}`).join(','));
  const want = couch.def.mass * PARTS.partMassFraction / 4;
  near(`P1b mass === couch.mass x PARTS.partMassFraction / 4 = ${want} (definition)`, legs.length ? legs[0].def.mass : -1, want, 1e-6);
  near('P1b …and the BODY weighs that (Rapier mass)', legs.length ? legs[0].body.mass() : -1, want, 1e-6);
  ok('P1c state.parts.legs lists their ids, in order, and each piece names its parent (plain data)',
     !!couch.state.parts && JSON.stringify(couch.state.parts.legs) === JSON.stringify(r.pieces) &&
     legs.every((l, i) => l.state.partOf && l.state.partOf.entityId === couch.id && l.state.partOf.part === 'legs' && l.state.partOf.index === i),
     JSON.stringify(couch.state.parts));
  ok('P1d the pieces carry the parent\'s fragility and a replacementValue share of 31.50',
     legs.every((l) => l.def.fragility === couch.def.fragility && Math.abs(l.def.replacementValue - 900 * 0.14 / 4) < 1e-9),
     legs.length ? `${legs[0].def.fragility} ${legs[0].def.replacementValue}` : '');
  step(60);
  const cb = worldAabbOf(couch);
  const dims = legs.length ? legs[0].def.dimensions : { x: 0, y: 0, z: 0 };
  const dist = legs.map((l) => { const p = posOf(l); return Math.hypot(p.x - cb.centre.x, p.z - cb.centre.z); });
  const resting = legs.every((l) => { const p = posOf(l); const v = l.body.linvel(); return Math.abs(p.y - dims.y / 2) < 0.02 && Math.hypot(v.x, v.y, v.z) < 0.05; });
  const outside = legs.every((l) => !aabbOverlap(worldAabbOf(l), cb));
  lines.push(`      legs after 60 frames: ${legs.map((l) => { const p = posOf(l); return `(${p.x.toFixed(2)}, ${p.y.toFixed(3)}, ${p.z.toFixed(2)})`; }).join(' ')}; distances ${dist.map((d) => d.toFixed(2)).join(', ')} m`);
  ok(`P1e after 60 frames every leg rests on the floor (y = ${(dims.y / 2).toFixed(3)} ± 0.02, |v| < 0.05)`, resting);
  ok(`P1f …within PARTS.pieceSpacing x 4 = ${(PARTS.pieceSpacing * 4).toFixed(2)} m of the couch`, dist.every((d) => d <= PARTS.pieceSpacing * 4), dist.map((d) => d.toFixed(2)).join(', '));
  ok('P1g …and outside the couch\'s AABB (no piece spawned inside its parent)', outside);
  off1(); off2();
  ok('P1h no DAMAGE_APPLIED, no IMPACT and no ledger line came out of the disassembly (a fake impact would be §10.4 damage without a cause)',
     applied === 0 && impacts === 0 && game.state.ledger.itemDamage.length === ledgerBefore,
     `applied ${applied} impacts ${impacts} ledger +${game.state.ledger.itemDamage.length - ledgerBefore}`);
  ok('P1i the piece slots are computed beside the parent, not inside it (pieceSlots, the pure geometry)',
     (() => { const s = pieceSlots(couch, dims, 4, physics); return s.slots.length === 4 && s.slots.every((p) => p.z > cb.max.z || p.z < cb.min.z || p.x > cb.max.x || p.x < cb.min.x); })());

  /* ── P2. reassemble needs the pieces here (§8.2 reattach, §4.4) ─────────── */
  lines.push('--- P2. reassemble requires every piece within PARTS.reattachRange (GDD §8.2, §4.4) ---');
  const countWithLegs = registry.count;
  const back = reassemble(registry, couch, 'legs');
  ok('P2 with all 4 within reattachRange, reassemble() removes the pieces and registry.count is back',
     !!back && back.piecesRemoved === 4 && registry.count === countWithLegs - 4 && registry.pieceCount === 0,
     `removed ${back && back.piecesRemoved}, count ${registry.count} vs ${countWithLegs - 4}`);
  near('P2a …the collider is 0.85 m tall again (m6 E15i unchanged)', couch.collider.halfExtents().y * 2, 0.85, 1e-6);
  ok('P2b …removedParts is [] and state.parts has no legs entry (m6 E15j unchanged)',
     (couch.state.removedParts || []).length === 0 && !(couch.state.parts && couch.state.parts.legs), JSON.stringify(couch.state.parts));
  ok('P2c …and the removed pieces are gone from the registry', legs.every((l) => !registry.get(l.id)));

  const r2 = disassemble(registry, couch, 'legs');
  near('P2d taken off again: the collider is 0.77 (m6 E15f)', couch.collider.halfExtents().y * 2, 0.77, 1e-6);
  const legs2 = r2.pieces.map((id) => registry.get(id));
  parkAt(legs2[0], PAD.x + 3.0, 0.05, PAD.z);   // one leg carried 3 m away
  step(4);
  const st = partStatus(registry, couch, 'legs');
  ok('P2e partStatus: 3 present, 1 of 4 missing', st.of === 4 && st.present === 3 && st.missing === 1 && st.farIds.length === 1,
     JSON.stringify({ of: st.of, present: st.present, missing: st.missing }));
  const countBefore = registry.count;
  const refused = reassemble(registry, couch, 'legs');
  ok('P2f reassemble() REFUSES (null) with one piece 3 m away, and nothing changes: collider 0.77, legs still off, count unchanged',
     refused === null && Math.abs(couch.collider.halfExtents().y * 2 - 0.77) < 1e-6 &&
     (couch.state.removedParts || []).includes('legs') && registry.count === countBefore && legs2.every((l) => !!registry.get(l.id)));
  // The prompt, empty-handed at the couch: Q's line must not promise what Q cannot do.
  lookAt(me(), standOffFrom({ x: PAD.x, y: 0.45, z: PAD.z }, 1.5), { x: PAD.x, y: 0.45, z: PAD.z }, true);
  step(2);
  const d = interact.describe(me());
  ok('P2g describe().secondary matches /1 of 4 missing/ — the verb reads "find the legs (1 of 4 missing)"',
     /find the legs \(1 of 4 missing\)/.test(d.secondary || ''), `secondary "${d.secondary}" target ${d.target && d.target.kind}`);
  const said = interact.secondary(me());
  ok('P2h …and pressing Q says the same and changes nothing', /1 of 4 missing/.test(said || '') &&
     (couch.state.removedParts || []).includes('legs') && registry.count === countBefore, `"${said}"`);
  parkAt(legs2[0], PAD.x + 0.9, 0.05, PAD.z + 0.9);   // brought back within reach
  step(4);
  const d2 = interact.describe(me());
  ok('P2i with the leg brought back the line reads "put the legs back on" again', d2.secondary === 'put the legs back on', `"${d2.secondary}"`);
  const restored = reassemble(registry, couch, 'legs');
  ok('P2j …and reassemble() succeeds: 4 pieces removed, 0.85 m, nothing missing',
     !!restored && restored.piecesRemoved === 4 && Math.abs(couch.collider.halfExtents().y * 2 - 0.85) < 1e-6 &&
     Math.abs(currentDimensions(couch).y - 0.85) < 1e-9 && registry.pieceCount === 0);
}
emit('running...');

/* ── P8. the cargo box counts pieces (§10.2) ─────────────────────────────── */
lines.push('--- P8. pieces count toward cargo volume and membership (GDD §10.2, §10.5) ---');
{
  parkAt(couch, PAD.x, 0.45, PAD.z);
  const r = disassemble(registry, couch, 'legs');
  const legs = r.pieces.map((id) => registry.get(id));
  const dims = legs[0].def.dimensions;
  const zc = (I.minZ + I.maxZ) / 2;
  legs.forEach((l, i) => parkAt(l, M.truckPose.x - 0.45 + i * 0.30, I.minY + dims.y / 2 + 0.02, zc));
  step(120);
  const loaded = cargo.loadedEntities();
  ok('P8 4 legs in the truck are 4 loaded entities (cargo.loadedEntities), and nothing else is',
     loaded.length === 4 && legs.every((l) => loaded.includes(l)), loaded.map((e) => e.defId).join(','));
  const wantV = legs.reduce((s, l) => s + l.def.dimensions.x * l.def.dimensions.y * l.def.dimensions.z, 0);
  near(`P8a cargo.volumeUsed() === the sum of the piece volumes (${wantV.toFixed(6)} m3) ± 1e-4`, cargo.volumeUsed(), wantV, 1e-4);
  const pq = cargo.packQuality();
  near('P8b …and packQuality counts their mass (4 x 3.15 kg)', pq.totalMass, 4 * couch.def.mass * PARTS.partMassFraction / 4, 1e-6);
  // The couch is 50 m from its legs: a plain reassemble refuses; the fixture gathers them with force.
  ok('P8c the couch at the pickup cannot have its legs put back from the truck (reassemble refuses)', reassemble(registry, couch, 'legs') === null);
  const forced = reassemble(registry, couch, 'legs', { force: true });
  ok('P8d …and the reset\'s `force` gathers them (4 removed, collider 0.85)', !!forced && forced.piecesRemoved === 4 && registry.pieceCount === 0);
  step(10);
}
emit('running...');

/* ── P3. the manifest holds a row open until its pieces arrive (§12.3) ───── */
lines.push('--- P3. an object is delivered only when its pieces are too (GDD §12.3, §9.1, §2.2) ---');
{
  parkAt(couch, PAD.x, 0.45, PAD.z);
  const r = disassemble(registry, couch, 'legs');
  const legs = r.pieces.map((id) => registry.get(id));
  const s = slotIn('dest_living', 0);
  parkAt(couch, s.x, 0.77 / 2 + 0.06, s.z);
  step(Math.ceil(MANIFEST.dwellMs / STEP) + 120);
  const row = rowOf(couch);
  ok('P3 the couch settled in dest_living with its legs at the pickup is NOT delivered, piecesMissing 4',
     row && row.delivered === false && row.piecesMissing === 4 && row.piecesTotal === 4 && row.dwellMs >= MANIFEST.dwellMs,
     row ? `delivered ${row.delivered} missing ${row.piecesMissing} dwell ${row.dwellMs}` : 'no row');
  ok('P3a …the row records what is missing as plain data: [{part legs, 4 of 4, value 31.5}]',
     row && Array.isArray(row.partsLeft) && row.partsLeft.length === 1 && row.partsLeft[0].part === 'legs' &&
     row.partsLeft[0].missing === 4 && row.partsLeft[0].of === 4 && Math.abs(row.partsLeft[0].value - 31.5) < 1e-9,
     JSON.stringify(row && row.partsLeft));
  const ds = deliveryStatus(rows(), registry);
  const out = ds.outstanding.find((o) => o.id === row.id);
  ok('P3b deliveryStatus says why: "parts missing (4 of 4 legs)"', !!out && /parts missing \(4 of 4 legs\)/.test(out.why), out && out.why);
  const facts = { ...M.contractFacts(manifestSummary(rows())), phase: PHASES.DELIVERY };
  const obj = M.objectiveFor(facts, null);
  ok('P3c …and the objective line (M5) says so in DELIVERY', /4 loose parts/.test(obj), obj);
  const sum0 = manifestSummary(rows());
  eq('P3d manifestSummary.piecesMissing counts them', sum0.piecesMissing, 4);
  legs.forEach((l, i) => parkAt(l, s.x - 0.6 + i * 0.4, 0.05, s.z + 1.3));
  ok('P3e the four legs are inside the destination shell now', legs.every((l) => insideDestination(posOf(l))));
  stepManifest(rows(), registry, STEP);
  ok('P3f …and the row is delivered on the very next stepManifest', row.delivered === true && row.piecesMissing === 0,
     `delivered ${row.delivered} missing ${row.piecesMissing}`);
  eq('P3g manifestSummary total is still 23 — pieces are not rows', manifestSummary(rows()).total, 23);
  ok('P3h the pieces are not manifest rows themselves', legs.every((l) => !rowOf(l)));
  // Leave: couch delivered, all four legs in the zone — P4 moves two of them away.
}
emit('running...');

/* ── P5. broken cargo: the hulk stays deliverable, fragments are bodies (§26.4) ── */
lines.push('--- P5. a broken item stays deliverable and becomes trackable pieces (GDD §26.4, §8.3) ---');
const tv = byDef('tv_55_01');
{
  ok('P5-0 there is a television, and its fragility band fragments into 3', !!tv && PARTS.brokenFragmentCount[tv.def.fragility] === 3, tv && tv.def.fragility);
  tv.state.condition = 100;
  const countBefore = registry.count;
  const ledgerBefore = game.state.ledger.itemDamage.length;
  const events = [];
  const off = bus.on(EVENTS.PART_CHANGED, (e) => events.push(e));
  // The m8 drop pattern: 1.5 m onto the ground, long enough for the aggregation window to close.
  parkAt(tv, -38, tv.def.dimensions.y / 2 + 1.5, PAD.z, Math.PI / 2);
  step(150);
  damage.flush(game.clock.simTimeMs);
  off();
  const band = bandFor(tv.state.condition).name;
  const frags = (tv.state.fragments || []).map((id) => registry.get(id));
  lines.push(`      TV after the drop: condition ${tv.state.condition.toFixed(1)} (${band}), fragments ${JSON.stringify(tv.state.fragments)}`);
  ok('P5 the drop drove the TV into the \'broken\' band through damage.js', band === 'broken', `${tv.state.condition} ${band}`);
  ok(`P5a PARTS.brokenFragmentCount[${tv.def.fragility}] = 3 fragment entities exist, dynamic, each naming the TV (plain data)`,
     frags.length === 3 && frags.every((f) => f && f.body.isDynamic() && f.state.fragmentOf && f.state.fragmentOf.entityId === tv.id),
     `${frags.length}`);
  ok('P5b …registry.count rose by exactly 3 and they are category \'part\', prefab \'fragment\', replacementValue 0',
     registry.count === countBefore + 3 && frags.every((f) => f.def.category === 'part' && f.def.prefab === 'fragment' && f.def.replacementValue === 0));
  const broke = events.filter((e) => e.action === 'broken');
  ok('P5c one PART_CHANGED \'broken\' with pieces 3 was emitted (the recorder counts it)', broke.length === 1 && broke[0].pieces === 3 && broke[0].entityId === tv.id,
     JSON.stringify(broke.map((e) => [e.action, e.pieces])));
  ok('P5d the fragments are grabbable (registry.fromCollider) in the object collision group',
     frags.every((f) => registry.fromCollider(f.collider) === f && f.collider.collisionGroups() === GROUP_PRESETS.object));
  // Damage-tracked: drop a fragment from 1.5 m — it has the TV's 'extreme' fragility (0.7 m/s).
  let hits = 0;
  const off2 = bus.on(EVENTS.IMPACT, (e) => { if (e.entityId === frags[0].id) hits++; });
  parkAt(frags[0], -38, frags[0].def.dimensions.y / 2 + 1.5, PAD.z + 3.0);
  step(90);
  off2();
  ok('P5e a fragment is damage-tracked: dropping one 1.5 m raises an IMPACT with its entityId', hits >= 1, `${hits}`);
  const fragLines = game.state.ledger.itemDamage.filter((l) => frags.some((f) => f.id === l.entityId));
  ok('P5f …but its ledger lines cost 0 (replacementValue 0 — the broken band already charged the item)', fragLines.every((l) => l.cost === 0), JSON.stringify(fragLines.map((l) => l.cost)));

  // The hulk is still deliverable: park it in its room, fragments left at the pickup.
  const s = slotIn('dest_living', 1);
  parkAt(tv, s.x, tv.def.dimensions.y / 2 + 0.06, s.z, Math.PI / 2);
  step(Math.ceil(MANIFEST.dwellMs / STEP) + 120);
  const row = rowOf(tv);
  ok('P5g the hulk delivered to its zone completes its row with the fragments still at the pickup (§26.4 "stays deliverable")',
     row && row.delivered === true && row.piecesMissing === 0 && row.fragmentsLeft === 3,
     row ? `delivered ${row.delivered} missing ${row.piecesMissing} fragmentsLeft ${row.fragmentsLeft}` : 'no row');
  const ledgerTotal = Number(game.state.ledger.itemDamage.reduce((a, l) => a + l.cost, 0).toFixed(2));
  const inv = buildInvoice(game.state, manifestSummary(rows()), { recoveries: 0, collisions: 0 });
  const itemLine = inv.lines.find((l) => l.kind === LINE_KINDS.ITEM_DAMAGE);
  near('P5h the invoice\'s item-damage line equals the ledger to the cent — fragments changed nothing in amount', itemLine ? -itemLine.amount : 0, ledgerTotal, 0.01);
  ok('P5i …and there is no parts-left line for fragments', !inv.lines.some((l) => l.kind === LINE_KINDS.PARTS_LEFT));
  ok('P5j the TV was broken by the same drop m8 uses: at least one ledger line names it in the broken band',
     game.state.ledger.itemDamage.length > ledgerBefore && game.state.ledger.itemDamage.some((l) => l.entityId === tv.id && l.band === 'broken'));
}
emit('running...');

/* ── P4. the invoice names what was lost (§15.1) ─────────────────────────── */
lines.push('--- P4. parts left at pickup are a §15.1 line, re-derived by reconcile() (GDD §15.1) ---');
{
  const legs = ((couch.state.parts || {}).legs || []).map((id) => registry.get(id));
  ok('P4-0 the couch is delivered with all four legs in the zone (P3 left it so)', legs.length === 4 && rowOf(couch).delivered === true);
  parkAt(legs[0], PAD.x, 0.05, PAD.z + 2.0);
  parkAt(legs[1], PAD.x + 0.5, 0.05, PAD.z + 2.0);   // two legs "left at pickup"
  step(60);
  const row = rowOf(couch);
  ok('P4a two legs away: the row reopens (not delivered, piecesMissing 2)', row.delivered === false && row.piecesMissing === 2,
     `delivered ${row.delivered} missing ${row.piecesMissing}`);
  const summary = manifestSummary(rows());
  const opts = { recoveries: 0, collisions: 0 };
  const inv = buildInvoice(game.state, summary, opts);
  const line = inv.lines.filter((l) => /parts left/.test(l.kind) || /parts left/.test(l.detail));
  const share = couch.def.replacementValue * PARTS.partMassFraction / 4;
  const want = Number((2 * share * PARTS.leftBehindCostFraction).toFixed(2));
  ok('P4 exactly one §15.1 line matches /parts left/', line.length === 1 && line[0].kind === LINE_KINDS.PARTS_LEFT, inv.lines.map((l) => l.kind).join(' | '));
  near(`P4b …amount === 2 x replacementValue share (${share}) x PARTS.leftBehindCostFraction (${PARTS.leftBehindCostFraction}) = ${want} to the cent`,
       line.length ? -line[0].amount : 0, want, 0.005);
  ok('P4c …it names the object and the count ("couch 3seat: 2 of 4 legs") and cites the manifest row',
     line.length === 1 && /couch 3seat: 2 of 4 legs/.test(line[0].detail) && line[0].from.length === 1 && line[0].from[0] === row.id,
     line.length ? `${line[0].detail} from ${line[0].from}` : '');
  const rec = reconcile(inv, game.state, opts);
  ok('P4d reconcile() re-derives it from the manifest rows and agrees', rec.ok, rec.problems.join(' | '));
  const tampered = JSON.parse(JSON.stringify(inv));
  tampered.lines.find((l) => l.kind === LINE_KINDS.PARTS_LEFT).amount = -(want + 10);
  tampered.profit = Number((tampered.profit - 10).toFixed(2));
  const bad = reconcile(tampered, game.state, opts);
  ok('P4e …and refuses a parts-left line that does not match the rows', !bad.ok && bad.problems.some((p) => /parts left/.test(p)), bad.problems.join(' | '));
  ok('P4f partsLeftBehind(state) is the evidence: one record, 2 of 4 legs, cost ' + want,
     (() => { const l = partsLeftBehind(game.state); return l.length === 1 && l[0].missing === 2 && l[0].of === 4 && l[0].cost === want; })());
  /* §15.2 keeps only the three MOST SALIENT tags, and this run also broke a television and
   * lost money — both outrank a pair of legs. So the tag is asserted on the same manifest
   * with a clean ledger and a complete summary, where it is the most remarkable thing. */
  const quiet = reviewFor({ ...inv, profit: Math.abs(inv.profit) }, { ...game.state, ledger: { itemDamage: [], propertyDamage: [] }, tripCount: 1 },
                          { ...summary, complete: true, roomAccuracy: 1, delivered: summary.total }, { recoveries: 0 });
  ok('P4g the review carries the parts_left_behind tag off the same rows, and leads with it when nothing louder happened (§15.2 actual event tags)',
     quiet.tags[0] === 'parts_left_behind' && /legs are in the old house/.test(quiet.text), `${quiet.tags.join(',')} "${quiet.text}"`);
  const loud = reviewFor(inv, game.state, summary, opts);
  ok('P4g2 …and with a broken TV and a loss on the same job it is outranked, not lost: the three salient tags are the louder ones',
     loud.tags.length === 3 && !loud.tags.includes('parts_left_behind') && loud.tags.includes('broke_something_expensive'), loud.tags.join(','));

  // Settle with 2 legs and 3 fragments left behind: the run summary counts them (P7).
  M.settle();
  const rs = M.runSummary();
  ok('P7 the M6 run summary counts piecesCreated (the 3 fragments went through the bus) and piecesLeftBehind (2 legs + 3 fragments = 5)',
     rs && rs.counters && rs.counters.piecesCreated === 3 && rs.counters.piecesLeftBehind === 5,
     rs && rs.counters ? `created ${rs.counters.piecesCreated} left ${rs.counters.piecesLeftBehind}` : 'no summary');
  ok('P7a the settled invoice on the sheet carries the parts-left line', M.invoiceScreen.el.textContent.includes(LINE_KINDS.PARTS_LEFT));

  // …and with every piece delivered the line is absent (re-derived from the same rows).
  M.invoiceScreen.hide(); game.setPaused(false);
  legs.forEach((l, i) => parkAt(l, slotIn('dest_living', 0).x - 0.6 + i * 0.4, 0.05, slotIn('dest_living', 0).z + 1.3));
  step(60);
  const inv2 = buildInvoice(game.state, manifestSummary(rows()), opts);
  ok('P4h with all pieces delivered the line is absent, the row is delivered, and reconcile() still agrees',
     !inv2.lines.some((l) => l.kind === LINE_KINDS.PARTS_LEFT) && rowOf(couch).delivered === true && reconcile(inv2, game.state, opts).ok,
     inv2.lines.map((l) => l.kind).join(' | '));
  // Put two legs back at the pickup for the reset test: 4 legs and 3 fragments loose.
  parkAt(legs[0], PAD.x, 0.05, PAD.z + 2.0);
  parkAt(legs[1], PAD.x + 0.5, 0.05, PAD.z + 2.0);
  step(10);
}
emit('running...');

/* ── P7. serializability (§22.4) ─────────────────────────────────────────── */
lines.push('--- P7. plain data everywhere (GDD §22.4; m0 E8 pattern) ---');
{
  const roundTrips = (v) => { try { JSON.parse(JSON.stringify(v)); return true; } catch (e) { return false; } };
  ok('P7b game.state JSON round-trips with parts, pieces and fragments live', roundTrips(game.state));
  ok('P7c registry.snapshot() JSON round-trips, and piece states are plain (partOf / fragmentOf are ids and numbers)',
     roundTrips(registry.snapshot()) && registry.pieces().every((p) => {
       const l = p.state.partOf || p.state.fragmentOf;
       return typeof l.entityId === 'string' && typeof l.index === 'number' && typeof l.defId === 'string';
     }));
  ok('P7d state.parts on the couch is {legs: [4 ids]}, strings only',
     couch.state.parts && Array.isArray(couch.state.parts.legs) && couch.state.parts.legs.length === 4 && couch.state.parts.legs.every((id) => typeof id === 'string'));
  const c = createTelemetryCounters();
  ok('P7e createTelemetryCounters() has piecesCreated and piecesLeftBehind, both 0', c.piecesCreated === 0 && c.piecesLeftBehind === 0);
  countEvent(c, { type: EVENTS.PART_CHANGED, action: 'removed', part: 'legs', pieces: 4 });
  countEvent(c, { type: EVENTS.PART_CHANGED, action: 'broken', part: 'fragments', pieces: 3 });
  countEvent(c, { type: EVENTS.PART_CHANGED, action: 'restored', part: 'legs', pieces: 4 });
  ok('P7f countEvent: removed(4) + broken(3) + restored -> piecesCreated 7, partChanges 2 (a break is not a screwdriver change)',
     c.piecesCreated === 7 && c.partChanges === 2, `created ${c.piecesCreated} partChanges ${c.partChanges}`);
  const rs = buildRunSummary(game.state, null, null, manifestSummary(rows()), null, M.recorder, {});
  ok('P7g buildRunSummary().counters carries both keys', 'piecesCreated' in rs.counters && 'piecesLeftBehind' in rs.counters);
}
emit('running...');

/* ── P6. reset removes every piece (§26.6) ──────────────────────────────── */
lines.push('--- P6. resetContract removes every loose piece (GDD §26.6 "reset removes … fragments") ---');
{
  const loose = registry.pieces();
  ok('P6-0 the fixture: 4 legs and 3 fragments loose before the reset',
     loose.filter((p) => p.state.partOf).length === 4 && loose.filter((p) => p.state.fragmentOf).length === 3 && registry.count === baselineCount + 7,
     `${loose.length} pieces, count ${registry.count} vs ${baselineCount + 7}`);
  M.resetContract();
  step(5);
  eq('P6 zero piece entities remain', registry.pieceCount, 0);
  eq(`P6a registry.count === ${baselineCount} (the manifest's 23 bodies + fixtures, as at boot)`, registry.count, baselineCount);
  ok('P6b …and physics.stats.bodies is back to boot (no body leaked)', physics.stats.bodies === baselineBodies, `${physics.stats.bodies} vs ${baselineBodies}`);
  ok('P6c the couch is whole: collider 0.85, removedParts [], state.parts empty',
     Math.abs(couch.collider.halfExtents().y * 2 - 0.85) < 1e-6 && (couch.state.removedParts || []).length === 0 &&
     Object.keys(couch.state.parts || {}).length === 0, JSON.stringify(couch.state.parts));
  ok('P6d the TV is whole: condition 100, no fragments recorded, so it can break again next run',
     tv.state.condition === 100 && tv.state.fragments === undefined, JSON.stringify(tv.state.fragments));
  ok('P6e no manifest row remembers missing pieces', rows().every((r) => !r.piecesMissing && !(r.partsLeft || []).length));
  ok('P6f the pieces\' ids resolve to nothing', loose.every((p) => !registry.get(p.id)));
  ok('P6g game.state still JSON round-trips after the reset', (() => { try { JSON.parse(JSON.stringify(game.state)); return true; } catch (e) { return false; } })());
  // The three-run soak (tools/m14-soak-tests.js) is the equality proof over runs; run it beside this suite.
}
emit('running...');

/* ── P9. the piece prefabs obey m13 A1/A2 (§13.4) ─────────────────────────── */
lines.push('--- P9. every derived piece prefab fits inside its own dimensions, centred (GDD §13.4; m13 A1/A2) ---');
{
  const defs = derivedDefs();
  const TOL = 0.001;
  const over = [], off = [], invalid = [];
  for (const def of defs) {
    const p = validateDef(def);
    if (p.length) invalid.push(`${def.id}: ${p.join('; ')}`);
    const b = prefabBounds(def);
    const d = def.dimensions;
    if (b.size.x > d.x + TOL || b.size.y > d.y + TOL || b.size.z > d.z + TOL) {
      over.push(`${def.id} ${b.size.x.toFixed(3)}x${b.size.y.toFixed(3)}x${b.size.z.toFixed(3)} vs ${d.x}x${d.y}x${d.z}`);
    }
    if (Math.abs(b.centre.x) > 0.02 || Math.abs(b.centre.y) > 0.02 || Math.abs(b.centre.z) > 0.02) {
      off.push(`${def.id} centre ${b.centre.x.toFixed(3)},${b.centre.y.toFixed(3)},${b.centre.z.toFixed(3)}`);
    }
  }
  const parts = defs.filter((d) => d.partOf).length, frags = defs.filter((d) => d.fragmentOf).length;
  lines.push(`      ${defs.length} derived definitions: ${parts} piece kinds, ${frags} fragment kinds`);
  ok('P9 every derived definition passes validateDef', invalid.length === 0, invalid.join(' | '));
  ok('P9a no piece prefab exceeds its declared dimensions (1 mm)', over.length === 0, over.join(' | '));
  ok('P9b every piece prefab is centred on its collider', off.length === 0, off.join(' | '));
  ok('P9c …checked against the whole table: 7 authored parts (couch, chair, side table, TV, bookshelf, wardrobe, fridge)', parts === 7, `${parts}`);
  ok('P9d every piece prefab builds a non-empty group', defs.every((d) => buildPrefab(d).children.length > 0));
  const wardrobeDoor = pieceDefFor(OBJECT_DEFS.wardrobe_01, OBJECT_DEFS.wardrobe_01.disassembly[0]);
  near('P9e a wardrobe door weighs 75 x 0.14 / 2 = 5.25 kg', wardrobeDoor.mass, 5.25, 1e-9);
  ok('P9f pieceDefFor is memoised — the same object each call (a stable def per entity)',
     pieceDefFor(OBJECT_DEFS.wardrobe_01, OBJECT_DEFS.wardrobe_01.disassembly[0]) === wardrobeDoor);
}

/* ── P10. the validator (§24.4) ─────────────────────────────────────────── */
lines.push('--- P10. an authored part must have a shape (GDD §24.4) ---');
{
  const bad = { ...OBJECT_DEFS.couch_3seat_01, disassembly: [{ part: 'legs', tool: 'screwdriver', seconds: 60, reversible: true, shrinksTo: { x: 2.1, y: 0.77, z: 0.9 } }] };
  const p = validateDef(bad);
  ok('P10 a disassembly entry without `piece` is rejected by validateDef, naming the part', p.some((s) => /legs.*piece/.test(s)), p.join(' | '));
  const every = Object.values(OBJECT_DEFS).flatMap((d) => d.disassembly || []);
  ok('P10a every authored part in the table has piece {name, count, dims, prefab}',
     every.length >= 7 && every.every((e) => e.piece && e.piece.name && e.piece.count >= 1 && e.piece.dims && e.piece.prefab), `${every.length} parts`);
  ok('P10b a piece definition is exempt from the mass-class floor (a chair leg is 0.245 kg)',
     validateDef(pieceDefFor(OBJECT_DEFS.chair_dining_01, OBJECT_DEFS.chair_dining_01.disassembly[0])).length === 0 &&
     Math.abs(pieceDefFor(OBJECT_DEFS.chair_dining_01, OBJECT_DEFS.chair_dining_01.disassembly[0]).mass - 0.245) < 1e-9);
  void DAMAGE; void piecesOf; void route; void tools;
}

} catch (e) {
  fails++;
  lines.push(`FAIL  suite threw  <- ${e && e.message}`);
  lines.push((e && e.stack || '').split('\n').slice(0, 6).join('\n'));
}

emit();
