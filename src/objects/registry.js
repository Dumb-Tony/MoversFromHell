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
import { RECOVERY, SIM, ECONOMY } from '../config.js';
import { EVENTS } from '../core/eventBus.js';
import { buildPrefab } from '../render/prefabs.js';
import { pieceSlots } from '../tools/tools.js';

let _nextId = 0;

/** A pose's rotation as a quaternion: an explicit `rot`, else a yaw about y (M11). */
function rotationOf(pose) {
  if (pose.rot) return { x: pose.rot.x, y: pose.rot.y, z: pose.rot.z, w: pose.rot.w };
  const yaw = pose.yaw || 0;
  return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
}

/* ── §18.3's "where is it" questions, shared with the tool pass (M15) ─────────────────
 *
 * ONE definition of out-of-bounds for every body the game can lose — manifest objects,
 * fixtures, pieces (here) and tools (tools.js ToolSystem.step) — so the two passes cannot
 * disagree about where the world ends. RECOVERY.bounds is derived from the ground the
 * physics built (config.js WORLD.groundSizeM); objectFloorY is the floor of it. */

/** A body's translation, or null when it cannot be trusted: non-finite on any axis (a NaN
 *  that has escaped the solver) or a translation() that throws — the risk note in the M15
 *  plan says not every Rapier build reads a NaN body safely, so the read is guarded. */
export function safeTranslation(body) {
  let t;
  try { t = body.translation(); } catch (e) { return null; }
  if (!t || !Number.isFinite(t.x) || !Number.isFinite(t.y) || !Number.isFinite(t.z)) return null;
  return { x: t.x, y: t.y, z: t.z };
}

/** Outside the play AABB (below the floor, past the ground's edge, above the ceiling). */
export function isOutOfBounds(t, bounds = RECOVERY.bounds, floorY = bounds.minY) {
  return t.y < floorY || t.y > bounds.maxY ||
    t.x < bounds.minX || t.x > bounds.maxX || t.z < bounds.minZ || t.z > bounds.maxZ;
}

export class ObjectRegistry {
  /**
   * @param {PhysicsWorld} physics
   * @param {THREE.Scene} scene
   * @param {EventBus|null} [bus]  for RECOVERY (§27.4 "recovery" is one stream: movers in
   *        main.js, objects here). Null by default — every suite that builds a registry by
   *        hand keeps working, and a registry with no bus simply does not announce.
   * @param {(() => number)|null} [now]  the clock, so the event carries a real simTimeMs
   */
  constructor(physics, scene, bus = null, now = null) {
    this.physics = physics;
    this.scene = scene;
    this.bus = bus;
    this.now = now || (() => 0);
    this.entities = new Map();        // entityId -> entity
    this.byCollider = new Map();      // rapier collider handle -> entity
    /** M15 (§18.3, §26.6): `(entity, reason) => void` — let go of every grip on an entity
     *  BEFORE it is teleported. Set by main.js over the movers' grip systems; null in a
     *  registry built by hand, which then recovers a held body as it always did. Never
     *  teleport a body the spring is pulling: the hand would be metres from the grip point
     *  the next step and the spring would fire the object across the room. */
    this.releaseHolds = null;
  }

