/* Post over the BACKBUFFER — Phase 15, the Overcooked look (spec: docs/CHANGELOG.md).
 *
 * The scene never renders into a render target. renderSeats() draws every seat straight to
 * the canvas exactly as it did before this phase — MSAA from `antialias:true`, sRGB output,
 * ACES — and only THEN does this module step in: copyFramebufferToTexture() lifts the
 * finished canvas into a texture and a four-pass colour-only chain puts it back.
 *
 *   PASS 2  capture     default framebuffer → sceneTex (full res, one copyTexImage2D)
 *   PASS 3  bright      sceneTex → rtA   (quarter res: 4x downsample + soft-knee threshold)
 *   PASS 4  blur H      rtA → rtB        (quarter res, 9-tap Gaussian as 5 bilinear taps)
 *   PASS 5  blur V      rtB → rtA
 *   PASS 6  composite   sceneTex + rtA → canvas (bloom add, warm, gain/lift, saturation,
 *                       seat-local vignette, dither, divider gap painted flat)
 *
 * WHY THE BACKBUFFER AND NOT A RENDER TARGET. Three chains this size usually render the
 * scene into a WebGLRenderTarget first. In r128 that path carries three traps this project
 * has already met: setRenderTarget() replaces the viewport with the target's own on every
 * bind (so per-seat scissoring has to be re-done inside the target), a plain target gets a
 * 16-bit depth renderbuffer (z-fighting on the 2 mm plank/rug/skirt stack), and the target
 * is sized in CSS px by getSize() unless someone remembers the pixel ratio (styles.js's
 * film mock: blurry on every dpr>1 display). Reading the antialiased default framebuffer
 * instead performs the browser's implicit MSAA resolve (the default framebuffer is
 * single-sampled from the app's viewpoint, WebGL spec), so the copy IS the resolve and
 * none of the three traps exist. The MSAA-RT + DepthTexture chain is the recorded
 * escalation path (INDEX.md), not the build.
 *
 * ⚠ ENCODING. renderer.outputEncoding only reaches BUILT-IN materials: a ShaderMaterial
 * gets no encodings_fragment chunk, so the last pass must write sRGB itself. The film mock
 * hand-rolled pow(c, 0.4545) and photographed a "power cut" until it did. Here the bytes
 * in sceneTex ARE sRGB (the scene wrote them through outputEncoding = sRGBEncoding), the
 * texture is left LinearEncoding ON PURPOSE so nothing double-decodes, and every shader
 * decodes with sRGBToLinear() and encodes with LinearTosRGB() — the library's own piecewise
 * curves from encodings_pars_fragment, which r128 emits UNCONDITIONALLY in every non-raw
 * ShaderMaterial fragment prefix (grep 'hi.encodings_pars_fragment' in the vendored build:
 * it sits between the tone-mapping chunk and the mapTexelToLinear helpers, no condition).
 *
 * ⚠ VIEWPORT. setViewport() stores CSS px on the renderer and re-applies them on every
 * setRenderTarget(null). After a 2→1 seat change the stored rect is still seat 1's half,
 * and a post pass that trusts it composites into half the canvas. apply() therefore ALWAYS
 * ends with setRenderTarget(null) / setViewport(0, 0, cssW, cssH) / setScissorTest(false),
 * even on the no-op and error paths, so present() returns with a known renderer state.
 *
 * ⚠ SIZES. getDrawingBufferSize() (device px) for every buffer; getSize() is CSS px and is
 * only right on dpr 1. The 0×0 boot canvas (renderer.js) means the first apply() may see
 * 0×0: nothing is allocated until a real size arrives, and a size change re-allocates.
 *
 * Software tier: never constructed (main.js gates on the tier); the headless suites must
 * allocate nothing here (m13 G1). Anything that throws makes createPost() return null with
 * a console.warn — never an error banner (m13 E4 / m0 G15) — and ?post=off is the player's
 * escape hatch if a platform's copyTexImage2D from the MSAA canvas returns black.
 */

import { RENDER } from '../config.js';

/** Bloom runs at 1/DOWNSAMPLE of the drawing buffer in each axis. */
const DOWNSAMPLE = 4;
/** Number of shader passes the chain issues (bright, blur H, blur V, composite). */
const PASSES = 4;
/** Bytes per drawing-buffer pixel: RGBA8 for every texture in the chain. */
const BYTES_RGBA8 = 4;

