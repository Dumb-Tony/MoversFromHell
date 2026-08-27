/* Object appearance — GDD §13.4, §7.1, §20.1, §26.5.
 *
 * Every manifest object was one `BoxGeometry` in a flat colour. That is the correct thing
 * to build first — §29.1's order puts "movement feels good" a long way before "it looks
 * good", and a box is honest about being a collider — but it is also the single biggest
 * reason the build reads as a prototype rather than as a game.
 *
 * ⚠ THE RULE THAT GOVERNS THIS WHOLE FILE, and the one an art pass is most likely to
 * break: §13.4 says "stylized primitive or low-detail 3D meshes are acceptable;
 * COLLISION-FAITHFUL PROPORTIONS ARE MANDATORY". The collider is a cuboid of exactly
 * `def.dimensions`, centred on the body origin. So every part below lives INSIDE that box.
 * A couch whose arms overhang its collider by 4 cm is a couch that visibly passes through a
 * door frame it should have caught on — which would quietly destroy the one thing this
 * whole game is about (§26.2, and the 0.82 m doorway in KNOWN_ISSUES).
 *
 * `prefabBounds()` exists so that is a TEST rather than a promise: m13 asserts every prefab
 * fits its own declared dimensions, for every object in the manifest.
 *
 * Shape lineage: the "character/props from primitives" approach and the group-per-object
 * convention are Chameleon's (`chameleon3d.html` `makeChameleon`, `placeProp` — Dev\INDEX.md
 * → "Procedural geometry & texture"). Nothing here is a mesh format; it is boxes, arranged.
 */

import {
  texCardboard, texFabric, texWood, texSteel, texScreen, texMirror, texPaint, tiled, matte,
} from './textures.js';
import { roundedBox, styleFromLocation } from './styles.js';

/* The toy proposal rounds every box edge (radius 28 mm, clamped per part). Behind the same
 * ?style= flag as the material treatment, so the option photograph shows the geometry that
 * would actually ship — a saturated hard-edged box is not the proposal. */
const TOY = styleFromLocation() === 'toy';

/* ⚠ A TEXTURED PART TAKES NO TINT. `map` is MULTIPLIED by `color`, so passing def.colour
 * alongside a texture that already carries the object's hue darkens it twice — the couch
 * came out near-black where its definition says red-brown. def.colour survives as the
 * fallback for prefabs with no texture of their own, which is what it was always for. */
/** Lambert throughout, to match the rest of the scene and stay inside §26.6's frame budget. */
function m(map, colour = 0xffffff, opts = {}) {
  return matte(colour, { map: map || null, ...opts });
}
function flat(colour, opts = {}) {
  return matte(colour, opts);
}

/** One box, positioned in the object's local frame (origin = collider centre). */
function part(g, w, h, d, x, y, z, mat) {
  const THREE = window.THREE;
  const geo = TOY ? roundedBox(THREE, w, h, d, 0.028) : new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}

function cyl(g, r, h, x, y, z, mat, seg = 10, rotZ = 0) {
  const THREE = window.THREE;
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat);
  mesh.position.set(x, y, z);
  if (rotZ) mesh.rotation.z = rotZ;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}

/* ── the builders ──────────────────────────────────────────────────────────────── */

