/* Phase 15 look probe — numbers about the composited frame, for tuning post and exposure.
 *
 *   powershell -File tools\probe.ps1 -Setup tools\_probe-look.js
 *   powershell -File tools\probe.ps1 -Setup tools\_probe-look.js -Query "post=off"
 *
 * Prints, for the solo frame from the title-shot viewpoint: mean / p50 / p95 luminance, the
 * fraction of pixels over the bloom threshold, sky-band and ground-band means, the post
 * chain's pass list, program and draw-call counts. Run it with and without post and the
 * difference IS the post pass — bloom lifts p95, the grade lifts the shadows (lift) and
 * pulls the whites (gain), the vignette lowers the corner means.
 *
 * Two sanity assertions only, so the block never reads as the 0-assertion harness artefact.
 */

import { RENDER } from '../src/config.js';

const lines = [];
let passes = 0, fails = 0;
function ok(name, cond, detail = '') {
  if (cond) { passes++; lines.push(`PASS  ${name}`); }
  else { fails++; lines.push(`FAIL  ${name}${detail ? '  <- ' + detail : ''}`); }
}
let _pre = null;
function emit(status) {
  if (!_pre) {
    _pre = document.createElement('pre'); _pre.id = 'test-out';
    _pre.style.cssText = 'position:fixed;inset:0;z-index:99999;overflow:auto;background:#06080c;color:#cfe;font:11px ui-monospace,Consolas,monospace;padding:12px;white-space:pre';
    document.body.appendChild(_pre);
  }
  const tail = status || (fails === 0 ? `ALL-PASS  ${passes} assertions` : `FAILURES  ${fails} of ${passes + fails}`);
  _pre.textContent = '==MFHTEST-BEGIN==\n' + lines.join('\n') + '\n\n' + tail + '\n==MFHTEST-END==';
}
emit('booting...');
let M;
try { M = await window.__MFH_READY; } catch (e) { fails++; lines.push(`FAIL  boot threw  <- ${e && e.message}`); emit(); throw e; }

const m = M.movers[0];
m.controller.hardSetPosition({ x: 1.6, y: 0.2, z: 6.5 });
m.rig.yaw = 0; m.rig.pitch = -0.12; m.rig.setDistance(3.2);   // yaw 0 faces -z: the house
for (let i = 0; i < 45; i++) m.rig.update(m.controller.position, 1 / 60);
m.body.update(m.controller.position, m.rig.yaw, 0, 1 / 60);
M.registry.syncMeshes(); M.tools.syncMeshes();
M.overlay.el.hidden = true;
for (const h of M.huds) h.el.hidden = true;
const help = document.getElementById('help'); if (help) help.hidden = true;
if (M.title) { M.title.start(); M.title.el.hidden = true; }
M.syncSize();
M.setSeats(1);
M.present(); M.present();
M.renderer.info.reset();
M.present();

const gl = M.renderer.getContext();
const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
const buf = new Uint8Array(w * h * 4);
gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
const L = new Float32Array(w * h);
for (let i = 0, p = 0; i < L.length; i++, p += 4) L[i] = (0.2126 * buf[p] + 0.7152 * buf[p + 1] + 0.0722 * buf[p + 2]) / 255;
const band = (y0, y1, x0 = 0, x1 = w) => { let s = 0, n = 0, b = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const v = L[y * w + x]; s += v; n++; if (v > RENDER.post.bloom.threshold) b++; } return { mean: s / n, bright: b / n }; };
const sorted = Float32Array.from(L).sort();
const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
const all = band(0, h);
const sky = band(Math.floor(h * 0.86), h);
const ground = band(0, Math.floor(h * 0.18));
const corner = band(0, Math.floor(h * 0.12), 0, Math.floor(w * 0.12));
const centre = band(Math.floor(h * 0.44), Math.floor(h * 0.56), Math.floor(w * 0.44), Math.floor(w * 0.56));

lines.push(`tier ${M.renderTier}  post ${M.post ? 'on' : 'off'}  query "${location.search}"  buffer ${w}x${h}`);
lines.push(`luminance  mean ${all.mean.toFixed(4)}  p50 ${pct(0.5).toFixed(4)}  p95 ${pct(0.95).toFixed(4)}  p99 ${pct(0.99).toFixed(4)}  max ${sorted[sorted.length - 1].toFixed(4)}`);
lines.push(`bright     ${(all.bright * 100).toFixed(3)}% of pixels over threshold ${RENDER.post.bloom.threshold}`);
lines.push(`sky band   mean ${sky.mean.toFixed(4)}  bright ${(sky.bright * 100).toFixed(2)}%`);
lines.push(`ground     mean ${ground.mean.toFixed(4)}`);
lines.push(`corner     mean ${corner.mean.toFixed(4)}   centre mean ${centre.mean.toFixed(4)}   ratio ${(corner.mean / Math.max(1e-4, centre.mean)).toFixed(3)}`);
const info = M.renderer.info;
lines.push(`render     ${info.render.calls} calls  ${info.render.triangles} tris  ${info.programs.length} programs  ${info.memory.textures} textures  ${info.memory.geometries} geometries`);
if (M.post) lines.push(`post       ${JSON.stringify(M.post.info())}`);
if (M.post && M.post.brightFraction) { const bf = M.post.brightFraction(); lines.push(`bloom      bright pass lets through ${bf === null ? 'null' : (bf * 100).toFixed(3) + '%'} of quarter-res texels`); }
lines.push(`shadows    type ${M.renderer.shadowMap.type}  autoUpdate ${M.renderer.shadowMap.autoUpdate}  blobs ${M.blobs ? M.blobs.count() : 'null'}`);
lines.push(`exposure   ${M.renderer.toneMappingExposure}`);

ok('frame is not black', sorted[sorted.length - 1] > 0.5);
ok('frame has midtones', all.mean > 0.15 && all.mean < 0.85, all.mean.toFixed(3));
emit();
