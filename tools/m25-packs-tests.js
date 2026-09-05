/* Phase 11 build-side M17 suite — three packs, three drives.
 *
 * §26.3: "Three different pack arrangements yield observably different turn, brake, and bump
 * results"; "A tensioned strap reduces relative motion and damage"; "Unsecured tall/heavy
 * cargo can tip or slide for visible reasons." Until this suite the game had measured exactly
 * two arrangements over one hard brake (m7 D, m8 C). This one drives THREE arrangements of
 * the SAME six items through the whole §13.3 route with game.frame() — 1681 frames a leg,
 * the m21 loop — sampling the load at every ROAD_FORCE and at the arrival, and asserts
 * NUMBERS, not orderings alone:
 *
 *   LOW    heavy in the headboard corner, light on top and behind, everything strapped —
 *          the pack the drive cannot move (K2).
 *   TALL   the fridge upright against the headboard with open deck beside it, three boxes
 *          stacked in the far corner, the television on the dresser, nothing strapped —
 *          the pack the TURN tips (K4).
 *   SLIDE  nothing stacked, nothing strapped, the dresser and television forward against
 *          the headboard and the fridge upright and loose with 1.8 m of open deck ahead of
 *          it — the pack the BRAKE throws forward into the headboard, and the one §15.1 bills
 *          for the truck (K3, M14).
 *
 * Then SLIDE again with two straps over the fridge (K7), the pairwise differences (K5), the
 * §10.2 pack-quality number ordering the three the way the route punished them (K6), and the
 * M6 counters carrying the same metres per event (K8).
 *
 * Fixtures: frames/parkAt/posOf/byDef from tools/m21-trips-tests.js (the names are kept so
 * the lineage stays greppable), straps.attach the way tools/m8-tests.js buildPack places
 * them, cargo.snapshotPositions/shiftSince (Phase 8). AirportBaggageCrew has no cargo-shift
 * assertion to copy (its 'shift' is a work shift).
 *
 * THE WIDTH OF THE BOX IS A NUMBER IN THIS SUITE. A 1.75 m fridge tipping sideways in a
 * 2.10 m cargo box meets the far wall at asin((2.10 − 0.70 − slide) / 1.75): 53° if its base
 * did not move, 31° after the 0.5 m it slides at 0.53 g on a 0.40 deck. So K4 asserts the
 * tilt the geometry allows and prints the bound; a fall past 45° in this box is only
 * possible along its length, which is what SLIDE's fridge does on the brake (K3).
 */

import { SIM, CARGO, TRUCK } from '../src/config.js';
import { EVENTS, PHASES } from '../src/core/eventBus.js';
import { routeSteps } from '../src/drive/route.js';
import { cargoInterior, insideCargo, roadEventForce } from '../src/world/truck.js';
import { currentDimensions } from '../src/tools/tools.js';

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

const { game, physics, registry, straps, cargo, route, hud } = M;
const bus = game.bus;
const STEP = SIM.stepMs;
const FRAME = 16.667;
const I = cargoInterior();
const BOX_W = I.maxX - I.minX, BOX_L = I.maxZ - I.minZ;
/** One leg, as m11 E / m21 drive it: 1681 frames reach elapsedS >= 28.0. */
const LEG = routeSteps() + 1;
const ANCH = Object.fromEntries(M.cargoAnchors.map((a) => [a.id, a]));
const DECK = I.minY;
const EVENT_TYPES = Object.keys(TRUCK.roadEvents);

let framesTotal = 0;
function frames(n) { for (let k = 0; k < n; k++) M.game.frame(FRAME); framesTotal += n; }
const byDef = (id) => [...registry.entities.values()].filter((e) => e.defId === id);
const posOf = (e) => { const t = e.body.translation(); return { x: t.x, y: t.y, z: t.z }; };

/* Quaternions: yaw about world y, then a roll about the body's x — a television lying flat
 * is roll π/2, a dresser across the box is yaw π/2. m21's parkAt took a yaw only. */
