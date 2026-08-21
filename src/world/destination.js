/* The destination site — GDD §13.1, §12.3, §3.4, §15.1.
 *
 * §13.1: "Destination | One smaller site with 3-4 LABELED room zones." Smaller than the
 * pickup house on purpose — the interesting problem at the far end is not carrying, it is
 * that the rooms you are told to fill are not the rooms the furniture came out of.
 *
 * THE CONTRADICTION THIS FILE HAS TO RESOLVE, and it is a real one in the GDD:
 *
 *   §3.4  the Delivery phase exits when "required items settled in VALID destination zones"
 *         — which reads as a gate: wrong room, no completion.
 *   §15.1 lists ROOM ACCURACY as a scored line item with a "small perfect bonus"
 *         — which reads as a price: wrong room, smaller cheque.
 *   §12.2 restricts hard failure to four named conditions, and a lamp in the wrong bedroom
 *         is not among them.
 *
 * Two of those three say the same thing, and §2.1 ("the game should rarely say no") breaks
 * the tie. So: an object is DELIVERED when it is settled anywhere in the destination site,
 * and delivered TO THE RIGHT ROOM is a separate, scored fact. A contract can complete with
 * every item in the hallway; it just pays less. Recorded here rather than buried in a
 * function, because it is a product decision and the next person may want the other one.
 */

import { ROOM } from './house.js';

/** Far enough from the pickup house that neither site's zones can overlap the other's, and
 *  §12.3's "substantially inside the correct room" stays decidable. */
export const DEST_ORIGIN = Object.freeze({ x: 18.5, z: -5.0 });

/** §13.1's "smaller site". 9 x 6 m against the pickup house's 10 x 7. */
export const DEST_SHELL = Object.freeze({
  minX: DEST_ORIGIN.x - 4.5, maxX: DEST_ORIGIN.x + 4.5,
  minZ: DEST_ORIGIN.z - 3.0, maxZ: DEST_ORIGIN.z + 3.0,
  wallH: ROOM.wallH, wallT: 0.18, ceiling: true,
});

/** The front opening, on the +Z side facing the street. 0.91 m — the same 36" front door the
 *  pickup house has, so the couch's 0.850 m narrowest presentation still just passes. */
export const DEST_APERTURE = Object.freeze({
  id: 'destFront', gap: 0.91, label: '36" front (destination)', x: DEST_ORIGIN.x,
});

/** §13.1's "3-4 LABELED room zones", plus the apron outside. Labels matter — §21.2's contract
 *  UX has to name the room a player is being asked to put something in. */
export const DEST_ZONES = Object.freeze([
  {
    id: 'dest_living', label: 'Living room (destination)',
    minX: DEST_SHELL.minX, maxX: DEST_SHELL.maxX,
    minZ: DEST_ORIGIN.z, maxZ: DEST_SHELL.maxZ,
    minY: -0.2, maxY: DEST_SHELL.wallH, site: 'destination',
  },
  {
    id: 'dest_kitchen', label: 'Kitchen (destination)',
    minX: DEST_SHELL.minX, maxX: DEST_ORIGIN.x,
    minZ: DEST_SHELL.minZ, maxZ: DEST_ORIGIN.z,
    minY: -0.2, maxY: DEST_SHELL.wallH, site: 'destination',
  },
  {
    id: 'dest_bedroom', label: 'Bedroom (destination)',
    minX: DEST_ORIGIN.x, maxX: DEST_SHELL.maxX,
    minZ: DEST_SHELL.minZ, maxZ: DEST_ORIGIN.z,
    minY: -0.2, maxY: DEST_SHELL.wallH, site: 'destination',
  },
  {
    id: 'dest_apron', label: 'Kerbside (destination)',
    minX: DEST_SHELL.minX - 1.5, maxX: DEST_SHELL.maxX + 1.5,
    minZ: DEST_SHELL.maxZ, maxZ: DEST_SHELL.maxZ + 5.0,
    minY: -0.2, maxY: 4.0, site: 'destination',
  },
]);

/** Interior partitions, cut by the one interior doorway. Same shape as the pickup house's
 *  records so `wallSegments()` builds both. */
export const DEST_PARTITIONS = Object.freeze([
  { id: 'destWallBack', axis: 'x', at: DEST_ORIGIN.z, from: DEST_SHELL.minX, to: DEST_SHELL.maxX },
  { id: 'destWallMid', axis: 'z', at: DEST_ORIGIN.x, from: DEST_SHELL.minZ, to: DEST_ORIGIN.z },
]);

