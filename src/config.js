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
  phase: 12,
  label: 'phase-12',
  date: '2026-08-23',
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
  /** Capsule half-height of the CYLINDRICAL section. Total height = 2*hh + 2*radius, so
   *  this is derived, not free: 2*0.58 + 2*0.32 = 1.80. Change `height` and fix this. */
  capsuleHalfHeight: 0.58,
  walkSpeed: 3.1,            // m/s
  runSpeed: 5.4,
  braceSpeedMult: 0.45,      // §5.1 braced: "lower speed; higher grip and impulse resistance"
  acceleration: 28,          // m/s^2 — responsive indoors is the Phase 1 gate
  airAcceleration: 4,
  turnRate: 12,              // rad/s
  jumpVelocity: 4.6,

  // ---- character controller (§25.2 Phase 1 gate: responsive indoors AND on ramp) ----
  /** Gap the controller keeps between the capsule and geometry. Too small and it jitters
   *  against walls; too large and the player visibly floats off surfaces. */
  characterOffset: 0.02,
  /** §13.1 requires "short steps/porch". Autostep is what makes a porch step walkable
   *  without a jump, and 0.35 m clears a standard 7" (0.18 m) stair tread twice over. */
  stepHeight: 0.35,
  stepMinWidth: 0.18,
  /** A ramp at 0.28 rad is ~16 deg. The climb limit sits well above it so the gate's ramp
   *  is comfortable, while a wall is still a wall. */
  maxSlopeClimbDeg: 48,
  minSlopeSlideDeg: 52,
  /** Snap-to-ground stops the capsule launching off the crest of a ramp. Without it,
   *  walking down any slope becomes a series of small jumps. */
  snapToGroundDist: 0.5,
  /** Terminal fall speed, so a long drop stays readable rather than becoming a blur. */
  maxFallSpeed: 24,

  // ---- mantle (§5.1 Climbing state: "short assisted motion") ----
  mantleReach: 0.75,         // how far ahead a ledge may be
  mantleMinHeight: 0.45,     // below this, autostep handles it and no mantle is needed
  mantleMaxHeight: 1.35,     // above this it is a wall, not a ledge
  mantleSeconds: 0.42,       // §5.1 "short"; long enough to read, short enough not to annoy
  mantleForwardClear: 0.45,  // required clear depth on top, so you never mantle into a wall
  /** The mover's own mass, used to turn the reaction from a carried object into a pull on
   *  the body (§6.2 "object mass ... pulls players harder"). */
  mass: 78,

  /** §5.1 stumble/ragdoll thresholds. Entry is an imbalance measure, not a hit-point bar. */
  stumbleImpulse: 5.5,
  ragdollImpulse: 14,
  ragdollMinSeconds: 1.0,    // §5.1 "auto or player recovery in 1-3 seconds"
  ragdollMaxSeconds: 3.0,
  /** §5.2: overload reduces max force and adds tremble, but recovery is rapid. Not a bar. */
  exertRecoverPerSecond: 0.55,
  exertDrainPerSecond: 0.30,
});

/** §5.1 stumble, §5.2 exertion, §6.2 "pulls players harder" — the Phase 3 half of the
 *  model, and the half that makes weight LEGIBLE. Validated: Phase 3.
 *
 *  §25.2's Phase 3 gate is "weight legible without HARD DENIAL", and §2.1 is explicit that
 *  the game should rarely say no: "allow awkward solo dragging of objects intended for two
 *  players". So nothing here forbids an action. A 90 kg couch stays liftable by one person
 *  with two braced hands — it just slows them to a crawl, unbalances them, and drains what
 *  they can hold, until they put it down or fall over. Difficulty is expressed as cost and
 *  consequence, never as a refusal. */
