/* Object definitions — GDD §7.1, §23.1.
 *
 * "Every movable entity uses a data-driven definition plus runtime state. The visible
 * silhouette and collider must agree closely because spatial reasoning is the game."
 *
 * §29.1 sets the build order: "make one box feel good before adding furniture variety."
 * So Phase 2 defines BOXES and nothing else. The couch and dresser already stand in the
 * scene as static geometry and stay static until Phase 3 ("heavy object"), because a
 * couch that can be grabbed before the heavy-handling model exists would be judged on
 * the wrong terms — it would feel like a very large box, which is exactly the answer
 * §6.3 says the game must not give.
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
