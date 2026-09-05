/* The lighting rig — GDD §20.1, §20.4, §26.6, §13.1.
 *
 * ⚠ THE THING THAT MADE INTERIORS FLAT WAS THE MATERIAL, NOT THE LIGHT COUNT.
 *
 * `MeshLambertMaterial` shades PER VERTEX. The vendored r128 build proves it: the shader
 * assembles `lights_lambert_vertex`, where Phong assembles `lights_phong_fragment`. A wall
 * is two triangles, so a Lambert wall's lighting is evaluated at four corners and
 * interpolated across the whole surface. Adding lamps to a Lambert room is the obvious fix
 * and it accomplishes almost nothing: a point light 2 m from a 10 m wall changes the value
 * at four corners and the middle is a linear blend of them. No falloff, no pool of light, no
 * shape. That is exactly what the interior looked like — every wall one flat value, adjacent
 * faces at 90° separated only by a hairline.
 *
 * So `matte()` in textures.js builds a MeshPhongMaterial with the specular killed, which is
 * per-fragment Lambert in everything but name, and the lights below can finally do something.
 *
 * THE SECOND HALF IS THAT NOTHING INDOORS CAST A SHADOW. The room shells have ceilings, so
 * the sun is blocked by construction, and a HemisphereLight does not occlude — it lights
 * every surface in the world by the same amount regardless of what is above it. Indoors that
 * is a constant, which is the definition of flat. Each room now has its own spot from the
 * ceiling, with a real shadow map, so objects sit on the floor instead of hovering over it.
 *
 * §26.6's 45 FPS floor governs how far this can go. MEASURED before the change: 340 draw
 * calls and 7 488 triangles outdoors — a scene with enormous headroom — so the cost that
 * matters is per-fragment shader work and the extra shadow PASSES, one per casting light.
 * A room spot's pass only renders what is inside its own frustum, which is one room.
 *
 * PHASE 15 — THE REBALANCE (the Overcooked look, chosen 2026-09-02). The rig's STRUCTURE is
 * untouched (m13 F4-F9 count the same lights and casters); the constants are re-derived from
 * photometry instead of inherited. ACES maps v = input × exposure / 0.6 through RRTAndODTFit,
 * so with RENDER.look.exposure 1.05 a lit white up-face receiving sun 0.83 + hemi 0.41 +
 * ambient 0.04 + fill 0.07 = 1.35 lands at 0.835 linear = 0.93 sRGB: lifted, unclipped, and
 * under the 0.86 bloom threshold. The same face in shadow receives 0.52 → 0.79 sRGB, and a
 * mid albedo (0.4) lands lit 0.61 / shadow 0.31 — a ratio of 0.51 where the old rig gave
 * ~0.12. Key and shadow are separated by HUE (sun hue 36 against sky hue 215), not by value;
 * that is what keeps the shadows readable without a fourth lamp. The documented Lambert
 * lesson still stands: the gradient comes from hemi contrast, bevel, vertex AO and rim —
 * never from more lights. Light count stays 10, casters 4.
 *
 * Two things the film mock measured and this rig keeps: the sun stays at (16, 17, 11) —
 * moving it throws the truck's shadow across the whole frame — and the kitchen's spot is
 * WARM (0xfff0e0, not the cool 0xe6efff a first draft had): one cold room among warm ones
 * read as a different building, not as daylight.
 *
 * SHADOWS: VSM on the gpu tier only. The vendored r128 uploads shadow.radius into a two-pass
 * box blur, samples both moments, clamps light bleeding at (p - 0.3) / (0.95 - 0.3), and
 * renders the material's own FRONT faces into the map — so a couch foot's shadow starts at
 * the foot with no peter-panning gap. PCFSoft ignores shadow.radius entirely, so on that
 * fallback the softness is just the sun's 20 mm texel. VSM is never set on the software
 * tier: its blur passes would land inside the headless harness, where a shadow pass already
 * costs ~100x what it costs a GPU (see detectRenderTier). shadowMapTypeFor() below is the
 * one place that decision is made; main.js applies it right after detectRenderTier.
 */

import { RENDER } from '../config.js';

