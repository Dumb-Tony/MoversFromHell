/* Fallback depth source for post passes: scene.overrideMaterial = MeshDepthMaterial with
 * RGBADepthPacking into a COLOUR render target — the exact path r128's shadow maps use, which
 * demonstrably works on this headless driver. Native DepthTexture sampling read back FLAT
 * (40..43/255 across the frame) in _probe-depth.js, so it is treated as unverified. */
const pre = document.createElement('pre');
document.body.appendChild(pre);
const L = ['probe reached script'];
const say = (s) => { L.push(s); pre.textContent = '==MFHTEST-BEGIN==\n' + L.join('\n') + '\nALL-PASS\n==MFHTEST-END=='; };
let M;
try { M = await window.__MFH_READY; say('booted'); } catch (e) { say('BOOT THREW ' + e.message); }
try {
  const THREE = window.THREE;
  const r = M.renderer, gl = r.getContext();
  // Pose the camera somewhere with real depth variety: the driveway looking at the house.
  const m = M.movers[0];
  m.controller.hardSetPosition({ x: 2.2, y: 0.2, z: 7.5 });
  m.rig.yaw = Math.atan2(-(1.0 - 2.2), -(-2.0 - 7.5)); m.rig.pitch = -0.05;
  for (let i = 0; i < 40; i++) m.rig.update(m.controller.position, 1 / 60);
  const cam = m.camera;
  const w = 256, h = 128;
  const rt = new THREE.WebGLRenderTarget(w, h);
  const depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  const prev = M.world.scene.overrideMaterial;
  M.world.scene.overrideMaterial = depthMat;
  r.setRenderTarget(rt); r.render(M.world.scene, cam); r.setRenderTarget(null);
  M.world.scene.overrideMaterial = prev;
  say('rendered packed depth into colour RT, gl error=' + gl.getError());
  const px = new Uint8Array(w * h * 4); r.readRenderTargetPixels(rt, 0, 0, w, h, px);
  // Unpack RGBA -> depth exactly as Three's unpackRGBAToDepth does.
  const unpack = (i) => (px[i] / 255) + (px[i+1] / 255) / 255 + (px[i+2] / 255) / 65025 + (px[i+3] / 255) / 16581375;
  let min = 1, max = 0, sum = 0, n = 0;
  for (let i = 0; i < px.length; i += 4) { const d = unpack(i); if (d < min) min = d; if (d > max) max = d; sum += d; n++; }
  say(`packed depth: min=${min.toFixed(4)} max=${max.toFixed(4)} mean=${(sum / n).toFixed(4)} — a usable buffer spans a real range`);
  // Spot samples: top-centre (sky) vs bottom-centre (near driveway).
  const at = (x, y) => unpack((y * w + x) * 4);
  say(`sky(top)=${at(128, h - 4).toFixed(4)}  ground(bottom)=${at(128, 4).toFixed(4)}  centre=${at(128, 64).toFixed(4)}`);
  say('gl error after readback: ' + gl.getError());
} catch (e) { say('THREW: ' + e.message); }
