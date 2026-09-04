/* The interaction layer — GDD §9.2, §4.4, §21.1, §2.1.
 *
 * This is the file Phases 6 to 10 kept deferring. Every system they built was real, measured
 * and asserted, and none of it had a way in: the tools, the straps, the drive and the invoice
 * were all reachable only by calling their APIs. Six hundred assertions and nothing a person
 * could press.
 *
 * §9.2 IS THE DESIGN, and it is one sentence: "Deploy, attach, tension, fold, and retrieve
 * through the COMMON interaction system." One verb, not five. A player learns E, and what E
 * means comes from what is under the reticle — which is also why §4.4's "one input should not
 * change meaning invisibly" matters here more than anywhere: whatever E is about to do has to
 * be written on the screen BEFORE it is pressed. `describe()` exists for exactly that, and the
 * HUD renders it every frame.
 *
 * Two verbs in the end, because undo deserves its own key:
 *
 *   E (interact)  do the obvious thing: pick up, apply, attach, tighten, drive
 *   Q (context)   undo the obvious thing: put down, detach, unstrap, reassemble, cancel
 *
 * §2.1 governs the failure cases: nothing here refuses with a beep. If E cannot do anything
 * useful, the prompt says so in advance and the key does nothing — a player is never told
 * "no" after committing to an action.
 *
 * LINEAGE — this was written from scratch and it should not have been.
 * `SmallTownEmergencyServices\src\sim\interaction.js` `contextPrompt` / `doInteract` is the
 * same pattern and was already in Dev\INDEX.md ("Contextual single-key verb + the prompt
 * string that explains it, from one function so the HUD can never disagree with the action").
 * Names kept aligned in spirit so the lineage stays greppable. The shapes differ for real
 * reasons — STES picks a target by proximity in 2D and returns one `{key, text}`; this picks
 * by raycast in 3D and returns a primary AND a secondary, because there are two keys — but
 * the cascade-in-one-function idea is theirs and was re-derived at full cost.
 *
 * What this version adds, and what should go back the other way: STES keeps `contextPrompt`
 * and `doInteract` in step BY HAND, which is the failure mode the pattern exists to prevent.
 * Here `describe()` and `act()` have the same risk, so `tools/m11-tests.js` asserts it away —
 * for every situation, the thing the prompt promises is the thing the key does. "7 promises
 * made, 7 honoured." That test is the reusable part.
 */

import { TOOLS, GRIP } from '../config.js';
import { EVENTS, PHASES } from '../core/eventBus.js';
import { disassemble, reassemble, currentDimensions } from '../tools/tools.js';
import { cargoAnchors, cabPoint, insideCargo, rampAnchorPoint, CARGO_BOX } from '../world/truck.js';
import { STRAP_STATE } from '../cargo/straps.js';
import { GROUP_PRESETS } from '../physics/world.js';

/** What the reticle is over. One shape, so the HUD and the action share a description. */
export const TARGET = Object.freeze({
  NONE: 'none',
  TOOL: 'tool',
  OBJECT: 'object',
  ANCHOR: 'anchor',
  CAB: 'cab',
});

export class InteractionSystem {
  /**
   * @param {PhysicsWorld} physics
   * @param {ObjectRegistry} registry
   * @param {ToolSystem} tools
   * @param {StrapSystem} straps
   * @param {CargoSystem} cargo
   * @param {RouteDriver} route
   * @param {ThirdPersonCamera} rig
   * @param {THREE.PerspectiveCamera} camera
   * @param {EventBus} bus
   * @param {(to:string, validation?:object)=>string} [setPhase]  game.setPhase — the ONE
   *        §3.4 phase-machine entry, so CONTRACT_PHASE is emitted by it and nothing else.
   *        Defaults to a no-op for suites that build this system without a Game.
   * @param {()=>number} [now]  the clock's simTimeMs, for stamping events raised from a
   *        key press rather than from a step. Defaults to 0 when absent.
   * @param {(entityId:string)=>object|null} [manifestRow]  the manifest row for an entity,
   *        for the destination-room hint (§21.1 "destination feedback"). By ENTITY id, never
   *        by defId: box_small_01 spawns five times across three rooms. Defaults to none.
   * @param {(zoneId:string)=>string} [roomLabel]  a zone id → the words the hint prints.
   */
  constructor({ physics, registry, tools, straps, cargo, route, rig, camera, bus,
                setPhase = null, now = null, manifestRow = null, roomLabel = null }) {
    this.physics = physics;
    this.registry = registry;
    this.tools = tools;
    this.straps = straps;
    this.cargo = cargo;
    this.route = route;
    this.rig = rig;
    this.camera = camera;
    this.bus = bus;
    this.setPhase = typeof setPhase === 'function' ? setPhase : () => null;
    this.now = typeof now === 'function' ? now : () => 0;
    this.manifestRow = typeof manifestRow === 'function' ? manifestRow : () => null;
    this.roomLabel = typeof roomLabel === 'function' ? roomLabel : (id) => id;

    /** Per-mover interaction state, keyed by the mover's stable id (§22.4). */
    this.state = new Map();
    this.anchors = cargoAnchors();
    this.lastMessage = '';
  }

