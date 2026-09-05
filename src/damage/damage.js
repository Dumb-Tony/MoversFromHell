/* Damage — GDD §8.3, §8.4, §7.4, §10.4, §12.2.
 *
 * This is the file where consequence stops being a number in a config block and starts
 * happening to objects. Everything it does is governed by four sentences:
 *
 *   §8.3  "Contact energy above threshold accumulates damage."
 *   §8.3  "A fragile television and a cheap box should not share a generic hit-point curve."
 *   §8.3  "Repeated minor contact needs cooldown and aggregation so a scrape is priced
 *          coherently."
 *   §10.4 "It must not secretly damage items without a physical cause."
 *
 * TWO LEDGERS, NOT ONE, because §15.1 prices them as separate line items and §8.4 requires
 * property damage to be attributable to a LOCATION rather than to an object:
 *
 *   ITEM damage      keyed on IMPACT SPEED, scaled by the object's own fragility band.
 *                    Speed, not impulse — impulse is m*dv, which made the 90 kg couch ten
 *                    times more delicate than a box of glassware purely for being heavy.
 *                    That is precisely backwards from §8.3 and was fixed in Phase 6.
 *   PROPERTY damage  keyed on IMPULSE, because what a WALL suffers really does scale with
 *                    the mass that hit it. This is where mass belongs. Written since Phase 11
 *                    build-side M14: the object's own m·Δv, charged only when the surface the
 *                    narrow phase says pushed hardest that step is billable and, since M30,
 *                    SHARED across every billable surface the step touched in proportion to
 *                    what each took (_attributeProperty), aggregated per entity AND surface,
 *                    capped per surface (§8.3 "maximum charge") — a cap on the money and not
 *                    on the feedback (EVENTS.PROPERTY_CAPPED) — and never a cause of anything
 *                    but a line (§12.2).
 *
 * NOTHING HERE READS A PACK QUALITY SCORE. A badly packed truck damages its cargo because
 * unrestrained bodies moved and hit things, and for no other reason. If a future phase ever
 * wants to shortcut that, §10.4 says it may not.
 *
 * §12.2 is the other boundary: "Hard fail is never triggered solely by generic damage"
 * (§8.4). Nothing in this file ends a contract. It records.
 */

import { DAMAGE, DOOR } from '../config.js';
import { EVENTS } from '../core/eventBus.js';
import { conditionLossFor, impactToleranceOf, breakInto } from '../tools/tools.js';
import { billable, labelFor, surfaceRow, doorFrameTag } from './surfaces.js';
import { chooseLeafRest } from '../player/interact.js';   // M32: ONE rest-strip chooser, shared with E

/** §8.3's condition bands, as a lookup. Condition is 0..100 (§7.2). */
export function bandFor(condition) {
  for (const b of DAMAGE.bands) if (condition >= b.min) return b;
  return DAMAGE.bands[DAMAGE.bands.length - 1];
}

/** The property bands (M14): by a window's total impulse in N·s, ascending `min`s. Below the
 *  first band nothing is charged, so the first band is also the floor. */
export function propertyBandFor(impulse) {
  const bands = DAMAGE.property.bands;
  let out = bands[0];
  for (const b of bands) if (impulse >= b.min) out = b;
  return out;
}

/**
 * §15.1's property cost for a window's impulse, before the per-surface cap. Exported so a
 * suite can pin the closed form: (impulse − threshold) × costPerImpulse, never negative.
 *
 * `share` (M30) is the fraction of the ORIGINAL hit this window took when a step's m·Δv was
 * split across a corner's two surfaces (_attributeProperty). The threshold is a property of
 * the HIT, not of the wall — the impulse under which a knock is not worth billing — so a hit
 * shared two ways shares its threshold in the same proportion. That is what makes the split
 * cost exactly what the single line cost:
 *
 *     Σᵢ (fᵢ·I − fᵢ·thr)·rate  =  (I − thr)·rate,   Σᵢ fᵢ = 1
 *
 * and it also means each line is simply its fraction of the whole: cost ᵢ = fᵢ × cost. Left at
 * 1 the formula is M14's to the character, which is why every m22 number is unchanged.
 */
export function propertyCost(impulse, share = 1) {
  const P = DAMAGE.property;
  const f = Number.isFinite(share) ? Math.max(0, Math.min(1, share)) : 1;
  return Math.max(0, (impulse - P.impulseThreshold * f) * P.costPerImpulse);
}

/**
 * M31 — §8.4's "player attribution when reliable", as ONE id. `heldBy` is M14's shape (one
 * entry per HAND, so a two-hand carry reads ['p0','p0']), and the recap's seat column wants
 * the holder, not the count: the first entry that is somebody. Null for a thrown, dropped or
 * shoved-by-nobody object — the blank column is a fact, not a gap.
 * @param {{heldBy?: string[]}} w  an open damage window (item or property)
 */
export function holderOf(w) {
  const held = w && Array.isArray(w.heldBy) ? w.heldBy : null;
  if (!held) return null;
  const id = held.find((x) => x != null);
  return id == null ? null : id;
}

/** §15.1's item-damage line: replacement value scaled by how far the condition fell. */
export function repairCost(def, condition) {
  return def.replacementValue * bandFor(condition).costFraction;
}

