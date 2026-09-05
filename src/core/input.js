/* Input abstraction — GDD §4.2, §4.3, §4.4, §21.4, §6.4.
 *
 * Shape copied from AirportBaggageCrew\src\core\input.js (Dev\INDEX.md → "Action-based
 * input"); the edge-consumed-per-SIMULATION-step contract and the drop-held-keys-on-blur
 * fix are both from there and are both load-bearing. Three things are new, because the
 * GDD needs them and a flat binding map cannot express them:
 *
 *   1. CONTEXTS. §4.2 gives every physical input two meanings — Space is jump on foot and
 *      handbrake while driving. Bindings are therefore per-context. §4.4 says "one input
 *      should not change meaning invisibly", so switching context emits INPUT_CONTEXT and
 *      the HUD is expected to redraw its prompts from activeContext.
 *   2. ANALOG. §4.3 puts grab on LT/RT, and §6.5 wants grip strength scaling. isDown() is
 *      not enough — analog() returns 0..1 so a half-pulled trigger is a weaker grip.
 *   3. CONTROLLER PARITY. §4.4: "every essential action requires controller parity and
 *      remapping". The Gamepad API has no events, so poll() must run once per frame.
 *
 * SEATS (Phase 12) are the fourth. One binding map PER SEAT, sharing no key — the pattern
 * and the warning are both from `TowBros\src\core\input.js` `CREW_BINDINGS` (Dev\INDEX.md →
 * "Local co-op on one keyboard"), which says it plainly: *seat 0 has to LOSE the arrow keys
 * it used to also own*. It did — `moveForward` was `['KeyW', 'ArrowUp']` and is now `KeyW`
 * alone, because a shared key is a seat-1 press that also moves seat 0's mover.
 * `bindingConflicts()` exists so that is a test rather than a hope.
 *
 * Systems ask for ACTIONS ('gripLeft', 'brace'), never for KeyW or button 6. The binding
 * table is data, so remapping (§21.4) stays a data edit.
 *
 * THE SINGLE-PLAYER ALIAS IS KEPT HONEST, the way `state.player` is in
 * `SmallTownEmergencyServices\src\game.js`: every query takes an optional trailing `seat`
 * that defaults to 0, and `input.look` IS `input.looks[0]` — the same object, not a copy —
 * so a hundred existing call sites keep working and cannot drift.
 */

import { SETTINGS, SIM, INPUT, COOP } from '../config.js';

export const CONTEXTS = Object.freeze({ FOOT: 'foot', DRIVE: 'drive' });

/* Standard Gamepad button indices, named so the binding table below reads as §4.3 does. */
export const PAD = Object.freeze({
  A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7,
  VIEW: 8, MENU: 9, L3: 10, R3: 11,
  DPAD_UP: 12, DPAD_DOWN: 13, DPAD_LEFT: 14, DPAD_RIGHT: 15,
});
/* Mouse buttons as MouseEvent.button. */
export const MOUSE = Object.freeze({ LEFT: 0, MIDDLE: 1, RIGHT: 2 });

/* GDD §4.2 and §4.3, transcribed. `pad` entries are button indices; triggers are analog.
 *
 * SEAT 0 — keyboard, mouse, and (solo only) the first pad. The arrow keys used to be
 * alternates for WASD here and are now seat 1's alone; see the header. */
export const DEFAULT_BINDINGS = Object.freeze({
  [CONTEXTS.FOOT]: {
    moveForward: { keys: ['KeyW'] },
    moveBack:    { keys: ['KeyS'] },
    moveLeft:    { keys: ['KeyA'] },
    moveRight:   { keys: ['KeyD'] },
    gripLeft:    { mouse: [MOUSE.LEFT],  pad: [PAD.LT], analog: true, latchable: true },
    gripRight:   { mouse: [MOUSE.RIGHT], pad: [PAD.RT], analog: true, latchable: true },
    jump:        { keys: ['Space'],      pad: [PAD.A] },   // jump / mantle / assisted climb
    brace:       { keys: ['ShiftLeft'],  pad: [PAD.LB] },  // sprint free, brace when gripping
    crouch:      { keys: ['ControlLeft', 'KeyC'] },        // crouch or controlled lower
    interact:    { keys: ['KeyE'],       pad: [PAD.X] },   // use, tool, vehicle seat
    context:     { keys: ['KeyQ'],       pad: [PAD.RB] },  // context rotate / toss / cancel
    drop:        {                       pad: [PAD.B] },   // controller-only per §4.3
    // §4.2 lists R as an essential on-foot verb, and §25.3 wants every implemented action on
    // a standard controller: D-pad down, which §4.3 leaves free ("tool quick select" is unbuilt).
    recover:     { keys: ['KeyR'],       pad: [PAD.DPAD_DOWN] },  // recover eligible held item/player
    // §25.2 Phase 4: swap which mover you are driving. The other one keeps holding what it
    // had, which is how a SOLO player experiences a two-person carry. Seat 1 has no such
    // action — in co-op there is nobody to swap to, and pressing it would steal a mover out
    // from under the other player (§6.4).
    swapMover:   { keys: ['Tab'],        pad: [PAD.Y] },
    pause:       { keys: ['Escape'],     pad: [PAD.MENU] },
    debug:       { keys: ['F3'] },
  },
  [CONTEXTS.DRIVE]: {
    throttle:     { keys: ['KeyW', 'ShiftLeft'],   pad: [PAD.RT], analog: true },
    brake:        { keys: ['KeyS', 'ControlLeft'], pad: [PAD.LT], analog: true },
    steerLeft:    { keys: ['KeyA'] },
    steerRight:   { keys: ['KeyD'] },
    handbrake:    { keys: ['Space'],      pad: [PAD.A] },
    horn:         { mouse: [MOUSE.LEFT],  pad: [PAD.X] },
    lookBack:     { mouse: [MOUSE.RIGHT], pad: [PAD.RB] },
    exitVehicle:  { keys: ['KeyE'],       pad: [PAD.B] },  // only when stopped
    // LB, not View: View is COOP.joinPad (a raw shell button, main.js), and a glance that
    // also seated the second player was Phase 16's known issue. m12 K4 keeps them apart.
    cargoGlance:  { keys: ['KeyQ'],       pad: [PAD.LB] },
    resetVehicle: { keys: ['KeyR'] },                      // only when stuck
    pause:        { keys: ['Escape'],     pad: [PAD.MENU] },
    debug:        { keys: ['F3'] },
  },
});

/* SEAT 1 — the arrows plus the punctuation block to their left, which is TowBros'
 * `CREW_BINDINGS` layout, and the first pad when one is connected.
 *
 * THERE IS ONE MOUSE, so seat 1 has no `mouse` entries anywhere and cannot be given any:
 * `bindingConflicts()` reports a seat-1 mouse binding as an error rather than letting two
 * seats fight over one pointer. Look is therefore four KEYS here (§4.4 wants parity, and
 * parity with a mouse means being able to turn at all), or the right stick on a pad, which
 * is the device this seat is really for. The keyboard fallback is cramped on purpose-built
 * hardware and honest about it — see docs/KNOWN_ISSUES.md. */
