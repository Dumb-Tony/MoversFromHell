/* Phase 7 suite — cargo.
 *
 * §25.2 gate under test: "Interior, loading, stacks, anchors, straps" →
 * **secured pack remains stable**.
 *
 * "Stable" only means something against an unstable baseline, so the gate is measured as a
 * paired road event: the same objects, in the same places, hit by the same §11.3 hard brake,
 * strapped and unstrapped. If straps do not change how far the pack moves, they are decor.
 *
 * The other half of the phase is §10.1's "NOTHING TELEPORTS INTO STORAGE". There is no
 * inventory here to test — the assertions are that the cargo box is a real closed volume,
 * that loading requires physically crossing into it AND settling, and that a strap is a
 * one-sided rope with §10.3's four reachable states.
 */

import { SIM, STRAP, CARGO, TRUCK } from '../src/config.js';
import {
  TRUCK_POSE, CARGO_BOX, CARGO_VOLUME, cargoInterior, cargoColliders,
  cargoAnchors, insideCargo, roadEventForce,
} from '../src/world/truck.js';
import { STRAP_STATE } from '../src/cargo/straps.js';
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

const { game, physics, registry, movers, tools, straps, cargo } = M;
const STEP = SIM.stepMs;

/* Steps the sim the way main.js does, minus player input — this phase is about cargo, and
 * driving two movers around would only add noise. Order matters: clear, straps, physics,
 * objects, cargo. */
