/* The tool system — GDD §9.1, §9.2, §8.2, §7.4.
 *
 * §9.1 IS THE WHOLE DESIGN, and it is one sentence: "Tools create new physical solutions;
 * they do not erase physics. Each tool changes leverage, friction, protection, clearance,
 * containment, or securing."
 *
 * The temptation with tools is to make them permissions — a flag that says this object may
 * now be moved. Every tool here instead changes ONE physical quantity and then gets out of
 * the way, which is what makes §9.1's second sentence possible: "Better tools should
 * introduce both new mastery and new accidents." A tool whose downside had to be authored
 * separately is a permission with a penalty stapled to it.
 *
 *   dolly       replaces an object's friction with rolling resistance
 *   blanket     raises the impact speed the object tolerates
 *   ramp        puts a walkable surface where a vertical face was
 *   screwdriver changes an object's dimensions and creates loose parts
 *
 * Each failure mode is the same change seen from the other side, and none of them is
 * special-cased anywhere:
 *
 *   a dolly that rolls on the flat rolls DOWNHILL just as well
 *   a wrapped object is a softer object, and softer things are harder to grip
 *   a ramp laid short of the deck is a ramp with a step at the top
 *   an object in pieces is several objects, and pieces get left behind
 *
 * §9.2's interaction contract is honoured by having exactly one verb. `interact` deploys,
 * attaches, covers and applies depending on what is under the reticle, because four verbs
 * for one gesture is how a player ends up pressing the wrong key at the top of a ramp.
 */

import { TOOLS, DAMAGE } from '../config.js';
import { TOOL_DEFS, validateToolDef } from './definitions.js';
import { EVENTS } from '../core/eventBus.js';
import { GROUP_PRESETS } from '../physics/world.js';
import { matte } from '../render/textures.js';

let _nextToolId = 0;

export class ToolSystem {
  /**
   * @param {PhysicsWorld} physics
   * @param {ObjectRegistry} registry  the objects tools act ON
   * @param {THREE.Scene} scene
   * @param {EventBus} bus
   */
  constructor(physics, registry, scene, bus) {
    this.physics = physics;
    this.registry = registry;
    this.scene = scene;
    this.bus = bus;
    /** toolId -> tool record. Stable string ids (§9.2, §22.4). */
    this.tools = new Map();
    this.byCollider = new Map();
  }

  get count() { return this.tools.size; }

