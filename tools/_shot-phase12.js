/* Poses the Phase 12 build for docs/phase12-coop.png: two people, one couch, two viewports.
 *
 * The frame is §6.4's whole argument — "opposite-end grips naturally stabilise long
 * objects" — with a player at each end for the first time. Both halves are the shipping
 * build's: its cameras, its split layout, its HUDs.
 *
 * The HUD setters and renderSeats are called directly rather than waiting for the render
 * loop, because headless Chrome in --dump-dom mode delivers only 1-3 rAF callbacks
 * (MEASURED — Dev\INDEX.md). They are the same calls main.js's loop makes.
 */
import { layoutFor, applyAspect, renderSeats } from '../src/render/coopView.js';

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
const I = M.cargoInterior, T = M.truckPose;

/* Seat the second player FIRST: setSeats shortens both booms for a half-width viewport, and
 * posing the cameras before that would frame the shot for a boom length it never uses. */
M.setSeats(2);

// The couch out on the driveway, long axis across X, between the house and the truck.
const couch = byDef('couch_3seat_01');
const cx = T.x - 0.1, cz = I.minZ - 3.4;
couch.body.setTranslation({ x: cx, y: 0.45, z: cz }, true);
couch.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
couch.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
couch.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
couch.body.wakeUp();
M.physics.primeQueries();
step(70);

const cp = couch.body.translation();

/** Aim a mover's OWN rig at a point — the per-mover rig is the whole reason co-op works,
 *  and aiming the wrong one is the fixture error that broke m4 and m5 (see those files). */
const lookAt = (m, from, target) => {
  m.controller.hardSetPosition({ x: from.x, y: from.y, z: from.z });
  m.controller._vel.x = 0; m.controller._vel.z = 0; m.controller.velocityY = 0;
  const p = m.controller.position;
  m.rig.yaw = Math.atan2(-(target.x - p.x), -(target.z - p.z));
  m.rig.pitch = Math.atan2(target.y - (p.y + 1.4), Math.hypot(target.x - p.x, target.z - p.z));
  for (let i = 0; i < 24; i++) m.rig.update(p, 1 / 60);
  const c = m.camera.position;
  m.rig.yaw = Math.atan2(-(target.x - c.x), -(target.z - c.z));
  m.rig.pitch = Math.atan2(target.y - c.y, Math.hypot(target.x - c.x, target.z - c.z));
  m.grips.syncAim();
  M.physics.primeQueries();
};

/* One player at each END — §6.4's own worked example. The stand-off geometry is m4-tests.js
 * section B's, which is the arrangement that provably gets two grips on one couch: stand
 * 1.2 m off the long side, and aim at the NEAR EDGE (0.35 m in) rather than at the centre.
 * The first version of this script aimed at the couch's middle from 1.05 m and grabbed in
 * the same breath as it placed the movers; both hands closed on nothing, and the shot showed
 * two people standing politely beside a couch. */
const ends = [
  { m: movers[0], at: { x: cp.x - 0.9, z: cp.z - 1.2 }, grab: { x: cp.x - 0.8, y: 0.62, z: cp.z - 0.35 } },
  { m: movers[1], at: { x: cp.x + 0.9, z: cp.z - 1.2 }, grab: { x: cp.x + 0.8, y: 0.62, z: cp.z - 0.35 } },
];
// Place first, settle, THEN grab. A grab in the same step as a hardSetPosition is a grab
// against a body that has not yet resolved where it is standing.
for (const e of ends) {
  e.m.controller.hardSetPosition({ x: e.at.x, y: 0.2, z: e.at.z });
  e.m.controller._vel.x = 0; e.m.controller._vel.z = 0; e.m.controller.velocityY = 0;
}
M.physics.primeQueries();
step(30);

const got = [];
for (const e of ends) {
  lookAt(e.m, { x: e.at.x, y: 0.05, z: e.at.z }, e.grab);
  got.push(!!e.m.grips.tryGrab('right', e.m.id, 0));
  e.m.grips.tryGrab('left', e.m.id, 0);
}
// Say so in the DOM, so a shot with no grips cannot be mistaken for a shot of a lift.
document.title = `MFH coop grips: ${got.join(',')}`;
step(24);

/* Lift. The hand offset is decomposed onto the AIM BASIS rather than added to holdLocal.u —
 * a mover looking down at a couch has a tilted up-axis, so nudging u lifts less than the
 * arithmetic says and shoves the hand forward. Same correction as m4-tests.js `raiseHand`,
 * which is where this came from. */
for (const e of ends) {
  for (const hand of ['left', 'right']) {
    const g = e.m.grips.grips[hand];
    if (!g) continue;
    const f = e.m.grips.aim();
    const h = 0.26;
    g.holdLocal.d += f.dir.y * h;
    g.holdLocal.r += f.right.y * h;
    g.holdLocal.u += f.up.y * h;
  }
}
step(46);

// Re-frame after the lift so both cameras hold the couch and each other in shot.
const lifted = couch.body.translation();
lookAt(movers[0], { x: lifted.x - 1.02, y: 0.05, z: lifted.z - 1.15 },
       { x: lifted.x + 0.35, y: lifted.y + 0.05, z: lifted.z + 0.1 });
lookAt(movers[1], { x: lifted.x + 1.02, y: 0.05, z: lifted.z - 1.15 },
       { x: lifted.x - 0.35, y: lifted.y + 0.05, z: lifted.z + 0.1 });
step(6);

M.game.state.elapsedWorkMs = 6.2 * 60000;

for (const m of movers) {
  const sp = M.game.state.players[m.id];
  if (sp) { sp.position = { ...m.controller.position }; sp.yaw = m.grips.aimYaw; }
  m.body.update(m.controller.position, m.grips.aimYaw, 0, 1 / 60);
}
R.syncMeshes();
M.tools.syncMeshes();
M.strapLines.update(0.016);

/* Both HUDs, fed exactly as main.js's render loop feeds them. */
M.syncSize();
const canvas = document.getElementById('stage');
const rects = layoutFor(2, canvas.clientWidth, canvas.clientHeight);
const summary = M.manifestSummary(M.game.state.manifest);
const panel = {
  phase: M.game.state.phase,
  delivered: summary.delivered,
  total: summary.total,
  loaded: cargo.loadedEntities().length,
  roomCorrect: summary.roomCorrect,
  elapsedMin: M.game.state.elapsedWorkMs / 60000,
  estimateMin: M.game.state.estimateMs / 60000,
};
for (let s = 0; s < 2; s++) {
  const me = M.moverOfSeat(s);
  const h = M.huds[s];
  applyAspect(me.camera, rects[s]);
  h.setRect(rects[s]);
  h.setSeatTag(`P${s + 1} · ${me.id}`);
  h.update(me.grips.status());
  h.setPrompt(interact.describe(me));
  h.setContract(panel);
  h.setCargo(cargo.packQuality());
}
M.huds[0].notice('two hands on the couch', 'good');
M.huds[1].notice('braced', 'info');
M.divider.update(rects);
M.overlay.el.hidden = true;
// The title card is up on a fresh boot; dismiss it as a player would.
if (M.title) { M.title.start(); M.title.el.hidden = true; }

renderSeats(M.renderer, M.world.scene, [M.moverOfSeat(0), M.moverOfSeat(1)], rects);
