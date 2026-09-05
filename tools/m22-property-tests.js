/* Phase 11 build-side M14 suite — property damage is priced.
 *
 * §15.1 lists "property damage" as its own line and §8.4 wants it attributable to a LOCATION;
 * for nine phases DAMAGE.property was tuned and unread, ledger.propertyDamage had three readers
 * and no writer, and §8.2's whole preparation-versus-brute-force trade was priced on one side
 * only. This suite is the other side.
 *
 * THE CLAIMS UNDER TEST:
 *
 *   NO PHANTOMS    §10.4 — objects settling onto floors bill nothing; floors, the ground, the
 *                  deck, the ramp and the porch step are never billable (PD0, PD5, PD7).
 *   ATTRIBUTED     §8.4 — a throw into the front wall writes ONE line naming 'wall' / 'front
 *                  wall', the impulse is the object's own m·Δv, the contact point and the
 *                  surface normal are where the mark goes (PD2, PD4, PD5).
 *   ONE ENTRY      §26.4 / §8.3 — one ledger line, one event, one notice per impact; a second
 *                  hit inside the aggregation window merges (PD3).
 *   CAPPED         §8.3 "maximum charge" — a surface stops at 400.00 to the cent (PD6).
 *   ON THE INVOICE §15.1 / §25.2 "ledger matches events" — the line, its evidence, and a
 *                  reconcile() that refuses a tampered one (PD8, PD9); the review tag, the
 *                  stats row and the run counters (PD10, PD11).
 *   BOUNDED        §26.6 — reset empties both ledgers and every mark; 40 hits fill a 24-quad
 *                  ring and add no scene child (PD12, PD13).
 *   HONEST STATE   §22.4 — the ledger is plain data and identical with the audio detached
 *                  (PD14); nothing here ends a contract (§12.2, PD15).
 *
 * Fixtures: m8's step()/parkAt()/byDef (tools/m8-tests.js), m11 G13's TV drop, m17 R6's
 * scripted run. Every number below is measured, not preferred.
 */

import { SIM, DAMAGE } from '../src/config.js';
import { TRUCK_POSE, cargoInterior } from '../src/world/truck.js';
import { billable, labelFor } from '../src/damage/surfaces.js';
import { propertyBandFor, propertyCost, repairCost } from '../src/damage/damage.js';
import { LINE_KINDS } from '../src/contract/invoice.js';
import { EVENTS, PHASES } from '../src/core/eventBus.js';
import { APERTURES } from '../src/render/scene.js';

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

const { game, physics, registry, straps, cargo, damage, world } = M;
const bus = game.bus;
const STEP = SIM.stepMs;
const FRAME = 16.667;
const I = cargoInterior();
const P = DAMAGE.property;

/* ── drivers (m8 lineage) ─────────────────────────────────────────────────── */
/** A monotonic sim time for the hand-driven steps: never behind the game clock, never 0. */
let T = Math.max(1000, game.clock.simTimeMs);
function step(n = 1) {
  for (let i = 0; i < n; i++) {
    T = Math.max(T + STEP, game.clock.simTimeMs + STEP);
    physics.clearForces();
    straps.step(STEP, T);
    physics.step();
    registry.step(STEP);
    cargo.step(STEP, T);
    damage.step(STEP, T);
  }
}
function frames(n) { for (let k = 0; k < n; k++) game.frame(FRAME); }
function parkAt(entity, x, y, z, yaw = 0) {
  entity.body.setTranslation({ x, y, z }, true);
  entity.body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
  entity.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  entity.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  entity.body.wakeUp();
  physics.primeQueries();
}
function throwAt(entity, vx, vy, vz) {
  entity.body.setLinvel({ x: vx, y: vy, z: vz }, true);
  entity.body.wakeUp();
}
const byDef = (id) => { for (const e of registry.entities.values()) if (e.defId === id) return e; return null; };
const allOfDef = (id) => [...registry.entities.values()].filter((e) => e.defId === id);
const prop = () => game.state.ledger.propertyDamage;
const items = () => game.state.ledger.itemDamage;
const sumCost = (ls) => Number(ls.reduce((s, l) => s + l.cost, 0).toFixed(2));
function drainNotices() { const n = M.pendingNotices.length; M.pendingNotices.splice(0, n); return n; }
const wallNotices = () => M.pendingNotices.filter((n) => n.kind === 'damage' && /front wall — /.test(n.text));
/** A fresh run: the real §26.6 reset, counters and ledgers at zero, clock at zero. */
function freshRun() {
  if (M.invoiceScreen.visible) M.invoiceScreen.onReplay(); else { M.resetContract(); game.setPaused(false); }
  drainNotices();
}
const R = physics.R;

/** Spy: every property DAMAGE_APPLIED the bus carried, as stamped. */
const propEvents = [];
bus.on(EVENTS.DAMAGE_APPLIED, (e) => { if (e.category === 'property') propEvents.push(e); });

/** The numbers §26.6 compares: read at boot, before anything moves. */
const bootChildren = world.scene.children.length;
const bootBodies = physics.stats.bodies;

