/* Audio — WebAudio, synthesised from nothing. No files, no fetches. GDD §20.4 (the six
 * layers, five of them here: material impacts, constraints, character strain, vehicle,
 * invoice stinger; music is deliberately absent), §8.4 "material sound" at impact, §5.2
 * "strain audio", §10.3 "snap sound", §21.4 Hearing (subtitles with direction, volume
 * categories), §26.5 "subtitles … exist", §22.4 (audio reads state and never writes it).
 *
 * COPIED, NOT REWRITTEN, from C:\Dev\SmallTownEmergencyServices\src\audio\audio.js — the
 * fifth adaptation of the Chameleon `tone` (chameleon3d.html:2190 → somethingsdifferent.html
 * → SmallTownEmergencyServices → AirportBaggageCrew → here; Dev\INDEX.md → Audio: "copy, do
 * not rewrite"). `tone`, `makeNoise`, `atten`, the pure `mixFor` seam, the CUES data table,
 * `cueFor` / `cueVolume`, `SILENT_EVENTS` and the `arm()` / resume-on-gesture pattern keep
 * their names. `toneP`'s stereo pan by camera bearing (Chameleon) is folded into `tone` as an
 * optional last argument. The per-cue `variant` / `variants` / `_` fallback is
 * AirportBaggageCrew's (`CUES.BAG_SCANNED`).
 *
 * TWO RULES HOLD THIS FILE TOGETHER (unchanged from the original).
 *
 * 1. AUDIO READS STATE AND NEVER WRITES IT. It is the renderer's twin: same input, different
 *    output device. The simulation behaves identically with the whole layer dead, which is
 *    also what happens on a browser that refuses us a context (m18 A7, A12).
 *
 * 2. THE DECISION IS SEPARATE FROM THE PLUMBING. `mixFor(state, listeners, world)` is a pure
 *    function from plain data to target loudnesses; everything below it is oscillators. That
 *    split is what lets tools\m18-tests.js assert the interesting half — a dolly rolling
 *    2 m from one mover is louder than one 20 m away, the strain rises with the mass — on a
 *    headless box with no sound card and no user gesture.
 *
 * WHERE THE FACTS COME FROM. game.state carries the phase, the pause flag and each player's
 * exertion and grips; it does NOT carry the route, the pack quality, the carried mass or a
 * dolly's speed (those live on RouteDriver, CargoSystem, PlayerController and the bodies —
 * §22.4 keeps them out of the serialisable state). So `world` is a read-only VIEW of plain
 * numbers main.js builds each render frame (audioWorld()), and `listeners` is one {x, y, z,
 * fx, fz, outdoors} per seat. mixFor reads all three and writes none.
 *
 * THE RENDER FRAME, NOT THE FIXED STEP. Bus handlers run synchronously inside Game.step; the
 * subscription here is an O(1) push onto a BOUNDED queue (AUDIO.maxVoices deep) and nothing
 * else — no table lookup, no arithmetic, no DOM. update() drains it on the render frame,
 * where the AudioContext's clock belongs. Captions (§21.4 Hearing) are decided there too, and
 * they work with NO context at all — a player with the sound off still reads "a strap gave
 * way".
 */

import { AUDIO } from '../config.js';
import { EVENTS, PHASES } from '../core/eventBus.js';
import { mulberry32 } from '../core/rng.js';
/* M30: the caption's vocabulary for a surface — PURE label data (a tag in, two words out),
 * the same table the ledger line's `location` comes from, so the subtitle and the notice
 * cannot say different things about one hit. Nothing else is read from a caption. */
import { surfaceCaption } from '../damage/surfaces.js';

/* ── the mix: pure, testable, no WebAudio anywhere near it ─────────────────── */

/** Distance falloff. Squared so that "across the room" and "across the street" are not
 *  nearly the same number, which linear attenuation makes them. */
export function atten(d, range) {
  const g = 1 - d / range;
  return g <= 0 ? 0 : g * g;
}

export const RANGE = Object.freeze({
  roll: AUDIO.ranges.roll,    // a dolly's wheels on a hard floor
  cue: AUDIO.ranges.cue,      // a placed one-shot: an impact, a strap, a grab
});

const EMPTY = Object.freeze([]);

function zeroMix() {
  return {
    engine: { gain: 0, pitch: 0 },
    roll: 0,
    strain: { gain: 0, pitch: 0 },
    rattle: 0,
    wind: 0,
  };
}

/** Horizontal distance from (x, z) to the NEAREST listener. With two movers on one screen
 *  there is no single pair of ears to put in the world, and "whichever of you is closest"
 *  is both the honest answer and the one that matches what the camera shows. Infinity with
 *  no listeners, which atten() turns into silence. */
function nearest(listeners, x, z) {
  let d = Infinity;
  for (const l of listeners) {
    if (!l) continue;
    const dd = Math.hypot((l.x || 0) - x, (l.z || 0) - z);
    if (dd < d) d = dd;
  }
  return d;
}

/**
 * What should be audible right now, and how loudly. PURE.
 * @param {object} state       game.state, read-only (phase, paused, players[*].exertion)
 * @param {Array}  listeners   [{x, y, z, fx, fz, outdoors}] — one per seat
 * @param {object} world       plain-data view: route {state, progress, event}, pack
 *                             {loadedCount, unsecuredFraction}, carries [{mass, imbalance}],
 *                             dollies [{x, y, z, speed}]
 * @returns {{engine:{gain,pitch}, roll:number, strain:{gain,pitch}, rattle:number, wind:number}}
 */
