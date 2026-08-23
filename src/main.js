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
import { buildInvoice, reconcile, reviewFor, contributionStats } from './contract/invoice.js';
import { manifestSummary } from './contract/manifest.js';
import { RouteDriver } from './drive/route.js';
import { PHASE6_TOOL_SPAWNS, validateAllToolDefs } from './tools/definitions.js';
import { GripSystem, HANDS, restoreClearedObjects, moversOn } from './player/grip.js';
import { Hud } from './ui/hud.js';
import { InvoiceScreen } from './ui/invoiceScreen.js';
import { InteractionSystem } from './player/interact.js';
import { StrapLines } from './render/strapLines.js';
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

  /** Messages the HUD should show, queued from SYSTEMS (which run on the fixed step) and
   *  drained on the render frame. A system must never touch the DOM (§22.2), and a notice
   *  raised between two frames must not be lost, so it goes through a queue. */
  const pendingNotices = [];
  let strapsPlacedTotal = 0;

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
  /** Manifest row index -> entity id. Kept OUTSIDE game.state because a reset replaces the
   *  state wholesale, and a replay has to re-attach the manifest to the same bodies. */
  const contractEntityIds = [];
  PHASE5_SPAWNS.forEach((s, i) => {
    const e = registry.spawn(s.def, s);
    game.state.manifest[i].entityId = e.id;
    contractEntityIds[i] = e.id;
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

  /* ---- the playable layer (Phase 11) -----------------------------------------------------
   * Everything above was reachable only by calling its API. §9.2 asks for one common
   * interaction verb, and this is the thing that reads it: what E means comes from what is
   * under the reticle, and §4.4 requires the HUD to say which meaning applies BEFORE the key
   * is pressed. See interact.js. */
  const interact = new InteractionSystem({
    physics, registry, tools, straps, cargo, route, rig, camera, bus,
  });

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

        /* §9.2's ONE COMMON VERB, read as an edge so holding it does not repeat.
         *
         * Both are deliberately no-ops when there is nothing sensible to do — the prompt
         * under the reticle has already said so, and §2.1 forbids telling a player "no"
         * after they have committed to a press. */
        if (inp.wasPressed('interact')) {
          const msg = interact.act(m, ctx.simTimeMs);
          if (msg) pendingNotices.push({ text: msg, kind: 'info' });
        }
        if (inp.wasPressed('context')) {
          const msg = interact.secondary(m);
          if (msg) pendingNotices.push({ text: msg, kind: 'info' });
        }

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

    // Carried tools travel with their mover. Kinematic, so before the step (see interact.js).
    interact.step(movers, stepMs);
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

  /* §3.4's contract phase machine, driven by what actually happens rather than by a menu.
   *
   * PICKUP  -> TRANSIT     the player presses E at the cab (interact.js `_useCab`)
   * TRANSIT -> DELIVERY    the route reaches its end
   * DELIVERY-> SETTLEMENT  the player presses E at the cab again
   *
   * §3.4's Secure exit is "warnings ACKNOWLEDGED", not resolved, so nothing here blocks a
   * departure — `canDepart()` advises and the prompt carries the warning. Refusing would
   * delete Phase 8's gate, which requires that a badly packed truck can be driven. */
  game.addSystem('phase', (state) => {
    if (state.phase === PHASES.TRANSIT && route.state === 'arrived') {
      game.setPhase(PHASES.DELIVERY);
      pendingNotices.push({ text: 'arrived — unload through the back', kind: 'good' });
    }
  });

  game.setPhase(PHASES.PICKUP);

  const overlay = new DebugOverlay(ui, game);
  const hud = new Hud(ui);
  const invoiceScreen = new InvoiceScreen(ui);
  const strapLines = new StrapLines(world.scene, straps, registry);

  const stamp = document.createElement('div');
  stamp.id = 'build-stamp';
  stamp.textContent = `Movers From Hell — ${BUILD.label} · ${BUILD.date} · F3 for stats`;
  ui.appendChild(stamp);

  const help = document.createElement('div');
  help.id = 'help';
  help.innerHTML = '<b>Click to look around.</b> &nbsp; WASD · Shift sprint/brace · ' +
                   'Space jump · <b>LMB/RMB grab</b> · <b>E use</b> · <b>Q undo</b> · ' +
                   'Tab swap mover · R recover · Esc pause · F3';
  ui.appendChild(help);

  /* ---- events the player should SEE (§8.4, §10.3) ---------------------------------------
   * §8.4: "At impact: material sound, visual mark, optional haptic pulse, and ONE SMALL COST
   * NOTICE." The cost notice is the only one of those four this build can do, so it does it.
   * Subscribed here rather than polled, so a notice can never be missed between frames. */
  bus.on(EVENTS.DAMAGE_APPLIED, (e) => {
    const name = String(e.defId || '').replace(/_\d+$/, '').replace(/_/g, ' ');
    pendingNotices.push({
      text: `${name} — ${e.band} · ${e.cost.toFixed(2)}`,
      kind: 'damage',
    });
  });
  bus.on(EVENTS.STRAP_CHANGED, (e) => {
    // Only the states worth interrupting for. A strap going tensioned is not news.
    if (e.state === 'failed') pendingNotices.push({ text: 'a strap gave way', kind: 'damage' });
    else if (e.state === 'overstressed') pendingNotices.push({ text: 'strap overstressed', kind: 'warn' });
  });
  bus.on(EVENTS.ROAD_FORCE, (e) => {
    pendingNotices.push({ text: e.label, kind: 'warn' });
  });
  bus.on(EVENTS.STRAP_CHANGED, (e) => { if (e.state === 'slack' && e.strapId) strapsPlacedTotal++; });
  bus.on(EVENTS.RECOVERY, () => {
    pendingNotices.push({ text: 'recovery callout — a fee at settlement', kind: 'warn' });
  });

  /* SETTLEMENT. §15.2: the grade "never hides" the invoice, and "negative profit still
   * completes the job", so this screen is the same screen either way. */
  function settle() {
    damage.flush();
    const summary = manifestSummary(game.state.manifest);
    const opts = {
      recoveries: recoveryCount(),
      collisions: 0,
      moverCount: movers.length,
    };
    const invoice = buildInvoice(game.state, summary, opts);
    const review = reviewFor(invoice, game.state, summary, opts);
    const stats = contributionStats(game.state, {
      strapsPlaced: strapsPlacedTotal,
      recoveries: opts.recoveries,
      heaviestMoved: heaviestMoved(),
    });
    game.setPhase(PHASES.SETTLEMENT);
    invoiceScreen.show(invoice, review, summary, stats);
    game.setPaused(true);
    input.releasePointerLock && input.releasePointerLock();
  }
  bus.on(EVENTS.CONTRACT_PHASE, (e) => { if (e.to === 'settlement') settle(); });

  /**
   * §26.6: "reset removes transient straps, grips, damage records, fragments and route
   * state." Everything transient, and nothing else.
   *
   * TWO THINGS game.reset() DOES THAT HAVE TO BE UNDONE HERE. It replaces `state` wholesale
   * with a fresh createInitialState(), which is right for the clock, the seed and the ledger
   * — and which also throws away the manifest (rebuilt below, with the same entities) and
   * every player record except p0 (mover p1 would then have no state row, and the movers
   * system would crash on the first frame). Both are consequences of the state being plain
   * serializable data with no back-references, which is the property §22.4 wants; the price
   * is that whatever was attached to it has to be re-attached.
   */
  function resetContract() {
    straps.releaseAll();
    damage.reset();
    route.reset();
    for (const m of movers) m.grips.releaseAll('contract reset');
    for (const s of interact.state.values()) { s.carriedTool = null; s.pendingAnchor = null; }
    strapsPlacedTotal = 0;

    game.reset();

    // Re-attach what the fresh state does not know about.
    game.state.manifest = buildManifest(PHASE5_SPAWNS);
    contractEntityIds.forEach((id, i) => { game.state.manifest[i].entityId = id; });
    for (const m of movers) {
      if (!game.state.players[m.id]) {
        game.state.players[m.id] = {
          id: m.id, position: { x: 0, y: 0, z: 0 }, yaw: 0,
          locomotion: 'grounded', grips: { left: null, right: null }, exertion: 0,
        };
      }
    }
    game.state.localPlayerId = active().id;

    respawnContract();
    for (const [i, m] of movers.entries()) {
      const off = MOVERS.spawnOffsets[i] || { x: 0, z: 0 };
      m.controller.hardSetPosition({
        x: world.spawn.x + off.x, y: world.spawn.y + 0.1, z: world.spawn.z + off.z,
      });
    }
    for (const t of tools.tools.values()) {
      t.state.deployed = false;
      t.state.attachedTo = null;
      t.state.carriedBy = null;
    }
    PHASE6_TOOL_SPAWNS.forEach((s, i) => {
      const t = [...tools.tools.values()][i];
      if (!t) return;
      t.body.setBodyType(physics.R.RigidBodyType.Dynamic, true);
      t.body.setTranslation({ x: s.x, y: s.y, z: s.z }, true);
      t.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      t.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      t.body.wakeUp();
    });
    physics.primeQueries();
    game.setPhase(PHASES.PICKUP);
  }

  invoiceScreen.onReplay = () => {
    invoiceScreen.hide();
    resetContract();
    game.setPaused(false);
    hud.notice('new contract', 'good');
  };

  function recoveryCount() {
    let n = 0;
    for (const e of registry.entities.values()) n += e.state.recoveries || 0;
    for (const m of movers) n += m.controller.recoveries || 0;
    return n;
  }
  function heaviestMoved() {
    let m = 0;
    for (const e of registry.entities.values()) {
      if ((e.state.recoveries || 0) > 0 || e.state.loaded || e.state.everHeld) {
        m = Math.max(m, e.def.mass);
      }
    }
    return m;
  }
  /** Put the contract's objects back where they started, for a replay. */
  function respawnContract() {
    PHASE5_SPAWNS.forEach((s, i) => {
      const row = game.state.manifest[i];
      const e = row && registry.get(row.entityId);
      if (!e) return;
      e.body.setTranslation({ x: s.x, y: s.y, z: s.z }, true);
      const yaw = s.yaw || 0;
      e.body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
      e.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      e.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      e.state.condition = 100;
      e.state.recoveries = 0;
      e.state.loaded = false;
      e.state.cargoDwellMs = 0;
      e.state.removedParts = [];
      e.body.wakeUp();
    });
    physics.primeQueries();
  }

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
    strapLines.update(dt);
    hud.update(active().grips.status());

    /* ---- the HUD's feed. Presentation only: it READS state and never writes it (§22.2). */
    const me = active();
    const described = interact.describe(me);
    hud.setPrompt(described);

    // §9.2's "readable preview and valid/invalid affordance" while a strap is half-placed.
    const istate = interact._for(me.id);
    if (istate.pendingAnchor) {
      const anchor = interact.anchors.find((a) => a.id === istate.pendingAnchor);
      const t = described.target;
      strapLines.showGuide(anchor, t && t.point, t && t.kind === 'object');
    } else {
      strapLines.hideGuide();
    }

    const summary = manifestSummary(game.state.manifest);
    hud.setContract({
      phase: game.state.phase,
      delivered: summary.delivered,
      total: summary.total,
      loaded: cargo.loadedEntities().length,
      roomCorrect: summary.roomCorrect,
      elapsedMin: game.state.elapsedWorkMs / 60000,
      estimateMin: game.state.estimateMs / 60000,
    });
    hud.setCargo(cargo.packQuality());
    hud.setRoute(route.status());

    while (pendingNotices.length) {
      const n = pendingNotices.shift();
      hud.notice(n.text, n.kind);
    }
    hud.tickNotices();

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
    damage, route, interact, strapLines, invoiceScreen, settle,
    buildInvoice, reconcile, reviewFor, contributionStats, manifestSummary, stepManifest,
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
