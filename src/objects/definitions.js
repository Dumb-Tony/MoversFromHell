/* Object definitions — GDD §7.1, §23.1.
 *
 * "Every movable entity uses a data-driven definition plus runtime state. The visible
 * silhouette and collider must agree closely because spatial reasoning is the game."
 *
 * §29.1 sets the build order: "make one box feel good before adding furniture variety",
 * then "make one heavy shared object feel good before building missions". Phase 2 defined
 * BOXES only; Phase 3 adds the couch and dresser and makes them dynamic. The couch was
 * deliberately left static until now, because a couch grabbable under the Phase 2 model
 * would have felt like a very large box — exactly the answer §6.3 says never to give.
 *
 * §7.1 permits "exaggerated, stable mass tuning rather than literal kilograms when
 * realism harms feel", so `mass` is in TUNED UNITS that start life near kg. A real
 * packed moving box is 8-20 kg; these keep that range because nothing yet says otherwise.
 */

import { MASS_CLASS, DAMAGE } from '../config.js';

/** @typedef {object} ObjectDef  the §23.1 schema. Fields not needed until a later phase
 *  are present and marked, so the shape does not churn when that phase arrives. */

export const OBJECT_DEFS = Object.freeze({
  box_small_01: {
    id: 'box_small_01',
    /** §13.2 manifest category. Declared, not inferred from mass: the design table and
     *  the mass bands are different axes, and the mirror is small-and-light AND the second
     *  most valuable thing in the house. */
    category: 'box',
    prefab: 'box_small',
    massClass: 'light',
    mass: 9,
    dimensions: { x: 0.50, y: 0.50, z: 0.50 },
    centerOfMassOffset: { x: 0, y: 0, z: 0 },
    physics: { friction: 0.72, restitution: 0.04, linearDamping: 0.12, angularDamping: 0.55 },
    grip: { forceMult: 1.0, surface: 'cardboard' },
    fragility: 'normal',
    replacementValue: 40,
    surfaceTags: ['cardboard', 'container'],
    tags: ['container'],
    colour: 0xc2a06a,
    /** §7.1 cargoHints — optional tutorial cues. Unused until Phase 7. */
    cargoHints: [],
    disassembly: [],
  },

  /* A second box, heavier and off-centre. §6.2 lists object mass and distance from the
   * centre of mass as separate factors; with only one uniform box neither is observable,
   * and "grip location changes torque and balance visibly" (§26.2) cannot be judged.
   * The offset COM means this one hangs crooked unless you grab it near the heavy end —
   * which is the cheapest possible demonstration of the whole grip model. */
  box_heavy_01: {
    id: 'box_heavy_01',
    /** §13.2 manifest category. Declared, not inferred from mass: the design table and
     *  the mass bands are different axes, and the mirror is small-and-light AND the second
     *  most valuable thing in the house. */
    category: 'box',
    prefab: 'box_heavy',
    // 17 kg lands in §6.3's MEDIUM band (15-45), not light. Labelling it light to keep the
    // set tidy would be fudging the data to suit a test — and §6.3 is explicit that the
    // class is GUIDANCE, never a gate, so nothing in code behaves differently either way.
    massClass: 'medium',
    mass: 17,
    dimensions: { x: 0.56, y: 0.42, z: 0.42 },
    centerOfMassOffset: { x: 0.17, y: 0, z: 0 },   // books at one end
    physics: { friction: 0.78, restitution: 0.02, linearDamping: 0.14, angularDamping: 0.6 },
    grip: { forceMult: 1.0, surface: 'cardboard' },
    fragility: 'normal',
    replacementValue: 90,
    surfaceTags: ['cardboard', 'container'],
    tags: ['container'],
    colour: 0xa8834e,
    cargoHints: [],
    disassembly: [],
  },

  /* THE Phase 3 object. §7.1 gives couch_3seat_01 as its worked example, dimensions and
   * all, and §6.3 puts a couch in the HEAVY tier: "one drags or pivots; two or a tool
   * preferred". Those two lines together are the whole phase.
   *
   * The numbers land there without being forced. Lifting 90 kg needs 883 N; one hand caps
   * at 750 N, so a lone mover can only DRAG it. Two hands reach 1237 N and can just lift
   * it, and braced 2227 N is genuinely comfortable. Nothing refuses; the cost changes.
   *
   * Dragging is bounded by the SPRING, not the cap: at GRIP.maxStretch the spring delivers
   * 900 x 0.70 = 630 N, so floor friction has to sit well under that. See the friction
   * note below — it was 0.62 and the couch would not move at all. */
  couch_3seat_01: {
    id: 'couch_3seat_01',
    /** §13.2 manifest category. Declared, not inferred from mass: the design table and
     *  the mass bands are different axes, and the mirror is small-and-light AND the second
     *  most valuable thing in the house. */
    category: 'large',
    prefab: 'couch_3seat',
    massClass: 'heavy',
    mass: 90,
    dimensions: { x: 2.10, y: 0.85, z: 0.90 },
    // Slightly forward of centre: a couch's mass sits in the back and base, and an
    // off-centre COM is what makes WHERE you grab it matter (§6.2, §26.2).
    centerOfMassOffset: { x: 0, y: -0.12, z: 0.06 },
    /* Friction 0.35, arrived at by measurement rather than by taste.
     *
     * This began at 0.62 — rubber-on-concrete — which was survivable only while grip forces
     * were compounding every step and were therefore ~60x too strong. Once that bug was
     * fixed the couch became immovable, which is precisely the "hard denial" §25.2's gate
     * forbids and §2.1 rules out: "allow awkward solo dragging of objects intended for two
     * players".
     *
     * MEASURED with real forces: a one-handed drag develops about 358 N before the grip
     * gives way. 0.45 resists 397 N (still stuck), 0.35 resists 309 N (drags, slowly).
     * 0.35 is also the honest figure for a fabric-and-wood base on a hard floor, and §9.1's
     * furniture sliders exist to reduce it further still. */
    physics: { friction: 0.35, restitution: 0.02, linearDamping: 0.2, angularDamping: 0.8 },
    grip: { forceMult: 1.0, surface: 'fabric' },
    fragility: 'normal',
    replacementValue: 900,
    surfaceTags: ['fabric', 'furniture'],
    tags: ['furniture', 'twoPersonPreferred'],
    colour: 0x8a5a4a,
    cargoHints: ['heavy-low'],
    disassembly: [],
  },

  /* The middle rung, so "heavy" is not a single data point. 55 kg is liftable one-handed
   * (540 N against a 750 N cap) but slow and unbalancing — the awkward tier §6.3 describes
   * as "one player awkward". */
  dresser_01: {
    id: 'dresser_01',
    /** §13.2 manifest category. Declared, not inferred from mass: the design table and
     *  the mass bands are different axes, and the mirror is small-and-light AND the second
     *  most valuable thing in the house. */
    category: 'large',
    prefab: 'dresser',
    massClass: 'heavy',
    mass: 55,
    dimensions: { x: 1.10, y: 0.85, z: 0.50 },
    centerOfMassOffset: { x: 0, y: -0.08, z: 0 },
    physics: { friction: 0.68, restitution: 0.02, linearDamping: 0.18, angularDamping: 0.75 },
    grip: { forceMult: 1.0, surface: 'wood' },
    fragility: 'normal',
    replacementValue: 320,
    surfaceTags: ['wood', 'furniture'],
    tags: ['furniture'],
    colour: 0x9a7a4e,
    cargoHints: ['heavy-low'],
    disassembly: [],
  },

  /* ── Phase 5: the rest of §13.2's manifest ─────────────────────────────────────────
   *
   * §13.2 asks for 6-10 cardboard boxes, 3-5 small furniture, 3-4 medium, 2-3 large, 1-2
   * fragile/high value, and one showcase object. Each category earns its place by testing
   * something the others cannot, which is the reason the counts are what they are:
   *
   *   boxes         stack, and are the only things fast enough to make trips feel wasteful
   *   small         one-player carrying and AWKWARD SILHOUETTES (§13.2's own words) — a
   *                 floor lamp is 5 kg and nearly impossible to carry politely
   *   medium        two-hand control and doorway clearance
   *   large         co-op and route planning; these are what the doorway turn is for
   *   fragile       §8.3's point that "a fragile television and a cheap box should not
   *                 share a generic hit-point curve" — the value spread is 40 to 900
   *   showcase      the fridge, at 110 kg the heaviest thing in the contract
   *
   * MASSES ARE TUNED UNITS NEAR KG, per §7.1's licence to use "exaggerated, stable mass
   * tuning rather than literal kilograms when realism harms feel". These are all close to
   * real, because nothing yet says otherwise and real numbers are easier to argue with.
   *
   * Every mass sits inside its declared §6.3 band — validateDef enforces it, and it has
   * caught a mistake in this file before. The bands are guidance for the PLAYER (§6.3:
   * "guidance, not gates"); nothing in code branches on them to forbid an action.
   */

  /* Glassware. Light enough to toss and the worst possible thing to toss — which is the
   * §2.1 shape this project wants: nothing stops you, the consequence teaches you. */
  box_fragile_01: {
    id: 'box_fragile_01',
    /** §13.2 manifest category. Declared, not inferred from mass: the design table and
     *  the mass bands are different axes, and the mirror is small-and-light AND the second
     *  most valuable thing in the house. */
    category: 'box',
    prefab: 'box_fragile',
    massClass: 'light',
    mass: 11,
    dimensions: { x: 0.46, y: 0.40, z: 0.46 },
    centerOfMassOffset: { x: 0, y: -0.05, z: 0 },
    physics: { friction: 0.74, restitution: 0.03, linearDamping: 0.12, angularDamping: 0.58 },
    grip: { forceMult: 1.0, surface: 'cardboard' },
    fragility: 'fragile',
    replacementValue: 260,
    surfaceTags: ['cardboard', 'container'],
    tags: ['container', 'fragile'],
    colour: 0xd8c48a,
    cargoHints: ['top-only', 'no-stack-on'],
    disassembly: [],
  },

  chair_dining_01: {
    id: 'chair_dining_01',
    /** §13.2 manifest category. Declared, not inferred from mass: the design table and
     *  the mass bands are different axes, and the mirror is small-and-light AND the second
     *  most valuable thing in the house. */
    category: 'small',
    prefab: 'chair_dining',
    massClass: 'light',
    mass: 7,
    dimensions: { x: 0.46, y: 0.95, z: 0.50 },
    centerOfMassOffset: { x: 0, y: -0.16, z: 0 },   // seat and legs, not the backrest
    physics: { friction: 0.66, restitution: 0.05, linearDamping: 0.10, angularDamping: 0.5 },
    grip: { forceMult: 1.05, surface: 'wood' },
    fragility: 'normal',
    replacementValue: 70,
    surfaceTags: ['wood', 'furniture'],
    tags: ['furniture', 'stackable'],
    colour: 0x8f6f45,
    cargoHints: ['nest'],
    disassembly: [{ part: 'legs', tool: 'screwdriver', seconds: 40, shrinksTo: { x: 0.46, y: 0.52, z: 0.50 } }],
  },

  /* 5 kg and 1.65 m tall. §13.2 wants small furniture to test "awkward silhouettes", and
   * this is the cheapest possible one: trivially light, impossible to hold level, and it
   * fits through every door in the house only if you think about which way up. */
  lamp_floor_01: {
    id: 'lamp_floor_01',
    /** §13.2 manifest category. Declared, not inferred from mass: the design table and
     *  the mass bands are different axes, and the mirror is small-and-light AND the second
     *  most valuable thing in the house. */
    category: 'small',
    prefab: 'lamp_floor',
    massClass: 'light',
    mass: 5,
    dimensions: { x: 0.34, y: 1.65, z: 0.34 },
    centerOfMassOffset: { x: 0, y: -0.55, z: 0 },   // weighted base, or it would never stand
    physics: { friction: 0.58, restitution: 0.06, linearDamping: 0.10, angularDamping: 0.42 },
    grip: { forceMult: 0.95, surface: 'metal' },
    fragility: 'fragile',
    replacementValue: 120,
    surfaceTags: ['metal', 'furniture'],
    tags: ['furniture', 'fragile', 'tall'],
    colour: 0xb0b6bd,
    cargoHints: ['lay-flat'],
    disassembly: [],
  },

  side_table_01: {
    id: 'side_table_01',
    /** §13.2 manifest category. Declared, not inferred from mass: the design table and
     *  the mass bands are different axes, and the mirror is small-and-light AND the second
     *  most valuable thing in the house. */
    category: 'small',
    prefab: 'side_table',
    massClass: 'light',
    mass: 11,
    dimensions: { x: 0.55, y: 0.58, z: 0.55 },
    centerOfMassOffset: { x: 0, y: 0.14, z: 0 },    // heavy top, light legs
    physics: { friction: 0.70, restitution: 0.04, linearDamping: 0.11, angularDamping: 0.52 },
    grip: { forceMult: 1.0, surface: 'wood' },
    fragility: 'normal',
    replacementValue: 95,
    surfaceTags: ['wood', 'furniture'],
    tags: ['furniture'],
    colour: 0x9c7c50,
    cargoHints: [],
    disassembly: [{ part: 'legs', tool: 'screwdriver', seconds: 35, shrinksTo: { x: 0.55, y: 0.12, z: 0.55 } }],
  },

  nightstand_01: {
    id: 'nightstand_01',
    /** §13.2 manifest category. Declared, not inferred from mass: the design table and
     *  the mass bands are different axes, and the mirror is small-and-light AND the second
     *  most valuable thing in the house. */
    category: 'small',
    prefab: 'nightstand',
    massClass: 'light',
    mass: 13,
    dimensions: { x: 0.48, y: 0.62, z: 0.42 },
    centerOfMassOffset: { x: 0, y: -0.06, z: 0 },
    physics: { friction: 0.72, restitution: 0.03, linearDamping: 0.12, angularDamping: 0.55 },
    grip: { forceMult: 1.0, surface: 'wood' },
    fragility: 'normal',
    replacementValue: 110,
    surfaceTags: ['wood', 'furniture'],
    tags: ['furniture'],
    colour: 0x8a6a42,
    cargoHints: [],
    disassembly: [],
  },

  /* The most expensive thing in the house and one of the lightest for its size: 1.24 m
   * across and 90 mm thick. §8.3 names exactly this object as the reason condition bands
   * are per-object rather than a shared HP curve. */
  tv_55_01: {
    id: 'tv_55_01',
    /** §13.2 manifest category. Declared, not inferred from mass: the design table and
     *  the mass bands are different axes, and the mirror is small-and-light AND the second
     *  most valuable thing in the house. */
    category: 'fragile',
    prefab: 'tv_55',
    massClass: 'medium',
    mass: 22,
    dimensions: { x: 1.24, y: 0.76, z: 0.09 },
    centerOfMassOffset: { x: 0, y: -0.10, z: 0 },
    physics: { friction: 0.55, restitution: 0.02, linearDamping: 0.14, angularDamping: 0.7 },
    grip: { forceMult: 0.92, surface: 'glass' },    // nothing good to hold
    fragility: 'extreme',      // §8.3's most fragile band; 'very_fragile' is not a band that exists
    replacementValue: 900,
    surfaceTags: ['glass', 'electronics'],
    tags: ['fragile', 'electronics', 'flat'],
    colour: 0x2b2f36,
    cargoHints: ['upright-only', 'no-stack-on', 'strap'],
    disassembly: [{ part: 'stand', tool: 'screwdriver', seconds: 50, shrinksTo: { x: 1.24, y: 0.72, z: 0.07 } }],
  },

  bookshelf_01: {
    id: 'bookshelf_01',
    /** §13.2 manifest category. Declared, not inferred from mass: the design table and
     *  the mass bands are different axes, and the mirror is small-and-light AND the second
     *  most valuable thing in the house. */
    category: 'medium',
    prefab: 'bookshelf',
    massClass: 'medium',
    mass: 34,
    dimensions: { x: 0.80, y: 1.80, z: 0.30 },
    centerOfMassOffset: { x: 0, y: -0.22, z: 0 },
    physics: { friction: 0.68, restitution: 0.02, linearDamping: 0.15, angularDamping: 0.68 },
    grip: { forceMult: 1.0, surface: 'wood' },
    fragility: 'normal',
    replacementValue: 180,
    surfaceTags: ['wood', 'furniture'],
    tags: ['furniture', 'tall'],
    colour: 0x7d5f3c,
    cargoHints: ['heavy-low', 'lay-flat'],
    disassembly: [{ part: 'shelves', tool: 'screwdriver', seconds: 90, shrinksTo: { x: 0.80, y: 1.80, z: 0.06 } }],
  },

  armchair_01: {
    id: 'armchair_01',
    /** §13.2 manifest category. Declared, not inferred from mass: the design table and
     *  the mass bands are different axes, and the mirror is small-and-light AND the second
     *  most valuable thing in the house. */
    category: 'medium',
    prefab: 'armchair',
    massClass: 'medium',
    mass: 30,
    dimensions: { x: 0.95, y: 0.92, z: 0.90 },
    centerOfMassOffset: { x: 0, y: -0.14, z: 0.04 },
    physics: { friction: 0.60, restitution: 0.03, linearDamping: 0.16, angularDamping: 0.72 },
    grip: { forceMult: 1.08, surface: 'fabric' },   // easy to get hold of
    fragility: 'normal',
    replacementValue: 340,
    surfaceTags: ['fabric', 'furniture'],
    tags: ['furniture'],
    colour: 0x6d7f8a,
    cargoHints: ['heavy-low'],
    disassembly: [],
  },

  /* 1.90 x 1.37 x 0.26 and only 26 kg. Nothing else in the contract has this ratio of size
   * to mass, and it is the object most likely to make two movers get in each other's way —
   * which is what §13.2 means by large furniture testing "co-op and route planning". */
  mattress_double_01: {
    id: 'mattress_double_01',
    /** §13.2 manifest category. Declared, not inferred from mass: the design table and
     *  the mass bands are different axes, and the mirror is small-and-light AND the second
     *  most valuable thing in the house. */
    category: 'medium',
    prefab: 'mattress_double',
    massClass: 'medium',
    mass: 26,
    dimensions: { x: 1.37, y: 0.26, z: 1.90 },
    centerOfMassOffset: { x: 0, y: 0, z: 0 },
    physics: { friction: 0.82, restitution: 0.01, linearDamping: 0.22, angularDamping: 0.85 },
    grip: { forceMult: 1.10, surface: 'fabric' },
    fragility: 'normal',
    replacementValue: 420,
    surfaceTags: ['fabric', 'bedding'],
    tags: ['furniture', 'floppy'],
    colour: 0xdcd6c6,
    cargoHints: ['flat-against-wall'],
    disassembly: [],
  },

  /* 2.00 m tall against a 2.03 m doorway: 30 mm of headroom, upright, if it is empty and
   * you keep it level. §8.1 asks for critical clearances to be "visually legible", and a
   * wardrobe that all but scrapes the frame is about as legible as clearance gets. */
  wardrobe_01: {
    id: 'wardrobe_01',
    /** §13.2 manifest category. Declared, not inferred from mass: the design table and
     *  the mass bands are different axes, and the mirror is small-and-light AND the second
     *  most valuable thing in the house. */
    category: 'large',
    prefab: 'wardrobe',
    massClass: 'heavy',
    mass: 75,
    dimensions: { x: 1.20, y: 2.00, z: 0.60 },
    centerOfMassOffset: { x: 0, y: -0.18, z: 0 },
    physics: { friction: 0.52, restitution: 0.02, linearDamping: 0.18, angularDamping: 0.8 },
    grip: { forceMult: 0.98, surface: 'wood' },
    fragility: 'normal',
    replacementValue: 520,
    surfaceTags: ['wood', 'furniture'],
    tags: ['furniture', 'tall'],
    colour: 0x6f5334,
    cargoHints: ['heavy-low', 'strap'],
    disassembly: [{ part: 'doors', tool: 'screwdriver', seconds: 120, shrinksTo: { x: 1.20, y: 2.00, z: 0.52 } }],
  },

  mirror_framed_01: {
    id: 'mirror_framed_01',
    /** §13.2 manifest category. Declared, not inferred from mass: the design table and
     *  the mass bands are different axes, and the mirror is small-and-light AND the second
     *  most valuable thing in the house. */
    category: 'fragile',
    prefab: 'mirror_framed',
    massClass: 'light',
    mass: 14,
    dimensions: { x: 1.10, y: 1.60, z: 0.06 },
    centerOfMassOffset: { x: 0, y: 0, z: 0 },
    physics: { friction: 0.50, restitution: 0.02, linearDamping: 0.14, angularDamping: 0.7 },
    grip: { forceMult: 0.90, surface: 'glass' },
    fragility: 'extreme',      // §8.3's most fragile band; 'very_fragile' is not a band that exists
    replacementValue: 480,
    surfaceTags: ['glass', 'decor'],
    tags: ['fragile', 'flat'],
    colour: 0xaebfc9,
    cargoHints: ['upright-only', 'no-stack-on', 'blanket'],
    disassembly: [],
  },

  /* THE SHOWCASE OBJECT (§13.2). 110 kg — heavier than the couch, and unlike the couch it
   * is tall, narrow and top-heavy, so it wants to tip rather than drag. §6.3 puts it at the
   * top of HEAVY: "one drags or pivots; two or a tool preferred". Phase 6's dolly exists
   * for this. */
  fridge_01: {
    id: 'fridge_01',
    /** §13.2 manifest category. Declared, not inferred from mass: the design table and
     *  the mass bands are different axes, and the mirror is small-and-light AND the second
     *  most valuable thing in the house. */
    category: 'showcase',
    prefab: 'fridge',
    massClass: 'heavy',
    mass: 110,
    dimensions: { x: 0.70, y: 1.75, z: 0.70 },
    centerOfMassOffset: { x: 0, y: 0.12, z: 0 },    // top-heavy: motor low, mass high
    physics: { friction: 0.48, restitution: 0.01, linearDamping: 0.20, angularDamping: 0.85 },
    grip: { forceMult: 0.94, surface: 'metal' },
    fragility: 'normal',
    replacementValue: 1250,
    surfaceTags: ['metal', 'appliance'],
    tags: ['appliance', 'showcase', 'tall'],
    colour: 0xc9ced4,
    cargoHints: ['upright-only', 'heavy-low', 'strap'],
    disassembly: [{ part: 'doors', tool: 'screwdriver', seconds: 100, shrinksTo: { x: 0.62, y: 1.75, z: 0.66 } }],
  },
});

