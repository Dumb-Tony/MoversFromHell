# Phase specs 6–10 — Tools, Cargo, Drive, Destination, Economy

Implementation specification for GDD §25.2 roadmap phases 6 through 10. Read as a build
checklist, not as prose. Every number here is either transcribed from `docs/GDD.md` (cited
inline by section) or derived from `src/config.js` and `src/objects/definitions.js` as they
stand at the end of Phase 4 / during Phase 5.

**Authority:** `docs/GDD.md` §§1–29. Where this document proposes a value the GDD does not
give, it is marked **[PROPOSED]** and belongs in `src/config.js` as a named placeholder
under the same convention config.js already uses ("named, not tuned").

**Status of the source when this was written:** Phases 0–5 in the tree (`BUILD.phase` still
reads 4 and needs bumping). Phase 5 landed `src/objects/definitions.js` with the full §13.2
manifest (16 definitions), `src/world/house.js` (rooms, zones, interior doors, partitions,
routes), `src/contract/manifest.js` (manifest rows, containment, dwell, validators) and the
`MANIFEST` config block. **Phase 9 is therefore much smaller than it looks** — its zone and
settled-validation machinery already exists and must be extended, not rewritten. See §9.3.

---

## 0. Common ground

### 0.1 Source tree at the start of Phase 6

| Path | Lines | Role |
|---|---|---|
| `src/config.js` | 375 | All tuning. Contains declared-but-unvalidated blocks for `STRAP`, `TRUCK`, `ECONOMY`, `DAMAGE`, `RECOVERY` |
| `src/game.js` | 163 | Authoritative state, fixed-step loop, `state.ledger`, `state.manifest`, `state.entities`, phase machine |
| `src/main.js` | 309 | Boot, system registration order, test seam `window.__MFH` |
| `src/core/clock.js` | 97 | Capped accumulator, pause-by-construction |
| `src/core/eventBus.js` | 94 | §23.3 event vocabulary + `PHASES`; bounded 256-entry log |
| `src/core/input.js` | 373 | Action map; `CONTEXTS.FOOT` / `CONTEXTS.DRIVE` bindings already written |
| `src/core/rng.js` | 64 | `mulberry32`, `Rng`, `hashStr`. Math.random is grep-banned |
| `src/physics/world.js` | 240 | Rapier 0.20 wrapper, `GROUPS`, `GROUP_PRESETS`, `clearForces`, `addRamp`, `primeQueries` |
| `src/objects/definitions.js` | ~460 | §23.1 defs (16) + `validateDef` + `PHASE5_SPAWNS` |
| `src/objects/registry.js` | ~290 | Body/collider/mesh/state per entity, `byCollider` lookup, settle detection, §18.3 object recovery, `snapshot()` |
| `src/world/house.js` | 221 | **Phase 5.** `ROOM`, `ZONES` (5, with a `site` field), `INTERIOR_DOORS`, `PARTITIONS`, `wallSegments`, `zoneAt`, `zoneById`, `overlappingZones`, `ROUTES`, `tightestOnRoute` |
| `src/contract/manifest.js` | 187 | **Phase 5.** `buildManifest`, `containedFraction`, `substantiallyInside`, `stepManifest`, `locateAll`, `manifestSummary`, `validateManifest`, `overlappingSpawns` |
| `src/player/grip.js` | 567 | Damped-spring grip, per-hand force budget, slip, anti-ghosting |
| `src/player/controller.js` | 496 | Kinematic character controller, carry load, imbalance, mantle, recovery |
| `src/render/scene.js` | 314 | Level as data: `APERTURES`, `RAMP`, `PLATFORM`, `OBSTACLES`, `ROOM`, shared collider records |
| `src/render/camera.js` | 145 | Third-person rig with occlusion |
| `src/ui/hud.js` | 72 | §21.1 reticle only |
| `src/dev/debugOverlay.js` | 80 | §22.5 counters |
| `tools/m0..m4-tests.js` | — | 365 assertions across five suites; `tools/smoketest.ps1` is the gate |

### 0.2 House rules every item below is bound by

1. **No bare literals in systems.** Every threshold, rate, mass and dimension lives in
   `src/config.js` (§25.1, §25.3).
2. **State is plain serializable data.** No THREE objects, no Rapier handles, no closures in
   `game.state` — `tools/m0-tests.js` E8 asserts it. Rapier joints for straps and dollies go
   in a *registry*, mirroring `ObjectRegistry`'s split; only the serializable half reaches
   state (§22.4, §23.4).
3. **Stable string ids, never array position** — for players, entities, tools, straps,
   anchors, zones and manifest entries (§22.4, §9.2 "Tools have stable IDs and state").
4. **No hidden singleton ownership.** A dolly under a couch, a strap on a crate, a player in
   a seat — none of them may make the object un-grabbable by someone else. Multiple grips
   combine (§6.4, §14.2).
5. **Deterministic RNG only.** Road-event jitter, review-tag selection, damage variance and
   manifest composition draw from `ctx.rng` (§19.3, `src/core/rng.js` invariant).
6. **Everything vendored, zero external requests.**

### 0.3 Config blocks already declared for these phases

These exist in `src/config.js` today as named placeholders. Phases 6–10 must **validate or
replace** them, not shadow them with new keys.

| Block | Keys and values as declared | Validated by |
|---|---|---|
| `STRAP` | `stiffness: 2600`, `damping: 90`, `ratingNewtons: 3400`, `failureNewtons: 5200`, `maxLength: 4.5`, `anchorCount: 6` | Phase 7 |
| `TRUCK` | `mass: 2600`, `acceleration: 3.4`, `brakeForce: 5.2`, `maxSpeed: 13.5`, `steerRate: 0.85`, `steerSpeedFalloff: 0.55`, `bodyRollPerG: 0.09`, `roadEvents: { hardBrake: {severity: 1.0}, sharpTurn: {severity: 1.0}, speedBump: {severity: 0.8} }`, `imbalanceSteerPenaltyMax: 0.18` | Phase 8 |
| `DAMAGE` | bands `perfect ≥95 / 0.00`, `scratched ≥70 / 0.08`, `cracked ≥35 / 0.35`, `broken ≥0 / 1.00`; fragility `sturdy {9.0, 0.6}`, `normal {5.5, 1.4}`, `fragile {2.4, 4.0}`, `extreme {1.2, 8.5}`; `aggregationWindowMs: 700`, `aggregationRadius: 0.8` | Phase 10 (needed by 8) |
| `ECONOMY` | `labourPerMinutePerMover: 14`, `overtimeMultiplier: 1.6`, `fuelPerKm: 3.2`, `efficiencyBonusMax: 260`, `oneTripBonus: 180`, `roomAccuracyBonus: 90`, `recoveryFee: 45`, `collisionFeeBase: 60` | Phase 10 |
| `RECOVERY` | `outOfBoundsGraceSeconds: 4`, `noProgressGraceSeconds: 12`, `stableTransformIntervalMs: 900`, `objectRecoveryLiftM: 0.12`, `objectFloorY: -8` | Phase 5, reused 7–9 |
| `MANIFEST` | **live, not placeholder.** `minObjects: 15`, `maxObjects: 25` (§13.1), `containedFraction: 0.6` (§12.3 "substantially inside"), `dwellMs: 1200` (§12.3 dwell) | Phase 5 pickup half, **Phase 9 delivery half** |

### 0.4 Event vocabulary

`src/core/eventBus.js` already declares every §23.3 event name. Phases 6–10 emit them; they
must **not** invent near-duplicates. Currently unemitted and claimed by these phases:

| Event | Minimum payload (§23.3) | First emitted |
|---|---|---|
| `IMPACT` | `entities, point, impulse, materials, relVelocity` | Phase 6 (disassembly force), Phase 8 (road) |
| `DAMAGE_APPLIED` | `target, source, category, amount, cost, position` | Phase 6 (property, zero-cost), Phase 8 (priced) |
| `STRAP_CHANGED` | `strapId, endpoints, tension, state, actor` | Phase 7 |
| `ZONE_CHANGED` | `entityId, zoneId, entered\|exited, settled` | Phase 7 (cargo zone), Phase 9 (room zones) |
| `CARGO_STATE` | `entityId, truckId, secured, support, risk` | Phase 7 |
| `ROAD_FORCE` | `truckId, type, vector, severity` | Phase 8 |
| `RECOVERY` | `entityId, reason, fee, oldTransform, newTransform` | already emitted for players; extend to cargo/tools/vehicle |

Two new names are required and have no §23.3 equivalent. Add them to `EVENTS` in the same
style, with a comment naming the section that justifies them:

- `TOOL_STATE` — `toolId, kind, action, actorId, targetEntityId, ok` (§9.2's deploy /
  attach / tension / fold / retrieve contract).
- `PART_CHANGED` — `parentEntityId, partId, action ('detached'|'reattached'), tool, seconds,
  actorId` (§7.4 authored break/disassembly states; §8.2 "unscrew and reattach").

### 0.5 Collision groups

`src/physics/world.js` currently has `WORLD 0x0001`, `PLAYER 0x0002`, `OBJECT 0x0004`.
Phases 6–8 need three more, added to `GROUPS` and `GROUP_PRESETS` in that file:

| Bit | Name | Purpose |
|---|---|---|
| `0x0008` | `VEHICLE` | Truck chassis, cargo-box walls/floor/roof, rear door, deployed ramp |
| `0x0010` | `TOOL` | Dolly deck, blanket proxy, strap visual body — collides with WORLD and OBJECT |
| `0x0020` | `SENSOR` | Cargo-threshold and room-zone sensors. Membership only; filter = 0 (sensor colliders, never solid) |

`GROUP_PRESETS.objectHeld` (held object stops colliding with its carrier) must gain a
parallel `objectOnDolly` / `objectInCargo` variant only if measurement shows it is needed.
Do not add it speculatively — the Phase 2 note in `world.js` explains why that exclusion was
earned rather than assumed.

### 0.6 House-rule violations already in the tree that these phases must fix

These are load-bearing from Phase 7 onward and are currently bare literals or missing schema.

| Location | Problem | Fix in |
|---|---|---|
| `src/objects/registry.js` `step()` | `speed < 0.08 && spin < 0.15` — the §12.3 settle test, hard-coded. **Both Phase 7 cargo membership and Phase 9 delivery route through it** (`stepManifest` deliberately reuses `e.state.settled`), so these two literals are the most load-bearing numbers in the project and are the only ones with no name | Phase 7 → `SETTLE.speed`, `SETTLE.spin` |
| `src/objects/registry.js` `step()` | `t.y > -1` last-stable guard; `abs(x) > 120 \|\| abs(z) > 120` out-of-bounds box (`objectFloorY` was named in Phase 5; the horizontal bounds were not) | Phase 7 → `RECOVERY.lastStableMinY`, `RECOVERY.boundsXZ` |
| `src/contract/manifest.js` `stepManifest` | `row.delivered` is recomputed every step and is **not sticky** — nudging a delivered item resets `dwellMs` to 0 and un-delivers it | Phase 9 (trap 9.7.3) |
| `src/contract/manifest.js` | Manifest rows use `row.toZone`; §23.2 names the field `destinationZoneId`. Harmless now, a rename cost later | Phase 9 |
| `src/contract/manifest.js` | Delivery state is **polled**, never evented. `ZONE_CHANGED` is declared in `eventBus.js` and never emitted, so Phase 10's "ledger matches events" has no event to match against for delivery | Phase 9 |
| `src/objects/definitions.js` | `tv_55_01` and `mirror_framed_01` declare `fragility: 'very_fragile'`. `DAMAGE.fragility` has no such key — the lookup returns `undefined` | Phase 8 (before damage is priced) |
| `src/objects/definitions.js` `validateDef` | Does not check `fragility` against `DAMAGE.fragility` keys, so the above passed validation silently | Phase 8 |
| `src/objects/definitions.js` disassembly entries | Shape is `{part, tool, seconds, shrinksTo}`. §23.1 specifies `part, tool, time, reversible`; §8.2 requires reattach. `reversible` is missing | Phase 6 |

---

## Phase 6 — Tools

> **Gate (§25.2), quoted:** "Each solves a physical problem"
> **Build outcome (§25.2), quoted:** "Dolly, protection, ramp, disassembly"

### 6.1 What must be MEASURED to prove the gate

"Solves a physical problem" is only meaningful against a baseline where the problem is
unsolved. Each of the four tools therefore needs a **paired measurement**: the same scenario,
same seed, tool absent vs. tool present, with a threshold that separates them. §9.1 also
requires each tool to have a **failure/comedy mode**, so each pair needs a third measurement
showing the tool can make things worse.

| Tool | Problem (§9.1 "primary function") | Binary claim to measure |
|---|---|---|
| Flat dolly | "Roll heavy items on level ground" | Sustained force needed to translate `couch_3seat_01` at ≥0.5 m/s falls from **309 N** (friction 0.35 × 882.9 N) to **≤ 40 N**, a ≥7× reduction. `fridge_01` (110 kg) becomes movable by one hand where it was not |
| Moving blanket | "Reduce scratches/impact" | With a blanket applied, the contact velocity at which `mirror_framed_01` leaves the `perfect` band rises by ≥2× vs bare, and the resulting condition loss for an identical scripted impact falls by ≥50% |
| Ramp | "Bridge truck floor height" | With the ramp deployed, a mover carrying `box_small_01` reaches cargo-floor height **1.20 m** without a jump or mantle; without it, the 1.20 m face is above `PLAYER.mantleMaxHeight` (1.35 m minus a 0.5 m load offset) and the traverse fails |
| Screwdriver / disassembly | "Disassemble authored parts" | `wardrobe_01` doors off: depth 0.60 → **0.52 m**. `bookshelf_01` shelves out: 0.30 → **0.06 m**. `side_table_01` legs off: height 0.58 → **0.12 m**. Measured as a change in collider half-extents and in **packed bounding volume**, which is the payoff that actually exists — see the note below |

