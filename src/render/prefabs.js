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
 *
 * ── PHASE 15 (2026-09-03): the Overcooked look — materials respond to light, geometry
 * carries the occlusion, and the texture stops pretending to be geometry. ──
 *
 * Every part is now a `surface(kind, colour, opts)` material (materials.js) with
 * `vertexColors: true`, and every geometry carries a baked ambient-occlusion band in its
 * 'color' attribute. Two rules fall out of that, and both are enforced by the helpers rather
 * than by discipline:
 *
 *   1. ⚠ A GEOMETRY UNDER A vertexColors MATERIAL WITHOUT A 'color' ATTRIBUTE RENDERS BLACK.
 *      r128's MeshPhongMaterial has no defaultAttributeValues (only ShaderMaterial does), so
 *      a missing attribute reads as (0,0,0) and multiplies the diffuse to nothing. The
 *      first cylinder built without one was a black lamp pole. EVERY mesh in this file is
 *      created through part() / slab() / bar() / cyl() / mesh(), all of which call
 *      bakeVertexAO() — CylinderGeometry, the lamp shade, book boxes included — and m13 G3
 *      walks every prefab to check the attribute count matches the position count.
 *   2. ⚠ A CACHED roundedBox IS NEVER geometry.translate()'d. The cache hands the SAME
 *      geometry to every mesh of that size (the manifest reuses a handful of sizes); a
 *      translate on it would move every box in the world. Clone first (playerBody.js does,
 *      for its top-pivoted limbs). The helpers here position the MESH, never the geometry.
 *
 * Parts stay DIRECT children of the group: m13 B1b decides whether a mesh in a doorway is
 * an entity by `e.mesh.children.includes(o)`, so a nested sub-group would be flagged as
 * scenery that crept into the aperture.
 *
 * UV SPACE. A rounded box is an ExtrudeGeometry, whose UVs are the shape's XY coordinates in
 * metres on the caps and a path-length parameterisation on the sides — a cardboard stencil
 * on those is a smear. roundedBox() rewrites the uv attribute per triangle by dominant face
 * normal: 'tile' puts one texture repeat per RENDER.look.texelMetres so a 2.1 m couch and a
 * 0.5 m box share one grain scale, 'face' spans each face exactly 0..1 so a decal is centred
 * on every face at every box size. u is mirrored on the -X/-Y/-Z faces so stencil text never
 * reads backwards from the other side.
 *
 * THE TAPE FIX (three judges asked for it): the box body is shrunk 3 mm per side, the lid
 * top sits at d.y/2 - 3 mm, and the three tape strips are half-sunk so their OUTERMOST face
 * lands at exactly ±d/2 — total extent is exactly d.x × d.y × d.z, and A1's 1 mm tolerance
 * holds with tape that is real geometry (a highlight strip) rather than paint.
 */

import { RENDER } from '../config.js';
import {
  texCardboard, texCardboardLid, texCardboardEdge, texFabric, texWood, texSteel, texScreen,
  texMirror, texTicking, texQuilt, texRubber, texTruckWall, texTape, basic,
} from './textures.js';
import { surface } from './materials.js';

/* ── accent constants, named in one place (project rule: no bare literal in a system) ──── */

/** Colours and hues the builders reach for. Textured parts take NO tint (see `mat` below);
 *  these are the flat-kind colours and the hue parameters handed to the texture generators. */
export const PREFAB_PALETTE = Object.freeze({
  /** Cushions are the upholstery hue at this much more lightness — the old 0xf2f0ea tint
   *  multiplied a red texture toward grey; a lighter texture keeps the hue. */
  cushionLift: 0.06,
  tape: 0xd9cfb2,
  plinth: 0x3a2e2a,
  /** Six book hues at least 25° apart, so no two neighbours read as the same book. */
  books: Object.freeze([8, 38, 96, 150, 210, 268]),
  /** HSL saturation / lightness the book hues are rendered at: saturated enough to read as
   *  six different spines under the toy boost, dark enough that the plastic highlight shows. */
  bookSat: 0.45, bookLight: 0.42,
  cardHue: 30,
  cardHueFragile: 38,
  couchHue: 14, couchLight: 0.40,
  armchairHue: 205, armchairLight: 0.42,
  /** Wood lightness tiers: carcass / cap slab one tier darker / doors one tier lighter. */
  walnutLight: 0.30, walnutDark: 0.24, walnutDoor: 0.34,
  lampBase: 0x4c525a,
  shade: 0xf0e6cc,
  /** The unlit disc under the shade — the lamp reads switched on and blooms. */
  glow: 0xfff3d0,
  bezel: 0x15181e,
  tvStand: 0x2b2f36,
  gasket: 0x3a3d44,
  fridgePlinth: 0x1c1d21,
  button: 0xd8d2c2,
  chrome: 0xd8dde3,
  rubber: 0x2a2d33,
  /** Fallback prefab (an unlisted prefab name) is a painted box in def.colour. */
  fallback: 0x8a8f96,
});

/** Geometry constants shared by more than one builder. Everything a doorway measures is
 *  derived from def.dimensions; these are the fixed-size details inside it. */
