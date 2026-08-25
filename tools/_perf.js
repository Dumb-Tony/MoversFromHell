/* Render-cost probe. Reports draw calls, triangles and CPU render time so a lighting change
 * can be judged with numbers rather than by eye (§25.3, §26.6's 45 FPS floor).
 *
 * ⚠ renderer.render() RETURNS BEFORE THE GPU HAS DONE ANYTHING. Timing it alone reported
 * 0.00 ms for a scene with ten shadow maps in it, which is not a fast scene — it is a
 * measurement of how long it takes to queue commands. gl.finish() blocks until the queue is
 * drained, which is what turns this into a number worth trading against. */
const M = await window.__MFH_READY;
const m = M.movers[0];
const L = [];

const sample = (label, cam) => {
  M.renderer.info.reset();
  M.renderer.render(M.world.scene, cam);
  const i = M.renderer.info;
  const calls = i.render.calls, tris = i.render.triangles;
  const gl = M.renderer.getContext();
  M.renderer.render(M.world.scene, cam); gl.finish();      // warm the pipeline first
  const N = 40;
  const t0 = performance.now();
  for (let k = 0; k < N; k++) { M.renderer.render(M.world.scene, cam); gl.finish(); }
  const ms = (performance.now() - t0) / N;
  L.push(`${label.padEnd(12)} calls=${String(calls).padStart(4)} tris=${String(tris).padStart(6)} cpu=${ms.toFixed(2)}ms`);
};

// Outdoors, on the driveway looking at the house.
m.controller.hardSetPosition({ x: 2.2, y: 0.2, z: 7.5 });
m.rig.yaw = Math.atan2(-(1.0 - 2.2), -(-2.0 - 7.5)); m.rig.pitch = -0.05;
for (let i = 0; i < 40; i++) m.rig.update(m.controller.position, 1 / 60);
M.syncSize();
sample('outdoor', m.camera);

// Indoors, in the living room.
m.controller.hardSetPosition({ x: 1.6, y: 0.2, z: -3.2 });
m.rig.yaw = Math.atan2(-(-2.2 - 1.6), -(-7.4 + 3.2)); m.rig.pitch = -0.05;
m.rig.setDistance(2.6);
for (let i = 0; i < 40; i++) m.rig.update(m.controller.position, 1 / 60);
sample('indoor', m.camera);

let meshes = 0, lights = 0;
M.world.scene.traverse((o) => { if (o.isMesh) meshes++; if (o.isLight) lights++; });
L.push(`scene       meshes=${meshes} lights=${lights} programs=${M.renderer.info.programs.length}`);
let casting = 0;
M.world.scene.traverse((o) => { if (o.isLight && o.castShadow) casting++; });
L.push(`shadowmaps  ${casting} casting`);

// The same frames with every room light's shadow switched off, to price them.
for (const sp of M.world.roomLights || []) sp.castShadow = false;
sample('indoor-nosh', m.camera);
for (const sp of M.world.roomLights || []) sp.castShadow = true;

const pre = document.createElement('pre');
pre.textContent = '==MFHTEST-BEGIN==\n' + L.join('\n') + '\nALL-PASS\n==MFHTEST-END==';
document.body.appendChild(pre);
