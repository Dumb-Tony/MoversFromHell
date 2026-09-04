/* Poses the Phase 2 build for docs/phase2-grip.png: a mover holding a box, with the HUD
 * reticle showing the grip state, framed against the doorways so scale still reads. */
const M = await window.__MFH_READY;
const g = M.game, P = M.player, R = M.registry, G = M.grips;

// Stand on the driveway near the spawned boxes.
P.hardSetPosition({ x: -1.6, y: 0.1, z: 2.2 });
P._vel.x = 0; P._vel.z = 0; P.velocityY = 0;

const drive = (n) => {
  for (let i = 0; i < n; i++) {
    P.step(1000 / 60, {
      move: { x: 0, y: 0 }, forward: { x: -Math.sin(M.rig.yaw), y: 0, z: -Math.cos(M.rig.yaw) },
      right: { x: Math.cos(M.rig.yaw), y: 0, z: -Math.sin(M.rig.yaw) },
      run: false, brace: false, jump: false, recover: false,
    });
    G.step(1000 / 60, { brace: false, simTimeMs: i * 16.7 });
    M.physics.step();
    R.step(1000 / 60);
    M.rig.update(P.position, 1 / 60);
  }
};

M.rig.yaw = 0.30; M.rig.pitch = -0.30;
drive(40);

// Grab the nearest box and raise it to chest height.
let nearest = null, best = 1e9;
for (const e of R.entities.values()) {
  const t = e.body.translation();
  const d = Math.hypot(t.x - P.position.x, t.z - P.position.z);
  if (d < best) { best = d; nearest = e; }
}
if (nearest) {
  const t = nearest.body.translation();
  const p = P.position;
  M.rig.yaw = Math.atan2(-(t.x - p.x), -(t.z - p.z));
  M.rig.pitch = Math.atan2(t.y - (p.y + 1.4), Math.hypot(t.x - p.x, t.z - p.z));
  for (let i = 0; i < 20; i++) M.rig.update(P.position, 1 / 60);
  const c = M.camera.position;
  M.rig.yaw = Math.atan2(-(t.x - c.x), -(t.z - c.z));
  M.rig.pitch = Math.atan2(t.y - c.y, Math.hypot(t.x - c.x, t.z - c.z));
  const grip = G.tryGrab('right', 'p0', 0);
  if (grip) {
    // Raise gently and then let it settle: a fast lift overloads the grip and the shot
    // captures the SLIPPING reticle instead of a steady hold.
    const u0 = grip.holdLocal.u;
    for (let i = 0; i < 260; i++) {
      const h = G.grips.right;
      if (h) h.holdLocal.u = u0 + 0.22 * Math.min(1, i / 140);
      drive(1);
    }
  }
}

// Frame the shot: pull back and look at the mover holding the box.
M.rig.yaw = 0.55; M.rig.pitch = -0.16;
M.rig.setDistance(5.4); M.rig._currentDistance = 5.4;
for (let i = 0; i < 40; i++) M.rig.update(P.position, 1 / 60);

g.state.players.p0.position = { ...P.position };
M.body.update(P.position, 0.55, 0, 1 / 60);
R.syncMeshes();
M.hud.update(G.status());
M.overlay.el.hidden = true;
M.present(M.camera);
