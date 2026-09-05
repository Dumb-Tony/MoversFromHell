/* The settlement screen — GDD §15.1, §15.2, §15.3, §21.2, §26.5.
 *
 * §15.2 sets two hard rules and this file exists to obey them:
 *
 *   "The letter grade summarizes the invoice but NEVER HIDES IT."
 *      -> the grade and every line item are on screen together. There is no summary view to
 *         expand, and no way to reach the grade without the arithmetic beside it.
 *   "NEGATIVE PROFIT STILL COMPLETES THE JOB."
 *      -> a loss renders exactly like a profit, in the same layout, with the same review and
 *         the same replay button. It is red, and it is not a failure screen.
 *
 * §15.3's contribution stats go underneath and are explicitly lighthearted: "avoid rewarding
 * selfish handling or deliberate damage", so nothing here is ranked, scored or compared
 * between movers.
 *
 * Until Phase 11 this panel existed only inside the Phase 10 SCREENSHOT SCRIPT — every number
 * was real and none of it was in the build. That was the honest thing to do at the time and
 * the wrong thing to leave.
 *
 * Phase 11 build-side M6 adds the instrumentation under the stats: the §27.3 questionnaire
 * (questionnaire.js), a Copy button that exports the run's record as pretty JSON (§22.5,
 * §27.4 "human-readable") with a textarea fallback for a denied clipboard (the select()
 * pattern from SmallTownEmergencyServices\src\ui\hud.js), and the 'clear responses' button
 * that empties the save's kept runs (§27.4 "deletable"). Local only — no request leaves.
 *
 * Phase 11 build-side M24 — §21.2's three settlement sentences:
 *
 *   "Invoice animates major lines, then exposes a complete static breakdown."
 *      -> THE REVEAL. The sheet is built complete, then shown in two parts: the major lines
 *         (INVOICE.reveal.majors — each a GROUP of the sheet's own line kinds, summed, and
 *         PROFIT last) land one per INVOICE.reveal.stepMs of WALL time with a count-up, and
 *         only then does the breakdown below expand. Presentation over invoice.js's lines,
 *         never a second calculation: a major line's amount is the sum of the `.line`
 *         amounts it groups, and the count-up's last frame IS the final amount (m31 V1). The
 *         clock is injectable (`this.clock`) because the harness freezes performance.now()
 *         (KNOWN_ISSUES Phase 18), and the reveal is OFF on the harness's scratch pages
 *         (revealEnabledFrom, DEBUG.invoiceRevealInHarness) so every settlement assertion
 *         written before it reads the final state the instant settle() returns (m31 V3).
 *         Space / Enter / a click / any pad button skips to the final state (m31 V2).
 *   "Event recap uses actual logged events."
 *      -> recapFrom(): the 'What happened' list is built from the run recorder's events
 *         (runLog.js, M6) — the door that came off, the legs, the drops, the worst damage,
 *         the wall, the road, the callouts — each with its sim-time stamp and the seat, capped
 *         by INVOICE.recapMax / recapPerKind. Every entry carries `ref`, its index in
 *         runSummary().events, so a reader can find the event it names (m31 R1).
 *   "A retry keeps settings and optionally preserves loadout."
 *      -> settings are shell state and survive a restart by construction (m31 R2 asserts it);
 *         the 'keep the tools on the truck' box hands { keepLoadout } to onReplay, which
 *         main.js resetContract honours for the tools inside the cargo box.
 *
 * Phase 11 build-side M31 finishes M24's own list of gaps (KNOWN_ISSUES Phase 26):
 *   THE SEAT COLUMN     recapFrom read `by` from the start and only the doors carried one, so
 *                       'legs off', the damage rows and the property rows were blank whoever
 *                       did them. interact.js and damage.js name the actor now; a row with no
 *                       actor (a thrown box, a road event) still prints nothing, on purpose.
 *   THE REVEAL'S SWITCH revealEnabledWith() is the page rule AND the settings card's row
 *                       (shell.invoiceReveal), with `?reveal=on|off` still winning over both
 *                       for the screenshot path.
 *   ONE KEEP-LOADOUT BOX  the sheet's box is a view of the shell key the pause card's Restart
 *                       reads, so the two restarts agree and the choice is remembered.
 */