export class DamageSystem {
  /**
   * @param {PhysicsWorld} physics
   * @param {ObjectRegistry} registry
   * @param {EventBus} bus
   * @param {object|function} state  game.state, for the §8.4 ledgers — or a GETTER for it
   */
  constructor(physics, registry, bus, state) {
    this.physics = physics;
    this.registry = registry;
    this.bus = bus;
    this._state = state;
    /** Open aggregation windows, keyed by entity. §8.3's "cooldown and aggregation". */
    this._open = new Map();
    /** Previous-step speeds, so an impact can be measured as a CHANGE in velocity. */
    this._lastSpeed = new Map();
    this.impactCount = 0;
    /* THE SECOND LEDGER (M14). Open PROPERTY windows keyed `${entityId}|${surfaceId}` — the
     * same window/decay pair as the item ledger, but one per surface an object is marking,
     * so a couch dragged along a wall AND scraping the door frame bills each once. */
    this._openProp = new Map();
    /** Scratch: the property keys touched this step, so the others can age. */
    this._touchedProp = new Set();
    /** Scratch: entity id -> speed lost THIS step, for the door-frame pass (M23), which runs
     *  after the entity loop and needs to know whether a pressing object is also hitting. */
    this._lostBy = new Map();
    /** M30: surface id -> the sim ms a 'this one is already at its maximum' event last went
     *  out, so a couch ground along a capped wall complains once per
     *  DAMAGE.property.cappedRepeatMs rather than once per aggregation window (§8.4 "ONE
     *  small cost notice"). Cleared by reset() with everything else. */
    this._cappedAt = new Map();
    /** EXPANSION HOOK (§8.2 "protect with blankets/runners"): tags a future runner tool has
     *  covered. Consulted before billing; nothing writes it yet. */
    this.protectedSurfaces = new Set();
    /** EXPANSION HOOK (§8.4 repair/cover-up tools): a multiplier on a window's charge,
     *  `(window) => number`, default 1. Nothing sets it yet. */
    this.mitigation = null;
    /** M23: `(entity) => N` — the force every grip on the object is applying this step,
     *  summed (main.js wires it over the movers' grip records). The door-frame pass reads
     *  it for a held object PRESSED against a hung leaf; null means "the leaf's read only". */
    this.gripForceOf = null;
  }

  /* THE STATE IS RESOLVED ON EVERY ACCESS, NOT CAPTURED. game.reset() replaces game.state
   * wholesale (game.js), which is right for a plain-data state with no back-references
   * (§22.4) — and it meant that from the first "Run it again" on, every ledger line this
   * system posted went into the PREVIOUS run's orphaned state while the invoice read the
   * new, empty one. Item damage was never billed on a replay, and reconcile() agreed
   * because both read the same empty ledger (Phase 11 plan, M2). main.js hands in
   * `() => game.state`; a suite that constructs the system directly may still pass an
   * object, and the setter keeps `damage.state = ...` working for either. */
  get state() { return typeof this._state === 'function' ? this._state() : this._state; }
  set state(v) { this._state = v; }

  /**
   * One fixed step, AFTER physics — an impact is only visible once the solver has resolved
   * it, and the quantity that matters is how much speed was lost in the collision.
   *
   * Measuring the velocity DELTA rather than reading contact-force events is a deliberate
   * choice. Rapier's contact forces are per-manifold and per-substep and need careful
   * filtering to avoid counting resting contact as a hit; the speed an object lost in one
   * step is unambiguous, is exactly what §8.3's "contact energy" means for an item, and
   * cannot fire while something is sitting still.
   */
  step(stepMs, simTimeMs = 0) {
    /* Items that entered the 'broken' band THIS step. Fragmented after the loop, not inside
     * it: breakInto spawns bodies into the map being iterated, and a fragment born mid-loop
     * would be visited with no previous speed (harmless, but a wasted read). M12. */
    const broke = [];
    const touched = this._touchedProp;
    touched.clear();
    const lostBy = this._lostBy;
    lostBy.clear();
    for (const e of this.registry.entities.values()) {
      const v = e.body.linvel();
      const speed = Math.hypot(v.x, v.y, v.z);
      const prev = this._lastSpeed.get(e.id) || 0;
      this._lastSpeed.set(e.id, speed);

      // Speed LOST this step. A held object being carried loses nothing; a dropped one does.
      const lost = prev - speed;
      lostBy.set(e.id, lost);
      if (lost <= 0) { this._decayWindow(e, stepMs, simTimeMs); continue; }

      /* PROPERTY (M14) — before and INDEPENDENT of conditionLossFor: a sturdy couch at
       * 1 m/s is under its own 3.2 m/s threshold and marks nothing on itself, and still puts
       * 90 N·s into the wall. The gate is the object's OWN lost speed, m·Δv, never the
       * manifold force — resting contact loses ~0 speed a step, however hard a fridge leans. */
      this._attributeProperty(e, lost, simTimeMs, touched);

      const loss = conditionLossFor(e, lost);
      if (loss <= 0) { this._decayWindow(e, stepMs, simTimeMs); continue; }

      /* §8.3's AGGREGATION. "Repeated minor contact needs cooldown and aggregation so a
       * scrape is priced coherently." A couch dragged along a wall produces a contact every
       * step; without this the player is billed forty times for one scrape. Contacts inside
       * the window merge into one event, and only the merged total is reported. */
      const t = e.body.translation();
      let w = this._open.get(e.id);
      const near = w && Math.hypot(t.x - w.x, t.y - w.y, t.z - w.z) <= DAMAGE.aggregationRadius;
      if (w && near && w.ageMs < DAMAGE.aggregationWindowMs) {
        w.loss += loss;
        w.peakSpeed = Math.max(w.peakSpeed, lost);
        w.ageMs = 0;
      } else {
        if (w) this._closeWindow(e, w, simTimeMs);
        w = {
          x: t.x, y: t.y, z: t.z, loss, peakSpeed: lost, ageMs: 0, startedAt: simTimeMs,
          /* §8.4 "player attribution when reliable" (M31): who had hands on it at FIRST
           * contact, the property window's own rule and M14's shape — one entry per hand, so
           * a two-hand carry reads ['p0','p0'] and the first entry is the holder. Empty for a
           * thrown or dropped object, which is the honest blank the recap prints. */
          heldBy: (e.state.grips || []).map((g) => g.playerId).filter((id) => id != null),
        };
        this._open.set(e.id, w);
      }

      // The condition change itself is immediate — §8.4 wants a mark AT impact. It is the
      // COST REPORT that is aggregated, not the physics.
      const bandBefore = bandFor(e.state.condition).name;
      e.state.condition = Math.max(0, e.state.condition - loss);
      if (bandBefore !== 'broken' && bandFor(e.state.condition).name === 'broken' && !e.state.fragments) broke.push(e);

      this.impactCount++;
      if (this.bus) {
        this.bus.emit(EVENTS.IMPACT, {
          entityId: e.id, relVelocity: lost, position: { x: t.x, y: t.y, z: t.z },
          materials: e.def.surfaceTags,
        }, simTimeMs);
      }
    }

    /* §26.4 "BROKEN REQUIRED CARGO STAYS DELIVERABLE OR BECOMES TRACKABLE PIECES" — both,
     * in the same step the band was crossed (M12). The hulk keeps its row, its mass and its
     * collider (nothing here touches them: it is still the thing that has to reach its
     * room); PARTS.brokenFragmentCount[fragility] fragments appear beside it as bodies the
     * registry, the cargo box and this system all see from now on. The cost was already
     * posted by the band (DAMAGE.bands 'broken' = the whole replacement value) — a fragment
     * is priced at 0, so nothing is billed twice (§10.4: no damage without a physical cause,
     * and no second bill for one cause). The event reuses PART_CHANGED with action 'broken'
     * so the recorder (runLog.js) and the caption layer already know its shape. */
    for (const e of broke) {
      const ids = breakInto(this.registry, e);
      if (!ids.length) continue;
      if (this.bus) {
        const t = e.body.translation();
        this.bus.emit(EVENTS.PART_CHANGED, {
          entityId: e.id, part: 'fragments', action: 'broken', pieces: ids.length,
          position: { x: t.x, y: t.y, z: t.z },
          /* M31: the same holder as the DAMAGE_APPLIED this breakage belongs to — it is the
           * SAME window, still open in `_open` (the band was crossed in the block above), so
           * the two events about one impact can never disagree about who was holding it. The
           * recap builds no row for 'broken' (invoiceScreen classify() takes 'removed' only),
           * but a run record with two PART_CHANGED shapes, one attributed and one not, is a
           * seam for a later reader to trip over. */
          // NOT inert: HAPTICS.PART_CHANGED routes to 'player', and haptics.js resolves that from
      // e.playerId / e.by, so naming the holder here also puts the break in THEIR hand instead of
      // broadcasting it. That is the intent (§8.4: the pulse belongs to whoever was holding it).
      by: holderOf(this._open.get(e.id)),
        }, simTimeMs);
      }
    }

    /* THE DOOR FRAMES (M23) — read from the LEAF's side, after every object has been
     * looked at, because a hung leaf is a Fixed body and the object shoving it loses no
     * speed while it presses (see _strainFrames). Before the decay, so a shove that is
     * still on keeps its window open. */
    this._strainFrames(stepMs, simTimeMs, touched, lostBy);

    // Property windows not touched this step age, and close at the window's end (M14).
    this._decayPropWindows(stepMs, simTimeMs, touched);
  }