  _for(moverId) {
    if (!this.state.has(moverId)) {
      this.state.set(moverId, { carriedTool: null, pendingAnchor: null });
    }
    return this.state.get(moverId);
  }

  /** Serializable per-mover interaction state (§22.4). */
  snapshot() {
    const out = {};
    for (const [id, s] of this.state) out[id] = { ...s };
    return out;
  }

  /* ── looking ──────────────────────────────────────────────────────────────────── */

  /**
   * What is under the reticle for this mover.
   *
   * Aims from the CAMERA and measures reach from the SHOULDER, exactly as the grip system
   * does — for the same reason, which cost an afternoon in Phase 2: the camera sits ~4 m
   * behind the character, so a range measured from it does not even reach the mover's back.
   */
  probe(mover) {
    const R = this.physics.R;
    const grips = mover.grips;
    const frame = grips.aim();
    const origin = frame.origin;
    const camOrigin = frame.camOrigin;
    const dir = frame.dir;

    const camToBody = Math.hypot(camOrigin.x - origin.x, camOrigin.y - origin.y,
                                 camOrigin.z - origin.z);
    const maxToi = camToBody + TOOLS.interactRange + 0.5;

    /* THE THING IN YOUR HANDS IS NOT WHAT YOU ARE LOOKING AT.
     *
     * A carried tool rides at chest height, directly between the camera and everything else,
     * so the probe ray hits it first and the game decides you are aiming at your own blanket.
     * MEASURED: the dolly worked (it is thin) and the 1.80 x 1.40 m moving blanket made it
     * impossible to point at anything at all — E simply stopped doing things once you picked
     * it up, with no error and no clue.
     *
     * Same shape as the Phase 2 bug where the ray stopped on the character's own back, and
     * the same fix: exclude what belongs to you.
     *
     * Done with COLLISION GROUPS rather than a filter predicate. A predicate in the eighth
     * argument was tried first and did nothing — grip.js and the mantle probe both use the
     * six-argument form, and the extra arguments are not honoured the way the docs imply.
     * Groups need no new mechanism: a carried tool is already in `toolCarried`, whose filter
     * is zero, so a ray that behaves like the player simply cannot see it. One rule, doing
     * two jobs. */
    const ray = new R.Ray(camOrigin, dir);
    const hit = this.physics.world.castRayAndGetNormal(
      ray, maxToi, true, undefined, GROUP_PRESETS.player, mover.controller.collider);

    let best = { kind: TARGET.NONE, distance: Infinity };

    if (hit) {
      const point = {
        x: camOrigin.x + dir.x * hit.timeOfImpact,
        y: camOrigin.y + dir.y * hit.timeOfImpact,
        z: camOrigin.z + dir.z * hit.timeOfImpact,
      };
      const reach = Math.hypot(point.x - origin.x, point.y - origin.y, point.z - origin.z);
      if (reach <= TOOLS.interactRange) {
        const tool = this.tools.fromCollider(hit.collider);
        const entity = this.registry.fromCollider(hit.collider);
        if (tool) best = { kind: TARGET.TOOL, tool, point, distance: reach };
        else if (entity) best = { kind: TARGET.OBJECT, entity, point, distance: reach };
        else best = { kind: TARGET.NONE, point, distance: reach, surface: true };
      } else {
        best = { kind: TARGET.NONE, point, distance: reach, surface: true, tooFar: true };
      }
    }

    /* SMALL TOOLS GET THE SAME HELP AS ANCHORS.
     *
     * The screwdriver is 50 x 50 x 260 mm. Hitting it with a ray at arm's length is a test of
     * mouse precision, not of anything this game is about — MEASURED, picking it up failed
     * repeatedly from a sensible standing position while the 780 mm dolly beside it was
     * trivial. §9.2 wants tools deployed "through the common interaction system", not through
     * a marksmanship challenge, and §21.4's accessibility baseline is the other half of that.
     *
     * So a tool near the aim line counts, with a tolerance that scales with how small it is:
     * a big tool still needs to be pointed at, and a small one is forgiven. */
    if (best.kind !== TARGET.TOOL) {
      const near = this._toolNearRay(origin, dir, TOOLS.interactRange);
      if (near && near.distance < best.distance + TOOLS.smallToolAssistM) {
        best = { kind: TARGET.TOOL, tool: near.tool, point: near.point, distance: near.distance };
      }
    }

    /* ANCHORS ARE POINTS, NOT COLLIDERS. A 100 mm knob on a wall is almost impossible to hit
     * with a ray, and making it a collider would put six small obstacles inside the cargo
     * box for the load to snag on. Tested as proximity to the AIM LINE instead, which is
     * both more forgiving and closer to what the player thinks they are doing. */
    const anchor = this._anchorNearRay(origin, dir, TOOLS.interactRange);
    if (anchor && anchor.distance < best.distance) {
      best = { kind: TARGET.ANCHOR, anchor: anchor.anchor, point: anchor.anchor, distance: anchor.distance };
    }

    // The cab, likewise a place rather than a thing to hit precisely.
    const cab = cabPoint();
    const toCab = Math.hypot(cab.x - origin.x, cab.z - origin.z);
    if (toCab <= TOOLS.interactRange + 0.6 && toCab < best.distance) {
      best = { kind: TARGET.CAB, point: cab, distance: toCab };
    }

    return best;
  }

