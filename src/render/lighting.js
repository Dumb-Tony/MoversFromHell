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
 */

import { RENDER } from '../config.js';

/** Warm tungsten, against the sun's cooler daylight. The contrast between the two is most of
 *  what makes an interior read as an interior rather than as a darker outdoors. */
export const LIGHTING = Object.freeze({
  sun:        { colour: 0xffe9c4, intensity: 1.18, at: { x: 16, y: 17, z: 11 } },
  fill:       { colour: 0x9fc0e0, intensity: 0.26, at: { x: -12, y: 9, z: -14 } },
  hemi:       { sky: 0xbcd8ee, ground: 0x6b6350, intensity: 0.30 },
  /** A floor under the whole scene, so a shadowed corner is dim rather than black. §26.5
   *  needs states legible; nothing is legible at zero. */
  ambient:    { colour: 0xb9c6d4, intensity: 0.11 },
  room:       {
    colour: 0xffc98e,
    intensity: 2.35,
    penumbra: 0.75,
    decay: 1.15,
    /** Hung just under the ceiling, like a light would be. */
    dropFromCeiling: 0.16,
    shadowMap: 1024,
    shadowBias: -0.0012,
  },
  /** The sun's shadow camera half-width. Tighter is sharper: this box is spread across a
   *  fixed 2048 map, so 20 m gives 40/2048 = 19.5 mm per texel where 26 m gave 25 mm. It
   *  must still cover the pickup house, the driveway and the truck at once — the
   *  destination gets its own room lights and does not need sun shadows to read. */
  sunShadowHalfWidth: 20,
  sunShadowMap: 2048,
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
    return 'gpu';                      // unknowable: assume the capable path
  }
}

/**
 * Build the whole rig and add it to the scene.
 *
 * @param {THREE.Scene} scene
 * @param {{minX,maxX,minZ,maxZ,maxY,id,castShadow}[]} rooms  interior volumes wanting a light
 * @param {'gpu'|'software'} tier
 * @returns {{sun, fill, hemi, ambient, roomLights, tier}}
 */
export function buildLighting(scene, rooms = [], tier = 'gpu') {
  const THREE = window.THREE;
  const L = LIGHTING;
  const soft = tier === 'software';

  const hemi = new THREE.HemisphereLight(L.hemi.sky, L.hemi.ground, L.hemi.intensity);
  scene.add(hemi);

  const ambient = new THREE.AmbientLight(L.ambient.colour, L.ambient.intensity);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(L.sun.colour, L.sun.intensity);
  sun.position.set(L.sun.at.x, L.sun.at.y, L.sun.at.z);
  sun.castShadow = true;
  sun.shadow.mapSize.set(soft ? 1024 : L.sunShadowMap, soft ? 1024 : L.sunShadowMap);
  const d = L.sunShadowHalfWidth;
  sun.shadow.camera.left = -d; sun.shadow.camera.right = d;
  sun.shadow.camera.top = d;   sun.shadow.camera.bottom = -d;
  sun.shadow.camera.near = 1;  sun.shadow.camera.far = 80;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
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

    const spot = new THREE.SpotLight(L.room.colour, L.room.intensity);
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
    spot.castShadow = !soft && r.castShadow !== false;
    if (spot.castShadow) {
      spot.shadow.mapSize.set(L.room.shadowMap, L.room.shadowMap);
      spot.shadow.camera.near = 0.25;
      spot.shadow.camera.far = spot.distance;
      spot.shadow.bias = L.room.shadowBias;
      spot.shadow.normalBias = 0.02;
    }
    spot.target.position.set(cx, 0, cz);
    spot.userData.roomId = r.id;

    scene.add(spot);
    scene.add(spot.target);
    roomLights.push(spot);
  }

  void RENDER;
  return { sun, fill, hemi, ambient, roomLights, tier };
}
