/* Art-direction variants — a decision rig, not a feature. GDD §20.1, §13.4, §25.1.
 *
 * "Make it look much better" forks three ways, and the fork is a PRODUCT decision:
 *
 *   toy   lean INTO the primitives. Bevelled chunky shapes, saturated colour, hard warm
 *         light. Moving Out territory — the comedy the GDD keeps (§3, consequential chaos)
 *         photographed to match.
 *   cel   flat banded shading and ink outlines. Hides low-detail geometry completely;
 *         reads as a Saturday-morning cartoon.
 *   film  keep the realism the proportions already have and push it: graded, vignetted,
 *         soft. The direction that fights the box geometry hardest.
 *
 * Each mode is applied AT RUNTIME over the shipping build, selected by ?style=, so all
 * three can be photographed from one commit and compared on the same posed scene. The
 * shipping default is unchanged until the pick is made — this file is the experiment, and
 * whichever mode wins gets rebuilt properly (geometry included) rather than left as a
 * traversal hack. The losers stay reachable behind the flag, because "why not the other
 * one" is a question with a screenshot for an answer.
 *
 * §25.1: state the hypothesis before the increment. The hypothesis is that TOY wins —
 * the geometry is already primitives, so a style that celebrates primitives beats two that
 * apologise for them — but that is exactly the kind of taste call the user asked to make
 * themselves, so it ships as three photographs rather than as a decision.
 */

import { LIGHTING } from './lighting.js';

export function styleFromLocation() {
  try {
    const s = new URLSearchParams(location.search).get('style');
    return ['cel', 'film'].includes(s) ? s : null;
  } catch (e) { return null; }
}

/**
 * Apply a variant to the built world. Mutates materials and lights in place.
 *
 * @param {string} mode  'toy' | 'cel' | 'film'
 * @param {{scene, sun, hemi, ambient, roomLights}} world
 * @param {THREE.WebGLRenderer} renderer
 * @returns {{postRender: null | ((renderer, scene, camera) => void)}}
 *   postRender: when set, main.js calls THIS instead of renderer.render — the film grade
 *   needs the frame in a texture before it can grade it.
 */
export function applyStyle(mode, world, renderer) {
  const THREE = window.THREE;
  if (mode === 'cel') return applyCel(THREE, world);
  if (mode === 'film') return applyFilm(THREE, world, renderer);
  return { postRender: null };
}

/* ── cel: toon ramps and ink outlines ────────────────────────────────────────── */

