/* Versioned, device-local save — GDD §26.6 "Save/settings reject incompatible versions
 * safely", §21.2 "a retry keeps settings", §13.4 (the saved best-invoice stub), §27.1
 * save-version migration.
 *
 * Copied from SmallTownEmergencyServices\src\core\persistence.js (Dev\INDEX.md → "Between-run
 * consequence save"): the storage() probe, the schema gate and the NEVER-THROW contract are all
 * from there. A save that throws is worse than no save at all — the job must still start, the
 * invoice must still show — so load() returns defaults on a missing key, unparseable JSON, a
 * foreign schema or a non-object, and save() returns false instead of raising.
 *
 * What is saved, under ONE key:
 *   settings     the input layer's DEFAULT_SETTINGS keys (sensitivity, invert, deadzone, grip
 *                mode …), validated by input.js's own sanitiseSettings — one validator for the
 *                panel, the constructor and this file (INDEX: "route it through the SAME
 *                validator")
 *   shell        UI scale, camera distance, quality tier — the shell's, not the input's
 *   bestInvoice  §13.4's "saved best invoice" stub: profit, grade, build
 *
 * Deliberately NOT saved: anything in game.state. Settings never enter it (m0 E8 / m12 J3),
 * and a contract is not resumable mid-run — §26.6's replay is from the start. The stored blob
 * is never rewritten by a load: a save from a future schema stays exactly as it was for the
 * build that can read it.
 */

import { BUILD, SETTINGS } from '../config.js';
import { DEFAULT_SETTINGS, sanitiseSettings } from './input.js';

export const SAVE_KEY = SETTINGS.saveKey;
export const SAVE_SCHEMA = SETTINGS.schema;
export const SHELL_DEFAULTS = Object.freeze({ ...SETTINGS.shellDefaults });

/** The three things load() hands back when there is nothing to load. Fresh objects each call. */
export function defaultSave() {
  return { settings: { ...DEFAULT_SETTINGS }, shell: { ...SHELL_DEFAULTS }, bestInvoice: null };
}

/** localStorage, or null — private mode, a locked-down profile, or a storage accessor that
 *  throws all degrade to no-save. The probe is a real write, because `localStorage` can exist
 *  and still refuse. */
function storage() {
  try {
    const s = globalThis.localStorage;
    if (!s) return null;
    const probe = '__mfh_probe__';
    s.setItem(probe, '1'); s.removeItem(probe);
    return s;
  } catch (e) { return null; }
}

/** Never throws. Never writes. */
export function load() {
  const s = storage();
  if (!s) return defaultSave();
  let raw;
  try { raw = s.getItem(SAVE_KEY); } catch (e) { return defaultSave(); }
  if (!raw) return defaultSave();
  let data;
  try { data = JSON.parse(raw); } catch (e) { return defaultSave(); }
  return migrate(data);
}

/** Future schemas land here. An unknown or damaged save falls back to defaults rather than
 *  half-applying itself (§27.1). Today there is exactly one schema and no migration. */
export function migrate(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return defaultSave();
  if (data.schema !== SAVE_SCHEMA) return defaultSave();
  const base = defaultSave();
  return {
    settings: { ...base.settings, ...sanitiseSettings(data.settings).accepted },
    shell: sanitiseShell(data.shell),
    bestInvoice: sanitiseInvoice(data.bestInvoice),
  };
}

/** Clamp the shell's numbers to SETTINGS.ranges and the tier to SETTINGS.tiers. */
export function sanitiseShell(obj) {
  const out = { ...SHELL_DEFAULTS };
  if (!obj || typeof obj !== 'object') return out;
  const r = SETTINGS.ranges;
  const ts = Number(obj.uiScale);
  if (Number.isFinite(ts)) out.uiScale = clamp(ts, r.uiScale);
  const cd = Number(obj.cameraDistance);
  if (Number.isFinite(cd)) out.cameraDistance = clamp(cd, r.cameraDistance);
  if (SETTINGS.tiers.includes(obj.tier)) out.tier = obj.tier;
  return out;
}

/** A best invoice is a handful of finite numbers and short strings, or nothing. */
export function sanitiseInvoice(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const profit = Number(obj.profit);
  if (!Number.isFinite(profit)) return null;
  return {
    profit,
    grade: typeof obj.grade === 'string' ? obj.grade.slice(0, SETTINGS.textLimits.grade) : '?',
    score: finite(obj.score, 0),
    delivered: Math.max(0, Math.round(finite(obj.delivered, 0))),
    total: Math.max(0, Math.round(finite(obj.total, 0))),
    build: String(obj.build || '').slice(0, SETTINGS.textLimits.build),
    date: String(obj.date || '').slice(0, SETTINGS.textLimits.date),
  };
}

/**
 * Write the whole save. Returns false rather than throwing on a full or refused store —
 * settle() calls this and the invoice must show regardless (m16 V5).
 * @param {{settings?: object, shell?: object, bestInvoice?: object|null}} data
 */
export function save({ settings = {}, shell = {}, bestInvoice = null } = {}) {
  const s = storage();
  if (!s) return false;
  const payload = {
    schema: SAVE_SCHEMA,
    build: BUILD.label,
    settings: { ...DEFAULT_SETTINGS, ...sanitiseSettings(settings).accepted },
    shell: sanitiseShell(shell),
    bestInvoice: sanitiseInvoice(bestInvoice),
  };
  try { s.setItem(SAVE_KEY, JSON.stringify(payload)); return true; } catch (e) { return false; }
}

export function clearSave() {
  const s = storage();
  if (!s) return false;
  try { s.removeItem(SAVE_KEY); return true; } catch (e) { return false; }
}

function clamp(v, r) { return Math.min(r.max, Math.max(r.min, v)); }
function finite(v, d) { const n = Number(v); return Number.isFinite(n) ? n : d; }