**Disassembly does not currently change what fits, and the spec must not pretend it does.**
Every item's minimum projected width against the tightest route leg (0.86 m,
`house.js` `ROUTES` → `living_kitchen`):

| Object | dims | min projection | vs 0.86 m | disassembly changes it? |
|---|---|---|---|---|
| `couch_3seat_01` | 2.10 × 0.85 × 0.90 | **0.850** | +0.010 m | **no path exists** |
| `fridge_01` | 0.70 × 1.75 × 0.70 | 0.700 | +0.160 | doors off → 0.62, already passing |
| `wardrobe_01` | 1.20 × 2.00 × 0.60 | 0.600 | +0.260 | doors off → 0.52, already passing |
| `side_table_01` | 0.55 × 0.58 × 0.55 | 0.550 | +0.310 | legs off, already passing |
| `chair_dining_01` | 0.46 × 0.95 × 0.50 | 0.460 | +0.400 | legs off, already passing |
| `bookshelf_01` | 0.80 × 1.80 × 0.30 | 0.300 | +0.560 | shelves out, already passing |
| `tv_55_01` | 1.24 × 0.76 × 0.09 | 0.090 | +0.770 | stand off, already passing |

Nothing flips. `wardrobe_01`'s real constraint is **height**: 2.00 m against a 2.03 m
`INTERIOR_DOORS` opening — 30 mm — which no disassembly path addresses. So the honest
measured payoff for Phase 6 disassembly is **packed volume** (feeding Phase 7's one-trip
decision) and **handling** (mass and silhouette), not clearance. Assert those.

