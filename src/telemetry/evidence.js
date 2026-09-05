/* The §26.7 evidence report, computed from pasted run reports — Phase 11 build-side M21.
 *
 * GDD §25.2 Phase 12: "Decision — evidence report and Unity go/revise/stop; fun proven, not
 * feature count". §26.7 lists six signals with a minimum-evidence cell each; §27.3 the seven
 * questions the settlement sheet asks (questionnaire.js); §22.5 "export event log and invoice
 * inputs for reproducible reports". M6 produced the reports (runLog.js buildRunSummary, the
 * Copy button on the sheet). This file turns any number of them into the §26.7 table.
 *
 * PURE, and shared by two consumers: docs/evidence.html (a static page served beside the
 * game — GitHub Pages serves the repo root, so it imports this file by relative path over
 * http, zero external requests) and tools/m28-evidence-tests.js (the same functions over a
 * fixture in the harness). Nothing here reads the DOM, the clock or the network.
 *
 * THE INPUT CONTRACT IS buildRunSummary's OUTPUT and this file never changes it. Where a
 * signal needs something the report does not carry, it is computed from what is there and
 * the gap is stated in the signal's `note`:
 *   - the stall hint (main.js) is a notice, not a bus event, so "before the stall hint" is
 *     read as "before CONTRACT.stallHintMs of sim time" (EVIDENCE.comprehension.firstGripMs);
 *   - the save's compact runs (runLog.js compactRun) have no event list, so Comprehension
 *     takes its timings from M22's `walkthrough` stamps when that key is present (step1Ms is
 *     the first grip, step2Ms the first load) and otherwise EXCLUDES the run and says so —
 *     never scores it 0;
 *   - there is no tester identity by design (§27.4), so Learning pairs runs by SESSION: in
 *     date order, consecutive reports of one build whose `restarts` climbs are one tester.
 *
 * Every threshold is EVIDENCE in config.js; the six rule strings are that block's data.
 */

import { EVIDENCE, TELEMETRY } from '../config.js';
import { EVENTS } from '../core/eventBus.js';
import { QUESTIONS } from '../ui/questionnaire.js';

/** The §27.3 question count — the page prints 'answered/N' from this, never a literal. */
export const QUESTION_COUNT = QUESTIONS.length;

export const SIGNAL_IDS = Object.freeze([
  'comprehension', 'emergentStory', 'learning', 'replayIntent', 'corePreference', 'friction',
]);
export const SIGNAL_LABELS = Object.freeze({
  comprehension: 'Comprehension',
  emergentStory: 'Emergent story',
  learning: 'Learning',
  replayIntent: 'Replay intent',
  corePreference: 'Core preference',
  friction: 'Friction',
});
export const VERDICT = Object.freeze({ PASS: 'PASS', NOT_YET: 'NOT YET', NO_DATA: 'no data' });

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const cut = (s, n) => String(s == null ? '' : s).slice(0, n);
const SCALE = TELEMETRY.questionnaire;

/* ── parsing ──────────────────────────────────────────────────────────────── */

/**
 * Split pasted text into JSON documents. Accepts one object, an array (its elements), or any
 * number of objects separated by whitespace or nothing at all — what a tester gets by pasting
 * several Copy-button reports one after another. Never throws: what does not parse comes
 * back in `rejected` with the reason and a sample of the text.
 * @param {string} text
 * @returns {{items: any[], rejected: {index: number, reason: string, sample: string}[]}}
 */
export function parseReports(text) {
  const out = { items: [], rejected: [] };
  const s = String(text == null ? '' : text).trim();
  if (!s) return out;
  try {
    const v = JSON.parse(s);
    if (Array.isArray(v)) out.items.push(...v); else out.items.push(v);
    return out;
  } catch (e) { /* several documents, or garbage — scan */ }
  const chunks = splitDocuments(s);
  chunks.forEach((c, i) => {
    try {
      const v = JSON.parse(c);
      if (Array.isArray(v)) out.items.push(...v); else out.items.push(v);
    } catch (e) {
      out.rejected.push({ index: i, reason: `not JSON (${e && e.message})`, sample: c.slice(0, EVIDENCE.textLimits.sample) });
    }
  });
  return out;
}

