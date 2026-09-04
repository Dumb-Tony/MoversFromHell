/* Phase 11 M9: the caption line — a cue's caption under the HUD after an impact, with the
 * settings card's captions switch on (default). Pose the rig on the driveway, raise one IMPACT
 * through the bus (the same path the damage system uses), feed the HUD, present.
 *   powershell -File tools\shot.ps1 -Setup tools\_shot-caption.js -Out docs\phase19-caption.png */
import { EVENTS } from '../src/core/eventBus.js';
const M = await window.__MFH_READY;
const m = M.movers[0];
m.controller.hardSetPosition({ x: 2.2, y: 0.2, z: 7.5 });
m.rig.yaw = Math.atan2(-(1.0 - 2.2), -(-2.0 - 7.5)); m.rig.pitch = -0.05;
for (let i = 0; i < 45; i++) m.rig.update(m.controller.position, 1 / 60);
m.body.update(m.controller.position, m.rig.yaw, 0, 1 / 60);
M.registry.syncMeshes(); M.tools.syncMeshes();
if (M.title) { M.title.start(); M.title.el.hidden = true; }
M.overlay.el.hidden = true;
M.syncSize();
for (let i = 0; i < 6; i++) M.game.frame(16.667);
const box = [...M.registry.entities.values()].find((e) => e.defId && e.defId.startsWith('box'));
const p = box ? box.body.translation() : { x: 1, y: 0.3, z: 6 };
M.game.bus.emit(EVENTS.IMPACT, { entityId: box ? box.id : 'box', relVelocity: 3.2, position: { x: p.x, y: p.y, z: p.z }, materials: ['cardboard'] }, M.game.clock.simTimeMs);
for (let i = 0; i < 3; i++) M.game.frame(16.667);   // the caption is fed on the render/frame path
M.present(m.camera);
