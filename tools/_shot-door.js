/* Phase 11 M11: a hung door leaf in the kitchen doorway, seen from the living room.
 *   powershell -File tools\shot.ps1 -Setup tools\_shot-door.js -Out docs\phase20-door.png */
const M = await window.__MFH_READY;
const m = M.movers[0];
const leaves = [...M.registry.entities.values()].filter((e) => e.defId === 'door_leaf_01');
const target = leaves.length ? leaves.map((e) => e.body.translation()).sort((a, b) => Math.abs(a.z + 5) - Math.abs(b.z + 5))[0] : { x: 2.5, y: 1.0, z: -5.0 };
/* Stand off to the side so the leaf is not behind the mover's head (first take). */
m.controller.hardSetPosition({ x: target.x - 1.9, y: 0.2, z: target.z + 1.6 });
const p = m.controller.position;
m.rig.yaw = Math.atan2(-(target.x - p.x), -(target.z - p.z)); m.rig.pitch = -0.12; m.rig.setDistance(2.6);
for (let i = 0; i < 45; i++) m.rig.update(p, 1 / 60);
m.body.update(m.controller.position, m.rig.yaw, 0, 1 / 60);
M.registry.syncMeshes(); M.tools.syncMeshes();
if (M.title) { M.title.start(); M.title.el.hidden = true; }
M.overlay.el.hidden = true;
M.syncSize();
for (let i = 0; i < 6; i++) M.game.frame(16.667);
M.present(m.camera);
