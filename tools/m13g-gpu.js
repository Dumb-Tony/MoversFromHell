/* Phase 15 GPU-only suite — the half of section G the gate cannot see.
 *
 * tools\smoketest.ps1 runs every suite on SwiftShader, where detectRenderTier() returns
 * 'software' and the tier constructs NOTHING expensive — no post chain, no blobs, no VSM,
 * no bump/normal/env, no rim. That is what keeps a 4 s suite from taking 600 s (measured,
 * Phase 13), and it also means the gate proves the good path only by its absence.
 *
 * This file proves it by its presence. Run it through tools\probe.ps1, which loads the page
 * at ?tier=gpu with a 12 s virtual-time budget, one frame at a time:
 *
 *   powershell -File tools\probe.ps1 -Setup tools\m13g-gpu.js
 *   powershell -File tools\probe.ps1 -Setup tools\m13g-gpu.js -Query "shadows=pcf"
 *
 * It is NOT in the 14-suite gate and must never be added to it: on the headless driver a
 * single VSM'd shadow pass is the difference between seconds and minutes.
 *
 * What it asserts (numbers, not vibes):
 *   H1-H4   the post chain exists, is four passes at quarter/half resolution, and allocates
 *           nothing after warm-up
 *   H5      VSM (or PCF under ?shadows=pcf) is the live shadow type
 *   H6-H7   the shared rim patch found its anchor in every classed material (a silent miss
 *           renders fine and rims nothing)
 *   H8-H9   contact blobs exist and sit ON the floor, not in it
 *   H10     heights are minted on this tier, linear, and memoised
 *   H11-H14 the composited frame: not black, not blown, sky not blooming
 *   H15-H17 co-op: both halves composited, divider gap the configured colour
 *   H18-H19 program and draw-call budgets on the good path
 */

import { RENDER } from '../src/config.js';
import { texGrass, heightFor } from '../src/render/textures.js';