  /* ── property damage: WHAT was hit, by the narrow phase (M14) ──────────────────────────
   *
   * §8.4: "object/location, category, condition change, repair or replacement cost". The item
   * ledger above never needed to know what an object struck; this one is the location line,
   * so it reads Rapier's contact manifolds for the ONE step in which the object lost speed:
   *
   *   world.contactPairsWith(e.collider, other => …)             every collider in contact
   *   world.contactPair(e.collider, other, (manifold, flipped)…) its manifolds this step
   *   manifold.contactImpulse(i), .solverContactPoint(0), .normal()
   *
   * MEASURED, Rapier 0.20.0 (tools/m22-property-tests.js): contactPairsWith's callback gets a
   * Collider (the world casts the handle); contactPair's callback gets (TempContactManifold,
   * flipped) once per manifold, `flipped` meaning our collider is the pair's second; the
   * impulses are the solver's from the step just taken, in N·s.
   *
   * ATTRIBUTION RANKS EVERY CONTACT AND BILLS ONLY A BILLABLE WINNER. The surface that pushed
   * hardest on the object this step (largest Σ|contactImpulse|) is what stopped it. Floors, the
   * ground, the deck, movers and other entities compete in that ranking and win it whenever
   * they are what the object actually hit — a TV landing on the floor beside a wall it grazes
   * is a floor landing, not a wall hit — but they are never charged (surfaces.js billable).
   * THE WINNER STILL DECIDES WHETHER ANYTHING IS BILLED AT ALL, and that gate is unchanged.
   *
   * WHAT M30 CHANGED: THE SPLIT. Once the gate has passed, the m·Δv is no longer handed whole
   * to the winner — it is shared out across every BILLABLE surface in contact this step, in
   * proportion to each SURFACE's summed manifold impulse. Per surface, not per collider and not
   * per manifold: Rapier reports several manifolds per pair and a wall can be several colliders
   * (scene.js builds one per solid run of a partition), and either would look like several
   * surfaces to a naive ranking. A couch forced through a doorway hits the frame and the wall
   * in the same step and now gets a line, a notice and a scuff for each, where M14 charged
   * whichever took more and left the other free (KNOWN_ISSUES Phase 21, M14).
   *
   * NOTHING GETS DEARER. The shares sum to the same m·Δv the single line carried, and each
   * window remembers its share so §15.1's threshold is split with it (propertyCost) — so the
   * split lines add up to the one line's amount to the cent (m37 P1). A share under
   * DAMAGE.property.splitMinFraction is folded into the largest rather than posted: a 3 %
   * graze on the way past is not worth a second line on a customer's invoice (§26.4).
   */
  _attributeProperty(e, lost, simTimeMs, touched) {
    const P = DAMAGE.property;
    const mass = e.body.mass();
    const impulse = mass * lost;
    if (!(impulse >= P.minStepImpulse)) return;
    const world = this.physics.world;
    const self = e.collider;
    if (!world || !self || typeof world.contactPairsWith !== 'function') return;

    let best = null;   // { collider, sum, at, normal } — the RANKING, over every contact
    /** tag -> { sum, top, at, normal }: the billable surfaces, summed per SURFACE. `top` is
     *  the biggest single collider sum behind that tag, and its patch is where the mark goes. */
    const bySurface = new Map();
    world.contactPairsWith(self, (other) => {
      let sum = 0, at = null, normal = null;
      world.contactPair(self, other, (manifold, flipped) => {
        const nc = manifold.numContacts();
        for (let i = 0; i < nc; i++) sum += Math.abs(manifold.contactImpulse(i));
        if (!normal) {
          const n = manifold.normal();
          normal = { x: n.x, y: n.y, z: n.z };
          // Rapier's manifold normal is expressed from the pair's first collider; when we
          // are the second it points the other way. Oriented below toward the object anyway.
          if (flipped) { normal.x = -normal.x; normal.y = -normal.y; normal.z = -normal.z; }
          // The centre of the contact patch, not its first corner: a box face-on to a wall
          // has four solver contacts and the mark belongs in the middle of them.
          const ns = manifold.numSolverContacts();
          if (ns > 0) {
            let sx = 0, sy = 0, sz = 0, cnt = 0;
            for (let i = 0; i < ns; i++) {
              const p = manifold.solverContactPoint(i);
              if (p) { sx += p.x; sy += p.y; sz += p.z; cnt++; }
            }
            if (cnt > 0) at = { x: sx / cnt, y: sy / cnt, z: sz / cnt };
          }
        }
      });
      if (!(sum > 0)) return;
      if (!best || sum > best.sum) best = { collider: other, sum, at, normal };
      const tag = this.physics.tagOf(other);
      if (!tag || !billable(tag) || this.protectedSurfaces.has(tag)) return;
      const row = bySurface.get(tag);
      if (!row) bySurface.set(tag, { sum, top: sum, at, normal });
      else { row.sum += sum; if (sum > row.top) { row.top = sum; row.at = at; row.normal = normal; } }
    });
    if (!best) return;
    // THE GATE, exactly as M14 wrote it: the collider that pushed hardest decides whether this
    // step is a property hit at all. A floor landing beside a grazed wall charges nothing.
    const winner = this.physics.tagOf(best.collider);
    if (!winner || !billable(winner) || this.protectedSurfaces.has(winner)) return;

    let total = 0;
    for (const row of bySurface.values()) total += row.sum;
    if (!(total > 0)) return;

    /* The shares, largest first, with the small ones folded into the largest. Folded entries
     * stay in the group at share 0: the run record says what was TOUCHED, not only what was
     * billed (m37 P2). Fractions, never rounded amounts — the rounding happens once, on the
     * ledger line, exactly where it did before. */
    const parts = [];
    for (const [id, row] of bySurface) parts.push({ id, row, share: row.sum / total });
    parts.sort((a, b) => b.share - a.share || (a.id < b.id ? -1 : 1));
    let folded = 0;
    for (let i = parts.length - 1; i >= 1; i--) {
      if (parts[i].share < P.splitMinFraction) { folded += parts[i].share; parts[i].share = 0; }
    }
    parts[0].share += folded;
    const group = parts.length > 1 ? parts.map((p) => ({ id: p.id, share: Number(p.share.toFixed(4)) })) : null;

    const t = e.body.translation();
    for (const p of parts) {
      if (!(p.share > 0)) continue;
      const at = p.row.at || { x: t.x, y: t.y, z: t.z };
      /* The normal on the line is the SURFACE's: pointing away from the wall, toward the
       * object that hit it — which is where the decal goes and independent of which collider
       * Rapier listed first. */
      let n = p.row.normal || { x: 0, y: 1, z: 0 };
      const dot = n.x * (t.x - at.x) + n.y * (t.y - at.y) + n.z * (t.z - at.z);
      if (dot < 0) n = { x: -n.x, y: -n.y, z: -n.z };
      this._feedPropWindow(e, p.id, impulse * p.share, at, n, simTimeMs, touched, p.share, group);
    }
  }