export const CARRY = Object.freeze({
  /** Carried mass at which walking speed roughly halves. speed *= 1/(1 + carried/loadRef),
   *  so 9 kg costs ~17%, 55 kg ~45%, 90 kg ~67%. */
  loadRef: 45,
  /** Floor on the penalty, so a heavy object is punishing but never a full stop (§2.1). */
  minSpeedMult: 0.22,

  /** Horizontal force at which DRAGGING roughly halves walking speed.
   *
   *  Carrying is not the only way an object costs you. Dragging a couch loads almost no
   *  weight — the floor holds it up — so the supported-mass penalty barely applies, and
   *  without this the mover simply walks off at full speed and outruns what they are
   *  pulling: MEASURED, the grip broke after 18 steps while the mover strolled 11.9 m.
   *  Resisting force slows you exactly as carrying weight does. */
  //  600, not the 240 first tried. The `pull` velocity ALREADY opposes motion, so a strong
  //  speed penalty on top double-counts the same resistance and stops the mover dead —
  //  measured 0.26 m of travel in four seconds at 240. This term exists only to stop a
  //  mover outrunning what they are pulling; the pull itself does the rest.
  dragForceRef: 600,

  /** §6.2's reaction: the force the hand puts into the object also pulls the mover. This
   *  is the single thing that makes weight FELT rather than merely reported. */
  pullDamping: 3.2,          // per second; how fast the pull velocity decays
  maxPullSpeed: 2.4,         // m/s — bounded, or a heavy object could fling the player

  /** §5.1 stumbling. Imbalance is a 0..1+ measure, not a hit-point bar: it rises while
   *  overloaded or while being yanked sideways, and falls quickly once the load is
   *  comfortable again. Crossing 1 is "stumbling"; crossing knockdownAt puts the mover on
   *  the floor. */
  comfortableMass: 45,       // above this, imbalance starts to build
  imbalanceRise: 0.85,       // per second at twice the comfortable mass
  imbalanceFromPull: 0.55,   // per second per m/s of sideways pull
  imbalanceFall: 1.5,        // per second when comfortable — §5.1 "recovery is fast"
  stumbleAt: 1.0,
  knockdownAt: 1.9,
  /** §5.1 stumbling: "reduced control", not loss of control. */
  stumbleSpeedMult: 0.55,
  stumbleAccelMult: 0.45,

  /** §5.2: "sustained overload may reduce maximum force ... but recovery is rapid".
   *  Exertion is NOT a stamina bar — it never blocks an action, it only makes a hard hold
   *  harder to keep, which is what motivates a partner or a tool. */
  exertAt: 0.75,             // fraction of the force cap that counts as working hard
  exertForcePenalty: 0.40,   // at full exertion the cap drops by this fraction
});

/** §6.4 cooperative handling, §22.4 the multiplayer seam. Validated: Phase 4.
 *
 *  §25.2's Phase 4 is "second actor/test harness or command model", gated on "multiple
 *  grips combine predictably". This build is NOT networked — §13.4 is explicit that a
 *  deterministic or host-authoritative seam is what matters and that production networking
 *  must not delay feel tests. So there are two real movers in the world, each with their
 *  own body, hands and grips, and you switch between them. Neither owns anything: §14.2's
 *  "shared objects accept forces from all validated grips; no single client permanently
 *  owns a jointly held object" is already true, because a grip is just a force. */
export const MOVERS = Object.freeze({
  count: 2,
  /** Where each mover starts, relative to the scene spawn. Far enough apart that they are
   *  not standing in each other, close enough that both can reach the same couch. */
  spawnOffsets: [
    { x: -0.9, z: 0.0 },
    { x: 0.9, z: 0.6 },
  ],
  /** Body colours, so it is obvious which one you are driving. */
  colours: ['#5f6b8a', '#7a5f8a'],
  /** The inactive mover keeps holding what it was holding. That is the whole point: it is
   *  how one person experiences a two-person carry, and it is what makes §6.4's
   *  "opposite-end grips naturally stabilise long objects" reachable solo. */
  inactiveKeepsGrips: true,
});

/** Local co-op — §6.4, §4.3, §4.4, and a deliberate departure from §13.4. Validated: Phase 12.
 *
 * §13.4 excludes split-screen from the prototype and §14.1 files it as an expansion hook
 * "until proven feasible", which CLAUDE.md reads as leave-a-seam-do-not-build. Built anyway,
 * as a recorded product decision (docs/CHANGELOG.md, Phase 12) — the reason being that §6.4's
 * two-mover cooperation is a LOCKED pillar that no amount of solo Tab-swapping can playtest,
 * and §27.3's questions about what "the TEAM" tried cannot be asked without a team.
 *
 * SPLIT-SCREEN IS FORCED, not chosen. `GripSystem.aim()` derives its ray from the camera rig
 * (§4.1's aim assistance is defined in camera space), so two movers sharing one camera would
 * aim in the same direction and grab the same thing. One rig per mover keeps every validated
 * Phase 2/6/11 behaviour exactly as asserted; a shared auto-framed camera would mean
 * rebuilding all of it. Recorded because "why not one camera" is the obvious question. */
