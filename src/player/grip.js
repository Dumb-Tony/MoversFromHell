/* Freeform grabbing — GDD §6.1, §6.2, §6.4, §7.3, §26.2.
 *
 * §6.1: "A ray or short cone from the camera chooses a reachable surface point. On grab,
 * create a spring-like constraint from the selected hand target to the local point on the
 * object's collider. Store the local-space coordinate so rotation and multiple grips
 * remain consistent."
 *
 * WHY A FORCE-AT-A-POINT SPRING AND NOT A RAPIER JOINT.
 * Rapier ships SpringImpulseJoint, and reaching for it looks like the obvious move. Four
 * reasons this applies its own force instead:
 *
 *   1. §6.4 requires player force to be BOUNDED — "so two clients cannot create an
 *      explosive feedback loop". A clamp on a force this file computes is one line and
 *      is auditable in a test. A joint's internal impulse is neither.
 *   2. §6.2 modulates that bound by brace, hand count, surface wetness and the object's
 *      own grip multiplier. Those are scalars on a cap, not joint parameters.
 *   3. The force is applied AT THE GRIP POINT, not at the centre of mass. §6.2's
 *      "distance from centre of mass -> more torque and rotation leverage" and §26.2's
 *      "grip location changes torque and balance visibly" then fall out of rigid-body
 *      dynamics for free, instead of needing a special case.
 *   4. THE GATE. §25.2 Phase 2 must ship with "no wall ghosting". The held object stays a
 *      fully dynamic body that collides with the world and is DRAGGED toward the hand; it
 *      is never teleported or parented. So a box cannot pass through a wall the player
 *      walks through — the spring stretches, and past GRIP.maxStretch the hand lets go.
 *      Kinematic attachment, the usual shortcut, ghosts through everything by definition.
 */

import { GRIP, PLAYER, CARRY, SIM } from '../config.js';
import { EVENTS } from '../core/eventBus.js';
import { GROUP_PRESETS } from '../physics/world.js';

export const HANDS = Object.freeze(['left', 'right']);
const ZERO = Object.freeze({ x: 0, y: 0, z: 0 });

export class GripSystem {
  /**
   * @param {PhysicsWorld} physics
   * @param {ObjectRegistry} registry
   * @param {ThirdPersonCamera} rig
   * @param {THREE.PerspectiveCamera} camera
   * @param {EventBus} bus
   * @param {PlayerController} player  needed for reach and to exclude its own capsule
   */
  constructor(physics, registry, rig, camera, bus, player) {
    this.physics = physics;
    this.registry = registry;
    this.rig = rig;
    this.camera = camera;
    this.bus = bus;
    this.player = player;

    /** hand -> grip record | null */
    this.grips = { left: null, right: null };
    /** What the reticle is currently over, for the §21.1 HUD prompt. */
    this.hovered = null;
    this.lastRelease = null;

    /* THIS MOVER'S OWN AIM — the Phase 4 fix, and the reason multiple grips combine at all.
     *
     * There is one camera rig for the whole game (§4.1), and the obvious thing is for aim()
     * to read rig.yaw/pitch directly. That is what Phases 2-3 did, and it is correct right
     * up until a SECOND mover holds something.
     *
     * Hand targets are stored view-relative (see tryGrab), so they are rebuilt every step
     * against the current aim frame. Reading the shared rig means an inactive mover's hands
     * are rebuilt in the ACTIVE player's view frame: turn the camera and your partner's arms
     * swing round with it, wherever they happen to be standing. Measured, this collapsed
     * their stretch to near zero and they applied 0 N — which reads in play as "my partner
     * is not helping", not as a camera bug.
     *
     * So each mover keeps its own yaw/pitch and only takes them from the rig while it is the
     * one being driven. An unattended mover's hands stay where IT last put them. */
    this.aimYaw = 0;
    this.aimPitch = 0;

    /* Every GRIP number this system reads goes through here. Production is the frozen
     * config; a probe or a suite may hand ONE mover a copy with a value changed
     * (`grips.tuning = { ...GRIP, towSpeedSafety: 0.7 }`) to sweep it in a single run — the
     * instance-override rule from m3 D5 (`controller.tractionN = () => T`), applied to a
     * whole block instead of one method. Never mutate GRIP; it is frozen for a reason. */
    this.tuning = GRIP;

    /* §6.5 GRIP STRENGTH ASSIST (M27) — the multiplier on this mover's force cap, pushed here
     * by main.js's settings store from the shell key `gripAssist`. The M16 pattern: a setting
     * lives on the system that consumes it and never in game.state (§22.4, m0 E8 — settings do
     * not replay). 1 is off. setAssist() is the only writer, because the clamp to
     * GRIP.assist.max is the §6.5 puzzle guard and a bare field assignment would skip it. */
    this.assist = 1;

    /* §4.3 TRIGGER PRESSURE (M27) — the seat currently DRIVING this mover, or null. Duck-typed
     * to `input.seat(n)`: { activeDevice, analog(action) }. Null is a full pull, which is what
     * an unattended mover (a solo player who swapped away mid-carry) and every fixture that
     * drives step() directly get — see handPressure(). */
    this.seatInput = null;
  }

  /** §6.5's assist, clamped to [1, GRIP.assist.max]. The clamp is the puzzle guard (see
   *  GRIP.assist), so it lives here rather than in the settings store: a save, a slider and a
   *  suite all arrive through this one door. Anything unusable is 1 (off). Returns what stuck. */
  setAssist(v) {
    const n = Number(v);
    const max = this.tuning.assist.max;
    this.assist = Number.isFinite(n) ? Math.min(max, Math.max(1, n)) : 1;
    return this.assist;
  }

  /** Whose triggers these hands read. main.js sets it to the driving seat each step and to
   *  null for a mover nobody is steering. */
  setSeatInput(si) { this.seatInput = si || null; return this; }