try {
/* ── PD0. no phantom property damage (§10.4) ──────────────────────────────── */
lines.push('--- PD0. objects settling bill nothing (GDD §10.4) ---');
{
  frames(120);
  ok('PD0 120 game.frame() after boot: game.state.ledger.propertyDamage.length === 0 and damage._openProp.size === 0',
     prop().length === 0 && damage._openProp.size === 0,
     `${prop().length} lines, ${damage._openProp.size} open windows`);
  lines.push(`      boot: ${bootBodies} bodies, ${world.scene.children.length} scene children, ${registry.count} registry rows`);
}

/* ── PD1. the tag map is total ────────────────────────────────────────────── */
lines.push('--- PD1. every static collider answers with its tag (§8.4 "location") ---');
{
  const statics = M.statics;
  const bad = [];
  for (const c of world.colliders) {
    const s = statics.find((r) => r.tag === c.tag && physics.tagOf(r.collider) === c.tag);
    if (!s) bad.push(String(c.tag));
  }
  ok('PD1 for every record of M.world.colliders there is a static collider with physics.tagOf(handle) === c.tag',
     bad.length === 0 && statics.length === world.colliders.length,
     `${bad.slice(0, 5).join(',')} (${statics.length} statics vs ${world.colliders.length} records)`);
  ok('PD1a …by handle as well as by collider', statics.every((r) => physics.tagOf(r.collider.handle) === r.tag));
  const ground = physics.statics.find((r) => r.tag === 'ground');
  eq('PD1b tagOf(ground collider) === "ground"', ground ? physics.tagOf(ground.collider) : null, 'ground');
  const ramp = physics.statics.find((r) => r.tag === 'ramp');
  eq('PD1b …and the ramp is "ramp"', ramp ? physics.tagOf(ramp.collider) : null, 'ramp');
  eq('PD1c an entity collider is nobody\'s static (null, like registry.fromCollider for a wall)',
     physics.tagOf(byDef('box_small_01').collider), null);
  ok('PD1d billable: wall, doorHeader_living_kitchen, truckHeadboard, partition_wall_living_back',
     billable('wall') && billable('doorHeader_living_kitchen') && billable('truckHeadboard') && billable('partition_wall_living_back'));
  const free = ['ground', 'ramp', 'truckDeck', 'destFloor', 'porchStep', 'ledgeLow', 'ledgeHigh', 'tooTall'];
  ok('PD1e …and ground, ramp, truckDeck, destFloor, porchStep (and the ledges) are all free',
     free.every((t) => !billable(t)), free.filter(billable).join(','));
  const headers = world.colliders.map((c) => String(c.tag)).filter((t) => /^doorHeader/.test(t));
  const apertureHeaders = APERTURES.map((a) => `doorHeader_${a.id}`);
  ok('PD1f M.world.colliders carries doorHeader_<aperture id> for all three front apertures and zero bare "doorHeader"',
     apertureHeaders.every((t) => headers.includes(t)) && !headers.includes('doorHeader'),
     headers.join(','));
  eq('PD1g labelFor: wall → front wall', labelFor('wall'), 'front wall');
  eq('PD1g …doorHeader_living_kitchen → living_kitchen door frame', labelFor('doorHeader_living_kitchen'), 'living_kitchen door frame');
  eq('PD1g …doorHeader_door34 → door34 door frame', labelFor('doorHeader_door34'), 'door34 door frame');
  eq('PD1g …partition_wall_living_back → living room back wall', labelFor('partition_wall_living_back'), 'living room back wall');
  eq('PD1g …truckHeadboard → truck headboard', labelFor('truckHeadboard'), 'truck headboard');
  ok('PD1h the property bands are ascending and the config carries the M14 keys',
     P.minStepImpulse === 1.5 && P.bands.length === 3 && P.bands[0].min === 12 && P.bands[1].min === 40 && P.bands[2].min === 100 &&
     P.decals.max === 24 && propertyBandFor(36).name === 'scuffed' && propertyBandFor(44).name === 'dented' && propertyBandFor(110).name === 'holed',
     JSON.stringify(P));
}
emit('PD2...');

/* ── PD2/PD3. a throw into the front wall ─────────────────────────────────── */
lines.push('--- PD2-PD3. one throw, one line, one event, one notice (GDD §8.4, §26.4) ---');
let line2 = null;
const box = allOfDef('box_small_01')[0];
const box2 = allOfDef('box_small_01')[1];
{
  freshRun();
  propEvents.length = 0;
  // Resting on the floor FIRST, so the settle step and the wall step are distinct.
  parkAt(box, 1.60, 0.27, -1.50);
  step(30);
  const restLines = prop().length;
  const massBox = box.body.mass();
  const speedBefore = Math.hypot(box.body.linvel().x, box.body.linvel().y, box.body.linvel().z);
  throwAt(box, 0, 0, -4.0);
  step(90);
  damage.flush(T);
  const L = prop();
  line2 = L[L.length - 1] || null;
  lines.push(`      box_small_01 ${massBox.toFixed(3)} kg at rest (${speedBefore.toFixed(3)} m/s) thrown at 4.0 m/s into the front wall: ` +
             `${L.length} line(s) ${JSON.stringify(line2)}`);
  eq('PD2 a throw into the front wall writes exactly one property line', L.length - restLines, 1);
  ok('PD2a …surfaceId "wall", location "front wall", category "property", entityId the box',
     !!line2 && line2.surfaceId === 'wall' && line2.location === 'front wall' && line2.category === 'property' && line2.entityId === box.id,
     line2 ? `${line2.surfaceId} / ${line2.location} / ${line2.category} / ${line2.entityId}` : 'no line');
  ok('PD2b …impulse in [28, 37] N·s — m·Δv, 9 kg × ~4.0 m/s less the rebound',
     !!line2 && line2.impulse >= 28 && line2.impulse <= 37, line2 ? `${line2.impulse}` : 'no line');
  eq('PD2c …band "scuffed" (config: 12 <= impulse < 40)', line2 && line2.band, 'scuffed');
  near('PD2d …cost === (impulse − 12) × 1.6 to the cent',
       line2 ? line2.cost : -1, line2 ? Number(((line2.impulse - P.impulseThreshold) * P.costPerImpulse).toFixed(2)) : 0, 0.01);
  near('PD2d …which is propertyCost() (closed form)', line2 ? line2.cost : -1, line2 ? Number(propertyCost(line2.impulse).toFixed(2)) : 0, 0.01);
  ok('PD2e …the contact point is on the wall\'s outer face (|at.z − (−1.91)| < 0.30)',
     !!line2 && Math.abs(line2.at.z - (-1.91)) < 0.30, line2 ? `${line2.at.z}` : 'no line');
  ok('PD2f …and the normal points away from the wall toward the object (normal.z > 0.9)',
     !!line2 && line2.normal.z > 0.9, line2 ? JSON.stringify(line2.normal) : 'no line');
  ok('PD2g …timeMs > 0 (the window opened on the clock)', !!line2 && line2.timeMs > 0, line2 ? `${line2.timeMs}` : 'no line');
  near('PD2h body.mass() is the definition\'s 9 kg within 1 % (density never halved the impulse)', massBox, 9, 0.09);
  ok('PD2i …and nothing was billed for resting on the floor first (§10.4)', restLines === 0, `${restLines}`);
  ok('PD2j …peakStepImpulse <= impulse and heldBy is an (empty) array — nobody was holding it',
     !!line2 && line2.peakStepImpulse <= line2.impulse + 1e-9 && Array.isArray(line2.heldBy) && line2.heldBy.length === 0);

  // PD3 — the event and the notice, one each.
  eq('PD3 exactly one DAMAGE_APPLIED with category "property" was emitted', propEvents.length, 1);
  const ev = propEvents[0];
  ok('PD3a …stamped simTimeMs >= its timeMs > 0 (m11 T2b pattern) and carrying position = at',
     !!ev && ev.simTimeMs >= ev.timeMs && ev.timeMs > 0 && ev.position && ev.position.z === line2.at.z,
     ev ? `${ev.simTimeMs} >= ${ev.timeMs}` : 'no event');
  const wn = wallNotices();
  const m = wn.length === 1 ? /front wall — scuffed · (\d+\.\d\d)/.exec(wn[0].text) : null;
  ok('PD3b M.pendingNotices holds exactly one kind "damage" notice matching /front wall — scuffed · \\d+\\.\\d\\d/ with the line\'s cost',
     wn.length === 1 && !!m && line2 && m[1] === line2.cost.toFixed(2),
     `${wn.length} notice(s): ${wn.map((n) => n.text).join(' | ')}`);
}
emit('PD4...');

/* ── PD4. the door frame the task names ───────────────────────────────────── */
lines.push('--- PD4. the living_kitchen door frame (house.js: 0.86 m at z -5.0, header 2.03..2.70) ---');
{
  drainNotices();
  const before = prop().length;
  parkAt(box2, 2.60, 2.40, -4.55);
  throwAt(box2, 0, 0, -4.0);
  step(60);
  damage.flush(T);
  const L = prop();
  const l4 = L.find((l, i) => i >= before && l.entityId === box2.id) || null;
  lines.push(`      box2 at (2.60, 2.40, -4.55) thrown at 4.0 m/s: ${L.length - before} new line(s) ${JSON.stringify(l4)}`);
  ok('PD4 one line with surfaceId "doorHeader_living_kitchen" and location "living_kitchen door frame"',
     !!l4 && l4.surfaceId === 'doorHeader_living_kitchen' && l4.location === 'living_kitchen door frame',
     l4 ? `${l4.surfaceId} / ${l4.location}` : `no line for box2 (${L.slice(before).map((l) => l.surfaceId).join(',')})`);
  ok('PD4a …the notice text starts with "living_kitchen door frame"',
     M.pendingNotices.some((n) => n.kind === 'damage' && n.text.startsWith('living_kitchen door frame')),
     M.pendingNotices.map((n) => n.text).join(' | '));
  ok('PD4b …and the contact is up at the header (at.y in [2.03, 2.70], |at.z + 4.94| < 0.30)',
     !!l4 && l4.at.y >= 2.0 && l4.at.y <= 2.75 && Math.abs(l4.at.z + 4.94) < 0.30, l4 ? JSON.stringify(l4.at) : 'no line');
}
emit('PD8...');

/* ── PD8-PD11. the §15.1 line, the gate, the counters, the review ─────────── */
lines.push('--- PD8-PD11. the invoice line, reconcile(), the recorder and the review (GDD §15.1, §15.2, §25.2) ---');
{
  const L = prop();
  const summary = M.manifestSummary(game.state.manifest);
  const inv = M.buildInvoice(game.state, summary, {});
  const propLines = inv.lines.filter((l) => l.kind === LINE_KINDS.PROPERTY_DAMAGE);
  const pl = propLines[0];
  for (const l of inv.lines) lines.push(`      ${l.kind.padEnd(22)} ${l.amount.toFixed(2).padStart(9)}   ${l.detail}`);
  eq('PD8 after PD2+PD4 the invoice has exactly one line of kind PROPERTY_DAMAGE', propLines.length, 1);
  near('PD8a …amount === −(Σ propertyDamage cost) to the cent', pl ? pl.amount : 0, -sumCost(L), 0.01);
  eq('PD8b …from.length === propertyDamage.length (one citation per entry)', pl ? pl.from.length : -1, L.length);
  ok('PD8c …detail matches /2 impacts on 2 surfaces/', !!pl && /2 impacts on 2 surfaces/.test(pl.detail), pl ? pl.detail : 'no line');
  const il = inv.lines.find((l) => l.kind === LINE_KINDS.ITEM_DAMAGE);
  const boxItem = items().filter((l) => l.entityId === box.id);
  lines.push(`      box item lines: ${JSON.stringify(boxItem.map((l) => [l.band, l.cost, l.peakSpeed]))}; item ledger ${items().length} lines ${sumCost(items()).toFixed(2)}`);
  ok('PD8d the ITEM line for the box is separate: cracked, (4.0−2.0)×26 = 52 points, cost 0.35×40 − 0 = 14.00',
     boxItem.length === 1 && boxItem[0].band === 'cracked' && boxItem[0].cost === 14 &&
     boxItem[0].cost === Number((repairCost(box.def, boxItem[0].conditionAfter) - repairCost(box.def, boxItem[0].conditionBefore)).toFixed(2)),
     JSON.stringify(boxItem));
  near('PD8e …and the item line is exactly the item ledger, unchanged by the property line (§15.1 two lines)',
       il ? il.amount : 0, -sumCost(items()), 0.01);
  const rec = M.reconcile(inv, game.state, {});
  ok('PD8f reconcile(inv, state, {}).ok === true', rec.ok, rec.problems.join(' | '));

  // PD9 — the gate is real for the new line.
  const s2 = JSON.parse(JSON.stringify(game.state)); s2.ledger.propertyDamage.pop();
  const bad1 = M.reconcile(inv, s2, {});
  ok('PD9a delete one propertyDamage entry after building the invoice → reconcile not ok, naming "property damage"',
     !bad1.ok && bad1.problems.some((p) => /property[ -]damage/.test(p)) && bad1.problems.some((p) => p.includes('cites 2 events, ledger has 1')),
     bad1.problems.join(' | '));
  const inv2 = JSON.parse(JSON.stringify(inv));
  const pl2 = inv2.lines.find((l) => l.kind === LINE_KINDS.PROPERTY_DAMAGE);
  pl2.amount = Number((pl2.amount - 1).toFixed(2)); inv2.profit = Number((inv2.profit - 1).toFixed(2));
  const bad2 = M.reconcile(inv2, game.state, {});
  ok('PD9b a property amount off by 1.00 → not ok', !bad2.ok && bad2.problems.some((p) => p.includes('property damage')), bad2.problems.join(' | '));
  const s3 = JSON.parse(JSON.stringify(game.state)); s3.ledger.propertyDamage = [];
  const bad3 = M.reconcile(inv, s3, {});
  ok('PD9c an empty ledger with a property line → "exists with nothing in the ledger"',
     !bad3.ok && bad3.problems.some((p) => p.includes('exists with nothing in the ledger')), bad3.problems.join(' | '));
  const tampered = JSON.parse(JSON.stringify(inv));
  tampered.lines = tampered.lines.filter((l) => l.kind !== LINE_KINDS.PROPERTY_DAMAGE);
  tampered.lines.push({ kind: LINE_KINDS.PROPERTY_DAMAGE, amount: pl.amount, detail: 'invented', from: [] });
  const bad4 = M.reconcile(tampered, game.state, {});
  ok('PD9d …and a property line citing no event still reports "cites no event" (m10 B10/B11)',
     !bad4.ok && bad4.problems.some((p) => p.includes('cites no event')), bad4.problems.join(' | '));

  // PD10 — recorder and summary (M6).
  const c = game.state.telemetry.counters;
  ok('PD10 counters.propertyEvents === propertyDamage.length and counters.damageEvents === itemDamage.length (m17 R1c preserved)',
     c.propertyEvents === L.length && c.damageEvents === items().length && L.length === 2,
     `property ${c.propertyEvents}/${L.length}, damage ${c.damageEvents}/${items().length}`);
  const rs = M.runSummary();
  ok('PD10a M.runSummary().counters has key propertyEvents, equal to the ledger',
     'propertyEvents' in rs.counters && rs.counters.propertyEvents === L.length, JSON.stringify(rs.counters));
  eq('PD10b contributionStats(state).propertyEvents === propertyDamage.length', M.contributionStats(game.state).propertyEvents, L.length);
  drainNotices();
  M.settle();
  const text = M.invoiceScreen.el.textContent;
  ok('PD10c after M.settle() the sheet shows "property damage" and "surfaces marked"',
     M.invoiceScreen.visible && text.includes('property damage') && text.includes('surfaces marked'),
     text.replace(/\s+/g, ' ').slice(0, 160));

  // PD11 — review tags (§15.2). The live run also broke box2 (it fell 2.4 m after the
  // header), left everything behind and lost money — three louder tags — so the tag is
  // asserted on the same property ledger with those quieted, and the live top three printed.
  const live = M.reviewFor(inv, game.state, summary, {});
  lines.push(`      live review: ${live.tags.join(', ')} — "${live.text}"`);
  const rv = M.reviewFor({ ...inv, profit: 10 }, { ...game.state, ledger: { ...game.state.ledger, itemDamage: [] }, doors: null, tripCount: 1 },
    { complete: true, delivered: 23, total: 23, roomAccuracy: 1, roomCorrect: 23 }, {});
  ok('PD11 with property cost > 0 reviewFor(...).tags includes "marked_the_walls"', rv.tags.includes('marked_the_walls'), rv.tags.join(','));
  ok('PD11c …with its curated template when it is the most salient thing', rv.tags[0] === 'marked_the_walls' && /mark/.test(rv.text), rv.text);
  const quiet = M.reviewFor(inv, { ...game.state, ledger: { ...game.state.ledger, propertyDamage: [] } }, summary, {});
  ok('PD11a …and not with an empty property ledger', !quiet.tags.includes('marked_the_walls'), quiet.tags.join(','));
  const both = M.reviewFor({ ...inv, profit: 10 },
    { ...game.state, tripCount: 1, doors: null,
      ledger: { itemDamage: [{ entityId: 'x', band: 'broken', cost: 900 }], propertyDamage: [{ surfaceId: 'wall', cost: 38.4 }], fees: [], bonuses: [] },
      manifest: [] },
    { complete: true, delivered: 1, total: 1, roomAccuracy: 1, roomCorrect: 1 }, {});
  ok('PD11b …and it never displaces broke_something_expensive when both apply (salience order)',
     both.tags[0] === 'broke_something_expensive' && both.tags.includes('marked_the_walls'), both.tags.join(','));

  // An intermediate replay: PD12's predicate, on the way to the next fixtures.
  M.invoiceScreen.onReplay();
  ok('PD12a onReplay() after PD2/PD4: propertyDamage 0, _openProp 0, scuffs.count 0, PICKUP and running',
     prop().length === 0 && damage._openProp.size === 0 && M.scuffs.count === 0 && game.state.phase === PHASES.PICKUP && !game.state.paused,
     `${prop().length} / ${damage._openProp.size} / ${M.scuffs.count} / ${game.state.phase}`);
  drainNotices();
}
emit('PD7...');

/* ── PD7. floors stay free ────────────────────────────────────────────────── */
lines.push('--- PD7. floors are free: the m11 G13 TV drop (GDD §10.4) ---');
{
  const tv = byDef('tv_55_01');
  const i0 = items().length, p0 = prop().length;
  parkAt(tv, -38, tv.def.dimensions.y / 2 + 1.5, 30, Math.PI / 2);
  frames(150);
  damage.flush(game.clock.simTimeMs);
  ok('PD7 the TV dropped 1.5 m onto the driveway: itemDamage.length >= 1 and propertyDamage.length === 0',
     items().length - i0 >= 1 && prop().length === p0 && p0 === 0,
     `item +${items().length - i0}, property ${prop().length} (was ${p0}); TV condition ${tv.state.condition}`);
  lines.push(`      TV after the drop: condition ${tv.state.condition.toFixed(1)} (${items().slice(i0).map((l) => l.band).join(',')})`);
}
emit('PD3 merge...');

/* ── PD3 (continued). a second hit inside the window merges ───────────────── */
lines.push('--- PD3c. aggregation: a second throw inside DAMAGE.aggregationWindowMs merges (GDD §8.3) ---');
{
  drainNotices();
  const p0 = prop().length;
  propEvents.length = 0;
  parkAt(box, 1.60, 0.27, -1.50);
  box.state.condition = 100;
  step(30);
  throwAt(box, 0, 0, -4.0);
  step(20);                       // 333 ms: inside the 700 ms window
  /* Parked back 0.16 m off the wall for the second throw: a velocity SET on a body already
   * touching the wall is killed inside the same step and the speed delta never sees it (a
   * fixture artefact — a real object accelerates over steps). */
  parkAt(box, 1.60, 0.27, -1.50);
  throwAt(box, 0, 0, -4.0);
  step(90);
  damage.flush(T);
  const L = prop().slice(p0);
  lines.push(`      two throws 333 ms apart: ${L.length} line(s) ${JSON.stringify(L.map((l) => [l.surfaceId, l.impulse, l.cost]))}`);
  ok('PD3c a second throw at the same spot within 700 ms merges: still 1 line, impulse increased, one event',
     L.length === 1 && L[0].impulse > line2.impulse && propEvents.length === 1 && L[0].peakStepImpulse < L[0].impulse,
     `${L.length} lines, impulse ${L.length ? L[0].impulse : '-'} vs ${line2 && line2.impulse}, ${propEvents.length} events`);
}
emit('PD5...');

/* ── PD5. the truck is billable, the deck is not ──────────────────────────── */
lines.push('--- PD5. truck headboard yes, truck deck no (m8 pack layout) ---');
{
  drainNotices();
  const heavy = byDef('box_heavy_01');
  const p0 = prop().length;
  /* 0.29 m from the headboard, not the brief's 1.0 m: MEASURED, the 0.78-friction box on the
   * 0.32 deck (Average 0.55, 5.4 m/s²) thrown at 3 m/s from 0.79 m stops at z 12.289 as it
   * touches the headboard — v 0.000, headboard impulse 0.00, no hit to bill. From 0.29 m it
   * arrives at ~2.4 m/s. */
  parkAt(heavy, TRUCK_POSE.x, I.minY + 0.23, I.maxZ - 0.5);
  step(30);
  const settled = prop().length - p0;
  throwAt(heavy, 0, 0, 3.0);
  step(90);
  damage.flush(T);
  const l5 = prop().slice(p0).find((l) => l.entityId === heavy.id) || null;
  lines.push(`      box_heavy_01 ${heavy.body.mass().toFixed(2)} kg (mu ${heavy.collider.friction().toFixed(2)}) at 3 m/s from 0.29 m into the headboard: ${JSON.stringify(l5)}`);
  ok('PD5 a heavy box slid at 3 m/s into the headboard: surfaceId "truckHeadboard", location "truck headboard"',
     !!l5 && l5.surfaceId === 'truckHeadboard' && l5.location === 'truck headboard' && settled === 0,
     l5 ? `${l5.surfaceId} / ${l5.location} (settle lines ${settled})` : `no line (${prop().slice(p0).map((l) => l.surfaceId).join(',')})`);
  eq('PD5a …its band by the config table', l5 && l5.band, l5 ? propertyBandFor(l5.impulse).name : null);
  const p1 = prop().length;
  parkAt(heavy, TRUCK_POSE.x, I.minY + 0.21 + 0.5, I.maxZ - 1.6);
  step(90);
  damage.flush(T);
  eq('PD5b the same box dropped 0.5 m onto the deck: propertyDamage unchanged (the deck is free)', prop().length, p1);
  const deckItem = items().filter((l) => l.entityId === heavy.id);
  lines.push(`      deck drop: ${deckItem.length} item line(s) for the box, property ${prop().length} (was ${p1})`);
}
emit('PD6...');

/* ── PD6. §8.3 maximum charge ─────────────────────────────────────────────── */
lines.push('--- PD6. a surface stops at DAMAGE.property.maxChargePerSurface (GDD §8.3 "maximum charge") ---');
{
  const xs = [0.9, 1.5, 2.1];
  const posted = [];
  let throws = 0;
  const wallSum = () => sumCost(prop().filter((l) => l.surfaceId === 'wall'));
  for (let k = 0; k < 20 && wallSum() < P.maxChargePerSurface - 0.005; k++) {
    const n0 = prop().length;
    parkAt(box, xs[k % 3], 0.27, -1.50);
    box.state.condition = 100;      // keep the box's own band honest per throw; it broke on the first
    step(5);
    throwAt(box, 0, 0, -6.0);
    step(60);
    damage.flush(T);
    throws++;
    for (const l of prop().slice(n0)) if (l.surfaceId === 'wall') posted.push({ throw: throws, impulse: l.impulse, cost: l.cost, band: l.band });
  }
  const total = wallSum();
  lines.push(`      ${throws} throws at 6 m/s: ${posted.map((p) => `${p.cost.toFixed(2)} (${p.impulse} N·s, ${p.band})`).join(', ')} = ${total.toFixed(2)}`);
  near('PD6 Σ cost for surfaceId "wall" === 400.00 ± 0.01', total, P.maxChargePerSurface, 0.01);
  // Σ previous is EVERY earlier 'wall' line on the ledger — PD3c's merged throw is one.
  const wallLines = prop().filter((l) => l.surfaceId === 'wall');
  const last = wallLines[wallLines.length - 1];
  const prev = Number(wallLines.slice(0, -1).reduce((s, l) => s + l.cost, 0).toFixed(2));
  near('PD6a the last posted line\'s cost === 400 − Σ previous, to the cent', last ? last.cost : -1, Number((P.maxChargePerSurface - prev).toFixed(2)), 0.005);
  ok('PD6b every line\'s cost > 0 (a window that rounds to nothing writes nothing)', posted.length >= 2 && wallLines.every((l) => l.cost > 0), `${posted.length} lines`);
  ok('PD6c …and the throws were real: the first line is "dented" (40 <= 9 kg × ~5.6 m/s < 100)', posted.length > 0 && posted[0].impulse >= 40 && posted[0].band === 'dented', posted[0] ? `${posted[0].impulse} ${posted[0].band}` : '-');
  // One more hit on the capped wall: no line, no event, no notice.
  drainNotices();
  const n1 = prop().length, e1 = propEvents.length, w1 = wallNotices().length;
  parkAt(box, 1.5, 0.27, -1.50);
  box.state.condition = 100;
  step(5);
  throwAt(box, 0, 0, -6.0);
  step(60);
  damage.flush(T);
  ok('PD6d one further hit on the capped wall posts no line, no event, no notice',
     prop().length === n1 && propEvents.length === e1 && wallNotices().length === w1,
     `lines ${prop().length - n1}, events ${propEvents.length - e1}, notices ${wallNotices().length - w1}`);
  ok('PD6e …the capped surface does not stop a DIFFERENT surface: the door-frame line from PD4 was never involved',
     prop().every((l) => l.surfaceId === 'wall' || l.cost > 0));
}
emit('PD15...');

/* ── PD15. nothing ends a contract (§12.2) ────────────────────────────────── */
lines.push('--- PD15. a capped wall plus a broken TV is an expensive afternoon, not a failure (GDD §12.2) ---');
{
  drainNotices();
  const summary = M.manifestSummary(game.state.manifest);
  M.settle();
  const text = M.invoiceScreen.el.textContent;
  const tv = byDef('tv_55_01');
  lines.push(`      settlement: property ${sumCost(prop()).toFixed(2)} over ${prop().length} lines, items ${sumCost(items()).toFixed(2)}, TV condition ${tv.state.condition.toFixed(1)}`);
  ok('PD15 M.settle() still shows the invoice, with LOSS', M.invoiceScreen.visible && /LOSS/.test(text) && game.state.phase === PHASES.SETTLEMENT,
     text.replace(/\s+/g, ' ').slice(0, 120));
  const inv = M.buildInvoice(game.state, summary, {});
  eq('PD15a invoice.complete === summary.complete (damage never decides completion)', inv.complete, summary.complete);
  ok('PD15b the phase never became "failed" and no #err-banner appeared',
     game.state.phase !== 'failed' && !document.getElementById('err-banner'));
}
emit('PD12...');

/* ── PD12. reset (§26.6) ──────────────────────────────────────────────────── */
lines.push('--- PD12. reset removes damage records and marks (GDD §26.6) ---');
{
  const marksBefore = M.scuffs.count;
  M.invoiceScreen.onReplay();
  ok('PD12 after PD2/PD4/PD6 onReplay(): propertyDamage.length === 0, damage._openProp.size === 0, M.scuffs.count === 0',
     prop().length === 0 && damage._openProp.size === 0 && M.scuffs.count === 0 && items().length === 0,
     `${prop().length} / ${damage._openProp.size} / ${M.scuffs.count} (marks before ${marksBefore})`);
  ok('PD12b …the marks were really there before the reset', marksBefore >= 5, `${marksBefore}`);
  ok('PD12c …and the registry and scene are back to boot (fragments and all gone)',
     physics.stats.bodies === bootBodies && world.scene.children.length === bootChildren,
     `bodies ${physics.stats.bodies} vs ${bootBodies}, children ${world.scene.children.length} vs ${bootChildren}`);
  drainNotices();
}
emit('PD13...');

/* ── PD13. the decal ring is bounded (§26.6) ──────────────────────────────── */
lines.push('--- PD13. 40 hits, 24 quads, zero new scene children (GDD §26.6 "no unbounded growth in decals") ---');
{
  const children0 = world.scene.children.length;
  /* Three surfaces in rotation at 2.5 m/s (≈ 22 N·s, ≈ 16 each): 14 hits a surface stays
   * well under the 400 cap, so all 40 post a line. The box is parked just off the floor so
   * the wall, not the floor, is what stops it, and its condition is reset per throw so it
   * never fragments (a fragment is a scene child). */
  const spots = [
    { at: [1.60, 0.40, -1.50], v: [0, 0, -2.5], tag: 'wall' },
    { at: [1.20, 0.40, -4.55], v: [0, 0, -2.5], tag: 'partition_wall_living_back' },
    { at: [-4.55, 0.40, -3.20], v: [-2.5, 0, 0], tag: 'roomWallW' },
  ];
  const p0 = prop().length;
  const perTag = {};
  for (let k = 0; k < 40; k++) {
    const s = spots[k % 3];
    const n0 = prop().length;
    parkAt(box, s.at[0], s.at[1], s.at[2]);
    box.state.condition = 100;
    throwAt(box, s.v[0], s.v[1], s.v[2]);
    step(60);
    damage.flush(T);
    for (const l of prop().slice(n0)) perTag[l.surfaceId] = (perTag[l.surfaceId] || 0) + 1;
  }
  const postedN = prop().length - p0;
  lines.push(`      40 throws: ${postedN} lines ${JSON.stringify(perTag)}, Σ ${sumCost(prop()).toFixed(2)}; scuffs.count ${M.scuffs.count}`);
  ok('PD13 40 throws over 40 × 60 steps → M.scuffs.count === Math.min(40, DAMAGE.property.decals.max) === 24',
     M.scuffs.count === Math.min(40, P.decals.max) && P.decals.max === 24 && postedN >= 24, `${M.scuffs.count}, ${postedN} lines posted`);
  ok('PD13a …every throw posted its line (40 of 40)', postedN === 40, `${postedN}`);
  eq('PD13b …world.scene.children.length === boot children', world.scene.children.length, bootChildren);
  ok('PD13c …and the ring never grew: pool.length === max, one Group, one material, one geometry',
     M.scuffs.pool.length === P.decals.max && M.scuffs.group.children.length === P.decals.max &&
     M.scuffs.pool.every((q) => q.material === M.scuffs.material && q.geometry === M.scuffs.geometry) && children0 === world.scene.children.length);
  ok('PD13d every scuff quad has userData.movable === true and userData.layer === "scuff" (m13 B1 exemption)',
     M.scuffs.pool.every((q) => q.userData.movable === true && q.userData.layer === 'scuff'));
  ok('PD13e …the material carries userData.layer, never userData.kind (m13 G12)',
     M.scuffs.material.userData.layer === 'scuff' && M.scuffs.material.userData.kind === undefined);
  const shown = M.scuffs.pool.filter((q) => q.visible);
  ok('PD13f …exactly 24 quads visible, each sized by its band and off the surface by `proud`',
     shown.length === 24 && shown.every((q) => q.scale.x > 0 && q.scale.x === q.scale.y),
     `${shown.length} visible, scales ${[...new Set(shown.map((q) => q.scale.x))].join(',')}`);
  // The last throw (k = 39) was the front wall: its mark is the most recent slot written.
  const lastQ = M.scuffs.pool[(M.scuffs._next + P.decals.max - 1) % P.decals.max];
  const front = prop().filter((l) => l.surfaceId === 'wall');
  const lastFront = front[front.length - 1];
  ok('PD13g the last mark sits on the front wall\'s outer face, proud by `proud` along the +z normal',
     !!lastFront && lastQ.visible && Math.abs(lastQ.position.z - (lastFront.at.z + P.decals.proud)) < 0.011 &&
     Math.abs(lastQ.position.x - lastFront.at.x) < 0.011 && Math.abs(lastQ.position.y - lastFront.at.y) < 0.011,
     `quad ${lastQ.position.x.toFixed(3)},${lastQ.position.y.toFixed(3)},${lastQ.position.z.toFixed(4)} vs at ${JSON.stringify(lastFront && lastFront.at)}`);
  M.settle();
  M.invoiceScreen.onReplay();
  ok('PD13h after onReplay() count 0 and children unchanged', M.scuffs.count === 0 && world.scene.children.length === bootChildren &&
     M.scuffs.pool.every((q) => !q.visible), `${M.scuffs.count} / ${world.scene.children.length}`);
  drainNotices();
}
emit('PD14...');

/* ── PD14. serializable, and identical with the audio detached ────────────── */
lines.push('--- PD14. plain data (§22.4) and audio-independence (m17 R6 pattern) ---');
{
  function scriptedRun() {
    freshRun();
    frames(20);
    parkAt(box, 1.60, 0.27, -1.50);
    frames(30);
    throwAt(box, 0, 0, -4.0);
    frames(90);
    damage.flush(game.clock.simTimeMs);
    return JSON.parse(JSON.stringify(game.state.ledger.propertyDamage));
  }
  const A = scriptedRun();
  const rt = JSON.parse(JSON.stringify(game.state.ledger));
  const leaves = [];
  const walk = (v, path) => {
    if (v === null || v === undefined) { leaves.push(path); return; }
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${path}[${i}]`)); return; }
    if (typeof v === 'object') { for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`); return; }
    if (typeof v !== 'number' && typeof v !== 'string') leaves.push(`${path}:${typeof v}`);
  };
  walk(rt.propertyDamage, 'propertyDamage');
  ok('PD14 JSON.parse(JSON.stringify(game.state.ledger)) round-trips with every propertyDamage leaf a number or string',
     A.length >= 1 && leaves.length === 0 && JSON.stringify(rt.propertyDamage) === JSON.stringify(game.state.ledger.propertyDamage),
     `${A.length} lines; odd leaves: ${leaves.slice(0, 4).join(',')}`);
  ok('PD14a game.state itself still serialises (m0 E8)', (() => { try { JSON.stringify(game.state); return true; } catch (e) { return false; } })());
  M.audio.detach();
  const B = scriptedRun();
  M.audio.attach(bus);
  const C = scriptedRun();
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  lines.push(`      attached: ${A.length} line(s) ${A.map((l) => l.cost).join(',')}; detached: ${B.length} ${B.map((l) => l.cost).join(',')}; re-attached: ${C.length}`);
  ok('PD14b with M.audio detached the same script produces a deep-equal property ledger', same(A, B) && B.length >= 1, `${JSON.stringify(A)} vs ${JSON.stringify(B)}`);
  ok('PD14c …and re-attached agrees too (the reset replays deterministically)', same(A, C));
}

/* ── Z. integration ───────────────────────────────────────────────────────── */
lines.push('--- Z. integration ---');
{
  freshRun();
  const b0 = physics.stats.bodies;
  frames(60);
  eq('Z1 no bodies leak over 60 frames', physics.stats.bodies, b0);
  eq('Z2 bodies are what they were at boot', physics.stats.bodies, bootBodies);
  eq('Z3 scene children are what they were at boot', world.scene.children.length, bootChildren);
  ok('Z4 no error banner appeared during the suite', !document.getElementById('err-banner'));
  ok('Z5 game.state stays plain data', (() => { try { JSON.parse(JSON.stringify(game.state)); return true; } catch (e) { return false; } })());
  void R;
}

} catch (e) {
  fails++;
  lines.push(`FAIL  suite threw  <- ${e && e.message}`);
  lines.push((e && e.stack || '').split('\n').slice(0, 6).join('\n'));
}

emit();
