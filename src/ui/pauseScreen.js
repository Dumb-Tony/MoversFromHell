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
 * a button that does nothing is worse than no button (§2.1).
 */

import { EVENTS } from '../core/eventBus.js';

export class PauseScreen {
  /**
   * @param {HTMLElement} root  #ui
   * @param {object} opts
   * @param {import('../core/eventBus.js').EventBus} [opts.bus]
   * @param {() => boolean} [opts.isPaused]    reads game.state.paused
   * @param {() => boolean} [opts.suppressed]  the title or the settlement sheet is up
   */
  constructor(root, { bus = null, isPaused = () => false, suppressed = () => false } = {}) {
    this.el = document.createElement('div');
    this.el.id = 'pause-screen';
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="card">
        <div class="word">PAUSED</div>
        <div class="tag">the clock is stopped — nothing moves and no labour is billed</div>
        <div class="why" hidden></div>
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
  }
}
