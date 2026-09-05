/* Run recorder and run summary — GDD §22.3, §22.5, §27.4, §26.6. Phase 11 build-side M6.
 *
 * §22.3 asks the loop to "record a lightweight event log for scoring and debugging" and §22.5
 * to "export event log and invoice inputs for reproducible reports". The EventBus keeps a
 * 256-entry DIAGNOSTIC TAIL (eventBus.js), cleared on every reset — right for the overlay,
 * useless as a record. This file is the record:
 *
 *   RunRecorder      subscribes to bus.onAny and keeps EVERY event of the current run, up to
 *                    TELEMETRY.maxEventsPerRun (then it counts `dropped`), and accumulates the
 *                    §27.4 counters into game.state.telemetry.counters as the events pass.
 *   buildRunSummary  PURE. state + invoice + review + manifest summary + stats + recorder ->
 *                    one plain object with a key per §27.4 signal: phase duration, grips,
 *                    drops, recovery, damage, strap use, cargo motion, trips, completion,
 *                    restart. Pattern: SmallTownEmergencyServices\src\ui\shiftReport.js
 *                    buildShiftReport (pure state -> report, spreads the telemetry counters).
 *   compactRun       the same summary without its event list, for the save (§27.4 "deletable").
 *
 * THE RECORDER RUNS INSIDE THE FIXED STEP. onAny handlers are called synchronously from
 * bus.emit, which systems call from inside game.step — so `record` is a bare push and an O(1)
 * switch, no DOM, no allocation beyond the array slot. It never reads a body and never writes
 * anything but state.telemetry.counters, which nothing in the invoice reads: m17 R6 drives the
 * same scripted run with and without it and deep-equals the invoice lines and the ledger.
 *
 * §27.4: "Prefer local event logs and explicit opt-in upload … Logs must be human-readable and
 * deletable." Local: nothing here touches the network (CLAUDE.md: zero external requests).
 * Human-readable: the export is pretty-printed JSON. Deletable: the save's kept runs are one
 * button away from gone (invoiceScreen.js 'clear responses').
 */

import { EVENTS } from '../core/eventBus.js';
import { BUILD, TELEMETRY, TRUCK } from '../config.js';

/** The §27.4 counters, zeroed. Lives on game.state.telemetry.counters so it is plain
 *  serializable data (§22.4, m0 E8 / m11 H2 / m14 S7) and resets with the state. */
export function createTelemetryCounters() {
  return {
    grips: 0,
    /** GRIP_ENDED with any reason but 'released': stretched, slipped, knocked down … */
    drops: 0,
    /** Mover AND object recoveries — one RECOVERY stream (main.js movers, registry.recover). */
    recoveries: 0,
    /** DAMAGE_APPLIED — one per closed §8.3 aggregation window, i.e. one per ITEM ledger line. */
    damageEvents: 0,
    /** DAMAGE_APPLIED with category 'property' (M14) — one per property ledger line, counted
     *  apart so damageEvents === ledger.itemDamage.length holds on the first wall hit. */
    propertyEvents: 0,
    /** IMPACT — every damaging contact step, before aggregation. */
    impacts: 0,
    /** §10.3 strap use, by the state the strap entered. `placed` is the attach itself. */
    straps: { placed: 0, tensioned: 0, overstressed: 0, failed: 0, released: 0 },
    /** §10.2 cargo membership changes, plus §10.4's motion measurement: how many loaded items
     *  moved past CARGO.shiftToleranceM between departure and arrival, of how many measured. */
    cargo: { loaded: 0, unloaded: 0, shifted: 0, measured: 0 },
    roadEvents: 0,
    toolChanges: 0,
    partChanges: 0,
    /** M12 (§9.1 loose parts, §26.4 trackable pieces): piece bodies spawned this run — by
     *  the screwdriver (PART_CHANGED 'removed', `pieces`) and by breakage ('broken') — and
     *  how many were not at the destination at settlement (written by settle() in main.js
     *  from the manifest's piece status, the way worstCargoShift is written by 'phase'). */
    piecesCreated: 0,
    piecesLeftBehind: 0,
    /** Metres: the single largest departure-to-arrival displacement of a loaded item. Written
     *  by the 'phase' system in main.js from cargo.shiftSince (§27.4 "cargo motion"). */
    worstCargoShift: 0,
    /** M17 (§26.3 "observably different turn, brake, and bump results"): the same measure
     *  PER §11.3 EVENT — the worst displacement of a loaded item between that ROAD_FORCE and
     *  the next one (or the arrival), the max over every leg driven. Written by main.js's
     *  ROAD_FORCE observer and the 'phase' system's arrival, keyed by TRUCK.roadEvents. */
    shiftByEvent: { hardBrake: 0, sharpTurn: 0, speedBump: 0 },
  };
}

