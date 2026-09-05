/* HUD — GDD §21.1, §21.2, §26.5, §8.4, §11.2, §4.4.
 *
 * §21.1's constraint has not changed and still shapes everything here:
 *   "Small center reticle with left/right grip state."
 *   "NO PERSISTENT PANEL SHOULD COVER THE OBJECT-DOORWAY RELATIONSHIP."
 *
 * The whole game is judging whether a thing fits through a gap, so the working area — the
 * middle of the screen — stays clear. Everything added in Phase 11 lives at an edge: the
 * contract in the top-left under the debug overlay, cargo status top-right, the interaction
 * prompt just under the reticle where the eye already is, and transient notices bottom-right.
 *
 * §4.4 is the reason the prompt exists at all: "one input should not change meaning
 * invisibly". E does eleven different things depending on what you are looking at, which is
 * only acceptable if the screen says which one BEFORE it is pressed.
 *
 * §26.5: every state changes shape or carries text, never colour alone.
 *
 * The DOM is touched only when something actually changed. A HUD that rewrites innerHTML
 * every frame is a HUD that eats the §26.6 frame budget, and this one is updated from the
 * render loop at whatever rate the game runs.
 *
 * GLYPHS ARE DERIVED, NEVER TYPED (Phase 11 build-side M5). For fifteen phases this file
 * printed a literal 'E', 'Q' and 'LMB / RMB' for every seat, so seat 1 — Quote/Semicolon/[ ]
 * on the keyboard, X/RB/LT/RT on a pad — was told to press keys it does not have (§26.5
 * "both input mappings"). Every glyph now arrives as a `glyphs` set from input.glyphsFor(),
 * which reads the live binding table; the default, when nobody passes one, is the same
 * function on the shipped table for this seat's keyboard. The VERB never changes — only the
 * key chip — because the verb is what the player (and m11 B6/D4/E3) reads.
 */

import { glyphsFor } from '../core/input.js';

/** Tokens a device-neutral hint may carry; setPrompt resolves them from the glyph set. */
const GLYPH_TOKEN = /\{(primary|secondary|gripL|gripR)\}/g;

/** §26.5 "states understandable without color alone" / §21.4 Vision (Phase 11 build-side
 *  M19): each notice KIND's glyph, printed BEFORE the text so a kind is never its border
 *  colour alone. The pause card's 'What happened' block prints the same table (m27 A3/A4). */
export const NOTICE_GLYPHS = Object.freeze({ info: '→', good: '✓', warn: '!', damage: '✗' });

/** §11.2's three cargo bands, as a bracketed token beside the word — the row's colour is the
 *  third cue, never the only one (§26.5). Keyed by the band's CSS class. */
const CARGO_TOKENS = Object.freeze({ ok: '[ok]', warn: '[!]', bad: '[!!]' });

export class Hud {
  /* CLASSES, NOT IDS. There is one HUD per SEAT in co-op (§6.4), and two elements sharing an
   * id is invalid HTML whose symptom is subtle rather than loud: `document.querySelector`
   * silently returns the first, so seat 1's panels would be read and written as seat 0's by
   * anything that did not scope its lookup. Every selector below is scoped to `this.el`. */
  constructor(root, seat = 0) {
    this.seat = seat;
    this.el = document.createElement('div');
    this.el.className = 'hud';
    this.el.dataset.seat = String(seat);
    this.el.innerHTML = `
      <div class="reticle">
        <div class="hand left"></div>
        <div class="dot"></div>
        <div class="hand right"></div>
      </div>
      <div class="grip-label"></div>
      <div class="prompt"></div>
      <div class="corner-tl">
        <div class="contract"></div>
        <div class="objective"></div>
      </div>
      <div class="cargo-status"></div>
      <div class="route-bar"><div class="fill"></div><span class="label"></span></div>
      <div class="notices"></div>
      <div class="caption"></div>
      <div class="seat-tag"></div>`;
    root.appendChild(this.el);

    this.reticle = this.el.querySelector('.reticle');
    this.left = this.el.querySelector('.hand.left');
    this.right = this.el.querySelector('.hand.right');
    this.label = this.el.querySelector('.grip-label');
    this.prompt = this.el.querySelector('.prompt');
    this.contract = this.el.querySelector('.contract');
    this.objective = this.el.querySelector('.objective');
    this.cargoStatus = this.el.querySelector('.cargo-status');
    this.routeBar = this.el.querySelector('.route-bar');
    this.routeFill = this.routeBar.querySelector('.fill');
    this.routeLabel = this.routeBar.querySelector('.label');
    this.notices = this.el.querySelector('.notices');
    this.caption = this.el.querySelector('.caption');
    this.seatTag = this.el.querySelector('.seat-tag');

    this._keys = {};
    this._notices = [];
    this._rect = null;
  }