function qmul(a, b) {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}
function quat(yaw = 0, roll = 0) {
  return qmul({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) },
              { x: Math.sin(roll / 2), y: 0, z: 0, w: Math.cos(roll / 2) });
}
function rotate(q, v) {
  // v' = q v q*, expanded.
  const { x, y, z, w } = q;
  const ix = w * v.x + y * v.z - z * v.y, iy = w * v.y + z * v.x - x * v.z;
  const iz = w * v.z + x * v.y - y * v.x, iw = -x * v.x - y * v.y - z * v.z;
  return {
    x: ix * w + iw * -x + iy * -z - iz * -y,
    y: iy * w + iw * -y + iz * -x - ix * -z,
    z: iz * w + iw * -z + ix * -y - iy * -x,
  };
}
function parkAt(e, x, y, z, yaw = 0, roll = 0) {
  e.body.setTranslation({ x, y, z }, true);
  e.body.setRotation(quat(yaw, roll), true);
  e.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  e.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  e.body.wakeUp();
  physics.primeQueries();
}
/** The body's local +y in the world — "upright" is (0, 1, 0). */
const upOf = (e) => rotate(e.body.rotation(), { x: 0, y: 1, z: 0 });
function angleDeg(a, b) {
  const d = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z));
  return Math.acos(d) * 180 / Math.PI;
}
const UP = { x: 0, y: 1, z: 0 };
const tiltOf = (e) => angleDeg(upOf(e), UP);
const speedOf = (e) => {
  const v = e.body.linvel(), w = e.body.angvel();
  return Math.max(Math.hypot(v.x, v.y, v.z), Math.hypot(w.x, w.y, w.z));
};
/** World AABB of the entity's box collider, from its rotated corners. */
function worldAABB(e) {
  const d = currentDimensions(e), q = e.body.rotation(), t = e.body.translation();
  const out = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const c = rotate(q, { x: sx * d.x / 2, y: sy * d.y / 2, z: sz * d.z / 2 });
    out.minX = Math.min(out.minX, t.x + c.x); out.maxX = Math.max(out.maxX, t.x + c.x);
    out.minY = Math.min(out.minY, t.y + c.y); out.maxY = Math.max(out.maxY, t.y + c.y);
    out.minZ = Math.min(out.minZ, t.z + c.z); out.maxZ = Math.max(out.maxZ, t.z + c.z);
  }
  return out;
}
const fitsInside = (e, tol = 0.02) => {
  const b = worldAABB(e);
  return b.minX >= I.minX - tol && b.maxX <= I.maxX + tol && b.minY >= I.minY - tol - 0.05 &&
         b.maxY <= I.maxY + tol && b.minZ >= I.minZ - tol && b.maxZ <= I.maxZ + tol;
};
const axisOf = (d) => {
  const ax = Math.abs(d.x), ay = Math.abs(d.y), az = Math.abs(d.z);
  return ax >= ay && ax >= az ? 'x' : az >= ay ? 'z' : 'y';
};
const bandWord = () => {
  const m = /(mostly secure|secure|LOOSE)/.exec(hud.cargoStatus.textContent);
  return m ? m[1] : '';
};
/** A fresh run: the real §26.6 reset (m22 freshRun). */
function freshRun() {
  if (M.invoiceScreen.visible) M.invoiceScreen.onReplay(); else { M.resetContract(); game.setPaused(false); }
  M.pendingNotices.splice(0, M.pendingNotices.length);
}

/* ── the three packs — the SAME six items, three arrangements ─────────────── */
const fridge = byDef('fridge_01')[0];
const dresser = byDef('dresser_01')[0];
const tv = byDef('tv_55_01')[0];
const boxes = byDef('box_small_01').slice(0, 3);
const SIX = [fridge, dresser, tv, ...boxes];
const ID_SET = SIX.map((e) => e.id).sort().join(',');
/** A strap: from this anchor to a hook at this offset from the item's centre. `slack` is
 *  metres of spare length — 0 is taut with no pre-load (m7's lesson: a ratcheted pre-load
 *  DRAGS the pack); 0.02 stays inside CARGO.securedSlackM (0.05) and so counts as restraint
 *  while never loading on an item that is wedged and cannot move. */
const S = (anchor, dx, dy, dz, slack = 0) => ({ anchor, dx, dy, dz, slack });
const R = Math.PI / 2;

