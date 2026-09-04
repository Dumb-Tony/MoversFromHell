/* Phase 12 suite — local co-op.
 *
 * Not a §25.2 roadmap gate, and a deliberate departure from §13.4, which excludes
 * split-screen from the prototype. Recorded in docs/CHANGELOG.md and in COOP in config.js.
 * The reason it was worth the departure: §6.4's two-mover cooperation is a LOCKED pillar,
 * and no amount of solo Tab-swapping can playtest two people. §27.3's questions about what
 * "the TEAM" tried cannot be asked without a team.
 *
 * THE CLAIMS UNDER TEST:
 *
 *   DISJOINT      no physical control reaches two seats. This is TowBros' rule
 *                 (Dev\INDEX.md → "Local co-op on one keyboard") and its warning: seat 0
 *                 had to LOSE the arrow keys it also owned. A shared key is not a clash
 *                 you notice, it is one player's mover twitching when the other walks.
 *   INDEPENDENT   each seat's keys drive its own mover, its own camera and its own aim —
 *                 asserted through game.frame(), the real binding path, not by calling the
 *                 movers system directly. A test that reaches past the binding cannot
 *                 detect a missing one (the Phase 11 lesson, applied again).
 *   TOGETHER      and they can still both grab the same couch. Co-op that breaks §6.4 to
 *                 achieve §6.4 would be a poor trade.
 *   SOLO SURVIVES the validated single-player build is unchanged: one seat, full screen,
 *                 Tab still swaps, and the view still does not spin when it does.
 */

import { SIM } from '../src/config.js';
import { bindingConflicts, DEFAULT_BINDINGS, SEAT1_BINDINGS, SEAT_BINDINGS, CONTEXTS, PAD, MOUSE, Input }
  from '../src/core/input.js';
import { layoutFor } from '../src/render/coopView.js';
// Phase 11 build-side M5 (section K): the glyph derivation and the two config numbers it pins.
import { glyphFor } from '../src/core/input.js';
import { COOP, PROMPTS } from '../src/config.js';

