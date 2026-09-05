/* Phase 11 build-side M29 suite — the text size scales the BOXES, and the quality tier switches
 * in the scene that is already running.
 *
 * GDD §21.4 Vision "scalable UI, high contrast"; §21.1 "no persistent panel should cover the
 * object-doorway relationship"; §26.5 "states understandable"; §15.4 / §20.x quality tiers;
 * §25.3 "known limitations closed before external testers".
 *
 * THE TWO CLAIMS, both of them KNOWN_ISSUES entries that had been open since Phase 17:
 *
 *   "Text size scales type, not boxes."  M4's `--ts` multiplied every font-size and left every
 *   BOX in px. Measured before this milestone, in the harness's 1262x624 window: at 1.6x the
 *   help line wanted 1377.9 px and ran off both ends of the window with no scrollbar to say so
 *   (left edge -57.9), and the title card's livery name wanted 735 px of a 647 px plate (the
 *   card's scrollWidth 783 against a clientWidth of 743). S1-S3 are the numbers after.
 *
 *   "Quality tier applies on reload, and the card says so."  The tier decides how many shadow
 *   maps are BUILT, which is a property of the LIGHTS and of nothing else in the frame — so
 *   lighting.setQualityTier disposes the rig and builds the other one against the same scene
 *   and the same room list. Q1-Q3 assert it by COUNTS, because the harness is the software tier
 *   and a pixel would prove nothing there (the eyeball on a real GPU is in PLAYTEST_NOTES).
 *
 * MEASURE, THEN ASSERT. Every number below was read out of the running build first; the ones
 * that read oddly are recorded where they are used — the notices container's scrollWidth is 8 px
 * wider than its content because the entry animation's translateX is frozen under virtual time,
 * and the shell chrome (the debug overlay and the build stamp) overlaps the HUD panels at 1.0x
 * today, which is why the overlap matrix is over the §21.1 panels and the shell boxes are
 * reported rather than asserted.
 *
 * THIS BOOT ASKS FOR THE WALKTHROUGH CARD (m29's trick): the harness page does not build it
 * unless the address says so, and S1 has to measure its clearance over the help line.
 *
 * localStorage 'mfh.save' is cleared at the END (m16's rule): this suite drives the settings
 * store for real, so it writes a save.
 */

// FIRST, before boot reaches the walkthrough (m29 W0's note on why this is safe here).
try { history.replaceState(null, '', location.pathname + '?walkthrough=1'); } catch (e) { /* the suite still runs */ }

import { SETTINGS, WALKTHROUGH, NOTICE } from '../src/config.js';
import { LIGHTING, shadowMapCount, currentLighting } from '../src/render/lighting.js';
import { load, clearSave, SAVE_KEY } from '../src/core/save.js';