export function mixFor(state, listeners = EMPTY, world = {}) {
  const mix = zeroMix();
  if (!state || typeof state !== 'object' || state.paused) return mix;
  const ears = Array.isArray(listeners) ? listeners : EMPTY;
  const w = world && typeof world === 'object' ? world : {};
  const transit = state.phase === PHASES.TRANSIT;

  /* THE TRUCK (§20.4 Vehicle: engine load). Only in TRANSIT — the phase machine (§3.4) is
   * the fact, the route's own state the modulation: idle at the kerb and at the end, up to
   * speed over the first rampFrac of the route and down over the last. The route is a
   * scripted timeline with no speed of its own (route.js), so the profile is derived from
   * progress. */
  if (transit) {
    const r = w.route;
    let frac = 0;
    if (r && r.state === 'driving' && Number.isFinite(r.progress)) {
      const p = Math.min(1, Math.max(0, r.progress));
      const ramp = AUDIO.engine.rampFrac;
      frac = Math.min(1, p / ramp, (1 - p) / ramp);
      frac = Math.max(0, frac);
    }
    mix.engine = {
      gain: AUDIO.engine.idle + (1 - AUDIO.engine.idle) * frac,
      pitch: AUDIO.engine.pitchBase + AUDIO.engine.pitchSpan * frac,
    };
    /* THE CARGO (§20.4 Vehicle: cargo thumps; §11.2 the coarse cargo indicator, heard).
     * A loose pack rattles ∝ how loose it is, once its quality is below the line. A secure
     * pack is silent in the back, which is the whole reward for strapping it. */
    const pack = w.pack;
    if (pack && (pack.loadedCount || 0) > 0) {
      const quality = 1 - Math.min(1, Math.max(0, pack.unsecuredFraction || 0));
      if (quality < AUDIO.rattle.qualityBelow) mix.rattle = Math.min(1, 1 - quality);
    }
  }

  /* THE DOLLY (§20.4 Constraints: dolly rattle). Wheels on a hard floor, positional —
   * attenuated to the nearest pair of ears — so a runaway dolly you cannot see is still a
   * thing you can hear coming. */
  for (const d of w.dollies || EMPTY) {
    if (!d || !(d.speed > AUDIO.roll.minSpeed)) continue;
    const g = Math.min(1, (d.speed - AUDIO.roll.minSpeed) / (AUDIO.roll.fullSpeed - AUDIO.roll.minSpeed));
    const a = atten(nearest(ears, d.x || 0, d.z || 0), RANGE.roll);
    if (g * a > mix.roll) mix.roll = g * a;
  }

  /* THE BODY (§5.2 "strain audio"; §20.4 Character barks: strain). Gain saturates with the
   * carried mass — 0 → 30 → 90 kg is a rising line, never a step — and the PITCH follows
   * imbalance, so the sound of about-to-fall-over is a sound climbing rather than a sound
   * getting louder. Exertion, which IS on state, is a floor under the gain. Not positional:
   * the mover is the listener. In co-op the louder of the two wins the voice. */
  for (const c of w.carries || EMPTY) {
    if (!c) continue;
    const mass = Math.max(0, c.mass || 0);
    const imb = Math.max(0, c.imbalance || 0);
    if (mass <= 0) continue;
    const gain = Math.min(1, (mass / (mass + AUDIO.strain.massRef)) * (1 + AUDIO.strain.imbalanceGain * imb));
    if (gain > mix.strain.gain) mix.strain = { gain, pitch: 1 + AUDIO.strain.pitchRise * imb };
  }
  let exertion = 0;
  for (const p of Object.values(state.players || {})) {
    if (p && Number.isFinite(p.exertion) && p.exertion > exertion) exertion = p.exertion;
  }
  const floor = Math.min(1, exertion * AUDIO.strain.exertionGain);
  if (floor > mix.strain.gain) mix.strain = { gain: floor, pitch: Math.max(1, mix.strain.pitch) };

  /* OUTDOORS. Wind under the kerbside work; the engine covers it in the cab. */
  if (!transit) {
    for (const l of ears) if (l && l.outdoors) { mix.wind = 1; break; }
  }

  return mix;
}

/* ── one-shots: the vocabulary, as data ────────────────────────────────────
 * Every simulation event a player should hear, mapped to a recipe. A table rather than a
 * switch: a new event is a new row, and an event with no row is silent rather than a crash.
 *
 * A row is { bus, minGapMs, caption, parts, noise?, positional? } or, for an event whose sound
 * depends on a field, { bus, minGapMs, positional?, variant(e) → key, variants: { key: {caption,
 * parts, noise?}, _: {…} } }. `parts` is `[freq0, freq1, seconds, type, gain, delay]` per
 * partial; `noise` is `[seconds, filterHz, gain]` — a filtered burst of the seeded noise bed,
 * which is what makes a thud a thud. Every row and every variant carries a `caption`: the
 * §21.4 subtitle, asserted non-empty by m18 A1b.
 *
 * A CAPTION IS A STRING **OR** A PURE FUNCTION OF THE PAYLOAD (Phase 11 build-side M30).
 * m18 A1b pinned it as a string from M9 on, and that pin is why the property cues said 'wall
 * scuffed' when a door frame was scuffed (KNOWN_ISSUES Phase 21, M14). The pin is RESTATED,
 * not dropped: what A1b asserts now is that every row and every variant yields a NON-EMPTY
 * caption for a representative payload — a literal string still does, and most rows still are
 * one. A function form must be PURE (payload in, string out; it may read surfaces.js's label
 * tables and nothing else) so the table walk can call it with a fixture and so two players
 * reading the same event read the same words. resolveCue() below evaluates it, guards a throw,
 * and falls back to the variant key rather than an empty subtitle.
 */
const material = (e) => {
  const tags = e && Array.isArray(e.materials) ? e.materials : EMPTY;
  for (const t of ['glass', 'metal', 'wood', 'cardboard', 'fabric']) if (tags.includes(t)) return t;
  return '_';
};

/** The surface a property event names, in the words §26.5 wants — 'living-kitchen door frame'.
 *  Total: an event with no surface at all still reads as a wall, which is what M14 said. */
const surfaceOf = (e) => {
  const tag = e && e.surfaceId;
  if (typeof tag === 'string' && tag.length > 0) return surfaceCaption(tag);
  const loc = e && e.location;
  return (typeof loc === 'string' && loc.length > 0) ? loc.replace(/_/g, '-') : 'a wall';
};
/** A property caption TEMPLATE: the surface, then what happened to it. Pure. */
const marked = (what) => (e) => `${surfaceOf(e)} ${what}`;