  /**
   * Nearest un-carried tool to the aim line. Tolerance scales inversely with the tool's own
   * size, so a screwdriver is generous and the 2.7 m ramp is not — a tool you can barely see
   * should be easy to select, and a tool that fills the view should not steal a click aimed
   * past it.
   */
  _toolNearRay(origin, dir, maxDist) {
    let best = null;
    for (const t of this.tools.tools.values()) {
      if (t.state.carriedBy || t.state.deployed) continue;
      const p = t.body.translation();
      const vx = p.x - origin.x, vy = p.y - origin.y, vz = p.z - origin.z;
      const along = vx * dir.x + vy * dir.y + vz * dir.z;
      if (along <= 0 || along > maxDist) continue;
      const px = origin.x + dir.x * along, py = origin.y + dir.y * along, pz = origin.z + dir.z * along;
      const off = Math.hypot(p.x - px, p.y - py, p.z - pz);
      const d = t.def.dimensions;
      const size = Math.max(d.x, d.y, d.z);
      const tol = Math.max(TOOLS.anchorAimRadius, TOOLS.smallToolAssistM / Math.max(0.3, size));
      if (off > tol) continue;
      if (!best || along < best.distance) {
        best = { tool: t, distance: along, point: { x: p.x, y: p.y, z: p.z } };
      }
    }
    return best;
  }

  /** Nearest anchor to the aim line, within `maxDist` of the shoulder. */
  _anchorNearRay(origin, dir, maxDist) {
    let best = null;
    for (const a of this.anchors) {
      const vx = a.x - origin.x, vy = a.y - origin.y, vz = a.z - origin.z;
      const along = vx * dir.x + vy * dir.y + vz * dir.z;
      if (along <= 0 || along > maxDist) continue;
      const px = origin.x + dir.x * along, py = origin.y + dir.y * along, pz = origin.z + dir.z * along;
      const off = Math.hypot(a.x - px, a.y - py, a.z - pz);
      if (off > TOOLS.anchorAimRadius) continue;
      if (!best || along < best.distance) best = { anchor: a, distance: along, off };
    }
    return best;
  }

