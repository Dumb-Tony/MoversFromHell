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

import { SIM, STRAP } from '../config.js';
import { EVENTS } from '../core/eventBus.js';

export const STRAP_STATE = Object.freeze({
  SLACK: 'slack',
  TENSIONED: 'tensioned',
  OVERSTRESSED: 'overstressed',
  FAILED: 'failed',
});

/**
 * TEST SEAM, M25. Set `explicitDamping` true to restore the PRE-M25 damping — the raw
 * `STRAP.damping * closing` applied explicitly at the fixed step — so a suite can measure the
 * bug the semi-implicit form removed instead of merely asserting its absence.
 * `tools/m32-strap-stability-tests.js` S1/S2/S3 is the only caller; nothing in `src/` reads it
 * and main.js never writes it. It is a plain boolean on a plain object, so it is also the
 * cheapest possible thing to leave behind if the damping is ever retuned again.
 */
export const STRAP_DEBUG = { explicitDamping: false };

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
   *
   * ── THE DAMPING TERM IS SOLVED, NOT SAMPLED (M25) ───────────────────────────────────
   *
   * §26.3 promises that "a tensioned strap reduces relative motion and damage". Until M25
   * that was true of the fridge and a LIE about a small box, for a purely numerical reason.
   *
   * A damper integrated explicitly — force = −c·v sampled at the START of the step — is
   * stable only while c·dt/m < 2. Above 2 the correction overshoots and REVERSES the
   * velocity with interest; the one-sided rope then clamps the next step's force to zero
   * (a rope does not push), so the overshoot is never paid back and the load simply leaves.
   * That is the launch M17 measured: a 9 kg box strapped taut and thrown 1.45 m backward
   * and 0.81 m down during a brake, toward its anchor.
   *
   * The mass in that bound is NOT the body's mass. The force is applied at a hook, so what
   * it accelerates along the strap is the effective mass at that point,
   *
   *     1/m_eff = 1/m + (r × dir)ᵀ · I⁻¹ · (r × dir)          (effectiveMassAt, below)
   *
   * which is always ≤ m and, for a 0.50 m box hooked 0.33 m off its centre, a MEASURED 2.54 kg
   * of a 9 kg body. STRAP.damping 1400 at 1/60 s is c·dt/m_eff = 9.19 there — more than four
   * times the bound — while the 110 kg fridge sits at 0.80 (m_eff 29.0 kg) and never showed the
   * fault. m32 S4 prints the table for 9, 22, 55 and 110 kg, and those are the figures to
   * quote: m_eff depends on where the hook is, so the same box reads 2.69 kg on one perch and
   * 3.92 kg on another, with γ moving with it.
   *
   * So the closing velocity after the damping impulse is SOLVED instead of predicted:
   *
   *     v' = v − (c·dt/m_eff)·v'   →   v' = v / (1 + β),   β = c·dt/m_eff
   *     J   = m_eff·(v' − v) = −c·dt·v / (1 + β)
   *     c_eff = c / (1 + β)
   *
   * The amplification factor is |g| = 1/(1+β) ≤ 1 for EVERY mass, damping and step: the
   * damper can at most bring the closing velocity to rest and can never reverse it, and the
   * work it does, J·v + J²/(2·m_eff) = −c_eff·v²·dt·(1 − γ/2) with γ = β/(1+β) < 1, is
   * negative for every input. Unconditionally stable, and no tuning was moved to get there —
   * STRAP.damping, STRAP.stiffness, the rating, the tear rule and §10.3's four states are
   * exactly what they were. On a heavy body β is small, c_eff → c, and the fridge behaves as
   * it did (measured: within 5 %, m32 S3).
   *
   * The alternative — clamping c to stabilityFraction × 2·m_eff/dt — was rejected because it
   * is a different damper at every mass and leaves a discontinuity at the clamp; the solved
   * form is one expression that degrades smoothly and is provably stable at every mass.
   */
  step(stepMs, simTimeMs = 0) {
    for (const s of [...this.straps.values()]) {
      if (s.state === STRAP_STATE.FAILED) { clearDiagnostics(s); continue; }
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
        // M25 diagnostics: a strap that did nothing this step reports nothing, not a stale
        // number from the last step it was loaded.
        clearDiagnostics(s);
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

      /* THE DAMPING IS SOLVED, NOT SAMPLED (M25). See the block comment above step().
       *
       * dt is the step the strap force will actually be integrated over — main.js hands
       * straps.step() the clock's fixed step and physics/world.js sets Rapier's timestep from
       * the same SIM.stepMs, so this is the real dt and not a substep. SIM.stepMs is the
       * fallback only for a caller that passes 0. */
      const dt = (stepMs > 0 ? stepMs : SIM.stepMs) / 1000;
      const mEff = effectiveMassAt(e.body, hook, dir);
      const beta = (STRAP.damping * dt) / mEff;
      let cEff = STRAP_DEBUG.explicitDamping ? STRAP.damping : STRAP.damping / (1 + beta);
      /* Belt and braces, and the thing m32 S4 asserts against: γ = c_eff·dt/m_eff may never
       * reach STRAP.stabilityFraction × 2. The solved form satisfies it by construction
       * (γ = β/(1+β) < 1) so this Math.min has never bound; it is here so that any future
       * change to the damping cannot silently re-admit the explicit form's overshoot. */
      const cCap = (STRAP.stabilityFraction * 2 * mEff) / dt;
      if (!STRAP_DEBUG.explicitDamping && cEff > cCap) cEff = cCap;

      /* Serializable diagnostics (§22.4 — numbers, no handles). m32 reads them to measure the
       * damping impulse's work and the amplification factor per body. */
      s.effMass = mEff;
      s.dampingN = cEff;
      s.closing = closing;
      s.dampingRatio = (cEff * dt) / mEff;

      let mag = STRAP.stiffness * over - cEff * closing;
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

/** A world vector expressed in the frame `q` rotates into the world: v' = q⁻¹ · v · q. */
function conjRotate(q, v) {
  const ix = -q.x, iy = -q.y, iz = -q.z, iw = q.w;
  const tx = iw * v.x + iy * v.z - iz * v.y;
  const ty = iw * v.y + iz * v.x - ix * v.z;
  const tz = iw * v.z + ix * v.y - iy * v.x;
  const tw = -ix * v.x - iy * v.y - iz * v.z;
  return {
    x: tx * iw + tw * -ix + ty * -iz - tz * -iy,
    y: ty * iw + tw * -iy + tz * -ix - tx * -iz,
    z: tz * iw + tw * -iz + tx * -iy - ty * -ix,
  };
}

function qmul(a, b) {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

/**
 * THE MASS A UNIT FORCE ALONG `dir` APPLIED AT `world` ACTUALLY ACCELERATES (M25).
 *
 * The solver's standard effective mass for a point constraint,
 *
 *     1/m_eff = 1/m + (r × dir)ᵀ · I_world⁻¹ · (r × dir)
 *
 * with r measured from the centre of mass. It is what the strap's stability bound has to be
 * taken against, because a strap hooked at a corner spins the body as well as shoving it —
 * and the rotational share makes m_eff SMALLER than the mass, never larger. Using body mass
 * here would have understated the 9 kg box's ratio by 3.5× (m32 S4: 2.54 kg effective vs 9 kg)
 * and the "fix" would still have launched it.
 *
 * I_world⁻¹ = R · diag(1/I₁, 1/I₂, 1/I₃) · Rᵀ, so rotating (r × dir) into the principal frame
 * (R = body rotation ⊗ principal-inertia local frame) turns the quadratic form into three
 * divisions. `principalInertia()` and `principalInertiaLocalFrame()` are Rapier 0.20 API and
 * m32 S4 asserts they are present, so the translational-only fallback below can never be
 * taken silently. No definition in objects/definitions.js applies its declared
 * centerOfMassOffset to the body, so Rapier's centre of mass is the body's translation today;
 * both readers below take it from worldCom() anyway (comOf), the way grip.js's velocityAtPoint
 * always has, so an offset that is applied later cannot silently invalidate the moment arm.
 */

/** The body's centre of mass — the point a moment arm is measured from. Copied from
 *  src/player/grip.js's velocityAtPoint, which has always used worldCom() for this. */
function comOf(body) {
  return typeof body.worldCom === 'function' ? body.worldCom() : body.translation();
}

/** Every per-step diagnostic a strap publishes, zeroed together: a strap that did nothing this
 *  step — slack, or failed and skipped — must report nothing, not the last loaded step's numbers
 *  (m32's work accumulator reads dampingN and effMass every frame). */
function clearDiagnostics(s) {
  s.closing = 0;
  s.dampingN = 0;
  s.dampingRatio = 0;
  s.effMass = 0;
}
function effectiveMassAt(body, world, dir) {
  const m = typeof body.mass === 'function' ? body.mass() : 0;
  if (!(m > 0)) return Infinity;                  // static or kinematic: nothing to destabilise
  let inv = 1 / m;
  if (typeof body.principalInertia === 'function' &&
      typeof body.principalInertiaLocalFrame === 'function') {
    const c = comOf(body);
    const rx = world.x - c.x, ry = world.y - c.y, rz = world.z - c.z;
    const k = {                                   // r × dir: the moment arm of a unit force
      x: ry * dir.z - rz * dir.y,
      y: rz * dir.x - rx * dir.z,
      z: rx * dir.y - ry * dir.x,
    };
    const kp = conjRotate(qmul(body.rotation(), body.principalInertiaLocalFrame()), k);
    const I = body.principalInertia();
    if (I.x > 0) inv += (kp.x * kp.x) / I.x;
    if (I.y > 0) inv += (kp.y * kp.y) / I.y;
    if (I.z > 0) inv += (kp.z * kp.z) / I.z;
  }
  return 1 / inv;
}

function worldToLocal(body, p) {
  const t = body.translation();
  return conjRotate(body.rotation(), { x: p.x - t.x, y: p.y - t.y, z: p.z - t.z });
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
  const v = body.linvel(), w = body.angvel(), c = comOf(body);
  const rx = world.x - c.x, ry = world.y - c.y, rz = world.z - c.z;
  return {
    x: v.x + (w.y * rz - w.z * ry),
    y: v.y + (w.z * rx - w.x * rz),
    z: v.z + (w.x * ry - w.y * rx),
  };
}
