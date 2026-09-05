/* Settings panel — GDD §21.4 (Input / Motor / Vision / Motion rows), §26.5 "Grip toggle,
 * sensitivity, … UI scale … exist", §26.6 "Save/settings reject incompatible versions safely",
 * §21.2 "A retry keeps settings".
 *
 * Copied from AirportBaggageCrew\src\ui\settings.js (Dev\INDEX.md → "Settings panel …
 * reachable from both the title card and the pause screen"): the class, the _build/show/hide
 * pair and the row markup are that file's. What differs is WHO owns the values. There the
 * game did (`game.settings`, `game.applySettings`); here nothing about a setting may enter
 * game.state (§22.4; m0 E8 / m12 J3 assert it stays plain contract data), so the panel talks
 * to a STORE main.js builds: `values()` for the current numbers, `apply(patch)` to change
 * them, `reset()` for the defaults. The store routes each key to the thing that consumes it
 * — the live Input, the `--ts` CSS variable, every mover's camera rig, the save file — and
 * persists.
 *
 * ONLY SETTINGS THAT MEASURABLY CONSUME are on this card (INDEX.md: "assert consumption, not
 * presence" — m16 U2 walks every `[data-setting]` and checks its consumer moved). A switch
 * wired to nothing is a lie (§2.1), which is why 'Camera shake' arrived with M16 and not M4:
 * M4 had nothing that shook. Now src/render/camera.js has a damped-spring nudge fed by road
 * events, nearby impacts and the mover's own knockdown, and the switch is every rig's
 * `shakeEnabled` (m24 K5). Its DEFAULT is the OS's prefers-reduced-motion reading at boot
 * (§21.4 Motion; save.js reducedMotionPreferred) — recorded, not fought: a player who wants
 * shake back turns it on and the choice is saved. There is still no reduced-motion control of
 * its own, because shake is the only motion this build adds. The Sound group (Phase 11
 * build-side M9) exists because src/audio/audio.js now does: three §21.4 "volume categories"
 * routed to audio.setMaster / setBus, and captions (§21.4 Hearing, §26.5 "subtitles … exist")
 * routed to every HUD's caption line (m18 A11). The 'Reading the screen' group (Phase 11
 * build-side M19) closes §21.4's last Cognition and Vision rows: reduced HUD (every HUD's
 * setReduced), high contrast (the `.hc` class — m27 A2), hints (the stall hint's gate and the
 * prompt's room suffix — m27 A5), and (M31) the settlement reveal — the third thing in the
 * build that animates, and until M31 the only one without a row (§21.4 Motion).
 *
 * The four controls §21.4 lists that were already true by construction, so nobody rediscovers
 * it: colour-independent cues (every HUD state carries words or a shape, styles.css), visible
 * prompts for essential actions (the reticle prompt), keyboard-only play (seat 1's UHJK look
 * keys) and controller parity (m0 B16/B17).
 *
 * CONTROLS (Phase 11 build-side M18 — §21.4 Input "full remapping", the last item on that
 * row). One row per on-foot action per seat, the two device chips derived from the LIVE table
 * (input.js glyphOf — the same derivation the prompts and the help line use, so a remap
 * redraws all three), and a Rebind button that CAPTURES the next press: the card asks the
 * store to route the next key, mouse button or pad button to it instead of the game
 * (Input.beginCapture), and swallows that one keydown in the CAPTURE phase on window so
 * neither the game nor the title/pause listeners see it. Escape cancels; the store's timeout
 * (INPUT.remap.captureTimeoutMs) cancels. A refusal is shown ON the row, naming the other
 * action or the reserved key — never silently. The pause and debug actions are listed as
 * fixed: the shell reads them, and the card itself closes on Escape.
 */

import { SETTINGS, INPUT, CONTRACT } from '../config.js';   // CONTRACT: M19's hints row names the stall time
import { GRIP_MODES, CONTEXTS, glyphOf, tokenLabel, parseToken } from '../core/input.js';

/** MouseEvent.button of the secondary (context-menu) button — a DOM constant, not tuning. */
const SECONDARY_BUTTON = 2;

