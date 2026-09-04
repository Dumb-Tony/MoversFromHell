/* Depth-texture viability in the HEADLESS context (the shot harness forces ?tier=gpu, so a
 * depth-based post pass must survive here or every docs screenshot dies). The marker is
 * written FIRST and updated per step: if the GL context dies mid-probe, the dump still says
 * which step killed it. The first version emitted only at the end and reported nothing. */
const pre = document.createElement('pre');
document.body.appendChild(pre);
const L = ['probe reached script'];
const say = (s) => { L.push(s); pre.textContent = '==MFHTEST-BEGIN==\n' + L.join('\n') + '\nALL-PASS\n==MFHTEST-END=='; };
say('waiting for boot');
let M;
try { M = await window.__MFH_READY; say('booted'); } catch (e) { say('BOOT THREW ' + e.message); }
try {
  const THREE = window.THREE;
  const r = M.renderer, gl = r.getContext();
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  say('renderer: ' + (dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '?') + ' webgl2=' + r.capabilities.isWebGL2);
  const w = 256, h = 128;
  const depthTex = new THREE.DepthTexture(w, h);
  say('DepthTexture constructed');
  const rt = new THREE.WebGLRenderTarget(w, h, { depthTexture: depthTex, depthBuffer: true });
  say('RT with depthTexture constructed');
  const cam = M.movers[0].camera;
  r.setRenderTarget(rt); r.render(M.world.scene, cam); r.setRenderTarget(null);
  say('rendered scene into depth RT, gl error=' + gl.getError());
  const out = new THREE.WebGLRenderTarget(w, h);
  const mat = new THREE.ShaderMaterial({
    uniforms: { tDepth: { value: depthTex } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy,0.,1.); }',
    fragmentShader: 'uniform sampler2D tDepth; varying vec2 vUv; void main(){ float d = texture2D(tDepth, vUv).r; gl_FragColor = vec4(d, d, d, 1.); }',
    depthTest: false, depthWrite: false });
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1,-1,0, 3,-1,0, -1,3,0]), 3));
  tri.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0,0, 2,0, 0,2]), 2));
  const s2 = new THREE.Scene(); s2.add(new THREE.Mesh(tri, mat));
  const c2 = new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  r.setRenderTarget(out); r.render(s2, c2);
  say('sampled depth into colour RT, gl error=' + gl.getError());
  const px = new Uint8Array(w * h * 4); r.readRenderTargetPixels(out, 0, 0, w, h, px);
  r.setRenderTarget(null);
  let min = 255, max = 0, sum = 0;
  for (let i = 0; i < px.length; i += 4) { const v = px[i]; if (v < min) min = v; if (v > max) max = v; sum += v; }
  say(`depth readback: min=${min} max=${max} mean=${(sum / (w*h)).toFixed(1)} — varies means USABLE; flat means not`);
} catch (e) { say('THREW: ' + e.message); }