  /**
   * Open or merge the property window for (entity, surface) — the ONE aggregation the walls
   * (M14, _attributeProperty) and the door frames (M23, _strainFrames) share. Same
   * DAMAGE.aggregationWindowMs / aggregationRadius, same line at the end. Returns the window.
   *
   * M30's two extra arguments are the SPLIT's bookkeeping and both default to the single-
   * surface answer, so _strainFrames and every M14 path behave to the character as before:
   *   `frac`   this feed's fraction of the step's whole m·Δv (1 when nothing was split).
   *            Accumulated impulse-weighted into `fracSum`, so the window's own share is
   *            fracSum / impulse — the average fraction it took, weighted by how hard each
   *            step hit. That weighting is what guarantees the shares of the windows in one
   *            group sum to at least 1 (Cauchy–Schwarz on Σf²I / ΣfI ≥ ΣfI / ΣI), i.e. that
   *            splitting a hit can never cost MORE than not splitting it, whatever order the
   *            steps arrive in. For a one-step corner hit it sums to exactly 1.
   *   `group`  the step's whole split, [{id, share}] including folded surfaces at share 0,
   *            recorded on the line so the run record says what was touched.
   */
  _feedPropWindow(e, tag, impulse, at, n, simTimeMs, touched, frac = 1, group = null) {
    const key = `${e.id}|${tag}`;
    let w = this._openProp.get(key);
    const near = w && Math.hypot(at.x - w.x, at.y - w.y, at.z - w.z) <= DAMAGE.aggregationRadius;
    if (w && near && w.ageMs < DAMAGE.aggregationWindowMs) {
      w.impulse += impulse;
      w.fracSum += frac * impulse;
      // The hardest step in the window is the one whose split the line reports.
      if (impulse > w.peak) { w.peak = impulse; if (group) w.surfaces = group; }
      w.ageMs = 0;
    } else {
      if (w) this._closePropWindow(w, simTimeMs);
      w = {
        key, entityId: e.id, defId: e.defId, surfaceId: tag,
        x: at.x, y: at.y, z: at.z, at: { x: at.x, y: at.y, z: at.z },
        normal: n, impulse, peak: impulse, ageMs: 0, startedAt: simTimeMs,
        /** M30: Σ (fraction × impulse) over the steps that fed this window, and the split the
         *  hardest of those steps saw. `surfaces` is null for an unsplit hit. */
        fracSum: frac * impulse, surfaces: group,
        /** §8.4 "player attribution when reliable": who held it at first contact. Recorded
         *  for the run summary (M6); never scored (§15.3). */
        heldBy: (e.state.grips || []).map((g) => g.playerId).filter((id) => id != null),
        /** M23: a door frame's window carries the frame's state ('bent' | 'forced') once it
         *  has one; its line posts the moment the state changes, never at the close. */
        frameState: null, doorId: null, leafId: null,
      };
      this._openProp.set(key, w);
    }
    touched.add(key);
    return w;
  }