const PACKS = {
  /* LOW — heavy low in the headboard corner, light on top and behind, everything strapped.
   * The fridge in the +x/headboard corner is supported on both sides the events push
   * (brake +z, turn +x); the dresser beside it is pushed INTO it; the boxes on the dresser
   * and behind the fridge, the television flat behind the dresser, all wedged. */
  LOW: () => [
    { e: fridge, x: 1.295, y: DECK + 0.875 + 0.01, z: 12.145,
      straps: [S('anchor_L1', -0.30, 0.80, -0.34), S('anchor_R1', 0.30, 0.80, -0.34)] },
    { e: dresser, x: 0.39, y: DECK + 0.425 + 0.01, z: 12.245,
      straps: [S('anchor_L1', -0.50, 0.38, -0.24), S('anchor_R1', 0.50, 0.38, -0.24)] },
    { e: boxes[0], x: 0.10, y: DECK + 0.85 + 0.25 + 0.03, z: 12.245,
      straps: [S('anchor_L1', -0.22, 0.22, -0.24, 0.02), S('anchor_R1', 0.22, 0.22, -0.24, 0.02)] },
    { e: boxes[1], x: 0.66, y: DECK + 0.85 + 0.25 + 0.03, z: 12.245,
      straps: [S('anchor_L1', -0.22, 0.22, -0.24, 0.02), S('anchor_R1', 0.22, 0.22, -0.24, 0.02)] },
    { e: tv, x: 0.30, y: DECK + 0.045 + 0.02, z: 11.61, roll: R,
      straps: [S('anchor_L0', -0.55, 0.04, -0.30, 0.02), S('anchor_R0', 0.55, 0.04, -0.30, 0.02)] },
    { e: boxes[2], x: 1.295, y: DECK + 0.25 + 0.02, z: 11.54,
      straps: [S('anchor_L0', -0.22, 0.22, -0.24, 0.02), S('anchor_R0', 0.22, 0.22, -0.24, 0.02)] },
  ],
  /* TALL — the fridge upright against the headboard on the −x side with 1.4 m of open deck
   * beside it; three boxes stacked in the +x/headboard corner; the dresser behind the
   * fridge against the −x wall with the television flat on top of it; nothing strapped. */
  TALL: () => [
    { e: fridge, x: -0.095, y: DECK + 0.875 + 0.01, z: 12.145 },
    { e: boxes[0], x: 1.395, y: DECK + 0.25 + 0.02, z: 12.245 },
    { e: boxes[1], x: 1.395, y: DECK + 0.75 + 0.04, z: 12.245 },
    { e: boxes[2], x: 1.395, y: DECK + 1.25 + 0.06, z: 12.245 },
    { e: dresser, x: 0.10, y: DECK + 0.425 + 0.01, z: 11.00 },
    { e: tv, x: 0.10, y: DECK + 0.85 + 0.045 + 0.03, z: 11.00, yaw: R, roll: R },
  ],
  /* SLIDE — everything on the deck, nothing strapped: the dresser forward against the
   * headboard with the television flat on the deck against its back (the naive "heavy
   * first, in the front"), the boxes at the tail, and the fridge upright and loose on the
   * −x side with 1.8 m of open deck between it and the headboard. `strapped` adds K7's two
   * straps over the fridge, crossed: the −x anchor to its +x rear corner and back. */
  SLIDE: (strapped = false) => [
    { e: dresser, x: 1.095, y: DECK + 0.425 + 0.01, z: 12.245 },
    { e: tv, x: 1.00, y: DECK + 0.045 + 0.02, z: 11.61, roll: R },
    { e: fridge, x: -0.095, y: DECK + 0.875 + 0.01, z: 10.20,
      straps: strapped ? [S('anchor_L0', 0.30, 0.80, -0.34), S('anchor_R0', -0.30, 0.80, -0.34)] : null },
    { e: boxes[0], x: 0.90, y: DECK + 0.25 + 0.02, z: 8.80 },
    { e: boxes[1], x: 1.40, y: DECK + 0.25 + 0.02, z: 8.80 },
    { e: boxes[2], x: 1.15, y: DECK + 0.25 + 0.02, z: 9.40 },
  ],
};

/** Run frames until every item is loaded and still (< 0.01 m/s and rad/s), at least `min`. */
function settle(items, min, max = 400) {
  let n = 0;
  for (; n < max; n++) {
    frames(1);
    if (n < min) continue;
    if (items.every((it) => it.e.state.loaded) && items.every((it) => speedOf(it.e) < 0.01)) break;
  }
  return n + 1;
}

/**
 * Build a pack, wait for it to settle, strap it, record the §10.2 heuristic, then drive the
 * whole route through game.frame() sampling every ROAD_FORCE window and the arrival.
 */