export const DEST_DOORS = Object.freeze([
  {
    id: 'dest_living_kitchen', axis: 'x', at: DEST_ORIGIN.z,
    centre: DEST_ORIGIN.x - 1.6, gap: 0.91, height: 2.03,
    from: 'dest_living', to: 'dest_kitchen',
  },
  {
    id: 'dest_kitchen_bedroom', axis: 'z', at: DEST_ORIGIN.x,
    centre: DEST_SHELL.minZ + 1.4, gap: 0.91, height: 2.03,
    from: 'dest_kitchen', to: 'dest_bedroom',
  },
]);

/**
 * The destination shell's colliders, in the shared {minX..top,tag} shape.
 * The +Z wall carries the front opening; the other three sides are solid.
 */
export function destColliders(shell = DEST_SHELL, aperture = DEST_APERTURE) {
  const t = shell.wallT, H = shell.wallH;
  const out = [];
  const mid = (a, b) => (a + b) / 2;

  // Floor, so the destination reads as a building rather than as four walls on grass.
  out.push({ minX: shell.minX - t, maxX: shell.maxX + t,
             minZ: shell.minZ - t, maxZ: shell.maxZ + t,
             base: -0.05, top: 0.02, tag: 'destFloor' });

  // West, east, north (far) walls.
  out.push({ minX: shell.minX - t, maxX: shell.minX, minZ: shell.minZ - t, maxZ: shell.maxZ + t,
             base: 0, top: H, tag: 'destWallW' });
  out.push({ minX: shell.maxX, maxX: shell.maxX + t, minZ: shell.minZ - t, maxZ: shell.maxZ + t,
             base: 0, top: H, tag: 'destWallE' });
  out.push({ minX: shell.minX - t, maxX: shell.maxX + t, minZ: shell.minZ - t, maxZ: shell.minZ,
             base: 0, top: H, tag: 'destWallN' });

  // South wall, with the front opening cut out of it, plus a header over the opening.
  const lo = aperture.x - aperture.gap / 2, hi = aperture.x + aperture.gap / 2;
  for (const [a, b] of [[shell.minX - t, lo], [hi, shell.maxX + t]]) {
    if (b - a <= 1e-6) continue;
    out.push({ minX: a, maxX: b, minZ: shell.maxZ, maxZ: shell.maxZ + t,
               base: 0, top: H, tag: 'destWallS' });
  }
  out.push({ minX: lo, maxX: hi, minZ: shell.maxZ, maxZ: shell.maxZ + t,
             base: 2.03, top: H, tag: 'destDoorHeader' });

  // Ceiling.
  if (shell.ceiling) {
    out.push({ minX: shell.minX - t, maxX: shell.maxX + t,
               minZ: shell.minZ - t, maxZ: shell.maxZ + t,
               base: H, top: H + 0.16, tag: 'destCeiling' });
  }
  void mid;
  return out;
}

/** Which destination room a point is in, or null. */
export function destZoneAt(point, zones = DEST_ZONES) {
  if (!point) return null;
  for (const z of zones) {
    if (point.x >= z.minX && point.x <= z.maxX &&
        point.z >= z.minZ && point.z <= z.maxZ &&
        point.y >= z.minY && point.y <= z.maxY) return z;
  }
  return null;
}

/**
 * Is this point anywhere in the destination BUILDING? §3.4's completion test.
 *
 * Deliberately excludes the apron: dumping the whole load on the kerb and driving away is
 * not delivery in anybody's book, and §12.3's "substantially inside the correct room/zone"
 * at least requires being indoors. Getting the ROOM right on top of that is §15.1's scored
 * bonus, not a condition — see the header.
 */
export function insideDestination(point, shell = DEST_SHELL) {
  if (!point) return false;
  return point.x >= shell.minX && point.x <= shell.maxX &&
         point.z >= shell.minZ && point.z <= shell.maxZ &&
         point.y >= -0.2 && point.y <= shell.wallH;
}

/** Every zone id an object could legitimately be asked to reach. Used by the §24.4 validator
 *  so a manifest cannot name a room that does not exist. */
export function destZoneIds(zones = DEST_ZONES) {
  return zones.filter((z) => z.id !== 'dest_apron').map((z) => z.id);
}
