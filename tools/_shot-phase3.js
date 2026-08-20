/* Poses the Phase 3 build for docs/phase3-heavy.png: the mover with both hands on the
 * 90 kg couch, which is the object the whole phase exists for. */
const M = await window.__MFH_READY;
const g = M.game, P = M.player, R = M.registry, G = M.grips;

let couch = null;
for (const e of R.entities.values()) if (e.defId === 'couch_3seat_01') couch = e;

const drive = (n, opts = {}) => {
  for (let i = 0; i < n; i++) {
    G.step(1000 / 60, { brace: !!opts.brace, simTimeMs: i * 16.7 });
    P.step(1000 / 60, {
      move: opts.move || { x: 0, y: 0 },
      forward: { x: -Math.sin(M.rig.yaw), y: 0, z: -Math.cos(M.rig.yaw) },
      right: { x: Math.cos(M.rig.yaw), y: 0, z: -Math.sin(M.rig.yaw) },
      run: false, brace: !!opts.brace, jump: false, recover: false,
    });
    M.physics.step();
    R.step(1000 / 60);
    M.rig.update(P.position, 1 / 60);
  }
};

if (couch) {
  const t = couch.body.translation();
  P.hardSetPosition({ x: t.x + 0.2, y: 0.1, z: t.z + 1.35 });
  P._vel.x = 0; P._vel.z = 0; P.velocityY = 0;
  drive(40);

  const p = P.position;
  const aim = { x: t.x, y: t.y + 0.28, z: t.z + 0.45 };
  M.rig.yaw = Math.atan2(-(aim.x - p.x), -(aim.z - p.z));
  M.rig.pitch = Math.atan2(aim.y - (p.y + 1.4), Math.hypot(aim.x - p.x, aim.z - p.z));
  for (let i = 0; i < 20; i++) M.rig.update(P.position, 1 / 60);
  const c = M.camera.position;
  M.rig.yaw = Math.atan2(-(aim.x - c.x), -(aim.z - c.z));
  M.rig.pitch = Math.atan2(aim.y - c.y, Math.hypot(aim.x - c.x, aim.z - c.z));
  G.tryGrab('left', 'p0', 0);
  G.tryGrab('right', 'p0', 0);
  drive(140, { brace: true });
}

// Frame it so the couch, the mover and the doorways all read.
M.rig.yaw = 0.62; M.rig.pitch = -0.17;
M.rig.setDistance(6.2); M.rig._currentDistance = 6.2;
for (let i = 0; i < 40; i++) M.rig.update(P.position, 1 / 60);

g.state.players.p0.position = { ...P.position };
M.body.update(P.position, 0.62, 0, 1 / 60);
R.syncMeshes();
M.hud.update(G.status());
M.overlay.el.hidden = true;
M.renderer.render(M.world.scene, M.camera);
