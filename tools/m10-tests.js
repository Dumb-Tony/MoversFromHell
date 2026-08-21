/* Phase 10 suite — the economy.
 *
 * §25.2 gate under test: "Time, damage, bonuses, invoice, review" →
 * **ledger matches events**.
 *
 * That is a stronger claim than "the arithmetic is right", and the difference is the whole
 * phase. An invoice whose numbers add up but were computed at settlement from the final state
 * of the world does NOT match events — it agrees with them, which is not the same thing and
 * fails the moment the two diverge. So the assertions here are:
 *
 *   TRACEABLE     every line names the events it came from, and a line with no evidence is a
 *                 defect regardless of whether its number is plausible.
 *   DERIVED       item damage equals the §8.4 ledger the damage system wrote AS IMPACTS
 *                 HAPPENED, to the cent and event for event — never recomputed from an
 *                 object's final condition.
 *   COMPLETE      §15.1's formula is an addition, and the lines sum to the profit.
 *   HONEST        a charge cannot exist without the event that justifies it, and an event
 *                 cannot happen without producing its charge. Both directions are tested.
 */

import { SIM, ECONOMY, DAMAGE } from '../src/config.js';
import {
  buildInvoice, reconcile, reviewFor, contributionStats, gradeFor, LINE_KINDS,
} from '../src/contract/invoice.js';
import { manifestSummary, stepManifest } from '../src/contract/manifest.js';
import { DEST_ZONES, DEST_SHELL } from '../src/world/destination.js';

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
let M;
try { M = await window.__MFH_READY; }
catch (e) {
  fails++; lines.push(`FAIL  boot threw  <- ${e && e.message}`);
  lines.push((e && e.stack || '').split('\n').slice(0, 6).join('\n'));
  emit(); throw e;
}

const { game, physics, registry, straps, cargo, damage } = M;
const STEP = SIM.stepMs;
const rows = game.state.manifest;

function step(n = 1) {
  for (let i = 0; i < n; i++) {
    physics.clearForces();
    straps.step(STEP, i * STEP);
    physics.step();
    registry.step(STEP);
    cargo.step(STEP, i * STEP);
    damage.step(STEP, i * STEP);
    stepManifest(rows, registry, STEP);
  }
}
function parkAt(e, x, y, z) {
  e.body.setTranslation({ x, y, z }, true);
  e.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  e.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  e.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  e.body.wakeUp();
  physics.primeQueries();
}
const slotIn = (zoneId, index) => {
  const z = DEST_ZONES.find((r) => r.id === zoneId);
  const cols = 4;
  const w = (z.maxX - z.minX) - 1.2, d = (z.maxZ - z.minZ) - 1.2;
  return {
    x: z.minX + 0.6 + ((index % cols) + 0.5) * (w / cols),
    z: z.minZ + 0.6 + (Math.floor(index / cols) + 0.5) * (d / 2),
  };
};

/** Deliver the whole manifest correctly and reset the ledger, so each scenario starts clean. */
function cleanDelivery() {
  damage.reset();
  straps.releaseAll();
  const perRoom = {};
  for (const row of rows) {
    const e = registry.get(row.entityId);
    if (!e) continue;
    perRoom[row.toZone] = (perRoom[row.toZone] || 0) + 1;
    const s = slotIn(row.toZone, perRoom[row.toZone] - 1);
    parkAt(e, s.x, e.def.dimensions.y / 2 + 0.06, s.z);
  }
  step(240);
  damage.reset();                 // settling contacts are not part of the scenario
  step(20);
  const s = manifestSummary(rows);
  if (!s.complete) {
    const missing = rows.filter((r) => !r.delivered).map((r) => r.defId);
    lines.push(`      NOTE: clean delivery reached ${s.delivered}/${s.total} — missing ${missing.join(', ')}`);
  }
  return s;
}

/** Set the work clock to a given number of minutes. It is the only record of time (§2.3). */
function setWorked(minutes) { game.state.elapsedWorkMs = minutes * 60000; }

