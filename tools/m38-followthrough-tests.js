/* Phase 11 build-side M31 suite — M24's own list of open items, closed.
 *
 * GDD §21.2 Contract UX (brief, animated invoice, event recap, retry); §15.3 attribution "for
 * humour and learning"; §21.4 Motion ("a switch for anything that animates"); §13.4 the saved
 * best; §26.1 "the invoice reports accurately".
 *
 * M24 built §21.2's four surfaces and its own review recorded five things it had not done
 * (docs/KNOWN_ISSUES.md, Phase 26). Four of them are one-file consumers of seams that already
 * existed, and this suite is the proof that each is now wired end to end:
 *
 *   F1  THE SEAT COLUMN. recapFrom() has read `by` since M24 and only the door events carried
 *       one, so 'legs off', every item-damage row and every property row printed a blank seat
 *       whoever did them. interact.js names the mover who turned the screwdriver; damage.js
 *       names the holder at the window's first contact (heldBy's first entry, M14's per-hand
 *       shape). A row with NO actor — a thrown box, a road event — still prints nothing, and
 *       that is asserted too: the blank is a fact about the run, not a gap in the wiring.
 *   F2  THE BRIEF REFRESHES. briefFacts() is pure and was called once, at boot, so a
 *       settlement that set a new best changed the title's goal line only at the NEXT boot.
 *       It is re-fed at every settlement and at the end of every resetContract; the rest of
 *       the brief is identical over a replay of the same seed, which is what makes the goal
 *       line the only thing that moved.
 *   F3  THE REVEAL HAS ITS SWITCH. §21.4 Motion asks for one per animation and the reveal had
 *       only `?reveal=` and the OS. The shell key `invoiceReveal` is a row on the settings
 *       card under 'Reading the screen', its default follows prefers-reduced-motion the way
 *       cameraShake's does (M16's rule), and the effective switch is that row AND the page
 *       rule — with `?reveal=on|off` still winning over both for the screenshot path.
 *   F4  ONE KEEP-LOADOUT BOX. The settlement sheet has had 'keep the tools on the truck'
 *       since M24; the pause card's Restart always restored the stock loadout and said
 *       nothing. Both boxes are views of one saved shell key now, so the two restarts agree.
 *
 * The reveal is driven by an INJECTED clock (invoiceScreen.clock) because the harness freezes
 * performance.now() (KNOWN_ISSUES Phase 18). localStorage 'mfh.save' is cleared at the START
 * and the END (m16's rule).
 *
 * Fixtures: step/lookAt/placeMover/reachFor/parkAt/freshRun from tools/m33-consistency-tests.js
 * (itself m30's and m22's), the recap fixture from tools/m31-contract-ux-tests.js R1.
 */

import { SIM, INVOICE, DEBUG } from '../src/config.js';
import { EVENTS, PHASES } from '../src/core/eventBus.js';
import { recapFrom, revealEnabledFrom, revealEnabledWith } from '../src/ui/invoiceScreen.js';
import { evidenceFrom } from '../src/telemetry/evidence.js';
import { defaultSave, sanitiseShell, load, SAVE_KEY, SAVE_SCHEMA, SHELL_DEFAULTS } from '../src/core/save.js';
import { cabPoint, cargoInterior, insideCargo } from '../src/world/truck.js';
import { PHASE6_TOOL_SPAWNS } from '../src/tools/definitions.js';
import { GROUP_PRESETS } from '../src/physics/world.js';

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
const deep = (n, a, b) => ok(n, deepEq(a, b), `got ${JSON.stringify(a).slice(0, 300)}, want ${JSON.stringify(b).slice(0, 300)}`);

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
try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* no storage — the suite still runs */ }

let M;
try { M = await window.__MFH_READY; }
catch (e) {
  fails++; lines.push(`FAIL  boot threw  <- ${e && e.message}`);
  lines.push((e && e.stack || '').split('\n').slice(0, 6).join('\n'));
  emit(); throw e;
}

const { game, physics, registry, movers, tools, straps, cargo, damage, interact, invoiceScreen, huds, input } = M;
const recorder = M.recorder;
const STEP = SIM.stepMs;
const FRAME = 16.667;
const I = cargoInterior();

/* The brief as it was at boot — before this suite settles anything (F2 compares to it). */
const bootFacts = JSON.parse(JSON.stringify(M.briefFacts()));
const bootReveal = invoiceScreen.revealEnabled;
const realClock = invoiceScreen.clock;

/* ── drivers (m31 / m33 lineage) ──────────────────────────────────────────── */
function frames(n) { for (let k = 0; k < n; k++) game.frame(FRAME); }
/** m33's system-level step: main.js's movers system would drop a hand-taken grip on the next
 *  frame, so anything with a hand on it is driven here. */