const PART = Object.freeze({
  /** Auto radius = clamp(autoRadiusFrac × min(w,h,d), autoRadiusMin, autoRadiusMax):
   *  0.50 m box → 0.040, couch base → 0.029, 0.06 m foot → 0.010. */
  autoRadiusFrac: 0.08, autoRadiusMin: 0.010, autoRadiusMax: 0.045,
  /** Below this radius an extrude is wasted; a BoxGeometry (regrouped) stands in. */
  minRoundRadius: 0.004,
  /** ExtrudeGeometry needs a positive depth even when 2r would eat the whole dimension. */
  minExtrudeDepth: 0.002,
  /** A face counts as an underside (extra AO darkening) below this normal.y. */
  aoUndersideNy: -0.5,
  /** The bevel can never exceed this fraction of a dimension or the shape collapses. */
  maxRadiusFrac: 0.24,
  bevelSegments: 3, curveSegments: 5,
  /** Undersides (face normal.y < -0.5) get this extra darkening in the AO bake. */
  aoUnderside: 0.85,
  /** bakeVertexAO's band is min(aoBandFrac × height, RENDER.look.ao.bandMax). */
  aoBandFrac: 0.35,
  /** Box: body shrunk this much per axis (the 3 mm the tape lives in), lid dropped 3 mm. */
  bodyShrink: 0.006, lidDrop: 0.003, lidFrac: 0.10, lidInset: 0.995,
  tapeWidth: 0.06, tapeThick: 0.006, tapeDrop: 0.35,
  /** Handles: nothing under 15 mm reads at 4 m (P7); tape is a highlight strip, not a part. */
  handleThick: 0.024, handleLen: 0.14, wardrobeHandleLen: 0.18, barRadiusFrac: 0.45,
  /** Drawer/door gap, front radius, front thickness, front recess behind the cap edge. */
  gap: 0.012, frontRadius: 0.018, frontT: 0.02, frontRecess: 0.04,
  capT: 0.02, plinthH: 0.05, plinthInset: 0.02,
  /** Upholstery. */
  seatFrac: 0.42, backFrac: 0.26, armFrac: 0.11, armMin: 0.13, armHFrac: 0.72, footFrac: 0.08,
  cushionRadius: 0.045, cushionAO: 0.35, seatCushionFrac: 0.16, backCushionFrac: 0.30,
  backCushionT: 0.10, cushionGap: 0.02, cushionSink: 0.01,
  /** Seat cushion centre sits this fraction of d.y above the seat deck (a plump cushion,
   *  not a slab flush with the base). */
  cushionLiftFrac: 0.04,
  footRTop: 0.030, footRBottom: 0.024, footInset: 0.09,
  /** Shelf. */
  boardT: 0.035, backboardT: 0.012, shelves: 4, books: 10, bookMinW: 0.045, bookStepW: 0.012,
  bookH: 0.24, bookRadius: 0.008, bookDepthFrac: 0.62, bookPitch: 0.083, bookMargin: 0.075,
  /** A shelf too narrow for books still gets a positive span so the layout maths holds. */
  bookSpanMin: 0.01,
  /** Table / chair. */
  tableTopMin: 0.05, tableTopFrac: 0.18, legRTop: 0.030, legRBottom: 0.022, legInset: 0.05,
  shelfInset: 0.10, shelfT: 0.02, shelfHeightFrac: 0.30,
  seatT: 0.045, seatFracChair: 0.48, postW: 0.035, slatH: 0.09, slatT: 0.03,
  slatFracs: Object.freeze([0.42, 0.78]), chairLegRTop: 0.024, chairLegRBottom: 0.018,
  chairLegInset: 0.04, sink: 0.01,
  /** Lamp. */
  lampBaseFrac: 0.9, lampBaseT: 0.03, poleR: 0.018, poleFrac: 0.80, shadeFrac: 0.20,
  shadeTopFrac: 0.72, glowGap: 0.002, glowFrac: 0.9, shadeSegments: 16,
  /** TV. */
  bezelRadius: 0.012, bezelHFrac: 0.86, bezelDFrac: 0.30, screenInset: 0.05,
  screenT: 0.01, screenProud: 0.002, footWFrac: 0.5, footHFrac: 0.06, footDFrac: 0.9,
  neckW: 0.08,
  /** Mirror. */
  mirrorInsetMax: 0.07, mirrorInsetFrac: 0.12, glassT: 0.012, frameRecess: 0.004,
  /** Fridge. */
  fridgePlinthH: 0.06, fridgeSplitFrac: 0.30, doorGap: 0.010, doorT: 0.018, doorMargin: 0.02,
  doorRadius: 0.012, gasketBand: 0.006, gasketT: 0.008, gasketRecess: 0.020, doorRecess: 0.011,
  fridgeHandleFrac: 0.5, fridgeHandleDrop: 0.05,
  /** Mattress. */
  mattressRadius: 0.045, buttonR: 0.025, buttonT: 0.006, buttonProud: 0.004, buttons: 8,
  /** Button grid as fractions of d.x / d.z: buttonCols per row starting at buttonX0 and
   *  stepping buttonXStep; two rows at buttonRows. 8 buttons = 4 × 2. */
  buttonCols: 4, buttonX0: 0.18, buttonXStep: 0.22, buttonRows: Object.freeze([0.30, 0.70]),
  /** Tools. */
  dollyDeckT: 0.03, dollyRailT: 0.03, dollyRollerEnd: 0.08, dollyRollerInset: 0.10,
  dollyAxleR: 0.010, dollyAxleEnd: 0.02, blanketRadius: 0.045,
  driverHandleFrac: 0.42, driverHandleTaper: 0.85, driverHandleFit: 0.96, driverShaftR: 0.004,
  segments: 12, roundSegments: 16,
});

/* ── geometry primitives ─────────────────────────────────────────────────────────── */

/* THE TOY DIRECTION WON (2026-08-25), so rounded geometry IS the build now — not a flag.
 *
 * ⚠ BOUNDS ARE MEASURED, NOT TRUSTED. r128's ExtrudeGeometry bevel expands the outline in
 * ways the documentation describes loosely, and §13.4's collision-faithful rule means a
 * 28 mm overhang is a couch visibly passing through a jamb it should catch on. So the
 * builder constructs a candidate, measures its bounding box, and rescales to EXACTLY the
 * requested dimensions — the measurement is the contract, and m13 A1 re-measures every
 * prefab downstream. Cached by dimension key + every option: the manifest re-uses a handful
 * of sizes, and the cache is what makes rule 2 in the header matter. */
const _rboxCache = new Map();

function _opts(radiusOrOpts) {
  const o = typeof radiusOrOpts === 'number' ? { radius: radiusOrOpts } : (radiusOrOpts || {});
  return {
    radius: o.radius === undefined ? 'auto' : o.radius,
    uv: o.uv || 'tile',
    ao: o.ao === undefined ? RENDER.look.ao.strength : o.ao,
    segments: o.segments || PART.bevelSegments,
  };
}

function _autoRadius(w, h, d) {
  const m = Math.min(w, h, d);
  return Math.min(PART.autoRadiusMax, Math.max(PART.autoRadiusMin, PART.autoRadiusFrac * m));
}

/** The rounded outline of a `w` × `h` rectangle with corner radius `cr`, as a Shape. */
function _roundedShape(THREE, iw, ih, cr) {
  const shape = new THREE.Shape();
  const x = iw / 2 - cr, y = ih / 2 - cr;
  shape.moveTo(-x, -ih / 2);
  shape.lineTo(x, -ih / 2);  shape.absarc(x, -y, cr, -Math.PI / 2, 0, false);
  shape.lineTo(iw / 2, y);   shape.absarc(x, y, cr, 0, Math.PI / 2, false);
  shape.lineTo(-x, ih / 2);  shape.absarc(-x, y, cr, Math.PI / 2, Math.PI, false);
  shape.lineTo(-iw / 2, -y); shape.absarc(-x, -y, cr, Math.PI, Math.PI * 1.5, false);
  return shape;
}

/* The thin-part fallback: a BoxGeometry, made non-indexed (so the per-triangle UV rewrite
 * below sees flat triangles) and REGROUPED to the extrude's two-group convention. r128's
 * BoxGeometry emits its faces in the order px, nx, py, ny, pz, nz — six verts each once
 * non-indexed — which is what the index arithmetic here relies on. */