/** Warm tungsten, against the sun's cooler daylight. The contrast between the two is most of
 *  what makes an interior read as an interior rather than as a darker outdoors. */
export const LIGHTING = Object.freeze({
  /** Key. Position unchanged since the film mock proved moving it throws the truck's shadow
   *  across the frame. Colour hue 36 — the warm half of the hue separation. */
  sun:        { colour: 0xffe0b0, intensity: 1.25, at: { x: 16, y: 17, z: 11 } },
  /** Cool bounce from the opposite quarter, so the shadowed side of a box is blue-grey
   *  rather than black. No shadow map (see buildLighting). */
  fill:       { colour: 0xa9c4e6, intensity: 0.30, at: { x: -12, y: 9, z: -14 } },
  /** Sky hue 215 against the sun's 36. The GROUND colour is warm on purpose: undersides
   *  pick up tabletop bounce, which is the diorama read. 0.48 is the photometry's value;
   *  0.42-0.55 is the tuning window (_probe-look.js reads the lit/shadow ratio). */
  hemi:       { sky: 0xd4e4ff, ground: 0x9c7c5e, intensity: 0.48 },
  /** A floor under the whole scene, so a shadowed corner is dim rather than black. §26.5
   *  needs states legible; nothing is legible at zero. Small: hemi now carries the lift. */
  ambient:    { colour: 0xffe2cc, intensity: 0.06 },
  room:       {
    colour: 0xffc98e,
    intensity: 1.90,
    penumbra: 0.85,
    decay: 1.15,
    /** Hung just under the ceiling, like a light would be. */
    dropFromCeiling: 0.16,
    shadowMap: 1024,
    shadowBias: -0.0008,
    /** VSM blur radius in map texels — only VSM reads it (PCFSoft ignores radius). */
    shadowRadius: 3.0,
  },
  /** Per-room spot colours, keyed by zone id; L.room.colour is the fallback for a zone that
   *  is not listed. The pendant shade under each spot matches (scene.js). The destination
   *  reads more daylit than the pickup house on purpose — it is the end of the day's work. */
  roomColours: {
    living_room:  0xffc98e,
    kitchen:      0xfff0e0,
    bedroom:      0xffb877,
    dest_living:  0xfff0d8,
    dest_kitchen: 0xf6f4ee,
    dest_bedroom: 0xffe6c4,
  },
  /** WHAT EACH QUALITY TIER IS, as a table rather than as `soft ? 1024 : …` inside the builder
   *  (Phase 11 build-side M29 — the settings card's Quality row switches this LIVE now, so the
   *  numbers had to become data the switch and the suite can both read). `roomLights` is
   *  §20.1's per-room spot; `roomShadows` is whether the pickup house's three cast. The
   *  software row is the measurement at the top of this file: shadow passes cost ~100× what
   *  lights do on a rasteriser, so that tier drops both and keeps the hemisphere. */
  tiers: {
    gpu:      { sunShadowMap: 2048, roomLights: true,  roomShadows: true },
    software: { sunShadowMap: 1024, roomLights: false, roomShadows: false },
  },
  /** The sun's shadow camera half-width. Tighter is sharper: this box is spread across a
   *  fixed 2048 map, so 20 m gives 40/2048 = 19.5 mm per texel where 26 m gave 25 mm. It
   *  must still cover the pickup house, the driveway and the truck at once — the
   *  destination gets its own room lights and does not need sun shadows to read. */
  sunShadowHalfWidth: 20,
  sunShadowMap: 2048,
  /** VSM blur radius for the sun map, in texels: 1.6 × 19.5 mm ≈ 31 mm of softness. */
  sunShadowRadius: 1.6,
  /** Less negative than the old -0.0006: VSM's moments do not need the PCF acne margin, and
   *  the deeper bias was lifting every contact shadow off its foot. */
  sunShadowBias: -0.0004,
  normalBias: 0.015,
  /** Fresnel rim colour and falloff — read by materials.js via RENDER.look.rim; listed here
   *  so the rig is one record. */
  rim: { sky: RENDER.look.rim.sky, power: RENDER.look.rim.power },
});

