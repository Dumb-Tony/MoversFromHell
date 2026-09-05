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
  phase: 31,
  label: 'phase-31',
  date: '2026-09-05',
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

    /* ---- camera shake (Phase 11 build-side M16; §21.4 Motion, §26.5, §11.3, §8.4) ----------
     * A damped-spring OFFSET on the eye — in the rig's flat frame (x right, y up, z forward)
     * plus a small pitch/roll — integrated on SIM time with the exact solution of the damped
     * oscillator (camera.js), so it reads the same at 60 and 144 Hz. Applied AFTER the boom
     * solve and probed against the walls again before it lands, so it can neither fight the
     * follow lerp nor push the eye through a wall. Never on yaw/pitch (m24 K6). A nudge ADDS
     * to the offset and both caps are on the running value, not the sum (m24 K4).
     * ω = √stiffness = 30 rad/s (4.8 Hz); ζ = damping / 2ω = 0.3 — two visible wobbles.
     * Settle: |x| ≤ x0·e^(−ζωt)/√(1−ζ²), so a 50 mm nudge is inside 1 mm at 0.44 s;
     * settleMs is that with margin (m24 K1 drives it, m24 Z pins the derivation). */
    /** m — the camera's eye never goes below this (a boom clipped by the floor, a shake). */
  eyeFloorY: 0.22,
  shake: {
    /** A speed bump pitches by this fraction of the road rotation (brakes/turns use it whole). */
    bumpRotFraction: 0.5,
      stiffness: 900,          // 1/s², ω²
      damping: 18,             // 1/s, 2ζω
      maxOffset: 0.12,         // m, cap on the offset's LENGTH
      maxRot: 0.035,           // rad, cap on |pitch| and |roll| of the rotational part
      settleMs: 600,           // a 50 mm nudge is back inside 1 mm within this many sim ms
      /** Below these the spring is declared at rest and the second probe is skipped, so a
       *  still camera renders byte-identically to a build without shake (m13/m15 shots). */
      restOffset: 1e-5,        // m
      restVelocity: 1e-4,      // m/s
      /** The sim clock stalled longer than this (paused, or a suite stepping physics without
       *  the clock): integrate on the frame time instead, so a shake never freezes mid-air. */
      simStallS: 0.05,
      /** §11.3 road events, felt by the DRIVING seat: metres and milliradians per unit of
       *  TRUCK.roadEvents[type].severity, along the same truck-frame direction the cargo's
       *  pseudo-force takes (truck.js roadEventForce): a brake lurches forward and pitches
       *  the view down, a turn lurches sideways and rolls, a bump lifts. */
      road: 0.06,
      roadRotMrad: 14,
      /** IMPACT within impactRange of a seat's mover: metres at AUDIO.impact.fullVelocity
       *  standing on the spot, × ((fullV − minV) fraction) × (1 − d/range)². Mostly a lift
       *  (the floor jolt) with `impactAway` of it directed away from the hit. Below
       *  AUDIO.impact.minVelocity nothing is felt — the audio's own silence threshold. */
      impact: 0.05,
      impactRange: 6,          // m
      impactAway: 0.5,
      /** The mover's own §5.1 knockdown: one nudge, on its own seat. */
      knockdown: 0.08,
      knockdownRotMrad: 25,
    },
  },

  /* ---- Phase 15: the Overcooked look ------------------------------------------------------
   * Chosen 2026-09-02 from a four-proposal design panel judged from three lenses (art,
   * engine, constraints); the spec is in docs/CHANGELOG.md. Every number a shader, material
   * or light reads comes from HERE — §25.1: no bare literal in a system. */

  /** The post chain over the BACKBUFFER: scene renders to the canvas exactly as today (MSAA
   *  kept for free), copyFramebufferToTexture captures it, then bright+downsample, blur H,
   *  blur V, composite. No render target ever receives the scene, so r128's viewport-reset,
   *  16-bit-depth and CSS-vs-drawing-buffer traps never apply. gpu tier only. */
  post: {
    enabled: true,
    bloom: { threshold: 0.86, knee: 0.10, strength: 0.28, sigmaQuarterPx: 3.0 },
    grade: { warm: [1.02, 1.00, 0.97], gain: 0.965, lift: [0.035, 0.028, 0.026], saturation: 1.10 },
    vignette: { amount: 0.15, inner: 0.125, outer: 0.50 },
    dither: true,
    /** Must equal scene.js HORIZON and the sky's horizon stop: the 2 px split-screen gap
     *  is painted this colour under the DOM divider. */
    divider: 0xdfe9ee,
  },

  /** Material, occlusion and rig constants shared by textures.js, materials.js, prefabs.js,
   *  scene.js, lighting.js and contactBlobs.js. */
  look: {
    /** One texture repeat per this many metres on 'tile'-UV parts, so texel density is
     *  constant across prefab sizes (a 2.1 m couch and a 0.5 m box share one grain scale). */
    texelMetres: 0.5,
    plankMetres: 1.0,
    /** ACES exposure. Derived so a lit white face lands ~0.93 sRGB, unclipped, under the
     *  bloom threshold; the shadowed side of a mid albedo sits at ~0.5× the lit side. */
    exposure: 1.05,
    fog: { near: 30, far: 120 },
    /** 'vsm' (soft, gpu only; ?shadows=pcf overrides) | 'pcfsoft'. */
    shadows: 'vsm',
    /** Vertex-baked occlusion: a darkening band up from each part's base. */
    ao: { strength: 0.30, bandMax: 0.25 },
    /** Multiply-blended contact strips along every wall base. */
    skirt: { width: 0.30, strength: 0.38 },
    /** Ground-following contact blobs under every entity, tool and mover (gpu only). */
    blob: { strength: 0.45, fadeLift: 0.60, maxDist: 20, rayMax: 2.5 },
    /** Fresnel rim, masked toward world-up, shared onBeforeCompile across surface() materials. */
    rim: { sky: 0xdceaff, power: 3.0 },
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

  /** LEGS ANCHOR THE REACTION — the seam, and a MEASURED NEGATIVE RESULT. Phase 11 (M7).
   *
   *  Horizontal reaction a grounded mover's legs hold before the object starts moving THEM;
   *  only the excess integrates into `pull` (PlayerController.applyCarry). resistedForce
   *  still bills the full magnitude. Zero while airborne or knocked down.
   *
   *  THE IDEA. 100% of the reaction became pull, as if the mover stood on ice. Steady pull
   *  = F / (PLAYER.mass x pullDamping) = F / 249.6 m/s, which reaches the couch's 1.22 m/s
   *  tow cap at only 305 N, while the couch needs 552 N to break floor friction (Average
   *  combine rule, registry.js). So a lone mover was hauled back at 305 N and the couch
   *  never moved: 0.00 m in 3 s. A budget the legs absorb first should have fixed that.
   *
   *  THE MEASUREMENT (one mover, one hand, the m6 B3 haul, 180 steps, traction overridden
   *  per run, every other object parked clear):
   *
   *    unbraced   0 N   couch 0.000 m held 180/180   dolly 2.08 m held    fridge 0.000 m
   *    unbraced 200 N   couch 0.05 m (0.053-0.057, two runs) held 180/180   dolly 1.27 m TORN    fridge 1.27 m TOPPLED
   *    unbraced 350 N   couch 0.001 m TORN @ 0.6 s   dolly 1.27 m TORN    mover strolls 7.8 m
   *    braced   350 N   couch 0.040 m held 180/180   two braced 2.08 m    fridge 1.2 m TOPPLED
   *    braced   400 N   couch 0.254 m held 180/180   two braced 2.09 m    fridge 1.24 m TOPPLED
   *    braced   450 N   couch 0.094 m TORN @ 1.5 s   two braced 2.06 m    fridge 0.006 m torn
   *    braced   560 N   couch 0.012 m TORN @ 0.9 s   two braced 2.07 m    fridge 0.002 m torn
   *
   *  WHY. The grip damps against the object's ABSOLUTE velocity (grip.js: c*vp, c = 569
   *  N.s/m for the couch), so a towed couch drags a viscous brake on top of 552 N of
   *  friction and can follow a hand no faster than (spring x band - 552)/c: 0.137 m/s
   *  unbraced, 0.248 m/s braced. The mover walks at 1.22 (tow cap) or ~0.90 m/s braced (3.1 x 0.45 x 1/(1 + 327/600)). The
   *  only thing that ever slowed the mover to what the couch could follow was the pull —
   *  and its steady value is (552 - T)/249.6 m/s at ANY speed, so it either hauls the mover
   *  back (T <= 250: the stall) or lets them out-walk the band (T >= 250: a tear, then a
   *  mover strolling 7 m from a stationary couch). Every T >= 100 also tears the DOLLY haul,
   *  whose 1.05 m/s ceiling the pull had been enforcing by accident. The traction idea is
   *  right; it needs the damping computed in the hand's frame (the next increment) and a
   *  tow cap that knows about friction before it can do anything but harm.
   *
   *  Shipped at 0 by M7: identical to Phase 6 behaviour, seam kept. tools/m3-tests.js D5
   *  pins the subtraction itself; tools/m6-tests.js B8-B10 pin the ceilings.
   *
   *  M10 (hand-frame damping, GRIP.handFrameDamping) removed the brake, re-swept, and set
   *  it — the sweep table is in docs/CHANGELOG.md (Phase 11 M10). What the number does now:
   *  the tow cap (grip.js towLimits) ADDS the haul-back (552 - tractionN) / 249.6 m/s to the
   *  walk it allows, so the hand nets its safe speed whatever this is; what this decides is
   *  how hard the couch is FELT to pull (0.81 m/s of haul-back at 350) and how hard a mover
   *  can lean on the fridge before it hauls them (tractionN + 250 x GRIP.towSpeedFloor =
   *  387 N nominal, 412 N measured after 10 s, under the ~460 N that tips it). Bounded above
   *  by m3 D5c (< 400, D1/D2's fixture) and by the fridge. Solo couch, one hand, 3 s: 0.34 m
   *  (0.000 at M7), 2.4 m in 10 s, held throughout. */
  tractionN: 350,
  /** Braced (§6.2 "raises force cap and stability"), as an ABSOLUTE number, because the sweep
   *  needs the two to differ: unbraced must stay 0 (the dolly), braced 400 N is the one value
   *  that buys a solo braced quarter-metre — and a lone braced mover toppling the fridge
   *  (tipping a 0.70 m deep, 110 kg fridge grabbed at 0.875 m needs 1079 x 0.35 / 0.875 = 432 N by the static estimate — measured, a 445-457 N braced stall at that grab tilts 0.0°, so the real threshold there is the ~460 N grip.js quotes, and 315 N at a 1.2 m grab,
   *  far under the 745 N sliding limit), which flips m6 B5/B6's "beyond one hand unaided".
   *  That is a product decision (docs/KNOWN_ISSUES.md), so M7 shipped this at 0 too.
   *
   *  M10: the fridge's stall force is now braceTractionN + 250 x GRIP.towSpeedFloor (the
   *  crawl) plus creep, not + 250 x 1.10. MEASURED over 10 s of braced pulling at the crawl
   *  (tools/_probe-drag.js "topple boundary", reproduced in the default run): 380 N ->
   *  445-457 N and tilt 0.0°; 420 N -> topples at 6.8 s; 440 N -> 6.3 s; 380 N at a 0.25 m/s
   *  crawl -> 6.5 s. So 380, one sweep step under the line; §5.1 "impulse resistance" is
   *  why it exceeds tractionN at all. It does NOT make bracing the faster way to drag: a
   *  braced mover's legs walk at 0.45x, ~0.72-0.76 m/s under this load (3.1 x 0.45 x
   *  1/(1 + ~566/600); m6 B9 measures the legs' peak at 0.76), against a haul-back of
   *  (552 - 380)/249.6 = 0.69 m/s, so the hand nets ~0.03 m/s and braced towing is an
   *  ANCHOR (0.02 m in 3 s, 0.45 m in 10 s, never torn) — m6 B9/B9a say so on purpose. */
  braceTractionN: 380,

  /** §5.1 stumbling. Imbalance is a 0..1+ measure, not a hit-point bar: it rises while
   *  overloaded or while being yanked sideways, and falls quickly once the load is
   *  comfortable again. Crossing 1 is "stumbling"; crossing knockdownAt puts the mover on
   *  the floor. */
  comfortableMass: 45,       // above this, imbalance starts to build
  imbalanceRise: 0.85,       // per second at twice the comfortable mass
  imbalanceFromPull: 0.55,   // per second per m/s of sideways pull
  /** M10: "sideways" is measured against where the mover is TRYING to go. An intent this
   *  small (|move| on the 0..1 stick/keys scale) is standing still, and standing still the
   *  whole pull is a yank — you are simply being dragged (controller._updateBalance). */
  imbalanceStandingIntent: 0.1,
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
  /** …and the same on a controller (§25.3): the View (Back/Select) button, read by main.js's
   *  shell observer beside F2. Standard Gamepad button index 8 — PAD.VIEW in input.js; m15
   *  P7b asserts the two agree. A raw button rather than a bound action on purpose: joining
   *  must never be something a remap can put on a grip. */
  joinPad: 8,
  /** §4.1's boom, shortened for a half-width viewport: the same 4 m in half the horizontal
   *  field frames much less of the room, and the working area is what matters. */
  cameraDistance: 3.2,
});

