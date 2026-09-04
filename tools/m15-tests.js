/* Phase 11 build-side M3 suite — the pause card and controller parity for the shell.
 *
 * GDD §21.4 Cognition "Solo pause"; §26.5 "Solo pause freezes relevant simulation safely";
 * §21.2 "A retry keeps settings"; §4.4 "every essential action requires controller parity";
 * §25.3 "work on keyboard/mouse and a standard controller"; §6.4 co-op grips.
 *
 * THE CLAIMS UNDER TEST:
 *
 *   VISIBLE      the pause the clock has always done is now on screen, says PAUSED, and
 *                offers a way out. It OBSERVES game.setPaused — never a parallel flag — so
 *                m0 A9/E3's invariant holds through it (P3: zero steps, zero labour).
 *   YIELDS       it is never drawn under the title card or over the settlement sheet (P2).
 *   PARITY       pause, start, join and recover each have a controller path, read through
 *                the binding table (P5-P7), and Escape works through the same path.
 *   CO-OP SAFE   losing the pointer lock clears seat 0's mouse, not seat 1's keys (P8).
 *   SHIPS CLEAN  the F3 overlay starts off (P9).
 *
 * Every live assertion drives game.frame() itself — headless Chrome in --dump-dom mode
 * delivers 1-3 rAF callbacks in total (Dev\INDEX.md → Testing). The shell reads its edges
 * inside game.frame() (a game observer, main.js), which is the only reason a suite can see
 * a pad press at all.
 */

import { SIM, COOP, DEBUG } from '../src/config.js';
import { PAD, DEFAULT_BINDINGS, SEAT1_BINDINGS, CONTEXTS } from '../src/core/input.js';
import { TitleScreen } from '../src/ui/titleScreen.js';

