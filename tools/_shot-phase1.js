/* Poses the Phase 1 build for docs/phase1-movement.png.
 *
 * Framed to show SCALE, which is the whole point of a diagnostic scene: a 1.80 m mover
 * standing beside the 2.10 m couch and the three doorways, on a metre grid. Anyone can
 * check the proportions by eye against the grid squares. */
const M = await window.__MFH_READY;
const g = M.game, P = M.player;

P.hardSetPosition({ x: 1.35, y: 0.1, z: 1.4 });
for (let i = 0; i < 60; i++) {
  P.step(1000 / 60, {
    move: { x: 0, y: 0 }, forward: { x: 0, y: 0, z: -1 }, right: { x: 1, y: 0, z: 0 },
    run: false, brace: false, jump: false, recover: false,
  });
  M.physics.step();
}

const p = P.position;
g.state.players.p0.position = { x: p.x, y: p.y, z: p.z };
const facing = 0.35;                 // looking at the doorways
g.state.players.p0.yaw = facing;

M.rig.yaw = 0.42;
M.rig.pitch = -0.13;
M.rig.setDistance(6.4);
M.rig._currentDistance = 6.4;
for (let i = 0; i < 60; i++) M.rig.update(p, 1 / 60);

M.body.update(p, facing, 0, 1 / 60);
M.overlay.el.hidden = true;
M.renderer.render(M.world.scene, M.camera);