/** What the Controls rows call each action (§4.2's verbs). Anything unlisted prints its id. */
const ACTION_LABELS = Object.freeze({
  moveForward: 'Move forward', moveBack: 'Move back', moveLeft: 'Move left', moveRight: 'Move right',
  lookLeft: 'Look left', lookRight: 'Look right', lookUp: 'Look up', lookDown: 'Look down',
  gripLeft: 'Left hand grab', gripRight: 'Right hand grab',
  jump: 'Jump / mantle', brace: 'Sprint / brace', crouch: 'Crouch / lower',
  interact: 'Use / pick up', context: 'Undo / rotate / toss', drop: 'Drop',
  recover: 'Recover', swapMover: 'Swap mover', pause: 'Pause', debug: 'Stats overlay',
});
/** The one context the card lists: driving is scripted (route.js) and its table is never entered. */
const LISTED_CONTEXT = CONTEXTS.FOOT;
const CAPTURE_TEXT = 'press a key…';

/** Row definitions: one per setting, in card order. `fmt` is how the value reads beside the
 *  slider; `note` is the one line under it worth having. */
const ROWS = Object.freeze({
  grip: [
    { key: 'gripMode', label: 'Grab', kind: 'select', options: GRIP_MODES,
      names: { hold: 'hold the button', toggle: 'press to grab, press to let go' },
      note: 'Toggle is §21.4’s accessibility option: a grip stays until you press again.' },
    /* §6.5 "Grip strength scaling … may reduce motor demand. They must preserve the physical
     * puzzle rather than turn furniture into inventory icons" (Phase 11 build-side M27). The
     * shell key gripAssist, routed to every mover's GripSystem.setAssist, which clamps it to
     * GRIP.assist.max — the bound that keeps the couch a two-person job and the fridge a dolly
     * job at every setting. The note says what it does NOT do, because an assist that quietly
     * trivialised the job would be worse than none (§2.1). */
    { key: 'gripAssist', label: 'Grip strength', kind: 'range', fmt: (v) => v.toFixed(2) + '×',
      note: 'For holding a trigger or a mouse button hard for long. It raises how hard your hands can pull — most where the pull is what binds: dragging, wet or awkward surfaces, and tired arms. It cannot make you faster, and it never lifts the couch alone or shifts the fridge without the dolly.' },
    { key: 'mouseSensitivity', label: 'Mouse look', kind: 'range', fmt: (v) => v.toFixed(1) + '×' },
    { key: 'padLookSensitivity', label: 'Stick look', kind: 'range', fmt: (v) => v.toFixed(1) + '×' },
    { key: 'keyLookRate', label: 'P2 key look (UHJK)', kind: 'range', fmt: (v) => String(Math.round(v)) },
    { key: 'invertLookX', label: 'Invert look left / right', kind: 'check' },
    { key: 'invertLookY', label: 'Invert look up / down', kind: 'check' },
    { key: 'stickDeadzone', label: 'Stick deadzone', kind: 'range', fmt: (v) => Math.round(v * 100) + '%' },
    { key: 'triggerThreshold', label: 'Trigger pull to grab', kind: 'range', fmt: (v) => Math.round(v * 100) + '%' },
  ],
  display: [
    { key: 'uiScale', label: 'Text size', kind: 'range', fmt: (v) => Math.round(v * 100) + '%' },
    { key: 'cameraDistance', label: 'Camera distance', kind: 'range', fmt: (v) => v.toFixed(1) + ' m',
      note: 'Solo only — a split screen uses its own shorter boom.' },
    /* §15.4 / §21.4 (Phase 11 build-side M29). This row said 'Applies on reload' for eleven
     * milestones, because the tier decides how many shadow maps are BUILT before the scene
     * exists. It rebuilds them in place now (lighting.setQualityTier): the lights, their shadow
     * maps, the renderer's shadow filter and the post chain follow the switch immediately. The
     * note still says what does NOT — the texture and material set is minted from the tier
     * before the scene is built (bump, spec and env maps), and re-minting it is a reload. A
     * half-true switch would be worse than the honest sentence (§2.1). */
    { key: 'tier', label: 'Quality', kind: 'select', options: SETTINGS.tiers,
      names: { auto: 'auto-detect', gpu: 'full (GPU)', software: 'reduced (no GPU)' },
      note: 'Lights, shadows and the post chain change straight away. Surface detail — bump, gloss and reflections — is built when the game loads, so those follow the next time you open it.' },
    /* §26.5 "camera shake … exist[s]" / §21.4 Motion (M16): the shell key cameraShake, routed
     * to every rig's shakeEnabled. Never on the look axes — it is a nudge on the eye. */
    { key: 'cameraShake', label: 'Camera shake — a nudge on hard brakes, bumps and nearby impacts', kind: 'check',
      note: 'Never on your look. Starts off when your system asks for reduced motion.' },
    /* §8.4 "optional haptic pulse" / §4.4 controller parity / §21.4 Motion (M28): the shell
     * key rumble, routed to src/audio/haptics.js — which reads it live, per seat, on the same
     * cue table the sound and the captions read. Beside the shake because it obeys the same
     * reduced-motion rule, not because it is a camera. */
    { key: 'rumble', label: 'Controller rumble — a pulse in the hand that dropped it', kind: 'check',
      note: 'Impacts, damage, straps, tools and the road, on the pad of the seat it happened to. Nothing is withheld from a keyboard: every one of them already has a sound and a caption. Starts off when your system asks for reduced motion.' },
  ],
  /* §21.4 Hearing: "volume categories" and "subtitles with direction" (M9). The shell keys
   * audioMaster / audioUi / audioWorld / captions; the store routes the sliders to
   * audio.setMaster / setBus and the switch to every HUD's caption line. */
  audio: [
    { key: 'audioMaster', label: 'Master volume', kind: 'range', fmt: (v) => Math.round(v * 100) + '%' },
    { key: 'audioUi', label: 'Interface sounds', kind: 'range', fmt: (v) => Math.round(v * 100) + '%' },
    { key: 'audioWorld', label: 'World sounds', kind: 'range', fmt: (v) => Math.round(v * 100) + '%',
      note: 'Impacts, straps, tools, the truck and your own strain. Sound starts on the first click or key.' },
    { key: 'captions', label: 'Captions for sounds (with a direction arrow)', kind: 'check' },
  ],
  /* §21.4 Cognition "reduced HUD", "optional hints" and Vision "high contrast" (Phase 11
   * build-side M19). Shell keys reducedHud / highContrast / hints; the store routes the first
   * to every HUD's setReduced, the second to the `.hc` class on <body>, the HUD roots and the
   * cards, the third to interact.js's room suffix and the stall hint's own gate. The hints row
   * SAYS what it silences, because a switch whose effect is invisible is a switch nobody
   * trusts (§2.1). */
  access: [
    { key: 'reducedHud', label: 'Reduced HUD — only the objective, the prompt, notices and the manifest count', kind: 'check',
      note: 'Hides the cargo panel, the route label and the contract panel’s truck and clock rows. The objective line and the prompt never go (§21.1); an OVERTIME row stays.' },
    { key: 'highContrast', label: 'High contrast — solid panels, white text, thicker borders, a hatched route bar', kind: 'check',
      note: 'Every notice already leads with a glyph and every state carries a word; this makes the panels opaque over a bright scene. ?hc=1 in the address forces it on.' },
    { key: 'hints', label: `Hints — the ${Math.round(CONTRACT.stallHintMs / 1000)} s “how to grab” nudge and the → room on each item`, kind: 'check',
      note: 'Off silences the stall hint (it never fires, not merely hidden) and drops the room suffix from the prompt. The objective line stays.' },
    /* §21.2 "Invoice animates major lines, then exposes a complete static breakdown" / §21.4
     * Motion (Phase 11 build-side M31). The shell key invoiceReveal, routed to the settlement
     * sheet's revealEnabled through the page rule (invoiceScreen.js revealEnabledWith). It is
     * here rather than in Display because what it changes is READING the sheet: off, every
     * major line and the whole breakdown are on screen the instant the job settles. Nothing is
     * hidden either way — the reveal is presentation over lines invoice.js already wrote — so
     * the note says exactly that, and says the OS rule, as the shake and rumble rows do. */
    { key: 'invoiceReveal', label: 'Invoice reveal — the major lines land one at a time and count up', kind: 'check',
      note: 'Off shows the finished invoice at once. No number changes either way, and nothing is hidden. Starts off when your system asks for reduced motion; ?reveal=off in the address forces it off.' },
    /* §26.7 / §21.3 first-minute cards (Phase 11 build-side M22; walkthrough.js). The shell key
     * is walkthroughSeen — set by the cards themselves when the third retires or the ✕ skips
     * them — and this row is its NEGATION (`invert`: the box shows !value and writes !checked):
     * ticked means show the cards at the next START THE JOB or restart. The control carries
     * data-invert="1", so the m16 U2 walk reads the box and its consumer in the box's sense. */
    { key: 'walkthroughSeen', invert: true, label: 'Show the first-minute cards again — the three “grab · carry · load” cards at the start of a job', kind: 'check',
      note: 'They untick this themselves once you finish or skip them. Ticked, they show at the next START THE JOB or restart. Hints off hides them too; co-op never shows them.' },
  ],
});