function _boxFallback(THREE, w, h, d, slab) {
  const geo = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  geo.clearGroups();
  if (slab) {           // group 0 = ±Y (top + bottom), group 1 = the four sides
    geo.addGroup(0, 12, 1); geo.addGroup(12, 12, 0); geo.addGroup(24, 12, 1);
  } else {              // group 0 = ±Z caps, group 1 = the rest
    geo.addGroup(0, 24, 1); geo.addGroup(24, 12, 0);
  }
  return geo;
}

/* Shared body of roundedBox and roundedSlab. `slab` builds the shape in XZ and extrudes
 * along Y (rotateX(-π/2) before centring), so the extrude's cap group lands on top and
 * bottom and its side group is the edge band. */
function _rounded(THREE, w, h, d, opts, slab) {
  w = Math.max(w, 1e-3); h = Math.max(h, 1e-3); d = Math.max(d, 1e-3);
  const radius = opts.radius === 'auto' ? _autoRadius(w, h, d) : opts.radius;
  const r = Math.min(radius, w * PART.maxRadiusFrac, h * PART.maxRadiusFrac, d * PART.maxRadiusFrac);
  let geo;
  if (r <= PART.minRoundRadius) {
    geo = _boxFallback(THREE, w, h, d, slab);
  } else {
    // Shape spans the two non-extruded axes; depth is the third. For a slab that is
    // (w, d) in the shape and h along the extrusion.
    const sw = w, sh = slab ? d : h, depth = slab ? h : d;
    const iw = sw - 2 * r, ih = sh - 2 * r;
    // Corner radius = bevel radius so all twelve edges match (the old r × 0.6 left the
    // vertical edges visibly sharper than the horizontal ones).
    const cr = Math.min(r, iw / 2 - 1e-4, ih / 2 - 1e-4);
    geo = new THREE.ExtrudeGeometry(_roundedShape(THREE, iw, ih, cr), {
      depth: Math.max(PART.minExtrudeDepth, depth - 2 * r), bevelEnabled: true,
      bevelThickness: r, bevelSize: r, bevelSegments: opts.segments,
      curveSegments: PART.curveSegments,
    });
    if (slab) geo.rotateX(-Math.PI / 2);
  }
  geo.center();
  // The contract: whatever the bevel did, the result IS w×h×d.
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  geo.scale(w / Math.max(1e-6, bb.max.x - bb.min.x),
            h / Math.max(1e-6, bb.max.y - bb.min.y),
            d / Math.max(1e-6, bb.max.z - bb.min.z));
  geo.computeVertexNormals();
  _rewriteUV(THREE, geo, opts.uv);
  bakeVertexAO(geo, opts.ao);
  // Measured hand-off for anyone asserting on the UV range: the by-normal projection hands
  // the LAST bevel strip (normal ~75° off the cap) to the side face, so the set of triangles
  // projected onto any one face stops r × (1 − sin(π/2 × (segs−1)/segs)) = 0.134 r short of
  // each edge — 'tile' u-range on the couch base measures 4.1876, not 2.10/0.5 = 4.2000
  // (r 0.0231 → 2 × 0.0031 m → 0.0124 uv). Hitting the edge exactly would mean projecting a
  // 75° strip onto the cap (a 3.7× stretch); the shortfall is recorded instead.
  geo.userData.radius = r;
  geo.userData.uvEdgeShortfall = r <= PART.minRoundRadius
    ? 0 : r * (1 - Math.sin((Math.PI / 2) * (opts.segments - 1) / opts.segments));
  return geo;
}

/**
 * A rounded box, cached by dimensions + options. NEVER mutate the result; clone before
 * `translate()`. Groups 0 (±Z caps) and 1 (bevels + sides) are preserved from ExtrudeGeometry
 * (verified in the vendored r128: addGroup(…, 0) is the caps, addGroup(…, 1) the walls).
 *
 * @param {number|object} radiusOrOpts  a number means `{ radius }` (scene.js's truck cab still
 *   calls `roundedBox(THREE, sx, sy, sz, 0.07)`); opts `{ radius: 'auto'|number, uv:
 *   'tile'|'face', ao: number (0 disables), segments }`.
 */
export function roundedBox(THREE, w, h, d, radiusOrOpts = {}) {
  const o = _opts(radiusOrOpts);
  const key = 'b|' + w.toFixed(4) + '|' + h.toFixed(4) + '|' + d.toFixed(4) + '|' +
              o.radius + '|' + o.uv + '|' + o.ao + '|' + o.segments;
  if (_rboxCache.has(key)) return _rboxCache.get(key);
  const geo = _rounded(THREE, w, h, d, o, false);
  geo.userData.cached = true;
  _rboxCache.set(key, geo);
  return geo;
}

/** The same rounded shape built in XZ and extruded along Y: group 0 = top + bottom, group 1
 *  = the edge band, so a slab takes a `[faceMat, edgeMat]` array. Cached; never mutate. */
export function roundedSlab(THREE, w, h, d, opts = {}) {
  const o = _opts(opts);
  const key = 's|' + w.toFixed(4) + '|' + h.toFixed(4) + '|' + d.toFixed(4) + '|' +
              o.radius + '|' + o.uv + '|' + o.ao + '|' + o.segments;
  if (_rboxCache.has(key)) return _rboxCache.get(key);
  const geo = _rounded(THREE, w, h, d, o, true);
  geo.userData.cached = true;
  _rboxCache.set(key, geo);
  return geo;
}

/* Per-triangle UV rewrite by dominant face normal. ExtrudeGeometry is non-indexed, so
 * vertices 3i..3i+2 are one triangle and each can take its own uv. Bevel triangles project
 * onto their nearest face; the soft-edged textures hide the stretch (open risk: a bevel
 * strip near 45° may flip axis mid-strip — if a seam ever shows, project by nearest PLANE
 * instead of by normal). */
