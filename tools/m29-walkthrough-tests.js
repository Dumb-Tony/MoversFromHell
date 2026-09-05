/* Phase 11 build-side M22 suite — the first minute: three cards that get a stranger from START
 * to a box on the truck without coaching (src/ui/walkthrough.js).
 *
 * GDD §26.7 Comprehension "Most players move a box and identify the next objective without
 * coaching"; §25.2 Phase 11 "onboarding"; §21.3 first steps; §4.4 controller parity; §21.1
 * "compact objective count … not a checklist" and "no persistent panel should cover the
 * object-doorway relationship"; §26.5 "essential actions have visible prompts".
 *
 * THE CLAIMS:
 *   W1  fresh save + ?walkthrough=1 + title.start() → step 1 with the seat's grip glyphs (LMB /
 *       RMB on the keyboard, LT / RT on a stubbed pad, and a 'pad' chip), outside the centre
 *       third (m11 O5's predicate), overlapping neither the help line, the objective line nor
 *       a notice; hidden under the title, the pause card, the settings card and hints off;
 *       kept under a reduced HUD; opaque and unmoved under high contrast.
 *   W2  a real GRIP_STARTED by seat 0 → step 2 within one frame; a real CARGO_STATE loaded →
 *       step 3; WALKTHROUGH.step3Ms of sim frames → gone, walkthroughSeen true, saved.
 *   W7  runSummary().walkthrough is { shown, step1Ms, step2Ms, step3Ms } with ascending sim
 *       stamps; the settled record AND the saved kept run carry the same (save.js sanitiseRun
 *       keeps the key); a run without the card is { shown: false };
 *       R2's key list gains the key; JSON round-trips.
 *   W3  seen → the card never appears over 300 frames with a grip and a load in them; the
 *       settings row 'Show the first-minute cards again' (the key's negation) ticked resets it
 *       and the card returns at the next run.
 *   W4  ✕ and Escape-into-the-card skip: gone, seen, and game.state.paused unchanged — the
 *       Escape never reaches the pause path (m15 P5); a plain Escape still pauses.
 *   W5  two seats before a run → no card; two seats at step 1 → gone for the run and not back
 *       when the seat empties; back at the next run.
 *   W6  a card at step 1 for CONTRACT.stallHintMs of idle sim time raises NO stall notice and
 *       the timer never counts; skipped, the hint fires exactly once in the next stallHintMs.
 *   W8  nothing in game.state, no bodies, no scene children; the DOM count is constant across
 *       three show/skip cycles.
 *
 * THIS BOOT ASKS FOR THE CARD. The harness's scratch page is `_smoketest-<port>.html`, where
 * the card is not built (walkthroughEnabledFrom) — so the suite's own first line, before
 * boot has got past the physics await, puts ?walkthrough=1 on the address. Nothing else on
 * the page reads the search string that early: the save was already loaded, the ?tier= /
 * ?hc= / ?audio= reads come later and see the same value they would have.
 *
 * localStorage 'mfh.save' is cleared at the END (m16's rule); the harness profile is fresh
 * at the start, and W0 asserts it.
 */

// FIRST, before boot reaches the walkthrough: the card exists on this page because we asked.
try { history.replaceState(null, '', location.pathname + '?walkthrough=1'); } catch (e) { /* the suite still runs */ }

import { load, sanitiseShell, sanitiseRun, SAVE_KEY, SHELL_DEFAULTS } from '../src/core/save.js';
import { walkthroughEnabledFrom, STEPS } from '../src/ui/walkthrough.js';
import { walkthroughReport } from '../src/telemetry/runLog.js';
import { CONTRACT, WALKTHROUGH, SIM, DEBUG, PROMPTS } from '../src/config.js';
import { EVENTS } from '../src/core/eventBus.js';
import { DEST_ZONES } from '../src/world/destination.js';

const lines = [];
let passes = 0, fails = 0;
function ok(name, cond, detail = '') {
  if (cond) { passes++; lines.push(`PASS  ${name}`); }
  else { fails++; lines.push(`FAIL  ${name}${detail ? '  <- ' + detail : ''}`); }
}
const eq = (n, a, b) => ok(n, a === b, `got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
function deepEq(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
  if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return false;
  return ka.every((k) => deepEq(a[k], b[k]));
}
const deep = (n, a, b) => ok(n, deepEq(a, b), `got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

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

const { game, input, huds, hud, title, movers, registry, physics, interact, cargo } = M;
const W = M.walkthrough;
const bus = game.bus;
const STEP = SIM.stepMs;
const FRAME = 16.667;
const frame = (n = 1) => { for (let i = 0; i < n; i++) game.frame(FRAME); };
/** A frame the way the loop delivers one: step, then feed the HUD (the device debounce lives there). */
const feed = (n = 1) => { for (let i = 0; i < n; i++) { game.frame(FRAME); M.feedHuds(); } };
const banner = () => { const b = document.getElementById('err-banner'); return b && b.textContent.trim() ? b.textContent.slice(0, 120) : ''; };
const card = () => document.getElementById('walkthrough');
const text = () => (card() ? card().textContent.replace(/\s+/g, ' ').trim() : '');
const stepLabel = () => (card() ? card().querySelector('.wt-n').textContent : '');
const chips = () => (card() ? Array.from(card().querySelectorAll('.key')).map((k) => k.textContent) : []);
const me = () => movers[M.activeMoverIndex];
const I = M.cargoInterior;
const panel = () => document.getElementById('settings-screen');
const control = (key) => panel().querySelector(`[data-setting="${key}"]`);
/** Drive a card control the way a hand does (m16's setControl). */
function setControl(key, value) {
  const c = control(key);
  if (!c) throw new Error('no control for ' + key);
  if (c.type === 'checkbox') { c.checked = !!value; c.dispatchEvent(new Event('change', { bubbles: true })); }
  else { c.value = String(value); c.dispatchEvent(new Event(c.type === 'range' ? 'input' : 'change', { bubbles: true })); }
  return c;
}
/** The settings row is 'Show the first-minute cards again' — the shell key's NEGATION
 *  (settings.js `invert`): ticking it writes walkthroughSeen = false, so the next run arms. */
const showCardsAgain = () => setControl('walkthroughSeen', true);
/* A real keydown on window, the way a keyboard delivers it (m15's press). */
const key = (type, code, target = window) =>
  target.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true, cancelable: true }));