function drive(name, items) {
  freshRun();
  frames(10);
  for (const it of items) parkAt(it.e, it.x, it.y, it.z, it.yaw || 0, it.roll || 0);
  const settleFrames = settle(items, 40);
  let strapCount = 0;
  for (const it of items) {
    if (!it.straps) continue;
    const t = posOf(it.e);
    for (const s of it.straps) {
      const strap = straps.attach(ANCH[s.anchor], it.e, { x: t.x + s.dx, y: t.y + s.dy, z: t.z + s.dz }, s.slack);
      if (strap) strapCount++;
    }
  }
  const strapFrames = strapCount ? settle(items, 30) : 0;

  // At departure: K1's facts, the §10.2 heuristic and the HUD's words.
  const idSet = items.map((it) => it.e.id).sort().join(',');
  const loaded = items.every((it) => it.e.state.loaded);
  const inside = items.every((it) => insideCargo(posOf(it.e)) && fitsInside(it.e));
  const maxSpeed = Math.max(...items.map((it) => speedOf(it.e)));
  const q = cargo.packQuality();
  hud.setCargo(q);
  const band = bandWord();
  const snap0 = cargo.snapshotPositions();
  const start = Object.fromEntries(items.map((it) => [it.e.id, posOf(it.e)]));
  const tilt0 = tiltOf(fridge);

  // Per-event windows: opened on the ROAD_FORCE (after main.js's own observer, same step,
  // same positions), closed by the next one or by the arrival.
  const windows = {};
  let cur = null;
  const close = () => {
    if (!cur) return;
    let worst = 0, worstId = null, worstD = { x: 0, y: 0, z: 0 };
    const per = {};
    for (const it of items) {
      const p = posOf(it.e), f = cur.pos[it.e.id];
      const d = { x: p.x - f.x, y: p.y - f.y, z: p.z - f.z };
      const m = Math.hypot(d.x, d.y, d.z);
      per[it.e.id] = m;
      if (m > worst) { worst = m; worstId = it.e.id; worstD = d; }
    }
    windows[cur.type] = { worst, worstId, d: worstD, per, tiltMax: cur.tiltMax, tiltEnd: tiltOf(fridge),
                          props: game.state.ledger.propertyDamage.length - cur.props };
    cur = null;
  };
  const off = bus.on(EVENTS.ROAD_FORCE, (e) => {
    close();
    cur = { type: e.roadType, pos: Object.fromEntries(items.map((it) => [it.e.id, posOf(it.e)])),
            tiltMax: tiltOf(fridge), props: game.state.ledger.propertyDamage.length };
  });

  // Depart the way the cab does (interact.js _useCab): route.depart(), then the phase.
  const advice = route.canDepart();
  route.depart();
  game.setPhase(PHASES.TRANSIT, { ok: true, warn: !!advice.warn, reason: advice.reason || '' });
  let arrivedAt = -1, tiltMax = 0;
  for (let k = 0; k < LEG + 30; k++) {
    frames(1);
    const tilt = tiltOf(fridge);
    if (cur && tilt > cur.tiltMax) cur.tiltMax = tilt;
    if (tilt > tiltMax) tiltMax = tilt;
    if (route.state === 'arrived') { arrivedAt = k + 1; close(); break; }
  }
  off();

  const total = cargo.shiftSince(snap0);
  const totalPer = {};
  for (const it of items) {
    const p = posOf(it.e), s = start[it.e.id];
    totalPer[it.e.id] = { d: { x: p.x - s.x, y: p.y - s.y, z: p.z - s.z }, m: Math.hypot(p.x - s.x, p.y - s.y, p.z - s.z) };
  }
  const worstTotalId = Object.entries(totalPer).sort((a, b) => b[1].m - a[1].m)[0][0];
  const props = game.state.ledger.propertyDamage.map((l) => ({ surfaceId: l.surfaceId, location: l.location, band: l.band, defId: l.defId, cost: l.cost }));
  const truckProps = props.filter((l) => /^truck/.test(l.surfaceId));
  const itemDamage = game.state.ledger.itemDamage.map((l) => `${l.defId} ${l.conditionBefore.toFixed(0)}→${l.conditionAfter.toFixed(0)}`);
  const insideAtArrival = items.every((it) => insideCargo(posOf(it.e)));
  const c = game.state.telemetry.counters;
  const counters = { worstCargoShift: c.worstCargoShift, shiftByEvent: { ...c.shiftByEvent } };
  const summary = M.runSummary();
  let worstEvent = null;
  for (const t of EVENT_TYPES) if (windows[t] && (!worstEvent || windows[t].worst > windows[worstEvent].worst)) worstEvent = t;

  straps.releaseAll();
  const rec = { name, items, idSet, loaded, inside, maxSpeed, strapCount, settleFrames, strapFrames, q, band, advice,
                windows, worstEvent, total, totalPer, worstTotalId, tilt0, tiltMax, tiltEnd: tiltOf(fridge), arrivedAt,
                props, truckProps, itemDamage, insideAtArrival, counters, summary };

  lines.push(`      ${name}: settled ${settleFrames}+${strapFrames} frames, ${strapCount} straps, quality ${q.quality.toFixed(3)} ` +
             `(unsecured ${(q.unsecuredFraction * 100).toFixed(0)}%, height ${q.heightFraction.toFixed(2)}, run-up ${q.runUpFraction.toFixed(2)}), band "${band}"; ` +
             `arrived at frame ${arrivedAt}; route worst ${total.worst.toFixed(3)} m (${worstTotalId}), ${total.moved}/${total.count} past tolerance; ` +
             `fridge tilt max ${tiltMax.toFixed(1)}° rest ${rec.tiltEnd.toFixed(1)}°`);
  for (const t of EVENT_TYPES) {
    const w = windows[t];
    if (!w) { lines.push(`        ${t.padEnd(9)} — no window`); continue; }
    lines.push(`        ${t.padEnd(9)} worst ${w.worst.toFixed(3)} m ${String(w.worstId).padEnd(16)} Δ=(${w.d.x.toFixed(2)}, ${w.d.y.toFixed(2)}, ${w.d.z.toFixed(2)}) axis ${axisOf(w.d)}; ` +
               `fridge tilt max ${w.tiltMax.toFixed(1)}°; counters ${(counters.shiftByEvent[t] || 0).toFixed(3)} m`);
  }
  lines.push(`        property: ${props.length ? props.map((l) => `${l.location} ${l.band} (${l.defId}) ${l.cost.toFixed(2)}`).join('; ') : 'none'}; ` +
             `items: ${itemDamage.length ? itemDamage.join(', ') : 'none'}`);
  return rec;
}

