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
          <button type="button" data-act="manifest" hidden title="Close this card and open the manifest — the job keeps running (§2.2)">The manifest</button>
          <button type="button" data-act="settings" hidden>Settings</button>
        </div>
        <label class="keep" hidden><input type="checkbox" class="keep-loadout"> keep the tools on the truck — the same box as the invoice's, remembered between sessions</label>
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
    /* §21.2's manifest card (Phase 11 build-side M33). The SAME slot discipline as Settings
     * above: the button is in the markup so the layout is settled, and it stays hidden until
     * something registers a handler — a button that does nothing is worse than no button
     * (§2.1). main.js registers one at boot, and it RESUMES before it opens, because the
     * manifest hides under this card by construction (manifestScreen suppressed) and a button
     * that opened a card nobody could see would be exactly the defect §2.1 names. The job
     * keeps running while the manifest is up, which is §2.2 and not an accident. */
    this.onManifest = null;
    /* M31 (§21.2 "optionally preserves loadout"; KNOWN_ISSUES Phase 26, M24 gap 4). The
     * settlement sheet has had this box since M24 and this card's Restart always restored the
     * stock loadout without saying so — two restarts, two answers. Both boxes are now views of
     * ONE shell key (main.js `keepLoadout`, in the save): `keepLoadout()` reads it on every
     * refresh, `onKeepLoadout` writes it when the box is ticked here, and Restart hands the
     * value to the same resetContract option the sheet's Run-it-again uses. Left unwired (a
     * suite's bare card) the row stays HIDDEN — never a box that does nothing (§2.1). */
    this.keepLoadout = null;
    this.onKeepLoadout = null;

    this._why = this.el.querySelector('.why');
    this._settings = this.el.querySelector('[data-act="settings"]');
    this._manifest = this.el.querySelector('[data-act="manifest"]');
    this._keepRow = this.el.querySelector('label.keep');
    this._keepBox = this.el.querySelector('input.keep-loadout');
    /* The row's layout is set HERE, not in styles.css, because styles.css belongs to another
     * milestone in this batch and an unstyled label is a shipped defect, not a note: without
     * it the box and its text run together with no gap and the text ignores `--ts`, alone
     * among the card's rows. The values mirror the sheet's twin, `#settlement label.keep`
     * (styles.css:1293) — flex, centred, 7 px gap, `calc(11px * var(--ts))` — plus
     * `justify-content: center` for this card's centred layout. Two deliberate omissions:
     * no `opacity` (an inline one would beat M19's `.hc` "nothing dimmed" rule, which a
     * stylesheet rule would not), and no `display`, which refresh() writes beside `hidden`
     * because an inline display beats the UA's `[hidden] { display: none }` — the same trap
     * styles.css:694 names for the card itself. Fold it into styles.css when the file is
     * free (orchestratorNotes). */
    Object.assign(this._keepRow.style, {
      alignItems: 'center',
      justifyContent: 'center',
      gap: '7px',
      margin: '10px 0 2px',
      // Set piecewise, never as the `font` shorthand: a `calc()` size inside the shorthand is
      // rejected outright by the parser and the whole declaration is dropped.
      fontFamily: 'Quicksand, system-ui, sans-serif',
      fontSize: 'calc(11px * var(--ts))',
      lineHeight: '1.4',
      color: 'var(--paper)',
      cursor: 'pointer',
    });
    this._keepBox.style.margin = '0';
    this._keepBox.style.accentColor = 'var(--lime)';
    this._keepBox.style.flex = '0 0 auto';

    this.el.addEventListener('click', (e) => {
      const act = e.target && e.target.dataset ? e.target.dataset.act : null;
      // A click on the box (or its label) is an answer to the box, never a resume: the label
      // is inside the card, and the backdrop rule below matches only the backdrop itself.
      if (this._keepRow && e.target instanceof Node && this._keepRow.contains(e.target)) return;
      // The backdrop is "click to resume" — the one gesture that can also re-take the pointer.
      if (act === 'resume' || e.target === this.el) { if (this.onResume) this.onResume(); }
      else if (act === 'restart') { if (this.onRestart) this.onRestart({ keepLoadout: this.keepLoadoutTicked() }); }
      else if (act === 'manifest') { if (this.onManifest) this.onManifest(); }
      else if (act === 'settings') { if (this.onSettings) this.onSettings(); }
    });
    // The box writes the shell key the moment it is ticked, so the sheet's box (built fresh at
    // every settlement) reads the same answer, and a restart from either place agrees.
    this.el.addEventListener('change', (e) => {
      if (e.target !== this._keepBox) return;
      if (this.onKeepLoadout) this.onKeepLoadout(!!this._keepBox.checked);
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
    this._manifest.hidden = !this.onManifest;   // M33: the slot rule — no button without a handler
    /* M31: the tick is the shell's, so it is READ here rather than remembered — a settlement
     * sheet ticked a minute ago shows through, and so does a Defaults that cleared it. */
    const wired = typeof this.keepLoadout === 'function';
    this._keepRow.hidden = !wired;
    // `hidden` is the truth; the inline display is written with it because the row's own
    // inline `flex` (set in the constructor) would otherwise beat the UA's [hidden] rule.
    this._keepRow.style.display = wired ? 'flex' : 'none';
    if (wired) this._keepBox.checked = !!this.keepLoadout();
    if (show) this._renderHistory();
  }

  /** The box as it stands right now — false when the row is unwired or unticked (m38 F4). */
  keepLoadoutTicked() {
    return !!(typeof this.keepLoadout === 'function' && this._keepBox && this._keepBox.checked);
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
