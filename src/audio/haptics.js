/* The optional haptic pulse — GDD §8.4's fourth channel (Phase 11 build-side M28).
 *
 * §8.4: "At impact: material sound, visual mark, optional haptic pulse, and one small cost
 * notice." Three of those four already exist — M9's sound, M14's mark, Phase 8's notice — and
 * this is the fourth. §11.3's road events are "felt in the seat"; M16 shakes the camera, this
 * shakes the hand. §10.3's overstressed strap is "creak, vibration". §21.4 Motion makes it a
 * switch that starts OFF when the OS asks for reduced motion, and §4.4 keeps controller parity
 * a NUANCE: nothing is withheld from the keyboard, because every cue here already has a sound
 * (audio.js) and a caption (hud.js) that reach every seat.
 *
 * IT LIVES BESIDE audio.js BECAUSE IT CONSUMES THE SAME CUE STREAM. The table it reads
 * (config HAPTICS) is keyed by exactly the cue types CUES is keyed by, and m18 A1g asserts the
 * two key sets are EQUAL — one cue-type list for sound, captions and rumble, so a new event
 * cannot arrive with a sound and no pulse (the direction that rots: m18 A1's own lesson).
 * The audio layer's silence threshold is reused verbatim (cueVolume ≤ 0 → nothing) on EVERY
 * channel, the §10.3 sustain included, so the settle of a box put down is not a thud for the
 * hand either.
 *
 * WHAT IT IS NOT. It is not a system: it never writes game.state, never spawns a body and
 * never touches the scene (m35 H7). It is an OBSERVER of the bus, like M16's shake sources.
 * The handlers run inside Game.step, so every one of them is an O(1) lookup and a fire-and-
 * forget actuator call — `playEffect` returns a promise that rejects with 'preempted' the
 * moment a second effect cancels it, and it is NEVER awaited in the frame path.
 *
 * THE PAD IS READ THROUGH INPUT, EVERY TIME. navigator.getGamepads() hands back FRESH objects
 * on every poll, so a reference cached at boot is a pad that stopped existing. input.js
 * records the object it actually polled per seat (padForSeat), which is also the seam a suite
 * installs a fake vibrationActuator through (m35).
 */

import { HAPTICS } from '../config.js';
import { EVENTS } from '../core/eventBus.js';
import { cueVolume } from './audio.js';

const EMPTY = Object.freeze([]);

/** A cue-type key in the HAPTICS table, as opposed to one of its scalars. Every EVENTS name is
 *  SCREAMING_SNAKE and every tuning key is camelCase, so the shape of the key IS the test —
 *  a new scalar cannot accidentally become a cue type, and m18 A1g's equality would catch it
 *  either way. */
const TYPE_KEY = /^[A-Z][A-Z0-9_]*$/;

/** The cue types the haptic table covers, in table order. The list m18 A1g compares with
 *  Object.keys(CUES). */
export const HAPTIC_TYPES = Object.freeze(Object.keys(HAPTICS).filter((k) => TYPE_KEY.test(k)));

/** The row for a cue type, or null. OWN properties only, for the reason audio.js's cueFor
 *  says: `HAPTICS.constructor` is a function inherited from Object.prototype. */
export function hapticFor(type) {
  const t = String(type);
  if (!TYPE_KEY.test(t)) return null;
  return Object.prototype.hasOwnProperty.call(HAPTICS, t) ? HAPTICS[t] : null;
}

/** How "hard" a row is, for the per-seat cap: the louder of the two motors. Pure, so the
 *  replace/drop decision in H3 is assertable without a pad. */
export function rowStrength(row) {
  if (!row) return 0;
  return Math.max(Number(row.strong) || 0, Number(row.weak) || 0);
}

