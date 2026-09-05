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

import { TOOLS, GRIP, DOOR, ECONOMY } from '../config.js';
import { EVENTS, PHASES } from '../core/eventBus.js';
import { disassemble, reassemble, currentDimensions, partStatus } from '../tools/tools.js';
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
   * @param {(ms:number, why:object)=>void} [chargeWorkMs]  bill preparation time to the
   *        contract's labour clock (§2.3, §8.2 "preparation time"). A disassembly's authored
   *        seconds are spent HERE, on the clock the invoice reads, rather than by freezing
   *        the player for a minute — the cost is real and the hands stay free. Defaults to
   *        a no-op for suites that build this system without a Game. Phase 11 M8.
   * @param {()=>{away:number, inTruck?:number, atSite?:number, notDelivered?:number, notDeliveredIds?:string[]}} [tripStatus]
   *        how many manifest rows still need another trip (manifest.js tripStatus — 'away'
   *        rows: not on the truck, not at the destination, or with a loose piece that is
   *        neither). The cab reads it at the destination to offer §3.4's "crew elects another
   *        trip" beside settling up (M13). M20: the same call carries `notDelivered` and its
   *        ids — manifest.js undeliveredRows, the set the invoice bills — so settlement()
   *        can price what Q will actually settle for. Defaults to nothing away and nothing
   *        undelivered, which is today's single-trip cab.
   */
  constructor({ physics, registry, tools, straps, cargo, route, rig, camera, bus,
                setPhase = null, now = null, manifestRow = null, roomLabel = null,
                chargeWorkMs = null, tripStatus = null }) {
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
    this.chargeWorkMs = typeof chargeWorkMs === 'function' ? chargeWorkMs : () => {};
    this.tripStatus = typeof tripStatus === 'function' ? tripStatus
      : () => ({ away: 0, inTruck: 0, atSite: 0, notDelivered: 0, notDeliveredIds: [] });

    /** Per-mover interaction state, keyed by the mover's stable id (§22.4). */
    this.state = new Map();
    this.anchors = cargoAnchors();
    this.lastMessage = '';
    /** §21.4 Cognition "optional hints" (Phase 11 build-side M19): the shell's `hints` switch,
     *  written by main.js. Off, _roomHint returns '' and the prompt names the object alone. */
    this.hints = true;
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
    /* The ray's origin is the camera's UN-NUDGED solve (grip.js aimOrigin → camera.js
     * unshakenEye, M20): a road jolt or a nearby impact moves the picture for up to
     * settleMs, never where this ray starts (§4.4 "what you see is what you aim"; m24 K6d). */
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
        return { primary: this._cabLabel(), secondary: this._cabSecondary(), target: t };

      case TARGET.OBJECT: {
        const e = t.entity;
        /* A door on its hinges (M11). Nothing E or a bare hand does to it; the prompt says
         * what would — §2.1: told in advance, never refused after the fact. */
        if (isLeaf(e) && e.state.hung) {
          return { primary: null, secondary: null, target: t,
                   hint: 'door — on its hinges; the screwdriver takes it off' };
        }
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
          return { primary: null, secondary: this._partLabel(e), target: t };
        }
        // A leaf off its hinges, within reach of its jamb: Q hangs it back (§8.2 "reattach").
        if (isLeaf(e) && this._atJamb(e)) {
          return { primary: null, secondary: DOOR_REHANG_LABEL, target: t,
                   hint: `${label(e)} — hold {gripL}/{gripR} to carry` };
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
    if (!this.hints) return '';   // M19: the hints switch, at the source
    // A loose piece (M12) goes where its parent goes: the leg's room is the couch's row.
    const link = entity.state.partOf || entity.state.fragmentOf;
    const row = this.manifestRow(link ? link.entityId : entity.id);
    if (!row || !row.toZone || (row.delivered && row.roomCorrect)) return '';
    return ` → ${this.roomLabel(row.toZone)}`;
  }

  /** Q's line for an object with a part off (M12): 'put the legs back on — 60 s' when every
   *  piece is within PARTS.reattachRange, else 'find the legs (1 of 4 missing)' — the same
   *  partStatus reassemble() refuses on, so the prompt never promises what Q cannot do.
   *  M20: the line CARRIES THE COST (§4.4, §8.2 — both directions of a disassembly are
   *  preparation, and the price is on the screen before the key), and a part authored
   *  non-reversible reads 'the legs cannot be put back' — Q says the same and does nothing,
   *  the M12 refusal's shape. */
  _partLabel(entity) {
    const part = (entity.state.removedParts || [])[0];
    if (!part) return null;
    const st = partStatus(this.registry, entity, part);
    if (!st.reversible) return `the ${part} cannot be put back`;
    if (st.missing > 0) return `find the ${part} (${st.missing} of ${st.of} missing)`;
    return `put the ${part} back on — ${st.seconds.toFixed(0)} s`;
  }

  _applyLabel(tool, t) {
    if (t.kind !== TARGET.OBJECT) {
      if (tool.def.effect === 'clearance') return 'deploy the ramp at the truck';
      return null;
    }
    const e = t.entity;
    /* A door leaf (M11). Hung, the screwdriver is the only tool with anything to say
     * (§8.2 "remove from hinges"); a dolly or a blanket on a door that is part of the wall
     * would be a promise act() could not keep. Off its hinges it is an ordinary object. */
    if (isLeaf(e) && e.state.hung) return tool.def.effect === 'dimensions' ? DOOR_REMOVE_LABEL : null;
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
    if ((entity.state.removedParts || []).length > 0) return true;
    return isLeaf(entity) && this._atJamb(entity);
  }

  /** A door leaf that is off its hinges and close enough to its jamb to be hung back:
   *  horizontal distance from where it is to where it hangs (state.home, house.js leafPose)
   *  within DOOR.rehangRange. One place, so describe(), _undoable() and secondary() agree. */
  _atJamb(entity) {
    if (!isLeaf(entity) || entity.state.hung || !entity.state.home) return false;
    // Not while a hand is on it: hanging a held leaf would leave a grip spring pulling on
    // a Fixed body and the leaf in the held collision group. Put it down, then Q.
    if (entity.state.held) return false;
    const t = entity.body.translation(), h = entity.state.home;
    return Math.hypot(t.x - h.x, t.z - h.z) <= DOOR.rehangRange;
  }

  /** …and what to call it. */
  _undoLabel(entity) {
    if (!entity) return null;
    const on = this.straps.onEntity(entity.id).filter((s) => s.state !== STRAP_STATE.FAILED);
    if (on.length) return 'release the straps';
    if (entity.state.dollyId) return 'take the dolly off';
    if (entity.state.blanketId) return 'take the blanket off';
    const part = (entity.state.removedParts || [])[0];
    if (part) return this._partLabel(entity);
    return this._atJamb(entity) ? DOOR_REHANG_LABEL : null;
  }

  _nextPart(entity) {
    const done = entity.state.removedParts || [];
    const entry = (entity.def.disassembly || []).find((p) => !done.includes(p.part));
    return entry ? entry.part : null;
  }

  /** How many rows still need another trip, as the cab sees it — only at the destination
   *  (route ARRIVED); parked at the house the question does not arise. M13. */
  _away() {
    if (this.route.state !== 'arrived') return 0;
    const s = this.tripStatus();
    return s && s.away > 0 ? s.away : 0;
  }

  /* THE CHOICE AT THE CAB (M13; §3.4 Pickup exit "required cargo loaded OR CREW ELECTS
   * ANOTHER TRIP", §12.2 "partial completion, extra cost"). With items still at the old
   * house, E is the trip back and Q is settling without them — and the prompt prices the
   * second in advance (§4.4: the key means what the line said; §2.1: told before, never
   * refused after). With nothing away the cab is what it always was. */
  _cabLabel() {
    if (this.route.state === 'parked') {
      const advice = this.route.canDepart();
      return advice.warn ? `drive to the destination — ${advice.reason}` : 'drive to the destination';
    }
    if (this.route.state === 'arrived') {
      const away = this._away();
      // M20: with nothing away, E is the settlement — priced like Q's would be when anything
      // is still undelivered (on the truck, or here but not yet in a room); bare otherwise.
      return away > 0 ? `drive back for ${away} more` : `finish the job and settle up${this._settlementWords()}`;
    }
    return null;
  }

  /**
   * What settling up NOW would bill, priced the way the invoice will bill it (M20; §4.4,
   * §15.1, §26.1). ONE definition: every undelivered required row — manifest.js
   * undeliveredRows, which invoice.js itemsLeftBehind reads for the LEFT_BEHIND line —
   * with where those rows are, so the line can say '1 still on the truck'. Until M20 the
   * prompt priced only the rows that needed another trip (`away`), and a box still on the
   * truck made the settlement one item larger than the prompt had promised (KNOWN_ISSUES,
   * Phase 21). Only at the destination; elsewhere the question does not arise.
   * @returns {{n:number, cost:number, away:number, inTruck:number, atSite:number, ids:string[]}}
   */
  settlement() {
    if (this.route.state !== 'arrived') return { n: 0, cost: 0, away: 0, inTruck: 0, atSite: 0, ids: [] };
    const s = this.tripStatus() || {};
    const away = s.away > 0 ? s.away : 0;
    const inTruck = s.inTruck > 0 ? s.inTruck : 0;
    const atSite = s.atSite > 0 ? s.atSite : 0;
    const n = Number.isFinite(s.notDelivered) ? s.notDelivered : away + inTruck + atSite;
    const ids = Array.isArray(s.notDeliveredIds) ? s.notDeliveredIds.slice() : [];
    return { n, cost: n * ECONOMY.leftBehindFee, away, inTruck, atSite, ids };
  }

  /** The price, in words, appended to a cab line: ' — 22 not delivered (1320.00), 1 still on
   *  the truck'. Empty when nothing is undelivered. */
  _settlementWords() {
    const st = this.settlement();
    if (st.n <= 0) return '';
    let words = ` — ${st.n} not delivered (${st.cost.toFixed(2)})`;
    if (st.inTruck > 0) words += `, ${st.inTruck} still on the truck`;
    if (st.atSite > 0) words += `, ${st.atSite} here but not yet in a room`;
    return words;
  }

  _cabSecondary() {
    // With nothing away, E settles (the cab is what it always was) and Q offers nothing.
    if (this._away() <= 0) return null;
    return `settle up${this._settlementWords()}`;
  }

  /** Settle NOW — M13's Q with rows still away, or E with nothing away. ONE place (M20), so
   *  the two keys cannot carry different numbers: the SETTLEMENT phase event carries what the
   *  invoice will bill (settlement(): the M20 count and where those rows are) and the notice
   *  names it — 'settling up — 22 not delivered (1 still on the truck)' — or is the bare
   *  'settling up' when nothing is undelivered, as it always was (m21 T3d/T3e, T6, T8). */
  _settle() {
    const st = this.settlement();
    this.setPhase(PHASES.SETTLEMENT,
      { ok: true, leftBehind: st.n, away: st.away, inTruck: st.inTruck, atSite: st.atSite });
    if (st.n <= 0) return this._say('settling up');
    return this._say(`settling up — ${st.n} not delivered` +
                     (st.inTruck > 0 ? ` (${st.inTruck} still on the truck)` : ''));
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

    /* Q at the cab, empty-handed, with items still away: settle without them (M13). AFTER
     * the put-downs above, because describe() promises "put down the …" whenever a tool is
     * carried, whatever is under the reticle — m11 B6 holds the prompt to its word. */
    if (t.kind === TARGET.CAB) {
      if (this._away() <= 0) return null;
      /* M20: the count is the invoice's — every undelivered row, on the truck or not — so
       * the notice, the prompt and the LEFT_BEHIND line say one number (m21 T3b/T3c/T3d);
       * _settle() is the same call E makes with nothing away, so E and Q cannot differ. */
      return this._settle();
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
        /* M20: a part authored non-reversible stays off — the prompt said so (§4.4), Q says
         * the same, and nothing is billed for nothing done. Every shipped entry is reversible. */
        const st = partStatus(this.registry, e, part);
        if (!st.reversible) return this._say(`the ${part} cannot be put back`);
        /* M12: reassemble() refuses while a piece is out of PARTS.reattachRange — the part
         * is not back on, nothing changes, and Q says what the prompt said (§4.4: the key
         * means what the line under the reticle said it would). */
        const r = reassemble(this.registry, e, part);
        if (!r) {
          return this._say(`${part}: ${st.missing} of ${st.of} missing — find them first`);
        }
        if (this.bus) {
          this.bus.emit(EVENTS.PART_CHANGED,
            { entityId: e.id, part, action: 'restored', pieces: r.piecesRemoved, seconds: r.seconds }, this.now());
        }
        /* §8.2 "unscrew and REATTACH" — and both directions are "preparation time" (M20).
         * Until M20 the legs came off for 60 s and went back for nothing, so the round trip
         * through a doorway was priced once (KNOWN_ISSUES 'Reattaching is free'). The same
         * entry.seconds × timeScale, on the same chargeWorkMs hook M8 wired for disassembly
         * (main.js: the labour clock the invoice reads AND the phase's §27.4 line; never in
         * BRIEFING/SETTLEMENT). A reset's forced reassemble goes through tools.js directly
         * and never lands here, so a replay cannot bill it (m11 P2d totals the sequence). */
        const prepMs = r.seconds * 1000;
        if (prepMs > 0) this.chargeWorkMs(prepMs, { entityId: e.id, part, seconds: r.seconds, action: 'restored' });
        return this._say(`${part} back on — ${r.seconds.toFixed(0)} s`);
      }
      /* §8.2 "reattach", for the house's own doors (M11): a leaf within DOOR.rehangRange of
       * its jamb goes back on its hinges — Fixed again at its home pose, the clear width
       * back to gap − t. Free of charge: the preparation was paid taking it off. */
      if (isLeaf(e) && this._atJamb(e)) {
        this.registry.hang(e, e.state.home);
        if (this.bus) {
          this.bus.emit(EVENTS.DOOR_STATE,
            { doorId: e.state.doorId, entityId: e.id, state: 'rehung', by: mover.id }, this.now());
        }
        return this._say('door back on its hinges');
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

    /* A door on its hinges (M11; §8.2 "Door: open or remove from hinges — preparation time
     * and replacement risk"). The screwdriver takes it off: the body goes Dynamic and is laid
     * flat beside the doorway (registry.unhang, house.js leafRestPose), DOOR.removeSeconds
     * land on the labour clock through the same chargeWorkMs hook a disassembly uses (M8;
     * §2.3), and DOOR_STATE 'removed' is on the bus for the run record and §15.2's review.
     * The opening is the full gap from this moment. Any other tool: nothing — _applyLabel
     * promised nothing, so nothing is refused here. */
    if (isLeaf(e) && e.state.hung) {
      if (tool.def.effect !== 'dimensions') return null;
      this.registry.unhang(e, e.state.rest || null);
      const seconds = DOOR.removeSeconds * TOOLS.screwdriver.timeScale;
      if (this.bus) {
        this.bus.emit(EVENTS.DOOR_STATE,
          { doorId: e.state.doorId, entityId: e.id, state: 'removed', by: mover.id }, simTimeMs);
      }
      this.chargeWorkMs(seconds * 1000, { entityId: e.id, doorId: e.state.doorId, seconds });
      return this._say(`door off its hinges — ${seconds.toFixed(0)} s of prep`);
    }

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
          // `pieces` (M12): how many bodies the part became — the recorder counts them.
          this.bus.emit(EVENTS.PART_CHANGED,
            { entityId: e.id, part, action: 'removed', dimensions: r.after, pieces: (r.pieces || []).length }, simTimeMs);
        }
        /* §8.2's tradeoff is "preparation time", and until Phase 11 M8 it was never paid:
         * disassemble() returned the authored seconds and this line threw them away, so
         * taking the legs off was free and §3.3's prepared branch had no cost to weigh
         * against the brute one. r.seconds already carries TOOLS.screwdriver.timeScale
         * (tools.js disassemble) — scaled once, there, never twice. The notice names the
         * price so the player learns what a minute of prep buys (§21.3). */
        const prepMs = r.seconds * 1000;
        this.chargeWorkMs(prepMs, { entityId: e.id, part, seconds: r.seconds });
        const saved = (1 - r.volumeAfter / r.volumeBefore) * 100;
        const loose = (r.pieces || []).length;
        return this._say(`${part} off — ${saved.toFixed(0)}% smaller · ${r.seconds.toFixed(0)} s of prep` +
                         (loose ? ` · ${loose} loose` : ''));
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
      /* §3.4's "crew elects another trip" (M13): the same timeline, heading back; the
       * 'phase' system in main.js turns its arrival into PICKUP with tripCount + 1. A PHASE
       * event, not a teleport — the truck never moves and both sites share one world. */
      const away = this._away();
      if (away > 0) {
        this.route.depart({ heading: 'back' });
        this.setPhase(PHASES.TRANSIT, { ok: true, returning: true, remaining: away });
        return this._say(`driving back for ${away} more`);
      }
      /* M20: with nothing away E IS the settlement, and _cabLabel priced it the way Q's line
       * would ('finish the job and settle up — 1 not delivered (60.00), 1 still on the
       * truck'); the press carries the same payload and notice as Q's (m21 T3e). */
      return this._settle();
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

/* ── door leaves (M11) ─────────────────────────────────────────────────────────── */

/** The two door verbs, as the prompt prints them — one string each, so describe() and the
 *  suites (m11 DL, m19 D4) can never disagree about the words. */
export const DOOR_REMOVE_LABEL = 'take the door off its hinges';
export const DOOR_REHANG_LABEL = 'hang the door back on its hinges';

/** Is this registry entity one of the house's door leaves? By its state, which main.js
 *  gives every leaf at spawn ({doorId, hung, home, rest} — plain data, §22.4). */
export function isLeaf(entity) {
  return !!(entity && entity.state && entity.state.doorId != null);
}

/** A short human name for an object. §21.2 needs to say WHICH thing, and `box_small_01#7`
 *  is an identifier rather than a name. */
export function label(entity) {
  if (!entity) return 'it';
  // A derived definition names itself (M12: 'couch 3seat leg', 'tv 55 fragment').
  if (entity.def && typeof entity.def.label === 'string' && entity.def.label) return entity.def.label;
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
