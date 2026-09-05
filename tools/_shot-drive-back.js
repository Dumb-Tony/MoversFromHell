/* Phase 11 M13: the choice at the cab after the first delivery — 'drive back for N more' (E) or
 * settle and leave them behind (Q). Loads one box, drives the route (1681 frames), delivers it,
 * then stands at the cab so the prompt shows both.
 *   powershell -File tools\shot.ps1 -Setup tools\_shot-drive-back.js -Out docs\phase21-drive-back.png -Budget 40000 */
const M = await window.__MFH_READY;
const m = M.movers[0];
if (M.title) { M.title.start(); M.title.el.hidden = true; }
M.overlay.el.hidden = true;
// load one small box into the truck by parking it on the deck, then let cargo count it
const I = M.cargoInterior; const box = [...M.registry.entities.values()].find((e) => e.defId === 'box_small_01');
if (box) { box.body.setTranslation({ x: M.truckPose.x, y: I.minY + 0.30, z: I.maxZ - 1.0 }, true); box.body.setLinvel({ x: 0, y: 0, z: 0 }, true); }
for (let i = 0; i < 90; i++) M.game.frame(16.667);
M.route.depart({ heading: 'out' }); M.game.setPhase('transit', { ok: true });
for (let i = 0; i < 1681; i++) M.game.frame(16.667);
// deliver the box by placing it in its destination room, wait the dwell
if (box) { const z = M.destZones.find((d) => d.id === 'dest_living') || M.destZones[0]; const c = { x: (z.minX + z.maxX) / 2, y: 0.3, z: (z.minZ + z.maxZ) / 2 };
  box.body.setTranslation(c, true); box.body.setLinvel({ x: 0, y: 0, z: 0 }, true); }
for (let i = 0; i < 100; i++) M.game.frame(16.667);
// stand at the cab
const cab = { x: M.truckPose.x - 1.6, z: M.truckPose.z + 2.6 };
m.controller.hardSetPosition({ x: cab.x, y: 0.2, z: cab.z + 2.2 });
const p = m.controller.position;
m.rig.yaw = Math.atan2(-(cab.x - p.x), -(cab.z - p.z)); m.rig.pitch = -0.1; m.rig.setDistance(2.4);
for (let i = 0; i < 45; i++) m.rig.update(p, 1 / 60);
m.body.update(m.controller.position, m.rig.yaw, 0, 1 / 60);
M.registry.syncMeshes(); M.tools.syncMeshes(); M.syncSize();
for (let i = 0; i < 6; i++) M.game.frame(16.667);
M.present(m.camera);