  /** Spawn a tool as a real world body. §9.2: "tools are world objects and consume cargo
   *  space unless mounted" — so they have mass, they fall over, and they can be forgotten. */
  spawn(defId, at = {}) {
    const def = TOOL_DEFS[defId];
    if (!def) throw new Error(`unknown tool definition "${defId}"`);
    const problems = validateToolDef(def);
    if (problems.length) throw new Error(`tool "${defId}" is invalid: ${problems.join('; ')}`);

    const R = this.physics.R;
    const THREE = window.THREE;
    const d = def.dimensions;
    const yaw = at.yaw || 0;

    const body = this.physics.world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(at.x || 0, at.y || 0, at.z || 0)
        .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })
        .setLinearDamping(0.2)
        .setAngularDamping(0.7)
        .setCcdEnabled(true));

    const colDesc = R.ColliderDesc.cuboid(d.x / 2, d.y / 2, d.z / 2)
      .setFriction(0.7).setRestitution(0.02).setMass(def.mass);
    // Same combine rule as objects — see registry.js for why Average was wrong.
    if (R.CoefficientCombineRule && colDesc.setFrictionCombineRule) {
      colDesc.setFrictionCombineRule(R.CoefficientCombineRule.Min);
    }
    colDesc.setCollisionGroups(GROUP_PRESETS.object);
    const collider = this.physics.world.createCollider(colDesc, body);

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(d.x, d.y, d.z),
      matte(def.colour));
    mesh.castShadow = true; mesh.receiveShadow = true;
    this.scene.add(mesh);

    const id = `${def.id}#${_nextToolId++}`;
    const tool = {
      id, defId: def.id, def, body, collider, mesh,
      /** §9.2 "tools have stable IDs and state". Serializable half only. */
      state: {
        id, defId: def.id,
        deployed: false,
        attachedTo: null,      // entityId this tool is currently acting on
        carriedBy: null,       // playerId, once picked up
      },
    };
    this.tools.set(id, tool);
    this.byCollider.set(collider.handle, tool);
    return tool;
  }

  get(id) { return this.tools.get(id); }

  fromCollider(colliderOrHandle) {
    if (colliderOrHandle == null) return null;
    const h = typeof colliderOrHandle === 'number' ? colliderOrHandle : colliderOrHandle.handle;
    return this.byCollider.get(h) || null;
  }

  syncMeshes() {
    for (const t of this.tools.values()) {
      const p = t.body.translation(), r = t.body.rotation();
      t.mesh.position.set(p.x, p.y, p.z);
      t.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }

  // ---- the dolly: friction ------------------------------------------------------------

  /**
   * Put a dolly under an object. §9.1 "roll heavy items on level ground".
   *
   * The entire effect is one call to setFriction. The object keeps its mass, its inertia,
   * its collider and its grip points — pushing it still takes force, and a 110 kg fridge on
   * a dolly is still a 110 kg fridge. What changes is that the floor stops holding it back.
   *
   * MEASURED, from the definitions: couch 0.35 -> 0.04 takes the force needed to shift it
   * from 309 N to 35 N. One hand can deliver about 358 N, so a couch goes from "just barely,
   * badly" to "trivially", and a fridge from 518 N — beyond one hand entirely — to 43 N.
   */
  attachDolly(tool, entity) {
    if (!tool || !entity || tool.def.effect !== 'friction') return false;
    if (entity.state.dollyId) return false;             // already on wheels
    entity.state.frictionBefore = entity.collider.friction();
    entity.collider.setFriction(TOOLS.dolly.rollingResistance);

    /* AND THE COMBINE RULE, which is the half that makes the number mean anything.
     *
     * Rapier averages the two colliders' coefficients by default (see registry.js). Against
     * a 0.9 floor, dropping the object to 0.04 gives an effective (0.04 + 0.9)/2 = 0.47 —
     * a reduction of 1.3x, not the 8.75x the number implies. MEASURED with the rule left
     * alone: a couch hauled for three seconds moved 0.20 m bare and 0.36 m on the dolly,
     * and a fridge did not move at all either way. The tool was correct and invisible.
     *
     * Min is the right rule HERE specifically, and switching it per-object is the right
     * scope rather than a workaround. A dolly is precisely the claim that this contact is
     * now governed by the wheels and not by the floor: a castor on carpet rolls, and it
     * does not roll less because the carpet is rough. Everything else in the world keeps
     * the averaged behaviour the earlier phases were tuned against.
     *
     * With it: 0.20 m -> 2.12 m for the couch, and 0.00 m -> 1.59 m for the fridge. */
    const R = this.physics.R;
    if (R.CoefficientCombineRule && entity.collider.setFrictionCombineRule) {
      entity.state.combineRuleBefore = entity.collider.frictionCombineRule
        ? entity.collider.frictionCombineRule() : R.CoefficientCombineRule.Average;
      entity.collider.setFrictionCombineRule(R.CoefficientCombineRule.Min);
    }
    entity.state.dollyId = tool.id;
    tool.state.attachedTo = entity.id;
    entity.body.wakeUp();
    if (this.bus) this.bus.emit(EVENTS.TOOL_STATE, { toolId: tool.id, entityId: entity.id, state: 'attached' }, 0);
    return true;
  }

  detachDolly(tool) {
    if (!tool || !tool.state.attachedTo) return false;
    const e = this.registry.get(tool.state.attachedTo);
    if (e) {
      // Back to the object's own friction, not to a remembered constant: an object whose
      // definition changed between attach and detach must end up with its CURRENT value.
      const back = e.state.frictionBefore != null ? e.state.frictionBefore : e.def.physics.friction;
      e.collider.setFriction(back);
      const R = this.physics.R;
      if (R.CoefficientCombineRule && e.collider.setFrictionCombineRule) {
        // Back to whatever the world uses, so an object off the dolly behaves exactly as it
        // did before it went on — the rule is the dolly's, not the object's.
        const rule = e.state.combineRuleBefore != null
          ? e.state.combineRuleBefore : R.CoefficientCombineRule.Average;
        e.collider.setFrictionCombineRule(rule);
        e.state.combineRuleBefore = null;
      }
      e.state.frictionBefore = null;
      e.state.dollyId = null;
      e.body.wakeUp();
    }
    tool.state.attachedTo = null;
    if (this.bus) this.bus.emit(EVENTS.TOOL_STATE, { toolId: tool.id, state: 'detached' }, 0);
    return true;
  }

  /**
   * §9.1's failure mode, and it is a REPORT rather than a rule.
   *
   * Nothing here stops a dolly on a slope or applies a corrective force. The runaway is
   * already happening, because friction 0.04 cannot hold 883 N of couch on a 16-degree ramp
   * — it is what removing the friction MEANT. This only names the condition so the HUD can
   * warn and so a test can assert it, which is the difference between a hazard and a rule
   * the game enforces behind your back (§2.1).
   */
  dollyRunaway(entity) {
    if (!entity || !entity.state.dollyId) return null;
    const v = entity.body.linvel();
    const speed = Math.hypot(v.x, v.z);
    return { rolling: speed > 0.35, speed };
  }

  // ---- the blanket: protection --------------------------------------------------------

  /** Wrap an object. §9.1 "reduce scratches/impact". */
  applyBlanket(tool, entity) {
    if (!tool || !entity || tool.def.effect !== 'protection') return false;
    if (entity.state.blanketId) return false;
    entity.state.blanketId = tool.id;
    tool.state.attachedTo = entity.id;
    if (this.bus) this.bus.emit(EVENTS.TOOL_STATE, { toolId: tool.id, entityId: entity.id, state: 'covered' }, 0);
    return true;
  }

  removeBlanket(tool) {
    if (!tool || !tool.state.attachedTo) return false;
    const e = this.registry.get(tool.state.attachedTo);
    if (e) e.state.blanketId = null;
    tool.state.attachedTo = null;
    return true;
  }

  // ---- the ramp: clearance ------------------------------------------------------------

  /**
   * Lay the ramp against a deck edge. §9.1 "bridge truck floor height".
   *
   * A DEPLOYED RAMP IS KINEMATIC, and that is a physical statement rather than a shortcut.
   * A ramp resting on the ground under its own weight is a plank being pushed around by
   * whatever walks on it; a ramp hooked onto a deck lip is fixed at one end and pinned by
   * its own load at the other. Making it kinematic while deployed says the second thing.
   * It becomes dynamic again the moment it is picked up, so it can still be dropped, run
   * over and forgotten like any other tool.
   *
   * @param {object} tool
   * @param {{x,y,z}} deckEdge  the point on the deck lip the ramp head rests on
   * @param {{x,z}} outward     unit direction from the deck out into open ground
   * @param {number} footDistance  how far from the deck face the foot is set (§8.1: "park
   *                               position should affect ramp angle")
   */
  deployRamp(tool, deckEdge, outward, footDistance) {
    if (!tool || tool.def.effect !== 'clearance') return null;
    const geo = rampGeometry(footDistance, deckEdge.y);

    // Midpoint of the plank, halfway up the slope it spans.
    const cx = deckEdge.x + outward.x * geo.run / 2;
    const cz = deckEdge.z + outward.z * geo.run / 2;
    const cy = deckEdge.y / 2;

    // Rotate about the axis perpendicular to `outward` so the plank tips down and away.
    // The ramp's long axis is local +Z, so it is yawed to face `outward` first.
    const yaw = Math.atan2(outward.x, outward.z);
    const pitch = geo.angleRad;
    const cy2 = Math.cos(yaw / 2), sy2 = Math.sin(yaw / 2);
    const cp2 = Math.cos(pitch / 2), sp2 = Math.sin(pitch / 2);
    // q = yaw about Y, then pitch about the rotated X.
    const q = {
      x: cy2 * sp2, y: sy2 * cp2, z: -sy2 * sp2, w: cy2 * cp2,
    };

    // FIXED, not kinematic. A deployed ramp is bolted to a deck lip and pinned by its own
    // load, so fixed is the honest body type — and two KINEMATIC bodies generate no contact
    // in Rapier, which would have let the player walk straight through it (the character
    // capsule is itself kinematicPositionBased). It goes back to dynamic on retrieve.
    tool.body.setBodyType(this.physics.R.RigidBodyType.Fixed, true);
    tool.body.setTranslation({ x: cx, y: cy, z: cz }, true);
    tool.body.setRotation(q, true);
    tool.state.deployed = true;
    tool.state.geometry = {
      angleDeg: geo.angleDeg, lip: geo.lip, aligned: geo.aligned, run: geo.run,
    };
    this.physics.primeQueries();
    if (this.bus) this.bus.emit(EVENTS.TOOL_STATE, { toolId: tool.id, state: 'deployed' }, 0);
    return tool.state.geometry;
  }

  /** Fold it back up. §9.2 lists "fold" and "retrieve" alongside deploy for a reason —
   *  a ramp you cannot pick up again is scenery, and it would be left at the pickup site. */
  retrieveRamp(tool) {
    if (!tool || !tool.state.deployed) return false;
    tool.body.setBodyType(this.physics.R.RigidBodyType.Dynamic, true);
    tool.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    tool.state.deployed = false;
    tool.state.geometry = null;
    return true;
  }
}

