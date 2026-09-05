/* The first minute — GDD §26.7 Comprehension "Most players move a box and identify the next
 * objective without coaching", §25.2 Phase 11 "onboarding", §21.3 first steps, §4.4 controller
 * parity, §21.1 "compact objective count … not a checklist", §26.5 "essential actions have
 * visible prompts". Phase 11 build-side M22.
 *
 * M5 gave the HUD an objective line, room hints and one stall hint; M3 gave the title card a
 * controls list. Nothing in the first minute TAUGHT the one thing §26.7 measures: pick up a
 * box, carry it to the truck, put it down inside. This is three cards, bottom-left above the
 * help line, each dismissed by DOING the thing and never by a button:
 *
 *   1  'Look at a box and hold LMB'   retires on the first GRIP_STARTED by seat 0's mover
 *   2  'Carry it out to the truck'    retires on the first CARGO_STATE loaded
 *   3  'Now the rest — the panel says what is next'
 *                                     retires after WALKTHROUGH.step3Ms of SIM time, or on the
 *                                     first delivered item, whichever comes first
 *
 * EVERY STEP COMPLETES ON THE REAL EVENT WHETHER OR NOT THE CARD IS VISIBLE (a player who
 * loads a box while the card is hidden under the pause card has still loaded it). The steps
 * are STATE, not a route — the AirportBaggageCrew onboarding rule (Dev\INDEX.md → "A tutorial
 * step must assert the STATE it wanted, never the ROUTE the player took"): a load at step 1
 * collapses the chain forward to step 3. Its "first-minute rail with NO training pauses" is
 * the other half copied here — the world never waits for the card; the card is advisory text
 * over a live sim, exactly as the stall hint (M5) is.
 *
 * ONE VOICE AT A TIME. While a card is up at step 1 or 2 the stall hint (main.js 'stallHint')
 * does not count — suppressed at the source, never merely hidden (m29 W6). The card yields to
 * every screen that is pause-shaped (the title, the pause card, the settlement sheet, the
 * settings card), to the hints switch (M19: hints off means no walkthrough either), and to
 * co-op (both seats know the game, and §21.1's split view has no room): a join RETIRES it for
 * the run rather than hiding it, so it does not pop back when the second player leaves.
 *
 * SHOWN ONCE PER BROWSER. The shell key `walkthroughSeen` (save.js) is set when the third card
 * retires or when the ✕ skips them; the settings card's row unticks it. Shell state, never
 * game.state (§22.4; m0 E8): the card lives in #ui beside the HUDs, and its progress and
 * stamps are its own. The run summary (runLog.js buildRunSummary) gets `report()` — shown,
 * and the sim time each card retired — so the evidence page (M21) can compare time-to-first-
 * grip with and without it.
 *
 * NOT IN THE HARNESS unless a suite asks. smoketest.ps1 serves `_smoketest-<port>.html`, and
 * every DOM-shape assertion in m11/m15 was written against a screen without this card, so on
 * that page the card is not built at all — `?walkthrough=1` (the m29 suite's own boot) or
 * DEBUG.walkthroughInHarness turns it on. walkthroughEnabledFrom is pure so a suite can pin
 * the rule without a reboot (the audio.js audioEnabledFrom / save.js highContrastForced shape).
 *
 * GLYPHS ARE DERIVED (M5): the card's key chips come from input.glyphsFor for seat 0's SHOWN
 * device — LMB / RMB on the keyboard, LT / RT on a pad — and a 'pad' chip says which in words
 * (§26.5, §4.4) when the last device was a controller.
 *
 * POSITION BY MEASUREMENT, NOT BY A LAYOUT PER FRAME. The card's bottom is the help line's
 * live top plus WALKTHROUGH.clearancePx (main.js `clearance`), so text size and high contrast
 * cannot push the two together — but getBoundingClientRect forces a synchronous layout, and
 * refresh() runs twice a frame while the card shows. So the measurement is CACHED and taken
 * again only when something could have moved the help line: a window resize (listened for
 * here), the help line's own rewrite and a --ts or .hc change (main.js calls relayout()), and
 * the fonts settling (m29 W1z4-W1z9: 120 frames measure 0 times; a resize measures once).
 *
 * AND THE BAND IT SHARES (M32; §21.4 Vision, §21.1). The card is bottom-LEFT while the caption
 * and the route bar are CENTRED, so as the window narrows the bar's left edge walks toward the
 * card: at 1262 px the card ends at 322 and the bar begins at 471, and below WALKTHROUGH.narrowPx
 * they meet. M22 recorded that and could not measure it, because the harness cannot resize its
 * window. So the rule is keyed on #ui's OWN width (`bandWidth`) rather than on a @media query —
 * a suite can narrow #ui and every box in the band narrows honestly with it (m39 E4). Under
 * narrowPx the card takes the badge form (styles.css #walkthrough.narrow: one row, the body line
 * dropped) and publishes --band-lift, its measured height plus WALKTHROUGH.bandGapPx, which the
 * route bar and the caption add to their own offsets. Above it --band-lift is 0 and nothing in
 * the shipping layout moves (m36 S2).
 */

