/* The manifest itself — GDD §21.2 "the manifest filters by room/category and shows pickup,
 * loaded, delivered and condition states"; §21.1 "compact objective count … not a checklist";
 * §15.2 room accuracy; §8.3 condition states; §26.5 "states understandable without colour
 * alone"; §2.2 "work continues". Phase 11 build-side M33.
 *
 * M24 closed four of §21.2's five sentences — the brief, the reveal, the recap and the retry.
 * This is the fifth, and the build has never had it. The HUD shows 'manifest 4 / 23' BY
 * DESIGN: §21.1 forbids a checklist on screen, so hud.js:setContract is deliberately a
 * five-row summary. The title's brief profiles the job before it starts and the settlement
 * sheet reports it after it ends. During the contract nothing answered "what is left, where
 * does it go, what did I break" — a player carrying the twenty-second box had no way to find
 * the last one, and room accuracy (§15.2, worth ECONOMY.roomAccuracyBonus on the invoice) was
 * invisible until it was too late to fix.
 *
 * SO IT IS A CARD BEHIND A KEY, NOT A PANEL ON THE HUD. §21.1 holds unchanged: the objective
 * line and the contract panel are exactly what they were, and this opens on the `manifest`
 * action (M on the keyboard, the pad's D-pad up — input.js, rebindable through M18's Controls
 * rows) or from the pause card. It is the settings card's shape, not the walkthrough's: a
 * centred sheet over a dimmed backdrop, because a player who asked for the list wants to read
 * it rather than peer around it.
 *
 * IT PAUSES NOTHING (§2.2 "a dropped object is now somewhere inconvenient … work continues").
 * The clock runs, the labour bills, the truck's cargo keeps settling while the card is up —
 * m40 N4 asserts the clock advanced. What it DOES do is release the pointer lock, so the
 * cursor can reach the filter chips; main.js's `onPointerLockLost` pause path is told to
 * ignore that one release, and closing the card asks for the lock back.
 *
 * IT HIDES UNDER EVERY PAUSE-SHAPED SCREEN, the walkthrough's discipline (walkthrough.js
 * refresh): visibility is a FUNCTION of (open, suppressed), recomputed rather than toggled,
 * so the title card, the pause card, the settlement sheet and the settings card each take the
 * screen back and the manifest returns when they close if it was open. Hints off does NOT
 * hide it — the first-minute cards are coaching and this is a reference (M19).
 *
 * REBUILT ON EVENTS, NEVER PER FRAME. Subscribed only while open and unsubscribed on close:
 * CARGO_STATE (loaded / unloaded), GRIP_STARTED and GRIP_ENDED (carried), PART_CHANGED (parts
 * off), DAMAGE_APPLIED (condition), DOOR_STATE (M11's leaves), CONTRACT_PHASE (the trip and
 * the phase the 'left at the old house' state reads) and SIM_RESET each mark the list DIRTY,
 * and one rebuild per frame at most services however many arrived. The ONE fact with no event
 * of its own is delivery: stepManifest writes row.delivered and row.roomCorrect silently, and
 * ZONE_CHANGED is declared in §23.3 and emitted by nothing (KNOWN_ISSUES) — and neither
 * condition (changed at impact, posted when the window closes) nor a detached part (the event
 * belongs to the interaction that called disassemble). So frame() also compares a short
 * fingerprint of exactly those four facts — _stateSig below says why each one is in it — which
 * is one Map lookup per row while the card is open and no DOM at all. A hundred quiet frames
 * rebuild zero times (m40 N2).
 *
 * SHELL STATE THROUGHOUT (§22.4; m0 E8): the open flag, the three filters and the rebuild
 * counter live on this object. Nothing here enters game.state, adds a body or adds a scene
 * child. The filters survive closing and reopening within a session and are deliberately NOT
 * in the save — a filter is where you were looking a minute ago, not a preference (m40 N3
 * asserts load()'s seven sections are unchanged).
 *
 * COLOUR IS NEVER THE SIGNAL (§26.5). Every state, every condition band and every warning is
 * a WORD: 'at pickup', 'on the truck', 'delivered', 'wrong room', 'parts off (4)', 'damaged',
 * 'two-person'. The tokens are tinted as well, and the tint is the redundant half.
 */

import { EVENTS, PHASES } from '../core/eventBus.js';
import { MANIFEST_VIEW } from '../config.js';
import { rowWhere } from '../contract/manifest.js';
import { bandFor } from '../damage/damage.js';
import { DEST_ZONES } from '../world/destination.js';
import { OBJECT_DEFS } from '../objects/definitions.js';

