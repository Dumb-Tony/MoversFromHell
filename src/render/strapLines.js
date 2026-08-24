/* Strap rendering — GDD §10.3, §26.5, §20.2.
 *
 * §10.3 asks for exactly this and names the states: "Render the line, anchor validity,
 * tension, and overload risk."
 *
 *   Slack        "sagging line, GRAY state"
 *   Tensioned    "straight line, TEAL state, ratchet clicks"
 *   Overstressed "ORANGE/RED pulse, creak, vibration"
 *   Failed       "snap sound and released cargo"
 *
 * §26.5 requires state to be understandable without colour alone, so the four states differ
 * in SHAPE as well: a slack strap visibly sags and is thin, a tensioned one is straight, an
 * overstressed one is straight and thick and pulses, and a failed one is gone. Colour is the
 * fast read; geometry is the reliable one.
 *
 * §20.2 asks for "restrained edge/material response, not permanent neon", which is why the
 * pending-strap guide line is dashed and dim rather than a beam.
 *
 * ONE MESH PER STRAP, REUSED. Straps come and go constantly while packing, and rebuilding
 * geometry every frame is the kind of thing that quietly costs the §26.6 frame budget. Meshes
 * are pooled by strap id and hidden rather than destroyed.
 */

import { STRAP } from '../config.js';
import { STRAP_STATE } from '../cargo/straps.js';

const COLOURS = Object.freeze({
  [STRAP_STATE.SLACK]: 0x8b8b96,        // §10.3 "gray state"
  [STRAP_STATE.TENSIONED]: 0x39c9b0,    // §10.3 "teal state"
  [STRAP_STATE.OVERSTRESSED]: 0xf07a2a, // §10.3 "orange/red pulse"
});

export class StrapLines {
  /** @param {THREE.Scene} scene @param {StrapSystem} straps @param {ObjectRegistry} registry */
  constructor(scene, straps, registry) {
    this.scene = scene;
    this.straps = straps;
    this.registry = registry;
    this.pool = new Map();          // strapId -> {mesh, material}
    this.guides = new Map();        // seat -> the dashed line while that player places a strap
    this._t = 0;
  }

  _mesh(id) {
    let rec = this.pool.get(id);
    if (!rec) {
      const THREE = window.THREE;
      const material = new THREE.MeshBasicMaterial({ color: 0x39c9b0 });
      // A unit-length box along +Z, scaled per frame — cheaper than rebuilding geometry and
      // it keeps the strap a solid object rather than a 1px line that vanishes at distance.
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      rec = { mesh, material };
      this.pool.set(id, rec);
    }
    return rec;
  }

  /** Presentation only — runs on the render frame and never writes to state (§22.4). */
  update(dtSeconds = 0.016) {
    const THREE = window.THREE;
    this._t += dtSeconds;
    const live = new Set();

    for (const s of this.straps.straps.values()) {
      if (s.state === STRAP_STATE.FAILED) continue;   // §10.3: a failed strap is gone
      const e = this.registry.get(s.entityId);
      if (!e) continue;
      live.add(s.id);

      const hook = localToWorld(e.body, s.localPoint);
      const a = new THREE.Vector3(s.anchor.x, s.anchor.y, s.anchor.z);
      const b = new THREE.Vector3(hook.x, hook.y, hook.z);

      /* THE SAG IS THE POINT. §10.3's slack state is "sagging line", and a slack strap that
       * renders as a straight line is indistinguishable from a tensioned one — which is
       * exactly the mistake a player needs to be able to see themselves making. The dip is
       * the spare length, so a strap with 40 cm of slack hangs 20 cm lower than one with
       * none, and it is geometry rather than a colour. */
      const slack = Math.max(0, s.slack || 0);
      const mid = a.clone().add(b).multiplyScalar(0.5);
      mid.y -= Math.min(0.45, slack * 0.5);

      const { mesh, material } = this._mesh(s.id);
      mesh.visible = true;

      // Two segments through the sag point, so the line bends instead of just moving.
      this._segment(mesh, a, mid, s);
      const second = this._mesh(s.id + ':b');
      live.add(s.id + ':b');
      second.mesh.visible = true;
      this._segment(second.mesh, mid, b, s);
      second.material.color.setHex(material.color.getHex());
      second.material.opacity = material.opacity;
      second.material.transparent = material.transparent;

      void material;
    }

    for (const [id, rec] of this.pool) {
      if (!live.has(id)) rec.mesh.visible = false;
    }
  }

