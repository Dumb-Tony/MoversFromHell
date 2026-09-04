/* The drive — GDD §11.1, §11.3, §13.3, §10.5, §3.4.
 *
 * §11.1 sets the terms and they are unusually blunt: "Driving is the FINAL EXAM FOR PACKING,
 * not a racing minigame. Prototype travel lasts roughly one to three minutes... Controls are
 * forgiving and the road provides a FEW MEANINGFUL FORCE EVENTS."
 *
 * So the route is not a track. It is a timeline of the three hazards §13.3 requires — "one
 * hard brake, one meaningful turn and one bump so preparation produces visible consequences"
 * — and the interesting output is what happened to the cargo, not how well anyone steered.
 *
 * THE TRUCK DOES NOT MOVE, and this is the phase where that decision has to be defended.
 * §10.5: "Browser driving may use truck-local simulation or FORCE PROXIES if full
 * moving-world physics is unstable." Translating a kinematic cargo box full of sleeping
 * rigid bodies at 13.5 m/s is exactly that instability, and §11.3's hazard severities are
 * already written as impulse multipliers — the GDD had made this call before I did.
 *
 * What it costs is real and is recorded in KNOWN_ISSUES: no world goes past the windows, no
 * steering, and §11.2's "readable body roll" has nothing to roll. What it buys is that the
 * force a badly packed load feels is exact, repeatable and assertable, which is the only way
 * §25.2's gate — "poor pack shifts or damages VISIBLY" — can be shown to be true rather than
 * claimed.
 */

import { TRUCK, SIM } from '../config.js';
import { EVENTS } from '../core/eventBus.js';

/** §13.3: "Include one hard brake, one meaningful turn and one bump." Exactly those three,
 *  in an order that tells a story: settle in, brake, recover, turn, recover, bump, arrive. */
export const PROTOTYPE_ROUTE = Object.freeze([
  { at: 4.0,  type: 'hardBrake', durationS: 1.1, label: 'Traffic light' },
  { at: 12.0, type: 'sharpTurn', durationS: 1.4, label: 'Left onto Mill Road' },
  { at: 21.0, type: 'speedBump', durationS: 0.5, label: 'Speed bump' },
]);

/** §11.1: "prototype travel lasts roughly one to three minutes". The prototype route is at
 *  the short end deliberately — it is a test, and a long one would only be a longer test. */
export const ROUTE_DURATION_S = 28.0;

export const DRIVE_STATE = Object.freeze({
  PARKED: 'parked',
  DRIVING: 'driving',
  ARRIVED: 'arrived',
});

export class RouteDriver {
  /**
   * @param {CargoSystem} cargo
   * @param {EventBus} bus
   * @param {Array} route
   */
  constructor(cargo, bus, route = PROTOTYPE_ROUTE) {
    this.cargo = cargo;
    this.bus = bus;
    this.route = route;
    this.state = DRIVE_STATE.PARKED;
    this.elapsedS = 0;
    /** Which events have fired, so each fires once per drive. */
    this.fired = new Set();
    /** §11.2: "Driver can glance at a coarse cargo-status indicator." */
    this.activeEvent = null;
  }

  /** §3.4's TRANSIT phase begins. Nothing checks whether the load is secured first — see
   *  the note in canDepart(). */
  depart() {
    if (this.state === DRIVE_STATE.DRIVING) return false;
    this.state = DRIVE_STATE.DRIVING;
    this.elapsedS = 0;
    this.fired.clear();
    this.activeEvent = null;
    return true;
  }

  /**
   * §3.4's Secure exit condition is "warnings ACKNOWLEDGED", not "warnings resolved", and
   * this method is where that distinction lives.
   *
   * It returns advice, never permission. Refusing to let a badly packed truck depart would
   * be a hard denial of the kind §2.1 forbids — and worse, it would delete this phase's
   * entire gate, because "poor pack shifts or damages visibly" REQUIRES that a poor pack can
   * be driven. The warning is the game's job; the decision is the player's.
   */
  canDepart() {
    const q = this.cargo.packQuality();
    return {
      allowed: true,                       // always. See above.
      warn: q.warn,
      reason: q.warn
        ? `${(q.unsecuredFraction * 100).toFixed(0)}% of the load is unrestrained`
        : '',
      quality: q,
    };
  }

  /** Fixed step. Fires hazards at their scheduled times and holds each for its duration. */
  step(stepMs, simTimeMs = 0) {
    if (this.state !== DRIVE_STATE.DRIVING) return null;
    const dt = stepMs / 1000;
    this.elapsedS += dt;

    let active = null;
    for (const ev of this.route) {
      if (this.elapsedS >= ev.at && this.elapsedS < ev.at + ev.durationS) {
        active = ev;
        if (!this.fired.has(ev.label)) {
          this.fired.add(ev.label);
          if (this.bus) {
            this.bus.emit(EVENTS.ROAD_FORCE, {
              roadType: ev.type, label: ev.label,   // M6 found `type` shadowed the bus envelope's type (payload spread after it)
              severity: TRUCK.roadEvents[ev.type].severity,
            }, simTimeMs);
          }
        }
        break;
      }
    }

    this.activeEvent = active;
    if (active) this.cargo.applyRoadEvent(active.type);

    if (this.elapsedS >= ROUTE_DURATION_S) {
      this.state = DRIVE_STATE.ARRIVED;
      this.activeEvent = null;
    }
    return active;
  }

  /** §11.2's "coarse cargo-status indicator" — deliberately coarse. */
  status() {
    return {
      state: this.state,
      elapsedS: Number(this.elapsedS.toFixed(2)),
      progress: Math.min(1, this.elapsedS / ROUTE_DURATION_S),
      event: this.activeEvent ? this.activeEvent.label : null,
      remaining: this.route.filter((e) => !this.fired.has(e.label)).length,
    };
  }

  reset() {
    this.state = DRIVE_STATE.PARKED;
    this.elapsedS = 0;
    this.fired.clear();
    this.activeEvent = null;
  }
}

/** How many fixed steps one drive takes. Used by tests and by the §21.2 progress readout. */
export function routeSteps() { return Math.ceil(ROUTE_DURATION_S * 1000 / SIM.stepMs); }