export const COOP = Object.freeze({
  maxSeats: 2,
  /** 'side-by-side' halves the WIDTH; 'stacked' halves the height. Side-by-side on a 16:9
   *  display gives each seat 8:9, which keeps the vertical context stairs and headroom need.
   *  Stacked would give 16:4.5 — wide enough to judge a doorway, too short to see a landing. */
  layout: 'side-by-side',
  dividerPx: 2,
  /** Seat 1 joins DELIBERATELY. A pad connecting must not split a solo player's screen —
   *  that is a regression to the validated single-player build, arriving as a surprise. */
  joinKey: 'F2',
  /** §4.1's boom, shortened for a half-width viewport: the same 4 m in half the horizontal
   *  field frames much less of the room, and the working area is what matters. */
  cameraDistance: 3.2,
});

/** §6.1, §6.2 grip. Validated: Phase 2 (one box), Phase 3 (heavy), Phase 4 (co-op). */
export const GRIP = Object.freeze({
  reach: 2.1,                // m, ray/cone length from the camera (§6.1)
  coneDegrees: 7,            // §6.1 "short cone", biases toward visible handles

  /** Spring stiffness, N/m. This number is why weight is legible: holding a mass m
   *  against gravity needs m*g newtons, so the grip point sags by m*g/spring. A 9 kg box
   *  hangs 0.10 m below the hand, a 17 kg box 0.19 m. §6.2 wants "object mass requires
   *  more force" to be VISIBLE, and the sag is how you see it without a readout. */
  spring: 900,

  /** DAMPING RATIO, not a coefficient — and that distinction is the whole point.
   *
   * A fixed coefficient cannot work, because critical damping for a mass-spring is
   * 2*sqrt(k*m) and therefore depends on the object. MEASURED with a flat 60 N.s/m:
   *   9 kg box   zeta 0.33   17 kg box  zeta 0.24   90 kg couch  zeta 0.11
   * All underdamped, all oscillating, and getting worse the heavier the object — so the
   * problem would have been invisible on a box and unbearable on a piano.
   *
   * The coefficient is therefore derived per grip as 2*zeta*sqrt(k_effective*mass).
   * 1.0 is critical damping: the fastest approach that does not overshoot at all, which
   * is exactly what §26.2's "without sustained jitter" asks for. */
  dampingRatio: 1.0,

  /** §6.4: "player force should be bounded so two clients cannot create an explosive
   *  feedback loop". This cap is the thing that stops that, so it is not a feel knob. */
  forceCap: 750,

  /** ACCELERATION cap, m/s^2 — the second half of the §6.4 bound, and the one a single
   *  force cap cannot express.
   *
   *  750 N on a 9 kg box is 83 m/s^2: eight and a half g. MEASURED consequence — running
   *  while carrying a box lets it lag, the spring saturates, and it accelerates hard to
   *  catch up; when the grip then breaks it leaves at 17 m/s and rockets across the room.
   *  Correct physics, absurd feel.
   *
   *  A hand is limited by how fast it can MOVE as well as how hard it can pull, so the cap
   *  is min(strength, mass * maxAccel). Light objects become acceleration-limited (you
   *  cannot whip a box around); heavy ones stay force-limited (you are not strong enough).
   *  25 m/s^2 is about 2.5 g. Brace and hand count raise strength, not hand speed, so the
   *  §6.2 multipliers apply to forceCap only. */
  maxAccel: 25,

  braceForceMult: 1.8,       // §6.2 brace "raises force cap and stability"
  twoHandForceMult: 1.65,    // §6.2 "two hands improve control and sustainable load"
  wetGripMult: 0.6,          // §6.2 surface grip; wet/slippery reduces sustainable force

  /** §6.2's "grip loss", and §2.1's "show why an attempt struggles". A grip whose demand
   *  sits at the cap for this long lets go, rather than the object silently refusing to
   *  move. Slipping is the feedback. */
  /** A hand also resists the object TURNING in it, which a single-point spring cannot
   *  express. Grab a free-hanging box by one face and it swings like a pendulum about the
   *  grip; damping that swing through the linear spring alone would need far more force
   *  than GRIP.maxAccel allows, so the box tears out of the hand for no reason a player
   *  could understand. Raising the body's angular damping while held is the cheap stand-in
   *  for a real hand's grip friction. Restored to the object's own value on release. */
  heldAngularDamping: 5.0,

  slipThreshold: 0.97,       // fraction of the cap that counts as overloaded
  slipMs: 420,               // sustained overload before the hand gives way

  /** THE ANTI-GHOSTING RULE (§25.2's Phase 2 gate, §7.3's "no wall ghosting").
   *  The held object is a fully dynamic body: it collides with the world and is dragged
   *  by a force, never teleported. So when the player backs through a doorway the box
   *  cannot follow, the spring stretches instead. Past this separation the grip breaks.
   *  Without it the spring would keep winding up and eventually fire the box through the
   *  wall in one step, which is precisely the failure the gate names.
   *
   *  INVARIANT: maxStretch MUST stay below forceCap / spring (0.833 m at the base cap).
   *  Above that ratio the spring is saturated — demand exceeds the cap, the applied force
   *  can no longer grow with distance, and the object can never catch up. A grip that
   *  enters that band is already doomed and merely takes another second to admit it. At
   *  1.15 m there was a 0.32 m dead band doing exactly that; 0.70 m keeps 16% margin.
   *  tools/m2-tests.js asserts the relationship so a later tweak cannot reintroduce it. */
  maxStretch: 0.70,
  /** Fraction of the theoretical maximum tow speed a mover is allowed to use.
   *  v_max = sqrt(k/m) * maxStretch would put the lag exactly ON the tear threshold, which
   *  tears on the first bump. 0.55 leaves the steady lag at about half the budget. */
  towSpeedSafety: 0.55,

  holdDistanceMin: 0.85,     // how close the hand target may be pulled
  holdDistanceMax: 2.0,      // …and how far it may be pushed
  handLateral: 0.20,         // m each hand sits off the camera centreline; two hands
                             // therefore apply force at two points and resist twisting
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
  /* ITEM DAMAGE IS KEYED ON IMPACT SPEED, NOT ON IMPULSE. This was rewritten in Phase 6,
   * and the reason is worth keeping.
   *
   * The original bands were `impulseThreshold` / `conditionPerImpulse`, and impulse is
   * m*dv — so the model made an object more fragile simply for being heavy. MEASURED
   * against the old numbers: setting the 90 kg couch down at a gentle 0.5 m/s produced an
   * impulse of 45 N.s, cost 55.3 condition points, and dropped it straight into the
   * `cracked` band. A 9 kg box hitting the floor twice as fast took 4.9 points and stayed
   * perfect. The couch was ten times more delicate than a box of glassware, purely by mass.
   *
   * That is precisely backwards from §8.3, which exists to say "a fragile television and a
   * cheap box should not share a generic hit-point curve". Fragility is a property of the
   * OBJECT, and what breaks something is how hard it is hit — its speed on contact — not
   * how much it weighs.
   *
   * Mass has not stopped mattering; it moved to where it belongs. §15.1 prices property
   * damage and item damage as SEPARATE line items, and §8.3 describes static surfaces in
   * terms of "contact energy above threshold". So a heavy object still does more harm to a
   * wall than a light one, through `property` below, which IS keyed on impulse.
   *
   * Sanity of the numbers, all in m/s:
   *   couch set down at 0.5     below the 2.0 threshold, no damage
   *   couch dropped at 3.0      (3.0-2.0)*26 = 26 points -> scratched
   *   TV set down at 0.5        below its 0.7 threshold, no damage
   *   TV dropped at 1.5         (1.5-0.7)*90 = 72 points -> cracked, 0.35 x 900 = 315
   *   TV dropped at 2.0         117 points -> broken, the full 900
   */
  fragility: {
    sturdy:  { impactSpeed: 3.2, conditionPerMps: 14 },
    normal:  { impactSpeed: 2.0, conditionPerMps: 26 },
    fragile: { impactSpeed: 1.1, conditionPerMps: 55 },
    extreme: { impactSpeed: 0.7, conditionPerMps: 90 },
  },
  /** §8.3 static surfaces: "contact energy above threshold accumulates damage". THIS half
   *  is keyed on impulse, because what a wall suffers really does scale with the mass that
   *  hit it. §15.1's separate "property damage" line item. Validated: Phase 8. */
  property: {
    impulseThreshold: 12,
    costPerImpulse: 1.6,
    maxChargePerSurface: 400,   // §8.3 "maximum charge"
  },
  /** §7.3 + §8.3: "aggregate repeated scrape contacts into one coherent damage event".
   *  Without this a couch dragged along a wall bills the player forty times. */
  aggregationWindowMs: 700,
  aggregationRadius: 0.8,    // m — contacts within this of each other merge
});

