/* Movable object registry — GDD §7.1, §7.2, §7.3, §22.4.
 *
 * Owns the dynamic rigid bodies and their meshes, and the §7.2 runtime state beside them.
 * Two rules it exists to enforce:
 *
 *   1. ONE RECORD PER ENTITY. The body, the collider, the mesh and the runtime state are
 *      created together and disposed together, so a reset cannot leave a mesh with no body
 *      or a body with no mesh (§26.6: "reset removes transient straps, grips, damage
 *      records, fragments and route state").
 *   2. COLLIDER HANDLE -> ENTITY. A raycast returns a collider; the grip system needs the
 *      entity. Rapier will not do that lookup, so it is kept here rather than rebuilt at
 *      each call site.
 *
 * §22.4 keeps the multiplayer seam open: entity ids are stable strings, and the
 * serializable runtime state is separate from the engine handles. `snapshot()` returns
 * only the serializable half.
 */

import { OBJECT_DEFS, validateDef } from './definitions.js';
import { GROUP_PRESETS } from '../physics/world.js';
import { RECOVERY, SIM } from '../config.js';

let _nextId = 0;

export class ObjectRegistry {
  /** @param {PhysicsWorld} physics @param {THREE.Scene} scene */
  constructor(physics, scene) {
    this.physics = physics;
    this.scene = scene;
    this.entities = new Map();        // entityId -> entity
    this.byCollider = new Map();      // rapier collider handle -> entity
  }