/** 9-tap Gaussian (sigma 3 quarter-px) folded into 5 bilinear fetches — the standard
 *  "linear sampling" kernel; offsets/weights are exact for sigma SIGMA_REF and scale with
 *  cfg.bloom.sigmaQuarterPx / SIGMA_REF. */
const KERNEL = Object.freeze({
  sigmaRef: 3.0,
  offset1: 1.3846153846, offset2: 3.2307692308,
  weight0: 0.2270270270, weight1: 0.3162162162, weight2: 0.0702702703,
});

/** Rec. 709 luma weights, used by the bright pass and the saturation mix. */
const LUMA = Object.freeze({ r: 0.2126, g: 0.7152, b: 0.0722 });

/** Interleaved gradient noise (Jimenez 2014) — an ordered, screen-stable dither that never
 *  swims between frames the way a hash of time would. */
const IGN = Object.freeze({ a: 52.9829189, b: 0.06711056, c: 0.00583715 });

/** Denominators that keep the soft knee and the weight ratio finite at black. */
const EPS = Object.freeze({ knee: 1e-5, luma: 1e-4 });

/** ?post=off disables the chain for a session (docs A/B frames, and the escape hatch). */
export function postModeFromLocation() {
  try {
    return new URLSearchParams(location.search).get('post') === 'off' ? 'off' : 'on';
  } catch (e) {
    return 'on';
  }
}

const VERTEX = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

/** Seat lookup shared by the UV-space passes. Constant indices only: GLSL ES 1.00 lets a
 *  fragment shader index a uniform array by constant expressions and nothing else. */
const SEAT_UV = /* glsl */`
  uniform int uSeatCount;
  uniform vec4 uSeatRect[2];
  bool inRect(vec2 p, vec4 r) { return p.x >= r.x && p.x < r.z && p.y >= r.y && p.y < r.w; }
  bool seatRect(vec2 p, out vec4 r) {
    if (inRect(p, uSeatRect[0])) { r = uSeatRect[0]; return true; }
    if (uSeatCount > 1 && inRect(p, uSeatRect[1])) { r = uSeatRect[1]; return true; }
    r = vec4(0.0, 0.0, 1.0, 1.0);
    return false;
  }
`;

/** PASS 3. Four bilinear taps at ±1 full-res texel around the block centre average the
 *  4×4 block exactly; every tap is clamped into the seat's own rect so a highlight at the
 *  edge of seat 0 never seeds bloom in seat 1. Unity's soft knee, then the weight. */
const BRIGHT_FRAG = /* glsl */`
  uniform sampler2D tScene;
  uniform vec2 uInvRes;
  uniform float uThreshold;
  uniform float uKnee;
  varying vec2 vUv;
  ${SEAT_UV}
  vec3 tap(vec2 uv, vec4 r) {
    vec2 h = 0.5 * uInvRes;
    return sRGBToLinear(texture2D(tScene, clamp(uv, r.xy + h, r.zw - h))).rgb;
  }
  void main() {
    vec4 r;
    if (!seatRect(vUv, r)) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
    vec3 c = tap(vUv + vec2(-1.0, -1.0) * uInvRes, r)
           + tap(vUv + vec2( 1.0, -1.0) * uInvRes, r)
           + tap(vUv + vec2(-1.0,  1.0) * uInvRes, r)
           + tap(vUv + vec2( 1.0,  1.0) * uInvRes, r);
    c *= 0.25;
    float luma = dot(c, vec3(LUMA_R, LUMA_G, LUMA_B));
    float k = uKnee;
    float sk = clamp(luma - uThreshold + k, 0.0, 2.0 * k);
    sk = sk * sk / (4.0 * k + EPS_KNEE);
    float w = max(sk, luma - uThreshold) / max(luma, EPS_LUMA);
    gl_FragColor = vec4(c * w, 1.0);
  }
`;

/** PASS 4/5. One material, uDir re-pointed between the passes. */
const BLUR_FRAG = /* glsl */`
  uniform sampler2D tInput;
  uniform vec2 uTexel;
  uniform vec2 uDir;
  uniform float uSigma;
  varying vec2 vUv;
  ${SEAT_UV}
  vec3 tap(vec2 uv, vec4 r) {
    vec2 h = 0.5 * uTexel;
    return texture2D(tInput, clamp(uv, r.xy + h, r.zw - h)).rgb;
  }
  void main() {
    vec4 r;
    if (!seatRect(vUv, r)) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
    vec2 s = uDir * uTexel * (uSigma / SIGMA_REF);
    vec3 c = tap(vUv, r) * W0;
    c += (tap(vUv + s * O1, r) + tap(vUv - s * O1, r)) * W1;
    c += (tap(vUv + s * O2, r) + tap(vUv - s * O2, r)) * W2;
    gl_FragColor = vec4(c, 1.0);
  }
`;

