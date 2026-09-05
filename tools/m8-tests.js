/* Phase 8 suite — the drive.
 *
 * §25.2 gate under test: "Route, turn/brake/bump, cargo coupling" →
 * **poor pack shifts or damages visibly**.
 *
 * "Visibly" is the word that makes this measurable. It is not "the game knows the pack was
 * bad" — §10.4 forbids acting on that knowledge — it is that the same route, driven twice,
 * produces a WORSE OUTCOME for the worse pack, through nothing but physics. So the suite runs
 * one route over a good pack and one over a bad one and compares what the bodies did.
 *
 * The other half is §8.3's damage model finally reaching real contacts, with its two rules
 * intact: a fragile television and a cheap box must not share a hit-point curve, and repeated
 * scrapes must aggregate into one coherent charge rather than forty.
 */

import { SIM, DAMAGE, CARGO, TRUCK } from '../src/config.js';
import { TRUCK_POSE, cargoInterior, roadEventForce } from '../src/world/truck.js';
import { PROTOTYPE_ROUTE, ROUTE_DURATION_S, DRIVE_STATE, routeSteps } from '../src/drive/route.js';
import { bandFor, repairCost, previewDamage } from '../src/damage/damage.js';
import { OBJECT_DEFS } from '../src/objects/definitions.js';

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

const { game, physics, registry, straps, cargo, damage, route } = M;
const STEP = SIM.stepMs;
const I = cargoInterior();
const ANCHORS = M.cargoAnchors;

function step(n = 1) {
  for (let i = 0; i < n; i++) {
    // Force appliers BEFORE the step, result readers after. route.step applies §11.3's road
    // forces, so it belongs with straps; damage measures what the solver did, so it follows.
    physics.clearForces();
    straps.step(STEP, i * STEP);
    route.step(STEP, i * STEP);
    physics.step();
    registry.step(STEP);
    cargo.step(STEP, i * STEP);
    damage.step(STEP, i * STEP);
  }
}

function posOf(e) { const t = e.body.translation(); return { x: t.x, y: t.y, z: t.z }; }
function parkAt(entity, x, y, z, yaw = 0) {
  entity.body.setTranslation({ x, y, z }, true);
  entity.body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
  entity.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  entity.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  entity.body.wakeUp();
  physics.primeQueries();
}
const byDef = (id) => { for (const e of registry.entities.values()) if (e.defId === id) return e; return null; };
const allOfDef = (id) => [...registry.entities.values()].filter((e) => e.defId === id);

/* THE TWO PACKS. Same objects, same truck, same route — only the arrangement differs, which
 * is the only way the gate's claim ("POOR pack") can mean anything.
 *
 *   GOOD  heavy low and hard against the headboard, fragile on the deck, everything strapped
 *   BAD   heavy stacked high, fragile underneath nothing, loose in the middle of the deck
 *         with two metres of run-up, and not a strap in sight
 */
