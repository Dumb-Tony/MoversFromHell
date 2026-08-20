/* Rapier API probe — a DIAGNOSTIC, not a test. Keep it.
 *
 * Same role as AirportBaggageCrew\tools\_raf.js (Dev\INDEX.md → Tooling & testing): a
 * throwaway-looking file that answers "what does this dependency actually do on this
 * machine". Re-run it after any Rapier version bump; every surprise it has already found
 * is recorded in src/physics/world.js.
 *
 *   powershell -ExecutionPolicy Bypass -File tools\smoketest.ps1 -Tests tools\_rapier-probe.js
 *
 * Findings so far (Rapier 0.20.0, 2026-08-19):
 *   - castRay reads a pipeline populated ONLY by world.step(); a cast before the first
 *     step returns null, and a collider created this step is invisible until the next one.
 *   - the hit distance is hit.timeOfImpact; hit.toi is undefined despite most examples.
 *   - world.bodies.len() / world.colliders.len() / world.impulseJoints.len() are correct;
 *     world.numRigidBodies() and world.numColliders() do not exist.
 */
import { initPhysics, PhysicsWorld } from '../src/physics/world.js';

const lines = [];
const out = (s) => lines.push(s);
try {
  const R = await initPhysics();
  out('rapier version                 ' + (R.version ? R.version() : '?'));

  const p = new PhysicsWorld(R);
  p.addGround();
  out('world.timestep                 ' + p.world.timestep);

  const mk = () => new R.Ray({ x: 0, y: 5, z: 0 }, { x: 0, y: -1, z: 0 });
  out('castRay before any step        ' + (p.world.castRay(mk(), 20, true) ? 'HIT' : 'no hit (expected)'));
  p.step();
  const hit = p.world.castRay(mk(), 20, true);
  out('castRay after one step         ' + (hit ? 'hit at ' + hit.timeOfImpact : 'NO HIT (unexpected!)'));
  if (hit) out('  timeOfImpact=' + hit.timeOfImpact + '  toi=' + hit.toi + ' (toi should be undefined)');

  out('counters  bodies/colliders/joints  ' +
      p.world.bodies.len() + '/' + p.world.colliders.len() + '/' + p.world.impulseJoints.len());

  const cc = p.world.createCharacterController(0.02);
  const need = ['setUp', 'enableAutostep', 'enableSnapToGround', 'setMaxSlopeClimbAngle',
                'setMinSlopeSlideAngle', 'setSlideEnabled', 'setApplyImpulsesToDynamicBodies',
                'computeColliderMovement', 'computedMovement', 'computedGrounded'];
  const missing = need.filter((m) => typeof cc[m] !== 'function');
  out('character controller           ' + (missing.length ? 'MISSING: ' + missing.join(',') : 'all methods present'));

  // Phases 2 and 7 need these; check now rather than discovering it mid-phase.
  for (const sym of ['JointData', 'EventQueue', 'ActiveEvents', 'QueryFilterFlags']) {
    out('  ' + sym.padEnd(28) + typeof R[sym]);
  }
} catch (e) {
  out('THREW: ' + (e && e.message));
  out((e && e.stack || '').split('\n').slice(0, 4).join('\n'));
}

const pre = document.createElement('pre');
pre.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#06080c;color:#cfe;font:12px monospace;padding:12px;white-space:pre';
pre.textContent = '==MFHTEST-BEGIN==\n' + lines.join('\n') + '\n\nALL-PASS  probe\n==MFHTEST-END==';
document.body.appendChild(pre);