  /* ── describing ───────────────────────────────────────────────────────────────────
   *
   * §4.4: "one input should not change meaning invisibly." Everything E can do is named
   * here, in the same order act() tries it, so the prompt can never disagree with what the
   * key will actually do. Adding an action in one place and not the other is the bug this
   * shape exists to prevent — m11 asserts that a described action always succeeds.
   */

  /** @returns {{primary: string|null, secondary: string|null, target}} */
  describe(mover) {
    const s = this._for(mover.id);
    const t = this.probe(mover);
    const carried = s.carriedTool ? this.tools.get(s.carriedTool) : null;

    // 1. Finishing a strap beats everything — the player is mid-gesture.
    if (s.pendingAnchor) {
      if (t.kind === TARGET.OBJECT) {
        return { primary: `strap ${label(t.entity)} to this anchor`, secondary: 'cancel strap', target: t };
      }
      return { primary: null, secondary: 'cancel strap', target: t, hint: 'aim at cargo to finish the strap' };
    }

    // 2. Carrying a tool: E applies it. Q undoes what is in front of you if there is
    //    anything to undo, and otherwise puts the tool down — see secondary().
    if (carried) {
      const undo = t.kind === TARGET.OBJECT ? this._undoLabel(t.entity) : null;
      return {
        primary: this._applyLabel(carried, t),
        secondary: undo || `put down the ${carried.def.label.toLowerCase()}`,
        target: t,
        carrying: carried.def.label,
      };
    }

    // 3. Empty-handed.
    switch (t.kind) {
      case TARGET.TOOL:
        return { primary: `pick up the ${t.tool.def.label.toLowerCase()}`, secondary: null, target: t };

      case TARGET.ANCHOR:
        return { primary: 'start a strap here', secondary: null, target: t };

      case TARGET.CAB:
        return { primary: this._cabLabel(), secondary: null, target: t };

      case TARGET.OBJECT: {
        const e = t.entity;
        const onIt = this.straps.onEntity(e.id).filter((x) => x.state !== STRAP_STATE.FAILED);
        const tool = e.state.dollyId || e.state.blanketId;
        if (onIt.length) {
          return {
            primary: `tighten ${onIt.length} strap${onIt.length === 1 ? '' : 's'}`,
            secondary: 'release the straps',
            target: t,
          };
        }
        if (tool) {
          const which = e.state.dollyId ? 'dolly' : 'blanket';
          return { primary: null, secondary: `take the ${which} off`, target: t };
        }
        if ((e.state.removedParts || []).length) {
          return { primary: null, secondary: `put the ${e.state.removedParts[0]} back on`, target: t };
        }
        /* DEVICE-NEUTRAL. The grips are LMB/RMB for seat 0's mouse, [ ] for seat 1's
         * keyboard and LT/RT on a pad; the HUD knows which seat and device it is drawing
         * for and resolves the tokens (hud.js setPrompt). The room comes first because it
         * is the thing nothing else on screen says (§26.5 "destination … understandable"). */
        return { primary: null, secondary: null, target: t,
                 hint: `${label(e)}${this._roomHint(e)} — hold {gripL}/{gripR} to carry` };
      }

      default:
        return { primary: null, secondary: null, target: t };
    }
  }

  /** ' → living room' for a manifest item not yet in its room, '' otherwise. The contract
   *  panel's 'right room' line appears only AFTER the first delivery; this names the room
   *  BEFORE the pickup, which is when the choice is made (§21.1, §26.7). */
  _roomHint(entity) {
    const row = this.manifestRow(entity.id);
    if (!row || !row.toZone || (row.delivered && row.roomCorrect)) return '';
    return ` → ${this.roomLabel(row.toZone)}`;
  }

  _applyLabel(tool, t) {
    if (t.kind !== TARGET.OBJECT) {
      if (tool.def.effect === 'clearance') return 'deploy the ramp at the truck';
      return null;
    }
    const e = t.entity;
    switch (tool.def.effect) {
      case 'friction':
        return e.state.dollyId ? null : `put ${label(e)} on the dolly`;
      case 'protection':
        return e.state.blanketId ? null : `wrap ${label(e)}`;
      case 'dimensions': {
        const part = this._nextPart(e);
        return part ? `take the ${part} off ${label(e)}` : null;
      }
      case 'clearance':
        return 'deploy the ramp at the truck';
      default:
        return null;
    }
  }

