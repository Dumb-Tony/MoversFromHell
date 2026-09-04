/* Phase 11 build-side (M3): the pause card. Pose the rig on the driveway looking at the
 * house, open the card through the real API and present through the rig's camera so the
 * loop's own frame agrees (a free camera photographs nothing — Dev\INDEX.md).
 *   powershell -File tools\shot.ps1 -Setup tools\_shot-pause.js -Out docs\phase16-pause.png */
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
M.game.setPaused(true);          // M3: opens #pause-screen through the SIM_PAUSED event
M.present(m.camera);