/* Phase 11 build-side M5 — the first-minute comprehension layer (§21.3, §26.5, §26.7). */
export const PROMPTS = Object.freeze({
  /** §26.5 "both input mappings": a seat's prompt glyphs follow the device it last used —
   *  but only once it has been that device for this long of SIM time. `activeDevice` flips
   *  on ANY pad activity (a stick a hair past its deadzone flips it every poll), and an
   *  undebounced prompt flickered E/X at frame rate. 250 ms = 15 steps: invisible on a real
   *  switch, immune to a one-poll blip. Sim time, so a paused game neither counts nor
   *  flickers (m12 K3). */
  deviceDebounceMs: 250,
});
export const CONTRACT = Object.freeze({
  /** §21.3's first step, advised rather than taught (Dev\INDEX.md → AirportBaggageCrew
   *  onboarding: "a first-minute rail with NO training pauses" — a STALL TIMER, not a route
   *  check). If nobody has gripped anything this far into the pickup, one notice says how.
   *  SIM time, so a paused game cannot fire it (m0 E3); once per run; the first grip retires
   *  it (m11 O6). 30 s: long enough to have walked the house and looked at the truck, short
   *  enough to reach a tester before the first minute is over. */
  stallHintMs: 30000,
});

/** §26.7 Comprehension "most players move a box and identify the next objective without
 *  coaching" / §25.2 Phase 11 "onboarding" / §21.3 first steps — Phase 11 build-side M22,
 *  src/ui/walkthrough.js. Three cards, each dismissed by DOING the thing (the first grip by
 *  seat 0, the first item loaded, then the objective line taking over), never by a button;
 *  a ✕ skips. Shell state (the card and the shell key `walkthroughSeen`), never game.state,
 *  and never in the harness unless a suite asks (?walkthrough=1 or DEBUG.walkthroughInHarness). */
export const WALKTHROUGH = Object.freeze({
  /** How long the third card ("now the rest — the panel says what is next") stays after the
   *  first load, in SIM time, before it retires on its own; the first delivery retires it
   *  sooner. 20 s: long enough to read once and glance at the objective line it points to,
   *  short enough that a player who drove straight off is not still being told. */
  step3Ms: 20000,
  /** The gap the card keeps above the help line it sits over (px, at --ts 1; the card's
   *  bottom is measured from the help line's live height, so a larger text size or high
   *  contrast cannot push the two into each other — m29 W1). */
  clearancePx: 8,

  /* ── THE BOTTOM BAND IN A NARROW WINDOW (Phase 11 build-side M32; §21.4 Vision, §21.1) ──
   * M22 left this recorded and unmeasured: the card is bottom-LEFT and the caption and the
   * route bar are CENTRED, so at the harness's 1262 px the card ends at x 322 and the bar
   * begins at 471, but as the window narrows the bar's left edge (w/2 − 160) walks toward the
   * card and reaches it below ~960 px. It was never measured because the harness cannot
   * resize its window.
   *
   * The rule is keyed on the BAND's own width — #ui's clientWidth, which is the viewport's
   * except when a suite overrides it to emulate one (m39 E4) — and not on a @media query,
   * for exactly that reason: a media query reads the viewport, which the harness cannot move.
   * Under narrowPx the card takes the badge form (one row, the body line dropped) and the
   * boxes above the help line rise by --band-lift, its measured height plus bandGapPx, so the
   * band STACKS instead of colliding. Above narrowPx --band-lift is 0 and nothing moves
   * (m36 S2's 0.5 px pins, m29 W1's rects). */
  /** px of band width at or below which the card takes the badge form. 960 is the width
   *  KNOWN_ISSUES named: at it the route bar's left edge is 320 px and a 1.0× card ends at
   *  10 + min(312, 33 % − 12) = 322 — the first pixel of overlap. */
  narrowPx: 960,
  /** px between the badge's top and whatever now sits above it. The same 6 px the notices
   *  stack with (styles.css .notices gap). */
  bandGapPx: 6,
});

/** §21.2 "the manifest filters by room/category and shows pickup, loaded, delivered and
 *  condition states" — Phase 11 build-side M33, src/ui/manifestScreen.js. The HUD keeps its
 *  compact count by §21.1's rule ("not a checklist"), so the checklist is a CARD the player
 *  opens on a key. It pauses nothing (§2.2 work continues), hides under the title, the pause
 *  card, the settlement sheet and the settings card the way the first-minute cards do, and is
 *  shell state throughout — never game.state (§22.4; m0 E8). */
