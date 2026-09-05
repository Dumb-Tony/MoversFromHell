/* Phase 11 M12: the couch's legs as loose pieces on the kitchen floor after disassembly.
 *   powershell -File tools\shot.ps1 -Setup tools\_shot-pieces.js -Out docs\phase20-pieces.png */
import { disassemble } from '../src/tools/tools.js';
const M = await window.__MFH_READY;
const couch = [...M.registry.entities.values()].find((e) => e.defId === 'couch_3seat_01');
if (couch) { try { disassemble(M.registry, couch, 'legs'); } catch (e) { console.warn('disassemble', e.message); } }
for (let i = 0; i < 90; i++) M.game.frame(16.667);   // let the pieces settle on the floor
M.registry.syncMeshes();
const m = M.movers[0];
const c = couch ? couch.body.translation() : { x: 2.5, z: -8.4 };
/* From the couch's side: the legs lie in a row along its +z face, which a camera behind a
 * mover standing on that side hides under the mover (first take). */
/* Inside the kitchen (x 0..5, z -9..-5), east of the leg row, looking back along it. The
 * second take from the west put the boom camera behind the partition wall. */
m.controller.hardSetPosition({ x: c.x + 1.6, y: 0.2, z: c.z + 1.6 });
const p = m.controller.position;
m.rig.yaw = Math.atan2(-(c.x - 0.4 - p.x), -(c.z + 0.8 - p.z)); m.rig.pitch = -0.55; m.rig.setDistance(1.3);
for (let i = 0; i < 45; i++) m.rig.update(p, 1 / 60);
m.body.update(m.controller.position, m.rig.yaw, 0, 1 / 60);
M.registry.syncMeshes(); M.tools.syncMeshes();
if (M.title) { M.title.start(); M.title.el.hidden = true; }
M.overlay.el.hidden = true;
M.syncSize();
for (let i = 0; i < 6; i++) M.game.frame(16.667);
M.present(m.camera);