const lines = [];
let passes = 0, fails = 0;
function ok(name, cond, detail = '') {
  if (cond) { passes++; lines.push(`PASS  ${name}`); }
  else { fails++; lines.push(`FAIL  ${name}${detail ? '  <- ' + detail : ''}`); }
}
const eq = (n, a, b) => ok(n, a === b, `got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const near = (n, a, b, tol) => ok(n, Math.abs(a - b) <= tol, `got ${a}, want ${b} ±${tol}`);

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

const { game, huds, title, settingsStore, settingsPanel, pauseScreen, invoiceScreen, walkthrough, physics } = M;
const FRAME = 16.667;
const frame = (n = 1) => { for (let i = 0; i < n; i++) game.frame(FRAME); };
const ts = (v) => { settingsStore.apply({ uiScale: v }); frame(); };
const tsNow = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ts'));
const helpEl = () => document.getElementById('help');
const R = (el) => el.getBoundingClientRect();
const fmt = (r) => `${r.left.toFixed(1)},${r.top.toFixed(1)} ${r.width.toFixed(1)}x${r.height.toFixed(1)}`;
/** Laid out and on screen — a hidden panel is not a panel (m11 F2's rule). */
const shown = (el) => !!(el && el.offsetParent && el.getBoundingClientRect().width > 0);

/* THE THREE PREDICATES, one place each.
 *  clipped:  the box is narrower than the text in it (scrollWidth over clientWidth).
 *  overlap:  two rects share area, with a half-pixel of slack for subpixel edges.
 *  centre:   m11 O5's §21.1 predicate, measured against the HOST rect rather than the window,
 *            so a half-width co-op HUD is judged against its own half (m36 S2). */
const clipped = (el) => el.scrollWidth > el.clientWidth + 0.5;
const overlap = (a, b) => (a.left < b.right - 0.5 && b.left < a.right - 0.5 &&
                           a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5);
function outsideCentre(r, host) {
  const b = host.getBoundingClientRect();
  const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
  const wx = b.width / 6, wy = b.height / 6;
  return r.right < cx - wx || r.left > cx + wx || r.bottom < cy - wy || r.top > cy + wy;
}

/** The §21.1 panel set. `.prompt` is deliberately NOT in the centre-third list — §21.1 allows
 *  "one line of prompt directly beneath" the reticle — but it IS in the overlap matrix. */
const CENTRE_SELS = ['.contract', '.objective', '.cargo-status', '.notices', '.route-bar', '.caption'];
const PANEL_SELS = [...CENTRE_SELS, '.prompt'];

/** One HUD, fed the way the render loop feeds it, with exactly ONE notice (§8.4 "one small cost
 *  notice") — a full stack of NOTICE.maxStack is measured separately at the end of S1. */
function feed(h, notices = 1) {
  h.setContract({ phase: 'pickup', delivered: 2, total: 23, loaded: 4, roomCorrect: 1, elapsedMin: 12.4, estimateMin: 18 });
  h.setCargo({ loadedCount: 4, totalMass: 132, unsecuredFraction: 0.8, quality: 0.42, volumeFraction: 0.31 });
  h.setPrompt({ primary: 'pick up the flat dolly', secondary: 'rotate' });
  h.setObjective('carry a box to the truck on the driveway');
  h.setCaption('a box lands hard', '→');
  h.setRoute({ state: 'driving', progress: 0.42, event: 'roadworks — slow down' });
  h.clearNotices();
  for (let i = 0; i < notices; i++) h.notice(`television — cracked · $315`, 'damage');
}

/** Every §21.1 panel of one HUD, plus the shell's help line, as {name, el, rect}. */
function boxesOf(hud, withHelp = true) {
  const out = [];
  for (const sel of PANEL_SELS) {
    const el = hud.el.querySelector(sel);
    if (shown(el)) out.push({ name: sel, el, rect: R(el) });
  }
  if (withHelp && shown(helpEl())) out.push({ name: '#help', el: helpEl(), rect: R(helpEl()) });
  const wt = document.getElementById('walkthrough');
  if (withHelp && shown(wt)) out.push({ name: '#walkthrough', el: wt, rect: R(wt) });
  return out;
}

/** How many lines the help line is on right now — the same arithmetic main.js measures
 *  --help-lift from, recomputed here so the suite is not asserting main.js against itself. */
function helpRows() {
  const el = helpEl();
  const cs = getComputedStyle(el);
  const lh = parseFloat(cs.lineHeight);
  const inner = el.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
  return { rows: Math.max(1, Math.round(inner / lh)), lh, width: R(el).width };
}

try {

/* ── S1. the boxes hold the type at 1.0, 1.3 and 1.6 (§21.4 Vision, §21.1) ───────────────── */
lines.push('--- S1. text size scales the boxes (GDD §21.4 Vision, §21.1) ---');
{
  const hud = huds[0];
  feed(hud);
  frame();
  eq('S1 --ts starts at 1', tsNow(), 1);
  const base = {};
  for (const b of boxesOf(hud)) base[b.name] = b.rect;

  for (const scale of [1, 1.3, 1.6]) {
    ts(scale);
    feed(hud);
    frame();
    const tag = `${scale}×`;
    const hr = helpRows();
    // 1. THE HELP LINE. Never clipped, never past the window, and inside the line budget.
    ok(`S1 ${tag} the help line is not clipped (scrollWidth ≤ clientWidth)`, !clipped(helpEl()),
       `${helpEl().scrollWidth} / ${helpEl().clientWidth}`);
    const hrect = R(helpEl());
    ok(`S1 ${tag} …and inside the window (${hrect.left.toFixed(1)}..${hrect.right.toFixed(1)} of ${window.innerWidth})`,
       hrect.left >= -0.5 && hrect.right <= window.innerWidth + 0.5, fmt(hrect));
    ok(`S1 ${tag} …on ≤ SETTINGS.textSize.helpMaxLines lines`, hr.rows <= SETTINGS.textSize.helpMaxLines,
       `${hr.rows} rows of ${hr.lh.toFixed(2)} px, box ${hr.width.toFixed(1)} px wide`);
    if (scale === 1) eq('S1 1× …and exactly one line at 1.0×', hr.rows, 1);
    if (scale === 1.6) eq('S1 1.6× …and two at 1.6× (the wrap, not a clip)', hr.rows, 2);
    // 2. NO PANEL CLIPS ITS OWN TEXT. The notices CONTAINER is measured through its children:
    // the entry animation (noticeIn, translateX(8px)) is frozen at its from-state under virtual
    // time, which puts 8 px of transform into the container's scrollWidth and nothing into the
    // notice's own (measured 177/169 against a child's 165/165).
    const clippers = [];
    for (const b of boxesOf(hud, false)) {
      if (b.name === '.notices') {
        for (const kid of b.el.querySelectorAll('.notice')) if (clipped(kid)) clippers.push('.notice');
      } else if (clipped(b.el)) clippers.push(`${b.name} ${b.el.scrollWidth}/${b.el.clientWidth}`);
    }
    ok(`S1 ${tag} no HUD panel clips its own text`, clippers.length === 0, clippers.join(', '));
    // 3. NO PANEL OVERLAPS ANOTHER — every pair, including the help line and the card over it.
    const bs = boxesOf(hud);
    const hits = [];
    for (let i = 0; i < bs.length; i++) {
      for (let j = i + 1; j < bs.length; j++) {
        if (overlap(bs[i].rect, bs[j].rect)) hits.push(`${bs[i].name}×${bs[j].name}`);
      }
    }
    ok(`S1 ${tag} no panel overlaps another (${bs.length} boxes, ${bs.length * (bs.length - 1) / 2} pairs)`,
       hits.length === 0, hits.join(', '));
    // 4. m11 O5's centre third, at every size.
    const inside = bs.filter((b) => CENTRE_SELS.includes(b.name) && !outsideCentre(b.rect, hud.el));
    ok(`S1 ${tag} §21.1: the centre third is clear (m11 O5's predicate)`, inside.length === 0,
       inside.map((b) => `${b.name} ${fmt(b.rect)}`).join(', '));
    lines.push(`      ${tag} help ${fmt(hrect)} ${hr.rows} row(s), lift ${M.helpMetrics.lift.toFixed(2)} px, ` +
               `contract ${fmt(R(hud.contract))}, cargo ${fmt(R(hud.cargoStatus))}`);
  }

  /* S1b — the walkthrough card (M22) still clears the help line by WALKTHROUGH.clearancePx at
   * every size. Its bottom is MEASURED from the help line's live top, so a wrapped line moves
   * it up rather than under it. */
  ts(1);
  M.title.start();
  frame(2);
  const card = document.getElementById('walkthrough');
  ok('S1b the first-minute card is up (?walkthrough=1)', shown(card), card ? `hidden=${card.hidden}` : 'no card');
  for (const scale of [1, 1.3, 1.6]) {
    ts(scale);
    frame(2);
    const gap = R(helpEl()).top - R(card).bottom;
    near(`S1b ${scale}× the card clears the help line by WALKTHROUGH.clearancePx`, gap, WALKTHROUGH.clearancePx, 1.0);
    ok(`S1b ${scale}× …and stays out of the centre third`, outsideCentre(R(card), huds[0].el), fmt(R(card)));
  }
  ts(1);
  frame();

  /* S1c — every card fits the window without a horizontal scrollbar. The title card is the one
   * that did not: its livery name is three inline boxes with margins and no space between them,
   * so it cannot wrap, and at 1.6× it wanted 735 px of a 647 px plate. */
  const cards = [];
  let titleV = null;
  const cardOf = (sel) => document.querySelector(sel);
  for (const scale of [1, 1.3, 1.6]) {
    ts(scale);
    settingsPanel.show();
    game.setPaused(true);
    frame();
    const set = [['#title-screen .card', 'title'], ['#settings-screen .card', 'settings'],
                 ['#pause-screen .card', 'pause']];
    for (const [sel, name] of set) {
      const el = cardOf(sel);
      if (!el) continue;
      // A card that is not laid out has scrollWidth === clientWidth === 0 and passes every
      // predicate below without measuring anything. Say out loud that it is a real box first.
      ok(`S1c0 ${scale}× the ${name} card is laid out where it is measured (not a 0×0 box)`,
         el.clientWidth > 100 && el.clientHeight > 100, `${el.clientWidth}×${el.clientHeight}`);
      ok(`S1c ${scale}× the ${name} card fits without a horizontal scrollbar`, !clipped(el),
         `${el.scrollWidth} / ${el.clientWidth}`);
      const r = R(el);
      ok(`S1c ${scale}× …and inside the window`, r.left >= -0.5 && r.right <= window.innerWidth + 0.5, fmt(r));
      /* VERTICAL is a different question, and this milestone moved it: the title card lost its
       * horizontal scrollbar (that is the fix) and got those 15 px of clientHeight back, and
       * `#title-screen .cols` now scales its column minimum with the type, so at 1.6× the control
       * list is one readable column instead of two cramped ones. Nothing is lost — the card
       * scrolls inside max-height: 94vh — but the suite that owns the change should be able to
       * see which way it went instead of only the suite it re-pinned (m31 B2). */
      ok(`S1c ${scale}× …and any vertical overflow is reachable (overflow auto), never cut off`,
         el.scrollHeight <= el.clientHeight || /auto|scroll/.test(getComputedStyle(el).overflowY),
         `v ${el.scrollHeight}/${el.clientHeight}, overflow-y ${getComputedStyle(el).overflowY}`);
      cards.push(`${name}@${scale} ${el.scrollWidth}/${el.clientWidth} v${el.scrollHeight}/${el.clientHeight}`);
      if (name === 'title' && scale === 1.6) titleV = [el.scrollHeight, el.clientHeight];
    }
    settingsPanel.hide();
    game.setPaused(false);
    frame();
  }
  /* …and the number itself, pinned HERE as well as in m31 B2, so the milestone's own suite fails
   * if it moves again. 758/570 was the reading before M29; the horizontal scrollbar going is
   * where the 15 px of clientHeight came from. */
  ok('S1c1 the title card\'s 1.6× vertical overflow is the recorded 786/585 (±4) — it was 758/570 before M29, when the card still had a horizontal scrollbar',
     !!titleV && Math.abs(titleV[0] - 786) <= 4 && Math.abs(titleV[1] - 585) <= 4, titleV ? `${titleV[0]}/${titleV[1]}` : 'not measured');
  // The settlement sheet, which needs the contract settled to exist on screen.
  M.settle();
  frame();
  for (const scale of [1, 1.3, 1.6]) {
    ts(scale);
    frame();
    const el = cardOf('#settlement .sheet');
    ok(`S1c ${scale}× the settlement sheet fits without a horizontal scrollbar`, !clipped(el),
       `${el.scrollWidth} / ${el.clientWidth}`);
    cards.push(`settlement@${scale} ${el.scrollWidth}/${el.clientWidth} ${fmt(R(el))}`);
  }
  lines.push(`      cards: ${cards.join(' · ')}`);
  ts(1);
  invoiceScreen.onReplay();
  frame();

  /* S1d — THE SHELL CHROME, which is not in S1's overlap matrix, and this is where that is paid
   * for. The build stamp and the help line have shared the bottom edge since long before this
   * milestone — 167.9 × 25.4 px of overlap at 1.0× in the shipping build — so putting them in the
   * matrix would have failed before M29 as well as after, and the debug overlay sits on the
   * contract panel by design (both at 10, 10). What CAN be said about the stamp is said here:
   * it never clips its own text, never leaves the window and never reaches the working area, at
   * every size. The overlap itself is PINNED at 1.0×, so it cannot quietly grow, and PRINTED at
   * 1.6×, where the wrapped help line covers the stamp completely (KNOWN_ISSUES: the stamp is the
   * open half of this milestone, and this is the number that says by how much). */
  const stampEl = document.getElementById('build-stamp');
  ok('S1d the build stamp is on screen (the readings below are of a real box)', shown(stampEl),
     stampEl ? fmt(R(stampEl)) : 'no stamp');
  let stampOverlap = null;
  for (const scale of [1, 1.3, 1.6]) {
    ts(scale);
    feed(huds[0]);
    frame();
    const sr = R(stampEl), hr2 = R(helpEl());
    ok(`S1d ${scale}× the build stamp does not clip its own text`, !clipped(stampEl),
       `${stampEl.scrollWidth} / ${stampEl.clientWidth}`);
    ok(`S1d ${scale}× …and stays inside the window`,
       sr.left >= -0.5 && sr.right <= window.innerWidth + 0.5 && sr.top >= -0.5 && sr.bottom <= window.innerHeight + 0.5,
       fmt(sr));
    ok(`S1d ${scale}× …and out of the working area (§21.1's centre third)`, outsideCentre(sr, huds[0].el), fmt(sr));
    const ox = Math.max(0, Math.min(sr.right, hr2.right) - Math.max(sr.left, hr2.left));
    const oy = Math.max(0, Math.min(sr.bottom, hr2.bottom) - Math.max(sr.top, hr2.top));
    if (scale === 1) stampOverlap = [ox, oy];
    lines.push(`      ${scale}× shell chrome: stamp ${fmt(sr)} vs help ${fmt(hr2)} → overlap ${ox.toFixed(1)}×${oy.toFixed(1)} px`);
  }
  near('S1d the 1.0× stamp/help overlap is the pre-existing 167.9 px wide, not one this milestone widened',
       stampOverlap[0], 167.9, 2);
  near('S1d …and 25.4 px tall (the stamp sits inside the single-row line, as it did before M29)',
       stampOverlap[1], 25.4, 2);
  // …and the full notice stack, which is the one panel that can reach the working area at 1.6×.
  feed(huds[0], NOTICE.maxStack);
  frame();
  const nr = R(huds[0].notices);
  lines.push(`      1.6× ${NOTICE.maxStack} notices: ${fmt(nr)}; centre band starts at ` +
             `${(window.innerHeight / 2 + window.innerHeight / 6).toFixed(1)} px ` +
             `→ ${outsideCentre(nr, huds[0].el) ? 'clear' : 'INSIDE'}`);
  feed(huds[0]);
  frame();

  /* S1e — WHY the title card is the one CARD on SETTINGS.textSize.pxAllowed. Everything inside it
   * scales; its own width does not, because the §21.2 brief sheet is pinned beside it and m31 B2
   * requires 8 px of clearance between them inside the window. Measured rather than argued: give
   * the card the rule it would have had if it scaled, and evaluate m31 B2's own predicate. */
  const tcard = document.querySelector('#title-screen .card');
  const tbrief = document.querySelector('#title-screen .brief');
  ok('S1e the title card and its §21.2 brief sheet are both laid out (a real measurement)',
     !!tcard && !!tbrief && tcard.clientWidth > 100 && tbrief.clientWidth > 40,
     tcard && tbrief ? `card ${tcard.clientWidth}, brief ${tbrief.clientWidth}` : 'missing');
  const b2clear = () => { const c = R(tcard), b = R(tbrief);
    return !tcard.contains(tbrief) && b.left >= c.right + 8 && b.right <= window.innerWidth - 8; };
  const keptW = R(tcard).width;
  ok('S1e m31 B2 holds at 1.6× with the card as shipped (the sheet is beside it, 8 px off the edge)',
     b2clear(), `card ${fmt(R(tcard))} brief ${fmt(R(tbrief))}`);
  tcard.style.width = 'calc(760px * var(--ts))';   // the rule the box would carry if it scaled
  void tcard.offsetHeight;
  const wouldBe = R(tcard), briefThen = R(tbrief), brokeB2 = !b2clear();
  tcard.style.removeProperty('width');
  void tcard.offsetHeight;
  ok('S1e …and a scaled 1.6× card breaks it — which is the reason on the allow-list, measured',
     brokeB2, `card would be ${wouldBe.width.toFixed(1)} px wide (right ${wouldBe.right.toFixed(1)}), sheet at ${briefThen.left.toFixed(1)}`);
  ok('S1e …so SETTINGS.textSize.pxAllowed still names it, and only its width',
     (SETTINGS.textSize.pxAllowed['#title-screen .card'] || []).join(',') === 'width');
  near('S1e …and the card is back on its own width afterwards', R(tcard).width, keptW, 0.5);

  /* S1f — SETTINGS.textSize.helpMaxLines is a BUDGET, and this is the assertion that it is spent
   * rather than written down. The settings range stops at 1.6× and 1.6× fits in two rows in this
   * 1262 px window, so the case is forced the only way a fixed-size harness can force it: the
   * variable itself, set past the range, standing in for the narrower windows this build will
   * meet. main.js steps SETTINGS.textSize.helpSqueeze down until the line fits, because a third
   * row would lift the route bar and the caption into the working area (§21.1). */
  const rootEl = document.documentElement;
  rootEl.style.setProperty('--ts', '3.2');
  const forced = M.syncHelpMetrics();
  ok('S1f a text size past the settings range still lands inside SETTINGS.textSize.helpMaxLines',
     !!forced && forced.rows <= SETTINGS.textSize.helpMaxLines, forced ? `${forced.rows} rows` : 'no metrics');
  ok('S1f …by spending the squeeze ladder, not by clipping or by lifting a third row',
     !!forced && forced.squeeze < 1 && SETTINGS.textSize.helpSqueeze.includes(forced.squeeze),
     forced ? `squeeze ${forced.squeeze}` : '');
  ok('S1f …and the line is still not clipped at that size', !clipped(helpEl()),
     `${helpEl().scrollWidth} / ${helpEl().clientWidth}`);
  near('S1f …and the font on screen is 12px × --ts × the squeeze',
       parseFloat(getComputedStyle(helpEl()).fontSize), 12 * 3.2 * (forced ? forced.squeeze : 1), 0.06);
  lines.push(`      forced 3.2×: ${forced ? forced.rows : '?'} rows at squeeze ${forced ? forced.squeeze : '?'}, ` +
             `help ${fmt(R(helpEl()))}, font ${getComputedStyle(helpEl()).fontSize}`);
  rootEl.style.setProperty('--ts', '1');
  const back = M.syncHelpMetrics();
  eq('S1f back at 1.0× the ladder is unspent again', back.squeeze, SETTINGS.textSize.helpSqueeze[0]);
  eq('S1f …and --help-squeeze reads 1 on the root', rootEl.style.getPropertyValue('--help-squeeze'), '1');
  eq('S1f …and the metrics say the budget was never exceeded there', back.overBudget, false);

  /* S1g — THE FLOOR, which S1f does not reach. The ladder ends at 0.72 and no ladder fits every
   * window, so the case that matters is the one where it RUNS OUT: rows over budget, --help-lift
   * two line heights or more, and the route bar and the caption lifted into the working area
   * (§21.1). Before this it happened in silence — the loop simply ended and nothing said so.
   * Forced far past the settings range (12×, standing in for a phone-width window at 160 %), and
   * asserted on both the flag the suites can pin and the one console line a player's log gets. */
  const capturedWarns = [];
  const realWarnS = console.warn;
  console.warn = (...a) => { capturedWarns.push(a.join(' ')); };
  rootEl.style.setProperty('--ts', '12');
  const past = M.syncHelpMetrics();
  console.warn = realWarnS;
  const floorF = SETTINGS.textSize.helpSqueeze[SETTINGS.textSize.helpSqueeze.length - 1];
  ok('S1g a size the ladder cannot fit spends it to the floor', !!past && past.squeeze === floorF,
     past ? `squeeze ${past.squeeze}, floor ${floorF}` : 'no metrics');
  ok('S1g …and the line really is still over SETTINGS.textSize.helpMaxLines there',
     !!past && past.rows > SETTINGS.textSize.helpMaxLines,
     past ? `${past.rows} rows, budget ${SETTINGS.textSize.helpMaxLines}` : '');
  eq('S1g …so the lapse is REPORTED, not silent: helpMetrics.overBudget', past.overBudget, true);
  ok('S1g …and it is on the read-only copy the api hands out, which is what a suite or an overlay sees',
     M.helpMetrics.overBudget === true && M.helpMetrics.rows === past.rows,
     `${M.helpMetrics.rows} rows, overBudget ${M.helpMetrics.overBudget}`);
  ok('S1g …and exactly one console line said so, naming the budget and the lift',
     capturedWarns.length === 1 && /helpMaxLines/.test(capturedWarns[0]) &&
     capturedWarns[0].includes(past.lift.toFixed(1)),
     capturedWarns.join(' | ') || 'nothing logged');
  lines.push(`      forced 12×: ${past.rows} rows at the floor squeeze ${past.squeeze}, ` +
             `lift ${past.lift.toFixed(1)}px, overBudget ${past.overBudget} — logged once`);
  rootEl.style.setProperty('--ts', '1');
  const recovered = M.syncHelpMetrics();
  eq('S1g …and the lapse does not stick: back at 1.0× the flag clears', recovered.overBudget, false);
  eq('S1g …with the ladder unspent again', recovered.squeeze, SETTINGS.textSize.helpSqueeze[0]);
  eq('S1g …and --help-lift back at the identity value', recovered.lift, 0);
  ts(1);
  frame();
}