export const SEAT1_BINDINGS = Object.freeze({
  [CONTEXTS.FOOT]: {
    moveForward: { keys: ['ArrowUp'] },
    moveBack:    { keys: ['ArrowDown'] },
    moveLeft:    { keys: ['ArrowLeft'] },
    moveRight:   { keys: ['ArrowRight'] },
    lookLeft:    { keys: ['KeyH'] },
    lookRight:   { keys: ['KeyK'] },
    lookUp:      { keys: ['KeyU'] },
    lookDown:    { keys: ['KeyJ'] },
    gripLeft:    { keys: ['BracketLeft'],  pad: [PAD.LT], analog: true, latchable: true },
    gripRight:   { keys: ['BracketRight'], pad: [PAD.RT], analog: true, latchable: true },
    jump:        { keys: ['ShiftRight'],   pad: [PAD.A] },
    brace:       { keys: ['ControlRight'], pad: [PAD.LB] },
    crouch:      { keys: ['Slash'] },
    interact:    { keys: ['Quote'],        pad: [PAD.X] },
    context:     { keys: ['Semicolon'],    pad: [PAD.RB] },
    drop:        {                         pad: [PAD.B] },
    recover:     { keys: ['Backslash'],    pad: [PAD.DPAD_DOWN] },
    pause:       {                         pad: [PAD.MENU] },
  },
  [CONTEXTS.DRIVE]: {
    throttle:     { keys: ['ArrowUp'],    pad: [PAD.RT], analog: true },
    brake:        { keys: ['ArrowDown'],  pad: [PAD.LT], analog: true },
    steerLeft:    { keys: ['ArrowLeft'] },
    steerRight:   { keys: ['ArrowRight'] },
    handbrake:    { keys: ['ShiftRight'], pad: [PAD.A] },
    horn:         { keys: ['Quote'],      pad: [PAD.X] },
    lookBack:     { keys: ['Semicolon'],  pad: [PAD.RB] },
    exitVehicle:  { keys: ['Backslash'],  pad: [PAD.B] },
    cargoGlance:  { keys: ['Slash'],      pad: [PAD.LB] },   // see seat 0: View is the join button
    resetVehicle: { keys: ['KeyP'] },
    pause:        {                       pad: [PAD.MENU] },
  },
});

/** Seat 0 first. `Input` reads as many of these as `setSeatCount` asks for. */
export const SEAT_BINDINGS = Object.freeze([DEFAULT_BINDINGS, SEAT1_BINDINGS]);

/** The four look actions seat 1 steers with. Named once so `poll()` and the conflict
 *  checker cannot disagree about what counts as a look key. */
export const LOOK_ACTIONS = Object.freeze(['lookLeft', 'lookRight', 'lookUp', 'lookDown']);

/** GDD §21.4 accessibility + feel settings that belong to the input layer, not gameplay.
 *
 *  THIS IS THE SCHEMA. `sanitiseSettings()` accepts exactly these keys and no others, so the
 *  settings panel (src/ui/settings.js), the save file (src/core/save.js) and the constructor
 *  all validate through one function (Dev\INDEX.md → "an imported save is trusted less than a
 *  stored one — route it through the SAME validator"). Numbers are clamped to SETTINGS.ranges
 *  in config.js; these never enter game.state (m0 E8 / m12 J3). */
export const DEFAULT_SETTINGS = Object.freeze({
  mouseSensitivity: 1.0,
  padLookSensitivity: 2.6,   // scales right-stick look
  /** Look units per 60 Hz FRAME for a held look key (seat 1's UHJK). poll(frameMs) scales
   *  both this and the stick by frameMs / SETTINGS.lookRefFrameMs, so the rate is a rate and
   *  not "per whatever the monitor refreshes at" — it used to be per poll, which made a
   *  120 Hz display turn twice as fast (Phase 11 build-side M4). */
  keyLookRate: 15,
  invertLookX: false,
  invertLookY: false,
  stickDeadzone: 0.18,
  triggerThreshold: 0.35,    // above this an analog trigger counts as "down"
  gripMode: 'hold',          // 'hold' (§4.4 default) | 'toggle' (accessibility option)
});

export const GRIP_MODES = Object.freeze(['hold', 'toggle']);

/**
 * Validate a settings patch against DEFAULT_SETTINGS. Never throws: unknown keys and
 * unusable values are REPORTED in `rejected`, numbers are clamped to SETTINGS.ranges,
 * booleans coerced, gripMode checked against GRIP_MODES. Pure, so the save loader and the
 * live Input share it.
 * @returns {{accepted: object, rejected: string[]}}
 */
export function sanitiseSettings(patch) {
  const accepted = {};
  const rejected = [];
  if (!patch || typeof patch !== 'object') return { accepted, rejected: ['(not an object)'] };
  for (const [k, v] of Object.entries(patch)) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, k)) { rejected.push(k); continue; }
    const d = DEFAULT_SETTINGS[k];
    if (typeof d === 'boolean') { accepted[k] = !!v; continue; }
    if (typeof d === 'number') {
      const n = Number(v);
      if (!Number.isFinite(n)) { rejected.push(k); continue; }
      const r = SETTINGS.ranges[k];
      accepted[k] = r ? Math.min(r.max, Math.max(r.min, n)) : n;
      continue;
    }
    if (k === 'gripMode') {
      if (GRIP_MODES.includes(v)) accepted[k] = v; else rejected.push(k);
      continue;
    }
    rejected.push(k);
  }
  return { accepted, rejected };
}

/**
 * Report every reason two seats would fight over one control. Empty means they cannot.
 *
 * Written as a function rather than as a test fixture because §21.4 makes bindings a DATA
 * edit — a remap performed at runtime has to be checkable by the thing that accepts it, not
 * only by a suite that ran last week.
 */
export function bindingConflicts(seatBindings = SEAT_BINDINGS) {
  const out = [];
  const ctxs = new Set();
  for (const b of seatBindings) for (const c of Object.keys(b)) ctxs.add(c);

  for (const ctx of ctxs) {
    /** token -> [{seat, action}]. Keys and mouse buttons are physical and shared across
     *  seats; pad tokens are seat-qualified (one controller per seat), so a pad button can
     *  only clash with another action of the SAME seat. */
    const owners = new Map();
    const claim = (token, seat, action) => {
      if (!owners.has(token)) owners.set(token, []);
      owners.get(token).push({ seat, action });
    };
    seatBindings.forEach((bindings, seat) => {
      const actions = bindings[ctx];
      if (!actions) return;
      for (const [action, def] of Object.entries(actions)) {
        for (const code of def.keys || []) claim(code, seat, action);
        for (const b of def.mouse || []) claim('Mouse' + b, seat, action);
        for (const b of def.pad || []) claim(padToken(seat, b), seat, action);
        // There is one mouse. Any seat but 0 claiming it is an authoring error, not a clash
        // to be resolved — reported separately so the message says what to do about it.
        if (seat > 0 && (def.mouse || []).length) {
          out.push(`${ctx}: seat ${seat} binds the mouse (${action}); there is only one mouse`);
        }
      }
    });
    /* Two claims on one token is a conflict whether they are two SEATS (the TowBros case the
     * header describes) or two ACTIONS of one seat (a remap putting 'interact' on W while W is
     * still 'moveForward' — M18). The shipped tables have neither (m12 A1). */
    for (const [code, claims] of owners) {
      if (claims.length > 1) {
        out.push(`${ctx}: ${code} is claimed by ` +
                 claims.map((c) => `seat ${c.seat} ${c.action}`).join(' and '));
      }
    }
  }
  return out;
}

/* ---- remapping (§21.4 "full remapping", §26.6 — Phase 11 build-side M18) ----------------
 *
 * Bindings were always data; these are the edits. Everything here is PURE and works on plain
 * tables so the save loader (save.js sanitiseBindings), the live Input and a suite validate
 * through the same functions. The shipped tables are frozen and are never written: a change
 * is a CLONE with one action's sources replaced, accepted only if bindingConflicts() stays
 * empty, and persisted as the DIFF from the defaults (bindingDiff) — so a default that a later
 * build changes wins for every action the player never touched.
 *
 * A token is one physical control, in the shapes the event handlers already produce: a
 * KeyboardEvent.code ('KeyF'), 'Mouse<n>' (MouseEvent.button), or 'P<seat>B<i>' (a pad
 * button — the seat in it is informational; the seat being rebound is the one that counts,
 * because a capture on a pad arrives with the token of whichever seat that pad is currently
 * assigned to, and the row the player clicked decides who gets it). */

