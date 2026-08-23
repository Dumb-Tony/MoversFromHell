/* Physics world — GDD §22.2 (Physics module), §7.3 (stability rules), §22.3 (fixed step).
 *
 * Wraps Rapier3D 0.20.0 (vendored, offline — see assets/lib/NOTICE.md). Nothing outside
 * this module imports Rapier directly: when §24 rebuilds this in Unity, the seam that has
 * to be replaced should be one file, not scattered across every system.
 *
 * §7.3's stability rules are enforced here rather than left to callers:
 *   - fixed step, driven by the GameClock, never by frame time
 *   - capped linear and angular velocity
 *   - sleeping enabled, so settled cargo costs nothing (§10.5)
 *   - compound convex colliders preferred; detailed meshes only for static architecture
 *
 * Rapier init is ASYNCHRONOUS — it decodes an inlined WASM module — so boot is async.
 * That is the one structural cost of using a real solver, and it is paid once at startup.
 */

import { SIM } from '../config.js';

/* Collision groups. Rapier packs an interaction group into one u32: the high 16 bits are
 * MEMBERSHIP (what this collider is) and the low 16 bits are the FILTER (what it will
 * collide with). Two colliders interact only if EACH one's membership is in the other's
 * filter, so excluding on one side is enough.
 *
 * The reason these exist at all is the Phase 2 gate. The player capsule is kinematic and
 * therefore unstoppable; walk into a wall while carrying a box and the box is crushed
 * between an immovable body and a static wall. The solver has to resolve a penetration it
 * cannot resolve, and ejects the box — MEASURED, straight through the wall to z = -8.66,
 * which is exactly the "wall ghosting" the gate forbids. CCD does not help: that is
 * depenetration, not tunnelling.
 *
 * So a HELD object stops colliding with the player that holds it. It still collides with
 * the world and with every other object, so it cannot be dragged through geometry; it
 * simply cannot be squashed by its own carrier any more.
 */
export const GROUPS = Object.freeze({
  WORLD:  0x0001,   // static architecture, ground, ramps
  PLAYER: 0x0002,   // player capsules
  OBJECT: 0x0004,   // movable entities
});

/** Pack a membership + filter pair into Rapier's u32 interaction group. */
export function interactionGroups(membership, filter) {
  return ((membership & 0xffff) << 16) | (filter & 0xffff);
}

export const GROUP_PRESETS = Object.freeze({
  world:      interactionGroups(GROUPS.WORLD,  GROUPS.WORLD | GROUPS.PLAYER | GROUPS.OBJECT),
  player:     interactionGroups(GROUPS.PLAYER, GROUPS.WORLD | GROUPS.PLAYER | GROUPS.OBJECT),
  object:     interactionGroups(GROUPS.OBJECT, GROUPS.WORLD | GROUPS.PLAYER | GROUPS.OBJECT),
  /** Held: everything except the player carrying it. */
  objectHeld: interactionGroups(GROUPS.OBJECT, GROUPS.WORLD | GROUPS.OBJECT),
  /** A TOOL in a mover's hands, which collides with nothing at all.
   *
   *  Deliberately different from objectHeld. A held OBJECT is dragged by a spring and must
   *  still hit walls, or §25.2's Phase 2 gate ("no wall ghosting") stops being true. A
   *  carried tool is KINEMATIC and pinned to the mover's chest, so anything it touches it
   *  shoves: a 1.80 x 1.40 m moving blanket carried through the living room is a snowplough
   *  that rearranges the furniture on its way past. */
  toolCarried: interactionGroups(GROUPS.OBJECT, 0),
});

let RAPIER = null;

/** Load and initialise Rapier once. Safe to await repeatedly. */
export async function initPhysics() {
  if (RAPIER) return RAPIER;
  const R = await import('../../assets/lib/rapier3d-0.20.0/rapier.mjs');
  await R.init();
  RAPIER = R;
  return RAPIER;
}

/** The initialised Rapier namespace, or null before initPhysics() resolves. */
export function getRapier() { return RAPIER; }