export const MANIFEST_VIEW = Object.freeze({
  /** §26.6 "no unbounded growth": the most rows the card will ever BUILD, whatever a contract
   *  holds. MANIFEST.maxObjects (25) is the design bound on a contract; this is the DOM one,
   *  with headroom for a bigger manifest than §13.1 currently allows. A list longer than this
   *  is truncated and says so rather than growing without limit. */
  maxRows: 64,
  /** Condition is 0..100 (§7.2); the card prints it to this many decimals, so a lamp that
   *  lost 3.4 points reads '97%' and not '96.6%'. The band WORD beside it is the §26.5
   *  colour-independent half — the number never carries the meaning on its own. */
  conditionDecimals: 0,
  /** The list's own scrolling box, as a fraction of the window's height. Written to the card
   *  as --mf-list-max so the number lives here and not in styles.css: at --ts 1.6 the rows
   *  are 1.6× taller and the list has to scroll INSIDE the card rather than push the card's
   *  footer off the screen (m40 N6). */
  listMaxVh: 0.46,
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
  /** §6.2 "Brace state raises force cap and stability" — applied to the STRETCH BAND, because
   *  for a one-hand couch the force cap never bound: the tear at spring x maxStretch = 630 N
   *  came first, so bracing bought nothing for dragging. Braced, the band is maxStretch x
   *  this (0.77 m, 693 N at the tear). BOUNDED ABOVE by the fridge: its effective floor
   *  friction is 745 N and m6 B5/B6's "beyond one hand unaided" binary must survive bracing,
   *  so 693 < 745 (52 N margin; 1.15 would leave 20 N). Also far below the braced saturation
   *  forceCap x braceForceMult / spring = 1.5 m. tools/m6-tests.js B10 asserts both; m2 D4c
   *  compares the BASE band and is unchanged. */
  braceStretchMult: 1.10,

  /* ---- Phase 11 M10: damping in the HAND's frame, and a tow cap that knows about friction.
   *
   * The spring's damping term was c * v_object — the object's ABSOLUTE velocity. Right for a
   * box swinging about a still hand, wrong for towing: a couch following a hand at v dragged
   * a viscous brake of c * v against the WORLD on top of 552 N of floor friction, and with
   * c = 2 * sqrt(900 * 90) = 569 N.s/m against 630 N in the band it could follow no faster
   * than 0.137 m/s. M7 measured the consequence — 0.00 m in 3 s, and a traction budget that
   * could only tear the hold or topple the fridge — and named this as the fix. The term is
   * now c * (v_object - v_hand): a damper between the hand and the object. At rest the maths
   * is identical (v_hand = 0); towing, the brake is gone. grip.js step() carries the
   * derivation; the numbers it moved are in docs/CHANGELOG.md (Phase 11 M10). */

  /** Weight of the hand's velocity in the damping term. 1 = hand frame (production);
   *  0 = the Phase 2-10 world-frame term, kept only so a probe can measure before/after
   *  in one run. Anything in between is a blend and not a tuned state. */
  handFrameDamping: 1.0,
  /** Ceiling on the finite-difference hand velocity, m/s — just above run speed (5.4), so
   *  a real hand is never clamped and a mouse flick can feed forward at most c * this,
   *  which the §6.4 cap then bounds like any other demand. */
  maxHandSpeed: 6.0,
  /** A hand-target move larger than this in one step is a JUMP (a fixture teleport, a
   *  violent whip — 0.25 m in 16 ms is 15 m/s), not a velocity: the estimate is zeroed and
   *  the warm-up restarts, so a teleport never becomes a c * 15 m/s shove. A fast run moves
   *  the target 0.09 m per step; the clamp above covers everything up to here. */
  handJumpReset: 0.25,
  /** Steps after a grab (or a jump) before the hand velocity is trusted. The rig and the
   *  fresh hold are still settling on the first step or two; M1 measured a 0.46 m camera
   *  lag after a 40 m teleport. Zero velocity in the warm-up means world-frame damping —
   *  the old behaviour, which is the safe one. */
  handVelWarmupSteps: 2,

  /** The ground collider's friction, as PhysicsWorld.addGround builds it — the "floor" in
   *  the tow cap's effective-friction estimate (grip.js effectiveFloorFriction). Interior
   *  floors are 0.8 (addStaticFromColliders' default), so indoors the estimate is 3-4%
   *  pessimistic, which is the safe side of a tear. tools/m6-tests.js B11 asserts this
   *  equals what the ground collider actually reports, so the two cannot drift. */
  towFloorFriction: 0.9,
  /** The band limits how fast a towed object may be brought up to speed, not how fast it
   *  goes (grip.js towLimits carries the derivation and the measurement). Two budgets come
   *  out of the same spare stretch, margin = band - F_f / k, and each gets a fraction of it:
   *
   *  towSpeedSafety — the VELOCITY-STEP budget: a hand already at v when the object is at
   *  rest (a grab on the move, a partner letting go) costs v^2 / 2 a_obj of band, so the
   *  walk cap is sqrt(2 a_obj x margin) x this, plus the pull's haul-back. 1.0 would put
   *  the peak lag ON the tear threshold; 0.65 leaves the couch's hand at 0.42 m/s and its
   *  legs at 1.23 (0.81 of that hauled straight back), a dolly at 2.5, two movers at 2.4
   *  each (their walk binds first, at 2.1). At 0.55 the 3 s solo haul (m6 B8) measured
   *  0.29 m — one centimetre under the §26.2 number; 0.65 measured 0.34 m, the dolly 6.5 m.
   *  towAccelSafety — the RAMP budget: a ramp at a holds the object m x a / k behind its
   *  rest lag, exactly (critically damped, no overshoot), so the legs' acceleration while
   *  towing is margin x k / m x this. The couch gets 0.74 m/s^2, a dolly 5.6, a 9 kg box 53
   *  (never binds against PLAYER.acceleration 28). Under ~0.7 the 3 s haul (m6 B8) spends
   *  most of its time ramping; at 1.0 the transient force sits on the §5.2 exertion line. */
  towSpeedSafety: 0.65,
  towAccelSafety: 0.85,
  /** Walk speed while holding something the hand cannot slide at all — floor friction past
   *  the band (the fridge: 745 N vs 630) or past the cap. A CRAWL, not zero: §2.1 never
   *  immobilises a mover for what they hold. Not the old 1.10 m/s either: walking away from
   *  a fridge that will not follow hands it the full hand-frame feed-forward at once, and
   *  the pull stalls the mover at tractionN + 250 N x walk — 625 N at chest height at
   *  1.10 m/s, which tips a top-heavy 110 kg fridge (M7 measured 1.24 m on its side);
   *  ~390 N at this crawl, under the ~460 N that tipping needs at the 0.875 m grab (432 N static estimate). m6 B6/B10b pin the binary. */
  towSpeedFloor: 0.15,

  /* ---- Phase 11 build-side M27: a half-pulled trigger is a weaker grip (§4.3, §6.5) ------
   *
   * The binding tables have marked gripLeft/gripRight `analog: true` since Phase 3 and
   * input.js's header says it plainly — "analog() returns 0..1 so a half-pulled trigger is a
   * weaker grip" — but the strength method never read it: a feathered LT and a full pull were
   * the same 750 N. The per-hand cap is now multiplied by that 0..1, live, every step a hand
   * is closed, FOR A PAD SEAT ONLY. Keyboard and mouse are a full pull, and so is a latched
   * (gripMode 'toggle') grip — §4.4's parity is "the same actions", not "the same nuance", and
   * a latch that read a released trigger as zero would drop the box the moment the player let
   * go of the toggle. */

  /** The LEAST pressure a closed hand reports, 0..1. A hair-trigger must not drop what it is
   *  holding the instant the finger relaxes, so this is the weakest a hand gets while it is
   *  still closed. Deliberately equal to DEFAULT_SETTINGS.triggerThreshold's shipped 0.35:
   *  under that the input layer has already RELEASED the grip (input.js _pollPads gates the
   *  trigger at it), so a reading below the floor is a hand that is opening, not a weak hold,
   *  and 0.35 is exactly the pressure it took to close the hand in the first place. A player
   *  who raises triggerThreshold makes the hand close later, never weaker (m34 T1). */
  analog: { floor: 0.35 },

  /** §6.5's first accessibility assist: "Grip strength scaling … may reduce motor demand.
   *  They must preserve the physical puzzle rather than turn furniture into inventory icons."
   *  The shell key `gripAssist` (save.js, the 'Grip strength' settings row) multiplies
   *  forceCap for every seat, and `max` is the number that keeps §6.5's own condition true.
   *
   *  TWO BOUNDS, both asserted from these constants by tools/m34-pressure-tests.js T3:
   *    1. A PARTNER IS STILL WORTH MORE. One hand at full assist is forceCap x max = 1125 N,
   *       BELOW one mover's two-hand total forceCap x twoHandForceMult = 1237.5 N. The couch
   *       never becomes a solo lift because somebody turned a slider up.
   *    2. THE ASSIST NEVER TOUCHES THE STRETCH BAND. A hand's force is also spring x stretch,
   *       so it can never exceed spring x maxStretch = 630 N however high the cap goes — and
   *       that band, not the cap, is what stops one mover shifting the 110 kg fridge (745 N of
   *       floor friction against a 630 N band; m6 B5/B6/B10b). The fridge stays a dolly job,
   *       and a tool stays the answer to a tool-shaped problem, at every assist setting.
   *  Where it DOES help is where the cap genuinely binds: towing (the solo couch drag), a wet
   *  or low-grip surface (wetGripMult), and a tired mover (§5.2 strengthFraction).
   *  `steps` is what the settings row offers; `step` is the slider's increment. */
  assist: { default: 1.0, max: 1.5, step: 0.25, steps: [1.0, 1.25, 1.5] },

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
    /* 'sturdy' (Phase 11 build-side M23): a stock door leaf. No shipped object used the row
     * before the leaf moved onto it (definitions.js door_leaf_01), so it is tuned for the
     * one thing on it: a 1.5 m fall is sqrt(2 x 9.81 x 1.5) = 5.42 m/s -> (5.42 - 3.6) x 12
     * = 21.9 points -> 78, 'scratched' (0.08 x 180 = 14.40 billed), where the normal curve
     * read 100 -> 14 and billed the whole 180 (KNOWN_ISSUES M11). floorAfter15m is the
     * documented floor that m30 D4 asserts against, not a number any system reads. */
    sturdy:  { impactSpeed: 3.6, conditionPerMps: 12, floorAfter15m: 70 },
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
    /* Phase 11 build-side M14 — the line is written now (damage.js _closePropWindow).
     * minStepImpulse: N·s of the object's OWN lost speed (m·Δv) below which a step is
     *   solver jitter, not a hit — a 9 kg box sliding on carpet loses ~1.0 N·s a step to
     *   friction, a 110 kg fridge leaning on a wall ~0. Attribution (the narrow-phase read)
     *   only runs above it.
     * bands: by WINDOW impulse, for the notice, the audio variant and the decal size; the
     *   cost stays linear above impulseThreshold. 9 kg box at 4 m/s = 36 → scuffed; the TV
     *   at 2 m/s = 44 → dented; the couch at 1.1 m/s = 99, the fridge at 1 m/s = 110 → holed.
     * decals: §26.6 "no unbounded growth in decals" — a ring of `max` quads, pre-allocated
     *   at boot and reused oldest-first (scuffs.js); `proud` keeps them off the wall face. */
    minStepImpulse: 1.5,
    /* Phase 11 build-side M34 — the number that tells a HIT from a LEAN (damage.js
     * _attributeProperty / _strainFrames). m/s: how fast an object must have been travelling
     * INTO a surface, along that contact's own normal, on the step BEFORE the solver touched
     * it, for that surface to be the one this step's m·Δv belongs to.
     *
     * WHY THERE IS A DIRECTION TEST AT ALL. A manifold impulse is a PROXY for what stopped an
     * object, and this build has caught it lying once already. KNOWN_ISSUES Phase 26 recorded
     * the case: a 110 kg fridge thrown at 6 m/s from 0.16 m stops dead — 632 N·s of momentum
     * gone — and the door frame read 14 N·s and was not forced, while the same fridge from
     * 0.05 m at 4 m/s tore the door off at 427.9 N·s. The harder throw did less.
     *
     * RE-MEASURED FOR M34, and the recorded EXPLANATION was wrong. It is not a deep first-step
     * penetration resolved by position correction: queried between the solver and the damage
     * system, the leaf's manifold on that step reads 627.90 N·s — the honest number, bigger
     * than the object's own 598.0 N·s of m·Δv. It reads 14 N·s only when queried AFTER
     * damage.step()'s entity loop, because 5.58 m/s BREAKS a fridge, breakInto spawns its
     * fragments (M12), and adding colliders re-runs the narrow phase — so every impulse read
     * after that loop describes where the pieces are now. The door-frame pass runs after that
     * loop. The 4 m/s throw survived only because 3.78 m/s leaves the fridge 'cracked' rather
     * than broken: nothing fragments, the manifold is intact, 427.81 N·s, door off.
     * tools/m41-impulse-tests.js I2g prints both readings of one step every run: before —
     * wall 625.79, ground 6.71; after — ground 20.34, wall 9.55.
     *
     * So the manifold is now the FLOOR of the readings and never the only one, and the second
     * reading — the object's own m·Δv — is given to the surface the object was travelling INTO
     * rather than to the surface pushing back hardest. A floor cannot be approached by a
     * horizontal throw, so it can never take the credit for one.
     *
     * WHY 0.75 AND NOT LESS. It has to sit above everything that is NOT a hit and below
     * everything that is. Measured, all in m/s of approach along the contact normal: a box
     * left 20 mm inside a hung leaf reads 0.000 while the solver holds 108 N against it (m41
     * I3; M23 recorded 129-184 N on the same fixture — either way a force, and §10.4 forbids
     * billing it); a box slid into a wall at 0.30 reads 0.300; a couch SHOVED into a leaf by
     * two hands reads 0.379 on the step it arrives — a press, whose cause is the hands and
     * whose reading is unchanged (doorFrame.pressSpeedMax below). The throws read 3.78, 5.57
     * and 5.58 — these are the APPROACHES measured on the step of first contact, not the 4.0
     * and 6.0 m/s the fixtures launch at, so the headroom above this gate is 5x, not 8x.
     * Below this the ranking falls back to M14's largest manifold, unchanged to the character,
     * which is what keeps every resting, settling and sliding number in m22 exactly where it
     * was. */
    approachMps: 0.75,
    /* Phase 11 build-side M30 — the two numbers the SPLIT and the CAPPED NOTICE are tuned by
     * (damage.js _attributeProperty / _postPropLine).
     *
     * splitMinFraction: a corner hit touches a wall AND a header in one step, and M14 gave the
     *   whole m·Δv to whichever manifold pushed hardest. It is now shared out in proportion to
     *   each SURFACE's summed manifold impulse — the total is unchanged, so nothing gets
     *   dearer, and the §15.1 threshold is shared in the same proportion so the split lines sum
     *   to the cent of the one line M14 would have posted (m37 P1). Below this fraction a
     *   share is folded into the largest: a 3 % graze is a wall hit with a scratch beside it,
     *   not a second 0.4-cent line on the customer's invoice (§26.4 "one ledger entry").
     * cappedRepeatMs: §8.4 wants a notice at EVERY impact and §8.3 caps only the CHARGE, so a
     *   surface at maxChargePerSurface keeps talking (EVENTS.PROPERTY_CAPPED) — but a player
     *   grinding a couch along a capped wall must not get one notice per aggregation window.
     *   1500 is four aggregation windows (aggregationWindowMs 700 → a close every ~0.7 s at
     *   worst), so a sustained scrape reads as one repeated complaint, not a stream. */
    splitMinFraction: 0.12,
    cappedRepeatMs: 1500,
    bands: [
      { name: 'scuffed', min: 12 },
      { name: 'dented',  min: 40 },
      { name: 'holed',   min: 100 },
    ],
    decals: {
      max: 24,
      size: { scuffed: 0.12, dented: 0.20, holed: 0.30, bent: 0.16, forced: 0.24 },
      proud: 0.003,
      opacity: 0.35,
    },
    /* §3.3's brute-force branch at a hung door (Phase 11 build-side M23; §8.2 "replacement
     * risk", §8.3 "static surfaces define material, durability, impact threshold, repair
     * category, and maximum charge"). The door FRAME is the first surface with its own §8.3
     * row (surfaces.js surfaceRow): FIXED charges instead of the per-N·s rate above, because
     * what torn hinges and a jamb cost is not proportional to how hard they were pushed.
     *
     * WHY THE FRAME IS NOT READ AS m·Δv. A hung leaf is a Fixed body. MEASURED
     * (tools/m30-force-tests.js D1, the printed trace): a two-hand couch shove presses the
     * leaf for seconds while the couch's m·Δv reads 0.00 on every step after the first
     * touch — the solver zeroes the approach velocity, so the object never "loses speed"
     * while it presses (damage.js's own resting-contact rule). The frame's STRAIN is read
     * from the LEAF's side instead, per step, in N·s (damage.js _strainFrames): the leaf's
     * Σ|contactImpulse| as the floor, the hands' force × dt for a held object at rest
     * against it (pressSpeedMax below), M14's own m·Δv for a hit the leaf took hardest —
     * and only on steps whose force is at least forceN AND whose object is held or
     * hitting: a box left 20 mm into the leaf after a throw reads a persistent 129-184 N (a
     * solver phantom), the couch released against it 120 N — a lean is never a shove
     * (§10.4). The strain lives in M14's aggregation window keyed entity|door_frame_<id>;
     * DOOR.bentImpulseNs / DOOR.forceImpulseNs are the thresholds on it. */
    doorFrame: {
      /** N — the sustained shove below which the hinges take no strain. Measured: a one-hand
       *  shove decays from 360 N to under 150 N in 0.4 s and the grip tears; a two-hand shove
       *  holds 305-392 N; a resting object after a hit shows 120-184 N of solver phantom. */
      forceN: 250,
      /** §15.1's charge for hinges torn out and a jamb made good (§8.2 "replacement risk").
       *  Set against the prepared cost: DOOR.removeSeconds (45 s) of two movers' labour is
       *  45/60 x 14 x 2 = 21.00, so this is 6.7x the screwdriver — m30 D3 asserts the
       *  brief's ">= 2x" floor from these numbers, never from a literal. */
      chargeForced: 140,
      /** The frame marked but the door still on: once per hung spell (state.frameBent). */
      chargeBent: 40,
      /** m/s — below this a held object touching the leaf is PRESSED, and the strain that
       *  step is the hands' force, not the leaf's manifold. MEASURED: with both hands at
       *  356 N each (712 N, resistedForce 710) the leaf's manifold read 231-243 N in one run
       *  and 305-392 N in another — the floor's static friction takes a solver-ordered share
       *  of a blocked push that real friction never would (the couch is not sliding). The
       *  hands are the cause and the honest number; the leaf's read is kept as the floor of
       *  the two. Above this speed the object is sliding along the leaf, not shoving it. */
      pressSpeedMax: 0.05,
    },
  },
  /** §7.3 + §8.3: "aggregate repeated scrape contacts into one coherent damage event".
   *  Without this a couch dragged along a wall bills the player forty times. */
  aggregationWindowMs: 700,
  aggregationRadius: 0.8,    // m — contacts within this of each other merge
});

/** §9.1 "the screwdriver changes an object's dimensions and CREATES LOOSE PARTS … loose
 *  pieces get lost"; §26.4 "broken required cargo stays deliverable or becomes trackable
 *  pieces"; §26.6 "reset removes … fragments". Phase 11 build-side M12.
 *
 *  A detached part and a broken item's fragments are REAL BODIES — spawned through the
 *  registry, damage-tracked, grabbable, counted by the cargo box — and nothing here is a
 *  gate: an object whose legs are somewhere else is not refused, it is simply not delivered
 *  yet (§2.2 failure is a state), and the invoice names what was left (§15.1). */
