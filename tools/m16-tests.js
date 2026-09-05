/* Phase 11 build-side M4 suite — settings and the versioned save.
 *
 * GDD §21.4 (Input / Motor / Vision rows), §26.5 "Grip toggle, sensitivity, … UI scale …
 * exist", §26.6 "Save/settings reject incompatible versions safely", §21.2 "A retry keeps
 * settings", §13.4 saved best invoice, §27.1 save-version migration.
 *
 * THE CLAIM UNDER TEST is INDEX.md's "assert CONSUMPTION, not presence": a settings card is
 * not a list of controls, it is a list of numbers that something reads. So every setting is
 * asserted at its consumer — the look accumulator a synthetic mousemove lands in, the latch a
 * toggle-grip press sets, the deadzone the stick rescales through, the computed font-size of
 * the prompt, the camera rig's boom — and U2 walks every `[data-setting]` on the card and
 * fails on the first one whose consumer does not move.
 *
 * The save is the other half: load() must NEVER throw and must hand back defaults for a
 * missing key, junk, a non-object and any schema but this one — without touching the stored
 * blob — and a refused store (quota, private mode) must leave the invoice sheet showing.
 *
 * localStorage 'mfh.save' is cleared at the START and the END: headless Chrome under
 * --user-data-dir has a working localStorage, and a run that left a saved mouse sensitivity
 * behind would boot the next suite with it.
 */

import { load, save, clearSave, defaultSave, SAVE_KEY, SAVE_SCHEMA, SHELL_DEFAULTS } from '../src/core/save.js';
import { Input, DEFAULT_SETTINGS, PAD, SEAT_BINDINGS, bindingConflicts, bindingDiffCount } from '../src/core/input.js';   // SEAT_BINDINGS, bindingConflicts, bindingDiffCount: M18
import { BUILD, RENDER, SETTINGS, SIM, COOP } from '../src/config.js';

const lines = [];
let passes = 0, fails = 0;
function ok(name, cond, detail = '') {
  if (cond) { passes++; lines.push(`PASS  ${name}`); }
  else { fails++; lines.push(`FAIL  ${name}${detail ? '  <- ' + detail : ''}`); }
}
const eq = (n, a, b) => ok(n, a === b, `got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const near = (n, a, b, tol = 1e-6) => ok(n, Math.abs(a - b) <= tol, `got ${a}, want ${b} ±${tol}`);
/** Structural deep-equal, key order ignored. */
function deepEq(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
  if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return false;
  return ka.every((k) => deepEq(a[k], b[k]));
}
const deep = (n, a, b) => ok(n, deepEq(a, b), `got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

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

const { game, input, huds, title, movers } = M;
const FRAME = 16.667;
const frame = (n = 1) => { for (let i = 0; i < n; i++) game.frame(FRAME); };
const banner = () => { const b = document.getElementById('err-banner'); return b ? b.textContent : ''; };
const panel = () => document.getElementById('settings-screen');
const control = (key) => panel().querySelector(`[data-setting="${key}"]`);
/** Drive a card control the way a hand does: set the value, fire the event the card listens to. */
function setControl(key, value) {
  const c = control(key);
  if (!c) throw new Error('no control for ' + key);
  if (c.type === 'checkbox') { c.checked = !!value; c.dispatchEvent(new Event('change', { bubbles: true })); }
  else if (c.type === 'range') { c.value = String(value); c.dispatchEvent(new Event('input', { bubbles: true })); }
  else { c.value = String(value); c.dispatchEvent(new Event('change', { bubbles: true })); }
  return c;
}
const tsNow = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ts'));
const mouse = (dx, dy) => window.dispatchEvent(new MouseEvent('mousemove', { movementX: dx, movementY: dy, bubbles: true }));

// SETUP: nothing from a previous run may survive into this one.
try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* no storage — the suite still runs */ }

