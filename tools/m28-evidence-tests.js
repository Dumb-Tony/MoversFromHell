/* Phase 11 build-side M21 suite — the §26.7 evidence page and the module behind it.
 *
 * GDD §25.2 Phase 12 "Decision — evidence report and Unity go/revise/stop; fun proven, not
 * feature count"; §26.7 Fun Validation Gate (six signals with minimum evidence); §27.3 the
 * seven playtest questions; §27.4 "local event logs … human-readable"; §22.5 "export event log
 * and invoice inputs for reproducible reports"; zero external requests (project rule).
 *
 * THE CLAIMS UNDER TEST:
 *
 *   PURE AND TOTAL     evidenceFrom([]) is six 'no data' rows and zeroed aggregates; garbage is
 *                      rejected with a reason and the rest proceed; pasted text in any of the
 *                      three shapes (one, many, an array) parses (E1).
 *   THE NUMBERS        six run reports built by M6's buildRunSummary from scripted runs in THIS
 *                      harness (two testers × three runs) score exactly the hand-computed
 *                      fractions and means at EVIDENCE's thresholds (E2); the committed fixture
 *                      tools/_fixtures/runs-sample.json is a snapshot of them (E2z).
 *   THE GDD'S WORDS    the six rule strings are §26.7's minimum-evidence cells verbatim, pinned
 *                      here from the document and not read back from config (E3).
 *   THE EXPORT         the Markdown re-parses row for row against the module (E4).
 *   THE PAGE           docs/evidence.html opened as a second document on the same server:
 *                      paste, Add, six rows with verdict classes, seven question blocks, six
 *                      runs, Clear, and not one request beyond its own module imports (E5).
 *   THE LINK           the settlement sheet's export row links to the page and M6's Copy still
 *                      works (E6).
 *
 * localStorage 'mfh.save' is cleared at the START and the END (m16's rule).
 */

import { SIM, TELEMETRY, EVIDENCE, CONTRACT } from '../src/config.js';
import { EVENTS } from '../src/core/eventBus.js';
import { cargoInterior } from '../src/world/truck.js';
import { DEST_ZONES } from '../src/world/destination.js';
import { LINE_KINDS } from '../src/contract/invoice.js';
import { SAVE_KEY } from '../src/core/save.js';
import { QUESTIONS } from '../src/ui/questionnaire.js';
import {
  evidenceFrom, parseReports, evidenceMarkdown, rejectReason, sessionsOf,
  SIGNAL_IDS, SIGNAL_LABELS, VERDICT,
} from '../src/telemetry/evidence.js';

/** Flip to true ONCE to print the six reports as one base64 line (FIXTURE-B64 …) and write
 *  them to tools/_fixtures/runs-sample.json; leave false so the suite output stays readable. */
const DUMP_FIXTURE = false;
const FIXTURE_URL = '/tools/_fixtures/runs-sample.json';