function _rewriteUV(THREE, geo, mode) {
  const pos = geo.attributes.position;
  const n = pos.count;
  geo.computeBoundingBox();
  const min = geo.boundingBox.min, max = geo.boundingBox.max;
  const ext = [Math.max(1e-6, max.x - min.x), Math.max(1e-6, max.y - min.y), Math.max(1e-6, max.z - min.z)];
  const mn = [min.x, min.y, min.z];
  const texel = RENDER.look.texelMetres;
  const uv = new Float32Array(n * 2);
  const p = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  // In-plane axes per dominant axis: X faces (z, y), Y faces (x, z), Z faces (x, y).
  const AXES = [[2, 1], [0, 2], [0, 1]];
  for (let i = 0; i + 2 < n; i += 3) {
    for (let k = 0; k < 3; k++) { p[k][0] = pos.getX(i + k); p[k][1] = pos.getY(i + k); p[k][2] = pos.getZ(i + k); }
    const ax = p[1][0] - p[0][0], ay = p[1][1] - p[0][1], az = p[1][2] - p[0][2];
    const bx = p[2][0] - p[0][0], by = p[2][1] - p[0][1], bz = p[2][2] - p[0][2];
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const a = [Math.abs(nx), Math.abs(ny), Math.abs(nz)];
    let axis = 2;
    if (a[0] >= a[1] && a[0] >= a[2]) axis = 0; else if (a[1] >= a[2]) axis = 1;
    const sign = [nx, ny, nz][axis] < 0 ? -1 : 1;
    const [ua, va] = AXES[axis];
    for (let k = 0; k < 3; k++) {
      let u, v;
      if (mode === 'face') {
        u = (p[k][ua] - mn[ua]) / ext[ua];
        v = (p[k][va] - mn[va]) / ext[va];
        if (sign < 0) u = 1 - u;           // mirrored on the -X/-Y/-Z faces: text reads right
      } else {
        u = p[k][ua] / texel;
        v = p[k][va] / texel;
        if (sign < 0) u = -u;
      }
      uv[(i + k) * 2] = u; uv[(i + k) * 2 + 1] = v;
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/**
 * Vertex-baked ambient occlusion: a darkening band up from the geometry's own base, written
 * into a Float32 'color' attribute (3 per vertex) that `vertexColors: true` materials
 * multiply into the diffuse. c = 1 - strength × smoothstep(band, 0, y - minY), with
 * band = min(0.35 h, bandMax); undersides (normal.y < -0.5) are darkened a further ×0.85.
 * With strength 0 the attribute is still written (all ones) — that is the point: header
 * rule 1. Idempotent via geometry.userData.aoBaked. Safe on Box/Cylinder/Sphere/Plane
 * geometry (indexed or not).
 */
export function bakeVertexAO(geometry, strength = RENDER.look.ao.strength, bandMax = RENDER.look.ao.bandMax) {
  if (geometry.userData && geometry.userData.aoBaked) return geometry;
  const THREE = window.THREE;
  const pos = geometry.attributes.position;
  if (!pos) return geometry;
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  const nrm = geometry.attributes.normal;
  const n = pos.count;
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) { const y = pos.getY(i); if (y < minY) minY = y; if (y > maxY) maxY = y; }
  const band = Math.min(PART.aoBandFrac * (maxY - minY), bandMax);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    let f = 1;
    if (strength > 0) {
      const t = band > 1e-6 ? Math.min(1, Math.max(0, (pos.getY(i) - minY) / band)) : 1;
      const s = t * t * (3 - 2 * t);
      f = 1 - strength * (1 - s);
      if (nrm.getY(i) < PART.aoUndersideNy) f *= PART.aoUnderside;
    }
    col[i * 3] = f; col[i * 3 + 1] = f; col[i * 3 + 2] = f;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (!geometry.userData) geometry.userData = {};
  geometry.userData.aoBaked = true;
  return geometry;
}

/* ── materials ────────────────────────────────────────────────────────────────── */

/* ⚠ A TEXTURED PART TAKES NO TINT. `map` is MULTIPLIED by `color`, so passing def.colour
 * alongside a texture that already carries the object's hue darkens it twice — the couch
 * came out near-black where its definition says red-brown. def.colour survives as the
 * fallback for prefabs with no texture of their own, which is what it was always for.
 *
 * Materials are memoised per (kind, colour, texture, repeat, extras): the manifest builds
 * ~25 objects from ~40 distinct materials, and surface() clones the map per `repeat`, so
 * one material per site would be one texture clone per site. Nothing downstream mutates a
 * prefab material (verified: registry.js and tools.js only touch mesh transforms).
 * TWO RULES this memo imposes: (1) every material here is vertexColors:true, so a mesh added
 * outside part()/slab()/bar()/cyl()/mesh() — which all bake the 'color' attribute — renders
 * BLACK; (2) the material is SHARED across every instance of every prefab using it, so a
 * per-entity effect (grab highlight, damage tint) must clone the material on that mesh, never
 * write to mesh.material in place. */
const _matCache = new Map();
function mat(kind, colour = 0xffffff, opts = {}) {
  const map = opts.map || null;
  const key = kind + '|' + colour + '|' + (map ? map.uuid : '-') + '|' +
              (opts.repeat ? opts.repeat.join(',') : '-') + '|' + (opts.side || 0) + '|' + (opts.toy === false ? 'nt' : '');
  if (_matCache.has(key)) return _matCache.get(key);
  const m = surface(kind, colour, { vertexColors: true, ...opts });
  _matCache.set(key, m);
  return m;
}
/** A tiled texture material: one repeat per RENDER.look.texelMetres on 'tile' UV parts. */
const tex = (kind, map, opts = {}) => mat(kind, 0xffffff, { map, repeat: [1, 1], ...opts });
/** A decal material: the map used as-is (ClampToEdge) on a 'face' UV part. */
const decal = (kind, map, opts = {}) => mat(kind, 0xffffff, { map, ...opts });

/* ── mesh helpers — EVERY mesh in this file goes through one of these (header rule 1) ── */

/** One rounded box, positioned in the object's local frame (origin = collider centre). */
function part(g, w, h, d, x, y, z, material, opts = {}) {
  const THREE = window.THREE;
  const mesh = new THREE.Mesh(roundedBox(THREE, w, h, d, opts), material);
  mesh.position.set(x, y, z);
  mesh.name = opts.name || '';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}

/** One rounded slab with a [faceMat, edgeMat] pair. */
function slab(g, w, h, d, x, y, z, materials, opts = {}) {
  const THREE = window.THREE;
  const mesh = new THREE.Mesh(roundedSlab(THREE, w, h, d, opts), materials);
  mesh.position.set(x, y, z);
  mesh.name = opts.name || '';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}

/**
 * A handle or tape strip: `len` along `axis`, `thick` along `normal` (the axis it lies flat
 * against), `width` along the remaining axis; radius thick × 0.45. Built axis-aligned rather
 * than rotated, so its AABB is exact for prefabBounds.
 */
function bar(g, len, thick, x, y, z, material, axis = 'x', width = thick, normal = 'y', name = 'bar', uv = 'tile') {
  if (normal === axis) normal = axis === 'y' ? 'z' : 'y';
  const dims = { x: width, y: width, z: width };
  dims[axis] = len;
  dims[normal] = thick;
  return part(g, dims.x, dims.y, dims.z, x, y, z, material, { radius: thick * PART.barRadiusFrac, name, uv });
}

/* The tape's centre stripe must run ALONG the strip. On a 'face'-UV strip u runs across the
 * width and v along the length (Y face: (x, z); Z face: (x, y)), and texTape draws its
 * stripe horizontally (constant v) — so the texture is rotated a quarter turn once, here,
 * rather than each strip carrying its own UV convention. One material, three strips. */
let _tapeMat = null;
function tapeMaterial() {
  if (_tapeMat) return _tapeMat;
  const t = texTape().clone();
  t.center.set(0.5, 0.5);
  t.rotation = Math.PI / 2;
  t.needsUpdate = true;
  _tapeMat = mat('tape', 0xffffff, { map: t });
  return _tapeMat;
}

/** A (tapered) cylinder: `r1` at +Y, `r2` at -Y before rotation. rotZ lays the axis along X,
 *  rotX lays it along Z. Segments 12 by default — round enough at 4 m, cheap enough ×40. */
function cyl(g, r1, r2, h, x, y, z, material, seg = PART.segments, rotZ = 0, rotX = 0) {
  const THREE = window.THREE;
  const geo = bakeVertexAO(new THREE.CylinderGeometry(r1, r2, h, seg));
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(x, y, z);
  if (rotZ) mesh.rotation.z = rotZ;
  if (rotX) mesh.rotation.x = rotX;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}

/** Any other geometry (lamp shade, glow disc). Bakes the AO attribute like the rest. */
function mesh(g, geometry, material, x, y, z, name = '') {
  const THREE = window.THREE;
  const m = new THREE.Mesh(bakeVertexAO(geometry), material);
  m.position.set(x, y, z);
  m.name = name;
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return m;
}

function hueToHex(h) {
  const THREE = window.THREE;
  return new THREE.Color().setHSL(h / 360, PREFAB_PALETTE.bookSat, PREFAB_PALETTE.bookLight).getHex();
}

/* ── the builders ──────────────────────────────────────────────────────────────── */

const BUILD = {
  /* Boxes. Liner texture on a 'face' UV body so the stencil is centred on every side at
   * every box size; lid as a slab (cap = centre-seam liner, edge band = the cut flutes);
   * three tape strips of real geometry — the one specular element on a carton. The strips
   * form ONE continuous band across the lid and down both ±Z faces (across the seam), which
   * is what a taped carton looks like; a top strip along x with down-strips on ±Z would be
   * two disconnected pieces of tape. */
  box(g, d, def) {
    const kind = def.id.indexOf('fragile') >= 0 ? 'fragile'
               : def.mass >= 20 ? 'heavy' : 'plain';
    const hue = kind === 'fragile' ? PREFAB_PALETTE.cardHueFragile : PREFAB_PALETTE.cardHue;
    const body = decal('card', texCardboard(kind, hue));
    const lidFace = decal('card', texCardboardLid(kind, hue));
    const lidEdge = decal('cardEdge', texCardboardEdge());
    const tape = tapeMaterial();
    const bodyH = d.y * (1 - PART.lidFrac);
    // Body bottom at exactly -d.y/2; the lid overlaps its top.
    part(g, d.x - PART.bodyShrink, bodyH, d.z - PART.bodyShrink,
         0, -d.y / 2 + bodyH / 2, 0, body, { uv: 'face', name: 'body' });
    const lidH = d.y * PART.lidFrac - PART.lidDrop;
    const lidTop = d.y / 2 - PART.lidDrop;
    slab(g, d.x * PART.lidInset, lidH, d.z * PART.lidInset,
         0, lidTop - lidH / 2, 0, [lidFace, lidEdge], { uv: 'face', name: 'lid' });
    // Tape: centre of the top strip AT the lid top (half sunk → top face at exactly +d.y/2);
    // the ±Z strips centred 3 mm inside the face (outer face at exactly ±d.z/2, living in
    // the 3 mm the body was shrunk by).
    bar(g, d.z * PART.lidInset, PART.tapeThick, 0, lidTop, 0, tape, 'z', PART.tapeWidth, 'y', 'tape', 'face');
    const drop = d.y * PART.tapeDrop;
    for (const s of [-1, 1]) {
      bar(g, drop, PART.tapeThick, 0, d.y / 2 - drop / 2, s * (d.z / 2 - PART.tapeThick / 2),
          tape, 'y', PART.tapeWidth, 'z', 'tape', 'face');
    }
  },

  couch(g, d, def, opts = {}) {
    const hue = opts.hue !== undefined ? opts.hue : PREFAB_PALETTE.couchHue;
    const light = opts.light || PREFAB_PALETTE.couchLight;
    const seatH = d.y * PART.seatFrac, backT = d.z * PART.backFrac;
    const armW = Math.max(d.x * PART.armFrac, PART.armMin);
    const footH = d.y * PART.footFrac;
    const fab = tex('fabric', texFabric(hue, light));
    const cush = tex('fabric', texFabric(hue, light + PREFAB_PALETTE.cushionLift));
    const wood = tex('walnut', texWood('walnut'));
    // The base sits on its feet, not on the floor — the feet were inside the base before,
    // invisible, and a couch with a shadow gap under it reads as furniture.
    const bottom = -d.y / 2 + footH;
    const baseH = seatH - footH;
    part(g, d.x, baseH, d.z, 0, bottom + baseH / 2, 0, fab, { name: 'base' });
    part(g, d.x, d.y - seatH, backT, 0, seatH / 2, -d.z / 2 + backT / 2, fab, { name: 'back' });
    const armH = d.y * PART.armHFrac - footH;
    for (const s of [-1, 1]) {
      part(g, armW, armH, d.z, s * (d.x / 2 - armW / 2), bottom + armH / 2, 0, fab,
           { radius: PART.cushionRadius, name: 'arm' });
    }
    // Seat cushions, inset so they read as separate pieces; back cushions standing
    // AXIS-ALIGNED against the back (no lean — a rotated AABB exceeds d.z).
    const inner = d.x - armW * 2;
    const n = opts.cushions || 3;
    const pitch = inner / n, cw = pitch - PART.cushionGap;
    const cd = d.z - backT - 2 * PART.cushionGap;
    const ch = d.y * PART.seatCushionFrac;
    const seatY = -d.y / 2 + seatH + d.y * PART.cushionLiftFrac;
    const bh = d.y * PART.backCushionFrac, bt = PART.backCushionT;
    for (let i = 0; i < n; i++) {
      const x = -inner / 2 + pitch * (i + 0.5);
      part(g, cw, ch, cd, x, seatY, backT / 2 - PART.cushionGap, cush,
           { radius: PART.cushionRadius, ao: PART.cushionAO, name: 'cushion' });
      part(g, cw, bh, bt, x, seatY + ch / 2 - PART.cushionSink + bh / 2, -d.z / 2 + backT + bt / 2, cush,
           { radius: PART.cushionRadius, ao: PART.cushionAO, name: 'backCushion' });
    }
    // Feet: tapered, sunk 1 cm into the base so no seam shows at the join.
    const fh = footH + PART.sink;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      cyl(g, PART.footRTop, PART.footRBottom, fh,
          sx * (d.x / 2 - PART.footInset), -d.y / 2 + fh / 2, sz * (d.z / 2 - PART.footInset), wood);
    }
  },

  /* Dresser / nightstand: walnut carcass, a cap slab one tier darker (proud in Y only,
   * inside d.y), fronts inset behind a 12 mm gap, chrome bar handles whose outer face is at
   * exactly +d.z/2, a dark plinth. def.colour no longer multiplies any textured part. */
  drawers(g, d, def, opts = {}) {
    const n = opts.drawers || 3;
    const carcass = tex('walnut', texWood('walnut'));
    const cap = tex('walnut', texWood('walnut', PREFAB_PALETTE.walnutDark));
    const chrome = mat('chrome', PREFAB_PALETTE.chrome);
    const plinth = mat('paintDark', PREFAB_PALETTE.plinth);
    const { gap, capT, plinthH, frontT, frontRecess } = PART;
    part(g, d.x, d.y - capT - plinthH, d.z - frontRecess, 0, (plinthH - capT) / 2, -frontRecess / 2, carcass, { name: 'carcass' });
    slab(g, d.x, capT, d.z, 0, d.y / 2 - capT / 2, 0, [cap, cap], { name: 'cap' });
    part(g, d.x - PART.plinthInset, plinthH, d.z - frontRecess, 0, -d.y / 2 + plinthH / 2, -frontRecess / 2, plinth, { name: 'plinth' });
    const H = d.y - capT - plinthH;
    const dh = (H - gap * (n + 1)) / n;
    for (let i = 0; i < n; i++) {
      const y = -d.y / 2 + plinthH + gap + dh / 2 + i * (dh + gap);
      part(g, d.x - gap * 2, dh, frontT, 0, y, d.z / 2 - frontRecess + frontT / 2, carcass,
           { radius: PART.frontRadius, name: 'front' });
      bar(g, PART.handleLen, PART.handleThick, 0, y, d.z / 2 - PART.handleThick / 2, chrome, 'x');
    }
  },

  wardrobe(g, d, def) {
    const carcass = tex('walnut', texWood('walnut'));
    const door = tex('walnut', texWood('walnut', PREFAB_PALETTE.walnutDoor));
    const cap = tex('walnut', texWood('walnut', PREFAB_PALETTE.walnutDark));
    const chrome = mat('chrome', PREFAB_PALETTE.chrome);
    const plinth = mat('paintDark', PREFAB_PALETTE.plinth);
    const { gap, capT, plinthH, frontT, frontRecess } = PART;
    // Top and back are 'tile' UV (the default) — no clamp smear across two metres.
    part(g, d.x, d.y - capT - plinthH, d.z - frontRecess, 0, (plinthH - capT) / 2, -frontRecess / 2, carcass, { name: 'carcass' });
    slab(g, d.x, capT, d.z, 0, d.y / 2 - capT / 2, 0, [cap, cap], { name: 'cap' });
    part(g, d.x - PART.plinthInset, plinthH, d.z - frontRecess, 0, -d.y / 2 + plinthH / 2, -frontRecess / 2, plinth, { name: 'plinth' });
    const dw = (d.x - 3 * gap) / 2, dh = d.y - capT - plinthH - 2 * gap;
    const y = (plinthH - capT) / 2;
    for (const s of [-1, 1]) {
      part(g, dw, dh, frontT, s * (gap / 2 + dw / 2), y, d.z / 2 - frontRecess + frontT / 2, door,
           { radius: PART.frontRadius, name: 'door' });
      bar(g, PART.wardrobeHandleLen, PART.handleThick, s * (gap / 2 + PART.handleThick * 2), y,
          d.z / 2 - PART.handleThick / 2, chrome, 'y');
    }
  },

  shelf(g, d, def) {
    const oak = tex('oak', texWood('oak'));
    const t = PART.boardT, bt = PART.backboardT, n = PART.shelves;
    part(g, d.x - 2 * t, d.y, bt, 0, 0, -d.z / 2 + bt / 2, oak, { name: 'back' });
    for (const s of [-1, 1]) part(g, t, d.y, d.z, s * (d.x / 2 - t / 2), 0, 0, oak, { name: 'side' });
    const pitch = (d.y - t) / n;
    for (let i = 0; i <= n; i++) {
      part(g, d.x - 2 * t, t, d.z - bt, 0, -d.y / 2 + t / 2 + i * pitch, bt / 2, oak, { name: 'board' });
    }
    // Books, so a bookshelf is not an empty frame: ten, six hues, min 45 mm wide (P7).
    const books = PREFAB_PALETTE.books.map((h) => mat('plastic', hueToHex(h)));
    const span = Math.max(PART.bookSpanMin, d.x - 2 * t - 2 * PART.bookMargin);
    const bd = d.z * PART.bookDepthFrac;
    for (let i = 0; i < PART.books; i++) {
      const y = -d.y / 2 + t + (i % n) * pitch + PART.bookH / 2;
      const bw = PART.bookMinW + (i % 3) * PART.bookStepW;
      const bx = -d.x / 2 + t + PART.bookMargin + ((i * PART.bookPitch) % span);
      part(g, bw, PART.bookH, bd, bx, y, bt + PART.sink, books[i % books.length],
           { radius: PART.bookRadius, name: 'book' });
    }
  },

  table(g, d, def, opts = {}) {
    const oak = tex('oak', texWood('oak'));
    const topT = Math.max(PART.tableTopMin, d.y * PART.tableTopFrac);
    slab(g, d.x, topT, d.z, 0, d.y / 2 - topT / 2, 0, [oak, oak], { name: 'top' });
    const legH = d.y - topT + PART.sink;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      cyl(g, PART.legRTop, PART.legRBottom, legH,
          sx * (d.x / 2 - PART.legInset), -d.y / 2 + legH / 2, sz * (d.z / 2 - PART.legInset), oak);
    }
    if (opts.shelf) {
      slab(g, d.x - PART.shelfInset, PART.shelfT, d.z - PART.shelfInset,
           0, -d.y / 2 + (d.y - topT) * PART.shelfHeightFrac, 0, [oak, oak], { name: 'shelf' });
    }
  },

  chair(g, d, def) {
    const oak = tex('oak', texWood('oak'));
    const seatY = -d.y / 2 + d.y * PART.seatFracChair;
    slab(g, d.x, PART.seatT, d.z, 0, seatY, 0, [oak, oak], { name: 'seat' });
    // Back: two horizontal slats between two posts (was one slab).
    const pw = PART.postW;
    const postBottom = seatY - PART.seatT / 2;
    const ph = d.y / 2 - postBottom;
    for (const s of [-1, 1]) {
      part(g, pw, ph, pw, s * (d.x / 2 - pw / 2), postBottom + ph / 2, -d.z / 2 + pw / 2, oak, { name: 'post' });
    }
    for (const f of PART.slatFracs) {
      part(g, d.x - 2 * pw, PART.slatH, PART.slatT, 0, seatY + (d.y / 2 - seatY) * f, -d.z / 2 + pw / 2, oak, { name: 'slat' });
    }
    const legH = postBottom + d.y / 2 + PART.sink;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      cyl(g, PART.chairLegRTop, PART.chairLegRBottom, legH,
          sx * (d.x / 2 - PART.chairLegInset), -d.y / 2 + legH / 2, sz * (d.z / 2 - PART.chairLegInset), oak);
    }
  },

  lamp(g, d, def) {
    const THREE = window.THREE;
    const r = Math.min(d.x, d.z) / 2;
    const baseR = r * PART.lampBaseFrac;
    cyl(g, baseR, baseR, PART.lampBaseT, 0, -d.y / 2 + PART.lampBaseT / 2, 0,
        mat('paint', PREFAB_PALETTE.lampBase), PART.roundSegments);
    const poleH = d.y * PART.poleFrac;
    cyl(g, PART.poleR, PART.poleR, poleH, 0, -d.y / 2 + PART.lampBaseT + poleH / 2, 0,
        mat('chrome', PREFAB_PALETTE.chrome));
    // Shade top at exactly +d.y/2, so the lamp is as tall as its collider says.
    const shadeH = d.y * PART.shadeFrac;
    const shadeY = d.y / 2 - shadeH / 2;
    mesh(g, new THREE.CylinderGeometry(r * PART.shadeTopFrac, r, shadeH, PART.shadeSegments, 1, true),
         mat('paper', PREFAB_PALETTE.shade, { side: THREE.DoubleSide }), 0, shadeY, 0, 'shade');
    // The unlit disc 2 mm under the shade's lower rim: the lamp reads switched on, and it is
    // the prefab's one guaranteed bloom source. Not a caster — it is light, not a thing.
    const glow = mesh(g, new THREE.CircleGeometry(r * PART.glowFrac, PART.shadeSegments),
                      basic(PREFAB_PALETTE.glow, { toneMapped: false, side: THREE.DoubleSide }),
                      0, shadeY - shadeH / 2 - PART.glowGap, 0, 'glow');
    glow.rotation.x = Math.PI / 2;
    glow.castShadow = false;
  },

  tv(g, d, def) {
    const bezelH = d.y * PART.bezelHFrac, bezelD = d.z * PART.bezelDFrac;
    const bezelY = d.y / 2 - bezelH / 2;          // bezel top at exactly +d.y/2
    const bezelZ = -d.z / 2 + bezelD / 2;
    part(g, d.x, bezelH, bezelD, 0, bezelY, bezelZ, mat('plasticGloss', PREFAB_PALETTE.bezel),
         { radius: PART.bezelRadius, name: 'bezel' });
    // Screen, 2 mm proud of the bezel face so it reads as glass in a frame.
    part(g, d.x - PART.screenInset, bezelH - PART.screenInset, PART.screenT, 0, bezelY,
         -d.z / 2 + bezelD + PART.screenProud - PART.screenT / 2, decal('glass', texScreen()),
         { uv: 'face', name: 'screen' });
    const plastic = mat('plastic', PREFAB_PALETTE.tvStand);
    const footH = d.y * PART.footHFrac;
    part(g, d.x * PART.footWFrac, footH, d.z * PART.footDFrac, 0, -d.y / 2 + footH / 2, 0, plastic, { name: 'foot' });
    // Neck from 1 cm inside the foot to 1 cm inside the bezel (no seam, no gap); its depth
    // is the bezel's so it cannot leave d.z.
    const neckBottom = -d.y / 2 + footH - PART.sink;
    const neckTop = bezelY - bezelH / 2 + PART.sink;
    part(g, PART.neckW, neckTop - neckBottom, bezelD, 0, (neckTop + neckBottom) / 2, bezelZ, plastic, { name: 'neck' });
  },

  mirror(g, d, def) {
    // Frame recessed 4 mm so the glass stands proud of it (a flush pair z-fights).
    part(g, d.x, d.y, d.z - PART.frameRecess, 0, 0, -PART.frameRecess / 2, tex('oak', texWood('oak')), { name: 'frame' });
    const inset = Math.min(PART.mirrorInsetMax, d.x * PART.mirrorInsetFrac);
    part(g, d.x - inset * 2, d.y - inset * 2, PART.glassT, 0, 0, d.z / 2 - PART.glassT / 2,
         decal('mirror', texMirror()), { uv: 'face', name: 'glass' });
  },

  fridge(g, d, def) {
    const steel = tex('steel', texSteel());
    const dark = mat('paintDark', PREFAB_PALETTE.gasket);
    const chrome = mat('chrome', PREFAB_PALETTE.chrome);
    const ph = PART.fridgePlinthH;
    const { doorGap, doorT, doorMargin, doorRecess, gasketBand, gasketT, gasketRecess } = PART;
    part(g, d.x, d.y - ph, d.z - doorMargin, 0, ph / 2, -doorMargin / 2, steel, { name: 'body' });
    part(g, d.x - doorMargin, ph, d.z - 2 * doorMargin, 0, -d.y / 2 + ph / 2, -doorMargin,
         mat('paintDark', PREFAB_PALETTE.fridgePlinth), { name: 'plinth' });
    // Door split: freezer on top, fridge below — two panels, a 10 mm gap, each on a dark
    // plate 6 mm larger all round (the gasket groove), all within depth.
    const splitY = d.y * PART.fridgeSplitFrac;
    const pw = d.x - 2 * doorMargin;
    const panels = [
      [splitY + doorGap / 2, d.y / 2 - doorMargin],
      [-d.y / 2 + ph + doorGap, splitY - doorGap / 2],
    ];
    panels.forEach(([lo, hi], i) => {
      const h = hi - lo, c = (lo + hi) / 2;
      part(g, pw + 2 * gasketBand, h + 2 * gasketBand, gasketT, 0, c, d.z / 2 - gasketRecess, dark, { name: 'gasket' });
      part(g, pw, h, doorT, 0, c, d.z / 2 - doorRecess, steel, { radius: PART.doorRadius, name: 'door' });
      // Handles meet at the split: under the freezer, atop the fridge door.
      const hy = i === 0 ? lo + PART.fridgeHandleDrop : hi - PART.fridgeHandleDrop;
      bar(g, pw * PART.fridgeHandleFrac, PART.handleThick, 0, hy, d.z / 2 - PART.handleThick / 2, chrome, 'x');
    });
  },

  mattress(g, d, def) {
    const body = tex('ticking', texTicking('body'));
    const piping = tex('ticking', texTicking('piping'));
    // Slab top 4 mm under d.y/2 so the buttons stand 4 mm proud of it and reach exactly d.y/2.
    const drop = PART.buttonProud;
    slab(g, d.x, d.y - drop, d.z, 0, -drop / 2, 0, [body, piping], { radius: PART.mattressRadius, name: 'body' });
    const button = mat('plastic', PREFAB_PALETTE.button);
    for (let i = 0; i < PART.buttons; i++) {
      const bx = -d.x / 2 + d.x * (PART.buttonX0 + PART.buttonXStep * (i % PART.buttonCols));
      const bz = -d.z / 2 + d.z * PART.buttonRows[Math.floor(i / PART.buttonCols)];
      cyl(g, PART.buttonR, PART.buttonR, PART.buttonT, bx, d.y / 2 - PART.buttonT / 2, bz, button);
    }
  },
};

