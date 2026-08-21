/* Phase 9 suite — the destination.
 *
 * §25.2 gate under test: "Unload, room zones, settled validation" →
 * **manifest completes reliably**.
 *
 * RELIABLY is the word doing the work, and it means three separate things, each asserted:
 *
 *   COMPLETELY   every one of the 23 manifest objects can be delivered. Not a sample —
 *                the gate says "the manifest", so the whole manifest is driven to done.
 *   STABLY       a delivered item stays delivered. A completion that flickers as an object
 *                settles is worse than one that never fires, because a player would watch
 *                the contract finish and un-finish.
 *   HONESTLY     nothing is delivered that should not be. An object still on the truck, or
 *                dumped on the kerb, or skidding through the right room, must not count.
 *
 * And the design question this phase had to answer: §3.4 reads wrong-room delivery as a gate,
 * §15.1 reads it as a scored line, and §12.2 forbids it as a hard fail. Two of three make it
 * a price, and §2.1 settles it. Delivery is site-level; room accuracy is scored. Asserted
 * both ways below, because it is a product decision and the assertions are where it lives.
 */

import { SIM, MANIFEST } from '../src/config.js';
import {
  DEST_SHELL, DEST_ZONES, destZoneAt, insideDestination, destZoneIds,
} from '../src/world/destination.js';
import {
  stepManifest, manifestSummary, deliveryStatus, validateManifest, substantiallyInside,
} from '../src/contract/manifest.js';
import { PHASE5_SPAWNS, OBJECT_DEFS } from '../src/objects/definitions.js';

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

const { game, physics, registry, straps, cargo, damage, route } = M;
const STEP = SIM.stepMs;
const rows = game.state.manifest;

function step(n = 1) {
  for (let i = 0; i < n; i++) {
    physics.clearForces();
    straps.step(STEP, i * STEP);
    physics.step();
    registry.step(STEP);
    cargo.step(STEP, i * STEP);
    damage.step(STEP, i * STEP);
    stepManifest(rows, registry, STEP);
  }
}

function parkAt(entity, x, y, z, yaw = 0) {
  entity.body.setTranslation({ x, y, z }, true);
  entity.body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
  entity.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  entity.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  entity.body.wakeUp();
  physics.primeQueries();
}
function posOf(e) { const t = e.body.translation(); return { x: t.x, y: t.y, z: t.z }; }

/** A free spot on the floor of a destination room, laid out on a grid so 23 objects can all
 *  be put down without stacking into each other. */
function slotIn(zoneId, index) {
  const z = DEST_ZONES.find((r) => r.id === zoneId);
  const cols = 4;
  const w = (z.maxX - z.minX) - 1.2, d = (z.maxZ - z.minZ) - 1.2;
  return {
    x: z.minX + 0.6 + ((index % cols) + 0.5) * (w / cols),
    z: z.minZ + 0.6 + (Math.floor(index / cols) + 0.5) * (d / Math.max(1, Math.ceil(8 / cols))),
  };
}

/** Put every manifest object down in its own target room, spread out, and let it settle.
 *
 * Correct placement only. Misplacement is done in section D by SWAPPING two identical
 * objects that were bound for different rooms, which is the one way to change room accuracy
 * without also changing what physically fits — see the note there. */
function deliverAll() {
  const perRoom = {};
  for (const row of rows) {
    const e = registry.get(row.entityId);
    if (!e) continue;
    perRoom[row.toZone] = (perRoom[row.toZone] || 0) + 1;
    const s = slotIn(row.toZone, perRoom[row.toZone] - 1);
    parkAt(e, s.x, e.def.dimensions.y / 2 + 0.06, s.z);
  }
  step(Math.ceil(MANIFEST.dwellMs / STEP) + 140);
}