/**
 * Is this a software rasteriser?
 *
 * ⚠ SHADOW PASSES ARE ~100x MORE EXPENSIVE IN SOFTWARE THAN LIGHTS ARE, and it is not close.
 * MEASURED on the m7 suite, headless Chrome (SwiftShader), 2026-08-23:
 *
 *     m7  no room lights .............. 4 s
 *     m7  6 room spots, no shadows .... 6 s
 *     m7  6 room spots, 3 casting .... >600 s   (the harness timed out)
 *     m0  6 room spots, no shadows ... 149 s
 *     m0  no room lights ............. 22 s
 *
 * Two separate costs, and which one dominates depends on how many FRAMES get rendered. m7
 * renders few: there, shadow maps are everything and six extra lights cost two seconds. m0
 * renders many: there, the per-fragment light loop is everything and the same six lights
 * cost 127 seconds. A software rasteriser has no fill rate to spare for either.
 *
 * So the software tier drops BOTH. Its interior falls back to hemisphere and ambient — flat,
 * the way it looked before this phase — which is the right thing to lose on a machine with
 * no GPU at all, where a playable frame rate beats interior mood.
 *
 * The wrong response is to cut the shipping build's quality so a headless test runs fast; on
 * any real GPU four shadow maps is nothing. The right one is a QUALITY TIER, which is a
 * feature rather than a workaround: §26.6 sets a 45 FPS floor, and a player whose machine
 * has fallen back to software rendering should get a playable game instead of a slideshow.
 * The test harness gets its speed back as a side effect of doing the honest thing.
 */
export function detectRenderTier(renderer) {
  /* A FORCED OVERRIDE via ?tier=gpu|software.
   *
   * The screenshot harness needs it: headless Chrome IS the software tier, so a docs shot
   * taken without this shows the fallback rather than what a player with a graphics card
   * sees — a picture of the compromise instead of the game. It is also the seam a §21.4
   * settings panel would use to let a player force quality up or down by hand. */
  try {
    const forced = new URLSearchParams(location.search).get('tier');
    if (forced === 'gpu' || forced === 'software') return forced;
  } catch (e) { /* no location, e.g. a worker — fall through to detection */ }
  try {
    const gl = renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const name = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
    if (/swiftshader|llvmpipe|software|basic render/i.test(name)) return 'software';
    return 'gpu';
  } catch (e) {
    return 'gpu';
  }
}

/**
 * Which shadow-map filter the renderer should run for a tier.
 *
 * VSM is gated to the gpu tier: r128's VSM adds a two-pass box blur per casting map
 * (2×2048² + 4×2×1024² ≈ 16.8 Mtexel of a trivial shader per frame), which a GPU does not
 * notice and SwiftShader does. ?shadows=pcf restores today's PCFSoft edges with the rest of
 * the rig intact — the A/B pair the VSM-bleed decision is photographed from. renderer.js
 * keeps PCFSoft as its constructor default so m0's 0x0 probe renderer is untouched; main.js
 * applies this right after detectRenderTier.
 *
 * @param {typeof THREE} THREE
 * @param {'gpu'|'software'} tier
 * @returns {number} THREE.VSMShadowMap | THREE.PCFSoftShadowMap
 */
export function shadowMapTypeFor(THREE, tier) {
  let forcedPcf = false;
  try { forcedPcf = new URLSearchParams(location.search).get('shadows') === 'pcf'; }
  catch (e) { /* no location — no override */ }
  const vsm = tier === 'gpu' && RENDER.look.shadows === 'vsm' && !forcedPcf;
  return vsm ? THREE.VSMShadowMap : THREE.PCFSoftShadowMap;
}

/** The rig built at boot, or the one the last setQualityTier made. One page, one scene, one rig. */
let CURRENT = null;

/**
 * Build the whole rig and add it to the scene.
 *
 * @param {THREE.Scene} scene
 * @param {{minX,maxX,minZ,maxZ,maxY,id,castShadow}[]} rooms  interior volumes wanting a light
 * @param {'gpu'|'software'} tier
 * @returns {{sun, fill, hemi, ambient, roomLights, tier}}
 */
