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
  phase: 24,
  label: 'phase-24',
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
    bands: [
      { name: 'scuffed', min: 12 },
      { name: 'dented',  min: 40 },
      { name: 'holed',   min: 100 },
    ],
    decals: {
      max: 24,
      size: { scuffed: 0.12, dented: 0.20, holed: 0.30 },
      proud: 0.003,
      opacity: 0.35,
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
  /** §10.2 pack quality as ONE number (M17, §26.3): quality = 1 − (unsecuredWeight × the
   *  fraction of the load's mass that is unrestrained + heightWeight × how high the
   *  UNRESTRAINED mass sits, as a mass-weighted fraction of the box height + runUpWeight ×
   *  how much open deck lies ahead of it toward the headboard, as a mass-weighted fraction
   *  of the box length), clamped to 0..1. Restrained mass contributes nothing to the last
   *  two: a strapped fridge at the tail is not the same risk as a loose one. Still §10.4's
   *  ADVISORY heuristic — nothing acts on it but a warning and a score.
   *
   *  TUNED against tools/m25-packs-tests.js so that the number predicts the drive: the three
   *  packs measure LOW 0.030 m / TALL 0.577 m / SLIDE 1.520 m of worst shift over the route
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
  roadEvents: {
    hardBrake:  { severity: 1.0, accel: { x: 0, y: 0, z: 1.0 } },
    sharpTurn:  { severity: 1.0, accel: { x: 1.0, y: 0, z: 0 } },
    speedBump:  { severity: 0.8, accel: { x: 0, y: 0.55, z: 0 } },   // mostly vertical
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

/** The physical world's extent (Phase 11 build-side M15). ONE number: the side of the
 *  square ground collider PhysicsWorld.addGround builds (main.js passes it; world.js's
 *  default is the same 200 m — the scene's 400 m grass plane is dressing with no collider).
 *  RECOVERY.bounds is derived from it below, so "off the plot" means what the physics
 *  means by it: past the ground's edge there is nothing to stand on and the fall reaches
 *  objectFloorY within a second either way. */
export const WORLD = Object.freeze({
  groundSizeM: 200,
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
  },
  /** 'auto' detects (lighting.js detectRenderTier); the other two force. Applies on reload —
   *  the tier decides how many shadow maps get BUILT, before the scene exists. */
  tiers: ['auto', 'gpu', 'software'],
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
});