/** The five states §21.2 names, plus the sixth the build actually has.
 *
 * §21.2 lists "pickup, loaded, delivered and condition states" and the brief spelled the set
 * as at pickup / carried / on the truck / delivered / left at the old house. That set has a
 * hole: an item carried off the truck and set down in the new house's hallway is none of them
 * until MANIFEST.dwellMs of settled dwell turns it into 'delivered'. rowWhere() already names
 * that place ('site'), the invoice already bills it (undeliveredRows — M20's one definition of
 * "left behind" includes it), and leaving it unnamed here would print 'left at the old house'
 * over an item standing three metres away. So it gets its own word. Order is the order of the
 * job, which is the order the filter chips are drawn in. */
export const MANIFEST_STATES = Object.freeze([
  { id: 'pickup',    label: 'at pickup' },
  { id: 'carried',   label: 'carried' },
  { id: 'truck',     label: 'on the truck' },
  { id: 'site',      label: 'at the new house' },
  { id: 'delivered', label: 'delivered' },
  { id: 'away',      label: 'left at the old house' },
]);

const STATE_LABEL = Object.freeze(Object.fromEntries(MANIFEST_STATES.map((s) => [s.id, s.label])));

/** The id every filter uses for "do not filter on this". */
export const ANY = 'any';

/** A destination zone id as the card prints it: 'dest_living' -> 'living room'. The zone's own
 *  label is the source (destination.js), so a renamed room is renamed here too; the
 *  '(destination)' suffix that distinguishes it from the pickup house's zone is dropped,
 *  because inside this card every room IS a destination. */
export function roomLabel(zoneId) {
  const z = DEST_ZONES.find((r) => r.id === zoneId);
  if (!z) return zoneId ? String(zoneId).replace(/^dest_/, '').replace(/_/g, ' ') : 'unassigned';
  return String(z.label).replace(/\s*\(destination\)\s*$/i, '').toLowerCase();
}

/** 'couch_3seat_01' -> 'couch 3seat' — main.js wordsFor's rule, applied to a DEF id so the
 *  card can name a row whose entity has been lost off the world (§9.1). */
export function defWords(defId) {
  return String(defId || '').replace(/_\d+$/, '').replace(/_/g, ' ');
}

/** How many detached-part PIECES an entity currently has off it (M12). `state.parts` maps a
 *  part name to the ids of the pieces it became, so the couch's legs are 4. */
export function partsOffCount(entity) {
  const parts = entity && entity.state && entity.state.parts;
  if (!parts) return 0;
  let n = 0;
  for (const ids of Object.values(parts)) n += (ids || []).length;
  return n;
}

/** Does this row want two people? §12.1's special handling is the manifest's own declaration
 *  ('two-person'); the def's `twoPersonPreferred` tag is §6.3's, on the couch. Either counts —
 *  a row is two-person when EITHER table says so, so neither can quietly disagree with the
 *  other (§24.4 content validation's rule applied to a display fact). */
export function needsTwo(row, def) {
  if (row && row.handling === 'two-person') return true;
  return !!(def && (def.tags || []).includes('twoPersonPreferred'));
}

/**
 * One manifest row as the card shows it — PURE, no DOM, plain data.
 *
 * @param {object} row        a game.state.manifest row
 * @param {object} registry   ObjectRegistry (read only)
 * @param {{departed?: boolean}} ctx  has the truck left the old house yet? (state.tripCount > 1
 *        or the phase is past PICKUP) — the one thing that separates 'at pickup' from 'left at
 *        the old house', which are the same PLACE and different NEWS.
 */