export const CUES = Object.freeze({
  /* §8.4 "material sound" — by the object's own surface tag, loudness ∝ relVelocity
   * (cueVolume). Positional: it happened somewhere, and §21.4 wants the caption to say where. */
  IMPACT: {
    bus: 'world', minGapMs: 90, positional: true, variant: material,
    variants: {
      wood:      { caption: 'wooden thud',      parts: [[150, 62, 0.16, 'triangle', 0.42], [90, 48, 0.22, 'sine', 0.30]], noise: [0.06, 900, 0.30] },
      metal:     { caption: 'metal clang',      parts: [[720, 380, 0.22, 'square', 0.22], [1900, 900, 0.14, 'sawtooth', 0.12, 0.01]], noise: [0.05, 2400, 0.22] },
      glass:     { caption: 'glass rattle',     parts: [[2200, 1500, 0.10, 'sine', 0.22], [3100, 2400, 0.08, 'triangle', 0.14, 0.03]], noise: [0.04, 4200, 0.18] },
      cardboard: { caption: 'cardboard thump',  parts: [[120, 60, 0.12, 'triangle', 0.30]], noise: [0.07, 600, 0.34] },
      fabric:    { caption: 'soft thump',       parts: [[80, 45, 0.16, 'sine', 0.30]], noise: [0.09, 380, 0.26] },
      _:         { caption: 'a thud',           parts: [[130, 60, 0.14, 'triangle', 0.36]], noise: [0.06, 700, 0.30] },
    },
  },
  /* §8.3's bands, escalating: a scratch is a tick, a crack is a crack, broken lands in the
   * stomach. The cost notice on the HUD is its visual twin (main.js). */
  DAMAGE_APPLIED: {
    bus: 'world', minGapMs: 120, positional: true, variant: (e) => (e && e.band) || '_',
    variants: {
      scratched: { caption: 'scratched',         parts: [[1800, 900, 0.06, 'square', 0.10]] },
      cracked:   { caption: 'something cracked', parts: [[1300, 300, 0.12, 'square', 0.22], [400, 120, 0.18, 'sawtooth', 0.16, 0.02]] },
      broken:    { caption: 'something broke',   parts: [[900, 90, 0.36, 'sawtooth', 0.34], [160, 40, 0.55, 'triangle', 0.26, 0.04]], noise: [0.12, 1400, 0.30] },
      /* M14: the PROPERTY bands (DAMAGE.property.bands) — a wall, not an item. M30 makes these
       * five captions TEMPLATES: the HUD notice named the surface from the first line M14 ever
       * posted and the subtitle said 'wall scuffed' whatever was hit. Now both read the same
       * table (surfaces.js) — 'living-kitchen door frame scuffed'. */
      scuffed:   { caption: marked('scuffed'),   parts: [[700, 380, 0.08, 'triangle', 0.14]], noise: [0.05, 900, 0.22] },
      dented:    { caption: marked('dented'),    parts: [[420, 160, 0.14, 'square', 0.22]], noise: [0.08, 600, 0.28] },
      holed:     { caption: marked('holed'),     parts: [[260, 70, 0.30, 'sawtooth', 0.30], [120, 40, 0.40, 'triangle', 0.20, 0.03]], noise: [0.12, 500, 0.34] },
      // M23: a door FRAME's two states (damage.js _strainFrames) — the hinges creak, then go.
      bent:      { caption: marked('bent'),      parts: [[300, 220, 0.18, 'sawtooth', 0.18], [180, 90, 0.16, 'triangle', 0.14, 0.06]], noise: [0.06, 700, 0.20] },
      forced:    { caption: marked('forced'),    parts: [[240, 60, 0.32, 'sawtooth', 0.32], [900, 300, 0.10, 'square', 0.18, 0.02], [110, 45, 0.45, 'triangle', 0.24, 0.05]], noise: [0.14, 1100, 0.34] },
      _:         { caption: 'damage',            parts: [[1100, 400, 0.10, 'square', 0.16]] },
    },
  },
  /* M30. §8.4 asks for the four channels at EVERY impact; §8.3's "maximum charge" caps the
   * money, not the feedback. A surface already at DAMAGE.property.maxChargePerSurface still
   * gets hit, so it still makes a noise — a dull, cheap one, deliberately quieter than any
   * band above, because the player has already paid for this wall and the news is that there
   * is nothing left to pay. Rate-limited at the source (damage.js cappedRepeatMs) as well as
   * here, so a scrape is one complaint and not a stream. */
  PROPERTY_CAPPED: {
    bus: 'world', minGapMs: 400, positional: true,
    caption: (e) => `${surfaceOf(e)} — already at its maximum`,
    parts: [[300, 240, 0.12, 'triangle', 0.12], [180, 150, 0.16, 'sine', 0.10, 0.05]],
    noise: [0.05, 700, 0.14],
  },
  /* §6.1 the grip: soft grab, soft release. The tear (§6.2 "pulled out of reach" — the
   * spring's band exceeded) is a snap, and a slip is a slip. */
  GRIP_STARTED: { bus: 'foley', minGapMs: 80, positional: true, caption: 'grabbed', parts: [[190, 150, 0.10, 'triangle', 0.16]] },
  GRIP_ENDED: {
    bus: 'foley', minGapMs: 80, positional: true, variant: (e) => (e && e.reason) || '_',
    variants: {
      'released':            { caption: 'let go',         parts: [[165, 118, 0.14, 'triangle', 0.14]] },
      'pulled out of reach': { caption: 'grip snapped',   parts: [[1200, 200, 0.12, 'square', 0.24], [110, 60, 0.20, 'sawtooth', 0.16, 0.02]] },
      'slipped':             { caption: 'grip slipped',   parts: [[420, 180, 0.16, 'sawtooth', 0.16]] },
      _:                     { caption: 'dropped',        parts: [[220, 90, 0.18, 'triangle', 0.18]] },
    },
  },
  /* §10.3 the strap, per state: hooked, ratcheted, creaking, GONE (the "snap sound and
   * released cargo" row), unclipped. */
  STRAP_CHANGED: {
    bus: 'foley', minGapMs: 100, positional: true, variant: (e) => (e && e.state) || '_',
    variants: {
      slack:        { caption: 'strap hooked',       parts: [[900, 700, 0.05, 'square', 0.14]] },
      tensioned:    { caption: 'strap ratcheted',    parts: [[600, 760, 0.05, 'square', 0.16], [600, 760, 0.05, 'square', 0.14, 0.07], [600, 760, 0.05, 'square', 0.12, 0.14]] },
      overstressed: { caption: 'strap creaking',     parts: [[300, 260, 0.28, 'sawtooth', 0.16]] },
      failed:       { caption: 'a strap gave way',   parts: [[1400, 180, 0.28, 'sawtooth', 0.30], [90, 50, 0.30, 'triangle', 0.22, 0.03]] },
      released:     { caption: 'strap unclipped',    parts: [[420, 300, 0.09, 'square', 0.12]] },
      _:            { caption: 'strap',              parts: [[500, 400, 0.08, 'square', 0.12]] },
    },
  },
  /* §9.2 tools are world objects: the dolly clacks on, the blanket rustles over, the ramp
   * clunks down, a tool picked up or put down. */
  TOOL_STATE: {
    bus: 'foley', minGapMs: 100, positional: true, variant: (e) => (e && e.state) || '_',
    variants: {
      attached: { caption: 'dolly under it',     parts: [[520, 300, 0.07, 'square', 0.18], [300, 200, 0.10, 'triangle', 0.14, 0.05]] },
      detached: { caption: 'dolly pulled out',   parts: [[300, 480, 0.08, 'square', 0.14]] },
      covered:  { caption: 'blanket over it',    parts: [], noise: [0.30, 1200, 0.16] },
      deployed: { caption: 'ramp down',          parts: [[140, 60, 0.26, 'triangle', 0.30], [70, 45, 0.30, 'sawtooth', 0.16, 0.05]] },
      carried:  { caption: 'tool picked up',     parts: [[600, 760, 0.07, 'square', 0.13]] },
      dropped:  { caption: 'tool put down',      parts: [[420, 300, 0.09, 'square', 0.12]] },
      _:        { caption: 'tool',               parts: [[500, 500, 0.06, 'square', 0.10]] },
    },
  },
  /* §8.2 disassembly: the screwdriver's ratchet, either direction. */
  PART_CHANGED: {
    bus: 'foley', minGapMs: 150, positional: true, variant: (e) => (e && e.action) || '_',
    variants: {
      removed:  { caption: 'part unscrewed',   parts: [[900, 1100, 0.04, 'square', 0.12], [900, 1100, 0.04, 'square', 0.12, 0.06], [900, 1100, 0.04, 'square', 0.12, 0.12], [900, 1100, 0.04, 'square', 0.12, 0.18]] },
      restored: { caption: 'part back on',     parts: [[1100, 900, 0.04, 'square', 0.12], [1100, 900, 0.04, 'square', 0.12, 0.06], [1100, 900, 0.04, 'square', 0.12, 0.12]] },
      _:        { caption: 'part changed',     parts: [[1000, 1000, 0.05, 'square', 0.12]] },
    },
  },
  /* §8.2 a door off its hinges (M11): the hinge pins tapped out and the leaf set down on the
   * floor; back on with a clack. The boot state is data, not an event (no 'hung' cue). */
  DOOR_STATE: {
    bus: 'foley', minGapMs: 150, positional: true, variant: (e) => (e && e.state) || '_',
    variants: {
      removed: { caption: 'door off its hinges', parts: [[820, 980, 0.05, 'square', 0.14], [820, 980, 0.05, 'square', 0.14, 0.09], [140, 70, 0.22, 'triangle', 0.26, 0.30]] },
      rehung:  { caption: 'door back on',        parts: [[980, 820, 0.05, 'square', 0.14], [520, 300, 0.07, 'square', 0.16, 0.10]] },
      // M23: torn off its hinges by a shove (damage.js _forceLeaf). The boot-time 'hung'
      // announcement carries `silent: true` and never reaches the queue (_onEvent).
      forced:  { caption: 'door forced',         parts: [[160, 50, 0.30, 'sawtooth', 0.30], [700, 200, 0.12, 'square', 0.16, 0.03]], noise: [0.12, 900, 0.30] },
      hung:    { caption: 'door on its hinges',  parts: [[820, 980, 0.05, 'square', 0.10]] },
      _:       { caption: 'door',                parts: [[600, 600, 0.06, 'square', 0.10]] },
    },
  },
  /* §10.2 loaded is a fact about the truck, not a menu: a chime in, a low note out. */
  CARGO_STATE: {
    bus: 'ui', minGapMs: 150, variant: (e) => (e && e.loaded ? 'loaded' : 'unloaded'),
    variants: {
      loaded:   { caption: 'loaded',    parts: [[659, 659, 0.10, 'sine', 0.18], [988, 988, 0.16, 'sine', 0.16, 0.08]] },
      unloaded: { caption: 'unloaded',  parts: [[330, 262, 0.18, 'sine', 0.18]] },
      _:        { caption: 'cargo',     parts: [[500, 500, 0.10, 'sine', 0.14]] },
    },
  },
  /* §11.3 road forces: a whoomp ∝ severity (cueVolume), captioned by the road. */
  ROAD_FORCE: {
    bus: 'world', minGapMs: 300, variant: (e) => (e && e.roadType) || '_',
    variants: {
      hardBrake: { caption: 'hard braking',   parts: [[110, 40, 0.42, 'sawtooth', 0.34]], noise: [0.30, 500, 0.28] },
      sharpTurn: { caption: 'sharp turn',     parts: [[90, 55, 0.55, 'triangle', 0.28]], noise: [0.40, 400, 0.22] },
      speedBump: { caption: 'speed bump',     parts: [[70, 35, 0.22, 'triangle', 0.36], [70, 35, 0.22, 'triangle', 0.30, 0.16]], noise: [0.10, 700, 0.30] },
      _:         { caption: 'the road',       parts: [[100, 45, 0.40, 'triangle', 0.30]] },
    },
  },
  /* §18.3 recovery: a pop — something is somewhere else now, and it costs money. */
  RECOVERY: { bus: 'ui', minGapMs: 200, positional: true, caption: 'recovered — a fee', parts: [[520, 880, 0.08, 'sine', 0.18], [880, 520, 0.14, 'sine', 0.14, 0.09]] },
  /* §3.4 phase stings, the invoice one last (§20.4 Invoice stingers). */
  CONTRACT_PHASE: {
    // M13: a PICKUP entered FROM transit is the return leg arriving, not the job starting.
    bus: 'ui', minGapMs: 500, variant: (e) => (e && e.to === PHASES.PICKUP && e.from === PHASES.TRANSIT ? 'return' : (e && e.to)) || '_',
    variants: {
      [PHASES.PICKUP]:     { caption: 'the job starts',          parts: [[392, 392, 0.14, 'sine', 0.16], [523, 523, 0.22, 'sine', 0.14, 0.12]] },
      return:              { caption: 'back at the house',       parts: [[523, 523, 0.14, 'sine', 0.16], [392, 392, 0.22, 'sine', 0.14, 0.12]] },
      [PHASES.TRANSIT]:    { caption: 'on the road',             parts: [[60, 45, 0.60, 'sawtooth', 0.22], [330, 392, 0.16, 'sine', 0.14, 0.10]] },
      [PHASES.DELIVERY]:   { caption: 'arrived',                 parts: [[523, 523, 0.14, 'sine', 0.18], [659, 659, 0.14, 'sine', 0.16, 0.12], [784, 784, 0.30, 'sine', 0.16, 0.24]] },
      [PHASES.SETTLEMENT]: { caption: 'the invoice',             parts: [[392, 392, 0.30, 'sine', 0.24], [523, 523, 0.30, 'sine', 0.22, 0.22], [659, 659, 0.60, 'sine', 0.20, 0.44]] },
      _:                   { caption: 'phase',                   parts: [[440, 440, 0.12, 'sine', 0.14]] },
    },
  },
});

