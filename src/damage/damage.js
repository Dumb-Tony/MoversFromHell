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
 *                    the mass that hit it. This is where mass belongs.
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
import { conditionLossFor, impactToleranceOf } from '../tools/tools.js';

/** §8.3's condition bands, as a lookup. Condition is 0..100 (§7.2). */
export function bandFor(condition) {
  for (const b of DAMAGE.bands) if (condition >= b.min) return b;
  return DAMAGE.bands[DAMAGE.bands.length - 1];
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
    for (const e of this.registry.entities.values()) {
      const v = e.body.linvel();
      const speed = Math.hypot(v.x, v.y, v.z);
      const prev = this._lastSpeed.get(e.id) || 0;
      this._lastSpeed.set(e.id, speed);

      // Speed LOST this step. A held object being carried loses nothing; a dropped one does.
      const lost = prev - speed;
      if (lost <= 0) { this._decayWindow(e, stepMs, simTimeMs); continue; }

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
      e.state.condition = Math.max(0, e.state.condition - loss);

      this.impactCount++;
      if (this.bus) {
        this.bus.emit(EVENTS.IMPACT, {
          entityId: e.id, relVelocity: lost, position: { x: t.x, y: t.y, z: t.z },
          materials: e.def.surfaceTags,
        }, simTimeMs);
      }
    }
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
  }

  /** §15.1's item-damage total, and §8.4's running total during work. */
  totals() {
    const lines = (this.state && this.state.ledger) ? this.state.ledger.itemDamage : [];
    return {
      lines: lines.length,
      cost: Number(lines.reduce((s, l) => s + l.cost, 0).toFixed(2)),
      worst: lines.reduce((w, l) => (l.cost > (w ? w.cost : -1) ? l : w), null),
    };
  }

  /** Reset for a replay (§26.6: "reset removes transient straps, grips, damage records"). */
  reset() {
    this._open.clear();
    this._lastSpeed.clear();
    this.impactCount = 0;
    if (this.state && this.state.ledger) this.state.ledger.itemDamage.length = 0;
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