const KEY_CODE_SHAPE = new RegExp('^[A-Za-z][A-Za-z0-9]{0,' + (INPUT.remap.maxKeyCodeLength - 1) + '}$');
const MOUSE_TOKEN = /^Mouse(\d+)$/;
const PAD_TOKEN_PARTS = /^P(\d+)B(\d+)$/;

/** Classify a token, or null for anything that is not one of the three shapes. */
export function parseToken(token) {
  if (typeof token !== 'string') return null;
  let m = MOUSE_TOKEN.exec(token);
  if (m) {
    const button = Number(m[1]);
    return button <= INPUT.remap.maxMouseButton ? { kind: 'mouse', button } : null;
  }
  m = PAD_TOKEN_PARTS.exec(token);
  if (m) {
    const button = Number(m[2]);
    return button <= INPUT.remap.maxPadButton ? { kind: 'pad', seat: Number(m[1]), button } : null;
  }
  return KEY_CODE_SHAPE.test(token) ? { kind: 'key', code: token } : null;
}

/** 'reserved' if the shell owns this token (INPUT.remap.reservedKeys, COOP.joinPad), else null. */
export function reservedReason(token) {
  const p = parseToken(token);
  if (!p) return null;
  if (p.kind === 'key' && INPUT.remap.reservedKeys.includes(p.code)) return 'reserved';
  if (p.kind === 'pad' && p.button === COOP.joinPad) return 'reserved';
  return null;
}

/** What is printed for one token — the same labels glyphFor derives from a binding. */
export function tokenLabel(token) {
  const p = parseToken(token);
  if (!p) return String(token);
  if (p.kind === 'key') return keyLabel(p.code);
  if (p.kind === 'mouse') return MOUSE_LABELS[p.button] || 'M' + p.button;
  return padLabel(p.button);
}

function cloneDef(d) {
  const o = {};
  if (d.keys && d.keys.length) o.keys = d.keys.slice();
  if (d.mouse && d.mouse.length) o.mouse = d.mouse.slice();
  if (d.pad && d.pad.length) o.pad = d.pad.slice();
  if (d.analog) o.analog = true;
  if (d.latchable) o.latchable = true;
  return o;
}

/** A deep, unfrozen, plain copy of a seat table (the shipped one by default). */
export function cloneBindings(table = SEAT_BINDINGS) {
  return table.map((seatMap) => {
    const seat = {};
    for (const [ctx, actions] of Object.entries(seatMap)) {
      const out = {};
      for (const [action, def] of Object.entries(actions)) out[action] = cloneDef(def);
      seat[ctx] = out;
    }
    return seat;
  });
}

function sourcesOf(def) {
  return { keys: (def.keys || []).slice(), mouse: (def.mouse || []).slice(), pad: (def.pad || []).slice() };
}
function sameSources(a, b) {
  const A = sourcesOf(a), B = sourcesOf(b);
  return ['keys', 'mouse', 'pad'].every((k) => A[k].length === B[k].length && A[k].every((v, i) => v === B[k][i]));
}
/** Write sources onto a def in the shipped shape: an empty class is ABSENT, not []. */
function assignSources(def, s) {
  for (const k of ['keys', 'mouse', 'pad']) {
    if (s[k] && s[k].length) def[k] = s[k].slice(); else delete def[k];
  }
}

const SOURCE_CLASSES = ['keys', 'mouse', 'pad'];
function sameList(a, b) { return a.length === b.length && a.every((v, i) => v === b[i]); }

/**
 * The differences between a table and the defaults: { seat: { ctx: { action: {keys?, mouse?,
 * pad?} } } } — one entry per TOUCHED action, carrying only the source CLASSES that differ
 * (an explicit [] when a class was cleared, e.g. a key replaced by a mouse button). Untouched
 * classes, actions, contexts and seats are absent. This is what the save holds (§26.6): a
 * stored table would pin every default at the moment of saving, and a later build's better
 * default — even the pad half of an action whose key the player moved — would lose to it.
 */
export function bindingDiff(table, base = SEAT_BINDINGS) {
  const diff = {};
  table.forEach((seatMap, seat) => {
    const baseSeat = base[seat];
    if (!baseSeat) return;
    for (const [ctx, actions] of Object.entries(seatMap)) {
      const baseCtx = baseSeat[ctx];
      if (!baseCtx) continue;
      for (const [action, def] of Object.entries(actions)) {
        const bd = baseCtx[action];
        if (!bd || sameSources(def, bd)) continue;
        const s = sourcesOf(def), b = sourcesOf(bd);
        const entry = {};
        for (const k of SOURCE_CLASSES) if (!sameList(s[k], b[k])) entry[k] = s[k];
        if (!diff[seat]) diff[seat] = {};
        if (!diff[seat][ctx]) diff[seat][ctx] = {};
        diff[seat][ctx][action] = entry;
      }
    }
  });
  return diff;
}

/** How many action entries a diff carries. */
export function bindingDiffCount(diff) {
  let n = 0;
  if (!diff || typeof diff !== 'object') return 0;
  for (const ctxs of Object.values(diff)) {
    if (!ctxs || typeof ctxs !== 'object') continue;
    for (const actions of Object.values(ctxs)) {
      if (actions && typeof actions === 'object') n += Object.keys(actions).length;
    }
  }
  return n;
}

/** One diff entry's PRESENT source classes, validated — or null for a malformed entry.
 *  `reserved` says a token in it is the shell's. Absent classes stay as the default has them. */
function validSources(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const s = { reserved: false };
  for (const k of SOURCE_CLASSES) {
    const list = entry[k];
    if (list === undefined) continue;
    if (!Array.isArray(list)) return null;
    s[k] = [];
    for (const v of list) {
      const token = k === 'keys' ? v : k === 'mouse' ? 'Mouse' + v : 'P0B' + v;
      const p = parseToken(token);
      if (!p || (k === 'keys' && p.kind !== 'key') || (k !== 'keys' && !Number.isInteger(v))) return null;
      if (reservedReason(token)) s.reserved = true;
      s[k].push(k === 'keys' ? v : Number(v));
    }
  }
  return s;
}

/**
 * Apply a diff (a save's, or a hand-edited one) over the defaults. Never throws. Every entry
 * is checked — a known seat, context and action, well-formed tokens, no reserved token, no
 * locked action — and then TRIED: it lands only if bindingConflicts() stays empty with it in.
 * What did not land is listed in `dropped` with its reason, so the loader can say so.
 * @returns {{table: object[], dropped: {seat, ctx?, action?, reason, conflicts?}[]}}
 */
export function applyBindingDiff(diff, base = SEAT_BINDINGS) {
  const table = cloneBindings(base);
  const dropped = [];
  if (!diff || typeof diff !== 'object' || Array.isArray(diff)) return { table, dropped };
  for (const [seatKey, ctxs] of Object.entries(diff)) {
    const seat = Number(seatKey);
    if (!Number.isInteger(seat) || !table[seat] || !ctxs || typeof ctxs !== 'object') {
      dropped.push({ seat: seatKey, reason: 'unknown seat' });
      continue;
    }
    for (const [ctx, actions] of Object.entries(ctxs)) {
      if (!table[seat][ctx] || !actions || typeof actions !== 'object') {
        dropped.push({ seat, ctx, reason: 'unknown context' });
        continue;
      }
      for (const [action, entry] of Object.entries(actions)) {
        const def = table[seat][ctx][action];
        if (!def) { dropped.push({ seat, ctx, action, reason: 'unknown action' }); continue; }
        if (INPUT.remap.lockedActions.includes(action)) { dropped.push({ seat, ctx, action, reason: 'locked' }); continue; }
        const next = validSources(entry);
        if (!next) { dropped.push({ seat, ctx, action, reason: 'bad token' }); continue; }
        if (next.reserved) { dropped.push({ seat, ctx, action, reason: 'reserved' }); continue; }
        const before = sourcesOf(def);
        const merged = sourcesOf(def);
        for (const k of SOURCE_CLASSES) if (next[k]) merged[k] = next[k];
        assignSources(def, merged);
        const conflicts = bindingConflicts(table);
        if (conflicts.length) {
          assignSources(def, before);
          dropped.push({ seat, ctx, action, reason: 'conflict', conflicts });
        }
      }
    }
  }
  return { table, dropped };
}

