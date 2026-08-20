/* Probe: what actually clears a persistent Rapier force, and when? */
import { initPhysics, PhysicsWorld } from '../src/physics/world.js';
const lines = [];
const out = (s) => lines.push(s);
try {
  const R = await initPhysics();
  const p = new PhysicsWorld(R);
  p.addGround();
  let x = 0;
  const mk = () => {
    const b = p.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(x += 10, 5, 0).setGravityScale(0));
    p.world.createCollider(R.ColliderDesc.cuboid(0.25, 0.25, 0.25).setMass(10), b);
    return b;
  };
  const run = (label, fn) => {
    const b = mk();
    fn(b);
    out(label.padEnd(46) + b.linvel().x.toFixed(4) + ' m/s');
  };

  out('10 kg body, 100 N, 60 steps. One-step-only would be 0.167 m/s.');
  out('');
  run('addForce once, no reset', (b) => {
    b.addForce({ x: 100, y: 0, z: 0 }, true);
    for (let i = 0; i < 60; i++) p.world.step();
  });
  run('addForce once, resetForces(false) AFTER step', (b) => {
    b.addForce({ x: 100, y: 0, z: 0 }, true);
    for (let i = 0; i < 60; i++) { p.world.step(); b.resetForces(false); }
  });
  run('addForce once, resetForces(true) AFTER step', (b) => {
    b.addForce({ x: 100, y: 0, z: 0 }, true);
    for (let i = 0; i < 60; i++) { p.world.step(); b.resetForces(true); }
  });
  run('resetForces BEFORE step, then addForce each step', (b) => {
    for (let i = 0; i < 60; i++) { b.resetForces(true); b.addForce({ x: 100, y: 0, z: 0 }, true); p.world.step(); }
  });
  run('addForce each step, no reset (60x compounding)', (b) => {
    for (let i = 0; i < 60; i++) { b.addForce({ x: 100, y: 0, z: 0 }, true); p.world.step(); }
  });
  run('applyImpulse once (one-shot, for reference)', (b) => {
    b.applyImpulse({ x: 100 / 60, y: 0, z: 0 }, true);
    for (let i = 0; i < 60; i++) p.world.step();
  });
  out('');
  out('A steady 100 N on 10 kg for 1 s = 10 m/s. That is the CORRECT answer for a');
  out('force meant to act continuously — the question is only whether it keeps acting');
  out('after you stop asking, and whether repeated addForce calls compound.');
} catch (e) { out('THREW: ' + (e && e.message) + '\n' + (e.stack||'').split('\n').slice(0,3).join('\n')); }
const pre = document.createElement('pre');
pre.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#06080c;color:#cfe;font:12px monospace;padding:12px;white-space:pre';
pre.textContent = '==MFHTEST-BEGIN==\n' + lines.join('\n') + '\n\nALL-PASS  probe\n==MFHTEST-END==';
document.body.appendChild(pre);