export function buildLighting(scene, rooms = [], tier = 'gpu') {
  const rig = makeRig(scene, rooms, tier);
  /* The one rig this page has, remembered so setQualityTier can rebuild it in place. scene.js
   * computes `rooms` from ZONES/DEST_ZONES and does not return them (it returns the LIGHTS), so
   * without this the live switch would need main.js to derive the room list a second time —
   * two copies of a §20.1 authoring decision, which is exactly how a rebuild starts lighting a
   * different house than the boot did. */
  CURRENT = { scene, rooms: rooms.slice(), rig };
  return rig;
}

/** The live rig: {sun, fill, hemi, ambient, roomLights, tier}, or null before boot. */
export function currentLighting() { return CURRENT ? CURRENT.rig : null; }

/**
 * How many SHADOW MAPS this rig renders per frame — the number the quality tier decides, and
 * the one KNOWN_ISSUES' "the tier decides how many shadow maps are BUILT" was about (m36 Q1).
 * @param {object} [rig]  the live rig by default
 */
export function shadowMapCount(rig = CURRENT && CURRENT.rig) {
  if (!rig) return 0;
  return [rig.sun, rig.fill, rig.hemi, rig.ambient, ...(rig.roomLights || [])]
    .filter((l) => l && l.castShadow).length;
}

/**
 * Take a rig back out of the scene: every map disposed, every light and light target removed.
 *
 * ⚠ BOTH HALVES ARE NEEDED (r128). `light.dispose()` on a Directional/Spot light disposes the
 * shadow's map and mapPass — that is the GPU memory, and renderer.info.memory.textures counts
 * it — while `scene.remove` is what takes the light out of the lights hash the materials
 * compile against. Doing one without the other leaks: the maps stay allocated, or the scene
 * keeps a light with no map and every material recompiles around it. A target is a plain
 * Object3D the builder added separately (the fill's is never added, so it is checked, not
 * assumed). Disposing a map twice is safe: the renderer removes its own 'dispose' listener on
 * the first one (WebGLTextures.onRenderTargetDispose).
 */
export function disposeLighting(rig, scene) {
  if (!rig || !scene) return 0;
  let removed = 0;
  for (const l of [rig.hemi, rig.ambient, rig.sun, rig.fill, ...(rig.roomLights || [])]) {
    if (!l) continue;
    if (l.shadow && l.shadow.map) l.shadow.map.dispose();
    if (typeof l.dispose === 'function') l.dispose();
    if (l.target && l.target.parent) { l.target.parent.remove(l.target); removed++; }
    if (l.parent) { l.parent.remove(l); removed++; }
  }
  return removed;
}

/**
 * §21.4 / §15.4 — CHANGE THE QUALITY TIER OF A SCENE THAT IS ALREADY RUNNING (M29).
 *
 * KNOWN_ISSUES carried "Quality tier applies on reload, and the card says so" from Phase 17,
 * for the honest reason that the tier decides how many shadow maps are built before the scene
 * exists. It decides how many LIGHTS are built — the geometry, the physics world and
 * game.state have nothing to do with it — so the rebuild is: dispose this rig, build the other
 * one against the same scene and the same rooms, and hand the renderer the tier's shadow
 * filter. Nothing else in the frame is touched, which is why a suite can assert the counts
 * either side of it (m36 Q1) and the state equality across it (m0 E8).
 *
 * @param {'gpu'|'software'} tier
 * @param {{renderer?, THREE?, scene?, rooms?}} [opts]  the renderer whose shadowMap.type follows
 * @returns {object|null} the new rig, or null when nothing has been built yet
 */
export function setQualityTier(tier, opts = {}) {
  if (!CURRENT && !opts.scene) return null;
  const scene = opts.scene || CURRENT.scene;
  const rooms = opts.rooms || (CURRENT ? CURRENT.rooms : []);
  if (CURRENT) disposeLighting(CURRENT.rig, scene);
  const rig = makeRig(scene, rooms, tier);
  CURRENT = { scene, rooms, rig };
  const renderer = opts.renderer;
  if (renderer && renderer.shadowMap) {
    const THREE = opts.THREE || window.THREE;
    renderer.shadowMap.type = shadowMapTypeFor(THREE, tier);
    // autoUpdate is false (main.js); present() raises needsUpdate every frame, but a build that
    // is asserted without presenting should still be marked dirty rather than silently stale.
    renderer.shadowMap.needsUpdate = true;
  }
  return rig;
}