/**
 * Fold one stamped bus event into the counters. O(1): a switch on the type. Exported so the
 * suite can assert the classification without a bus.
 * @param {object} c  createTelemetryCounters()
 * @param {{type: string}} evt
 */
export function countEvent(c, evt) {
  switch (evt.type) {
    case EVENTS.GRIP_STARTED:   c.grips++; break;
    case EVENTS.GRIP_ENDED:     if (evt.reason !== 'released') c.drops++; break;
    case EVENTS.RECOVERY:       c.recoveries++; break;
    case EVENTS.DAMAGE_APPLIED:
      if (evt.category === 'property') c.propertyEvents = (c.propertyEvents || 0) + 1;
      else c.damageEvents++;
      break;
    case EVENTS.IMPACT:         c.impacts++; break;
    case EVENTS.STRAP_CHANGED: {
      // An attach arrives as state 'slack' with the anchor named (straps.js attach); every
      // later 'slack' is a ratchet loosening back, which is not a placement.
      if (evt.state === 'slack' && evt.anchorId) c.straps.placed++;
      else if (evt.state in c.straps) c.straps[evt.state]++;
      break;
    }
    case EVENTS.CARGO_STATE:    if (evt.loaded) c.cargo.loaded++; else c.cargo.unloaded++; break;
    case EVENTS.ROAD_FORCE:     c.roadEvents++; break;
    case EVENTS.TOOL_STATE:     c.toolChanges++; break;
    case EVENTS.PART_CHANGED:
      /* M12: a 'broken' PART_CHANGED is the damage system fragmenting an item, not a
       * screwdriver change, so it counts pieces and not partChanges; a 'removed' one counts
       * both. `pieces` is the number of bodies the event created. */
      if (evt.action === 'broken') c.piecesCreated += evt.pieces || 0;
      else { c.partChanges++; if (evt.action === 'removed') c.piecesCreated += evt.pieces || 0; }
      break;
    default:
      /* Kept as a guard, not a path. M6 MEASURED (m17 R4e) that a ROAD_FORCE arrived here
       * stamped 'hardBrake': route.js's payload carried its own `type` and EventBus.emit
       * spread the payload AFTER the envelope's. Both were fixed at integration (route.js
       * emits `roadType`; emit() spreads the payload FIRST, so an envelope key can never be
       * shadowed again) and the case above now counts every road event. If some future
       * emitter smuggles a `type` in, the §11.3 hazard table still recognises it here. */
      if (evt.label && TRUCK.roadEvents && TRUCK.roadEvents[evt.type]) c.roadEvents++;
      break;
  }
}

export class RunRecorder {
  /**
   * @param {object} [opts]
   * @param {number} [opts.maxEvents]  TELEMETRY.maxEventsPerRun unless a suite says otherwise
   * @param {() => object|null} [opts.counters]  where the counts go — a GETTER, because
   *        game.reset() replaces game.state wholesale (the same lesson as damage.js's state
   *        getter, M2). Null means "count nowhere": events are still kept.
   */
  constructor({ maxEvents = TELEMETRY.maxEventsPerRun, counters = null } = {}) {
    this.maxEvents = maxEvents;
    this.counters = counters;
    /** The current run's events, verbatim, oldest first — the same objects the bus stamped. */
    this.events = [];
    /** Events past maxEvents this run. Counters keep counting; only the list is capped. */
    this.dropped = 0;
    /** §27.4 "restart": how many times a contract was closed by a restart this SESSION.
     *  Deliberately on the recorder and not on state, so a reset cannot erase it. */
    this.restarts = 0;
    /** The previous run's summary, closed by closeRun(); null until the first restart. */
    this.lastRun = null;
    this._off = null;
    this._record = (evt) => this.record(evt);
  }

  get attached() { return !!this._off; }

  /** Subscribe to every event on the bus. Attaching twice replaces the first subscription. */
  attach(bus) {
    if (this._off) this._off();
    this._off = bus.onAny(this._record);
    return this;
  }

  detach() {
    if (this._off) this._off();
    this._off = null;
    return this;
  }

  /** The hot path. A bare push and an O(1) count — see the file header. */
  record(evt) {
    if (this.events.length < this.maxEvents) this.events.push(evt);
    else this.dropped++;
    const c = this.counters ? this.counters() : null;
    if (c) countEvent(c, evt);
  }

  /** Forget this run's events (the counters live on state and reset with it). */
  beginRun() {
    this.events = [];
    this.dropped = 0;
  }

  /**
   * Close the current run with the summary the caller built BEFORE the unwind (so a
   * reset's own GRIP_ENDED 'contract reset' events are not the next run's drops), count the
   * restart, and start the next. Returns what lastRun now holds.
   * @param {object|null} summary  buildRunSummary(...) or null for "nothing to keep"
   */
  closeRun(summary) {
    this.restarts++;
    this.lastRun = summary ? { ...summary, restarts: this.restarts } : null;
    this.beginRun();
    return this.lastRun;
  }
}