  /**
   * 0..1 — how hard THIS hand is closed right now (§4.3, §6.5). Read every step a hand is
   * closed, so easing off the trigger lowers the cap live.
   *
   * FULL PULL unless a pad is actually driving: no seat (an unattended mover, a fixture), or a
   * seat whose active device is the keyboard and mouse. §4.4's parity is "every essential
   * action requires controller parity", i.e. the same ACTIONS on both devices — not the same
   * analog nuance, which a mouse button does not have to give. A latched toggle-mode grip is a
   * full pull too, and that falls out of input.js rather than being special-cased here:
   * analog() returns 1 for a latched latchable action whatever the trigger is doing.
   *
   * The floor (GRIP.analog.floor) is applied AFTER the input layer's own trigger threshold, so
   * a reading of 0 means "under SETTINGS.triggerThreshold" — the hand is already being released
   * by main.js this same step — and never "hold at zero strength".
   */
  handPressure(hand) {
    const si = this.seatInput;
    if (!si || si.activeDevice !== 'pad') return 1;
    const v = si.analog(hand === 'left' ? 'gripLeft' : 'gripRight');
    if (!Number.isFinite(v)) return 1;
    return Math.min(1, Math.max(this.tuning.analog.floor, v));
  }

  /** The WEAKEST pressure among this mover's own hands on `entityId`; 1 when none of them is.
   *  towFor() asks, so a feathered hold tows at what the feathered hand can actually pull —
   *  the same number step() applies, not a stronger one the legs would then chase. */
  gripPressureOn(entityId) {
    let p = 1, any = false;
    for (const h of HANDS) {
      const g = this.grips[h];
      if (!g || g.entityId !== entityId) continue;
      const v = this.handPressure(h);
      p = any ? Math.min(p, v) : v;
      any = true;
    }
    return any ? p : 1;
  }

  /** Adopt the shared rig's orientation as this mover's own. Called for the mover currently
   *  being driven, and on any grab, since you always grab under your own aim. */
  syncAim() {
    this.aimYaw = this.rig.yaw;
    this.aimPitch = this.rig.pitch;
  }

  /* AIM FROM THE CAMERA, REACH FROM THE BODY.
   *
   * §6.1 says "a ray or short cone from the camera chooses a reachable surface point", and
   * the obvious reading — cast from the camera, accept anything within GRIP.reach of it —
   * is wrong for a third-person game and was the first thing built here. The camera sits
   * about 4 m BEHIND the character (§4.1), so a 2.1 m reach measured from the camera does
   * not even arrive at the character's own back: nothing was ever grabbable.
   *
   * The direction has to come from the camera, because that is what the crosshair means.
   * The DISTANCE has to be measured from the body, because that is what an arm is. So the
   * ray starts at the camera, and a hit counts only if the contact point is within
   * GRIP.reach of the shoulder. Same for the hand target while carrying — anchored to the
   * shoulder, not the camera, or the object would be dragged to a point behind the player.
   */

  /** Shoulder origin — what "reach" is measured from, and where the hands hang. */
  shoulder() {
    const p = this.player ? this.player.position : { x: 0, y: 0, z: 0 };
    return { x: p.x, y: p.y + PLAYER.height * 0.78, z: p.z };
  }

  /** Where the aim RAY starts: the camera's boom solve WITHOUT the M16 shake offset (Phase 11
   *  build-side M20; §4.4 "what you see is what you aim"). The shake moves what you see, never
   *  where the ray starts — a grab attempted inside the half-second after a jolt lands where
   *  the reticle was, not up to maxOffset (0.12 m) to one side of it (m24 K6c/K6d). At rest
   *  the rig's unshakenEye() IS camera.position, so a fixture that never nudges sees the
   *  numbers it always did. A rig without the method (a bare probe's stub) falls back to the
   *  camera. The DIRECTION is aimYaw/aimPitch, which the shake never touches (m24 K6/K6b). */
  aimOrigin() {
    const rig = this.rig;
    const e = rig && typeof rig.unshakenEye === 'function' ? rig.unshakenEye() : this.camera.position;
    return { x: e.x, y: e.y, z: e.z };
  }

  /** Aim basis — a full orthonormal frame, not just a direction.
   *  The rig owns yaw/pitch; this derives the 3D vectors, because forwardFlat() is
   *  deliberately flattened and cannot aim up or down at a box on the floor. */
  aim() {
    // this.aimYaw/aimPitch, NOT rig.yaw/pitch — see the constructor for why.
    const cp = Math.cos(this.aimPitch), sp = Math.sin(this.aimPitch);
    const sy = Math.sin(this.aimYaw), cy = Math.cos(this.aimYaw);
    // Matches ThirdPersonCamera's convention: forward is -Z at yaw 0, pitch 0.
    const dir = { x: -sy * cp, y: sp, z: -cy * cp };
    const right = { x: cy, y: 0, z: -sy };
    const up = { x: sy * sp, y: cp, z: cy * sp };    // cross(right, dir)
    // camOrigin: the un-nudged eye (aimOrigin, M20), not camera.position.
    return { origin: this.shoulder(), camOrigin: this.aimOrigin(), dir, right, up };
  }

  /** The hand target for a grip: the stored view-relative offset, rebuilt in world space
   *  against the CURRENT aim frame. See tryGrab for why it is stored this way. */
  handTarget(grip, frame) {
    const f = frame || this.aim();
    const o = grip.holdLocal;
    const side = grip.hand === 'left' ? -1 : 1;
    const r = o.r + side * GRIP.handLateral;
    return {
      x: f.origin.x + f.dir.x * o.f + f.right.x * r + f.up.x * o.u,
      y: f.origin.y + f.dir.y * o.f + f.right.y * r + f.up.y * o.u,
      z: f.origin.z + f.dir.z * o.f + f.right.z * r + f.up.z * o.u,
    };
  }