/* Events deliberately left silent. Kept as data beside CUES so that "somebody decided this
 * one should make no sound" and "nobody noticed this event existed" are different states,
 * and so tools\m18-tests.js A1 can insist every name in EVENTS is one or the other — a new
 * event with no cue then fails a test instead of being quietly mute.
 *
 * SIM_PAUSED also fires on window blur (main.js), so a cue on it would beep at a player as
 * they tab away; the pause card is the louder statement. SIM_RESET: the reset clears this
 * layer's queue instead (a replay is not a sound). INPUT_CONTEXT: the prompt says it.
 * ZONE_CHANGED: declared in §23.3 and emitted by nothing (KNOWN_ISSUES). */
export const SILENT_EVENTS = Object.freeze(['SIM_RESET', 'SIM_PAUSED', 'SIM_RESUMED', 'INPUT_CONTEXT', 'ZONE_CHANGED']);

/** The recipe row for an event, or null. OWN properties only: `CUES.constructor` is a
 *  function inherited from Object.prototype, and an event by that name once reached
 *  `cue.parts` as undefined and threw out of the frame (STES). */
export function cueFor(type) {
  return Object.prototype.hasOwnProperty.call(CUES, type) ? CUES[type] : null;
}

/**
 * One caption cell, resolved (M30). A cell is a STRING or a PURE FUNCTION of the payload; a
 * function that throws or hands back anything but a non-empty string yields '' and the caller
 * substitutes. Exported so the table walk (m18 A1b) resolves cells exactly as the layer does.
 * @param {string|((payload: object) => string)} cell
 * @returns {string} '' when there is nothing usable
 */
