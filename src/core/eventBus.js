/* Domain event bus — GDD §23.3.
 *
 * Copied from AirportBaggageCrew\src\core\eventBus.js (Dev\INDEX.md → "Simulation loop,
 * time & state"), with the event vocabulary replaced by GDD §23.3's table.
 *
 * Deliberately NOT an event-sourcing framework. It is a subscribe/emit pair plus a
 * BOUNDED recent-event log. Bounded matters twice over here: GDD §26.6 forbids unbounded
 * growth in logs over three runs, and §15.2's customer review is assembled from "only the
 * two or three most salient events" — so the log is a diagnostic tail, and anything the
 * invoice needs is accumulated into the ledger as it happens, not replayed from here.
 *
 * Rendering and UI listen. They never emit gameplay events and never decide rules.
 */

export const EVENTS = Object.freeze({
  // ---- Simulation shell -----------------------------------------------------------
  SIM_RESET:        'SIM_RESET',
  SIM_PAUSED:       'SIM_PAUSED',
  SIM_RESUMED:      'SIM_RESUMED',
  INPUT_CONTEXT:    'INPUT_CONTEXT',    // foot <-> drive; GDD §4.4 demands this be visible

  // ---- GDD §23.3 core events ------------------------------------------------------
  // Payloads are the "minimum payload" column. Phase 0 emits none of them; they are
  // declared now so later phases cannot invent near-duplicate names.
  GRIP_STARTED:     'GRIP_STARTED',     // playerId, hand, entityId, localPoint, time
  GRIP_ENDED:       'GRIP_ENDED',       // playerId, hand, entityId, reason
  IMPACT:           'IMPACT',           // entities, point, impulse, materials, relVelocity
  DAMAGE_APPLIED:   'DAMAGE_APPLIED',   // target, source, category, amount, cost, position
  STRAP_CHANGED:    'STRAP_CHANGED',    // strapId, endpoints, tension, state, actor
  /* Phase 6. §9.2 requires tools to have "stable IDs and state so multiplayer authority and
   * save snapshots can represent them", which means their transitions have to be observable
   * rather than inferred from watching a body move. */
  TOOL_STATE:       'TOOL_STATE',       // toolId, entityId, state: attached|covered|deployed|detached
  PART_CHANGED:     'PART_CHANGED',     // entityId, part, removed|restored, dimensions
  /* Phase 11 M11. §8.2's door leaf on or off its hinges — observable, like a tool's state,
   * because §15.2's review tag front_door_removed and the run record both read it. */
  DOOR_STATE:       'DOOR_STATE',       // doorId, entityId, state: hung|removed|rehung|forced — 'hung' is announced silently on a run's first step (M23), 'forced' carries by/objectId/impulse
  /* Phase 11 build-side M30. §8.4 asks for a sound, a mark and a notice at EVERY impact;
   * §8.3's "maximum charge" caps the MONEY, not the feedback. A hit on a surface already at
   * DAMAGE.property.maxChargePerSurface posts no ledger line and no DAMAGE_APPLIED — the
   * ledger and its counters stay untouched, which is what m17 R2e and m22 PD10 pin — and says
   * so through this instead: cost 0, the surface named, at most one per
   * DAMAGE.property.cappedRepeatMs. A NAME OF ITS OWN rather than a flag on DAMAGE_APPLIED
   * precisely because runLog.js countEvent treats every property DAMAGE_APPLIED as a ledger
   * line, and this one is not one. */
  PROPERTY_CAPPED:  'PROPERTY_CAPPED',  // surfaceId, location, entityId, band, cost: 0, at, normal
  ZONE_CHANGED:     'ZONE_CHANGED',     // entityId, zoneId, entered|exited, settled
  CARGO_STATE:      'CARGO_STATE',      // entityId, truckId, secured, support, risk
  ROAD_FORCE:       'ROAD_FORCE',       // roadType, label, severity (never `type` — the envelope owns it)
  RECOVERY:         'RECOVERY',         // entityId, reason, fee, oldTransform, newTransform
  CONTRACT_PHASE:   'CONTRACT_PHASE',   // from, to, time, validationResult
});

/** GDD §12 phase machine (§3.4). Declared here so the phase names have one home. */
export const PHASES = Object.freeze({
  BRIEFING:   'briefing',
  PICKUP:     'pickup',
  SECURE:     'secure',
  TRANSIT:    'transit',
  DELIVERY:   'delivery',
  SETTLEMENT: 'settlement',
});

export class EventBus {
  constructor({ logSize = 256 } = {}) {
    this._handlers = new Map();   // type -> Set<fn>
    this._any = new Set();
    this.logSize = logSize;
    this.log = [];                // ring, newest last
    this.emitted = 0;
  }

  /** @returns {() => void} unsubscribe */
  on(type, fn) {
    let set = this._handlers.get(type);
    if (!set) { set = new Set(); this._handlers.set(type, set); }
    set.add(fn);
    return () => set.delete(fn);
  }

  /** @returns {() => void} unsubscribe */
  onAny(fn) { this._any.add(fn); return () => this._any.delete(fn); }

  off(type, fn) {
    const set = this._handlers.get(type);
    if (set) set.delete(fn);
  }

  emit(type, payload = {}, simTimeMs = 0) {
    const evt = { ...payload, type, simTimeMs };   // envelope keys WIN: a payload `type` used to turn ROAD_FORCE into 'hardBrake' (m17 R4e)
    this.emitted++;

    this.log.push(evt);
    if (this.log.length > this.logSize) this.log.shift();

    const set = this._handlers.get(type);
    // iterate a copy: a handler may unsubscribe itself mid-dispatch
    if (set) for (const fn of Array.from(set)) fn(evt);
    for (const fn of Array.from(this._any)) fn(evt);
    return evt;
  }

  /** Most recent events, newest first. Debug overlay only. */
  recent(n = 8) { return this.log.slice(-n).reverse(); }

  clearLog() { this.log.length = 0; this.emitted = 0; }

  /** Drop every subscriber. Contract reset rebuilds systems, so stale closures must not
   *  survive — GDD §26.6 requires reset to remove transient state completely. */
  clearHandlers() { this._handlers.clear(); this._any.clear(); }
}
