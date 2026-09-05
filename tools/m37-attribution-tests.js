/* Phase 11 build-side M30 suite — property damage tells the whole story.
 *
 * M14 built the property ledger and wrote three edges into KNOWN_ISSUES (Phase 21) as facts
 * rather than as fixes. This suite is the fix, and each claim below is one of them:
 *
 *   P1 SPLIT        §15.1/§8.4 — "A corner hit bills one surface": attribution gave the whole
 *                   m·Δv to whichever manifold pushed hardest, so a wall and a header struck in
 *                   the same step charged one of them everything. The m·Δv is now shared in
 *                   proportion to what each SURFACE took, one line, notice, mark and caption
 *                   each — and the shares add up to the one line M14 posted, TO THE CENT. The
 *                   pre-change formula is copied into this file (m14Cost) so the equality is
 *                   measured against the code that was replaced and not against itself.
 *   P2 FOLD         …and a graze under DAMAGE.property.splitMinFraction is folded into the
 *                   largest rather than posted as a 0.4-cent line (§26.4 "one ledger entry").
 *                   The RECORD still lists both surfaces, at shares [1, 0]: what was touched
 *                   is a fact even when it was not billed.
 *   P3 CAPPED       §8.3's "maximum charge" caps the MONEY; §8.4 asks for a sound, a mark and
 *                   "one small cost notice" at EVERY impact. "A capped surface posts no further
 *                   lines" — and with them no notices and no marks, so a player grinding a
 *                   paid-for wall stopped being told anything. The ledger half is unchanged to
 *                   the cent; the feedback half is EVENTS.PROPERTY_CAPPED.
 *   P4 CAPTIONS     §26.5 — "Property captions are generic ('wall scuffed') because m18 A1b
 *                   pins string captions". A caption cell may now be a pure FUNCTION of the
 *                   payload, so the subtitle names the surface the notice has always named.
 *   P5 UNCHANGED    §25.2 "ledger matches events" — a single-surface hit is M14's line key for
 *                   key, and evidenceFrom's aggregate over a run with split lines agrees with
 *                   the ledger to the cent.
 *
 * Fixtures: m22's step()/parkAt()/throwAt()/freshRun() and its PD2 and PD6 throws, so the
 * numbers here and there are the same numbers. Every figure in a message below is MEASURED.
 */

import { SIM, DAMAGE, INVOICE } from '../src/config.js';
import { EVENTS } from '../src/core/eventBus.js';
import { propertyCost, propertyBandFor } from '../src/damage/damage.js';
import { labelFor, surfaceCaption, surfaceKind, surfaceRoom, billable } from '../src/damage/surfaces.js';
import { CUES, resolveCue, captionText } from '../src/audio/audio.js';
import { recapFrom } from '../src/ui/invoiceScreen.js';
import { LINE_KINDS } from '../src/contract/invoice.js';
import { evidenceFrom } from '../src/telemetry/evidence.js';