/** PASS 6. Seat lookup in DEVICE px from gl_FragCoord so the vignette is measured in each
 *  seat's own pixels (identical in 1- and 2-seat layouts) and the divider gap is exact. */
const COMPOSITE_FRAG = /* glsl */`
  uniform sampler2D tScene;
  uniform sampler2D tBloom;
  uniform vec2 uRes;
  uniform vec2 uBloomTexel;
  uniform int uSeatCount;
  uniform vec4 uSeatRectPx[2];
  uniform float uBloomStrength;
  uniform vec3 uWarm;
  uniform float uGain;
  uniform vec3 uLift;
  uniform float uSaturation;
  uniform float uVignette;
  uniform float uVigInner;
  uniform float uVigOuter;
  uniform vec3 uDivider;
  uniform float uDither;
  bool inRectPx(vec2 p, vec4 r) { return p.x >= r.x && p.x < r.x + r.z && p.y >= r.y && p.y < r.y + r.w; }
  float ign(vec2 p) { return fract(IGN_A * fract(IGN_B * p.x + IGN_C * p.y)); }
  void main() {
    vec2 fc = gl_FragCoord.xy;
    vec4 r;
    if (inRectPx(fc, uSeatRectPx[0])) r = uSeatRectPx[0];
    else if (uSeatCount > 1 && inRectPx(fc, uSeatRectPx[1])) r = uSeatRectPx[1];
    else { gl_FragColor = vec4(uDivider, 1.0); return; }
    vec2 uv = fc / uRes;
    vec3 c = sRGBToLinear(texture2D(tScene, uv)).rgb;
    vec4 ruv = vec4(r.xy, r.xy + r.zw) / uRes.xyxy;
    vec2 hq = 0.5 * uBloomTexel;
    c += texture2D(tBloom, clamp(uv, ruv.xy + hq, ruv.zw - hq)).rgb * uBloomStrength;
    c *= uWarm;
    c = c * uGain + uLift;
    float luma = dot(c, vec3(LUMA_R, LUMA_G, LUMA_B));
    c = mix(vec3(luma), c, uSaturation);
    vec2 l = (fc - r.xy) / r.zw - 0.5;
    l.x *= r.z / r.w;
    c *= 1.0 - uVignette * smoothstep(uVigInner, uVigOuter, dot(l, l));
    vec3 o = LinearTosRGB(vec4(max(c, 0.0), 1.0)).rgb;
    o += (ign(fc) - 0.5) / 255.0 * uDither;
    gl_FragColor = vec4(o, 1.0);
  }
`;

/**
 * Build the chain. Returns null (with a console.warn) instead of throwing, so a missing
 * API, a lost context or a failed allocation degrades to "no post" and never to a banner.
 *
 * @param {THREE.WebGLRenderer} renderer
 * @param {typeof THREE} THREE
 * @param {typeof RENDER.post} cfg
 */
export function createPost(renderer, THREE, cfg = RENDER.post) {
  try {
    return build(renderer, THREE, cfg);
  } catch (e) {
    console.warn('post: disabled — ' + (e && e.message ? e.message : e));
    return null;
  }
}