  _segment(mesh, from, to, strap) {
    const THREE = window.THREE;
    const dir = to.clone().sub(from);
    const len = Math.max(0.02, dir.length());

    // §26.5: thickness carries the state as well as colour does.
    let width = 0.022;
    let colour = COLOURS[strap.state] || 0x8b8b96;
    let opacity = 1;
    if (strap.state === STRAP_STATE.SLACK) { width = 0.014; opacity = 0.7; }
    if (strap.state === STRAP_STATE.OVERSTRESSED) {
      width = 0.038;
      // §10.3 "orange/red PULSE" — and how close to failing it is sets the rate.
      const over = (strap.tension - STRAP.ratingNewtons) /
                   Math.max(1, STRAP.failureNewtons - STRAP.ratingNewtons);
      const pulse = 0.5 + 0.5 * Math.sin(this._t * (8 + over * 14));
      colour = pulse > 0.5 ? 0xff4d4d : 0xf07a2a;
    }

    mesh.scale.set(width, width, len);
    mesh.position.copy(from).add(to).multiplyScalar(0.5);
    mesh.lookAt(to);
    mesh.material.color.setHex(colour);
    mesh.material.transparent = opacity < 1;
    mesh.material.opacity = opacity;
    void THREE;
  }

  /**
   * The dashed guide from a chosen anchor to wherever the player is aiming, while a strap is
   * half-placed. §9.2: "placement provides a readable preview and valid/invalid affordance."
   */
  showGuide(anchor, point, valid, key = 0) {
    const THREE = window.THREE;
    if (!this.guides) this.guides = new Map();
    let guide = this.guides.get(key);
    if (!guide) {
      const m = new THREE.MeshBasicMaterial({ color: 0xa8d93a, transparent: true, opacity: 0.55 });
      guide = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), m);
      guide.frustumCulled = false;
      this.scene.add(guide);
      this.guides.set(key, guide);
    }
    if (!anchor || !point) { guide.visible = false; return; }
    const a = new THREE.Vector3(anchor.x, anchor.y, anchor.z);
    const b = new THREE.Vector3(point.x, point.y, point.z);
    const len = Math.max(0.02, a.distanceTo(b));
    guide.visible = true;
    guide.scale.set(0.012, 0.012, len);
    guide.position.copy(a).add(b).multiplyScalar(0.5);
    guide.lookAt(b);
    // §9.2's valid/invalid affordance: lime when it will attach, coral when it will not.
    guide.material.color.setHex(valid ? 0xa8d93a : 0xff5a5a);
  }

  /* KEYED BY SEAT (Phase 12). Two players can each be half-way through placing a strap, and
   * a single shared guide meant the second one to aim erased the first one's preview — a
   * §9.2 affordance silently disappearing because somebody else looked at something. Both
   * guides render in both viewports, which is correct: a strap being run out is a real thing
   * in the world, not a private overlay. */
  hideGuide(key) {
    if (!this.guides) return;
    if (key === undefined) { for (const g of this.guides.values()) g.visible = false; return; }
    const g = this.guides.get(key);
    if (g) g.visible = false;
  }
}

/* Duplicated from straps.js for the same reason it is duplicated there: four lines, and
 * importing it would couple the renderer to the cargo system. */
function localToWorld(body, p) {
  const t = body.translation(), r = body.rotation();
  const tx = r.w * p.x + r.y * p.z - r.z * p.y;
  const ty = r.w * p.y + r.z * p.x - r.x * p.z;
  const tz = r.w * p.z + r.x * p.y - r.y * p.x;
  const tw = -r.x * p.x - r.y * p.y - r.z * p.z;
  return {
    x: t.x + tx * r.w + tw * -r.x + ty * -r.z - tz * -r.y,
    y: t.y + ty * r.w + tw * -r.y + tz * -r.x - tx * -r.z,
    z: t.z + tz * r.w + tw * -r.z + tx * -r.y - ty * -r.x,
  };
}
