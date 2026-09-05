/* Phase 0 diagnostic scene — GDD §20.4, §25.2 phase 0 ("standalone launch, scene").
 *
 * §20.4: "Prototype visuals are diagnostic: simple meshes, color separation, contact
 * shadows, and faithful collision." This scene is built to be MEASURED, not admired.
 *
 * It is not the Phase 5 house. It is the smallest thing that makes the central spatial
 * question visible on day one: a 2.1m couch, three doorways at 0.82 / 0.86 / 0.91 m, and a
 * metre grid to read them against. §26.2 requires that a couch-equivalent can be "rotated
 * through a door"; putting that geometry on screen in Phase 0 means every later phase is
 * judged against the real clearance instead of a guess. See APERTURES below — for one of
 * those three doors the answer is that it cannot, and that is the interesting one.
 *
 * COLLIDERS ARE THE SHARED RECORD. The same AABB list feeds the camera's occlusion test
 * now and static collision later. §8.1: "decorative collision must not contradict the
 * visible surface" — one record is how that stays true. Pattern from
 * AirportBaggageCrew\src\data\airport.js (Dev\INDEX.md → "Map as pure data").
 *
 * PHASE 15 — THE OVERCOOKED LOOK (chosen 2026-09-02). Every material site in this file now
 * names a material CLASS through surface(kind, colour, opts) from materials.js; the two
 * helpers mat()/surf() are thin wrappers so the call sites read as they always did. What a
 * kind means — specular, shininess, paired height bump, env sheen, rim — lives in ONE table
 * there, so the plaster on a partition and the plaster on the front wall's inside face cannot
 * drift apart. The software tier (the 14-suite harness) gets the same kinds with the
 * per-fragment extras stripped at construction, which is materials.js's job, not this file's.
 *
 * Geometry added here, and the rule each piece obeys:
 *   - SKIRTING BOARDS as geometry (0.012 × 0.10 m timber strips) along every interior wall
 *     base, stopped 0.05 m short of every door gap. A skirting drawn into the plaster canvas
 *     smeared across every wall length; a strip is the same at 10 m and at 1 m. No collider,
 *     never in a clear box: m13's boxes shrink 2 cm per side and the strip stops 5 cm short.
 *   - AO SKIRTS: one merged strip mesh per house, 0.30 m wide along every wall base, a
 *     multiply-blended gradient from the wall out. This is the contact darkening a real
 *     room has where the floor meets the wall and that no light in this rig can make (a
 *     hemisphere does not occlude). Lifted to 0.024 — above the 0.021 rug, under the 0.06 m
 *     floor of the doorway sweeps.
 *   - PLANK FLOORS: the house floor, the destination floor and the truck deck are ONE merged
 *     BufferGeometry each of 0.14 × 1.20 m plank quads with real 3 mm gaps over a dark
 *     under-plane 2 mm lower, and a per-plank 'color' attribute (L ± 0.04). NO y jitter —
 *     flat, so SwiftShader's depth stays clean with three near-coplanar layers (under-plane,
 *     planks, rug/skirt) within 9 mm. ~400 planks, 1 draw call per floor.
 *   - the ceiling gets its own material (an edge vignette), the hedge is nine rounded boxes,
 *     the flattened cartons are cardboard slabs, one oil-stain decal replaces the per-tile
 *     stain in the asphalt, the bulbs are unlit 0xfff3d0 with tone mapping OFF (the one
 *     guaranteed bloom source), the fog reads RENDER.look.fog.
 *   - MULTIPLY DECALS (AO skirts, oil stain) are Basic materials tagged userData.LAYER, never
 *     userData.kind: `kind` means "a surface() class with a light response" and m13 G12
 *     asserts shininess on every one it finds.
 *   - LAPPED-SIDING GEOMETRY WAS DELIBERATELY NOT BUILT: a merged front-face mesh spans the
 *     three doorway gaps and fails B1. The siding texture's lap height map carries the read.
 * Collider count: unchanged. Nothing here registers one (m13 C1/C3), and nothing enters a
 * doorway clear box (m13 B1/B1b — the interior sweep exists now; tools/_probe-world.js
 * re-runs both against the destination's doors as well).
 */

import { RENDER, DOOR } from '../config.js';

/** Real dimensions, metres. §7.1 gives couch_3seat_01 as 2.1 x 0.9 x 0.85 explicitly. */
export const REFERENCE_DIMS = Object.freeze({
  movingBox:   { x: 0.50, y: 0.50, z: 0.50, mass: 12,  label: 'box 0.5m' },
  couch3Seat:  { x: 2.10, y: 0.85, z: 0.90, mass: 90,  label: 'couch 2.1m (GDD §7.1)' },
  dresser:     { x: 1.10, y: 0.85, z: 0.50, mass: 55,  label: 'dresser 1.1m' },
  doorwayHeight: 2.03,
  moverHeight: 1.80,
});

/* THE CENTRAL CLEARANCE FACT, measured from the GDD's own numbers.
 *
 * couch_3seat_01 (§7.1) has a 0.90 x 0.85 m cross-section. A rigid box passes a slot of
 * width g if and only if min over theta of (w*|cos| + h*|sin|) <= g, and that minimum is
 * just min(w, h) — every interior angle is worse than both endpoints. So the couch's
 * narrowest possible presentation is 0.850 m, in EVERY rotation, forever.
 *
 *   32" interior door  0.82 m  ->  IMPOSSIBLE. Short by 30 mm. §8.2's remove-the-door or
 *                                  unscrew-the-legs is not a shortcut here, it is the
 *                                  only solution — which is exactly §3.3's "preparation
 *                                  versus brute force" with the brute-force branch shut.
 *   34" door           0.86 m  ->  passes on its side, 10 mm to spare. Terrifying.
 *   36" front door     0.91 m  ->  passes on its side with 60 mm; face-on by 10 mm.
 *
 * All three are built into the Phase 0 wall so the relationship is measurable on day one
 * rather than discovered at Phase 5. tools\m0-tests.js asserts each case.
 */
/* …AND SINCE M11 TWO OF THEM HAVE THEIR DOORS ON. `leaf` hangs a real 40 mm leaf in the
 * opening (house.js — hinge jamb, swing side, and how a removed leaf is laid down), so the
 * usable width is gap − 0.04 until the screwdriver takes it off: the 34" door is 0.82 m clear
 * with its leaf hung, i.e. the "impossible" 32-inch figure was this door with its door on.
 * door34 is the §15.2 front door (`front`: its removal earns the review tag
 * front_door_removed). interior32 swings OUT onto the grass — it opens onto no room, and the
 * living-room side is where door34's leaf is laid down. front36 stays leafless: it is the
 * opening on every route and the one a couch actually uses. `height` is the header line
 * every front opening has always been built to (REFERENCE_DIMS.doorwayHeight). */
export const APERTURES = Object.freeze([
  { id: 'interior32', gap: 0.82, label: '32" interior', x: -3.2, height: REFERENCE_DIMS.doorwayHeight,
    leaf: { t: DOOR.leaf.t, hinge: +1, swing: +1, lay: 'room' } },
  { id: 'door34',     gap: 0.86, label: '34" door',     x:  0.0, height: REFERENCE_DIMS.doorwayHeight,
    leaf: { t: DOOR.leaf.t, hinge: -1, swing: -1, lay: 'room', front: true } },
  { id: 'front36',    gap: 0.91, label: '36" front',    x:  3.2, height: REFERENCE_DIMS.doorwayHeight },
]);

/* ── Phase 1 test geometry ───────────────────────────────────────────────────────────
 * §25.2's Phase 1 gate is "responsive INDOORS and ON RAMP", so both have to exist before
 * locomotion can be judged. Every piece below is a SPEC, not a mesh: the renderer builds
 * geometry from it and the physics world builds colliders from the same record, so §8.1's
 * "decorative collision must not contradict the visible surface" holds by construction
 * rather than by discipline.
 *
 * Heights are chosen against the controller tuning in config.js, so each piece tests a
 * specific behaviour rather than being decorative:
 *   porch step 0.18  — under PLAYER.stepHeight (0.35): autostep, no jump needed
 *   ledge      0.60  — over mantleMinHeight (0.45): a real mantle
 *   ledge      1.25  — under mantleMaxHeight (1.35): the tallest legal mantle
 *   wall       1.60  — over mantleMaxHeight: must REFUSE to mantle
 */

/** Ramp up to the platform. Rotating a box about +X tips its +Z end DOWN, so this rises
 *  toward -Z. angle 0.28 rad = 16 deg, comfortably under maxSlopeClimbDeg (48). */
export const RAMP = Object.freeze({
  x: 7.5, z: 2.4, width: 3.0, length: 4.35, thickness: 0.25, angleRad: 0.28, y: 0.72,
});

/** Landing at the top of the ramp. */
export const PLATFORM = Object.freeze({ x: 7.5, y: 1.2, z: -1.6, width: 3.0, depth: 3.0, thickness: 0.24 });

/** Boxes to walk up (autostep) and to mantle (climb). `expectMantle` is what the Phase 1
 *  suite asserts, so this table is the test fixture as well as the level. */
export const OBSTACLES = Object.freeze([
  { id: 'porchStep', x: -1.2, z: 3.4, w: 2.0, d: 0.9, top: 0.18, expectMantle: false, note: 'autostep clears it' },
  { id: 'ledgeLow',  x: -4.6, z: 0.2, w: 1.6, d: 1.2, top: 0.60, expectMantle: true,  note: 'lowest real mantle' },
  { id: 'ledgeHigh', x: -6.8, z: 0.2, w: 1.6, d: 1.2, top: 1.25, expectMantle: true,  note: 'tallest legal mantle' },
  { id: 'tooTall',   x: -9.0, z: 0.2, w: 1.6, d: 1.2, top: 1.60, expectMantle: false, note: 'above mantleMaxHeight' },
]);

/** A closed room behind the aperture wall — the "indoors" half of the gate, and the place
 *  §4.1's "indoors it should compress smoothly" camera behaviour gets exercised. */
/* ROOM now LIVES IN world/house.js and is re-exported here.
 *
 * Phase 5 subdivides this shell into three rooms, so the shell and its partitions have to
 * be one record — house.js needs the bounds to place partitions, and this file needs the
 * partitions to build them. Defining ROOM here and importing it there made a genuine import
 * cycle: scene.js would evaluate house.js first, which would read ROOM before this line had
 * run, and get a temporal-dead-zone error rather than a value.
 *
 * The re-export keeps `import { ROOM } from '.../scene.js'` working for everything written
 * against Phases 0-4, including m1's room assertions. One record, one direction of import.
 */