try {
/* ── A. §15.1's formula, line by line ────────────────────────────────────── */
lines.push('--- A. the invoice formula (GDD §15.1) ---');
{
  const summary = cleanDelivery();
  setWorked(14);
  game.state.tripCount = 1;
  const inv = buildInvoice(game.state, summary, { recoveries: 0, collisions: 0 });

  for (const l of inv.lines) {
    lines.push(`      ${l.kind.padEnd(22)} ${l.amount >= 0 ? ' ' : ''}${l.amount.toFixed(2).padStart(9)}   ${l.detail}`);
  }
  lines.push(`      ${'PROFIT'.padEnd(22)} ${inv.profit.toFixed(2).padStart(10)}   grade ${inv.grade.letter}`);

  ok('A1 the invoice has a base contract line (§15.1)', !!inv.lines.find((l) => l.kind === LINE_KINDS.BASE));
  ok('A2 …a labour line, because time is money (§2.3)',
     !!inv.lines.find((l) => l.kind === LINE_KINDS.LABOUR));
  ok('A3 …and a fuel line (§15.1 vehicle/fuel)',
     !!inv.lines.find((l) => l.kind === LINE_KINDS.FUEL));

  /* §15.1 is an ADDITION: "Profit = base contract + bonuses + tips - labor time - overtime
   * - vehicle/fuel - property damage - item damage - violations - recovery/service fees."
   * Nothing may be hidden inside the total. */
  const sum = inv.lines.reduce((s, l) => s + l.amount, 0);
  near('A4 the lines sum to the profit — §15.1 is an addition', sum, inv.profit, 0.01);

  ok('A5 a clean, quick job is profitable', inv.profit > 0, `${inv.profit}`);
  ok('A6 …and earns the efficiency bonus (§15.1 "graduated")',
     !!inv.lines.find((l) => l.kind === LINE_KINDS.EFFICIENCY));
  ok('A7 …and the one-trip bonus (§15.1 "all required cargo moved once")',
     !!inv.lines.find((l) => l.kind === LINE_KINDS.ONE_TRIP));
  ok('A8 …and the room-accuracy bonus for a perfect unload (§15.1)',
     !!inv.lines.find((l) => l.kind === LINE_KINDS.ROOM_ACCURACY));

  ok('A9 no line is charged that nothing happened to cause',
     !inv.lines.find((l) => l.kind === LINE_KINDS.ITEM_DAMAGE) &&
     !inv.lines.find((l) => l.kind === LINE_KINDS.RECOVERY) &&
     !inv.lines.find((l) => l.kind === LINE_KINDS.VIOLATIONS),
     inv.lines.map((l) => l.kind).join(', '));
}
emit('running...');

/* ── B. THE GATE: the ledger matches the events ──────────────────────────── */
lines.push('--- B. the gate: ledger matches events ---');
{
  const summary = cleanDelivery();
  setWorked(16);

  // Cause real damage, through real physics, and let the §8.4 ledger record it.
  const tv = [...registry.entities.values()].find((e) => e.defId === 'tv_55_01');
  const mirror = [...registry.entities.values()].find((e) => e.defId === 'mirror_framed_01');
  for (const e of [tv, mirror]) {
    if (!e) continue;
    e.state.condition = 100;
    parkAt(e, DEST_SHELL.minX + 1.5, e.def.dimensions.y / 2 + 1.4, DEST_SHELL.minZ + 1.2);
    for (let k = 0; k < 130; k++) { step(1); if (k > 25 && Math.abs(e.body.linvel().y) < 0.02) break; }
  }
  damage.flush();

  const ledger = game.state.ledger.itemDamage;
  const ledgerTotal = Number(ledger.reduce((s, l) => s + l.cost, 0).toFixed(2));
  lines.push(`      ${ledger.length} damage events on the ledger, ${ledgerTotal.toFixed(2)} total`);
  ok('B1 real impacts wrote real ledger lines (§8.4)', ledger.length > 0, `${ledger.length}`);

  const sum2 = manifestSummary(rows);
  const inv = buildInvoice(game.state, sum2, { recoveries: 2, collisions: 1 });

  const itemLine = inv.lines.find((l) => l.kind === LINE_KINDS.ITEM_DAMAGE);
  ok('B2 the invoice charges for it', !!itemLine);
  near('B3 …for exactly what the ledger recorded, to the cent',
       itemLine ? -itemLine.amount : 0, ledgerTotal, 0.01);
  eq('B4 …citing every single ledger event (§25.2 "ledger matches events")',
     itemLine ? itemLine.from.length : -1, ledger.length);

  /* EVERY line must name its evidence. A line whose number is plausible and whose provenance
   * is missing is exactly what this gate exists to catch. */
  const unevidenced = inv.lines.filter((l) => !l.from || l.from.length === 0);
  ok('B5 every line on the invoice names the events it came from',
     unevidenced.length === 0, unevidenced.map((l) => l.kind).join(', '));

  // …and reconcile() re-derives all of it from the records and agrees.
  const rec = reconcile(inv, game.state, { recoveries: 2, collisions: 1 });
  ok('B6 reconcile() re-derives every line from the event records — THE GATE',
     rec.ok, rec.problems.join(' | '));
  ok('B7 …and it actually checked all of them', rec.checked === inv.lines.length,
     `${rec.checked} of ${inv.lines.length}`);

  // Both directions: a fee cannot exist without its event.
  const recLine = inv.lines.find((l) => l.kind === LINE_KINDS.RECOVERY);
  near('B8 recovery fees equal the recoveries that happened (§18.3)',
       recLine ? -recLine.amount : 0, 2 * ECONOMY.recoveryFee, 0.01);
  const violLine = inv.lines.find((l) => l.kind === LINE_KINDS.VIOLATIONS);
  near('B9 …and violations equal the collisions that happened (§15.1)',
       violLine ? -violLine.amount : 0, ECONOMY.collisionFeeBase, 0.01);

  /* THE NEGATIVE. Hand reconcile() an invoice with a charge nothing caused, and it must say
   * so — otherwise it is a function that always returns true and the gate is worthless. */
  const tampered = JSON.parse(JSON.stringify(inv));
  tampered.lines.push({ kind: LINE_KINDS.PROPERTY_DAMAGE, amount: -250, detail: 'invented', from: [] });
  tampered.profit = Number((tampered.profit - 250).toFixed(2));
  const bad = reconcile(tampered, game.state, { recoveries: 2, collisions: 1 });
  ok('B10 …and it REFUSES an invoice with a charge nothing caused', !bad.ok,
     bad.problems.join(' | '));
  ok('B11 …naming the offending line', bad.problems.some((p) => p.includes('cites no event')),
     bad.problems.join(' | '));

  // And a ledger entry that never reached the invoice.
  const missing = JSON.parse(JSON.stringify(inv));
  missing.lines = missing.lines.filter((l) => l.kind !== LINE_KINDS.ITEM_DAMAGE);
  const bad2 = reconcile(missing, game.state, { recoveries: 2, collisions: 1 });
  ok('B12 …and one that quietly drops a ledger entry', !bad2.ok, bad2.problems.join(' | '));
}
emit('running...');

/* ── C. time is money, without a cliff (§2.3, §15.1) ─────────────────────── */
lines.push('--- C. time and overtime (GDD §2.3, §15.1) ---');
{
  const summary = cleanDelivery();
  const estimateMin = game.state.estimateMs / 60000;

  const at = (minutes) => {
    setWorked(minutes);
    return buildInvoice(game.state, summary, {});
  };
  const quick = at(estimateMin * 0.6);
  const onTime = at(estimateMin);
  const late = at(estimateMin * 1.5);

  lines.push(`      ${(estimateMin * 0.6).toFixed(0)} min: ${quick.profit.toFixed(2)} (${quick.grade.letter}) · ` +
             `${estimateMin.toFixed(0)} min: ${onTime.profit.toFixed(2)} (${onTime.grade.letter}) · ` +
             `${(estimateMin * 1.5).toFixed(0)} min: ${late.profit.toFixed(2)} (${late.grade.letter})`);

  ok('C1 finishing early pays better than finishing on time', quick.profit > onTime.profit);
  ok('C2 …and on time pays better than running over', onTime.profit > late.profit);
  ok('C3 overtime is charged at a multiplier (§15.1)',
     !!late.lines.find((l) => l.kind === LINE_KINDS.OVERTIME));
  ok('C4 …and only when over the estimate', !onTime.lines.find((l) => l.kind === LINE_KINDS.OVERTIME));

  /* §15.1: the efficiency bonus is "GRADUATED; NO HARD CUTOFF", and §2.3 wants a player to be
   * able to "spend several hilarious minutes trying a terrible idea". A bonus that cliffs at
   * the estimate would make the funny option the economically wrong option. Tested as
   * SMOOTHNESS: no single minute may cost more than a small fraction of the whole bonus. */
  let worstStep = 0;
  let prev = null;
  for (let m = estimateMin * 0.4; m <= estimateMin * 1.2; m += 0.5) {
    const inv = at(m);
    const bonus = (inv.lines.find((l) => l.kind === LINE_KINDS.EFFICIENCY) || { amount: 0 }).amount;
    if (prev !== null) worstStep = Math.max(worstStep, Math.abs(bonus - prev));
    prev = bonus;
  }
  lines.push(`      worst efficiency-bonus step over any half-minute: ${worstStep.toFixed(2)}`);
  ok('C5 §15.1 "graduated; no hard cutoff" — the bonus has no cliff',
     worstStep < ECONOMY.efficiencyBonusMax * 0.25, `${worstStep.toFixed(2)}`);

  // §2.3's licence, priced: a terrible idea costs minutes, and minutes are affordable.
  const cost = onTime.profit - at(estimateMin + 3).profit;
  lines.push(`      three extra minutes of a terrible idea costs ${cost.toFixed(2)}`);
  ok('C6 §2.3: three wasted minutes is a cost, not a catastrophe',
     cost > 0 && cost < ECONOMY.basePayout * 0.35, `${cost.toFixed(2)}`);
}
emit('running...');

/* ── D. §15.2's grade and review ─────────────────────────────────────────── */
lines.push('--- D. grade and review (GDD §15.2) ---');
{
  const summary = cleanDelivery();
  setWorked(14);
  const good = buildInvoice(game.state, summary, {});

  ok('D1 a clean job grades well', ['A', 'B'].includes(good.grade.letter), good.grade.letter);
  ok('D2 the grade never hides the invoice — the lines come with it (§15.2)',
     Array.isArray(good.lines) && good.lines.length > 0);

  /* §15.2: "Use profit margin, delivered completeness, damage ratio, and constraints RATHER
   * THAN SPEED ALONE." Two jobs with identical speed and different damage must not grade the
   * same, or speed is doing all the work. */
  const brokenSummary = { ...summary };
  const fakeLedger = Array.from({ length: 6 }, (_, i) => ({ entityId: `e${i}`, cost: 120, band: 'broken' }));
  const damagedGrade = gradeFor(good.profit - 720, good.income, brokenSummary, fakeLedger);
  ok('D3 damage lowers the grade at the same speed (§15.2 not speed alone)',
     damagedGrade.score < good.grade.score,
     `${good.grade.score} -> ${damagedGrade.score}`);

  const partial = { ...summary, delivered: Math.floor(summary.total / 2) };
  const partialGrade = gradeFor(good.profit, good.income, partial, []);
  ok('D4 …and so does leaving half the load behind',
     partialGrade.score < good.grade.score, `${good.grade.score} -> ${partialGrade.score}`);

  /* §15.2: "NEGATIVE PROFIT STILL COMPLETES THE JOB." A loss is a loss, not a failure state,
   * and §12.2's four hard-fail conditions do not include an expensive afternoon. */
  setWorked(90);
  const disaster = buildInvoice(game.state, summary, { recoveries: 8, collisions: 4 });
  lines.push(`      a 90-minute disaster: ${disaster.profit.toFixed(2)}, grade ${disaster.grade.letter}`);
  ok('D5 a bad enough job loses money', disaster.profit < 0, `${disaster.profit}`);
  ok('D6 …and still COMPLETES (§15.2, §12.2)', disaster.complete);
  ok('D7 …and still produces a full invoice, not an error', disaster.lines.length >= 6);

  /* §15.2's review "assembles from ACTUAL EVENT TAGS", and selects "only the two or three
   * most salient events". */
  setWorked(14);
  const review = reviewFor(good, game.state, summary, {});
  lines.push(`      review (${review.grade}): "${review.text}"  tags: ${review.tags.join(', ')}`);
  ok('D8 the review carries 2-3 tags, not a list (§15.2)',
     review.tags.length >= 1 && review.tags.length <= 3, `${review.tags.length}`);
  ok('D9 …drawn from what actually happened',
     review.tags.includes('everything_delivered') || review.tags.includes('nothing_broken'),
     review.tags.join(', '));
  ok('D10 …with a curated line of text (§15.2 templates)',
     typeof review.text === 'string' && review.text.length > 10);

  const badReview = reviewFor(disaster, game.state, summary, { recoveries: 8 });
  ok('D11 a different job gets different tags', badReview.tags.join() !== review.tags.join(),
     badReview.tags.join(', '));
}
emit('running...');

/* ── E. §15.3's contribution stats ───────────────────────────────────────── */
lines.push('--- E. contribution statistics (GDD §15.3) ---');
{
  const stats = contributionStats(game.state, { strapsPlaced: 4, recoveries: 1, heaviestMoved: 110 });
  ok('E1 the stats are counts of what was done (§15.3)',
     stats.itemsDelivered >= 0 && stats.strapsPlaced === 4 && stats.heaviestMoved === 110,
     JSON.stringify(stats));
  ok('E2 …and serializable', (() => { try { JSON.parse(JSON.stringify(stats)); return true; }
                                      catch (e) { return false; } })());
  /* §15.3: "Avoid rewarding selfish handling or deliberate damage." Nothing in the stats is
   * a score, and damage appears as a count of events rather than as a ranking. */
  ok('E3 nothing in the stats is a score or a ranking',
     !('score' in stats) && !('rank' in stats) && !('best' in stats), Object.keys(stats).join(', '));
}
emit('running...');

/* ── F. integration (§26.6) ──────────────────────────────────────────────── */
lines.push('--- F. integration (GDD §26.6) ---');
{
  const bodiesBefore = physics.stats.bodies;
  for (let i = 0; i < 90; i++) M.game.frame(16.7);
  ok('F1 no bodies leak over 90 real frames', physics.stats.bodies === bodiesBefore,
     `${bodiesBefore} -> ${physics.stats.bodies}`);
  const inv = buildInvoice(game.state, manifestSummary(rows), {});
  ok('F2 the whole invoice is serializable (§23.4 save data)',
     (() => { try { JSON.parse(JSON.stringify(inv)); return true; } catch (e) { return false; } })());
  ok('F3 §26.6: reset clears the damage ledger and the invoice follows it',
     (() => {
       damage.reset();
       const after = buildInvoice(game.state, manifestSummary(rows), {});
       return !after.lines.find((l) => l.kind === LINE_KINDS.ITEM_DAMAGE);
     })());
  ok('F4 no error banner appeared during the suite', !document.getElementById('error-banner'));
}

} catch (e) {
  fails++;
  lines.push(`FAIL  suite threw  <- ${e && e.message}`);
  lines.push((e && e.stack || '').split('\n').slice(0, 6).join('\n'));
}

emit();