const press = (code) => { key('keydown', code); key('keyup', code); };
/** m11 O5's predicate, verbatim: nothing reaches the middle third where a doorway is judged. */
const outsideCentre = (el) => {
  if (!el || !el.offsetParent) return true;
  const r = el.getBoundingClientRect();
  const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
  const wx = window.innerWidth / 6, wy = window.innerHeight / 6;
  return r.right < cx - wx || r.left > cx + wx || r.bottom < cy - wy || r.top > cy + wy;
};
const rect = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
const overlaps = (a, b) => !(a.r <= b.l || b.r <= a.l || a.b <= b.t || b.b <= a.t);
const fmt = (r) => `[${r.l.toFixed(0)},${r.t.toFixed(0)}→${r.r.toFixed(0)},${r.b.toFixed(0)}]`;
/** m27 A5's count: the queue AND the HUD rings, never the DOM. */
const stallNotices = () => M.pendingNotices.filter((n) => /grab|hold/.test(n.text)).length +
                           huds.reduce((a, h) => a + h._notices.filter((n) => /grab|hold/.test(n.text)).length, 0);
const clearNotices = () => { M.pendingNotices.length = 0; for (const h of huds) { h._notices.length = 0; h._renderNotices(); } };

/* m11's stand-and-look helpers, copied (m27 lineage). */
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
const slotIn = (zoneId, index) => {
  const z = DEST_ZONES.find((r) => r.id === zoneId);
  const cols = 4;
  const w = (z.maxX - z.minX) - 1.2, d = (z.maxZ - z.minZ) - 1.2;
  return { x: z.minX + 0.6 + ((index % cols) + 0.5) * (w / cols), z: z.minZ + 0.6 + (Math.floor(index / cols) + 0.5) * (d / 2) };
};

/* THE BOX. One manifest box, parked on open ground for the grip and carried into the truck by
 * teleport for the load — the EVENTS are the real ones (grip.js tryGrab, cargo.js step). */
const boxRow = game.state.manifest.find((r) => /box/.test(r.entityId) && !r.delivered);
const box = boxRow ? registry.get(boxRow.entityId) : null;
const boxHome = box ? posOf(box) : null;
/** The box's manifest row NOW: resetContract() → game.reset() replaces game.state and every
 *  row in it, so a row captured at the top of the suite is stale after the first restart. */
const rowOf = () => game.state.manifest.find((r) => r.entityId === box.id) || boxRow;
const SPOT = { x: -30, y: 0.30, z: 30 };
/** Stand seat 0's mover in front of the box on open ground and take it with the left hand —
 *  a REAL GRIP_STARTED, or null. The next frame's movers system lets go (no key is down). */
function gripBox() {
  parkAt(box, SPOT.x, SPOT.y, SPOT.z);
  lookAt(me(), { x: SPOT.x, z: SPOT.z + 1.3 }, SPOT);
  return me().grips.tryGrab('left', me().id, game.clock.simTimeMs);
}
/** Park the box inside the cargo box and run frames until cargo.step counts it loaded. */
function loadBox(maxFrames = 600) {
  me().grips.releaseAll('m29');
  parkAt(box, M.truckPose.x, I.minY + box.def.dimensions.y / 2 + 0.03, I.maxZ - 0.8);
  let n = 0;
  while (!box.state.loaded && n < maxFrames) { frame(); n++; }
  return n;
}
/** Park the box in its own destination room and run frames until the manifest says delivered. */
function deliverBox(maxFrames = 600) {
  me().grips.releaseAll('m29');
  const sl = slotIn(rowOf().toZone, 0);
  parkAt(box, sl.x, box.def.dimensions.y / 2 + 0.06, sl.z);
  let n = 0;
  while (!rowOf().delivered && n < maxFrames) { frame(); n++; }
  return n;
}
function restoreBox() {
  me().grips.releaseAll('m29');
  if (box && boxHome) parkAt(box, boxHome.x, boxHome.y, boxHome.z);
}