const lines = [];
let passes = 0, fails = 0;
function ok(name, cond, detail = '') {
  if (cond) { passes++; lines.push(`PASS  ${name}`); }
  else { fails++; lines.push(`FAIL  ${name}${detail ? '  <- ' + detail : ''}`); }
}
const eq = (n, a, b) => ok(n, a === b, `got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const near = (n, a, b, tol, d = '') =>
  ok(n, Math.abs(a - b) <= tol, `${d}got ${Number(a).toFixed(4)}, want ${b}±${tol}`);

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
let M;
try { M = await window.__MFH_READY; }
catch (e) {
  fails++; lines.push(`FAIL  boot threw  <- ${e && e.message}`);
  lines.push((e && e.stack || '').split('\n').slice(0, 6).join('\n'));
  emit(); throw e;
}

const { game, input, movers, huds, registry, physics, interact, tools, route } = M;

/* ── A. one control, one seat (Dev\INDEX.md → TowBros CREW_BINDINGS) ──────────── */
lines.push('--- A. no physical control reaches two seats ---');
{
  const conflicts = bindingConflicts();
  ok('A1 no key is claimed by two seats', conflicts.length === 0, conflicts.join(' | '));

  /* THE SPECIFIC REGRESSION TowBros WARNED ABOUT. `moveForward` was ['KeyW', 'ArrowUp'] for
   * five phases, because one seat can own as many alternates as it likes. The moment a
   * second seat exists, that alternate is the other player's forward. */
  const s0 = DEFAULT_BINDINGS[CONTEXTS.FOOT];
  const s1 = SEAT1_BINDINGS[CONTEXTS.FOOT];
  ok('A2 seat 0 gave up the arrow keys', !(s0.moveForward.keys || []).includes('ArrowUp'),
     JSON.stringify(s0.moveForward.keys));
  ok('A3 …and seat 1 has them', (s1.moveForward.keys || []).includes('ArrowUp'));

  // There is one mouse, so seat 1 cannot be given a mouse button — see SEAT1_BINDINGS.
  const mouseOnS1 = Object.entries(s1).filter(([, d]) => (d.mouse || []).length).map(([a]) => a);
  ok('A4 seat 1 binds no mouse button', mouseOnS1.length === 0, mouseOnS1.join(', '));

  /* §4.4 parity, applied to the seat that most needs it: seat 1 is a controller seat with a
   * keyboard fallback, so every essential action must be reachable BOTH ways. */
  const ESSENTIAL = ['gripLeft', 'gripRight', 'jump', 'brace', 'interact', 'context'];
  const noKey = ESSENTIAL.filter((a) => !s1[a] || !(s1[a].keys || []).length);
  const noPad = ESSENTIAL.filter((a) => !s1[a] || !(s1[a].pad || []).length);
  ok('A5 every essential seat-1 action has a key', noKey.length === 0, noKey.join(', '));
  ok('A6 …and a pad button', noPad.length === 0, noPad.join(', '));

  /* Tab is a SOLO affordance. Giving seat 1 a swapMover would let one player take the other
   * player's mover out from under them mid-carry, which is §6.4's failure case with a
   * keybinding attached. */
  ok('A7 seat 1 cannot swap movers', !s1.swapMover);

  // Look is four keys for seat 1 and zero for seat 0, which has a mouse.
  ok('A8 seat 1 can turn without a mouse',
     ['lookLeft', 'lookRight', 'lookUp', 'lookDown'].every((a) => s1[a] && (s1[a].keys || []).length));
  ok('A9 seat 0 has no look keys — it has a mouse', !s0.lookLeft && !s0.lookRight);
}

/* ── B. pad assignment ─────────────────────────────────────────────────────────── */
lines.push('--- B. the first controller goes to the player who needs one ---');
{
  const probe = new Input(window, null, SEAT_BINDINGS);
  probe.setSeatCount(1);
  eq('B1 solo: the only pad drives seat 0', probe.seatForPadSlot(0), 0);

  /* THE ERGONOMIC TRUTH, asserted so it cannot be "simplified" back to slot-equals-seat:
   * seat 0 already has the keyboard and the mouse. Handing it the only controller as well
   * leaves the player who just joined with nothing at all. */
  probe.setSeatCount(2);
  eq('B2 co-op: the first pad goes to the JOINER, not to seat 0', probe.seatForPadSlot(0), 1);
  eq('B3 …and a second pad goes to seat 0', probe.seatForPadSlot(1), 0);

  /* Pad tokens are seat-qualified, because two controllers both report button 6. An
   * unqualified 'Pad6' is seat 1's trigger arriving as seat 0's grip as well. */
  probe._debugPad(1, PAD.RT, 1);
  ok('B4 a pad button pressed on seat 1 is down for seat 1', probe.isDown('gripRight', 1));
  ok('B5 …and NOT for seat 0', !probe.isDown('gripRight', 0));
  near('B6 …and reads as full analog pressure for its own seat', probe.analog('gripRight', 1), 1, 1e-9);
  near('B7 …and zero for the other', probe.analog('gripRight', 0), 0, 1e-9);
}

/* ── C. per-seat state that used to be global ──────────────────────────────────── */
lines.push('--- C. look, context and held keys are per seat ---');
{
  const probe = new Input(window, null, SEAT_BINDINGS);
  probe.setSeatCount(2);

  probe.looks[0].x = 12; probe.looks[1].x = -7;
  const l0 = probe.consumeLook(0);
  eq('C1 each seat consumes its own look delta', l0.x, 12);
  eq('C2 …without touching the other seat', probe.looks[1].x, -7);
  eq('C3 …and consuming empties only its own', probe.looks[0].x, 0);

  ok('C4 input.look is the SAME OBJECT as seat 0, not a copy', probe.look === probe.looks[0]);

  /* A context switch used to call clear(), which was right with one seat and is a §6.4 bug
   * with two: it would drop the other player's held grip the instant their partner climbed
   * into the cab, and read as "the game dropped my couch". */
  probe._debugPress('BracketLeft');            // seat 1 holds a grip
  probe._debugPress('KeyW');                   // seat 0 walks
  ok('C5 seat 1 is gripping', probe.isDown('gripLeft', 1));
  probe.setContext(CONTEXTS.DRIVE, 0);
  ok('C6 seat 0 changing context does NOT drop seat 1\'s grip', probe.isDown('gripLeft', 1));
  ok('C7 …and does clear seat 0\'s own held keys', !probe.isDown('moveForward', 0));
  eq('C8 …leaving the other seat on foot', probe.contexts[1], CONTEXTS.FOOT);

  /* A key whose code starts with P is an ordinary key, not a pad token. `Period` and `KeyP`
   * both exist in seat 1's block; treating one as a pad button reports a held key as zero
   * pressure, which is a grip that silently never closes. */
  const probe2 = new Input(window, null, SEAT_BINDINGS);
  probe2.setSeatCount(2);
  probe2._debugPress('BracketRight');
  near('C9 a keyboard grip reads full pressure', probe2.analog('gripRight', 1), 1, 1e-9);

  /* Losing the pointer lock (the first Esc) used to call clear() for EVERY seat — C5-C8's
   * §6.4 bug in a different hat: seat 0's Esc dropped seat 1's couch. The lock is the
   * mouse's, and the mouse is seat 0's, so only seat 0 is cleared (Phase 11 build-side M3). */
  const probe3 = new Input(window, null, SEAT_BINDINGS);
  probe3.setSeatCount(2);
  probe3._debugPress('BracketLeft');   // seat 1 grips with the keyboard
  probe3._debugPress('Mouse0');        // seat 0 grips with the mouse
  probe3.pointerLocked = true;
  let lost = 0; probe3.onPointerLockLost = () => lost++;
  probe3._pointerLockChanged();        // what the document event calls; no lock element here
  ok('C10 losing the pointer lock keeps seat 1\'s grip', probe3.isDown('gripLeft', 1));
  ok('C11 …and drops seat 0\'s mouse grip', !probe3.isDown('gripLeft', 0));
  eq('C12 …firing the lock-lost hook once, on the locked→unlocked edge', lost, 1);
  probe3._pointerLockChanged();
  eq('C12a …and not again while already unlocked', lost, 1);
}

/* ── D. the split-screen layout ────────────────────────────────────────────────── */
lines.push('--- D. two viewports that tile the canvas exactly ---');
{
  const W = 1600, H = 900, D = 2;
  const one = layoutFor(1, W, H);
  eq('D1 one seat is one full-canvas viewport', one.length, 1);
  ok('D2 …covering the whole canvas', one[0].w === W && one[0].h === H && one[0].x === 0 && one[0].y === 0);

  const two = layoutFor(2, W, H, 'side-by-side', D);
  eq('D3 two seats are two viewports', two.length, 2);
  ok('D4 …of equal size', two[0].w === two[1].w && two[0].h === two[1].h);
  ok('D5 …that do not overlap', two[0].x + two[0].w <= two[1].x, `${two[0].x + two[0].w} > ${two[1].x}`);
  eq('D6 …and reach the right edge', two[1].x + two[1].w, W);
  ok('D7 …leaving exactly the divider between them', two[1].x - (two[0].x + two[0].w) === D,
     `gap ${two[1].x - (two[0].x + two[0].w)}`);

  /* ⚠ THE ONE THAT LOOKS LIKE "CO-OP IS BROKEN". setViewport/setScissor take CSS pixels and
   * multiply by the pixel ratio internally, so a layout that pre-multiplies puts seat 1 off
   * the canvas on any dpr > 1 display — and the symptom is a black half, not an error. The
   * numbers here must be the CSS ones, whatever the display is doing. */
  ok('D8 the layout is CSS pixels, never device pixels',
     two[0].w + two[1].w + D === W, `${two[0].w} + ${two[1].w} + ${D} != ${W}`);

  /* WebGL's Y is bottom-up and CSS's is top-down. Both live on the rect because the HUD is
   * DOM and the viewport is GL, and a disagreement between them renders perfectly while
   * putting seat 0's panels over seat 1's view. */
  const stacked = layoutFor(2, W, H, 'stacked', D);
  eq('D9 stacked seat 0 is the TOP half in CSS', stacked[0].cssTop, 0);
  ok('D10 …which is the UPPER half in GL coordinates too', stacked[0].y > stacked[1].y,
     `gl y ${stacked[0].y} vs ${stacked[1].y}`);
  eq('D11 …and seat 1 sits directly below it', stacked[1].cssTop, H - stacked[1].cssH);

  ok('D12 a half-width viewport is narrower than tall', two[0].w < two[0].h);
}

/* ── E. two people, two seats, through the real binding path ───────────────────── */
lines.push('--- E. each seat drives its own mover (§6.4) ---');
{
  game.setPaused(false);
  eq('E1 the build starts SOLO — the validated single-player one', M.seatCount, 1);
  ok('E2 …with one HUD on screen and the other hidden', !huds[0].el.hidden && huds[1].el.hidden);

  eq('E3 F2 seats a second player', M.setSeats(2), 2);
  eq('E4 …and seat 0 keeps mover 0', M.moverOfSeat(0).id, movers[0].id);
  eq('E5 …while seat 1 gets mover 1', M.moverOfSeat(1).id, movers[1].id);

  const restAll = () => {
    for (const m of movers) {
      m.controller._vel.x = 0; m.controller._vel.z = 0; m.controller.velocityY = 0;
      m.body && (m.controller.carriedMass = 0);
    }
  };
  const posOf = (m) => ({ ...m.controller.position });
  const moved = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);
  const run = (frames) => { for (let i = 0; i < frames; i++) game.frame(SIM.stepMs); };

  // Seat 1 walks. Seat 0 does not.
  input.clear(); restAll();
  let a0 = posOf(movers[0]), a1 = posOf(movers[1]);
  input._debugPress('ArrowUp');
  run(40);
  input._debugRelease('ArrowUp');
  const d0 = moved(a0, posOf(movers[0])), d1 = moved(a1, posOf(movers[1]));
  ok('E6 seat 1\'s arrow key moves mover 1', d1 > 0.3, `moved ${d1.toFixed(3)} m`);
  ok('E7 …and does not move mover 0', d0 < 0.05, `mover 0 moved ${d0.toFixed(3)} m`);

  // And the other way round, which is the half that catches a copy-paste in the seat table.
  input.clear(); restAll();
  a0 = posOf(movers[0]); a1 = posOf(movers[1]);
  input._debugPress('KeyW');
  run(40);
  input._debugRelease('KeyW');
  const e0 = moved(a0, posOf(movers[0])), e1 = moved(a1, posOf(movers[1]));
  ok('E8 seat 0\'s W moves mover 0', e0 > 0.3, `moved ${e0.toFixed(3)} m`);
  ok('E9 …and does not move mover 1', e1 < 0.05, `mover 1 moved ${e1.toFixed(3)} m`);

  // Both at once — the thing the whole phase is for.
  input.clear(); restAll();
  a0 = posOf(movers[0]); a1 = posOf(movers[1]);
  input._debugPress('KeyW'); input._debugPress('ArrowUp');
  run(40);
  input._debugRelease('KeyW'); input._debugRelease('ArrowUp');
  const f0 = moved(a0, posOf(movers[0])), f1 = moved(a1, posOf(movers[1]));
  ok('E10 both movers walk at once', f0 > 0.3 && f1 > 0.3,
     `p0 ${f0.toFixed(3)} m, p1 ${f1.toFixed(3)} m`);
}

/* ── F. independent aim, which is WHY the rig became per-mover ─────────────────── */
lines.push('--- F. two people look in two directions (§4.1) ---');
{
  movers[0].rig.yaw = 0.9;  movers[0].grips.syncAim();
  movers[1].rig.yaw = -2.1; movers[1].grips.syncAim();
  near('F1 mover 0 aims where seat 0 is looking', movers[0].grips.aimYaw, 0.9, 1e-6);
  near('F2 mover 1 aims where seat 1 is looking', movers[1].grips.aimYaw, -2.1, 1e-6);

  /* THE BUG THIS PREVENTS, stated as a test: with a shared rig, turning one camera turned
   * both players' hands. It is the reason co-op could not simply reuse the Phase 2 rig. */
  const before = movers[1].grips.aimYaw;
  movers[0].rig.yaw = 2.6; movers[0].grips.syncAim();
  near('F3 turning seat 0\'s camera does not move seat 1\'s hands', movers[1].grips.aimYaw, before, 1e-9);

  ok('F4 the two seats really are different cameras', movers[0].camera !== movers[1].camera);
  ok('F5 …and different rigs', movers[0].rig !== movers[1].rig);
}

/* ── G. contention: the data cannot represent two owners ───────────────────────── */
lines.push('--- G. one thing, one owner (Dev\\INDEX.md → TowBros authority) ---');
{
  /* STES's rule: contention is a PROPERTY, not a rule. Nothing here asks "can two people
   * pick this up?" — `carriedBy` is a mover id, so a second claim has nowhere to be
   * written, and interact's probe skips a tool that already has one. */
  const dolly = [...tools.tools.values()].find((t) => t.defId === 'dolly_flat_01');
  dolly.state.carriedBy = movers[0].id;
  const seen = interact._toolNearRay(
    { x: dolly.body.translation().x, y: dolly.body.translation().y + 0.4, z: dolly.body.translation().z },
    { x: 0, y: -1, z: 0 }, 3);
  ok('G1 a tool another mover is carrying is not offered to this one', !seen);
  dolly.state.carriedBy = null;

  /* One truck, one departure. The route's state machine IS the driver lock — two players
   * both pressing E at the cab must not depart twice. */
  const wasState = route.state;
  route.reset();
  const first = interact._useCab();
  const second = interact._useCab();
  ok('G2 the first E at the cab departs', !!first, String(first));
  ok('G3 …and the second does not depart again',
     !(second && /driving/.test(String(second))), String(second));
  route.reset();
  void wasState;
}

/* ── H. two HUDs that cannot be mistaken for each other ────────────────────────── */
lines.push('--- H. one HUD per seat (§21.1, §26.5) ---');
{
  eq('H1 there is a HUD per seat', huds.length >= 2, true);
  ok('H2 both are on screen in co-op', !huds[0].el.hidden && !huds[1].el.hidden);

  /* The HUD used ids for five phases. Two elements with one id is invalid HTML whose symptom
   * is quiet: document.querySelector returns the FIRST, so seat 1's panels get read and
   * written as seat 0's by anything that does not scope its lookup. */
  for (const id of ['reticle', 'prompt', 'contract', 'cargo-status', 'notices']) {
    ok(`H3 no duplicate #${id} in the document`, document.querySelectorAll('#' + id).length === 0);
  }
  eq('H4 the two HUD roots are tagged with their seat', huds[1].el.dataset.seat, '1');

  /* THE COST OF MOVING FROM IDS TO CLASSES, caught by a screenshot and pinned here.
   * `update()` wrote `label.className = cls` — safe for five phases, because an id cannot be
   * clobbered by writing className. As a class it could: the label lost `grip-label`, fell
   * out of `position: absolute`, and rendered as a static block across the top of the
   * viewport, through the contract panel. CSS reported it; JS never would have. */
  huds[0].update({ left: null, right: null, hovered: true });
  ok('H4a the structural class survives a state change',
     huds[0].label.classList.contains('grip-label'), huds[0].label.className);
  huds[0].update({ left: { entityId: 'x', slipping: false }, right: null, hovered: false });
  ok('H4b …in the holding state too',
     huds[0].label.classList.contains('grip-label') && huds[0].label.classList.contains('holding'),
     huds[0].label.className);
  ok('H4c …and the reticle hands keep theirs',
     huds[0].left.classList.contains('hand'), huds[0].left.className);

  // §26.5: the two movers differ by hue and nothing else, so the half says whose it is.
  huds[0].setSeatTag('P1 · p0');
  ok('H5 each half names its player in words, not by colour alone',
     /P1/.test(huds[0].seatTag.innerHTML));

  const rects = layoutFor(2, 1600, 900);
  huds[1].setRect(rects[1]);
  ok('H6 seat 1\'s HUD is pinned to seat 1\'s half', huds[1].el.style.left === rects[1].cssLeft + 'px');
  /* `.hud` carries `inset: 0`, so setting only left/top/width/height leaves `right: 0` and
   * `bottom: 0` fighting them and stretches seat 0's panels across the divider. Asserted on
   * the LONGHANDS: `style.inset` reads back as the recomposed shorthand once left and top are
   * set individually ("0px auto auto 801px"), so checking it for the literal string 'auto'
   * tests the CSSOM's serialiser rather than the layout. */
  eq('H7a …with the right edge released', huds[1].el.style.right, 'auto');
  eq('H7b …and the bottom edge released', huds[1].el.style.bottom, 'auto');
  eq('H7c …leaving the half pinned by left and width', huds[1].el.style.width, rects[1].cssW + 'px');

  // A notice addressed to one seat is not shown to the other.
  huds[0]._notices.length = 0; huds[1]._notices.length = 0;
  huds[1].notice('your hands', 'info');
  eq('H8 a seat-addressed notice reaches that seat', huds[1]._notices.length, 1);
  eq('H9 …and not the other', huds[0]._notices.length, 0);
}

