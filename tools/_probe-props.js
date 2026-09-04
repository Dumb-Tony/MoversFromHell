/* Props self-check (Phase 15) — the props agent's hand-over probe, runnable standalone.
 *
 * Does NOT wait for window.__MFH_READY: it only needs THREE and the prefab modules, so it
 * runs under tools\smoketest.ps1 -Tests tools\_probe-props.js AND in a bare page that loads
 * three.min.js first. Everything it asserts is what m13 A1/A2/G3/G6/G7/G14 will assert.
 */
import { OBJECT_DEFS } from '../src/objects/definitions.js';
import { TOOL_DEFS } from '../src/tools/definitions.js';
import { RENDER } from '../src/config.js';
import { buildPrefab, prefabBounds, PREFABS, buildToolVisual, roundedBox, roundedSlab, bakeVertexAO, PREFAB_PALETTE } from '../src/render/prefabs.js';
import { makeBlockout, BODY_RATIOS } from '../src/render/playerBody.js';

const lines = [];
let passes = 0, fails = 0;
function ok(name, cond, detail = '') {
  if (cond) { passes++; lines.push(`PASS  ${name}`); }
  else { fails++; lines.push(`FAIL  ${name}${detail ? '  <- ' + detail : ''}`); }
}
function emit() {
  const pre = document.createElement('pre');
  pre.id = 'probe-out';
  const tail = fails === 0 ? `ALL-PASS  ${passes} assertions` : `FAILURES  ${fails} of ${passes + fails}`;
  pre.textContent = '==MFHTEST-BEGIN==\n' + lines.join('\n') + '\n\n' + tail + '\n==MFHTEST-END==';
  document.body.appendChild(pre);
}

