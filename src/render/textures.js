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
 * NEW HERE, because a moving game needs surfaces that game did not: cardboard with real
 * tape seams and a fragile stencil, upholstery weave, wood grain with visible end-grain,
 * brushed appliance steel, and the truck's livery.
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
 */

const _texCache = new Map();

export function hslCss(h, s, l) {
  return 'hsl(' + (((h % 360) + 360) % 360).toFixed(1) + ',' +
         (s * 100).toFixed(0) + '%,' + (l * 100).toFixed(0) + '%)';
}

/** Memoised by `key`. Two calls with the same key return the SAME texture object. */
export function canvasTex(w, h, key, draw) {
  if (_texCache.has(key)) return _texCache.get(key);
  const THREE = window.THREE;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  /* TAGGED sRGB. The renderer writes sRGB output (renderer.js), and a canvas is authored in
   * sRGB — leaving the texture at the default LinearEncoding means it is corrected on the
   * way out without having been decoded on the way in, so every texture reads pale and
   * chalky next to the untextured flat colours beside it. */
  if (THREE.sRGBEncoding !== undefined) t.encoding = THREE.sRGBEncoding;
  t.anisotropy = 4;
  t.needsUpdate = true;
  _texCache.set(key, t);
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
 */
export function matte(colour, opts = {}) {
  const THREE = window.THREE;
  /* ⚠ PHONG, NOT LAMBERT, AND THE SPECULAR IS KILLED — so this is per-FRAGMENT Lambert.
   *
   * `MeshLambertMaterial` shades per VERTEX; the vendored r128 build assembles
   * `lights_lambert_vertex` for it and `lights_phong_fragment` for this one. A wall is two
   * triangles, so a Lambert wall's lighting is computed at four corners and interpolated
   * across ten metres — which is why every interior surface was one flat value and why
   * adding lamps to the rooms would have changed almost nothing. See lighting.js.
   *
   * `shininess: 0` with a black specular gives Phong's diffuse term and nothing else, which
   * is the shading model this game already had, evaluated where it can actually be seen. */
  const m = new THREE.MeshPhongMaterial({
    color: colour,
    specular: 0x000000,
    shininess: 0,
    ...opts,
  });
  if (m.color && m.color.convertSRGBToLinear) m.color.convertSRGBToLinear();
  /* THE TOY PALETTE, applied at the one place every flat colour passes through. The art
   * direction (chosen 2026-08-25 from three photographed options) celebrates the primitive
   * shapes with saturated colour; textured surfaces are untouched (their colour is white)
   * and carry their look in the canvas art instead. */
  if (m.color && !opts.map) {
    const hsl = { h: 0, s: 0, l: 0 };
    m.color.getHSL(hsl);
    if (hsl.s > 0.02) m.color.setHSL(hsl.h, Math.min(1, hsl.s * 1.4 + 0.04), Math.min(1, hsl.l * 1.05));
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

/* ── ground and outdoor surfaces ───────────────────────────────────────────────── */

export function texGrass() {
  return canvasTex(256, 256, 'grass', (x, W, H) => {
    x.fillStyle = '#4a6b38'; x.fillRect(0, 0, W, H);
    // Broad mown bands first, so a lawn reads as a lawn rather than as noise.
    for (let i = 0; i < 8; i++) {
      x.fillStyle = i % 2 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.045)';
      x.fillRect(0, i * (H / 8), W, H / 8);
    }
    for (let i = 0; i < 2600; i++) {
      const px = rnd(i) * W, py = rnd(i + 7000) * H;
      const v = rnd(i + 99);
      x.fillStyle = v < 0.34 ? 'rgba(108,148,78,.55)'
                  : v < 0.68 ? 'rgba(58,86,44,.55)'
                             : 'rgba(132,166,92,.40)';
      x.fillRect(px, py, 1, 2);
    }
  });
}

export function texAsphalt() {
  return canvasTex(256, 256, 'asphalt', (x, W, H) => {
    x.fillStyle = '#3a3b42'; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 4200; i++) {
      const v = (i % 7) * 4;
      x.fillStyle = 'rgba(' + (74 + v) + ',' + (76 + v) + ',' + (84 + v) + ',.45)';
      x.fillRect(rnd(i) * W, rnd(i + 3000) * H, 1, 1);
    }
    for (let i = 0; i < 190; i++) {
      x.fillStyle = 'rgba(22,22,26,.45)';
      x.fillRect(rnd(i + 11) * W, rnd(i + 811) * H, 3, 2);
    }
    // A faint oil stain, because a driveway that has never had a car on it reads as new.
    const g = x.createRadialGradient(W * 0.62, H * 0.44, 2, W * 0.62, H * 0.44, 34);
    g.addColorStop(0, 'rgba(12,12,16,.34)'); g.addColorStop(1, 'rgba(12,12,16,0)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
  });
}

export function texConcrete() {
  return canvasTex(256, 256, 'concrete', (x, W, H) => {
    x.fillStyle = '#8d8a82'; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 1800; i++) {
      x.fillStyle = rnd(i) < 0.5 ? 'rgba(0,0,0,.05)' : 'rgba(255,255,255,.05)';
      x.fillRect(rnd(i + 5) * W, rnd(i + 55) * H, 2, 2);
    }
    x.strokeStyle = 'rgba(0,0,0,.26)'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(0, H / 2); x.lineTo(W, H / 2); x.stroke();
    x.beginPath(); x.moveTo(W / 2, 0); x.lineTo(W / 2, H); x.stroke();
  });
}

/* ── the house ─────────────────────────────────────────────────────────────────── */

export function texSiding(hue, light) {
  return canvasTex(128, 256, 'siding|' + hue + '|' + light, (x, W, H) => {
    for (let i = 0; i < 12; i++) {
      x.fillStyle = hslCss(hue, 0.13, light + ((i * 31) % 7) / 260);
      x.fillRect(0, i * (H / 12), W, H / 12);
      // A lap shadow under each board is what makes siding read as boards, not stripes.
      x.fillStyle = 'rgba(0,0,0,.20)';
      x.fillRect(0, (i + 1) * (H / 12) - 2, W, 2);
    }
  });
}

export function texShingle(hue) {
  return canvasTex(256, 256, 'shingle|' + hue, (x, W, H) => {
    const rows = 10, rh = H / rows;
    for (let i = 0; i < rows; i++) {
      x.fillStyle = hslCss(hue, 0.14, 0.19 + ((i * 29) % 9) / 130);
      x.fillRect(0, i * rh, W, rh);
      x.strokeStyle = 'rgba(0,0,0,.42)'; x.lineWidth = 2;
      x.beginPath(); x.moveTo(0, i * rh + rh - 1); x.lineTo(W, i * rh + rh - 1); x.stroke();
      for (let t = 0; t < 8; t++) {
        const tx = ((i % 2) ? 0 : W / 16) + t * (W / 8);
        x.beginPath(); x.moveTo(tx, i * rh); x.lineTo(tx, i * rh + rh); x.stroke();
      }
    }
  });
}

export function texBrick(hue = 14) {
  return canvasTex(256, 256, 'brick|' + hue, (x, W, H) => {
    x.fillStyle = '#9a9187'; x.fillRect(0, 0, W, H);   // mortar
    const rows = 12, rh = H / rows, bw = W / 4;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) ? bw / 2 : 0;
      for (let c = -1; c < 5; c++) {
        x.fillStyle = hslCss(hue, 0.34, 0.34 + rnd(r * 13 + c * 7) * 0.10);
        x.fillRect(c * bw + off + 2, r * rh + 2, bw - 4, rh - 4);
      }
    }
  });
}