  /** What the crosshair is over right now, or null. Used by the HUD and by tryGrab. */
  probe() {
    const R = this.physics.R;
    const { origin, camOrigin, dir } = this.aim();
    const ray = new R.Ray(camOrigin, dir);

    // Far enough to cross the camera-to-body gap and then the arm's reach.
    const camToBody = Math.hypot(camOrigin.x - origin.x, camOrigin.y - origin.y, camOrigin.z - origin.z);
    const maxToi = camToBody + GRIP.reach + 0.5;

    // Exclude the player's own capsule, or the ray stops on the character's back every
    // time — the same filter the Phase 1 mantle probe needs, for the same reason.
    const hit = this.physics.world.castRayAndGetNormal(
      ray, maxToi, true, undefined, undefined,
      this.player ? this.player.collider : undefined);
    if (!hit) return null;

    const entity = this.registry.fromCollider(hit.collider);
    /* A door still on its hinges is a Fixed fixture (M11): a hand on it would hold an
     * immovable body until the spring tore, with the leaf in the held collision group
     * meanwhile. Not a target; the screwdriver is the verb (review minor, Phase 20). */
    if (entity && entity.state && entity.state.hung) return null;
    if (!entity) return null;              // static architecture is not grabbable

    const toi = hit.timeOfImpact;
    const point = {
      x: camOrigin.x + dir.x * toi,
      y: camOrigin.y + dir.y * toi,
      z: camOrigin.z + dir.z * toi,
    };
    // §6.1 "reachable" — measured from the shoulder, not the camera.
    const armLength = Math.hypot(point.x - origin.x, point.y - origin.y, point.z - origin.z);
    if (armLength > GRIP.reach) return null;

    return { entity, toi, point, armLength };
  }

  /**
   * §6.1 grip acquisition.
   * @returns {object|null} the grip record, or null if nothing reachable was under the aim
   */
  tryGrab(hand, playerId = 'p0', simTimeMs = 0) {
    if (this.grips[hand]) return this.grips[hand];
    // You always grab under your OWN aim: whoever is reaching out is, by definition, the
    // mover being driven right now. Syncing here means a grab can never be built against a
    // stale frame, whatever order main.js happens to call things in.
    this.syncAim();
    const found = this.probe();
    if (!found) return null;

    const { entity, point } = found;
    // Store the contact in the object's LOCAL frame, so the grip stays on the same part of
    // the box as it rotates (§6.1) and so two grips stay consistent with each other.
    const localPoint = worldToLocal(entity.body, point);

    /* WHERE THE HAND HOLDS IT — stored in the VIEW frame, not as a bare distance.
     *
     * The probe ray starts at the CAMERA, so the contact point lies on the camera-to-box
     * line. A hand target built as shoulder + dir*distance lies on a different line — the
     * two origins are about 4 m apart (§4.1's third-person camera) — so the target did not
     * coincide with the point actually grabbed, and every grab began with an instant
     * stretch of ~0.3 m and a lurch as the spring yanked the box to a place the player had
     * not pointed at. MEASURED: stretch jumped to 0.5 m within two steps and the grip broke.
     *
     * Decomposing the contact offset into (forward, right, up) of the aim frame fixes both
     * halves: the initial stretch is zero by construction, and the object then stays where
     * you grabbed it RELATIVE TO YOUR VIEW as you turn, which is what carrying should mean.
     */
    const frame = this.aim();
    const rel = { x: point.x - frame.origin.x, y: point.y - frame.origin.y, z: point.z - frame.origin.z };
    const side = hand === 'left' ? -1 : 1;
    const holdLocal = {
      f: clamp(dot(rel, frame.dir), GRIP.holdDistanceMin, GRIP.holdDistanceMax),
      r: dot(rel, frame.right) - side * GRIP.handLateral,
      u: dot(rel, frame.up),
    };

    const grip = {
      hand,
      playerId,
      entityId: entity.id,
      localPoint,
      holdLocal,
      overloadMs: 0,
      startedMs: simTimeMs,
      lastDemand: 0,    // what the spring WANTED, before the §6.4 clamp
      lastApplied: 0,   // what actually reached the body — this is the bounded one
      lastStretch: 0,
      /* M27: how hard this hand is closed, 0..1 (§4.3). Initialised to a full pull rather than
       * left undefined, so it is a number from the grab for anything that reads it — the M26
       * lesson about everHeld, applied to a scalar. step() rewrites it every step. */
      lastPressure: 1,
      /* Phase 11 (M10): the hand target's own motion, for hand-frame damping. `lastTarget`
       * is where the hand was last step; `handSteps` counts steps since the grab or since
       * the last target jump, so the finite difference is never taken across a teleport or
       * the settling of a fresh grab (GRIP.handVelWarmupSteps). */
      lastTarget: null,
      handSteps: 0,
      lastHandSpeed: 0,
    };
    this.grips[hand] = grip;

    entity.state.grips.push({ playerId, hand });
    entity.state.held = true;
    /* §15.3 "heaviest thing moved" (M26): the flag is written HERE, on the grab, not on the
     * frames that follow. registry.step has set it since M6 for anything still held when a
     * step runs, which is every carry that lasts a frame — but a grab and a release inside
     * ONE frame (a bump, a slip, a suite that grabs and lets go without stepping) left the
     * couch you actually lifted out of the settlement's stat. Plain boolean on the entity's
     * own state, so it unwinds with everything else on a replay (respawnContract, m0 E8). */
    entity.state.everHeld = true;
    // A held object stops colliding with its carrier. The player capsule is KINEMATIC and
    // therefore unstoppable, so without this, walking into a wall crushes the box between
    // an immovable body and a static one and the solver ejects it straight through —
    // MEASURED at z = -8.66 through a wall at -2.09, i.e. the exact wall ghosting the
    // Phase 2 gate forbids. It still collides with the world and with other objects.
    entity.collider.setCollisionGroups(GROUP_PRESETS.objectHeld);
    // A hand resists the object turning in it — see GRIP.heldAngularDamping.
    entity.body.setAngularDamping(GRIP.heldAngularDamping);
    // Holding must wake the body, or a settled box ignores the first tug (§7.3 sleeping).
    entity.body.wakeUp();

    if (this.bus) {
      this.bus.emit(EVENTS.GRIP_STARTED, {
        playerId, hand, entityId: entity.id, localPoint: { ...localPoint },
      }, simTimeMs);
    }
    return grip;
  }

