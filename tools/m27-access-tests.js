/* Phase 11 build-side M19 suite — §21.4's Cognition and Vision rows: reduced HUD, objective
 * history, the hints switch, high contrast, and the colour-independent token audit.
 *
 * GDD §21.4 Accessibility baseline — Vision "scalable UI (M4), high contrast, colorblind-safe
 * icon/text redundancy"; Cognition "solo pause (M3), objective history, optional hints,
 * reduced HUD". §26.5 "states understandable without color alone". §21.1 "compact objective
 * count … not a checklist" and "no persistent panel should cover the object-doorway
 * relationship" — the rule the reduced HUD is measured against, not exempted from.
 *
 * THE CLAIMS, each at its consumer (INDEX "assert consumption, not presence"):
 *   A1  reduced HUD hides the secondary panels and NEVER the essentials — offsetParent, not
 *       a class check — and m11 O5's centre-clear predicate holds in both states.
 *   A2  high contrast is alpha 1.0, ≥ 2 px borders and a ≥ 7:1 text ratio COMPUTED from the
 *       computed colours; the panel's rect does not move (colours, borders and alpha only).
 *   A3  every notice kind, cargo band, route state and phase word carries a glyph or a word
 *       in the DOM — the audit as a test, not a rewrite.
 *   A4  the pause card's 'What happened' is the shell's ring: stamps ascend, a broadcast is
 *       one line, a seat notice is tagged, resetContract empties it, 200 raised → historyLen.
 *   A5  hints off DISARMS M5's stall timer at the source — CONTRACT.stallHintMs of real idle
 *       sim time queues nothing (the queue is asserted, not the DOM) — and drops the room
 *       suffix from the prompt; on again, both return and the hint fires once.
 *   A6  the three shell keys round-trip, sanitise to booleans, and have consumers.
 *   A7  ?hc=1 is a pure function of the search string; this boot had none, so the save won.
 *
 * localStorage 'mfh.save' is cleared at the START and the END (m16's rule).
 */

import { load, save, sanitiseShell, highContrastForced, SAVE_KEY, SAVE_SCHEMA, SHELL_DEFAULTS } from '../src/core/save.js';
import { NOTICE_GLYPHS } from '../src/ui/hud.js';
import { CONTRACT, DEBUG, SIM } from '../src/config.js';

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

