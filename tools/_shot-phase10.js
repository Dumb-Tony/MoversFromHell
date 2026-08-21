/* Poses the Phase 10 build for docs/phase10-invoice.png: a real §15.1 invoice over the
 * delivered destination.
 *
 * THE PANEL IS DRAWN BY THIS SCRIPT, not by the game. §21.2's contract UX is Phase 11 work
 * and the build has no invoice screen — but every number below comes from buildInvoice()
 * running on the real ledger, so the CONTENT is the shipping build's and only the rendering
 * is the screenshot's. Recorded in KNOWN_ISSUES so nobody mistakes it for a feature.
 */
const M = await window.__MFH_READY;
const R = M.registry, movers = M.movers;
const STEP = 1000 / 60;
const rows = M.game.state.manifest;

const step = (n) => {
  for (let i = 0; i < n; i++) {
    M.physics.clearForces();
    M.straps.step(STEP, i * STEP);
    for (const m of movers) {
      m.grips.step(STEP, { brace: false, simTimeMs: i * STEP });
      m.controller.step(STEP, {
        move: { x: 0, y: 0 }, forward: { x: 0, y: 0, z: -1 }, right: { x: 1, y: 0, z: 0 },
        run: false, brace: false, jump: false, recover: false,
      });
    }
    M.physics.step();
    R.step(STEP);
    M.cargo.step(STEP, i * STEP);
    M.damage.step(STEP, i * STEP);
    M.stepManifest(rows, R, STEP);   // the game runs this as its 'contract' system
  }
};

const Z = M.destZones, S = M.destShell;
const slotIn = (zoneId, index) => {
  const z = Z.find((r) => r.id === zoneId);
  const cols = 4;
  const w = (z.maxX - z.minX) - 1.2, d = (z.maxZ - z.minZ) - 1.2;
  return {
    x: z.minX + 0.6 + ((index % cols) + 0.5) * (w / cols),
    z: z.minZ + 0.6 + (Math.floor(index / cols) + 0.5) * (d / 2),
  };
};

// Deliver the manifest, then break one expensive thing on the way in — which is the invoice
// worth photographing.
M.damage.reset();
const perRoom = {};
for (const row of rows) {
  const e = R.get(row.entityId);
  if (!e) continue;
  perRoom[row.toZone] = (perRoom[row.toZone] || 0) + 1;
  const s = slotIn(row.toZone, perRoom[row.toZone] - 1);
  e.body.setTranslation({ x: s.x, y: e.def.dimensions.y / 2 + 0.06, z: s.z }, true);
  e.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  e.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  e.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  e.body.wakeUp();
}
M.physics.primeQueries();
step(240);
M.damage.reset();

const tv = [...R.entities.values()].find((e) => e.defId === 'tv_55_01');
if (tv) {
  tv.state.condition = 100;
  tv.body.setTranslation({ x: S.minX + 1.6, y: 1.5, z: S.minZ + 1.2 }, true);
  tv.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  tv.body.wakeUp();
  step(140);
}
M.damage.flush();

M.game.state.elapsedWorkMs = 19.5 * 60000;   // a little over the 18-minute estimate
M.game.state.tripCount = 1;
const summary = M.manifestSummary(rows);
const invoice = M.buildInvoice(M.game.state, summary, { recoveries: 1, collisions: 0 });
const review = M.reviewFor(invoice, M.game.state, summary, { recoveries: 1 });

// Camera: the delivered destination, from the doorway.
movers[0].controller.hardSetPosition({ x: (S.minX + S.maxX) / 2 - 0.4, y: 0.1, z: S.maxZ + 1.6 });
if (movers[1]) movers[1].controller.hardSetPosition({ x: (S.minX + S.maxX) / 2 + 1.2, y: 0.1, z: S.maxZ + 2.1 });
for (const m of movers) { m.controller._vel.x = 0; m.controller._vel.z = 0; m.controller.velocityY = 0; }
step(25);

M.world.scene.traverse((o) => {
  if (o.isMesh && o.geometry && o.geometry.parameters) {
    const p = o.geometry.parameters;
    if (p.height && Math.abs(p.height - 0.16) < 1e-6 && p.width >= 8.9 && p.depth >= 5.9) o.visible = false;
  }
});
M.rig.colliders = M.world.colliders.filter((c) => c.tag !== 'destCeiling' && c.tag !== 'roomCeiling');
M.rig.yaw = 0;
M.rig.pitch = -0.92;
M.rig.setDistance(13.0);
M.rig._currentDistance = 13.0;
for (let i = 0; i < 60; i++) {
  M.rig.update({ x: (S.minX + S.maxX) / 2, y: 0.1, z: (S.minZ + S.maxZ) / 2 + 0.6 }, 1 / 60);
}

for (const m of movers) {
  const sp = M.game.state.players[m.id];
  sp.position = { ...m.controller.position };
  m.body.update(m.controller.position, m.yaw, 0, 1 / 60);
}
R.syncMeshes();
M.tools.syncMeshes();
M.overlay.el.hidden = true;

// ---- the invoice panel ---------------------------------------------------------------
const money = (n) => (n < 0 ? '-' : '') + Math.abs(n).toFixed(2);
const rowsHtml = invoice.lines.map((l) => `
  <div style="display:flex;justify-content:space-between;gap:24px;padding:3px 0;
              ${l.amount < 0 ? 'color:#e8a0a0' : 'color:#bfe3b0'}">
    <span>${l.kind}<span style="opacity:.55;font-size:11px"> — ${l.detail}</span></span>
    <span style="font-variant-numeric:tabular-nums">${money(l.amount)}</span>
  </div>`).join('');

const panel = document.createElement('div');
panel.style.cssText =
  'position:fixed;top:38px;right:38px;width:470px;z-index:99998;' +
  'background:rgba(10,13,18,.93);border:1px solid #2c3542;border-radius:8px;padding:18px 20px;' +
  'font:13px ui-monospace,Consolas,monospace;color:#dbe6f0;box-shadow:0 8px 30px rgba(0,0,0,.5)';
panel.innerHTML =
  `<div style="font-size:15px;letter-spacing:.06em;color:#a8d93a;margin-bottom:2px">INVOICE</div>` +
  `<div style="opacity:.55;font-size:11px;margin-bottom:12px">` +
  `suburban_starter &nbsp;·&nbsp; ${summary.delivered}/${summary.total} delivered &nbsp;·&nbsp; ` +
  `${summary.roomCorrect} in the right room</div>` +
  rowsHtml +
  `<div style="border-top:1px solid #2c3542;margin-top:10px;padding-top:9px;` +
  `display:flex;justify-content:space-between;font-size:16px">` +
  `<span>PROFIT</span><span style="font-variant-numeric:tabular-nums;` +
  `color:${invoice.profit < 0 ? '#ff8080' : '#a8d93a'}">${money(invoice.profit)}</span></div>` +
  `<div style="display:flex;justify-content:space-between;margin-top:6px;opacity:.8">` +
  `<span>grade</span><span>${invoice.grade.letter} &nbsp;(${invoice.grade.score})</span></div>` +
  `<div style="margin-top:12px;padding-top:10px;border-top:1px solid #2c3542;` +
  `font-style:italic;opacity:.85;line-height:1.45">“${review.text}”</div>` +
  `<div style="opacity:.45;font-size:11px;margin-top:6px">${review.tags.join(' · ')}</div>`;
document.getElementById('ui').appendChild(panel);

M.syncSize();
M.renderer.render(M.world.scene, M.camera);