export function manifestRowView(row, registry, { departed = false } = {}) {
  const e = row.entityId && registry ? registry.get(row.entityId) : null;
  const def = (e && e.def) || OBJECT_DEFS[row.defId] || null;
  const condition = e && e.state ? Number(e.state.condition) : 100;
  const band = bandFor(Number.isFinite(condition) ? condition : 100);

  let state;
  if (row.delivered) state = 'delivered';
  else if (e && e.state && (e.state.held || (e.state.grips || []).length > 0)) state = 'carried';
  else if (e && e.state && e.state.loaded) state = 'truck';
  else {
    const where = rowWhere(row, registry).where;
    state = where === 'truck' ? 'truck' : where === 'site' ? 'site' : departed ? 'away' : 'pickup';
  }

  const off = partsOffCount(e);
  const tokens = [];
  if (needsTwo(row, def)) tokens.push({ id: 'two', text: 'two-person' });
  if (off > 0) tokens.push({ id: 'parts', text: `parts off (${off})` });
  if (row.delivered && !row.roomCorrect) tokens.push({ id: 'wrongroom', text: 'wrong room' });
  if (Number.isFinite(condition) && condition < 100) tokens.push({ id: 'damaged', text: 'damaged' });
  if (!e) tokens.push({ id: 'lost', text: 'not in the world' });

  return {
    id: row.id,
    defId: row.defId,
    name: defWords(row.defId),
    room: roomLabel(row.toZone),
    roomId: row.toZone || '',
    category: (def && def.category) || 'unknown',
    state,
    stateLabel: STATE_LABEL[state] || state,
    condition: Number.isFinite(condition) ? condition : 100,
    conditionPct: `${(Number.isFinite(condition) ? condition : 100).toFixed(MANIFEST_VIEW.conditionDecimals)}%`,
    conditionWord: band.name,
    twoPerson: needsTwo(row, def),
    partsOff: off,
    wrongRoom: !!(row.delivered && !row.roomCorrect),
    tokens,
  };
}

/**
 * The whole card's model — every row, the filter option lists derived from those rows, and the
 * footer's counts. PURE. `filters` selects; the option lists are always the FULL sets so a
 * filter that currently matches nothing is still visible to be turned off again (§2.1: the
 * game should rarely say no, and a filter you cannot undo is a small no).
 */
export function manifestView(rows, registry, { departed = false, doorsOff = 0, filters = null } = {}) {
  const all = (rows || []).filter((r) => r.required !== false)
    .slice(0, MANIFEST_VIEW.maxRows)
    .map((r) => manifestRowView(r, registry, { departed }));
  const truncated = Math.max(0, (rows || []).filter((r) => r.required !== false).length - all.length);

  // Rooms in DEST_ZONES order, categories alphabetically — both derived from what is actually
  // on this contract, so a manifest that never uses a room does not offer an empty filter.
  const roomIds = DEST_ZONES.map((z) => z.id).filter((id) => all.some((r) => r.roomId === id));
  const categories = [...new Set(all.map((r) => r.category))].sort();

  const f = { room: ANY, category: ANY, state: ANY, ...(filters || {}) };
  const shown = all.filter((r) =>
    (f.room === ANY || r.roomId === f.room) &&
    (f.category === ANY || r.category === f.category) &&
    (f.state === ANY || r.state === f.state));

  const delivered = all.filter((r) => r.state === 'delivered').length;
  const roomRight = all.filter((r) => r.state === 'delivered' && !r.wrongRoom).length;
  const partsMissing = all.reduce((s, r) => s + r.partsOff, 0);

  return {
    all, shown, truncated,
    options: {
      room: [{ id: ANY, label: 'any room' }, ...roomIds.map((id) => ({ id, label: roomLabel(id) }))],
      category: [{ id: ANY, label: 'any kind' }, ...categories.map((id) => ({ id, label: id }))],
      state: [{ id: ANY, label: 'any state' }, ...MANIFEST_STATES.map((s) => ({ id: s.id, label: s.label }))],
    },
    footer: {
      delivered, total: all.length, roomRight, partsMissing, doorsOff: Math.max(0, doorsOff | 0),
      text: footerText(delivered, all.length, roomRight, partsMissing, doorsOff),
    },
  };
}

/** The footer sentence. §15.2's room accuracy is a fraction of what was DELIVERED, never of the
 *  manifest — manifestSummary's rule, so the card and the invoice cannot disagree. */
export function footerText(delivered, total, roomRight, partsMissing, doorsOff = 0) {
  const parts = partsMissing === 0 ? 'no parts missing'
    : `${partsMissing} part${partsMissing === 1 ? '' : 's'} missing`;
  let out = `${delivered} / ${total} delivered · rooms right ${roomRight} / ${delivered} · ${parts}`;
  const d = Math.max(0, doorsOff | 0);
  if (d > 0) out += ` · ${d} house door${d === 1 ? '' : 's'} off ${d === 1 ? 'its' : 'their'} hinges`;
  return out;
}

