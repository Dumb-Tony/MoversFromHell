/* Poses the Phase 6 build for docs/phase6-tools.png: the four tools on the driveway rack,
 * with the fridge up on the dolly beside them.
 *
 * The fridge is the shot. 110 kg, 518 N of resistance against a one-handed budget of about
 * 358 N: measured, one mover hauling for three seconds moves it 0.00 m bare and 1.49 m on
 * the dolly. A picture of it standing on the dolly is a picture of the only reason that
 * number changes. */
const M = await window.__MFH_READY;
const R = M.registry, movers = M.movers, tools = M.tools;

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

const byDef = (id) => { for (const e of R.entities.values()) if (e.defId === id) return e; return null; };
const toolByDef = (id) => { for (const t of tools.tools.values()) if (t.defId === id) return t; return null; };

const RACK = { x: -2.40, z: 9.00 };

// The fridge, brought out of the kitchen and stood on the dolly.
const fridge = byDef('fridge_01');
const dolly = toolByDef('dolly_flat_01');
if (fridge) {
  fridge.body.setTranslation({ x: RACK.x + 2.9, y: 1.75 / 2 + 0.16, z: RACK.z - 0.4 }, true);
  fridge.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  fridge.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  fridge.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  fridge.body.wakeUp();
  if (dolly) {
    dolly.body.setBodyType(M.physics.R.RigidBodyType.Fixed, true);
    dolly.body.setTranslation({ x: RACK.x + 2.9, y: 0.07, z: RACK.z - 0.4 }, true);
    tools.attachDolly(dolly, fridge);
  }
}

/* A loading deck for the ramp to lean on. A deployed ramp with nothing at the top of it
 * photographs as a plank lying in a field, which says nothing about what the tool is for.
 * Built here as mesh AND collider from the same numbers, the way the rest of the project
 * does it (§8.1) — it is a documentation prop, not level geometry. */
const DECK = { x: RACK.x + 5.4, z: RACK.z + 0.6, w: 2.6, d: 3.4, top: 1.20 };
{
  const THREE = window.THREE;
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(DECK.w, DECK.top, DECK.d),
    new THREE.MeshLambertMaterial({ color: 0x8a7f6d }));
  deck.position.set(DECK.x + DECK.w / 2, DECK.top / 2, DECK.z);
  deck.castShadow = true; deck.receiveShadow = true;
  M.world.scene.add(deck);
  M.physics.addStaticFromColliders([{
    minX: DECK.x, maxX: DECK.x + DECK.w,
    minZ: DECK.z - DECK.d / 2, maxZ: DECK.z + DECK.d / 2,
    base: 0, top: DECK.top, tag: 'shotDeck',
  }]);
  M.physics.primeQueries();
}

const ramp = toolByDef('ramp_01');
if (ramp) {
  const run = Math.sqrt(2.70 ** 2 - 1.20 ** 2);
  tools.deployRamp(ramp, { x: DECK.x, y: DECK.top, z: DECK.z }, { x: -1, z: 0 }, run);
}

// A blanket over the television, which is the other thing worth seeing.
const tv = byDef('tv_55_01');
const blanket = toolByDef('blanket_01');
if (tv && blanket) {
  tv.body.setTranslation({ x: RACK.x + 1.1, y: 0.40, z: RACK.z + 1.5 }, true);
  tv.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  blanket.body.setTranslation({ x: RACK.x + 1.1, y: 0.80, z: RACK.z + 1.5 }, true);
  blanket.body.setBodyType(M.physics.R.RigidBodyType.Fixed, true);
  tools.applyBlanket(blanket, tv);
}

// Two movers standing with the kit.
movers[0].controller.hardSetPosition({ x: RACK.x + 1.5, y: 0.1, z: RACK.z - 1.6 });
if (movers[1]) movers[1].controller.hardSetPosition({ x: RACK.x + 3.9, y: 0.1, z: RACK.z - 1.3 });
for (const m of movers) { m.controller._vel.x = 0; m.controller._vel.z = 0; m.controller.velocityY = 0; }
M.physics.primeQueries();
drive(45);

// Look along the driveway from the south, low enough that the fridge reads as tall.
M.rig.yaw = Math.PI;
M.rig.pitch = -0.16;
M.rig.setDistance(6.4);
M.rig._currentDistance = 6.4;
for (let i = 0; i < 60; i++) M.rig.update({ x: RACK.x + 2.6, y: 0.30, z: RACK.z + 0.2 }, 1 / 60);

for (const m of movers) {
  const sp = M.game.state.players[m.id];
  sp.position = { ...m.controller.position };
  m.body.update(m.controller.position, m.yaw, 0, 1 / 60);
}
R.syncMeshes();
tools.syncMeshes();
M.hud.update(movers[0].grips.status());
M.overlay.el.hidden = true;
M.syncSize();
M.renderer.render(M.world.scene, M.camera);