**Failure-mode measurements (§9.1's third column):**

| Tool | Failure mode, quoted | Claim |
|---|---|---|
| Flat dolly | "Runs on slopes; load slips" | On the scene ramp (0.28 rad = **16.04°**), a loaded dolly develops **244.0 N** downslope against **33.9 N** rolling resistance — net **210.1 N** runaway, which exceeds nothing and therefore accelerates. Assert the loaded dolly's speed increases monotonically when released on any slope above `TOOLS.dolly.slopeRunawayDeg` |
| Moving blanket | "Bad wrap obscures grip or falls off" | A blanketed object's `grip.forceMult` is multiplied by `TOOLS.blanket.gripForceMult < 1`; above `TOOLS.blanket.slipOffImpulse` the coverage state clears and the attenuation stops |
| Ramp | "Misalignment or steep approach" | Beyond `TOOLS.ramp.alignToleranceM` the deployed ramp leaves a lip; assert the resulting step exceeds `PLAYER.stepHeight` (0.35 m) so it must be walked around, not through |
| Screwdriver | "Loose pieces get lost" | Detached parts are real entities with `RECOVERY` eligibility and appear on the manifest; assert `registry.count` increases by the part count and that each part has an out-of-bounds timer |

### 6.2 Governing GDD sections

**§9.1 Tool Rule** — transcribed in full, prototype column included:

> "Tools create new physical solutions; they do not erase physics. Each tool changes
> leverage, friction, protection, clearance, containment, or securing. Better tools should
> introduce both new mastery and new accidents."

| Tool | Primary function | Failure/comedy mode | Prototype |
|---|---|---|---|
| Flat dolly | Roll heavy items on level ground | Runs on slopes; load slips | **Required** |
| Moving blanket | Reduce scratches/impact | Bad wrap obscures grip or falls off | **Required or simplified** |
| Ratchet strap | Restrain cargo to anchors | Poor angle or tension permits shift | **Required** (Phase 7) |
| Ramp | Bridge truck floor height | Misalignment or steep approach | **Required** |
| Screwdriver/drill | Disassemble authored parts | Loose pieces get lost | **One required** |
| Furniture sliders | Reduce floor friction | Object keeps sliding | Later |
| Appliance dolly | Secure tall heavy objects | Tips during fast turns | Later |
| Piano board | Stabilize piano | Demands good strap geometry | Expansion |
| Winch | Pull along a line | Snap or bad redirect | Expansion |
| Forklift/crane | Handle extreme contracts | Vehicle-scale accidents | Late expansion |

"Later", "Expansion" and "Late expansion" are **not** Phase 6 work. §29.1: "Make tools solve
physical problems before adding upgrade tiers."

**§9.2 Interaction Contract** — five binding rules:
- "Tools are world objects and consume cargo space unless mounted." → tools are entities in
  `ObjectRegistry` or a parallel tool registry with mass and volume, and count against the
  Phase 7 cargo volume.
- "Deploy, attach, tension, fold, and retrieve through the common interaction system." → one
  `interact` action (`KeyE` / `PAD.X`, already bound in `src/core/input.js`), not four verbs.
- "Placement provides a readable preview and valid/invalid affordance."
- "Tools have stable IDs and state so multiplayer authority and save snapshots can represent
  them."
- "Lost tools incur retrieval or replacement cost; the prototype may auto-return them after
  scoring."

**§9.3** — prototype uses "a compact loadout screen or nearby tool rack". A rack in the
driveway is cheaper and more physical; prefer it.

**§8.2 Modifiable Environment** — the disassembly half of Phase 6 and the resolution of the
32" door problem:

| Element | Possible action | Tradeoff |
|---|---|---|
| Door | Open or remove from hinges | Preparation time and replacement risk |
| Furniture legs | Unscrew and reattach | Smaller profile; loose parts to track |
| Railing | Remove authored sections | Better clearance; high damage penalty |
| Window | Open/remove where authored | Alternate route; glass/fall risk |
| Floors and walls | Protect with blankets/runners | Tool time and limited supply |

**§7.4 Breakage** — "Breakage uses authored logical states rather than uncontrolled
procedural mesh destruction… Every broken state must remain movable and completable."
Disassembly and breakage share one mechanism: a parent entity plus detached part entities.

**§23.1** — `disassembly | array | part, tool, time, reversible`. The existing entries carry
`shrinksTo` instead of `reversible`; both are needed.

**§3.3 Preparation Versus Brute Force** — "Every substantial obstacle should support at least
two approaches: a lower-risk prepared method and a faster or funnier brute-force method…
Brute force must remain possible enough to tempt players."

**§8.1** — "Park position should affect ramp angle and carry distance without causing
unwinnable setup."

**§9.1's own arithmetic against current data:**

| Quantity | Value | Source |
|---|---|---|
| `couch_3seat_01` weight | 90 × 9.81 = **882.9 N** | `definitions.js` |
| Floor resistance, bare | 0.35 × 882.9 = **309.0 N** | friction 0.35; matches the measured note in `definitions.js` |
| One-handed drag force available | **≈358 N** (measured, `definitions.js`) | spring 900 × stretch 0.70 = 630 N ceiling, capped |
| Dolly resistance **[PROPOSED]** at μ_roll 0.04 | 0.04 × 882.9 = **35.3 N** | 8.75× reduction |
| `fridge_01` weight | 110 × 9.81 = **1079.1 N** | bare resistance 0.48 × 1079.1 = **518.0 N**, above the 358 N one-hand budget → currently immovable solo; on a dolly, 43.2 N |
| Scene ramp rise | 4.35 × sin(0.28) = **1.2022 m** = `PLATFORM.y` (1.2) | `scene.js` — the existing ramp is already truck-deck height |
| Truck deck height **[PROPOSED]** | **1.20 m** | consistent with the above |
| Tool ramp at length 2.70 m | asin(1.20 / 2.70) = **26.39°** | walkable (< `PLAYER.maxSlopeClimbDeg` 48°) |
| Loaded dolly on a 26.39° ramp | 882.9 × sin = **392.5 N** down, 31.6 N resist → **360.9 N** net | exceeds the 358 N one-hand budget by 3 N: a loaded dolly on the truck ramp *requires* a partner or a brace. This is §9.1's "runs on slopes" landing exactly on the co-op seam |

### 6.3 Existing modules touched

| Path | Change |
|---|---|
| `src/config.js` | New `TOOLS` block (§6.5) |
| `src/objects/definitions.js` | Add `reversible: true` to every `disassembly` entry; add couch legs (see trap 6.7.1); add tool definitions or split into `src/tools/definitions.js` |
| `src/objects/registry.js` | Parent/part linkage; collider resize on `shrinksTo`; `state.parts[]`, `state.attachedToolId`, `state.blanketed` |
| `src/physics/world.js` | `GROUPS.TOOL`, `GROUPS.VEHICLE` (the ramp is vehicle-adjacent), presets |
| `src/player/grip.js` | `entity.def.grip.forceMult` must become an *effective* value that blanket coverage can modulate; add `TOOL_STATE` emission on attach via grip |
| `src/core/input.js` | `interact` (E / X) and `context` (Q / RB) are already bound; wire them |
| `src/ui/hud.js` | §9.2 "readable preview and valid/invalid affordance" and §20.2 "interactable objects use restrained edge/material response, not permanent neon" |
| `src/main.js` | Register `tools` system between `movers` and `physics` (constraints resolve before the step) |
| `src/world/house.js` | `INTERIOR_DOORS` gains `removable: true` and a leaf record; `wallSegments()` must regenerate the opening when a leaf is removed so mesh and collider stay generated from one record (§8.1). `tightestOnRoute()` becomes the measurement Phase 6 moves |
| `src/render/scene.js` | Tool rack near the driveway (§9.3); a railing section as a removable collider record (§8.2) |

### 6.4 New modules

| Proposed path | One-line responsibility |
|---|---|
| `src/tools/definitions.js` | Data-driven tool definitions (mass, dimensions, deploy/retrieve times, effect parameters) in the §23.1 style |
| `src/tools/registry.js` | Owns tool entities and Rapier handles; stable string ids; serializable snapshot half only (§9.2, §22.4) |
| `src/tools/placement.js` | Shared deploy/attach/fold/retrieve state machine and the valid/invalid placement preview (§9.2) |
| `src/tools/dolly.js` | Rolling support under a loaded object: substitutes rolling resistance for surface friction, and releases the load above a slope or lateral-force threshold |
| `src/tools/protection.js` | Blanket coverage state on an entity; scales impact thresholds and grip force; sheds above an impulse threshold |
| `src/tools/ramp.js` | Deployable ramp body, alignment quality, and the resulting lip height |
| `src/tools/disassembly.js` | Authored part detach/reattach with a tool path and a brute-force path; drives collider resize via `shrinksTo` |
| `src/objects/parts.js` | Detached part entities and their parent linkage; keeps parts on the manifest and recoverable (§7.4, §9.1 "loose pieces get lost") |
| `src/world/modifiable.js` | Removable doors, railing sections and windows as authored, reversible level elements (§8.2) |
| `tools/m6-tests.js` | Phase 6 suite |

### 6.5 Config keys

```js
export const TOOLS = Object.freeze({
  interactRange: 2.1,          // matches GRIP.reach; one number would be better than two
  previewRange: 3.0,
  rack: { x, y, z },           // §9.3 tool rack position

  dolly: {
    mass: 14, deck: { x: 0.75, y: 0.12, z: 0.45 }, wheelRadius: 0.06,
    rollingResistance: 0.04,   // vs couch friction 0.35 -> 8.75x reduction
    slopeRunawayDeg: 3.0,      // §9.1 "runs on slopes"
    loadSlipLateralG: 0.35,    // §9.1 "load slips"
    deckFriction: 0.55,        // load-to-deck; NOT a weld — see trap 6.7.4
    deploySeconds: 1.2, retrieveSeconds: 1.2,
  },

  blanket: {
    mass: 3, coverage: { radius: 1.2 },
    impulseThresholdMult: 2.2, // raises DAMAGE.fragility[*].impulseThreshold
    conditionRateMult: 0.45,   // halves-ish the loss per unit over threshold
    gripForceMult: 0.88,       // §9.1 "bad wrap obscures grip"
    slipOffImpulse: 22,        // N.s at which coverage clears
    applySeconds: 3.0, removeSeconds: 1.5,
  },

  ramp: {
    mass: 32, length: 2.70, width: 1.10, thickness: 0.08,
    // deckHeight 1.20 -> asin(1.20/2.70) = 26.39 deg
    surfaceFriction: 0.85,
    alignToleranceM: 0.08,     // lateral slop before a lip appears
    alignToleranceRad: 0.09,
    maxLipHeight: 0.40,        // above PLAYER.stepHeight 0.35: must be walked around
    deploySeconds: 2.5, stowSeconds: 2.5,
  },

  disassembly: {
    // times come from the per-part `seconds` in definitions.js (35..120 s)
    toolTimeMult: 1.0,
    bruteForceTimeMult: 0.35,       // §3.3 "faster or funnier"
    bruteForceConditionCost: 22,    // condition points on the PARENT, per part
    bruteForcePropertyRisk: 0.30,   // chance of a §8.3 property-damage event; ctx.rng only
    reattachTimeMult: 1.4,
    partLostGraceSeconds: 30,       // before a detached part is flagged on the manifest
  },

  door: {
    removeSeconds: 45, reattachSeconds: 60,
    // Acts on src/world/house.js INTERIOR_DOORS. The tightest route leg is living_kitchen at
    // 0.86 m against the couch's 0.850 m — 10 mm. This turns that into 0.91 m / 60 mm.
    clearanceGainM: 0.05,
    forcedRemovalConditionCost: 40, // §8.2 "replacement risk"
  },

  railing: {
    removeSeconds: 30,
    propertyDamageCost: 'high',     // §8.2 "high damage penalty" — priced in Phase 10
  },
});
```

Also required in Phase 6: `DAMAGE.fragility.very_fragile` (see §0.6) if the blanket is to be
measured against `mirror_framed_01` / `tv_55_01`.

### 6.6 Test assertions (`tools/m6-tests.js`)

1. Sustained horizontal force required to move `couch_3seat_01` at ≥0.5 m/s is ≥300 N bare
   and ≤40 N on a deployed dolly, measured as the mean applied grip force over 120 steps.
2. `fridge_01` (110 kg, μ 0.48, needs 518.0 N) does not translate under a single unbraced
   grip in 180 steps; on a dolly the same grip translates it ≥1.0 m in 180 steps.
3. A loaded dolly released on the scene ramp (0.28 rad) has a strictly increasing downslope
   speed over 60 steps, and its terminal speed exceeds `PLAYER.walkSpeed` (3.1 m/s).
4. A loaded dolly on level ground with the same release does **not** exceed 0.05 m of travel
   in 120 steps.
5. Detaching `wardrobe_01`'s doors changes its collider half-extent on z from 0.300 to 0.260
   (dimensions 0.60 → 0.52), and its bounding volume falls from 1.440 m³ to 1.248 m³ (−13.3%).
6. Detaching `bookshelf_01`'s shelves changes z from 0.30 to 0.06 — volume 0.432 → 0.086 m³,
   a **−80.0%** change; `registry.count` increases by exactly the number of parts declared in
   its `disassembly` array.
6b. Summed bounding volume of the full manifest falls by ≥15% when every declared disassembly
   is performed, and that delta is what changes the Phase 7 one-trip outcome (`CARGO.volumeUtilisationTarget`).
6c. With a door leaf removed from `living_kitchen`, a scripted couch traverse of that opening
   produces strictly fewer wall-contact `IMPACT` events than the same traverse with the leaf
   in place, on the same seed (trap 6.7.1 — the prepared approach must be measurably better,
   since it no longer unlocks anything).
7. Every detached part is a real entity with a non-null `state.lastStable`, a running
   `state.outOfBoundsMs`, and a `parentEntityId` back-reference.
8. Reattaching a part restores the parent's collider half-extents to within 1e-6 of the
   original and removes the part entity; `registry.count` returns to its pre-detach value.
9. Brute-force removal succeeds without any tool present, takes
   `seconds * TOOLS.disassembly.bruteForceTimeMult` and reduces parent condition by exactly
   `TOOLS.disassembly.bruteForceConditionCost` — i.e. it is never refused (§2.1, §3.3).
10. With a blanket applied to `mirror_framed_01`, an identical scripted 30 N·s impact
    produces ≤50% of the unblanketed condition loss; above `TOOLS.blanket.slipOffImpulse`
    the `blanketed` flag clears and the next identical impact produces the full loss.
11. A blanketed entity's effective grip force multiplier equals
    `def.grip.forceMult * TOOLS.blanket.gripForceMult` and no other multiplier is applied
    twice.
12. A deployed ramp aligned within `alignToleranceM` produces a continuous walkable surface:
    a mover traverses from ground to 1.20 m with `LOCOMOTION` never entering `climbing` and
    zero jump inputs.
13. A ramp misaligned by `alignToleranceM * 2` produces a lip > `PLAYER.stepHeight` (0.35 m)
    and the same traverse fails without a jump.
14. No tool changes `game.state` to contain a Rapier handle, a THREE object or a function —
    re-run the m0 E8 serializability assertion over the full state with all four tools
    deployed and one attached.
15. No system in `src/tools/` contains a numeric literal outside a comment other than 0, 1,
    2 and array indices (grep assertion, mirroring the Math.random ban).

### 6.7 Traps and risks

**6.7.1 Phase 5 resolved the 32" door by routing around it, which inverts the §3.3 problem
Phase 6 was going to solve.** `docs/KNOWN_ISSUES.md` posed three options for the 0.82 m
interior door vs the couch's **0.850 m** minimum projection; Phase 5 took option 2. The
house's actual route doors are `living_kitchen` **0.86 m** and `kitchen_bedroom` **0.91 m**
(`src/world/house.js` `INTERIOR_DOORS`), and `ROUTES` puts the tightest leg to every room at
**0.86 m** — so `tightestOnRoute('bedroom', APERTURES)` = 0.86, and the couch passes it with
**10 mm** to spare. `APERTURES.interior32` (0.82 m) survives in `scene.js`'s reference wall
but is on no route.

The consequence for Phase 6: **nothing in the house is now impassable, so the prepared
approach has no problem left to solve.** §3.3 wants a lower-risk prepared method *and* a
brute-force method; the level currently offers only the second. Door removal must therefore
justify itself by turning a 10 mm squeeze into a comfortable one — measurable as a reduction
in wall contacts and property-damage events on the same scripted couch traverse — not by
unlocking a route. `house.js`'s own comment anticipates this: "use the same record to decide
which door a removal tool should act on." Act on `INTERIOR_DOORS`, and assert the *contact
count* delta, not a boolean fits/doesn't.

Also still open: `couch_3seat_01` has `disassembly: []`. Every other large item in the
manifest has a disassembly path; the showcase object of the phase before it does not. Adding
`{ part: 'legs', tool: 'screwdriver', seconds: 60, reversible: true, shrinksTo: { x: 2.10, y: 0.74, z: 0.90 } }`
gives the couch a second approach (0.74 m clears 0.86 m by 120 mm) and makes the §3.3 pair
real for the object the whole build order was organised around (§29.1).

**6.7.2 "Requires a screwdriver" is the most likely accidental hard denial in the project.**
§9.1's table has a `tool` column and the data has `tool: 'screwdriver'`, which reads as a
gate. §2.1 is explicit: "If an action looks physically possible, allow the attempt… Prefer
yes, with consequences." Disassembly without the tool must be *available*, faster, and
damaging — never refused. The tool's value is that it is reversible and free of damage, not
that it unlocks the action.

**6.7.3 §9.2's "valid/invalid affordance" is a presentation rule, not a placement veto.**
An invalid ramp placement must still *place*, and then behave badly (a lip, a slide, a
topple). A red outline that blocks the confirm is the "invisible lock" §2.1 reserves for
containment, contract areas and technical safeguards only.

**6.7.4 The dolly must not become a hidden owner of its load (§14.2, house rule 4).** The
tempting implementation is a fixed joint between load and deck, which makes the couch a
child of the dolly and silently defeats "shared objects accept forces from all validated
grips". Implement the dolly as a *contact* relationship: a low-friction deck the object rests
on, plus a rolling-resistance substitution applied to the object while it is supported by a
dolly collider. The object stays independently grabbable by every mover, and §9.1's "load
slips" falls out for free instead of needing a special case.

**6.7.5 Blanket coverage is a per-entity state flag, not a second body.** A wrapped-mesh
implementation costs a body and a constraint per blanket and will break sleep (§10.5). Keep
it as `entity.state.blanketed = { toolId, coverage }` plus a render decal, and let the
attenuation live in the damage lookup. It must serialize (§22.4).

**6.7.6 `shrinksTo` changes a collider under a live simulation.** Resizing a collider while
the body is in contact with the world can produce a depenetration impulse — the same failure
class as the Phase 2 wall-ghosting bug documented in `world.js`. Detach must: wake the body,
apply the new collider, and clamp velocity against `SIM.maxLinearVelocity` (40) on the
following step. Assert that no detach produces a post-step speed above 1.0 m/s.

**6.7.7 §9.2 says tools "consume cargo space unless mounted".** If tools are weightless and
volumeless in Phase 6 they will need re-plumbing in Phase 7 when they compete with the
manifest for volume. Give them real mass and dimensions now.

**6.7.8 Ramp geometry is over-constrained by three existing numbers.** Deck height 1.20 m is
implied by `PLATFORM.y` and by `RAMP`'s rise; ramp length determines the angle; the angle
determines whether a loaded dolly runs away. At length 2.70 m the runaway force (360.9 N)
sits 3 N above the measured one-hand budget (358 N) — a knife-edge that will flip with any
grip tuning change. Either widen the margin deliberately or assert the *relationship*
(runaway force > one-hand budget), not the numbers, the way `m2-tests.js` asserts
`maxStretch < forceCap / spring`.

---

## Phase 7 — Cargo

> **Gate (§25.2), quoted:** "Secured pack remains stable"
> **Build outcome (§25.2), quoted:** "Interior, loading, stacks, anchors, straps"

### 7.1 What must be MEASURED to prove the gate

"Remains stable" is a claim about a time series, and the only honest form of it is: *with the
truck stationary and the door closed, a strapped pack does not move, and the physics cost of
holding it does not grow.* Phase 7 must not borrow Phase 8's road forces to prove itself —
that is Phase 8's gate.

| Claim | Threshold |
|---|---|
| Settled pack does not drift | Over 3600 steps (60 s) with the door closed and no player contact, the maximum displacement of any cargo entity from its position at t=0 is **≤ 0.02 m**, and maximum rotation **≤ 0.02 rad** |
| Settled pack does not jitter | §26.3: "Settled cargo does not explode or jitter indefinitely." Every cargo body reports `isSleeping()` within **≤ 300 steps (5 s)** of the last player contact |
| Strap tension is real and bounded | A tensioned strap reports a non-zero tension that stays below `STRAP.ratingNewtons` for a static pack, and the reported value is derived from the constraint impulse, not from a heuristic |
| Straps reduce motion | §26.3: "A tensioned strap reduces relative motion." Under an identical scripted impulse, the strapped stack's peak displacement is **≤ 30%** of the unstrapped stack's |
| Membership is not foolable | §26.3: "Cargo membership and door validation cannot be fooled by an object barely touching the threshold." An object whose AABB overlaps the threshold plane by < `CARGO.containmentFraction` of its own volume is **not** counted, in either direction, and the state does not oscillate across the boundary |
| Volume is finite | The full §13.2 manifest plus four tools does **not** fit in one load; at least one object must be left for a second trip, or the pack must be re-planned. This is what makes `ECONOMY.oneTripBonus` (180) mean anything |
| Cost does not grow | §26.6: "No unbounded growth in active bodies, logs, decals, or constraints over three runs." Constraint count after three load/reset cycles equals the count after one |

### 7.2 Governing GDD sections

**§10.1 Differentiator** — "The cargo box is a real collision-enabled space with floor,
walls, roof, ramp, door, and anchor points. Nothing teleports into storage. Packing is
cooperative 3D Tetris with meaningful volume, mass distribution, protection, access order,
and restraint."

**§10.2 Cargo Rules** — all seven, verbatim:
- "Required objects count as loaded only after crossing the cargo threshold and settling
  inside the closed volume."
- "Support contacts and friction determine stacks; general furniture does not snap to a grid."
- "Heavy-low, fragile-protected, stable-base, and unload-order strategies emerge from
  consequences."
- "Players may ride in cargo when lobby and contract settings permit."
- "A closed door contains objects but does not prevent movement or damage."
- "Tools share volume with customer cargo."
- "The system tracks which trip moved each item."

**§10.3 Straps** — transcribed exactly:

> "A strap connects two eligible endpoints: cargo-to-anchor in the prototype and potentially
> cargo-to-cargo later. The player selects endpoint A, aims or walks to endpoint B, confirms,
> and tensions. Render the line, anchor validity, tension, and overload risk."

| Strap state | Meaning | Feedback |
|---|---|---|
| Slack | Length exceeds separation; little restraint | Sagging line, gray state |
| Tensioned | Useful restraint within rating | Straight line, teal state, ratchet clicks |
| Overstressed | Force approaches rating | Orange/red pulse, creak, vibration |
| Failed | Anchor, strap, or surface gives way | Snap sound and released cargo |

**§10.4 Pack Quality** — the constraint that governs Phase 8's scoring too:

> "Outcomes derive from physical contacts, velocity, damage, and constraints during
> transport. A heuristic may estimate unsecured mass and imbalance for warnings and scoring,
> but it must not secretly damage items without a physical cause."

**§10.5 Cargo Optimization** — "Stable sleeping cargo may use a lower-cost simulation mode
after the door closes." / "Wake objects near players, under high acceleration, after
collision, or when straps change." / "Never freeze cargo so completely that the drive stops
testing the pack."

**§13.1** — "One small box truck with physical cargo box, rear door, ramp, **4-8 anchors**,
and drivable route." `STRAP.anchorCount` is 6, inside that band.

**§3.4 Contract Phase State Machine** — the two rows Phase 7 owns:

| Phase | Entry | Exit validation |
|---|---|---|
| Pickup | Crew arrives | Required cargo loaded **or crew elects another trip** |
| Secure | Cargo threshold satisfied | Ramp/door closed; **warnings acknowledged** |

"Warnings acknowledged", not "warnings resolved". See trap 7.7.1.

**§7.3 Stability Rules** — "Sleep settled cargo; wake on truck acceleration, collision, grip,
strap change, or relevant impact."

**§26.3 Truck and Cargo** — five acceptance criteria, three of which are Phase 7's:
- "A tensioned strap reduces relative motion and damage."
- "Settled cargo does not explode or jitter indefinitely."
- "Cargo membership and door validation cannot be fooled by an object barely touching the
  threshold."

**§27.2 Physics Test Scenes** — Phase 7 owes two: "Strap angle, tension, overload, and
release matrix" and "Worst-case 25-object pile with players and vehicle motion".

**Working cargo mass**, summed from `definitions.js` at one of each plus 8 boxes:
≈ **580 kg** against `TRUCK.mass` 2600 kg — 22% of vehicle mass, enough to matter in Phase 8.
Heaviest single item `fridge_01` at 110 kg; longest `couch_3seat_01` at 2.10 m; tallest
`wardrobe_01` at 2.00 m.

### 7.3 Existing modules touched

| Path | Change |
|---|---|
| `src/config.js` | Extend `TRUCK` with `cargoBox` and `anchors`; extend `STRAP`; new `CARGO` block |
| `src/physics/world.js` | `GROUPS.VEHICLE`, `GROUPS.SENSOR`; a helper for sensor colliders; expose `impulseJoints` count (already in `stats.constraints`) |
| `src/objects/registry.js` | Move settle literals to config (§0.6); add `state.cargo = { truckId, secured, tripId, membership }`; add sleep/wake hooks per §10.5 |
| `src/game.js` | `state.trips[]`, `state.cargo`, `state.straps` as plain data; `PHASES.SECURE` transition |
| `src/core/eventBus.js` | Emit `CARGO_STATE`, `STRAP_CHANGED`, `ZONE_CHANGED` |
| `src/player/grip.js` | Strap endpoint selection reuses `probe()`; a held object crossing the threshold must not be counted as loaded while held |
| `src/ui/hud.js` | §10.3 "Render the line, anchor validity, tension, and overload risk"; §20.2 "Strap mode provides high-contrast endpoint and tension feedback" |
| `src/render/camera.js` | §4.1 "Indoors it should compress smoothly" now applies inside a 2 m cargo box; `camOcclude` takes the static collider list and will need the truck's moving colliders |
| `src/main.js` | Register `cargo` and `straps` systems after `physics` (they read post-step contacts) |
| `src/dev/debugOverlay.js` | Constraint count, sleeping-body count, unsecured mass, imbalance |

### 7.4 New modules

| Proposed path | One-line responsibility |
|---|---|
| `src/vehicle/truck.js` | Truck body plus the cargo box's floor/wall/roof/door colliders and their shared data record (§8.1's one-record rule applied to the vehicle) |
| `src/vehicle/anchors.js` | Anchor points as data: position, rating, occupancy, validity test for a proposed strap endpoint |
| `src/vehicle/door.js` | Rear door open/closed state; containment without preventing movement or damage (§10.2) |
| `src/cargo/zone.js` | Cargo-volume membership: threshold crossing, containment fraction, dwell, hysteresis; emits `ZONE_CHANGED` and `CARGO_STATE`. **Reuse `containedFraction` / `substantiallyInside` from `src/contract/manifest.js`** — a truck-local zone is the same test in a moving frame, not a second algorithm |
| `src/cargo/straps.js` | Strap lifecycle and the §10.3 four-state machine; owns Rapier joint handles, exposes only serializable state |
| `src/cargo/packQuality.js` | §10.4 heuristic: unsecured mass, COM offset, imbalance. Advisory output only — never applies damage |
| `src/cargo/sleep.js` | §10.5 sleep/wake policy: sleep settled cargo after the door closes, wake on the five listed triggers |
| `src/contract/trips.js` | §10.2 "The system tracks which trip moved each item" — trip ids, per-entity trip stamping |
| `tools/m7-tests.js` | Phase 7 suite |