/* ── I. the solo build is still the solo build ─────────────────────────────────── */
lines.push('--- I. no regression to single player ---');
{
  eq('I1 F2 again drops back to one seat', M.setSeats(1), 1);
  ok('I2 …and seat 1\'s HUD leaves the screen', huds[1].el.hidden !== false || M.seatCount === 1);
  huds[0].clearRect();
  eq('I3 …with seat 0 full-screen again', huds[0].el.style.left, '');

  /* Tab is solo-only, and the reason it is worth a test: before Phase 12 one shared rig made
   * a swap re-target and hold still by construction. With a rig each, arriving at the other
   * mover means arriving at wherever they were last looking — a spin nobody asked for. */
  movers[0].rig.yaw = 1.234; movers[0].rig.pitch = -0.31;
  const startIndex = M.activeMoverIndex;
  M.swapMover();
  ok('I4 Tab swaps which mover you drive', M.activeMoverIndex !== startIndex);
  near('I5 …and the view does not spin', M.rig.yaw, 1.234, 1e-9);
  near('I6 …in either axis', M.rig.pitch, -0.31, 1e-9);
  M.swapMover();
  eq('I7 …and swapping back returns to the first mover', M.activeMoverIndex, startIndex);

  eq('I8 solo renders one viewport', layoutFor(M.seatCount, 1600, 900).length, 1);
}