  /* ── door frames: what the hung leaf took (M23; §3.3, §8.2, §8.3) ──────────────────────
   *
   * A hung leaf is a Fixed body (registry.hang). The object shoving it loses no speed while
   * it presses — MEASURED (tools/m30-force-tests.js D1 prints the trace): a two-hand couch
   * shove holds 305-392 N on the leaf for seconds while the couch's m·Δv reads 0.00 on every
   * step after the first touch, the solver having zeroed the approach velocity — which is
   * exactly the resting-contact rule the item ledger relies on. So the frame's strain is read
   * from the LEAF's side of the narrow phase: Σ|contactImpulse| over its manifolds with each
   * registry entity, per step, in N·s, and only on steps that are a SHOVE or a HIT:
   *
   *   force >= DAMAGE.property.doorFrame.forceN   the impulse as a force this step
   *   AND (held OR hitting)                        a hand on the object, or the object
   *                                                itself lost >= minStepImpulse of m·Δv
   *
   * Without the second gate a box left 20 mm into the leaf by a throw reads a persistent
   * 129-184 N of solver phantom for ever and would tear the door off by sitting there
   * (§10.4: no damage without a physical cause). Movers are kinematic and never in a
   * Fixed body's manifolds, so a shoulder on the door does nothing — the screwdriver or a
   * heavy object are the two ways through, as §3.3 asks.
   *
   * WHAT ONE STEP'S STRAIN IS. The leaf's manifold sum is the floor; two readings are honest
   * where the solver is not, and the step takes the largest of the three:
   *   PRESSED   a held object at rest against the leaf (speed under pressSpeedMax): the
   *             HANDS' force × dt (gripForceOf). Measured: both hands at 356 N each put
   *             712 N into the couch while the leaf's manifold read 231-243 N one run and
   *             305-392 N another — the floor's static friction takes a solver-ordered
   *             share of a push that is not sliding anywhere. The hands are the cause.
   *   HIT       the object lost speed this step and the leaf is what it hit hardest (M14's
   *             own ranking, _attributeProperty): the whole m·Δv, as a wall would get.
   *             Measured: a 110 kg fridge at 6 m/s stopped dead (632 N·s of m·Δv) with a
   *             first-step manifold of 14 N·s — a deep first-step penetration resolved by
   *             position correction the manifold never reports.
   * A lean is none of these and reads nothing (§10.4).
   *
   * The strain accumulates in the same window the walls use, keyed entity|door_frame_<id>
   * (surfaces.js); at DOOR.bentImpulseNs the frame posts chargeBent once per hung spell
   * (state.frameBent), at DOOR.forceImpulseNs the hinges go: the leaf leaves through
   * registry.unhang to its rest pose — the removed door's own path, so hungClear, the
   * recovery pass and the reset all see a removed leaf — DOOR_STATE 'forced' carries who
   * held the object (or null for a thrown one), and the line posts chargeForced with the
   * mark on the hinge jamb (house.js leafHingeMark, stored on the leaf's state by main.js),
   * because the leaf itself is no longer where it was pressed.
   */
  _strainFrames(stepMs, simTimeMs, touched, lostBy) {
    const world = this.physics.world;
    if (!world || typeof world.contactPairsWith !== 'function') return;
    const F = DAMAGE.property.doorFrame;
    const dt = stepMs / 1000;
    for (const leaf of this.registry.entities.values()) {
      const ls = leaf.state;
      if (!ls || !ls.hung || ls.doorId == null) continue;
      const self = leaf.collider;
      const hits = [];
      world.contactPairsWith(self, (other) => {
        const e = this.registry.fromCollider(other);
        if (!e || e === leaf || (e.state && e.state.hung)) return;
        let sum = 0, at = null, normal = null;
        world.contactPair(self, other, (manifold, flipped) => {
          const nc = manifold.numContacts();
          for (let i = 0; i < nc; i++) sum += Math.abs(manifold.contactImpulse(i));
          if (!normal) {
            const n = manifold.normal();
            // From the leaf toward the object: the manifold normal is from the pair's first
            // collider, and here WE are the first unless flipped says otherwise.
            normal = flipped ? { x: -n.x, y: -n.y, z: -n.z } : { x: n.x, y: n.y, z: n.z };
            const ns = manifold.numSolverContacts();
            if (ns > 0) {
              let sx = 0, sy = 0, sz = 0, cnt = 0;
              for (let i = 0; i < ns; i++) {
                const p = manifold.solverContactPoint(i);
                if (p) { sx += p.x; sy += p.y; sz += p.z; cnt++; }
              }
              if (cnt > 0) at = { x: sx / cnt, y: sy / cnt, z: sz / cnt };
            }
          }
        });
        if (!(sum > 0)) return;
        const held = !!(e.state && e.state.grips && e.state.grips.length);
        const mdv = e.body.mass() * (lostBy.get(e.id) || 0);
        const hit = mdv >= DAMAGE.property.minStepImpulse;
        if (!held && !hit) return;   // a lean, or the solver's resting phantom: not a shove
        let strain = sum;
        if (held && typeof this.gripForceOf === 'function') {
          const v = e.body.linvel();
          if (Math.hypot(v.x, v.y, v.z) <= F.pressSpeedMax) strain = Math.max(strain, this.gripForceOf(e) * dt);
        }
        if (hit && this._bestContactIs(e, other)) strain = Math.max(strain, mdv);
        if (strain / dt < F.forceN) return;
        hits.push({ e, sum: strain, at, normal });
      });
      // Outside the query callback: forcing flips the leaf's body type mid-world.
      for (const h of hits) {
        if (!ls.hung) break;
        const t = h.e.body.translation();
        const at = h.at || { x: t.x, y: t.y, z: t.z };
        let n = h.normal || { x: 0, y: 1, z: 0 };
        const dot = n.x * (t.x - at.x) + n.y * (t.y - at.y) + n.z * (t.z - at.z);
        if (dot < 0) n = { x: -n.x, y: -n.y, z: -n.z };
        const w = this._feedPropWindow(h.e, doorFrameTag(ls.doorId), h.sum, at, n, simTimeMs, touched);
        w.doorId = ls.doorId;
        w.leafId = leaf.id;
        // Forced NOW — the doorway opens the moment the hinges go, not at the window's end.
        // 'bent' is decided when the window closes (_closePropWindow), like a wall's line.
        if (w.impulse >= DOOR.forceImpulseNs) this._forceLeaf(leaf, w, simTimeMs);
      }
    }
  }

