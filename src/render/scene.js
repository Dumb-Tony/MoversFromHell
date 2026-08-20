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
export const ROOM = Object.freeze({
  minX: -5.0, maxX: 5.0, minZ: -9.0, maxZ: -2.0,
  wallH: 2.7, wallT: 0.18, ceiling: true,
});

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
  scene.fog = new THREE.Fog(0x9fc4dd, 40, 160);

  const colliders = [];
  const addCollider = (cx, cz, sx, sz, base, top, tag) => {
    colliders.push({
      minX: cx - sx / 2, maxX: cx + sx / 2,
      minZ: cz - sz / 2, maxZ: cz + sz / 2,
      base, top, tag,
    });
  };

  // ---- lighting: bright and even, so silhouettes and clearances read (§20.1) ----------
  const hemi = new THREE.HemisphereLight(0xcfe4f2, 0x5a5545, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2dd, 1.05);
  sun.position.set(14, 22, 9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const d = 24;
  sun.shadow.camera.left = -d; sun.shadow.camera.right = d;
  sun.shadow.camera.top = d;   sun.shadow.camera.bottom = -d;
  sun.shadow.camera.near = 1;  sun.shadow.camera.far = 70;
  sun.shadow.bias = -0.0008;
  scene.add(sun);
  scene.add(sun.target);

  const mat = (color, opts = {}) => new THREE.MeshLambertMaterial({ color, ...opts });

  // ---- ground ------------------------------------------------------------------------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), mat(PALETTE.grass));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Driveway — the §13.1 parking surface, and the flat run a dolly needs (§9.1).
  const drive = new THREE.Mesh(new THREE.PlaneGeometry(6, 14), mat(PALETTE.asphalt));
  drive.rotation.x = -Math.PI / 2;
  drive.position.set(0, 0.01, 7);
  drive.receiveShadow = true;
  scene.add(drive);

  // Metre grid, 1m major. The only way to judge whether a 2.1m couch LOOKS 2.1m.
  const grid = new THREE.GridHelper(60, 60, 0x000000, 0x000000);
  grid.material.opacity = 0.14;
  grid.material.transparent = true;
  grid.position.y = 0.02;
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
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_H, WALL_T), mat(PALETTE.wall));
    m.position.set((lo + hi) / 2, WALL_H / 2, WALL_Z);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    addCollider((lo + hi) / 2, WALL_Z, w, WALL_T, 0, WALL_H, 'wall');
  }

  for (const a of APERTURES) {
    // Header, so each opening is a real 2.03 m aperture and not a floor-to-ceiling slot.
    const hd = new THREE.Mesh(new THREE.BoxGeometry(a.gap, headerH, WALL_T), mat(PALETTE.wall));
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

  // ---- reference objects at true dimensions ------------------------------------------
  const props = [];
  const addBox = (dims, color, x, z, yaw = 0, tag = '') => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(dims.x, dims.y, dims.z), mat(color));
    m.position.set(x, dims.y / 2, z);
    m.rotation.y = yaw;
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    props.push({ mesh: m, dims, tag });
    // Axis-aligned only while yaw is 0 — Phase 0 props are static, and Phase 2 replaces
    // this list with real rigid bodies, so an AABB is honest here and nowhere later.
    if (Math.abs(yaw) < 1e-6) addCollider(x, z, dims.x, dims.z, 0, dims.y, tag);
    return m;
  };

  addBox(REFERENCE_DIMS.couch3Seat, PALETTE.couch,   0,   1.6, 0, 'couch');
  addBox(REFERENCE_DIMS.dresser,    PALETTE.dresser, 3.0, 1.2, 0, 'dresser');
  addBox(REFERENCE_DIMS.movingBox,  PALETTE.box,    -2.4, 0.9, 0, 'box');
  addBox(REFERENCE_DIMS.movingBox,  PALETTE.box,    -2.4, 1.6, 0, 'box');

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
    new THREE.PlaneGeometry(R.maxX - R.minX, R.maxZ - R.minZ), mat(PALETTE.floor));
  roomFloor.rotation.x = -Math.PI / 2;
  roomFloor.position.set((R.minX + R.maxX) / 2, 0.015, (R.minZ + R.maxZ) / 2);
  roomFloor.receiveShadow = true;
  scene.add(roomFloor);

  const addWall = (cx, cz, sx, sz, tag) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, R.wallH, sz), mat(PALETTE.wall));
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
    const ceil = new THREE.Mesh(new THREE.BoxGeometry(roomW, 0.16, roomD), mat(PALETTE.wall));
    ceil.position.set((R.minX + R.maxX) / 2, R.wallH + 0.08, (R.minZ + R.maxZ) / 2);
    ceil.receiveShadow = true;
    scene.add(ceil);
    addCollider((R.minX + R.maxX) / 2, (R.minZ + R.maxZ) / 2, roomW, roomD, R.wallH, R.wallH + 0.16, 'roomCeiling');
  }

  // ---- Phase 1: obstacles (autostep / mantle / refuse) --------------------------------
  const obstacles = [];
  for (const o of OBSTACLES) {
    // Lime = the controller should get you up it; coral = it must refuse.
    const col = o.expectMantle ? PALETTE.reference : (o.top > 1.0 ? PALETTE.impossible : PALETTE.trim);
    const m = new THREE.Mesh(new THREE.BoxGeometry(o.w, o.top, o.d), mat(col));
    m.position.set(o.x, o.top / 2, o.z);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    addCollider(o.x, o.z, o.w, o.d, 0, o.top, o.id);
    obstacles.push({ ...o, mesh: m });
  }

  // ---- Phase 1: ramp + platform -------------------------------------------------------
  // Mesh rotation must match the physics quaternion exactly, or the player walks on an
  // invisible slope. Both read RAMP; neither hard-codes an angle.
  const rampMesh = new THREE.Mesh(
    new THREE.BoxGeometry(RAMP.width, RAMP.thickness, RAMP.length), mat(PALETTE.asphalt));
  rampMesh.position.set(RAMP.x, RAMP.y, RAMP.z);
  rampMesh.rotation.x = RAMP.angleRad;
  rampMesh.castShadow = true; rampMesh.receiveShadow = true;
  scene.add(rampMesh);
  // Not added to `colliders`: an AABB cannot represent a slope, and a box-shaped collider
  // here would be a lie the camera would then occlude against. Physics builds the rotated
  // collider from RAMP directly; camera occlusion skips it.

  const plat = new THREE.Mesh(
    new THREE.BoxGeometry(PLATFORM.width, PLATFORM.thickness, PLATFORM.depth), mat(PALETTE.trim));
  plat.position.set(PLATFORM.x, PLATFORM.y - PLATFORM.thickness / 2, PLATFORM.z);
  plat.castShadow = true; plat.receiveShadow = true;
  scene.add(plat);
  addCollider(PLATFORM.x, PLATFORM.z, PLATFORM.width, PLATFORM.depth,
              PLATFORM.y - PLATFORM.thickness, PLATFORM.y, 'platform');

  return {
    scene, colliders, props, sun, apertures: APERTURES,
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
