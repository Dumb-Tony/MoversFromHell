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
    cargoGlance:  { keys: ['KeyQ'],       pad: [PAD.VIEW] },
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
    cargoGlance:  { keys: ['Slash'],      pad: [PAD.VIEW] },
    resetVehicle: { keys: ['KeyP'] },
    pause:        {                       pad: [PAD.MENU] },
  },
});

/** Seat 0 first. `Input` reads as many of these as `setSeatCount` asks for. */
export const SEAT_BINDINGS = Object.freeze([DEFAULT_BINDINGS, SEAT1_BINDINGS]);

/** The four look actions seat 1 steers with. Named once so `poll()` and the conflict
 *  checker cannot disagree about what counts as a look key. */
export const LOOK_ACTIONS = Object.freeze(['lookLeft', 'lookRight', 'lookUp', 'lookDown']);

/** GDD §21.4 accessibility + feel settings that belong to the input layer, not gameplay. */
export const DEFAULT_SETTINGS = Object.freeze({
  mouseSensitivity: 1.0,
  padLookSensitivity: 2.6,   // scales right-stick look
  keyLookRate: 15,           // look units per POLL for a held look key; see poll()
  invertLookY: false,
  stickDeadzone: 0.18,
  triggerThreshold: 0.35,    // above this an analog trigger counts as "down"
  gripMode: 'hold',          // 'hold' (§4.4 default) | 'toggle' (accessibility option)
});

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
    /** token -> [seat] */
    const owners = new Map();
    seatBindings.forEach((bindings, seat) => {
      const actions = bindings[ctx];
      if (!actions) return;
      for (const [action, def] of Object.entries(actions)) {
        for (const code of def.keys || []) {
          if (!owners.has(code)) owners.set(code, []);
          owners.get(code).push({ seat, action });
        }
        // There is one mouse. Any seat but 0 claiming it is an authoring error, not a clash
        // to be resolved — reported separately so the message says what to do about it.
        if (seat > 0 && (def.mouse || []).length) {
          out.push(`${ctx}: seat ${seat} binds the mouse (${action}); there is only one mouse`);
        }
      }
    });
    for (const [code, claims] of owners) {
      const seats = new Set(claims.map((c) => c.seat));
      if (seats.size > 1) {
        out.push(`${ctx}: ${code} is claimed by ` +
                 claims.map((c) => `seat ${c.seat} ${c.action}`).join(' and '));
      }
    }
  }
  return out;
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
    this.settings = { ...DEFAULT_SETTINGS, ...settings };

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

    this.setBindings(bindings);

    /** How many seats are being read. 1 = the validated solo build. */
    this.seatCount = 1;
    /** Accumulated look delta PER SEAT, consumed by that seat's camera once per step. */
    this.looks = this.seatBindings.map(() => ({ x: 0, y: 0 }));
    this.padSticks = this.seatBindings.map(() => ({ lx: 0, ly: 0, rx: 0, ry: 0 }));
    /** seat -> navigator.getGamepads() index, or -1. */
    this.padIndex = this.seatBindings.map(() => -1);
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

  // ---- bindings -------------------------------------------------------------------

  setBindings(bindings) {
    this.seatBindings = Array.isArray(bindings) ? bindings : [bindings];
    /** seat -> (context -> Map(token -> action[])) */
    this._sourceIndex = this.seatBindings.map((seatMap) => {
      const perContext = new Map();
      for (const [ctx, actions] of Object.entries(seatMap)) {
        const idx = new Map();
        for (const [action, def] of Object.entries(actions)) {
          for (const code of def.keys  || []) push(idx, code, action);
          for (const b    of def.mouse || []) push(idx, 'Mouse' + b, action);
          // Pad tokens are SEAT-QUALIFIED. Two controllers both report button 6, so an
          // unqualified 'Pad6' is seat 1's trigger arriving as seat 0's as well.
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
      if (this._tokenIsBound(e.code)) e.preventDefault();  // Space must not scroll, F3 must not open Find
      if (e.repeat) return;
      this._press(e.code);
      this._markDevice(e.code, 'kbm');
    });
    add(this.target, 'keyup', (e) => this._release(e.code));

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
      this.looks[0].x += e.movementX * s;
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
   *  that never happened. */
  poll() {
    this._pollPads();
    this._pollLookKeys();
    // Rotate the shell-edge buffer AFTER the pads are read, so a pad press made in this poll
    // and a key pressed since the last frame both reach this frame's shell read, once.
    this._shellPressed = this._shellPending;
    this._shellPending = new Set();
  }

  _pollPads() {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    const connected = [];
    for (const p of navigator.getGamepads()) if (p && p.connected) connected.push(p);

    const prev = this._padSlotPrev;          // last poll, by physical slot — see the constructor
    const cur = new Map();
    this._padValue.clear();
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
      const ls = this.settings.padLookSensitivity;
      this.looks[seat].x += st.rx * ls * 10;
      this.looks[seat].y += st.ry * ls * 10 * (this.settings.invertLookY ? -1 : 1);
    }
    this._padSlotPrev = cur;
  }

  /** Seat 1 turns with keys when it has no pad. Accumulated per POLL, exactly as the right
   *  stick is, so both devices reach the camera through one accumulator. */
  _pollLookKeys() {
    const rate = this.settings.keyLookRate;
    const inv = this.settings.invertLookY ? -1 : 1;
    for (let s = 0; s < this.seatCount; s++) {
      const l = this.looks[s];
      if (this.isDown('lookLeft', s))  l.x -= rate;
      if (this.isDown('lookRight', s)) l.x += rate;
      if (this.isDown('lookUp', s))    l.y -= rate * inv;
      if (this.isDown('lookDown', s))  l.y += rate * inv;
    }
  }

  _markDevice(token, device) {
    for (let s = 0; s < this.seatCount; s++) {
      if (this._actionsFor(token, s).length) this.activeDevice[s] = device;
    }
  }

  _press(token) {
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

const PAD_TOKEN = /^P\d+B\d+$/;
function padToken(seat, i) { return 'P' + seat + 'B' + i; }
/** Edge-detection key for a PHYSICAL pad: slot among connected pads, not seat. */
function slotToken(slot, i) { return 'S' + slot + 'B' + i; }

function deadzone(v, dz) {
  const a = Math.abs(v);
  if (a < dz) return 0;
  return Math.sign(v) * ((a - dz) / (1 - dz));   // rescaled, so just past the deadzone is ~0
}