export class PhysicsWorld {
  constructor(R = RAPIER) {
    if (!R) throw new Error('initPhysics() must resolve before constructing PhysicsWorld');
    this.R = R;
    this.world = new R.World({ x: 0, y: SIM.gravity, z: 0 });

    // THE determinism line. Rapier must advance by exactly the clock's step, never by a
    // frame delta — §27.2's repeatable test scenes and §19.1's replayable contracts both
    // depend on the same inputs producing the same stack twice.
    this.world.timestep = SIM.stepMs / 1000;

    this.eventQueue = new R.EventQueue(true);
    this.stepCount = 0;

    /** Bookkeeping for the §22.5 overlay: bodies, colliders, constraints, contacts. */
    this.stats = { bodies: 0, colliders: 0, constraints: 0, contacts: 0 };
  }

  /* RAYCASTING AND THE QUERY PIPELINE — MEASURED, 2026-08-19, Rapier 0.20.0.
   *
   * `world.castRay` reads a query pipeline that is ONLY populated by `world.step()`.
   * Consequences, all verified by tools/_rapier-probe.js:
   *   - A cast before the first step returns null, however much geometry exists.
   *   - A collider created this step is invisible to rays until the NEXT step.
   *   - The hit distance is `hit.timeOfImpact`. `hit.toi` is undefined in 0.20, even
   *     though most Rapier examples still use that name.
   *
   * So: primeQueries() after building static geometry, and anything that spawns a body
   * and immediately raycasts against it (Phase 5 props, Phase 6 tools) must wait a step.
   */

  /** Run one step purely to populate the query pipeline, so the first raycast of the
   *  session sees the static world. Called once after the level is built. */
  primeQueries() {
    this.world.step(this.eventQueue);
    this._refreshStats();   // not via step(): priming is not a simulation step and must
                            // not advance stepCount, but the counters must still be real
    return this;
  }

  /* FORCES IN RAPIER PERSIST AND COMPOUND — MEASURED, 2026-08-19, 0.20.0.
   *
   * `addForce` / `addForceAtPoint` do NOT apply for one step. They add to an accumulator
   * that is re-applied on EVERY subsequent step until it is reset, and calling them again
   * adds to it rather than replacing it. Measured on a 10 kg body with a nominal 100 N:
   *
   *   addForce once, 60 steps, no reset             10.0  m/s   (a steady 1 s push)
   *   addForce EVERY step, 60 steps, no reset      312.6  m/s   (compounding, ~60x)
   *   resetForces before each addForce              16.2  m/s   (correct, no compounding)
   *   resetForces AFTER world.step()                10.1  m/s   (does NOT clear it)
   *
   * A per-step clamp on the value passed in is therefore worthless on its own — §6.4's
   * bound was being enforced on a number that was then added to an unbounded running
   * total. Anything that applies a force must call clearForces() first, in the same step.
   */

  /** Zero the accumulated force and torque on every dynamic body. MUST be called each step
   *  BEFORE any system applies forces — see the note above; resetting afterwards does not
   *  work. main.js calls this at the top of the grip system, which is the first thing in
   *  the step order that applies any force. */
  clearForces() {
    this.world.bodies.forEach((body) => {
      if (!body.isDynamic()) return;
      body.resetForces(false);
      body.resetTorques(false);
    });
  }

  /** One fixed step. Called from inside the GameClock's step callback, never elsewhere. */
  step() {
    this.world.step(this.eventQueue);
    this.stepCount++;
    this._clampVelocities();
    this._refreshStats();
    return this.stepCount;
  }

  /** §22.5's overlay counters. Kept out of step() so priming can refresh them too —
   *  otherwise the overlay reads 0 bodies until the first simulation step, and a test that
   *  checks "geometry was built" before stepping sees an empty world that is not empty. */
  _refreshStats() {
    this.stats.bodies = this.world.bodies.len();
    this.stats.colliders = this.world.colliders.len();
    this.stats.constraints = this.world.impulseJoints ? this.world.impulseJoints.len() : 0;
    // NOTE: contacts stays 0 until colliders opt in via ActiveEvents.CONTACT_FORCE_EVENTS.
    // Phase 2 enables it on grabbable objects, because §8.3's damage model needs the
    // impulse. Reporting 0 now is accurate, not broken.
    this.stats.contacts = 0;
    this.eventQueue.drainContactForceEvents(() => { this.stats.contacts++; });
  }

