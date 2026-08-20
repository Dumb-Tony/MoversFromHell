/* Named tuning — GDD §25.1 ("keep tuning in named config/data rather than scattered
 * literals"), §25.3 ("tuning values are named and documented"), §27.5 (the high-leverage
 * set). Every number the designer might want to turn lives here and nowhere else.
 *
 * HONESTY NOTE: only the values under SIM and RENDER are exercised by Phase 0. Everything
 * below them is a DECLARED PLACEHOLDER — a named home so the value never gets sprinkled
 * into a system as a literal, not a tuned number. Each unvalidated block says which phase
 * validates it. Do not quote these as balance decisions until that phase's gate passes.
 *
 * Units are metres, kilograms-ish, seconds. §7.1 explicitly permits "exaggerated, stable
 * mass tuning rather than literal kilograms when realism harms feel", so `mass` is in
 * TUNED UNITS that happen to start life near kg.
 */

/** Build identity, shown in the debug overlay and the corner stamp.
 *
 * GitHub Pages serves with Cache-Control: max-age=600, so a returning visitor can be
 * looking at a build up to ten minutes old. Without a visible stamp there is no way to
 * tell, which makes "is this the current build?" unanswerable during a playtest. Bump
 * `label` on every deploy. */
export const BUILD = Object.freeze({
  phase: 0,
  label: 'phase-0',
  date: '2026-08-19',
});

/** Simulation cadence. Validated by Phase 0. */
export const SIM = Object.freeze({
  stepHz: 60,
  stepMs: 1000 / 60,
  /** Frame gaps longer than this are discarded, not banked (§7.3, §26.6). A backgrounded
   *  tab hands back multi-second deltas; spending them would fire settled cargo through
   *  the truck roof. 250ms = at most 15 catch-up steps in one frame. */
  maxFrameMs: 250,
  /** §7.3 "cap maximum impulse, angular velocity, and constraint correction". */
  maxLinearVelocity: 40,     // m/s
  maxAngularVelocity: 20,    // rad/s
  gravity: -9.81,
});

/** Renderer + camera. Validated by Phase 0 (frame stability) and Phase 1 (feel). */
export const RENDER = Object.freeze({
  /** §26.6: 60 FPS at 1080p target, 45 FPS playtest floor with the full manifest. */
  targetFps: 60,
  playtestFloorFps: 45,
  /** Capping the backing store keeps a 4K display from quietly quadrupling fill cost —
   *  copied from AirportBaggageCrew\src\render\camera.js, where it was the single biggest
   *  frame-time win. */
  maxPixelRatio: 2,
  fov: 60,
  near: 0.1,
  far: 300,
  /** §4.1 third-person: shoulder-height, adjustable distance, collision avoidance. */
  camera: {
    height: 1.55,            // shoulder height, m
    distance: 4.0,
    distanceMin: 1.6,        // indoor compression floor (§4.1 "compress smoothly")
    distanceMax: 7.0,
    pitchMin: -1.15,         // rad, looking down at a couch
    pitchMax: 0.75,
    lookScale: 0.0022,       // rad per unit of accumulated look delta
    followLerp: 12,          // per second; higher = stiffer
    occludeLerpIn: 30,       // pull in fast (§4.1 "rather than cut unpredictably")
    occludeLerpOut: 4,       //  ...ease back out slowly
  },
});

/* ------------------------------------------------------------------------------------
 * PLACEHOLDERS BELOW THIS LINE. Named, not tuned.
 * ---------------------------------------------------------------------------------- */

/** §5.1 hybrid character model, §5.2 exertion, §27.5 first bullet. Validated: Phase 1, 3. */
export const PLAYER = Object.freeze({
  radius: 0.32,
  height: 1.8,
  walkSpeed: 3.1,            // m/s
  runSpeed: 5.4,
  braceSpeedMult: 0.45,      // §5.1 braced: "lower speed; higher grip and impulse resistance"
  acceleration: 28,          // m/s^2 — responsive indoors is the Phase 1 gate
  airAcceleration: 4,
  turnRate: 12,              // rad/s
  jumpVelocity: 4.6,
  /** §5.1 stumble/ragdoll thresholds. Entry is an imbalance measure, not a hit-point bar. */
  stumbleImpulse: 5.5,
  ragdollImpulse: 14,
  ragdollMinSeconds: 1.0,    // §5.1 "auto or player recovery in 1-3 seconds"
  ragdollMaxSeconds: 3.0,
  /** §5.2: overload reduces max force and adds tremble, but recovery is rapid. Not a bar. */
  exertRecoverPerSecond: 0.55,
  exertDrainPerSecond: 0.30,
});

