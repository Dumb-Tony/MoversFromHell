/* Ratchet straps — GDD §10.3, §9.1, §10.4.
 *
 * §10.3: "A strap connects two eligible endpoints: cargo-to-anchor in the prototype... The
 * player selects endpoint A, aims or walks to endpoint B, confirms, and tensions."
 *
 * A STRAP IS A ROPE, NOT A SPRING BETWEEN TWO POINTS. It pulls when it is taut and does
 * nothing at all when it is not — which is what makes §10.3's SLACK state a real state
 * rather than "a spring with a small force". One-sided constraints are also what let a
 * player strap something badly: a strap with too much slack is present, visible, and
 * useless, and that is a mistake worth being allowed to make (§2.1, §3.3).
 *
 * THE STIFFNESS AND RATING WERE WRONG AND ARE NOW DERIVED. The declared values were
 * stiffness 2600 N/m against a rating of 3400 N, which means a strap had to stretch
 *
 *     3400 / 2600 = 1.31 m
 *
 * to reach "overstressed", and 2.00 m to fail — across a cargo box 4.20 m long. Two of
 * §10.3's four states were unreachable, and the strap was a bungee cord. Real webbing
 * stretches a few percent, so stiffness now comes from how far a strap gives at its rating
 * (STRAP.stretchAtRating), and the rating comes from what the load actually demands under
 * §11.3's worst road event. See config.js for both derivations.
 *
 * §10.4 is the rule this file must not break: "A heuristic may estimate unsecured mass and
 * imbalance for warnings and scoring, but it MUST NOT SECRETLY DAMAGE ITEMS WITHOUT A
 * PHYSICAL CAUSE." So a strap applies force to bodies and nothing else. Pack quality is
 * computed elsewhere, is advisory, and never reaches into an object's condition.
 */

import { STRAP } from '../config.js';
import { EVENTS } from '../core/eventBus.js';

export const STRAP_STATE = Object.freeze({
  SLACK: 'slack',
  TENSIONED: 'tensioned',
  OVERSTRESSED: 'overstressed',
  FAILED: 'failed',
});

let _nextStrapId = 0;

export class StrapSystem {
  /** @param {ObjectRegistry} registry @param {EventBus} bus
   *  @param {()=>number} [now]  the clock's simTimeMs, so attach/release — which happen on
   *        a key press, not inside step() — stamp the event with the real time (§27.4). */
  constructor(registry, bus, now = null) {
    this.registry = registry;
    this.bus = bus;
    this.now = typeof now === 'function' ? now : () => 0;
    /** strapId -> strap record. Serializable state only (§22.4). */
    this.straps = new Map();
  }

  get count() { return this.straps.size; }

  /**
   * Attach a strap from a fixed anchor to a point on a cargo item.
   *
   * @param {{id,x,y,z}} anchor       an anchor from truck.js cargoAnchors()
   * @param {object} entity           the cargo item
   * @param {{x,y,z}} worldPoint      where on the item the hook goes
   * @param {number} slack            extra length beyond the current separation, m
   */
  attach(anchor, entity, worldPoint, slack = 0) {
    if (!anchor || !entity) return null;
    const local = worldToLocal(entity.body, worldPoint);
    const sep = dist(anchor, worldPoint);
    const restLength = Math.min(sep + slack, STRAP.maxLength);

    const id = `strap_${_nextStrapId++}`;
    const strap = {
      id,
      anchorId: anchor.id,
      anchor: { x: anchor.x, y: anchor.y, z: anchor.z },
      entityId: entity.id,
      localPoint: local,
      restLength,
      slack: 0,
      /** Serializable §10.3 state, read by the HUD and by scoring. */
      state: STRAP_STATE.SLACK,
      tension: 0,
      peakTension: 0,
    };
    this.straps.set(id, strap);
    if (this.bus) {
      this.bus.emit(EVENTS.STRAP_CHANGED,
        { strapId: id, entityId: entity.id, anchorId: anchor.id, state: strap.state, tension: 0 }, this.now());
    }
    return strap;
  }

  /** §10.3's ratchet. Shortening the rest length is what "tension" means, and it is the one
   *  player action that can make a strap fail on its own. */
  tension(strapId, byMetres = STRAP.ratchetStepM) {
    const s = this.straps.get(strapId);
    if (!s || s.state === STRAP_STATE.FAILED) return null;
    s.restLength = Math.max(0.05, s.restLength - byMetres);
    return s;
  }

  release(strapId) {
    const s = this.straps.get(strapId);
    if (!s) return false;
    this.straps.delete(strapId);
    if (this.bus) this.bus.emit(EVENTS.STRAP_CHANGED, { strapId, state: 'released' }, this.now());
    return true;
  }

  releaseAll() { for (const id of [...this.straps.keys()]) this.release(id); }

