/* Phase 11 M4: the settings card over the pause card. Pose the rig (a free camera photographs
 * nothing — Dev\INDEX.md), pause through the API, open the card through the same handler the
 * pause card's Settings button calls, present through the rig's camera.
 *   powershell -File tools\shot.ps1 -Setup tools\_shot-settings.js -Out docs\phase17-settings.png */
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
M.game.setPaused(true);
if (M.settingsPanel) M.settingsPanel.show();
M.present(m.camera);