  /**
   * Pin this HUD over its seat's viewport.
   *
   * `inset: auto` first, because `.hud` carries `inset: 0` for the solo case and `inset` is
   * shorthand for all four edges — setting only left/top/width would leave `right: 0` and
   * `bottom: 0` fighting the width and height, which stretches seat 0's panels across the
   * divider and puts them over seat 1's view.
   */
  setRect(rect) {
    const same = this._rect && this._rect.cssLeft === rect.cssLeft && this._rect.cssTop === rect.cssTop &&
                 this._rect.cssW === rect.cssW && this._rect.cssH === rect.cssH;
    if (same) return;
    this._rect = { cssLeft: rect.cssLeft, cssTop: rect.cssTop, cssW: rect.cssW, cssH: rect.cssH };
    const s = this.el.style;
    s.inset = 'auto';
    s.left = rect.cssLeft + 'px';
    s.top = rect.cssTop + 'px';
    s.width = rect.cssW + 'px';
    s.height = rect.cssH + 'px';
    this.el.classList.add('split');
  }

  /** Full-screen again, for the solo build. */
  clearRect() {
    if (!this._rect) return;
    this._rect = null;
    const s = this.el.style;
    s.inset = ''; s.left = ''; s.top = ''; s.width = ''; s.height = '';
    this.el.classList.remove('split');
  }

  /** §4.4 and §26.5: which mover this half belongs to, and which device drives it, in words
   *  rather than by the body colour alone — the two movers differ by hue and nothing else. */
  setSeatTag(text) { this._set(this.seatTag, 'seatTag', text ? esc(text) : ''); }

  /**
   * §21.4 Cognition "reduced HUD" (Phase 11 build-side M19; shell key `reducedHud`). The
   * contract panel keeps its phase word and manifest count, the cargo panel and the route
   * bar's label go, and the contract panel's other rows go — except an OVERTIME row, because
   * a cost being paid right now is never hidden (§2.2 "overtime costs money and work
   * continues"). What stays is what §21.1 and §26.5 make non-optional: the objective line,
   * the prompt, the reticle, notices and the caption. CSS does the hiding (styles.css
   * `.hud.reduced`), so nothing here is rewritten and every feed keeps landing — switching
   * it back on shows the current numbers at once.
   */
  setReduced(on) {
    const want = !!on;
    if (this.el.classList.contains('reduced') !== want) this.el.classList.toggle('reduced', want);
  }

  get reduced() { return this.el.classList.contains('reduced'); }

  /** §21.4 Vision "high contrast" (M19; shell key `highContrast`): the `.hc` class on this
   *  HUD's root. styles.css keys the opaque panels, white text and 2 px borders off it; main.js
   *  puts the same class on <body> and on every card, so the whole screen agrees. */
  setHighContrast(on) {
    const want = !!on;
    if (this.el.classList.contains('hc') !== want) this.el.classList.toggle('hc', want);
  }

  get highContrast() { return this.el.classList.contains('hc'); }

  /** Only rewrite a section when its content actually changed. */
  _set(node, key, html) {
    if (this._keys[key] === html) return;
    this._keys[key] = html;
    node.innerHTML = html;
  }