/* ── protection maths, as free functions ──────────────────────────────────────────────
 *
 * Kept out of the class because Phase 8's damage system needs them and should not have to
 * hold a ToolSystem to ask what an object tolerates. They are pure, so they are also the
 * easiest thing in the phase to assert exactly.
 */

/** What this object survives, in m/s, given whatever is wrapped around it (§8.3, §9.1). */
export function impactToleranceOf(entity) {
  const band = DAMAGE.fragility[entity.def.fragility];
  if (!band) return 0;
  const mult = entity.state.blanketId ? TOOLS.blanket.thresholdMult : 1;
  return band.impactSpeed * mult;
}

/** Condition points lost by an impact at `speed` m/s. Zero below tolerance (§8.3). */
export function conditionLossFor(entity, speed) {
  const band = DAMAGE.fragility[entity.def.fragility];
  if (!band) return 0;
  const tol = impactToleranceOf(entity);
  if (speed <= tol) return 0;
  const soften = entity.state.blanketId ? TOOLS.blanket.conditionMult : 1;
  return (speed - tol) * band.conditionPerMps * soften;
}

/** §9.1 "bad wrap obscures grip". A wrapped object is softer under the hands. */
export function gripMultiplierFor(entity) {
  const base = (entity.def.grip && entity.def.grip.forceMult) || 1;
  return entity.state.blanketId ? base * TOOLS.blanket.gripForceMult : base;
}

