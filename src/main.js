/* Boot + render loop — GDD §22.2 (App/State), §22.3 (fixed-step loop), §25.2 phases 0-2.
 *
 * §22.3's order, mapped onto the system registration order below:
 *   1. collect actions and update desired player/hand targets   -> 'look', 'player'
 *   2. advance fixed physics steps with a capped accumulator     -> 'physics'
 *   3. resolve grip/tool constraints and collision events        -> 'grips'
 *   4. aggregate damage, cargo, zone and contract changes        -> 'objects', 'contract'
 *   5. interpolate transforms for rendering; update camera and UI-> the render loop
 *   6. record a lightweight event log for scoring and debugging  -> EventBus
 *
 * Two orderings matter and both are the opposite of the naive reading:
 *   - 'player' runs BEFORE 'physics'. The character controller only computes and QUEUES a
 *     kinematic translation; world.step() is what applies it.
 *   - 'grips' also runs BEFORE 'physics', even though §22.3 lists constraints after it.
 *     Forces are ACCUMULATED by addForceAtPoint and CONSUMED by the next step, so applying
 *     them afterwards would cost one step of lag on every carry.
 *   - 'objects' runs AFTER, because settle detection reads post-step velocities.
 *
 * BOOT IS ASYNCHRONOUS, because Rapier decodes an inlined WASM module before it can be
 * used. Anything that needs the live game must await window.__MFH_READY rather than
 * reading window.__MFH, which does not exist until boot resolves.
 */

import { Game } from './game.js';
import { Input, CONTEXTS } from './core/input.js';
import { EventBus, EVENTS, PHASES } from './core/eventBus.js';
import { createRenderer } from './render/renderer.js';
import { buildScene, RAMP } from './render/scene.js';
import { ThirdPersonCamera } from './render/camera.js';
import { makeBlockout } from './render/playerBody.js';
import { DebugOverlay } from './dev/debugOverlay.js';
import { initPhysics, PhysicsWorld } from './physics/world.js';
import { PlayerController, LOCOMOTION } from './player/controller.js';
import { ObjectRegistry } from './objects/registry.js';
import { PHASE2_SPAWNS, PHASE3_SPAWNS } from './objects/definitions.js';
import { GripSystem, HANDS } from './player/grip.js';
import { Hud } from './ui/hud.js';
import { BUILD } from './config.js';

const canvas = document.getElementById('stage');
const ui = document.getElementById('ui');

/** Resolves to the same object as window.__MFH once boot completes. Test suites and any
 *  other late-loading module must await this. */
window.__MFH_READY = boot().catch((e) => {
  window.onerror('Boot failed: ' + (e && e.message), '', 0);
  throw e;
});