const lines = [];
let passes = 0, fails = 0;
function ok(name, cond, detail = '') {
  if (cond) { passes++; lines.push(`PASS  ${name}`); }
  else { fails++; lines.push(`FAIL  ${name}${detail ? '  <- ' + detail : ''}`); }
}
const eq = (n, a, b) => ok(n, a === b, `got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const near = (n, a, b, tol) => ok(n, Math.abs(a - b) <= tol, `${a} vs ${b} (tol ${tol})`);

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

const { game, physics, registry, straps, cargo, damage, huds } = M;
const bus = game.bus;
const STEP = SIM.stepMs;
const P = DAMAGE.property;

/* ── drivers (m22/m8 lineage) ─────────────────────────────────────────────── */
let T = Math.max(1000, game.clock.simTimeMs);
function step(n = 1) {
  for (let i = 0; i < n; i++) {
    T = Math.max(T + STEP, game.clock.simTimeMs + STEP);
    physics.clearForces();
    straps.step(STEP, T);
    physics.step();
    registry.step(STEP);
    cargo.step(STEP, T);
    damage.step(STEP, T);
  }
}
function parkAt(e, x, y, z) {
  e.body.setTranslation({ x, y, z }, true);
  e.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  e.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  e.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  e.body.wakeUp();
  physics.primeQueries();
}
function throwAt(e, vx, vy, vz) { e.body.setLinvel({ x: vx, y: vy, z: vz }, true); e.body.wakeUp(); }
const allOfDef = (id) => [...registry.entities.values()].filter((e) => e.defId === id);
const prop = () => game.state.ledger.propertyDamage;
const sumCost = (ls) => Number(ls.reduce((s, l) => s + l.cost, 0).toFixed(2));
function drainNotices() { const n = M.pendingNotices.length; M.pendingNotices.splice(0, n); return n; }
function freshRun() {
  if (M.invoiceScreen.visible) M.invoiceScreen.onReplay(); else { M.resetContract(); game.setPaused(false); }
  drainNotices();
}

/* THE PRE-CHANGE FORMULA, copied verbatim from M14's damage.js so the split is measured
 * against what it replaced: cost = max(0, (Σ m·Δv − impulseThreshold) × costPerImpulse),
 * rounded to the cent exactly where the ledger rounds. Nothing in src/ is consulted for it. */
const m14Raw = (impulse) => Math.max(0, (impulse - P.impulseThreshold) * P.costPerImpulse);
const m14Cost = (impulse) => Number(m14Raw(impulse).toFixed(2));

/** Σ|contactImpulse| this step, per SURFACE tag — the narrow-phase read the split is made of. */
function contactSums(e) {
  const world = physics.world, self = e.collider;
  const by = {}; let total = 0, billableTotal = 0;
  world.contactPairsWith(self, (other) => {
    let s = 0;
    world.contactPair(self, other, (m) => { const n = m.numContacts(); for (let i = 0; i < n; i++) s += Math.abs(m.contactImpulse(i)); });
    if (!(s > 0)) return;
    const tag = physics.tagOf(other) || 'entity';
    by[tag] = (by[tag] || 0) + s;
    total += s;
    if (billable(tag)) billableTotal += s;
  });
  return { by, total, billableTotal };
}

/** Throw and stop at the first step that opened a property window, so the manifold impulses
 *  printed are the ones the split was computed from. Returns {sums, windows}. */
function throwAndTrace(e, at, vel, steps = 45) {
  parkAt(e, at[0], at[1], at[2]);
  e.state.condition = 100;
  step(3);
  throwAt(e, vel[0], vel[1], vel[2]);
  let sums = null, windows = null;
  for (let i = 0; i < steps; i++) {
    step(1);
    if (!sums && damage._openProp.size > 0) {
      sums = contactSums(e);
      windows = [...damage._openProp.values()].map((w) => ({
        surfaceId: w.surfaceId, impulse: w.impulse, share: w.fracSum / w.impulse,
        surfaces: w.surfaces ? w.surfaces.map((s) => ({ ...s })) : null,
      }));
    }
  }
  damage.flush(T);
  return { sums, windows };
}

/** Every property DAMAGE_APPLIED and every PROPERTY_CAPPED the bus carried, as stamped. */
const propEvents = [];
const cappedEvents = [];
bus.on(EVENTS.DAMAGE_APPLIED, (e) => { if (e.category === 'property') propEvents.push(e); });
bus.on(EVENTS.PROPERTY_CAPPED, (e) => { cappedEvents.push(e); });

try {

/* ── P0. the table and the two new numbers ────────────────────────────────── */
lines.push('--- P0. the config and the surface vocabulary (GDD §8.3, §26.5) ---');
{
  ok('P0 DAMAGE.property carries M30\'s two numbers: splitMinFraction in (0, 0.5), cappedRepeatMs > aggregationWindowMs',
     Number.isFinite(P.splitMinFraction) && P.splitMinFraction > 0 && P.splitMinFraction < 0.5 &&
     Number.isFinite(P.cappedRepeatMs) && P.cappedRepeatMs > DAMAGE.aggregationWindowMs,
     `splitMinFraction ${P.splitMinFraction}, cappedRepeatMs ${P.cappedRepeatMs}, window ${DAMAGE.aggregationWindowMs}`);
  eq('P0a propertyCost(impulse) with no share is M14\'s closed form, to the last bit',
     propertyCost(36), m14Raw(36));
  ok('P0b …and propertyCost splits its threshold with the share: Σ fᵢ·I priced at fᵢ === the whole priced at 1',
     Math.abs((propertyCost(36 * 0.7, 0.7) + propertyCost(36 * 0.3, 0.3)) - m14Raw(36)) < 1e-9,
     `${propertyCost(36 * 0.7, 0.7)} + ${propertyCost(36 * 0.3, 0.3)} vs ${m14Raw(36)}`);
  ok('P0c …so a share is exactly its fraction of the bill: propertyCost(0.7·I, 0.7) === 0.7 × propertyCost(I)',
     Math.abs(propertyCost(36 * 0.7, 0.7) - 0.7 * m14Raw(36)) < 1e-9);
  // The caption vocabulary: kind and room for every surface the house and the truck have.
  const table = [
    ['wall', 'wall', 'front', 'front wall'],
    ['doorHeader_living_kitchen', 'door frame', 'living-kitchen', 'living-kitchen door frame'],
    ['door_frame_living_kitchen', 'door frame', 'living-kitchen', 'living-kitchen door frame'],
    ['partition_wall_living_back', 'wall', 'living room', 'living room back wall'],
    ['roomCeiling', 'ceiling', 'living room', 'living room ceiling'],
    ['roomWallW', 'wall', 'living room', 'living room west wall'],
    ['truckHeadboard', 'headboard', 'truck', 'truck headboard'],
    ['truckWallL', 'truck body', 'truck', 'truck body'],
    ['destDoorHeader', 'door frame', 'destination', 'destination door frame'],
  ];
  const bad = [];
  for (const [tag, kind, room, caption] of table) {
    if (surfaceKind(tag) !== kind) bad.push(`${tag}: kind ${surfaceKind(tag)} != ${kind}`);
    if (surfaceRoom(tag) !== room) bad.push(`${tag}: room "${surfaceRoom(tag)}" != "${room}"`);
    if (surfaceCaption(tag) !== caption) bad.push(`${tag}: caption "${surfaceCaption(tag)}" != "${caption}"`);
  }
  ok(`P0d surfaceKind/surfaceRoom/surfaceCaption over ${table.length} real tags`, bad.length === 0, bad.join(' | '));
  ok('P0e …every caption contains its kind word AND its room, and is total for junk',
     table.every(([tag]) => surfaceCaption(tag).includes(surfaceKind(tag)) && surfaceCaption(tag).includes(surfaceRoom(tag))) &&
     surfaceCaption('') === 'a surface' && surfaceCaption(null) === 'a surface' && surfaceCaption('nonsense_tag').length > 0,
     `${surfaceCaption('nonsense_tag')}`);
  eq('P0f labelFor is untouched — the ledger line and the notice still read as they did (m22 PD1g)',
     labelFor('doorHeader_living_kitchen'), 'living_kitchen door frame');
}
emit('P4...');

/* ── P4. the caption names what was hit ───────────────────────────────────── */
lines.push('--- P4. captions: a template per property cue, resolved and shown (GDD §26.5, §21.4) ---');
{
  const propBands = ['scuffed', 'dented', 'holed', 'bent', 'forced'];
  const fnCells = propBands.filter((b) => typeof CUES.DAMAGE_APPLIED.variants[b].caption === 'function');
  eq(`P4 all ${propBands.length} property bands of DAMAGE_APPLIED carry a caption FUNCTION (m18 A1b restated)`,
     fnCells.length, propBands.length);
  ok('P4a …and the item bands are still plain strings — the string form was not removed',
     ['scratched', 'cracked', 'broken'].every((b) => typeof CUES.DAMAGE_APPLIED.variants[b].caption === 'string'));
  const bad = [];
  const cases = [
    ['scuffed', 'doorHeader_living_kitchen', 'living-kitchen door frame scuffed'],
    ['dented', 'wall', 'front wall dented'],
    ['holed', 'partition_wall_living_back', 'living room back wall holed'],
    ['bent', 'door_frame_living_kitchen', 'living-kitchen door frame bent'],
    ['forced', 'door_frame_living_kitchen', 'living-kitchen door frame forced'],
  ];
  for (const [band, surfaceId, want] of cases) {
    const got = resolveCue('DAMAGE_APPLIED', { band, surfaceId, location: labelFor(surfaceId) }).caption;
    if (got !== want) bad.push(`${band}/${surfaceId}: "${got}" != "${want}"`);
    if (!got.includes(surfaceKind(surfaceId))) bad.push(`${band}: no kind word`);
    if (!got.includes(surfaceRoom(surfaceId))) bad.push(`${band}: no room`);
    if (got.length > 64) bad.push(`${band}: ${got.length} chars`);
  }
  ok('P4b resolveCue(DAMAGE_APPLIED, {band, surfaceId}) names surface kind + room, every band, under 64 chars', bad.length === 0, bad.join(' | '));
  lines.push('      ' + cases.map(([b, s]) => resolveCue('DAMAGE_APPLIED', { band: b, surfaceId: s }).caption).join(' | '));
  eq('P4c PROPERTY_CAPPED has its own row, captioned by the same template form',
     resolveCue('PROPERTY_CAPPED', { surfaceId: 'wall' }).caption, 'front wall — already at its maximum');
  ok('P4d every property template is PURE and TOTAL: same payload twice is the same words, and {} still captions',
     cases.every(([band, surfaceId]) => {
       const c = CUES.DAMAGE_APPLIED.variants[band].caption;
       const p = { band, surfaceId };
       return captionText(c, p) === captionText(c, p) && captionText(c, {}).length > 0;
     }) && captionText(CUES.PROPERTY_CAPPED.caption, {}).length > 0);
  eq('P4e a property cue with no surface at all still captions', resolveCue('DAMAGE_APPLIED', { band: 'scuffed' }).caption, 'a wall scuffed');
  // The real path: one event on the real bus, one audio frame, one HUD feed (m18 A8's pattern).
  const t0 = game.clock.simTimeMs;
  bus.emit(EVENTS.DAMAGE_APPLIED, {
    category: 'property', surfaceId: 'doorHeader_living_kitchen', location: labelFor('doorHeader_living_kitchen'),
    entityId: 'box_small_01#0', band: 'scuffed', cost: 12.5, at: { x: 2.2, y: 2.3, z: -4.94 },
    position: { x: 2.2, y: 2.3, z: -4.94 }, normal: { x: 0, y: 0, z: 1 }, heldBy: [],
  }, t0);
  M.audioFrame();
  M.feedHuds();
  // The HUD prefixes §21.4's direction glyph (audio.js directionGlyph) — the caption is the
  // rest of the line, so the assertion is on the tail, not on the whole string.
  ok('P4f the HUD caption line after ONE feed reads the door frame, not "wall scuffed"',
     huds[0].caption.textContent.endsWith('living-kitchen door frame scuffed'), huds[0].caption.textContent);
  const t1 = game.clock.simTimeMs;
  bus.emit(EVENTS.PROPERTY_CAPPED, {
    category: 'property', capped: true, surfaceId: 'wall', location: 'front wall', entityId: 'box_small_01#0',
    band: 'dented', cost: 0, at: { x: 1.6, y: 0.3, z: -1.91 }, position: { x: 1.6, y: 0.3, z: -1.91 },
    normal: { x: 0, y: 0, z: 1 }, heldBy: [],
  }, t1);
  M.audioFrame();
  M.feedHuds();
  ok('P4g …and a capped hit captions "front wall — already at its maximum"',
     huds[0].caption.textContent.endsWith('front wall — already at its maximum'), huds[0].caption.textContent);
  drainNotices();
  cappedEvents.length = 0;
  propEvents.length = 0;
}
emit('P1...');

/* ── P1. the corner splits ────────────────────────────────────────────────── */
lines.push('--- P1. a 0.5 m box into the living-kitchen doorway corner at 3 m/s (GDD §15.1, §8.4) ---');
const box = allOfDef('box_small_01')[0];
let p1Lines = [];
{
  freshRun();
  propEvents.length = 0;
  const marks0 = M.scuffs.count;
  const n0 = prop().length;
  /* THE CORNER. house.js: the living_kitchen opening is 0.86 m wide, centred x 2.60 in the
   * partition at z −5.0, so its west jamb is x 2.17 and the header runs 2.03 m up. The box is
   * 0.5 m on a side (definitions.js) and is thrown flat at the jamb line with its BOTTOM at
   * 2.07 — above the hung leaf, so the leaf takes nothing and the two surfaces in the step are
   * the partition beside the opening and the header over it. */
  const { sums, windows } = throwAndTrace(box, [2.05, 2.32, -4.55], [0, 0, -3.0]);
  const L = prop().slice(n0);
  p1Lines = L;
  lines.push(`      manifold Σ|contactImpulse| this step: ${JSON.stringify(sums && sums.by)}`);
  lines.push(`      windows: ${JSON.stringify(windows)}`);
  lines.push(`      lines: ${JSON.stringify(L.map((l) => [l.surfaceId, l.impulse, l.cost, l.band, l.surfaces]))}`);
  const header = L.find((l) => l.surfaceId === 'doorHeader_living_kitchen') || null;
  const jamb = L.find((l) => l.surfaceId === 'partition_wall_living_back') || null;
  eq('P1 the corner hit writes TWO property lines in the same step, not one (KNOWN_ISSUES Phase 21: "A corner hit bills one surface")', L.length, 2);
  ok('P1a …one for the header over the opening and one for the partition beside it',
     !!header && !!jamb && header.location === 'living_kitchen door frame' && jamb.location === 'living room back wall',
     L.map((l) => l.surfaceId).join(','));
  // Proportionality, against the manifold sums the split was computed from.
  const wantHeader = sums.by['doorHeader_living_kitchen'] / sums.billableTotal;
  const gotHeader = header ? header.impulse / (header.impulse + jamb.impulse) : -1;
  near('P1b …the shares are the manifold impulses\' own proportions, within 2 %', gotHeader, wantHeader, 0.02);
  ok('P1c …and the line records the whole corner: surfaces [{id, share}] summing to 1 on BOTH lines',
     !!header && !!jamb && Array.isArray(header.surfaces) && header.surfaces.length === 2 &&
     Math.abs(header.surfaces.reduce((s, x) => s + x.share, 0) - 1) < 0.001 &&
     JSON.stringify(header.surfaces) === JSON.stringify(jamb.surfaces),
     JSON.stringify(header && header.surfaces));
  // THE EQUALITY THAT MATTERS: nothing got dearer.
  const totalImpulse = header.impulse + jamb.impulse;
  const split = header.cost + jamb.cost;
  lines.push(`      Σ impulse ${totalImpulse.toFixed(3)} N·s; M14 would have posted ${m14Cost(totalImpulse).toFixed(2)}; the split posts ${header.cost.toFixed(2)} + ${jamb.cost.toFixed(2)} = ${split.toFixed(2)}`);
  /* The brief asked for 0.005. That is unattainable ONCE THE MONEY IS ROUNDED: two lines each
   * round to the cent where one used to, so the arithmetic bound on the gap is half a cent per
   * extra line — 0.015 for two lines against one, and the measured gap is 0.01. The tolerance
   * here is that bound and nothing looser; the brief's exact claim is P1e, on the unrounded
   * amounts, at 1e-9. */
  near('P1d Σ of the split costs === the ONE line M14\'s formula would have posted, within the two lines\' own cent rounding (bound 0.015 = 3 × ½ cent)',
     Number(split.toFixed(2)), m14Cost(totalImpulse), 0.015);
  ok('P1e …and unrounded it is EXACT: Σ propertyCost(Iᵢ, fᵢ) === propertyCost(ΣI) to 1e-9 (nothing got dearer, nothing was lost)',
     Math.abs((propertyCost(header.impulse, header.surfaces[0].share) + propertyCost(jamb.impulse, header.surfaces[1].share)) - m14Raw(totalImpulse)) < 1e-9,
     `${propertyCost(header.impulse, header.surfaces[0].share) + propertyCost(jamb.impulse, header.surfaces[1].share)} vs ${m14Raw(totalImpulse)}`);
  ok('P1f neither line is dearer than the whole hit would have been', header.cost < m14Cost(totalImpulse) && jamb.cost < m14Cost(totalImpulse));
  ok('P1g both lines carry their own band, contact point and normal — two marks, not one twice',
     header.band === propertyBandFor(header.impulse).name && jamb.band === propertyBandFor(jamb.impulse).name &&
     Math.abs(header.at.y - jamb.at.y) + Math.abs(header.at.x - jamb.at.x) > 0.01,
     `${header.band}@${JSON.stringify(header.at)} / ${jamb.band}@${JSON.stringify(jamb.at)}`);
  // §8.4's other three channels, one per surface.
  eq('P1h TWO property DAMAGE_APPLIED events were emitted', propEvents.length, 2);
  eq('P1i TWO scuff quads were added — one per surface (§8.4 "visual mark")', M.scuffs.count - marks0, 2);
  /* The PROPERTY notices only: the box takes its own §8.3 item damage from the same impact
   * and raises its own line and notice ('box small — cracked · 10.80'), which is M14's two
   * ledgers doing exactly what they are supposed to and is not what this assertion is about. */
  const notices = M.pendingNotices.filter((n) => n.kind === 'damage' &&
    (n.text.startsWith('living_kitchen door frame') || n.text.startsWith('living room back wall')));
  ok('P1j TWO property notices, one naming each surface (§8.4 "one small cost notice")',
     notices.length === 2 && notices.some((n) => n.text.startsWith('living_kitchen door frame')) &&
     notices.some((n) => n.text.startsWith('living room back wall')),
     M.pendingNotices.filter((n) => n.kind === 'damage').map((n) => n.text).join(' | '));
  const caps = propEvents.map((e) => resolveCue('DAMAGE_APPLIED', e).caption);
  ok('P1k TWO captions, naming DIFFERENT surfaces (§26.5)',
     caps.length === 2 && caps[0] !== caps[1] && caps.every((c) => c.length > 0), caps.join(' | '));
  lines.push(`      captions: ${caps.join(' | ')}`);
  drainNotices();
}
emit('P2...');

/* ── P2. the graze is folded ──────────────────────────────────────────────── */
lines.push(`--- P2. a share under DAMAGE.property.splitMinFraction (${P.splitMinFraction}) folds into the largest (GDD §26.4) ---`);
{
  const n0 = prop().length;
  drainNotices();
  propEvents.length = 0;
  const marks0 = M.scuffs.count;
  // 0.15 m further into the opening: the box is almost entirely on the header, and the jamb
  // reads a sliver the customer should never see a line for.
  const { sums } = throwAndTrace(box, [2.20, 2.32, -4.55], [0, 0, -3.0]);
  const L = prop().slice(n0);
  const frac = sums.by['partition_wall_living_back'] / sums.billableTotal;
  lines.push(`      manifold Σ: ${JSON.stringify(sums.by)} → the partition's share would be ${(frac * 100).toFixed(2)} % (< ${P.splitMinFraction * 100} %)`);
  lines.push(`      lines: ${JSON.stringify(L.map((l) => [l.surfaceId, l.impulse, l.cost, l.surfaces]))}`);
  ok('P2 the sliver really is under splitMinFraction (the fixture is testing what it says it is)',
     frac > 0 && frac < P.splitMinFraction, `${frac}`);
  eq('P2a ONE line is posted, not two', L.length, 1);
  eq('P2b …and it is the larger surface, carrying the WHOLE amount', L[0] && L[0].surfaceId, 'doorHeader_living_kitchen');
  ok('P2c …priced as an unsplit hit: cost === M14\'s closed form on its own impulse, to the cent',
     Math.abs(L[0].cost - m14Cost(L[0].impulse)) <= 0.01, `${L[0].cost} vs ${m14Cost(L[0].impulse)}`);
  ok('P2d …the record still lists BOTH surfaces, at shares [1, 0] — what was touched is a fact even when it was not billed',
     Array.isArray(L[0].surfaces) && L[0].surfaces.length === 2 &&
     L[0].surfaces[0].id === 'doorHeader_living_kitchen' && L[0].surfaces[0].share === 1 &&
     L[0].surfaces[1].id === 'partition_wall_living_back' && L[0].surfaces[1].share === 0,
     JSON.stringify(L[0].surfaces));
  // Property notices only (P1j's note: the box bills its own item damage from the same hit).
  const pn = M.pendingNotices.filter((n) => n.kind === 'damage' &&
    (n.text.startsWith('living_kitchen door frame') || n.text.startsWith('living room back wall')));
  ok('P2e ONE property notice, ONE event, ONE mark — no 0.4-cent second line and no second complaint',
     pn.length === 1 && pn[0].text.startsWith('living_kitchen door frame'),
     M.pendingNotices.filter((n) => n.kind === 'damage').map((n) => n.text).join(' | '));
  ok('P2e1 …and one event and one quad', propEvents.length === 1 && M.scuffs.count - marks0 === 1,
     `${propEvents.length} events, ${M.scuffs.count - marks0} quads`);
  drainNotices();
}
emit('P3...');