export const PARTS = Object.freeze({
  /** How heavy an object's detached parts are, together, relative to what they came off.
   *  Moved here from TOOLS.screwdriver, which keeps the name as an alias for one phase.
   *  Couch: 90 kg x 0.14 = 12.6 kg of legs, 3.15 kg each; wardrobe: 5.25 kg a door. */
  partMassFraction: 0.14,
  /** m — every piece of a part must lie within this of the parent's centre before Q can
   *  put the part back; otherwise the prompt reads 'find the legs (1 of 4 missing)'. */
  reattachRange: 1.5,
  /** m — pieces are laid in a row beside the parent, this far apart centre to centre (or
   *  the piece's own width plus `pieceGap`, whichever is more). P1 pins that a piece lands
   *  within pieceSpacing x 4 of the parent. */
  pieceSpacing: 0.35,
  pieceGap: 0.05,
  /** A piece no taller than this fraction of its parent's short side lies FLAT and stacks. */
  flatAspect: 0.5,
  /** m — the floor probe under a candidate slot starts this far above the parent's top and
   *  casts this far down (a parent on the truck deck or a table still finds its floor). */
  floorProbeLift: 0.5,
  floorProbeLength: 2.0,
  /** Fragments for an item whose fragility band has no entry (validateDef guarantees one). */
  defaultFragmentCount: 2,
  /** m — flat pieces (a door, a shelf board) are STACKED on one footprint, this much air
   *  between each and the next, rather than laid out in a three-metre row. */
  stackGap: 0.004,
  /** m — clear air between the parent's world AABB and the nearest piece. Spawning INSIDE
   *  the parent fires a contact impulse the damage system would bill as a fake impact. */
  pieceClearance: 0.12,
  /** m — pieces spawn this far above their resting height and drop: 0.44 m/s, under the
   *  0.7 m/s the most fragile band tolerates (DAMAGE.fragility.extreme), so a disassembly
   *  never bills damage on its own pieces (m20 P1b). */
  spawnLift: 0.01,
  /** Fragments a broken item (§8.3's 'broken' band) leaves beside its hulk, by fragility. */
  brokenFragmentCount: { sturdy: 2, normal: 2, fragile: 3, extreme: 3 },
  /** Fragment shape: each axis of the parent's dimensions x this, no smaller than min. */
  fragmentScale: 0.30,
  fragmentMinDim: 0.06,
  /** §15.1 "parts left at pickup": what one piece left behind costs, as a fraction of its
   *  replacementValue share (parent value x partMassFraction / count — a couch leg is
   *  31.50 of the couch's 900). Fragments are not priced: the 'broken' band already
   *  charged the whole replacement value, and pricing the pieces again would bill one
   *  mistake twice. */
  leftBehindCostFraction: 1.0,
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
    /** ALIAS, one phase only (M12): the number lives in PARTS.partMassFraction now, where
     *  its consumer is. Nothing in src/ reads this key; it stays so a suite or a doc that
     *  cites TOOLS.screwdriver.partMassFraction still sees the same value. */
    partMassFraction: PARTS.partMassFraction,
  },
});

/** §8.2 "Door: open or remove from hinges — preparation time and replacement risk".
 *  Phase 11 build-side M11: every door leaf in the house is one of these, hung swung open
 *  against its hinge jamb, so the OPENING you can use is the gap less the leaf's thickness
 *  (house.js hungClear). The 34" door is a 0.86 m opening that a hung 40 mm leaf leaves 0.82
 *  clear — the "impossible" 32-inch number KNOWN_ISSUES carried for nine phases was this
 *  door with its leaf on. The screwdriver takes the leaf off (DOOR.removeSeconds billed to the
 *  labour clock through the same hook as a disassembly) and gives the full gap back.
 *  Validated: Phase 11 M11 (tools/m19-tests.js). */