const BUILD = {
  /* Boxes. The texture does nearly all of the work (tape seam, FRAGILE stencil), so the
   * geometry only adds the lid overlap that stops a carton reading as a solid block. */
  box(g, d, def) {
    const kind = def.id.indexOf('fragile') >= 0 ? 'fragile'
               : def.mass >= 20 ? 'heavy' : 'plain';
    const card = texCardboard(kind, kind === 'fragile' ? 38 : 30);
    const side = m(card);
    part(g, d.x, d.y * 0.94, d.z, 0, -d.y * 0.03, 0, side);
    // Lid, very slightly proud in Y only — never in X or Z, which are the axes a doorway
    // measures (see the header).
    part(g, d.x * 0.995, d.y * 0.10, d.z * 0.995, 0, d.y * 0.45, 0, m(card, 0xf0e6d2));
  },

  couch(g, d, def, opts = {}) {
    const seatH = d.y * 0.42, backT = d.z * 0.26, armW = d.x * 0.11;
    const fab = tiled(texFabric(opts.hue !== undefined ? opts.hue : 14, opts.light || 0.40), 2, 1);
    const body = m(fab);
    const wood = m(texWood(24, 0.26));
    // Base
    part(g, d.x, seatH, d.z, 0, -d.y / 2 + seatH / 2, 0, body);
    // Back
    part(g, d.x, d.y - seatH, backT, 0, seatH / 2, -d.z / 2 + backT / 2, body);
    // Arms
    for (const s of [-1, 1]) {
      part(g, armW, d.y * 0.72, d.z, s * (d.x / 2 - armW / 2), -d.y / 2 + d.y * 0.36, 0, body);
    }
    // Seat cushions, inset so they read as separate pieces.
    const inner = d.x - armW * 2;
    const n = opts.cushions || 3;
    for (let i = 0; i < n; i++) {
      const cw = inner / n - 0.02;
      part(g, cw, d.y * 0.16, d.z - backT - 0.04,
           -inner / 2 + cw / 2 + i * (inner / n) + 0.01,
           -d.y / 2 + seatH + d.y * 0.04, backT / 2 - 0.02,
           m(fab, 0xf2f0ea));
    }
    // Feet
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      part(g, 0.06, d.y * 0.10, 0.06,
           sx * (d.x / 2 - 0.09), -d.y / 2 + d.y * 0.05, sz * (d.z / 2 - 0.09), wood);
    }
  },

  drawers(g, d, def, opts = {}) {
    const n = opts.drawers || 3;
    const carcass = m(tiled(texWood(opts.hue !== undefined ? opts.hue : 28, opts.light || 0.34), 1, 1));
    const front = m(tiled(texWood(opts.hue !== undefined ? opts.hue : 28, (opts.light || 0.34) + 0.06), 1, 1), def.colour);
    const metal = flat(0xc8ccd2);
    part(g, d.x, d.y, d.z, 0, 0, 0, carcass);
    const gap = 0.012;
    const dh = (d.y - gap * (n + 1)) / n;
    for (let i = 0; i < n; i++) {
      const y = -d.y / 2 + gap + dh / 2 + i * (dh + gap);
      // Fronts sit INSIDE the carcass depth — proud fronts would overhang the collider.
      part(g, d.x - gap * 2, dh, 0.02, 0, y, d.z / 2 - 0.011, front);
      cyl(g, 0.012, d.x * 0.30, 0, y, d.z / 2 - 0.026, metal, 8, Math.PI / 2);
    }
  },

  wardrobe(g, d, def) {
    const carcass = m(tiled(texWood(26, 0.30), 1, 2));
    const door = m(tiled(texWood(26, 0.36), 1, 2));
    part(g, d.x, d.y, d.z, 0, 0, 0, carcass);
    for (const s of [-1, 1]) {
      part(g, d.x / 2 - 0.014, d.y - 0.03, 0.02, s * (d.x / 4), 0, d.z / 2 - 0.011, door);
      cyl(g, 0.011, 0.16, s * 0.035, 0, d.z / 2 - 0.026, flat(0xc8ccd2), 8);
    }
    part(g, d.x, 0.04, d.z * 0.9, 0, d.y / 2 - 0.02, 0, m(texWood(26, 0.24)));
  },

  shelf(g, d, def) {
    const wood = m(tiled(texWood(30, 0.32), 1, 1));
    const back = m(texWood(30, 0.24));
    const t = 0.03;
    part(g, d.x, d.y, t, 0, 0, -d.z / 2 + t / 2, back);
    for (const s of [-1, 1]) part(g, t, d.y, d.z, s * (d.x / 2 - t / 2), 0, 0, wood);
    const n = 4;
    for (let i = 0; i <= n; i++) {
      const y = -d.y / 2 + t / 2 + i * ((d.y - t) / n);
      part(g, d.x - t * 2, t, d.z - t, 0, y, t / 2, wood);
    }
    // A few books, so a bookshelf is not an empty frame.
    const hues = [8, 210, 96, 38, 268];
    for (let i = 0; i < 14; i++) {
      const shelf = i % n;
      const y = -d.y / 2 + t + shelf * ((d.y - t) / n) + 0.13;
      const bw = 0.035 + (i % 3) * 0.012;
      const bx = -d.x / 2 + 0.06 + ((i * 0.058) % (d.x - 0.16));
      part(g, bw, 0.24, d.z * 0.62, bx, y, 0.02, flat(hueToHex(hues[i % hues.length])));
    }
  },

  table(g, d, def, opts = {}) {
    const wood = m(tiled(texWood(30, 0.34), 1, 1));
    const topT = Math.min(0.05, d.y * 0.18);
    part(g, d.x, topT, d.z, 0, d.y / 2 - topT / 2, 0, wood);
    const legR = Math.min(0.028, d.x * 0.06);
    const legH = d.y - topT;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      cyl(g, legR, legH, sx * (d.x / 2 - legR - 0.02), -d.y / 2 + legH / 2, sz * (d.z / 2 - legR - 0.02), wood, 8);
    }
    if (opts.shelf) part(g, d.x - 0.10, 0.02, d.z - 0.10, 0, -d.y / 2 + legH * 0.30, 0, wood);
  },

  chair(g, d, def) {
    const wood = m(tiled(texWood(32, 0.34), 1, 1));
    const seatY = -d.y / 2 + d.y * 0.48;
    part(g, d.x, 0.045, d.z, 0, seatY, 0, wood);
    // Back
    part(g, d.x, d.y * 0.46, 0.04, 0, seatY + d.y * 0.25, -d.z / 2 + 0.02, wood);
    const legR = 0.022, legH = d.y * 0.48;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      cyl(g, legR, legH, sx * (d.x / 2 - 0.04), -d.y / 2 + legH / 2, sz * (d.z / 2 - 0.04), wood, 8);
    }
  },

  lamp(g, d, def) {
    const base = flat(0x4c525a), pole = flat(0xb0b6bd);
    cyl(g, Math.min(d.x, d.z) / 2 * 0.9, 0.03, 0, -d.y / 2 + 0.015, 0, base, 14);
    cyl(g, 0.018, d.y * 0.74, 0, -d.y / 2 + d.y * 0.40, 0, pole, 8);
    const THREE = window.THREE;
    const shadeR = Math.min(d.x, d.z) / 2;
    const shade = new THREE.Mesh(
      new THREE.CylinderGeometry(shadeR * 0.72, shadeR, d.y * 0.20, 16, 1, true),
      matte(0xf0e6cc, { side: THREE.DoubleSide }));
    shade.position.set(0, d.y / 2 - d.y * 0.12, 0);
    shade.castShadow = true;
    g.add(shade);
  },

  tv(g, d, def) {
    const bezel = flat(0x15181e);
    part(g, d.x, d.y * 0.86, d.z * 0.30, 0, d.y * 0.06, -d.z / 2 + d.z * 0.15, bezel);
    // Screen, inset a millimetre so the bezel reads as a frame.
    part(g, d.x - 0.05, d.y * 0.86 - 0.05, 0.01, 0, d.y * 0.06, -d.z / 2 + d.z * 0.30 + 0.005,
         m(texScreen(), 0xffffff));
    // Stand
    part(g, d.x * 0.34, d.y * 0.10, d.z * 0.8, 0, -d.y / 2 + d.y * 0.05, 0, flat(0x2b2f36));
    part(g, 0.06, d.y * 0.12, 0.06, 0, -d.y / 2 + d.y * 0.14, -d.z / 2 + d.z * 0.30, flat(0x2b2f36));
  },

  mirror(g, d, def) {
    const frame = m(tiled(texWood(34, 0.34), 1, 1));
    part(g, d.x, d.y, d.z, 0, 0, 0, frame);
    const inset = Math.min(0.07, d.x * 0.12);
    part(g, d.x - inset * 2, d.y - inset * 2, 0.012, 0, 0, d.z / 2 - 0.005,
         m(texMirror(), 0xffffff));
  },

  fridge(g, d, def) {
    const steel = m(tiled(texSteel(0.80), 1, 1));
    const dark = flat(0x8f959c);
    part(g, d.x, d.y, d.z, 0, 0, 0, steel);
    // Door split: freezer on top, fridge below — two panels and a gap, all within depth.
    const splitY = d.y * 0.30;
    part(g, d.x - 0.02, d.y * 0.28, 0.015, 0, d.y / 2 - d.y * 0.15, d.z / 2 - 0.008, m(tiled(texSteel(0.84), 1, 1)));
    part(g, d.x - 0.02, d.y * 0.66, 0.015, 0, -d.y / 2 + d.y * 0.34, d.z / 2 - 0.008, m(tiled(texSteel(0.84), 1, 1)));
    part(g, d.x - 0.02, 0.012, 0.016, 0, splitY, d.z / 2 - 0.009, dark);
    // Handles
    for (const y of [d.y / 2 - d.y * 0.06, splitY - d.y * 0.08]) {
      cyl(g, 0.014, d.x * 0.52, 0, y, d.z / 2 - 0.026, flat(0xdfe4e9), 8, Math.PI / 2);
    }
  },

  mattress(g, d, def) {
    const tick = m(tiled(texFabric(40, 0.80), 3, 2));
    part(g, d.x, d.y * 0.86, d.z, 0, 0, 0, tick);
    // Piped edge top and bottom — the detail that says "mattress" rather than "slab".
    for (const s of [-1, 1]) {
      part(g, d.x * 0.995, d.y * 0.10, d.z * 0.995, 0, s * (d.y * 0.44), 0, m(tiled(texFabric(40, 0.72), 3, 1)));
    }
    // Quilt buttons.
    for (let i = 0; i < 8; i++) {
      const bx = -d.x / 2 + d.x * (0.18 + 0.22 * (i % 4));
      const bz = -d.z / 2 + d.z * (i < 4 ? 0.30 : 0.70);
      cyl(g, 0.02, 0.008, bx, d.y * 0.44, bz, flat(0xd8d2c2), 8);
    }
  },
};