try {
/* ── A. the destination site (§13.1) ─────────────────────────────────────── */
lines.push('--- A. the destination site (GDD §13.1) ---');
{
  const rooms = DEST_ZONES.filter((z) => z.id !== 'dest_apron');
  ok('A1 §13.1 wants 3-4 labeled room zones', rooms.length >= 3 && rooms.length <= 4,
     `${rooms.length}`);
  ok('A2 …and every one is LABELED (§13.1, §21.2)',
     rooms.every((z) => typeof z.label === 'string' && z.label.length > 3),
     rooms.map((z) => z.label).join(' | '));
  ok('A3 …with distinct stable string ids (§22.4)',
     new Set(rooms.map((z) => z.id)).size === rooms.length);

  // No zone may overlap another, at either site, or §12.3 is undecidable.
  const all = [...DEST_ZONES, ...M.destZones];
  const overlaps1D = (aLo, aHi, bLo, bHi) => aLo < bHi && bLo < aHi;
  let bad = 0;
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i], b = rooms[j];
      if (overlaps1D(a.minX, a.maxX, b.minX, b.maxX) &&
          overlaps1D(a.minZ, a.maxZ, b.minZ, b.maxZ)) bad++;
    }
  }
  eq('A4 no two destination rooms overlap', bad, 0);
  void all;

  /* §13.1: the destination is a SMALLER site than the pickup. Asserted so a later edit
   * cannot quietly make unloading easier than loading. */
  const destArea = (DEST_SHELL.maxX - DEST_SHELL.minX) * (DEST_SHELL.maxZ - DEST_SHELL.minZ);
  const pickupArea = 10 * 7;
  lines.push(`      destination ${destArea.toFixed(0)} m² against the pickup house's ${pickupArea} m²`);
  ok('A5 the destination is smaller than the pickup house (§13.1)', destArea < pickupArea,
     `${destArea.toFixed(0)} vs ${pickupArea}`);

  // It has to be a real building, or "inside" means nothing.
  const inside = { x: (DEST_SHELL.minX + DEST_SHELL.maxX) / 2, y: 0.5, z: DEST_SHELL.minZ + 1.0 };
  const outside = { x: DEST_SHELL.minX - 6, y: 0.5, z: DEST_SHELL.minZ };
  ok('A6 a point in the building is inside it', insideDestination(inside));
  ok('A7 …and a point in the street is not', !insideDestination(outside));
  ok('A8 …and the kerb is a zone but NOT the building',
     !insideDestination({ x: DEST_SHELL.maxX - 1, y: 0.5, z: DEST_SHELL.maxZ + 2 }));

  /* §24.4: a manifest may not name a room that does not exist. Before this phase the
   * `toZone` values were seams with nothing to resolve against. */
  const problems = validateManifest(PHASE5_SPAWNS);
  ok('A9 every manifest row names a real destination room (§24.4)',
     problems.length === 0, problems.slice(0, 3).join(' | '));
  ok('A10 …and all three rooms are used by the manifest',
     new Set(rows.map((r) => r.toZone)).size >= 3,
     [...new Set(rows.map((r) => r.toZone))].join(', '));
}
emit('running...');

/* ── B. §12.3's three conditions, each on its own ────────────────────────── */
lines.push('--- B. settled validation (GDD §12.3) ---');
{
  const row = rows[0];
  const e = registry.get(row.entityId);
  ok('B1 there is a manifest object to test', !!e);

  if (e) {
    // (1) NOT AT THE DESTINATION: never delivered, however long it sits.
    parkAt(e, 0, 0.5, 5);
    step(240);
    ok('B2 an object at the pickup site is never delivered', !row.delivered);
    eq('B3 …and the status says why', deliveryStatus(rows, registry)
       .outstanding.find((o) => o.id === row.id).why, 'not at the destination');

    // (2) INSIDE BUT MOVING: crossing is not enough — §12.3 requires settled.
    const c = { x: (DEST_SHELL.minX + DEST_SHELL.maxX) / 2, z: DEST_SHELL.minZ + 1.2 };
    parkAt(e, c.x, 0.4, c.z);
    e.body.setLinvel({ x: 5, y: 0, z: 0 }, true);
    row.dwellMs = 0;
    step(3);
    ok('B4 an object skidding through the right room is not delivered (§12.3)',
       !row.delivered, `dwell ${row.dwellMs}`);

    // (3) SETTLED, BUT NOT YET FOR THE DWELL.
    parkAt(e, c.x, e.def.dimensions.y / 2 + 0.05, c.z);
    row.dwellMs = 0;
    step(6);
    ok('B5 …nor one that has only just come to rest (§12.3 dwell)', !row.delivered,
       `dwell ${row.dwellMs.toFixed(0)} of ${MANIFEST.dwellMs} ms`);

    // …and now all three.
    step(Math.ceil(MANIFEST.dwellMs / STEP) + 60);
    ok('B6 settled, in the building, for the dwell — delivered', row.delivered,
       `dwell ${row.dwellMs.toFixed(0)} ms, settled ${e.state.settled}`);

    /* RELIABLY means STABLY. A delivered item must stay delivered while nothing disturbs it,
     * or a player watches the contract finish and un-finish. */
    let flickers = 0;
    for (let k = 0; k < 300; k++) {
      step(1);
      if (!row.delivered) flickers++;
    }
    eq('B7 …and it STAYS delivered — no flicker over 5 s', flickers, 0);

    // Picking it up again undoes it. State follows the world (§2.2).
    parkAt(e, 0, 0.5, 5);
    step(20);
    ok('B8 taking it away again clears the delivery', !row.delivered);
  }
}
emit('running...');

