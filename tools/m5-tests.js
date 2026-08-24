/* Phase 5 suite — the house puzzle.
 *
 * §25.2 gate under test: "Pickup, 15-25 objects, manifest and zones" →
 * **all objects recoverable and movable**.
 *
 * The gate is two universal claims, and universal claims deserve exhaustive tests rather
 * than a sample. Every row of the manifest is checked, not a representative few:
 *
 *   MOVABLE     — the game's own maximum capability (two movers, one hand each, at opposite
 *                 ends) can displace it. This is what catches an object welded into a wall,
 *                 spawned inside another, given infinite mass, or built with a collider that
 *                 does not match its mesh.
 *   RECOVERABLE — it can come back from outside the world, on the transform it was last
 *                 genuinely settled on. §2.2 makes this a design requirement, not a nicety:
 *                 "a dropped object is now somewhere inconvenient", not gone, and an object
 *                 lost for good would be a hard fail §12.2 does not permit.
 *
 * Plus the house itself: three rooms, two interior openings on PERPENDICULAR axes (§13.1's
 * "doorway turn"), and every object starting somewhere named.
 */

import { SIM, MANIFEST, RECOVERY, DAMAGE } from '../src/config.js';
import { OBJECT_DEFS, PHASE5_SPAWNS, validateAllDefs } from '../src/objects/definitions.js';
import {
  ZONES, INTERIOR_DOORS, PARTITIONS, ROUTES, ROOM,
  zoneAt, zoneById, overlappingZones, wallSegments, tightestOnRoute,
} from '../src/world/house.js';
import {
  buildManifest, validateManifest, overlappingSpawns, manifestSummary,
  containedFraction, substantiallyInside, stepManifest,
} from '../src/contract/manifest.js';
import { APERTURES, minProjectedWidth } from '../src/render/scene.js';

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

/* ── driving helpers (same step order as main.js) ────────────────────────── */
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

/** Aim a mover's OWN rig and grab. See the longer note on the identical helper in
 *  m4-tests.js: rigs became per-mover in Phase 12, and aiming the wrong one reads as
 *  "this 110 kg object cannot be moved by two people" rather than as a fixture error. */
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

/* Empty ground well away from the house, so a movability test measures the OBJECT rather
 * than the furniture it happens to be wedged against. Ground spans +/-100.
 *
 * ONE SLOT PER OBJECT, and that is not tidiness — it is the fix for a real bug in the first
 * version of this suite. Every object was staged at the same coordinate and left there, so
 * by the fourth test the pad held a heap of furniture and each new arrival spawned inside
 * it. 17 of 23 objects "failed" to move, with the couch and armchair passing only because
 * they went first. The objects were fine; the fixture was standing on itself.
 *
 * 8 m apart is wider than the longest object (2.10 m) plus two movers' standing room. */
const PAD = { x: 40, z: 40, pitch: 8, perRow: 5 };
const slotFor = (i) => ({
  x: PAD.x + (i % PAD.perRow) * PAD.pitch,
  z: PAD.z + Math.floor(i / PAD.perRow) * PAD.pitch,
});

/**
 * THE MOVABILITY TEST, run on every manifest row.
 *
 * Two movers, one hand each, at opposite ends — the most force the game can bring to bear
 * (m4 measured 895 N that way, against 458 N for one). If an object will not move under
 * that, it is stuck, and Phase 5's gate is false for it.
 *
 * Objects are staged on empty ground rather than tested in place. "Can the game move this
 * object" and "is this object wedged behind a wardrobe" are different questions, and only
 * the first is what `movable` means; where each object STARTS is asserted separately by B2.
 */
function movabilityOf(entity, slotIndex) {
  releaseAll();
  const d = entity.def.dimensions;
  const y0 = d.y / 2 + 0.02;
  const S = slotFor(slotIndex);
  parkAt(entity, S.x, y0, S.z);

  // Stand clear of the object's own footprint, then reach in. 0.85 m of standing room plus
  // half the object keeps the capsule outside it at spawn while staying inside GRIP.reach.
  const standOff = d.x / 2 + 0.85;
  placeMover(movers[0], S.x - standOff, S.z);
  placeMover(movers[1], S.x + standOff, S.z);
  step(25);

  // Aim at the object's own centre height, but never above what an arm can reach.
  const aimY = Math.min(y0, 1.35);
  const grabX = Math.min(d.x / 2, 0.95);
  const a = grabWith(movers[0], 'right', { x: S.x - grabX, y: aimY, z: S.z });
  const b = grabWith(movers[1], 'right', { x: S.x + grabX, y: aimY, z: S.z });

  const from = posOf(entity);
  const it = { move: { x: 0, y: -1 }, yaw: 0 };     // both haul backwards, in +z
  step(150, { [movers[0].id]: it, [movers[1].id]: it });
  const to = posOf(entity);

  const moved = Math.hypot(to.x - from.x, to.z - from.z);
  releaseAll();
  return { moved, gripped: (a ? 1 : 0) + (b ? 1 : 0) };
}

