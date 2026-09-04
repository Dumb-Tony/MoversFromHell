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
import { Input, CONTEXTS, DEFAULT_SETTINGS, glyphFor, padLabel } from './core/input.js';
import { EventBus, EVENTS, PHASES } from './core/eventBus.js';
import { createRenderer } from './render/renderer.js';
import { buildScene, RAMP } from './render/scene.js';
import { ThirdPersonCamera } from './render/camera.js';
import { makeBlockout } from './render/playerBody.js';
import { DebugOverlay } from './dev/debugOverlay.js';
import { initPhysics, PhysicsWorld, GROUP_PRESETS } from './physics/world.js';
import { PlayerController, LOCOMOTION } from './player/controller.js';
import { ObjectRegistry } from './objects/registry.js';
import { PHASE5_SPAWNS } from './objects/definitions.js';
import { buildManifest, stepManifest, validateManifest, overlappingSpawns } from './contract/manifest.js';
import { overlappingZones } from './world/house.js';
import { ToolSystem, reassemble } from './tools/tools.js';
import { StrapSystem } from './cargo/straps.js';
import { CargoSystem } from './cargo/cargo.js';
import { TRUCK_POSE, cargoInterior, cargoAnchors } from './world/truck.js';
import { DEST_ZONES, DEST_SHELL, insideDestination } from './world/destination.js';
import { DamageSystem } from './damage/damage.js';
import { buildInvoice, reconcile, reviewFor, contributionStats } from './contract/invoice.js';
import { manifestSummary } from './contract/manifest.js';
import { RouteDriver } from './drive/route.js';
import { PHASE6_TOOL_SPAWNS, validateAllToolDefs } from './tools/definitions.js';
import { GripSystem, HANDS, restoreClearedObjects, moversOn, localToWorld } from './player/grip.js';
import { Hud } from './ui/hud.js';
import { InvoiceScreen } from './ui/invoiceScreen.js';
import { TitleScreen } from './ui/titleScreen.js';
import { PauseScreen } from './ui/pauseScreen.js';
import { SettingsPanel } from './ui/settings.js';
import { load as loadSave, save as writeSave, SHELL_DEFAULTS } from './core/save.js';
import { InteractionSystem } from './player/interact.js';
import { StrapLines } from './render/strapLines.js';
import { layoutFor, applyAspect, renderSeats, SplitDivider } from './render/coopView.js';
import { detectRenderTier, shadowMapTypeFor } from './render/lighting.js';
import { styleFromLocation, applyStyle } from './render/styles.js';
/* Phase 15 — the Overcooked overhaul. The four modules below are the render side of it;
 * main.js owns only the tier decision, the post/blob construction and the one present(). */
