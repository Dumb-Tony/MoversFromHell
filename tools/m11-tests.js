/* Phase 11 suite — the playable layer.
 *
 * Not a §25.2 roadmap gate. This is the phase that closes the hole Phases 6 to 10 each left:
 * every system they built was real, measured and asserted, and none of it had an input.
 *
 * THE CLAIM UNDER TEST is §4.4's — "one input should not change meaning invisibly" — turned
 * into something falsifiable:
 *
 *   PROMISED == DELIVERED   whatever describe() puts on screen is exactly what act() does.
 *                           A prompt that offers an action the key cannot perform is worse
 *                           than no prompt, because the player has already committed.
 *   NEVER REFUSES           when describe() offers nothing, act() does nothing and says so
 *                           in advance (§2.1: the game should rarely say no, and never
 *                           after the fact).
 *   REACHABLE               every one of Phases 6-10's systems can be driven from the two
 *                           keys a player actually has. That is the whole point.
 *
 * The suite drives `interact` the way a player would: stand somewhere, look at something,
 * press E. It never calls ToolSystem or StrapSystem directly, because that is precisely the
 * shortcut that let five phases ship without an interface.
 */

import { SIM, TOOLS, MANIFEST } from '../src/config.js';
import { CONTRACT } from '../src/config.js';   // Phase 11 build-side M5, section O
import { TARGET } from '../src/player/interact.js';
import { DOOR_REMOVE_LABEL, DOOR_REHANG_LABEL } from '../src/player/interact.js';   // Phase 11 build-side M11, section DL
import { DOOR } from '../src/config.js';                                             // M11
import { STRAP_STATE } from '../src/cargo/straps.js';
import { cabPoint, cargoAnchors, cargoInterior, rampAnchorPoint } from '../src/world/truck.js';
import { DEFAULT_BINDINGS, CONTEXTS } from '../src/core/input.js';
import { reassemble } from '../src/tools/tools.js';
import { GROUP_PRESETS } from '../src/physics/world.js';
import { EVENTS, PHASES } from '../src/core/eventBus.js';
import { routeSteps } from '../src/drive/route.js';
/* Phase 11 plan M2 (replay unwinds through the real API) — what section G13-G17 pins. */
import { RECOVERY } from '../src/config.js';
import { LINE_KINDS } from '../src/contract/invoice.js';
import { disassemble } from '../src/tools/tools.js';
import { partStatus, clearFragments } from '../src/tools/tools.js';   // Phase 11 build-side M12, situation 9 / section Q
import { PARTS } from '../src/config.js';                              // M12
import { NOTICE } from '../src/config.js';                             // M26, section F (notices on sim time)