/**
 * Interior wall: painted plaster, with a skirting board and CONTACT DARKENING baked in.
 *
 * The baked gradient is doing work no light can do here. Ambient occlusion is the darkening
 * where surfaces meet, and a real-time rig with no AO pass has none — so a wall meets a floor
 * at a hairline and the room reads as a set of separate planes. Painting the bottom of the
 * wall darker is the cheapest honest version, and it is the same idea as the dash pattern on
 * a casualty ring (DevINDEX.md): carry the information in something other than the light.
 *
 * ⚠ It only lands correctly at a VERTICAL REPEAT OF 1. A wall's UV runs 0..1 over its own
 * height, so ry=1.4 tiles the gradient one and a half times and paints a dark band across
 * the middle of the room.
 */
export function texPlaster(hue = 40, light = 0.86) {
  return canvasTex(128, 256, 'plasterV2|' + hue + '|' + light, (x, W, H) => {
    x.fillStyle = hslCss(hue, 0.16, light); x.fillRect(0, 0, W, H);
    for (let i = 0; i < 1400; i++) {
      x.fillStyle = rnd(i) < 0.5 ? 'rgba(0,0,0,.028)' : 'rgba(255,255,255,.035)';
      x.fillRect(rnd(i + 3) * W, rnd(i + 33) * H, 2, 2);
    }
    // Contact darkening at the floor, and a lighter touch where the ceiling meets.
    const lo = x.createLinearGradient(0, H * 0.72, 0, H);
    lo.addColorStop(0, 'rgba(24,20,16,0)'); lo.addColorStop(1, 'rgba(24,20,16,.30)');
    x.fillStyle = lo; x.fillRect(0, H * 0.72, W, H * 0.28);
    const hi = x.createLinearGradient(0, 0, 0, H * 0.14);
    hi.addColorStop(0, 'rgba(24,20,16,.20)'); hi.addColorStop(1, 'rgba(24,20,16,0)');
    x.fillStyle = hi; x.fillRect(0, 0, W, H * 0.14);
    // Skirting: a painted board with a shadow line above it.
    const sk = H * 0.055;
    x.fillStyle = hslCss(hue, 0.10, Math.min(0.97, light + 0.07));
    x.fillRect(0, H - sk, W, sk);
    x.fillStyle = 'rgba(20,16,12,.34)'; x.fillRect(0, H - sk - 2, W, 3);
    x.fillStyle = 'rgba(255,255,255,.16)'; x.fillRect(0, H - sk + 1, W, 2);
  });
}