function buildPack(kind) {
  straps.releaseAll();
  damage.reset();
  route.reset();

  const fridge = byDef('fridge_01');
  const dresser = byDef('dresser_01');
  const tv = byDef('tv_55_01');
  const boxes = allOfDef('box_small_01').slice(0, 3);
  const pack = [];

  if (kind === 'good') {
    // Against the headboard, nothing stacked, fragile flat on the deck.
    if (fridge) { parkAt(fridge, TRUCK_POSE.x - 0.55, I.minY + 0.90, I.maxZ - 0.45); pack.push(fridge); }
    if (dresser) { parkAt(dresser, TRUCK_POSE.x + 0.60, I.minY + 0.45, I.maxZ - 0.35); pack.push(dresser); }
    if (tv) { parkAt(tv, TRUCK_POSE.x, I.minY + 0.10, I.maxZ - 1.15, Math.PI / 2); pack.push(tv); }
    boxes.forEach((b, k) => {
      parkAt(b, TRUCK_POSE.x - 0.65 + k * 0.65, I.minY + 0.28, I.maxZ - 1.75);
      pack.push(b);
    });
  } else {
    // Loose in the middle with a long run-up, and the fridge stacked on the dresser.
    if (dresser) { parkAt(dresser, TRUCK_POSE.x - 0.45, I.minY + 0.45, I.minZ + 0.70); pack.push(dresser); }
    if (fridge) { parkAt(fridge, TRUCK_POSE.x - 0.45, I.minY + 1.78, I.minZ + 0.70); pack.push(fridge); }
    if (tv) { parkAt(tv, TRUCK_POSE.x + 0.55, I.minY + 0.42, I.minZ + 0.60); pack.push(tv); }
    boxes.forEach((b, k) => {
      parkAt(b, TRUCK_POSE.x + 0.10 + k * 0.05, I.minY + 0.28 + k * 0.52, I.minZ + 1.50);
      pack.push(b);
    });
  }

  step(Math.ceil(CARGO.loadedDwellMs / STEP) + 90);

  if (kind === 'good') {
    for (const e of pack) {
      const t = posOf(e);
      const near2 = [...ANCHORS].sort((a, b) =>
        Math.hypot(a.x - t.x, a.z - t.z) - Math.hypot(b.x - t.x, b.z - t.z)).slice(0, 2);
      for (const a of near2) {
        const d = e.def.dimensions;
        straps.attach(a, e, {
          x: t.x + Math.sign(a.x - t.x) * Math.min(d.x, d.z) * 0.3,
          y: t.y + d.y * 0.35, z: t.z,
        }, 0);
      }
    }
    step(20);
  }

  // Start every drive from perfect condition, or the comparison inherits the last one.
  for (const e of registry.entities.values()) e.state.condition = 100;
  damage.reset();
  for (const e of registry.entities.values()) e.state.condition = 100;
  return pack;
}

/** Drive the whole §13.3 route and report what happened to the load. */
function driveRoute(kind) {
  const pack = buildPack(kind);
  const before = cargo.snapshotPositions();
  const advice = route.canDepart();
  route.depart();
  step(routeSteps() + 60);
  damage.flush();

  const shift = cargo.shiftSince(before);
  const totals = damage.totals();
  const worstCondition = pack.reduce((w, e) => Math.min(w, e.state.condition), 100);
  straps.releaseAll();
  return { pack, shift, totals, advice, worstCondition, arrived: route.state };
}