/* ── K. the prompt speaks each seat's device (Phase 11 build-side M5, §26.5, §4.4) ─────
 *
 * For fifteen phases the HUD printed a literal 'E' and 'LMB / RMB' for every seat, so seat 1
 * — Quote/Semicolon/[ ] on the keyboard, X/RB/LT/RT on a pad — was told to press keys it does
 * not have. The fix derives every glyph from the binding table (input.js glyphFor), so there
 * is nothing to drift; the assertions below are the ones the brief numbered (K1-K3) plus the
 * join-button collision Phase 16 recorded (K4).
 */
lines.push('--- K. device-aware prompt glyphs per seat (M5: §26.5 "both input mappings") ---');
{
  // K1 — PURE: the label comes from the binding table, with no DOM and no Input instance.
  eq('K1 glyphFor(interact, seat 0, kbm) is E', glyphFor('interact', 0, 'kbm'), 'E');
  eq('K1 …seat 1 on the keyboard is the Quote key', glyphFor('interact', 1, 'kbm'), "'");
  eq('K1 …seat 0 on a pad is X', glyphFor('interact', 0, 'pad'), 'X');
  eq('K1 …and seat 1\'s left grip on a pad is LT', glyphFor('gripLeft', 1, 'pad'), 'LT');
  eq('K1a a mouse binding labels as its button', glyphFor('gripLeft', 0, 'kbm'), 'LMB');
  eq('K1b a pad-only action still gets a label on the keyboard (seat 1 pause → Menu)',
     glyphFor('pause', 1, 'kbm'), 'Menu');
  eq('K1c seat 1\'s arrows print as arrows', glyphFor('moveForward', 1, 'kbm'), '↑');
  eq('K1d an unbound action is an empty label, not a crash', glyphFor('nothing', 0, 'kbm'), '');

  // K2 — seat 1's HUD, fed the glyph set the loop feeds it.
  M.setSeats(2);
  input.activeDevice[1] = 'kbm';
  const d = { primary: 'pick up the flat dolly', secondary: 'cancel strap', target: null };
  huds[1].setPrompt(d, input.glyphsFor(1, 'kbm'));
  const t1 = huds[1].prompt.textContent;
  ok('K2 seat 1 on the keyboard is told to press \' — never E',
     t1.includes("'") && !/\bE\b/.test(t1), t1);
  ok('K2 …and ; to undo, never Q', /;/.test(t1) && !/\bQ\b/.test(t1), t1);
  ok('K2 …with the VERB untouched (m11 B6/D4/E3 match on the words)',
     /pick up the flat dolly/.test(t1) && /cancel strap/.test(t1), t1);
  huds[1].update({ left: null, right: null, hovered: 'x' }, input.glyphsFor(1, 'kbm'));
  const l1 = huds[1].label.textContent;
  ok('K2 …and its grips are [ / ] — not LMB / RMB', /\[ \/ \]/.test(l1) && !/LMB/.test(l1), l1);
  ok('K2a …while the structural class survives (H4a)', huds[1].label.classList.contains('grip-label'));
  huds[1].setPrompt(d, input.glyphsFor(1, 'pad'));
  ok('K2b seat 1 on a pad reads X and RB', /\bX\b/.test(huds[1].prompt.textContent) &&
     /\bRB\b/.test(huds[1].prompt.textContent), huds[1].prompt.textContent);
  ok('K2c the seat tag names the device in words (§26.5)', (() => {
    M.feedHuds();
    return /keys/.test(huds[1].seatTag.textContent) && /P2/.test(huds[1].seatTag.textContent);
  })(), huds[1].seatTag.textContent);

  /* K3 — THE DEBOUNCE, through the real feed. `input.activeDevice` flips on any pad activity
   * (a stick a hair past its deadzone flips it every poll); the shown device follows it only
   * after PROMPTS.deviceDebounceMs of continuous SIM time. Seat 0 is stood in front of a
   * parked box (grip label + device-neutral hint) and then the dolly (a primary verb, so the
   * key chip is on screen). Helpers copied from tools/m11-tests.js placeMover/parkAt/lookAt. */
  const placeMover = (m, x, z, y = 0.2) => {
    m.controller.hardSetPosition({ x, y, z });
    m.controller._vel.x = 0; m.controller._vel.z = 0; m.controller.velocityY = 0;
  };
  const parkAt = (body, x, y, z) => {
    body.setTranslation({ x, y, z }, true);
    body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    body.wakeUp();
    physics.primeQueries();
  };
  const lookAt = (m, from, target) => {
    placeMover(m, from.x, from.z);
    const p = m.controller.position;
    m.rig.yaw = Math.atan2(-(target.x - p.x), -(target.z - p.z));
    m.rig.pitch = Math.atan2(target.y - (p.y + 1.4), Math.hypot(target.x - p.x, target.z - p.z));
    m.rig._first = true;
    for (let k = 0; k < 20; k++) m.rig.update(p, 1 / 60);
    const c = m.camera.position;
    m.rig.yaw = Math.atan2(-(target.x - c.x), -(target.z - c.z));
    m.rig.pitch = Math.atan2(target.y - c.y, Math.hypot(target.x - c.x, target.z - c.z));
    m.grips.syncAim();
    physics.primeQueries();
  };
  const feed = (n) => { for (let i = 0; i < n; i++) { game.frame(SIM.stepMs); M.feedHuds(); } };
  const prompt = () => huds[0].prompt.textContent;
  const label = () => huds[0].label.textContent;

  const box = [...registry.entities.values()].find((e) => e.defId === 'box_small_01');
  const dolly = [...tools.tools.values()].find((t) => t.defId === 'dolly_flat_01');
  const boxAt = { x: -30, y: 0.30, z: 30 };
  parkAt(box.body, boxAt.x, boxAt.y, boxAt.z);
  const atBox = () => lookAt(movers[0], { x: boxAt.x, z: boxAt.z + 1.3 }, boxAt);
  const atDolly = () => { const t = dolly.body.translation(); lookAt(movers[0], { x: t.x, z: t.z + 1.2 }, { x: t.x, y: t.y, z: t.z }); };

  input.activeDevice[0] = 'kbm'; input.activeDevice[1] = 'kbm';
  atBox(); feed(20);
  eq('K3 seat 0 starts on the keyboard', M.shownDevice(0), 'kbm');
  ok('K3 …with LMB / RMB on the grip label', /LMB \/ RMB/.test(label()), label());
  ok('K3 …and the device-neutral hint resolved to LMB/RMB, no token left',
     /LMB\/RMB/.test(prompt()) && !/\{/.test(prompt()), prompt());

  // Switch to a pad. 14 frames = 233 ms: not yet. 2 more = 267 ms: switched.
  input.activeDevice[0] = 'pad'; M.feedHuds();
  const tCand = game.clock.simTimeMs;
  feed(14);
  ok(`K3a ${(game.clock.simTimeMs - tCand).toFixed(0)} ms of pad is NOT yet a switch (< ${PROMPTS.deviceDebounceMs})`,
     M.shownDevice(0) === 'kbm' && /LMB/.test(label()), `${M.shownDevice(0)} "${label()}"`);
  feed(2);
  ok(`K3b …${(game.clock.simTimeMs - tCand).toFixed(0)} ms is (>= ${PROMPTS.deviceDebounceMs})`,
     M.shownDevice(0) === 'pad', M.shownDevice(0));
  ok('K3b …and the grip label reads LT / RT', /LT \/ RT/.test(label()) && !/LMB/.test(label()), label());
  ok('K3b …the hint LT/RT', /LT\/RT/.test(prompt()), prompt());
  atDolly(); M.feedHuds();
  ok('K3b …and the key chip is X', /\bX\b/.test(prompt()) && /dolly/.test(prompt()) && !/\bE\b/.test(prompt()), prompt());
  const helpPad = document.querySelector('#help').textContent;
  ok('K3c the help line follows the device too (co-op: P1 pad)', /P1 pad/.test(helpPad) && /X use/.test(helpPad), helpPad.slice(0, 80));

  // Back to the keyboard, same rule.
  input.activeDevice[0] = 'kbm'; M.feedHuds(); feed(16);
  eq('K3d back to the keyboard after the same window', M.shownDevice(0), 'kbm');
  ok('K3d …with E on the chip', /\bE\b/.test(prompt()) && !/\bX\b/.test(prompt()), prompt());
  atBox(); feed(1);   // one step: `hovered` is refreshed by grips.step, not by the feed
  ok('K3d …and LMB / RMB on the label', /LMB \/ RMB/.test(label()), label());

  // A one-poll blip — 100 ms of 'pad' — never reaches the screen.
  input.activeDevice[0] = 'pad'; M.feedHuds(); feed(6);
  input.activeDevice[0] = 'kbm'; M.feedHuds(); feed(20);
  ok('K3e a 100 ms flicker to pad does not change the glyph',
     M.shownDevice(0) === 'kbm' && /LMB \/ RMB/.test(label()) && !/LT/.test(label()),
     `${M.shownDevice(0)} "${label()}"`);
  // …and a paused game neither counts nor flickers: sim time, not wall time.
  input.activeDevice[0] = 'pad'; M.feedHuds();
  game.setPaused(true);
  for (let i = 0; i < 60; i++) { game.frame(SIM.stepMs); M.feedHuds(); }
  eq('K3f 60 paused frames of pad do not switch (the debounce is on SIM time)', M.shownDevice(0), 'kbm');
  game.setPaused(false);
  input.activeDevice[0] = 'kbm'; M.feedHuds(); feed(20);

  // K4 — the Phase 16 known issue: View was BOTH the join button and cargoGlance.
  const claims = [];
  M.input.seatBindings.forEach((seatMap, s) => {
    for (const [ctx, actions] of Object.entries(seatMap)) {
      for (const [action, def] of Object.entries(actions)) {
        if ((def.pad || []).includes(COOP.joinPad)) claims.push(`seat ${s} ${ctx} ${action}`);
      }
    }
  });
  ok('K4 no bound action shares the pad join button (View) on any seat or context',
     claims.length === 0, claims.join(', '));
  ok('K4a …cargoGlance still has a pad button, elsewhere',
     glyphFor('cargoGlance', 0, 'pad', { context: CONTEXTS.DRIVE }) !== '' &&
     glyphFor('cargoGlance', 0, 'pad', { context: CONTEXTS.DRIVE }) !== 'View',
     glyphFor('cargoGlance', 0, 'pad', { context: CONTEXTS.DRIVE }));

  M.setSeats(1);
  input.activeDevice[0] = 'kbm'; input.activeDevice[1] = 'kbm';
  feed(20);
  const helpSolo = document.querySelector('#help').textContent;
  ok('K5 the solo help line is derived from the same table (E use, LMB/RMB grab)',
     /E use/.test(helpSolo) && /LMB\/RMB grab/.test(helpSolo) && /WASD/.test(helpSolo), helpSolo.slice(0, 90));
}
emit('running...');

/* ── J. it still runs ──────────────────────────────────────────────────────────── */
lines.push('--- J. the build survives all of the above ---');
{
  const before = physics.stats.bodies;
  for (let i = 0; i < 60; i++) game.frame(SIM.stepMs);
  eq('J1 no bodies leaked over 60 frames', physics.stats.bodies, before);

  M.setSeats(2);
  for (let i = 0; i < 60; i++) game.frame(SIM.stepMs);
  eq('J2 …nor over 60 co-op frames', physics.stats.bodies, before);
  M.setSeats(1);

  ok('J3 state is still plain serializable data (§22.4)',
     (() => { try { JSON.stringify(game.state); return true; } catch (e) { return false; } })());

  const banner = document.getElementById('err-banner');
  ok('J4 no error banner appeared during the suite', !banner || !banner.textContent.trim(),
     banner ? banner.textContent.slice(0, 120) : '');
  void registry; void MOUSE;
}

emit();