const money = (n) => Math.round(Number(n) * TELEMETRY.precision.money) / TELEMETRY.precision.money;
const mm = (n) => Math.round(Number(n) || 0);

/**
 * PURE: one plain object per run, a key per §27.4 signal. Nothing here reads a body, the
 * clock or the DOM; the date comes in through opts so the same inputs give the same output.
 *
 * @param {object} state            game.state
 * @param {object|null} invoice     buildInvoice(), or null before settlement
 * @param {object|null} review      reviewFor(), or null
 * @param {object|null} summary     manifestSummary(), or null
 * @param {object|null} stats       contributionStats(), or null
 * @param {RunRecorder|null} recorder
 * @param {{date?: string, questionnaire?: object|null}} [opts]
 */
export function buildRunSummary(state, invoice, review, summary, stats, recorder, opts = {}) {
  const tel = (state && state.telemetry) || {};
  const c = tel.counters || createTelemetryCounters();
  const phases = {};
  for (const [k, v] of Object.entries(tel.phaseMs || {})) phases[k] = mm(v);
  return {
    build: BUILD.label,
    date: opts.date || null,
    contractId: state.contractId,
    seed: state.seed,
    phase: state.phase,
    elapsedWorkMs: mm(state.elapsedWorkMs),
    /** §27.4 "phase duration" — sim ms per §3.4 phase (game.js accrues them). */
    phases,
    counters: {
      grips: c.grips,
      drops: c.drops,
      recoveries: c.recoveries,
      damageEvents: c.damageEvents,
      propertyEvents: c.propertyEvents || 0,
      impacts: c.impacts,
      straps: { ...c.straps },
      cargo: { ...c.cargo },
      roadEvents: c.roadEvents,
      toolChanges: c.toolChanges,
      partChanges: c.partChanges,
      piecesCreated: c.piecesCreated || 0,
      piecesLeftBehind: c.piecesLeftBehind || 0,
      /** state.tripCount, written by the 'phase' system when a return leg arrives back at
       *  the house (M13; §3.4 "crew elects another trip"). Note for the cargo-motion
       *  signals beside it: worstCargoShift is the MAX over every leg driven, while
       *  cargo.shifted / cargo.measured are the LAST leg's — an empty return leg measures
       *  whatever was still aboard. */
      trips: (stats && stats.trips) || state.tripCount || 1,
      worstCargoShift: Math.round((c.worstCargoShift || 0) * TELEMETRY.precision.metres) / TELEMETRY.precision.metres,
      /** M17: per-event worst shift, metres to the millimetre, every §11.3 event named
       *  whether or not it fired (a run that never drove exports three zeros). */
      shiftByEvent: Object.fromEntries(Object.keys(TRUCK.roadEvents).map((k) => [
        k, Math.round(((c.shiftByEvent && c.shiftByEvent[k]) || 0) * TELEMETRY.precision.metres) / TELEMETRY.precision.metres,
      ])),
    },
    delivered: summary ? summary.delivered : null,
    total: summary ? summary.total : null,
    roomCorrect: summary ? summary.roomCorrect : null,
    /** §27.4 "completion". */
    complete: !!(summary && summary.complete),
    invoice: invoice ? {
      income: money(invoice.income),
      costs: money(invoice.costs),
      profit: money(invoice.profit),
      grade: invoice.grade ? invoice.grade.letter : null,
      score: invoice.grade ? invoice.grade.score : null,
      lines: (invoice.lines || []).map((l) => ({ kind: l.kind, amount: money(l.amount), detail: l.detail })),
    } : null,
    review: review ? { text: review.text, tags: [...(review.tags || [])] } : null,
    stats: stats ? { ...stats } : null,
    /** §27.4 "restart": session restarts before this run (closeRun stamps its own count). */
    restarts: recorder ? recorder.restarts : 0,
    /** §27.3 answers, or null until the tester answers (questionnaire.js). */
    questionnaire: opts.questionnaire || null,
    eventsDropped: recorder ? recorder.dropped : 0,
    events: recorder ? recorder.events.slice() : [],
  };
}

/** The summary without its event list and invoice lines — what the save keeps. */
export function compactRun(s) {
  if (!s) return null;
  const { events, eventsDropped, review, stats, phase, ...rest } = s;
  void events; void review; void stats; void phase;
  return {
    ...rest,
    eventsRecorded: Array.isArray(events) ? events.length : 0,
    eventsDropped: eventsDropped || 0,
    invoice: s.invoice ? {
      income: s.invoice.income, costs: s.invoice.costs, profit: s.invoice.profit,
      grade: s.invoice.grade, score: s.invoice.score,
    } : null,
  };
}
