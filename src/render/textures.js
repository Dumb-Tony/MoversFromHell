/* Canvas-drawn textures — GDD §13.4, §20.1, §26.5, §26.6.
 *
 * COPIED FROM `SomethingsDifferent\somethingsdifferent.html` (Dev\INDEX.md → "Procedural
 * geometry & texture"): `canvasTex`, `hslCss`, `tiled`, and the ready-made `texGrass`,
 * `texAsphalt`, `texSiding`, `texShingle`, `texConcrete`, `texBoards`, `texPaint`. Names
 * kept so the shared lineage stays greppable. That project runs the same vendored Three
 * r128 build, so these dropped in unported — which is the entire reason the rule exists.
 *
 * What is NOT copied is `gradedCtx`, the colour-grading wrapper. That game grades its whole
 * palette toward a mood; this one wants surfaces to read as themselves, because §26.5 asks
 * for states that are legible without a UI layer and a graded cardboard box stops looking
 * like cardboard.
 *
 * NEW HERE, because a moving game needs surfaces that game did not: cardboard with a
 * fragile stencil, upholstery weave, wood grain with knots, brushed appliance steel, and the
 * truck's livery.
 *
 * §13.4 permits "stylized primitive or low-detail 3D meshes" and makes
 * COLLISION-FAITHFUL PROPORTIONS mandatory. Nothing in this file has any opinion about
 * size: these are materials for meshes whose dimensions come from the object definitions
 * and the collider records, and an art pass must never be the reason a couch stops being
 * 2.10 m wide.
 *
 * §26.6 sets a 45 FPS floor with the full manifest. Every texture here is memoised by key
 * and drawn ONCE at world build, and `tiled()` clones share the underlying image — so a
 * street of boxes costs one canvas, not one per box.
 *
 * ── PHASE 15 RE-AUTHORING (2026-09-03): the material library ──────────────────────────
 *
 * Every generator was rewritten against docs/CHANGELOG.md's material library, and the
 * reasons are measured ones from the phase-14 screenshots:
 *
 * 1. NO MORE 1-2 px SPECKLE LOOPS. Every phase-14 texture carried a `for (i < 1400)
 *    fillRect(x, y, 2, 2)` noise pass. At the game camera a 256² tile on a 0.5 m face is
 *    ~0.6 texel per screen pixel, so a 2 px speck is under the mip filter and comes back as
 *    a POLKA-DOT MOIRÉ on walls and a checker on the couch arms (the judges' P5 note). The
 *    rule now: no feature under 6 texels (`TEX.minFeature`), edges via gradient stops or a
 *    `ctx.filter` blur, luminance in three tiers, hue variance under 6° per surface.
 *
 * 2. ONE FEATURE LIST, TWO OR THREE CANVASES. `texSet()` draws the albedo AND a paired
 *    HEIGHT canvas (and optionally a SPECULAR mask) from the same list of features, so a
 *    grass clump's bump sits exactly under its colour. The height canvas is registered
 *    against the albedo's image in a WeakMap; `heightFor(tex)` finds it again from any
 *    `tiled()` clone (clones share the image). Callers only ever hold the albedo.
 *
 * 3. ENCODING: the albedo stays sRGB-tagged (m13 D3) — r128 decodes it in GLSL on the way
 *    in (`mapTexelToLinear`). A bumpMap / normalMap / specularMap is sampled RAW
 *    (`texture2D( bumpMap, vUv ).x`, no decode — grep `dHdxy_fwd` and
 *    `specularmap_fragment` in the vendored build), so the height, spec and normal textures
 *    are tagged LinearEncoding: a height of 0.5 must MEAN 0.5.
 *
 * 4. THE SOFTWARE TIER ALLOCATES NOTHING EXPENSIVE. `setRenderTier('software')` (main.js
 *    calls it right after detectRenderTier, before buildScene) makes `texSet` draw the
 *    height and spec features into a shared 1×1 scratch canvas — the calls do not throw,
 *    nothing is registered, `heightFor()` returns null. Measured on the m13 suite: the
 *    per-fragment bump/normal cost under SwiftShader took a 4 s suite past 600 s, so the
 *    stripping happens HERE, at the source, not by hoping every material site remembers.
 *
 * 5. SIZES: 512² per 0.5-1 m of surface for hero materials (`TEX.size`), 256² for cloth
 *    and repeating small-scale patterns, 128²/64² for flat fills. Texture memory grows
 *    from ~5 MB to ~25-30 MB with mips on the gpu tier; the software tier stays flat.
 *
 * ⚠ `ctx.filter` is unsupported in Safari. `soft()` falls back to drawing the feature
 * crisp, so Safari renders slightly harder-edged textures — cosmetic, in KNOWN_ISSUES.
 *
 * ⚠ BLUR DOES NOT WRAP. A blurred feature drawn at a tile edge fades into the edge and
 * leaves a visible seam when tiled. `ell()` draws every feature at its 8 wrapped positions
 * when it is within reach of an edge, so the tile stays seamless under the blur.
 */

import { RENDER } from '../config.js';

/** Structural constants for the texture layer (§25.1: no bare literal in a system). */
export const TEX = Object.freeze({
  size: 512,          // hero surfaces: 512² per 0.5-1 m
  half: 256,          // cloth, flutes, small-period patterns
  small: 128,         // flat fills with a light pattern
  tiny: 64,           // flat fills (tape, rubber)
  anisotropy: 4,
  minFeature: 6,      // no drawn feature under this many texels (see header, 1.)
  heightMid: 128,     // the neutral height level (0..255); raised above, recessed below
  hueSpread: 3,       // ± degrees of hue used inside one surface (variance < 6°)
  softPx: 1.5,        // the default edge blur, in texels
  normalGain: 2.0,    // Sobel slope → normal xy gain at strength 1
  scratch: 1,         // the software tier's height/spec scratch canvas edge, in px
});

const TAU = Math.PI * 2;
const _texCache = new Map();
/** albedo canvas → paired height / spec texture (the caller only ever holds the albedo). */
const _heightOf = new WeakMap();
const _specOf = new WeakMap();
/** height canvas → Map(strength → normal DataTexture). */
const _normalOf = new WeakMap();
let _tier = 'gpu';
let _scratchCtx = null;
let _envCube = null;

/** 'gpu' | 'software'. main.js sets it right after detectRenderTier and BEFORE buildScene. */
export function setRenderTier(tier) {
  _tier = tier === 'software' ? 'software' : 'gpu';
}
export function getRenderTier() { return _tier; }

export function hslCss(h, s, l) {
  return 'hsl(' + (((h % 360) + 360) % 360).toFixed(1) + ',' +
         (s * 100).toFixed(0) + '%,' + (l * 100).toFixed(0) + '%)';
}

function newCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/** The software tier's sink for height/spec drawing: one 1×1 canvas, state reset per use. */
function scratchCtx() {
  if (!_scratchCtx) _scratchCtx = newCanvas(TEX.scratch, TEX.scratch).getContext('2d');
  _scratchCtx.setTransform(1, 0, 0, 1, 0, 0);
  _scratchCtx.globalAlpha = 1;
  if (typeof _scratchCtx.filter === 'string') _scratchCtx.filter = 'none';
  return _scratchCtx;
}

function wrapAlbedo(canvas) {
  const THREE = window.THREE;
  const t = new THREE.CanvasTexture(canvas);
  /* TAGGED sRGB. The renderer writes sRGB output (renderer.js), and a canvas is authored in
   * sRGB — leaving the texture at the default LinearEncoding means it is corrected on the
   * way out without having been decoded on the way in, so every texture reads pale and
   * chalky next to the untextured flat colours beside it. */
  if (THREE.sRGBEncoding !== undefined) t.encoding = THREE.sRGBEncoding;
  t.anisotropy = TEX.anisotropy;
  t.needsUpdate = true;
  return t;
}

