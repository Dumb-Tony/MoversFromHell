/* The contract manifest — GDD §12.1, §12.3, §23.2, §24.4.
 *
 * §12.1 defines a manifest as "required objects, destination zones, special handling".
 * §12.3 defines what finishing one means:
 *
 *   "An object counts as delivered when substantially inside the correct room/zone and
 *    settled below velocity thresholds for a dwell time. Standard contracts do not require
 *    pixel-perfect rotation."
 *
 * Three things in that sentence are load-bearing, and each is a decision this file makes
 * explicit rather than leaving to whoever writes the check:
 *
 *   SUBSTANTIALLY INSIDE — not "touching", not "fully contained". A couch delivered to a
 *     small bedroom may legitimately stick out through the doorway it came in by. The test
 *     is the object's CENTRE plus a containment fraction of its footprint, never its full
 *     bounding box, or large objects would be undeliverable in small rooms — a hard denial
 *     §2.1 forbids, arriving through a geometry check nobody thought of as a rule.
 *
 *   SETTLED — the registry already computes this for §7.3 stability and §12.3 reuses it.
 *     One definition of "settled", not two.
 *
 *   FOR A DWELL TIME — a box skidding through the right room is not delivered. The dwell
 *     is what stops a thrown object counting on the frame it passes through.
 *
 * "Standard contracts do not require pixel-perfect rotation" is why nothing here looks at
 * orientation at all.
 *
 * NO HARD FAILS LIVE HERE. §12.2 restricts hard failure to four rare cases, none of which
 * is "an object is in the wrong room". An object in the wrong place is simply not yet
 * delivered — §2.2's "failure becomes state". This module reports; it never terminates.
 */

import { PARTS,  MANIFEST } from '../config.js';
import { ZONES, zoneAt, zoneById } from '../world/house.js';
import { DEST_ZONES, destZoneAt, insideDestination, destZoneIds } from '../world/destination.js';
import { OBJECT_DEFS } from '../objects/definitions.js';

/**
 * Build the manifest rows from the spawn table. Derived, never authored twice (§24.4).
 * @param {Array} spawns  PHASE5_SPAWNS-shaped rows
 * @returns {Array} serializable manifest rows — safe to live in game.state (§22.4)
 */
export function buildManifest(spawns) {
  return spawns.map((s, i) => ({
    /* Stable string id, never an array index (§22.4). The index is part of the STRING so
     * two identical boxes from the same definition stay distinguishable, but nothing may
     * parse it back out — it is an identifier, not a position. */
    id: `mf_${i}_${s.def}`,
    defId: s.def,
    entityId: null,               // filled when the registry spawns it
    fromZone: null,               // filled at spawn, from where it actually landed
    toZone: s.to || null,         // §12.1 destination zone; consumed at Phase 9
    handling: s.handling || '',   // §12.1 special handling
    required: true,
    delivered: false,
    dwellMs: 0,
  }));
}

/** Fraction of an object's footprint that lies inside a zone, 0..1, treating the object as
 *  an axis-aligned box of its definition's dimensions. Rotation is deliberately ignored:
 *  §12.3 says standard contracts "do not require pixel-perfect rotation", and an AABB
 *  approximation is both more forgiving and more predictable than a rotated one. */
export function containedFraction(zone, centre, dims) {
  if (!zone || !centre || !dims) return 0;
  const overlap = (lo, hi, zLo, zHi) => Math.max(0, Math.min(hi, zHi) - Math.max(lo, zLo));
  const ox = overlap(centre.x - dims.x / 2, centre.x + dims.x / 2, zone.minX, zone.maxX);
  const oz = overlap(centre.z - dims.z / 2, centre.z + dims.z / 2, zone.minZ, zone.maxZ);
  const area = dims.x * dims.z;
  return area > 0 ? (ox * oz) / area : 0;
}

/** §12.3's "substantially inside". Centre in the zone AND enough of the footprint with it. */
export function substantiallyInside(zone, centre, dims) {
  if (!zone) return false;
  const centreIn = centre.x >= zone.minX && centre.x <= zone.maxX &&
                   centre.z >= zone.minZ && centre.z <= zone.maxZ &&
                   centre.y >= zone.minY && centre.y <= zone.maxY;
  return centreIn && containedFraction(zone, centre, dims) >= MANIFEST.containedFraction;
}

