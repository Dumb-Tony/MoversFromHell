/* Phase 0 diagnostic scene — GDD §20.4, §25.2 phase 0 ("standalone launch, scene").
 *
 * §20.4: "Prototype visuals are diagnostic: simple meshes, color separation, contact
 * shadows, and faithful collision." This scene is built to be MEASURED, not admired.
 *
 * It is not the Phase 5 house. It is the smallest thing that makes the central spatial
 * question visible on day one: a 2.1m couch, three doorways at 0.82 / 0.86 / 0.91 m, and a
 * metre grid to read them against. §26.2 requires that a couch-equivalent can be "rotated
 * through a door"; putting that geometry on screen in Phase 0 means every later phase is
 * judged against the real clearance instead of a guess. See APERTURES below — for one of
 * those three doors the answer is that it cannot, and that is the interesting one.
 *
 * COLLIDERS ARE THE SHARED RECORD. The same AABB list feeds the camera's occlusion test
 * now and static collision later. §8.1: "decorative collision must not contradict the
 * visible surface" — one record is how that stays true. Pattern from
 * AirportBaggageCrew\src\data\airport.js (Dev\INDEX.md → "Map as pure data").
 */

/** Real dimensions, metres. §7.1 gives couch_3seat_01 as 2.1 x 0.9 x 0.85 explicitly. */
export const REFERENCE_DIMS = Object.freeze({
  movingBox:   { x: 0.50, y: 0.50, z: 0.50, mass: 12,  label: 'box 0.5m' },
  couch3Seat:  { x: 2.10, y: 0.85, z: 0.90, mass: 90,  label: 'couch 2.1m (GDD §7.1)' },
  dresser:     { x: 1.10, y: 0.85, z: 0.50, mass: 55,  label: 'dresser 1.1m' },
  doorwayHeight: 2.03,
  moverHeight: 1.80,
});

/* THE CENTRAL CLEARANCE FACT, measured from the GDD's own numbers.
 *
 * couch_3seat_01 (§7.1) has a 0.90 x 0.85 m cross-section. A rigid box passes a slot of
 * width g if and only if min over theta of (w*|cos| + h*|sin|) <= g, and that minimum is
 * just min(w, h) — every interior angle is worse than both endpoints. So the couch's
 * narrowest possible presentation is 0.850 m, in EVERY rotation, forever.
 *
 *   32" interior door  0.82 m  ->  IMPOSSIBLE. Short by 30 mm. §8.2's remove-the-door or
 *                                  unscrew-the-legs is not a shortcut here, it is the
 *                                  only solution — which is exactly §3.3's "preparation
 *                                  versus brute force" with the brute-force branch shut.
 *   34" door           0.86 m  ->  passes on its side, 10 mm to spare. Terrifying.
 *   36" front door     0.91 m  ->  passes on its side with 60 mm; face-on by 10 mm.
 *
 * All three are built into the Phase 0 wall so the relationship is measurable on day one
 * rather than discovered at Phase 5. tools\m0-tests.js asserts each case.
 */
export const APERTURES = Object.freeze([
  { id: 'interior32', gap: 0.82, label: '32" interior', x: -3.2 },
  { id: 'door34',     gap: 0.86, label: '34" door',     x:  0.0 },
  { id: 'front36',    gap: 0.91, label: '36" front',    x:  3.2 },
]);

/* ── Phase 1 test geometry ───────────────────────────────────────────────────────────
 * §25.2's Phase 1 gate is "responsive INDOORS and ON RAMP", so both have to exist before
 * locomotion can be judged. Every piece below is a SPEC, not a mesh: the renderer builds
 * geometry from it and the physics world builds colliders from the same record, so §8.1's
 * "decorative collision must not contradict the visible surface" holds by construction
 * rather than by discipline.
 *
 * Heights are chosen against the controller tuning in config.js, so each piece tests a
 * specific behaviour rather than being decorative:
 *   porch step 0.18  — under PLAYER.stepHeight (0.35): autostep, no jump needed
 *   ledge      0.60  — over mantleMinHeight (0.45): a real mantle
 *   ledge      1.25  — under mantleMaxHeight (1.35): the tallest legal mantle
 *   wall       1.60  — over mantleMaxHeight: must REFUSE to mantle
 */

/** Ramp up to the platform. Rotating a box about +X tips its +Z end DOWN, so this rises
 *  toward -Z. angle 0.28 rad = 16 deg, comfortably under maxSlopeClimbDeg (48). */
export const RAMP = Object.freeze({
  x: 7.5, z: 2.4, width: 3.0, length: 4.35, thickness: 0.25, angleRad: 0.28, y: 0.72,
});

/** Landing at the top of the ramp. */
export const PLATFORM = Object.freeze({ x: 7.5, y: 1.2, z: -1.6, width: 3.0, depth: 3.0, thickness: 0.24 });

/** Boxes to walk up (autostep) and to mantle (climb). `expectMantle` is what the Phase 1
 *  suite asserts, so this table is the test fixture as well as the level. */
export const OBSTACLES = Object.freeze([
  { id: 'porchStep', x: -1.2, z: 3.4, w: 2.0, d: 0.9, top: 0.18, expectMantle: false, note: 'autostep clears it' },
  { id: 'ledgeLow',  x: -4.6, z: 0.2, w: 1.6, d: 1.2, top: 0.60, expectMantle: true,  note: 'lowest real mantle' },
  { id: 'ledgeHigh', x: -6.8, z: 0.2, w: 1.6, d: 1.2, top: 1.25, expectMantle: true,  note: 'tallest legal mantle' },
  { id: 'tooTall',   x: -9.0, z: 0.2, w: 1.6, d: 1.2, top: 1.60, expectMantle: false, note: 'above mantleMaxHeight' },
]);

/** A closed room behind the aperture wall — the "indoors" half of the gate, and the place
 *  §4.1's "indoors it should compress smoothly" camera behaviour gets exercised. */
