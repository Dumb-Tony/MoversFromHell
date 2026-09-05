/* Damage — GDD §8.3, §8.4, §7.4, §10.4, §12.2.
 *
 * This is the file where consequence stops being a number in a config block and starts
 * happening to objects. Everything it does is governed by four sentences:
 *
 *   §8.3  "Contact energy above threshold accumulates damage."
 *   §8.3  "A fragile television and a cheap box should not share a generic hit-point curve."
 *   §8.3  "Repeated minor contact needs cooldown and aggregation so a scrape is priced
 *          coherently."
 *   §10.4 "It must not secretly damage items without a physical cause."
 *
 * TWO LEDGERS, NOT ONE, because §15.1 prices them as separate line items and §8.4 requires
 * property damage to be attributable to a LOCATION rather than to an object:
 *
 *   ITEM damage      keyed on IMPACT SPEED, scaled by the object's own fragility band.
 *                    Speed, not impulse — impulse is m*dv, which made the 90 kg couch ten
 *                    times more delicate than a box of glassware purely for being heavy.
 *                    That is precisely backwards from §8.3 and was fixed in Phase 6.
 *   PROPERTY damage  keyed on IMPULSE, because what a WALL suffers really does scale with
 *                    the mass that hit it. This is where mass belongs. Written since Phase 11
 *                    build-side M14: the object's own m·Δv, attributed to the static surface
 *                    the narrow phase says pushed hardest that step (_attributeProperty),
 *                    aggregated per entity AND surface, capped per surface (§8.3 "maximum
 *                    charge"), and never a cause of anything but a line (§12.2).
 *
 * NOTHING HERE READS A PACK QUALITY SCORE. A badly packed truck damages its cargo because
 * unrestrained bodies moved and hit things, and for no other reason. If a future phase ever
 * wants to shortcut that, §10.4 says it may not.
 *
 * §12.2 is the other boundary: "Hard fail is never triggered solely by generic damage"
 * (§8.4). Nothing in this file ends a contract. It records.
 */

import { DAMAGE } from '../config.js';
import { EVENTS } from '../core/eventBus.js';
import { conditionLossFor, impactToleranceOf, breakInto } from '../tools/tools.js';
import { billable, labelFor } from './surfaces.js';

/** §8.3's condition bands, as a lookup. Condition is 0..100 (§7.2). */
export function bandFor(condition) {
  for (const b of DAMAGE.bands) if (condition >= b.min) return b;
  return DAMAGE.bands[DAMAGE.bands.length - 1];
}

/** The property bands (M14): by a window's total impulse in N·s, ascending `min`s. Below the
 *  first band nothing is charged, so the first band is also the floor. */
export function propertyBandFor(impulse) {
  const bands = DAMAGE.property.bands;
  let out = bands[0];
  for (const b of bands) if (impulse >= b.min) out = b;
  return out;
}

/** §15.1's property cost for a window's impulse, before the per-surface cap. Exported so a
 *  suite can pin the closed form: (impulse − threshold) × costPerImpulse, never negative. */
export function propertyCost(impulse) {
  const P = DAMAGE.property;
  return Math.max(0, (impulse - P.impulseThreshold) * P.costPerImpulse);
}

/** §15.1's item-damage line: replacement value scaled by how far the condition fell. */
export function repairCost(def, condition) {
  return def.replacementValue * bandFor(condition).costFraction;
}

export class DamageSystem {
  /**
   * @param {PhysicsWorld} physics
   * @param {ObjectRegistry} registry
   * @param {EventBus} bus
   * @param {object|function} state  game.state, for the §8.4 ledgers — or a GETTER for it
   */
  constructor(physics, registry, bus, state) {
    this.physics = physics;
    this.registry = registry;
    this.bus = bus;
    this._state = state;
    /** Open aggregation windows, keyed by entity. §8.3's "cooldown and aggregation". */
    this._open = new Map();
    /** Previous-step speeds, so an impact can be measured as a CHANGE in velocity. */
    this._lastSpeed = new Map();
    this.impactCount = 0;
    /* THE SECOND LEDGER (M14). Open PROPERTY windows keyed `${entityId}|${surfaceId}` — the
     * same window/decay pair as the item ledger, but one per surface an object is marking,
     * so a couch dragged along a wall AND scraping the door frame bills each once. */
    this._openProp = new Map();
    /** Scratch: the property keys touched this step, so the others can age. */
    this._touchedProp = new Set();
    /** EXPANSION HOOK (§8.2 "protect with blankets/runners"): tags a future runner tool has
     *  covered. Consulted before billing; nothing writes it yet. */
    this.protectedSurfaces = new Set();
    /** EXPANSION HOOK (§8.4 repair/cover-up tools): a multiplier on a window's charge,
     *  `(window) => number`, default 1. Nothing sets it yet. */
    this.mitigation = null;
  }

