/* Cargo state — GDD §10.2, §10.4, §10.5, §11.3.
 *
 * §10.2's rules, each implemented as written:
 *
 *   "Required objects count as loaded only after crossing the cargo threshold and SETTLING
 *    inside the closed volume."      -> insideCargo() plus the registry's settled flag plus
 *                                       a dwell. Three conditions, all of them real.
 *   "Support contacts and friction determine stacks; general furniture does not snap to a
 *    grid."                          -> there is no grid anywhere in this file. A stack is
 *                                       whatever happens to be resting on what.
 *   "Tools share volume with customer cargo."
 *                                    -> volumeUsed() counts tools too.
 *   "The system tracks which trip moved each item."
 *                                    -> loadedOnTrip, stamped when an item first settles in.
 *
 * §10.4 IS THE RULE THAT SHAPES THIS WHOLE FILE: "Outcomes derive from physical contacts,
 * velocity, damage, and constraints during transport. A heuristic may estimate unsecured
 * mass and imbalance for warnings and scoring, but IT MUST NOT SECRETLY DAMAGE ITEMS WITHOUT
 * A PHYSICAL CAUSE."
 *
 * So packQuality() below is advisory and nothing consumes it except the HUD and, later, the
 * invoice. What actually happens to a badly packed load happens because road forces were
 * applied to real bodies and those bodies moved into each other. There is no code path from
 * a quality score to an object's condition, and there must never be one.
 */

import { CARGO, STRAP } from '../config.js';
import { insideCargo, cargoInterior, CARGO_VOLUME, roadEventForce } from '../world/truck.js';
import { STRAP_STATE } from './straps.js';
import { currentDimensions, packedVolume } from '../tools/tools.js';
import { EVENTS } from '../core/eventBus.js';

export class CargoSystem {
  /**
   * @param {ObjectRegistry} registry
   * @param {StrapSystem} straps
   * @param {ToolSystem} tools
   * @param {EventBus} bus
   */
  constructor(registry, straps, tools, bus) {
    this.registry = registry;
    this.straps = straps;
    this.tools = tools;
    this.bus = bus;
    /** The trip an item settling in NOW is loaded on. Synced from game.state.tripCount by
     *  main.js (the 'phase' system on a return arrival, resetContract after game.reset) —
     *  the state is the record (§23.2), this is the stamp it hands out (§10.2). M13. */
    this.tripCount = 1;
  }

  /**
   * Per-step bookkeeping. Runs AFTER the physics step, because "settled" is read from
   * post-step velocities — the same ordering the manifest system uses.
   */
  step(stepMs, simTimeMs = 0) {
    for (const e of this.registry.entities.values()) {
      const t = e.body.translation();
      const within = insideCargo({ x: t.x, y: t.y, z: t.z });
      const s = e.state;

      if (within && s.settled) s.cargoDwellMs = (s.cargoDwellMs || 0) + stepMs;
      else if (!within) s.cargoDwellMs = 0;

      const wasLoaded = !!s.loaded;
      s.loaded = within && (s.cargoDwellMs || 0) >= CARGO.loadedDwellMs;

      if (s.loaded && !wasLoaded) {
        // §10.2: "The system tracks which trip moved each item."
        s.loadedOnTrip = this.tripCount;
        if (this.bus) {
          this.bus.emit(EVENTS.CARGO_STATE,
            { entityId: e.id, loaded: true, trip: this.tripCount }, simTimeMs);
        }
      } else if (!s.loaded && wasLoaded) {
        if (this.bus) this.bus.emit(EVENTS.CARGO_STATE, { entityId: e.id, loaded: false }, simTimeMs);
      }
    }
  }

  /** Everything currently counted as loaded. */
  loadedEntities() {
    return [...this.registry.entities.values()].filter((e) => e.state.loaded);
  }

  /** §10.2: "Tools share volume with customer cargo." */
  volumeUsed() {
    let v = 0;
    for (const e of this.loadedEntities()) v += packedVolume(currentDimensions(e));
    if (this.tools) {
      for (const t of this.tools.tools.values()) {
        const p = t.body.translation();
        if (insideCargo({ x: p.x, y: p.y, z: p.z })) v += packedVolume(t.def.dimensions);
      }
    }
    return v;
  }

  /** Fraction of the cargo box's clear volume in use. Above 1.0 the pack is impossible, but
   *  nothing enforces that — you simply cannot fit it, physically, which is the point. */
  volumeFraction() { return this.volumeUsed() / CARGO_VOLUME; }

  /** Is this item restrained by at least one taut strap? */
  isSecured(entity) {
    if (!this.straps) return false;
    /* SLACK, not instantaneous tension.
     *
     * Tension was the obvious choice and it was wrong: a rope over a stationary load carries
     * almost no force, so a perfectly strapped pack sitting still measured as 100% unsecured
     * and §10.4's warning fired on a good pack. What distinguishes a strap doing its job from
     * one hanging off the side is how much spare length it has — which is the same property
     * §10.3's SLACK state is named after. */
    return this.straps.onEntity(entity.id).some((s) =>
      s.state !== STRAP_STATE.FAILED && (s.slack || 0) <= CARGO.securedSlackM);
  }