try {

/* ── V. the versioned save (§26.6, §27.1) ─────────────────────────────────────── */
lines.push('--- V. the versioned save (GDD §26.6, §27.1, §21.2) ---');
{
  const pick = (o, ks) => Object.fromEntries(ks.map((k) => [k, o[k]]));
  eq('V0 the key and schema are the configured ones', `${SAVE_KEY}/${SAVE_SCHEMA}`, `${SETTINGS.saveKey}/${SETTINGS.schema}`);
  ok('V0a localStorage is live in this harness (the rest of the section is real)',
     (() => { try { localStorage.setItem('__m16', '1'); localStorage.removeItem('__m16'); return true; } catch (e) { return false; } })());

  localStorage.removeItem(SAVE_KEY);
  deep('V1 localStorage cleared → load() deep-equals {settings: DEFAULT_SETTINGS, bestInvoice: null}',
       pick(load(), ['settings', 'bestInvoice']), { settings: { ...DEFAULT_SETTINGS }, bestInvoice: null });
  deep('V1a …and the shell settings are their defaults (uiScale 1, the config boom, tier auto)',
       load().shell, { ...SHELL_DEFAULTS });
  ok('V1b DEFAULT_SETTINGS carries invertLookX beside invertLookY',
     'invertLookX' in DEFAULT_SETTINGS && 'invertLookY' in DEFAULT_SETTINGS);
  ok('V1c a load never writes: the key is still absent', localStorage.getItem(SAVE_KEY) === null);

  // §26.6 / §27.1: a foreign schema is refused, and the blob is left EXACTLY as it was.
  const foreign = JSON.stringify({ schema: 0, settings: { mouseSensitivity: 3 } });
  localStorage.setItem(SAVE_KEY, foreign);
  deep('V2 a stored {schema:0} → load() returns defaults', load(), defaultSave());
  eq('V2a …and the stored blob is unchanged (read back byte-equal)', localStorage.getItem(SAVE_KEY), foreign);
  localStorage.setItem(SAVE_KEY, JSON.stringify({ schema: SAVE_SCHEMA + 1, settings: { mouseSensitivity: 3 } }));
  deep('V2b a FUTURE schema is refused the same way (no half-applied settings)', load(), defaultSave());
  localStorage.setItem(SAVE_KEY, JSON.stringify([1, 2, 3]));
  deep('V2c a JSON array is not a save', load(), defaultSave());
  localStorage.setItem(SAVE_KEY, JSON.stringify('phase-16'));
  deep('V2d …nor is a JSON string', load(), defaultSave());
  localStorage.setItem(SAVE_KEY, JSON.stringify({ schema: SAVE_SCHEMA, settings: 'junk', shell: 7, bestInvoice: 'no' }));
  deep('V2e the right schema with junk fields loads as defaults, field by field', load(), defaultSave());

  localStorage.setItem(SAVE_KEY, 'not json');
  let threw = false, got = null;
  try { got = load(); } catch (e) { threw = true; }
  ok('V3 "not json" → defaults, no throw', !threw && deepEq(got, defaultSave()), threw ? 'threw' : JSON.stringify(got));

  const x = {
    settings: { ...DEFAULT_SETTINGS, mouseSensitivity: 1.7, gripMode: 'toggle', invertLookY: true, stickDeadzone: 0.3 },
    // M9 (Phase 11 build-side): the shell carries the three bus levels and the captions switch.
    // M16: …and the camera-shake switch (a non-default, so the round-trip is real).
    shell: { uiScale: 1.3, cameraDistance: 5.5, tier: 'gpu', audioMaster: 0.8, audioUi: 0.6, audioWorld: 0.9, captions: false, cameraShake: false },
    bestInvoice: { profit: 123.45, grade: 'B', score: 71, delivered: 20, total: 23, build: 'phase-16', date: '2026-09-04' },
    runs: [],   // M6: the §27.4 kept-runs section (m17 R5 fills it; here it round-trips empty)
    // M18: the §21.4 remap section — the DIFF from the shipped bindings (m26 B6 fills it; empty here).
    bindings: {},
  };
  eq('V4 save(x) reports success', save(x), true);
  deep('V4 …then load() deep-equals x', load(), x);
  const blob = JSON.parse(localStorage.getItem(SAVE_KEY));
  eq('V4a the blob carries the schema', blob.schema, SAVE_SCHEMA);
  eq('V4b …and the build label that wrote it (§27.1)', blob.build, BUILD.label);
  // M6 added `runs` (§27.4 kept run records) as the sixth top-level key; M18 `bindings` as the seventh.
  eq('V4c …and exactly the seven documented sections beside them',
     Object.keys(blob).sort().join(','), 'bestInvoice,bindings,build,runs,schema,settings,shell');

  // A save is a file a player can edit. Same validator as the live Input (input.js).
  localStorage.setItem(SAVE_KEY, JSON.stringify({
    schema: SAVE_SCHEMA, settings: { mouseSensitivity: 400, bogus: 1, gripMode: 'sideways' },
    shell: { uiScale: 99, cameraDistance: -3, tier: 'quantum' }, bestInvoice: { profit: 'lots' },
  }));
  const edited = load();
  eq('V4d a hand-edited 400× mouse loads CLAMPED to the range', edited.settings.mouseSensitivity, SETTINGS.ranges.mouseSensitivity.max);
  ok('V4e …an unknown key is dropped and a bad gripMode falls back',
     !('bogus' in edited.settings) && edited.settings.gripMode === DEFAULT_SETTINGS.gripMode, JSON.stringify(edited.settings));
  eq('V4f …the shell clamps too', `${edited.shell.uiScale}/${edited.shell.cameraDistance}/${edited.shell.tier}`,
     `${SETTINGS.ranges.uiScale.max}/${SETTINGS.ranges.cameraDistance.min}/auto`);
  eq('V4g …and a best invoice without a finite profit is no best invoice', edited.bestInvoice, null);
  localStorage.removeItem(SAVE_KEY);
  eq('V4h clearSave() on an empty store is a quiet true', clearSave(), true);

  /* THE REFUSED STORE. Private mode, a full quota, a locked-down profile: setItem throws.
   * save() must say false; settle() must still put the invoice on screen (m11 G2/G3). */
  const realSet = Storage.prototype.setItem;
  Storage.prototype.setItem = function () { throw new Error('QuotaExceededError (m16 V5 stub)'); };
  eq('V5a save() with a throwing setItem returns false', save(x), false);
  let settleThrew = null;
  try { M.settle(); } catch (e) { settleThrew = e; }
  const sheet = M.invoiceScreen;
  ok('V5 M.settle() with a throwing setItem still shows the invoice (m11 G2/G3)',
     !settleThrew && sheet.visible && !sheet.el.hidden && /INVOICE/.test(sheet.el.textContent) &&
     /PROFIT|LOSS/.test(sheet.el.textContent), settleThrew ? settleThrew.message : sheet.el.textContent.slice(0, 80));
  ok('V5b …and no #err-banner', banner() === '', banner());
  ok('V5c …and the sheet already names the best-so-far line (in memory, unsaved)',
     /best so far/i.test((sheet.el.querySelector('.best') || {}).textContent || ''),
     (sheet.el.querySelector('.best') || {}).textContent);
  Storage.prototype.setItem = realSet;
  eq('V5d the store is back', localStorage.getItem(SAVE_KEY), null);
  sheet.onReplay();
  eq('V5e replay returns to PICKUP, running', `${game.state.phase}/${game.state.paused}`, 'pickup/false');

  // The write, with the store back: §13.4's best invoice persists and the sheet quotes it.
  frame(30);
  M.settle();
  const bestEl = M.invoiceScreen.el.querySelector('.best');
  ok('V6 a second settlement shows the best-so-far line with a number',
     !!bestEl && /best so far/i.test(bestEl.textContent) && /\d+\.\d\d/.test(bestEl.textContent),
     bestEl && bestEl.textContent);
  const persisted = load().bestInvoice;
  ok('V6a …and the best invoice is in the store, equal to the one in memory',
     !!persisted && !!M.bestInvoice && Math.abs(persisted.profit - M.bestInvoice.profit) < 1e-9 &&
     persisted.grade === M.bestInvoice.grade && persisted.build === BUILD.label,
     JSON.stringify(persisted));
  ok('V6b …with every field a finite number or a short string (plain data, §22.4)',
     !!persisted && Number.isFinite(persisted.profit) && Number.isFinite(persisted.score) &&
     Number.isInteger(persisted.delivered) && Number.isInteger(persisted.total) &&
     typeof persisted.date === 'string' && persisted.date.length === 10, JSON.stringify(persisted));
  M.invoiceScreen.onReplay();
  eq('V6c …replayed, running', `${game.state.phase}/${game.state.paused}`, 'pickup/false');
  ok('V6d game.state carries no setting (m0 E8 / m12 J3: settings never enter the state)',
     !/mouseSensitivity|uiScale|gripMode|cameraDistance|invertLook/.test(JSON.stringify(game.state)));
}
emit('running...');

/* ── I. the input settings, at their consumers (§21.4) ────────────────────────── */
lines.push('--- I. input settings consumed (GDD §21.4, §26.5) ---');
{
  // Paused, so the 'look' system does not consume the accumulator between a synthetic
  // mousemove and the read, and a Mouse0 press cannot grab anything.
  game.setPaused(true);
  input.applySettings({ ...DEFAULT_SETTINGS });
  const zero = () => { input.looks[0].x = 0; input.looks[0].y = 0; };

  input.pointerLocked = true;
  zero(); mouse(10, 0);
  eq('I0 at sensitivity 1 a 10 px mousemove accumulates look.x 10', input.looks[0].x, 10);
  input.applySettings({ mouseSensitivity: 2 });
  zero(); mouse(10, 0);
  eq('I1 applySettings({mouseSensitivity: 2}) → movementX 10 → looks[0].x === 20 (was 10)', input.looks[0].x, 20);

  input.applySettings({ mouseSensitivity: 1, invertLookY: true });
  zero(); mouse(0, 5);
  eq('I2 applySettings({invertLookY: true}) → movementY 5 → looks[0].y === -5', input.looks[0].y, -5);
  eq('I2a …and x is untouched by the Y invert', input.looks[0].x, 0);

  input.applySettings({ mouseSensitivity: 2, invertLookX: true });
  zero(); mouse(10, 0);
  eq('I3 applySettings({invertLookX: true}) at 2× → movementX 10 → looks[0].x === -20', input.looks[0].x, -20);
  input.pointerLocked = false;
  zero(); mouse(10, 0);
  eq('I3a …and an unlocked pointer still accumulates nothing', input.looks[0].x, 0);
  input.applySettings({ mouseSensitivity: 1, invertLookX: false, invertLookY: false });

  // §21.4's toggle grip, resolved at the source (input.js _press) — reachable at last.
  input.clear();
  const r = input.applySettings({ gripMode: 'toggle' });
  eq('I4 applySettings({gripMode:\'toggle\'}) → _latched.size === 0', input._latched.size, 0);
  eq('I4a …and it was applied', r.applied.gripMode, 'toggle');
  input._debugPress('Mouse0'); input._debugRelease('Mouse0');
  eq('I4b press + release → isDown(\'gripLeft\') === true (latched)', input.isDown('gripLeft'), true);
  eq('I4c …analog reads full pressure from the latch', input.analog('gripLeft'), 1);
  input._debugPress('Mouse0'); input._debugRelease('Mouse0');
  eq('I4d a second press + release → false', input.isDown('gripLeft'), false);
  input._debugPress('Mouse0'); input._debugRelease('Mouse0');
  eq('I4e latched again, for the mode switch', input._latched.size, 1);
  input.applySettings({ gripMode: 'hold' });
  eq('I4f applySettings({gripMode:\'hold\'}) → _latched.size === 0', input._latched.size, 0);
  eq('I4g …and nothing is held (Mouse0 is up)', input.isDown('gripLeft'), false);
  input.applySettings({ gripMode: 'hold' });
  input._debugPress('Mouse0');
  eq('I4h hold mode follows the button (m0 B8)', input.isDown('gripLeft'), true);
  input._debugRelease('Mouse0');
  eq('I4i …and lets go with it (m0 B9)', input.isDown('gripLeft'), false);

  input.applySettings({ stickDeadzone: 0.5 });
  eq('I5 applySettings({stickDeadzone: 0.5}) → deadzone(0.4) === 0', input.deadzone(0.4), 0);
  ok('I5 …and deadzone(0.6) > 0', input.deadzone(0.6) > 0, String(input.deadzone(0.6)));
  eq('I5a …the rescale reaches 1 at full deflection', input.deadzone(1), 1);
  const bogus = input.applySettings({ bogus: 1 });
  eq('I5b applySettings({bogus: 1}) reports the key rejected', bogus.rejected.join(','), 'bogus');
  eq('I5c …and leaves the key set identical to DEFAULT_SETTINGS (+ invertLookX)',
     Object.keys(input.getSettings()).sort().join(','), Object.keys(DEFAULT_SETTINGS).sort().join(','));
  eq('I5d a 999× mouse clamps to the configured maximum', input.applySettings({ mouseSensitivity: 999 }).applied.mouseSensitivity,
     SETTINGS.ranges.mouseSensitivity.max);
  eq('I5e an unknown gripMode is rejected, not applied', input.applySettings({ gripMode: 'sideways' }).rejected.join(','), 'gripMode');
  ok('I5f getSettings() is a copy, not the live object', input.getSettings() !== input.settings);
  ok('I5g a non-object patch is reported, never thrown',
     (() => { try { return input.applySettings(null).rejected.length === 1; } catch (e) { return false; } })());

  input.applySettings({ ...DEFAULT_SETTINGS });
  input.clear();
  game.setPaused(false);

  /* FPS-INDEPENDENT LOOK. Two frames of F must equal one frame of 2F, for the key path and
   * the stick path alike; poll() with no argument is one reference frame. A standalone Input
   * so the live seats are untouched. (The brief wrote 33.333 for the long frame; 2 × 16.667 =
   * 33.334 and the claim under test is exactly "two of F equal one of 2F", so 2F it is.) */
  const inp = new Input(window, null);
  inp.setSeatCount(2);
  inp._debugPress('KeyK');                      // seat 1's lookRight
  inp.poll(FRAME); inp.poll(FRAME);
  const two = inp.looks[1].x;
  inp.looks[1].x = 0;
  inp.poll(2 * FRAME);
  const one = inp.looks[1].x;
  near('I6 two poll(16.667) with lookRight held (seat 1) equal one poll(33.334) ±1e-6', two, one);
  ok('I6a …and both moved the camera', two > 0, String(two));
  inp.looks[1].x = 0; inp.poll();
  const noArg = inp.looks[1].x;
  inp.looks[1].x = 0; inp.poll(FRAME);
  near('I6b poll() with no arg equals poll(16.667)', noArg, inp.looks[1].x);
  near('I6c …which is one keyLookRate', noArg, DEFAULT_SETTINGS.keyLookRate * FRAME / SETTINGS.lookRefFrameMs);
  inp.looks[1].x = 0; inp.poll(1000);
  near('I6d a 1000 ms frame is capped at SIM.maxFrameMs (a backgrounded tab banks no quarter-turn)',
       inp.looks[1].x, DEFAULT_SETTINGS.keyLookRate * SIM.maxFrameMs / SETTINGS.lookRefFrameMs);
  inp.looks[1].x = 0; inp.poll(NaN);
  near('I6e a NaN frame is one reference frame, not a poisoned accumulator', inp.looks[1].x, noArg);
  inp._debugRelease('KeyK');

  // The stick, through the real _pollPads path with a stubbed Standard Gamepad (m15 P7h shape).
  {
    const stub = {
      connected: true, index: 0, id: 'm16 stub (Standard Gamepad)', mapping: 'standard',
      axes: [0, 0, 1, 0],                        // right stick full right
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
    };
    navigator.getGamepads = () => [stub];
    const solo = new Input(window, null);       // solo: slot 0 → seat 0
    solo.poll(FRAME); solo.poll(FRAME);
    const padTwo = solo.looks[0].x;
    solo.looks[0].x = 0; solo.poll(2 * FRAME);
    const padOne = solo.looks[0].x;
    near('I6f the right stick: two poll(16.667) equal one poll(33.334)', padTwo, padOne);
    near('I6g …at padLookSensitivity × 10 per reference frame (2.6 × 10 = 26 units)',
         padOne / 2, DEFAULT_SETTINGS.padLookSensitivity * 10 * FRAME / SETTINGS.lookRefFrameMs);
    solo.applySettings({ invertLookX: true });
    solo.looks[0].x = 0; solo.poll(FRAME);
    ok('I6h invertLookX flips the stick too', solo.looks[0].x < 0, String(solo.looks[0].x));
    delete navigator.getGamepads;
    ok('I6i the stub is gone', typeof navigator.getGamepads === 'function' && Array.from(navigator.getGamepads()).every((p) => !p));
  }
  lines.push(`      look rates: key ${DEFAULT_SETTINGS.keyLookRate} units/frame → ${(DEFAULT_SETTINGS.keyLookRate * RENDER.camera.lookScale * 60).toFixed(2)} rad/s; ` +
             `stick ${DEFAULT_SETTINGS.padLookSensitivity * 10} units/frame → ${(DEFAULT_SETTINGS.padLookSensitivity * 10 * RENDER.camera.lookScale * 60).toFixed(2)} rad/s, at any refresh rate`);
}
emit('running...');

/* ── U. the card, and every control on it (§21.4, §26.5) ─────────────────────── */
lines.push('--- U. the settings card (GDD §21.4, §26.5; INDEX "assert consumption") ---');
{
  ok('U0 the settings card exists and starts hidden', !!panel() && panel().hidden);
  const titleBtn = title.el.querySelector('button.settings');
  ok('U0a the title card has a Settings button', !!titleBtn);
  titleBtn.click();
  eq('U0b …which opens the card', panel().hidden, false);
  eq('U0c …over the title (z-index above 40)', parseInt(getComputedStyle(panel()).zIndex, 10) > 40, true);
  panel().querySelector('[data-act="close"]').click();
  eq('U0d Done closes it', panel().hidden, true);
  ok('U0e opening it did not start the job', title.visible);

  title.start();
  game.setPaused(true);
  const slot = document.querySelector('#pause-screen [data-act="settings"]');
  ok('U0f the pause card\'s Settings slot (M3) is LIVE — a handler is registered at boot', !!slot && !slot.hidden);
  slot.click();
  eq('U0g …and it opens the card from the pause', panel().hidden, false);
  /* A real keydown targets the focused element and bubbles up through window, where the
   * card's CAPTURE listener runs before Input's bubble listener and stops it. Dispatched on
   * the focused Done button for that reason: an event dispatched ON window has no capture
   * phase, and this Chrome then runs the two window listeners in registration order
   * (measured) — a path no keyboard can take. */
  eq('U0g1 …with its Done button focused', document.activeElement, panel().querySelector('[data-act="close"]'));
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true, cancelable: true }));
  frame();
  eq('U0h Escape closes the card', panel().hidden, true);
  eq('U0i …and does NOT reach the pause toggle (still paused)', game.state.paused, true);
  game.setPaused(false);
  frame();
  eq('U0j running again', game.state.paused, false);

  /* U1 — UI scale. §21.4 Vision "scalable UI". One CSS variable multiplies every font-size. */
  huds[0].setPrompt({ primary: 'pick up the flat dolly', secondary: null });
  huds[0].setContract({ phase: 'pickup', delivered: 0, total: 23, loaded: 0, roomCorrect: 0, elapsedMin: 1, estimateMin: 18 });
  eq('U1 --ts is 1 at boot', tsNow(), 1);
  eq('U1a …the prompt reads 12px', getComputedStyle(huds[0].prompt).fontSize, '12px');
  setControl('uiScale', 1.5);
  eq('U1 the card at 1.5 → --ts 1.5', tsNow(), 1.5);
  eq('U1 …→ getComputedStyle(huds[0].prompt).fontSize === 18px (was 12px)', getComputedStyle(huds[0].prompt).fontSize, '18px');
  eq('U1 …and .contract 16.5px', getComputedStyle(huds[0].contract).fontSize, '16.5px');
  eq('U1b …the title\'s pitch scales too (13 → 19.5px)', getComputedStyle(title.el.querySelector('.pitch')).fontSize, '19.5px');
  eq('U1b1 …and the pause card\'s tag (12 → 18px)', getComputedStyle(document.querySelector('#pause-screen .tag')).fontSize, '18px');
  // The centre third stays clear at 1.5× (m11 F2's measurement, on the class selectors, non-vacuous).
  const W = window.innerWidth, H = window.innerHeight;
  const outsideCentre = (r) => r.right < W / 2 - W / 6 || r.left > W / 2 + W / 6 || r.bottom < H / 2 - H / 6 || r.top > H / 2 + H / 6;
  const sels = ['.contract', '.cargo-status', '.notices', '.route-bar'];
  const laidOut = sels.filter((s) => huds[0].el.querySelector(s) && huds[0].el.querySelector(s).offsetParent);
  ok('U1c the contract panel has a layout box (the measurement is real)', laidOut.includes('.contract'), laidOut.join(','));
  const covering = laidOut.filter((s) => !outsideCentre(huds[0].el.querySelector(s).getBoundingClientRect()));
  ok('U1d §21.1: at 1.5× no HUD panel covers the middle third', covering.length === 0, covering.join(','));
  /* Every font declaration in styles.css multiplies by --ts — a raw px silently opts out. Read
   * from the CSSOM rather than fetched (a fetch under the harness's virtual-time budget never
   * resolves — measured, the suite stalled on it). A `font:` shorthand that carries var() is
   * a pending-substitution value: its font-size LONGHAND reads '' and the shorthand returns
   * the authored text (measured), while a raw-px shorthand serialises from its longhands —
   * so `font || font-size` sees every declaration either way, and a forgotten calc is a raw
   * px in it. */
  const sheetObj = Array.from(document.styleSheets).find((s) => s.href && /styles\.css/.test(s.href));
  const rules = [];
  (function walk(list) { for (const r of list) { if (r.style) rules.push(r); if (r.cssRules) walk(r.cssRules); } })(sheetObj.cssRules);
  const decl = (r) => r.style.getPropertyValue('font') || r.style.getPropertyValue('font-size');
  const sized = rules.filter((r) => /\d(?:\.\d+)?px|clamp\(/.test(decl(r)));
  const scaled = sized.filter((r) => /var\(--ts\)/.test(decl(r)));
  eq('U1e styles.css: count(font-size * var(--ts)) === count(font-size declarations)', scaled.length, sized.length);
  ok('U1f …over the whole stylesheet, not a sample', sized.length >= 40, `${sized.length} declarations`);
  const raw = sized.filter((r) => !/var\(--ts\)/.test(decl(r))).map((r) => `${r.selectorText} {${decl(r)}}`);
  ok('U1g …and no raw px font-size remains', raw.length === 0, raw.join(' | '));
  eq('U1h the scale persisted', load().shell.uiScale, 1.5);
  setControl('uiScale', 1);
  eq('U1i back at 1 → prompt 12px', getComputedStyle(huds[0].prompt).fontSize, '12px');
  lines.push(`      styles.css: ${sized.length} font declarations, ${scaled.length} scaled by --ts`);

  /* U2 — EVERY control changes the thing that consumes it. The consumer map is keyed by the
   * card's own data-setting names; a control with no consumer here is an inert control and
   * fails, and a consumer with no control fails the other way. */
  const consumers = {
    mouseSensitivity:   () => input.settings.mouseSensitivity,     // read live at mousemove (I1)
    padLookSensitivity: () => input.settings.padLookSensitivity,   // _pollPads (I6f)
    keyLookRate:        () => input.settings.keyLookRate,          // _pollLookKeys (I6)
    invertLookX:        () => input.settings.invertLookX,          // mousemove / _pollPads / keys (I3, I6h)
    invertLookY:        () => input.settings.invertLookY,          // (I2)
    stickDeadzone:      () => input.settings.stickDeadzone,        // _pollPads via deadzone() (I5)
    triggerThreshold:   () => input.settings.triggerThreshold,     // _pollPads gate + analog()
    gripMode:           () => input.settings.gripMode,             // _press / isDown / analog (I4)
    uiScale:            () => tsNow(),                             // every font-size (U1)
    cameraDistance:     () => M.rig.distance,                      // the boom (U3)
    tier:               () => load().shell.tier,                   // the NEXT boot's detectRenderTier
    // M9 (Phase 11 build-side): the Sound group, at its consumers — the audio layer's bus
    // levels (audio.setMaster / setBus; m18 A11 spies the calls) and the HUD caption line.
    audioMaster:        () => M.audio.levels.master,
    audioUi:            () => M.audio.levels.ui,
    audioWorld:         () => M.audio.levels.world,
    captions:           () => huds[0].captionsEnabled,
    // M16 (Phase 11 build-side): the §26.5 camera-shake switch, at its consumer — every rig's
    // shakeEnabled (camera.js nudge() is a no-op while it is off; m24 K5).
    cameraShake:        () => M.rig.shakeEnabled,
  };
  const keys = M.settingsPanel.keys();
  eq('U2 the card has exactly one control per consumer', keys.slice().sort().join(','), Object.keys(consumers).sort().join(','));
  eq('U2a …and one control per input setting (every DEFAULT_SETTINGS key is on the card)',
     Object.keys(DEFAULT_SETTINGS).filter((k) => !keys.includes(k)).join(','), '');
  const inert = [];
  const wrong = [];
  for (const c of panel().querySelectorAll('[data-setting]')) {
    const key = c.dataset.setting;
    const get = consumers[key];
    if (!get) { inert.push(key + ' (no consumer)'); continue; }
    const before = get();
    let want;
    if (c.type === 'checkbox') want = !c.checked;
    else if (c.type === 'range') {
      const min = Number(c.min), max = Number(c.max), cur = Number(c.value);
      want = (cur - min) > (max - cur) ? min : max;
    } else {
      want = Array.from(c.options).map((o) => o.value).find((v) => v !== c.value);
    }
    setControl(key, want);
    const after = get();
    const same = typeof want === 'number' ? Math.abs(after - want) < 1e-9 : after === want;
    if (deepEq(before, after)) inert.push(`${key} (${JSON.stringify(before)} → ${JSON.stringify(after)})`);
    else if (!same) wrong.push(`${key} (set ${want}, consumer ${JSON.stringify(after)})`);
  }
  ok('U2b every control moves its consumer (zero inert controls)', inert.length === 0, inert.join(' | '));
  ok('U2c …to the value that was set', wrong.length === 0, wrong.join(' | '));
  ok('U2d …and the whole set persisted through one save',
     (() => { const s = load(); return s.settings.gripMode === input.settings.gripMode && s.shell.uiScale === tsNow() &&
                Math.abs(s.shell.cameraDistance - M.rig.distance) < 1e-9; })(), JSON.stringify(load()));
  panel().querySelector('[data-act="defaults"]').click();
  const offDefault = Object.entries(consumers).filter(([k, get]) => {
    const d = k in DEFAULT_SETTINGS ? DEFAULT_SETTINGS[k] : SHELL_DEFAULTS[k];
    const v = get();
    return typeof d === 'number' ? Math.abs(v - d) > 1e-9 : v !== d;
  }).map(([k]) => k);
  ok('U2e Defaults puts every consumer back', offDefault.length === 0, offDefault.join(','));
  eq('U2f …and the card shows the defaults (mouse 1.0×)', control('mouseSensitivity').value, '1');
  ok('U2g the card\'s value labels are words and numbers, not blanks',
     Array.from(panel().querySelectorAll('.set-row:not(.set-check) .set-v')).every((v) => v.textContent.length > 0));

  /* U3 — camera distance. §4.1 "adjustable distance": the setting is the solo boom; a split
   * screen keeps its own shorter one (COOP.cameraDistance). */
  setControl('cameraDistance', RENDER.camera.distanceMax);
  frame();
  near('U3 cameraDistance at RENDER.camera.distanceMax → M.rig.distance === that value ±1e-6 after one frame',
       M.rig.distance, RENDER.camera.distanceMax);
  ok('U3a …every mover\'s rig, not just the driven one', movers.every((m) => Math.abs(m.rig.distance - RENDER.camera.distanceMax) < 1e-6));
  M.setSeats(2);
  near('U3b in co-op the split\'s boom applies (COOP.cameraDistance)', M.rig.distance, COOP.cameraDistance);
  M.setSeats(1);
  near('U3c …and solo gets the setting back', M.rig.distance, RENDER.camera.distanceMax);
  setControl('cameraDistance', SHELL_DEFAULTS.cameraDistance);
  near('U3d back at the default boom', M.rig.distance, RENDER.camera.distance);

  // A retry keeps settings (§21.2): a restart from the pause card changes none of them.
  input.applySettings({ mouseSensitivity: 1.7 });
  setControl('uiScale', 1.2);
  M.pauseScreen.onRestart();
  eq('U4 a restart keeps the settings (§21.2)', `${input.settings.mouseSensitivity}/${tsNow()}`, '1.7/1.2');
  setControl('uiScale', 1);
  input.applySettings({ ...DEFAULT_SETTINGS });
  M.settingsStore.reset();
  ok('U4a …and none of them is in game.state after the restart either',
     !/mouseSensitivity|uiScale|gripMode|cameraDistance|invertLook/.test(JSON.stringify(game.state)));
}
emit('running...');

