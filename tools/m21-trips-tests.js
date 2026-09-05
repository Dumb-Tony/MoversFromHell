/* Phase 11 build-side M13 suite — the second trip.
 *
 * Not a §25.2 roadmap gate. §3.4's Pickup exit reads "required cargo loaded OR CREW ELECTS
 * ANOTHER TRIP" and "a phase may return to an earlier phase for an extra trip. The state
 * machine must not lose damage, time, fees, or manifest status." For twenty phases the
 * contract had exactly one trip in it: state.tripCount was never written, the cab at the
 * destination offered only "finish the job and settle up" whatever was still in the house,
 * and a crew that settled with twenty items left took the full base payout (§12.2 sanctions
 * partial completion; nothing priced it).
 *
 * THE CLAIMS UNDER TEST, each measured through game.frame() the way the game runs:
 *
 *   A PHASE, NOT A TELEPORT   the return leg is the same route timeline heading 'back'; its
 *                             arrival is PICKUP again with tripCount + 1, the truck never
 *                             moved and nothing in the world was rebuilt (T4).
 *   NOTHING IS LOST           delivered rows stay delivered, the ledger and the work clock
 *                             carry over plus the leg (T4, §3.4).
 *   PRICED IN ADVANCE         the cab prompt names the trip back AND the cost of settling
 *                             without it, to the cent, before either key is pressed (T3, §4.4).
 *                             M20: priced by the INVOICE's definition — every undelivered row,
 *                             a box still on the truck included, and the prompt says so
 *                             ('1 still on the truck'); manifest.js undeliveredRows is the one
 *                             function both read, and T3c deep-equals the two sets (T3b/T3c).
 *                             The on-truck key is PRESSED for real in T3d — a fifth leg after
 *                             T8's replay — and the invoice settle() built bills the count the
 *                             line named; with nothing away E is the settlement and carries
 *                             the same price, payload and notice as Q (T3e, interact._settle).
 *   THE INVOICE REPORTS TRIPS ACCURATELY (§26.1)   fuel per leg (2n − 1), a line for every
 *                             item left behind that reconcile() re-derives from the rows, no
 *                             one-trip bonus on trip 2, and the single-trip invoice untouched
 *                             (T6, T8).
 *
 * Drives every leg with routeSteps() + 1 game.frame(16.667) calls (m11 E): only game.frame
 * runs the 'phase' system that promotes an arrival. Fixtures copied from tools/m11-tests.js
 * (step, placeMover, parkAt, lookAt, standOffFrom) and tools/m10-tests.js (slotIn) — the
 * function names are kept so the lineage stays greppable.
 */

import { SIM, ECONOMY, MANIFEST } from '../src/config.js';
import { EVENTS, PHASES } from '../src/core/eventBus.js';
import { routeSteps } from '../src/drive/route.js';
import { cabPoint, cargoInterior } from '../src/world/truck.js';
import { DEST_ZONES } from '../src/world/destination.js';
import { LINE_KINDS, contributionStats, itemsLeftBehind } from '../src/contract/invoice.js';   // itemsLeftBehind: M20, T3c
import { undeliveredRows } from '../src/contract/manifest.js';                                  // M20, T3c
import { TARGET } from '../src/player/interact.js';

