/* Phase 11 build-side M33 suite — the manifest itself (src/ui/manifestScreen.js).
 *
 * GDD §21.2 "the manifest filters by room/category and shows pickup, loaded, delivered and
 * condition states" — the one sentence of §21.2 M24 left unbuilt; §21.1 "compact objective
 * count … not a checklist" (the HUD stays a count, the checklist lives behind a key);
 * §15.2 room accuracy; §8.3 condition states; §26.5 "states understandable without colour
 * alone"; §2.2 "work continues"; §22.4 shell state.
 *
 * THE CLAIMS:
 *   N1  at boot the card lists one row per required manifest row (23 on the shipped contract),
 *       each naming the def's words, its destination room, 'at pickup', its condition word and
 *       percentage, and a two-person token for every row whose def wants two hands; the footer
 *       reads '0 / 23 delivered · rooms right 0 / 0 · no parts missing'; every state is a WORD.
 *   N2  grabbing, loading, delivering right, delivering wrong, taking the couch's legs off and
 *       breaking a lamp each move the row that owns them — and the list is rebuilt on the
 *       change, never per frame: 120 quiet frames rebuild it zero times.
 *   N3  the three filters select and intersect, 'any/any/any' restores all 23, the choice
 *       survives a close and reopen, and it is NOT in the save (seven sections, unchanged).
 *   N4  shell discipline: three open/close cycles leave the document, the scene and the body
 *       count exactly as they were; game.state stays JSON-serializable and gains nothing; the
 *       card hides under the title, the pause card and the settlement sheet and comes back.
 *   N5  the default key opens and closes it, Escape closes it without pausing, and the action
 *       is a rebindable Controls row on BOTH seats that is not in INPUT.remap.lockedActions.
 *   N6  reduced HUD leaves it available (it is not HUD), high contrast gives it .hc with an
 *       opaque background and 2 px borders, and at --ts 1.6 it scrolls inside its own box.
 *
 * Every live assertion drives game.frame() itself — headless Chrome in --dump-dom mode
 * delivers 1-3 rAF callbacks in total (Dev\INDEX.md → Testing).
 *
 * localStorage 'mfh.save' is cleared at the END (m16's rule).
 */

import { MANIFEST_VIEW, INPUT, SETTINGS } from '../src/config.js';
import { PHASES } from '../src/core/eventBus.js';
import { DEFAULT_BINDINGS, SEAT1_BINDINGS, CONTEXTS, PAD, MOUSE, bindingConflicts } from '../src/core/input.js';
import { DEST_ZONES } from '../src/world/destination.js';
import { cabPoint } from '../src/world/truck.js';
import { OBJECT_DEFS } from '../src/objects/definitions.js';
import { disassemble, reassemble } from '../src/tools/tools.js';
import { load, SAVE_KEY } from '../src/core/save.js';
import { MANIFEST_STATES, ANY, roomLabel, defWords, footerText } from '../src/ui/manifestScreen.js';