/** Where the Phase 2 boxes start. Kept beside the definitions rather than in the scene
 *  builder so the manifest and the level do not drift apart (§8.1's shared-record rule
 *  applied to objects instead of architecture). */
export const PHASE2_SPAWNS = Object.freeze([
  { def: 'box_small_01', x: -2.40, y: 0.30, z: 0.90, yaw: 0.0 },
  { def: 'box_small_01', x: -2.40, y: 0.30, z: 1.60, yaw: 0.4 },
  { def: 'box_small_01', x: -1.75, y: 0.30, z: 1.25, yaw: -0.2 },
  { def: 'box_heavy_01', x: -3.10, y: 0.26, z: 1.25, yaw: 0.15 },
]);

/** §6.3 is explicit that mass classes are GUIDANCE, NOT GATES: nothing may refuse an
 *  action because of a class. This returns the advisory string only — if you ever find
 *  yourself branching on the result to forbid something, that is the bug §6.3 warns about. */
export function handlingHint(def) {
  const c = MASS_CLASS[def.massClass];
  return c ? c.hint : '';
}

/** Validate a definition at load. §24.4: "build content validators early; incorrect
 *  colliders, zones, anchors and manifests will dominate production bugs." Cheap now,
 *  and it has already caught a mass outside its own declared class band. */
