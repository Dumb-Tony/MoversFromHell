/* Pause card — GDD §21.4 Cognition "Solo pause", §26.5 "Solo pause freezes relevant simulation
 * safely", §21.2 "A retry keeps settings", §4.4 controller parity.
 *
 * The simulation has paused correctly since Phase 0 — game.js's "total pause by construction"
 * — and for fifteen phases nothing on screen said so: 'PAUSED' was a row in the F3 overlay,
 * which ships off. A player who alt-tabbed came back to a frozen world, a released pointer and
 * a canvas click that did nothing (main.js guards the lock request on !paused), with no
 * on-screen way out except an Esc nobody had told them about. That is a playtest-ending
 * defect, and this card is the fix.
 *
 * Copied from AirportBaggageCrew\src\ui\hud.js `#screenPause` (Dev\INDEX.md → "Title +
 * pause/Esc menu") and this project's own titleScreen.js: one card, the same tokens, buttons
 * that call back into main.js rather than reaching into the game. The card OBSERVES the pause
 * — it subscribes to SIM_PAUSED / SIM_RESUMED / SIM_RESET and never owns the flag — so a suite
 * that calls game.setPaused() directly sees exactly what a player sees, and m0 A9/E3's
 * invariant holds through it: the clock is the only thing that stops the clock.
 *
 * It yields to two screens that are pause-shaped already: the title card (which does not
 * pause, and must not grow a second card under it) and the settlement sheet (which pauses,
 * and is the whole screen). `suppressed()` is main.js's, because main.js is where both live.
 *
 * The Settings button is a SLOT for the settings panel (Phase 11 build-side M4). It is in the
 * markup so the layout is settled now, and hidden until something registers `onSettings` —
 * a button that does nothing is worse than no button (§2.1). M4 registers the panel's show()
 * at boot (main.js), so in the shipping build the slot is live from the first pause.
 */

import { EVENTS } from '../core/eventBus.js';
import { NOTICE_GLYPHS } from './hud.js';

/* THE 'WHAT HAPPENED' BLOCK (Phase 11 build-side M19 — §21.4 Cognition "objective history").
 * A notice lives 3.2 s on the HUD and is then gone; a player who looked away for the 'strap
 * gave way' has no way to find out what that thud was. The pause card is the one screen a
 * player opens to take stock, so it lists the last DEBUG.historyLen notices — sim-time stamp,
 * kind glyph (the HUD's own NOTICE_GLYPHS, so a kind reads the same in both places), the
 * text, and the seat it was addressed to when it was not everyone's. The ring is main.js's
 * (`history` below reads it); this card only draws it, on refresh(), and draws nothing when
 * it is empty. Never a checklist of the manifest (§21.1) — it is what was SAID, in order. */

