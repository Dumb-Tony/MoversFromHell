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
 */

import { Questionnaire, questionnaireHtml } from './questionnaire.js';

export class InvoiceScreen {
  constructor(root) {
    this.el = document.createElement('div');
    this.el.id = 'settlement';
    this.el.hidden = true;
    root.appendChild(this.el);
    this.visible = false;
    this.onReplay = null;
    /** main.js: empty the save's kept runs (§27.4 "deletable"). Returns nothing. */
    this.onClearRuns = null;
    this.questionnaire = new Questionnaire();
    /** The settled run's record (runLog.js buildRunSummary), from show() until clearRun(). */
    this._runSummary = null;

    // The screen is the one place the UI layer accepts input, so it opts back in — #ui is
    // pointer-events:none precisely so a panel can never swallow a grip (§21.1).
    this.el.style.pointerEvents = 'auto';
    this.el.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
      const act = btn ? btn.dataset.act : null;
      if (act === 'replay' && this.onReplay) this.onReplay();
      else if (act === 'copy') this.copy();
      else if (act === 'skip') this.questionnaire.skip();
      else if (act === 'clear-runs') {
        if (this.onClearRuns) this.onClearRuns();
        this.setKeptCount(0);
      }
    });
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
   *        what the Copy button exports, with the questionnaire's answers merged in
   * @param {number} [extras.keptRuns]  how many past runs the save holds right now
   */
  show(invoice, review, summary, stats, extras = {}) {
    const money = (n) => (n < 0 ? '−' : '') + Math.abs(n).toFixed(2);
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

    const loss = invoice.profit < 0;
    this.el.innerHTML = `
      <div class="sheet">
        <div class="head">
          <div class="title">INVOICE</div>
          <div class="sub">suburban_starter · ${summary.delivered}/${summary.total} delivered
            · ${summary.roomCorrect} in the right room</div>
        </div>

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

        <div class="stats">${statRows}</div>
        ${telemetry}

        <button class="replay" data-act="replay">Run it again</button>
        <div class="foot">${loss
          ? 'A loss still completes the job (§15.2). Nothing here is a failure state.'
          : 'Every line above names the events it came from.'}</div>
      </div>`;

    this.questionnaire.mount(this.el);
    /* The export textarea and the buttons live OUTSIDE the form, so the block as a whole
     * swallows its keys too — Input, the title and the settings card listen on window, and an
     * Escape typed into the report would otherwise unpause the game under the sheet (Q5b). */
    const block = this.el.querySelector('.telemetry');
    if (block) for (const type of ['keydown', 'keyup', 'keypress']) block.addEventListener(type, (e) => e.stopPropagation());
    this.el.hidden = false;
    this.visible = true;
  }

  hide() {
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
