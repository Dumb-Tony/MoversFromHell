/* Contact blobs — the third leg of the baked-occlusion trio (Phase 15, §20.4 "contact
 * shadows").
 *
 * WHY THIS EXISTS. SSAO was dropped from the look: a half-res depth pass costs a second
 * scene traversal and the canvas MSAA, and the interior's occlusion can be had three cheaper
 * ways — a vertex AO band baked into every prefab (prefabs.js), multiply-blended skirts along
 * every wall base (scene.js), and THIS: a soft dark disc that follows every movable thing
 * down to whatever it is standing over. The room spots' VSM shadows fall straight down, so
 * a box on the deck already has a shadow; what the blob adds is the 25-40 % dip within 10 cm
 * of contact that a 1024² map blurred by three texels cannot resolve, and it keeps that dip
 * OUTDOORS where the sun's shadow is a long streak that says nothing about contact.
 *
 * GROUND-FOLLOWING, NOT BODY-FOLLOWING. The blob sits on the surface under the object, not
 * on the object's own base, so a carried couch throws a blob onto the floor two metres below
 * its feet — which is how a lift reads as a lift. That surface comes from one downward
 * Rapier ray per source, injected as `probe(x, y, z, exclude)` by main.js. NO PHYSICS IMPORT
 * HERE: this file is presentation, and the query pipeline is main.js's to own. Three things
 * the probe contract encodes and that were each a real bug in the design review:
 *   - the source's OWN collider is excluded, or the ray hits the object and the blob rides
 *     up with it — a floating dark disc glued to a carried box;
 *   - the ray starts 2 cm above the object's bottom so it cannot start inside the floor;
 *   - null (no hit within cfg.rayMax) HIDES the blob rather than guessing a ground height —
 *     a ray before the first physics step returns null, and a collider created this frame is
 *     invisible until the next, so "no hit" is normal and must not draw anything.
 *
 * ⚠ THE BLEND. The spec says MultiplyBlending; r128's MultiplyBlending is blendFunc(ZERO,
 * SRC_COLOR) and DISCARDS ALPHA, so `material.opacity` — the whole fade-with-lift mechanism —
 * would be a no-op under it (verified in the vendored WebGLState.setBlending). A BLACK
 * MeshBasicMaterial under NormalBlending computes dst × (1 − a) + 0 × a = dst × (1 − a),
 * which IS a multiply by the blob's darkness, and it honours opacity, the alphaMap and a
 * per-vertex alpha. So: colour black, alphaMap = the radial gradient (r128 samples .g),
 * vertexColors with a 4-component 'color' attribute (r128 defines USE_COLOR_ALPHA when the
 * attribute's itemSize is 4 — verified in the vendored WebGLPrograms), and the per-quad fade
 * lives in that attribute's alpha. One material, one program, one texture, N quads.
 *
 * toneMapped:false and fog:false, both on purpose: the fragment is a MULTIPLIER, and ACES
 * or fog would remap it into a different multiplier that depends on distance and exposure.
 *
 * SOFTWARE TIER: never constructed. main.js builds this only when the tier is 'gpu' — the
 * 14-suite harness under SwiftShader pays for nothing here (m13 G1 asserts blobs === null).
 *
 * Quads carry userData.movable = true so m13 B1's doorway sweep skips them (a blob under a
 * box mid-doorway is legitimately in the doorway), and they are 3 mm above their surface so
 * B1b's sweep, whose clear boxes start at y 0.06, never sees one on a floor.
 */

import { RENDER } from '../config.js';

/** Geometry and texture constants — named, not scattered (§25.1). */
const BLOB = Object.freeze({
  /** Quad footprint over the object's own: a little wider so the dark edge shows past a
   *  box's bevel rather than hiding under it. */
  spread: 1.05,
  /** Movers and other 'disc' sources get a fixed footprint. */
  discSize: 0.5,
  /** Above the probed surface: over the 2 mm plank-over-underplane gap and under B1b's
   *  0.06 m clear-box floor with room to spare. */
  lift: 0.003,
  /** The ray starts this far above the source's bottom so it never starts inside the floor. */
  rayStartAbove: 0.02,
  /** Radial gradient: fully dark to this fraction of the radius, then soft to the edge. */
  texSize: 64,
  solidRadius: 0.70,
  /** Depth-fight guard against the surface the blob lies on. */
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
  /** Pool growth step. 28 is the manifest (23) + tools (4) + a mover; co-op adds one. */
  poolStep: 8,
});

/** The radial alpha gradient, drawn once per ContactBlobs (disposed with it). */
function makeGradientTexture(THREE) {
  const n = BLOB.texSize;
  const c = document.createElement('canvas');
  c.width = n; c.height = n;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  // White = opaque in an alphaMap (r128 reads .g). Solid to 70 % of the radius, then soft.
  g.addColorStop(0, '#ffffff');
  g.addColorStop(BLOB.solidRadius, '#ffffff');
  g.addColorStop(1, '#000000');
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, n, n);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, n, n);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