export class Haptics {
  /**
   * @param {object} opts
   * @param {object} opts.input        the live Input; only `padForSeat(seat)` is used
   * @param {EventBus} [opts.bus]      attached at once when given
   * @param {() => number} [opts.seatCount]     how many seats are being read RIGHT NOW
   * @param {(id) => number} [opts.seatOfPlayer]  mover id -> seat, or -1
   * @param {(id) => string[]} [opts.holdersOf]   entity id -> the player ids gripping it
   * @param {() => number} [opts.drivingSeat]     M16's recorded driving seat, or -1
   * @param {() => boolean} [opts.enabled]        the shell's `rumble` switch, read LIVE
   * @param {() => number} [opts.now]             sim ms, for an event with no stamp
   */
  constructor({ input = null, bus = null, seatCount = () => 1, seatOfPlayer = () => -1,
                holdersOf = () => EMPTY, drivingSeat = () => -1, enabled = () => true,
                now = () => 0 } = {}) {
    this.input = input;
    this.seatCount = typeof seatCount === 'function' ? seatCount : () => Number(seatCount) || 1;
    this.seatOfPlayer = seatOfPlayer;
    this.holdersOf = holdersOf;
    this.drivingSeat = drivingSeat;
    this.enabled = enabled;
    this.now = now;

    /** '<seat>:<type>' -> the sim ms it last fired (HAPTICS.minGapMs). Bounded by
     *  seats × HAPTIC_TYPES, so it cannot grow with the run (§26.6). */
    this._lastAt = new Map();
    /** seat -> {untilMs, strength} for the pulse in the air. ONE slot per seat, not a list and
     *  not a tunable: the Gamepad API's actuator plays exactly one effect and issuing a second
     *  CANCELS the first, so "how many at once" is a fact about the hardware, not a knob. */
    this._active = [];
    /** strapId -> {seats, nextMs} while §10.3's overstressed state lasts. */
    this._sustain = new Map();
    this._unsubs = [];
    this._bus = null;
    /** Everything a suite (and the F3 overlay, if it ever wants it) can read back. */
    this.stats = { fired: 0, droppedGap: 0, droppedWeaker: 0, droppedSilent: 0, noPad: 0, noSeat: 0, rejected: 0 };
    if (bus) this.attach(bus);
  }

  /** Subscribe BY NAME for every haptic row that is a real EVENTS name (the same guard
   *  audio.js's attach uses), plus SIM_RESET to flush. Never onAny — the run recorder owns
   *  that seam. */
  attach(bus) {
    if (this._bus === bus) return this;
    this.detach();
    this._bus = bus;
    const onEvent = (e) => this._onEvent(e);
    for (const name of HAPTIC_TYPES) {
      if (!EVENTS[name]) continue;
      this._unsubs.push(bus.on(EVENTS[name], onEvent));
    }
    this._unsubs.push(bus.on(EVENTS.SIM_RESET, () => this.reset()));
    return this;
  }

  detach() {
    for (const off of this._unsubs) { try { off(); } catch (e) { /* ignore */ } }
    this._unsubs = [];
    this._bus = null;
    return this;
  }

  get attached() { return !!this._bus; }

  /** A new contract: no strap is creaking any more, and the gap stamps restart with the
   *  clock (a stamp from the last run is in the future of this one — audio.js takeCue). */
  reset() {
    this._lastAt.clear();
    this._sustain.clear();
    this._active.length = 0;
    return this;
  }

  // ---- routing -------------------------------------------------------------------------

  /** The pad object input polled for this seat LAST FRAME, or null. Never cached. */
  padForSeat(seat) {
    const inp = this.input;
    if (!inp || typeof inp.padForSeat !== 'function') return null;
    try { return inp.padForSeat(seat) || null; } catch (e) { return null; }
  }

  _seatOf(id) {
    if (id == null) return -1;
    try { const s = this.seatOfPlayer(id); return Number.isFinite(s) ? s : -1; } catch (e) { return -1; }
  }

