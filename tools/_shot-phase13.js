/* Poses the Phase 13 build for docs/phase13-look.png — the art pass, in one frame.
 *
 * Deliberately a SINGLE-PLAYER over-the-shoulder frame rather than the split screen: this
 * phase is about what the world looks like, and halving the viewport halves the argument.
 * The camera is still the game's own §4.1 third-person rig on a real mover, at its real
 * boom length — not a free camera flown to a flattering angle.
 */
const M = await window.__MFH_READY;
const R = M.registry, movers = M.movers, interact = M.interact, cargo = M.cargo;
const STEP = 1000 / 60;

const step = (n) => {
  for (let i = 0; i < n; i++) {
    M.physics.clearForces();
    interact.step(movers, STEP);
    M.straps.step(STEP, i * STEP);
    for (const m of movers) {
      m.grips.step(STEP, { brace: true, simTimeMs: i * STEP });
      m.controller.step(STEP, {
        move: { x: 0, y: 0 },
        forward: { x: -Math.sin(m.grips.aimYaw), y: 0, z: -Math.cos(m.grips.aimYaw) },
        right: { x: Math.cos(m.grips.aimYaw), y: 0, z: -Math.sin(m.grips.aimYaw) },
        run: false, brace: true, jump: false, recover: false,
      });
    }
    M.physics.step();
    R.step(STEP);
    cargo.step(STEP, i * STEP);
  }
};

const byDef = (id) => { for (const e of R.entities.values()) if (e.defId === id) return e; return null; };
const park = (e, x, y, z, yaw = 0) => {
  e.body.setTranslation({ x, y, z }, true);
  e.body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
  e.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  e.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  e.body.wakeUp();
};

const lookAt = (m, from, target) => {
  m.controller.hardSetPosition({ x: from.x, y: from.y, z: from.z });
  m.controller._vel.x = 0; m.controller._vel.z = 0; m.controller.velocityY = 0;
  const p = m.controller.position;
  m.rig.yaw = Math.atan2(-(target.x - p.x), -(target.z - p.z));
  m.rig.pitch = Math.atan2(target.y - (p.y + 1.4), Math.hypot(target.x - p.x, target.z - p.z));
  for (let i = 0; i < 30; i++) m.rig.update(p, 1 / 60);
  const c = m.camera.position;
  m.rig.yaw = Math.atan2(-(target.x - c.x), -(target.z - c.z));
  m.rig.pitch = Math.atan2(target.y - c.y, Math.hypot(target.x - c.x, target.z - c.z));
  m.grips.syncAim();
  M.physics.primeQueries();
};

/* Dress the driveway with a job in progress: a couple of boxes stacked by the truck, the
 * dolly out, and the couch on its way down from the house. */
const boxes = [...R.entities.values()].filter((e) => e.defId === 'box_small_01').slice(0, 3);
boxes.forEach((b, i) => park(b, 2.35 + (i % 2) * 0.56, 0.26 + Math.floor(i / 2) * 0.52, 8.2 + (i % 2) * 0.1, 0.3 * i));
const fragile = byDef('box_fragile_01');
if (fragile) park(fragile, 1.65, 0.28, 7.4, 0.5);

const couch = byDef('couch_3seat_01');
const cx = 1.5, cz = 4.6;
park(couch, cx, 0.46, cz, Math.PI / 2);        // long axis along Z, being walked down the drive
M.physics.primeQueries();
step(60);

/* Both movers on it, §6.4's opposite-end grip. m4-tests.js section B's geometry: stand
 * 1.2 m off the long side and aim at the NEAR EDGE, not the centre. */
const cp = couch.body.translation();
const ends = [
  { m: movers[0], at: { x: cp.x - 1.2, z: cp.z - 0.85 }, grab: { x: cp.x - 0.35, y: 0.62, z: cp.z - 0.78 } },
  { m: movers[1], at: { x: cp.x - 1.2, z: cp.z + 0.85 }, grab: { x: cp.x - 0.35, y: 0.62, z: cp.z + 0.78 } },
];
for (const e of ends) {
  e.m.controller.hardSetPosition({ x: e.at.x, y: 0.2, z: e.at.z });
  e.m.controller._vel.x = 0; e.m.controller._vel.z = 0; e.m.controller.velocityY = 0;
}
M.physics.primeQueries();
step(30);
for (const e of ends) {
  lookAt(e.m, { x: e.at.x, y: 0.05, z: e.at.z }, e.grab);
  e.m.grips.tryGrab('right', e.m.id, 0);
  e.m.grips.tryGrab('left', e.m.id, 0);
}
step(26);

/* THE FRAME: over the crew's shoulder, down the drive, toward the truck they are walking
 * the couch to. The camera is NOT moved — mover 0 is holding an end and moving them now
 * would stretch the grip until it broke. Only the RIG turns, which is exactly what the
 * mouse does. The first version stood the camera out on the lawn and framed half a lawn. */
{
  const me0 = movers[0];
  const p = me0.controller.position;
  const target = { x: 0.9, y: 1.35, z: 9.2 };          // the truck's open rear
  me0.rig.setDistance(4.6);
  me0.rig.yaw = Math.atan2(-(target.x - p.x), -(target.z - p.z));
  me0.rig.pitch = -0.14;
  for (let i = 0; i < 45; i++) me0.rig.update(p, 1 / 60);
}
step(4);

M.game.state.elapsedWorkMs = 7.8 * 60000;

for (const m of movers) {
  const sp = M.game.state.players[m.id];
  if (sp) { sp.position = { ...m.controller.position }; sp.yaw = m.grips.aimYaw; }
  m.body.update(m.controller.position, m.grips.aimYaw, 0, 1 / 60);
}
R.syncMeshes();
M.tools.syncMeshes();
M.strapLines.update(0.016);

const me = movers[0];
const summary = M.manifestSummary(M.game.state.manifest);
M.hud.update(me.grips.status());
M.hud.setPrompt(interact.describe(me));
M.hud.setContract({
  phase: M.game.state.phase,
  delivered: summary.delivered,
  total: summary.total,
  loaded: cargo.loadedEntities().length,
  roomCorrect: summary.roomCorrect,
  elapsedMin: M.game.state.elapsedWorkMs / 60000,
  estimateMin: M.game.state.estimateMs / 60000,
});
M.hud.setCargo(cargo.packQuality());
M.hud.notice('two hands on the couch', 'good');
M.overlay.el.hidden = true;
// The title card is up on a fresh boot; dismiss it as a player would.
if (M.title) { M.title.start(); M.title.el.hidden = true; }

M.syncSize();
M.renderer.render(M.world.scene, me.camera);