/**
 * Advance delivery state for every manifest row. Pure bookkeeping over observed entity
 * state — it reads the registry and writes only the manifest rows it owns (§22.2).
 *
 * @param {Array} rows      manifest rows, mutated in place
 * @param {ObjectRegistry} registry
 * @param {number} stepMs
 * @param {Array} zones
 */
export function stepManifest(rows, registry, stepMs, zones = ZONES) {
  for (const row of rows) {
    const e = row.entityId ? registry.get(row.entityId) : null;
    if (!e) { row.dwellMs = 0; row.delivered = false; continue; }

    const t = e.body.translation();
    const centre = { x: t.x, y: t.y, z: t.z };

    /* DELIVERED IS SITE-LEVEL. IN THE RIGHT ROOM IS A SEPARATE, SCORED FACT.
     *
     * The GDD pulls three ways on this and the tie has to be broken somewhere:
     *   §3.4  Delivery exits when "required items settled in VALID destination zones" — a gate
     *   §15.1 scores ROOM ACCURACY as a line item with a "small perfect bonus" — a price
     *   §12.2 lists four hard-fail conditions and a lamp in the wrong room is not one
     *
     * Two of the three make it a price, and §2.1's "the game should rarely say no" settles
     * it. A contract can complete with every item dumped in the hallway; it simply pays less.
     * Making it a gate would mean a player who cannot find the right bedroom is stuck with a
     * finished job the game will not accept, which is the exact shape §2.1 forbids. */
    const inBuilding = insideDestination(centre);
    const settledHere = inBuilding && e.state.settled;

    if (settledHere) row.dwellMs = Math.min(MANIFEST.dwellMs, row.dwellMs + stepMs);
    else row.dwellMs = 0;

    /* ITS PIECES HAVE TO BE HERE TOO (M12; §9.1 "loose pieces get lost", §12.3 "settled
     * validation" per piece). An object whose legs are still at the pickup is not delivered
     * — its row stays in progress with `piecesMissing` saying how many, and the objective
     * line and the invoice read that count. Site-level, like the row itself: a piece counts
     * once it is inside the destination, the same test the hulk passes. FRAGMENTS of a broken
     * item are the other kind of piece (§26.4 "stays deliverable OR becomes trackable
     * pieces"): tracked here as `fragmentsLeft` for the run summary, never a gate — the
     * broken band already charged the item, and a hulk that could not be delivered without
     * every shard would be a hard denial §2.1 forbids. */
    const pieces = pieceStatusOf(e, registry);
    row.piecesTotal = pieces.total;
    row.piecesMissing = pieces.missing;
    row.partsLeft = pieces.left;
    row.fragmentsLeft = pieces.fragmentsLeft;
    row.delivered = row.dwellMs >= MANIFEST.dwellMs && row.piecesMissing === 0;

    // …and the accuracy half, recorded whether or not it is right.
    const room = destZoneAt(centre);
    row.inZone = room ? room.id : null;
    const target = zoneById(row.toZone, zones) || destZoneAt(centre, DEST_ZONES.filter((z) => z.id === row.toZone));
    row.roomCorrect = !!row.delivered && !!room && room.id === row.toZone &&
      substantiallyInside(target || room, centre, e.def.dimensions);
  }
}

/**
 * Where an object's loose pieces are, as plain data for its manifest row (M12).
 *
 * `left` is one record per detached part with pieces not at the destination — part name,
 * how many of how many, and the per-piece replacementValue share the invoice prices it at
 * (read off the piece's own derived definition, so the row carries the number and the
 * invoice never needs the entity). A piece whose entity is gone counts as missing.
 *
 * @returns {{total, missing, left: {part, name, missing, of, value}[], fragmentsLeft}}
 */