/** The construction itself — called at boot by buildLighting and again by setQualityTier. */
function makeRig(scene, rooms, tier) {
  const THREE = window.THREE;
  const L = LIGHTING;
  const T = L.tiers[tier] || L.tiers.gpu;
  const soft = !T.roomLights;

  const hemi = new THREE.HemisphereLight(L.hemi.sky, L.hemi.ground, L.hemi.intensity);
  scene.add(hemi);

  const ambient = new THREE.AmbientLight(L.ambient.colour, L.ambient.intensity);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(L.sun.colour, L.sun.intensity);
  sun.position.set(L.sun.at.x, L.sun.at.y, L.sun.at.z);
  sun.castShadow = true;
  sun.shadow.mapSize.set(T.sunShadowMap, T.sunShadowMap);
  const d = L.sunShadowHalfWidth;
  sun.shadow.camera.left = -d; sun.shadow.camera.right = d;
  sun.shadow.camera.top = d;   sun.shadow.camera.bottom = -d;
  sun.shadow.camera.near = 1;  sun.shadow.camera.far = 80;
  sun.shadow.bias = L.sunShadowBias;
  sun.shadow.normalBias = L.normalBias;
  // Read by VSM only; harmless under PCFSoft (which ignores radius in r128).
  sun.shadow.radius = L.sunShadowRadius;
  scene.add(sun);
  scene.add(sun.target);

  // No shadow on the fill: it exists to keep shadowed faces readable, and a second full
  // shadow pass over the whole scene would double the cost to do the opposite.
  const fill = new THREE.DirectionalLight(L.fill.colour, L.fill.intensity);
  fill.position.set(L.fill.at.x, L.fill.at.y, L.fill.at.z);
  scene.add(fill);

  /* On the software tier there are no room lights at all — see the measurements above.
   * The rooms go back to being lit by the hemisphere alone, which is flat, and flat at
   * 45 FPS is a better game than moody at 6. */
  const roomLights = [];
  for (const r of (soft ? [] : rooms)) {
    const cx = (r.minX + r.maxX) / 2;
    const cz = (r.minZ + r.maxZ) / 2;
    const h = (r.maxY !== undefined ? r.maxY : 2.7) - L.room.dropFromCeiling;
    const halfDiag = Math.hypot(r.maxX - r.minX, r.maxZ - r.minZ) / 2;

    // Per-room colour, falling back to the rig's tungsten for an unlisted zone.
    const colour = (L.roomColours && L.roomColours[r.id] !== undefined) ? L.roomColours[r.id] : L.room.colour;
    const spot = new THREE.SpotLight(colour, L.room.intensity);
    spot.position.set(cx, h, cz);
    /* The cone has to reach the room's CORNERS, or the light stops in a circle on the floor
     * and the corners of a rectangular room stay as flat as they were. A margin over the
     * exact corner angle keeps the penumbra falling outside the walls rather than across
     * them. Capped just under 90°, past which a Three spot is degenerate. */
    spot.angle = Math.min(1.40, Math.atan2(halfDiag * 1.15, h) + 0.10);
    spot.penumbra = L.room.penumbra;
    spot.decay = L.room.decay;
    spot.distance = h + halfDiag * 1.6;
    // In software, room lights light but do not cast. The falloff and the warm colour
    // survive; only the contact shadows go, which is the right thing to lose first.
    spot.castShadow = T.roomShadows && r.castShadow !== false;
    if (spot.castShadow) {
      spot.shadow.mapSize.set(L.room.shadowMap, L.room.shadowMap);
      spot.shadow.camera.near = 0.25;
      spot.shadow.camera.far = spot.distance;
      spot.shadow.bias = L.room.shadowBias;
      spot.shadow.normalBias = L.normalBias;
      spot.shadow.radius = L.room.shadowRadius;
    }
    spot.target.position.set(cx, 0, cz);
    spot.userData.roomId = r.id;

    scene.add(spot);
    scene.add(spot.target);
    roomLights.push(spot);
  }

  return { sun, fill, hemi, ambient, roomLights, tier };
}