  release(hand, reason = 'released', simTimeMs = 0) {
    const grip = this.grips[hand];
    if (!grip) return null;
    this.grips[hand] = null;

    const entity = this.registry.get(grip.entityId);
    if (entity) {
      entity.state.grips = entity.state.grips.filter(
        (g) => !(g.hand === hand && g.playerId === grip.playerId));
      entity.state.held = entity.state.grips.length > 0;
      /* Do NOT restore player collision here. A held object may be overlapping the player
       * capsule — it has been ignoring it — and switching the group back while overlapped
       * hands the solver a deep penetration to resolve in a single step. MEASURED: a
       * dropped box left at exactly SIM.maxLinearVelocity, 40 m/s, i.e. it was clamped on
       * the way out and still shot across the room.
       *
       * So it stays non-colliding with players until it is geometrically clear, which
       * _restoreClearedObjects() checks each step. Until then the only cost is that you can
       * walk through a box you just put down, for a fraction of a second. */
      if (!entity.state.held) {
        entity.state.awaitingPlayerClearance = true;
        entity.body.setAngularDamping(entity.def.physics.angularDamping);
      }
    }
    if (this.bus) {
      this.bus.emit(EVENTS.GRIP_ENDED, {
        playerId: grip.playerId, hand, entityId: grip.entityId, reason,
      }, simTimeMs);
    }
    this.lastRelease = { hand, reason, entityId: grip.entityId };
    return { ...grip, reason };
  }

  releaseAll(reason = 'released', simTimeMs = 0) {
    for (const h of HANDS) if (this.grips[h]) this.release(h, reason, simTimeMs);
  }

  /** Let go of ONE entity, whichever hands are on it (M15; §18.3). The registry calls this
   *  through main.js before it teleports a held body out of the void — reason 'lost', so
   *  the run record can tell a recovery's release from a slip or a tear. Returns how many
   *  grips let go (0 when this mover was not holding it). */
  releaseEntity(entityId, reason = 'lost', simTimeMs = 0) {
    let n = 0;
    for (const h of HANDS) {
      const g = this.grips[h];
      if (g && g.entityId === entityId) { this.release(h, reason, simTimeMs); n++; }
    }
    return n;
  }

  /** The §6.2 force cap for ONE of this mover's hands on `entity`: every multiplier §6.2
   *  names (brace, hand count, wet surface, the object's own grip, §5.2 exertion), min'd
   *  against the GRIP.maxAccel half of the §6.4 bound, then split between this mover's
   *  hands so two hands do not silently double the cap on top of the two-hand bonus. One
   *  function, so step() and towSpeedLimit() can never disagree about how strong a hand is.
   *  `fresh` skips the §5.2 exertion penalty: the RESTED cap, which is what exertion itself
   *  is measured against (see step()). It has to be computed here rather than by dividing
   *  the tired cap back out, because the acceleration half of the min() does not scale with
   *  strength — for a 9 kg box (225 N against 750) the division would inflate the reference
   *  by 1/strengthFraction and a tired mover would under-register exertion on light loads.
   *
   *  TWO M27 FACTORS, and they enter at different places on purpose.
   *  `this.assist` (§6.5) multiplies forceCap — it is STRENGTH, so it is inside the min() and
   *  the acceleration half never moves: an assist cannot make a hand FASTER, for the same
   *  reason brace and hand count do not (see GRIP.maxAccel), and it therefore does nothing at
   *  all to a light box, which is acceleration-limited.
   *  `pressure` (§4.3, 0..1 from the trigger) scales the RESULT — how hard the hand is closed
   *  limits everything the hand can do, the acceleration half included, and it is the only way
   *  a feathered trigger on a 9 kg box can be felt at all (the box's cap is 225 N of
   *  mass x maxAccel against 750 N of strength, so scaling strength alone would be inert until
   *  the trigger was under 0.30 — below the floor, i.e. never). At pressure 1 and assist 1 both
   *  are exact identities in IEEE-754 (x * 1 === x), which is what lets m34 T1 assert this
   *  method unchanged to the bit against the pre-M27 formula. */
  capPerHand(entity, hands, brace, fresh = false, pressure = 1) {
    const G = this.tuning;
    let strength = G.forceCap * this.assist * (entity.def.grip.forceMult || 1);
    if (brace) strength *= G.braceForceMult;
    if (hands > 1) strength *= G.twoHandForceMult;
    if (entity.state.wet) strength *= G.wetGripMult;
    // §5.2: sustained overload "may reduce maximum force". Never to zero — exertion makes
    // a hard hold harder to keep, which is what motivates a partner or a tool, and is
    // explicitly not a stamina bar that forbids the attempt.
    if (this.player && !fresh) strength *= this.player.strengthFraction;
    /* A hand is limited by how fast it can MOVE as well as how hard it can pull. Without
     * the acceleration term, 750 N on a 9 kg box is 8.5 g and a dropped box leaves at
     * 17 m/s. Brace and hand count buy strength, not hand speed, so they do not raise
     * this half. See GRIP.maxAccel. */
    return (Math.min(strength, entity.def.mass * G.maxAccel) * pressure) / Math.max(1, hands);
  }

