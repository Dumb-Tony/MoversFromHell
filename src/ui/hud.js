/* HUD — GDD §21.1, §26.5.
 *
 * §21.1 asks for exactly this and no more at this stage:
 *   "Small center reticle with left/right grip state."
 *   "No persistent panel should cover the object-doorway relationship."
 *
 * That second line is a real constraint, not decoration. The whole game is judging whether
 * a thing fits through a gap, so the HUD stays at the centre and the extreme edges and
 * never grows a panel over the working area.
 *
 * §26.5 requires state to be "understandable without colour alone", so every grip state
 * changes the reticle's SHAPE and carries a text label, not just its colour.
 */

export class Hud {
  constructor(root) {
    this.el = document.createElement('div');
    this.el.id = 'hud';
    this.el.innerHTML = `
      <div id="reticle">
        <div class="hand left"></div>
        <div class="dot"></div>
        <div class="hand right"></div>
      </div>
      <div id="grip-label"></div>`;
    root.appendChild(this.el);

    this.reticle = this.el.querySelector('#reticle');
    this.left = this.el.querySelector('.hand.left');
    this.right = this.el.querySelector('.hand.right');
    this.label = this.el.querySelector('#grip-label');
    this._lastKey = '';
  }

  /** @param {object} status from GripSystem.status() */
  update(status) {
    // A single key means the DOM is touched only when something actually changed — the
    // HUD must never be the reason a frame is missed (§26.6's 45 FPS floor).
    const key = JSON.stringify([
      status.left && [status.left.entityId, status.left.slipping],
      status.right && [status.right.entityId, status.right.slipping],
      status.hovered,
    ]);
    if (key === this._lastKey) return;
    this._lastKey = key;

    for (const [side, el] of [['left', this.left], ['right', this.right]]) {
      const g = status[side];
      el.className = 'hand ' + side +
        (g ? (g.slipping ? ' slipping' : ' holding') : (status.hovered ? ' ready' : ''));
    }

    const held = [status.left, status.right].filter(Boolean);
    const slipping = held.some((g) => g.slipping);
    if (slipping) {
      this.label.textContent = 'SLIPPING';
      this.label.className = 'slipping';
    } else if (held.length === 2 && held[0].entityId === held[1].entityId) {
      this.label.textContent = 'two hands';   // §6.2's hand-count factor, made visible
      this.label.className = 'holding';
    } else if (held.length) {
      this.label.textContent = 'holding';
      this.label.className = 'holding';
    } else if (status.hovered) {
      this.label.textContent = 'hold LMB / RMB to grab';
      this.label.className = 'ready';
    } else {
      this.label.textContent = '';
      this.label.className = '';
    }
  }
}
