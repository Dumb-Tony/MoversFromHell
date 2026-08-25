const M = await window.__MFH_READY;
const m = M.movers[0];
m.controller.hardSetPosition({ x: 1.6, y: 0.2, z: -3.2 });
const target = { x: -2.2, y: 1.3, z: -7.4 };
const p = m.controller.position;
m.rig.yaw = Math.atan2(-(target.x - p.x), -(target.z - p.z));
m.rig.pitch = -0.05;
m.rig.setDistance(2.6);
for (let i = 0; i < 45; i++) m.rig.update(p, 1 / 60);
m.body.update(m.controller.position, m.rig.yaw, 0, 1 / 60);
M.registry.syncMeshes(); M.tools.syncMeshes();
M.overlay.el.hidden = true;
for (const h of M.huds) h.el.hidden = true;
document.getElementById('help').hidden = true;
if (M.title) { M.title.start(); M.title.el.hidden = true; }
M.syncSize();
M.renderer.render(M.world.scene, m.camera);