const lines = [];
let passes = 0, fails = 0;
function ok(name, cond, detail = '') {
  if (cond) { passes++; lines.push(`PASS  ${name}`); }
  else { fails++; lines.push(`FAIL  ${name}${detail ? '  <- ' + detail : ''}`); }
}
const eq = (n, a, b) => ok(n, a === b, `got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

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

const { game, physics, registry, movers, tools, straps, cargo, route, damage, interact, rig, camera, hud } = M;
const bus = game.bus;
const STEP = SIM.stepMs;
const FRAME = 16.667;
/** The boot's BRIEFING -> PICKUP transition, captured before anything else can push it out
 *  of the 256-entry ring. G2c's sequence starts here. */
const bootPhaseEvents = bus.log.filter((e) => e.type === EVENTS.CONTRACT_PHASE);
/** Every CONTRACT_PHASE from the start of the real run (section E) to settlement (G). Kept
 *  by a subscriber rather than read back from the ring, which a TV drop's IMPACTs can fill. */
const runPhaseEvents = [];
const I = cargoInterior();
const ANCHORS = cargoAnchors();
const me = () => movers[M.activeMoverIndex];

function step(n = 1, intents = {}) {
  for (let i = 0; i < n; i++) {
    physics.clearForces();
    for (const m of movers) {
      const it = intents[m.id] || {};
      const yaw = it.yaw !== undefined ? it.yaw : m.grips.aimYaw;
      m.grips.step(STEP, { brace: !!it.brace, simTimeMs: i * STEP });
      m.controller.step(STEP, {
        move: it.move || { x: 0, y: 0 },
        forward: { x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw) },
        right: { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) },
        run: false, brace: !!it.brace, jump: false, recover: false,
      });
    }
    interact.step(movers, STEP);
    straps.step(STEP, i * STEP);
    physics.step();
    registry.step(STEP);
    cargo.step(STEP, i * STEP);
    damage.step(STEP, i * STEP);
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
const posOf = (e) => { const t = e.body.translation(); return { x: t.x, y: t.y, z: t.z }; };
const byDef = (id) => { for (const e of registry.entities.values()) if (e.defId === id) return e; return null; };
const toolByDef = (id) => { for (const t of tools.tools.values()) if (t.defId === id) return t; return null; };

/** Stand a mover somewhere and point them at a world point — what a player does with a
 *  mouse, done directly. Mirrors grip.js's aim-from-camera / reach-from-shoulder split. */
/**  matters inside the truck: the deck is 1.20 m up, and a mover left standing on
 *  the ground aims at the underside of the truck rather than at the cargo on it. */
function lookAt(m, from, target, snap = false) {
  placeMover(m, from.x, from.z, from.y !== undefined ? from.y : 0.2);
  const p = m.controller.position;
  rig.yaw = Math.atan2(-(target.x - p.x), -(target.z - p.z));
  rig.pitch = Math.atan2(target.y - (p.y + 1.4), Math.hypot(target.x - p.x, target.z - p.z));
  /* `snap` — A TELEPORT CAN SNAP THE CAMERA. The rig's follow target is lerped (followLerp
   * 12/s -> 0.8 per update), so twenty updates after a 40 m jump (section T: couch spot ->
   * truck) left it 0.46 m behind the mover, the aim ray derived from that camera missed the
   * anchor by more than the 0.28 m tolerance, and the strap "could not be placed". Opt-in,
   * because sections B-D were tuned against the lagging camera and C8 stops finding the
   * wardrobe with an exact one. `_first` is the rig's own first-frame snap. */
  if (snap) rig._first = true;
  for (let k = 0; k < 20; k++) rig.update(p, 1 / 60);
  const c = camera.position;
  rig.yaw = Math.atan2(-(target.x - c.x), -(target.z - c.z));
  rig.pitch = Math.atan2(target.y - c.y, Math.hypot(target.x - c.x, target.z - c.z));
  m.grips.syncAim();
  physics.primeQueries();
}

/** Stand a comfortable distance from a point, on the -z side of it. */
function standOffFrom(target, back = 1.3) {
  return { x: target.x, z: target.z + back };
}

/** THE CORE CHECK. Describe, then act, then verify the two agreed. */
function pressE(m) {
  const promised = interact.describe(m);
  const did = interact.act(m, game.clock.simTimeMs);
  return { promised, did };
}

/* ORDER MATTERS HERE, and getting it wrong cost an hour.
 *
 * The first version cleared every tool's `attachedTo` and THEN asked the registry to detach
 * whatever was attached — but `detachDolly` begins `if (!tool.state.attachedTo) return
 * false`, so the detach silently did nothing and the couch kept a dolly and its 0.04
 * friction into the next test. Two assertions then PASSED on stale state from the previous
 * section while the one that should have passed failed, which is the worst possible way for
 * a fixture to be wrong.
 *
 * So: unwind the attachments first, through the same API the game uses, and only then clear
 * what is left. */
function reset() {
  straps.releaseAll();
  route.reset();
  /* The cab now really moves the §3.4 machine (M1), so section B's cab press leaves the
   * contract in TRANSIT. Put it back the way route.reset() puts the truck back: silently,
   * without a CONTRACT_PHASE event, so G2c's log records only the real run from E onward. */
  if (game.state.phase !== PHASES.PICKUP) game.state.phase = PHASES.PICKUP;
  for (const e of [...registry.entities.values()]) {
    if (e.state.partOf || e.state.fragmentOf) continue;   // M12: a piece is unwound through its parent
    if (e.state.dollyId) tools.detachDolly(tools.get(e.state.dollyId));
    if (e.state.blanketId) tools.removeBlanket(tools.get(e.state.blanketId));
    /* `force` (M12): a part whose piece was carried away (situation 9) refuses a plain
     * reassemble by design; the fixture's reset gathers it the way the contract reset does. */
    for (const p of [...(e.state.removedParts || [])]) reassemble(registry, e, p, { force: true });
    clearFragments(registry, e);   // M12: a TV dropped in T leaves fragments; the next section starts without them
  }
  for (const s of interact.state.values()) { s.carriedTool = null; s.pendingAnchor = null; }
  for (const t of tools.tools.values()) {
    t.body.setBodyType(physics.R.RigidBodyType.Dynamic, true);
    t.collider.setCollisionGroups(GROUP_PRESETS.object);
    t.state.carriedBy = null; t.state.attachedTo = null; t.state.deployed = false;
  }
}

try {
/* ── M24. the title card's START button and controls list, pinned BEFORE the job starts ──
 * Phase 11 build-side M24 put §21.2's brief on the title screen. The brief must not move the
 * one button (m31 B2 reads these same numbers): measured at the harness viewport 1262×624
 * with --ts 1, before this milestone, on 2026-09-05 — START x 533.63 y 311.42 w 194.75 h 39.00,
 * the controls list x 282.00 y 398.42 w 698.00 h 96.56. Read here at the top, while the card
 * is still up (O6 starts the job). */
lines.push('--- M24. the title card\'s START and controls rects (pinned for m31 B2) ---');
{
  const tsWas = document.documentElement.style.getPropertyValue('--ts');
  document.documentElement.style.setProperty('--ts', '1');
  const card = document.querySelector('#title-screen .card');
  void (card && card.offsetHeight);
  const rect = (sel) => { const el = document.querySelector(sel); return el ? el.getBoundingClientRect() : null; };
  const play = rect('#title-screen .play'), cols = rect('#title-screen .cols');
  const near = (a, b, tol = 0.75) => Math.abs(a - b) <= tol;
  const atHarness = window.innerWidth === 1262 && window.innerHeight === 624;
  lines.push(`      viewport ${window.innerWidth}x${window.innerHeight}; START ${play && [play.left, play.top, play.width, play.height].map((v) => v.toFixed(2)).join(' ')}; ` +
             `controls ${cols && [cols.left, cols.top, cols.width, cols.height].map((v) => v.toFixed(2)).join(' ')}`);
  ok('M24-T0 the suite reads the title card at the harness viewport (1262×624)', atHarness, `${window.innerWidth}x${window.innerHeight}`);
  ok('M24-T1 the START button is where it was before the brief: x 533.63 y 311.42 w 194.75 h 39.00 (±0.75)',
     !!play && near(play.left, 533.63) && near(play.top, 311.42) && near(play.width, 194.75) && near(play.height, 39.00),
     play && `${play.left.toFixed(2)} ${play.top.toFixed(2)} ${play.width.toFixed(2)} ${play.height.toFixed(2)}`);
  ok('M24-T2 the controls list too: x 282.00 y 398.42 w 698.00 h 96.56 (±0.75)',
     !!cols && near(cols.left, 282.00) && near(cols.top, 398.42) && near(cols.width, 698.00) && near(cols.height, 96.56),
     cols && `${cols.left.toFixed(2)} ${cols.top.toFixed(2)} ${cols.width.toFixed(2)} ${cols.height.toFixed(2)}`);
  const brief = document.querySelector('#title-screen .brief');
  ok('M24-T3 the brief is on the title screen, outside the card (a sibling, never inside it)',
     !!brief && !brief.hidden && !!card && !card.contains(brief));
  if (tsWas) document.documentElement.style.setProperty('--ts', tsWas); else document.documentElement.style.removeProperty('--ts');
}

/* ── A. the two verbs exist and are bound (§9.2, §4.2) ───────────────────── */
lines.push('--- A. the verbs (GDD §9.2, §4.2) ---');
{
  const foot = DEFAULT_BINDINGS[CONTEXTS.FOOT];
  ok('A1 §9.2\'s common interaction verb is bound', !!foot.interact,
     JSON.stringify(foot.interact || {}));
  ok('A2 …to a key AND a pad button (§4.3 controller parity)',
     foot.interact.keys && foot.interact.keys.length > 0 && foot.interact.pad,
     JSON.stringify(foot.interact));
  ok('A3 the undo verb is bound too', !!foot.context && !!foot.context.keys);
  ok('A4 the interaction system exists and is wired', !!interact && typeof interact.act === 'function');
  ok('A5 …and every mover gets its own interaction state (§22.4)',
     movers.every((m) => !!interact._for(m.id)) &&
     new Set(movers.map((m) => interact._for(m.id))).size === movers.length);
  ok('A6 …which is serializable', (() => {
    try { JSON.parse(JSON.stringify(interact.snapshot())); return true; } catch (e) { return false; }
  })());
}
emit('running...');

/* ── B. §4.4 — the prompt never lies ─────────────────────────────────────── */
lines.push('--- B. promised == delivered (GDD §4.4, §2.1) ---');
{
  reset();
  const dolly = toolByDef('dolly_flat_01');
  const t = posOf(dolly);

  // Nothing under the reticle: nothing promised, nothing done.
  lookAt(me(), { x: t.x, z: t.z + 30 }, { x: t.x, y: 0.2, z: t.z + 60 });
  const empty = interact.describe(me());
  ok('B1 looking at nothing promises nothing', !empty.primary, empty.primary || '');
  eq('B2 …and pressing E does nothing (§2.1 never refuses after the fact)',
     interact.act(me()), null);

  // A tool under the reticle: promised, and delivered.
  lookAt(me(), standOffFrom(t, 1.2), t);
  const seen = interact.describe(me());
  ok('B3 looking at a tool promises picking it up', !!seen.primary && /pick up/.test(seen.primary),
     seen.primary || `target=${seen.target.kind}`);
  const r = pressE(me());
  ok('B4 …and E delivers exactly that', !!r.did, r.did || 'nothing happened');
  eq('B5 …leaving the tool carried', interact._for(me().id).carriedTool, dolly.id);

  /* THE INVARIANT, swept over every situation the suite can construct: if describe() offers
   * a primary action, act() must succeed. A prompt the key cannot honour is the specific bug
   * this whole shape exists to prevent. */
  reset();
  const situations = [];
  const couch = byDef('couch_3seat_01');
  const box = byDef('box_small_01');

  // 1. empty-handed at a tool
  situations.push(['tool', () => { const p = posOf(dolly); lookAt(me(), standOffFrom(p, 1.2), p); }]);
  // 2. empty-handed at an anchor — standing ON THE DECK, which is where anchors are.
  situations.push(['anchor', () => {
    reset();
    const a = ANCHORS[0];
    lookAt(me(), { x: a.x + (a.side === 'L' ? 0.85 : -0.85), z: a.z, y: I.minY + 0.1 }, a);
  }]);
  // 2b. empty-handed at a strapped object — E should offer to tighten (§10.3).
  situations.push(['strapped cargo', () => {
    reset();
    const f = byDef('fridge_01');
    parkAt(f, M.truckPose.x, I.minY + 0.90, I.maxZ - 0.6);
    step(30);
    const ft = posOf(f);
    const a = [...ANCHORS].sort((p, q) =>
      Math.hypot(q.x - ft.x, q.z - ft.z) - Math.hypot(p.x - ft.x, p.z - ft.z))[0];
    lookAt(me(), { x: a.x + (a.side === 'L' ? 0.85 : -0.85), z: a.z, y: I.minY + 0.1 }, a);
    interact.act(me());
    lookAt(me(), { x: ft.x, z: ft.z - 1.3, y: I.minY + 0.1 }, { x: ft.x, y: ft.y, z: ft.z });
    interact.act(me());
    step(6);
  }]);
  // 3. empty-handed at the cab
  situations.push(['cab', () => { const c = cabPoint(); lookAt(me(), standOffFrom(c, 1.4), c); }]);
  // 4. carrying the dolly, at an object
  situations.push(['dolly+object', () => {
    reset();
    parkAt(couch, -30, 0.45, 30);
    const p = posOf(dolly);
    lookAt(me(), standOffFrom(p, 1.2), p);
    interact.act(me());
    lookAt(me(), standOffFrom({ x: -30, y: 0.45, z: 30 }, 1.5), { x: -30, y: 0.45, z: 30 });
  }]);
  // 5. carrying the screwdriver, at a wardrobe
  situations.push(['screwdriver+wardrobe', () => {
    reset();
    const w = byDef('wardrobe_01');
    parkAt(w, -34, 1.02, 30);
    const sd = toolByDef('screwdriver_01');
    const p = posOf(sd);
    lookAt(me(), standOffFrom(p, 1.1), p);
    interact.act(me());
    lookAt(me(), standOffFrom({ x: -34, y: 1.0, z: 30 }, 1.5), { x: -34, y: 1.0, z: 30 });
  }]);
  // 6. carrying the blanket, at the TV
  situations.push(['blanket+tv', () => {
    reset();
    const tv = byDef('tv_55_01');
    parkAt(tv, -38, 0.4, 30, Math.PI / 2);
    const bl = toolByDef('blanket_01');
    const p = posOf(bl);
    lookAt(me(), standOffFrom(p, 1.1), p);
    interact.act(me());
    lookAt(me(), standOffFrom({ x: -38, y: 0.4, z: 30 }, 1.4), { x: -38, y: 0.4, z: 30 });
  }]);
  // 8. carrying the screwdriver, at the couch — §7.1's "four legs / screwdriver" (Phase 11 M8).
  // At x -22, not -30: the screwdriver drops where the mover stands, and section C's first
  // aim runs along the -30 line at the couch — a tool left on that line is what E picks.
  situations.push(['screwdriver+couch', () => {
    reset();
    parkAt(couch, -22, 0.45, 30);
    const sd = toolByDef('screwdriver_01');
    const p = posOf(sd);
    lookAt(me(), standOffFrom(p, 1.1), p);
    interact.act(me());
    lookAt(me(), standOffFrom({ x: -22, y: 0.45, z: 30 }, 1.5), { x: -22, y: 0.45, z: 30 });
  }]);
  /* 9. THE REASSEMBLE REFUSAL (Phase 11 build-side M12; §9.1 "loose pieces get lost", §4.4).
   * The screwdriver at the couch with its legs already off and one leg carried 3 m away —
   * outside PARTS.reattachRange. The promise under test is Q's line, not E's: E has nothing
   * left to take off, and Q must NOT read 'put the legs back on' (reassemble would refuse
   * and the key would silently do nothing). It reads 'find the legs (1 of 4 missing)', and
   * pressing Q says the same and changes nothing. The third element names the key. */
  situations.push(['screwdriver+couch, one leg carried away (M12)', () => {
    reset();
    parkAt(couch, -22, 0.45, 30);
    const sd = toolByDef('screwdriver_01');
    const p = posOf(sd);
    lookAt(me(), standOffFrom(p, 1.1), p);
    interact.act(me());
    lookAt(me(), standOffFrom({ x: -22, y: 0.45, z: 30 }, 1.5), { x: -22, y: 0.45, z: 30 });
    interact.act(me(), game.clock.simTimeMs);          // legs off: four pieces beside the couch
    const ids = (couch.state.parts || {}).legs || [];
    const leg = ids.length ? registry.get(ids[0]) : null;
    if (leg) parkAt(leg, -22 + 3.0, 0.05, 30);          // one leg 3 m away
    step(2);
    lookAt(me(), standOffFrom({ x: -22, y: 0.45, z: 30 }, 1.5), { x: -22, y: 0.45, z: 30 });
  }, 'Q']);

  let promised = 0, honoured = 0;
  const broken = [];
  const refusal = {};
  for (const [name, setup, key] of situations) {
    setup();
    step(4);
    const d = interact.describe(me());
    const promise = key === 'Q' ? d.secondary : d.primary;
    if (!promise) continue;
    promised++;
    const did = key === 'Q' ? interact.secondary(me()) : interact.act(me(), game.clock.simTimeMs);
    if (did) honoured++; else broken.push(`${name}: promised "${promise}"`);
    if (key === 'Q') {
      refusal.promise = promise; refusal.said = did;
      refusal.stillOff = (couch.state.removedParts || []).includes('legs');
      refusal.collider = couch.collider.halfExtents().y * 2;
      refusal.pieces = ((couch.state.parts || {}).legs || []).filter((id) => registry.get(id)).length;
    }
  }
  lines.push(`      ${promised} promises made, ${honoured} honoured`);
  ok('B6 every action the prompt offers is one E can perform (§4.4)',
     broken.length === 0, broken.join(' | '));
  ok('B7 …and the sweep actually exercised several situations', promised >= 5, `${promised}`);
  // Phase 11 M8: the couch's legs added a promise; the count is asserted so it cannot slip out silently.
  // M12 added the reassemble refusal as situation 9 (a Q promise): nine made, nine honoured.
  ok('B7c M8+M12: nine promises made and nine honoured — the couch-legs verb and the reassemble refusal among them',
     promised === 9 && honoured === 9, `${promised} made, ${honoured} honoured`);
  ok('B7d M12 situation 9: the prompt read "find the legs (1 of 4 missing)", Q said so, and nothing changed (legs still off, collider still 0.77, four pieces still live)',
     /find the legs \(1 of 4 missing\)/.test(refusal.promise || '') && /1 of 4 missing/.test(refusal.said || '') &&
     refusal.stillOff === true && Math.abs(refusal.collider - 0.77) < 1e-6 && refusal.pieces === 4,
     `promise "${refusal.promise}" said "${refusal.said}" off=${refusal.stillOff} collider=${refusal.collider} pieces=${refusal.pieces}`);
  reset();
  void box;
}
emit('running...');

/* ── C. the tools, reached the way a player reaches them (§9.1, §9.2) ────── */
lines.push('--- C. the tools are reachable (GDD §9.1, §9.2) ---');
{
  // DOLLY. Pick it up, put it under a couch, all through E.
  reset();
  const couch = byDef('couch_3seat_01');
  parkAt(couch, -30, 0.45, 30);
  const dolly = toolByDef('dolly_flat_01');
  let p = posOf(dolly);
  lookAt(me(), standOffFrom(p, 1.2), p);
  interact.act(me());
  ok('C1 the dolly can be picked up with E', interact._for(me().id).carriedTool === dolly.id);
  step(10);
  lookAt(me(), standOffFrom({ x: -30, y: 0.45, z: 30 }, 1.5), { x: -30, y: 0.45, z: 30 });
  interact.act(me());
  ok('C2 …and put under the couch with E — no API call anywhere',
     couch.state.dollyId === dolly.id, `dollyId=${couch.state.dollyId}`);
  ok('C3 …which really changed the physics', couch.collider.friction() < 0.1,
     `mu=${couch.collider.friction().toFixed(2)}`);
  ok('C4 …and the mover is no longer carrying it', !interact._for(me().id).carriedTool);

  // Q takes it back off.
  interact.secondary(me());
  ok('C5 Q takes the dolly back out', !couch.state.dollyId);
  ok('C6 …restoring the couch\'s own friction',
     Math.abs(couch.collider.friction() - couch.def.physics.friction) < 1e-6);

  // BLANKET.
  reset();
  const tv = byDef('tv_55_01');
  parkAt(tv, -38, 0.4, 30, Math.PI / 2);
  const blanket = toolByDef('blanket_01');
  p = posOf(blanket);
  lookAt(me(), standOffFrom(p, 1.1), p);
  interact.act(me());
  step(6);
  lookAt(me(), standOffFrom({ x: -38, y: 0.4, z: 30 }, 1.4), { x: -38, y: 0.4, z: 30 });
  interact.act(me());
  ok('C7 the blanket can be wrapped round the TV with E', tv.state.blanketId === blanket.id,
     `blanketId=${tv.state.blanketId}`);

  // SCREWDRIVER.
  reset();
  const wardrobe = byDef('wardrobe_01');
  parkAt(wardrobe, -34, 1.02, 30);
  const sd = toolByDef('screwdriver_01');
  p = posOf(sd);
  lookAt(me(), standOffFrom(p, 1.1), p);
  interact.act(me());
  step(6);
  lookAt(me(), standOffFrom({ x: -34, y: 1.0, z: 30 }, 1.5), { x: -34, y: 1.0, z: 30 });
  const before = wardrobe.def.dimensions.z;
  interact.act(me());
  ok('C8 the wardrobe can be taken apart with E',
     (wardrobe.state.removedParts || []).includes('doors'),
     JSON.stringify(wardrobe.state.removedParts));
  ok('C9 …and it is measurably smaller', wardrobe.collider.halfExtents().z * 2 < before,
     `${(wardrobe.collider.halfExtents().z * 2).toFixed(2)} vs ${before}`);
  interact.secondary(me());
  ok('C10 …and Q puts it back on (§8.2 "unscrew and REATTACH")',
     (wardrobe.state.removedParts || []).length === 0);

  // RAMP.
  reset();
  const ramp = toolByDef('ramp_01');
  p = posOf(ramp);
  lookAt(me(), standOffFrom(p, 1.2), p);
  interact.act(me());
  ok('C11 the ramp can be picked up', interact._for(me().id).carriedTool === ramp.id);
  const head = rampAnchorPoint();
  lookAt(me(), { x: head.x, z: head.z - 2.2 }, { x: head.x, y: 0.4, z: head.z - 2.6 });
  const msg = interact.act(me());
  ok('C12 …and deployed at the truck with E', ramp.state.deployed, msg || 'not deployed');
  ok('C13 …at a walkable angle (§9.1 "bridge truck floor height")',
     ramp.state.geometry && ramp.state.geometry.angleDeg < 48,
     ramp.state.geometry ? `${ramp.state.geometry.angleDeg.toFixed(1)}°` : 'no geometry');
}
emit('running...');

/* ── D. straps, placed the way §10.3 describes ───────────────────────────── */
lines.push('--- D. straps are placeable (GDD §10.3, §9.2) ---');
{
  /* §10.3: "The player selects endpoint A, aims or walks to endpoint B, confirms, and
   * tensions." Two presses of one key, exactly as written. */
  reset();
  const fridge = byDef('fridge_01');

  /* THE FRIDGE GOES AT THE FRONT AND THE ANCHOR IS AT THE BACK.
   *
   * The first version parked the fridge in the middle of the box and then picked the anchor
   * NEAREST to it — so the fridge stood between the mover and the thing they were trying to
   * look at, and the probe reported "object" where the test expected "anchor". That is not a
   * selection bug, it is standing behind a fridge. */
  parkAt(fridge, M.truckPose.x, I.minY + 0.90, I.maxZ - 0.6);
  step(50);

  const t = posOf(fridge);
  // Furthest anchor from the fridge, so the line of sight to it is clear.
  const anchor = [...ANCHORS].sort((a, b) =>
    Math.hypot(b.x - t.x, b.z - t.z) - Math.hypot(a.x - t.x, a.z - t.z))[0];

  // Endpoint A: stand in the box, beside the anchor, and look at it.
  lookAt(me(), { x: anchor.x + (anchor.side === 'L' ? 0.85 : -0.85), z: anchor.z, y: I.minY + 0.1 }, anchor);
  const seesAnchor = interact.describe(me());
  eq('D1 an anchor is selectable by looking at it', seesAnchor.target.kind, TARGET.ANCHOR);
  ok('D2 …and offers to start a strap', /start a strap/.test(seesAnchor.primary || ''),
     seesAnchor.primary || '');
  interact.act(me());
  eq('D3 …which arms endpoint A', interact._for(me().id).pendingAnchor, anchor.id);

  /* Endpoint B: §10.3 says "aims or WALKS to endpoint B", so the mover walks — the anchor
   * chosen is at the far end of the box and the fridge is beyond arm's reach from it.
   *
   * Standing on the -Z side of the fridge, toward the open rear door. `standOffFrom` adds
   * +z, which put the mover on the far side of the headboard and outside the box entirely;
   * the probe then found the back of a wall and reported "none". */
  lookAt(me(), { x: t.x, z: t.z - 1.3, y: I.minY + 0.1 }, { x: t.x, y: t.y, z: t.z });
  const seesCargo = interact.describe(me());
  ok('D4 …and the prompt now offers to finish it', /strap/.test(seesCargo.primary || ''),
     seesCargo.primary || `target=${seesCargo.target.kind}`);
  interact.act(me());
  const on = straps.onEntity(fridge.id);
  ok('D5 a strap exists, placed entirely from the keyboard', on.length === 1, `${on.length}`);
  ok('D6 …and endpoint A was consumed', !interact._for(me().id).pendingAnchor);

  // §10.3's "and tensions" — E on strapped cargo ratchets.
  step(8);
  const before = on.length ? on[0].restLength : 0;
  const d = interact.describe(me());
  ok('D7 looking at strapped cargo offers to tighten it (§10.3)',
     /tighten/.test(d.primary || ''), d.primary || '');
  interact.act(me());
  ok('D8 …and E ratchets it shorter', on[0].restLength < before,
     `${before.toFixed(3)} -> ${on[0].restLength.toFixed(3)}`);

  // Q releases.
  interact.secondary(me());
  eq('D9 Q releases the straps on it', straps.onEntity(fridge.id).length, 0);

  // Cancelling a half-placed strap (§2.1: a gesture you can back out of).
  lookAt(me(), { x: anchor.x + (anchor.side === 'L' ? 0.9 : -0.9), z: anchor.z }, anchor);
  interact.act(me());
  ok('D10 a half-placed strap can be cancelled', !!interact._for(me().id).pendingAnchor);
  interact.secondary(me());
  ok('D11 …with Q, leaving no strap behind',
     !interact._for(me().id).pendingAnchor && straps.count === 0);
}
emit('running...');

/* ── E. the drive and the settlement, from the cab ───────────────────────── */
lines.push('--- E. the drive is reachable (GDD §3.4, §11.1) ---');
{
  reset();
  /* A second of REAL frames first, so the transition below is stamped later than the boot's
   * PICKUP and G2c can order them. Frames rather than step(): only game.frame() runs the
   * 'phase' system in main.js, and that system is the thing this section now tests. */
  for (let k = 0; k < 60; k++) M.game.frame(FRAME);
  bus.on(EVENTS.CONTRACT_PHASE, (e) => runPhaseEvents.push(e));
  const cab = cabPoint();
  lookAt(me(), standOffFrom(cab, 1.4), cab);
  const d = interact.describe(me());
  eq('E1 the cab is a thing you can walk up to', d.target.kind, TARGET.CAB);
  ok('E2 …and it offers to drive', /drive/.test(d.primary || ''), d.primary || '');

  /* §3.4's Secure exit is "warnings ACKNOWLEDGED", not resolved, and §2.1 forbids the
   * refusal — so the prompt CARRIES the warning and the key still works. Refusing here
   * would delete Phase 8's gate, which needs a bad pack to be drivable. */
  const advice = route.canDepart();
  ok('E3 a bad pack is warned about in the prompt, not blocked',
     advice.allowed && (!advice.warn || /unrestrained/.test(d.primary || '')),
     `warn=${advice.warn} prompt="${d.primary}"`);

  interact.act(me());
  eq('E4 pressing E departs (§3.4 PICKUP -> TRANSIT)', route.state, 'driving');
  /* Before M1 this read 'pickup': the cab emitted a bare bus event nothing listened for, so
   * the §3.4 machine never left PICKUP and DELIVERY was unreachable. */
  eq('E4b …and the contract itself is in TRANSIT (was stuck in pickup)', game.state.phase, PHASES.TRANSIT);
  ok('E5 …and the HUD has a route to show', route.status().state === 'driving' &&
     route.status().progress >= 0);

  /* Drive it out — through game.frame(), because the TRANSIT -> DELIVERY promotion lives in
   * the 'phase' system and step() does not run systems. routeSteps() + 1: the route arrives
   * when elapsedS >= 28.0 and 1680 x (1000/60) ms may land a rounding error short of it. */
  const driveFrames = routeSteps() + 1;
  for (let k = 0; k < driveFrames; k++) M.game.frame(FRAME);
  eq('E6 the route completes on its own', route.state, 'arrived');
  eq('E6b arrival promotes TRANSIT -> DELIVERY (§3.4)', game.state.phase, PHASES.DELIVERY);
  // The render loop feeds the panel from contractFacts(); headless Chrome never runs it.
  hud.setContract(M.contractFacts());
  ok('E6b …and the HUD contract panel names the phase (§21.2, §26.5)',
     /delivery/i.test(hud.contract.textContent),
     hud.contract.textContent.replace(/\s+/g, ' ').slice(0, 60));
  // Queued for the render frame; if a stray rAF drained it, it is on the HUD instead.
  const arrivedNotice = M.pendingNotices.some((n) => /arrived/.test(n.text)) ||
    /arrived/.test(hud.notices.textContent);
  ok('E6b …and the "arrived — unload through the back" notice was raised (never fired before M1)',
     arrivedNotice, `pending=${M.pendingNotices.map((n) => n.text).join(' | ')}`);
  lines.push(`      drive: ${driveFrames} frames; transit ${game.state.telemetry.phaseMs.transit.toFixed(0)} ms, ` +
             `clock ${game.clock.simTimeMs.toFixed(0)} ms`);

  lookAt(me(), standOffFrom(cab, 1.4), cab);
  const d2 = interact.describe(me());
  /* E7 REWRITTEN ON PURPOSE (Phase 11 build-side M13). Nothing was delivered on this drive:
   * 22 rows are still in the old house and one is aboard. Until M13 the cab offered only
   * 'finish the job and settle up' whatever was still in the house; §3.4's Pickup exit is
   * "required cargo loaded OR crew elects another trip", so E is now the trip back for the
   * rows that need it (contractFacts().away) and settling without them is Q — priced in the
   * prompt (§4.4), never refused (§2.1). tools/m21-trips-tests.js T3-T8 drive both. */
  const awayAtArrival = M.contractFacts().away;
  ok(`E7 the cab then offers the trip back for the ${awayAtArrival} still in the house (M13; was 'settle up')`,
     /drive back/.test(d2.primary || '') && awayAtArrival > 0 && new RegExp(`\\b${awayAtArrival}\\b`).test(d2.primary || ''),
     d2.primary || '');
  ok('E7 …and settling up without them is Q, with the fee in the prompt',
     /settle/.test(d2.secondary || '') && /\d+\.\d\d/.test(d2.secondary || ''), d2.secondary || '');
  route.reset();
}
emit('running...');

/* ── T. event timestamps (§27.4, §23.3) ──────────────────────────────────── */
lines.push('--- T. event timestamps (GDD §27.4, §23.3) ---');
{
  /* §27.4 wants a log whose times mean something. Eleven emit sites stamped a literal 0 —
   * every strap placed, every tool picked up, every DAMAGE_APPLIED closed by decay or by
   * settlement. Everything here happens with the clock past the 28 s drive, so a real
   * stamp and a forgotten one cannot be confused. */
  const seen = [];
  const offSeen = bus.onAny((e) => seen.push(e));
  const tNow = game.clock.simTimeMs;
  ok('T0 the clock is well past 1 s, so 0 is unmistakably a missing stamp', tNow >= 1000,
     `${tNow.toFixed(0)} ms`);

  // A tool transition from a key press: pick the dolly up, put it down (TOOL_STATE x2).
  const dolly = toolByDef('dolly_flat_01');
  const dp = posOf(dolly);
  lookAt(me(), standOffFrom(dp, 1.2), dp);
  interact.act(me());
  interact.secondary(me());
  /* Found by this fixture: _putDown never restored the collision group, so a tool put down
   * with Q kept `toolCarried` (collides with nothing) and sank through the floor — measured
   * y = -1.32 m here, one second after the drop, before the fix. */
  for (let k = 0; k < 60; k++) M.game.frame(FRAME);
  const dropped = posOf(dolly);
  ok('T3 a tool put down with Q rests on the world instead of falling through it (y > 0 after 1 s)',
     dropped.y > 0 && dolly.collider.collisionGroups() === GROUP_PRESETS.object,
     `y=${dropped.y.toFixed(2)} groups=${dolly.collider.collisionGroups()} want ${GROUP_PRESETS.object}`);

  // A strap placed and released through E/Q (STRAP_CHANGED x2), the section-D way.
  const fridge = byDef('fridge_01');
  parkAt(fridge, M.truckPose.x, I.minY + 0.90, I.maxZ - 0.6);
  step(30);
  const ft = posOf(fridge);
  const anchor = [...ANCHORS].sort((a, b) =>
    Math.hypot(b.x - ft.x, b.z - ft.z) - Math.hypot(a.x - ft.x, a.z - ft.z))[0];
  lookAt(me(), { x: anchor.x + (anchor.side === 'L' ? 0.85 : -0.85), z: anchor.z, y: I.minY + 0.1 }, anchor, true);
  const sawA = interact.describe(me());
  const didA = interact.act(me());
  lookAt(me(), { x: ft.x, z: ft.z - 1.3, y: I.minY + 0.1 }, { x: ft.x, y: ft.y, z: ft.z }, true);
  const sawB = interact.describe(me());
  const didB = interact.act(me());
  const didQ = interact.secondary(me());
  const rp = posOf(toolByDef('ramp_01')), dq = posOf(dolly);
  lines.push(`      strap fixture: A ${sawA.target.kind} -> "${didA}", B ${sawB.target.kind} -> "${didB}", Q "${didQ}"; ` +
             `fridge (${ft.x.toFixed(1)}, ${ft.y.toFixed(2)}, ${ft.z.toFixed(1)}) ramp (${rp.x.toFixed(1)}, ${rp.y.toFixed(2)}, ${rp.z.toFixed(1)}) ` +
             `dolly (${dq.x.toFixed(1)}, ${dq.y.toFixed(2)}, ${dq.z.toFixed(1)})`);

  // A drop, closed by the aggregation window's DECAY (DAMAGE_APPLIED via _decayWindow).
  const tv = byDef('tv_55_01');
  parkAt(tv, -38, 1.8, 30, Math.PI / 2);
  for (let k = 0; k < 150; k++) M.game.frame(FRAME);
  offSeen();

  const strapEv = seen.filter((e) => e.type === EVENTS.STRAP_CHANGED);
  const toolEv = seen.filter((e) => e.type === EVENTS.TOOL_STATE);
  const dmgEv = seen.filter((e) => e.type === EVENTS.DAMAGE_APPLIED);
  const stampsOf = (evs) => evs.map((e) => `${e.state || e.band}@${e.simTimeMs.toFixed(0)}`).join(', ');
  ok('T2 every STRAP_CHANGED and TOOL_STATE raised after 1 s carries a real simTimeMs (was 0)',
     strapEv.length >= 2 && toolEv.length >= 2 &&
     [...strapEv, ...toolEv].every((e) => e.simTimeMs >= 1000),
     `straps [${stampsOf(strapEv)}] tools [${stampsOf(toolEv)}]`);
  ok('T2b every DAMAGE_APPLIED is stamped when it was posted, never before its ledger line opened, never 0',
     dmgEv.length >= 1 && dmgEv.every((e) => e.simTimeMs > 0 && e.simTimeMs >= e.timeMs),
     dmgEv.length ? dmgEv.map((e) => `${e.simTimeMs.toFixed(0)} >= ${e.timeMs.toFixed(0)}`).join(', ')
                  : 'no DAMAGE_APPLIED — the drop did not register');

  // A second drop left OPEN for settlement to flush (the other zero-stamp path, G2d).
  parkAt(tv, -38, 1.8, 30, Math.PI / 2);
  for (let k = 0; k < 42; k++) M.game.frame(FRAME);
  ok('T2c a damage window is still open for settle() to close', damage._open.size >= 1,
     `${damage._open.size} open`);
}
emit('running...');

/* ── F. the HUD says what is happening (§21.1, §21.2, §26.5) ─────────────── */
lines.push('--- F. the HUD (GDD §21.1, §21.2, §26.5) ---');
{
  ok('F1 the HUD exists with the Phase 11 panels', !!hud.prompt && !!hud.contract &&
     !!hud.cargoStatus && !!hud.routeBar && !!hud.notices);

  // §21.1: "no persistent panel should cover the object-doorway relationship."
  hud.setContract({ phase: 'pickup', delivered: 0, total: 23, loaded: 0,
                    roomCorrect: 0, elapsedMin: 1, estimateMin: 18 });
  hud.setCargo(cargo.packQuality());
  hud.setPrompt({ primary: 'pick up the flat dolly', secondary: null });
  const centreClear = ['.contract', '.cargo-status', '.notices', '.route-bar'].every((sel) => {
    const el = hud.el.querySelector(sel);
    if (!el || !el.offsetParent) return true;
    const r = el.getBoundingClientRect();
    const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    // The working area: the middle third of the screen, where a doorway is judged.
    const wx = window.innerWidth / 6, wy = window.innerHeight / 6;
    return r.right < cx - wx || r.left > cx + wx || r.bottom < cy - wy || r.top > cy + wy;
  });
  ok('F2 §21.1: no panel covers the middle of the screen', centreClear);

  ok('F3 the prompt renders the key and the action (§4.4)',
     /E/.test(hud.prompt.textContent) && /dolly/.test(hud.prompt.textContent),
     hud.prompt.textContent);
  ok('F4 …and the contract panel names the phase and the manifest',
     /pickup/i.test(hud.contract.textContent) && /23/.test(hud.contract.textContent),
     hud.contract.textContent.replace(/\s+/g, ' ').slice(0, 80));

  // §26.5: readable without colour. Every state carries text.
  hud.setCargo({ loadedCount: 4, totalMass: 200, unsecuredFraction: 0.8, volumeFraction: 0.3 });
  ok('F5 §26.5: a loose load says so in words, not just colour',
     /LOOSE/.test(hud.cargoStatus.textContent), hud.cargoStatus.textContent);
  hud.setCargo({ loadedCount: 4, totalMass: 200, unsecuredFraction: 0, volumeFraction: 0.3 });
  ok('F6 …and a secure one too', /secure/.test(hud.cargoStatus.textContent));

  // §8.4's "one small cost notice".
  hud.notice('television — broken · 900.00', 'damage');
  ok('F7 §8.4: an impact can post a cost notice', /900/.test(hud.notices.textContent));
  /* F8 restated at M26: `until` is SIM milliseconds now, not performance.now() — the clock
   * M9's captions already ran on. The stub is the sim clock, and the notice raised by F7 a
   * moment ago is stamped `simTimeMs + NOTICE.ttlMs`, so ageing it past the current sim time
   * is what expires it. Under the harness performance.now() is frozen, which is exactly why
   * the wall clock had to go (KNOWN_ISSUES Phase 17: the soak watched notices pile up). */
  ok('F8 …and notices expire on their own, on SIM time (M26)', (() => {
    const now = game.clock.simTimeMs;
    const fresh = hud._notices.every((n) => n.until > now);
    hud._notices.forEach((n) => { n.until = now - 1; });
    hud.tickNotices();
    return fresh && hud.notices.textContent === '';
  })());
  ok('F8b …and tickNotices takes the time it is given: a notice raised now is gone NOTICE.ttlMs of sim ms later, not before', (() => {
    const t = game.clock.simTimeMs;
    hud._notices.length = 0; hud._renderNotices();
    hud.notice('a strap gave way', 'damage', t);
    hud.tickNotices(t + NOTICE.ttlMs - 1);
    const alive = hud._notices.length === 1;
    hud.tickNotices(t + NOTICE.ttlMs);
    const dead = hud._notices.length === 0;
    return alive && dead;
  })(), `ttl ${NOTICE.ttlMs}`);

  // The DOM must not be rewritten when nothing changed — §26.6's frame budget.
  hud.setPrompt({ primary: 'pick up the flat dolly', secondary: null });
  const html = hud.prompt.innerHTML;
  hud.setPrompt({ primary: 'pick up the flat dolly', secondary: null });
  ok('F9 an unchanged HUD does not touch the DOM', hud.prompt.innerHTML === html);
}
emit('running...');

/* ── G. the settlement screen (§15.2) ────────────────────────────────────── */
lines.push('--- G. settlement (GDD §15.2) ---');
{
  ok('G1 the settlement screen exists and starts hidden', !!M.invoiceScreen);

  /* ONCE. settle() -> game.setPhase(SETTLEMENT) -> CONTRACT_PHASE -> the listener -> settle()
   * again: before M1 every settlement built the invoice and showed the screen twice, and the
   * cab's bare bus emit added a third CONTRACT_PHASE with no from/to. Spy on both. */
  let settlementEvents = 0;
  const offCount = bus.on(EVENTS.CONTRACT_PHASE, (e) => { if (e.to === PHASES.SETTLEMENT) settlementEvents++; });
  const ownShow = Object.prototype.hasOwnProperty.call(M.invoiceScreen, 'show');
  const realShow = M.invoiceScreen.show;
  let shows = 0;
  M.invoiceScreen.show = function (...args) { shows++; return realShow.apply(this, args); };
  const settleSeen = [];
  const offSettleSeen = bus.onAny((e) => settleSeen.push(e));
  const openBefore = damage._open.size;
  const tSettle = game.clock.simTimeMs;
  M.settle();
  offCount(); offSettleSeen();
  if (ownShow) M.invoiceScreen.show = realShow; else delete M.invoiceScreen.show;

  ok('G2 settling shows the invoice', M.invoiceScreen.visible && !M.invoiceScreen.el.hidden);
  eq('G2b one settlement raises exactly one CONTRACT_PHASE{to:settlement} (was 2)', settlementEvents, 1);
  eq('G2b …and shows the invoice exactly once (was 2)', shows, 1);

  const seq = [...bootPhaseEvents, ...runPhaseEvents];
  const tos = seq.map((e) => e.to).join(' -> ');
  eq('G2c the log holds the whole §3.4 run', tos, 'pickup -> transit -> delivery -> settlement');
  const stamps = seq.map((e) => e.simTimeMs);
  ok('G2c …with strictly increasing simTimeMs, all > 0 except the boot PICKUP',
     stamps.length === 4 && stamps[0] === 0 &&
     stamps.slice(1).every((t, i) => t > 0 && t > stamps[i]),
     stamps.map((t) => t.toFixed(0)).join(' < '));
  ok('G2c …and every entry carries from AND to — game.setPhase is the only emitter (§23.3)',
     seq.every((e) => typeof e.from === 'string' && typeof e.to === 'string'),
     JSON.stringify(seq.map((e) => [e.from, e.to])));

  const flushed = settleSeen.filter((e) => e.type === EVENTS.DAMAGE_APPLIED);
  ok('G2d settle() flushes the open damage window stamped with the clock, not 0',
     openBefore >= 1 && flushed.length >= 1 &&
     flushed.every((e) => e.simTimeMs === tSettle && e.simTimeMs >= e.timeMs),
     `${openBefore} open -> ${flushed.length} line(s) at ${flushed.map((e) => e.simTimeMs.toFixed(0)).join(',')} (clock ${tSettle.toFixed(0)})`);
  const text = M.invoiceScreen.el.textContent;
  ok('G3 §15.2: the grade never hides the invoice — both are on screen',
     /INVOICE/.test(text) && /base contract/.test(text) && /PROFIT|LOSS/.test(text),
     text.replace(/\s+/g, ' ').slice(0, 90));
  ok('G4 …with the customer review beside it (§15.2)',
     M.invoiceScreen.el.querySelector('.review') !== null);
  ok('G5 …and §15.3\'s contribution stats', M.invoiceScreen.el.querySelector('.stats') !== null);
  ok('G6 the screen accepts clicks — #ui does not (§21.1)',
     M.invoiceScreen.el.style.pointerEvents === 'auto');
  eq('G7 the contract is in SETTLEMENT', game.state.phase, 'settlement');

  /* §27.4 "capture phase duration": the per-phase clock is the labour clock, split. */
  const phaseMs = game.state.telemetry.phaseMs;
  const sum = Object.values(phaseMs).reduce((a, b) => a + b, 0);
  ok('T1 §27.4: phase durations add up to elapsedWorkMs (± one 16.667 ms step)',
     Math.abs(sum - game.state.elapsedWorkMs) <= 16.667,
     `${sum.toFixed(1)} vs ${game.state.elapsedWorkMs.toFixed(1)} ms`);
  ok('T1a …TRANSIT lasted the drive (>= 27967 ms = (routeSteps() - 2) steps) and DELIVERY accrued after it',
     phaseMs.transit >= (routeSteps() - 2) * STEP && phaseMs.transit <= (routeSteps() + 1) * STEP &&
     phaseMs.delivery > 0,
     JSON.stringify(Object.fromEntries(Object.entries(phaseMs).map(([k, v]) => [k, Math.round(v)]))));
  ok('T1b …and it is plain numbers (§22.4)',
     Object.values(phaseMs).every((v) => typeof v === 'number' && Number.isFinite(v)));

  /* §26.6: "reset removes transient straps, grips, damage records, fragments and route
   * state." And it must leave a PLAYABLE game, which is where a state object replaced
   * wholesale gets dangerous — the manifest and mover p1's record both live on it. */
  M.invoiceScreen.onReplay();
  eq('G8 replaying returns to PICKUP', game.state.phase, 'pickup');
  ok('G9 …with the manifest rebuilt and still pointing at real bodies',
     game.state.manifest.length === 23 &&
     game.state.manifest.every((r) => !!registry.get(r.entityId)),
     `${game.state.manifest.length} rows`);
  ok('G10 …and every mover still has a state record (§22.4)',
     movers.every((m) => !!game.state.players[m.id]),
     Object.keys(game.state.players).join(','));
  ok('G11 …nothing delivered, nothing damaged, no straps',
     game.state.ledger.itemDamage.length === 0 && straps.count === 0 &&
     game.state.manifest.every((r) => !r.delivered));
  // Phase 11 build-side M14: the second ledger and its open windows go with the first.
  ok('G11b …and no property damage either — reset clears BOTH ledgers and every open window (M14, §26.6)',
     game.state.ledger.propertyDamage.length === 0 && damage._openProp.size === 0,
     `${game.state.ledger.propertyDamage.length} lines, ${damage._openProp.size} open`);
  ok('G12 …and the game is running again', !game.state.paused);
  ok('T1c …with the phase clock back at zero for the new run',
     Object.values(game.state.telemetry.phaseMs).every((v) => v === 0),
     JSON.stringify(game.state.telemetry.phaseMs));
}
emit('running...');

/* ── G13-G17. replay unwinds what the run attached (Phase 11 plan M2) ────── */
lines.push('--- G13-G17. replay unwinds through the real API (GDD §26.6, §26.4, §27.1) ---');
{
  /* §26.6: "reset removes transient straps, grips, damage records, fragments and route
   * state." Until M2, resetContract nulled the tool FLAGS and left the EFFECTS: a couch with
   * the dolly under it at settlement kept friction 0.04 and the Min combine rule for every
   * later run, a wardrobe with its doors off kept the shrunken collider (and reassemble's
   * guard then refused to ever restore it), a ramp in the mover's hands kept the no-collide
   * group and fell through the world, run 1's recovery was billed again on run 2, and — the
   * one that mattered most — the damage system kept writing to the state object game.reset()
   * had thrown away, so no replay was ever billed for item damage. G11 passed vacuously.
   *
   * So: attach everything a run can attach, settle, press "Run it again", and check each is
   * really gone rather than flagged gone. The game is in PICKUP after G8's replay. */
  reset();
  const couch = byDef('couch_3seat_01');
  const wardrobe = byDef('wardrobe_01');
  const tv = byDef('tv_55_01');
  const dolly = toolByDef('dolly_flat_01');
  const sd = toolByDef('screwdriver_01');
  const ramp = toolByDef('ramp_01');
  const R = physics.R;

  // Dolly under the couch, the section-C way.
  parkAt(couch, -30, 0.45, 30);
  let p = posOf(dolly);
  lookAt(me(), standOffFrom(p, 1.2), p);
  interact.act(me());
  step(10);
  lookAt(me(), standOffFrom({ x: -30, y: 0.45, z: 30 }, 1.5), { x: -30, y: 0.45, z: 30 });
  interact.act(me());
  const dollyOn = couch.state.dollyId === dolly.id && couch.collider.friction() < 0.1;

  // Wardrobe doors off, the section-C way; then the screwdriver goes down (Q, looking at
  // nothing — Q at the wardrobe would put the doors back on).
  parkAt(wardrobe, -34, 1.02, 30);
  p = posOf(sd);
  lookAt(me(), standOffFrom(p, 1.1), p);
  interact.act(me());
  step(6);
  lookAt(me(), standOffFrom({ x: -34, y: 1.0, z: 30 }, 1.5), { x: -34, y: 1.0, z: 30 });
  interact.act(me());
  const doorsOff = (wardrobe.state.removedParts || []).includes('doors') &&
    wardrobe.collider.halfExtents().z * 2 < wardrobe.def.dimensions.z - 1e-6;
  lookAt(me(), { x: -20, z: 60 }, { x: -20, y: 0.2, z: 90 });
  interact.secondary(me());

  // The ramp in hand at settlement — the sibling of M1's Q put-down bug.
  p = posOf(ramp);
  lookAt(me(), standOffFrom(p, 1.2), p);
  interact.act(me());
  const rampCarried = interact._for(me().id).carriedTool === ramp.id &&
    ramp.collider.collisionGroups() === GROUP_PRESETS.toolCarried;

  // One mover recovery this run (§18.3), billed on THIS run's invoice and no other.
  me().controller.recoverNow('fixture');
  const recovered = me().controller.recoveries === 1 && M.recoveryCount() === 1;
  ok('G13a fixture: dolly under the couch, doors off, ramp carried, one recovery',
     dollyOn && doorsOff && rampCarried && recovered,
     `dolly=${dollyOn} doors=${doorsOff} ramp=${rampCarried} recovered=${recovered} ` +
     `(carried=${interact._for(me().id).carriedTool})`);

  M.settle();
  const text1 = M.invoiceScreen.el.textContent;
  ok('G17a run 1\'s invoice bills the recovery it had', text1.includes(LINE_KINDS.RECOVERY),
     text1.replace(/\s+/g, ' ').slice(0, 120));

  M.invoiceScreen.onReplay();
  eq('G13b …and "Run it again" returns to PICKUP, unpaused', game.state.phase + (game.state.paused ? '/paused' : ''), 'pickup');

  // G14 — the dolly's effect is gone, not just its flag.
  const mu = couch.collider.friction();
  ok('G14 after replay the couch has its own friction back (0.35 ± 1e-6, was 0.04 for ever)',
     Math.abs(mu - couch.def.physics.friction) < 1e-6 && Math.abs(couch.def.physics.friction - 0.35) < 1e-9,
     `mu=${mu} want ${couch.def.physics.friction}`);
  ok('G14 …and the Average combine rule (the dolly\'s Min rule is gone)',
     couch.collider.frictionCombineRule() === R.CoefficientCombineRule.Average,
     `rule=${couch.collider.frictionCombineRule && couch.collider.frictionCombineRule()} want ${R.CoefficientCombineRule.Average}`);
  ok('G14 …with both ends of the link cleared', couch.state.dollyId == null && dolly.state.attachedTo == null,
     `dollyId=${couch.state.dollyId} attachedTo=${dolly.state.attachedTo}`);

  // G15 — the wardrobe is whole again, and can be taken apart again.
  const wz = wardrobe.collider.halfExtents().z * 2;
  ok('G15 after replay the wardrobe collider is its full size again (0.60 ± 1e-6)',
     Math.abs(wz - wardrobe.def.dimensions.z) < 1e-6 && Math.abs(wardrobe.def.dimensions.z - 0.60) < 1e-9,
     `${wz.toFixed(4)} vs ${wardrobe.def.dimensions.z}`);
  ok('G15 …the mesh scale is 1 and removedParts is empty',
     wardrobe.mesh.scale.z === 1 && wardrobe.mesh.scale.x === 1 && wardrobe.mesh.scale.y === 1 &&
     (wardrobe.state.removedParts || []).length === 0,
     `scale=${wardrobe.mesh.scale.z} parts=${JSON.stringify(wardrobe.state.removedParts)}`);
  const again = disassemble(registry, wardrobe, 'doors');
  ok('G15 …and disassemble() works again (reassemble\'s guard was permanently refusing it)',
     !!again && wardrobe.collider.halfExtents().z * 2 < wardrobe.def.dimensions.z - 1e-6,
     again ? JSON.stringify(again.after) : 'null');
  reassemble(registry, wardrobe, 'doors');

  // G16 — a tool carried into the settlement is back in the world, not falling through it.
  ok('G16 after replay the carried ramp is dynamic and back in the object collision group',
     ramp.body.isDynamic() && ramp.collider.collisionGroups() === GROUP_PRESETS.object &&
     !interact._for(me().id).carriedTool && ramp.state.carriedBy == null,
     `dynamic=${ramp.body.isDynamic()} groups=${ramp.collider.collisionGroups()} want ${GROUP_PRESETS.object}`);
  for (let k = 0; k < 120; k++) M.game.frame(FRAME);
  const ry = posOf(ramp).y;
  ok('G16 …and after 120 frames it is resting on the rack, above the recovery floor',
     ry > RECOVERY.objectFloorY && ry > 0, `y=${ry.toFixed(3)} (floor ${RECOVERY.objectFloorY})`);

  // G13 — damage on the replayed run reaches THIS run's ledger and its invoice.
  const ledger0 = game.state.ledger.itemDamage.length;
  parkAt(tv, -38, tv.def.dimensions.y / 2 + 1.5, 30, Math.PI / 2);
  for (let k = 0; k < 150; k++) M.game.frame(FRAME);
  damage.flush(game.clock.simTimeMs);
  const ledger = game.state.ledger.itemDamage;
  ok('G13 a TV dropped from 1.5 m AFTER a replay reaches game.state\'s ledger (was written to the orphaned run-1 state)',
     ledger0 === 0 && ledger.length >= 1 && damage.state === game.state,
     `${ledger0} -> ${ledger.length} lines; damage.state is game.state: ${damage.state === game.state}`);
  const summary2 = M.manifestSummary(game.state.manifest);
  const inv2 = M.buildInvoice(game.state, summary2, { recoveries: M.recoveryCount(), collisions: 0 });
  const itemLine = inv2.lines.find((l) => l.kind === LINE_KINDS.ITEM_DAMAGE);
  ok('G13 …and the invoice carries an item-damage line citing every ledger entry',
     !!itemLine && itemLine.from.length === ledger.length && ledger.length >= 1,
     itemLine ? `${itemLine.from.length} of ${ledger.length} cited, ${itemLine.amount.toFixed(2)}` : 'no item-damage line');
  const rec2 = M.reconcile(inv2, game.state, { recoveries: M.recoveryCount(), collisions: 0 });
  ok('G13 …which reconcile() re-derives from the records', rec2.ok, rec2.problems.join(' | '));

  // G17 — run 2 had no recovery, so run 2's invoice has no recovery line.
  M.settle();
  const text2 = M.invoiceScreen.el.textContent;
  eq('G17 no recovery happened on run 2, and none is counted at its settlement', M.recoveryCount(), 0);
  ok('G17 …so run 2\'s invoice has no recovery-fee line (run 1\'s was billed again before M2)',
     !text2.includes(LINE_KINDS.RECOVERY) && !inv2.lines.find((l) => l.kind === LINE_KINDS.RECOVERY),
     text2.replace(/\s+/g, ' ').slice(0, 120));
  ok('G17 …while its item-damage line is on screen (§26.4 invoice accuracy on replay)',
     text2.includes(LINE_KINDS.ITEM_DAMAGE), text2.replace(/\s+/g, ' ').slice(0, 120));
  M.invoiceScreen.onReplay();
  eq('G17 …and a third run starts clean', game.state.ledger.itemDamage.length + M.recoveryCount() + straps.count, 0);
}
emit('running...');

/* ── O. the first minute (Phase 11 build-side M5: §26.7, §21.1, §21.3, §26.5) ────────
 *
 * §26.7 rests on "identify the next objective without coaching". Before M5 that rested on
 * 'PICKUP · manifest 0/23' and the cab prompt: nothing said where the truck was, nothing
 * said which room an item was for until the FIRST WRONG DELIVERY, and a player who never
 * found the grab buttons was never told. Everything here is read back through M.feedHuds(),
 * the one function the render loop uses, because headless Chrome never runs the loop.
 */
lines.push('--- O. the next objective, the room, and the stall hint (M5: §26.7, §21.1, §21.3) ---');
{
  reset();
  route.reset();
  M.feedHuds();
  const obj = () => hud.el.querySelector('.objective').textContent.replace(/\s+/g, ' ').trim();
  eq('O0 the run is back in PICKUP with nothing loaded',
     `${game.state.phase}/${cargo.loadedEntities().length}`, 'pickup/0');
  ok('O1 pickup, nothing loaded: the objective names the truck', /truck/i.test(obj()), obj());

  // One box into the truck, counted by cargo.step the way a carried one would be.
  const box = byDef('box_small_01');
  const boxWas = posOf(box);
  parkAt(box, M.truckPose.x, I.minY + 0.30, I.maxZ - 1.0);
  let dwell = 0;
  while (cargo.loadedEntities().length === 0 && dwell < 240) { M.game.frame(FRAME); dwell++; }
  eq('O2 a box parked in the truck counts as loaded', cargo.loadedEntities().length, 1);
  M.feedHuds();
  ok('O2 …and the objective now offers the drive, with the count left to load',
     /drive/i.test(obj()) && /\b22\b/.test(obj()), obj());
  parkAt(box, boxWas.x, boxWas.y, boxWas.z);
  for (let k = 0; k < 20 && cargo.loadedEntities().length > 0; k++) M.game.frame(FRAME);

  /* DELIVERY: how many are left. Phase set silently, the way reset() does (no event).
   *
   * O3 REWRITTEN ON PURPOSE (Phase 11 build-side M13). Until M13 this state — DELIVERY with
   * the truck EMPTY and all 23 rows still in the old house — read 'unload — 23 left', which
   * was a lie: there was nothing aboard to unload. §3.4's Pickup exit is "required cargo
   * loaded OR crew elects another trip", and with everything away the objective now names
   * that choice; the count is the rows that need the trip (contractFacts().away). O3b below
   * keeps the 'unload' wording for the state it was always right about: something aboard. */
  game.state.phase = PHASES.DELIVERY;
  M.feedHuds();
  const sum = M.manifestSummary(game.state.manifest);
  const left = sum.total - sum.delivered;
  ok(`O3 in DELIVERY with the truck empty the objective offers the trip back for what is left (${left}) — M13, was /unload/`,
     /drive back/i.test(obj()) && new RegExp(`\\b${left}\\b`).test(obj()), obj());
  eq('O3 …and contractFacts().away is that count (every row is in the old house)', M.contractFacts().away, left);
  // O3b — one box aboard: the line is the unload, with the undelivered count.
  parkAt(box, M.truckPose.x, I.minY + 0.30, I.maxZ - 1.0);
  let dwell2 = 0;
  while (cargo.loadedEntities().length === 0 && dwell2 < 240) { M.game.frame(FRAME); dwell2++; }
  M.feedHuds();
  ok(`O3b in DELIVERY with a box aboard the objective is the unload, counting what is left (${left})`,
     cargo.loadedEntities().length === 1 && /unload/i.test(obj()) && new RegExp(`\\b${left}\\b`).test(obj()), obj());
  parkAt(box, boxWas.x, boxWas.y, boxWas.z);
  for (let k = 0; k < 20 && cargo.loadedEntities().length > 0; k++) M.game.frame(FRAME);
  game.state.phase = PHASES.TRANSIT;
  M.feedHuds();
  ok('O3a in TRANSIT it is the road', /road/i.test(obj()), obj());
  game.state.phase = PHASES.PICKUP;
  M.feedHuds();

  /* O4 — the room, BEFORE the pickup. The couch is a living-room item; the hint says so
   * while it still stands in the pickup house. By ENTITY, not by definition: box_small_01
   * spawns five times across three rooms, so a defId lookup would name one room for all. */
  const couch = byDef('couch_3seat_01');
  const couchWas = posOf(couch);
  parkAt(couch, -30, 0.45, 30);
  lookAt(me(), standOffFrom({ x: -30, y: 0.45, z: 30 }, 1.5), { x: -30, y: 0.45, z: 30 });
  const seen = interact.describe(me());
  const couchRow = game.state.manifest.find((r) => r.entityId === couch.id);
  eq('O4 the couch is a manifest item bound for the living room', couchRow && couchRow.toZone, 'dest_living');
  ok('O4 …and the hint under the reticle names the room before the pickup (§21.1, §26.5)',
     seen.target.kind === TARGET.OBJECT && /living/i.test(seen.hint || ''),
     seen.hint || `kind=${seen.target.kind} primary=${seen.primary}`);
  ok('O4a the hint is device-neutral until the HUD resolves it',
     /\{gripL\}/.test(seen.hint || '') && /\{gripR\}/.test(seen.hint || ''), seen.hint);
  hud.setPrompt(seen);
  ok('O4b …LMB/RMB for seat 0\'s keyboard, no token left on screen',
     /LMB\/RMB/.test(hud.prompt.textContent) && !/\{/.test(hud.prompt.textContent), hud.prompt.textContent);
  hud.setPrompt(seen, M.input.glyphsFor(0, 'pad'));
  ok('O4c …LT/RT on a pad, same verb', /LT\/RT/.test(hud.prompt.textContent) && /carry/.test(hud.prompt.textContent),
     hud.prompt.textContent);
  const boxRows = game.state.manifest.filter((r) => r.defId === 'box_small_01');
  const boxZones = new Set(boxRows.map((r) => r.toZone));
  ok('O4d five box_small_01 rows span three rooms — a defId lookup could not tell them apart',
     boxRows.length === 5 && boxZones.size === 3, `${boxRows.length} rows, ${[...boxZones].join(',')}`);
  const kitchenBox = registry.get(boxRows.find((r) => r.toZone === 'dest_kitchen').entityId);
  const kbWas = posOf(kitchenBox);
  parkAt(kitchenBox, -30, 0.30, 36);
  lookAt(me(), standOffFrom({ x: -30, y: 0.30, z: 36 }, 1.3), { x: -30, y: 0.30, z: 36 });
  const seenBox = interact.describe(me());
  ok('O4e …so a kitchen box says kitchen', /kitchen/i.test(seenBox.hint || ''),
     seenBox.hint || `kind=${seenBox.target.kind}`);
  parkAt(kitchenBox, kbWas.x, kbWas.y, kbWas.z);
  parkAt(couch, couchWas.x, couchWas.y, couchWas.z);

  // O5 — §21.1 with the new line included (F2's predicate, plus .objective), and ONE row.
  M.feedHuds();
  const centreClearO = ['.contract', '.cargo-status', '.notices', '.route-bar', '.objective', '.caption'].every((sel) => {
    const el = hud.el.querySelector(sel);
    if (!el || !el.offsetParent) return true;
    const r = el.getBoundingClientRect();
    const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    const wx = window.innerWidth / 6, wy = window.innerHeight / 6;
    return r.right < cx - wx || r.left > cx + wx || r.bottom < cy - wy || r.top > cy + wy;
  });
  ok('O5 §21.1: the objective line joins the panels that stay out of the middle third', centreClearO);
  const objEl = hud.el.querySelector('.objective');
  const cs = getComputedStyle(objEl);
  const lineH = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.6;
  ok('O5b …and it is ONE row (§21.1 "not a checklist")',
     objEl.offsetHeight > 0 && objEl.offsetHeight <= 2 * lineH,
     `${objEl.offsetHeight}px tall, line ${lineH.toFixed(1)}px: "${obj()}"`);
  ok('O5c …that sits under the contract panel, not over it',
     objEl.getBoundingClientRect().top >= hud.contract.getBoundingClientRect().bottom,
     `objective top ${objEl.getBoundingClientRect().top.toFixed(0)} vs contract bottom ${hud.contract.getBoundingClientRect().bottom.toFixed(0)}`);

  /* O6 — the stall hint. Advisory, once, on SIM time (Dev\INDEX.md → AirportBaggageCrew
   * onboarding). Armed by the job starting (title.start), never by the page loading. */
  reset();
  for (const m of movers) m.grips.releaseAll('O6');
  if (M.title.visible) M.title.start(); else M.stallHint.armed = true;
  M.resetStallHint();
  M.pendingNotices.length = 0;
  hud._notices.length = 0;
  const hints = () => M.pendingNotices.filter((n) => /grab|hold/.test(n.text)).length +
                      hud._notices.filter((n) => /grab|hold/.test(n.text)).length;
  ok('O6 the job start arms a zeroed stall timer', M.stallHint.armed && M.stallHint.ms === 0 && !M.stallHint.fired,
     JSON.stringify(M.stallHint));
  const t0 = game.clock.simTimeMs;
  for (let k = 0; k < 60; k++) M.game.frame(FRAME);
  ok('O6a 60 running frames advance it by exactly the sim clock',
     Math.abs(M.stallHint.ms - (game.clock.simTimeMs - t0)) < 1e-6 && M.stallHint.ms > 900,
     `${M.stallHint.ms.toFixed(1)} vs clock ${(game.clock.simTimeMs - t0).toFixed(1)} ms`);
  game.setPaused(true);
  const msPaused = M.stallHint.ms;
  for (let k = 0; k < 60; k++) M.game.frame(FRAME);
  eq('O6b 60 PAUSED frames advance it by 0 (m0 E3 through the hint)', M.stallHint.ms, msPaused);
  game.setPaused(false);
  M.stallHint.ms = CONTRACT.stallHintMs - 5 * STEP;
  for (let k = 0; k < 4; k++) M.game.frame(FRAME);
  eq(`O6c one step short of CONTRACT.stallHintMs (${CONTRACT.stallHintMs} ms) there is no hint`, hints(), 0);
  for (let k = 0; k < 2; k++) M.game.frame(FRAME);
  eq('O6d …and at the threshold exactly ONE notice matching /grab|hold/ is raised', hints(), 1);
  const hintText = (M.pendingNotices.find((n) => /grab|hold/.test(n.text)) ||
                    hud._notices.find((n) => /grab|hold/.test(n.text)) || {}).text || '';
  ok('O6d …in seat 0\'s own glyphs (LMB / RMB), as a good-news notice',
     /LMB \/ RMB/.test(hintText), hintText);
  for (let k = 0; k < 120; k++) M.game.frame(FRAME);
  eq('O6e …and never a second one this run', hints(), 1);
  M.invoiceScreen.onReplay();
  ok('O6f a replay re-arms it for the next run', M.stallHint.armed && !M.stallHint.fired && M.stallHint.ms === 0,
     JSON.stringify(M.stallHint));
  M.pendingNotices.length = 0;
}
emit('running...');

/* ── P. THE COUCH'S LEGS, AND PREPARATION COSTS TIME (Phase 11 build-side M8) ───────────
 *
 * §7.1's own example verb — "four legs / screwdriver" — reached the way a player reaches
 * it (P1), and §8.2's "preparation time" finally PAID (P2): disassemble() has returned the
 * authored seconds since Phase 6 and _applyTool threw them away, so taking parts off was
 * free and §3.3's prepared branch had no cost to weigh against the brute one. The charge
 * goes on the labour clock the invoice reads AND on the phase's §27.4 line, so T1's
 * "phase durations add up to elapsedWorkMs" survives it (P3). P5 is the cargo payoff.
 * The brief's ids: P1 = "situation 8", P2 = "C11" (C11 was already the ramp pickup). */
lines.push('--- P. couch legs and the prep-time charge (M8: GDD §7.1, §8.2, §2.3, §3.3) ---');
{
  reset();
  const couch = byDef('couch_3seat_01');
  const sd = toolByDef('screwdriver_01');
  const near = (n, a, b, tol) => ok(n, Math.abs(a - b) <= tol, `${a} vs ${b} (tol ${tol})`);
  ok('P0 there is a couch and a screwdriver', !!couch && !!sd);
  if (couch && sd) {
    const home = posOf(couch);   // its kitchen spawn — O6f's replay just put it there
    parkAt(couch, -22, 0.45, 30);
    const p = posOf(sd);
    lookAt(me(), standOffFrom(p, 1.1), p);
    interact.act(me());
    step(6);
    ok('P0a the screwdriver is in hand', interact._for(me().id).carriedTool === sd.id);
    lookAt(me(), standOffFrom({ x: -22, y: 0.45, z: 30 }, 1.5), { x: -22, y: 0.45, z: 30 });
    step(4);

    /* P1 — situation 8. label() derives the words from the defId (interact.js label():
     * 'couch_3seat_01' -> 'couch 3seat'), the same way the wardrobe's prompt reads
     * 'take the doors off wardrobe'; the brief's 'the couch' is not what any prompt says. */
    const d = interact.describe(me());
    eq('P1 aiming the screwdriver at the couch promises its legs (§4.4, §7.1)',
       d.primary, 'take the legs off couch 3seat');
    const w0 = game.state.elapsedWorkMs;
    const phase0 = game.state.phase;
    const pm0 = game.state.telemetry.phaseMs[phase0];
    const gap0 = Object.values(game.state.telemetry.phaseMs).reduce((a, b) => a + b, 0) - w0;
    const msg = interact.act(me(), game.clock.simTimeMs);
    ok('P1a …and E takes them off', (couch.state.removedParts || []).includes('legs'),
       JSON.stringify(couch.state.removedParts));
    near('P1b …the collider is 0.77 m tall now', couch.collider.halfExtents().y * 2, 0.77, 1e-6);

    /* P2 — the brief's C11: the clock moved by the authored seconds, and by nothing else. */
    const charged = 60000 * TOOLS.screwdriver.timeScale;
    near(`P2 E charged ${charged} ms of preparation to the labour clock — no frame ran, only the charge (§8.2, §2.3)`,
         game.state.elapsedWorkMs - w0, charged, 1e-6);
    ok('P2a …and the notice names the cost', /60 s/.test(msg || '') && /legs off/.test(msg || ''), msg || '');
    ok('P2b …and the notice is what the HUD will show (interact.lastMessage)', interact.lastMessage === msg);
    near(`P3 the ${phase0} phase's §27.4 line took the same charge, so T1's sum still holds`,
         game.state.telemetry.phaseMs[phase0] - pm0, charged, 1e-6);
    /* Real frames, because only Game.step bills labour — the suite's step() helper drives
     * the systems and never touches the clock. The labour clock must then read the charge
     * plus exactly the sim time that passed, and nothing else. */
    const t0 = game.clock.simTimeMs;
    for (let k = 0; k < 6; k++) M.game.frame(FRAME);
    const simMs = game.clock.simTimeMs - t0;
    ok('P2c six real frames later the clock has moved by the charge PLUS the sim time, nothing more',
       simMs > 0 && Math.abs((game.state.elapsedWorkMs - w0) - (charged + simMs)) <= 1e-6,
       `${(game.state.elapsedWorkMs - w0).toFixed(3)} vs ${charged} + ${simMs.toFixed(3)}`);
    const gap1 = Object.values(game.state.telemetry.phaseMs).reduce((a, b) => a + b, 0) - game.state.elapsedWorkMs;
    near('P3a …phase durations minus elapsedWorkMs is unchanged by the charge', gap1, gap0, 1e-6);

    /* Q puts them back on — and since Phase 11 build-side M20 that is LABOUR too (§8.2: both
     * directions of a disassembly are "preparation time"; §4.4: priced on the line before the
     * key). P2d IS REWRITTEN DELIBERATELY: until M20 it asserted 'reassembly charged nothing
     * (recorded as a seam in KNOWN_ISSUES)' — the seam KNOWN_ISSUES called 'Reattaching is
     * free'. It now asserts the same 60 s (entry.seconds × TOOLS.screwdriver.timeScale) on
     * the same chargeWorkMs hook, on both clocks, and totals the whole off/frames/on sequence
     * so a double bill would show. */
    const w1 = game.state.elapsedWorkMs;
    const pm1 = game.state.telemetry.phaseMs[phase0];
    const dq = interact.describe(me());
    eq('P2d (M20) the Q line prices the reattach in advance: "put the legs back on — 60 s" (§4.4)',
       dq.secondary, `put the legs back on — ${(60 * TOOLS.screwdriver.timeScale).toFixed(0)} s`);
    // A subscriber, not the recorder's list: by section P the run's ring may be past its cap.
    let restoredEv = null;
    const offRestored = bus.on(EVENTS.PART_CHANGED, (e) => { if (e.action === 'restored') restoredEv = e; });
    const back = interact.secondary(me());
    offRestored();
    ok('P1c Q puts the legs back on', (couch.state.removedParts || []).length === 0 && /back on/.test(back || ''),
       `${JSON.stringify(couch.state.removedParts)} "${back}"`);
    near('P1d …and the collider is 0.85 m again', couch.collider.halfExtents().y * 2, 0.85, 1e-6);
    near(`P2d (M20, rewritten from "reassembly charged nothing") Q charged the same ${charged} ms — entry.seconds x timeScale, through M8's chargeWorkMs hook`,
         game.state.elapsedWorkMs - w1, charged, 1e-6);
    ok('P2d …and the notice names it: /legs back on/ and /60 s/', /legs back on/.test(back || '') && /60 s/.test(back || ''), back || '');
    near(`P2d …the ${phase0} phase's §27.4 line took the reattach too`, game.state.telemetry.phaseMs[phase0] - pm1, charged, 1e-6);
    near(`P2d …over the whole sequence elapsedWorkMs is off + six frames + on = 2 x ${charged} + ${simMs.toFixed(3)} ms — billed once each way, never twice`,
         game.state.elapsedWorkMs - w0, 2 * charged + simMs, 1e-6);
    near(`P2d …and telemetry.phaseMs.${phase0} carries both charges plus the sim time`,
         game.state.telemetry.phaseMs[phase0] - pm0, 2 * charged + simMs, 1e-6);
    ok('P2d …and the PART_CHANGED restored event on the bus carries the seconds, for the run record',
       !!restoredEv && restoredEv.entityId === couch.id && restoredEv.part === 'legs' && restoredEv.seconds === 60 * TOOLS.screwdriver.timeScale,
       JSON.stringify(restoredEv));

    /* P2e — the two phases that bill no labour bill none here either (same rule as Game.step). */
    game.state.phase = PHASES.SETTLEMENT;
    const w2 = game.state.elapsedWorkMs, s2 = game.state.telemetry.phaseMs[PHASES.SETTLEMENT];
    interact.act(me(), game.clock.simTimeMs);
    ok('P2e in SETTLEMENT the legs still come off but no labour is billed', (couch.state.removedParts || []).includes('legs') &&
       Math.abs(game.state.elapsedWorkMs - w2) < 1e-6, `${game.state.elapsedWorkMs - w2} ms billed`);
    near('P2f …while the settlement phase\'s own §27.4 line records the minute', game.state.telemetry.phaseMs[PHASES.SETTLEMENT] - s2, charged, 1e-6);
    interact.secondary(me());
    game.state.phase = phase0;
    // The non-reversible half of P2d is section M20 below, under its own header.

    /* P5 — the packed-volume payoff, through the cargo system's own accounting (cargo.js reads
     * currentDimensions). The couch alone in the box: intact 2.10 x 0.85 x 0.90 = 1.6065 m3,
     * legless 1.4553. Long axis along z — the box is exactly 2.10 wide (m7). */
    reset();
    parkAt(couch, M.truckPose.x, I.minY + 0.45 + 0.02, (I.minZ + I.maxZ) / 2, Math.PI / 2);
    step(90);
    const loaded = cargo.loadedEntities();
    ok('P5 parked in the truck the couch counts as loaded, and it is the only thing that does',
       loaded.length === 1 && loaded[0] === couch, loaded.map((e) => e.defId).join(', '));
    const vIntact = cargo.volumeUsed();
    near('P5a intact it takes 1.6065 m3 of the box', vIntact, 1.6065, 1e-3);
    disassemble(registry, couch, 'legs');
    const vLegless = cargo.volumeUsed();
    near('P5b legs off it takes 1.4553 m3 — 9.4% of a couch back (§10.5)', vLegless, 1.4553, 1e-3);
    lines.push(`      cargo volumeUsed: intact ${vIntact.toFixed(4)} m³, legless ${vLegless.toFixed(4)} m³ (-${((1 - vLegless / vIntact) * 100).toFixed(1)}%)`);
    reassemble(registry, couch, 'legs');
    parkAt(couch, home.x, home.y, home.z);
    reset();
  }
}
emit('running...');