export const DOOR = Object.freeze({
  /** One leaf shape for every door in the house: 40 mm thick, 2.00 m tall (30 mm under the
   *  2.03 m header), 0.80 m long, 18 kg — one hand lifts it (177 N against the ~358 N a
   *  single hand develops, definitions.js couch note). */
  leaf: { t: 0.04, height: 2.00, length: 0.80, mass: 18 },
  /** §8.2 "preparation time", seconds, scaled by TOOLS.screwdriver.timeScale like every
   *  other screwdriver job (three hinge pins: less than the couch's four legs at 60). */
  removeSeconds: 45,
  /** m, horizontal — a removed leaf within this of its jamb can be hung back (Q). Covers the
   *  spot it is laid down on at removal (≤ 1.04 m from the jamb for every door), so undo is
   *  one key from where you stand; carry it further and you must bring it back. */
  rehangRange: 1.25,
  /** m — a removed leaf is laid flat this far clear of the wall face and of the jamb, so its
   *  edge never starts inside the plaster (a penetration the solver would have to eject). */
  restPad: 0.02,
  /** §8.2 "replacement risk": what the customer bills for a door leaf broken in transit
   *  (definitions.js door_leaf_01.replacementValue), between a bookshelf and a nightstand. */
  replacementValue: 180,

  /* ── §3.3's brute-force branch (Phase 11 build-side M23) — see DAMAGE.property.doorFrame ──
   * Thresholds on the frame's STRAIN: Σ of the leaf's contact impulse (N·s) over M14's
   * aggregation window, from steps at or above DAMAGE.property.doorFrame.forceN by a held or
   * hitting object. CALIBRATED, not guessed (tools/m30-force-tests.js prints the trace):
   *   couch, legs on, both hands of seat 0, unbraced, from 0.15 m: first touch at 0.55 s
   *   (42.3 N·s, 2539 N), then the hands hold 356 N each = 712 N on the pressed couch ->
   *   11.9 N·s a step -> forceImpulseNs (400.4 N·s) at 1.00 s, 0.45 s of pressing in all;
   *   forceWithinMs is the §3.3 budget D1 is asserted against, 4x that (D1 also asserts
   *   under half of it). The leaf's own manifold meanwhile read 170-243 N (Σ 188 N·s): the
   *   floor's static friction takes a solver-ordered share of a blocked push — see
   *   DAMAGE.property.doorFrame.pressSpeedMax for why the hands are the number;
   *   one hand: the grip tears after ~0.4 s of pressing, ~50-200 N·s — not forced, bent;
   *   a 9 kg box thrown at 2 m/s from 0.16 m: 10.8 N·s in one step (646 N) — bent only;
   *   at 6 m/s 54 N·s — still bent only. A 110 kg fridge at 4 m/s from 0.05 m stops dead
   *   in one step: 427.9 N·s, forced, held by nobody. */
  /** N·s of strain at which the hinges tear (the leaf comes off through registry.unhang). */
  forceImpulseNs: 400,
  /** N·s of strain at which the frame is marked and chargeBent posts, once per hung spell. */
  bentImpulseNs: 8,
  /** ms — §3.3 "possible enough to tempt": the sim time within which the calibrated shove
   *  must force the door (asserted, m30 D1). */
  forceWithinMs: 4000,
  /** m — the hung pose's box is shrunk by this before the rehang occupancy sweep (interact.js
   *  _doorwayBlocked), so the floor, the jamb it sits flush against and the header do not
   *  count as blocking it. Also shrinks a REST strip's box before the same sweep (M32), which
   *  is why a 40 mm leaf lying at y 0.02 does not read the ground plane's y ≤ 0 top face. */
  occupancyMargin: 0.01,

  /* ── WHERE A REMOVED LEAF GOES (Phase 11 build-side M32; §8.2, §7.3, §26.6) ────────────
   * KNOWN_ISSUES carried M11's "the rest spot is not checked at removal" for six phases: E
   * laid the leaf on ONE authored strip whether or not a mover or a box was standing there,
   * and the solver then separated them over a few steps — and M23's forcing inherited it
   * (a couch shoved from the west found the leaf laid under its leading corner).
   *
   * The answer is an ORDERED LIST per door, swept with M23's own occupancy primitive
   * (interact.js boxBlocked) and taken in config order, so the choice is deterministic
   * (m14's soak equality) and the FIRST entry is exactly M11's authored pose — house.js
   * leafRestPose is now "candidate 0", which is why m5 DL and m19 D4c read the same numbers
   * as before for the three interior leaves.
   *
   * Each entry is a DESCRIPTOR, never a coordinate: house.js leafRestPoseOn derives the pose
   * from the door record, so moving a door moves its strips with it.
   *   side  'hinge' | 'latch'   which jamb the strip runs from, along the wall's own axis
   *   lay   'wall'  | 'room'    the leaf's 2.00 m height along the wall, or out into the room
   *   out   'swing' | 'back'    the side of the wall it is laid on ('swing' is the side the
   *                             door opens into — M11's only option)
   *   shift m                   further along the wall, past DOOR.restPad, to dodge a fixture
   *
   * EVERY CANDIDATE OF EVERY DOOR sits outside every doorway's clear box (m13 B1's predicate)
   * and inside RECOVERY.bounds — house.js restCandidateProblems asserts both (m39 E0).
   *
   * interior32's list is the second recorded fact M32 closes: its leaf swings OUT and M11
   * laid it on the lawn at x −2.77..−1.97, 170 mm past the porch's west edge. Every candidate
   * here is inside WORLD.porchBounds, so a removed front leaf never lies on the grass where
   * the recovery sweep and the truck's route meet (m39 E3). */
  /** m13 B1's clear box, the predicate restCandidateProblems checks a candidate strip against:
   *  the doorway gap less the jamb markers (0.02 m a side), and this much either side of the wall.
   *  Named here so the validator and m13 cannot drift apart silently. */
  clearBox: Object.freeze({ jambInsetM: 0.02, crossM: 0.20 }),
  restCandidates: {
    living_kitchen: [
      // M11's: the kitchen's 2.11 m wall strip west of the door, x 0.15..2.15.
      { id: 'hinge_wall', side: 'hinge', lay: 'wall', out: 'swing', shift: 0 },
      // The latch side, 0.60 m along to clear the dining chairs at x 3.20: x 3.65..4.45.
      { id: 'latch_room', side: 'latch', lay: 'room', out: 'swing', shift: 0.60 },
      // The same strip on the LIVING-ROOM face of the same wall: x 0.15..2.15, z −4.92..−4.12.
      { id: 'hinge_wall_living', side: 'hinge', lay: 'wall', out: 'back', shift: 0 },
    ],
    kitchen_bedroom: [
      // M11's: out into the bedroom past the north jamb, x −2.08..−0.08, z −6.93..−6.13.
      { id: 'hinge_room', side: 'hinge', lay: 'room', out: 'swing', shift: 0 },
      // The latch side of the same wall (the nightstand stands on it at boot — which is the
      // case this whole list exists for: the sweep passes over it and takes the next).
      { id: 'latch_room', side: 'latch', lay: 'room', out: 'swing', shift: 0 },
      // Further along, on the KITCHEN face: 1.00 m clears wall_living_back, x 0.08..2.08.
      { id: 'hinge_room_kitchen', side: 'hinge', lay: 'room', out: 'back', shift: 1.00 },
    ],
    door34: [
      // M11's: into the living room past the west jamb, x −1.25..−0.45.
      { id: 'hinge_room', side: 'hinge', lay: 'room', out: 'swing', shift: 0 },
      // …and the porch either side of the opening, where a front door is actually laid down.
      { id: 'latch_wall_porch', side: 'latch', lay: 'wall', out: 'back', shift: 0 },
      { id: 'hinge_wall_porch', side: 'hinge', lay: 'wall', out: 'back', shift: 0 },
    ],
    interior32: [
      /* ALL THREE ON THE PORCH (M32). M11 laid this one at x −2.77..−1.97, 170 mm past the
       * porch's west edge and on the grass. 0.17 m of shift is the least that would fit it
       * inside WORLD.porchBounds; 0.50 is the number because it also keeps the leaf within
       * DOOR.rehangRange of its jamb — 1.18 m against 1.25 — so Q from where you are standing
       * is still the undo, as it is at every other door. x −2.27..−1.47, z −1.89..0.11. */
      { id: 'porch_room', side: 'hinge', lay: 'room', out: 'swing', shift: 0.50 },
      { id: 'porch_room_far', side: 'hinge', lay: 'room', out: 'swing', shift: 1.20 },
      { id: 'porch_wall', side: 'hinge', lay: 'wall', out: 'swing', shift: 0.30 },
    ],
  },
  /** m — with every authored strip occupied, how much further along the wall the chooser may
   *  look before giving up and using candidate 0 anyway. 2.00 m is one leaf-length past the
   *  longest strip: far enough to get out from under a couch, near enough that "laid it down
   *  further along" is still beside the door you took it off. */
  restSearchM: 2.00,
  /** m — the rung of that ladder. Half a leaf's width: the smallest step that can clear a
   *  0.50 m box in one rung, and 10 rungs × 3 candidates = 30 shape casts in the worst case,
   *  all of them on ONE key press. */
  restSearchStepM: 0.20,
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
   * column asks for "ratchet clicks", "creak, vibration").
   *
   * SINCE M25 THIS IS THE COEFFICIENT THE SOLVE STARTS FROM, NOT THE ONE APPLIED. straps.js
   * delivers the damping as an impulse solved over the step, c_eff = c/(1 + c·dt/m_eff), so
   * 1400 is an upper bound the applied coefficient approaches as the effective mass grows:
   * MEASURED (m32 S4) 776 N·s/m on the 110 kg fridge and 137 N·s/m on a 9 kg box. The impulse
   * over a step is what the load feels, and it is unchanged where it was already stable — the
   * fridge's strapped brake shift moved by 0.49 mm (m32 S3). Retuning this number changes the
   * light end far less than it looks; the ratio γ = β/(1+β) is what to reason about. */
  damping: 1400,

  /* THE BOUND THAT MAKES THAT DAMPING SAFE ON A LIGHT BODY (M25). DERIVED, NOT PICKED.
   *
   * Explicit Euler on a damper is stable only while γ = c·dt/m < 2; above 2 the correction
   * overshoots and reverses the velocity, and a one-sided rope never pays the overshoot back.
   * The mass in that ratio is the EFFECTIVE mass at the hook (1/m_eff = 1/m + (r×dir)ᵀ I⁻¹
   * (r×dir), always ≤ m), so at 1400 N·s/m and 1/60 s the fault line is not the 11.7 kg the
   * body mass suggests. MEASURED, m32 S4's table, one strap under a 400 N pre-load:
   *
   *     mass    m_eff     γ if explicit      mass    m_eff     γ if explicit
   *      9 kg   2.54 kg       9.19            55 kg  10.61 kg      2.20
   *     22 kg   9.49 kg       2.46           110 kg  29.01 kg      0.80
   *
   * A 9 kg box hooked 0.33 m off centre is 2.54 kg effective and γ 9.19 — and M17 saw exactly
   * that box thrown 1.45 m backward and 0.81 m down in a brake. Only the fridge was ever under
   * the bound, which is why §26.3's promise held for the heavy case and lied about the light
   * one: three of four masses were past it, not one. (m_eff moves with the hook, so a pose can
   * read higher or lower than its row — S4's table is the figure to quote for a mass.)
   *
   * straps.js now solves the closing velocity after the damping impulse instead of sampling
   * it — c_eff = c / (1 + c·dt/m_eff) — whose amplification factor 1/(1 + β) ≤ 1 for every
   * mass, damping and step. The ratio the solved form actually uses is γ = β/(1+β), which is
   * strictly below 1, so this fraction is the PROOF the code re-checks with a Math.min that
   * has never bound (m32 S4 asserts it for 9, 22, 55 and 110 kg), not a knob to turn.
   * Raising it above 1.0 would re-admit the explicit form's overshoot; 0.5 states the rule
   * as "a strap may spend at most half of explicit Euler's budget of 2". */
  stabilityFraction: 0.5,

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
  /** NOTHING A STRAP HOLDS MAY MOVE THIS FAST (M25, §12.2 "consequences must be
   *  understandable" — a strapped box that LAUNCHES is not).
   *
   *  DERIVED from the two speeds that bracket it. Below: TRUCK.brakeForce 5.2 m/s² for the
   *  half second a strap has to react is 2.6 m/s, so anything a strap holds should stay under
   *  that; box_small_01's §8.3 damage tolerance is 2.00 m/s, so a strapped box moving faster
   *  than 3 m/s is already breaking itself. Above: the road event's own worst is
   *  5.2 × 1.1 s = 5.7 m/s (an UNRESTRAINED item on the brake), which a restrained one must
   *  never approach. 3.0 sits above every legitimate strapped motion measured — the worst any
   *  strapped item reaches over a whole route is 0.518 m/s (m32 S1) and 0.217 m/s in a full
   *  pack (m25 K10) — and far below the M17 launch, which touched 4.27 m/s.
   *
   *  IT IS A LINEAR SPEED, m/s. A body's spin is rad/s, a different quantity, and no assertion
   *  compares one with the other; the suites read the linear peak and print the spin beside it.
   *  It is a TEST BOUND, asserted, never a clamp: §10.4 forbids the cargo system from moving
   *  anything without a physical cause, and that includes braking it. */
  launchSpeedM: 3.0,
  /** §10.2 pack quality as ONE number (M17, §26.3): quality = 1 − (unsecuredWeight × the
   *  fraction of the load's mass that is unrestrained + heightWeight × how high the
   *  UNRESTRAINED mass sits, as a mass-weighted fraction of the box height + runUpWeight ×
   *  how much open deck lies ahead of it toward the headboard, as a mass-weighted fraction
   *  of the box length), clamped to 0..1. Restrained mass contributes nothing to the last
   *  two: a strapped fridge at the tail is not the same risk as a loose one. Still §10.4's
   *  ADVISORY heuristic — nothing acts on it but a warning and a score.
   *
   *  TUNED against tools/m25-packs-tests.js so that the number predicts the drive: the three
   *  packs measure LOW 0.029 m / TALL 0.577 m / SLIDE 1.527 m of worst shift over the route
   *  (re-measured in Phase 27: M25 strapped LOW's light items taut, M26 retuned the bump)
   *  and score 1.000 / 0.298 / 0.199 here — the same order. The run-up term outweighs the
   *  height term because that is what the physics did: an upright fridge with 1.8 m of open
   *  deck ahead of it (SLIDE) fell forward and holed the headboard, the same fridge against
   *  the headboard (TALL) slid 0.577 m and leaned at 31° on the turn. */
  quality: { unsecuredWeight: 0.5, heightWeight: 0.3, runUpWeight: 0.5 },
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
  /** §11.3 the three prototype-required road events. Severity is the impulse multiplier;
   *  `accel` is the event's COMPOSITION — the pseudo-acceleration the cargo feels in the
   *  truck's frame, in multiples of brakeForce, truck-local (+z forward = toward the
   *  headboard, +x = the side the turn throws to, +y up). truck.js roadEventForce reads it:
   *  force = mass × brakeForce × severity × accel. Until M17 the turn's 0.8 and the bump's
   *  0.55 were literals in truck.js.
   *
   *  M17 (§26.3 "three different pack arrangements yield observably different turn, brake,
   *  and bump results"): the turn's lateral fraction goes 0.8 → 1.0. MEASURED at 0.8
   *  (0.42 g) the turn moved NOTHING upright — the deck friction combined with a fridge's
   *  own (Rapier averages: (0.32 + 0.48)/2 = 0.40) is 0.40 g, a box's 0.52 g, a dresser's
   *  0.50 g — so an unstrapped upright fridge against the headboard rocked 1.0° and slid
   *  0.000 m, and the brake was the only event that distinguished one pack from another.
   *  At 1.0 (0.53 g, the same magnitude the brake already had) the turn slides the fridge
   *  and the television sideways and tips a top-heavy fridge for a visible reason. Severity
   *  is unchanged (the shake and the audio scale on it); the timing is unchanged (m21). */
  /*  M26 (§26.3's THIRD result, "observably different turn, brake AND bump"): the bump goes
   *  { y 0.55, z 0 } → { y 2.20, z 0.50 }. It is still MOSTLY VERTICAL — the lift is 4.4× the
   *  nudge — and it is now the only event that works by taking friction away rather than by
   *  pushing hard.
   *
   *  WHY THE OLD NUMBERS DID NOTHING. 0.55 × 0.8 × 5.2 = 2.29 m/s² of lift against 9.81 of
   *  gravity leaves 77% of the load on the deck, and a purely vertical force slides nothing:
   *  shiftByEvent.speedBump read 0.000 for every pack, so the bump told the three packs apart
   *  only as a null. KNOWN_ISSUES called that "one number away". It is not, because the
   *  response is a STEP and not a ramp: a 9 kg box (μ 0.72 on the 0.32 deck, Rapier averages
   *  to 0.52) resting under 7.52 m/s² of normal load needs 3.91 m/s² of longitudinal push
   *  before it moves AT ALL, i.e. a z of 3.91 / (0.8 × 5.2) = 0.94 — harder than the brake.
   *  MEASURED that way on m25's SLIDE pack (worst shift inside the bump window, y left at
   *  0.55): z 0.30 → 0.000 m, 0.50 → 0.000, 0.70 → 0.000, 0.90 → 0.008, 0.95 → 0.011,
   *  1.00 → 0.038, 1.05 → 0.066, 1.10 → 0.097, 1.35 → 0.280. Reaching CARGO.shiftToleranceM
   *  by z alone costs 1.35 — a second brake, and a bump whose forward push is twice its lift.
   *
   *  WHAT A BUMP ACTUALLY DOES is unload the deck, and THAT is the number that was wrong.
   *  2.20 × 0.8 × 5.2 = 9.15 m/s² up leaves 0.66 m/s² net down: for the half-second of the
   *  event the load presses at 6.7% of its weight and its friction falls with it (0.34 m/s²
   *  for that box), so half the brake's longitudinal fraction is now more than enough. Below
   *  9.81 / (0.8 × 5.2) = 2.358 nothing leaves the deck — 2.20 keeps a 6% margin, and every
   *  measured window has Δy = 0.00, so this is a load gone light, not a load thrown.
   *  MEASURED at y 2.20, z 0.50 over m25's four drives, worst shift inside the bump window:
   *  LOW 0.006 m · TALL 0.243 m · SLIDE 0.282 m · SLIDE+2 straps 0.282 m. The strapped pack
   *  is 47× stiller than the loose ones — that is LOW's PACKING, not its straps: the controlled
   *  pair SLIDE and SLIDE+2 straps both read 0.282 m, so straps do nothing for a bump (they
   *  resist the brake's forward pull, not a load going light). The loose ones pass
   *  CARGO.shiftToleranceM (0.25),
   *  TALL's fridge gains 0.0° of tilt on the bump (it is already at 26.6° from the turn), and
   *  the whole-route worsts are the ones the packs already had: LOW 0.029, TALL 0.577,
   *  SLIDE 1.527. At y 2.00 the same z gives SLIDE 0.199 m, short of the tolerance — 2.20 is
   *  the smallest 0.10 step that clears it.
   *
   *  NOT A SECOND BRAKE, by every reading. Peak longitudinal 0.50 × 0.8 = 0.40 of the brake's
   *  (exactly half its accel.z, and less after severity). Longitudinal IMPULSE 0.8 × 0.50 ×
   *  0.5 s = 0.20 against the brake's 1.0 × 1.0 × 1.1 s = 1.10 — 18%. And the outcomes are
   *  two different events: SLIDE's brake throws the fridge 1.5 m into the headboard and holes
   *  it (400.00); SLIDE's bump walks a box 282 mm and bills nothing.
   *
   *  THE SEAT IS NOT THE CARGO. `accel` is what the LOAD feels in the truck's frame;
   *  `seatAccel` — optional, and only the bump needs one — is the direction the DRIVER's
   *  camera is nudged in (main.js's ROAD_FORCE shake normalises it, so only the direction is
   *  read; the magnitude stays RENDER.camera.shake.road × severity). The forward fraction
   *  above is the deck walking out from under the load, not a lurch the driver feels: a cab
   *  going over a bump goes UP, which is what m24 K2g has pinned since M16. Events without a
   *  `seatAccel` keep taking the cargo's direction, as every event did before M26. */
  roadEvents: {
    hardBrake:  { severity: 1.0, accel: { x: 0, y: 0, z: 1.0 } },
    sharpTurn:  { severity: 1.0, accel: { x: 1.0, y: 0, z: 0 } },
    speedBump:  { severity: 0.8, accel: { x: 0, y: 2.20, z: 0.50 },     // mostly vertical (M26)
                  seatAccel: { x: 0, y: 1, z: 0 } },                    // …and the cab only rises
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

  /** §13.3's "short contained street". The prototype route is one leg of it. The invoice
   *  bills 2 × tripCount − 1 legs of it (M13): every return trip is out-and-back again. */
  routeDistanceKm: 4.2,

  /** §12.2's "partial completion, extra cost" priced (M13): per REQUIRED manifest row not
   *  delivered when the crew settles up — the customer's item is still in the old house
   *  (or on the truck, or on the kerb: not delivered is not delivered). A PRODUCT number,
   *  so the arithmetic it was chosen against is here to be argued with:
   *
   *    going back for more costs, before a single item is carried,
   *      fuel    2 legs × 4.2 km × 3.2/km            = 26.88
   *      labour  2 × 28 s = 0.93 min × 14 × 2 movers = 26.13
   *                                                   ≈ 53.01
   *    plus whatever the loading itself takes (a minute for a box is 28 of labour).
   *
   *  At 60 the fee for ONE forgotten box is close to the bare return legs and cheaper than
   *  the legs plus the loading — a defensible call either way, which is what makes it a
   *  decision (§12.1 "one trip" is an OPTIONAL goal, not a rule); THREE items left (180)
   *  are dearer than any return, so a careless pack is worth going back for. Twenty-three
   *  (1380) exceeds the base 900 — §15.2's "negative profit still completes the job", by
   *  design. Charged on top of PARTS_LEFT: that line is the customer's property (a leg's
   *  replacement value), this one is the contract's completion (§15.1 base "rewards
   *  completion and scope"). */
  leftBehindFee: 60,
});