function toonRamp(THREE, steps = 4) {
  const c = document.createElement('canvas');
  c.width = steps; c.height = 1;
  const x = c.getContext('2d');
  for (let i = 0; i < steps; i++) {
    // Deliberately not linear: the darkest band sits at 0.45 rather than 0, because a
    // cartoon's shadow is a colour, not an absence.
    const v = Math.round(255 * (0.45 + 0.55 * (i / (steps - 1))));
    x.fillStyle = `rgb(${v},${v},${v})`;
    x.fillRect(i, 0, 1, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

function applyCel(THREE, world) {
  const ramp = toonRamp(THREE, 4);
  const outlineMat = new THREE.MeshBasicMaterial({ color: 0x1a1622, side: THREE.BackSide });
  const outlines = [];

  world.scene.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    if (o.userData.isOutline) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    /* The sky dome is BackSide and unlit; converting it to a LIT toon material washed the
     * whole sky out and erased the clouds — MeshBasic means "not yours to restyle". */
    if (mats.some((mm) => mm && (mm.side === THREE.BackSide || mm.type === 'MeshBasicMaterial'))) return;
    const swapped = mats.map((m) => {
      if (!m || !m.color) return m;
      const toon = new THREE.MeshToonMaterial({
        color: m.color.clone(),
        map: m.map || null,
        gradientMap: ramp,
        side: m.side,
        transparent: m.transparent,
        opacity: m.opacity,
      });
      return toon;
    });
    o.material = Array.isArray(o.material) ? swapped : swapped[0];

    /* Inverted-hull outline on the things you look AT — furniture-sized meshes. Walls and
     * ground get none (a 10 m wall with a 2 cm black shell reads as dirt), and tiny parts
     * get none (a drawer handle's outline is thicker than the handle). */
    if (o.geometry && o.geometry.boundingSphere === null) o.geometry.computeBoundingSphere();
    const r = o.geometry && o.geometry.boundingSphere ? o.geometry.boundingSphere.radius : 0;
    if (r > 0.09 && r < 2.6) {
      const hull = new THREE.Mesh(o.geometry, outlineMat);
      hull.scale.setScalar(1.035);
      hull.userData.isOutline = true;
      hull.castShadow = false;
      hull.receiveShadow = false;
      outlines.push([o, hull]);
    }
  });
  for (const [o, hull] of outlines) o.add(hull);

  // Flat cartoon light: one sun for the band split, bright even fill, no moody corners.
  world.sun.intensity = 1.1;
  world.hemi.intensity = 0.75;
  world.ambient.intensity = 0.25;
  for (const s of world.roomLights || []) s.intensity *= 0.7;
  return { postRender: null };
}

/* ── film: render-to-texture, then grade ─────────────────────────────────────── */

function applyFilm(THREE, world, renderer) {
  /* The grade is a real post pass — scene to a render target, then a fullscreen triangle
   * with the grade in a fragment shader. r128 has no EffectComposer in the core build and
   * none is needed for one pass.
   *
   * The look: lifted blacks, gentle S-curve, desaturated toward a cool neutral, and a
   * vignette. Bloom is deliberately absent — it needs blur passes that would double the
   * frame cost for a mock; noted in the changelog as "what the real version adds". */
  const size = new THREE.Vector2();
  renderer.getSize(size);
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, {
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
  });

  const gradeMat = new THREE.ShaderMaterial({
    uniforms: { tScene: { value: rt.texture } },
    vertexShader: `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `
      uniform sampler2D tScene;
      varying vec2 vUv;
      void main() {
        vec3 c = texture2D(tScene, vUv).rgb;
        c = pow(c, vec3(0.92));                          // lift the mids
        float g = dot(c, vec3(0.299, 0.587, 0.114));
        c = mix(vec3(g), c, 0.90);                       // desaturate 10%
        c = mix(c, c * vec3(0.985, 1.0, 1.03), 0.5);     // cool the neutrals
        vec2 d = vUv - 0.5;
        c *= 1.0 - 0.20 * smoothstep(0.15, 0.55, dot(d, d));  // gentle vignette
        /* Linear -> sRGB by hand. renderer.outputEncoding only reaches BUILT-IN materials —
         * a ShaderMaterial gets no encoding chunk, so without this the graded frame displays
         * linear and the whole world photographs two stops dark. This was the entire
         * difference between "moody" and "power cut" in the first two mocks. */
        c = pow(max(c, vec3(0.0)), vec3(0.4545));
        gl_FragColor = vec4(c, 1.0);
      }`,
    depthTest: false, depthWrite: false,
  });
  // A single triangle that covers the screen — two fewer vertices than a quad and no seam.
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    -1, -1, 0,  3, -1, 0,  -1, 3, 0,
  ]), 3));
  tri.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
  const quadScene = new THREE.Scene();
  quadScene.add(new THREE.Mesh(tri, gradeMat));
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  /* The first grade dropped the sun AND crushed with a low-pivot contrast, and the mock
   * photographed as dusk — a broken render, not a direction. The light stays near stock;
   * the grade is the difference. */
  world.sun.intensity = 1.12;
  /* The sun stays at its stock position. Lowering it to (19,13,13) for "golden hour" threw
   * the truck's shadow across the entire mid-frame at the game's main camera angle — the
   * mock photographed as a power cut, and the grade got the blame. */
  world.hemi.intensity = 0.44;
  world.ambient.intensity = 0.15;
  for (const s of world.roomLights || []) s.intensity *= 1.1;

  return {
    postRender(r, scene, camera) {
      const cur = new THREE.Vector2();
      r.getSize(cur);
      if (cur.x !== rt.width || cur.y !== rt.height) rt.setSize(cur.x, cur.y);
      r.setRenderTarget(rt);
      r.render(scene, camera);
      r.setRenderTarget(null);
      r.render(quadScene, quadCam);
    },
  };
}

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

/* roundedBox moved to prefabs.js — the toy direction won and rounded geometry is now the
 * shipping build, not a proposal. cel and film remain here, reachable via ?style=, so the
 * decision stays photographable. */
