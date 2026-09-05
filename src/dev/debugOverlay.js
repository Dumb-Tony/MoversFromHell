/* Developer overlay — GDD §22.5.
 *
 * §22.5 asks for "FPS, physics time, bodies, constraints, contacts, and the network seam".
 * Phase 0 has no bodies yet, so those rows read 0 and are present on purpose: a row that
 * appears later is a row nobody notices. What Phase 0 actually has to prove is the §25.2
 * gate "loads locally; stable frame/step", and the rows that prove it are stepsThisFrame
 * and clampedFrames — if the clock is drifting or the tab is banking time, they say so.
 *
 * §25.1: "favour instrumentation and reproducible test scenes over guessing at physics
 * bugs." This is the instrumentation half.
 */

import { DEBUG, RENDER, BUILD } from '../config.js';

export class DebugOverlay {
  constructor(root, game) {
    this.game = game;
    this.el = document.createElement('div');
    this.el.id = 'debug-overlay';
    this.el.hidden = !DEBUG.overlayEnabledByDefault;
    root.appendChild(this.el);

    this._frames = [];          // ring of recent frame times, ms
    this._lastText = '';
    this.stepsThisFrame = 0;
  }

  toggle() { this.el.hidden = !this.el.hidden; return !this.el.hidden; }
  get visible() { return !this.el.hidden; }

  /** @param {number} frameMs real time for the frame just rendered */
  update(frameMs, extra = {}) {
    this._frames.push(frameMs);
    if (this._frames.length > DEBUG.frameSampleSize) this._frames.shift();
    if (this.el.hidden) return;

    let sum = 0, worst = 0;
    for (const f of this._frames) { sum += f; if (f > worst) worst = f; }
    const avg = sum / Math.max(1, this._frames.length);
    const fps = 1000 / Math.max(0.0001, avg);
    const worstFps = 1000 / Math.max(0.0001, worst);

    const g = this.game;
    const s = g.state;
    const c = g.clock;

    // §26.6 sets a 45 FPS floor with the full manifest. Colour the number, do not hide it.
    const fpsClass = fps >= RENDER.targetFps - 3 ? 'ok' : fps >= RENDER.playtestFloorFps ? 'warn' : 'bad';

    const rows = [
      ['fps', `<span class="${fpsClass}">${fps.toFixed(0)}</span> avg / ${worstFps.toFixed(0)} worst-frame`],
      ['frame', `${avg.toFixed(2)} ms (worst ${worst.toFixed(1)})`],
      ['step', `${g.stats.systemMs.toFixed(2)} ms systems · ${this.stepsThisFrame} this frame`],
      ['clock', `${(c.simTimeMs / 1000).toFixed(2)}s sim · ${c.stepCount} steps · acc ${c.accumulatorMs.toFixed(1)}ms`],
      ['clamped', `${c.clampedFrames} frame(s) discarded`],
      ['bodies', `${extra.bodies || 0} rigid · ${extra.constraints || 0} constraints · ${extra.contacts || 0} contacts`],
      ['phase', `${s.phase} · work ${fmt(s.elapsedWorkMs)} / est ${fmt(s.estimateMs)}`],
      // activeDevice is PER SEAT since Phase 12 — an array, so it is joined rather than
      // interpolated. Interpolating it renders as "kbm,pad", which is not wrong so much as
      // unreadable, and hides which of the two is which.
      ['input', `${s.inputContext} · ${g.input ? devices(g.input) : '—'}${g.input && g.input.pointerLocked ? ' · locked' : ''}`],
      ['carry', extra.carry || '—'],
      // M16: the camera-shake offset per seat (mm), '(off)' when the §26.5 switch is off.
      ['shake', extra.shake || '—'],
      // §18.3 callouts this run, by what was lost (M15): what the invoice's recovery line will say.
      ['lost', extra.lost ? lostRow(extra.lost) : '—'],
      ['session', `${Object.keys(s.players).length} player(s) · seed ${s.seed} · ${s.paused ? 'PAUSED' : 'running'}`],
      ['build', `${BUILD.label} · ${BUILD.date}`],
    ];

    const events = g.bus.recent(DEBUG.eventLogLines)
      .map((e) => `<div class="ev">${(e.simTimeMs / 1000).toFixed(1)}s ${e.type}</div>`).join('');

    const text =
      rows.map(([k, v]) => `<div class="row"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('') +
      (events ? `<div class="sep"></div>${events}` : '');

    // Only touch the DOM when something changed — the overlay must not be why the frame
    // budget is missed.
    if (text !== this._lastText) { this.el.innerHTML = text; this._lastText = text; }
  }
}

function fmt(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

/** 'lost' row (M15): the recoveries this run by kind — main.js recoveriesByKind(). Exported
 *  so m23 can assert the text without a DOM. */
export function lostRow(k) {
  return `${k.total} this run · movers ${k.movers} · objects ${k.objects} · fixtures ${k.fixtures} · pieces ${k.pieces} · tools ${k.tools}`;
}

/** Which device each seated player is actually using (§26.5 — the HUD draws a glyph set per
 *  seat, and this is where you look when the wrong one appears). */
function devices(input) {
  const list = Array.isArray(input.activeDevice) ? input.activeDevice : [input.activeDevice];
  const n = input.seatCount || 1;
  return list.slice(0, n).map((d, i) => (n > 1 ? `P${i + 1}:${d}` : d)).join(' ');
}
