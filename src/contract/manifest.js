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

import { MANIFEST } from '../config.js';
import { ZONES, zoneAt, zoneById } from '../world/house.js';
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

    const target = zoneById(row.toZone, zones);
    if (!target) { row.dwellMs = 0; continue; }   // destination site not built yet (Phase 9)

    const t = e.body.translation();
    const centre = { x: t.x, y: t.y, z: t.z };
    const inPlace = substantiallyInside(target, centre, e.def.dimensions);

    // §12.3's dwell. Settled is the registry's single definition (§7.3), not a second one.
    if (inPlace && e.state.settled) row.dwellMs = Math.min(MANIFEST.dwellMs, row.dwellMs + stepMs);
    else row.dwellMs = 0;

    row.delivered = row.dwellMs >= MANIFEST.dwellMs;
  }
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
  const byHandling = {};
  for (const r of rows) {
    const k = r.handling || 'standard';
    byHandling[k] = (byHandling[k] || 0) + 1;
  }
  return { total, delivered, remaining: total - delivered, byHandling };
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