/* ── S2. co-op at 1.6×, and 1.0× is bit-for-bit the layout it was ────────────────────────── */
lines.push('--- S2. co-op halves, and the 1.0× rects come back (GDD §6.4, §21.1) ---');
{
  // The recorded Phase 15 rects, at 1.0×, before anything is scaled.
  ts(1);
  for (const h of huds) feed(h);
  frame();
  const before = {};
  for (const b of boxesOf(huds[0])) before[b.name] = b.rect;

  M.setSeats(2);
  // The render loop is what pins each HUD over its half (feedHuds → setRect), and it never runs
  // headless — so the suite calls it, exactly as m12 does, before feeding its own fixture in.
  M.feedHuds();
  frame();
  for (const h of huds) feed(h);
  frame();
  eq('S2 two seats', M.seatCount, 2);
  ok('S2a …and each HUD is pinned over its own half (the divider is between them)',
     huds[0].el.classList.contains('split') && huds[1].el.classList.contains('split') &&
     R(huds[1].el).left >= R(huds[0].el).right && R(huds[0].el).width < window.innerWidth * 0.55,
     `${fmt(R(huds[0].el))} | ${fmt(R(huds[1].el))}`);
  // S1's predicates, in both halves, at all three sizes (§21.1's guard is per HALF in co-op).
  for (const scale of [1, 1.3, 1.6]) {
    ts(scale);
    for (const h of huds) feed(h);
    frame();
    const hr = helpRows();
    ok(`S2 ${scale}× co-op: the two-seat help line is inside the line budget`,
       hr.rows <= SETTINGS.textSize.helpMaxLines, `${hr.rows} rows, ${hr.width.toFixed(1)} px wide`);
    ok(`S2 ${scale}× …and not clipped`, !clipped(helpEl()), `${helpEl().scrollWidth} / ${helpEl().clientWidth}`);
    for (const seat of [0, 1]) {
      const hud = huds[seat];
      const bs = boxesOf(hud, false);
      const clippers = bs.filter((b) => b.name !== '.notices' && clipped(b.el)).map((b) => b.name);
      ok(`S2 ${scale}× seat ${seat} no panel clips in its half`, clippers.length === 0, clippers.join(','));
      const hits = [];
      for (let i = 0; i < bs.length; i++) {
        for (let j = i + 1; j < bs.length; j++) if (overlap(bs[i].rect, bs[j].rect)) hits.push(`${bs[i].name}×${bs[j].name}`);
      }
      ok(`S2 ${scale}× seat ${seat} no panel overlaps another`, hits.length === 0, hits.join(','));
      const inside = bs.filter((b) => CENTRE_SELS.includes(b.name) && !outsideCentre(b.rect, hud.el));
      ok(`S2 ${scale}× seat ${seat} §21.1: its own half's centre third is clear`, inside.length === 0,
         inside.map((b) => `${b.name} ${fmt(b.rect)}`).join(','));
      if (scale === 1.6) {
        lines.push(`      1.6× seat ${seat} half ${fmt(R(hud.el))} contract ${fmt(R(hud.contract))} notices ${fmt(R(hud.notices))}`);
      }
    }
  }

  // …and back. Solo, 1.0×: every rect returns to the number it had before any of this.
  ts(1);
  M.setSeats(1);
  M.feedHuds();               // …and back to the full frame (clearRect), the same way
  frame();
  for (const h of huds) feed(h);
  frame();
  const moved = [];
  for (const b of boxesOf(huds[0])) {
    const was = before[b.name];
    if (!was) continue;
    for (const k of ['left', 'top', 'width', 'height']) {
      if (Math.abs(b.rect[k] - was[k]) > 0.5) moved.push(`${b.name}.${k} ${was[k].toFixed(1)}→${b.rect[k].toFixed(1)}`);
    }
  }
  ok('S2 back at 1.0× every recorded rect returns within 0.5 px (m11 O-series numbers)',
     moved.length === 0, moved.join(', '));
  eq('S2 …and --help-lift is 0 px again', getComputedStyle(document.documentElement).getPropertyValue('--help-lift').trim(), '0.00px');
  eq('S2 …and the squeeze ladder is unspent again (--help-squeeze 1), so the type is full size too',
     getComputedStyle(document.documentElement).getPropertyValue('--help-squeeze').trim(), '1');
}