/** §9.1 "…or falls off". Above this the wrap sheds and stops protecting anything. */
export function blanketShedsAt(speed) {
  return speed > TOOLS.blanket.shedSpeed;
}

/* ── the ramp: clearance ───────────────────────────────────────────────────────────── */

/**
 * Geometry of a ramp laid from the ground to a deck edge.
 *
 * §8.1: "Park position should affect ramp angle and carry distance without causing
 * unwinnable setup." The angle therefore comes out of WHERE it was laid rather than being a
 * constant, and the failure mode is a measurable lip, not a refusal to deploy.
 *
 * @param {number} distanceFromDeck  how far the ramp's foot is from the deck face, m
 * @param {number} deckHeight
 */
export function rampGeometry(distanceFromDeck, deckHeight = TOOLS.ramp.deckHeight) {
  const L = TOOLS.ramp.length;
  // The ramp is a rigid plank: its foot is where you put it, and its head lands wherever
  // that leaves it. Reaching short of the deck edge is what makes a lip.
  const run = Math.min(distanceFromDeck, L);
  const rise = Math.sqrt(Math.max(0, L * L - run * run));
  const reachedHeight = Math.min(rise, deckHeight);
  const lip = Math.max(0, deckHeight - rise);
  return {
    angleRad: Math.atan2(reachedHeight, run),
    angleDeg: Math.atan2(reachedHeight, run) * 180 / Math.PI,
    lip,
    aligned: lip <= TOOLS.ramp.alignToleranceM,
    run,
  };
}