export class ManifestScreen {
  /**
   * @param {HTMLElement} root  #ui
   * @param {object} [opts]
   * @param {import('../core/eventBus.js').EventBus} [opts.bus]
   * @param {() => Array} [opts.rows]        game.state.manifest
   * @param {object} [opts.registry]         the ObjectRegistry, read only
   * @param {() => boolean} [opts.departed]  has the truck left the old house on this contract
   * @param {() => number} [opts.doorsOff]   house leaves off their hinges right now (M11)
   * @param {() => boolean} [opts.suppressed] the title / pause / settlement / settings card is up
   */
  constructor(root, {
    bus = null,
    rows = () => [],
    registry = null,
    departed = () => false,
    doorsOff = () => 0,
    suppressed = () => false,
  } = {}) {
    this.bus = bus;
    this.rows = rows;
    this.registry = registry;
    this.departed = departed;
    this.doorsOff = doorsOff;
    this.suppressed = suppressed;

    /** Shell state. `open` is the player's answer; `visible` is that answer AND nothing
     *  pause-shaped covering it. */
    this._open = false;
    /** The three filters, kept across opens within a session and never saved (§21.2 "a retry
     *  keeps SETTINGS" — a filter is not one). */
    this.filters = { room: ANY, category: ANY, state: ANY };
    /** How many times the list was rebuilt from state. A suite pins it to prove the card is
     *  event-driven and not a per-frame renderer (m40 N2). */
    this.rebuilds = 0;
    this._dirty = true;
    this._sig = '';
    this._listHtml = '';
    this._footHtml = '';
    this._offs = [];
    /** Called when the card opens / closes, so the shell can hand the pointer over and back. */
    this.onOpen = null;
    this.onClose = null;

    this.el = document.createElement('div');
    this.el.id = 'manifest-screen';
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="card mf-card" role="dialog" aria-label="The manifest">
        <div class="mf-head">
          <h2>Manifest</h2>
          <span class="mf-count"></span>
          <button class="mf-close" type="button" data-act="close" title="Close the manifest" aria-label="Close the manifest">✕</button>
        </div>
        <div class="mf-filters"></div>
        <ol class="mf-list"></ol>
        <p class="mf-empty" hidden>No row matches these filters.</p>
        <div class="mf-foot"></div>
        <p class="mf-hint"></p>
      </div>`;
    this._count = this.el.querySelector('.mf-count');
    this._filters = this.el.querySelector('.mf-filters');
    this._list = this.el.querySelector('.mf-list');
    this._empty = this.el.querySelector('.mf-empty');
    this._foot = this.el.querySelector('.mf-foot');
    this._hint = this.el.querySelector('.mf-hint');
    this._hint.textContent = 'The job keeps running while this is open. Esc, the same key, or ✕ closes it.';

    /* The list's scrolling box, from config rather than from styles.css: at --ts 1.6 the rows
     * are 1.6× taller and the list has to scroll inside the card instead of pushing the footer
     * off the screen (m40 N6). One write, at construction. */
    this.el.style.setProperty('--mf-list-max', `${Math.round(MANIFEST_VIEW.listMaxVh * 100)}vh`);
    // #ui is pointer-events:none precisely so a panel can never swallow a grip (§21.1); a card
    // the player opened is one of the places the UI layer opts back in (invoiceScreen's rule).
    this.el.style.pointerEvents = 'auto';
    root.appendChild(this.el);

    this.el.addEventListener('click', (e) => {
      const t = e.target;
      const act = t && t.dataset ? t.dataset.act : null;
      // The backdrop is "click to close", the way the settings card's is.
      if (act === 'close' || t === this.el) { this.hide(); return; }
      const chip = t && t.closest ? t.closest('[data-filter]') : null;
      if (chip) this.setFilter(chip.dataset.filter, chip.dataset.value);
    });

    /* Escape closes the card and goes NO FURTHER (m15 P5's pattern, the settings card's
     * implementation): Input listens on window in the BUBBLE phase, so a capture-phase
     * listener here runs first and stopImmediatePropagation is what keeps the same keystroke
     * from also becoming a pause. The keyup that follows is owed to nobody either — a release
     * edge for a key the game never saw held is a wasReleased() nobody pressed. */
    this._owedUp = false;
    this._key = (e) => {
      /* `hidden`, not `_open`: a card suppressed under the settings card is still open, and the
       * Escape typed there belongs to whatever is ON TOP. The settings card's own capture-phase
       * listener was registered first and stops the event before this runs, so this guard is
       * belt as well as braces — but a construction order is a poor thing to depend on. */
      if (!this._open || this.el.hidden || e.code !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.repeat) return;
      this._owedUp = true;
      this.hide();
    };
    this._keyup = (e) => {
      if (!this._owedUp || e.code !== 'Escape') return;
      this._owedUp = false;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener('keydown', this._key, true);
    window.addEventListener('keyup', this._keyup, true);

    this._buildFilters();
    this.refresh();
  }

  /** The player asked for it. */
  get open() { return this._open; }
  /** …and nothing pause-shaped is covering it. */
  get visible() { return this._open && !this.el.hidden; }

  show() {
    if (this._open) return false;
    this._open = true;
    this._dirty = true;
    this._subscribe();
    this._build();
    this.refresh();
    if (this.onOpen) this.onOpen();
    return true;
  }

  hide() {
    if (!this._open) return false;
    this._open = false;
    this._unsubscribe();
    /* A closed card holds NO rows: the DOM it built goes back exactly where it came from, so
     * three open/close cycles leave the document's element count where it started (m40 N4),
     * and a closed card costs nothing to keep around (§26.6). */
    this._list.innerHTML = '';
    this._listHtml = '';
    this.refresh();
    if (this.onClose) this.onClose();
    return true;
  }

  toggle() { return this._open ? this.hide() : this.show(); }

  /** One filter, by id. An unknown axis or value is ignored rather than throwing — the chips
   *  are the only caller in the build, and a suite may reasonably ask for nonsense. */
  setFilter(axis, value) {
    if (!Object.prototype.hasOwnProperty.call(this.filters, axis)) return false;
    if (this.filters[axis] === value) return false;
    this.filters[axis] = value;
    this._dirty = true;
    if (this._open) { this._build(); this.refresh(); }
    return true;
  }

  /** Every filter back to 'any'. */
  clearFilters() {
    return ['room', 'category', 'state'].map((a) => this.setFilter(a, ANY)).some(Boolean);
  }

  /**
   * Once per render frame (main.js's game observer), paused or not. Rebuilds ONLY when an
   * event marked the list dirty or when the delivery fingerprint moved — see the header.
   */
  frame() {
    if (!this._open) { this.refresh(); return; }
    const sig = this._stateSig();
    if (this._dirty || sig !== this._sig) {
      this._dirty = false;
      this._sig = sig;
      this._build();
    }
    this.refresh();
  }

  /** Visibility is a FUNCTION of (open, suppressed), recomputed rather than toggled, so no
   *  path can leave the card up (the pause card's discipline, pauseScreen.js refresh). */
  refresh() {
    const show = this._open && !this.suppressed();
    if (this.el.hidden === show) this.el.hidden = !show;
  }

  /** The model right now, for a suite and for the run summary. Plain data. */
  view() {
    return manifestView(this.rows(), this.registry, {
      departed: !!this.departed(),
      doorsOff: Number(this.doorsOff()) || 0,
      filters: this.filters,
    });
  }

  /** The rows on screen right now — for a suite (m40 N1/N3). */
  rowEls() { return Array.from(this._list.querySelectorAll('li.mf-row')); }

  destroy() {
    this._unsubscribe();
    window.removeEventListener('keydown', this._key, true);
    window.removeEventListener('keyup', this._keyup, true);
    this.el.remove();
  }

  // ---- internals --------------------------------------------------------------------

  /**
   * THE FACTS WITH NO EVENT OF THEIR OWN, as one short string, compared per frame while the
   * card is open. No DOM, no registry walk beyond one Map lookup per row.
   *
   * The bus carries every change of PLACE — loaded, unloaded, grabbed, released, a phase, a
   * trip, a reset — and those are exactly the marks the subscriptions above take, because
   * place is what rowWhere() answers and rowWhere is the expensive half (a destination-zone
   * test per row and per detached piece). What the bus does NOT carry is the four facts
   * written silently inside the step:
   *
   *   delivered / roomCorrect  stepManifest writes both and emits nothing; ZONE_CHANGED is
   *                            declared in §23.3 and emitted by nothing (KNOWN_ISSUES).
   *   condition                damage.js changes it AT IMPACT (§8.4 wants the mark at impact)
   *                            and only posts DAMAGE_APPLIED when the aggregation window
   *                            closes — a card that waited for the event would print a stale
   *                            percentage for as long as the window stays open.
   *   parts off                disassemble() spawns the pieces; the PART_CHANGED event is
   *                            emitted by the interaction that CALLED it (interact.js), so a
   *                            detach by any other route would be invisible.
   *
   * Rounded to the precision the card actually prints, so a body settling by a thousandth of
   * a condition point does not rebuild anything.
   */
  _stateSig() {
    const rows = this.rows() || [];
    let out = `${rows.length}`;
    for (const row of rows) {
      const e = row.entityId && this.registry ? this.registry.get(row.entityId) : null;
      const s = e && e.state;
      const c = s && Number.isFinite(s.condition) ? s.condition : 100;
      out += `|${row.delivered ? 1 : 0}${row.roomCorrect ? 1 : 0}` +
             `${s && (s.held || (s.grips || []).length) ? 1 : 0}${s && s.loaded ? 1 : 0}` +
             `:${c.toFixed(MANIFEST_VIEW.conditionDecimals)}:${partsOffCount(e)}`;
    }
    return out;
  }

  _subscribe() {
    if (!this.bus || this._offs.length) return;
    const mark = () => { this._dirty = true; };
    for (const type of [EVENTS.CARGO_STATE, EVENTS.GRIP_STARTED, EVENTS.GRIP_ENDED,
                        EVENTS.PART_CHANGED, EVENTS.DAMAGE_APPLIED, EVENTS.DOOR_STATE,
                        EVENTS.CONTRACT_PHASE, EVENTS.SIM_RESET]) {
      this._offs.push(this.bus.on(type, mark));
    }
  }

  _unsubscribe() {
    for (const off of this._offs) { try { off(); } catch (e) { /* already gone */ } }
    this._offs.length = 0;
  }

  /** The filter chips. Built ONCE, from the shipped zone and state tables plus whatever
   *  categories this contract's defs carry, so opening the card adds no elements. */
  _buildFilters() {
    const v = manifestView(this.rows(), this.registry, { filters: this.filters });
    const group = (axis, label, opts) => `
      <div class="mf-frow">
        <span class="mf-fl">${esc(label)}</span>
        <span class="mf-fopts">${opts.map((o) =>
          `<button type="button" class="mf-chip" data-filter="${esc(axis)}" data-value="${esc(o.id)}" aria-pressed="false">${esc(o.label)}</button>`).join('')}</span>
      </div>`;
    this._filters.innerHTML =
      group('room', 'Room', v.options.room) +
      group('category', 'Kind', v.options.category) +
      group('state', 'State', v.options.state);
    this._chips = Array.from(this._filters.querySelectorAll('.mf-chip'));
  }

  /** Rebuild the list from state. Counted — this is the number m40 N2 pins. */
  _build() {
    this.rebuilds++;
    const v = this.view();
    const html = v.shown.map((r) => `
      <li class="mf-row" data-row="${esc(r.id)}" data-state="${esc(r.state)}" data-room="${esc(r.roomId)}" data-cat="${esc(r.category)}">
        <span class="mf-name">${esc(r.name)}</span>
        <span class="mf-room">to the ${esc(r.room)}</span>
        <span class="mf-state">${esc(r.stateLabel)}</span>
        <span class="mf-cond">${esc(r.conditionWord)} ${esc(r.conditionPct)}</span>
        <span class="mf-tokens">${r.tokens.map((t) =>
          `<span class="mf-t t-${esc(t.id)}">${esc(t.text)}</span>`).join('')}</span>
      </li>`).join('');
    if (html !== this._listHtml) { this._listHtml = html; this._list.innerHTML = html; }
    this._empty.hidden = v.shown.length > 0;

    const count = v.shown.length === v.all.length
      ? `${v.all.length} rows`
      : `${v.shown.length} of ${v.all.length} rows`;
    if (this._count.textContent !== count) this._count.textContent = count;

    const foot = v.truncated > 0 ? `${v.footer.text} · ${v.truncated} more not listed` : v.footer.text;
    if (foot !== this._footHtml) { this._footHtml = foot; this._foot.textContent = foot; }

    for (const chip of this._chips || []) {
      const on = this.filters[chip.dataset.filter] === chip.dataset.value;
      if (chip.classList.contains('on') !== on) chip.classList.toggle('on', on);
      const s = on ? 'true' : 'false';
      if (chip.getAttribute('aria-pressed') !== s) chip.setAttribute('aria-pressed', s);
    }
  }
}

/** Has the truck left the old house on this contract? 'at pickup' and 'left at the old house'
 *  are the same PLACE and different news, and this is the line between them: a second trip has
 *  begun, or the phase has moved past PICKUP. Pure, so main.js hands it state and nothing
 *  else. */
export function hasDeparted(state) {
  if (!state) return false;
  if ((state.tripCount || 1) > 1) return true;
  return state.phase !== PHASES.PICKUP && state.phase !== PHASES.BRIEFING;
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