  /** Is there anything on this object for Q to take back off? One place, so describe() and
   *  secondary() cannot disagree about whether there is. */
  _undoable(entity) {
    if (!entity) return false;
    if (this.straps.onEntity(entity.id).some((s) => s.state !== STRAP_STATE.FAILED)) return true;
    if (entity.state.dollyId || entity.state.blanketId) return true;
    return (entity.state.removedParts || []).length > 0;
  }

  /** …and what to call it. */
  _undoLabel(entity) {
    if (!entity) return null;
    const on = this.straps.onEntity(entity.id).filter((s) => s.state !== STRAP_STATE.FAILED);
    if (on.length) return 'release the straps';
    if (entity.state.dollyId) return 'take the dolly off';
    if (entity.state.blanketId) return 'take the blanket off';
    const part = (entity.state.removedParts || [])[0];
    return part ? `put the ${part} back on` : null;
  }

  _nextPart(entity) {
    const done = entity.state.removedParts || [];
    const entry = (entity.def.disassembly || []).find((p) => !done.includes(p.part));
    return entry ? entry.part : null;
  }

  _cabLabel() {
    if (this.route.state === 'parked') {
      const advice = this.route.canDepart();
      return advice.warn ? `drive to the destination — ${advice.reason}` : 'drive to the destination';
    }
    if (this.route.state === 'arrived') return 'finish the job and settle up';
    return null;
  }

  /* ── acting ───────────────────────────────────────────────────────────────────── */

  /** E. Returns a short message for the HUD, or null when nothing happened. */
  act(mover, simTimeMs = this.now()) {
    const s = this._for(mover.id);
    const t = this.probe(mover);
    const carried = s.carriedTool ? this.tools.get(s.carriedTool) : null;

    if (s.pendingAnchor) {
      if (t.kind !== TARGET.OBJECT) return null;
      const anchor = this.anchors.find((a) => a.id === s.pendingAnchor);
      s.pendingAnchor = null;
      const strap = this.straps.attach(anchor, t.entity, t.point, 0);
      return strap ? this._say(`strapped ${label(t.entity)}`) : null;
    }

    if (carried) return this._applyTool(mover, carried, t, simTimeMs);

    switch (t.kind) {
      case TARGET.TOOL:
        return this._pickUp(mover, t.tool);

      case TARGET.ANCHOR:
        s.pendingAnchor = t.anchor.id;
        return this._say('now aim at the cargo');

      case TARGET.CAB:
        return this._useCab();

      case TARGET.OBJECT: {
        const onIt = this.straps.onEntity(t.entity.id).filter((x) => x.state !== STRAP_STATE.FAILED);
        if (!onIt.length) return null;
        for (const st of onIt) this.straps.tension(st.id);
        return this._say('ratchet');
      }

      default:
        return null;
    }
  }

  /**
   * Q. The universal undo.
   *
   * UNDOING WHAT IS IN FRONT OF YOU BEATS PUTTING DOWN WHAT YOU ARE HOLDING, and that order
   * was the other way round to begin with. It made reassembly unreachable: you need the
   * screwdriver in your hand to put the wardrobe doors back on, and while it was in your
   * hand Q only ever put the screwdriver down. §8.2 asks for "unscrew and REATTACH" — half
   * of that was impossible to perform.
   *
   * So Q means "undo the thing I am looking at", and falls back to "put down what I am
   * holding" when there is nothing to undo. Looking away is how you put a tool down while
   * standing next to a strapped fridge, and the prompt says which one you are about to get.
   */
  secondary(mover) {
    const s = this._for(mover.id);
    const t = this.probe(mover);

    if (s.pendingAnchor) { s.pendingAnchor = null; return this._say('strap cancelled'); }

    if (t.kind === TARGET.OBJECT && !this._undoable(t.entity) && s.carriedTool) {
      const tool = this.tools.get(s.carriedTool);
      this._putDown(mover, tool, t);
      return this._say(`put down the ${tool.def.label.toLowerCase()}`);
    }
    if (t.kind !== TARGET.OBJECT && s.carriedTool) {
      const tool = this.tools.get(s.carriedTool);
      this._putDown(mover, tool, t);
      return this._say(`put down the ${tool.def.label.toLowerCase()}`);
    }

    if (t.kind === TARGET.OBJECT) {
      const e = t.entity;
      const onIt = this.straps.onEntity(e.id);
      if (onIt.length) {
        for (const st of onIt) this.straps.release(st.id);
        return this._say('straps off');
      }
      if (e.state.dollyId) {
        this.tools.detachDolly(this.tools.get(e.state.dollyId));
        return this._say('dolly out');
      }
      if (e.state.blanketId) {
        this.tools.removeBlanket(this.tools.get(e.state.blanketId));
        return this._say('blanket off');
      }
      const part = (e.state.removedParts || [])[0];
      if (part) {
        reassemble(this.registry, e, part);
        if (this.bus) this.bus.emit(EVENTS.PART_CHANGED, { entityId: e.id, part, action: 'restored' }, this.now());
        return this._say(`${part} back on`);
      }
    }
    return null;
  }

