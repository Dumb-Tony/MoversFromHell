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
 *
 * CAMERA SHAKE (Phase 11 build-side M16; §21.4 Motion, §26.5 "camera shake … exist[s]",
 * §11.3 road events are felt, §8.4 feedback without a second HUD element). A damped-spring
 * OFFSET on the eye — three metres-valued components in the rig's FLAT frame (x right, y up,
 * z forward, yaw only) plus a small pitch/roll — that `nudge()` adds to and `update()`
 * integrates on SIM time (setClock) with the exact solution of the damped oscillator, so the
 * same nudge reads the same at 60 and 144 Hz. It is applied AFTER the boom solve and BEFORE
 * its own collision probe, for two reasons the brief names: added before the solve it would
 * feed the asymmetric distance lerp (a 30/s pull-in and a 4/s ease-out would smear a 5 Hz
 * wobble into a lurch), and without the second probe a nudge toward a wall would put the eye
 * inside it. It NEVER touches yaw or pitch — those are the player's pointer-lock axes, and a
 * shake on them reads as input loss (m24 K6). Both caps (maxOffset, maxRot) are on the
 * running value, not the sum of nudges (m24 K4). At rest the offset is exactly zero and the
 * second probe is skipped, so a still camera renders byte-identically to the build before
 * shake existed (the m13/m15 shots). `shakeEnabled` (the §26.5 switch, from the settings
 * store) makes nudge() a no-op and clears whatever was in flight.
 *
 * No copy: AirportBaggageCrew\src\render\fx.js records "No screen shake … there is no
 * settings screen until M5" and never got one, so this is the first in Dev\.
 */

import { RENDER } from '../config.js';