  /** Which seats a cue belongs to, per the row's `to` (config HAPTICS documents the four).
   *  Always a fresh array of in-range seat indices, no duplicates. */
  seatsFor(row, e) {
    const n = Math.max(0, this.seatCount() | 0);
    const all = () => { const out = []; for (let s = 0; s < n; s++) out.push(s); return out; };
    const uniq = (ids) => {
      const out = [];
      for (const id of ids) { const s = this._seatOf(id); if (s >= 0 && s < n && !out.includes(s)) out.push(s); }
      return out;
    };
    const to = row && row.to;
    if (to === 'driver') {
      let s = -1;
      try { s = this.drivingSeat(); } catch (err) { s = -1; }
      // No driver, no pulse — the same answer M16's shake observer gives (main.js).
      return (Number.isFinite(s) && s >= 0 && s < n) ? [s] : [];
    }
    if (to === 'holder') {
      let ids = Array.isArray(e && e.heldBy) && e.heldBy.length ? e.heldBy : null;
      if (!ids && e && e.entityId != null) {
        try { ids = this.holdersOf(e.entityId) || EMPTY; } catch (err) { ids = EMPTY; }
      }
      const seats = uniq(ids || EMPTY);
      return seats.length ? seats : all();
    }
    if (to === 'player') {
      // playerId (grips), `by` (tools, doors), and an entityId that IS a mover (a mover's own
      // RECOVERY carries the mover id there). A tool's recovery names a tool: no seat, so it
      // falls through to everybody, which is what a thing being teleported back is.
      const seats = uniq([e && e.playerId, e && e.by, e && e.entityId]);
      return seats.length ? seats : all();
    }
    return all();
  }

  // ---- firing --------------------------------------------------------------------------

  /**
   * One pulse on one seat. The whole gate, in order: the switch, the seat, the per-type gap,
   * the per-seat concurrency cap, then the pad. The gap stamp is only spent when a real
   * actuator call happens — a seat with no pad must not silence the seat that has one.
   * @returns {boolean} whether playEffect was called
   */
  pulse(seat, gapType, row, nowMs) {
    if (!row) return false;
    let on = true;
    try { on = !!this.enabled(); } catch (e) { on = false; }
    if (!on) return false;
    const n = Math.max(0, this.seatCount() | 0);
    if (!(seat >= 0 && seat < n)) { this.stats.noSeat++; return false; }

    const key = `${seat}:${gapType}`;
    const last = this._lastAt.get(key);
    /* `last <= nowMs` is not redundant (audio.js takeCue): a replay restarts the clock at 0
     * while a stamp from the last run is still here, and a stamp in the future reads as "the
     * gap has not passed" very nearly for ever. reset() clears it, this is the belt. */
    if (last != null && last <= nowMs && nowMs - last < HAPTICS.minGapMs) { this.stats.droppedGap++; return false; }

    const strength = rowStrength(row);
    const act = this._active[seat];
    // The actuator serialises: issuing a second effect CANCELS the first. A weaker cue
    // arriving inside a stronger one's window would therefore make the strong pulse shorter
    // AND weaker, so it stands down; a stronger one replaces it.
    // Strictly weaker only: an EQUAL-strength cue that has already cleared the per-type gap
    // above is a second, genuinely distinct event (a second damage line, a second road event),
    // and swallowing it would read as 'the hand missed it'. A stronger one still replaces.
    if (act && act.untilMs > nowMs && strength < act.strength) { this.stats.droppedWeaker++; return false; }

    const pad = this.padForSeat(seat);
    const motors = pad && pad.vibrationActuator;
    if (!motors || typeof motors.playEffect !== 'function') { this.stats.noPad++; return false; }

    this._lastAt.set(key, nowMs);
    this._active[seat] = { untilMs: nowMs + (Number(row.ms) || 0), strength };
    this.stats.fired++;
    /* NEVER AWAITED. playEffect rejects with 'preempted' as soon as the next effect cancels
     * this one, which is a normal thing to happen mid-drive; an unhandled rejection in the
     * frame path would be a console full of red for a feature that worked. */
    try {
      const p = motors.playEffect(HAPTICS.effect, {
        duration: Number(row.ms) || 0,
        startDelay: 0,
        strongMagnitude: Number(row.strong) || 0,
        weakMagnitude: Number(row.weak) || 0,
      });
      if (p && typeof p.catch === 'function') p.catch(() => { this.stats.rejected++; });
    } catch (e) {
      this.stats.rejected++;
    }
    return true;
  }

