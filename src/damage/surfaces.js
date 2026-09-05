/* Surfaces — which static colliders §15.1's "property damage" line can charge for, and what
 * the invoice calls them. Phase 11 build-side M14. GDD §8.3, §8.4, §15.1.
 *
 * §8.3: "Static surfaces define material, durability, impact threshold, repair category, and
 * maximum charge." This build has ONE rate for every surface (DAMAGE.property), so this file
 * is the allow-list and the label table, and nothing more:
 *
 *   billable(tag)   TRUE for the things a customer would bill you for marking — walls, door
 *                   frames, partitions, ceilings, the truck's body. FALSE for everything an
 *                   object is SUPPOSED to touch: the ground, floors, the truck deck, the ramp,
 *                   the porch step and the Phase 1 mantling ledges. An explicit allow-list by
 *                   prefix, so a new tag is free until someone decides it is not — every drop
 *                   fixture in m8/m10/m11/m14/m17 lands on a floor and keeps its numbers.
 *   labelFor(tag)   the §8.4 "location" on the ledger line, the notice and the invoice.
 *
 * EXPANSION HOOK (§8.3 material/durability per surface): surfaceRow(tag) is the seam for a
 * per-tag {material, thresholdMult, costMult, maxCharge} — plaster vs steel vs glass. It
 * returns the one default row today; leave the shape, do not fill the table.
 */

/** Tag prefixes that are charged for. 'doorLeaf_' is reserved for the M11 hinge brute-force
 *  branch (a hung leaf forced by a couch) — no static collider carries it yet. */
export const BILLABLE_PREFIXES = Object.freeze([
  'wall', 'doorHeader', 'partition_', 'roomWall', 'roomCeiling',
  'destWall', 'destDoorHeader', 'destCeiling',
  'truckWall', 'truckHeadboard', 'truckRoof', 'truckCab',
  'doorLeaf_',
]);

/** Is a hit on this static collider priced? Anything not listed is free by construction. */
export function billable(tag) {
  if (typeof tag !== 'string' || tag.length === 0) return false;
  for (const p of BILLABLE_PREFIXES) if (tag.startsWith(p)) return true;
  return false;
}

/** EXPANSION HOOK — §8.3's per-surface material row. One default row for every tag today. */
export function surfaceRow(tag) {
  void tag;
  return { material: null, thresholdMult: 1, costMult: 1, maxCharge: null };
}

const PARTITION_LABELS = Object.freeze({
  wall_living_back: 'living room back wall',
  wall_kitchen_bed: 'kitchen/bedroom wall',
});

const FIXED_LABELS = Object.freeze({
  wall: 'front wall',
  roomWallW: 'west wall',
  roomWallE: 'east wall',
  roomWallN: 'back wall',
  roomCeiling: 'ceiling',
  destWallW: 'destination west wall',
  destWallE: 'destination east wall',
  destWallN: 'destination north wall',
  destWallS: 'destination south wall',
  destDoorHeader: 'destination door frame',
  destCeiling: 'destination ceiling',
  destFloor: 'destination floor',
  truckHeadboard: 'truck headboard',
  truckWallL: 'truck body',
  truckWallR: 'truck body',
  truckRoof: 'truck body',
  truckCab: 'truck body',
  truckDeck: 'truck deck',
  ground: 'ground',
  ramp: 'ramp',
  porchStep: 'porch step',
  ledgeLow: 'ledge',
  ledgeHigh: 'ledge',
  tooTall: 'wall block',
});

/** The words the ledger, the notice and the invoice use for a static collider's tag. */
export function labelFor(tag) {
  if (typeof tag !== 'string' || tag.length === 0) return 'a surface';
  if (Object.prototype.hasOwnProperty.call(FIXED_LABELS, tag)) return FIXED_LABELS[tag];
  let m = /^doorHeader_(.+)$/.exec(tag);
  if (m) return `${m[1]} door frame`;
  m = /^partition_(.+)$/.exec(tag);
  if (m) return PARTITION_LABELS[m[1]] || `${m[1].replace(/_/g, ' ')} wall`;
  m = /^doorLeaf_(.+)$/.exec(tag);
  if (m) return `${m[1]} door`;
  return tag.replace(/_/g, ' ');
}