const lines = [];
let passes = 0, fails = 0;
function ok(name, cond, detail = '') {
  if (cond) { passes++; lines.push(`PASS  ${name}`); }
  else { fails++; lines.push(`FAIL  ${name}${detail ? '  <- ' + detail : ''}`); }
}
const eq = (n, a, b) => ok(n, a === b, `got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const near = (n, a, b, tol) => ok(n, Math.abs(a - b) <= tol, `${a} vs ${b} (tol ${tol})`);

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
/* A throw anywhere below used to leave every accumulated PASS/FAIL line unemitted (m13's
 * lesson): an uncaught error is one FAIL line and the block still emits. */
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

const { game, physics, registry, movers, straps, cargo, route, interact, rig, camera, hud } = M;
const bus = game.bus;
const STEP = SIM.stepMs;
const FRAME = 16.667;
const I = cargoInterior();
const me = () => movers[M.activeMoverIndex];
/** One leg of the route, as m11 E drives it: the route arrives when elapsedS >= 28.0 and
 *  1680 x (1000/60) ms may land a rounding error short of it. */
const LEG = routeSteps() + 1;

/** The boot's BRIEFING -> PICKUP transition, captured before anything can push it out of the
 *  256-entry ring; every CONTRACT_PHASE after it comes through the subscriber (m11 G2c). */
const bootPhaseEvents = bus.log.filter((e) => e.type === EVENTS.CONTRACT_PHASE);
const phaseEvents = [];
bus.on(EVENTS.CONTRACT_PHASE, (e) => phaseEvents.push(e));
const cargoEvents = [];
bus.on(EVENTS.CARGO_STATE, (e) => cargoEvents.push(e));

let framesTotal = 0;
function frames(n) { for (let k = 0; k < n; k++) M.game.frame(FRAME); framesTotal += n; }

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
const byDef = (id) => [...registry.entities.values()].filter((e) => e.defId === id);

/** Stand a mover somewhere and point them at a world point (m11). `snap` — a teleport can
 *  snap the camera: the rig's follow target is lerped, and after a long jump the aim ray
 *  misses; m14 snaps at the cab for the same reason. */
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
function standOffFrom(target, back = 1.3) { return { x: target.x, z: target.z + back }; }
const slotIn = (zoneId, index) => {
  const z = DEST_ZONES.find((r) => r.id === zoneId);
  const cols = 4;
  const w = (z.maxX - z.minX) - 1.2, d = (z.maxZ - z.minZ) - 1.2;
  return {
    x: z.minX + 0.6 + ((index % cols) + 0.5) * (w / cols),
    z: z.minZ + 0.6 + (Math.floor(index / cols) + 0.5) * (d / 2),
  };
};

const rowOf = (e) => game.state.manifest.find((r) => r.entityId === e.id);
const drainNotices = () => { const n = M.pendingNotices.length; M.pendingNotices.splice(0, n); return n; };
const obj = () => hud.el.querySelector('.objective').textContent.replace(/\s+/g, ' ').trim();
const findLine = (inv, kind) => inv.lines.find((l) => l.kind === kind) || null;
const invoiceOpts = () => ({ recoveries: M.recoveryCount(), collisions: 0, moverCount: movers.length });

/** Park an entity in the truck and wait for cargo.step to count it loaded (m11 O2). */
function loadIntoTruck(e, zOff = 1.0) {
  parkAt(e, M.truckPose.x, I.minY + 0.30, I.maxZ - zOff);
  let dwell = 0;
  while (!e.state.loaded && dwell < 240) { frames(1); dwell++; }
  return dwell;
}
/** Teleport a manifest entity into ITS OWN destination room (m10 slotIn) and wait for the row
 *  to deliver — at least MANIFEST.dwellMs of settled frames, never a transient read. */
const perRoom = {};
function deliver(e) {
  const row = rowOf(e);
  perRoom[row.toZone] = (perRoom[row.toZone] || 0) + 1;
  const s = slotIn(row.toZone, perRoom[row.toZone] - 1);
  parkAt(e, s.x, e.def.dimensions.y / 2 + 0.06, s.z);
  let n = 0;
  while (!row.delivered && n < 400) { frames(1); n++; }
  return n;
}
/** Stand at the cab and look at it, as a player would. */
function atCab() { const cab = cabPoint(); lookAt(me(), standOffFrom(cab, 1.4), cab, true); }

const boxes = byDef('box_small_01');
const box1 = boxes[0];
const box2 = boxes[1];

try {
/* ── T1. boot ─────────────────────────────────────────────────────────────── */
lines.push('--- T1. boot: trip 1 from the first frame (GDD §10.2, §23.2) ---');
{
  eq('T1 game.state.tripCount === 1 at boot (was 0, never written)', game.state.tripCount, 1);
  eq('T1 …and cargo.tripCount === 1 agrees', cargo.tripCount, 1);
  eq('T1 route.status().heading is \'out\'', route.status().heading, 'out');
  eq('T1 …and the route is parked', route.state, 'parked');
  const f = M.contractFacts();
  eq('T1 contractFacts().trip === 1', f.trip, 1);
  eq('T1 …and .away === 23: every row is in the old house', f.away, 23);
  ok('T1 fixture: two small boxes to work with', !!box1 && !!box2 && box1 !== box2, `${boxes.length} box_small_01`);
}
emit('running...');

/* ── T2. the first leg ────────────────────────────────────────────────────── */
lines.push('--- T2. the first leg: one box, E at the cab, 1681 frames (GDD §3.4, §11.1) ---');
{
  frames(60);
  const dwell = loadIntoTruck(box1);
  eq('T2 a box parked in the truck counts as loaded within 240 frames', box1.state.loaded, true);
  lines.push(`      loaded after ${dwell} frames`);
  eq('T2 …stamped loadedOnTrip 1 (§10.2 "which trip moved each item")', box1.state.loadedOnTrip, 1);
  const rec1 = M.recorder.events.filter((e) => e.type === EVENTS.CARGO_STATE && e.entityId === box1.id && e.loaded).pop();
  ok('T2 …and the recorder\'s CARGO_STATE event carries trip 1', !!rec1 && rec1.trip === 1, rec1 ? JSON.stringify(rec1) : 'no CARGO_STATE for the box in recorder.events');

  atCab();
  const d = interact.describe(me());
  eq('T2 the cab is under the reticle', d.target.kind, TARGET.CAB);
  ok('T2 …and offers the drive, with no secondary at the house', /drive/.test(d.primary || '') && d.secondary === null, `${d.primary} / ${d.secondary}`);
  const said = interact.act(me());
  eq('T2 E at the cab departs', route.state, 'driving');
  eq('T2 …in TRANSIT', game.state.phase, PHASES.TRANSIT);
  eq('T2 …heading \'out\'', route.status().heading, 'out');
  ok('T2 …and says so', /driving/.test(said || ''), said || '');
  frames(LEG);
  eq(`T2 ${LEG} frames later the route has arrived`, route.state, 'arrived');
  eq('T2 …and the contract is in DELIVERY', game.state.phase, PHASES.DELIVERY);
  eq('T2 …tripCount still 1', game.state.tripCount, 1);
  ok('T2 …with the "arrived" notice queued', M.pendingNotices.some((n) => /arrived/.test(n.text)) || /arrived/.test(hud.notices.textContent),
     M.pendingNotices.map((n) => n.text).join(' | '));
}
emit('running...');

/* ── T3. the choice at the cab ────────────────────────────────────────────── */
lines.push('--- T3. the choice at the cab: drive back, or settle and pay (GDD §3.4, §4.4, §12.2) ---');
{
  const n = deliver(box1);
  const row = rowOf(box1);
  ok('T3 the box teleported into its room is delivered once it has dwelt', row.delivered === true, `${n} frames, dwellMs ${row.dwellMs}`);
  eq(`T3 …with dwellMs === MANIFEST.dwellMs (${MANIFEST.dwellMs})`, row.dwellMs, MANIFEST.dwellMs);
  eq('T3 contractFacts().away === 22', M.contractFacts().away, 22);
  eq('T3 …and delivered 1', M.contractFacts().delivered, 1);

  atCab();
  const d = interact.describe(me());
  eq('T3 the cab is under the reticle', d.target.kind, TARGET.CAB);
  ok('T3 E offers the trip back for the 22 still away', /drive back/.test(d.primary || '') && /\b22\b/.test(d.primary || ''), d.primary || '');
  const want = (22 * ECONOMY.leftBehindFee).toFixed(2);
  ok('T3 Q offers to settle up leaving 22 behind', /settle/.test(d.secondary || '') && /\b22\b/.test(d.secondary || ''), d.secondary || '');
  ok(`T3 …priced in advance: the prompt carries ${want} (22 x ECONOMY.leftBehindFee ${ECONOMY.leftBehindFee})`,
     (d.secondary || '').includes(want) && want === '1320.00', d.secondary || '');

  /* T3b/T3c (Phase 11 build-side M20; §4.4, §15.1, §26.1). ONE definition of "left behind":
   * the prompt prices every undelivered required row — the set the invoice's LEFT_BEHIND line
   * bills (manifest.js undeliveredRows ← invoice.js itemsLeftBehind, interact.js settlement())
   * — not only the rows that need another trip. Until M20 a box still on the truck made the
   * settlement one item larger than the prompt had promised. Fixture: a second box loaded
   * onto the truck HERE, at the destination — 21 away, 1 on the truck, 22 not delivered. The
   * invoice Q would settle with is built on this very state (buildInvoice + reconcile, exactly
   * what T6 does after its own Q); pressing Q here would end the run T4-T6 still need, so the
   * on-truck key is pressed FOR REAL in T3d, on a fifth leg after T8's replay (the invoice
   * settle() built: -1320.00 citing 22 rows, the on-truck row's among them). T6 presses it
   * with nothing on the truck (its 21 / 1260.00 unchanged), and the on-truck fixture is
   * unloaded again before T4. */
  const box2Home = posOf(box2);
  const dwell2 = loadIntoTruck(box2);
  eq('T3b fixture: a second box parked in the truck at the destination counts as loaded', box2.state.loaded, true);
  lines.push(`      box 2 loaded at the destination after ${dwell2} frames`);
  eq('T3b …so contractFacts().away is 21 (the box on the truck needs no trip)', M.contractFacts().away, 21);
  atCab();
  const d2 = interact.describe(me());
  ok('T3b E still offers the trip back for the 21 away', /drive back/.test(d2.primary || '') && /\b21\b/.test(d2.primary || ''), d2.primary || '');
  const want22 = (22 * ECONOMY.leftBehindFee).toFixed(2);
  ok(`T3b Q prices 22 not delivered — not 21 — and the prompt carries ${want22}`,
     /settle/.test(d2.secondary || '') && /\b22\b/.test(d2.secondary || '') && (d2.secondary || '').includes(want22) && want22 === '1320.00', d2.secondary || '');
  ok('T3b …and names "1 still on the truck"', /1 still on the truck/.test(d2.secondary || ''), d2.secondary || '');
  lines.push(`      Q: "${d2.secondary}"`);
  const st = interact.settlement();
  eq('T3b interact.settlement(): 22 not delivered = 21 away + 1 on the truck + 0 at the site', `${st.n}/${st.away}/${st.inTruck}/${st.atSite}`, '22/21/1/0');
  near(`T3b …priced at 22 x ECONOMY.leftBehindFee = ${want22}`, st.cost, 22 * ECONOMY.leftBehindFee, 1e-9);
  const invNow = M.buildInvoice(game.state, M.manifestSummary(game.state.manifest), invoiceOpts());
  const leftNow = findLine(invNow, LINE_KINDS.LEFT_BEHIND) || { amount: NaN, from: [], detail: '' };
  near(`T3b the invoice this state settles to bills exactly 22 x ${ECONOMY.leftBehindFee} = -${want22} on its items-left-behind line`,
       leftNow.amount, -22 * ECONOMY.leftBehindFee, 0.005);
  eq('T3b …citing 22 rows', leftNow.from.length, 22);
  ok('T3b …the on-truck row\'s id among them', leftNow.from.includes(rowOf(box2).id), `${rowOf(box2).id} not in [${leftNow.from.join(',')}]`);
  const recNow = M.reconcile(invNow, game.state, invoiceOpts());
  ok('T3b …and reconcile() agrees', recNow.ok, recNow.problems.join(' | '));
  // T3c — one definition, exported and used by both.
  const idsOf = (rows) => rows.map((r) => r.id).sort().join(',');
  const fromInvoice = itemsLeftBehind(game.state);
  const fromManifest = undeliveredRows(game.state.manifest);
  eq('T3c itemsLeftBehind(state) is the set the prompt priced — deep-equal ids — with the box on the truck', idsOf(fromInvoice), [...st.ids].sort().join(','));
  eq('T3c …and both are manifest.js undeliveredRows: ONE definition, exported and used by both', idsOf(fromManifest), idsOf(fromInvoice));
  eq('T3c …22 rows', fromInvoice.length, 22);
  eq('T3c …and the invoice line cites exactly that set', [...leftNow.from].sort().join(','), idsOf(fromInvoice));
  // The fixture, undone: the box back at the old house, unloaded, 22 away again for T4.
  parkAt(box2, box2Home.x, box2Home.y, box2Home.z);
  let un = 0;
  while (box2.state.loaded && un < 240) { frames(1); un++; }
  eq('T3b fixture undone: the box is back at the old house and no longer loaded', box2.state.loaded, false);
  eq('T3b …contractFacts().away === 22 again', M.contractFacts().away, 22);
  atCab();
  const d3 = interact.describe(me());
  const st3 = interact.settlement();
  eq('T3c with nothing on the truck the prompt prices 22, none on the truck — the same set the invoice bills', `${st3.n}/${st3.inTruck}`, '22/0');
  eq('T3c …deep-equal ids again', idsOf(itemsLeftBehind(game.state)), [...st3.ids].sort().join(','));
  ok('T3 (unchanged) Q offers 22 at 1320.00 with nothing on the truck, and does not mention the truck',
     /\b22\b/.test(d3.secondary || '') && (d3.secondary || '').includes('1320.00') && !/on the truck/.test(d3.secondary || ''), d3.secondary || '');

  /* T3e (M20). With nothing away E IS the settlement, and M20 prices its line by the same
   * definition as Q's — bare 'finish the job and settle up' when nothing is undelivered (T8,
   * m11 E7 unchanged), priced when something still is — and the E press carries the same
   * SETTLEMENT payload and notice as the Q press: interact.js _settle() is the one call both
   * make. The states are faked at the seam interact READS (tripStatus, an injected function)
   * and the phase change captured at the seam it WRITES (setPhase), so the run T4-T6 still
   * need is untouched — the route stays arrived, the phase DELIVERY. T3d presses Q for real. */
  {
    const realTrip = interact.tripStatus, realSetPhase = interact.setPhase;
    const captured = [];
    interact.setPhase = (to, v) => { captured.push({ to, v }); return to; };
    const last = () => captured[captured.length - 1];
    const fee = (n) => (n * ECONOMY.leftBehindFee).toFixed(2);
    const fake = (away, inTruck, atSite) => () => ({
      away, inTruck, atSite, notDelivered: away + inTruck + atSite,
      notDeliveredIds: game.state.manifest.slice(0, away + inTruck + atSite).map((r) => r.id),
    });
    atCab();
    interact.tripStatus = fake(0, 1, 0);
    let dE = interact.describe(me());
    eq(`T3e nothing away, one box still on the truck: E is the settlement and prices it — "finish the job and settle up — 1 not delivered (${fee(1)}), 1 still on the truck"`,
       dE.primary, `finish the job and settle up — 1 not delivered (${fee(1)}), 1 still on the truck`);
    eq('T3e …and there is no Q line', dE.secondary, null);
    let saidE = interact.act(me());
    eq('T3e …pressing E says what Q would: "settling up — 1 not delivered (1 still on the truck)"', saidE, 'settling up — 1 not delivered (1 still on the truck)');
    eq('T3e …with the SETTLEMENT payload Q would carry: ok, leftBehind 1, away 0, inTruck 1, atSite 0',
       JSON.stringify(last()), JSON.stringify({ to: PHASES.SETTLEMENT, v: { ok: true, leftBehind: 1, away: 0, inTruck: 1, atSite: 0 } }));
    interact.tripStatus = fake(0, 0, 2);
    dE = interact.describe(me());
    eq(`T3e two rows here but not yet in a room: "finish the job and settle up — 2 not delivered (${fee(2)}), 2 here but not yet in a room"`,
       dE.primary, `finish the job and settle up — 2 not delivered (${fee(2)}), 2 here but not yet in a room`);
    saidE = interact.act(me());
    eq('T3e …and E says "settling up — 2 not delivered" (the truck unmentioned: nothing is on it)', saidE, 'settling up — 2 not delivered');
    eq('T3e …payload leftBehind 2 / atSite 2', `${last().v.leftBehind}/${last().v.away}/${last().v.inTruck}/${last().v.atSite}`, '2/0/0/2');
    interact.tripStatus = fake(3, 1, 2);
    dE = interact.describe(me());
    ok('T3e with rows away, E is the trip back for 3 and Q carries every clause', /drive back for 3 more/.test(dE.primary || '') &&
       dE.secondary === `settle up — 6 not delivered (${fee(6)}), 1 still on the truck, 2 here but not yet in a room`, `${dE.primary} / ${dE.secondary}`);
    saidE = interact.secondary(me());
    eq('T3e …and Q says "settling up — 6 not delivered (1 still on the truck)" with payload 6/3/1/2',
       `${saidE} ${last().v.leftBehind}/${last().v.away}/${last().v.inTruck}/${last().v.atSite}`, 'settling up — 6 not delivered (1 still on the truck) 6/3/1/2');
    interact.tripStatus = fake(0, 0, 0);
    dE = interact.describe(me());
    eq('T3e nothing undelivered: the bare "finish the job and settle up" it always was', dE.primary, 'finish the job and settle up');
    saidE = interact.act(me());
    eq('T3e …and E says the bare "settling up"', saidE, 'settling up');
    eq('T3e …with leftBehind 0 on the payload', JSON.stringify(last().v), JSON.stringify({ ok: true, leftBehind: 0, away: 0, inTruck: 0, atSite: 0 }));
    interact.tripStatus = realTrip; interact.setPhase = realSetPhase;
    eq('T3e seams restored: four presses captured, the route still arrived, the phase still DELIVERY',
       `${captured.length}/${route.state}/${game.state.phase}`, `4/arrived/${PHASES.DELIVERY}`);
    eq('T3e …and the real tripStatus reads 22 not delivered again', interact.settlement().n, 22);
  }
}
emit('running...');

/* ── T4. the return leg ───────────────────────────────────────────────────── */
lines.push('--- T4. the return leg: TRANSIT back to PICKUP, trip 2, nothing lost (GDD §3.4, §2.2) ---');
{
  drainNotices();
  const ledgerBefore = JSON.stringify(game.state.ledger);
  const workBefore = game.state.elapsedWorkMs;
  const transitBefore = game.state.telemetry.phaseMs.transit;
  const deliveredBefore = rowOf(box1).delivered;
  let departEvent = null;
  const off = bus.on(EVENTS.CONTRACT_PHASE, (e) => { if (e.to === PHASES.TRANSIT) departEvent = e; });
  atCab();
  const said = interact.act(me());
  off();
  eq('T4 E at the cab departs again', route.state, 'driving');
  eq('T4 …heading \'back\'', route.status().heading, 'back');
  eq('T4 …in TRANSIT', game.state.phase, PHASES.TRANSIT);
  ok('T4 …the CONTRACT_PHASE payload says returning with 22 remaining',
     !!departEvent && departEvent.validation && departEvent.validation.returning === true && departEvent.validation.remaining === 22,
     departEvent ? JSON.stringify(departEvent.validation) : 'no TRANSIT event');
  ok('T4 …and the cab says so', /driving back/.test(said || '') && /\b22\b/.test(said || ''), said || '');
  M.feedHuds();
  ok('T4 the objective line says heading back', /heading back/.test(obj()), obj());

  frames(LEG);
  eq(`T4 ${LEG} frames later the contract is back in PICKUP`, game.state.phase, PHASES.PICKUP);
  eq('T4 …game.state.tripCount === 2', game.state.tripCount, 2);
  eq('T4 …cargo.tripCount === 2', cargo.tripCount, 2);
  eq('T4 …the route is parked again', route.state, 'parked');
  eq('T4 …heading \'out\' again', route.status().heading, 'out');
  const notices = M.pendingNotices.filter((n) => /trip 2/.test(n.text) && /\b22\b/.test(n.text));
  eq('T4 exactly one notice names trip 2 and the 22 to go', notices.length, 1);
  lines.push(`      notice: "${notices.map((n) => n.text).join(' | ')}"`);
  hud.setContract(M.contractFacts());
  const panel = hud.contract.textContent.replace(/\s+/g, ' ');
  ok('T4 the HUD contract panel reads pickup · trip 2', /pickup/i.test(panel) && /trip 2/.test(panel), panel.slice(0, 60));

  // §3.4 "must not lose damage, time, fees, or manifest status".
  eq('T4 §3.4: the delivered box\'s row is still delivered', rowOf(box1).delivered, deliveredBefore && true);
  eq('T4 §3.4: the ledger is exactly what it was', JSON.stringify(game.state.ledger), ledgerBefore);
  const workDelta = game.state.elapsedWorkMs - workBefore;
  near(`T4 §3.4: elapsedWorkMs advanced by the leg (${LEG} x ${STEP.toFixed(3)} ms, ± one step)`, workDelta, LEG * STEP, STEP + 1e-6);
  const transit = game.state.telemetry.phaseMs.transit;
  near('T4 telemetry.phaseMs.transit is two legs of 28000 ms (± one step per leg)', transit, 2 * 28000, 2 * STEP + 1e-6);
  lines.push(`      transit ${transit.toFixed(1)} ms (leg 2 added ${(transit - transitBefore).toFixed(1)}), work +${workDelta.toFixed(1)} ms`);
  const seq = [...bootPhaseEvents, ...phaseEvents].map((e) => e.to).join(' -> ');
  eq('T4 the phase-event log since boot', seq, 'pickup -> transit -> delivery -> transit -> pickup');
  ok('T4 …every entry from game.setPhase (from AND to)', [...bootPhaseEvents, ...phaseEvents].every((e) => typeof e.from === 'string' && typeof e.to === 'string'));
}
emit('running...');

/* ── T5. trip 2 ───────────────────────────────────────────────────────────── */
lines.push('--- T5. trip 2: the stamp, the objective, the second delivery (GDD §10.2, §26.7) ---');
{
  const dwell = loadIntoTruck(box2);
  eq('T5 a second box parked in the truck counts as loaded', box2.state.loaded, true);
  eq('T5 …stamped loadedOnTrip 2', box2.state.loadedOnTrip, 2);
  const ev = cargoEvents.filter((e) => e.entityId === box2.id && e.loaded).pop();
  ok('T5 …and its CARGO_STATE event carries trip 2', !!ev && ev.trip === 2, ev ? JSON.stringify(ev) : `no event (${dwell} frames)`);
  const rec2 = M.recorder.events.filter((e) => e.type === EVENTS.CARGO_STATE && e.entityId === box2.id && e.loaded).pop();
  lines.push(`      recorder holds ${M.recorder.events.length} events; the box's trip-2 CARGO_STATE ${rec2 ? 'is' : 'is NOT'} among them`);
  M.feedHuds();
  ok('T5 the objective names trip 2 and the drive', /trip 2/.test(obj()) && /drive/.test(obj()), obj());

  atCab();
  interact.act(me());
  eq('T5 E at the cab drives out again, heading \'out\'', route.status().heading, 'out');
  eq('T5 …in TRANSIT', game.state.phase, PHASES.TRANSIT);
  frames(LEG);
  eq('T5 …arriving in DELIVERY', game.state.phase, PHASES.DELIVERY);
  eq('T5 …with tripCount 2', game.state.tripCount, 2);

  const n = deliver(box2);
  ok('T5 the second box delivers into its room', rowOf(box2).delivered === true, `${n} frames`);
  eq('T5 contractFacts().away === 21', M.contractFacts().away, 21);
  M.feedHuds();
  ok('T5 the objective offers the trip back for 21', /drive back/.test(obj()) && /\b21\b/.test(obj()), obj());
}
emit('running...');