/* ── M20. A PART AUTHORED NON-REVERSIBLE (Phase 11 build-side M20: GDD §4.4, §8.2) ───────────
 *
 * The brief's P2d, second half: "a non-reversible entry's Q path charges nothing and the undo
 * label says 'cannot be put back'" — in M20's own section (a milestone's new assertions live
 * under its own header in a shared suite), on section P's couch fixture; the ids stay P2d so
 * the brief's reviewer can find them. No shipped entry is non-reversible (every disassembly
 * row says reversible: true), so the entity's `def` is swapped for a copy whose entry says
 * false (OBJECT_DEFS is frozen; the entity's own binding is the registry's) and restored
 * before the fixture is unwound.
 *
 * The refusal is the PROMPT's, not the API's: tools.js reassemble() reports `reversible` and
 * puts the part back for whoever calls it, because it is also the reset's way back — main.js
 * forces it in the boot-time unwind and calls it PLAIN in the replay reset, then clears
 * removedParts; a refusal in the API would leave that path with the collider at 0.77 m for
 * the rest of the session. The last assertion pins the plain call. */
lines.push('--- M20. a part authored non-reversible: the line says so, Q does nothing, nothing is billed (M20: GDD §4.4, §8.2) ---');
{
  reset();
  const couch = byDef('couch_3seat_01');
  const sd = toolByDef('screwdriver_01');
  ok('P2d fixture: the couch and the screwdriver', !!couch && !!sd);
  if (couch && sd) {
    const home = posOf(couch);
    parkAt(couch, -22, 0.45, 30);
    // The screwdriver picked up from open ground with an exact aim (section DL's pickup).
    parkAt(sd, -50, 0.05, 40);
    const ps = posOf(sd);
    lookAt(me(), standOffFrom(ps, 1.1), ps, true);
    step(2);
    interact.act(me());
    step(6);
    ok('P2d fixture: the screwdriver is in hand', interact._for(me().id).carriedTool === sd.id);
    lookAt(me(), standOffFrom({ x: -22, y: 0.45, z: 30 }, 1.5), { x: -22, y: 0.45, z: 30 });
    step(4);
    const charged = 60 * TOOLS.screwdriver.timeScale * 1000;
    const wOff = game.state.elapsedWorkMs;
    interact.act(me(), game.clock.simTimeMs);
    ok(`P2d fixture: E takes the legs off and bills the ${charged} ms section P measured`,
       (couch.state.removedParts || []).includes('legs') && Math.abs(game.state.elapsedWorkMs - wOff - charged) < 1e-6,
       `${JSON.stringify(couch.state.removedParts)} billed ${game.state.elapsedWorkMs - wOff} ms`);
    const realDef = couch.def;
    couch.def = { ...realDef, disassembly: realDef.disassembly.map((p) => ({ ...p, reversible: false })) };
    const wn = game.state.elapsedWorkMs;
    const dn = interact.describe(me());
    ok('P2d a non-reversible entry: the undo label says the legs cannot be put back (§4.4)',
       (couch.state.removedParts || []).includes('legs') && /cannot be put back/.test(dn.secondary || ''), `"${dn.secondary}"`);
    const saidN = interact.secondary(me());
    ok('P2d …Q says the same, the legs stay off (collider 0.77), and nothing is billed',
       /cannot be put back/.test(saidN || '') && (couch.state.removedParts || []).includes('legs') &&
       Math.abs(couch.collider.halfExtents().y * 2 - 0.77) < 1e-6 && game.state.elapsedWorkMs - wn === 0,
       `"${saidN}" off=${JSON.stringify(couch.state.removedParts)} billed ${game.state.elapsedWorkMs - wn} ms`);
    const rr = reassemble(registry, couch, 'legs');
    ok('P2d …while reassemble() itself — the reset\'s path, called plain as main.js\'s replay reset calls it — still puts the part back: collider 0.85, reversible false, 0 s',
       !!rr && rr.reversible === false && rr.seconds === 0 && (couch.state.removedParts || []).length === 0 &&
       Math.abs(couch.collider.halfExtents().y * 2 - 0.85) < 1e-6,
       rr ? JSON.stringify({ reversible: rr.reversible, seconds: rr.seconds, height: couch.collider.halfExtents().y * 2 }) : 'null');
    couch.def = realDef;
    parkAt(couch, home.x, home.y, home.z);
    reset();
  }
}
emit('running...');