/** §9.1 tools, §9.2 interaction contract, §8.2 modifiable environment. Validated: Phase 6.
 *
 *  §9.1's rule governs every number here: "Tools create new physical solutions; they do not
 *  erase physics. Each tool changes leverage, friction, protection, clearance, containment,
 *  or securing. Better tools should introduce both new mastery and new accidents."
 *
 *  So each tool below changes ONE physical quantity, and each one's benefit and its failure
 *  mode come from the SAME change rather than from a separate penalty bolted on:
 *
 *    dolly       lowers friction  -> rolls on the flat, and runs away on a slope
 *    blanket     raises the impact-speed threshold -> protects, and is harder to grip
 *    ramp        adds a walkable surface -> bridges the deck, and can be laid badly
 *    screwdriver changes dimensions -> packs smaller, and makes loose parts to lose
 */
export const TOOLS = Object.freeze({
  /** One reach for everything, matching GRIP.reach. §9.2 wants deploy/attach/fold/retrieve
   *  "through the common interaction system", and two different ranges would make the same
   *  gesture work at different distances depending on what you were pointing at. */
  interactRange: 2.1,
  /** How far off the aim line an anchor may sit and still be selectable, m.
   *
   *  Anchors are 100 mm knobs and are POINTS rather than colliders — six small obstacles
   *  inside the cargo box would be six things for the load to snag on. Selecting them by
   *  proximity to the aim line instead needs a tolerance, and 0.28 m is about a thumb at
   *  arm's length: forgiving enough to be usable, tight enough that two adjacent anchors
   *  are still distinguishable (they are 1.47 m apart). */
  anchorAimRadius: 0.28,
  /** Aim assist for SMALL tools, m·m. Divided by the tool's largest dimension to get its
   *  selection tolerance, so a 0.26 m screwdriver gets 0.46 m of slack and the 2.70 m ramp
   *  gets the 0.28 m floor. A 50 mm target at arm's length is a mouse-precision test, and
   *  §9.2 asks for tools to be deployed through the common interaction system rather than
   *  through marksmanship. */
  smallToolAssistM: 0.12,

  dolly: {
    mass: 14,
    dimensions: { x: 0.78, y: 0.14, z: 0.48 },
    /* THE WHOLE TOOL, in one number. A loaded object's friction is replaced by this while
     * the dolly is under it: couch 0.35 -> 0.04 is an 8.75x cut in the force needed to
     * shift it, and fridge 0.48 -> 0.04 is 12x.
     *
     * §9.1's failure mode falls out of the same substitution rather than being authored:
     * with friction that low, a loaded dolly on the scene's 16-degree ramp has 244 N
     * pushing it downhill against 34 N of resistance. It runs. Nothing had to be added to
     * make it run — taking the friction away is what a dolly IS. */
    rollingResistance: 0.04,
    /** Above this slope a loaded dolly is a hazard rather than a help (§9.1 "runs on
     *  slopes"). Not a refusal — it still works, it just stops being your friend. */
    slopeRunawayDeg: 4.0,
    liftM: 0.14,               // deck height; the load sits this much higher
  },

  blanket: {
    mass: 3,
    dimensions: { x: 1.80, y: 0.06, z: 1.40 },
    /** §9.1 "reduce scratches/impact". Multiplies the impact speed an object tolerates
     *  before losing condition: a TV goes from 0.7 m/s to 1.54 m/s. */
    thresholdMult: 2.2,
    /** …and softens what does get through. */
    conditionMult: 0.45,
    /** §9.1's failure mode: "bad wrap obscures grip or falls off". A wrapped object is
     *  harder to hold — there is nothing rigid under your hands. */
    gripForceMult: 0.82,
    /** Above this impact speed the wrap comes off and stops protecting anything. */
    shedSpeed: 3.4,
  },

  ramp: {
    mass: 22,
    /** 2.70 m long against a 1.20 m deck is asin(1.20/2.70) = 26.4 degrees — inside
     *  PLAYER.maxSlopeClimbDeg (48), so it is walkable, and steep enough that a loaded
     *  dolly on it is a genuine problem. */
    length: 2.70,
    width: 1.10,
    thickness: 0.10,
    deckHeight: 1.20,          // matches PLATFORM.y; the scene's ramp already rises 1.2022
    /** §9.1 "misalignment or steep approach". Laid further than this from the deck edge,
     *  the ramp leaves a lip instead of a joint. */
    alignToleranceM: 0.18,
  },

  screwdriver: {
    mass: 1,
    dimensions: { x: 0.05, y: 0.05, z: 0.26 },
    /** §23.1's disassembly entries carry their own `seconds`; this scales all of them, so
     *  one number tunes how much preparation costs without re-authoring every object. */
    timeScale: 1.0,
    /** §9.1 "loose pieces get lost" — detached parts are real bodies with real recovery,
     *  not a flag on the parent. This is how heavy they are relative to what they came off. */
    partMassFraction: 0.14,
  },
});

