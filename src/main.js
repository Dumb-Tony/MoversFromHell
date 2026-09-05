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
import { Input, CONTEXTS, DEFAULT_SETTINGS, glyphFor, padLabel, PAD } from './core/input.js';   // PAD: M24 any-button reveal skip
import { EventBus, EVENTS, PHASES } from './core/eventBus.js';
import { createRenderer } from './render/renderer.js';
import { buildScene, RAMP, fitsThroughGap } from './render/scene.js';   // fitsThroughGap: M24 brief's access notes
import { ThirdPersonCamera } from './render/camera.js';
import { makeBlockout } from './render/playerBody.js';
import { DebugOverlay } from './dev/debugOverlay.js';
import { initPhysics, PhysicsWorld, GROUP_PRESETS } from './physics/world.js';
import { PlayerController, LOCOMOTION } from './player/controller.js';
import { ObjectRegistry } from './objects/registry.js';
import { PHASE5_SPAWNS } from './objects/definitions.js';
import { buildManifest, stepManifest, validateManifest, overlappingSpawns } from './contract/manifest.js';
import { overlappingZones, zoneAt, ZONES, ROOM as HOUSE_ROOM, ROUTES as HOUSE_ROUTES } from './world/house.js';   // ROUTES: M24 brief's access notes
/* Phase 11 M11: the house's door leaves — records, poses and the effective clear widths. */
import { INTERIOR_DOORS, doorById, leafDoors, leafPose, leafRestPose, leafHingeMark, hungClear, tightestOnRoute } from './world/house.js';   // leafHingeMark: M23
import { ToolSystem, reassemble, clearFragments } from './tools/tools.js';
import { StrapSystem } from './cargo/straps.js';
import { CargoSystem } from './cargo/cargo.js';
import { TRUCK_POSE, cargoInterior, cargoAnchors, cabPoint, roadEventForce, insideCargo } from './world/truck.js';   // cabPoint, roadEventForce: M16 shake; insideCargo: M24 keep loadout
import { DEST_ZONES, DEST_SHELL, insideDestination } from './world/destination.js';
import { DamageSystem } from './damage/damage.js';
import { Scuffs } from './render/scuffs.js';
import { buildInvoice, reconcile, reviewFor, contributionStats, legsDriven } from './contract/invoice.js';   // legsDriven: M24 brief's distance
import { manifestSummary, tripStatus } from './contract/manifest.js';   // tripStatus: M13
import { RouteDriver } from './drive/route.js';
import { PHASE6_TOOL_SPAWNS, validateAllToolDefs } from './tools/definitions.js';
import { GripSystem, HANDS, restoreClearedObjects, moversOn, localToWorld } from './player/grip.js';
import { Hud } from './ui/hud.js';
import { InvoiceScreen, revealEnabledWith } from './ui/invoiceScreen.js';   // revealEnabledWith: M24's reveal, M31's switch
import { TitleScreen } from './ui/titleScreen.js';
import { PauseScreen } from './ui/pauseScreen.js';
import { SettingsPanel } from './ui/settings.js';
import { load as loadSave, save as writeSave, SHELL_DEFAULTS, reducedMotionPreferred, highContrastForced } from './core/save.js';   // highContrastForced: M19 ?hc=1
import { RunRecorder, buildRunSummary, compactRun } from './telemetry/runLog.js';
import { GameAudio, audioEnabledFrom, directionGlyph } from './audio/audio.js';
import { createHaptics } from './audio/haptics.js';   // §8.4's fourth channel (M28)
import { InteractionSystem } from './player/interact.js';
import { StrapLines } from './render/strapLines.js';
import { layoutFor, applyAspect, renderSeats, SplitDivider } from './render/coopView.js';
// setQualityTier: the Quality row applies LIVE (Phase 11 build-side M29) — it disposes the rig
// and rebuilds it from the tier's row in LIGHTING.tiers, in the scene that is already running.
import { detectRenderTier, shadowMapTypeFor, setQualityTier, shadowMapCount } from './render/lighting.js';
import { styleFromLocation, applyStyle } from './render/styles.js';
/* Phase 15 — the Overcooked overhaul. The four modules below are the render side of it;
 * main.js owns only the tier decision, the post/blob construction and the one present(). */