export class PauseScreen {
  /**
   * @param {HTMLElement} root  #ui
   * @param {object} opts
   * @param {import('../core/eventBus.js').EventBus} [opts.bus]
   * @param {() => boolean} [opts.isPaused]    reads game.state.paused
   * @param {() => boolean} [opts.suppressed]  the title or the settlement sheet is up
   * @param {() => Array<{text: string, kind: string, seat: number|null, tMs: number}>} [opts.history]
   *        the shell's notice ring, oldest first (M19)
   */
  constructor(root, { bus = null, isPaused = () => false, suppressed = () => false, history = () => [] } = {}) {
    this.el = document.createElement('div');
    this.el.id = 'pause-screen';
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="card">
        <div class="word">PAUSED</div>
        <div class="tag">the clock is stopped — nothing moves and no labour is billed</div>
        <div class="why" hidden></div>
        <div class="history" hidden>
          <div class="hhead">What happened</div>
          <ol class="hlist"></ol>
        </div>
        <div class="buttons">
          <button class="primary" type="button" data-act="resume">Resume</button>
          <button type="button" data-act="restart">Restart the contract</button>
          <button type="button" data-act="settings" hidden>Settings</button>
        </div>
        <div class="foot">
          <b>Esc</b> or <b>Menu</b> resumes · click the game to look around again · <b>F3</b> stats
        </div>
      </div>`;
    root.appendChild(this.el);
    this.history = typeof history === 'function' ? history : () => [];
    this._history = this.el.querySelector('.history');
    this._historyList = this.el.querySelector('.hlist');
    this._historyHtml = '';

    // The card is one of the places the UI layer accepts input, so it opts back in — #ui is
    // pointer-events:none precisely so a panel can never swallow a grip (§21.1).
    this.el.style.pointerEvents = 'auto';

    this.isPaused = isPaused;
    this.suppressed = suppressed;
    /** Why the game paused, when it was not the player: 'window lost focus'. '' otherwise. */
    this.reason = '';

    this.onResume = null;
    this.onRestart = null;
    this.onSettings = null;

    this._why = this.el.querySelector('.why');
    this._settings = this.el.querySelector('[data-act="settings"]');

    this.el.addEventListener('click', (e) => {
      const act = e.target && e.target.dataset ? e.target.dataset.act : null;
      // The backdrop is "click to resume" — the one gesture that can also re-take the pointer.
      if (act === 'resume' || e.target === this.el) { if (this.onResume) this.onResume(); }
      else if (act === 'restart') { if (this.onRestart) this.onRestart(); }
      else if (act === 'settings') { if (this.onSettings) this.onSettings(); }
    });

    if (bus) {
      bus.on(EVENTS.SIM_PAUSED, () => this.refresh());
      bus.on(EVENTS.SIM_RESUMED, () => { this.reason = ''; this.refresh(); });
      /* A contract reset replaces the state and the clock; game.setPaused(false) after it is
       * a no-op (the fresh state is already unpaused) and emits nothing, so the reset itself
       * is the event to redraw on. */
      bus.on(EVENTS.SIM_RESET, () => { this.reason = ''; this.refresh(); });
    }
  }

  get visible() { return !this.el.hidden; }

  /** Name the cause of a pause the player did not ask for. Redraws, because the pause that
   *  goes with it may already have happened (a blur while already paused). */
  setReason(text) {
    this.reason = text || '';
    this.refresh();
  }

  /** Visibility is a FUNCTION of (paused, suppressed), recomputed rather than toggled, so the
   *  card can never be left up by a path that forgot to hide it. */
  refresh() {
    const show = !!(this.isPaused() && !this.suppressed());
    this.el.hidden = !show;
    this._why.hidden = !this.reason;
    this._why.textContent = this.reason ? `paused — ${this.reason}` : '';
    this._settings.hidden = !this.onSettings;
    if (show) this._renderHistory();
  }

  /** The 'What happened' rows from the shell's ring: oldest first, stamp · glyph · text · seat.
   *  Hidden outright when there is nothing to say. The DOM is touched only when the rows
   *  changed (the card redraws on every pause). */
  _renderHistory() {
    const list = this.history() || [];
    const rows = list.map((n) => {
      const kind = NOTICE_GLYPHS[n.kind] ? n.kind : 'info';
      const seat = n.seat === null || n.seat === undefined ? '' : `<span class="s">P${Number(n.seat) + 1}</span>`;
      return `<li class="h ${kind}" data-t="${Math.round(n.tMs || 0)}"><span class="t">${stamp(n.tMs)}</span>` +
        `<span class="g">${NOTICE_GLYPHS[kind]}</span><span class="x">${esc(n.text)}</span>${seat}</li>`;
    }).join('');
    this._history.hidden = rows.length === 0;
    if (rows !== this._historyHtml) { this._historyHtml = rows; this._historyList.innerHTML = rows; }
  }

  /** The rows on show right now — for a suite (m27 A4). */
  historyRows() { return Array.from(this._historyList.querySelectorAll('li')); }
}

/** m:ss of sim time, the clock the notice was raised on. */
function stamp(ms) {
  const s = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