const results = {};
try {
lines.push('--- the packs: the same six items, three arrangements, one route each (GDD §26.3, §11.3, §13.3) ---');
ok('fixture: a fridge, a dresser, a television and three small boxes exist', SIX.every(Boolean) && boxes.length === 3,
   SIX.map((e) => e && e.id).join(','));
results.LOW = drive('LOW', PACKS.LOW()); emit('running...');
results.TALL = drive('TALL', PACKS.TALL()); emit('running...');
results.SLIDE = drive('SLIDE', PACKS.SLIDE()); emit('running...');
const THREE = ['LOW', 'TALL', 'SLIDE'];

/* ── K1. the same six items, inside, settled ───────────────────────────────── */
lines.push('--- K1. the same six item ids, each pack inside the box and settled at departure ---');
{
  ok('m25 K1 the three packs are the SAME six item ids in three arrangements',
     THREE.every((n) => results[n].idSet === ID_SET), THREE.map((n) => results[n].idSet).join(' | '));
  for (const n of THREE) {
    const r = results[n];
    ok(`m25 K1 ${n}: every item loaded and inside the cargo interior AABB at departure`, r.loaded && r.inside,
       `loaded ${r.loaded}, inside ${r.inside}`);
    ok(`m25 K1 ${n}: settled before the route starts (velocities < 0.01)`, r.maxSpeed < 0.01, `${r.maxSpeed.toFixed(4)} after ${r.settleFrames}+${r.strapFrames} frames`);
    eq(`m25 K1 ${n}: the route arrived within ${LEG} frames and the contract is in DELIVERY-or-later`, r.arrivedAt > 0 && r.arrivedAt <= LEG, true);
    ok(`m25 K1 ${n}: all three §13.3 events were sampled`, EVENT_TYPES.every((t) => r.windows[t]), Object.keys(r.windows).join(','));
  }
}
emit('running...');

/* ── K2. LOW ────────────────────────────────────────────────────────────────── */
lines.push('--- K2. LOW: the pack the drive cannot move ---');
{
  const r = results.LOW;
  ok(`m25 K2 LOW: worst shift over the whole route < 0.20 m (${r.total.worst.toFixed(3)} m)`, r.total.worst < 0.20, `${r.total.worst.toFixed(3)} m by ${r.worstTotalId}`);
  ok('m25 K2 LOW: no item leaves the box', r.insideAtArrival);
  ok(`m25 K2 LOW: fridge tilt < 5° (${r.tiltMax.toFixed(1)}° max)`, r.tiltMax < 5, `${r.tiltMax.toFixed(2)}°`);
  ok('m25 K2 LOW: no property line against the truck', r.truckProps.length === 0, JSON.stringify(r.truckProps));
  ok('m25 K2 LOW: no property line at all, no item damage', r.props.length === 0 && r.itemDamage.length === 0, `${r.props.length} property, ${r.itemDamage.length} item`);
  ok('m25 K2 LOW: every item strapped — 0% unsecured, canDepart() does not warn', r.q.unsecuredFraction === 0 && !r.advice.warn, `${(r.q.unsecuredFraction * 100).toFixed(0)}%`);
}

/* ── K3. SLIDE ──────────────────────────────────────────────────────────────── */
lines.push('--- K3. SLIDE: the brake throws the fridge forward into the headboard (M14 bills the truck) ---');
{
  const r = results.SLIDE;
  const w = r.windows.hardBrake;
  ok(`m25 K3 SLIDE: worst shift > 1.0 m (${r.total.worst.toFixed(3)} m over the route)`, r.total.worst > 1.0, `${r.total.worst.toFixed(3)} m`);
  eq('m25 K3 SLIDE: the worst event is hardBrake', r.worstEvent, 'hardBrake');
  ok(`m25 K3 SLIDE: the brake window's worst item moved > 1.0 m (${w.worst.toFixed(3)} m, ${w.worstId})`, w.worst > 1.0, `${w.worst.toFixed(3)} m`);
  ok(`m25 K3 SLIDE: the shift's dominant axis is the truck's forward axis, |Δz| > 2·|Δx| (${w.d.z.toFixed(2)} vs ${w.d.x.toFixed(2)})`,
     Math.abs(w.d.z) > 2 * Math.abs(w.d.x) && w.d.z > 0, `Δ=(${w.d.x.toFixed(3)}, ${w.d.y.toFixed(3)}, ${w.d.z.toFixed(3)})`);
  ok('m25 K3 SLIDE: ≥ 1 property-damage entry against a truck surface exists at arrival', r.truckProps.length >= 1, JSON.stringify(r.props));
  ok('m25 K3 SLIDE: …and it is the headboard, hit by the fridge, on the brake', r.truckProps.some((l) => l.surfaceId === 'truckHeadboard' && l.defId === 'fridge_01') && w.props >= 1,
     `${JSON.stringify(r.truckProps)} (${w.props} written inside the brake window)`);
  ok('m25 K3 SLIDE: the fridge fell — tilt > 45° by the end of the brake window', w.tiltMax > 45, `${w.tiltMax.toFixed(1)}°`);
  ok('m25 K3 SLIDE: canDepart() warned before departure (§11.2)', r.advice.warn, r.advice.reason);
}

/* ── K4. TALL ───────────────────────────────────────────────────────────────── */
lines.push('--- K4. TALL: the turn tips the fridge sideways for a visible reason (§26.3 "tall/heavy cargo can tip") ---');
{
  const r = results.TALL;
  const w = r.windows.sharpTurn;
  const slide = Math.abs(w.d.x);
  /* The bound this box imposes on a sideways fall: the top meets the far wall at
   * asin((width − fridge − slide) / height). Printed so the number can be argued with. */
  const bound = Math.asin(Math.min(1, (BOX_W - 0.70 - Math.max(0, slide)) / 1.75)) * 180 / Math.PI;
  lines.push(`      TALL sideways-fall bound: asin((${BOX_W.toFixed(2)} − 0.70 − slide) / 1.75) = 53.0° with no slide, ${bound.toFixed(1)}° with the ${slide.toFixed(2)} m it had slid by rest ` +
             `(the peak comes mid-slide); measured max ${w.tiltMax.toFixed(1)}°, at rest ${w.tiltEnd.toFixed(1)}°`);
  ok(`m25 K4 TALL: the fridge tips on sharpTurn — max tilt > 25° (${w.tiltMax.toFixed(1)}°; a sideways fall in the ${BOX_W.toFixed(2)} m box is wall-capped at 53° minus its slide)`,
     w.tiltMax > 25, `${w.tiltMax.toFixed(1)}°`);
  ok(`m25 K4 TALL: …and it stays tipped — at rest after the turn > 20° (${w.tiltEnd.toFixed(1)}°), still > 20° at arrival (${r.tiltEnd.toFixed(1)}°)`,
     w.tiltEnd > 20 && r.tiltEnd > 20, `${w.tiltEnd.toFixed(1)}° / ${r.tiltEnd.toFixed(1)}°`);
  ok('m25 K4 TALL: …not on the brake (tilt < 5° through the brake window) and not on the bump', r.windows.hardBrake.tiltMax < 5 && r.windows.speedBump.tiltMax - r.windows.sharpTurn.tiltEnd < 5,
     `brake ${r.windows.hardBrake.tiltMax.toFixed(1)}°, bump ${r.windows.speedBump.tiltMax.toFixed(1)}°`);
  ok(`m25 K4 TALL: the shift on sharpTurn has a lateral component, |Δx| > 0.3 m (${w.d.x.toFixed(2)} m, ${w.worstId})`, Math.abs(w.d.x) > 0.3,
     `Δ=(${w.d.x.toFixed(3)}, ${w.d.y.toFixed(3)}, ${w.d.z.toFixed(3)})`);
  ok(`m25 K4 TALL: …the fridge itself moved sideways > 0.3 m on the turn (${r.windows.sharpTurn.per[fridge.id].toFixed(3)} m)`, w.per[fridge.id] > 0.3, `${w.per[fridge.id].toFixed(3)} m`);
  ok(`m25 K4 LOW's fridge never tilts > 5° (${results.LOW.tiltMax.toFixed(2)}°)`, results.LOW.tiltMax < 5);
  eq('m25 K4 TALL: the worst event is sharpTurn', r.worstEvent, 'sharpTurn');
}

/* ── K5. pairwise ───────────────────────────────────────────────────────────── */
lines.push('--- K5. pairwise: three observably different stories ---');
{
  const pairs = [['LOW', 'TALL'], ['LOW', 'SLIDE'], ['TALL', 'SLIDE']];
  for (const [a, b] of pairs) {
    const diffs = EVENT_TYPES.map((t) => ({ t, d: Math.abs(results[a].windows[t].worst - results[b].windows[t].worst) }));
    const best = diffs.sort((p, q2) => q2.d - p.d)[0];
    ok(`m25 K5 ${a} vs ${b}: some event's worst shift differs by > 0.30 m (${best.t} ${best.d.toFixed(3)} m)`, best.d > 0.30,
       diffs.map((x) => `${x.t} ${x.d.toFixed(3)}`).join(', '));
  }
  /* The story of a pack: its worst event and the dominant axis of that event's worst
   * displacement — or 'held' when nothing moved past CARGO.shiftToleranceM, the threshold
   * the game itself uses for "the pack moved" (cargo.js shiftSince). A pack that held has
   * no event to blame; its raw worst event is printed all the same. */
  const story = (n) => {
    const r = results[n];
    const w = r.windows[r.worstEvent];
    return r.total.worst < CARGO.shiftToleranceM ? 'held' : `${r.worstEvent}/${axisOf(w.d)}`;
  };
  const raw = (n) => { const r = results[n]; return `${r.worstEvent}/${axisOf(r.windows[r.worstEvent].d)}`; };
  lines.push(`      stories: ${THREE.map((n) => `${n} ${story(n)} (raw ${raw(n)}, ${results[n].total.worst.toFixed(3)} m)`).join('; ')}`);
  ok('m25 K5 no two packs share the same worst event AND the same axis (LOW held; TALL sharpTurn/x; SLIDE hardBrake/z)',
     new Set(THREE.map(story)).size === 3 && story('TALL') === 'sharpTurn/x' && story('SLIDE') === 'hardBrake/z' && story('LOW') === 'held',
     THREE.map((n) => `${n}=${story(n)}`).join(' '));
  ok('m25 K5 …and the two packs that moved differ in event AND axis', raw('TALL') !== raw('SLIDE') && results.TALL.worstEvent !== results.SLIDE.worstEvent);
}
emit('running...');

/* ── K6. prediction ─────────────────────────────────────────────────────────── */
lines.push('--- K6. prediction: the §10.2 number ordered the packs the way the route punished them ---');
{
  const byShift = [...THREE].sort((a, b) => results[a].total.worst - results[b].total.worst);
  const byQuality = [...THREE].sort((a, b) => results[b].q.quality - results[a].q.quality);
  lines.push(`      measured ascending: ${byShift.map((n) => `${n} ${results[n].total.worst.toFixed(3)} m`).join(' < ')}; ` +
             `quality descending: ${byQuality.map((n) => `${n} ${results[n].q.quality.toFixed(3)}`).join(' > ')}`);
  // Spearman over three points: rank(quality, descending) == rank(shift, ascending) for all -> 1.
  const rankS = Object.fromEntries(byShift.map((n, i) => [n, i]));
  const rankQ = Object.fromEntries(byQuality.map((n, i) => [n, i]));
  const d2 = THREE.reduce((s, n) => s + (rankS[n] - rankQ[n]) ** 2, 0);
  const spearman = 1 - 6 * d2 / (3 * (9 - 1));
  ok(`m25 K6 cargo.packQuality().quality before departure orders the packs as the measured worst shifts do — ${byQuality.join(' > ')} (Spearman ${spearman})`,
     spearman === 1 && byShift.join() === byQuality.join(), `shift ${byShift.join('<')} vs quality ${byQuality.join('>')}`);
  ok('m25 K6 …strictly: LOW > TALL > SLIDE with gaps ≥ 0.05',
     results.LOW.q.quality - results.TALL.q.quality >= 0.05 && results.TALL.q.quality - results.SLIDE.q.quality >= 0.05,
     THREE.map((n) => `${n} ${results[n].q.quality.toFixed(3)}`).join(' '));
  ok('m25 K6 …LOW scores 1.000 (nothing loose), the loose packs below CARGO.unsecuredWarnFraction\'s complement', results.LOW.q.quality === 1 &&
     results.TALL.q.quality < 1 - CARGO.unsecuredWarnFraction && results.SLIDE.q.quality < 1 - CARGO.unsecuredWarnFraction);
  const bands = THREE.map((n) => results[n].band);
  ok(`m25 K6 the HUD's cargo band words differ for at least two of the three (${bands.join(' / ')})`, new Set(bands).size >= 2 && bands.every(Boolean), bands.join(','));
  ok('m25 K6 quality is on the same heuristic the HUD and canDepart() read (fields unsecuredFraction, heightFraction, runUpFraction, quality all finite)',
     THREE.every((n) => ['unsecuredFraction', 'heightFraction', 'runUpFraction', 'quality'].every((k) => Number.isFinite(results[n].q[k]))));
}
emit('running...');

/* ── K7. straps ─────────────────────────────────────────────────────────────── */
lines.push('--- K7. SLIDE with two straps over the fridge: a tensioned strap reduces relative motion and damage (§26.3, §10.3) ---');
results.SLIDE_STRAPPED = drive('SLIDE+2 straps', PACKS.SLIDE(true));
{
  const r = results.SLIDE_STRAPPED;
  eq('m25 K7 two straps were placed on the fridge', r.strapCount, 2);
  ok(`m25 K7 worst shift < 0.5 m (${r.total.worst.toFixed(3)} m, was ${results.SLIDE.total.worst.toFixed(3)} m loose)`, r.total.worst < 0.5, `${r.total.worst.toFixed(3)} m by ${r.worstTotalId}`);
  ok('m25 K7 no truck property line', r.truckProps.length === 0, JSON.stringify(r.truckProps));
  ok(`m25 K7 the fridge stayed up (tilt < 5°, ${r.tiltMax.toFixed(1)}°) and moved < 0.10 m (${r.totalPer[fridge.id].m.toFixed(3)} m)`, r.tiltMax < 5 && r.totalPer[fridge.id].m < 0.10);
  ok('m25 K7 no item damage either (the fridge was the only thing that broke anything)', r.itemDamage.length === 0, r.itemDamage.join(', '));
  ok(`m25 K7 the heuristic moved with the straps: quality ${r.q.quality.toFixed(3)} > SLIDE's ${results.SLIDE.q.quality.toFixed(3)}`, r.q.quality > results.SLIDE.q.quality + 0.1);
}
emit('running...');

/* ── K8. counters ───────────────────────────────────────────────────────────── */
lines.push('--- K8. the M6 counters carry the same metres per event (§27.4 cargo motion, M17 shiftByEvent) ---');
{
  for (const n of ['LOW', 'TALL', 'SLIDE', 'SLIDE_STRAPPED']) {
    const r = results[n];
    const s = r.summary.counters.shiftByEvent;
    ok(`m25 K8 ${n}: runSummary().counters.shiftByEvent has the three keys`, s && EVENT_TYPES.every((t) => typeof s[t] === 'number'), JSON.stringify(s));
    for (const t of EVENT_TYPES) {
      near(`m25 K8 ${n}: shiftByEvent.${t} is the suite's own sample ± 1e-3 (${(s ? s[t] : NaN).toFixed(3)} vs ${r.windows[t].worst.toFixed(3)})`,
           s ? s[t] : NaN, r.windows[t].worst, 1e-3);
    }
    near(`m25 K8 ${n}: counters.worstCargoShift is the route's worst ± 1e-3`, r.summary.counters.worstCargoShift, r.total.worst, 1e-3);
  }
  const live = M.runSummary().counters.shiftByEvent;
  ok('m25 K8 the counter is plain serializable data on game.state.telemetry (m0 E8)',
     (() => { try { const t = JSON.parse(JSON.stringify(game.state.telemetry)); return EVENT_TYPES.every((k) => typeof t.counters.shiftByEvent[k] === 'number'); } catch (e) { return false; } })());
  ok('m25 K8 a reset zeroes it', (() => { freshRun(); const c = game.state.telemetry.counters.shiftByEvent; return EVENT_TYPES.every((k) => c[k] === 0); })(), JSON.stringify(live));
}

/* ── the composition (M17 moved it into config) ────────────────────────────── */
lines.push('--- the road events\' composition lives in config (TRUCK.roadEvents[type].accel) ---');
{
  for (const t of EVENT_TYPES) {
    const ev = TRUCK.roadEvents[t];
    const f = roadEventForce(t, 100);
    const k = 100 * TRUCK.brakeForce * ev.severity;
    near(`m25 composition: roadEventForce('${t}', 100) = mass × brakeForce × severity × accel`, Math.hypot(f.x - ev.accel.x * k, f.y - ev.accel.y * k, f.z - ev.accel.z * k), 0, 1e-9);
  }
  ok('m25 composition: a brake is forward (+z), a turn sideways (x), a bump up (y) — m8 A6-A8\'s directions',
     TRUCK.roadEvents.hardBrake.accel.z > 0 && TRUCK.roadEvents.sharpTurn.accel.x !== 0 && TRUCK.roadEvents.speedBump.accel.y > 0);
}

/* ── budget ─────────────────────────────────────────────────────────────────── */
lines.push('--- budget ---');
{
  lines.push(`      game.frame() calls: ${framesTotal} (4 legs = ${4 * LEG} + ${framesTotal - 4 * LEG} fixture frames); sim clock ${game.clock.simTimeMs.toFixed(0)} ms since the last reset`);
  ok(`m25 budget: four legs driven through game.frame() (${framesTotal} >= ${4 * LEG})`, framesTotal >= 4 * LEG);
  ok('m25 budget: under 7400 frames all told (m21 drives 7368)', framesTotal <= 7400, `${framesTotal}`);
  ok('m25 no error banner appeared during the suite', !document.getElementById('error-banner') && !document.getElementById('err-banner'));
}
} catch (e) {
  fails++;
  lines.push(`FAIL  uncaught  <- ${e && e.message}`);
  lines.push((e && e.stack || '').split('\n').slice(0, 6).join('\n'));
}

emit();
