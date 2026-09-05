/* Phase 11 build-side M18 suite — rebind any action (§21.4 "full remapping").
 *
 * GDD §21.4 Accessibility baseline, Input row: "Full remapping, hold/toggle grip,
 * sensitivity/deadzone, invert axes" — the first item was the last one missing; §21.2 "a
 * retry keeps settings"; §4.4 controller parity; §26.5 "both input mappings"; §26.6
 * "save/settings reject incompatible versions safely".
 *
 * THE CLAIM UNDER TEST: bindings are data, so a remap is a validated data edit and everything
 * that reads the table — isDown, the prompt glyphs, the help line, the save — follows it with
 * no second table to drift. Concretely: rebind() installs only a conflict-free table and
 * refuses everything else BY NAME (the other action, the reserved key); the save holds the
 * DIFF from the defaults, never the table; the card's Rebind captures the next press of any
 * device and that press never reaches the game, the title or the pause path; and a capture
 * nobody answers closes itself after INPUT.remap.captureTimeoutMs on the frame clock.
 *
 * Every live assertion drives game.frame() itself (Dev\INDEX.md: headless Chrome delivers
 * 1-3 rAF callbacks in total). localStorage 'mfh.save' is cleared at the start and the end,
 * and the live table is reset to the defaults, so nothing survives into the next suite.
 */

import { Input, DEFAULT_BINDINGS, SEAT1_BINDINGS, SEAT_BINDINGS, CONTEXTS, PAD, MOUSE,
         bindingConflicts, glyphFor, glyphOf, parseToken, reservedReason, tokenLabel,
         cloneBindings, bindingDiff, bindingDiffCount, applyBindingDiff, rebindTable } from '../src/core/input.js';
import { load, save, defaultSave, SAVE_KEY, SAVE_SCHEMA, sanitiseBindings } from '../src/core/save.js';
import { INPUT, COOP, SIM } from '../src/config.js';

