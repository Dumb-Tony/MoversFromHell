/* Phase 11 M6: the settlement sheet with the run report and the §27.3 questionnaire.
 * Pose the rig, settle through the API (M.settle pauses and shows the sheet), present.
 *   powershell -File tools\shot.ps1 -Setup tools\_shot-settlement.js -Out docs\phase18-settlement.png */
const M = await window.__MFH_READY;
const m = M.movers[0];
m.controller.hardSetPosition({ x: 2.2, y: 0.2, z: 7.5 });
m.rig.yaw = Math.atan2(-(1.0 - 2.2), -(-2.0 - 7.5)); m.rig.pitch = -0.05;
for (let i = 0; i < 45; i++) m.rig.update(m.controller.position, 1 / 60);
m.body.update(m.controller.position, m.rig.yaw, 0, 1 / 60);
M.registry.syncMeshes(); M.tools.syncMeshes();
if (M.title) { M.title.start(); M.title.el.hidden = true; }
document.getElementById('help').hidden = true;
M.overlay.el.hidden = true;
M.syncSize();
for (let i = 0; i < 30; i++) M.game.frame(16.667);
M.settle();
M.present(m.camera);