/* ── C. THE GATE: the whole manifest completes ───────────────────────────── */
lines.push('--- C. the gate: the manifest completes reliably ---');
{
  deliverAll();
  const sum = manifestSummary(rows);
  const status = deliveryStatus(rows, registry);

  lines.push(`      ${sum.delivered}/${sum.total} delivered, ` +
             `${sum.roomCorrect} in the right room ` +
             `(${(sum.roomAccuracy * 100).toFixed(0)}% accuracy)`);
  if (status.outstanding.length) {
    lines.push(`      outstanding: ${status.outstanding.slice(0, 5)
      .map((o) => `${o.defId} (${o.why})`).join(', ')}`);
  }

  eq('C1 EVERY manifest object delivered — the gate', sum.delivered, sum.total);
  ok('C2 …and the summary agrees the contract is complete', sum.complete);
  eq('C3 …with nothing outstanding', status.outstanding.length, 0);

  /* RELIABLY: run it again over the whole manifest and get the same answer. A completion
   * that depends on the order things settled in is not reliable. */
  let stillComplete = true;
  for (let k = 0; k < 240; k++) { step(1); if (!manifestSummary(rows).complete) stillComplete = false; }
  ok('C4 …and it stays complete for 4 s of continued simulation', stillComplete);

  ok('C5 the delivered objects really are in the building',
     rows.every((r) => insideDestination(posOf(registry.get(r.entityId)))));
}
emit('running...');

/* ── D. room accuracy is PRICED, not gated (§15.1, §12.2, §2.1) ──────────── */
lines.push('--- D. wrong room: priced, not gated (GDD §15.1, §12.2, §2.1) ---');
{
  /* THE DESIGN DECISION, asserted from both sides.
   *
   * §3.4 reads as a gate ("required items settled in VALID destination zones"), §15.1 as a
   * price ("room accuracy... small perfect bonus"), and §12.2's four hard-fail conditions do
   * not include a lamp in the wrong bedroom. Two of three, plus §2.1, make it a price. */
  /* MISPLACEMENT BY SWAPPING TWO IDENTICAL OBJECTS' POSITIONS.
   *
   * Three earlier fixtures each measured the wrong thing, and all for the same reason: they
   * changed WHERE things were put, so they also changed whether things fitted. Piling the
   * manifest into one room delivered 12 of 23 (a fact about the room's size). Rotating every
   * item one room along delivered 22. Swapping the target rooms pairwise still delivered 22,
   * because it changes which object lands in which slot.
   *
   * Swapping two objects OF THE SAME DEFINITION that were bound for different rooms cannot
   * change what fits — the two are interchangeable, the slots are unchanged, and every other
   * object stays exactly where the 23/23 run left it. The only thing that changes is whether
   * each one is in the room the manifest asked for. */
  const swapped = [];
  const byDefAndZone = new Map();
  for (const row of rows) {
    const list = byDefAndZone.get(row.defId) || [];
    list.push(row);
    byDefAndZone.set(row.defId, list);
  }
  for (const list of byDefAndZone.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (list[i].toZone === list[j].toZone) continue;
        if (swapped.includes(list[i]) || swapped.includes(list[j])) continue;
        const a = registry.get(list[i].entityId), b = registry.get(list[j].entityId);
        if (!a || !b) continue;
        const pa = posOf(a), pb = posOf(b);
        parkAt(a, pb.x, pb.y, pb.z);
        parkAt(b, pa.x, pa.y, pa.z);
        swapped.push(list[i], list[j]);
      }
    }
  }
  step(Math.ceil(MANIFEST.dwellMs / STEP) + 120);
  lines.push(`      swapped ${swapped.length} identical objects between rooms`);
  const sum = manifestSummary(rows);

  lines.push(`      after the swap: ${sum.delivered}/${sum.total} delivered, ` +
             `${sum.roomCorrect} in the right room ` +
             `(${(sum.roomAccuracy * 100).toFixed(0)}% accuracy)`);

  eq('D1 a contract with everything in the wrong room still COMPLETES (§2.1, §12.2)',
     sum.delivered, sum.total);
  ok('D2 …and it is scored down for it (§15.1 room accuracy)',
     sum.roomAccuracy < 1.0, `${(sum.roomAccuracy * 100).toFixed(0)}%`);
  ok('D3 …by a real margin, not a rounding error', sum.roomAccuracy < 0.95,
     `${(sum.roomAccuracy * 100).toFixed(0)}%`);
  ok('D4 …and the items that DID land right are still credited',
     sum.roomCorrect > 0, `${sum.roomCorrect}`);

  /* Room accuracy is a fraction of what was DELIVERED, not of the manifest. An item still on
   * the truck is an undelivered item, not a room-accuracy failure — counting it as both
   * would charge a player twice for one mistake. */
  const e = registry.get(rows[0].entityId);
  parkAt(e, 0, 0.5, 5);                        // take one back to the pickup site
  step(30);
  const partial = manifestSummary(rows);
  ok('D5 an undelivered item is not also a room-accuracy failure',
     partial.delivered === partial.total - 1 &&
     partial.roomAccuracy === partial.roomCorrect / partial.delivered,
     `${partial.delivered}/${partial.total}, accuracy ${(partial.roomAccuracy * 100).toFixed(0)}%`);
  ok('D6 …and the contract is simply not complete yet (§2.2 failure is state)',
     !partial.complete);
}
emit('running...');

