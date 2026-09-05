/* Title card — GDD §21.2, §13.4 ("a compact job-start screen rather than a full HQ").
 *
 * The build dropped you straight into a live world with a line of control hints along the
 * bottom. Everything worked; nothing had started. A game you can be READY to play needs a
 * moment before it, where it tells you what it is and you choose to begin — which is also
 * the only honest place to put "two people can play this", since F2 in a hint bar is a
 * feature nobody discovers.
 *
 * IT DOES NOT PAUSE THE SIMULATION, deliberately, for two reasons. The world behind it is
 * the best screenshot the game has and it should be moving. And the twelve test suites drive
 * `game.frame()` directly and never click anything — a title screen that gated the clock
 * would hang every one of them, which is exactly the kind of coupling §22.2 warns about
 * when it puts UI on the far side of the state boundary.
 *
 * §13.4 caps the ambition: "a compact job-start screen", not a menu system. One button.
 *
 * STARTS ON Enter, Space, a click, or pad A (§25.3 — the pad path is read by main.js's shell
 * observer while `visible`, because the Gamepad API has no events). Escape used to start it
 * too, and that was a bug rather than a convenience: main.js's shell also read Escape, both
 * listeners sit on window, and one keystroke started the job AND paused it.
 *
 * THE BRIEF (Phase 11 build-side M24 — §21.2 "Brief shows payout, estimate, distance, manifest
 * profile, access notes, hazards, and optional goals"). The contract is built before this card
 * is shown (main.js sets PICKUP at boot; the title never gates the clock, see above), so the
 * card can READ it: main.js briefFacts() gathers the numbers from state and config and
 * setBrief() renders them — never a prose constant. It is a job sheet pinned BESIDE the card
 * (`#title-screen .brief`, absolutely positioned), not a block inside it: the card is centred
 * vertically, so anything added inside it moves the START button and the controls list by
 * half its height, and m31 B2 pins both rects to the pixel. On a viewport too narrow for the
 * pair the sheet drops under the card (styles.css).
 */

import { BUILD } from '../config.js';

/** The words every prompt uses for a def id: 'couch_3seat_01' -> 'couch 3seat' (invoice.js). */
const wordsOf = (id) => String(id || '').replace(/_\d+$/, '').replace(/_/g, ' ');
const km = (n) => (Math.round(n * 10) / 10).toFixed(1);
const m = (n) => Number(n).toFixed(2);
const money = (n) => (n < 0 ? '−' : '') + Math.abs(n).toFixed(2);

/**
 * The brief as HTML, from main.js briefFacts(). PURE — exported so a suite can render a
 * synthetic best (m31 B1) and so the markup has one home. Every row carries its number as a
 * data attribute, so the suite asserts values, not prose.
 * @param {object} f  see main.js briefFacts()
 */
export function briefHtml(f) {
  if (!f) return '';
  const man = f.manifest || {};
  const cats = Object.entries(man.byCategory || {}).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const handling = Object.entries(man.handling || {}).sort((a, b) => b[1] - a[1]);
  /* One line per hung door: its label and the clear width WITH the leaf on (house.js
   *  hungClear); the leaf's thickness is the shared note under them. */
  const doors = (f.doors || []).map((d) => `
      <div class="brow bdoor" data-door="${esc(d.id)}" data-clear="${esc(m(d.clear))}" data-gap="${esc(m(d.gap))}">
        <span>${esc(d.label)}</span><b>${esc(m(d.clear))} m</b></div>`).join('');
  const leafT = (f.doors || []).find((d) => d.gap > d.clear);
  const leafNote = leafT ? `<div class="btext bleaf" data-leaf="${esc(m(leafT.gap - leafT.clear))}">a door off its hinges frees ${esc(m(leafT.gap - leafT.clear))} m of that</div>` : '';
  /* What does NOT fit its route intact, and what the screwdriver makes of it (§7.1, §3.3). */
  const prep = (f.prep || []).map((p) => `
      <div class="btext bprep" data-def="${esc(p.defId)}" data-part="${esc(p.part)}" data-door="${esc(p.doorId)}"
           data-intact="${p.intactFits ? 1 : 0}" data-off="${p.offFits ? 1 : 0}" data-off-clearance="${esc(m(p.offClearance))}">
        ${esc(p.name)} vs ${esc(p.doorLabel)} ${esc(m(p.doorM))} m: ${p.intactFits
          ? `fits intact by ${esc(m(p.intactClearance))} m`
          : `${esc(p.part)} off ${p.offFits ? `fits by ${esc(m(p.offClearance))} m` : 'still no fit'}`}</div>`).join('');
  const hazards = (f.hazards || []).map((h) => `
      <div class="btext bhaz" data-type="${esc(h.type)}" data-at="${esc(h.at)}">${esc(h.label)} — <b>${esc(wordsOfType(h.type))}</b> at ${esc(h.at)} s</div>`).join('');
  const tight = f.tightest ? `
      <div class="btext bhaz" data-type="door" data-door="${esc(f.tightest.id)}" data-clear="${esc(m(f.tightest.clear))}">
        tight door: ${esc(f.tightest.label)} <b>${esc(m(f.tightest.clear))} m</b></div>` : '';
  const g = f.goals || {};
  const best = g.best
    ? `<div class="btext bgoal" data-k="best" data-profit="${esc(Number(g.best.profit).toFixed(2))}" data-grade="${esc(g.best.grade || '')}">
        beat your best: <b>${esc(money(g.best.profit))}</b> (${esc(g.best.grade || '?')})</div>`
    : '<div class="btext bgoal" data-k="best" data-profit="">no best yet — the first settlement sets it</div>';
  return `
    <div class="bhead">THE JOB <span>${esc(f.contractId || '')}</span></div>
    <div class="brow" data-k="payout" data-v="${esc(f.payout)}"><span>payout</span><b>${esc(money(f.payout))}</b></div>
    <div class="brow" data-k="estimate" data-v="${esc(f.estimateMin)}"><span>estimate</span><b>${esc(Math.round(f.estimateMin))} min</b></div>
    <div class="brow" data-k="distance" data-v="${esc(f.distanceKm)}" data-legs="${esc(f.legs)}"><span>distance</span><b>${esc(km(f.distanceKm))} km · ${esc(f.legs)} leg${f.legs === 1 ? '' : 's'}</b></div>
    <div class="bsec">manifest</div>
    <div class="btext bman" data-total="${esc(man.total || 0)}"><b>${esc(man.total || 0)} items</b> · ${cats.map(([c, n]) => `<span class="bcat" data-cat="${esc(c)}" data-n="${n}">${n} ${esc(c)}</span>`).join(', ')}</div>
    ${handling.length ? `<div class="btext bhand">${handling.map(([h, n]) => `<span class="bhandling" data-h="${esc(h)}" data-n="${n}">${n} ${esc(h)}</span>`).join(' · ')}</div>` : ''}
    ${man.heaviest ? `<div class="btext bheavy" data-def="${esc(man.heaviest.defId)}" data-kg="${esc(man.heaviest.mass)}">heaviest: ${esc(man.heaviest.name)} <b>${esc(man.heaviest.mass)} kg</b></div>` : ''}
    <div class="bsec">access — clear widths, doors on</div>${doors}${leafNote}${prep}
    <div class="bsec">hazards</div>${hazards}${tight}
    <div class="bsec">optional</div>
    ${best}
    <div class="btext bgoal" data-k="bonus" data-one-trip="${esc(g.oneTrip)}" data-room="${esc(g.roomAccuracy)}">one trip <b>+${esc(g.oneTrip)}</b> · every room right <b>+${esc(g.roomAccuracy)}</b></div>`;
}

