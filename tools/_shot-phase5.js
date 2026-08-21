/* Poses the Phase 5 build for docs/phase5-house.png: the pickup house with §13.2's manifest
 * in it, seen from above the front so all three rooms and the doorway turn read at once.
 *
 * An interior shot would show one room and prove nothing. The claim of this phase is that
 * there is a HOUSE with a route through it and 23 objects distributed across it, and that is
 * a claim about the plan, not about a room. */
const M = await window.__MFH_READY;
const R = M.registry, movers = M.movers;

const STEP = 1000 / 60;
const drive = (n) => {
  for (let i = 0; i < n; i++) {
    M.physics.clearForces();
    for (const m of movers) {
      m.grips.step(STEP, { brace: false, simTimeMs: i * STEP });
      m.controller.step(STEP, {
        move: { x: 0, y: 0 },
        forward: { x: 0, y: 0, z: -1 }, right: { x: 1, y: 0, z: 0 },
        run: false, brace: false, jump: false, recover: false,
      });
    }
    M.physics.step();
    R.step(STEP);
  }
};

// Two movers in the living room, so the house has people in it at a readable scale.
movers[0].controller.hardSetPosition({ x: 1.10, y: 0.1, z: -2.90 });
if (movers[1]) movers[1].controller.hardSetPosition({ x: 2.30, y: 0.1, z: -2.60 });
for (const m of movers) { m.controller._vel.x = 0; m.controller._vel.z = 0; m.controller.velocityY = 0; }
drive(40);

/* Look down into the house from above the roofline.
 *
 * Setting M.camera.position directly does not survive: the game's own render loop calls
 * rig.update() every frame and puts the camera back behind the active mover, so a
 * hand-placed camera is overwritten between this script running and the frame being
 * captured. Everything has to go through the rig.
 *
 * Two things are then in the way, and both are removed honestly rather than worked around:
 *   - the ceiling MESH, which would make this a photograph of a lid;
 *   - the ceiling COLLIDER, because the rig's occlusion test pulls the camera down through
 *     anything between it and its target, which from above is the ceiling.
 * The walls, partitions and doorways all stay in place and in the occlusion set. */
const ceilingHidden = [];
M.world.scene.traverse((o) => {
  if (o.isMesh && o.geometry && o.geometry.parameters) {
    const p = o.geometry.parameters;
    if (p.height && Math.abs(p.height - 0.16) < 1e-6 && p.width >= 9.9 && p.depth >= 6.9) {
      o.visible = false;
      ceilingHidden.push(o);
    }
  }
});
M.rig.colliders = M.world.colliders.filter((c) => c.tag !== 'roomCeiling');

// pitchMin is -1.15 rad (66 degrees down) — the steepest the rig allows. At 15 m that puts
// the camera about 13 m up and 6 m south, which clears the 2.7 m south wall comfortably.
M.rig.yaw = 0;
M.rig.pitch = -1.15;
M.rig.setDistance(15.5);
M.rig._currentDistance = 15.5;
const eye = movers[0].controller.position;
for (let i = 0; i < 60; i++) M.rig.update({ x: 0.2, y: eye.y, z: -4.6 }, 1 / 60);

for (const m of movers) {
  const sp = M.game.state.players[m.id];
  sp.position = { ...m.controller.position };
  m.body.update(m.controller.position, m.yaw, 0, 1 / 60);
}
R.syncMeshes();
M.hud.update(movers[0].grips.status());
M.overlay.el.hidden = true;
M.syncSize();
M.renderer.render(M.world.scene, M.camera);
