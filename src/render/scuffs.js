/* Scuffs — the §8.4 "visual mark" for property damage. Phase 11 build-side M14.
 *
 * §8.4: "At impact: material sound, visual mark, optional haptic pulse, and one small cost
 * notice." §8.3: "Show decals … one consolidated cost ticker." §26.6: "No unbounded growth in
 * … decals" and "Reset removes … damage records." So this is a RING, not a pool that grows:
 * DAMAGE.property.decals.max quads are allocated ONCE at boot, hidden, and each property
 * ledger line takes the next slot — oldest reused when the ring is full. The scene's child
 * count never changes after boot (one Group), which is what m14 S1's equality measures.
 *
 * EVENT-DRIVEN, ZERO PER-FRAME WORK. It listens for DAMAGE_APPLIED with category 'property'
 * (the SAME event the item ledger uses — EVENTS is frozen and the audio, the recorder and the
 * notice all branch on `category`) and for SIM_RESET, which game.reset() emits. Nothing here
 * runs on the render frame, which is why it is constructed on BOTH tiers unlike ContactBlobs
 * (main.js builds blobs on the GPU tier only): the headless harness can then assert the bound.
 * m13 G1 names post and blobs as the two things the software tier must not allocate; a
 * 24-quad ring with one material and one geometry is neither.
 *
 * Rules copied from contactBlobs.js, and why:
 *   - a BLACK MeshBasicMaterial under NormalBlending, not MultiplyBlending: r128's Multiply
 *     is blendFunc(ZERO, SRC_COLOR) and discards alpha, so `opacity` would be a no-op;
 *     black × Normal computes dst × (1 − a), which IS a multiply by the mark's darkness;
 *   - material.userData.LAYER, never userData.kind: m13 G12 asserts shininess ≥ 4 on every
 *     `kind` material and a Basic decal has none;
 *   - quads carry userData.movable = true: m13 B1's doorway sweep skips movable meshes, and a
 *     mark on a door header IS in the doorway (that is the whole point of billing it);
 *   - 3 mm proud of the surface along its normal, depthWrite off, polygonOffset on.
 *
 * Size by band (scuffed / dented / holed) is the whole of the authoring today; §13.4's
 * "authored condition stages and decals" is a per-band texture atlas on this same ring.
 */

import { DAMAGE } from '../config.js';
import { EVENTS } from '../core/eventBus.js';

const SCUFF = Object.freeze({
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
});

export class Scuffs {
  /**
   * @param {typeof THREE} THREE
   * @param {THREE.Scene} scene   receives one Group named 'scuffs', once
   * @param {EventBus|null} bus   DAMAGE_APPLIED → mark(); SIM_RESET → clear()
   * @param {{max:number,size:object,proud:number,opacity:number}} cfg
   */
  constructor(THREE, scene, bus, cfg = DAMAGE.property.decals) {
    this.THREE = THREE;
    this.cfg = cfg;
    this.max = cfg.max;
    this.group = new THREE.Group();
    this.group.name = 'scuffs';
    scene.add(this.group);

    this.material = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: cfg.opacity,
      depthWrite: false,
      blending: THREE.NormalBlending,   // black × Normal == multiply by (1 − a); see header
      polygonOffset: true,
      polygonOffsetFactor: SCUFF.polygonOffsetFactor,
      polygonOffsetUnits: SCUFF.polygonOffsetUnits,
      toneMapped: false,
      fog: false,
    });
    this.material.userData.layer = 'scuff';
    /** ONE geometry for the whole ring — nothing per quad varies but its transform. */
    this.geometry = new THREE.PlaneGeometry(1, 1);

    /** @type {THREE.Mesh[]} the ring, allocated in full here and never grown */
    this.pool = [];
    for (let i = 0; i < this.max; i++) {
      const mesh = new THREE.Mesh(this.geometry, this.material);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.visible = false;
      mesh.userData.movable = true;
      mesh.userData.layer = 'scuff';
      mesh.name = 'scuff';
      this.group.add(mesh);
      this.pool.push(mesh);
    }
    /** Quads currently shown (≤ max). */
    this.count = 0;
    this._next = 0;
    this._tmp = new THREE.Vector3();
    this._off = [];
    if (bus) {
      this._off.push(bus.on(EVENTS.DAMAGE_APPLIED, (e) => { this.mark(e); }));
      this._off.push(bus.on(EVENTS.SIM_RESET, () => { this.clear(); }));
    }
  }

  /**
   * Place one mark for a property ledger line. Ignores everything else (item damage has no
   * surface to mark). Returns the quad used, or null.
   * @param {{category:string, at:{x,y,z}, normal:{x,y,z}, band:string}} e
   */
  mark(e) {
    if (!e || e.category !== 'property') return null;
    const at = e.at, n = e.normal;
    if (!at || !n || !Number.isFinite(at.x) || !Number.isFinite(n.x)) return null;
    const size = (this.cfg.size && this.cfg.size[e.band]) || (this.cfg.size && this.cfg.size.scuffed);   // every band is in DAMAGE.property.decals.size
    const q = this.pool[this._next];
    this._next = (this._next + 1) % this.max;
    const proud = this.cfg.proud;
    q.position.set(at.x + n.x * proud, at.y + n.y * proud, at.z + n.z * proud);
    // A PlaneGeometry faces +Z; lookAt turns that +Z along the surface normal.
    this._tmp.set(q.position.x + n.x, q.position.y + n.y, q.position.z + n.z);
    q.lookAt(this._tmp);
    q.scale.set(size, size, 1);
    q.visible = true;
    if (this.count < this.max) this.count++;
    return q;
  }

  /** §26.6 "reset removes … damage records": every mark hidden, the ring rewound. */
  clear() {
    for (const q of this.pool) q.visible = false;
    this.count = 0;
    this._next = 0;
  }

  dispose() {
    for (const off of this._off) { if (typeof off === 'function') off(); }
    this._off.length = 0;
    this.clear();
    this.geometry.dispose();
    this.material.dispose();
    if (this.group.parent) this.group.parent.remove(this.group);
  }
}
