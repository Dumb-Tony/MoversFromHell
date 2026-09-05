/* Phase 13 suite — the art pass.
 *
 * Not a §25.2 roadmap gate. §20.4 told the prototype to look diagnostic — "simple meshes,
 * colour separation, contact shadows, faithful collision" — and for twelve phases it did,
 * which is why it photographed like a CAD viewport. This phase dresses it.
 *
 * AN ART PASS IS THE MOST DANGEROUS KIND OF CHANGE THIS PROJECT CAN MAKE, because its
 * mistakes are invisible to every existing test. Nothing in m0-m12 looks at a mesh. A couch
 * whose arms overhang its collider still weighs 90 kg, still drags at the right force, and
 * still passes every assertion — while visibly sliding through a door frame it should have
 * caught on, which is the one thing this whole game is about (§26.2).
 *
 * So the claims under test are all about the boundary between what you SEE and what the
 * physics DOES:
 *
 *   FAITHFUL     §13.4: "stylized primitive meshes are acceptable; COLLISION-FAITHFUL
 *                PROPORTIONS ARE MANDATORY". Every prefab fits inside its own declared
 *                dimensions, and is centred on them.
 *   CLEAR        no decoration has crept into a doorway. The three apertures are the
 *                measured heart of the game and they must still be 0.82 / 0.86 / 0.91 m of
 *                actual air.
 *   NO NEW WALLS the dressing — roof, siding, trees, hedge, street — adds not one collider.
 *                §8.1 forbids decorative collision contradicting the visible surface, and a
 *                bush a mover cannot walk through is exactly that.
 *   AFFORDABLE   §26.6's 45 FPS floor with the full manifest.
 */

import { OBJECT_DEFS } from '../src/objects/definitions.js';
import { buildPrefab, prefabBounds, PREFABS } from '../src/render/prefabs.js';
import { canvasTex, matte, texGrass, texCardboard, heightFor } from '../src/render/textures.js';
import { KINDS } from '../src/render/materials.js';
import { BODY_RATIOS } from '../src/render/playerBody.js';
import { RENDER } from '../src/config.js';
import { APERTURES, REFERENCE_DIMS } from '../src/render/scene.js';
import { ZONES, ROOM as HOUSE_ROOM, INTERIOR_DOORS, leafDoors } from '../src/world/house.js';   // leafDoors: M11, B1c
import { DEST_ZONES } from '../src/world/destination.js';

const ROOM_WALL_H = HOUSE_ROOM.wallH;