/* ── T6. settling with items left behind ──────────────────────────────────── */
lines.push('--- T6. settling with 21 left behind: the priced invoice (GDD §15.1, §26.1, §12.2) ---');
let settledInvoice = null;
{
  atCab();
  const d = interact.describe(me());
  ok('T6 Q at the cab promises to settle leaving 21 behind', /settle/.test(d.secondary || '') && /\b21\b/.test(d.secondary || ''), d.secondary || '');

  // m11 G2b: exactly one CONTRACT_PHASE{to:settlement}, the invoice shown exactly once.
  let settlementEvents = 0;
  const offCount = bus.on(EVENTS.CONTRACT_PHASE, (e) => { if (e.to === PHASES.SETTLEMENT) settlementEvents++; });
  const ownShow = Object.prototype.hasOwnProperty.call(M.invoiceScreen, 'show');
  const realShow = M.invoiceScreen.show;
  let shows = 0;
  M.invoiceScreen.show = function (...args) { shows++; return realShow.apply(this, args); };
  const said = interact.secondary(me());
  offCount();
  if (ownShow) M.invoiceScreen.show = realShow; else delete M.invoiceScreen.show;

  eq('T6 Q settles', game.state.phase, PHASES.SETTLEMENT);
  ok('T6 …and says so', /settling up/.test(said || '') && /\b21\b/.test(said || ''), said || '');
  eq('T6 …one CONTRACT_PHASE{to:settlement}', settlementEvents, 1);
  eq('T6 …the invoice shown once', shows, 1);

  const summary = M.manifestSummary(game.state.manifest);
  const opts = invoiceOpts();
  const inv = M.buildInvoice(game.state, summary, opts);
  settledInvoice = inv;
  for (const l of inv.lines) {
    lines.push(`      ${l.kind.padEnd(22)} ${l.amount >= 0 ? ' ' : ''}${l.amount.toFixed(2).padStart(9)}   ${l.detail}`);
  }
  lines.push(`      ${'PROFIT'.padEnd(22)} ${inv.profit.toFixed(2).padStart(10)}   grade ${inv.grade.letter}`);

  ok('T6 no one-trip bonus on trip 2 (§15.1 "awarded if all required cargo moved once")', !findLine(inv, LINE_KINDS.ONE_TRIP));
  const fuel = findLine(inv, LINE_KINDS.FUEL) || { amount: NaN, detail: '' };
  const wantFuel = -(3 * ECONOMY.routeDistanceKm * ECONOMY.fuelPerKm);
  near(`T6 FUEL is three legs: ${wantFuel.toFixed(2)} to the cent (2 x 2 - 1 legs x 4.2 km x 3.2/km)`, fuel.amount, wantFuel, 0.005);
  eq('T6 …which is -40.32', Number(fuel.amount.toFixed(2)), -40.32);
  ok('T6 …and the detail says /3 legs/', /3 legs\b/.test(fuel.detail), fuel.detail);

  const left = findLine(inv, LINE_KINDS.LEFT_BEHIND) || { amount: NaN, detail: '', from: [] };
  const wantLeft = -(21 * ECONOMY.leftBehindFee);
  near(`T6 LEFT_BEHIND is 21 x ECONOMY.leftBehindFee = ${wantLeft.toFixed(2)} to the cent`, left.amount, wantLeft, 0.005);
  eq('T6 …which is -1260.00', Number(left.amount.toFixed(2)), -1260);
  eq('T6 …citing 21 rows', left.from.length, 21);
  const undelivered = new Set(game.state.manifest.filter((r) => !r.delivered).map((r) => r.id));
  ok('T6 …every one an undelivered manifest row id', left.from.length === undelivered.size && left.from.every((id) => undelivered.has(id)),
     `${left.from.filter((id) => !undelivered.has(id)).length} not undelivered`);

  const rec = M.reconcile(inv, game.state, opts);
  ok('T6 reconcile() agrees', rec.ok, rec.problems.join(' | '));
  eq('T6 …having checked every line', rec.checked, inv.lines.length);
  const halved = JSON.parse(JSON.stringify(inv));
  const hl = halved.lines.find((l) => l.kind === LINE_KINDS.LEFT_BEHIND);
  hl.amount = Number((hl.amount / 2).toFixed(2));
  halved.profit = Number(halved.lines.reduce((s, l) => s + l.amount, 0).toFixed(2));
  const badLeft = M.reconcile(halved, game.state, opts);
  ok('T6 …and refuses a halved left-behind line, naming it', !badLeft.ok && badLeft.problems.some((p) => /items left behind/.test(p)), badLeft.problems.join(' | '));
  const oneLeg = JSON.parse(JSON.stringify(inv));
  const fl = oneLeg.lines.find((l) => l.kind === LINE_KINDS.FUEL);
  fl.amount = Number((-(ECONOMY.routeDistanceKm * ECONOMY.fuelPerKm)).toFixed(2));
  oneLeg.profit = Number(oneLeg.lines.reduce((s, l) => s + l.amount, 0).toFixed(2));
  const badFuel = M.reconcile(oneLeg, game.state, opts);
  ok('T6 …and refuses fuel for one leg on a two-trip job, naming vehicle/fuel', !badFuel.ok && badFuel.problems.some((p) => /vehicle\/fuel/.test(p)), badFuel.problems.join(' | '));

  const stats = contributionStats(game.state, { recoveries: opts.recoveries });
  eq('T6 contributionStats.trips === 2', stats.trips, 2);
  const sheet = M.invoiceScreen.el.textContent.replace(/\s+/g, ' ');
  ok('T6 …and the sheet prints trips 2', /trips\s*2\b/.test(sheet), sheet.slice(0, 200));
  const review = M.reviewFor(inv, game.state, summary, opts);
  lines.push(`      review (${review.grade}): "${review.text}"  tags: ${review.tags.join(', ')}`);
  ok('T6 the review carries extra_trip and items_left_behind (§15.2 actual event tags)',
     review.tags.includes('extra_trip') && review.tags.includes('items_left_behind'), review.tags.join(', '));
  const rs = M.runSummary();
  eq('T6 M.runSummary().counters.trips === 2 (was a constant 1)', rs.counters.trips, 2);
  near('T6 …and its invoice.profit is buildInvoice()\'s to the cent', rs.invoice ? rs.invoice.profit : NaN, inv.profit, 0.005);
}
emit('running...');

