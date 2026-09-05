/* Phase 23 M18: the settings card's Controls group. Pose the rig (a free camera photographs
 * nothing — Dev\INDEX.md), pause through the API, open the card the way the pause card's
 * Settings button does, scroll the card to the Controls rows, present through the rig's camera.
 *   powershell -File tools\shot.ps1 -Setup tools\_shot-controls.js -Out docs\phase23-controls.png */
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
const binds = document.querySelector('.set-binds');
if (binds) {
  const head = binds.previousElementSibling && /controls/i.test(binds.previousElementSibling.textContent || '') ? binds.previousElementSibling : binds;
  head.scrollIntoView({ block: 'start' });
  // Show a capture in progress on the first rebindable row, so the shot explains itself.
  const btn = binds.querySelector('.set-row.set-bind:not(.fixed) button[data-act="rebind"]');
  if (btn) btn.click();
}
M.present(m.camera);
