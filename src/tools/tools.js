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

import { TOOLS, DAMAGE, PARTS } from '../config.js';
import { TOOL_DEFS, validateToolDef } from './definitions.js';
import { pieceDefFor, fragmentDefFor } from '../objects/definitions.js';
import { EVENTS } from '../core/eventBus.js';
import { GROUP_PRESETS } from '../physics/world.js';
import { buildToolVisual } from '../render/prefabs.js';

let _nextToolId = 0;

export class ToolSystem {
  /**
   * @param {PhysicsWorld} physics
   * @param {ObjectRegistry} registry  the objects tools act ON
   * @param {THREE.Scene} scene
   * @param {EventBus} bus
   * @param {()=>number} [now]  the clock's simTimeMs. Tool transitions happen on a key
   *        press, outside any step, so this is how their TOOL_STATE events get a real
   *        timestamp instead of 0 (§27.4). Defaults to 0 when absent.
   */
  constructor(physics, registry, scene, bus, now = null) {
    this.physics = physics;
    this.registry = registry;
    this.scene = scene;
    this.bus = bus;
    this.now = typeof now === 'function' ? now : () => 0;
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

    // Phase 15: the tool's visual is a prefab (dolly wheels, strap coil, blanket fold) that
    // fits inside the same d.x × d.y × d.z the collider uses — m13 A-series faithful.
    const mesh = buildToolVisual(def);
    mesh.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
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
    if (this.bus) this.bus.emit(EVENTS.TOOL_STATE, { toolId: tool.id, entityId: entity.id, state: 'attached' }, this.now());
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
    if (this.bus) this.bus.emit(EVENTS.TOOL_STATE, { toolId: tool.id, state: 'detached' }, this.now());
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
    if (this.bus) this.bus.emit(EVENTS.TOOL_STATE, { toolId: tool.id, entityId: entity.id, state: 'covered' }, this.now());
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
    if (this.bus) this.bus.emit(EVENTS.TOOL_STATE, { toolId: tool.id, state: 'deployed' }, this.now());
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
 * WHAT THIS BUYS, stated plainly because for ten phases the honest answer was "volume, not
 * clearance". Six of the seven disassemblable objects already pass the tightest opening on
 * their route (0.86 m) by at least 160 mm, so for them the payoff is PACKED VOLUME and
 * handling: a wardrobe loses 13% of its volume and a bookshelf 80%, which is what decides
 * Phase 7's one-trip question. The wardrobe's real constraint is its 2.00 m height against
 * a 2.03 m opening, which taking the doors off does not touch.
 *
 * The seventh is the exception §7.1 wrote the schema for: couch_3seat_01, 0.850 m across at
 * its narrowest in every rotation (m0 C3/C4), against 0.86 (10 mm) and 0.82 (-30 mm). Its
 * legs (Phase 11 M8) take it to 0.77 — 90 mm at the 34" door, 50 mm at the 32" one — and
 * since M8 it starts in the kitchen behind the 0.86 door, so this is the one disassembly
 * that IS a clearance win, and m6 E8 now asserts exactly that: precisely one object needed
 * it, and it is the couch. §3.3's two approaches at the doorway turn are therefore real:
 * prepare (legs off, 60 s billed) or brute it through on its side with 10 mm to spare.
 *
 * The returned `seconds` are §8.2's "preparation time" — already scaled by
 * TOOLS.screwdriver.timeScale here, and BILLED by the interaction system through its
 * chargeWorkMs hook (§2.3). This function itself is instantaneous; the clock is the cost.
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

  /* THE PART IS NOW SEVERAL BODIES (M12). §9.1's second clause, "creates loose parts",
   * was a comment for five phases; now the pieces spawn beside the parent — clear of its
   * AABB so no contact impulse fires, on whatever floor it stands on — and the parent
   * records their ids. Everything after this point (carrying them, losing them, packing
   * them, pricing them) is the ordinary entity machinery seeing four more entities. */
  const pieces = spawnPieces(registry, entity, pieceDefFor(entity.def, entry), entry.piece.count,
    (p, i) => { p.state.partOf = { entityId: entity.id, defId: entity.defId, part: partName, index: i }; });
  entity.state.parts = { ...(entity.state.parts || {}), [partName]: pieces.map((p) => p.id) };

  return {
    before, after,
    volumeBefore: packedVolume(before),
    volumeAfter: packedVolume(after),
    seconds: entry.seconds * TOOLS.screwdriver.timeScale,
    reversible: entry.reversible !== false,
    pieces: pieces.map((p) => p.id),
  };
}

/**
 * §8.2: "Unscrew and reattach". Preparation that could not be undone would be a trap, and
 * §2.1 has no patience for traps.
 *
 * M12: the pieces have to be HERE. Every piece of the part must lie within
 * PARTS.reattachRange of the parent, or this refuses (null, nothing changes) and the prompt
 * says which are missing (partStatus). `force` is the contract reset's override: it gathers
 * the pieces from wherever they were lost, because a replay starts whole (§26.6).
 *
 * @returns {{restored, piecesRemoved}|null}
 */
export function reassemble(registry, entity, partName, { force = false } = {}) {
  const removed = entity.state.removedParts || [];
  if (!removed.includes(partName)) return null;
  const status = partStatus(registry, entity, partName);
  if (!force && status.missing > 0) return null;
  let piecesRemoved = 0;
  for (const id of status.ids) if (registry.remove(id)) piecesRemoved++;
  if (entity.state.parts) {
    const parts = { ...entity.state.parts };
    delete parts[partName];
    entity.state.parts = parts;
  }
  const d = entity.def.dimensions;
  entity.collider.setHalfExtents({ x: d.x / 2, y: d.y / 2, z: d.z / 2 });
  entity.mesh.scale.set(1, 1, 1);
  entity.state.dimensions = { ...d };
  entity.state.removedParts = removed.filter((p) => p !== partName);
  entity.body.wakeUp();
  if (piecesRemoved && registry.physics && registry.physics.primeQueries) registry.physics.primeQueries();
  return { restored: { ...d }, piecesRemoved };
}

/** Current dimensions, which are the definition's unless something has been taken off. */
export function currentDimensions(entity) {
  return entity.state.dimensions || entity.def.dimensions;
}

/* ── loose parts and fragments (M12; §9.1, §26.4, §26.6, §2.2) ─────────────────────────
 *
 * "An object in pieces is several objects, and pieces get left behind." Everything below
 * is placement and bookkeeping; the pieces themselves are ordinary registry entities.
 */

/** The world-space AABB of an entity's cuboid collider under its current rotation:
 *  half-extent per world axis = sum over local axes of |R_ij| x h_j. */
export function worldAabbOf(entity) {
  const q = entity.body.rotation();
  const he = entity.collider.halfExtents();
  const t = entity.body.translation();
  // Rotation matrix rows from the quaternion (column-major elements as Three.js lays them).
  const xx = q.x * q.x, yy = q.y * q.y, zz = q.z * q.z;
  const xy = q.x * q.y, xz = q.x * q.z, yz = q.y * q.z;
  const wx = q.w * q.x, wy = q.w * q.y, wz = q.w * q.z;
  const r = [
    [1 - 2 * (yy + zz), 2 * (xy - wz),     2 * (xz + wy)],
    [2 * (xy + wz),     1 - 2 * (xx + zz), 2 * (yz - wx)],
    [2 * (xz - wy),     2 * (yz + wx),     1 - 2 * (xx + yy)],
  ];
  const h = [he.x, he.y, he.z];
  const ext = r.map((row) => Math.abs(row[0]) * h[0] + Math.abs(row[1]) * h[1] + Math.abs(row[2]) * h[2]);
  return {
    min: { x: t.x - ext[0], y: t.y - ext[1], z: t.z - ext[2] },
    max: { x: t.x + ext[0], y: t.y + ext[1], z: t.z + ext[2] },
    centre: { x: t.x, y: t.y, z: t.z },
  };
}

/** The floor under (x, z), by a ray cast down from `fromY` past the parent — the ground,
 *  the truck deck, a ramp, whatever is there. Falls back to `fallbackY` when nothing is
 *  within reach (or the query pipeline has not been primed). */
function floorUnder(physics, x, z, fromY, excludeBody, fallbackY) {
  if (!physics || !physics.R || !physics.world) return fallbackY;
  try {
    const R = physics.R;
    const ray = new R.Ray({ x, y: fromY, z }, { x: 0, y: -1, z: 0 });
    const hit = physics.world.castRay(ray, fromY + PARTS.floorProbeLength, true, undefined, undefined, undefined, excludeBody);
    if (hit) return fromY - hit.timeOfImpact;
  } catch (e) { /* an unprimed pipeline is not an error; the fallback is the parent's base */ }
  return fallbackY;
}

/** Does a cuboid of `dims` centred at `pos` overlap any collider but the parent's? */
function occupied(physics, pos, dims, excludeBody) {
  if (!physics || !physics.R || !physics.world || !physics.R.Cuboid) return false;
  let hit = false;
  try {
    const shape = new physics.R.Cuboid(dims.x / 2, dims.y / 2, dims.z / 2);
    physics.world.intersectionsWithShape(pos, { x: 0, y: 0, z: 0, w: 1 }, shape,
      () => { hit = true; return false; }, undefined, undefined, undefined, excludeBody);
  } catch (e) { hit = false; }
  return hit;
}

/**
 * Where `count` pieces of `dims` go beside `parent`, and which way round.
 *
 * Against one face of the parent's world AABB, PARTS.pieceClearance of air between them
 * and it, resting on the floor under each slot (spawnLift above it, so they settle in a
 * frame without an impact). Two layouts: FLAT pieces (a door, a shelf board — height under
 * half the smaller footprint axis) are STACKED on one footprint, the way a mover lays
 * doors down; everything else (legs, a stand) is a ROW along the face, PARTS.pieceSpacing
 * apart or the piece's own extent plus pieceGap. A piece is turned so its LONG horizontal
 * axis lies along the face first (a leg across the row, a door parallel to the wardrobe),
 * and pointing out from it second. The four faces (+z, -z, +x, -x) x the two turns are
 * tried in that order and the first whose slots are all free of other colliders wins; a
 * parent hemmed in on every side gets the first candidate anyway — the solver separates
 * light bodies gently, and a piece somewhere inconvenient is §2.2's state, not a refusal.
 * Exported so a suite can assert the geometry without spawning.
 *
 * @returns {{slots: {x,y,z}[], yaw: number, side: string, layout: 'row'|'stack', free: boolean}}
 */
export function pieceSlots(parent, dims, count, physics = null) {
  const box = worldAabbOf(parent);
  const body = parent.body;
  const sides = [
    { side: '+z', along: 'x', out: 'z', sign: +1 },
    { side: '-z', along: 'x', out: 'z', sign: -1 },
    { side: '+x', along: 'z', out: 'x', sign: +1 },
    { side: '-x', along: 'z', out: 'x', sign: -1 },
  ];
  const longH = Math.max(dims.x, dims.z), shortH = Math.min(dims.x, dims.z);
  const layout = (count > 1 && dims.y <= shortH * PARTS.flatAspect) ? 'stack' : 'row';
  const baseY = Math.max(0, box.min.y);
  let first = null;
  for (const s of sides) {
    for (const turn of ['along', 'across']) {
      // Footprint on this face: the long axis along the face, or out from it.
      const f = { x: 0, y: dims.y, z: 0 };
      f[s.along] = turn === 'along' ? longH : shortH;
      f[s.out] = turn === 'along' ? shortH : longH;
      // Rotate a quarter turn when the def's own x/z do not already match that footprint.
      const yaw = (Math.abs(f.x - dims.x) < 1e-9 && Math.abs(f.z - dims.z) < 1e-9) ? 0 : Math.PI / 2;
      const outAt = (s.sign > 0 ? box.max[s.out] : box.min[s.out]) + s.sign * (PARTS.pieceClearance + f[s.out] / 2);
      const spacing = Math.max(PARTS.pieceSpacing, f[s.along] + PARTS.pieceGap);
      const slots = [];
      for (let i = 0; i < count; i++) {
        const p = { x: 0, y: 0, z: 0 };
        p[s.along] = box.centre[s.along] + (layout === 'row' ? (i - (count - 1) / 2) * spacing : 0);
        p[s.out] = outAt;
        const floorY = floorUnder(physics, p.x, p.z, box.max.y + PARTS.floorProbeLift, body, baseY);
        p.y = floorY + dims.y / 2 + PARTS.spawnLift + (layout === 'stack' ? i * (dims.y + PARTS.stackGap) : 0);
        slots.push(p);
      }
      const free = slots.every((p) => !occupied(physics, p, f, body));
      const candidate = { slots, yaw, side: s.side, layout, free };
      if (free) return candidate;
      if (!first) first = candidate;
    }
  }
  return first;
}

/** Spawn `count` bodies of `def` beside `parent` and tag each through `tag(entity, i)`. */
function spawnPieces(registry, parent, def, count, tag) {
  const placed = pieceSlots(parent, def.dimensions, count, registry.physics);
  const out = [];
  placed.slots.forEach((at, i) => {
    const p = registry.spawn(def, { x: at.x, y: at.y, z: at.z, yaw: placed.yaw });
    tag(p, i);
    p.state.lastStable = { x: at.x, y: at.y, z: at.z };
    out.push(p);
  });
  if (out.length && registry.physics && registry.physics.primeQueries) registry.physics.primeQueries();
  return out;
}

/**
 * Where the pieces of one detached part are, relative to their parent: how many exist,
 * how many are within PARTS.reattachRange, and which are not. The prompt's
 * 'find the legs (1 of 4 missing)' and reassemble()'s refusal both read this.
 *
 * @returns {{part, of, present, missing, ids, farIds, name}}
 */
export function partStatus(registry, entity, partName) {
  const ids = ((entity.state.parts || {})[partName]) || [];
  const entry = (entity.def.disassembly || []).find((p) => p.part === partName);
  const of = ids.length || (entry && entry.piece ? entry.piece.count : 0);
  const c = entity.body.translation();
  let present = 0;
  const farIds = [];
  for (const id of ids) {
    const p = registry.get(id);
    if (!p) { farIds.push(id); continue; }
    const t = p.body.translation();
    /* HORIZONTAL distance. A wardrobe's centre is a metre up and its doors lie at its foot;
     * measured in 3D they read 1.72 m away while touching it (m6 E5, m11 C10 caught this). */
    if (Math.hypot(t.x - c.x, t.z - c.z) <= PARTS.reattachRange) present++;
    else farIds.push(id);
  }
  return { part: partName, of, present, missing: of - present, ids, farIds,
           name: entry && entry.piece ? entry.piece.name : partName };
}

/** Every loose piece that belongs to `entity`: its detached parts' bodies and its fragments. */
export function piecesOf(registry, entity) {
  const ids = [];
  for (const list of Object.values(entity.state.parts || {})) ids.push(...list);
  ids.push(...(entity.state.fragments || []));
  return ids.map((id) => registry.get(id)).filter(Boolean);
}

/**
 * §26.4 "Broken required cargo stays deliverable or becomes trackable pieces" — BOTH. The
 * entity stays, as the deliverable hulk (its mass, collider and manifest row untouched);
 * PARTS.brokenFragmentCount[fragility] fragments spawn beside it as trackable bodies. Once
 * per object: a hulk does not break again, and a piece never breaks at all.
 *
 * @returns {string[]} the fragment ids (empty when nothing was spawned)
 */
export function breakInto(registry, entity) {
  if (entity.state.fragments || entity.state.partOf || entity.state.fragmentOf) return [];
  const def = fragmentDefFor(entity.def);
  const pieces = spawnPieces(registry, entity, def, def.fragmentOf.count,
    (p, i) => { p.state.fragmentOf = { entityId: entity.id, defId: entity.defId, index: i }; });
  entity.state.fragments = pieces.map((p) => p.id);
  return entity.state.fragments;
}

/** Remove an object's fragments (contract reset, §26.6 "reset removes … fragments"). */
export function clearFragments(registry, entity) {
  const ids = entity.state.fragments || [];
  let n = 0;
  for (const id of ids) if (registry.remove(id)) n++;
  if (entity.state.fragments !== undefined) delete entity.state.fragments;
  return n;
}