/** Top-level `{…}` / `[…]` documents in order, plus any bare token between them (rejected later). */
function splitDocuments(s) {
  const chunks = [];
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (depth === 0) {
      if (ch === '{' || ch === '[') { start = i; depth = 1; continue; }
      if (/\s/.test(ch)) continue;
      // A bare token outside any document: one chunk up to the next space or document, so
      // "garbage" pasted between two reports is rejected on its own and the reports survive.
      let j = i;
      while (j < s.length && !/\s/.test(s[j]) && s[j] !== '{' && s[j] !== '[') j++;
      chunks.push(s.slice(i, j));
      i = j - 1;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{' || ch === '[') { depth++; continue; }
    if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) { chunks.push(s.slice(start, i + 1)); start = -1; }
    }
  }
  if (depth > 0 && start >= 0) chunks.push(s.slice(start));   // unterminated: rejected with the parser's reason
  return chunks;
}

/** The reason a pasted thing is not a run report, or null when it is one. */
export function rejectReason(r) {
  if (!isObj(r)) return 'not a run report object';
  if (!isObj(r.counters)) return 'no counters block (not a buildRunSummary report)';
  for (const k of ['grips', 'drops', 'recoveries']) {
    if (!Number.isFinite(Number(r.counters[k]))) return `counters.${k} is not a number`;
  }
  if (r.phases !== undefined && r.phases !== null && !isObj(r.phases)) return 'phases is not an object';
  if (r.questionnaire !== undefined && r.questionnaire !== null && !isObj(r.questionnaire)) return 'questionnaire is not an object';
  return null;
}

/* ── normalising one report ───────────────────────────────────────────────── */

/** A sim-time stamp, or null. NOT `num()`: Number(null) is 0, and a walkthrough card that
 *  never retired reports `step2Ms: null` (runLog.js walkthroughReport) — read as 0 it would
 *  score as "loaded at 0 ms" and comprehend. m28 E2w pins the null. */
const stamp = (v) => (v === null || v === undefined || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null));

function firstStamp(events, pred) {
  let best = null;
  for (const e of events) {
    if (!isObj(e) || !pred(e)) continue;
    const t = stamp(e.simTimeMs);
    if (t === null) continue;
    if (best === null || t < best) best = t;
  }
  return best;
}

/** A report as the page and the signals read it: numbers with defaults, strings cut. */
export function normaliseRun(r, index) {
  const c = r.counters;
  const straps = isObj(c.straps) ? c.straps : {};
  const cargo = isObj(c.cargo) ? c.cargo : {};
  const q = isObj(r.questionnaire) ? r.questionnaire : null;
  const events = Array.isArray(r.events) ? r.events : null;
  const hasEvents = !!events && events.length > 0;
  const wt = isObj(r.walkthrough) ? {
    shown: !!r.walkthrough.shown,
    step1Ms: stamp(r.walkthrough.step1Ms),
    step2Ms: stamp(r.walkthrough.step2Ms),
    step3Ms: stamp(r.walkthrough.step3Ms),
  } : null;
  const lines = r.invoice && Array.isArray(r.invoice.lines) ? r.invoice.lines.filter(isObj) : [];
  let firstGripMs = null, firstLoadMs = null, timingSource = 'none';
  if (hasEvents) {
    firstGripMs = firstStamp(events, (e) => e.type === EVENTS.GRIP_STARTED);
    firstLoadMs = firstStamp(events, (e) => e.type === EVENTS.CARGO_STATE && e.loaded === true);
    timingSource = 'events';
  } else if (wt && wt.shown) {
    firstGripMs = wt.step1Ms; firstLoadMs = wt.step2Ms; timingSource = 'walkthrough';
  }
  const phases = {};
  if (isObj(r.phases)) for (const [k, v] of Object.entries(r.phases)) phases[cut(k, TELEMETRY.textLimits.counterKey)] = num(v);
  return {
    index,
    id: null,                      // assigned in date order by evidenceFrom
    build: cut(r.build || '?', EVIDENCE.textLimits.label),
    seed: r.seed === undefined || r.seed === null ? null : cut(r.seed, EVIDENCE.textLimits.label),
    date: typeof r.date === 'string' ? cut(r.date, TELEMETRY.textLimits.isoDate) : null,
    restarts: num(r.restarts),
    trips: Math.max(1, Math.round(num(c.trips, 1))),
    complete: !!r.complete,
    delivered: r.delivered === null || r.delivered === undefined ? null : num(r.delivered),
    total: r.total === null || r.total === undefined ? null : num(r.total),
    profit: r.invoice && Number.isFinite(Number(r.invoice.profit)) ? Number(r.invoice.profit) : null,
    grips: num(c.grips), drops: num(c.drops), recoveries: num(c.recoveries),
    damageEvents: num(c.damageEvents), propertyEvents: num(c.propertyEvents),
    straps: {
      placed: num(straps.placed), tensioned: num(straps.tensioned), overstressed: num(straps.overstressed),
      failed: num(straps.failed), released: num(straps.released),
    },
    cargo: { loaded: num(cargo.loaded), unloaded: num(cargo.unloaded), shifted: num(cargo.shifted), measured: num(cargo.measured) },
    toolChanges: num(c.toolChanges), partChanges: num(c.partChanges),
    piecesLeftBehind: num(c.piecesLeftBehind),
    worstCargoShift: num(c.worstCargoShift),
    phases,
    lines,
    questionnaire: q,
    answered: q ? Object.keys(q).length : 0,
    events, hasEvents,
    eventsRecorded: hasEvents ? events.length : num(r.eventsRecorded),
    walkthrough: wt,
    firstGripMs, firstLoadMs, timingSource,
  };
}