const lines = [];
let passes = 0, fails = 0;
function ok(name, cond, detail = '') {
  if (cond) { passes++; lines.push(`PASS  ${name}`); }
  else { fails++; lines.push(`FAIL  ${name}${detail ? '  <- ' + detail : ''}`); }
}
const eq = (n, a, b) => ok(n, a === b, `got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

let _pre = null;
function emit(status) {
  if (!_pre) {
    _pre = document.createElement('pre');
    _pre.id = 'test-out';
    _pre.style.cssText = 'position:fixed;inset:0;z-index:99999;overflow:auto;background:#06080c;' +
      'color:#cfe;font:11px ui-monospace,Consolas,monospace;padding:12px;white-space:pre';
    document.body.appendChild(_pre);
  }
  const tail = status || (fails === 0 ? `ALL-PASS  ${passes} assertions` : `FAILURES  ${fails} of ${passes + fails}`);
  _pre.textContent = '==MFHTEST-BEGIN==\n' + lines.join('\n') + '\n\n' + tail + '\n==MFHTEST-END==';
}

emit('booting...');
let M;
try { M = await window.__MFH_READY; }
catch (e) {
  fails++; lines.push(`FAIL  boot threw  <- ${e && e.message}`);
  lines.push((e && e.stack || '').split('\n').slice(0, 6).join('\n'));
  emit(); throw e;
}

const { world, renderer } = M;
const THREE = window.THREE;
const q = new URLSearchParams(location.search);

/* Frame pixels, straight off the drawing buffer. Valid only in the same task as the
 * present() that drew them — the buffer is cleared at the next composite. */
function readFrame() {
  const gl = renderer.getContext();
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const buf = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  return { w, h, buf };
}
const lum = (buf, i) => (0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2]) / 255;
function stats(f, x0, x1, y0, y1) {
  let n = 0, sum = 0, max = 0, bright = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const L = lum(f.buf, (y * f.w + x) * 4);
    n++; sum += L; if (L > max) max = L; if (L > RENDER.post.bloom.threshold) bright++;
  }
  return { mean: sum / n, max, brightFrac: bright / n, n };
}

/* Stage the frame the way the look shots do: a mover in front of the house, HUD hidden. */
M.title && M.title.start();
if (M.title) M.title.el.hidden = true;
M.overlay.el.hidden = true;
for (const h of M.huds) h.el.hidden = true;
const help = document.getElementById('help'); if (help) help.hidden = true;
M.syncSize();
M.setSeats(1);
// The loop syncs meshes before every render; a suite that presents directly must too.
M.registry.syncMeshes(); M.tools.syncMeshes();

lines.push('--- H. the good path, on a GPU tier ---');
eq('H0 the page is on the gpu tier', M.renderTier, 'gpu');

// H1-H4 — the post chain. The chain allocates on its first capture, so info() is read
// after one present(); before it the sizes are honestly 0x0.
ok('H1 a post chain exists', !!M.post, String(M.post));
M.present();
const info = M.post ? M.post.info() : null;
const passCount = info ? (Array.isArray(info.passes) ? info.passes.length : info.passes) : null;
eq('H2 …of four passes', passCount, 4);
ok('H2a …enabled and unbroken', !!info && info.enabled === true, JSON.stringify(info));
if (info && info.quarter && info.full) {
  ok('H3 the bloom targets are at most half resolution', info.quarter[0] <= info.full[0] / 2 + 1 && info.quarter[1] <= info.full[1] / 2 + 1,
     `quarter ${info.quarter.join('x')} of full ${info.full.join('x')}`);
  const W = renderer.getContext().drawingBufferWidth, H = renderer.getContext().drawingBufferHeight;
  eq('H3a …and the full-res capture matches the drawing buffer', info.full.join('x'), `${W}x${H}`);
} else ok('H3 post.info() reports its target sizes', false, JSON.stringify(info));
M.present(); M.present();
const texA = renderer.info.memory.textures;
M.present();
eq('H4 a warm present() allocates no textures', renderer.info.memory.textures, texA);

// H5 — shadow type follows the query / config.
const wantPCF = q.get('shadows') === 'pcf' || RENDER.look.shadows !== 'vsm';
eq('H5 the live shadow type is ' + (wantPCF ? 'PCFSoft' : 'VSM'), renderer.shadowMap.type,
   wantPCF ? THREE.PCFSoftShadowMap : THREE.VSMShadowMap);
eq('H5a …scheduled manually', renderer.shadowMap.autoUpdate, false);

// H6-H7 — rim anchor. rimPatch sets userData.rimAnchorFound on every material it patches;
// false means onBeforeCompile ran but the chunk it splices after was not in the shader.
let classed = 0, anchored = 0, missed = [];
world.scene.traverse((o) => {
  if (!o.isMesh) return;
  for (const mt of (Array.isArray(o.material) ? o.material : [o.material])) {
    if (!mt || !mt.userData || !mt.userData.kind) continue;
    classed++;
    if (mt.userData.rimAnchorFound === true) anchored++;
    else if (mt.userData.rimAnchorFound === false) missed.push(mt.userData.kind);
  }
});
ok('H6 classed materials exist in the scene', classed > 0, String(classed));
ok('H7 the rim patch found its anchor in every compiled classed material', missed.length === 0,
   `${anchored} anchored, missed: ${[...new Set(missed)].join(', ')}`);

// H8-H9 — contact blobs.
ok('H8 contact blobs exist', !!M.blobs && M.blobs.count() > 0, M.blobs ? String(M.blobs.count()) : 'null');
if (M.blobs && Array.isArray(M.blobs.pool)) {
  /* A blob sits on whatever the ray found: the ground for most objects, a table top or the
   * truck deck for a box resting on one (measured: one at 0.517 m, a box on a 0.5 m surface).
   * So the claims are: never below ground, never above any surface an object can rest on,
   * and most of them on the floor band — not "all at ground level". */
  const below = [], high = []; let floor = 0, vis = 0;
  for (const b of M.blobs.pool) {
    if (!b.visible) continue;
    vis++;
    const y = b.getWorldPosition(new THREE.Vector3()).y;
    if (y < 0.002) below.push(y.toFixed(3));
    else if (y > 2.5) high.push(y.toFixed(3));
    else if (y <= 0.06) floor++;
  }
  ok('H9 no blob is below ground', below.length === 0, below.slice(0, 5).join(', '));
  ok('H9a no blob floats above any resting surface', high.length === 0, high.slice(0, 5).join(', '));
  ok('H9b most blobs are on the floor band (2-60 mm)', vis > 0 && floor / vis >= 0.6, `${floor} of ${vis} on the floor`);
  lines.push(`      (${vis} blobs visible, ${floor} on the floor, ${vis - floor} on a table, deck or stack)`);
} else ok('H9 blobs expose their meshes for placement checks', false);

// H10 — heights on this tier.
const h1 = heightFor(texGrass()), h2 = heightFor(texGrass());
ok('H10 a height texture is minted for grass on the gpu tier', !!h1);
ok('H10a …linear, not sRGB', h1 && h1.encoding === THREE.LinearEncoding);
ok('H10b …and memoised', h1 === h2);

// H11-H14 — the composited frame.
M.present();
const f = readFrame();
const all = stats(f, 0, f.w, 0, f.h);
ok('H11 the frame is not black', all.max > 0.5, `max ${all.max.toFixed(3)}`);
ok('H12 the frame is not blown out', all.mean < 0.80, `mean ${all.mean.toFixed(3)}`);
ok('H13 the frame is not crushed', all.mean > 0.18, `mean ${all.mean.toFixed(3)}`);
const skyBand = stats(f, 0, f.w, Math.floor(f.h * 0.86), f.h);   // GL rows: top of image
ok('H14 the sky does not bloom (tone-mapped under threshold)', skyBand.brightFrac < 0.15,
   `${(skyBand.brightFrac * 100).toFixed(1)}% of sky pixels over ${RENDER.post.bloom.threshold}`);
lines.push(`      (frame mean ${all.mean.toFixed(3)}, max ${all.max.toFixed(3)}, bright ${(all.brightFrac * 100).toFixed(2)}%)`);
/* The chain's own number: the fraction of quarter-res texels the bright pass lets through.
 * Bulbs, the odd specular highlight and nothing else — a sky or a white wall blooming
 * shows up here as tens of percent. */
const bf = M.post && M.post.brightFraction ? M.post.brightFraction() : null;
ok('H14a the bright pass passes only a few percent of the frame', bf !== null && bf < 0.08,
   bf === null ? 'null' : `${(bf * 100).toFixed(2)}%`);

// H15-H17 — co-op composite.
M.setSeats(2);
M.syncSize();
M.present();
const g = readFrame();
const mid = Math.floor(g.w / 2);
const L = stats(g, 0, mid - 6, 0, g.h), R = stats(g, mid + 6, g.w, 0, g.h);
ok('H15 the left seat is composited', L.max > 0.5 && L.mean > 0.1, `mean ${L.mean.toFixed(3)}`);
ok('H16 the right seat is composited', R.max > 0.5 && R.mean > 0.1, `mean ${R.mean.toFixed(3)}`);
{
  const want = new THREE.Color(RENDER.post.divider);
  const i = (Math.floor(g.h / 2) * g.w + mid) * 4;
  const d = Math.max(Math.abs(g.buf[i] / 255 - want.r), Math.abs(g.buf[i + 1] / 255 - want.g), Math.abs(g.buf[i + 2] / 255 - want.b));
  ok('H17 the divider gap is the configured colour', d < 12 / 255,
     `pixel ${g.buf[i]},${g.buf[i + 1]},${g.buf[i + 2]} vs ${want.getHexString()}`);
}
M.setSeats(1);
M.syncSize();

// H18-H19 — budgets on the good path.
/* Draw calls three ways. With autoReset on, the counters hold only the LAST render — the
 * composite quad — so the seat's own pass is read with post disabled for one frame. Then
 * autoReset off counts the whole frame: every shadow map, every seat, the four post quads. */
ok('H18 the program count stays bounded with every variant compiled', renderer.info.programs.length <= 40,
   `${renderer.info.programs.length} programs`);
M.post.setEnabled(false); M.present(); M.post.setEnabled(true);
const seatCalls = renderer.info.render.calls, seatTris = renderer.info.render.triangles;
ok('H19 one seat renders under 620 draw calls on the good path', seatCalls <= 620, `${seatCalls} calls`);
renderer.info.autoReset = false;
renderer.info.reset();
M.present();
const soloCalls = renderer.info.render.calls;
ok('H19a a whole solo frame (all shadow maps + seat + post) stays under 2500 draw calls', soloCalls <= 2500, `${soloCalls} calls`);
lines.push(`      (seat: ${seatCalls} calls / ${seatTris} tris; solo frame: ${soloCalls} calls; shadow+post ≈ ${soloCalls - seatCalls}; ${renderer.info.programs.length} programs)`);
M.setSeats(2); M.syncSize();
renderer.info.reset();
M.present();
const coopCalls = renderer.info.render.calls;
ok('H19b a whole co-op frame stays under 3200 draw calls', coopCalls <= 3200, `${coopCalls} calls`);
ok('H19c co-op renders the shadow maps once (co-op < solo frame + one seat)', coopCalls < soloCalls + seatCalls,
   `${coopCalls} vs ${soloCalls} + ${seatCalls}`);
lines.push(`      (co-op frame: ${coopCalls} calls)`);
M.setSeats(1); M.syncSize();
renderer.info.autoReset = true;

emit();