  /**
   * @param {string|object} defId key in OBJECT_DEFS — or a definition object itself, for
   *        the DERIVED defs a detached part or a fragment spawns from (definitions.js
   *        pieceDefFor / fragmentDefFor, M12); those pass the same validator.
   * @param {{x,y,z,yaw}} at
   * @param {{manifest?: boolean, state?: object}} [opts]  M11: `manifest: false` marks an
   *        entity that is part of the HOUSE rather than the customer's goods (a door leaf) —
   *        never a manifest row, never counted by the contract panel; `state` is plain data
   *        merged into the §7.2 runtime state at birth ({ doorId, hung, home, rest }).
   * @returns {object} the entity
   */
  spawn(defId, at = {}, opts = {}) {
    const def = typeof defId === 'string' ? OBJECT_DEFS[defId] : defId;
    if (!def) throw new Error(`unknown object definition "${defId}"`);
    const problems = validateDef(def);
    if (problems.length) throw new Error(`definition "${def.id || defId}" is invalid: ${problems.join('; ')}`);

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

    /* AN OBJECT'S DECLARED FRICTION IS NOT WHAT IT EXPERIENCES. Discovered in Phase 6.
     *
     * Rapier COMBINES the two colliders' coefficients, and the default rule is AVERAGE. The
     * ground is 0.9 and the static architecture 0.8, so couch_3seat_01's 0.35 is really an
     * effective (0.35 + 0.9)/2 = 0.625 against the floor. The "309 N of resistance" quoted
     * in its definition is actually 552 N.
     *
     * MEASURED, and this is what found it: 400 N applied to the parked couch moved it 14 mm
     * in two seconds, where 400 N against 309 N should accelerate it at 1 m/s^2.
     *
     * THE RULE IS DELIBERATELY LEFT AT AVERAGE ANYWAY, which needs justifying.
     *
     * Switching every object to Min was tried first, and it is the more principled rule —
     * "how slippery is this contact" really is a property of the smoother surface. But
     * Phases 2 through 5 tuned couch friction, drag force, grip stretch and knockdown
     * thresholds BY MEASUREMENT against the averaged value, so the game is correctly tuned
     * and only the stated interpretation was wrong. Flipping the rule globally re-tuned all
     * of it at once: m2 lost a released box at 40 m/s and m3 lost a grab, both of which had
     * been green for four phases. Correcting a comment is not worth destabilising validated
     * behaviour.
     *
     * The one place it genuinely matters is the dolly, whose entire existence is a friction
     * substitution — and ToolSystem.attachDolly switches THAT object's rule to Min for as
     * long as the dolly is under it. See tools.js for why that is the right scope.
     *
     * When this build is rebuilt in Unity (§24), set the rule to Min from the start and
     * re-tune against it; the numbers in this file will then mean what they say. */

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

    /* The visual is a GROUP of primitives, not the collider drawn as a box (§13.4:
     * "stylized primitive meshes are acceptable; collision-faithful proportions are
     * mandatory"). Every part of it lives inside `def.dimensions`, which m13 asserts for
     * every object in the manifest — a couch whose arms overhang its collider would pass
     * visibly through a door frame it should have caught on, and the doorway is the game. */
    const mesh = buildPrefab(def);
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
      /** false for a fixture (M11): in the world and the registry, never on the manifest. */
      manifest: opts.manifest !== false,
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
        ...(opts.state || {}),
      },
    };

    this.entities.set(id, entity);
    this.byCollider.set(collider.handle, entity);
    return entity;
  }

  /* ── fixtures on and off the house (M11; §8.2 "remove from hinges", "reattach") ─────
   *
   * The same Fixed ↔ Dynamic flip the ramp uses when it is deployed and retrieved
   * (tools.js deployRamp / retrieveRamp): a hung leaf is bolted to its jamb and FIXED is the
   * honest body type — two kinematic bodies generate no contact in Rapier, and the player
   * capsule is kinematic, so a kinematic leaf could be walked through. Nothing about the
   * entity's identity changes: it keeps its id, its collider handle (so a raycast still
   * finds it and the grip can still take hold of it), its mesh and its damage record. */

  /** Pin an entity at `pose` as a FIXED body — a door leaf hung on its hinges. `pose` is
   *  {x, y, z, yaw} (house.js leafPose) or {x, y, z, rot}. Sets state.hung. */
  hang(entity, pose) {
    const R = this.physics.R;
    entity.body.setBodyType(R.RigidBodyType.Fixed, true);
    entity.body.setTranslation({ x: pose.x, y: pose.y, z: pose.z }, true);
    entity.body.setRotation(rotationOf(pose), true);
    entity.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    entity.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    entity.state.hung = true;
    entity.state.settled = false;
    entity.state.outOfBoundsMs = 0;
    entity.state.lastStable = { x: pose.x, y: pose.y, z: pose.z };
    entity.body.wakeUp();
    this.physics.primeQueries();
    return entity;
  }

  /** Take it off: DYNAMIC again, laid at `pose` when one is given (house.js leafRestPose —
   *  flat on the floor beside the doorway, never left balanced on a 40 mm edge to topple
   *  onto whoever unscrewed it), else freed where it stands. Sets state.hung false. */
  unhang(entity, pose = null) {
    const R = this.physics.R;
    entity.body.setBodyType(R.RigidBodyType.Dynamic, true);
    if (pose) {
      entity.body.setTranslation({ x: pose.x, y: pose.y, z: pose.z }, true);
      entity.body.setRotation(rotationOf(pose), true);
      entity.state.lastStable = { x: pose.x, y: pose.y, z: pose.z };
    }
    entity.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    entity.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    entity.state.hung = false;
    entity.state.settled = false;
    entity.body.wakeUp();
    this.physics.primeQueries();
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
      /* A body whose translation cannot be read or is not finite is recovered NOW, with no
       * grace: NaN does not fall further, it spreads — into every contact it touches and
       * every grip that reads it (M15, the plan's risk note). */
      const t = safeTranslation(e.body);
      if (!t) {
        this.recover(e, 'non-finite');
        recovered.push(e.id);
        continue;
      }
      const v = e.body.linvel(), w = e.body.angvel();
      const speed = Math.hypot(v.x, v.y, v.z);
      const spin = Math.hypot(w.x, w.y, w.z);
      e.state.settled = !e.state.held && speed < 0.08 && spin < 0.15;
      // §15.3 "heaviest thing moved": a record of ever having been in a hand. Written nowhere
      // until M6 — heaviestMoved() in main.js tested it and it was always false (M2's note).
      if (e.state.held) e.state.everHeld = true;

      if (e.state.settled && t.y > -1) {
        e.state.lastStable.x = t.x; e.state.lastStable.y = t.y; e.state.lastStable.z = t.z;
      }

      /* A FIXED body is bolted to the house — a door leaf on its hinges (M11). It cannot
       * leave the world, and "recovering" it would unbolt it. The pass skips it (m23 L4). */
      if (e.body.isFixed()) { e.state.outOfBoundsMs = 0; continue; }

      const oob = isOutOfBounds(t, RECOVERY.bounds, RECOVERY.objectFloorY);
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
        this.recover(e, 'out of bounds');
        recovered.push(e.id);
      }
    }
    return recovered;
  }

  /**
   * Put one object back on its last known good transform (§18.3).
   * Also callable on demand, which is what the Phase 5 suite uses to prove that EVERY
   * object in the manifest can come back rather than only the ones that happened to fall.
   * Emits ONE RECOVERY carrying the fee the invoice will bill (ECONOMY.recoveryFee), so the
   * §27.4 "recovery" signal is a single stream with the movers' (main.js) — m17 R4.
   */
  recover(entity, reason = 'out of bounds') {
    // A hung leaf is Fixed at its jamb: nothing to recover, and never unbolted by this (M15).
    if (entity.body.isFixed()) return entity;
    /* THE GRIPS LET GO FIRST (M15, scope 3). A held body's spring is evaluated against the
     * hand every step; teleport the body and the next step sees a stretch of metres and
     * applies a force to match. Under game.frame() the grip's own anti-ghosting tears first
     * ('pulled out of reach', grip.js) because any out-of-bounds point is further than
     * GRIP.maxStretch; this is the path for a recover() invoked while the hand is still on
     * — and the reason is 'lost', so the run record can tell the two apart. */
    if (entity.state.held && typeof this.releaseHolds === 'function') this.releaseHolds(entity, 'lost');

    const pose = this.recoveryPose(entity);
    entity.body.setTranslation({ x: pose.x, y: pose.y, z: pose.z }, true);
    // Upright (or the authored rest/slot rotation), not the tumbling orientation it left in:
    // a recovered wardrobe lying on its face reads as the recovery being broken.
    entity.body.setRotation(pose.rot, true);
    entity.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    entity.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    entity.body.wakeUp();
    entity.state.outOfBoundsMs = 0;
    entity.state.settled = false;
    entity.state.recoveries = (entity.state.recoveries || 0) + 1;
    if (this.bus) {
      this.bus.emit(EVENTS.RECOVERY, {
        entityId: entity.id, reason, fee: ECONOMY.recoveryFee, kind: pose.kind,
        newTransform: { x: pose.x, y: pose.y, z: pose.z },
      }, this.now());
    }
    return entity;
  }

  /**
   * Where a lost body goes back to (M15; §18.3, §26.4 "stuck recovery preserves progress and
   * consequences"). Three answers, by what the body is:
   *
   *   a DOOR LEAF off its hinges  its authored REST pose beside its doorway (state.rest,
   *                               house.js leafRestPose) — not its home: re-hanging is the
   *                               player's Q, and a recovery that hung the door back would
   *                               undo a paid preparation (§26.4).
   *   a PIECE (part or fragment)  the slot beside its parent's CURRENT world AABB that a
   *                               fresh disassembly would give it (tools.js pieceSlots),
   *                               so the legs come back to the couch wherever the couch has
   *                               got to — not to where it stood when they came off. If
   *                               the parent is itself lost or gone, the piece's own last
   *                               stable spot, as for any object.
   *   anything else               its last settled transform, lifted objectRecoveryLiftM.
   *
   * @returns {{x, y, z, rot: {x,y,z,w}, kind: 'object'|'fixture'|'piece'}}
   */
  recoveryPose(entity) {
    const st = entity.state;
    const upright = { x: 0, y: 0, z: 0, w: 1 };
    if (st.doorId && (st.restAt || st.rest) && !st.hung) {
      // restAt is the strip this leaf was actually laid on (M32's chooser); st.rest is the
      // authored candidate. A leaf that had to take a fallback must return THERE, or recovery
      // puts it back on the strip something was standing on.
      const at = st.restAt || st.rest;
      return { x: at.x, y: at.y, z: at.z, rot: rotationOf(at), kind: 'fixture' };
    }
    const link = st.partOf || st.fragmentOf;
    if (link) {
      const parent = this.get(link.entityId);
      const pt = parent ? safeTranslation(parent.body) : null;
      if (parent && pt && !isOutOfBounds(pt, RECOVERY.bounds, RECOVERY.objectFloorY)) {
        const siblings = st.partOf
          ? ((parent.state.parts || {})[link.part] || [])
          : (parent.state.fragments || []);
        const count = Math.max(siblings.length, (link.index || 0) + 1);
        const placed = pieceSlots(parent, entity.def.dimensions, count, this.physics);
        const slot = placed.slots[Math.min(link.index || 0, placed.slots.length - 1)];
        const yaw = placed.yaw || 0;
        return { x: slot.x, y: slot.y, z: slot.z,
                 rot: { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, kind: 'piece' };
      }
    }
    const s = st.lastStable;
    return { x: s.x, y: s.y + RECOVERY.objectRecoveryLiftM, z: s.z, rot: upright,
             kind: link ? 'piece' : 'object' };
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
    /* The visual is a GROUP of parts since the Phase 13 art pass, and a Group has neither
     * geometry nor material — so this has to walk it. Rule 1 in this file's header is that
     * an entity's body, collider, mesh and state are created and DISPOSED together; a
     * two-line dispose that assumed a single Mesh silently became a leak the moment the
     * mesh grew children, and threw outright on the first removal.
     *
     * Materials are NOT disposed here. They come from the memoised texture cache in
     * textures.js and are shared across every object of the same prefab — disposing one
     * box's material would blank every other box in the contract. `disposeTextures()`
     * owns that lifetime, at scene teardown. */
    e.mesh.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.physics.world.removeRigidBody(e.body);   // removes its colliders too
    this.entities.delete(id);
    return true;
  }

  /** §26.6: a reset must leave nothing behind. */
  clear() {
    for (const id of Array.from(this.entities.keys())) this.remove(id);
  }

  /** Every BODY the registry owns — manifest objects AND the loose pieces beside them
   *  (M12). A suite that means "manifest objects" reads game.state.manifest.length. */
  get count() { return this.entities.size; }

  /** The loose pieces only: detached parts (`state.partOf`) and a broken item's fragments
   *  (`state.fragmentOf`). Never manifest rows; removed together by the contract reset. */
  pieces() {
    return [...this.entities.values()].filter((e) => e.state.partOf || e.state.fragmentOf);
  }

  get pieceCount() {
    let n = 0;
    for (const e of this.entities.values()) if (e.state.partOf || e.state.fragmentOf) n++;
    return n;
  }
}
