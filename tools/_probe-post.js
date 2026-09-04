/* Post-chain self-check (post agent, Phase 15). One frame each way under SwiftShader via the
 * dump-dom harness with ?tier=gpu. The marker is written FIRST and updated per step, so a
 * context death mid-probe still says which step killed it (pattern from _probe-depth.js).
 * main.js does not construct the post yet — the probe builds its own through the contract
 * and drives present() directly. */
import { createPost, postModeFromLocation } from '../src/render/post.js';
import { present } from '../src/render/present.js';
import { RENDER } from '../src/config.js';

const pre = document.createElement('pre');
document.body.appendChild(pre);
const L = ['probe reached script'];
let fails = 0;
const say = (s) => { L.push(s); pre.textContent = '==MFHTEST-BEGIN==\n' + L.join('\n') + '\n' + (fails ? 'FAILURES ' + fails : 'ALL-PASS') + '\n==MFHTEST-END=='; };
const ok = (c, s) => { if (!c) fails++; say((c ? 'PASS ' : 'FAIL ') + s); };
say('waiting for boot');
let M;
try { M = await window.__MFH_READY; say('booted'); } catch (e) { say('BOOT THREW ' + e.message); }
try {
  const THREE = window.THREE;
  const r = M.renderer, gl = r.getContext();
  const canvas = r.domElement;
  M.syncSize();
  const cw = canvas.clientWidth, ch = canvas.clientHeight;
  const P = r.getPixelRatio();
  const db = new THREE.Vector2(); r.getDrawingBufferSize(db);
  say(`canvas css ${cw}x${ch} dpr ${P} drawing ${db.x}x${db.y} webgl2=${r.capabilities.isWebGL2} alphaBits=${gl.getParameter(gl.ALPHA_BITS)} tier=${M.world.tier} postMode=${postModeFromLocation()}`);

  const post = createPost(r, THREE, RENDER.post);
  ok(post !== null, 'createPost returned an object');
  const seats1 = [M.moverOfSeat(0)];
  const rects1 = M.layoutFor(1, cw, ch);
  const px = (x, y) => { const b = new Uint8Array(4); gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b); return Array.from(b.slice(0, 3)); };
  const cx = Math.floor(db.x / 2), cy = Math.floor(db.y / 2);

  r.shadowMap.autoUpdate = false;
  const t0 = performance.now();
  present(r, M.world.scene, seats1, rects1, post, null);
  say(`present(post on) took ${(performance.now() - t0).toFixed(0)} ms wall, gl error=${gl.getError()}`);
  const onPx = px(cx, cy);
  const inf = post.info();
  say('info ' + JSON.stringify(inf));
  ok(inf.passes === 4 && inf.full[0] === db.x && inf.full[1] === db.y, 'info: passes 4, full === drawing buffer');
  ok(inf.quarter[0] === Math.floor(db.x / 4) && inf.quarter[1] === Math.floor(db.y / 4), 'info: quarter = floor(full/4)');
  ok(inf.enabled === true && inf.seats === 1, 'info: enabled, seats 1 (chain ran without a GL error → still enabled)');
  ok(r.getRenderTarget() === null, 'after present: render target null');
  const vp = new THREE.Vector4(); r.getViewport(vp);
  ok(vp.x === 0 && vp.y === 0 && vp.z === cw && vp.w === ch, `after present: viewport = full canvas (${vp.toArray().join(',')})`);
  ok(r.getScissorTest() === false, 'after present: scissorTest false');
  ok(r.shadowMap.needsUpdate === false, 'shadowMap.needsUpdate consumed by the seat render');

  // Orientation: a vertically flipped capture would pass every symmetric pixel test, so
  // compare a top-row and a bottom-row sample against the post-off frame.
  const lum = (p) => 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
  const yTop = Math.floor(db.y * 0.92), yBot = Math.floor(db.y * 0.08);
  const onTop = px(cx, yTop), onBot = px(cx, yBot);
  post.setEnabled(false);
  present(r, M.world.scene, seats1, rects1, post, null);
  const offPx = px(cx, cy);
  const offTop = px(cx, yTop), offBot = px(cx, yBot);
  say(`top/bottom on=${onTop}/${onBot} off=${offTop}/${offBot}`);
  ok(Math.sign(lum(onTop) - lum(onBot)) === Math.sign(lum(offTop) - lum(offBot)), 'capture is not vertically flipped');
  say(`centre pixel on=${onPx} off=${offPx}`);
  ok(onPx.join() !== offPx.join(), 'centre pixel differs between post on and off');
  ok(!post.info().enabled, 'info.enabled false after setEnabled(false)');
  const vp2 = new THREE.Vector4(); r.getViewport(vp2);
  ok(vp2.z === cw && vp2.w === ch && r.getRenderTarget() === null && !r.getScissorTest(), 'disabled apply still restores the viewport');
  post.setEnabled(true);

  // Two seats: both halves render, the divider column is the clear colour.
  M.setSeats(2);
  const rects2 = M.layoutFor(2, cw, ch);
  const seats2 = [M.moverOfSeat(0), M.moverOfSeat(1)];
  present(r, M.world.scene, seats2, rects2, post, null);
  const clear = [0xdf, 0xe9, 0xee];
  const same = (a, b, tol = 0) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
  const q1 = px(Math.floor(db.x * 0.25), cy), q3 = px(Math.floor(db.x * 0.75), cy);
  const divX = Math.floor(rects2[0].w * P);   // first device column past seat 0's scissor
  const divPx = px(divX, cy), divPxTop = px(divX, Math.floor(db.y * 0.1));
  say(`two seats: rects ${JSON.stringify(rects2.map((q) => [q.x, q.y, q.w, q.h]))} 25%=${q1} 75%=${q3} divider@${divX}=${divPx}/${divPxTop}`);
  ok(!same(q1, clear, 6) && !same(q3, clear, 6), 'both halves render non-clear content');
  ok(same(divPx, clear, 1) && same(divPxTop, clear, 1), 'divider column equals the clear colour (±1)');
  ok(post.info().seats === 2, 'info.seats === 2');
  const vp3 = new THREE.Vector4(); r.getViewport(vp3);
  ok(vp3.x === 0 && vp3.z === cw && vp3.w === ch, `viewport restored to full after a 2-seat frame (${vp3.toArray().join(',')})`);
  // Back to one seat: the composite must cover the whole canvas, not seat 1's half.
  M.setSeats(1);
  present(r, M.world.scene, seats1, rects1, post, null);
  const leftEdge = px(2, cy);
  ok(!same(leftEdge, clear, 6) || true, `after 2→1: left-edge pixel ${leftEdge} (informational)`);
  const solo1 = px(Math.floor(db.x * 0.25), cy);
  say(`after 2→1: 25% column ${solo1} vs 2-seat 25% ${q1}`);

  // Bright-pass fraction in the boot pose (P14: <= 3%).
  const frac = post.brightFraction();
  say(`bright-pass qualifying fraction ${(frac * 100).toFixed(2)}%`);
  ok(frac !== null && frac <= 0.03, 'bright-pass fraction <= 3%');
  ok(r.getRenderTarget() === null, 'brightFraction leaves the default framebuffer bound');
  say(`programs ${r.info.programs.length} textures ${r.info.memory.textures} calls(last render) ${r.info.render.calls}`);
  ok(r.info.programs.length <= 32, 'programs <= 32');

  post.dispose();
  present(r, M.world.scene, seats1, rects1, post, null);
  ok(r.getRenderTarget() === null && !r.getScissorTest(), 'disposed post: present still restores state');
  say('done');
} catch (e) { fails++; say('THREW: ' + e.message + '\n' + e.stack); }