  /**
   * How fast this mover may walk without tearing what they are holding, m/s.
   *
   * Phase 6 derived this as omega x band x safety — a towed object trails the hand by
   * v/omega — and it gave a couch 1.22 m/s, a fridge 1.10 and a 9 kg box 3.85. Two things
   * were wrong with it, and Phase 11 M7 measured both. That lag is the UNDAMPED figure; at
   * critical damping against the world the real steady lag was F_f/k + 2*zeta*v/omega, and
   * a couch could follow a hand no faster than 0.137 m/s before the band tore. And it knew
   * nothing about friction, which is the whole difference between a couch on the floor and
   * the same couch on a dolly.
   *
   * With the damping computed in the HAND's frame (step(), M10) the steady lag has NO
   * velocity term at all: an object moving with the hand feels no damping, and the spring
   * holds exactly the floor friction, s = F_f / k_eff. MEASURED (tools/_probe-drag.js): two
   * movers towed the couch at 2.0 m/s with 0.35 m of stretch, a dolly at 2.6 m/s with 0.24 —
   * speed adds nothing to the lag. What is left of the band after friction,
   * margin = band - F_f / k_eff, is spent on TRANSIENTS, and the band therefore limits how
   * fast the hand may ACCELERATE, not how fast it may go:
   *
   *   ramp   — a hand accelerating at a holds the object m x a / k_eff behind its rest lag
   *            (the critically damped system's steady offset under a constant drive), so
   *            a_tow = margin x k_eff / m x GRIP.towAccelSafety. Handed to the legs as
   *            PlayerController.towAccelLimit, which only ever slows SPEEDING UP: stopping
   *            compresses the spring and cannot tear it.
   *   step   — legs at full PLAYER.acceleration with the object at rest (a grab on the
   *            move, a partner letting go): the lag they accumulate before the object,
   *            at a_obj = (cap - F_f) / m, catches up is v^2 / 2 x (1 / a_obj - 1 / a_hand),
   *            so v_hand = sqrt(2 x margin / (1 / a_obj - 1 / a_hand)) x GRIP.towSpeedSafety.
   *            An object that out-accelerates the legs (a 9 kg box: 17 vs 28 m/s^2 only
   *            0.023 s^2/m apart) is never speed-capped by it — measured, a box run at
   *            5.4 m/s stretches 0.35 of the 0.70 band; the pure-step form v^2 / 2 a_obj
   *            capped that box at 2.99 m/s, under walking pace, for nothing.
   *
   * Without the ramp cap the legs jump to walk speed in one step, the hand-frame term
   * feeds the whole velocity gap forward, the force pins at the 750 N cap, the pull
   * overshoots, and the couch inches along in a limit cycle at 0.25-0.5 m per 3 s with §5.2
   * exertion draining the cap under friction (measured, first probe run). With it the force
   * settles near 552 N and the couch follows.
   *
   * v_hand bounds the HAND, and the hand is the body minus the pull: §6.2's reaction hauls
   * the mover back toward what they drag at (F_f x my share - traction) / (PLAYER.mass x
   * CARRY.pullDamping) once the legs' budget is spent (CARRY.tractionN), so the walk the
   * legs are allowed is v_hand plus that haul-back. Without the second term the cap sat
   * under the pull and a lone mover stalled against the couch at any traction under 467 N.
   *
   * An object the hand cannot slide at all — floor friction beyond the band (the fridge:
   * 745 N against 630) or beyond the cap (a tired mover's, §5.2) — has no tow speed; it
   * gets GRIP.towSpeedFloor, a crawl. NOT zero (§2.1: the mover is never immobilised by what
   * they hold) and not the old 1.10 m/s either: walking away from a 110 kg fridge that will
   * not move hands it the full feed-forward at once, and the pull then stalls the mover at
   * CARRY.tractionN + 250 N x walk. At 1.10 m/s that is 625 N at chest height, which tips
   * the fridge over (M7 measured it, 1.24 m on its side); at the crawl it is ~390 N (450 N
   * braced after 10 s), under the ~460 N that tipping it needs. m6 B6/B10b pin both halves.
   */
  towLimits(brace = false) {
    let speed = Infinity, accel = Infinity;
    const seen = new Set();
    for (const hand of HANDS) {
      const grip = this.grips[hand];
      if (!grip || seen.has(grip.entityId)) continue;
      seen.add(grip.entityId);
      const entity = this.registry.get(grip.entityId);
      if (!entity) continue;
      const t = this.towFor(entity, brace);
      if (t.speed < speed) speed = t.speed;
      if (t.accel < accel) accel = t.accel;
    }
    return { speed, accel };
  }

  /** Walk-speed cap only, for callers that predate towLimits(). */
  towSpeedLimit(brace = false) { return this.towLimits(brace).speed; }

  /** The derivation above for one held object (see towLimits). Exposed so a suite can
   *  quote the numbers for an object; every intermediate is returned for the debug overlay. */
  towFor(entity, brace = false) {
    const G = this.tuning;
    // The band the lag is measured against is wider braced (GRIP.braceStretchMult).
    const band = G.maxStretch * (brace ? G.braceStretchMult : 1);
    const hands = Math.max(1, this.handsOn(entity.id));
    const allHands = Math.max(hands, entity.state.grips.length);
    const mass = entity.def.mass;
    const kEff = G.spring * allHands;
    const frictionN = effectiveFloorFriction(entity, this.physics.R, G);
    /* Every hand on the object, at this mover's per-hand cap (a partner's is assumed equal),
     * at the pressure this mover's hands are actually closed to (M27; 1 for a keyboard seat,
     * an unattended mover and every fixture, so every number this function has ever printed is
     * unchanged). A feathered hold that can no longer beat floor friction takes the existing
     * `towable === false` path to GRIP.towSpeedFloor — the crawl, not a stop (§2.1). */
    const capTotal = this.capPerHand(entity, hands, brace, false, this.gripPressureOn(entity.id)) * allHands;
    const margin = band - frictionN / kEff;
    const towable = margin > 0 && capTotal > frictionN;
    if (!towable) {
      return { speed: G.towSpeedFloor, accel: Infinity, towable, frictionN, capTotal, margin, vHand: 0, haulBack: 0 };
    }
    const aObj = (capTotal - frictionN) / mass;
    const inv = 1 / aObj - 1 / PLAYER.acceleration;
    const vHand = inv > 0 ? Math.sqrt((2 * margin) / inv) * G.towSpeedSafety : Infinity;
    const accel = ((margin * kEff) / mass) * G.towAccelSafety;
    const traction = this.player ? this.player.tractionN(brace) : 0;
    const myShare = frictionN * (hands / allHands);
    const haulBack = Math.max(0, myShare - traction) / (PLAYER.mass * CARRY.pullDamping);
    return { speed: vHand + haulBack, accel, towable, frictionN, capTotal, margin, vHand, haulBack };
  }

  /** How many hands (of this player) are on a given entity. §6.2's hand-count factor. */
  handsOn(entityId) {
    let n = 0;
    for (const h of HANDS) if (this.grips[h] && this.grips[h].entityId === entityId) n++;
    return n;
  }