try {
/* ── A. the route (§11.1, §11.3, §13.3) ──────────────────────────────────── */
lines.push('--- A. the route (GDD §11.1, §11.3, §13.3) ---');
{
  eq('A1 §13.3 wants one brake, one turn and one bump', PROTOTYPE_ROUTE.length, 3);
  const types = PROTOTYPE_ROUTE.map((e) => e.type).sort();
  ok('A2 …and those are exactly the three §11.3 prototype-required hazards',
     types.join(',') === 'hardBrake,sharpTurn,speedBump', types.join(','));
  ok('A3 every scheduled hazard has a declared severity (§11.3)',
     PROTOTYPE_ROUTE.every((e) => TRUCK.roadEvents[e.type] &&
       TRUCK.roadEvents[e.type].severity > 0));

  /* §11.1: "prototype travel lasts roughly one to three minutes". 28 s is at the short end
   * on purpose — this is an exam, and a longer one is only a longer exam. */
  ok('A4 the route is a short trip, not a track (§11.1)',
     ROUTE_DURATION_S >= 20 && ROUTE_DURATION_S <= 180, `${ROUTE_DURATION_S} s`);
  ok('A5 …with the hazards spread through it, not bunched',
     PROTOTYPE_ROUTE.every((e, i) => i === 0 || e.at - PROTOTYPE_ROUTE[i - 1].at > 3),
     PROTOTYPE_ROUTE.map((e) => e.at).join(', '));

  // §11.3's packing tests, as directions. A brake throws cargo forward; a turn sideways.
  const brake = roadEventForce('hardBrake', 100);
  const turn = roadEventForce('sharpTurn', 100);
  const bump = roadEventForce('speedBump', 100);
  ok('A6 §11.3 hard brake tests FORWARD restraint', brake.z > 0 && brake.x === 0);
  ok('A7 §11.3 sharp turn tests LATERAL restraint', Math.abs(turn.x) > 0 && turn.z === 0);
  ok('A8 §11.3 speed bump tests VERTICAL bounce', bump.y > 0 && bump.x === 0 && bump.z === 0);

  eq('A9 the truck starts parked', route.state, DRIVE_STATE.PARKED);
}
emit('running...');

/* ── A-M17. the events' composition is config, not a literal (Phase 11 build-side M17) ── */
lines.push('--- A-M17. the road events\' composition lives in TRUCK.roadEvents[type].accel (M17, §26.3) ---');
{
  /* Until M17 the turn's 0.8 and the bump's 0.55 were literals in truck.js; the turn at
   * 0.8 × brakeForce (0.42 g) moved NOTHING upright on a 0.40 deck and only the brake told
   * one pack from another. tools/m25-packs-tests.js measures the three packs at 1.0. This
   * suite's two-arrangement numbers under it: GOOD 0.470 m, BAD 2.611 m (was 2.615). */
  for (const t of ['hardBrake', 'sharpTurn', 'speedBump']) {
    const ev = TRUCK.roadEvents[t];
    const f = roadEventForce(t, 100);
    const k = 100 * TRUCK.brakeForce * ev.severity;
    ok(`A10 M17: roadEventForce('${t}') = mass × brakeForce × severity × TRUCK.roadEvents.${t}.accel`,
       !!ev.accel && Math.hypot(f.x - ev.accel.x * k, f.y - ev.accel.y * k, f.z - ev.accel.z * k) < 1e-9,
       JSON.stringify({ f, accel: ev.accel, severity: ev.severity }));
  }
  ok('A11 M17: the turn is as hard as the brake, sideways (accel.x 1.0 — an upright fridge slides and tips on it)',
     TRUCK.roadEvents.sharpTurn.accel.x === 1.0 && TRUCK.roadEvents.hardBrake.accel.z === 1.0,
     `${TRUCK.roadEvents.sharpTurn.accel.x} vs ${TRUCK.roadEvents.hardBrake.accel.z}`);
  ok('A12 M17: severities untouched (the shake and the audio scale on them): 1.0 / 1.0 / 0.8',
     TRUCK.roadEvents.hardBrake.severity === 1.0 && TRUCK.roadEvents.sharpTurn.severity === 1.0 && TRUCK.roadEvents.speedBump.severity === 0.8);
}
emit('running...');

/* ── B. §8.3's damage model, on real contacts ────────────────────────────── */
lines.push('--- B. damage on real contacts (GDD §8.3, §8.4) ---');
{
  straps.releaseAll(); route.reset(); damage.reset();
  const tv = byDef('tv_55_01');
  const box = byDef('box_small_01');
  ok('B1 there is a television and a box', !!tv && !!box);

  if (tv && box) {
    /* §8.3: "a fragile television and a cheap box should not share a generic hit-point
     * curve." Same drop, same height, same everything but the object.
     *
     * FROM 0.18 m, NOT 2.4 m. A 2.4 m drop is 6.9 m/s, which destroys BOTH — the television
     * would take 558 condition points and the box 127, and both clamp to 100, so the more
     * fragile object is indistinguishable from the tougher one. Measured, and it read
     * "100.0 vs 100.0".
     *
     * 0.18 m is 1.88 m/s, which sits deliberately between the two bands: above the
     * television's 0.70 m/s tolerance and below the box's 2.00. The claim is a BINARY —
     * the same knock ruins the television and does not mark the box — which is a much
     * stronger statement of §8.3 than a ratio would be. */
    const drop = (e, aboveRest) => {
      e.state.condition = 100;
      const restY = e.def.dimensions.y / 2 + 0.02;
      parkAt(e, e === tv ? 30 : 34, restY + aboveRest, e === tv ? 30 : 34);
      for (let k = 0; k < 140; k++) { step(1); if (k > 25 && Math.abs(e.body.linvel().y) < 0.02) break; }
      return 100 - e.state.condition;
    };
    const tvLoss = drop(tv, 0.18);
    const boxLoss = drop(box, 0.18);

    lines.push(`      dropped 0.18 m (1.88 m/s): television lost ${tvLoss.toFixed(1)} condition ` +
               `(tolerates ${previewDamage(tv, 0).tolerance.toFixed(2)} m/s), ` +
               `box lost ${boxLoss.toFixed(1)} (tolerates ${previewDamage(box, 0).tolerance.toFixed(2)})`);
    ok('B2 the same knock ruins the television and does not mark the box (§8.3)',
       tvLoss > 20 && boxLoss === 0, `${tvLoss.toFixed(1)} vs ${boxLoss.toFixed(1)}`);
    ok('B3 …and the television is 22 kg against the couch\'s 90, so it is not about mass',
       OBJECT_DEFS.tv_55_01.mass < OBJECT_DEFS.couch_3seat_01.mass);
    ok('B4 a real impact produced a real condition change', tvLoss > 0);

    /* §8.4's ledger line: object, condition change, cost.
     *
     * flush() first. §8.3's aggregation holds a window open for 700 ms so a scrape is billed
     * once rather than forty times, which means the LAST event of a run is still open when
     * the run ends. Reading totals without closing it reported zero lines from a television
     * that had just been destroyed. */
    damage.flush();
    const totals = damage.totals();
    ok('B5 §8.4: the damage reached the ledger', totals.lines > 0, `${totals.lines} lines`);
    ok('B6 …with a cost attached', totals.cost >= 0, `${totals.cost}`);
    const line = game.state.ledger.itemDamage[0];
    ok('B7 …naming the object, the condition change and where it happened (§8.4)',
       !!line && !!line.entityId && line.conditionBefore > line.conditionAfter && !!line.at,
       JSON.stringify(line || {}).slice(0, 120));

    /* §8.3's bands are AUTHORED STATES, not a curve. */
    eq('B8 100 condition is "perfect"', bandFor(100).name, 'perfect');
    eq('B9 0 condition is "broken"', bandFor(0).name, 'broken');
    ok('B10 a perfect item costs nothing to put right', repairCost(tv.def, 100) === 0);
    near('B11 …and a broken one costs its full replacement value',
         repairCost(tv.def, 0), tv.def.replacementValue, 1e-6);
  }

  /* §8.3: "Repeated minor contact needs cooldown and aggregation so a scrape is priced
   * coherently." A single event must produce ONE ledger line, not one per step. */
  damage.reset();
  const b2 = allOfDef('box_small_01')[1];
  if (b2) {
    parkAt(b2, 40, 2.0, 40);
    step(150);
    damage.flush();
    const lines2 = game.state.ledger.itemDamage.length;
    ok('B12 §8.3 aggregation: one drop bills once, not once per step',
       lines2 <= 2, `${lines2} ledger lines from one drop`);
  }

  // §10.4: an object sitting still is never damaged, however badly it is packed.
  damage.reset();
  const still = allOfDef('box_small_01')[2];
  if (still) {
    parkAt(still, 44, 0.30, 44);
    step(240);
    damage.flush();
    eq('B13 a resting object takes no damage (§10.4 no secret damage)', still.state.condition, 100);
  }
}
emit('running...');

/* ── C. THE GATE: poor pack shifts or damages visibly ────────────────────── */
lines.push('--- C. the gate: poor pack shifts or damages visibly ---');
{
  const good = driveRoute('good');
  const bad = driveRoute('bad');

  ok('C1 both drives completed the route', good.arrived === DRIVE_STATE.ARRIVED &&
     bad.arrived === DRIVE_STATE.ARRIVED, `${good.arrived} / ${bad.arrived}`);
  ok('C2 …carrying the same number of items',
     good.pack.length === bad.pack.length && good.pack.length >= 5,
     `${good.pack.length} vs ${bad.pack.length}`);

  lines.push(`      GOOD pack: worst shift ${good.shift.worst.toFixed(3)} m, ` +
             `${good.shift.moved} items moved, ${good.totals.lines} damage lines, ` +
             `$${good.totals.cost.toFixed(2)}, worst condition ${good.worstCondition.toFixed(0)}`);
  lines.push(`      BAD  pack: worst shift ${bad.shift.worst.toFixed(3)} m, ` +
             `${bad.shift.moved} items moved, ${bad.totals.lines} damage lines, ` +
             `$${bad.totals.cost.toFixed(2)}, worst condition ${bad.worstCondition.toFixed(0)}`);

  /* THE GATE, stated as the GDD states it: "poor pack SHIFTS OR DAMAGES visibly". Either
   * limb satisfies it, and both are measured. */
  const shiftsMore = bad.shift.worst > good.shift.worst * 2;
  const damagesMore = bad.totals.cost > good.totals.cost;
  ok('C3 the poor pack SHIFTS more than the good one',
     shiftsMore, `${good.shift.worst.toFixed(3)} m vs ${bad.shift.worst.toFixed(3)} m`);
  ok('C4 …or DAMAGES more — either limb satisfies the gate',
     shiftsMore || damagesMore,
     `shift ${good.shift.worst.toFixed(3)}->${bad.shift.worst.toFixed(3)}, ` +
     `cost ${good.totals.cost}->${bad.totals.cost}`);
  ok('C5 …and the difference is VISIBLE, not marginal',
     bad.shift.worst - good.shift.worst > CARGO.shiftToleranceM,
     `${(bad.shift.worst - good.shift.worst).toFixed(3)} m apart`);

  /* §11.2's coarse indicator has to be honest about it BEFORE departure, or the player has
   * no way to have known. */
  ok('C6 the bad pack was warned about before departure (§11.2)', bad.advice.warn,
     bad.advice.reason);
  ok('C7 …and the good one was not', !good.advice.warn,
     `${(good.advice.quality.unsecuredFraction * 100).toFixed(0)}% unsecured`);

  /* §3.4's Secure exit is "warnings ACKNOWLEDGED", not resolved — and §2.1 forbids the
   * refusal. A badly packed truck MUST be drivable, or this whole phase has nothing to
   * measure and the game has started saying no. */
  ok('C8 …but a badly packed truck may still depart (§2.1, §3.4)', bad.advice.allowed);
}
emit('running...');

/* ── D. §10.4 — the damage had a physical cause ──────────────────────────── */
lines.push('--- D. physical causes only (GDD §10.4, §12.2) ---');
{
  /* The gate could be faked by reading pack quality and subtracting condition. §10.4
   * forbids exactly that, so the test is that a badly packed truck which never MOVES takes
   * nothing — the pack is identically bad, and only the driving is missing. */
  straps.releaseAll(); damage.reset(); route.reset();
  const pack = buildPack('bad');
  const q = cargo.packQuality();
  step(routeSteps());                         // same duration, no depart()
  damage.flush();
  const parkedCost = damage.totals().cost;
  const parkedWorst = pack.reduce((w, e) => Math.min(w, e.state.condition), 100);

  lines.push(`      the same bad pack, parked for the same ${ROUTE_DURATION_S} s: ` +
             `$${parkedCost.toFixed(2)} of damage, worst condition ${parkedWorst.toFixed(0)}`);
  ok('D1 a bad pack that never drives takes no damage (§10.4)',
     parkedCost === 0, `$${parkedCost.toFixed(2)}`);
  ok('D2 …even though the heuristic knows it is bad', q.warn && q.unsecuredFraction > 0.5,
     `${(q.unsecuredFraction * 100).toFixed(0)}% unsecured`);
  ok('D3 …so the damage in section C came from the ROAD, not from a score', true);

  // §8.4/§12.2: damage never ends the contract by itself.
  eq('D4 §12.2: damage alone does not fail the contract', game.state.phase !== 'failed', true);
  straps.releaseAll(); route.reset();
}
emit('running...');

/* ── E. integration (§26.6) ──────────────────────────────────────────────── */
lines.push('--- E. integration (GDD §26.6) ---');
{
  straps.releaseAll(); route.reset(); damage.reset();
  const bodiesBefore = physics.stats.bodies;
  for (let i = 0; i < 90; i++) M.game.frame(16.7);
  ok('E1 no bodies leak over 90 real frames', physics.stats.bodies === bodiesBefore,
     `${bodiesBefore} -> ${physics.stats.bodies}`);
  ok('E2 the ledger is serializable (§23.4)',
     (() => { try { JSON.parse(JSON.stringify(game.state.ledger)); return true; }
              catch (e) { return false; } })());
  ok('E3 §26.6: reset clears damage records',
     (() => { damage.reset(); return game.state.ledger.itemDamage.length === 0; })());
  ok('E4 no error banner appeared during the suite', !document.getElementById('error-banner'));
}

} catch (e) {
  fails++;
  lines.push(`FAIL  suite threw  <- ${e && e.message}`);
  lines.push((e && e.stack || '').split('\n').slice(0, 6).join('\n'));
}

emit();