export function pieceStatusOf(entity, registry) {
  const parts = entity.state.parts || null;
  const fragments = entity.state.fragments || null;
  if (!parts && !fragments) return { total: 0, missing: 0, left: [], fragmentsLeft: 0 };
  let total = 0, missing = 0;
  const left = [];
  for (const [part, ids] of Object.entries(parts || {})) {
    let gone = 0, value = 0, name = part;
    for (const id of ids) {
      total++;
      const p = registry.get(id);
      if (p) {
        value = p.def.replacementValue;
        name = (p.def.partOf && p.def.partOf.name) || part;
        const t = p.body.translation();
        if (insideDestination({ x: t.x, y: t.y, z: t.z })) continue;
      }
      gone++;
    }
    missing += gone;
    /* Every piece gone from the registry (lost off the world and never recovered, or a
     * stale id): the share is still the parent's value × partMassFraction / count, so the
     * row is not both undeliverable AND unbilled (review minor, Phase 20). */
    if (gone > 0 && !(value > 0)) value = (entity.def.replacementValue || 0) * PARTS.partMassFraction / Math.max(1, ids.length);
    if (gone > 0) left.push({ part, name, missing: gone, of: ids.length, value });
  }
  let fragmentsLeft = 0;
  for (const id of fragments || []) {
    const p = registry.get(id);
    if (!p) { fragmentsLeft++; continue; }
    const t = p.body.translation();
    if (!insideDestination({ x: t.x, y: t.y, z: t.z })) fragmentsLeft++;
  }
  return { total, missing, left, fragmentsLeft };
}

/** Which pickup zone each manifest object is in right now. Used by the HUD and by the
 *  Phase 5 gate, which is about objects being findable and movable rather than delivered. */
export function locateAll(rows, registry, zones = ZONES) {
  const out = {};
  for (const row of rows) {
    const e = row.entityId ? registry.get(row.entityId) : null;
    if (!e) { out[row.id] = null; continue; }
    const t = e.body.translation();
    const z = zoneAt({ x: t.x, y: t.y, z: t.z }, zones);
    out[row.id] = z ? z.id : null;
  }
  return out;
}

/** §21.2 contract UX summary. Plain data; the HUD renders it and never computes it. */
export function manifestSummary(rows) {
  const total = rows.length;
  const delivered = rows.filter((r) => r.delivered).length;
  const roomCorrect = rows.filter((r) => r.roomCorrect).length;
  const byHandling = {};
  for (const r of rows) {
    const k = r.handling || 'standard';
    byHandling[k] = (byHandling[k] || 0) + 1;
  }
  return {
    total, delivered, remaining: total - delivered, byHandling,
    /** §15.1's room-accuracy line. A fraction of what was DELIVERED, not of the manifest —
     *  an item still on the truck is not a room-accuracy failure, it is an undelivered item,
     *  and mixing the two would charge a player twice for one mistake. */
    roomCorrect,
    roomAccuracy: delivered > 0 ? roomCorrect / delivered : 1,
    complete: delivered === total && total > 0,
    /** M12: detached-part pieces not at the destination (these hold rows open), and every
     *  loose piece not there — parts plus fragments — for §27.4's piecesLeftBehind. */
    piecesMissing: rows.reduce((s, r) => s + (r.piecesMissing || 0), 0),
    piecesLeft: rows.reduce((s, r) => s + (r.piecesMissing || 0) + (r.fragmentsLeft || 0), 0),
  };
}

/**
 * §3.4's Delivery exit condition, as a report rather than a verdict.
 *
 * Returns what is outstanding and why. Nothing here ends a phase or refuses one — §12.2
 * reserves hard failure for four rare cases and "the contract is not finished yet" is not
 * one of them. The caller decides; this only counts.
 */
