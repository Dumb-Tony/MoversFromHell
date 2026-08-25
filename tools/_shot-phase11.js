/* Poses the Phase 11 build for docs/phase11-playable.png: the game with its interface on.
 *
 * Everything in this frame is the SHIPPING BUILD's, including the panels — which is the
 * whole point of the phase and the difference from the Phase 10 screenshot, where the
 * invoice was drawn by the screenshot script because the build had no UI at all.
 *
 * The HUD setters are called directly rather than waiting for the render loop, because
 * headless Chrome in --dump-dom mode delivers only 1-3 rAF callbacks (MEASURED — see
 * Dev\INDEX.md). They are the same functions main.js's loop calls, with the same arguments.
 *
 * STAGING RULE, learned twice now (see the long comment in m11-tests.js section D): put the
 * cargo at the FRONT and strap it to a MIDDLE-or-REAR anchor. The first version of this
 * script parked the fridge against the headboard and then picked the anchor NEAREST to it,
 * which is the anchor the fridge is standing in front of — so "stand 0.85 m inboard of the
 * anchor" placed the mover inside the fridge (probe distance 0.15 m, target `object`), no
 * strap was ever placed, and the HUD honestly reported 100% unstrapped.
 */
const M = await window.__MFH_READY;
const R = M.registry, movers = M.movers, straps = M.straps, cargo = M.cargo, interact = M.interact;
const STEP = 1000 / 60;

