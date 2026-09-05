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

import { MASS_CLASS, DAMAGE, PARTS, DOOR } from '../config.js';

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
     * furniture sliders exist to reduce it further still.
     *
     * CORRECTION, Phase 6: those resistance figures are the ones this number IMPLIES, not
     * the ones the solver applies. Rapier averages the two colliders' coefficients and the
     * ground is 0.9, so the effective value against the floor is (0.35 + 0.9)/2 = 0.625 and
     * the real resistance is 552 N, not 309 N. Everything tuned against it was tuned by
     * measurement, so the FEEL is right and only the arithmetic in this comment was wrong.
     * The rule is left at Average deliberately — see registry.js — and the dolly switches
     * this object to Min while it is underneath. It is also why a lone mover can barely
     * shift this couch: 552 N against a ~422 N one-handed budget. */
    physics: { friction: 0.35, restitution: 0.02, linearDamping: 0.2, angularDamping: 0.8 },
    grip: { forceMult: 1.0, surface: 'fabric' },
    fragility: 'normal',
    replacementValue: 900,
    surfaceTags: ['fabric', 'furniture'],
    tags: ['furniture', 'twoPersonPreferred'],
    colour: 0x8a5a4a,
    cargoHints: ['heavy-low'],
    /* §7.1's own schema example is THIS couch with "four legs / screwdriver", and §8.2 lists
     * "furniture legs: unscrew and reattach" as one of the two outs at a tight door. 80 mm
     * legs: 0.85 -> 0.77 across, which is the couch's narrowest presentation (m0 C3/C4), so
     * with the legs off it clears the 0.82 m opening by 50 mm and the 0.86 m door by 90 mm
     * where intact it is -30 mm and +10 mm. Anything >= 30 mm of leg would clear 0.82; 80 mm
     * is what a three-seater's legs actually are. 60 s is the §8.2 "preparation time" —
     * billed to the labour clock by the interaction system, not free (§2.3). Packed volume
     * 1.6065 -> 1.4553 m3 (-9.4%). Phase 11 M8.
     *
     * `piece` (M12) is what a detached part IS once it is off: four 60 x 80 x 60 mm feet,
     * each 90 x 0.14 / 4 = 3.15 kg, spawned beside the couch as real bodies that must also
     * reach the truck (§9.1 "creates loose parts … loose pieces get lost"). */
    disassembly: [{ part: 'legs', tool: 'screwdriver', seconds: 60, reversible: true, shrinksTo: { x: 2.10, y: 0.77, z: 0.90 },
                    piece: { name: 'leg', count: 4, dims: { x: 0.06, y: 0.08, z: 0.06 }, prefab: 'leg' } }],
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
    disassembly: [{ part: 'legs', tool: 'screwdriver', seconds: 40, reversible: true, shrinksTo: { x: 0.46, y: 0.52, z: 0.50 },
                    piece: { name: 'leg', count: 4, dims: { x: 0.43, y: 0.035, z: 0.035 }, prefab: 'leg' } }],
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
    disassembly: [{ part: 'legs', tool: 'screwdriver', seconds: 35, reversible: true, shrinksTo: { x: 0.55, y: 0.12, z: 0.55 },
                    piece: { name: 'leg', count: 4, dims: { x: 0.46, y: 0.04, z: 0.04 }, prefab: 'leg' } }],
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
    disassembly: [{ part: 'stand', tool: 'screwdriver', seconds: 50, reversible: true, shrinksTo: { x: 1.24, y: 0.72, z: 0.07 },
                    piece: { name: 'stand', count: 1, dims: { x: 0.62, y: 0.05, z: 0.26 }, prefab: 'stand' } }],
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
    disassembly: [{ part: 'shelves', tool: 'screwdriver', seconds: 90, reversible: true, shrinksTo: { x: 0.80, y: 1.80, z: 0.06 },
                    piece: { name: 'shelf', count: 4, dims: { x: 0.76, y: 0.035, z: 0.24 }, prefab: 'board' } }],
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
    disassembly: [{ part: 'doors', tool: 'screwdriver', seconds: 120, reversible: true, shrinksTo: { x: 1.20, y: 2.00, z: 0.52 },
                    piece: { name: 'door', count: 2, dims: { x: 0.58, y: 0.04, z: 1.90 }, prefab: 'panel' } }],
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
    disassembly: [{ part: 'doors', tool: 'screwdriver', seconds: 100, reversible: true, shrinksTo: { x: 0.62, y: 1.75, z: 0.66 },
                    piece: { name: 'door', count: 2, dims: { x: 0.62, y: 0.05, z: 0.80 }, prefab: 'panel' } }],
  },

  /* THE HOUSE'S OWN DOORS (Phase 11 build-side M11; §8.2 "Door: open or remove from hinges",
   * §2.1 "removing doors ... where the authored level supports them", §9.1 "loose pieces get
   * lost"). One leaf definition, hung once per door record that carries a `leaf` (house.js
   * INTERIOR_DOORS, scene.js APERTURES) — spawned by main.js through the registry, NOT a
   * PHASE5_SPAWNS row, so it is never on the manifest and never counts as cargo delivered.
   * Category 'fixture': part of the house, not the customer's goods. 18 kg lifts one-handed
   * (177 N against ~358 N); 40 × 2000 × 800 mm is a stock internal door. While hung its body
   * is FIXED at the jamb (registry.hang); off its hinges it is an ordinary dynamic object
   * that can be carried, dropped, damaged (fragility 'normal', replacementValue from
   * config DOOR — §8.2 "replacement risk") and, per §9.1, lost. Local axes: x thickness,
   * y height, z length, handle at +z (house.js leafPose relies on that). */
  door_leaf_01: {
    id: 'door_leaf_01',
    category: 'fixture',
    prefab: 'door_leaf',
    massClass: 'medium',
    mass: DOOR.leaf.mass,
    dimensions: { x: DOOR.leaf.t, y: DOOR.leaf.height, z: DOOR.leaf.length },
    centerOfMassOffset: { x: 0, y: 0, z: 0 },
    physics: { friction: 0.55, restitution: 0.02, linearDamping: 0.16, angularDamping: 0.7 },
    grip: { forceMult: 0.96, surface: 'wood' },
    fragility: 'normal',
    replacementValue: DOOR.replacementValue,
    surfaceTags: ['wood', 'fixture'],
    tags: ['fixture', 'flat', 'door'],
    colour: 0xe4dccb,
    cargoHints: ['flat-against-wall'],
    disassembly: [],
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
  else if (def.category !== 'part') {
    /* A PART is exempt from the band floor (M12): a dining chair's leg is 7 x 0.14 / 4 =
     * 0.245 kg, under the 1 kg 'light' floor by nature, and §6.3's classes are guidance
     * for HANDLING — nothing handles a leg differently for being under a kilogram. */
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
  // 'part' (M12: a detached part or a fragment, never a manifest row) and 'fixture' (M11: a
  // door leaf, part of the house) are the two non-manifest categories beside §13.2's six.
  const CATEGORIES = ['box', 'small', 'medium', 'large', 'fragile', 'showcase', 'part', 'fixture'];
  if (def.category && !CATEGORIES.includes(def.category)) {
    problems.push('unknown category "' + def.category + '" (§13.2)');
  }

  /* EVERY AUTHORED PART HAS A SHAPE (M12). §9.1's screwdriver "creates loose parts", and a
   * part with no `piece` would come off as a string in removedParts and nothing else —
   * which is exactly what three phases of KNOWN_ISSUES called vacuous. Checked here, at
   * load, so an entry authored without one announces itself in the build it ships in. */
  for (const p of def.disassembly || []) {
    const pc = p.piece;
    if (!pc) { problems.push(`part "${p.part}" has no piece shape (M12: a part is a body)`); continue; }
    if (!(Number.isInteger(pc.count) && pc.count >= 1)) problems.push(`part "${p.part}": piece.count must be a positive integer`);
    const pd = pc.dims;
    if (!pd || !(pd.x > 0 && pd.y > 0 && pd.z > 0)) problems.push(`part "${p.part}": piece.dims must all be positive`);
    if (typeof pc.prefab !== 'string' || !pc.prefab) problems.push(`part "${p.part}": piece.prefab must name a prefab`);
    if (typeof pc.name !== 'string' || !pc.name) problems.push(`part "${p.part}": piece.name (the singular the prompt prints) is missing`);
  }
  return problems;
}

/* ── derived definitions: pieces and fragments (M12; §9.1, §26.4) ─────────────────────
 *
 * A piece is an ObjectDef like any other — the registry spawns it through the same
 * spawn(), the same validator, the same prefab table — DERIVED from its parent's row rather
 * than authored twice (§24.4: a part authored separately from the object it came off is how
 * the two drift). Memoised per parent/part so an entity's `def` is a stable object across
 * the run, the way every OBJECT_DEFS entry is. */
const _derivedDefs = new Map();

/** 'couch_3seat_01' -> 'couch 3seat': the same derivation interact.js label() uses. */
function wordsOf(id) {
  return (id || '').replace(/_\d+$/, '').replace(/_/g, ' ');
}

/**
 * The definition of ONE piece of an authored part: mass and replacement value are the
 * parent's share by PARTS.partMassFraction split across the count (a couch leg is 3.15 kg
 * and 31.50 of the couch's 900), fragility is the parent's, and the category is 'part' so
 * nothing counts it as a manifest row.
 */
export function pieceDefFor(parent, entry) {
  const key = `${parent.id}#${entry.part}`;
  const hit = _derivedDefs.get(key);
  if (hit) return hit;
  const pc = entry.piece;
  const count = pc.count;
  const def = {
    id: key,
    label: `${wordsOf(parent.id)} ${pc.name}`,
    category: 'part',
    prefab: pc.prefab,
    massClass: 'light',
    mass: parent.mass * PARTS.partMassFraction / count,
    dimensions: { x: pc.dims.x, y: pc.dims.y, z: pc.dims.z },
    centerOfMassOffset: { x: 0, y: 0, z: 0 },
    physics: { ...parent.physics },
    grip: { ...(parent.grip || { forceMult: 1.0, surface: 'wood' }) },
    fragility: parent.fragility,
    replacementValue: parent.replacementValue * PARTS.partMassFraction / count,
    surfaceTags: [...(parent.surfaceTags || [])],
    tags: ['part'],
    colour: parent.colour,
    cargoHints: [],
    disassembly: [],
    /** Which object and part this is a piece of — data, so the manifest can price a piece
     *  left behind without the entity (§15.1). */
    partOf: { defId: parent.id, part: entry.part, name: pc.name, count },
  };
  _derivedDefs.set(key, def);
  return def;
}

/**
 * The definition of one FRAGMENT of a broken object (§26.4 "becomes trackable pieces").
 * PARTS.brokenFragmentCount[fragility] of them; each PARTS.fragmentScale of the parent's
 * dimensions (floored at fragmentMinDim, never larger than the parent), laid flat — the
 * smallest scaled axis is the height. replacementValue 0: the 'broken' band already charged
 * the whole object (DAMAGE.bands), so a fragment is tracked, not priced.
 */
export function fragmentDefFor(parent) {
  const key = `${parent.id}#fragment`;
  const hit = _derivedDefs.get(key);
  if (hit) return hit;
  const count = PARTS.brokenFragmentCount[parent.fragility] ?? PARTS.defaultFragmentCount;
  const d = parent.dimensions;
  const scaled = (v) => Math.min(v, Math.max(v * PARTS.fragmentScale, PARTS.fragmentMinDim));
  const axes = [scaled(d.x), scaled(d.y), scaled(d.z)].sort((a, b) => b - a);
  const def = {
    id: key,
    label: `${wordsOf(parent.id)} fragment`,
    category: 'part',
    prefab: 'fragment',
    massClass: 'light',
    mass: parent.mass * PARTS.partMassFraction / count,
    dimensions: { x: axes[0], y: axes[2], z: axes[1] },
    centerOfMassOffset: { x: 0, y: 0, z: 0 },
    physics: { ...parent.physics },
    grip: { ...(parent.grip || { forceMult: 1.0, surface: 'wood' }) },
    fragility: parent.fragility,
    replacementValue: 0,
    surfaceTags: [...(parent.surfaceTags || [])],
    tags: ['part', 'fragment'],
    colour: parent.colour,
    cargoHints: [],
    disassembly: [],
    fragmentOf: { defId: parent.id, count },
  };
  _derivedDefs.set(key, def);
  return def;
}

/** Every derived definition the authored table implies — for a suite that wants to check
 *  the piece prefabs the way m13 checks the object prefabs (inside their own dimensions). */
export function derivedDefs() {
  const out = [];
  for (const def of Object.values(OBJECT_DEFS)) {
    for (const entry of def.disassembly || []) out.push(pieceDefFor(def, entry));
    out.push(fragmentDefFor(def));
  }
  return out;
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
  /* THE COUCH STARTS BEHIND THE 34-INCH DOOR (Phase 11 M8). Row 0 stays row 0 — m5, m9 and
   * m15 read rows[0] — but it now spawns in the KITCHEN (x 0..5, z -9..-5). Until M8 it
   * stood in the living room at (-2.60, -3.20), where ROUTES.living_room is ['front36'] =
   * 0.91 m and nothing on its way out was narrower than 0.91 — the 0.86 and 0.82 openings
   * were demonstration geometry. From the kitchen its route is living_kitchen (0.86 m: on
   * its side, 10 mm intact or 90 mm with the legs off) then front36 (0.91), which is §3.3's
   * two approaches on the shipped contract and the thing house.js:6-18 built the turn for.
   * Spans x 1.45..3.55, z -8.85..-7.95: 100 mm clear of the fridge (x >= 3.65), 60 mm off
   * the back wall's inner face (-8.91), clear of the heavy box (x <= 1.18) and of the
   * boxes at z >= -7.25. Still goes to dest_living. */
  { def: 'couch_3seat_01',     x:  2.50, y: 0.45, z: -8.40, yaw: 0.00,  to: 'dest_living',  handling: 'two-person' },

  // ---- living room: x -5..5, z -5..-2 ----
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