export function captionText(cell, payload) {
  if (typeof cell === 'function') {
    let s;
    try { s = cell(payload); } catch (e) { return ''; }
    return (typeof s === 'string' && s.trim().length > 0) ? s : '';
  }
  return (typeof cell === 'string' && cell.trim().length > 0) ? cell : '';
}

/** The row resolved for ONE event: {bus, minGapMs, positional, caption, parts, noise}. Pure. */
export function resolveCue(type, payload) {
  const row = cueFor(type);
  if (!row) return null;
  if (!row.variants) return { bus: row.bus, minGapMs: row.minGapMs, positional: !!row.positional, caption: captionText(row.caption, payload) || type, parts: row.parts || EMPTY, noise: row.noise || null };
  let key = '_';
  try { key = row.variant ? String(row.variant(payload)) : '_'; } catch (e) { key = '_'; }
  const v = (Object.prototype.hasOwnProperty.call(row.variants, key) ? row.variants[key] : null) || row.variants._;
  if (!v) return null;
  // A template that came back empty falls back to the variant KEY ('scuffed'), never to an
  // empty subtitle: §26.5 asks the caption to say what happened, and the key already does.
  return { bus: row.bus, minGapMs: row.minGapMs, positional: !!row.positional, caption: captionText(v.caption, payload) || key, parts: v.parts || EMPTY, noise: v.noise || null, variant: key };
}

/** How loud one firing of a cue is, against its recipe. Pure, so the curve is assertable
 *  (m18 A5): an IMPACT below AUDIO.impact.minVelocity is silent — the settle of a box put
 *  down is not a thud — and above it the loudness climbs with relVelocity to a cap. A road
 *  force is its own severity. */
export function cueVolume(type, payload) {
  if (type === 'IMPACT') {
    const v = Number(payload && payload.relVelocity);
    if (!Number.isFinite(v) || v < AUDIO.impact.minVelocity) return 0;
    const frac = (v - AUDIO.impact.minVelocity) / (AUDIO.impact.fullVelocity - AUDIO.impact.minVelocity);
    return Math.min(AUDIO.impact.maxGain, AUDIO.impact.floorGain + frac);
  }
  if (type === 'ROAD_FORCE') {
    const s = Number(payload && payload.severity);
    const sev = Number.isFinite(s) ? Math.min(1, Math.max(0, s)) : 1;
    return AUDIO.road.floorGain + sev * (1 - AUDIO.road.floorGain);
  }
  return 1;
}

/** `?audio=off` — the layer constructs, subscribes and does nothing (update() is a no-op).
 *  Pure over the search string so a suite can assert it without a location stub. */
export function audioEnabledFrom(search) {
  try { return new URLSearchParams(search || '').get('audio') !== 'off'; } catch (e) { return true; }
}

/**
 * §21.4 "subtitles with … direction": where a placed cue is, relative to a listener's
 * facing, as one glyph. Pure. '' when there is nothing to say — no position, no listener, or
 * the sound is at your feet (within AUDIO.captionNearM).
 * @param {{x, z, fx, fz}} listener  position and flat forward vector (rig.forwardFlat())
 * @param {{x, z}} position
 */
