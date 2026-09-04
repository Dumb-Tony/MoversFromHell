/* Phase 11 M5: the HUD with the objective line and device-aware glyphs — a mover in the
 * living room looking at the couch, so the prompt shows the verb, the glyph and the room hint.
 *   powershell -File tools\shot.ps1 -Setup tools\_shot-hud.js -Out docs\phase17-hud.png */
const M = await window.__MFH_READY;
const m = M.movers[0];
m.controller.hardSetPosition({ x: 1.6, y: 0.2, z: -3.2 });
const target = { x: -2.2, y: 0.6, z: -7.4 };
const p = m.controller.position;
m.rig.yaw = Math.atan2(-(target.x - p.x), -(target.z - p.z)); m.rig.pitch = -0.08;
m.rig.setDistance(2.6);
for (let i = 0; i < 45; i++) m.rig.update(p, 1 / 60);
m.body.update(m.controller.position, m.rig.yaw, 0, 1 / 60);
M.registry.syncMeshes(); M.tools.syncMeshes();
if (M.title) { M.title.start(); M.title.el.hidden = true; }
M.overlay.el.hidden = true;
M.syncSize();
for (let i = 0; i < 6; i++) M.game.frame(16.667);   // let the prompt/objective refresh from the real loop path
M.present(m.camera);