/** §10.3 straps. Validated: Phase 7. */
export const STRAP = Object.freeze({
  /* THESE WERE WRONG AND ARE NOW DERIVED. The declared pair was stiffness 2600 N/m against
   * ratingNewtons 3400, which requires 3400/2600 = 1.31 m of stretch to reach §10.3's
   * "overstressed" and 2.00 m to fail — across a cargo box 4.20 m long. Two of §10.3's four
   * states were unreachable and the strap was a bungee cord.
   *
   * Stiffness now comes from how far webbing actually gives at its rating. 30 mm at
   * 1200 N is about 1% of a 3 m strap, which is the right order for polyester webbing on a
   * ratchet, and it is stiff enough that the four states are separated by centimetres
   * instead of by metres. */
  stretchAtRating: 0.030,
  get stiffness() { return this.ratingNewtons / this.stretchAtRating; },   // 40 000 N/m

  /* THE RATING COMES FROM WHAT THE LOAD DEMANDS, not from a catalogue.
   *
   * The worst §11.3 road event is a hard brake at TRUCK.brakeForce = 5.2 m/s^2. The heaviest
   * single item is the 110 kg fridge, so one strap holding it alone sees 110 * 5.2 = 572 N
   * statically, and a spring-restrained mass overshoots roughly 2x on a step input — about
   * 1150 N. Setting the rating at 1200 N puts a SINGLE strap on the heaviest item right at
   * the edge of "overstressed" during a hard brake, and comfortably inside it with two.
   *
   * That is the decision the player should be making, so that is where the threshold goes.
   * A real 50 mm ratchet strap is rated far higher; §7.1's licence to use "exaggerated,
   * stable mass tuning rather than literal kilograms when realism harms feel" applies to
   * forces for the same reason. */
  ratingNewtons: 1200,       // §10.3 state → overstressed
  failureNewtons: 1900,      // …and at which it gives way

  /* Damping acts on the rate of separation only. Near-critical for a mid-weight item:
   * 2*sqrt(k*m) at m = 40 kg is 2530, and a strap wants to be slightly under-damped so a
   * hard brake produces a visible snatch rather than a silent absorb (§10.3's feedback
   * column asks for "ratchet clicks", "creak, vibration"). */
  damping: 1400,

  /** How much a ratchet click takes up. 8 mm against a 40 000 N/m strap is about 320 N per
   *  click — four clicks to a sensible pre-load and fifteen to break it. The default was
   *  60 mm, which is 2400 N: above failureNewtons, so the FIRST click snapped every strap. */
  ratchetStepM: 0.008,
  maxLength: 4.5,
  anchorCount: 6,            // §13.1 asks for 4-8 anchors in the prototype truck
});