/** Height / spec / normal: LINEAR, repeating, mipmapped. See header 3. */
function wrapData(canvas) {
  const THREE = window.THREE;
  const t = new THREE.CanvasTexture(canvas);
  t.encoding = THREE.LinearEncoding;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = TEX.anisotropy;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

/** Memoised by `key`. Two calls with the same key return the SAME texture object. */
export function canvasTex(w, h, key, draw) {
  if (_texCache.has(key)) return _texCache.get(key);
  const c = newCanvas(w, h);
  draw(c.getContext('2d'), w, h);
  const t = wrapAlbedo(c);
  _texCache.set(key, t);
  return t;
}

/**
 * A height-only texture (LinearEncoding, cached under 'h|' + key). Used for the kinds whose
 * albedo is a flat colour that must survive (cloth, foliage, bark): the bump carries the
 * weave, the colour stays the player's.
 *
 * On the software tier the draw runs against a `TEX.scratch`-sized canvas so the call is
 * free and never throws; the result is never sampled there (materials.js strips bumps).
 */
export function heightTex(w, h, key, draw) {
  const k = 'h|' + key;
  if (_texCache.has(k)) return _texCache.get(k);
  const gpu = _tier === 'gpu';
  const c = gpu ? newCanvas(w, h) : newCanvas(TEX.scratch, TEX.scratch);
  const x = c.getContext('2d');
  x.fillStyle = heightMid(); x.fillRect(0, 0, c.width, c.height);
  draw(x, w, h);
  const t = wrapData(c);
  _texCache.set(k, t);
  return t;
}

/**
 * Albedo + paired height (+ spec mask) from ONE feature list.
 *
 * draw(ctx, w, h) with ctx = { a: albedoCtx, h: heightCtx | null, s: specCtx | null }.
 * Returns the sRGB albedo texture, memoised by key exactly like canvasTex (m13 D1/D2/D4).
 * The height canvas starts at `TEX.heightMid` grey, the spec canvas at black. On the
 * software tier h/s are the 1×1 scratch context: nothing is allocated or registered.
 */
export function texSet(w, h, key, draw, opts = {}) {
  if (_texCache.has(key)) return _texCache.get(key);
  const wantH = opts.height !== false;
  const wantS = opts.spec === true;
  const gpu = _tier === 'gpu';
  const a = newCanvas(w, h);
  const hc = wantH && gpu ? newCanvas(w, h) : null;
  const sc = wantS && gpu ? newCanvas(w, h) : null;
  const ax = a.getContext('2d');
  const hx = hc ? hc.getContext('2d') : (wantH ? scratchCtx() : null);
  const sx = sc ? sc.getContext('2d') : (wantS ? scratchCtx() : null);
  if (hx) { hx.fillStyle = heightMid(); hx.fillRect(0, 0, w, h); }
  if (sx) { sx.fillStyle = '#000000'; sx.fillRect(0, 0, w, h); }
  draw({ a: ax, h: hx, s: sx }, w, h);
  const t = wrapAlbedo(a);
  _texCache.set(key, t);
  if (hc) {
    const ht = wrapData(hc);
    _texCache.set('h|' + key, ht);
    _heightOf.set(a, ht);
  }
  if (sc) {
    const st = wrapData(sc);
    _texCache.set('s|' + key, st);
    _specOf.set(a, st);
  }
  return t;
}

/** The paired height texture of an albedo (or of any tiled() clone of it), else null. */
export function heightFor(tex) {
  if (!tex || !tex.image) return null;
  return _heightOf.get(tex.image) || null;
}

/** The paired specular mask of an albedo (or any clone), else null. */
export function specFor(tex) {
  if (!tex || !tex.image) return null;
  return _specOf.get(tex.image) || null;
}

/**
 * A tangent-space normal map from a height canvas: Sobel into Uint8 RGBA, LinearEncoding,
 * RepeatWrapping, mipmapped, memoised by (image, strength).
 *
 * ⚠ FLIP-Y. A CanvasTexture defaults to flipY = true (canvas row 0 lands at v = 1); a
 * DataTexture defaults to flipY = false. The Sobel is computed in canvas row order, so the
 * DataTexture is given flipY = true too — UNPACK_FLIP_Y_WEBGL applies to typed-array
 * uploads as well — and the derivation below stays in canvas coordinates: a slope rising
 * toward +u tilts the normal to -u (R = mid - dx), rising toward canvas-up (-y) tilts it to
 * +v (G = mid + dy). Wraps at the edges so the tile stays seamless.
 */
export function normalFromHeight(heightTexture, strength = 0.6) {
  if (!heightTexture || !heightTexture.image) return null;
  const THREE = window.THREE;
  const img = heightTexture.image;
  let byS = _normalOf.get(img);
  if (!byS) { byS = new Map(); _normalOf.set(img, byS); }
  if (byS.has(strength)) return byS.get(strength);
  const w = img.width, h = img.height;
  const src = img.getContext('2d').getImageData(0, 0, w, h).data;
  const out = new Uint8Array(w * h * 4);
  const H = (x, y) => src[((((y % h) + h) % h) * w + (((x % w) + w) % w)) * 4] / 255;
  const gain = strength * TEX.normalGain;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1)) -
                 (H(x - 1, y - 1) + 2 * H(x - 1, y) + H(x - 1, y + 1));
      const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1)) -
                 (H(x - 1, y - 1) + 2 * H(x, y - 1) + H(x + 1, y - 1));
      let nx = -dx * gain, ny = dy * gain, nz = 1;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx *= inv; ny *= inv; nz *= inv;
      const o = (y * w + x) * 4;
      out[o] = Math.round((nx * 0.5 + 0.5) * 255);
      out[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      out[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      out[o + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(out, w, h, THREE.RGBAFormat);
  t.encoding = THREE.LinearEncoding;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;   // DataTexture defaults to Nearest, no mips
  t.generateMipmaps = true;
  t.anisotropy = TEX.anisotropy;
  t.flipY = true;
  t.needsUpdate = true;
  byS.set(strength, t);
  return t;
}

/** The sky and ground colours the environment cube is painted in — the sky's own stops. */
const ENV = Object.freeze({
  size: 64,
  top: '#2f6fb8',        // texSky's default top
  mid: '#6fa8d4',
  horizon: '#dfe9ee',    // == scene.js HORIZON == RENDER.post.divider
  ground: '#9c7c5e',     // == LIGHTING.hemi.ground: undersides pick up the same bounce
  blobAlpha: 0.55,
});

/**
 * The reflection environment: six 64² canvases. +Y flat sky top, -Y flat ground, the four
 * sides a sky→horizon gradient with one soft bright blob on +X (the sun side) so chrome
 * and steel carry a highlight that moves with the view. sRGB-tagged (r128 decodes envMap
 * texels with envMapTexelToLinear). Memoised — every reflective material shares it.
 */
export function envCube() {
  if (_envCube) return _envCube;
  const THREE = window.THREE;
  const S = ENV.size;
  const side = (blob) => {
    const c = newCanvas(S, S);
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, ENV.top); g.addColorStop(0.62, ENV.mid); g.addColorStop(1, ENV.horizon);
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    if (blob) {
      const r = x.createRadialGradient(S * 0.5, S * 0.34, 1, S * 0.5, S * 0.34, S * 0.30);
      r.addColorStop(0, 'rgba(255,255,255,' + ENV.blobAlpha + ')');
      r.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = r; x.fillRect(0, 0, S, S);
    }
    return c;
  };
  const flat = (colour) => {
    const c = newCanvas(S, S);
    const x = c.getContext('2d');
    x.fillStyle = colour; x.fillRect(0, 0, S, S);
    return c;
  };
  // Cube face order: +X, -X, +Y, -Y, +Z, -Z (r128 CubeTexture / WebGL TEXTURE_CUBE_MAP_*).
  const t = new THREE.CubeTexture([side(true), side(false), flat(ENV.top), flat(ENV.ground), side(false), side(false)]);
  if (THREE.sRGBEncoding !== undefined) t.encoding = THREE.sRGBEncoding;
  t.needsUpdate = true;
  _envCube = t;
  return t;
}

/** A repeating clone. The clone shares the image, so this is cheap per use. */
export function tiled(t, rx, ry) {
  const THREE = window.THREE;
  const c = t.clone();
  c.needsUpdate = true;
  c.wrapS = c.wrapT = THREE.RepeatWrapping;
  c.repeat.set(rx, ry);
  return c;
}

/** The toy-palette boost, applied at the one place every flat colour passes through. */
const TOY = Object.freeze({ satGain: 1.4, satAdd: 0.04, lightGain: 1.05, satCap: 0.85, lightCap: 0.80, minSat: 0.02 });

/**
 * A flat-coloured material, with the colour converted from sRGB to linear.
 *
 * ⚠ THE THING THAT MAKES AN ENTIRE SCENE LOOK WASHED OUT, and it is invisible until you
 * compare against something correct.
 *
 * Three r128 has no automatic colour management. `renderer.outputEncoding = sRGBEncoding`
 * (see renderer.js) converts LINEAR values to sRGB on the way out — so a material colour
 * has to BE linear. Hex literals are authored in sRGB, the space every colour picker and
 * every one of this project's palettes uses. Handing 0x5b4632 straight to a material means
 * a mid-brown tree trunk is treated as linear, brightened by the output transform, and
 * arrives on screen as pale tan. Every flat colour in the build shifted the same way at
 * once, which is exactly the kind of error that reads as "the lighting is wrong".
 *
 * Textures do not need this — they are tagged sRGB in `canvasTex` and decoded on the way
 * in — which is why a textured surface beside a flat one is what makes the bug visible.
 *
 * Centralised here rather than fixed at each of the thirteen material sites, because
 * "convert every colour except the ones somebody forgot" is worse than not converting.
 *
 * Phase 15: `opts.toy === false` skips the saturation boost (skin, leather, chrome, glass —
 * the kinds where a boosted colour reads as a sweet), and the boost is CAPPED at S 0.85 /
 * L 0.80 so a lime marker or a cream trim cannot be pushed to a clipped primary under the
 * new exposure. `opts.toy` is consumed here and never reaches the material constructor
 * (r128 warns on unknown properties). Defaults are untouched: m13 D5/D6/F1/F2 pin them.
 */
export function matte(colour, opts = {}) {
  const THREE = window.THREE;
  const { toy, ...rest } = opts;
  /* ⚠ PHONG, NOT LAMBERT, AND THE SPECULAR IS KILLED — so this is per-FRAGMENT Lambert.
   *
   * `MeshLambertMaterial` shades per VERTEX; the vendored r128 build assembles
   * `lights_lambert_vertex` for it and `lights_phong_fragment` for this one. A wall is two
   * triangles, so a Lambert wall's lighting is computed at four corners and interpolated
   * across ten metres — which is why every interior surface was one flat value and why
   * adding lamps to the rooms would have changed almost nothing. See lighting.js.
   *
   * `shininess: 0` with a black specular gives Phong's diffuse term and nothing else, which
   * is the shading model this game already had, evaluated where it can actually be seen.
   * materials.js's surface() overrides both per kind; a bare matte() stays diffuse-only. */
  const m = new THREE.MeshPhongMaterial({
    color: colour,
    specular: 0x000000,
    shininess: 0,
    ...rest,
  });
  if (m.color && m.color.convertSRGBToLinear) m.color.convertSRGBToLinear();
  /* THE TOY PALETTE, applied at the one place every flat colour passes through. The art
   * direction (chosen 2026-08-25 from three photographed options) celebrates the primitive
   * shapes with saturated colour; textured surfaces are untouched (their colour is white)
   * and carry their look in the canvas art instead. */
  if (m.color && !rest.map && toy !== false) {
    const hsl = { h: 0, s: 0, l: 0 };
    m.color.getHSL(hsl);
    if (hsl.s > TOY.minSat) {
      m.color.setHSL(hsl.h,
        Math.min(TOY.satCap, hsl.s * TOY.satGain + TOY.satAdd),
        Math.min(TOY.lightCap, hsl.l * TOY.lightGain));
    }
  }
  return m;
}

/** @deprecated Kept so nothing breaks mid-refactor; `matte` says what it now builds. */
export const lambert = matte;

/** As `lambert`, unlit. */
export function basic(colour, opts = {}) {
  const THREE = window.THREE;
  const m = new THREE.MeshBasicMaterial({ color: colour, ...opts });
  if (m.color && m.color.convertSRGBToLinear) m.color.convertSRGBToLinear();
  return m;
}

/** Deterministic noise, so a texture looks the same on every machine and every reload.
 *  `Math.random` here would mean a screenshot could never be reproduced. */
function rnd(i) {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/* ── drawing helpers (the vocabulary every generator is written in) ─────────────── */

function heightMid() { return 'rgb(' + TEX.heightMid + ',' + TEX.heightMid + ',' + TEX.heightMid + ')'; }
function tint(a) { return 'rgba(255,255,255,' + a.toFixed(3) + ')'; }
function shade(a) { return 'rgba(0,0,0,' + a.toFixed(3) + ')'; }
function grey(v) { return 'rgb(' + v + ',' + v + ',' + v + ')'; }

function fill(x, style, W, H) { x.fillStyle = style; x.fillRect(0, 0, W, H); }

/**
 * Draw `fn` under a blur of `px` texels. `ctx.filter` is the cheap path (Chrome, Firefox,
 * headless Chrome); where it is missing (Safari) the feature is drawn crisp — the guard the
 * library asks for. Filters apply per draw call, so many small fills under one `soft()`
 * are cheap; one full-canvas fill under a large blur is not.
 */
function soft(x, px, fn) {
  if (px > 0 && typeof x.filter === 'string') {
    x.filter = 'blur(' + px + 'px)';
    fn();
    x.filter = 'none';
  } else {
    fn();
  }
}

/** A filled ellipse, repeated at its wrapped positions when it reaches a tile edge. */
function ell(x, cx, cy, rx, ry, rot, W, H, margin = 4) {
  const reach = Math.max(rx, ry) + margin;
  for (const ox of [0, -W, W]) {
    if (cx + ox + reach < 0 || cx + ox - reach > W) continue;
    for (const oy of [0, -H, H]) {
      if (cy + oy + reach < 0 || cy + oy - reach > H) continue;
      x.beginPath(); x.ellipse(cx + ox, cy + oy, rx, ry, rot, 0, TAU); x.fill();
    }
  }
}

/** A wobbling horizontal line (wood grain, scuffs): y0 + amp·sin over x. */
function wobble(x, y0, W, amp, phase, freq, width, style) {
  x.strokeStyle = style; x.lineWidth = width; x.lineCap = 'round';
  x.beginPath();
  x.moveTo(-2, y0 + Math.sin(phase) * amp);
  for (let px = 0; px <= W + 2; px += 8) x.lineTo(px, y0 + Math.sin(px / freq + phase) * amp);
  x.stroke();
}

/** Diagonal strokes at a fixed period across the whole tile (twill, denim). */
function twill(x, W, H, period, width, style, offset = 0) {
  x.strokeStyle = style; x.lineWidth = width; x.lineCap = 'butt';
  x.beginPath();
  for (let k = -H; k < W + H; k += period) {
    x.moveTo(k + offset, H + 2); x.lineTo(k + offset + H + 4, -2);
  }
  x.stroke();
}

/** Stencil text, centred at (cx, cy). */
function stencil(x, text, cx, cy, px, style) {
  x.save();
  x.fillStyle = style;
  x.font = 'bold ' + px + 'px Impact, Haettenschweiler, "Arial Black", sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, cx, cy);
  x.restore();
}

/* ── ground and outdoor surfaces ───────────────────────────────────────────────── */

const GRASS = Object.freeze({ hue: 96, sat: 0.42, light: 0.40, band: 0.04, clumps: 180, rMin: 3, rMax: 7 });

/** A lawn: 2 m tile (repeat 200 on the 400 m plane). Mown bands, then clumps in three tones. */
export function texGrass() {
  return texSet(TEX.size, TEX.size, 'grassV3', (c, W, H) => {
    const { a, h } = c;
    fill(a, hslCss(GRASS.hue, GRASS.sat, GRASS.light), W, H);
    // Two 1 m mown bands, so a lawn reads as a lawn before it reads as noise.
    a.fillStyle = tint(GRASS.band); a.fillRect(0, 0, W, H / 2);
    a.fillStyle = shade(GRASS.band); a.fillRect(0, H / 2, W, H / 2);
    // The library allows grass a wider hue span than the 6° rule: 92-104 in three tones.
    const tones = [hslCss(94, 0.40, 0.34), hslCss(98, 0.40, 0.44), hslCss(102, 0.40, 0.50)];
    const list = [];
    for (let i = 0; i < GRASS.clumps; i++) {
      const rx = GRASS.rMin + rnd(i + 99) * (GRASS.rMax - GRASS.rMin);
      list.push({ x: rnd(i) * W, y: rnd(i + 7000) * H, rx, ry: rx * 0.6, rot: rnd(i + 31) * Math.PI, tone: i % 3 });
    }
    soft(a, TEX.softPx, () => {
      for (const f of list) { a.fillStyle = tones[f.tone]; ell(a, f.x, f.y, f.rx, f.ry, f.rot, W, H); }
    });
    if (h) soft(h, 2, () => {
      h.fillStyle = tint(0.35);
      for (const f of list) ell(h, f.x, f.y, f.rx, f.ry, f.rot, W, H);
    });
  });
}

const ASPHALT = Object.freeze({ base: '#4c4d54', grains: 120, rMin: 1.5, rMax: 2.5, lift: 0.06, patchR: 90, patchA: 0.12 });

/** Asphalt: aggregate and one soft dark patch. The oil stain is a decal in scene.js now. */
export function texAsphalt() {
  return texSet(TEX.size, TEX.size, 'asphaltV3', (c, W, H) => {
    const { a, h } = c;
    fill(a, ASPHALT.base, W, H);
    const list = [];
    for (let i = 0; i < ASPHALT.grains; i++) {
      const rx = ASPHALT.rMin + rnd(i + 3000) * (ASPHALT.rMax - ASPHALT.rMin);
      list.push({ x: rnd(i) * W, y: rnd(i + 3000) * H, rx, ry: rx * 0.8, rot: rnd(i + 5) * Math.PI, up: rnd(i + 9) < 0.5 });
    }
    soft(a, TEX.softPx, () => {
      for (const f of list) { a.fillStyle = f.up ? tint(ASPHALT.lift) : shade(ASPHALT.lift); ell(a, f.x, f.y, f.rx, f.ry, f.rot, W, H); }
    });
    const g = a.createRadialGradient(W * 0.36, H * 0.60, 2, W * 0.36, H * 0.60, ASPHALT.patchR);
    g.addColorStop(0, shade(ASPHALT.patchA)); g.addColorStop(1, shade(0));
    a.fillStyle = g; a.fillRect(0, 0, W, H);
    if (h) soft(h, 1, () => {
      h.fillStyle = tint(0.30);
      for (const f of list) ell(h, f.x, f.y, f.rx, f.ry, f.rot, W, H);
    });
  });
}

const CONCRETE = Object.freeze({ base: '#9a968e', grains: 90, rMin: 2, rMax: 3, lift: 0.04, joint: 4, jointA: 0.22, edgeA: 0.18 });

/** Concrete: soft aggregate, a joint line each way with a light edge. */
export function texConcrete() {
  return texSet(TEX.size, TEX.size, 'concreteV3', (c, W, H) => {
    const { a, h } = c;
    fill(a, CONCRETE.base, W, H);
    const list = [];
    for (let i = 0; i < CONCRETE.grains; i++) {
      const rx = CONCRETE.rMin + rnd(i + 55) * (CONCRETE.rMax - CONCRETE.rMin);
      list.push({ x: rnd(i + 5) * W, y: rnd(i + 55) * H, rx, ry: rx * 0.85, rot: rnd(i + 7) * Math.PI, up: rnd(i) < 0.5 });
    }
    soft(a, TEX.softPx, () => {
      for (const f of list) { a.fillStyle = f.up ? tint(CONCRETE.lift) : shade(CONCRETE.lift); ell(a, f.x, f.y, f.rx, f.ry, f.rot, W, H); }
    });
    const j = CONCRETE.joint;
    soft(a, 1, () => {
      a.fillStyle = shade(CONCRETE.jointA);
      a.fillRect(0, H / 2 - j / 2, W, j); a.fillRect(W / 2 - j / 2, 0, j, H);
    });
    a.fillStyle = tint(CONCRETE.edgeA);
    a.fillRect(0, H / 2 + j / 2, W, 1); a.fillRect(W / 2 + j / 2, 0, 1, H);
    if (h) {
      soft(h, 1, () => {
        h.fillStyle = shade(0.6);
        h.fillRect(0, H / 2 - j / 2, W, j); h.fillRect(W / 2 - j / 2, 0, j, H);
      });
      soft(h, 1, () => { h.fillStyle = tint(0.2); for (const f of list) ell(h, f.x, f.y, f.rx, f.ry, f.rot, W, H); });
    }
  });
}

/* ── the house ─────────────────────────────────────────────────────────────────── */

const SIDING = Object.freeze({ laps: 12, sat: 0.13, jitter: 0.02, lapPx: 6, lapA: 0.28 });

/** Lapped siding: 12 boards per tile (512² per 1.6 m of height), a soft lap shadow. */
export function texSiding(hue, light) {
  return texSet(TEX.size, TEX.size, 'sidingV3|' + hue + '|' + light, (c, W, H) => {
    const { a, h } = c;
    const bh = H / SIDING.laps, lp = SIDING.lapPx;
    for (let i = 0; i < SIDING.laps; i++) {
      const y = i * bh;
      const tier = ((i * 31) % 3) - 1;                // three tiers: -1, 0, +1
      a.fillStyle = hslCss(hue, SIDING.sat, light + tier * SIDING.jitter);
      a.fillRect(0, y, W, bh + 1);
      // A lap shadow under each board is what makes siding read as boards, not stripes.
      const g = a.createLinearGradient(0, y + bh, 0, y + bh + lp);
      g.addColorStop(0, shade(SIDING.lapA)); g.addColorStop(1, shade(0));
      a.fillStyle = g; a.fillRect(0, y + bh, W, lp);
      if (i === SIDING.laps - 1) {
        const g0 = a.createLinearGradient(0, 0, 0, lp);
        g0.addColorStop(0, shade(SIDING.lapA)); g0.addColorStop(1, shade(0));
        a.fillStyle = g0; a.fillRect(0, 0, W, lp);
      }
      if (h) {
        // Bright above the lap line (the board's proud bottom edge), dark below, 6 px ramp.
        const up = h.createLinearGradient(0, y + bh - lp, 0, y + bh);
        up.addColorStop(0, tint(0)); up.addColorStop(1, tint(0.55));
        h.fillStyle = up; h.fillRect(0, y + bh - lp, W, lp);
        const dn = h.createLinearGradient(0, (y + bh) % H, 0, ((y + bh) % H) + lp);
        dn.addColorStop(0, shade(0.55)); dn.addColorStop(1, shade(0));
        h.fillStyle = dn; h.fillRect(0, (y + bh) % H, W, lp);
      }
    }
  });
}

const SHINGLE = Object.freeze({ rows: 10, tabs: 8, sat: 0.14, light: 0.24, tier: 0.04, tabPx: 5, tabA: 0.30, lapPx: 4, lapA: 0.40 });

/** Roof shingles: staggered rows of tabs with a soft lap shadow. */
export function texShingle(hue) {
  return texSet(TEX.size, TEX.size, 'shingleV3|' + hue, (c, W, H) => {
    const { a, h } = c;
    const rh = H / SHINGLE.rows, tw = W / SHINGLE.tabs;
    for (let i = 0; i < SHINGLE.rows; i++) {
      const y = i * rh;
      const tier = ((i * 29) % 3) - 1;
      a.fillStyle = hslCss(hue, SHINGLE.sat, SHINGLE.light + tier * SHINGLE.tier);
      a.fillRect(0, y, W, rh + 1);
    }
    soft(a, 1, () => {
      for (let i = 0; i < SHINGLE.rows; i++) {
        const y = i * rh, off = (i % 2) ? tw / 2 : 0;
        a.fillStyle = shade(SHINGLE.tabA);
        for (let t = 0; t < SHINGLE.tabs; t++) {
          const tx = (off + t * tw) % W;
          a.fillRect(tx - SHINGLE.tabPx / 2, y, SHINGLE.tabPx, rh);
          if (tx - SHINGLE.tabPx / 2 < 0) a.fillRect(tx - SHINGLE.tabPx / 2 + W, y, SHINGLE.tabPx, rh);
        }
        const g = a.createLinearGradient(0, y + rh - SHINGLE.lapPx, 0, y + rh);
        g.addColorStop(0, shade(0)); g.addColorStop(1, shade(SHINGLE.lapA));
        a.fillStyle = g; a.fillRect(0, y + rh - SHINGLE.lapPx, W, SHINGLE.lapPx);
      }
    });
    if (h) soft(h, 1, () => {
      for (let i = 0; i < SHINGLE.rows; i++) {
        const y = i * rh, off = (i % 2) ? tw / 2 : 0;
        h.fillStyle = shade(0.6); h.fillRect(0, y + rh - SHINGLE.lapPx, W, SHINGLE.lapPx);
        h.fillStyle = shade(0.35);
        for (let t = 0; t < SHINGLE.tabs; t++) {
          const tx = (off + t * tw) % W;
          h.fillRect(tx - SHINGLE.tabPx / 2, y, SHINGLE.tabPx, rh);
        }
      }
    });
  });
}

const BRICK = Object.freeze({ rows: 12, cols: 4, mortar: '#9a9187', mortarPx: 4, sat: 0.40, lights: [0.36, 0.40, 0.44], jitter: 0.06, edgePx: 2, mortarHeight: 90 });

/** Brick: three tones with per-brick jitter, blurred edges, recessed mortar in the height. */
export function texBrick(hue = 14) {
  return texSet(TEX.size, TEX.size, 'brickV3|' + hue, (c, W, H) => {
    const { a, h } = c;
    fill(a, BRICK.mortar, W, H);
    if (h) fill(h, grey(BRICK.mortarHeight), W, H);
    const rh = H / BRICK.rows, bw = W / BRICK.cols, m = BRICK.mortarPx / 2;
    const list = [];
    for (let r = 0; r < BRICK.rows; r++) {
      const off = (r % 2) ? bw / 2 : 0;
      for (let col = -1; col < BRICK.cols + 1; col++) {
        const L = BRICK.lights[(r * 7 + col * 3 + 300) % 3] + (rnd(r * 13 + col * 7 + 100) - 0.5) * BRICK.jitter;
        list.push({ x: col * bw + off + m, y: r * rh + m, w: bw - BRICK.mortarPx, h: rh - BRICK.mortarPx, L });
      }
    }
    soft(a, BRICK.edgePx, () => {
      for (const b of list) { a.fillStyle = hslCss(hue, BRICK.sat, Math.max(0.2, Math.min(0.6, b.L))); a.fillRect(b.x, b.y, b.w, b.h); }
    });
    if (h) soft(h, 1, () => { h.fillStyle = '#ffffff'; for (const b of list) h.fillRect(b.x, b.y, b.w, b.h); });
  });
}

const PLASTER = Object.freeze({ sat: 0.16, blobs: 3, rMin: 60, rMax: 90, mottle: 0.02, blur: 20, floorA: 0.30, floorFrom: 0.72, topA: 0.20, topTo: 0.14 });

/**
 * Interior wall: painted plaster with CONTACT DARKENING baked in.
 *
 * The baked gradient is doing work no light can do here. Ambient occlusion is the darkening
 * where surfaces meet, and a real-time rig with no AO pass has none — so a wall meets a floor
 * at a hairline and the room reads as a set of separate planes. Painting the bottom of the
 * wall darker is the cheapest honest version, and it is the same idea as the dash pattern on
 * a casualty ring (Dev\INDEX.md): carry the information in something other than the light.
 *
 * Phase 15: the skirting board LEFT this canvas — it is geometry now (scene.js, a
 * paintedTimber strip), so the texture tiles horizontally at any wall length without the
 * board's shadow line changing thickness. The speckle went too (header, 1.); three blurred
 * mottle blobs at ±2% carry the "painted, not printed" read.
 *
 * ⚠ It only lands correctly at a VERTICAL REPEAT OF 1. A wall's UV runs 0..1 over its own
 * height, so ry=1.4 tiles the gradient one and a half times and paints a dark band across
 * the middle of the room.
 */
export function texPlaster(hue = 38, light = 0.86) {
  return texSet(TEX.size, TEX.size, 'plasterV3|' + hue + '|' + light, (c, W, H) => {
    const { a, h } = c;
    fill(a, hslCss(hue, PLASTER.sat, light), W, H);
    const list = [];
    for (let i = 0; i < PLASTER.blobs; i++) {
      const r = PLASTER.rMin + rnd(i + 400) * (PLASTER.rMax - PLASTER.rMin);
      list.push({ x: rnd(i + 401) * W, y: H * (0.15 + 0.55 * rnd(i + 402)), rx: r, ry: r * 0.7, rot: rnd(i + 403) * Math.PI, up: i % 2 === 0 });
    }
    soft(a, PLASTER.blur, () => {
      for (const f of list) { a.fillStyle = f.up ? tint(PLASTER.mottle) : shade(PLASTER.mottle); ell(a, f.x, f.y, f.rx, f.ry, f.rot, W, H, PLASTER.blur * 2); }
    });
    // Contact darkening at the floor, and a lighter touch where the ceiling meets.
    const lo = a.createLinearGradient(0, H * PLASTER.floorFrom, 0, H);
    lo.addColorStop(0, 'rgba(24,20,16,0)'); lo.addColorStop(1, 'rgba(24,20,16,' + PLASTER.floorA + ')');
    a.fillStyle = lo; a.fillRect(0, H * PLASTER.floorFrom, W, H * (1 - PLASTER.floorFrom));
    const hi = a.createLinearGradient(0, 0, 0, H * PLASTER.topTo);
    hi.addColorStop(0, 'rgba(24,20,16,' + PLASTER.topA + ')'); hi.addColorStop(1, 'rgba(24,20,16,0)');
    a.fillStyle = hi; a.fillRect(0, 0, W, H * PLASTER.topTo);
    if (h) soft(h, PLASTER.blur, () => {
      for (const f of list) { h.fillStyle = f.up ? tint(0.12) : shade(0.12); ell(h, f.x, f.y, f.rx, f.ry, f.rot, W, H, PLASTER.blur * 2); }
    });
  });
}

const CEILING = Object.freeze({ sat: 0.10, edge: 0.72, from: 0.55 });

/** Ceiling: flat with a radial edge vignette to 0.72 at the border. Un-tiled (ClampToEdge)
 *  on the ceiling box, so the perimeter darkens where it meets the walls. */
export function texCeiling(hue = 40, light = 0.92) {
  return texSet(TEX.size, TEX.size, 'ceilingV1|' + hue + '|' + light, (c, W, H) => {
    const { a } = c;
    fill(a, hslCss(hue, CEILING.sat, light), W, H);
    const g = a.createRadialGradient(W / 2, H / 2, 1, W / 2, H / 2, W * 0.72);
    g.addColorStop(0, shade(0)); g.addColorStop(CEILING.from, shade(0)); g.addColorStop(1, shade(1 - CEILING.edge));
    a.fillStyle = g; a.fillRect(0, 0, W, H);
  }, { height: false });
}

const BOARDS = Object.freeze({
  planks: 6, sat: 0.32, floorL: 0.40, deckL: 0.34, deckHue: 32, tier: 0.03,
  seamPx: 3, seamA: 0.45, seamLightA: 0.18, grainPer: 5, grainMin: 2, grainMax: 6, grainA: 0.14,
  knots: 4, scuffs: 16, scuffA: 0.12,
});

/** Raw plank / ply: floors, ramp, platform, truck deck. 512² per 1.0 m (RENDER.look.plankMetres). */
export function texBoards(hue, variant = 'floor') {
  const deck = variant === 'deck';
  const L = deck ? BOARDS.deckL : BOARDS.floorL;
  return texSet(TEX.size, TEX.size, 'boardsV3|' + hue + '|' + variant, (c, W, H) => {
    const { a, h } = c;
    const rh = H / BOARDS.planks;
    const grains = [], knots = [], seams = [];
    for (let i = 0; i < BOARDS.planks; i++) {
      const y = i * rh;
      const tier = ((i * 37) % 3) - 1;
      a.fillStyle = hslCss(hue, BOARDS.sat, L + tier * BOARDS.tier);
      a.fillRect(0, y, W, rh + 1);
      for (let g = 0; g < BOARDS.grainPer; g++) {
        const s = i * 100 + g * 7;
        grains.push({ y: y + 6 + rnd(s) * (rh - 12), amp: 1 + rnd(s + 1) * 2, ph: rnd(s + 2) * TAU, fr: 40 + rnd(s + 3) * 50,
                      w: BOARDS.grainMin + rnd(s + 4) * (BOARDS.grainMax - BOARDS.grainMin), a: BOARDS.grainA * (0.6 + rnd(s + 5) * 0.8) });
      }
      seams.push({ x: (i * 167 + 40) % W, y, h: rh });
    }
    for (let k = 0; k < BOARDS.knots; k++) {
      const p = Math.floor(rnd(k + 900) * BOARDS.planks);
      knots.push({ x: rnd(k + 901) * W, y: p * rh + rh * (0.3 + rnd(k + 902) * 0.4), r: 5 + rnd(k + 903) * 4 });
    }
    soft(a, 1, () => { for (const g of grains) wobble(a, g.y, W, g.amp, g.ph, g.fr, g.w, shade(g.a)); });
    soft(a, 1, () => {
      for (const k of knots) {
        for (let r = 3; r >= 1; r--) {
          a.strokeStyle = shade(0.10 + r * 0.05); a.lineWidth = 2;
          a.beginPath(); a.ellipse(k.x, k.y, k.r * r * 0.6, k.r * r * 0.35, 0, 0, TAU); a.stroke();
        }
      }
    });
    // Plank seams: 3 px dark along the bottom edge, 1 px light on the edge above it.
    for (let i = 0; i < BOARDS.planks; i++) {
      const y = i * rh;
      a.fillStyle = shade(BOARDS.seamA); a.fillRect(0, y + rh - BOARDS.seamPx, W, BOARDS.seamPx);
      a.fillStyle = tint(BOARDS.seamLightA); a.fillRect(0, y + rh - BOARDS.seamPx - 1, W, 1);
    }
    for (const s of seams) {
      a.fillStyle = shade(BOARDS.seamA); a.fillRect(s.x, s.y, BOARDS.seamPx, s.h);
      a.fillStyle = tint(BOARDS.seamLightA); a.fillRect(s.x + BOARDS.seamPx, s.y, 1, s.h);
    }
    if (deck) soft(a, 1.5, () => {
      for (let i = 0; i < BOARDS.scuffs; i++) {
        const sx = rnd(i + 6) * W, sy = rnd(i + 66) * H;
        a.strokeStyle = shade(BOARDS.scuffA); a.lineWidth = 3 + rnd(i) * 3; a.lineCap = 'round';
        a.beginPath(); a.moveTo(sx, sy); a.lineTo(sx + rnd(i + 1) * 90 - 45, sy + rnd(i + 2) * 16 - 8); a.stroke();
      }
    });
    if (h) {
      soft(h, 1, () => { for (const g of grains) wobble(h, g.y, W, g.amp, g.ph, g.fr, g.w, tint(0.18)); });
      for (let i = 0; i < BOARDS.planks; i++) { h.fillStyle = shade(0.7); h.fillRect(0, i * rh + rh - BOARDS.seamPx, W, BOARDS.seamPx); }
      for (const s of seams) { h.fillStyle = shade(0.7); h.fillRect(s.x, s.y, BOARDS.seamPx, s.h); }
    }
  });
}

/** A flat painted fill. No speckle (header, 1.); a colour, not a pattern. */
export function texPaint(hue, sat, light) {
  return canvasTex(TEX.small, TEX.small, 'paintV2|' + hue + '|' + sat + '|' + light, (x, W, H) => {
    fill(x, hslCss(hue, sat, light), W, H);
  });
}

/* ── the things you carry ──────────────────────────────────────────────────────── */

const CARD = Object.freeze({
  sat: 0.38, light: 0.58, grid: 24, gridPx: 3, gridA: 0.02, inset: 10, insetA: 0.18, specLiner: 13,
  stencil: 'rgba(178,44,44,.90)', stencilDark: 'rgba(48,42,34,.62)',
  fragilePx: 60, wayUpPx: 30, heavyPx: 44, arrowHalf: 22, arrowStem: 16, arrowLen: 44,
  seamDark: 6, seamLight: 2, seamA: 0.35, seamLightA: 0.20, flutePx: 8, fluteA: 0.08, crease: 6, creaseA: 0.12,
});

function cardLiner(a, W, H, hue) {
  fill(a, hslCss(hue, CARD.sat, CARD.light), W, H);
  // A faint print grid, the way a liner carries the flute ghost through the paper.
  a.fillStyle = shade(CARD.gridA);
  for (let i = 0; i < W; i += CARD.grid) a.fillRect(i, 0, CARD.gridPx, H);
  a.fillStyle = tint(CARD.gridA);
  for (let i = 0; i < H; i += CARD.grid) a.fillRect(0, i, W, CARD.gridPx);
}

/** A soft inset shadow around the face — replaces phase 14's strokeRect, which aliased. */
function cardInset(a, W, H) {
  const n = CARD.inset;
  const edges = [
    [0, 0, W, n, 0, 0, 0, n], [0, H - n, W, n, 0, H, 0, H - n],
    [0, 0, n, H, 0, 0, n, 0], [W - n, 0, n, H, W, 0, W - n, 0],
  ];
  for (const [x, y, w, hh, x0, y0, x1, y1] of edges) {
    const g = a.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, shade(CARD.insetA)); g.addColorStop(1, shade(0));
    a.fillStyle = g; a.fillRect(x, y, w, hh);
  }
}

/**
 * Cardboard, with a stencil.
 *
 * The single highest-value texture in the game: §13.2's manifest is mostly boxes, so
 * whatever a box looks like is what the game looks like. Flat tan boxes were most of why
 * the build read as a prototype.
 *
 * Phase 15: the LINER IS FLAT. The flutes moved to the lid's cut edge (texCardboardEdge —
 * the only place a real carton shows them) and the tape is geometry (prefabs.js bar()
 * strips in surface('tape')), so this canvas is the printed face alone: kraft, a faint
 * print grid, the stencil at twice phase 14's size, and a soft inset shadow. 'face' UV
 * centres it on every side at every box size. kind 'flat' is the flattened carton by the
 * drive: the liner with one crease. The spec mask is the liner's 0.05.
 */
export function texCardboard(kind = 'plain', hue = 32) {
  return texSet(TEX.size, TEX.size, 'cardV3|' + kind + '|' + hue, (c, W, H) => {
    const { a, s } = c;
    cardLiner(a, W, H, hue);
    cardInset(a, W, H);
    if (kind === 'fragile') {
      /* §7.2's fragility, stencilled on the object rather than shown in a panel. §26.5
       * wants a state to carry text or shape and never colour alone — a red box is exactly
       * the cue a colour-blind player cannot read, so the box says FRAGILE. */
      stencil(a, 'FRAGILE', W / 2, H * 0.30, CARD.fragilePx, CARD.stencil);
      stencil(a, 'THIS WAY UP', W / 2, H * 0.30 + CARD.fragilePx * 0.8, CARD.wayUpPx, CARD.stencil);
      // Two arrows, because "this way up" without arrows is just a sentence.
      a.fillStyle = CARD.stencil;
      for (const ax of [W * 0.20, W * 0.80]) {
        a.beginPath();
        a.moveTo(ax, H * 0.60); a.lineTo(ax - CARD.arrowHalf, H * 0.60 + CARD.arrowHalf * 1.3); a.lineTo(ax + CARD.arrowHalf, H * 0.60 + CARD.arrowHalf * 1.3);
        a.closePath(); a.fill();
        a.fillRect(ax - CARD.arrowStem / 2, H * 0.60 + CARD.arrowHalf * 1.3, CARD.arrowStem, CARD.arrowLen);
      }
    } else if (kind === 'heavy') {
      stencil(a, 'HEAVY', W / 2, H * 0.72, CARD.heavyPx, CARD.stencilDark);
    } else if (kind === 'flat') {
      soft(a, 2, () => { a.fillStyle = shade(CARD.creaseA); a.fillRect(0, H / 2 - CARD.crease / 2, W, CARD.crease); });
    }
    if (s) fill(s, grey(CARD.specLiner), W, H);
  }, { height: false, spec: true });
}

/** The lid cap face: liner + the flap seam down the centre, with a soft groove in the height. */
export function texCardboardLid(kind = 'plain', hue = 32) {
  return texSet(TEX.size, TEX.size, 'cardLidV1|' + kind + '|' + hue, (c, W, H) => {
    const { a, h, s } = c;
    cardLiner(a, W, H, hue);
    cardInset(a, W, H);
    // The seam runs along z on the box (u = 0.5 on the slab's top face, see prefabs.js).
    a.fillStyle = shade(CARD.seamA); a.fillRect(W / 2 - CARD.seamDark / 2, 0, CARD.seamDark, H);
    a.fillStyle = tint(CARD.seamLightA); a.fillRect(W / 2 + CARD.seamDark / 2, 0, CARD.seamLight, H);
    if (h) soft(h, 1.5, () => { h.fillStyle = shade(0.6); h.fillRect(W / 2 - 2, 0, 4, H); });
    if (s) fill(s, grey(CARD.specLiner), W, H);
  }, { spec: true });
}

/** The CUT edge of a carton: liner with 8 px flute stripes — the only place flutes live. */
export function texCardboardEdge(hue = 32) {
  return texSet(TEX.half, TEX.half, 'cardEdgeV1|' + hue, (c, W, H) => {
    const { a, h, s } = c;
    fill(a, hslCss(hue, CARD.sat, CARD.light), W, H);
    const p = CARD.flutePx;
    soft(a, 1.5, () => {
      for (let x0 = 0; x0 < W; x0 += p * 2) {
        a.fillStyle = tint(CARD.fluteA); a.fillRect(x0, 0, p, H);
        a.fillStyle = shade(CARD.fluteA); a.fillRect(x0 + p, 0, p, H);
      }
    });
    if (h) soft(h, 1.5, () => {
      for (let x0 = 0; x0 < W; x0 += p * 2) {
        h.fillStyle = tint(0.5); h.fillRect(x0, 0, p, H);
        h.fillStyle = shade(0.5); h.fillRect(x0 + p, 0, p, H);
      }
    });
    if (s) fill(s, grey(CARD.specLiner), W, H);
  }, { spec: true });
}

const TAPE = Object.freeze({ colour: '#d9cfb2', stripe: 6, stripeA: 0.18 });

/** Packing tape: the flat colour with a lighter centre stripe. Toy boost off (kind 'tape'). */
export function texTape() {
  return canvasTex(TEX.tiny, TEX.tiny, 'tapeV1', (x, W, H) => {
    fill(x, TAPE.colour, W, H);
    x.fillStyle = tint(TAPE.stripeA); x.fillRect(0, H / 2 - TAPE.stripe / 2, W, TAPE.stripe);
  });
}

const FABRIC = Object.freeze({ sat: 0.26, period: 12, stroke: 6, twillA: 0.06, slub: 24, slubR: 2, slubA: 0.08 });

/** Upholstery — a two-tone twill that reads as fabric at arm's length. 256² per 0.5 m. */
export function texFabric(hue, light = 0.42) {
  return texSet(TEX.half, TEX.half, 'fabricV3|' + hue + '|' + light, (c, W, H) => {
    const { a, h } = c;
    fill(a, hslCss(hue, FABRIC.sat, light), W, H);
    soft(a, TEX.softPx, () => {
      twill(a, W, H, FABRIC.period, FABRIC.stroke, tint(FABRIC.twillA), 0);
      twill(a, W, H, FABRIC.period, FABRIC.stroke, shade(FABRIC.twillA), FABRIC.period / 2);
    });
    const slubs = [];
    for (let y = FABRIC.slub / 2; y < H; y += FABRIC.slub) {
      for (let x0 = FABRIC.slub / 2; x0 < W; x0 += FABRIC.slub) {
        slubs.push({ x: x0 + (rnd(x0 * 3 + y) - 0.5) * 6, y: y + (rnd(x0 + y * 5) - 0.5) * 6 });
      }
    }
    soft(a, 1, () => { a.fillStyle = shade(FABRIC.slubA); for (const p of slubs) ell(a, p.x, p.y, FABRIC.slubR, FABRIC.slubR, 0, W, H); });
    if (h) {
      soft(h, TEX.softPx, () => { twill(h, W, H, FABRIC.period, FABRIC.stroke, tint(0.25), 0); });
      soft(h, 1, () => { h.fillStyle = tint(0.3); for (const p of slubs) ell(h, p.x, p.y, FABRIC.slubR, FABRIC.slubR, 0, W, H); });
    }
  });
}

const TICKING = Object.freeze({ hue: 40, sat: 0.30, light: 0.84, pipingLift: 0.04, stripe: 24, stripeA: 0.08, pin: 3, pinA: 0.10, dimpleR: 16, dimpleA: 0.45, dimpleBlur: 6, cols: 4, rows: 2 });

/** Mattress ticking. 'piping' is one tier lighter at the SAME density (no stretched bricks). */
export function texTicking(variant = 'body') {
  const piping = variant === 'piping';
  return texSet(TEX.half, TEX.half, 'tickingV1|' + variant, (c, W, H) => {
    const { a, h } = c;
    fill(a, hslCss(TICKING.hue, TICKING.sat, TICKING.light + (piping ? TICKING.pipingLift : 0)), W, H);
    const p = TICKING.stripe * 2;
    for (let x0 = 0; x0 < W; x0 += p) {
      a.fillStyle = shade(TICKING.stripeA); a.fillRect(x0, 0, TICKING.stripe, H);
      a.fillStyle = shade(TICKING.pinA); a.fillRect(x0 + TICKING.stripe + TICKING.stripe / 2 - TICKING.pin / 2, 0, TICKING.pin, H);
    }
    if (h && !piping) soft(h, TICKING.dimpleBlur, () => {
      h.fillStyle = shade(TICKING.dimpleA);
      for (let r = 0; r < TICKING.rows; r++) {
        for (let q = 0; q < TICKING.cols; q++) {
          ell(h, (q + 0.5) * (W / TICKING.cols), (r + 0.5) * (H / TICKING.rows), TICKING.dimpleR, TICKING.dimpleR, 0, W, H, TICKING.dimpleBlur * 2);
        }
      }
    });
  });
}

const RUG = Object.freeze({ sat: 0.35, light: 0.36, bands: [[24, 0.28], [24, 0.48], [16, 0.40]], pile: 500, pileR: 5, pileA: 0.05 });

/** A rug: three-band border and a coarse pile stipple. One repeat over the rug (ClampToEdge). */
export function texRug(hue = 210) {
  return texSet(TEX.size, TEX.size, 'rugV1|' + hue, (c, W, H) => {
    const { a, h } = c;
    fill(a, hslCss(hue, RUG.sat, RUG.light), W, H);
    let inset = 0;
    for (const [w, L] of RUG.bands) {
      a.fillStyle = hslCss(hue, RUG.sat, L);
      a.fillRect(inset, inset, W - inset * 2, w); a.fillRect(inset, H - inset - w, W - inset * 2, w);
      a.fillRect(inset, inset, w, H - inset * 2); a.fillRect(W - inset - w, inset, w, H - inset * 2);
      inset += w;
    }
    const list = [];
    for (let i = 0; i < RUG.pile; i++) list.push({ x: rnd(i + 700) * W, y: rnd(i + 1700) * H, up: rnd(i) < 0.5 });
    soft(a, 1, () => { for (const p of list) { a.fillStyle = p.up ? tint(RUG.pileA) : shade(RUG.pileA); ell(a, p.x, p.y, RUG.pileR, RUG.pileR * 0.8, 0, W, H); } });
    if (h) soft(h, 1, () => { for (const p of list) { h.fillStyle = p.up ? tint(0.3) : shade(0.3); ell(h, p.x, p.y, RUG.pileR, RUG.pileR * 0.8, 0, W, H); } });
  });
}

const QUILT = Object.freeze({ sat: 0.38, light: 0.42, cell: 32, tone: 0.04, stitch: 3, stitchA: 0.08 });

/** A moving blanket: purple two-tone with a soft diamond stitch grid. */
export function texQuilt(hue = 268) {
  return texSet(TEX.half, TEX.half, 'quiltV1|' + hue, (c, W, H) => {
    const { a, h } = c;
    fill(a, hslCss(hue, QUILT.sat, QUILT.light), W, H);
    const p = QUILT.cell;
    // Two-tone: alternate diamonds lifted, so the stitch grid has something to sit on.
    a.fillStyle = tint(QUILT.tone);
    for (let y = 0; y < H; y += p) {
      for (let x0 = 0; x0 < W; x0 += p) {
        if (((x0 / p + y / p) % 2) === 0) {
          a.beginPath(); a.moveTo(x0 + p / 2, y); a.lineTo(x0 + p, y + p / 2); a.lineTo(x0 + p / 2, y + p); a.lineTo(x0, y + p / 2); a.closePath(); a.fill();
        }
      }
    }
    const grid = (x, style) => {
      x.strokeStyle = style; x.lineWidth = QUILT.stitch; x.lineCap = 'butt';
      x.beginPath();
      for (let k = -H; k < W + H; k += p) { x.moveTo(k, -2); x.lineTo(k + H + 4, H + 2); x.moveTo(k, H + 2); x.lineTo(k + H + 4, -2); }
      x.stroke();
    };
    soft(a, TEX.softPx, () => grid(a, shade(QUILT.stitchA)));
    if (h) soft(h, TEX.softPx, () => grid(h, shade(0.5)));
  });
}

const DENIM = Object.freeze({ sat: 0.30, period: 6, stroke: 3, twillA: 0.07 });

/** Work trousers / denim: a 6 px twill (~8 mm on a 0.17 m leg at repeat 6). */
export function texDenim(hue = 220, light = 0.28) {
  return texSet(TEX.small, TEX.small, 'denimV3|' + hue + '|' + light, (c, W, H) => {
    const { a, h } = c;
    fill(a, hslCss(hue, DENIM.sat, light), W, H);
    soft(a, 0.8, () => {
      twill(a, W, H, DENIM.period, DENIM.stroke, tint(DENIM.twillA), 0);
      twill(a, W, H, DENIM.period, DENIM.stroke, shade(DENIM.twillA), DENIM.period / 2);
    });
    if (h) soft(h, 0.8, () => twill(h, W, H, DENIM.period, DENIM.stroke, tint(0.35), 0));
  });
}

const WEAVE = Object.freeze({ cell: 10, a: 0.22 });

/** A generic cloth weave, HEIGHT ONLY — the shirt keeps its per-player colour. */
export function texWeave() {
  return heightTex(TEX.small, TEX.small, 'weaveV1', (x, W, H) => {
    const p = WEAVE.cell;
    soft(x, 1, () => {
      for (let y = 0; y < H; y += p) {
        for (let x0 = 0; x0 < W; x0 += p) {
          const over = ((x0 / p + y / p) % 2) === 0;
          x.fillStyle = tint(WEAVE.a); x.fillRect(x0 + 1, y + 1, over ? p - 2 : p / 2 - 1, over ? p / 2 - 1 : p - 2);
          x.fillStyle = shade(WEAVE.a); x.fillRect(over ? x0 + 1 : x0 + p / 2, over ? y + p / 2 : y + 1, over ? p - 2 : p / 2 - 1, over ? p / 2 - 1 : p - 2);
        }
      }
    });
  });
}

const HIVIS = Object.freeze({ sat: 0.92, light: 0.55, bands: [0.30, 0.62], bandH: 26, band: '#cfd6dd', hiA: 0.45, hiPx: 8, loA: 0.20, loPx: 4, specBase: 38, specBand: 230 });

/** Hi-vis: fluorescent with two silver bands. The spec mask makes the bands the mover's sparkle. */
export function texHiVis(hue = 66) {
  return texSet(TEX.half, TEX.half, 'hivisV3|' + hue, (c, W, H) => {
    const { a, s } = c;
    fill(a, hslCss(hue, HIVIS.sat, HIVIS.light), W, H);
    if (s) fill(s, grey(HIVIS.specBase), W, H);
    for (const f of HIVIS.bands) {
      const y = H * f;
      a.fillStyle = HIVIS.band; a.fillRect(0, y, W, HIVIS.bandH);
      a.fillStyle = tint(HIVIS.hiA); a.fillRect(0, y + 6, W, HIVIS.hiPx);
      a.fillStyle = shade(HIVIS.loA); a.fillRect(0, y + HIVIS.bandH, W, HIVIS.loPx);
      if (s) { s.fillStyle = grey(HIVIS.specBand); s.fillRect(0, y, W, HIVIS.bandH); }
    }
  }, { height: false, spec: true });
}

/* ── wood and metal ────────────────────────────────────────────────────────────── */

const WOOD = Object.freeze({
  walnut: { hue: 22, sat: 0.38, light: 0.30, grain: 9, gap: 1.0 },
  oak: { hue: 34, sat: 0.34, light: 0.48, grain: 6, gap: 1.4 },
  planks: 2, tier: 0.03, grainMin: 2, grainMax: 5, grainA: 0.16, amp: 3, seamPx: 3, seamA: 0.40, seamLightA: 0.16, knotR: 6,
  numericSplit: 30,
});

/**
 * Furniture wood. `texWood('walnut' | 'oak', light?)`; the phase-14 numeric form
 * `texWood(hue, light)` still works and maps hue < 30 → walnut, else oak. `light` overrides
 * the species' L (the drawer cap slab is "one tier darker": texWood('walnut', 0.27)).
 * 512² per 0.5 m at 'tile' repeat [1, 1]: two planks per tile, a knot per tile.
 */
export function texWood(species = 'walnut', light) {
  let sp = species;
  if (typeof species === 'number') sp = species < WOOD.numericSplit ? 'walnut' : 'oak';
  if (!WOOD[sp]) sp = 'walnut';
  const rec = WOOD[sp];
  const L = light === undefined ? rec.light : light;
  return texSet(TEX.size, TEX.size, 'woodV3|' + sp + '|' + L, (c, W, H) => {
    const { a, h } = c;
    const ph = H / WOOD.planks;
    const grains = [];
    for (let p = 0; p < WOOD.planks; p++) {
      a.fillStyle = hslCss(rec.hue, rec.sat, L + (p % 2 ? WOOD.tier : 0));
      a.fillRect(0, p * ph, W, ph + 1);
      const n = rec.grain;
      for (let g = 0; g < n; g++) {
        const s = p * 50 + g * 3 + 500;
        grains.push({ y: p * ph + 4 + (g + 0.5) * ((ph - 8) / n) + (rnd(s) - 0.5) * 6 * rec.gap, amp: WOOD.amp * (0.5 + rnd(s + 1)),
                      ph: rnd(s + 2) * TAU, fr: 36 + rnd(s + 3) * 40, w: WOOD.grainMin + rnd(s + 4) * (WOOD.grainMax - WOOD.grainMin),
                      a: WOOD.grainA * (0.5 + rnd(s + 5)) });
      }
    }
    soft(a, 1, () => { for (const g of grains) wobble(a, g.y, W, g.amp, g.ph, g.fr, g.w, shade(g.a)); });
    const kx = rnd(sp === 'oak' ? 91 : 90) * W, ky = ph * 0.5 + (rnd(190) - 0.5) * ph * 0.4;
    soft(a, 1, () => {
      for (let r = 4; r >= 1; r--) {
        a.strokeStyle = shade(0.08 + r * 0.05); a.lineWidth = 2;
        a.beginPath(); a.ellipse(kx, ky, WOOD.knotR * r * 0.55, WOOD.knotR * r * 0.32, 0, 0, TAU); a.stroke();
      }
    });
    for (let p = 0; p < WOOD.planks; p++) {
      const y = p * ph + ph - WOOD.seamPx;
      a.fillStyle = shade(WOOD.seamA); a.fillRect(0, y, W, WOOD.seamPx);
      a.fillStyle = tint(WOOD.seamLightA); a.fillRect(0, y - 1, W, 1);
    }
    // Grain grooves along-grain only: the seam is an albedo cue, not a bump, on furniture.
    if (h) soft(h, 1, () => { for (const g of grains) wobble(h, g.y, W, g.amp, g.ph, g.fr, g.w, shade(0.35)); });
  });
}

const STEEL = Object.freeze({ hue: 210, sat: 0.05, lights: [0.78, 0.86, 0.80], streaks: 40, streakPx: 2, lenMin: 48, lenMax: 200, hiA: 0.12, loA: 0.08, grooveA: 0.35 });

/** Brushed appliance steel: a horizontal sheen gradient with long faint streaks. */
export function texSteel(light = 0.80) {
  const d = light - STEEL.lights[2];
  return texSet(TEX.size, TEX.size, 'steelV3|' + light, (c, W, H) => {
    const { a, h } = c;
    const g = a.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, hslCss(STEEL.hue, STEEL.sat, STEEL.lights[0] + d));
    g.addColorStop(0.5, hslCss(STEEL.hue, STEEL.sat, STEEL.lights[1] + d));
    g.addColorStop(1, hslCss(STEEL.hue, STEEL.sat, STEEL.lights[2] + d));
    a.fillStyle = g; a.fillRect(0, 0, W, H);
    const list = [];
    for (let i = 0; i < STEEL.streaks; i++) {
      list.push({ x: rnd(i + 2) * W, y: rnd(i) * H, len: STEEL.lenMin + rnd(i + 1) * (STEEL.lenMax - STEEL.lenMin), up: rnd(i + 3) < 0.5 });
    }
    soft(a, 0.5, () => {
      for (const s of list) {
        a.fillStyle = s.up ? tint(STEEL.hiA) : shade(STEEL.loA);
        a.fillRect(s.x, s.y, s.len, STEEL.streakPx);
        if (s.x + s.len > W) a.fillRect(s.x - W, s.y, s.len, STEEL.streakPx);
      }
    });
    // Grooves 2 px tall × 48-96 px long: an anisotropic read under the sun highlight.
    if (h) soft(h, 0.5, () => {
      h.fillStyle = shade(STEEL.grooveA);
      for (const s of list) {
        const len = Math.min(s.len, STEEL.lenMin * 2);
        h.fillRect(s.x, s.y, len, STEEL.streakPx);
        if (s.x + len > W) h.fillRect(s.x - W, s.y, len, STEEL.streakPx);
      }
    });
  });
}

