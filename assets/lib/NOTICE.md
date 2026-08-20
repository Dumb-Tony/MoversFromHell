# Vendored third-party libraries

This project makes **zero external requests at runtime**. Everything it needs is committed
here. Nothing in this directory is loaded from a CDN.

---

## Three.js r128 — `r128/three.min.js`

- **License:** MIT (Three.js authors)
- **Provenance:** copied from `Dev\Chameleon\assets\lib\r128\three.min.js`, the same build
  Chameleon and Something's Different vendor.
- **Why this exact revision:** every reusable function in `Dev\INDEX.md` — `camOcclude`,
  `skelWalk`, `canvasTex`, `buildShell`, `stampProjected`, `aimBone` — was written against
  r128. r128 predates the colour-space and lighting overhaul, so a newer revision would
  require porting all of it. Keeping r128 is what makes that reuse free.
- **Modified:** no.
- Loaded as a **classic** script by `index.html`, publishing `window.THREE`.

---

## Rapier3D (compat) 0.20.0 — `rapier3d-0.20.0/rapier.mjs`

- **License:** Apache-2.0 (Dimforge). Full text in `rapier3d-0.20.0/LICENSE`.
- **Source:** `https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.20.0/dist/rapier.mjs`
- **Downloaded:** 2026-08-19
- **Upstream SHA-256:** `09a000bee2ad827608780cf8821258cadc243aaeb8881ab3e769de73f945eee0`
- **Size:** 2,857,555 bytes

**Why the `-compat` build.** It inlines the WebAssembly module as base64 inside the ESM
file (the blob starts `AGFzbQEAAAA`, which is the `\0asm` magic number). One file, no
second network request, no `import.meta.url` and no hard-coded URLs anywhere in it —
verified by grep before vendoring. The non-compat build fetches a separate `.wasm`, which
would need a MIME type on the dev server and would break the zero-external-requests rule if
it ever resolved against a CDN.

**Why Rapier at all.** GDD §6.1 needs a spring constraint from a hand target to a local
point on a collider, §10.3 needs strap constraints with tension and failure states, §7.3
needs sleeping bodies and CCD, and §5.1 needs a character controller coupled to a physical
reaction layer. `KinematicCharacterController`, `JointData`, `EventQueue`,
`QueryFilterFlags` and `ActiveEvents` were all confirmed present in the export list before
this was committed.

**Modification:** exactly one. The trailing `//# sourceMappingURL=rapier.mjs.map` comment
was replaced with an empty line. The `.map` is ~3 MB and is not vendored, so leaving the
comment made the browser 404 for it whenever devtools was open. Nothing else was touched —
the file is otherwise byte-identical to upstream.

**To update:** re-download from the URL above at the new version, strip the same comment,
put it in a new `rapier3d-<version>/` directory, update this file, and run
`tools\smoketest.ps1`. Do not edit a vendored file in place.