/**
 * One rebind, on a plain table, pure: the result carries a NEW table on success and never
 * touches the one passed in. A key or mouse token replaces the action's keyboard-and-mouse
 * sources (they are one device class — the glyph the HUD shows for 'kbm' is whichever of them
 * comes first); a pad token replaces its pad source. The other class is kept, so rebinding
 * 'interact' to F leaves it on X for a controller (§4.4 parity survives a remap).
 * @returns {{ok: true, table: object[]} | {ok: false, reason: string, conflicts?: string[]}}
 */
export function rebindTable(table, seat, ctx, action, token) {
  const seatMap = table[seat];
  if (!seatMap) return { ok: false, reason: 'unknown seat' };
  const actions = seatMap[ctx];
  if (!actions) return { ok: false, reason: 'unknown context' };
  if (!actions[action]) return { ok: false, reason: 'unknown action' };
  if (INPUT.remap.lockedActions.includes(action)) return { ok: false, reason: 'locked' };
  const p = parseToken(token);
  if (!p) return { ok: false, reason: 'bad token' };
  if (reservedReason(token)) return { ok: false, reason: 'reserved' };
  const next = cloneBindings(table);
  const def = next[seat][ctx][action];
  const s = sourcesOf(def);
  if (p.kind === 'pad') s.pad = [p.button];
  else { s.keys = p.kind === 'key' ? [p.code] : []; s.mouse = p.kind === 'mouse' ? [p.button] : []; }
  assignSources(def, s);
  const conflicts = bindingConflicts(next);
  if (conflicts.length) return { ok: false, reason: 'conflict', conflicts };
  return { ok: true, table: next };
}

export class Input {
  /**
   * @param {EventTarget} target  usually window
   * @param {HTMLElement} surface element that owns pointer lock and mouse buttons (canvas)
   * @param {object|object[]} bindings  one context map (seat 0) or an array of them
   */
  constructor(target = window, surface = null, bindings = SEAT_BINDINGS, settings = {}) {
    this.target = target;
    this.surface = surface;
    // Same validator as applySettings(): a constructor arg is a patch that arrived early.
    this.settings = { ...DEFAULT_SETTINGS, ...sanitiseSettings(settings).accepted };

    this._down = new Set();       // codes/mouse tokens physically held
    this._pressed = new Set();    // went down since the last endStep()
    this._released = new Set();
    this._padValue = new Map();   // 'P<seat>B<i>' -> 0..1, refreshed by poll()
    /* Press edges are detected by PHYSICAL SLOT ('S<slot>B<i>'), never by seat token. A join
     * moves the first pad from seat 0 to seat 1 (seatForPadSlot), so a seat-keyed "was it
     * down last poll" lookup finds nothing for the new seat and a button STILL HELD across
     * the flip fires a second press — for the View button that press is "leave", the next
     * frame's is "join", and a human 3-9 frame hold ended solo half the time (measured
     * seatCount [2,1,2,1,2,1,2,1] over 8 held frames; m15 P7h pins the fix). */
    this._padSlotPrev = new Map();   // 'S<slot>B<i>' -> 0..1 at the previous poll
    this._latched = new Set();    // 'seat:action', held open by gripMode 'toggle'
    /* SHELL EDGES — a second edge buffer, per RENDER FRAME rather than per step.
     *
     * `_pressed` is cleared by endStep(), which the fixed-step loop calls N times per frame
     * while running and ZERO times while paused. A shell action (pause) has to be readable
     * on the render frame in both states, so a per-step buffer is wrong for it both ways:
     * gone before the frame reader gets there while running, never cleared while paused.
     * Presses land in `_shellPending`; poll() (once per frame, before the steps) rotates it
     * into `_shellPressed`, which consumeShellEdge() reads and the next rotation drops. A
     * press is therefore seen by exactly one frame read, and a stale one cannot linger. */
    this._shellPending = new Set();
    this._shellPressed = new Set();
    /* REBIND CAPTURE (M18). While set, every press — key, mouse button, pad button, from any
     * handler — goes to this callback INSTEAD of the held/edge sets, so the key the player
     * chose never acts in the game (m26 B9). {fn, leftMs}; poll() counts leftMs down on the
     * frame clock and calls fn(null) when it runs out. */
    this._capture = null;
    this._captureUp = null;       // the captured key code whose keyup is still owed to the capture

    this.setBindings(bindings);

    /** How many seats are being read. 1 = the validated solo build. */
    this.seatCount = 1;
    /** Accumulated look delta PER SEAT, consumed by that seat's camera once per step. */
    this.looks = this.seatBindings.map(() => ({ x: 0, y: 0 }));
    this.padSticks = this.seatBindings.map(() => ({ lx: 0, ly: 0, rx: 0, ry: 0 }));
    /** seat -> navigator.getGamepads() index, or -1. */
    this.padIndex = this.seatBindings.map(() => -1);
    /* seat -> the Gamepad OBJECT this seat's pad was read from at the last poll, or null.
     * navigator.getGamepads() hands back fresh objects on every call, so anything that wants
     * a pad's OUTPUT side — vibrationActuator (§8.4's haptic pulse, M28) — has to re-read it
     * through here each time rather than keeping a reference. Published rather than private
     * because it is also the seam a suite installs a fake actuator through (m35 H2). */
    this.padObjects = this.seatBindings.map(() => null);
    this.contexts = this.seatBindings.map(() => CONTEXTS.FOOT);

    /* SINGLE-PLAYER ALIASES — the same objects, never copies. A snapshot here would read
     * correctly for exactly one frame and then silently stop tracking. */
    this.look = this.looks[0];
    this.padStick = this.padSticks[0];

    this.pointerLocked = false;
    /** 'kbm' | 'pad' — which glyph set the HUD should draw (§26.5). Per seat. */
    this.activeDevice = this.seatBindings.map(() => 'kbm');

    this._bound = [];
    /** Fired when the window loses focus. main.js pauses on it (§21.4 solo pause). */
    this.onBlur = null;
    /** Fired on a locked→unlocked pointer transition ONLY. Chrome consumes the Escape that
     *  releases the lock and delivers no keydown for it, so the lost lock is the only trace of
     *  the press; main.js reads it as the pause request it was. */
    this.onPointerLockLost = null;
    /** Fired with (context, seat) so the HUD can redraw prompts (§4.4). */
    this.onContextChanged = null;
  }

  // ---- seats ------------------------------------------------------------------------

  /**
   * How many seats to read, and therefore who gets the gamepads.
   *
   * THE FIRST PAD GOES TO SEAT 1 IN CO-OP, and to seat 0 when solo. Seat 0 already owns the
   * keyboard and the mouse; handing it the only controller as well would leave the player
   * who joined with nothing, which is the opposite of what plugging a pad in meant.
   */
  setSeatCount(n) {
    this.seatCount = Math.max(1, Math.min(n | 0, this.seatBindings.length));
    // Held state does not survive a seat change: a key held by the joining player was seat
    // 0's a moment ago, and would arrive as a press nobody made.
    this.clear();
    return this.seatCount;
  }

  /** Which seat should read gamepad slot `i` (0-based among CONNECTED pads). */
  seatForPadSlot(i) {
    if (this.seatCount < 2) return 0;
    return i === 0 ? 1 : 0;       // first pad to the joiner, second to seat 0
  }

  /** The Gamepad object seat `n` was polled from THIS frame, or null (§8.4's haptic pulse,
   *  M28 — src/audio/haptics.js is the only reader). Not a stored reference: poll() replaces
   *  it every frame because navigator.getGamepads() does, and clears it when the pad goes.
   *  A seat past seatCount, or one with no pad, is null and never a throw. */
  padForSeat(n) {
    return (n >= 0 && n < this.padObjects.length ? this.padObjects[n] : null) || null;
  }