  /* ── tools ────────────────────────────────────────────────────────────────────── */

  _pickUp(mover, tool) {
    const s = this._for(mover.id);
    if (s.carriedTool) return null;
    // Kinematic while carried: a dynamic body held by a kinematic capsule is a wrestling
    // match, and §9.2 only needs the tool to travel with the mover, not to be simulated in
    // their hands. It becomes dynamic again the moment it is put down.
    tool.body.setBodyType(this.physics.R.RigidBodyType.KinematicPositionBased, true);
    tool.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    tool.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    tool.collider.setCollisionGroups(GROUP_PRESETS.toolCarried);
    tool.state.carriedBy = mover.id;
    s.carriedTool = tool.id;
    if (this.bus) this.bus.emit(EVENTS.TOOL_STATE, { toolId: tool.id, state: 'carried', by: mover.id }, this.now());
    return this._say(`carrying the ${tool.def.label.toLowerCase()}`);
  }

  _putDown(mover, tool, t) {
    const s = this._for(mover.id);
    const p = t && t.point ? t.point : this._carryPoint(mover);
    tool.body.setBodyType(this.physics.R.RigidBodyType.Dynamic, true);
    tool.body.setTranslation(
      { x: p.x, y: Math.max(p.y, tool.def.dimensions.y / 2) + 0.05, z: p.z }, true);
    tool.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    /* BACK INTO THE WORLD'S COLLISION GROUP. `toolCarried` collides with nothing, including
     * the ground; the three _applyTool drop paths restored `object` and this one did not, so
     * a tool put down with Q fell through the floor for ever (m11 T3 measured y = -1.32 m
     * one second after the drop, and tools have no §18.3 recovery). */
    tool.collider.setCollisionGroups(GROUP_PRESETS.object);
    tool.state.carriedBy = null;
    s.carriedTool = null;
    if (this.bus) this.bus.emit(EVENTS.TOOL_STATE, { toolId: tool.id, state: 'dropped' }, this.now());
  }

