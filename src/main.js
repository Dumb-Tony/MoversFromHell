/* Boot + render loop — GDD §22.2 (App/State), §22.3 (fixed-step loop), §25.2 phase 0.
 *
 * §22.3's order is followed literally:
 *   1. collect actions and update desired player/hand targets
 *   2. advance fixed physics steps with a capped accumulator
 *   3. resolve grip/tool constraints and collision events   (Phase 2+)
 *   4. aggregate damage, cargo, zone and contract changes    (Phase 5+)
 *   5. interpolate transforms for rendering; update camera and UI
 *   6. record a lightweight event log for scoring and debugging
 *
 * Steps 1-2 and 5-6 exist now. 3-4 are empty system slots, registered in order so a later
 * phase adds a function rather than restructuring the loop.
 */

import { Game } from './game.js';
import { Input, CONTEXTS } from './core/input.js';
import { EventBus } from './core/eventBus.js';
import { createRenderer } from './render/renderer.js';
import { buildPhase0Scene } from './render/scene.js';
import { ThirdPersonCamera } from './render/camera.js';
import { DebugOverlay } from './dev/debugOverlay.js';
import { PHASES } from './core/eventBus.js';
import { BUILD } from './config.js';

const canvas = document.getElementById('stage');
const ui = document.getElementById('ui');

const { THREE, renderer, camera, syncSize } = createRenderer(canvas);
const world = buildPhase0Scene();
const rig = new ThirdPersonCamera(camera, world.colliders);

const bus = new EventBus();
const input = new Input(window, canvas).attach();
const game = new Game({ contractId: 'suburban_starter', input, bus });

// Phase 0 has nothing to simulate yet, so the loop is proven with the ONE system that
// exists: consume look input on the simulation step. Registered as a system rather than
// read in the render loop so the camera cannot outrun the sim at high frame rates.
game.addSystem('look', (state, stepMs, ctx) => {
  const look = ctx.input.consumeLook();
  rig.applyLook(look);
  state.players[state.localPlayerId].yaw = rig.yaw;
});
// Slots for §22.3 steps 3-4. Empty by design; filled by their phases.
game.addSystem('grips',    () => {});   // Phase 2
game.addSystem('physics',  () => {});   // Phase 2 (Rapier)
game.addSystem('contract', () => {});   // Phase 5

game.setPhase(PHASES.PICKUP);

const overlay = new DebugOverlay(ui, game);

/* Always-visible build stamp. GitHub Pages serves with Cache-Control: max-age=600, so a
 * returning visitor can be looking at a build up to ten minutes old with no way to tell.
 * During a playtest "which build were you on?" has to be answerable without opening
 * devtools, so this sits in the corner rather than behind F3. */
const stamp = document.createElement('div');
stamp.id = 'build-stamp';
stamp.textContent = `Movers From Hell — ${BUILD.label} · ${BUILD.date} · F3 for stats`;
ui.appendChild(stamp);

// ---- shell wiring ------------------------------------------------------------------
input.onBlur = () => game.setPaused(true);           // §21.4 solo pause
input.onContextChanged = (ctx) => game.bus.emit('INPUT_CONTEXT', { context: ctx }, game.clock.simTimeMs);

canvas.addEventListener('click', () => {
  if (!input.pointerLocked && !game.state.paused) input.requestPointerLock();
});

// Pause and the debug key are read on the RENDER frame, not in a system: they must keep
// working while the simulation is paused, and a paused clock runs no systems at all.
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') game.togglePause();
  if (e.code === 'F3') { e.preventDefault(); overlay.toggle(); }
});

// ---- main loop ---------------------------------------------------------------------
let lastT = performance.now();

function loop(now) {
  const frameMs = now - lastT;
  lastT = now;

  // Recover from a 0x0 boot (background/prerendered tab). See renderer.js syncSize.
  syncSize();

  overlay.stepsThisFrame = game.frame(frameMs);

  // §22.3 step 5: presentation runs on REAL time. It reads state and never writes it.
  const p = game.state.players[game.state.localPlayerId];
  rig.update(p.position, Math.min(frameMs, 100) / 1000);

  renderer.render(world.scene, camera);
  overlay.update(frameMs, { bodies: 0, constraints: 0, contacts: 0 });

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* Test seam. tools\m0-tests.js drives the game through this instead of synthesising real
 * frames, because headless Chrome in --dump-dom mode delivers only 1-3 rAF callbacks in
 * total (MEASURED — Dev\INDEX.md → Tooling & testing). A suite that waits for frames
 * waits forever; a suite that calls game.frame() directly is deterministic. */
window.__MFH = { game, input, rig, world, overlay, renderer, camera, syncSize, THREE, CONTEXTS, PHASES };
