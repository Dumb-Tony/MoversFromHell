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
 */

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
      <div class="contract"></div>
      <div class="cargo-status"></div>
      <div class="route-bar"><div class="fill"></div><span class="label"></span></div>
      <div class="notices"></div>
      <div class="seat-tag"></div>`;
    root.appendChild(this.el);

    this.reticle = this.el.querySelector('.reticle');
    this.left = this.el.querySelector('.hand.left');
    this.right = this.el.querySelector('.hand.right');
    this.label = this.el.querySelector('.grip-label');
    this.prompt = this.el.querySelector('.prompt');
    this.contract = this.el.querySelector('.contract');
    this.cargoStatus = this.el.querySelector('.cargo-status');
    this.routeBar = this.el.querySelector('.route-bar');
    this.routeFill = this.routeBar.querySelector('.fill');
    this.routeLabel = this.routeBar.querySelector('.label');
    this.notices = this.el.querySelector('.notices');
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

  /** Only rewrite a section when its content actually changed. */
  _set(node, key, html) {
    if (this._keys[key] === html) return;
    this._keys[key] = html;
    node.innerHTML = html;
  }

  /** §21.1's reticle. Unchanged from Phase 2 — it was already right. */
  update(status) {
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
    else if (status.hovered) { text = 'hold LMB / RMB to grab'; cls = 'ready'; }
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
   */
  setPrompt(d) {
    if (!d) { this._set(this.prompt, 'prompt', ''); return; }
    const bits = [];
    if (d.carrying) bits.push(`<span class="carry">carrying: ${esc(d.carrying)}</span>`);
    if (d.primary) bits.push(`<span class="key">E</span> ${esc(d.primary)}`);
    if (d.secondary) bits.push(`<span class="key alt">Q</span> ${esc(d.secondary)}`);
    if (!d.primary && !d.secondary && d.hint) bits.push(`<span class="hint">${esc(d.hint)}</span>`);
    this._set(this.prompt, 'prompt', bits.join('<span class="sep">·</span>'));
  }

  /**
   * §21.2's contract UX. Deliberately a summary and not a checklist: §21.1 forbids a panel
   * over the working area, and 23 rows is a panel.
   */
  setContract({ phase, delivered, total, loaded, elapsedMin, estimateMin, roomCorrect }) {
    const over = elapsedMin > estimateMin;
    const time = `${elapsedMin.toFixed(1)} / ${estimateMin.toFixed(0)} min`;
    const html =
      `<div class="phase">${esc(phase)}</div>` +
      `<div class="row"><span>manifest</span><b>${delivered} / ${total}</b></div>` +
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
      `<div class="row ${cls}"><span>${band}</span><b>${pct}% unstrapped</b></div>` +
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
    const text = status.event ? status.event : 'on the road';
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

  _renderNotices() {
    const html = this._notices
      .map((n) => `<div class="notice ${n.kind}">${esc(n.text)}</div>`).join('');
    this._set(this.notices, 'notices', html);
  }
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