const lines = [];
let passes = 0, fails = 0;
function ok(name, cond, detail = '') {
  if (cond) { passes++; lines.push(`PASS  ${name}`); }
  else { fails++; lines.push(`FAIL  ${name}${detail ? '  <- ' + detail : ''}`); }
}
const eq = (n, a, b) => ok(n, a === b, `got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const near = (n, a, b, tol = 1e-9) => ok(n, Number.isFinite(a) && Math.abs(a - b) <= tol, `got ${a}, want ${b}`);
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

/* NO NETWORK WAIT AFTER THE GAME STARTS. Measured 2026-09-05: boot alone spends ~130 s of the
 * harness's 240 s virtual-time budget, and once title.start() has run the game's timers burn
 * the rest at the first idle point — an `await fetch(...)` placed after the six scripted runs
 * left the DOM dumped at 'E2z...' with the response still pending, while the same fetch right
 * after boot resolved in 10 ms virtual. So the fixture is a JSON module import BEFORE boot
 * (E2z), and the page's iframe is loaded right after boot, while the page is quiet, and driven
 * synchronously in E5. */
let fixture = null, fixtureErr = null;
try { fixture = (await import(FIXTURE_URL, { with: { type: 'json' } })).default; }
catch (e) { fixtureErr = e && e.message; }

let M;
try { M = await window.__MFH_READY; }
catch (e) {
  fails++; lines.push(`FAIL  boot threw  <- ${e && e.message}`);
  lines.push((e && e.stack || '').split('\n').slice(0, 6).join('\n'));
  emit(); throw e;
}

/* E5's second document, loaded now (measured ready at the first 50 ms tick after boot). */
const iframe = document.createElement('iframe');
iframe.style.cssText = 'position:fixed;left:0;top:0;width:1000px;height:800px;opacity:0.01;border:0';
document.body.appendChild(iframe);
const iframeReady = new Promise((res) => {
  let ticks = 0;
  const tick = () => {
    let w = null;
    try { w = iframe.contentWindow; } catch (e) { w = null; }
    if (w && w.__EVIDENCE && w.document && w.document.querySelector('#add')) return res(true);
    if (++ticks > 600) return res(false);
    setTimeout(tick, 50);
  };
  setTimeout(tick, 50);
});
iframe.src = '/docs/evidence.html';
const pageReady = await iframeReady;

const { game, physics, registry, movers, straps, cargo, damage, interact, rig, camera } = M;
const recorder = M.recorder;
const STEP = SIM.stepMs;
const FRAME = 16.667;
const I = cargoInterior();
const me = () => movers[M.activeMoverIndex];

/* ── drivers (m17 lineage) ────────────────────────────────────────────────── */
function frames(n) { for (let k = 0; k < n; k++) game.frame(FRAME); }
function step(n = 1) {
  for (let i = 0; i < n; i++) {
    physics.clearForces();
    for (const m of movers) {
      const yaw = m.grips.aimYaw;
      m.grips.step(STEP, { brace: false, simTimeMs: game.clock.simTimeMs });
      m.controller.step(STEP, {
        move: { x: 0, y: 0 },
        forward: { x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw) },
        right: { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) },
        run: false, brace: false, jump: false, recover: false,
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
const byDef = (id) => { for (const e of registry.entities.values()) if (e.defId === id) return e; return null; };
function lookAt(m, from, target, snap = false) {
  placeMover(m, from.x, from.z, from.y !== undefined ? from.y : 0.2);
  const p = m.controller.position;
  rig.yaw = Math.atan2(-(target.x - p.x), -(target.z - p.z));
  rig.pitch = Math.atan2(target.y - (p.y + 1.4), Math.hypot(target.x - p.x, target.z - p.z));
  if (snap) rig._first = true;
  for (let k = 0; k < 20; k++) rig.update(p, 1 / 60);
  const c = camera.position;
  rig.yaw = Math.atan2(-(target.x - c.x), -(target.z - c.z));
  rig.pitch = Math.atan2(target.y - c.y, Math.hypot(target.x - c.x, target.z - c.z));
  m.grips.syncAim();
  physics.primeQueries();
}
const standOffFrom = (target, back = 1.3) => ({ x: target.x, z: target.z + back });
const slotIn = (zoneId, index) => {
  const z = DEST_ZONES.find((r) => r.id === zoneId);
  const cols = 4;
  const w = (z.maxX - z.minX) - 1.2, d = (z.maxZ - z.minZ) - 1.2;
  return {
    x: z.minX + 0.6 + ((index % cols) + 0.5) * (w / cols),
    z: z.minZ + 0.6 + (Math.floor(index / cols) + 0.5) * (d / 2),
  };
};
function drainNotices() { const n = M.pendingNotices.length; M.pendingNotices.splice(0, n); return n; }
function unloadEverything() {
  straps.releaseAll();
  const perRoom = {};
  for (const row of game.state.manifest) {
    const e = registry.get(row.entityId);
    if (!e) continue;
    perRoom[row.toZone] = (perRoom[row.toZone] || 0) + 1;
    const sl = slotIn(row.toZone, perRoom[row.toZone] - 1);
    parkAt(e, sl.x, e.def.dimensions.y / 2 + 0.06, sl.z);
  }
  frames(260);
}
const sheet = () => M.invoiceScreen.el;
function answer(id, value) {
  const form = sheet().querySelector('form.questionnaire');
  if (typeof value === 'number') {
    const r = form.querySelector(`input[name="${id}"][value="${value}"]`);
    r.checked = true;
    r.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    const t = form.querySelector(`input[name="${id}"]`);
    t.value = value;
    t.dispatchEvent(new Event('change', { bubbles: true }));
  }
}
const verdictClass = (v) => (v === VERDICT.PASS ? 'v-pass' : v === VERDICT.NOT_YET ? 'v-notyet' : 'v-nodata');
const sig = (ev, id) => ev.signals.find((s) => s.id === id);

/* §26.7, GDD.md, verbatim — pinned HERE from the document (GDD.md:1385-1401), not read back
 * from config, so a rewording in config.js fails against the design authority. */
const GDD_26_7 = {
  comprehension: 'Most players move a box and identify the next objective without coaching',
  emergentStory: 'Most groups recount an unscripted event afterward',
  learning: 'Second run changes route, pack, tool, or coordination',
  replayIntent: 'At least half voluntarily replay or ask for more',
  corePreference: 'Carrying/packing/transport consequences rank highly',
  friction: 'Control confusion and unrecoverable bugs are not dominant',
};

try {
M.title.start();
drainNotices();

/* ── E1. pure and total ───────────────────────────────────────────────────── */
lines.push('--- E1. evidenceFrom([]) and evidenceFrom([garbage]) (GDD §26.7 as a total function) ---');
{
  let ev = null, threw = null;
  try { ev = evidenceFrom([]); } catch (e) { threw = e; }
  ok('E1 evidenceFrom([]) does not throw', !!ev && !threw, threw && threw.message);
  eq('E1 …six signals', ev.signals.length, 6);
  deep('E1 …in the GDD\'s order', ev.signals.map((s) => s.id), [...SIGNAL_IDS]);
  ok('E1 …every verdict is "no data"', ev.signals.every((s) => s.verdict === VERDICT.NO_DATA), ev.signals.map((s) => s.verdict).join(','));
  ok('E1 …every value null, every runIds empty', ev.signals.every((s) => s.value === null && Array.isArray(s.runIds) && s.runIds.length === 0));
  const a = ev.aggregates;
  ok('E1 …aggregates zeroed', a.runs === 0 && a.rejected === 0 && a.complete === 0 && a.completionRate === null && a.profit.mean === null &&
     a.recoveries === 0 && a.grips === 0 && a.drops === 0 && Object.keys(a.trips).length === 0 && Object.keys(a.phases).length === 0 &&
     a.damage.furnitureTotal === 0 && a.eventsMissing === 0, JSON.stringify(a).slice(0, 200));
  eq('E1 …seven §27.3 question blocks even with no runs', ev.histograms.questions.length, 7);
  ok('E1 …each scale block has five zero counts and the sheet\'s end-words',
     ev.histograms.questions.filter((q) => q.kind === 'scale').every((q) => q.counts.length === 5 && q.counts.every((c) => c === 0) && q.low && q.high));
  const md0 = evidenceMarkdown(ev);
  ok('E1 …and the Markdown of nothing still carries the six rows', SIGNAL_IDS.every((id) => md0.includes(`| ${SIGNAL_LABELS[id]} |`)) && !md0.includes('[object'));

  const garbage = [null, 'text', 42, [], {}, { counters: 'x' }, { counters: { grips: 'a' } }, { counters: { grips: 1, drops: 0, recoveries: 0 }, phases: 3 }];
  let g = null; threw = null;
  try { g = evidenceFrom(garbage); } catch (e) { threw = e; }
  ok('E1 evidenceFrom([garbage…]) does not throw', !!g && !threw, threw && threw.message);
  eq('E1 …every garbage entry is rejected', g.rejected.length, garbage.length);
  ok('E1 …each with a reason and its index', g.rejected.every((r, i) => typeof r.reason === 'string' && r.reason.length > 0 && r.index === i),
     JSON.stringify(g.rejected));
  eq('E1 …and no run survives', g.runs.length, 0);
  ok('E1 …so the signals are still "no data"', g.signals.every((s) => s.verdict === VERDICT.NO_DATA));
  const valid = JSON.parse(JSON.stringify(M.runSummary()));
  eq('E1 fixture: a live run summary is not rejected', rejectReason(valid), null);
  const mix = evidenceFrom(['junk', valid, null]);
  ok('E1 mixed input: the report proceeds, the two garbage entries are rejected by index',
     mix.runs.length === 1 && mix.rejected.length === 2 && mix.rejected[0].index === 0 && mix.rejected[1].index === 2 && mix.aggregates.runs === 1,
     `${mix.runs.length} runs, rejected ${JSON.stringify(mix.rejected)}`);
  ok('E1 …and evidenceFrom(not an array) is the empty report', evidenceFrom(null).signals.length === 6 && evidenceFrom('x').runs.length === 0);

  // parseReports: the three pasted shapes, and garbage between reports.
  const one = JSON.stringify(valid, null, 2);
  eq('E1p an array parses to its elements', parseReports(`[${one},${one}]`).items.length, 2);
  eq('E1p one object parses to one item', parseReports(one).items.length, 1);
  eq('E1p whitespace-separated documents parse', parseReports(`${one}\n\n${one}\n  ${one}`).items.length, 3);
  eq('E1p …and concatenated ones', parseReports(`${one}${one}`).items.length, 2);
  const pD = parseReports(`hello ${one} {broken`);
  ok('E1p garbage between reports is rejected on its own and the report survives',
     pD.items.length === 1 && pD.rejected.length === 2 && pD.rejected.every((r) => /not JSON/.test(r.reason)),
     `${pD.items.length} items, ${JSON.stringify(pD.rejected)}`);
  const pE = parseReports('   ');
  ok('E1p empty text → nothing, nothing rejected', pE.items.length === 0 && pE.rejected.length === 0);
  ok('E1p a string with braces inside it does not split the document',
     parseReports(JSON.stringify({ ...valid, questionnaire: { q1: 'a { brace } and a \\" quote' } })).items.length === 1);
  ok('E1p never throws on a non-string', (() => { try { parseReports(null); parseReports(undefined); parseReports(12); return true; } catch (e) { return false; } })());
}

/* ── E3. the GDD's words ──────────────────────────────────────────────────── */
lines.push('--- E3. the six rule strings are §26.7\'s minimum-evidence cells, verbatim ---');
{
  deep('E3 EVIDENCE.rules equals §26.7\'s six cells verbatim (pinned from GDD.md)', { ...EVIDENCE.rules }, GDD_26_7);
  const ev = evidenceFrom([]);
  deep('E3 …and the signals carry those strings as `rule`', ev.signals.map((s) => s.rule), SIGNAL_IDS.map((id) => GDD_26_7[id]));
  deep('E3 …under the GDD\'s row labels', ev.signals.map((s) => s.label),
       ['Comprehension', 'Emergent story', 'Learning', 'Replay intent', 'Core preference', 'Friction']);
  deep('E3a the line kinds the aggregates sum are invoice.js LINE_KINDS (copied so the static page imports only config)',
       { ...EVIDENCE.lineKinds },
       { damage: LINE_KINDS.ITEM_DAMAGE, property: LINE_KINDS.PROPERTY_DAMAGE, leftBehind: LINE_KINDS.LEFT_BEHIND, partsLeft: LINE_KINDS.PARTS_LEFT });
  eq('E3b comprehension.firstGripMs is the stall hint\'s deadline (CONTRACT.stallHintMs)', EVIDENCE.comprehension.firstGripMs, CONTRACT.stallHintMs);
  ok('E3c EVIDENCE is frozen, rules included', Object.isFrozen(EVIDENCE) && Object.isFrozen(EVIDENCE.rules) && Object.isFrozen(EVIDENCE.friction));
  ok('E3d thresholds are numbers in range', EVIDENCE.most === 0.5 && EVIDENCE.half === 0.5 && EVIDENCE.corePreference.minMean > TELEMETRY.questionnaire.scaleMin &&
     EVIDENCE.corePreference.minMean <= TELEMETRY.questionnaire.scaleMax && EVIDENCE.replayIntent.q7Yes <= TELEMETRY.questionnaire.scaleMax);
}
emit('F...');

/* ── F. six synthetic run reports from scripted runs ──────────────────────── */
lines.push('--- F. six run reports from buildRunSummary: tester A (answers all seven) × 3, tester B (skips) × 3 ---');
const reports = [];
const isoAt = (i) => `2026-09-05T10:${String(i * 6).padStart(2, '0')}:00.000Z`;
function beginRun(freshTester) {
  if (M.invoiceScreen.visible) M.invoiceScreen.onReplay(); else { M.resetContract(); game.setPaused(false); }
  // Two testers in one harness session: a tester's first run has no replays before it.
  if (freshTester) recorder.restarts = 0;
  drainNotices();
  frames(20);
}
/** Grab the small box and let go — 'release' is a release, 'drop' a forced drop (m2 F8). */
function gripBox(mode) {
  const box = byDef('box_small_01');
  parkAt(box, -30, box.def.dimensions.y / 2 + 0.02, 30);
  step(30);
  lookAt(me(), standOffFrom(posOf(box), 1.3), posOf(box));
  const g = me().grips.tryGrab('right', me().id, game.clock.simTimeMs);
  step(10);
  if (mode === 'drop') me().grips.releaseAll('dropped', game.clock.simTimeMs);
  else me().grips.release('right', 'released', game.clock.simTimeMs);
  step(5);
  return !!g;
}
/** The box into the truck bed until the cargo system reports it loaded (m17 R4 pattern). */
function loadBox() {
  const box = byDef('box_small_01');
  parkAt(box, M.truckPose.x, I.minY + box.def.dimensions.y / 2 + 0.05, I.maxZ - 0.6);
  frames(70);
  return !!box.state.loaded;
}
function recoverThree() {
  for (const id of ['wardrobe_01', 'fridge_01', 'tv_55_01']) registry.recover(byDef(id), 'm28 evidence');
  frames(5);
}
function settleAndReport(i, answers) {
  drainNotices();
  M.settle();
  if (answers) for (const [k, v] of Object.entries(answers)) answer(k, v);
  else sheet().querySelector('[data-act=skip]').click();
  const rep = JSON.parse(JSON.stringify(M.invoiceScreen.report()));
  // buildRunSummary stamps opts.date at settle; under the harness's virtual clock six settles
  // share one instant, so the fixture carries six-minute-spaced dates for the page's ordering.
  rep.date = isoAt(i);
  reports.push(rep);
  return rep;
}
const fx = {};
// Tester A, run 1: grip and load early, deliver everything, answer all seven (q7 = 2: not a yes).
beginRun(true);
fx.a1grip = gripBox('release'); fx.a1load = loadBox(); unloadEverything();
settleAndReport(0, { q1: 'tried the couch through the door', q2: 4, q3: 4, q4: 2, q5: 5, q6: 'the fridge fell off the ramp', q7: 2 });
// Tester A, run 2: a forced drop, no load, a second trip with items left behind.
beginRun(false);
fx.a2grip = gripBox('drop');
game.state.tripCount = 2; cargo.tripCount = 2;
settleAndReport(1, { q1: 'got stuck in the doorway with the wardrobe', q2: 3, q3: 5, q4: 3, q5: 4, q6: 'two trips', q7: 3 });
// Tester A, run 3: grip, load, three recoveries, deliver everything, q7 = 5.
beginRun(false);
fx.a3grip = gripBox('release'); fx.a3load = loadBox(); recoverThree(); unloadEverything();
settleAndReport(2, { q1: 'legs off the couch', q2: 5, q3: 4, q4: 3, q5: 5, q6: 'the dolly', q7: 5 });
// Tester B, run 1: never grips, settles with everything left behind, skips the form.
beginRun(true);
frames(30);
settleAndReport(3, null);
// Tester B, runs 2 and 3: grip, load, deliver everything, skip.
beginRun(false);
fx.b2grip = gripBox('release'); fx.b2load = loadBox(); unloadEverything();
settleAndReport(4, null);
beginRun(false);
fx.b3grip = gripBox('release'); fx.b3load = loadBox(); unloadEverything();
settleAndReport(5, null);

ok('F fixture: every scripted grip took and every scripted load loaded',
   fx.a1grip && fx.a1load && fx.a2grip && fx.a3grip && fx.a3load && fx.b2grip && fx.b2load, JSON.stringify(fx));
eq('F six reports', reports.length, 6);
deep('F …restarts 0,1,2 / 0,1,2 — two sittings', reports.map((r) => r.restarts), [0, 1, 2, 0, 1, 2]);
deep('F …trips 1,2,1,1,1,1', reports.map((r) => r.counters.trips), [1, 2, 1, 1, 1, 1]);
deep('F …grips 1,1,1,0,1,1 and drops 0,1,0,0,0,0 (the recorder\'s counts)',
     reports.map((r) => `${r.counters.grips}/${r.counters.drops}`), ['1/0', '1/1', '1/0', '0/0', '1/0', '1/0']);
deep('F …recoveries 0,0,3,0,0,0', reports.map((r) => r.counters.recoveries), [0, 0, 3, 0, 0, 0]);
deep('F …complete yes,no,yes,no,yes,yes', reports.map((r) => r.complete), [true, false, true, false, true, true]);
ok('F …every report carries its event list (the live export keeps events; the save does not)',
   reports.every((r) => Array.isArray(r.events) && r.events.length >= 2), reports.map((r) => r.events.length).join(','));
ok('F …A answered all seven on every run, B answered none',
   reports.slice(0, 3).every((r) => r.questionnaire && Object.keys(r.questionnaire).length === 7) && reports.slice(3).every((r) => r.questionnaire === null),
   reports.map((r) => r.questionnaire ? Object.keys(r.questionnaire).length : 'null').join(','));
ok('F …the two-trip run and B\'s first run carry a left-behind line, the complete runs do not',
   [1, 3].every((i) => reports[i].invoice.lines.some((l) => l.kind === LINE_KINDS.LEFT_BEHIND)) &&
   [0, 2, 4, 5].every((i) => !reports[i].invoice.lines.some((l) => l.kind === LINE_KINDS.LEFT_BEHIND)));
lines.push('      reports: ' + reports.map((r, i) => `#${i + 1} r${r.restarts} t${r.counters.trips} g${r.counters.grips} d${r.counters.drops} rec${r.counters.recoveries} ` +
           `${r.complete ? 'C' : 'i'} ${r.events.length}ev profit ${r.invoice.profit}`).join(' | '));
