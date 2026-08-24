/* Split-screen layout and the multi-seat render pass — GDD §6.4, §21.1, §26.6.
 *
 * Adapted from `ContainmentDetailWeb\src\render\renderer.js`'s scissored second viewport
 * (Dev\INDEX.md → "A second camera as an instrument"), which is the same GL problem with a
 * different purpose: that one renders a small instrument inset, this one renders two equal
 * halves. The two gotchas recorded there are the two that matter here as well.
 *
 * ⚠ setViewport/setScissor TAKE CSS PIXELS. Three multiplies by the renderer's pixel ratio
 * internally, so pre-multiplying puts seat 1 off-screen on any dpr > 1 display — and it
 * looks exactly like the second pass never ran, which is indistinguishable from "co-op is
 * broken". Everything below is CSS pixels; nothing here ever sees devicePixelRatio.
 *
 * ⚠ WEBGL'S Y IS BOTTOM-UP. `rect.y` is a GL viewport origin measured from the BOTTOM of
 * the canvas; `rect.cssTop` is the same edge measured from the TOP, for positioning the DOM
 * HUD over it. Keeping both on the rect is what stops the HUD and the 3D view from
 * disagreeing about which half is which — a bug that renders perfectly and is pure nonsense.
 *
 * §21.1 is why the split is SIDE-BY-SIDE and not stacked: "no persistent panel should cover
 * the object-doorway relationship". Halving the height of a 16:9 view leaves 16:4.5, in
 * which a doorway is legible but the top of a wardrobe is not, and the whole game is about
 * whether the tall thing clears the frame.
 */

import { COOP } from '../config.js';

/**
 * Viewport rectangles, one per seat, in CSS pixels.
 *
 * @param {number} seatCount
 * @param {number} w  canvas CSS width
 * @param {number} h  canvas CSS height
 * @returns {{x,y,w,h,cssLeft,cssTop,cssW,cssH}[]}
 */
export function layoutFor(seatCount, w, h, layout = COOP.layout, dividerPx = COOP.dividerPx) {
  if (seatCount <= 1) {
    return [{ x: 0, y: 0, w, h, cssLeft: 0, cssTop: 0, cssW: w, cssH: h }];
  }
  const d = Math.max(0, dividerPx);
  if (layout === 'stacked') {
    const half = Math.floor((h - d) / 2);
    return [
      // Seat 0 is the TOP half, so its GL origin is the upper of the two.
      { x: 0, y: h - half, w, h: half, cssLeft: 0, cssTop: 0,        cssW: w, cssH: half },
      { x: 0, y: 0,        w, h: half, cssLeft: 0, cssTop: h - half, cssW: w, cssH: half },
    ];
  }
  const half = Math.floor((w - d) / 2);
  return [
    { x: 0,        y: 0, w: half, h, cssLeft: 0,        cssTop: 0, cssW: half, cssH: h },
    { x: w - half, y: 0, w: half, h, cssLeft: w - half, cssTop: 0, cssW: half, cssH: h },
  ];
}

/** Point a seat's camera at its own rectangle. Cheap, but only worth doing on a change —
 *  updateProjectionMatrix is not free and this runs every frame. */
export function applyAspect(camera, rect) {
  const a = rect.cssH > 0 ? rect.cssW / rect.cssH : 1;
  if (Math.abs(camera.aspect - a) < 1e-6) return false;
  camera.aspect = a;
  camera.updateProjectionMatrix();
  return true;
}

/**
 * Render every seat.
 *
 * The scissor test is what makes each `render()` clear only its own half. With it off, the
 * second pass's clear wipes the first pass's image and only seat 1 is ever visible — which,
 * like the pixel-ratio bug above, reads as "co-op does not work" rather than as a GL state
 * mistake.
 */
export function renderSeats(renderer, scene, seats, rects) {
  const multi = seats.length > 1;
  renderer.setScissorTest(multi);
  for (let i = 0; i < seats.length; i++) {
    const r = rects[i];
    if (!r || r.w <= 0 || r.h <= 0) continue;
    renderer.setViewport(r.x, r.y, r.w, r.h);
    if (multi) renderer.setScissor(r.x, r.y, r.w, r.h);
    renderer.render(scene, seats[i].camera);
  }
  renderer.setScissorTest(false);
}

/**
 * The bar between the two views.
 *
 * A DOM element rather than a GL quad: it is presentation chrome with no depth, it costs no
 * draw call, and it stays crisp at any pixel ratio. It is also the only part of the split
 * that a player consciously sees, so it should not be the part that shimmers.
 */
export class SplitDivider {
  constructor(root) {
    this.el = document.createElement('div');
    this.el.id = 'split-divider';
    this.el.hidden = true;
    root.appendChild(this.el);
  }

  /** @param {ReturnType<typeof layoutFor>} rects */
  update(rects, layout = COOP.layout) {
    if (rects.length < 2) { this.el.hidden = true; return; }
    this.el.hidden = false;
    const s = this.el.style;
    if (layout === 'stacked') {
      s.left = '0'; s.width = '100%';
      s.top = rects[0].cssH + 'px';
      s.height = Math.max(1, rects[1].cssTop - rects[0].cssH) + 'px';
    } else {
      s.top = '0'; s.height = '100%';
      s.left = rects[0].cssW + 'px';
      s.width = Math.max(1, rects[1].cssLeft - rects[0].cssW) + 'px';
    }
  }
}