  /** One fixed step. Applies each grip's force and resolves slip and stretch. */
  step(stepMs, { brace = false, simTimeMs = 0 } = {}) {
    /* NOTE: clearForces() used to live here, and with one mover that was fine. It is now
     * hoisted into the step order in main.js, because with TWO movers on one couch the
     * second grip system would clear the first one's force every step and only the last
     * mover to run would ever be felt. That is the quiet, plausible-looking version of
     * §6.4's "two clients" failure, and it would have looked like "the other mover isn't
     * helping" rather than like a bug. Forces are cleared once per step, before any mover
     * applies one. */

    const frame = this.aim();   // frame.origin is the SHOULDER, not the camera (see aim())
    this.hovered = (this.grips.left || this.grips.right) ? null : this.probe();

    /* §6.2's last factor: the object pulls back. Every force a hand puts INTO an object has
     * an equal and opposite reaction on the mover, and accumulating it here is what turns
     * "this object is 90 kg" from a number into something the player feels through the
     * controls. Summed across hands, handed to the body at the end of the step. */
    let reactionX = 0, reactionZ = 0;
    /* How much weight the mover is actually SUPPORTING — the sum of the upward force the
     * hands are applying, expressed as a mass.
     *
     * Charging the object's full mass would be wrong, and measurably so: dragging a couch
     * along the floor loads the mover with almost nothing, because the FLOOR is holding it
     * up and the hands only supply horizontal force. Billing the full 90 kg made imbalance
     * reach the knockdown threshold in 1.5 s, so every attempt to drag ended with the mover
     * flat on their back — which is exactly the hard denial §2.1 and the Phase 3 gate
     * forbid, arriving by the back door.
     *
     * Supporting-force is also just the better model: it makes §6.3's "one drags or pivots"
     * true for free. Dragging is sustainable; lifting the same object is not. */
    let supportedN = 0;

    /* §6.2 "Brace state raises force cap and stability" — for a one-hand couch the cap
     * (grip.js below) never bound, because the tear at spring x maxStretch = 630 N came
     * first. Braced, the band widens (GRIP.braceStretchMult), and it is the band, not the
     * cap, that decides whether a heavy drag survives a bump. */
    const G = this.tuning;
    const tearAt = G.maxStretch * (brace ? G.braceStretchMult : 1);
    const dt = stepMs / 1000;

    for (const hand of HANDS) {
      const grip = this.grips[hand];
      if (!grip) continue;
      const entity = this.registry.get(grip.entityId);
      if (!entity) { this.release(hand, 'object gone', simTimeMs); continue; }

      const body = entity.body;
      const gripWorld = localToWorld(body, grip.localPoint);

      // Hand target: the stored view-relative offset, rebuilt against the current aim.
      // The per-hand lateral offset means two hands pull at two SEPARATED points, which is
      // what makes a two-handed hold resist twisting rather than merely doubling the force
      // (§6.2 "two hands improve control").
      const target = this.handTarget(grip, frame);

      /* THE HAND'S OWN VELOCITY — Phase 11 M10, and the reason a solo couch drag travels.
       *
       * Until now the damping term was c * vp: the object's ABSOLUTE velocity. Correct for a
       * held box swinging about a still hand, and wrong for towing, where the object is
       * SUPPOSED to move: a couch following a hand at v carried a viscous brake of c * v
       * against the world on top of its 552 N of floor friction, and with c = 569 N.s/m and
       * 630 N in the band it could follow no faster than 0.137 m/s. M7 measured 0.00 m in
       * 3 s and a traction budget could only tear the hold or topple the fridge. Damping the
       * RELATIVE velocity (vp - vHand) is the spring a hand actually is — a damper between the
       * hand and the object, not between the object and the floor. At rest vHand is zero and
       * the maths is identical to before; towing, the brake is gone and the same term now
       * pulls the object up to hand speed instead of holding it back.
       *
       * The velocity is a finite difference of the target over the step, and the target is
       * noisy in two ways this guards against: a fresh grab (the rig is still settling —
       * GRIP.handVelWarmupSteps), and a target JUMP (a fixture teleport, a violent whip of
       * the mouse; M1 recorded a 0.46 m camera lag after a 40 m teleport). A jump larger
       * than GRIP.handJumpReset zeroes the estimate and restarts the warm-up; anything smaller
       * is clamped to GRIP.maxHandSpeed, so the most a flick can feed forward is c * that,
       * which the §6.4 cap below bounds like any other demand. */
      let vHand = ZERO;
      const dx = grip.lastTarget ? target.x - grip.lastTarget.x : 0;
      const dy = grip.lastTarget ? target.y - grip.lastTarget.y : 0;
      const dz = grip.lastTarget ? target.z - grip.lastTarget.z : 0;
      const jump = Math.hypot(dx, dy, dz);
      if (!grip.lastTarget || jump > G.handJumpReset) {
        // A REFERENCE step — the grab, or a jump. It and the next handVelWarmupSteps - 1
        // steps read zero; the same window either way, so a fixture can count on it.
        grip.handSteps = 0;
      } else {
        grip.handSteps++;
        if (grip.handSteps >= G.handVelWarmupSteps) {
          const speed = jump / dt;
          const k = speed > G.maxHandSpeed ? G.maxHandSpeed / speed : 1;
          vHand = { x: (dx / dt) * k, y: (dy / dt) * k, z: (dz / dt) * k };
        }
      }
      grip.lastTarget = target;
      grip.lastHandSpeed = Math.hypot(vHand.x, vHand.y, vHand.z);

      const err = { x: target.x - gripWorld.x, y: target.y - gripWorld.y, z: target.z - gripWorld.z };
      const stretch = Math.hypot(err.x, err.y, err.z);
      grip.lastStretch = stretch;

      // ANTI-GHOSTING. The object is behind a wall the player has walked past; it cannot
      // follow. Let go rather than letting the spring wind up and fire it through.
      if (stretch > tearAt) {
        this.release(hand, 'pulled out of reach', simTimeMs);
        continue;
      }

      // Damped spring, evaluated against the velocity AT THE GRIP POINT, not the body
      // centre — otherwise a spinning object reads as stationary and the damping term
      // fights nothing.
      const vp = velocityAtPoint(body, gripWorld);

      /* TWO HAND COUNTS, AND THEY ARE NOT THE SAME NUMBER.
       *
       * `hands` is MY hands on this object. It scales MY strength, and divides MY budget
       * between my own hands. A partner's grip must not do either: nobody gets stronger
       * because someone else grabbed the other end.
       *
       * `allHands` is every hand on the object, mine and theirs. The spring system acting
       * on the body is the sum of all of them, so the damping derivation has to see the
       * total or it is solving the wrong system. Phase 3 could not tell these apart — with
       * one mover they are equal — and Phase 4 inherited the conflation as a real bug: two
       * movers each derived damping for a single-hand spring while the body actually had
       * two, leaving the pair overdamped by sqrt(2) and the couch feeling like treacle. */
      const hands = this.handsOn(grip.entityId);
      const allHands = Math.max(hands, entity.state.grips.length);

      /* Damping is derived from the RATIO, per object, per hand. Critical damping is
       * 2*sqrt(k*m), so a fixed coefficient is only ever correct for one mass — measured
       * at a flat 60 N.s/m the damping ratio was 0.33 for a 9 kg box and 0.11 for a 90 kg
       * couch, i.e. increasingly underdamped the heavier the object. With N hands the
       * effective stiffness is N*k, so the critical coefficient is computed against that
       * and then split between the hands. */
      const mass = entity.def.mass;
      const kEff = G.spring * allHands;
      const cPerHand = (2 * G.dampingRatio * Math.sqrt(kEff * mass)) / allHands;

      // Damping in the HAND's frame (see vHand above). GRIP.handFrameDamping is 1 in
      // production; 0 reproduces the Phase 2-10 world-frame term for a before/after probe.
      const w = G.handFrameDamping;
      let fx = G.spring * err.x - cPerHand * (vp.x - w * vHand.x);
      let fy = G.spring * err.y - cPerHand * (vp.y - w * vHand.y);
      let fz = G.spring * err.z - cPerHand * (vp.z - w * vHand.z);

      /* §6.2's factors, all as multipliers on STRENGTH — the bound §6.4 demands — then the
       * GRIP.maxAccel half of it, split between this mover's hands. See capPerHand().
       *
       * §4.3's TRIGGER (M27) is read HERE, inside the per-hand loop, not once at the grab: the
       * cap follows the finger, so easing off lowers it on the very next step and the object
       * sags in the hand. An overloaded hand then takes the slipThreshold/slipMs path four
       * lines down, which is the failure mode this already had — there is no new event and no
       * new way to lose a grip, only a new reason to reach the old one. */
      const pressure = this.handPressure(hand);
      grip.lastPressure = pressure;
      const cap = this.capPerHand(entity, hands, brace, false, pressure);

      // DEMAND vs APPLIED. lastForce used to record the pre-clamp demand and was then
      // used to assert §6.4's bound — which is meaningless, since demand is unbounded by
      // construction (4001 N was observed against a 750 N cap while the clamp was working
      // perfectly). The bound is about what reaches the body, so record both.
      const mag = Math.hypot(fx, fy, fz);
      grip.lastDemand = mag;
      if (mag > cap) {
        const k = cap / mag;
        fx *= k; fy *= k; fz *= k;
      }
      grip.lastApplied = Math.hypot(fx, fy, fz);

      // §6.2 "grip loss": demand pinned at the cap means the hand is losing it. Slipping
      // after a moment is the feedback §2.1 asks for — "show why an attempt struggles" —
      // instead of an object that simply refuses to move for no visible reason.
      if (mag > cap * G.slipThreshold) grip.overloadMs += stepMs;
      else grip.overloadMs = Math.max(0, grip.overloadMs - stepMs * 2);
      if (grip.overloadMs > G.slipMs) {
        this.release(hand, 'slipped', simTimeMs);
        continue;
      }

      body.addForceAtPoint({ x: fx, y: fy, z: fz }, gripWorld, true);

      // Equal and opposite, horizontal only: the vertical reaction is what the mover's legs
      // are for, and feeding it in would have them sink into the floor.
      reactionX -= fx;
      reactionZ -= fz;
      // Only UPWARD force counts as supporting weight; pushing down on something does not
      // tire your back in the way this models.
      if (fy > 0) supportedN += fy;

      /* §5.2: working near the cap is what "exertion" means — near the FRESH cap, not the
       * tired one. Measured against the cap that exertion had already lowered, the rule fed
       * back on itself: any hold above 75% of full strength dropped the reference, which put
       * the same hold further over the line, which dropped it again — 3.3 s from rested to
       * the 60% floor, whatever the load. For a solo couch (552 N against a 750 N cap, 74%)
       * that meant the cap sank UNDER floor friction inside three seconds of towing and the
       * tow cap fell to the crawl: measured 0.27 m in 3 s and 0.36 m in 10 s (M10 probe).
       * Against the fresh cap the same tow never exerts and a genuine overload settles where
       * the tired cap meets the line (strengthFraction 0.75), still "never to zero". The
       * fresh cap is capPerHand(..., fresh) — the same min() with the penalty left out — not
       * the tired cap divided back up, which is only the same thing when strength won the
       * min (see capPerHand).
       *
       * NO `pressure` HERE, deliberately (M27). The reference is what RESTED MUSCLES could do,
       * and a player who chooses to feather the trigger is not working near that — they are
       * applying less force, not straining harder. Passing the pressure in would have made a
       * deliberately light hold read as a 100%-of-cap effort and tire the mover for holding
       * something gently, which is the opposite of what §6.5's assist row is for. A feathered
       * hand still SLIPS (the overload test above is against its own live cap); it just does
       * not also get tired. This call is therefore byte-identical to the pre-M27 one. */
      if (this.player && grip.lastApplied > this.capPerHand(entity, hands, brace, true) * CARRY.exertAt) {
        this.player.noteExertion(stepMs);
      }
    }

    if (this.player) {
      // brace goes through: the legs anchor more of the reaction (CARRY.braceTractionN)
      // and the wider band raises what the mover may tow at (GRIP.braceStretchMult).
      this.player.applyCarry(supportedN / 9.81, reactionX, reactionZ, stepMs, brace);
      const tow = this.towLimits(brace);
      this.player.towSpeedLimit = tow.speed;
      this.player.towAccelLimit = tow.accel;
    }

    // §7.3's caps apply to whatever the grips just did.
    this.registry.clampVelocities();
  }