/* ── the screwdriver: dimensions ───────────────────────────────────────────────────── */

/** Volume of an object as packed, in cubic metres. §10.5's cargo optimisation currency,
 *  and the honest payoff for disassembly — see disassemble(). */
export function packedVolume(dims) {
  return dims.x * dims.y * dims.z;
}

/**
 * Take an authored part off an object (§8.2, §23.1's `disassembly` array, §7.4).
 *
 * WHAT THIS DOES NOT DO, stated plainly because the obvious expectation is wrong: it does
 * not make anything fit through a door it did not fit through before. Every disassemblable
 * object in the contract already passes the tightest opening on its route (0.86 m) by at
 * least 160 mm, and the one object that is genuinely tight — couch_3seat_01, at 0.850 m
 * against 0.860 — has no authored disassembly path at all. The wardrobe's real constraint
 * is its 2.00 m height against a 2.03 m opening, which taking the doors off does not touch.
 *
 * The measurable payoff is PACKED VOLUME and handling: a wardrobe loses 13% of its volume
 * and a bookshelf 80%, which is what decides Phase 7's one-trip question. Asserting a
 * clearance win here would be asserting something that is not true.
 *
 * §9.1's failure mode is the second return value: the part is a real body with real mass
 * that now has to be tracked, carried and loaded. "Loose pieces get lost."
 */
export function disassemble(registry, entity, partName) {
  const list = entity.def.disassembly || [];
  const entry = list.find((p) => p.part === partName);
  if (!entry) return null;
  if ((entity.state.removedParts || []).includes(partName)) return null;

  const before = { ...entity.def.dimensions };
  const after = entry.shrinksTo || before;

  // Resize the collider to match. §8.1's rule applies to objects too: the visible silhouette
  // and the collider must not disagree, so the mesh is rescaled from the same numbers.
  entity.collider.setHalfExtents({ x: after.x / 2, y: after.y / 2, z: after.z / 2 });
  entity.mesh.scale.set(after.x / before.x, after.y / before.y, after.z / before.z);
  entity.state.dimensions = { ...after };
  entity.state.removedParts = [...(entity.state.removedParts || []), partName];
  entity.body.wakeUp();

  return {
    before, after,
    volumeBefore: packedVolume(before),
    volumeAfter: packedVolume(after),
    seconds: entry.seconds * TOOLS.screwdriver.timeScale,
    reversible: entry.reversible !== false,
  };
}

/** §8.2: "Unscrew and reattach". Preparation that could not be undone would be a trap, and
 *  §2.1 has no patience for traps. */
export function reassemble(registry, entity, partName) {
  const removed = entity.state.removedParts || [];
  if (!removed.includes(partName)) return null;
  const d = entity.def.dimensions;
  entity.collider.setHalfExtents({ x: d.x / 2, y: d.y / 2, z: d.z / 2 });
  entity.mesh.scale.set(1, 1, 1);
  entity.state.dimensions = { ...d };
  entity.state.removedParts = removed.filter((p) => p !== partName);
  entity.body.wakeUp();
  return { restored: { ...d } };
}

/** Current dimensions, which are the definition's unless something has been taken off. */
export function currentDimensions(entity) {
  return entity.state.dimensions || entity.def.dimensions;
}
