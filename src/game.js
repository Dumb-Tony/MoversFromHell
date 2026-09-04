/* Authoritative game state and the fixed-step loop — GDD §22.2 (App/State), §22.3, §22.4.
 *
 * Shape copied from AirportBaggageCrew\src\game.js (Dev\INDEX.md → "Authoritative game
 * state + observe-don't-own boundary"), including the property that makes pause correct:
 *
 *   TOTAL PAUSE BY CONSTRUCTION. Every mutation runs inside the clock's step callback.
 *   The clock refuses to call it while paused, so no system can forget to check a flag.
 *   §21.4 requires a solo pause that "freezes relevant simulation safely"; this is how.
 *
 * §22.4 asks for multiplayer-ready seams even in a single-player build. Three rules are
 * followed here and should keep being followed:
 *   - Players are keyed by a stable string id, never by array position.
 *   - State is plain serializable data. No THREE objects, no Rapier handles, no closures.
 *   - Systems observe state; they do not own it. Rendering never writes to state.
 */

import { GameClock } from './core/clock.js';
import { EventBus, EVENTS, PHASES } from './core/eventBus.js';
import { Rng, hashStr } from './core/rng.js';
import { Input, CONTEXTS } from './core/input.js';
import { SIM } from './config.js';

/** §23.2 contract runtime, plus the §22.4 session seam. Serializable by construction. */
export function createInitialState({ contractId = 'suburban_starter', seed = null } = {}) {
  return {
    // ---- session seam (§22.4) ----
    localPlayerId: 'p0',
    players: {
      p0: {
        id: 'p0',
        // Transform lives in state; the renderer reads it and never writes it.
        position: { x: 0, y: 0, z: 0 },
        yaw: 0,
        locomotion: 'grounded',        // §5.1 grounded|braced|stumbling|ragdoll|pinned|climbing
        grips: { left: null, right: null },
        exertion: 0,
      },
    },

    // ---- contract runtime (§23.2) ----
    contractId,
    seed: seed !== null ? seed >>> 0 : hashStr(contractId),
    phase: PHASES.BRIEFING,
    elapsedWorkMs: 0,
    estimateMs: 18 * 60 * 1000,        // §3.2 intro tier: 12-20 minutes
    overtimeTier: 0,
    tripCount: 0,

    manifest: [],                      // filled at Phase 5
    entities: {},                      // id -> object runtime state (§7.2), Phase 2+

    /** §8.4 / §15.1. Two ledgers because §15.1 prices them as separate line items and
     *  §8.4 requires property damage to be attributable to a location, not an object. */
    ledger: { propertyDamage: [], itemDamage: [], fees: [], bonuses: [] },
    recoveryCount: 0,

    /** §27.4 "capture phase duration". Sim milliseconds spent in EACH phase, keyed by the
     *  §3.4 phase name, accumulated on the same line as elapsedWorkMs so a paused game
     *  records nothing. Plain numbers only (§22.4; m0 E8 / m11 H2 pin serializability).
     *  Pattern: SmallTownEmergencyServices\src\game.js `state.telemetry` counters. */
    telemetry: {
      phaseMs: Object.fromEntries(Object.values(PHASES).map((p) => [p, 0])),
    },

    // ---- shell ----
    paused: false,
    inputContext: CONTEXTS.FOOT,
  };
}

export class Game {
  constructor({ contractId, seed, input, bus, clock } = {}) {
    this.bus = bus || new EventBus();
    this.clock = clock || new GameClock({ stepMs: SIM.stepMs, maxFrameMs: SIM.maxFrameMs });
    this.input = input || null;
    this.state = createInitialState({ contractId, seed });
    this.rng = new Rng(this.state.seed, 'contract');

    /** Systems that mutate state, run in order once per fixed step.
     *  Signature: (state, stepMs, ctx) => void. Registered by main.js. */
    this.systems = [];
    this._observers = new Set();

    /** §22.5 developer overlay counters. */
    this.stats = { steps: 0, frames: 0, lastStepMs: 0, systemMs: 0 };
  }

  /** Register a system. Order is explicit because physics must run before the damage
   *  aggregator that reads its contacts (§22.3 lists the order). */
  addSystem(name, fn) { this.systems.push({ name, fn }); return this; }