/** §10.2 cargo rules, §10.4 pack quality. Validated: Phase 7. */
export const CARGO = Object.freeze({
  /** §10.2: "Required objects count as loaded only after crossing the cargo threshold and
   *  SETTLING inside the closed volume." Settling is the registry's existing definition. */
  loadedDwellMs: 800,
  /** §10.4's advisory heuristic. Fraction of cargo mass that may be unrestrained before the
   *  HUD warns. Advisory ONLY — §10.4 forbids it from damaging anything by itself. */
  unsecuredWarnFraction: 0.35,
  /** How far an item may shift during transport before the pack counts as having moved.
   *  This is a MEASUREMENT threshold for scoring, not a rule that stops anything. */
  shiftToleranceM: 0.25,
  /** A strap is considered to be restraining an item while it is at least this taut. */
  /** A strap counts as RESTRAINING while it has no more than this much slack in it.
   *
   *  Not instantaneous tension, which is the obvious choice and is wrong: a rope over a
   *  stationary load carries almost no force, so a perfectly strapped pack at rest measured
   *  as 100% unsecured. Slack is the property that actually distinguishes a strap doing its
   *  job from one hanging off the side, and it is the same thing §10.3's SLACK state means. */
  securedSlackM: 0.05,
  restrainingTensionN: 40,
});

