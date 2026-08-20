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

import { MASS_CLASS } from '../config.js';

/** @typedef {object} ObjectDef  the §23.1 schema. Fields not needed until a later phase
 *  are present and marked, so the shape does not churn when that phase arrives. */

export const OBJECT_DEFS = Object.freeze({
  box_small_01: {
    id: 'box_small_01',
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
