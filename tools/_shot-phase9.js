/* Poses the Phase 9 build for docs/phase9-destination.png: the destination house with the
 * whole manifest delivered into it, seen from above with the ceiling hidden.
 *
 * The gate is "manifest completes reliably", and the only honest picture of that is all 23
 * objects standing in the three rooms the manifest asked for. Nothing here is decorative:
 * each object is placed in its own toZone and left to settle, which is exactly what m9's
 * C-series drives to 23/23. */
const M = await window.__MFH_READY;
const R = M.registry, movers = M.movers;
const STEP = 1000 / 60;
const rows = M.game.state.manifest;

const step = (n) => {
  for (let i = 0; i < n; i++) {
    M.physics.clearForces();
    M.straps.step(STEP, i * STEP);
    for (const m of movers) {
      m.grips.step(STEP, { brace: false, simTimeMs: i * STEP });
      m.controller.step(STEP, {
        move: { x: 0, y: 0 }, forward: { x: 0, y: 0, z: -1 }, right: { x: 1, y: 0, z: 0 },
        run: false, brace: false, jump: false, recover: false,
      });
    }
    M.physics.step();
    R.step(STEP);
    M.cargo.step(STEP, i * STEP);
  }
};

const Z = M.destZones;
const slotIn = (zoneId, index) => {
  const z = Z.find((r) => r.id === zoneId);
  const cols = 4;
  const w = (z.maxX - z.minX) - 1.2, d = (z.maxZ - z.minZ) - 1.2;
  return {
    x: z.minX + 0.6 + ((index % cols) + 0.5) * (w / cols),
    z: z.minZ + 0.6 + (Math.floor(index / cols) + 0.5) * (d / 2),
  };
};

const perRoom = {};
for (const row of rows) {
  const e = R.get(row.entityId);
  if (!e) continue;
  perRoom[row.toZone] = (perRoom[row.toZone] || 0) + 1;
  const s = slotIn(row.toZone, perRoom[row.toZone] - 1);
  e.body.setTranslation({ x: s.x, y: e.def.dimensions.y / 2 + 0.06, z: s.z }, true);
  e.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  e.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  e.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  e.body.wakeUp();
}
M.physics.primeQueries();
step(200);

// Two movers in the doorway, done for the day.
const S = M.destShell;
movers[0].controller.hardSetPosition({ x: (S.minX + S.maxX) / 2 - 0.6, y: 0.1, z: S.maxZ + 1.4 });
if (movers[1]) movers[1].controller.hardSetPosition({ x: (S.minX + S.maxX) / 2 + 1.0, y: 0.1, z: S.maxZ + 1.9 });
for (const m of movers) { m.controller._vel.x = 0; m.controller._vel.z = 0; m.controller.velocityY = 0; }
step(30);

// Hide the destination ceiling and take it out of the camera's occlusion set, the same way
// the Phase 5 floor-plan shot does for the pickup house.
M.world.scene.traverse((o) => {
  if (o.isMesh && o.geometry && o.geometry.parameters) {
    const p = o.geometry.parameters;
    if (p.height && Math.abs(p.height - 0.16) < 1e-6 && p.width >= 8.9 && p.depth >= 5.9) o.visible = false;
  }
});
M.rig.colliders = M.world.colliders.filter((c) => c.tag !== 'destCeiling' && c.tag !== 'roomCeiling');

M.rig.yaw = 0;
M.rig.pitch = -1.15;
M.rig.setDistance(14.5);
M.rig._currentDistance = 14.5;
for (let i = 0; i < 60; i++) {
  M.rig.update({ x: (S.minX + S.maxX) / 2, y: 0.1, z: (S.minZ + S.maxZ) / 2 + 0.4 }, 1 / 60);
}

for (const m of movers) {
  const sp = M.game.state.players[m.id];
  sp.position = { ...m.controller.position };
  m.body.update(m.controller.position, m.yaw, 0, 1 / 60);
}
R.syncMeshes();
M.tools.syncMeshes();
M.hud.update(movers[0].grips.status());
M.overlay.el.hidden = true;
M.syncSize();
M.present(M.camera);
