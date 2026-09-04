/* Phase 15 world probe — scratch self-check for scene.js / lighting.js / contactBlobs.js.
 *
 *   .\tools\smoketest.ps1 -Tests tools\_probe-world.js
 *
 * Re-runs m13's B1/B1b Box3 sweeps with the EXACT box construction, extends them to the
 * destination's doors and front aperture, and pins the phase-15 return handles. Not a gate
 * suite; the orchestrator folds what matters into m13 section G. */
import { APERTURES, REFERENCE_DIMS } from '../src/render/scene.js';
import { INTERIOR_DOORS } from '../src/world/house.js';
import { DEST_DOORS, DEST_APERTURE, DEST_SHELL } from '../src/world/destination.js';
import { ContactBlobs } from '../src/render/contactBlobs.js';
import { shadowMapTypeFor, LIGHTING } from '../src/render/lighting.js';
import { texGrass, heightFor, getRenderTier } from '../src/render/textures.js';

const lines = [];
let passes = 0, fails = 0;
function ok(name, cond, detail = '') {
  if (cond) { passes++; lines.push(`PASS  ${name}`); }
  else { fails++; lines.push(`FAIL  ${name}${detail ? '  <- ' + detail : ''}`); }
}
const eq = (n, a, b) => ok(n, a === b, `got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
let _pre = null;
function emit(status) {
  if (!_pre) { _pre = document.createElement('pre'); _pre.id = 'test-out'; document.body.appendChild(_pre); }
  const tail = status || (fails === 0 ? `ALL-PASS  ${passes} assertions` : `FAILURES  ${fails} of ${passes + fails}`);
  _pre.textContent = '==MFHTEST-BEGIN==\n' + lines.join('\n') + '\n\n' + tail + '\n==MFHTEST-END==';
}
emit('booting...');
let M;
try { M = await window.__MFH_READY; }
catch (e) { fails++; lines.push(`FAIL  boot threw  <- ${e && e.message}`); lines.push((e && e.stack || '').split('\n').slice(0, 8).join('\n')); emit(); throw e; }
const { world, registry } = M;
const THREE = window.THREE;

lines.push(`      colliders: ${world.colliders.length}  tier: ${world.tier}`);
/* 40, measured 2026-09-03 with every addCollider() call site byte-identical to phase 14's
 * (this phase only re-materials and adds collider-free geometry). The histogram is printed so
 * a change names the tag that moved. */
ok('W1 collider count is the measured 40 (unchanged from phase 14)', world.colliders.length === 40, `${world.colliders.length}`);
{
  const hist = {};
  for (const c of world.colliders) { const k = String(c.tag).replace(/_.*$/, ''); hist[k] = (hist[k] || 0) + 1; }
  lines.push('      tags: ' + Object.entries(hist).map(([k, v]) => `${k}=${v}`).join(' '));
}

// ---- the exact B1 / B1b boxes, plus the destination's ----------------------------------
const boxes = [];
const wallZ = -2.0;
for (const a of APERTURES) {
  boxes.push({ id: a.id, box: new THREE.Box3(
    new THREE.Vector3(a.x - a.gap / 2 + 0.02, 0.06, wallZ - 0.20),
    new THREE.Vector3(a.x + a.gap / 2 - 0.02, REFERENCE_DIMS.doorwayHeight - 0.02, wallZ + 0.20)) });
}
const doorBox = (dr) => {
  const half = dr.gap / 2 - 0.02;
  return dr.axis === 'x'
    ? new THREE.Box3(new THREE.Vector3(dr.centre - half, 0.06, dr.at - 0.20), new THREE.Vector3(dr.centre + half, dr.height - 0.02, dr.at + 0.20))
    : new THREE.Box3(new THREE.Vector3(dr.at - 0.20, 0.06, dr.centre - half), new THREE.Vector3(dr.at + 0.20, dr.height - 0.02, dr.centre + half));
};
for (const dr of INTERIOR_DOORS) boxes.push({ id: dr.id, box: doorBox(dr) });
for (const dr of DEST_DOORS) boxes.push({ id: dr.id, box: doorBox(dr) });
boxes.push({ id: DEST_APERTURE.id, box: new THREE.Box3(
  new THREE.Vector3(DEST_APERTURE.x - DEST_APERTURE.gap / 2 + 0.02, 0.06, DEST_SHELL.maxZ - 0.20),
  new THREE.Vector3(DEST_APERTURE.x + DEST_APERTURE.gap / 2 - 0.02, REFERENCE_DIMS.doorwayHeight - 0.02, DEST_SHELL.maxZ + DEST_SHELL.wallT + 0.20)) });

const isEntity = (o) => { for (const e of registry.entities.values()) { if (e.mesh === o || e.mesh.children.includes(o)) return true; } return false; };
const bad = [];
for (const { id, box } of boxes) {
  world.scene.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const b = new THREE.Box3().setFromObject(o);
    if (b.isEmpty() || !b.intersectsBox(box)) return;
    const s = b.getSize(new THREE.Vector3());
    if (s.x > 30 || s.z > 30) return;
    if (isEntity(o)) return;
    bad.push(`${id}: ${o.name || '(unnamed ' + o.geometry.type + ')'} ${s.x.toFixed(2)}x${s.y.toFixed(2)}x${s.z.toFixed(2)}`);
  });
}
ok('W2 no static mesh < 30 m enters any front / interior / destination door clear box', bad.length === 0, bad.slice(0, 6).join(' | '));

// ---- phase-15 handles -----------------------------------------------------------------
eq('W3 skirts.length === 2', (world.skirts || []).length, 2);
ok('W4 skirting.length > 0', (world.skirting || []).length > 0, `${(world.skirting || []).length}`);
eq('W5 plankFloors.length === 3', (world.plankFloors || []).length, 3);
ok('W6 every plank floor has a color attribute matching position count',
   (world.plankFloors || []).every((m) => m.geometry.attributes.color && m.geometry.attributes.color.count === m.geometry.attributes.position.count));
ok('W7 every plank floor material is vertexColors boards', (world.plankFloors || []).every((m) => m.material.vertexColors === true && m.material.userData.kind === 'boards'));
lines.push('      planks: ' + (world.plankFloors || []).map((m) => `${m.name}=${m.geometry.userData.planks}`).join(', ') +
           `  skirting boards: ${(world.skirting || []).length}`);
ok('W8 skirt / skirting names identify the strip', (world.skirting || []).every((m) => /^skirting:/.test(m.name)) && (world.skirts || []).every((m) => /^aoSkirt:/.test(m.name)));
ok('W9 AO skirts multiply-blend and are not tone mapped', (world.skirts || []).every((m) => m.material.blending === THREE.MultiplyBlending && m.material.toneMapped === false));

// ---- lights ------------------------------------------------------------------------------
let lights = 0, casting = 0;
world.scene.traverse((o) => { if (o.isLight) { lights++; if (o.castShadow) casting++; } });
lines.push(`      lights: ${lights}, casters: ${casting}`);
ok('W10 lights <= 12', lights <= 12, `${lights}`);
ok('W11 casters <= 5', casting <= 5, `${casting}`);
if (world.tier === 'gpu') {
  const colours = new Set((world.roomLights || []).map((s) => s.color.getHex()));
  ok('W12 room spots carry per-room colours', colours.size >= 3, `${colours.size} distinct`);
  ok('W13 room spot shadow radius applied', (world.roomLights || []).filter((s) => s.castShadow).every((s) => s.shadow.radius === LIGHTING.room.shadowRadius));
}
ok('W14 sun shadow bias / radius from LIGHTING', world.sun.shadow.bias === LIGHTING.sunShadowBias && world.sun.shadow.radius === LIGHTING.sunShadowRadius);
eq('W15 shadowMapTypeFor(gpu) is VSM', shadowMapTypeFor(THREE, 'gpu'), THREE.VSMShadowMap);
eq('W16 shadowMapTypeFor(software) is PCFSoft', shadowMapTypeFor(THREE, 'software'), THREE.PCFSoftShadowMap);

// ---- materials by kind -------------------------------------------------------------------
let unkinded = [], bulbs = 0, bulbsUnmapped = 0, skyTM = null;
world.scene.traverse((o) => {
  if (!o.isMesh) return;
  if (o.name === 'sky') skyTM = o.material.toneMapped;
  if (o.name === 'bulb') { bulbs++; if (o.material.toneMapped === false) bulbsUnmapped++; }
  for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
    if (!m) continue;
    if (m.type === 'MeshPhongMaterial' && !m.userData.kind) {
      unkinded.push(`${o.name || '?'}/${o.geometry.type}/parent=${o.parent && (o.parent.name || o.parent.type)}/ent=${isEntity(o)}`);
    }
  }
});
/* The four unkinded meshes are tools.js's matte(def.colour) blockouts (dolly, blanket, ramp,
 * screwdriver) — the orchestrator's 3-line switch to buildToolVisual() retires them. */
ok('W17 every Phong material in the world names a kind (4 tool blockouts allowed until tools.js migrates)',
   unkinded.length <= 4, unkinded.slice(0, 6).join(' | '));
lines.push(`      unkinded: ${unkinded.length}`);
// Pendants hang per ROOM now (not per room light), so both tiers carry bulbs.
ok('W18 sky toneMapped true; bulbs toneMapped false (both tiers)', skyTM === true && bulbs > 0 && bulbs === bulbsUnmapped, `sky=${skyTM} bulbs=${bulbs}/${bulbsUnmapped}`);
ok('W19 fog reads RENDER.look.fog', world.scene.fog && world.scene.fog.near === 30 && world.scene.fog.far === 120);

/* ---- the two m13 section-G assertions the review found failing, VERBATIM from
 * tools/m13-tests.js:489 and :499-507, so this probe fails exactly when the gate would. */
{
  const weak = [], layers = new Set();
  let bulbsByHex = 0;
  world.scene.traverse((o) => {
    if (!o.isMesh) return;
    for (const mt of (Array.isArray(o.material) ? o.material : [o.material])) {
      if (!mt || !mt.userData) continue;
      if (mt.userData.layer) layers.add(mt.userData.layer);
      if (!Array.isArray(o.material) && mt.type === 'MeshBasicMaterial' && mt.toneMapped === false && mt.color && mt.color.getHex() === 0xfff3d0) bulbsByHex++;
      if (!mt.userData.kind) continue;
      if (!(mt.shininess >= 4) || !mt.specular || mt.specular.getHex() === 0) weak.push(mt.userData.kind);
    }
  });
  ok('W29 (m13 G12 verbatim) every material with userData.kind has shininess >= 4 and a non-black specular',
     weak.length === 0, [...new Set(weak)].slice(0, 6).join(', '));
  ok('W30 (m13 G10a verbatim) bulbs counted by color.getHex() === 0xfff3d0', bulbsByHex > 0, `${bulbsByHex}`);
  ok('W31 multiply decals are tagged userData.layer (aoSkirt, oilStain)', layers.has('aoSkirt') && layers.has('oilStain'), [...layers].join(','));
}
// The tier is pinned inside buildScene, so the harness gets stripped materials regardless of boot order.
eq('W32 getRenderTier() === world.tier after buildScene', getRenderTier(), world.tier);
ok('W33 (m13 G5) no height texture on the software tier / one memoised on gpu',
   world.tier === 'software' ? heightFor(texGrass()) === null : (heightFor(texGrass()) !== null && heightFor(texGrass()) === heightFor(texGrass())));
{
  // The house floor now reaches the front wall's OUTER face (z -1.91): the doorway thresholds are planked.
  const hf = (world.plankFloors || []).find((m) => m.name === 'plankFloor:house');
  const bb = hf ? hf.geometry.boundingBox : null;
  ok('W34 house plank floor reaches the front wall outer face', !!bb && Math.abs(bb.max.z - (-2.0 + 0.09)) < 1e-6, bb ? `${bb.max.z.toFixed(3)}` : 'no floor');
}

// ---- render cost ---------------------------------------------------------------------------
let meshes = 0; world.scene.traverse((o) => { if (o.isMesh) meshes++; });
const cam = M.movers[0].camera;
M.renderer.info.reset();
M.renderer.render(world.scene, cam);
lines.push(`      meshes: ${meshes}  calls: ${M.renderer.info.render.calls}  tris: ${M.renderer.info.render.triangles}  programs: ${M.renderer.info.programs.length}`);
ok('W20 draw calls <= 600 solo', M.renderer.info.render.calls <= 600, `${M.renderer.info.render.calls}`);
ok('W21 meshes < 2600', meshes < 2600, `${meshes}`);

// ---- contact blobs, driven with a fake probe -------------------------------------------------
{
  const scratch = new THREE.Scene();
  const blobs = new ContactBlobs(THREE, scratch);
  const probe = (x, y, z) => (x > 100 ? null : 0.0);
  blobs.update([
    { x: 1, y: 0.25, z: 1, yaw: 0.3, sx: 0.5, sz: 0.5, bottomY: 0.0 },
    { x: 2, y: 1.0, z: 1, yaw: 0, sx: 2.1, sz: 0.9, bottomY: 0.4 },
    { x: 200, y: 0.25, z: 1, yaw: 0, sx: 0.5, sz: 0.5, bottomY: 0.0 },
    { x: 3, y: 0.9, z: 1, yaw: 0, sx: 0.5, sz: 0.5, bottomY: 0.1, disc: true },
    // Lifted past fadeLift (0.6): alpha 0 → hidden. A mover mid-mantle throws no blob.
    { x: 4, y: 1.2, z: 1, yaw: 0, sx: 0.5, sz: 0.5, bottomY: 0.9, disc: true },
  ], probe, [{ position: new THREE.Vector3(0, 2, 0) }]);
  eq('W22 blobs: 3 of 5 sources visible (one beyond maxDist / null probe, one lifted past fadeLift)', blobs.count(), 3);
  const q0 = blobs.pool[0];
  const bb = new THREE.Box3().setFromObject(q0);
  ok('W23 blob bbox top < 0.06', bb.max.y < 0.06, `${bb.max.y.toFixed(4)}`);
  ok('W24 blob is movable, unshadowed, one shared material', q0.userData.movable === true && !q0.castShadow && blobs.pool[1].material === q0.material);
  const a0 = q0.geometry.attributes.color.array[3], a1 = blobs.pool[1].geometry.attributes.color.array[3];
  ok('W25 blob alpha fades with lift (0.45 on the ground, ~0.15 at 0.4 m)', Math.abs(a0 - 0.45) < 1e-6 && Math.abs(a1 - 0.45 * (1 - 0.4 / 0.6)) < 1e-6, `${a0} ${a1}`);
  ok('W26 blob footprint 1.05 x dims', Math.abs(q0.scale.x - 0.525) < 1e-6 && Math.abs(blobs.pool[1].scale.y - 0.945) < 1e-6);
  blobs.update([], probe, []);
  eq('W27 empty update hides everything', blobs.count(), 0);
  blobs.dispose();
  eq('W28 dispose removes the group', scratch.children.length, 0);
}

emit();