export function texBoards(hue) {
  return canvasTex(256, 256, 'boards|' + hue, (x, W, H) => {
    const rows = 6, rh = H / rows;
    for (let i = 0; i < rows; i++) {
      x.fillStyle = hslCss(hue, 0.32, 0.30 + ((i * 37) % 11) / 140);
      x.fillRect(0, i * rh, W, rh);
      x.strokeStyle = 'rgba(0,0,0,.34)'; x.lineWidth = 2;
      x.beginPath(); x.moveTo(0, i * rh + rh - 1); x.lineTo(W, i * rh + rh - 1); x.stroke();
      x.strokeStyle = 'rgba(0,0,0,.09)'; x.lineWidth = 1;
      for (let g = 0; g < 4; g++) {
        const gy = i * rh + 6 + ((i * 17 + g * 31) % (rh - 12));
        x.beginPath(); x.moveTo(0, gy); x.lineTo(W, gy + (g % 2 ? 1 : -1)); x.stroke();
      }
      const seam = ((i * 67) % W);
      x.strokeStyle = 'rgba(0,0,0,.26)'; x.lineWidth = 2;
      x.beginPath(); x.moveTo(seam, i * rh); x.lineTo(seam, i * rh + rh); x.stroke();
    }
  });
}

export function texPaint(hue, sat, light) {
  return canvasTex(128, 128, 'paint|' + hue + '|' + sat + '|' + light, (x, W, H) => {
    x.fillStyle = hslCss(hue, sat, light); x.fillRect(0, 0, W, H);
    x.fillStyle = 'rgba(0,0,0,.05)';
    for (let i = 0; i < 260; i++) x.fillRect(rnd(i) * W, rnd(i + 9) * H, 2, 2);
  });
}

/* ── the things you carry ──────────────────────────────────────────────────────── */

/**
 * Cardboard, with tape and a stencil.
 *
 * The single highest-value texture in the game: §13.2's manifest is mostly boxes, so
 * whatever a box looks like is what the game looks like. Flat tan boxes were most of why
 * the build read as a prototype.
 */