export function validateDef(def) {
  const problems = [];
  if (!def.id) problems.push('missing id');
  if (!(def.mass > 0)) problems.push(`mass must be positive, got ${def.mass}`);
  const d = def.dimensions;
  if (!d || !(d.x > 0 && d.y > 0 && d.z > 0)) problems.push('dimensions must all be positive');
  const cls = MASS_CLASS[def.massClass];
  if (!cls) problems.push(`unknown massClass "${def.massClass}"`);
  else {
    const [lo, hi] = cls.massRange;
    if (def.mass < lo || def.mass > hi) {
      problems.push(`mass ${def.mass} is outside the ${def.massClass} band ${lo}-${hi}`);
    }
  }
  // The COM offset must sit inside the object, or the body behaves like it has an
  // invisible weight hanging off it and no grip position can make sense of it.
  const o = def.centerOfMassOffset || { x: 0, y: 0, z: 0 };
  if (d && (Math.abs(o.x) > d.x / 2 || Math.abs(o.y) > d.y / 2 || Math.abs(o.z) > d.z / 2)) {
    problems.push('centerOfMassOffset falls outside the object bounds');
  }
  if (!(def.replacementValue >= 0)) problems.push('replacementValue must be >= 0');

  /* THE FRAGILITY BAND MUST EXIST.
   *
   * Added after two definitions shipped declaring `very_fragile`, which is not one of
   * DAMAGE.fragility's four bands (sturdy, normal, fragile, extreme) — and they were the
   * TV and the framed mirror, the two most valuable breakable objects in the contract.
   *
   * Nothing would have thrown here. Phase 8's damage lookup would have found `undefined`
   * and either skipped them or crashed on first contact, so the two items whose damage
   * matters most would have been the two the damage model did not cover — and it would not
   * have surfaced until a $900 television turned out to be indestructible. §24.4's whole
   * argument for building content validators early, demonstrated on this file twice now. */
  if (!DAMAGE.fragility[def.fragility]) {
    problems.push('unknown fragility "' + def.fragility + '"; have ' +
                  Object.keys(DAMAGE.fragility).join(', '));
  }
  const CATEGORIES = ['box', 'small', 'medium', 'large', 'fragile', 'showcase'];
  if (def.category && !CATEGORIES.includes(def.category)) {
    problems.push('unknown category "' + def.category + '" (§13.2)');
  }
  return problems;
}

