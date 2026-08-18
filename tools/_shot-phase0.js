/* Poses the Phase 0 diagnostic scene for docs\phase0-scene.png.
 * Runs AFTER main.js, so it drives the real game through window.__MFH.
 *
 * The framing is chosen to show the thing the scene exists to show: three apertures at
 * 0.82 / 0.86 / 0.91 m with the 2.10 m couch in front of them, read against a metre grid.
 * Coral jambs = the couch cannot pass; lime jambs = it can. */

const M = window.__MFH;
const g = M.game;

// Pull the camera back and up, off-axis, so all three doorways and the couch are legible.
M.rig.yaw = -0.30;
M.rig.pitch = -0.34;
M.rig.setDistance(7.0);
M.rig._currentDistance = 7.0;

// Look at a point between the couch and the wall rather than at the player origin.
g.state.players[g.state.localPlayerId].position = { x: 0.4, y: 0, z: 1.2 };

// Drive real frames so the camera's follow/occlusion smoothing settles. Frames are driven
// directly because headless Chrome delivers only 1-3 rAF callbacks (Dev\INDEX.md).
for (let i = 0; i < 90; i++) {
  g.frame(16.7);
  M.rig.update(g.state.players[g.state.localPlayerId].position, 0.0167);
}
M.renderer.render(M.world.scene, M.camera);

// Hide the overlay: this shot is about the geometry, not the instrumentation.
M.overlay.el.hidden = true;