  /** Every strap currently on an entity. */
  onEntity(entityId) {
    return [...this.straps.values()].filter((s) => s.entityId === entityId);
  }

  /**
   * One fixed step. Applies each strap's force and resolves §10.3's state machine.
   *
   * Runs BEFORE the physics step for the same reason grips do: forces are accumulated and
   * consumed by world.step(). Also after `clearForces`, which main.js calls once.
   */
  step(stepMs, simTimeMs = 0) {
    for (const s of [...this.straps.values()]) {
      if (s.state === STRAP_STATE.FAILED) continue;
      const e = this.registry.get(s.entityId);
      if (!e) { this.straps.delete(s.id); continue; }

      const hook = localToWorld(e.body, s.localPoint);
      const sep = dist(s.anchor, hook);
      const over = sep - s.restLength;

      // ONE-SIDED. A rope does not push, and slack is a real state, not a small force.
      s.slack = -over;   // positive when there is spare length; read by CargoSystem.isSecured
      if (over <= 0) {
        s.tension = 0;
        s.state = STRAP_STATE.SLACK;
        continue;
      }

      // Direction from the hook toward the anchor: the strap always pulls the load back.
      const dir = {
        x: (s.anchor.x - hook.x) / sep,
        y: (s.anchor.y - hook.y) / sep,
        z: (s.anchor.z - hook.z) / sep,
      };
      // Damping on the RATE OF SEPARATION only, so the strap never fights motion along
      // itself — an undamped rope rings like a guitar string at 60 Hz.
      const v = velocityAtPoint(e.body, hook);
      const closing = v.x * dir.x + v.y * dir.y + v.z * dir.z;   // +ve = moving toward anchor
      let mag = STRAP.stiffness * over - STRAP.damping * closing;
      if (mag < 0) mag = 0;

      s.tension = mag;
      s.peakTension = Math.max(s.peakTension, mag);

      const was = s.state;
      if (mag >= STRAP.failureNewtons) {
        /* §10.3 FAILED: "Anchor, strap, or surface gives way." The load is released, not
         * teleported or damaged — §2.2's "failure becomes state". Whatever happens to the
         * cargo next happens because it is now unrestrained, which is the physical cause
         * §10.4 insists on. */
        s.state = STRAP_STATE.FAILED;
        s.tension = 0;
      } else if (mag >= STRAP.ratingNewtons) {
        s.state = STRAP_STATE.OVERSTRESSED;
      } else {
        s.state = STRAP_STATE.TENSIONED;
      }

      if (s.state !== STRAP_STATE.FAILED) {
        e.body.addForceAtPoint({ x: dir.x * mag, y: dir.y * mag, z: dir.z * mag }, hook, true);
      }

      if (s.state !== was && this.bus) {
        this.bus.emit(EVENTS.STRAP_CHANGED,
          { strapId: s.id, entityId: s.entityId, state: s.state, tension: mag }, simTimeMs);
      }
    }
  }

  /** Serializable snapshot — §22.4, §23.4. No bodies, no handles. */
  snapshot() {
    const out = {};
    for (const [id, s] of this.straps) {
      out[id] = {
        id, anchorId: s.anchorId, entityId: s.entityId,
        restLength: s.restLength, state: s.state,
        tension: s.tension, peakTension: s.peakTension,
      };
    }
    return out;
  }
}

/* ── geometry helpers, duplicated from grip.js on purpose ─────────────────────────────
 * They are four lines each and importing them would couple the cargo system to the player
 * system for no benefit. If a third consumer appears, hoist them then. */

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }

function worldToLocal(body, p) {
  const t = body.translation(), r = body.rotation();
  const dx = p.x - t.x, dy = p.y - t.y, dz = p.z - t.z;
  // Conjugate rotation: v' = q^-1 * v * q
  const ix = -r.x, iy = -r.y, iz = -r.z, iw = r.w;
  const tx = iw * dx + iy * dz - iz * dy;
  const ty = iw * dy + iz * dx - ix * dz;
  const tz = iw * dz + ix * dy - iy * dx;
  const tw = -ix * dx - iy * dy - iz * dz;
  return {
    x: tx * iw + tw * -ix + ty * -iz - tz * -iy,
    y: ty * iw + tw * -iy + tz * -ix - tx * -iz,
    z: tz * iw + tw * -iz + tx * -iy - ty * -ix,
  };
}

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

function velocityAtPoint(body, world) {
  const v = body.linvel(), w = body.angvel(), c = body.translation();
  const rx = world.x - c.x, ry = world.y - c.y, rz = world.z - c.z;
  return {
    x: v.x + (w.y * rz - w.z * ry),
    y: v.y + (w.z * rx - w.x * rz),
    z: v.z + (w.x * ry - w.y * rx),
  };
}