  /** §21.1's reticle. Unchanged from Phase 2 — it was already right.
   *  @param {object} [glyphs]  from input.glyphsFor(seat, device); this seat's keyboard set
   *                            when absent. */
  update(status, glyphs = null) {
    for (const [side, el] of [['left', this.left], ['right', this.right]]) {
      const g = status[side];
      const cls = 'hand ' + side +
        (g ? (g.slipping ? ' slipping' : ' holding') : (status.hovered ? ' ready' : ''));
      if (el.className !== cls) el.className = cls;
    }

    const held = [status.left, status.right].filter(Boolean);
    const slipping = held.some((g) => g.slipping);
    let text = '', cls = '';
    if (slipping) { text = 'SLIPPING'; cls = 'slipping'; }
    else if (held.length === 2 && held[0].entityId === held[1].entityId) { text = 'two hands'; cls = 'holding'; }
    else if (held.length) { text = 'holding'; cls = 'holding'; }
    else if (status.hovered) {
      const g = glyphs || glyphsFor(this.seat, 'kbm');
      text = `hold ${g.gripL} / ${g.gripR} to grab`; cls = 'ready';
    }
    if (this.label.textContent !== text) this.label.textContent = text;
    /* THE STRUCTURAL CLASS HAS TO SURVIVE THE STATE CLASS. This line read
     * `this.label.className = cls`, which was safe for five phases because the element was
     * `id="grip-label"` and an id cannot be clobbered by writing className. Moving the HUD
     * to classes for co-op turned it into a bug that CSS reports rather than JS: the label
     * lost `grip-label`, fell out of `position: absolute`, and rendered as a static block at
     * the top of the viewport, straight through the contract panel. */
    const full = cls ? `grip-label ${cls}` : 'grip-label';
    if (this.label.className !== full) this.label.className = full;
  }

  /**
   * §4.4's visible meaning for a context-sensitive key.
   *
   * @param {{primary, secondary, hint, carrying}} d  from InteractionSystem.describe()
   * @param {object} [glyphs]  from input.glyphsFor(seat, device); this seat's keyboard set
   *                           when absent (m11 F3 reads 'E' for seat 0 with no argument).
   *                           A `hint` may carry {gripL}/{gripR}/{primary}/{secondary}
   *                           tokens — interact.js is device-neutral; the HUD resolves them.
   */
  setPrompt(d, glyphs = null) {
    if (!d) { this._set(this.prompt, 'prompt', ''); return; }
    const g = glyphs || glyphsFor(this.seat, 'kbm');
    const bits = [];
    if (d.carrying) bits.push(`<span class="carry">carrying: ${esc(d.carrying)}</span>`);
    if (d.primary) bits.push(`<span class="key">${esc(g.primary)}</span> ${esc(d.primary)}`);
    if (d.secondary) bits.push(`<span class="key alt">${esc(g.secondary)}</span> ${esc(d.secondary)}`);
    if (!d.primary && !d.secondary && d.hint) {
      const hint = esc(d.hint).replace(GLYPH_TOKEN, (_, k) => esc(g[k] || ''));
      bits.push(`<span class="hint">${hint}</span>`);
    }
    this._set(this.prompt, 'prompt', bits.join('<span class="sep">·</span>'));
  }

  /**
   * §26.7 "identify the next objective without coaching" / §21.1 "compact objective count".
   * ONE line under the contract panel, derived every frame from the phase machine and the
   * truck (main.js objectiveFor) — never a checklist, which §21.1 forbids over the working
   * area and which 23 rows would be. Device-neutral: it names the PLACE; the prompt under
   * the reticle names the key when you get there.
   */
  setObjective(text) {
    this._set(this.objective, 'objective', text ? `<b>next</b> ${esc(text)}` : '');
  }

  /**
   * §21.2's contract UX. Deliberately a summary and not a checklist: §21.1 forbids a panel
   * over the working area, and 23 rows is a panel.
   */
  setContract({ phase, delivered, total, loaded, elapsedMin, estimateMin, roomCorrect, trip }) {
    const over = elapsedMin > estimateMin;
    const time = `${elapsedMin.toFixed(1)} / ${estimateMin.toFixed(0)} min`;
    // M13: a second trip is a fact the panel states; the first trip is not worth a word.
    const phaseLine = trip > 1 ? `${phase} · trip ${trip}` : phase;
    const html =
      `<div class="phase">${esc(phaseLine)}</div>` +
      // `.manifest`: the one row the reduced HUD keeps beside the phase word (M19, §21.1).
      `<div class="row manifest"><span>manifest</span><b>${delivered} / ${total}</b></div>` +
      `<div class="row"><span>in the truck</span><b>${loaded}</b></div>` +
      (delivered > 0 ? `<div class="row"><span>right room</span><b>${roomCorrect} / ${delivered}</b></div>` : '') +
      `<div class="row${over ? ' over' : ''}"><span>${over ? 'OVERTIME' : 'time'}</span><b>${time}</b></div>`;
    this._set(this.contract, 'contract', html);
  }

