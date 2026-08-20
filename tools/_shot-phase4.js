/* Poses the Phase 4 build for docs/phase4-coop.png: BOTH movers with a hand on the 90 kg
 * couch, one at each end, holding it clear of the floor.
 *
 * The pose is the phase's whole claim in one frame. One mover peaks at 458 N against 883 N of
 * couch and never separates it from the ground (m4 C3); two peak at 895 N and lift it clear.
 * So a picture of that couch off the floor is only possible with both of them pulling. */
const M = await window.__MFH_READY;
const R = M.registry, movers = M.movers;

let couch = null;
for (const e of R.entities.values()) if (e.defId === 'couch_3seat_01') couch = e;

const STEP = 1000 / 60;

/* Same order as main.js: clear forces ONCE, then every mover, then physics. Doing this
 * per-mover is the trap Phase 4 exists to avoid — see grip.js step(). */
const drive = (n, brace = true) => {
  for (let i = 0; i < n; i++) {
    M.physics.clearForces();
    for (const m of movers) {
      m.grips.step(STEP, { brace, simTimeMs: i * STEP });
      m.controller.step(STEP, {
        move: { x: 0, y: 0 },
        forward: { x: -Math.sin(M.rig.yaw), y: 0, z: -Math.cos(M.rig.yaw) },
        right: { x: Math.cos(M.rig.yaw), y: 0, z: -Math.sin(M.rig.yaw) },
        run: false, brace, jump: false, recover: false,
      });
    }
    M.physics.step();
    R.step(STEP);
    M.rig.update(movers[0].controller.position, 1 / 60);
  }
};

const grabWith = (m, hand, target) => {
  const p = m.controller.position;
  M.rig.yaw = Math.atan2(-(target.x - p.x), -(target.z - p.z));
  M.rig.pitch = Math.atan2(target.y - (p.y + 1.4), Math.hypot(target.x - p.x, target.z - p.z));
  for (let i = 0; i < 20; i++) M.rig.update(p, 1 / 60);
  const c = M.camera.position;
  M.rig.yaw = Math.atan2(-(target.x - c.x), -(target.z - c.z));
  M.rig.pitch = Math.atan2(target.y - c.y, Math.hypot(target.x - c.x, target.z - c.z));
  return m.grips.tryGrab(hand, m.id, 0);
};

if (couch && movers.length >= 2) {
  // Park the tableau on open apron rather than where the couch spawns: the Phase 3 spawn sits
  // in the box pile, and a mover standing on a crate reads as a bug in a documentation shot.
  const t = { x: 0.6, y: 0.44, z: 5.4 };
  couch.body.setTranslation(t, true);
  couch.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  couch.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  couch.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  M.physics.primeQueries();

  // One mover at each END of the 2.10 m couch. Standing along the front and hauling up only
  // tips it onto its back edge — it looks like a lift and is not one (see m4's liftTogether).
  movers[0].controller.hardSetPosition({ x: t.x - 1.95, y: 0.1, z: t.z });
  movers[1].controller.hardSetPosition({ x: t.x + 1.95, y: 0.1, z: t.z });
  for (const m of movers) { m.controller._vel.x = 0; m.controller._vel.z = 0; m.controller.velocityY = 0; }
  drive(30);

  const held = [];
  for (const [i, side] of [[0, -1], [1, +1]]) {
    const g = grabWith(movers[i], 'right', { x: t.x + side * 1.00, y: 0.44, z: t.z });
    if (g) held.push({ m: movers[i], base: { f: g.holdLocal.f, u: g.holdLocal.u } });
  }

  // Raise both hands together, straight up in world space. Decomposed onto the aim basis:
  // nudging holdLocal.u alone tilts with the pitch and lifts less than it looks like.
  for (let k = 0; k < 200; k++) {
    const h = Math.min(1, k / 150) * 0.62;
    for (const held1 of held) {
      const live = held1.m.grips.grips.right;
      if (!live) continue;
      const sp = Math.sin(held1.m.grips.aimPitch), cp = Math.cos(held1.m.grips.aimPitch);
      live.holdLocal.f = held1.base.f + h * sp;
      live.holdLocal.u = held1.base.u + h * cp;
    }
    drive(1);
  }

  // Frame both movers and the couch from the side, so the gap under it is visible. The
  // couch runs along X, so looking down -Z puts all three in profile.
  const c2 = couch.body.translation();
  M.rig.yaw = 0; M.rig.pitch = -0.02;
  M.rig.setDistance(5.6); M.rig._currentDistance = 5.6;
  for (let i = 0; i < 40; i++) M.rig.update({ x: c2.x, y: 0.0, z: c2.z }, 1 / 60);

  // Every mover gets its own mesh in Phase 4, so all of them need posing, not just p0.
  for (const m of movers) {
    const sp = M.game.state.players[m.id];
    sp.position = { ...m.controller.position };
    m.body.update(m.controller.position, m.yaw, 0, 1 / 60);
  }
  R.syncMeshes();
  M.hud.update(movers[0].grips.status());
  M.overlay.el.hidden = true;
}

M.syncSize();
M.renderer.render(M.world.scene, M.camera);
