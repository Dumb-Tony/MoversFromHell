/* Player locomotion — GDD §5.1 (hybrid character model), §5.2, §4.4, §18.3.
 *
 * §5.1: "Use a responsive locomotion controller coupled to a physical reaction layer. A
 * player capsule or motor owns normal navigation... The player should not wrestle the
 * avatar merely to cross a room."
 *
 * That sentence is the whole design. Normal walking is NOT a dynamic rigid body being
 * pushed around — it is a kinematic capsule moved by Rapier's KinematicCharacterController,
 * which does collide-and-slide, autostep and ground snap. External forces (Phase 3+) then
 * knock the player out of that mode into stumble or ragdoll. Phase 1 builds the controller
 * half; the reaction half arrives when there are impulses to react to.
 *
 * STATES (§5.1's table). Phase 1 enters grounded, braced, airborne and climbing, plus the
 * §18.3 recovery path. `stumbling`, `ragdoll` and `pinned` are declared so the vocabulary
 * is fixed, and are NOT entered yet — nothing can currently apply the impulses that would
 * justify them, and a state that can never be left is worse than one that never starts.
 */

import { PLAYER, RECOVERY, SIM } from '../config.js';

export const LOCOMOTION = Object.freeze({
  GROUNDED:  'grounded',
  BRACED:    'braced',
  AIRBORNE:  'airborne',
  CLIMBING:  'climbing',
  STUMBLING: 'stumbling',   // Phase 3
  RAGDOLL:   'ragdoll',     // Phase 3
  PINNED:    'pinned',      // Phase 5
});

export class PlayerController {
  /**
   * @param {PhysicsWorld} physics
   * @param {{x,y,z}} spawn  feet position
   */
  constructor(physics, spawn = { x: 0, y: 0, z: 0 }) {
    const R = physics.R;
    this.physics = physics;
    this.R = R;

    // Kinematic POSITION based: we tell it where to be, it never gets pushed. The
    // character controller computes a legal movement and we apply the result.
    this.body = physics.world.createRigidBody(
      R.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(spawn.x, spawn.y + PLAYER.height / 2, spawn.z));

    this.collider = physics.world.createCollider(
      R.ColliderDesc.capsule(PLAYER.capsuleHalfHeight, PLAYER.radius), this.body);

    this.controller = physics.world.createCharacterController(PLAYER.characterOffset);
    this.controller.setUp({ x: 0, y: 1, z: 0 });
    this.controller.enableAutostep(PLAYER.stepHeight, PLAYER.stepMinWidth, true);
    this.controller.enableSnapToGround(PLAYER.snapToGroundDist);
    this.controller.setMaxSlopeClimbAngle(PLAYER.maxSlopeClimbDeg * Math.PI / 180);
    this.controller.setMinSlopeSlideAngle(PLAYER.minSlopeSlideDeg * Math.PI / 180);
    this.controller.setSlideEnabled(true);
    // §6.4 bounds player force so co-op cannot create a feedback loop. Phase 1 has nothing
    // to push, but leaving this on from the start means the couch does not surprise us.
    this.controller.setApplyImpulsesToDynamicBodies(true);

    this.velocityY = 0;
    this.state = LOCOMOTION.GROUNDED;
    this.grounded = false;
    this.groundedLastStep = false;

    // §18.3: "track a last-stable transform for players, critical cargo, tools, and
    // vehicle". Banked only while genuinely settled, or recovery teleports you back into
    // the hole you just fell into.
    this.lastStable = { x: spawn.x, y: spawn.y, z: spawn.z };
    this._sinceStableMs = 0;
    this._outOfBoundsMs = 0;
    this.recoveries = 0;

    this._climb = null;   // { fromY, toY, fromX, toX, fromZ, toZ, elapsed, duration }
    this._vel = { x: 0, z: 0 };   // horizontal velocity, m/s
  }

  /** Feet position. The body's translation is its CENTRE, so this is the useful one:
   *  everything in the GDD (clearances, step heights, zone membership) is measured from
   *  the floor up. Getting this wrong makes every height number off by 0.9 m. */
  get position() {
    const t = this.body.translation();
    return { x: t.x, y: t.y - PLAYER.height / 2, z: t.z };
  }

  set position(p) {
    this.body.setNextKinematicTranslation({ x: p.x, y: p.y + PLAYER.height / 2, z: p.z });
  }

  /** Horizontal velocity, m/s. Read by the renderer for gait cadence and by the HUD.
   *  Exposed as accessors so nothing outside this class reaches into a private field. */
  get velocityX() { return this._vel.x; }
  get velocityZ() { return this._vel.z; }
  get horizontalSpeed() { return Math.hypot(this._vel.x, this._vel.z); }

  /** Facing that matches the direction of travel, in the same convention the blockout body
   *  uses: forward is -Z at yaw 0, so forward = (-sin yaw, 0, -cos yaw) and therefore
   *  yaw = atan2(-vx, -vz). Returns null below a threshold, so a stationary player keeps
   *  the facing they had instead of snapping to zero. */
  travelYaw(minSpeed = 0.2) {
    if (this.horizontalSpeed < minSpeed) return null;
    return Math.atan2(-this._vel.x, -this._vel.z);
  }