const THREE = window.THREE;
try {
  /* bounds for every OBJECT_DEFS entry */
  const over = [], off = [];
  for (const def of Object.values(OBJECT_DEFS)) {
    const b = prefabBounds(def), d = def.dimensions;
    lines.push(`  ${def.id.padEnd(20)} ${b.size.x.toFixed(4)} ${b.size.y.toFixed(4)} ${b.size.z.toFixed(4)}  vs ${d.x} ${d.y} ${d.z}  centre ${b.centre.x.toFixed(4)} ${b.centre.y.toFixed(4)} ${b.centre.z.toFixed(4)}`);
    if (b.size.x > d.x + 0.001 || b.size.y > d.y + 0.001 || b.size.z > d.z + 0.001) over.push(def.id);
    if (Math.abs(b.centre.x) > 0.02 || Math.abs(b.centre.y) > 0.02 || Math.abs(b.centre.z) > 0.02) off.push(def.id);
  }
  ok('A1 no prefab exceeds its declared dimensions (+1 mm)', over.length === 0, over.join(','));
  ok('A2 every prefab centred within 2 cm', off.length === 0, off.join(','));
  const couch = OBJECT_DEFS.couch_3seat_01, cb = prefabBounds(couch);
  ok('A4 couch 2.10 m to the mm', Math.abs(cb.size.x - couch.dimensions.x) < 0.001, cb.size.x.toFixed(4));
  ok('A5 couch narrowest <= 0.85', Math.min(cb.size.y, cb.size.z) <= 0.851, `${cb.size.y.toFixed(3)} ${cb.size.z.toFixed(3)}`);

  /* exact-extent boxes: the tape fix */
  for (const id of ['box_small_01', 'box_heavy_01', 'box_fragile_01']) {
    const b = prefabBounds(OBJECT_DEFS[id]), d = OBJECT_DEFS[id].dimensions;
    ok(`tape fix ${id}: y and z extents exactly d (±0.2 mm)`,
       Math.abs(b.size.y - d.y) < 2e-4 && Math.abs(b.size.z - d.z) < 2e-4, `${b.size.y.toFixed(4)} ${b.size.z.toFixed(4)}`);
  }

  /* A6 every prefab builds at the small-box dims; A7 rounded */
  ok('A6 every PREFABS entry builds at box_small dims', Object.keys(PREFABS).every((p) => {
    try { return !!buildPrefab({ ...OBJECT_DEFS.box_small_01, prefab: p }); } catch (e) { lines.push('    ' + p + ': ' + e.message); return false; }
  }));
  const sample = buildPrefab(OBJECT_DEFS.box_small_01);
  let verts = 0; sample.traverse((o) => { if (o.geometry) verts = Math.max(verts, o.geometry.attributes.position.count); });
  ok('A7 rounded (> 24 verts)', verts > 24, verts + ' verts (box body)');
  ok('direct children: every mesh in box_small is a direct child', sample.children.every((c) => c.isMesh) && sample.children.length >= 5, sample.children.length + ' children');

  /* G3 colour attribute under vertexColors */
  const bad = [];
  let vcMeshes = 0;
  for (const def of Object.values(OBJECT_DEFS)) {
    const g = buildPrefab(def);
    g.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (mats.some((m) => m.vertexColors)) {
        vcMeshes++;
        const c = o.geometry.attributes.color;
        if (!c || c.count !== o.geometry.attributes.position.count) bad.push(def.id + '/' + o.name);
      }
    });
  }
  ok('G3 every vertexColors geometry has color.count === position.count', bad.length === 0, bad.join(',') + ` (${vcMeshes} vertexColors meshes)`);
  for (const def of Object.values(TOOL_DEFS)) {
    const g = buildToolVisual(def);
    const box = new THREE.Box3().setFromObject(g);
    const s = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3()), d = def.dimensions;
    lines.push(`  tool ${def.id.padEnd(16)} ${s.x.toFixed(4)} ${s.y.toFixed(4)} ${s.z.toFixed(4)} vs ${d.x} ${d.y} ${d.z} centre ${c.x.toFixed(4)} ${c.y.toFixed(4)} ${c.z.toFixed(4)}`);
    ok(`tool ${def.id} inside dims and centred`, s.x <= d.x + 0.001 && s.y <= d.y + 0.001 && s.z <= d.z + 0.001 && Math.abs(c.x) < 0.02 && Math.abs(c.y) < 0.02 && Math.abs(c.z) < 0.02);
    let shadows = true, colourOk = true;
    g.traverse((o) => { if (o.isMesh) { if (!o.castShadow || !o.receiveShadow) shadows = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (mats.some((m) => m.vertexColors) && !(o.geometry.attributes.color && o.geometry.attributes.color.count === o.geometry.attributes.position.count)) colourOk = false; } });
    ok(`tool ${def.id} shadows + colour attribute`, shadows && colourOk);
  }

  /* G6 UV space */
  const body = sample.children.find((c) => c.name === 'body');
  const uv = body.geometry.attributes.uv;
  let umin = Infinity, umax = -Infinity, vmin = Infinity, vmax = -Infinity;
  for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); umin = Math.min(umin, u); umax = Math.max(umax, u); vmin = Math.min(vmin, v); vmax = Math.max(vmax, v); }
  ok('G6a box body face UV within [0,1] ± 1e-3', umin >= -0.001 && umax <= 1.001 && vmin >= -0.001 && vmax <= 1.001, `u ${umin.toFixed(4)}..${umax.toFixed(4)} v ${vmin.toFixed(4)}..${vmax.toFixed(4)}`);
  // The dominant-face triangle set stops where the bevel turns the corner (the 45° strip is
  // the neighbour's), so a face spans ~0.006..0.994, never exactly 0..1.
  ok('G6a …and spans it to within the bevel', umin < 0.02 && umax > 0.98 && vmin < 0.02 && vmax > 0.98);
  const cg = buildPrefab(couch);
  const base = cg.children.find((c) => c.name === 'base');
  const buv = base.geometry.attributes.uv;
  let bumin = Infinity, bumax = -Infinity;
  for (let i = 0; i < buv.count; i++) { const u = buv.getX(i); bumin = Math.min(bumin, u); bumax = Math.max(bumax, u); }
  const want = couch.dimensions.x / RENDER.look.texelMetres;
  // Same bevel caveat: the Z/Y-dominant set reaches w/2 - 0.134 r per side, so the range is
  // w/texel minus ~0.012 for the couch base (measured 4.1876 vs 4.2). Pin it to ±0.02.
  ok('G6b couch base tile UV u-range == 2.10 / texelMetres (± bevel)', Math.abs((bumax - bumin) - want) < 0.02, `${(bumax - bumin).toFixed(4)} vs ${want}`);
  lines.push(`  couch base u-range ${(bumax - bumin).toFixed(4)} (want ${want}), box body face u ${umin.toFixed(4)}..${umax.toFixed(4)}`);
  ok('couch base is children[0]', cg.children[0] === base);

  /* G14 tape */
  const tapes = sample.children.filter((c) => c.isMesh && !Array.isArray(c.material) && c.material.userData.kind === 'tape');
  ok('G14 box_small has >= 3 tape meshes', tapes.length >= 3, tapes.length + '');

  /* groups */
  const rb = roundedBox(THREE, 0.5, 0.5, 0.5);
  ok('roundedBox has groups 0 and 1', rb.groups.length === 2 && rb.groups[0].materialIndex === 0 && rb.groups[1].materialIndex === 1, JSON.stringify(rb.groups));
  ok('roundedBox is cached', roundedBox(THREE, 0.5, 0.5, 0.5) === rb);
  ok('roundedBox number 5th arg accepted', roundedBox(THREE, 1, 1, 1, 0.07).attributes.position.count > 24);
  const sl = roundedSlab(THREE, 1.0, 0.05, 0.6);
  {
    // group 0 must be the top+bottom: every triangle in it has |normal.y| ~ 1
    const pos = sl.attributes.position; const g0 = sl.groups.find((g) => g.materialIndex === 0);
    let good = 0, total = 0;
    for (let i = g0.start; i < g0.start + g0.count; i += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(pos, i), b = new THREE.Vector3().fromBufferAttribute(pos, i + 1), c = new THREE.Vector3().fromBufferAttribute(pos, i + 2);
      const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
      total++; if (Math.abs(n.y) > 0.99) good++;
    }
    ok('roundedSlab group 0 = top + bottom', good === total, `${good}/${total}`);
    sl.computeBoundingBox(); const s = sl.boundingBox.getSize(new THREE.Vector3());
    ok('roundedSlab measures exactly', Math.abs(s.x - 1) < 1e-4 && Math.abs(s.y - 0.05) < 1e-4 && Math.abs(s.z - 0.6) < 1e-4, `${s.x} ${s.y} ${s.z}`);
  }
  {
    const c = rb.attributes.color; let mn = 1, mx = 0;
    for (let i = 0; i < c.count; i++) { mn = Math.min(mn, c.getX(i)); mx = Math.max(mx, c.getX(i)); }
    ok('AO bake: bottom darkened to 1-strength(×0.85 underside), top untouched', Math.abs(mn - (1 - RENDER.look.ao.strength) * 0.85) < 1e-3 && mx > 0.999, `${mn.toFixed(3)}..${mx.toFixed(3)}`);
    const cy = bakeVertexAO(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 12));
    ok('bakeVertexAO on CylinderGeometry', cy.attributes.color && cy.attributes.color.count === cy.attributes.position.count);
    const sp = bakeVertexAO(new THREE.SphereGeometry(0.1, 8, 6));
    ok('bakeVertexAO on SphereGeometry', sp.attributes.color && sp.attributes.color.count === sp.attributes.position.count);
    ok('bakeVertexAO idempotent', bakeVertexAO(cy) === cy && cy.userData.aoBaked === true);
  }
  ok('PREFAB_PALETTE has the contract keys', PREFAB_PALETTE.cushionLift === 0.06 && PREFAB_PALETTE.tape === 0xd9cfb2 && PREFAB_PALETTE.plinth === 0x3a2e2a && JSON.stringify(PREFAB_PALETTE.books) === '[8,38,96,150,210,268]');

  /* playerBody */
  ok('G7 BODY_RATIOS', JSON.stringify(BODY_RATIOS) === JSON.stringify({ leg: 0.44, torso: 0.34, head: 0.105, torsoW: 0.52 }));
  const b1 = makeBlockout('#5f6b8a'), b2 = makeBlockout('#aa3344');
  const bb = new THREE.Box3().setFromObject(b1.group);
  ok('body normalised to PLAYER.height with feet at 0', Math.abs(bb.max.y - bb.min.y - 1.8) < 1e-3 && Math.abs(bb.min.y) < 1e-3, `${bb.min.y.toFixed(4)}..${bb.max.y.toFixed(4)}`);
  let anyVC = false, rounded = true;
  b1.group.traverse((o) => { if (o.isMesh) { if (o.material.vertexColors) anyVC = true; if (o.geometry.type !== 'SphereGeometry' && o.geometry.attributes.position.count <= 24) rounded = false; } });
  ok('no body material has vertexColors', !anyVC);
  ok('body box parts are rounded', rounded);
  ok('legs are clones (translate did not reach the cache)', b1.parts.legL.geometry !== b2.parts.legL.geometry && b1.parts.legL.geometry !== roundedBox(THREE, 0.17, 1.8 * 0.44, 0.19, { radius: 'auto', ao: 0 }));
  {
    // the cached leg geometry must still be centred (a translate on it would show here)
    const cached = roundedBox(THREE, 0.17, 1.8 * 0.44, 0.19, { radius: 'auto', ao: 0 });
    cached.computeBoundingBox();
    ok('cached leg geometry untouched (centred)', Math.abs(cached.boundingBox.max.y + cached.boundingBox.min.y) < 1e-6);
  }
  ok('makeBlockout shape', typeof b1.update === 'function' && ['legL', 'legR', 'armL', 'armR', 'torso', 'head', 'nose', 'handL', 'handR', 'phase'].every((k) => k in b1.parts));
  b1.update({ x: 1, y: 0, z: 2 }, 0.3, 1.2, 0.016, { left: { x: 1, y: 1, z: 1 }, right: null });
  ok('update runs with a grip', true);
  // mesh count
  let meshes = 0; for (const def of Object.values(OBJECT_DEFS)) buildPrefab(def).traverse((o) => { if (o.isMesh) meshes++; });
  lines.push(`  meshes across all ${Object.keys(OBJECT_DEFS).length} defs: ${meshes}`);
} catch (e) {
  fails++; lines.push('FAIL  probe threw  <- ' + (e && e.message));
  lines.push((e && e.stack || '').split('\n').slice(0, 8).join('\n'));
}
emit();
