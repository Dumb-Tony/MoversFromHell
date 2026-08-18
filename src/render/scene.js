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
  reference:0xa8d93a,          // the Dirty Boy Devs lime — measuring aids, and "this fits"
  impossible:0xff5a5a,         // coral — "the couch cannot pass this, in any rotation"
};

/**
 * @returns {{scene, colliders, spawn, dispose}}
 *   colliders: {minX,maxX,minZ,maxZ,base,top,tag}[] — shared with camera + physics
 *   spawn: where the player starts (Phase 1)
 */
export function buildPhase0Scene() {
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
  post.position.set(-4.2, REFERENCE_DIMS.moverHeight / 2, 2.0);
  post.castShadow = true;
  scene.add(post);

  return {
    scene, colliders, props, sun, apertures: APERTURES,
    spawn: { x: 0, y: 0, z: 5.0 },
    dispose() {
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      });
    },
  };
}