function step(n = 1, intents = {}) {
  for (let i = 0; i < n; i++) {
    physics.clearForces();
    for (const m of movers) {
      const it = intents[m.id] || {};
      const yaw = it.yaw !== undefined ? it.yaw : m.grips.aimYaw;
      m.grips.step(STEP, { brace: !!it.brace, simTimeMs: game.clock.simTimeMs });
      m.controller.step(STEP, {
        move: it.move || { x: 0, y: 0 },
        forward: { x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw) },
        right: { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) },
        run: false, brace: !!it.brace, jump: false, recover: false,
      });
    }
    interact.step(movers, STEP);
    straps.step(STEP, game.clock.simTimeMs);
    physics.step();
    registry.step(STEP);
    cargo.step(STEP, game.clock.simTimeMs);
    damage.step(STEP, game.clock.simTimeMs);
  }
}
const byDef = (id) => { for (const e of registry.entities.values()) if (e.defId === id) return e; return null; };
const allOfDef = (id) => [...registry.entities.values()].filter((e) => e.defId === id);
const posOf = (e) => { const t = e.body.translation(); return { x: t.x, y: t.y, z: t.z }; };
const toolByDef = (id) => { for (const t of tools.tools.values()) if (t.defId === id) return t; return null; };
const sheet = () => invoiceScreen.el;
const card = () => M.pauseScreen.el;
const me = () => movers[M.activeMoverIndex];
function parkAt(e, x, y, z, yaw = 0) {
  e.body.setTranslation({ x, y, z }, true);
  e.body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
  e.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  e.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  e.body.wakeUp();
  physics.primeQueries();
}
function placeMover(m, x, z, y = 0.2) {
  m.controller.hardSetPosition({ x, y, z });
  m.controller._vel.x = 0; m.controller._vel.z = 0;
  m.controller.velocityY = 0; m.controller._climb = null;
  m.controller.carriedMass = 0; m.controller.resistedForce = 0;
  m.controller.pull.x = 0; m.controller.pull.z = 0;
  m.controller.imbalance = 0; m.controller.exertion = 0; m.controller._downMs = 0;
}
function lookAt(m, from, target) {
  placeMover(m, from.x, from.z, from.y !== undefined ? from.y : 0.2);
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
}
function reachFor(m, e, hand = 'right', r = 1.35, offsets = null) {
  const t = posOf(e);
  const tries = offsets || [{ x: 0, z: r }, { x: r, z: 0 }, { x: 0, z: -r }, { x: -r, z: 0 }];
  for (const off of tries) {
    lookAt(m, { x: t.x + off.x, z: t.z + off.z, y: 0.2 }, t);
    step(3);
    const g = m.grips.tryGrab(hand, m.id, game.clock.simTimeMs);
    if (g && g.entityId === e.id) return g;
    m.grips.release(hand, 'released', game.clock.simTimeMs);
  }
  return null;
}
const releaseAll = () => { for (const m of movers) m.grips.releaseAll('released', game.clock.simTimeMs); };
function parkMoversAway() { movers.forEach((m, i) => placeMover(m, -26 - i * 2, 26)); }
function drainNotices() { const n = M.pendingNotices.length; M.pendingNotices.splice(0, n); return n; }
function clearNotices() { drainNotices(); for (const h of huds) { h._notices.length = 0; h._renderNotices(); } }
function freshRun() {
  if (invoiceScreen.visible) invoiceScreen.onReplay(); else { M.resetContract(); game.setPaused(false); }
  clearNotices();
  frames(5);
}
/** m31's putDown: a carried tool parked on open ground, groups restored (it collides with
 *  nothing while carried). A tool left IN HAND sits between the camera and the world, and the
 *  small-tool aim assist then wins every probe — measured here: the cab was unreachable. */
function putDown(t) {
  for (const s of interact.state.values()) { s.carriedTool = null; s.pendingAnchor = null; }
  t.body.setBodyType(physics.R.RigidBodyType.Dynamic, true);
  t.collider.setCollisionGroups(GROUP_PRESETS.object);
  t.state.carriedBy = null;
  parkAt(t, 52, t.def.dimensions.y / 2 + 0.01, -28);
  step(2);
}
/** m31's tool pick-up: stand where the tool can be seen, press E. */
function pickUp(t) {
  const p = t.body.translation();
  for (const off of [{ x: 0, z: 1.1 }, { x: 1.1, z: 0 }, { x: 0, z: -1.1 }, { x: -1.1, z: 0 }]) {
    lookAt(me(), { x: p.x + off.x, z: p.z + off.z, y: 0.2 }, { x: p.x, y: p.y, z: p.z });
    step(3);
    interact.act(me(), game.clock.simTimeMs);
    if (interact._for(me().id).carriedTool === t.id) return true;
  }
  return false;
}
const seatOfId = (id) => { const i = movers.findIndex((m) => m.id === id); return i >= 0 ? M.seatOfMover(i) : -1; };
/** The recap the SHEET is showing, as rows. */
const recapRows = () => [...sheet().querySelectorAll('.recap-item')].map((li) => ({
  kind: li.dataset.kind, seat: Number(li.dataset.seat), at: Number(li.dataset.at),
  s: li.querySelector('.s').textContent, text: li.querySelector('.x').textContent,
}));
const goalEl = () => M.title.el.querySelector('.bgoal[data-k="best"]');
const money = (n) => (n < 0 ? '−' : '') + Math.abs(n).toFixed(2);