/* ── T7. reset semantics ──────────────────────────────────────────────────── */
lines.push('--- T7. "Run it again": trip 1 again, the closed run keeps its 2 (GDD §26.6, §27.4) ---');
{
  M.invoiceScreen.onReplay();
  eq('T7 tripCount === 1 after replay', game.state.tripCount, 1);
  eq('T7 …cargo.tripCount === 1', cargo.tripCount, 1);
  eq('T7 …route parked', route.state, 'parked');
  eq('T7 …heading \'out\'', route.status().heading, 'out');
  eq('T7 …phase pickup', game.state.phase, PHASES.PICKUP);
  eq('T7 …contractFacts().away === 23', M.contractFacts().away, 23);
  eq('T7 …liveRunSummary counters.trips === 1', M.runSummary().counters.trips, 1);
  const inv = M.buildInvoice(game.state, M.manifestSummary(game.state.manifest), invoiceOpts());
  const left = findLine(inv, LINE_KINDS.LEFT_BEHIND);
  ok('T7 a fresh state (0 of 23 delivered) prices all 23 as left behind, citing every row', !!left && left.from.length === 23, left ? `${left.from.length}` : 'no line');
  const rec = M.reconcile(inv, game.state, invoiceOpts());
  ok('T7 …and reconcile() agrees', rec.ok, rec.problems.join(' | '));
  ok('T7 recorder.lastRun.counters.trips === 2 — the closed run kept its number',
     !!M.recorder.lastRun && M.recorder.lastRun.counters && M.recorder.lastRun.counters.trips === 2,
     M.recorder.lastRun ? JSON.stringify(M.recorder.lastRun.counters.trips) : 'no lastRun');
}
emit('running...');