import { setRenderTier } from './render/textures.js';
import { createPost, postModeFromLocation } from './render/post.js';
import { present } from './render/present.js';
import { ContactBlobs } from './render/contactBlobs.js';
import { updateRimCamera } from './render/materials.js';
import { BUILD, MOVERS, COOP, RENDER, PLAYER, SETTINGS, PROMPTS, CONTRACT } from './config.js';

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
  /* §21.2 "a retry keeps settings" / §26.6: the one device-local save, read ONCE here and
   * never thrown from (save.js). Its settings go to the Input's constructor, its shell values
   * to the CSS variable and the camera rigs below, its best invoice to the settlement sheet.
   * Nothing in it enters game.state. */
  const saved = loadSave();
  /* Quality tier before the scene, because it decides how many shadow maps get built. See
   * detectRenderTier — shadow passes are ~100x more expensive in software than lights are.
   * A saved tier forces it ('applies on reload' on the settings card); ?tier= still wins, so
   * the shot scripts and the harness are unaffected by whatever a player chose. */
  const renderTier = (saved.shell.tier !== 'auto' && !tierFromLocation())
    ? saved.shell.tier : detectRenderTier(renderer);
  /* The texture and material libraries read the tier too, and they must know it BEFORE the
   * scene is built: on the software tier they mint no height/spec canvases, no bump, no env,
   * no rim — the difference between a 4 s suite and a 600 s one (measured, Phase 13). */
  setRenderTier(renderTier);
  /* VSM on a GPU, PCFSoft on the software tier (?shadows=pcf forces PCF for an A/B). Shadow
   * maps are scheduled by present() ONCE per frame rather than once per seat. */
  renderer.shadowMap.type = shadowMapTypeFor(THREE, renderTier);
  renderer.shadowMap.autoUpdate = false;
  const world = buildScene(renderTier);


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
  // The saved feel settings arrive as the constructor patch (input.js validates them).
  const input = new Input(window, canvas, undefined, saved.settings).attach();
  const game = new Game({ contractId: 'suburban_starter', input, bus });
  /* The SHELL's settings — the ones no system reads: UI scale (the `--ts` variable every
   * font-size in styles.css multiplies by), the solo camera boom, the quality tier. Held
   * here, beside seatCount, and never in game.state. */
  const shell = { ...SHELL_DEFAULTS, ...saved.shell };
  document.documentElement.style.setProperty('--ts', String(shell.uiScale));

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
  // The clock getter is how a key-press transition gets a real timestamp (§27.4).
  const tools = new ToolSystem(physics, registry, world.scene, bus, () => game.clock.simTimeMs);
  for (const s of PHASE6_TOOL_SPAWNS) tools.spawn(s.def, s);
  physics.primeQueries();

  /* ---- cargo (Phase 7) -------------------------------------------------------------------
   * §10.1: the cargo box is a real collision-enabled space, built in scene.js from
   * truck.js's records. Nothing here is an inventory: an object is loaded when it is
   * physically inside the truck and has settled there. */
  const straps = new StrapSystem(registry, bus, () => game.clock.simTimeMs);
  const cargo = new CargoSystem(registry, straps, tools, bus);

  /* ---- damage and the drive (Phase 8) ----------------------------------------------------
   * §10.4 is the rule: outcomes "derive from physical contacts, velocity, damage, and
   * constraints during transport", and a heuristic "must not secretly damage items without a
   * physical cause". So damage reads what bodies actually did, and the route applies forces
   * to those bodies. There is no path from a pack-quality score to an object's condition. */
  // A GETTER, not game.state itself: game.reset() replaces the state object wholesale, and a
  // captured reference kept billing replay damage to the previous run's orphaned ledger.
  const damage = new DamageSystem(physics, registry, bus, () => game.state);
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
    applyCameraDistance();
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
  /** The boom for the current seating: §4.1's shortened co-op boom is a property of the split,
   *  the solo boom is the player's setting (§21.4 "camera distance"). One function, so a join
   *  and a settings change cannot disagree about which applies. */
  function applyCameraDistance() {
    const d = seatCount > 1 ? COOP.cameraDistance : shell.cameraDistance;
    for (const m of movers) m.rig.setDistance(d);
  }
  applyCameraDistance();

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
    // §3.4: the cab is a CALLER of the phase machine, not a second one. game.setPhase is
    // the only CONTRACT_PHASE emitter, so from/to/simTimeMs are always on the event.
    setPhase: (to, validation) => game.setPhase(to, validation),
    now: () => game.clock.simTimeMs,
    /* The destination-room hint (M5). The row is looked up through game.state each time
     * because a reset replaces the manifest wholesale; 23 rows is not a search worth caching.
     * 'Living room (destination)' is the zone's label for the map; the hint wants the room. */
    manifestRow: (entityId) => game.state.manifest.find((r) => r.entityId === entityId) || null,
    roomLabel: (zoneId) => {
      const z = DEST_ZONES.find((zone) => zone.id === zoneId);
      return z ? z.label.replace(/\s*\(destination\)\s*$/i, '').toLowerCase() : zoneId;
    },
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

  /* §21.3's first step, advised rather than taught — Dev\INDEX.md → AirportBaggageCrew
   * onboarding: "a first-minute rail with NO training pauses", a STALL TIMER rather than a
   * route check. If nobody has gripped anything CONTRACT.stallHintMs into the pickup, one
   * notice per seat says how, in that seat's own glyphs. Sim time, so a paused game cannot
   * fire it (m0 E3); armed when the job starts (title.onStart), so time spent reading the
   * title card is not a stall; once per run (resetContract re-arms the count); the first
   * grip retires it — a player who has held a box does not need telling. The timer is
   * coaching, not contract, so it lives here and never in game.state (m11 O6). */
  const stallHint = { ms: 0, fired: false, done: false, armed: false };
  function resetStallHint() { stallHint.ms = 0; stallHint.fired = false; stallHint.done = false; }
  /* Declared before the stall-hint system below reads it (assigned with the HUDs further down):
   * a `const` there was a TDZ hazard for any boot-time frame — review minor, M5. */
  let shownDevice = [];
  game.addSystem('stallHint', (state, stepMs) => {
    if (!stallHint.armed || stallHint.done || state.phase !== PHASES.PICKUP) return;
    for (const m of movers) if (hasAnyGrip(state.players[m.id])) { stallHint.done = true; return; }
    stallHint.ms += stepMs;
    if (stallHint.ms < CONTRACT.stallHintMs) return;
    stallHint.done = true; stallHint.fired = true;
    for (let s = 0; s < seatCount; s++) {
      const g = input.glyphsFor(s, shownDevice[s]);   // declared with the HUDs below; runs only in frames
      pendingNotices.push({
        text: `hold ${g.gripL} / ${g.gripR} on a box to grab it — two hands for the heavy ones`,
        kind: 'good', seat: s,
      });
    }
  });

  game.setPhase(PHASES.PICKUP);

  /* Art-direction rig (?style=toy|cel|film) — three photographable proposals over one
   * build; no flag, no change. Applied HERE, after the furniture, tools and movers exist:
   * the first version ran at buildScene time and restyled only the architecture, which
   * made all three options photograph identically on the objects a player actually looks
   * at. Strap lines and guides are deliberately excluded — they are §10.3 state signals,
   * and a style that recolours a signal is a style breaking the game. */
  const styleMode = styleFromLocation();
  const styled = styleMode ? applyStyle(styleMode, world, renderer) : { postRender: null };

  /* ---- Phase 15: post chain and contact blobs — GPU tier only ----------------------------
   * The post chain reads the finished backbuffer (copyFramebufferToTexture — no scene render
   * target, MSAA kept) and composites bloom, grade and a seat-local vignette. It yields to a
   * style mock's own postRender and to ?post=off. Blobs are the soft contact darkening under
   * every mover and object, placed by a Rapier ray each frame. Neither exists in software. */
  const post = (renderTier === 'gpu' && RENDER.post.enabled && postModeFromLocation() !== 'off' && !styled.postRender)
    ? createPost(renderer, THREE, RENDER.post) : null;
  const blobs = renderTier === 'gpu' ? new ContactBlobs(THREE, world.scene, RENDER.look.blob) : null;
  /* Ground height under (x, z): a ray straight down with the source's own collider excluded,
   * so a blob never rides the object it belongs to. Same call shape as the mantle probes. */
  const blobProbe = (x, y, z, exclude) => {
    const hit = physics.world.castRay(new R.Ray({ x, y, z }, { x: 0, y: -1, z: 0 }),
                                      RENDER.look.blob.rayMax, true, undefined, undefined, exclude || undefined);
    return hit ? y - hit.timeOfImpact : null;   // Rapier 0.20: timeOfImpact, never .toi (grip.js, controller.js agree)
  };
  const blobSources = () => {
    const out = [];
    for (const m of movers) {
      const p = m.controller.position;   // feet-level
      out.push({ x: p.x, y: p.y, z: p.z, yaw: m.rig.yaw, sx: PLAYER.radius * 2, sz: PLAYER.radius * 2,
                 bottomY: p.y, disc: true, exclude: m.controller.collider });
    }
    for (const e of registry.entities.values()) {
      if (!e.mesh || !e.def) continue;
      const d = e.def.dimensions;
      /* Read the BODY, not the mesh: the mesh is synced once per render frame, and a probe
       * that runs before that sync (a suite, a shot) reads meshes still at the origin — five
       * blobs at y = -d.y/2 + 0.02, measured (m13g H9). The body is the physics truth at any
       * moment. Its bottom under the CURRENT rotation: the y-extent of a rotated cuboid is the
       * absolute second row of the rotation times the half-extents; from a quaternion that
       * row is (2(xy − wz), 1 − 2(x² + z²), 2(yz + wx)). */
      const t = e.body.translation(), r = e.body.rotation();
      const r10 = 2 * (r.x * r.y - r.w * r.z), r11 = 1 - 2 * (r.x * r.x + r.z * r.z), r12 = 2 * (r.y * r.z + r.w * r.x);
      const halfY = Math.abs(r10) * d.x / 2 + Math.abs(r11) * d.y / 2 + Math.abs(r12) * d.z / 2;
      const yaw = Math.atan2(2 * (r.w * r.y + r.x * r.z), 1 - 2 * (r.y * r.y + r.z * r.z));
      out.push({ x: t.x, y: t.y, z: t.z, yaw, sx: d.x, sz: d.z, bottomY: t.y - halfY, exclude: e.collider });
    }
    return out;
  };
  /* Compile every program once at boot so the first frame does not stall on forty material
   * variants, and so materials.js's rimAnchorFound bookkeeping is settled before any probe
   * reads it. Tens of milliseconds on a GPU; skipped in software, where it is ~12 s. */
  if (renderTier === 'gpu') renderer.compile(world.scene, movers[0].camera);

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

  /* ---- device-aware prompts (§26.5 "both input mappings", §4.4) — Phase 11 build-side M5
   * Which glyph set a seat sees follows input.activeDevice[seat], DEBOUNCED on sim time
   * (PROMPTS.deviceDebounceMs). activeDevice flips on ANY pad activity — a stick a hair past
   * its deadzone flips it every poll — and shown raw the prompt flickered E/X at frame rate.
   * The shown device changes only once the new one has been continuous for the whole
   * window: a one-poll blip never reaches the screen, and a real switch lands 15 steps late,
   * which nobody can see. Presentation state, never in game.state (m0 E8). */
  shownDevice = huds.map(() => 'kbm');
  const candDevice = huds.map(() => 'kbm');
  const candSinceMs = huds.map(() => 0);
  function settleDevices() {
    const now = game.clock.simTimeMs;
    let changed = false;
    for (let s = 0; s < huds.length; s++) {
      const d = input.activeDevice[s] || 'kbm';
      if (d === shownDevice[s]) { candDevice[s] = d; continue; }
      if (d !== candDevice[s]) { candDevice[s] = d; candSinceMs[s] = now; continue; }
      if (now - candSinceMs[s] >= PROMPTS.deviceDebounceMs) { shownDevice[s] = d; changed = true; }
    }
    if (changed) refreshHelp();
  }
  /** §26.5: the seat tag and the help line name the device in WORDS, not by glyph alone. */
  function deviceName(device, seat) {
    return device === 'pad' ? 'pad' : seat === 0 ? 'keys + mouse' : 'keys';
  }
  const divider = new SplitDivider(ui);
  const invoiceScreen = new InvoiceScreen(ui);
  const strapLines = new StrapLines(world.scene, straps, registry);

  /* §13.4's "compact job-start screen". It does NOT pause the clock — the world behind it
   * keeps running, and the suites drive game.frame() directly and never click a button, so
   * a title that gated the simulation would hang all fourteen of them. */
  const title = new TitleScreen(ui);
  title.onStart = () => {
    if (!game.state.paused) input.requestPointerLock();
    // A blur under the title paused the world; now that the card is gone, say so.
    pauseScreen.refresh();
    // The stall timer counts from the moment the job starts, not from the page load.
    stallHint.armed = true; stallHint.ms = 0;
  };

  /* §21.4's solo pause, made VISIBLE (Phase 11 build-side M3). The clock has paused correctly
   * since Phase 0; this is the card that says so and offers the way back. It observes the
   * SIM_PAUSED/SIM_RESUMED events and yields to the title and the settlement sheet — see
   * pauseScreen.js. Constructed after both, because `suppressed` reads them. */
  const pauseScreen = new PauseScreen(ui, {
    bus,
    isPaused: () => game.state.paused,
    suppressed: () => title.visible || invoiceScreen.visible,
  });
  pauseScreen.onResume = () => {
    game.setPaused(false);
    /* A click on the card is a real user gesture, so this lock request is honoured — the one
     * route back to mouse-look that does not need a second click on the canvas. (Escape is
     * NOT an activating key in Chrome, so an Esc-resume cannot re-lock; the card's foot says
     * to click.) A pad player gets no lock they did not ask for. */
    if (input.activeDevice[0] === 'kbm') input.requestPointerLock();
  };
  // §21.2 "a retry keeps settings": the same unwind the settlement sheet's replay uses.
  pauseScreen.onRestart = () => {
    resetContract();
    game.setPaused(false);
    hud.notice('new contract', 'good');
  };

  /* ---- settings (Phase 11 build-side M4) ---------------------------------------------------
   * §21.4 / §26.5. The panel is a VIEW over this store; the store routes every key to the
   * thing that consumes it and persists the lot (save.js). Input keys go through
   * Input.applySettings, which validates and clamps; the three shell keys are applied here.
   * Every control on the card moves a measured value (m16 U2) — nothing is stored for later. */
  let bestInvoice = saved.bestInvoice;
  function persist() {
    return writeSave({ settings: input.getSettings(), shell, bestInvoice });
  }
  const settingsStore = {
    values: () => ({ ...input.getSettings(), ...shell }),
    apply(patch) {
      const shellPatch = {};
      const inputPatch = {};
      for (const [k, v] of Object.entries(patch || {})) {
        if (Object.prototype.hasOwnProperty.call(SHELL_DEFAULTS, k)) shellPatch[k] = v; else inputPatch[k] = v;
      }
      if (Object.keys(inputPatch).length) input.applySettings(inputPatch);
      if (Object.prototype.hasOwnProperty.call(shellPatch, 'uiScale')) {
        const r = SETTINGS.ranges.uiScale;
        const v = Number(shellPatch.uiScale);
        if (Number.isFinite(v)) {
          shell.uiScale = Math.min(r.max, Math.max(r.min, v));
          document.documentElement.style.setProperty('--ts', String(shell.uiScale));
        }
      }
      if (Object.prototype.hasOwnProperty.call(shellPatch, 'cameraDistance')) {
        const r = SETTINGS.ranges.cameraDistance;
        const v = Number(shellPatch.cameraDistance);
        if (Number.isFinite(v)) {
          shell.cameraDistance = Math.min(r.max, Math.max(r.min, v));
          applyCameraDistance();
        }
      }
      if (Object.prototype.hasOwnProperty.call(shellPatch, 'tier') && SETTINGS.tiers.includes(shellPatch.tier)) {
        shell.tier = shellPatch.tier;   // consumed by the NEXT boot (see the top of boot())
      }
      persist();
    },
    reset() {
      this.apply({ ...DEFAULT_SETTINGS, ...SHELL_DEFAULTS });
    },
  };
  const settingsPanel = new SettingsPanel(ui, settingsStore);
  // Reachable from the title card and the pause card (§21.4; INDEX "settings panel").
  title.onSettings = () => settingsPanel.show();
  pauseScreen.onSettings = () => settingsPanel.show();
  pauseScreen.refresh();

  const stamp = document.createElement('div');
  stamp.id = 'build-stamp';
  stamp.textContent = `Movers From Hell — ${BUILD.label} · ${BUILD.date} · F3 for stats`;
  ui.appendChild(stamp);

  const help = document.createElement('div');
  help.id = 'help';
  ui.appendChild(help);
  /* DERIVED from the live binding table through glyphFor (input.js), per seat and per shown
   * device, for the same reason the prompt is (M5): a typed control line is a second table
   * that drifts, and this one already said 'E' to a seat whose key is Quote. Only the words
   * for the sticks and the mouse are authored here, because no binding names them. */
  let helpHtml = '';
  function refreshHelp() {
    const g = (action, s) => glyphFor(action, s, shownDevice[s], { bindings: input.seatBindings });
    const pad = (s) => shownDevice[s] === 'pad';
    const move = (s) => pad(s) ? 'left stick'
      : ['moveForward', 'moveLeft', 'moveBack', 'moveRight'].map((a) => g(a, s)).join('');
    const look = (s) => pad(s) ? 'right stick look' : s === 0 ? 'mouse'
      : ['lookUp', 'lookLeft', 'lookDown', 'lookRight'].map((a) => g(a, s)).join('') + ' look';
    const grab = (s) => `${g('gripLeft', s)}/${g('gripRight', s)} grab`;
    const join = pad(0) ? padLabel(COOP.joinPad) : COOP.joinKey;
    const html = seatCount > 1
      ? [0, 1].map((s) =>
          `<b>P${s + 1}</b> ${deviceName(shownDevice[s], s)}: ${move(s)} + ${look(s)} · ` +
          `${grab(s)} · ${g('interact', s)} use · ${g('context', s)} undo`).join(' &nbsp;|&nbsp; ') +
        ` &nbsp;|&nbsp; <b>${join}</b> one player · ${g('pause', 0)} pause · F3`
      : `<b>${pad(0) ? 'Pad.' : 'Click to look around.'}</b> &nbsp; ${move(0)}` +
        `${pad(0) ? ' move · right stick look' : ''} · ${g('brace', 0)} sprint/brace · ` +
        `${g('jump', 0)} jump · <b>${grab(0)}</b> · <b>${g('interact', 0)} use</b> · ` +
        `<b>${g('context', 0)} undo</b> · ${g('swapMover', 0)} swap mover · ` +
        `${g('recover', 0)} recover · <b>${join} two players</b> · ${g('pause', 0)} pause · F3`;
    if (html !== helpHtml) { helpHtml = html; help.innerHTML = html; }
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

  /** §21.2's contract panel, as plain facts. ONE contract's facts, so every seat's HUD shows
   *  the same numbers; the phase word is state.phase verbatim, which is why §3.4's machine
   *  reaching TRANSIT and DELIVERY (Phase 11 plan, M1) is visible on screen at all. */
  function contractFacts(summary = manifestSummary(game.state.manifest)) {
    return {
      phase: game.state.phase,
      delivered: summary.delivered,
      total: summary.total,
      loaded: cargo.loadedEntities().length,
      roomCorrect: summary.roomCorrect,
      elapsedMin: game.state.elapsedWorkMs / 60000,
      estimateMin: game.state.estimateMs / 60000,
    };
  }

  /* SETTLEMENT. §15.2: the grade "never hides" the invoice, and "negative profit still
   * completes the job", so this screen is the same screen either way. */
  /* ONCE PER SETTLEMENT. settle() calls game.setPhase(SETTLEMENT), which emits the very
   * CONTRACT_PHASE event the listener below turns into settle() — so without this latch a
   * direct M.settle() ran its own body twice (invoice built twice, screen shown twice), and
   * before the Phase 11 plan's M1 the cab's bare bus emit made the in-game path do the same. The latch is
   * the guard, not the phase: by the time the event arrives state.phase is ALREADY
   * 'settlement' (game.js sets it before emitting), so testing the phase would refuse the
   * one call that matters. */
  let settling = false;
  function settle() {
    if (settling) return;
    settling = true;
    try { settleOnce(); } finally { settling = false; }
  }
  function settleOnce() {
    // Stamped with the real clock so DAMAGE_APPLIED lines closed here carry the time they
    // were posted, not 0 (§27.4).
    damage.flush(game.clock.simTimeMs);
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
    /* §13.4's saved best invoice: profit is the one number (§15.2 — the grade never hides
     * it). Replaced only when it improves, but WRITTEN at every settlement (one setItem), so
     * a store that refused once — quota, private mode — heals on the next run; a refused
     * store is a false from save(), never a throw, and the sheet shows regardless (m16 V5). */
    const prevBest = bestInvoice;
    const isBest = !prevBest || invoice.profit > prevBest.profit;
    if (isBest) {
      bestInvoice = {
        profit: invoice.profit, grade: invoice.grade.letter, score: invoice.grade.score,
        delivered: summary.delivered, total: summary.total,
        build: BUILD.label, date: new Date().toISOString().slice(0, 10),
      };
    }
    persist();
    invoiceScreen.show(invoice, review, summary, stats, { best: prevBest, isBest });
    game.setPaused(true);
    input.releasePointerLock && input.releasePointerLock();
  }
  // The cab's E in DELIVERY goes game.setPhase(SETTLEMENT) -> this -> settle(); the latch
  // above makes the reverse direction (settle() -> setPhase -> this) a no-op.
  bus.on(EVENTS.CONTRACT_PHASE, (e) => { if (e.to === PHASES.SETTLEMENT) settle(); });

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
    /* ORDER MATTERS HERE, and getting it wrong cost an hour.
     *
     * The first version cleared every tool's `attachedTo` and THEN asked the registry to detach
     * whatever was attached — but `detachDolly` begins `if (!tool.state.attachedTo) return
     * false`, so the detach silently did nothing and the couch kept a dolly and its 0.04
     * friction into the next test. Two assertions then PASSED on stale state from the previous
     * section while the one that should have passed failed, which is the worst possible way for
     * a fixture to be wrong.
     *
     * So: unwind the attachments first, through the same API the game uses, and only then
     * clear what is left.
     *
     * (Copied verbatim from tools/m11-tests.js reset(), which got this right before the game
     * did: until the Phase 11 plan's M2 this function nulled the flags directly, so a couch
     * that had the dolly under it at settlement kept friction 0.04 and the Min combine rule
     * for every later run, a wardrobe with its doors off kept the shrunken collider, and a
     * tool in a mover's hands kept the no-collide group and fell out of the world.) */
    straps.releaseAll();
    route.reset();
    for (const m of movers) m.grips.releaseAll('contract reset');
    for (const e of registry.entities.values()) {
      if (e.state.dollyId) tools.detachDolly(tools.get(e.state.dollyId));
      if (e.state.blanketId) tools.removeBlanket(tools.get(e.state.blanketId));
    }
    for (const t of tools.tools.values()) {
      // The other direction of the same link, in case a tool and its object disagree.
      if (t.state.attachedTo && t.def.effect === 'friction') tools.detachDolly(t);
      else if (t.state.attachedTo && t.def.effect === 'protection') tools.removeBlanket(t);
      if (t.state.deployed) tools.retrieveRamp(t);
    }
    for (const s of interact.state.values()) { s.carriedTool = null; s.pendingAnchor = null; }
    strapsPlacedTotal = 0;

    game.reset();
    // AFTER game.reset(): the damage system reads game.state through a getter, so this
    // clears the NEW run's ledger and windows rather than the state just thrown away.
    damage.reset();

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
      // Counters and timers too, not just the position: recoveries are billed per run
      // (invoice.js), and a knockdown timer would carry a face-down mover into the new job.
      m.controller.resetForContract({
        x: world.spawn.x + off.x, y: world.spawn.y + 0.1, z: world.spawn.z + off.z,
      });
    }
    for (const t of tools.tools.values()) {
      t.state.deployed = false;
      t.state.attachedTo = null;
      t.state.carriedBy = null;
      t.state.geometry = null;
    }
    PHASE6_TOOL_SPAWNS.forEach((s, i) => {
      const t = [...tools.tools.values()][i];
      if (!t) return;
      t.body.setBodyType(physics.R.RigidBodyType.Dynamic, true);
      /* AND THE COLLISION GROUP. A carried tool is kinematic in `toolCarried`, which collides
       * with nothing including the ground (world.js); restoring the body type without the
       * group — which is what this did until M2 — sent a tool held when "Run it again" was
       * pressed through the floor for ever (tools have no §18.3 recovery). The sibling of the
       * Q put-down bug M1 fixed in interact._putDown. */
      t.collider.setCollisionGroups(GROUP_PRESETS.object);
      t.body.setTranslation({ x: s.x, y: s.y, z: s.z }, true);
      t.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      t.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      t.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      t.body.wakeUp();
    });
    physics.primeQueries();
    resetStallHint();          // once per RUN: the new contract gets its own first minute
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
      /* Parts go back on THROUGH reassemble(), whose guard is `removedParts.includes(part)`:
       * clearing the list first (which is what this did until M2) left the collider at the
       * shrunken half-extents and the mesh scaled down for the rest of the session, with no
       * way back because the guard then refused every reassemble. */
      for (const p of [...(e.state.removedParts || [])]) reassemble(registry, e, p);
      e.state.condition = 100;
      e.state.recoveries = 0;
      e.state.loaded = false;
      e.state.loadedOnTrip = null;
      e.state.cargoDwellMs = 0;
      e.state.removedParts = [];
      e.state.dimensions = null;
      e.state.dollyId = null;
      e.state.blanketId = null;
      e.state.frictionBefore = null;
      e.state.combineRuleBefore = null;
      e.state.everHeld = false;
      e.state.outOfBoundsMs = 0;
      e.state.settled = false;
      // The §18.3 last-stable point is the spawn again, not wherever run 1 left it.
      e.state.lastStable = { x: s.x, y: s.y, z: s.z };
      e.body.wakeUp();
    });
    physics.primeQueries();
  }

  // ---- shell wiring ---------------------------------------------------------------------
  input.onBlur = () => {                                // §21.4 solo pause
    pauseScreen.setReason('window lost focus');
    game.setPaused(true);
  };
  /* THE FIRST ESC IS SWALLOWED. While the pointer is locked, Chrome consumes the Escape that
   * releases it and delivers no keydown, so "Esc pauses" would take two presses. The lock
   * being lost IS the press: a locked→unlocked transition while running is the pause request
   * it was. Not during settlement (settle() releases the lock itself, already paused) and
   * never under the title, which owns the shell until the job starts. */
  input.onPointerLockLost = () => {
    if (title.visible || game.state.paused || game.state.phase === PHASES.SETTLEMENT) return;
    game.setPaused(true);
  };
  canvas.addEventListener('click', () => {
    // While the card is up it owns the clicks; grabbing the pointer behind it would leave
    // the player unable to press the one button on screen.
    if (title.visible) return;
    if (!input.pointerLocked && !game.state.paused) input.requestPointerLock();
  });
  // The debug key and F2 are read on the RENDER frame, not in a system: they must keep
  // working while the simulation is paused, and a paused clock runs no systems at all.
  // Escape is NOT read here any more: 'pause' is an ACTION (Escape + PAD.MENU, input.js),
  // consumed once per frame by the shell observer below, so a controller can pause too.
  window.addEventListener('keydown', (e) => {
    if (e.code === 'F3') {
      e.preventDefault();
      const on = overlay.toggle();
      // The metre grid is a measuring instrument, not scenery — it rides with the stats
      // rather than being painted on the lawn of a shipping build. See scene.js.
      if (world.grid) world.grid.visible = on;
    }
    /* §6.4's second pair of hands, on a key rather than on a controller connecting.
     * A pad being plugged in must NOT split a solo player's screen — that is a regression to
     * the validated single-player build arriving as a surprise, and the player who plugged it
     * in may only have wanted a controller. Joining is deliberate; leaving is the same key. */
    if (e.code === COOP.joinKey) {
      e.preventDefault();
      toggleSeats();
    }
  });
  /** F2 and the pad's View button: join or drop the second player. One function, so the key
   *  path and the pad path cannot drift apart (m12 E1/E2 pin what setSeats does). */
  function toggleSeats() {
    const n = setSeats(seatCount > 1 ? 1 : 2);
    hud.notice(n > 1 ? 'two players — P2 on the arrow keys or a pad' : 'one player', 'good');
  }

  /* SHELL ACTIONS ARE READ ONCE PER FRAME, THROUGH THE BINDING TABLE (§4.4: "every essential
   * action requires controller parity"; §25.3). Escape used to be a raw keycode above, which
   * left the bound PAD.MENU 'pause' dead and a controller-only player unable to start, pause
   * or join. Reading ACTIONS needs a per-FRAME edge buffer: the per-STEP one (`wasPressed`)
   * is cleared by endStep, which runs zero times per frame while paused and N times while
   * not — a render-frame reader misses it either way. `consumeShellEdge` reads the frame
   * buffer and consumes what it sees (input.js).
   *
   * A game OBSERVER rather than code in loop(): observers run at the end of every
   * game.frame(), paused or not, which is the one place the rAF loop and the suites (which
   * never see a rAF) both pass through. ⚠ This observer is the one that WRITES — it is the
   * shell, not a system, and it never touches game.state itself: every write goes through
   * the same public calls a keydown handler made before (game.togglePause, setSeats). The
   * game.js:92 "subscribers get the state to READ" contract still holds for systems. */
  game.subscribe(() => {
    if (title.visible) {
      // A = confirm on a pad, which is the 'jump' binding; Enter/Space/click are the title's own.
      if (input.consumeShellEdge('jump', 0)) title.start();
      return;
    }
    for (let s = 0; s < seatCount; s++) {
      /* A pad Menu (or seat 1's Esc) can pause while seat 0's mouse is still captured, which
       * leaves the card up with no cursor to click it — release the lock when the toggle
       * lands on PAUSED (the Esc path already lost it to Chrome; review minor, M3). */
      if (input.consumeShellEdge('pause', s)) { if (game.togglePause()) input.releasePointerLock(); }
      if (input.consumeShellButton(s, COOP.joinPad)) toggleSeats();
    }
  });

  /** §26.7 "identify the next objective without coaching" / §21.1 "compact objective count":
   *  ONE line (hud.js setObjective), from the phase machine and the truck, so it can never
   *  disagree with the contract panel above it. Device-neutral on purpose — it names the
   *  PLACE, and the prompt under the reticle names the key when you get there. */
  function objectiveFor(facts, routeStatus) {
    switch (facts.phase) {
      case PHASES.PICKUP: {
        if (facts.loaded === 0) return 'carry a box to the truck out front';
        const left = facts.total - facts.delivered - facts.loaded;
        return left > 0 ? `load ${left} more, or drive from the cab` : 'all aboard — drive from the cab';
      }
      case PHASES.TRANSIT:
        return routeStatus && routeStatus.state === 'driving'
          ? `on the road — ${routeStatus.event || Math.round(routeStatus.progress * 100) + '% there'}`
          : 'on the road';
      case PHASES.DELIVERY: {
        const left = facts.total - facts.delivered;
        return left > 0 ? `unload — ${left} left, each to its room` : 'all delivered — settle up at the cab';
      }
      case PHASES.SETTLEMENT: return 'settling up';
      default: return '';
    }
  }

  /**
   * Everything the HUD is told each frame, in ONE place. The render loop calls it after the
   * cameras move; a suite calls it directly, because headless Chrome never runs the loop
   * (1-3 rAF callbacks total, Dev\INDEX.md) and the prompt, glyph and objective assertions
   * (m11 O, m12 K) need the HUD fed exactly as the loop feeds it, not by a hand-built
   * approximation. READS state and never writes it (§22.2).
   */
  function feedHuds(rects = layoutFor(seatCount, canvas.clientWidth || 0, canvas.clientHeight || 0)) {
    settleDevices();
    const summary = manifestSummary(game.state.manifest);
    const packQuality = cargo.packQuality();
    const routeStatus = route.status();
    const contractPanel = contractFacts(summary);
    const objective = objectiveFor(contractPanel, routeStatus);

    for (let s = 0; s < seatCount; s++) {
      const me = moverOfSeat(s);
      const h = huds[s];
      const rect = rects[s];

      if (seatCount > 1) h.setRect(rect); else h.clearRect();
      // §26.5: whose half, and which device drives it, in words; the glyphs follow the device.
      const glyphs = input.glyphsFor(s, shownDevice[s]);
      h.setSeatTag(seatCount > 1 ? `P${s + 1} · ${me.id} · ${deviceName(shownDevice[s], s)}` : '');

      h.update(me.grips.status(), glyphs);
      const described = interact.describe(me);
      h.setPrompt(described, glyphs);

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
      h.setObjective(objective);
      h.setCargo(packQuality);
      h.setRoute(routeStatus);
    }
  }

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
      /* World-space grip points, so the body's arms reach and the hand markers sit ON the
       * grips (§6.1). Presentation reads simulation state; never the other way (§22.2). */
      const hands = {};
      for (const hand of HANDS) {
        const gr = m.grips.grips[hand];
        if (gr) {
          const e = registry.get(gr.entityId);
          if (e) hands[hand] = localToWorld(e.body, gr.localPoint);
        }
      }
      m.body.update(mp.position, mp.yaw, m.controller.horizontalSpeed, dt, hands);
    }
    registry.syncMeshes();
    tools.syncMeshes();
    strapLines.update(dt);

    /* ---- per-seat presentation. READS state and never writes it (§22.2). ---------------- */
    const rects = layoutFor(seatCount, canvas.clientWidth || 0, canvas.clientHeight || 0);
    for (let s = 0; s < seatCount; s++) {
      const me = moverOfSeat(s);
      me.rig.update(game.state.players[me.id].position, dt);
      applyAspect(me.camera, rects[s]);
    }
    // The HUD text — prompt glyphs, objective, contract, cargo, route — in the one function
    // the suites can call too (feedHuds, above). Cameras first, so the prompt reads this
    // frame's aim.
    feedHuds(rects);
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

    const seatList = Array.from({ length: seatCount }, (_, s) => moverOfSeat(s));
    if (blobs) blobs.update(blobSources(), blobProbe, seatList.map((m) => m.camera));
    if (styled.postRender && seatCount === 1 && !post) {
      // A style mock owns the frame (the film grade is single-viewport by design).
      styled.postRender(renderer, world.scene, moverOfSeat(0).camera);
    } else {
      // THE one render entry point (present.js): shadow maps once, every seat, then post.
      present(renderer, world.scene, seatList, rects, post, updateRimCamera);
    }
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
    game, input, world, overlay, hud, huds, renderer, syncSize, title, styled, styleMode,
    physics, registry, movers, tools, straps, cargo,
    /* Seat controls, so a suite can seat a second player without a keyboard. */
    setSeats, layoutFor, divider,
    /* Phase 15. present() renders the live seats through the post chain exactly as the loop
     * does; with a camera it renders that camera full-frame instead (the shot scripts). Every
     * tool that used to call renderer.render() directly goes through here now, because a
     * direct render draws a shadowless, ungraded frame with no error. */
    renderTier, post, blobs,
    present: (cam) => {
      const w = canvas.clientWidth || 0, h = canvas.clientHeight || 0;
      const list = cam ? [{ camera: cam }] : Array.from({ length: seatCount }, (_, s) => moverOfSeat(s));
      const rs = layoutFor(cam ? 1 : seatCount, w, h);
      if (blobs) blobs.update(blobSources(), blobProbe, list.map((m) => m.camera));
      return present(renderer, world.scene, list, rs, post, updateRimCamera);
    },
    get seatCount() { return seatCount; },
    seatInput: (s) => seatInputs[s],
    moverOfSeat, seatOfMover,
    truckPose: TRUCK_POSE, cargoInterior: cargoInterior(), cargoAnchors: cargoAnchors(),
    destZones: DEST_ZONES, destShell: DEST_SHELL, insideDestination,
    damage, route, interact, strapLines, invoiceScreen, settle,
    pauseScreen,
    /* Settings (M4): the panel, the store it views, and the best invoice it persists. */
    settingsPanel, settingsStore,
    get bestInvoice() { return bestInvoice; },
    get shellSettings() { return { ...shell }; },
    /* The notice queue and the contract panel's facts, because the render loop that drains
     * one and feeds the other never runs under headless Chrome (1-3 rAF callbacks total). A
     * suite asserts the 'arrived' notice and the phase word through these. */
    pendingNotices, contractFacts,
    /* The HUD feed, the objective line, the debounced device per seat and the stall timer
     * (M5): the render loop never runs under headless Chrome, so a suite feeds the HUD the
     * way the loop does and reads back what it showed (m11 O, m12 K). */
    feedHuds, objectiveFor, shownDevice: (s) => shownDevice[s], stallHint, resetStallHint,
    /* The §26.6 reset and the per-run recovery tally, so a soak can replay without going
     * through the settlement sheet and assert what the invoice will be told (M2). */
    resetContract, recoveryCount,
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
/** `?tier=gpu|software` from the URL, or null. detectRenderTier reads the same parameter; it
 *  is asked here only to decide whether the SAVED tier may speak at all (the URL wins). */
function tierFromLocation() {
  try {
    const t = new URLSearchParams(location.search).get('tier');
    return (t === 'gpu' || t === 'software') ? t : null;
  } catch (e) { return null; }
}

function hasAnyGrip(p) {
  return !!(p.grips && (p.grips.left || p.grips.right));
}
