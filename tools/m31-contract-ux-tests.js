/* Phase 11 build-side M24 suite — §21.2 contract UX: the brief before START, the invoice
 * that reveals its major lines, the recap from the log, and the retry.
 *
 * GDD §21.2 "Brief shows payout, estimate, distance, manifest profile, access notes, hazards,
 * and optional goals. … Invoice animates major lines, then exposes a complete static
 * breakdown. Event recap uses actual logged events. A retry keeps settings and optionally
 * preserves loadout."; §26.1 "invoice reports accurately"; §26.7 Comprehension; §13.4 the
 * saved best; §21.1 compact objective count.
 *
 * THE CLAIMS UNDER TEST:
 *
 *   THE BRIEF READS THE CONTRACT   every number on the title's job sheet is asserted against
 *                                  state or config — the invoice's own base line, the estimate
 *                                  the invoice uses, the route's legs, the manifest's defs, the
 *                                  door registry, the route table, the local best (B1); and the
 *                                  card the sheet sits beside did not move a pixel (B2).
 *   BOOT DID NOT MOVE              PICKUP is set at frame 0, before the title shows, exactly as
 *                                  before this milestone (BOOT).
 *   THE REVEAL NEVER CHANGES A NUMBER   with the reveal ON, k × stepMs of wall time shows exactly
 *                                  k major lines, each counting up monotonically to the amount
 *                                  invoice.js wrote; the breakdown then opens and every total on
 *                                  the sheet equals the ledger to the cent (V1). Space, a click
 *                                  and any pad button land it all at once without reaching the
 *                                  game (V2). OFF — the harness default — show() is the final
 *                                  state at once (V3).
 *   THE RECAP IS THE LOG           'What happened' is built from runSummary().events, entry ids
 *                                  point back into it, stamps ascend, the seat is named (R1).
 *   A RETRY KEEPS SETTINGS         text size and hints survive the sheet's restart; 'keep the
 *                                  tools on the truck' does what it says, and its absence puts
 *                                  every tool back on its rack (R2).
 *
 * The reveal is driven by an INJECTED clock (invoiceScreen.clock) because the harness freezes
 * performance.now() (KNOWN_ISSUES Phase 18); the sheet's revealTick() is called by hand.
 * localStorage 'mfh.save' is cleared at the START and the END (m16's rule).
 */

import { SIM, ECONOMY, INVOICE, DEBUG } from '../src/config.js';
import { EVENTS, PHASES } from '../src/core/eventBus.js';
import { PAD } from '../src/core/input.js';
import { cabPoint, cargoInterior, insideCargo } from '../src/world/truck.js';
import { LINE_KINDS, legsDriven } from '../src/contract/invoice.js';
import { majorsFrom, recapFrom, revealEnabledFrom, stampOf } from '../src/ui/invoiceScreen.js';
import { briefHtml } from '../src/ui/titleScreen.js';
import { fitsThroughGap } from '../src/render/scene.js';
import { ROUTES } from '../src/world/house.js';
import { PHASE6_TOOL_SPAWNS } from '../src/tools/definitions.js';
import { GROUP_PRESETS } from '../src/physics/world.js';
import { SAVE_KEY } from '../src/core/save.js';