try {

/* ── W0. this boot asked for the card; the save is fresh ─────────────────────────── */
lines.push('--- W0. ?walkthrough=1 on the harness page, a fresh save, the gate as a pure function ---');
{
  ok('W0 the address carries ?walkthrough=1', /walkthrough=1/.test(location.search), location.search);
  ok('W0a …so the card is built on this harness page', !!W && W.enabled === true && !!card(), String(W && W.enabled));
  ok('W0b …hidden under the title', title.visible && card().hidden === true);
  eq('W0c a fresh save: walkthroughSeen false at boot', M.shellSettings.walkthroughSeen, false);
  eq('W0d …the default (SHELL_DEFAULTS)', SHELL_DEFAULTS.walkthroughSeen, false);
  eq('W0e DEBUG.walkthroughInHarness is false (the regression suites never see the card)', DEBUG.walkthroughInHarness, false);
  eq('W0f walkthroughEnabledFrom: the harness page without a parameter → false', walkthroughEnabledFrom('', '/_smoketest-8402.html'), false);
  eq('W0g …the harness page with ?walkthrough=1 → true', walkthroughEnabledFrom('?walkthrough=1', '/_smoketest-8402.html'), true);
  eq('W0h …the shipping page → true', walkthroughEnabledFrom('', '/index.html'), true);
  eq('W0i …the shipping page with ?walkthrough=0 → false', walkthroughEnabledFrom('?walkthrough=0', '/index.html'), false);
  eq('W0j …the harness page with DEBUG.walkthroughInHarness true → true', walkthroughEnabledFrom('', '/_smoketest-8402.html', true), true);
  eq('W0k …?tier=gpu alone on the harness page → false (only the walkthrough parameter counts)', walkthroughEnabledFrom('?tier=gpu', '/_smoketest-1.html'), false);
  ok('W0l the fixture box is on the manifest', !!box && !!boxRow, boxRow ? boxRow.entityId : 'no box row');
  eq('W0m STEPS is three cards', STEPS.length, 3);
  ok('W0n WALKTHROUGH.step3Ms is a positive number of sim ms', Number.isFinite(WALKTHROUGH.step3Ms) && WALKTHROUGH.step3Ms > 0, String(WALKTHROUGH.step3Ms));
}
emit('running...');

/* ── W1. title.start() → step 1, the seat's glyphs, out of the way ─────────────────── */
lines.push('--- W1. START → step 1 with the seat\'s grip glyphs, outside the centre third, overlapping nothing ---');
{
  title.start();
  frame();
  eq('W1 title.start() shows the card', card().hidden, false);
  eq('W1a …at step 1', W.step, 1);
  eq('W1b …labelled 1 of 3', stepLabel(), '1 of 3');
  ok('W1c …with the grab verb ("Look at a box and hold")', /Look at a box and hold/.test(text()), text());
  deep('W1d …and the keyboard seat\'s grip glyphs LMB then RMB as chips', chips(), ['LMB', 'RMB']);
  ok('W1e …no {token} left unresolved', !/\{/.test(text()), text());
  eq('W1f …and no pad chip on the keyboard', card().querySelector('.wt-dev').hidden, true);
  ok('W1g the card is coaching (steps 1-2: the stall hint yields)', W.coaching === true);
  ok('W1h …and shown this run', W.shownThisRun === true);

  M.feedHuds();
  hud.setObjective('carry a box to the truck out front');
  hud.notice('a strap gave way', 'damage');
  const help = document.getElementById('help');
  const objective = hud.el.querySelector('.objective');
  const notice = hud.el.querySelector('.notices .notice');
  const c = rect(card());
  ok('W1i the card\'s rect lies outside the centre third (m11 O5\'s predicate)', outsideCentre(card()), fmt(c));
  ok('W1j …it does not overlap the help line', !overlaps(c, rect(help)), `card ${fmt(c)} help ${fmt(rect(help))}`);
  ok('W1k …it sits ABOVE the help line (bottom ≤ help top)', c.b <= rect(help).t, `card bottom ${c.b.toFixed(1)} help top ${rect(help).t.toFixed(1)}`);
  ok('W1l …it does not overlap the objective line', objective && !overlaps(c, rect(objective)), objective ? `obj ${fmt(rect(objective))}` : 'no objective');
  ok('W1m …nor a notice', notice && !overlaps(c, rect(notice)), notice ? `notice ${fmt(rect(notice))}` : 'no notice');
  // The bottom band's other tenant (M9): a caption of the longest kind the audio layer writes.
  hud.setCaption('a strap gave way — the cargo shifted', '←');
  const caption = hud.el.querySelector('.caption');
  ok('W1m1 …nor the caption line (M9, bottom-centre)', caption && !caption.hidden && !overlaps(c, rect(caption)), caption ? `caption ${fmt(rect(caption))}` : 'no caption');
  hud.setCaption('');
  ok('W1n …it is on the left edge (left < 20 px)', c.l < 20 && c.l >= 0, `left ${c.l.toFixed(1)}`);
  ok('W1o …and inside the viewport', c.t >= 0 && c.b <= window.innerHeight && c.r <= window.innerWidth, fmt(c));
  ok('W1p it is the FIRST child of #ui, so every HUD and card paints over it (a notice stacks above)',
     document.getElementById('ui').firstElementChild === card());
  eq('W1q the card itself takes no pointer events (§21.1) …', getComputedStyle(card()).pointerEvents, 'none');
  eq('W1r …only its ✕ does', getComputedStyle(card().querySelector('.wt-skip')).pointerEvents, 'auto');
  lines.push(`      card ${fmt(c)} (${(c.r - c.l).toFixed(0)}×${(c.b - c.t).toFixed(0)} px); help ${fmt(rect(help))}; viewport ${window.innerWidth}×${window.innerHeight}; centre third x ${(window.innerWidth / 3).toFixed(0)}-${(2 * window.innerWidth / 3).toFixed(0)}, y ${(window.innerHeight / 3).toFixed(0)}-${(2 * window.innerHeight / 3).toFixed(0)}`);
  clearNotices();

  // A stubbed pad (m12 K3's stub, through the same debounced feed): LT / RT and the pad chip.
  input.activeDevice[0] = 'pad'; M.feedHuds();
  feed(Math.ceil(PROMPTS.deviceDebounceMs / FRAME) + 2);
  eq('W1s a stubbed pad, once debounced, is the shown device', M.shownDevice(0), 'pad');
  deep('W1t …and the card reads LT then RT', chips(), ['LT', 'RT']);
  eq('W1u …with the pad chip shown', card().querySelector('.wt-dev').hidden, false);
  eq('W1v …reading "pad" in a word (§26.5)', card().querySelector('.wt-dev').textContent.trim(), 'pad');
  input.activeDevice[0] = 'kbm'; M.feedHuds();
  feed(Math.ceil(PROMPTS.deviceDebounceMs / FRAME) + 2);
  deep('W1w back on the keyboard: LMB / RMB again', chips(), ['LMB', 'RMB']);
  eq('W1x …pad chip gone', card().querySelector('.wt-dev').hidden, true);

  // Never under a pause-shaped screen; hints off hides it; a reduced HUD keeps it (it is guidance).
  game.setPaused(true);
  eq('W1y paused → the card is hidden at once (the pause card owns the screen)', card().hidden, true);
  game.setPaused(false); frame();
  eq('W1y1 …resumed → back', card().hidden, false);
  M.settingsPanel.show(); frame();
  eq('W1y2 the settings card up → hidden', card().hidden, true);
  M.settingsPanel.hide(); frame();
  eq('W1y3 …closed → back', card().hidden, false);
  M.settingsStore.apply({ hints: false }); frame();
  eq('W1y4 hints off → hidden (M19: hints off means no walkthrough)', card().hidden, true);
  eq('W1y5 …still at step 1, still coaching-capable but not counting as a voice', `${W.step}/${W.active}`, '1/true');
  M.settingsStore.apply({ hints: true }); frame();
  eq('W1y6 hints on → back', card().hidden, false);
  M.settingsStore.apply({ reducedHud: true }); frame();
  eq('W1y7 a reduced HUD keeps the card (guidance, not HUD)', card().hidden, false);
  M.settingsStore.apply({ reducedHud: false }); frame();

  // High contrast: opaque and thicker, the rect unmoved (M19's rule, m27 A2).
  const before = rect(card());
  M.settingsStore.apply({ highContrast: true }); frame();
  const cs = getComputedStyle(card());
  const alpha = (() => { const m = /rgba?\(([^)]+)\)/.exec(cs.backgroundColor); const p = m ? m[1].split(',').map(Number) : []; return p.length > 3 ? p[3] : 1; })();
  eq('W1z high contrast: the card\'s background is opaque (alpha 1)', alpha, 1);
  ok('W1z1 …its border is ≥ 2 px', parseFloat(cs.borderTopWidth) >= 2, cs.borderTopWidth);
  const after = rect(card());
  ok('W1z2 …and its rect moved by < 0.5 px', Math.abs(after.l - before.l) < 0.5 && Math.abs(after.t - before.t) < 0.5 && Math.abs(after.r - before.r) < 0.5 && Math.abs(after.b - before.b) < 0.5,
     `${fmt(before)} → ${fmt(after)}`);
  M.settingsStore.apply({ highContrast: false }); frame();
  eq('W1z3 the switches are back at their defaults', `${hud.reduced}/${document.body.classList.contains('hc')}/${interact.hints}`, 'false/false/true');

  // Position by measurement, but never by a forced layout per frame: the help line is measured
  // once, then only after a resize, a help-line rewrite or a shell change (--ts, .hc).
  const origRect = help.getBoundingClientRect;
  let measured = 0;
  help.getBoundingClientRect = function () { measured++; return origRect.apply(this, arguments); };
  feed(120);
  eq('W1z4 120 frames at step 1 (the game observer and feedHuds: two refreshes each) measure the help line 0 times — the clearance is cached', measured, 0);
  window.dispatchEvent(new Event('resize')); feed(1);
  eq('W1z5 …a resize remeasures it exactly once', measured, 1);
  feed(30);
  eq('W1z6 …and not again', measured, 1);
  M.settingsStore.apply({ highContrast: true }); feed(1);
  M.settingsStore.apply({ highContrast: false }); feed(1);
  eq('W1z7 …high contrast on, then off (the help line restyles): one measurement each', measured, 3);
  M.settingsStore.apply({ uiScale: SHELL_DEFAULTS.uiScale }); feed(1);
  eq('W1z8 …a text-size apply (--ts): one more', measured, 4);
  delete help.getBoundingClientRect;
  const helpTop = rect(help).t;
  eq('W1z9 …and the cached bottom is the live one: innerHeight − help top + WALKTHROUGH.clearancePx',
     parseFloat(card().style.bottom), Math.round((window.innerHeight - helpTop) + WALKTHROUGH.clearancePx));
}
emit('running...');

/* ── W2. dismissed by DOING: grip → carry → load → the objective line takes over ────── */
lines.push('--- W2. a real grip → step 2 in one frame; a real load → step 3; step3Ms later → gone, seen, saved ---');
let stamps = null;
{
  const t0 = game.clock.simTimeMs;
  const g = gripBox();
  ok('W2 fixture: seat 0\'s mover took the box for real (GRIP_STARTED emitted)', !!g && !!me().grips.grips.left, g ? 'grip' : 'no grip — the box is not under the reticle');
  const gripEvt = bus.log.filter((e) => e.type === EVENTS.GRIP_STARTED && e.playerId === me().id).pop();
  ok('W2a …by seat 0\'s player id', !!gripEvt && gripEvt.playerId === M.moverOfSeat(0).id, gripEvt ? gripEvt.playerId : 'no event');
  eq('W2b the step is 2 before the next frame even lands (the event is the trigger)', W.step, 2);
  frame();
  eq('W2c …and the card reads 2 of 3 within one frame', stepLabel(), '2 of 3');
  ok('W2d …"Carry it out to the truck"', /Carry it out to the truck/.test(text()), text());
  ok('W2e step1Ms is the grip event\'s sim stamp', W.stamps[1] === gripEvt.simTimeMs && W.stamps[1] >= t0, `${W.stamps[1]} vs ${gripEvt && gripEvt.simTimeMs}`);
  ok('W2f still coaching at step 2', W.coaching === true);

  const n = loadBox();
  ok(`W2g fixture: the box counted loaded after ${n} frames (CARGO_STATE loaded emitted)`, box.state.loaded, `loaded=${box.state.loaded}`);
  const loadEvt = bus.log.filter((e) => e.type === EVENTS.CARGO_STATE && e.loaded && e.entityId === box.id).pop();
  eq('W2h → step 3', W.step, 3);
  eq('W2i …reading 3 of 3', stepLabel(), '3 of 3');
  ok('W2j …"Now the rest — the panel says what is next"', /Now the rest/.test(text()) && /panel says what is next/.test(text()), text());
  ok('W2k step2Ms is the load event\'s sim stamp, after step1Ms', !!loadEvt && W.stamps[2] === loadEvt.simTimeMs && W.stamps[2] > W.stamps[1], `${W.stamps[1]} → ${W.stamps[2]}`);
  eq('W2l …and the card is no longer coaching (the stall hint may speak again)', W.coaching, false);
  eq('W2m the card is still up', card().hidden, false);

  // WALKTHROUGH.step3Ms of SIM time: two steps short it is still up; past it, gone.
  const short = Math.floor((WALKTHROUGH.step3Ms - 2 * STEP) / FRAME);
  frame(short);
  ok(`W2n ${short} frames later (${(game.clock.simTimeMs - W.stamps[2]).toFixed(0)} ms since the load < ${WALKTHROUGH.step3Ms}) the card is still up`,
     card().hidden === false && W.active, `${card().hidden} ${W.active}`);
  frame(6);
  ok(`W2o …${(game.clock.simTimeMs - W.stamps[2]).toFixed(0)} ms since the load (≥ ${WALKTHROUGH.step3Ms}): gone`, card().hidden === true && !W.active, `${card().hidden} ${W.active}`);
  eq('W2p …retired as done', W.retiredBy, 'done');
  ok('W2q …step3Ms stamped ≥ step2Ms + WALKTHROUGH.step3Ms', W.stamps[3] !== null && W.stamps[3] - W.stamps[2] >= WALKTHROUGH.step3Ms, `${W.stamps[2]} → ${W.stamps[3]}`);
  eq('W2r shell.walkthroughSeen === true', M.shellSettings.walkthroughSeen, true);
  eq('W2s …saved (load().shell.walkthroughSeen)', load().shell.walkthroughSeen, true);
  eq('W2t …and the settings row "Show the first-minute cards again" is unticked (seen; the row is the key\'s negation)', (M.settingsPanel.show(), M.settingsPanel.hide(), control('walkthroughSeen').checked), false);
  stamps = { ...W.stamps };
  lines.push(`      stamps: grip ${stamps[1]} ms, load ${stamps[2]} ms (loaded after ${n} frames), retired ${stamps[3]} ms; step3Ms ${WALKTHROUGH.step3Ms}`);
}
emit('running...');

/* ── W7. the run summary (§27.4 via M6; M21's Comprehension reads this) ────────────── */
lines.push('--- W7. runSummary().walkthrough: { shown, step1Ms, step2Ms, step3Ms }, ascending; round-trips; the settled record ---');
{
  const s = M.runSummary();
  let rt = null, threw = null;
  try { rt = JSON.parse(JSON.stringify(s)); } catch (e) { threw = e; }
  ok('W7 JSON.parse(JSON.stringify(runSummary())) round-trips', !!rt && !threw, threw && threw.message);
  const top = ['phases', 'counters', 'complete', 'restarts', 'questionnaire', 'events', 'build', 'seed', 'contractId', 'invoice', 'walkthrough'];
  ok('W7a R2\'s key list, extended by `walkthrough`', top.every((k) => k in rt), 'missing ' + top.filter((k) => !(k in rt)).join(','));
  // The stamps are sim time at 16.667 ms frames (733.33…); the record keeps whole ms (runLog mm).
  deep('W7b walkthrough === { shown: true, step1Ms, step2Ms, step3Ms } with W2\'s stamps, rounded to the ms',
       rt.walkthrough, { shown: true, step1Ms: Math.round(stamps[1]), step2Ms: Math.round(stamps[2]), step3Ms: Math.round(stamps[3]) });
  ok('W7c …ascending sim stamps', rt.walkthrough.step1Ms < rt.walkthrough.step2Ms && rt.walkthrough.step2Ms < rt.walkthrough.step3Ms,
     JSON.stringify(rt.walkthrough));
  eq('W7d …exactly the four keys', Object.keys(rt.walkthrough).sort().join(','), 'shown,step1Ms,step2Ms,step3Ms');
  ok('W7e …integers of sim ms', [1, 2, 3].every((i) => Number.isInteger(rt.walkthrough[`step${i}Ms`])), JSON.stringify(rt.walkthrough));
  deep('W7f walkthroughReport(): a card never shown → { shown: false }', walkthroughReport({ shown: false, step1Ms: 5 }), { shown: false });
  deep('W7g …a skipped card keeps its nulls', walkthroughReport({ shown: true, step1Ms: 100, step2Ms: null, step3Ms: null }), { shown: true, step1Ms: 100, step2Ms: null, step3Ms: null });

  // The settled record carries the same block; the replay's fresh run, with the cards seen, none.
  M.settle();
  const settled = M.invoiceScreen.report();
  ok('W7h settle() → the sheet\'s record carries the same walkthrough block', !!settled && deepEq(settled.walkthrough, rt.walkthrough), settled ? JSON.stringify(settled.walkthrough) : 'no report');
  // The SAVED run — what §27.4 keeps and what M21's evidence page reads after a reload — not
  // the session's in-memory array: save.js sanitiseRun has a fixed key set and must carry it.
  const savedRuns = load().runs;
  ok('W7i …and the SAVED kept run does (compactRun spreads it; sanitiseRun keeps it through save() and load())',
     savedRuns.length >= 1 && deepEq(savedRuns[savedRuns.length - 1].walkthrough, rt.walkthrough),
     JSON.stringify(savedRuns.length ? savedRuns[savedRuns.length - 1].walkthrough : savedRuns));
  ok('W7i1 …the in-memory kept run agrees', M.keptRuns.length >= 1 && deepEq(M.keptRuns[M.keptRuns.length - 1].walkthrough, rt.walkthrough),
     JSON.stringify(M.keptRuns[M.keptRuns.length - 1] && M.keptRuns[M.keptRuns.length - 1].walkthrough));
  deep('W7i2 sanitiseRun keeps a shown block: whole ms, null for a stamp never set or unreadable',
       sanitiseRun({ walkthrough: { shown: true, step1Ms: 733.4, step2Ms: null, step3Ms: 'x' } }).walkthrough,
       { shown: true, step1Ms: 733, step2Ms: null, step3Ms: null });
  deep('W7i3 …{ shown: false } stays exactly that (a stray stamp dropped)', sanitiseRun({ walkthrough: { shown: false, step1Ms: 5 } }).walkthrough, { shown: false });
  ok('W7i4 …and a record without the key reads null — "not reported" (evidence.js) — with the key present',
     (() => { const s = sanitiseRun({ build: 'x' }); return 'walkthrough' in s && s.walkthrough === null; })());
  M.invoiceScreen.onReplay();
  frame();
  eq('W7j the replay is running, unpaused, in PICKUP', `${game.state.paused}/${game.state.phase}`, 'false/pickup');
  deep('W7k …and its summary reads { shown: false } — the cards were seen, so this run has none', M.runSummary().walkthrough, { shown: false });
  eq('W7l …with no card on screen', card().hidden, true);
}
emit('running...');

/* ── W3. seen at boot → never; the settings row → again at the next run ──────────── */
lines.push('--- W3. walkthroughSeen true → no card through 300 frames with a grip and a load; the row unticked → back at the next run ---');
{
  eq('W3 walkthroughSeen is true (the save a boot would load)', load().shell.walkthroughSeen, true);
  eq('W3a …and sanitiseShell keeps a true through a load', sanitiseShell({ walkthroughSeen: true }).walkthroughSeen, true);
  eq('W3b …refusing a non-boolean ("yes" → the default false)', sanitiseShell({ walkthroughSeen: 'yes' }).walkthroughSeen, false);
  eq('W3c the run armed with seen: inactive, step 0', `${W.active}/${W.step}`, 'false/0');
  let seenFrames = 0;
  const g = gripBox();
  for (let i = 0; i < 100; i++) { frame(); if (W.visible) seenFrames++; }
  const n = loadBox(200);
  for (let i = 0; i < 100; i++) { frame(); if (W.visible) seenFrames++; }
  ok(`W3d 300 frames with a grip (${g ? 'taken' : 'MISSED'}) and a load (${box.state.loaded ? 'counted' : 'MISSED'}, ${n} frames) — the card was visible on ${seenFrames} of them`,
     seenFrames === 0 && !!g && box.state.loaded, `${seenFrames} visible frames`);
  eq('W3e …step stays 0 (the events did not advance a card that does not exist this run)', W.step, 0);
  eq('W3f …not coaching', W.coaching, false);
  deep('W3g …report { shown: false }', W.report(), { shown: false });
  restoreBox();

  // The settings row 'Show the first-minute cards again' (the key's negation): ticked → the
  // shell key and the save say false.
  M.settingsPanel.show();
  eq('W3h the settings row "Show the first-minute cards again" is unticked (seen)', control('walkthroughSeen').checked, false);
  ok('W3h1 …its label is the brief\'s wording, "Show the first-minute cards again"',
     /Show the first-minute cards again/.test(control('walkthroughSeen').closest('label').textContent), control('walkthroughSeen').closest('label').textContent);
  eq('W3h2 …declared inverted on the control itself (data-invert="1"), the way m16 U2 reads it', control('walkthroughSeen').dataset.invert, '1');
  setControl('walkthroughSeen', true);
  M.settingsPanel.hide();
  eq('W3i ticked → shell.walkthroughSeen false', M.shellSettings.walkthroughSeen, false);
  eq('W3j …saved', load().shell.walkthroughSeen, false);
  eq('W3k …the card\'s own reading agrees (its consumer)', W.seen, false);
  frame(5);
  eq('W3l …but this run stays without a card (once per run: it arms at a run\'s start)', card().hidden, true);
  M.resetContract();
  frame();
  eq('W3m the next run (resetContract — the Restart / replay path) shows the card again', card().hidden, false);
  eq('W3n …at step 1', `${W.step}/${stepLabel()}`, '1/1 of 3');
  ok('W3o …fresh stamps', W.stamps[1] === null && W.stamps[2] === null && W.stamps[3] === null);
}
emit('running...');

/* ── W4. skip: the ✕, and Escape typed into the card ─────────────────────────────── */
lines.push('--- W4. ✕ and Escape-into-the-card skip; the Escape never reaches the pause path (m15 P5) ---');
{
  eq('W4 fixture: the card is up at step 1, running', `${card().hidden}/${game.state.paused}`, 'false/false');
  card().querySelector('.wt-skip').click();
  eq('W4a the ✕ → gone', card().hidden, true);
  eq('W4b …retired as a skip', W.retiredBy, 'skip');
  eq('W4c …seen true', M.shellSettings.walkthroughSeen, true);
  eq('W4d …saved', load().shell.walkthroughSeen, true);
  eq('W4e …and the game is still running', game.state.paused, false);

  // Again, with Escape dispatched on the focused ✕ (the keyboard's route into the card).
  showCardsAgain();
  M.resetContract(); frame();
  eq('W4f a new run with seen false: the card is back', card().hidden, false);
  const btn = card().querySelector('.wt-skip');
  btn.focus();
  eq('W4g the ✕ can take focus', document.activeElement, btn);
  key('keydown', 'Escape', btn);
  key('keyup', 'Escape', btn);
  eq('W4h Escape typed into the card → gone', card().hidden, true);
  eq('W4i …retired as a skip, seen true', `${W.retiredBy}/${M.shellSettings.walkthroughSeen}`, 'skip/true');
  frame(3);
  eq('W4j …and game.state.paused is unchanged across three frames — the Escape never reached the pause action', game.state.paused, false);
  eq('W4k …the pause card stayed down', M.pauseScreen.el.hidden, true);
  // The control: a plain Escape on window still pauses through the binding (m15 P5d/P5g).
  press('Escape'); frame();
  eq('W4l a plain Escape on window still pauses (the shell path is intact)', game.state.paused, true);
  press('Escape'); frame();
  eq('W4m …and resumes', game.state.paused, false);
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
}
emit('running...');

/* ── W5. co-op: no card, and a join retires it for the run ────────────────────────── */
lines.push('--- W5. two seats before a run → no card; a join at step 1 → gone for the run, not back when the seat empties ---');
{
  showCardsAgain();
  M.setSeats(2);
  M.resetContract(); frame();
  eq('W5 setSeats(2) before the run: no card', `${card().hidden}/${W.active}/${W.step}`, 'true/false/0');
  deep('W5a …report { shown: false }', W.report(), { shown: false });
  M.setSeats(1);
  M.resetContract(); frame();
  eq('W5b solo again, a new run: the card at step 1', `${card().hidden}/${W.step}`, 'false/1');
  M.setSeats(2);
  eq('W5c setSeats(2) at step 1 → hidden at once', card().hidden, true);
  eq('W5d …retired for the run (coop), not merely hidden', `${W.active}/${W.retiredBy}`, 'false/coop');
  eq('W5e …and NOT marked seen (the player never finished or skipped it)', M.shellSettings.walkthroughSeen, false);
  M.setSeats(1);
  frame(10);
  eq('W5f back to one seat, ten frames: it does not return this run', card().hidden, true);
  deep('W5g …the run\'s report: shown, no stamps', W.report(), { shown: true, step1Ms: null, step2Ms: null, step3Ms: null });
  M.resetContract(); frame();
  eq('W5h …the next run has it again', `${card().hidden}/${W.step}`, 'false/1');
  eq('W5i seats: 1', M.seatCount, 1);
}
emit('running...');

/* ── W6. one voice: the stall hint yields to a card at step 1 ─────────────────────── */
lines.push('--- W6. a card at step 1 for CONTRACT.stallHintMs of idle sim time → no stall notice; skipped → it fires once ---');
{
  for (const m of movers) m.grips.releaseAll('W6');
  M.resetStallHint();
  clearNotices();
  ok('W6 fixture: PICKUP, an armed and zeroed stall timer, the card at step 1',
     game.state.phase === 'pickup' && M.stallHint.armed && M.stallHint.ms === 0 && !M.stallHint.fired && !M.stallHint.done && W.step === 1 && W.coaching,
     `${game.state.phase} ${JSON.stringify(M.stallHint)} step ${W.step}`);
  eq('W6a hints are on (this is not M19\'s switch doing the silencing)', M.shellSettings.hints, true);
  const frames = Math.ceil(CONTRACT.stallHintMs / FRAME) + 30;
  const t0 = game.clock.simTimeMs;
  frame(frames);
  const idle = game.clock.simTimeMs - t0;
  ok(`W6b ${frames} idle frames = ${idle.toFixed(0)} ms of sim time ≥ CONTRACT.stallHintMs (${CONTRACT.stallHintMs})`, idle >= CONTRACT.stallHintMs);
  eq('W6c …raise NO stall notice — the queue and the HUD rings, not the DOM', stallNotices(), 0);
  eq('W6d …the timer never counted (suppressed at the source)', M.stallHint.ms, 0);
  ok('W6e …neither fired nor retired', !M.stallHint.fired && !M.stallHint.done, JSON.stringify(M.stallHint));
  eq('W6f …and the card is still up at step 1', `${card().hidden}/${W.step}`, 'false/1');

  card().querySelector('.wt-skip').click();
  eq('W6g skipped → not coaching', W.coaching, false);
  const t1 = game.clock.simTimeMs;
  frame(frames);
  ok(`W6h …${(game.clock.simTimeMs - t1).toFixed(0)} ms of idle sim time later the stall hint fired exactly once`, stallNotices() === 1, `${stallNotices()} notices`);
  ok('W6i …the timer counted this time', M.stallHint.fired && M.stallHint.done && M.stallHint.ms >= CONTRACT.stallHintMs, JSON.stringify(M.stallHint));
  frame(120);
  eq('W6j …and never a second time this run (once per run, M5)', stallNotices(), 1);
  const n = M.pendingNotices.find((x) => /grab|hold/.test(x.text)) || huds[0]._notices.find((x) => /grab|hold/.test(x.text));
  ok('W6k …in the seat\'s own glyphs (LMB / RMB)', !!n && /LMB \/ RMB/.test(n.text), n ? n.text : 'no notice');
  clearNotices();
}
emit('running...');

/* ── W2x. the other way out of step 3: the first item delivered ───────────────────── */
lines.push('--- W2x. step 3 also retires on the first delivered item, before step3Ms ---');
{
  showCardsAgain();
  M.resetContract(); frame();
  eq('W2x fixture: a new run, the card at step 1', `${card().hidden}/${W.step}`, 'false/1');
  const g = gripBox(); frame();
  const n1 = loadBox();
  eq(`W2x1 grip (${g ? 'taken' : 'MISSED'}) then load (${n1} frames) → step 3`, W.step, 3);
  const n2 = deliverBox();
  ok(`W2x2 the box delivered to its room (${rowOf().toZone}) after ${n2} frames`, rowOf().delivered, `delivered=${rowOf().delivered}`);
  eq('W2x3 → the card retired as done', `${card().hidden}/${W.retiredBy}`, 'true/done');
  ok(`W2x4 …${(W.stamps[3] - W.stamps[2]).toFixed(0)} ms after the load — before step3Ms (${WALKTHROUGH.step3Ms})`,
     W.stamps[3] !== null && W.stamps[3] - W.stamps[2] < WALKTHROUGH.step3Ms, `${W.stamps[2]} → ${W.stamps[3]}`);
  eq('W2x5 …seen true', M.shellSettings.walkthroughSeen, true);
  restoreBox();
  M.resetContract(); frame();
}
emit('running...');

/* ── W8. shell state: not in game.state, no bodies, no scene children, a constant DOM ─ */
lines.push('--- W8. not in game.state (m0 E8), no bodies or scene children (m14), a constant DOM across three show/skip cycles ---');
{
  ok('W8 game.state is JSON-serializable and carries no walkthrough key', (() => {
    try { const s = JSON.parse(JSON.stringify(game.state)); return !('walkthrough' in s) && !('walkthroughSeen' in s); } catch (e) { return false; }
  })());
  ok('W8a …nor does its telemetry block', !JSON.stringify(game.state.telemetry).includes('walkthrough'));
  // The baseline is the card SHOWING step 1 (its two key chips are content, not growth); every
  // cycle skips it and shows it again, and the counts are read back in that same state.
  showCardsAgain();
  M.resetContract(); frame();
  eq('W8a1 fixture: the card is up at step 1', `${card().hidden}/${W.step}`, 'false/1');
  const bodies0 = physics.stats.bodies;
  const scene0 = M.world.scene.children.length;
  const ui = document.getElementById('ui');
  const dom0 = document.querySelectorAll('*').length;
  const uiKids0 = ui.children.length;
  const cardEl = card();
  const inner0 = cardEl.querySelectorAll('*').length;
  let vis = 0, gone = 0;
  for (let cycle = 0; cycle < 3; cycle++) {
    cardEl.querySelector('.wt-skip').click();
    frame();
    if (card().hidden && !W.active) gone++;
    showCardsAgain();
    M.resetContract(); frame();
    if (!card().hidden && W.step === 1) vis++;
  }
  eq('W8b three skip/show cycles: the card went each time', gone, 3);
  eq('W8b1 …and showed again at step 1 each time', vis, 3);
  eq('W8c …bodies unchanged', physics.stats.bodies, bodies0);
  eq('W8d …scene children unchanged', M.world.scene.children.length, scene0);
  eq('W8e …document element count unchanged', document.querySelectorAll('*').length, dom0);
  eq('W8f …#ui child count unchanged', ui.children.length, uiKids0);
  eq('W8g …the card is the same element with the same inner count', `${card() === cardEl}/${cardEl.querySelectorAll('*').length}`, `true/${inner0}`);
  eq('W8h …exactly one #walkthrough', document.querySelectorAll('#walkthrough').length, 1);
  cardEl.querySelector('.wt-skip').click(); frame();
  lines.push(`      bodies ${bodies0}, scene children ${scene0}, elements ${dom0}, #ui children ${uiKids0}, card inner ${inner0} (step 1: two key chips)`);
}
emit('running...');

/* ── W7y. the settlement sheet HIDES an active card (not retires it); the replay arms a fresh one ── */
lines.push('--- W7y. settle() at step 1 → hidden under the sheet, still active; its record says shown with no stamps; the replay arms it again ---');
{
  showCardsAgain();
  M.resetContract(); frame();
  eq('W7y fixture: the card is up at step 1', `${card().hidden}/${W.step}`, 'false/1');
  M.settle(); frame();
  eq('W7y1 settle() → the settlement sheet is up and the card is hidden', `${M.invoiceScreen.visible}/${card().hidden}`, 'true/true');
  eq('W7y2 …hidden, not retired: still active at step 1, no reason', `${W.active}/${W.step}/${W.retiredBy}`, 'true/1/');
  const noStamps = { shown: true, step1Ms: null, step2Ms: null, step3Ms: null };
  deep('W7y3 …its record: shown, every stamp null (the run ended first)', M.invoiceScreen.report().walkthrough, noStamps);
  deep('W7y4 …and the saved kept run carries the same', load().runs.slice(-1)[0].walkthrough, noStamps);
  eq('W7y5 …a settlement does not mark the browser seen (nothing finished or skipped the cards)', M.shellSettings.walkthroughSeen, false);
  M.invoiceScreen.onReplay(); frame();
  eq('W7y6 the replay arms a fresh card at step 1, running', `${card().hidden}/${W.step}/${game.state.paused}`, 'false/1/false');
  card().querySelector('.wt-skip').click(); frame();
  eq('W7y7 …skipped for the teardown: seen', `${card().hidden}/${M.shellSettings.walkthroughSeen}`, 'true/true');
}
emit('running...');

/* ── Z. teardown ──────────────────────────────────────────────────────────────── */
lines.push('--- Z. it still runs, and nothing survives this suite ---');
{
  restoreBox();
  frame(30);
  ok('Z1 state is still plain serializable data (§22.4)', (() => { try { JSON.stringify(game.state); return true; } catch (e) { return false; } })());
  eq('Z2 the game ends the suite running, solo, cards hidden', `${game.state.paused}/${M.seatCount}/${M.pauseScreen.el.hidden}/${M.settingsPanel.el.hidden}`, 'false/1/true/true');
  ok('Z3 no error banner appeared during the suite', banner() === '', banner());
  localStorage.removeItem(SAVE_KEY);
  eq('Z4 the save is cleared', localStorage.getItem(SAVE_KEY), null);
}

} catch (e) {
  fails++;
  lines.push(`FAIL  suite threw  <- ${e && e.message}`);
  lines.push((e && e.stack || '').split('\n').slice(0, 6).join('\n'));
}

try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* nothing to clear */ }
emit();