/* ── P3. a capped surface keeps talking ───────────────────────────────────── */
lines.push('--- P3. §8.3 caps the money, §8.4 keeps the feedback (KNOWN_ISSUES Phase 21: "A capped surface posts no further lines") ---');
{
  /* THE SAME RUN P1 and P2 split in — deliberately, so P5 below can put the whole afternoon
   * on one invoice: two split lines, a folded one, an unsplit one and a surface at its cap. */
  propEvents.length = 0;
  cappedEvents.length = 0;
  // m22 PD6's own fixture: 6 m/s throws into the front wall until Σ reaches 400.00.
  const xs = [0.9, 1.5, 2.1];
  const wallSum = () => sumCost(prop().filter((l) => l.surfaceId === 'wall'));
  let throws = 0;
  const running = [];
  for (let k = 0; k < 20 && wallSum() < P.maxChargePerSurface - 0.005; k++) {
    parkAt(box, xs[k % 3], 0.27, -1.50);
    box.state.condition = 100;
    step(5);
    throwAt(box, 0, 0, -6.0);
    step(60);
    damage.flush(T);
    throws++;
    running.push(wallSum().toFixed(2));
  }
  lines.push(`      ${throws} throws at 6 m/s, Σ 'wall' after each: ${running.join(' → ')}`);
  near('P3 the wall reaches DAMAGE.property.maxChargePerSurface exactly (m22 PD6 preserved)', wallSum(), P.maxChargePerSurface, 0.01);
  eq('P3a no PROPERTY_CAPPED fired while there was still room to charge', cappedEvents.length, 0);
  const trimmed = prop().filter((l) => l.surfaceId === 'wall' && l.capped);
  eq('P3b exactly ONE line is flagged capped: the one whose charge was trimmed to the room left', trimmed.length, 1);

  // The hit that used to vanish.
  drainNotices();
  const n1 = prop().length, e1 = propEvents.length, marks1 = M.scuffs.count, sum1 = wallSum();
  parkAt(box, 1.5, 0.27, -1.50);
  box.state.condition = 100;
  step(5);
  throwAt(box, 0, 0, -6.0);
  step(60);
  damage.flush(T);
  const capped = cappedEvents.slice(0);
  lines.push(`      the hit after the cap: ${prop().length - n1} line(s), ${propEvents.length - e1} DAMAGE_APPLIED, ${capped.length} PROPERTY_CAPPED, ${M.scuffs.count - marks1} quad(s), Σ ${wallSum().toFixed(2)}`);
  ok('P3c THE LEDGER IS UNTOUCHED: no line, no property DAMAGE_APPLIED, Σ wall cost unchanged to the cent',
     prop().length === n1 && propEvents.length === e1 && Math.abs(wallSum() - sum1) < 0.005,
     `lines +${prop().length - n1}, events +${propEvents.length - e1}, Σ ${wallSum().toFixed(2)} vs ${sum1.toFixed(2)}`);
  eq('P3d …and exactly one PROPERTY_CAPPED fired', capped.length, 1);
  ok('P3e …carrying the surface id, cost 0, a band, the contact point and the normal',
     capped[0].surfaceId === 'wall' && capped[0].location === 'front wall' && capped[0].cost === 0 &&
     capped[0].category === 'property' && capped[0].capped === true &&
     typeof capped[0].band === 'string' && Number.isFinite(capped[0].at.z) && Number.isFinite(capped[0].normal.z) &&
     capped[0].entityId === box.id,
     JSON.stringify(capped[0]));
  ok('P3f the NOTICE fired and says why (/already at its maximum/)',
     M.pendingNotices.filter((n) => n.kind === 'damage' && /already at its maximum/.test(n.text)).length === 1,
     M.pendingNotices.map((n) => n.text).join(' | '));
  eq('P3g a SCUFF QUAD was still added (§8.4 "visual mark"; the ring\'s own §26.6 bound still applies)', M.scuffs.count - marks1, 1);
  eq('P3h a CAPTION is queued for it, naming the wall',
     resolveCue('PROPERTY_CAPPED', capped[0]).caption, 'front wall — already at its maximum');
  ok('P3i the run record has it: a PROPERTY_CAPPED event naming "wall", and it is NOT counted as a property line',
     M.recorder.events.filter((e) => e.type === EVENTS.PROPERTY_CAPPED && e.surfaceId === 'wall').length >= 1 &&
     game.state.telemetry.counters.propertyEvents === prop().length,
     `${M.recorder.events.filter((e) => e.type === EVENTS.PROPERTY_CAPPED).length} recorded; counters ${game.state.telemetry.counters.propertyEvents} vs ledger ${prop().length}`);

  // The rate discipline: grinding the same wall is one complaint, not one per window.
  drainNotices();
  const c2 = cappedEvents.length;
  /* THE STAMP THE GATE ACTUALLY READS — the moment _postCapped recorded for this surface, not
   * the clock before the throw that produced it. Measuring the span from anywhere else makes
   * the printed evidence claim something the fixture did not test. */
  const tCap = damage._cappedAt.get('wall');
  for (let k = 0; k < 3; k++) {
    parkAt(box, xs[k % 3], 0.27, -1.50);
    box.state.condition = 100;
    step(3);
    throwAt(box, 0, 0, -6.0);
    step(20);
    damage.flush(T);
  }
  const sinceCap = T - tCap;
  lines.push(`      3 more hits, the last ending ${sinceCap.toFixed(0)} ms after the PROPERTY_CAPPED stamp at ${tCap}: ${cappedEvents.length - c2} further PROPERTY_CAPPED (cappedRepeatMs ${P.cappedRepeatMs}, aggregation window ${DAMAGE.aggregationWindowMs} ms)`);
  ok('P3j0 the fixture is inside the gate it is testing: all three hits land within cappedRepeatMs of the stamp',
     Number.isFinite(tCap) && sinceCap > 0 && sinceCap < P.cappedRepeatMs,
     `${sinceCap} ms vs ${P.cappedRepeatMs} ms`);
  eq('P3j three more hits on the capped wall inside cappedRepeatMs raise NO further notice (§8.4 "ONE small notice")',
     cappedEvents.length - c2, 0);
  ok('P3k …and still no ledger line and no property event from any of them',
     prop().length === n1 && propEvents.length === e1, `${prop().length - n1} lines, ${propEvents.length - e1} events`);
  drainNotices();
}
emit('P5...');

