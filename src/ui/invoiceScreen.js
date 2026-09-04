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
 */

export class InvoiceScreen {
  constructor(root) {
    this.el = document.createElement('div');
    this.el.id = 'settlement';
    this.el.hidden = true;
    root.appendChild(this.el);
    this.visible = false;
    this.onReplay = null;

    // The screen is the one place the UI layer accepts input, so it opts back in — #ui is
    // pointer-events:none precisely so a panel can never swallow a grip (§21.1).
    this.el.style.pointerEvents = 'auto';
    this.el.addEventListener('click', (e) => {
      if (e.target && e.target.dataset && e.target.dataset.act === 'replay' && this.onReplay) {
        this.onReplay();
      }
    });
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
   */
  show(invoice, review, summary, stats, extras = {}) {
    const money = (n) => (n < 0 ? '−' : '') + Math.abs(n).toFixed(2);

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

        <button class="replay" data-act="replay">Run it again</button>
        <div class="foot">${loss
          ? 'A loss still completes the job (§15.2). Nothing here is a failure state.'
          : 'Every line above names the events it came from.'}</div>
      </div>`;

    this.el.hidden = false;
    this.visible = true;
  }

  hide() {
    this.el.hidden = true;
    this.visible = false;
  }
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