/** prefab name -> builder + options. Anything unlisted falls back to a painted box. */
const PREFABS = {
  box_small:       [BUILD.box],
  box_heavy:       [BUILD.box],
  box_fragile:     [BUILD.box],
  couch_3seat:     [BUILD.couch, { hue: PREFAB_PALETTE.couchHue, light: PREFAB_PALETTE.couchLight, cushions: 3 }],
  armchair:        [BUILD.couch, { hue: PREFAB_PALETTE.armchairHue, light: PREFAB_PALETTE.armchairLight, cushions: 1 }],
  dresser:         [BUILD.drawers, { drawers: 3 }],
  nightstand:      [BUILD.drawers, { drawers: 2 }],
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
 * @returns {THREE.Group} centred on the collider centre, entirely within `def.dimensions`,
 *   every part a DIRECT child.
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
    part(g, d.x, d.y, d.z, 0, 0, 0, mat('paint', def.colour || PREFAB_PALETTE.fallback), { name: 'fallback' });
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
  /* Only the uncached geometry (cylinders, shades) is disposed: a cached roundedBox is shared
   * with every live mesh of that size, and disposing it would only cost a re-upload. */
  g.traverse((o) => { if (o.geometry && !o.geometry.userData.cached) o.geometry.dispose(); });
  return {
    size: { x: size.x, y: size.y, z: size.z },
    centre: { x: centre.x, y: centre.y, z: centre.z },
  };
}