function step(n = 1, roadEvent = null) {
  for (let i = 0; i < n; i++) {
    physics.clearForces();
    straps.step(STEP, i * STEP);
    if (roadEvent) cargo.applyRoadEvent(roadEvent);
    physics.step();
    registry.step(STEP);
    cargo.step(STEP, i * STEP);
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

const I = cargoInterior();
const ANCHORS = cargoAnchors();

/** Park a set of entities in a row on the deck, and let them settle in. */
function loadPack() {
  straps.releaseAll();
  const couch = byDef('couch_3seat_01');
  const fridge = byDef('fridge_01');
  const dresser = byDef('dresser_01');
  const boxes = allOfDef('box_small_01').slice(0, 3);

  /* PACKED AGAINST THE REAR, WITH CLEAR DECK AHEAD — and that is the whole fixture.
   *
   * The first version packed heavy items hard against the headboard, which is good advice
   * for a real move and useless as a test: a §11.3 hard brake throws cargo FORWARD, and
   * cargo already touching the front wall has nowhere to go. Measured, the unstrapped pack
   * shifted 7 mm and the gate could not be distinguished from a strapped one.
   *
   * Everything therefore sits in the rear 2 m with about 2 m of empty deck in front of it,
   * which is exactly the badly-loaded truck the phase is about. `heavy` is a `box_heavy_01`
   * rather than the couch: the couch is 2.10 m long against a 2.10 m interior width, so it
   * only fits lengthwise and then fills the box, leaving nothing to slide. */
  void couch;
  const heavy = byDef('box_heavy_01');
  const pack = [];
  if (fridge) { parkAt(fridge, TRUCK_POSE.x - 0.55, I.minY + 0.90, I.minZ + 0.55); pack.push(fridge); }
  if (dresser) { parkAt(dresser, TRUCK_POSE.x + 0.60, I.minY + 0.45, I.minZ + 0.50); pack.push(dresser); }
  boxes.forEach((b, k) => {
    parkAt(b, TRUCK_POSE.x - 0.65 + k * 0.65, I.minY + 0.28, I.minZ + 1.35);
    pack.push(b);
  });
  if (heavy) { parkAt(heavy, TRUCK_POSE.x, I.minY + 0.24, I.minZ + 1.95); pack.push(heavy); }

  // §10.2 requires crossing in AND settling, so the dwell has to actually elapse.
  step(Math.ceil(CARGO.loadedDwellMs / STEP) + 70);
  return pack;
}

/** Strap every loaded item to its two nearest anchors, tensioned. */
function strapPack(pack) {
  for (const e of pack) {
    const t = posOf(e);
    const sorted = [...ANCHORS].sort((a, b) =>
      Math.hypot(a.x - t.x, a.z - t.z) - Math.hypot(b.x - t.x, b.z - t.z));
    for (const a of sorted.slice(0, 2)) {
      const d = e.def.dimensions;
      // Hook near the top of the item on the side facing that anchor — a strap over the top
      // is what actually restrains, and it is what makes strap ANGLE matter (§10.3).
      const hook = {
        x: t.x + Math.sign(a.x - t.x) * Math.min(d.x, d.z) * 0.3,
        y: t.y + d.y * 0.35,
        z: t.z,
      };
      /* NO PRE-LOAD. attach(..., 0) already sets the rest length to the current separation,
       * so the strap is taut with zero force — which is what a correctly fitted strap is.
       *
       * Ratcheting it tighter is not "more secure", it is squeezing: at 40 000 N/m, four
       * 8 mm clicks is 1280 N, and MEASURED that dragged the strapped pack 0.231 m sideways
       * into the walls while the unstrapped one moved 0.007 m. The straps were doing more
       * damage than the brake. A strap resists motion; it should not cause any. */
      straps.attach(a, e, hook, 0);
    }
  }
}

/**
 * THE GATE. Run a §11.3 hard brake over a loaded pack and report how far it moved.
 * Identical setup both times; the only difference is whether straps are on.
 */
function brakeTest(useStraps) {
  const pack = loadPack();
  if (useStraps) strapPack(pack);
  step(30);                                   // let the straps take up
  const before = cargo.snapshotPositions();
  // A hard brake lasts about a second at TRUCK.brakeForce.
  step(60, 'hardBrake');
  step(90);                                   // and then everything settles again
  const shift = cargo.shiftSince(before);
  const quality = cargo.packQuality();
  straps.releaseAll();
  return { shift, quality, packSize: pack.length };
}

try {
/* ── A. the cargo box is a real space (§10.1, §13.1) ─────────────────────── */
lines.push('--- A. a real cargo box (GDD §10.1, §13.1) ---');
{
  const cols = cargoColliders();
  ok('A1 the box has floor, two sides, a headboard and a roof', cols.length === 5,
     cols.map((c) => c.tag).join(', '));

  /* §10.1 lists a DOOR, and the rear must therefore be open — the whole phase depends on
   * being able to carry a couch in through it. Asserted as the absence of a collider at the
   * rear face rather than trusted. */
  /* Tested as a POINT in the doorway rather than by pattern-matching collider bounds. The
   * first version asked whether any truck collider spanned the rear face, and the ROOF does
   * — it runs the full length of the box, 3.2 m up. It reported the door as walled shut. */
  const doorway = { x: TRUCK_POSE.x, y: CARGO_BOX.deckY + 0.9, z: I.minZ - CARGO_BOX.wallT / 2 };
  const blocks = (p) => M.world.colliders.filter((c) =>
    p.x > c.minX && p.x < c.maxX && p.z > c.minZ && p.z < c.maxZ && p.y > c.base && p.y < c.top);
  ok('A2 the rear is open at carry height — that is the door (§10.1)',
     blocks(doorway).length === 0, blocks(doorway).map((c) => c.tag).join(', '));

  // …and the rest of the box is genuinely closed, or "inside" would mean nothing.
  const throughSide = { x: I.minX - CARGO_BOX.wallT / 2, y: CARGO_BOX.deckY + 0.9, z: TRUCK_POSE.z };
  ok('A3 …but the sides are solid', blocks(throughSide).length > 0);

  near('A4 the deck is 1.20 m, matching the ramp tool\'s deck height', CARGO_BOX.deckY, 1.20, 1e-9);

  ok('A5 §13.1 asks for 4-8 anchors', ANCHORS.length >= 4 && ANCHORS.length <= 8,
     `${ANCHORS.length}`);
  ok('A6 …with distinct ids (§22.4)', new Set(ANCHORS.map((a) => a.id)).size === ANCHORS.length);
  ok('A7 …all inside the box', ANCHORS.every((a) =>
     a.x >= I.minX - 0.06 && a.x <= I.maxX + 0.06 && a.z >= I.minZ && a.z <= I.maxZ));
  /* Anchors on BOTH sides and spread along the length, or strap angle cannot matter and
   * §10.3's "poor angle... permits shift" is unreachable. */
  ok('A8 …on both sides', new Set(ANCHORS.map((a) => a.side)).size === 2);
  const zs = new Set(ANCHORS.map((a) => a.z.toFixed(2)));
  ok('A9 …and spread along the length, so strap angle is a choice', zs.size >= 3, `${zs.size} stations`);

  /* The deck must be SLIPPERY, and it must be slippery in the solver rather than only in the
   * data. A truck deck at a house floor's 0.8 holds an unstrapped pack through a hard brake,
   * which leaves straps nothing to improve on and the phase gate unmeasurable. */
  const deckRec = M.world.colliders.find((c) => c.tag === 'truckDeck');
  ok('A9b the deck record carries its own friction', !!deckRec && deckRec.friction !== undefined,
     deckRec ? `friction=${deckRec.friction}` : 'no deck collider');
  ok('A9c …and it is slippery, not carpet', !!deckRec && deckRec.friction < 0.5,
     deckRec ? `${deckRec.friction}` : '');
  {
    // What the couch actually experiences: Rapier AVERAGES the two coefficients.
    const couchDef = OBJECT_DEFS.couch_3seat_01;
    const eff = (couchDef.physics.friction + (deckRec ? deckRec.friction : 0.8)) / 2;
    const resist = eff * couchDef.mass * 9.81;
    const brake = couchDef.mass * TRUCK.brakeForce;
    lines.push(`      couch on the deck: effective mu ${eff.toFixed(3)} = ${resist.toFixed(0)} N of grip ` +
               `against ${brake.toFixed(0)} N of hard brake`);
    ok('A9d a hard brake can overcome deck friction, or nothing ever shifts',
       brake > resist, `${brake.toFixed(0)} N vs ${resist.toFixed(0)} N`);
  }

  lines.push(`      cargo box ${CARGO_BOX.length} x ${CARGO_BOX.width} x ${CARGO_BOX.height} m ` +
             `= ${CARGO_VOLUME.toFixed(2)} m³ of clear volume`);
  ok('A10 the volume is small enough that packing is a problem',
     CARGO_VOLUME < 20, `${CARGO_VOLUME.toFixed(2)} m³`);

  // The manifest genuinely does not fit carelessly — that is what makes "one trip" a goal.
  const manifestVolume = game.state.manifest.reduce((v, r) => {
    const d = OBJECT_DEFS[r.defId].dimensions;
    return v + d.x * d.y * d.z;
  }, 0);
  lines.push(`      the 23-object manifest is ${manifestVolume.toFixed(2)} m³ of bounding boxes ` +
             `(${(manifestVolume / CARGO_VOLUME * 100).toFixed(0)}% of the box)`);
  ok('A11 the whole manifest is a tight fit, not a trivial one',
     manifestVolume > CARGO_VOLUME * 0.4, `${(manifestVolume / CARGO_VOLUME * 100).toFixed(0)}%`);
}
emit('running...');

/* ── B. loading requires physically getting in there (§10.2) ─────────────── */
lines.push('--- B. loading (GDD §10.2 "nothing teleports into storage") ---');
{
  straps.releaseAll();
  const box = byDef('box_small_01');
  ok('B1 there is a box', !!box);

  if (box) {
    // Outside: not loaded, however long it sits there.
    parkAt(box, TRUCK_POSE.x, 0.30, I.minZ - 3.0);
    step(120);
    ok('B2 an object outside the truck is never loaded', !box.state.loaded);
    ok('B3 …and insideCargo agrees', !insideCargo(posOf(box)));

    // Inside but still moving: crossing the threshold is not enough (§10.2 "and settling").
    parkAt(box, TRUCK_POSE.x, I.minY + 0.30, I.maxZ - 1.0);
    box.body.setLinvel({ x: 3.5, y: 0, z: 0 }, true);
    box.state.cargoDwellMs = 0;
    step(4);
    ok('B4 crossing the threshold is not enough — it must settle too (§10.2)',
       !box.state.loaded, `dwell ${box.state.cargoDwellMs || 0} ms`);

    // Settled inside for the dwell: loaded.
    parkAt(box, TRUCK_POSE.x, I.minY + 0.30, I.maxZ - 1.0);
    box.state.cargoDwellMs = 0;
    step(Math.ceil(CARGO.loadedDwellMs / STEP) + 60);
    ok('B5 …and once it has settled inside, it is loaded', box.state.loaded,
       `dwell ${(box.state.cargoDwellMs || 0).toFixed(0)} ms, inside=${insideCargo(posOf(box))}`);
    ok('B6 §10.2: the trip that moved it is recorded', box.state.loadedOnTrip >= 1,
       `trip ${box.state.loadedOnTrip}`);

    // Taken back out: no longer loaded. State follows the world, not a flag someone set.
    parkAt(box, TRUCK_POSE.x, 0.30, I.minZ - 3.0);
    step(30);
    ok('B7 taking it out again clears it — state follows the world', !box.state.loaded);
  }

  /* §10.2: "Support contacts and friction determine stacks; general furniture does not snap
   * to a grid." The negative is the assertion worth making: a box placed off-centre must
   * STAY off-centre, because nothing is snapping it anywhere. */
  const b2 = allOfDef('box_small_01')[1];
  if (b2) {
    const offset = TRUCK_POSE.x + 0.37;
    parkAt(b2, offset, I.minY + 0.30, I.maxZ - 1.9);
    step(90);
    const p = posOf(b2);
    ok('B8 nothing snaps to a grid (§10.2)', Math.abs(p.x - offset) < 0.06,
       `placed at ${offset.toFixed(2)}, settled at ${p.x.toFixed(2)}`);
    ok('B9 …and it rests on the deck under gravity', Math.abs(p.y - (I.minY + 0.25)) < 0.10,
       `y ${p.y.toFixed(3)} vs deck ${I.minY}`);
  }

  // A real stack: one box on another, held by contact alone.
  const [s1, s2] = allOfDef('box_small_01').slice(0, 2);
  if (s1 && s2) {
    parkAt(s1, TRUCK_POSE.x - 0.5, I.minY + 0.26, I.maxZ - 3.0);
    parkAt(s2, TRUCK_POSE.x - 0.5, I.minY + 0.78, I.maxZ - 3.0);
    step(120);
    const top = posOf(s2), bot = posOf(s1);
    ok('B10 a stack holds up on support contacts alone (§10.2)',
       top.y > bot.y + 0.35 && top.y < bot.y + 0.65,
       `bottom y ${bot.y.toFixed(2)}, top y ${top.y.toFixed(2)}`);
  }
}
emit('running...');

/* ── C. straps: §10.3's four states ──────────────────────────────────────── */
lines.push('--- C. straps (GDD §10.3) ---');
{
  straps.releaseAll();
  const fridge = byDef('fridge_01');
  ok('C1 there is a fridge to strap', !!fridge);

  if (fridge) {
    /* THE NUMBERS FIRST. The old config needed 1.31 m of stretch to reach "overstressed"
     * across a 4.20 m box, which made two of §10.3's four states unreachable. */
    const toRating = STRAP.ratingNewtons / STRAP.stiffness;
    const toFail = STRAP.failureNewtons / STRAP.stiffness;
    lines.push(`      strap: rating at ${(toRating * 1000).toFixed(0)} mm of stretch, ` +
               `failure at ${(toFail * 1000).toFixed(0)} mm (stiffness ${STRAP.stiffness.toFixed(0)} N/m)`);
    ok('C2 §10.3\'s states are reachable within a hand\'s width of stretch',
       toFail < 0.10, `failure needs ${(toFail * 1000).toFixed(0)} mm`);
    ok('C3 …and rating comes below failure, with room between them',
       toRating < toFail && toFail - toRating > 0.005);

    parkAt(fridge, TRUCK_POSE.x, I.minY + 0.90, I.maxZ - 0.6);
    step(60);
    const t = posOf(fridge);
    const anchor = [...ANCHORS].sort((a, b) =>
      Math.hypot(a.x - t.x, a.z - t.z) - Math.hypot(b.x - t.x, b.z - t.z))[0];

    // SLACK: attached with plenty of spare length, it does nothing at all.
    const slackStrap = straps.attach(anchor, fridge, { x: t.x, y: t.y + 0.5, z: t.z }, 0.40);
    step(20);
    ok('C4 §10.3 SLACK: "length exceeds separation; little restraint"',
       slackStrap.state === STRAP_STATE.SLACK && slackStrap.tension === 0,
       `${slackStrap.state}, ${slackStrap.tension.toFixed(1)} N`);

    // TENSIONED: ratchet it in until it takes up.
    for (let k = 0; k < 12 && slackStrap.state === STRAP_STATE.SLACK; k++) {
      straps.tension(slackStrap.id, 0.05);
      step(6);
    }
    ok('C5 §10.3 TENSIONED: "useful restraint within rating"',
       slackStrap.state === STRAP_STATE.TENSIONED,
       `${slackStrap.state}, ${slackStrap.tension.toFixed(0)} N`);

    // OVERSTRESSED then FAILED: keep ratcheting. §10.3's "anchor, strap or surface gives way".
    let sawOver = false;
    for (let k = 0; k < 40; k++) {
      straps.tension(slackStrap.id, 0.012);
      step(4);
      if (slackStrap.state === STRAP_STATE.OVERSTRESSED) sawOver = true;
      if (slackStrap.state === STRAP_STATE.FAILED) break;
    }
    ok('C6 §10.3 OVERSTRESSED is passed through on the way', sawOver,
       `ended ${slackStrap.state} at peak ${slackStrap.peakTension.toFixed(0)} N`);
    ok('C7 §10.3 FAILED: over-ratcheting snaps it', slackStrap.state === STRAP_STATE.FAILED,
       `${slackStrap.state}, peak ${slackStrap.peakTension.toFixed(0)} N`);
    ok('C8 …and a failed strap stops pulling entirely (§2.2 failure is state)',
       slackStrap.tension === 0);

    /* §10.4: a strap must not damage what it holds by existing. Over-tensioning breaks the
     * STRAP, not the fridge — "it must not secretly damage items without a physical cause",
     * and a strap parting is not a physical cause of a dented fridge. */
    eq('C9 snapping a strap does not damage the cargo (§10.4)', fridge.state.condition, 100);

    straps.releaseAll();
    ok('C10 releasing clears them all', straps.count === 0);
  }
}
emit('running...');

/* ── D. THE GATE: a secured pack remains stable (§25.2, §11.3) ───────────── */
lines.push('--- D. the gate: secured pack remains stable ---');
{
  const loose = brakeTest(false);
  const secured = brakeTest(true);

  ok('D1 both runs loaded the same pack', loose.packSize === secured.packSize && loose.packSize >= 5,
     `${loose.packSize} vs ${secured.packSize}`);
  ok('D2 …and the cargo system saw them as loaded',
     loose.shift.count >= 5 && secured.shift.count >= 5,
     `${loose.shift.count} vs ${secured.shift.count}`);

  lines.push(`      hard brake, ${loose.packSize} items: unstrapped worst shift ` +
             `${loose.shift.worst.toFixed(3)} m (${loose.shift.moved} items moved); ` +
             `strapped ${secured.shift.worst.toFixed(3)} m (${secured.shift.moved} moved)`);

  ok('D3 an unsecured pack SHIFTS under a §11.3 hard brake',
     loose.shift.worst > CARGO.shiftToleranceM,
     `worst ${loose.shift.worst.toFixed(3)} m vs tolerance ${CARGO.shiftToleranceM}`);
  ok('D4 …and a secured one does not — THE GATE',
     secured.shift.worst < CARGO.shiftToleranceM,
     `worst ${secured.shift.worst.toFixed(3)} m`);
  ok('D5 …by a clear margin, not a rounding difference',
     secured.shift.worst < loose.shift.worst * 0.5,
     `${loose.shift.worst.toFixed(3)} -> ${secured.shift.worst.toFixed(3)} m`);
  ok('D6 …and fewer items move at all',
     secured.shift.moved < loose.shift.moved || secured.shift.moved === 0,
     `${loose.shift.moved} -> ${secured.shift.moved}`);

  /* §10.4's heuristic must reflect what actually happened, or it is worse than useless as a
   * warning. An unstrapped pack must read as unsecured; a strapped one must not. */
  lines.push(`      pack quality: unstrapped ${(loose.quality.unsecuredFraction * 100).toFixed(0)}% ` +
             `unsecured (warn=${loose.quality.warn}); strapped ` +
             `${(secured.quality.unsecuredFraction * 100).toFixed(0)}% (warn=${secured.quality.warn})`);
  ok('D7 §10.4\'s advisory heuristic flags the unsecured pack', loose.quality.warn);
  ok('D8 …and does not flag the secured one', !secured.quality.warn,
     `${(secured.quality.unsecuredFraction * 100).toFixed(0)}% unsecured`);
  ok('D9 …and it reports a real centre of mass', secured.quality.totalMass > 100,
     `${secured.quality.totalMass.toFixed(0)} kg`);
}
emit('running...');

/* ── E. §10.4 — no secret damage ─────────────────────────────────────────── */
lines.push('--- E. no secret damage (GDD §10.4) ---');
{
  /* "A heuristic may estimate unsecured mass and imbalance for warnings and scoring, but it
   * MUST NOT SECRETLY DAMAGE ITEMS WITHOUT A PHYSICAL CAUSE."
   *
   * The test is that a deliberately terrible pack, left alone, costs nothing. Bad packing is
   * only punished by what the road then does to it — never by being judged. */
  straps.releaseAll();
  const pack = loadPack();
  for (const e of pack) e.state.condition = 100;
  const q = cargo.packQuality();
  step(180);                                  // three seconds of being badly packed
  const damaged = pack.filter((e) => e.state.condition < 100);
  ok('E1 a badly packed load takes no damage from being badly packed (§10.4)',
     damaged.length === 0, damaged.map((e) => e.defId).join(', '));
  ok('E2 …even though the heuristic knows it is bad', q.unsecuredFraction > 0.5,
     `${(q.unsecuredFraction * 100).toFixed(0)}% unsecured`);

  // And §11.3's forces are applied to bodies, not to a score.
  const before = cargo.snapshotPositions();
  step(45, 'sharpTurn');
  step(60);
  const after = cargo.shiftSince(before);
  ok('E3 a road event moves real bodies (§10.4 "physical contacts")', after.worst > 0.01,
     `worst ${after.worst.toFixed(3)} m`);

  const f = roadEventForce('hardBrake', 100);
  ok('E4 a hard brake throws cargo toward the headboard (+Z)', f.z > 0 && f.x === 0);
  const g = roadEventForce('sharpTurn', 100);
  ok('E5 …and a sharp turn throws it sideways', Math.abs(g.x) > 0 && g.z === 0);
  near('E6 §11.3 severity scales the force', roadEventForce('hardBrake', 200).z, f.z * 2, 1e-6);
  straps.releaseAll();
}
emit('running...');

/* ── F. integration (§26.6) ──────────────────────────────────────────────── */
lines.push('--- F. integration (GDD §26.6) ---');
{
  straps.releaseAll();
  const bodiesBefore = physics.stats.bodies;
  for (let i = 0; i < 90; i++) M.game.frame(16.7);
  ok('F1 no bodies leak over 90 real frames with cargo live',
     physics.stats.bodies === bodiesBefore, `${bodiesBefore} -> ${physics.stats.bodies}`);
  ok('F2 strap state is serializable (§22.4, §23.4)',
     (() => { try { JSON.parse(JSON.stringify(straps.snapshot())); return true; }
              catch (e) { return false; } })());
  ok('F3 game state stays JSON-serializable',
     (() => { try { JSON.parse(JSON.stringify(game.state)); return true; } catch (e) { return false; } })());
  ok('F4 no error banner appeared during the suite', !document.getElementById('error-banner'));
}

} catch (e) {
  fails++;
  lines.push(`FAIL  suite threw  <- ${e && e.message}`);
  lines.push((e && e.stack || '').split('\n').slice(0, 6).join('\n'));
}

emit();