const lines = [];
let passes = 0, fails = 0;
function ok(name, cond, detail = '') {
  if (cond) { passes++; lines.push(`PASS  ${name}`); }
  else { fails++; lines.push(`FAIL  ${name}${detail ? '  <- ' + detail : ''}`); }
}
const eq = (n, a, b) => ok(n, a === b, `got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

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

const { game, input, title, registry, physics, movers, world, cargo, interact, route } = M;
const MF = M.manifestScreen;
const FRAME = 16.667;
const frames = (n = 1) => { for (let k = 0; k < n; k++) game.frame(FRAME); };
const el = () => document.getElementById('manifest-screen');
const rowEls = () => MF.rowEls();
const rowIds = () => rowEls().map((r) => r.dataset.row);
const rowText = (li) => li.textContent.replace(/\s+/g, ' ').trim();
const footText = () => el().querySelector('.mf-foot').textContent.replace(/\s+/g, ' ').trim();
const chip = (axis, value) => el().querySelector(`[data-filter="${axis}"][data-value="${value}"]`);
const banner = () => { const b = document.getElementById('err-banner'); return b && b.textContent.trim() ? b.textContent.slice(0, 120) : ''; };
/* DISPATCHED ON <body>, NOT ON window — and the difference is load-bearing here.
 *
 * A real keydown targets the focused element (document.body when nothing is focused) and
 * propagates window → document → html → body and back, so a CAPTURE-phase listener on window
 * (the manifest card's Escape, the settings card's) runs before a BUBBLE-phase listener on
 * window (Input's). An event dispatched ON window is AT TARGET for both, and at-target
 * listeners are invoked in REGISTRATION order with the capture flag ignored — Input is
 * constructed first at boot, so it would win. That ordering is a property of the test, not of
 * the browser, and dispatching on <body> is what makes the suite see what a player sees.
 * (Measured: with window dispatch, Escape closed the card AND paused the game.) */
const key = (type, code) => document.body.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true, cancelable: true }));
const press = (code) => { key('keydown', code); key('keyup', code); };
const rows = () => game.state.manifest;
const rowOfDef = (defId) => rows().find((r) => r.defId === defId);
const liFor = (rowId) => rowEls().find((li) => li.dataset.row === rowId) || null;
const entOf = (row) => registry.get(row.entityId);
const byDef = (id) => [...registry.entities.values()].filter((e) => e.defId === id);
const me = () => movers[M.activeMoverIndex];

function placeMover(m, x, z, y = 0.2) {
  m.controller.hardSetPosition({ x, y, z });
  m.controller._vel.x = 0; m.controller._vel.z = 0;
  m.controller.velocityY = 0; m.controller._climb = null;
  m.controller.carriedMass = 0; m.controller.resistedForce = 0;
  m.controller.pull.x = 0; m.controller.pull.z = 0;
  m.controller.imbalance = 0; m.controller.exertion = 0; m.controller._downMs = 0;
}
function parkAt(e, x, y, z, yaw = 0) {
  e.body.setTranslation({ x, y, z }, true);
  e.body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
  e.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  e.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  e.body.wakeUp();
  physics.primeQueries();
}
/** Stand a mover somewhere and point them at a world point (m11/m21 lookAt). */
function lookAt(m, from, target, snap = false) {
  placeMover(m, from.x, from.z, from.y !== undefined ? from.y : 0.2);
  const p = m.controller.position;
  m.rig.yaw = Math.atan2(-(target.x - p.x), -(target.z - p.z));
  m.rig.pitch = Math.atan2(target.y - (p.y + 1.4), Math.hypot(target.x - p.x, target.z - p.z));
  if (snap) m.rig._first = true;
  for (let k = 0; k < 20; k++) m.rig.update(p, 1 / 60);
  const c = m.camera.position;
  m.rig.yaw = Math.atan2(-(target.x - c.x), -(target.z - c.z));
  m.rig.pitch = Math.atan2(target.y - c.y, Math.hypot(target.x - c.x, target.z - c.z));
  m.grips.syncAim();
  physics.primeQueries();
}
const standOffFrom = (target, back = 1.3) => ({ x: target.x, z: target.z + back });
/** Aim a mover's own rig at a point and grab (m19 grabWith). */
function grabWith(m, hand, target) {
  const p = m.controller.position;
  m.rig.yaw = Math.atan2(-(target.x - p.x), -(target.z - p.z));
  m.rig.pitch = Math.atan2(target.y - (p.y + 1.4), Math.hypot(target.x - p.x, target.z - p.z));
  for (let k = 0; k < 20; k++) m.rig.update(p, 1 / 60);
  const c = m.camera.position;
  m.rig.yaw = Math.atan2(-(target.x - c.x), -(target.z - c.z));
  m.rig.pitch = Math.atan2(target.y - c.y, Math.hypot(target.x - c.x, target.z - c.z));
  return m.grips.tryGrab(hand, m.id, game.clock.simTimeMs);
}
/** A free slot in a destination room (m10/m21 slotIn), so parked items do not stack. */
const used = {};
function slotIn(zoneId) {
  const z = DEST_ZONES.find((r) => r.id === zoneId);
  const i = (used[zoneId] = (used[zoneId] || 0) + 1) - 1;
  const cols = 4;
  const w = (z.maxX - z.minX) - 1.2, d = (z.maxZ - z.minZ) - 1.2;
  return {
    x: z.minX + 0.6 + ((i % cols) + 0.5) * (w / cols),
    z: z.minZ + 0.6 + (Math.floor(i / cols) + 0.5) * (d / 3),
  };
}
/** Park a manifest entity in a destination room. Delivery still needs MANIFEST.dwellMs of
 *  settled dwell (stepManifest) — the caller steps for it. */
function parkInRoom(e, zoneId) {
  const s = slotIn(zoneId);
  parkAt(e, s.x, e.def.dimensions.y / 2 + 0.06, s.z);
}
const I = M.cargoInterior;
/** Park an entity in the truck and wait for cargo.step to count it loaded (m21 loadIntoTruck). */
function loadIntoTruck(e, zOff = 1.0) {
  parkAt(e, M.truckPose.x, I.minY + 0.30, I.maxZ - zOff);
  let n = 0;
  while (!e.state.loaded && n < 240) { frames(1); n++; }
  return n;
}

const cardEl = el();
/** The card's OWN element count, built once at construction and never grown: the list is the
 *  only thing that changes and a closed card clears it. Constant for the whole suite (N4y). */
const CARD_INNER0 = cardEl.querySelectorAll('*').length;
const SCENE0 = world.scene.children.length;
const BODIES0 = physics.stats.bodies;

try {

/* ── N1. contents at boot ──────────────────────────────────────────────────────── */
lines.push('--- N1. one row per required manifest row, every state a word (§21.2, §26.5) ---');
{
  ok('N1-0 the card exists in the DOM at boot, hidden and empty', !!cardEl && cardEl.hidden === true && rowEls().length === 0);
  ok('N1-0a the title card is up, so the manifest would be suppressed under it', title.visible === true);
  title.start();
  frames(2);
  eq('N1-0b the job has started', title.visible, false);

  MF.show();
  frames(1);
  eq('N1 the card is open', el().hidden, false);
  const required = rows().filter((r) => r.required !== false).length;
  eq('N1a the shipped contract has 23 required rows', required, 23);
  eq('N1b …and the card lists one row each', rowEls().length, 23);

  const missing = [];
  for (const row of rows()) {
    const li = liFor(row.id);
    if (!li) { missing.push(`${row.id}: no row`); continue; }
    const t = rowText(li);
    const def = OBJECT_DEFS[row.defId];
    const want = [defWords(row.defId), roomLabel(row.toZone), 'at pickup', 'perfect', '100%'];
    const absent = want.filter((w) => t.indexOf(w) === -1);
    if (absent.length) missing.push(`${row.defId}: missing ${absent.join('/')} in "${t}"`);
    const two = row.handling === 'two-person' || (def.tags || []).includes('twoPersonPreferred');
    if (two !== /two-person/.test(t)) missing.push(`${row.defId}: two-person token ${two ? 'absent' : 'present'} wrongly`);
  }
  ok('N1c every row names its def, its room, "at pickup", its condition word and its percentage — and its two-person token or not',
     missing.length === 0, missing.slice(0, 4).join(' | '));

  const twoRows = rowEls().filter((li) => /two-person/.test(rowText(li))).map((li) => li.dataset.row);
  eq('N1d exactly three rows want two people (the couch, the mattress, the wardrobe)', twoRows.length, 3);
  const twoDefs = twoRows.map((id) => rows().find((r) => r.id === id).defId).sort().join(',');
  eq('N1e …and they are those three', twoDefs, 'couch_3seat_01,mattress_double_01,wardrobe_01');

  eq('N1f the footer reads the shipped sentence', footText(), '0 / 23 delivered · rooms right 0 / 0 · no parts missing');
  eq('N1g …which is footerText()\'s own output (one definition, not two)', footText(), footerText(0, 23, 0, 0, 0));
  // The doors segment is a shipped branch of the same function and nothing else reaches it:
  // main.js feeds it doors.records().filter(off), which is 0 for every fixture in this suite.
  {
    const withDoors = footerText(0, 23, 0, 0, 2);
    ok('N1g1 …and its doors-off segment is a real branch: it appears only when a door is off, and says how many',
       /2/.test(withDoors) && /door/i.test(withDoors) && withDoors !== footerText(0, 23, 0, 0, 0), withDoors);
    ok('N1g2 …one door off reads singular, not "1 doors"', !/\b1 doors\b/.test(footerText(0, 23, 0, 0, 1)), footerText(0, 23, 0, 0, 1));
  }

  /* §26.5: the state is TEXT. Every row's state cell is one of the six words, and no row
   * leans on a colour to say which. */
  const words = MANIFEST_STATES.map((s) => s.label);
  const cells = rowEls().map((li) => li.querySelector('.mf-state').textContent.trim());
  ok('N1h every state cell is one of the six state WORDS', cells.every((c) => words.includes(c)),
     [...new Set(cells)].join(' | '));
  eq('N1i …and at boot every one of them is "at pickup"', [...new Set(cells)].join(','), 'at pickup');
  const cond = rowEls().map((li) => li.querySelector('.mf-cond').textContent.trim());
  eq('N1j every condition cell is the band word plus the percentage', [...new Set(cond)].join(','), 'perfect 100%');

  eq('N1k the card is NOT a HUD panel — it lives beside them in #ui, not inside one',
     M.huds.filter((h) => h.el.contains(el())).length, 0);
  M.feedHuds();
  const contract = M.hud.contract.textContent.replace(/\s+/g, ' ').trim();
  ok('N1l …and the HUD\'s contract panel is still §21.1\'s COUNT, not a checklist',
     /manifest/.test(contract) && contract.indexOf('0 / 23') >= 0 &&
     M.hud.contract.querySelectorAll('li').length === 0 && M.hud.el.querySelectorAll('.mf-row').length === 0,
     contract.slice(0, 90));
  lines.push(`      rows ${rowEls().length}, footer "${footText()}"`);
}
emit('running...');

/* ── N4a. shell discipline: the card costs the world nothing ───────────────────── */
lines.push('--- N4a. three open/close cycles cost no elements, no bodies, no scene children (§22.4) ---');
{
  MF.hide();
  frames(1);
  eq('N4-0 closed', el().hidden, true);
  eq('N4-0a …and a closed card holds no rows', rowEls().length, 0);
  /* The baseline is taken HERE, with the card closed and the HUD already fed once — the HUD's
   * own panels write their spans on the first feed (N1l above), and counting those as the
   * card's growth would be measuring the wrong thing. */
  const dom0 = document.querySelectorAll('*').length;
  for (let i = 0; i < 3; i++) { MF.show(); frames(2); MF.hide(); frames(2); }
  eq('N4 document element count unchanged after three open/close cycles', document.querySelectorAll('*').length, dom0);
  eq('N4-1 …and the card\'s own subtree is exactly the one it was built with', cardEl.querySelectorAll('*').length, CARD_INNER0);
  eq('N4a scene children unchanged', world.scene.children.length, SCENE0);
  eq('N4b body count unchanged', physics.stats.bodies, BODIES0);
  eq('N4c the card is the same element', el() === cardEl, true);
  ok('N4d game.state is still plain serializable data (m0 E8)',
     (() => { try { JSON.stringify(game.state); return true; } catch (e) { return false; } })());
  eq('N4e …and nothing of the card is in it', `${game.state.manifestPanel}/${game.state.manifestFilters}/${game.state.manifestScreen}`,
     'undefined/undefined/undefined');
  ok('N4f the filters live on the card, not on the state',
     ['room', 'category', 'state'].every((k) => k in MF.filters), JSON.stringify(MF.filters));

  /* §2.2: the card pauses NOTHING. The clock, the labour and the steps all run under it. */
  MF.show();
  frames(1);
  const t0 = game.clock.simTimeMs, w0 = game.state.elapsedWorkMs, s0 = game.clock.stepCount;
  frames(60);
  ok('N4g 60 frames under the open card advance the clock (§2.2 work continues)', game.clock.simTimeMs - t0 > 900,
     `${(game.clock.simTimeMs - t0).toFixed(0)} ms`);
  ok('N4h …run steps', game.clock.stepCount - s0 > 50, `${game.clock.stepCount - s0} steps`);
  ok('N4i …and bill labour', game.state.elapsedWorkMs - w0 > 900, `${(game.state.elapsedWorkMs - w0).toFixed(0)} ms`);
  eq('N4j …and the game was never paused', game.state.paused, false);
}
emit('running...');

/* ── N5. the key, and the rebindable row ───────────────────────────────────────── */
lines.push('--- N5. the default key, Escape without a pause, and a Controls row on both seats (§4.4, §21.4) ---');
{
  MF.hide(); frames(1);
  press('KeyM'); frames(1);
  eq('N5 the default key opens the card', el().hidden, false);
  press('KeyM'); frames(1);
  eq('N5a …and closes it', el().hidden, true);
  press('KeyM'); frames(1);
  eq('N5b open again', el().hidden, false);
  press('Escape'); frames(1);
  eq('N5c Escape closes it', el().hidden, true);
  eq('N5d …WITHOUT pausing (m15 P5\'s pattern: the keystroke never reaches the pause action)', game.state.paused, false);

  eq('N5e the action is rebindable — not one of INPUT.remap.lockedActions', INPUT.remap.lockedActions.includes('manifest'), false);
  eq('N5f seat 0\'s default is M', DEFAULT_BINDINGS[CONTEXTS.FOOT].manifest.keys[0], 'KeyM');
  eq('N5g seat 1\'s default is Period', SEAT1_BINDINGS[CONTEXTS.FOOT].manifest.keys[0], 'Period');
  eq('N5h both are on the pad\'s D-pad up (§4.4 parity)',
     `${DEFAULT_BINDINGS[CONTEXTS.FOOT].manifest.pad[0]}/${SEAT1_BINDINGS[CONTEXTS.FOOT].manifest.pad[0]}`,
     `${PAD.DPAD_UP}/${PAD.DPAD_UP}`);
  eq('N5i …and the shipped tables are still conflict-free with it in (both seats checked)', bindingConflicts().length, 0);

  const panel = () => document.getElementById('settings-screen');
  M.settingsPanel.show();
  const r0 = panel().querySelector('[data-bind="0:foot:manifest"]');
  const r1 = panel().querySelector('[data-bind="1:foot:manifest"]');
  ok('N5j Settings → Controls lists the manifest row for BOTH seats', !!r0 && !!r1);
  ok('N5k …with a Rebind button on each (neither is fixed)',
     !!r0.querySelector('[data-act="rebind"]') && !!r1.querySelector('[data-act="rebind"]'));
  ok('N5l …named in words, not by its id', /The manifest/.test(r0.textContent), r0.textContent.replace(/\s+/g, ' ').trim());
  ok('N5m …showing M and D-up from the live table',
     /\bM\b/.test(r0.textContent) && /D-up/.test(r0.textContent), r0.textContent.replace(/\s+/g, ' ').trim());
  ok('N5n …and Period\'s label for seat 1', /\./.test(r1.querySelector('.key.kbm').textContent),
     r1.textContent.replace(/\s+/g, ' ').trim());
  ok('N5o bindRows() offers both to a suite', M.settingsPanel.bindRows().includes('0:foot:manifest') &&
     M.settingsPanel.bindRows().includes('1:foot:manifest'), M.settingsPanel.bindRows().length + ' rows');

  // m26's pattern: click Rebind, press the key, and assert the LIVE table moved.
  r0.querySelector('[data-act="rebind"]').click();
  key('keydown', 'KeyY'); key('keyup', 'KeyY');
  eq('N5p a rebind moves the live table', input.bindingTable()[0].foot.manifest.keys[0], 'KeyY');
  eq('N5q …and the row\'s chip says so', r0.querySelector('.key.kbm').textContent, 'Y');
  eq('N5r …with the table still conflict-free', bindingConflicts(input.seatBindings).length, 0);
  panel().querySelector('[data-act="close"]').click();
  frames(1);
  press('KeyY'); frames(1);
  eq('N5s the NEW key opens the card', el().hidden, false);
  press('KeyY'); frames(1);
  eq('N5t …and closes it', el().hidden, true);
  press('KeyM'); frames(1);
  eq('N5u while the old key does nothing at all', el().hidden, true);
  M.settingsStore.resetBindings();
  frames(1);
  press('KeyM'); frames(1);
  eq('N5v after Reset, M opens it again', el().hidden, false);
  MF.hide(); frames(1);
  ok('N5w no error banner from any of it', banner() === '', banner());
}
emit('running...');

/* ── N6. accessibility ─────────────────────────────────────────────────────────── */
lines.push('--- N6. reduced HUD leaves it, high contrast styles it, 1.6x scrolls it (§21.4, §26.5) ---');
{
  const store = M.settingsStore;
  store.apply({ reducedHud: true });
  MF.show(); frames(1);
  eq('N6 reduced HUD does not hide the card — it is not HUD', el().hidden, false);
  eq('N6a …and it still lists every row', rowEls().length, 23);
  store.apply({ reducedHud: false });

  store.apply({ hints: false });
  frames(1);
  eq('N6b hints off does not hide it either — it is a reference, not a hint', el().hidden, false);
  store.apply({ hints: true });

  store.apply({ highContrast: true });
  frames(1);
  ok('N6c high contrast puts .hc on the card', el().classList.contains('hc'));
  const card = el().querySelector('.mf-card');
  const cs = getComputedStyle(card);
  const alpha = (cs.backgroundColor.match(/rgba?\(([^)]+)\)/) || [, ''])[1].split(',').map((s) => s.trim());
  eq('N6d …an opaque card background (alpha 1)', alpha.length === 4 ? Number(alpha[3]) : 1, 1);
  eq('N6e …and 2 px borders', cs.borderTopWidth, '2px');
  const chipCs = getComputedStyle(el().querySelector('.mf-chip'));
  eq('N6f …on the filter chips too', chipCs.borderTopWidth, '2px');
  eq('N6g …with nothing dimmed', chipCs.opacity, '1');
  store.apply({ highContrast: false });
  frames(1);

  const big = SETTINGS.ranges.uiScale.max;
  eq('N6h the settings range tops out at 1.6', big, 1.6);
  store.apply({ uiScale: big });
  frames(2);
  const list = el().querySelector('.mf-list');
  const c2 = el().querySelector('.mf-card');
  ok(`N6i at --ts ${big} the list scrolls inside its own box`, list.scrollHeight > list.clientHeight + 1,
     `scrollHeight ${list.scrollHeight} vs clientHeight ${list.clientHeight}`);
  ok('N6j …and clips nothing horizontally (scrollWidth <= clientWidth)', list.scrollWidth <= list.clientWidth + 1,
     `list scrollWidth ${list.scrollWidth} vs clientWidth ${list.clientWidth}`);
  ok('N6k …nor does the card', c2.scrollWidth <= c2.clientWidth + 1,
     `card scrollWidth ${c2.scrollWidth} vs clientWidth ${c2.clientWidth}`);
  ok('N6l …and the card itself stays inside the window', c2.getBoundingClientRect().height <= window.innerHeight + 1,
     `${c2.getBoundingClientRect().height.toFixed(0)} px in ${window.innerHeight}`);
  ok('N6m …with the footer still on screen under it',
     el().querySelector('.mf-foot').getBoundingClientRect().bottom <= window.innerHeight + 1,
     `${el().querySelector('.mf-foot').getBoundingClientRect().bottom.toFixed(0)} px`);
  lines.push(`      1.6x: list ${list.clientHeight}px box over ${list.scrollHeight}px of rows; card ${c2.getBoundingClientRect().height.toFixed(0)}px in ${window.innerHeight}px`);
  eq('N6n the list box comes from config, not from the stylesheet',
     el().style.getPropertyValue('--mf-list-max'), `${Math.round(MANIFEST_VIEW.listMaxVh * 100)}vh`);
  store.apply({ uiScale: 1 });
  frames(2);
  MF.hide(); frames(1);
}
emit('running...');

/* ── N2. live states ───────────────────────────────────────────────────────────── */
lines.push('--- N2. carried, on the truck, delivered, wrong room, parts off, damaged (§8.3, §15.2) ---');
{
  MF.show(); frames(1);
  const before = MF.rebuilds;
  frames(120);
  eq('N2 120 quiet frames rebuild the list ZERO times (event-driven, not a per-frame renderer)',
     MF.rebuilds - before, 0);

  /* --- carried. On open ground well away from the house, the destination and m5's grid, so
   * the aim ray cannot pick the OTHER box off the same stack (m19's PAD rule). */
  const PAD = { x: 40, z: -40 };
  const boxes = byDef('box_small_01');
  const box = boxes[0];
  const boxRow = rows().find((r) => r.entityId === box.id);
  parkAt(box, PAD.x, box.def.dimensions.y / 2 + 0.02, PAD.z);
  placeMover(me(), PAD.x, PAD.z + 0.9);
  frames(10);
  const t = box.body.translation();
  const r1 = MF.rebuilds;
  /* THE BUTTON IS HELD, not just the grab called. §4.4's grip is a HOLD by default
   * (gripMode), and the movers system releases any hand whose action is not down on the next
   * step (main.js) — a bare tryGrab() is gone one frame later (measured: right=false, held=
   * false on frame 1). Holding the seat's own gripRight token is what a player does. */
  input._debugPress('Mouse' + MOUSE.RIGHT);
  const g = grabWith(me(), 'right', { x: t.x, y: t.y, z: t.z });
  frames(1);
  ok('N2a a real grip on a box, with the button held', !!g && g.entityId === box.id && !!me().grips.grips.right,
     g ? `${g.entityId} right=${!!me().grips.grips.right}` : 'tryGrab returned null');
  eq('N2b …its row reads "carried" within one frame', liFor(boxRow.id).querySelector('.mf-state').textContent.trim(), 'carried');
  ok('N2c …and that took exactly one rebuild', MF.rebuilds - r1 === 1, `${MF.rebuilds - r1} rebuilds`);
  input._debugRelease('Mouse' + MOUSE.RIGHT);
  frames(3);
  eq('N2c1 …and letting go puts it back to "at pickup"', liFor(boxRow.id).querySelector('.mf-state').textContent.trim(), 'at pickup');

  // --- on the truck
  const r2 = MF.rebuilds;
  let n = loadIntoTruck(box);
  eq('N2d parked in the truck, cargo counts it loaded', box.state.loaded, true);
  frames(1);
  eq('N2e …and the row reads "on the truck"', liFor(boxRow.id).querySelector('.mf-state').textContent.trim(), 'on the truck');
  ok('N2f …in at most one rebuild per frame of that wait', MF.rebuilds - r2 <= n + 2, `${MF.rebuilds - r2} rebuilds over ${n + 1} frames`);

  // --- delivered, to the right room
  parkInRoom(box, boxRow.toZone);
  n = 0;
  while (!boxRow.delivered && n < 400) { frames(1); n++; }
  eq('N2g parked in its own room, the row delivers', boxRow.delivered, true);
  frames(1);
  eq('N2h …and reads "delivered"', liFor(boxRow.id).querySelector('.mf-state').textContent.trim(), 'delivered');
  ok('N2i …with no "wrong room" token', !/wrong room/.test(rowText(liFor(boxRow.id))), rowText(liFor(boxRow.id)));
  eq('N2j …and the footer counts it, rooms right and all', footText(), footerText(1, 23, 1, 0, 0));

  // --- delivered, to the WRONG room
  const box2 = boxes.find((b) => b !== box && rows().find((r) => r.entityId === b.id).toZone !== 'dest_kitchen');
  const row2 = rows().find((r) => r.entityId === box2.id);
  const wrong = row2.toZone === 'dest_kitchen' ? 'dest_bedroom' : 'dest_kitchen';
  parkInRoom(box2, wrong);
  n = 0;
  while (!row2.delivered && n < 400) { frames(1); n++; }
  eq('N2k a box parked in the WRONG room still delivers (§2.1: a price, not a gate)', row2.delivered, true);
  frames(1);
  eq('N2l …reads "delivered"', liFor(row2.id).querySelector('.mf-state').textContent.trim(), 'delivered');
  ok('N2m …and carries a "wrong room" token in WORDS (§26.5)', /wrong room/.test(rowText(liFor(row2.id))), rowText(liFor(row2.id)));
  eq('N2n …while the footer\'s rooms-right count did NOT rise', footText(), footerText(2, 23, 1, 0, 0));

  // --- the couch's legs (M12)
  const couch = byDef('couch_3seat_01')[0];
  const couchRow = rows().find((r) => r.entityId === couch.id);
  const r3 = MF.rebuilds;
  const off = disassemble(registry, couch, 'legs');
  frames(1);
  ok('N2o the couch\'s legs come off as four pieces', !!off && (couch.state.parts.legs || []).length === 4,
     off ? String((couch.state.parts.legs || []).length) : 'disassemble returned null');
  ok('N2p …and its row says "parts off (4)"', /parts off \(4\)/.test(rowText(liFor(couchRow.id))), rowText(liFor(couchRow.id)));
  ok('N2q …in one rebuild', MF.rebuilds - r3 === 1, `${MF.rebuilds - r3} rebuilds`);
  ok('N2r …and the footer counts the four pieces as missing',
     /4 parts missing/.test(footText()), footText());

  // --- a broken lamp (§8.3)
  const lamp = byDef('lamp_floor_01')[0];
  const lampRow = rows().find((r) => r.entityId === lamp.id);
  eq('N2s the lamp starts perfect', liFor(lampRow.id).querySelector('.mf-cond').textContent.trim(), 'perfect 100%');
  const r4 = MF.rebuilds;
  /* Dropped on the open PAD, not where it stands. In the living room a 3.2 m drop lands on
   * the ROOF (measured: y 3.68, condition 100 after 200 frames) — the house has a lid and the
   * lamp never falls at all. Two and a half metres of clear air outside it is a §8.3 impact:
   * a 'fragile' lamp at 5.4 m/s goes straight through the bands to broken. */
  parkAt(lamp, PAD.x + 6, 2.4, PAD.z + 6);
  n = 0;
  while (lamp.state.condition >= 100 && n < 240) { frames(1); n++; }
  ok('N2t dropped 2.4 m onto open ground the lamp loses condition', lamp.state.condition < 100,
     `condition ${lamp.state.condition.toFixed(1)} after ${n} frames`);
  frames(1);
  const lampCell = liFor(lampRow.id).querySelector('.mf-cond').textContent.trim();
  ok('N2u …its row\'s condition word and percentage both changed', lampCell !== 'perfect 100%', lampCell);
  eq('N2v …to the band and percentage the model reports',
     lampCell, `${MF.view().all.find((r) => r.id === lampRow.id).conditionWord} ${MF.view().all.find((r) => r.id === lampRow.id).conditionPct}`);
  ok('N2w …and the row carries the damage token, in words', /damaged/i.test(rowText(liFor(lampRow.id))), rowText(liFor(lampRow.id)));
  ok('N2x the fall rebuilt the list at most once per frame it fell for', MF.rebuilds - r4 <= n + 2,
     `${MF.rebuilds - r4} rebuilds over ${n + 1} frames`);
  lines.push(`      lamp: ${lamp.state.condition.toFixed(1)} → "${lampCell}"; couch pieces ${(couch.state.parts.legs || []).length}`);

  // Quiet again: nothing moving, nothing rebuilding.
  frames(60);
  const r5 = MF.rebuilds;
  frames(90);
  eq('N2y and 90 more quiet frames rebuild it zero times', MF.rebuilds - r5, 0);
}
emit('running...');

/* ── N3. filters ───────────────────────────────────────────────────────────────── */
lines.push('--- N3. filters by room, kind and state, and the choice is not a saved setting (§21.2) ---');
{
  const view = () => MF.view();
  eq('N3-0 all 23 rows with no filter', rowEls().length, 23);
  eq('N3-0a …and the three filters read "any"', `${MF.filters.room}/${MF.filters.category}/${MF.filters.state}`, `${ANY}/${ANY}/${ANY}`);

  // --- room
  chip('room', 'dest_kitchen').click();
  frames(1);
  const kitchen = view().all.filter((r) => r.roomId === 'dest_kitchen');
  eq('N3 room "kitchen" shows only the kitchen-destined rows', rowEls().length, kitchen.length);
  eq('N3a …which is 8 on the shipped contract', kitchen.length, 8);
  ok('N3b …and every visible row says so', rowEls().every((li) => /to the kitchen/.test(rowText(li))),
     rowEls().map((li) => rowText(li)).slice(0, 2).join(' | '));
  eq('N3c …with the chip marked pressed, not merely coloured (§26.5)', chip('room', 'dest_kitchen').getAttribute('aria-pressed'), 'true');
  eq('N3d …and the header counting what is on screen', el().querySelector('.mf-count').textContent, '8 of 23 rows');

  // --- room x category: they intersect
  chip('category', 'box').click();
  frames(1);
  const both = view().all.filter((r) => r.roomId === 'dest_kitchen' && r.category === 'box');
  eq('N3e two filters INTERSECT', rowEls().length, both.length);
  eq('N3f …which is 5 kitchen boxes', both.length, 5);
  ok('N3g …strictly fewer than either filter alone', both.length < kitchen.length, `${both.length} vs ${kitchen.length}`);

  // --- category alone
  chip('room', ANY).click();
  chip('category', 'fragile').click();
  frames(1);
  const frag = view().all.filter((r) => r.category === 'fragile');
  eq('N3h kind "fragile" shows only the fragile defs', rowEls().length, frag.length);
  eq('N3i …the TV and the mirror', rowIds().map((id) => rows().find((r) => r.id === id).defId).sort().join(','),
     'mirror_framed_01,tv_55_01');

  // --- the departure, and 'left at the old house'
  chip('category', ANY).click();
  frames(1);
  eq('N3j any/any/any restores all 23', rowEls().length, 23);

  /* Everything into its room but ONE box and the couch's own row, then leave. Parked together
   * they dwell together, so this costs one wait rather than twenty-one. */
  reassemble(registry, byDef('couch_3seat_01')[0], 'legs', { force: true });
  frames(2);
  const stayId = rowOfDef('box_heavy_01').id;
  for (const row of rows()) {
    if (row.id === stayId || row.delivered) continue;
    const e = entOf(row);
    if (e) parkInRoom(e, row.toZone);
  }
  let n = 0;
  const left = () => rows().filter((r) => !r.delivered).length;
  while (left() > 1 && n < 600) { frames(1); n++; }
  eq('N3k every row but one is delivered', left(), 1);
  eq('N3l …and it is the one left behind', rows().find((r) => !r.delivered).id, stayId);

  eq('N3m still in PICKUP, so the last row reads "at pickup"', game.state.phase, PHASES.PICKUP);
  frames(1);
  eq('N3n …as the card says', liFor(stayId).querySelector('.mf-state').textContent.trim(), 'at pickup');

  /* THE REAL DEPARTURE, through the cab's own E (interact.js), not a hand-set phase: 'at
   * pickup' and 'left at the old house' are the same PLACE and different news, and the news
   * is that the truck went. */
  const cab = cabPoint();
  lookAt(me(), standOffFrom(cab, 1.4), cab, true);
  frames(2);
  interact.act(me());
  frames(2);
  eq('N3o E at the cab departs — the phase is transit', game.state.phase, PHASES.TRANSIT);
  eq('N3p …and the same row now reads "left at the old house"',
     liFor(stayId).querySelector('.mf-state').textContent.trim(), 'left at the old house');

  chip('state', 'away').click();
  frames(1);
  eq('N3q the state filter "left at the old house" shows only that row', rowEls().length, 1);
  eq('N3r …and it is the box left behind', rowIds()[0], stayId);
  chip('state', ANY).click();
  frames(1);
  eq('N3s any/any/any restores all 23 again', rowEls().length, 23);

  // --- the choice survives a close and reopen, and is not in the save
  chip('room', 'dest_bedroom').click();
  chip('state', 'delivered').click();
  frames(1);
  const kept = rowEls().length;
  ok('N3t a two-axis filter is showing something', kept > 0 && kept < 23, `${kept} rows`);
  MF.hide(); frames(1);
  MF.show(); frames(1);
  eq('N3u the filter choice survives closing and reopening', `${MF.filters.room}/${MF.filters.state}`, 'dest_bedroom/delivered');
  eq('N3v …and the list comes back the same size', rowEls().length, kept);
  const blob = load();
  eq('N3w the save still has exactly the seven sections — a filter is not a setting',
     Object.keys(JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')).sort().join(','),
     'bestInvoice,bindings,build,runs,schema,settings,shell');
  ok('N3x …and none of them mentions a filter', JSON.stringify(blob).indexOf('dest_bedroom') === -1,
     JSON.stringify(blob).slice(0, 120));
  MF.clearFilters(); frames(1);
  eq('N3y cleared', rowEls().length, 23);
}
emit('running...');

/* ── N4b. it hides under every pause-shaped screen, and comes back ─────────────── */
lines.push('--- N4b. suppressed under the title, the pause card and the settlement sheet (M22 discipline) ---');
{
  MF.show(); frames(1);
  eq('N4k open', el().hidden, false);

  title._done = false;                    // the title card, back on screen
  frames(1);
  eq('N4l hidden under the title card', el().hidden, true);
  eq('N4m …but still OPEN — the player never closed it', MF.open, true);
  title._done = true;
  frames(1);
  eq('N4n …and back when the title goes', el().hidden, false);

  game.setPaused(true);
  frames(1);
  eq('N4o hidden under the pause card', el().hidden, true);
  eq('N4p …still open', MF.open, true);
  game.setPaused(false);
  frames(1);
  eq('N4q …and back when the game resumes', el().hidden, false);

  M.settingsPanel.show();
  frames(1);
  eq('N4r hidden under the settings card', el().hidden, true);
  document.getElementById('settings-screen').querySelector('[data-act="close"]').click();
  frames(1);
  eq('N4s …and back when it closes', el().hidden, false);

  M.settle();
  frames(1);
  eq('N4t the settlement sheet is up', M.invoiceScreen.visible, true);
  eq('N4u …and the card is hidden under it', el().hidden, true);
  eq('N4v …still open', MF.open, true);
  M.invoiceScreen.hide();
  frames(1);
  eq('N4w …and back when the sheet goes', el().hidden, false);
  MF.hide(); frames(1);

  eq('N4x the card ends closed', el().hidden, true);
  eq('N4y …with its own subtree exactly the size it was built with, after the whole suite',
     cardEl.querySelectorAll('*').length, CARD_INNER0);
  ok('N4z game.state is still serializable after all of it',
     (() => { try { JSON.stringify(game.state); return true; } catch (e) { return false; } })());
  ok('N4z1 no error banner across the whole suite', banner() === '', banner());
}

} catch (e) {
  fails++;
  lines.push(`FAIL  suite threw  <- ${e && e.message}`);
  lines.push((e && e.stack || '').split('\n').slice(0, 6).join('\n'));
}

// TEARDOWN: leave no save behind for the next run (m16's rule).
try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* nothing to clear */ }
emit();
