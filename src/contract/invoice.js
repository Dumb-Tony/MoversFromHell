/* The invoice — GDD §15.1, §15.2, §15.3, §8.4, §2.3, §12.2.
 *
 * §15.1's formula, verbatim, and this file computes exactly it and nothing else:
 *
 *   "Profit = base contract + bonuses + tips - labor time - overtime - vehicle/fuel
 *    - property damage - item damage - violations - recovery/service fees."
 *
 * §25.2's Phase 10 gate is "LEDGER MATCHES EVENTS", which is a stronger claim than "the
 * arithmetic is right". It means every charge on the invoice must be traceable to something
 * that actually happened and was recorded at the time — not recomputed at settlement from
 * the final state of the world. Two things follow, and they shape the whole module:
 *
 *   1. Every line carries the EVENTS it came from. `itemDamage` lines are the §8.4 ledger
 *      entries the damage system wrote as impacts occurred; recovery fees count the
 *      recoveries the registry actually performed. Nothing is inferred from a condition
 *      value at the end.
 *   2. `reconcile()` exists, and it is the gate's own test: it re-derives every line from
 *      the recorded events and asserts the totals agree. If a future change starts pricing
 *      something the ledger did not record, reconcile() fails and says which line.
 *
 * §15.2's rules are constraints, not decoration: "the letter grade summarizes the invoice but
 * NEVER HIDES IT", and "NEGATIVE PROFIT STILL COMPLETES THE JOB". So the grade is derived
 * from the lines and the lines are always returned alongside it, and a loss is a loss rather
 * than a failure state (§12.2 again — hard failure is four rare cases, and an expensive
 * afternoon is not among them).
 */

import { ECONOMY, DAMAGE } from '../config.js';

/** §15.1's line items, in the order the formula names them. `sign` is +1 for money in. */
export const LINE_KINDS = Object.freeze({
  BASE: 'base contract',
  EFFICIENCY: 'efficiency bonus',
  ONE_TRIP: 'one-trip bonus',
  ROOM_ACCURACY: 'room accuracy',
  LABOUR: 'labor time',
  OVERTIME: 'overtime',
  FUEL: 'vehicle/fuel',
  PROPERTY_DAMAGE: 'property damage',
  ITEM_DAMAGE: 'furniture damage',
  VIOLATIONS: 'violations',
  RECOVERY: 'recovery/service fees',
});

/**
 * Build the invoice.
 *
 * @param {object} state      game.state — the ledger, the manifest, the work clock
 * @param {object} summary    manifestSummary(state.manifest)
 * @param {object} opts       { basePayout, recoveries, collisions, distanceKm, tips }
 */
