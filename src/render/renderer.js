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
  renderer.setClearColor(0x9fc4dd);

  const camera = new THREE.PerspectiveCamera(RENDER.fov, 1, RENDER.near, RENDER.far);

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
    return { w, h };
  }
  resize();
  window.addEventListener('resize', resize);

  return { THREE, renderer, camera, resize };
}