  /** Teleport immediately, bypassing kinematic interpolation. Spawn and recovery only. */
  hardSetPosition(p) {
    this.body.setTranslation({ x: p.x, y: p.y + PLAYER.height / 2, z: p.z }, true);
    this.velocityY = 0;
    this._climb = null;
  }

  /**
   * One fixed simulation step.
   * @param {number} stepMs
   * @param {{move:{x,y}, forward:{x,y,z}, right:{x,y,z}, run:boolean, brace:boolean,
   *          jump:boolean, recover:boolean}} intent  camera-relative, already resolved
   */
  step(stepMs, intent) {
    const dt = stepMs / 1000;

    if (intent.recover) this.recoverNow('player request');

    if (this._climb) { this._stepClimb(dt); return this.state; }

    // ---- desired horizontal velocity, camera-relative (§4.4) ----
    const f = intent.forward, r = intent.right, m = intent.move;
    let wx = f.x * m.y + r.x * m.x;
    let wz = f.z * m.y + r.z * m.x;
    const wlen = Math.hypot(wx, wz);
    if (wlen > 1) { wx /= wlen; wz /= wlen; }

    // §5.1: braced is slower and steadier; §5.2 makes exert a leverage modifier, not a
    // stamina bar, so brace costs speed and nothing else.
    let speed = intent.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    if (intent.brace) speed = PLAYER.walkSpeed * PLAYER.braceSpeedMult;

    const targetVx = wx * speed, targetVz = wz * speed;

    // Acceleration is much lower in the air: §5.1 wants responsive ground movement, not
    // helicopter control over a fall.
    const accel = (this.grounded ? PLAYER.acceleration : PLAYER.airAcceleration) * dt;
    this._vel.x = approach(this._vel.x, targetVx, accel);
    this._vel.z = approach(this._vel.z, targetVz, accel);

    // ---- mantle BEFORE jump (§5.1 climbing) ----
    // Order matters: jumping clears `grounded`, so testing the mantle afterwards would
    // mean a ledge could never be mantled from standing. Jump and mantle share one button
    // (§4.2 Space / §4.3 A), so the mantle gets first refusal and consumes the press.
    if (intent.jump && this._tryMantle(wx, wz)) {
      return this.state;   // climb started; it owns movement until it finishes
    }

    // ---- vertical ----
    if (this.grounded && this.velocityY <= 0) {
      this.velocityY = -1.0;   // small downward bias keeps snap-to-ground engaged
      if (intent.jump) {
        this.velocityY = PLAYER.jumpVelocity;
        this.grounded = false;
      }
    } else {
      this.velocityY += SIM.gravity * dt;
      if (this.velocityY < -PLAYER.maxFallSpeed) this.velocityY = -PLAYER.maxFallSpeed;
    }

    // ---- ask the controller what movement is actually legal ----
    const desired = {
      x: this._vel.x * dt,
      y: this.velocityY * dt,
      z: this._vel.z * dt,
    };
    this.controller.computeColliderMovement(this.collider, desired);
    const corrected = this.controller.computedMovement();

    this.groundedLastStep = this.grounded;
    this.grounded = this.controller.computedGrounded();
    if (this.grounded && this.velocityY < 0) this.velocityY = 0;

    // A ceiling stops upward motion, or the player sticks to it for the rest of the jump.
    if (!this.grounded && this.velocityY > 0 && corrected.y < desired.y - 1e-6) {
      this.velocityY = 0;
    }

    const t = this.body.translation();
    this.body.setNextKinematicTranslation({
      x: t.x + corrected.x, y: t.y + corrected.y, z: t.z + corrected.z,
    });

    this._updateState(intent);
    this._bankStability(stepMs);
    return this.state;
  }

  _updateState(intent) {
    if (this._climb) this.state = LOCOMOTION.CLIMBING;
    else if (!this.grounded) this.state = LOCOMOTION.AIRBORNE;
    else if (intent.brace) this.state = LOCOMOTION.BRACED;
    else this.state = LOCOMOTION.GROUNDED;
  }

  // ---- mantle ------------------------------------------------------------------------