  /** §7.3: "cap maximum impulse, angular velocity, and constraint correction". A single
   *  bad frame — a spawn overlap, a strap snapping — otherwise launches a couch through
   *  the roof at a speed no later system can make sense of. */
  _clampVelocities() {
    const maxL = SIM.maxLinearVelocity, maxA = SIM.maxAngularVelocity;
    this.world.bodies.forEach((body) => {
      if (!body.isDynamic() || body.isSleeping()) return;
      const v = body.linvel();
      const sp = Math.hypot(v.x, v.y, v.z);
      if (sp > maxL) {
        const k = maxL / sp;
        body.setLinvel({ x: v.x * k, y: v.y * k, z: v.z * k }, true);
      }
      const w = body.angvel();
      const sa = Math.hypot(w.x, w.y, w.z);
      if (sa > maxA) {
        const k = maxA / sa;
        body.setAngvel({ x: w.x * k, y: w.y * k, z: w.z * k }, true);
      }
    });
  }

  // ---- static architecture -----------------------------------------------------------

  /** Infinite-ish ground plane. A very large thin cuboid rather than a true half-space, so
   *  the character controller's ground snap has a real surface to find. */
  addGround(size = 200, thickness = 0.4) {
    const R = this.R;
    const body = this.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(0, -thickness / 2, 0));
    const col = this.world.createCollider(
      R.ColliderDesc.cuboid(size / 2, thickness / 2, size / 2).setFriction(0.9)
        .setCollisionGroups(GROUP_PRESETS.world), body);
    return { body, collider: col };
  }

  /** Build static colliders from the scene's shared AABB records (§8.1: the visible
   *  surface and the collider must not disagree, which is why they come from one list). */
  addStaticFromColliders(colliders) {
    const R = this.R;
    const out = [];
    for (const c of colliders) {
      const hx = (c.maxX - c.minX) / 2, hz = (c.maxZ - c.minZ) / 2;
      const base = c.base || 0;
      const hy = (c.top - base) / 2;
      if (hx <= 0 || hy <= 0 || hz <= 0) continue;
      const body = this.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(
        (c.minX + c.maxX) / 2, base + hy, (c.minZ + c.maxZ) / 2));
      /* Per-surface friction, defaulting to the 0.8 of house walls and floors.
       *
       * Added in Phase 7 because a TRUCK DECK is not a carpeted floor. At 0.8 the deck held
       * every item through a §11.3 hard brake — measured, the worst shift in an entirely
       * unstrapped pack was 2 mm — so straps had nothing to improve on and the phase gate
       * was unmeasurable. It was also simply wrong: a plywood or steel deck is slippery,
       * which is exactly why real loads are strapped. */
      const friction = c.friction !== undefined ? c.friction : 0.8;
      const col = this.world.createCollider(R.ColliderDesc.cuboid(hx, hy, hz).setFriction(friction)
        .setCollisionGroups(GROUP_PRESETS.world), body);
      out.push({ body, collider: col, tag: c.tag });
    }
    return out;
  }

  /** A ramp: a cuboid rotated about X. §25.2's Phase 1 gate is "responsive indoors AND ON
   *  RAMP", and §9.1's ramp tool bridges the truck floor height, so a real slope has to
   *  exist before locomotion can be judged. */
  addRamp({ x = 0, y = 0, z = 0, width = 3, length = 6, thickness = 0.25, angleRad = 0.28 } = {}) {
    const R = this.R;
    const q = quatFromAxisAngle(1, 0, 0, angleRad);
    const body = this.world.createRigidBody(
      R.RigidBodyDesc.fixed().setTranslation(x, y, z).setRotation(q));
    const col = this.world.createCollider(
      R.ColliderDesc.cuboid(width / 2, thickness / 2, length / 2).setFriction(0.9)
        .setCollisionGroups(GROUP_PRESETS.world), body);
    return { body, collider: col, angleRad };
  }

  free() {
    if (this.eventQueue) this.eventQueue.free();
    if (this.world) this.world.free();
    this.world = null;
  }
}

/** Quaternion from an axis and angle. Rapier wants {x,y,z,w}; THREE is not imported here
 *  because this module must stay renderer-free (§22.4 separates rules from presentation). */
export function quatFromAxisAngle(ax, ay, az, angle) {
  const len = Math.hypot(ax, ay, az) || 1;
  const s = Math.sin(angle / 2) / len;
  return { x: ax * s, y: ay * s, z: az * s, w: Math.cos(angle / 2) };
}