function hueToHex(h) {
  const c = document.createElement('canvas').getContext('2d');
  c.fillStyle = 'hsl(' + h + ',45%,42%)';
  return parseInt(c.fillStyle.slice(1), 16);
}

/** prefab name -> builder + options. Anything unlisted falls back to a textured box. */
const PREFABS = {
  box_small:       [BUILD.box],
  box_heavy:       [BUILD.box],
  box_fragile:     [BUILD.box],
  couch_3seat:     [BUILD.couch, { hue: 14, light: 0.40, cushions: 3 }],
  armchair:        [BUILD.couch, { hue: 205, light: 0.42, cushions: 1 }],
  dresser:         [BUILD.drawers, { drawers: 3, hue: 28 }],
  nightstand:      [BUILD.drawers, { drawers: 2, hue: 26, light: 0.30 }],
  wardrobe:        [BUILD.wardrobe],
  bookshelf:       [BUILD.shelf],
  side_table:      [BUILD.table, { shelf: true }],
  chair_dining:    [BUILD.chair],
  lamp_floor:      [BUILD.lamp],
  tv_55:           [BUILD.tv],
  mirror_framed:   [BUILD.mirror],
  fridge:          [BUILD.fridge],
  mattress_double: [BUILD.mattress],
};

/**
 * The visual for one object definition.
 *
 * @returns {THREE.Group} centred on the collider centre, entirely within `def.dimensions`.
 */
export function buildPrefab(def) {
  const THREE = window.THREE;
  const g = new THREE.Group();
  const d = def.dimensions;
  const entry = PREFABS[def.prefab];
  if (entry) {
    entry[0](g, d, def, entry[1] || {});
  } else {
    // An unknown prefab gets a painted box rather than nothing, and stays obvious.
    part(g, d.x, d.y, d.z, 0, 0, 0, m(texPaint(30, 0.25, 0.5), def.colour));
  }
  return g;
}

/**
 * The half-extents actually occupied by a prefab's geometry.
 *
 * §13.4's collision-faithful rule, made checkable: this is what m13 compares against
 * `def.dimensions`. It walks the built group rather than trusting the builders, because the
 * whole point is to catch a builder that reached outside its box.
 */
export function prefabBounds(def) {
  const THREE = window.THREE;
  const g = buildPrefab(def);
  const box = new THREE.Box3().setFromObject(g);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  g.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  return {
    size: { x: size.x, y: size.y, z: size.z },
    centre: { x: centre.x, y: centre.y, z: centre.z },
  };
}

export { PREFABS };
