/* The title card over a live world — docs/phase13-title.png. The backdrop is the game
 * running, not a picture: the simulation is never paused for this screen. */
const M = await window.__MFH_READY;
const m = M.movers[0];
m.controller.hardSetPosition({ x: 3.0, y: 0.2, z: 8.2 });
const target = { x: 0.4, y: 1.5, z: -1.0 };
const p = m.controller.position;
m.rig.yaw = Math.atan2(-(target.x - p.x), -(target.z - p.z));
m.rig.pitch = -0.06;
m.rig.setDistance(5.2);
for (let i = 0; i < 45; i++) m.rig.update(p, 1 / 60);
m.body.update(m.controller.position, m.rig.yaw, 0, 1 / 60);
M.registry.syncMeshes(); M.tools.syncMeshes();
M.overlay.el.hidden = true;
for (const h of M.huds) h.el.hidden = true;
document.getElementById('help').hidden = true;
M.syncSize();
M.present(m.camera);