  /** M14's ranking, asked from the leaf's side: is `target` the collider that pushed
   *  hardest on `e` this step? If so the whole m·Δv is the leaf's, as a wall would take it. */
  _bestContactIs(e, target) {
    const world = this.physics.world;
    let best = null, bestSum = 0;
    world.contactPairsWith(e.collider, (other) => {
      let s = 0;
      world.contactPair(e.collider, other, (manifold) => {
        const nc = manifold.numContacts();
        for (let i = 0; i < nc; i++) s += Math.abs(manifold.contactImpulse(i));
      });
      if (s > bestSum) { bestSum = s; best = other; }
    });
    return !!best && best.handle === target.handle;
  }

  /** The hinges go (M23). The M11 unhang path, then the frame's line and the door's event.
   *  M32: through interact.js chooseLeafRest, the SAME chooser E's removal uses — so a couch
   *  shoved from the west no longer finds the leaf laid under its own leading corner
   *  (KNOWN_ISSUES M23 "a forced leaf goes to M11's rest pose"). One path, not two. */
  _forceLeaf(leaf, w, simTimeMs) {
    const ls = leaf.state;
    ls.frameBent = false;
    const by = w.heldBy.length ? w.heldBy[0] : null;
    const spot = chooseLeafRest(this.physics, leaf);
    this.registry.unhang(leaf, spot.pose || ls.rest || null);
    w.frameState = 'forced';
    if (ls.hinge && ls.hinge.at && ls.hinge.normal) {
      w.at = { x: ls.hinge.at.x, y: ls.hinge.at.y, z: ls.hinge.at.z };
      w.normal = { x: ls.hinge.normal.x, y: ls.hinge.normal.y, z: ls.hinge.normal.z };
    }
    this._openProp.delete(w.key);
    this._postPropLine(w, simTimeMs);
    if (this.bus) {
      this.bus.emit(EVENTS.DOOR_STATE, {
        doorId: ls.doorId, entityId: leaf.id, state: 'forced', by,
        objectId: w.entityId, impulse: Number(w.impulse.toFixed(3)),
      }, simTimeMs);
    }
  }

  _decayPropWindows(stepMs, simTimeMs, touched) {
    if (this._openProp.size === 0) return;
    for (const [key, w] of [...this._openProp]) {
      if (touched.has(key)) continue;
      w.ageMs += stepMs;
      if (w.ageMs >= DAMAGE.aggregationWindowMs) this._closePropWindow(w, simTimeMs);
    }
  }

  /** Post ONE property line per closed window (§26.4 "one ledger entry"), capped per surface
   *  (§8.3 "maximum charge") — the cap re-derived from the ledger, so no extra state and a
   *  reset that clears the ledger clears the cap. A window that rounds to 0.00 (under the
   *  threshold, or a capped surface) writes NOTHING: no line, no event, no notice, no mark. */
  _closePropWindow(w, simTimeMs) {
    this._openProp.delete(w.key);
    /* A door frame's window (M23): the hit or shove did NOT force the door (a forcing deletes
     * its window in _forceLeaf), so this is the "tempting, not yet" line — chargeBent, once
     * per hung spell (state.frameBent, cleared when the door is forced and on reset), and
     * only for a strain that reached DOOR.bentImpulseNs on a leaf still on its hinges. */
    if (w.doorId != null) {
      const leaf = this.registry.get(w.leafId);
      if (!leaf || !leaf.state.hung || leaf.state.frameBent || w.impulse < DOOR.bentImpulseNs) return;
      leaf.state.frameBent = true;
      w.frameState = 'bent';
    }
    this._postPropLine(w, simTimeMs);
  }

