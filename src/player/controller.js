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
 * STATES (§5.1's table). Phase 1 added grounded, braced, airborne and climbing plus the
 * §18.3 recovery path; Phase 3 adds STUMBLING and RAGDOLL, now that there is something
 * heavy enough to unbalance a mover. `pinned` remains declared and unentered — it needs an
 * object to trap the player under, which arrives with the Phase 5 house.
 *
 * The ragdoll is a TIMED KNOCKDOWN, not a simulated jointed body: the mover is dropped and
 * immobilised for §5.1's 1-3 seconds and then gets up. §5.1 also asks for "physical body;
 * limited crawl/grab", which this does not do. Recorded in KNOWN_ISSUES rather than
 * pretended otherwise — a real ragdoll is Unity-side work (§24.2).
 */

import { PLAYER, RECOVERY, SIM, CARRY } from '../config.js';
import { GROUP_PRESETS } from '../physics/world.js';

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
      R.ColliderDesc.capsule(PLAYER.capsuleHalfHeight, PLAYER.radius)
        .setCollisionGroups(GROUP_PRESETS.player), this.body);

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

    /* ---- Phase 3: carrying a heavy thing (§5.1 stumble, §5.2 exert, §6.2 pull) --------
     * Nothing here ever refuses an action. §25.2's gate is "weight legible without HARD
     * DENIAL" and §2.1 says to "allow awkward solo dragging of objects intended for two
     * players", so every field below expresses weight as COST — slower, less stable, more
     * tiring — and never as a veto. */
    /** Total mass currently held, set each step by the grip system. */
    this.carriedMass = 0;
    /** Horizontal force currently being resisted, N. Set by applyCarry. */
    this.resistedForce = 0;
    /** Velocity the held object is dragging the body at, m/s. §6.2's "pulls players
     *  harder" — this is the single thing that makes weight FELT rather than reported. */
    this.pull = { x: 0, z: 0 };
    /** §5.1 imbalance, 0..1+. Crossing CARRY.stumbleAt is stumbling; CARRY.knockdownAt
     *  puts the mover on the floor. NOT a hit-point bar: it falls fast when comfortable. */
    this.imbalance = 0;
    /** §5.2 exertion, 0..1. Reduces the grip force cap while working hard, recovers
     *  quickly. Explicitly not a stamina bar — it never blocks anything. */
    this.exertion = 0;
    this._downMs = 0;         // remaining knockdown time
    this.knockdowns = 0;
    /** Set by the grip system when it wants the mover to let go (knocked down). */
    this.onForcedRelease = null;
  }

  /** Called by the grip system each step, before step(): how much is being held and what
   *  reaction force the hands are putting into the body. §6.2's factor list ends with the
   *  object pulling back, and this is that. */
  applyCarry(carriedMass, reactionX, reactionZ, stepMs) {
    this.carriedMass = carriedMass;
    // Horizontal force the mover is resisting — what dragging costs, as opposed to what
    // carrying costs. See CARRY.dragForceRef.
    this.resistedForce = Math.hypot(reactionX, reactionZ);
    const dt = stepMs / 1000;
    // The reaction is a force on a body of PLAYER.mass; integrate it as a velocity and let
    // it decay, so a heavy object tugs the mover along rather than teleporting them.
    this.pull.x += (reactionX / PLAYER.mass) * dt;
    this.pull.z += (reactionZ / PLAYER.mass) * dt;
    const decay = Math.max(0, 1 - CARRY.pullDamping * dt);
    this.pull.x *= decay;
    this.pull.z *= decay;
    const sp = Math.hypot(this.pull.x, this.pull.z);
    if (sp > CARRY.maxPullSpeed) {
      const k = CARRY.maxPullSpeed / sp;
      this.pull.x *= k; this.pull.z *= k;
    }
  }

  /** §6.2: carried mass slows the mover. Floored so a heavy object is punishing but never
   *  a full stop — a mover who cannot move at all has been told "no" (§2.1). */
  get loadSpeedMult() {
    // Two costs, not one: weight you are SUPPORTING and force you are RESISTING. A carried
    // couch bills the first; a dragged one bills the second. Without the drag term a mover
    // walks away from what they are pulling at full speed and simply loses it.
    const fromMass = this.carriedMass / CARRY.loadRef;
    const fromDrag = (this.resistedForce || 0) / CARRY.dragForceRef;
    return Math.max(CARRY.minSpeedMult, 1 / (1 + fromMass + fromDrag));
  }

  /** True while §5.1's stumbling state is active. */
  get stumbling() { return this.imbalance >= CARRY.stumbleAt && !this._downMs; }
  get knockedDown() { return this._downMs > 0; }

  /** §5.2: the fraction of full grip strength currently available. Falls while exerted,
   *  recovers fast. Read by the grip system when it computes its cap. */
  get strengthFraction() { return 1 - CARRY.exertForcePenalty * this.exertion; }

  /** Put the mover on the floor (§5.1 ragdoll entry: major impact, or losing balance
   *  entirely). Grips are dropped — that is the consequence, and it is a physical one. */
  knockDown(reason = 'lost balance') {
    if (this._downMs > 0) return false;
    this._downMs = PLAYER.ragdollMinSeconds * 1000 +
      Math.min(1, this.imbalance - CARRY.knockdownAt) * (PLAYER.ragdollMaxSeconds - PLAYER.ragdollMinSeconds) * 1000;
    this.state = LOCOMOTION.RAGDOLL;
    this.imbalance = 0;
    this._vel.x = 0; this._vel.z = 0;
    this.pull.x = 0; this.pull.z = 0;
    this.knockdowns++;
    this.lastKnockdownReason = reason;
    if (this.onForcedRelease) this.onForcedRelease(reason);
    return true;
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

    // §5.1 ragdoll: "physical body; limited crawl/grab; auto or player recovery in 1-3
    // seconds". The recovery timer is real; the physical body is not — the mover is
    // immobilised and dropped rather than simulated as a jointed skeleton. Recorded as a
    // limitation rather than pretended otherwise; a real ragdoll is a Unity-side job (§24.2).
    if (this._downMs > 0) {
      this._downMs -= stepMs;
      this._vel.x = 0; this._vel.z = 0;
      this.velocityY += SIM.gravity * dt;
      this.controller.computeColliderMovement(this.collider, { x: 0, y: this.velocityY * dt, z: 0 },
        undefined, GROUP_PRESETS.player);
      const mv = this.controller.computedMovement();
      const t0 = this.body.translation();
      this.body.setNextKinematicTranslation({ x: t0.x + mv.x, y: t0.y + mv.y, z: t0.z + mv.z });
      this.grounded = this.controller.computedGrounded();
      if (this.grounded && this.velocityY < 0) this.velocityY = 0;
      if (this._downMs <= 0) { this._downMs = 0; this.state = LOCOMOTION.GROUNDED; }
      else this.state = LOCOMOTION.RAGDOLL;
      this._bankStability(stepMs);
      return this.state;
    }

    this._updateBalance(stepMs, intent);

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

    // §6.2: what you are carrying slows you, and §5.1's stumbling reduces control further.
    speed *= this.loadSpeedMult;
    if (this.stumbling) speed *= CARRY.stumbleSpeedMult;

    const targetVx = wx * speed, targetVz = wz * speed;

    // Acceleration is much lower in the air: §5.1 wants responsive ground movement, not
    // helicopter control over a fall.
    let accelPerSec = this.grounded ? PLAYER.acceleration : PLAYER.airAcceleration;
    if (this.stumbling) accelPerSec *= CARRY.stumbleAccelMult;
    const accel = accelPerSec * dt;
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
    // The pull is ADDED to the intended movement rather than replacing it, so a mover
    // dragging something heavy is displaced by it while still steering — §5.1's "the player
    // should not wrestle the avatar", applied to being wrestled by the furniture instead.
    const desired = {
      x: (this._vel.x + this.pull.x) * dt,
      y: this.velocityY * dt,
      z: (this._vel.z + this.pull.z) * dt,
    };
    /* Pass the player's interaction group. The character controller does NOT consult the
     * colliders' own groups by default, so a held object — which has removed PLAYER from
     * its filter precisely so its carrier cannot crush it — was still being shoved by
     * setApplyImpulsesToDynamicBodies. MEASURED: a box put down beside the player left at
     * 7 m/s, and the controller fought every attempt to lift one. Handing the filter in
     * makes the groups authoritative for the controller too. */
    this.controller.computeColliderMovement(this.collider, desired, undefined, GROUP_PRESETS.player);
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
    if (this._downMs > 0) this.state = LOCOMOTION.RAGDOLL;
    else if (this._climb) this.state = LOCOMOTION.CLIMBING;
    else if (!this.grounded) this.state = LOCOMOTION.AIRBORNE;
    else if (this.stumbling) this.state = LOCOMOTION.STUMBLING;
    else if (intent.brace) this.state = LOCOMOTION.BRACED;
    else this.state = LOCOMOTION.GROUNDED;
  }

  /** §5.1 imbalance and §5.2 exertion, both updated once per step.
   *
   *  Imbalance rises from two things: carrying more than is comfortable, and being yanked
   *  sideways by what you are carrying. It falls quickly the moment either eases — §5.1
   *  says recovery is fast, and §5.2 insists heavy work should "motivate a partner or tool,
   *  not idle waiting". Nothing here stops the mover doing anything; it changes how well. */
  _updateBalance(stepMs, intent) {
    const dt = stepMs / 1000;

    let rise = 0;
    if (this.carriedMass > CARRY.comfortableMass) {
      // Linear in how far past comfortable the load is: at twice comfortable, the full rate.
      rise += (this.carriedMass / CARRY.comfortableMass - 1) * CARRY.imbalanceRise;
    }
    rise += Math.hypot(this.pull.x, this.pull.z) * CARRY.imbalanceFromPull;

    // §5.1: braced is explicitly "higher grip and impulse resistance", so bracing is the
    // answer to being unbalanced — it halves what builds up.
    if (intent && intent.brace) rise *= 0.5;

    if (rise > 0) this.imbalance += rise * dt;
    else this.imbalance -= CARRY.imbalanceFall * dt;
    if (this.imbalance < 0) this.imbalance = 0;

    if (this.imbalance >= CARRY.knockdownAt) this.knockDown('overloaded');

    // §5.2 exertion: driven by the grip system through noteExertion(); it decays here.
    if (!this._exertedThisStep) {
      this.exertion -= PLAYER.exertRecoverPerSecond * dt;
      if (this.exertion < 0) this.exertion = 0;
    }
    this._exertedThisStep = false;
  }

  /** Called by the grip system when a hand is working near its cap (§5.2). */
  noteExertion(stepMs) {
    this.exertion += PLAYER.exertDrainPerSecond * (stepMs / 1000);
    if (this.exertion > 1) this.exertion = 1;
    this._exertedThisStep = true;
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
