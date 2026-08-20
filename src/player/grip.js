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

import { GRIP, PLAYER, CARRY } from '../config.js';
import { EVENTS } from '../core/eventBus.js';
import { GROUP_PRESETS } from '../physics/world.js';

export const HANDS = Object.freeze(['left', 'right']);

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

  /** Aim basis — a full orthonormal frame, not just a direction.
   *  The rig owns yaw/pitch; this derives the 3D vectors, because forwardFlat() is
   *  deliberately flattened and cannot aim up or down at a box on the floor. */
  aim() {
    const cp = Math.cos(this.rig.pitch), sp = Math.sin(this.rig.pitch);
    const sy = Math.sin(this.rig.yaw), cy = Math.cos(this.rig.yaw);
    // Matches ThirdPersonCamera's convention: forward is -Z at yaw 0, pitch 0.
    const dir = { x: -sy * cp, y: sp, z: -cy * cp };
    const right = { x: cy, y: 0, z: -sy };
    const up = { x: sy * sp, y: cp, z: cy * sp };    // cross(right, dir)
    const c = this.camera.position;
    return { origin: this.shoulder(), camOrigin: { x: c.x, y: c.y, z: c.z }, dir, right, up };
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
    };
    this.grips[hand] = grip;

    entity.state.grips.push({ playerId, hand });
    entity.state.held = true;
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

  /** How many hands (of this player) are on a given entity. §6.2's hand-count factor. */
  handsOn(entityId) {
    let n = 0;
    for (const h of HANDS) if (this.grips[h] && this.grips[h].entityId === entityId) n++;
    return n;
  }

  /** One fixed step. Applies each grip's force and resolves slip and stretch. */
  step(stepMs, { brace = false, simTimeMs = 0 } = {}) {
    /* Rapier forces PERSIST and COMPOUND until reset — see PhysicsWorld.clearForces for the
     * measurements. Without this line the grip force accumulates every step: measured 60x
     * the intended value after one second, which made §6.4's per-step clamp meaningless and
     * was quietly behind objects flying off. This is the first force applied in the step
     * order, so clearing here clears for everyone. */
    this.physics.clearForces();

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

      const err = { x: target.x - gripWorld.x, y: target.y - gripWorld.y, z: target.z - gripWorld.z };
      const stretch = Math.hypot(err.x, err.y, err.z);
      grip.lastStretch = stretch;

      // ANTI-GHOSTING. The object is behind a wall the player has walked past; it cannot
      // follow. Let go rather than letting the spring wind up and fire it through.
      if (stretch > GRIP.maxStretch) {
        this.release(hand, 'pulled out of reach', simTimeMs);
        continue;
      }

      // Damped spring, evaluated against the velocity AT THE GRIP POINT, not the body
      // centre — otherwise a spinning object reads as stationary and the damping term
      // fights nothing.
      const vp = velocityAtPoint(body, gripWorld);

      const hands = this.handsOn(grip.entityId);

      /* Damping is derived from the RATIO, per object, per hand. Critical damping is
       * 2*sqrt(k*m), so a fixed coefficient is only ever correct for one mass — measured
       * at a flat 60 N.s/m the damping ratio was 0.33 for a 9 kg box and 0.11 for a 90 kg
       * couch, i.e. increasingly underdamped the heavier the object. With N hands the
       * effective stiffness is N*k, so the critical coefficient is computed against that
       * and then split between the hands. */
      const mass = entity.def.mass;
      const kEff = GRIP.spring * hands;
      const cPerHand = (2 * GRIP.dampingRatio * Math.sqrt(kEff * mass)) / hands;

      let fx = GRIP.spring * err.x - cPerHand * vp.x;
      let fy = GRIP.spring * err.y - cPerHand * vp.y;
      let fz = GRIP.spring * err.z - cPerHand * vp.z;

      // §6.2's factors, all as multipliers on STRENGTH — the bound §6.4 demands.
      let strength = GRIP.forceCap * (entity.def.grip.forceMult || 1);
      if (brace) strength *= GRIP.braceForceMult;
      if (hands > 1) strength *= GRIP.twoHandForceMult;
      if (entity.state.wet) strength *= GRIP.wetGripMult;
      // §5.2: sustained overload "may reduce maximum force". Never to zero — exertion makes
      // a hard hold harder to keep, which is what motivates a partner or a tool, and is
      // explicitly not a stamina bar that forbids the attempt.
      if (this.player) strength *= this.player.strengthFraction;

      /* A hand is limited by how fast it can MOVE as well as how hard it can pull. Without
       * the acceleration term, 750 N on a 9 kg box is 8.5 g and a dropped box leaves at
       * 17 m/s. Brace and hand count buy strength, not hand speed, so they do not raise
       * this half. See GRIP.maxAccel. */
      let cap = Math.min(strength, mass * GRIP.maxAccel);

      // Each hand may spend only its share, so two hands do not silently double the cap
      // on top of the two-hand bonus.
      cap /= Math.max(1, hands);

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
      if (mag > cap * GRIP.slipThreshold) grip.overloadMs += stepMs;
      else grip.overloadMs = Math.max(0, grip.overloadMs - stepMs * 2);
      if (grip.overloadMs > GRIP.slipMs) {
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

      // §5.2: working near the cap is what "exertion" means.
      if (this.player && grip.lastApplied > cap * CARRY.exertAt) this.player.noteExertion(stepMs);
    }

    if (this.player) {
      this.player.applyCarry(supportedN / 9.81, reactionX, reactionZ, stepMs);
    }

    this._restoreClearedObjects();

    // §7.3's caps apply to whatever the grips just did.
    this.registry.clampVelocities();
  }

  /** Give a dropped object its player collision back, but only once it is clear of the
   *  player. See release() for why doing it immediately fires the box across the room. */
  _restoreClearedObjects() {
    if (!this.player) return;
    const p = this.player.position;
    for (const entity of this.registry.entities.values()) {
      if (!entity.state.awaitingPlayerClearance || entity.state.held) continue;
      const t = entity.body.translation();
      const d = entity.def.dimensions;
      // Horizontal distance against the capsule radius plus the object's own half-extent;
      // vertical overlap is checked against the capsule's span.
      // Half-DIAGONAL, not half-width: the object may be rotated, so its corner reaches
      // sqrt(x^2+z^2)/2 from the centre. Using half-width declared a box clear at exactly
      // the distance its corner was still touching the capsule, and restoring collision
      // there produced a 7.3 m/s shove. The extra margin is deliberate slack on top.
      const halfDiag = Math.hypot(d.x, d.z) / 2;
      const horiz = Math.hypot(t.x - p.x, t.z - p.z);
      const verticallyApart = (t.y + d.y / 2) < p.y - 0.05 || (t.y - d.y / 2) > p.y + PLAYER.height + 0.05;
      const clear = horiz > PLAYER.radius + halfDiag + 0.20 || verticallyApart;
      if (clear) {
        entity.collider.setCollisionGroups(GROUP_PRESETS.object);
        entity.state.awaitingPlayerClearance = false;
      }
    }
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