/** A dark screen with a soft diagonal band, for the television ('face' UV). */
export function texScreen() {
  return canvasTex(TEX.half, TEX.half, 'screenV2', (x, W, H) => {
    fill(x, '#0e1116', W, H);
    const g = x.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, tint(0.14)); g.addColorStop(0.42, tint(0.02)); g.addColorStop(1, tint(0.07));
    x.fillStyle = g; x.fillRect(0, 0, W, H);
  });
}

/** A mirror: mostly a pale reflection gradient; the envMap (kind 'mirror') does the rest. */
export function texMirror() {
  return canvasTex(TEX.half, TEX.half, 'mirrorV2', (x, W, H) => {
    const g = x.createLinearGradient(0, 0, W * 0.4, H);
    g.addColorStop(0, '#cfdce4'); g.addColorStop(0.5, '#aebfc9'); g.addColorStop(1, '#c6d4dc');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    soft(x, 4, () => {
      x.strokeStyle = tint(0.35); x.lineWidth = 12;
      x.beginPath(); x.moveTo(-10, H * 0.8); x.lineTo(W * 0.7, -10); x.stroke();
    });
  });
}

const RUBBER = Object.freeze({ colour: '#2a2d33', band: 6, bandA: 0.10 });

/** Tyre rubber: the flat colour with a soft tread band. */
export function texRubber() {
  return canvasTex(TEX.tiny, TEX.tiny, 'rubberV1', (x, W, H) => {
    fill(x, RUBBER.colour, W, H);
    soft(x, 1, () => {
      x.fillStyle = tint(RUBBER.bandA); x.fillRect(0, H / 2 - RUBBER.band, W, RUBBER.band);
      x.fillStyle = shade(RUBBER.bandA); x.fillRect(0, H / 2, W, RUBBER.band);
    });
  });
}