/** §11.2 truck. "Driving is the final exam for packing, not a racing minigame" (§11.1).
 *  Validated: Phase 8. */
export const TRUCK = Object.freeze({
  mass: 2600,
  /** Deck friction. A truck deck is plywood or steel, not carpet, and this is why real
   *  loads are strapped. At the 0.8 of a house floor an unstrapped pack shifted 2 mm in a
   *  hard brake and §10.3's straps had nothing to improve on. */
  deckFriction: 0.32,
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

  /* Added in Phase 10, when §15.1's formula finally had to be computed rather than named. */

  /** §15.1: "Base contract | Rewards completion and scope | Fixed value." Sized against the
   *  cost side rather than picked: two movers across the 18-minute estimate is
   *  18 x 14 x 2 = 504, so a base of 900 leaves a competent job comfortably profitable and a
   *  shambolic one genuinely not — which is what makes §15.2's "negative profit still
   *  completes the job" a real possibility rather than a theoretical one. */
  basePayout: 900,

  /** How far under the estimate earns the FULL efficiency bonus, as a fraction of the
   *  estimate. 0.25 is four and a half minutes early on an 18-minute job. §15.1 says
   *  "graduated; no hard cutoff", so this scales a ramp and is never a threshold. */
  efficiencyFullAt: 0.25,

  /** §15.1's room-accuracy bonus is for a PERFECT unload; a partial one earns this fraction
   *  of it, pro rata. Not zero — §2.3 wants trying-and-mostly-succeeding to beat not trying. */
  roomAccuracyPartial: 0.5,

  /** §13.3's "short contained street". The prototype route is one leg of it. */
  routeDistanceKm: 4.2,
});

/** §18.3 recovery. Validated: Phase 5. */
export const RECOVERY = Object.freeze({
  outOfBoundsGraceSeconds: 4,
  noProgressGraceSeconds: 12,
  stableTransformIntervalMs: 900,   // how often a last-known-good transform is banked
  /** §18.3: an OBJECT that leaves the world is recovered too, not only a player. Phase 5's
   *  gate is "all objects recoverable and movable", so this is the half that makes the
   *  first word true. Lifted slightly above the banked transform so it drops onto the
   *  surface rather than starting interpenetrated with it. */
  objectRecoveryLiftM: 0.12,
  objectFloorY: -8,                 // below this an object is gone and gets recovered
});

/** §12.1 manifest + §12.3 destination placement. Validated: Phase 5 (pickup half),
 *  Phase 9 (delivery half). */
export const MANIFEST = Object.freeze({
  /** §13.1: "Objects | Roughly 15-25". Asserted against the spawn table at load. */
  minObjects: 15,
  maxObjects: 25,
  /** §12.3 "substantially inside" — the share of an object's footprint that must lie in the
   *  zone. NOT 1.0: a couch delivered into a small room may legitimately overhang the
   *  doorway, and demanding full containment would make large objects undeliverable, which
   *  is the kind of accidental hard denial §2.1 forbids. */
  containedFraction: 0.6,
  /** §12.3 "settled ... for a dwell time". Long enough that skidding through does not
   *  count, short enough that it never feels like the game is withholding credit. */
  dwellMs: 1200,
});

/** §22.5 debug + performance instrumentation. Validated: Phase 0. */
export const DEBUG = Object.freeze({
  overlayEnabledByDefault: true,
  frameSampleSize: 120,      // frames averaged for the FPS readout
  eventLogLines: 8,
});