/* ── S3. the stylesheet walk: no raw px box left (the m16 U1e discipline, for boxes) ─────── */
lines.push('--- S3. every box is relative (GDD §21.4 Vision) ---');
{
  /* CSSOM, never fetch: a fetch() started after load never resolves under the harness's
   * --virtual-time-budget (KNOWN_ISSUES Phase 17, measured — m16 stalled on it). */
  const sheet = Array.from(document.styleSheets).find((s) => s.href && /styles\.css/.test(s.href));
  ok('S3 the stylesheet is readable from the CSSOM', !!sheet && !!sheet.cssRules);
  const rules = [];
  (function walk(list) { for (const r of list) { if (r.style) rules.push(r); if (r.cssRules) walk(r.cssRules); } })(sheet.cssRules);
  const PROPS = ['width', 'min-width', 'max-width'];
  const allowed = SETTINGS.textSize.pxAllowed;
  const raw = [], allowedSeen = [];
  let boxes = 0;
  for (const r of rules) {
    for (const p of PROPS) {
      const v = r.style.getPropertyValue(p);
      if (!v) continue;
      // A zero length is not a box: 0px scales to 0px. Anything else with px in it must either
      // multiply by --ts or be listed in SETTINGS.textSize.pxAllowed with its reason.
      const pxTerms = v.match(/-?\d*\.?\d+px/g) || [];
      if (!pxTerms.length || pxTerms.every((t) => parseFloat(t) === 0)) continue;
      boxes++;
      if (/var\(--ts\)/.test(v)) continue;
      const list = allowed[r.selectorText];
      if (list && list.includes(p)) { allowedSeen.push(`${r.selectorText}{${p}}`); continue; }
      raw.push(`${r.selectorText} { ${p}: ${v} }`);
    }
  }
  ok('S3 styles.css: no raw px width / min-width / max-width outside SETTINGS.textSize.pxAllowed',
     raw.length === 0, raw.join(' | '));
  ok('S3a …over the whole stylesheet, not a sample', boxes >= 20, `${boxes} box declarations in ${rules.length} rules`);
  const unused = Object.keys(allowed).filter((sel) => !allowedSeen.some((s) => s.startsWith(sel + '{')));
  ok('S3b …and every entry on the allow-list is still a real rule (no stale exemption)',
     unused.length === 0, unused.join(','));
  lines.push(`      ${boxes} box declarations, ${allowedSeen.length} deliberately px: ${allowedSeen.join(' ')}`);
}