const FOLIAGE = Object.freeze({ lobes: 220, r: 12, a: 0.35 });

/** Tree lobes and hedge: 12 px leaf lobes, HEIGHT ONLY — the two greens stay flat colours. */
export function texFoliage() {
  return heightTex(TEX.half, TEX.half, 'foliageV1', (x, W, H) => {
    soft(x, 2, () => {
      for (let i = 0; i < FOLIAGE.lobes; i++) {
        x.fillStyle = rnd(i + 3) < 0.6 ? tint(FOLIAGE.a) : shade(FOLIAGE.a * 0.6);
        ell(x, rnd(i) * W, rnd(i + 1) * H, FOLIAGE.r, FOLIAGE.r * 0.7, rnd(i + 2) * Math.PI, W, H);
      }
    });
  });
}

const BARK = Object.freeze({ lines: 24, wMin: 3, wMax: 6, a: 0.40 });

/** Tree trunks: vertical grain HEIGHT ONLY (the walnut recipe turned upright). */
export function texBark() {
  return heightTex(TEX.half, TEX.half, 'barkV1', (x, W, H) => {
    soft(x, 1.5, () => {
      for (let i = 0; i < BARK.lines; i++) {
        const x0 = (i + 0.5) * (W / BARK.lines) + (rnd(i + 20) - 0.5) * 6;
        x.strokeStyle = shade(BARK.a * (0.6 + rnd(i + 21) * 0.8)); x.lineWidth = BARK.wMin + rnd(i + 22) * (BARK.wMax - BARK.wMin); x.lineCap = 'round';
        x.beginPath(); x.moveTo(x0, -2);
        for (let y = 0; y <= H + 2; y += 8) x.lineTo(x0 + Math.sin(y / 30 + i) * 2.5, y);
        x.stroke();
      }
    });
  });
}