/* ── tool visuals (§9.1) ─────────────────────────────────────────────────────────── */

const TOOL_BUILD = {
  /* Flat dolly: painted deck slab on two side rails, two rubber rollers on chrome axles.
   * The deck top is at +d.y/2 and the rollers touch -d.y/2, so the tool is exactly as tall
   * as TOOLS.dolly.liftM says the load sits. */
  dolly_flat_01(g, d, def) {
    const paint = mat('paint', def.colour);
    const rubber = tex('rubber', texRubber(), { toy: false });
    const chrome = mat('chrome', PREFAB_PALETTE.chrome);
    const deckT = PART.dollyDeckT, railT = PART.dollyRailT;
    slab(g, d.x, deckT, d.z, 0, d.y / 2 - deckT / 2, 0, [paint, paint], { name: 'deck' });
    for (const s of [-1, 1]) {
      bar(g, d.x, railT, 0, d.y / 2 - deckT - railT / 2, s * (d.z / 2 - railT / 2), paint, 'x');
    }
    const rollerR = (d.y - deckT) / 2;
    const rollerZ = d.z / 2 - PART.dollyRollerInset;
    for (const s of [-1, 1]) {
      cyl(g, rollerR, rollerR, d.x - 2 * PART.dollyRollerEnd, 0, -d.y / 2 + rollerR, s * rollerZ,
          rubber, PART.roundSegments, Math.PI / 2);
      cyl(g, PART.dollyAxleR, PART.dollyAxleR, d.x - 2 * PART.dollyAxleEnd, 0, -d.y / 2 + rollerR, s * rollerZ,
          chrome, PART.segments, Math.PI / 2);
    }
  },

  /* The purple plank becomes a quilted slab. */
  blanket_01(g, d, def) {
    const quilt = tex('quilt', texQuilt());
    slab(g, d.x, d.y, d.z, 0, 0, 0, [quilt, quilt], { radius: PART.blanketRadius, name: 'blanket' });
  },

  ramp_01(g, d, def) {
    const panel = tex('steelPanel', texTruckWall());
    slab(g, d.x, d.y, d.z, 0, 0, 0, [panel, panel], { name: 'ramp' });
  },

  /* Handle (plastic, def.colour) at +Z tapering toward the chrome shaft at -Z. */
  screwdriver_01(g, d, def) {
    const handleR = Math.min(d.x, d.y) / 2 * PART.driverHandleFit;
    const handleL = d.z * PART.driverHandleFrac;
    // rotX = π/2 maps the cylinder's +Y (r1) onto +Z, so the fat end is the back of the handle.
    cyl(g, handleR, handleR * PART.driverHandleTaper, handleL, 0, 0, d.z / 2 - handleL / 2,
        mat('plastic', def.colour), PART.segments, 0, Math.PI / 2);
    const shaftL = d.z - handleL + PART.sink;
    cyl(g, PART.driverShaftR, PART.driverShaftR, shaftL, 0, 0, -d.z / 2 + shaftL / 2,
        mat('chrome', PREFAB_PALETTE.chrome), PART.segments, 0, Math.PI / 2);
  },
};

/**
 * The visual for one tool definition (src/tools/definitions.js): a Group centred on the
 * body origin and inside `def.dimensions`, castShadow/receiveShadow set on every mesh.
 * Unknown ids get a painted rounded box in def.colour.
 */
export function buildToolVisual(def) {
  const THREE = window.THREE;
  const g = new THREE.Group();
  const d = def.dimensions;
  const build = TOOL_BUILD[def.id];
  if (build) build(g, d, def);
  else part(g, d.x, d.y, d.z, 0, 0, 0, mat('paint', def.colour || PREFAB_PALETTE.fallback), { name: 'tool' });
  return g;
}

export { PREFABS };