/** §21.2 contract UX — Phase 11 build-side M24 (src/ui/invoiceScreen.js, src/ui/titleScreen.js).
 *  "Invoice animates major lines, then exposes a complete static breakdown. Event recap uses
 *  actual logged events." The reveal is PRESENTATION over invoice.js's lines: a major line is
 *  a GROUP of the sheet's own line kinds summed — never a second calculation — and the count-up
 *  is wall time (an injectable clock; the harness's performance.now() is frozen, KNOWN_ISSUES
 *  Phase 18), so no number here changes what the ledger says. */
export const INVOICE = Object.freeze({
  reveal: Object.freeze({
    /** Wall ms between one major line landing and the next (m31 V1: after k × stepMs exactly
     *  k lines are visible). */
    stepMs: 700,
    /** Each line's count-up from 0 to its final amount, wall ms. ≤ stepMs, so lines land one
     *  at a time; the eased value is monotone, so nothing shown is ever past the final. */
    countMs: 560,
    /** Redraw cadence while revealing (≈ 30 Hz; every tick re-reads the clock). */
    tickMs: 33,
    /** The major lines, in landing order. `kinds` are invoice.js LINE_KINDS strings (copied, so
     *  config imports nothing — m31 V0 asserts every LINE_KINDS value sits in exactly one
     *  group, which is what makes the groups sum to the profit). A group with no line this
     *  run does not land; PROFIT (the invoice's own total) always lands last. */
    majors: Object.freeze([
      Object.freeze({ id: 'revenue',   label: 'revenue',          kinds: Object.freeze(['base contract', 'efficiency bonus', 'one-trip bonus', 'room accuracy', 'tips']) }),
      Object.freeze({ id: 'labour',    label: 'labour',           kinds: Object.freeze(['labor time', 'overtime']) }),
      Object.freeze({ id: 'furniture', label: 'furniture damage', kinds: Object.freeze(['furniture damage']) }),
      Object.freeze({ id: 'property',  label: 'property damage',  kinds: Object.freeze(['property damage']) }),
      Object.freeze({ id: 'road',      label: 'fuel / road',      kinds: Object.freeze(['vehicle/fuel', 'violations']) }),
      Object.freeze({ id: 'left',      label: 'left behind',      kinds: Object.freeze(['items left behind', 'parts left behind']) }),
      Object.freeze({ id: 'fees',      label: 'recovery fees',    kinds: Object.freeze(['recovery/service fees']) }),
    ]),
  }),
  /** The settlement's 'What happened' list, built from the run recorder's events (runLog.js,
   *  M6) — never from a second log. At most this many entries, the earliest kept … */
  recapMax: 12,
  /** … and at most this many per kind (door, part, drop, damage, property, road, recovery),
   *  so a run with forty impacts still lists its one door and its one recovery. */
  recapPerKind: 3,
  /** §15.3/§21.1 (M26): the property line aggregates every impact into one row, so its "who"
   *  clause names at most this many distinct holder-and-object pairs and then says "and N
   *  more". Same reason as recapPerKind — the sheet stays compact; the per-impact breakdown
   *  is the recap's job. invoice.js propertyHolders reads it (m33 C4h). */
  holderMax: 2,
});

/** §8.4 "one small cost notice" — the HUD's transient bottom-right stack (src/ui/hud.js).
 *  Phase 11 build-side M26 moved the two numbers out of hud.js, where the TTL was a literal,
 *  and moved the clock they are measured against from `performance.now()` to the SIM clock —
 *  the same clock M9's captions already run on. Consequences, both deliberate: a notice
 *  freezes under the pause card with the rest of the simulation, and a headless suite (where
 *  the wall clock is frozen and only game.frame() advances time) sees notices expire on
 *  schedule instead of accumulating to `maxStack` for the whole run. */
export const NOTICE = Object.freeze({
  /** Sim milliseconds a notice stays up. 3200 is the number hud.js carried from Phase 11. */
  ttlMs: 3200,
  /** §21.1: the working area stays clear, so the stack is short by rule, not by luck. */
  maxStack: 4,
});

/** The physical world's extent (Phase 11 build-side M15). ONE number: the side of the
 *  square ground collider PhysicsWorld.addGround builds (main.js passes it; world.js's
 *  default is the same 200 m — the scene's 400 m grass plane is dressing with no collider).
 *  RECOVERY.bounds is derived from it below, so "off the plot" means what the physics
 *  means by it: past the ground's edge there is nothing to stand on and the fall reaches
 *  objectFloorY within a second either way. */
export const WORLD = Object.freeze({
  groundSizeM: 200,
  /** THE PAVED APRON IN FRONT OF THE HOUSE (Phase 11 build-side M32; §21.1, §18.3, §11.1).
   *
   *  A footprint, not a zone: the rectangle a removed FRONT leaf must lie inside so it never
   *  ends up on the lawn where §18.3's recovery sweep and the truck's route meet. It is the
   *  porch ZONE (house.js ZONES 'porch', x −2.60..5.00, z −2.00..4.20) with its driveway end
   *  cut back to z 2.90 — 1.30 m short of the driveway zone at z 4.20, 5.40 m short of the
   *  truck's rear lip at z 8.30, and 50 mm short of the porch step at z 2.95. Kept HERE rather
   *  than derived from the zone because the zone is a delivery volume that may grow; this is a
   *  placement rule that must not. m39 E3 asserts it is inside the zone and clear of both. */
  porchBounds: Object.freeze({ minX: -2.60, maxX: 5.00, minZ: -2.00, maxZ: 2.90 }),
});