/* ── DL. THE DOOR VERBS (Phase 11 build-side M11: GDD §8.2, §9.2, §4.4, §2.3) ────────────
 *
 * Section B's invariant — "if describe() promises it, act() does it" — applied to the two
 * verbs M11 adds: E with the screwdriver at a HUNG door leaf reads 'take the door off its
 * hinges' and does exactly that (billing DOOR.removeSeconds to the clock, M8's hook); Q at
 * the leaf lying beside its doorway reads 'hang the door back on its hinges' and does that.
 * Kept OUT of the B sweep so B7c's count stays the eight M8 pinned (M12 adds its own ninth
 * there); the promise/honour pair is counted here instead. The full door physics is
 * tools/m19-tests.js; this is the prompt contract only. */
lines.push('--- DL. the door verbs keep their promises (M11: GDD §8.2, §9.2, §4.4, §2.3) ---');
{
  reset();
  const leaf = M.doors.leafFor('living_kitchen');
  const home = leaf.state.home;
  const d = M.doors.doorById('living_kitchen');
  const sd = toolByDef('screwdriver_01');
  // The screwdriver, picked up from open ground with an exact aim (the rack sits under the
  // truck deck and a camera behind a mover standing there aims through the deck collider).
  M.doors.rehangAll('test');
  parkAt(sd, -50, 0.05, 40);
  let p = posOf(sd);
  lookAt(me(), standOffFrom(p, 1.1), p, true);
  step(2);
  interact.act(me());
  eq('DL0 the screwdriver is in hand', interact._for(me().id).carriedTool, sd.id);
  let promised = 0, honoured = 0;

  // E at the hung leaf, from the living room: its hinge end stands in the opening at z = -5.
  lookAt(me(), { x: home.x, z: d.at + 1.0 }, { x: home.x, y: 1.0, z: d.at - 0.05 }, true);
  step(4);
  const seen = interact.describe(me());
  eq('DL1 the screwdriver at a hung door promises exactly \'take the door off its hinges\' (§4.4)', seen.primary, DOOR_REMOVE_LABEL);
  ok('DL1a …and Q, with nothing to undo yet, offers the screwdriver down', /put down the screwdriver/.test(seen.secondary || ''), seen.secondary || '');
  const work0 = game.state.elapsedWorkMs;
  if (seen.primary) {
    promised++;
    const r = pressE(me());
    if (r.did) honoured++;
    ok('DL2 …and E honours it: the leaf is off (dynamic, hung false)', !!r.did && leaf.body.isDynamic() && leaf.state.hung === false, `${r.did} / hung ${leaf.state.hung}`);
    ok(`DL2a …billing DOOR.removeSeconds (${DOOR.removeSeconds} s) to the labour clock, M8's hook — no frame ran, only the charge`,
       Math.abs(game.state.elapsedWorkMs - work0 - DOOR.removeSeconds * 1000 * TOOLS.screwdriver.timeScale) < 1e-6, `${game.state.elapsedWorkMs - work0} ms`);
    ok('DL2b …and the notice names the cost', new RegExp(`${DOOR.removeSeconds} s`).test(r.did || ''), r.did || '');
  }
  // Q at the leaf, which now lies in the kitchen along the partition (x 0.15..2.15, z -5.87..-5.07).
  step(20);
  lookAt(me(), { x: 0.6, z: -6.4 }, { x: 0.9, y: 0.03, z: -5.5 }, true);
  step(2);
  const seen2 = interact.describe(me());
  eq('DL3 at the leaf beside its doorway, Q promises exactly \'hang the door back on its hinges\' (§8.2 reattach)', seen2.secondary, DOOR_REHANG_LABEL);
  ok('DL3a …and E promises nothing for a door that is already off', !seen2.primary, seen2.primary || '');
  if (seen2.secondary === DOOR_REHANG_LABEL) {
    promised++;
    const did = interact.secondary(me());
    if (did) honoured++;
    ok('DL4 …and Q honours it: Fixed again at its jamb, hung true', !!did && leaf.body.isFixed() && leaf.state.hung === true &&
       Math.hypot(posOf(leaf).x - home.x, posOf(leaf).z - home.z) < 1e-3, `${did} / hung ${leaf.state.hung}`);
  }
  lines.push(`      ${promised} door promises made, ${honoured} honoured`);
  ok('DL5 two door promises made, two honoured — the M11 verbs keep section B\'s invariant', promised === 2 && honoured === 2, `${promised}/${honoured}`);
  // Everything back: the screwdriver on its rack, the leaf on its hinges, nothing carried.
  interact._putDown(me(), sd, { point: { x: -50, y: 0.1, z: 42 } });
  parkAt(sd, -0.10, 0.05, 9.0);
  M.doors.rehangAll('test');
  reset();
  void p;
}
emit('running...');

