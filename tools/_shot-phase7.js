/* Poses the Phase 7 build for docs/phase7-cargo.png: a loaded, strapped truck seen through
 * the open rear door.
 *
 * The shot has to show three things at once, because they are the phase: the cargo box is a
 * real space you carry things into, the rear is genuinely open, and the load is restrained by
 * straps running to anchors on the walls. */
const M = await window.__MFH_READY;
const R = M.registry, movers = M.movers, straps = M.straps, cargo = M.cargo, tools = M.tools;
const THREE = window.THREE;

const STEP = 1000 / 60;
const drive = (n) => {
  for (let i = 0; i < n; i++) {
    M.physics.clearForces();
    straps.step(STEP, i * STEP);
    for (const m of movers) {
      m.grips.step(STEP, { brace: false, simTimeMs: i * STEP });
      m.controller.step(STEP, {
        move: { x: 0, y: 0 }, forward: { x: 0, y: 0, z: -1 }, right: { x: 1, y: 0, z: 0 },
        run: false, brace: false, jump: false, recover: false,
      });
    }
    M.physics.step();
    R.step(STEP);
    cargo.step(STEP, i * STEP);
  }
};

const byDef = (id) => { for (const e of R.entities.values()) if (e.defId === id) return e; return null; };
const allOfDef = (id) => [...R.entities.values()].filter((e) => e.defId === id);
const toolByDef = (id) => { for (const t of tools.tools.values()) if (t.defId === id) return t; return null; };
const park = (e, x, y, z, yaw = 0) => {
  e.body.setTranslation({ x, y, z }, true);
  e.body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
  e.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  e.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  e.body.wakeUp();
};

// truck.js's own numbers, so the pose cannot drift from the geometry.
const T = M.truckPose, I = M.cargoInterior, ANCHORS = M.cargoAnchors;

// A sensible pack: heavy low and forward, boxes behind, fragile on top of nothing.
const fridge = byDef('fridge_01');
const dresser = byDef('dresser_01');
const wardrobe = byDef('wardrobe_01');
const boxes = allOfDef('box_small_01').slice(0, 4);
const pack = [];
if (fridge) { park(fridge, T.x - 0.55, I.minY + 0.90, I.maxZ - 0.50); pack.push(fridge); }
if (wardrobe) { park(wardrobe, T.x + 0.55, I.minY + 1.02, I.maxZ - 0.45); pack.push(wardrobe); }
if (dresser) { park(dresser, T.x - 0.45, I.minY + 0.45, I.maxZ - 1.35); pack.push(dresser); }
boxes.forEach((b, k) => {
  park(b, T.x + 0.55 + (k % 2) * -0.02, I.minY + 0.28 + Math.floor(k / 2) * 0.52, I.maxZ - 1.25 - (k % 2) * 0.55);
  pack.push(b);
});
M.physics.primeQueries();
drive(140);

// Strap the two tall items to the nearest anchors. Taut, no pre-load.
for (const e of [fridge, wardrobe].filter(Boolean)) {
  const t = e.body.translation();
  const near = [...ANCHORS].sort((a, b) =>
    Math.hypot(a.x - t.x, a.z - t.z) - Math.hypot(b.x - t.x, b.z - t.z)).slice(0, 2);
  for (const a of near) {
    const d = e.def.dimensions;
    straps.attach(a, e, {
      x: t.x + Math.sign(a.x - t.x) * Math.min(d.x, d.z) * 0.3,
      y: t.y + d.y * 0.35,
      z: t.z,
    }, 0);
  }
}
drive(30);

/* Draw the straps. They are forces, not geometry, so nothing renders them in the build yet —
 * §10.3 asks for "render the line, anchor validity, tension, and overload risk" and that is
 * HUD work this phase did not do. Drawing them here is honest for a documentation frame as
 * long as the note says so, which KNOWN_ISSUES does. */
for (const s of straps.straps.values()) {
  const e = R.get(s.entityId);
  if (!e) continue;
  const t = e.body.translation();
  const hook = new THREE.Vector3(t.x, t.y + e.def.dimensions.y * 0.35, t.z);
  const anchor = new THREE.Vector3(s.anchor.x, s.anchor.y, s.anchor.z);
  const mid = hook.clone().add(anchor).multiplyScalar(0.5);
  const len = hook.distanceTo(anchor);
  const line = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.02, len),
    new THREE.MeshLambertMaterial({ color: 0x39c9b0 }));   // §10.3's "teal state"
  line.position.copy(mid);
  line.lookAt(anchor);
  M.world.scene.add(line);
}

// A mover at the rear door, carrying nothing, for scale.
movers[0].controller.hardSetPosition({ x: T.x - 0.2, y: 0.1, z: I.minZ - 2.4 });
if (movers[1]) movers[1].controller.hardSetPosition({ x: T.x + 1.7, y: 0.1, z: I.minZ - 2.9 });
for (const m of movers) { m.controller._vel.x = 0; m.controller._vel.z = 0; m.controller.velocityY = 0; }
drive(30);

// Look into the box through the open rear door, slightly above deck height.
M.rig.yaw = Math.PI;
M.rig.pitch = -0.05;
M.rig.setDistance(6.0);
M.rig._currentDistance = 6.0;
for (let i = 0; i < 60; i++) M.rig.update({ x: T.x, y: 1.05, z: I.minZ - 1.2 }, 1 / 60);

for (const m of movers) {
  const sp = M.game.state.players[m.id];
  sp.position = { ...m.controller.position };
  m.body.update(m.controller.position, m.yaw, 0, 1 / 60);
}
R.syncMeshes();
tools.syncMeshes();
M.hud.update(movers[0].grips.status());
M.overlay.el.hidden = true;
M.syncSize();
M.renderer.render(M.world.scene, M.camera);
