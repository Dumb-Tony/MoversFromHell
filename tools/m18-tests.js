/* Phase 11 build-side M9 suite — the synthesised audio layer and its captions.
 *
 * GDD §20.4 (audio layers), §8.4 "material sound" at impact, §5.2 "strain audio", §10.3 "snap
 * sound", §21.4 Hearing (subtitles with direction, volume categories), §26.5 "subtitles …
 * exist", §26.6 no unbounded growth, §22.4 audio reads state and never writes it.
 *
 * THE CLAIMS UNDER TEST, in the order the file makes them:
 *   A1   nothing the game emits is unaccounted for — every EVENTS name has a cue or is
 *        listed silent on purpose (the direction that rots: STES m9 A3)
 *   A2   mixFor is pure: same input twice, same output; a bare {} is silence, not a throw
 *   A3-6 the mix is CORRECT, not merely harmless (ABC m5 H): the engine only in TRANSIT, the
 *        strain rising with mass and its pitch with imbalance, an impact louder the faster,
 *        a dolly louder to the nearer pair of ears by the squared law
 *   A7   a browser with no AudioContext leaves the layer silent and the game running
 *   A8   the caption is on the HUD, with no context at all, and it goes away on sim time
 *   A9   bounded: a thousand impacts in one frame are a queue of AUDIO.maxVoices and a voice
 *        count under it — armed through the REAL arm() against a stand-in AudioContext, so the
 *        plumbing runs (INDEX: "a cue table tested against an UNARMED synthesiser tests almost
 *        nothing")
 *   A10  ?audio=off is a layer that does nothing
 *   A11  the card's four Sound controls each move their consumer (assert consumption)
 *   A12  the determinism proof in its strong form (ABC m5 E / m17 R6): the same scripted run
 *        with the layer attached and armed, and with it detached, yields the same game.state
 *        to the byte
 *
 * localStorage 'mfh.save' is cleared at the START and the END (m16's rule): the captions
 * switch and the volume sliders persist, and a later suite must not boot with them.
 */

import { mixFor, atten, RANGE, CUES, SILENT_EVENTS, cueFor, resolveCue, cueVolume, GameAudio,
         audioEnabledFrom, directionGlyph, panFor, tone, noiseBurst, makeNoise,
         captionText } from '../src/audio/audio.js';   // M30: a caption cell is a string OR a function
import { EVENTS, PHASES, EventBus } from '../src/core/eventBus.js';
// M28: §8.4's fourth channel reads the SAME cue-type list — A1g/A1h below extend A1's walk.
import { HAPTIC_TYPES, hapticFor } from '../src/audio/haptics.js';
import { AUDIO, SETTINGS, HAPTICS, TELEMETRY } from '../src/config.js';
import { load, SAVE_KEY, SHELL_DEFAULTS } from '../src/core/save.js';