  /** Convenience for a single-mover caller. The real work is the module-level helper,
   *  because clearance depends on EVERY mover, not just the one that let go. */
  _restoreClearedObjects() {
    restoreClearedObjects(this.registry, this.player ? [this.player] : []);
  }

  /** Wire the body's forced-release hook, so being knocked down drops the load. §5.1's
   *  ragdoll entry is a consequence, and dropping the couch on yourself is the point. */
  attachTo(player) {
    this.player = player;
    player.onForcedRelease = (reason) => this.releaseAll(reason);
    return this;
  }

  /** For the HUD and the debug overlay. */
  status() {
    const of = (h) => {
      const g = this.grips[h];
      if (!g) return null;
      return {
        entityId: g.entityId,
        demand: Math.round(g.lastDemand),
        force: Math.round(g.lastApplied),
        stretch: +g.lastStretch.toFixed(3),
        handSpeed: +(g.lastHandSpeed || 0).toFixed(2),
        slipping: g.overloadMs > 0,
      };
    };
    return { left: of('left'), right: of('right'), hovered: this.hovered ? this.hovered.entity.id : null };
  }
}

/* ── small vector/quaternion helpers ──────────────────────────────────────────
 * Local, because src/physics and src/player must not depend on THREE (§22.4 keeps
 * durable rules separate from presentation). */

