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

import { ECONOMY, DAMAGE, PARTS, INVOICE } from '../config.js';   // INVOICE.holderMax: M26
import { undeliveredRows } from './manifest.js';   // M20: the ONE definition of "left behind"

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
  /** M12 (§15.1 names what was lost; §9.1 "loose pieces get lost"): detached parts that
   *  never reached the destination, priced per piece from its replacementValue share. */
  PARTS_LEFT: 'parts left behind',
  /** M13 (§12.2 "partial completion, extra cost"; §15.1 base "rewards completion and
   *  scope"): every required row NOT delivered when the crew settled, at
   *  ECONOMY.leftBehindFee each. The evidence is the row itself, undelivered. */
  LEFT_BEHIND: 'items left behind',
  VIOLATIONS: 'violations',
  RECOVERY: 'recovery/service fees',
});

/**
 * How many legs of ECONOMY.routeDistanceKm the truck drove, from the trip count (M13).
 * Settlement only happens at the destination (the cab's settle branch needs route ARRIVED
 * in DELIVERY), so trip n ended with n outward legs and n − 1 returns: 2n − 1. If a later
 * milestone lets the crew settle at the pickup house (§3.4 "crew elects"), this must become
 * a RECORDED count on state — legsDriven, incremented per arrival — rather than a derivation.
 */
export function legsDriven(state) { return 2 * Math.max(1, state.tripCount || 1) - 1; }

/** The undelivered required rows — the LEFT_BEHIND line's evidence, and reconcile()'s.
 *  M20: NOT a second definition. This is manifest.js undeliveredRows over state.manifest —
 *  the same function the cab prompt prices through tripStatus — kept here in the state-shaped
 *  signature the invoice's callers use, so the line and the prompt cannot disagree about
 *  which rows are 'left behind' (m21 T3c deep-equals the two). */
export function itemsLeftBehind(state) {
  return undeliveredRows(state.manifest || []);
}

/* 'couch_3seat_01' -> 'couch 3seat', the words every prompt uses for the object. */
const wordsOf = (id) => (id || '').replace(/_\d+$/, '').replace(/_/g, ' ');

/**
 * §15.3 "who was holding it" (M26). A mover id -> the seat word the whole game already uses:
 * p0 -> P1, p1 -> P2 (the HUD's seat tag, the recap's seat column, the settings card's rows).
 * Anything that is not a pN id comes back unchanged, so a future named player still prints.
 */
export function seatWordFor(playerId) {
  const m = /^p(\d+)$/.exec(String(playerId || ''));
  return m ? `P${Number(m[1]) + 1}` : String(playerId || '');
}

/**
 * The holders of a property-damage window, as words.
 *
 * `heldBy` is M14's shape and M23 kept it: ONE ENTRY PER HAND, so a two-hand shove reads
 * ['p0', 'p0'] and a co-op carry ['p0', 'p1']. Deduped in first-seen order; an empty list
 * (the object was thrown, or nobody was holding it) is an empty list, and the line then says
 * nothing about a person — a box that flew into a wall on its own has no culprit (§10.4).
 *
 * SOLO PRINTS NOTHING. With one SEAT on the job the seat word carries no information and
 * §21.1 asks the sheet to stay compact, so `seats` of 1 returns '' however full heldBy is.
 * (Seats, not movers: two mover bodies always exist so Tab can swap between them — invoice
 * `moverCount` is the labour headcount and is 2 even solo. What decides whether 'P1' means
 * anything is how many people are playing.) The RECAP's seat column is a different surface
 * with a different rule (it has always printed P1 in solo for drops and door removals) and
 * is not touched by this.
 *
 * @param {string[]} heldBy   the ledger line's heldBy
 * @param {number} seats      seats in play (main.js seatCount)
 * @returns {string} 'P1', 'P1 and P2', or ''
 */
export function holdersOf(heldBy, seats = 1) {
  if (!(seats > 1) || !Array.isArray(heldBy)) return '';
  const seen = [];
  for (const id of heldBy) {
    if (id == null) continue;
    const w = seatWordFor(id);
    if (w && !seen.includes(w)) seen.push(w);
  }
  if (!seen.length) return '';
  return seen.length === 1 ? seen[0] : seen.slice(0, -1).join(', ') + ' and ' + seen[seen.length - 1];
}