  /* THE STATE IS RESOLVED ON EVERY ACCESS, NOT CAPTURED. game.reset() replaces game.state
   * wholesale (game.js), which is right for a plain-data state with no back-references
   * (§22.4) — and it meant that from the first "Run it again" on, every ledger line this
   * system posted went into the PREVIOUS run's orphaned state while the invoice read the
   * new, empty one. Item damage was never billed on a replay, and reconcile() agreed
   * because both read the same empty ledger (Phase 11 plan, M2). main.js hands in
   * `() => game.state`; a suite that constructs the system directly may still pass an
   * object, and the setter keeps `damage.state = ...` working for either. */
  get state() { return typeof this._state === 'function' ? this._state() : this._state; }
  set state(v) { this._state = v; }

  /**
   * One fixed step, AFTER physics — an impact is only visible once the solver has resolved
   * it, and the quantity that matters is how much speed was lost in the collision.
   *
   * Measuring the velocity DELTA rather than reading contact-force events is a deliberate
   * choice. Rapier's contact forces are per-manifold and per-substep and need careful
   * filtering to avoid counting resting contact as a hit; the speed an object lost in one
   * step is unambiguous, is exactly what §8.3's "contact energy" means for an item, and
   * cannot fire while something is sitting still.
   */
  step(stepMs, simTimeMs = 0) {
    /* Items that entered the 'broken' band THIS step. Fragmented after the loop, not inside
     * it: breakInto spawns bodies into the map being iterated, and a fragment born mid-loop
     * would be visited with no previous speed (harmless, but a wasted read). M12. */
    const broke = [];
    const touched = this._touchedProp;
    touched.clear();
    for (const e of this.registry.entities.values()) {
      const v = e.body.linvel();
      const speed = Math.hypot(v.x, v.y, v.z);
      const prev = this._lastSpeed.get(e.id) || 0;
      this._lastSpeed.set(e.id, speed);

      // Speed LOST this step. A held object being carried loses nothing; a dropped one does.
      const lost = prev - speed;
      if (lost <= 0) { this._decayWindow(e, stepMs, simTimeMs); continue; }

      /* PROPERTY (M14) — before and INDEPENDENT of conditionLossFor: a sturdy couch at
       * 1 m/s is under its own 3.2 m/s threshold and marks nothing on itself, and still puts
       * 90 N·s into the wall. The gate is the object's OWN lost speed, m·Δv, never the
       * manifold force — resting contact loses ~0 speed a step, however hard a fridge leans. */
      this._attributeProperty(e, lost, simTimeMs, touched);

      const loss = conditionLossFor(e, lost);
      if (loss <= 0) { this._decayWindow(e, stepMs, simTimeMs); continue; }

      /* §8.3's AGGREGATION. "Repeated minor contact needs cooldown and aggregation so a
       * scrape is priced coherently." A couch dragged along a wall produces a contact every
       * step; without this the player is billed forty times for one scrape. Contacts inside
       * the window merge into one event, and only the merged total is reported. */
      const t = e.body.translation();
      let w = this._open.get(e.id);
      const near = w && Math.hypot(t.x - w.x, t.y - w.y, t.z - w.z) <= DAMAGE.aggregationRadius;
      if (w && near && w.ageMs < DAMAGE.aggregationWindowMs) {
        w.loss += loss;
        w.peakSpeed = Math.max(w.peakSpeed, lost);
        w.ageMs = 0;
      } else {
        if (w) this._closeWindow(e, w, simTimeMs);
        w = { x: t.x, y: t.y, z: t.z, loss, peakSpeed: lost, ageMs: 0, startedAt: simTimeMs };
        this._open.set(e.id, w);
      }

      // The condition change itself is immediate — §8.4 wants a mark AT impact. It is the
      // COST REPORT that is aggregated, not the physics.
      const bandBefore = bandFor(e.state.condition).name;
      e.state.condition = Math.max(0, e.state.condition - loss);
      if (bandBefore !== 'broken' && bandFor(e.state.condition).name === 'broken' && !e.state.fragments) broke.push(e);

      this.impactCount++;
      if (this.bus) {
        this.bus.emit(EVENTS.IMPACT, {
          entityId: e.id, relVelocity: lost, position: { x: t.x, y: t.y, z: t.z },
          materials: e.def.surfaceTags,
        }, simTimeMs);
      }
    }

    /* §26.4 "BROKEN REQUIRED CARGO STAYS DELIVERABLE OR BECOMES TRACKABLE PIECES" — both,
     * in the same step the band was crossed (M12). The hulk keeps its row, its mass and its
     * collider (nothing here touches them: it is still the thing that has to reach its
     * room); PARTS.brokenFragmentCount[fragility] fragments appear beside it as bodies the
     * registry, the cargo box and this system all see from now on. The cost was already
     * posted by the band (DAMAGE.bands 'broken' = the whole replacement value) — a fragment
     * is priced at 0, so nothing is billed twice (§10.4: no damage without a physical cause,
     * and no second bill for one cause). The event reuses PART_CHANGED with action 'broken'
     * so the recorder (runLog.js) and the caption layer already know its shape. */
    for (const e of broke) {
      const ids = breakInto(this.registry, e);
      if (!ids.length) continue;
      if (this.bus) {
        const t = e.body.translation();
        this.bus.emit(EVENTS.PART_CHANGED, {
          entityId: e.id, part: 'fragments', action: 'broken', pieces: ids.length,
          position: { x: t.x, y: t.y, z: t.z },
        }, simTimeMs);
      }
    }

    // Property windows not touched this step age, and close at the window's end (M14).
    this._decayPropWindows(stepMs, simTimeMs, touched);
  }