/* ── the truck ─────────────────────────────────────────────────────────────────── */

/**
 * The livery. The truck is the hero object of a moving game and it was six grey boxes.
 *
 * Drawn at ~2.1:1 to MATCH the cargo box's long side (4.20 x 2.00 m). A square texture on
 * a 2:1 surface stretches the lettering vertically by a factor of two, which reads as a
 * mistake rather than as a sign — the aspect of the canvas has to match the aspect of the
 * face it lands on, because BoxGeometry maps 0..1 across each face regardless.
 */
export function texTruckSide() {
  return canvasTex(1024, 488, 'trucksideV2', (x, W, H) => {
    x.fillStyle = '#e8e4dc'; x.fillRect(0, 0, W, H);
    // Panel seams, so the side reads as a built box rather than as a billboard.
    x.strokeStyle = 'rgba(0,0,0,.13)'; x.lineWidth = 2;
    for (let i = 1; i < 8; i++) {
      x.beginPath(); x.moveTo(i * (W / 8), 0); x.lineTo(i * (W / 8), H); x.stroke();
    }
    x.fillStyle = 'rgba(0,0,0,.05)'; x.fillRect(0, H - 34, W, 34);

    // The stripe.
    x.fillStyle = '#b2202a'; x.fillRect(0, H * 0.70, W, 26);
    x.fillStyle = '#171522'; x.fillRect(0, H * 0.70 + 26, W, 8);

    x.textAlign = 'center';
    x.fillStyle = '#171522';
    x.font = 'bold 84px Impact, Haettenschweiler, Arial Black, sans-serif';
    x.fillText('MOVERS FROM HELL', W / 2, H * 0.40);
    x.fillStyle = '#b2202a';
    x.font = 'bold 27px Quicksand, Arial, sans-serif';
    x.fillText('WE MOVE IT · YOU WATCH · SOMETHING BREAKS', W / 2, H * 0.585);

    // A licence-style plate at the tail, the sort of detail that sells a vehicle.
    x.fillStyle = '#171522';
    x.font = 'bold 20px Consolas, monospace';
    x.textAlign = 'left';
    x.fillText('EST. 2026  ·  FULLY INSURED*', 22, H * 0.94);
    x.font = 'italic 14px Quicksand, Arial, sans-serif';
    x.textAlign = 'right';
    x.fillText('*terms apply', W - 22, H * 0.94);
  });
}