import { Questionnaire, questionnaireHtml } from './questionnaire.js';
import { INVOICE, DEBUG } from '../config.js';
import { EVENTS } from '../core/eventBus.js';

const HARNESS_PAGE = /_smoketest-\d+\.html$/i;

/**
 * Should the sheet ANIMATE its major lines here? `?reveal=off` never, `?reveal=on` always;
 * otherwise everywhere but the harness's scratch page (`_smoketest-<port>.html`), where only
 * DEBUG.invoiceRevealInHarness turns it on. Pure — the suite pins the table (m31 V3).
 */
export function revealEnabledFrom(search = '', pathname = '', allowInHarness = DEBUG.invoiceRevealInHarness) {
  try {
    const q = revealQuery(search);
    if (q != null) return q;
    return !HARNESS_PAGE.test(String(pathname || '')) || !!allowInHarness;
  } catch (e) { return false; }
}

/** `?reveal=on|1` -> true, `?reveal=off|0` -> false, anything else (and any failure) -> null. */
function revealQuery(search) {
  try {
    const q = new URLSearchParams(search || '').get('reveal');
    if (q === 'off' || q === '0') return false;
    if (q === 'on' || q === '1') return true;
    return null;
  } catch (e) { return null; }
}

/**
 * THE SWITCH, whole (M31; §21.4 Motion "a switch for anything that animates"). The page rule
 * above says whether this PAGE may animate; `shellOn` is the settings card's row (the shell
 * key `invoiceReveal`, whose own default follows prefers-reduced-motion — save.js). Both must
 * agree, EXCEPT that an explicit `?reveal=on|off` still wins over both, because that parameter
 * is the screenshot path and a screenshot script cannot tick a box.
 *
 * Pure, so the suite can pin the whole table without a reboot (m38 F3).
 * @param {boolean} shellOn  shell.invoiceReveal
 */
export function revealEnabledWith(shellOn, search = '', pathname = '', allowInHarness = DEBUG.invoiceRevealInHarness) {
  const q = revealQuery(search);
  if (q != null) return q;
  return revealEnabledFrom(search, pathname, allowInHarness) && !!shellOn;
}

/** (n < 0 ? '−' : '') + |n| to the cent — the sheet's one number format. */
const money = (n) => (n < 0 ? '−' : '') + Math.abs(n).toFixed(2);

/** Monotone ease for the count-up: 1 − (1 − u)³, u in [0, 1]. Strictly increasing, 1 at 1. */
const ease = (u) => 1 - Math.pow(1 - Math.min(1, Math.max(0, u)), 3);

/**
 * The §21.2 MAJOR LINES of an invoice: one entry per INVOICE.reveal.majors group that has at
 * least one line on the sheet, its amount the SUM of those lines' amounts (invoice.js wrote
 * them; nothing is recomputed), then PROFIT (invoice.profit) last. Pure; exported so the
 * suite can build the expected steps from the same table (m31 V1).
 * @returns {{id, label, amount, kinds: string[], profit: boolean}[]}
 */
export function majorsFrom(invoice, cfg = INVOICE.reveal) {
  const lines = (invoice && invoice.lines) || [];
  const out = [];
  for (const g of cfg.majors) {
    const mine = lines.filter((l) => g.kinds.includes(l.kind));
    if (!mine.length) continue;
    const amount = Number(mine.reduce((s, l) => s + l.amount, 0).toFixed(2));
    out.push({ id: g.id, label: g.label, amount, kinds: mine.map((l) => l.kind), profit: false });
  }
  const profit = invoice ? Number(invoice.profit) : 0;
  out.push({ id: 'profit', label: profit < 0 ? 'LOSS' : 'PROFIT', amount: profit, kinds: [], profit: true });
  return out;
}