if (DUMP_FIXTURE) {
  const json = JSON.stringify(reports, null, 2);
  lines.push('FIXTURE-B64 ' + btoa(unescape(encodeURIComponent(json))));
}
emit('E2...');

/* ── E2. the numbers ──────────────────────────────────────────────────────── */
lines.push('--- E2. the six reports score the hand-computed fractions at EVIDENCE thresholds ---');
const live = evidenceFrom(reports);
{
  eq('E2 six runs accepted, none rejected', `${live.runs.length}/${live.rejected.length}`, '6/0');
  deep('E2 ids #1..#6 in date order', live.runs.map((r) => r.id), ['#1', '#2', '#3', '#4', '#5', '#6']);
  deep('E2 two sessions of three (restarts climb 0,1,2 twice)', live.sessions.map((s) => s.runIds.join(' ')), ['#1 #2 #3', '#4 #5 #6']);

  const c = sig(live, 'comprehension');
  ok('E2 Comprehension: first grip and first load come from the events, every run timed',
     live.runs.every((r) => r.timingSource === 'events') && c.parts.excluded.length === 0, JSON.stringify(c.parts.sources));
  ok('E2 …the comprehending runs gripped within firstGripMs and loaded within firstLoadMs of sim time',
     ['#1', '#3', '#5', '#6'].every((id) => { const r = live.runs.find((x) => x.id === id); return r.firstGripMs > 0 && r.firstGripMs <= EVIDENCE.comprehension.firstGripMs && r.firstLoadMs > r.firstGripMs && r.firstLoadMs <= EVIDENCE.comprehension.firstLoadMs; }),
     live.runs.map((r) => `${r.id} grip ${r.firstGripMs} load ${r.firstLoadMs}`).join(', '));
  eq('E2 Comprehension value = 4/6 (A2 never loaded, B1 never gripped)', `${c.k}/${c.n}`, '4/6');
  near('E2 …value 0.667', c.value, 4 / 6, 0.001);
  deep('E2 …runIds #1 #3 #5 #6', c.runIds, ['#1', '#3', '#5', '#6']);
  eq('E2 …verdict PASS ("most" = more than half)', c.verdict, VERDICT.PASS);
  // M22 landed beside this milestone: every harness report now carries `walkthrough` — read as
  // { shown: false } here, because the cards are never built on the harness page (m17 M22-R2h).
  // Present-but-not-shown is a reported key: the split prints "with 0/0, without 4/6".
  ok('E2 …the M22 walkthrough key is present ({ shown: false }) and the split prints with 0/0, without 4/6',
     reports.every((x) => x.walkthrough && x.walkthrough.shown === false) &&
     /with the first-minute cards 0\/0, without 4\/6/.test(c.text) && c.parts.withWalkthrough.n === 0 && c.parts.withoutWalkthrough.n === 6, c.text);
  const stripped = reports.map((x) => { const { walkthrough, ...rest } = x; void walkthrough; return rest; });
  const cs = sig(evidenceFrom(stripped), 'comprehension');
  ok('E2 …and with the key stripped (a pre-M22 report) the same 4/6 is scored and the split is reported as absent',
     cs.k === 4 && cs.n === 6 && /walkthrough not reported/.test(cs.text) && cs.parts.withWalkthrough.n === 0 && cs.parts.withoutWalkthrough.n === 6, cs.text);

  const s = sig(live, 'emergentStory');
  eq('E2 Emergent story 3/6 (A wrote q1/q6 three times; B skipped)', `${s.k}/${s.n}`, '3/6');
  eq('E2 …verdict NOT YET (half is not most)', s.verdict, VERDICT.NOT_YET);
  deep('E2 …runIds #1 #2 #3', s.runIds, ['#1', '#2', '#3']);

  const l = sig(live, 'learning');
  eq('E2 Learning pairs 2 (one per tester)', l.n, 2);
  const pa = l.parts.sessions[0], pb = l.parts.sessions[1];
  ok('E2 …tester A yes: trips changed 1→2', pa && pa.changed === true && pa.changes.some((x) => /^trips 1→2/.test(x)), JSON.stringify(pa));
  ok('E2 …tester B no: trips, straps, tool use and worst shift all unchanged', pb && pb.changed === false && pb.changes.length === 0, JSON.stringify(pb));
  eq('E2 …value 1/2', `${l.k}/${l.n}`, '1/2');
  eq('E2 …verdict PASS (1/2 at learning.minFraction 0.5, inclusive)', l.verdict, VERDICT.PASS);
  deep('E2 …runIds name the changed second run', l.runIds, ['#2']);

  const r = sig(live, 'replayIntent');
  eq('E2 Replay intent 4/6 (q7 ≥ 4 on #3; restarts ≥ 1 on #2 #3 #5 #6)', `${r.k}/${r.n}`, '4/6');
  deep('E2 …runIds', r.runIds, ['#2', '#3', '#5', '#6']);
  deep('E2 …q7-yes runs and restarted runs, apart', [r.parts.q7Yes, r.parts.restarted], [['#3'], ['#2', '#3', '#5', '#6']]);
  eq('E2 …verdict PASS ("at least half" is inclusive)', r.verdict, VERDICT.PASS);

  const p = sig(live, 'corePreference');
  deep('E2 Core preference means to 2 decimals: q3 4.33, q4 2.67, q5 4.67', p.parts.means, { q3: 4.33, q4: 2.67, q5: 4.67 });
  deep('E2 …over n=3 each', p.parts.counts, { q3: 3, q4: 3, q5: 3 });
  eq('E2 …verdict NOT YET (q4 2.67 < minMean 3.5)', p.verdict, VERDICT.NOT_YET);
  ok('E2 …the text names the end-words', /chore→choice/.test(p.text) && /punitive→funny and useful/.test(p.text), p.text);

  const f = sig(live, 'friction');
  near('E2 Friction recoveries/run = 0.5 (3 in 6 runs)', f.parts.recoveriesPerRun, 0.5);
  const grips = reports.reduce((a, x) => a + x.counters.grips, 0), drops = reports.reduce((a, x) => a + x.counters.drops, 0);
  eq('E2 …drops/grip is the fixture\'s ratio, 1/5', `${drops}/${grips}`, '1/5');
  near('E2 …= 0.2', f.parts.dropsPerGrip, drops / grips, 0.001);
  ok('E2 …q1 mentions 1/6 (#2 "got stuck")', f.parts.mentions.length === 1 && f.parts.mentions[0] === '#2', JSON.stringify(f.parts.mentions));
  eq('E2 …verdict PASS (0.5 ≤ 1.0, 0.2 ≤ 0.5, 0.17 ≤ 0.5)', f.verdict, VERDICT.PASS);
  deep('E2 …runIds: the drop, the recoveries, the mention', f.runIds, ['#2', '#3']);

  deep('E2 …every verdict, in order', live.signals.map((s) => s.verdict),
       [VERDICT.PASS, VERDICT.NOT_YET, VERDICT.PASS, VERDICT.PASS, VERDICT.NOT_YET, VERDICT.PASS]);

  const a = live.aggregates;
  ok('E2 aggregates: 6 runs, 4 complete, rate 0.667', a.runs === 6 && a.complete === 4 && Math.abs(a.completionRate - 4 / 6) < 0.001, JSON.stringify([a.runs, a.complete, a.completionRate]));
  deep('E2 …trips histogram {1: 5, 2: 1}', a.trips, { 1: 5, 2: 1 });
  ok('E2 …mean profit is the mean of the six invoices to the cent',
     a.profit.n === 6 && a.profit.mean === Math.round(reports.reduce((s, x) => s + x.invoice.profit, 0) / 6 * 100) / 100, `${a.profit.mean}`);
  ok('E2 …phase means per §3.4 phase, pickup > 0', typeof a.phases.pickup === 'number' && a.phases.pickup > 0 && Object.keys(a.phases).length >= 4, JSON.stringify(a.phases));
  deep('E2 …recoveries by kind: 3 objects (registry.recover)', a.recoveriesByKind, { object: 3 });
  deep('E2 …drops by reason: 1 dropped', a.dropsByReason, { dropped: 1 });
  ok('E2 …left-behind lines in 2 runs, summed negative', a.damage.leftBehindRuns === 2 && a.damage.leftBehindTotal < 0, JSON.stringify(a.damage));
  ok('E2 …furniture damage total equals the sum of the six reports\' furniture lines',
     a.damage.furnitureTotal === Math.round(reports.reduce((s, x) => s + x.invoice.lines.filter((l) => l.kind === LINE_KINDS.ITEM_DAMAGE).reduce((t, l) => t + l.amount, 0), 0) * 100) / 100,
     `${a.damage.furnitureTotal}`);
  ok('E2 …worst-shift bins sum to 6, no drives so all in the first bin', a.worstShift.bins.reduce((s, b) => s + b.count, 0) === 6 && a.worstShift.bins[0].count === 6, JSON.stringify(a.worstShift));
  ok('E2 …eventsMissing 0, restarted 4', a.eventsMissing === 0 && a.restarted === 4);
  const h = live.histograms.questions;
  deep('E2 histograms: q3 counts [0,0,0,2,1], q7 [0,1,1,0,1]', [h[2].counts, h[6].counts], [[0, 0, 0, 2, 1], [0, 1, 1, 0, 1]]);
  ok('E2 …q1 lists three answers with their run ids', h[0].kind === 'text' && h[0].answered === 3 && h[0].answers.map((x) => x.runId).join(' ') === '#1 #2 #3');

  // A compact stored run (no events) is excluded from Comprehension, never scored 0 — and a
  // walkthrough-stamped one (M22) is read when the key is there.
  const compact = reports.map((x) => { const { events, ...rest } = x; void events; return { ...rest, eventsRecorded: x.events.length }; });
  const evC = evidenceFrom(compact);
  const cc = sig(evC, 'comprehension');
  ok('E2c compact runs (no events): Comprehension is "no data" with all six named as excluded, other signals unchanged',
     cc.verdict === VERDICT.NO_DATA && cc.n === 0 && cc.parts.excluded.length === 6 && /EXCLUDED/.test(cc.note) &&
     sig(evC, 'replayIntent').k === 4 && sig(evC, 'emergentStory').k === 3 && sig(evC, 'friction').parts.recoveriesPerRun === 0.5,
     `${cc.verdict} n=${cc.n} excluded ${cc.parts.excluded.length}`);
  ok('E2c …and their recoveries/drops are aggregated as unattributed', evC.aggregates.recoveriesByKind.unattributed === 3 && evC.aggregates.dropsByReason.unattributed === 1);
  const withWt = compact.map((x, i) => ({ ...x, walkthrough: i < 3 ? { shown: true, step1Ms: 5000, step2Ms: i === 1 ? null : 20000, step3Ms: 30000 } : { shown: false } }));
  const evW = evidenceFrom(withWt);
  const cw = sig(evW, 'comprehension');
  ok('E2w M22 walkthrough key present: stamps time the runs the events cannot (2/3 with the cards), and the split is printed',
     cw.n === 3 && cw.k === 2 && cw.parts.withWalkthrough.k === 2 && cw.parts.withWalkthrough.n === 3 && /with the first-minute cards 2\/3/.test(cw.text),
     `${cw.k}/${cw.n} ${cw.text}`);
  ok('E2w …reports absent the key still parse (tolerated, not required): stripped 0 reported, live 6, stamped 6',
     evidenceFrom(stripped).aggregates.walkthroughReported === 0 && live.aggregates.walkthroughReported === 6 && evW.aggregates.walkthroughReported === 6,
     `${evidenceFrom(stripped).aggregates.walkthroughReported}/${live.aggregates.walkthroughReported}/${evW.aggregates.walkthroughReported}`);
}
emit('E2z...');