  /**
   * A view of this Input pinned to one seat, duck-typed to the whole query surface.
   *
   * Systems then take an input-shaped thing and never learn how many people are playing —
   * which is the same seam a network client arrives through (§22.4), and the reason
   * `readCommand(input, prefix)` exists in SmallTownEmergencyServices.
   */
  seat(n) {
    const self = this;
    return {
      index: n,
      isDown:      (a) => self.isDown(a, n),
      wasPressed:  (a) => self.wasPressed(a, n),
      wasReleased: (a) => self.wasReleased(a, n),
      analog:      (a) => self.analog(a, n),
      moveAxis:    () => self.moveAxis(n),
      consumeLook: () => self.consumeLook(n),
      setContext:  (c) => self.setContext(c, n),
      get activeContext() { return self.contexts[n]; },
      get activeDevice()  { return self.activeDevice[n]; },
      get pointerLocked() { return self.pointerLocked; },
    };
  }

  // ---- settings (§21.4) -------------------------------------------------------------

  /**
   * Change feel/accessibility settings at runtime. Every consumer reads `this.settings.X`
   * live (mousemove, _pollPads, _pollLookKeys, _press, isDown, analog), so a patch takes
   * effect on the next event or poll with no other call. Unknown keys are reported, not
   * thrown. A gripMode change drops every latch: a latch set is toggle-mode state, and
   * carrying one into hold mode would leave a grip "held" by nothing.
   * @returns {{applied: object, rejected: string[]}}
   */
  applySettings(patch) {
    const { accepted, rejected } = sanitiseSettings(patch);
    const modeChanged = Object.prototype.hasOwnProperty.call(accepted, 'gripMode') &&
                        accepted.gripMode !== this.settings.gripMode;
    Object.assign(this.settings, accepted);
    if (modeChanged) this._latched.clear();
    return { applied: accepted, rejected };
  }

  /** A copy — the live object is this class's to mutate, through applySettings only. */
  getSettings() { return { ...this.settings }; }

  /** The stick deadzone as currently configured, for a suite to probe the one number the
   *  pad path rescales through (m16 I5). */
  deadzone(v) { return deadzone(v, this.settings.stickDeadzone); }

  // ---- bindings -------------------------------------------------------------------

  setBindings(bindings) {
    this.seatBindings = Array.isArray(bindings) ? bindings : [bindings];
    /** seat -> (context -> Map(token -> action[])) */
    this._sourceIndex = this.seatBindings.map((seatMap, seat) => {
      const perContext = new Map();
      for (const [ctx, actions] of Object.entries(seatMap)) {
        const idx = new Map();
        for (const [action, def] of Object.entries(actions)) {
          for (const code of def.keys  || []) push(idx, code, action);
          for (const b    of def.mouse || []) push(idx, 'Mouse' + b, action);
          /* Pad tokens are SEAT-QUALIFIED, and that is the whole reason they can be indexed at
           * all. Two controllers both report button 6, so an unqualified 'Pad6' would be seat
           * 1's trigger arriving as seat 0's as well; 'P<seat>B<i>' cannot, and it is the token
           * _pollPads actually presses.
           *
           * THEY WERE MISSING UNTIL M27, and one feature depended on them: §21.4's toggle grip.
           * _press() resolves a token to its actions to decide what to latch, so a pad trigger
           * press found no action and never latched — gripMode 'toggle' worked on the keyboard
           * and did nothing whatsoever on a controller, which is a §4.4 parity hole rather than
           * a nuance. m34 T1i pins it. Nothing else regressed by their absence: _markDevice is
           * only ever called with a key code, _tokenIsBound only with key and mouse tokens, and
           * _clearSeat now drops a seat's held pad buttons on a context switch the same way it
           * drops its keys — which _pollPads re-adds on the next poll if the button is still
           * physically held, before any step reads it. */
          for (const b    of def.pad   || []) push(idx, padToken(seat, b), action);
        }
        perContext.set(ctx, idx);
      }
      return perContext;
    });
    // `bindings` stays the seat-0 map so existing readers of `input.bindings` still work.
    this.bindings = this.seatBindings[0];

    function push(map, token, action) {
      if (!map.has(token)) map.set(token, []);
      map.get(token).push(action);
    }
  }

  // ---- remapping (§21.4 "full remapping" — M18) ------------------------------------

  /** A plain, unfrozen copy of the live table — what the Controls card lists. */
  bindingTable() { return cloneBindings(this.seatBindings); }

  /** The live table's differences from the shipped defaults — what the save holds. */
  bindingDiff() { return bindingDiff(this.seatBindings); }

  /**
   * Bind one action to one token, if the result is conflict-free (rebindTable). On success
   * the new table is INSTALLED and { ok: true } returned; on any refusal the live table is
   * untouched and the reason (and the conflicts, naming the other action) come back — the
   * card shows them, never swallows them.
   */
  rebind(seat, ctx, action, token) {
    const r = rebindTable(this.seatBindings, seat, ctx, action, token);
    if (r.ok) this._installBindings(r.table);
    return r;
  }

  /**
   * One seat's table back to the shipped defaults (every seat when no seat is given).
   *
   * Through applyBindingDiff, not a splice: the OTHER seats' changes are re-applied over the
   * defaults, and any of them that this reset makes a conflict is dropped (seat 0 moved
   * interact off E, seat 1 took E, seat 0 resets — seat 1's E goes back to Quote). A spliced
   * reset left the live table conflicting, and every later rebind was then refused for a
   * conflict the player never made.
   * @returns {{dropped: object[]}} what the reset took from the other seats, with reasons
   */
  resetBindings(seat) {
    if (seat === undefined || seat === null) { this._installBindings(SEAT_BINDINGS); return { dropped: [] }; }
    const diff = this.bindingDiff();
    delete diff[seat];
    const { table, dropped } = applyBindingDiff(diff);
    this._installBindings(table);
    return { dropped };
  }

  /** Install a saved diff over the defaults (applyBindingDiff validates and drops). */
  applyBindings(diff) {
    const { table, dropped } = applyBindingDiff(diff);
    this._installBindings(table);
    return { applied: bindingDiffCount(bindingDiff(table)), dropped };
  }

  /** A table that differs from the shipped one in nothing IS the shipped one: install the
   *  frozen original, so `input.seatBindings === SEAT_BINDINGS` stays true for a player who
   *  never remapped (m0 pins it) and a clone is only ever a clone with a difference in it. */
  _installBindings(table) {
    this.setBindings(bindingDiffCount(bindingDiff(table)) ? table : SEAT_BINDINGS);
  }

  /**
   * Route the NEXT press (any device, any handler) to `fn(token)` instead of the game, for
   * at most INPUT.remap.captureTimeoutMs on the frame clock, after which fn(null). The
   * callback ends the capture itself (endCapture) once it has what it wants, so a modifier
   * chord or a bounced button cannot bind twice.
   */
  beginCapture(fn, timeoutMs = INPUT.remap.captureTimeoutMs) {
    this._capture = { fn, leftMs: timeoutMs };
  }
  endCapture() { this._capture = null; }
  get capturing() { return !!this._capture; }

  /** The label for one action on a device from THIS input's live table (see glyphFor). */
  glyphFor(action, seat = 0, device = this.activeDevice[seat]) {
    return glyphFor(action, seat, device, { bindings: this.seatBindings, context: this.contexts[seat] });
  }

  /** The binding record for an action in a seat's active context, or null. */
  _def(action, seat = 0) {
    const seatMap = this.seatBindings[seat];
    const ctx = seatMap && seatMap[this.contexts[seat]];
    return (ctx && ctx[action]) || null;
  }