  /* ── property damage: WHAT was hit, by the narrow phase (M14) ──────────────────────────
   *
   * §8.4: "object/location, category, condition change, repair or replacement cost". The item
   * ledger above never needed to know what an object struck; this one is the location line,
   * so it reads Rapier's contact manifolds for the ONE step in which the object lost speed:
   *
   *   world.contactPairsWith(e.collider, other => …)             every collider in contact
   *   world.contactPair(e.collider, other, (manifold, flipped)…) its manifolds this step
   *   manifold.contactImpulse(i), .solverContactPoint(0), .normal()
   *
   * MEASURED, Rapier 0.20.0 (tools/m22-property-tests.js): contactPairsWith's callback gets a
   * Collider (the world casts the handle); contactPair's callback gets (TempContactManifold,
   * flipped) once per manifold, `flipped` meaning our collider is the pair's second; the
   * impulses are the solver's from the step just taken, in N·s.
   *
   * ATTRIBUTION RANKS EVERY CONTACT AND BILLS ONLY A BILLABLE WINNER. The surface that pushed
   * hardest on the object this step (largest Σ|contactImpulse|) is what stopped it, and it
   * takes the whole m·Δv. Floors, the ground, the deck, movers and other entities compete in
   * that ranking and win it whenever they are what the object actually hit — a TV landing on
   * the floor beside a wall it grazes is a floor landing, not a wall hit — but they are never
   * charged (surfaces.js billable). A corner hit (wall + header in one step) still bills the
   * one that took more; the other is free. Recorded in KNOWN_ISSUES.
   */
  _attributeProperty(e, lost, simTimeMs, touched) {
    const P = DAMAGE.property;
    const mass = e.body.mass();
    const impulse = mass * lost;
    if (!(impulse >= P.minStepImpulse)) return;
    const world = this.physics.world;
    const self = e.collider;
    if (!world || !self || typeof world.contactPairsWith !== 'function') return;

    let best = null;   // { collider, sum, at, normal }
    world.contactPairsWith(self, (other) => {
      let sum = 0, at = null, normal = null;
      world.contactPair(self, other, (manifold, flipped) => {
        const nc = manifold.numContacts();
        for (let i = 0; i < nc; i++) sum += Math.abs(manifold.contactImpulse(i));
        if (!normal) {
          const n = manifold.normal();
          normal = { x: n.x, y: n.y, z: n.z };
          // Rapier's manifold normal is expressed from the pair's first collider; when we
          // are the second it points the other way. Oriented below toward the object anyway.
          if (flipped) { normal.x = -normal.x; normal.y = -normal.y; normal.z = -normal.z; }
          // The centre of the contact patch, not its first corner: a box face-on to a wall
          // has four solver contacts and the mark belongs in the middle of them.
          const ns = manifold.numSolverContacts();
          if (ns > 0) {
            let sx = 0, sy = 0, sz = 0, cnt = 0;
            for (let i = 0; i < ns; i++) {
              const p = manifold.solverContactPoint(i);
              if (p) { sx += p.x; sy += p.y; sz += p.z; cnt++; }
            }
            if (cnt > 0) at = { x: sx / cnt, y: sy / cnt, z: sz / cnt };
          }
        }
      });
      if (sum > 0 && (!best || sum > best.sum)) best = { collider: other, sum, at, normal };
    });
    if (!best) return;
    const tag = this.physics.tagOf(best.collider);
    if (!tag || !billable(tag) || this.protectedSurfaces.has(tag)) return;

    const t = e.body.translation();
    const at = best.at || { x: t.x, y: t.y, z: t.z };
    /* The normal on the line is the SURFACE's: pointing away from the wall, toward the
     * object that hit it — which is where the decal goes and independent of which collider
     * Rapier listed first. */
    let n = best.normal || { x: 0, y: 1, z: 0 };
    const dot = n.x * (t.x - at.x) + n.y * (t.y - at.y) + n.z * (t.z - at.z);
    if (dot < 0) n = { x: -n.x, y: -n.y, z: -n.z };

    const key = `${e.id}|${tag}`;
    let w = this._openProp.get(key);
    const near = w && Math.hypot(at.x - w.x, at.y - w.y, at.z - w.z) <= DAMAGE.aggregationRadius;
    if (w && near && w.ageMs < DAMAGE.aggregationWindowMs) {
      w.impulse += impulse;
      w.peak = Math.max(w.peak, impulse);
      w.ageMs = 0;
    } else {
      if (w) this._closePropWindow(w, simTimeMs);
      w = {
        key, entityId: e.id, defId: e.defId, surfaceId: tag,
        x: at.x, y: at.y, z: at.z, at: { x: at.x, y: at.y, z: at.z },
        normal: n, impulse, peak: impulse, ageMs: 0, startedAt: simTimeMs,
        /** §8.4 "player attribution when reliable": who held it at first contact. Recorded
         *  for the run summary (M6); never scored (§15.3). */
        heldBy: (e.state.grips || []).map((g) => g.playerId).filter((id) => id != null),
      };
      this._openProp.set(key, w);
    }
    touched.add(key);
  }