/** m:ss from sim milliseconds. */
export function stampOf(ms) {
  const s = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * The 'What happened' recap, from the run recorder's events (runLog.js buildRunSummary
 * `events`). ONE classification per event type; the first `perKind` of each kind in time
 * order (damage: the COSTLIEST first — the worst drop is the story), merged by sim stamp and
 * capped at `max`. Every entry names its source: `ref` is the event's index in `events`.
 *
 * @param {object[]} events   stamped bus events, oldest first
 * @param {object} [opts]
 * @param {number} [opts.max]        INVOICE.recapMax
 * @param {number} [opts.perKind]    INVOICE.recapPerKind
 * @param {(id: string) => string} [opts.nameOf]     entity id -> words
 * @param {(id: string) => string} [opts.doorLabel]  door id -> label
 * @param {(id: string) => number} [opts.seatOf]     player/mover id -> seat index or -1
 * @returns {{id: string, ref: number, kind: string, atMs: number, seat: number, text: string}[]}
 */
export function recapFrom(events, opts = {}) {
  const max = Number.isFinite(opts.max) ? opts.max : INVOICE.recapMax;
  const perKind = Number.isFinite(opts.perKind) ? opts.perKind : INVOICE.recapPerKind;
  const nameOf = typeof opts.nameOf === 'function' ? opts.nameOf : (id) => String(id);
  const doorLabel = typeof opts.doorLabel === 'function' ? opts.doorLabel : (id) => String(id);
  const seatOf = typeof opts.seatOf === 'function' ? opts.seatOf : () => -1;
  const seat = (id) => { const s = id == null ? -1 : seatOf(id); return Number.isInteger(s) ? s : -1; };

  const byKind = new Map();
  const list = Array.isArray(events) ? events : [];
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e || typeof e !== 'object') continue;
    const c = classify(e, { nameOf, doorLabel, seat });
    if (!c) continue;
    const entry = { id: `${c.kind}:${i}`, ref: i, kind: c.kind, atMs: Number(e.simTimeMs) || 0, seat: c.seat, text: c.text, rank: c.rank || 0 };
    if (!byKind.has(c.kind)) byKind.set(c.kind, []);
    byKind.get(c.kind).push(entry);
  }
  const picked = [];
  for (const [kind, entries] of byKind) {
    const ordered = kind === 'damage'
      ? entries.slice().sort((a, b) => (b.rank - a.rank) || (a.ref - b.ref))
      : entries;
    for (const en of ordered.slice(0, perKind)) picked.push(en);
  }
  picked.sort((a, b) => (a.atMs - b.atMs) || (a.ref - b.ref));
  return picked.slice(0, Math.max(0, max)).map(({ rank, ...rest }) => { void rank; return rest; });
}

