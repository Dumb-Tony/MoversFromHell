/* The box truck's cargo space — GDD §10.1, §10.2, §13.1, §11.2.
 *
 * §10.1 is the differentiator and it is worth quoting in full, because every shortcut in
 * this file would violate it: "The cargo box is a real collision-enabled space with floor,
 * walls, roof, ramp, door, and anchor points. NOTHING TELEPORTS INTO STORAGE. Packing is
 * cooperative 3D Tetris with meaningful volume, mass distribution, protection, access order,
 * and restraint."
 *
 * So the cargo box is built the same way the house is: as shared records that produce both
 * the mesh and the colliders (§8.1). There is no inventory, no slot list, and no "load"
 * button. An object is in the truck when it is physically inside the truck.
 *
 * THE TRUCK DOES NOT MOVE IN PHASE 7, and it does not move in Phase 8 either. §10.5
 * explicitly permits this: "Browser driving may use truck-local simulation or FORCE PROXIES
 * if full moving-world physics is unstable." Moving a kinematic box full of sleeping rigid
 * bodies at 13.5 m/s is exactly the instability that sentence is about. Road events instead
 * apply the pseudo-force the cargo would feel in the truck's frame, which is the same physics
 * seen from the seat, and is deterministic enough to assert. §11.3's severity multipliers are
 * already written as impulse multipliers, which is the same decision made in the GDD.
 *
 * Deck height is 1.20 m, which is not a free number: it is TOOLS.ramp.deckHeight, and the
 * Phase 1 scene ramp already rises 4.35*sin(0.28) = 1.2022 m. The ramp tool was built against
 * it in Phase 6 and measured lifting a mover from 0.01 m to 1.22 m.
 */

import { TRUCK, TOOLS } from '../config.js';

/** Where the truck is parked, and which way it faces. The rear door faces -Z, toward the
 *  house, so the carry from the porch to the ramp is a straight line (§8.1: "park position
 *  should affect ramp angle and carry distance"). */
export const TRUCK_POSE = Object.freeze({ x: 0.60, z: 10.40, yaw: 0 });

/** Interior clear dimensions, metres. §13.1 asks for "one small box truck with physical
 *  cargo box, rear door, ramp, 4-8 anchors". A 4.20 x 2.10 x 2.00 m box is a small domestic
 *  removal truck, and it is deliberately not big enough for 23 objects packed carelessly —
 *  that is what makes §12.1's "one trip" an optional goal rather than a formality. */
export const CARGO_BOX = Object.freeze({
  deckY: TOOLS.ramp.deckHeight,   // 1.20
  length: 4.20,                   // along local Z
  width: 2.10,                    // along local X
  height: 2.00,
  wallT: 0.10,
});

/** Interior volume in cubic metres — the currency §10.5's "cargo optimization" trades in,
 *  and what Phase 6's disassembly buys you more of. */
export const CARGO_VOLUME = CARGO_BOX.length * CARGO_BOX.width * CARGO_BOX.height;

/** World-space AABB of the CLEAR INTERIOR (not including the walls). */
export function cargoInterior(pose = TRUCK_POSE, box = CARGO_BOX) {
  return {
    minX: pose.x - box.width / 2,
    maxX: pose.x + box.width / 2,
    minY: box.deckY,
    maxY: box.deckY + box.height,
    minZ: pose.z - box.length / 2,
    maxZ: pose.z + box.length / 2,
  };
}

/**
 * The colliders that make the box a real space (§10.1). Floor, two sides, headboard and
 * roof; the rear is open, because that is the door.
 *
 * Returned in the same {minX,maxX,minZ,maxZ,base,top,tag} shape the house uses, so the same
 * builder produces the meshes and the same PhysicsWorld call produces the colliders.
 */
export function cargoColliders(pose = TRUCK_POSE, box = CARGO_BOX) {
  const i = cargoInterior(pose, box);
  const t = box.wallT;
  return [
    /* Deck. Solid from the ground up, so the truck reads as a truck and nothing rolls under.
     *
     * FRICTION 0.32, not the 0.8 of a house floor. A truck deck is plywood or steel, and
     * that is the entire reason real loads get strapped. At 0.8 an unstrapped pack survived
     * a §11.3 hard brake with a worst-case shift of 2 mm, which left straps with nothing to
     * improve and the phase gate with nothing to measure. */
    { minX: i.minX - t, maxX: i.maxX + t, minZ: i.minZ - t, maxZ: i.maxZ + t,
      base: 0, top: i.minY, tag: 'truckDeck', friction: TRUCK.deckFriction },
    // Sides.
    { minX: i.minX - t, maxX: i.minX, minZ: i.minZ - t, maxZ: i.maxZ + t,
      base: i.minY, top: i.maxY, tag: 'truckWallL' },
    { minX: i.maxX, maxX: i.maxX + t, minZ: i.minZ - t, maxZ: i.maxZ + t,
      base: i.minY, top: i.maxY, tag: 'truckWallR' },
    // Headboard, at the far (+Z) end. The rear (-Z) is the open door.
    { minX: i.minX - t, maxX: i.maxX + t, minZ: i.maxZ, maxZ: i.maxZ + t,
      base: i.minY, top: i.maxY, tag: 'truckHeadboard' },
    // Roof. §10.1 lists it, and it is what stops a badly stacked load simply leaving.
    { minX: i.minX - t, maxX: i.maxX + t, minZ: i.minZ - t, maxZ: i.maxZ + t,
      base: i.maxY, top: i.maxY + t, tag: 'truckRoof' },
  ];
}