import { EVENTS } from '../core/eventBus.js';
import { WALKTHROUGH, DEBUG } from '../config.js';
import { glyphsFor } from '../core/input.js';

/** The three cards, as DATA. `title` may carry {gripL}/{gripR}/{primary}/{secondary} tokens the
 *  card resolves from the seat's glyph set (the hud.js hint tokens). The VERB is the words;
 *  the key chip is the only thing that changes per device. */
export const STEPS = Object.freeze([
  { id: 'grab',
    title: 'Look at a box and hold {gripL}',
    text: 'Or {gripR} — both hands for a heavy one. Let go to put it down.' },
  { id: 'carry',
    title: 'Carry it out to the truck',
    text: 'Out the front door, up the ramp at the back, and set it down inside.' },
  { id: 'rest',
    title: 'Now the rest — the panel says what is next',
    text: 'Top-left: what to do next. Under the reticle: which key does it.' },
]);

const GLYPH_TOKEN = /\{(primary|secondary|gripL|gripR)\}/g;
/** The harness's scratch page (tools/smoketest.ps1 `_smoketest-<port>.html`). */
const HARNESS_PAGE = /_smoketest-\d+\.html$/i;

/**
 * Should the cards exist on this page? PURE: a function of the URL's search and pathname.
 *   ?walkthrough=1  → yes, wherever (the m29 suite's boot)
 *   ?walkthrough=0  → no, wherever (a screenshot without the card)
 *   otherwise       → yes, except on the harness's scratch page unless `allowInHarness`
 *                     (DEBUG.walkthroughInHarness)
 * Never throws.
 */
export function walkthroughEnabledFrom(search = '', pathname = '', allowInHarness = DEBUG.walkthroughInHarness) {
  try {
    const q = new URLSearchParams(search || '').get('walkthrough');
    if (q === '1') return true;
    if (q === '0') return false;
    return !HARNESS_PAGE.test(String(pathname || '')) || !!allowInHarness;
  } catch (e) { return false; }
}