const TRUCKWALL = Object.freeze({ colour: '#b9bcc4', rib: 16, band: 4, loA: 0.13, hiA: 0.10 });

/** The truck's rear roller shutter and cargo walls: ribbed panel steel. */
export function texTruckWall() {
  return texSet(TEX.half, TEX.size, 'truckwallV3', (c, W, H) => {
    const { a, h } = c;
    fill(a, TRUCKWALL.colour, W, H);
    soft(a, 1, () => {
      for (let y = 0; y < H; y += TRUCKWALL.rib) {
        a.fillStyle = shade(TRUCKWALL.loA); a.fillRect(0, y, W, TRUCKWALL.band);
        a.fillStyle = tint(TRUCKWALL.hiA); a.fillRect(0, y + TRUCKWALL.band, W, TRUCKWALL.band);
      }
    });
    if (h) soft(h, 1.5, () => {
      for (let y = 0; y < H; y += TRUCKWALL.rib) { h.fillStyle = tint(0.5); h.fillRect(0, y + TRUCKWALL.band, W, TRUCKWALL.band); }
    });
  });
}

/** Scuffed ply, for the cargo deck — the 'deck' variant of texBoards, kept as a name. */
export function texTruckDeck() {
  return texBoards(BOARDS.deckHue, 'deck');
}

