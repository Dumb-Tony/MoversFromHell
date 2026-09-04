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
 */

import { BUILD } from '../config.js';

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
      </div>`;
    root.appendChild(this.el);

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