  /**
   * §10.4's advisory heuristic. ADVISORY. Nothing may act on this except a warning and,
   * later, a score — see the file header.
   *
   * @returns {{loadedCount, totalMass, unsecuredMass, unsecuredFraction, warn, centreOfMass,
   *            lateralOffset, longitudinalOffset, heightFraction, runUpFraction, quality}}
   */
  packQuality() {
    const loaded = this.loadedEntities();
    const i = cargoInterior();
    const mid = { x: (i.minX + i.maxX) / 2, z: (i.minZ + i.maxZ) / 2 };
    const boxH = i.maxY - i.minY, boxL = i.maxZ - i.minZ;

    let totalMass = 0, unsecuredMass = 0;
    let mx = 0, my = 0, mz = 0;
    /* M17 (§26.3): of the UNRESTRAINED mass, how high it sits and how much open deck lies
     * ahead of it toward the headboard — the two things that decided the three measured
     * packs (tools/m25-packs-tests.js) once "how much is strapped" could not: TALL and
     * SLIDE are both 100% loose. Mass-weighted, as fractions of the box, from the item's
     * centre (rotation-independent — this is an estimate, not a collision query). */
    let looseHeight = 0, looseRunUp = 0;
    for (const e of loaded) {
      const m = e.def.mass;
      const t = e.body.translation();
      totalMass += m;
      if (!this.isSecured(e)) {
        unsecuredMass += m;
        looseHeight += m * Math.min(1, Math.max(0, (t.y - i.minY) / boxH));
        looseRunUp += m * Math.min(1, Math.max(0, (i.maxZ - t.z) / boxL));
      }
      mx += t.x * m; my += t.y * m; mz += t.z * m;
    }

    const com = totalMass > 0
      ? { x: mx / totalMass, y: my / totalMass, z: mz / totalMass }
      : { x: mid.x, y: i.minY, z: mid.z };
    const unsecuredFraction = totalMass > 0 ? unsecuredMass / totalMass : 0;
    const heightFraction = totalMass > 0 ? looseHeight / totalMass : 0;
    const runUpFraction = totalMass > 0 ? looseRunUp / totalMass : 0;
    const Q = CARGO.quality;
    const risk = Q.unsecuredWeight * unsecuredFraction
               + Q.heightWeight * heightFraction
               + Q.runUpWeight * runUpFraction;

    return {
      loadedCount: loaded.length,
      totalMass,
      unsecuredMass,
      unsecuredFraction,
      warn: unsecuredFraction > CARGO.unsecuredWarnFraction,
      /** M17: the loose mass's height and run-up as fractions, and the ONE number they and
       *  the unsecured fraction make (CARGO.quality; 1 is a pack the drive will not move).
       *  Tuned so that it ORDERS the measured packs the way the route punished them. */
      heightFraction,
      runUpFraction,
      quality: Math.min(1, Math.max(0, 1 - risk)),
      centreOfMass: com,
      /** §11.2: "poor balance modestly affects steering and braking". These are the inputs
       *  to that, expressed as offsets from the middle of the deck in metres. */
      lateralOffset: com.x - mid.x,
      longitudinalOffset: com.z - mid.z,
      volumeFraction: this.volumeFraction(),
    };
  }

  /**
   * §11.3's road events, applied as the pseudo-force cargo feels in the truck's frame.
   *
   * §10.5 explicitly sanctions this: "Browser driving may use truck-local simulation or
   * FORCE PROXIES if full moving-world physics is unstable." Moving a kinematic box full of
   * sleeping rigid bodies at 13.5 m/s is precisely that instability.
   *
   * Applied to every LOADED body, including tools, because §10.2 says tools share the space
   * and a loose dolly in a braking truck is exactly the kind of consequence this game wants.
   * Nothing is exempted for being fragile or valuable — §10.4's "no secret damage" cuts both
   * ways, and an item that survives does so because the physics let it.
   *
   * Call once per step for the duration of the event.
   */
  applyRoadEvent(type) {
    let applied = 0;
    for (const e of this.loadedEntities()) {
      const f = roadEventForce(type, e.def.mass);
      if (!f) continue;
      e.body.addForce(f, true);
      applied++;
    }
    if (this.tools) {
      for (const t of this.tools.tools.values()) {
        const p = t.body.translation();
        if (!insideCargo({ x: p.x, y: p.y, z: p.z })) continue;
        const f = roadEventForce(type, t.def.mass);
        if (f) { t.body.addForce(f, true); applied++; }
      }
    }
    return applied;
  }

  /** Positions of everything loaded, for a before/after shift measurement. */
  snapshotPositions() {
    const out = {};
    for (const e of this.loadedEntities()) {
      const t = e.body.translation();
      out[e.id] = { x: t.x, y: t.y, z: t.z };
    }
    return out;
  }

  /** How far each item moved since a snapshot, and the worst of them. §10.4's outcomes
   *  "derive from physical contacts" — this only reports what the bodies did. */
  shiftSince(snapshot) {
    let worst = 0, worstId = null, moved = 0;
    for (const [id, from] of Object.entries(snapshot)) {
      const e = this.registry.get(id);
      if (!e) continue;
      const t = e.body.translation();
      const d = Math.hypot(t.x - from.x, t.y - from.y, t.z - from.z);
      if (d > CARGO.shiftToleranceM) moved++;
      if (d > worst) { worst = d; worstId = id; }
    }
    return { worst, worstId, moved, count: Object.keys(snapshot).length };
  }
}