const step = (n) => {
  for (let i = 0; i < n; i++) {
    M.physics.clearForces();
    interact.step(movers, STEP);
    straps.step(STEP, i * STEP);
    for (const m of movers) {
      m.grips.step(STEP, { brace: false, simTimeMs: i * STEP });
      m.controller.step(STEP, {
        move: { x: 0, y: 0 },
        forward: { x: -Math.sin(m.grips.aimYaw), y: 0, z: -Math.cos(m.grips.aimYaw) },
        right: { x: Math.cos(m.grips.aimYaw), y: 0, z: -Math.sin(m.grips.aimYaw) },
        run: false, brace: false, jump: false, recover: false,
      });
    }
    M.physics.step();
    R.step(STEP);
    cargo.step(STEP, i * STEP);
    M.stepManifest(M.game.state.manifest, R, STEP);
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
const I = M.cargoInterior, ANCHORS = M.cargoAnchors, T = M.truckPose;

/* A part-loaded truck, packed the way §10.1 says to pack one: heavy and tall against the
 * headboard, boxes behind it, nothing loose near the door. */
const fridge = byDef('fridge_01'), dresser = byDef('dresser_01');
const boxes = [...R.entities.values()].filter((e) => e.defId === 'box_small_01').slice(0, 4);
if (fridge) park(fridge, T.x - 0.35, I.minY + 0.90, I.maxZ - 0.55);
if (dresser) park(dresser, T.x + 0.55, I.minY + 0.45, I.maxZ - 0.55, Math.PI / 2);
boxes.forEach((b, k) => park(b, T.x - 0.45 + (k % 2) * 0.75, I.minY + 0.20 + Math.floor(k / 2) * 0.42,
                             I.minZ + 1.15 + Math.floor(k / 2) * 0.05));
M.physics.primeQueries();
step(180);

const mover = movers[0];
const ft = fridge.body.translation();

const lookAt = (m, from, target) => {
  m.controller.hardSetPosition({ x: from.x, y: from.y, z: from.z });
  m.controller._vel.x = 0; m.controller._vel.z = 0; m.controller.velocityY = 0;
  const p = m.controller.position;
  M.rig.yaw = Math.atan2(-(target.x - p.x), -(target.z - p.z));
  M.rig.pitch = Math.atan2(target.y - (p.y + 1.4), Math.hypot(target.x - p.x, target.z - p.z));
  for (let i = 0; i < 20; i++) M.rig.update(p, 1 / 60);
  const c = M.camera.position;
  M.rig.yaw = Math.atan2(-(target.x - c.x), -(target.z - c.z));
  M.rig.pitch = Math.atan2(target.y - c.y, Math.hypot(target.x - c.x, target.z - c.z));
  m.grips.syncAim();
  M.physics.primeQueries();
};

/* Two straps over the fridge, placed exactly as a player places them (§10.3): look at an
 * anchor and press E, walk to the cargo and press E again. The mid anchors are chosen
 * because the fridge is at the front, so the sightline to them is clear both ways. */
const mid = ANCHORS.filter((a) => Math.abs(a.z - (I.minZ + I.maxZ) / 2) < 0.4);
for (const a of mid) {
  lookAt(mover, { x: a.x + (a.side === 'L' ? 0.8 : -0.8), y: I.minY + 0.1, z: a.z }, a);
  interact.act(mover);
  lookAt(mover, { x: ft.x, y: I.minY + 0.1, z: ft.z - 1.3 }, { x: ft.x, y: ft.y + 0.3, z: ft.z });
  interact.act(mover);
  step(10);
}
// Ratchet clicks, so the lines render tensioned rather than sagging.
for (let k = 0; k < 4; k++) { interact.act(mover); step(8); }

/* THE FRAME: the interaction verb itself, on the driveway, with the loaded truck behind.
 *
 * Not shot from inside the cargo box. The camera is §4.1's THIRD-person rig, so inside a
 * 4.2 x 2.1 x 2.0 m box the boom either sits out on the driveway (nothing behind the open
 * rear door to compress against) or, clamped to distanceMin 1.6, puts the mover's body
 * squarely over the cargo. Neither shows what this phase actually added. Outdoors, at the
 * default 4 m, the couch-and-dolly moment reads clearly and the strapped truck still fills
 * the background.
 */
const couch = byDef('couch_3seat_01');
const dolly = [...M.tools.tools.values()].find((t) => t.defId === 'dolly_flat_01');
park(couch, T.x - 0.15, 0.45, I.minZ - 2.7, Math.PI / 2);
dolly.body.setTranslation({ x: T.x + 1.15, y: 0.12, z: I.minZ - 2.2 }, true);
M.physics.primeQueries();
step(90);

// Pick the dolly up the way a player does: look at it, press E.
const dp = dolly.body.translation();
lookAt(mover, { x: dp.x + 0.15, y: 0.05, z: dp.z - 1.0 }, { x: dp.x, y: dp.y, z: dp.z });
interact.act(mover);
step(20);

// Then stand at the couch and look at it, so the prompt offers the tool (§9.2, §11.2).
// Aim at the couch's TOP rather than its centre: aiming down at the base pitched the rig
// so steeply that the truck left the top of the frame. The probe still lands on the couch.
const cp = couch.body.translation();
lookAt(mover, { x: cp.x + 0.55, y: 0.05, z: cp.z - 1.35 }, { x: cp.x, y: cp.y + 0.42, z: cp.z });
// The second mover stands off to the side, out of the sightline (§6.4 — there are two of
// them and the shot should say so, but not by having one block the couch).
if (movers[1]) {
  movers[1].controller.hardSetPosition({ x: cp.x - 1.9, y: 0.05, z: cp.z + 0.5 });
  movers[1].grips.aimYaw = -Math.PI / 2;
}
step(6);

M.game.state.elapsedWorkMs = 9.4 * 60000;

for (const m of movers) {
  const sp = M.game.state.players[m.id];
  if (sp) sp.position = { ...m.controller.position };
  m.body.update(m.controller.position, m.yaw, 0, 1 / 60);
}
// The other mover is left where they spawned, outside — a second body standing in the box
// blocks the shot, and the first version of this script parked them squarely in frame.
R.syncMeshes();
M.tools.syncMeshes();
M.strapLines.update(0.016);

/* The HUD, fed exactly as main.js's render loop feeds it. */
M.hud.update(mover.grips.status());
M.hud.setPrompt(interact.describe(mover));
const summary = M.manifestSummary(M.game.state.manifest);
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
M.hud.notice('dresser loaded', 'good');
M.hud.notice('strap tensioned', 'info');
M.overlay.el.hidden = true;
// The title card is up on a fresh boot; dismiss it as a player would.
if (M.title) { M.title.start(); M.title.el.hidden = true; }

M.syncSize();
M.renderer.render(M.world.scene, M.camera);