export function directionGlyph(listener, position) {
  if (!listener || !position) return '';
  const tx = (position.x || 0) - (listener.x || 0), tz = (position.z || 0) - (listener.z || 0);
  const dist = Math.hypot(tx, tz);
  if (!(dist > AUDIO.captionNearM)) return '';
  const fl = Math.hypot(listener.fx || 0, listener.fz || 0);
  if (!(fl > 0)) return '';
  const fx = listener.fx / fl, fz = listener.fz / fl;
  const cos = (fx * tx + fz * tz) / dist;
  const ahead = Math.cos(AUDIO.captionAheadDeg * Math.PI / 180);
  if (cos >= ahead) return '↑';
  if (cos <= -ahead) return '↓';
  // y-up, right-handed: cross(forward, to).y = fz·tx − fx·tz, positive when `to` is to the LEFT.
  return (fz * tx - fx * tz) > 0 ? '←' : '→';
}

/** Stereo pan for a placed cue from the same bearing: −1 left … +1 right, 0 with no facing. */
export function panFor(listener, position) {
  if (!listener || !position) return 0;
  const tx = (position.x || 0) - (listener.x || 0), tz = (position.z || 0) - (listener.z || 0);
  const dist = Math.hypot(tx, tz);
  const fl = Math.hypot(listener.fx || 0, listener.fz || 0);
  if (!(dist > 0) || !(fl > 0)) return 0;
  const fx = listener.fx / fl, fz = listener.fz / fl;
  const left = (fz * tx - fx * tz) / dist;    // sin of the bearing, +1 = hard left
  return Math.max(-1, Math.min(1, -left));
}

/* ── the plumbing ──────────────────────────────────────────────────────────── */

const BUS_NAMES = Object.freeze(['world', 'foley', 'ui']);

export class GameAudio {
  /**
   * @param {EventBus} bus  subscribed at once (attach); null to attach later
   * @param {{enabled?: boolean}} [opts]  `enabled: false` is `?audio=off`
   */
  constructor(bus = null, { enabled = true } = {}) {
    this.enabled = enabled !== false;
    this.ctx = null;
    this.dead = false;
    this.master = null;
    this.busNodes = {};
    this.loops = {};
    this.noiseBuf = null;
    /** The bus levels the sliders move — kept here so setMaster() before arm() still lands. */
    this.levels = { master: AUDIO.master, ui: AUDIO.buses.ui, world: AUDIO.buses.world, foley: AUDIO.buses.foley };
    /** Bus events, pushed inside the fixed step, drained on the render frame. Bounded. */
    this.queue = [];
    /** Cue type -> sim ms of its last firing (minGapMs). ≤ Object.keys(CUES).length entries. */
    this.lastCueAt = {};
    /** Scheduled one-shot sources and when each ends, in context seconds. */
    this._voices = [];
    this._caption = null;
    this._unsubs = [];
    this._bus = null;
    this._clockMs = 0;
    this.stats = { played: 0, droppedQueue: 0, droppedVoices: 0, droppedGap: 0 };
    if (bus) this.attach(bus);
  }