export { ROOM } from '../world/house.js';
import { ROOM, ZONES, PARTITIONS, INTERIOR_DOORS, PARTITION_T, wallSegments } from '../world/house.js';
import { cargoColliders, cargoAnchors, cabColliders } from '../world/truck.js';
import {
  DEST_SHELL, DEST_ZONES, DEST_PARTITIONS, DEST_DOORS, DEST_APERTURE, destColliders,
} from '../world/destination.js';
import {
  canvasTex, texGrass, texAsphalt, texConcrete, texSky, texSiding, texShingle, texPlaster,
  texBoards, texBrick, texTruckSide, texTruckWall, texCeiling, texCardboard, texCardboardEdge,
  texRug, texRubber, texWood, texPaint,
} from './textures.js';
import { surface, setRenderTier } from './materials.js';
import { buildLighting, LIGHTING } from './lighting.js';
import { roundedBox, roundedSlab } from './prefabs.js';

/** Narrowest presentation of a w x h cross-section over all rotations. See above. */
export function minProjectedWidth(w, h) { return Math.min(w, h); }

/** Can a w x h cross-section pass an aperture of `gap` width? Pure geometry, no physics —
 *  which is why it is assertable in Phase 0, before a solver exists. */
export function fitsThroughGap(w, h, gap) {
  return { fits: minProjectedWidth(w, h) <= gap, faceOn: w <= gap, clearance: gap - minProjectedWidth(w, h) };
}

const PALETTE = {
  grass:    0x6f8f4a,
  asphalt:  0x4a4a52,
  wall:     0xd8cfbe,
  trim:     0x8a7f6d,
  couch:    0x8a5a4a,
  dresser:  0x9a7a4e,
  box:      0xc2a06a,
  floor:    0xb9a98c,
  reference:0xa8d93a,          // the Dirty Boy Devs lime — measuring aids, and "this fits"
  impossible:0xff5a5a,         // coral — "the couch cannot pass this, in any rotation"
};

/* ── Phase 15 constants — named, never bare in a system (§25.1) ─────────────────────────
 * Anything a shader or material reads that is SHARED with other modules comes from
 * RENDER.look; what is local to this file's geometry is named here. */
const LOOK = RENDER.look;

/** Floor layering, metres. Three near-coplanar layers live within 9 mm: the dark under-plane,
 *  the planks 2 mm above it, then the rug (0.021) and the AO skirts (0.024). Under-plane and
 *  planks are flat (no jitter); the skirts carry polygonOffset. Do not shrink the gaps —
 *  2 mm is already the smallest step the interior screenshot on SwiftShader keeps clean. */
const FLOOR = Object.freeze({
  houseY: 0.015,          // today's house floor height, unchanged
  rugY: 0.021,
  underGap: 0.002,        // planks sit this far above the under-plane
  hostGap: 0.002,         // under-plane sits this far above a host box top (deck, dest slab)
});

/** Plank floors. ~400 planks over the 9.8 × 6.8 m house interior: 4 verts + 2 tris each,
 *  one draw call. The vertex colour is a MULTIPLIER on the boards map (surface() with
 *  vertexColors:true), L ± 0.04 so adjacent planks separate without reading as a checker. */
const PLANK = Object.freeze({
  w: 0.14, len: 1.20, gap: 0.003, lJitter: 0.04,
  stagger: 3,             // row offsets cycle 0, 1/3, 2/3 of a plank — a running bond
  minW: 0.02, minLen: 0.03, // slivers narrower/shorter than this at a floor edge are dropped
  under: 0x2b2622,        // the dark line that shows through the 3 mm gaps
  houseHue: 30, destHue: 26, deckHue: 32,
});

/** Skirting boards: 12 × 100 mm painted timber, stopped 50 mm short of every door gap so it
 *  can never enter a clear box (the boxes shrink 20 mm per side; margin 30 mm). */
const SKIRTING = Object.freeze({
  t: 0.012, h: 0.10, doorMargin: 0.05, colour: 0xf2ead9,
  minRun: 0.02,           // a wall span shorter than this between two gaps gets no board
});

/** AO skirts: width/strength from RENDER.look.skirt; the tint is a warm near-black so the
 *  darkening sits in the same hue as the shadows the room spots throw. */
const AO_SKIRT = Object.freeze({ lift: 0.009, tint: [30, 24, 20], texH: 32 });

/** One multiply-blended decal on the driveway where the truck drips. */
const OIL_STAIN = Object.freeze({
  w: 1.6, d: 2.2, behindRear: 1.4, y: 0.012, strength: 0.42, texSize: 128,
  tint: [40, 36, 34],     // the full-strength colour: a cool near-black (oil, not soot)
  midStrength: 0.55,      // the gradient's middle stop, as a fraction of `strength`…
  midStop: 0.45,          // …placed at this fraction of the radius
});

/** Decor resting on a ground plane (hedge, cartons) sits this far above it: a box face
 *  exactly on y = 0 fights the grass plane for the same depth, and 5 mm is under a lawn. */
const DECO_LIFT = 0.005;

const HEDGE = Object.freeze({ w: 1.5, h: 0.95, d: 0.75, r: 0.045, x: -11.5, z0: 1.0, pitch: 1.5, n: 9 });
const CARTONS = Object.freeze({ w: 0.9, t: 0.03, d: 0.7, x: 4.8, z: 11.4, n: 4, yStep: 0.035, ryStep: 0.1 });

/** Bulbs and glow discs: unlit and NOT tone mapped, so they write ~1.0 and are the only
 *  guaranteed bloom sources (the sky dome stays tone mapped and sits at ~0.62). */
const BULB = Object.freeze({ colour: 0xfff3d0, r: 0.045 });
/** Pendant shade: the room's own spot colour pulled halfway toward parchment. */
const SHADE = Object.freeze({ base: 0xd8b06a, mix: 0.5 });
/** The cab is enamel with a deeper gloss than the body panels (materialLibrary: cab 70). */
const CAB_SHININESS = 70;
/** Texture repeats in metres per tile for the ground planes (texGrass authored at 2 m). */
const GRASS_TILE_M = 2;

/** Deterministic noise, so a floor looks the same on every machine and every reload
 *  (same helper as textures.js — kept under one name so the lineage stays greppable). */
