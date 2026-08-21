/* Boot + render loop — GDD §22.2 (App/State), §22.3 (fixed-step loop), §25.2 phases 0-4.
 *
 * §22.3's order, mapped onto the system registration order below:
 *   1. collect actions and update desired player/hand targets   -> 'look', 'movers'
 *   2. advance fixed physics steps with a capped accumulator     -> 'physics'
 *   3. resolve grip/tool constraints and collision events        -> 'movers' (grips)
 *   4. aggregate damage, cargo, zone and contract changes        -> 'objects', 'contract'
 *   5. interpolate transforms for rendering; update camera and UI-> the render loop
 *   6. record a lightweight event log for scoring and debugging  -> EventBus
 *
 * Three orderings matter, and each is the opposite of the naive reading:
 *   - 'movers' runs BEFORE 'physics'. The character controller only computes and QUEUES a
 *     kinematic translation, and grip forces are ACCUMULATED and consumed by the next
 *     world.step(); applying either afterwards costs a step of lag on every carry.
 *   - 'clearForces' runs before 'movers', ONCE. Rapier forces persist and compound, and
 *     with two movers a per-mover clear would wipe the other mover's force every step.
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
import { PHASE5_SPAWNS } from './objects/definitions.js';
import { buildManifest, stepManifest, validateManifest, overlappingSpawns } from './contract/manifest.js';
import { overlappingZones } from './world/house.js';
import { ToolSystem } from './tools/tools.js';
import { StrapSystem } from './cargo/straps.js';
import { CargoSystem } from './cargo/cargo.js';
import { TRUCK_POSE, cargoInterior, cargoAnchors } from './world/truck.js';
import { DEST_ZONES, DEST_SHELL, insideDestination } from './world/destination.js';
import { DamageSystem } from './damage/damage.js';
import { RouteDriver } from './drive/route.js';
import { PHASE6_TOOL_SPAWNS, validateAllToolDefs } from './tools/definitions.js';
import { GripSystem, HANDS, restoreClearedObjects, moversOn } from './player/grip.js';
import { Hud } from './ui/hud.js';
import { BUILD, MOVERS } from './config.js';

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

  const bus = new EventBus();
  const input = new Input(window, canvas).attach();
  const game = new Game({ contractId: 'suburban_starter', input, bus });

  /* ---- the contract's objects (Phase 5) -------------------------------------------------
   * PHASE5_SPAWNS replaces the Phase 2 and Phase 3 spawn lists outright. Those were four
   * and two objects placed on the driveway to have something to grab; this is §13.2's
   * manifest placed in the rooms it belongs in, and keeping the old lists as well would
   * leave loose boxes in the front garden of what is now a real pickup site.
   *
   * §24.4 asks for content validators early: "incorrect colliders, zones, anchors and
   * manifests will dominate production bugs". All three run at LOAD, in the shipping build
   * and not only in the suite — an authoring error should announce itself in the build it
   * is in, rather than waiting for someone to run tests. */
  const manifestProblems = validateManifest(PHASE5_SPAWNS);
  const spawnOverlaps = overlappingSpawns(PHASE5_SPAWNS);
  const zoneOverlaps = overlappingZones();
  if (manifestProblems.length + spawnOverlaps.length + zoneOverlaps.length > 0) {
    console.warn('[MFH] content validation', { manifestProblems, spawnOverlaps, zoneOverlaps });
  }

  const registry = new ObjectRegistry(physics, world.scene);
  game.state.manifest = buildManifest(PHASE5_SPAWNS);
  PHASE5_SPAWNS.forEach((s, i) => {
    const e = registry.spawn(s.def, s);
    game.state.manifest[i].entityId = e.id;
  });

  /* ---- tools (Phase 6) -------------------------------------------------------------------
   * §9.2: "Tools are world objects and consume cargo space unless mounted." They spawn on a
   * rack in the driveway (§9.3) as real bodies with mass, so leaving one behind is a mistake
   * you make with your hands rather than a menu you failed to read. */
  const toolProblems = validateAllToolDefs();
  if (Object.keys(toolProblems).length) console.warn('[MFH] tool validation', toolProblems);
  const tools = new ToolSystem(physics, registry, world.scene, bus);
  for (const s of PHASE6_TOOL_SPAWNS) tools.spawn(s.def, s);
  physics.primeQueries();

  /* ---- cargo (Phase 7) -------------------------------------------------------------------
   * §10.1: the cargo box is a real collision-enabled space, built in scene.js from
   * truck.js's records. Nothing here is an inventory: an object is loaded when it is
   * physically inside the truck and has settled there. */
  const straps = new StrapSystem(registry, bus);
  const cargo = new CargoSystem(registry, straps, tools, bus);

  /* ---- damage and the drive (Phase 8) ----------------------------------------------------
   * §10.4 is the rule: outcomes "derive from physical contacts, velocity, damage, and
   * constraints during transport", and a heuristic "must not secretly damage items without a
   * physical cause". So damage reads what bodies actually did, and the route applies forces
   * to those bodies. There is no path from a pack-quality score to an object's condition. */
  const damage = new DamageSystem(physics, registry, bus, game.state);
  const route = new RouteDriver(cargo, bus);

  /* ---- movers (Phase 4) -----------------------------------------------------------------
   * §25.2's Phase 4 is the cooperative seam, gated on "multiple grips combine predictably".
   * There are now N real movers, each with their own capsule, hands and grips. They share
   * one camera rig — you drive one at a time and Tab swaps — because this build is not
   * networked and §13.4 says not to let production networking delay feel tests.
   *
   * The inactive mover KEEPS HOLDING. That is the entire point: it is how one person gets
   * to feel §6.4's "opposite-end grips naturally stabilise long objects", and it exercises
   * the seam honestly, because two independent movers really are both applying force to one
   * body with neither owning it (§14.2, §22.4). */
  const movers = [];
  for (let i = 0; i < MOVERS.count; i++) {
    const off = MOVERS.spawnOffsets[i] || { x: 0, z: 0 };
    const id = `p${i}`;
    const controller = new PlayerController(physics, {
      x: world.spawn.x + off.x, y: world.spawn.y, z: world.spawn.z + off.z,
    });
    const bodyMesh = makeBlockout(MOVERS.colours[i]);
    world.scene.add(bodyMesh.group);
    // Each mover has its OWN grip system. attachTo wires the forced-release hook, so being
    // knocked down drops what that mover was holding — and only what THAT mover was holding.
    const gripSys = new GripSystem(physics, registry, rig, camera, bus, controller).attachTo(controller);
    movers.push({ id, controller, grips: gripSys, body: bodyMesh, yaw: 0 });
    if (!game.state.players[id]) {
      game.state.players[id] = {
        id, position: { x: 0, y: 0, z: 0 }, yaw: 0,
        locomotion: 'grounded', grips: { left: null, right: null }, exertion: 0,
      };
    }
  }
  let activeMover = 0;
  const active = () => movers[activeMover];
  game.state.localPlayerId = movers[0].id;

  // New colliders are invisible to raycasts until the next step (MEASURED — world.js), and
  // the very first grab probe happens before any step has run.
  physics.primeQueries();

  // ---- systems, in §22.3 order ----------------------------------------------------------
  game.addSystem('look', (state, stepMs, ctx) => {
    rig.applyLook(ctx.input.consumeLook());
  });

  /* CLEAR FORCES ONCE, before anybody applies one.
   *
   * Rapier forces persist and compound until reset (see PhysicsWorld.clearForces for the
   * measurements). This used to live inside GripSystem.step, which was fine with one mover
   * and silently wrong with two: the second mover's grip system would wipe the first's
   * force every step, so only the last one to run would ever be felt. That is §6.4's "two
   * clients" failure in its most plausible-looking form — it would have read as "my partner
   * isn't helping" rather than as a bug. */
  game.addSystem('clearForces', () => { physics.clearForces(); });

  game.addSystem('movers', (state, stepMs, ctx) => {
    const inp = ctx.input;

    // Tab swaps which mover you drive. Read as an edge so holding it does not strobe.
    if (inp.wasPressed('swapMover') && movers.length > 1) {
      activeMover = (activeMover + 1) % movers.length;
      state.localPlayerId = active().id;
      // The camera keeps its yaw and simply re-targets, so swapping does not spin the view.
      ctx.bus.emit(EVENTS.INPUT_CONTEXT, { context: 'mover:' + active().id }, ctx.simTimeMs);
    }

    for (let i = 0; i < movers.length; i++) {
      const m = movers[i];
      const p = state.players[m.id];
      const isActive = i === activeMover;

      /* THE INACTIVE MOVER STILL SIMULATES, and still holds. §6.4: "when one player
       * releases, forces update immediately; no canned synchronized carry animation takes
       * ownership." An idle mover is one whose INPUT is zero, not one that is switched off
       * — its grips keep pulling, which is exactly what makes it a second pair of hands. */
      const intent = isActive
        ? {
            move: inp.moveAxis(),
            forward: rig.forwardFlat(),
            right: rig.rightFlat(),
            // §4.2: Shift is sprint when free, brace when gripping.
            run: inp.isDown('brace') && !hasAnyGrip(p),
            brace: inp.isDown('brace') && hasAnyGrip(p),
            jump: inp.wasPressed('jump'),
            recover: inp.wasPressed('recover'),
          }
        : {
            move: { x: 0, y: 0 },
            forward: { x: 0, y: 0, z: -1 }, right: { x: 1, y: 0, z: 0 },
            // An unattended mover braces automatically. Without it, leaving one holding an
            // end of the couch means it quietly loses its balance and drops it while you
            // are looking the other way, which reads as the game cheating.
            run: false, brace: true, jump: false, recover: false,
          };

      // --- grips first: forces are accumulated now and consumed by world.step() below ---
      if (isActive) {
        // Only the driven mover's hands follow the camera. The others keep the aim frame
        // they last held, so turning the view does not drag their arms around with it.
        m.grips.syncAim();
        for (const hand of HANDS) {
          const action = hand === 'left' ? 'gripLeft' : 'gripRight';
          const want = inp.isDown(action);
          const have = !!m.grips.grips[hand];
          if (want && !have) m.grips.tryGrab(hand, m.id, ctx.simTimeMs);
          else if (!want && have) m.grips.release(hand, 'released', ctx.simTimeMs);
        }
      }
      m.grips.step(stepMs, { brace: intent.brace, simTimeMs: ctx.simTimeMs });

      const before = m.controller.recoveries;
      p.locomotion = m.controller.step(stepMs, intent);

      const pos = m.controller.position;
      p.position.x = pos.x; p.position.y = pos.y; p.position.z = pos.z;
      const travel = m.controller.travelYaw();
      if (travel !== null) { p.yaw = travel; m.yaw = travel; }
      p.exertion = m.controller.exertion;
      p.grips.left = m.grips.grips.left ? m.grips.grips.left.entityId : null;
      p.grips.right = m.grips.grips.right ? m.grips.grips.right.entityId : null;

      if (m.controller.recoveries > before) {
        ctx.bus.emit(EVENTS.RECOVERY, {
          entityId: m.id, reason: m.controller.lastRecoveryReason, fee: 0,
          newTransform: { ...m.controller.lastStable },
        }, ctx.simTimeMs);
      }
    }

    // Clearance depends on EVERY mover — a box put down beside one may be inside the other.
    restoreClearedObjects(registry, movers.map((m) => m.controller));
  });

  // Straps accumulate force, so they run BEFORE the step and after clearForces, exactly as
  // grips do (§10.3). A strap applied after the step would be a step behind the load.
  game.addSystem('straps', (state, stepMs, ctx) => { straps.step(stepMs, ctx.simTimeMs); });

  /* 'drive' BELONGS HERE, before 'physics', and it was registered after it to begin with.
   *
   * The route applies §11.3's road forces to cargo, and Rapier consumes accumulated forces
   * during world.step(). Registered after 'physics', every road force was applied to bodies
   * that had already been integrated and was then wiped by the next step's clearForces
   * before it could do anything. MEASURED: a completely unstrapped pack driven through the
   * whole route shifted 0.001 m. The route ran, the events fired, the forces were computed
   * and applied to the right bodies — and nothing in the world ever felt one of them.
   *
   * Same class of bug as the Phase 3 force-persistence one, and the same shape: the physics
   * was correct and the ORDER made it invisible. Anything that applies force goes before the
   * step; anything that measures the result goes after. */
  game.addSystem('drive', (state, stepMs, ctx) => { route.step(stepMs, ctx.simTimeMs); });

  game.addSystem('physics', () => { physics.step(); });

  // After the step, because it reads post-step velocities to decide "settled" (§12.3).
  game.addSystem('objects', (state, stepMs) => { registry.step(stepMs); });

  // §10.2's "settling inside the closed volume" reads the flag registry.step just set.
  game.addSystem('cargo', (state, stepMs, ctx) => { cargo.step(stepMs, ctx.simTimeMs); });

  /* Damage reads the velocities the solver produced, so it runs AFTER 'physics'. 'drive' is
   * registered further up, next to 'straps', for the opposite reason — see the note there. */
  game.addSystem('damage', (state, stepMs, ctx) => { damage.step(stepMs, ctx.simTimeMs); });

  /* §12.3 delivery bookkeeping. Runs after 'objects' because it consumes the settled flag
   * that step computes, and it only ever writes manifest rows — it observes entities and
   * never moves one (§22.2's observe-don't-own boundary). */
  game.addSystem('contract', (state, stepMs) => {
    stepManifest(state.manifest, registry, stepMs);
  });

  game.setPhase(PHASES.PICKUP);

  const overlay = new DebugOverlay(ui, game);
  const hud = new Hud(ui);

  const stamp = document.createElement('div');
  stamp.id = 'build-stamp';
  stamp.textContent = `Movers From Hell — ${BUILD.label} · ${BUILD.date} · F3 for stats`;
  ui.appendChild(stamp);

  const help = document.createElement('div');
  help.id = 'help';
  help.innerHTML = '<b>Click to look around.</b> &nbsp; WASD move · Shift sprint/brace · ' +
                   'Space jump/mantle · <b>LMB/RMB grab</b> · <b>Tab swap mover</b> · ' +
                   'R recover · Esc pause · F3 stats';
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
    const dt = Math.min(frameMs, 100) / 1000;
    // Every mover is drawn, not just the one being driven.
    for (const m of movers) {
      const mp = game.state.players[m.id];
      m.body.update(mp.position, mp.yaw, m.controller.horizontalSpeed, dt);
    }
    const p = game.state.players[game.state.localPlayerId];
    rig.update(p.position, dt);   // the rig follows whoever you are driving
    registry.syncMeshes();
    tools.syncMeshes();
    hud.update(active().grips.status());

    renderer.render(world.scene, camera);
    overlay.update(frameMs, {
      bodies: physics.stats.bodies,
      constraints: physics.stats.constraints,
      contacts: physics.stats.contacts,
      // §5.1/§5.2 made visible: what you are holding, how close to falling over, how tired.
      // Both movers, so you can see what the one you are NOT driving is doing (§6.4).
      carry: movers.map((m, i) =>
        `${i === activeMover ? '>' : ' '}${m.id} ${m.controller.carriedMass.toFixed(0)}kg ` +
        `x${m.controller.loadSpeedMult.toFixed(2)} bal ${m.controller.imbalance.toFixed(2)}`
      ).join('  ·  '),
    });

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  /* Test seam. tools\m*-tests.js drive the game through this instead of waiting for real
   * frames, because headless Chrome in --dump-dom mode delivers only 1-3 rAF callbacks in
   * total (MEASURED — Dev\INDEX.md → Tooling & testing). */
  /* Test seam. `player` and `grips` are GETTERS, not snapshots: they follow whichever mover
   * is being driven, so a suite that swaps movers does not silently keep poking mover 0. */
  const api = {
    game, input, rig, world, overlay, hud, renderer, camera, syncSize,
    physics, registry, movers, tools, straps, cargo,
    truckPose: TRUCK_POSE, cargoInterior: cargoInterior(), cargoAnchors: cargoAnchors(),
    destZones: DEST_ZONES, destShell: DEST_SHELL, insideDestination,
    damage, route,
    get player() { return active().controller; },
    get grips() { return active().grips; },
    get activeMoverIndex() { return activeMover; },
    swapMover() {
      activeMover = (activeMover + 1) % movers.length;
      game.state.localPlayerId = active().id;
      return active();
    },
    moversOn,
    THREE, CONTEXTS, PHASES, LOCOMOTION,
  };
  window.__MFH = api;
  return api;
}

/** §4.2's Shift is sprint-when-free and brace-when-gripping. Grips arrive in Phase 2; this
 *  is the one place that decides which meaning applies. */
function hasAnyGrip(p) {
  return !!(p.grips && (p.grips.left || p.grips.right));
}