import { setRenderTier } from './render/textures.js';
import { createPost, postModeFromLocation } from './render/post.js';
import { present } from './render/present.js';
import { ContactBlobs } from './render/contactBlobs.js';
import { updateRimCamera } from './render/materials.js';
import { BUILD, MOVERS, COOP, RENDER, PLAYER, SETTINGS, PROMPTS, CONTRACT, ECONOMY, TELEMETRY, WORLD } from './config.js';   // WORLD: M15
import { TRUCK, AUDIO } from './config.js';   // M16: the shake's road severities and the impact silence threshold
import { DEBUG } from './config.js';   // M19: DEBUG.historyLen bounds the pause card's notice history
import { WALKTHROUGH } from './config.js';   // M22: the first-minute cards' clearance above the help line
import { Walkthrough, walkthroughEnabledFrom } from './ui/walkthrough.js';   // M22: the first-minute cards
import { ManifestScreen, hasDeparted } from './ui/manifestScreen.js';   // M33: §21.2's manifest card

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
  /* §21.4 Motion (M16): the OS's prefers-reduced-motion, read once, decides the DEFAULT of
   * the camera-shake switch for a save that carries no choice — recorded on the api and the
   * card, never fought (a saved choice wins; Defaults on the card restores this reading). */
  const reducedMotion = reducedMotionPreferred();
  const saved = loadSave({ reducedMotion });
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
  // The ground's side is config's WORLD.groundSizeM (M15): RECOVERY.bounds derives from it.
  physics.addGround(WORLD.groundSizeM);
  /* Kept (M14): {body, collider, tag} per static, and physics.staticTags / tagOf() beside it,
   * so the damage system can say WHAT an object hit — §8.4's "location". */
  const statics = physics.addStaticFromColliders(world.colliders);
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
  /** §21.4 Cognition "objective history" (Phase 11 build-side M19): the last DEBUG.historyLen
   *  notices as they were SHOWN — text, kind, the seat they were addressed to (null = everyone)
   *  and the sim time — for the pause card's 'What happened' block. SHELL state, never
   *  game.state (§22.4): fed only by drainNotices below (one entry per queued notice, so a
   *  broadcast to both seats is one line; a notice for a seat nobody is in is not shown and
   *  not recorded), cleared by resetContract. Not the bus ring: that is a diagnostic tail of
   *  events, this is what the player was told. */
  const noticeHistory = [];
  let strapsPlacedTotal = 0;
  /** Per mover, the controller.recoveries count last announced as a RECOVERY event (M6). */
  const recoveriesSeen = new Map();

  const bus = new EventBus();
  // The saved feel settings arrive as the constructor patch (input.js validates them).
  const input = new Input(window, canvas, undefined, saved.settings).attach();
  /* §21.4 full remapping (Phase 11 build-side M18): the saved binding DIFFS over this
   * build's defaults. save.js already sanitised them (an unknown action or a conflicting
   * entry was dropped there, with a console.info), so nothing is dropped here. */
  input.applyBindings(saved.bindings);
  const game = new Game({ contractId: 'suburban_starter', input, bus });
  /* §22.3 step 6, "record a lightweight event log for scoring and debugging", made a RECORD
   * rather than the bus's 256-entry diagnostic tail (Phase 11 build-side M6, runLog.js).
   * Attached before the first emit — game.setPhase(PICKUP) below is the first — so
   * recorder.events.length === bus.emitted until the per-run cap (m17 R1). The counters go
   * onto game.state.telemetry through a getter, because game.reset() replaces the state. */
  const recorder = new RunRecorder({
    counters: () => (game.state.telemetry ? game.state.telemetry.counters : null),
  }).attach(bus);
  /* The SHELL's settings — the ones no system reads: UI scale (the `--ts` variable every
   * font-size in styles.css multiplies by), the solo camera boom, the quality tier. Held
   * here, beside seatCount, and never in game.state. */
  const shell = { ...SHELL_DEFAULTS, ...saved.shell };
  /* `?hc=1` (M19, §21.4 Vision): high contrast on at boot regardless of the save — the
   * screenshot path, and a link a tester can open readable. A boot-time override of the LOADED
   * value, so the card shows it on and a player can turn it off; with no parameter the save
   * wins (m27 A7). */
  const hcForced = highContrastForced(location.search);
  // The override lives beside the saved choice, not in it: persist() writes the LOADED value
  // until the player touches the row (settingsStore.apply clears the override) — M19 review.
  const hcLoaded = shell.highContrast;
  let hcOverride = hcForced;
  if (hcForced) shell.highContrast = true;
  document.documentElement.style.setProperty('--ts', String(shell.uiScale));

  /* ---- audio (Phase 11 build-side M9; §20.4, §21.4 Hearing, §26.5) ------------------------
   * Synthesised, zero files (audio.js). Subscribed to the bus by cue name — a bounded O(1)
   * push inside the step, drained on the RENDER frame below (never in a system). Inert until
   * arm() runs inside a user gesture (the title's START, a canvas click, a key), and a browser
   * that refuses a context leaves the game identical (m18 A7/A12). `?audio=off` builds it
   * disabled. The saved bus levels land now and apply when the graph is built. */
  const audio = new GameAudio(bus, { enabled: audioEnabledFrom(location.search) });
  audio.setMaster(shell.audioMaster);
  audio.setBus('ui', shell.audioUi);
  audio.setBus('world', shell.audioWorld);

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

  // The bus and the clock, so an object recovery is a RECOVERY event with a real stamp (M6).
  const registry = new ObjectRegistry(physics, world.scene, bus, () => game.clock.simTimeMs);
  game.state.manifest = buildManifest(PHASE5_SPAWNS);
  /** `fromZone`, from where the row actually spawns (manifest.js promised it "at spawn" and
   *  nothing filled it — KNOWN_ISSUES had it null on every row). Row i is PHASE5_SPAWNS[i]
   *  by construction, and the pickup zone is the same record the delivery test reads, so
   *  the invoice can one day say the couch came out of the kitchen. Re-run on every rebuild
   *  of the manifest (resetContract below). Phase 11 M8. */
  const fillFromZones = (rows) => rows.forEach((row, i) => {
    const s = PHASE5_SPAWNS[i];
    const z = s ? zoneAt({ x: s.x, y: s.y, z: s.z }) : null;
    row.fromZone = z ? z.id : null;
  });
  fillFromZones(game.state.manifest);
  /** Manifest row index -> entity id. Kept OUTSIDE game.state because a reset replaces the
   *  state wholesale, and a replay has to re-attach the manifest to the same bodies. */
  const contractEntityIds = [];
  PHASE5_SPAWNS.forEach((s, i) => {
    const e = registry.spawn(s.def, s);
    /* §15.3 "heaviest thing moved" (M26): the flag heaviestMoved() reads and respawnContract
     * clears starts as a BOOLEAN, not as an absent key. Read undefined it behaved correctly
     * (falsy), but game.state's shape is a §22.4 contract — m0 E8 and the run export both
     * walk it — and a field that only exists after someone has grabbed something is a shape
     * that changes under the reader. grip.js writes the true. */
    e.state.everHeld = false;
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

  /* ---- the house's doors (Phase 11 build-side M11; §8.2, §2.1, §9.1, §15.2) -----------------
   * Every door record with a `leaf` (house.js INTERIOR_DOORS, scene.js APERTURES) gets one
   * door_leaf_01 hung in it: a registry entity — so the grip, the damage model, the recovery
   * and the m13 doorway sweeps all treat it as the object it is — with its body FIXED at the
   * jamb (registry.hang) and `manifest: false`, so it is never a manifest row and never
   * counts toward the contract panel. Its state is plain data (§22.4): doorId, hung, and the
   * two poses house.js computes — `home` (hung, swung open against the hinge jamb, its 40 mm
   * inside the opening) and `rest` (laid flat beside the doorway when the screwdriver takes
   * it off). The opening's EFFECTIVE clear width is gap − 0.04 while it hangs (hungClear):
   * living_kitchen is 0.82 m with its door on and 0.86 m with it off. */
  const leafEntities = new Map();                       // doorId -> entity (engine half; the state half is entity.state)
  for (const d of leafDoors(world.apertures)) {
    const home = leafPose(d);
    const rest = leafRestPose(d);
    // hinge: where a FORCED door's mark goes — the jamb the hinges were screwed to (M23).
    const hinge = leafHingeMark(d);
    const e = registry.spawn('door_leaf_01', home, { manifest: false, state: { doorId: d.id, hung: false, home, rest, hinge, everHeld: false } });
    registry.hang(e, home);
    leafEntities.set(d.id, e);
  }
  /* M23 (§23.3 DOOR_STATE): the run record starts EXPLICIT. On the first step of every run
   * (boot, and again after each contract reset) every leaf on its hinges announces 'hung' —
   * so a run summary reads the doors' starting state instead of inferring it. `silent`
   * keeps M9's caption layer out of it: four 'door on its hinges' captions greeting the
   * player after START was why M11 never emitted it (audio.js _onEvent). */
  let doorsAnnounced = false;
  const announceDoors = (simTimeMs) => {
    if (doorsAnnounced) return;
    doorsAnnounced = true;
    for (const e of leafEntities.values()) {
      if (!e.state.hung) continue;
      bus.emit(EVENTS.DOOR_STATE, { doorId: e.state.doorId, entityId: e.id, state: 'hung', reason: 'boot', silent: true }, simTimeMs);
    }
  };
  physics.primeQueries();
  /** Is this door's leaf on its hinges right now? The live predicate hungClear/tightestOnRoute take. */
  const leafHung = (doorId) => { const e = leafEntities.get(doorId); return !!(e && e.state.hung); };
  /** The doors, as the suites and the HUD read them (m19). Records are re-derived from the
   *  apertures each call — they are frozen data; nothing here caches a body. */
  const doors = {
    records: () => leafDoors(world.apertures),
    doorById: (id) => doorById(id, world.apertures),
    leaves: () => [...leafEntities.values()],
    leafFor: (doorId) => leafEntities.get(doorId) || null,
    isHung: leafHung,
    hungClear: (doorId) => hungClear(doorId, world.apertures, INTERIOR_DOORS, leafHung),
    tightestOnRoute: (roomId) => tightestOnRoute(roomId, world.apertures, INTERIOR_DOORS, leafHung),
    /** Every leaf back on its hinges at its home pose, with the run-scoped state a manifest
     *  object gets at respawn (condition, recoveries, loaded …). Emits DOOR_STATE 'rehung'
     *  only for a leaf that was actually off, so a replay with the doors untouched is silent. */
    rehangAll(reason = 'contract reset') {
      for (const e of leafEntities.values()) {
        const wasOff = !e.state.hung;
        registry.hang(e, e.state.home);
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
        e.state.awaitingPlayerClearance = false;
        e.collider.setCollisionGroups(GROUP_PRESETS.object);
        if (wasOff) {
          bus.emit(EVENTS.DOOR_STATE, { doorId: e.state.doorId, entityId: e.id, state: 'rehung', reason }, game.clock.simTimeMs);
        }
      }
      physics.primeQueries();
    },
  };
  /** §15.2's front_door_removed and the run's door facts live on game.state as plain data
   *  (§22.4), written from DOOR_STATE events — never inferred from where a leaf ended up.
   *  game.reset() replaces the state wholesale, so resetContract re-attaches this. */
  const attachDoorState = () => {
    game.state.doors = { removed: {}, frontRemoved: false };
  };
  attachDoorState();
  bus.on(EVENTS.DOOR_STATE, (e) => {
    const ds = game.state.doors;
    // A FORCED door is off its hinges too (M23): the same count, the same §15.2 tag.
    if (!ds || (e.state !== 'removed' && e.state !== 'forced')) return;
    ds.removed[e.doorId] = (ds.removed[e.doorId] || 0) + 1;
    const d = doorById(e.doorId, world.apertures);
    if (d && d.leaf && d.leaf.front) ds.frontRemoved = true;
  });

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
    // M16: the shake integrates on the sim clock (the harness freezes performance.now()) and
    // starts from the saved §26.5 switch. The rest of the rig stays on frame time.
    moverRig.setClock(game.clock);
    moverRig.setShakeEnabled(shell.cameraShake);
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
  /* §6.5 grip-strength assist (Phase 11 build-side M27): the saved shell key on every mover's
   * grip system at boot, the same way the camera-shake switch reaches every rig above.
   * setAssist clamps to GRIP.assist.max, so a hand-edited save that slipped past sanitiseShell
   * still cannot hand one mover the couch. */
  for (const m of movers) m.grips.setAssist(shell.gripAssist);
  /* §18.3 recovery of a HELD body lets every hand go first (M15, grip.js releaseEntity):
   * the registry knows bodies, the movers know hands, and this is the seam between them. */
  registry.releaseHolds = (entity, reason) => {
    for (const m of movers) m.grips.releaseEntity(entity.id, reason, game.clock.simTimeMs);
  };
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
    // M22: a second seat RETIRES the first-minute cards for the run (§21.1's split view has no
    // room, and both seats know the game) — they do not come back when the seat empties (m29 W5).
    if (walkthrough && seatCount > 1) walkthrough.retire('coop');
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

  /* §15.4 / §21.4's Quality row, APPLIED NOW rather than at the next boot (Phase 11 build-side
   * M29 — the second of KNOWN_ISSUES' two Phase 17 deferrals). `liveTier` is what the scene is
   * lit for at this moment; `renderTier` above stays what this BOOT decided, because the
   * texture and material set was minted from it before the scene existed (setRenderTier) and a
   * live switch does not re-mint it. lighting.setQualityTier disposes the old rig and builds
   * the other one against the same scene and the same room list; the shadow filter follows on
   * the renderer. The world's light handles are re-pointed at the new rig so M.world.sun and
   * M.world.roomLights stay the truth (tools/_perf.js and m13 read them). 'auto' asks
   * detectRenderTier again, which is also what honours ?tier= — so a URL-forced tier survives a
   * player switching to auto and back. Nothing here touches game.state, the physics world, the
   * geometry or the materials (m36 Q1). */
  let liveTier = renderTier;
  function applyQualityTier(choice) {
    const want = (choice === 'gpu' || choice === 'software') ? choice : detectRenderTier(renderer);
    const rig = setQualityTier(want, { renderer, THREE, scene: world.scene });
    if (!rig) return liveTier;
    liveTier = want;
    world.sun = rig.sun; world.fill = rig.fill; world.hemi = rig.hemi;
    world.ambient = rig.ambient; world.roomLights = rig.roomLights; world.tier = want;
    /* Phase 15's post chain and contact blobs are GPU-tier features that were BUILT at boot
     * (below) or not at all. What a live switch can do honestly is stop using them: post has a
     * setEnabled, and the blobs' per-frame update is gated on the live tier. A software boot
     * that switches up therefore gets the lights and the shadows now and the rest on reload —
     * said on the card, and recorded in KNOWN_ISSUES rather than faked here. */
    if (post) post.setEnabled(want === 'gpu');
    if (blobs && want !== 'gpu') blobs.update([], blobProbe, []);
    return liveTier;
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
    // §3.4: the cab is a CALLER of the phase machine, not a second one. game.setPhase is
    // the only CONTRACT_PHASE emitter, so from/to/simTimeMs are always on the event.
    setPhase: (to, validation) => game.setPhase(to, validation),
    now: () => game.clock.simTimeMs,
    /* Preparation time is BILLED (M8; §2.3, §8.2 "preparation time"). A disassembly's
     * authored seconds land on the labour clock the invoice reads AND on the current
     * phase's §27.4 line, together — the per-phase clock is the labour clock split (m11 T1),
     * and a minute spent unscrewing legs was spent in that phase. Same rule as Game.step:
     * the two phases that bill no labour bill none here either. The mover is not frozen —
     * the cost is the clock, not the hands (§2.1 never says "wait"). */
    chargeWorkMs: (ms) => {
      const s = game.state;
      if (s.phase !== PHASES.BRIEFING && s.phase !== PHASES.SETTLEMENT) s.elapsedWorkMs += ms;
      const pm = s.telemetry && s.telemetry.phaseMs;
      if (pm) pm[s.phase] = (pm[s.phase] || 0) + ms;
    },
    /* The destination-room hint (M5). The row is looked up through game.state each time
     * because a reset replaces the manifest wholesale; 23 rows is not a search worth caching.
     * 'Living room (destination)' is the zone's label for the map; the hint wants the room. */
    manifestRow: (entityId) => game.state.manifest.find((r) => r.entityId === entityId) || null,
    roomLabel: (zoneId) => {
      const z = DEST_ZONES.find((zone) => zone.id === zoneId);
      return z ? z.label.replace(/\s*\(destination\)\s*$/i, '').toLowerCase() : zoneId;
    },
    /* The cab's choice at the destination (M13; §3.4 "crew elects another trip"): the same
     * counts contractFacts() gives the objective line, so the prompt and the line agree. */
    tripStatus: () => tripStatus(game.state.manifest, registry),
  });
  /* A tool the §18.3 pass takes out of a mover's hands (M15, tools.js dropCarried) is
   * forgotten on the mover's side too, or interact.step would keep dragging it along. */
  tools.releaseCarry = (tool) => {
    for (const s of interact.state.values()) if (s.carriedTool === tool.id) s.carriedTool = null;
  };
  /* M23: what the hands are putting into an object this step — the sum of every grip's
   * applied force on it, across movers. The door-frame pass (damage.js _strainFrames) reads
   * it for a HELD object pressed against a hung leaf, because the leaf's own manifold reads
   * only what the floor's friction left of the shove (DAMAGE.property.doorFrame.pressSpeedMax). */
  damage.gripForceOf = (entity) => {
    let n = 0;
    for (const m of movers) {
      for (const g of [m.grips.grips.left, m.grips.grips.right]) if (g && g.entityId === entity.id) n += g.lastApplied || 0;
    }
    return n;
  };

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

      /* §4.3 TRIGGER PRESSURE (M27): this mover's hands read the seat that is DRIVING them,
       * and only while it is on foot — a grip action has no binding in the DRIVE table, and a
       * seat reading one there would report a trigger nobody is holding.
       *
       * An unattended mover gets null, which is a full pull, for the same reason it braces
       * automatically below: the trigger under the player's finger belongs to the mover they
       * are steering, and a solo player who swaps away must not have the couch quietly sag out
       * of the hands they left behind. */
      m.grips.setSeatInput(isActive && si.activeContext === CONTEXTS.FOOT ? si : null);

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

      p.locomotion = m.controller.step(stepMs, intent);

      const pos = m.controller.position;
      p.position.x = pos.x; p.position.y = pos.y; p.position.z = pos.z;
      const travel = m.controller.travelYaw();
      if (travel !== null) { p.yaw = travel; m.yaw = travel; }
      p.exertion = m.controller.exertion;
      p.grips.left = m.grips.grips.left ? m.grips.grips.left.entityId : null;
      p.grips.right = m.grips.grips.right ? m.grips.grips.right.entityId : null;

      /* One RECOVERY per increment, against the count last EMITTED rather than the count at
       * the top of this step: a recoverNow() between steps (the R key is read in-step; a
       * suite or the pause card is not) was invisible to a before/after diff, so the §27.4
       * recorder's tally disagreed with recoveryCount(). The fee is the one the invoice
       * bills (ECONOMY.recoveryFee), not the 0 it carried until M6. */
      const seen = recoveriesSeen.get(m.id) || 0;
      for (let k = seen; k < m.controller.recoveries; k++) {
        ctx.bus.emit(EVENTS.RECOVERY, {
          entityId: m.id, reason: m.controller.lastRecoveryReason, fee: ECONOMY.recoveryFee,
          newTransform: { ...m.controller.lastStable },
        }, ctx.simTimeMs);
      }
      if (m.controller.recoveries !== seen) recoveriesSeen.set(m.id, m.controller.recoveries);
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
  // §18.3 for the four tools (M15) — the registry's pass, for the bodies it never sees.
  game.addSystem('tools', (state, stepMs) => { tools.step(stepMs); });

  // §10.2's "settling inside the closed volume" reads the flag registry.step just set.
  game.addSystem('cargo', (state, stepMs, ctx) => { cargo.step(stepMs, ctx.simTimeMs); });

  /* Damage reads the velocities the solver produced, so it runs AFTER 'physics'. 'drive' is
   * registered further up, next to 'straps', for the opposite reason — see the note there. */
  game.addSystem('damage', (state, stepMs, ctx) => { damage.step(stepMs, ctx.simTimeMs); });

  // M23: the doors' starting state on the record, once per run (see announceDoors).
  game.addSystem('doorsAnnounce', (state, stepMs, ctx) => { announceDoors(ctx.simTimeMs); });

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
  /** §27.4 "cargo motion": where every loaded item was when the truck left. Measurement
   *  scaffolding, not contract state, so it lives here beside the stall timer (M6). */
  const cargoShift = { snapshot: null, event: null };
  /* M17 (§26.3): the same measurement PER §11.3 EVENT. A ROAD_FORCE opens a window on the
   * positions at that instant and closes the previous event's — the worst item's
   * displacement between one event and the next (or the arrival) is that event's shift,
   * onto counters.shiftByEvent as a max over legs. A read-only observer like the shake's:
   * it runs inside route.step's emit, before the physics step that the event first acts
   * on, so the window starts exactly where the event found the load. */
  const closeShiftWindow = (state) => {
    const w = cargoShift.event;
    if (!w) return;
    const c = state.telemetry && state.telemetry.counters;
    if (c) {
      if (!c.shiftByEvent) c.shiftByEvent = {};
      c.shiftByEvent[w.type] = Math.max(c.shiftByEvent[w.type] || 0, cargo.shiftSince(w.snapshot).worst);
    }
    cargoShift.event = null;
  };
  bus.on(EVENTS.ROAD_FORCE, (e) => {
    if (!TRUCK.roadEvents[e.roadType]) return;
    closeShiftWindow(game.state);
    cargoShift.event = { type: e.roadType, snapshot: cargo.snapshotPositions() };
  });
  game.addSystem('phase', (state) => {
    if (state.phase === PHASES.TRANSIT && !cargoShift.snapshot) {
      cargoShift.snapshot = cargo.snapshotPositions();
    }
    if (state.phase === PHASES.TRANSIT && route.state === 'arrived') {
      /* The pack's departure-to-arrival shift, measured by the bodies (cargo.shiftSince had
       * no caller in the game until M6): the worst item in metres and how many moved past
       * CARGO.shiftToleranceM, onto the §27.4 counters the run summary exports. */
      const c = state.telemetry && state.telemetry.counters;
      if (c && cargoShift.snapshot) {
        const sh = cargo.shiftSince(cargoShift.snapshot);
        c.worstCargoShift = Math.max(c.worstCargoShift || 0, sh.worst);
        c.cargo.shifted = sh.moved;
        c.cargo.measured = sh.count;
      }
      cargoShift.snapshot = null;
      closeShiftWindow(state);   // M17: the last event's window ends at the arrival
      /* THE RETURN LEG ARRIVES (M13; §3.4 "a phase may return to an earlier phase for an
       * extra trip. The state machine must not lose damage, time, fees, or manifest
       * status"). Nothing is reset but the route: the ledger, the clock, the delivered rows
       * and the phase clocks all stay, tripCount goes up by one, and the cargo system hands
       * out the new number to whatever settles in from now on (§10.2 "which trip moved each
       * item"). route.reset() AFTER the 'arrived' read above, so trip 2's cab press is the
       * ordinary parked branch — and this branch cannot fire twice. */
      if (route.heading === 'back') {
        state.tripCount += 1;
        cargo.tripCount = state.tripCount;
        route.reset();
        game.setPhase(PHASES.PICKUP);
        const away = tripStatus(state.manifest, registry).away;
        pendingNotices.push({ text: `back at the house — trip ${state.tripCount}: ${away} to go`, kind: 'good' });
      } else {
        game.setPhase(PHASES.DELIVERY);
        pendingNotices.push({ text: 'arrived — unload through the back', kind: 'good' });
      }
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
  /* M22: the first-minute cards (walkthrough.js), assigned after the help line exists below;
   * declared here for the same TDZ reason. While a card is up at step 1 or 2 the stall timer
   * does not count — one voice at a time, suppressed at the source (m29 W6). */
  let walkthrough = null;
  game.addSystem('stallHint', (state, stepMs) => {
    if (!stallHint.armed || stallHint.done || state.phase !== PHASES.PICKUP) return;
    /* §21.4 Cognition "optional hints" (M19): the shell's hints switch disarms the timer AT
     * THE SOURCE — off, it neither counts nor fires, so nothing is queued and nothing has to
     * be hidden (m27 A5 asserts the queue, not the DOM). On again, it counts on from where it
     * stopped; once per run still holds. */
    for (const m of movers) if (hasAnyGrip(state.players[m.id])) { stallHint.done = true; return; }
    if (!shell.hints) return;   // after the grip check: a grip retires the hint whether or not hints are on (M19 review)
    if (walkthrough && walkthrough.coaching) return;   // M22: a first-minute card is up at step 1 or 2 — it is the hint
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
  /* §8.4's "visual mark" for property damage (M14): a bounded ring of decals, event-driven
   * off DAMAGE_APPLIED / SIM_RESET, zero per-frame work — so BOTH tiers build it (unlike
   * blobs) and the headless harness can assert §26.6's bound (scuffs.js). */
  const scuffs = new Scuffs(THREE, world.scene, bus);
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
    /* The SIM clock, third argument (M26): §8.4's notices age on the same clock M9's
     * captions do, so a paused game freezes both and a headless suite expires both. */
    const h = new Hud(ui, s, () => game.clock.simTimeMs);
    /* HIDDEN AT BIRTH, not at the first frame. The empty panels collapse on their own
     * (`:empty { display: none }`), but the RETICLE does not — it is three divs that are
     * always drawn — so an unhidden seat-1 HUD puts a second crosshair in the middle of a
     * solo player's screen until the render loop gets round to hiding it. */
    h.el.hidden = s > 0;
    h.setCaptionsEnabled(shell.captions);   // §21.4 Hearing (M9): the saved captions switch
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
  /* §21.2's reveal (M24): wall-time presentation over the sheet's own lines. Off on the
   * harness's scratch page unless asked (?reveal=on, DEBUG.invoiceRevealInHarness), and
   * `?reveal=off` for anyone who wants the sheet at once — that is the PAGE rule
   * (invoiceScreen.js revealEnabledFrom).
   *
   * M31 adds the player's own row to it (shell.invoiceReveal, the settings card's 'Invoice
   * reveal'), because §21.4 Motion wants a switch for anything that animates and the count-up
   * was the one animation without one. The reduced-motion reading is now the DEFAULT OF THAT
   * KEY rather than a term in this line (save.js), which is what lets a saved choice win over
   * the OS the way the shake and rumble switches do — and `?reveal=on|off` still wins over
   * both, for the screenshot path. */
  invoiceScreen.revealEnabled = revealEnabledWith(shell.invoiceReveal, location.search, location.pathname);
  invoiceScreen.loadoutHook = true;   // resetContract honours { keepLoadout } (M24)
  /* M31: the sheet's 'keep the tools on the truck' box is a VIEW of the shell key the pause
   * card's box writes, and vice versa — one answer, two places to give it (M24 gap 4). */
  invoiceScreen.keepLoadoutDefault = () => !!shell.keepLoadout;
  invoiceScreen.onKeepLoadout = (v) => { shell.keepLoadout = !!v; persist(); pauseScreen.refresh(); };
  const strapLines = new StrapLines(world.scene, straps, registry);

  /* §13.4's "compact job-start screen". It does NOT pause the clock — the world behind it
   * keeps running, and the suites drive game.frame() directly and never click a button, so
   * a title that gated the simulation would hang all fourteen of them. */
  const title = new TitleScreen(ui);
  title.onStart = () => {
    // The START press is the first real gesture: the AudioContext is born here (M9). A suite
    // or a pad calling start() arms it suspended, and the next click or key resumes it.
    audio.arm();
    if (!game.state.paused) input.requestPointerLock();
    // A blur under the title paused the world; now that the card is gone, say so.
    pauseScreen.refresh();
    // The stall timer counts from the moment the job starts, not from the page load.
    stallHint.armed = true; stallHint.ms = 0;
    // M22: so do the first-minute cards — the title's own reading time is not step 1's.
    if (walkthrough) walkthrough.arm();
  };

  /* §21.4's solo pause, made VISIBLE (Phase 11 build-side M3). The clock has paused correctly
   * since Phase 0; this is the card that says so and offers the way back. It observes the
   * SIM_PAUSED/SIM_RESUMED events and yields to the title and the settlement sheet — see
   * pauseScreen.js. Constructed after both, because `suppressed` reads them. */
  const pauseScreen = new PauseScreen(ui, {
    bus,
    isPaused: () => game.state.paused,
    suppressed: () => title.visible || invoiceScreen.visible,
    history: () => noticeHistory,   // M19: the 'What happened' block reads the shell's ring
  });
  pauseScreen.onResume = () => {
    audio.arm();   // a click on the card: arm, or resume a suspended context (M9)
    game.setPaused(false);
    /* A click on the card is a real user gesture, so this lock request is honoured — the one
     * route back to mouse-look that does not need a second click on the canvas. (Escape is
     * NOT an activating key in Chrome, so an Esc-resume cannot re-lock; the card's foot says
     * to click.) A pad player gets no lock they did not ask for. */
    if (input.activeDevice[0] === 'kbm') input.requestPointerLock();
  };
  /* §21.2 "a retry keeps settings [and optionally preserves loadout]": the same unwind the
   * settlement sheet's replay uses — and since M31 the same OPTION too. The card's box reads
   * and writes the one shell key the sheet's box does, so a player who ticked it at the last
   * settlement does not lose the truck's tools to a pause-card restart (M24 gap 4). */
  pauseScreen.keepLoadout = () => !!shell.keepLoadout;
  pauseScreen.onKeepLoadout = (v) => { shell.keepLoadout = !!v; persist(); };
  pauseScreen.onRestart = (opts = {}) => {
    resetContract({ keepLoadout: opts.keepLoadout != null ? !!opts.keepLoadout : !!shell.keepLoadout });
    game.setPaused(false);
    hud.notice('new contract', 'good');
  };

  /* ---- settings (Phase 11 build-side M4) ---------------------------------------------------
   * §21.4 / §26.5. The panel is a VIEW over this store; the store routes every key to the
   * thing that consumes it and persists the lot (save.js). Input keys go through
   * Input.applySettings, which validates and clamps; the three shell keys are applied here.
   * Every control on the card moves a measured value (m16 U2) — nothing is stored for later. */
  let bestInvoice = saved.bestInvoice;
  /* §27.4 "local event logs … deletable" (M6): the last TELEMETRY.keepRuns run records,
   * compact (no event lists), carrying the tester's §27.3 answers as they arrive. The save's
   * sixth key (save.js). `currentRunIndex` is this run's slot once settle() has stored it, so
   * answers typed after the sheet is up UPDATE the record rather than adding one. */
  let keptRuns = Array.isArray(saved.runs) ? saved.runs.slice() : [];
  let currentRunIndex = -1;
  function persist() {
    // bindings (M18): the live table's diff from the defaults — never the whole table.
    const shellOut = hcOverride ? { ...shell, highContrast: hcLoaded } : shell;
    return writeSave({ settings: input.getSettings(), shell: shellOut, bestInvoice, runs: keptRuns, bindings: input.bindingDiff() });
  }
  function storeRun(summary) {
    keptRuns.push(compactRun(summary));
    if (keptRuns.length > TELEMETRY.keepRuns) keptRuns.splice(0, keptRuns.length - TELEMETRY.keepRuns);
    currentRunIndex = keptRuns.length - 1;
  }
  /** Close the record: a settled run gets its final answers, an abandoned one is stored now. */
  function finishRun(summary) {
    if (currentRunIndex >= 0 && keptRuns[currentRunIndex]) {
      keptRuns[currentRunIndex].questionnaire = (summary && summary.questionnaire) || null;
    } else if (summary) {
      storeRun(summary);
    }
    currentRunIndex = -1;
    persist();
  }
  /** The 'clear responses' button: every kept run, gone from memory and from the store. */
  function clearRuns() {
    keptRuns = [];
    currentRunIndex = -1;
    persist();
    invoiceScreen.setKeptCount(0);
    return true;
  }
  invoiceScreen.onClearRuns = clearRuns;
  invoiceScreen.questionnaire.onChange = (answers) => {
    if (currentRunIndex >= 0 && keptRuns[currentRunIndex]) {
      keptRuns[currentRunIndex].questionnaire = answers;
      persist();
    }
  };
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
          syncHelpMetrics();                         // M29: the help line may now wrap; --help-lift
          if (walkthrough) walkthrough.relayout();   // M22: the help line's height follows --ts
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
        shell.tier = shellPatch.tier;
        // M29: and NOW, not only at the next boot — the rig is rebuilt in the running scene
        // (applyQualityTier). The save still carries the choice, so the next boot mints the
        // matching texture set as well (m36 Q1/Q3).
        applyQualityTier(shell.tier);
      }
      /* §21.4 Hearing (M9): the three volume categories go straight to the bus gains, the
       * captions switch to every seat's caption line. Clamped to the same ranges save.js does. */
      for (const [k, busName] of [['audioMaster', null], ['audioUi', 'ui'], ['audioWorld', 'world']]) {
        if (!Object.prototype.hasOwnProperty.call(shellPatch, k)) continue;
        const r = SETTINGS.ranges[k];
        const v = Number(shellPatch[k]);
        if (!Number.isFinite(v)) continue;
        shell[k] = Math.min(r.max, Math.max(r.min, v));
        if (busName) audio.setBus(busName, shell[k]); else audio.setMaster(shell[k]);
      }
      if (Object.prototype.hasOwnProperty.call(shellPatch, 'captions')) {
        shell.captions = !!shellPatch.captions;
        for (const h of huds) h.setCaptionsEnabled(shell.captions);
      }
      /* §26.5 camera shake (M16): every rig's switch, at once — off also clears a shake in
       * flight, so the camera is still the moment the box is unticked (m24 K5). */
      if (Object.prototype.hasOwnProperty.call(shellPatch, 'cameraShake')) {
        shell.cameraShake = !!shellPatch.cameraShake;
        for (const m of movers) m.rig.setShakeEnabled(shell.cameraShake);
      }
      /* §6.5 grip strength (M27): every mover's grip system at once, the shake switch's shape.
       * Clamped to the slider's range here and again to GRIP.assist.max by setAssist — the cap
       * is the puzzle guard, and it is not the slider's to widen. */
      if (Object.prototype.hasOwnProperty.call(shellPatch, 'gripAssist')) {
        const r = SETTINGS.ranges.gripAssist;
        const v = Number(shellPatch.gripAssist);
        if (Number.isFinite(v)) {
          // Clamp AND snap: save.js rejects an off-step value outright, so a programmatic
          // apply({gripAssist: 1.4}) that only clamped would run at 1.4 and boot at 1.0.
          const clamped = Math.min(r.max, Math.max(r.min, v));
          const steps = Math.round((clamped - r.min) / r.step);
          shell.gripAssist = Number((r.min + steps * r.step).toFixed(4));
          for (const m of movers) m.grips.setAssist(shell.gripAssist);
        }
      }
      /* §8.4's haptic pulse (M28): the pad-rumble switch. Its consumer READS shell.rumble live
       * (haptics.js `enabled`), so there is nothing to push — but unticking it must also stop a
       * §10.3 creak already repeating, which the layer's own frame() does on the next tick. */
      if (Object.prototype.hasOwnProperty.call(shellPatch, 'rumble')) shell.rumble = !!shellPatch.rumble;
      /* §21.2's reveal (M31): the row is half the answer and the PAGE rule is the other half —
       * `?reveal=off`, and the harness's scratch page, still say no however the box is ticked
       * (invoiceScreen.js revealEnabledWith). Recomputed rather than assigned, so the two
       * halves can never drift apart. */
      if (Object.prototype.hasOwnProperty.call(shellPatch, 'invoiceReveal')) {
        shell.invoiceReveal = !!shellPatch.invoiceReveal;
        invoiceScreen.revealEnabled = revealEnabledWith(shell.invoiceReveal, location.search, location.pathname);
      }
      /* §21.2 "optionally preserves loadout" (M31): the tick both restart buttons read. Its
       * consumers are the two boxes — the pause card's, redrawn here, and the settlement
       * sheet's, which reads the key when the sheet is built — and resetContract itself. */
      if (Object.prototype.hasOwnProperty.call(shellPatch, 'keepLoadout')) {
        shell.keepLoadout = !!shellPatch.keepLoadout;
        pauseScreen.refresh();
      }
      /* §21.4 Cognition / Vision (M19): the three switches are booleans, pushed together to
       * their consumers by applyAccessibility below — every HUD, <body> and the cards, the
       * interaction system; the stall hint reads shell.hints itself. */
      let access = false;
      for (const k of ['reducedHud', 'highContrast', 'hints']) {
        if (!Object.prototype.hasOwnProperty.call(shellPatch, k)) continue;
        shell[k] = !!shellPatch[k];
        if (k === 'highContrast') hcOverride = false;   // the player chose: from here the save says what they said
        access = true;
      }
      if (access) applyAccessibility();
      /* M22: the first-minute cards' seen flag. Its consumer is the card itself (walkthrough.js
       * reads shell.walkthroughSeen when a run arms and on every frame): ticked while a card
       * is up takes the card down for the run; unticked shows them again at the next START or
       * restart (m29 W3). 'Defaults' unticks it with the rest of SHELL_DEFAULTS. */
      if (Object.prototype.hasOwnProperty.call(shellPatch, 'walkthroughSeen')) shell.walkthroughSeen = !!shellPatch.walkthroughSeen;
      persist();
    },
    reset() {
      // M16: 'Defaults' restores the OS reading for the shake switch, not a bare true.
      // M28: and for the pad-rumble switch, which follows the same reading.
      // M31: and for the invoice reveal, the third one that does — and it clears keepLoadout
      // (in SHELL_DEFAULTS as false), so a tick from a previous session does not outlive it.
      this.apply({ ...DEFAULT_SETTINGS, ...SHELL_DEFAULTS, cameraShake: !reducedMotion, rumble: !reducedMotion, invoiceReveal: !reducedMotion });
    },
    /* §21.4 "full remapping" (Phase 11 build-side M18): the Controls group. The live Input
     * OWNS the table (rebind validates through bindingConflicts and installs only a clean
     * result); the store persists the diff after every change and redraws the help line,
     * which derives from the same table the prompts do (glyphFor). A capture routes the
     * next press of ANY device to the card instead of the game (input.js _press). */
    bindings: () => input.bindingTable(),
    rebind(seat, ctx, action, token) {
      const r = input.rebind(seat, ctx, action, token);
      if (r.ok) { persist(); refreshHelp(); }
      return r;
    },
    resetBindings(seat) { const r = input.resetBindings(seat); persist(); refreshHelp(); return r; },
    beginCapture: (fn) => input.beginCapture(fn),
    endCapture: () => input.endCapture(),
  };
  const settingsPanel = new SettingsPanel(ui, settingsStore);

  /* ---- §21.2's manifest (Phase 11 build-side M33) -----------------------------------------
   * "The manifest filters by room/category and shows pickup, loaded, delivered and condition
   * states" — the fifth sentence of §21.2, and the one M24 did not close. §21.1 keeps the HUD
   * a count ('manifest 4 / 23'), so the checklist is a CARD opened on the `manifest` action
   * (M / D-pad up, input.js — a rebindable Controls row like every other) or from the pause
   * card. It PAUSES NOTHING (§2.2): the clock runs, the labour bills, the cargo keeps
   * settling behind it. Constructed here because `suppressed` reads all four screens it
   * yields to, and the last of them is the settings card above.
   *
   * The panel READS state and never writes it: rows, the registry, whether the truck has left
   * (hasDeparted — pure, over state) and how many house leaves are off their hinges (M11). */
  const manifestScreen = new ManifestScreen(ui, {
    bus,
    rows: () => game.state.manifest,
    registry,
    departed: () => hasDeparted(game.state),
    doorsOff: () => doors.records().filter((d) => d.leaf && !doors.isHung(d.id)).length,
    suppressed: () => title.visible || pauseScreen.visible || invoiceScreen.visible || settingsPanel.open,
  });
  /* The cursor has to reach the filter chips, so opening the card releases the pointer lock —
   * and `onPointerLockLost` below is told to read THAT release as what it is rather than as
   * the swallowed Escape it reads every other release as. Closing asks for the lock back the
   * way the pause card's Resume does; Chrome may refuse (Escape is not an activating key), and
   * the card's own foot says to click the game. */
  manifestScreen.onOpen = () => { if (input.pointerLocked) input.releasePointerLock(); };
  manifestScreen.onClose = () => {
    if (!game.state.paused && !title.visible && input.activeDevice[0] === 'kbm') input.requestPointerLock();
  };
  // The M3 shell-observer pattern: runs at the end of every game.frame(), paused or not.
  game.subscribe(() => manifestScreen.frame());
  /* The pause card's slot (pauseScreen.js onManifest). The manifest hides UNDER the pause card
   * by construction, so the button resumes first — otherwise it would open a card nobody could
   * see. §2.2 is the whole point of the card, so resuming to read it is the honest gesture. */
  pauseScreen.onManifest = () => { game.setPaused(false); manifestScreen.show(); };

  /** The help line's last reading, for the suites and the overlay (M29) — assigned by
   *  syncHelpMetrics() 70 lines below. DECLARED HERE, above applyAccessibility(), because
   *  applyAccessibility() calls syncHelpMetrics() at boot and a `let` beside its own function
   *  would be in temporal dead zone at that moment. Today the call returns at syncHelpMetrics's
   *  `if (!el)` guard (#help is not built until later), so the assignment is never reached and
   *  nothing throws — but the whole boot would then depend on that guard, and on the help div
   *  staying below this line. It does not depend on either now. */
  let helpMetrics = { rows: 1, lift: 0, lineHeight: 0, squeeze: 1, overBudget: false };
  /** …and whether the ladder has ever run out (M29 fixer). One shot: the lapse is a property of
   *  the window and the text size, so a resize drag would otherwise log it dozens of times. */
  let helpBudgetWarned = false;
  /* §21.4's Cognition and Vision rows (Phase 11 build-side M19): each shell switch pushed to
   * the thing that consumes it (m16 U2 "assert consumption"). Reduced HUD → every seat's HUD
   * (hud.js setReduced — both halves in co-op, m27 A1). High contrast → the `.hc` class on
   * <body>, on every HUD root and on every card, so styles.css can key off any of them and a
   * HUD or a card asked on its own answers the same (m27 A2). Hints → the interaction
   * system's room suffix (interact.js _roomHint); the stall-hint system reads shell.hints
   * itself. Called once here with the loaded (or ?hc=1-forced) values and again by the store
   * on every change. */
  function applyAccessibility() {
    for (const h of huds) { h.setReduced(shell.reducedHud); h.setHighContrast(shell.highContrast); }
    document.body.classList.toggle('hc', !!shell.highContrast);
    // M33: the manifest card is one more card, and takes the same `.hc` (m40 N6).
    for (const el of [title.el, pauseScreen.el, invoiceScreen.el, settingsPanel.el, manifestScreen.el]) el.classList.toggle('hc', !!shell.highContrast);
    interact.hints = !!shell.hints;
    syncHelpMetrics();                         // M29: .hc changes the help line's padding
    if (walkthrough) walkthrough.relayout();   // M22: .hc restyles the help line the card sits on
  }
  applyAccessibility();
  // Reachable from the title card and the pause card (§21.4; INDEX "settings panel").
  title.onSettings = () => settingsPanel.show();
  pauseScreen.onSettings = () => settingsPanel.show();
  pauseScreen.refresh();
  /* §21.2's brief on the title card (M24): READ from the contract boot already built and the
   * save already loaded (bestInvoice above) — the card never gates the clock and PICKUP is
   * set where it always was (m31 boot-order pin). */
  title.setBrief(briefFacts());

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
    if (html !== helpHtml) {
      helpHtml = html; help.innerHTML = html;
      syncHelpMetrics();                         // M29: a longer line may wrap; --help-lift
      if (walkthrough) walkthrough.relayout();   // relayout: M22
    }
  }

  /* §21.4's scalable UI, THE BOXES (Phase 11 build-side M29). The help line is the one panel
   * whose height is not a function of its own CSS: it is derived from the live binding table,
   * so how many lines it takes depends on the text, the text size, high contrast and the window
   * width all at once. Everything that sits over it — the route bar, the caption, the notices,
   * the build stamp — therefore gets ONE measured number instead of four guesses: --help-lift,
   * how much taller than a single line this line currently is. It is 0 whenever the line fits on
   * one, which is why 1.0× is bit-for-bit the layout Phase 15 measured (m36 S2), and one line
   * height when it wraps at 1.4× and up. Measured HERE and nowhere else, on the same four
   * occasions walkthrough.relayout() is called — a help rewrite, a --ts change, a high-contrast
   * change and a resize — never per frame (m29 W1z4's rule).
   *
   * SETTINGS.textSize.helpMaxLines is a BUDGET, and this is what spends it. Two rows are allowed
   * because two rows still leave the route bar and the caption above the working area; a third
   * would not (§21.1). So when the line still wants a third row at the size and window width it
   * has been given — a window narrower than the harness's 1262 px, or a text size past the 1.6×
   * the settings range allows — the loop steps DOWN SETTINGS.textSize.helpSqueeze and re-measures,
   * stopping at the first factor that fits. Smaller help text is the lesser harm; covering the
   * doorway is the one thing the scale must never do. The ladder starts at 1 and 1 is what every
   * text size a player can pick measures here, so the shipping layout never sees the rest of it
   * (m11 M29-5 pins that; m36 S1f drives it past the budget on purpose). */
  function syncHelpMetrics() {
    const el = document.getElementById('help');
    if (!el) return null;                      // called from applyAccessibility() before the line exists
    const budget = Math.max(1, SETTINGS.textSize.helpMaxLines);
    const ladder = SETTINGS.textSize.helpSqueeze;
    const root = document.documentElement;
    let rows = 1, lh = 0, squeeze = ladder[0];
    for (let i = 0; i < ladder.length; i++) {
      squeeze = ladder[i];
      root.style.setProperty('--help-squeeze', String(squeeze));
      const cs = getComputedStyle(el);       // …which is also the reflow the next line reads
      lh = parseFloat(cs.lineHeight);
      if (!Number.isFinite(lh) || lh <= 0) {
        /* Unmeasurable line height — bail, but NOT mid-ladder: leaving --help-squeeze on step i
         * would shrink the help text by a factor no measurement justified. Put the identity factor
         * back first. helpMetrics is deliberately left AS IT WAS rather than zeroed: with no
         * measurement to replace it, the last good reading describes the screen better than a
         * blank one, and every caller re-runs this on the next layout event. */
        squeeze = ladder[0];
        root.style.setProperty('--help-squeeze', String(squeeze));
        return null;
      }
      const inner = el.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
      rows = Math.max(1, Math.round(inner / lh));
      if (rows <= budget) break;
    }
    /* THE FLOOR. The loop above stops at the first factor that fits — or simply RUNS OUT, and
     * then rows is still over the budget, --help-lift is two line heights or more, and the route
     * bar and the caption rise into the working area: the §21.1 harm this whole measurement
     * exists to prevent, happening silently. A ladder cannot be made deep enough for every window
     * (the floor factor at 1.6× still wants ~1005 px of text, so a window under ~560 px is past
     * it), so the lapse is REPORTED instead of hidden: a flag the suites pin (m36 S1g) and one
     * console line saying by how much. The honest fix is a shorter control line, not a smaller
     * one — it is in KNOWN_ISSUES as an open item. */
    const overBudget = rows > budget;
    const lift = (rows - 1) * lh;
    helpMetrics = { rows, lift, lineHeight: lh, squeeze, overBudget };
    root.style.setProperty('--help-lift', `${lift.toFixed(2)}px`);
    if (overBudget && !helpBudgetWarned) {
      helpBudgetWarned = true;
      console.warn(`#help needs ${rows} rows at the smallest squeeze the ladder has (${squeeze}); ` +
                   `SETTINGS.textSize.helpMaxLines is ${budget}, so the panels above it are lifted ` +
                   `${lift.toFixed(1)}px — into the working area (§21.1). Narrower window than the ` +
                   `control line fits, or a text size past the settings range.`);
    }
    return helpMetrics;
  }
  refreshHelp();
  syncHelpMetrics();
  // The line's wrap depends on the window's width, and nothing else in main.js watches a resize
  // (syncSize runs per frame and only touches the canvas). The walkthrough card listens for its
  // own; this is the same event for the same reason.
  window.addEventListener('resize', () => syncHelpMetrics());

  /* ---- the first-minute cards (Phase 11 build-side M22; §26.7 Comprehension, §21.3) -------
   * walkthrough.js: three cards bottom-left above the help line, each retired by the real
   * event — seat 0's first grip, the first load, then the objective line taking over after
   * WALKTHROUGH.step3Ms or the first delivery. Shell state (§22.4), built only where
   * walkthroughEnabledFrom says: never on the harness's scratch page unless a suite asks with
   * ?walkthrough=1 (m29). It yields to every pause-shaped screen and to hints off (M19);
   * co-op retires it for the run (setSeats); the shell key walkthroughSeen keeps it off for
   * good once the third card retired or the ✕ skipped them. Armed by title.onStart and by
   * resetContract; drawn by the game observer below and by feedHuds, so a suite that feeds
   * the HUD feeds this. Its bottom is MEASURED from the help line's live top, so text size
   * and high contrast cannot push the two together (m29 W1) — measured once, then again only
   * after a resize, a help-line rewrite or a --ts / .hc change (walkthrough.relayout, called
   * from refreshHelp, the uiScale apply and applyAccessibility), never per frame (m29 W1z4). */
  walkthrough = new Walkthrough(ui, {
    enabled: walkthroughEnabledFrom(location.search, location.pathname),
    bus,
    glyphs: () => input.glyphsFor(0, shownDevice[0]),
    seat0Player: () => moverOfSeat(0).id,
    // M33: …and to the manifest card, which is a full-screen sheet — one voice at a time.
    suppressed: () => title.visible || pauseScreen.visible || invoiceScreen.visible || settingsPanel.open || manifestScreen.open || !shell.hints,
    coop: () => seatCount > 1,
    seen: () => !!shell.walkthroughSeen,
    delivered: () => game.state.manifest.some((r) => r.delivered),
    clearance: () => (window.innerHeight - help.getBoundingClientRect().top) + WALKTHROUGH.clearancePx,
    onSeen: () => { shell.walkthroughSeen = true; persist(); },
  });
  // The M3 shell-observer pattern: runs at the end of every game.frame(), paused or not.
  game.subscribe(() => walkthrough.frame(game.clock.simTimeMs));

  /* ---- events the player should SEE (§8.4, §10.3) ---------------------------------------
   * §8.4: "At impact: material sound, visual mark, optional haptic pulse, and ONE SMALL COST
   * NOTICE." The cost notice is the only one of those four this build can do, so it does it.
   * Subscribed here rather than polled, so a notice can never be missed between frames. */
  bus.on(EVENTS.DAMAGE_APPLIED, (e) => {
    /* One notice per ledger line, on either ledger (M14): a property line names the
     * SURFACE — 'front wall — scuffed · 38.40' — where an item line names the object. */
    const name = e.category === 'property'
      ? String(e.location || e.surfaceId || 'a surface')
      : String(e.defId || '').replace(/_\d+$/, '').replace(/_/g, ' ');
    /* A door frame's line (M23) says what happened to the door rather than a band:
     * 'kitchen door forced off its hinges — 140.00' / 'kitchen door frame bent — 40.00'. */
    const text = e.kind === 'door_frame'
      ? `${name} ${e.band === 'forced' ? 'forced off its hinges' : 'frame bent'} — ${e.cost.toFixed(2)}`
      : `${name} — ${e.band} · ${e.cost.toFixed(2)}`;
    pendingNotices.push({ text, kind: 'damage' });
  });
  /* M30 — §8.4's notice and mark for a hit that costs nothing because the surface is already
   * at its §8.3 maximum. There is no ledger line to notice (damage.js _postCapped explains
   * why it is a name of its own and not a zero-cost DAMAGE_APPLIED), so the two channels the
   * line would have driven are driven from here instead: the same wording as a damage notice
   * with the price replaced by the reason, and the SAME scuff ring — the payload carries
   * category 'property', `at` and `normal`, which is all Scuffs.mark reads, so a player who
   * keeps hitting a paid-for wall keeps marking it (until the ring's own §26.6 bound). The
   * rate discipline is at the source: one event per surface per DAMAGE.property.cappedRepeatMs. */
  bus.on(EVENTS.PROPERTY_CAPPED, (e) => {
    const name = String(e.location || e.surfaceId || 'a surface');
    pendingNotices.push({ text: `${name} ${e.band || 'marked'} — already at its maximum`, kind: 'damage' });
    scuffs.mark(e);
  });
  bus.on(EVENTS.STRAP_CHANGED, (e) => {
    // Only the states worth interrupting for. A strap going tensioned is not news.
    if (e.state === 'failed') pendingNotices.push({ text: 'a strap gave way', kind: 'damage' });
    else if (e.state === 'overstressed') pendingNotices.push({ text: 'strap overstressed', kind: 'warn' });
  });
  bus.on(EVENTS.ROAD_FORCE, (e) => {
    pendingNotices.push({ text: e.label, kind: 'warn' });
  });

  /* ---- camera shake sources (Phase 11 build-side M16; §21.4 Motion, §26.5, §11.3, §8.4) --
   * Read-only OBSERVERS of the bus — never a system, never game.state. A nudge is a
   * presentation offset on ONE seat's rig (camera.js), applied after the boom solve and
   * probed against the walls; the rig's own switch (shell.cameraShake) makes it a no-op.
   *
   * WHICH SEAT. Road events reach the DRIVING seat only (the m12 co-op assertion): the seat
   * whose mover pressed E at the cab. The CONTRACT_PHASE event carries no mover id, so the
   * driver is recorded at the moment the phase turns to TRANSIT as the seated mover nearest
   * the cab point — a press needs the mover within TOOLS.interactRange + 0.6 m of it
   * (interact.js probe), and in solo the one seat is the crew. Impacts reach every seat whose
   * mover is within shake.impactRange of the hit, ∝ relVelocity above the audio's own silence
   * threshold (AUDIO.impact.minVelocity), attenuated by distance. A knockdown reaches its own
   * seat once, read on the render frame (there is no knockdown event; shakeFrame below). */
  const SHAKE = RENDER.camera.shake;
  const shakeDriver = { mover: -1 };
  bus.on(EVENTS.CONTRACT_PHASE, (e) => {
    if (e.to !== PHASES.TRANSIT) return;
    const cab = cabPoint();
    let best = -1, bestD = Infinity;
    for (let s = 0; s < seatCount; s++) {
      const m = moverOfSeat(s);
      const p = m.controller.position;
      const d = Math.hypot(cab.x - p.x, cab.z - p.z);
      if (d < bestD) { bestD = d; best = movers.indexOf(m); }
    }
    shakeDriver.mover = best;
  });
  /** WHICH SEAT A ROAD EVENT REACHES, decided ONCE (M28). The shake below and the pad rumble
   *  (haptics.js) are two channels of the same §11.3 event, so they must not each infer the
   *  driver: this is the expression the shake observer already used, given a name so the
   *  haptic layer can read the SAME answer (m35 H2 asserts they are equal). In solo the one
   *  seat is the crew whatever mover it is on; in co-op only the driver's; -1 means nobody. */
  const roadShakeSeat = () => (seatCount === 1 ? 0 : seatOfMover(shakeDriver.mover));
  bus.on(EVENTS.ROAD_FORCE, (e) => {
    const ev = TRUCK.roadEvents[e.roadType];
    if (!ev) return;
    const sev = ev.severity;
    const seat = roadShakeSeat();
    if (seat < 0) return;
    const rig = moverOfSeat(seat).rig;
    // The truck-frame direction the seat is nudged in: the same one the cargo's pseudo-force
    // takes (truck.js) — a brake throws forward (+Z, TRUCK_POSE.yaw is 0), a turn sideways, a
    // bump up — unless the event names its own. M26 gave the bump a forward fraction on the
    // CARGO (the deck walking out from under the load); the cab itself still only rises, so
    // TRUCK.roadEvents.speedBump carries a `seatAccel` and the shake is unchanged (m24 K2g).
    // Only the direction is used: k below normalises it back to shake.road × severity.
    const sa = ev.seatAccel;
    const f = sa ? { x: sa.x, y: sa.y, z: sa.z } : roadEventForce(e.roadType, 1);
    if (!f) return;
    const len = Math.hypot(f.x, f.y, f.z) || 1;
    const k = SHAKE.road * sev / len;
    const r = rig.rightFlat();
    const sideways = (f.x * r.x + f.z * r.z) / len;   // which way, in the rig's own frame
    const mrad = SHAKE.roadRotMrad * sev;
    const rot = e.roadType === 'hardBrake' ? { pitch: -mrad }
              : e.roadType === 'sharpTurn' ? { roll: -Math.sign(sideways || 1) * mrad }
              : { pitch: mrad * RENDER.camera.shake.bumpRotFraction };
    rig.nudgeWorld({ x: f.x * k, y: f.y * k, z: f.z * k }, rot);
  });
  bus.on(EVENTS.IMPACT, (e) => {
    const v = Number(e.relVelocity) || 0;
    const minV = AUDIO.impact.minVelocity, fullV = AUDIO.impact.fullVelocity;
    if (v <= minV || !e.position) return;
    const strength = Math.min(1, (v - minV) / Math.max(1e-6, fullV - minV));
    for (let s = 0; s < seatCount; s++) {
      const m = moverOfSeat(s);
      const p = m.controller.position;
      const dx = e.position.x - p.x, dy = e.position.y - p.y, dz = e.position.z - p.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > SHAKE.impactRange) continue;
      const att = 1 - d / SHAKE.impactRange;
      const amp = SHAKE.impact * strength * att * att;
      if (amp <= 0) continue;
      // Mostly the floor's jolt (up), with a push away from the hit.
      const h = Math.hypot(dx, dz);
      const ax = h > 1e-6 ? -dx / h : 0, az = h > 1e-6 ? -dz / h : 0;
      m.rig.nudgeWorld({ x: ax * amp * SHAKE.impactAway, y: amp, z: az * amp * SHAKE.impactAway });
    }
  });
  /** The knockdown source, on the render frame: one nudge per knockdown, on the seat whose
   *  mover went down (controller.knockdowns is the count; there is no bus event for it). */
  const knockdownsSeen = new Map();
  function shakeFrame() {
    for (let s = 0; s < seatCount; s++) {
      const m = moverOfSeat(s);
      const n = m.controller.knockdowns;
      const seen = knockdownsSeen.get(m.id);
      if (seen !== undefined && n > seen) {
        m.rig.nudge({ x: 0, y: -SHAKE.knockdown, z: 0 }, { roll: SHAKE.knockdownRotMrad });
      }
      knockdownsSeen.set(m.id, n);
    }
  }
  /* ---- the haptic pulse (Phase 11 build-side M28; §8.4, §11.3, §10.3, §21.4 Motion, §4.4) --
   * §8.4's fourth channel, beside the sound (M9), the mark (M14) and the cost notice above.
   * A read-only OBSERVER of the same cue stream, exactly like the shake sources: it never
   * writes game.state, adds no body and adds nothing to the scene. Every routing question it
   * asks is answered by something that already exists — the entity's own grips for "whose
   * hands", roadShakeSeat() for "who is driving" (the shake's answer, not a second guess),
   * input.padForSeat for "which pad is this seat's" — and the shell key `rumble` is read LIVE
   * so unticking the box stops it inside the same frame. */
  const haptics = createHaptics({
    input,
    seatCount: () => seatCount,
    // The recap's own mover-id → seat helper, hoisted below; one lookup, not a second copy.
    seatOfPlayer,
    holdersOf: (entityId) => {
      const e = registry.get(entityId);
      const grips = e && e.state && e.state.grips;
      return Array.isArray(grips) ? grips.map((g) => g.playerId).filter((id) => id != null) : [];
    },
    drivingSeat: roadShakeSeat,
    enabled: () => !!shell.rumble,
    now: () => game.clock.simTimeMs,
  });
  haptics.attach(bus);
  // §10.3's creak is the only SUSTAINED pulse, so it needs a tick; the M3 shell-observer
  // pattern runs it at the end of every game.frame(), on sim time, frozen under the pause card.
  game.subscribe(() => haptics.frame(game.clock.simTimeMs));
  bus.on(EVENTS.STRAP_CHANGED, (e) => { if (e.state === 'slack' && e.strapId) strapsPlacedTotal++; });
  bus.on(EVENTS.RECOVERY, () => {
    pendingNotices.push({ text: 'recovery callout — a fee at settlement', kind: 'warn' });
  });

  /** §21.2's contract panel, as plain facts. ONE contract's facts, so every seat's HUD shows
   *  the same numbers; the phase word is state.phase verbatim, which is why §3.4's machine
   *  reaching TRANSIT and DELIVERY (Phase 11 plan, M1) is visible on screen at all. */
  /** 'couch_3seat_01' -> 'couch 3seat' (the words every prompt uses, invoice.js wordsOf), for
   *  a registry entity, a tool or a mover — the recap's names (M24). */
  function wordsFor(id) {
    const e = registry.get(id);
    if (e) return String(e.defId || id).replace(/_\d+$/, '').replace(/_/g, ' ');
    const t = tools.get ? tools.get(id) : null;
    if (t) return String(t.defId || id).replace(/_\d+$/, '').replace(/_/g, ' ');
    const mi = movers.findIndex((m) => m.id === id);
    if (mi >= 0) { const s = seatOfMover(mi); return s >= 0 ? `mover P${s + 1}` : `mover ${id}`; }
    return String(id);
  }
  /** A player/mover id -> its seat right now, or -1 (the recap's seat column, M24). */
  function seatOfPlayer(id) {
    const mi = movers.findIndex((m) => m.id === id);
    return mi >= 0 ? seatOfMover(mi) : -1;
  }

  /**
   * §21.2's BRIEF, as plain facts (M24): "payout, estimate, distance, manifest profile, access
   * notes, hazards, and optional goals" — every one read from state or config, none authored
   * here. The title card renders it (titleScreen.js briefHtml); m31 B1 asserts each value
   * against the same sources. Read at boot, after the contract exists and the save is loaded.
   */
  function briefFacts(over = {}) {
    const state = game.state;
    const rows = state.manifest || [];
    const byCategory = {};
    const handling = {};
    let heaviest = null;
    const prep = [];
    for (const row of rows) {
      const e = registry.get(row.entityId);
      const def = e && e.def;
      if (!def) continue;
      byCategory[def.category] = (byCategory[def.category] || 0) + 1;
      if (row.handling) handling[row.handling] = (handling[row.handling] || 0) + 1;
      if (!heaviest || def.mass > heaviest.mass) heaviest = { defId: def.id, name: wordsFor(e.id), mass: def.mass };
      /* Access notes: a def whose disassembly SHRINKS it (the couch's legs, §7.1) against the
       * tightest doorway on its way out (house.js tightestOnRoute with the leaves hung), with
       * the two smallest dimensions as the cross-section (scene.js fitsThroughGap, m6 E14). */
      for (const entry of def.disassembly || []) {
        if (!entry.shrinksTo) continue;
        const tightM = doors.tightestOnRoute(row.fromZone);
        if (!Number.isFinite(tightM)) continue;
        const two = (d) => { const a = [d.x, d.y, d.z].sort((p, q) => p - q); return [a[0], a[1]]; };
        const [w0, h0] = two(def.dimensions);
        const [w1, h1] = two(entry.shrinksTo);
        const intact = fitsThroughGap(w0, h0, tightM);
        const off = fitsThroughGap(w1, h1, tightM);
        if (intact.fits) continue;   // an access NOTE is about what does not fit as it stands
        const legs = ROUTES_OF(row.fromZone);
        const doorId = legs.reduce((best, id) => (doors.hungClear(id) < doors.hungClear(best) ? id : best), legs[0]);
        const d = doorId ? doors.doorById(doorId) : null;
        prep.push({
          defId: def.id, name: wordsFor(e.id), part: entry.part,
          doorId: doorId || '', doorLabel: d ? d.label : String(doorId || ''), doorM: tightM,
          intactFits: intact.fits, intactClearance: intact.clearance,
          offFits: off.fits, offClearance: off.clearance,
          leafM: d && d.leaf ? d.leaf.t : 0,
        });
      }
    }
    const doorList = doors.records().filter((d) => d.leaf).map((d) => ({
      id: d.id, label: d.label, gap: d.gap, clear: doors.hungClear(d.id), from: d.from, to: d.to,
    }));
    const tightest = doorList.reduce((t, d) => (!t || d.clear < t.clear ? d : t), null);
    const legs = legsDriven(state);
    return {
      contractId: state.contractId,
      payout: ECONOMY.basePayout,
      estimateMin: state.estimateMs / 60000,
      legs,
      distanceKm: legs * ECONOMY.routeDistanceKm,
      manifest: { total: rows.length, byCategory, handling, heaviest },
      doors: doorList,
      prep,
      hazards: route.route.map((ev) => ({ type: ev.type, label: ev.label, at: ev.at })),
      tightest: tightest ? { id: tightest.id, label: tightest.label, clear: tightest.clear } : null,
      goals: {
        best: bestInvoice ? { profit: bestInvoice.profit, grade: bestInvoice.grade } : null,
        oneTrip: ECONOMY.oneTripBonus,
        roomAccuracy: ECONOMY.roomAccuracyBonus,
      },
      ...over,
    };
  }
  /** The doorway legs from a room to the truck (house.js ROUTES), [] for an unknown room. A
   *  declaration, not a const: briefFacts() runs at boot, above this line. */
  function ROUTES_OF(roomId) { return (HOUSE_ROUTES[roomId] || []).slice(); }

  function contractFacts(summary = manifestSummary(game.state.manifest)) {
    return {
      phase: game.state.phase,
      delivered: summary.delivered,
      total: summary.total,
      // Cargo the CONTRACT is about: a door leaf in the truck takes space (cargo.js counts
      // it) but it is not the customer's goods, so the panel's "in the truck" and the
      // objective line's "load N more" never count a fixture (M11).
      loaded: cargo.loadedEntities().filter((e) => e.manifest !== false).length,
      roomCorrect: summary.roomCorrect,
      /** M12: detached-part pieces not yet at the destination — rows these hold open. */
      piecesMissing: summary.piecesMissing || 0,
      elapsedMin: game.state.elapsedWorkMs / 60000,
      estimateMin: game.state.estimateMs / 60000,
      /** M13: which trip this is, and how many rows still need another one (manifest.js
       *  tripStatus — not on the truck, not at the destination, or a loose piece that is
       *  neither). The cab prompt reads the same function, so they cannot disagree. */
      trip: game.state.tripCount,
      away: tripStatus(game.state.manifest, registry).away,
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
    /* §27.4 / M12: how many loose pieces — detached parts and fragments — were not at the
     * destination when the job was called done. Written here the way worstCargoShift is
     * written by 'phase': a settlement fact, not a bus event. */
    if (game.state.telemetry && game.state.telemetry.counters) {
      game.state.telemetry.counters.piecesLeftBehind = summary.piecesLeft || 0;
    }
    const opts = {
      recoveries: recoveryCount(),
      collisions: 0,
      moverCount: movers.length,
      /* §15.3 (M26): how many people are playing, so the property line can name the seat
       * that was carrying — and say nothing at all when there is only one (§21.1). */
      seatCount,
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
    /* §22.5 "export event log and invoice inputs": the run's record, built from the same
     * invoice/review/stats the sheet shows (runLog.js buildRunSummary), stored compact in
     * the save (§27.4), handed to the sheet for the Copy button and the §27.3 form (M6). */
    const runSum = buildRunSummary(game.state, invoice, review, summary, stats, recorder,
      { date: new Date().toISOString(), walkthrough: walkthrough ? walkthrough.report() : null });   // walkthrough: M22
    storeRun(runSum);
    persist();
    invoiceScreen.show(invoice, review, summary, stats, {
      best: prevBest, isBest, runSummary: runSum, keptRuns: keptRuns.length,
      /* M24: the recap's words — entity ids to the words the prompts use, door ids to their
       * labels, player ids to seats — and the head's contract name. Lookups only; the recap
       * itself is built from runSum.events (invoiceScreen.js recapFrom). */
      nameOf: wordsFor, doorLabel: (id) => { const d = doors.doorById(id); return d ? d.label : String(id); },
      seatOf: seatOfPlayer, contractId: game.state.contractId,
    });
    /* §13.4 / §21.2 (M31): the brief's goal line is "beat your best", and the best was just
     * decided. briefFacts() is pure and reads bestInvoice, so re-feeding the card here is the
     * whole fix for M24 gap 5 — the goal line used to change only at the NEXT boot, because
     * the title is read once and never re-shows in a session. Called from the two places the
     * facts can change (here and at the end of resetContract), never per frame: it walks the
     * manifest, the registry and the door table. */
    title.setBrief(briefFacts());
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
  function resetContract(opts = {}) {   // opts.keepLoadout: M24 (§21.2 "optionally preserves loadout")
    /* The run's record is taken FIRST — before the unwind below emits its own GRIP_ENDED
     * 'contract reset' and STRAP_CHANGED 'released' events — and closed on the recorder just
     * before game.reset() replaces the counters (M6, runLog.js closeRun). A settled run keeps
     * the sheet's summary with whatever the tester answered; a run abandoned from the pause
     * card is summarised live, invoice null, so §27.4's "restart" is on record either way. */
    const closing = invoiceScreen.report() || liveRunSummary();
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
    /* §26.6 "reset removes … FRAGMENTS" (M12), inside this same unwind — after the grips
     * and straps that might hold a piece have let go, before the counters are read and the
     * state goes. Every detached part is put back THROUGH reassemble() with `force`, which
     * gathers its pieces from wherever they were lost (a replay starts whole — the guard
     * M2 wrote about still holds: the collider comes back only through the real call), and
     * every broken item's fragments are removed. The sweep after it is belt and braces:
     * nothing with partOf/fragmentOf may survive a reset, or the registry grows by a leg
     * per run (m14 S1/S7). */
    for (const e of [...registry.entities.values()]) {
      if (e.state.partOf || e.state.fragmentOf) continue;
      for (const p of [...(e.state.removedParts || [])]) reassemble(registry, e, p, { force: true });
      clearFragments(registry, e);
      if (e.state.parts) e.state.parts = {};
    }
    for (const e of [...registry.entities.values()]) {
      if (e.state.partOf || e.state.fragmentOf) registry.remove(e.id);
    }

    // The record closes here, after the unwind and before the state goes (see the top).
    finishRun(closing);
    recorder.closeRun(closing);
    invoiceScreen.clearRun();
    cargoShift.snapshot = null;
    cargoShift.event = null;   // M17: an event window never crosses a reset
    recoveriesSeen.clear();
    noticeHistory.length = 0;   // M19: the new run's 'What happened' starts empty
    /* M26: and the notices on screen go with it. They expire against the SIM clock, which
     * game.reset() below puts back to zero, so a notice raised at 4:12 of the last run would
     * outlive every clock it could be measured by. The queue too — a notice raised for a run
     * that no longer exists has nothing to say about this one. */
    pendingNotices.length = 0;
    for (const h of huds) h.clearNotices();
    game.reset();
    // AFTER game.reset(): the damage system reads game.state through a getter, so this
    // clears the NEW run's ledger and windows rather than the state just thrown away.
    damage.reset();
    cargo.tripCount = game.state.tripCount;   // M13: trip 1 again (route.reset() above is the heading)
    attachDoorState();        // M11: the new run has removed no door yet

    // Re-attach what the fresh state does not know about.
    game.state.manifest = buildManifest(PHASE5_SPAWNS);
    fillFromZones(game.state.manifest);   // M8: fromZone again, on the rebuilt rows
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
      t.state.recoveries = 0;      // M15: recoveries are billed per run, tools included
      t.state.outOfBoundsMs = 0;
    }
    PHASE6_TOOL_SPAWNS.forEach((s, i) => {
      const t = [...tools.tools.values()][i];
      if (!t) return;
      /* §21.2 "optionally preserves loadout" (M24): with { keepLoadout } from the sheet's
       * checkbox, a tool that is INSIDE the cargo box stays where it is for the next run
       * (dynamic, ordinary groups, velocity zeroed — everything but the teleport home). The
       * straps are gone regardless: they bound cargo that is back in the house. */
      const p = t.body.translation();
      const keep = !!(opts.keepLoadout && insideCargo({ x: p.x, y: p.y, z: p.z }));
      t.body.setBodyType(physics.R.RigidBodyType.Dynamic, true);
      /* AND THE COLLISION GROUP. A carried tool is kinematic in `toolCarried`, which collides
       * with nothing including the ground (world.js); restoring the body type without the
       * group — which is what this did until M2 — sent a tool held when "Run it again" was
       * pressed through the floor for ever (tools have no §18.3 recovery). The sibling of the
       * Q put-down bug M1 fixed in interact._putDown. */
      t.collider.setCollisionGroups(GROUP_PRESETS.object);
      if (!keep) {
        t.body.setTranslation({ x: s.x, y: s.y, z: s.z }, true);
        t.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      }
      t.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      t.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      t.body.wakeUp();
    });
    physics.primeQueries();
    resetStallHint();          // once per RUN: the new contract gets its own first minute
    if (walkthrough) walkthrough.arm();   // M22: the cards too, unless this browser has seen them
    /* M31: and the brief again, over the contract that now exists — the manifest was rebuilt,
     * the doors were rehung and the route was reset above, so the facts are gathered from the
     * new run rather than from the one that just ended. Same seed, so every fact but the goal
     * line reads exactly as it did at boot (m38 F2). */
    title.setBrief(briefFacts());
    game.setPhase(PHASES.PICKUP);
  }

  invoiceScreen.onReplay = (opts = {}) => {
    invoiceScreen.hide();
    resetContract(opts);   // { keepLoadout } from the sheet's checkbox (M24, §21.2)
    game.setPaused(false);
    hud.notice('new contract', 'good');
  };

  function recoveryCount() {
    let n = 0;
    for (const e of registry.entities.values()) n += e.state.recoveries || 0;
    for (const m of movers) n += m.controller.recoveries || 0;
    n += tools.recoveryCount();   // M15: a lost tool is a callout too
    return n;
  }
  /** The same tally split by what was lost — the overlay's 'lost' row (M15, §22.5). Every
   *  kind sums to recoveryCount(), which is what the invoice bills. */
  function recoveriesByKind() {
    const k = { movers: 0, objects: 0, fixtures: 0, pieces: 0, tools: 0, total: 0 };
    for (const m of movers) k.movers += m.controller.recoveries || 0;
    for (const e of registry.entities.values()) {
      const n = e.state.recoveries || 0;
      if (e.state.partOf || e.state.fragmentOf) k.pieces += n;
      else if (e.manifest === false) k.fixtures += n;
      else k.objects += n;
    }
    k.tools = tools.recoveryCount();
    k.total = k.movers + k.objects + k.fixtures + k.pieces + k.tools;
    return k;
  }
  /** The run so far, from live state — no invoice yet (M6, runLog.js). */
  function liveRunSummary() {
    const summary = manifestSummary(game.state.manifest);
    const stats = contributionStats(game.state, {
      strapsPlaced: strapsPlacedTotal, recoveries: recoveryCount(), heaviestMoved: heaviestMoved(),
    });
    return buildRunSummary(game.state, null, null, summary, stats, recorder,
      { date: new Date().toISOString(), walkthrough: walkthrough ? walkthrough.report() : null });   // walkthrough: M22
  }
  /** What the Copy button would export right now: the settled record with the live §27.3
   *  answers, or the run so far. */
  function runSummary() { return invoiceScreen.report() || liveRunSummary(); }
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
    /* And the house's doors back on their hinges (M11) — wherever a leaf got to: the truck,
     * the grass, the bedroom floor. Like the tools, they are teleported home, so the M2
     * soak's counters stay equal run to run (m14 S4/S5, m19 D7). */
    doors.rehangAll('contract reset');
    doorsAnnounced = false;   // M23: the next run's first step announces the hung leaves again
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
    /* M33: the manifest card RELEASED the lock itself, so the cursor could reach its filter
     * chips — that release is not a swallowed Escape and must not pause. The card pauses
     * nothing by design (§2.2, and m40 N4 asserts the clock kept advancing under it). */
    if (manifestScreen.open) return;
    game.setPaused(true);
  };
  canvas.addEventListener('click', () => {
    audio.arm();   // the pointer-lock click is a gesture: arm or resume (M9)
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
    audio.arm();   // any key is a gesture: arm or resume (M9)
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
    /* M24: while the settlement's major lines are still landing, ANY pad button on any seat
     * lands them all (§21.2 skip; Space/Enter/click are the sheet's own). The press is spent
     * here — the pause edge it may also have raised is consumed too, so a Menu press that
     * skipped the reveal does not unpause the game under the sheet. */
    if (invoiceScreen.revealing) {
      let skipped = false;
      for (let s = 0; s < seatCount; s++) {
        for (const b of Object.values(PAD)) if (input.consumeShellButton(s, b)) skipped = true;
        if (skipped) input.consumeShellEdge('pause', s);
      }
      if (skipped) { invoiceScreen.skipReveal(); return; }
    }
    for (let s = 0; s < seatCount; s++) {
      /* A pad Menu (or seat 1's Esc) can pause while seat 0's mouse is still captured, which
       * leaves the card up with no cursor to click it — release the lock when the toggle
       * lands on PAUSED (the Esc path already lost it to Chrome; review minor, M3). */
      if (input.consumeShellEdge('pause', s)) { if (game.togglePause()) input.releasePointerLock(); }
      /* §21.2's manifest card (M33), on a bound action for the same reason `pause` is one: a
       * pad-only player must be able to open it (§4.4), and the shell edge is the buffer that
       * survives a paused clock. The card yields to every pause-shaped screen, so a press
       * under the pause card or the settlement sheet opens something nobody would see — the
       * pause card's own button is the route from there. */
      if (input.consumeShellEdge('manifest', s) &&
          !pauseScreen.visible && !invoiceScreen.visible && !settingsPanel.open) manifestScreen.toggle();
      if (input.consumeShellButton(s, COOP.joinPad)) toggleSeats();
    }
  });

  /** §26.7 "identify the next objective without coaching" / §21.1 "compact objective count":
   *  ONE line (hud.js setObjective), from the phase machine and the truck, so it can never
   *  disagree with the contract panel above it. Device-neutral on purpose — it names the
   *  PLACE, and the prompt under the reticle names the key when you get there. */
  function objectiveFor(facts, routeStatus) {
    const trip = facts.trip || 1;
    const away = facts.away || 0;
    switch (facts.phase) {
      case PHASES.PICKUP: {
        const left = facts.total - facts.delivered - facts.loaded;
        // M13: back at the house for more — the player knows where the truck is by now.
        if (trip > 1) return left > 0 ? `trip ${trip} — load ${left} more, or drive from the cab` : `trip ${trip} — all aboard, drive from the cab`;
        if (facts.loaded === 0) return 'carry a box to the truck out front';
        return left > 0 ? `load ${left} more, or drive from the cab` : 'all aboard — drive from the cab';
      }
      case PHASES.TRANSIT: {
        const driving = routeStatus && routeStatus.state === 'driving';
        const back = routeStatus && routeStatus.heading === 'back';   // M13
        if (!driving) return back ? 'heading back' : 'on the road';
        const where = routeStatus.event || Math.round(routeStatus.progress * 100) + '% there';
        return back ? `heading back — ${where}` : `on the road — ${where}`;
      }
      case PHASES.DELIVERY: {
        const left = facts.total - facts.delivered;
        // M12: an item whose legs are elsewhere is not delivered; the line says why (§26.7).
        const parts = facts.piecesMissing > 0 ? ` — ${facts.piecesMissing} loose part${facts.piecesMissing === 1 ? '' : 's'} still to bring in` : '';
        /* M13: with the truck empty and nothing left at the site to carry in, what is left
         * is at the old house — the line names §3.4's choice, and the cab prices it. */
        // Truck empty and anything still away: rows already at the site settle on their own (review
        // minor, Phase 21) — the drive back is the only thing left to DO.
        if (facts.loaded === 0 && away > 0) return `drive back for ${away} more, or settle up at the cab${parts}`;
        return left > 0 ? `unload — ${left} left, each to its room${parts}` : 'all delivered — settle up at the cab';
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
  /* ---- what the audio layer hears (M9) --------------------------------------------------
   * §22.4 keeps the route, the pack quality, the carried mass and a dolly's speed OUT of
   * game.state, so the pure mix gets them as a read-only VIEW of plain numbers built here
   * each render frame, plus one listener per seat: feet position, the rig's flat facing (for
   * the caption's arrow and the pan) and whether those ears are outdoors (no roof zone at
   * either site — the kerbside aprons are zones too, so "in a zone" is not "indoors"). */
  const indoorAt = (p) => {
    const z = zoneAt(p, ZONES) || zoneAt(p, DEST_ZONES);
    return !!(z && z.maxY !== undefined && Math.abs(z.maxY - HOUSE_ROOM.wallH) < 1e-6);
  };
  function audioListeners() {
    const out = [];
    for (let s = 0; s < seatCount; s++) {
      const m = moverOfSeat(s);
      const p = m.controller.position;
      const f = m.rig.forwardFlat();
      out.push({ seat: s, x: p.x, y: p.y, z: p.z, fx: f.x, fz: f.z, outdoors: !indoorAt(p) });
    }
    return out;
  }
  function audioWorld() {
    const dollies = [];
    for (const t of tools.tools.values()) {
      if (t.def.effect !== 'friction' || !t.state.attachedTo) continue;
      const e = registry.get(t.state.attachedTo);
      if (!e) continue;
      const v = e.body.linvel(), p = e.body.translation();
      dollies.push({ id: e.id, x: p.x, y: p.y, z: p.z, speed: Math.hypot(v.x, v.z) });
    }
    return {
      nowMs: game.clock.simTimeMs,
      route: route.status(),
      pack: cargo.packQuality(),
      carries: movers.map((m) => ({ id: m.id, mass: m.controller.carriedMass, imbalance: m.controller.imbalance })),
      dollies,
      /** Where an entity, a tool or a mover is right now — for a cue that names one. */
      positionOf: (id) => {
        const e = registry.get(id);
        if (e) { const t = e.body.translation(); return { x: t.x, y: t.y, z: t.z }; }
        const tool = tools.get(id);
        if (tool && tool.body) { const t = tool.body.translation(); return { x: t.x, y: t.y, z: t.z }; }
        const m = movers.find((mv) => mv.id === id);
        if (m) { const p = m.controller.position; return { x: p.x, y: p.y, z: p.z }; }
        return null;
      },
    };
  }
  /** The render loop's audio call, in one place so a suite can make it too (m18 A8/A12). */
  function audioFrame(dt = 1 / 60) { return audio.update(game.state, audioWorld(), audioListeners(), dt); }

  function feedHuds(rects = layoutFor(seatCount, canvas.clientWidth || 0, canvas.clientHeight || 0)) {
    settleDevices();
    const summary = manifestSummary(game.state.manifest);
    const packQuality = cargo.packQuality();
    const routeStatus = route.status();
    const contractPanel = contractFacts(summary);
    const objective = objectiveFor(contractPanel, routeStatus);
    // §21.4 Hearing: the last cue's caption, per seat with that seat's own direction arrow.
    const caption = audio.lastCaption(game.clock.simTimeMs);

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
      if (caption) {
        const p = me.controller.position, f = me.rig.forwardFlat();
        h.setCaption(caption.text, caption.position
          ? directionGlyph({ x: p.x, z: p.z, fx: f.x, fz: f.z }, caption.position) : '');
      } else {
        h.setCaption('');
      }
    }
    if (walkthrough) walkthrough.refresh();   // M22: the card's glyphs follow the shown device
  }

  /**
   * The notice drain, in ONE function the render loop and a suite can both call (the loop
   * never runs under headless Chrome — 1-3 rAF callbacks total). A notice with no seat
   * belongs to the contract, not to a person, so everyone sees it; a seat notice reaches its
   * seat. Each queued notice that is shown is ONE history entry (M19 — a broadcast is one
   * line, stamped with the sim time it went up), bounded to DEBUG.historyLen.
   */
  function drainNotices() {
    while (pendingNotices.length) {
      const n = pendingNotices.shift();
      const broadcast = n.seat === undefined || n.seat === null;
      if (broadcast) {
        for (let s = 0; s < seatCount; s++) huds[s].notice(n.text, n.kind);
      } else if (n.seat < seatCount) {
        huds[n.seat].notice(n.text, n.kind);
      } else {
        continue;   // addressed to a seat nobody is in: not shown, so not history
      }
      noticeHistory.push({ text: n.text, kind: n.kind || 'info', seat: broadcast ? null : n.seat, tMs: game.clock.simTimeMs });
      if (noticeHistory.length > DEBUG.historyLen) noticeHistory.splice(0, noticeHistory.length - DEBUG.historyLen);
    }
    for (let s = 0; s < seatCount; s++) huds[s].tickNotices();
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
    shakeFrame();   // M16: a knockdown this frame nudges its own seat before the rigs solve
    for (let s = 0; s < seatCount; s++) {
      const me = moverOfSeat(s);
      me.rig.update(game.state.players[me.id].position, dt);
      applyAspect(me.camera, rects[s]);
    }
    // The HUD text — prompt glyphs, objective, contract, cargo, route — in the one function
    // the suites can call too (feedHuds, above). Cameras first, so the prompt reads this
    // frame's aim.
    feedHuds(rects);
    // The audio layer, on the render frame after the HUD feed (M9): drains the cue queue,
    // ramps the beds. READS state, world and listeners; writes only to audio nodes.
    audioFrame(dt);
    divider.update(rects);

    drainNotices();

    const seatList = Array.from({ length: seatCount }, (_, s) => moverOfSeat(s));
    // M29: the blobs are a gpu-tier feature, and the tier can now change while the game runs.
    if (blobs && liveTier === 'gpu') blobs.update(blobSources(), blobProbe, seatList.map((m) => m.camera));
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
      lost: recoveriesByKind(),   // M15: §18.3 callouts this run, by kind

      // §5.1/§5.2 made visible: what you are holding, how close to falling over, how tired.
      // Both movers, so you can see what the one you are NOT driving is doing (§6.4).
      carry: movers.map((m, i) => {
        const s = seatOfMover(i);
        return `${s >= 0 ? (seatCount > 1 ? 'P' + (s + 1) : '>') : ' '}${m.id} ` +
          `${m.controller.carriedMass.toFixed(0)}kg ` +
          `x${m.controller.loadSpeedMult.toFixed(2)} bal ${m.controller.imbalance.toFixed(2)}`;
      }).join('  ·  '),
      // M16: the camera shake offset per seat, in millimetres, and whether the switch is on.
      shake: Array.from({ length: seatCount }, (_, s) => {
        const r = moverOfSeat(s).rig;
        return `${seatCount > 1 ? 'P' + (s + 1) + ' ' : ''}${(r.shakeMagnitude() * 1000).toFixed(1)} mm` +
          `${r.shakeEnabled ? '' : ' (off)'}${r.shakeClamped ? ' clamped' : ''}`;
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
    /* M29: the tier the scene is lit for RIGHT NOW (renderTier above is the boot's, which the
     * texture set was minted from), the live switch itself, and the help line's measured wrap —
     * the one number the bottom-edge panels are placed from. */
    get qualityTier() { return liveTier; },
    applyQualityTier, shadowMapCount, syncHelpMetrics,
    get helpMetrics() { return { ...helpMetrics }; },
    /* M14: the property-damage decal ring and the static colliders with their tags. */
    scuffs, statics,
    present: (cam) => {
      const w = canvas.clientWidth || 0, h = canvas.clientHeight || 0;
      const list = cam ? [{ camera: cam }] : Array.from({ length: seatCount }, (_, s) => moverOfSeat(s));
      const rs = layoutFor(cam ? 1 : seatCount, w, h);
      if (blobs && liveTier === 'gpu') blobs.update(blobSources(), blobProbe, list.map((m) => m.camera));
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
    /* Camera shake (M16): the boot's prefers-reduced-motion reading, the render loop's
     * knockdown source and which mover is the recorded driver — so a suite can drive one
     * frame of it headlessly (m24). */
    reducedMotion, shakeFrame, shakeDriver: () => shakeDriver.mover,
    /* §8.4's haptic pulse (M28): the layer itself, and the ONE driving-seat answer the shake
     * and the rumble share — m35 H2 asserts the pad that buzzed is the seat this returned. */
    haptics, roadShakeSeat,
    /* The notice queue and the contract panel's facts, because the render loop that drains
     * one and feeds the other never runs under headless Chrome (1-3 rAF callbacks total). A
     * suite asserts the 'arrived' notice and the phase word through these. */
    pendingNotices, contractFacts,
    /* The HUD feed, the objective line, the debounced device per seat and the stall timer
     * (M5): the render loop never runs under headless Chrome, so a suite feeds the HUD the
     * way the loop does and reads back what it showed (m11 O, m12 K). */
    feedHuds, objectiveFor, shownDevice: (s) => shownDevice[s], stallHint, resetStallHint,
    /* M19: the notice drain the loop runs (so a suite can run it too), the pause card's
     * history ring it feeds, and whether ?hc=1 forced high contrast at this boot. */
    drainNotices, noticeHistory, hcForced,
    /* M22: the first-minute cards — shell state a suite reads and drives (m29). */
    walkthrough,
    /* M33: §21.2's manifest card — shell state a suite reads and drives (m40). */
    manifestScreen,
    /* The §26.6 reset and the per-run recovery tally, so a soak can replay without going
     * through the settlement sheet and assert what the invoice will be told (M2). */
    resetContract, recoveryCount,
    /* M24: §21.2's brief, as the facts the title card rendered (m31 B1 asserts each against
     * state and config; the card re-renders from a synthetic set to pin the goal line). */
    briefFacts,
    recoveriesByKind,   // M15: the overlay's 'lost' row, for m23
    /* The house's doors (M11): the leaves, the live hung predicate, the effective clear
     * widths and the reset re-hang, so a suite can take a door off and measure the opening. */
    doors,
    /* §27.4 instrumentation (M6): the run recorder, the run summary the Copy button exports,
     * the §27.3 questionnaire and the kept runs the save holds. */
    recorder, runSummary, buildRunSummary,
    /* §20.4 / §21.4 Hearing (M9): the audio layer, the render loop's call to it and the two
     * views it reads — so a suite can drive one frame of it headlessly (m18). */
    audio, audioFrame, audioWorld, audioListeners,
    get questionnaire() { return invoiceScreen.questionnaire; },
    get keptRuns() { return keptRuns.slice(); },
    clearRuns,
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