/* ── P5. nothing else moved ───────────────────────────────────────────────── */
lines.push('--- P5. a single-surface hit is M14\'s line, and the aggregates agree (GDD §25.2, §26.7) ---');
{
  /* m22 PD13's roomWallW fixture rather than PD2's front wall, for the obvious reason: P3 has
   * just filled the front wall to its cap in this same run, and a capped surface is the one
   * thing that is NOT an ordinary line. Everything else about the claim is unchanged — one
   * surface in contact, so the split has nothing to split. */
  const n0 = prop().length;
  parkAt(box, -4.55, 0.40, -3.20);
  box.state.condition = 100;
  step(30);
  throwAt(box, -3.0, 0, 0);
  step(90);
  damage.flush(T);
  const L = prop().slice(n0).filter((l) => l.surfaceId === 'roomWallW');
  const l = L[L.length - 1] || null;
  lines.push(`      the unsplit throw into roomWallW: ${JSON.stringify(l)}`);
  ok('P5 a single-surface hit posts ONE line with NO `surfaces` key and NO `capped` key — M14\'s object, key for key',
     !!l && L.length === 1 && l.surfaces === undefined && l.capped === undefined, JSON.stringify(l && Object.keys(l)));
  ok('P5a …priced by M14\'s closed form on its own impulse (the unsplit share is 1)',
     !!l && Math.abs(l.cost - m14Cost(l.impulse)) <= 0.01, l ? `${l.cost} vs ${m14Cost(l.impulse)}` : 'no line');

  // The invoice and the aggregates, over a run that has split lines AND a capped surface.
  const inv = M.buildInvoice(game.state, M.manifestSummary(game.state.manifest), {});
  const pl = inv.lines.find((x) => x.kind === LINE_KINDS.PROPERTY_DAMAGE) || null;
  const ledgerTotal = sumCost(prop());
  near('P5b the invoice\'s property line === −(Σ ledger property cost) to the cent, split lines and all',
     pl ? pl.amount : 0, -ledgerTotal, 0.01);
  eq('P5c …citing one surface per ledger entry (reconcile\'s own count)', pl ? pl.from.length : -1, prop().length);
  ok('P5d …and its detail names the capped surface exactly once (§8.3 said out loud)',
     !!pl && /\(1 at the cap\)/.test(pl.detail), pl ? pl.detail : 'no line');
  lines.push(`      invoice: ${pl && pl.detail} — ${pl && pl.amount.toFixed(2)}`);
  const rec = M.reconcile(inv, game.state, {});
  ok('P5e reconcile(inv, state, {}).ok — the ledger and the sheet still agree', rec.ok, rec.problems.join(' | '));

  // The recap row: '(capped)' once, on the line that reached the cap.
  const recap = recapFrom(M.recorder.events, { nameOf: (id) => String(id), max: 999, perKind: 999 });
  const cappedRows = recap.filter((r) => /\(capped\)/.test(r.text));
  eq('P5f the sheet\'s per-impact rows carry "(capped)" exactly once', cappedRows.length, 1);
  ok('P5f1 …on a front-wall row', cappedRows.length === 1 && /front wall/.test(cappedRows[0].text), cappedRows.map((r) => r.text).join(' | '));
  lines.push(`      recap row: ${cappedRows.map((r) => r.text).join(' | ')} (INVOICE.recapPerKind is ${INVOICE.recapPerKind}; the suite reads them all)`);

  // §26.7's aggregate over this run must equal the ledger.
  M.settle();
  const summary = M.runSummary();
  const ev = evidenceFrom([summary]);
  lines.push(`      evidenceFrom: ${ev.runs.length} run(s), ${ev.rejected.length} rejected; propertyTotal ${ev.aggregates.damage.propertyTotal}`);
  eq('P5g evidenceFrom([this run]) accepts it', ev.runs.length, 1);
  near('P5h …and its propertyTotal === the ledger\'s Σ to the cent, over split lines',
     Math.abs(ev.aggregates.damage.propertyTotal), ledgerTotal, 0.01);
  eq('P5i …and propertyEvents === the number of ledger lines (a capped hit is not a line)',
     ev.aggregates.damage.propertyEvents, prop().length);
  M.invoiceScreen.onReplay();
  drainNotices();
}
emit('P6...');

