/* Input abstraction — GDD §4.2, §4.3, §4.4, §21.4.
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
 * Systems ask for ACTIONS ('gripLeft', 'brace'), never for KeyW or button 6. The binding
 * table is data, so remapping (§21.4) stays a data edit.
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

/* GDD §4.2 and §4.3, transcribed. `pad` entries are button indices; triggers are analog. */
export const DEFAULT_BINDINGS = Object.freeze({
  [CONTEXTS.FOOT]: {
    moveForward: { keys: ['KeyW', 'ArrowUp'] },
    moveBack:    { keys: ['KeyS', 'ArrowDown'] },
    moveLeft:    { keys: ['KeyA', 'ArrowLeft'] },
    moveRight:   { keys: ['KeyD', 'ArrowRight'] },
    gripLeft:    { mouse: [MOUSE.LEFT],  pad: [PAD.LT], analog: true, latchable: true },
    gripRight:   { mouse: [MOUSE.RIGHT], pad: [PAD.RT], analog: true, latchable: true },
    jump:        { keys: ['Space'],      pad: [PAD.A] },   // jump / mantle / assisted climb
    brace:       { keys: ['ShiftLeft', 'ShiftRight'], pad: [PAD.LB] }, // sprint free, brace when gripping
    crouch:      { keys: ['ControlLeft', 'KeyC'] },        // crouch or controlled lower
    interact:    { keys: ['KeyE'],       pad: [PAD.X] },   // use, tool, vehicle seat
    context:     { keys: ['KeyQ'],       pad: [PAD.RB] },  // context rotate / toss / cancel
    drop:        {                       pad: [PAD.B] },   // controller-only per §4.3
    recover:     { keys: ['KeyR'] },                       // recover eligible held item/player
    // §25.2 Phase 4: swap which mover you are driving. The other one keeps holding what it
    // had, which is how a solo player experiences a two-person carry.
    swapMover:   { keys: ['Tab'],        pad: [PAD.Y] },
    pause:       { keys: ['Escape'],     pad: [PAD.MENU] },
    debug:       { keys: ['F3'] },
  },
  [CONTEXTS.DRIVE]: {
    throttle:     { keys: ['KeyW', 'ArrowUp', 'ShiftLeft'],    pad: [PAD.RT], analog: true },
    brake:        { keys: ['KeyS', 'ArrowDown', 'ControlLeft'], pad: [PAD.LT], analog: true },
    steerLeft:    { keys: ['KeyA', 'ArrowLeft'] },
    steerRight:   { keys: ['KeyD', 'ArrowRight'] },
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

/** GDD §21.4 accessibility + feel settings that belong to the input layer, not gameplay. */
export const DEFAULT_SETTINGS = Object.freeze({
  mouseSensitivity: 1.0,
  padLookSensitivity: 2.6,   // scales right-stick look
  invertLookY: false,
  stickDeadzone: 0.18,
  triggerThreshold: 0.35,    // above this an analog trigger counts as "down"
  gripMode: 'hold',          // 'hold' (§4.4 default) | 'toggle' (accessibility option)
});

export class Input {
  /**
   * @param {EventTarget} target  usually window
   * @param {HTMLElement} surface element that owns pointer lock and mouse buttons (canvas)
   */
  constructor(target = window, surface = null, bindings = DEFAULT_BINDINGS, settings = {}) {
    this.target = target;
    this.surface = surface;
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
    this.activeContext = CONTEXTS.FOOT;
    this.setBindings(bindings);

    this._down = new Set();       // codes/mouse tokens physically held
    this._pressed = new Set();    // went down since the last endStep()
    this._released = new Set();
    this._padValue = new Map();   // button index -> 0..1, refreshed by poll()
    this._padPrev = new Map();
    this._latched = new Set();    // actions held open by gripMode 'toggle'

    /** Accumulated look delta, consumed by the camera once per step. */
    this.look = { x: 0, y: 0 };
    this.padStick = { lx: 0, ly: 0, rx: 0, ry: 0 };
    this.pointerLocked = false;
    this.padIndex = -1;
    /** 'kbm' | 'pad' — which glyph set the HUD should draw (§26.5). */
    this.activeDevice = 'kbm';

    this._bound = [];
    /** Fired when the window loses focus. main.js pauses on it (§21.4 solo pause). */
    this.onBlur = null;
    /** Fired with the new context name so the HUD can redraw prompts (§4.4). */
    this.onContextChanged = null;
  }

  // ---- bindings -------------------------------------------------------------------

  setBindings(bindings) {
    this.bindings = bindings;
    this._sourceIndex = new Map();  // context -> Map(token -> action[])
    const push = (map, token, action) => {
      if (!map.has(token)) map.set(token, []);
      map.get(token).push(action);
    };
    for (const [ctx, actions] of Object.entries(bindings)) {
      const idx = new Map();
      for (const [action, def] of Object.entries(actions)) {
        for (const code of def.keys  || []) push(idx, code, action);
        for (const b    of def.mouse || []) push(idx, 'Mouse' + b, action);
        for (const b    of def.pad   || []) push(idx, 'Pad' + b, action);
      }
      this._sourceIndex.set(ctx, idx);
    }
  }

  /** The binding record for an action in the active context, or null. */
  _def(action) {
    const ctx = this.bindings[this.activeContext];
    return (ctx && ctx[action]) || null;
  }

  /** Does ANY context bind this token? Decides whether to preventDefault. */
  _tokenIsBound(token) {
    for (const idx of this._sourceIndex.values()) if (idx.has(token)) return true;
    return false;
  }

  setContext(ctx) {
    if (ctx === this.activeContext) return this.activeContext;
    // Held state does not carry across a context switch: Space held while entering the
    // truck must not arrive as a handbrake the player never pressed (§4.4).
    this.clear();
    this.activeContext = ctx;
    if (this.onContextChanged) this.onContextChanged(ctx);
    return ctx;
  }

  // ---- attach / detach ------------------------------------------------------------

  attach() {
    const add = (t, type, fn, opts) => { t.addEventListener(type, fn, opts); this._bound.push([t, type, fn, opts]); };

    add(this.target, 'keydown', (e) => {
      if (this._tokenIsBound(e.code)) e.preventDefault();  // Space must not scroll, F3 must not open Find
      if (e.repeat) return;
      this._press(e.code);
      this.activeDevice = 'kbm';
    });
    add(this.target, 'keyup', (e) => this._release(e.code));

    const surf = this.surface || this.target;
    add(surf, 'mousedown', (e) => {
      if (this._tokenIsBound('Mouse' + e.button)) e.preventDefault();
      this._press('Mouse' + e.button);
      this.activeDevice = 'kbm';
    });
    // mouseup on window, not the surface: a button released off-canvas would stick.
    add(this.target, 'mouseup', (e) => this._release('Mouse' + e.button));
    add(surf, 'contextmenu', (e) => e.preventDefault());  // RMB is the right-hand grip

    add(this.target, 'mousemove', (e) => {
      if (!this.pointerLocked) return;
      const s = this.settings.mouseSensitivity;
      this.look.x += e.movementX * s;
      this.look.y += e.movementY * s * (this.settings.invertLookY ? -1 : 1);
    });
    add(document, 'pointerlockchange', () => {
      this.pointerLocked = !!this.surface && document.pointerLockElement === this.surface;
      // Losing the lock (Esc) must not leave grips held down.
      if (!this.pointerLocked) this.clear();
    });

    // A held key whose keyup lands outside the window would stick forever.
    add(this.target, 'blur', () => { this.clear(); if (this.onBlur) this.onBlur(); });

    add(this.target, 'gamepadconnected',    (e) => { this.padIndex = e.gamepad.index; });
    add(this.target, 'gamepaddisconnected', (e) => {
      if (this.padIndex === e.gamepad.index) { this.padIndex = -1; this._padValue.clear(); }
    });

    return this;
  }

  detach() {
    for (const [t, type, fn, opts] of this._bound) t.removeEventListener(type, fn, opts);
    this._bound.length = 0;
  }

  requestPointerLock() {
    if (this.surface && this.surface.requestPointerLock) this.surface.requestPointerLock();
  }

  // ---- polling --------------------------------------------------------------------

  /** Read the gamepad. Must run once per RENDER frame, before the step loop: the Gamepad
   *  API is poll-only, so a button tapped between polls is a button that never happened. */
  poll() {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    let pad = this.padIndex >= 0 ? pads[this.padIndex] : null;
    if (!pad) { for (const p of pads) if (p && p.connected) { pad = p; this.padIndex = p.index; break; } }
    if (!pad) { this.padStick.lx = this.padStick.ly = this.padStick.rx = this.padStick.ry = 0; return; }

    const dz = this.settings.stickDeadzone;
    const ax = pad.axes || [];
    this.padStick.lx = deadzone(ax[0] || 0, dz);
    this.padStick.ly = deadzone(ax[1] || 0, dz);
    this.padStick.rx = deadzone(ax[2] || 0, dz);
    this.padStick.ry = deadzone(ax[3] || 0, dz);

    const thr = this.settings.triggerThreshold;
    const isTrigger = (i) => i === PAD.LT || i === PAD.RT;
    this._padPrev = new Map(this._padValue);
    this._padValue.clear();
    let anyActivity = Math.abs(this.padStick.lx) + Math.abs(this.padStick.ly) +
                      Math.abs(this.padStick.rx) + Math.abs(this.padStick.ry) > 0;

    const buttons = pad.buttons || [];
    for (let i = 0; i < buttons.length; i++) {
      const b = buttons[i];
      const v = typeof b === 'number' ? b : (b.value !== undefined ? b.value : (b.pressed ? 1 : 0));
      this._padValue.set(i, v);
      const token = 'Pad' + i;
      const gate = isTrigger(i) ? thr : 0.5;
      const nowDown = v >= gate;
      const wasDown = (this._padPrev.get(i) || 0) >= gate;
      if (nowDown && !wasDown) { this._press(token); anyActivity = true; }
      else if (!nowDown && wasDown) this._release(token);
      else if (nowDown) { this._down.add(token); anyActivity = true; }
    }
    if (anyActivity) this.activeDevice = 'pad';

    // Right stick contributes to the same look accumulator the mouse writes to, so the
    // camera has exactly one input to read (§4.4 parity).
    const ls = this.settings.padLookSensitivity;
    this.look.x += this.padStick.rx * ls * 10;
    this.look.y += this.padStick.ry * ls * 10 * (this.settings.invertLookY ? -1 : 1);
  }

  _press(token) {
    this._down.add(token);
    this._pressed.add(token);
    // Toggle-grip (§21.4) is resolved here, at the source, so no gameplay system needs to
    // know which mode is active — isDown('gripLeft') means the same thing either way.
    if (this.settings.gripMode === 'toggle') {
      for (const action of this._actionsFor(token)) {
        const def = this._def(action);
        if (!def || !def.latchable) continue;
        if (this._latched.has(action)) this._latched.delete(action);
        else this._latched.add(action);
      }
    }
  }

  _release(token) { this._down.delete(token); this._released.add(token); }

  _actionsFor(token) {
    const idx = this._sourceIndex.get(this.activeContext);
    return (idx && idx.get(token)) || [];
  }

  _tokens(action) {
    const def = this._def(action);
    if (!def) return [];
    const out = [];
    for (const c of def.keys  || []) out.push(c);
    for (const b of def.mouse || []) out.push('Mouse' + b);
    for (const b of def.pad   || []) out.push('Pad' + b);
    return out;
  }

  // ---- queries --------------------------------------------------------------------

  isDown(action) {
    const def = this._def(action);
    if (this.settings.gripMode === 'toggle' && def && def.latchable) {
      return this._latched.has(action);   // in toggle mode the latch IS the state
    }
    for (const t of this._tokens(action)) if (this._down.has(t)) return true;
    return false;
  }

  wasPressed(action) {
    for (const t of this._tokens(action)) if (this._pressed.has(t)) return true;
    return false;
  }

  wasReleased(action) {
    for (const t of this._tokens(action)) if (this._released.has(t)) return true;
    return false;
  }

  /** 0..1 pressure. Analog on a trigger, binary elsewhere. Feeds grip force (§6.2, §6.5). */
  analog(action) {
    const def = this._def(action);
    if (!def) return 0;
    if (this.settings.gripMode === 'toggle' && def.latchable) {
      return this._latched.has(action) ? 1 : 0;
    }
    // A digital source (key or mouse button) is full pressure.
    for (const t of this._tokens(action)) {
      if (t.indexOf('Pad') !== 0 && this._down.has(t)) return 1;
    }
    let v = 0;
    for (const b of def.pad || []) v = Math.max(v, this._padValue.get(b) || 0);
    if (def.analog) return v >= this.settings.triggerThreshold ? v : 0;
    return v >= 0.5 ? 1 : 0;
  }

  /** Move intent, -1..1 per axis, magnitude clamped to 1.
   *  y is FORWARD (+1 = away from camera), matching the third-person convention. */
  moveAxis() {
    let x, y;
    if (Math.abs(this.padStick.lx) + Math.abs(this.padStick.ly) > 0) {
      x = this.padStick.lx; y = -this.padStick.ly;   // pad Y is +down
    } else if (this.activeContext === CONTEXTS.DRIVE) {
      x = (this.isDown('steerRight') ? 1 : 0) - (this.isDown('steerLeft') ? 1 : 0);
      y = this.analog('throttle') - this.analog('brake');
    } else {
      x = (this.isDown('moveRight') ? 1 : 0) - (this.isDown('moveLeft') ? 1 : 0);
      y = (this.isDown('moveForward') ? 1 : 0) - (this.isDown('moveBack') ? 1 : 0);
    }
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    return { x, y };
  }

  /** Consume the accumulated look delta. Consuming — two readers would each get half. */
  consumeLook() {
    const l = { x: this.look.x, y: this.look.y };
    this.look.x = 0; this.look.y = 0;
    return l;
  }

  /** Clear per-step edges. The fixed-step loop calls this once per SIMULATION step, so a
   *  wasPressed() is seen by exactly one step regardless of frame rate. */
  endStep() { this._pressed.clear(); this._released.clear(); }

  /** Drop all held state (focus loss, context switch, contract reset). */
  clear() {
    this._down.clear(); this._pressed.clear(); this._released.clear();
    this._latched.clear();
    this.look.x = 0; this.look.y = 0;
  }

  /** Test hooks: drive the game without a real keyboard (tools\m0-tests.js). */
  _debugPress(token)   { this._press(token); }
  _debugRelease(token) { this._release(token); }
}

function deadzone(v, dz) {
  const a = Math.abs(v);
  if (a < dz) return 0;
  return Math.sign(v) * ((a - dz) / (1 - dz));   // rescaled, so just past the deadzone is ~0
}
