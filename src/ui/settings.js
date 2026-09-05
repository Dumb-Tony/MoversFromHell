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
 * routed to every HUD's caption line (m18 A11).
 *
 * The four controls §21.4 lists that were already true by construction, so nobody rediscovers
 * it: colour-independent cues (every HUD state carries words or a shape, styles.css), visible
 * prompts for essential actions (the reticle prompt), keyboard-only play (seat 1's UHJK look
 * keys) and controller parity (m0 B16/B17). Remapping is a data edit (input.js) with no UI
 * yet — §21.4 scopes it to the full product.
 */

import { SETTINGS } from '../config.js';
import { GRIP_MODES } from '../core/input.js';

/** Row definitions: one per setting, in card order. `fmt` is how the value reads beside the
 *  slider; `note` is the one line under it worth having. */
const ROWS = Object.freeze({
  grip: [
    { key: 'gripMode', label: 'Grab', kind: 'select', options: GRIP_MODES,
      names: { hold: 'hold the button', toggle: 'press to grab, press to let go' },
      note: 'Toggle is §21.4’s accessibility option: a grip stays until you press again.' },
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
    { key: 'tier', label: 'Quality', kind: 'select', options: SETTINGS.tiers,
      names: { auto: 'auto-detect', gpu: 'full (GPU)', software: 'reduced (no GPU)' },
      note: 'Applies on reload — the tier decides how many shadow maps get built.' },
    /* §26.5 "camera shake … exist[s]" / §21.4 Motion (M16): the shell key cameraShake, routed
     * to every rig's shakeEnabled. Never on the look axes — it is a nudge on the eye. */
    { key: 'cameraShake', label: 'Camera shake — a nudge on hard brakes, bumps and nearby impacts', kind: 'check',
      note: 'Never on your look. Starts off when your system asks for reduced motion.' },
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
        <input type="checkbox" data-setting="${d.key}">
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
        <p class="set-note">Saved on this machine. A retry keeps every setting (§21.2).</p>
        <div class="set-actions">
          <button type="button" data-act="defaults">Defaults</button>
          <button type="button" class="primary" data-act="close">Done</button>
        </div>
      </div>`;

    this._defs = new Map();
    for (const d of [...ROWS.grip, ...ROWS.display, ...ROWS.audio]) this._defs.set(d.key, d);
    this._controls = Array.from(this.el.querySelectorAll('[data-setting]'));

    for (const c of this._controls) {
      const key = c.dataset.setting;
      const ev = c.type === 'range' ? 'input' : 'change';
      c.addEventListener(ev, () => {
        const v = c.type === 'checkbox' ? c.checked : (c.type === 'range' ? Number(c.value) : c.value);
        this.store.apply({ [key]: v });
        this._syncOne(key);
      });
    }

    this.el.addEventListener('click', (e) => {
      const act = e.target && e.target.dataset ? e.target.dataset.act : null;
      if (act === 'close' || e.target === this.el) this.hide();
      else if (act === 'defaults') { this.store.reset(); this._sync(); }
    });

    /* Keys typed into the card must not reach the game: a range's arrow keys are seat 1's
     * movement, Space is jump, Escape is the pause toggle. Input listens on window (bubble),
     * so stopping here at the element is enough for anything focused inside. Escape is also
     * caught in the CAPTURE phase on window, so it closes the card even when nothing in it
     * has focus, and never becomes a pause. */
    this.el.addEventListener('keydown', (e) => { e.stopPropagation(); });
    this._key = (e) => {
      if (!this.open || e.code !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      this.hide();
    };
    window.addEventListener('keydown', this._key, true);
  }

  /** Every control's value from the store — the store is the truth, the card is a view. */
  _sync() { for (const c of this._controls) this._syncOne(c.dataset.setting); }

  _syncOne(key) {
    const c = this._controls.find((x) => x.dataset.setting === key);
    if (!c) return;
    const v = this.store.values()[key];
    const d = this._defs.get(key);
    if (c.type === 'checkbox') c.checked = !!v;
    else c.value = String(v);
    const out = c.parentElement.querySelector('.set-v');
    if (out) out.textContent = d && d.fmt && typeof v === 'number' ? d.fmt(v) : '';
  }

  /** The keys this card can change — for a suite to check nothing on it is inert. */
  keys() { return this._controls.map((c) => c.dataset.setting); }

  show() {
    this._sync();
    this.open = true;
    this.el.hidden = false;
    const done = this.el.querySelector('[data-act="close"]');
    if (done && done.focus) done.focus();
  }
  hide() { this.open = false; this.el.hidden = true; }
  toggle() { return this.open ? this.hide() : this.show(); }
  destroy() { window.removeEventListener('keydown', this._key, true); this.el.remove(); }
}