/** One event -> { kind, text, seat, rank } or null (the kinds §21.2's recap cares about). */
function classify(e, h) {
  switch (e.type) {
    case EVENTS.DOOR_STATE:
      if (e.state === 'removed') return { kind: 'door', text: `door off its hinges — ${h.doorLabel(e.doorId)}`, seat: h.seat(e.by) };
      if (e.state === 'forced') return { kind: 'door', text: `door forced — ${h.doorLabel(e.doorId)}`, seat: h.seat(e.by) };
      return null;
    case EVENTS.PART_CHANGED:
      // M31: interact.js now names the mover who turned the screwdriver, so `by` is a seat and
      // no longer the blank column M24 recorded (KNOWN_ISSUES Phase 26, gap 2).
      if (e.action === 'removed') return { kind: 'part', text: `${e.part} off — ${h.nameOf(e.entityId)}`, seat: h.seat(e.by) };
      return null;
    case EVENTS.GRIP_ENDED:
      if (!e.reason || e.reason === 'released' || e.reason === 'contract reset') return null;
      return { kind: 'drop', text: `${h.nameOf(e.entityId)} dropped (${e.reason})`, seat: h.seat(e.playerId) };
    case EVENTS.DAMAGE_APPLIED: {
      const cost = Number(e.cost) || 0;
      if (e.category === 'property') {
        /* §15.3 "who was holding it" (M26). heldBy is M14's shape and M23 kept it: ONE ENTRY
         * PER HAND, so a two-hand shove reads ['p0','p0'] — the seat column wants the first
         * holder, not the count. Empty (a thrown object) stays the blank column M24 recorded
         * as an open item: nobody was carrying it, so no seat is named. */
        const by = e.by != null ? e.by : (Array.isArray(e.heldBy) ? e.heldBy.find((id) => id != null) : null);
        /* M30: the ONE line on which a surface reached DAMAGE.property.maxChargePerSurface —
         * its charge was trimmed to the room that was left, and every later hit on it is
         * free (EVENTS.PROPERTY_CAPPED, no line). Exactly one line per surface is ever
         * trimmed, so the sheet says it exactly once, and only when it happened. */
        return { kind: 'property', text: `${e.location || e.surfaceId || 'a surface'} marked by ${h.nameOf(e.entityId)} — ${money(cost)}${e.capped ? ' (capped)' : ''}`,
                 seat: by == null ? -1 : h.seat(by), rank: cost };
      }
      /* M31: an ITEM's damage names its holder too, from the same `by` (damage.js holderOf —
       * heldBy at the window's first contact). A drop, a throw and a shelf collapse have
       * nobody's hands on them and keep the blank column: that is the honest answer, not a
       * missing one, and §15.3 forbids turning either into a score. */
      return { kind: 'damage', text: `${h.nameOf(e.entityId)} ${e.band || 'damaged'} — ${money(cost)}`, seat: h.seat(e.by), rank: cost };
    }
    case EVENTS.ROAD_FORCE:
      return { kind: 'road', text: `${e.label || e.roadType || 'road event'} — cargo rode it out`, seat: -1 };
    case EVENTS.RECOVERY:
      return { kind: 'recovery', text: `recovery callout — ${h.nameOf(e.entityId)}${e.reason ? ` (${e.reason})` : ''}`, seat: h.seat(e.entityId) };
    default:
      return null;
  }
}

export class InvoiceScreen {
  constructor(root) {
    this.el = document.createElement('div');
    this.el.id = 'settlement';
    this.el.hidden = true;
    root.appendChild(this.el);
    this.visible = false;
    /** main.js: replay. Called with { keepLoadout } from the sheet's checkbox (M24). */
    this.onReplay = null;
    /** main.js: empty the save's kept runs (§27.4 "deletable"). Returns nothing. */
    this.onClearRuns = null;
    this.questionnaire = new Questionnaire();
    /** The settled run's record (runLog.js buildRunSummary), from show() until clearRun(). */
    this._runSummary = null;

    /* ---- the §21.2 reveal (M24) ------------------------------------------------------
     * `revealEnabled` is the switch main.js sets from revealEnabledFrom() and reduced
     * motion; a suite flips it. `clock` is the injectable wall clock: now() in ms, later(fn,
     * ms) -> handle, cancel(handle). The harness freezes performance.now(), so a suite
     * installs its own and drives revealTick() by hand (m31 V1). */
    this.revealEnabled = false;
    this.clock = {
      now: () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()),
      later: (fn, ms) => setTimeout(fn, ms),
      cancel: (h) => clearTimeout(h),
    };
    this._reveal = null;
    /** main.js sets this true when resetContract honours { keepLoadout }; false disables
     *  the box and its title says why (the brief's honest fallback). */
    this.loadoutHook = false;
    /* M31: the box is the SHELL KEY's view, not its own state — the pause card's Restart has
     * the same box against the same key, so the two restarts cannot disagree about the tools
     * (KNOWN_ISSUES Phase 26, M24 gap 4). `keepLoadoutDefault` reads the key when the sheet is
     * built; `onKeepLoadout` writes it when a player ticks the box. Both default to the M24
     * behaviour — a box that starts unticked and remembers nothing — so an InvoiceScreen built
     * without a shell (a suite's) is exactly what it was. */
    this.keepLoadoutDefault = () => false;
    this.onKeepLoadout = null;
    this.el.addEventListener('change', (e) => {
      const box = e.target;
      if (!box || !box.classList || !box.classList.contains('keep-loadout')) return;
      if (this.onKeepLoadout) this.onKeepLoadout(!!box.checked);
    });