/* ── E2z. the committed fixture is a snapshot of these ────────────────────── */
lines.push('--- E2z. tools/_fixtures/runs-sample.json scores the same (a JSON module import, before boot) ---');
let fixtureText = null, disk = null;
{
  ok('E2z the fixture file imports as a JSON module (served application/json by tools/serve.ps1)',
     Array.isArray(fixture) && fixture.length > 0, fixtureErr || (DUMP_FIXTURE ? 'DUMP_FIXTURE run — write the file first' : 'missing'));
  // What a tester pastes: the file's pretty-printed array, as text.
  if (Array.isArray(fixture)) fixtureText = JSON.stringify(fixture, null, 2);
  if (fixtureText) {
    const parsed = parseReports(fixtureText);
    eq('E2z …it is six reports and nothing rejected', `${parsed.items.length}/${parsed.rejected.length}`, '6/0');
    disk = evidenceFrom(parsed.items);
    const shape = (ev) => ev.signals.map((s) => ({ id: s.id, k: s.k, n: s.n, value: s.value, verdict: s.verdict, runIds: s.runIds }));
    deep('E2z …and its six signals (k, n, value, verdict, runs) equal the harness-built set\'s', shape(disk), shape(live));
    deep('E2z …core means too', sig(disk, 'corePreference').parts.means, sig(live, 'corePreference').parts.means);
    ok('E2z …every fixture report has events, a build and a date, in date order',
       disk.runs.every((r) => r.hasEvents && r.build && r.date) && disk.runs.every((r, i) => i === 0 || r.date >= disk.runs[i - 1].date));
  }
}

