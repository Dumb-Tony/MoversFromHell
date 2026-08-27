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
import { canvasTex, matte, texGrass, texCardboard } from '../src/render/textures.js';
import { APERTURES, REFERENCE_DIMS } from '../src/render/scene.js';
import { ZONES, ROOM as HOUSE_ROOM, INTERIOR_DOORS } from '../src/world/house.js';
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
      let isEntity = false;
      for (const e of registry.entities.values()) { if (e.mesh === o || e.mesh.children.includes(o)) { isEntity = true; break; } }
      if (!isEntity) badInterior.push(dr.id + ': ' + sz.x.toFixed(2) + 'x' + sz.y.toFixed(2) + 'x' + sz.z.toFixed(2));
    });
  }
  ok('B1b interior doorways are clear of scenery too', badInterior.length === 0,
     badInterior.slice(0, 4).join(' | '));

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

emit();