/* ── the sky ───────────────────────────────────────────────────────────────────── */

/** The sky, as a vertical gradient with a haze band at the horizon. */
export function texSky(top = '#2f6fb8', mid = '#6fa8d4', horizon = '#dfe9ee') {
  /* 512 wide, not 16. A pure vertical gradient only needs one column — but then there is
   * nowhere to put clouds, and a cloudless gradient is the thing that makes an outdoor
   * scene read as a render rather than as a place. */
  return canvasTex(512, 256, 'sky2|' + top + mid + horizon, (x, W, H) => {
    const g = x.createLinearGradient(0, 0, 0, H);
    /* The haze band is DELIBERATELY thin. A third-person camera looks close to horizontal,
     * so most of the visible sky is the middle of this gradient — pushing the horizon stop
     * to 0.62 made every frame's sky a pale wash and the clouds invisible in it. */
    g.addColorStop(0.00, top);
    g.addColorStop(0.78, mid);
    g.addColorStop(0.96, horizon);
    g.addColorStop(1.00, horizon);
    x.fillStyle = g; x.fillRect(0, 0, W, H);

    /* Clouds as many small overlapping lobes rather than a few big ones — the same finding
     * as TowBros' tree canopies (Dev\INDEX.md): the silhouette has to stay soft and the
     * variation has to live at a smaller scale than the shape itself. Confined to the upper
     * band, because a cloud drawn near v=1 lands at the horizon and reads as fog. */
    for (let c = 0; c < 14; c++) {
      const cx = rnd(c * 3 + 1) * W;
      const cy = 26 + rnd(c * 3 + 2) * 96;
      const scale = 0.55 + rnd(c * 3 + 3) * 0.9;
      x.save();
      x.globalAlpha = 0.30 + rnd(c + 40) * 0.34;
      for (let i = 0; i < 12; i++) {
        const a = i * 2.399;
        const r = (10 + rnd(c * 20 + i) * 17) * scale;
        const ox = Math.cos(a) * (16 + rnd(c * 7 + i) * 30) * scale;
        const oy = Math.sin(a) * (5 + rnd(c * 11 + i) * 9) * scale;
        x.fillStyle = oy < 0 ? '#ffffff' : '#d5e0e8';
        x.beginPath(); x.ellipse(cx + ox, cy + oy, r, r * 0.62, 0, 0, Math.PI * 2); x.fill();
      }
      x.restore();
    }
  });
}

/** Drop every cached canvas. Only for a scene teardown; textures are shared by key. */
export function disposeTextures() {
  for (const t of _texCache.values()) t.dispose();
  _texCache.clear();
  if (_envCube) { _envCube.dispose(); _envCube = null; }
}

/** The texel density every 'tile'-UV part is authored against (read by materials.js). */
export const TEXEL_METRES = RENDER.look.texelMetres;