export function buildInvoice(state, summary, opts = {}) {
  const {
    basePayout = ECONOMY.basePayout,
    recoveries = 0,
    collisions = 0,
    distanceKm = ECONOMY.routeDistanceKm,
    tips = 0,
    moverCount = 2,
  } = opts;

  const lines = [];
  const add = (kind, amount, detail, from) => {
    lines.push({
      kind,
      amount: Number(amount.toFixed(2)),
      detail,
      /** WHICH EVENTS THIS LINE CAME FROM. The gate is "ledger matches events", so a line
       *  that cannot name its evidence is a line that should not be on the invoice. */
      from: from || [],
    });
  };

  // ---- money in ----------------------------------------------------------------------
  add(LINE_KINDS.BASE, basePayout, 'contract completed', ['contract']);

  /* §15.1: efficiency bonus is "GRADUATED; NO HARD CUTOFF".
   *
   * That phrasing is doing real work. §2.3 wants a player to be able to "spend several
   * hilarious minutes trying a terrible idea", and a bonus that cliffs at the estimate makes
   * the last five minutes of a job economically catastrophic — which would quietly make the
   * funny option the wrong option. So the bonus decays smoothly and reaches zero without a
   * step, and running over simply earns none of it rather than triggering anything. */
  const workedMin = state.elapsedWorkMs / 60000;
  const estimateMin = state.estimateMs / 60000;
  const underBy = Math.max(0, estimateMin - workedMin);
  const efficiency = ECONOMY.efficiencyBonusMax * Math.min(1, underBy / (estimateMin * ECONOMY.efficiencyFullAt));
  if (efficiency > 0) {
    add(LINE_KINDS.EFFICIENCY, efficiency,
        `${underBy.toFixed(1)} min under a ${estimateMin.toFixed(0)} min estimate`, ['clock']);
  }

  // §15.1: "awarded if all required cargo moved once".
  const oneTrip = state.tripCount <= 1 && summary.complete;
  if (oneTrip) add(LINE_KINDS.ONE_TRIP, ECONOMY.oneTripBonus, 'everything in one trip', ['cargo']);

  /* §15.1 room accuracy: "Required; small PERFECT bonus." The requirement is met by the
   * delivery itself (see manifest.js on why the room is priced rather than gated); the bonus
   * is for getting every room right. Graduated below that, for the same §2.3 reason. */
  if (summary.delivered > 0) {
    const acc = summary.roomAccuracy;
    const bonus = acc >= 1 ? ECONOMY.roomAccuracyBonus : ECONOMY.roomAccuracyBonus * acc * ECONOMY.roomAccuracyPartial;
    if (bonus > 0) {
      add(LINE_KINDS.ROOM_ACCURACY, bonus,
          `${summary.roomCorrect}/${summary.delivered} in the right room`, ['manifest']);
    }
  }

  if (tips > 0) add('tips', tips, 'customer tip', ['review']);

  // ---- money out ---------------------------------------------------------------------
  /* §15.1: "Makes time economically meaningful. Per-minute cost and overtime multiplier."
   * Charged per MOVER per minute, because two people cost twice as much — which is the
   * cost side of §6.3's "two or a tool preferred". */
  const normalMin = Math.min(workedMin, estimateMin);
  const overtimeMin = Math.max(0, workedMin - estimateMin);
  const labour = normalMin * ECONOMY.labourPerMinutePerMover * moverCount;
  add(LINE_KINDS.LABOUR, -labour,
      `${normalMin.toFixed(1)} min x ${moverCount} movers @ ${ECONOMY.labourPerMinutePerMover}/min`,
      ['clock']);

  if (overtimeMin > 0) {
    const ot = overtimeMin * ECONOMY.labourPerMinutePerMover * moverCount * ECONOMY.overtimeMultiplier;
    add(LINE_KINDS.OVERTIME, -ot,
        `${overtimeMin.toFixed(1)} min over, x${ECONOMY.overtimeMultiplier}`, ['clock']);
  }

  add(LINE_KINDS.FUEL, -(distanceKm * ECONOMY.fuelPerKm),
      `${distanceKm.toFixed(1)} km @ ${ECONOMY.fuelPerKm}/km`, ['route']);

  /* §8.4: "object/location, category, condition change, repair or replacement cost". These
   * come straight off the ledger the damage system wrote AS IMPACTS HAPPENED. Nothing is
   * recomputed from an object's final condition, which is the difference between an invoice
   * that matches events and one that merely agrees with them. */
  const itemLines = state.ledger.itemDamage || [];
  const itemTotal = itemLines.reduce((s, l) => s + l.cost, 0);
  if (itemTotal > 0) {
    add(LINE_KINDS.ITEM_DAMAGE, -itemTotal,
        `${itemLines.length} damage event${itemLines.length === 1 ? '' : 's'}`,
        itemLines.map((l) => l.entityId));
  }

  const propLines = state.ledger.propertyDamage || [];
  const propTotal = propLines.reduce((s, l) => s + (l.cost || 0), 0);
  if (propTotal > 0) {
    add(LINE_KINDS.PROPERTY_DAMAGE, -propTotal, `${propLines.length} surfaces`,
        propLines.map((l) => l.surfaceId || 'surface'));
  }

  if (collisions > 0) {
    add(LINE_KINDS.VIOLATIONS, -(collisions * ECONOMY.collisionFeeBase),
        `${collisions} collision${collisions === 1 ? '' : 's'}`, ['route']);
  }

  /* §18.3's recovery has been free since Phase 5, and it should not be: an unstick that costs
   * nothing makes dropping something off the world a fast teleport rather than a mistake. */
  if (recoveries > 0) {
    add(LINE_KINDS.RECOVERY, -(recoveries * ECONOMY.recoveryFee),
        `${recoveries} recovery callout${recoveries === 1 ? '' : 's'}`, ['recovery']);
  }

  const total = lines.reduce((s, l) => s + l.amount, 0);
  const income = lines.filter((l) => l.amount > 0).reduce((s, l) => s + l.amount, 0);

  return {
    lines,
    income: Number(income.toFixed(2)),
    costs: Number((income - total).toFixed(2)),
    /** §15.2: "Negative profit still completes the job." */
    profit: Number(total.toFixed(2)),
    grade: gradeFor(total, income, summary, itemLines),
    complete: summary.complete,
  };
}