  /** Does ANY seat, in ANY context, bind this token? Decides whether to preventDefault. */
  _tokenIsBound(token) {
    for (const perContext of this._sourceIndex) {
      for (const idx of perContext.values()) if (idx.has(token)) return true;
    }
    return false;
  }

  setContext(ctx, seat = 0) {
    if (ctx === this.contexts[seat]) return ctx;
    /* Held state does not carry across a context switch: Space held while entering the
     * truck must not arrive as a handbrake the player never pressed (§4.4).
     *
     * ONLY THIS SEAT'S STATE. clear() used to be right because there was one seat; with two
     * it would drop the other player's held grip the instant their partner climbed into the
     * cab — a §6.4 failure that reads as "the game dropped my couch". */
    this._clearSeat(seat);
    this.contexts[seat] = ctx;
    if (this.onContextChanged) this.onContextChanged(ctx, seat);
    return ctx;
  }

  /** Seat 0's context. Kept as a settable property so single-player callers are unchanged. */
  get activeContext() { return this.contexts[0]; }
  set activeContext(c) { this.contexts[0] = c; }

  // ---- attach / detach ------------------------------------------------------------

  attach() {
    const add = (t, type, fn, opts) => { t.addEventListener(type, fn, opts); this._bound.push([t, type, fn, opts]); };

    add(this.target, 'keydown', (e) => {
      /* A REBIND CAPTURE (M18) owns the whole keydown: nothing after this listener — the
       * title's, the shell's F3/F2, the pause path — may see the key the player is choosing,
       * and Escape cancels rather than binds. This listener is the first one on window (boot
       * attaches it before any card exists), so stopping here stops everything for an event
       * dispatched ON window; a real keyboard event bubbles up from the focused element, where
       * the settings card's capture-phase listener does the same job first (settings.js). */
      if (this._capture) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.repeat) return;
        if (e.code === 'Escape') { const { fn } = this._capture; this._capture = null; fn(null); return; }
        this._captureUp = e.code;
        this._press(e.code);
        return;
      }
      if (this._tokenIsBound(e.code)) e.preventDefault();  // Space must not scroll, F3 must not open Find
      if (e.repeat) return;
      this._press(e.code);
      this._markDevice(e.code, 'kbm');
    });
    add(this.target, 'keyup', (e) => {
      // The captured key's release is nobody's either: a release edge for a key never held.
      if (this._captureUp && e.code === this._captureUp) {
        this._captureUp = null;
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      this._release(e.code);
    });

    const surf = this.surface || this.target;
    add(surf, 'mousedown', (e) => {
      if (this._tokenIsBound('Mouse' + e.button)) e.preventDefault();
      this._press('Mouse' + e.button);
      this.activeDevice[0] = 'kbm';
    });
    // mouseup on window, not the surface: a button released off-canvas would stick.
    add(this.target, 'mouseup', (e) => this._release('Mouse' + e.button));
    add(surf, 'contextmenu', (e) => e.preventDefault());  // RMB is the right-hand grip

    // The mouse is seat 0's, always. See SEAT1_BINDINGS.
    add(this.target, 'mousemove', (e) => {
      if (!this.pointerLocked) return;
      const s = this.settings.mouseSensitivity;
      this.looks[0].x += e.movementX * s * (this.settings.invertLookX ? -1 : 1);
      this.looks[0].y += e.movementY * s * (this.settings.invertLookY ? -1 : 1);
    });
    add(document, 'pointerlockchange', () => this._pointerLockChanged());

    // A held key whose keyup lands outside the window would stick forever.
    add(this.target, 'blur', () => { this.clear(); if (this.onBlur) this.onBlur(); });

    // Pads are resolved by SLOT in poll(), so a connect/disconnect only has to invalidate.
    add(this.target, 'gamepadconnected',    () => { this._padValue.clear(); this._padSlotPrev.clear(); });
    add(this.target, 'gamepaddisconnected', () => { this._padValue.clear(); this._padSlotPrev.clear(); });

    return this;
  }

  detach() {
    for (const [t, type, fn, opts] of this._bound) t.removeEventListener(type, fn, opts);
    this._bound.length = 0;
  }

  /** The pointerlockchange handler, callable directly so a suite can lose the lock without a
   *  real one (tools\m12-tests.js C10-C12, m15 P8). */
  _pointerLockChanged() {
    const was = this.pointerLocked;
    this.pointerLocked = !!this.surface && document.pointerLockElement === this.surface;
    if (this.pointerLocked) return;
    /* Losing the lock (Esc) must not leave grips held down — SEAT 0's grips. The lock is the
     * mouse's, and the mouse is seat 0's (SEAT1_BINDINGS); clearing every seat here dropped
     * seat 1's keyboard grip the moment seat 0 pressed Esc, the same §6.4 failure setContext
     * had, and it read as "the game dropped my couch". */
    this._clearSeat(0);
    if (was && this.onPointerLockLost) this.onPointerLockLost();
  }

  /** Hand the cursor back. The §15.2 settlement screen has a button on it, and a locked
   *  pointer cannot press one. */
  releasePointerLock() {
    if (document.exitPointerLock && document.pointerLockElement) document.exitPointerLock();
  }

  requestPointerLock() {
    /* ⚠ requestPointerLock REJECTS (a promise, in current Chrome) rather than returning
     * false when there is no user gesture — already in DevINDEX.md from ContainmentDetail,
     * and it bit here anyway the moment the title screen's start() could be driven
     * programmatically: the rejection surfaced as the crash banner over a healthy game.
     * Wrap and swallow; pointerlockchange is the real signal either way. */
    if (!this.surface || !this.surface.requestPointerLock) return;
    try {
      const p = this.surface.requestPointerLock();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (e) { /* no gesture, no lock — the click handler will try again */ }
  }

  // ---- polling --------------------------------------------------------------------

  /** Read the gamepads and the held look keys. Must run once per RENDER frame, before the
   *  step loop: the Gamepad API is poll-only, so a button tapped between polls is a button
   *  that never happened.
   *
   *  @param {number} [frameMs]  the REAL frame length. Stick and key look accumulate per
   *  poll, so without it their angular speed scaled with the monitor's refresh rate (2.6 × 10
   *  units per poll ≈ 3.4 rad/s at 60 Hz, 6.9 at 120). The rates in DEFAULT_SETTINGS are
   *  authored per SETTINGS.lookRefFrameMs and scaled by frameMs / that; no argument means one
   *  reference frame, so existing callers are unchanged. Capped at SIM.maxFrameMs for the same
   *  reason the clock discards longer gaps — a backgrounded tab must not come back with a
   *  quarter-turn banked. Mouse look is per pixel and needs no scaling. */
  poll(frameMs = SETTINGS.lookRefFrameMs) {
    const ms = Number.isFinite(frameMs) ? Math.max(0, Math.min(frameMs, SIM.maxFrameMs)) : SETTINGS.lookRefFrameMs;
    const scale = ms / SETTINGS.lookRefFrameMs;
    this._pollPads(scale);
    this._pollLookKeys(scale);
    // Rotate the shell-edge buffer AFTER the pads are read, so a pad press made in this poll
    // and a key pressed since the last frame both reach this frame's shell read, once.
    this._shellPressed = this._shellPending;
    this._shellPending = new Set();
    // A rebind capture times out on this clock (M18) — it runs while paused, the sim's does not.
    if (this._capture) {
      this._capture.leftMs -= ms;
      if (this._capture.leftMs <= 0) { const { fn } = this._capture; this._capture = null; fn(null); }
    }
  }

  _pollPads(scale = 1) {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    const connected = [];
    for (const p of navigator.getGamepads()) if (p && p.connected) connected.push(p);

    const prev = this._padSlotPrev;          // last poll, by physical slot — see the constructor
    const cur = new Map();
    this._padValue.clear();
    /* M28: EVERY seat, not just the seated ones — a seat that co-op dropped must not keep the
     * pad it had, or its actuator would still answer padForSeat after the join ended. */
    this.padObjects.fill(null);
    for (let s = 0; s < this.seatCount; s++) {
      this.padIndex[s] = -1;
      const st = this.padSticks[s];
      st.lx = st.ly = st.rx = st.ry = 0;
    }

    const dz = this.settings.stickDeadzone;
    const thr = this.settings.triggerThreshold;
    const isTrigger = (i) => i === PAD.LT || i === PAD.RT;

    for (let slot = 0; slot < connected.length; slot++) {
      const seat = this.seatForPadSlot(slot);
      if (seat >= this.seatCount) continue;
      const pad = connected[slot];
      this.padIndex[seat] = pad.index;
      this.padObjects[seat] = pad;    // M28: this poll's object, for the output side

      const ax = pad.axes || [];
      const st = this.padSticks[seat];
      st.lx = deadzone(ax[0] || 0, dz);
      st.ly = deadzone(ax[1] || 0, dz);
      st.rx = deadzone(ax[2] || 0, dz);
      st.ry = deadzone(ax[3] || 0, dz);

      let anyActivity = Math.abs(st.lx) + Math.abs(st.ly) + Math.abs(st.rx) + Math.abs(st.ry) > 0;

      const buttons = pad.buttons || [];
      for (let i = 0; i < buttons.length; i++) {
        const b = buttons[i];
        const v = typeof b === 'number' ? b : (b.value !== undefined ? b.value : (b.pressed ? 1 : 0));
        const token = padToken(seat, i);
        const slotKey = slotToken(slot, i);
        this._padValue.set(token, v);
        cur.set(slotKey, v);
        const gate = isTrigger(i) ? thr : 0.5;
        const nowDown = v >= gate;
        const wasDown = (prev.get(slotKey) || 0) >= gate;
        if (nowDown && !wasDown) { this._press(token); anyActivity = true; }
        else if (!nowDown && wasDown) this._release(token);
        else if (nowDown) { this._down.add(token); anyActivity = true; }
      }
      if (anyActivity) this.activeDevice[seat] = 'pad';

      // Right stick contributes to the same look accumulator the mouse writes to, so each
      // seat's camera has exactly one input to read (§4.4 parity).
      const ls = this.settings.padLookSensitivity * scale;
      this.looks[seat].x += st.rx * ls * 10 * (this.settings.invertLookX ? -1 : 1);
      this.looks[seat].y += st.ry * ls * 10 * (this.settings.invertLookY ? -1 : 1);
    }
    this._padSlotPrev = cur;
  }

  /** Seat 1 turns with keys when it has no pad. Accumulated per poll, scaled by the frame
   *  length exactly as the right stick is, so both devices reach the camera through one
   *  accumulator at one rate. */
  _pollLookKeys(scale = 1) {
    const rate = this.settings.keyLookRate * scale;
    const invX = this.settings.invertLookX ? -1 : 1;
    const invY = this.settings.invertLookY ? -1 : 1;
    for (let s = 0; s < this.seatCount; s++) {
      const l = this.looks[s];
      if (this.isDown('lookLeft', s))  l.x -= rate * invX;
      if (this.isDown('lookRight', s)) l.x += rate * invX;
      if (this.isDown('lookUp', s))    l.y -= rate * invY;
      if (this.isDown('lookDown', s))  l.y += rate * invY;
    }
  }

  _markDevice(token, device) {
    for (let s = 0; s < this.seatCount; s++) {
      if (this._actionsFor(token, s).length) this.activeDevice[s] = device;
    }
  }

  _press(token) {
    // A capture (M18) takes the press whole: not held, not an edge, not a shell edge — the
    // chosen key must not also jump, grab, pause or start the job (m26 B9).
    if (this._capture) { this._capture.fn(token); return; }
    this._down.add(token);
    this._pressed.add(token);
    this._shellPending.add(token);
    // Toggle-grip (§21.4) is resolved here, at the source, so no gameplay system needs to
    // know which mode is active — isDown('gripLeft') means the same thing either way.
    if (this.settings.gripMode === 'toggle') {
      for (let s = 0; s < this.seatCount; s++) {
        for (const action of this._actionsFor(token, s)) {
          const def = this._def(action, s);
          if (!def || !def.latchable) continue;
          const key = s + ':' + action;
          if (this._latched.has(key)) this._latched.delete(key);
          else this._latched.add(key);
        }
      }
    }
  }

  _release(token) { this._down.delete(token); this._released.add(token); }

  _actionsFor(token, seat = 0) {
    const perContext = this._sourceIndex[seat];
    const idx = perContext && perContext.get(this.contexts[seat]);
    return (idx && idx.get(token)) || [];
  }

  _tokens(action, seat = 0) {
    const def = this._def(action, seat);
    if (!def) return [];
    const out = [];
    for (const c of def.keys  || []) out.push(c);
    for (const b of def.mouse || []) out.push('Mouse' + b);
    for (const b of def.pad   || []) out.push(padToken(seat, b));
    return out;
  }

  // ---- queries --------------------------------------------------------------------

  isDown(action, seat = 0) {
    const def = this._def(action, seat);
    if (this.settings.gripMode === 'toggle' && def && def.latchable) {
      return this._latched.has(seat + ':' + action);   // in toggle mode the latch IS the state
    }
    for (const t of this._tokens(action, seat)) if (this._down.has(t)) return true;
    return false;
  }

  wasPressed(action, seat = 0) {
    for (const t of this._tokens(action, seat)) if (this._pressed.has(t)) return true;
    return false;
  }

  wasReleased(action, seat = 0) {
    for (const t of this._tokens(action, seat)) if (this._released.has(t)) return true;
    return false;
  }

  /**
   * Read-and-clear a SHELL edge — an action the shell (pause, start) must see on the render
   * frame whether or not any simulation step ran. Returns true once per press; a held key or
   * button is not a second edge. See the constructor for why this is not wasPressed().
   */
  consumeShellEdge(action, seat = 0) {
    let hit = false;
    for (const t of this._tokens(action, seat)) {
      if (this._shellPressed.delete(t)) hit = true;
    }
    return hit;
  }

  /** The same for one raw pad button on a seat's pad, for shell buttons that are deliberately
   *  NOT gameplay actions (COOP.joinPad — joining must not be something a binding can remap
   *  onto a grip). */
  consumeShellButton(seat, buttonIndex) {
    return this._shellPressed.delete(padToken(seat, buttonIndex));
  }

  /** The prompt glyphs for a seat on a device, from THIS input's live bindings and the seat's
   *  active context — so a remap and a context switch both redraw (§4.4). See glyphsFor(). */
  glyphsFor(seat = 0, device = this.activeDevice[seat]) {
    return glyphsFor(seat, device, { bindings: this.seatBindings, context: this.contexts[seat] });
  }

  /** 0..1 pressure. Analog on a trigger, binary elsewhere. Feeds grip force (§6.2, §6.5). */
  analog(action, seat = 0) {
    const def = this._def(action, seat);
    if (!def) return 0;
    if (this.settings.gripMode === 'toggle' && def.latchable) {
      return this._latched.has(seat + ':' + action) ? 1 : 0;
    }
    /* A digital source (key or mouse button) is full pressure. Tested with the PAD_TOKEN
     * regex rather than a `startsWith('P')` check, which seat 1 breaks: `Period`, `PageUp`
     * and friends are ordinary keys whose codes begin with P, and treating one as a pad
     * button would report a held key as zero pressure. */
    for (const t of this._tokens(action, seat)) {
      if (!PAD_TOKEN.test(t) && this._down.has(t)) return 1;
    }
    let v = 0;
    for (const b of def.pad || []) v = Math.max(v, this._padValue.get(padToken(seat, b)) || 0);
    if (def.analog) return v >= this.settings.triggerThreshold ? v : 0;
    return v >= 0.5 ? 1 : 0;
  }

  /** Move intent, -1..1 per axis, magnitude clamped to 1.
   *  y is FORWARD (+1 = away from camera), matching the third-person convention. */
  moveAxis(seat = 0) {
    const st = this.padSticks[seat];
    let x, y;
    if (Math.abs(st.lx) + Math.abs(st.ly) > 0) {
      x = st.lx; y = -st.ly;   // pad Y is +down
    } else if (this.contexts[seat] === CONTEXTS.DRIVE) {
      x = (this.isDown('steerRight', seat) ? 1 : 0) - (this.isDown('steerLeft', seat) ? 1 : 0);
      y = this.analog('throttle', seat) - this.analog('brake', seat);
    } else {
      x = (this.isDown('moveRight', seat) ? 1 : 0) - (this.isDown('moveLeft', seat) ? 1 : 0);
      y = (this.isDown('moveForward', seat) ? 1 : 0) - (this.isDown('moveBack', seat) ? 1 : 0);
    }
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    return { x, y };
  }

  /** Consume a seat's accumulated look delta. Consuming — two readers would each get half. */
  consumeLook(seat = 0) {
    const acc = this.looks[seat];
    const l = { x: acc.x, y: acc.y };
    acc.x = 0; acc.y = 0;
    return l;
  }

  /** Clear per-step edges. The fixed-step loop calls this once per SIMULATION step, so a
   *  wasPressed() is seen by exactly one step regardless of frame rate. */
  endStep() { this._pressed.clear(); this._released.clear(); }

  /** Drop all held state (focus loss, contract reset). */
  clear() {
    this._down.clear(); this._pressed.clear(); this._released.clear();
    this._shellPending.clear(); this._shellPressed.clear();
    this._latched.clear();
    for (const l of this.looks) { l.x = 0; l.y = 0; }
  }

  /** Drop only one seat's held state — see setContext. */
  _clearSeat(seat) {
    for (const token of [...this._down]) {
      if (this._actionsFor(token, seat).length) this._down.delete(token);
    }
    for (const key of [...this._latched]) {
      if (key.indexOf(seat + ':') === 0) this._latched.delete(key);
    }
    this.looks[seat].x = 0; this.looks[seat].y = 0;
  }

  /** Test hooks: drive the game without a real keyboard (tools\m0-tests.js). */
  _debugPress(token)   { this._press(token); }
  _debugRelease(token) { this._release(token); }
  /** Test hook: pretend seat `seat` is holding pad button `i` at pressure `v`. */
  _debugPad(seat, i, v) {
    const token = padToken(seat, i);
    this._padValue.set(token, v);
    if (v >= 0.5) this._press(token); else this._release(token);
  }
}