/* ── P6. "already at its maximum" is a fact about the SURFACE ─────────────── */
lines.push('--- P6. the capped cue fires because the surface is FULL, never because the money rounded away (GDD §8.3, §10.4) ---');
{
  /* The one question the narrow phase cannot be asked on demand: what happens to a charge
   * that is real but rounds to 0.00? It needs an impulse a hair over the threshold, which no
   * throw can be aimed at, so the window is BUILT — the exact object _feedPropWindow makes —
   * and handed to _postPropLine. Everything else in this suite is thrown.
   *
   * Why it matters: _postPropLine used `raw > 0` as its proxy for "the surface is full", so a
   * sub-cent charge on a wall with all 400.00 of its room left told the player "front wall
   * scuffed — already at its maximum", marked it, and pulsed the pad, for a wall that had cost
   * nothing. With the split that is not a corner case: propertyCost(f·I, f) = f × (I − 12) ×
   * 1.6, so at the 12 % minimum share ANY corner hit whose step impulse lands in (12, 12.026)
   * lands in it. */
  const synthWindow = (surfaceId, impulse) => ({
    key: `probe|${surfaceId}`, entityId: 'probe#0', defId: 'box_small_01', surfaceId,
    x: 0, y: 1.2, z: -3, at: { x: 0, y: 1.2, z: -3 }, normal: { x: 0, y: -1, z: 0 },
    impulse, peak: impulse, ageMs: 0, startedAt: T, fracSum: impulse, surfaces: null,
    heldBy: [], frameState: null, doorId: null, leafId: null,
  });
  // A charge of 0.0025: non-zero, and 0.00 once the ledger rounds it.
  const subCent = P.impulseThreshold + 0.0025 / P.costPerImpulse;
  // 416.00 raw against a 400.00 cap, so one line fills the surface with 16.00 to spare.
  const overCap = P.impulseThreshold + (P.maxChargePerSurface + 16) / P.costPerImpulse;
  ok('P6 the fixture impulses are what they claim: one charge that is real but rounds to 0.00, one that overflows the cap',
     propertyCost(subCent) > 0 && Number(propertyCost(subCent).toFixed(2)) === 0 &&
     propertyCost(overCap) > P.maxChargePerSurface,
     `${propertyCost(subCent)} @ ${subCent} N·s; ${propertyCost(overCap)} @ ${overCap} N·s`);

  freshRun();
  cappedEvents.length = 0; propEvents.length = 0;
  const n0 = prop().length, marks0 = M.scuffs.count;
  damage._postPropLine(synthWindow('roomCeiling', subCent), T);
  ok('P6a A SUB-CENT CHARGE ON AN EMPTY SURFACE IS SILENT: no line, no event, no PROPERTY_CAPPED, no mark, no notice',
     prop().length === n0 && propEvents.length === 0 && cappedEvents.length === 0 &&
     M.scuffs.count === marks0 && M.pendingNotices.filter((n) => n.kind === 'damage').length === 0,
     `${prop().length - n0} lines, ${propEvents.length} events, ${cappedEvents.length} capped, ${M.scuffs.count - marks0} quads, ` +
     M.pendingNotices.filter((n) => n.kind === 'damage').map((n) => n.text).join(' | '));
  ok('P6a1 …and the surface it did not charge is untouched: nothing has been said about the ceiling at all',
     damage._cappedAt.size === 0 && sumCost(prop().filter((l) => l.surfaceId === 'roomCeiling')) === 0,
     `_cappedAt ${damage._cappedAt.size}`);

  // Fill it, then ask both questions again with no room left.
  drainNotices();
  damage._postPropLine(synthWindow('roomCeiling', overCap), T);
  const ceil = prop().filter((l) => l.surfaceId === 'roomCeiling');
  lines.push(`      the fill line: ${JSON.stringify(ceil.map((l) => [l.surfaceId, l.cost, l.capped]))}`);
  ok('P6b filling the surface posts ONE line trimmed to the cap and flagged capped — and no PROPERTY_CAPPED (the money still landed)',
     ceil.length === 1 && Math.abs(ceil[0].cost - P.maxChargePerSurface) < 0.005 && ceil[0].capped === true &&
     cappedEvents.length === 0 && propEvents.length === 1,
     `${JSON.stringify(ceil)} / ${cappedEvents.length} capped, ${propEvents.length} events`);
  drainNotices();
  damage._postPropLine(synthWindow('roomCeiling', subCent), T);
  eq('P6c a SUB-CENT charge on the FULL surface is still silent — it was never billable, so there is nothing the cap denied it',
     cappedEvents.length, 0);
  damage._postPropLine(synthWindow('roomCeiling', 40), T);
  lines.push(`      a real 40.00 N·s charge on the full ceiling: ${cappedEvents.length} PROPERTY_CAPPED, ${prop().length - n0} ledger line(s) all told`);
  ok('P6d …and a REAL charge on the full surface fires exactly one PROPERTY_CAPPED, naming it, at cost 0, with the ledger unmoved',
     cappedEvents.length === 1 && cappedEvents[0].surfaceId === 'roomCeiling' && cappedEvents[0].cost === 0 &&
     prop().length === n0 + 1 && propEvents.length === 1,
     `${cappedEvents.length} capped, ${prop().length - n0} lines, ${propEvents.length} events`);
  freshRun();
  cappedEvents.length = 0; propEvents.length = 0;
}

/* ── Z. integration ───────────────────────────────────────────────────────── */
lines.push('--- Z. integration ---');
{
  ok('Z1 the reset cleared the ledger, the windows, the capped stamps and the marks',
     prop().length === 0 && damage._openProp.size === 0 && damage._cappedAt.size === 0 && M.scuffs.count === 0,
     `${prop().length} / ${damage._openProp.size} / ${damage._cappedAt.size} / ${M.scuffs.count}`);
  ok('Z2 game.state is still plain data with the split lines\' shape in it (§22.4)',
     (() => { try { JSON.parse(JSON.stringify(game.state)); return true; } catch (e) { return false; } })());
  ok('Z3 the split lines survived a JSON round trip as numbers and strings only',
     p1Lines.length === 2 && p1Lines.every((l) => JSON.stringify(l) === JSON.stringify(JSON.parse(JSON.stringify(l)))));
  ok('Z4 nothing here ended the contract and no #err-banner appeared (§12.2)',
     game.state.phase !== 'failed' && !document.getElementById('err-banner'));
}

} catch (e) {
  fails++; lines.push(`FAIL  suite threw  <- ${e && e.message}`);
  lines.push((e && e.stack || '').split('\n').slice(0, 6).join('\n'));
}
emit();