    // The screen is the one place the UI layer accepts input, so it opts back in — #ui is
    // pointer-events:none precisely so a panel can never swallow a grip (§21.1).
    this.el.style.pointerEvents = 'auto';
    this.el.addEventListener('click', (e) => {
      // Any click while the major lines are still landing: land them all (§21.2 skip).
      if (this.revealing) { this.skipReveal(); return; }
      const btn = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
      const act = btn ? btn.dataset.act : null;
      if (act === 'replay' && this.onReplay) this.onReplay({ keepLoadout: this.keepLoadout() });
      else if (act === 'copy') this.copy();
      else if (act === 'skip') this.questionnaire.skip();
      else if (act === 'clear-runs') {
        if (this.onClearRuns) this.onClearRuns();
        this.setKeptCount(0);
      }
    });
    /* The skip KEY — M3's card-key discipline: the card that owns the moment consumes the
     * key. Capture phase on window, so Input (which listens on window too) never sees a Space
     * that was a "show me the numbers" and not a jump; Escape is left alone (it is the
     * shell's). Only while revealing — afterwards the sheet's keys are the form's (M6). */
    this._skipKey = (e) => {
      if (!this.revealing) return;
      if (e.code === 'Space' || e.code === 'Enter' || e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.skipReveal();
      }
    };
    window.addEventListener('keydown', this._skipKey, true);
  }

  /** The record the Copy button exports: the settled summary with the LIVE answers. Null
   *  before a settlement or after clearRun(). */
  report() {
    if (!this._runSummary) return null;
    return { ...this._runSummary, questionnaire: this.questionnaire.answers() };
  }

  /** Pretty-printed, so the file a tester pastes into a report is readable (§27.4). */
  exportText() {
    const r = this.report();
    return r ? JSON.stringify(r, null, 2) : '';
  }

  /**
   * Put the report into the textarea and on the clipboard. The textarea is filled FIRST, so
   * the text exists whether or not the clipboard is allowed (headless, http, a denied
   * permission): a refused write unhides it, selected, with a note saying to copy by hand.
   */
  copy() {
    const ta = this.el.querySelector('textarea.export');
    const note = this.el.querySelector('.copy-note');
    const text = this.exportText();
    if (!ta) return text;
    ta.value = text;
    const fallback = (why) => {
      ta.hidden = false;
      try { ta.focus(); ta.select(); } catch (e) { /* no selection API in this context */ }
      if (note) note.textContent = why || 'clipboard refused — the report is selected below, copy it by hand';
    };
    let p = null;
    try {
      p = (navigator.clipboard && navigator.clipboard.writeText) ? navigator.clipboard.writeText(text) : null;
    } catch (e) { p = null; }
    if (p && typeof p.then === 'function') {
      p.then(() => { if (note) note.textContent = `copied — ${text.length} characters of JSON`; ta.hidden = false; })
       .catch(() => fallback());
    } else {
      fallback();
    }
    return text;
  }

  setKeptCount(n) {
    const k = this.el.querySelector('.kept span');
    if (k) k.textContent = keptLine(n);
  }

  /** Forget the settled record and the form — resetContract calls it after reading both. */
  clearRun() {
    this._runSummary = null;
    this.questionnaire.clear();
  }

  /** The 'keep the tools on the truck' box, as ticked right now (false when absent/disabled). */
  keepLoadout() {
    const box = this.el.querySelector('input.keep-loadout');
    return !!(box && !box.disabled && box.checked);
  }

  /** True while the major lines are still landing (the breakdown is folded). */
  get revealing() { return !!(this._reveal && !this._reveal.done); }

  /** How long the reveal takes on the clock, ms: every step plus the last count-up. 0 when
   *  nothing is revealing. */
  revealDurationMs() {
    if (!this._reveal) return 0;
    return this._reveal.steps.length * INVOICE.reveal.stepMs + INVOICE.reveal.countMs;
  }

  /**
   * @param {object} invoice  buildInvoice()
   * @param {object} review   reviewFor()
   * @param {object} summary  manifestSummary()
   * @param {object} stats    contributionStats()
   * @param {object} [extras]
   * @param {object|null} [extras.best]  §13.4's saved best invoice BEFORE this run
   *        ({profit, grade, build}), from src/core/save.js — null on a fresh machine
   * @param {boolean} [extras.isBest]  this run beat it (or is the first)
   * @param {object|null} [extras.runSummary]  runLog.js buildRunSummary() for THIS run —
   *        what the Copy button exports, with the questionnaire's answers merged in; its
   *        `events` are what the recap is built from (M24)
   * @param {number} [extras.keptRuns]  how many past runs the save holds right now
   * @param {(id: string) => string} [extras.nameOf]     recap: entity id -> words (M24)
   * @param {(id: string) => string} [extras.doorLabel]  recap: door id -> label (M24)
   * @param {(id: string) => number} [extras.seatOf]     recap: player id -> seat or -1 (M24)
   * @param {string} [extras.contractId]  the head's contract name (state.contractId)
   */
  show(invoice, review, summary, stats, extras = {}) {
    this._cancelReveal();
    this._runSummary = extras.runSummary || null;
    this.questionnaire.clear();

    /* §27.3 / §27.4 under the stats: the questions, the export, the kept-run count. Shown
     * whenever there is a record to export; a settle() with no summary (a bare test call)
     * gets the questions all the same, so a tester can never lose them to a wiring gap. */
    const keptCount = Number.isFinite(extras.keptRuns) ? extras.keptRuns : 0;
    const telemetry = `
      <div class="telemetry">
        ${questionnaireHtml()}
        <div class="export-row">
          <button type="button" class="minor" data-act="copy">Copy run report (JSON)</button>
          <span class="copy-note">phases, grips, drops, damage, straps, cargo shift, your answers — stays on this machine</span>
          <a class="evidence" href="docs/evidence.html" target="_blank" rel="noopener"
             style="color: var(--violet)" title="paste run reports, read the §26.7 gate as a table">open the evidence page ↗</a>
        </div>
        <textarea class="export" hidden spellcheck="false" aria-label="run report"></textarea>
        <div class="kept"><span>${esc(keptLine(keptCount))}</span>
          <button type="button" class="minor" data-act="clear-runs">clear responses</button></div>
      </div>`;

    /* The one number that persists between runs (§13.4 "saved best invoice", §21.2 replay).
     * Words, not a medal: a loss can still be the best so far, and §15.2 says the sheet is
     * the same sheet either way. */
    const best = extras.best || null;
    let bestLine = '';
    if (extras.isBest && best) bestLine = `new best so far — was ${money(best.profit)} (${esc(best.grade)})`;
    else if (extras.isBest) bestLine = 'first settlement on this machine — kept as the best so far';
    else if (best) bestLine = `best so far ${money(best.profit)} (${esc(best.grade)}) · ${esc(best.build)}`;

    const rows = invoice.lines.map((l) => `
      <div class="line ${l.amount < 0 ? 'out' : 'in'}">
        <span class="kind">${esc(l.kind)}<span class="detail">${esc(l.detail)}</span></span>
        <span class="amt">${money(l.amount)}</span>
      </div>`).join('');

    /* §21.2's MAJOR LINES (M24): the groups, summed from the rows above, PROFIT last. Built
     * complete and final here; the reveal only decides WHEN each becomes visible. */
    const majors = majorsFrom(invoice);
    const majorRows = majors.map((m, i) => `
      <div class="mline ${m.profit ? (m.amount < 0 ? 'profit loss' : 'profit gain') : (m.amount < 0 ? 'out' : 'in')}"
           data-major="${esc(m.id)}" data-step="${i + 1}" data-final="${m.amount.toFixed(2)}">
        <span class="mkind">${esc(m.label)}</span>
        <span class="mamt">${money(m.amount)}</span>
      </div>`).join('');

    /* §15.3's stats. Counts of what was done, never a leaderboard. */
    const statRows = [
      ['items delivered', `${stats.itemsDelivered}`],
      ['straps placed', `${stats.strapsPlaced}`],
      ['recovery callouts', `${stats.recoveries}`],
      ['damage events', `${stats.damageEvents}`],
      ['surfaces marked', `${stats.propertyEvents || 0}`],
      ['heaviest thing moved', `${Math.round(stats.heaviestMoved)} kg`],
      ['trips', `${stats.trips}`],
    ].map(([k, v]) => `<div class="stat"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');

    /* §21.2 "event recap uses actual logged events" (M24): from the run record's events —
     * the same list the Copy button exports — never a second log. */
    const recap = recapFrom((this._runSummary && this._runSummary.events) || [], {
      nameOf: extras.nameOf, doorLabel: extras.doorLabel, seatOf: extras.seatOf,
    });
    const recapItems = recap.map((r) => `
      <li class="recap-item" data-kind="${esc(r.kind)}" data-ref="${r.ref}" data-at="${r.atMs}" data-seat="${r.seat}">
        <span class="t">${esc(stampOf(r.atMs))}</span><span class="s">${r.seat >= 0 ? `P${r.seat + 1}` : ''}</span><span class="x">${esc(r.text)}</span>
      </li>`).join('');
    const recapHtml = `
      <div class="recap">
        <div class="rhead">What happened</div>
        <ul class="recap-list">${recapItems}</ul>
        ${recap.length ? '' : '<div class="recap-note">nothing notable — a quiet job</div>'}
      </div>`;

    /* §21.2 "optionally preserves loadout" (M24): the tools that are in the cargo box stay
     * there for the next run. Disabled, and the title says why, when main.js has not wired
     * the hook — never a box that does nothing. */
    const keepTicked = !!(this.loadoutHook && this.keepLoadoutDefault());
    const keepBox = this.loadoutHook
      ? `<input type="checkbox" class="keep-loadout"${keepTicked ? ' checked' : ''}>`
      : '<input type="checkbox" class="keep-loadout" disabled title="keep loadout is not wired: resetContract puts every tool back at its rack">';

    const loss = invoice.profit < 0;
    const contractId = extras.contractId || 'suburban_starter';
    this.el.innerHTML = `
      <div class="sheet">
        <div class="head">
          <div class="title">INVOICE</div>
          <div class="sub">${esc(contractId)} · ${summary.delivered}/${summary.total} delivered
            · ${summary.roomCorrect} in the right room</div>
        </div>

        <div class="majors">${majorRows}</div>

        <div class="breakdown">
          <div class="lines">${rows}</div>

          <div class="total ${loss ? 'loss' : 'gain'}">
            <span>${loss ? 'LOSS' : 'PROFIT'}</span>
            <span class="amt">${money(invoice.profit)}</span>
          </div>
          <div class="best${extras.isBest ? ' new' : ''}">${bestLine}</div>

          <div class="grade">
            <span class="letter g-${invoice.grade.letter}">${invoice.grade.letter}</span>
            <span class="score">${invoice.grade.score} / 100 · margin
              ${(invoice.grade.margin * 100).toFixed(0)}%</span>
          </div>

          <div class="review">
            <div class="quote">“${esc(review.text)}”</div>
            <div class="tags">${review.tags.map((t) => `<span>${esc(t)}</span>`).join('')}</div>
          </div>

          ${recapHtml}

          <div class="stats">${statRows}</div>
          ${telemetry}

          <label class="keep">${keepBox} keep the tools on the truck for the next run — remembered, and the pause card's Restart reads the same box</label>
          <button class="replay" data-act="replay">Run it again</button>
          <div class="foot">${loss
            ? 'A loss still completes the job (§15.2). Nothing here is a failure state.'
            : 'Every line above names the events it came from.'}</div>
        </div>
      </div>`;

    this.questionnaire.mount(this.el);
    /* The export textarea and the buttons live OUTSIDE the form, so the block as a whole
     * swallows its keys too — Input, the title and the settings card listen on window, and an
     * Escape typed into the report would otherwise unpause the game under the sheet (Q5b). */
    const block = this.el.querySelector('.telemetry');
    if (block) for (const type of ['keydown', 'keyup', 'keypress']) block.addEventListener(type, (e) => e.stopPropagation());
    this.el.hidden = false;
    this.visible = true;

    const steps = [...this.el.querySelectorAll('.majors .mline')].map((el) => ({
      el, amtEl: el.querySelector('.mamt'), amount: Number(el.dataset.final),
    }));
    if (this.revealEnabled && steps.length) this._startReveal(steps);
    else this._reveal = null;   // the final state, as built: every line visible, breakdown open
  }

  /* ---- the reveal ---------------------------------------------------------------------- */

  _startReveal(steps) {
    const sheet = this.el.querySelector('.sheet');
    const breakdown = this.el.querySelector('.breakdown');
    this._reveal = { steps, breakdown, sheet, t0: this.clock.now(), done: false, timer: null };
    if (sheet) sheet.classList.add('revealing');
    if (breakdown) breakdown.hidden = true;
    this._renderReveal(0);
    this._schedule();
  }

  _schedule() {
    const r = this._reveal;
    if (!r || r.done) return;
    r.timer = this.clock.later(() => { r.timer = null; this.revealTick(); }, INVOICE.reveal.tickMs);
  }

  /** One redraw from the clock: what the sheet shows `now − t0` ms into the reveal. A suite
   *  with its own clock calls this after advancing it (m31 V1). */
  revealTick() {
    const r = this._reveal;
    if (!r || r.done) return false;
    if (this.el.hidden) { this._cancelReveal(); return false; }
    const t = this.clock.now() - r.t0;
    this._renderReveal(t);
    if (t >= this.revealDurationMs()) this._finishReveal();
    else this._schedule();
    return true;
  }

  /** The reveal's state at wall time t (ms since show): step k lands at k × stepMs and
   *  counts up over countMs — an eased, monotone value that ends EXACTLY on the final. */
  _renderReveal(t) {
    const r = this._reveal;
    if (!r) return;
    const { stepMs, countMs } = INVOICE.reveal;
    for (let k = 0; k < r.steps.length; k++) {
      const s = r.steps[k];
      const at = (k + 1) * stepMs;
      if (t < at) { s.el.hidden = true; continue; }
      s.el.hidden = false;
      const u = countMs > 0 ? (t - at) / countMs : 1;
      s.amtEl.textContent = money(u >= 1 ? s.amount : s.amount * ease(u));
    }
  }

  _finishReveal() {
    const r = this._reveal;
    if (!r) return;
    if (r.timer != null) { this.clock.cancel(r.timer); r.timer = null; }
    for (const s of r.steps) { s.el.hidden = false; s.amtEl.textContent = money(s.amount); }
    if (r.breakdown) r.breakdown.hidden = false;
    if (r.sheet) r.sheet.classList.remove('revealing');
    r.done = true;
  }

  _cancelReveal() {
    const r = this._reveal;
    if (r && r.timer != null) { this.clock.cancel(r.timer); r.timer = null; }
    if (r) r.done = true;
    this._reveal = null;
  }

  /** Land every major line and open the breakdown now. Returns true if there was a reveal
   *  to skip. Space / Enter / a click / any pad button (main.js's shell observer) call it. */
  skipReveal() {
    if (!this.revealing) return false;
    this._finishReveal();
    return true;
  }

  hide() {
    this._cancelReveal();
    this.el.hidden = true;
    this.visible = false;
  }
}

function keptLine(n) {
  return n === 0 ? 'no past runs kept on this device'
    : `${n} past run${n === 1 ? '' : 's'} kept on this device (answers included) — nothing is uploaded`;
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
