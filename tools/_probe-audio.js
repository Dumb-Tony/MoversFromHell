/* Audio probe (Phase 11 build-side M9) — prints mixFor() for four poses, runnable under
 * tools\smoketest.ps1 -Tests tools\_probe-audio.js. The numbers in the CHANGELOG entry come
 * from here. Pure: it reads the live state and views and writes nothing.
 *
 *   boot     the driveway pose the game loads into
 *   carry    a 30 kg / 90 kg carry at three imbalances (world view stubbed)
 *   dolly    a dolly rolling at three distances from the ears
 *   transit  the phase set to TRANSIT with a route at four progress points and a loose pack
 */
import { mixFor, atten, RANGE, CUES, cueVolume, resolveCue } from '../src/audio/audio.js';
import { PHASES } from '../src/core/eventBus.js';
import { AUDIO } from '../src/config.js';

const lines = [];
let passes = 0, fails = 0;
function ok(name, cond, detail = '') {
  if (cond) { passes++; lines.push(`PASS  ${name}`); }
  else { fails++; lines.push(`FAIL  ${name}${detail ? '  <- ' + detail : ''}`); }
}
function emit() {
  const pre = document.createElement('pre');
  pre.id = 'probe-out';
  const tail = fails === 0 ? `ALL-PASS  ${passes} assertions` : `FAILURES  ${fails} of ${passes + fails}`;
  pre.textContent = '==MFHTEST-BEGIN==\n' + lines.join('\n') + '\n\n' + tail + '\n==MFHTEST-END==';
  document.body.appendChild(pre);
}
const f3 = (o) => JSON.stringify(o, (k, v) => (typeof v === 'number' ? Number(v.toFixed(3)) : v));

const M = await window.__MFH_READY;
const { game } = M;
const copy = () => JSON.parse(JSON.stringify(game.state));
try {
  const L = M.audioListeners();
  const W = M.audioWorld();
  lines.push(`  listeners: ${f3(L.map(({ seat, x, z, outdoors }) => ({ seat, x, z, outdoors })))}`);
  lines.push(`  boot      ${f3(mixFor(game.state, L, W))}`);

  const s = copy();
  for (const mass of [30, 90]) for (const imb of [0, 0.5, 1.0]) {
    lines.push(`  carry     ${String(mass).padStart(3)} kg, imbalance ${imb.toFixed(1)}  ${f3(mixFor(s, L, { carries: [{ mass, imbalance: imb }] }).strain)}`);
  }
  for (const d of [1, 2, 8, 20]) {
    const dolly = { x: L[0].x + d, z: L[0].z, speed: 1.2 };
    lines.push(`  dolly     ${String(d).padStart(2)} m at 1.2 m/s  roll ${mixFor(s, L, { dollies: [dolly] }).roll.toFixed(3)}  (atten ${atten(d, RANGE.roll).toFixed(3)})`);
  }
  const t = { ...s, phase: PHASES.TRANSIT };
  for (const p of [0, 0.06, 0.5, 0.97]) {
    lines.push(`  transit   progress ${p.toFixed(2)}  engine ${f3(mixFor(t, L, { route: { state: 'driving', progress: p } }).engine)}`);
  }
  for (const u of [0, 0.2, 0.6, 1.0]) {
    lines.push(`  transit   unsecured ${u.toFixed(1)}  rattle ${mixFor(t, L, { route: { state: 'driving', progress: 0.5 }, pack: { loadedCount: 5, unsecuredFraction: u } }).rattle.toFixed(3)}`);
  }
  lines.push(`  impact    volume at 0.4 / 1 / 2 / 4 / 8 m/s: ${[0.4, 1, 2, 4, 8].map((v) => cueVolume('IMPACT', { relVelocity: v }).toFixed(3)).join(' / ')}`);
  lines.push(`  cues      ${Object.keys(CUES).length} rows, ${Object.values(CUES).reduce((n, r) => n + (r.variants ? Object.keys(r.variants).length : 1), 0)} recipes; captionMs ${AUDIO.captionMs}, maxVoices ${AUDIO.maxVoices}`);
  lines.push(`  caption   IMPACT wood → "${resolveCue('IMPACT', { materials: ['wood'] }).caption}", STRAP failed → "${resolveCue('STRAP_CHANGED', { state: 'failed' }).caption}"`);
  ok('P1 the boot pose is silent apart from the wind', mixFor(game.state, L, W).engine.gain === 0 && mixFor(game.state, L, W).strain.gain === 0);
  ok('P2 transit at mid-route is full engine', mixFor(t, L, { route: { state: 'driving', progress: 0.5 } }).engine.gain === 1);
} catch (e) {
  fails++; lines.push(`FAIL  probe threw  <- ${e && e.message}`);
}
emit();