function rnd(i) {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/* ── interior wall runs: the one record skirting boards AND AO skirts are cut from ───────
 *
 * A "run" is one interior wall FACE: it travels along `axis` from lo to hi, sits at the
 * constant coordinate `at` on the other axis, and the room extends from it in direction
 * `into`. Door openings (with a margin) and perpendicular partitions (margin 0, so strips
 * meet at the corner) are subtracted by cutRun(). Built from the same door records the
 * walls themselves are cut from, so a strip can no more end up across a doorway than a wall
 * can — the §8.1 rule, applied to trim. */
function interiorRuns({ x0, x1, z0, z1, frontGaps, partitions, doors, partT }) {
  const runs = [];
  const doorGap = (lo, hi) => ({ lo, hi, margin: SKIRTING.doorMargin });
  runs.push({ name: 'W', axis: 'z', at: x0, into: +1, lo: z0, hi: z1, gaps: [] });
  runs.push({ name: 'E', axis: 'z', at: x1, into: -1, lo: z0, hi: z1, gaps: [] });
  runs.push({ name: 'N', axis: 'x', at: z0, into: +1, lo: x0, hi: x1, gaps: [] });
  runs.push({ name: 'S', axis: 'x', at: z1, into: -1, lo: x0, hi: x1,
              gaps: frontGaps.map((g) => doorGap(g[0], g[1])) });
  for (const p of partitions) {
    const mine = doors
      .filter((d) => d.axis === p.axis && Math.abs(d.at - p.at) < 1e-6)
      .map((d) => doorGap(d.centre - d.gap / 2, d.centre + d.gap / 2));
    const lim = p.axis === 'x' ? [x0, x1] : [z0, z1];
    const lo = Math.max(lim[0], Math.min(p.from, p.to));
    const hi = Math.min(lim[1], Math.max(p.from, p.to));
    for (const into of [+1, -1]) {
      runs.push({ name: `${p.id}${into > 0 ? '+' : '-'}`, axis: p.axis, at: p.at + into * partT / 2,
                  into, lo, hi, gaps: mine.slice() });
    }
  }
  // Perpendicular partitions that reach this face interrupt it (margin 0: the strips meet).
  for (const run of runs) {
    for (const q of partitions) {
      if (q.axis === run.axis) continue;
      const qLo = Math.min(q.from, q.to), qHi = Math.max(q.from, q.to);
      if (run.at < qLo - 1e-3 || run.at > qHi + 1e-3) continue;   // q does not reach this face
      if (q.at <= run.lo || q.at >= run.hi) continue;
      run.gaps.push({ lo: q.at - partT / 2, hi: q.at + partT / 2, margin: 0 });
    }
  }
  return runs;
}

/** Solid spans of a run after its gaps (each widened by its margin) are removed. */
function cutRun(run) {
  const gaps = run.gaps.map((g) => [g.lo - g.margin, g.hi + g.margin]).sort((a, b) => a[0] - b[0]);
  const out = [];
  let cursor = run.lo;
  for (const [glo, ghi] of gaps) {
    if (glo > cursor + 1e-4) out.push([cursor, Math.min(glo, run.hi)]);
    cursor = Math.max(cursor, ghi);
  }
  if (run.hi > cursor + 1e-4) out.push([cursor, run.hi]);
  return out.filter(([a, b]) => b - a > SKIRTING.minRun);
}

/**
 * @returns {{scene, colliders, spawn, dispose}}
 *   colliders: {minX,maxX,minZ,maxZ,base,top,tag}[] — shared with camera + physics
 *   spawn: where the player starts (Phase 1)
 */
export function buildScene(renderTier = 'gpu') {
  const THREE = window.THREE;
  /* The tier is pinned HERE as well as in main.js's boot: every surface() below reads it at
   * construction, and a boot order that built the scene first would hand the SwiftShader
   * harness bump/normal/env/rim materials (measured: that took a 4 s suite past 600 s) and
   * would memoise texGrass() WITH a height texture, failing m13 G5. Idempotent — the same
   * value main.js sets — so the belt does not argue with the braces. */
  setRenderTier(renderTier);
  const scene = new THREE.Scene();
  // fog is set with the sky, below, so the two cannot disagree about the horizon colour

  const colliders = [];
  // `friction` is optional and is carried THROUGH to the physics collider. It was dropped
  // here at first, so the truck deck's 0.32 never reached the solver and an unstrapped pack
  // survived a hard brake with a 2 mm shift.
  const addCollider = (cx, cz, sx, sz, base, top, tag, friction) => {
    colliders.push({
      minX: cx - sx / 2, maxX: cx + sx / 2,
      minZ: cz - sz / 2, maxZ: cz + sz / 2,
      base, top, tag,
      ...(friction !== undefined ? { friction } : {}),
    });
  };

  /* ---- lighting ---------------------------------------------------------------------
   * §20.1 still governs — silhouettes and clearances must read. Outdoors a low afternoon
   * sun gives every object a long shadow that says where it is on the ground, which is the
   * depth cue you need to judge whether a couch will clear a door frame.
   *
   * INDOORS that cue was missing entirely: the room shells have ceilings, so the sun is
   * blocked by construction, and a hemisphere light does not occlude — it lights every
   * surface equally whatever is above it. Each room now carries its own shadow-casting
   * spot. The whole rig lives in lighting.js, including the reason the material model had
   * to change before any of it could be seen. */
  /* INDOOR rooms only, and shadows only in the pickup house.
   *
   * A zone is indoors when its ceiling is the shell's wall height; the kerbside aprons are
   * zones too, and `maxY > 1` let them through — which put a shadow-casting spotlight in the
   * middle of the front garden and took the scene to THIRTEEN lights and TEN shadow maps.
   *
   * The destination's rooms get light but no shadow map. The pickup house is where the
   * carrying puzzles are and where a player spends the long half of a contract; delivery is
   * a shorter, simpler visit, and four shadow passes is a budget rather than an accident.
   * §26.6's 45 FPS floor could not be measured here — see the note in tools/_perf.js — so
   * this is a deliberately conservative count rather than a tuned one. */
  const indoor = (z) => z.maxY !== undefined && Math.abs(z.maxY - ROOM.wallH) < 1e-6;
  const rooms = [
    ...ZONES.filter(indoor).map((z) => ({ ...z, castShadow: true })),
    ...DEST_ZONES.filter(indoor).map((z) => ({ ...z, castShadow: false })),
  ];
  const { sun, fill, hemi, ambient, roomLights, tier } = buildLighting(scene, rooms, renderTier);

  /* THE TWO MATERIAL HELPERS, now thin wrappers over surface(). Every site names a kind;
   * an unknown kind throws at build time, which is the point — a typo must not ship as a
   * plain Lambert that looks "nearly right". */
  const mat = (kind, colour, opts = {}) => surface(kind, colour, opts);
  /** A textured surface. `rx`/`ry` are repeats, normally metres × a density. */
  const surf = (kind, tex, rx, ry, opts = {}) =>
    surface(kind, 0xffffff, { map: tex, repeat: [Math.max(0.25, rx), Math.max(0.25, ry)], ...opts });

  /* The house's outward skin. BoxGeometry indexes materials [+X, -X, +Y, -Y, +Z, -Z], and
   * the aperture wall's DRIVEWAY side is +Z — so siding goes at index 4 and plaster at 5.
   * Getting it the wrong way round clads the living room and plasters the front elevation. */
  const extSiding = surf('siding', texSiding(34, 0.62), 5, 1.6);
  const intPlaster = surf('plaster', texPlaster(38, 0.84), 3, 1);   // ry=1: see texPlaster
  const frontWallMats = [intPlaster, intPlaster, intPlaster, intPlaster, extSiding, intPlaster];
  const gardenBrick = surf('brick', texBrick(18), 2, 1);
  const markerMat = mat('marker', PALETTE.reference);
  const impossibleMat = mat('marker', PALETTE.impossible);
  const trimMat = mat('paintedTimber', SKIRTING.colour);
  const underMat = mat('paintDark', PLANK.under);

  /* ---- sky ------------------------------------------------------------------------------
   * An inverted sphere with a gradient on it. The scene used to end at a flat clear colour,
   * which reads as "unfinished" the instant you look up — and you look up constantly in a
   * game about carrying tall things. The fog colour is taken from the gradient's horizon
   * band so the two meet without a seam. */
  /* The fog colour and the sky's horizon stop are the SAME VALUE, deliberately. They were
   * 0xdfe9ee and #e2ebef — three points apart, and enough to draw a bright line along the
   * whole horizon where the fogged ground met the dome. RENDER.post.divider is the same
   * value again: the split-screen gap is painted with it. */
  const HORIZON = 0xdfe9ee;
  /* DIORAMA FOG: 30/120 (from 40/150). The whole site sits inside 120 m, so the far end of
   * the street fades to the horizon colour and the model reads as sitting on a table. */
  scene.fog = new THREE.Fog(HORIZON, LOOK.fog.near, LOOK.fog.far);
  const sky = new THREE.Mesh(
    // ⚠ RADIUS MUST STAY UNDER RENDER.far (300 m). At 400 the dome was outside the far
    // plane and got clipped, which paints a hard diagonal edge of clear colour across the
    // top of the frame — it reads as a rendering glitch, not as a missing sky.
    new THREE.SphereGeometry(240, 32, 20),
    // toneMapped stays at its default TRUE (m13 G10): through ACES the cloud whites land at
    // ~0.62 linear and never cross the 0.86 bloom knee. Pinning it false would bloom the sky.
    new THREE.MeshBasicMaterial({ map: texSky(), side: THREE.BackSide, fog: false }));
  sky.name = 'sky';
  scene.add(sky);

  // ---- ground ------------------------------------------------------------------------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400),
    surf('grass', texGrass(), 400 / GRASS_TILE_M, 400 / GRASS_TILE_M));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Driveway — the §13.1 parking surface, and the flat run a dolly needs (§9.1).
  const drive = new THREE.Mesh(new THREE.PlaneGeometry(6, 14), surf('asphalt', texAsphalt(), 3, 7));
  drive.rotation.x = -Math.PI / 2;
  drive.position.set(0, 0.01, 7);
  drive.receiveShadow = true;
  scene.add(drive);

  // A concrete path from the driveway to the front door, and a kerb along the street end.
  const path = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 4.2), surf('concrete', texConcrete(), 1, 3));
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, 0.012, -0.9);
  path.receiveShadow = true;
  scene.add(path);

  /* ⚠ THE METRE GRID IS NOW OFF BY DEFAULT.
   *
   * It has been in the scene since Phase 0, and it earned its place — it is the only way to
   * judge whether a 2.10 m couch LOOKS 2.10 m, and several tuning decisions were made by
   * counting squares. It is also, on its own, the single loudest "this is a dev scene"
   * signal in the build: nothing that ships has a metre grid painted on the lawn.
   *
   * So it stays, wired to F3 beside the stats overlay, where it is a measuring instrument
   * rather than scenery. Returned on the scene handle so main.js can toggle it. */
  const grid = new THREE.GridHelper(60, 60, 0x000000, 0x000000);
  grid.material.opacity = 0.14;
  grid.material.transparent = true;
  grid.position.y = 0.02;
  grid.visible = false;
  scene.add(grid);

  // ---- the doorway wall: the whole game in one piece of geometry ----------------------
  // Three apertures at 0.82 / 0.86 / 0.91 m, with a 2.10 m couch parked in front of them.
  // §26.2's acceptance criterion is that a couch-equivalent can be "rotated through a
  // door"; APERTURES above records which of these three that is actually true for.
  const WALL_T = 0.18, WALL_H = 2.7, WALL_Z = -2.0;
  const DOOR_H = REFERENCE_DIMS.doorwayHeight;
  const headerH = WALL_H - DOOR_H;

  // Wall runs between and either side of the apertures, built from the gaps themselves so
  // the visible surface and the collider can never disagree (§8.1).
  const edges = [];
  for (const a of APERTURES) edges.push([a.x - a.gap / 2, a.x + a.gap / 2]);
  edges.sort((p, q) => p[0] - q[0]);
  const WALL_MIN = edges[0][0] - 3.0, WALL_MAX = edges[edges.length - 1][1] + 3.0;

  const segments = [];
  let cursor = WALL_MIN;
  for (const [lo, hi] of edges) { segments.push([cursor, lo]); cursor = hi; }
  segments.push([cursor, WALL_MAX]);

  for (const [lo, hi] of segments) {
    const w = hi - lo;
    if (w <= 1e-6) continue;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_H, WALL_T), frontWallMats);
    m.position.set((lo + hi) / 2, WALL_H / 2, WALL_Z);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    addCollider((lo + hi) / 2, WALL_Z, w, WALL_T, 0, WALL_H, 'wall');
  }

  for (const a of APERTURES) {
    // Header, so each opening is a real 2.03 m aperture and not a floor-to-ceiling slot.
    const hd = new THREE.Mesh(new THREE.BoxGeometry(a.gap, headerH, WALL_T), frontWallMats);
    hd.position.set(a.x, DOOR_H + headerH / 2, WALL_Z);
    hd.castShadow = true;
    scene.add(hd);
    // Tagged per aperture (M14) so a knock on the 34" door's header is billed as
    // 'door34 door frame' and not as an anonymous header — the interior headers below
    // have carried `doorHeader_${id}` since Phase 5; nothing reads the bare name.
    addCollider(a.x, WALL_Z, a.gap, WALL_T, DOOR_H, WALL_H, `doorHeader_${a.id}`);

    // Jambs in the lime reference colour: the clearance is the thing being measured.
    // Green jamb = the couch fits through it, coral = it does not. Colour-independent
    // redundancy comes later with labels (§21.4); at Phase 0 this is a dev aid only.
    // 'marker' is lit + emissive, so a jamb never goes dark in shadow and never passes for
    // a material — it reads as an instrument (§6.1).
    const passes = fitsThroughGap(REFERENCE_DIMS.couch3Seat.z, REFERENCE_DIMS.couch3Seat.y, a.gap).fits;
    const jambMat = passes ? markerMat : impossibleMat;
    for (const side of [-1, 1]) {
      const j = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, DOOR_H, WALL_T + 0.02), jambMat);
      j.position.set(a.x + side * a.gap / 2, DOOR_H / 2, WALL_Z);
      scene.add(j);
    }
  }

  /* ---- movable objects are no longer built here ---------------------------------------
   * Through Phase 0-1 the boxes, couch and dresser stood in this scene as static meshes
   * with AABB colliders — honest while nothing could move. Phase 2 made the boxes real
   * rigid bodies and Phase 3 did the same for the couch and dresser, so they are all
   * spawned from src/objects/definitions.js (PHASE2_SPAWNS, PHASE3_SPAWNS) instead.
   *
   * Leaving the static stand-ins behind would put an immovable collider inside every
   * object the registry spawns, which is the kind of duplication §8.1's one-shared-record
   * rule exists to prevent. */
  const props = [];

  // Human-height post. Without it nothing on screen has a believable scale.
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, REFERENCE_DIMS.moverHeight, 10), markerMat);
  post.position.set(-3.0, REFERENCE_DIMS.moverHeight / 2, 3.6);
  post.castShadow = true;
  scene.add(post);

  /* ---- plank floors, AO skirts, skirting: the builders --------------------------------- */
  const plankFloors = [];
  const skirts = [];
  const skirting = [];

  /** One merged plank floor over [x0,x1]×[z0,z1] at height y, planks running along `along`,
   *  plus its dark under-plane FLOOR.underGap below. */
  const plankFloor = ({ name, x0, x1, z0, z1, y, along, hue, variant }) => {
    const aLo = along === 'x' ? x0 : z0, aHi = along === 'x' ? x1 : z1;
    const cLo = along === 'x' ? z0 : x0, cHi = along === 'x' ? z1 : x1;
    const pitchC = PLANK.w + PLANK.gap, pitchA = PLANK.len + PLANK.gap;
    const rows = Math.ceil((cHi - cLo) / pitchC);
    const pos = [], nrm = [], uv = [], col = [], idx = [];
    let v = 0, plank = 0;
    const pushQuad = (qx0, qx1, qz0, qz1, tint) => {
      // Corner order a=(x0,z0) b=(x0,z1) c=(x1,z1) d=(x1,z0); faces (a,b,d),(b,c,d) wind
      // counter-clockwise seen from +Y — verified against PlaneGeometry.rotateX(-π/2).
      const corners = [[qx0, qz0], [qx0, qz1], [qx1, qz1], [qx1, qz0]];
      for (const [cx, cz] of corners) {
        pos.push(cx, y, cz);
        nrm.push(0, 1, 0);
        // 'tile' UV in metres / plankMetres, u along the plank, so the grain runs its length.
        const u = (along === 'x' ? cx : cz) / LOOK.plankMetres;
        const w = (along === 'x' ? cz : cx) / LOOK.plankMetres;
        uv.push(u, w);
        col.push(tint, tint, tint);
      }
      idx.push(v, v + 1, v + 3, v + 1, v + 2, v + 3);
      v += 4;
    };
    for (let r = 0; r < rows; r++) {
      const c0 = cLo + r * pitchC, c1 = Math.min(cHi, c0 + PLANK.w);
      if (c1 - c0 < PLANK.minW) continue;
      const offset = ((r % PLANK.stagger) / PLANK.stagger) * pitchA;
      for (let a = aLo - pitchA + offset; a < aHi; a += pitchA) {
        const a0 = Math.max(aLo, a), a1 = Math.min(aHi, a + PLANK.len);
        if (a1 - a0 < PLANK.minLen) continue;
        const tint = 1 + (rnd(plank + 1) * 2 - 1) * PLANK.lJitter;
        plank++;
        if (along === 'x') pushQuad(a0, a1, c0, c1, tint); else pushQuad(c0, c1, a0, a1, tint);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    geo.userData.planks = plank;
    // repeat [1,1] → a RepeatWrapping clone with repeat 1, so the metre UVs tile per plankMetres.
    const m = new THREE.Mesh(geo, surface('boards', 0xffffff,
      { map: texBoards(hue, variant), repeat: [1, 1], vertexColors: true }));
    m.name = `plankFloor:${name}`;
    m.receiveShadow = true;
    scene.add(m);
    plankFloors.push(m);

    const under = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), underMat);
    under.rotation.x = -Math.PI / 2;
    under.position.set((x0 + x1) / 2, y - FLOOR.underGap, (z0 + z1) / 2);
    under.name = `plankUnder:${name}`;
    under.receiveShadow = true;
    scene.add(under);
    return m;
  };

  /* The AO skirt gradient: 1 × 32, dark at v=0 (the wall) to white at v=1 (open floor).
   * MULTIPLY blending in r128 is blendFunc(ZERO, SRC_COLOR) — the fragment's RGB is the
   * multiplier and alpha is ignored — so the strength is baked into the RGB here rather than
   * carried in alpha. toneMapped:false and fog:false keep the multiplier exact: ACES or fog
   * would remap it into a value that depends on exposure and distance. A canvas is authored
   * in sRGB and the texture is tagged sRGB, so the decode-in / encode-out round trip is the
   * identity and these bytes multiply the sRGB framebuffer directly. */
  const skirtTex = canvasTex(1, AO_SKIRT.texH, 'aoSkirt', (ctx, w, h) => {
    const s = LOOK.skirt.strength, [tr, tg, tb] = AO_SKIRT.tint;
    const dark = `rgb(${Math.round(255 - s * (255 - tr))},${Math.round(255 - s * (255 - tg))},${Math.round(255 - s * (255 - tb))})`;
    // flipY (CanvasTexture default) puts the canvas BOTTOM at v=0, so the dark stop is at y=h.
    const g = ctx.createLinearGradient(0, h, 0, 0);
    g.addColorStop(0, dark);
    g.addColorStop(1, '#ffffff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  const skirtMat = new THREE.MeshBasicMaterial({
    map: skirtTex, transparent: true, blending: THREE.MultiplyBlending, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    toneMapped: false, fog: false,
  });
  /* `layer`, NOT `kind`: userData.kind is reserved for surface() materials — classed
   * light-responding surfaces — and m13 G12 asserts shininess >= 4 on every one of them. A
   * multiply decal is a Basic material with no light response at all, so it is tagged under
   * its own key. (It was 'kind' once and failed G12 on every run with "aoSkirt, oilStain".) */
  skirtMat.userData.layer = 'aoSkirt';

  /** Skirting boards + one merged AO skirt for a house whose interior runs are given. */
  const houseTrim = (name, runs, floorY) => {
    const pos = [], nrm = [], uv = [], idx = [];
    let v = 0;
    const w = LOOK.skirt.width;
    const skirtY = floorY + AO_SKIRT.lift;
    for (const run of runs) {
      const segs = cutRun(run);
      segs.forEach(([lo, hi], i) => {
        const len = hi - lo, mid = (lo + hi) / 2;
        // Skirting board, flush against the wall face.
        const across = run.at + run.into * SKIRTING.t / 2;
        const geo = run.axis === 'x'
          ? new THREE.BoxGeometry(len, SKIRTING.h, SKIRTING.t)
          : new THREE.BoxGeometry(SKIRTING.t, SKIRTING.h, len);
        const board = new THREE.Mesh(geo, trimMat);
        if (run.axis === 'x') board.position.set(mid, floorY + SKIRTING.h / 2, across);
        else board.position.set(across, floorY + SKIRTING.h / 2, mid);
        board.name = `skirting:${name}:${run.name}:${i}`;
        board.receiveShadow = true;
        scene.add(board);
        skirting.push(board);

        // AO skirt quad: v = 0 at the wall, 1 at the open edge.
        const near = run.at, far = run.at + run.into * w;
        const b0 = Math.min(near, far), b1 = Math.max(near, far);
        const corners = run.axis === 'x'
          ? [[lo, b0], [lo, b1], [hi, b1], [hi, b0]]
          : [[b0, lo], [b0, hi], [b1, hi], [b1, lo]];
        for (const [cx, cz] of corners) {
          pos.push(cx, skirtY, cz);
          nrm.push(0, 1, 0);
          const b = run.axis === 'x' ? cz : cx;
          uv.push(0.5, Math.abs(b - near) / w);
        }
        idx.push(v, v + 1, v + 3, v + 1, v + 2, v + 3);
        v += 4;
      });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    const skirt = new THREE.Mesh(geo, skirtMat);
    skirt.name = `aoSkirt:${name}`;
    skirt.receiveShadow = false;
    scene.add(skirt);
    skirts.push(skirt);
  };

  // ---- Phase 1: the room (indoors) ---------------------------------------------------
  // The aperture wall is the room's south side; three more walls and a ceiling close it.
  const R = ROOM;
  /* THE HOUSE FLOOR IS PLANKS NOW: one merged geometry over the shell's interior (the walls
   * stand on grass, as they always did), at today's 0.015 so nothing spawned on it moves. */
  /* z1 runs to the front wall's OUTER face, not its inner one: the planks under the wall are
   * inside the wall box and invisible, but in the three doorway gaps they are the threshold.
   * Stopping at the inner face left 0.18 m of bare grass in the interior32 and front36 gaps
   * (only door34 has the concrete path under it) — the review's screenshot item. The clear
   * boxes start at y 0.06, so a 0.015 m floor through a gap is nowhere near B1/B1b. */
  plankFloor({
    name: 'house',
    x0: R.minX + R.wallT / 2, x1: R.maxX - R.wallT / 2,
    z0: R.minZ + R.wallT / 2, z1: WALL_Z + WALL_T / 2,
    y: FLOOR.houseY, along: 'x', hue: PLANK.houseHue, variant: 'floor',
  });

  // One plaster material for every interior wall, so the whole house reads as one build.
  const wallMat = surf('plaster', texPlaster(38, 0.84), 3, 1);      // ry=1: see texPlaster
  /* The ceiling's OWN material: an un-tiled canvas whose radial edge vignette darkens the
   * perimeter where it meets the walls — the cheapest honest corner occlusion there is. A
   * BoxGeometry's faces each span 0..1, so the vignette lands whole on the face you see. */
  const ceilMat = surface('ceiling', 0xffffff, { map: texCeiling() });

  const addWall = (cx, cz, sx, sz, tag) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, R.wallH, sz), wallMat);
    m.position.set(cx, R.wallH / 2, cz);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    addCollider(cx, cz, sx, sz, 0, R.wallH, tag);
  };
  const roomW = R.maxX - R.minX, roomD = R.maxZ - R.minZ;
  addWall(R.minX, (R.minZ + R.maxZ) / 2, R.wallT, roomD, 'roomWallW');
  addWall(R.maxX, (R.minZ + R.maxZ) / 2, R.wallT, roomD, 'roomWallE');
  addWall((R.minX + R.maxX) / 2, R.minZ, roomW, R.wallT, 'roomWallN');

  if (R.ceiling) {
    const ceil = new THREE.Mesh(new THREE.BoxGeometry(roomW, 0.16, roomD), ceilMat);
    ceil.position.set((R.minX + R.maxX) / 2, R.wallH + 0.08, (R.minZ + R.maxZ) / 2);
    ceil.receiveShadow = true;
    scene.add(ceil);
    addCollider((R.minX + R.maxX) / 2, (R.minZ + R.maxZ) / 2, roomW, roomD, R.wallH, R.wallH + 0.16, 'roomCeiling');
  }

  /* ---- Phase 5: interior partitions, and the doorway turn ------------------------------
   *
   * §13.1 wants "2-3 rooms, a doorway turn". The partitions subdivide the Phase 1 shell
   * into living room / kitchen / bedroom; the openings are cut from INTERIOR_DOORS by
   * wallSegments(), so a visible gap and a solid collider cannot disagree — the same
   * one-shared-record rule (§8.1) the front aperture wall already follows.
   *
   * house.js owns ROOM as well, so the import runs one way only and there is no cycle.
   */
  {
    const PW = ROOM.wallH;

    for (const p of PARTITIONS) {
      for (const seg of wallSegments(p, INTERIOR_DOORS)) {
        const len = seg.hi - seg.lo;
        if (len <= 1e-6) continue;
        const mid = (seg.lo + seg.hi) / 2;
        const sx = p.axis === 'x' ? len : PARTITION_T;
        const sz = p.axis === 'x' ? PARTITION_T : len;
        const cx = p.axis === 'x' ? mid : p.at;
        const cz = p.axis === 'x' ? p.at : mid;
        const m = new THREE.Mesh(new THREE.BoxGeometry(sx, PW, sz), wallMat);
        m.position.set(cx, PW / 2, cz);
        m.castShadow = true; m.receiveShadow = true;
        scene.add(m);
        addCollider(cx, cz, sx, sz, 0, PW, `partition_${p.id}`);
      }
    }

    // Headers over the interior openings, so each is a real 2.03 m doorway rather than a
    // floor-to-ceiling slot you could carry a wardrobe through sideways.
    for (const dr of INTERIOR_DOORS) {
      const hh = PW - dr.height;
      if (hh <= 1e-6) continue;
      const sx = dr.axis === 'x' ? dr.gap : PARTITION_T;
      const sz = dr.axis === 'x' ? PARTITION_T : dr.gap;
      const cx = dr.axis === 'x' ? dr.centre : dr.at;
      const cz = dr.axis === 'x' ? dr.at : dr.centre;
      const hd = new THREE.Mesh(new THREE.BoxGeometry(sx, hh, sz), wallMat);
      hd.position.set(cx, dr.height + hh / 2, cz);
      hd.castShadow = true;
      scene.add(hd);
      addCollider(cx, cz, sx, sz, dr.height, PW, `doorHeader_${dr.id}`);

      // Lime jambs: these are the clearances the route puzzle is made of, so they are
      // marked the same way the front apertures are.
      const passes = fitsThroughGap(REFERENCE_DIMS.couch3Seat.z, REFERENCE_DIMS.couch3Seat.y, dr.gap).fits;
      const jm = passes ? markerMat : impossibleMat;
      for (const side of [-1, 1]) {
        const jx = dr.axis === 'x' ? dr.centre + side * dr.gap / 2 : dr.at;
        const jz = dr.axis === 'x' ? dr.at : dr.centre + side * dr.gap / 2;
        const jsx = dr.axis === 'x' ? 0.04 : PARTITION_T + 0.02;
        const jsz = dr.axis === 'x' ? PARTITION_T + 0.02 : 0.04;
        const j = new THREE.Mesh(new THREE.BoxGeometry(jsx, dr.height, jsz), jm);
        j.position.set(jx, dr.height / 2, jz);
        scene.add(j);
      }
    }

    // Skirting boards and the AO skirt, cut from the same door records as the walls.
    houseTrim('house', interiorRuns({
      x0: R.minX + R.wallT / 2, x1: R.maxX - R.wallT / 2,
      z0: R.minZ + R.wallT / 2, z1: WALL_Z - WALL_T / 2,
      frontGaps: APERTURES.map((a) => [a.x - a.gap / 2, a.x + a.gap / 2]),
      partitions: PARTITIONS, doors: INTERIOR_DOORS, partT: PARTITION_T,
    }), FLOOR.houseY);
  }

  /* ---- Phase 7: the truck's cargo box ---------------------------------------------------
   * §10.1: "The cargo box is a real collision-enabled space with floor, walls, roof, ramp,
   * door, and anchor points. Nothing teleports into storage."
   *
   * Built from truck.js's records, so the mesh and the collider come from one place like
   * everything else (§8.1). The rear (-Z) face is deliberately absent: that is the door, and
   * the whole phase depends on being able to walk a couch in through it. */
  {
    /* THE TRUCK IS THE HERO OBJECT OF A MOVING GAME and it was six grey boxes.
     *
     * The COLLIDERS are untouched — every mesh below is still built from `cargoColliders()`
     * and `cabColliders()`, so §8.1's one-shared-record rule holds and the cargo volume is
     * exactly what Phase 7 measured. What changed is that the outward faces carry the
     * company's livery, the deck is scuffed ply instead of grey, and the thing has wheels. */
    const insideMat = surf('steelPanel', texTruckWall(), 2, 1);
    // The livery panel carries texTruckSide as its map, one repeat, clamped.
    const sideMat = surface('paint', 0xffffff, { map: texTruckSide() });
    const roofMat = mat('paint', 0xd8d5cd);

    /* BoxGeometry's material array is indexed [+X, -X, +Y, -Y, +Z, -Z]. The livery belongs
     * on the OUTWARD face only, which is -X for the left wall and +X for the right — so the
     * two walls do not take the same array. Getting this wrong paints the company name on
     * the inside of the cargo box, where only the load can read it. */
    const bodyMat = mat('paint', 0xb2202a);
    const chassisMat = mat('paintDark', 0x24262b);
    const chassisEndMat = mat('paintDark', 0x33363c);
    const wallMats = (outwardIsPlusX) => outwardIsPlusX
      ? [sideMat, insideMat, roofMat, roofMat, insideMat, insideMat]
      : [insideMat, sideMat, roofMat, roofMat, insideMat, insideMat];

    const cargo = cargoColliders();
    for (const c of cargo) {
      const sx = c.maxX - c.minX, sz = c.maxZ - c.minZ, sy = c.top - c.base;
      if (sx <= 0 || sy <= 0 || sz <= 0) continue;
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz),
        // The deck box is the whole lower body: you walk on its TOP, and its sides are the
        // truck's flank below the livery. Its top face is the dark under-plane of the plank
        // deck built just below.
        // The under-deck's ±Z faces are CHASSIS, not livery. Painted body-red they made a
        // 4 m slab of flat colour across the whole rear of the truck — the loudest thing in
        // frame, and nothing a real vehicle has.
        c.tag === 'truckDeck' ? [bodyMat, bodyMat, underMat, chassisMat, chassisEndMat, chassisEndMat]
        : c.tag === 'truckRoof' ? roofMat
        : c.tag === 'truckWallL' ? wallMats(false)
        : c.tag === 'truckWallR' ? wallMats(true)
        : insideMat);
      m.position.set((c.minX + c.maxX) / 2, c.base + sy / 2, (c.minZ + c.maxZ) / 2);
      m.castShadow = true; m.receiveShadow = true;
      scene.add(m);
      addCollider((c.minX + c.maxX) / 2, (c.minZ + c.maxZ) / 2, sx, sz, c.base, c.top, c.tag, c.friction);
    }

    /* The plank DECK: over the clear interior between the side walls, from the rear lip to
     * the headboard, planks running the length of the box. Sits FLOOR.hostGap +
     * FLOOR.underGap above the deck collider's top — a 4 mm visual sink for a load, against
     * the 15 mm the house floor has always had. */
    const deckC = cargo.find((c) => c.tag === 'truckDeck');
    const wallL = cargo.find((c) => c.tag === 'truckWallL');
    const wallR = cargo.find((c) => c.tag === 'truckWallR');
    const headboard = cargo.find((c) => c.tag === 'truckHeadboard');
    if (deckC) {
      plankFloor({
        name: 'deck',
        x0: wallL ? wallL.maxX : deckC.minX, x1: wallR ? wallR.minX : deckC.maxX,
        z0: deckC.minZ, z1: headboard ? headboard.minZ : deckC.maxZ,
        y: deckC.top + FLOOR.hostGap + FLOOR.underGap, along: 'z',
        hue: PLANK.deckHue, variant: 'deck',
      });
    }

    // The cab. §11.2's "cab seats are safe" — and §3.4's TRANSIT has to begin somewhere
    // you can walk up to. Not part of cargoColliders(): the cab is not cargo volume.
    // Company red, matching the livery stripe; a deeper gloss than the body panels.
    const cabMat = mat('paint', 0xb2202a, { shininess: CAB_SHININESS });
    const cabBoxes = [];
    for (const c of cabColliders()) {
      const sx = c.maxX - c.minX, sz = c.maxZ - c.minZ, sy = c.top - c.base;
      // Rounded visual on the cab (the collider AABB is untouched; the visual sits INSIDE
      // it, which §8.1 allows — the forbidden direction is visual outside collision).
      const m = new THREE.Mesh(roundedBox(THREE, sx, sy, sz, 0.07), cabMat);
      m.position.set((c.minX + c.maxX) / 2, c.base + sy / 2, (c.minZ + c.maxZ) / 2);
      m.castShadow = true; m.receiveShadow = true;
      scene.add(m);
      cabBoxes.push({ c, sx, sy, sz });
      addCollider((c.minX + c.maxX) / 2, (c.minZ + c.maxZ) / 2, sx, sz, c.base, c.top, c.tag);
    }

    /* Windscreen, side glass, bumper and wheels. DECORATION ONLY — none of it registers a
     * collider, because §8.1 forbids decorative collision that contradicts the visible
     * surface and the cab's walkable volume was measured in Phase 11. Everything here sits
     * flush with or inside the cab boxes above. */
    if (cabBoxes.length) {
      const cab = cabBoxes[0];
      const cx = (cab.c.minX + cab.c.maxX) / 2;
      const cz = (cab.c.minZ + cab.c.maxZ) / 2;
      const glass = mat('glass', 0x2a3540);
      // Windscreen on the -Z face (the truck faces -Z, away from the house).
      const ws = new THREE.Mesh(new THREE.BoxGeometry(cab.sx * 0.86, cab.sy * 0.34, 0.03), glass);
      ws.position.set(cx, cab.c.base + cab.sy * 0.70, cab.c.minZ - 0.015);
      scene.add(ws);
      for (const s of [-1, 1]) {
        const sg = new THREE.Mesh(new THREE.BoxGeometry(0.03, cab.sy * 0.28, cab.sz * 0.36), glass);
        sg.position.set(cx + s * (cab.sx / 2 + 0.015), cab.c.base + cab.sy * 0.68, cz - cab.sz * 0.12);
        scene.add(sg);
      }
      const bumper = new THREE.Mesh(new THREE.BoxGeometry(cab.sx * 1.02, 0.20, 0.16), mat('paintDark', 0x3a3d44));
      bumper.position.set(cx, cab.c.base + 0.28, cab.c.minZ - 0.06);
      bumper.castShadow = true;
      scene.add(bumper);
    }

    // Wheels, on both axles. A box on the ground is a shipping container; a box on wheels
    // is a truck, and it is the cheapest possible version of that difference.
    {
      // Rubber carries its tread band in texRubber (64², tiled round the tyre); the hub is
      // chrome — the one part of the truck that is meant to flash in the sun.
      const tyre = surface('rubber', 0xffffff, { map: texRubber(), repeat: [12, 1] });
      const hub = mat('chrome', 0xd8dde3);
      const bodyMinX = Math.min(...cargo.map((c) => c.minX));
      const bodyMaxX = Math.max(...cargo.map((c) => c.maxX));
      const zs = [];
      for (const c of cargo) { zs.push(c.minZ, c.maxZ); }
      const zMin = Math.min(...zs), zMax = Math.max(...zs);
      const axleZ = [zMin + 0.95, zMax - 0.85];
      if (cabBoxes.length) axleZ.push((cabBoxes[0].c.minZ + cabBoxes[0].c.maxZ) / 2 - 0.1);
      for (const az of axleZ) {
        for (const sx of [bodyMinX + 0.10, bodyMaxX - 0.10]) {
          const w = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.26, 16), tyre);
          w.rotation.z = Math.PI / 2;
          w.position.set(sx, 0.46, az);
          w.castShadow = true;
          scene.add(w);
          const h = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.20, 0.28, 12), hub);
          h.rotation.z = Math.PI / 2;
          h.position.set(sx, 0.46, az);
          scene.add(h);
        }
      }
    }

    // Anchor points, in the reference lime. §10.3 wants "anchor validity" legible, and the
    // cheapest honest version of that is being able to see where they are.
    for (const a of cargoAnchors()) {
      const knob = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.08, 0.16), markerMat);
      knob.position.set(a.x, a.y, a.z);
      scene.add(knob);
    }

    /* THE OIL STAIN: one multiply-blended decal on the drive behind the truck's rear, in
     * place of the stain that used to repeat in every asphalt tile (which put a drip every
     * two metres down the whole street). No collider; 2 mm over the drive with polygonOffset. */
    if (deckC) {
      const stainTex = canvasTex(OIL_STAIN.texSize, OIL_STAIN.texSize, 'oilStain', (ctx, w, h) => {
        // White pulled toward the tint by `strength` — the same multiplier math as the AO skirt.
        const toward = (s) => `rgb(${OIL_STAIN.tint.map((t) => Math.round(255 - s * (255 - t))).join(',')})`;
        const dark = toward(OIL_STAIN.strength);
        const mid = toward(OIL_STAIN.strength * OIL_STAIN.midStrength);
        const g = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, w * 0.5);
        g.addColorStop(0, dark);
        g.addColorStop(OIL_STAIN.midStop, mid);
        g.addColorStop(1, '#ffffff');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      });
      const stainMat = new THREE.MeshBasicMaterial({
        map: stainTex, transparent: true, blending: THREE.MultiplyBlending, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
        toneMapped: false, fog: false,
      });
      stainMat.userData.layer = 'oilStain';   // `layer`, not `kind` — see the AO skirt material
      const stain = new THREE.Mesh(new THREE.PlaneGeometry(OIL_STAIN.w, OIL_STAIN.d), stainMat);
      stain.rotation.x = -Math.PI / 2;
      stain.position.set((deckC.minX + deckC.maxX) / 2, OIL_STAIN.y, deckC.minZ - OIL_STAIN.behindRear);
      stain.name = 'oilStain';
      scene.add(stain);
    }
  }

  /* ---- Phase 9: the destination ---------------------------------------------------------
   * §13.1: "Destination | One smaller site with 3-4 labeled room zones." Built from
   * destination.js's records by the same code path as everything else — shell colliders,
   * then partitions cut by their doorways. */
  {
    // The delivery house gets the same treatment as the pickup one, in a different siding
    // colour — §13.1 calls it "one SMALLER site", not a different kind of building, and a
    // plain tan box at the end of the drive undoes the whole art pass at the exact moment
    // the contract is being judged (§15.2).
    const destMat = surf('siding', texSiding(196, 0.58), 5, 1.6);
    /* Siding OUTSIDE, plaster INSIDE: the shell walls are single boxes, so each takes a
     * material array with the siding on its outward face only (BoxGeometry order
     * [+X, -X, +Y, -Y, +Z, -Z]). The floor slab is concrete-edged with the dark under-plane
     * colour on top, under the plank floor. */
    const slabEdge = surf('concrete', texConcrete(), 4, 0.25);
    const destFloorMats = [slabEdge, slabEdge, underMat, underMat, slabEdge, slabEdge];
    const outward = (idx) => { const a = [wallMat, wallMat, wallMat, wallMat, wallMat, wallMat]; a[idx] = destMat; return a; };
    const destWallMats = {
      destWallW: outward(1), destWallE: outward(0), destWallN: outward(5),
      destWallS: outward(4), destDoorHeader: outward(4),
    };
    for (const c of destColliders()) {
      const sx = c.maxX - c.minX, sz = c.maxZ - c.minZ, sy = c.top - c.base;
      if (sx <= 0 || sy <= 0 || sz <= 0) continue;
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz),
        c.tag === 'destFloor' ? destFloorMats
        : c.tag === 'destCeiling' ? ceilMat
        : destWallMats[c.tag] || destMat);
      m.position.set((c.minX + c.maxX) / 2, c.base + sy / 2, (c.minZ + c.maxZ) / 2);
      m.castShadow = true; m.receiveShadow = true;
      scene.add(m);
      addCollider((c.minX + c.maxX) / 2, (c.minZ + c.maxZ) / 2, sx, sz, c.base, c.top, c.tag);
    }

    // The destination's plank floor over its slab (top 0.02), planks along the long axis.
    const destSlab = destColliders().find((c) => c.tag === 'destFloor');
    const destFloorY = (destSlab ? destSlab.top : 0.02) + FLOOR.hostGap + FLOOR.underGap;
    plankFloor({
      name: 'dest',
      x0: DEST_SHELL.minX, x1: DEST_SHELL.maxX, z0: DEST_SHELL.minZ, z1: DEST_SHELL.maxZ,
      y: destFloorY, along: 'x', hue: PLANK.destHue, variant: 'floor',
    });

    for (const p of DEST_PARTITIONS) {
      for (const seg of wallSegments(p, DEST_DOORS)) {
        const len = seg.hi - seg.lo;
        if (len <= 1e-6) continue;
        const mid = (seg.lo + seg.hi) / 2;
        const sx = p.axis === 'x' ? len : PARTITION_T;
        const sz = p.axis === 'x' ? PARTITION_T : len;
        const cx = p.axis === 'x' ? mid : p.at;
        const cz = p.axis === 'x' ? p.at : mid;
        // Interior partitions are plaster, like the pickup house's — siding indoors read as
        // a shed.
        const m = new THREE.Mesh(new THREE.BoxGeometry(sx, DEST_SHELL.wallH, sz), wallMat);
        m.position.set(cx, DEST_SHELL.wallH / 2, cz);
        m.castShadow = true; m.receiveShadow = true;
        scene.add(m);
        addCollider(cx, cz, sx, sz, 0, DEST_SHELL.wallH, `partition_${p.id}`);
      }
    }

    // Skirting + AO skirt for the destination. Its shell walls sit OUTSIDE the bounds, so
    // the interior faces are the bounds themselves; the front opening is on the +Z side.
    houseTrim('dest', interiorRuns({
      x0: DEST_SHELL.minX, x1: DEST_SHELL.maxX, z0: DEST_SHELL.minZ, z1: DEST_SHELL.maxZ,
      frontGaps: [[DEST_APERTURE.x - DEST_APERTURE.gap / 2, DEST_APERTURE.x + DEST_APERTURE.gap / 2]],
      partitions: DEST_PARTITIONS, doors: DEST_DOORS, partT: PARTITION_T,
    }), destFloorY);

    // §13.1 says the zones are LABELED, and §21.2's contract UX has to name a room. A lime
    // marker on the floor of each is the cheapest version of that which is not a lie.
    for (const z of DEST_ZONES) {
      if (z.id === 'dest_apron') continue;
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.02, 0.9), markerMat);
      pad.position.set((z.minX + z.maxX) / 2, 0.03, (z.minZ + z.maxZ) / 2);
      scene.add(pad);
    }
  }

  // ---- Phase 1: obstacles (autostep / mantle / refuse) --------------------------------
  const obstacles = [];
  const copingTrim = mat('paintedTimber', PALETTE.trim);
  for (const o of OBSTACLES) {
    // Lime = the controller should get you up it; coral = it must refuse.
    /* DRESSED AS GARDEN WALLS, still legible as a legend.
     *
     * These four blocks are Phase 1 test geometry — one to autostep, two to mantle, one that
     * must REFUSE — and painting them lime and coral is how the gate was judged by eye. They
     * are also four coloured blocks sitting in the front garden, which is a large part of why
     * the site read as a test scene. So the BODY is brickwork and the legend survives as a
     * painted coping along the top edge: the diagnostic is intact, and a raised bed is a
     * thing a garden has. The legend copings are 'marker' (emissive, never dark); the plain
     * autostep one is painted timber. */
    const copingMat = o.expectMantle ? markerMat : (o.top > 1.0 ? impossibleMat : copingTrim);
    const m = new THREE.Mesh(new THREE.BoxGeometry(o.w, o.top, o.d), gardenBrick);
    m.position.set(o.x, o.top / 2, o.z);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    const coping = new THREE.Mesh(new THREE.BoxGeometry(o.w * 1.04, 0.06, o.d * 1.04), copingMat);
    coping.position.set(o.x, o.top + 0.03, o.z);
    coping.castShadow = true; coping.receiveShadow = true;
    scene.add(coping);
    addCollider(o.x, o.z, o.w, o.d, 0, o.top, o.id);
    obstacles.push({ ...o, mesh: m });
  }

  // ---- Phase 1: ramp + platform -------------------------------------------------------
  // Mesh rotation must match the physics quaternion exactly, or the player walks on an
  // invisible slope. Both read RAMP; neither hard-codes an angle.
  const rampMesh = new THREE.Mesh(
    new THREE.BoxGeometry(RAMP.width, RAMP.thickness, RAMP.length), surf('boards', texBoards(28), 2, 3));
  rampMesh.position.set(RAMP.x, RAMP.y, RAMP.z);
  rampMesh.rotation.x = RAMP.angleRad;
  rampMesh.castShadow = true; rampMesh.receiveShadow = true;
  scene.add(rampMesh);
  // Not added to `colliders`: an AABB cannot represent a slope, and a box-shaped collider
  // here would be a lie the camera would then occlude against. Physics builds the rotated
  // collider from RAMP directly; camera occlusion skips it.

  const plat = new THREE.Mesh(
    new THREE.BoxGeometry(PLATFORM.width, PLATFORM.thickness, PLATFORM.depth), surf('boards', texBoards(30), 2, 2));
  plat.position.set(PLATFORM.x, PLATFORM.y - PLATFORM.thickness / 2, PLATFORM.z);
  plat.castShadow = true; plat.receiveShadow = true;
  scene.add(plat);
  addCollider(PLATFORM.x, PLATFORM.z, PLATFORM.width, PLATFORM.depth,
              PLATFORM.y - PLATFORM.thickness, PLATFORM.y, 'platform');

  /* ---- interior dressing (Phase 14) -------------------------------------------------------
   * A pendant under each room light (so the warm spot has a visible SOURCE — light from
   * nowhere reads as a rendering artefact), a rug, and pictures on the walls. Decoration
   * only: zero colliders, m13 C1 still asserts it.
   *
   * PER ROOM, NOT PER ROOM LIGHT. The software tier builds no room spots at all (m13 F4),
   * and a pendant that hung off the spot list vanished with them — so the harness had ZERO
   * bulbs and m13 G10a ("the bulbs are untonemapped bloom sources", bulbs > 0) could never
   * pass on the tier it runs on. The pendant is furniture: it hangs where the spot WOULD be
   * (the same centre and drop as lighting.js computes) whether or not the spot exists. */
  {
    const cordMat = mat('paintDark', 0x2a2d33);
    for (const r of rooms) {
      const p = new THREE.Vector3((r.minX + r.maxX) / 2, r.maxY - LIGHTING.room.dropFromCeiling, (r.minZ + r.maxZ) / 2);
      const cordH = 0.14;
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, cordH, 6), cordMat);
      cord.position.set(p.x, p.y + cordH / 2 + 0.02, p.z);
      scene.add(cord);
      // The shade matches its room's spot colour, so the light and its source agree.
      const roomHex = (LIGHTING.roomColours && LIGHTING.roomColours[r.id] !== undefined)
        ? LIGHTING.roomColours[r.id] : LIGHTING.room.colour;
      const shadeHex = new THREE.Color(roomHex).lerp(new THREE.Color(SHADE.base), SHADE.mix).getHex();
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.17, 0.13, 12, 1, true),
        mat('paper', shadeHex, { side: THREE.DoubleSide }));
      shade.position.set(p.x, p.y + 0.02, p.z);
      scene.add(shade);
      /* The bulb is BASIC — unlit — so it glows regardless of what the light itself does,
       * and NOT tone mapped, so it writes ~1.0 and is a guaranteed bloom source (m13 G10).
       * Built DIRECTLY, not through textures.basic(): basic() decodes the colour sRGB→linear
       * (0xfff3d0 → 0xffe5a1), which is right for a lit surface and wrong for an emitter
       * whose whole job is to sit at the top of the range — and m13 G10a counts the bulbs by
       * material.color.getHex() === 0xfff3d0, which the decoded value can never match. Kept
       * as the literal cream: it encodes out a shade paler, which is what a bulb is. */
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(BULB.r, 10, 8),
        new THREE.MeshBasicMaterial({ color: BULB.colour, toneMapped: false }));
      bulb.name = 'bulb';
      bulb.position.set(p.x, p.y - 0.02, p.z);
      scene.add(bulb);
    }

    // A rug in the living room — a plane, so it costs one draw call and no collider. One
    // repeat over the rug: the border is drawn in the canvas, so it must not tile.
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.8),
      surface('rug', 0xffffff, { map: texRug(210) }));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(2.4, FLOOR.rugY, -3.6);
    rug.receiveShadow = true;
    scene.add(rug);

    // Pictures on the partition walls, high enough to clear every carried object path.
    const frames = [
      /* x=1.2, NOT 2.2: the living->kitchen doorway is centred at x=2.60 with a 0.86 m gap
       * (opening spans 2.17..3.03), and the first version hung this frame INSIDE it — m13's
       * doorway sweep only guarded the three FRONT apertures, so a picture floating in an
       * interior door passed every test and was caught by a screenshot. The sweep now
       * covers interior doors as well. */
      { x: 1.2, y: 1.75, z: -4.94, ry: 0, w: 0.5, h: 0.4, hue: 205 },
      { x: -2.6, y: 1.75, z: -4.94, ry: 0, w: 0.38, h: 0.5, hue: 30 },
      { x: -4.94, y: 1.7, z: -6.6, ry: Math.PI / 2, w: 0.45, h: 0.35, hue: 96 },
    ];
    const frameMat = surface('walnut', 0xffffff, { map: texWood('walnut'), repeat: [1, 1] });
    for (const f of frames) {
      const pic = new THREE.Group();
      const frame = new THREE.Mesh(new THREE.BoxGeometry(f.w, f.h, 0.03), frameMat);
      const art = new THREE.Mesh(new THREE.BoxGeometry(f.w - 0.06, f.h - 0.06, 0.012),
        surface('paper', 0xffffff, { map: texPaint(f.hue, 0.45, 0.6), repeat: [1, 1] }));
      art.position.z = 0.012;
      pic.add(frame); pic.add(art);
      pic.position.set(f.x, f.y, f.z);
      pic.rotation.y = f.ry;
      scene.add(pic);
    }
  }

  /* ---- dressing: the house from outside, and the street it stands on ---------------------
   *
   * EVERY MESH BELOW IS DECORATION AND REGISTERS NO COLLIDER. §8.1 forbids decorative
   * collision that contradicts the visible surface, and the inverse matters just as much
   * here: the pickup house's walkable volume was measured in Phases 1 and 5 and asserted by
   * m1 and m5, so an art pass must not put a bush where a mover used to be able to stand.
   * Everything is placed OUTSIDE the room shell or above head height.
   *
   * §20.4 called the Phase 0 scene "diagnostic: simple meshes, colour separation, contact
   * shadows". It has been exactly that for twelve phases, and it is the reason the build
   * photographs like a CAD viewport rather than a game. The geometry it describes has not
   * changed — this is dressing around it. */
  {
    const RM = ROOM;
    const sidingMat = surf('siding', texSiding(34, 0.62), 6, 2);
    const shingleMat = surf('shingle', texShingle(24), 8, 4);
    const brickMat = surf('brick', texBrick(14), 4, 2);
    const glassMat = mat('glass', 0x3d5568);

    const deco = (geo, m, x, y, z, ry = 0) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      if (ry) mesh.rotation.y = ry;
      mesh.castShadow = true; mesh.receiveShadow = true;
      scene.add(mesh);
      return mesh;
    };

    const roomW = RM.maxX - RM.minX, roomD = RM.maxZ - RM.minZ;
    const cx = (RM.minX + RM.maxX) / 2, cz = (RM.minZ + RM.maxZ) / 2;

    /* A pitched roof. Two slabs leaning against each other, sat ON TOP of the 2.7 m ceiling
     * — well above anything a mover can reach, so it cannot interfere with a carry. */
    const eave = RM.wallH + 0.18;
    const rise = 1.5, over = 0.45;
    for (const s of [-1, 1]) {
      const slopeLen = Math.hypot(roomW / 2 + over, rise);
      const slab = deco(new THREE.BoxGeometry(slopeLen, 0.16, roomD + over * 2), shingleMat,
                        cx + s * (roomW / 4), eave + rise / 2, cz);
      slab.rotation.z = s * -Math.atan2(rise, roomW / 2 + over);
    }
    // Gable ends, filling the triangle the two slabs leave. Boxes, because a triangle needs
    // a custom geometry and at this distance nobody can tell.
    for (const gz of [RM.minZ - 0.02, RM.maxZ + 0.02]) {
      for (let i = 0; i < 5; i++) {
        const f = i / 5, w = roomW * (1 - f) * 0.98;
        deco(new THREE.BoxGeometry(w, rise / 5 + 0.02, 0.16), sidingMat,
             cx, eave + rise * f + rise / 10, gz);
      }
    }
    // Fascia along both eaves.
    for (const s of [-1, 1]) {
      deco(new THREE.BoxGeometry(0.10, 0.22, roomD + over * 2), trimMat,
           cx + s * (roomW / 2 + over), eave - 0.05, cz);
    }

    /* Cladding on the outward faces of the shell. The walls themselves are already built
     * and collidable; these are thin skins 1 cm proud of them. The lap relief comes from the
     * siding kind's paired height map — NOT from lapped-board geometry, which was tried on
     * paper and dropped: a merged front face crosses the three doorway clear boxes (B1). */
    deco(new THREE.BoxGeometry(0.02, RM.wallH, roomD), sidingMat, RM.minX - 0.10, RM.wallH / 2, cz);
    deco(new THREE.BoxGeometry(0.02, RM.wallH, roomD), sidingMat, RM.maxX + 0.10, RM.wallH / 2, cz);
    deco(new THREE.BoxGeometry(roomW, RM.wallH, 0.02), sidingMat, cx, RM.wallH / 2, RM.minZ - 0.10);
    // A brick skirt round the base, which is most of what makes a house look built.
    for (const [w, h, dp, px, py, pz] of [
      [0.06, 0.55, roomD, RM.minX - 0.12, 0.275, cz],
      [0.06, 0.55, roomD, RM.maxX + 0.12, 0.275, cz],
      [roomW, 0.55, 0.06, cx, 0.275, RM.minZ - 0.12],
    ]) deco(new THREE.BoxGeometry(w, h, dp), brickMat, px, py, pz);

    // Windows on the two long sides — frame, glass, sill.
    for (const s of [-1, 1]) {
      for (const wz of [cz - roomD * 0.28, cz + roomD * 0.22]) {
        const wx = s * (roomW / 2) + s * 0.12;
        deco(new THREE.BoxGeometry(0.05, 1.20, 1.05), trimMat, cx + wx, 1.45, wz);
        deco(new THREE.BoxGeometry(0.03, 1.02, 0.88), glassMat, cx + wx + s * 0.02, 1.45, wz);
        deco(new THREE.BoxGeometry(0.14, 0.06, 1.15), trimMat, cx + wx, 0.83, wz);
      }
    }

    /* The front door, over the 36" aperture — the one a couch can actually pass (§7.1 and
     * KNOWN_ISSUES). A frame and a threshold only: the opening itself stays clear, because
     * that clearance is the whole game. */
    const front = APERTURES.find((a) => a.id === 'front36') || APERTURES[0];
    const WALL_Z_FACE = -2.0 - 0.09 - 0.03;
    for (const s of [-1, 1]) {
      deco(new THREE.BoxGeometry(0.10, REFERENCE_DIMS.doorwayHeight + 0.12, 0.06), trimMat,
           front.x + s * (front.gap / 2 + 0.05), (REFERENCE_DIMS.doorwayHeight + 0.12) / 2, WALL_Z_FACE);
    }
    deco(new THREE.BoxGeometry(front.gap + 0.20, 0.10, 0.06), trimMat,
         front.x, REFERENCE_DIMS.doorwayHeight + 0.11, WALL_Z_FACE);
    // The door itself, swung wide against the wall so nothing blocks the opening.
    deco(new THREE.BoxGeometry(0.05, REFERENCE_DIMS.doorwayHeight, front.gap * 0.92), mat('paintedTimber', 0x4a6b8a),
         front.x + front.gap / 2 + 0.14, REFERENCE_DIMS.doorwayHeight / 2, WALL_Z_FACE - front.gap * 0.46);
    // House number, because §12.1's customer lives somewhere.
    deco(new THREE.BoxGeometry(0.22, 0.30, 0.03), trimMat, front.x - front.gap / 2 - 0.34, 1.6, WALL_Z_FACE);

    /* The street and its verge. The driveway used to run to the edge of a green plane, so
     * the site had no context at all — a truck parked in a field. */
    const street = new THREE.Mesh(new THREE.PlaneGeometry(70, 7), surf('asphalt', texAsphalt(), 35, 3.5));
    street.rotation.x = -Math.PI / 2;
    street.position.set(0, 0.008, 17.5);
    street.receiveShadow = true;
    scene.add(street);
    // Centre line, dashed. One material for all seventeen dashes.
    const lineMat = mat('paintedTimber', 0xd8cf9a);
    for (let i = -34; i < 34; i += 4) {
      deco(new THREE.BoxGeometry(2.2, 0.01, 0.14), lineMat, i, 0.014, 17.5);
    }
    // Kerbs either side.
    const kerbMat = surf('concrete', texConcrete(), 30, 1);
    for (const kz of [14.0, 21.0]) {
      deco(new THREE.BoxGeometry(70, 0.14, 0.28), kerbMat, 0, 0.07, kz);
    }

    /* Landscaping. Placed on the lawn, clear of the driveway, the path and the room shell —
     * a tree where a mover walks is a collider you did not add and a wall they cannot see. */
    const trunkMat = mat('bark', 0x5b4632), leafMat = mat('foliage', 0x3f6b33), leafMat2 = mat('foliage', 0x4f7d3a);
    const tree = (tx, tz, scale) => {
      deco(new THREE.CylinderGeometry(0.16 * scale, 0.22 * scale, 2.4 * scale, 8), trunkMat, tx, 1.2 * scale, tz);
      /* Many small lobes, not few big ones — 11 at 0.24-0.37 R reads as foliage where 5 at
       * 0.46 R reads as a clover leaf (Dev\INDEX.md → TowBros `_drawTrees`). Same finding,
       * different projection. */
      for (let i = 0; i < 11; i++) {
        const a = i * 2.399, r = (0.55 + (i % 3) * 0.22) * scale;
        const ly = (2.5 + (i % 4) * 0.42) * scale;
        deco(new THREE.SphereGeometry((0.52 + (i % 3) * 0.16) * scale, 7, 6),
             i % 2 ? leafMat : leafMat2,
             tx + Math.cos(a) * r, ly, tz + Math.sin(a) * r);
      }
    };
    tree(-7.4, 6.2, 1.15);
    tree(8.6, 9.4, 0.95);
    tree(-9.2, 12.6, 1.05);
    tree(9.8, -1.2, 0.85);

    // A hedge along the boundary — nine rounded boxes (one cached geometry; a rounded box
    // is never translate()d, only positioned) — and a mailbox at the kerb.
    const hedgeGeo = roundedBox(THREE, HEDGE.w, HEDGE.h, HEDGE.d, HEDGE.r);
    for (let i = 0; i < HEDGE.n; i++) {
      deco(hedgeGeo, leafMat, HEDGE.x, HEDGE.h / 2 + DECO_LIFT, HEDGE.z0 + i * HEDGE.pitch);
    }
    deco(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 8), trunkMat, -3.4, 0.55, 13.4);
    deco(new THREE.BoxGeometry(0.28, 0.24, 0.44), mat('paint', 0x8a2f2f), -3.4, 1.22, 13.4);

    /* A roof on the delivery house too. Same construction as above, sat on its own shell —
     * §13.1's "one smaller site", so it is one span rather than two. */
    {
      const DW = DEST_SHELL.maxX - DEST_SHELL.minX, DD = DEST_SHELL.maxZ - DEST_SHELL.minZ;
      const dcx = (DEST_SHELL.minX + DEST_SHELL.maxX) / 2;
      const dcz = (DEST_SHELL.minZ + DEST_SHELL.maxZ) / 2;
      const dEave = DEST_SHELL.wallH + 0.18, dRise = 1.25, dOver = 0.4;
      for (const s of [-1, 1]) {
        const slopeLen = Math.hypot(DW / 2 + dOver, dRise);
        const slab = deco(new THREE.BoxGeometry(slopeLen, 0.16, DD + dOver * 2), shingleMat,
                          dcx + s * (DW / 4), dEave + dRise / 2, dcz);
        slab.rotation.z = s * -Math.atan2(dRise, DW / 2 + dOver);
      }
      const destGableMat = surf('siding', texSiding(196, 0.58), 4, 1);
      for (const gz of [DEST_SHELL.minZ - 0.02, DEST_SHELL.maxZ + 0.02]) {
        for (let i = 0; i < 5; i++) {
          const f = i / 5;
          deco(new THREE.BoxGeometry(DW * (1 - f) * 0.98, dRise / 5 + 0.02, 0.16),
               destGableMat, dcx, dEave + dRise * f + dRise / 10, gz);
        }
      }
      for (const s of [-1, 1]) {
        deco(new THREE.BoxGeometry(0.10, 0.22, DD + dOver * 2), trimMat,
             dcx + s * (DW / 2 + dOver), dEave - 0.05, dcz);
      }
      // A brick skirt, matching the pickup house's.
      for (const [w, h, dp, px, py, pz] of [
        [0.06, 0.5, DD, DEST_SHELL.minX - 0.09, 0.25, dcz],
        [0.06, 0.5, DD, DEST_SHELL.maxX + 0.09, 0.25, dcz],
      ]) deco(new THREE.BoxGeometry(w, h, dp), brickMat, px, py, pz);
    }

    // A wheelie bin and a stack of flattened cartons by the drive: signs of a move underway.
    deco(new THREE.BoxGeometry(0.58, 0.95, 0.62), mat('plastic', 0x2f4a2f), 3.6, 0.48, 12.0);
    deco(new THREE.BoxGeometry(0.60, 0.06, 0.66), mat('paint', 0x22331f), 3.6, 0.98, 12.0);
    /* Flattened cartons are CARDBOARD, not the ply they used to borrow: a rounded slab whose
     * top/bottom carry the liner and whose edge band carries the flute normal map — the
     * same two-group construction as a box lid (prefabs.js roundedSlab). */
    const cartonGeo = roundedSlab(THREE, CARTONS.w, CARTONS.t, CARTONS.d);
    const cartonMats = [
      surface('card', 0xffffff, { map: texCardboard('flat') }),
      surface('cardEdge', 0xffffff, { map: texCardboardEdge() }),
    ];
    for (let i = 0; i < CARTONS.n; i++) {
      deco(cartonGeo, cartonMats, CARTONS.x, CARTONS.t / 2 + DECO_LIFT + i * CARTONS.yStep, CARTONS.z,
           0.2 + i * CARTONS.ryStep);
    }
  }

  return {
    scene, colliders, props, sun, fill, hemi, ambient, roomLights, tier, grid, apertures: APERTURES,
    obstacles, ramp: RAMP, platform: PLATFORM, room: ROOM,
    spawn: { x: 0, y: 0, z: 5.0 },
    /** Phase 15 test handles: the two merged AO strips, every skirting board, the three
     *  merged plank floors (m13 G8, G15). */
    skirts, skirting, plankFloors,
    dispose() {
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      });
    },
  };
}