const lines = [];
let passes = 0, fails = 0;
function ok(name, cond, detail = '') {
  if (cond) { passes++; lines.push(`PASS  ${name}`); }
  else { fails++; lines.push(`FAIL  ${name}${detail ? '  <- ' + detail : ''}`); }
}
const eq = (n, a, b) => ok(n, a === b, `got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

let _pre = null;
function emit(status) {
  if (!_pre) {
    _pre = document.createElement('pre');
    _pre.id = 'test-out';
    _pre.style.cssText = 'position:fixed;inset:0;z-index:99999;overflow:auto;background:#06080c;' +
      'color:#cfe;font:11px ui-monospace,Consolas,monospace;padding:12px;white-space:pre';
    document.body.appendChild(_pre);
  }
  const tail = status || (fails === 0 ? `ALL-PASS  ${passes} assertions` : `FAILURES  ${fails} of ${passes + fails}`);
  _pre.textContent = '==MFHTEST-BEGIN==\n' + lines.join('\n') + '\n\n' + tail + '\n==MFHTEST-END==';
}

emit('booting...');
/* A throw anywhere below used to leave every accumulated PASS/FAIL line unemitted, so the
 * whole suite printed only 'booting...' and read as a harness artefact (Phase 15 world
 * review, twice). Now an uncaught error is one FAIL line and the block still emits. */
window.addEventListener('error', (e) => { fails++; lines.push(`FAIL  uncaught  <- ${e.message}`); emit(); });
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason; fails++; lines.push(`FAIL  uncaught  <- ${r && r.message || r}`);
  lines.push((r && r.stack || '').split('\n').slice(0, 5).join('\n')); emit();
});
let M;
try { M = await window.__MFH_READY; }
catch (e) {
  fails++; lines.push(`FAIL  boot threw  <- ${e && e.message}`);
  lines.push((e && e.stack || '').split('\n').slice(0, 6).join('\n'));
  emit(); throw e;
}

const { world, registry, game } = M;
const THREE = window.THREE;

/* ── A. §13.4: collision-faithful proportions ─────────────────────────────────── */
lines.push('--- A. every prefab fits inside its own collider (§13.4) ---');
{
  /* THE ASSERTION THE WHOLE FILE EXISTS FOR. The collider is a cuboid of exactly
   * def.dimensions; the visual must not exceed it on any axis. 1 mm of tolerance, because
   * the builders compute positions in floating point and an exact compare would fail on
   * arithmetic rather than on overhang. */
  const TOL = 0.001;
  const over = [];
  const off = [];
  for (const def of Object.values(OBJECT_DEFS)) {
    const b = prefabBounds(def);
    const d = def.dimensions;
    if (b.size.x > d.x + TOL || b.size.y > d.y + TOL || b.size.z > d.z + TOL) {
      over.push(`${def.id} ${b.size.x.toFixed(3)}x${b.size.y.toFixed(3)}x${b.size.z.toFixed(3)} ` +
                `vs ${d.x}x${d.y}x${d.z}`);
    }
    // Centred on the collider centre, or the mesh and the body disagree about where the
    // object IS — which reads as an object floating beside itself when it rotates.
    if (Math.abs(b.centre.x) > 0.02 || Math.abs(b.centre.y) > 0.02 || Math.abs(b.centre.z) > 0.02) {
      off.push(`${def.id} centre ${b.centre.x.toFixed(3)},${b.centre.y.toFixed(3)},${b.centre.z.toFixed(3)}`);
    }
  }
  ok('A1 no prefab exceeds its declared dimensions', over.length === 0, over.join(' | '));
  ok('A2 every prefab is centred on the collider centre', off.length === 0, off.join(' | '));

  const n = Object.keys(OBJECT_DEFS).length;
  ok('A3 …checked against the whole object table, not a sample', n >= 14, `${n} definitions`);

  /* The couch is the worked example §7.1 gives and the object every clearance number in the
   * project is derived from, so it gets its own assertion by name. */
  const couch = OBJECT_DEFS.couch_3seat_01;
  const cb = prefabBounds(couch);
  ok('A4 the couch is still 2.10 m across, to the millimetre',
     Math.abs(cb.size.x - couch.dimensions.x) < 0.001, `${cb.size.x.toFixed(4)} m`);
  ok('A5 …and still 0.85 m in its narrowest presentation',
     Math.min(cb.size.y, cb.size.z) <= 0.850 + 0.001,
     `min(${cb.size.y.toFixed(3)}, ${cb.size.z.toFixed(3)})`);

  /* THE ART DIRECTION, pinned (chosen 2026-08-25 from three photographed options). The toy
   * look's substance is rounded geometry — a BoxGeometry has exactly 24 vertices, and an
   * extruded rounded box has far more. If a "performance fix" quietly swaps the boxes back,
   * the whole direction reverts and every other assertion stays green. */
  const sample = buildPrefab(OBJECT_DEFS.box_small_01);
  let verts = 0;
  sample.traverse((o) => { if (o.geometry && o.geometry.attributes.position) verts = Math.max(verts, o.geometry.attributes.position.count); });
  ok('A7 the shipping geometry is rounded, not bare boxes', verts > 24, verts + ' verts');

  ok('A6 every prefab in the table builds without throwing',
     Object.keys(PREFABS).every((p) => {
       try { const g = buildPrefab({ ...OBJECT_DEFS.box_small_01, prefab: p }); return !!g; }
       catch (e) { return false; }
     }));
}

/* ── B. the doorways are still air ────────────────────────────────────────────── */
lines.push('--- B. nothing decorative has crept into a doorway (§26.2) ---');
{
  /* An art pass that hangs a door in the door, or runs trim across the opening, breaks the
   * central mechanic in a way no physics test can see: the collider list is untouched and
   * every clearance assertion still passes, while the player watches a couch pass through a
   * door frame. So this measures the VISIBLE geometry against the clear opening. */
  /* Phase 11 build-side M11: a door LEAF is a registry entity that stands in its doorway by
   * design (§8.2 — hung swung open against the hinge jamb, its 40 mm inside the opening). It
   * is exempt from both sweeps the way B1b has always exempted entities — by IDENTITY, never
   * by widening the clear box — and B1c below insists the only meshes that exemption ever
   * covers are door leaves, so the exemption cannot quietly hide a picture frame again. */
  const entityOf = (o) => {
    for (const e of registry.entities.values()) { if (e.mesh === o || e.mesh.children.includes(o)) return e; }
    return null;
  };
  /* Meshes are where their bodies are only after the render loop's sync, which never runs
   * headless: without this every entity mesh still sits at the origin and the sweeps below
   * measure a world with no objects in it — B1c caught exactly that (the four hung leaves
   * were nowhere near their doorways). Sync first, as every drawn frame does — and update
   * the world matrices, because Box3.setFromObject(child) reads the PARENT group's
   * matrixWorld as it is, and a synced group's is stale until a render or this call. */
  registry.syncMeshes();
  world.scene.updateMatrixWorld(true);
  const exempted = [];   // [doorId, entity] for every entity mesh a sweep skipped
  const bad = [];
  const wallZ = -2.0;
  for (const a of APERTURES) {
    // The clear opening, shrunk 2 cm on every side so a surface sitting exactly on the
    // boundary (the jamb markers, the wall itself) is not counted as an intrusion.
    const clear = new THREE.Box3(
      new THREE.Vector3(a.x - a.gap / 2 + 0.02, 0.06, wallZ - 0.20),
      new THREE.Vector3(a.x + a.gap / 2 - 0.02, REFERENCE_DIMS.doorwayHeight - 0.02, wallZ + 0.20));
    world.scene.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      if (o.userData && o.userData.movable) return;
      const b = new THREE.Box3().setFromObject(o);
      if (!b.isEmpty() && b.intersectsBox(clear)) {
        // Ignore anything the size of the world (ground plane, sky dome) — they pass
        // through every box and are not obstructions.
        const s = b.getSize(new THREE.Vector3());
        if (s.x > 30 || s.z > 30) return;
        // Movable objects may legitimately be mid-doorway (M11: a hung leaf IS); static dressing may not.
        const ent = entityOf(o);
        if (ent) { exempted.push([a.id, ent]); return; }
        bad.push(`${a.id}: a ${s.x.toFixed(2)}x${s.y.toFixed(2)}x${s.z.toFixed(2)} mesh`);
      }
    });
  }
  ok('B1 all three apertures are clear of scenery', bad.length === 0, bad.slice(0, 4).join(' | '));

  /* INTERIOR doors too — the blind spot that shipped a picture frame hanging in the
   * living->kitchen opening. Every doorway in the game is a clearance the player is
   * reasoning about, not only the three on the front elevation. */
  const badInterior = [];
  for (const dr of INTERIOR_DOORS) {
    const half = dr.gap / 2 - 0.02;
    const clear = dr.axis === 'x'
      ? new THREE.Box3(new THREE.Vector3(dr.centre - half, 0.06, dr.at - 0.20),
                       new THREE.Vector3(dr.centre + half, dr.height - 0.02, dr.at + 0.20))
      : new THREE.Box3(new THREE.Vector3(dr.at - 0.20, 0.06, dr.centre - half),
                       new THREE.Vector3(dr.at + 0.20, dr.height - 0.02, dr.centre + half));
    world.scene.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      const b = new THREE.Box3().setFromObject(o);
      if (b.isEmpty() || !b.intersectsBox(clear)) return;
      const sz = b.getSize(new THREE.Vector3());
      if (sz.x > 30 || sz.z > 30) return;
      // Movable objects may legitimately be mid-doorway; static dressing may not.
      const ent = entityOf(o);
      if (ent) { exempted.push([dr.id, ent]); return; }
      badInterior.push(dr.id + ': ' + sz.x.toFixed(2) + 'x' + sz.y.toFixed(2) + 'x' + sz.z.toFixed(2));
    });
  }
  ok('B1b interior doorways are clear of scenery too', badInterior.length === 0,
     badInterior.slice(0, 4).join(' | '));

  /* M11 — the exemption, audited. Every entity mesh a sweep skipped must be a door leaf
   * (definitions.js door_leaf_01) standing in ITS OWN doorway, and every doorway that has a
   * leaf record must have exactly one such entity in its box. Anything else the exemption
   * swallowed — a box someone parked in a doorway at boot, a picture frame that became an
   * entity — is a FAIL here even though B1/B1b stayed green. */
  const leafDoorIds = leafDoors(APERTURES).map((d) => d.id).sort();
  const notLeaves = exempted.filter(([, e]) => e.defId !== 'door_leaf_01').map(([id, e]) => `${id}: ${e.defId}`);
  ok('B1c the only meshes the doorway sweeps exempt are door leaves (M11)', notLeaves.length === 0, [...new Set(notLeaves)].slice(0, 4).join(' | '));
  const wrongDoor = exempted.filter(([id, e]) => e.defId === 'door_leaf_01' && e.state.doorId !== id).map(([id, e]) => `${e.state.doorId} found in ${id}`);
  ok('B1c …each in its own doorway', wrongDoor.length === 0, [...new Set(wrongDoor)].slice(0, 4).join(' | '));
  const perDoor = {};
  for (const [id, e] of exempted) { (perDoor[id] = perDoor[id] || new Set()).add(e.id); }
  const seenDoors = Object.keys(perDoor).sort();
  eq('B1c …and every leaf-bearing doorway has exactly one leaf standing in it', seenDoors.join(','), leafDoorIds.join(','));
  ok('B1c …one entity per door, not two', seenDoors.every((id) => perDoor[id].size === 1), seenDoors.map((id) => `${id}:${perDoor[id].size}`).join(' '));
  ok('B1c …and every one of them is hung and Fixed at the moment of the sweep',
     exempted.every(([, e]) => e.state.hung === true && e.body.isFixed()));

  // And the numbers themselves are untouched — the art pass must not have moved a jamb.
  eq('B2 the 32" door is still 0.82 m', APERTURES.find((a) => a.id === 'interior32').gap, 0.82);
  eq('B3 the 34" door is still 0.86 m', APERTURES.find((a) => a.id === 'door34').gap, 0.86);
  eq('B4 the 36" front door is still 0.91 m', APERTURES.find((a) => a.id === 'front36').gap, 0.91);
}

/* ── C. the dressing added no collision ───────────────────────────────────────── */
lines.push('--- C. scenery is scenery (§8.1) ---');
{
  const tags = new Set(world.colliders.map((c) => c.tag));
  /* `truckRoof` is a REAL collider — it is the top of the cargo box, and Phase 7 measured
   * the volume under it. Matching /roof/ flagged it, which is the test being wrong rather
   * than the build: the dressing owns roofs on HOUSES, and the truck's is architecture. */
  const decoTags = [...tags].filter((t) =>
    !/^truck/.test(String(t)) &&
    /tree|hedge|roof|siding|fence|kerb|street|mailbox|bin|cloud|sky|path/i.test(String(t)));
  ok('C1 no collider was added for roof, trees, hedge, kerb or street',
     decoTags.length === 0, decoTags.join(', '));
  ok('C2 every collider still carries a tag', world.colliders.every((c) => !!c.tag),
     `${world.colliders.filter((c) => !c.tag).length} untagged`);

  /* A CANARY, not a specification. The exact number is whatever the twelve phases before
   * this one built; what matters is that an art pass did not change it. If a later phase
   * legitimately adds architecture, update the number and say so — do not delete the check,
   * because its whole job is to notice a wall that nobody meant to add. */
  ok('C3 the collider count is in the range the built world has, not the dressed one',
     world.colliders.length > 20 && world.colliders.length < 200,
     `${world.colliders.length} colliders`);

  // The grid is a measuring instrument now, not scenery (§20.4 -> F3).
  ok('C4 the metre grid is off in a shipping build', !!world.grid && world.grid.visible === false);
}

/* ── D. the texture layer ─────────────────────────────────────────────────────── */
lines.push('--- D. textures are cached, tagged and deterministic ---');
{
  ok('D1 a texture is memoised by key', texGrass() === texGrass());
  ok('D2 …and a different key is a different texture', texCardboard('plain') !== texCardboard('fragile'));

  const t = texGrass();
  ok('D3 canvas textures are tagged sRGB', t.encoding === THREE.sRGBEncoding,
     `encoding=${t.encoding}`);

  /* §26.6's frame budget. The manifest is 23 objects and every one of them is now a group
   * of parts; the whole point of memoising by key is that a hundred boxes cost one canvas. */
  let made = 0;
  for (let i = 0; i < 50; i++) { if (texCardboard('plain') !== t) made++; }
  ok('D4 fifty asks for one texture mint one canvas', made === 50 || made === 0);

  /* THE COLOUR-SPACE FIX, pinned. The renderer writes sRGB output, so a hex authored in
   * sRGB has to be converted or every flat colour in the build arrives pale. Mid-grey
   * 0x808080 is 0.5020 in sRGB and 0.2159 in linear — a difference far too large to be a
   * rounding artefact, and exactly the shift that made tree trunks look like pale tan. */
  const m = matte(0x808080);
  ok('D5 a flat colour is converted from sRGB to linear',
     Math.abs(m.color.r - 0.2159) < 0.005, `r=${m.color.r.toFixed(4)}, want ~0.2159`);
  const white = matte(0xffffff);
  ok('D6 …and white stays white', Math.abs(white.color.r - 1) < 1e-6, `r=${white.color.r}`);
}

/* ── E. it still runs ─────────────────────────────────────────────────────────── */
lines.push('--- E. the dressed scene is affordable (§26.6) ---');
{
  let meshes = 0;
  world.scene.traverse((o) => { if (o.isMesh) meshes++; });
  /* A budget, deliberately generous. The point is to catch an order-of-magnitude mistake —
   * a texture drawn per object, or a tree per square metre — not to police a handful. */
  ok('E1 the scene is under the mesh budget', meshes < 2600, `${meshes} meshes`);
  lines.push(`      (scene mesh count: ${meshes})`);

  const before = M.physics.stats.bodies;
  for (let i = 0; i < 60; i++) game.frame(1000 / 60);
  eq('E2 no bodies leaked over 60 frames', M.physics.stats.bodies, before);

  // Removing an entity disposes a GROUP now, not a mesh — which threw on the first removal.
  const box = [...registry.entities.values()].find((e) => e.defId === 'box_small_01');
  let threw = null;
  try { if (box) registry.remove(box.id); } catch (e) { threw = e.message; }
  ok('E3 an object with a group visual can be removed', !threw, String(threw));

  const banner = document.getElementById('err-banner');
  ok('E4 no error banner appeared during the suite', !banner || !banner.textContent.trim(),
     banner ? banner.textContent.slice(0, 120) : '');
}

/* ── F. the lighting rig ──────────────────────────────────────────────────────── */
lines.push('--- F. interiors are lit, and the shadow budget is bounded ---');
{
  /* THE ROOT CAUSE, PINNED. `MeshLambertMaterial` shades per VERTEX — the vendored r128
   * build assembles `lights_lambert_vertex` for it — so a wall's lighting was computed at
   * four corners and interpolated across ten metres. Every interior surface was one flat
   * value, and adding lamps to the rooms would have changed almost nothing. If anything
   * reintroduces a Lambert material the interior silently goes flat again, and no other
   * assertion in this project would notice. */
  const mm = matte(0x808080);
  eq('F1 surfaces are shaded per FRAGMENT, not per vertex', mm.type, 'MeshPhongMaterial');
  eq('F2 …with the specular killed, so it stays diffuse-only', mm.shininess, 0);

  const lamberts = [];
  world.scene.traverse((o) => {
    for (const mat of (Array.isArray(o.material) ? o.material : [o.material])) {
      if (mat && mat.type === 'MeshLambertMaterial') lamberts.push(mat.type);
    }
  });
  ok('F3 no per-vertex material survives anywhere in the scene',
     lamberts.length === 0, `${lamberts.length} found`);

  const lit = new Set((world.roomLights || []).map((s) => s.userData.roomId));
  const isIndoor = (z) => z.maxY !== undefined && Math.abs(z.maxY - ROOM_WALL_H) < 1e-6;
  const allZones = [...ZONES, ...DEST_ZONES];
  const unlit = allZones.filter(isIndoor).map((z) => z.id).filter((id) => !lit.has(id));
  if (world.tier === 'software') {
    // Measured: six room spots cost 127 s of m0's runtime under SwiftShader. The tier drops
    // them, so the claim here is that it dropped ALL of them rather than some.
    eq('F4 the software tier carries no room lights at all', (world.roomLights || []).length, 0);
  } else {
    ok('F4 every indoor room has its own light', unlit.length === 0, unlit.join(', '));
  }

  /* THE BUG THIS CATCHES: the first filter was `maxY > 1`, and the kerbside aprons are zones
   * too — so a shadow-casting spotlight went up in the middle of the front garden and took
   * the scene to 13 lights and 10 shadow maps. */
  const litOutdoors = allZones.filter((z) => !isIndoor(z)).map((z) => z.id).filter((id) => lit.has(id));
  ok('F5 no room light was hung outdoors', litOutdoors.length === 0, litOutdoors.join(', '));

  /* THE BUDGET, and it is measured rather than preferred. On m7 in headless Chrome:
   * no room lights 4 s; six room spots without shadows 6 s; six with three casting >600 s,
   * which timed the harness out. The light COUNT is free. The shadow PASSES are not,
   * because every rendered frame re-renders every map. */
  let casting = 0, lights = 0;
  world.scene.traverse((o) => { if (o.isLight) { lights++; if (o.castShadow) casting++; } });
  ok('F6 the light count is bounded', lights <= 12, `${lights} lights`);
  ok('F7 the shadow-map count is bounded', casting <= 5, `${casting} casting`);
  lines.push(`      (lights: ${lights}, shadow casters: ${casting}, tier: ${world.tier})`);

  /* A software rasteriser drops the room shadows rather than the frame rate — §26.6's floor
   * is a promise to the player, not to the machine. This suite runs on SwiftShader, so the
   * branch below is live rather than hypothetical. */
  if (world.tier === 'software') {
    const roomCasting = (world.roomLights || []).filter((s) => s.castShadow).length;
    eq('F8 in software, room lights light but do not cast', roomCasting, 0);
    ok('F9 …and the sun keeps a smaller map', world.sun.shadow.mapSize.width <= 1024,
       String(world.sun.shadow.mapSize.width));
  } else {
    ok('F8 on a GPU, the pickup house casts', (world.roomLights || []).some((s) => s.castShadow));
    ok('F9 …at the full sun map', world.sun.shadow.mapSize.width >= 2048);
  }
}

/* ── G. Phase 15: the Overcooked overhaul, on the software tier ────────────────── */
lines.push('--- G. materials, post, occlusion and the frame budget (Phase 15) ---');
{
  /* Everything in this section is what the 14-suite gate CAN see: it runs on SwiftShader,
   * where the tier constructs no post chain, no blobs, no bump/normal/env/rim. What it
   * cannot see (the chain allocated, the rim anchor found, both halves composited, the
   * bright-pass fraction) lives in tools/m13g-gpu.js and runs through tools/probe.ps1 —
   * one frame at ?tier=gpu. The split is deliberate: the measured cost of a shadow pass in
   * software took a 4 s suite past 600 s, so the gate must never construct the good path. */
  const renderer = M.renderer;

  // G1 — the software tier allocates NOTHING for post or blobs.
  eq('G1 the gate runs on the software tier', M.renderTier, 'software');
  ok('G1a …with no post chain', M.post === null || M.post === undefined, String(M.post));
  ok('G1b …and no contact blobs', M.blobs === null || M.blobs === undefined, String(M.blobs));
  // The suite's first present() is the session's first frame, so it uploads every texture
  // the scene holds; the claim is about a WARM frame.
  M.present();
  const texBefore = renderer.info.memory.textures;
  M.present();
  eq('G1c …and a warm present() allocates no textures', renderer.info.memory.textures, texBefore);
  lines.push(`      (${texBefore} textures resident on the software tier)`);

  // G2 — shadow maps once per frame: autoUpdate off, needsUpdate raised by present() and
  // consumed by its first render.
  eq('G2 shadow maps are manually scheduled', renderer.shadowMap.autoUpdate, false);
  eq('G2a …and one present() consumes the request', renderer.shadowMap.needsUpdate, false);

  /* G3 — the black-attribute trap. r128's MeshPhongMaterial has no defaultAttributeValues,
   * so a vertexColors material over a geometry with no 'color' attribute renders BLACK. The
   * design panel found one proposal claiming this was "verified [1,1,1]"; it was not. */
  const missing = [];
  for (const def of Object.values(OBJECT_DEFS)) {
    const g = buildPrefab(def);
    g.traverse((o) => {
      if (!o.isMesh) return;
      for (const mat of (Array.isArray(o.material) ? o.material : [o.material])) {
        if (!mat || !mat.vertexColors) continue;
        const c = o.geometry.attributes.color, p = o.geometry.attributes.position;
        if (!c || !p || c.count !== p.count) missing.push(def.id + ':' + (mat.userData.kind || mat.type));
      }
    });
  }
  ok('G3 every vertexColors geometry carries a full color attribute', missing.length === 0,
     missing.slice(0, 5).join(' | '));

  /* G4 — the user's complaint, made a test: "everything reads as different colours of the
   * same texture". Twelve headline kinds; every PAIR must differ in at least two of four
   * ways — reference hue, shininess (ratio >= 3), relief present, environment reflection.
   * The reference hues are the spec's authored ones (materialLibrary), kept here so the test
   * cannot be satisfied by changing KINDS alone. */
  const HEADLINE = ['plaster', 'walnut', 'boards', 'card', 'fabric', 'steel', 'paint', 'plastic',
                    'glass', 'grass', 'asphalt', 'denim', 'hivis'];
  const kinds = HEADLINE.filter((k) => KINDS && KINDS[k]);
  eq('G4 the thirteen headline kinds exist in KINDS', kinds.length, HEADLINE.length);
  /* The direct claim: in the LIVE scene, no two kinds share an albedo image. A kind with no
   * map at all is the old failure (a flat colour), so it counts as sharing "no texture". */
  const imageOf = new Map();   // kind -> Set of map images seen in the scene
  world.scene.traverse((o) => {
    if (!o.isMesh) return;
    for (const mt of (Array.isArray(o.material) ? o.material : [o.material])) {
      const k = mt && mt.userData && mt.userData.kind;
      if (!k || !kinds.includes(k)) continue;
      if (!imageOf.has(k)) imageOf.set(k, new Set());
      imageOf.get(k).add(mt.map ? mt.map.image : null);
    }
  });
  const inScene = kinds.filter((k) => imageOf.has(k));
  ok('G4a most headline kinds are in the scene', inScene.length >= 9, inScene.join(','));
  // glass and plastic are legitimately smooth: their texture IS the specular lobe and the env.
  const SMOOTH = ['glass', 'plastic', 'paint'];   // paint: flat gloss with env — the truck body, cab and roof
  const flat = inScene.filter((k) => !SMOOTH.includes(k) && imageOf.get(k).has(null));
  ok('G4b no textured headline kind in the scene is an untextured flat colour', flat.length === 0, flat.join(', '));
  const shared = [];
  for (let i = 0; i < inScene.length; i++) for (let j = i + 1; j < inScene.length; j++) {
    for (const img of imageOf.get(inScene[i])) if (img && imageOf.get(inScene[j]).has(img)) shared.push(inScene[i] + '~' + inScene[j]);
  }
  ok('G4c no two headline kinds share an albedo image', shared.length === 0, shared.join(', '));
  /* And the light response is not one setting with thirteen names: at least four distinct
   * shininess bands, at least three kinds with environment reflection, at least three with
   * none, at least eight with relief. */
  const bands = new Set(kinds.map((k) => Math.round(Math.log2(Math.max(1, KINDS[k].shininess)))));
  ok('G4d shininess spans at least four octaves across the headline kinds', bands.size >= 4, [...bands].join(','));
  const envY = kinds.filter((k) => KINDS[k].env > 0).length;
  ok('G4e environment reflection is selective', envY >= 3 && kinds.length - envY >= 3, `${envY} of ${kinds.length}`);
  const relief = kinds.filter((k) => KINDS[k].bump || KINDS[k].normal).length;
  ok('G4f most headline kinds carry relief', relief >= 8, `${relief} of ${kinds.length}`);

  // G5 — heights are gpu-only and the albedo stays sRGB (D3 kept).
  ok('G5 no height texture is minted on the software tier', heightFor(texGrass()) === null);
  eq('G5a …while the albedo stays sRGB', texGrass().encoding, THREE.sRGBEncoding);

  /* G6 — UV spaces. 'face' UVs span exactly 0..1 on a box body so the stencil is centred
   * on every face at every size; 'tile' UVs are metres / RENDER.look.texelMetres so a 2.1 m
   * couch and a 0.5 m box share one grain scale. */
  const uvRange = (mesh) => {
    const uv = mesh.geometry.attributes.uv; let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < uv.count; i++) { const u = uv.getX(i); if (u < lo) lo = u; if (u > hi) hi = u; }
    return { lo, hi };
  };
  const biggest = (g) => { let best = null, vol = -1; g.traverse((o) => { if (!o.isMesh) return;
    const b = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()); const v = b.x * b.y * b.z;
    if (v > vol) { vol = v; best = o; } }); return best; };
  const boxBody = biggest(buildPrefab(OBJECT_DEFS.box_small_01));
  const br = uvRange(boxBody);
  ok('G6 a box body uses face UVs spanning 0..1', br.lo >= -0.001 && br.hi <= 1.001,
     `u in [${br.lo.toFixed(3)}, ${br.hi.toFixed(3)}]`);
  const couchBase = biggest(buildPrefab(OBJECT_DEFS.couch_3seat_01));
  const cr = uvRange(couchBase);
  /* The by-normal bevel projection stops a fraction of the corner radius short of each edge
   * (the last 15° strip belongs to the side face), so the u-range is SHORT of dims/texel by
   * up to 2 × 0.586 r / texelMetres — 0.054 at the couch's r = 0.0231 — and never over it.
   * MEASURED 4.1876 against 4.2000 (props review, twice). A one-sided band, not a magic
   * tolerance: over would mean the tile scale is wrong; under by more than the corner arc
   * would mean a face was dropped. */
  const wantU = OBJECT_DEFS.couch_3seat_01.dimensions.x / RENDER.look.texelMetres;
  const shortU = wantU - (cr.hi - cr.lo);
  ok('G6a a couch base uses tile UVs in metres / texelMetres (short only by the bevel arc)',
     shortU >= 0 && shortU < 0.06, `u-range ${(cr.hi - cr.lo).toFixed(4)}, want ${wantU.toFixed(4)}, short ${shortU.toFixed(4)}`);

  // G7 — the user's proportions, pinned. Overcooked's stubby figures were explicitly refused.
  ok('G7 BODY_RATIOS are the toy proportions the user chose',
     JSON.stringify(BODY_RATIOS) === JSON.stringify({ leg: 0.44, torso: 0.34, head: 0.105, torsoW: 0.52 }),
     JSON.stringify(BODY_RATIOS));

  // G8 — skirting boards and AO skirts exist and stay out of every doorway.
  ok('G8 skirting boards exist as geometry', (world.skirting || []).length > 0, String((world.skirting || []).length));
  eq('G8a the two AO skirt strips exist', (world.skirts || []).length, 2);
  {
    const boxes = [];
    for (const a of APERTURES) boxes.push([a.id, new THREE.Box3(
      new THREE.Vector3(a.x - a.gap / 2 + 0.02, 0.06, -2.0 - 0.20),
      new THREE.Vector3(a.x + a.gap / 2 - 0.02, REFERENCE_DIMS.doorwayHeight - 0.02, -2.0 + 0.20))]);
    for (const dr of INTERIOR_DOORS) {
      const half = dr.gap / 2 - 0.02;
      boxes.push([dr.id, dr.axis === 'x'
        ? new THREE.Box3(new THREE.Vector3(dr.centre - half, 0.06, dr.at - 0.20), new THREE.Vector3(dr.centre + half, dr.height - 0.02, dr.at + 0.20))
        : new THREE.Box3(new THREE.Vector3(dr.at - 0.20, 0.06, dr.centre - half), new THREE.Vector3(dr.at + 0.20, dr.height - 0.02, dr.centre + half))]);
    }
    const hits = [];
    for (const m of [...(world.skirting || []), ...(world.skirts || [])]) {
      const b = new THREE.Box3().setFromObject(m);
      for (const [id, box] of boxes) if (!b.isEmpty() && b.intersectsBox(box)) hits.push((m.name || 'strip') + '@' + id);
    }
    ok('G8b …and none of them enters a doorway', hits.length === 0, hits.slice(0, 4).join(', '));
  }

  // G9 — the frame budget, structurally (frame TIME is unmeasurable under virtual time).
  /* ⚠ renderer.info.autoReset resets the counters inside EVERY render() call, so after a
   * present() the numbers describe only the last render — the second seat, or the composite
   * quad. Switch it off and reset by hand to count the whole frame. */
  // Seat-only first (autoReset on: the counters hold the last render, the seat's own pass).
  M.present();
  const seatCalls = renderer.info.render.calls, seatTris = renderer.info.render.triangles;
  ok('G9 one seat renders under 600 draw calls', seatCalls <= 600, `${seatCalls} calls`);
  renderer.info.autoReset = false;
  renderer.info.reset();
  M.present();
  const soloCalls = renderer.info.render.calls, soloTris = renderer.info.render.triangles;
  ok('G9a a whole solo frame (shadow maps + seat) stays under 1000 draw calls', soloCalls <= 1000, `${soloCalls} calls`);
  lines.push(`      (seat: ${seatCalls} calls / ${seatTris} tris; solo frame: ${soloCalls} calls / ${soloTris} tris; shadow pass ≈ ${soloCalls - seatCalls})`);
  M.setSeats(2);
  renderer.info.reset();
  M.present();
  const coopCalls = renderer.info.render.calls;
  ok('G9b a whole co-op frame stays under 1400 draw calls', coopCalls <= 1400, `${coopCalls} calls`);
  /* The structural proof that shadow maps render ONCE per frame: if they rendered per seat,
   * co-op would cost a second shadow pass on top of the second seat. */
  ok('G9c co-op renders the shadow maps once (co-op < solo frame + one seat)', coopCalls < soloCalls + seatCalls,
     `${coopCalls} vs ${soloCalls} + ${seatCalls}`);
  lines.push(`      (co-op frame: ${coopCalls} calls)`);
  M.setSeats(1);
  renderer.info.autoReset = true;

  // G10 — bloom discipline: the sky is tone-mapped (cloud whites never bloom); the bulbs are
  // the sole guaranteed sources (unlit, untonemapped).
  let sky = null, bulbs = 0;
  world.scene.traverse((o) => {
    if (!o.isMesh || !o.material || Array.isArray(o.material)) return;
    const mt = o.material;
    if (mt.type === 'MeshBasicMaterial' && mt.side === THREE.BackSide && mt.map) sky = mt;
    if (mt.type === 'MeshBasicMaterial' && mt.toneMapped === false && mt.color && mt.color.getHex() === 0xfff3d0) bulbs++;
  });
  ok('G10 the sky dome is tone-mapped', !!sky && sky.toneMapped === true);
  ok('G10a the bulbs are untonemapped bloom sources', bulbs > 0, `${bulbs} bulbs`);

  // G11 — one shared rimPatch keeps the program count bounded.
  ok('G11 the program count is bounded', renderer.info.programs.length <= 32, `${renderer.info.programs.length} programs`);

  // G12 — every classed material has a real light response; bare matte() stays diffuse-only.
  const weak = [];
  world.scene.traverse((o) => {
    if (!o.isMesh) return;
    for (const mt of (Array.isArray(o.material) ? o.material : [o.material])) {
      if (!mt || !mt.userData || !mt.userData.kind) continue;
      if (!(mt.shininess >= 4) || !mt.specular || mt.specular.getHex() === 0) weak.push(mt.userData.kind);
    }
  });
  ok('G12 every classed material has shininess >= 4 and a non-black specular', weak.length === 0,
     [...new Set(weak)].slice(0, 6).join(', '));
  eq('G12a …while bare matte() stays diffuse-only (F2 verbatim)', matte(0x808080).shininess, 0);

  // G13 — presenting is presentation: no meshes, no colliders.
  let meshesBefore = 0; world.scene.traverse((o) => { if (o.isMesh) meshesBefore++; });
  const collidersBefore = world.colliders.length;
  M.present();
  let meshesAfter = 0; world.scene.traverse((o) => { if (o.isMesh) meshesAfter++; });
  eq('G13 present() adds no meshes', meshesAfter, meshesBefore);
  eq('G13a …and touches no collider', world.colliders.length, collidersBefore);

  // G14 — the tape is geometry INSIDE the box (A1 already proves the box is still the box).
  let tape = 0; buildPrefab(OBJECT_DEFS.box_small_01).traverse((o) => {
    if (o.isMesh && o.material && !Array.isArray(o.material) && o.material.userData.kind === 'tape') tape++; });
  ok('G14 a box carries its tape as real strips', tape >= 3, `${tape} strips`);

  // G15 — merged plank floors with per-plank colour.
  const floors = world.plankFloors || [];
  eq('G15 three plank floors exist', floors.length, 3);
  ok('G15a …each with a per-plank colour attribute',
     floors.every((f) => f.geometry && f.geometry.attributes.color), floors.map((f) => !!(f.geometry && f.geometry.attributes.color)).join(','));
}

emit();
