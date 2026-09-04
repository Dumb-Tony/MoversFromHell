/* The ONE render entry point — Phase 15.
 *
 * Every frame the game draws goes through present(): main.js's loop, api.present() for the
 * suites, and all of tools/ (the 17 direct renderer.render() callers were migrated here).
 * It exists because two things now have to happen around the seat loop and a caller that
 * forgets either photographs a wrong frame with no error:
 *
 *   1. renderer.shadowMap.autoUpdate is false (set once in main.js), so shadow maps are
 *      rendered exactly once per frame instead of once per seat — co-op used to render the
 *      sun map and four room maps twice. needsUpdate is raised HERE (and inside
 *      renderSeats, for any legacy caller); the first seat's render consumes it. A direct
 *      renderer.render() with neither raised draws a shadowless world.
 *
 *   2. The post chain (post.js) must run after the last seat and before anything else
 *      touches the canvas, with the default framebuffer bound. It is passed in rather than
 *      imported so the software tier (post === null) never even loads its allocations.
 *
 * The seat loop itself stays in coopView.renderSeats — the CSS-px setViewport/setScissor
 * idiom and its two measured gotchas (pixel ratio, GL y-up) live there and are pinned by
 * m12 D1-D12. This module delegates and adds nothing to the loop but the beforeSeat hook,
 * which materials.js uses to point the shared rim uniform at each seat's camera.
 *
 * On return the renderer is in a known state: default framebuffer, the full canvas as the
 * stored viewport, scissor test off (post.apply() restores it even when disabled; without
 * post, renderSeats already ends with scissor off and the last seat's viewport — which for
 * one seat IS the full canvas).
 */

import { renderSeats } from './coopView.js';

let sizeScratch = null;

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @param {{camera: THREE.Camera}[]} seats
 * @param {ReturnType<typeof import('./coopView.js').layoutFor>} rects  CSS px, GL y-up
 * @param {ReturnType<typeof import('./post.js').createPost>} post      null on the software tier
 * @param {(camera: THREE.Camera, rect) => void} [beforeSeat]
 */
export function present(renderer, scene, seats, rects, post, beforeSeat) {
  renderer.shadowMap.needsUpdate = true;
  renderSeats(renderer, scene, seats, rects, beforeSeat);
  if (post) {
    /* getSize() is CSS px — exactly what post.apply() wants for the viewport restore. It
     * reads the drawing-buffer size itself for every buffer it owns (never from here). */
    if (!sizeScratch) sizeScratch = new window.THREE.Vector2();
    renderer.getSize(sizeScratch);
    post.apply(rects, renderer.getPixelRatio(), sizeScratch.x, sizeScratch.y);
  }
}
