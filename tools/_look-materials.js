/* Phase 15 look-dev shot: every material kind, one sphere and one rounded box each, under
 * the real sun and sky, through the real post chain.
 *
 *   powershell -File tools\shot.ps1 -Setup tools\_look-materials.js -Out shots\phase15-materials.png
 *
 * This is the user's complaint made into a photograph: "everything reads as different
 * colours of the same texture". Thirteen kinds in a row; if two of them read the same, the
 * material library has failed regardless of what m13 G4 says about their parameters. The
 * sphere shows the light response (specular lobe, fresnel rim, env reflection); the box
 * shows the albedo and relief at the working scale. Both use the same 0.5 m texel.
 */

import { RENDER } from '../src/config.js';
import { surface, KINDS } from '../src/render/materials.js';
import { roundedBox } from '../src/render/prefabs.js';
import { texPlaster, texWood, texBoards, texCardboard, texFabric, texPaint, texDenim, texHiVis } from '../src/render/textures.js';

const M = await window.__MFH_READY;
const THREE = window.THREE;
const scene = M.world.scene;

/* Each headline kind with the albedo the scene actually gives it. surface() uses the row's
 * own texture only when the colour is white (steel, grass, asphalt); every other kind gets
 * its factory here, as scene.js / prefabs.js do. glass and plastic are the two legitimately
 * smooth flat colours — their "texture" is the env reflection and the specular lobe. */
const WHITE = 0xffffff;
const LINEUP = {
  plaster: [0xffffff, { map: texPlaster(), repeat: [2, 2] }],
  walnut:  [0xffffff, { map: texWood('walnut'), repeat: [2, 2] }],
  boards:  [0xffffff, { map: texBoards(30, 'floor'), repeat: [2, 2] }],
  card:    [0xffffff, { map: texCardboard(), repeat: [1, 1] }],
  fabric:  [0xffffff, { map: texFabric(14), repeat: [2, 2] }],
  steel:   [WHITE, {}],
  paint:   [0xffffff, { map: texPaint(4, 0.7, 0.48), repeat: [1, 1] }],
  plastic: [0xe0e4e8, {}],
  glass:   [0xa9c9de, { transparent: true, opacity: 0.55 }],
  grass:   [WHITE, {}],
  asphalt: [WHITE, {}],
  denim:   [0xffffff, { map: texDenim(), repeat: [2, 2] }],
  hivis:   [0xffffff, { map: texHiVis(), repeat: [1, 1] }],
};
const kinds = Object.keys(LINEUP).filter((k) => KINDS[k]);

/* Two rows of seven on the front lawn (the look shot's camera stands at z ≈ 7.5 looking at
 * the house at z = -2, so z = 3..5 is open grass and path in every phase so far), the crew
 * hidden so nothing stands in the lineup. Order is KINDS order, top row first. */
const row = new THREE.Group();
row.name = 'look-materials';
const pitch = 1.0, r = 0.32, w = 0.55, perRow = 7, rowGap = 1.7;
const sphereGeo = new THREE.SphereGeometry(r, 32, 24);
kinds.forEach((k, i) => {
  const mat = surface(k, LINEUP[k][0], LINEUP[k][1]);
  const rowI = Math.floor(i / perRow), col = i % perRow;
  const n = Math.min(perRow, kinds.length - rowI * perRow);
  const x = (col - (n - 1) / 2) * pitch, z = rowI * rowGap;
  const s = new THREE.Mesh(sphereGeo, mat);
  s.position.set(x, r + 0.02 + w + 0.12, z);
  s.castShadow = s.receiveShadow = true;
  const b = new THREE.Mesh(roundedBox(THREE, w, w, w, { radius: 0.05, uv: 'face' }), mat);
  b.position.set(x, w / 2 + 0.02, z);
  b.castShadow = b.receiveShadow = true;
  row.add(s, b);
});
row.position.set(0.5, 0, 3.2);
scene.add(row);
for (const m of M.movers) if (m.body && m.body.group) m.body.group.visible = false;

/* A label strip is not possible without text textures; the order is the KINDS order, which
 * the caption in docs/CHANGELOG.md records. */

/* ⚠ A free camera photographs NOTHING here: the render loop's own rAF frame lands after this
 * script's present() and repaints the canvas from mover 0's rig (measured — the first cut of
 * this shot was the house front with no lineup in it). Every shot script poses the RIG, so
 * the loop's frame and ours agree; this one does the same, with the body hidden. */
const me = M.movers[0];
/* The truck parks at z 8.3..12.5 (TRUCK_POSE 10.40, a 4.2 m box), so a long boom from here
 * puts the camera INSIDE the cargo box (measured — corrugated walls framing the shot). Short
 * and steep instead: camera ≈ z 8.0, just outside the box, looking down at both rows. */
me.controller.hardSetPosition({ x: row.position.x, y: 0.2, z: row.position.z + rowGap + 1.7 });
me.rig.yaw = 0; me.rig.pitch = -0.42; me.rig.setDistance(1.7);
for (let i = 0; i < 60; i++) me.rig.update(me.controller.position, 1 / 60);
const cam = me.camera;

M.overlay.el.hidden = true;
for (const h of M.huds) h.el.hidden = true;
document.getElementById('help').hidden = true;
if (M.title) { M.title.start(); M.title.el.hidden = true; }
M.syncSize();
M.registry.syncMeshes(); M.tools.syncMeshes();
M.present(cam);