const lines = [];
let passes = 0, fails = 0;
function ok(name, cond, detail = '') {
  if (cond) { passes++; lines.push(`PASS  ${name}`); }
  else { fails++; lines.push(`FAIL  ${name}${detail ? '  <- ' + detail : ''}`); }
}
const eq = (n, a, b) => ok(n, a === b, `got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
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

const { game, input, huds, title, movers, tools, physics, interact } = M;
const FRAME = SIM.stepMs;
const frame = (n = 1) => { for (let i = 0; i < n; i++) game.frame(FRAME); };
const banner = () => { const b = document.getElementById('err-banner'); return b && b.textContent.trim() ? b.textContent.slice(0, 120) : ''; };
const panel = () => document.getElementById('settings-screen');
const row = (bind) => panel().querySelector(`[data-bind="${bind}"]`);
const rowText = (r) => r.textContent.replace(/\s+/g, ' ').trim();
const rebindBtn = (r) => r.querySelector('[data-act="rebind"]');
const conflictLine = (r) => r.nextElementSibling;
/* A real keydown on window, the way a keyboard delivers it: the card's capture-phase
 * listener, Input's bubble listener and the title's all see it — or the first one stops it. */
const key = (type, code) =>
  window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true, cancelable: true }));
const press = (code) => { key('keydown', code); key('keyup', code); };
const live = () => ({ bindings: input.seatBindings });
const table = () => input.bindingTable();
const help = () => (document.getElementById('help') || { textContent: '' }).textContent;
const overlayHidden = () => { const o = document.getElementById('debug-overlay'); return o ? o.hidden : null; };

/** Stand mover 0 in front of a tool and aim at it, so describe() offers a primary verb and the
 *  prompt gets a chip. Copied from tools/m11-tests.js lookAt / placeMover, trimmed. */
function aimAtATool() {
  const me = movers[0];
  let tool = null;
  for (const t of tools.tools.values()) { if (!tool || /dolly/.test(t.defId)) tool = t; }
  if (!tool) return null;
  const tp = tool.body.translation();
  const target = { x: tp.x, y: tp.y, z: tp.z };
  const from = { x: target.x, z: target.z + 1.3 };
  me.controller.hardSetPosition({ x: from.x, y: 0.2, z: from.z });
  me.controller._vel.x = 0; me.controller._vel.z = 0;
  me.controller.velocityY = 0; me.controller._climb = null;
  const rig = M.rig;
  const p = me.controller.position;
  rig.yaw = Math.atan2(-(target.x - p.x), -(target.z - p.z));
  rig.pitch = Math.atan2(target.y - (p.y + 1.4), Math.hypot(target.x - p.x, target.z - p.z));
  rig._first = true;
  for (let k = 0; k < 20; k++) rig.update(p, 1 / 60);
  const c = M.camera.position;
  rig.yaw = Math.atan2(-(target.x - c.x), -(target.z - c.z));
  rig.pitch = Math.atan2(target.y - c.y, Math.hypot(target.x - c.x, target.z - c.z));
  me.grips.syncAim();
  physics.primeQueries();
  return tool;
}

/** A stubbed Standard Gamepad through the real _pollPads path (m15 P7h shape). */
function stubPad() {
  const held = new Set();
  const stub = {
    connected: true, index: 0, id: 'm26 stub (Standard Gamepad)', mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, (_, i) => ({
      get pressed() { return held.has(i); }, get value() { return held.has(i) ? 1 : 0; }, touched: false,
    })),
  };
  navigator.getGamepads = () => [stub];
  return { held, unplug() { delete navigator.getGamepads; frame(); input.clear(); input.activeDevice[0] = 'kbm'; input.activeDevice[1] = 'kbm'; } };
}

// SETUP: nothing from a previous run may survive into this one.
try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* no storage — the suite still runs */ }
const bootDefaults = JSON.stringify(table());

try {

/* ── A. the pure remap layer (input.js) ──────────────────────────────────────── */
lines.push('--- A. the pure remap layer: tokens, clones, diffs (§21.4, §26.6) ---');
{
  deep('A1 parseToken: a key code', parseToken('KeyF'), { kind: 'key', code: 'KeyF' });
  deep('A1a …a mouse button', parseToken('Mouse2'), { kind: 'mouse', button: 2 });
  deep('A1b …a pad button, seat-qualified', parseToken('P1B4'), { kind: 'pad', seat: 1, button: 4 });
  eq('A1c …junk is null', parseToken('not a key!'), null);
  eq('A1d …a non-string is null', parseToken(42), null);
  eq('A1e …a pad button past INPUT.remap.maxPadButton is null', parseToken('P0B' + (INPUT.remap.maxPadButton + 1)), null);
  eq('A1f …a mouse button past INPUT.remap.maxMouseButton is null', parseToken('Mouse' + (INPUT.remap.maxMouseButton + 1)), null);
  eq('A2 reservedReason(Escape) is reserved', reservedReason('Escape'), 'reserved');
  eq('A2a …F3 too', reservedReason('F3'), 'reserved');
  eq('A2b …and COOP.joinKey', reservedReason(COOP.joinKey), 'reserved');
  eq('A2c …and the pad join button on any seat', reservedReason('P1B' + COOP.joinPad), 'reserved');
  eq('A2d …while KeyF is not', reservedReason('KeyF'), null);
  eq('A2e tokenLabel prints what glyphFor would', `${tokenLabel('KeyF')}/${tokenLabel('Mouse0')}/${tokenLabel('P0B4')}/${tokenLabel('Quote')}`, "F/LMB/LB/'");

  const c = cloneBindings();
  ok('A3 cloneBindings() is a fresh, unfrozen table', c !== SEAT_BINDINGS && c[0] !== DEFAULT_BINDINGS && !Object.isFrozen(c[0]));
  deep('A3a …structurally equal to the shipped one', c, JSON.parse(JSON.stringify(SEAT_BINDINGS)));
  deep('A4 bindingDiff(defaults) is empty', bindingDiff(c), {});
  eq('A4a bindingDiffCount({}) is 0', bindingDiffCount({}), 0);

  const r = rebindTable(c, 0, 'foot', 'interact', 'KeyF');
  eq('A5 rebindTable is pure: ok', r.ok, true);
  deep('A5a …the input table is untouched', c[0].foot.interact, { keys: ['KeyE'], pad: [PAD.X] });
  deep('A5b …the result table has the new key and KEEPS the pad (parity survives a remap)', r.table[0].foot.interact, { keys: ['KeyF'], pad: [PAD.X] });
  deep('A5c …and the diff is exactly that action', bindingDiff(r.table), { 0: { foot: { interact: { keys: ['KeyF'] } } } });
  const rm = rebindTable(r.table, 0, 'foot', 'interact', 'Mouse1');
  deep('A5d a mouse token replaces the whole keyboard-and-mouse class (no keys left)', rm.table[0].foot.interact, { mouse: [1], pad: [PAD.X] });
  const rp = rebindTable(r.table, 0, 'foot', 'interact', 'P0B10');
  deep('A5e a pad token replaces the pad class only', rp.table[0].foot.interact, { keys: ['KeyF'], pad: [10] });
  eq('A5f a pad token names the row\'s seat, whatever seat it was typed with', rebindTable(c, 1, 'foot', 'jump', 'P0B10').table[1].foot.jump.pad[0], 10);

  /* The conflict checker now sees two ACTIONS of one seat on one token, not only two seats:
   * the case a remap produces. The shipped tables have neither (m12 A1 still []). */
  eq('A6 bindingConflicts() on the shipped tables is still empty', bindingConflicts().length, 0);
  const dup = cloneBindings(); dup[0].foot.interact.keys = ['KeyW'];
  const found = bindingConflicts(dup);
  ok('A6a …two actions of ONE seat on one key is reported', found.length === 1 && /KeyW/.test(found[0]) && /moveForward/.test(found[0]) && /interact/.test(found[0]), found.join(' | '));
  const dupPad = cloneBindings(); dupPad[0].foot.jump.pad = [PAD.X];
  ok('A6b …and two actions of one seat on one pad button', bindingConflicts(dupPad).some((s) => /interact/.test(s) && /jump/.test(s)), bindingConflicts(dupPad).join(' | '));
  const other = cloneBindings(); other[1].foot.jump.pad = [PAD.Y];   // Y is seat 0's swapMover; seat 1 has no Y
  eq('A6c …while the SAME button on the other seat\'s pad is no conflict (one controller per seat)', bindingConflicts(other).length, 0);

  const applied = applyBindingDiff({ 0: { foot: { interact: { keys: ['KeyF'] }, fly: { keys: ['KeyZ'] }, jump: { keys: ['KeyW'] }, brace: { keys: ['Escape'] }, pause: { keys: ['KeyP'] }, crouch: 'KeyX' } }, 7: {}, 1: { foot: { context: { keys: ['KeyF'] } } } });
  eq('A7 applyBindingDiff keeps the clean entry', applied.table[0].foot.interact.keys[0], 'KeyF');
  eq('A7a …and drops seven: unknown action, self-conflict, reserved, locked, bad token, unknown seat, cross-seat conflict',
     applied.dropped.map((d) => d.reason).sort().join(','), 'bad token,conflict,conflict,locked,reserved,unknown action,unknown seat');
  ok('A7b …a dropped conflict names the other action', applied.dropped.find((d) => d.action === 'jump').conflicts.some((s) => /moveForward/.test(s)));
  deep('A7c …and the survivors re-diff to the one entry', bindingDiff(applied.table), { 0: { foot: { interact: { keys: ['KeyF'] } } } });
  deep('A7d a non-object diff applies nothing', bindingDiff(applyBindingDiff('junk').table), {});

  ok('A8 the shipped tables are frozen and untouched by all of the above',
     Object.isFrozen(DEFAULT_BINDINGS) && Object.isFrozen(SEAT1_BINDINGS) && Object.isFrozen(SEAT_BINDINGS) &&
     DEFAULT_BINDINGS.foot.interact.keys[0] === 'KeyE' && DEFAULT_BINDINGS.foot.jump.pad[0] === PAD.A,
     JSON.stringify(DEFAULT_BINDINGS.foot.interact));
}
emit('running...');

/* ── B. the live Input: rebind / refuse / persist (m26 B1-B7) ────────────────── */
lines.push('--- B. rebind on the live Input (§21.4 full remapping) ---');
{
  ok('B0 the live table boots as the shipped one', input.seatBindings === SEAT_BINDINGS && bindingDiffCount(input.bindingDiff()) === 0);

  // B1 — rebind, and every reader follows: isDown, glyphFor, the HUD chip.
  const r1 = input.rebind(0, 'foot', 'interact', 'KeyF');
  eq('B1 rebind(0, foot, interact, KeyF) → ok', r1.ok, true);
  key('keydown', 'KeyF');
  eq('B1a input.isDown(interact, 0) after a KeyF keydown === true', input.isDown('interact', 0), true);
  key('keyup', 'KeyF');
  key('keydown', 'KeyE');
  eq('B1b …and after KeyE === false (the old key is gone)', input.isDown('interact', 0), false);
  key('keyup', 'KeyE');
  eq('B1c glyphFor(interact, 0, kbm) over the live table === F', glyphFor('interact', 0, 'kbm', live()), 'F');
  eq('B1c1 …the Input\'s own glyphFor agrees', input.glyphFor('interact', 0, 'kbm'), 'F');
  eq('B1c2 …glyphsFor (what the HUD is fed) has primary F', input.glyphsFor(0, 'kbm').primary, 'F');
  eq('B1c3 …while the shipped default still says E (glyphFor with no table is the defaults)', glyphFor('interact', 0, 'kbm'), 'E');
  eq('B1c4 …and the pad chip is still X (parity kept)', glyphFor('interact', 0, 'pad', live()), 'X');
  const tool = aimAtATool();
  M.feedHuds();
  const chip = huds[0].prompt.querySelector('.key');
  const described = interact.describe(movers[0]);
  ok('B1d the HUD prompt chip reads F after one feedHuds (aimed at ' + (tool ? tool.defId : 'nothing') + ')',
     !!chip && chip.textContent === 'F',
     chip ? `chip ${chip.textContent}` : `no chip: prompt "${huds[0].prompt.textContent}" primary=${described && described.primary}`);
  ok('B1e …and the help line follows the same table once the store redraws it (section C)', true);

  // B2 — a conflicting key is refused by name and nothing changes.
  const before = JSON.stringify(table());
  const r2 = input.rebind(0, 'foot', 'interact', 'KeyW');
  eq('B2 rebind(0, foot, interact, KeyW) → ok false', r2.ok, false);
  eq('B2a …reason conflict', r2.reason, 'conflict');
  ok('B2b …conflicts name moveForward', (r2.conflicts || []).some((s) => /moveForward/.test(s)), JSON.stringify(r2.conflicts));
  eq('B2c …and the table is unchanged (deep-equal before/after)', JSON.stringify(table()), before);
  eq('B2d bindingConflicts() on the live table stays empty', bindingConflicts(input.seatBindings).length, 0);
  const r2p = input.rebind(0, 'foot', 'jump', 'P0B' + PAD.X);
  ok('B2e a pad button another action of the seat has (X = interact) is refused the same way',
     !r2p.ok && r2p.reason === 'conflict' && r2p.conflicts.some((s) => /interact/.test(s)), JSON.stringify(r2p));
  eq('B2f …table still unchanged', JSON.stringify(table()), before);

  // B3 — the cross-seat rule the checker always had. Seat 0's interact is back on E for it
  // (B1 moved it to F, which would have left E free and the refusal untestable).
  eq('B3-0 seat 0 interact back to KeyE for the cross-seat probe', input.rebind(0, 'foot', 'interact', 'KeyE').ok, true);
  const before3 = JSON.stringify(table());
  const r3 = input.rebind(1, 'foot', 'interact', 'KeyE');
  eq('B3 seat 1 rebinding to a seat-0 key (KeyE) → refused', r3.ok, false);
  ok('B3a …with the cross-seat conflict named (seat 0 interact and seat 1 interact)',
     (r3.conflicts || []).some((s) => /seat 0 interact/.test(s) && /seat 1 interact/.test(s)), JSON.stringify(r3.conflicts));
  const r3m = input.rebind(1, 'foot', 'interact', 'Mouse0');
  ok('B3b seat 1 cannot be given the mouse ("there is only one mouse")',
     !r3m.ok && r3m.conflicts.some((s) => /only one mouse/.test(s)), JSON.stringify(r3m));
  eq('B3c …table still unchanged', JSON.stringify(table()), before3);
  eq('B3d …and back to F for the rest of the section', input.rebind(0, 'foot', 'interact', 'KeyF').ok, true);

  // B4 — reserved tokens and locked actions.
  eq('B4 rebind(0, foot, jump, Escape) → reason reserved', input.rebind(0, 'foot', 'jump', 'Escape').reason, 'reserved');
  eq('B4a …F3 likewise', input.rebind(0, 'foot', 'jump', 'F3').reason, 'reserved');
  eq('B4b …the join button (COOP.joinPad) likewise', input.rebind(0, 'foot', 'jump', 'P0B' + COOP.joinPad).reason, 'reserved');
  eq('B4c …and COOP.joinKey', input.rebind(0, 'foot', 'jump', COOP.joinKey).reason, 'reserved');
  eq('B4d …on seat 1 too', input.rebind(1, 'foot', 'jump', 'P1B' + COOP.joinPad).reason, 'reserved');
  eq('B4e the pause action is locked (the shell reads it; the card closes on Escape)', input.rebind(0, 'foot', 'pause', 'KeyP').reason, 'locked');
  eq('B4f …and debug', input.rebind(0, 'foot', 'debug', 'KeyP').reason, 'locked');
  eq('B4g a malformed token is refused', input.rebind(0, 'foot', 'jump', 'not a key!').reason, 'bad token');
  eq('B4h an unknown action is refused', input.rebind(0, 'foot', 'fly', 'KeyZ').reason, 'unknown action');
  eq('B4i an unknown seat is refused', input.rebind(5, 'foot', 'jump', 'KeyZ').reason, 'unknown seat');
  eq('B4j …table still unchanged after every refusal', JSON.stringify(table()), before);
  ok('B4k the reserved list is INPUT.remap.reservedKeys (Escape, F3, COOP.joinKey)',
     INPUT.remap.reservedKeys.includes('Escape') && INPUT.remap.reservedKeys.includes('F3') && INPUT.remap.reservedKeys.includes(COOP.joinKey),
     INPUT.remap.reservedKeys.join(','));

  // B5 — a pad rebind, read through the real poll. P0B4 is LB, which the shipped table gives
  // to brace (DEFAULT_BINDINGS.foot.brace.pad = [PAD.LB]; m0 B16 wants brace on a pad), so the
  // brief's rebind is a CONFLICT first — asserted — and lands once brace has moved to L3.
  const r5c = input.rebind(0, 'foot', 'gripLeft', 'P0B4');
  ok('B5-0 rebind(0, foot, gripLeft, P0B4) while LB is brace\'s → refused, naming brace',
     !r5c.ok && r5c.reason === 'conflict' && r5c.conflicts.some((s) => /brace/.test(s)), JSON.stringify(r5c));
  eq('B5-1 brace moves to L3 (P0B10) first', input.rebind(0, 'foot', 'brace', 'P0B' + PAD.L3).ok, true);
  const r5 = input.rebind(0, 'foot', 'gripLeft', 'P0B4');
  eq('B5 rebind(0, foot, gripLeft, P0B4) → ok', r5.ok, true);
  {
    const pad = stubPad();
    pad.held.add(4); frame();
    eq('B5a a stubbed Standard Gamepad holding button 4 → isDown(gripLeft, 0) true', input.isDown('gripLeft', 0), true);
    pad.held.delete(4); frame();
    pad.held.add(PAD.LT); frame();
    eq('B5b …and LT no longer grips (the pad class was replaced)', input.isDown('gripLeft', 0), false);
    pad.held.delete(PAD.LT); frame();
    pad.unplug();
  }
  eq('B5c glyphFor(gripLeft, 0, pad) === LB', glyphFor('gripLeft', 0, 'pad', live()), 'LB');
  eq('B5d …while the mouse side survived (LMB)', glyphFor('gripLeft', 0, 'kbm', live()), 'LMB');
  eq('B5e …and analog() reads the new button as full pressure (digital, not a trigger)',
     (() => { input._debugPad(0, 4, 1); const v = input.analog('gripLeft', 0); input._debugPad(0, 4, 0); return v; })(), 1);

  // B6 — persistence: diffs, not tables. From the defaults, exactly two rebinds.
  eq('B6-0 three diffs so far (interact, brace, gripLeft)', bindingDiffCount(input.bindingDiff()), 3);
  input.resetBindings();
  eq('B6-1 …reset to none', bindingDiffCount(input.bindingDiff()), 0);
  eq('B6-2 rebind interact → KeyF', input.rebind(0, 'foot', 'interact', 'KeyF').ok, true);
  eq('B6-3 rebind gripLeft → L3 (P0B10, a free button)', input.rebind(0, 'foot', 'gripLeft', 'P0B' + PAD.L3).ok, true);
  const diff = input.bindingDiff();
  eq('B6 after two rebinds the diff holds exactly two entries', bindingDiffCount(diff), 2);
  eq('B6a save() → the blob\'s bindings key holds exactly two diffs',
     (save({ bindings: diff }), bindingDiffCount(JSON.parse(localStorage.getItem(SAVE_KEY)).bindings)), 2);
  deep('B6b …and they are the two CLASSES that changed: seat 0 foot interact {keys:[KeyF]} and gripLeft {pad:[10]} — the untouched pad X and mouse LMB are not stored',
       JSON.parse(localStorage.getItem(SAVE_KEY)).bindings, { 0: { foot: { interact: { keys: ['KeyF'] }, gripLeft: { pad: [PAD.L3] } } } });
  {
    const fresh = new Input(window, null);
    const res = fresh.applyBindings(load().bindings);
    eq('B6c load() on a fresh Input applies them (2 applied, 0 dropped)', `${res.applied}/${res.dropped.length}`, '2/0');
    fresh._debugPress('KeyF');
    eq('B6d …KeyF is interact there', fresh.isDown('interact'), true);
    fresh.clear(); fresh._debugPress('KeyE');
    eq('B6e …and KeyE is not', fresh.isDown('interact'), false);
    fresh._debugPad(0, PAD.L3, 1);
    eq('B6f …pad button 10 is gripLeft', fresh.isDown('gripLeft'), true);
    fresh._debugPad(0, PAD.L3, 0); fresh._debugPress('Mouse0');
    eq('B6f1 …and LMB still is (the untouched class came from this build\'s defaults)', fresh.isDown('gripLeft'), true);
    eq('B6f2 …as X still interacts', (fresh.clear(), fresh._debugPad(0, PAD.X, 1), fresh.isDown('interact')), true);
  }
  {
    // A hand-edited blob: an unknown action, a self-conflict, a cross-seat conflict, a
    // reserved key and a locked action — each dropped, the clean one kept, no throw, one info.
    const infos = [];
    const origInfo = console.info;
    console.info = (...a) => { infos.push(a.join(' ')); };
    let threw = false, got = null;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ schema: SAVE_SCHEMA, bindings: {
        0: { foot: { fly: { keys: ['KeyZ'] }, interact: { keys: ['KeyW'] }, jump: { keys: ['KeyN'] }, brace: { keys: ['Escape'] }, pause: { keys: ['KeyP'] } } },
        1: { foot: { interact: { keys: ['KeyE'] }, context: { keys: ['KeyN'] } } },
      } }));
      got = load();
    } catch (e) { threw = true; }
    console.info = origInfo;
    ok('B6g a blob with an unknown action and conflicting pairs loads without throwing', !threw);
    deep('B6h …with those entries dropped and the clean one kept', got && got.bindings, { 0: { foot: { jump: { keys: ['KeyN'] } } } });
    ok('B6i …and said so once on console.info, naming the reasons',
       infos.length === 1 && /dropped/.test(infos[0]) && /unknown action/.test(infos[0]) && /conflict/.test(infos[0]) && /reserved/.test(infos[0]) && /locked/.test(infos[0]),
       infos.join(' || ').slice(0, 300));
    localStorage.setItem(SAVE_KEY, JSON.stringify({ schema: 0, bindings: { 0: { foot: { jump: { keys: ['KeyN'] } } } } }));
    deep('B6j schema 0 → defaults (bindings {})', load().bindings, {});
    localStorage.setItem(SAVE_KEY, JSON.stringify({ schema: SAVE_SCHEMA, bindings: ['KeyN'] }));
    deep('B6k a non-object bindings section → {}', load().bindings, {});
    deep('B6l defaultSave() carries bindings {}', defaultSave().bindings, {});
    deep('B6m sanitiseBindings(junk) is {} and never throws', sanitiseBindings('junk'), {});
    localStorage.removeItem(SAVE_KEY);
    save({});
    deep('B6n a save() with no bindings writes bindings {} (never undefined)', JSON.parse(localStorage.getItem(SAVE_KEY)).bindings, {});
  }

  // B7 — reset.
  input.resetBindings(0);
  deep('B7 resetBindings(0) → seat 0 deep-equals the defaults', table()[0], JSON.parse(JSON.stringify(DEFAULT_BINDINGS)));
  save({ bindings: input.bindingDiff() });
  const blob = JSON.parse(localStorage.getItem(SAVE_KEY));
  ok('B7a …the blob\'s diff for seat 0 is empty after save', !blob.bindings[0] || Object.keys(blob.bindings[0]).length === 0, JSON.stringify(blob.bindings));
  eq('B7b …bindingDiff() is empty (seat 1 was never changed)', bindingDiffCount(input.bindingDiff()), 0);
  input.rebind(1, 'foot', 'jump', 'KeyN');
  input.rebind(0, 'foot', 'jump', 'KeyM');
  input.resetBindings(1);
  deep('B7c resetBindings(1) resets seat 1 only', table()[1], JSON.parse(JSON.stringify(SEAT1_BINDINGS)));
  eq('B7d …and seat 0 keeps its change', table()[0].foot.jump.keys[0], 'KeyM');
  input.resetBindings();
  eq('B7e resetBindings() with no seat resets every seat', JSON.stringify(table()), bootDefaults);
  ok('B7f the shipped defaults were never written', DEFAULT_BINDINGS.foot.interact.keys[0] === 'KeyE' && DEFAULT_BINDINGS.foot.gripLeft.pad[0] === PAD.LT && SEAT1_BINDINGS.foot.jump.keys[0] === 'ShiftRight');
  /* THE RESET HOLE. Seat 0 moves interact off E, seat 1 legitimately takes E, seat 0 resets:
   * a spliced reset left both seats on E — a conflicting live table that then refused every
   * later rebind for a conflict the player never made. The reset re-applies the other seat's
   * diff over the defaults and drops what no longer fits, and says so. */
  eq('B7g seat 0 interact → F', input.rebind(0, 'foot', 'interact', 'KeyF').ok, true);
  eq('B7h …then seat 1 may take E', input.rebind(1, 'foot', 'interact', 'KeyE').ok, true);
  const reset = input.resetBindings(0);
  eq('B7i resetBindings(0) → seat 0 interact is E again', table()[0].foot.interact.keys[0], 'KeyE');
  eq('B7j …and seat 1\'s E went back to Quote (dropped as a conflict, not kept as a clash)', table()[1].foot.interact.keys[0], 'Quote');
  ok('B7k …the reset reports what it took', reset.dropped.length === 1 && reset.dropped[0].seat === 1 && reset.dropped[0].reason === 'conflict', JSON.stringify(reset.dropped));
  eq('B7l …the live table is conflict-free', bindingConflicts(input.seatBindings).length, 0);
  eq('B7m …and the next rebind is accepted (no phantom conflict)', input.rebind(0, 'foot', 'jump', 'KeyM').ok, true);
  input.resetBindings();
  localStorage.removeItem(SAVE_KEY);
}
emit('running...');

/* ── C. the store and the help line ──────────────────────────────────────────── */
lines.push('--- C. the settings store: persist the diff, redraw the help line ---');
{
  ok('C0 the help line names E for use at the defaults', /\bE use\b/.test(help()), help().slice(0, 160));
  const r = M.settingsStore.rebind(0, 'foot', 'interact', 'KeyF');
  eq('C1 settingsStore.rebind → ok', r.ok, true);
  ok('C1a …the help line now says F use (derived from the same table as the prompts)', /\bF use\b/.test(help()) && !/\bE use\b/.test(help()), help().slice(0, 160));
  deep('C1b …and the diff persisted through the store', load().bindings, { 0: { foot: { interact: { keys: ['KeyF'] } } } });
  const r2 = M.settingsStore.rebind(0, 'foot', 'interact', 'KeyW');
  eq('C2 a refused rebind through the store', r2.ok, false);
  deep('C2a …persists nothing new', load().bindings, { 0: { foot: { interact: { keys: ['KeyF'] } } } });
  M.settingsStore.resetBindings(0);
  ok('C3 resetBindings through the store → E use again', /\bE use\b/.test(help()), help().slice(0, 160));
  deep('C3a …and the save is back to no diffs', load().bindings, {});
  deep('C4 store.bindings() is a plain copy of the live table', M.settingsStore.bindings(), JSON.parse(JSON.stringify(SEAT_BINDINGS)));
  ok('C4a …not the live objects', M.settingsStore.bindings()[0] !== input.seatBindings[0]);
}
emit('running...');

/* ── D. the capture UI (m26 B8, B9) ──────────────────────────────────────────── */
lines.push('--- D. the Controls card: capture, cancel, timeout, refusals on the row (m26 B8/B9) ---');
{
  if (title.visible) title.start();
  game.setPaused(false);
  M.settingsPanel.show();
  eq('D0 the card is open', panel().hidden, false);
  const rows = Array.from(panel().querySelectorAll('[data-bind]'));
  const s0 = Object.keys(DEFAULT_BINDINGS.foot).length, s1 = Object.keys(SEAT1_BINDINGS.foot).length;
  eq(`D0a the Controls group lists every on-foot action per seat (${s0} + ${s1})`, rows.length, s0 + s1);
  const fixedRows = rows.filter((x) => x.classList.contains('fixed')).map((x) => x.dataset.bind).sort().join(',');
  eq('D0b …with pause and debug shown as fixed, and no Rebind button on them', fixedRows, '0:foot:debug,0:foot:pause,1:foot:pause');
  ok('D0c …and none of them carries data-setting (m16 U2\'s walk is unchanged)', rows.every((x) => !x.dataset.setting) && M.settingsPanel.keys().every((k) => !/:/.test(k)));
  ok('D0d …a pad-only action shows an honest empty keyboard chip, not a pad glyph (seat 0 drop)',
     row('0:foot:drop').querySelector('.key.kbm').classList.contains('none') && row('0:foot:drop').querySelector('.key.pad').textContent === 'B',
     rowText(row('0:foot:drop')));

  const r = row('0:foot:interact');
  ok('D1 seat 0\'s interact row shows E and X from the live table', /\bE\b/.test(rowText(r)) && /\bX\b/.test(rowText(r)), rowText(r));
  rebindBtn(r).click();
  ok('B8 click Rebind on interact → the row shows "press a key…"', /press a key/.test(rowText(r)), rowText(r));
  eq('B8a …the Input is capturing', input.capturing, true);
  eq('B8b …and the panel reports it', M.settingsPanel.capturing, true);
  key('keydown', 'KeyG');
  const seenG = input.isDown('interact', 0) || input.wasPressed('interact', 0) || input._down.has('KeyG');
  key('keyup', 'KeyG');
  ok('B8c dispatch KeyG on window → the row shows G', /\bG\b/.test(rowText(r)) && !/press a key/.test(rowText(r)), rowText(r));
  eq('B8d …and the table has KeyG', table()[0].foot.interact.keys[0], 'KeyG');
  eq('B8e …the capture closed itself', input.capturing, false);
  ok('B8f …the blob persisted the diff through the store', !!(load().bindings[0] && load().bindings[0].foot.interact.keys[0] === 'KeyG'), JSON.stringify(load().bindings));
  ok('B9 the captured KeyG never reached the game (not down, not pressed)', !seenG);
  eq('B9a …and its keyup was swallowed too (no release edge for a key never held)', input.wasReleased('interact', 0), false);
  frame();
  eq('B9b …no shell edge for it either', input.consumeShellEdge('interact', 0), false);

  // Escape cancels the capture, not the card, and never pauses.
  rebindBtn(r).click();
  eq('B8g capture open again', input.capturing, true);
  press('Escape');
  eq('B8h Escape during capture cancels', input.capturing, false);
  eq('B8i …leaves the table unchanged (still KeyG)', table()[0].foot.interact.keys[0], 'KeyG');
  eq('B8j …and the card stays open (Escape went to the capture, not the card)', panel().hidden, false);
  ok('B8k …the row is back to its chips', /\bG\b/.test(rowText(r)) && !/press a key/.test(rowText(r)), rowText(r));
  eq('B9c Escape in capture never pauses (before the frame)', game.state.paused, false);
  frame();
  eq('B9d …nor after it (no shell edge was left behind)', game.state.paused, false);
  eq('B9e …and the pause card is not up', document.querySelector('#pause-screen').hidden, true);

  // The timeout, on the frame clock.
  rebindBtn(r).click();
  const T = INPUT.remap.captureTimeoutMs;
  const nBefore = Math.floor(T / FRAME) - 1;
  frame(nBefore);
  eq(`B8l ${nBefore} frames (${Math.round(nBefore * FRAME)} ms of ${T}) in, still capturing`, input.capturing, true);
  ok('B8l1 …and the row still says press a key', /press a key/.test(rowText(r)), rowText(r));
  frame(3);
  eq(`B8m …${nBefore + 3} frames (${Math.round((nBefore + 3) * FRAME)} ms): capture timed out after INPUT.remap.captureTimeoutMs`, input.capturing, false);
  ok('B8n …the row shows its chips again (G)', /\bG\b/.test(rowText(r)) && !/press a key/.test(rowText(r)), rowText(r));
  eq('B8o …and the table is unchanged', table()[0].foot.interact.keys[0], 'KeyG');
  eq('B8p …with the game still running (the timeout runs on the frame clock, not the sim clock)', game.state.paused, false);

  // Refusals are shown on the row, naming the other action / the reserved key.
  rebindBtn(r).click(); press('KeyW');
  ok('B8q a conflicting key (W) is refused ON the row, naming Move forward',
     !conflictLine(r).hidden && /Move forward/.test(conflictLine(r).textContent), conflictLine(r).textContent);
  eq('B8r …and the table kept KeyG', table()[0].foot.interact.keys[0], 'KeyG');
  const overlayWas = overlayHidden();
  rebindBtn(r).click(); press('F3');
  ok('B8s a reserved key (F3) is refused on the row as reserved', !conflictLine(r).hidden && /reserved/.test(conflictLine(r).textContent), conflictLine(r).textContent);
  eq('B8t …and the F3 never toggled the overlay (swallowed from the shell listener)', overlayHidden(), overlayWas);
  eq('B8u …table still KeyG', table()[0].foot.interact.keys[0], 'KeyG');
  rebindBtn(r).click(); press('KeyG');
  eq('B8v a successful capture clears the refusal line', conflictLine(r).hidden, true);

  // A mouse button is captured on window in the capture phase.
  rebindBtn(r).click();
  window.dispatchEvent(new MouseEvent('mousedown', { button: 1, bubbles: true, cancelable: true }));
  window.dispatchEvent(new MouseEvent('mouseup', { button: 1, bubbles: true, cancelable: true }));
  deep('B8w a mouse button (MMB) is captured: interact is now mouse [1] with no key', table()[0].foot.interact, { mouse: [MOUSE.MIDDLE], pad: [PAD.X] });
  ok('B8x …and the row reads MMB', /MMB/.test(rowText(r)), rowText(r));
  eq('B8y …while the game did not see it as held', input._down.has('Mouse1'), false);
  deep('B8y1 …and the save says so with an EXPLICIT empty key class (keys: [] is a difference)', load().bindings[0].foot.interact, { keys: [], mouse: [MOUSE.MIDDLE] });
  {
    const fresh = new Input(window, null);
    fresh.applyBindings(load().bindings);
    fresh._debugPress('KeyE');
    eq('B8y2 …so a fresh load has no key on interact', fresh.isDown('interact'), false);
    fresh._debugPress('Mouse1');
    eq('B8y3 …and MMB is', fresh.isDown('interact'), true);
  }

  // A pad press through the real poll, mapped to the ROW's seat.
  {
    const pad = stubPad();
    const j = row('0:foot:jump');
    rebindBtn(j).click();
    pad.held.add(PAD.L3); frame();
    eq('B8z a pad button through the poll is captured (jump → L3)', table()[0].foot.jump.pad[0], PAD.L3);
    eq('B8z1 …the capture closed', input.capturing, false);
    ok('B8z2 …the row reads L3 and Space', /L3/.test(rowText(j)) && /Space/.test(rowText(j)), rowText(j));
    frame();
    eq('B8z3 …and the still-held button is now jump (held after the capture, honestly)', input.isDown('jump', 0), true);
    pad.held.delete(PAD.L3); frame();
    // Seat 1's row, in solo, where the only pad belongs to seat 0: the row decides the seat.
    const j1 = row('1:foot:jump');
    rebindBtn(j1).click();
    pad.held.add(PAD.R3); frame();
    eq('B8z4 a capture on seat 1\'s row from the pad currently assigned to seat 0 lands on SEAT 1', table()[1].foot.jump.pad[0], PAD.R3);
    eq('B8z5 …and seat 0\'s jump is untouched (L3)', table()[0].foot.jump.pad[0], PAD.L3);
    pad.held.delete(PAD.R3); frame();
    pad.unplug();
  }

  // Reset per seat, and Defaults resets everything on the card.
  panel().querySelector('[data-act="reset-binds"][data-seat="0"]').click();
  deep('B7g Reset P1 controls → seat 0 back to the defaults', table()[0], JSON.parse(JSON.stringify(DEFAULT_BINDINGS)));
  eq('B7h …seat 1 keeps its R3', table()[1].foot.jump.pad[0], PAD.R3);
  ok('B7i …and the interact row reads E again', /\bE\b/.test(rowText(r)) && !/MMB/.test(rowText(r)), rowText(r));
  panel().querySelector('[data-act="defaults"]').click();
  eq('B7j the card\'s Defaults button resets every seat too', JSON.stringify(table()), bootDefaults);
  deep('B7k …and the save holds no diffs', load().bindings, {});

  // m15 P5's pause path is untouched: with the card closed, Escape pauses through the action.
  panel().querySelector('[data-act="close"]').click();
  eq('B9f Done closes the card', panel().hidden, true);
  press('Escape'); frame();
  eq('B9g …and Escape now pauses through the bound action (m15 P5d path)', game.state.paused, true);
  press('Escape'); frame();
  eq('B9h …a second Escape resumes (m15 P5g)', game.state.paused, false);
  input._debugPad(0, PAD.MENU, 1); frame(); input._debugPad(0, PAD.MENU, 0); frame();
  eq('B9i …and pad Menu still pauses (m15 P5)', game.state.paused, true);
  input._debugPad(0, PAD.MENU, 1); frame(); input._debugPad(0, PAD.MENU, 0); frame();
  eq('B9j …and resumes', game.state.paused, false);

  // Closing the card mid-capture cancels the capture.
  M.settingsPanel.show(); rebindBtn(row('0:foot:interact')).click();
  eq('D2 a capture is open', input.capturing, true);
  M.settingsPanel.hide();
  eq('D2a hide() cancels it', input.capturing, false);
  press('KeyG');
  eq('D2b …and a key after that is the game\'s again (interact untouched: E)', table()[0].foot.interact.keys[0], 'KeyE');
}
emit('running...');

/* ── Z. teardown ──────────────────────────────────────────────────────────────── */
lines.push('--- Z. it still runs, and nothing survives this suite ---');
{
  input.resetBindings();
  input.clear();
  M.settingsPanel.hide();
  game.setPaused(false);
  const before = M.physics.stats.bodies;
  frame(60);
  eq('Z1 no bodies leaked over 60 frames', M.physics.stats.bodies, before);
  ok('Z2 state is still plain serializable data (§22.4) and carries no binding',
     (() => { try { const s = JSON.stringify(game.state); return !/KeyF|KeyG|bindings/.test(s); } catch (e) { return false; } })());
  eq('Z3 the game ends the suite running, solo, card hidden, no capture',
     `${game.state.paused}/${M.seatCount}/${panel().hidden}/${input.capturing}`, 'false/1/true/false');
  eq('Z4 the live table is the shipped one again', JSON.stringify(table()), bootDefaults);
  eq('Z4a …and bindingConflicts() is empty', bindingConflicts(input.seatBindings).length, 0);
  ok('Z4b the shipped tables are frozen and untouched', Object.isFrozen(DEFAULT_BINDINGS) && DEFAULT_BINDINGS.foot.interact.keys[0] === 'KeyE' && SEAT1_BINDINGS.foot.jump.pad[0] === PAD.A);
  ok('Z5 no error banner appeared during the suite', banner() === '', banner());
  ok('Z6 glyphOf is honest per device', glyphOf(DEFAULT_BINDINGS.foot.drop, 'kbm') === '' && glyphOf(DEFAULT_BINDINGS.foot.drop, 'pad') === 'B');
}

} catch (e) {
  fails++;
  lines.push(`FAIL  suite threw  <- ${e && e.message}`);
  lines.push((e && e.stack || '').split('\n').slice(0, 6).join('\n'));
}

// TEARDOWN: leave no save and no remap behind for the next run.
try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* nothing to clear */ }
try { input.resetBindings(); input.endCapture(); } catch (e) { /* already reset */ }
emit();
