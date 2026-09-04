/* Phase 11 M8: the couch with its legs off, on its side, at the kitchen's 34-inch door.
 *   powershell -File tools\shot.ps1 -Setup tools\_shot-couch-legs.js -Out docs\phase18-couch-legs.png */
import { disassemble } from '../src/tools/tools.js';
const M = await window.__MFH_READY;
const couch = [...M.registry.entities.values()].find((e) => e.defId === 'couch_3seat_01');
if (couch) {
  try { disassemble(M.registry, couch, 'legs'); } catch (e) { console.warn('disassemble', e.message); }
  M.registry.syncMeshes();
}
const m = M.movers[0];
const c = couch ? couch.body.translation() : { x: 2.5, z: -8.4 };
/* Inside the kitchen, short steep boom: a longer boom puts the camera in the living room and
 * the 34" doorway frames the shot instead of the couch (first take). */
m.controller.hardSetPosition({ x: c.x + 0.9, y: 0.2, z: c.z + 1.9 });
const p = m.controller.position;
m.rig.yaw = Math.atan2(-(c.x - p.x), -(c.z - p.z)); m.rig.pitch = -0.55; m.rig.setDistance(1.1);
for (let i = 0; i < 45; i++) m.rig.update(p, 1 / 60);
m.body.update(m.controller.position, m.rig.yaw, 0, 1 / 60);
M.registry.syncMeshes(); M.tools.syncMeshes();
if (M.title) { M.title.start(); M.title.el.hidden = true; }
M.overlay.el.hidden = true;
M.syncSize();
for (let i = 0; i < 6; i++) M.game.frame(16.667);
M.present(m.camera);
