# Movers From Hell — project conventions

Adds to `C:\Users\wabba\.claude\CLAUDE.md`; does not override it.

## The design authority is the GDD

`docs/GDD.md` (29 sections) is the master design and implementation authority. Cite it by
section when a decision comes from it — `§7.1`, `§25.2` — the way the existing code does.
If a new idea conflicts with it, **preserve the four pillars and the validated core loop**
and record the change deliberately. The pillars are physical logistics, creative problem
solving, consequential chaos, company progression.

The original `.docx` is kept alongside the extracted markdown as the source of record.

## Status language (§ "Status Language")

- **LOCKED** — central identity, change only with an explicit product decision
- **TARGET** — desired production behaviour; temporary simplification is fine if the
  learning goal survives
- **PROTOTYPE** — required for the first browser vertical slice
- **EXPANSION HOOK** — leave a clean seam, do **not** build it

An expansion hook is permission to leave a seam, not permission to implement.

## Operating rules for this project (§25.1)

- Work in **thin increments that each end in a playable browser build**.
- State the behaviour hypothesis, the modules touched, and the checks *before* each
  increment.
- After each increment: run `tools\smoketest.ps1`, launch it, exercise the path, record
  limitations.
- Keep tuning in `src/config.js`. Never a bare literal in a system.
- **Do not add content, progression, online services or polish while the current gate
  fails.** More furniture cannot fix unsatisfying carrying (§2).
- Maintain `docs/CHANGELOG.md`, `docs/KNOWN_ISSUES.md`, `docs/PLAYTEST_NOTES.md`.
- Prefer instrumentation and reproducible test scenes over guessing at physics bugs.

## Build order (§29.1) — do not skip ahead

Movement feels good → one box feels good → one heavy shared object feels good →
architecture creates choices → tools solve physical problems → packing is satisfying →
bad packing has understandable consequences → unloading and the invoice are satisfying →
one contract is worth replaying → *only then* rebuild in Unity.

## Technical stack — decided 2026-08-18

- **Three.js r128, vendored** at `assets/lib/r128/`. Same build as Chameleon and
  Something's Different, so their camera/texture/animation code drops in unported.
- **Rapier3D, vendored WASM** — chosen for §6.1 grip springs, §10.3 straps, §7.3 sleeping
  and CCD. Not yet present; Phase 2 introduces it.
- **Zero external requests.** Everything vendored, everything offline.
- ES modules, served over http (`play.bat`). No Node.js on this machine.

## Testing

`tools\smoketest.ps1` is the gate. Exit code 0 = all assertions pass.

**Drive `game.frame()` directly — never wait for `requestAnimationFrame`.** Headless
Chrome in `--dump-dom` mode delivers 1–3 rAF callbacks in total, then stops (measured; see
`Dev\INDEX.md`). A suite that waits for frames waits forever.

Assert measured values, not vibes. Report failures plainly, with the number.

**A suite reporting 0 assertions and NO `FAIL` lines is a harness artifact, not a
regression.** The scratch copy is per-port (`_smoketest-<port>.html`) and is deleted on the
way out; if a previous run's server or Chrome still holds it, the next run reads a stale or
missing page and the result block never appears. Seen on 2026-08-23 running all twelve
suites back to back: m2 and m8 reported 0, both passed immediately when rerun alone on a
fresh port (66 and 38), and `_smoketest-8402.html` was left on disk as the tell. **Rerun a
zero-assertion suite by itself before believing it** — and never record a phase as failing
on that evidence.

## Multiplayer seams (§22.4) — keep these open even while single-player

- Players keyed by **stable string id**, never array position.
- State is **plain serializable data**. No THREE objects, no Rapier handles, no closures
  in `game.state` — `tools/m0-tests.js` E8 asserts this.
- Systems **observe** state; they do not own it. The renderer never writes to state.
- No hidden singleton ownership of a physical object. Multiple grips must be able to
  combine (§6.4).

## Failure is a state, not a reset (§2.2)

A dropped object is now somewhere inconvenient. A broken item still needs delivering.
Overtime costs money and work continues. Hard failure is rare and telegraphed (§12.2).
Never add a generic damage threshold that ends a contract.
