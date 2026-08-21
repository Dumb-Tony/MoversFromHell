/* The pickup house — GDD §13.1, §8.1, §12.3.
 *
 * §13.1's prototype requirement: "One compact suburban house with 2-3 rooms, a doorway
 * turn, short steps/porch, driveway, and optional garage."
 *
 * THE DOORWAY TURN IS THE POINT. §8.1 calls architecture the route puzzle, and a straight
 * corridor is not one — you can walk a couch down it facing forward and learn nothing. The
 * layout below forces a 90-degree change of heading BETWEEN two openings that are 3.2 m
 * apart, which is shorter than the couch is long (2.10 m) plus the swing it needs. Getting
 * couch_3seat_01 into the bedroom is therefore a genuine problem with more than one answer,
 * which is exactly what §3.3 asks for:
 *
 *   - pivot it through in stages, accepting the time cost;
 *   - take the doors off (§8.2), paying preparation time;
 *   - or unscrew the legs to shrink the profile (§8.2).
 *
 * Only the first is buildable in Phase 5. The other two are Phase 6's tools, and the layout
 * exists now so that Phase 6 has a real problem to solve rather than an invented one.
 *
 * BUILT INSIDE THE EXISTING SHELL. Phases 0-1 put a 10 x 7 m room behind the aperture wall
 * and m1 asserts against ROOM's bounds, so this subdivides that footprint rather than
 * replacing it. The outer walls, the ceiling and the three front apertures are untouched;
 * everything here is interior partition.
 *
 * ONE SHARED RECORD, as everywhere else in this project (§8.1: "decorative collision must
 * not contradict the visible surface"). The renderer builds meshes from these specs and the
 * physics world builds colliders from the same specs. Neither owns them.
 */

/** The house shell. Phases 0-1 built this as a single room behind the aperture wall and
 *  m1 still asserts against its bounds; Phase 5 subdivides it rather than replacing it.
 *  Lives here, not in scene.js, so the shell and its partitions are one record. */
export const ROOM = Object.freeze({
  minX: -5.0, maxX: 5.0, minZ: -9.0, maxZ: -2.0,
  wallH: 2.7, wallT: 0.18, ceiling: true,
});

/** Interior partitions are thinner than the 0.18 m exterior shell. */
export const PARTITION_T = 0.12;

/* ── Room zones (§12.3, §23.2 manifest) ──────────────────────────────────────────────
 *
 * A zone is an axis-aligned volume with a stable string id. §12.3 defines delivery as
 * "substantially inside the correct room/zone and settled below velocity thresholds for a
 * dwell time" — "substantially inside" is why zones are volumes to be tested against an
 * object's CENTRE rather than trigger boxes to be entered, and why they carry no state.
 *
 * These are also the pickup rooms. The same record answers "which room is this object in
 * now" during loading and "did it reach the right room" at the destination, so a Phase 9
 * zone and a Phase 5 zone cannot drift into two different ideas.
 */
export const ZONES = Object.freeze([
  {
    id: 'living_room',
    label: 'Living room',
    minX: ROOM.minX, maxX: ROOM.maxX,
    minZ: -5.0, maxZ: ROOM.maxZ,
    minY: -0.2, maxY: ROOM.wallH,
    site: 'pickup',
  },
  {
    id: 'kitchen',
    label: 'Kitchen',
    minX: 0.0, maxX: ROOM.maxX,
    minZ: ROOM.minZ, maxZ: -5.0,
    minY: -0.2, maxY: ROOM.wallH,
    site: 'pickup',
  },
  {
    id: 'bedroom',
    label: 'Bedroom',
    minX: ROOM.minX, maxX: 0.0,
    minZ: ROOM.minZ, maxZ: -5.0,
    minY: -0.2, maxY: ROOM.wallH,
    site: 'pickup',
  },
  /* Outside. The driveway is where the truck parks (§13.1) and where Phase 7 loading
   * happens; naming it now means Phase 5's "carried it out of the house" and Phase 7's
   * "staged it at the truck" are the same test. */
  {
    id: 'porch',
    label: 'Porch',
    minX: -2.6, maxX: 5.0,
    minZ: -2.0, maxZ: 4.2,
    minY: -0.2, maxY: 3.0,
    site: 'pickup',
  },
  {
    id: 'driveway',
    label: 'Driveway',
    minX: -3.0, maxX: 3.0,
    minZ: 4.2, maxZ: 14.0,
    minY: -0.2, maxY: 4.0,
    site: 'pickup',
  },
]);

/* ── Interior doorways ───────────────────────────────────────────────────────────────
 *
 * `axis` is the axis the wall RUNS along, so an 'x' doorway is an opening in a wall that
 * spans x and is crossed by moving in z.
 *
 * The two clear widths are chosen against the couch's 0.850 m narrowest presentation
 * (see scene.js — that figure is the same in every rotation, so there is no clever angle):
 *
 *   living -> kitchen  0.86 m   10 mm to spare. Passable, and unpleasant.
 *   kitchen -> bedroom 0.91 m   60 mm on its side.
 *
 * Both fit, so §2.1's "the game should rarely say no" holds: nothing here refuses. The
 * difficulty is the TURN between them, not either opening on its own.
 */