/** 'hardBrake' -> 'hard brake'. */
function wordsOfType(t) { return String(t || '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase(); }

export class TitleScreen {
  constructor(root) {
    this.el = document.createElement('div');
    this.el.id = 'title-screen';
    this.el.innerHTML = `
      <div class="card">
        <div class="plate">
          <div class="name">MOVERS<span>FROM</span>HELL</div>
          <div class="tag">WE MOVE IT · YOU WATCH · SOMETHING BREAKS</div>
        </div>

        <p class="pitch">
          A house to empty, a truck that is a real collision volume, and a doorway your couch
          does not fit through. Everything has weight. Everything you break is on the invoice.
        </p>

        <button class="play" type="button">START THE JOB</button>
        <div class="alt">Enter · Space · <span class="key">A</span> on a controller
          · <button class="settings" type="button" data-act="settings">Settings</button></div>

        <div class="cols">
          <div>
            <h4>One player</h4>
            <ul>
              <li><b>WASD</b> move · <b>Mouse</b> look · <b>Shift</b> sprint / brace</li>
              <li><b>LMB / RMB</b> grab with each hand — two hands is steadier</li>
              <li><b>E</b> use what you are looking at · <b>Q</b> undo it</li>
              <li><b>Tab</b> swap mover · <b>R</b> recover · <b>Space</b> jump</li>
            </ul>
          </div>
          <div>
            <h4>Two players <span class="key">F2</span> or <span class="key">View</span> on a pad</h4>
            <ul>
              <li><b>P1</b> keyboard and mouse, as above</li>
              <li><b>P2</b> a controller, or the arrow keys</li>
              <li>P2 keys: <b>UHJK</b> look · <b>[ ]</b> grab · <b>'</b> use · <b>;</b> undo</li>
              <li>Carry one couch between you — that is the whole idea</li>
            </ul>
          </div>
        </div>

        <div class="foot">
          <span>${esc(BUILD.label)} · ${esc(BUILD.date)}</span>
          <span><b>Esc</b> / <b>Menu</b> pause · <b>F3</b> stats and the metre grid</span>
        </div>
      </div>
      <aside class="brief" aria-label="job brief" hidden></aside>`;
    root.appendChild(this.el);

    /** The facts the brief was last rendered from (main.js briefFacts()); null until set. */
    this.brief = null;
    this.onStart = null;
    /** §21.4: the settings panel is reachable BEFORE the job starts as well as from the pause
     *  card (Phase 11 build-side M4). main.js registers the panel's show(). */
    this.onSettings = null;
    this._done = false;

    const start = () => this.start();
    this.el.querySelector('.play').addEventListener('click', start);
    this.el.querySelector('.settings').addEventListener('click', () => {
      if (this.onSettings) this.onSettings();
    });
    this._key = (e) => {
      if (this._done) return;
      // Enter/Space on the focused Settings button is that button's click, not a start.
      if (e.target && e.target.closest && e.target.closest('button.settings')) return;
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        start();
      }
    };
    window.addEventListener('keydown', this._key);
  }

  get visible() { return !this._done; }

  /** Render §21.2's brief from the facts main.js gathered (briefFacts). Null hides it. */
  setBrief(facts) {
    const el = this.el.querySelector('.brief');
    this.brief = facts || null;
    if (!el) return;
    el.innerHTML = briefHtml(this.brief);
    el.hidden = !this.brief;
  }

  start() {
    if (this._done) return;
    this._done = true;
    this.el.classList.add('gone');
    // Removed from the layout after the fade, so it can never eat a click on the canvas.
    setTimeout(() => { this.el.hidden = true; }, 420);
    window.removeEventListener('keydown', this._key);
    if (this.onStart) this.onStart();
  }
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
