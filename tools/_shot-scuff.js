/* Phase 11 M14: a box thrown into the front wall leaves a scuff and a notice/caption.
 *   powershell -File tools\shot.ps1 -Setup tools\_shot-scuff.js -Out docs\phase21-scuff.png */
const M = await window.__MFH_READY;
const m = M.movers[0];
if (M.title) { M.title.start(); M.title.el.hidden = true; }
M.overlay.el.hidden = true;
const box = [...M.registry.entities.values()].find((e) => e.defId === 'box_small_01');
if (box) { box.body.setTranslation({ x: 1.60, y: 0.60, z: -1.30 }, true); box.body.setLinvel({ x: 0, y: 0, z: -4.5 }, true); box.body.setAngvel({ x: 0, y: 0, z: 0 }, true); }
for (let i = 0; i < 40; i++) M.game.frame(16.667);
m.controller.hardSetPosition({ x: 2.6, y: 0.2, z: 1.4 });
const p = m.controller.position;
m.rig.yaw = Math.atan2(-(1.4 - p.x), -(-1.9 - p.z)); m.rig.pitch = -0.05; m.rig.setDistance(2.2);
for (let i = 0; i < 45; i++) m.rig.update(p, 1 / 60);
m.body.update(m.controller.position, m.rig.yaw, 0, 1 / 60);
M.registry.syncMeshes(); M.tools.syncMeshes(); M.syncSize();
for (let i = 0; i < 4; i++) M.game.frame(16.667);
M.present(m.camera);