/* ── E4. the Markdown re-parses ───────────────────────────────────────────── */
lines.push('--- E4. Copy evidence report (Markdown) — the table re-parses against the module ---');
{
  const md = evidenceMarkdown(live, { date: '2026-09-05' });
  ok('E4 no "[object" anywhere', !md.includes('[object'), md.slice(0, 120));
  const rows = md.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| Signal') && !l.startsWith('|---'));
  eq('E4 six signal rows', rows.length, 6);
  const cells = rows.map((row) => { const cs = row.split('|').map((x) => x.trim()); return cs.slice(1, cs.length - 1); });
  ok('E4 …five cells each', cells.every((c) => c.length === 5), JSON.stringify(cells.map((c) => c.length)));
  deep('E4 …labels', cells.map((c) => c[0]), live.signals.map((s) => s.label));
  deep('E4 …rules verbatim', cells.map((c) => c[1]), live.signals.map((s) => s.rule));
  ok('E4 …measured cells equal each signal\'s text', cells.every((c, i) => c[2] === live.signals[i].text),
     cells.map((c, i) => c[2] === live.signals[i].text ? '' : `${i}: ${c[2]} != ${live.signals[i].text}`).filter(Boolean).join(' || '));
  deep('E4 …verdicts', cells.map((c) => c[3]), live.signals.map((s) => s.verdict));
  deep('E4 …run ids', cells.map((c) => c[4]), live.signals.map((s) => s.runIds.join(' ') || '—'));
  ok('E4 the header names the build and the count', md.includes(`${live.aggregates.builds[0]}`) && md.includes('6 runs (0 rejected)') && md.includes('2026-09-05'));
  ok('E4 aggregates carry the numbers', md.includes('runs 6, complete 4 (67%)') && md.includes('1 trip × 5, 2 trips × 1') && md.includes('object 3') && md.includes('dropped 1'));
  ok('E4 seven question lines with the sentences', QUESTIONS.every((q) => md.includes(`- ${q.id} ${q.text}`)));
  ok('E4 …the scale lines carry the end-words and the mean', md.includes('(chore → choice), mean 4.33, n=3') && md.includes('(no → definitely), mean 3.33, n=3'));
  ok('E4 …the text lines quote the answers with run ids', md.includes('#2 "got stuck in the doorway with the wardrobe"'));
  ok('E4 a pipe in an answer cannot break the table',
     (() => { const ev2 = evidenceFrom([{ ...reports[0], questionnaire: { q1: 'a | pipe' } }]); const m2 = evidenceMarkdown(ev2); return m2.split('\n').filter((l) => l.startsWith('| ')).every((l) => l.split('|').length === 7); })());
  ok('E4 Notes list the gaps: the stall hint, the session pairing, the excluded runs', /stall hint/.test(md) && /session is consecutive reports/.test(md) && /Every run carried an event list/.test(md));
}
emit('E5...');