/* ROOM now LIVES IN world/house.js and is re-exported here.
 *
 * Phase 5 subdivides this shell into three rooms, so the shell and its partitions have to
 * be one record — house.js needs the bounds to place partitions, and this file needs the
 * partitions to build them. Defining ROOM here and importing it there made a genuine import
 * cycle: scene.js would evaluate house.js first, which would read ROOM before this line had
 * run, and get a temporal-dead-zone error rather than a value.
 *
 * The re-export keeps `import { ROOM } from '.../scene.js'` working for everything written
 * against Phases 0-4, including m1's room assertions. One record, one direction of import.
 */
export { ROOM } from '../world/house.js';
import { ROOM, PARTITIONS, INTERIOR_DOORS, PARTITION_T, wallSegments } from '../world/house.js';
import { cargoColliders, cargoAnchors, cabColliders } from '../world/truck.js';
import {
  DEST_SHELL, DEST_ZONES, DEST_PARTITIONS, DEST_DOORS, destColliders,
} from '../world/destination.js';
import {
  tiled, texGrass, texAsphalt, texConcrete, texSky, texSiding, texShingle, texPlaster,
  texBoards, texBrick, texTruckSide, texTruckWall, texTruckDeck, texSteel, lambert,
} from './textures.js';

/** Narrowest presentation of a w x h cross-section over all rotations. See above. */
export function minProjectedWidth(w, h) { return Math.min(w, h); }

/** Can a w x h cross-section pass an aperture of `gap` width? Pure geometry, no physics —
 *  which is why it is assertable in Phase 0, before a solver exists. */
export function fitsThroughGap(w, h, gap) {
  return { fits: minProjectedWidth(w, h) <= gap, faceOn: w <= gap, clearance: gap - minProjectedWidth(w, h) };
}

const PALETTE = {
  grass:    0x6f8f4a,
  asphalt:  0x4a4a52,
  wall:     0xd8cfbe,
  trim:     0x8a7f6d,
  couch:    0x8a5a4a,
  dresser:  0x9a7a4e,
  box:      0xc2a06a,
  floor:    0xb9a98c,
  reference:0xa8d93a,          // the Dirty Boy Devs lime — measuring aids, and "this fits"
  impossible:0xff5a5a,         // coral — "the couch cannot pass this, in any rotation"
};

/**
 * @returns {{scene, colliders, spawn, dispose}}
 *   colliders: {minX,maxX,minZ,maxZ,base,top,tag}[] — shared with camera + physics
 *   spawn: where the player starts (Phase 1)
 */