const lines = [];
let passes = 0, fails = 0;
function ok(name, cond, detail = '') {
  if (cond) { passes++; lines.push(`PASS  ${name}`); }
  else { fails++; lines.push(`FAIL  ${name}${detail ? '  <- ' + detail : ''}`); }
}
const eq = (n, a, b) => ok(n, a === b, `got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const near = (n, a, b, tol = 1e-6) => ok(n, Math.abs(a - b) <= tol, `got ${a}, want ${b} ±${tol}`);
function deepEq(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
  if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return false;
  return ka.every((k) => deepEq(a[k], b[k]));
}
const deep = (n, a, b) => ok(n, deepEq(a, b), `got ${JSON.stringify(a).slice(0, 240)}, want ${JSON.stringify(b).slice(0, 240)}`);

let _pre = null;
function emit(status) {
  if (!_pre) {
    _pre = document.createElement('pre');
    _pre.id = 'test-out';
    _pre.style.cssText = 'position:fixed;inset:0;z-index:99999;overflow:auto;background:#06080c;' +
      'color:#cfe;font:11px ui-monospace,Consolas,monospace;padding:12px;white-space:pre';
    document.body.appendChild(_pre);
  }
  const tail = status || (fails === 0 ? `ALL-PASS  ${passes} assertions` : `FAILURES  ${fails} of ${passes + fails}`);
  _pre.textContent = '==MFHTEST-BEGIN==\n' + lines.join('\n') + '\n\n' + tail + '\n==MFHTEST-END==';
}

emit('booting...');
window.addEventListener('error', (e) => { fails++; lines.push(`FAIL  uncaught  <- ${e.message}`); emit(); });
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason; fails++; lines.push(`FAIL  uncaught  <- ${r && r.message || r}`);
  lines.push((r && r.stack || '').split('\n').slice(0, 5).join('\n')); emit();
});
let M;
try { M = await window.__MFH_READY; }
catch (e) {
  fails++; lines.push(`FAIL  boot threw  <- ${e && e.message}`);
  lines.push((e && e.stack || '').split('\n').slice(0, 6).join('\n'));
  emit(); throw e;
}

const { game, huds, movers, registry, physics, route, damage } = M;
const bus = game.bus;
const audio = M.audio;
const FRAME = 16.667;
const frames = (n = 1) => { for (let i = 0; i < n; i++) game.frame(FRAME); };
const banner = () => { const b = document.getElementById('err-banner'); return b ? b.textContent : ''; };
const panel = () => document.getElementById('settings-screen');
const control = (key) => panel().querySelector(`[data-setting="${key}"]`);
function setControl(key, value) {
  const c = control(key);
  if (!c) throw new Error('no control for ' + key);
  if (c.type === 'checkbox') { c.checked = !!value; c.dispatchEvent(new Event('change', { bubbles: true })); }
  else if (c.type === 'range') { c.value = String(value); c.dispatchEvent(new Event('input', { bubbles: true })); }
  else { c.value = String(value); c.dispatchEvent(new Event('change', { bubbles: true })); }
  return c;
}
const byDef = (id) => { for (const e of registry.entities.values()) if (e.defId === id) return e; return null; };
function parkAt(e, x, y, z, yaw = 0) {
  e.body.setTranslation({ x, y, z }, true);
  e.body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
  e.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  e.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  e.body.wakeUp();
  physics.primeQueries();
}
const zeroMix = (m) => m && m.engine.gain === 0 && m.engine.pitch === 0 && m.roll === 0 &&
  m.strain.gain === 0 && m.strain.pitch === 0 && m.rattle === 0 && m.wind === 0;
const stateCopy = () => JSON.parse(JSON.stringify(game.state));

/* ── a stand-in AudioContext (ABC m5 fakeAudioContext) ────────────────────────
 * Enough of the Web Audio surface for arm(), the loops, tone() and noiseBurst() to run for
 * real: parameters remember their last value, nodes remember their connections, the context
 * counts what it created and lets a test move its clock. */
class FakeParam {
  constructor(v = 0) { this.value = v; this.target = null; }
  setValueAtTime(v) { this.value = v; return this; }
  linearRampToValueAtTime(v) { this.value = v; return this; }
  exponentialRampToValueAtTime(v) { this.value = v; return this; }
  setTargetAtTime(v) { this.target = v; return this; }
  cancelScheduledValues() { return this; }
}
class FakeNode {
  constructor(ctx) { this.ctx = ctx; this.connections = []; }
  connect(n) { this.connections.push(n); return n; }
  disconnect() { this.connections.length = 0; }
}
class FakeAudioContext {
  constructor() {
    this.currentTime = 0; this.state = 'running'; this.sampleRate = 48000;
    this.destination = new FakeNode(this);
    this.created = { oscillators: 0, sources: 0, panners: 0, gains: 0, filters: 0, buffers: 0, compressors: 0 };
    this.started = 0;
    FakeAudioContext.instances.push(this);
  }
  createGain() { this.created.gains++; const n = new FakeNode(this); n.gain = new FakeParam(1); return n; }
  createOscillator() {
    this.created.oscillators++; const n = new FakeNode(this);
    n.type = 'sine'; n.frequency = new FakeParam(440); n.start = () => { this.started++; }; n.stop = () => {};
    return n;
  }
  createBiquadFilter() {
    this.created.filters++; const n = new FakeNode(this);
    n.type = 'lowpass'; n.frequency = new FakeParam(350); n.Q = new FakeParam(1); return n;
  }
  createBufferSource() {
    this.created.sources++; const n = new FakeNode(this);
    n.buffer = null; n.loop = false; n.start = () => { this.started++; }; n.stop = () => {}; return n;
  }
  createBuffer(ch, n, sr) {
    this.created.buffers++; const data = new Float32Array(n);
    return { numberOfChannels: ch, length: n, sampleRate: sr, getChannelData: () => data };
  }
  createDynamicsCompressor() {
    this.created.compressors++; const n = new FakeNode(this);
    for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) n[k] = new FakeParam(0);
    return n;
  }
  createStereoPanner() { this.created.panners++; const n = new FakeNode(this); n.pan = new FakeParam(0); return n; }
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  close() { this.state = 'closed'; return Promise.resolve(); }
}
FakeAudioContext.instances = [];
const realAC = window.AudioContext;
const realWebkitAC = window.webkitAudioContext;
const restoreAC = () => { window.AudioContext = realAC; window.webkitAudioContext = realWebkitAC; };

// SETUP: nothing from a previous run may survive into this one (the card persists).
try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* no storage — the suite still runs */ }

try {

/* ── A1. the vocabulary is accounted for ──────────────────────────────────────── */
lines.push('--- A1. every EVENTS name has a cue or is silent on purpose (GDD §20.4, §23.3) ---');
{
  const cueKeys = Object.keys(CUES);
  const eventNames = Object.keys(EVENTS);
  const notEvents = cueKeys.filter((k) => !EVENTS[k]);
  ok('A1 every key of CUES is a name in EVENTS', notEvents.length === 0, notEvents.join(','));
  const unaccounted = eventNames.filter((n) => !cueFor(n) && !SILENT_EVENTS.includes(n));
  ok('A1 …and every EVENTS name is a CUES key OR listed in SILENT_EVENTS', unaccounted.length === 0, unaccounted.join(','));
  const both = cueKeys.filter((k) => SILENT_EVENTS.includes(k));
  ok('A1a nothing is both cued and silent', both.length === 0, both.join(','));
  const silentUnknown = SILENT_EVENTS.filter((n) => !EVENTS[n]);
  ok('A1a1 …and every silent name is a real event', silentUnknown.length === 0, silentUnknown.join(','));
  lines.push(`      ${cueKeys.length} cued, ${SILENT_EVENTS.length} silent, ${eventNames.length} events`);

  /* Every row and every variant: a bus that exists, a gap, parts, and a §21.4 caption.
   *
   * A1b IS RESTATED HERE, NOT DELETED (Phase 11 build-side M30). From M9 to M28 this line
   * asserted `typeof v.caption === 'string'`, and that pin is precisely why every property cue
   * said 'wall scuffed' when a door frame was scuffed — KNOWN_ISSUES Phase 21, M14, "Property
   * captions are generic ... m18 A1b pins string captions, so the audio cannot name the
   * surface". The pin is now: a caption cell is a NON-EMPTY STRING **or** a PURE FUNCTION of
   * the payload, and what is asserted is unchanged in force — every row and every variant
   * yields a non-empty caption, for a representative payload. A1b1/A1b2 add the two things the
   * function form has to be held to that a literal never needed: purity (the table walk, two
   * seats and a replay must all read the same words for the same event) and a bound on the
   * length, since a template can build a string where a literal could only be one. */
  const SAMPLE = Object.freeze({
    surfaceId: 'doorHeader_living_kitchen', location: 'living_kitchen door frame',
    band: 'scuffed', materials: ['wood'], entityId: 'box_small_01', defId: 'box_small_01',
    cost: 12.5, reason: 'slipped', state: 'failed', roadType: 'hardBrake', to: PHASES.PICKUP,
    action: 'removed', doorId: 'living_kitchen', heldBy: [], loaded: true, pieces: 2,
  });
  const bad = [];
  let variants = 0, templates = 0;
  for (const [name, row] of Object.entries(CUES)) {
    if (!['ui', 'world', 'foley'].includes(row.bus)) bad.push(`${name}: bus ${row.bus}`);
    if (!(Number.isFinite(row.minGapMs) && row.minGapMs >= 0)) bad.push(`${name}: minGapMs`);
    const leaves = row.variants ? Object.entries(row.variants) : [[null, row]];
    if (row.variants && !row.variants._) bad.push(`${name}: no _ fallback`);
    for (const [k, v] of leaves) {
      variants++;
      const where = `${name}${k ? '.' + k : ''}`;
      const isFn = typeof v.caption === 'function';
      if (!(isFn || typeof v.caption === 'string')) bad.push(`${where}: caption is ${typeof v.caption}`);
      const cap = captionText(v.caption, SAMPLE);
      if (!(typeof cap === 'string' && cap.trim().length > 0)) bad.push(`${where}: caption resolved empty`);
      if (isFn) {
        templates++;
        if (captionText(v.caption, SAMPLE) !== cap) bad.push(`${where}: caption is not pure`);
        if (cap.length > TELEMETRY.textMax) bad.push(`${where}: caption ${cap.length} chars > ${TELEMETRY.textMax}`);
        // A template must be TOTAL: an event that arrives with no fields at all is still a
        // subtitle, never a throw and never a blank line on the HUD.
        if (!(captionText(v.caption, {}).trim().length > 0)) bad.push(`${where}: caption empty for {}`);
      }
      if (!Array.isArray(v.parts)) bad.push(`${where}: parts`);
      if (!v.parts.length && !v.noise) bad.push(`${where}: no sound at all`);
      for (const p of v.parts) if (!(p.length >= 5 && p.every((x, i) => i === 3 ? typeof x === 'string' : Number.isFinite(x)))) bad.push(`${where}: part ${JSON.stringify(p)}`);
    }
  }
  ok('A1b every cue row and every variant yields a non-empty caption (string OR pure function — the M9 string-only pin RESTATED by M30), a real bus, a gap and a recipe',
     bad.length === 0, bad.join(' | '));
  lines.push(`      ${variants} recipes across ${cueKeys.length} rows, ${templates} of them caption TEMPLATES`);
  ok('A1b1 …at least one caption IS a template (M30: the property cues name their surface)', templates >= 6, `${templates}`);
  eq('A1b2 …and resolveCue evaluates it: DAMAGE_APPLIED {surfaceId:"doorHeader_living_kitchen", band:"scuffed"} captions the DOOR FRAME, not "wall scuffed"',
     resolveCue('DAMAGE_APPLIED', { surfaceId: 'doorHeader_living_kitchen', band: 'scuffed' }).caption,
     'living-kitchen door frame scuffed');
  eq('A1b3 …and a property event with NO surface at all still captions ("a wall holed"), never a blank subtitle',
     resolveCue('DAMAGE_APPLIED', { band: 'holed' }).caption, 'a wall holed');
  eq('A1b4 …a caption cell that throws resolves to "" and resolveCue substitutes the variant key',
     captionText(() => { throw new Error('boom'); }, {}), '');
  // The variant dispatch, on the real payload fields.
  eq('A1c IMPACT on ["wood","furniture"] resolves the wooden thud', resolveCue('IMPACT', { materials: ['wood', 'furniture'] }).variant, 'wood');
  eq('A1c1 …["glass","electronics"] the glass rattle', resolveCue('IMPACT', { materials: ['glass', 'electronics'] }).variant, 'glass');
  eq('A1c2 …and no materials at all the fallback, never a throw', resolveCue('IMPACT', {}).variant, '_');
  eq('A1d STRAP_CHANGED {state:"failed"} is the snap (§10.3)', resolveCue('STRAP_CHANGED', { state: 'failed' }).caption, CUES.STRAP_CHANGED.variants.failed.caption);
  eq('A1d1 GRIP_ENDED {reason:"pulled out of reach"} is the grip snapping (§6.2)', resolveCue('GRIP_ENDED', { reason: 'pulled out of reach' }).variant, 'pulled out of reach');
  eq('A1d2 DAMAGE_APPLIED {band:"broken"} out-shouts {band:"scratched"} (escalation)',
     Math.max(...resolveCue('DAMAGE_APPLIED', { band: 'broken' }).parts.map((p) => p[4])) >
     Math.max(...resolveCue('DAMAGE_APPLIED', { band: 'scratched' }).parts.map((p) => p[4])), true);
  eq('A1d3 CONTRACT_PHASE {to:"settlement"} is the invoice sting', resolveCue('CONTRACT_PHASE', { to: PHASES.SETTLEMENT }).caption, CUES.CONTRACT_PHASE.variants[PHASES.SETTLEMENT].caption);
  eq('A1e cueFor("constructor") is null (own properties only)', cueFor('constructor'), null);
  eq('A1e1 resolveCue of an unknown type is null', resolveCue('NOT_AN_EVENT', {}), null);
  ok('A1f a variant function that throws falls back rather than escaping',
     (() => { try { return resolveCue('IMPACT', { get materials() { throw new Error('boom'); } }).variant === '_'; } catch (e) { return false; } })());
}

/* ── A1g-h (Phase 11 build-side M28). ONE cue-type list for sound, captions AND rumble ──
 * §8.4 names four channels at an impact and the haptic pulse is the fourth. A1 above insists
 * every EVENTS name is cued or deliberately silent; this extends the SAME walk to the haptic
 * table, so an event that arrives with a sound and no pulse fails by name here rather than
 * being quietly numb. The two tables are compared as key SETS, not counts — a swap of one row
 * for another would keep the count. */
lines.push('--- A1g-h. the haptic table walks the same cue-type list (M28, §8.4) ---');
{
  eq('A1g the HAPTICS cue types and the CUES keys are the same set',
     HAPTIC_TYPES.slice().sort().join(','), Object.keys(CUES).sort().join(','));
  const missingHaptic = Object.keys(CUES).filter((k) => !hapticFor(k));
  ok('A1g1 …so every cue that makes a sound also has a pulse', missingHaptic.length === 0, missingHaptic.join(','));
  const notEvents = HAPTIC_TYPES.filter((k) => !EVENTS[k]);
  ok('A1g2 …and every haptic row is a name in EVENTS', notEvents.length === 0, notEvents.join(','));
  const bad = [];
  for (const t of HAPTIC_TYPES) {
    const row = hapticFor(t);
    for (const m of ['strong', 'weak']) {
      if (!(Number.isFinite(row[m]) && row[m] >= 0 && row[m] <= 1)) bad.push(`${t}.${m}=${row[m]}`);
    }
    if (!(Number.isFinite(row.ms) && row.ms >= HAPTICS.minMs && row.ms <= HAPTICS.maxMs)) bad.push(`${t}.ms=${row.ms}`);
    if (!['holder', 'player', 'driver', 'all'].includes(row.to)) bad.push(`${t}.to=${row.to}`);
  }
  ok(`A1h every haptic row: magnitudes in [0,1], ms in [${HAPTICS.minMs},${HAPTICS.maxMs}], a known route`,
     bad.length === 0, bad.join(' | '));
  eq('A1h1 hapticFor("constructor") is null (own properties only, as cueFor is)', hapticFor('constructor'), null);
  lines.push(`      ${HAPTIC_TYPES.length} haptic rows against ${Object.keys(CUES).length} cue rows`);
}
emit('running...');

/* ── A2. mixFor is pure ──────────────────────────────────────────────────────── */
lines.push('--- A2. mixFor is pure (INDEX: "split the mix from the plumbing") ---');
{
  const before = JSON.stringify(game.state);
  const L = M.audioListeners(), W = M.audioWorld();
  const m1 = mixFor(game.state, L, W);
  const m2 = mixFor(game.state, L, W);
  deep('A2 mixFor called twice on the same state deep-equals', m1, m2);
  let threw = null, bare = null;
  try { bare = mixFor({}); } catch (e) { threw = e; }
  ok('A2 on a bare {} state it returns all-zero gains and throws nothing', !threw && zeroMix(bare), threw ? threw.message : JSON.stringify(bare));
  ok('A2a null / undefined / a number are silence, not a throw',
     (() => { try { return zeroMix(mixFor(null)) && zeroMix(mixFor(undefined)) && zeroMix(mixFor(7, null, null)); } catch (e) { return false; } })());
  ok('A2b a paused world is silent', zeroMix(mixFor({ ...stateCopy(), paused: true }, L, { ...W, carries: [{ mass: 90, imbalance: 1 }] })));
  eq('A2c it did not write game.state', JSON.stringify(game.state), before);
  deep('A2d the mix has exactly the five layers', Object.keys(m1).sort(), ['engine', 'rattle', 'roll', 'strain', 'wind']);
  ok('A2e at boot, on the driveway with nothing in hand, the beds are silent except the wind',
     m1.engine.gain === 0 && m1.roll === 0 && m1.strain.gain === 0 && m1.rattle === 0, JSON.stringify(m1));
  lines.push(`      boot mix: ${JSON.stringify(m1)}`);
}
emit('running...');

/* ── A3. the engine is a fact about the phase ────────────────────────────────── */
lines.push('--- A3. engine gain is 0 in PICKUP and DELIVERY and > 0 in TRANSIT (GDD §3.4, §20.4) ---');
{
  const L = M.audioListeners();
  const phase0 = game.state.phase;
  eq('A3 fixture: the game is in PICKUP', phase0, PHASES.PICKUP);
  eq('A3 engine gain is 0 in PICKUP', mixFor(game.state, L, M.audioWorld()).engine.gain, 0);
  game.setPhase(PHASES.TRANSIT);
  const idle = mixFor(game.state, L, M.audioWorld()).engine;
  ok('A3 …> 0 in TRANSIT (idling at the kerb before the route moves)', idle.gain > 0, JSON.stringify(idle));
  near('A3a …at exactly AUDIO.engine.idle while parked', idle.gain, AUDIO.engine.idle);
  game.setPhase(PHASES.DELIVERY);
  eq('A3 …and 0 again in DELIVERY', mixFor(game.state, L, M.audioWorld()).engine.gain, 0);
  game.setPhase(PHASES.TRANSIT);
  // The route is a scripted timeline (route.js): the speed profile is derived from progress.
  const s = stateCopy();
  const at = (p) => mixFor(s, L, { route: { state: 'driving', progress: p } }).engine;
  ok('A3b gain and pitch rise from progress 0 to mid-route', at(0.5).gain > at(0).gain && at(0.5).pitch > at(0).pitch,
     `${JSON.stringify(at(0))} → ${JSON.stringify(at(0.5))}`);
  ok('A3b1 …and fall again toward the end (slowing for the kerb)', at(0.99).gain < at(0.5).gain, `${at(0.99).gain} vs ${at(0.5).gain}`);
  near('A3b2 full gain is 1 mid-route', at(0.5).gain, 1);
  // For real: depart, drive 200 frames (≈ 12% of the route), read the live view.
  ok('A3c fixture: the route departs', route.depart());
  frames(200);
  const live = mixFor(game.state, L, M.audioWorld()).engine;
  ok('A3c 200 frames into a real drive the engine is above idle', live.gain > AUDIO.engine.idle && live.pitch > AUDIO.engine.pitchBase, JSON.stringify(live));
  lines.push(`      engine: parked ${JSON.stringify(idle)}, driving at ${(route.status().progress * 100).toFixed(0)}% ${JSON.stringify(live)}`);
  route.reset();
  game.setPhase(PHASES.PICKUP);
  eq('A3d back in PICKUP, silent', mixFor(game.state, L, M.audioWorld()).engine.gain, 0);
}
emit('running...');

/* ── A4. strain ──────────────────────────────────────────────────────────────── */
lines.push('--- A4. strain rises with mass, its pitch with imbalance (GDD §5.2 "strain audio") ---');
{
  const s = stateCopy();
  const strain = (mass, imbalance) => mixFor(s, [], { carries: [{ id: 'p0', mass, imbalance }] }).strain;
  const g = [0, 30, 90].map((m) => strain(m, 0.3).gain);
  ok('A4 strain gain rises monotonically across 0 → 30 → 90 kg at fixed imbalance',
     g[0] < g[1] && g[1] < g[2], g.map((v) => v.toFixed(3)).join(' < '));
  const p = [0, 0.5, 1.0].map((i) => strain(30, i).pitch);
  ok('A4 …and pitch rises with imbalance 0 → 0.5 → 1.0 at fixed mass',
     p[0] < p[1] && p[1] < p[2], p.map((v) => v.toFixed(3)).join(' < '));
  ok('A4a gain never exceeds 1', strain(900, 3).gain <= 1, String(strain(900, 3).gain));
  eq('A4b empty hands are silent', strain(0, 0).gain, 0);
  const tired = stateCopy(); tired.players.p0.exertion = 1;
  ok('A4c §5.2 exertion on state is a floor under the strain, with nothing in hand',
     mixFor(tired, [], {}).strain.gain > 0, String(mixFor(tired, [], {}).strain.gain));
  ok('A4d in co-op the heavier carry wins the one voice',
     mixFor(s, [], { carries: [{ mass: 10, imbalance: 0 }, { mass: 80, imbalance: 0.9 }] }).strain.pitch > 1.5);
  lines.push(`      strain gain 0/30/90 kg: ${g.map((v) => v.toFixed(3)).join(' / ')}; pitch at imbalance 0/0.5/1: ${p.map((v) => v.toFixed(2)).join(' / ')}`);
}
emit('running...');

/* ── A5. cueVolume ───────────────────────────────────────────────────────────── */
lines.push('--- A5. an impact is louder the faster (GDD §8.4) ---');
{
  ok('A5 cueVolume("IMPACT", {relVelocity: 4}) > cueVolume("IMPACT", {relVelocity: 1})',
     cueVolume('IMPACT', { relVelocity: 4 }) > cueVolume('IMPACT', { relVelocity: 1 }),
     `${cueVolume('IMPACT', { relVelocity: 4 })} vs ${cueVolume('IMPACT', { relVelocity: 1 })}`);
  eq('A5 cueVolume("IMPACT", {relVelocity: minVelocity − 0.01}) === 0', cueVolume('IMPACT', { relVelocity: AUDIO.impact.minVelocity - 0.01 }), 0);
  ok('A5a …and at 1 m/s it is already audible (minVelocity is below the fragile band\'s 1.1)',
     cueVolume('IMPACT', { relVelocity: 1 }) > 0 && AUDIO.impact.minVelocity < 1);
  let mono = true, prev = -1;
  for (let v = 0.5; v <= 10; v += 0.5) { const g = cueVolume('IMPACT', { relVelocity: v }); if (g < prev) mono = false; prev = g; }
  ok('A5b the curve never falls between 0.5 and 10 m/s', mono);
  near('A5c …and caps at AUDIO.impact.maxGain', cueVolume('IMPACT', { relVelocity: 40 }), AUDIO.impact.maxGain);
  eq('A5d a missing relVelocity is silent, not NaN', cueVolume('IMPACT', {}), 0);
  ok('A5e ROAD_FORCE follows severity', cueVolume('ROAD_FORCE', { severity: 1 }) > cueVolume('ROAD_FORCE', { severity: 0.5 }));
  eq('A5f any other cue is 1', cueVolume('GRIP_STARTED', {}), 1);
  lines.push(`      IMPACT volume at 1 / 2 / 4 / 8 m/s: ${[1, 2, 4, 8].map((v) => cueVolume('IMPACT', { relVelocity: v }).toFixed(3)).join(' / ')}`);
}
emit('running...');

/* ── A6. nearest-listener attenuation ────────────────────────────────────────── */
lines.push('--- A6. a rolling dolly is louder to the nearer pair of ears, by the squared law ---');
{
  const s = stateCopy();
  const dolly = { id: 'd', x: 20, y: 0.2, z: 0, speed: 1.2 };
  const nearOne = mixFor(s, [{ x: 0, z: 0 }, { x: 18, z: 0 }], { dollies: [dolly] }).roll;
  const farBoth = mixFor(s, [{ x: 0, z: 0 }, { x: 40, z: 0 }], { dollies: [dolly] }).roll;
  ok('A6 2 m from seat 1 and 20 m from seat 0 mixes louder than 20 m from both, by ≥ 4×',
     nearOne > 0 && farBoth >= 0 && nearOne >= 4 * farBoth, `${nearOne.toFixed(4)} vs ${farBoth.toFixed(4)} (×${(nearOne / Math.max(1e-9, farBoth)).toFixed(1)})`);
  near('A6a atten is squared: half the range is a quarter of the gain', atten(RANGE.roll / 2, RANGE.roll), 0.25);
  eq('A6b beyond the range it is 0, never negative', atten(RANGE.roll * 2, RANGE.roll), 0);
  eq('A6c a dolly slower than AUDIO.roll.minSpeed is silent', mixFor(s, [{ x: 0, z: 0 }], { dollies: [{ ...dolly, x: 1, speed: AUDIO.roll.minSpeed * 0.5 }] }).roll, 0);
  eq('A6d …and so is one with nobody to hear it', mixFor(s, [], { dollies: [dolly] }).roll, 0);
  ok('A6e a faster dolly is louder at the same distance',
     mixFor(s, [{ x: 0, z: 0 }], { dollies: [{ ...dolly, x: 5, speed: 1.5 }] }).roll >
     mixFor(s, [{ x: 0, z: 0 }], { dollies: [{ ...dolly, x: 5, speed: 0.6 }] }).roll);
  lines.push(`      roll: near ${nearOne.toFixed(4)}, far ${farBoth.toFixed(4)}, ratio ${(nearOne / Math.max(1e-9, farBoth)).toFixed(1)}× (RANGE.roll ${RANGE.roll} m)`);
}
emit('running...');

/* ── A7. no AudioContext ─────────────────────────────────────────────────────── */
lines.push('--- A7. a browser with no AudioContext: silent, non-fatal (GDD §22.4) ---');
{
  window.AudioContext = undefined; window.webkitAudioContext = undefined;
  const b = new EventBus();
  const a = new GameAudio(b);
  eq('A7 with no AudioContext, arm() returns false', a.arm(), false);
  eq('A7a …and it says so', a.armed, false);
  let threw = null;
  try {
    for (let i = 0; i < 300; i++) {
      b.emit(EVENTS.IMPACT, { entityId: 'x', relVelocity: 3, position: { x: 1, y: 0, z: 1 }, materials: ['wood'] }, i * 16);
      a.update(game.state, { nowMs: i * 16 }, [{ x: 0, z: 0, fx: 0, fz: -1 }], 1 / 60);
    }
  } catch (e) { threw = e; }
  ok('A7 update() 300 times (with an impact each) never throws', !threw, threw && threw.message);
  eq('A7 info().voices === 0', a.info().voices, 0);
  eq('A7b arm() a second time is still false and does not retry into a throw', a.arm(), false);
  ok('A7c the caption still happened without a context (§21.4: subtitles do not need speakers)',
     !!a.lastCaption(299 * 16) && a.lastCaption(299 * 16).text === CUES.IMPACT.variants.wood.caption,
     JSON.stringify(a.lastCaption(299 * 16)));
  // A context whose constructor throws is the same case.
  window.AudioContext = function () { throw new Error('refused (m18 A7d stub)'); };
  const a2 = new GameAudio(new EventBus());
  eq('A7d a constructor that throws → arm() false, no throw', a2.arm(), false);
  eq('A7d1 …and the layer is marked dead', a2.dead, true);
  restoreAC();
  ok('A7e the real constructor is back', window.AudioContext === realAC);
  a.dispose(); a2.dispose();
}
emit('running...');

/* ── A8. captions on the HUD ─────────────────────────────────────────────────── */
lines.push('--- A8. the caption line (GDD §21.4 Hearing, §26.5 "subtitles exist") ---');
{
  ok('A8 fixture: the live layer is enabled and NOT armed (no gesture in this harness)', audio.enabled && !audio.armed, JSON.stringify(audio.info()));
  ok('A8 fixture: every HUD has a caption line, shown by default', huds.every((h) => h.caption && h.captionsEnabled));
  const payload = { relVelocity: 3, materials: ['wood'] };
  const want = resolveCue('IMPACT', payload).caption;
  const t0 = game.clock.simTimeMs;
  bus.emit(EVENTS.IMPACT, payload, t0);
  M.audioFrame();
  M.feedHuds();
  eq('A8 after bus.emit(IMPACT, {relVelocity: 3, materials: ["wood"]}) the HUD caption text equals that cue\'s caption',
     huds[0].caption.textContent, want);
  ok('A8a …with no context armed at all', !audio.armed);
  ok('A8a1 …and the caption is visible (a layout box, not display:none)', huds[0].caption.offsetParent !== null);
  const before = huds[0].caption.innerHTML;
  M.feedHuds();
  eq('A8a2 feeding the same caption again does not touch the DOM (m11 F9\'s gate)', huds[0].caption.innerHTML, before);
  const n = Math.ceil((AUDIO.captionMs + 100) / FRAME) + 1;
  frames(n);
  M.feedHuds();
  eq(`A8 after AUDIO.captionMs + 100 ms of driven sim frames (${n} frames) it is empty`, huds[0].caption.textContent, '');
  ok('A8b …and lastCaption() says so', audio.lastCaption(game.clock.simTimeMs) === null);

  // With a position: a direction glyph from this seat's facing (§21.4 "subtitles with direction").
  const me = movers[M.activeMoverIndex];
  const p = me.controller.position, f = me.rig.forwardFlat();
  const ahead = { x: p.x + f.x * 6, y: p.y, z: p.z + f.z * 6 };
  bus.emit(EVENTS.IMPACT, { ...payload, position: ahead }, game.clock.simTimeMs);
  M.audioFrame(); M.feedHuds();
  eq('A8c a cue 6 m ahead carries the ↑ glyph before the words', huds[0].caption.textContent, `↑ ${want}`);
  const left = { x: p.x + (-f.z) * -6, y: p.y, z: p.z + f.x * -6 };   // rotate forward 90° to the left
  frames(10);
  bus.emit(EVENTS.IMPACT, { ...payload, position: left }, game.clock.simTimeMs);
  M.audioFrame(); M.feedHuds();
  eq('A8c1 …one to the left carries ←', huds[0].caption.textContent, `← ${want}`);
  const W = window.innerWidth, H = window.innerHeight;
  const r = huds[0].caption.getBoundingClientRect();
  ok('A8c2 §21.1: the caption sits in the bottom third, clear of the working area', r.top > H * 2 / 3 && r.left > W / 6, `top ${r.top.toFixed(0)} of ${H}`);

  // The captions switch (M4 card, shell key): hidden is hidden, and it never appears.
  setControl('captions', false);
  ok('A8d with settings captions off every seat\'s line is hidden', huds.every((h) => !h.captionsEnabled && h.caption.hidden));
  frames(10);
  bus.emit(EVENTS.IMPACT, payload, game.clock.simTimeMs);
  M.audioFrame(); M.feedHuds();
  ok('A8d …and a new cue never appears (no layout box)', huds[0].caption.offsetParent === null);
  eq('A8d1 …persisted in the shell save', load().shell.captions, false);
  setControl('captions', true);
  M.feedHuds();
  ok('A8e switched back on it shows the current caption at once', huds[0].captionsEnabled && huds[0].caption.textContent === want && huds[0].caption.offsetParent !== null,
     huds[0].caption.textContent);
  eq('A8e1 …persisted', load().shell.captions, true);
  frames(n);
  M.feedHuds();

  // Pure: the glyph and the pan from a facing and a point.
  const fwd = { x: 0, z: 0, fx: 0, fz: -1 };
  eq('A8f directionGlyph: ahead is ↑', directionGlyph(fwd, { x: 0, z: -5 }), '↑');
  eq('A8f1 …behind is ↓', directionGlyph(fwd, { x: 0, z: 5 }), '↓');
  eq('A8f2 …left is ←', directionGlyph(fwd, { x: -5, z: 0 }), '←');
  eq('A8f3 …right is →', directionGlyph(fwd, { x: 5, z: 0 }), '→');
  eq('A8f4 …at your feet (within captionNearM) is nothing', directionGlyph(fwd, { x: 0.1, z: -0.2 }), '');
  eq('A8f5 …and no position is nothing', directionGlyph(fwd, null), '');
  ok('A8g panFor: left is negative, right positive, ahead 0',
     panFor(fwd, { x: -5, z: 0 }) < -0.99 && panFor(fwd, { x: 5, z: 0 }) > 0.99 && Math.abs(panFor(fwd, { x: 0, z: -5 })) < 1e-9);
}
emit('running...');

/* ── A9. bounded ─────────────────────────────────────────────────────────────── */
lines.push('--- A9. a thousand impacts in one frame stay bounded (GDD §26.6) ---');
{
  window.AudioContext = FakeAudioContext;
  const b = new EventBus();
  const a = new GameAudio(b);
  eq('A9 fixture: arm() against the stand-in context succeeds', a.arm(), true);
  const fake = a.ctx;
  ok('A9 fixture: it built the graph (master, buses, loops)', fake instanceof FakeAudioContext && fake.created.gains >= 4 && fake.created.oscillators >= 2 && fake.created.sources >= 3,
     JSON.stringify(fake.created));
  const L = [{ x: 0, z: 0, fx: 0, fz: -1 }];
  for (let i = 0; i < 1000; i++) {
    b.emit(EVENTS.IMPACT, { entityId: 'e' + i, relVelocity: 3, position: { x: 2, y: 0, z: -2 }, materials: ['wood'] }, 500);
  }
  ok('A9 1000 IMPACT events in one frame → info().queued ≤ AUDIO.maxVoices', a.info().queued <= AUDIO.maxVoices, String(a.info().queued));
  a.update(game.state, { nowMs: 500 }, L, 1 / 60);
  ok('A9 …→ info().voices ≤ AUDIO.maxVoices', a.info().voices <= AUDIO.maxVoices, String(a.info().voices));
  ok('A9 …and the internal cue timestamp map has ≤ Object.keys(CUES).length entries',
     Object.keys(a.lastCueAt).length <= Object.keys(CUES).length, String(Object.keys(a.lastCueAt).length));
  eq('A9a the queue is drained by one frame', a.info().queued, 0);
  ok('A9b the plumbing really ran: the stand-in scheduled oscillators and a noise burst',
     a.stats.played >= 1 && fake.started > 0, `played ${a.stats.played}, started ${fake.started}`);
  ok('A9b1 …and the placed cue was panned', fake.created.panners >= 1, String(fake.created.panners));
  lines.push(`      1000 impacts: queued ${AUDIO.maxVoices} max, played ${a.stats.played}, dropped at the queue ${a.stats.droppedQueue}, voices ${a.info().voices}`);

  // Every cue type once, a second apart, with the clock moving: all play, voices stay bounded.
  fake.currentTime = 10;
  const captions = [];
  let maxVoices = 0;
  let t = 10000;
  const samples = [
    [EVENTS.IMPACT, { entityId: 'x', relVelocity: 2, position: { x: 1, y: 0, z: -3 }, materials: ['metal'] }],
    [EVENTS.DAMAGE_APPLIED, { entityId: 'x', band: 'cracked', cost: 12 }],
    [EVENTS.GRIP_STARTED, { playerId: 'p0', hand: 'left', entityId: 'x' }],
    [EVENTS.GRIP_ENDED, { playerId: 'p0', hand: 'left', entityId: 'x', reason: 'slipped' }],
    [EVENTS.STRAP_CHANGED, { strapId: 's1', entityId: 'x', state: 'failed', tension: 900 }],
    [EVENTS.TOOL_STATE, { toolId: 't1', entityId: 'x', state: 'attached' }],
    [EVENTS.PART_CHANGED, { entityId: 'x', part: 'legs', action: 'removed' }],
    [EVENTS.CARGO_STATE, { entityId: 'x', loaded: true, trip: 1 }],
    [EVENTS.ROAD_FORCE, { roadType: 'hardBrake', label: 'Traffic light', severity: 1 }],
    [EVENTS.RECOVERY, { entityId: 'x', reason: 'out of bounds', fee: 45, newTransform: { x: 0, y: 0, z: 0 } }],
    [EVENTS.CONTRACT_PHASE, { from: PHASES.DELIVERY, to: PHASES.SETTLEMENT }],
  ];
  for (const [type, payload] of samples) {
    t += 1000; fake.currentTime += 1;
    b.emit(type, payload, t);
    a.update(game.state, { nowMs: t, positionOf: () => ({ x: 1, y: 0, z: 1 }) }, L, 1 / 60);
    captions.push(a.lastCaption(t) && a.lastCaption(t).text);
    maxVoices = Math.max(maxVoices, a.info().voices);
  }
  eq('A9c every cued event type fired once, a second apart, produced a caption', captions.filter(Boolean).length, samples.length);
  ok('A9c1 …and each is that row\'s caption', captions.every((c, i) => c === resolveCue(samples[i][0], samples[i][1]).caption), captions.join(' | '));
  ok('A9c2 …with the live voice count never above the cap', maxVoices <= AUDIO.maxVoices, String(maxVoices));
  eq('A9c3 …every one of them played', a.stats.played, 1 + samples.length);   // the first impact of the flood, then these
  // Silent events are silent: no caption, no voice.
  const playedBefore = a.stats.played;
  for (const name of SILENT_EVENTS) { t += 1000; b.emit(EVENTS[name], {}, t); }
  a.update(game.state, { nowMs: t }, L, 1 / 60);
  eq('A9d the silent events played nothing', a.stats.played, playedBefore);
  // Time passes: voices end, the count returns to zero.
  fake.currentTime += 10;
  a.update(game.state, { nowMs: t + 1000 }, L, 1 / 60);
  eq('A9e ten seconds later every voice has ended', a.info().voices, 0);
  // minGapMs: two of the same cue inside the gap are one sound.
  const p0 = a.stats.played;
  t += 1000;
  b.emit(EVENTS.GRIP_STARTED, { entityId: 'x' }, t);
  b.emit(EVENTS.GRIP_STARTED, { entityId: 'x' }, t + 10);
  a.update(game.state, { nowMs: t + 10 }, L, 1 / 60);
  eq('A9f two grabs 10 ms apart are one grab (minGapMs)', a.stats.played - p0, 1);
  // A reset flushes the queue and the stamps.
  b.emit(EVENTS.IMPACT, { relVelocity: 3, materials: ['wood'] }, t + 20);
  b.emit(EVENTS.SIM_RESET, {}, 0);
  eq('A9g SIM_RESET empties the queue and the stamp map', `${a.info().queued}/${Object.keys(a.lastCueAt).length}`, '0/0');
  // The suspended-context case: nothing is scheduled (a suspended clock never ends a voice).
  fake.state = 'suspended';
  const p1 = a.stats.played;
  b.emit(EVENTS.IMPACT, { relVelocity: 3, materials: ['wood'] }, t + 2000);
  a.update(game.state, { nowMs: t + 2000 }, L, 1 / 60);
  eq('A9h with the context suspended a cue is captioned but not scheduled', `${a.stats.played - p1}/${!!a.lastCaption(t + 2000)}`, '0/true');
  fake.state = 'running';
  a.dispose();
  eq('A9i dispose() closes the context', fake.state, 'closed');
  restoreAC();
}
emit('running...');

/* ── A10. ?audio=off ─────────────────────────────────────────────────────────── */
lines.push('--- A10. ?audio=off is a layer that does nothing ---');
{
  eq('A10 audioEnabledFrom("?audio=off") === false', audioEnabledFrom('?audio=off'), false);
  eq('A10a …"?tier=gpu&audio=off" too', audioEnabledFrom('?tier=gpu&audio=off'), false);
  eq('A10b …"?audio=on", "" and undefined are on', `${audioEnabledFrom('?audio=on')}/${audioEnabledFrom('')}/${audioEnabledFrom(undefined)}`, 'true/true/true');
  window.AudioContext = FakeAudioContext;
  const b = new EventBus();
  const a = new GameAudio(b, { enabled: false });
  eq('A10c a disabled layer: enabled === false', a.enabled, false);
  eq('A10c1 …arm() is false and builds nothing', `${a.arm()}/${a.armed}`, 'false/false');
  const info0 = JSON.stringify(a.info());
  b.emit(EVENTS.IMPACT, { relVelocity: 3, materials: ['wood'] }, 100);
  eq('A10c2 …update() returns null', a.update(game.state, { nowMs: 100 }, [], 1 / 60), null);
  eq('A10c3 …without touching info()', JSON.stringify(a.info()), info0);
  eq('A10c4 …and no caption', a.lastCaption(100), null);
  restoreAC();
  a.dispose();
  // The live layer, through the api flag (the location cannot be stubbed after boot).
  audio.enabled = false;
  const liveInfo = JSON.stringify(audio.info());
  bus.emit(EVENTS.IMPACT, { relVelocity: 3, materials: ['wood'] }, game.clock.simTimeMs);
  eq('A10d api.audio.enabled = false → audioFrame() returns null', M.audioFrame(), null);
  eq('A10d1 …and info() is untouched (nothing queued)', JSON.stringify(audio.info()), liveInfo);
  audio.enabled = true;
  ok('A10e the boot did not see ?audio=off (the harness URL carries no audio parameter)', audioEnabledFrom(location.search) === true);
}
emit('running...');

/* ── A11. the card ───────────────────────────────────────────────────────────── */
lines.push('--- A11. the Sound group on the settings card moves its consumers (GDD §21.4, §26.5) ---');
{
  const keys = M.settingsPanel.keys();
  deep('A11 the card carries the four Sound controls', ['audioMaster', 'audioUi', 'audioWorld', 'captions'].filter((k) => keys.includes(k)), ['audioMaster', 'audioUi', 'audioWorld', 'captions']);
  const calls = { master: [], bus: [] };
  const realMaster = audio.setMaster, realBus = audio.setBus;
  audio.setMaster = function (v) { calls.master.push(v); return realMaster.call(this, v); };
  audio.setBus = function (n, v) { calls.bus.push([n, v]); return realBus.call(this, n, v); };
  setControl('audioMaster', 0.4);
  ok('A11 the master slider calls audio.setMaster(0.4)', calls.master.length === 1 && Math.abs(calls.master[0] - 0.4) < 1e-9, JSON.stringify(calls.master));
  near('A11 …and the level is 0.4', audio.levels.master, 0.4);
  setControl('audioUi', 0.3);
  ok('A11 the UI slider calls audio.setBus("ui", 0.3)', calls.bus.some(([n, v]) => n === 'ui' && Math.abs(v - 0.3) < 1e-9), JSON.stringify(calls.bus));
  setControl('audioWorld', 0.7);
  ok('A11 the world slider calls audio.setBus("world", 0.7)', calls.bus.some(([n, v]) => n === 'world' && Math.abs(v - 0.7) < 1e-9), JSON.stringify(calls.bus));
  near('A11a …levels: ui 0.3', audio.levels.ui, 0.3);
  near('A11a …levels: world 0.7', audio.levels.world, 0.7);
  setControl('captions', false);
  ok('A11 the captions checkbox hides every seat\'s caption line', huds.every((h) => !h.captionsEnabled));
  setControl('captions', true);
  ok('A11 …and shows it again', huds.every((h) => h.captionsEnabled));
  const saved = load().shell;
  ok('A11b the four persisted in the shell save', Math.abs(saved.audioMaster - 0.4) < 1e-9 && Math.abs(saved.audioUi - 0.3) < 1e-9 && Math.abs(saved.audioWorld - 0.7) < 1e-9 && saved.captions === true,
     JSON.stringify(saved));
  ok('A11b1 …under shell — the save\'s top-level key set is unchanged (m16 V4c)',
     Object.keys(JSON.parse(localStorage.getItem(SAVE_KEY))).sort().join(',') === 'bestInvoice,bindings,build,runs,schema,settings,shell');
  audio.setMaster = realMaster; audio.setBus = realBus;
  panel().querySelector('[data-act="defaults"]').click();
  ok('A11c Defaults puts the levels back', Math.abs(audio.levels.master - SHELL_DEFAULTS.audioMaster) < 1e-9 && Math.abs(audio.levels.ui - SHELL_DEFAULTS.audioUi) < 1e-9 &&
     Math.abs(audio.levels.world - SHELL_DEFAULTS.audioWorld) < 1e-9 && huds[0].captionsEnabled === SHELL_DEFAULTS.captions, JSON.stringify(audio.levels));
  ok('A11c1 …and the defaults are AUDIO\'s', SHELL_DEFAULTS.audioMaster === AUDIO.master && SHELL_DEFAULTS.audioUi === AUDIO.buses.ui && SHELL_DEFAULTS.audioWorld === AUDIO.buses.world);
  deep('A11c2 the slider ranges exist for all three', ['audioMaster', 'audioUi', 'audioWorld'].map((k) => !!SETTINGS.ranges[k]), [true, true, true]);
  // The levels reach the graph: an armed layer's gain nodes follow the setters.
  window.AudioContext = FakeAudioContext;
  const a = new GameAudio(null);
  a.setMaster(0.5); a.setBus('world', 0.25);
  eq('A11d setMaster/setBus before arm() are remembered', `${a.levels.master}/${a.levels.world}`, '0.5/0.25');
  a.arm();
  ok('A11d1 …and land on the nodes at arm()', a.master.gain.value === 0.5 && a.busNodes.world.gain.value === 0.25, `${a.master.gain.value}/${a.busNodes.world.gain.value}`);
  a.setBus('ui', 0.1);
  eq('A11d2 …and after it', a.busNodes.ui.gain.value, 0.1);
  eq('A11d3 an unknown bus is refused', a.setBus('bogus', 1), null);
  eq('A11d4 values clamp to 0..1 and NaN is 0', `${a.setMaster(7)}/${a.setMaster(-1)}/${a.setMaster('x')}`, '1/0/0');
  ok('A11d5 foley sits under world (one slider covers both)', a.busNodes.foley.connections[0] === a.busNodes.world);
  a.dispose();
  restoreAC();
  ok('A11e none of the four is in game.state', !/audioMaster|audioUi|audioWorld|captions/.test(JSON.stringify(game.state)));
}
emit('running...');

/* ── A12. audio never writes state ───────────────────────────────────────────── */
lines.push('--- A12. same seed, same script, with the layer attached+armed and detached (GDD §22.4) ---');
{
  const drain = () => { M.pendingNotices.splice(0, M.pendingNotices.length); };
  function scriptedRun(withAudio) {
    if (M.invoiceScreen.visible) M.invoiceScreen.onReplay(); else { M.resetContract(); game.setPaused(false); }
    drain();
    frames(20);
    const tv = byDef('tv_55_01');
    parkAt(tv, -38, tv.def.dimensions.y / 2 + 1.5, 30, Math.PI / 2);
    const box = byDef('box_small_01');
    parkAt(box, -35, box.def.dimensions.y / 2 + 1.0, 30);
    for (let i = 0; i < 300; i++) {
      game.frame(FRAME);
      if (withAudio) { M.audioFrame(1 / 60); M.feedHuds(); }
    }
    damage.flush(game.clock.simTimeMs);
    return stateCopy();
  }
  audio.detach();
  const A = scriptedRun(false);
  window.AudioContext = FakeAudioContext;
  audio.attach(bus);
  eq('A12 fixture: the live layer arms against the stand-in', audio.arm(), true);
  const fake = audio.ctx;
  const playedBefore = audio.stats.played;
  const B = scriptedRun(true);
  ok('A12 fixture: the attached run made sound (cues played, sources started)', audio.stats.played > playedBefore && fake.started > 0, `played ${audio.stats.played - playedBefore}, started ${fake.started}`);
  ok('A12 fixture: the script damaged something', A.ledger.itemDamage.length >= 1 && B.ledger.itemDamage.length >= 1, `${A.ledger.itemDamage.length}/${B.ledger.itemDamage.length}`);
  audio.detach();
  const C = scriptedRun(false);
  deep('A12 game.state after 300 frames with the layer attached deep-equals the run without it', B, A);
  ok('A12a control: two detached runs agree too (the reset replays deterministically)', deepEq(A, C));
  deep('A12b …the invoice-bearing parts in particular: ledger', B.ledger, A.ledger);
  deep('A12b1 …players', B.players, A.players);
  deep('A12b2 …telemetry', B.telemetry, A.telemetry);
  ok('A12c game.state carries nothing of the layer', !/audio|caption|voices/i.test(JSON.stringify(B)));
  lines.push(`      A (off): ${A.ledger.itemDamage.length} ledger lines; B (on): ${B.ledger.itemDamage.length}, ${audio.stats.played - playedBefore} cues played; C (off): ${C.ledger.itemDamage.length}`);
  // Leave the live layer as boot made it: attached, unarmed (the stand-in is disposed).
  audio.attach(bus);
  restoreAC();
  const ctx = audio.ctx;
  audio.ctx = null; audio.master = null; audio.busNodes = {}; audio.loops = {}; audio.noiseBuf = null; audio._voices.length = 0;
  if (ctx && ctx.close) ctx.close();
  ok('A12d the live layer is back to attached and unarmed', audio.attached && !audio.armed && !audio.dead);
}
emit('running...');

/* ── A13. the primitives ─────────────────────────────────────────────────────── */
lines.push('--- A13. tone / noiseBurst / makeNoise, on the stand-in ---');
{
  const ctx = new FakeAudioContext();
  const busNode = ctx.createGain();
  const b1 = makeNoise(ctx), b2 = makeNoise(ctx);
  const d1 = b1.getChannelData(0), d2 = b2.getChannelData(0);
  let same = d1.length === d2.length && d1.length === ctx.sampleRate * AUDIO.synth.noiseSeconds;
  for (let i = 0; same && i < d1.length; i += 997) if (d1[i] !== d2[i]) same = false;
  ok('A13 makeNoise is seeded: two buffers are identical (a repeated playtest sounds the same)', same);
  let peak = 0; for (let i = 0; i < d1.length; i += 13) peak = Math.max(peak, Math.abs(d1[i]));
  ok('A13a …and it is not silence', peak > 0.1, String(peak));
  const osc0 = ctx.created.oscillators;
  eq('A13b tone() schedules one oscillator', `${tone(ctx, busNode, 0.3, 440, 220, 0.1, 'square', 0, 0)}/${ctx.created.oscillators - osc0}`, 'true/1');
  eq('A13b1 …panned when asked', `${tone(ctx, busNode, 0.3, 440, 440, 0.1, 'sine', 0, -0.5)}/${ctx.created.panners}`, 'true/1');
  eq('A13b2 …and refuses silence', tone(ctx, busNode, 0, 440, 440, 0.1, 'sine', 0, 0), false);
  eq('A13b3 …or a missing bus', tone(ctx, null, 0.3, 440, 440, 0.1, 'sine', 0, 0), false);
  eq('A13c noiseBurst() schedules one buffer source', `${noiseBurst(ctx, busNode, b1, 0.3, 0.1, 800, 0)}/${ctx.created.sources}`, 'true/1');
  eq('A13c1 …and refuses a missing buffer', noiseBurst(ctx, busNode, null, 0.3, 0.1, 800, 0), false);
}

/* ── Z. teardown ──────────────────────────────────────────────────────────────── */
lines.push('--- Z. it still runs, and nothing survives this suite ---');
{
  restoreAC();
  const before = physics.stats.bodies;
  frames(60);
  eq('Z1 no bodies leaked over 60 frames', physics.stats.bodies, before);
  ok('Z2 state is still plain serializable data (§22.4)', (() => { try { JSON.stringify(game.state); return true; } catch (e) { return false; } })());
  ok('Z3 the live layer is enabled, attached and unarmed', audio.enabled && audio.attached && !audio.armed, JSON.stringify(audio.info()));
  ok('Z4 the real AudioContext constructor is back', window.AudioContext === realAC);
  eq('Z5 the game ends the suite running, solo, card hidden', `${game.state.paused}/${M.seatCount}/${panel().hidden}`, 'false/1/true');
  ok('Z6 no error banner appeared during the suite', banner() === '', banner());
}

} catch (e) {
  fails++;
  lines.push(`FAIL  suite threw  <- ${e && e.message}`);
  lines.push((e && e.stack || '').split('\n').slice(0, 6).join('\n'));
}

// TEARDOWN: leave no save behind for the next run, and the real constructor in place.
restoreAC();
try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* nothing to clear */ }
emit();