/* ── E5. the page, as a second document on the same server ────────────────── */
lines.push('--- E5. docs/evidence.html: paste, Add, the table, Clear, and zero requests (the iframe loaded after boot; no await here) ---');
{
  const ready = pageReady;
  ok('E5 the page loads as a second document on the harness server and publishes window.__EVIDENCE', ready);
  if (ready) {
    const cw = iframe.contentWindow, cd = iframe.contentDocument;
    const resources = () => cw.performance.getEntriesByType('resource').map((e) => e.name);
    const before = resources();
    ok('E5 the page\'s only requests are its own module imports, same origin, under /src/',
       before.length >= 1 && before.length <= 6 && before.every((n) => n.startsWith(location.origin + '/src/')), before.join(','));
    ok('E5 …nothing external: no entry off this origin', before.every((n) => new URL(n).origin === location.origin));
    let calls = 0;
    cw.fetch = () => { calls++; return Promise.reject(new Error('stubbed')); };
    const XO = cw.XMLHttpRequest;
    cw.XMLHttpRequest = function StubXHR() { calls++; return new XO(); };
    eq('E5 before Add: six signal rows, all "no data"', cd.querySelectorAll('tr.signal-row.v-nodata').length, 6);
    eq('E5 …and no runs', cd.querySelectorAll('tr.run-row').length, 0);

    const pasted = fixtureText || JSON.stringify(reports);
    cd.querySelector('#paste').value = pasted;
    cd.querySelector('#add').click();
    const rows = [...cd.querySelectorAll('tr.signal-row')];
    eq('E5 Add → six signal rows', rows.length, 6);
    ok('E5 …each with a verdict class', rows.every((tr) => /\bv-(pass|notyet|nodata)\b/.test(tr.className)), rows.map((tr) => tr.className).join(','));
    const want = (disk || live).signals.map((s) => verdictClass(s.verdict));
    deep('E5 …the classes are the module\'s verdicts', rows.map((tr) => (tr.className.match(/v-(pass|notyet|nodata)/) || [])[0]), want);
    deep('E5 …under the GDD\'s labels', rows.map((tr) => tr.querySelector('td.sig').textContent), live.signals.map((s) => s.label));
    ok('E5 …each row shows the rule verbatim and the measured text', rows.every((tr, i) => tr.querySelector('td.rule').textContent === live.signals[i].rule && tr.querySelector('td.measured').textContent.includes((disk || live).signals[i].text)));
    eq('E5 seven question blocks', cd.querySelectorAll('.qblock').length, 7);
    deep('E5 …q1..q7', [...cd.querySelectorAll('.qblock')].map((b) => b.dataset.q), QUESTIONS.map((q) => q.id));
    ok('E5 …the scale blocks draw five bars between the end-words', [...cd.querySelectorAll('.qblock')].filter((b) => b.querySelector('.bars')).every((b) => b.querySelectorAll('.bar').length === 5 && b.querySelectorAll('.anchor').length === 2));
    eq('E5 run list of 6', cd.querySelectorAll('tr.run-row').length, 6);
    eq('E5 …__EVIDENCE.runs holds 6', cw.__EVIDENCE.runs.length, 6);
    eq('E5 …nothing rejected', cd.querySelector('#rejected').textContent.trim(), '');
    ok('E5 …the paste box was emptied and the note says added 6', cd.querySelector('#paste').value === '' && /added 6/.test(cd.querySelector('#copy-note').textContent));
    ok('E5 …aggregates and notes rendered', cd.querySelectorAll('#aggregates .agg').length >= 10 && cd.querySelectorAll('#notes li').length >= 8);
    ok('E5 …the run list names the sessions', [...cd.querySelectorAll('tr.run-row td:nth-child(2)')].map((td) => td.textContent).join(',') === 'tester A,tester A,tester A,tester B,tester B,tester B');

    // A second paste of garbage plus one report: the reject is shown, the run count grows by one.
    cd.querySelector('#paste').value = 'garbage ' + JSON.stringify(reports[0]);
    cd.querySelector('#add').click();
    ok('E5 a rejected paste is named beside the report that survived', /rejected 1/.test(cd.querySelector('#rejected').textContent) && cd.querySelectorAll('tr.run-row').length === 7,
       cd.querySelector('#rejected').textContent.slice(0, 80));

    cd.querySelector('#copy-md').click();
    const mdta = cd.querySelector('#md');
    ok('E5 Copy evidence report fills the Markdown textarea with the six rows', SIGNAL_IDS.every((id) => mdta.value.includes(`| ${SIGNAL_LABELS[id]} |`)) && !mdta.value.includes('[object'));

    cd.querySelector('#clear').click();
    eq('E5 Clear → run list empty', cd.querySelectorAll('tr.run-row').length, 0);
    ok('E5 …six rows back to "no data"', [...cd.querySelectorAll('tr.signal-row')].every((tr) => tr.classList.contains('v-nodata')));
    ok('E5 …rejects, paste and Markdown cleared', cd.querySelector('#rejected').textContent === '' && cd.querySelector('#paste').value === '' && mdta.hidden && cw.__EVIDENCE.runs.length === 0);
    const after = resources();
    eq('E5 zero network requests beyond the module import: resource entries unchanged by Add/Copy/Clear', after.length, before.length);
    eq('E5 …and the fetch/XHR stubs were never called', calls, 0);
    ok('E5 the page uses styles.css\'s palette by value (panel, lime, violet) and loads no stylesheet',
       /#171522/.test(cd.documentElement.innerHTML) && /#a8d93a/.test(cd.documentElement.innerHTML) && cd.querySelectorAll('link[rel=stylesheet]').length === 0);
    ok('E5 no error banner in the page', !cd.getElementById('err-banner'));
  }
  iframe.remove();
}
emit('E6...');

/* ── E6. the sheet's link, and M6's Copy ──────────────────────────────────── */
lines.push('--- E6. the settlement sheet\'s export row links to the page; Copy still works ---');
{
  ok('E6 fixture: the settlement sheet is showing (B3 settled)', M.invoiceScreen.visible);
  const a = sheet().querySelector('.export-row a.evidence');
  ok('E6 the export row carries the evidence link', !!a);
  eq('E6 …href docs/evidence.html (relative to index.html, so Pages and the harness both resolve it)', a && a.getAttribute('href'), 'docs/evidence.html');
  ok('E6 …opens in a new tab without an opener', !!a && a.target === '_blank' && /noopener/.test(a.rel));
  ok('E6 …beside the Copy button, inside the sheet', !!a && !!a.closest('.export-row') && !!a.closest('.export-row').querySelector('[data-act=copy]') && !!a.closest('.sheet'));
  sheet().querySelector('[data-act=copy]').click();
  const ta = sheet().querySelector('textarea.export');
  let parsed = null;
  try { parsed = JSON.parse(ta.value); } catch (e) { parsed = null; }
  ok('E6 M6\'s Copy still fills the textarea with JSON that parses', !!parsed);
  ok('E6 …with phases, counters, invoice and events (m17 Q3 shape unchanged)',
     parsed && parsed.phases && parsed.counters && typeof parsed.counters.grips === 'number' && parsed.invoice && Array.isArray(parsed.events));
  eq('E6 …and that export is accepted by the evidence module as a report', rejectReason(parsed), null);
  ok('E6 …the sheet\'s questions are still seven', sheet().querySelectorAll('[data-q]').length === 7);
}

/* ── Z. teardown ───────────────────────────────────────────────────────────── */
ok('Z1 no error banner during the suite', !document.getElementById('err-banner'));
void EVENTS; void sessionsOf;

} catch (e) {
  fails++;
  lines.push(`FAIL  suite threw  <- ${e && e.message}`);
  lines.push((e && e.stack || '').split('\n').slice(0, 6).join('\n'));
}

try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* nothing to clear */ }
emit();