/* ── Z. teardown ──────────────────────────────────────────────────────────────── */
lines.push('--- Z. it still runs, and nothing survives this suite ---');
{
  const before = M.physics.stats.bodies;
  frame(60);
  eq('Z1 no bodies leaked over 60 frames', M.physics.stats.bodies, before);
  ok('Z2 state is still plain serializable data (§22.4)',
     (() => { try { JSON.stringify(game.state); return true; } catch (e) { return false; } })());
  eq('Z3 the game ends the suite running, solo, card hidden',
     `${game.state.paused}/${M.seatCount}/${panel().hidden}`, 'false/1/true');
  deep('Z4 the live settings are the defaults again', input.getSettings(), { ...DEFAULT_SETTINGS });
  eq('Z4a …and --ts is 1', tsNow(), 1);
  ok('Z5 no error banner appeared during the suite', banner() === '', banner());
}

/* ── M16 (Phase 11 build-side): the camera-shake switch in the shell payload ───────
 * §26.5 "camera shake … exist[s]" / §21.4 Motion. The switch is a shell key like captions:
 * a boolean, defaulting from the OS's reduced-motion reading at load (m24 K7 covers the
 * reading; here only that the payload carries and sanitises it). */
lines.push('--- M16. the camera-shake switch is a shell key (§26.5, §21.4 Motion) ---');
{
  eq('M16-1 SHELL_DEFAULTS.cameraShake is true', SHELL_DEFAULTS.cameraShake, true);
  localStorage.removeItem(SAVE_KEY);
  eq('M16-2 load() hands back the boolean', typeof load().shell.cameraShake, 'boolean');
  save({ shell: { ...SHELL_DEFAULTS, cameraShake: false } });
  eq('M16-3 save(false) → load() false', load().shell.cameraShake, false);
  localStorage.setItem(SAVE_KEY, JSON.stringify({ schema: SAVE_SCHEMA, shell: { cameraShake: 'no' } }));
  eq('M16-4 a non-boolean in the blob is the default, not a truthy string', load().shell.cameraShake, true);
  localStorage.removeItem(SAVE_KEY);
}