  _decayPropWindows(stepMs, simTimeMs, touched) {
    if (this._openProp.size === 0) return;
    for (const [key, w] of [...this._openProp]) {
      if (touched.has(key)) continue;
      w.ageMs += stepMs;
      if (w.ageMs >= DAMAGE.aggregationWindowMs) this._closePropWindow(w, simTimeMs);
    }
  }

  /** Post ONE property line per closed window (§26.4 "one ledger entry"), capped per surface
   *  (§8.3 "maximum charge") — the cap re-derived from the ledger, so no extra state and a
   *  reset that clears the ledger clears the cap. A window that rounds to 0.00 (under the
   *  threshold, or a capped surface) writes NOTHING: no line, no event, no notice, no mark. */
  _closePropWindow(w, simTimeMs) {
    this._openProp.delete(w.key);
    const P = DAMAGE.property;
    const ledger = (this.state && this.state.ledger) ? this.state.ledger : null;
    if (ledger && !Array.isArray(ledger.propertyDamage)) ledger.propertyDamage = [];
    const lines = ledger ? ledger.propertyDamage : [];
    const already = lines.reduce((s, l) => s + (l.surfaceId === w.surfaceId ? l.cost : 0), 0);
    const room = Math.max(0, P.maxChargePerSurface - already);
    let raw = propertyCost(w.impulse);
    if (typeof this.mitigation === 'function') raw *= this.mitigation(w);
    const cost = Number(Math.min(raw, room).toFixed(2));
    if (!(cost > 0)) return;
    const line = {
      category: 'property',
      surfaceId: w.surfaceId,
      /** §8.4 "object/location": the words for the surface (surfaces.js). */
      location: labelFor(w.surfaceId),
      entityId: w.entityId,
      defId: w.defId,
      impulse: Number(w.impulse.toFixed(3)),
      peakStepImpulse: Number(w.peak.toFixed(3)),
      band: propertyBandFor(w.impulse).name,
      cost,
      at: { x: Number(w.at.x.toFixed(2)), y: Number(w.at.y.toFixed(2)), z: Number(w.at.z.toFixed(2)) },
      normal: { x: Number(w.normal.x.toFixed(3)), y: Number(w.normal.y.toFixed(3)), z: Number(w.normal.z.toFixed(3)) },
      timeMs: w.startedAt,
      heldBy: w.heldBy.slice(),
    };
    if (ledger) lines.push(line);
    // The SAME event the item ledger uses; every listener branches on `category`.
    if (this.bus) this.bus.emit(EVENTS.DAMAGE_APPLIED, { ...line, position: line.at }, simTimeMs);
  }