export function texCardboard(kind = 'plain', hue = 32) {
  return canvasTex(256, 256, 'card|' + kind + '|' + hue, (x, W, H) => {
    x.fillStyle = hslCss(hue, 0.36, 0.56); x.fillRect(0, 0, W, H);
    // Fluting, seen faintly through the liner.
    for (let i = 0; i < W; i += 6) {
      x.fillStyle = 'rgba(0,0,0,.045)'; x.fillRect(i, 0, 3, H);
    }
    for (let i = 0; i < 1400; i++) {
      x.fillStyle = rnd(i) < 0.5 ? 'rgba(0,0,0,.05)' : 'rgba(255,255,255,.05)';
      x.fillRect(rnd(i + 2) * W, rnd(i + 22) * H, 2, 1);
    }
    // Packing tape down the seam: lighter, glossy, with a lifted edge.
    x.fillStyle = 'rgba(216,206,180,.72)';
    x.fillRect(W / 2 - 17, 0, 34, H);
    x.fillStyle = 'rgba(255,255,255,.20)'; x.fillRect(W / 2 - 14, 0, 6, H);
    x.strokeStyle = 'rgba(0,0,0,.22)'; x.lineWidth = 1;
    x.beginPath(); x.moveTo(W / 2 - 17.5, 0); x.lineTo(W / 2 - 17.5, H); x.stroke();
    x.beginPath(); x.moveTo(W / 2 + 17.5, 0); x.lineTo(W / 2 + 17.5, H); x.stroke();

    x.strokeStyle = 'rgba(0,0,0,.34)'; x.lineWidth = 2;
    x.strokeRect(6, 6, W - 12, H - 12);

    if (kind === 'fragile') {
      /* §7.2's fragility, stencilled on the object rather than shown in a panel. §26.5
       * wants a state to carry text or shape and never colour alone — a red box is exactly
       * the cue a colour-blind player cannot read, so the box says FRAGILE. */
      x.save();
      x.translate(W / 2, H * 0.30);
      x.fillStyle = 'rgba(178,44,44,.90)';
      x.font = 'bold 30px Impact, Haettenschweiler, sans-serif';
      x.textAlign = 'center';
      x.fillText('FRAGILE', 0, 0);
      x.font = 'bold 15px Impact, sans-serif';
      x.fillText('THIS WAY UP', 0, 24);
      x.restore();
      // Two arrows, because "this way up" without arrows is just a sentence.
      x.fillStyle = 'rgba(178,44,44,.85)';
      for (const ax of [W * 0.20, W * 0.80]) {
        x.beginPath();
        x.moveTo(ax, H * 0.60); x.lineTo(ax - 11, H * 0.74); x.lineTo(ax + 11, H * 0.74);
        x.closePath(); x.fill();
        x.fillRect(ax - 4, H * 0.74, 8, 22);
      }
    } else if (kind === 'heavy') {
      x.save();
      x.translate(W / 2, H * 0.72);
      x.fillStyle = 'rgba(48,42,34,.62)';
      x.font = 'bold 22px Impact, sans-serif'; x.textAlign = 'center';
      x.fillText('HEAVY', 0, 0);
      x.restore();
    }
  });
}

/** Upholstery — a woven twill that reads as fabric at arm's length. */
export function texFabric(hue, light = 0.42) {
  return canvasTex(128, 128, 'fabric|' + hue + '|' + light, (x, W, H) => {
    x.fillStyle = hslCss(hue, 0.26, light); x.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 4) {
      for (let px = 0; px < W; px += 4) {
        const up = ((px / 4 + y / 4) % 2) === 0;
        x.fillStyle = up ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.09)';
        x.fillRect(px, y, 4, 4);
      }
    }
    for (let i = 0; i < 700; i++) {
      x.fillStyle = 'rgba(0,0,0,.05)';
      x.fillRect(rnd(i + 4) * W, rnd(i + 44) * H, 1, 1);
    }
  });
}

/** Wood with visible grain and the odd knot. */
export function texWood(hue = 28, light = 0.36) {
  return canvasTex(256, 256, 'wood|' + hue + '|' + light, (x, W, H) => {
    x.fillStyle = hslCss(hue, 0.38, light); x.fillRect(0, 0, W, H);
    for (let i = 0; i < 60; i++) {
      const y = rnd(i) * H;
      x.strokeStyle = 'rgba(0,0,0,' + (0.04 + rnd(i + 1) * 0.09).toFixed(3) + ')';
      x.lineWidth = 1 + rnd(i + 2) * 2;
      x.beginPath();
      x.moveTo(0, y);
      for (let px = 0; px <= W; px += 16) x.lineTo(px, y + Math.sin((px + i * 40) / 42) * 3.2);
      x.stroke();
    }
    for (let k = 0; k < 3; k++) {
      const kx = rnd(k + 90) * W, ky = rnd(k + 190) * H;
      for (let r = 7; r > 0; r--) {
        x.strokeStyle = 'rgba(0,0,0,' + (0.05 * r / 7 + 0.04).toFixed(3) + ')';
        x.lineWidth = 1;
        x.beginPath(); x.ellipse(kx, ky, r * 1.7, r, 0, 0, Math.PI * 2); x.stroke();
      }
    }
  });
}

/** Brushed appliance steel — the fridge, and the truck's roller shutter. */
export function texSteel(light = 0.80) {
  return canvasTex(128, 128, 'steel|' + light, (x, W, H) => {
    x.fillStyle = hslCss(210, 0.05, light); x.fillRect(0, 0, W, H);
    for (let i = 0; i < 1600; i++) {
      const y = rnd(i) * H;
      x.fillStyle = rnd(i + 1) < 0.5 ? 'rgba(255,255,255,.10)' : 'rgba(0,0,0,.07)';
      x.fillRect(rnd(i + 2) * W, y, 12, 1);
    }
  });
}