### 7.5 Config keys

```js
// extends the existing TRUCK block
cargoBox: {
  inner: { length: 3.70, width: 2.00, height: 2.00 },  // fits couch 2.10? NO — see trap 7.7.6
  floorHeight: 1.20,          // = PLATFORM.y; the ramp already rises exactly this far
  wallThickness: 0.06,
  doorClear: { width: 1.90, height: 1.95 },
  thresholdInsetM: 0.15,      // where the membership plane sits, inside the door line
},
anchors: [                    // STRAP.anchorCount = 6, inside §13.1's "4-8"
  // {id, x, y, z, ratingNewtons} — stable string ids, never array position
],

export const CARGO = Object.freeze({
  containmentFraction: 0.60,  // §26.3: cannot be fooled by "barely touching the threshold".
                              //  Same number as MANIFEST.containedFraction — consider reusing
                              //  it outright rather than declaring a second 0.6
  membershipHysteresisM: 0.10,// enter at 0.60, leave at 0.60 - this, so it cannot oscillate
  // settle thresholds are NOT redeclared here: registry.js owns the single definition
  // (§29.2). Phase 7 lifts its literals into a new SETTLE block — see §9.5.
  settleDwellMs: 800,         // §12.3 "settled below velocity thresholds for a dwell time"
  heldCountsAsLoaded: false,  // §10.2: loaded means settled INSIDE, not held inside
  sleepAfterMs: 5000,         // §10.5, after door close
  wake: {
    accelG: 0.25,             // §7.3 "wake on truck acceleration"
    impulse: 3.0,             //   "...collision"
    playerRadiusM: 1.5,       //   "wake objects near players"
  },
  volumeUtilisationTarget: 0.72, // the pack that makes one trip possible; see 7.1
  riderAllowed: true,         // §10.2 "Players may ride in cargo when...settings permit"
});

// extends the existing STRAP block
endpointSelectRange: 3.0,
slackEpsilonM: 0.02,          // separation below rest length counts as slack
tensionRateNPerSecond: 900,   // ratchet speed; §10.3 "confirms, and tensions"
maxPerAnchor: 2,
releaseSeconds: 0.6,
anchorRatingNewtons: 4200,    // §10.3 "Anchor, strap, or surface gives way" — three failure
surfaceRatingNewtons: 2800,   //   sites, three ratings. Currently only the strap has one
cargoToCargoEnabled: false,   // §10.3 "potentially cargo-to-cargo LATER"
```

### 7.6 Test assertions (`tools/m7-tests.js`)

1. With the door closed and no player within `CARGO.wake.playerRadiusM`, every cargo body
   reports `isSleeping() === true` within 300 steps.
2. Over the following 3600 steps, max positional drift of any cargo entity is ≤ 0.02 m and
   max rotational drift ≤ 0.02 rad.
3. `physics.stats.constraints` after three load → reset → load cycles equals the count after
   the first cycle (§26.6 unbounded-growth check).
4. An entity placed so its AABB overlaps the threshold plane by 0.59 of its volume is not
   counted as loaded; at 0.61 it is; sweeping it slowly back and forth across the boundary
   produces at most one `ZONE_CHANGED` per direction, never a stream (hysteresis).
5. A **held** object fully inside the cargo box is not counted as loaded
   (`CARGO.heldCountsAsLoaded === false`); it becomes loaded only after release + settle +
   `settleDwellMs`.
6. A strap between a cargo entity and an anchor reports `state === 'slack'` when separation
   < rest length − `slackEpsilonM`, and `'tensioned'` above it; the transition is monotonic
   in separation.
7. Reported strap tension is derived from the joint's constraint impulse divided by the
   timestep, and equals the analytically expected value for a static hanging test mass to
   within 5%.
8. A strap driven past `STRAP.ratingNewtons` (3400 N) reports `'overstressed'`; past
   `STRAP.failureNewtons` (5200 N) it reports `'failed'`, the joint is removed, and exactly
   one `STRAP_CHANGED` with `state: 'failed'` is emitted (idempotent — not one per step).
9. Under an identical scripted 400 N·s lateral impulse, a 3-item stack strapped to two
   anchors shows peak displacement ≤ 30% of the same stack unstrapped, same seed.
10. `packQuality` never writes to `entity.state.condition` and never emits `DAMAGE_APPLIED`
    (§10.4). Assert by spying on the bus during a full deliberately-terrible pack.
11. Closing the rear door with unsecured mass above the warning threshold emits a warning,
    sets an acknowledged flag when the player confirms, and **still** permits the
    `SECURE → TRANSIT` transition (§3.4, §2.1).
12. The full §13.2 manifest plus the four Phase 6 tools has a summed bounding volume greater
    than `cargoBox.inner` volume × `CARGO.volumeUtilisationTarget`, so one trip is not
    trivially achievable.