const C = RENDER.camera;
const S = C.shake;

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

    /* ---- shake state (M16). Offsets in the flat frame, metres; rotation in radians. ---- */
    this.shakeEnabled = true;
    this._shake = { x: 0, y: 0, z: 0 };
    this._shakeV = { x: 0, y: 0, z: 0 };
    this._rot = { pitch: 0, roll: 0 };
    this._rotV = { pitch: 0, roll: 0 };
    this._shakeEye = new THREE.Vector3();
    /** Sim-time source (ms) — set by setClock; without one the shake runs on frame time. */
    this._clock = null;
    this._shakeLastMs = null;
    this._sinceSimS = 0;
    /** True when the last update's second probe had to pull the shaken eye out of a wall. */
    this.shakeClamped = false;
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

  /* ── shake (M16) ───────────────────────────────────────────────────────────────── */

  /** Integrate the shake on SIM time: `clock` is the GameClock (simTimeMs, paused). The
   *  camera is presentation and the rest of update() stays on frame time; the shake reads the
   *  sim clock so a suite can drive game.frame() and read the rig after one update, exactly
   *  as the shot scripts do (performance.now() is frozen under the harness). */
  setClock(clock) { this._clock = clock || null; this._shakeLastMs = null; this._sinceSimS = 0; }

  /** The §26.5 switch. Off clears whatever is in flight, so the camera is still at once. */
  setShakeEnabled(on) {
    this.shakeEnabled = !!on;
    if (!this.shakeEnabled) this.clearShake();
    return this.shakeEnabled;
  }

  clearShake() {
    const o = this._shake, v = this._shakeV;
    o.x = o.y = o.z = 0; v.x = v.y = v.z = 0;
    this._rot.pitch = this._rot.roll = 0;
    this._rotV.pitch = this._rotV.roll = 0;
    this.shakeClamped = false;
  }

  /**
   * Add to the shake offset. `impulse` is metres in the rig's FLAT frame: x right, y up,
   * z forward (the direction the camera faces, flattened). `rot` is milliradians — a
   * number rolls; `{pitch, roll}` does both (pitch < 0 dips the view). Both are capped on
   * the running value (S.maxOffset on the length, S.maxRot per axis). A no-op while the
   * switch is off. Returns whether anything was added.
   */
  nudge(impulse = {}, rot) {
    if (!this.shakeEnabled) return false;
    const o = this._shake;
    o.x += num(impulse.x); o.y += num(impulse.y); o.z += num(impulse.z);
    clampLength(o, S.maxOffset);
    if (rot !== undefined && rot !== null) {
      const r = typeof rot === 'number' ? { roll: rot } : rot;
      this._rot.pitch = clampAbs(this._rot.pitch + num(r.pitch) * 1e-3, S.maxRot);
      this._rot.roll = clampAbs(this._rot.roll + num(r.roll) * 1e-3, S.maxRot);
    }
    return true;
  }

  /** nudge() with a WORLD-frame vector (metres), projected onto the flat frame — what a bus
   *  observer has when the event carries a truck-frame or world position. */
  nudgeWorld(vec = {}, rot) {
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    const x = num(vec.x), y = num(vec.y), z = num(vec.z);
    // right = (c, 0, -s), forward = (-s, 0, -c) — the same basis forwardFlat/rightFlat give.
    return this.nudge({ x: x * c - z * s, y, z: -x * s - z * c }, rot);
  }

  /** The current offset, flat frame, metres (a copy). Zero when at rest. */
  shakeOffset() { const o = this._shake; return { x: o.x, y: o.y, z: o.z }; }
  shakeMagnitude() { const o = this._shake; return Math.sqrt(o.x * o.x + o.y * o.y + o.z * o.z); }
  /** The current rotational part, radians (a copy). */
  shakeRot() { return { pitch: this._rot.pitch, roll: this._rot.roll }; }

  /** How much time the shake should integrate for this update. Sim time when the sim moved;
   *  frame time once the sim has been still for S.simStallS (paused, or a suite that steps
   *  physics without the clock), so a shake never freezes mid-air — and never double-counts
   *  on a display that draws two frames per sim step. */
  _shakeDt(dtSeconds) {
    if (!this._clock) return Math.max(0, dtSeconds || 0);
    const now = this._clock.simTimeMs;
    if (this._shakeLastMs === null) { this._shakeLastMs = now; this._sinceSimS = 0; return 0; }
    const simDt = (now - this._shakeLastMs) / 1000;
    this._shakeLastMs = now;
    if (simDt > 0) { this._sinceSimS = 0; return simDt; }
    this._sinceSimS += Math.max(0, dtSeconds || 0);
    return this._sinceSimS > S.simStallS ? Math.max(0, dtSeconds || 0) : 0;
  }

  /** Exact damped-oscillator step for every component (see the header). */
  _integrateShake(dt) {
    if (dt <= 0) return;
    const o = this._shake, v = this._shakeV;
    const wn = Math.sqrt(S.stiffness);
    const zeta = Math.min(0.999, S.damping / (2 * wn));   // underdamped by construction
    const a = zeta * wn;
    const wd = wn * Math.sqrt(1 - zeta * zeta);
    const e = Math.exp(-a * dt), cs = Math.cos(wd * dt), sn = Math.sin(wd * dt);
    const step = (x, vx) => [
      e * (x * cs + ((vx + a * x) / wd) * sn),
      e * (vx * cs - ((wn * wn * x + a * vx) / wd) * sn),
    ];
    let r;
    r = step(o.x, v.x); o.x = r[0]; v.x = r[1];
    r = step(o.y, v.y); o.y = r[0]; v.y = r[1];
    r = step(o.z, v.z); o.z = r[0]; v.z = r[1];
    clampLength(o, S.maxOffset);
    r = step(this._rot.pitch, this._rotV.pitch); this._rot.pitch = clampAbs(r[0], S.maxRot); this._rotV.pitch = r[1];
    r = step(this._rot.roll, this._rotV.roll); this._rot.roll = clampAbs(r[0], S.maxRot); this._rotV.roll = r[1];
    // Declare rest: a spring that is 10 µm out and crawling is a spring at zero. Without this
    // the second probe would run forever after the first nudge of a session.
    if (Math.abs(o.x) < S.restOffset && Math.abs(o.y) < S.restOffset && Math.abs(o.z) < S.restOffset &&
        Math.abs(v.x) < S.restVelocity && Math.abs(v.y) < S.restVelocity && Math.abs(v.z) < S.restVelocity) {
      o.x = o.y = o.z = 0; v.x = v.y = v.z = 0;
    }
    if (Math.abs(this._rot.pitch) < S.restOffset && Math.abs(this._rotV.pitch) < S.restVelocity) { this._rot.pitch = 0; this._rotV.pitch = 0; }
    if (Math.abs(this._rot.roll) < S.restOffset && Math.abs(this._rotV.roll) < S.restVelocity) { this._rot.roll = 0; this._rotV.roll = 0; }
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

    /* ---- shake (M16): after the boom solve, before its own probe ------------------------
     * The offset applied this frame is the spring's state as it stands — a nudge that
     * arrived during the sim frame just stepped shows in full on this update and decays from
     * the next (m24 K2 reads the peak on the first update). The eye is then probed from the
     * target again, so a nudge toward a wall is clamped exactly as the boom would be. The
     * camera keeps looking at the UNSHIFTED target: a translated eye tracking a fixed subject
     * swings the frame by offset/boom radians — the visible part of a jolt — without a single
     * change to yaw or pitch. */
    this.shakeClamped = false;
    const o = this._shake;
    if (o.x !== 0 || o.y !== 0 || o.z !== 0) {
      const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
      const eye = this._shakeEye.set(
        this.camera.position.x + c * o.x - s * o.z,
        this.camera.position.y + o.y,
        this.camera.position.z - s * o.x - c * o.z,
      );
      this.shakeClamped = camOcclude(this.target, eye, this.colliders);
      if (eye.y < RENDER.camera.eyeFloorY) eye.y = RENDER.camera.eyeFloorY;
      this.camera.position.copy(eye);
    }
    this.camera.lookAt(this.target);
    if (this._rot.pitch !== 0 || this._rot.roll !== 0) {
      // Local axes after lookAt: X right, Z the view axis. Pitch dips or lifts, roll tilts.
      this.camera.rotateX(this._rot.pitch);
      this.camera.rotateZ(this._rot.roll);
    }
    this._integrateShake(this._shakeDt(dtSeconds));
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

/* ── shake helpers (M16) ─────────────────────────────────────────────────────────── */

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function clampAbs(v, cap) { return v > cap ? cap : v < -cap ? -cap : v; }
/** Scale a {x,y,z} down to `cap` length in place — a cap, not a per-axis clip, so a
 *  diagonal nudge keeps its direction. */
function clampLength(o, cap) {
  const len = Math.sqrt(o.x * o.x + o.y * o.y + o.z * o.z);
  if (len > cap && len > 0) { const k = cap / len; o.x *= k; o.y *= k; o.z *= k; }
  return o;
}