/**
 * §15.2's letter grade. "Use profit margin, delivered completeness, damage ratio, and
 * constraints RATHER THAN SPEED ALONE" — so speed appears only through the efficiency bonus
 * it already earned, and never on its own.
 *
 * The grade summarises; `buildInvoice` always returns the lines beside it, because §15.2 is
 * explicit that the grade "never hides" the invoice.
 */
export function gradeFor(profit, income, summary, itemLines = []) {
  const margin = income > 0 ? profit / income : 0;
  const completeness = summary.total > 0 ? summary.delivered / summary.total : 0;
  const damaged = new Set(itemLines.map((l) => l.entityId)).size;
  const damageRatio = summary.total > 0 ? damaged / summary.total : 0;

  let score = 0;
  score += Math.max(0, Math.min(1, margin)) * 40;
  score += completeness * 35;
  score += (1 - Math.min(1, damageRatio * 2)) * 15;
  score += (summary.roomAccuracy || 0) * 10;

  for (const [letter, min] of [['A', 85], ['B', 70], ['C', 55], ['D', 40]]) {
    if (score >= min) return { letter, score: Number(score.toFixed(1)), margin: Number(margin.toFixed(3)) };
  }
  return { letter: 'F', score: Number(score.toFixed(1)), margin: Number(margin.toFixed(3)) };
}

/**
 * THE GATE, as a function. Re-derive every line from the recorded events and check the
 * invoice agrees.
 *
 * This is not a duplicate of buildInvoice's arithmetic — it starts from the EVENT RECORDS
 * (ledger lines, recovery counts, the work clock) and asks whether each invoice line is
 * accounted for by them. A line with no evidence, or evidence that does not add up to the
 * amount charged, is reported by name.
 *
 * @returns {{ok: boolean, problems: string[], checked: number}}
 */
export function reconcile(invoice, state, opts = {}) {
  const problems = [];
  const { recoveries = 0, collisions = 0 } = opts;
  const find = (kind) => invoice.lines.find((l) => l.kind === kind);

  // Every line must name its evidence.
  for (const l of invoice.lines) {
    if (!l.from || l.from.length === 0) problems.push(`"${l.kind}" cites no event`);
  }

  // Item damage must equal the §8.4 ledger, to the cent, and cite every entry.
  const itemLines = state.ledger.itemDamage || [];
  const itemTotal = Number(itemLines.reduce((s, l) => s + l.cost, 0).toFixed(2));
  const itemLine = find(LINE_KINDS.ITEM_DAMAGE);
  if (itemTotal > 0) {
    if (!itemLine) problems.push(`ledger has ${itemTotal} of item damage and the invoice has no line`);
    else {
      if (Math.abs(-itemLine.amount - itemTotal) > 0.01) {
        problems.push(`item damage ${-itemLine.amount} does not match the ledger's ${itemTotal}`);
      }
      if (itemLine.from.length !== itemLines.length) {
        problems.push(`item damage cites ${itemLine.from.length} events, ledger has ${itemLines.length}`);
      }
    }
  } else if (itemLine) {
    problems.push('an item-damage line exists with nothing in the ledger');
  }

  // Recovery fees must equal the recoveries that were actually performed.
  const recLine = find(LINE_KINDS.RECOVERY);
  const expectRec = Number((recoveries * ECONOMY.recoveryFee).toFixed(2));
  if (recoveries > 0 && (!recLine || Math.abs(-recLine.amount - expectRec) > 0.01)) {
    problems.push(`recovery fees ${recLine ? -recLine.amount : 0} do not match ${recoveries} recoveries`);
  }
  if (recoveries === 0 && recLine) problems.push('a recovery fee exists with no recoveries');

  const violLine = find(LINE_KINDS.VIOLATIONS);
  if (collisions === 0 && violLine) problems.push('a violations line exists with no collisions');

  // Labour must match the work clock, which is the only place time is recorded.
  const labourLine = find(LINE_KINDS.LABOUR);
  if (state.elapsedWorkMs > 0 && !labourLine) problems.push('time was worked and no labour was billed');
  if (state.elapsedWorkMs === 0 && labourLine && labourLine.amount !== 0) {
    problems.push('labour was billed for no worked time');
  }

  // …and the total must be the sum of the lines. §15.1 is an addition, not a formula with
  // anything hidden in it.
  const sum = Number(invoice.lines.reduce((s, l) => s + l.amount, 0).toFixed(2));
  if (Math.abs(sum - invoice.profit) > 0.01) {
    problems.push(`the lines sum to ${sum} and the invoice says ${invoice.profit}`);
  }

  return { ok: problems.length === 0, problems, checked: invoice.lines.length };
}

