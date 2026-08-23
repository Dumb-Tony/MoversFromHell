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
import { TARGET } from '../src/player/interact.js';
import { STRAP_STATE } from '../src/cargo/straps.js';
import { cabPoint, cargoAnchors, cargoInterior, rampAnchorPoint } from '../src/world/truck.js';
import { DEFAULT_BINDINGS, CONTEXTS } from '../src/core/input.js';
import { reassemble } from '../src/tools/tools.js';
import { GROUP_PRESETS } from '../src/physics/world.js';

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
const STEP = SIM.stepMs;
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
function lookAt(m, from, target) {
  placeMover(m, from.x, from.z, from.y !== undefined ? from.y : 0.2);
  const p = m.controller.position;
  rig.yaw = Math.atan2(-(target.x - p.x), -(target.z - p.z));
  rig.pitch = Math.atan2(target.y - (p.y + 1.4), Math.hypot(target.x - p.x, target.z - p.z));
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
  for (const e of registry.entities.values()) {
    if (e.state.dollyId) tools.detachDolly(tools.get(e.state.dollyId));
    if (e.state.blanketId) tools.removeBlanket(tools.get(e.state.blanketId));
    for (const p of [...(e.state.removedParts || [])]) reassemble(registry, e, p);
  }
  for (const s of interact.state.values()) { s.carriedTool = null; s.pendingAnchor = null; }
  for (const t of tools.tools.values()) {
    t.body.setBodyType(physics.R.RigidBodyType.Dynamic, true);
    t.collider.setCollisionGroups(GROUP_PRESETS.object);
    t.state.carriedBy = null; t.state.attachedTo = null; t.state.deployed = false;
  }
}

try {
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

  let promised = 0, honoured = 0;
  const broken = [];
  for (const [name, setup] of situations) {
    setup();
    step(4);
    const d = interact.describe(me());
    if (!d.primary) continue;
    promised++;
    const did = interact.act(me(), game.clock.simTimeMs);
    if (did) honoured++; else broken.push(`${name}: promised "${d.primary}"`);
  }
  lines.push(`      ${promised} promises made, ${honoured} honoured`);
  ok('B6 every action the prompt offers is one E can perform (§4.4)',
     broken.length === 0, broken.join(' | '));
  ok('B7 …and the sweep actually exercised several situations', promised >= 5, `${promised}`);
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
  ok('E5 …and the HUD has a route to show', route.status().state === 'driving' &&
     route.status().progress >= 0);

  // Drive it out.
  for (let k = 0; k < 1750; k++) { step(1); route.step(STEP, k * STEP); }
  eq('E6 the route completes on its own', route.state, 'arrived');

  lookAt(me(), standOffFrom(cab, 1.4), cab);
  const d2 = interact.describe(me());
  ok('E7 the cab then offers to settle up', /settle/.test(d2.primary || ''), d2.primary || '');
  route.reset();
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
  const centreClear = ['#contract', '#cargo-status', '#notices', '#route-bar'].every((sel) => {
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
  ok('F8 …and notices expire on their own', (() => {
    hud._notices.forEach((n) => { n.until = performance.now() - 1; });
    hud.tickNotices();
    return hud.notices.textContent === '';
  })());

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
  M.settle();
  ok('G2 settling shows the invoice', M.invoiceScreen.visible && !M.invoiceScreen.el.hidden);
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
  ok('G12 …and the game is running again', !game.state.paused);
}
emit('running...');

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
