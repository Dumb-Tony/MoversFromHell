/* Boot + render loop — GDD §22.2 (App/State), §22.3 (fixed-step loop), §25.2 phases 0-1.
 *
 * §22.3's order is followed literally, and the system registration order below IS that
 * list. Read it top to bottom:
 *   1. collect actions and update desired player/hand targets   -> 'look', 'player'
 *   2. advance fixed physics steps with a capped accumulator     -> 'physics'
 *   3. resolve grip/tool constraints and collision events        -> 'grips'    (Phase 2)
 *   4. aggregate damage, cargo, zone and contract changes        -> 'contract' (Phase 5)
 *   5. interpolate transforms for rendering; update camera and UI-> the render loop
 *   6. record a lightweight event log for scoring and debugging  -> EventBus
 *
 * 'player' must run before 'physics': the character controller only computes and QUEUES a
 * kinematic translation, and world.step() is what actually applies it.
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
      // §4.2: Shift is "sprint when free; brace/exert while gripping". Nothing can be
      // gripped until Phase 2, so today it is sprint. The branch is written now so the
      // meaning change is one condition later, not a rewrite.
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

  game.addSystem('physics', () => { physics.step(); });

  game.addSystem('grips',    () => {});   // Phase 2
  game.addSystem('contract', () => {});   // Phase 5

  game.setPhase(PHASES.PICKUP);

  const overlay = new DebugOverlay(ui, game);

  const stamp = document.createElement('div');
  stamp.id = 'build-stamp';
  stamp.textContent = `Movers From Hell — ${BUILD.label} · ${BUILD.date} · F3 for stats`;
  ui.appendChild(stamp);

  const help = document.createElement('div');
  help.id = 'help';
  help.innerHTML = '<b>Click to look around.</b> &nbsp; WASD move · Shift sprint · ' +
                   'Space jump/mantle · R recover · Esc pause · F3 stats';
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

    renderer.render(world.scene, camera);
    overlay.update(frameMs, {
      bodies: physics.stats.bodies,
      constraints: physics.stats.constraints,
      contacts: physics.stats.contacts,
    });

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  /* Test seam. tools\m*-tests.js drive the game through this instead of waiting for real
   * frames, because headless Chrome in --dump-dom mode delivers only 1-3 rAF callbacks in
   * total (MEASURED — Dev\INDEX.md → Tooling & testing). */
  const api = {
    game, input, rig, world, overlay, renderer, camera, syncSize,
    physics, player, body, THREE, CONTEXTS, PHASES, LOCOMOTION,
  };
  window.__MFH = api;
  return api;
}

/** §4.2's Shift is sprint-when-free and brace-when-gripping. Grips arrive in Phase 2; this
 *  is the one place that decides which meaning applies. */
function hasAnyGrip(p) {
  return !!(p.grips && (p.grips.left || p.grips.right));
}