export function validateAllDefs() {
  const out = {};
  for (const [id, def] of Object.entries(OBJECT_DEFS)) {
    const p = validateDef(def);
    if (p.length) out[id] = p;
  }
  return out;
}

/** Phase 3's heavy objects. They replace the static couch and dresser meshes that stood in
 *  the scene for Phases 0-2; the scene no longer builds those, so nothing is duplicated. */
export const PHASE3_SPAWNS = Object.freeze([
  { def: 'couch_3seat_01', x: 0.00, y: 0.44, z: 1.60, yaw: 0.0 },
  { def: 'dresser_01',     x: 3.00, y: 0.44, z: 1.20, yaw: 0.0 },
]);

/* ── Phase 5: the contract's objects, and where they live ──────────────────────────────
 *
 * §13.2's suggested manifest, instantiated. 23 objects: 9 cardboard boxes, 5 small
 * furniture, 4 medium, 3 large, and the fridge as §13.2's showcase item. That lands inside
 * §13.1's "roughly 15-25" with room to cut rather than room to pad.
 *
 * ONE RECORD, not two. Each row carries BOTH where the object starts and what the contract
 * wants done with it (`to`, the destination zone id, and `handling`). A separate manifest
 * file listing the same objects again is how a level and its manifest drift apart, which
 * §24.4 names as a bug class that "will dominate production bugs". buildManifest() in
 * src/contract/manifest.js derives the manifest from this list; nothing authors it twice.
 *
 * `to` names DESTINATION zones, which do not exist yet — the destination site is Phase 9
 * (§25.2). The field is here because §12.1 defines a manifest as "required objects,
 * destination zones, special handling" and leaving a third of that out would mean changing
 * the shape later. Nothing reads `to` yet. That is a seam, not an implementation (§25.1:
 * an expansion hook is permission to leave a seam, not permission to build it).
 *
 * Placement rules that the layout obeys, and m5 asserts:
 *   - nothing starts inside a wall or a doorway
 *   - nothing starts overlapping another object
 *   - every object starts inside a named pickup zone
 * Authoring 23 positions by hand and eyeballing them is exactly how a couch ends up half
 * inside a partition, so the suite checks all three rather than trusting this comment.
 */