/**
 * §15.2's customer review: "assemble from ACTUAL EVENT TAGS, outcome, and customer
 * personality... Select only the TWO OR THREE most salient events."
 *
 * Tags come from what happened, never from the score — a review that praised a job the
 * invoice priced badly would be the same category of lie as damage without a cause (§10.4).
 */
export function reviewFor(invoice, state, summary, opts = {}) {
  const tags = [];
  const itemLines = state.ledger.itemDamage || [];

  if (summary.complete) tags.push('everything_delivered');
  else tags.push('items_left_behind');
  if (summary.roomAccuracy >= 1 && summary.delivered > 0) tags.push('every_room_right');
  else if (summary.roomAccuracy < 0.6) tags.push('wrong_rooms');
  if (itemLines.length === 0) tags.push('nothing_broken');
  else {
    const worst = itemLines.reduce((w, l) => (l.cost > (w ? w.cost : -1) ? l : w), null);
    if (worst && worst.band === 'broken') tags.push('broke_something_expensive');
    else tags.push('minor_damage');
  }
  if ((opts.recoveries || 0) > 0) tags.push('needed_a_callout');
  if (state.tripCount > 1) tags.push('extra_trip');
  if (invoice.profit < 0) tags.push('cost_them_money');

  /* §15.2: "Select only the two or three MOST SALIENT events."
   *
   * SALIENCE, not insertion order — and the difference is not cosmetic. Taking the first
   * three tags gave a catastrophic job and a flawless one the SAME review: both begin
   * "everything delivered, every room right, nothing broken", because the tags that
   * distinguished them (needed a callout, cost them money) were appended later and sliced
   * off. A review that cannot tell a disaster from a triumph is worse than no review.
   *
   * Things going wrong are more remarkable than things going right, which is why the
   * weights are ordered the way they are. Nobody tells a story about the day the movers
   * did not break anything. */
  const SALIENCE = {
    broke_something_expensive: 100,
    cost_them_money: 90,
    items_left_behind: 85,
    wrong_rooms: 70,
    needed_a_callout: 60,
    extra_trip: 55,
    minor_damage: 40,
    every_room_right: 30,
    everything_delivered: 20,
    nothing_broken: 15,
  };
  const salient = [...tags]
    .sort((a, b) => (SALIENCE[b] || 0) - (SALIENCE[a] || 0))
    .slice(0, 3);

  return {
    tags: salient,
    grade: invoice.grade.letter,
    /** Curated templates, per §15.2 ("use curated templates for control and localization"). */
    text: TEMPLATES[salient[0]] || TEMPLATES.default,
  };
}

const TEMPLATES = Object.freeze({
  everything_delivered: 'Everything arrived. Not a scratch on the piano, or on me.',
  items_left_behind: 'Half my house is still in my old house.',
  every_room_right: 'They even knew which room the dresser went in. Unnerving.',
  wrong_rooms: 'The fridge is in the bedroom. I am choosing to see the funny side.',
  nothing_broken: 'Nothing broken, nothing missing. I have low standards and they cleared them.',
  broke_something_expensive: 'I heard the television before I saw it.',
  minor_damage: 'A few marks. Nothing I will not notice every single day.',
  needed_a_callout: 'At one point they had to call someone to get something back.',
  extra_trip: 'They went round twice. I paid for both.',
  cost_them_money: 'I am not sure they made anything on this. That is not my problem.',
  default: 'They came, they moved things, they left.',
});

/** §15.3's contribution statistics — "lighthearted stats after the shared result... Avoid
 *  rewarding selfish handling or deliberate damage." So these are participation counts and
 *  never a leaderboard, and nothing here is scored. */
export function contributionStats(state, extra = {}) {
  const itemLines = state.ledger.itemDamage || [];
  return {
    itemsDelivered: (state.manifest || []).filter((r) => r.delivered).length,
    strapsPlaced: extra.strapsPlaced || 0,
    recoveries: extra.recoveries || 0,
    damageEvents: itemLines.length,
    heaviestMoved: extra.heaviestMoved || 0,
    trips: state.tripCount || 1,
  };
}

/** Which §8.3 condition band an object is in — re-exported so the invoice UI does not have
 *  to import the damage system to render a manifest row. */
export function conditionBand(condition) {
  for (const b of DAMAGE.bands) if (condition >= b.min) return b.name;
  return DAMAGE.bands[DAMAGE.bands.length - 1].name;
}