/** Rotate v by quaternion q. v' = v + 2*cross(q.xyz, cross(q.xyz, v) + q.w*v) */
export function rotateByQuat(q, v) {
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return {
    x: v.x + q.w * tx + (q.y * tz - q.z * ty),
    y: v.y + q.w * ty + (q.z * tx - q.x * tz),
    z: v.z + q.w * tz + (q.x * ty - q.y * tx),
  };
}

export function conjugate(q) { return { x: -q.x, y: -q.y, z: -q.z, w: q.w }; }

export function localToWorld(body, local) {
  const t = body.translation();
  const r = rotateByQuat(body.rotation(), local);
  return { x: t.x + r.x, y: t.y + r.y, z: t.z + r.z };
}

export function worldToLocal(body, world) {
  const t = body.translation();
  const d = { x: world.x - t.x, y: world.y - t.y, z: world.z - t.z };
  return rotateByQuat(conjugate(body.rotation()), d);
}

/** v_point = v_linear + omega x (point - centreOfMass). Uses the WORLD centre of mass,
 *  which is not the body origin once §7.1's centerOfMassOffset is non-zero. */
export function velocityAtPoint(body, point) {
  const v = body.linvel();
  const w = body.angvel();
  const c = body.worldCom();
  const rx = point.x - c.x, ry = point.y - c.y, rz = point.z - c.z;
  return {
    x: v.x + (w.y * rz - w.z * ry),
    y: v.y + (w.z * rx - w.x * rz),
    z: v.z + (w.x * ry - w.y * rx),
  };
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }

/** What the floor asks of a hand before `entity` slides, in newtons.
 *
 *  Rapier COMBINES the two colliders' coefficients, Average by default (registry.js keeps
 *  it that way on purpose; the dolly switches its load to Min, tools.js), so an object's
 *  declared friction is not what it experiences: the couch declares 0.35 and meets a 0.9
 *  floor at (0.35 + 0.9) / 2 = 0.625 -> 552 N, and the same couch on a dolly at
 *  min(0.04, 0.9) = 0.04 -> 35 N. This reads the collider's CURRENT coefficient and rule —
 *  what the solver will actually apply — against GRIP.towFloorFriction, which mirrors the
 *  ground collider PhysicsWorld.addGround builds (tools/m6-tests.js B11 pins the two equal).
 *  Interior floors are 0.8 (addStaticFromColliders), so indoors this is 3-4% pessimistic,
 *  which is the safe side of a tear. */
export function effectiveFloorFriction(entity, R, tuning = GRIP) {
  const col = entity.collider;
  const mu = col.friction();
  const floor = tuning.towFloorFriction;
  const rules = R && R.CoefficientCombineRule;
  const rule = rules && col.frictionCombineRule ? col.frictionCombineRule() : null;
  let muEff;
  if (rules && rule === rules.Min) muEff = Math.min(mu, floor);
  else if (rules && rule === rules.Max) muEff = Math.max(mu, floor);
  else if (rules && rule === rules.Multiply) muEff = mu * floor;
  else muEff = (mu + floor) / 2;
  return muEff * entity.def.mass * -SIM.gravity;
}

/* ── shared, mover-count-agnostic helpers ─────────────────────────────────────
 * These take the movers as an argument rather than living on one GripSystem, because a
 * dropped object's safety depends on ALL of them. §22.4: "no hidden singleton ownership
 * of objects" — the same reasoning applies to the code that reasons about them.
 */

/** Give a dropped object its player collision back, but only once it is clear of EVERY
 *  mover. Restoring it while still overlapping hands the solver a one-step depenetration —
 *  measured 40 m/s. With two movers, checking only the one that let go is not enough: the
 *  other one may be standing exactly where the box was put down. */
export function restoreClearedObjects(registry, movers) {
  if (!movers || !movers.length) return;
  for (const entity of registry.entities.values()) {
    if (!entity.state.awaitingPlayerClearance || entity.state.held) continue;
    const t = entity.body.translation();
    const d = entity.def.dimensions;
    // Half-DIAGONAL, not half-width: the object may be rotated, so its corner reaches
    // sqrt(x^2+z^2)/2 from the centre. Using half-width declared a box clear at exactly the
    // distance its corner was still touching, and that produced a 7.3 m/s shove.
    const halfDiag = Math.hypot(d.x, d.z) / 2;
    let clearOfAll = true;
    for (const m of movers) {
      const p = m.position;
      const horiz = Math.hypot(t.x - p.x, t.z - p.z);
      const verticallyApart =
        (t.y + d.y / 2) < p.y - 0.05 || (t.y - d.y / 2) > p.y + PLAYER.height + 0.05;
      if (!(horiz > PLAYER.radius + halfDiag + 0.20 || verticallyApart)) { clearOfAll = false; break; }
    }
    if (clearOfAll) {
      entity.collider.setCollisionGroups(GROUP_PRESETS.object);
      entity.state.awaitingPlayerClearance = false;
    }
  }
}

/** Every grip on an entity, across all movers — §6.4's "mover count" factor and §14.2's
 *  "shared objects accept forces from all validated grips; no single client permanently
 *  owns a jointly held object". */
export function gripsOn(entity) {
  return entity && entity.state ? entity.state.grips.slice() : [];
}

/** How many DISTINCT movers have a hand on this entity. Two hands from one mover is one
 *  mover; that distinction is what §6.4 means by a second person helping. */
export function moversOn(entity) {
  const ids = new Set();
  for (const g of gripsOn(entity)) ids.add(g.playerId);
  return ids.size;
}