export class SettingsPanel {
  /**
   * @param {HTMLElement} root  #ui
   * @param {{values: () => object, apply: (patch: object) => void, reset: () => void}} store
   */
  constructor(root, store) {
    this.store = store;
    this.el = document.createElement('div');
    this.el.id = 'settings-screen';
    this.el.hidden = true;
    root.appendChild(this.el);
    this.open = false;
    // The panel accepts input, so it opts back in — #ui is pointer-events:none (§21.1).
    this.el.style.pointerEvents = 'auto';
    this._build();
  }

  _build() {
    const r = SETTINGS.ranges;
    const row = (d) => {
      if (d.kind === 'check') {
        return `
      <label class="set-row set-check">
        <input type="checkbox" data-setting="${d.key}"${d.invert ? ' data-invert="1"' : ''}>
        <span>${d.label}</span>
      </label>${d.note ? `<p class="set-note">${d.note}</p>` : ''}`;
      }
      if (d.kind === 'select') {
        const opts = d.options.map((o) => `<option value="${o}">${d.names[o] || o}</option>`).join('');
        return `
      <label class="set-row">
        <span class="set-l">${d.label}</span>
        <select data-setting="${d.key}">${opts}</select>
      </label>${d.note ? `<p class="set-note">${d.note}</p>` : ''}`;
      }
      const g = r[d.key];
      return `
      <label class="set-row">
        <span class="set-l">${d.label}</span>
        <input type="range" data-setting="${d.key}" min="${g.min}" max="${g.max}" step="${g.step}">
        <span class="set-v"></span>
      </label>${d.note ? `<p class="set-note">${d.note}</p>` : ''}`;
    };

    this.el.innerHTML = `
      <div class="card set-card">
        <h2>Settings</h2>
        <div class="set-group"><div class="set-head">Grip and look</div>${ROWS.grip.map(row).join('')}</div>
        <div class="set-group"><div class="set-head">Display</div>${ROWS.display.map(row).join('')}</div>
        <div class="set-group"><div class="set-head">Sound</div>${ROWS.audio.map(row).join('')}</div>
        <div class="set-group"><div class="set-head">Reading the screen</div>${ROWS.access.map(row).join('')}</div>
        <div class="set-group set-controls"><div class="set-head">Controls</div>
          <p class="set-note">Rebind, then press the key, mouse button or pad button you want. Esc cancels. A key another action already has is refused and named.</p>
          <div class="set-binds"></div>
        </div>
        <p class="set-note">Saved on this machine. A retry keeps every setting (§21.2).</p>
        <div class="set-actions">
          <button type="button" data-act="defaults">Defaults</button>
          <button type="button" class="primary" data-act="close">Done</button>
        </div>
      </div>`;

    this._defs = new Map();
    for (const d of [...ROWS.grip, ...ROWS.display, ...ROWS.audio, ...ROWS.access]) this._defs.set(d.key, d);
    this._controls = Array.from(this.el.querySelectorAll('[data-setting]'));

    for (const c of this._controls) {
      const key = c.dataset.setting;
      const ev = c.type === 'range' ? 'input' : 'change';
      c.addEventListener(ev, () => {
        const d = this._defs.get(key);
        // An inverted row (M22 `invert`) writes the negation of the box; the store never knows.
        const v = c.type === 'checkbox' ? (d && d.invert ? !c.checked : c.checked) : (c.type === 'range' ? Number(c.value) : c.value);
        this.store.apply({ [key]: v });
        this._syncOne(key);
      });
    }

    this._cap = null;               // the open capture: {seat, ctx, action, row}
    this._swallowKeyup = null;      // the code whose keyup is still owed to a capture
    this._menuOwed = false;         // a right-button capture's contextmenu is still to come
    this._buildBinds();

    this.el.addEventListener('click', (e) => {
      const act = e.target && e.target.dataset ? e.target.dataset.act : null;
      if (act === 'close' || e.target === this.el) this.hide();
      else if (act === 'defaults') { this._cancelCapture(); this.store.reset(); this._resetBinds(); this._sync(); }
      else if (act === 'rebind') { const row = e.target.closest('[data-bind]'); if (row) this._beginCapture(row); }
      else if (act === 'reset-binds') { this._resetBinds(Number(e.target.dataset.seat)); }
    });

    /* Keys typed into the card must not reach the game: a range's arrow keys are seat 1's
     * movement, Space is jump, Escape is the pause toggle. Input listens on window (bubble),
     * so stopping here at the element is enough for anything focused inside. Escape is also
     * caught in the CAPTURE phase on window, so it closes the card even when nothing in it
     * has focus, and never becomes a pause.
     *
     * A REBIND CAPTURE (M18) owns the whole keydown the same way: capture phase on window
     * runs before every bubble listener on window — Input's, the title's, the shell's — and
     * stopImmediatePropagation there is what keeps the chosen key from jumping, starting the
     * job or pausing (m26 B9). Escape during a capture cancels the capture, not the card. */
    this.el.addEventListener('keydown', (e) => { e.stopPropagation(); });
    this._key = (e) => {
      if (this._cap) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.repeat) return;
        if (e.code === 'Escape') { this._cancelCapture(); return; }
        this._swallowKeyup = e.code;
        this._captured(e.code);
        return;
      }
      if (!this.open || e.code !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      this.hide();
    };
    window.addEventListener('keydown', this._key, true);
    // The captured key's keyup must not reach Input either: a release edge for a key that
    // was never held is a wasReleased() nobody pressed.
    this._keyup = (e) => {
      if (this._swallowKeyup && e.code === this._swallowKeyup) {
        this._swallowKeyup = null;
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener('keyup', this._keyup, true);
    // Mouse buttons are captured on window in the capture phase for the same reason; the
    // context menu is suppressed for a right-button capture (Input only does so on the canvas).
    this._mouse = (e) => {
      if (!this._cap) return;
      // A click on the card itself (Done, Defaults, another Rebind, a slider) is an answer to
      // the card, not a binding: cancel the capture and let the click do what its label says.
      if (e.target instanceof Node && this.el.contains(e.target)) { this._cancelCapture(); return; }
      e.preventDefault();
      e.stopImmediatePropagation();
      this._swallowMouseup = e.button;
      this._captured('Mouse' + e.button);
    };
    // The captured button's mouseup must not reach Input either — the keyup rule, for the mouse:
    // a release edge for a button the game never saw held is a wasReleased() nobody pressed.
    this._mouseup = (e) => {
      if (this._swallowMouseup === null || this._swallowMouseup === undefined) return;
      if (e.button !== this._swallowMouseup) return;
      this._swallowMouseup = null;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    this._menu = (e) => { if (this._cap || this._menuOwed) { this._menuOwed = false; e.preventDefault(); } };
    window.addEventListener('mousedown', this._mouse, true);
    window.addEventListener('mouseup', this._mouseup, true);
    window.addEventListener('contextmenu', this._menu, true);
  }

  // ---- Controls (§21.4 full remapping — M18) ---------------------------------------

  /** Render the Controls rows from the store's live table: every on-foot action per seat. */
  _buildBinds() {
    const host = this.el.querySelector('.set-binds');
    if (!host) return;
    const table = this.store.bindings ? this.store.bindings() : [];
    const locked = INPUT.remap.lockedActions;
    const parts = [];
    table.forEach((seatMap, seat) => {
      const actions = seatMap[LISTED_CONTEXT];
      if (!actions) return;
      parts.push(`<div class="set-seat">P${seat + 1} — ${seat === 0 ? 'keyboard &amp; mouse / pad' : 'arrow keys / pad'}</div>`);
      for (const action of Object.keys(actions)) {
        const fixed = locked.includes(action);
        parts.push(`
      <div class="set-row set-bind${fixed ? ' fixed' : ''}" data-bind="${seat}:${LISTED_CONTEXT}:${action}">
        <span class="set-l">${ACTION_LABELS[action] || action}</span>
        <span class="set-glyphs"></span>
        ${fixed ? '<span class="set-fixed">fixed</span>' : '<button type="button" data-act="rebind">Rebind</button>'}
      </div>
      <p class="set-conflict" hidden></p>`);
      }
      parts.push(`<div class="set-bind-actions"><button type="button" data-act="reset-binds" data-seat="${seat}">Reset P${seat + 1} controls</button></div>`);
    });
    host.innerHTML = parts.join('');
    this._bindRows = Array.from(host.querySelectorAll('[data-bind]'));
    this._syncBinds();
  }

  /** Every row's two chips from the live table — the store is the truth, the card is a view. */
  _syncBinds() {
    if (!this._bindRows || !this.store.bindings) return;
    const table = this.store.bindings();
    for (const row of this._bindRows) {
      const [seat, ctx, action] = row.dataset.bind.split(':');
      const def = (table[Number(seat)] && table[Number(seat)][ctx] && table[Number(seat)][ctx][action]) || null;
      const kbm = glyphOf(def, 'kbm');
      const pad = glyphOf(def, 'pad');
      const chip = (label, cls) => label
        ? `<span class="key ${cls}" title="${cls === 'pad' ? 'controller' : 'keyboard / mouse'}">${esc(label)}</span>`
        : `<span class="key ${cls} none" title="${cls === 'pad' ? 'no controller binding' : 'no keyboard binding'}">—</span>`;
      // A space between the chips: textContent must read "E X", not "EX" (flex ignores it).
      const html = this._cap && this._cap.row === row ? esc(CAPTURE_TEXT) : chip(kbm, 'kbm') + ' ' + chip(pad, 'pad');
      const g = row.querySelector('.set-glyphs');
      if (g.innerHTML !== html) g.innerHTML = html;
    }
  }

  /** The rows this card can rebind — for a suite to walk them (m16 M18 section). */
  bindRows() { return (this._bindRows || []).filter((r) => !r.classList.contains('fixed')).map((r) => r.dataset.bind); }

  _beginCapture(row) {
    if (row.classList.contains('fixed')) return;
    if (this._cap) this._cancelCapture();
    const [seat, ctx, action] = row.dataset.bind.split(':');
    this._cap = { seat: Number(seat), ctx, action, row };
    row.classList.add('capturing');
    this._showConflict(row, '');
    this._syncBinds();
    if (this.store.beginCapture) {
      // The store's capture is the PAD path (and the timeout): a pad press only exists inside
      // Input.poll, and it arrives here as that seat's token. null = the timeout ran out.
      this.store.beginCapture((token) => { if (token == null) this._cancelCapture(); else this._captured(token); });
    }
  }

  /** The press arrived — from the key handler, the mouse handler or the store's pad path. */
  _captured(token) {
    const cap = this._cap;
    if (!cap) return;
    // A pad token names the seat that pad is CURRENTLY assigned to; the row decides who
    // gets the button (M3's lesson: pads are per physical slot, seats move).
    const parsed = parseToken(token);
    const normalised = parsed && parsed.kind === 'pad' ? `P${cap.seat}B${parsed.button}` : token;
    if (parsed && parsed.kind === 'mouse' && parsed.button === SECONDARY_BUTTON) this._menuOwed = true;
    this._endCapture();
    const r = this.store.rebind ? this.store.rebind(cap.seat, cap.ctx, cap.action, normalised) : { ok: false, reason: 'no store' };
    if (!r.ok) this._showConflict(cap.row, this._refusalText(normalised, r));
    this._syncBinds();
    return r;
  }

  _refusalText(token, r) {
    const label = tokenLabel(token);
    if (r.reason === 'conflict') {
      const others = [];
      for (const c of r.conflicts || []) {
        for (const m of c.matchAll(/seat (\d+) (\w+)/g)) others.push(`P${Number(m[1]) + 1} ${ACTION_LABELS[m[2]] || m[2]}`);
        if (/only one mouse/.test(c)) others.push('the mouse is P1’s');
      }
      const named = others.filter((o, i) => others.indexOf(o) === i).join(', ');
      return `${label} is already ${named || 'taken'} — pick another key`;
    }
    if (r.reason === 'reserved') {
      const keys = INPUT.remap.reservedKeys.map(tokenLabel).join(', ');
      return `${label} is reserved — ${keys} and the pad's View button are the game's own`;
    }
    if (r.reason === 'locked') return 'this action is fixed';
    return `${label} cannot be bound (${r.reason})`;
  }

  _showConflict(row, text) {
    const p = row.nextElementSibling;
    if (!p || !p.classList.contains('set-conflict')) return;
    p.textContent = text;
    p.hidden = !text;
  }

  _cancelCapture() {
    if (!this._cap) return;
    const row = this._cap.row;
    this._endCapture();
    this._showConflict(row, '');
    this._syncBinds();
  }

  _endCapture() {
    if (!this._cap) return;
    this._cap.row.classList.remove('capturing');
    this._cap = null;
    if (this.store.endCapture) this.store.endCapture();
  }

  /** Is a Rebind waiting for a press right now? */
  get capturing() { return !!this._cap; }

  _resetBinds(seat) {
    this._cancelCapture();
    const r = this.store.resetBindings ? this.store.resetBindings(seat) : null;
    for (const row of this._bindRows || []) this._showConflict(row, '');
    // A reset that turns another player's binding into a conflict drops that binding back to
    // its default (input.js resetBindings) — say so on that row, never silently (§21.4).
    for (const d of (r && r.dropped) || []) {
      const row = (this._bindRows || []).find((x) => x.dataset.bind === `${d.seat}:${d.ctx}:${d.action}`);
      if (row) this._showConflict(row, `back to its default — it clashed with P${seat + 1}'s reset keys`);
    }
    this._syncBinds();
  }

  /** Every control's value from the store — the store is the truth, the card is a view. */
  _sync() { for (const c of this._controls) this._syncOne(c.dataset.setting); }

  _syncOne(key) {
    const c = this._controls.find((x) => x.dataset.setting === key);
    if (!c) return;
    const v = this.store.values()[key];
    const d = this._defs.get(key);
    if (c.type === 'checkbox') c.checked = d && d.invert ? !v : !!v;   // invert: M22
    else c.value = String(v);
    const out = c.parentElement.querySelector('.set-v');
    if (out) out.textContent = d && d.fmt && typeof v === 'number' ? d.fmt(v) : '';
  }

  /** The keys this card can change — for a suite to check nothing on it is inert. */
  keys() { return this._controls.map((c) => c.dataset.setting); }

  show() {
    this._sync();
    this._syncBinds();
    this.open = true;
    this.el.hidden = false;
    const done = this.el.querySelector('[data-act="close"]');
    if (done && done.focus) done.focus();
  }
  hide() { this._cancelCapture(); this.open = false; this.el.hidden = true; }
  toggle() { return this.open ? this.hide() : this.show(); }
  destroy() {
    this._cancelCapture();
    window.removeEventListener('keydown', this._key, true);
    window.removeEventListener('keyup', this._keyup, true);
    window.removeEventListener('mousedown', this._mouse, true);
    window.removeEventListener('mouseup', this._mouseup, true);
    window.removeEventListener('contextmenu', this._menu, true);
    this.el.remove();
  }
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