export const PHASE5_SPAWNS = Object.freeze([
  // ---- living room: x -5..5, z -5..-2 ----
  { def: 'couch_3seat_01',     x: -2.60, y: 0.45, z: -3.20, yaw: 0.00,  to: 'dest_living',  handling: 'two-person' },
  { def: 'armchair_01',        x:  2.00, y: 0.48, z: -3.00, yaw: 0.35,  to: 'dest_living',  handling: '' },
  { def: 'tv_55_01',           x: -4.30, y: 0.40, z: -4.40, yaw: 1.57,  to: 'dest_living',  handling: 'fragile' },
  { def: 'side_table_01',      x:  0.60, y: 0.31, z: -2.70, yaw: 0.00,  to: 'dest_living',  handling: '' },
  { def: 'lamp_floor_01',      x:  4.30, y: 0.85, z: -2.60, yaw: 0.00,  to: 'dest_living',  handling: 'fragile' },
  { def: 'bookshelf_01',       x: -0.40, y: 0.92, z: -4.72, yaw: 0.00,  to: 'dest_living',  handling: '' },
  { def: 'box_small_01',       x:  3.40, y: 0.27, z: -4.40, yaw: 0.20,  to: 'dest_living',  handling: '' },
  { def: 'box_small_01',       x:  3.40, y: 0.78, z: -4.40, yaw: -0.10, to: 'dest_living',  handling: '' },

  // ---- kitchen: x 0..5, z -9..-5 ----
  { def: 'fridge_01',          x:  4.00, y: 0.90, z: -8.20, yaw: 0.00,  to: 'dest_kitchen', handling: 'showcase' },
  { def: 'box_fragile_01',     x:  1.20, y: 0.22, z: -6.20, yaw: 0.00,  to: 'dest_kitchen', handling: 'fragile' },
  { def: 'box_fragile_01',     x:  2.00, y: 0.22, z: -6.20, yaw: 0.30,  to: 'dest_kitchen', handling: 'fragile' },
  { def: 'box_small_01',       x:  1.20, y: 0.27, z: -7.00, yaw: 0.00,  to: 'dest_kitchen', handling: '' },
  { def: 'box_small_01',       x:  1.90, y: 0.27, z: -7.00, yaw: -0.25, to: 'dest_kitchen', handling: '' },
  { def: 'chair_dining_01',    x:  3.20, y: 0.50, z: -6.00, yaw: 0.00,  to: 'dest_kitchen', handling: '' },
  { def: 'chair_dining_01',    x:  3.20, y: 0.50, z: -6.90, yaw: 3.14,  to: 'dest_kitchen', handling: '' },
  { def: 'box_heavy_01',       x:  0.90, y: 0.23, z: -8.40, yaw: 0.15,  to: 'dest_kitchen', handling: '' },

  // ---- bedroom: x -5..0, z -9..-5 ----
  { def: 'mattress_double_01', x: -3.00, y: 0.15, z: -7.60, yaw: 0.00,  to: 'dest_bedroom', handling: 'two-person' },
  { def: 'wardrobe_01',        x: -4.30, y: 1.02, z: -5.90, yaw: 0.00,  to: 'dest_bedroom', handling: 'two-person' },
  { def: 'dresser_01',         x: -1.00, y: 0.45, z: -5.60, yaw: 0.00,  to: 'dest_bedroom', handling: '' },
  { def: 'nightstand_01',      x: -1.40, y: 0.33, z: -8.40, yaw: 0.00,  to: 'dest_bedroom', handling: '' },
  { def: 'mirror_framed_01',   x: -4.00, y: 0.82, z: -8.60, yaw: 0.00,  to: 'dest_bedroom', handling: 'fragile' },
  { def: 'box_small_01',       x: -2.20, y: 0.27, z: -5.40, yaw: 0.10,  to: 'dest_bedroom', handling: '' },
  { def: 'box_heavy_01',       x: -2.90, y: 0.23, z: -5.40, yaw: -0.20, to: 'dest_bedroom', handling: '' },
]);
