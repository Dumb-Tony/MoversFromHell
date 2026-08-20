/* Player blockout body — GDD §20.4 (prototype visuals are diagnostic), §5.1.
 *
 * Adapted from SomethingsDifferent\somethingsdifferent.html `makeBlockout` (Dev\INDEX.md →
 * "Character bodies from primitives"). Replaced by a real rigged character much later;
 * what matters now is that FACING and SCALE are unambiguous, because §25.2's Phase 1 gate
 * is judged by eye ("responsive indoors and on ramp") and you cannot judge responsiveness
 * if you cannot tell which way the character is pointing.
 *
 * ONE DELIBERATE CHANGE FROM THE ORIGINAL. Something's Different builds the body facing
 * +Z and then sets `rotation.y = yaw + PI`, with a capitalised warning that getting the
 * offset backwards makes the character run backwards. This build faces the body along -Z
 * instead — the same direction `ThirdPersonCamera.forwardFlat()` returns at yaw 0 — so the
 * update is `rotation.y = yaw` with no offset to get wrong. One less place for the sign
 * bug that already bit this project once (see the camera basis fix in Phase 0).
 *
 * The body is normalised to exactly PLAYER.height with its feet at y=0, so the mesh can
 * never drift out of sync with the capsule that every clearance number derives from.
 */

import { PLAYER } from '../config.js';

export function makeBlockout(clothColour) {
  const THREE = window.THREE;
  const H = PLAYER.height;
  const g = new THREE.Group();

  // Phase 4 gives each mover its own colour, so which one you are driving is readable at a
  // glance rather than from the HUD.
  const skin = '#cfc6b8', cloth = clothColour || '#5f6b8a', dark = '#3d4358', hi = '#a8d93a';
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });

  const legH = H * 0.50, torsoH = H * 0.33, headR = H * 0.076;

  const mkLeg = (sx) => {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.15, legH, 0.17), mat(dark));
    l.position.set(sx * 0.13, legH / 2, 0);
    g.add(l);
    return l;
  };
  const legL = mkLeg(-1), legR = mkLeg(1);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, torsoH, 0.25), mat(cloth));
  torso.position.y = legH + torsoH / 2;
  g.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 16, 12), mat(skin));
  head.position.y = legH + torsoH + headR * 0.95;
  g.add(head);

  // The facing tell. Points -Z, matching forwardFlat() at yaw 0.
  const nose = new THREE.Mesh(new THREE.ConeGeometry(headR * 0.28, headR * 0.7, 8), mat('#d98f6a'));
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, head.position.y, -headR * 0.95);
  g.add(nose);

  const mkArm = (sx) => {
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.11, torsoH * 0.95, 0.13), mat(skin));
    a.position.set(sx * 0.29, legH + torsoH * 0.52, 0);
    g.add(a);
    return a;
  };
  const armL = mkArm(-1), armR = mkArm(1);

  // Hand markers, in the reference lime. §6.1 gives each hand its own grip, so seeing
  // where the hands are matters from Phase 2 onward — cheap to put in now.
  const mkHand = (sx) => {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), mat(hi));
    h.position.set(sx * 0.29, legH + torsoH * 0.10, 0);
    g.add(h);
    return h;
  };
  const handL = mkHand(-1), handR = mkHand(1);

  // Pivot the limbs from their TOP, so a swing reads as a hinge rather than a slide.
  for (const [m, h] of [[legL, legH], [legR, legH]]) {
    m.geometry.translate(0, -h / 2, 0);
    m.position.y = legH;
  }
  for (const [m, h] of [[armL, torsoH * 0.95], [armR, torsoH * 0.95]]) {
    m.geometry.translate(0, -h / 2, 0);
    m.position.y = legH + torsoH * 0.99;
  }

  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  // Normalise to exactly PLAYER.height with feet at 0. Same trick as Chameleon's
  // adoptBody: the mesh must never disagree with the capsule.
  const bb = new THREE.Box3().setFromObject(g);
  const meshH = bb.max.y - bb.min.y;
  if (meshH > 0.01) {
    const k = H / meshH;
    g.children.forEach((c) => { c.position.multiplyScalar(k); c.scale.multiplyScalar(k); });
  }

  const parts = { legL, legR, armL, armR, torso, head, nose, handL, handR, phase: 0 };

  return {
    group: g,
    parts,
    /** @param {{x,y,z}} feet  @param {number} yaw  @param {number} speed m/s */
    update(feet, yaw, speed, dtSeconds) {
      g.position.set(feet.x, feet.y, feet.z);
      g.rotation.y = yaw;      // no +PI: the body already faces -Z. See the header.

      // Cadence tracks speed, the cheap version of Chameleon's skelWalk. A real
      // procedural gait lands with the rig, not with a box mannequin.
      const moving = speed > 0.15;
      parts.phase += dtSeconds * (moving ? 2.2 + speed * 1.5 : 0);
      const swing = moving ? Math.sin(parts.phase) * Math.min(0.6, 0.18 + speed * 0.09) : 0;
      legL.rotation.x = swing;
      legR.rotation.x = -swing;
      armL.rotation.x = -swing * 0.7;
      armR.rotation.x = swing * 0.7;
      if (!moving) {
        legL.rotation.x *= 0.8; legR.rotation.x *= 0.8;
        armL.rotation.x *= 0.8; armR.rotation.x *= 0.8;
      }
    },
  };
}