  /** Subscribe BY NAME for every CUES row (an EVENTS name the bus really emits; the guard is
   *  `EVENTS[name]`), plus SIM_RESET to flush. The handler is a bounded push and nothing else:
   *  it runs inside Game.step. Never onAny — the run recorder's seam is left alone. */
  attach(bus) {
    if (this._bus === bus) return this;
    this.detach();
    this._bus = bus;
    const onEvent = (e) => this._onEvent(e);
    for (const name of Object.keys(CUES)) {
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

  _onEvent(e) {
    if (!this.enabled) return;
    /* An event stamped `silent: true` is bookkeeping for the run record, not a happening:
     * main.js's boot-time DOOR_STATE 'hung' (M23), which would otherwise caption 'door on
     * its hinges' four times over after START. No sound, no caption. */
    if (e && e.silent === true) return;
    if (this.queue.length >= AUDIO.maxVoices) { this.stats.droppedQueue++; return; }
    this.queue.push(e);
  }

  /** A new contract: nothing queued from the old one may play, and the gap stamps restart
   *  with the clock (a stamp that has not happened yet is not a stamp — see takeCue). */
  reset() {
    this.queue.length = 0;
    this.lastCueAt = {};
    this._caption = null;
  }

  /** Build the graph. Meant for a user gesture; safe to call always (re-arming resumes a
   *  suspended context, which is the resume-on-gesture pattern). @returns {boolean} armed */
  arm() {
    if (!this.enabled) return false;
    if (this.ctx) { this.resume(); return true; }
    if (this.dead) return false;
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) { this.dead = true; return false; }
    try {
      const ctx = new AC();
      this.ctx = ctx;
      const master = ctx.createGain();
      master.gain.value = this.levels.master;
      // One compressor across the whole mix: an engine plus a rattle plus a broken TV can
      // sum past full scale, and digital clipping reads as a bug, not as loudness.
      const c = AUDIO.synth.compressor;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = c.threshold; comp.ratio.value = c.ratio;
      comp.attack.value = c.attack; comp.release.value = c.release;
      master.connect(comp); comp.connect(ctx.destination);
      this.master = master;
      for (const name of BUS_NAMES) {
        const g = ctx.createGain();
        g.gain.value = this.levels[name];
        // foley sits under world, so the card's "world sounds" slider covers both.
        g.connect(name === 'foley' ? this.busNodes.world : master);
        this.busNodes[name] = g;
      }
      this.noiseBuf = makeNoise(ctx);
      this.buildLoops();
    } catch (e) {
      this.ctx = null; this.master = null; this.busNodes = {}; this.loops = {}; this.dead = true;
      return false;
    }
    this.resume();
    return true;
  }

  resume() {
    const c = this.ctx;
    if (c && c.state === 'suspended' && c.resume) {
      try { const p = c.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ }
    }
  }

  get armed() { return !!this.ctx; }

  /** The card's master slider. Clamped 0..1; applied now if the graph exists, else at arm(). */
  setMaster(v) {
    const g = clamp01(v);
    this.levels.master = g;
    if (this.master) this.master.gain.value = g;
    return g;
  }

  /** The card's bus sliders: 'ui' | 'world' | 'foley'. Unknown names are refused (null). */
  setBus(name, v) {
    if (!BUS_NAMES.includes(name)) return null;
    const g = clamp01(v);
    this.levels[name] = g;
    if (this.busNodes[name]) this.busNodes[name].gain.value = g;
    return g;
  }

  /** Continuous voices, one node each, running silently until the mix says otherwise.
   *  Starting and stopping oscillators per frame is how you get clicks. */
  buildLoops() {
    const ctx = this.ctx;
    const hz = AUDIO.synth.hz;
    const loop = (name, build) => { this.loops[name] = build(); this.loops[name].name = name; };

    loop('engine', () => {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz.engine;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = hz.engine * AUDIO.synth.filters.engineLpMul;
      const g = ctx.createGain(); g.gain.value = 0;
      o.connect(lp); lp.connect(g); g.connect(this.busNodes.world); o.start();
      return { osc: o, gain: g };
    });

    loop('roll', () => {
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = hz.roll; bp.Q.value = AUDIO.synth.filters.rollQ;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(bp); bp.connect(g); g.connect(this.busNodes.world); src.start();
      return { src, filter: bp, gain: g };
    });

    // The body under load. Low and lowpassed so it sits under everything else — this is the
    // one voice that plays while the player is holding a key and waiting.
    loop('strain', () => {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz.strain;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = hz.strain * AUDIO.synth.filters.strainLpMul;
      const g = ctx.createGain(); g.gain.value = 0;
      o.connect(lp); lp.connect(g); g.connect(this.busNodes.foley); o.start();
      return { osc: o, filter: lp, gain: g };
    });

    loop('rattle', () => {
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = hz.rattle; bp.Q.value = AUDIO.synth.filters.rattleQ;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(bp); bp.connect(g); g.connect(this.busNodes.world); src.start();
      return { src, filter: bp, gain: g };
    });

    loop('wind', () => {
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = hz.wind;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(lp); lp.connect(g); g.connect(this.busNodes.world); src.start();
      return { src, filter: lp, gain: g };
    });
  }

  /**
   * One render frame. READS state, world and listeners; writes only to audio nodes and to
   * this layer's own bookkeeping. Drains the cue queue (captions are decided here, with or
   * without a context), then ramps the continuous layers to mixFor's targets.
   * @param {object} state       game.state, read-only
   * @param {object} world       audioWorld() from main.js: nowMs, route, pack, carries,
   *                             dollies, positionOf(entityId)
   * @param {Array}  listeners   audioListeners() from main.js
   * @param {number} dt          render seconds since the last frame
   * @returns {object|null} the mix, or null when the layer is off (`?audio=off`)
   */
  update(state, world, listeners, dt) {
    if (!this.enabled) return null;
    const w = world && typeof world === 'object' ? world : {};
    const ears = Array.isArray(listeners) ? listeners : EMPTY;
    const step = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    this._clockMs += step * 1000;
    const nowMs = Number.isFinite(w.nowMs) ? w.nowMs : this._clockMs;

    // Drain first, so a cue and the bed it belongs under land on the same frame.
    const q = this.queue;
    const n = q.length;
    for (let i = 0; i < n; i++) this._playCue(q[i], nowMs, w, ears);
    q.length = 0;

    const mix = mixFor(state, ears, w);
    this._pruneVoices();

    const ctx = this.ctx;
    if (!ctx || this.dead) return mix;
    const t = ctx.currentTime;
    const S = AUDIO.synth;
    const L = S.levels;
    const ramp = (node, v) => {
      if (!node) return;
      try { node.gain.setTargetAtTime(v, t, S.rampS); } catch (e) { node.gain.value = v; }
    };
    const pitch = (loop, hzValue, tau) => {
      if (!loop || !loop.osc) return;
      try { loop.osc.frequency.setTargetAtTime(hzValue, t, tau); } catch (e) { /* ignore */ }
    };

    ramp(this.loops.engine && this.loops.engine.gain, mix.engine.gain * L.engine);
    if (mix.engine.gain > 0) pitch(this.loops.engine, S.hz.engine * mix.engine.pitch, S.pitchRampS);
    ramp(this.loops.roll && this.loops.roll.gain, mix.roll * L.roll);
    ramp(this.loops.strain && this.loops.strain.gain, mix.strain.gain * L.strain);
    // Slow ramp on the strain pitch: the point is that it is CLIMBING, and a fast follow just
    // sounds like it is stuttering.
    if (mix.strain.gain > 0) pitch(this.loops.strain, S.hz.strain * mix.strain.pitch, S.strainRampS);
    ramp(this.loops.rattle && this.loops.rattle.gain, mix.rattle * L.rattle);
    ramp(this.loops.wind && this.loops.wind.gain, mix.wind * L.wind);
    return mix;
  }

  /**
   * The decision half of a one-shot: which recipe, and may it play yet? No AudioContext near
   * it, so the rate limit is assertable on a headless box.
   * @returns {object|null} the resolved recipe, or null for "stay silent"
   */
  takeCue(type, payload, simTimeMs) {
    const cue = resolveCue(type, payload);
    if (!cue) return null;
    const last = this.lastCueAt[type];
    /* `last <= simTimeMs` is not redundant (STES): a replay restarts the clock at 0 while
     * this table still holds stamps from the last run, and a stamp in the future reads as
     * "the gap has not passed yet" — very nearly for ever. */
    if (last != null && last <= simTimeMs && simTimeMs - last < cue.minGapMs) { this.stats.droppedGap++; return null; }
    this.lastCueAt[type] = simTimeMs;
    return cue;
  }

  _playCue(e, nowMs, world, listeners) {
    if (!e || !e.type) return;
    const cue = this.takeCue(e.type, e, nowMs);
    if (!cue) return;
    // Where it happened: the payload's own position, else the entity's, else nowhere.
    let position = null;
    if (cue.positional) {
      if (e.position && Number.isFinite(e.position.x)) position = { x: e.position.x, y: e.position.y || 0, z: e.position.z || 0 };
      else if (e.newTransform && Number.isFinite(e.newTransform.x)) position = { x: e.newTransform.x, y: e.newTransform.y || 0, z: e.newTransform.z || 0 };
      else if (e.entityId != null && typeof world.positionOf === 'function') {
        try { position = world.positionOf(e.entityId) || null; } catch (err) { position = null; }
      } else if (e.toolId != null && typeof world.positionOf === 'function') {
        try { position = world.positionOf(e.toolId) || null; } catch (err) { position = null; }
      }
    }
    // THE CAPTION, with or without sound (§21.4 Hearing / §26.5).
    this._caption = { text: cue.caption, type: e.type, atMs: nowMs, position };

    const ctx = this.ctx;
    if (!ctx || this.dead || ctx.state !== 'running') return;
    let vol = cueVolume(e.type, e);
    let pan = 0;
    if (position) {
      // Nearest ears decide the loudness; the first seat's facing decides the pan (a split
      // screen has one pair of speakers).
      let d = Infinity, who = null;
      for (const l of listeners) {
        if (!l) continue;
        const dd = Math.hypot((l.x || 0) - position.x, (l.z || 0) - position.z);
        if (dd < d) { d = dd; who = l; }
      }
      if (who) { vol *= atten(d, RANGE.cue); pan = panFor(listeners[0] || who, position); }
    }
    if (!(vol > 0)) return;
    const need = cue.parts.length + (cue.noise ? 1 : 0);
    if (this._liveVoices(ctx.currentTime) + need > AUDIO.maxVoices) { this.stats.droppedVoices++; return; }
    const busNode = this.busNodes[cue.bus] || this.busNodes.foley;
    for (const [f0, f1, dur, wave, gain, delay] of cue.parts) {
      if (tone(ctx, busNode, gain * vol, f0, f1, dur, wave, delay || 0, pan)) this._voice(ctx.currentTime + (delay || 0) + dur);
    }
    if (cue.noise) {
      const [dur, hz, gain] = cue.noise;
      if (noiseBurst(ctx, busNode, this.noiseBuf, gain * vol, dur, hz, pan)) this._voice(ctx.currentTime + dur);
    }
    this.stats.played++;
  }

  _voice(endS) { this._voices.push(endS + AUDIO.synth.tailS); }
  _liveVoices(nowS) {
    let n = 0;
    for (const end of this._voices) if (end > nowS) n++;
    return n;
  }
  _pruneVoices() {
    if (!this.ctx || !this._voices.length) { if (!this.ctx) this._voices.length = 0; return; }
    const now = this.ctx.currentTime;
    let k = 0;
    for (let i = 0; i < this._voices.length; i++) if (this._voices[i] > now) this._voices[k++] = this._voices[i];
    this._voices.length = k;
  }

  /** The last cue's caption while it is current, for the HUD: {text, type, atMs, position}
   *  or null. Sim milliseconds, so a paused game holds it and a suite can drive it (m18 A8). */
  lastCaption(nowMs) {
    const c = this._caption;
    if (!c) return null;
    const age = nowMs - c.atMs;
    if (!(age >= 0) || age >= AUDIO.captionMs) return null;
    return c;
  }

  /** For the debug overlay and the suites. */
  info() {
    return {
      enabled: this.enabled,
      armed: !!this.ctx,
      state: this.ctx ? this.ctx.state : 'none',
      voices: this.ctx ? this._liveVoices(this.ctx.currentTime) : 0,
      queued: this.queue.length,
      cueTypes: Object.keys(this.lastCueAt).length,
      played: this.stats.played,
      dropped: this.stats.droppedQueue + this.stats.droppedVoices,
      levels: { ...this.levels },
    };
  }

  /** Everything quiet, immediately. */
  hush() {
    if (!this.ctx) return;
    for (const l of Object.values(this.loops)) {
      try { l.gain.gain.setTargetAtTime(0, this.ctx.currentTime, AUDIO.synth.rampS); } catch (e) { /* ignore */ }
    }
  }

  /** Tear the graph down and let go of the bus. The object is inert afterwards. */
  dispose() {
    this.detach();
    this.hush();
    const ctx = this.ctx;
    this.ctx = null; this.master = null; this.busNodes = {}; this.loops = {}; this.noiseBuf = null;
    this._voices.length = 0; this.queue.length = 0; this._caption = null;
    this.dead = true;
    if (ctx && ctx.close) { try { const p = ctx.close(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ } }
  }
}

/* ── primitives, copied from somethingsdifferent.html via STES ─────────────── */

/** Two seconds of noise with a little brown in it — pure white is hissy.
 *
 *  SEEDED, not the platform generator: what a run SOUNDED like is part of what a repeated
 *  playtest repeats, and this is the bed under the roll, the rattle, the wind and every
 *  thud. mulberry32 is the generator the rest of the game uses (rng.js). */
export function makeNoise(ctx, seed = 0x5EA5E7) {
  const n = Math.floor(ctx.sampleRate * AUDIO.synth.noiseSeconds);
  const b = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = b.getChannelData(0);
  const rnd = mulberry32(seed);
  let brown = 0;
  for (let i = 0; i < n; i++) {
    const w = rnd() * 2 - 1;
    brown = (brown + 0.02 * w) / 1.02;
    d[i] = w * 0.65 + brown * 3.2;
  }
  return b;
}

/** One-shot pitched body. Same shape as the original; takes an explicit bus node and, from
 *  Chameleon's toneP, an optional stereo pan. @returns {boolean} scheduled */
export function tone(ctx, busNode, vol, f0, f1, dur, type, delay, pan) {
  if (!ctx || !busNode || !(vol > 0.0004)) return false;
  const t = ctx.currentTime + (delay || 0);
  const o = ctx.createOscillator();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(f0, t);
  if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const e = ctx.createGain();
  e.gain.setValueAtTime(0.0001, t);
  e.gain.exponentialRampToValueAtTime(vol, t + AUDIO.synth.attackS);
  e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(e);
  connectPanned(ctx, e, busNode, pan);
  o.start(t); o.stop(t + dur + AUDIO.synth.tailS);
  return true;
}

/** A filtered burst of the noise bed — the body of a thud, the rustle of a blanket. */
export function noiseBurst(ctx, busNode, buffer, vol, dur, filterHz, pan) {
  if (!ctx || !busNode || !buffer || !(vol > 0.0004)) return false;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource(); src.buffer = buffer;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterHz;
  const e = ctx.createGain();
  e.gain.setValueAtTime(0.0001, t);
  e.gain.exponentialRampToValueAtTime(vol, t + AUDIO.synth.attackS);
  e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(e);
  connectPanned(ctx, e, busNode, pan);
  src.start(t); src.stop(t + dur + AUDIO.synth.tailS);
  return true;
}

function connectPanned(ctx, node, busNode, pan) {
  if (pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    node.connect(p); p.connect(busNode);
  } else {
    node.connect(busNode);
  }
}

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