function build(renderer, THREE, cfg) {
  if (!renderer || typeof renderer.copyFramebufferToTexture !== 'function') {
    throw new Error('renderer.copyFramebufferToTexture is missing (r128 core has it)');
  }
  const gl = renderer.getContext();
  if (!gl || (typeof gl.isContextLost === 'function' && gl.isContextLost())) {
    throw new Error('WebGL context unavailable or lost');
  }

  /* Capture format. copyTexImage2D fails with INVALID_OPERATION when the internal format
   * asks for a component the framebuffer does not have, and this renderer is created
   * without an alpha channel (renderer.js: no `alpha` attribute → false). ALPHA_BITS is
   * what the framebuffer actually offers from the app's viewpoint, so it decides: RGB when
   * the canvas has no alpha, RGBA when it does. Either samples with alpha 1 in the shaders. */
  const alphaBits = gl.getParameter(gl.ALPHA_BITS) | 0;
  const captureFormat = alphaBits > 0 ? THREE.RGBAFormat : THREE.RGBFormat;

  const defines = {
    LUMA_R: LUMA.r.toFixed(4), LUMA_G: LUMA.g.toFixed(4), LUMA_B: LUMA.b.toFixed(4),
    EPS_KNEE: EPS.knee.toExponential(0), EPS_LUMA: EPS.luma.toExponential(0),
    SIGMA_REF: KERNEL.sigmaRef.toFixed(1),
    O1: KERNEL.offset1.toFixed(10), O2: KERNEL.offset2.toFixed(10),
    W0: KERNEL.weight0.toFixed(10), W1: KERNEL.weight1.toFixed(10), W2: KERNEL.weight2.toFixed(10),
    IGN_A: IGN.a.toFixed(7), IGN_B: IGN.b.toFixed(8), IGN_C: IGN.c.toFixed(8),
  };
  const seatRect = [new THREE.Vector4(0, 0, 1, 1), new THREE.Vector4(0, 0, 1, 1)];
  const seatRectPx = [new THREE.Vector4(0, 0, 1, 1), new THREE.Vector4(0, 0, 1, 1)];
  const grade = cfg.grade, bloom = cfg.bloom, vig = cfg.vignette;
  /* The divider is written as the sRGB bytes themselves, not through LinearTosRGB: the
   * gpu probe asserts the gap EQUALS the clear colour, and a round trip through two pow()
   * approximations is exactly where a ±1 LSB would show up. Color.setHex in r128 is raw
   * (no colour management), so the components ARE the sRGB bytes / 255. */
  const divider = new THREE.Color(cfg.divider);

  const shaderOpts = { depthTest: false, depthWrite: false, toneMapped: false, defines };
  const brightMat = new THREE.ShaderMaterial({
    ...shaderOpts,
    uniforms: {
      tScene: { value: null }, uInvRes: { value: new THREE.Vector2(1, 1) },
      uSeatCount: { value: 1 }, uSeatRect: { value: seatRect },
      uThreshold: { value: bloom.threshold }, uKnee: { value: bloom.knee },
    },
    vertexShader: VERTEX, fragmentShader: BRIGHT_FRAG,
  });
  const blurMat = new THREE.ShaderMaterial({
    ...shaderOpts,
    uniforms: {
      tInput: { value: null }, uTexel: { value: new THREE.Vector2(1, 1) },
      uDir: { value: new THREE.Vector2(1, 0) }, uSigma: { value: bloom.sigmaQuarterPx },
      uSeatCount: { value: 1 }, uSeatRect: { value: seatRect },
    },
    vertexShader: VERTEX, fragmentShader: BLUR_FRAG,
  });
  const compMat = new THREE.ShaderMaterial({
    ...shaderOpts,
    uniforms: {
      tScene: { value: null }, tBloom: { value: null },
      uRes: { value: new THREE.Vector2(1, 1) }, uBloomTexel: { value: new THREE.Vector2(1, 1) },
      uSeatCount: { value: 1 }, uSeatRectPx: { value: seatRectPx },
      uBloomStrength: { value: bloom.strength },
      uWarm: { value: new THREE.Vector3().fromArray(grade.warm) },
      uGain: { value: grade.gain },
      uLift: { value: new THREE.Vector3().fromArray(grade.lift) },
      uSaturation: { value: grade.saturation },
      uVignette: { value: vig.amount }, uVigInner: { value: vig.inner }, uVigOuter: { value: vig.outer },
      uDivider: { value: new THREE.Vector3(divider.r, divider.g, divider.b) },
      uDither: { value: cfg.dither ? 1 : 0 },
    },
    vertexShader: VERTEX, fragmentShader: COMPOSITE_FRAG,
  });

  /* One triangle covering the clip-space square — two fewer vertices than a quad and no
   * diagonal seam. Its own scene: nothing here may ever enter world.scene (m13 B1/E1). */
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    -1, -1, 0,  3, -1, 0,  -1, 3, 0,
  ]), 3));
  tri.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
  const mesh = new THREE.Mesh(tri, compMat);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const ORIGIN = new THREE.Vector2(0, 0);
  const dbSize = new THREE.Vector2();
  const rtOpts = {
    format: THREE.RGBAFormat, type: THREE.UnsignedByteType,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    depthBuffer: false, stencilBuffer: false, generateMipmaps: false,
  };

  let sceneTex = null, rtA = null, rtB = null;
  let W = 0, H = 0, qw = 0, qh = 0;
  let seats = 0;
  let enabled = true, broken = false, disposed = false, checkedGl = false, warnedTarget = false;

  function ensureSized(w, h) {
    if (w === W && h === H && sceneTex) return;
    W = w; H = h;
    qw = Math.max(1, Math.floor(W / DOWNSAMPLE));
    qh = Math.max(1, Math.floor(H / DOWNSAMPLE));
    if (sceneTex) sceneTex.dispose();
    /* DataTexture with null data: r128 uploads it as texImage2D(..., null) — an allocation
     * the copy then overwrites. Constructor defaults: flipY false, generateMipmaps false,
     * unpackAlignment 1, needsUpdate true (so the allocation happens on first bind). */
    sceneTex = new THREE.DataTexture(null, W, H, captureFormat, THREE.UnsignedByteType);
    sceneTex.minFilter = THREE.LinearFilter;
    sceneTex.magFilter = THREE.LinearFilter;
    sceneTex.generateMipmaps = false;
    sceneTex.flipY = false;
    sceneTex.encoding = THREE.LinearEncoding;   // the bytes are sRGB; the shaders decode
    sceneTex.needsUpdate = true;
    if (!rtA) {
      rtA = new THREE.WebGLRenderTarget(qw, qh, rtOpts);
      rtB = new THREE.WebGLRenderTarget(qw, qh, rtOpts);
    } else {
      rtA.setSize(qw, qh);
      rtB.setSize(qw, qh);
    }
    brightMat.uniforms.tScene.value = sceneTex;
    brightMat.uniforms.uInvRes.value.set(1 / W, 1 / H);
    blurMat.uniforms.uTexel.value.set(1 / qw, 1 / qh);
    compMat.uniforms.tScene.value = sceneTex;
    compMat.uniforms.tBloom.value = rtA.texture;
    compMat.uniforms.uRes.value.set(W, H);
    compMat.uniforms.uBloomTexel.value.set(1 / qw, 1 / qh);
  }

  /** Seat rects in device px exactly as r128 applied them — floor of each CSS component
   *  times the pixel ratio (setViewport: `multiplyScalar(P).floor()`) — and the same rects
   *  as 0..1 canvas UV for the quarter-res passes. */
  function setSeats(rects, pixelRatio) {
    let n = 0;
    for (let i = 0; i < rects.length && n < 2; i++) {
      const r = rects[i];
      if (!r || r.w <= 0 || r.h <= 0) continue;
      const x = Math.floor(r.x * pixelRatio), y = Math.floor(r.y * pixelRatio);
      const w = Math.floor(r.w * pixelRatio), h = Math.floor(r.h * pixelRatio);
      seatRectPx[n].set(x, y, w, h);
      seatRect[n].set(x / W, y / H, (x + w) / W, (y + h) / H);
      n++;
    }
    if (n === 0) return 0;
    if (n === 1) { seatRectPx[1].copy(seatRectPx[0]); seatRect[1].copy(seatRect[0]); }
    brightMat.uniforms.uSeatCount.value = n;
    blurMat.uniforms.uSeatCount.value = n;
    compMat.uniforms.uSeatCount.value = n;
    return n;
  }

  function pass(material, target) {
    mesh.material = material;
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
  }

  function runChain(cssW, cssH) {
    // PASS 2: the default framebuffer is bound (checked by the caller); this copy is the
    // MSAA resolve.
    renderer.copyFramebufferToTexture(ORIGIN, sceneTex);
    pass(brightMat, rtA);                                   // PASS 3
    blurMat.uniforms.tInput.value = rtA.texture;
    blurMat.uniforms.uDir.value.set(1, 0);
    pass(blurMat, rtB);                                     // PASS 4
    blurMat.uniforms.tInput.value = rtB.texture;
    blurMat.uniforms.uDir.value.set(0, 1);
    pass(blurMat, rtA);                                     // PASS 5
    /* PASS 6. setRenderTarget(null) re-applies the renderer's STORED viewport, which after
     * a two-seat frame is seat 1's half-rect — the composite would cover half the canvas
     * and the other half would keep last frame's image. Full viewport first, then draw. */
    restore(cssW, cssH);
    mesh.material = compMat;
    renderer.render(scene, camera);
  }

  /** Always leave the renderer in the state present() promises: default framebuffer, the
   *  FULL canvas as the stored viewport and scissor, scissor test off. */
  function restore(cssW, cssH) {
    renderer.setRenderTarget(null);
    renderer.setViewport(0, 0, cssW, cssH);
    renderer.setScissor(0, 0, cssW, cssH);
    renderer.setScissorTest(false);
  }

  function apply(rects, pixelRatio, cssW, cssH) {
    const autoClear = renderer.autoClear;
    try {
      if (disposed || broken || !enabled || !rects || rects.length === 0) return;
      if (typeof gl.isContextLost === 'function' && gl.isContextLost()) return;
      if (renderer.getRenderTarget() !== null) {
        if (!warnedTarget) { warnedTarget = true; console.warn('post.apply: a render target is bound; the chain needs the default framebuffer'); }
        return;
      }
      renderer.getDrawingBufferSize(dbSize);
      if (dbSize.x <= 0 || dbSize.y <= 0) return;           // 0×0 boot canvas
      ensureSized(dbSize.x, dbSize.y);
      seats = setSeats(rects, pixelRatio);
      if (seats === 0) return;
      /* Every pass covers its whole target with a depth-less triangle, so the four
       * autoClear clears (one at full res) would be pure fill. Restored in finally. */
      renderer.autoClear = false;
      /* First frame only: flush any stale GL error, run, then ask once. A platform whose
       * copyTexImage2D refuses the MSAA canvas (open risk 1) turns the chain off here
       * instead of painting black every frame. getError is a sync stall, hence once. */
      if (!checkedGl) gl.getError();
      runChain(cssW, cssH);
      if (!checkedGl) {
        checkedGl = true;
        const err = gl.getError();
        if (err) { broken = true; console.warn('post: GL error 0x' + err.toString(16) + ' on the first frame — chain disabled (?post=off is equivalent)'); }
      }
    } catch (e) {
      broken = true;
      console.warn('post: disabled after an exception — ' + (e && e.message ? e.message : e));
    } finally {
      renderer.autoClear = autoClear;
      try { restore(cssW, cssH); } catch (e) { /* a lost context; nothing to restore into */ }
    }
  }

  function info() {
    return {
      passes: PASSES,
      full: [W, H],
      quarter: [qw, qh],
      bytesPerPx: BYTES_RGBA8 + 2 * (BYTES_RGBA8 / (DOWNSAMPLE * DOWNSAMPLE)),
      seats,
      enabled: enabled && !broken && !disposed,
    };
  }

  /**
   * Probe helper (tools/m13g-gpu.js, _probe-look.js): the fraction of quarter-res texels
   * the bright pass lets through, from the LAST captured frame. rtA holds the blurred
   * result after apply(), so this re-runs PASS 3 alone into rtA, reads it back, then
   * re-runs the two blurs so rtA is the final bloom again. Null before the first frame.
   */
  function brightFraction(minByte = 2) {
    if (!sceneTex || disposed || broken) return null;
    const autoClear = renderer.autoClear;
    try {
      renderer.autoClear = false;
      pass(brightMat, rtA);
      const px = new Uint8Array(qw * qh * 4);
      renderer.readRenderTargetPixels(rtA, 0, 0, qw, qh, px);
      let lit = 0;
      for (let i = 0; i < px.length; i += 4) {
        if (px[i] >= minByte || px[i + 1] >= minByte || px[i + 2] >= minByte) lit++;
      }
      blurMat.uniforms.tInput.value = rtA.texture; blurMat.uniforms.uDir.value.set(1, 0); pass(blurMat, rtB);
      blurMat.uniforms.tInput.value = rtB.texture; blurMat.uniforms.uDir.value.set(0, 1); pass(blurMat, rtA);
      return lit / (qw * qh);
    } finally {
      renderer.autoClear = autoClear;
      renderer.setRenderTarget(null);
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (sceneTex) sceneTex.dispose();
    if (rtA) rtA.dispose();
    if (rtB) rtB.dispose();
    brightMat.dispose(); blurMat.dispose(); compMat.dispose();
    tri.dispose();
    sceneTex = rtA = rtB = null;
  }

  return {
    apply,
    info,
    setEnabled(b) { enabled = !!b; },
    dispose,
    brightFraction,
    /** Raw handles for probes; null until the first non-zero frame. */
    targets() { return { sceneTex, rtA, rtB }; },
  };
}