/* ── sessions ─────────────────────────────────────────────────────────────── */

const letter = (i) => String.fromCharCode(65 + (i % 26)) + (i >= 26 ? String(Math.floor(i / 26) + 1) : '');

/**
 * Group date-ordered runs into sessions — one tester's consecutive runs. A new session
 * starts when the build changes or `restarts` stops climbing (a report's restarts is the
 * number of replays before that run, so 0, 1, 2 … is one sitting).
 */
export function sessionsOf(runs) {
  const sessions = [];
  let cur = null;
  runs.forEach((r) => {
    const prev = cur ? cur.runs[cur.runs.length - 1] : null;
    const continues = prev && prev.build === r.build && r.restarts > prev.restarts;
    if (!continues) { cur = { label: `tester ${letter(sessions.length)}`, runs: [] }; sessions.push(cur); }
    cur.runs.push(r);
    r.session = cur.label;
  });
  return sessions;
}

/* ── verdicts ─────────────────────────────────────────────────────────────── */

const pct = (k, n) => (n > 0 ? `${k}/${n} = ${r2(k / n).toFixed(2)}` : `0/0`);
function mostOf(k, n, cfg) { return n === 0 ? VERDICT.NO_DATA : (k / n > cfg.most ? VERDICT.PASS : VERDICT.NOT_YET); }
function halfOf(k, n, cfg) { return n === 0 ? VERDICT.NO_DATA : (k / n >= cfg.half ? VERDICT.PASS : VERDICT.NOT_YET); }

const answerText = (q, id) => (q && typeof q[id] === 'string' ? q[id].trim() : '');
const answerScale = (q, id) => {
  if (!q) return null;
  const v = Number(q[id]);
  return Number.isFinite(v) && v >= SCALE.scaleMin && v <= SCALE.scaleMax ? v : null;
};

/* ── the report ───────────────────────────────────────────────────────────── */

/**
 * The §26.7 table plus the aggregates and the §27.3 histograms, from any list of pasted run
 * reports. Garbage entries are rejected with a reason and the rest proceed; an empty list
 * gives six 'no data' rows and zeroed aggregates. Never throws on input shape.
 * @param {any[]} rawRuns  parsed run reports (buildRunSummary output, or the compact save form)
 * @param {object} [cfg]   EVIDENCE by default
 */
