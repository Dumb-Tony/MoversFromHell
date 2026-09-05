/* Phase 25 M22: the first-minute card at step 1 — a fresh browser, START pressed, a mover in the
 * living room looking at a box. Pose the rig (a free camera photographs nothing — Dev\INDEX.md).
 *   powershell -File tools\shot.ps1 -Setup tools\_shot-walkthrough.js -Query walkthrough=1 -Out docs\phase25-walkthrough.png */
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
for (let i = 0; i < 6; i++) M.game.frame(16.667);   // the card arms on START and lays out on the first frames
if (M.walkthrough && M.walkthrough.relayout) M.walkthrough.relayout();
M.present(m.camera);