  /** §5.1 Climbing: "mantle affordance -> short assisted motion -> top reached or
   *  cancelled". Two casts: forward for an obstacle, then down from above it for a ledge.
   *  Returns true if a climb started. */
  _tryMantle(dirX, dirZ) {
    if (this._climb) return false;
    const len = Math.hypot(dirX, dirZ);
    if (len < 0.1) return false;           // must be moving INTO something
    const dx = dirX / len, dz = dirZ / len;

    const R = this.R;
    const feet = this.position;
    const filter = R.QueryFilterFlags ? R.QueryFilterFlags.EXCLUDE_KINEMATIC : undefined;

    // 1. Is there a wall in front, at knee-to-chest height?
    const probeY = feet.y + PLAYER.mantleMinHeight * 0.5;
    const fwdRay = new R.Ray({ x: feet.x, y: probeY, z: feet.z }, { x: dx, y: 0, z: dz });
    const wall = this.physics.world.castRay(
      fwdRay, PLAYER.radius + PLAYER.mantleReach, true, filter, undefined, this.collider);
    if (!wall) return false;

    // 2. Drop a ray from above, just past the obstacle, to find the ledge top.
    const ahead = PLAYER.radius + Math.min(wall.timeOfImpact + 0.25, PLAYER.mantleReach);
    const topStart = { x: feet.x + dx * ahead, y: feet.y + PLAYER.mantleMaxHeight + 0.6, z: feet.z + dz * ahead };
    const downRay = new R.Ray(topStart, { x: 0, y: -1, z: 0 });
    const ledge = this.physics.world.castRay(
      downRay, PLAYER.mantleMaxHeight + 0.8, true, filter, undefined, this.collider);
    if (!ledge) return false;

    const ledgeY = topStart.y - ledge.timeOfImpact;
    const rise = ledgeY - feet.y;
    if (rise < PLAYER.mantleMinHeight || rise > PLAYER.mantleMaxHeight) return false;

    // 3. Headroom: is the space above the ledge actually free? Without this the player
    //    mantles into the underside of a shelf and lands inside geometry.
    const headStart = { x: topStart.x, y: ledgeY + 0.05, z: topStart.z };
    const headRay = new R.Ray(headStart, { x: 0, y: 1, z: 0 });
    const head = this.physics.world.castRay(
      headRay, PLAYER.height, true, filter, undefined, this.collider);
    if (head) return false;

    const target = {
      x: feet.x + dx * (ahead + PLAYER.mantleForwardClear),
      y: ledgeY + 0.02,
      z: feet.z + dz * (ahead + PLAYER.mantleForwardClear),
    };
    this._climb = {
      from: { ...feet }, to: target,
      elapsed: 0, duration: PLAYER.mantleSeconds,
    };
    this.velocityY = 0;
    this.state = LOCOMOTION.CLIMBING;
    return true;
  }

  /** Drive the climb. Deliberately NOT collision-checked while running: the destination
   *  was validated before it started, and letting the controller fight the lerp mid-climb
   *  is what makes mantles in other games feel sticky. */
  _stepClimb(dt) {
    const c = this._climb;
    c.elapsed += dt;
    const t = Math.min(1, c.elapsed / c.duration);
    // Up first, then forward — the shape of an actual mantle, not a diagonal slide.
    const up = Math.min(1, t / 0.6);
    const fwd = Math.max(0, (t - 0.35) / 0.65);
    this.body.setNextKinematicTranslation({
      x: c.from.x + (c.to.x - c.from.x) * easeOut(fwd),
      y: c.from.y + (c.to.y - c.from.y) * easeOut(up) + PLAYER.height / 2,
      z: c.from.z + (c.to.z - c.from.z) * easeOut(fwd),
    });
    if (t >= 1) {
      this._climb = null;
      this.grounded = true;
      this.velocityY = 0;
      this.state = LOCOMOTION.GROUNDED;
      this._vel.x = 0; this._vel.z = 0;
    }
  }

  // ---- §18.3 recovery ----------------------------------------------------------------

  /** Bank a last-known-good transform, but only while genuinely settled. */
  _bankStability(stepMs) {
    const p = this.position;
    const moving = Math.hypot(this._vel.x, this._vel.z) > 0.05;
    if (this.grounded && !moving && !this._climb) {
      this._sinceStableMs += stepMs;
      if (this._sinceStableMs >= RECOVERY.stableTransformIntervalMs) {
        this.lastStable = { x: p.x, y: p.y, z: p.z };
        this._sinceStableMs = 0;
      }
    } else {
      this._sinceStableMs = 0;
    }

    // Out of bounds: below the world, or absurdly far out. §18.3 gives a grace period
    // before offering recovery rather than snatching control away instantly.
    const oob = p.y < -8 || Math.abs(p.x) > 120 || Math.abs(p.z) > 120;
    this._outOfBoundsMs = oob ? this._outOfBoundsMs + stepMs : 0;
    if (this._outOfBoundsMs > RECOVERY.outOfBoundsGraceSeconds * 1000) {
      this.recoverNow('out of bounds');
    }
  }

  /** §18.3: "release unsafe constraints, preserve damage, place at a designated node, and
   *  apply a documented fee". Phase 1 has no constraints or damage to preserve yet — the
   *  fee and the ledger entry arrive with the economy in Phase 10. */
  recoverNow(reason = 'stuck') {
    this.hardSetPosition(this.lastStable);
    this._outOfBoundsMs = 0;
    this._sinceStableMs = 0;
    this._vel.x = 0; this._vel.z = 0;
    this.recoveries++;
    this.lastRecoveryReason = reason;
    return { reason, to: { ...this.lastStable } };
  }
}

/** Move `current` toward `target` by at most `maxDelta`. Frame-rate independent because
 *  the caller scales maxDelta by dt. */
function approach(current, target, maxDelta) {
  const d = target - current;
  if (Math.abs(d) <= maxDelta) return target;
  return current + Math.sign(d) * maxDelta;
}

function easeOut(t) { return 1 - (1 - t) * (1 - t); }
