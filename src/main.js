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
import { layoutFor, applyAspect, renderSeats, SplitDivider } from './render/coopView.js';
import { BUILD, MOVERS, COOP, RENDER } from './config.js';

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

  /* ---- movers (Phase 4) -----------------------------------------------------------------
   * §25.2's Phase 4 is the cooperative seam, gated on "multiple grips combine predictably".
   * There are now N real movers, each with their own capsule, hands, grips AND CAMERA RIG.
   *
   * ONE RIG PER MOVER, added in Phase 12, and it is not a rendering decision — it is an AIM
   * decision. `GripSystem.aim()` derives its ray from `rig.yaw`/`rig.pitch` (§4.1 defines aim
   * assistance in camera space), so two movers sharing one rig aim in the same direction and
   * reach for the same thing. Every validated Phase 2/6/11 behaviour depends on that ray, so
   * the rig became per-mover rather than the aim becoming body-relative.
   *
   * Solo is unchanged by this: one seat drives one mover at a time and Tab swaps, and the
   * swap COPIES yaw and pitch to the arriving rig so the view still does not spin (see the
   * movers system).
   *
   * The undriven mover KEEPS HOLDING. That is the entire point: it is how one person gets
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
    // Mover 0 reuses the renderer's camera, so `syncSize`'s aspect handling still describes
    // the solo build exactly. Later movers get their own.
    const cam = i === 0
      ? camera
      : new THREE.PerspectiveCamera(RENDER.fov, 1, RENDER.near, RENDER.far);
    const moverRig = new ThirdPersonCamera(cam, world.colliders);
    // Each mover has its OWN grip system. attachTo wires the forced-release hook, so being
    // knocked down drops what that mover was holding — and only what THAT mover was holding.
    const gripSys = new GripSystem(physics, registry, moverRig, cam, bus, controller).attachTo(controller);
    movers.push({ id, controller, grips: gripSys, body: bodyMesh, yaw: 0, rig: moverRig, camera: cam });
    if (!game.state.players[id]) {
      game.state.players[id] = {
        id, position: { x: 0, y: 0, z: 0 }, yaw: 0,
        locomotion: 'grounded', grips: { left: null, right: null }, exertion: 0,
      };
    }
  }
  /* ---- seats (Phase 12) -------------------------------------------------------------------
   * A SEAT is a person: an input, a viewport, a camera and a HUD. A MOVER is a body in the
   * world. They are deliberately not the same thing, and keeping them separate is what lets
   * the validated solo build survive co-op:
   *
   *   solo   1 seat, pointing at whichever mover Tab last chose
   *   co-op  2 seats, pinned one-to-one, and Tab does nothing
   *
   * §13.4 excludes split-screen from the prototype; this is a recorded departure, see COOP in
   * config.js and Phase 12 in the changelog. */
  let activeMover = 0;
  let seatCount = 1;
  const active = () => movers[activeMover];
  game.state.localPlayerId = movers[0].id;

  const seatInputs = [];
  for (let s = 0; s < COOP.maxSeats; s++) seatInputs.push(input.seat(s));

  /** Which seat drives mover `i`, or -1 for nobody. */
  const seatOfMover = (i) => (seatCount > 1 ? (i < seatCount ? i : -1) : (i === activeMover ? 0 : -1));
  /** Which mover seat `s` drives. */
  const moverOfSeat = (s) => (seatCount > 1 ? movers[s] : active());

  /**
   * Join or drop the second player.
   *
   * §4.1's boom is shortened for a half-width viewport: the same 4 m through half the
   * horizontal field frames much less of the room, and the working area is what matters.
   */
  function setSeats(n) {
    const want = Math.max(1, Math.min(n | 0, Math.min(COOP.maxSeats, movers.length)));
    if (want === seatCount) return seatCount;
    seatCount = want;
    input.setSeatCount(seatCount);
    document.body.classList.toggle('coop', seatCount > 1);
    for (const m of movers) m.rig.setDistance(seatCount > 1 ? COOP.cameraDistance : RENDER.camera.distance);
    /* Seat 0 always drives mover 0 in co-op. If the solo player had Tab'd onto mover 1, the
     * joining player would otherwise be handed the mover already carrying something — and
     * the two halves would both show the same body until somebody moved. */
    if (seatCount > 1) activeMover = 0;
    game.state.localPlayerId = movers[activeMover].id;
    /* Visibility is a consequence of SEATING, not of rendering. It lived in the render loop
     * first, which meant a seat existed for one frame before its HUD appeared and — worse —
     * that `setSeats` was only half-done until something drew. */
    for (let s = 0; s < huds.length; s++) huds[s].el.hidden = s >= seatCount;
    // The control line describes the seating, so it belongs to setSeats and not to the key
    // handler — otherwise seating a player through the API leaves the screen telling the
    // truth about a build that no longer exists.
    refreshHelp();
    return seatCount;
  }

  // New colliders are invisible to raycasts until the next step (MEASURED — world.js), and
  // the very first grab probe happens before any step has run.
  physics.primeQueries();

  /* ---- the playable layer (Phase 11) -----------------------------------------------------
   * Everything above was reachable only by calling its API. §9.2 asks for one common
   * interaction verb, and this is the thing that reads it: what E means comes from what is
   * under the reticle, and §4.4 requires the HUD to say which meaning applies BEFORE the key
   * is pressed. See interact.js.
   *
   * Constructed AFTER the movers, because it needs one to hand out as the default rig. It
   * never actually probes through that rig — `probe(mover)` takes its ray from
   * `mover.grips.aim()`, which is why co-op needed no change here at all. */
  const interact = new InteractionSystem({
    physics, registry, tools, straps, cargo, route,
    rig: movers[0].rig, camera: movers[0].camera, bus,
  });

  // ---- systems, in §22.3 order ----------------------------------------------------------
  game.addSystem('look', (state, stepMs, ctx) => {
    // Each seat steers its OWN rig. consumeLook is per seat and consuming, so seat 1's right
    // stick cannot turn seat 0's camera and neither can read the other's half of a frame.
    for (let s = 0; s < seatCount; s++) {
      const m = moverOfSeat(s);
      if (m) m.rig.applyLook(ctx.input.consumeLook(s));
    }
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

    /* Tab swaps which mover you drive — a SOLO affordance only. With two people seated, the
     * movers are already both being driven and a swap would take one out from under the
     * other player mid-carry, which §6.4 spends a page arguing against. Seat 1 has no
     * swapMover binding either, so this is belt and braces. */
    if (seatCount === 1 && inp.wasPressed('swapMover', 0) && movers.length > 1) {
      const from = active().rig;
      activeMover = (activeMover + 1) % movers.length;
      const to = active().rig;
      /* CARRY THE VIEW ACROSS. Before Phase 12 there was one rig, so a swap re-targeted it
       * and the view held still by construction. With a rig each, arriving at the other
       * mover's rig means arriving at wherever they were last looking — a spin the player
       * did not ask for. Copying yaw and pitch reproduces the old behaviour exactly. */
      to.yaw = from.yaw; to.pitch = from.pitch;
      state.localPlayerId = active().id;
      ctx.bus.emit(EVENTS.INPUT_CONTEXT, { context: 'mover:' + active().id }, ctx.simTimeMs);
    }

    for (let i = 0; i < movers.length; i++) {
      const m = movers[i];
      const p = state.players[m.id];
      const seat = seatOfMover(i);
      const isActive = seat >= 0;
      const si = isActive ? seatInputs[seat] : null;

      /* THE INACTIVE MOVER STILL SIMULATES, and still holds. §6.4: "when one player
       * releases, forces update immediately; no canned synchronized carry animation takes
       * ownership." An idle mover is one whose INPUT is zero, not one that is switched off
       * — its grips keep pulling, which is exactly what makes it a second pair of hands. */
      const intent = isActive
        ? {
            move: si.moveAxis(),
            forward: m.rig.forwardFlat(),
            right: m.rig.rightFlat(),
            // §4.2: Shift is sprint when free, brace when gripping.
            run: si.isDown('brace') && !hasAnyGrip(p),
            brace: si.isDown('brace') && hasAnyGrip(p),
            jump: si.wasPressed('jump'),
            recover: si.wasPressed('recover'),
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
        if (si.wasPressed('interact')) {
          const msg = interact.act(m, ctx.simTimeMs);
          // Addressed to the seat that pressed the key. A notice about what YOUR hands just
          // did, shown on the other player's half, is worse than no notice at all.
          if (msg) pendingNotices.push({ text: msg, kind: 'info', seat });
        }
        if (si.wasPressed('context')) {
          const msg = interact.secondary(m);
          if (msg) pendingNotices.push({ text: msg, kind: 'info', seat });
        }

        for (const hand of HANDS) {
          const action = hand === 'left' ? 'gripLeft' : 'gripRight';
          const want = si.isDown(action);
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
  /* One HUD per SEAT, built up front rather than on join: creating DOM at the moment a
   * player presses F2 means the first co-op frame is the one that also does a layout, and
   * §26.6's frame budget is not the place to discover that. Seat 1's is simply empty and
   * unpositioned until it is used. */
  const huds = [];
  for (let s = 0; s < COOP.maxSeats; s++) {
    const h = new Hud(ui, s);
    /* HIDDEN AT BIRTH, not at the first frame. The empty panels collapse on their own
     * (`:empty { display: none }`), but the RETICLE does not — it is three divs that are
     * always drawn — so an unhidden seat-1 HUD puts a second crosshair in the middle of a
     * solo player's screen until the render loop gets round to hiding it. */
    h.el.hidden = s > 0;
    huds.push(h);
  }
  const hud = huds[0];                       // the solo alias, kept honest: the same object
  const divider = new SplitDivider(ui);
  const invoiceScreen = new InvoiceScreen(ui);
  const strapLines = new StrapLines(world.scene, straps, registry);

  const stamp = document.createElement('div');
  stamp.id = 'build-stamp';
  stamp.textContent = `Movers From Hell — ${BUILD.label} · ${BUILD.date} · F3 for stats`;
  ui.appendChild(stamp);

  const help = document.createElement('div');
  help.id = 'help';
  ui.appendChild(help);
  function refreshHelp() {
    help.innerHTML = seatCount > 1
      ? '<b>P1</b> WASD + mouse · LMB/RMB grab · E use · Q undo &nbsp;|&nbsp; ' +
        '<b>P2</b> arrows + UHJK look · [ ] grab · \' use · ; undo &nbsp;|&nbsp; ' +
        '<b>F2</b> one player · Esc pause · F3'
      : '<b>Click to look around.</b> &nbsp; WASD · Shift sprint/brace · ' +
        'Space jump · <b>LMB/RMB grab</b> · <b>E use</b> · <b>Q undo</b> · ' +
        'Tab swap mover · R recover · <b>F2 two players</b> · Esc pause · F3';
  }
  refreshHelp();

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
    /* §6.4's second pair of hands, on a key rather than on a controller connecting.
     * A pad being plugged in must NOT split a solo player's screen — that is a regression to
     * the validated single-player build arriving as a surprise, and the player who plugged it
     * in may only have wanted a controller. Joining is deliberate; leaving is the same key. */
    if (e.code === COOP.joinKey) {
      e.preventDefault();
      const n = setSeats(seatCount > 1 ? 1 : 2);
      hud.notice(n > 1 ? 'two players — P2 on the arrow keys or a pad' : 'one player', 'good');
    }
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
    registry.syncMeshes();
    tools.syncMeshes();
    strapLines.update(dt);

    /* ---- per-seat presentation. READS state and never writes it (§22.2). ---------------- */
    const rects = layoutFor(seatCount, canvas.clientWidth || 0, canvas.clientHeight || 0);
    const summary = manifestSummary(game.state.manifest);
    const packQuality = cargo.packQuality();
    const routeStatus = route.status();
    const contractPanel = {
      phase: game.state.phase,
      delivered: summary.delivered,
      total: summary.total,
      loaded: cargo.loadedEntities().length,
      roomCorrect: summary.roomCorrect,
      elapsedMin: game.state.elapsedWorkMs / 60000,
      estimateMin: game.state.estimateMs / 60000,
    };

    for (let s = 0; s < seatCount; s++) {
      const me = moverOfSeat(s);
      const h = huds[s];
      const rect = rects[s];

      me.rig.update(game.state.players[me.id].position, dt);
      applyAspect(me.camera, rect);

      if (seatCount > 1) h.setRect(rect); else h.clearRect();
      h.setSeatTag(seatCount > 1 ? `P${s + 1} · ${me.id}` : '');

      h.update(me.grips.status());
      const described = interact.describe(me);
      h.setPrompt(described);

      // §9.2's "readable preview and valid/invalid affordance" while a strap is half-placed.
      const istate = interact._for(me.id);
      if (istate.pendingAnchor) {
        const anchor = interact.anchors.find((a) => a.id === istate.pendingAnchor);
        const t = described.target;
        strapLines.showGuide(anchor, t && t.point, t && t.kind === 'object', s);
      } else {
        strapLines.hideGuide(s);
      }

      /* The contract, the cargo and the route are ONE CONTRACT'S facts, so both halves show
       * the same numbers. §11.2's "coarse cargo-status indicator" is a property of the truck,
       * not of the player looking at it — giving each seat a private version would invent a
       * disagreement the simulation does not have. */
      h.setContract(contractPanel);
      h.setCargo(packQuality);
      h.setRoute(routeStatus);
    }
    divider.update(rects);

    while (pendingNotices.length) {
      const n = pendingNotices.shift();
      // A notice with no seat belongs to the contract, not to a person, so everyone sees it.
      if (n.seat === undefined || n.seat === null) {
        for (let s = 0; s < seatCount; s++) huds[s].notice(n.text, n.kind);
      } else if (n.seat < seatCount) {
        huds[n.seat].notice(n.text, n.kind);
      }
    }
    for (let s = 0; s < seatCount; s++) huds[s].tickNotices();

    renderSeats(renderer, world.scene,
                Array.from({ length: seatCount }, (_, s) => moverOfSeat(s)), rects);
    overlay.update(frameMs, {
      bodies: physics.stats.bodies,
      constraints: physics.stats.constraints,
      contacts: physics.stats.contacts,
      // §5.1/§5.2 made visible: what you are holding, how close to falling over, how tired.
      // Both movers, so you can see what the one you are NOT driving is doing (§6.4).
      carry: movers.map((m, i) => {
        const s = seatOfMover(i);
        return `${s >= 0 ? (seatCount > 1 ? 'P' + (s + 1) : '>') : ' '}${m.id} ` +
          `${m.controller.carriedMass.toFixed(0)}kg ` +
          `x${m.controller.loadSpeedMult.toFixed(2)} bal ${m.controller.imbalance.toFixed(2)}`;
      }).join('  ·  '),
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
    game, input, world, overlay, hud, huds, renderer, syncSize,
    physics, registry, movers, tools, straps, cargo,
    /* Seat controls, so a suite can seat a second player without a keyboard. */
    setSeats, layoutFor, divider,
    get seatCount() { return seatCount; },
    seatInput: (s) => seatInputs[s],
    moverOfSeat, seatOfMover,
    truckPose: TRUCK_POSE, cargoInterior: cargoInterior(), cargoAnchors: cargoAnchors(),
    destZones: DEST_ZONES, destShell: DEST_SHELL, insideDestination,
    damage, route, interact, strapLines, invoiceScreen, settle,
    buildInvoice, reconcile, reviewFor, contributionStats, manifestSummary, stepManifest,
    get player() { return active().controller; },
    get grips() { return active().grips; },
    /* The rig and the camera became PER MOVER in Phase 12, so these follow the driven mover
     * for the same reason `player` and `grips` do — a suite that swaps movers must not
     * silently keep steering mover 0's camera while poking mover 1's hands. */
    get rig() { return active().rig; },
    get camera() { return active().camera; },
    get activeMoverIndex() { return activeMover; },
    swapMover() {
      const from = active().rig;
      activeMover = (activeMover + 1) % movers.length;
      const to = active().rig;
      // Same reason as the keyboard path — see the movers system.
      to.yaw = from.yaw; to.pitch = from.pitch;
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