const { game, huds, hud, title, movers, registry, physics, interact } = M;
const STEP = SIM.stepMs;
const FRAME = 16.667;
const frame = (n = 1) => { for (let i = 0; i < n; i++) game.frame(FRAME); };
const banner = () => { const b = document.getElementById('err-banner'); return b ? b.textContent : ''; };
const q = (sel) => hud.el.querySelector(sel);
/** A layout box: the element and every ancestor are displayed (offsetParent, as m11 F2 / m16 U1c read it). */
const shown = (sel) => { const el = q(sel); return !!(el && el.offsetParent); };
/** m11 O5's predicate, verbatim: no panel reaches the middle third where a doorway is judged. */
const centreClear = () => ['.contract', '.cargo-status', '.notices', '.route-bar', '.objective', '.caption'].every((sel) => {
  const el = hud.el.querySelector(sel);
  if (!el || !el.offsetParent) return true;
  const r = el.getBoundingClientRect();
  const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
  const wx = window.innerWidth / 6, wy = window.innerHeight / 6;
  return r.right < cx - wx || r.left > cx + wx || r.bottom < cy - wy || r.top > cy + wy;
});
/** rgb()/rgba() → [r, g, b, a]. */
const rgba = (c) => {
  const m = /rgba?\(([^)]+)\)/.exec(c || '');
  if (!m) return [0, 0, 0, 1];
  const p = m[1].split(',').map((x) => Number(x.trim()));
  return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
};
/** WCAG relative luminance and contrast ratio, from computed colours. */
const lum = ([r, g, b]) => {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (fg, bg) => { const a = lum(rgba(fg)), b = lum(rgba(bg)); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
const feedPanels = () => {
  hud.setContract({ phase: 'pickup', delivered: 2, total: 23, loaded: 3, roomCorrect: 1, elapsedMin: 1, estimateMin: 18 });
  hud.setObjective('carry a box to the truck out front');
  hud.setCargo({ loadedCount: 4, totalMass: 200, unsecuredFraction: 0.5, volumeFraction: 0.3, quality: 0.6 });
  hud.setRoute({ state: 'driving', progress: 0.4, event: null, heading: 'out' });
  hud.setPrompt({ primary: 'pick up the flat dolly', secondary: null });
  hud.setCaption('thud', '←');
  hud._notices.length = 0;
  hud.notice('a strap gave way', 'damage');
};
const clearPanels = () => {
  hud.setRoute({ state: 'parked', progress: 0, event: null });
  hud.setCaption('');
  hud._notices.length = 0; hud._renderNotices();
};

/* m11's stand-and-look helpers, copied so A5 can read the prompt for a real manifest item. */
function placeMover(m, x, z, y = 0.2) {
  m.controller.hardSetPosition({ x, y, z });
  m.controller._vel.x = 0; m.controller._vel.z = 0;
  m.controller.velocityY = 0; m.controller._climb = null;
  m.controller.carriedMass = 0; m.controller.resistedForce = 0;
  m.controller.pull.x = 0; m.controller.pull.z = 0;
  m.controller.imbalance = 0; m.controller.exertion = 0; m.controller._downMs = 0;
}
function parkAt(e, x, y, z, yaw = 0) {
  e.body.setTranslation({ x, y, z }, true);
  e.body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
  e.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  e.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  e.body.wakeUp();
  physics.primeQueries();
}
const posOf = (e) => { const t = e.body.translation(); return { x: t.x, y: t.y, z: t.z }; };
function lookAt(m, from, target) {
  const rig = M.rig, camera = M.camera;
  placeMover(m, from.x, from.z, from.y !== undefined ? from.y : 0.2);
  const p = m.controller.position;
  rig.yaw = Math.atan2(-(target.x - p.x), -(target.z - p.z));
  rig.pitch = Math.atan2(target.y - (p.y + 1.4), Math.hypot(target.x - p.x, target.z - p.z));
  for (let k = 0; k < 20; k++) rig.update(p, 1 / 60);
  const c = camera.position;
  rig.yaw = Math.atan2(-(target.x - c.x), -(target.z - c.z));
  rig.pitch = Math.atan2(target.y - c.y, Math.hypot(target.x - c.x, target.z - c.z));
  m.grips.syncAim();
  physics.primeQueries();
}
const me = () => movers[M.activeMoverIndex];

// SETUP: nothing from a previous run may survive into this one.
try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* no storage — the suite still runs */ }

try {

if (title.visible) title.start();
frame(2);

/* ── A1. reduced HUD (§21.4 Cognition "reduced HUD", §21.1) ────────────────────── */
lines.push('--- A1. reduced HUD: the secondary panels go, the essentials never do (§21.4, §21.1) ---');
{
  feedPanels();
  const essentials = ['.objective', '.prompt', '.reticle', '.notices', '.caption'];
  const secondary = () => Array.from(hud.el.querySelectorAll('.contract .row:not(.manifest)'));
  const everything = [...essentials, '.contract', '.contract .phase', '.contract .row.manifest', '.cargo-status', '.route-bar .fill', '.route-bar .label'];
  ok('A1-0 before: every panel, row and label has a layout box (the measurement is real)',
     everything.every(shown), everything.filter((s) => !shown(s)).join(','));
  ok('A1-0a …the contract panel has secondary rows to hide (truck, time)',
     secondary().length >= 2 && secondary().every((r) => r.offsetParent), String(secondary().length));
  eq('A1-0b …and the HUD starts full', hud.reduced, false);

  M.settingsStore.apply({ reducedHud: true });
  eq('A1 settingsStore.apply({reducedHud:true}) → huds[0].reduced', hud.reduced, true);
  ok('A1a the contract panel shows the phase word and the manifest count',
     shown('.contract') && shown('.contract .phase') && shown('.contract .row.manifest'));
  ok('A1b …and none of its other rows', secondary().every((r) => !r.offsetParent),
     secondary().filter((r) => r.offsetParent).map((r) => r.textContent).join(' | '));
  eq('A1c the cargo panel is hidden', shown('.cargo-status'), false);
  ok('A1d the route bar keeps its fill and loses its label', shown('.route-bar .fill') && !shown('.route-bar .label'),
     `fill ${shown('.route-bar .fill')} label ${shown('.route-bar .label')}`);
  ok('A1e the objective, the prompt, the reticle, notices and the caption stay (§21.1) — offsetParent non-null',
     essentials.every(shown), essentials.filter((s) => !shown(s)).join(','));
  ok('A1f m11 O5 centre-clear holds in the reduced state', centreClear());

  M.settingsStore.apply({ reducedHud: false });
  eq('A1g off → huds[0].reduced false', hud.reduced, false);
  ok('A1h …and everything is back', everything.every(shown), everything.filter((s) => !shown(s)).join(','));
  ok('A1i …with m11 O5 centre-clear holding again', centreClear());

  // An OVERTIME row is a cost being paid (§2.2) — the one secondary row the reduced HUD keeps.
  hud.setContract({ phase: 'pickup', delivered: 2, total: 23, loaded: 3, roomCorrect: 1, elapsedMin: 20, estimateMin: 18 });
  M.settingsStore.apply({ reducedHud: true });
  ok('A1j reduced, an OVERTIME row still shows (§2.2 — a cost being paid is never hidden)',
     shown('.contract .row.over') && /OVERTIME/.test(q('.contract .row.over').textContent),
     q('.contract .row.over') ? q('.contract .row.over').textContent : 'no .over row');
  ok('A1k …while the truck row stays hidden', !secondary().filter((r) => !r.classList.contains('over')).some((r) => r.offsetParent));
  M.settingsStore.apply({ reducedHud: false });

  // m12: both seats' HUDs.
  M.setSeats(2);
  M.settingsStore.apply({ reducedHud: true });
  ok('A1l (m12) in co-op the switch reaches both seats\' HUDs', huds.every((h) => h.reduced), huds.map((h) => h.reduced).join(','));
  M.settingsStore.apply({ reducedHud: false });
  ok('A1m …and off reaches both', huds.every((h) => !h.reduced));
  M.setSeats(1);
  feedPanels();
}
emit('running...');

/* ── A2. high contrast (§21.4 Vision "high contrast") ──────────────────────────── */
lines.push('--- A2. high contrast: alpha 1.0, 2 px, ≥ 7:1, and the rects do not move (§21.4 Vision) ---');
{
  feedPanels();
  const cs0 = getComputedStyle(hud.contract);
  const bg0 = cs0.backgroundColor;
  ok('A2-0 before: the contract panel is translucent (Phase 15: rgba(23,21,34,.78))', rgba(bg0)[3] < 1, bg0);
  eq('A2-0a …with a 1 px border', cs0.borderTopWidth, '1px');
  const r0 = hud.contract.getBoundingClientRect();
  const o0 = hud.objective.getBoundingClientRect();
  const c0 = hud.cargoStatus.getBoundingClientRect();
  const n0 = hud.notices.querySelector('.notice').getBoundingClientRect();
  const roots = () => [...huds.map((h) => h.el), document.body, title.el, M.pauseScreen.el, M.invoiceScreen.el, M.settingsPanel.el];
  ok('A2-0b …and nothing carries .hc', roots().every((el) => !el.classList.contains('hc')));

  M.settingsStore.apply({ highContrast: true });
  ok('A2 apply({highContrast:true}) → every HUD root and card carries .hc (2 HUDs, body, title, pause, settlement, settings)',
     roots().every((el) => el.classList.contains('hc')), roots().map((el) => `${el.id || el.className}:${el.classList.contains('hc')}`).join(' '));
  const cs = getComputedStyle(hud.contract);
  eq('A2a getComputedStyle(.contract).backgroundColor has alpha 1.0', rgba(cs.backgroundColor)[3], 1);
  ok('A2b …and border-width ≥ 2 px', parseFloat(cs.borderTopWidth) >= 2, cs.borderTopWidth);
  const ratio = contrast(cs.color, cs.backgroundColor);
  ok(`A2c text contrast of the panel text against its background ≥ 7:1 (computed ${ratio.toFixed(1)}:1)`, ratio >= 7,
     `${cs.color} on ${cs.backgroundColor}`);
  eq('A2c1 …the text is full white', cs.color, 'rgb(255, 255, 255)');
  eq('A2d …and no dimmed row: the label span\'s opacity is 1', getComputedStyle(hud.contract.querySelector('.row span')).opacity, '1');
  const rowRatio = contrast(getComputedStyle(hud.contract.querySelector('.row b')).color, cs.backgroundColor);
  ok(`A2d1 …the numbers too (${rowRatio.toFixed(1)}:1)`, rowRatio >= 7);
  const same = (a, b) => Math.abs(a.left - b.left) < 0.5 && Math.abs(a.top - b.top) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;
  const r1 = hud.contract.getBoundingClientRect();
  ok('A2e colours, borders and alpha only — the contract panel\'s rect is unchanged (2 px border, 1 px less padding)', same(r0, r1),
     `${r0.width.toFixed(1)}x${r0.height.toFixed(1)}@${r0.left.toFixed(1)},${r0.top.toFixed(1)} → ${r1.width.toFixed(1)}x${r1.height.toFixed(1)}@${r1.left.toFixed(1)},${r1.top.toFixed(1)}`);
  ok('A2e1 …the objective line\'s, the cargo panel\'s and a notice\'s too',
     same(o0, hud.objective.getBoundingClientRect()) && same(c0, hud.cargoStatus.getBoundingClientRect()) && same(n0, hud.notices.querySelector('.notice').getBoundingClientRect()));
  ok('A2f the route bar\'s fill is hatched (a repeating gradient, not a flat lime)',
     /repeating-linear-gradient/.test(getComputedStyle(hud.routeFill).backgroundImage), getComputedStyle(hud.routeFill).backgroundImage.slice(0, 60));
  for (const [sel, name] of [['.objective', 'objective'], ['.cargo-status', 'cargo'], ['.notices .notice', 'notice'], ['.caption', 'caption']]) {
    const s = getComputedStyle(q(sel));
    ok(`A2g the ${name} panel: alpha 1.0, ≥ 2 px, ≥ 7:1`, rgba(s.backgroundColor)[3] === 1 && parseFloat(s.borderTopWidth) >= 2 && contrast(s.color, s.backgroundColor) >= 7,
       `${s.backgroundColor} ${s.borderTopWidth} ${contrast(s.color, s.backgroundColor).toFixed(1)}`);
  }
  ok('A2h m11 O5 centre-clear holds in high contrast', centreClear());
  // The pause card, shown, is opaque with a 2 px border too.
  game.setPaused(true);
  const card = getComputedStyle(M.pauseScreen.el.querySelector('.card'));
  ok('A2i the pause card is opaque with a 2 px border and ≥ 7:1 text',
     rgba(card.backgroundColor)[3] === 1 && parseFloat(card.borderTopWidth) >= 2 && contrast(getComputedStyle(M.pauseScreen.el.querySelector('.tag')).color, card.backgroundColor) >= 7,
     `${card.backgroundColor} ${card.borderTopWidth}`);
  game.setPaused(false);

  M.settingsStore.apply({ highContrast: false });
  const cs2 = getComputedStyle(hud.contract);
  ok('A2j off → the Phase 15 values return (alpha < 1, 1 px)', rgba(cs2.backgroundColor)[3] < 1 && cs2.borderTopWidth === '1px', `${cs2.backgroundColor} ${cs2.borderTopWidth}`);
  ok('A2k …and nothing carries .hc', roots().every((el) => !el.classList.contains('hc')));
  ok('A2l …the fill is flat lime again', getComputedStyle(hud.routeFill).backgroundImage === 'none');
}
emit('running...');

/* ── A3. colour-independent tokens (§26.5, §21.4 Vision "icon/text redundancy") ─── */
lines.push('--- A3. every notice kind, cargo band, route state and phase word carries a non-colour token (§26.5) ---');
{
  hud._notices.length = 0;
  const kinds = ['info', 'good', 'damage', 'warn'];
  for (const k of kinds) hud.notice(`${k} notice`, k);
  const els = Array.from(hud.notices.querySelectorAll('.notice'));
  eq('A3 four notices up, one per kind', els.length, 4);
  const kindOf = (el) => kinds.find((k) => el.classList.contains(k));
  const wrong = els.filter((el) => !el.textContent.trim().startsWith(NOTICE_GLYPHS[kindOf(el)]));
  ok(`A3a each notice's text begins with its kind's glyph (info ${NOTICE_GLYPHS.info} good ${NOTICE_GLYPHS.good} damage ${NOTICE_GLYPHS.damage} warn ${NOTICE_GLYPHS.warn})`,
     wrong.length === 0, wrong.map((el) => `${kindOf(el)}: "${el.textContent.trim().slice(0, 12)}"`).join(' | '));
  eq('A3b …and the four glyphs are four different glyphs', new Set(kinds.map((k) => NOTICE_GLYPHS[k])).size, 4);
  ok('A3c …each followed by the words (the glyph is a prefix, not a replacement)', els.every((el) => /notice$/.test(el.textContent.trim())));
  hud._notices.length = 0; hud._renderNotices();

  const bands = [[0, 'secure', '[ok]'], [0.2, 'mostly secure', '[!]'], [0.8, 'LOOSE', '[!!]']];
  for (const [frac, word, tok] of bands) {
    hud.setCargo({ loadedCount: 4, totalMass: 200, unsecuredFraction: frac, volumeFraction: 0.3 });
    const text = hud.cargoStatus.textContent.replace(/\s+/g, ' ');
    ok(`A3d the cargo band at ${Math.round(frac * 100)}% unstrapped reads "${word} ${tok}" — a word and a bracketed token`,
       text.includes(`${word} ${tok}`), text.slice(0, 80));
  }
  ok('A3e …and the three tokens are three different tokens', new Set(bands.map((b) => b[2])).size === 3);

  hud.setRoute({ state: 'driving', progress: 0.3, event: null, heading: 'out' });
  ok('A3f the route bar label carries the word "driving" between events', /driving/.test(hud.routeLabel.textContent), hud.routeLabel.textContent);
  hud.setRoute({ state: 'driving', progress: 0.3, event: 'hard brake', heading: 'out' });
  ok('A3g …and the event\'s name during one', /hard brake/.test(hud.routeLabel.textContent), hud.routeLabel.textContent);
  hud.setRoute({ state: 'parked', progress: 0, event: null });

  M.feedHuds();
  const phase = hud.contract.querySelector('.phase');
  ok('A3h the phase word is text, and it is the phase machine\'s word', !!phase && new RegExp(game.state.phase, 'i').test(phase.textContent),
     `${phase && phase.textContent} vs ${game.state.phase}`);
  for (const p of ['pickup', 'transit', 'delivery', 'settlement']) {
    hud.setContract({ phase: p, delivered: 0, total: 23, loaded: 0, roomCorrect: 0, elapsedMin: 1, estimateMin: 18 });
    ok(`A3i …"${p}" prints as "${p}"`, new RegExp(p, 'i').test(hud.contract.querySelector('.phase').textContent));
  }
  M.feedHuds();
}
emit('running...');

/* ── A4. objective history (§21.4 Cognition "objective history") ───────────────── */
lines.push('--- A4. the pause card\'s "What happened": the shell\'s notice ring (§21.4 Cognition, §22.4) ---');
{
  M.pendingNotices.length = 0;
  M.noticeHistory.length = 0;
  ok(`A4-0 DEBUG.historyLen (${DEBUG.historyLen}) ≥ 5`, DEBUG.historyLen >= 5);
  const kinds = ['info', 'good', 'damage', 'warn'];
  const stampsAt = [];
  for (let i = 0; i < 7; i++) {
    frame(43);
    M.pendingNotices.push({ text: `event ${i}`, kind: kinds[i % 4] });
    M.drainNotices();
    stampsAt.push(game.clock.simTimeMs);
  }
  eq('A4 seven notices across 301 frames → the ring holds 7', M.noticeHistory.length, 7);
  eq('A4a …and the queue is drained', M.pendingNotices.length, 0);
  game.setPaused(true);
  const rows = M.pauseScreen.historyRows();
  const expect = Math.min(7, DEBUG.historyLen);
  eq(`A4b setPaused(true) → the card lists the last ${expect}`, rows.length, expect);
  const offset = 7 - expect;
  const stamps = rows.map((r) => Number(r.dataset.t));
  ok('A4c …with sim-time stamps ascending', stamps.every((v, i) => i === 0 || v >= stamps[i - 1]) && stamps[stamps.length - 1] > stamps[0], stamps.join(','));
  ok('A4c1 …each the sim clock at its drain', rows.every((r, i) => Number(r.dataset.t) === Math.round(stampsAt[i + offset])),
     `${stamps.join(',')} vs ${stampsAt.map((t) => Math.round(t)).join(',')}`);
  ok('A4c2 …printed m:ss', rows.every((r) => /^\d+:\d\d$/.test(r.querySelector('.t').textContent)), rows[0].querySelector('.t').textContent);
  ok('A4d each row carries its kind glyph', rows.every((r, i) => r.querySelector('.g').textContent === NOTICE_GLYPHS[kinds[(i + offset) % 4]]),
     rows.map((r) => r.querySelector('.g').textContent).join(' '));
  ok('A4e …and its text, oldest first', rows.every((r, i) => r.querySelector('.x').textContent === `event ${i + offset}`),
     rows.map((r) => r.querySelector('.x').textContent).join(' | '));
  eq('A4f the block is on the card', M.pauseScreen.el.querySelector('.history').hidden, false);
  ok('A4f1 …under the heading "What happened"', /What happened/.test(M.pauseScreen.el.querySelector('.history').textContent));
  ok('A4f2 …with the Resume and Restart buttons still there (m15 P1c)',
     !!M.pauseScreen.el.querySelector('[data-act="resume"]') && !!M.pauseScreen.el.querySelector('[data-act="restart"]'));
  game.setPaused(false);

  // A broadcast is one line though both HUDs show it; a seat notice is tagged with its seat.
  M.setSeats(2);
  M.noticeHistory.length = 0;
  huds[0]._notices.length = 0; huds[1]._notices.length = 0;
  M.pendingNotices.push({ text: 'both of you', kind: 'good' });
  M.pendingNotices.push({ text: 'just you', kind: 'warn', seat: 1 });
  M.drainNotices();
  ok('A4g both HUDs got the broadcast', huds[0]._notices.some((n) => n.text === 'both of you') && huds[1]._notices.some((n) => n.text === 'both of you'));
  eq('A4g1 …which is ONE history entry', M.noticeHistory.filter((n) => n.text === 'both of you').length, 1);
  eq('A4g2 …addressed to everyone (seat null)', M.noticeHistory[0].seat, null);
  ok('A4g3 the seat notice reached seat 1 only', huds[1]._notices.some((n) => n.text === 'just you') && !huds[0]._notices.some((n) => n.text === 'just you'));
  game.setPaused(true);
  const rows2 = M.pauseScreen.historyRows();
  eq('A4h the card lists two rows', rows2.length, 2);
  ok('A4h1 …the seat notice tagged P2, the broadcast untagged',
     !!rows2[1].querySelector('.s') && rows2[1].querySelector('.s').textContent === 'P2' && !rows2[0].querySelector('.s'),
     rows2.map((r) => r.textContent.replace(/\s+/g, ' ')).join(' | '));
  game.setPaused(false);
  M.setSeats(1);

  // A notice for a seat nobody is in is not shown, so it is not history either.
  M.noticeHistory.length = 0;
  M.pendingNotices.push({ text: 'nobody', kind: 'info', seat: 1 });
  M.drainNotices();
  eq('A4i solo, a seat-1 notice is neither shown nor recorded', M.noticeHistory.length, 0);

  // resetContract empties it.
  M.pendingNotices.push({ text: 'before the reset', kind: 'info' });
  M.drainNotices();
  eq('A4j one entry before the reset', M.noticeHistory.length, 1);
  M.resetContract();
  eq('A4k resetContract() → the ring is empty', M.noticeHistory.length, 0);
  game.setPaused(true);
  eq('A4k1 …the card lists nothing', M.pauseScreen.historyRows().length, 0);
  eq('A4k2 …and the block is hidden', M.pauseScreen.el.querySelector('.history').hidden, true);
  game.setPaused(false);

  // Bounded: 200 raised → historyLen kept, the newest.
  for (let i = 0; i < 200; i++) M.pendingNotices.push({ text: `n${i}`, kind: 'info' });
  M.drainNotices();
  eq(`A4l raise 200 → the ring's length === DEBUG.historyLen (${DEBUG.historyLen})`, M.noticeHistory.length, DEBUG.historyLen);
  eq('A4l1 …keeping the newest', M.noticeHistory[M.noticeHistory.length - 1].text, 'n199');
  eq('A4l2 …and dropping the oldest', M.noticeHistory[0].text, `n${200 - DEBUG.historyLen}`);
  ok('A4m the ring is shell state, never in game.state (§22.4)', !JSON.stringify(game.state).includes('n199') && !('noticeHistory' in game.state));
  game.setPaused(true);
  eq(`A4m1 …and the card lists exactly ${DEBUG.historyLen}`, M.pauseScreen.historyRows().length, DEBUG.historyLen);

  // The block never intercepts keys: an Escape typed over it is still the pause toggle (m15 P5).
  const hist = M.pauseScreen.el.querySelector('.history');
  hist.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true, cancelable: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Escape', key: 'Escape', bubbles: true, cancelable: true }));
  frame();
  eq('A4n an Escape keydown dispatched on the history block still resumes (it intercepts no keys)', game.state.paused, false);
  M.noticeHistory.length = 0;
  hud._notices.length = 0; hud._renderNotices();
}
emit('running...');

/* ── A5. hints off (§21.4 Cognition "optional hints") ──────────────────────────── */
lines.push('--- A5. hints off disarms M5\'s stall timer at the source and drops the room suffix (§21.4) ---');
{
  if (title.visible) title.start(); else M.stallHint.armed = true;
  for (const m of movers) m.grips.releaseAll('A5');
  M.resetStallHint();
  M.pendingNotices.length = 0;
  for (const h of huds) h._notices.length = 0;
  const stallNotices = () => M.pendingNotices.filter((n) => /grab|hold/.test(n.text)).length +
                             huds.reduce((a, h) => a + h._notices.filter((n) => /grab|hold/.test(n.text)).length, 0);
  ok('A5-0 the run is in PICKUP with an armed, zeroed stall timer (m11 O6\'s setup)',
     game.state.phase === 'pickup' && M.stallHint.armed && M.stallHint.ms === 0 && !M.stallHint.fired && !M.stallHint.done,
     `${game.state.phase} ${JSON.stringify(M.stallHint)}`);
  eq('A5-0a hints start on', M.shellSettings.hints, true);

  M.settingsStore.apply({ hints: false });
  eq('A5 apply({hints:false}) → interact.hints false', interact.hints, false);
  const t0 = game.clock.simTimeMs;
  const frames = Math.ceil(CONTRACT.stallHintMs / FRAME) + 30;
  for (let i = 0; i < frames; i++) game.frame(FRAME);
  const idle = game.clock.simTimeMs - t0;
  ok(`A5a ${frames} idle frames = ${idle.toFixed(0)} ms of sim time ≥ CONTRACT.stallHintMs (${CONTRACT.stallHintMs})`, idle >= CONTRACT.stallHintMs);
  eq('A5b …raise NO stall notice — the queue and the HUD rings, not the DOM', stallNotices(), 0);
  eq('A5c …the timer never counted (disarmed at the source, not hidden)', M.stallHint.ms, 0);
  ok('A5d …and it is neither fired nor retired', !M.stallHint.fired && !M.stallHint.done, JSON.stringify(M.stallHint));
  eq('A5e …with the run still in PICKUP', game.state.phase, 'pickup');

  // The room suffix, at the function and through the prompt for a real manifest item.
  const row = game.state.manifest.find((r) => r.toZone === 'dest_kitchen' && /box/.test(r.entityId) && !r.delivered);
  const box = row ? registry.get(row.entityId) : null;
  ok('A5f a kitchen box is on the manifest', !!box, row ? row.entityId : 'no row');
  eq('A5g hints off: _roomHint for it is ""', box ? interact._roomHint(box) : '?', '');
  const was = box ? posOf(box) : null;
  const spot = { x: -30, y: 0.30, z: 36 };
  if (box) { parkAt(box, spot.x, spot.y, spot.z); lookAt(me(), { x: spot.x, z: spot.z + 1.3 }, spot); }
  const seenOff = box ? interact.describe(me()) : {};
  ok('A5h …and the object prompt for it names the box with no " → room" suffix',
     !!seenOff.hint && /box/i.test(seenOff.hint) && !/→/.test(seenOff.hint), seenOff.hint || `kind=${seenOff.target && seenOff.target.kind}`);

  M.settingsStore.apply({ hints: true });
  eq('A5i on again: interact.hints true', interact.hints, true);
  ok('A5j …the room suffix returns', box && / → /.test(interact._roomHint(box)) && /kitchen/i.test(interact._roomHint(box)), box ? interact._roomHint(box) : '?');
  const seenOn = box ? interact.describe(me()) : {};
  ok('A5k …on the prompt too', !!seenOn.hint && /kitchen/i.test(seenOn.hint), seenOn.hint || '');
  if (box) parkAt(box, was.x, was.y, was.z);
  for (const m of movers) m.grips.releaseAll('A5');
  M.stallHint.ms = CONTRACT.stallHintMs - 5 * STEP;
  for (let k = 0; k < 8; k++) game.frame(FRAME);
  eq('A5l …and the stall hint fires once past the threshold (re-armed, once per run)', stallNotices(), 1);
  for (let k = 0; k < 120; k++) game.frame(FRAME);
  eq('A5m …and never a second time this run', stallNotices(), 1);
  M.pendingNotices.length = 0;
  for (const h of huds) { h._notices.length = 0; h._renderNotices(); }
}
emit('running...');

/* ── A6. persistence (§26.6, §21.2) ────────────────────────────────────────────── */
lines.push('--- A6. the three shell keys: round-trip, booleans only, consumers (§26.6, §21.2) ---');
{
  localStorage.removeItem(SAVE_KEY);
  eq('A6 SHELL_DEFAULTS: reducedHud false, highContrast false, hints true',
     `${SHELL_DEFAULTS.reducedHud}/${SHELL_DEFAULTS.highContrast}/${SHELL_DEFAULTS.hints}`, 'false/false/true');
  const three = (s) => `${s.reducedHud}/${s.highContrast}/${s.hints}`;
  eq('A6a save(true/true/false) reports success', save({ shell: { ...SHELL_DEFAULTS, reducedHud: true, highContrast: true, hints: false } }), true);
  eq('A6a1 …and load() round-trips the three', three(load().shell), 'true/true/false');
  eq('A6b sanitiseShell refuses non-booleans ("yes", 1, 0 → the defaults)', three(sanitiseShell({ reducedHud: 'yes', highContrast: 1, hints: 0 })), 'false/false/true');
  localStorage.setItem(SAVE_KEY, JSON.stringify({ schema: SAVE_SCHEMA, shell: { hints: 'off', reducedHud: 'true' } }));
  eq('A6b1 …through load() too', three(load().shell), 'false/false/true');
  eq('A6c the keys live under shell — load() still has exactly the five sections (m16 V4c)',
     Object.keys(load()).sort().join(','), 'bestInvoice,bindings,runs,settings,shell');
  const keys = M.settingsPanel.keys();
  ok('A6d the card carries the three as data rows (m16 U2\'s walk finds them)', ['reducedHud', 'highContrast', 'hints'].every((k) => keys.includes(k)), keys.join(','));
  ok('A6d1 …each a checkbox', ['reducedHud', 'highContrast', 'hints'].every((k) => M.settingsPanel.el.querySelector(`[data-setting="${k}"]`).type === 'checkbox'));
  ok('A6d2 …and the hints row says what it silences (the stall hint and the room suffix)',
     (() => { const c = M.settingsPanel.el.querySelector('[data-setting="hints"]'); const t = (c.closest('.set-row').textContent + (c.closest('.set-row').nextElementSibling || {}).textContent).toLowerCase();
              return /stall|grab/.test(t) && /room/.test(t); })());
  M.settingsStore.apply({ reducedHud: true, highContrast: true, hints: false });
  ok('A6e consumers moved: huds[0].reduced, body.hc, interact.hints',
     hud.reduced === true && document.body.classList.contains('hc') && interact.hints === false,
     `${hud.reduced}/${document.body.classList.contains('hc')}/${interact.hints}`);
  eq('A6f …and the set persisted through one save', three(load().shell), 'true/true/false');
  M.settingsStore.apply({ reducedHud: false, highContrast: false, hints: true });
  ok('A6g …and back', hud.reduced === false && !document.body.classList.contains('hc') && interact.hints === true);
  eq('A6g1 …persisted', three(load().shell), 'false/false/true');
  M.settingsPanel.show();
  eq('A6h the card shows the values (hints checked)', M.settingsPanel.el.querySelector('[data-setting="hints"]').checked, true);
  M.settingsPanel.hide();
  localStorage.removeItem(SAVE_KEY);
}
emit('running...');

/* ── A7. ?hc=1 (the screenshot path) ────────────────────────────────────────────── */
lines.push('--- A7. ?hc=1 forces high contrast at boot; no URL → the save wins ---');
{
  eq('A7 highContrastForced("?hc=1") → true', highContrastForced('?hc=1'), true);
  eq('A7a …beside other parameters', highContrastForced('?tier=software&hc=1&audio=off'), true);
  eq('A7b no parameter → false', highContrastForced(''), false);
  eq('A7c hc=0 → false', highContrastForced('?hc=0'), false);
  eq('A7d hc=yes → false (only the literal 1)', highContrastForced('?hc=yes'), false);
  eq('A7e junk never throws', highContrastForced(null), false);
  eq('A7f this boot had no ?hc (the harness URL)', M.hcForced, highContrastForced(location.search));
  eq('A7f1 …which is false', M.hcForced, false);
  eq('A7g …so the save won: body.hc equals the loaded highContrast', document.body.classList.contains('hc'), M.shellSettings.highContrast);
  ok('A7h …and the HUD roots agree', huds.every((h) => h.highContrast === M.shellSettings.highContrast));
}
emit('running...');

/* ── Z. teardown ──────────────────────────────────────────────────────────────── */
lines.push('--- Z. it still runs, and nothing survives this suite ---');
{
  clearPanels();
  M.feedHuds();
  const before = physics.stats.bodies;
  frame(60);
  eq('Z1 no bodies leaked over 60 frames', physics.stats.bodies, before);
  ok('Z2 state is still plain serializable data (§22.4)',
     (() => { try { JSON.stringify(game.state); return true; } catch (e) { return false; } })());
  eq('Z3 the game ends the suite running, solo, cards hidden',
     `${game.state.paused}/${M.seatCount}/${M.pauseScreen.el.hidden}/${M.settingsPanel.el.hidden}`, 'false/1/true/true');
  ok('Z4 the three switches are at their defaults', !hud.reduced && !document.body.classList.contains('hc') && interact.hints === true);
  ok('Z5 no error banner appeared during the suite', banner() === '', banner());
  localStorage.removeItem(SAVE_KEY);
}

} catch (e) {
  fails++;
  lines.push(`FAIL  suite threw  <- ${e && e.message}`);
  lines.push((e && e.stack || '').split('\n').slice(0, 6).join('\n'));
}

emit();