/* ── T8. the single-trip invoice is untouched ─────────────────────────────── */
lines.push('--- T8. one real drive, everything delivered: the single-trip invoice as it always was (m10 A3/A7, m14) ---');
{
  frames(60);
  atCab();
  interact.act(me());
  eq('T8 E at the cab departs, heading out', route.status().heading, 'out');
  frames(LEG);
  eq('T8 …arriving in DELIVERY on trip 1', `${game.state.phase}/${game.state.tripCount}`, 'delivery/1');
  // m10 cleanDelivery: every row into its own room, then long enough to settle and dwell.
  straps.releaseAll();
  const rooms = {};
  for (const row of game.state.manifest) {
    const e = registry.get(row.entityId);
    if (!e) continue;
    rooms[row.toZone] = (rooms[row.toZone] || 0) + 1;
    const s = slotIn(row.toZone, rooms[row.toZone] - 1);
    parkAt(e, s.x, e.def.dimensions.y / 2 + 0.06, s.z);
  }
  frames(260);
  let extra = 0;
  while (!M.manifestSummary(game.state.manifest).complete && extra < 200) { frames(1); extra++; }
  const summary = M.manifestSummary(game.state.manifest);
  ok('T8 the clean delivery completes', summary.complete, `${summary.delivered}/${summary.total} after ${260 + extra} frames`);
  const inv = M.buildInvoice(game.state, summary, invoiceOpts());
  const one = findLine(inv, LINE_KINDS.ONE_TRIP) || { amount: NaN };
  near('T8 ONE_TRIP 180.00', one.amount, ECONOMY.oneTripBonus, 0.005);
  eq('T8 …which is 180', one.amount, 180);
  const fuel = findLine(inv, LINE_KINDS.FUEL) || { amount: NaN, detail: '' };
  near('T8 FUEL -13.44 (1 leg x 4.2 x 3.2)', fuel.amount, -(ECONOMY.routeDistanceKm * ECONOMY.fuelPerKm), 0.005);
  eq('T8 …which is -13.44', Number(fuel.amount.toFixed(2)), -13.44);
  ok('T8 …detail /1 leg/', /1 leg\b/.test(fuel.detail), fuel.detail);
  ok('T8 no items-left-behind line', !findLine(inv, LINE_KINDS.LEFT_BEHIND));
  const rec = M.reconcile(inv, game.state, invoiceOpts());
  ok('T8 reconcile() ok', rec.ok, rec.problems.join(' | '));
  atCab();
  const d = interact.describe(me());
  ok('T8 …and the cab offers to settle with nothing away, no secondary (m11 E7, m14 cabPrompt)',
     /settle/.test(d.primary || '') && !/drive back/.test(d.primary || '') && d.secondary === null, `${d.primary} / ${d.secondary}`);
  ok('T8 …the bare "finish the job and settle up": nothing undelivered, nothing priced (M20 T3e is the priced case)',
     d.primary === 'finish the job and settle up', d.primary || '');
}
emit('running...');