/* ── M15. a lost screwdriver is not a soft lock (Phase 11 build-side M15: GDD §26.6, §18.3, §9.2) ──
 *
 * The verb that reached every disassembly and every door was one dropped tool from being
 * unreachable for the rest of the run. Lose the screwdriver, drive the game's own frames,
 * and the prompt at the rack has to offer it again — PROMISED == DELIVERED, after a loss. */
lines.push('--- M15. a lost screwdriver comes back, and the verb is reachable again (Phase 11 build-side M15) ---');
{
  reset();
  const sd = toolByDef('screwdriver_01');
  const countBefore = M.recoveryCount();
  sd.body.setTranslation({ x: 0, y: -50, z: 0 }, true);
  sd.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  sd.body.wakeUp();
  for (let i = 0; i < RECOVERY.maxFrames + 30; i++) M.game.frame(FRAME);
  const p = posOf(sd);
  ok('M15-1 the screwdriver is back on its rack slot within RECOVERY.maxFrames of game.frame(), dynamic, in the object group',
     Math.abs(p.x - sd.home.x) < 0.05 && Math.abs(p.z - sd.home.z) < 0.05 && p.y > RECOVERY.toolFloorY && sd.body.isDynamic() &&
     sd.collider.collisionGroups() === GROUP_PRESETS.object,
     `at (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}) home (${sd.home.x}, ${sd.home.y}, ${sd.home.z})`);
  eq('M15-2 recoveryCount() counts the callout (the invoice will bill it, tools included)', M.recoveryCount() - countBefore, 1);
  // Walked up to from open ground, exactly as section C reaches the rack (the slot sits inside
  // the deck block's footprint; a camera snapped straight behind the mover aims from inside it).
  lookAt(me(), { x: -20, z: 60 }, { x: -20, y: 0.2, z: 90 });
  lookAt(me(), standOffFrom(p, 1.1), p);
  const d = interact.describe(me());
  ok('M15-3 the prompt at the rack offers it again', /pick up the screwdriver/.test(d.primary || ''), d.primary || 'nothing');
  const said = interact.act(me());
  ok('M15-4 …and E honours it (promised == delivered, after a loss)', /carrying/.test(said || '') && sd.state.carriedBy === me().id, said || 'nothing');
  interact._putDown(me(), sd, { point: { x: -50, y: 0.1, z: 42 } });
  parkAt(sd, sd.home.x, sd.home.y, sd.home.z);
  reset();
}
emit('running...');