try {

/* ── F2. the brief is re-read after a settlement and after a reset ────────── */
emit('F2...');
lines.push('--- F2. the goal line follows the best; the rest of the brief is the same brief (GDD §21.2, §13.4) ---');
{
  ok('F2 fixture: at boot the brief has no best yet (nothing settled on this machine)',
     bootFacts.goals.best === null && /no best yet/.test(goalEl().textContent), goalEl().textContent);
  eq('F2 fixture: the card is showing the boot facts', deepEq(M.title.brief, bootFacts), true);

  // Run 1: settle it as it stands. Whatever the profit, it is the first, so it IS the best.
  drainNotices();
  M.settle();
  const p1 = M.buildInvoice(game.state, M.manifestSummary(game.state.manifest),
    { recoveries: M.recoveryCount(), collisions: 0, moverCount: movers.length, seatCount: M.seatCount }).profit;
  lines.push(`      run 1 settled at ${money(p1)}; run 2 will be lower by an item-damage line`);
  ok('F2a the brief was re-fed at the settlement: the goal line names run 1\'s profit as the best to beat',
     !!M.title.brief.goals.best && Math.abs(M.title.brief.goals.best.profit - p1) < 0.005,
     JSON.stringify(M.title.brief.goals));
  eq('F2a …and the card\'s own goal row carries it (data-profit, to the cent)',
     goalEl().dataset.profit, p1.toFixed(2));
  ok('F2a …in words a player reads', /beat your best/.test(goalEl().textContent) && goalEl().textContent.includes(money(p1)),
     goalEl().textContent);
  ok('F2a …and the brief is the live facts, not a stale object', deepEq(M.title.brief, M.briefFacts()));

  // The replay: everything but the goal line is the boot brief again (same seed).
  invoiceScreen.onReplay();
  frames(5);
  const after = M.title.brief;
  const strip = (f) => { const { goals, ...rest } = f; void goals; return rest; };
  deep('F2b resetContract re-fed the brief: manifest, doors, hazards, prep, payout and estimate deep-equal the boot facts (same seed)',
       strip(JSON.parse(JSON.stringify(after))), strip(bootFacts));
  ok('F2b …and the goal line persists across the reset (§13.4 — the best is not contract state)',
     !!after.goals.best && Math.abs(after.goals.best.profit - p1) < 0.005, JSON.stringify(after.goals.best));
  eq('F2b …the manifest is the same 23 rows', after.manifest.total, bootFacts.manifest.total);

  // Run 2, deliberately worse: one dropped television is an item-damage line the invoice bills.
  const tv = byDef('tv_55_01');
  parkAt(tv, -38, tv.def.dimensions.y / 2 + 1.5, 30, Math.PI / 2);
  frames(150);
  damage.flush(game.clock.simTimeMs);
  ok('F2c fixture: run 2 wrote an item-damage line', game.state.ledger.itemDamage.length >= 1,
     `${game.state.ledger.itemDamage.length} lines`);
  drainNotices();
  M.settle();
  const p2 = invoiceScreen.report().invoice.profit;
  ok(`F2c run 2 is worse (${money(p2)} < ${money(p1)})`, p2 < p1 - 0.005, `${p2} vs ${p1}`);
  ok('F2c …so the goal line still names run 1: a lower settlement never replaces the best (§13.4)',
     Math.abs(M.title.brief.goals.best.profit - p1) < 0.005 && goalEl().dataset.profit === p1.toFixed(2),
     `${JSON.stringify(M.title.brief.goals.best)} / ${goalEl().dataset.profit}`);
  ok('F2c …and the sheet agrees it was not the best', !/new best/.test(sheet().querySelector('.best').textContent),
     sheet().querySelector('.best').textContent);
  ok('F2d briefFacts() is still pure: called twice in a row it gives the same facts and touches no state',
     deepEq(M.briefFacts(), M.briefFacts()) && !/"brief"/.test(JSON.stringify(game.state)));
  freshRun();
}

/* ── F3. the reveal's switch ──────────────────────────────────────────────── */
emit('F3...');
lines.push('--- F3. the settlement reveal has a settings row, and it is the row AND the page rule (GDD §21.2, §21.4 Motion) ---');
{
  const panel = M.settingsPanel;
  const control = () => panel.el.querySelector('[data-setting="invoiceReveal"]');
  ok('F3 the row is on the settings card as a data row (the m16 U2 walk finds it)',
     panel.keys().includes('invoiceReveal') && !!control() && control().type === 'checkbox',
     panel.keys().join(','));
  ok('F3 …under \'Reading the screen\', beside the other §21.4 rows',
     control().closest('.set-group').querySelector('.set-head').textContent === 'Reading the screen',
     control().closest('.set-group').querySelector('.set-head').textContent);
  ok('F3 …and the label says what it does and names the OS rule',
     /reveal/i.test(control().closest('.set-row').textContent) &&
     /reduced motion/i.test(control().closest('.set-row').nextElementSibling.textContent),
     control().closest('.set-row').textContent.trim());

  // The DEFAULT is the reduced-motion reading, both branches — M16's rule, through save.js.
  eq('F3a the shell default follows prefers-reduced-motion (M16\'s rule, both branches via the stub)',
     `${defaultSave({ reducedMotion: true }).shell.invoiceReveal}/${defaultSave({ reducedMotion: false }).shell.invoiceReveal}`,
     'false/true');
  eq('F3a …and a save that carries no choice takes the same reading',
     `${sanitiseShell({}, { reducedMotion: true }).invoiceReveal}/${sanitiseShell({}, { reducedMotion: false }).invoiceReveal}`,
     'false/true');
  eq('F3a …a saved choice wins over the OS', sanitiseShell({ invoiceReveal: true }, { reducedMotion: true }).invoiceReveal, true);
  eq('F3a …the live boot value is the shell key composed with the page rule',
     invoiceScreen.revealEnabled, revealEnabledWith(M.shellSettings.invoiceReveal, location.search, location.pathname));
  eq('F3a …which on this harness page is false whatever the box says (m17 M24-R1, m31 V3)', bootReveal, false);

  /* The composition, pinned. `?reveal=` is EXPLICIT and wins over both halves, because a
   * screenshot script cannot tick a box; otherwise the page rule and the row must agree. */
  const HARNESS = '/_smoketest-8400.html';
  eq('F3b revealEnabledWith(false, "", harness, true) === false — the row says no', revealEnabledWith(false, '', HARNESS, true), false);
  eq('F3b …(true, "", harness, true) === true — the row and the page rule agree', revealEnabledWith(true, '', HARNESS, true), true);
  eq('F3b …(true, "", harness, false) === false — the page rule says no', revealEnabledWith(true, '', HARNESS, false), false);
  eq('F3b …(true, "", index.html) === true — the shipping page', revealEnabledWith(true, '', '/index.html'), true);
  eq('F3b …(false, "", index.html) === false — the shipping page with the row off', revealEnabledWith(false, '', '/index.html'), false);
  eq('F3b …(false, "?reveal=on", index.html) === true — the parameter is explicit', revealEnabledWith(false, '?reveal=on', '/index.html'), true);
  eq('F3b …(true, "?reveal=off", index.html) === false — and off is explicit too', revealEnabledWith(true, '?reveal=off', '/index.html'), false);
  eq('F3b …revealEnabledFrom is unchanged: the page rule alone (m31 V3\'s table)',
     `${revealEnabledFrom('', HARNESS, false)}/${revealEnabledFrom('?reveal=on', HARNESS, false)}/${revealEnabledFrom('', '/index.html')}`,
     'false/true/true');

  // The row moves the live switch, through the store, and is saved.
  M.settingsStore.apply({ invoiceReveal: false });
  eq('F3c the row writes the shell key', M.shellSettings.invoiceReveal, false);
  eq('F3c …and the live switch is recomputed from it', invoiceScreen.revealEnabled,
     revealEnabledWith(false, location.search, location.pathname));
  eq('F3c …and it persisted through the save', load().shell.invoiceReveal, false);
  M.settingsStore.apply({ invoiceReveal: true });
  eq('F3c ticking it back writes true', `${M.shellSettings.invoiceReveal}/${load().shell.invoiceReveal}`, 'true/true');
  eq('F3c …the save still has exactly the seven sections',
     Object.keys(JSON.parse(localStorage.getItem(SAVE_KEY))).sort().join(','),
     'bestInvoice,bindings,build,runs,schema,settings,shell');

  /* And SHOW() for real, on both branches: the effective switch composed the way main.js
   * composes it, with DEBUG.invoiceRevealInHarness forced on so the page rule is not the
   * thing under test. The clock is frozen here (KNOWN_ISSUES Phase 18), so the reveal is
   * driven by hand — m31 V1's walk. */
  let now = 1000;
  invoiceScreen.clock = { now: () => now, later: () => null, cancel: () => {} };
  invoiceScreen.revealEnabled = revealEnabledWith(false, '', location.pathname, true);
  eq('F3d fixture: the row off + the harness allowance → the effective switch is off', invoiceScreen.revealEnabled, false);
  drainNotices();
  M.settle();
  eq('F3d shell.invoiceReveal false → show() renders the FINAL state at once (nothing revealing)', invoiceScreen.revealing, false);
  ok('F3d …the breakdown is open and every major line is visible with its final amount',
     sheet().querySelector('.breakdown').hidden === false &&
     [...sheet().querySelectorAll('.majors .mline')].every((el) => !el.hidden &&
       el.querySelector('.mamt').textContent.replace('−', '-') === (Number(el.dataset.final) < 0 ? '-' : '') + Math.abs(Number(el.dataset.final)).toFixed(2)));
  invoiceScreen.onReplay();
  frames(5);

  invoiceScreen.revealEnabled = revealEnabledWith(true, '', location.pathname, true);
  eq('F3e fixture: the row on + the harness allowance → the effective switch is on', invoiceScreen.revealEnabled, true);
  now = 2000;
  drainNotices();
  M.settle();
  ok('F3e shell.invoiceReveal true → the reveal runs: the breakdown is folded and no major line has landed',
     invoiceScreen.revealing === true && sheet().querySelector('.breakdown').hidden === true &&
     [...sheet().querySelectorAll('.majors .mline')].every((el) => el.hidden),
     `revealing ${invoiceScreen.revealing}`);
  const majors = [...sheet().querySelectorAll('.majors .mline')];
  now += INVOICE.reveal.stepMs + INVOICE.reveal.countMs;
  invoiceScreen.revealTick();
  ok('F3e …one step of the clock lands exactly the first line, on its final amount',
     !majors[0].hidden && majors.slice(1).every((el) => el.hidden) &&
     majors[0].querySelector('.mamt').textContent.replace('−', '-') === (Number(majors[0].dataset.final) < 0 ? '-' : '') + Math.abs(Number(majors[0].dataset.final)).toFixed(2),
     majors.map((el) => `${el.dataset.major}:${el.hidden}`).join(' '));
  now += invoiceScreen.revealDurationMs();
  invoiceScreen.revealTick();
  ok('F3e …and the clock past the whole duration finishes it: every line, breakdown open',
     invoiceScreen.revealing === false && sheet().querySelector('.breakdown').hidden === false &&
     majors.every((el) => !el.hidden));
  invoiceScreen.clock = realClock;
  invoiceScreen.revealEnabled = bootReveal;
  eq('F3f the suite put the real clock and the boot switch back', invoiceScreen.clock === realClock && invoiceScreen.revealEnabled, false);
  freshRun();
}

/* ── F4. one 'keep the tools on the truck' box, two restarts ──────────────── */
emit('F4...');
lines.push('--- F4. the pause card\'s Restart keeps the loadout, against the same shell key as the sheet\'s box (GDD §21.2) ---');
{
  if (M.title.visible) M.title.start();
  const sd = toolByDef('screwdriver_01');
  const toolsList = [...tools.tools.values()];
  const spawnOf = (t) => PHASE6_TOOL_SPAWNS[toolsList.indexOf(t)];
  const box = () => card().querySelector('input.keep-loadout');

  game.setPaused(true);
  ok('F4 the pause card is up and carries a keep-loadout box, visible and unticked',
     M.pauseScreen.visible && !!box() && box().closest('label.keep').hidden === false && box().checked === false,
     `visible ${M.pauseScreen.visible} row ${box() && box().closest('label.keep').hidden} checked ${box() && box().checked}`);
  ok('F4 …whose label says the choice is remembered and shared with the invoice',
     /remembered/.test(box().closest('label.keep').textContent) && /invoice/.test(box().closest('label.keep').textContent),
     box().closest('label.keep').textContent.replace(/\s+/g, ' ').trim());
  /* …and it is LAID OUT, not just present. styles.css has no `#pause-screen label.keep` rule
   * (the file is another milestone's this batch), so pauseScreen.js sets the sheet twin's
   * values inline; unasserted, the row would ship as a bare inline label with no gap and a
   * font that ignores `--ts`. Measured against the same numbers as `#settlement label.keep`. */
  {
    const krow = box().closest('label.keep');
    const cs = getComputedStyle(krow);
    const ts = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ts')) || 1;
    ok('F4 …and the row is laid out like the sheet\'s twin: flex, centred, 7 px gap, 11 px × --ts',
       cs.display === 'flex' && cs.alignItems === 'center' && Math.abs(parseFloat(cs.columnGap) - 7) < 0.6 &&
       Math.abs(parseFloat(cs.fontSize) - 11 * ts) < 0.6,
       `display ${cs.display} align ${cs.alignItems} gap ${cs.columnGap} size ${cs.fontSize} ts ${ts}`);
    /* Unwired, the row must be GONE — never a box that does nothing (§2.1). The inline `flex`
     * above would beat the UA's [hidden] rule on its own, so refresh() writes `display` with
     * `hidden`, and this is the assertion that keeps the pair together. */
    const wired = M.pauseScreen.keepLoadout;
    M.pauseScreen.keepLoadout = null;
    M.pauseScreen.refresh();
    ok('F4 …and an UNWIRED card hides the row outright (attribute and computed display)',
       krow.hidden === true && getComputedStyle(krow).display === 'none',
       `hidden ${krow.hidden} display ${getComputedStyle(krow).display}`);
    M.pauseScreen.keepLoadout = wired;
    M.pauseScreen.refresh();
    eq('F4 …and rewiring brings it back', `${krow.hidden}/${getComputedStyle(krow).display}`, 'false/flex');
  }
  game.setPaused(false);

  // Park the screwdriver in the cargo box, tick the card's box, restart from the card.
  parkAt(sd, M.truckPose.x - 0.3, I.minY + 0.25, I.maxZ - 0.9);
  frames(40);
  ok('F4a fixture: the screwdriver is inside the cargo box', insideCargo(posOf(sd)), JSON.stringify(posOf(sd)));
  game.setPaused(true);
  box().click();
  eq('F4a a click on the box writes the shell key', M.shellSettings.keepLoadout, true);
  eq('F4a …and it is saved (remembered between sessions)', load().shell.keepLoadout, true);
  card().querySelector('[data-act="restart"]').click();
  frames(30);
  eq('F4b the card\'s Restart restarted the contract', game.state.phase, PHASES.PICKUP);
  ok('F4b …and the screwdriver is still inside the cargo box', insideCargo(posOf(sd)), JSON.stringify(posOf(sd)));
  eq('F4b …with an object collision group and a dynamic body (M2\'s tool-through-the-floor guard)',
     `${sd.collider.collisionGroups() === GROUP_PRESETS.object}/${sd.body.isDynamic()}`, 'true/true');
  ok('F4b …a fresh contract otherwise: 23 rows, none delivered, no straps, unpaused',
     game.state.manifest.length === 23 && game.state.manifest.every((r) => !r.delivered) && straps.count === 0 && !game.state.paused);

  // Untick it: the same Restart puts every tool back on its rack.
  parkAt(sd, M.truckPose.x - 0.3, I.minY + 0.25, I.maxZ - 0.9);
  frames(40);
  game.setPaused(true);
  ok('F4c the card\'s box comes back TICKED — it is the saved key, not the card\'s memory', box().checked === true);
  box().click();
  eq('F4c unticking it writes false', `${M.shellSettings.keepLoadout}/${load().shell.keepLoadout}`, 'false/false');
  card().querySelector('[data-act="restart"]').click();
  frames(30);
  ok('F4c …and the restart puts the screwdriver back on its rack, with every other tool',
     !insideCargo(posOf(sd)) &&
     toolsList.every((t) => { const s = spawnOf(t), p = posOf(t); return Math.hypot(p.x - s.x, p.z - s.z) < 0.15; }),
     toolsList.map((t) => `${t.defId}:${posOf(t).x.toFixed(2)},${posOf(t).z.toFixed(2)}`).join(' '));

  /* ONE key, TWO boxes: tick it on the settlement sheet and the pause card reads it back on
   * its next redraw, and the other way round. This is the whole of M24 gap 4. */
  drainNotices();
  M.settle();
  const sheetBox = () => sheet().querySelector('input.keep-loadout');
  eq('F4d the sheet\'s box starts from the shell key (false right now)', sheetBox().checked, false);
  sheetBox().click();
  eq('F4d …a click on it writes the same key', M.shellSettings.keepLoadout, true);
  invoiceScreen.onReplay();
  frames(5);
  game.setPaused(true);
  eq('F4d …and the pause card reads ticked after its redraw', box().checked, true);
  game.setPaused(false);
  drainNotices();
  M.settle();
  eq('F4e …and a fresh sheet reads it ticked too — one answer, two places to give it', sheetBox().checked, true);
  invoiceScreen.onReplay();
  frames(5);

  M.settingsStore.reset();
  eq('F4f Defaults clears the tick (a session\'s choice never outlives it silently)',
     `${M.shellSettings.keepLoadout}/${load().shell.keepLoadout}`, 'false/false');
  game.setPaused(true);
  eq('F4f …and the card shows it cleared', box().checked, false);
  game.setPaused(false);
  eq('F4f …Defaults also restored the reveal row to the OS reading', M.shellSettings.invoiceReveal, !M.reducedMotion);
  freshRun();
}

/* ── F1. every recap row that has an actor names its seat ─────────────────── */
emit('F1...');
lines.push('--- F1. the recap\'s seat column: the legs, the held damage and the held wall read P1; a thrown box and the road read nothing (GDD §21.2, §15.3, §8.4) ---');
{
  freshRun();
  frames(10);
  const mySeat = M.seatOfMover(movers.indexOf(me()));
  const i0 = recorder.events.length;
  const since = () => recorder.events.slice(i0);

  // 1. the couch's legs, on open ground (m31 R1's fixture)
  const sd = toolByDef('screwdriver_01');
  ok('F1 fixture: the screwdriver is in hand', pickUp(sd), `carried ${interact._for(me().id).carriedTool}`);
  const couch = byDef('couch_3seat_01');
  parkAt(couch, -22, 0.45, 30);
  lookAt(me(), { x: -22, z: 31.5, y: 0.2 }, { x: -22, y: 0.45, z: 30 });
  step(4);
  const legsMsg = interact.act(me(), game.clock.simTimeMs);
  ok('F1 fixture: the legs came off', (couch.state.removedParts || []).includes('legs'), String(legsMsg));
  const partEv = since().filter((e) => e.type === EVENTS.PART_CHANGED && e.action === 'removed');
  eq('F1a PART_CHANGED "removed" names the mover who turned the screwdriver', partEv.length && partEv[0].by, me().id);
  frames(5);
  putDown(sd);   // out of the hands, and out of the probe's way for the cab below
  frames(5);

  /* 2-3. a box carried into the front wall, TWICE: the wall's property line and the box's own
   * item damage, both with hands on it at the moment the window opens (m33 C4's fixture). */
  parkMoversAway();
  frames(5);
  const b1 = allOfDef('box_small_01')[0];
  const held = [];
  for (let round = 0; round < 2; round++) {
    parkAt(b1, 1.60, 0.27, -1.50);
    step(20);
    const gR = reachFor(movers[0], b1, 'right', 1.1, [{ x: 0, z: 1.1 }, { x: 1.1, z: 0.6 }]);
    const gL = movers[0].grips.tryGrab('left', movers[0].id, game.clock.simTimeMs);
    held.push(!!gR && !!gL && b1.state.grips.length >= 1);
    parkAt(b1, 1.60, 0.27, -1.50);
    b1.body.setLinvel({ x: 0, y: 0, z: -6.0 }, true);
    b1.body.wakeUp();
    step(50);
    damage.flush(game.clock.simTimeMs);
    releaseAll();
    step(10);
  }
  ok('F1 fixture: the box was in seat 0\'s hands for both hits', held.every(Boolean), JSON.stringify(held));
  const heldDamage = since().filter((e) => e.type === EVENTS.DAMAGE_APPLIED && e.category !== 'property' && e.entityId === b1.id);
  const heldProp = since().filter((e) => e.type === EVENTS.DAMAGE_APPLIED && e.category === 'property' && e.entityId === b1.id);
  lines.push(`      held box: ${heldDamage.length} item-damage event(s) ${JSON.stringify(heldDamage.map((e) => e.by))}, ` +
             `${heldProp.length} property event(s) ${JSON.stringify(heldProp.map((e) => e.by))}`);
  ok('F1b the carried box\'s item damage names the holder', heldDamage.length >= 2 && heldDamage.every((e) => e.by === movers[0].id),
     JSON.stringify(heldDamage.map((e) => e.by)));
  ok('F1b …and so does the wall it marked (heldBy\'s first entry, M14\'s per-hand shape)',
     heldProp.length >= 1 && heldProp.every((e) => e.by === movers[0].id && Array.isArray(e.heldBy) && e.heldBy[0] === movers[0].id),
     JSON.stringify(heldProp.map((e) => ({ by: e.by, heldBy: e.heldBy }))));

  // 4. a THROWN box at the same wall: nobody's hands, so nobody is named.
  parkMoversAway();
  const b2 = allOfDef('box_small_01')[1];
  parkAt(b2, 1.60, 0.27, -1.50);
  step(20);
  b2.body.setLinvel({ x: 0, y: 0, z: -6.0 }, true);
  b2.body.wakeUp();
  step(60);
  damage.flush(game.clock.simTimeMs);
  const thrown = since().filter((e) => e.type === EVENTS.DAMAGE_APPLIED && e.entityId === b2.id);
  lines.push(`      thrown box: ${thrown.length} DAMAGE_APPLIED ${JSON.stringify(thrown.map((e) => `${e.category || 'item'}:${e.by}`))}`);
  ok('F1c the thrown box names nobody — `by` is null, not undefined (§22.4 plain data)',
     thrown.length >= 1 && thrown.every((e) => e.by === null), JSON.stringify(thrown.map((e) => e.by)));

  // 5. the drive, far enough for two road events (4.0 s and 12.0 s of the prototype route)
  const cab = cabPoint();
  lookAt(me(), { x: cab.x, z: cab.z + 1.4, y: 0.2 }, cab);
  step(2);
  const depart = interact.act(me(), game.clock.simTimeMs);
  eq('F1 fixture: E at the cab departs', game.state.phase, PHASES.TRANSIT);
  lines.push(`      the cab said: ${JSON.stringify(depart)} (target ${interact.describe(me()).target && interact.describe(me()).target.kind})`);
  frames(Math.ceil(13000 / FRAME) + 30);
  const roads = since().filter((e) => e.type === EVENTS.ROAD_FORCE);
  ok('F1 fixture: two road events so far', roads.length >= 2, `${roads.length}`);
  drainNotices();
  M.settle();

  const rows = recapRows();
  lines.push(`      recap: ${rows.map((r) => `[${r.kind}@${r.at}${r.s ? ' ' + r.s : ''}] ${r.text}`).join(' | ')}`);
  const of = (k) => rows.filter((r) => r.kind === k);
  ok('F1d the sheet lists the part, the damage, the property and the road rows',
     of('part').length === 1 && of('damage').length >= 2 && of('property').length >= 1 && of('road').length >= 2,
     rows.map((r) => r.kind).join(','));
  ok(`F1d the 'legs off' row reads P${mySeat + 1}`,
     of('part').every((r) => r.seat === mySeat && r.s === `P${mySeat + 1}` && /legs off/.test(r.text)),
     JSON.stringify(of('part')));
  ok(`F1e both of the carried box's damage rows read P${mySeat + 1}`,
     of('damage').filter((r) => r.seat === mySeat).length >= 2 &&
     of('damage').filter((r) => r.seat === mySeat).every((r) => r.s === `P${mySeat + 1}`),
     JSON.stringify(of('damage').map((r) => [r.seat, r.text])));
  ok(`F1e the property row reads P${mySeat + 1} too`,
     of('property').every((r) => r.seat === mySeat && r.s === `P${mySeat + 1}`),
     JSON.stringify(of('property').map((r) => [r.seat, r.text])));
  ok('F1f the thrown box\'s damage row is BLANK — no seat, no glyph, no guess',
     of('damage').some((r) => r.seat === -1 && r.s === ''),
     JSON.stringify(of('damage').map((r) => [r.seat, r.text])));
  ok('F1f …and both road rows are blank by design (nobody holds the road)',
     of('road').every((r) => r.seat === -1 && r.s === ''), JSON.stringify(of('road').map((r) => r.seat)));

  /* The record: the key is ADDED to the event shape M6 pinned (m17 R2), and it round-trips. */
  const rep = invoiceScreen.report();
  const evs = rep.events;
  ok('F1g every PART_CHANGED "removed" and DAMAGE_APPLIED in the record carries `by`',
     evs.filter((e) => (e.type === EVENTS.PART_CHANGED && e.action === 'removed') || e.type === EVENTS.DAMAGE_APPLIED)
        .every((e) => 'by' in e && (e.by === null || typeof e.by === 'string')),
     JSON.stringify(evs.filter((e) => e.type === EVENTS.DAMAGE_APPLIED).map((e) => e.by)));
  /* BOTH PART_CHANGED shapes, not just the recap's. The damage system's 'broken' builds no
   * recap row (classify() takes 'removed' only), but a record with one attributed shape and
   * one bare one is a seam a later reader trips over, so it carries the key too — read from
   * the SAME still-open window as the DAMAGE_APPLIED for that impact, which is why the two
   * events about one breakage can never name different people. */
  const parts = evs.filter((e) => e.type === EVENTS.PART_CHANGED);
  lines.push(`      PART_CHANGED in the record: ${parts.map((e) => `${e.action}=${e.by}`).join(' ') || 'none'}`);
  ok('F1g …and BOTH PART_CHANGED shapes carry it — the screwdriver\'s "removed" and the damage system\'s "broken"',
     parts.length >= 1 && parts.every((e) => 'by' in e && (e.by === null || typeof e.by === 'string')),
     parts.map((e) => `${e.action}:${e.by}`).join(' ') || 'no PART_CHANGED in this run');
  const broken = parts.filter((e) => e.action === 'broken');
  ok('F1g …and a "broken" names the same holder as the item DAMAGE_APPLIED it belongs to (one window, one answer)',
     broken.every((e) => {
       const d = evs.filter((x) => x.type === EVENTS.DAMAGE_APPLIED && x.category !== 'property' && x.entityId === e.entityId);
       return d.length === 0 || d.some((x) => x.by === e.by);
     }),
     broken.map((e) => `${e.entityId}:${e.by}`).join(' ') || 'no breakage fragmented in this run');
  const rt = JSON.parse(JSON.stringify(rep));
  ok('F1g …and the record JSON round-trips with it (m17 R2\'s key list, extended)',
     rt.events.length === evs.length &&
     rt.events.filter((e) => e.type === EVENTS.DAMAGE_APPLIED).every((e) => 'by' in e),
     `${rt.events.length} of ${evs.length}`);
  ok('F1g …the recap the sheet drew IS recapFrom over those events (one builder, one log)',
     deepEq(recapFrom(evs, { seatOf: seatOfId }).map((r) => `${r.kind}:${r.ref}:${r.seat}`),
            rows.map((r, i) => `${r.kind}:${[...sheet().querySelectorAll('.recap-item')][i].dataset.ref}:${r.seat}`)));

  /* M21's evidence page tolerates unknown keys: the same run, with every `by` stripped out,
   * produces the identical evidence — the key is for the recap, and nothing else reads it. */
  const stripped = JSON.parse(JSON.stringify(rep));
  let removed = 0;
  for (const e of stripped.events) if ('by' in e) { delete e.by; removed++; }
  ok('F1h fixture: the stripped copy really lost the key', removed >= 1, `${removed} keys removed`);
  /* normaliseRun passes the event LIST through verbatim (evidence.js `events`), so the two
   * evidence objects differ in exactly that array and nowhere else — which is the claim: the
   * page carries the log it was given and derives no signal from the new key. */
  const noEvents = (o) => JSON.parse(JSON.stringify(o, (k, v) => (k === 'events' ? undefined : v)));
  deep('F1h evidenceFrom() over the run is unchanged in every signal (M21 ignores the key; the event list itself is passed through)',
       noEvents(evidenceFrom([stripped])), noEvents(evidenceFrom([rep])));
  const evA = evidenceFrom([stripped]).runs[0], evB = evidenceFrom([rep]).runs[0];
  ok('F1h …including the signals DERIVED from the events (first grip, first load, source, count)',
     evA.firstGripMs === evB.firstGripMs && evA.firstLoadMs === evB.firstLoadMs &&
     evA.timingSource === evB.timingSource && evA.eventsRecorded === evB.eventsRecorded && evA.hasEvents === evB.hasEvents,
     JSON.stringify([evA.firstGripMs, evA.firstLoadMs, evA.timingSource, evA.eventsRecorded]));
  invoiceScreen.onReplay();
  frames(5);
}

/* ── Z. teardown ─────────────────────────────────────────────────────────── */
emit('Z...');
lines.push('--- Z. nothing leaked into state, nothing was left switched on ---');
{
  ok('Z1 game.state is still plain serializable data (§22.4) and carries no brief, no reveal, no loadout tick',
     (() => { const s = JSON.stringify(game.state); return !/"brief"|invoiceReveal|keepLoadout/.test(s); })());
  eq('Z2 the reveal is back to its boot value on this page', invoiceScreen.revealEnabled, false);
  eq('Z3 the reveal clock is the real one again', invoiceScreen.clock, realClock);
  eq('Z4 the game ends the suite running, solo, unpaused', `${game.state.paused}/${M.seatCount}`, 'false/1');
  ok('Z5 no error banner appeared during the suite', !document.getElementById('err-banner'));
  ok('Z6 DEBUG.invoiceRevealInHarness is still what it was (the suite forced it per call, never set it)',
     DEBUG.invoiceRevealInHarness === false, String(DEBUG.invoiceRevealInHarness));
  eq('Z7 the save schema is untouched', load() && SAVE_SCHEMA, SAVE_SCHEMA);
  ok('Z8 SHELL_DEFAULTS still names both new keys', 'invoiceReveal' in SHELL_DEFAULTS && 'keepLoadout' in SHELL_DEFAULTS);
  void input;
}

} catch (e) {
  fails++;
  lines.push(`FAIL  suite threw  <- ${e && e.message}`);
  lines.push((e && e.stack || '').split('\n').slice(0, 6).join('\n'));
}

try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* nothing to clear */ }
emit();