  /** THE ONE PLACE a property line is written (M14, and the door frames of M23 through the
   *  same door): the cap re-derived from the ledger, the §8.3 row's price — the per-N·s
   *  rate, or a frame's fixed charge for the state it just reached — then the ledger push
   *  and the DAMAGE_APPLIED event. A window that rounds to 0.00 writes NOTHING. */
  _postPropLine(w, simTimeMs) {
    const P = DAMAGE.property;
    const row = surfaceRow(w.surfaceId);
    const ledger = (this.state && this.state.ledger) ? this.state.ledger : null;
    if (ledger && !Array.isArray(ledger.propertyDamage)) ledger.propertyDamage = [];
    const lines = ledger ? ledger.propertyDamage : [];
    const already = lines.reduce((s, l) => s + (l.surfaceId === w.surfaceId ? l.cost : 0), 0);
    const room = Math.max(0, P.maxChargePerSurface - already);
    let raw = row.charges ? (row.charges[w.frameState] || 0) : propertyCost(w.impulse, this._shareOf(w));
    if (typeof this.mitigation === 'function') raw *= this.mitigation(w);
    const cost = Number(Math.min(raw, room).toFixed(2));
    if (!(cost > 0)) {
      /* M30. A window that rounds to nothing because it was UNDER THE THRESHOLD writes nothing
       * at all, as it always has (§10.4 — no bill without a cause). A window that rounds to
       * nothing because the SURFACE IS FULL is a different fact: the hit happened, it just
       * cannot cost any more. §8.3 caps the money, §8.4 asks for the four channels at every
       * impact, so this one says so and leaves the ledger and its counters alone.
       *
       * BOTH HALVES ARE READ FROM `room`, not from `raw` alone. A charge that would have been
       * a real line on its own (it survives the ledger's own rounding to the cent) and had no
       * room to land in is capped; a charge that rounds away on a wall with 400.00 of room
       * left is the under-threshold case and stays silent, which is what it was before M30.
       * Getting that backwards told the player "already at its maximum" about a wall that had
       * cost them nothing — reachable for any hit whose share of the m·Δv lands a hair over
       * DAMAGE.property.impulseThreshold (m37 P6). */
      if (Number(raw.toFixed(2)) > 0 && room < raw) this._postCapped(w, row, simTimeMs);
      return;
    }
    const line = {
      category: 'property',
      surfaceId: w.surfaceId,
      /** §8.4 "object/location": the words for the surface (surfaces.js). */
      location: labelFor(w.surfaceId),
      entityId: w.entityId,
      defId: w.defId,
      impulse: Number(w.impulse.toFixed(3)),
      peakStepImpulse: Number(w.peak.toFixed(3)),
      band: row.charges ? w.frameState : propertyBandFor(w.impulse).name,
      cost,
      at: { x: Number(w.at.x.toFixed(2)), y: Number(w.at.y.toFixed(2)), z: Number(w.at.z.toFixed(2)) },
      normal: { x: Number(w.normal.x.toFixed(3)), y: Number(w.normal.y.toFixed(3)), z: Number(w.normal.z.toFixed(3)) },
      timeMs: w.startedAt,
      heldBy: w.heldBy.slice(),
    };
    // A door frame's line names its kind and its door (M23), so the invoice, the recap and
    // the suites can find it without parsing the surface id.
    if (row.kind) { line.kind = row.kind; line.doorId = w.doorId; }
    /* M30. `surfaces` is the corner this line was part of — every billable surface the hardest
     * step touched, with its share, folded ones at 0. Present only when there WAS a corner, so
     * every single-surface line on the ledger is the object M14 wrote, key for key. */
    if (w.surfaces && w.surfaces.length > 1) line.surfaces = w.surfaces.map((s) => ({ id: s.id, share: s.share }));
    /* …and this is the line on which the surface reached its §8.3 maximum. TRIMMED (the charge
     * was cut to the room that was left) or EXACTLY FULL (the charge landed on the maximum to the
     * cent) both mean the same thing to a reader, so both set the flag — otherwise the sheet's
     * '(N at the cap)', which counts this flag, could disagree with the surface that is actually
     * full. Still at most one line per surface: the room is gone after this one either way. */
    if (cost + 0.005 < raw || room - cost <= 0.005) line.capped = true;
    if (ledger) lines.push(line);
    // The SAME event the item ledger uses; every listener branches on `category`. `by` (M31)
    // is heldBy's first entry — one key for "who", whatever the category (see _closeWindow).
    if (this.bus) this.bus.emit(EVENTS.DAMAGE_APPLIED, { ...line, position: line.at, by: holderOf(w) }, simTimeMs);
  }

  /** M30: a window's own share of the hits that fed it — 1 for everything that was never
   *  split, so propertyCost() reduces to M14's closed form. Impulse-weighted (see
   *  _feedPropWindow), clamped into [0, 1] because a share outside it would make a hit
   *  cheaper or dearer than it was. */
  _shareOf(w) {
    if (!(w.impulse > 0) || !Number.isFinite(w.fracSum)) return 1;
    return Math.max(0, Math.min(1, w.fracSum / w.impulse));
  }