/* ── M29 (Phase 11 build-side): the shipping default is still the layout O5 measured ─────
 * The HUD suite's rects (F2, O5) are all read at --ts 1 with the help line on one row, and
 * everything M29 added to the bottom edge — the route bar's offset, the caption's, the
 * notices' — is `calc(<the same px> * var(--ts) + var(--help-lift))`. Both terms are therefore
 * identity in the build a player boots into, and this is the assertion that says so: if a
 * future milestone ships a --ts other than 1, or a help line long enough to wrap at 1.0×, the
 * O-series numbers move and this fails first, in the suite that owns them. */
lines.push('--- M29. the default layout is unscaled and unlifted (Phase 11 build-side M29) ---');
{
  const root = getComputedStyle(document.documentElement);
  eq('M29-1 --ts is 1 in the shipping default', root.getPropertyValue('--ts').trim(), '1');
  eq('M29-2 …and --help-lift is 0 px (the help line is on one row)', root.getPropertyValue('--help-lift').trim(), '0.00px');
  const helpEl = document.getElementById('help');
  const cs = getComputedStyle(helpEl);
  const rows = Math.round((helpEl.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)) / parseFloat(cs.lineHeight));
  eq('M29-3 …measured on the line itself, not on the variable', rows, 1);
  ok('M29-4 …and the line is not clipped (it wraps rather than overflowing now)',
     helpEl.scrollWidth <= helpEl.clientWidth + 0.5 && helpEl.getBoundingClientRect().left >= -0.5,
     `${helpEl.scrollWidth}/${helpEl.clientWidth} at left ${helpEl.getBoundingClientRect().left.toFixed(1)}`);
  /* …and the third identity term. SETTINGS.textSize.helpMaxLines is enforced by shrinking the
   * help line (--help-squeeze, main.js syncHelpMetrics), which is a real change to the shipping
   * layout the moment it is spent. It is not spent here: one row needs no ladder. */
  eq('M29-5 …and --help-squeeze is 1 (the line budget is not being spent to hold the layout)',
     root.getPropertyValue('--help-squeeze').trim(), '1');
  eq('M29-6 …which the line\'s own font-size shows: 12px, not a squeezed one', cs.fontSize, '12px');
  /* …and the ladder did not merely fail to help: the floor flag says the line is INSIDE the
   * budget here, not over it with nothing left to spend (m36 S1g drives the other branch). */
  eq('M29-7 …and the budget is met rather than lapsed (helpMetrics.overBudget)', M.helpMetrics.overBudget, false);
}

/* ── H. integration (§26.6) ──────────────────────────────────────────────── */
lines.push('--- H. integration (GDD §26.6) ---');
{
  reset();
  const bodiesBefore = physics.stats.bodies;
  for (let i = 0; i < 120; i++) M.game.frame(16.7);
  ok('H1 no bodies leak over 120 real frames with the full UI live',
     physics.stats.bodies === bodiesBefore, `${bodiesBefore} -> ${physics.stats.bodies}`);
  ok('H2 game state stays JSON-serializable', (() => {
    try { JSON.parse(JSON.stringify(game.state)); return true; } catch (e) { return false; }
  })());
  ok('H3 no error banner appeared during the suite', !document.getElementById('err-banner'));
  void MANIFEST; void TOOLS;
}

} catch (e) {
  fails++;
  lines.push(`FAIL  suite threw  <- ${e && e.message}`);
  lines.push((e && e.stack || '').split('\n').slice(0, 6).join('\n'));
}

emit();