/** A dark screen with a faint reflection, for the television. */
export function texScreen() {
  return canvasTex(128, 128, 'screen', (x, W, H) => {
    x.fillStyle = '#15181e'; x.fillRect(0, 0, W, H);
    const g = x.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, 'rgba(255,255,255,.14)');
    g.addColorStop(0.42, 'rgba(255,255,255,.02)');
    g.addColorStop(1, 'rgba(255,255,255,.07)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
  });
}

/** A mirror: mostly a pale reflection gradient, because a real one needs a render target. */
export function texMirror() {
  return canvasTex(128, 128, 'mirror', (x, W, H) => {
    const g = x.createLinearGradient(0, 0, W * 0.4, H);
    g.addColorStop(0, '#cfdce4'); g.addColorStop(0.5, '#aebfc9'); g.addColorStop(1, '#c6d4dc');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 6;
    x.beginPath(); x.moveTo(-10, H * 0.8); x.lineTo(W * 0.7, -10); x.stroke();
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

/** The truck's rear roller shutter, and the inside of the cargo walls. */
export function texTruckWall() {
  return canvasTex(128, 256, 'truckwall', (x, W, H) => {
    x.fillStyle = '#b9bcc4'; x.fillRect(0, 0, W, H);
    for (let i = 0; i < H; i += 16) {
      x.fillStyle = 'rgba(0,0,0,.13)'; x.fillRect(0, i, W, 2);
      x.fillStyle = 'rgba(255,255,255,.10)'; x.fillRect(0, i + 2, W, 3);
    }
  });
}

/** Scuffed ply, for the cargo deck. A clean deck is a deck nobody has worked on. */
export function texTruckDeck() {
  return canvasTex(256, 256, 'truckdeck', (x, W, H) => {
    x.fillStyle = '#6f6355'; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 8; i++) {
      x.fillStyle = 'rgba(0,0,0,' + (0.05 + (i % 3) * 0.03).toFixed(2) + ')';
      x.fillRect(0, i * (H / 8), W, H / 8);
      x.fillStyle = 'rgba(0,0,0,.30)'; x.fillRect(0, (i + 1) * (H / 8) - 2, W, 2);
    }
    for (let i = 0; i < 40; i++) {
      x.strokeStyle = 'rgba(0,0,0,.10)'; x.lineWidth = 1 + rnd(i) * 2;
      const sx = rnd(i + 6) * W, sy = rnd(i + 66) * H;
      x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + rnd(i + 1) * 60 - 30, sy + rnd(i + 2) * 14 - 7); x.stroke();
    }
  });
}

/* ── the movers ────────────────────────────────────────────────────────────────── */

/** Hi-vis, with the reflective bands drawn in. */
export function texHiVis(hue = 68) {
  return canvasTex(128, 128, 'hivis|' + hue, (x, W, H) => {
    x.fillStyle = hslCss(hue, 0.92, 0.55); x.fillRect(0, 0, W, H);
    for (let i = 0; i < 500; i++) {
      x.fillStyle = 'rgba(0,0,0,.05)';
      x.fillRect(rnd(i) * W, rnd(i + 5) * H, 2, 2);
    }
    // Two silver bands round the body.
    for (const y of [H * 0.30, H * 0.62]) {
      x.fillStyle = '#cfd6dd'; x.fillRect(0, y, W, 13);
      x.fillStyle = 'rgba(255,255,255,.55)'; x.fillRect(0, y + 3, W, 4);
      x.fillStyle = 'rgba(0,0,0,.20)'; x.fillRect(0, y + 13, W, 2);
    }
  });
}

/** Work trousers / denim. */
export function texDenim(hue = 218, light = 0.28) {
  return canvasTex(64, 64, 'denim|' + hue + '|' + light, (x, W, H) => {
    x.fillStyle = hslCss(hue, 0.30, light); x.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 3) {
      for (let px = 0; px < W; px += 3) {
        x.fillStyle = ((px + y) / 3) % 2 ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.08)';
        x.fillRect(px, y, 3, 3);
      }
    }
  });
}

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
     * as TowBros' tree canopies (DevINDEX.md): the silhouette has to stay soft and the
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
}