  /** Observe-don't-own: subscribers get the state to READ — systems never write from here.
   *  (The shell observer in main.js is the one exception: it is the shell, and it writes only
   *  through game.togglePause / setSeats, never game.state directly.) Nothing here clones, because
   *  §22.5 wants 60 FPS with 25 bodies and a per-frame deep clone cannot pay for itself.
   *  TheBenefactors' GameStore clones on read — correct there, too slow here. */
  subscribe(fn) { this._observers.add(fn); return () => this._observers.delete(fn); }
  _notify() { for (const fn of Array.from(this._observers)) fn(this.state); }

  // ---- loop -----------------------------------------------------------------------

  /** One RENDER frame. Returns steps executed, so the overlay can show catch-up. */
  frame(realDeltaMs) {
    this.stats.frames++;
    // Gamepad is poll-only; must precede steps. The frame length scales stick/key look so
    // 'sensitivity' is per second, not per refresh (input.js poll).
    if (this.input) this.input.poll(realDeltaMs);
    const steps = this.clock.advance(realDeltaMs, (stepMs, simTimeMs) => this.step(stepMs, simTimeMs));
    this._notify();
    return steps;
  }

  /** One FIXED simulation step. Every mutation in the game happens inside here. */
  step(stepMs, simTimeMs) {
    const t0 = performance.now();
    const ctx = { bus: this.bus, rng: this.rng, input: this.input, simTimeMs, game: this };

    for (const sys of this.systems) sys.fn(this.state, stepMs, ctx);

    // Labour cost accrues from SIM time, never wall-clock (§2.3, §15.1). Pausing must not
    // bill the player, and that falls out of this line being inside the step callback.
    if (this.state.phase !== PHASES.BRIEFING && this.state.phase !== PHASES.SETTLEMENT) {
      this.state.elapsedWorkMs += stepMs;
    }
    // §27.4 phase duration: every phase, including the two that bill no labour, so the
    // record says how long the contract actually spent where. Same clock, same step.
    const phaseMs = this.state.telemetry && this.state.telemetry.phaseMs;
    if (phaseMs) phaseMs[this.state.phase] = (phaseMs[this.state.phase] || 0) + stepMs;

    if (this.input) this.input.endStep();       // edges consumed per STEP, not per frame
    this.stats.steps++;
    this.stats.systemMs = performance.now() - t0;
    this.stats.lastStepMs = stepMs;
  }

  // ---- shell ----------------------------------------------------------------------

  setPaused(p) {
    const next = !!p;
    if (next === this.state.paused) return next;
    this.state.paused = next;
    this.clock.setPaused(next);
    this.bus.emit(next ? EVENTS.SIM_PAUSED : EVENTS.SIM_RESUMED, {}, this.clock.simTimeMs);
    return next;
  }
  togglePause() { return this.setPaused(!this.state.paused); }

  setInputContext(ctx) {
    if (ctx === this.state.inputContext) return ctx;
    this.state.inputContext = ctx;
    if (this.input) this.input.setContext(ctx);
    this.bus.emit(EVENTS.INPUT_CONTEXT, { context: ctx }, this.clock.simTimeMs);
    return ctx;
  }

  /** §3.4 phase machine. Validation is a predicate supplied by the caller so the exit
   *  conditions live with the system that can actually check them. */
  setPhase(to, validation = { ok: true }) {
    const from = this.state.phase;
    if (from === to) return to;
    this.state.phase = to;
    this.bus.emit(EVENTS.CONTRACT_PHASE, { from, to, validation }, this.clock.simTimeMs);
    return to;
  }

  /** §26.6: "reset removes transient straps, grips, damage records, fragments, and route
   *  state" and §25.3 wants a clean contract reset that does not need a page reload. The
   *  seed is preserved so a reset replays the same contract (§19.1). */
  reset({ contractId = this.state.contractId, seed = this.state.seed } = {}) {
    this.clock.reset();
    this.rng.reset(seed);
    this.state = createInitialState({ contractId, seed });
    this.bus.clearLog();
    if (this.input) { this.input.clear(); this.input.setContext(CONTEXTS.FOOT); }
    this.bus.emit(EVENTS.SIM_RESET, { contractId, seed }, 0);
    this._notify();
    return this.state;
  }
}