/** Put everything back where the contract starts. Later sections read zones and delivery,
 *  and a house whose furniture is all parked in a field 40 m away would quietly pass them. */
function restoreAllToSpawn() {
  releaseAll();
  PHASE5_SPAWNS.forEach((s, i) => {
    const e = registry.get(rows[i].entityId);
    if (!e) return;
    parkAt(e, s.x, s.y, s.z);
    e.state.lastStable = { x: s.x, y: s.y, z: s.z };
  });
  step(30);
}

/** THE RECOVERABILITY TEST. Throw it out of the world, then bring it back (§18.3). */
function recoverabilityOf(entity) {
  releaseAll();
  const home = { ...entity.state.lastStable };
  entity.body.setTranslation({ x: home.x, y: -40, z: home.z }, true);
  entity.body.setLinvel({ x: 0, y: -5, z: 0 }, true);
  registry.recover(entity);
  const back = posOf(entity);
  return {
    home,
    back,
    dx: Math.hypot(back.x - home.x, back.z - home.z),
    aboveFloor: back.y > RECOVERY.objectFloorY,
  };
}

const rows = game.state.manifest;

try {
/* ── A. the manifest (§12.1, §13.2, §24.4) ───────────────────────────────── */
lines.push('--- A. the manifest (GDD §12.1, §13.2, §24.4) ---');
{
  ok('A1 the manifest is populated', rows.length > 0, `${rows.length} rows`);
  ok(`A2 §13.1's "roughly 15-25" objects`,
     rows.length >= MANIFEST.minObjects && rows.length <= MANIFEST.maxObjects,
     `${rows.length} objects`);
  ok('A3 every row has a stable string id (§22.4)',
     rows.every((r) => typeof r.id === 'string' && r.id.length > 0));
  ok('A4 …and the ids are distinct', new Set(rows.map((r) => r.id)).size === rows.length);
  ok('A5 every row resolves to a live entity',
     rows.every((r) => !!registry.get(r.entityId)),
     `${rows.filter((r) => !registry.get(r.entityId)).length} dangling`);
  ok('A6 every row names a destination zone (§12.1)',
     rows.every((r) => typeof r.toZone === 'string' && r.toZone.length > 0));

  // §24.4's validators, run against the shipped content rather than a fixture.
  const problems = validateManifest(PHASE5_SPAWNS);
  ok('A7 the spawn table passes content validation (§24.4)',
     problems.length === 0, problems.slice(0, 3).join(' | '));
  const overlaps = overlappingSpawns(PHASE5_SPAWNS);
  ok('A8 no two objects start inside each other',
     overlaps.length === 0,
     overlaps.slice(0, 3).map(([i, j]) => `${PHASE5_SPAWNS[i].def}/${PHASE5_SPAWNS[j].def}`).join(' | '));
  const zoneBad = overlappingZones();
  ok('A9 no two zones overlap (§12.3 would be undecidable)',
     zoneBad.length === 0, zoneBad.map((p) => p.join('+')).join(' | '));

  ok('A10 state with a manifest is still JSON-serializable (§22.4)',
     (() => { try { JSON.parse(JSON.stringify(game.state)); return true; } catch (e) { return false; } })());

  /* §13.2's category table, asserted as counts. This is the difference between "we added
   * some furniture" and "we built the manifest the design asked for". */
  /* Counted by DECLARED category, not inferred from mass class. The first version inferred,
   * and got 6 "small furniture" against §13.2's ceiling of 5 — because it was counting the
   * framed mirror, which is light and small and is really §13.2's fragile/high-value row.
   * The design table and the §6.3 mass bands are different axes and neither implies the
   * other, so the definitions declare where they sit and this asserts against that. */
  const defOf = (r) => OBJECT_DEFS[r.defId];
  const inCat = (c) => rows.filter((r) => defOf(r).category === c).length;
  const boxes = inCat('box'), small = inCat('small'), medium = inCat('medium');
  const large = inCat('large'), fragile = inCat('fragile'), showcase = inCat('showcase');

  lines.push(`      boxes ${boxes} · small ${small} · medium ${medium} · large ${large} · ` +
             `fragile ${fragile} · showcase ${showcase}  (total ${rows.length})`);
  ok('A11 §13.2 cardboard boxes: 6-10', boxes >= 6 && boxes <= 10, `${boxes}`);
  ok('A12 §13.2 small furniture: 3-5', small >= 3 && small <= 5, `${small}`);
  ok('A13 §13.2 medium furniture: 3-4', medium >= 3 && medium <= 4, `${medium}`);
  ok('A14 §13.2 large furniture: 2-3', large >= 2 && large <= 3, `${large}`);
  ok('A15 §13.2 fragile/high value: 1-2', fragile >= 1 && fragile <= 2, `${fragile}`);
  ok('A16 §13.2 exactly one showcase object', showcase === 1, `${showcase}`);
  ok('A17 every object declares a §13.2 category',
     rows.every((r) => !!defOf(r).category));
  eq('A18 the categories account for every object',
     boxes + small + medium + large + fragile + showcase, rows.length);

  // §8.3: "a fragile television and a cheap box should not share a generic hit-point curve."
  // The spread is what makes that statement mean something later.
  const values = rows.map((r) => defOf(r).replacementValue);
  ok('A19 replacement values span an order of magnitude (§8.3)',
     Math.max(...values) >= Math.min(...values) * 10,
     `${Math.min(...values)} to ${Math.max(...values)}`);

  const sum = manifestSummary(rows);
  eq('A20 nothing is delivered before the contract starts', sum.delivered, 0);
  eq('A21 …so everything is still outstanding', sum.remaining, rows.length);
}
emit('running...');

/* ── B. the house (§13.1, §8.1) ──────────────────────────────────────────── */
lines.push('--- B. the house and its route (GDD §13.1, §8.1) ---');
{
  const pickupRooms = ZONES.filter((z) => z.site === 'pickup' && z.minZ >= ROOM.minZ && z.maxZ <= ROOM.maxZ);
  ok('B1 §13.1\'s "2-3 rooms" exist', pickupRooms.length >= 2 && pickupRooms.length <= 3,
     pickupRooms.map((z) => z.id).join(', '));

  const outside = PHASE5_SPAWNS.filter((s) => !zoneAt({ x: s.x, y: s.y, z: s.z }));
  ok('B2 every object starts inside a named zone', outside.length === 0,
     outside.map((s) => s.def).join(', '));

  /* §13.1's DOORWAY TURN. Two openings on perpendicular axes is what makes it a turn
   * rather than a corridor — with both on the same axis you could walk a couch straight
   * through without ever rotating it, and the route would teach nothing. */
  const axes = new Set(INTERIOR_DOORS.map((d) => d.axis));
  ok('B3 the interior doorways are on perpendicular axes — §13.1\'s "doorway turn"',
     axes.size === 2, [...axes].join('+'));
  ok('B4 …and there are at least two of them', INTERIOR_DOORS.length >= 2);

  // The route to the deepest room passes through three openings, one of them a turn.
  ok('B5 the bedroom is three openings deep', ROUTES.bedroom.length === 3,
     ROUTES.bedroom.join(' -> '));

  /* THE CENTRAL CLEARANCE CLAIM, restated for the house rather than for one wall. The
   * couch's narrowest presentation is 0.850 m in every rotation (m0 C-series). Every
   * opening on its route must exceed that, or the contract contains an object that cannot
   * reach its own room — a hard denial §2.1 forbids, arriving through level geometry. */
  const couch = OBJECT_DEFS.couch_3seat_01.dimensions;
  const narrowest = minProjectedWidth(couch.z, couch.y);
  const tightest = tightestOnRoute('bedroom', APERTURES);
  ok('B6 the couch can physically reach the bedroom (§2.1 no accidental hard denial)',
     narrowest <= tightest,
     `couch ${narrowest.toFixed(3)} m vs tightest opening ${tightest.toFixed(3)} m`);
  ok('B7 …but only just: under 100 mm of clearance',
     tightest - narrowest < 0.10,
     `${((tightest - narrowest) * 1000).toFixed(0)} mm`);

  // The 32" front aperture remains impossible for the couch — the Phase 0 fact, unchanged.
  const tiny = APERTURES.find((a) => a.id === 'interior32');
  ok('B8 the 32" opening still refuses the couch, as it always has',
     narrowest > tiny.gap, `${narrowest.toFixed(3)} > ${tiny.gap}`);

  /* Wall segments must account for exactly the wall minus its openings. If they do not,
   * either a doorway is walled up (invisible collider in a visible gap) or a stretch of
   * wall is missing (you can walk through the wall beside the door). */
  for (const p of PARTITIONS) {
    const segs = wallSegments(p);
    const solid = segs.reduce((n, s) => n + (s.hi - s.lo), 0);
    const doors = INTERIOR_DOORS.filter((d) => d.axis === p.axis && Math.abs(d.at - p.at) < 1e-6);
    const openings = doors.reduce((n, d) => n + d.gap, 0);
    const full = Math.abs(p.to - p.from);
    ok(`B9 partition ${p.id}: solid + openings equals the whole wall`,
       Math.abs(solid + openings - full) < 1e-6,
       `${solid.toFixed(3)} + ${openings.toFixed(3)} vs ${full.toFixed(3)}`);
  }

  // The openings must actually be holes in the built collider set, not just data.
  const cols = M.world.colliders;
  const blocking = (x, z) => cols.some((c) =>
    x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ && c.base < 1.0);
  for (const d of INTERIOR_DOORS) {
    const cx = d.axis === 'x' ? d.centre : d.at;
    const cz = d.axis === 'x' ? d.at : d.centre;
    ok(`B10 doorway ${d.id} is a real hole at floor level`, !blocking(cx, cz),
       'a collider fills the visible opening');
  }
}
emit('running...');

/* ── C. THE GATE, half 1: every object is MOVABLE ────────────────────────── */
lines.push('--- C. every object is movable (GDD §25.2 phase-5 gate) ---');
{
  const stuck = [], ungrabbed = [];
  let worst = { id: null, moved: Infinity };

  for (const row of rows) {
    const e = registry.get(row.entityId);
    if (!e) continue;
    const r = movabilityOf(e, rows.indexOf(row));
    if (r.gripped === 0) ungrabbed.push(row.defId);
    if (r.moved < 0.15) stuck.push(`${row.defId} ${r.moved.toFixed(3)}m`);
    if (r.moved < worst.moved) worst = { id: row.defId, moved: r.moved };
  }

  ok('C1 every manifest object could be gripped by at least one mover',
     ungrabbed.length === 0, ungrabbed.join(', '));
  ok('C2 EVERY manifest object moves under two movers — the gate',
     stuck.length === 0, stuck.join(' | '));
  lines.push(`      hardest to shift: ${worst.id} at ${worst.moved.toFixed(3)} m`);
  ok('C3 …including the 110 kg showcase object',
     !stuck.some((s) => s.startsWith('fridge')), stuck.join(' | '));
  restoreAllToSpawn();
}
emit('running...');

/* ── D. THE GATE, half 2: every object is RECOVERABLE ────────────────────── */
lines.push('--- D. every object is recoverable (GDD §18.3, §2.2) ---');
{
  const lost = [], misplaced = [];
  for (const row of rows) {
    const e = registry.get(row.entityId);
    if (!e) continue;
    const r = recoverabilityOf(e);
    if (!r.aboveFloor) lost.push(row.defId);
    if (r.dx > 0.05) misplaced.push(`${row.defId} ${r.dx.toFixed(2)}m off`);
  }
  ok('D1 EVERY object comes back from outside the world — the other half of the gate',
     lost.length === 0, lost.join(', '));
  ok('D2 …onto the transform it was last settled on', misplaced.length === 0,
     misplaced.slice(0, 4).join(' | '));

  /* The AUTOMATIC path, tested once and properly: an object that falls out of the world
   * must rescue itself after §18.3's grace, with nobody asking it to. */
  releaseAll();
  const probe = registry.get(rows[0].entityId);
  parkAt(probe, PAD.x, 0.6, PAD.z);
  step(40);                                   // let it settle so lastStable is real here
  const banked = { ...probe.state.lastStable };
  probe.body.setTranslation({ x: PAD.x, y: -30, z: PAD.z }, true);
  const graceSteps = Math.ceil(RECOVERY.outOfBoundsGraceSeconds * 1000 / STEP);

  step(Math.floor(graceSteps * 0.5));
  const midway = posOf(probe);
  ok('D3 an object below the world is NOT rescued instantly', midway.y < 0,
     `y ${midway.y.toFixed(2)} — recovered before the grace elapsed`);

  step(graceSteps + 20);
  const after = posOf(probe);
  ok('D4 …and IS rescued once §18.3\'s grace elapses', after.y > 0,
     `y ${after.y.toFixed(2)} after ${RECOVERY.outOfBoundsGraceSeconds}s`);
  ok('D5 …back where it was last settled',
     Math.hypot(after.x - banked.x, after.z - banked.z) < 0.2,
     `${Math.hypot(after.x - banked.x, after.z - banked.z).toFixed(2)} m away`);
  ok('D6 …and the rescue is counted, so Phase 10 can charge for it',
     (probe.state.recoveries || 0) > 0, `${probe.state.recoveries || 0}`);

  /* §2.2 and §12.2: recovery restores POSITION, never condition. A rescued object is still
   * a damaged object — "failure becomes state". If this ever starts healing things, the
   * whole consequence model quietly stops working. */
  probe.state.condition = 55;
  registry.recover(probe);
  eq('D7 recovery does not repair damage (§2.2 failure is state)', probe.state.condition, 55);
}
emit('running...');

/* ── E. zones and §12.3 delivery ─────────────────────────────────────────── */
lines.push('--- E. zones and delivery (GDD §12.3) ---');
{
  const living = zoneById('living_room');
  const dims = { x: 1.0, y: 1.0, z: 1.0 };
  const mid = { x: (living.minX + living.maxX) / 2, y: 0.5, z: (living.minZ + living.maxZ) / 2 };

  ok('E1 a point in the middle of a room is in that room', zoneAt(mid).id === 'living_room');
  ok('E2 …and a point outside the house is not in any room',
     (zoneAt({ x: 40, y: 0.5, z: 40 }) || {}).id !== 'living_room');
  ok('E3 an object at the centre is fully contained',
     containedFraction(living, mid, dims) > 0.99,
     `${containedFraction(living, mid, dims).toFixed(3)}`);

  /* §12.3's "substantially inside" is a FRACTION, not full containment, and this is the
   * assertion that keeps it that way. An object half over the threshold must still count,
   * or a couch delivered to a small room becomes undeliverable — an accidental hard denial
   * of exactly the kind §2.1 forbids. */
  // 0.65 of the footprint inside, not 0.60: sitting exactly ON the threshold made this fail
  // on a float, 5.0 - 4.4 being 0.5999999999999996. The claim is about the rule, not the edge.
  const onEdge = { x: living.maxX - 0.15, y: 0.5, z: mid.z };
  const frac = containedFraction(living, onEdge, dims);
  ok('E4 an object overhanging the doorway is still substantially inside (§2.1)',
     frac >= MANIFEST.containedFraction && frac < 1.0, `${frac.toFixed(3)}`);
  const wayOut = { x: living.maxX + 0.45, y: 0.5, z: mid.z };
  ok('E5 …but one mostly outside is not',
     !substantiallyInside(living, wayOut, dims),
     `${containedFraction(living, wayOut, dims).toFixed(3)}`);

  /* §12.3's dwell. A thrown object passing through the right room must not bank credit on
   * the frame it crosses, and the only way to be sure is to check that a MOVING object in
   * the right place scores nothing.
   *
   * TESTED AT THE DESTINATION, not in the pickup living room. When this was written the
   * destination site did not exist and a pickup zone stood in for one; Phase 9 built the real
   * thing, and `delivered` now means "settled inside the destination building" — so the
   * stand-in stopped being one and E7 failed with `settled=true dwell 0`. The dwell mechanism
   * being asserted here is unchanged; only the address is. */
  const e = registry.get(rows[0].entityId);
  const dest = {
    x: (M.destShell.minX + M.destShell.maxX) / 2,
    z: M.destShell.minZ + 1.2,
  };
  const fake = [{ id: 'x', defId: e.defId, entityId: e.id, toZone: rows[0].toZone,
                  delivered: false, dwellMs: 0 }];
  parkAt(e, dest.x, 0.4, dest.z);
  e.body.setLinvel({ x: 6, y: 0, z: 0 }, true);
  e.state.settled = false;
  stepManifest(fake, registry, MANIFEST.dwellMs * 2);
  ok('E6 an object skidding through the destination is not delivered (§12.3 dwell)',
     !fake[0].delivered, `dwell ${fake[0].dwellMs}`);

  parkAt(e, dest.x, e.def.dimensions.y / 2 + 0.05, dest.z);
  step(40);                                  // let it come to rest, so `settled` is earned
  fake[0].dwellMs = 0;
  stepManifest(fake, registry, MANIFEST.dwellMs);
  ok('E7 …and one settled at the destination for the dwell IS delivered',
     fake[0].delivered, `settled=${e.state.settled} dwell ${fake[0].dwellMs}`);
}
emit('running...');

/* ── F. §2.1 — nothing refuses ───────────────────────────────────────────── */
lines.push('--- F. no hard denial (GDD §2.1, §6.3) ---');
{
  /* §6.3 is explicit that mass classes are "guidance, not gates". The cheapest way for that
   * to be violated is for someone to add a weight check to the grab path, so it is asserted
   * against the heaviest object in the contract rather than trusted. */
  releaseAll();
  const fridge = [...registry.entities.values()].find((e) => e.defId === 'fridge_01');
  ok('F1 the showcase object exists', !!fridge);
  if (fridge) {
    parkAt(fridge, PAD.x, fridge.def.dimensions.y / 2 + 0.02, PAD.z);
    placeMover(movers[0], PAD.x - 1.05, PAD.z);
    placeMover(movers[1], PAD.x + 12, PAD.z + 12);
    step(25);
    const g = grabWith(movers[0], 'right', { x: PAD.x - 0.3, y: 1.2, z: PAD.z });
    ok('F2 one mover may grab 110 kg — nothing refuses on mass (§6.3)', !!g);
    ok('F3 …and the grip is a real one, not a courtesy null', !!g && !!g.entityId);
    releaseAll();
  }

  // Every definition still declares a class the config knows, and sits inside its band.
  const badBand = Object.values(OBJECT_DEFS).filter((d) => {
    const c = { light: [1, 14], medium: [15, 45], heavy: [46, 120], extreme: [121, 400] }[d.massClass];
    return !c || d.mass < c[0] || d.mass > c[1];
  });
  ok('F4 every definition sits inside its declared §6.3 band',
     badBand.length === 0, badBand.map((d) => `${d.id} ${d.mass}`).join(', '));

  /* Every definition must name a fragility band the damage model actually has.
   *
   * This caught `very_fragile` on tv_55_01 and mirror_framed_01 — the $900 television and
   * the $480 mirror — against a DAMAGE table that only defines sturdy/normal/fragile/
   * extreme. Nothing threw, and nothing would have until Phase 8 tried to price a broken
   * TV and found no band to price it with. Asserted here rather than left to Phase 8,
   * because a content error should fail in the phase that authored it. */
  const badFragility = Object.values(OBJECT_DEFS).filter((d) => !DAMAGE.fragility[d.fragility]);
  ok('F5 every definition names a real §8.3 fragility band',
     badFragility.length === 0,
     badFragility.map((d) => `${d.id}:${d.fragility}`).join(', '));

  const allProblems = validateAllDefs();
  ok('F6 …and the whole definition set passes its own validator (§24.4)',
     Object.keys(allProblems).length === 0,
     JSON.stringify(allProblems).slice(0, 160));
}
emit('running...');

/* ── G. integration (§26.6) ──────────────────────────────────────────────── */
lines.push('--- G. integration (GDD §26.6) ---');
{
  releaseAll();
  for (const [i, m] of movers.entries()) placeMover(m, 0, 5 + i * 1.4);
  const bodiesBefore = physics.stats.bodies;
  ok('G1 the body count is real before the leak check', bodiesBefore > 0, `${bodiesBefore}`);

  for (let f = 0; f < 90; f++) M.game.frame(16.7);
  ok('G2 no bodies leak over 90 real frames', physics.stats.bodies === bodiesBefore,
     `${bodiesBefore} -> ${physics.stats.bodies}`);
  ok('G3 …with 23 objects live, not an empty world', registry.count >= MANIFEST.minObjects,
     `${registry.count} entities`);
  ok('G4 state stays JSON-serializable after a run',
     (() => { try { JSON.parse(JSON.stringify(game.state)); return true; } catch (e) { return false; } })());
  ok('G5 no error banner appeared during the suite', !document.getElementById('error-banner'));
}

} catch (e) {
  fails++;
  lines.push(`FAIL  suite threw  <- ${e && e.message}`);
  lines.push((e && e.stack || '').split('\n').slice(0, 6).join('\n'));
}

emit();