export class ContactBlobs {
  /**
   * @param {typeof THREE} THREE
   * @param {THREE.Scene} scene   receives one Group named 'contactBlobs'
   * @param {{strength:number, fadeLift:number, maxDist:number, rayMax:number}} cfg
   */
  constructor(THREE, scene, cfg = RENDER.look.blob) {
    this.THREE = THREE;
    this.cfg = cfg;
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'contactBlobs';
    scene.add(this.group);

    this.texture = makeGradientTexture(THREE);
    this.material = new THREE.MeshBasicMaterial({
      color: 0x000000,
      alphaMap: this.texture,
      transparent: true,
      opacity: 1,                 // the per-quad strength lives in the vertex alpha
      depthWrite: false,
      blending: THREE.NormalBlending,   // black × NormalBlending == multiply by (1 - a); see header
      polygonOffset: true,
      polygonOffsetFactor: BLOB.polygonOffsetFactor,
      polygonOffsetUnits: BLOB.polygonOffsetUnits,
      vertexColors: true,
      toneMapped: false,
      fog: false,
    });
    /* `layer`, NOT `kind`: userData.kind is reserved for surface() classes and m13 G12 asserts
     * shininess >= 4 on every material carrying it — a Basic multiply decal has none. */
    this.material.userData.layer = 'contactBlob';

    /** @type {THREE.Mesh[]} */
    this.pool = [];
    this._visible = 0;
    this._tmp = new THREE.Vector3();
  }

  /** A unit quad in XY with a 4-component colour attribute (alpha = fade). */
  _makeQuad() {
    const THREE = this.THREE;
    const geo = new THREE.PlaneGeometry(1, 1);
    const n = geo.attributes.position.count;
    const col = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { col[i * 4] = 1; col[i * 4 + 1] = 1; col[i * 4 + 2] = 1; col[i * 4 + 3] = 1; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = true;
    mesh.matrixAutoUpdate = true;
    mesh.visible = false;
    mesh.userData.movable = true;
    mesh.userData.layer = 'contactBlob';
    mesh.name = 'contactBlob';
    this.group.add(mesh);
    this.pool.push(mesh);
    return mesh;
  }

  _quad(i) {
    while (this.pool.length <= i) {
      for (let k = 0; k < BLOB.poolStep; k++) this._makeQuad();
    }
    return this.pool[i];
  }

  _setAlpha(mesh, a) {
    const attr = mesh.geometry.attributes.color;
    const arr = attr.array;
    for (let i = 3; i < arr.length; i += 4) arr[i] = a;
    attr.needsUpdate = true;
  }

  /**
   * Place one quad per source that is near a camera and standing over something.
   *
   * @param {Array<{x:number,y:number,z:number,yaw:number,sx:number,sz:number,bottomY:number,disc?:boolean,exclude?:any}>} sources
   * @param {(x:number,y:number,z:number,exclude:any) => number|null} probe  ground height under (x,z), or null
   * @param {THREE.Camera[]} cameras  every seat's camera; a source beyond cfg.maxDist of all of them is hidden
   */
  update(sources, probe, cameras) {
    const cfg = this.cfg;
    const maxD2 = cfg.maxDist * cfg.maxDist;
    const cams = cameras || [];
    let used = 0;
    for (const s of sources || []) {
      if (!s) continue;
      // Distance gate against every seat camera — a blob nobody can see costs a ray and a draw.
      let near = cams.length === 0;
      for (const c of cams) {
        const p = c.position;
        const dx = p.x - s.x, dy = p.y - s.y, dz = p.z - s.z;
        if (dx * dx + dy * dy + dz * dz <= maxD2) { near = true; break; }
      }
      if (!near) continue;

      const bottomY = (s.bottomY !== undefined) ? s.bottomY : s.y;
      let groundY = null;
      try { groundY = probe ? probe(s.x, bottomY + BLOB.rayStartAbove, s.z, s.exclude) : null; }
      catch (e) { groundY = null; }
      if (groundY === null || groundY === undefined || !Number.isFinite(groundY)) continue;

      const lift = Math.max(0, bottomY - groundY);
      const fade = 1 - Math.min(1, Math.max(0, lift / cfg.fadeLift));
      const alpha = cfg.strength * fade;
      if (alpha <= 0.002) continue;

      const q = this._quad(used++);
      q.position.set(s.x, groundY + BLOB.lift, s.z);
      // Rz(yaw) spins the quad in its own plane, then Rx(-π/2) lays it flat: that composes
      // to a rotation about world +Y by yaw (r128 Euler 'XYZ' applies Z first).
      q.rotation.set(-Math.PI / 2, 0, s.yaw || 0);
      if (s.disc) q.scale.set(BLOB.discSize, BLOB.discSize, 1);
      else q.scale.set(BLOB.spread * (s.sx || BLOB.discSize), BLOB.spread * (s.sz || BLOB.discSize), 1);
      this._setAlpha(q, alpha);
      q.visible = true;
    }
    for (let i = used; i < this.pool.length; i++) this.pool[i].visible = false;
    this._visible = used;
  }

  /** Number of quads shown by the last update(). */
  count() { return this._visible; }

  dispose() {
    for (const q of this.pool) { q.geometry.dispose(); }
    this.pool.length = 0;
    this._visible = 0;
    this.material.dispose();
    this.texture.dispose();
    if (this.group.parent) this.group.parent.remove(this.group);
  }
}
