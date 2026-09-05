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

/* ── the caption's vocabulary (Phase 11 build-side M30; §26.5, §8.4) ────────────────────────
 *
 * §26.5 wants subtitles that "say what happened", and until M30 the property captions were
 * three fixed strings — 'wall scuffed' / 'wall dented' / 'wall holed' — whatever was actually
 * hit, because m18 A1b pinned every cue caption as a literal string (KNOWN_ISSUES Phase 21,
 * M14: "Property captions are generic"). The HUD notice has always named the surface through
 * labelFor(); the audio layer could not, so a player watching subtitles was told a wall was
 * scuffed when a door frame was.
 *
 * The pin is now "a string OR a pure function of the payload" (audio.js resolveCue), and THIS
 * is what such a function is allowed to read: a tag, and nothing else. Two words per surface —
 * a KIND ('wall', 'door frame', 'ceiling', 'headboard', 'truck body') and a ROOM ('front',
 * 'living room', 'living-kitchen', 'destination', 'truck') — assembled onto labelFor's own
 * phrase so the caption, the notice and the ledger line cannot drift apart. Pure, total, and
 * safe to call with a garbage tag: an unknown tag is 'a surface'.
 */

/** The room or place a tag belongs to, or '' when it names no place. */
const FIXED_ROOMS = Object.freeze({
  wall: 'front',
  roomWallW: 'living room', roomWallE: 'living room', roomWallN: 'living room',
  roomCeiling: 'living room',
  destWallW: 'destination', destWallE: 'destination', destWallN: 'destination',
  destWallS: 'destination', destDoorHeader: 'destination', destCeiling: 'destination',
  destFloor: 'destination',
  truckHeadboard: 'truck', truckWallL: 'truck', truckWallR: 'truck',
  truckRoof: 'truck', truckCab: 'truck', truckDeck: 'truck',
});

/** The partition ids, as the room a player would name. */
const PARTITION_ROOMS = Object.freeze({
  wall_living_back: 'living room',
  wall_kitchen_bed: 'kitchen',
});

/** Which room or place a surface is in — '' when the tag names no place (a ledge, the ground). */
export function surfaceRoom(tag) {
  if (typeof tag !== 'string' || tag.length === 0) return '';
  if (Object.prototype.hasOwnProperty.call(FIXED_ROOMS, tag)) return FIXED_ROOMS[tag];
  const doorId = doorIdOf(tag);
  if (doorId) return doorId.replace(/_/g, '-');
  let m = /^doorHeader_(.+)$/.exec(tag);
  if (m) return m[1].replace(/_/g, '-');
  m = /^partition_(.+)$/.exec(tag);
  if (m) return PARTITION_ROOMS[m[1]] || '';
  return '';
}

/** What KIND of thing was hit, as the one word a caption must contain (m37 P4). */
export function surfaceKind(tag) {
  if (typeof tag !== 'string' || tag.length === 0) return 'surface';
  if (isDoorFrameTag(tag)) return 'door frame';
  if (/^doorHeader/.test(tag) || tag === 'destDoorHeader') return 'door frame';
  if (/[Cc]eiling$/.test(tag)) return 'ceiling';
  if (/[Hh]eadboard$/.test(tag)) return 'headboard';
  if (/^truck/.test(tag)) return 'truck body';
  if (/wall/i.test(tag) || /^partition_/.test(tag)) return 'wall';
  return 'surface';
}

/**
 * The §26.5 subtitle's name for a surface: 'front wall', 'living-kitchen door frame',
 * 'living room back wall', 'truck headboard'. labelFor's phrase with the room prefixed and
 * the kind suffixed only when they are not already in it, so nothing reads 'truck truck body'.
 * PURE and total — an audio caption function may call nothing else (m37 P4).
 */
export function surfaceCaption(tag) {
  if (typeof tag !== 'string' || tag.length === 0) return 'a surface';
  const room = surfaceRoom(tag);
  // A door FRAME's label names the door it hangs in ('kitchen door'), which reads oddly with
  // the room in front of it; the frame is what was hit, so the frame is what the caption says.
  if (isDoorFrameTag(tag)) return room ? `${room} door frame` : 'door frame';
  const kind = surfaceKind(tag);
  let out = labelFor(tag).replace(/_/g, '-');
  if (room && !out.includes(room)) out = `${room} ${out}`;
  if (kind && !out.includes(kind)) out = `${out} ${kind}`;
  return out;
}