/* ---- prompt glyphs (§26.5 "visible prompts and BOTH input mappings", §4.4) ------------
 *
 * ONE source: the binding table. The HUD used to print a literal 'E', 'Q' and 'LMB / RMB'
 * for every seat, so seat 1 — Quote/Semicolon/[ ] on the keyboard, X/RB/LT/RT on a pad —
 * was told to press keys it does not have. A second table of "what to print per seat" would
 * only drift from the first, so these DERIVE the label from the live binding: the first key
 * code, or the first mouse button, or the first pad index, whichever the device has. */

/** KeyboardEvent.code → what is printed on the key. Anything unlisted is the code with its
 *  'Key'/'Digit' prefix removed, which is right for every letter and number. */
const KEY_LABELS = Object.freeze({
  Quote: "'", Semicolon: ';', BracketLeft: '[', BracketRight: ']', Backslash: '\\',
  Slash: '/', Period: '.', Comma: ',', Minus: '-', Equal: '=', Backquote: '`',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Space: 'Space', Tab: 'Tab', Escape: 'Esc', Enter: 'Enter',
  ShiftLeft: 'Shift', ShiftRight: 'R-Shift', ControlLeft: 'Ctrl', ControlRight: 'R-Ctrl',
  AltLeft: 'Alt', AltRight: 'R-Alt',
});
const MOUSE_LABELS = Object.freeze({ [MOUSE.LEFT]: 'LMB', [MOUSE.MIDDLE]: 'MMB', [MOUSE.RIGHT]: 'RMB' });
/** Built FROM `PAD`, so a button added there gets a label here without a second edit. */
const PAD_LABELS = Object.freeze(Object.fromEntries(Object.entries(PAD).map(([name, i]) => [i, ({
  VIEW: 'View', MENU: 'Menu',
  DPAD_UP: 'D-up', DPAD_DOWN: 'D-down', DPAD_LEFT: 'D-left', DPAD_RIGHT: 'D-right',
})[name] || name])));