export function deliveryStatus(rows, registry) {
  const outstanding = [];
  const counts = { away: 0, inTruck: 0, atSite: 0 };
  for (const row of rows) {
    if (row.delivered) continue;
    const e = row.entityId ? registry.get(row.entityId) : null;
    if (!e) { outstanding.push({ id: row.id, defId: row.defId, why: 'missing', where: 'away' }); counts.away++; continue; }
    const t = e.body.translation();
    const inBuilding = insideDestination({ x: t.x, y: t.y, z: t.z });
    const parts = (row.partsLeft || []).map((l) => `${l.missing} of ${l.of} ${l.part}`).join(', ');
    const w = rowWhere(row, registry);
    if (w.where === 'away') counts.away++; else if (w.where === 'truck') counts.inTruck++; else counts.atSite++;
    outstanding.push({
      id: row.id,
      defId: row.defId,
      why: !inBuilding ? 'not at the destination'
         : !e.state.settled ? 'still moving'
         : row.piecesMissing > 0 ? `parts missing (${parts})`
         : 'settling',
      /** M13: which side of the drive this row's remaining work is on — see rowWhere(). */
      where: w.where,
      piecesAway: w.piecesAway,
    });
  }
  const sum = manifestSummary(rows);
  return { ...sum, ...counts, outstanding };
}

/**
 * Which side of the drive an undelivered row's remaining work is on (M13; §3.4 "required
 * cargo loaded OR crew elects another trip"). Three answers, exclusive:
 *
 *   'truck'  the item is loaded (cargo.js writes state.loaded on the entity) — it is coming
 *            along whichever way the truck goes next;
 *   'site'   the item is in a destination zone, the kerbside apron included: it is at the new
 *            house and wants carrying in, not driving back for;
 *   'away'   anywhere else — the old house, its lawn, the road between. The truck never moves
 *            and both sites share one world (truck.js, destination.js), so "away" is "not at
 *            the destination and not on the truck", which is exactly what needs another trip.
 *
 * AND ITS PIECES (M12 holds a row open on piecesMissing): a couch at the new house whose legs
 * are still at the old one needs the trip as much as a couch that never left. `piecesAway`
 * counts the detached-part pieces that are neither loaded nor at the destination; any such
 * piece makes the row 'away' whatever the hulk is doing. Fragments of a broken item are not
 * counted — they never gate delivery (manifest.js stepManifest), so they never need a trip.
 *
 * @returns {{where: 'truck'|'site'|'away', piecesAway: number}}
 */
export function rowWhere(row, registry) {
  const e = row.entityId ? registry.get(row.entityId) : null;
  if (!e) return { where: 'away', piecesAway: 0 };
  let piecesAway = 0;
  for (const ids of Object.values(e.state.parts || {})) {
    for (const id of ids) {
      const p = registry.get(id);
      if (!p) { piecesAway++; continue; }
      if (p.state.loaded) continue;
      const pt = p.body.translation();
      if (destZoneAt({ x: pt.x, y: pt.y, z: pt.z })) continue;
      piecesAway++;
    }
  }
  if (piecesAway > 0) return { where: 'away', piecesAway };
  if (e.state.loaded) return { where: 'truck', piecesAway: 0 };
  const t = e.body.translation();
  if (destZoneAt({ x: t.x, y: t.y, z: t.z })) return { where: 'site', piecesAway: 0 };
  return { where: 'away', piecesAway: 0 };
}

/**
 * THE ONE DEFINITION OF "LEFT BEHIND" (Phase 11 build-side M20; §15.1 the invoice names what
 * it bills, §26.1 "invoice reports … accurately", §4.4 the prompt prices what the key does):
 * every REQUIRED manifest row that is not delivered — whatever its whereabouts: the old
 * house, the road, the truck, or the new house's hallway not yet settled in a room.
 *
 * The invoice's LEFT_BEHIND line bills exactly these rows (invoice.js itemsLeftBehind is this
 * function over state.manifest) and the cab's Q prompt prices exactly these rows (tripStatus
 * below → interact.js settlement()). Until M20 there were two definitions: the prompt priced
 * only the rows that needed another trip ('away'), the invoice billed every undelivered row,
 * and a box still on the truck made the settlement one item (60.00) larger than the prompt had
 * promised (KNOWN_ISSUES, Phase 21 M13). Not to be confused with DELIVERED, which this never
 * touches: a row is delivered by MANIFEST.dwellMs of settled dwell at the destination
 * (stepManifest) and nothing here re-decides it.
 */