/**
 * The §15.1 property line's "who" clause: one phrase per distinct holder-and-object pair, in
 * the order the ledger wrote them — 'P1 carrying the dresser'. Lines with no holder
 * contribute nothing, so a run where every impact was a throw returns '' and the detail reads
 * exactly as it did before M26.
 */
export function propertyHolders(propLines, seats = 1) {
  const seen = [];
  for (const l of propLines || []) {
    const who = holdersOf(l.heldBy, seats);
    if (!who) continue;
    const phrase = `${who} carrying the ${wordsOf(l.defId)}`;
    if (!seen.includes(phrase)) seen.push(phrase);
  }
  if (!seen.length) return '';
  const cap = INVOICE.holderMax;                     // §21.1 compact — never a literal here
  if (seen.length <= cap) return seen.join(', ');
  return `${seen.slice(0, cap).join(', ')} and ${seen.length - cap} more`;
}

/**
 * The §15.1 'parts left' evidence: one record per manifest row and detached part with
 * pieces not at the destination, straight off the rows stepManifest wrote (manifest.js
 * pieceStatusOf) — the same record the delivery flag itself is derived from, so the line
 * and the row can never disagree about what was left. Exported for reconcile() and tests.
 *
 * @returns {{rowId, defId, part, name, missing, of, value, cost}[]}
 */