export const INTERIOR_DOORS = Object.freeze([
  {
    id: 'living_kitchen',
    axis: 'x',            // wall spans x at a fixed z; you cross it moving in z
    at: -5.0,             // z of the wall
    centre: 2.60,         // x of the opening centre
    gap: 0.86,
    height: 2.03,
    from: 'living_room', to: 'kitchen',
  },
  {
    id: 'kitchen_bedroom',
    axis: 'z',            // wall spans z at a fixed x; you cross it moving in x
    at: 0.0,              // x of the wall
    centre: -7.40,        // z of the opening centre
    gap: 0.91,
    height: 2.03,
    from: 'kitchen', to: 'bedroom',
  },
]);

/** Interior partition walls, as segments. Openings are cut by INTERIOR_DOORS; `wallSegments`
 *  below turns each (wall, doors) pair into the solid runs either side of each opening, so
 *  the mesh and the collider are generated from the doorway data rather than hand-placed
 *  next to it. Hand-placing them is how a visible gap and a solid collider drift apart. */
export const PARTITIONS = Object.freeze([
  { id: 'wall_living_back', axis: 'x', at: -5.0, from: ROOM.minX, to: ROOM.maxX },
  { id: 'wall_kitchen_bed', axis: 'z', at: 0.0, from: ROOM.minZ, to: -5.0 },
]);

/**
 * Solid runs of a partition, with the doorway openings removed.
 * @returns {{lo:number, hi:number}[]} spans along the wall's own axis
 */
export function wallSegments(partition, doors = INTERIOR_DOORS) {
  const mine = doors
    .filter((d) => d.axis === partition.axis && Math.abs(d.at - partition.at) < 1e-6)
    .map((d) => [d.centre - d.gap / 2, d.centre + d.gap / 2])
    .sort((a, b) => a[0] - b[0]);

  const out = [];
  let cursor = Math.min(partition.from, partition.to);
  const end = Math.max(partition.from, partition.to);
  for (const [lo, hi] of mine) {
    if (lo > cursor) out.push({ lo: cursor, hi: lo });
    cursor = Math.max(cursor, hi);
  }
  if (cursor < end) out.push({ lo: cursor, hi: end });
  return out;
}

/** The zone containing a world point, or null. First match wins; zones do not overlap,
 *  which `overlappingZones()` below asserts so that stays true as rooms are added. */
export function zoneAt(point, zones = ZONES) {
  if (!point) return null;
  for (const z of zones) {
    if (point.x >= z.minX && point.x <= z.maxX &&
        point.z >= z.minZ && point.z <= z.maxZ &&
        point.y >= z.minY && point.y <= z.maxY) return z;
  }
  return null;
}

export function zoneById(id, zones = ZONES) {
  return zones.find((z) => z.id === id) || null;
}

/** Pairs of zone ids whose volumes intersect. Must be empty: an object in two rooms at once
 *  makes §12.3's "substantially inside the correct room" undecidable. §24.4 asks for content
 *  validators early, and overlapping zones are exactly the authoring bug it names. */
export function overlappingZones(zones = ZONES) {
  const bad = [];
  const overlaps1D = (aLo, aHi, bLo, bHi) => aLo < bHi && bLo < aHi;
  for (let i = 0; i < zones.length; i++) {
    for (let j = i + 1; j < zones.length; j++) {
      const a = zones[i], b = zones[j];
      if (overlaps1D(a.minX, a.maxX, b.minX, b.maxX) &&
          overlaps1D(a.minZ, a.maxZ, b.minZ, b.maxZ) &&
          overlaps1D(a.minY, a.maxY, b.minY, b.maxY)) bad.push([a.id, b.id]);
    }
  }
  return bad;
}

/* THE ROUTE, as data rather than as a comment.
 *
 * Each leg is a doorway the mover must pass through to get from the driveway to that room,
 * in order. Phase 5's suite walks these to prove every room is reachable, and Phase 6 will
 * use the same record to decide which door a removal tool should act on. `front36` is the
 * 0.91 m front aperture from scene.js APERTURES.
 */
export const ROUTES = Object.freeze({
  living_room: ['front36'],
  kitchen: ['front36', 'living_kitchen'],
  bedroom: ['front36', 'living_kitchen', 'kitchen_bedroom'],
});

/** Narrowest opening on the route to a room, in metres. The binding constraint for
 *  anything being carried there — and the number §21.1's HUD should eventually surface. */
export function tightestOnRoute(roomId, apertures, doors = INTERIOR_DOORS) {
  const legs = ROUTES[roomId] || [];
  let min = Infinity;
  for (const id of legs) {
    const a = apertures.find((p) => p.id === id);
    const d = doors.find((p) => p.id === id);
    const gap = a ? a.gap : (d ? d.gap : Infinity);
    if (gap < min) min = gap;
  }
  return min;
}