  _onEvent(e) {
    if (!e || !e.type) return;
    // A `silent: true` event is bookkeeping for the run record, not a happening (audio.js).
    if (e.silent === true) return;
    let on = true;
    try { on = !!this.enabled(); } catch (err) { on = false; }
    if (!on) return;
    const row = hapticFor(e.type);
    if (!row) return;
    const nowMs = Number.isFinite(e.simTimeMs) ? e.simTimeMs : (Number(this.now()) || 0);

    /* The audio layer's own silence threshold, reused rather than re-derived: an IMPACT under
     * AUDIO.impact.minVelocity is not a thud for the ear and is not one for the hand (m18 A5).
     * It is checked BEFORE the sustained channel below, not after, so the claim "cueVolume ≤ 0
     * is silent" holds for EVERY channel this layer has rather than for the one-shots only —
     * cueVolume returns 1 for STRAP_CHANGED today, so this is the same behaviour and a true
     * statement instead of the same behaviour and a false one. */
    let vol = 1;
    try { vol = cueVolume(e.type, e); } catch (err) { vol = 1; }

    /* §10.3: an overstressed strap is a STATE. It becomes the repeating pulse below instead of
     * the one-shot row, and any other state on that strap ends the repeat. ENDING one is not an
     * emission, so it happens whatever the volume says — a strap that fell silent for the ear
     * must still stop creaking in the hand. Starting one is an emission and is gated. */
    if (e.type === 'STRAP_CHANGED' && e.strapId != null && e.state !== 'overstressed') {
      this._sustain.delete(e.strapId);   // ungated: the creak must stop even if the cue is silent
    }

    if (!(vol > 0)) { this.stats.droppedSilent++; return; }

    // Starting one IS an emission, so it is gated; any other strap state falls through to its
    // own one-shot on the STRAP_CHANGED row (m35 H6c).
    if (e.type === 'STRAP_CHANGED' && e.strapId != null && e.state === 'overstressed') {
      this._startSustain(e, nowMs); return;
    }

    for (const seat of this.seatsFor(row, e)) this.pulse(seat, e.type, row, nowMs);
  }

  _startSustain(e, nowMs) {
    const seats = this.seatsFor(HAPTICS.strap, e);
    this._sustain.set(e.strapId, { seats, nextMs: nowMs });
    this.frame(nowMs);            // the first creak is the event's own
  }

  /**
   * The sustained channel, once per game.frame() (main.js subscribes it the way M3's shell
   * observers do, so it runs on SIM time and freezes under the pause card). One-shots need no
   * frame at all — they fire inside the emit.
   * @returns {number} pulses issued this frame
   */
  frame(nowMs = this.now()) {
    if (!this._sustain.size) return 0;
    let on = true;
    try { on = !!this.enabled(); } catch (e) { on = false; }
    if (!on) { this._sustain.clear(); return 0; }
    const t = Number(nowMs) || 0;
    let fired = 0;
    for (const s of this._sustain.values()) {
      // A replay restarts the clock: a nextMs from the last run is unreachably far ahead.
      if (s.nextMs > t + HAPTICS.strap.periodMs) s.nextMs = t;
      if (t < s.nextMs) continue;
      s.nextMs = t + HAPTICS.strap.periodMs;
      for (const seat of s.seats) if (this.pulse(seat, 'STRAP_CREAK', HAPTICS.strap, t)) fired++;
    }
    return fired;
  }

  /** How many straps are creaking right now — the only state this layer keeps that a suite
   *  needs to see stop (m35 H6). */
  get sustaining() { return this._sustain.size; }
}

/** The one constructor main.js calls. A function rather than `new` for the same reason the
 *  rest of the shell's small collaborators are: the suite builds one with fake seats. */
export function createHaptics(opts = {}) { return new Haptics(opts); }