async function boot() {
  const { THREE, renderer, camera, syncSize } = createRenderer(canvas);
  const world = buildScene();
  const rig = new ThirdPersonCamera(camera, world.colliders);

  // ---- physics ------------------------------------------------------------------------
  const R = await initPhysics();
  const physics = new PhysicsWorld(R);
  physics.addGround();
  physics.addStaticFromColliders(world.colliders);
  // The ramp is NOT in world.colliders: an axis-aligned box cannot represent a slope, and
  // a box-shaped stand-in would be a lie the camera would then occlude against. It is
  // built here from the same RAMP spec the mesh uses.
  physics.addRamp(RAMP);
  // castRay reads a pipeline that only world.step() populates, so the first mantle probe
  // of the session would find nothing without this. MEASURED — see world.js.
  physics.primeQueries();

  const player = new PlayerController(physics, world.spawn);
  const body = makeBlockout();
  world.scene.add(body.group);

  const bus = new EventBus();
  const input = new Input(window, canvas).attach();
  const game = new Game({ contractId: 'suburban_starter', input, bus });

  // ---- movable objects (Phase 2) --------------------------------------------------------
  const registry = new ObjectRegistry(physics, world.scene);
  for (const s of PHASE2_SPAWNS) registry.spawn(s.def, s);
  for (const s of PHASE3_SPAWNS) registry.spawn(s.def, s);
  // attachTo wires the body's forced-release hook: being knocked down drops what you were
  // carrying, which is §5.1's consequence rather than a cosmetic state change.
  const grips = new GripSystem(physics, registry, rig, camera, bus, player).attachTo(player);
  // New colliders are invisible to raycasts until the next step (MEASURED — world.js), and
  // the very first grab probe happens before any step has run.
  physics.primeQueries();

  // ---- systems, in §22.3 order ----------------------------------------------------------
  game.addSystem('look', (state, stepMs, ctx) => {
    rig.applyLook(ctx.input.consumeLook());
  });

  game.addSystem('player', (state, stepMs, ctx) => {
    const inp = ctx.input;
    const p = state.players[state.localPlayerId];

    // §4.4: movement is camera-relative. The rig owns the basis; the controller never
    // computes its own forward vector, so the two cannot disagree.
    const intent = {
      move: inp.moveAxis(),
      forward: rig.forwardFlat(),
      right: rig.rightFlat(),
      // §4.2: Shift is "sprint when free; brace/exert while gripping". Since Phase 2 both
      // branches are live — holding anything turns sprint into brace, which is what makes
      // §6.2's brace force bonus reachable without a second key.
      run: inp.isDown('brace') && !hasAnyGrip(p),
      brace: inp.isDown('brace') && hasAnyGrip(p),
      jump: inp.wasPressed('jump'),
      recover: inp.wasPressed('recover'),
    };

    const before = player.recoveries;
    p.locomotion = player.step(stepMs, intent);

    const pos = player.position;
    p.position.x = pos.x; p.position.y = pos.y; p.position.z = pos.z;

    // Face the direction of travel, not the camera: §5.1 wants readable locomotion, and a
    // character permanently facing the camera cannot show which way it is walking.
    const travel = player.travelYaw();
    if (travel !== null) p.yaw = travel;

    if (player.recoveries > before) {
      ctx.bus.emit(EVENTS.RECOVERY, {
        entityId: p.id, reason: player.lastRecoveryReason, fee: 0,
        newTransform: { ...player.lastStable },
      }, ctx.simTimeMs);
    }
  });

  /* §22.3 lists "resolve grip/tool constraints" after the physics step. With a real
   * solver the practical ordering is the other way round and means the same thing: forces
   * are ACCUMULATED here and CONSUMED by the next world.step(), so a grip force applied
   * after the step would not be felt until the following frame — one step of lag on every
   * carry, which is exactly the sponginess the Phase 2 gate calls "not controllable". */
  game.addSystem('grips', (state, stepMs, ctx) => {
    const inp = ctx.input;
    const p = state.players[state.localPlayerId];

    // Press-and-hold is the default (§4.4); Input resolves hold-vs-toggle itself, so this
    // reads the same either way.
    for (const hand of HANDS) {
      const action = hand === 'left' ? 'gripLeft' : 'gripRight';
      const want = inp.isDown(action);
      const have = !!grips.grips[hand];
      if (want && !have) grips.tryGrab(hand, p.id, ctx.simTimeMs);
      else if (!want && have) grips.release(hand, 'released', ctx.simTimeMs);
    }

    grips.step(stepMs, { brace: inp.isDown('brace'), simTimeMs: ctx.simTimeMs });

    // Mirror into serializable state (§22.4). The renderer and HUD read this, not the bodies.
    p.grips.left = grips.grips.left ? grips.grips.left.entityId : null;
    p.grips.right = grips.grips.right ? grips.grips.right.entityId : null;
  });

  game.addSystem('physics', () => { physics.step(); });

  // After the step, because it reads post-step velocities to decide "settled" (§12.3).
  game.addSystem('objects', (state, stepMs) => { registry.step(stepMs); });

  game.addSystem('contract', () => {});   // Phase 5

  game.setPhase(PHASES.PICKUP);

  const overlay = new DebugOverlay(ui, game);
  const hud = new Hud(ui);

  const stamp = document.createElement('div');
  stamp.id = 'build-stamp';
  stamp.textContent = `Movers From Hell — ${BUILD.label} · ${BUILD.date} · F3 for stats`;
  ui.appendChild(stamp);

  const help = document.createElement('div');
  help.id = 'help';
  help.innerHTML = '<b>Click to look around.</b> &nbsp; WASD move · Shift sprint · ' +
                   'Space jump/mantle · <b>LMB/RMB grab</b> · R recover · Esc pause · F3 stats';
  ui.appendChild(help);

  // ---- shell wiring ---------------------------------------------------------------------
  input.onBlur = () => game.setPaused(true);           // §21.4 solo pause
  canvas.addEventListener('click', () => {
    if (!input.pointerLocked && !game.state.paused) input.requestPointerLock();
  });
  // Pause and the debug key are read on the RENDER frame, not in a system: they must keep
  // working while the simulation is paused, and a paused clock runs no systems at all.
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') game.togglePause();
    if (e.code === 'F3') { e.preventDefault(); overlay.toggle(); }
  });

  // ---- main loop ------------------------------------------------------------------------
  let lastT = performance.now();
  function loop(now) {
    const frameMs = now - lastT;
    lastT = now;

    syncSize();   // recover from a 0x0 boot; see renderer.js
    overlay.stepsThisFrame = game.frame(frameMs);

    // §22.3 step 5: presentation runs on REAL time, reads state, and never writes it.
    const p = game.state.players[game.state.localPlayerId];
    const dt = Math.min(frameMs, 100) / 1000;
    body.update(p.position, p.yaw, player.horizontalSpeed, dt);
    rig.update(p.position, dt);   // the rig adds camera height itself
    registry.syncMeshes();
    hud.update(grips.status());

    renderer.render(world.scene, camera);
    overlay.update(frameMs, {
      bodies: physics.stats.bodies,
      constraints: physics.stats.constraints,
      contacts: physics.stats.contacts,
      // §5.1/§5.2 made visible: what you are holding, how close to falling over, how tired.
      carry: `${player.carriedMass.toFixed(0)} kg · speed x${player.loadSpeedMult.toFixed(2)} · ` +
             `balance ${player.imbalance.toFixed(2)} · exert ${player.exertion.toFixed(2)}`,
    });

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  /* Test seam. tools\m*-tests.js drive the game through this instead of waiting for real
   * frames, because headless Chrome in --dump-dom mode delivers only 1-3 rAF callbacks in
   * total (MEASURED — Dev\INDEX.md → Tooling & testing). */
  const api = {
    game, input, rig, world, overlay, hud, renderer, camera, syncSize,
    physics, player, body, registry, grips, THREE, CONTEXTS, PHASES, LOCOMOTION,
  };
  window.__MFH = api;
  return api;
}

/** §4.2's Shift is sprint-when-free and brace-when-gripping. Grips arrive in Phase 2; this
 *  is the one place that decides which meaning applies. */
function hasAnyGrip(p) {
  return !!(p.grips && (p.grips.left || p.grips.right));
}
