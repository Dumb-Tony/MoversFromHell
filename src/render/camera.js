/* Third-person camera rig — GDD §4.1.
 *
 * §4.1 wants: shoulder-height, adjustable distance, collision avoidance, generous aim
 * assistance for hand targeting, and indoor behaviour that "compresses smoothly rather
 * than cuts unpredictably". Everything except aim assistance (Phase 2, with grips) is here.
 *
 * The occlusion test is `camOcclude` from Chameleon\chameleon3d.html:4198 — analytic
 * ray-vs-AABB slab test against the collider list, so the camera glides along an obstacle
 * instead of clipping through it. Name kept so the lineage stays greppable (Dev\INDEX.md).
 * Adapted: Chameleon clamped to a fixed room shell, MFH clamps only to the ground plane
 * because the prototype site is a house plus a driveway, not one room.
 *
 * The asymmetric lerp is the §4.1 "compress smoothly" requirement made concrete: pull IN
 * fast (a wall must never be seen through) and ease OUT slowly (so walking past a doorway
 * does not fling the camera).
 */

import { RENDER } from '../config.js';

const C = RENDER.camera;

export class ThirdPersonCamera {
  /** @param {THREE.PerspectiveCamera} camera
   *  @param {{minX,maxX,minZ,maxZ,base,top}[]} colliders  static AABBs, shared with physics */
  constructor(camera, colliders = []) {
    const THREE = window.THREE;
    this.camera = camera;
    this.colliders = colliders;
    this.yaw = 0;
    this.pitch = -0.12;
    this.distance = C.distance;
    this._currentDistance = C.distance;
    this.target = new THREE.Vector3(0, C.height, 0);
    this._want = new THREE.Vector3();
    this._eye = new THREE.Vector3();
    this._smoothed = new THREE.Vector3(0, C.height, 0);
    this._first = true;
  }

  /** @param {{x:number,y:number}} lookDelta  consumed from Input, already sensitivity-scaled */
  applyLook(lookDelta) {
    this.yaw -= lookDelta.x * C.lookScale;
    this.pitch -= lookDelta.y * C.lookScale;
    if (this.pitch < C.pitchMin) this.pitch = C.pitchMin;
    if (this.pitch > C.pitchMax) this.pitch = C.pitchMax;
    // Wrap so yaw never grows without bound over a long session.
    if (this.yaw > Math.PI) this.yaw -= 2 * Math.PI;
    if (this.yaw < -Math.PI) this.yaw += 2 * Math.PI;
  }

  setDistance(d) {
    this.distance = Math.max(C.distanceMin, Math.min(C.distanceMax, d));
  }

  /** @param {{x,y,z}} focus  the point to orbit — player shoulder in Phase 1+
   *  @param {number} dtSeconds  REAL frame time; the camera is presentation, so it may
   *         run on frame time rather than sim time without affecting determinism. */
  update(focus, dtSeconds) {
    const f = Math.min(1, dtSeconds * C.followLerp);
    const tx = focus.x, ty = focus.y + C.height, tz = focus.z;
    if (this._first) { this._smoothed.set(tx, ty, tz); this._first = false; }
    else {
      this._smoothed.x += (tx - this._smoothed.x) * f;
      this._smoothed.y += (ty - this._smoothed.y) * f;
      this._smoothed.z += (tz - this._smoothed.z) * f;
    }
    this.target.copy(this._smoothed);

    // The eye sits BEHIND the target along -forward, where forward is forwardFlat() below.
    // The signs here and the signs in forwardFlat/rightFlat are one contract: get them out
    // of step and the character runs backwards while the camera looks the other way.
    // Something's Different has the same warning at somethingsdifferent.html:4080, in
    // capitals, for the same reason.
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    this._want.set(
      this.target.x + Math.sin(this.yaw) * cp * this.distance,
      this.target.y - sp * this.distance,
      this.target.z + Math.cos(this.yaw) * cp * this.distance,
    );

    this._eye.copy(this._want);
    const hit = camOcclude(this.target, this._eye, this.colliders);

    // Asymmetric smoothing on DISTANCE, not on position: smoothing position would let the
    // camera drift through the wall it just hit.
    const wantDist = this.target.distanceTo(this._eye);
    const rate = wantDist < this._currentDistance ? C.occludeLerpIn : C.occludeLerpOut;
    const k = Math.min(1, dtSeconds * rate);
    this._currentDistance += (wantDist - this._currentDistance) * k;

    const dir = this._eye.clone().sub(this.target);
    const len = dir.length();
    if (len > 1e-5) dir.multiplyScalar(this._currentDistance / len);
    this.camera.position.copy(this.target).add(dir);
    if (this.camera.position.y < 0.22) this.camera.position.y = 0.22;  // never below ground
    this.camera.lookAt(this.target);
    return hit;
  }

  /** Unit vector the camera is facing, flattened to the ground plane. Movement is
   *  camera-relative (§4.4), so every mover reads this.
   *  CONVENTION: at yaw 0 the camera looks along -Z (the Three.js default) and therefore
   *  sits at target + Z. update() places the eye to match; the two must never diverge. */
  forwardFlat(out) {
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    if (out) { out.x = -s; out.y = 0; out.z = -c; return out; }
    return { x: -s, y: 0, z: -c };
  }
  /** Right-hand perpendicular of forwardFlat: cross(forward, up) with up = +Y. */
  rightFlat(out) {
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    if (out) { out.x = c; out.y = 0; out.z = -s; return out; }
    return { x: c, y: 0, z: -s };
  }
}

/** Analytic ray-vs-AABB, from Chameleon\chameleon3d.html:4198 `camOcclude`.
 *  Mutates `to` to the first blocking hit and returns true if it moved it. */
export function camOcclude(from, to, colliders) {
  let tMin = 1;
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  for (const c of colliders) {
    if (c.noOcclude) continue;
    let t0 = 0, t1 = 1;
    const slab = (o, d, lo, hi) => {
      if (Math.abs(d) < 1e-8) return o >= lo && o <= hi;
      let a = (lo - o) / d, b = (hi - o) / d;
      if (a > b) { const q = a; a = b; b = q; }
      if (a > t0) t0 = a;
      if (b < t1) t1 = b;
      return t0 <= t1;
    };
    if (slab(from.x, dx, c.minX, c.maxX) &&
        slab(from.y, dy, c.base || 0, c.top) &&
        slab(from.z, dz, c.minZ, c.maxZ)) {
      if (t0 > 0.02 && t0 < tMin) tMin = t0;
    }
  }
  if (tMin < 1) {
    to.set(from.x + dx * tMin, from.y + dy * tMin, from.z + dz * tMin);
    to.x -= dx * 0.06; to.y -= dy * 0.06; to.z -= dz * 0.06;   // back off the surface
    return true;
  }
  return false;
}