/* ── Q. the quality tier, in a scene that is already running (§15.4, §21.4) ──────────────── */
lines.push('--- Q. the quality tier switches live (GDD §15.4, §21.4, §26.6) ---');
{
  const warns = [];
  const realWarn = console.warn, realErr = console.error;
  console.warn = (...a) => { warns.push('warn: ' + a.join(' ')); realWarn.apply(console, a); };
  console.error = (...a) => { warns.push('error: ' + a.join(' ')); realErr.apply(console, a); };

  const scene = M.world.scene;
  const bootTier = M.qualityTier;
  const bootChildren = scene.children.length;
  const bootTextures = M.renderer.info.memory.textures;
  const bootGeometries = M.renderer.info.memory.geometries;
  const bootBodies = physics.stats.bodies;
  const gpuT = LIGHTING.tiers.gpu, softT = LIGHTING.tiers.software;
  /* §22.4 / m0 E8: the switch must not touch the contract. Snapshotted ACROSS THE CALL and
   * nothing else — a game.frame() either side moves every position, which would be the sim
   * running, not the tier writing. */
  let bootState = '';
  const acrossSwitch = (name, tier) => {
    const was = JSON.stringify(game.state);
    settingsStore.apply({ tier });
    eq(name, JSON.stringify(game.state), was);
    return was;
  };

  eq('Q1 the harness boots on the software tier', bootTier, 'software');
  eq('Q1a …with one shadow map (the sun) and no room lights', `${shadowMapCount()}/${M.world.roomLights.length}`, '1/0');
  eq('Q1b …at the software row\'s map size', M.world.sun.shadow.mapSize.width, softT.sunShadowMap);
  lines.push(`      boot: ${bootChildren} scene children, ${bootTextures} textures, ${bootGeometries} geometries, ${bootBodies} bodies`);
  ok('Q1b1 …and nothing is UPLOADED yet, which is why the memory numbers below are measured ' +
     'around a present() and not around boot', bootTextures === 0, `${bootTextures} textures`);

  // A no-op switch is still a real rebuild: dispose, build, and land back on the same numbers.
  settingsStore.apply({ tier: 'software' });
  frame();
  eq('Q1c software → software rebuilds and the scene child count is unchanged', scene.children.length, bootChildren);
  eq('Q1d …and the map count is unchanged', shadowMapCount(), 1);
  eq('Q1e …and no light was left behind (renderer texture count)', M.renderer.info.memory.textures, bootTextures);

  // …and UP, with no reload.
  acrossSwitch('Q1l game.state is untouched across the switch (m0 E8\'s equality)', 'gpu');
  frame();
  eq('Q1 apply({tier:"gpu"}) switches the live tier with no reload', M.qualityTier, 'gpu');
  eq('Q1f …the sun\'s map is the gpu row\'s size', M.world.sun.shadow.mapSize.width, gpuT.sunShadowMap);
  eq('Q1g …six room lights are in the scene', M.world.roomLights.length, 6);
  eq('Q1h …four shadow maps in total (the sun + the pickup house\'s three)', shadowMapCount(), 4);
  eq('Q1i …and the scene grew by exactly those lights and their targets', scene.children.length, bootChildren + 12);
  eq('Q1j …the renderer\'s shadow filter followed the tier', M.renderer.shadowMap.type, M.THREE.VSMShadowMap);
  ok('Q1k …the rig lighting.js hands out is the one in the scene',
     currentLighting().sun === M.world.sun && currentLighting().roomLights.length === 6);
  eq('Q1m …and so is the physics world', physics.stats.bodies, bootBodies);

  // …and back DOWN, which is where a leak would show.
  bootState = acrossSwitch('Q1t …and untouched on the way back down too', 'software');
  frame();
  eq('Q1n back to software: the live tier', M.qualityTier, 'software');
  eq('Q1o …the room lights are gone', M.world.roomLights.length, 0);
  eq('Q1p …one shadow map again, at the software size',
     `${shadowMapCount()}/${M.world.sun.shadow.mapSize.width}`, `1/${softT.sunShadowMap}`);
  eq('Q1q …scene.children is back at the boot value (no leak)', scene.children.length, bootChildren);
  eq('Q1r …renderer.info.memory.textures is back at the boot value', M.renderer.info.memory.textures, bootTextures);
  /* Both sides of this are 0 and the assertion says so: nothing is uploaded before a present()
   * (Q1b1), so this is the SCENE-GRAPH half of the claim — the switch added and removed no
   * geometry while nothing was resident. The half that costs something is Q2f1, around real
   * frames, where the count is in the hundreds. */
  eq('Q1s …and geometries never moved while none were resident (0 → 0; the real proof is Q2f1)',
     M.renderer.info.memory.geometries, bootGeometries);
  ok('Q1t1 …and the state snapshot the switch was measured against was a real one',
     bootState.length > 200 && /"manifest"/.test(bootState), `${bootState.length} chars`);

  // The card no longer promises the next session.
  const note = Array.from(document.querySelectorAll('#settings-screen .set-note'))
    .map((p) => p.textContent).join(' | ');
  const tierRow = document.querySelector('#settings-screen [data-setting="tier"]');
  ok('Q1u the Quality row exists on the card', !!tierRow);
  const rowNote = tierRow ? tierRow.closest('.set-row').nextElementSibling : null;
  /* settings.js emits the note ONLY when the row has one, so `nextElementSibling` is the next
   * row's <label> on a row that says nothing — and a card with no note at all would pass "no
   * reload" while telling the player nothing. Assert the sibling IS the note first. */
  ok('Q1v0 the sibling measured IS the Quality row\'s own note paragraph, not the next row',
     !!rowNote && rowNote.classList.contains('set-note') && rowNote.textContent.trim().length > 40,
     rowNote ? `${rowNote.tagName}.${rowNote.className}: ${rowNote.textContent.trim().slice(0, 48)}` : 'no sibling');
  ok('Q1v …and its note no longer says the change waits for a reload',
     !!rowNote && !/reload/i.test(rowNote.textContent), rowNote ? rowNote.textContent : note);
  ok('Q1v1 …and it still says what a live switch cannot do (the surfaces follow the next load)',
     !!rowNote && /straight away/i.test(rowNote.textContent) && /loads?\b/i.test(rowNote.textContent),
     rowNote ? rowNote.textContent : note);

  /* Q2 — a frame still renders on each tier. present() is what the render loop calls (shadow
   * maps once, every seat, then post); the GPU tier's pass is measured here rather than assumed,
   * because on SwiftShader four shadow maps is the most expensive thing this build can ask for
   * (the header of lighting.js has the numbers that made the tier exist at all). */
  /* `info.render.frame` is the counter that survives: `calls` is reset at the top of every
   * render (info.autoReset), so two presents of the same scene read the same number and a
   * present that did nothing would be indistinguishable from one that worked. */
  const programsBefore = M.renderer.info.programs ? M.renderer.info.programs.length : 0;
  const frame0 = M.renderer.info.render.frame;
  const tex0 = M.renderer.info.memory.textures;
  M.present();
  const softCalls = M.renderer.info.render.calls;
  const softTris = M.renderer.info.render.triangles;
  const softTex = M.renderer.info.memory.textures - tex0;
  const softGeo = M.renderer.info.memory.geometries;   // the scene, now actually resident (Q2f1)
  ok('Q2 a frame presents on the software tier after the round trip',
     M.renderer.info.render.frame > frame0 && softCalls > 0,
     `frame ${frame0} → ${M.renderer.info.render.frame}, ${softCalls} draw calls`);
  /* The CEILING for Q2f2, read BEFORE the switch. Traversed afterwards it would rise by exactly
   * whatever a future setQualityTier added, so a tier that DID upload a mesh of its own would
   * still pass. Captured here it is the software scene's own geometry and nothing else. */
  const sceneGeosBefore = new Set();
  scene.traverse((o) => { if (o.geometry) sceneGeosBefore.add(o.geometry.uuid); });
  settingsStore.apply({ tier: 'gpu' });
  frame();
  const frame1 = M.renderer.info.render.frame;
  const tex1 = M.renderer.info.memory.textures;
  M.present();
  const gpuCalls = M.renderer.info.render.calls;
  const gpuTris = M.renderer.info.render.triangles;
  const gpuTex = M.renderer.info.memory.textures - tex1;
  const gpuGeo = M.renderer.info.memory.geometries;
  ok('Q2a …and on the gpu tier, with its four shadow maps, with no console error',
     M.renderer.info.render.frame > frame1 && gpuCalls > 0 &&
     warns.filter((w) => w.startsWith('error')).length === 0,
     `frame ${frame1} → ${M.renderer.info.render.frame}, ${gpuCalls} calls; ${warns.join(' | ')}`);
  /* THE PROOF THAT THE REBUILT MAPS ARE REAL. A shadow map is a render target the renderer
   * allocates the first time it renders that light, so the frame after the switch ALLOCATES the
   * tier's maps — one texture each under PCFSoft, two under VSM (r128 keeps a mapPass for the
   * blur). Counting them is what a software rasteriser can honestly say about a shadow it
   * cannot photograph; the eyeball on a real GPU is in PLAYTEST_NOTES. */
  ok('Q2a1 …and that frame ALLOCATES the tier\'s shadow maps (renderer.info.memory.textures)',
     gpuTex >= shadowMapCount(), `gpu tier allocated ${gpuTex} for ${shadowMapCount()} maps; software allocated ${softTex} for 1`);
  const programsAfter = M.renderer.info.programs ? M.renderer.info.programs.length : 0;
  ok('Q2b …and the program count stays inside the Phase 15 bound of 40', programsAfter <= 40,
     `${programsBefore} → ${programsAfter}`);
  // No wall clock here on purpose: Date.now() is the VIRTUAL clock under the harness's
  // --virtual-time-budget and reads 0 ms for work that really took seconds.
  /* The two frames report the SAME draw calls and triangles, and that is r128, not a missing
   * pass: WebGLRenderer.render() runs shadowMap.render() BEFORE `info.reset()`, so a shadow
   * pass's buffers are counted and then zeroed. The +8 textures above is where the four VSM
   * maps (map + mapPass each) actually show up. Recorded so nobody reads 259 = 259 as a rebuild
   * that did nothing. */
  lines.push(`      present(): software ${softCalls} calls / ${softTris} tris / +${softTex} textures, ` +
             `gpu ${gpuCalls} calls / ${gpuTris} tris / +${gpuTex} textures; programs ${programsBefore} → ${programsAfter}`);
  /* Q2c-Q2f — THE NO-LEAK PROOF, and the reason it is here rather than up in Q1: a shadow map
   * is GPU memory, and GPU memory only exists once something has been rendered. At boot
   * renderer.info.memory.textures is 0 (Q1b1), so the Q1 comparisons are of the scene graph;
   * these are of the memory, around presents that really allocated it. */
  const texGpuTotal = M.renderer.info.memory.textures;
  settingsStore.apply({ tier: 'software' });
  eq('Q2c the switch DOWN frees every one of the gpu tier\'s shadow textures',
     M.renderer.info.memory.textures, texGpuTotal - gpuTex);
  eq('Q2d …which is exactly the count it had before the gpu frame', M.renderer.info.memory.textures, tex1);
  frame();
  M.present();
  eq('Q2e …and a software frame after the round trip lands back on the pre-switch total',
     M.renderer.info.memory.textures, tex0 + softTex);
  eq('Q2f …with the scene back to the boot rig after presenting on both', scene.children.length, bootChildren);
  /* THE GEOMETRY HALF, around real frames — the tier moves lights, never meshes (the brief's
   * third risk). Q1s could only compare 0 with 0; these are the resident counts, and they are
   * NOT equal across the tiers: measured 356 after a software frame and 381 after a gpu one.
   * That +25 is not new geometry — it is the same scene becoming resident, because four shadow
   * cameras draw objects the single sun map and the main camera had both culled. The claim that
   * survives measurement is therefore "the tier uploads none of its OWN geometry", and the
   * ceiling that proves it is the geometry the scene owned BEFORE the switch (sceneGeosBefore,
   * captured above) — plus Q2f2a, which says that ceiling did not move under the switch. */
  const sceneGeos = new Set();
  scene.traverse((o) => { if (o.geometry) sceneGeos.add(o.geometry.uuid); });
  ok('Q2f1 …and the geometry resident after the software present is a real number, not an empty scene',
     softGeo > 100, `${softGeo} geometries`);
  ok('Q2f2 …the gpu tier uploads none of its own: the resident COUNT stays within the pre-switch scene\'s geometry count (a count bound, not a per-uuid identity)',
     gpuGeo >= softGeo && gpuGeo <= sceneGeosBefore.size,
     `${softGeo} → ${gpuGeo} of ${sceneGeosBefore.size} distinct geometries the scene owned before the switch`);
  ok('Q2f2a …and the switch put no geometry INTO the scene graph either, so that ceiling is not one it raised',
     sceneGeos.size === sceneGeosBefore.size, `${sceneGeosBefore.size} → ${sceneGeos.size}`);
  eq('Q2f3 …and the switch back frees none of them (they are the scene\'s, not the tier\'s)',
     M.renderer.info.memory.geometries, gpuGeo);
  lines.push(`      geometries: ${bootGeometries} at boot → ${softGeo} after a software frame → ${gpuGeo} on gpu ` +
             `(+${gpuGeo - softGeo}: four shadow cameras draw what one had culled) → ` +
             `${M.renderer.info.memory.geometries} back on software, of ${sceneGeosBefore.size} the scene owned ` +
             `before the switch (${sceneGeos.size} after)`);
  lines.push(`      textures: ${tex0} at rest → ${tex0 + softTex} after a software frame → ${tex1} on the switch up → ` +
             `${texGpuTotal} after a gpu frame → ${M.renderer.info.memory.textures} back on software`);

  /* Q3 — the reload path is untouched: the choice is still saved, still clamped to
   * SETTINGS.tiers, and still what the next boot reads (main.js reads saved.shell.tier before
   * the scene exists). The live path is additive. */
  settingsStore.apply({ tier: 'gpu' });
  eq('Q3 the choice is saved for the next boot', load().shell.tier, 'gpu');
  settingsStore.apply({ tier: 'quantum' });
  eq('Q3a …and a tier that is not in SETTINGS.tiers moves neither the scene nor the save',
     `${M.qualityTier}/${load().shell.tier}`, 'gpu/gpu');
  settingsStore.apply({ tier: 'auto' });
  frame();
  eq('Q3b auto resolves through detectRenderTier again (software, in the harness)', M.qualityTier, 'software');
  eq('Q3c …and auto is what was saved', load().shell.tier, 'auto');
  eq('Q3d SETTINGS.tiers is still the three the card offers', SETTINGS.tiers.join(','), 'auto,gpu,software');

  console.warn = realWarn; console.error = realErr;
  ok('Q2g no console warning was raised by any of the switches', warns.length === 0, warns.join(' | '));
}

} catch (e) {
  fails++;
  lines.push(`FAIL  the suite threw  <- ${e && e.message}`);
  lines.push((e && e.stack || '').split('\n').slice(0, 6).join('\n'));
}

// The suite drove the settings store for real, so it wrote a save. m16's rule: leave none.
try { clearSave(); localStorage.removeItem(SAVE_KEY); } catch (e) { /* no storage — nothing to clear */ }
emit();