/* ── T3d. the on-truck settlement, pressed for real (M20) ─────────────────── */
lines.push('--- T3d. the on-truck settlement pressed for real: the invoice bills the count the line named (M20: GDD §4.4, §15.1, §26.1) ---');
{
  /* T3b asserted the prompt and the invoice-on-this-state with the run still ahead of it; here
   * the key is pressed. T7's replay again, then one more real leg (the fifth): box 1 aboard,
   * delivered at the destination, box 2 loaded THERE — 21 away, 1 on the truck, 22 not
   * delivered — and Q. The invoice is the one settle() built and handed to the sheet, caught
   * at invoiceScreen.show the way T6 counts it. */
  M.invoiceScreen.onReplay();
  eq('T3d replayed: trip 1, pickup, 23 away', `${game.state.tripCount}/${game.state.phase}/${M.contractFacts().away}`, `1/${PHASES.PICKUP}/23`);
  frames(60);
  loadIntoTruck(box1);
  eq('T3d box 1 loaded at the old house', box1.state.loaded, true);
  atCab();
  interact.act(me());
  frames(LEG);
  eq('T3d …one leg later: arrived, DELIVERY, trip 1', `${route.state}/${game.state.phase}/${game.state.tripCount}`, `arrived/${PHASES.DELIVERY}/1`);
  deliver(box1);
  eq('T3d box 1 delivered', rowOf(box1).delivered, true);
  const dwell = loadIntoTruck(box2);
  eq('T3d box 2 loaded at the destination: 21 away, loaded', `${M.contractFacts().away}/${box2.state.loaded}`, '21/true');
  lines.push(`      box 2 loaded at the destination after ${dwell} frames`);
  atCab();
  const d = interact.describe(me());
  const want22 = (22 * ECONOMY.leftBehindFee).toFixed(2);
  eq('T3d the Q line before the key', d.secondary, `settle up — 22 not delivered (${want22}), 1 still on the truck`);
  const promised = interact.settlement();
  eq('T3d …settlement() 22/21/1/0', `${promised.n}/${promised.away}/${promised.inTruck}/${promised.atSite}`, '22/21/1/0');

  let payload = null;
  const offPayload = bus.on(EVENTS.CONTRACT_PHASE, (e) => { if (e.to === PHASES.SETTLEMENT) payload = e.validation; });
  const ownShow = Object.prototype.hasOwnProperty.call(M.invoiceScreen, 'show');
  const realShow = M.invoiceScreen.show;
  let shown = null, shows = 0;
  M.invoiceScreen.show = function (...args) { shows++; shown = args[0]; return realShow.apply(this, args); };
  const said = interact.secondary(me());
  offPayload();
  if (ownShow) M.invoiceScreen.show = realShow; else delete M.invoiceScreen.show;

  eq('T3d Q settles', game.state.phase, PHASES.SETTLEMENT);
  eq('T3d …and the notice names the count and the truck', said, 'settling up — 22 not delivered (1 still on the truck)');
  eq('T3d …the SETTLEMENT event carries the count the invoice bills: leftBehind 22, away 21, inTruck 1, atSite 0',
     JSON.stringify(payload), JSON.stringify({ ok: true, leftBehind: 22, away: 21, inTruck: 1, atSite: 0 }));
  ok('T3d the invoice settle() built reached the sheet, once', shows === 1 && !!shown && Array.isArray(shown.lines), `${shows} shows`);
  const left = (shown && findLine(shown, LINE_KINDS.LEFT_BEHIND)) || { amount: NaN, from: [], detail: '' };
  near(`T3d after Q the items-left-behind line is exactly 22 x ECONOMY.leftBehindFee = -${want22}`, left.amount, -22 * ECONOMY.leftBehindFee, 0.005);
  eq('T3d …which is -1320.00', Number(left.amount.toFixed(2)), -1320);
  eq('T3d …citing 22 rows', left.from.length, 22);
  ok('T3d …the on-truck row\'s id among them', left.from.includes(rowOf(box2).id), `${rowOf(box2).id} not in [${left.from.join(',')}]`);
  eq('T3d …exactly the set the line priced before the key (settlement().ids, deep-equal)',
     [...left.from].sort().join(','), [...promised.ids].sort().join(','));
  lines.push(`      ${left.detail}`);
  const rec = shown ? M.reconcile(shown, game.state, invoiceOpts()) : { ok: false, problems: ['no invoice'] };
  ok('T3d reconcile() agrees', rec.ok, rec.problems.join(' | '));
  near('T3d …and M.runSummary().invoice.profit is that invoice\'s to the cent', M.runSummary().invoice ? M.runSummary().invoice.profit : NaN, shown ? shown.profit : NaN, 0.005);
}
emit('running...');