  /** The window closes at the CURRENT step's time, so the DAMAGE_APPLIED stamp is the
   *  moment the line was posted and never earlier than the ledger line's own timeMs, which
   *  is when the window opened (§27.4 wants timestamps that mean something). */
  _decayWindow(entity, stepMs, simTimeMs = 0) {
    const w = this._open.get(entity.id);
    if (!w) return;
    w.ageMs += stepMs;
    if (w.ageMs >= DAMAGE.aggregationWindowMs) this._closeWindow(entity, w, simTimeMs);
  }

  /** Post one aggregated §8.4 ledger line. */
  _closeWindow(entity, w, simTimeMs) {
    this._open.delete(entity.id);
    if (w.loss <= 0) return;
    const before = Math.min(100, entity.state.condition + w.loss);
    const cost = repairCost(entity.def, entity.state.condition) - repairCost(entity.def, before);
    const line = {
      entityId: entity.id,
      defId: entity.defId,
      /** §8.4: "object/location, category, condition change, repair or replacement cost". */
      conditionBefore: Number(before.toFixed(1)),
      conditionAfter: Number(entity.state.condition.toFixed(1)),
      band: bandFor(entity.state.condition).name,
      peakSpeed: Number(w.peakSpeed.toFixed(3)),
      cost: Number(Math.max(0, cost).toFixed(2)),
      at: { x: Number(w.x.toFixed(2)), y: Number(w.y.toFixed(2)), z: Number(w.z.toFixed(2)) },
      timeMs: w.startedAt,
    };
    if (this.state && this.state.ledger) this.state.ledger.itemDamage.push(line);
    if (this.bus) this.bus.emit(EVENTS.DAMAGE_APPLIED, line, simTimeMs);
  }

  /** Close every open window — call when a phase ends, so nothing is left unbilled. */
  flush(simTimeMs = 0) {
    for (const [id, w] of [...this._open]) {
      const e = this.registry.get(id);
      if (e) this._closeWindow(e, w, simTimeMs);
      else this._open.delete(id);
    }
    for (const w of [...this._openProp.values()]) this._closePropWindow(w, simTimeMs);
  }

  /** §15.1's item-damage total, and §8.4's running total during work. `lines`/`cost`/`worst`
   *  stay item-only (m8 prints them); `property` is the second ledger's (M14). */
  totals() {
    const ledger = (this.state && this.state.ledger) ? this.state.ledger : null;
    const lines = ledger ? ledger.itemDamage : [];
    const prop = ledger ? (ledger.propertyDamage || []) : [];
    return {
      lines: lines.length,
      cost: Number(lines.reduce((s, l) => s + l.cost, 0).toFixed(2)),
      worst: lines.reduce((w, l) => (l.cost > (w ? w.cost : -1) ? l : w), null),
      property: { lines: prop.length, cost: Number(prop.reduce((s, l) => s + l.cost, 0).toFixed(2)) },
    };
  }

  /** Reset for a replay (§26.6: "reset removes transient straps, grips, damage records"). */
  reset() {
    this._open.clear();
    this._openProp.clear();
    this._touchedProp.clear();
    this._lastSpeed.clear();
    this.impactCount = 0;
    if (this.state && this.state.ledger) {
      this.state.ledger.itemDamage.length = 0;
      if (Array.isArray(this.state.ledger.propertyDamage)) this.state.ledger.propertyDamage.length = 0;
      else this.state.ledger.propertyDamage = [];
    }
    for (const e of this.registry.entities.values()) e.state.condition = 100;
  }
}

/** Exposed for the HUD and for tests: what would an impact at this speed cost right now? */
export function previewDamage(entity, speed) {
  const loss = conditionLossFor(entity, speed);
  const after = Math.max(0, entity.state.condition - loss);
  return {
    tolerance: impactToleranceOf(entity),
    loss,
    band: bandFor(after).name,
    cost: repairCost(entity.def, after) - repairCost(entity.def, entity.state.condition),
  };
}