export class Walkthrough {
  /**
   * @param {HTMLElement} root  #ui
   * @param {object} [opts]
   * @param {boolean}  [opts.enabled]      false: no DOM, no steps, report() is { shown: false }
   * @param {import('../core/eventBus.js').EventBus} [opts.bus]
   * @param {() => object}  [opts.glyphs]  seat 0's live glyph set (input.glyphsFor(0, shownDevice))
   * @param {() => string}  [opts.seat0Player]  whose GRIP_STARTED counts (moverOfSeat(0).id)
   * @param {() => boolean} [opts.suppressed]   the title / pause card / settlement / settings is
   *                                            up, or hints are off — hidden, not retired
   * @param {() => boolean} [opts.coop]         two seats — retired for the run, not hidden
   * @param {() => boolean} [opts.seen]         shell.walkthroughSeen
   * @param {() => boolean} [opts.delivered]    has any manifest row been delivered this run
   * @param {() => number}  [opts.clearance]    px the card's bottom must clear (the help line)
   * @param {() => void}    [opts.onSeen]       set the shell key and persist
   */
  constructor(root, {
    enabled = true, bus = null,
    glyphs = () => glyphsFor(0, 'kbm'),
    seat0Player = () => 'p0',
    suppressed = () => false,
    coop = () => false,
    seen = () => false,
    delivered = () => false,
    clearance = () => 0,
    bandWidth = null,
    onSeen = null,
  } = {}) {
    this.enabled = !!enabled;
    this.glyphs = glyphs;
    this.seat0Player = seat0Player;
    this.suppressed = suppressed;
    this.coop = coop;
    this._seen = seen;
    this.delivered = delivered;
    this.clearance = clearance;
    /* M32: how wide the BAND is — #ui's own content box, which is the viewport's width in a
     * real window (#ui is position:fixed inset:0) and is what a suite narrows to emulate one.
     * Read on the same occasions the help line is measured, never per frame. */
    this.bandWidth = bandWidth || (() => (root && root.clientWidth) || 0);
    this.onSeen = onSeen;

    /** Armed by the job starting (title.onStart) and by every contract reset — a run's own
     *  first minute. `active` is armed-and-not-retired; `step` is 1..3 while active, 0 before
     *  arming, and the step reached once retired. */
    this.active = false;
    this.step = 0;
    this.retiredBy = '';
    /** Sim time each step retired, this run (null until it does). report() exports these. */
    this.stamps = { 1: null, 2: null, 3: null };
    /** The card was actually on screen at some point this run — report().shown. */
    this.shownThisRun = false;

    this.el = document.createElement('div');
    this.el.id = 'walkthrough';
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="wt-head">
        <span class="wt-n"></span>
        <span class="wt-dev" hidden>pad</span>
        <button class="wt-skip" type="button" title="Skip the first-minute cards" aria-label="Skip the first-minute cards">✕</button>
      </div>
      <div class="wt-title"></div>
      <div class="wt-text"></div>`;
    this._n = this.el.querySelector('.wt-n');
    this._dev = this.el.querySelector('.wt-dev');
    this._skip = this.el.querySelector('.wt-skip');
    this._title = this.el.querySelector('.wt-title');
    this._text = this.el.querySelector('.wt-text');
    this._html = '';
    this._bottom = -1;
    this._layoutDirty = true;   // the help line must be measured before the first show
    this._owedUp = false;
    /** M32: the badge form (band ≤ WALKTHROUGH.narrowPx) and the --band-lift it is worth.
     *  `_bandKey` is what a re-measure is gated on: the narrow flag, the card's own html and
     *  its bottom — nothing else can change the box's height. */
    this._narrow = false;
    this._bandKey = '';
    this._bandLift = -1;

    /* The ✕ is the ONE thing on the card that takes the pointer (#ui is pointer-events:none
     * so a panel can never swallow a grip — §21.1); the card around it stays inert. */
    this._skip.style.pointerEvents = 'auto';
    this._skip.addEventListener('click', () => this.skip());
    /* Escape typed INTO the card (the ✕ has focus) skips the cards and goes no further: Input
     * listens on window in the bubble phase, so stopping here is what keeps the same keystroke
     * from becoming a pause (the settings card's rule, settings.js; m29 W4 / m15 P5). The
     * keyup that follows is owed to nobody either. */
    this.el.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;
      this._owedUp = true;
      this.skip();
    });
    this.el.addEventListener('keyup', (e) => {
      if (e.code !== 'Escape' || !this._owedUp) return;
      this._owedUp = false;
      e.preventDefault();
      e.stopPropagation();
    });

    if (this.enabled) {
      /* FIRST in #ui, so every later sibling — the HUDs and their notices, every card — paints
       * over it: the card defers to a notice by construction, no z-index needed. */
      root.insertBefore(this.el, root.firstChild);
      /* The two things that move the help line without main.js knowing: the window and the
       * fonts. Everything else (a help-line rewrite, --ts, .hc) calls relayout() from there. */
      window.addEventListener('resize', () => this.relayout());
      try {
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => this.relayout(), () => {});
      } catch (e) { /* no Font Loading API: the boot measurement stands */ }
    }

    if (bus && this.enabled) {
      // Model only, inside the step (§22.2): the observer's frame() draws.
      bus.on(EVENTS.GRIP_STARTED, (e) => {
        if (!this.active || this.step !== 1) return;
        if (e.playerId !== this.seat0Player()) return;
        this.stamps[1] = e.simTimeMs || 0;
        this.step = 2;
      });
      bus.on(EVENTS.CARGO_STATE, (e) => {
        if (!this.active || !e.loaded || this.step > 2) return;
        this.stamps[2] = e.simTimeMs || 0;
        this.step = 3;
      });
      // Shell events, emitted outside the step: the card yields to the pause card at once.
      bus.on(EVENTS.SIM_PAUSED, () => this.refresh());
      bus.on(EVENTS.SIM_RESUMED, () => this.refresh());
    }
  }

  /** shell.walkthroughSeen, as the card reads it — the settings row's consumer (m16 U2). */
  get seen() { return !!this._seen(); }

  /** On screen right now. */
  get visible() { return this.enabled && !this.el.hidden; }

  /** Steps 1-2 are up: the stall hint must not count (main.js). Requires an active card, so a
   *  seen, skipped, co-op or disabled walkthrough never silences anything. */
  get coaching() { return this.active && this.step <= 2; }

  /** A new run's first minute: title.onStart and resetContract. Nothing to arm when the cards
   *  are off, already seen in this browser, or the screen is split. */
  arm() {
    this.stamps = { 1: null, 2: null, 3: null };
    this.shownThisRun = false;
    this.retiredBy = '';
    if (!this.enabled || this._seen() || this.coop()) { this.active = false; this.step = 0; this.refresh(); return false; }
    this.active = true;
    this.step = 1;
    this.refresh();
    return true;
  }

  /** The card is done for this run. 'done' and 'skip' are the two the player finished with,
   *  so they mark the browser as seen; 'coop' and 'seen' just take it down. */
  retire(reason = 'done') {
    if (!this.active) return false;
    this.active = false;
    this.retiredBy = reason;
    if ((reason === 'done' || reason === 'skip') && this.onSeen) this.onSeen();
    this.refresh();
    return true;
  }

  /** The ✕, or Escape into the card. */
  skip() { return this.retire('skip'); }

  /** Something may have moved the help line (a resize, its rewrite, --ts, .hc): measure again
   *  at the next visible refresh — one forced layout then, none per frame. */
  relayout() { this._layoutDirty = true; }

  /**
   * Once per render frame (main.js's game observer) — and by feedHuds, so a suite that feeds
   * the HUD feeds this. Sim time, so a paused game moves nothing (m0 A9/E3).
   * @param {number} simTimeMs
   */
  frame(simTimeMs) {
    if (this.active) {
      if (this.coop()) this.retire('coop');
      else if (this._seen()) this.retire('seen');
      else if (this.step === 3 &&
               (this.delivered() || (this.stamps[2] !== null && simTimeMs - this.stamps[2] >= WALKTHROUGH.step3Ms))) {
        this.stamps[3] = simTimeMs;
        this.retire('done');
      }
    }
    this.refresh();
  }

  /** Visibility is a FUNCTION of (active, suppressed), recomputed rather than toggled — the
   *  pause card's discipline (pauseScreen.js refresh). The DOM is written only on a change. */
  refresh() {
    if (!this.enabled) return;
    const show = this.active && !this.suppressed();
    if (this.el.hidden === show) this.el.hidden = !show;
    if (!show) {
      // A card that is not on screen takes none of the band back (M32).
      this._bandKey = '';
      this._setBandLift(0);
      return;
    }
    this.shownThisRun = true;
    const g = this.glyphs() || glyphsFor(0, 'kbm');
    const s = STEPS[this.step - 1];
    const resolve = (t) => esc(t).replace(GLYPH_TOKEN, (_, k) => `<span class="key">${esc(g[k] || '')}</span>`);
    const html = `${this.step}/${STEPS.length}|${g.device}|${resolve(s.title)}|${resolve(s.text)}`;
    if (html !== this._html) {
      this._html = html;
      this._n.textContent = `${this.step} of ${STEPS.length}`;
      this._dev.hidden = g.device !== 'pad';
      this._title.innerHTML = resolve(s.title);
      this._text.innerHTML = resolve(s.text);
    }
    // Position by measurement: the help line's live height decides where the card's bottom is —
    // measured when something could have moved it (relayout), never on every frame.
    if (this._layoutDirty) {
      this._layoutDirty = false;
      const b = Math.round(this.clearance());
      if (b !== this._bottom) { this._bottom = b; this.el.style.bottom = `${b}px`; }
      /* M32: the same occasions decide the band's form. A width of 0 is "not laid out yet",
       * not "very narrow" — the wide card is the default and stays it until something says
       * otherwise. */
      const w = this.bandWidth();
      const narrow = w > 0 && w <= WALKTHROUGH.narrowPx;
      if (narrow !== this._narrow) { this._narrow = narrow; this.el.classList.toggle('narrow', narrow); }
      this._bandKey = '';                                  // …and re-measure what it is worth
    }
    /* THE BADGE'S REACH, measured only when it can have changed (the narrow flag, the card's
     * text, its bottom). getBoundingClientRect forces a synchronous layout and refresh() runs
     * twice a frame — M22's whole reason for caching its bottom applies here unchanged. */
    const key = `${this._narrow ? 1 : 0}|${this._html}|${this._bottom}`;
    if (key !== this._bandKey) {
      this._bandKey = key;
      /* THE CARD'S TOP, from the bottom of the window — the same shape main.js's `clearance`
       * measures the help line's top with, and for the same reason. Measuring the card's
       * HEIGHT and adding it to the route bar's own offset was 5 px short at 800 px (the card
       * sits on the help line's measured top, the route bar on a scaled 42 px, and the two
       * bases are not the same number): the stack cleared by 1.0 px instead of bandGapPx. */
      const top = this._narrow ? (window.innerHeight - this.el.getBoundingClientRect().top) + WALKTHROUGH.bandGapPx : 0;
      this._setBandLift(top);
    }
  }

  /** Publish --band-lift on the document root: the height the boxes over the help line must
   *  clear to sit above the badge, or 0 when there is no badge. styles.css takes the LARGER of
   *  it and their own offset, so 0 is exactly the layout that shipped. Written only on a
   *  change, like every other DOM write here. */
  _setBandLift(px) {
    const v = Math.max(0, Math.round(px * 100) / 100);
    if (v === this._bandLift) return;
    this._bandLift = v;
    try { document.documentElement.style.setProperty('--band-lift', `${v.toFixed(2)}px`); } catch (e) { /* no root */ }
  }

  /** What the band is doing right now — for the suites and for a run summary that wants to
   *  know the card was in its narrow form. Plain data. */
  bandMetrics() {
    return { narrow: this._narrow, lift: Math.max(0, this._bandLift), width: this.bandWidth() };
  }

  /** The run summary's `walkthrough` key (runLog.js walkthroughReport normalises it). */
  report() {
    if (!this.enabled || !this.shownThisRun) return { shown: false };
    return { shown: true, step1Ms: this.stamps[1], step2Ms: this.stamps[2], step3Ms: this.stamps[3] };
  }
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
