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
import { texHiVis, texDenim, matte } from './textures.js';

export function makeBlockout(clothColour) {
  const THREE = window.THREE;
  const H = PLAYER.height;
  const g = new THREE.Group();

  // Phase 4 gives each mover its own colour, so which one you are driving is readable at a
  // glance rather than from the HUD.
  const skin = '#cfa98c', cloth = clothColour || '#5f6b8a', dark = '#2f3444', hi = '#a8d93a';
  const mat = (c) => matte(c);
  const denimMat = matte(0xffffff, { map: texDenim(220, 0.26) });
  const visMat = matte(0xffffff, { map: texHiVis(66) });

  /* TOY PROPORTIONS (2026-08-25): shorter legs, wider torso, a plainly oversized head.
   * The silhouette IS the style — the old ratios were realistic, and realistic ratios on
   * primitive geometry read as unfinished rather than as chosen. Still normalised to
   * exactly PLAYER.height below, so the capsule contract holds. */
  const legH = H * 0.44, torsoH = H * 0.34, headR = H * 0.105;

  /* THE CREW ACTUALLY LOOK LIKE A CREW NOW — hi-vis, caps, work boots, gloves.
   *
   * §20.4's "prototype visuals are diagnostic" governed this file for twelve phases and it
   * was right to: what mattered was that FACING and SCALE were unambiguous. Both survive
   * here — the cap peak replaces the nose cone as the facing tell and points the same way,
   * and the whole group is still normalised to exactly PLAYER.height at the bottom of this
   * function, so the mesh cannot drift from the capsule every clearance number comes from.
   *
   * The gloves stay §6.1's reference lime rather than becoming realistic work gloves. That
   * is not laziness: seeing where the hands are is a grip affordance the game depends on
   * from Phase 2 onward, and hi-vis gloves are also just what movers wear. */
  const mkLeg = (sx) => {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.17, legH, 0.19), denimMat);
    l.position.set(sx * 0.13, legH / 2, 0);
    // Boot: wider, darker, at the ankle. Child of the leg, so it swings with the gait.
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.175, legH * 0.17, 0.235), mat('#241f1c'));
    boot.position.set(0, -legH / 2 + legH * 0.085, 0.024);
    l.add(boot);
    g.add(l);
    return l;
  };
  const legL = mkLeg(-1), legR = mkLeg(1);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, torsoH, 0.30), mat(cloth));
  torso.position.y = legH + torsoH / 2;
  // The vest, a hair proud of the shirt on all sides and stopping short at the shoulders,
  // so the mover's own colour still reads at a glance (§6.4 — you must know which is yours).
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.55, torsoH * 0.76, 0.335), visMat);
  vest.position.set(0, -torsoH * 0.08, 0);
  torso.add(vest);
  g.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 16, 12), mat(skin));
  head.position.y = legH + torsoH + headR * 0.95;
  g.add(head);

  // A cap: crown plus peak. The PEAK is the facing tell — it points -Z, matching
  // forwardFlat() at yaw 0, exactly as the nose cone it replaces did.
  const crown = new THREE.Mesh(
    new THREE.SphereGeometry(headR * 1.04, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.52), mat(cloth));
  crown.position.set(0, headR * 0.12, 0);
  head.add(crown);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(headR * 1.5, headR * 0.16, headR * 0.95), mat(cloth));
  nose.position.set(0, headR * 0.16, -headR * 1.05);
  head.add(nose);

  const mkArm = (sx) => {
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.13, torsoH * 0.95, 0.15), mat(skin));
    a.position.set(sx * 0.335, legH + torsoH * 0.52, 0);
    // Short sleeve over the top third.
    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.15, torsoH * 0.34, 0.17), mat(cloth));
    sleeve.position.set(0, torsoH * 0.30, 0);
    a.add(sleeve);
    g.add(a);
    return a;
  };
  const armL = mkArm(-1), armR = mkArm(1);

  // Hand markers, in the reference lime. §6.1 gives each hand its own grip, so seeing
  // where the hands are matters from Phase 2 onward — cheap to put in now.
  const mkHand = (sx) => {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.13), mat(hi));
    h.position.set(sx * 0.335, legH + torsoH * 0.10, 0);
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
    /**
     * @param {{x,y,z}} feet  @param {number} yaw  @param {number} speed m/s
     * @param {{left?:{x,y,z}|null, right?:{x,y,z}|null}} [hands]  world-space grip points.
     *
     * THE REACH. "Carrying looks like standing next to something" was in KNOWN_ISSUES from
     * the day the art pass landed. With a grip point, the arm pitches to point at it and
     * the lime hand-cube SITS ON IT — §6.1 gives each hand its own grip, and now each hand
     * visibly has one. The cubes have marked the hands since Phase 2; this is the first
     * time they mark the grip.
     */
    update(feet, yaw, speed, dtSeconds, hands) {
      g.position.set(feet.x, feet.y, feet.z);
      g.rotation.y = yaw;      // no +PI: the body already faces -Z. See the header.
      g.updateMatrixWorld();

      // Cadence tracks speed, the cheap version of Chameleon's skelWalk. A real
      // procedural gait lands with the rig, not with a box mannequin.
      const moving = speed > 0.15;
      parts.phase += dtSeconds * (moving ? 2.2 + speed * 1.5 : 0);
      const swing = moving ? Math.sin(parts.phase) * Math.min(0.6, 0.18 + speed * 0.09) : 0;
      legL.rotation.x = swing;
      legR.rotation.x = -swing;

      for (const [arm, handCube, side] of [[armL, handL, 'left'], [armR, handR, 'right']]) {
        const target = hands && hands[side];
        if (target) {
          /* Into body space, so the arithmetic survives the body's own yaw. The arm pivots
           * at its top (geometry translated at build time), so the pitch that points its
           * length at the target is atan2 of forward reach over drop — clamped to what a
           * shoulder can do, because a grip BEHIND the mover must not fold the arm through
           * the torso. */
          const local = g.worldToLocal(new THREE.Vector3(target.x, target.y, target.z));
          const shoulderY = legH + torsoH * 0.99;
          const dy = shoulderY - local.y;
          const reach = Math.max(0.05, -local.z);          // -Z is forward
          arm.rotation.x = -Math.atan2(reach, Math.max(0.05, dy)) * 0.92;
          arm.rotation.x = Math.max(-2.1, Math.min(0.35, arm.rotation.x));
          /* And a sideways lean toward the grip, so a hold at the mover's flank does not
           * read as an arm pointing forward while the hand floats a shoulder-width away. */
          const sideways = local.x - (side === 'left' ? -0.335 : 0.335);
          // Sign check, learned by rendering it wrong: rotating the arm's down-vector about
          // +z moves its tip toward +x, so the lean SHARES the sideways sign — negating it
          // pointed the far mover's arm directly away from the couch they were holding.
          arm.rotation.z = Math.max(-0.9, Math.min(0.9, sideways * 1.4));
          // The hand cube sits ON the grip point (clamped to arm's length, so a stretched
          // grip shows the hand at full extension rather than floating off the wrist).
          const armLen = torsoH * 0.95;
          const stretch = Math.min(1.15, local.length() / Math.max(0.2, armLen));
          handCube.position.set(
            Math.max(-0.55, Math.min(0.55, local.x)),
            Math.max(0.15, Math.min(shoulderY + 0.1, local.y)),
            Math.max(-armLen * stretch - 0.15, Math.min(0.1, local.z)));
        } else {
          arm.rotation.x = (side === 'left' ? -swing : swing) * 0.7;
          arm.rotation.z = 0;
          if (!moving) arm.rotation.x *= 0.8;
          handCube.position.set((side === 'left' ? -1 : 1) * 0.335, legH + torsoH * 0.10, 0);
        }
      }
      if (!moving) { legL.rotation.x *= 0.8; legR.rotation.x *= 0.8; }
    },
  };
}