/* ── T9. budget ───────────────────────────────────────────────────────────── */
lines.push('--- T9. budget: frames driven and sim time (tools/smoketest.ps1 240 s virtual time) ---');
{
  // Five legs: out (T2), back (T4), out again (T5), T8's single-trip drive after the replay,
  // and T3d's on-truck settlement after a second replay (M20).
  lines.push(`      game.frame() calls: ${framesTotal} (5 legs = ${5 * LEG} + ${framesTotal - 5 * LEG} fixture frames); ` +
             `game.clock.simTimeMs ${game.clock.simTimeMs.toFixed(0)} ms (since the T3d replay reset the clock)`);
  ok(`T9 five legs were driven through game.frame() (${framesTotal} >= ${5 * LEG}; was four before M20's T3d)`, framesTotal >= 5 * LEG, `${framesTotal}`);
  ok('T9 the suite ran inside the harness (this line printing is the proof); sim time under the 240 s budget', game.clock.simTimeMs < 240000, `${game.clock.simTimeMs.toFixed(0)} ms`);
  ok('T9 game.state stays JSON-serializable (tripCount a number, the heading lives on the route)',
     (() => { try { const s = JSON.parse(JSON.stringify(game.state)); return typeof s.tripCount === 'number'; } catch (e) { return false; } })());
}
} catch (e) {
  fails++;
  lines.push(`FAIL  uncaught  <- ${e && e.message}`);
  lines.push((e && e.stack || '').split('\n').slice(0, 6).join('\n'));
}

emit();