const lines = [];
let passes = 0, fails = 0;
function ok(name, cond, detail = '') {
  if (cond) { passes++; lines.push(`PASS  ${name}`); }
  else { fails++; lines.push(`FAIL  ${name}${detail ? '  <- ' + detail : ''}`); }
}
const eq = (n, a, b) => ok(n, a === b, `got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const near = (n, a, b, tol = 0.005) => ok(n, Math.abs(a - b) <= tol, `${a} vs ${b} (tol ${tol})`);
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

const { game, physics, registry, movers, tools, straps, cargo, route, damage, interact, rig, camera, input, world } = M;
const bus = game.bus;
const recorder = M.recorder;
const STEP = SIM.stepMs;
const FRAME = 16.667;
const I = cargoInterior();
const me = () => movers[M.activeMoverIndex];

/* Read at boot, before anything moves — the brief adds no bodies and no scene children. */
const bootBodies = physics.stats.bodies;
const bootChildren = world.scene.children.length;
const bootReveal = M.invoiceScreen.revealEnabled;

/* ── drivers (m17 / m19 / m22 lineage) ───────────────────────────────────── */
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
function throwAt(entity, vx, vy, vz) { entity.body.setLinvel({ x: vx, y: vy, z: vz }, true); entity.body.wakeUp(); }
const posOf = (e) => { const t = e.body.translation(); return { x: t.x, y: t.y, z: t.z }; };
const byDef = (id) => { for (const e of registry.entities.values()) if (e.defId === id) return e; return null; };
const allOfDef = (id) => [...registry.entities.values()].filter((e) => e.defId === id);
const toolByDef = (id) => { for (const t of tools.tools.values()) if (t.defId === id) return t; return null; };
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
function drainNotices() { const n = M.pendingNotices.length; M.pendingNotices.splice(0, n); return n; }
const sheet = () => M.invoiceScreen.el;
const brief = () => document.querySelector('#title-screen .brief');
const num = (s) => Number(String(s).replace('−', '-').trim());
const invoiceNow = () => M.buildInvoice(game.state, M.manifestSummary(game.state.manifest),
  { recoveries: M.recoveryCount(), collisions: 0, moverCount: movers.length });
const R = physics.R;
const GROUND = { x: 40, z: -40 };   // open grass, clear of the house and the truck (m19)
/** A tool into the driven mover's hands through the real verb (m19 pickUp). */
function pickUp(tool) {
  for (const s of interact.state.values()) { s.carriedTool = null; s.pendingAnchor = null; }
  tool.body.setBodyType(R.RigidBodyType.Dynamic, true);
  tool.collider.setCollisionGroups(GROUP_PRESETS.object);
  tool.state.carriedBy = null;
  parkAt(tool, GROUND.x + 6, tool.def.dimensions.y / 2 + 0.01, GROUND.z + 6);
  placeMover(movers[1], GROUND.x + 30, GROUND.z + 30);
  step(5);
  const p = posOf(tool);
  lookAt(me(), standOffFrom(p, 1.1), p, true);
  step(2);
  interact.act(me());
  return interact._for(me().id).carriedTool === tool.id;
}
/** …and out of them again, onto the ground (the reset's own moves, so no verb is billed). */
function putDown(tool) {
  for (const s of interact.state.values()) { s.carriedTool = null; s.pendingAnchor = null; }
  tool.body.setBodyType(R.RigidBodyType.Dynamic, true);
  tool.collider.setCollisionGroups(GROUP_PRESETS.object);   // a carried tool collides with nothing — restore, or it falls out of the world
  tool.state.carriedBy = null;
  parkAt(tool, GROUND.x + 12, tool.def.dimensions.y / 2 + 0.01, GROUND.z + 12);
  step(2);
}
const majorsOnSheet = () => [...sheet().querySelectorAll('.majors .mline')];
const visibleMajors = () => majorsOnSheet().filter((el) => !el.hidden);
const breakdown = () => sheet().querySelector('.breakdown');
/** The invoice the sheet was shown with, in majorsFrom's shape (the report's lines are
 *  {kind, amount, detail} — invoice.js's, to the cent). */
const shownInvoice = () => { const r = M.invoiceScreen.report(); return r && r.invoice ? { lines: r.invoice.lines, profit: r.invoice.profit } : null; };
const moneyText = (n) => (n < 0 ? '−' : '') + Math.abs(n).toFixed(2);

try {
/* ── BOOT. the contract exists before the title shows; PICKUP is where it always was ── */
lines.push('--- BOOT. boot order untouched: PICKUP at frame 0, the title up, the brief READ from the contract ---');
{
  eq('BOOT-1 state.phase at frame 0 is PICKUP — the recorded boot value (main.js sets it before the title, never in title.onStart)', game.state.phase, PHASES.PICKUP);
  const first = bus.log.filter((e) => e.type === EVENTS.CONTRACT_PHASE)[0];
  ok('BOOT-2 the boot BRIEFING→PICKUP event is stamped 0 ms', !!first && first.from === PHASES.BRIEFING && first.to === PHASES.PICKUP && first.simTimeMs === 0,
     first && `${first.from}→${first.to} @ ${first.simTimeMs}`);
  ok('BOOT-3 the title card is up and no work time has run', M.title.visible === true && game.state.elapsedWorkMs === 0);
  ok('BOOT-4 the manifest already has its rows — the brief reads a contract that exists', game.state.manifest.length > 0);
  ok('BOOT-5 the brief is rendered on the title screen from M.briefFacts() (title.brief deep-equals a fresh gather)',
     !!brief() && brief().hidden === false && deepEq(M.title.brief, M.briefFacts()));
  eq('BOOT-6 revealEnabled is false at boot on the harness page (DEBUG.invoiceRevealInHarness false)', bootReveal, false);
}
emit('B1...');

/* ── B1. the brief's numbers, each against its source ────────────────────── */
lines.push('--- B1. the brief: payout, estimate, distance, manifest profile, access, hazards, goals — from state and config (GDD §21.2) ---');
{
  const f = M.briefFacts();
  const inv = invoiceNow();
  const b = brief();
  const row = (k) => b.querySelector(`[data-k="${k}"]`);
  const base = inv.lines.find((l) => l.kind === LINE_KINDS.BASE);
  eq('B1 payout on the card equals the invoice\'s own base line for this contract', num(row('payout').dataset.v), base && base.amount);
  eq('B1 …which is ECONOMY.basePayout', num(row('payout').dataset.v), ECONOMY.basePayout);
  ok('B1 …and the text shows it to the cent', row('payout').textContent.includes(moneyText(ECONOMY.basePayout)), row('payout').textContent);
  eq('B1 estimate equals state.estimateMs in minutes — what invoice.js reads (estimateMin)', num(row('estimate').dataset.v), game.state.estimateMs / 60000);
  eq('B1 …and the contract panel\'s estimateMin is the same number', M.contractFacts().estimateMin, num(row('estimate').dataset.v));
  const legs = legsDriven(game.state);
  eq('B1 distance equals the route\'s leg total: legsDriven(state) × ECONOMY.routeDistanceKm', num(row('distance').dataset.v), legs * ECONOMY.routeDistanceKm);
  eq('B1 …with the leg count on the row', num(row('distance').dataset.legs), legs);
  const fuel = inv.lines.find((l) => l.kind === LINE_KINDS.FUEL);
  near('B1 …and the invoice\'s fuel line is exactly that distance × fuelPerKm', fuel ? -fuel.amount : NaN, num(row('distance').dataset.v) * ECONOMY.fuelPerKm, 0.005);

  // manifest profile
  const cats = [...b.querySelectorAll('.bcat')];
  const want = {};
  let heaviest = null;
  for (const r of game.state.manifest) {
    const e = registry.get(r.entityId);
    want[e.def.category] = (want[e.def.category] || 0) + 1;
    if (!heaviest || e.def.mass > heaviest.def.mass) heaviest = e;
  }
  eq('B1 manifest: the category counts sum to manifest.length', cats.reduce((s, c) => s + num(c.dataset.n), 0), game.state.manifest.length);
  eq('B1 …and the total on the row is manifest.length', num(b.querySelector('.bman').dataset.total), game.state.manifest.length);
  deep('B1 …one chip per category, each count from the registry\'s defs', Object.fromEntries(cats.map((c) => [c.dataset.cat, num(c.dataset.n)])), want);
  const hv = b.querySelector('.bheavy');
  ok('B1 …the heaviest row\'s mass and def are named', !!hv && num(hv.dataset.kg) === heaviest.def.mass && hv.dataset.def === heaviest.def.id && hv.textContent.includes(`${heaviest.def.mass} kg`),
     hv && `${hv.dataset.def} ${hv.dataset.kg}`);
  const handling = {};
  for (const r of game.state.manifest) if (r.handling) handling[r.handling] = (handling[r.handling] || 0) + 1;
  deep('B1 …and the §12.1 handling counts (fragile, two-person …) from the rows', Object.fromEntries([...b.querySelectorAll('.bhandling')].map((h) => [h.dataset.h, num(h.dataset.n)])), handling);

  // access notes
  const hung = M.doors.records().filter((d) => d.leaf);
  const doorRows = [...b.querySelectorAll('.bdoor')];
  eq('B1 access: one row per hung door (the door registry\'s leaf doors)', doorRows.length, hung.length);
  ok('B1 …each with that door\'s clear width, leaf on (house.js hungClear) and its gap',
     hung.every((d) => { const r = doorRows.find((x) => x.dataset.door === d.id); return !!r && num(r.dataset.clear) === M.doors.hungClear(d.id) && num(r.dataset.gap) === d.gap && r.textContent.includes(M.doors.hungClear(d.id).toFixed(2)); }),
     doorRows.map((r) => `${r.dataset.door}:${r.dataset.clear}/${r.dataset.gap}`).join(' '));
  const couchRow = game.state.manifest.find((r) => r.defId === 'couch_3seat_01');
  const couch = registry.get(couchRow.entityId);
  const legsEntry = couch.def.disassembly.find((p) => p.part === 'legs' && p.shrinksTo);
  const tightM = M.doors.tightestOnRoute(couchRow.fromZone);
  const two = (d) => { const a = [d.x, d.y, d.z].sort((p, q) => p - q); return [a[0], a[1]]; };
  const intact = fitsThroughGap(...two(couch.def.dimensions), tightM);
  const off = fitsThroughGap(...two(legsEntry.shrinksTo), tightM);
  const prep = b.querySelector('.bprep[data-def="couch_3seat_01"]');
  ok('B1 …the couch\'s note: it does not fit its route intact, legs off it does (scene.js fitsThroughGap over the def and its shrinksTo)',
     !!prep && intact.fits === false && off.fits === true && prep.dataset.intact === '0' && prep.dataset.off === '1' && prep.dataset.part === 'legs',
     prep && `${prep.dataset.intact}/${prep.dataset.off} ${prep.textContent.trim()}`);
  ok('B1 …with the clearance legs-off to the cm and the door named (the tightest on ROUTES[fromZone])',
     !!prep && num(prep.dataset.offClearance) === Number(off.clearance.toFixed(2)) && ROUTES[couchRow.fromZone].includes(prep.dataset.door) &&
     M.doors.hungClear(prep.dataset.door) === tightM,
     prep && `${prep.dataset.offClearance} vs ${off.clearance.toFixed(2)}, door ${prep.dataset.door}`);
  ok('B1 …and nothing that fits intact is listed as an access note', [...b.querySelectorAll('.bprep')].every((p) => p.dataset.intact === '0'));

  // hazards
  const haz = [...b.querySelectorAll('.bhaz[data-type]')].map((h) => h.dataset.type).filter((t) => t !== 'door');
  deep('B1 hazards: the route\'s event types, in the route\'s order (route config, not prose)', haz, route.route.map((ev) => ev.type));
  ok('B1 …each with its label and its second', route.route.every((ev) => { const h = b.querySelector(`.bhaz[data-type="${ev.type}"]`); return !!h && h.textContent.includes(ev.label) && num(h.dataset.at) === ev.at; }));
  const tightest = hung.reduce((t, d) => (!t || M.doors.hungClear(d.id) < M.doors.hungClear(t.id) ? d : t), null);
  const tightRow = b.querySelector('.bhaz[data-type="door"]');
  ok('B1 …and the tight door is the narrowest hung one, by its clear width', !!tightRow && tightRow.dataset.door === tightest.id && num(tightRow.dataset.clear) === M.doors.hungClear(tightest.id),
     tightRow && `${tightRow.dataset.door} ${tightRow.dataset.clear}`);

  // optional goals
  const best = M.bestInvoice;
  const goal = b.querySelector('.bgoal[data-k="best"]');
  ok('B1 goals: the best-profit line follows the local best (blank "no best yet" when there is none)',
     !!goal && (best ? num(goal.dataset.profit) === Number(best.profit.toFixed(2)) && goal.dataset.grade === best.grade : goal.dataset.profit === '' && /no best yet/.test(goal.textContent)),
     goal && `${goal.dataset.profit} best=${JSON.stringify(best)}`);
  const bonus = b.querySelector('.bgoal[data-k="bonus"]');
  ok('B1 …the optional bonuses are ECONOMY\'s one-trip and room-accuracy numbers', !!bonus && num(bonus.dataset.oneTrip) === ECONOMY.oneTripBonus && num(bonus.dataset.room) === ECONOMY.roomAccuracyBonus);
  // the goal line, both ways, through the same renderer
  M.title.setBrief(M.briefFacts({ goals: { ...f.goals, best: { profit: 1234.5, grade: 'B' } } }));
  const g2 = brief().querySelector('.bgoal[data-k="best"]');
  ok('B1a a local best renders as the profit to beat, with its grade', g2.dataset.profit === '1234.50' && g2.dataset.grade === 'B' && /1234\.50/.test(g2.textContent) && /\(B\)/.test(g2.textContent), g2.textContent);
  M.title.setBrief(M.briefFacts({ goals: { ...f.goals, best: null } }));
  ok('B1b …no local best → "no best yet" with an empty profit', brief().querySelector('.bgoal[data-k="best"]').dataset.profit === '' && /no best yet/.test(brief().querySelector('.bgoal[data-k="best"]').textContent));
  M.title.setBrief(M.briefFacts());
  ok('B1c the card is back on the live facts', deepEq(M.title.brief, M.briefFacts()));
  ok('B1d briefHtml is pure: the same facts give the same markup', briefHtml(f) === briefHtml(M.briefFacts()));
  eq('B1e the head names the contract from state', b.querySelector('.bhead span').textContent, game.state.contractId);
}
emit('B2...');

/* ── B2. layout: the card did not move, the sheet fits and wraps ──────────── */
lines.push('--- B2. the START button and the controls list are where they were; the sheet fits at 1262×624 and wraps at 1.6× ---');
{
  const tsWas = document.documentElement.style.getPropertyValue('--ts');
  document.documentElement.style.setProperty('--ts', '1');
  const card = document.querySelector('#title-screen .card');
  void card.offsetHeight;
  const R2 = (el) => el.getBoundingClientRect();
  const play = R2(document.querySelector('#title-screen .play')), cols = R2(document.querySelector('#title-screen .cols'));
  const near1 = (a, b, tol = 0.75) => Math.abs(a - b) <= tol;
  lines.push(`      viewport ${window.innerWidth}x${window.innerHeight}; START ${[play.left, play.top, play.width, play.height].map((v) => v.toFixed(2)).join(' ')}; ` +
             `controls ${[cols.left, cols.top, cols.width, cols.height].map((v) => v.toFixed(2)).join(' ')}`);
  ok('B2 fixture: the harness viewport is 1262×624 (--window-size 1280,720)', window.innerWidth === 1262 && window.innerHeight === 624, `${window.innerWidth}x${window.innerHeight}`);
  ok('B2 the START button\'s rect is the recorded m11 M24-T1 value: x 533.63 y 311.42 w 194.75 h 39.00 (±0.75)',
     near1(play.left, 533.63) && near1(play.top, 311.42) && near1(play.width, 194.75) && near1(play.height, 39.00),
     `${play.left.toFixed(2)} ${play.top.toFixed(2)} ${play.width.toFixed(2)} ${play.height.toFixed(2)}`);
  ok('B2 the controls list\'s rect is the recorded m11 M24-T2 value: x 282.00 y 398.42 w 698.00 h 96.56 (±0.75)',
     near1(cols.left, 282.00) && near1(cols.top, 398.42) && near1(cols.width, 698.00) && near1(cols.height, 96.56),
     `${cols.left.toFixed(2)} ${cols.top.toFixed(2)} ${cols.width.toFixed(2)} ${cols.height.toFixed(2)}`);
  const b = brief();
  const br = R2(b), cr = R2(card);
  const overlaps = (p, q) => p.left < q.right && q.left < p.right && p.top < q.bottom && q.top < p.bottom;
  ok('B2 the brief overlaps neither the START button nor the controls list nor the card', !overlaps(br, play) && !overlaps(br, cols) && !overlaps(br, cr),
     `brief ${br.left.toFixed(0)}..${br.right.toFixed(0)} × ${br.top.toFixed(0)}..${br.bottom.toFixed(0)}; card right ${cr.right.toFixed(0)}`);
  ok('B2 …sits beside the card (a sibling, to its right, 8 px or more off the edge)', !card.contains(b) && br.left >= cr.right + 8 && br.right <= window.innerWidth - 8);
  ok('B2 …fits at this viewport without scrolling: inside the viewport and scrollHeight ≤ clientHeight',
     br.top >= 0 && br.bottom <= window.innerHeight && b.scrollHeight <= b.clientHeight,
     `top ${br.top.toFixed(1)} bottom ${br.bottom.toFixed(1)}; scroll ${b.scrollHeight} client ${b.clientHeight}`);
  eq('B2 …and the card\'s own scroll state is untouched (scrollHeight === clientHeight, as before M24: 490/490)', card.scrollHeight === card.clientHeight, true);
  lines.push(`      brief ${br.width.toFixed(0)}×${br.height.toFixed(0)} at (${br.left.toFixed(0)}, ${br.top.toFixed(0)}); scroll ${b.scrollHeight} / client ${b.clientHeight}; card ${card.scrollHeight}/${card.clientHeight}`);

  // 1.6×: wraps, never clips
  document.documentElement.style.setProperty('--ts', '1.6');
  void card.offsetHeight;
  const br16 = R2(b);
  const rows = [...b.children];
  const lh = parseFloat(getComputedStyle(b).lineHeight) || 24;
  const clippedX = rows.filter((r) => r.scrollWidth > r.clientWidth + 1);
  const tall = rows.filter((r) => R2(r).height > 4 * lh + 12);
  ok('B2 at --ts 1.6 every row wraps inside the sheet\'s width: no row is wider than its box (scrollWidth ≤ clientWidth)', clippedX.length === 0, clippedX.map((r) => r.className).join(','));
  ok('B2 …and no row wraps to more than four lines (a word-wrap, not a character-wrap)', tall.length === 0, tall.map((r) => `${r.className}:${R2(r).height.toFixed(0)}`).join(','));
  ok('B2 …the sheet is still inside the viewport, beside the card', br16.left >= 0 && br16.right <= window.innerWidth && br16.top >= 0 && br16.bottom <= window.innerHeight && !overlaps(br16, R2(card)),
     `${br16.left.toFixed(0)}..${br16.right.toFixed(0)} × ${br16.top.toFixed(0)}..${br16.bottom.toFixed(0)}`);
  ok('B2 …and its overflow is reachable (overflow auto), never cut off', getComputedStyle(b).overflowY === 'auto');
  lines.push(`      at 1.6: brief scroll ${b.scrollHeight} / client ${b.clientHeight} (scrolls inside 94vh past ${window.innerHeight} px, as the card does: ${card.scrollHeight}/${card.clientHeight} — the card overflowed at 1.6 before M24 too: 758/570 measured 2026-09-05)`);
  ok('B2 NOTE the card\'s 1.6× overflow is pre-existing (786/585 since M29 gave back the 15 px of horizontal scrollbar; 758/570 before it, ±4)', Math.abs(card.scrollHeight - 786) <= 4 && Math.abs(card.clientHeight - 585) <= 4, `${card.scrollHeight}/${card.clientHeight}`);
  if (tsWas) document.documentElement.style.setProperty('--ts', tsWas); else document.documentElement.style.removeProperty('--ts');
  void card.offsetHeight;
  const playBack = R2(document.querySelector('#title-screen .play'));
  ok('B2 back at the boot text size, START is back where it was', near1(playBack.left, play.left) && near1(playBack.top, play.top));
}
emit('V0...');

M.title.start();
drainNotices();

/* ── V0. the reveal's table is the invoice's ─────────────────────────────── */
lines.push('--- V0. INVOICE.reveal.majors covers invoice.js LINE_KINDS exactly once; the numbers are sane ---');
{
  const kinds = Object.values(LINE_KINDS);
  const covered = new Map();
  for (const g of INVOICE.reveal.majors) for (const k of g.kinds) covered.set(k, (covered.get(k) || 0) + 1);
  ok('V0 every LINE_KINDS value sits in exactly one major group', kinds.every((k) => covered.get(k) === 1), kinds.filter((k) => covered.get(k) !== 1).join(','));
  ok('V0 …and every kind a group names is a LINE_KINDS value or the invoice\'s literal \'tips\'', [...covered.keys()].every((k) => kinds.includes(k) || k === 'tips'));
  ok('V0 stepMs ≥ countMs > 0, tickMs > 0', INVOICE.reveal.stepMs >= INVOICE.reveal.countMs && INVOICE.reveal.countMs > 0 && INVOICE.reveal.tickMs > 0);
  ok('V0 recapMax ≥ recapPerKind ≥ 1', INVOICE.recapMax >= INVOICE.recapPerKind && INVOICE.recapPerKind >= 1);
  const inv = invoiceNow();
  const mj = majorsFrom(inv);
  ok('V0 majorsFrom: the groups sum to the invoice\'s profit to the cent, PROFIT last', mj[mj.length - 1].profit === true &&
     Math.abs(mj.filter((m) => !m.profit).reduce((s, m) => s + m.amount, 0) - inv.profit) <= 0.005 && mj[mj.length - 1].amount === inv.profit,
     mj.map((m) => `${m.id}:${m.amount}`).join(' '));
  ok('V0 …and each group\'s amount is the sum of its own lines', mj.filter((m) => !m.profit).every((m) => {
    const g = INVOICE.reveal.majors.find((x) => x.id === m.id);
    return Math.abs(inv.lines.filter((l) => g.kinds.includes(l.kind)).reduce((s, l) => s + l.amount, 0) - m.amount) <= 0.005;
  }));
}
emit('V1...');

/* ── V1. the reveal on the injected clock ────────────────────────────────── */
lines.push('--- V1. reveal ON: k × stepMs → k major lines, monotone count-ups, then the breakdown; every total equals the ledger (GDD §21.2, §26.1) ---');
let T = 0, laterCalls = 0;
const fake = { now: () => T, later: () => { laterCalls++; return 1; }, cancel: () => {} };
const realClock = M.invoiceScreen.clock;
{
  // A run with lines to reveal: a furniture line (the TV from 1.5 m) and a recovery fee.
  const tv = byDef('tv_55_01');
  parkAt(tv, -38, tv.def.dimensions.y / 2 + 1.5, 30, Math.PI / 2);
  frames(150);
  registry.recover(byDef('wardrobe_01'));
  frames(5);
  drainNotices();
  M.invoiceScreen.revealEnabled = true;
  M.invoiceScreen.clock = fake;
  T = 0;
  M.settle();
  const inv = shownInvoice();
  const expect = majorsFrom(inv);
  const n = expect.length;
  const { stepMs, countMs } = INVOICE.reveal;
  ok('V1 fixture: the sheet is up, paused, with a furniture line and a fee line to reveal',
     M.invoiceScreen.visible && game.state.paused && inv.lines.some((l) => l.kind === LINE_KINDS.ITEM_DAMAGE) && inv.lines.some((l) => l.kind === LINE_KINDS.RECOVERY),
     inv.lines.map((l) => l.kind).join(' | '));
  eq('V1 the sheet carries one .mline per major group + PROFIT, in landing order', majorsOnSheet().map((el) => el.dataset.major).join(','), expect.map((m) => m.id).join(','));
  ok('V1 after 0 ms only the sheet header is visible: no major line, the breakdown folded, revealing',
     visibleMajors().length === 0 && breakdown().hidden === true && M.invoiceScreen.revealing === true && !sheet().querySelector('.head').hidden);
  ok('V1 …the reveal scheduled its first tick on the injected clock', laterCalls >= 1);
  eq('V1 revealDurationMs() = n × stepMs + countMs', M.invoiceScreen.revealDurationMs(), n * stepMs + countMs);
  let exact = true, monotone = true, ends = true, detail = '';
  let foldedBeforeEnd = null;
  for (let k = 1; k <= n; k++) {
    T = k * stepMs;
    M.invoiceScreen.revealTick();
    if (visibleMajors().length !== k) { exact = false; detail += `k=${k}:${visibleMajors().length} `; }
    const el = majorsOnSheet()[k - 1], final = expect[k - 1].amount;
    let lastGap = Infinity;
    for (const f of [0, 0.25, 0.5, 0.75, 0.999, 1]) {
      // The last sample of the last step IS the end of the reveal: read the fold before it.
      if (k === n && f === 1) foldedBeforeEnd = breakdown().hidden === true && M.invoiceScreen.revealing === true;
      T = k * stepMs + f * countMs;
      M.invoiceScreen.revealTick();
      const v = num(el.querySelector('.mamt').textContent);
      const gap = Math.abs(final - v);
      if (gap > lastGap + 1e-9) { monotone = false; detail += `k=${k} f=${f} ${v}→${final} `; }
      if (Math.sign(v) !== 0 && Math.sign(v) !== Math.sign(final)) { monotone = false; detail += `k=${k} sign ${v} `; }
      lastGap = gap;
    }
    if (el.querySelector('.mamt').textContent !== moneyText(final)) { ends = false; detail += `k=${k} end ${el.querySelector('.mamt').textContent}≠${moneyText(final)} `; }
    if (visibleMajors().length !== k) { exact = false; detail += `k=${k}+count:${visibleMajors().length} `; }
  }
  ok(`V1 after k × stepMs exactly k major lines are visible, for k = 1..${n}`, exact, detail);
  ok('V1 the numbers shown mid-count-up are monotone toward the final value (|final − shown| never grows, sign never flips)', monotone, detail);
  ok('V1 …and each count-up ends on the amount invoice.js wrote, to the cent', ends, detail);
  ok('V1 before the last count-up ends the breakdown is still folded', foldedBeforeEnd === true);
  T = n * stepMs + countMs;
  M.invoiceScreen.revealTick();
  ok('V1 after all steps the breakdown is expanded and the reveal is over', breakdown().hidden === false && M.invoiceScreen.revealing === false && !sheet().querySelector('.sheet').classList.contains('revealing'));
  ok('V1 …every major line visible with its final text', visibleMajors().length === n && majorsOnSheet().every((el, i) => el.querySelector('.mamt').textContent === moneyText(expect[i].amount)));
  const finals = majorsOnSheet().filter((el) => el.dataset.major !== 'profit').map((el) => num(el.querySelector('.mamt').textContent));
  const profitShown = num(sheet().querySelector('.mline[data-major="profit"] .mamt').textContent);
  near('V1 the visible groups sum to the visible PROFIT (0.005)', finals.reduce((s, v) => s + v, 0), profitShown, 0.005);
  near('V1 …which is the breakdown\'s .total and invoice.profit', num(sheet().querySelector('.total .amt').textContent), inv.profit, 0.005);
  ok('V1 …and every .line amount is the report\'s line amount', [...sheet().querySelectorAll('.lines .line')].every((el, i) => Math.abs(num(el.querySelector('.amt').textContent) - inv.lines[i].amount) <= 0.005));
  const furn = num(sheet().querySelector('.mline[data-major="furniture"] .mamt').textContent);
  near('V1 the furniture major equals −Σ ledger.itemDamage.cost to the cent (the ledger, not a recomputation)', furn, -game.state.ledger.itemDamage.reduce((s, l) => s + l.cost, 0), 0.005);
  const fees = num(sheet().querySelector('.mline[data-major="fees"] .mamt').textContent);
  near('V1 the fees major equals −recoveries × ECONOMY.recoveryFee', fees, -M.recoveryCount() * ECONOMY.recoveryFee, 0.005);
  // The gate itself: a fresh buildInvoice over the same state reconciles, and its lines are
  // the sheet's lines to the cent — so what the reveal showed is what the ledger says.
  const fresh = invoiceNow();
  const rec = M.reconcile(fresh, game.state, { recoveries: M.recoveryCount(), collisions: 0 });
  ok('V1 …and reconcile() passes over a fresh invoice of the same state', rec.ok, rec.problems.join('; '));
  ok('V1 …whose lines are the sheet\'s lines, kind by kind and cent by cent', fresh.lines.length === inv.lines.length &&
     fresh.lines.every((l, i) => l.kind === inv.lines[i].kind && Math.abs(l.amount - inv.lines[i].amount) <= 0.005) && Math.abs(fresh.profit - inv.profit) <= 0.005);
  ok('V1 another tick after the end changes nothing', M.invoiceScreen.revealTick() === false && visibleMajors().length === n);
}
emit('V2...');

/* ── V2. skip: Space, a click, any pad button ────────────────────────────── */
lines.push('--- V2. a skip lands the final state within one frame and never reaches the game (M3\'s card-key discipline) ---');
{
  const settleRevealing = () => { M.invoiceScreen.onReplay(); frames(10); drainNotices(); T = 0; M.settle(); T = 1.5 * INVOICE.reveal.stepMs; M.invoiceScreen.revealTick(); };
  settleRevealing();
  const n = majorsOnSheet().length;
  eq('V2 fixture: mid-reveal, one line down', visibleMajors().length, 1);
  const paused0 = game.state.paused;
  const grips0 = recorder.events.filter((e) => e.type === EVENTS.GRIP_STARTED || e.type === EVENTS.GRIP_ENDED).length;
  const jumpBefore = input.isDown('jump', 0);
  /* A REAL keyboard event bubbles up from the focused element (document.body here), so the
   * sheet's capture-phase listener on window runs before Input's bubble-phase one and
   * stops it (M3's discipline; settings.js does the same). An event dispatched ON window is
   * at-target for both and fires in registration order — a harness shape, not a keyboard's. */
  const key = (type) => { const e = new KeyboardEvent(type, { code: 'Space', key: ' ', bubbles: true, cancelable: true }); document.body.dispatchEvent(e); return e; };
  const ev = key('keydown');
  ok('V2 a Space keydown (from the focused body) → the final state at once: no line missing, breakdown open, revealing false',
     visibleMajors().length === n && breakdown().hidden === false && M.invoiceScreen.revealing === false, `${visibleMajors().length}/${n}`);
  ok('V2 …with every line on its final amount', majorsOnSheet().every((el) => el.querySelector('.mamt').textContent === moneyText(Number(el.dataset.final))));
  ok('V2 …the keydown was consumed by the sheet (defaultPrevented) and never reached Input: jump is not down, paused unchanged',
     ev.defaultPrevented === true && input.isDown('jump', 0) === jumpBefore && input.isDown('jump', 0) === false && game.state.paused === paused0,
     `prevented=${ev.defaultPrevented} jump=${input.isDown('jump', 0)} paused=${game.state.paused}`);
  key('keyup');
  frames(2);
  eq('V2 …and no GRIP event followed', recorder.events.filter((e) => e.type === EVENTS.GRIP_STARTED || e.type === EVENTS.GRIP_ENDED).length, grips0);
  eq('V2 …paused still', game.state.paused, paused0);
  key('keydown');
  ok('V2a after the reveal the sheet no longer intercepts: the same Space reaches Input (jump down) — the form\'s keys are its own again (m17 Q5)',
     input.isDown('jump', 0) === true, `jump=${input.isDown('jump', 0)}`);
  key('keyup');
  eq('V2a …and up again', input.isDown('jump', 0), false);

  // the pad, through the input stub and the shell observer (one frame)
  settleRevealing();
  eq('V2b fixture: mid-reveal again', visibleMajors().length, 1);
  input._debugPad(0, PAD.A, 1);
  game.frame(FRAME);
  ok('V2b pad A via the input stub + one frame → the final state', visibleMajors().length === n && M.invoiceScreen.revealing === false && breakdown().hidden === false, `${visibleMajors().length}/${n}`);
  eq('V2b …paused unchanged (the sim did not step)', game.state.paused, paused0);
  input._debugPad(0, PAD.A, 0); game.frame(FRAME);
  settleRevealing();
  input._debugPad(0, PAD.MENU, 1);
  game.frame(FRAME);
  ok('V2c the pad Menu button skips too — and the pause edge it raised is spent, so the game stays paused under the sheet',
     M.invoiceScreen.revealing === false && game.state.paused === true, `revealing=${M.invoiceScreen.revealing} paused=${game.state.paused}`);
  input._debugPad(0, PAD.MENU, 0); game.frame(FRAME);
  eq('V2c …and stays paused a frame later', game.state.paused, true);

  // a click anywhere on the sheet
  settleRevealing();
  sheet().querySelector('.head').click();
  ok('V2d a click on the sheet during the reveal lands it', M.invoiceScreen.revealing === false && visibleMajors().length === n);
  ok('V2e skipReveal() with nothing revealing returns false', M.invoiceScreen.skipReveal() === false);
}
emit('V3...');

/* ── V3. the harness default: final at once ──────────────────────────────── */
lines.push('--- V3. reveal OFF (the harness default): show() renders the final state immediately; m17 Q and m11 G predicates hold ---');
{
  M.invoiceScreen.clock = realClock;
  M.invoiceScreen.revealEnabled = bootReveal;
  eq('V3 the boot value on the harness page is false', M.invoiceScreen.revealEnabled, false);
  eq('V3 revealEnabledFrom(\'\', \'/_smoketest-8400.html\', false) === false (the harness page)', revealEnabledFrom('', '/_smoketest-8400.html', false), false);
  eq('V3 …(\'?reveal=on\', harness page) === true', revealEnabledFrom('?reveal=on', '/_smoketest-1.html', false), true);
  eq('V3 …(\'?reveal=off\', index.html) === false', revealEnabledFrom('?reveal=off', '/index.html'), false);
  eq('V3 …(\'\', index.html) === true (the shipping page)', revealEnabledFrom('', '/index.html'), true);
  eq('V3 …(\'\', harness page, DEBUG.invoiceRevealInHarness) follows the flag', revealEnabledFrom('', '/_smoketest-2.html'), DEBUG.invoiceRevealInHarness);
  M.invoiceScreen.onReplay();
  frames(10);
  drainNotices();
  M.settle();
  const n = majorsOnSheet().length;
  ok('V3 after settle() the breakdown is open, every major line visible on its final amount, nothing revealing',
     breakdown().hidden === false && visibleMajors().length === n && M.invoiceScreen.revealing === false &&
     majorsOnSheet().every((el) => el.querySelector('.mamt').textContent === moneyText(Number(el.dataset.final))));
  const txt = sheet().textContent;
  ok('V3 m11 G3 predicate: INVOICE, base contract, PROFIT|LOSS are in the text at once', /INVOICE/.test(txt) && /base contract/.test(txt) && /PROFIT|LOSS/.test(txt));
  const s = sheet().querySelector('.stats'), f = sheet().querySelector('form.questionnaire'), r = sheet().querySelector('[data-act=replay]');
  ok('V3 m17 Q1e predicate: .stats, then the form, then the replay button, inside the sheet',
     !!s && !!f && !!r && !!(s.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING) && !!(f.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING) && !!f.closest('.sheet'));
  eq('V3 m17 Q1: seven [data-q] controls', sheet().querySelectorAll('[data-q]').length, 7);
  ok('V3 m28 E6: the evidence link is still in the export row', !!sheet().querySelector('.export-row a.evidence'));
}
emit('R1...');

/* ── R1. the recap from the log ──────────────────────────────────────────── */
lines.push('--- R1. \'What happened\' is built from runSummary().events: one door, the legs, two drops, a fragile line, a wall, a road event, a callout (GDD §21.2) ---');
{
  M.invoiceScreen.onReplay();
  frames(10);
  drainNotices();
  const i0 = recorder.events.length;
  const sd = toolByDef('screwdriver_01');
  ok('R1 fixture: the screwdriver is in hand', pickUp(sd), `carried ${interact._for(me().id).carriedTool}`);
  // 1. the living_kitchen door off its hinges, through the verb (m19 D4)
  const d = M.doors.doorById('living_kitchen');
  const leaf = M.doors.leafFor('living_kitchen');
  const home = leaf.state.home;
  lookAt(me(), { x: home.x, z: d.at + 1.0 }, { x: home.x, y: 1.0, z: d.at - 0.05 }, true);
  step(4);
  let seen = interact.describe(me());
  if (!(seen.target && seen.target.entity === leaf)) {
    lookAt(me(), { x: home.x, z: d.at + 0.75 }, { x: home.x, y: 1.0, z: d.at - 0.10 }, true);
    step(2);
    seen = interact.describe(me());
  }
  const doorMsg = interact.act(me(), game.clock.simTimeMs);
  ok('R1 fixture: the door came off (DOOR_STATE removed recorded)', !leaf.state.hung && recorder.events.slice(i0).some((e) => e.type === EVENTS.DOOR_STATE && e.state === 'removed'), `${doorMsg} hung=${leaf.state.hung}`);
  frames(5);
  // 2. the couch's legs, on open ground (m11 P)
  const couch = byDef('couch_3seat_01');
  parkAt(couch, -22, 0.45, 30);
  lookAt(me(), standOffFrom({ x: -22, y: 0.45, z: 30 }, 1.5), { x: -22, y: 0.45, z: 30 }, true);
  step(4);
  const legsMsg = interact.act(me(), game.clock.simTimeMs);
  ok('R1 fixture: the legs came off (PART_CHANGED removed)', (couch.state.removedParts || []).includes('legs'), `${legsMsg}`);
  frames(5);
  putDown(sd);
  // 3. two drops (m17 R3): a box, dropped and then slipped
  const box = allOfDef('box_small_01')[0];
  parkAt(box, -30, box.def.dimensions.y / 2 + 0.02, 30);
  step(30);
  let t = game.clock.simTimeMs;
  lookAt(me(), standOffFrom(posOf(box), 1.3), posOf(box), true);
  const g1 = me().grips.tryGrab('right', me().id, t);
  step(10);
  me().grips.releaseAll('dropped', game.clock.simTimeMs);   // stamped, as grip.js's own forced releases are
  step(5);
  frames(5);
  t = game.clock.simTimeMs;
  lookAt(me(), standOffFrom(posOf(box), 1.3), posOf(box), true);
  const g2 = me().grips.tryGrab('right', me().id, t);
  step(10);
  me().grips.releaseAll('slipped', game.clock.simTimeMs);
  step(5);
  ok('R1 fixture: two grips, two forced drops', !!g1 && !!g2 && recorder.events.slice(i0).filter((e) => e.type === EVENTS.GRIP_ENDED && e.reason !== 'released').length === 2);
  frames(5);
  // 4. the television from 1.5 m — a 'fragile' furniture line (m17 dropTv)
  const tv = byDef('tv_55_01');
  parkAt(tv, -38, tv.def.dimensions.y / 2 + 1.5, 30, Math.PI / 2);
  frames(150);
  damage.flush(game.clock.simTimeMs);
  ok('R1 fixture: the TV wrote an item-damage line', game.state.ledger.itemDamage.length >= 1, `${game.state.ledger.itemDamage.length}`);
  frames(5);
  // 5. a box into the front wall — a property line (m22 PD2)
  const box2 = allOfDef('box_small_01')[1];
  parkAt(box2, 1.60, 0.27, -1.50);
  step(30);
  throwAt(box2, 0, 0, -4.0);
  step(90);
  damage.flush(game.clock.simTimeMs);
  ok('R1 fixture: the wall wrote a property line', game.state.ledger.propertyDamage.length >= 1, `${game.state.ledger.propertyDamage.length}`);
  frames(5);
  // 6. the drive, as far as the first road event (4.0 s: Traffic light)
  const cab = cabPoint();
  lookAt(me(), standOffFrom(cab, 1.4), cab, true);
  step(2);
  const depart = interact.act(me());
  eq('R1 fixture: E at the cab departs', game.state.phase, PHASES.TRANSIT);
  frames(Math.ceil(4000 / FRAME) + 30);
  ok('R1 fixture: one road event so far', recorder.events.slice(i0).filter((e) => e.type === EVENTS.ROAD_FORCE).length === 1, `${depart}`);
  // 7. a recovery callout
  registry.recover(byDef('wardrobe_01'));
  frames(3);
  drainNotices();
  M.settle();

  const rs = M.runSummary();
  const events = rs.events;
  const items = [...sheet().querySelectorAll('.recap-item')];
  const kinds = items.map((li) => li.dataset.kind);
  const count = (k) => kinds.filter((x) => x === k).length;
  lines.push(`      recap: ${items.map((li) => `[${li.dataset.kind}@${li.dataset.at}${li.querySelector('.s').textContent ? ' ' + li.querySelector('.s').textContent : ''}] ${li.querySelector('.x').textContent}`).join(' | ')}`);
  ok('R1 the recap lists the door once, the legs once, the two drops, the fragile line, the wall, the road event and the callout',
     count('door') === 1 && count('part') === 1 && count('drop') === 2 && count('damage') >= 1 && count('property') >= 1 && count('road') === 1 && count('recovery') === 1,
     JSON.stringify(kinds));
  ok('R1 …every entry comes from runSummary().events: events[ref].type is the kind\'s event, and the id is kind:ref',
     items.every((li) => {
       const e = events[Number(li.dataset.ref)];
       const want = { door: EVENTS.DOOR_STATE, part: EVENTS.PART_CHANGED, drop: EVENTS.GRIP_ENDED, damage: EVENTS.DAMAGE_APPLIED, property: EVENTS.DAMAGE_APPLIED, road: EVENTS.ROAD_FORCE, recovery: EVENTS.RECOVERY }[li.dataset.kind];
       return !!e && e.type === want && Number(li.dataset.at) === e.simTimeMs;
     }));
  const fromLog = recapFrom(events);
  deep('R1 …and the DOM\'s ids equal recapFrom(runSummary().events)\'s ids — one builder, one log', items.map((li) => `${li.dataset.kind}:${li.dataset.ref}`), fromLog.map((r) => r.id));
  ok('R1 the sim stamps ascend', items.every((li, i) => i === 0 || Number(li.dataset.at) >= Number(items[i - 1].dataset.at)), items.map((li) => li.dataset.at).join(','));
  ok('R1 …each stamp is printed m:ss', items.every((li) => li.querySelector('.t').textContent === stampOf(Number(li.dataset.at))));
  const mySeat = M.seatOfMover(movers.indexOf(me()));
  ok('R1 the door and the drops name the seat that did them (P1)', items.filter((li) => li.dataset.kind === 'door' || li.dataset.kind === 'drop').every((li) => Number(li.dataset.seat) === mySeat && li.querySelector('.s').textContent === `P${mySeat + 1}`),
     items.filter((li) => li.dataset.kind === 'door' || li.dataset.kind === 'drop').map((li) => li.dataset.seat).join(','));
  ok('R1 …a road event or a wall names no seat', items.filter((li) => li.dataset.kind === 'road' || li.dataset.kind === 'property').every((li) => Number(li.dataset.seat) === -1 && li.querySelector('.s').textContent === ''));
  ok('R1 the drops carry their reasons; the damage line its band and cost', items.some((li) => li.dataset.kind === 'drop' && /dropped/.test(li.textContent)) && items.some((li) => li.dataset.kind === 'drop' && /slipped/.test(li.textContent)) &&
     items.some((li) => li.dataset.kind === 'damage' && /tv 55/.test(li.textContent) && /\d\.\d\d/.test(li.textContent)));
  ok('R1 …the door names its label, the legs their part and the couch', items.some((li) => li.dataset.kind === 'door' && li.textContent.includes(d.label)) && items.some((li) => li.dataset.kind === 'part' && /legs off — couch 3seat/.test(li.textContent)));
  ok(`R1 capped at INVOICE.recapMax (${INVOICE.recapMax}) and ≤ recapPerKind per kind`, items.length <= INVOICE.recapMax && ['door', 'part', 'drop', 'damage', 'property', 'road', 'recovery'].every((k) => count(k) <= INVOICE.recapPerKind));
  ok('R1 the recap sits between the review and the stats', (() => { const rv = sheet().querySelector('.review'), rc = sheet().querySelector('.recap'), st = sheet().querySelector('.stats');
    return !!(rv.compareDocumentPosition(rc) & Node.DOCUMENT_POSITION_FOLLOWING) && !!(rc.compareDocumentPosition(st) & Node.DOCUMENT_POSITION_FOLLOWING); })());
  // unit: the worst damage first when the cap bites; a forced door (M23's DOOR_STATE 'forced') is a door entry
  const synth = [
    { type: EVENTS.DAMAGE_APPLIED, entityId: 'a', cost: 1, band: 'scuffed', simTimeMs: 10 },
    { type: EVENTS.DAMAGE_APPLIED, entityId: 'b', cost: 50, band: 'broken', simTimeMs: 20 },
    { type: EVENTS.DAMAGE_APPLIED, entityId: 'c', cost: 5, band: 'dented', simTimeMs: 30 },
    { type: EVENTS.DOOR_STATE, doorId: 'door34', state: 'forced', by: 'p0', simTimeMs: 40 },
    { type: EVENTS.DOOR_STATE, doorId: 'door34', state: 'rehung', simTimeMs: 50 },
    { type: EVENTS.GRIP_ENDED, playerId: 'p0', entityId: 'a', reason: 'released', simTimeMs: 60 },
  ];
  const picked = recapFrom(synth, { perKind: 2, max: 10, seatOf: (id) => (id === 'p0' ? 0 : -1) });
  deep('R1u with perKind 2 the two costliest damage lines are kept, in time order; a forced door is a door entry with its seat; rehung and released are not entries',
       picked.map((p) => `${p.kind}:${p.ref}:${p.seat}`), ['damage:1:-1', 'damage:2:-1', 'door:3:0']);
  ok('R1u …and the forced door says so', picked[2].text.includes('forced') && picked[2].text.includes('door34'));
  eq('R1u max caps the list', recapFrom(synth, { perKind: 3, max: 2 }).length, 2);

  // a run with nothing notable
  M.invoiceScreen.onReplay();
  frames(5);
  drainNotices();
  M.settle();
  const rc = sheet().querySelector('.recap');
  ok('R1e a run with none → the block is present, the list empty, and it says \'nothing notable\'',
     !!rc && rc.querySelectorAll('.recap-item').length === 0 && /nothing notable/.test(rc.textContent), rc && rc.textContent.trim());
  eq('R1e …recapFrom over that run\'s events is empty too', recapFrom(M.runSummary().events).length, 0);
}
emit('R2...');

/* ── R2. the retry keeps settings; keep loadout ──────────────────────────── */
lines.push('--- R2. restart from the settlement keeps text size and hints; \'keep the tools on the truck\' carries them, off puts every tool on its rack (GDD §21.2) ---');
{
  const ts = () => document.documentElement.style.getPropertyValue('--ts');
  M.settingsStore.apply({ uiScale: 1.3, hints: false });
  ok('R2 fixture: text size 1.3 and hints off, consumed (--ts, interact.hints)', ts() === '1.3' && interact.hints === false && M.shellSettings.uiScale === 1.3 && M.shellSettings.hints === false);
  ok('R2 fixture: the settlement is up', M.invoiceScreen.visible);
  const keep = sheet().querySelector('input.keep-loadout');
  ok('R2 the keep-loadout box is on the sheet, ENABLED (the hook exists in resetContract)', !!keep && keep.disabled === false && keep.checked === false, keep && `disabled=${keep.disabled} title=${keep.title}`);
  sheet().querySelector('[data-act=replay]').click();
  frames(5);
  ok('R2 restart from the sheet: PICKUP, unpaused', game.state.phase === PHASES.PICKUP && !game.state.paused && !M.invoiceScreen.visible);
  ok('R2 …text size and hints survived (shell state is not contract state, §22.4)', ts() === '1.3' && interact.hints === false && M.shellSettings.uiScale === 1.3 && M.shellSettings.hints === false,
     `ts=${ts()} hints=${interact.hints}`);
  M.settingsStore.apply({ uiScale: 1, hints: true });
  ok('R2 …restored', ts() === '1' && interact.hints === true);

  // keep loadout ON: the screwdriver and the dolly in the cargo box stay there
  const sd = toolByDef('screwdriver_01'), dolly = toolByDef('dolly_flat_01');
  const toolsList = [...tools.tools.values()];
  const spawnOf = (t) => PHASE6_TOOL_SPAWNS[toolsList.indexOf(t)];
  parkAt(sd, M.truckPose.x - 0.3, I.minY + 0.25, I.maxZ - 0.9);
  parkAt(dolly, M.truckPose.x + 0.3, I.minY + 0.30, I.maxZ - 1.6);
  frames(40);
  ok('R2 fixture: the screwdriver and the dolly are inside the cargo box', insideCargo(posOf(sd)) && insideCargo(posOf(dolly)), `${JSON.stringify(posOf(sd))} ${JSON.stringify(posOf(dolly))}`);
  const aboard = toolsList.filter((t) => insideCargo(posOf(t))).map((t) => t.id);
  drainNotices();
  M.settle();
  sheet().querySelector('input.keep-loadout').checked = true;
  eq('R2 the box reads back as ticked (keepLoadout())', M.invoiceScreen.keepLoadout(), true);
  sheet().querySelector('[data-act=replay]').click();
  frames(30);
  const aboardAfter = toolsList.filter((t) => insideCargo(posOf(t))).map((t) => t.id);
  deep('R2 keep loadout ON → the tools that were on the truck are on the truck after the restart (ids)', aboardAfter, aboard);
  ok('R2 …dynamic, ordinary collision groups, and the others on their racks', toolsList.every((t) => t.body.isDynamic()) &&
     toolsList.filter((t) => !aboard.includes(t.id)).every((t) => { const s = spawnOf(t), p = posOf(t); return Math.hypot(p.x - s.x, p.z - s.z) < 0.15; }));
  ok('R2 …a fresh contract otherwise: PICKUP, the manifest respawned, no straps', game.state.phase === PHASES.PICKUP && straps.count === 0 && game.state.manifest.every((r) => !r.delivered));

  // keep loadout OFF: everything back on its rack
  frames(5);
  drainNotices();
  M.settle();
  eq('R2 fixture: the box starts unticked on a new sheet', M.invoiceScreen.keepLoadout(), false);
  sheet().querySelector('[data-act=replay]').click();
  frames(30);
  const stock = toolsList.every((t) => { const s = spawnOf(t), p = posOf(t); return Math.hypot(p.x - s.x, p.z - s.z) < 0.15; });
  ok('R2 keep loadout OFF → the stock loadout: every tool within 0.15 m of its PHASE6_TOOL_SPAWNS row, none in the truck', stock && toolsList.every((t) => !insideCargo(posOf(t))),
     toolsList.map((t) => `${t.defId}:${posOf(t).x.toFixed(2)},${posOf(t).z.toFixed(2)}`).join(' '));
  ok('R2 onReplay() with no argument is the stock path too (m17 Q2 unchanged)', (() => { drainNotices(); M.settle(); M.invoiceScreen.onReplay(); frames(5);
    return game.state.phase === PHASES.PICKUP && toolsList.every((t) => !insideCargo(posOf(t))); })());
}
emit('Z...');

/* ── Z. teardown ─────────────────────────────────────────────────────────── */
lines.push('--- Z. nothing grew, nothing leaked into state ---');
{
  eq('Z1 the brief added no bodies (physics.stats.bodies as at boot)', physics.stats.bodies, bootBodies);
  eq('Z2 …and no scene children', world.scene.children.length, bootChildren);
  ok('Z3 game.state still JSON round-trips and carries no brief', (() => { const s = JSON.stringify(game.state); return !!JSON.parse(s) && !/"brief"/.test(s); })());
  ok('Z4 no error banner during the suite', !document.getElementById('err-banner'));
  eq('Z5 the reveal clock is the real one again', M.invoiceScreen.clock, realClock);
}

} catch (e) {
  fails++;
  lines.push(`FAIL  suite threw  <- ${e && e.message}`);
  lines.push((e && e.stack || '').split('\n').slice(0, 6).join('\n'));
}

try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* nothing to clear */ }
emit();