export function buildScene() {
  const THREE = window.THREE;
  const scene = new THREE.Scene();
  // fog is set with the sky, below, so the two cannot disagree about the horizon colour

  const colliders = [];
  // `friction` is optional and is carried THROUGH to the physics collider. It was dropped
  // here at first, so the truck deck's 0.32 never reached the solver and an unstrapped pack
  // survived a hard brake with a 2 mm shift.
  const addCollider = (cx, cz, sx, sz, base, top, tag, friction) => {
    colliders.push({
      minX: cx - sx / 2, maxX: cx + sx / 2,
      minZ: cz - sz / 2, maxZ: cz + sz / 2,
      base, top, tag,
      ...(friction !== undefined ? { friction } : {}),
    });
  };

  /* ---- lighting: a time of day, rather than an even fill --------------------------------
   * §20.1 still governs — silhouettes and clearances must read — but "bright and even" was
   * doing that by removing all directional information, which is most of why the build
   * photographed like a CAD viewport. A low afternoon sun gives every object a long shadow
   * that says where it is on the ground, which is exactly the depth cue you need when
   * judging whether a couch is going to clear a door frame. */
  const hemi = new THREE.HemisphereLight(0xbcd8ee, 0x6b6350, 0.62);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe9c4, 1.32);
  sun.position.set(16, 17, 11);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const d = 26;
  sun.shadow.camera.left = -d; sun.shadow.camera.right = d;
  sun.shadow.camera.top = d;   sun.shadow.camera.bottom = -d;
  sun.shadow.camera.near = 1;  sun.shadow.camera.far = 80;
  sun.shadow.bias = -0.0007;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  scene.add(sun.target);
  // A cool bounce from the opposite side, so shadowed faces are readable rather than black.
  const fill = new THREE.DirectionalLight(0x9fc0e0, 0.30);
  fill.position.set(-12, 9, -14);
  scene.add(fill);

  const mat = (color, opts = {}) => lambert(color, opts);
  /** A textured surface. `rx`/`ry` are repeats, normally metres × a density. */
  const surf = (tex, rx, ry, opts = {}) =>
    new THREE.MeshLambertMaterial({ map: tiled(tex, Math.max(0.25, rx), Math.max(0.25, ry)), ...opts });

  /* The house's outward skin. BoxGeometry indexes materials [+X, -X, +Y, -Y, +Z, -Z], and
   * the aperture wall's DRIVEWAY side is +Z — so siding goes at index 4 and plaster at 5.
   * Getting it the wrong way round clads the living room and plasters the front elevation. */
  const extSiding = surf(texSiding(34, 0.62), 5, 1.6);
  const intPlaster = surf(texPlaster(38, 0.84), 3, 1.4);
  const frontWallMats = [intPlaster, intPlaster, intPlaster, intPlaster, extSiding, intPlaster];
  const gardenBrick = surf(texBrick(18), 2, 1);

  /* ---- sky ------------------------------------------------------------------------------
   * An inverted sphere with a gradient on it. The scene used to end at a flat clear colour,
   * which reads as "unfinished" the instant you look up — and you look up constantly in a
   * game about carrying tall things. The fog colour is taken from the gradient's horizon
   * band so the two meet without a seam. */
  /* The fog colour and the sky's horizon stop are the SAME VALUE, deliberately. They were
   * 0xdfe9ee and #e2ebef — three points apart, and enough to draw a bright line along the
   * whole horizon where the fogged ground met the dome. */
  const HORIZON = 0xdfe9ee;
  scene.fog = new THREE.Fog(HORIZON, 40, 150);
  const sky = new THREE.Mesh(
    // ⚠ RADIUS MUST STAY UNDER RENDER.far (300 m). At 400 the dome was outside the far
    // plane and got clipped, which paints a hard diagonal edge of clear colour across the
    // top of the frame — it reads as a rendering glitch, not as a missing sky.
    new THREE.SphereGeometry(240, 32, 20),
    new THREE.MeshBasicMaterial({ map: texSky(), side: THREE.BackSide, fog: false }));
  scene.add(sky);

  // ---- ground ------------------------------------------------------------------------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), surf(texGrass(), 100, 100));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Driveway — the §13.1 parking surface, and the flat run a dolly needs (§9.1).
  const drive = new THREE.Mesh(new THREE.PlaneGeometry(6, 14), surf(texAsphalt(), 3, 7));
  drive.rotation.x = -Math.PI / 2;
  drive.position.set(0, 0.01, 7);
  drive.receiveShadow = true;
  scene.add(drive);

  // A concrete path from the driveway to the front door, and a kerb along the street end.
  const path = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 4.2), surf(texConcrete(), 1, 3));
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, 0.012, -0.9);
  path.receiveShadow = true;
  scene.add(path);

  /* ⚠ THE METRE GRID IS NOW OFF BY DEFAULT.
   *
   * It has been in the scene since Phase 0, and it earned its place — it is the only way to
   * judge whether a 2.10 m couch LOOKS 2.10 m, and several tuning decisions were made by
   * counting squares. It is also, on its own, the single loudest "this is a dev scene"
   * signal in the build: nothing that ships has a metre grid painted on the lawn.
   *
   * So it stays, wired to F3 beside the stats overlay, where it is a measuring instrument
   * rather than scenery. Returned on the scene handle so main.js can toggle it. */
  const grid = new THREE.GridHelper(60, 60, 0x000000, 0x000000);
  grid.material.opacity = 0.14;
  grid.material.transparent = true;
  grid.position.y = 0.02;
  grid.visible = false;
  scene.add(grid);

  // ---- the doorway wall: the whole game in one piece of geometry ----------------------
  // Three apertures at 0.82 / 0.86 / 0.91 m, with a 2.10 m couch parked in front of them.
  // §26.2's acceptance criterion is that a couch-equivalent can be "rotated through a
  // door"; APERTURES above records which of these three that is actually true for.
  const WALL_T = 0.18, WALL_H = 2.7, WALL_Z = -2.0;
  const DOOR_H = REFERENCE_DIMS.doorwayHeight;
  const headerH = WALL_H - DOOR_H;

  // Wall runs between and either side of the apertures, built from the gaps themselves so
  // the visible surface and the collider can never disagree (§8.1).
  const edges = [];
  for (const a of APERTURES) edges.push([a.x - a.gap / 2, a.x + a.gap / 2]);
  edges.sort((p, q) => p[0] - q[0]);
  const WALL_MIN = edges[0][0] - 3.0, WALL_MAX = edges[edges.length - 1][1] + 3.0;

  const segments = [];
  let cursor = WALL_MIN;
  for (const [lo, hi] of edges) { segments.push([cursor, lo]); cursor = hi; }
  segments.push([cursor, WALL_MAX]);

  for (const [lo, hi] of segments) {
    const w = hi - lo;
    if (w <= 1e-6) continue;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_H, WALL_T), frontWallMats);
    m.position.set((lo + hi) / 2, WALL_H / 2, WALL_Z);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    addCollider((lo + hi) / 2, WALL_Z, w, WALL_T, 0, WALL_H, 'wall');
  }

  for (const a of APERTURES) {
    // Header, so each opening is a real 2.03 m aperture and not a floor-to-ceiling slot.
    const hd = new THREE.Mesh(new THREE.BoxGeometry(a.gap, headerH, WALL_T), frontWallMats);
    hd.position.set(a.x, DOOR_H + headerH / 2, WALL_Z);
    hd.castShadow = true;
    scene.add(hd);
    addCollider(a.x, WALL_Z, a.gap, WALL_T, DOOR_H, WALL_H, 'doorHeader');

    // Jambs in the lime reference colour: the clearance is the thing being measured.
    // Green jamb = the couch fits through it, coral = it does not. Colour-independent
    // redundancy comes later with labels (§21.4); at Phase 0 this is a dev aid only.
    const passes = fitsThroughGap(REFERENCE_DIMS.couch3Seat.z, REFERENCE_DIMS.couch3Seat.y, a.gap).fits;
    const jambColor = passes ? PALETTE.reference : PALETTE.impossible;
    for (const side of [-1, 1]) {
      const j = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, DOOR_H, WALL_T + 0.02), mat(jambColor));
      j.position.set(a.x + side * a.gap / 2, DOOR_H / 2, WALL_Z);
      scene.add(j);
    }
  }

  /* ---- movable objects are no longer built here ---------------------------------------
   * Through Phase 0-1 the boxes, couch and dresser stood in this scene as static meshes
   * with AABB colliders — honest while nothing could move. Phase 2 made the boxes real
   * rigid bodies and Phase 3 did the same for the couch and dresser, so they are all
   * spawned from src/objects/definitions.js (PHASE2_SPAWNS, PHASE3_SPAWNS) instead.
   *
   * Leaving the static stand-ins behind would put an immovable collider inside every
   * object the registry spawns, which is the kind of duplication §8.1's one-shared-record
   * rule exists to prevent. */
  const props = [];

  // Human-height post. Without it nothing on screen has a believable scale.
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, REFERENCE_DIMS.moverHeight, 10),
    mat(PALETTE.reference));
  post.position.set(-3.0, REFERENCE_DIMS.moverHeight / 2, 3.6);
  post.castShadow = true;
  scene.add(post);

  // ---- Phase 1: the room (indoors) ---------------------------------------------------
  // The aperture wall is the room's south side; three more walls and a ceiling close it.
  const R = ROOM;
  const roomFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(R.maxX - R.minX, R.maxZ - R.minZ),
    surf(texBoards(30), (R.maxX - R.minX) * 0.42, (R.maxZ - R.minZ) * 0.42));
  roomFloor.rotation.x = -Math.PI / 2;
  roomFloor.position.set((R.minX + R.maxX) / 2, 0.015, (R.minZ + R.maxZ) / 2);
  roomFloor.receiveShadow = true;
  scene.add(roomFloor);

  // One plaster material for every interior wall, so the whole house reads as one build.
  const wallMat = surf(texPlaster(38, 0.84), 3, 1.4);

  const addWall = (cx, cz, sx, sz, tag) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, R.wallH, sz), wallMat);
    m.position.set(cx, R.wallH / 2, cz);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    addCollider(cx, cz, sx, sz, 0, R.wallH, tag);
  };
  const roomW = R.maxX - R.minX, roomD = R.maxZ - R.minZ;
  addWall(R.minX, (R.minZ + R.maxZ) / 2, R.wallT, roomD, 'roomWallW');
  addWall(R.maxX, (R.minZ + R.maxZ) / 2, R.wallT, roomD, 'roomWallE');
  addWall((R.minX + R.maxX) / 2, R.minZ, roomW, R.wallT, 'roomWallN');

  if (R.ceiling) {
    const ceil = new THREE.Mesh(new THREE.BoxGeometry(roomW, 0.16, roomD), wallMat);
    ceil.position.set((R.minX + R.maxX) / 2, R.wallH + 0.08, (R.minZ + R.maxZ) / 2);
    ceil.receiveShadow = true;
    scene.add(ceil);
    addCollider((R.minX + R.maxX) / 2, (R.minZ + R.maxZ) / 2, roomW, roomD, R.wallH, R.wallH + 0.16, 'roomCeiling');
  }

  /* ---- Phase 5: interior partitions, and the doorway turn ------------------------------
   *
   * §13.1 wants "2-3 rooms, a doorway turn". The partitions subdivide the Phase 1 shell
   * into living room / kitchen / bedroom; the openings are cut from INTERIOR_DOORS by
   * wallSegments(), so a visible gap and a solid collider cannot disagree — the same
   * one-shared-record rule (§8.1) the front aperture wall already follows.
   *
   * house.js owns ROOM as well, so the import runs one way only and there is no cycle.
   */
  {
    const PW = ROOM.wallH;

    for (const p of PARTITIONS) {
      for (const seg of wallSegments(p, INTERIOR_DOORS)) {
        const len = seg.hi - seg.lo;
        if (len <= 1e-6) continue;
        const mid = (seg.lo + seg.hi) / 2;
        const sx = p.axis === 'x' ? len : PARTITION_T;
        const sz = p.axis === 'x' ? PARTITION_T : len;
        const cx = p.axis === 'x' ? mid : p.at;
        const cz = p.axis === 'x' ? p.at : mid;
        const m = new THREE.Mesh(new THREE.BoxGeometry(sx, PW, sz), wallMat);
        m.position.set(cx, PW / 2, cz);
        m.castShadow = true; m.receiveShadow = true;
        scene.add(m);
        addCollider(cx, cz, sx, sz, 0, PW, `partition_${p.id}`);
      }
    }

    // Headers over the interior openings, so each is a real 2.03 m doorway rather than a
    // floor-to-ceiling slot you could carry a wardrobe through sideways.
    for (const dr of INTERIOR_DOORS) {
      const hh = PW - dr.height;
      if (hh <= 1e-6) continue;
      const sx = dr.axis === 'x' ? dr.gap : PARTITION_T;
      const sz = dr.axis === 'x' ? PARTITION_T : dr.gap;
      const cx = dr.axis === 'x' ? dr.centre : dr.at;
      const cz = dr.axis === 'x' ? dr.at : dr.centre;
      const hd = new THREE.Mesh(new THREE.BoxGeometry(sx, hh, sz), wallMat);
      hd.position.set(cx, dr.height + hh / 2, cz);
      hd.castShadow = true;
      scene.add(hd);
      addCollider(cx, cz, sx, sz, dr.height, PW, `doorHeader_${dr.id}`);

      // Lime jambs: these are the clearances the route puzzle is made of, so they are
      // marked the same way the front apertures are.
      const passes = fitsThroughGap(REFERENCE_DIMS.couch3Seat.z, REFERENCE_DIMS.couch3Seat.y, dr.gap).fits;
      const jc = passes ? PALETTE.reference : PALETTE.impossible;
      for (const side of [-1, 1]) {
        const jx = dr.axis === 'x' ? dr.centre + side * dr.gap / 2 : dr.at;
        const jz = dr.axis === 'x' ? dr.at : dr.centre + side * dr.gap / 2;
        const jsx = dr.axis === 'x' ? 0.04 : PARTITION_T + 0.02;
        const jsz = dr.axis === 'x' ? PARTITION_T + 0.02 : 0.04;
        const j = new THREE.Mesh(new THREE.BoxGeometry(jsx, dr.height, jsz), mat(jc));
        j.position.set(jx, dr.height / 2, jz);
        scene.add(j);
      }
    }
  }

  /* ---- Phase 7: the truck's cargo box ---------------------------------------------------
   * §10.1: "The cargo box is a real collision-enabled space with floor, walls, roof, ramp,
   * door, and anchor points. Nothing teleports into storage."
   *
   * Built from truck.js's records, so the mesh and the collider come from one place like
   * everything else (§8.1). The rear (-Z) face is deliberately absent: that is the door, and
   * the whole phase depends on being able to walk a couch in through it. */
  {
    /* THE TRUCK IS THE HERO OBJECT OF A MOVING GAME and it was six grey boxes.
     *
     * The COLLIDERS are untouched — every mesh below is still built from `cargoColliders()`
     * and `cabColliders()`, so §8.1's one-shared-record rule holds and the cargo volume is
     * exactly what Phase 7 measured. What changed is that the outward faces carry the
     * company's livery, the deck is scuffed ply instead of grey, and the thing has wheels. */
    const insideMat = surf(texTruckWall(), 2, 1);
    const deckMat = surf(texTruckDeck(), 3, 2);
    const sideMat = new THREE.MeshLambertMaterial({ map: texTruckSide() });
    const roofMat = mat(0xd8d5cd);

    /* BoxGeometry's material array is indexed [+X, -X, +Y, -Y, +Z, -Z]. The livery belongs
     * on the OUTWARD face only, which is -X for the left wall and +X for the right — so the
     * two walls do not take the same array. Getting this wrong paints the company name on
     * the inside of the cargo box, where only the load can read it. */
    const bodyMat = mat(0xb2202a);
    const wallMats = (outwardIsPlusX) => outwardIsPlusX
      ? [sideMat, insideMat, roofMat, roofMat, insideMat, insideMat]
      : [insideMat, sideMat, roofMat, roofMat, insideMat, insideMat];

    for (const c of cargoColliders()) {
      const sx = c.maxX - c.minX, sz = c.maxZ - c.minZ, sy = c.top - c.base;
      if (sx <= 0 || sy <= 0 || sz <= 0) continue;
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz),
        // The deck box is the whole lower body: you walk on its TOP, and its sides are the
        // truck's flank below the livery.
        // The under-deck's ±Z faces are CHASSIS, not livery. Painted body-red they made a
        // 4 m slab of flat colour across the whole rear of the truck — the loudest thing in
        // frame, and nothing a real vehicle has.
        c.tag === 'truckDeck' ? [bodyMat, bodyMat, deckMat, mat(0x24262b), mat(0x33363c), mat(0x33363c)]
        : c.tag === 'truckRoof' ? roofMat
        : c.tag === 'truckWallL' ? wallMats(false)
        : c.tag === 'truckWallR' ? wallMats(true)
        : insideMat);
      m.position.set((c.minX + c.maxX) / 2, c.base + sy / 2, (c.minZ + c.maxZ) / 2);
      m.castShadow = true; m.receiveShadow = true;
      scene.add(m);
      addCollider((c.minX + c.maxX) / 2, (c.minZ + c.maxZ) / 2, sx, sz, c.base, c.top, c.tag, c.friction);
    }

    // The cab. §11.2's "cab seats are safe" — and §3.4's TRANSIT has to begin somewhere
    // you can walk up to. Not part of cargoColliders(): the cab is not cargo volume.
    const cabMat = mat(0xb2202a);          // company red, matching the livery stripe
    const cabBoxes = [];
    for (const c of cabColliders()) {
      const sx = c.maxX - c.minX, sz = c.maxZ - c.minZ, sy = c.top - c.base;
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), cabMat);
      m.position.set((c.minX + c.maxX) / 2, c.base + sy / 2, (c.minZ + c.maxZ) / 2);
      m.castShadow = true; m.receiveShadow = true;
      scene.add(m);
      cabBoxes.push({ c, sx, sy, sz });
      addCollider((c.minX + c.maxX) / 2, (c.minZ + c.maxZ) / 2, sx, sz, c.base, c.top, c.tag);
    }

    /* Windscreen, side glass, bumper and wheels. DECORATION ONLY — none of it registers a
     * collider, because §8.1 forbids decorative collision that contradicts the visible
     * surface and the cab's walkable volume was measured in Phase 11. Everything here sits
     * flush with or inside the cab boxes above. */
    if (cabBoxes.length) {
      const cab = cabBoxes[0];
      const cx = (cab.c.minX + cab.c.maxX) / 2;
      const cz = (cab.c.minZ + cab.c.maxZ) / 2;
      const glass = mat(0x2a3540);
      // Windscreen on the -Z face (the truck faces -Z, away from the house).
      const ws = new THREE.Mesh(new THREE.BoxGeometry(cab.sx * 0.86, cab.sy * 0.34, 0.03), glass);
      ws.position.set(cx, cab.c.base + cab.sy * 0.70, cab.c.minZ - 0.015);
      scene.add(ws);
      for (const s of [-1, 1]) {
        const sg = new THREE.Mesh(new THREE.BoxGeometry(0.03, cab.sy * 0.28, cab.sz * 0.36), glass);
        sg.position.set(cx + s * (cab.sx / 2 + 0.015), cab.c.base + cab.sy * 0.68, cz - cab.sz * 0.12);
        scene.add(sg);
      }
      const bumper = new THREE.Mesh(new THREE.BoxGeometry(cab.sx * 1.02, 0.20, 0.16), mat(0x3a3d44));
      bumper.position.set(cx, cab.c.base + 0.28, cab.c.minZ - 0.06);
      bumper.castShadow = true;
      scene.add(bumper);
    }

    // Wheels, on both axles. A box on the ground is a shipping container; a box on wheels
    // is a truck, and it is the cheapest possible version of that difference.
    {
      const tyre = mat(0x1d1f24), hub = mat(0xb9bec5);
      const bodyMinX = Math.min(...cargoColliders().map((c) => c.minX));
      const bodyMaxX = Math.max(...cargoColliders().map((c) => c.maxX));
      const zs = [];
      for (const c of cargoColliders()) { zs.push(c.minZ, c.maxZ); }
      const zMin = Math.min(...zs), zMax = Math.max(...zs);
      const axleZ = [zMin + 0.95, zMax - 0.85];
      if (cabBoxes.length) axleZ.push((cabBoxes[0].c.minZ + cabBoxes[0].c.maxZ) / 2 - 0.1);
      for (const az of axleZ) {
        for (const sx of [bodyMinX + 0.10, bodyMaxX - 0.10]) {
          const w = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.26, 16), tyre);
          w.rotation.z = Math.PI / 2;
          w.position.set(sx, 0.46, az);
          w.castShadow = true;
          scene.add(w);
          const h = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.20, 0.28, 12), hub);
          h.rotation.z = Math.PI / 2;
          h.position.set(sx, 0.46, az);
          scene.add(h);
        }
      }
    }

    // Anchor points, in the reference lime. §10.3 wants "anchor validity" legible, and the
    // cheapest honest version of that is being able to see where they are.
    for (const a of cargoAnchors()) {
      const knob = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.08, 0.16), mat(PALETTE.reference));
      knob.position.set(a.x, a.y, a.z);
      scene.add(knob);
    }
  }

  /* ---- Phase 9: the destination ---------------------------------------------------------
   * §13.1: "Destination | One smaller site with 3-4 labeled room zones." Built from
   * destination.js's records by the same code path as everything else — shell colliders,
   * then partitions cut by their doorways. */
  {
    // The delivery house gets the same treatment as the pickup one, in a different siding
    // colour — §13.1 calls it "one SMALLER site", not a different kind of building, and a
    // plain tan box at the end of the drive undoes the whole art pass at the exact moment
    // the contract is being judged (§15.2).
    const destMat = surf(texSiding(196, 0.58), 5, 1.6);
    const destFloorMat = surf(texBoards(26), 4, 4);
    for (const c of destColliders()) {
      const sx = c.maxX - c.minX, sz = c.maxZ - c.minZ, sy = c.top - c.base;
      if (sx <= 0 || sy <= 0 || sz <= 0) continue;
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz),
        c.tag === 'destFloor' ? destFloorMat : destMat);
      m.position.set((c.minX + c.maxX) / 2, c.base + sy / 2, (c.minZ + c.maxZ) / 2);
      m.castShadow = true; m.receiveShadow = true;
      scene.add(m);
      addCollider((c.minX + c.maxX) / 2, (c.minZ + c.maxZ) / 2, sx, sz, c.base, c.top, c.tag);
    }

    for (const p of DEST_PARTITIONS) {
      for (const seg of wallSegments(p, DEST_DOORS)) {
        const len = seg.hi - seg.lo;
        if (len <= 1e-6) continue;
        const mid = (seg.lo + seg.hi) / 2;
        const sx = p.axis === 'x' ? len : PARTITION_T;
        const sz = p.axis === 'x' ? PARTITION_T : len;
        const cx = p.axis === 'x' ? mid : p.at;
        const cz = p.axis === 'x' ? p.at : mid;
        const m = new THREE.Mesh(new THREE.BoxGeometry(sx, DEST_SHELL.wallH, sz), destMat);
        m.position.set(cx, DEST_SHELL.wallH / 2, cz);
        m.castShadow = true; m.receiveShadow = true;
        scene.add(m);
        addCollider(cx, cz, sx, sz, 0, DEST_SHELL.wallH, `partition_${p.id}`);
      }
    }

    // §13.1 says the zones are LABELED, and §21.2's contract UX has to name a room. A lime
    // marker on the floor of each is the cheapest version of that which is not a lie.
    for (const z of DEST_ZONES) {
      if (z.id === 'dest_apron') continue;
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.02, 0.9), mat(PALETTE.reference));
      pad.position.set((z.minX + z.maxX) / 2, 0.03, (z.minZ + z.maxZ) / 2);
      scene.add(pad);
    }
  }

  // ---- Phase 1: obstacles (autostep / mantle / refuse) --------------------------------
  const obstacles = [];
  for (const o of OBSTACLES) {
    // Lime = the controller should get you up it; coral = it must refuse.
    /* DRESSED AS GARDEN WALLS, still legible as a legend.
     *
     * These four blocks are Phase 1 test geometry — one to autostep, two to mantle, one that
     * must REFUSE — and painting them lime and coral is how the gate was judged by eye. They
     * are also four coloured blocks sitting in the front garden, which is a large part of why
     * the site read as a test scene. So the BODY is brickwork and the legend survives as a
     * painted coping along the top edge: the diagnostic is intact, and a raised bed is a
     * thing a garden has. */
    const col = o.expectMantle ? PALETTE.reference : (o.top > 1.0 ? PALETTE.impossible : PALETTE.trim);
    const m = new THREE.Mesh(new THREE.BoxGeometry(o.w, o.top, o.d), gardenBrick);
    m.position.set(o.x, o.top / 2, o.z);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    const coping = new THREE.Mesh(new THREE.BoxGeometry(o.w * 1.04, 0.06, o.d * 1.04), mat(col));
    coping.position.set(o.x, o.top + 0.03, o.z);
    coping.castShadow = true; coping.receiveShadow = true;
    scene.add(coping);
    addCollider(o.x, o.z, o.w, o.d, 0, o.top, o.id);
    obstacles.push({ ...o, mesh: m });
  }

  // ---- Phase 1: ramp + platform -------------------------------------------------------
  // Mesh rotation must match the physics quaternion exactly, or the player walks on an
  // invisible slope. Both read RAMP; neither hard-codes an angle.
  const rampMesh = new THREE.Mesh(
    new THREE.BoxGeometry(RAMP.width, RAMP.thickness, RAMP.length), surf(texBoards(28), 2, 3));
  rampMesh.position.set(RAMP.x, RAMP.y, RAMP.z);
  rampMesh.rotation.x = RAMP.angleRad;
  rampMesh.castShadow = true; rampMesh.receiveShadow = true;
  scene.add(rampMesh);
  // Not added to `colliders`: an AABB cannot represent a slope, and a box-shaped collider
  // here would be a lie the camera would then occlude against. Physics builds the rotated
  // collider from RAMP directly; camera occlusion skips it.

  const plat = new THREE.Mesh(
    new THREE.BoxGeometry(PLATFORM.width, PLATFORM.thickness, PLATFORM.depth), surf(texBoards(30), 2, 2));
  plat.position.set(PLATFORM.x, PLATFORM.y - PLATFORM.thickness / 2, PLATFORM.z);
  plat.castShadow = true; plat.receiveShadow = true;
  scene.add(plat);
  addCollider(PLATFORM.x, PLATFORM.z, PLATFORM.width, PLATFORM.depth,
              PLATFORM.y - PLATFORM.thickness, PLATFORM.y, 'platform');

  /* ---- dressing: the house from outside, and the street it stands on ---------------------
   *
   * EVERY MESH BELOW IS DECORATION AND REGISTERS NO COLLIDER. §8.1 forbids decorative
   * collision that contradicts the visible surface, and the inverse matters just as much
   * here: the pickup house's walkable volume was measured in Phases 1 and 5 and asserted by
   * m1 and m5, so an art pass must not put a bush where a mover used to be able to stand.
   * Everything is placed OUTSIDE the room shell or above head height.
   *
   * §20.4 called the Phase 0 scene "diagnostic: simple meshes, colour separation, contact
   * shadows". It has been exactly that for twelve phases, and it is the reason the build
   * photographs like a CAD viewport rather than a game. The geometry it describes has not
   * changed — this is dressing around it. */
  {
    const RM = ROOM;
    const sidingMat = surf(texSiding(34, 0.62), 6, 2);
    const shingleMat = surf(texShingle(24), 8, 4);
    const brickMat = surf(texBrick(14), 4, 2);
    const trimMat = mat(0xf2ead9);
    const glassMat = mat(0x3d5568);

    const deco = (geo, m, x, y, z, ry = 0) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      if (ry) mesh.rotation.y = ry;
      mesh.castShadow = true; mesh.receiveShadow = true;
      scene.add(mesh);
      return mesh;
    };

    const roomW = RM.maxX - RM.minX, roomD = RM.maxZ - RM.minZ;
    const cx = (RM.minX + RM.maxX) / 2, cz = (RM.minZ + RM.maxZ) / 2;

    /* A pitched roof. Two slabs leaning against each other, sat ON TOP of the 2.7 m ceiling
     * — well above anything a mover can reach, so it cannot interfere with a carry. */
    const eave = RM.wallH + 0.18;
    const rise = 1.5, over = 0.45;
    for (const s of [-1, 1]) {
      const slopeLen = Math.hypot(roomW / 2 + over, rise);
      const slab = deco(new THREE.BoxGeometry(slopeLen, 0.16, roomD + over * 2), shingleMat,
                        cx + s * (roomW / 4), eave + rise / 2, cz);
      slab.rotation.z = s * -Math.atan2(rise, roomW / 2 + over);
    }
    // Gable ends, filling the triangle the two slabs leave. Boxes, because a triangle needs
    // a custom geometry and at this distance nobody can tell.
    for (const gz of [RM.minZ - 0.02, RM.maxZ + 0.02]) {
      for (let i = 0; i < 5; i++) {
        const f = i / 5, w = roomW * (1 - f) * 0.98;
        deco(new THREE.BoxGeometry(w, rise / 5 + 0.02, 0.16), sidingMat,
             cx, eave + rise * f + rise / 10, gz);
      }
    }
    // Fascia along both eaves.
    for (const s of [-1, 1]) {
      deco(new THREE.BoxGeometry(0.10, 0.22, roomD + over * 2), trimMat,
           cx + s * (roomW / 2 + over), eave - 0.05, cz);
    }

    /* Cladding on the outward faces of the shell. The walls themselves are already built
     * and collidable; these are thin skins 1 cm proud of them. */
    deco(new THREE.BoxGeometry(0.02, RM.wallH, roomD), sidingMat, RM.minX - 0.10, RM.wallH / 2, cz);
    deco(new THREE.BoxGeometry(0.02, RM.wallH, roomD), sidingMat, RM.maxX + 0.10, RM.wallH / 2, cz);
    deco(new THREE.BoxGeometry(roomW, RM.wallH, 0.02), sidingMat, cx, RM.wallH / 2, RM.minZ - 0.10);
    // A brick skirt round the base, which is most of what makes a house look built.
    for (const [w, h, dp, px, py, pz] of [
      [0.06, 0.55, roomD, RM.minX - 0.12, 0.275, cz],
      [0.06, 0.55, roomD, RM.maxX + 0.12, 0.275, cz],
      [roomW, 0.55, 0.06, cx, 0.275, RM.minZ - 0.12],
    ]) deco(new THREE.BoxGeometry(w, h, dp), brickMat, px, py, pz);

    // Windows on the two long sides — frame, glass, sill.
    for (const s of [-1, 1]) {
      for (const wz of [cz - roomD * 0.28, cz + roomD * 0.22]) {
        const wx = s * (roomW / 2) + s * 0.12;
        deco(new THREE.BoxGeometry(0.05, 1.20, 1.05), trimMat, cx + wx, 1.45, wz);
        deco(new THREE.BoxGeometry(0.03, 1.02, 0.88), glassMat, cx + wx + s * 0.02, 1.45, wz);
        deco(new THREE.BoxGeometry(0.14, 0.06, 1.15), trimMat, cx + wx, 0.83, wz);
      }
    }

    /* The front door, over the 36" aperture — the one a couch can actually pass (§7.1 and
     * KNOWN_ISSUES). A frame and a threshold only: the opening itself stays clear, because
     * that clearance is the whole game. */
    const front = APERTURES.find((a) => a.id === 'front36') || APERTURES[0];
    const WALL_Z_FACE = -2.0 - 0.09 - 0.03;
    for (const s of [-1, 1]) {
      deco(new THREE.BoxGeometry(0.10, REFERENCE_DIMS.doorwayHeight + 0.12, 0.06), trimMat,
           front.x + s * (front.gap / 2 + 0.05), (REFERENCE_DIMS.doorwayHeight + 0.12) / 2, WALL_Z_FACE);
    }
    deco(new THREE.BoxGeometry(front.gap + 0.20, 0.10, 0.06), trimMat,
         front.x, REFERENCE_DIMS.doorwayHeight + 0.11, WALL_Z_FACE);
    // The door itself, swung wide against the wall so nothing blocks the opening.
    deco(new THREE.BoxGeometry(0.05, REFERENCE_DIMS.doorwayHeight, front.gap * 0.92), mat(0x4a6b8a),
         front.x + front.gap / 2 + 0.14, REFERENCE_DIMS.doorwayHeight / 2, WALL_Z_FACE - front.gap * 0.46);
    // House number, because §12.1's customer lives somewhere.
    deco(new THREE.BoxGeometry(0.22, 0.30, 0.03), trimMat, front.x - front.gap / 2 - 0.34, 1.6, WALL_Z_FACE);

    /* The street and its verge. The driveway used to run to the edge of a green plane, so
     * the site had no context at all — a truck parked in a field. */
    const street = new THREE.Mesh(new THREE.PlaneGeometry(70, 7), surf(texAsphalt(), 35, 3.5));
    street.rotation.x = -Math.PI / 2;
    street.position.set(0, 0.008, 17.5);
    street.receiveShadow = true;
    scene.add(street);
    // Centre line, dashed.
    for (let i = -34; i < 34; i += 4) {
      deco(new THREE.BoxGeometry(2.2, 0.01, 0.14), mat(0xd8cf9a), i, 0.014, 17.5);
    }
    // Kerbs either side.
    for (const kz of [14.0, 21.0]) {
      deco(new THREE.BoxGeometry(70, 0.14, 0.28), surf(texConcrete(), 30, 1), 0, 0.07, kz);
    }

    /* Landscaping. Placed on the lawn, clear of the driveway, the path and the room shell —
     * a tree where a mover walks is a collider you did not add and a wall they cannot see. */
    const trunkMat = mat(0x5b4632), leafMat = mat(0x3f6b33), leafMat2 = mat(0x4f7d3a);
    const tree = (tx, tz, scale) => {
      deco(new THREE.CylinderGeometry(0.16 * scale, 0.22 * scale, 2.4 * scale, 8), trunkMat, tx, 1.2 * scale, tz);
      /* Many small lobes, not few big ones — 11 at 0.24-0.37 R reads as foliage where 5 at
       * 0.46 R reads as a clover leaf (Dev\INDEX.md → TowBros `_drawTrees`). Same finding,
       * different projection. */
      for (let i = 0; i < 11; i++) {
        const a = i * 2.399, r = (0.55 + (i % 3) * 0.22) * scale;
        const ly = (2.5 + (i % 4) * 0.42) * scale;
        deco(new THREE.SphereGeometry((0.52 + (i % 3) * 0.16) * scale, 7, 6),
             i % 2 ? leafMat : leafMat2,
             tx + Math.cos(a) * r, ly, tz + Math.sin(a) * r);
      }
    };
    tree(-7.4, 6.2, 1.15);
    tree(8.6, 9.4, 0.95);
    tree(-9.2, 12.6, 1.05);
    tree(9.8, -1.2, 0.85);

    // A hedge along the boundary, and a mailbox at the kerb.
    for (let i = 0; i < 9; i++) {
      deco(new THREE.BoxGeometry(1.5, 0.95, 0.75), leafMat, -11.5, 0.48, 1.0 + i * 1.5);
    }
    deco(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 8), trunkMat, -3.4, 0.55, 13.4);
    deco(new THREE.BoxGeometry(0.28, 0.24, 0.44), mat(0x8a2f2f), -3.4, 1.22, 13.4);

    /* A roof on the delivery house too. Same construction as above, sat on its own shell —
     * §13.1's "one smaller site", so it is one span rather than two. */
    {
      const DW = DEST_SHELL.maxX - DEST_SHELL.minX, DD = DEST_SHELL.maxZ - DEST_SHELL.minZ;
      const dcx = (DEST_SHELL.minX + DEST_SHELL.maxX) / 2;
      const dcz = (DEST_SHELL.minZ + DEST_SHELL.maxZ) / 2;
      const dEave = DEST_SHELL.wallH + 0.18, dRise = 1.25, dOver = 0.4;
      for (const s of [-1, 1]) {
        const slopeLen = Math.hypot(DW / 2 + dOver, dRise);
        const slab = deco(new THREE.BoxGeometry(slopeLen, 0.16, DD + dOver * 2), shingleMat,
                          dcx + s * (DW / 4), dEave + dRise / 2, dcz);
        slab.rotation.z = s * -Math.atan2(dRise, DW / 2 + dOver);
      }
      for (const gz of [DEST_SHELL.minZ - 0.02, DEST_SHELL.maxZ + 0.02]) {
        for (let i = 0; i < 5; i++) {
          const f = i / 5;
          deco(new THREE.BoxGeometry(DW * (1 - f) * 0.98, dRise / 5 + 0.02, 0.16),
               surf(texSiding(196, 0.58), 4, 1), dcx, dEave + dRise * f + dRise / 10, gz);
        }
      }
      for (const s of [-1, 1]) {
        deco(new THREE.BoxGeometry(0.10, 0.22, DD + dOver * 2), trimMat,
             dcx + s * (DW / 2 + dOver), dEave - 0.05, dcz);
      }
      // A brick skirt, matching the pickup house's.
      for (const [w, h, dp, px, py, pz] of [
        [0.06, 0.5, DD, DEST_SHELL.minX - 0.09, 0.25, dcz],
        [0.06, 0.5, DD, DEST_SHELL.maxX + 0.09, 0.25, dcz],
      ]) deco(new THREE.BoxGeometry(w, h, dp), brickMat, px, py, pz);
    }

    // A wheelie bin and a stack of flattened cartons by the drive: signs of a move underway.
    deco(new THREE.BoxGeometry(0.58, 0.95, 0.62), mat(0x2f4a2f), 3.6, 0.48, 12.0);
    deco(new THREE.BoxGeometry(0.60, 0.06, 0.66), mat(0x22331f), 3.6, 0.98, 12.0);
    for (let i = 0; i < 4; i++) {
      deco(new THREE.BoxGeometry(0.9, 0.03, 0.7), surf(texBoards(32), 1, 1),
           4.8, 0.02 + i * 0.035, 11.4, 0.2 + i * 0.1);
    }
  }

  return {
    scene, colliders, props, sun, grid, apertures: APERTURES,
    obstacles, ramp: RAMP, platform: PLATFORM, room: ROOM,
    spawn: { x: 0, y: 0, z: 5.0 },
    dispose() {
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      });
    },
  };
}