export function keyLabel(code) {
  return KEY_LABELS[code] || String(code).replace(/^(Key|Digit)/, '');
}
/** For the one raw (unbound) shell button, COOP.joinPad, which the help line still names. */
export function padLabel(i) { return PAD_LABELS[i] || 'B' + i; }

/**
 * The label a seat should be shown for an action on a device — PURE, no DOM, no instance.
 *
 * A binding the device does not have falls back to the other device's, so the label is never
 * blank for an action the seat can somehow perform (seat 1's pause is pad-only; drop is
 * pad-only everywhere). An action unbound in the seat's context falls back to FOOT, because
 * the prompt verbs (interact/context/grips) are on-foot verbs and DRIVE never lists them.
 *
 * @param {string} action
 * @param {number} seat
 * @param {'kbm'|'pad'} device
 * @param {{context?: string, bindings?: object[]}} [opts]  the LIVE tables; defaults are the shipped ones
 */
export function glyphFor(action, seat = 0, device = 'kbm',
                         { context = CONTEXTS.FOOT, bindings = SEAT_BINDINGS } = {}) {
  const seatMap = bindings[seat];
  if (!seatMap) return '';
  const def = (seatMap[context] && seatMap[context][action]) ||
              (seatMap[CONTEXTS.FOOT] && seatMap[CONTEXTS.FOOT][action]);
  if (!def) return '';
  return device === 'pad' ? (glyphOf(def, 'pad') || glyphOf(def, 'kbm'))
                          : (glyphOf(def, 'kbm') || glyphOf(def, 'pad'));
}

/** The label of ONE binding record on ONE device, '' when that device has no binding for it —
 *  no fallback. glyphFor adds the fallback for prompts; the Controls card (M18) wants the
 *  honest per-device chip, because 'B' under a keyboard heading is a lie. */
export function glyphOf(def, device = 'kbm') {
  if (!def) return '';
  if (device === 'pad') return (def.pad && def.pad.length) ? (PAD_LABELS[def.pad[0]] || 'B' + def.pad[0]) : '';
  return (def.keys && def.keys.length) ? keyLabel(def.keys[0])
    : (def.mouse && def.mouse.length) ? (MOUSE_LABELS[def.mouse[0]] || 'M' + def.mouse[0]) : '';
}

/** The four glyphs the HUD draws — the two prompt keys and the two grips (hud.js). */
export function glyphsFor(seat = 0, device = 'kbm', opts) {
  return {
    primary:   glyphFor('interact',  seat, device, opts),
    secondary: glyphFor('context',   seat, device, opts),
    gripL:     glyphFor('gripLeft',  seat, device, opts),
    gripR:     glyphFor('gripRight', seat, device, opts),
    device,
  };
}

const PAD_TOKEN = /^P\d+B\d+$/;
function padToken(seat, i) { return 'P' + seat + 'B' + i; }
/** Edge-detection key for a PHYSICAL pad: slot among connected pads, not seat. */
function slotToken(slot, i) { return 'S' + slot + 'B' + i; }

/** Rescaled deadzone: 0 inside, and just past the edge is ~0 rather than a jump to dz. Exported
 *  for the suites; the live number is `input.deadzone(v)`. */
export function deadzone(v, dz) {
  const a = Math.abs(v);
  if (a < dz) return 0;
  return Math.sign(v) * ((a - dz) / (1 - dz));   // rescaled, so just past the deadzone is ~0
}