/* ── M18 (Phase 11 build-side): the Controls rows consume — U2's walk, for the remapper ──
 * §21.4 Input "full remapping". Same claim as U2 ("assert consumption, not presence"): every
 * Rebind row on the card changes the thing that consumes it — the LIVE binding table the
 * game reads (input.bindingTable()), and through it the chip on the row — and Defaults puts
 * every one back. The rows carry data-bind, not data-setting, so U2's own walk and its
 * one-control-per-consumer count are unchanged (asserted). */
lines.push('--- M18. the Controls rows consume: every Rebind moves the live table (§21.4 full remapping) ---');
{
  const keyEvent = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true, cancelable: true }));
  const rowsAll = Array.from(panel().querySelectorAll('[data-bind]'));
  const binds = M.settingsPanel.bindRows();
  ok('M18-U2h the Controls group lists rows, none of them a data-setting control', rowsAll.length > 0 && rowsAll.every((r) => !r.dataset.setting), String(rowsAll.length));
  eq('M18-U2i …so keys() (U2\'s walk) is unchanged', M.settingsPanel.keys().filter((k) => /:/.test(k)).length, 0);
  ok('M18-U2j every rebindable row names an action in that seat\'s on-foot table',
     binds.every((b) => { const [s, c, a] = b.split(':'); return !!(input.bindingTable()[Number(s)] || {})[c][a]; }), binds.join(','));
  // A pool of codes no shipped binding uses, one per row; each capture lands and stays unique.
  const pool = ['F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
                'Digit0', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9',
                'KeyB', 'KeyF', 'KeyG', 'KeyI', 'KeyL', 'KeyM', 'KeyN', 'KeyO', 'KeyT', 'KeyV', 'KeyX', 'KeyY', 'KeyZ'];
  ok('M18-U2k the pool covers every row', pool.length >= binds.length, `${pool.length} codes for ${binds.length} rows`);
  M.settingsPanel.show();
  const inert = [];
  const wrongChip = [];
  binds.forEach((b, i) => {
    const [s, c, a] = b.split(':');
    const row = panel().querySelector(`[data-bind="${b}"]`);
    const before = JSON.stringify(input.bindingTable()[Number(s)][c][a]);
    row.querySelector('[data-act="rebind"]').click();
    keyEvent('keydown', pool[i]); keyEvent('keyup', pool[i]);
    const def = input.bindingTable()[Number(s)][c][a];
    if (JSON.stringify(def) === before || !def.keys || def.keys[0] !== pool[i]) inert.push(`${b} (${before} → ${JSON.stringify(def)})`);
    const chip = row.querySelector('.key.kbm');
    const want = pool[i].replace(/^(Key|Digit)/, '');
    if (!chip || chip.textContent !== want) wrongChip.push(`${b} (chip ${chip ? chip.textContent : 'none'}, want ${want})`);
  });
  ok(`M18-U2l every Rebind row moves the live table (${binds.length} rows, zero inert)`, inert.length === 0, inert.join(' | '));
  ok('M18-U2m …and the row\'s chip shows the new key', wrongChip.length === 0, wrongChip.join(' | '));
  eq('M18-U2n …with the table still conflict-free', bindingConflicts(input.seatBindings).length, 0);
  eq(`M18-U2o …and the save holds exactly ${binds.length} diffs`, bindingDiffCount(load().bindings), binds.length);
  eq('M18-U2p …and no capture is left open', input.capturing, false);
  panel().querySelector('[data-act="defaults"]').click();
  eq('M18-U2q Defaults puts every binding back (the live table is the shipped one)', input.seatBindings, SEAT_BINDINGS);
  deep('M18-U2r …and the save holds no diffs', load().bindings, {});
  ok('M18-U2s …while the interact row reads E again', /\bE\b/.test(panel().querySelector('[data-bind="0:foot:interact"]').textContent));
  panel().querySelector('[data-act="close"]').click();
  eq('M18-U2t the card is closed, the game running, solo', `${panel().hidden}/${game.state.paused}/${M.seatCount}`, 'true/false/1');
  localStorage.removeItem(SAVE_KEY);
}

} catch (e) {
  fails++;
  lines.push(`FAIL  suite threw  <- ${e && e.message}`);
  lines.push((e && e.stack || '').split('\n').slice(0, 6).join('\n'));
}

// TEARDOWN: leave no save behind for the next run.
try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* nothing to clear */ }
emit();