/* ── The cab ─────────────────────────────────────────────────────────────────────────
 *
 * Added in Phase 11, when the drive needed somewhere to START. Until then the route was an
 * API call and there was nothing in the world to walk up to.
 *
 * §11.2 says "cab seats are safe" and §3.4's TRANSIT phase has to begin somewhere; a box at
 * the front of the truck you can stand at and press E is the smallest honest version of
 * that. It is deliberately NOT in cargoColliders() — the cab is not cargo space (§10.2's
 * volume accounting would be wrong) and m7 counts that list.
 */
export const CAB = Object.freeze({ length: 1.9, height: 2.3 });

export function cabColliders(pose = TRUCK_POSE, box = CARGO_BOX, cab = CAB) {
  const i = cargoInterior(pose, box);
  const t = box.wallT;
  // In front of the cargo box, at the +Z end, sitting on the same deck line.
  const z0 = i.maxZ + t, z1 = z0 + cab.length;
  return [{
    minX: i.minX - t, maxX: i.maxX + t, minZ: z0, maxZ: z1,
    base: 0, top: cab.height, tag: 'truckCab',
  }];
}

/** Where a mover stands to drive. §3.4's TRANSIT begins here. */
export function cabPoint(pose = TRUCK_POSE, box = CARGO_BOX, cab = CAB) {
  const i = cargoInterior(pose, box);
  return { x: pose.x, y: 1.0, z: i.maxZ + box.wallT + cab.length + 0.5 };
}

/* ── Anchor points (§10.3, §13.1's "4-8 anchors") ────────────────────────────────────
 *
 * Three per side at deck level, which is where a real E-track rail runs. Positions are the
 * thing that makes strap GEOMETRY matter (§10.3: "poor angle or tension permits shift"), so
 * they are spread along the length rather than clustered — a strap from a rear anchor to a
 * forward item pulls it backwards as well as down, and that is a decision the player gets to
 * make badly.
 */
export function cargoAnchors(pose = TRUCK_POSE, box = CARGO_BOX) {
  const i = cargoInterior(pose, box);
  const zs = [-0.35, 0, 0.35].map((f) => pose.z + f * box.length);
  const sides = [
    { side: 'L', x: i.minX + 0.04 },
    { side: 'R', x: i.maxX - 0.04 },
  ];
  const out = [];
  for (const s of sides) {
    zs.forEach((z, zi) => {
      out.push({ id: `anchor_${s.side}${zi}`, x: s.x, y: i.minY + 0.10, z, side: s.side });
    });
  }
  return out;
}

/** Is a world point inside the closed cargo volume? §10.2: "required objects count as loaded
 *  only after crossing the cargo threshold and settling inside the closed volume". */
export function insideCargo(point, pose = TRUCK_POSE, box = CARGO_BOX) {
  if (!point) return false;
  const i = cargoInterior(pose, box);
  return point.x >= i.minX && point.x <= i.maxX &&
         point.y >= i.minY - 0.05 && point.y <= i.maxY &&
         point.z >= i.minZ && point.z <= i.maxZ;
}

/** Where the loading ramp's head goes — the rear lip of the deck, centred. */
export function rampAnchorPoint(pose = TRUCK_POSE, box = CARGO_BOX) {
  const i = cargoInterior(pose, box);
  return { x: pose.x, y: box.deckY, z: i.minZ - box.wallT };
}

/** §11.3's road events, as the pseudo-force an item of mass m feels in the truck's frame.
 *  Direction is truck-local: +Z is forward, so a hard brake throws cargo toward the
 *  headboard at +Z, and a sharp turn throws it sideways.
 *
 *  §10.4 is the constraint on this: "a heuristic may estimate unsecured mass and imbalance
 *  for warnings and scoring, but IT MUST NOT SECRETLY DAMAGE ITEMS WITHOUT A PHYSICAL CAUSE."
 *  So this returns a force that is applied to real bodies, and whatever happens next happens
 *  because those bodies moved. Nothing here inspects a pack quality score and decides an
 *  outcome. */
export function roadEventForce(type, mass) {
  const ev = TRUCK.roadEvents[type];
  if (!ev) return null;
  const a = type === 'hardBrake' ? TRUCK.brakeForce
          : type === 'sharpTurn' ? TRUCK.brakeForce * 0.8
          : TRUCK.brakeForce * 0.55;                 // speedBump, mostly vertical
  const mag = mass * a * ev.severity;
  if (type === 'hardBrake') return { x: 0, y: 0, z: mag };
  if (type === 'sharpTurn') return { x: mag, y: 0, z: 0 };
  return { x: 0, y: mag, z: 0 };                     // speedBump throws it up
}