/** §18.3 recovery. Validated: Phase 5. */
const OBJECT_FLOOR_Y = -8;          // below this an object is gone and gets recovered
const OUT_OF_BOUNDS_GRACE_S = 4;
export const RECOVERY = Object.freeze({
  outOfBoundsGraceSeconds: OUT_OF_BOUNDS_GRACE_S,
  noProgressGraceSeconds: 12,
  stableTransformIntervalMs: 900,   // how often a last-known-good transform is banked
  /** §18.3: an OBJECT that leaves the world is recovered too, not only a player. Phase 5's
   *  gate is "all objects recoverable and movable", so this is the half that makes the
   *  first word true. Lifted slightly above the banked transform so it drops onto the
   *  surface rather than starting interpenetrated with it. */
  objectRecoveryLiftM: 0.12,
  objectFloorY: OBJECT_FLOOR_Y,
  /** M15: tools are recovered by the same pass (tools.js ToolSystem.step) at the same floor.
   *  A separate key so a 50 mm screwdriver could one day be given a shallower floor than a
   *  wardrobe without touching registry.step; today they agree. */
  toolFloorY: OBJECT_FLOOR_Y,
  /** M15 (§26.6 "no soft lock"): the play AABB. DERIVED from WORLD.groundSizeM, never typed —
   *  a body outside it is off the ground the physics built, whatever its height, and the
   *  registry and tool passes both recover it after the grace. The ceiling is the same
   *  half-size: SIM.maxLinearVelocity (40 m/s) straight up reaches ~82 m, so nothing a
   *  grip can fling legitimately gets there. m23 L8 asserts every spawn, the truck's box,
   *  both houses' zones and the tool rack sit ≥ 5 m inside it. */
  bounds: Object.freeze({
    minX: -WORLD.groundSizeM / 2, maxX: WORLD.groundSizeM / 2,
    minZ: -WORLD.groundSizeM / 2, maxZ: WORLD.groundSizeM / 2,
    minY: OBJECT_FLOOR_Y, maxY: WORLD.groundSizeM / 2,
  }),
  /** M15: how many game.frame(SIM.stepMs) calls a suite must drive before a body that left
   *  the world is guaranteed back — the grace in steps, plus a margin for the clock's
   *  accumulator rounding (one frame of 16.667 ms is one step, but never exactly). */
  maxFrames: Math.ceil(OUT_OF_BOUNDS_GRACE_S * 1000 / SIM.stepMs) + 10,
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

/** §20.4 / §21.4 Hearing / §26.5 "subtitles exist" — the synthesised audio layer and its
 *  captions (Phase 11 build-side M9, src/audio/audio.js). Every number the layer reads is
 *  here; audio.js carries the cue RECIPES (a data table keyed by EVENTS name) and nothing
 *  else numeric. The layer reads state and never writes it (§22.4; m18 A12). */
export const AUDIO = Object.freeze({
  /** Bus levels 0..1 at first boot; the settings card's three sliders (shell keys
   *  audioMaster / audioUi / audioWorld) move them, and `foley` — the mover's own body: grabs,
   *  ratchets, strain — sits UNDER the world bus so one slider covers everything in the world. */
  master: 1,
  buses: { ui: 0.85, world: 1, foley: 1 },
  /** Metres. atten(d, range) is squared, so a dolly 2 m from one pair of ears and 20 m from
   *  the other mixes ≥ 4× louder than the same dolly 20 m from both (m18 A6). */
  ranges: { roll: 24, cue: 30 },
  /** IMPACT loudness ∝ relVelocity above minVelocity (below it: silent — the settle-down of
   *  a box put on the floor is not a thud). fullVelocity is where the curve reaches
   *  floorGain + 1; maxGain caps a 14 m/s catastrophe. DAMAGE.fragile.impactSpeed is 1.1. */
  impact: { minVelocity: 0.5, fullVelocity: 5.0, floorGain: 0.15, maxGain: 1.4 },
  /** An attached dolly rolling faster than minSpeed is audible; fullSpeed is full gain. */
  roll: { minSpeed: 0.3, fullSpeed: 1.6 },
  /** §5.2 "strain audio": gain saturates as mass/(mass + massRef); pitch = 1 + pitchRise ×
   *  imbalance; imbalanceGain lifts the gain a little as balance goes; exertion (§5.2, on
   *  state) is a floor under it. */
  strain: { massRef: 45, pitchRise: 0.8, imbalanceGain: 0.5, exertionGain: 0.6 },
  /** In transit, cargo rattles ∝ (1 − packQuality) once quality (1 − unsecured fraction)
   *  falls below qualityBelow. A secure pack is silent in the back. */
  rattle: { qualityBelow: 0.9 },
  /** The truck: idle gain in TRANSIT, accelerating over the first rampFrac of the route and
   *  slowing over the last; pitch = pitchBase + pitchSpan × speed fraction. */
  engine: { idle: 0.35, rampFrac: 0.12, pitchBase: 0.6, pitchSpan: 1.9 },
  /** ROAD_FORCE whoomp: floorGain + severity × (1 − floorGain). */
  road: { floorGain: 0.4 },
  /** Simultaneous one-shot partials; a cue that would exceed it is dropped, never queued.
   *  Also the bound on the bus→render-frame cue queue (m18 A9). */
  maxVoices: 24,
  /** Captions (§21.4 Hearing, §26.5): how long the last cue's caption stays on the HUD, in
   *  sim milliseconds; a cue with a position gets a direction glyph unless it is within
   *  captionNearM of the listener (then it is at your feet); "ahead"/"behind" is ±aheadDeg. */
  captionMs: 2600,
  captionNearM: 0.75,
  captionAheadDeg: 40,
  /** The plumbing's constants: per-layer output levels, oscillator base pitches, envelope
   *  and ramp times, the master compressor. Nothing in audio.js is a bare literal. */
  synth: {
    levels: { engine: 0.10, roll: 0.12, strain: 0.09, rattle: 0.11, wind: 0.05 },
    hz: { engine: 42, roll: 220, strain: 96, rattle: 1800, wind: 380 },
    /** Loop filters: lowpass cutoff as a multiple of the loop's hz, bandpass Q (review minor, M9). */
    filters: { engineLpMul: 10, rollQ: 1.4, strainLpMul: 3, rattleQ: 0.9 },
    attackS: 0.004, rampS: 0.06, pitchRampS: 0.08, strainRampS: 0.18,
    tailS: 0.05,
    noiseSeconds: 2,
    compressor: { threshold: -14, ratio: 6, attack: 0.004, release: 0.2 },
  },
});

/** §8.4 "At impact: material sound, visual mark, optional haptic pulse, and one small cost
 *  notice" — the FOURTH channel (Phase 11 build-side M28, src/audio/haptics.js). One row per
 *  CUE TYPE, on exactly the list src/audio/audio.js's CUES uses (m18 A1g asserts the two key
 *  sets are equal), so an event that makes a sound can never silently make no rumble.
 *
 *  A row is { strong, weak, ms, to }: the two Gamepad `dual-rumble` magnitudes (0..1 — strong
 *  is the low-frequency heavy motor, weak the high-frequency light one) and how long the
 *  effect runs. `to` is the ROUTING — whose pad feels it:
 *    'holder'  the hands on the object (the payload's heldBy, else the entity's own grips)
 *    'player'  the mover the payload names (playerId / by / an entityId that IS a mover)
 *    'driver'  the seat main.js recorded as driving — the SAME choice §11.3's camera shake
 *              makes (main.js roadShakeSeat()); no driver means no pulse, as for the shake
 *    'all'     every seat (in solo that is the one seat)
 *  A 'holder' or 'player' row whose payload names nobody falls back to 'all': in solo that is
 *  the only hand there is, and in co-op a knock nobody was holding is the house's, not one
 *  crew member's. Nothing here scales with severity — the audio layer's own silence threshold
 *  decides WHETHER a cue fires (cueVolume ≤ 0 is silent), and the row decides how hard.
 *
 *  Every ms is inside [minMs, maxMs] and every magnitude inside [0,1] (m35 H1). maxMs is 260
 *  deliberately: §11.3's road events are ONE hit each and never a bed, so the worst drive
 *  cannot leave a pad buzzing for the 28 s of the route. */
export const HAPTICS = Object.freeze({
  /** The only effect type the Gamepad API defines for a pad's two motors. */
  effect: 'dual-rumble',
  /** The audio layer's minGapMs rule (audio.js takeCue), per SEAT and per cue type: a second
   *  thud inside this many sim ms is the same thud. 120 against AUDIO's 90 for IMPACT because
   *  a hand is slower than an ear. */
  minGapMs: 120,
  /** The bounds every row's `ms` is asserted inside (m35 H1). */
  minMs: 40,
  maxMs: 260,
  /* NOT TUNED HERE: how many pulses a seat has in the air. The Gamepad API's actuator plays
   * ONE effect and issuing a second CANCELS the first, so that is a fact about the hardware
   * rather than a knob — a `maxConcurrent` here would be a number nothing reads. The rule it
   * would have described is in haptics.js pulse(): a weaker cue arriving inside a stronger
   * one's window stands down rather than cutting it short, and a stronger one replaces it
   * (m35 H3c/H3d). */
  /** §10.3's overstressed strap — "creak, vibration". A STATE, not a knock: a weak pulse
   *  every periodMs on the carrier's seat for as long as the state lasts, stopping within one
   *  period of it clearing (m35 H6). Never the strong motor — this is a warning, not an
   *  impact. periodMs > minGapMs so the per-type gap never swallows a repeat. */
  strap: Object.freeze({ strong: 0, weak: 0.32, ms: 180, periodMs: 320, to: 'holder' }),

  /* Every row is frozen individually, not just the table: Object.freeze is shallow, and a
   * table whose rows can still be written is a table a system can retune at runtime — which
   * is the bare literal this project's rules exist to stop, one indirection further out. */
  /* §8.4's own line: the thud in the hand that dropped it. */
  IMPACT:         Object.freeze({ strong: 0.45, weak: 0.30, ms: 90,  to: 'holder' }),
  /* §8.3's bands cost money; this is the one pulse a player should notice through a sleeve. */
  DAMAGE_APPLIED: Object.freeze({ strong: 0.85, weak: 0.55, ms: 180, to: 'holder' }),
  /* M30: a hit on a surface already at its §8.3 maximum. It still HAPPENED (§8.4's four
   * channels are about the impact, not about the bill), so the hand feels it — but it costs
   * nothing, so it is the quietest damage row on the table rather than the loudest. */
  PROPERTY_CAPPED: Object.freeze({ strong: 0.22, weak: 0.30, ms: 70,  to: 'holder' }),
  /* §6.1 the grip: a tick on, a tick off. Weak motor only — a grab is not a hit. */
  GRIP_STARTED:   Object.freeze({ strong: 0,    weak: 0.22, ms: 45,  to: 'player' }),
  GRIP_ENDED:     Object.freeze({ strong: 0.10, weak: 0.26, ms: 50,  to: 'player' }),
  /* §10.3 the strap's one-shots (hooked, ratcheted, snapped). 'overstressed' is the sustain
   * above instead, so this row never fires for it. */
  STRAP_CHANGED:  Object.freeze({ strong: 0.35, weak: 0.40, ms: 110, to: 'holder' }),
  /* §9.2 tools are world objects: the dolly clacks under your hands. */
  TOOL_STATE:     Object.freeze({ strong: 0.15, weak: 0.30, ms: 60,  to: 'player' }),
  /* §8.2 the screwdriver's ratchet — the lightest thing on the table. */
  PART_CHANGED:   Object.freeze({ strong: 0.08, weak: 0.24, ms: 45,  to: 'player' }),
  /* §8.2 a leaf coming off its hinges, in the arms that took it. */
  DOOR_STATE:     Object.freeze({ strong: 0.30, weak: 0.35, ms: 90,  to: 'player' }),
  /* §10.2 loaded/unloaded is a fact about the truck: everybody's news. */
  CARGO_STATE:    Object.freeze({ strong: 0.20, weak: 0.30, ms: 70,  to: 'all' }),
  /* §11.3 the road, in the driving seat only — the seat the camera shake already picked. */
  ROAD_FORCE:     Object.freeze({ strong: 0.70, weak: 0.45, ms: 220, to: 'driver' }),
  /* §18.3 a recovery: something is somewhere else now, and it costs money. */
  RECOVERY:       Object.freeze({ strong: 0.25, weak: 0.35, ms: 90,  to: 'player' }),
  /* §3.4 the phase stings, the invoice one included — the whole crew's moment. */
  CONTRACT_PHASE: Object.freeze({ strong: 0.18, weak: 0.28, ms: 120, to: 'all' }),
});

/** §21.4 settings panel + §26.6 versioned, device-local save (Phase 11 build-side M4).
 *
 *  The input keys and their defaults live with their consumer (input.js DEFAULT_SETTINGS);
 *  THIS is where every slider's bounds and the shell's own settings are tuned. `ranges` is
 *  what sanitiseSettings() clamps to, so a hand-edited save cannot set a 400× mouse. */
export const SETTINGS = Object.freeze({
  /** One localStorage key; the payload carries `schema` and a load with any other schema
   *  returns defaults and leaves the blob untouched (§26.6, §27.1). */
  saveKey: 'mfh.save',
  schema: 1,
  /** Hard caps on the strings a saved best invoice may carry back into the DOM. */
  textLimits: { grade: 2, build: 40, date: 10 },
  /** The frame the pad/key look rates are authored against (one 60 Hz frame). poll(frameMs)
   *  scales by frameMs / this, so 'sensitivity' is a rad/s and not a rad/refresh. */
  lookRefFrameMs: 16.667,
  ranges: {
    mouseSensitivity:   { min: 0.2, max: 4.0, step: 0.1 },
    padLookSensitivity: { min: 0.5, max: 6.0, step: 0.1 },
    keyLookRate:        { min: 4,   max: 40,  step: 1 },
    stickDeadzone:      { min: 0,   max: 0.6, step: 0.02 },
    triggerThreshold:   { min: 0.1, max: 0.9, step: 0.05 },
    /** §6.5's grip-strength assist (Phase 11 build-side M27): the multiplier on every seat's
     *  force cap. min is 1 (off) and max is GRIP.assist.max — the bound that keeps the puzzle,
     *  derived and asserted there, not a slider limit somebody may widen here. The step makes
     *  the row the three settings §6.5 wants offered (1.00 / 1.25 / 1.50); save.js accepts a
     *  stored value only ON one of those steps (sanitiseShell). */
    gripAssist:         { min: 1, max: GRIP.assist.max, step: GRIP.assist.step },
    /** UI scale is the `--ts` CSS variable every font-size in styles.css multiplies by. */
    uiScale:            { min: 0.8, max: 1.6, step: 0.1 },
    /** The boom, in metres, inside the rig's own clamp (RENDER.camera.distanceMin/Max). */
    cameraDistance:     { min: RENDER.camera.distanceMin, max: RENDER.camera.distanceMax, step: 0.1 },
    /** The three volume sliders (M9): bus gains 0..1, consumed by audio.setMaster/setBus. */
    audioMaster:        { min: 0, max: 1, step: 0.05 },
    audioUi:            { min: 0, max: 1, step: 0.05 },
    audioWorld:         { min: 0, max: 1, step: 0.05 },
  },
  /** Settings that are the SHELL's, not the input layer's. Persisted beside the input keys.
   *  The audio keys and `captions` (§21.4 Hearing) live here too — M9 — so the save's
   *  top-level key set is unchanged (m16 V4c). */
  shellDefaults: {
    uiScale: 1, cameraDistance: RENDER.camera.distance, tier: 'auto',
    audioMaster: AUDIO.master, audioUi: AUDIO.buses.ui, audioWorld: AUDIO.buses.world, captions: true,
    /** §26.5 "camera shake … exist[s]" / §21.4 Motion (M16): every rig's shakeEnabled. The
     *  boot default is `!prefers-reduced-motion` (save.js reducedMotionPreferred) — this is
     *  the value when the OS has no preference; a saved choice always wins. */
    cameraShake: true,
    /** §8.4's haptic pulse / §4.4 controller parity / §21.4 Motion (Phase 11 build-side M28):
     *  the pad's two motors, routed per seat by src/audio/haptics.js. Its boot default follows
     *  prefers-reduced-motion exactly as cameraShake's does — this is the value when the OS
     *  has no preference — and a saved choice always wins (save.js sanitiseShell). A keyboard
     *  seat loses nothing by it: no cue is withheld from anybody, this is a second channel on
     *  cues the sound and the caption already carry. */
    rumble: true,
    /** §21.4 Cognition "reduced HUD", "optional hints" and Vision "high contrast" (Phase 11
     *  build-side M19). reducedHud → every HUD's setReduced (the cargo panel, the route label
     *  and the contract panel's secondary rows go; the objective, the prompt, the reticle,
     *  notices and captions never do — §21.1). highContrast → the `.hc` class on <body>, every
     *  HUD root and every card (styles.css: opaque panels, white text, 2 px borders, a hatched
     *  route fill); `?hc=1` forces it on at boot. hints → M5's stall hint never counts while
     *  off, and interact.js's ' → room' suffix on the prompt is dropped. */
    reducedHud: false,
    highContrast: false,
    hints: true,
    /** §26.7 / §21.3 first-minute cards (Phase 11 build-side M22, walkthrough.js): true once
     *  the three cards retired or were skipped in this browser — the card is never shown to a
     *  player who has done it (a settings-card checkbox unticks it). Hints off hides the cards
     *  too, without touching this. */
    walkthroughSeen: false,
    /** §6.5 "Grip strength scaling" (Phase 11 build-side M27): the multiplier on every mover's
     *  force cap, routed by main.js to each GripSystem's setAssist (the M16 pattern — a rig's
     *  setShakeEnabled). 1.0 is off, and off is the default: the assist is an option, never a
     *  difficulty the player has to turn back down. GRIP.assist carries the bounds and why. */
    gripAssist: GRIP.assist.default,
    /** §21.2 "Invoice animates major lines" / §21.4 Motion (Phase 11 build-side M31): the
     *  settings row for the settlement reveal, routed to invoiceScreen.revealEnabled through
     *  the page rule (invoiceScreen.js revealEnabledWith). Its boot default follows
     *  prefers-reduced-motion exactly as cameraShake's and rumble's do — this is the value when
     *  the OS has no preference — and a saved choice always wins (save.js sanitiseShell). Off,
     *  every number is the same number, shown at once: the reveal is presentation over lines
     *  invoice.js already wrote, never a second calculation. */
    invoiceReveal: true,
    /** §21.2 "a retry … optionally preserves loadout" (Phase 11 build-side M31): the tick that
     *  the settlement sheet's box AND the pause card's box both read and write, so the two
     *  restarts cannot disagree about the tools. REMEMBERED between sessions (it is in the
     *  save), which is why both labels say so and why 'Defaults' puts it back to false — a
     *  tester who ticked it once in a previous session would otherwise be quietly starting
     *  every job with the truck already loaded. */
    keepLoadout: false,
  },
  /** 'auto' detects (lighting.js detectRenderTier); the other two force. APPLIES LIVE since
   *  Phase 11 build-side M29 — lighting.setQualityTier disposes the rig and rebuilds it from
   *  the tier's row in LIGHTING.tiers, in the scene that is already running — and is saved for
   *  the next boot as well. What a live switch does NOT rebuild is the texture and material
   *  set, which is minted before the scene exists (setRenderTier, main.js): the shadow maps,
   *  the lights, the shadow filter and the post chain follow the switch; bump, spec and env
   *  maps follow the next reload. The settings row says so. */
  tiers: ['auto', 'gpu', 'software'],
  /** §21.4 Vision "scalable UI" — THE BOXES (Phase 11 build-side M29). M4 made `--ts` multiply
   *  every font-size; the boxes that hold that type stayed raw px, so at 1.6× the help line ran
   *  1377.9 px wide in a 1262 px window (measured — clipped at both ends, no scrollbar to say
   *  so) and the title card's livery name wanted 735 px of a 647 px plate. These are the numbers
   *  the m36 suite measures that against. */
  textSize: {
    /** How many lines #help may wrap to at ANY text size. One line up to ~1.3× (872.5 px of
     *  line), two from ~1.4×; a third would push the route bar and the caption into the working
     *  area (§21.1), which is what --help-lift's budget is measured against. */
    helpMaxLines: 2,
    /** …AND WHAT ENFORCES IT. helpMaxLines was a budget nothing read until this ladder existed:
     *  main.js syncHelpMetrics multiplies #help's font-size by `--help-squeeze`, steps down this
     *  list in order and stops at the first factor that fits the line inside helpMaxLines rows.
     *  1 is the shipping value at every text size the range allows in a 1262 px window (measured:
     *  one row to 1.3×, two at 1.6×), so nothing moves until the budget is genuinely exceeded —
     *  a narrower window, a longer binding line, or the two-seat text. Shrinking the help line is
     *  the lesser harm: the alternative is a third row lifting the route bar and the caption into
     *  the working area (§21.1), which is the one thing the scale must never do.
     *  THE LAST FACTOR IS A FLOOR, NOT A GUARANTEE. No ladder fits every window — 0.72 at 1.6×
     *  still wants ~1005 px of control line, so a window under ~560 px is past it. When the list
     *  runs out with the line still over budget, syncHelpMetrics sets helpMetrics.overBudget and
     *  logs by how much (m36 S1g) rather than lifting the panels in silence. Lengthening this
     *  list buys narrower windows at the cost of readable help text; the real fix is a shorter
     *  control line. */
    helpSqueeze: [1, 0.9, 0.8, 0.72],
    /** THE ONLY selectors allowed a raw px `width` / `min-width` / `max-width` in styles.css,
     *  and why. Everything else under #ui, a .card or #help multiplies by var(--ts) or is
     *  viewport-relative; m36 S3 walks the CSSOM (never a fetch — KNOWN_ISSUES Phase 17) and
     *  fails on any raw px box that is not listed here, the way m16 U1e does for font sizes.
     *  A zero length is not a box and is not listed. */
    pxAllowed: {
      '#help': ['max-width'],                     // the viewport minus the corner panels' inset
      '.objective': ['max-width'],                // §21.1's centre-third guard: must NOT scale
      '.reticle .dot': ['width'],                 // the reticle is a sight, not type (§21.1)
      '.reticle .hand': ['width'],
      '.reticle .hand.holding': ['width'],
      '.reticle .hand.slipping': ['width'],
      '.route-bar': ['width'],                    // a progress length, not type
      '#title-screen .card': ['width'],           // pinned beside the brief sheet (m31 B2)
      '#title-screen .brief': ['width'],          // …and the sheet to the card
    },
    /** …and THE ONLY font declarations allowed to CAP `--ts` instead of multiplying by it, with
     *  the cap each may use. m16 U1e counts the declarations that carry var(--ts); a
     *  `min(var(--ts), N)` passes that count while quietly scaling less than every other row on
     *  the card, so U1l walks OUT from each var(--ts) through its enclosing functions and fails
     *  on a min()/clamp() whose selector is not named here with that number. */
    scaleCapAllowed: {
      // Three inline words with margins and no space between them: no break opportunity, so the
      // name cannot wrap and simply ran out of the card — 735 px of name in a 647 px plate at
      // 1.6× (measured, the card's only overflow at that size). 1.35× is where it fills the
      // plate: 78.3 px of font, 620 px of name, 27 px to spare.
      '#title-screen .name': 1.35,
    },
  },
});

/** §21.4 "full remapping" — Phase 11 build-side M18. The remapper is UI over seams that
 *  already existed (input.js bindingConflicts / glyphFor, the settings card, the versioned
 *  save); these are its only numbers. */
export const INPUT = Object.freeze({
  remap: {
    /** A Rebind capture nobody answers closes itself after this much time on the FRAME clock
     *  Input.poll() runs on (capped per frame at SIM.maxFrameMs like the sim clock). The frame
     *  clock, not the sim clock, because the card opens from the PAUSE card and a paused sim
     *  clock never advances (m0 A9/E3) — a sim-time timeout there would never fire. */
    captureTimeoutMs: 8000,
    /** Key codes no action may be bound to. The shell reads them raw (Escape cancels a capture
     *  and is the Chrome pointer-lock release; F3 is the overlay toggle; COOP.joinKey seats
     *  the second player), so an action on one would fire twice. COOP.joinPad is reserved
     *  beside them for the same reason (input.js reservedReason). */
    reservedKeys: ['Escape', 'F3', COOP.joinKey],
    /** Actions the Controls group lists but never rebinds: the shell's own. 'pause' is Escape
     *  + Menu on every seat and the card itself closes on Escape; 'debug' is F3. */
    lockedActions: ['pause', 'debug'],
    /** Token shapes rebind() accepts: a KeyboardEvent.code, 'Mouse<0..maxMouseButton>', or
     *  'P<seat>B<0..maxPadButton>' (Standard Gamepad has 17; 31 leaves room for exotic pads). */
    maxMouseButton: 4,
    maxPadButton: 31,
    /** Longest KeyboardEvent.code a saved binding may carry (the longest real code, 'NumpadDecimal'
     *  / 'IntlBackslash', is 13; 32 bounds a hand-edited save). */
    maxKeyCodeLength: 32,
  },
});

/** §27.4 telemetry and the §27.3 questionnaire — Phase 11 build-side M6.
 *
 *  LOCAL ONLY. The project rule is zero external requests (CLAUDE.md), so §27.4's "explicit
 *  opt-in upload" is a Copy button that puts human-readable JSON on the clipboard, and
 *  nothing else. "Deletable" is the 'clear responses' button on the settlement sheet. */
export const TELEMETRY = Object.freeze({
  /** Events the RunRecorder keeps VERBATIM per run (§26.6 "no unbounded growth in logs").
   *  Past this it counts `dropped` and every counter keeps counting — only the list is
   *  capped. Sized against measurement: a full m14 soak run (strap, dolly, doors off, a TV
   *  drop, the 28 s drive, the unload) is a few hundred events; a couch scraped along a wall
   *  emits one IMPACT per contact step, so a ten-minute session can reach the low thousands. */
  maxEventsPerRun: 5000,
  /** Compact run summaries (no event lists) kept in the save, newest last (§27.4 "deletable"). */
  keepRuns: 6,
  /** Export precision: metres to the millimetre, money to the cent (divisors for Math.round). */
  precision: { metres: 1000, money: 100 },
  /** Caps on the strings a stored run record may carry back into the DOM. */
  textLimits: { isoDate: 32, contractId: 40, counterKey: 40 },
  /** Strings from a kept run or a questionnaire answer are cut here before the save or the DOM. */
  textMax: 280,
  /** §27.3's five scaled questions use one 1..5 scale with text anchors at both ends —
   *  colour-independent by construction (§26.5). */
  questionnaire: { scaleMin: 1, scaleMax: 5 },
});

/** §26.7 Fun Validation Gate as DATA — Phase 11 build-side M21 (src/telemetry/evidence.js,
 *  docs/evidence.html). §25.2 Phase 12 decides Unity go/revise/stop from 'an evidence report',
 *  and this block is what the report scores against.
 *
 *  `rules` are the GDD's six minimum-evidence cells VERBATIM (GDD.md §26.7; m28 E3 pins them
 *  against the document, not against this file). Everything else is the threshold the page
 *  reads each signal at, from M6's run reports (runLog.js buildRunSummary — the input
 *  contract this never changes). The GDD's quantifiers: "most" is STRICTLY more than `most`,
 *  "at least half" is `half` INCLUSIVE; "rank highly" and "not dominant" are the numbers
 *  below, and the page prints them beside every verdict so a reader can disagree with them. */
export const EVIDENCE = Object.freeze({
  rules: Object.freeze({
    comprehension: 'Most players move a box and identify the next objective without coaching',
    emergentStory: 'Most groups recount an unscripted event afterward',
    learning: 'Second run changes route, pack, tool, or coordination',
    replayIntent: 'At least half voluntarily replay or ask for more',
    corePreference: 'Carrying/packing/transport consequences rank highly',
    friction: 'Control confusion and unrecoverable bugs are not dominant',
  }),
  most: 0.5,
  half: 0.5,
  /** Comprehension, from the report's events (GRIP_STARTED, CARGO_STATE loaded) or, when
   *  the compact stored run has no events, from M22's walkthrough stamps (step1Ms = first
   *  grip, step2Ms = first load). The stall hint is NOT an event, so "before the stall hint"
   *  is its deadline: firstGripMs equals CONTRACT.stallHintMs — a grip after that had the
   *  coaching §26.7 says they must not need. A load inside two minutes of sim time is the
   *  "move a box" half of the cell. */
  comprehension: { firstGripMs: 30000, firstLoadMs: 120000 },
  /** Learning pairs a tester's first and second run (sessions: consecutive reports whose
   *  `restarts` climbs — there is no identity by design, §27.4) and calls the second run
   *  changed when any of these moves by at least the delta: trips (route), straps placed or
   *  worst cargo shift (pack), tool changes (tool). `minFraction` of pairs must change. */
  learning: { tripsDelta: 1, strapsDelta: 1, toolDelta: 1, shiftDeltaM: 0.10, minFraction: 0.5 },
  /** Replay intent per run: q7 at or above `q7Yes` on the 1..5 scale, OR restarts >= 1. */
  replayIntent: { q7Yes: 4 },
  /** Core preference: the mean of each of these §27.3 scales must reach `minMean`. */
  corePreference: { questions: Object.freeze(['q3', 'q4', 'q5']), minMean: 3.5 },
  /** Friction: recoveries per run, drops per grip, and the fraction of runs whose q1 answer
   *  mentions one of `words` — all three at or under their cap. */
  friction: Object.freeze({
    maxRecoveriesPerRun: 1.0, maxDropsPerGrip: 0.5, maxMentionFraction: 0.5,
    words: Object.freeze(['stuck', 'control', 'bug', 'glitch', 'confus', 'broken', 'lost']),
  }),
  /** Invoice line kinds the aggregates sum (invoice.js LINE_KINDS, copied so the static page
   *  imports nothing but config and the question table; m28 E3 asserts they agree). */
  lineKinds: Object.freeze({
    damage: 'furniture damage', property: 'property damage',
    leftBehind: 'items left behind', partsLeft: 'parts left behind',
  }),
  /** Worst-cargo-shift histogram edges, metres (the last bin is "past the last edge"). */
  shiftBinsM: Object.freeze([0.05, 0.25, 0.50]),
  /** Caps on report strings echoed back into the page. */
  textLimits: Object.freeze({ label: 40, sample: 60 }),   // sample: chars of a rejected paste shown beside its reason
});

/** §22.5 debug + performance instrumentation. Validated: Phase 0. */
export const DEBUG = Object.freeze({
  /** OFF in the shipping build (Phase 11 build-side M3): it shipped ON for fifteen phases,
   *  so every playtester saw the developer overlay before they saw the game. F3 toggles it
   *  and the metre grid together (m15 P9). */
  overlayEnabledByDefault: false,
  frameSampleSize: 120,      // frames averaged for the FPS readout
  eventLogLines: 8,
  /** §21.4 Cognition "objective history" (Phase 11 build-side M19): how many of the last
   *  HUD notices the pause card's 'What happened' block lists, with their sim-time stamps.
   *  A shell ring (main.js noticeHistory, never game.state), fed by the notice drain — one
   *  entry per queued notice, so a broadcast to both seats is one line — and cleared by
   *  resetContract. Eight: a screen's worth to read while paused, more than the four the
   *  HUD stacks, fewer than a log (§21.1 "not a checklist"). */
  historyLen: 8,
  /** M15's §26.6 soft-lock sweep (tools/m23-softlock-tests.js): how many seeded sessions of
   *  the common verbs it plays, from which seed, with how many teleports-to-void each. The
   *  seed is printed in every FAIL line so a failure reproduces; change it here to sweep a
   *  different neighbourhood. `driveSessions` caps how many sessions may drive the route
   *  (1681 frames a leg) so the suite stays inside smoketest.ps1's virtual-time budget. */
  softlockSessions: 40,
  softlockSeed: 20260904,
  softlockTeleports: 3,
  softlockActionsMin: 6,
  softlockActionsMax: 12,
  softlockDriveSessions: 3,
  /** M22: the first-minute cards (walkthrough.js) are OFF on the harness's scratch pages
   *  (`_smoketest-<port>.html`) unless a suite asks with ?walkthrough=1 — every DOM-shape
   *  assertion in m11/m15 would otherwise move. True here shows them in every harness run. */
  walkthroughInHarness: false,
  /** M24: the settlement sheet's wall-time reveal (invoiceScreen.js) renders its FINAL state
   *  at once on the harness's scratch pages unless a suite asks with ?reveal=on or flips
   *  invoiceScreen.revealEnabled — every existing settlement assertion reads the sheet the
   *  instant settle() returns. True here animates it in every harness run. */
  invoiceRevealInHarness: false,
});