  /**
   * @param {string} defId key in OBJECT_DEFS
   * @param {{x,y,z,yaw}} at
   * @returns {object} the entity
   */
  spawn(defId, at = {}) {
    const def = OBJECT_DEFS[defId];
    if (!def) throw new Error(`unknown object definition "${defId}"`);
    const problems = validateDef(def);
    if (problems.length) throw new Error(`definition "${defId}" is invalid: ${problems.join('; ')}`);

    const R = this.physics.R;
    const THREE = window.THREE;
    const d = def.dimensions;
    const yaw = at.yaw || 0;

    const bodyDesc = R.RigidBodyDesc.dynamic()
      .setTranslation(at.x || 0, at.y || 0, at.z || 0)
      .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })
      .setLinearDamping(def.physics.linearDamping)
      .setAngularDamping(def.physics.angularDamping)
      // §7.3: "use continuous collision only for fast or high-value objects where
      // tunneling is visible." A carried box is exactly that — it gets thrown, and a box
      // that tunnels through the truck floor is the most confusing bug this game can have.
      .setCcdEnabled(true);

    const body = this.physics.world.createRigidBody(bodyDesc);

    const colDesc = R.ColliderDesc.cuboid(d.x / 2, d.y / 2, d.z / 2)
      .setFriction(def.physics.friction)
      .setRestitution(def.physics.restitution)
      .setMass(def.mass);

    // §7.1's centerOfMassOffset. Rapier derives the COM from the collider unless told
    // otherwise, so an off-centre COM has to be set explicitly via mass properties.
    const com = def.centerOfMassOffset || { x: 0, y: 0, z: 0 };
    if (com.x || com.y || com.z) {
      // Inertia for a cuboid, about its own centre; Rapier applies the parallel-axis
      // shift itself once the COM is moved off the collider centre.
      const m = def.mass;
      const ix = (m / 12) * (d.y * d.y + d.z * d.z);
      const iy = (m / 12) * (d.x * d.x + d.z * d.z);
      const iz = (m / 12) * (d.x * d.x + d.y * d.y);
      colDesc.setMassProperties(m, com, { x: ix, y: iy, z: iz }, { x: 0, y: 0, z: 0, w: 1 });
    }

    // §8.3's damage model needs the contact impulse, and §22.5's overlay counts contacts.
    // Enabling it here rather than in Phase 10 means the counter is real from now on.
    colDesc.setCollisionGroups(GROUP_PRESETS.object);
    if (R.ActiveEvents) colDesc.setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS);
    if (colDesc.setContactForceEventThreshold) colDesc.setContactForceEventThreshold(1.0);

    const collider = this.physics.world.createCollider(colDesc, body);

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(d.x, d.y, d.z),
      new THREE.MeshLambertMaterial({ color: def.colour }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    const id = `${def.id}#${_nextId++}`;
    const entity = {
      id,
      defId: def.id,
      def,
      body,
      collider,
      mesh,
      /** §7.2 runtime state — the serializable half. */
      state: {
        id,
        defId: def.id,
        condition: 100,
        grips: [],                 // [{playerId, hand}] — filled by the grip system
        held: false,
        lastStable: { x: at.x || 0, y: at.y || 0, z: at.z || 0 },
        outOfBoundsMs: 0,
        settled: false,
        /** Set on release; cleared once the object is clear of the player. See grip.js. */
        awaitingPlayerClearance: false,
      },
    };

    this.entities.set(id, entity);
    this.byCollider.set(collider.handle, entity);
    return entity;
  }

  get(id) { return this.entities.get(id); }

  /** Map a raycast hit back to an entity. Returns null for static architecture. */
  fromCollider(colliderOrHandle) {
    if (colliderOrHandle == null) return null;
    const handle = typeof colliderOrHandle === 'number' ? colliderOrHandle : colliderOrHandle.handle;
    return this.byCollider.get(handle) || null;
  }

  /** Feet-of-the-object world position, for HUD and zone checks later. */
  positionOf(entity) {
    const t = entity.body.translation();
    return { x: t.x, y: t.y, z: t.z };
  }

  /** Copy body transforms into meshes. Presentation only — runs on the RENDER frame and
   *  never writes to game state (§22.4). */
  syncMeshes() {
    for (const e of this.entities.values()) {
      const t = e.body.translation();
      const r = e.body.rotation();
      e.mesh.position.set(t.x, t.y, t.z);
      e.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }

  /** Per-step bookkeeping: settle detection and §18.3 out-of-bounds recovery for objects.
   *  §12.3 defines "settled" as below velocity thresholds for a dwell, and the same test
   *  serves cargo membership in Phase 7, so it lives here rather than in a later system. */
  step(stepMs) {
    const recovered = [];
    for (const e of this.entities.values()) {
      const v = e.body.linvel(), w = e.body.angvel();
      const speed = Math.hypot(v.x, v.y, v.z);
      const spin = Math.hypot(w.x, w.y, w.z);
      e.state.settled = !e.state.held && speed < 0.08 && spin < 0.15;

      const t = e.body.translation();
      if (e.state.settled && t.y > -1) {
        e.state.lastStable.x = t.x; e.state.lastStable.y = t.y; e.state.lastStable.z = t.z;
      }

      const oob = t.y < RECOVERY.objectFloorY || Math.abs(t.x) > 120 || Math.abs(t.z) > 120;
      e.state.outOfBoundsMs = oob ? e.state.outOfBoundsMs + stepMs : 0;

      /* §18.3 RECOVERY, for objects rather than players — the half of Phase 5's gate that
       * makes "all objects RECOVERABLE" true.
       *
       * §2.2 is the reason this exists at all: "failure becomes state ... a dropped object
       * is now somewhere inconvenient", not gone. An object that falls out of the world and
       * stays gone silently converts a comic mistake into an unwinnable contract, which is
       * a hard fail §12.2 does not permit — it lists four rare cases and this is not one.
       *
       * Recovery is deliberately DULL: it puts the object back on the last spot where it was
       * genuinely settled, with its velocity zeroed. It is not a rescue that undoes damage,
       * and it is not free — Phase 10 will price the callout as a §15.1 fee. Nothing about
       * the object's condition changes here. */
      if (e.state.outOfBoundsMs >= RECOVERY.outOfBoundsGraceSeconds * 1000) {
        this.recover(e);
        recovered.push(e.id);
      }
    }
    return recovered;
  }

  /**
   * Put one object back on its last known good transform (§18.3).
   * Also callable on demand, which is what the Phase 5 suite uses to prove that EVERY
   * object in the manifest can come back rather than only the ones that happened to fall.
   */
  recover(entity) {
    const s = entity.state.lastStable;
    entity.body.setTranslation(
      { x: s.x, y: s.y + RECOVERY.objectRecoveryLiftM, z: s.z }, true);
    // Upright, not the tumbling orientation it left in: a recovered wardrobe lying on its
    // face reads as the recovery being broken.
    entity.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    entity.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    entity.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    entity.body.wakeUp();
    entity.state.outOfBoundsMs = 0;
    entity.state.settled = false;
    entity.state.recoveries = (entity.state.recoveries || 0) + 1;
    return entity;
  }

  /** §7.3's velocity caps apply to grabbable objects too — an object yanked by a grip is
   *  the most likely thing in the game to acquire an absurd velocity. */
  clampVelocities() {
    for (const e of this.entities.values()) {
      const v = e.body.linvel();
      const sp = Math.hypot(v.x, v.y, v.z);
      if (sp > SIM.maxLinearVelocity) {
        const k = SIM.maxLinearVelocity / sp;
        e.body.setLinvel({ x: v.x * k, y: v.y * k, z: v.z * k }, true);
      }
    }
  }

  /** The serializable half only — no bodies, no meshes, no handles (§22.4, §23.4). */
  snapshot() {
    const out = {};
    for (const [id, e] of this.entities) {
      const t = e.body.translation(), r = e.body.rotation();
      out[id] = {
        ...e.state,
        position: { x: t.x, y: t.y, z: t.z },
        rotation: { x: r.x, y: r.y, z: r.z, w: r.w },
      };
    }
    return out;
  }

  remove(id) {
    const e = this.entities.get(id);
    if (!e) return false;
    this.byCollider.delete(e.collider.handle);
    this.scene.remove(e.mesh);
    e.mesh.geometry.dispose();
    e.mesh.material.dispose();
    this.physics.world.removeRigidBody(e.body);   // removes its colliders too
    this.entities.delete(id);
    return true;
  }

  /** §26.6: a reset must leave nothing behind. */
  clear() {
    for (const id of Array.from(this.entities.keys())) this.remove(id);
  }

  get count() { return this.entities.size; }
}
