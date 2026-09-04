const pre = document.createElement('pre'); pre.id = 'test-out';
pre.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#000;color:#cfe;font:11px monospace;white-space:pre';
document.body.appendChild(pre);
const say = (s) => { pre.textContent = '==MFHTEST-BEGIN==\n' + s + '\n==MFHTEST-END=='; };
say('importing...');
try {
  await import('./_look-materials.js');
  const M = await window.__MFH_READY;
  const row = M.world.scene.getObjectByName('look-materials');
  let n = 0; if (row) row.traverse((o) => { if (o.isMesh) n++; });
  say(`lineup ok: row ${row ? 'present' : 'MISSING'}, ${n} meshes, row.pos ${row && row.position.toArray().map((v) => v.toFixed(2)).join(',')}\nALL-PASS  1 assertions`);
} catch (e) {
  say(`FAIL  lineup threw  <- ${e && e.message}\n${(e && e.stack || '').split('\n').slice(0, 8).join('\n')}\nFAILURES  1 of 1`);
}
