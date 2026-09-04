/* Poses the Phase 8 build for docs/phase8-drive.png: the aftermath of driving a badly packed
 * truck through §13.3's route.
 *
 * The shot is the gate. Nothing here arranges the mess — the objects are placed loose and
 * high, the route's hard brake, sharp turn and speed bump are applied as real forces, and
 * where everything ends up is where the solver put it. Measured on this exact pack: worst
 * shift 2.615 m against 0.470 m for a strapped one, and $6.40 of §8.4 damage against nothing.
 */
const M = await window.__MFH_READY;
const R = M.registry, movers = M.movers, straps = M.straps, cargo = M.cargo;
const damage = M.damage, route = M.route;

const STEP = 1000 / 60;
const step = (n) => {
  for (let i = 0; i < n; i++) {
    M.physics.clearForces();
    straps.step(STEP, i * STEP);
    route.step(STEP, i * STEP);          // applies road force — before the solver step
    for (const m of movers) {
      m.grips.step(STEP, { brace: false, simTimeMs: i * STEP });
      m.controller.step(STEP, {
        move: { x: 0, y: 0 }, forward: { x: 0, y: 0, z: -1 }, right: { x: 1, y: 0, z: 0 },
        run: false, brace: false, jump: false, recover: false,
      });
    }
    M.physics.step();
    R.step(STEP);
    cargo.step(STEP, i * STEP);
    damage.step(STEP, i * STEP);          // reads what the solver did — after
  }
};

const byDef = (id) => { for (const e of R.entities.values()) if (e.defId === id) return e; return null; };
const allOfDef = (id) => [...R.entities.values()].filter((e) => e.defId === id);
const park = (e, x, y, z, yaw = 0) => {
  e.body.setTranslation({ x, y, z }, true);
  e.body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
  e.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  e.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  e.body.wakeUp();
};

const T = M.truckPose, I = M.cargoInterior;

// The BAD pack from m8: heavy stacked high, fragile loose, two metres of run-up, no straps.
straps.releaseAll(); damage.reset(); route.reset();
const dresser = byDef('dresser_01'), fridge = byDef('fridge_01'), tv = byDef('tv_55_01');
const boxes = allOfDef('box_small_01').slice(0, 4);
if (dresser) park(dresser, T.x - 0.45, I.minY + 0.45, I.minZ + 0.70);
if (fridge) park(fridge, T.x - 0.45, I.minY + 1.78, I.minZ + 0.70);
if (tv) park(tv, T.x + 0.55, I.minY + 0.42, I.minZ + 0.60);
boxes.forEach((b, k) => park(b, T.x + 0.10 + k * 0.05, I.minY + 0.28 + k * 0.52, I.minZ + 1.50));
M.physics.primeQueries();
step(140);

// Drive the whole route. Everything after this is the solver's doing.
route.depart();
step(Math.ceil(28.0 * 60) + 90);
damage.flush();

// Movers at the rear door, looking at what they have done.
movers[0].controller.hardSetPosition({ x: T.x - 0.5, y: 0.1, z: I.minZ - 2.5 });
if (movers[1]) movers[1].controller.hardSetPosition({ x: T.x + 1.5, y: 0.1, z: I.minZ - 2.9 });
for (const m of movers) { m.controller._vel.x = 0; m.controller._vel.z = 0; m.controller.velocityY = 0; }
step(25);

M.rig.yaw = Math.PI;
M.rig.pitch = -0.04;
M.rig.setDistance(5.6);
M.rig._currentDistance = 5.6;
for (let i = 0; i < 60; i++) M.rig.update({ x: T.x, y: 1.10, z: I.minZ - 1.0 }, 1 / 60);

for (const m of movers) {
  const sp = M.game.state.players[m.id];
  sp.position = { ...m.controller.position };
  m.body.update(m.controller.position, m.yaw, 0, 1 / 60);
}
R.syncMeshes();
M.tools.syncMeshes();
M.hud.update(movers[0].grips.status());
M.overlay.el.hidden = true;
M.syncSize();
M.present(M.camera);
