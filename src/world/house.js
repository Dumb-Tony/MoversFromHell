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
 *
 * DOOR LEAVES (Phase 11 build-side M11, §8.2 "Door: open or remove from hinges"). A door
 * record may carry `leaf: { t, hinge, swing, lay }`: a real 40 mm leaf HANGS in that opening
 * at boot, swung fully open against its hinge jamb, so the width you can actually use is
 * `gap − t` (hungClear below) until the screwdriver takes it off. The leaf is an entity in
 * the object registry (definitions.js door_leaf_01), not architecture: it has a body that
 * flips Fixed ↔ Dynamic, it can be carried, dropped, damaged, lost and hung back.
 *   hinge  −1 | +1   which jamb along the wall's own axis (centre − gap/2 or centre + gap/2)
 *   swing  −1 | +1   which side of the wall it opens into, along the crossing axis
 *   lay    'wall' | 'room'   how a REMOVED leaf is laid flat beside the doorway (leafRestPose)
 */

import { DOOR } from '../config.js';

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
 *
 * …UNTIL THE DOORS WERE HUNG (M11). With its 40 mm leaf on, living_kitchen is 0.82 m clear
 * and the intact couch (0.850) does not fit — the "impossible 32-inch door" was this door
 * with its leaf on, all along. Three answers now, which is what §3.3 asks for at every
 * substantial obstacle: take the leaf off (45 s, full 0.86 back: 10 mm intact), take the
 * legs off (0.77: 50 mm even past the hung leaf), or both (90 mm).
 *
 * Hinge sides face AWAY from the route's approach (driveway → living → kitchen → bedroom),
 * and each leaf's rest spot is authored clear of every PHASE5_SPAWNS footprint and every
 * wall — tools/m5-tests.js DL and tools/m19-tests.js D2 measure both.
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
    // West jamb, opening into the kitchen; laid down along the wall (the kitchen's furniture
    // leaves no 2 m strip into the room clear of a spawn — the wall strip x 0.15..2.15 is).
    leaf: { t: DOOR.leaf.t, hinge: -1, swing: -1, lay: 'wall' },
  },
  {
    id: 'kitchen_bedroom',
    axis: 'z',            // wall spans z at a fixed x; you cross it moving in x
    at: 0.0,              // x of the wall
    centre: -7.40,        // z of the opening centre
    gap: 0.91,
    height: 2.03,
    from: 'kitchen', to: 'bedroom',
    // North jamb, opening into the bedroom; laid down out into the room (this partition is
    // 4 m long with the opening in it — no 2 m run of wall is left on either side).
    leaf: { t: DOOR.leaf.t, hinge: +1, swing: -1, lay: 'room' },
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

/* ── Doorways as ONE record shape (M11) ───────────────────────────────────────────────
 *
 * The front wall's openings live in scene.js APERTURES as {id, gap, label, x} and the
 * partitions' in INTERIOR_DOORS above; scene.js imports this file, so this file cannot
 * import APERTURES and every function below takes them as an argument, the way
 * tightestOnRoute always has. `doorRecords` folds the two into the interior shape so the
 * leaf geometry is written once. The front wall is the shell's z = ROOM.maxZ face,
 * ROOM.wallT thick; a partition is PARTITION_T thick.
 */
export function doorRecords(apertures = [], doors = INTERIOR_DOORS) {
  const front = apertures.map((a) => ({
    id: a.id, axis: 'x', at: ROOM.maxZ, centre: a.x, gap: a.gap,
    height: a.height || doors[0].height, from: 'porch', to: 'living_room',
    wallT: ROOM.wallT, leaf: a.leaf || null, label: a.label || a.id,
  }));
  const inner = doors.map((d) => ({ ...d, wallT: PARTITION_T, leaf: d.leaf || null, label: d.label || d.id }));
  return [...front, ...inner];
}

export function doorById(id, apertures = [], doors = INTERIOR_DOORS) {
  return doorRecords(apertures, doors).find((d) => d.id === id) || null;
}

/** Every doorway that has a leaf authored in it — the ones the registry hangs at boot. */
export function leafDoors(apertures = [], doors = INTERIOR_DOORS) {
  return doorRecords(apertures, doors).filter((d) => !!d.leaf);
}

/**
 * The EFFECTIVE clear width of a doorway: its gap, less the thickness of a leaf that is on
 * its hinges. `hung(doorId)` says whether that door's leaf is hung right now; with no
 * predicate every authored leaf counts as hung — the level as built. A door with no leaf is
 * its gap either way.
 *
 * Rounded to the micrometre so that 0.86 − 0.04 IS 0.82 rather than 0.8200000000000001:
 * these numbers are compared with === by the suites and read out loud by the HUD.
 * The jamb markers are 0.04 m meshes centred ON the gap edge (scene.js), so the visual
 * opening is already gap − 0.04 with nothing hung; that is a drawing convention, not a
 * second leaf — never subtract it here.
 */
export function hungClear(doorId, apertures = [], doors = INTERIOR_DOORS, hung = null) {
  const d = doorById(doorId, apertures, doors);
  if (!d) return Infinity;
  const isHung = d.leaf ? (typeof hung === 'function' ? !!hung(doorId) : true) : false;
  return Math.round((d.gap - (isHung ? d.leaf.t : 0)) * 1e6) / 1e6;
}

/** Narrowest opening on the route to a room, in metres — the EFFECTIVE width, hung leaves
 *  subtracted (hungClear). The binding constraint for anything being carried there, and the
 *  number §21.1's HUD should eventually surface. `hung` as for hungClear: absent, every
 *  authored leaf is on its hinges. */
export function tightestOnRoute(roomId, apertures, doors = INTERIOR_DOORS, hung = null) {
  const legs = ROUTES[roomId] || [];
  let min = Infinity;
  for (const id of legs) {
    const clear = hungClear(id, apertures, doors, hung);
    if (clear < min) min = clear;
  }
  return min;
}

/* ── Leaf geometry (M11) ─────────────────────────────────────────────────────────────
 *
 * Plain data in and out — no THREE, no Rapier — so the same numbers hang the body (main.js),
 * are stored on the leaf's serializable state as `home` / `rest` (§22.4), and are asserted
 * by the suites. The leaf's LOCAL axes are those of definitions.js door_leaf_01: x its
 * thickness, y its height, z its length, with the handle at the +z end.
 */

/**
 * Where a door's leaf stands when it is HUNG: swung fully open against the hinge jamb, its
 * thickness inside the opening (so the clear width is gap − t) and its length out into the
 * `swing` room from the wall's centre plane. Yaw turns local +z (the free, handle end) to
 * point in the swing direction. Standing on the floor: y span [floorY, floorY + height].
 * @returns {{x:number, y:number, z:number, yaw:number}}
 */
export function leafPose(door, floorY = 0) {
  const L = door.leaf, t = L.t, len = DOOR.leaf.length, H = DOOR.leaf.height;
  const jamb = door.centre + L.hinge * door.gap / 2;
  const along = jamb - L.hinge * t / 2;                 // the leaf sits INSIDE the gap
  const across = door.at + L.swing * len / 2;
  const x = door.axis === 'x' ? along : across;
  const z = door.axis === 'x' ? across : along;
  const yaw = door.axis === 'x' ? (L.swing > 0 ? 0 : Math.PI) : L.swing * Math.PI / 2;
  return { x, y: floorY + H / 2, z, yaw };
}

/**
 * Where a REMOVED leaf is laid down: flat on the floor (thickness up) on the swing side of
 * the wall, beside the opening past the hinge jamb — never IN the opening, so the clear
 * width really is the whole gap the moment it is off — and DOOR.restPad clear of the wall
 * face. `lay: 'wall'` runs its 2.00 m height along the wall; `lay: 'room'` runs its 0.80 m
 * length along the wall and its height out into the room. Which one is authored per door
 * by what the room has space for (INTERIOR_DOORS, scene.js APERTURES).
 * The rotation is given as a quaternion: with the height along world x it is a quarter
 * turn about z (local x → up, local y → −x); with the height along world z it is the cyclic
 * axes swap x→y→z→x, a third of a turn about (1,1,1).
 * @returns {{x:number, y:number, z:number, rot:{x:number,y:number,z:number,w:number}, alongLen:number, acrossLen:number}}
 */
export function leafRestPose(door, floorY = 0) {
  const L = door.leaf, t = L.t, len = DOOR.leaf.length, H = DOOR.leaf.height, pad = DOOR.restPad;
  const alongLen = L.lay === 'wall' ? H : len;           // extent along the wall
  const acrossLen = L.lay === 'wall' ? len : H;          // extent out into the room
  const jamb = door.centre + L.hinge * door.gap / 2;
  const along = jamb + L.hinge * (pad + alongLen / 2);
  const across = door.at + L.swing * (door.wallT / 2 + pad + acrossLen / 2);
  const x = door.axis === 'x' ? along : across;
  const z = door.axis === 'x' ? across : along;
  const heightAlongX = (door.axis === 'x') === (L.lay === 'wall');
  const rot = heightAlongX
    ? { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 }
    : { x: 0.5, y: 0.5, z: 0.5, w: 0.5 };
  return { x, y: floorY + t / 2, z, rot, alongLen, acrossLen };
}

/**
 * Where a FORCED door's mark goes (Phase 11 build-side M23; §8.4 "visual mark"): the hinge
 * jamb — the end face of the wall run the hinges were screwed to, at hand height, with its
 * normal pointing across the opening. The leaf itself has left for its rest pose by the time
 * the frame's line posts, so the mark on the frame is the thing that stays. Plain data, like
 * leafPose, so main.js can store it on the leaf's state as `hinge` (§22.4).
 * @returns {{at:{x:number,y:number,z:number}, normal:{x:number,y:number,z:number}}}
 */
export function leafHingeMark(door, floorY = 0) {
  const L = door.leaf, H = DOOR.leaf.height;
  const jamb = door.centre + L.hinge * door.gap / 2;
  const across = door.at;
  const at = door.axis === 'x' ? { x: jamb, y: floorY + H / 2, z: across } : { x: across, y: floorY + H / 2, z: jamb };
  // Into the opening: away from the jamb the leaf hung on.
  const normal = door.axis === 'x' ? { x: -L.hinge, y: 0, z: 0 } : { x: 0, y: 0, z: -L.hinge };
  return { at, normal };
}

/** The world AABB of a leaf at its hung pose or its rest pose, for placement checks. */
export function leafAabb(door, pose, floorY = 0) {
  const L = door.leaf, t = L.t, len = DOOR.leaf.length, H = DOOR.leaf.height;
  if (pose.rot) {
    const ax = pose.alongLen, ac = pose.acrossLen;
    const ex = door.axis === 'x' ? ax / 2 : ac / 2;
    const ez = door.axis === 'x' ? ac / 2 : ax / 2;
    return { minX: pose.x - ex, maxX: pose.x + ex, minY: floorY, maxY: floorY + t,
             minZ: pose.z - ez, maxZ: pose.z + ez };
  }
  const ex = door.axis === 'x' ? t / 2 : len / 2;
  const ez = door.axis === 'x' ? len / 2 : t / 2;
  return { minX: pose.x - ex, maxX: pose.x + ex, minY: floorY, maxY: floorY + H,
           minZ: pose.z - ez, maxZ: pose.z + ez };
}