const lines = [];
let passes = 0, fails = 0;
function ok(name, cond, detail = '') {
  if (cond) { passes++; lines.push(`PASS  ${name}`); }
  else { fails++; lines.push(`FAIL  ${name}${detail ? '  <- ' + detail : ''}`); }
}
const eq = (n, a, b) => ok(n, a === b, `got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

let _pre = null;
function emit(status) {
  if (!_pre) {
    _pre = document.createElement('pre');
    _pre.id = 'test-out';
    _pre.style.cssText = 'position:fixed;inset:0;z-index:99999;overflow:auto;background:#06080c;' +
      'color:#cfe;font:11px ui-monospace,Consolas,monospace;padding:12px;white-space:pre';
    document.body.appendChild(_pre);
  }
  const tail = status || (fails === 0 ? `ALL-PASS  ${passes} assertions` : `FAILURES  ${fails} of ${passes + fails}`);
  _pre.textContent = '==MFHTEST-BEGIN==\n' + lines.join('\n') + '\n\n' + tail + '\n==MFHTEST-END==';
}

emit('booting...');
/* A throw anywhere below used to leave every accumulated PASS/FAIL line unemitted, so the
 * whole suite printed only 'booting...' and read as a harness artefact. Now an uncaught error
 * is one FAIL line and the block still emits. */
window.addEventListener('error', (e) => { fails++; lines.push(`FAIL  uncaught  <- ${e.message}`); emit(); });
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason; fails++; lines.push(`FAIL  uncaught  <- ${r && r.message || r}`);
  lines.push((r && r.stack || '').split('\n').slice(0, 5).join('\n')); emit();
});
let M;
try { M = await window.__MFH_READY; }
catch (e) {
  fails++; lines.push(`FAIL  boot threw  <- ${e && e.message}`);
  lines.push((e && e.stack || '').split('\n').slice(0, 6).join('\n'));
  emit(); throw e;
}

const { game, input, huds, title, straps, registry, movers, cargo } = M;
const STEP = SIM.stepMs;
const frame = (n = 1) => { for (let i = 0; i < n; i++) game.frame(STEP); };
const card = () => document.querySelector('#pause-screen');
const text = () => card().textContent.replace(/\s+/g, ' ').trim();
/* A real keydown on window, the way a keyboard delivers it: Input's listener and the shell's
 * both see it. keyup follows so nothing is left held. */
const key = (type, code) =>
  window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true, cancelable: true }));
const press = (code) => { key('keydown', code); key('keyup', code); };
const banner = () => {
  const b = document.getElementById('err-banner');
  return b && b.textContent.trim() ? b.textContent.slice(0, 120) : '';
};
const shownHuds = () => huds.filter((h) => !h.el.hidden).length;

/* ── A. the title owns the shell until the job starts (P2a, P6) ─────────────────── */
lines.push('--- A. the title card owns the shell until the job starts (P2, P6) ---');
{
  ok('A0 the suite starts on the title card', title.visible === true);
  ok('A0a …with a pause card in the DOM, hidden', !!card() && card().hidden === true);

  game.setPaused(true);
  eq('P2a paused under the title, the pause card stays hidden', card().hidden, true);
  game.setPaused(false);

  // Escape under the title is neither a start (it used to be — one keystroke started the
  // job AND paused it) nor a pause: the title is the shell surface until the job begins.
  press('Escape'); frame();
  ok('P2a2 Escape under the title starts nothing and pauses nothing',
     !game.state.paused && title.visible, `paused=${game.state.paused} title=${title.visible}`);

  input._debugPad(0, PAD.A, 1); frame();
  eq('P6 pad A starts the job', title.visible, false);
  eq('P6a …leaving the game running', game.state.paused, false);
  ok('P6b …with no error banner', banner() === '', banner());
  input._debugPad(0, PAD.A, 0); frame();
}
emit('running...');

/* ── B. the pause is on screen and the clock is still the clock (P1, P3) ────────── */
lines.push('--- B. the card is the pause made visible (§21.4, §26.5) ---');
{
  game.setPaused(true);
  eq('P1 game.setPaused(true) shows the card', card().hidden, false);
  ok('P1a …and it says PAUSED', /PAUSED/.test(text()), text().slice(0, 80));
  ok('P1b …and accepts clicks while #ui does not (§21.1)', card().style.pointerEvents === 'auto');
  ok('P1c …with a Resume and a Restart button', !!card().querySelector('[data-act="resume"]') &&
     !!card().querySelector('[data-act="restart"]'));

  // m0 A9/E3, through the card: sixty frames under it move nothing and bill nothing.
  const t0 = game.clock.simTimeMs, w0 = game.state.elapsedWorkMs, s0 = game.clock.stepCount;
  frame(60);
  eq('P3 60 frames under the card advance sim time by 0 ms', game.clock.simTimeMs - t0, 0);
  eq('P3a …bill 0 ms of labour', game.state.elapsedWorkMs - w0, 0);
  eq('P3b …and run 0 steps', game.clock.stepCount - s0, 0);
  eq('P3c …while the card stays up', card().hidden, false);

  game.setPaused(false);
  eq('P1d setPaused(false) hides it', card().hidden, true);
  const t1 = game.clock.simTimeMs;
  frame(6);
  ok('P1e …and the clock runs again', game.clock.simTimeMs > t1, `${game.clock.simTimeMs - t1} ms`);
}
emit('running...');

/* ── C. pause is an ACTION: pad Menu and Escape through one path (P5) ────────────── */
lines.push('--- C. controller parity for pause (§4.4, §25.3) ---');
{
  ok('C0 running before the pad press', !game.state.paused);
  input._debugPad(0, PAD.MENU, 1); frame();
  eq('P5 pad Menu + one frame pauses', game.state.paused, true);
  frame(10);
  eq('P5a …ten frames with the button held do not toggle it back (edge consumed once)',
     game.state.paused, true);
  input._debugPad(0, PAD.MENU, 0); frame();
  eq('P5b …release alone changes nothing', game.state.paused, true);
  input._debugPad(0, PAD.MENU, 1); frame();
  eq('P5c …and a fresh press resumes', game.state.paused, false);
  input._debugPad(0, PAD.MENU, 0); frame();

  press('Escape'); frame();
  eq('P5d Escape keydown pauses through the same action', game.state.paused, true);
  eq('P5e …with the card up', card().hidden, false);
  frame(10);
  eq('P5f …and stays paused across ten frames', game.state.paused, true);
  press('Escape'); frame();
  eq('P5g …a second Escape resumes', game.state.paused, false);
  eq('P5h …and the card is gone', card().hidden, true);

  // The binding, pinned: one action, both devices, both contexts (m0 B16/B17 keep the pad half).
  const foot = DEFAULT_BINDINGS[CONTEXTS.FOOT].pause, drive = DEFAULT_BINDINGS[CONTEXTS.DRIVE].pause;
  ok('P5i pause is Escape + Menu for seat 0, on foot and driving',
     foot.keys.includes('Escape') && foot.pad.includes(PAD.MENU) &&
     drive.keys.includes('Escape') && drive.pad.includes(PAD.MENU));

  // The title listener no longer starts on Escape. A detached probe: Escape leaves it up,
  // Enter starts it (and the probe's own window listener removes itself on start).
  const probe = new TitleScreen(document.createElement('div'));
  press('Escape');
  ok('P5j a title card ignores Escape', probe.visible === true);
  press('Enter');
  ok('P5k …and still starts on Enter', probe.visible === false);
  frame();                       // the live Escape above lands here: paused
  eq('P5l …while the live shell read that Escape as a pause', game.state.paused, true);
  press('Escape'); frame();
  eq('P5m …resumed', game.state.paused, false);

  // Seat 1's pad Menu pauses too — the pad-only P2 has no keyboard pause at all (input.js).
  M.setSeats(2);
  input._debugPad(1, PAD.MENU, 1); frame();
  eq('P5n seat 1\'s pad Menu pauses (§4.4 parity for the joiner)', game.state.paused, true);
  input._debugPad(1, PAD.MENU, 0); frame();
  game.setPaused(false);
  M.setSeats(1);
  input.clear();
}
emit('running...');

/* ── D. the buttons do what they say (P4) ───────────────────────────────────────── */
lines.push('--- D. Resume and Restart (§21.2 "a retry keeps settings") ---');
{
  game.setPaused(true);
  card().querySelector('[data-act="resume"]').click();
  eq('P4 clicking Resume unpauses', game.state.paused, false);
  eq('P4a …and hides the card', card().hidden, true);

  // Dirty the contract first, so the reset has something to undo — then the m11 G8-G12
  // predicate, verbatim.
  game.state.manifest[0].delivered = true;
  frame(30);
  game.setPaused(true);
  card().querySelector('[data-act="restart"]').click();
  eq('P4b Restart returns to PICKUP', game.state.phase, 'pickup');
  ok('P4c …with 23 manifest rows still pointing at real bodies',
     game.state.manifest.length === 23 && game.state.manifest.every((r) => !!registry.get(r.entityId)),
     `${game.state.manifest.length} rows`);
  ok('P4d …nothing delivered, nothing damaged, no straps',
     straps.count === 0 && game.state.ledger.itemDamage.length === 0 &&
     game.state.manifest.every((r) => !r.delivered));
  ok('P4e …every mover still has a state record (§22.4)', movers.every((m) => !!game.state.players[m.id]));
  eq('P4f …and the game is running again', game.state.paused, false);
  eq('P4g …with the card gone', card().hidden, true);
  eq('P4h …and the clock back at zero', game.clock.simTimeMs, 0);
  ok('P4i …no error banner', banner() === '', banner());
}
emit('running...');

/* ── E. join and recover on a pad (P7) ──────────────────────────────────────────── */
lines.push('--- E. a controller can join, leave and recover (§25.3, §6.4) ---');
{
  eq('E0 solo before the join', M.seatCount, 1);
  eq('P7b COOP.joinPad is the View button', COOP.joinPad, PAD.VIEW);

  input._debugPad(0, PAD.VIEW, 1); frame();
  eq('P7 pad View + one frame seats a second player (two HUDs on screen)', shownHuds(), 2);
  eq('P7a …through setSeats, so m12 E1/E2\'s visibility rule holds', M.seatCount, 2);
  ok('P7a1 …and the game did not pause', !game.state.paused);
  input._debugPad(0, PAD.VIEW, 0); frame();

  // In co-op the first pad is seat 1's, so the joiner's View drops back too.
  input._debugPad(1, PAD.VIEW, 1); frame();
  eq('P7c View again drops back to one player', shownHuds(), 1);
  eq('P7c1 …and one seat', M.seatCount, 1);
  input._debugPad(1, PAD.VIEW, 0); frame();

  /* A REAL pad, through _pollPads — _debugPad writes the seat token straight into the maps
   * and never runs the poll, so it was structurally blind to this: the poll keyed its press
   * edges by SEAT token, and the join moves the first pad from seat 0 to seat 1
   * (seatForPadSlot), so a View button STILL HELD the frame after the flip was a new press
   * for the new seat — "leave" — and the frame after that "join" again, every frame until
   * release. Measured before the fix: seatCount [2,1,2,1,2,1,2,1] over an 8-frame hold,
   * ending solo. Edges are keyed by physical slot now (input.js _padSlotPrev); a human
   * 3-9 frame press lands on 2 and stays there. navigator.getGamepads is stubbed on the
   * navigator instance (an own property shadowing the prototype's) and deleted after. */
  {
    const held = new Set();
    const stub = {
      connected: true, index: 0, id: 'm15 stub (Standard Gamepad)', mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, (_, i) => ({
        get pressed() { return held.has(i); }, get value() { return held.has(i) ? 1 : 0; }, touched: false,
      })),
    };
    navigator.getGamepads = () => [stub];
    ok('P7h0 the stubbed pad is what the poll reads', navigator.getGamepads()[0] === stub);
    const trace = [];
    held.add(PAD.VIEW);
    for (let i = 0; i < 8; i++) { frame(); trace.push(M.seatCount); }
    held.delete(PAD.VIEW);
    for (let i = 0; i < 3; i++) { frame(); trace.push(M.seatCount); }
    eq('P7h a real pad holding View for 8 frames joins ONCE and stays joined (then 3 released frames)',
       trace.join(','), '2,2,2,2,2,2,2,2,2,2,2');
    eq('P7h1 …two HUDs on screen after the release', shownHuds(), 2);
    ok('P7h1a …and the pad is seat 1\'s now, held as a pad', input.activeDevice[1] === 'pad', input.activeDevice.join('/'));
    held.add(PAD.VIEW); frame(); held.delete(PAD.VIEW); frame();
    eq('P7h2 …a fresh press on the same pad (seat 1 in co-op) leaves', M.seatCount, 1);
    eq('P7h3 …one HUD', shownHuds(), 1);

    // Menu on the same real pad, held 8 frames: one pause, no flicker, and a fresh press resumes.
    const ptrace = [];
    held.add(PAD.MENU);
    for (let i = 0; i < 8; i++) { frame(); ptrace.push(game.state.paused ? 1 : 0); }
    held.delete(PAD.MENU); frame();
    eq('P7i a real pad holding Menu for 8 frames pauses once and stays paused', ptrace.join(''), '11111111');
    held.add(PAD.MENU); frame(); held.delete(PAD.MENU); frame();
    eq('P7i1 …and a fresh press resumes', game.state.paused, false);

    delete navigator.getGamepads;             // the prototype's method is back: no pads in headless
    frame();
    ok('P7j the stub is gone and the poll sees no pad',
       typeof navigator.getGamepads === 'function' && Array.from(navigator.getGamepads()).every((p) => !p));
    input.clear();
    input.activeDevice[0] = 'kbm'; input.activeDevice[1] = 'kbm';
    eq('P7j1 …solo, running, after the real-pad block', `${M.seatCount}/${game.state.paused}`, '1/false');
  }

  input._debugPad(0, PAD.DPAD_DOWN, 1);
  ok('P7d D-pad down is recover for seat 0', input.wasPressed('recover', 0));
  input._debugPad(0, PAD.DPAD_DOWN, 0);
  M.setSeats(2);
  input._debugPad(1, PAD.DPAD_DOWN, 1);
  ok('P7e …and for seat 1', input.wasPressed('recover', 1));
  input._debugPad(1, PAD.DPAD_DOWN, 0);
  M.setSeats(1);
  ok('P7f the binding is the same button on both seats',
     DEFAULT_BINDINGS[CONTEXTS.FOOT].recover.pad[0] === PAD.DPAD_DOWN &&
     SEAT1_BINDINGS[CONTEXTS.FOOT].recover.pad[0] === PAD.DPAD_DOWN);
  ok('P7g …and R is still recover on the keyboard', DEFAULT_BINDINGS[CONTEXTS.FOOT].recover.keys.includes('KeyR'));
  input.clear();
}
emit('running...');

/* ── F. losing the pointer lock (P8) ────────────────────────────────────────────── */
lines.push('--- F. the first Esc: lost lock clears seat 0 only, and pauses (§6.4, §21.4) ---');
{
  M.setSeats(2);
  input._debugPress('BracketLeft');   // seat 1 grips with the keyboard
  input._debugPress('Mouse0');        // seat 0 grips with the mouse
  ok('F0 both seats are gripping', input.isDown('gripLeft', 0) && input.isDown('gripLeft', 1));
  input.pointerLocked = true;         // the lock was held; the first Esc releases it silently
  document.dispatchEvent(new Event('pointerlockchange'));
  eq('P8 losing the pointer lock keeps seat 1\'s keyboard grip', input.isDown('gripLeft', 1), true);
  eq('P8a …and drops seat 0\'s mouse grip', input.isDown('gripLeft', 0), false);
  eq('P8a1 …and the input knows the lock is gone', input.pointerLocked, false);
  eq('P8b …and the lost lock is read as the swallowed Esc: the game pauses', game.state.paused, true);
  eq('P8c …with the card up', card().hidden, false);
  game.setPaused(false);

  // A lock loss while already paused (settle() releases it itself) is not a second request,
  // and an unlocked→unlocked event (no lock was held) is nothing at all.
  game.setPaused(true);
  input.pointerLocked = true;
  document.dispatchEvent(new Event('pointerlockchange'));
  eq('P8d a lock loss while already paused leaves it paused', game.state.paused, true);
  game.setPaused(false);
  document.dispatchEvent(new Event('pointerlockchange'));
  eq('P8e …and a pointerlockchange with no lock held pauses nothing', game.state.paused, false);
  input.clear();
  M.setSeats(1);
}
emit('running...');

/* ── G. the overlay ships off (P9) ──────────────────────────────────────────────── */
lines.push('--- G. the developer overlay is a developer\'s (§22.5) ---');
{
  const ov = document.querySelector('#debug-overlay');
  ok('G0 the overlay exists', !!ov);
  eq('P9 the debug overlay ships hidden', ov.hidden, true);
  eq('P9a …because the config says so', DEBUG.overlayEnabledByDefault, false);
  press('F3');
  eq('P9b F3 shows it', ov.hidden, false);
  // The grid is a real GridHelper (scene.js) — asserted, not guarded, so this cannot go vacuous.
  ok('G1 the metre grid exists on the world', !!M.world.grid);
  eq('P9c …and the metre grid with it', M.world.grid.visible, true);
  press('F3');
  eq('P9d …and F3 hides it again', ov.hidden, true);
  eq('P9e …grid too', M.world.grid.visible, false);
}
emit('running...');

/* ── H. the card yields to the settlement sheet (P2b, P2c) ──────────────────────── */
lines.push('--- H. settlement pauses without a second card (§15.2) ---');
{
  M.settle();
  eq('P2b settlement pauses (m11 G7 path)', game.state.paused, true);
  eq('P2b1 …but the pause card yields to the invoice', card().hidden, true);
  ok('P2b2 …which is the screen on show', M.invoiceScreen.visible && !M.invoiceScreen.el.hidden);
  M.invoiceScreen.onReplay();
  eq('P2c replay resumes', game.state.paused, false);
  eq('P2c1 …with the pause card still hidden', card().hidden, true);
  eq('P2c2 …and the contract back in PICKUP (m11 G8)', game.state.phase, 'pickup');
  ok('P2c3 …no error banner', banner() === '', banner());
}
emit('running...');

/* ── I. the centre stays clear, the settings slot, the blur line ────────────────── */
lines.push('--- I. §21.1 centre clear (m11 F2 repaired), the M4 slot, the blur reason ---');
{
  /* m11 F2 queried #contract/#cargo-status/#notices/#route-bar — ids the HUD dropped in
   * Phase 12 — so every branch returned true and it has been vacuous since. The same
   * measurement on the CLASS names, live, plus the one new panel: while running, the pause
   * card's Resume button has no layout box at all; paused, it sits dead centre, where a
   * stopped game can afford it. */
  ok('I0 running', !game.state.paused);
  huds[0].setContract({ phase: 'pickup', delivered: 0, total: 23, loaded: 0,
                        roomCorrect: 0, elapsedMin: 1, estimateMin: 18 });
  huds[0].setCargo(cargo.packQuality());
  huds[0].setPrompt({ primary: 'pick up the flat dolly', secondary: null });
  const W = window.innerWidth, H = window.innerHeight;
  const outsideCentre = (r) =>
    r.right < W / 2 - W / 6 || r.left > W / 2 + W / 6 || r.bottom < H / 2 - H / 6 || r.top > H / 2 + H / 6;
  const sels = ['.contract', '.cargo-status', '.notices', '.route-bar'];
  const present = sels.filter((s) => huds[0].el.querySelector(s));
  eq('F2r the HUD panels exist under their class names (the ids m11 F2 queries do not)',
     present.length, 4);
  const laidOut = present.filter((s) => huds[0].el.querySelector(s).offsetParent);
  ok('F2r1 …at least the contract panel has a layout box to measure', laidOut.includes('.contract'),
     laidOut.join(','));
  const covering = laidOut.filter((s) => !outsideCentre(huds[0].el.querySelector(s).getBoundingClientRect()));
  ok('F2r2 §21.1: no HUD panel covers the middle third while running', covering.length === 0,
     covering.join(','));
  const resume = card().querySelector('[data-act="resume"]');
  ok('F2r3 …and the Resume button has no layout box while unpaused',
     !resume.offsetParent && resume.getBoundingClientRect().width === 0);
  game.setPaused(true);
  const rr = resume.getBoundingClientRect();
  ok('F2r4 …but a real, centred one while paused',
     rr.width > 60 && Math.abs((rr.left + rr.right) / 2 - W / 2) < 40,
     `w ${rr.width.toFixed(0)} centre ${((rr.left + rr.right) / 2).toFixed(0)} vs ${W / 2}`);

  // The Settings slot for M4: present, hidden until a handler registers, and live once one does.
  const ps = M.pauseScreen;
  const sb = card().querySelector('[data-act="settings"]');
  ok('I1 a Settings slot exists for M4', !!sb);
  eq('I1a …hidden while nothing has registered a handler', sb.hidden, true);
  let opened = 0;
  ps.onSettings = () => opened++;
  ps.refresh();
  eq('I1b …shown once a handler is registered', sb.hidden, false);
  sb.click();
  eq('I1c …and a click reaches it', opened, 1);
  ps.onSettings = null; ps.refresh();
  eq('I1d …and it hides again when the handler goes', sb.hidden, true);
  game.setPaused(false);

  // A blur pauses and the card says why; a resume clears it; an Esc pause carries no reason.
  window.dispatchEvent(new Event('blur'));
  eq('I2 window blur pauses (§21.4)', game.state.paused, true);
  ok('I2a …and the card says why', /paused — window lost focus/.test(text()), text().slice(0, 120));
  card().querySelector('[data-act="resume"]').click();
  eq('I2b Resume clears it', game.state.paused, false);
  press('Escape'); frame();
  ok('I2c …and a plain Esc pause carries no focus line',
     game.state.paused && !/lost focus/.test(text()), text().slice(0, 120));
  press('Escape'); frame();
  eq('I2d …resumed', game.state.paused, false);
  // Clicking the backdrop (not a button) is "click to resume" — the gesture that can re-lock.
  game.setPaused(true);
  card().click();
  eq('I2e a click on the backdrop resumes', game.state.paused, false);
}
emit('running...');

/* ── J. it still runs ───────────────────────────────────────────────────────────── */
lines.push('--- J. the build survives all of the above ---');
{
  const before = M.physics.stats.bodies;
  frame(60);
  eq('J1 no bodies leaked over 60 frames', M.physics.stats.bodies, before);
  ok('J2 state is still plain serializable data (§22.4)',
     (() => { try { JSON.stringify(game.state); return true; } catch (e) { return false; } })());
  eq('J3 the game ends the suite running, solo, card hidden',
     `${game.state.paused}/${M.seatCount}/${card().hidden}`, 'false/1/true');
  ok('J4 no error banner appeared during the suite', banner() === '', banner());
}

emit();