/** §6.1, §6.2 grip. Validated: Phase 2 (one box), Phase 3 (heavy), Phase 4 (co-op). */
export const GRIP = Object.freeze({
  reach: 2.1,                // m, ray/cone length from the camera (§6.1)
  coneDegrees: 7,            // §6.1 "short cone", biases toward visible handles
  spring: 900,               // constraint stiffness
  damping: 60,
  /** §6.4: "player force should be bounded so two clients cannot create an explosive
   *  feedback loop". This cap is the thing that stops that, so it is not a feel knob. */
  forceCap: 750,
  braceForceMult: 1.8,       // §6.2 brace "raises force cap and stability"
  twoHandForceMult: 1.65,    // §6.2 "two hands improve control and sustainable load"
  slipThreshold: 0.82,       // fraction of force cap at which the grip starts to slide
  wetGripMult: 0.6,          // §6.2 surface grip; wet/slippery reduces sustainable force
});

/** §7.1 mass classes. §6.3 is explicit that these are GUIDANCE, NOT GATES — nothing in
 *  code may refuse an action because of a class. Validated: Phase 3, 5. */
export const MASS_CLASS = Object.freeze({
  light:   { massRange: [1, 14],    hint: 'one player carries freely; some items tossable' },
  medium:  { massRange: [15, 45],   hint: 'one player awkward; two stable' },
  heavy:   { massRange: [46, 120],  hint: 'one drags or pivots; two or a tool preferred' },
  extreme: { massRange: [121, 400], hint: 'team plus equipment; brute force remains possible' },
});

/** §7.1, §8.3 damage. Condition bands are authored states, not a generic HP curve (§8.3:
 *  "a fragile television and a cheap box should not share a generic hit-point curve").
 *  Validated: Phase 10. */
export const DAMAGE = Object.freeze({
  /** §8.3 Perfect → Scratched → Chipped/Cracked → Broken. Condition is 0..100 (§7.2). */
  bands: [
    { name: 'perfect',   min: 95, costFraction: 0.00 },
    { name: 'scratched', min: 70, costFraction: 0.08 },
    { name: 'cracked',   min: 35, costFraction: 0.35 },
    { name: 'broken',    min: 0,  costFraction: 1.00 },
  ],
  fragility: {
    sturdy:  { impulseThreshold: 9.0, conditionPerImpulse: 0.6 },
    normal:  { impulseThreshold: 5.5, conditionPerImpulse: 1.4 },
    fragile: { impulseThreshold: 2.4, conditionPerImpulse: 4.0 },
    extreme: { impulseThreshold: 1.2, conditionPerImpulse: 8.5 },
  },
  /** §7.3 + §8.3: "aggregate repeated scrape contacts into one coherent damage event".
   *  Without this a couch dragged along a wall bills the player forty times. */
  aggregationWindowMs: 700,
  aggregationRadius: 0.8,    // m — contacts within this of each other merge
});

/** §10.3 straps. Validated: Phase 7. */
export const STRAP = Object.freeze({
  stiffness: 2600,
  damping: 90,
  ratingNewtons: 3400,       // force at which state → overstressed
  failureNewtons: 5200,      // …and at which it snaps
  maxLength: 4.5,
  anchorCount: 6,            // §13.1 asks for 4-8 anchors in the prototype truck
});

/** §11.2 truck. "Driving is the final exam for packing, not a racing minigame" (§11.1).
 *  Validated: Phase 8. */
export const TRUCK = Object.freeze({
  mass: 2600,
  acceleration: 3.4,         // m/s^2 — deliberately unexciting
  brakeForce: 5.2,
  maxSpeed: 13.5,            // ~48 km/h
  steerRate: 0.85,           // rad/s at low speed
  steerSpeedFalloff: 0.55,   // §11.2 "wide turns"
  bodyRollPerG: 0.09,        // rad
  /** §11.3 the three prototype-required road events. Severity is the impulse multiplier. */
  roadEvents: {
    hardBrake:  { severity: 1.0 },
    sharpTurn:  { severity: 1.0 },
    speedBump:  { severity: 0.8 },
  },
  /** §11.2: poor balance affects handling "without becoming a punishing simulator". */
  imbalanceSteerPenaltyMax: 0.18,
});

/** §15.1 invoice. Validated: Phase 10. §26.4: generic damage never auto-fails a contract. */
export const ECONOMY = Object.freeze({
  labourPerMinutePerMover: 14,
  overtimeMultiplier: 1.6,
  fuelPerKm: 3.2,
  /** §15.1 "graduated; no hard cutoff" — an efficiency bonus that cliffs would make §2.3's
   *  "spend several hilarious minutes trying a terrible idea" economically fatal. */
  efficiencyBonusMax: 260,
  oneTripBonus: 180,
  roomAccuracyBonus: 90,
  recoveryFee: 45,           // §18.3 documented fee for a state-safe unstick
  collisionFeeBase: 60,
});

/** §18.3 recovery. Validated: Phase 5. */
export const RECOVERY = Object.freeze({
  outOfBoundsGraceSeconds: 4,
  noProgressGraceSeconds: 12,
  stableTransformIntervalMs: 900,   // how often a last-known-good transform is banked
});

/** §22.5 debug + performance instrumentation. Validated: Phase 0. */
export const DEBUG = Object.freeze({
  overlayEnabledByDefault: true,
  frameSampleSize: 120,      // frames averaged for the FPS readout
  eventLogLines: 8,
});