export function evidenceFrom(rawRuns, cfg = EVIDENCE) {
  const rejected = [];
  const runs = [];
  (Array.isArray(rawRuns) ? rawRuns : []).forEach((r, i) => {
    const why = rejectReason(r);
    if (why) rejected.push({ index: i, reason: why });
    else runs.push(normaliseRun(r, i));
  });
  // Date order, stable: a report without a date keeps its pasted position among its peers.
  runs.sort((a, b) => ((a.date || '') < (b.date || '') ? -1 : (a.date || '') > (b.date || '') ? 1 : a.index - b.index));
  runs.forEach((r, i) => { r.id = `#${i + 1}`; });
  const sessions = sessionsOf(runs);
  const n = runs.length;
  const ids = (list) => list.map((r) => r.id);

  /* Comprehension */
  const timed = runs.filter((r) => r.timingSource !== 'none');
  const comprehends = (r) => r.firstGripMs !== null && r.firstGripMs <= cfg.comprehension.firstGripMs &&
                             r.firstLoadMs !== null && r.firstLoadMs <= cfg.comprehension.firstLoadMs;
  const compK = timed.filter(comprehends);
  const untimed = runs.filter((r) => r.timingSource === 'none');
  const withWt = timed.filter((r) => r.walkthrough && r.walkthrough.shown);
  const withoutWt = timed.filter((r) => !(r.walkthrough && r.walkthrough.shown));
  const anyWt = runs.some((r) => r.walkthrough !== null);
  const comprehension = {
    id: 'comprehension', label: SIGNAL_LABELS.comprehension, rule: cfg.rules.comprehension,
    k: compK.length, n: timed.length, value: timed.length ? r3(compK.length / timed.length) : null,
    verdict: mostOf(compK.length, timed.length, cfg),
    runIds: ids(compK),
    text: `${pct(compK.length, timed.length)} runs gripped within ${cfg.comprehension.firstGripMs / 1000} s and loaded within ${cfg.comprehension.firstLoadMs / 1000} s of sim time` +
          (anyWt ? ` · with the first-minute cards ${pct(withWt.filter(comprehends).length, withWt.length)}, without ${pct(withoutWt.filter(comprehends).length, withoutWt.length)}` : ' · walkthrough not reported (M22 key absent)'),
    note: 'The stall hint is a notice, not an event: "without coaching" is read as a first grip before CONTRACT.stallHintMs. ' +
          (untimed.length ? `${untimed.length} run(s) had no event list and no walkthrough stamps and were EXCLUDED, not scored 0: ${ids(untimed).join(' ')}.` : 'Every run carried an event list or walkthrough stamps.'),
    parts: {
      excluded: ids(untimed),
      withWalkthrough: { k: withWt.filter(comprehends).length, n: withWt.length },
      withoutWalkthrough: { k: withoutWt.filter(comprehends).length, n: withoutWt.length },
      sources: Object.fromEntries(runs.map((r) => [r.id, r.timingSource])),
    },
  };

  /* Emergent story */
  const storied = runs.filter((r) => answerText(r.questionnaire, 'q1') || answerText(r.questionnaire, 'q6'));
  const emergentStory = {
    id: 'emergentStory', label: SIGNAL_LABELS.emergentStory, rule: cfg.rules.emergentStory,
    k: storied.length, n, value: n ? r3(storied.length / n) : null,
    verdict: mostOf(storied.length, n, cfg), runIds: ids(storied),
    text: `${pct(storied.length, n)} runs wrote something for q1 or q6 (a skipped form counts as no story)`,
    note: 'A recounted event is a non-empty free-text answer to §27.3 q1 or q6.',
    parts: {},
  };

  /* Learning */
  const pairs = sessions.filter((s) => s.runs.length >= 2).map((s) => {
    const a = s.runs[0], b = s.runs[1];
    const changes = [];
    if (Math.abs(b.trips - a.trips) >= cfg.learning.tripsDelta) changes.push(`trips ${a.trips}→${b.trips}`);
    if (Math.abs(b.straps.placed - a.straps.placed) >= cfg.learning.strapsDelta) changes.push(`straps ${a.straps.placed}→${b.straps.placed}`);
    if (Math.abs(b.toolChanges - a.toolChanges) >= cfg.learning.toolDelta) changes.push(`tool use ${a.toolChanges}→${b.toolChanges}`);
    if (Math.abs(b.worstCargoShift - a.worstCargoShift) >= cfg.learning.shiftDeltaM) changes.push(`worst shift ${a.worstCargoShift}→${b.worstCargoShift} m`);
    return { session: s.label, first: a.id, second: b.id, changed: changes.length > 0, changes, runs: s.runs.length };
  });
  const changedPairs = pairs.filter((p) => p.changed);
  const learning = {
    id: 'learning', label: SIGNAL_LABELS.learning, rule: cfg.rules.learning,
    k: changedPairs.length, n: pairs.length, value: pairs.length ? r3(changedPairs.length / pairs.length) : null,
    verdict: pairs.length === 0 ? VERDICT.NO_DATA : (changedPairs.length / pairs.length >= cfg.learning.minFraction ? VERDICT.PASS : VERDICT.NOT_YET),
    runIds: changedPairs.map((p) => p.second),
    text: pairs.length
      ? `${pct(changedPairs.length, pairs.length)} testers changed their second run — ` +
        pairs.map((p) => `${p.session} ${p.changed ? 'yes (' + p.changes.join(', ') + ')' : 'no'}`).join('; ')
      : `no tester has two runs in this set (${sessions.length} session${sessions.length === 1 ? '' : 's'} of one)`,
    note: 'No tester identity by design (§27.4): a session is consecutive reports, in date order, of one build whose restarts climb. ' +
          `Changed = trips by ≥${cfg.learning.tripsDelta}, straps placed by ≥${cfg.learning.strapsDelta}, tool changes by ≥${cfg.learning.toolDelta}, or worst cargo shift by >${cfg.learning.shiftDeltaM} m.`,
    parts: { sessions: pairs, sessionCount: sessions.length },
  };

  /* Replay intent */
  const replayers = runs.filter((r) => {
    const q7 = answerScale(r.questionnaire, 'q7');
    return (q7 !== null && q7 >= cfg.replayIntent.q7Yes) || r.restarts >= 1;
  });
  const q7yes = runs.filter((r) => { const v = answerScale(r.questionnaire, 'q7'); return v !== null && v >= cfg.replayIntent.q7Yes; });
  const restarted = runs.filter((r) => r.restarts >= 1);
  const replayIntent = {
    id: 'replayIntent', label: SIGNAL_LABELS.replayIntent, rule: cfg.rules.replayIntent,
    k: replayers.length, n, value: n ? r3(replayers.length / n) : null,
    verdict: halfOf(replayers.length, n, cfg), runIds: ids(replayers),
    text: `${pct(replayers.length, n)} runs said q7 ≥ ${cfg.replayIntent.q7Yes} (${q7yes.length}) or were a replay already (restarts ≥ 1: ${restarted.length})`,
    note: 'A run that IS a replay is counted as intent whether or not the form was answered.',
    parts: { q7Yes: ids(q7yes), restarted: ids(restarted) },
  };

  /* Core preference */
  const means = {};
  const counts = {};
  for (const id of cfg.corePreference.questions) {
    const vals = runs.map((r) => answerScale(r.questionnaire, id)).filter((v) => v !== null);
    counts[id] = vals.length;
    means[id] = vals.length ? r2(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  }
  const answeredCore = Object.values(counts).some((c) => c > 0);
  const allHigh = cfg.corePreference.questions.every((id) => means[id] !== null && means[id] >= cfg.corePreference.minMean);
  const coreRuns = runs.filter((r) => cfg.corePreference.questions.some((id) => answerScale(r.questionnaire, id) !== null));
  const meanOfMeans = answeredCore
    ? r2(cfg.corePreference.questions.filter((id) => means[id] !== null).reduce((a, id) => a + means[id], 0) /
         cfg.corePreference.questions.filter((id) => means[id] !== null).length)
    : null;
  const qText = (id) => { const q = QUESTIONS.find((x) => x.id === id); return q ? `${id} (${q.low}→${q.high})` : id; };
  const corePreference = {
    id: 'corePreference', label: SIGNAL_LABELS.corePreference, rule: cfg.rules.corePreference,
    k: coreRuns.length, n, value: meanOfMeans,
    verdict: !answeredCore ? VERDICT.NO_DATA : (allHigh ? VERDICT.PASS : VERDICT.NOT_YET),
    runIds: ids(coreRuns),
    text: answeredCore
      ? cfg.corePreference.questions.map((id) => `${qText(id)} mean ${means[id] === null ? '—' : means[id].toFixed(2)} n=${counts[id]}`).join(' · ') +
        ` · every mean must reach ${cfg.corePreference.minMean}`
      : 'no scaled answers to q3/q4/q5 yet',
    note: '§27.3 q3 preparation (chore→choice), q4 predicting shift and damage, q5 the invoice (punitive→funny and useful), on the 1..5 scale with the sheet\'s words.',
    parts: { means, counts, minMean: cfg.corePreference.minMean },
  };

  /* Friction */
  const totalGrips = runs.reduce((a, r) => a + r.grips, 0);
  const totalDrops = runs.reduce((a, r) => a + r.drops, 0);
  const totalRecoveries = runs.reduce((a, r) => a + r.recoveries, 0);
  const words = cfg.friction.words.map((w) => String(w).toLowerCase());
  const mentions = runs.filter((r) => { const t = answerText(r.questionnaire, 'q1').toLowerCase(); return !!t && words.some((w) => t.includes(w)); });
  const recoveriesPerRun = n ? r3(totalRecoveries / n) : null;
  const dropsPerGrip = totalGrips > 0 ? r3(totalDrops / totalGrips) : null;
  const mentionFraction = n ? r3(mentions.length / n) : null;
  const frictionOk = n > 0 &&
    recoveriesPerRun <= cfg.friction.maxRecoveriesPerRun &&
    (dropsPerGrip === null || dropsPerGrip <= cfg.friction.maxDropsPerGrip) &&
    mentionFraction <= cfg.friction.maxMentionFraction;
  const frictionRuns = runs.filter((r) => r.recoveries > 0 || r.drops > 0 || mentions.includes(r));
  const friction = {
    id: 'friction', label: SIGNAL_LABELS.friction, rule: cfg.rules.friction,
    k: frictionRuns.length, n, value: recoveriesPerRun,
    verdict: n === 0 ? VERDICT.NO_DATA : (frictionOk ? VERDICT.PASS : VERDICT.NOT_YET),
    runIds: ids(frictionRuns),
    text: n
      ? `recoveries/run ${recoveriesPerRun.toFixed(2)} (cap ${cfg.friction.maxRecoveriesPerRun}) · drops/grip ${dropsPerGrip === null ? '— (no grips)' : dropsPerGrip.toFixed(2)} (cap ${cfg.friction.maxDropsPerGrip}, ${totalDrops}/${totalGrips}) · ` +
        `q1 mentions ${pct(mentions.length, n)} (cap ${cfg.friction.maxMentionFraction})`
      : 'no runs',
    note: `q1 is searched for: ${words.join(', ')}. Runs listed are those with a recovery, a drop or a mention.`,
    parts: { recoveriesPerRun, dropsPerGrip, mentionFraction, totalGrips, totalDrops, totalRecoveries, mentions: ids(mentions), words },
  };

  const signals = [comprehension, emergentStory, learning, replayIntent, corePreference, friction];

  return {
    runs, rejected, sessions: sessions.map((s) => ({ label: s.label, runIds: ids(s.runs) })),
    signals,
    aggregates: aggregatesOf(runs, rejected, cfg),
    histograms: histogramsOf(runs),
  };
}

/* ── aggregates and histograms ────────────────────────────────────────────── */

function aggregatesOf(runs, rejected, cfg) {
  const n = runs.length;
  const complete = runs.filter((r) => r.complete).length;
  const profits = runs.map((r) => r.profit).filter((p) => p !== null);
  const trips = {};
  for (const r of runs) trips[r.trips] = (trips[r.trips] || 0) + 1;
  const phaseSums = {}, phaseCounts = {};
  for (const r of runs) for (const [k, v] of Object.entries(r.phases)) { phaseSums[k] = (phaseSums[k] || 0) + v; phaseCounts[k] = (phaseCounts[k] || 0) + 1; }
  const phases = {};
  for (const k of Object.keys(phaseSums)) phases[k] = Math.round(phaseSums[k] / phaseCounts[k]);
  const sumKind = (kind) => r2(runs.reduce((a, r) => a + r.lines.filter((l) => l.kind === kind).reduce((s, l) => s + num(l.amount), 0), 0));
  const runsWith = (kind) => runs.filter((r) => r.lines.some((l) => l.kind === kind)).length;
  const recoveriesByKind = {}, dropsByReason = {};
  for (const r of runs) {
    if (r.hasEvents) {
      for (const e of r.events) {
        if (!isObj(e)) continue;
        if (e.type === EVENTS.RECOVERY) {
          const kind = cut(e.kind || (e.toolId ? 'tool' : 'mover'), TELEMETRY.textLimits.counterKey);
          recoveriesByKind[kind] = (recoveriesByKind[kind] || 0) + 1;
        } else if (e.type === EVENTS.GRIP_ENDED && e.reason !== 'released') {
          const reason = cut(e.reason || 'unknown', TELEMETRY.textLimits.counterKey);
          dropsByReason[reason] = (dropsByReason[reason] || 0) + 1;
        }
      }
    } else {
      if (r.recoveries) recoveriesByKind.unattributed = (recoveriesByKind.unattributed || 0) + r.recoveries;
      if (r.drops) dropsByReason.unattributed = (dropsByReason.unattributed || 0) + r.drops;
    }
  }
  const edges = cfg.shiftBinsM;
  const shiftBins = edges.map((e, i) => ({ label: i === 0 ? `≤ ${e.toFixed(2)} m` : `${edges[i - 1].toFixed(2)}–${e.toFixed(2)} m`, count: 0 }));
  shiftBins.push({ label: `> ${edges[edges.length - 1].toFixed(2)} m`, count: 0 });
  for (const r of runs) {
    let b = edges.findIndex((e) => r.worstCargoShift <= e);
    if (b < 0) b = edges.length;
    shiftBins[b].count++;
  }
  const straps = { placed: 0, tensioned: 0, overstressed: 0, failed: 0, released: 0 };
  for (const r of runs) for (const k of Object.keys(straps)) straps[k] += r.straps[k];
  return {
    runs: n, rejected: rejected.length,
    builds: [...new Set(runs.map((r) => r.build))],
    complete, completionRate: n ? r3(complete / n) : null,
    profit: {
      n: profits.length,
      mean: profits.length ? r2(profits.reduce((a, b) => a + b, 0) / profits.length) : null,
      min: profits.length ? Math.min(...profits) : null,
      max: profits.length ? Math.max(...profits) : null,
    },
    trips,
    phases,
    damage: {
      furnitureTotal: sumKind(cfg.lineKinds.damage), propertyTotal: sumKind(cfg.lineKinds.property),
      leftBehindTotal: sumKind(cfg.lineKinds.leftBehind), partsLeftTotal: sumKind(cfg.lineKinds.partsLeft),
      leftBehindRuns: runsWith(cfg.lineKinds.leftBehind),
      damageEvents: runs.reduce((a, r) => a + r.damageEvents, 0),
      propertyEvents: runs.reduce((a, r) => a + r.propertyEvents, 0),
      runsWithLines: runs.filter((r) => r.lines.length > 0).length,
    },
    recoveriesByKind, dropsByReason,
    recoveries: runs.reduce((a, r) => a + r.recoveries, 0),
    grips: runs.reduce((a, r) => a + r.grips, 0),
    drops: runs.reduce((a, r) => a + r.drops, 0),
    worstShift: { bins: shiftBins, max: n ? Math.max(...runs.map((r) => r.worstCargoShift)) : null },
    straps,
    restarted: runs.filter((r) => r.restarts >= 1).length,
    eventsMissing: runs.filter((r) => !r.hasEvents).length,
    walkthroughReported: runs.filter((r) => r.walkthrough !== null).length,
  };
}

function histogramsOf(runs) {
  const questions = QUESTIONS.map((q) => {
    if (q.kind === 'scale') {
      const counts = [];
      for (let v = SCALE.scaleMin; v <= SCALE.scaleMax; v++) counts.push(0);
      let sum = 0, answered = 0;
      for (const r of runs) {
        const v = answerScale(r.questionnaire, q.id);
        if (v === null) continue;
        counts[v - SCALE.scaleMin]++; sum += v; answered++;
      }
      return { id: q.id, kind: 'scale', text: q.text, low: q.low, high: q.high, counts, answered, mean: answered ? r2(sum / answered) : null };
    }
    const answers = [];
    for (const r of runs) {
      const t = answerText(r.questionnaire, q.id);
      if (t) answers.push({ runId: r.id, text: cut(t, TELEMETRY.textMax) });
    }
    return { id: q.id, kind: 'text', text: q.text, answers, answered: answers.length };
  });
  return { questions, scaleMin: SCALE.scaleMin, scaleMax: SCALE.scaleMax };
}

/* ── Markdown export (docs/PLAYTEST_NOTES.md) ─────────────────────────────── */

const cell = (s) => String(s == null ? '' : s).replace(/\|/g, '/').replace(/\r?\n/g, ' ');
const money = (v) => (v === null || v === undefined ? '—' : (v < 0 ? '−' : '') + Math.abs(v).toFixed(2));

/** The §26.7 table, the aggregates and the histograms as Markdown — one paste into PLAYTEST_NOTES. */
export function evidenceMarkdown(ev, opts = {}) {
  const a = ev.aggregates;
  const out = [];
  out.push('# Movers From Hell — §26.7 evidence report');
  out.push(`Build(s): ${a.builds.length ? a.builds.join(', ') : '—'} · ${a.runs} run${a.runs === 1 ? '' : 's'} (${a.rejected} rejected)` +
           (opts.date ? ` · ${cell(opts.date)}` : '') + ' · computed in the browser from pasted run reports, nothing uploaded');
  out.push('');
  out.push('| Signal | Minimum evidence before Unity commitment (§26.7) | Measured | Verdict | Runs |');
  out.push('|---|---|---|---|---|');
  for (const s of ev.signals) {
    out.push(`| ${cell(s.label)} | ${cell(s.rule)} | ${cell(s.text)} | ${cell(s.verdict)} | ${cell(s.runIds.join(' ') || '—')} |`);
  }
  out.push('');
  out.push('## Aggregates');
  out.push(`- runs ${a.runs}, complete ${a.complete}${a.runs ? ` (${Math.round((a.completionRate || 0) * 100)}%)` : ''}, mean profit ${money(a.profit.mean)} (min ${money(a.profit.min)}, max ${money(a.profit.max)}, n=${a.profit.n})`);
  out.push(`- trips: ${Object.keys(a.trips).length ? Object.entries(a.trips).map(([t, c]) => `${t} trip${t === '1' ? '' : 's'} × ${c}`).join(', ') : '—'}; replays in the set ${a.restarted}`);
  out.push(`- phase means (s): ${Object.keys(a.phases).length ? Object.entries(a.phases).map(([k, v]) => `${k} ${(v / 1000).toFixed(1)}`).join(', ') : '—'}`);
  out.push(`- damage lines: furniture ${money(a.damage.furnitureTotal)}, property ${money(a.damage.propertyTotal)}; left behind ${money(a.damage.leftBehindTotal)} in ${a.damage.leftBehindRuns} run(s), parts left ${money(a.damage.partsLeftTotal)}; damage events ${a.damage.damageEvents}, property events ${a.damage.propertyEvents}`);
  out.push(`- recoveries ${a.recoveries} by kind: ${fmtMap(a.recoveriesByKind)}; drops ${a.drops} of ${a.grips} grips by reason: ${fmtMap(a.dropsByReason)}`);
  out.push(`- worst cargo shift: ${a.worstShift.bins.map((b) => `${b.label} × ${b.count}`).join(', ')}; max ${a.worstShift.max === null ? '—' : a.worstShift.max.toFixed(3) + ' m'}`);
  out.push(`- straps: placed ${a.straps.placed}, tensioned ${a.straps.tensioned}, overstressed ${a.straps.overstressed}, failed ${a.straps.failed}, released ${a.straps.released}`);
  out.push(`- runs without an event list: ${a.eventsMissing}; runs reporting the walkthrough key: ${a.walkthroughReported}`);
  out.push('');
  out.push('## §27.3 questions');
  for (const q of ev.histograms.questions) {
    if (q.kind === 'scale') {
      const bars = q.counts.map((c, i) => `${i + ev.histograms.scaleMin}:${c}`).join(' ');
      out.push(`- ${q.id} ${cell(q.text)} — ${bars} (${cell(q.low)} → ${cell(q.high)}), mean ${q.mean === null ? '—' : q.mean.toFixed(2)}, n=${q.answered}`);
    } else {
      out.push(`- ${q.id} ${cell(q.text)} — ${q.answered} answer${q.answered === 1 ? '' : 's'}` +
               (q.answers.length ? ': ' + q.answers.map((x) => `${x.runId} "${cell(x.text)}"`).join('; ') : ''));
    }
  }
  out.push('');
  out.push('## Notes');
  for (const s of ev.signals) if (s.note) out.push(`- ${cell(s.label)}: ${cell(s.note)}`);
  if (ev.rejected.length) out.push(`- rejected: ${ev.rejected.map((r) => `item ${r.index + 1} (${cell(r.reason)})`).join('; ')}`);
  return out.join('\n') + '\n';
}

function fmtMap(m) {
  const ks = Object.keys(m);
  return ks.length ? ks.map((k) => `${k} ${m[k]}`).join(', ') : '—';
}