export function partsLeftBehind(state) {
  const out = [];
  for (const row of state.manifest || []) {
    for (const l of row.partsLeft || []) {
      if (!(l.missing > 0) || !(l.value > 0)) continue;
      out.push({
        rowId: row.id, defId: row.defId, part: l.part, name: l.name || l.part,
        missing: l.missing, of: l.of, value: l.value,
        cost: Number((l.missing * l.value * PARTS.leftBehindCostFraction).toFixed(2)),
      });
    }
  }
  return out;
}

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
    /** §15.3 (M26): seats in play, which is what decides whether a seat word means anything
     *  on the sheet. NOT moverCount — two mover bodies exist even solo (Tab swaps them). */
    seatCount = 1,
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

  /* §2.2 "an extra trip costs fuel and time; work continues" (M13). The time is already on
   * the labour clock (Game.step bills TRANSIT like any phase); the fuel is per LEG. */
  const legs = legsDriven(state);
  add(LINE_KINDS.FUEL, -(legs * distanceKm * ECONOMY.fuelPerKm),
      `${legs} leg${legs === 1 ? '' : 's'} x ${distanceKm.toFixed(1)} km @ ${ECONOMY.fuelPerKm}/km`, ['route']);

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

  /* §15.1's OTHER damage line (M14): the property ledger damage.js writes per entity-and-
   * surface window — a location, a category, an impulse and a cost, one entry per impact
   * (§26.4). Its evidence is one citation per entry, the surface it names. */
  const propLines = state.ledger.propertyDamage || [];
  const propTotal = propLines.reduce((s, l) => s + (l.cost || 0), 0);
  if (propTotal > 0) {
    const surfaces = new Set(propLines.map((l) => l.surfaceId || 'surface')).size;
    /* §15.3 "who was holding it" (M26): heldBy has been on every property line since M14 and
     * nothing read it. In co-op the line now names the hands the object was in — the sheet
     * agrees with the JSON export, which carried the ids all along. Solo says nothing extra
     * (§21.1 compact), and a thrown object has no holder to name. */
    const who = propertyHolders(propLines, seatCount);
    add(LINE_KINDS.PROPERTY_DAMAGE, -propTotal,
        `${propLines.length} impact${propLines.length === 1 ? '' : 's'} on ${surfaces} surface${surfaces === 1 ? '' : 's'}` +
        (who ? ` — ${who}` : ''),
        propLines.map((l) => l.surfaceId || 'surface'));
  }

  /* §15.1 "the invoice names what was lost" (M12). Each piece of a detached part that is
   * not at the destination is billed at PARTS.leftBehindCostFraction of its share of the
   * parent's replacement value — a couch leg is 31.50 of the couch's 900. The evidence is
   * the manifest row, which is also why the row is not delivered (manifest.js). Fragments
   * are deliberately absent: the 'broken' band already charged the whole item. */
  const left = partsLeftBehind(state);
  const leftTotal = left.reduce((s, l) => s + l.cost, 0);
  if (leftTotal > 0) {
    add(LINE_KINDS.PARTS_LEFT, -leftTotal,
        'parts left at pickup — ' + left.map((l) => `${wordsOf(l.defId)}: ${l.missing} of ${l.of} ${l.part}`).join(', '),
        left.map((l) => l.rowId));
  }

  /* §12.2 sanctions "partial completion, extra cost, negative profit" and until M13 the first
   * was free: a crew that settled with twenty items still in the house took the full base.
   * Each undelivered required row is priced at ECONOMY.leftBehindFee (the reasoning is
   * beside the number in config.js) and cites its row — the same rows summary.delivered
   * was counted from, so the line and the completeness grade cannot disagree. */
  const leftBehind = itemsLeftBehind(state);
  if (leftBehind.length > 0 && summary.delivered < summary.total) {
    add(LINE_KINDS.LEFT_BEHIND, -(leftBehind.length * ECONOMY.leftBehindFee),
        `${leftBehind.length} of ${summary.total} not delivered @ ${ECONOMY.leftBehindFee} each`,
        leftBehind.map((r) => r.id));
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
  /* ITEM lines only, on purpose (M14): §15.2's "damage ratio" is furniture — how much of
   * the customer's manifest arrived marked. Property damage already lowers the margin
   * through its own §15.1 line, and counting a wall twice would grade a scraped hallway as
   * a broken television. */
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
  const { recoveries = 0, collisions = 0, distanceKm = ECONOMY.routeDistanceKm } = opts;
  const find = (kind) => invoice.lines.find((l) => l.kind === kind);

  /* Fuel must be the legs the trip count says were driven (M13) — see legsDriven() for why
   * the count is derived from tripCount today and when it would have to be recorded. */
  const fuelLine = find(LINE_KINDS.FUEL);
  const expectFuel = Number((legsDriven(state) * distanceKm * ECONOMY.fuelPerKm).toFixed(2));
  if (!fuelLine) problems.push(`${legsDriven(state)} legs were driven and no vehicle/fuel was billed`);
  else if (Math.abs(-fuelLine.amount - expectFuel) > 0.01) {
    problems.push(`vehicle/fuel ${-fuelLine.amount} does not match ${legsDriven(state)} legs (${expectFuel})`);
  }

  /* Items left behind must be the undelivered rows, to the cent, citing each one (M13). */
  const leftRows = itemsLeftBehind(state);
  const expectLeftBehind = Number((leftRows.length * ECONOMY.leftBehindFee).toFixed(2));
  const leftBehindLine = find(LINE_KINDS.LEFT_BEHIND);
  if (leftRows.length > 0) {
    if (!leftBehindLine) problems.push(`${leftRows.length} items left behind and the invoice has no line`);
    else {
      if (Math.abs(-leftBehindLine.amount - expectLeftBehind) > 0.01) {
        problems.push(`items left behind ${-leftBehindLine.amount} does not match the manifest's ${expectLeftBehind}`);
      }
      const ids = new Set(leftRows.map((r) => r.id));
      if (leftBehindLine.from.length !== ids.size || leftBehindLine.from.some((id) => !ids.has(id))) {
        problems.push(`items left behind cites ${leftBehindLine.from.length} rows, the manifest has ${ids.size} undelivered`);
      }
    }
  } else if (leftBehindLine) {
    problems.push('an items-left-behind line exists with everything delivered');
  }

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

  // Property damage must equal ITS ledger, to the cent, and cite every entry (M14).
  const propLines = state.ledger.propertyDamage || [];
  const propTotal = Number(propLines.reduce((s, l) => s + (l.cost || 0), 0).toFixed(2));
  const propLine = find(LINE_KINDS.PROPERTY_DAMAGE);
  if (propTotal > 0) {
    if (!propLine) problems.push(`ledger has ${propTotal} of property damage and the invoice has no line`);
    else {
      if (Math.abs(-propLine.amount - propTotal) > 0.01) {
        problems.push(`property damage ${-propLine.amount} does not match the ledger's ${propTotal}`);
      }
      if (propLine.from.length !== propLines.length) {
        problems.push(`property damage cites ${propLine.from.length} events, ledger has ${propLines.length}`);
      }
    }
  } else if (propLine) {
    problems.push('a property-damage line exists with nothing in the ledger');
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

  // Parts left behind must equal what the manifest rows record as missing, to the cent (M12).
  const left = partsLeftBehind(state);
  const expectLeft = Number(left.reduce((s, l) => s + l.cost, 0).toFixed(2));
  const leftLine = find(LINE_KINDS.PARTS_LEFT);
  if (expectLeft > 0) {
    if (!leftLine) problems.push(`the manifest records ${expectLeft} of parts left behind and the invoice has no line`);
    else {
      if (Math.abs(-leftLine.amount - expectLeft) > 0.01) {
        problems.push(`parts left behind ${-leftLine.amount} does not match the manifest's ${expectLeft}`);
      }
      const rows = new Set(left.map((l) => l.rowId));
      if (leftLine.from.length !== rows.size || leftLine.from.some((id) => !rows.has(id))) {
        problems.push(`parts left behind cites ${leftLine.from.length} rows, the manifest has ${rows.size}`);
      }
    }
  } else if (leftLine) {
    problems.push('a parts-left line exists with nothing recorded as missing');
  }

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
  /* M14: the walls. An ACTUAL event tag off the property ledger (§15.2), never off where
   * anything ended up. Cost > 0, because a window that rounds to nothing writes no line. */
  const propLines = state.ledger.propertyDamage || [];
  if (propLines.reduce((s, l) => s + (l.cost || 0), 0) > 0) tags.push('marked_the_walls');
  if (state.tripCount > 1) tags.push('extra_trip');
  if (invoice.profit < 0) tags.push('cost_them_money');
  /* §15.2's own example tag (M11). state.doors is written by main.js from DOOR_STATE
   * events — a fact about what happened in the run, never inferred from where the leaf
   * ended up (§10.4's rule applied to the review). The front door is whichever door record
   * carries `leaf.front` (scene.js APERTURES door34). */
  if (state.doors && state.doors.frontRemoved) tags.push('front_door_removed');
  // M12: the legs are in the old house. An ACTUAL event tag, off the same rows the line came from.
  if (partsLeftBehind(state).length > 0) tags.push('parts_left_behind');

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
    parts_left_behind: 58,
    extra_trip: 55,
    front_door_removed: 50,   // remarkable, and not a complaint: it went back on (M11)
    marked_the_walls: 50,     // a mark on the hallway is a complaint, a small one (M14)
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
  front_door_removed: 'They took the front door off its hinges. It is back on. I think.',
  cost_them_money: 'I am not sure they made anything on this. That is not my problem.',
  parts_left_behind: 'The couch arrived. Its legs are in the old house.',
  marked_the_walls: 'There is a new mark on the hallway wall. It is exactly couch height.',
  default: 'They came, they moved things, they left.',
});

/** §15.3's contribution statistics — "lighthearted stats after the shared result... Avoid
 *  rewarding selfish handling or deliberate damage." So these are participation counts and
 *  never a leaderboard, and nothing here is scored. */
export function contributionStats(state, extra = {}) {
  const itemLines = state.ledger.itemDamage || [];
  const propLines = state.ledger.propertyDamage || [];
  return {
    itemsDelivered: (state.manifest || []).filter((r) => r.delivered).length,
    strapsPlaced: extra.strapsPlaced || 0,
    recoveries: extra.recoveries || 0,
    damageEvents: itemLines.length,
    /** §15.3 "damage involvement" — property lines this run (M14). A count, never a score. */
    propertyEvents: propLines.length,
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
