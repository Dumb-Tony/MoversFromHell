/* WebGL renderer setup — GDD §22.2 (UI/Audio + presentation), §22.5 (performance).
 *
 * Presentation only. Per §22.4 the renderer READS state and never writes it, so nothing
 * in here may touch game.state.
 *
 * Three.js r128 is loaded as a CLASSIC script by index.html and lives on window.THREE —
 * the same vendored build Chameleon and Something's Different use (assets/lib/r128).
 * Keeping that exact build is what lets their camera, texture and animation code drop in
 * without an API port (Dev\INDEX.md → "Reusable systems").
 */

import { RENDER } from '../config.js';

export function createRenderer(canvas) {
  const THREE = window.THREE;
  if (!THREE) throw new Error('THREE is not loaded — assets/lib/r128/three.min.js must run before src/main.js');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  // Capping the backing store keeps a 4K/hiDPI display from quietly quadrupling fill cost.
  // Copied from AirportBaggageCrew\src\render\camera.js, where it was the biggest single
  // frame-time win measured. §26.6 sets a 45 FPS floor; this is most of how it is met.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, RENDER.maxPixelRatio));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0xdfe9ee);

  /* COLOUR MANAGEMENT, added in the Phase 13 art pass and worth more than any single
   * texture in it.
   *
   * Three r128 defaults to LinearEncoding output, which means every colour is written to
   * the framebuffer without the sRGB transfer curve — midtones come out flat and washed,
   * and the usual response is to fight it by saturating the palette, which makes it worse.
   * Setting sRGB output plus a filmic tone map is what turns "flat coloured boxes under a
   * light" into something that reads as a photographed scene, and it costs nothing.
   *
   * The canvas textures in textures.js are authored in sRGB, so they must be TAGGED as such
   * or they get double-corrected and go pale — see `canvasTex`. */
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.physicallyCorrectLights = false;

  const camera = new THREE.PerspectiveCamera(RENDER.fov, 1, RENDER.near, RENDER.far);

  let lastW = -1, lastH = -1;

  /** Re-size only when the canvas actually changed size. Returns true if it did.
   *
   * Called EVERY FRAME rather than only from a resize listener, and that is deliberate.
   * A page that boots in a background or prerendered tab lays out at 0x0: the backing
   * store is 0x0 and camera.aspect is 0. Bringing that tab to the front fires no resize
   * event, so a listener-only implementation stays 0x0 forever and renders nothing.
   * MEASURED on the live GitHub Pages build in a non-painting tab — client size reached
   * 1280x720 while the backing store stayed 0x0 and aspect stayed 0.
   *
   * The comparison is two integer compares per frame; only a genuine change touches the
   * GL viewport or the projection matrix, so this costs nothing in the steady state. */
  function syncSize() {
    const w = canvas.clientWidth || window.innerWidth || 0;
    const h = canvas.clientHeight || window.innerHeight || 0;
    if (w === lastW && h === lastH) return false;
    lastW = w; lastH = h;
    if (w <= 0 || h <= 0) return false;   // still unlaid-out; try again next frame
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    return true;
  }
  syncSize();
  // Kept as well as the per-frame check: it makes a drag-resize update on the same frame
  // the browser reflows, rather than one frame later.
  window.addEventListener('resize', syncSize);

  return { THREE, renderer, camera, syncSize };
}