13. A `couch_3seat_01` loaded on trip 1 carries `state.cargo.tripId === 1` through unloading
    and into the manifest record; a second trip stamps 2 and does not overwrite the first
    (§10.2's last rule).
14. A mover standing inside the closed cargo box is a valid state: no forced ejection, no
    phase block, and the mover's `locomotion` is not overridden (§10.2 riders).
15. Full `game.state` remains JSON-round-trippable with six straps live and 20 entities
    loaded — no joint handles, no bodies, no functions.

### 7.7 Traps and risks

**7.7.1 §3.4's Secure exit is "warnings acknowledged", not "cargo secured" (§2.1, §2.2).**
The obvious implementation blocks departure until a strap count or an unsecured-mass
threshold is met. That is a hard denial, and it deletes the entire point of Phase 8 — a badly
secured pack *must* be drivable, because "poor pack shifts or damages visibly" is the next
gate. Warn loudly, telegraph the risk (§18.1 "escalate through wobble → warning → failure"),
and let them drive.

**7.7.2 §10.4 forbids the shortcut that will be most tempting in Phase 8.** "A heuristic may
estimate unsecured mass and imbalance for warnings and scoring, but it **must not secretly
damage items without a physical cause**." When the drive proves hard to make legible,
applying a scripted condition loss proportional to a pack-quality score will look identical
on the invoice and is explicitly forbidden. `packQuality` must be write-free with respect to
condition. Assertion 10 exists to keep it that way.

**7.7.3 `cargoHints` are tutorial cues, not placement rules (§7.1, §10.2).** The Phase 5 data
now carries a rich vocabulary — `heavy-low`, `top-only`, `no-stack-on`, `nest`, `lay-flat`,
`upright-only`, `strap`, `flat-against-wall`, `blanket`. §7.1 calls them "optional tutorial
cues"; §10.2 says "general furniture does not snap to a grid" and that the good strategies
"emerge from consequences". Any code that refuses a placement, snaps an orientation, or
scores a pack directly off a hint contradicts both. Hints drive HUD text and nothing else.

**7.7.4 `STRAP.stiffness` and `STRAP.ratingNewtons` are mutually inconsistent as declared.**
At 2600 N/m, reaching the 3400 N "overstressed" state requires **1.308 m** of stretch, and
failure at 5200 N requires **2.000 m** — on a strap whose `maxLength` is 4.5 m and which will
typically span a 2.0 m cargo box. That is a 29–44% extension before the state machine reports
anything, which no ratchet strap does and which will read on screen as a rubber band. Two
viable fixes: (a) raise stiffness by 1–2 orders of magnitude (a 468 N restraint load on a
90 kg couch at `TRUCK.brakeForce` 5.2 then stretches ~5 mm at 100 kN/m); or (b) model the
strap as an inextensible distance limit and derive the reported tension from the constraint
impulse, which assertion 7 already requires. Prefer (b); keep `stiffness`/`damping` for the
slack-to-taut approach only.

**7.7.5 The rating may be unreachable in the prototype even after 7.7.4.** Whole-pack mass is
≈580 kg; at `TRUCK.brakeForce` 5.2 the total longitudinal demand is **3016 N**, spread over
several straps. A single strap only reaches 3400 N if it restrains ≥654 kg alone. So §10.3's
`Overstressed` and `Failed` states risk being dead code — the two most interesting rows of
the table never firing. Either lower `ratingNewtons`, or ensure §11.3's speed bump is an
*impulse* whose peak force is far above the steady-state figure (see Phase 8 config
`ROUTE.bumpDurationMs`), or both. Assert that at least one authored route event drives at
least one strap into `overstressed` on a deliberately bad pack.

**7.7.6 The declared cargo box may not fit the couch.** `couch_3seat_01` is 2.10 m on its
longest axis. A [PROPOSED] inner width of 2.00 m means the couch cannot lie across the box —
only along it, or diagonally. That is a legitimate design choice (it forces a decision) but
it must be deliberate and asserted, not discovered. Also check `wardrobe_01` at 2.00 m tall
against `cargoBox.inner.height` and `doorClear.height` (1.95 m [PROPOSED]) — as written the
wardrobe does **not** fit through its own cargo door upright, which is either the best
puzzle in the level or a bug, depending on whether anyone decided it.

**7.7.7 §10.5's optimization is one line away from killing Phase 8's gate.** "Never freeze
cargo so completely that the drive stops testing the pack." A sleep policy that puts
everything to sleep on door-close and only wakes on collision will produce a perfectly stable
drive and a false pass. The wake triggers in `CARGO.wake` must include truck acceleration
(§7.3's list), and Phase 8's suite must assert that cargo is awake during each road event.

**7.7.8 Sensors, not solid colliders, for the threshold.** A solid threshold plane will be
stood on, bumped into and stacked against. Use `GROUPS.SENSOR` with a zero filter.

**7.7.9 Straps create Rapier joints — house rule 2.** `state.straps` holds
`{id, entityId, anchorId, restLength, tension, state, actorId}` and nothing else. Handles
live in `src/cargo/straps.js`. `game.reset()` must remove joints, not just forget them
(§26.6: "Reset removes transient straps…").

---

## Phase 8 — Drive

> **Gate (§25.2), quoted:** "Poor pack shifts or damages visibly"
> **Build outcome (§25.2), quoted:** "Route, turn/brake/bump, cargo coupling"

### 8.1 What must be MEASURED to prove the gate

The gate is comparative, not absolute — it names a *contrast* between packs. §26.3 states the
required experiment directly: "Three different pack arrangements yield observably different
turn, brake, and bump results." So the measurement is a three-arm trial on one seed and one
route.

| Arm | Pack | Expected |
|---|---|---|
| A — good | Heavy low, fragile high and blanketed, ≥4 straps, COM within `TRUCK.comToleranceM` of the box centre | Total cargo displacement over the route ≤ 0.15 m; zero `DAMAGE_APPLIED` above the `scratched` band |
| B — mediocre | Heavy low, 1 strap | Displacement 0.3–1.0 m; at least one `scratched` event |
| C — poor | Heavy high, tall items unstrapped, `fridge_01` upright and free | Displacement > 1.0 m; at least one `cracked`-or-worse event; at least one visible topple |

**Binary claims:**
1. Sum of cargo displacement over the route is strictly ordered A < B < C, with each gap
   ≥ 2× — not merely different, *separably* different.
2. Total item-damage cost is strictly ordered A < B < C.
3. Every damage event in arm C traces to a logged `IMPACT` with a contact point and impulse
   (§10.4: no damage without a physical cause; §8.4: "player attribution when reliable").
4. Cargo bodies are awake during each of the three road events (defeats trap 7.7.7).
5. §11.2: "Poor balance modestly affects steering and braking without becoming a punishing
   simulator." Steering authority in arm C is reduced by at most
   `TRUCK.imbalanceSteerPenaltyMax` = **0.18** (18%), and arm C completes the route.

### 8.2 Governing GDD sections

**§11.1 Role** — "Driving is the final exam for packing, not a racing minigame. Prototype
travel lasts roughly **one to three minutes**; production routes generally last two to five.
Controls are forgiving and the road provides a few meaningful force events."

At `TRUCK.maxSpeed` 13.5 m/s, a 2-minute route is ≈1.6 km. That sets `ROUTE.lengthKm` and
therefore the fuel line: `ECONOMY.fuelPerKm` 3.2 × 1.6 = **$5.12**. See trap 8.7.6.

**§11.2 Box Truck Behavior** — five rules, verbatim:
- "Arcade-accessible steering with readable body roll, braking distance, and wide turns."
- "Acceleration, braking, cornering, grade, bumps, and collisions affect cargo."
- "Poor balance modestly affects steering and braking without becoming a punishing simulator."
- "Cab seats are safe. Cargo riding and exterior clinging are optional risky behaviors with
  recovery safeguards."
- "Driver can glance at a coarse cargo-status indicator; perfect information is unnecessary."

**§11.3 Route Hazards** — availability column is binding:

| Hazard | Packing test | Availability |
|---|---|---|
| Hard brake | Forward restraint and stack stability | **Prototype required** |
| Sharp turn | Lateral restraint and tall-item tipping | **Prototype required** |
| Speed bump/pothole | Vertical bounce and protection | **One prototype event** |
| Steep hill | Longitudinal shift and vehicle power | Production |
| Low clearance | Vehicle choice and roof mistakes | Expansion |
| Rain/snow | Traction, braking, exterior handling | Expansion |

Three events, exactly. `TRUCK.roadEvents` already declares `hardBrake {severity 1.0}`,
`sharpTurn {severity 1.0}`, `speedBump {severity 0.8}`.

**§13.3 Prototype Route** — "Use a short contained street or scene transition with a drivable
segment. Include one hard brake, one meaningful turn, and one bump so preparation produces
visible consequences. Exclude traffic AI, open-world navigation, police, fuel management,
weather, and multiple vehicles."

**§10.5 Cargo Optimization** — repeated here because it governs the coupling decision:
"Browser driving may use truck-local simulation or force proxies if full moving-world physics
is unstable." / "Never freeze cargo so completely that the drive stops testing the pack."

**§8.3 Damage Model** — the half Phase 8 must implement:
> "Static surfaces define material, durability, impact threshold, repair category, and
> maximum charge. Contact energy above threshold accumulates damage… Repeated minor contact
> needs cooldown and aggregation so a scrape is priced coherently."
> "Furniture condition uses thresholds such as Perfect → Scratched → Chipped/Cracked →
> Broken/Destroyed. Economic loss should scale with replacement value and actual condition
> change. **A fragile television and a cheap box should not share a generic hit-point
> curve.**"

**§7.3** — "Aggregate repeated scrape contacts into one coherent damage event."
`DAMAGE.aggregationWindowMs` 700, `DAMAGE.aggregationRadius` 0.8 m.

**§18.1 Comedy Rules** — "Escalate through wobble → warning → failure → new problem, allowing
reaction." The cargo indicator (§11.2) is the "warning" stage.

**§4.2 / §4.3** — `CONTEXTS.DRIVE` bindings already exist in `src/core/input.js`:
`throttle`, `brake`, `steerLeft`, `steerRight`, `handbrake`, `horn`, `lookBack`,
`exitVehicle` ("only when stopped"), `cargoGlance`, `resetVehicle` ("only when stuck").

**§20.4 Audio** — "Vehicle | Engine load, suspension, cargo thumps, braking."

**Damage arithmetic against current data — this is the section's biggest problem:**

`DAMAGE.fragility.normal` is `{ impulseThreshold: 5.5, conditionPerImpulse: 1.4 }`, and
condition loss reads as `(impulse − threshold) × rate`. Impulse for a set-down is `m × Δv`:

| Object | mass | Δv at which it leaves the `perfect` band (≥95) | Δv at which it reaches `cracked` (<35) |
|---|---|---|---|
| `box_small_01` | 9 kg | **1.008 m/s** | 5.78 m/s |
| `couch_3seat_01` | 90 kg | **0.101 m/s** | 0.578 m/s |
| `fridge_01` | 110 kg | **0.082 m/s** | 0.473 m/s |

Setting a couch down at a gentle 0.5 m/s yields impulse 45 N·s → (45 − 5.5) × 1.4 = **55.3**
condition points → condition 44.7 → `cracked` → 0.35 × $900 = **$315.00** for one careful
placement. The identical handling of a 9 kg box costs **$0.00**. See trap 8.7.1.

### 8.3 Existing modules touched

| Path | Change |
|---|---|
| `src/config.js` | Extend `TRUCK` (suspension, COM, tolerance); new `ROUTE` block; restructure `DAMAGE` (velocity-normalised) and add `very_fragile`; new `MATERIALS` block for §8.3 static surfaces |
| `src/physics/world.js` | Contact-force event drain currently only *counts* (`_refreshStats` discards payloads). Phase 8 needs the payloads: entities, point, impulse, relative velocity. This is a real change to `_refreshStats` — do not let stats and damage fight over the same `EventQueue` drain |
| `src/objects/registry.js` | Condition mutation; wake on road force; per-entity damage aggregation window |
| `src/objects/definitions.js` | `validateDef` must check `fragility` against the `DAMAGE.fragility` keys |
| `src/core/input.js` | `CONTEXTS.DRIVE` is bound but never activated; `game.setInputContext` exists |
| `src/game.js` | `PHASES.TRANSIT`; `state.route`; `state.vehicle`; damage ledger appends |
| `src/render/camera.js` | Drive camera (§4.1 is written for on-foot); occlusion list must include the moving truck |
| `src/ui/hud.js` | §11.2 "coarse cargo-status indicator"; §21.1 "contextual… vehicle feedback" |
| `src/main.js` | System order: `vehicle` before `physics` (forces accumulate), `damage` after |

### 8.4 New modules

| Proposed path | One-line responsibility |
|---|---|
| `src/vehicle/driving.js` | Throttle/brake/steer → forces on the truck body, with body roll and the §11.2 imbalance penalty |
| `src/vehicle/seats.js` | Enter/exit, cab-seat safety, cargo riders, exterior clinging (§11.2, §10.2) |
| `src/vehicle/route.js` | The authored route as data: waypoints, the three §11.3 event triggers, telegraph timing |
| `src/vehicle/cargoCoupling.js` | How road forces reach cargo — the moving-frame decision (§10.5). One module so it can be swapped wholesale |
| `src/damage/contacts.js` | Drains Rapier contact-force events into `IMPACT` events with entities, point, impulse and relative velocity (§23.3) |
| `src/damage/aggregator.js` | §7.3/§8.3 aggregation: merges contacts within `aggregationWindowMs` / `aggregationRadius` into one coherent `DAMAGE_APPLIED` |
| `src/damage/model.js` | Condition bands, per-fragility curves, blanket attenuation; item damage keyed on Δv, property damage keyed on impulse (§8.3) |
| `src/damage/materials.js` | §8.3 static-surface table: material, durability, impact threshold, repair category, **maximum charge** |
| `src/ui/cargoGlance.js` | §11.2's coarse indicator; deliberately imprecise ("perfect information is unnecessary") |
| `tools/m8-tests.js` | Phase 8 suite |

### 8.5 Config keys

```js
export const ROUTE = Object.freeze({
  lengthKm: 1.6,                 // §11.1 "roughly one to three minutes" at maxSpeed 13.5
  targetSeconds: 120,
  events: [
    // ids are stable strings; positions are fractions along the route
    { id: 'brake_01', type: 'hardBrake', at: 0.30, telegraphSeconds: 2.0 },
    { id: 'turn_01',  type: 'sharpTurn', at: 0.55, telegraphSeconds: 2.5, radiusM: 14 },
    { id: 'bump_01',  type: 'speedBump', at: 0.80, telegraphSeconds: 1.5 },
  ],
  hardBrakeDecel: 5.2,           // = TRUCK.brakeForce; resolve the unit ambiguity (8.7.5)
  sharpTurnLateralG: 0.42,
  bumpImpulseNs: 900,            // vertical, applied to the chassis
  bumpDurationMs: 90,            // SHORT — this is what lets a strap reach its rating (7.7.5)
  collisionFeeThresholdNs: 400,  // below this a scrape is not a "collision" for §15.1
});

// extends TRUCK
comHeight: 0.85,
comToleranceM: 0.35,             // pack COM offset before the imbalance penalty engages
suspensionStiffness: 42000,
suspensionDamping: 3600,
cargoFrame: 'truckLocal',        // 'truckLocal' | 'world' — §10.5's escape hatch
cargoGlanceBuckets: 3,           // §11.2 "coarse"; NOT a numeric readout

// RESTRUCTURED DAMAGE — see trap 8.7.1
fragility: {
  sturdy:       { velocityThreshold: 1.60, conditionPerMps: 34, impulseThreshold: 9.0 },
  normal:       { velocityThreshold: 1.00, conditionPerMps: 55, impulseThreshold: 5.5 },
  fragile:      { velocityThreshold: 0.45, conditionPerMps: 120, impulseThreshold: 2.4 },
  very_fragile: { velocityThreshold: 0.30, conditionPerMps: 180, impulseThreshold: 1.6 },
  extreme:      { velocityThreshold: 0.20, conditionPerMps: 240, impulseThreshold: 1.2 },
},
// velocityThreshold/conditionPerMps price ITEM damage (mass-independent, §8.3's TV-vs-box
// rule). impulseThreshold prices PROPERTY damage, where a heavy object genuinely should
// hurt a wall more. Two drivers, two line items (§15.1).

export const MATERIALS = Object.freeze({
  // §8.3: "material, durability, impact threshold, repair category, and maximum charge"
  drywall:   { impulseThreshold: 40,  costPerUnit: 3.5, repair: 'patch',   maxCharge: 240 },
  hardwood:  { impulseThreshold: 65,  costPerUnit: 4.2, repair: 'refinish',maxCharge: 380 },
  trim:      { impulseThreshold: 30,  costPerUnit: 6.0, repair: 'replace', maxCharge: 160 },
  glass:     { impulseThreshold: 18,  costPerUnit: 22.0,repair: 'replace', maxCharge: 600 },
  railing:   { impulseThreshold: 55,  costPerUnit: 9.0, repair: 'replace', maxCharge: 450 },
});
```

### 8.6 Test assertions (`tools/m8-tests.js`)

1. Three packs A/B/C on one seed and one route produce total cargo displacement strictly
   ordered A < B < C with each gap ≥ 2× (§26.3's "observably different").
2. Total item-damage cost is strictly ordered A < B < C, and arm A's total is $0.
3. Every `DAMAGE_APPLIED` has a preceding `IMPACT` with the same entity within
   `DAMAGE.aggregationWindowMs`; there are zero damage events with no impact (§10.4).
4. Twenty scrape contacts within `aggregationRadius` (0.8 m) and `aggregationWindowMs`
   (700 ms) produce exactly **one** `DAMAGE_APPLIED`, not twenty (§7.3, §8.3).
5. At least one cargo body is awake (`isSleeping() === false`) during each of the three
   `ROAD_FORCE` events (defeats trap 7.7.7).
6. Exactly three `ROAD_FORCE` events fire per route traversal, with types `hardBrake`,
   `sharpTurn`, `speedBump` — matching §11.3's prototype-required set and no more.
7. Arm C's steering authority is reduced by at most `TRUCK.imbalanceSteerPenaltyMax` (0.18)
   relative to arm A, and arm C reaches the destination (§11.2 "without becoming a punishing
   simulator").
8. Setting `couch_3seat_01` down at 0.5 m/s produces condition loss < 5 points under the
   restructured model (it produces 55.3 under the current one — the regression test for
   trap 8.7.1).
9. `tv_55_01` (`very_fragile`, $900) and `box_small_01` (`normal`, $40) subjected to the same
   1.0 m/s contact produce different bands, and the ratio of their costs is ≥ 10× (§8.3's
   "should not share a generic hit-point curve").
10. A blanketed object's effective `velocityThreshold` equals
    `base × TOOLS.blanket.impulseThresholdMult` and its loss rate equals
    `base × TOOLS.blanket.conditionRateMult`; neither multiplier is applied twice per contact.
11. Route traversal at `TRUCK.maxSpeed` takes between 60 and 180 seconds of simulated time
    (§11.1 "roughly one to three minutes").
12. A mover riding in the cargo box during the full route survives, is never force-ejected,
    and their `RECOVERY` count is available for §15.3's stats (§11.2 "recovery safeguards").
13. Every road-event force originates from `ctx.rng`-free deterministic data or a named
    `ROUTE.events` entry; two runs with the same seed produce byte-identical
    `ROAD_FORCE` payload vectors.
14. `physics.stats.contacts` and the damage pipeline do not both drain the same
    `EventQueue` (a regression test: contacts counter is non-zero *and* damage fires in the
    same step).
15. Generic damage never changes `state.phase` and never sets a fail flag (§8.4: "Hard fail
    is never triggered solely by generic damage"; §26.4).

### 8.7 Traps and risks

**8.7.1 The damage model as configured is mass-driven, which is exactly backwards from
§8.3.** `conditionPerImpulse` × `m·Δv` means a heavy object is punished for being heavy.
Measured from the current numbers: the `perfect` band survives a 1.008 m/s set-down for a 9 kg
box and only 0.101 m/s for the 90 kg couch — the couch is **10× more fragile than a box of
glassware** purely because of its mass, and a gentle 0.5 m/s placement bills $315. §8.3's
governing sentence is "a fragile television and a cheap box should not share a generic
hit-point curve"; the current config gives them one curve keyed only on a fragility label,
then scales it by mass. Item damage must be driven by **relative normal velocity**, property
damage by **impulse**. This is the single highest-priority fix in Phase 8 and it must land
before any cost reaches the ledger, or Phase 10's gate inherits a broken input.

**8.7.2 `very_fragile` has no config entry.** `tv_55_01` and `mirror_framed_01` — the two most
expensive breakable items at $900 and $480 — declare a fragility class `DAMAGE.fragility` does
not define. The lookup returns `undefined`, which will either throw or silently mean "no
damage", and `validateDef` does not catch it. Fix both the table and the validator.

**8.7.3 The moving-reference-frame problem is the largest technical risk in these five
phases, and the GDD deliberately leaves it open.** Rapier has no moving frame. Simulating
cargo in world space inside an accelerating truck means the cargo must be held by real
contact with real truck-box colliders that are themselves moving fast — the classic source of
tunnelling, jitter and sleep thrash. §10.5 permits "truck-local simulation or force proxies
if full moving-world physics is unstable", which is permission, not a design.
`TRUCK.cargoFrame` exists so the decision is one config key and one module
(`src/vehicle/cargoCoupling.js`), not a rewrite. Decide it with a measurement, not a
preference: build the §27.2 "Truck brake/turn/bump rig with repeatable layouts" first and
run both.

**8.7.4 A "cannot drive with unsecured cargo" or "cannot drive with a rider" check is a hard
denial (§2.1, §10.2, §11.2).** Both are explicitly permitted behaviours. The consequence is
the point.

**8.7.5 `TRUCK.brakeForce: 5.2` has no unit.** It sits beside `acceleration: 3.4` which is
commented m/s², so 5.2 reads as a deceleration — but the key is named *force*. At 2600 kg a
5.2 N brake is meaningless and a 5.2 m/s² deceleration is a 13.5 → 0 stop in 2.6 s over 17.5 m,
which is plausible for a loaded box truck. Resolve and comment it before any strap or damage
number is derived from it; §7.7.5's whole argument depends on which it is.

**8.7.6 The fuel line is economically invisible.** `ECONOMY.fuelPerKm` 3.2 × `ROUTE.lengthKm`
1.6 = **$5.12**, against labour of $28/minute for two movers. §15.1 lists "vehicle/fuel" as a
real line item and §2.2 says "an extra trip costs fuel and time". At these numbers an extra
trip costs $5 of fuel and several minutes of labour — the fuel term contributes nothing.
Either raise `fuelPerKm`, add a per-trip vehicle charge, or accept that the one-trip incentive
is entirely a labour-and-bonus effect and say so in the config comment.

**8.7.7 `_refreshStats()` currently drains the contact-force event queue to count it, and
discards the payloads.** Rapier's `EventQueue` drain is destructive. If the damage system
drains it separately, whichever runs second gets nothing. One drain, one place, payloads
distributed — and the overlay counter reads from the distributed result.

**8.7.8 §11.3's availability column is a scope fence.** Steep hill is *Production*; low
clearance and weather are *Expansion*. Adding a hill because it is easy in Rapier is content
added while a gate is unproven (§25.1, §2's core philosophy).

---

## Phase 9 — Destination

> **Gate (§25.2), quoted:** "Manifest completes reliably"
> **Build outcome (§25.2), quoted:** "Unload, room zones, settled validation"

### 9.1 What must be MEASURED to prove the gate

"Reliably" means the completion test is deterministic, repeatable across runs, and not
foolable in either direction — no false positives (an item counted that is not really placed)
and, more importantly for §2.1, **no false negatives** (an item genuinely placed that the game
refuses to count).

| Claim | Threshold |
|---|---|
| Deterministic | Three runs of a scripted unload on one seed produce identical per-entity delivered/undelivered results and identical `ZONE_CHANGED` sequences |
| No false negatives | Every entity whose AABB centroid is inside its target zone and whose speed < `SETTLE.speed` (0.08) for `MANIFEST.dwellMs` (1200 ms) is counted, in **every** rotation. Sweep 16 yaw values per item; all 16 must count |
| Not foolable | An entity overlapping the zone by < `MANIFEST.containedFraction` (0.6) is not counted, and a held entity inside the zone is not counted |
| Rotation-free | §12.3: "Standard contracts do not require pixel-perfect rotation." Assert that no delivery test reads yaw, pitch or roll at all |
| Broken items still deliver | §26.4: "Broken required cargo stays deliverable." An entity at condition 0 with `broken` band still counts as delivered when settled in zone |
| Parts count | A `wardrobe_01` delivered with its doors detached counts as delivered only when the parent **and** every detached part are in a valid zone, or the manifest explicitly permits part separation |
| Completion is reachable from any state | From any reachable mid-contract state (items dropped outdoors, in the truck, in the wrong room, broken), a scripted recovery sequence reaches `PHASES.SETTLEMENT` in finite time (§26.4 "A severely unprofitable job can still reach settlement") |

### 9.2 Governing GDD sections

**§12.3 Destination Placement** — verbatim, the whole section:
> "An object counts as delivered when substantially inside the correct room/zone and settled
> below velocity thresholds for a dwell time. Standard contracts do not require pixel-perfect
> rotation. Assembly or exact placement appears only when requested clearly and supported
> mechanically."

**§29.2 Glossary** — "Settled | Valid zone membership below velocity thresholds for a dwell".
The same definition serves cargo membership (Phase 7) and delivery (Phase 9), so one
implementation must serve both — `src/cargo/zone.js` generalised, not duplicated.

**§13.1** — "Destination | One smaller site with **3-4 labeled room zones**."

**§3.4 Phase machine** — the two rows Phase 9 owns:

| Phase | Entry | Exit validation |
|---|---|---|
| Delivery | Cargo door opened | Required items settled in valid destination zones |
| Settlement | Manifest validated | Invoice accepted and progression saved |

Plus: "A phase may return to an earlier phase for an extra trip. The state machine must not
lose damage, time, fees, or manifest status."

**§23.2 Contract Runtime** — the manifest schema:
> "Manifest entries with spawnedEntityId, count, condition requirement, trip,
> destinationZoneId, state."

**§12.1 Contract Definition** — `Manifest | Required objects, destination zones, special
handling`; `Optional goals | Under estimate, one trip, no breakage, **room accuracy**`.

**§15.1** — `Room accuracy | Rewards correct unloading | Required; small perfect bonus`.
`ECONOMY.roomAccuracyBonus` = **90**.

**§21.2 Contract UX** — "Manifest filters by room/category and shows pickup, loaded,
delivered, and condition states."

**§26.4 Damage and Completion** — all five, three of which are Phase 9's:
- "Broken required cargo stays deliverable or becomes trackable pieces."
- "Stuck recovery preserves progress and consequences."
- "A severely unprofitable job can still reach settlement."

**§12.2 Rare Hard Fails** — the complete, exhaustive list. Phase 9 must implement **none** of
them except the first, and that one only under its full conjunction:
> "All required objects are irrecoverably destroyed **and** the contract explicitly requires
> intact delivery."
> "Truck or players leave containment and safe recovery is impossible."
> "A special legal or safety condition explicitly states immediate termination; use sparingly
> and telegraph it."
> "The host ends the session."
> "Otherwise use recovery, partial completion, extra cost, negative profit, or a humiliating
> review."

**§18.3 Recovery** — "Track a last-stable transform for players, critical cargo, tools, and
vehicle… Release unsafe constraints, preserve damage, place at a designated node, and apply
a documented fee where appropriate." `RECOVERY.outOfBoundsGraceSeconds` 4,
`noProgressGraceSeconds` 12, `ECONOMY.recoveryFee` 45.

**§27.1 Automated Tests** — "Settled detection, cargo threshold, strap endpoints, and
recovery eligibility." / "Contract phase transitions and reset idempotence."

### 9.3 Existing modules touched

**Phase 5 already built most of this.** The work is extension, not creation.

| Path | Status | Change |
|---|---|---|
| `src/world/house.js` | **exists** | `ZONES` has 5 entries, all `site: 'pickup'`. Add 3–4 `site: 'destination'` zones (§13.1). `zoneAt`, `zoneById`, `overlappingZones` already generalise over a zone list — pass the destination set, do not fork them |
| `src/contract/manifest.js` | **exists** | `substantiallyInside` already implements §12.3 correctly and already ignores rotation. `stepManifest` already reuses `e.state.settled` rather than re-deriving it. Add: sticky delivered (trap 9.7.3), `ZONE_CHANGED` emission, part accompaniment, wrong-room recording |
| `src/config.js` | **exists** | Extend `MANIFEST` — do **not** add a parallel `DELIVERY` block. `containedFraction: 0.6` and `dwellMs: 1200` are already the §12.3 numbers |
| `src/objects/registry.js` | exists | Settle literals → config (§0.6); `state.deliveredAtMs` |
| `src/game.js` | exists | `state.manifest` is populated by `buildManifest` at boot. Add real validation predicates to the `PHASES.DELIVERY` → `PHASES.SETTLEMENT` transition (`setPhase` already accepts one) |
| `src/render/scene.js` | exists | Destination site geometry, generated from the destination `ZONES` + `PARTITIONS` records the way the house already is (§8.1) |
| `src/main.js` | exists | `stepManifest` is already wired; add the destination-site build and the phase transitions |
| `src/ui/hud.js` | exists | §21.1 "compact objective count at screen edge"; `manifestSummary()` already returns the plain data for it |
| `src/core/eventBus.js` | exists | `ZONE_CHANGED` is declared and never emitted — Phase 9 is where that changes |

### 9.4 New modules

Four only. `manifest.js` and the zone system are not on this list because they exist.

| Proposed path | One-line responsibility |
|---|---|
| `src/world/destination.js` | Destination site as data, in the `house.js` shape: rooms, 3–4 labelled zones, partitions, doors. Same shared-record discipline (§8.1) |
| `src/contract/definition.js` | The §12.1 contract as data: identity, sites, manifest, economy, constraints, hazards, optional goals, flavor — so a second contract is data, not code |
| `src/contract/phases.js` | §3.4 state machine with per-transition validation predicates and the "may return to an earlier phase for an extra trip" rule |
| `src/contract/recovery.js` | §18.3 recovery for cargo, tools and vehicle (players have it in `controller.js`, objects in `registry.js`); designated nodes, preserved damage, documented fee |
| `src/ui/manifestPanel.js` | §21.2 manifest filtered by room/category with pickup/loaded/delivered/condition states; renders `manifestSummary()` output only |
| `tools/m9-tests.js` | Phase 9 suite |

### 9.5 Config keys

**Extend `MANIFEST`. Do not create a `DELIVERY` block** — `containedFraction` and `dwellMs`
already exist there and are already the §12.3 numbers.

```js
// EXTENDS the existing MANIFEST block (containedFraction: 0.6, dwellMs: 1200 stay as they are)
deliveredIsSticky: true,         // trap 9.7.3 — earned delivery survives a nudge
undeliverExitFraction: 0.35,     // ...but is lost if containment falls below this (hysteresis
                                 //  against MANIFEST.containedFraction 0.6)
useRotation: false,              // §12.3 "do not require pixel-perfect rotation". A switch
                                 //  that must stay false for standard contracts; asserted
wrongRoomStillCompletes: true,   // §2.1, §15.1 — room accuracy is a BONUS, not a gate (9.7.1)
brokenStillDeliverable: true,    // §26.4 "Broken required cargo stays deliverable"
partsMustAccompanyParent: true,  // §7.4 "every broken state must remain completable"

export const SETTLE = Object.freeze({
  // Lifted out of registry.js (§0.6). ONE definition, per §29.2 — cargo membership (Phase 7)
  // and delivery (Phase 9) both route through registry.step()'s `e.state.settled`.
  speed: 0.08,                   // m/s
  spin: 0.15,                    // rad/s
});

// extends RECOVERY
lastStableMinY: -1,
boundsXZ: 120,

// extends RECOVERY
destinationNodes: [ /* {id, x, y, z} per site — §18.3 "place at a designated node" */ ],
cargoNoProgressGraceSeconds: 20,   // longer than the player's 12; cargo is often parked
feeAppliesTo: ['vehicle', 'cargo'],// §18.3 "a documented fee where appropriate" — not tools
```

### 9.6 Test assertions (`tools/m9-tests.js`)

1. A `couch_3seat_01` placed centroid-inside its destination zone and left for
   `MANIFEST.dwellMs` (1200 ms = 72 steps) is delivered; the same couch at all 16 sampled yaw
   values is also delivered (rotation independence, §12.3).
2. `src/contract/manifest.js` contains no reference to `rotation`, `quaternion`, `yaw`, `pitch`
   or `roll` while `MANIFEST.useRotation === false` (grep assertion; currently true and must
   stay true).
3. `containedFraction()` returning 0.59 does not deliver; 0.61 does (`MANIFEST.containedFraction`
   0.6); once delivered, containment must fall below `MANIFEST.undeliverExitFraction` (0.35)
   before the flag clears, and repeated nudging across 0.6 produces no oscillation.
4. A **held** entity fully inside its zone is not delivered — this already holds because
   `registry.step()` sets `settled = !held && …`; assert it rather than reimplementing it.
   Releasing and waiting `dwellMs` delivers it.
5. An entity at condition 0 (`broken` band) settled in its zone **is** delivered
   (§26.4). Assert `state.delivered === true` and that the manifest entry records the band.
6. `wardrobe_01` delivered with detached doors is not marked complete until the doors are
   also in a valid zone, and the manifest shows the parts as separate outstanding lines.
7. An entity delivered to the **wrong** room is marked delivered-but-misplaced: the contract
   can still reach `PHASES.SETTLEMENT`, and only `ECONOMY.roomAccuracyBonus` (90) is
   forfeited (§2.1, §15.1).
8. Three runs of one scripted unload on one seed produce identical delivered sets and
   identical `ZONE_CHANGED` sequences (determinism).
9. Returning `DELIVERY → PICKUP` for a second trip preserves `elapsedWorkMs`,
   `state.ledger` contents, every entity's `condition`, and every delivered flag (§3.4 "The
   state machine must not lose damage, time, fees, or manifest status").
10. `game.reset()` followed by a full scripted contract produces the same final manifest as
    the first run (§27.1 "reset idempotence").
11. From a state with every required object dropped outside the destination site, a scripted
    recovery sequence reaches `PHASES.SETTLEMENT` within a bounded number of steps and adds
    exactly one `ECONOMY.recoveryFee` (45) per `RECOVERY` event (§26.4, §18.3).
12. No code path sets a fail state for any reason other than §12.2's four conditions; assert
    by grepping for fail/abort transitions and enumerating their guards.
13. Destination zone count is 3 or 4 (§13.1), `overlappingZones()` returns empty for the
    destination set, every zone has a unique stable string id and a human-readable label, and
    every manifest row's `toZone` resolves via `zoneById`.
14. The number of `ZONE_CHANGED` events over a full contract is bounded by
    2 × entities × (trips + 1) — no per-step streams. (Delivery is polled today and emits
    nothing; this assertion is what forces the event to exist for Phase 10.)
15. Cargo membership (Phase 7) and delivery (Phase 9) both read `entity.state.settled` set by
    `registry.step()` from `SETTLE.speed` / `SETTLE.spin` — one definition, per §29.2. Assert
    that no second speed/spin threshold exists anywhere in `src/` (grep for the literals).

### 9.7 Traps and risks

**9.7.1 §3.4 and §2.1 contradict each other on room accuracy, and the spec must pick.**
§3.4's Delivery exit validation is "Required items settled in **valid** destination zones",
which reads as a gate: wrong room, no exit. §15.1 lists `Room accuracy` as a scored line item
with a "small perfect bonus", which reads as a price. §2.1 says the game should rarely say no
and §12.2 restricts hard fails to four named conditions, none of which is "put the lamp in
the wrong room". **Resolution taken here:** an object in *any* destination zone satisfies
delivery; the *correct* zone earns `ECONOMY.roomAccuracyBonus`. `MANIFEST.wrongRoomStillCompletes`
makes this explicit and reversible. Flag it to the designer — it is a product decision, not an
implementation detail.

**9.7.2 "Settled" has exactly one implementation today — protect it.** §29.2 defines it once;
`registry.step()` owns it, and `stepManifest` deliberately reuses `e.state.settled` with the
comment "not a second one". Phase 7's cargo membership must do the same. The risk is that a
cargo box inside a moving truck wants a *different* settle test (relative to the truck, not
the world), and the tempting fix is a second threshold pair. If truck-local settling is
needed, change the frame the velocity is measured in — do not fork the thresholds. Two
definitions with drifting numbers is the most likely source of "the manifest says it isn't
delivered but it obviously is", which is a false negative, the failure mode §2.1 cares most
about.

**9.7.3 `row.delivered` is currently not sticky, and that will read as the game withholding
credit.** `stepManifest` recomputes `dwellMs` and `delivered` every step: any nudge that
breaks containment or settle resets the dwell to zero and un-delivers the item. A player
tidying the last couch into place will watch the objective count go 15 → 14. `MANIFEST.deliveredIsSticky`
plus an exit hysteresis (`undeliverExitFraction` 0.35 against the 0.6 entry) fixes it. The
held case needs no work — `settled` already excludes held objects.

**9.7.3b Delivery is polled, not evented, and Phase 10's gate needs events.** `ZONE_CHANGED`
is declared in `eventBus.js` and emitted nowhere. "Ledger matches events" (Phase 10) cannot
reconcile a room-accuracy bonus against an event stream that does not exist. Emit
`ZONE_CHANGED` on the delivered edge — on the *edge*, not every step, or the 256-entry
bounded log will be nothing but zone spam (see trap 10.7.2).

**9.7.4 Detached parts can strand a contract (§7.4, §9.1's "loose pieces get lost").** If a
wardrobe door falls out of the truck en route and lands out of bounds, and delivery requires
all parts, the contract becomes uncompletable — a hard fail arriving by the back door, which
§12.2 forbids. `RECOVERY` must cover parts, and the manifest must surface a missing part as an
actionable line with a recovery affordance, not a silent blocker.

**9.7.5 The dwell timer plus `reValidateIntervalMs` can drop a delivery.** Checking
containment every 250 ms while requiring 1500 ms of continuous settle means six consecutive
samples; one bad sample (a passing mover's nudge) resets it. Use a continuous timer that
decays rather than resets, or the last item of a contract will feel broken.

**9.7.6 Second-site loading must not lose Phase 7/8 state.** §3.4: "The state machine must not
lose damage, time, fees, or manifest status." A scene transition that tears down and rebuilds
`ObjectRegistry` is the obvious implementation and the obvious way to lose all of it. Phase 5
already chose the cheap answer for us: `ZONES` entries carry a `site` field, so both sites can
coexist in one world offset along an axis, and §13.3 explicitly allows "a short contained
street or scene transition". Keep one world. If a real transition is ever needed, restore
through `registry.snapshot()` — never rebuild.

**9.7.7 §12.3's last sentence is a scope fence.** "Assembly or exact placement appears only
when requested clearly and supported mechanically." No assembly in Phase 9 unless a contract
asks for it and the mechanism exists.

---

## Phase 10 — Economy

> **Gate (§25.2), quoted:** "Ledger matches events"
> **Build outcome (§25.2), quoted:** "Time, damage, bonuses, invoice, review"

### 10.1 What must be MEASURED to prove the gate

"Ledger matches events" is the most precisely testable gate in the roadmap, and it is an
*equality*, not a feel. Three independent computations of the same invoice must agree.

| Claim | Threshold |
|---|---|
| Conservation | For every category c, `sum(state.ledger[c])` equals the sum of the corresponding fields across all emitted events of that category, to within $0.005 |
| Replayability | Recomputing the invoice by replaying the event log from scratch yields totals identical to the live-accumulated ledger, field by field |
| Idempotence | §14.2: "Damage and invoice events are host-authored and **idempotent**." Applying the same event id twice changes no total |
| Completeness | Every one of §15.1's nine formula terms has a ledger category, and every ledger line belongs to exactly one term. No line is uncategorised, no term is unsourced |
| Attribution | §8.4: "player attribution when reliable." Every item-damage line either names a `playerId` or explicitly records `attribution: null` — never a wrong guess |
| Reachability | A contract with negative profit reaches `PHASES.SETTLEMENT` and produces a complete invoice (§15.2, §26.4) |
| Boundaries | §27.1: "Invoice fixtures including negative profit and overtime boundaries." At exactly `estimateSeconds`, overtime is $0.00; one step later it is non-zero and continuous |

### 10.2 Governing GDD sections

**§15.1 Invoice Formula** — transcribed exactly:

> "Profit = base contract + bonuses + tips − labor time − overtime − vehicle/fuel − property
> damage − item damage − violations − recovery/service fees."

> "Reputation is separate and uses timeliness, completion, damage ratio, special constraints,
> and customer tolerance."

| Line item | Purpose | Prototype behavior |
|---|---|---|
| Base contract | Rewards completion and scope | Fixed value |
| Efficiency bonus | Rewards finishing under estimate | Graduated; no hard cutoff |
| One-trip bonus | Rewards packing skill | Awarded if all required cargo moved once |
| Room accuracy | Rewards correct unloading | Required; small perfect bonus |
| Property damage | Prices wall/window/fixture harm | Immediate ticker and itemization |
| Furniture damage | Prices condition loss by value | Condition bands and break state |
| Labor/overtime | Makes time economically meaningful | Per-minute cost and overtime multiplier |
| Traffic/vehicle | Prices route mistakes | Collision fee and optional violations |

**§15.2 Grade and Customer Review** — verbatim:
> "The letter grade summarizes the invoice but never hides it. Use profit margin, delivered
> completeness, damage ratio, and constraints rather than speed alone. **Negative profit
> still completes the job.**"
> "Customer reviews assemble from actual event tags, outcome, and customer personality.
> Example tags include `front_door_removed`, `mover_in_refrigerator`, `piano_safe`,
> `stairs_destroyed`, `extra_trip`, and `cargo_rider`. Use curated templates for control and
> localization. **Select only the two or three most salient events.**"

**§15.3 Contribution Statistics** — "distance carried, heavy-object assist time, straps
placed, items delivered, damage involvement, falls, recoveries, and unusual achievements.
Avoid rewarding selfish handling or deliberate damage."

**§8.4 Damage Feedback and Ledger** — verbatim:
> "At impact: material sound, visual mark, optional haptic pulse, and one small cost notice."
> "During work: optional running damage total and manifest condition icons."
> "At invoice: object/location, category, condition change, repair or replacement cost, and
> player attribution when reliable."
> "Attribution exists for humor and learning; shared company result remains primary."
> "**Hard fail is never triggered solely by generic damage.**"

**§2.3 Time Is Money** — "Contracts use estimates, cost thresholds, and customer expectations
instead of aggressive universal countdowns… **Crossing an estimate triggers a warning, not
automatic failure.** This keeps pressure while allowing players to spend several hilarious
minutes trying a terrible idea."

**§2.2 Failure Becomes State** — "Overtime increases labor and vehicle cost; work continues."
/ "An extra trip costs fuel and time; work continues." / "A traffic violation costs money; the
route continues." / "**The general economic failure is the company lost money on the job, not
an arbitrary full-screen reset.**"

**§8.3** — "Economic loss should scale with replacement value and actual condition change."

**§23.2** — "Property and item damage ledgers, fees, bonuses, event log, recovery count."
`src/game.js` already has `ledger: { propertyDamage: [], itemDamage: [], fees: [], bonuses: [] }`
and `recoveryCount`.

**§23.4 Save Data** — "Prototype save: settings, best invoice, cash, reputation, and unlock
stub."

**§21.2** — "Invoice animates major lines, then exposes a complete static breakdown."
**§26.1** — "Invoice reports payout, time cost, property damage, furniture damage, trips, and
bonuses accurately."
**§27.1** — "Invoice fixtures including negative profit and overtime boundaries."

**Worked arithmetic from the current `ECONOMY` block, 2 movers, 18-minute estimate**
(`game.js` sets `estimateMs = 18 * 60 * 1000`, inside §3.2's intro band of 12–20 minutes):

| Quantity | Computation | Value |
|---|---|---|
| Labour rate | `labourPerMinutePerMover` 14 × 2 movers | **$28.00 / min** |
| Labour at estimate | 28 × 18 | **$504.00** |
| Overtime rate | 28 × `overtimeMultiplier` 1.6 | **$44.80 / min** |
| Labour at 24 min | 504 + 6 × 44.80 | **$772.80** |
| Fuel, 1.6 km route | `fuelPerKm` 3.2 × 1.6 | **$5.12** |
| Maximum bonuses | 260 + 180 + 90 | **$530.00** |
| One broken couch | `costFraction` 1.00 × `replacementValue` 900 | **$900.00** |
| One broken TV | 1.00 × 900 | **$900.00** |
| One broken fridge | 1.00 × 1250 | **$1250.00** |
| One scratched couch | 0.08 × 900 | **$72.00** |
| One cracked couch | 0.35 × 900 | **$315.00** |
| Total replacement value of the §13.2 manifest | summed from `definitions.js` | **≈ $5,800** |

**Base contract is not in `ECONOMY`.** Neither are tips, violations, or damage liability.
Three of §15.1's nine terms have no config home. See trap 10.7.1.

### 10.3 Existing modules touched

| Path | Change |
|---|---|
| `src/config.js` | Extend `ECONOMY` heavily (§10.5); new `REPUTATION` and `REVIEW` blocks |
| `src/game.js` | `state.ledger` gains `violations` and `tips`; `elapsedWorkMs` already accrues from sim time inside the step callback, which is correct for §2.3 — do not move it |
| `src/core/eventBus.js` | The 256-entry bounded log is a diagnostic tail, **not** the invoice source. The ledger accumulates as events fire (already noted in the module header). Phase 10 must honour that or lose lines on a long contract |
| `src/objects/registry.js` | Condition band lookups feed `costFraction` |
| `src/damage/model.js` | Emits the cost with the damage, so the ledger never recomputes it |
| `src/contract/manifest.js` | Delivered completeness and room accuracy feed bonuses |
| `src/ui/hud.js` | §21.1 "optional elapsed time, running cost, damage total"; §8.4 "one small cost notice" at impact |
| `src/main.js` | Register `economy` last in the step order; `PHASES.SETTLEMENT` |

### 10.4 New modules

| Proposed path | One-line responsibility |
|---|---|
| `src/economy/ledger.js` | Append-only, idempotent line-item store keyed by event id; the single writer for every §15.1 term |
| `src/economy/invoice.js` | Evaluates §15.1's formula over the ledger and produces the itemised breakdown |
| `src/economy/time.js` | Labour and overtime accrual from `elapsedWorkMs`, estimate crossing, and the §2.3 warning |
| `src/economy/bonuses.js` | Efficiency (graduated), one-trip, room accuracy — computed from manifest and trip state, never from a heuristic |
| `src/economy/reputation.js` | §15.1's separate reputation channel and §15.2's letter grade |
| `src/economy/review.js` | Event-tag collection and curated-template selection, capped at `REVIEW.maxTags` (2–3 per §15.2) |
| `src/economy/stats.js` | §15.3 contribution statistics per `playerId` |
| `src/economy/save.js` | §23.4 prototype save: settings, best invoice, cash, reputation, unlock stub, with a version field |
| `src/ui/invoicePanel.js` | §21.2 "animates major lines, then exposes a complete static breakdown" |
| `tools/m10-tests.js` | Phase 10 suite |

### 10.5 Config keys

```js
// EXTENDS the existing ECONOMY block. The three missing §15.1 terms come first.
baseContract: 1450,            // MISSING TODAY. Must exceed labour at estimate ($504) plus
                               //  expected damage, or a clean job cannot profit (trap 10.7.1)
tipMax: 120,                   // §15.1's "+ tips" — no config home today
tipThresholds: { damageRatioUnder: 0.02, deliveredCompleteness: 1.0 },
violationFeeBase: 75,          // §15.1's "− violations" — no config home today
damageLiabilityFraction: 1.0,  // §12.1's "damage liability"; 1.0 = full replacement cost

estimateSeconds: 1080,         // 18 min; currently a literal in game.js createInitialState
overtimeGraceSeconds: 0,       // §2.3 warning at the estimate; charge starts immediately
efficiencyCurveExponent: 1.0,  // §15.1 "Graduated; no hard cutoff" — linear taper to zero
                               //  at the estimate, NOT a step
efficiencyFloorSeconds: 300,   // below this the bonus saturates at efficiencyBonusMax

roundingCents: 1,              // one place where money is rounded, so three computations agree
currencySymbol: '$',

grade: {                       // §15.2: profit margin, completeness, damage ratio, constraints
  weights: { profitMargin: 0.40, completeness: 0.30, damageRatio: 0.20, constraints: 0.10 },
  cuts: { A: 0.85, B: 0.70, C: 0.55, D: 0.40 },   // below D is F; F still completes
},

export const REPUTATION = Object.freeze({
  // §15.1: "timeliness, completion, damage ratio, special constraints, customer tolerance"
  weights: { timeliness: 0.25, completion: 0.35, damageRatio: 0.25, constraints: 0.15 },
  customerTolerance: { relaxed: 1.25, normal: 1.0, exacting: 0.75 },
  perContractMax: 12, perContractMin: -8,
});

export const REVIEW = Object.freeze({
  maxTags: 3,                  // §15.2 "only the two or three most salient events"
  minTags: 2,
  // §15.2's own examples, verbatim, plus the ones this prototype can actually generate
  tags: [
    'front_door_removed', 'mover_in_refrigerator', 'piano_safe', 'stairs_destroyed',
    'extra_trip', 'cargo_rider',
  ],
  salienceWeights: { costImpact: 0.5, rarity: 0.3, recency: 0.2 },
  templatesPerTag: 3,          // curated, per §15.2 "Use curated templates"
});
```

### 10.6 Test assertions (`tools/m10-tests.js`)

1. For each of the nine §15.1 terms, `sum(ledger[term])` equals the sum over the event log of
   that term's contributions, to within $0.005.
2. Replaying the full event log into a fresh `Ledger` produces field-by-field identical
   totals to the live-accumulated ledger.
3. Applying an already-applied event id a second time changes no total and adds no line
   (§14.2 idempotence).
4. Every ledger line has a category that maps to exactly one §15.1 term; the set of terms with
   at least one possible source is all nine (no orphan lines, no unsourced terms).
5. Labour at exactly `estimateSeconds` (1080 s) is $504.00 with 2 movers and overtime is
   exactly $0.00; at 1080 s + one step, overtime is > $0 and the labour total is continuous
   (no discontinuity greater than one step's charge) — §27.1's "overtime boundaries".
6. The efficiency bonus is continuous and monotonically decreasing in elapsed time, with no
   step discontinuity anywhere (§15.1 "Graduated; **no hard cutoff**"); it is 0 at exactly
   `estimateSeconds` and `efficiencyBonusMax` (260) at or below `efficiencyFloorSeconds`.
7. A fixture contract producing negative profit reaches `PHASES.SETTLEMENT`, produces a
   complete itemised invoice, and receives a grade (§15.2, §26.4).
8. Pausing for 60 s of wall-clock adds $0.00 of labour (`elapsedWorkMs` accrues inside the
   step callback, which the clock refuses to run while paused).
9. A broken `couch_3seat_01` bills exactly `1.00 × 900 = $900.00`; a scratched one exactly
   `0.08 × 900 = $72.00`. Cost is a pure function of band and `replacementValue` (§8.3
   "Economic loss should scale with replacement value and actual condition change").
10. Twenty aggregated scrape contacts on one wall produce one property-damage line whose cost
    is capped at that material's `maxCharge` (§8.3's "maximum charge").
11. Generic damage of any magnitude, up to and including every item at condition 0, never
    changes `state.phase` to a failed state (§8.4, §26.4).
12. Review tag count is ≥ `REVIEW.minTags` and ≤ `REVIEW.maxTags` (2–3) for every fixture,
    and every selected tag corresponds to an event that actually occurred in that run.
13. Review tag selection is deterministic for a given seed and event log — same seed, same
    tags, same templates (draws from `ctx.rng`, never `Math.random`).
14. §15.3 contribution stats are keyed by `playerId` string, sum correctly across movers, and
    no stat rewards damage (assert that no stat's value increases when `DAMAGE_APPLIED` fires
    with that player attributed).
15. `game.reset()` clears the ledger, the stats and the review tags; a second identical run
    produces an identical invoice (§26.6, §27.1 reset idempotence).
16. The save round-trips: `save → load → invoice` reproduces the same best-invoice record, and
    an incompatible version field is rejected without corrupting state (§23.4, §26.6
    "Save/settings reject incompatible versions safely").

### 10.7 Traps and risks

**10.7.1 Three of §15.1's nine terms have no config home, and one of them decides whether the
game is playable.** `baseContract`, `tips` and `violations` are absent from `ECONOMY`. Base
contract is the load-bearing one: labour alone at the 18-minute estimate is **$504.00**, and a
single broken couch or TV is **$900.00** — more than the entire bonus pool ($530.00). Without
a base contract set well above the sum of labour and expected damage, every job is a loss, and
§16.3's "the campaign must avoid unrecoverable bankruptcy spirals" is violated from contract
one. Set it deliberately and derive it from the manifest's total replacement value (≈$5,800)
rather than picking a round number.

**10.7.2 The event log is bounded at 256 entries and is explicitly not the invoice source.**
`eventBus.js` says so in its header; a long or chaotic contract will overflow it. Assertion 2
(replay equals live) will therefore fail on any run longer than 256 events unless replay reads
a separate unbounded ledger-input log. Either keep a dedicated append-only economic event
stream (bounded by contract, not by ring size) or drop the replay assertion and rely on
conservation alone. The first is better and is what §22.5's "export event log and invoice
inputs for reproducible reports" asks for.

**10.7.3 "Ledger matches events" invites double-counting through the aggregation window.**
`DAMAGE.aggregationWindowMs` (700 ms) merges contacts into one damage event. If the ledger
appends on `IMPACT` as well as on `DAMAGE_APPLIED`, or if a re-emitted aggregate is treated as
new, totals inflate silently. One writer (`src/economy/ledger.js`), keyed by event id,
idempotent by construction.

**10.7.4 §2.3's warning must not become a timer (§2.4's explicit non-goal).** "Aggressive
countdowns on every job" is on the do-not-add list with the reason "Stops experimentation and
converts cost pressure into arcade failure". Crossing the estimate produces a warning and a
higher rate. There is no clock that ends the job.

**10.7.5 The letter grade must not become a gate.** §15.2: "The letter grade summarizes the
invoice but never hides it" and "Negative profit still completes the job". An F is a result,
not a failure state, and the invoice must be fully itemised behind it.

**10.7.6 Attribution is a comedy feature that will be wrong (§8.4).** "Player attribution when
reliable" and "Attribution exists for humor and learning; shared company result remains
primary". With multiple grips on one object (the Phase 4 model), the last-toucher is often the
wrong culprit. Record `attribution: null` when confidence is low rather than blaming whoever
happened to be holding the other end, and never let attribution affect the shared total.

**10.7.7 §15.3's "Avoid rewarding selfish handling or deliberate damage" is a design
constraint on the statistics themselves.** A "most damage caused" leaderboard invites exactly
the behaviour the line forbids. Frame damage stats as involvement, not achievement, and keep
the shared company result primary.

**10.7.8 Money must be rounded in exactly one place.** Three independent computations must
agree to $0.005 (assertions 1, 2, 5). Rounding at the line, at the category and at the total
guarantees they will not. `ECONOMY.roundingCents` exists so there is one answer to where.

**10.7.9 The `fees` ledger already exists but `ECONOMY.recoveryFee` (45) is charged by
Phase 9.** Phase 10 must not re-price recoveries; it consumes what Phase 9 wrote. The gate is
"ledger matches events", and the recovery fee is the easiest line to double-count because it
is emitted by one phase and totalled by another.

---

## 11. Cross-phase config summary

Every key Phases 6–10 add or change, so `src/config.js` can be reviewed as one diff.

| Block | Status | Phase |
|---|---|---|
| `TOOLS` | **new** — dolly, blanket, ramp, disassembly, door, railing | 6 |
| `GROUPS` / `GROUP_PRESETS` | extend — `VEHICLE`, `TOOL`, `SENSOR` (in `world.js`, not config) | 6–7 |
| `CARGO` | **new** — containment, settle, sleep/wake, riders | 7 |
| `TRUCK.cargoBox`, `TRUCK.anchors` | extend | 7 |
| `STRAP` | extend — endpoint range, tension rate, anchor/surface ratings; **revisit `stiffness` vs `ratingNewtons` (trap 7.7.4)** | 7 |
| `SETTLE` | **new** — `speed` 0.08, `spin` 0.15 lifted out of `registry.js`; the single §29.2 definition both Phase 7 and Phase 9 depend on | 7 |
| `RECOVERY` | extend — `lastStableMinY`, `boundsXZ`, destination nodes, cargo grace | 7, 9 |
| `ROUTE` | **new** — length, three events, impulses, telegraph | 8 |
| `TRUCK` | extend — COM, suspension, `cargoFrame`, glance buckets; **resolve `brakeForce` units (trap 8.7.5)** | 8 |
| `DAMAGE` | **restructure** — velocity-driven item damage, impulse-driven property damage, add `very_fragile` (traps 8.7.1, 8.7.2) | 8 |
| `MATERIALS` | **new** — §8.3 static surface table | 8 |
| `MANIFEST` | extend — sticky delivery, exit hysteresis, rotation switch, wrong-room policy, part accompaniment. **Not** a new `DELIVERY` block: `containedFraction` 0.6 and `dwellMs` 1200 already live here | 9 |
| `ECONOMY` | extend — **`baseContract`, `tipMax`, `violationFeeBase`** (trap 10.7.1), estimate, curve, grade cuts, rounding | 10 |
| `REPUTATION` | **new** | 10 |
| `REVIEW` | **new** — §15.2 tags and template counts | 10 |

## 12. Decisions required before Phase 6 starts

Each of these blocks work downstream and none of them is an implementation detail.

| # | Decision | Forced by | Default if undecided |
|---|---|---|---|
| 1 | **Settled by Phase 5** — the house routes at 0.86 m / 0.91 m, so the couch (0.850 m) passes everywhere. What remains: give the couch a `disassembly` path and make door removal earn its place on measured contact counts, since it no longer unlocks anything | §3.3, §8.2, trap 6.7.1 | Add couch legs; measure door removal by wall-contact delta, not by fits/doesn't |
| 2 | Truck deck height and cargo-box inner dimensions, and therefore whether `couch_3seat_01` (2.10 m) and `wardrobe_01` (2.00 m tall) fit | §10.1, §13.1, trap 7.7.6 | Deck 1.20 m (already implied by `PLATFORM.y`); box dimensions must be chosen against the manifest, not guessed |
| 3 | Strap model: spring with a realistic stiffness, or inextensible limit with impulse-derived tension | §10.3, trap 7.7.4 | **Inextensible limit** |
| 4 | Cargo simulation frame: world-space with moving truck colliders, or truck-local | §10.5, trap 8.7.3 | Decide by measurement on the §27.2 brake/turn/bump rig; `TRUCK.cargoFrame` keeps both reachable |
| 5 | Item-damage driver: relative velocity (mass-independent) or impulse | §8.3, trap 8.7.1 | **Relative velocity for items, impulse for property** |
| 6 | Wrong-room delivery: completes-with-forfeited-bonus, or blocks the phase exit | §3.4 vs §15.1 vs §2.1, trap 9.7.1 | **Completes**; bonus forfeited |
| 9 | Whether cargo settling inside a moving truck uses the world frame or the truck frame — and the rule that it must change the *frame*, never fork `SETTLE.speed`/`SETTLE.spin` | §29.2, traps 8.7.3, 9.7.2 | Truck frame if measurement demands it; one threshold pair either way |
| 7 | `ECONOMY.baseContract` value, derived from the manifest's ≈$5,800 replacement value and $504 labour-at-estimate | §15.1, §16.3, trap 10.7.1 | Must be set before any invoice fixture is written |
| 8 | Whether `TRUCK.brakeForce` 5.2 is newtons or m/s² | trap 8.7.5 | m/s²; comment it |