  _applyTool(mover, tool, t, simTimeMs) {
    const s = this._for(mover.id);

    if (tool.def.effect === 'clearance') {
      // §9.1's ramp bridges the truck deck, so it deploys at the truck's rear lip. §8.1's
      // "park position affects ramp angle" comes out of where the truck is, not a menu.
      const head = rampAnchorPoint();
      const foot = Math.sqrt(Math.max(0.01, TOOLS.ramp.length ** 2 - CARGO_BOX.deckY ** 2));
      const geo = this.tools.deployRamp(tool, head, { x: 0, z: -1 }, foot);
      if (!geo) return null;
      tool.collider.setCollisionGroups(GROUP_PRESETS.object);
      tool.state.carriedBy = null;
      s.carriedTool = null;
      return this._say(`ramp down — ${geo.angleDeg.toFixed(0)}°`);
    }

    if (t.kind !== TARGET.OBJECT) return null;
    const e = t.entity;

    switch (tool.def.effect) {
      case 'friction': {
        if (!this.tools.attachDolly(tool, e)) return null;
        // The dolly stays under the object, not in your hands.
        tool.body.setBodyType(this.physics.R.RigidBodyType.Dynamic, true);
        tool.collider.setCollisionGroups(GROUP_PRESETS.object);
        tool.state.carriedBy = null;
        s.carriedTool = null;
        return this._say(`${label(e)} on the dolly`);
      }
      case 'protection': {
        if (!this.tools.applyBlanket(tool, e)) return null;
        tool.body.setBodyType(this.physics.R.RigidBodyType.Dynamic, true);
        tool.collider.setCollisionGroups(GROUP_PRESETS.object);
        tool.state.carriedBy = null;
        s.carriedTool = null;
        return this._say(`${label(e)} wrapped`);
      }
      case 'dimensions': {
        const part = this._nextPart(e);
        if (!part) return null;
        const r = disassemble(this.registry, e, part);
        if (!r) return null;
        if (this.bus) {
          this.bus.emit(EVENTS.PART_CHANGED,
            { entityId: e.id, part, action: 'removed', dimensions: r.after }, simTimeMs);
        }
        const saved = (1 - r.volumeAfter / r.volumeBefore) * 100;
        return this._say(`${part} off — ${saved.toFixed(0)}% smaller`);
      }
      default:
        return null;
    }
  }

  /** Where a carried tool rides: in front of the mover's chest, at the aim yaw. */
  _carryPoint(mover) {
    const p = mover.controller.position;
    const yaw = mover.grips.aimYaw;
    return {
      x: p.x - Math.sin(yaw) * 0.55,
      y: p.y + 1.05,
      z: p.z - Math.cos(yaw) * 0.55,
    };
  }

  /* ── the truck ────────────────────────────────────────────────────────────────── */

  /* THE PHASE CHANGES GO THROUGH game.setPhase, not a bare bus emit. Until the Phase 11
   * plan's M1 this emitted CONTRACT_PHASE{to:'transit'} onto the bus, which nothing listened for,
   * so state.phase stayed 'pickup' for the whole drive, DELIVERY was unreachable and the
   * arrival notice never fired. §3.4 has one phase machine; this is a caller of it. The
   * return strings are the HUD's and are pinned (m11 B6/E4, m12 G2/G3). */
  _useCab() {
    if (this.route.state === 'parked') {
      const advice = this.route.canDepart();
      this.route.depart();
      // §3.4's Secure exit is "warnings acknowledged": the advice rides on the validation.
      this.setPhase(PHASES.TRANSIT, { ok: true, warn: !!advice.warn, reason: advice.reason || '' });
      return this._say(advice.warn ? `driving — ${advice.reason}` : 'driving');
    }
    if (this.route.state === 'arrived') {
      this.setPhase(PHASES.SETTLEMENT);
      return this._say('settling up');
    }
    return null;
  }

  /* ── per-step ─────────────────────────────────────────────────────────────────── */

  /** Keep carried tools travelling with their mover. Runs before the physics step. */
  step(movers, stepMs) {
    for (const m of movers) {
      const s = this._for(m.id);
      if (!s.carriedTool) continue;
      const tool = this.tools.get(s.carriedTool);
      if (!tool) { s.carriedTool = null; continue; }
      const p = this._carryPoint(m);
      tool.body.setTranslation(p, true);
      const yaw = m.grips.aimYaw;
      tool.body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
    }
    void stepMs;
  }

  _say(msg) { this.lastMessage = msg; return msg; }
}

/** A short human name for an object. §21.2 needs to say WHICH thing, and `box_small_01#7`
 *  is an identifier rather than a name. */
export function label(entity) {
  if (!entity) return 'it';
  return (entity.defId || '')
    .replace(/_\d+$/, '')
    .replace(/_/g, ' ')
    .replace(/\b(\w)/g, (c) => c);
}

/** Current footprint, for the HUD's clearance readout. */
export function footprintOf(entity) {
  const d = currentDimensions(entity);
  return { min: Math.min(d.x, d.z), x: d.x, y: d.y, z: d.z };
}

/** Is this object in the truck right now? Used by the HUD's cargo line. */
export function inTruck(entity) {
  const t = entity.body.translation();
  return insideCargo({ x: t.x, y: t.y, z: t.z });
}

void GRIP;