export function undeliveredRows(rows) {
  return (rows || []).filter((r) => r.required !== false && !r.delivered);
}

/**
 * The counts the cab prompt and the objective line need every frame (M13), without
 * deliveryStatus()'s per-row records: how many undelivered rows are away (another trip),
 * loaded (on the truck) or at the site (carry them in). Pure; 23 rows and their pieces.
 *
 * M20: the rows are undeliveredRows() — the set the invoice bills — so away + inTruck +
 * atSite === notDelivered by construction, and `notDeliveredIds` names them for the prompt.
 *
 * @returns {{away: number, inTruck: number, atSite: number, delivered: number, total: number,
 *            notDelivered: number, notDeliveredIds: string[]}}
 */
export function tripStatus(rows, registry) {
  const out = { away: 0, inTruck: 0, atSite: 0, delivered: 0, total: rows.length,
                notDelivered: 0, notDeliveredIds: [] };
  for (const row of rows) if (row.delivered) out.delivered++;
  for (const row of undeliveredRows(rows)) {
    const w = rowWhere(row, registry).where;
    if (w === 'away') out.away++; else if (w === 'truck') out.inTruck++; else out.atSite++;
    out.notDelivered++;
    out.notDeliveredIds.push(row.id);
  }
  return out;
}

/**
 * §24.4 content validation: "incorrect colliders, zones, anchors and manifests will
 * dominate production bugs". Run at load, not in a test — a level that fails this should
 * announce it in the build it ships in, not only in CI.
 *
 * @returns {string[]} problems, empty when the manifest is sound
 */
export function validateManifest(spawns, zones = ZONES) {
  const problems = [];
  const count = spawns.length;
  if (count < MANIFEST.minObjects || count > MANIFEST.maxObjects) {
    problems.push(`§13.1 wants ${MANIFEST.minObjects}-${MANIFEST.maxObjects} objects, got ${count}`);
  }

  for (const [i, s] of spawns.entries()) {
    const def = OBJECT_DEFS[s.def];
    if (!def) { problems.push(`row ${i}: unknown definition "${s.def}"`); continue; }

    // §24.4: a manifest may not name a room that does not exist. Before Phase 9 the toZone
    // values were seams with nothing to resolve against; now they must resolve.
    if (s.to && !destZoneIds().includes(s.to)) {
      problems.push('row ' + i + ' (' + s.def + '): unknown destination zone "' + s.to + '"');
    }

    // Must start somewhere named, or the object is unreachable and unfindable.
    const z = zoneAt({ x: s.x, y: s.y, z: s.z }, zones);
    if (!z) problems.push(`row ${i} (${s.def}): starts outside every zone at ${s.x}, ${s.z}`);

    // Must start above the floor. A negative-y spawn falls through the world on frame 1 and
    // then the recovery system quietly rescues it, which hides the authoring error.
    if (s.y < def.dimensions.y / 2 - 0.05) {
      problems.push(`row ${i} (${s.def}): spawn y ${s.y} is below its own half-height`);
    }
  }
  return problems;
}

/** Axis-aligned footprint overlaps between spawn rows. Two objects starting inside each
 *  other get ejected by the solver on the first step, which looks like a physics bug and
 *  is an authoring one. Returns pairs of row indices. */
export function overlappingSpawns(spawns) {
  const bad = [];
  const box = (s) => {
    const d = OBJECT_DEFS[s.def].dimensions;
    return { x0: s.x - d.x / 2, x1: s.x + d.x / 2, z0: s.z - d.z / 2, z1: s.z + d.z / 2,
             y0: s.y - d.y / 2, y1: s.y + d.y / 2 };
  };
  for (let i = 0; i < spawns.length; i++) {
    for (let j = i + 1; j < spawns.length; j++) {
      const a = box(spawns[i]), b = box(spawns[j]);
      const hit = a.x0 < b.x1 && b.x0 < a.x1 &&
                  a.z0 < b.z1 && b.z0 < a.z1 &&
                  a.y0 < b.y1 && b.y0 < a.y1;
      if (hit) bad.push([i, j]);
    }
  }
  return bad;
}