  /**
   * §11.2: "Driver can glance at a COARSE cargo-status indicator; perfect information is
   * unnecessary." So this is three lines, and the unsecured figure is deliberately a
   * percentage band rather than a number of newtons.
   */
  setCargo(q) {
    if (!q || q.loadedCount === 0) { this._set(this.cargoStatus, 'cargo', ''); return; }
    const pct = Math.round(q.unsecuredFraction * 100);
    const band = pct === 0 ? 'secure' : pct < 35 ? 'mostly secure' : 'LOOSE';
    const cls = pct === 0 ? 'ok' : pct < 35 ? 'warn' : 'bad';
    const html =
      `<div class="row"><span>cargo</span><b>${q.loadedCount} items · ${Math.round(q.totalMass)} kg</b></div>` +
      // M19: the band's bracketed token beside the word — §26.5, never the colour alone.
      `<div class="row ${cls}"><span>${band} <span class="tok">${CARGO_TOKENS[cls]}</span></span><b>${Number.isFinite(q.quality) ? `${Math.round(q.quality * 100)}% pack · ` : ''}${pct}% unstrapped</b></div>` +
      `<div class="row"><span>space used</span><b>${Math.round(q.volumeFraction * 100)}%</b></div>`;
    this._set(this.cargoStatus, 'cargo', html);
  }

  /** Route progress during §3.4's TRANSIT. Hidden the rest of the time. */
  setRoute(status) {
    const driving = status && status.state === 'driving';
    if (this.routeBar.classList.contains('on') !== driving) {
      this.routeBar.classList.toggle('on', driving);
    }
    if (!driving) return;
    this.routeFill.style.width = `${(status.progress * 100).toFixed(1)}%`;
    /* The route STATE's own word when nothing is happening (M19, §26.5 — the bar's lime fill
     * is not the only cue), the event's name when something is; the objective line above
     * says 'on the road — 42% there' already, so the label does not repeat it. */
    const text = status.event ? status.event : 'driving';
    if (this.routeLabel.textContent !== text) this.routeLabel.textContent = text;
    this.routeLabel.className = 'label' + (status.event ? ' event' : '');
  }

  /**
   * §8.4: "At impact: material sound, visual mark, optional haptic pulse, and ONE SMALL COST
   * NOTICE." One small notice — so these are short, they stack at most a few deep, and they
   * expire on their own.
   */
  notice(text, kind = 'info') {
    this._notices.push({ text, kind, until: performance.now() + 3200 });
    if (this._notices.length > 4) this._notices.shift();
    this._renderNotices();
  }

  tickNotices() {
    const now = performance.now();
    const before = this._notices.length;
    this._notices = this._notices.filter((n) => n.until > now);
    if (this._notices.length !== before) this._renderNotices();
  }

  /**
   * §21.4 Hearing / §26.5 "subtitles … exist" (Phase 11 build-side M9): the last sound cue's
   * caption, bottom-centre above the help line, with a direction glyph when the cue happened
   * somewhere (audio.js directionGlyph from this seat's own facing). ONE line, for
   * AUDIO.captionMs of sim time; the audio layer decides what and when (lastCaption), the HUD
   * only shows it — so the caption exists with the sound off, or refused, or never armed.
   * Text with no glyph is exactly the cue's caption (m18 A8).
   */
  setCaption(text, glyph = '') {
    const html = text
      ? (glyph ? `<span class="dir">${esc(glyph)}</span> ` : '') + esc(text)
      : '';
    this._set(this.caption, 'caption', html);
  }

  /** The settings card's captions switch (shell key `captions`). Hidden is hidden: the text
   *  is still fed, so switching it back on shows the current caption at once. */
  setCaptionsEnabled(on) {
    const hidden = !on;
    if (this.caption.hidden !== hidden) this.caption.hidden = hidden;
  }

  get captionsEnabled() { return !this.caption.hidden; }

  _renderNotices() {
    // M19: the kind's glyph first (NOTICE_GLYPHS), so textContent begins with it (m27 A3).
    const html = this._notices
      .map((n) => `<div class="notice ${n.kind}"><span class="glyph">${NOTICE_GLYPHS[n.kind] || NOTICE_GLYPHS.info}</span> ${esc(n.text)}</div>`).join('');
    this._set(this.notices, 'notices', html);
  }
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