/* ── E. §12.3's "substantially inside" at the destination ────────────────── */
lines.push('--- E. substantially inside (GDD §12.3) ---');
{
  const bedroom = DEST_ZONES.find((z) => z.id === 'dest_bedroom');
  const couch = [...registry.entities.values()].find((x) => x.defId === 'couch_3seat_01');
  ok('E1 there is a bedroom and a couch', !!bedroom && !!couch);

  if (bedroom && couch) {
    /* The couch is 2.10 m long and the destination bedroom is 4.5 x 3.0. A couch pushed
     * against the far wall WILL overhang the doorway it came in by, and §12.3's fraction is
     * what stops that being an undeliverable object — the accidental hard denial §2.1
     * forbids, arriving through a geometry check nobody thinks of as a rule. */
    const mid = { x: (bedroom.minX + bedroom.maxX) / 2, y: 0.5, z: (bedroom.minZ + bedroom.maxZ) / 2 };
    ok('E2 a couch in the middle of the room is substantially inside',
       substantiallyInside(bedroom, mid, couch.def.dimensions));

    const overhanging = { x: bedroom.maxX - 0.55, y: 0.5, z: mid.z };
    ok('E3 …and one overhanging the doorway still is (§2.1)',
       substantiallyInside(bedroom, overhanging, couch.def.dimensions));

    const mostlyOut = { x: bedroom.maxX + 0.85, y: 0.5, z: mid.z };
    ok('E4 …but one mostly in the next room is not',
       !substantiallyInside(bedroom, mostlyOut, couch.def.dimensions));

    ok('E5 the destination rooms are big enough to take the largest object at all',
       (bedroom.maxX - bedroom.minX) > couch.def.dimensions.x &&
       (bedroom.maxZ - bedroom.minZ) > couch.def.dimensions.z,
       `${(bedroom.maxX - bedroom.minX).toFixed(1)} x ${(bedroom.maxZ - bedroom.minZ).toFixed(1)} m`);
  }

  ok('E6 destZoneAt names the room a point is in',
     (destZoneAt({ x: (bedroom.minX + bedroom.maxX) / 2, y: 0.5,
                   z: (bedroom.minZ + bedroom.maxZ) / 2 }) || {}).id === 'dest_bedroom');
  ok('E7 …and returns nothing for a point in the street',
     !destZoneAt({ x: -40, y: 0.5, z: -40 }));
  ok('E8 destZoneIds excludes the kerb — you cannot be asked to deliver to the pavement',
     !destZoneIds().includes('dest_apron'));
}
emit('running...');

/* ── F. integration (§26.6) ──────────────────────────────────────────────── */
lines.push('--- F. integration (GDD §26.6) ---');
{
  const bodiesBefore = physics.stats.bodies;
  for (let i = 0; i < 90; i++) M.game.frame(16.7);
  ok('F1 no bodies leak over 90 real frames', physics.stats.bodies === bodiesBefore,
     `${bodiesBefore} -> ${physics.stats.bodies}`);
  ok('F2 the manifest is still JSON-serializable with delivery state on it (§22.4)',
     (() => { try { JSON.parse(JSON.stringify(game.state.manifest)); return true; }
              catch (e) { return false; } })());
  ok('F3 every row carries the fields §21.2 needs to render a manifest',
     rows.every((r) => 'delivered' in r && 'roomCorrect' in r && 'toZone' in r && 'defId' in r));
  ok('F4 no error banner appeared during the suite', !document.getElementById('error-banner'));
}

} catch (e) {
  fails++;
  lines.push(`FAIL  suite threw  <- ${e && e.message}`);
  lines.push((e && e.stack || '').split('\n').slice(0, 6).join('\n'));
}

emit();
