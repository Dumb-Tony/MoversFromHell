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
 * §8.3 material/durability per surface: surfaceRow(tag) is the seam for a per-tag
 * {material, thresholdMult, costMult, maxCharge}. ONE surface kind fills it (Phase 11
 * build-side M23): the DOOR FRAME — the hinges and the jamb of a hung leaf, tagged
 * `door_frame_<doorId>` and priced by FIXED charges (`charges` on its row) rather than the
 * per-N·s rate, because torn hinges do not cost more for being pushed harder. Every other tag
 * gets the default row.
 */

import { DAMAGE } from '../config.js';

/** The surface kind of a hung leaf's frame (M23). A door's frame is tagged
 *  `${DOOR_FRAME_KIND}_${doorId}` — 'door_frame_living_kitchen' — so one ledger line, one
 *  cap and one label per doorway, keyed by the door id the DOOR_STATE event carries. */
export const DOOR_FRAME_KIND = 'door_frame';
const DOOR_FRAME_PREFIX = `${DOOR_FRAME_KIND}_`;

/** Tag prefixes that are charged for. */
export const BILLABLE_PREFIXES = Object.freeze([
  'wall', 'doorHeader', 'partition_', 'roomWall', 'roomCeiling',
  'destWall', 'destDoorHeader', 'destCeiling',
  'truckWall', 'truckHeadboard', 'truckRoof', 'truckCab',
  DOOR_FRAME_PREFIX,
]);

/** Is a hit on this static collider priced? Anything not listed is free by construction. */
export function billable(tag) {
  if (typeof tag !== 'string' || tag.length === 0) return false;
  for (const p of BILLABLE_PREFIXES) if (tag.startsWith(p)) return true;
  return false;
}

/** The frame tag for a door id, and back. A hung leaf is an ENTITY collider (physics.tagOf
 *  answers null for it); damage.js resolves the leaf to this tag so the frame is a surface
 *  like any wall to the window, the ledger, the cap, the notice and the scuff ring. */
export function doorFrameTag(doorId) { return `${DOOR_FRAME_PREFIX}${doorId}`; }
export function isDoorFrameTag(tag) { return typeof tag === 'string' && tag.startsWith(DOOR_FRAME_PREFIX); }
export function doorIdOf(tag) { return isDoorFrameTag(tag) ? tag.slice(DOOR_FRAME_PREFIX.length) : null; }

/** §8.3's per-surface material row. Every tag gets the default row except a door frame,
 *  whose `charges` are the fixed §15.1 prices by frame state ('bent' | 'forced'); a
 *  `charges` row is what tells damage.js the surface is priced by state, not by impulse. */
export function surfaceRow(tag) {
  if (isDoorFrameTag(tag)) {
    const F = DAMAGE.property.doorFrame;
    return { material: 'timber', thresholdMult: 1, costMult: 1, maxCharge: null,
             kind: DOOR_FRAME_KIND, charges: { bent: F.chargeBent, forced: F.chargeForced } };
  }
  return { material: null, thresholdMult: 1, costMult: 1, maxCharge: null, kind: null, charges: null };
}

const PARTITION_LABELS = Object.freeze({
  wall_living_back: 'living room back wall',
  wall_kitchen_bed: 'kitchen/bedroom wall',
});

/** What the notice calls each door when its frame is billed: 'kitchen door forced off its
 *  hinges — 140.00'. The room the door opens into, or the wall it is in. */
const DOOR_FRAME_LABELS = Object.freeze({
  living_kitchen: 'kitchen door',
  kitchen_bedroom: 'bedroom door',
  door34: 'front door',
  interior32: 'side door',
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
  const doorId = doorIdOf(tag);
  if (doorId) return DOOR_FRAME_LABELS[doorId] || `${doorId.replace(/_/g, ' ')} door`;
  return tag.replace(/_/g, ' ');
}