  /**
   * M30 — §8.4's four channels for a hit that costs nothing because the surface is full.
   * NOT a ledger line and NOT a DAMAGE_APPLIED: runLog.js counts every property
   * DAMAGE_APPLIED as a ledger entry (countEvent), and m17 R2e / m22 PD10 pin that equality,
   * so a zero-cost line under that name would make the counters lie. It is its own event,
   * carrying the same fields a line carries with cost 0, so the mark, the caption, the pulse
   * and the notice all read it exactly as they read a line (main.js, scuffs.js, audio.js).
   *
   * ONE PER SURFACE PER DAMAGE.property.cappedRepeatMs. A player grinding a couch along a
   * capped wall closes an aggregation window every ~0.7 s and §8.4 asks for ONE small notice,
   * not a stream. `last <= simTimeMs` is the replay guard audio.js takeCue documents: a stamp
   * from a previous run sits in the future of a clock that restarted at 0.
   */
  _postCapped(w, row, simTimeMs) {
    const P = DAMAGE.property;
    const last = this._cappedAt.get(w.surfaceId);
    if (last != null && last <= simTimeMs && simTimeMs - last < P.cappedRepeatMs) return;
    this._cappedAt.set(w.surfaceId, simTimeMs);
    if (!this.bus) return;
    const at = { x: Number(w.at.x.toFixed(2)), y: Number(w.at.y.toFixed(2)), z: Number(w.at.z.toFixed(2)) };
    const payload = {
      category: 'property',
      capped: true,
      surfaceId: w.surfaceId,
      location: labelFor(w.surfaceId),
      entityId: w.entityId,
      defId: w.defId,
      impulse: Number(w.impulse.toFixed(3)),
      peakStepImpulse: Number(w.peak.toFixed(3)),
      band: row.charges ? w.frameState : propertyBandFor(w.impulse).name,
      cost: 0,
      at,
      // The mark and the shake read `position`; a line's DAMAGE_APPLIED carries both too.
      position: at,
      normal: { x: Number(w.normal.x.toFixed(3)), y: Number(w.normal.y.toFixed(3)), z: Number(w.normal.z.toFixed(3)) },
      timeMs: w.startedAt,
      heldBy: w.heldBy.slice(),
      by: holderOf(w),   // M31: the same "who" a real line carries, so a capped hit reads alike
    };
    if (row.kind) { payload.kind = row.kind; payload.doorId = w.doorId; }
    this.bus.emit(EVENTS.PROPERTY_CAPPED, payload, simTimeMs);
  }

  /** The window closes at the CURRENT step's time, so the DAMAGE_APPLIED stamp is the
   *  moment the line was posted and never earlier than the ledger line's own timeMs, which
   *  is when the window opened (§27.4 wants timestamps that mean something). */
  _decayWindow(entity, stepMs, simTimeMs = 0) {
    const w = this._open.get(entity.id);
    if (!w) return;
    w.ageMs += stepMs;
    if (w.ageMs >= DAMAGE.aggregationWindowMs) this._closeWindow(entity, w, simTimeMs);
  }

  /** Post one aggregated §8.4 ledger line. */
  _closeWindow(entity, w, simTimeMs) {
    this._open.delete(entity.id);
    if (w.loss <= 0) return;
    const before = Math.min(100, entity.state.condition + w.loss);
    const cost = repairCost(entity.def, entity.state.condition) - repairCost(entity.def, before);
    const line = {
      entityId: entity.id,
      defId: entity.defId,
      /** §8.4: "object/location, category, condition change, repair or replacement cost". */
      conditionBefore: Number(before.toFixed(1)),
      conditionAfter: Number(entity.state.condition.toFixed(1)),
      band: bandFor(entity.state.condition).name,
      peakSpeed: Number(w.peakSpeed.toFixed(3)),
      cost: Number(Math.max(0, cost).toFixed(2)),
      at: { x: Number(w.x.toFixed(2)), y: Number(w.y.toFixed(2)), z: Number(w.z.toFixed(2)) },
      timeMs: w.startedAt,
    };
    if (this.state && this.state.ledger) this.state.ledger.itemDamage.push(line);
    /* `by` (M31; §8.4 "player attribution when reliable", §15.3 "for humour and learning"):
     * the holder at first contact, or null for a thrown one. On the EVENT and not on the
     * ledger line, because the line is what the invoice reconciles (m8, m11 G13) and this is
     * what the recap reads (invoiceScreen.js recapFrom) — the same key the door events carry,
     * so every recap row that HAS an actor names one. */
    if (this.bus) this.bus.emit(EVENTS.DAMAGE_APPLIED, { ...line, by: holderOf(w) }, simTimeMs);
  }

  /** Close every open window — call when a phase ends, so nothing is left unbilled. */
  flush(simTimeMs = 0) {
    for (const [id, w] of [...this._open]) {
      const e = this.registry.get(id);
      if (e) this._closeWindow(e, w, simTimeMs);
      else this._open.delete(id);
    }
    for (const w of [...this._openProp.values()]) this._closePropWindow(w, simTimeMs);
  }

  /** §15.1's item-damage total, and §8.4's running total during work. `lines`/`cost`/`worst`
   *  stay item-only (m8 prints them); `property` is the second ledger's (M14). */
  totals() {
    const ledger = (this.state && this.state.ledger) ? this.state.ledger : null;
    const lines = ledger ? ledger.itemDamage : [];
    const prop = ledger ? (ledger.propertyDamage || []) : [];
    return {
      lines: lines.length,
      cost: Number(lines.reduce((s, l) => s + l.cost, 0).toFixed(2)),
      worst: lines.reduce((w, l) => (l.cost > (w ? w.cost : -1) ? l : w), null),
      property: { lines: prop.length, cost: Number(prop.reduce((s, l) => s + l.cost, 0).toFixed(2)) },
    };
  }

  /** Reset for a replay (§26.6: "reset removes transient straps, grips, damage records"). */
  reset() {
    this._open.clear();
    this._openProp.clear();
    this._touchedProp.clear();
    this._lostBy.clear();
    this._cappedAt.clear();   // M30: a replay's walls are blank, so nothing is "already at" anything
    this._lastSpeed.clear();
    this.impactCount = 0;
    if (this.state && this.state.ledger) {
      this.state.ledger.itemDamage.length = 0;
      if (Array.isArray(this.state.ledger.propertyDamage)) this.state.ledger.propertyDamage.length = 0;
      else this.state.ledger.propertyDamage = [];
    }
    for (const e of this.registry.entities.values()) {
      e.state.condition = 100;
      if (e.state.frameBent) e.state.frameBent = false;   // M23: a replay's frames are whole again
    }
  }
}

/** Exposed for the HUD and for tests: what would an impact at this speed cost right now? */
export function previewDamage(entity, speed) {
  const loss = conditionLossFor(entity, speed);
  const after = Math.max(0, entity.state.condition - loss);
  return {
    tolerance: impactToleranceOf(entity),
    loss,
    band: bandFor(after).name,
    cost: repairCost(entity.def, after) - repairCost(entity.def, entity.state.condition),
  };
}
